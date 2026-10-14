import {
  buildMintRequest,
  canonicalJSON,
  contentHash,
  hexToBytes,
  mintActionCapability,
  signAction,
  verifyAction,
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

async function publishHostedColdChainResult(config, result) {
  const readiness = hostedResultStatus(config, result);
  if (!readiness.ready) throw new Error(readiness.message);
  const role = roleForResult(result);
  const delegate = roleValidation(role).delegate;
  const actionIndex = nextActionIndex(role, delegate);
  const now = Date.now();
  const timeWindow = {
    notBefore: now - 30_000,
    notAfter: Math.min(now + 5 * 60_000, delegate.timeWindow?.notAfter ?? now + 5 * 60_000),
  };
  if (timeWindow.notAfter <= timeWindow.notBefore) throw new Error(`${role.label} delegate has expired.`);
  const actionEnvelope = buildHostedEnvelope(role, result, actionIndex, timeWindow);
  const botKey = hexToBytes(config[`${role.id}BotKey`].trim());
  let request;
  try {
    request = buildMintRequest(botKey, delegate, {
      agentId: actionEnvelope.agentId,
      operation: actionEnvelope.operation,
      resources: actionEnvelope.resources,
      actionIndex,
      maxUses: 1,
      timeWindow,
      nonce: crypto.randomUUID(),
      requestedAt: new Date().toISOString(),
      legitimacyId: delegate.legitimacyRef.legitimacyId,
    });
  } finally {
    botKey.fill(0);
  }
  const requestCheck = verifyMintRequest(request, delegate);
  if (!requestCheck.valid) throw new Error(`Mint request failed local verification: ${requestCheck.reason}`);

  const receipt = await hostedJson("/sovereign/mint", config.apiKey, { delegate, request });
  const mintMaterial = hexToBytes(config[`${role.id}MintMaterial`].trim());
  let capability;
  try {
    capability = mintActionCapability(mintMaterial, delegate, request);
  } finally {
    mintMaterial.fill(0);
  }
  const record = buildHostedRecord(config, role, capability, actionEnvelope);
  if (receipt?.agentAddress && receipt.agentAddress.toLowerCase() !== capability.agentAddress.toLowerCase()) {
    throw new Error("Hosted mint address does not match the locally derived capability.");
  }
  if (receipt?.actionEnvelopeHash && receipt.actionEnvelopeHash.toLowerCase() !== record.actionEnvelopeHash.toLowerCase()) {
    throw new Error("Hosted mint envelope hash does not match the local record.");
  }

  const actionPayload = {
    ...result.payload,
    publicActionRecordId: record.recordId,
    actionEnvelopeHash: record.actionEnvelopeHash,
    hosted: true,
    hostedReceiptId: receipt.mintId || receipt.receiptId || receipt.requestId,
  };
  const actionSeed = hexToBytes(capability.actionSeedHex);
  let actionSignature;
  let outcomeSignature;
  const correlationId = `ae.cold.${contentHash({ recordId: record.recordId, actionIndex }).slice(2, 34)}`;
  const outcome = {
    type: "agentenvelope.executionOutcome",
    version: 1,
    status: "completed",
    recordId: record.recordId,
    actionIndex,
    correlationId,
    actionHash: contentHash(actionPayload),
    completedAt: new Date().toISOString(),
  };
  try {
    actionSignature = signAction(actionSeed, actionPayload);
    outcomeSignature = signAction(actionSeed, outcome);
  } finally {
    actionSeed.fill(0);
  }
  const signatureCheck = verifyAction({ message: actionPayload, signature: actionSignature, expectedAddress: capability.agentAddress });
  if (!signatureCheck.valid) throw new Error("Hosted action signature failed local verification.");

  const registration = await hostedJson("/sovereign/agents/register-delegated", config.apiKey, {
    record,
    request,
    delegateId: delegate.delegateId,
  });
  const report = await hostedJson("/sovereign/verify", config.apiKey, {
    recordId: record.recordId,
    agentId: record.agentId,
    actionIndex,
    payload: actionPayload,
    signature: actionSignature,
    expectedActionEnvelopeHash: record.actionEnvelopeHash,
    correlationId,
  });
  if (!report.valid) throw new Error(report.reason || "Hosted verification denied the action.");
  const outcomeReceipt = await hostedJson("/sovereign/outcomes", config.apiKey, {
    recordId: record.recordId,
    actionIndex,
    correlationId,
    actionPayload,
    actionSignature,
    outcome,
    outcomeSignature,
    expectedActionEnvelopeHash: record.actionEnvelopeHash,
  });
  return {
    roleId: role.id,
    roleLabel: role.label,
    record,
    registration,
    report,
    outcomeReceipt,
    links: {
      record: `https://agentenvelope.io/records/${record.recordId}`,
      ledger: "https://agentenvelope.io/ledger?tab=activity",
    },
  };
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
  return responseBody;
}

export {
  clearHostedConfig,
  hostedConfigStatus,
  hostedResultStatus,
  hostedRoleSummaries,
  initialHostedConfig,
  publishHostedColdChainResult,
  saveHostedConfig,
};
