import {
  buildMintRequest,
  canonicalJSON,
  contentHash,
  hexToBytes,
  mintActionCapability,
  signAction,
  verifyMintDelegate,
  verifyMintRequest,
} from "agent-envelope-sdk";
import monitorDelegate from "../mint-delegate.monitor.json";
import dispatchDelegate from "../mint-delegate.dispatch.json";
import engineerDelegate from "../mint-delegate.engineer.json";

const API_BASE = import.meta.env.VITE_AE_API_BASE ?? "https://jemdjwteae.execute-api.us-east-1.amazonaws.com/v1";
const SESSION_KEY = "agentenvelope:cold-chain-hosted:v1";
const ACTION_INDEX_COUNTER_KEY = "agentenvelope:cold-chain-hosted:action-index:v1";
const HOSTED_REQUEST_TIMEOUT_MS = 20_000;

const ROLE_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: "monitor",
    label: "Temperature monitor",
    delegate: monitorDelegate,
    operations: ["alert_engineer", "read_temperature"],
    resources: ["store:184", "zone:chilled-03"],
    authorityIds: ["alert", "observe"],
  }),
  Object.freeze({
    id: "dispatch",
    label: "Maintenance dispatch",
    delegate: dispatchDelegate,
    operations: ["dispatch_contractor"],
    resources: ["contractor:approved-refrigeration", "store:184", "zone:chilled-03"],
    authorityIds: ["dispatch"],
  }),
  Object.freeze({
    id: "engineer",
    label: "Site engineer controller",
    delegate: engineerDelegate,
    operations: ["restore_safe_temperature", "run_scheduled_defrost"],
    resources: ["setpoint:4c", "duration:1h", "store:184", "zone:chilled-03"],
    authorityIds: ["restore", "defrost"],
  }),
]);

function firstValue(...values) {
  return values.find((value) => typeof value === "string" && value.trim()) ?? "";
}

function readSavedConfig() {
  try {
    const saved = window.sessionStorage.getItem(SESSION_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

function initialHostedConfig() {
  const saved = readSavedConfig();
  const config = {
    apiKey: firstValue(saved.apiKey, import.meta.env.VITE_AE_API_KEY),
    ownerUserId: firstValue(saved.ownerUserId, import.meta.env.VITE_AE_OWNER_USER_ID),
  };
  for (const role of ROLE_DEFINITIONS) {
    const prefix = role.id.toUpperCase();
    config[`${role.id}BotKey`] = firstValue(saved[`${role.id}BotKey`], import.meta.env[`VITE_AE_${prefix}_BOT_KEY`]);
    config[`${role.id}MintMaterial`] = firstValue(saved[`${role.id}MintMaterial`], import.meta.env[`VITE_AE_${prefix}_MINT_MATERIAL`]);
  }
  return config;
}

function saveHostedConfig(config) {
  window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(config));
}

function clearHostedConfig() {
  window.sessionStorage.removeItem(SESSION_KEY);
}

function stripDelegateMetadata(delegate) {
  const { domainSummary, ...signedDelegate } = delegate ?? {};
  return signedDelegate;
}

function resourceMatches(allowed, requested) {
  if (allowed === "*" || allowed === requested) return true;
  return typeof allowed === "string" && allowed.endsWith("*") && requested.startsWith(allowed.slice(0, -1));
}

function validateRoleOnce(role) {
  try {
    if (!role.delegate?.domainSummary?.domainInfo) {
      throw new Error(`${role.label}: replace mint-delegate.${role.id}.json with the portal handoff JSON.`);
    }
    const delegate = stripDelegateMetadata(role.delegate);
    const check = verifyMintDelegate(delegate, delegate.issuerAddress);
    if (!check.valid) throw new Error(`${role.label} delegate failed local verification: ${check.reason}`);
    for (const operation of role.operations) {
      if (!delegate.allowedOperations?.includes(operation)) {
        throw new Error(`${role.label} delegate must allow ${operation}.`);
      }
    }
    for (const resource of role.resources) {
      if (!(delegate.allowedResources ?? []).some((allowed) => resourceMatches(allowed, resource))) {
        throw new Error(`${role.label} delegate must allow ${resource}.`);
      }
    }
    if (!delegate.legitimacyRef?.required || !delegate.legitimacyRef?.legitimacyId) {
      throw new Error(`${role.label} delegate needs a required portal legitimacy reference.`);
    }
    return { valid: true, delegate };
  } catch (error) {
    return { valid: false, message: error instanceof Error ? error.message : `${role.label} delegate is invalid.` };
  }
}

const ROLE_VALIDATIONS = new Map(ROLE_DEFINITIONS.map((role) => [role.id, validateRoleOnce(role)]));

function roleValidation(role) {
  return ROLE_VALIDATIONS.get(role.id) ?? { valid: false, message: `${role.label} delegate is invalid.` };
}

function hostedRoleSummaries(config) {
  return ROLE_DEFINITIONS.map((role) => {
    const validation = roleValidation(role);
    const domain = role.delegate?.domainSummary?.domainInfo;
    return {
      id: role.id,
      label: role.label,
      delegateId: role.delegate?.delegateId ?? "portal handoff required",
      scope: domain ? `${domain.namespace} / ${domain.domainId} / ${domain.kind}` : "Create this agent in the portal, then replace its handoff JSON file.",
      validation,
      botKeyReady: Boolean(config[`${role.id}BotKey`]?.trim()),
      mintMaterialReady: Boolean(config[`${role.id}MintMaterial`]?.trim()),
    };
  });
}

function hostedConfigStatus(config) {
  for (const role of ROLE_DEFINITIONS) {
    const validation = roleValidation(role);
    if (!validation.valid) return { ready: false, label: "handoff required", message: validation.message };
  }
  const missing = [];
  if (!config.apiKey?.trim()) missing.push("API key");
  if (!config.ownerUserId?.trim()) missing.push("owner user id");
  for (const role of ROLE_DEFINITIONS) {
    if (!config[`${role.id}BotKey`]?.trim()) missing.push(`${role.label} bot key`);
    if (!config[`${role.id}MintMaterial`]?.trim()) missing.push(`${role.label} mint material`);
  }
  if (missing.length) {
    return { ready: false, label: "configuration required", message: `Add ${missing.join(", ")} to enable hosted records.` };
  }
  return { ready: true, label: "ready", message: "Portal delegates and hosted credentials are ready." };
}

function roleForResult(result) {
  return ROLE_DEFINITIONS.find((role) => role.authorityIds.includes(result?.scenario?.authorityId));
}

function hostedResultStatus(config, result) {
  const base = hostedConfigStatus(config);
  if (!base.ready || !result) return base;
  if (result.decision !== "allowed") {
    return { ready: false, label: "local evidence", message: "Denied attempts remain in the local incident chain; no hosted capability is minted for them." };
  }
  const role = roleForResult(result);
  if (!role) return { ready: false, label: "unsupported", message: "No hosted role maps to this local authority." };
  const delegate = roleValidation(role).delegate;
  if (!delegate.allowedOperations?.includes(result.payload.operation)) {
    return { ready: false, label: "scope required", message: `${role.label} must allow ${result.payload.operation}.` };
  }
  const unsupported = result.payload.resources.find((resource) =>
    !(delegate.allowedResources ?? []).some((allowed) => resourceMatches(allowed, resource)));
  if (unsupported) return { ready: false, label: "scope required", message: `${role.label} does not allow ${unsupported}.` };
  return base;
}

function nextActionIndex(role, delegate) {
  const min = delegate.actionIndexPolicy?.min ?? 0;
  const max = delegate.actionIndexPolicy?.max ?? min;
  if (max < min) throw new Error(`${role.label} delegate action-index policy is invalid.`);
  const fallback = min + (Math.floor(Date.now() / 1000) % (max - min + 1));
  const key = `${delegate.delegateId}:${role.id}`;
  try {
    const counters = JSON.parse(window.sessionStorage.getItem(ACTION_INDEX_COUNTER_KEY) || "{}");
    const previous = Number.isInteger(counters[key]) ? counters[key] : fallback - 1;
    const next = previous >= max ? min : Math.max(min, previous + 1);
    counters[key] = next;
    window.sessionStorage.setItem(ACTION_INDEX_COUNTER_KEY, JSON.stringify(counters));
    return next;
  } catch {
    return fallback;
  }
}

function buildHostedEnvelope(role, result, actionIndex, timeWindow) {
  const domain = role.delegate.domainSummary;
  return {
    type: "agentenvelope.actionEnvelope",
    version: 1,
    agentId: `cold-chain-${role.id}-${result.payload.commandId}-${actionIndex}`,
    domain: { domainId: domain.domainInfo.domainId, domainHash: domain.domainHash },
    actionIndex,
    operation: result.payload.operation,
    resources: result.payload.resources,
    timeWindow,
    decayPolicy: { mode: "BOTH" },
    limits: { maxUses: 1, enforcement: "external" },
  };
}

function buildHostedRecord(config, role, capability, actionEnvelope) {
  const canonicalActionEnvelope = canonicalJSON(actionEnvelope);
  const actionEnvelopeHash = contentHash(canonicalActionEnvelope);
  return {
    type: "agentenvelope.publicActionRecord",
    version: 1,
    recordId: `ae-action-${contentHash({ ownerUserId: config.ownerUserId.trim(), agentAddress: capability.agentAddress, actionEnvelopeHash }).slice(2, 22)}`,
    ownerUserId: config.ownerUserId.trim(),
    custodyMode: "remote-mint-delegate",
    verifierProfile: "domain-action-envelope",
    status: "active",
    createdAt: new Date().toISOString(),
    agentId: actionEnvelope.agentId,
    agentAddress: capability.agentAddress,
    domain: role.delegate.domainSummary,
    actionEnvelope,
    canonicalActionEnvelope,
    actionEnvelopeHash,
    expiry: new Date(actionEnvelope.timeWindow.notAfter).toISOString(),
  };
}

// Preparation is persisted BEFORE any network call. Retrying keeps this exact
// request/nonce/record; it never silently mints a replacement.
function prepareHostedCommand(config, result) {
  const readiness = hostedResultStatus(config, result);
  if (!readiness.ready) throw new Error(readiness.message);
  const role = roleForResult(result);
  const delegate = roleValidation(role).delegate;
  const actionIndex = nextActionIndex(role, delegate);
  const originalWindow = result.record.actionEnvelope.timeWindow;
  const now = Date.now();
  const timeWindow = {
    notBefore: Math.max(originalWindow.notBefore, delegate.timeWindow?.notBefore ?? originalWindow.notBefore),
    notAfter: Math.min(originalWindow.notAfter, delegate.timeWindow?.notAfter ?? originalWindow.notAfter),
  };
  if (timeWindow.notAfter <= now || timeWindow.notAfter <= timeWindow.notBefore) throw new Error("Command or delegate has expired; no replacement authority is issued.");
  const actionEnvelope = buildHostedEnvelope(role, result, actionIndex, timeWindow);
  const botKey = hexToBytes(config[role.id + "BotKey"].trim());
  let request;
  try {
    request = buildMintRequest(botKey, delegate, {
      agentId: actionEnvelope.agentId, operation: actionEnvelope.operation,
      resources: actionEnvelope.resources, actionIndex, maxUses: 1, timeWindow,
      nonce: crypto.randomUUID(), requestedAt: new Date().toISOString(),
      legitimacyId: delegate.legitimacyRef.legitimacyId,
    });
  } finally { botKey.fill(0); }
  const check = verifyMintRequest(request, delegate);
  if (!check.valid) throw new Error("Mint request failed local verification: " + check.reason);
  const material = hexToBytes(config[role.id + "MintMaterial"].trim());
  let capability;
  try { capability = mintActionCapability(material, delegate, request); }
  finally { material.fill(0); }
  const record = buildHostedRecord(config, role, capability, actionEnvelope);
  const payload = {
    ...result.payload, publicActionRecordId: record.recordId,
    actionEnvelopeHash: record.actionEnvelopeHash, hosted: true,
  };
  const actionSeed = hexToBytes(capability.actionSeedHex);
  let signature;
  try { signature = signAction(actionSeed, payload); }
  finally { actionSeed.fill(0); }
  const correlationId = "ae.cold." + contentHash({ recordId: record.recordId, commandId: payload.commandId }).slice(2, 34);
  return {
    roleId: role.id, roleLabel: role.label, delegate, request, correlationId,
    packet: { scenario: result.scenario, payload, signature, record },
    admitted: false, registered: false, report: null,
  };
}

async function admitHostedCommand(config, context, checkpoint) {
  const { packet, request, delegate } = context;
  if (!context.admitted) {
    // A lost approval response stays unresolved. Duplicate 409 is not silently
    // re-minted; operator investigation is required until receipt recovery exists.
    context.mintReceipt = await hostedJson("/sovereign/mint", config.apiKey, { delegate, request });
    if (context.mintReceipt?.valid !== true ||
        context.mintReceipt.delegateId !== delegate.delegateId ||
        context.mintReceipt.requestId !== request.requestId) {
      throw new Error("Hosted mint did not return a matching approval.");
    }
    context.admitted = true;
    checkpoint(context);
  }
  if (!context.registered) {
    context.registration = await hostedJson("/sovereign/agents/register-delegated", config.apiKey, {
      record: packet.record, request, delegateId: delegate.delegateId,
    });
    if (context.registration?.accepted !== true) throw new Error("Hosted registration was not accepted.");
    context.registered = true;
    checkpoint(context);
  }
  // Re-evaluate live hosted legitimacy on every attempt, not just first issuance.
  context.report = await hostedJson("/sovereign/verify", config.apiKey, {
    recordId: packet.record.recordId, agentId: packet.record.agentId,
    actionIndex: packet.record.actionEnvelope.actionIndex, payload: packet.payload,
    signature: packet.signature, expectedActionEnvelopeHash: packet.record.actionEnvelopeHash,
    correlationId: context.correlationId,
  });
  if (context.report?.valid !== true) throw new Error(context.report?.reason || "Hosted verification denied the action.");
  checkpoint(context);
  return context;
}

// Reporting never executes a command and never mints authority. Failed reporting
// retains the same completed receipt and identifiers for a later submission.
async function submitHostedCompletion(config, context, receipt) {
  if (receipt?.status !== "completed" || receipt.commandHash !== contentHash(context.packet.payload)) {
    throw new Error("A matching completed executor receipt is required.");
  }
  const role = ROLE_DEFINITIONS.find((candidate) => candidate.id === context.roleId);
  const material = hexToBytes(config[role.id + "MintMaterial"].trim());
  let capability;
  try { capability = mintActionCapability(material, context.delegate, context.request); }
  finally { material.fill(0); }
  if (capability.agentAddress.toLowerCase() !== context.packet.record.agentAddress.toLowerCase()) {
    throw new Error("The current mint material does not match the completed authority.");
  }
  const outcome = {
    type: "agentenvelope.executionOutcome", version: 1, status: "completed",
    recordId: context.packet.record.recordId,
    actionIndex: context.packet.record.actionEnvelope.actionIndex,
    correlationId: context.correlationId, actionHash: contentHash(context.packet.payload),
    completedAt: receipt.completedAt,
  };
  const actionSeed = hexToBytes(capability.actionSeedHex);
  let outcomeSignature;
  try { outcomeSignature = signAction(actionSeed, outcome); }
  finally { actionSeed.fill(0); }
  const result = await hostedJson("/sovereign/outcomes", config.apiKey, {
    recordId: outcome.recordId, actionIndex: outcome.actionIndex, correlationId: outcome.correlationId,
    actionPayload: context.packet.payload, actionSignature: context.packet.signature,
    outcome, outcomeSignature, expectedActionEnvelopeHash: context.packet.record.actionEnvelopeHash,
  });
  if (result?.accepted !== true) throw new Error("Hosted completion report was not accepted.");
  return result;
}

async function hostedJson(path, apiKey, body) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey.trim() },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(HOSTED_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error?.name === "TimeoutError") throw new Error("Hosted request timed out after 20 seconds.");
    throw error;
  }
  let responseBody = null;
  try {
    responseBody = await response.json();
  } catch {
    // The status code remains authoritative when the response has no JSON body.
  }
  if (!response.ok) throw new Error(responseBody?.error || responseBody?.message || `Hosted request failed with ${response.status}.`);
  const proxy = unwrapProxyResponse(responseBody);
  if (proxy && proxy.status >= 400) {
    throw new Error(proxy.body?.error || proxy.body?.message || `Hosted request failed with ${proxy.status}.`);
  }
  return proxy ? proxy.body : responseBody;
}

function unwrapProxyResponse(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !Number.isInteger(value.statusCode) || !("body" in value)) {
    return null;
  }
  let body = value.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = { message: body };
    }
  }
  return { status: value.statusCode, body };
}

export {
  clearHostedConfig,
  hostedConfigStatus,
  hostedResultStatus,
  hostedRoleSummaries,
  initialHostedConfig,
  prepareHostedCommand,
  admitHostedCommand,
  submitHostedCompletion,
  saveHostedConfig,
};
