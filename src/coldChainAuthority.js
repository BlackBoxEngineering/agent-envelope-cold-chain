import {
  contentHash,
  hexToBytes,
  seedAddress,
  signAction,
  verifyAction,
  verifyRecord,
} from "agent-envelope-sdk";
import {
  buildActionEnvelope,
  createDomainInfo,
  createPublicActionRecord,
  deriveAgentActionCapability,
  projectDomainKey,
} from "agent-envelope-sdk/avatar";

const DEMO_TIME = "2026-10-13T08:15:00.000Z";
const OWNER_ID = "demo-retailer";
const identityRoot = hexToBytes(`0x${"51".repeat(32)}`);
const decisionSeed = hexToBytes(`0x${"52".repeat(32)}`);
const controllerSeed = hexToBytes(`0x${"53".repeat(32)}`);
const attackerSeed = hexToBytes(`0x${"99".repeat(32)}`);

const domainInfo = createDomainInfo({
  namespace: "agentenvelope.cold-chain",
  domainId: "store-184-refrigeration",
  kind: "cold-chain",
});

const domain = projectDomainKey(identityRoot, domainInfo, new Date(DEMO_TIME));

const authorityDefinitions = Object.freeze({
  alert: Object.freeze({
    agentId: "temperature-monitor",
    label: "Temperature monitor",
    actionIndex: 1,
    operation: "alert_engineer",
    resources: ["store:184", "zone:chilled-03"],
  }),
  dispatch: Object.freeze({
    agentId: "maintenance-dispatch",
    label: "Maintenance dispatch",
    actionIndex: 2,
    operation: "dispatch_contractor",
    resources: ["contractor:approved-refrigeration", "store:184", "zone:chilled-03"],
  }),
  observe: Object.freeze({
    agentId: "temperature-monitor",
    label: "Read-only temperature monitor",
    actionIndex: 3,
    operation: "read_temperature",
    resources: ["store:184", "zone:chilled-03"],
  }),
  restore: Object.freeze({
    agentId: "site-engineer-controller",
    label: "Site engineer controller",
    actionIndex: 4,
    operation: "restore_safe_temperature",
    resources: ["setpoint:4c", "store:184", "zone:chilled-03"],
  }),
  defrost: Object.freeze({
    agentId: "site-engineer-controller",
    label: "Scheduled defrost controller",
    actionIndex: 5,
    operation: "run_scheduled_defrost",
    resources: ["duration:1h", "store:184", "zone:chilled-03"],
  }),
});

function createAuthority(definition) {
  const envelope = buildActionEnvelope(domain, {
    agentId: definition.agentId,
    actionIndex: definition.actionIndex,
    operation: definition.operation,
    resources: definition.resources,
    notBefore: null,
    notAfter: null,
    decayMode: "ACTION",
    maxUses: 1,
  });
  const capability = deriveAgentActionCapability(identityRoot, domain, envelope, new Date(DEMO_TIME));
  const record = createPublicActionRecord(capability, {
    ownerUserId: OWNER_ID,
    createdAt: new Date(DEMO_TIME),
    legitimacyRef: {
      legitimacyId: `cold-chain-${definition.actionIndex}`,
      policyId: "cold-chain-operational-authority-v1",
      required: true,
    },
  });
  return { definition, capability, record };
}

const authorities = Object.freeze(
  Object.fromEntries(Object.entries(authorityDefinitions).map(([id, definition]) => [id, createAuthority(definition)])),
);

const scenarios = Object.freeze([
  Object.freeze({
    id: "normal",
    kind: "routine",
    shortLabel: "Normal alert",
    title: "Temperature threshold exceeded",
    summary: "The monitoring service alerts an engineer. It does not change refrigeration controls.",
    source: "Temperature monitor",
    authorityId: "alert",
    command: Object.freeze({
      operation: "alert_engineer",
      resources: ["store:184", "zone:chilled-03"],
      value: null,
      reason: "temperature threshold exceeded",
    }),
    initialTemperature: 7.8,
    finalTemperature: 7.8,
    expectedDecision: "allowed",
  }),
  Object.freeze({
    id: "compressor",
    kind: "fault",
    shortLabel: "Compressor fault",
    title: "Compressor failure",
    summary: "An approved maintenance dispatcher requests the refrigeration contractor.",
    source: "Maintenance dispatch",
    authorityId: "dispatch",
    command: Object.freeze({
      operation: "dispatch_contractor",
      resources: ["contractor:approved-refrigeration", "store:184", "zone:chilled-03"],
      value: null,
      reason: "compressor current outside operating range",
    }),
    initialTemperature: 9.2,
    finalTemperature: 9.2,
    expectedDecision: "allowed",
  }),
  Object.freeze({
    id: "attack",
    kind: "attack",
    shortLabel: "50°C attack",
    title: "Forced defrost attack",
    summary: "An unknown signer attempts to force a continuous high-temperature defrost cycle.",
    source: "Unknown remote client",
    authorityId: null,
    command: Object.freeze({
      operation: "set_temperature",
      resources: ["setpoint:50c", "store:184", "zone:chilled-03"],
      value: 50,
      unit: "c",
      reason: "forced continuous defrost",
    }),
    initialTemperature: 4,
    finalTemperature: 4,
    expectedDecision: "denied",
  }),
  Object.freeze({
    id: "correct-but-unauthorised",
    kind: "attack",
    shortLabel: "Correct, no authority",
    title: "Correct answer, wrong authority",
    summary: "The read-only monitor correctly proposes 4°C but has no control authority.",
    source: "Read-only temperature monitor",
    authorityId: "observe",
    command: Object.freeze({
      operation: "restore_safe_temperature",
      resources: ["setpoint:4c", "store:184", "zone:chilled-03"],
      value: 4,
      unit: "c",
      reason: "restore safe chilled operating temperature",
    }),
    initialTemperature: 8.6,
    finalTemperature: 8.6,
    expectedDecision: "denied",
  }),
  Object.freeze({
    id: "authorised-recovery",
    kind: "recovery",
    shortLabel: "Authorised recovery",
    title: "Engineer-authorised restoration",
    summary: "A narrowly scoped site-engineer capability restores the safe setpoint.",
    source: "Site engineer controller",
    authorityId: "restore",
    command: Object.freeze({
      operation: "restore_safe_temperature",
      resources: ["setpoint:4c", "store:184", "zone:chilled-03"],
      value: 4,
      unit: "c",
      reason: "authorised incident recovery",
    }),
    initialTemperature: 9.2,
    finalTemperature: 4,
    expectedDecision: "allowed",
  }),
  Object.freeze({
    id: "authority-breakout-attempt",
    kind: "attack",
    shortLabel: "Scope breakout attempt",
    title: "Known signer exceeds authority",
    summary: "A known site-engineer signer requests an eight-hour defrost cycle, but its derived authority permits only the exact one-hour schedule.",
    admissionNote: "AgentEnvelope recognises the signer, but the requested duration is outside its immutable Action Envelope. Authority cannot expand its own scope, so AgentEnvelope denies the command and records that execution was not attempted.",
    source: "Known site engineer signer",
    authorityId: "defrost",
    command: Object.freeze({
      operation: "run_scheduled_defrost",
      resources: ["duration:1h", "store:184", "zone:chilled-03"],
      value: 8,
      unit: "hours",
      displayValue: "8 hours",
      reason: "extend scheduled defrost duration",
    }),
    initialTemperature: 4,
    finalTemperature: 4,
    expectedDecision: "denied",
  }),
]);

function signWithCapability(capability, payload) {
  const seed = hexToBytes(`0x${capability.actionSeedHex}`);
  try {
    return signAction(seed, payload);
  } finally {
    seed.fill(0);
  }
}

function commandPayload(scenario) {
  return {
    type: "agentenvelope.coldChainCommand",
    version: 1,
    commandId: `cold-${scenario.id}-001`,
    storeId: "store-184",
    zoneId: "chilled-03",
    operation: scenario.command.operation,
    resources: scenario.command.resources,
    value: scenario.command.value,
    unit: scenario.command.unit ?? null,
    reason: scenario.command.reason,
    issuedBy: scenario.source,
    issuedAt: DEMO_TIME,
  };
}

function verifyAgentEnvelopeScope(record, payload) {
  if (!record) return { valid: false, reasonCode: "authority.not_found", reason: "No matching Public Action Record exists." };
  const envelope = record.actionEnvelope;
  if (envelope.operation !== payload.operation) {
    return {
      valid: false,
      reasonCode: "authority.operation_denied",
      reason: `${payload.operation} is outside the signed ${envelope.operation} authority.`,
    };
  }

  if (!Array.isArray(payload.resources) || payload.resources.some((resource) => typeof resource !== "string" || !resource)) {
    return { valid: false, reasonCode: "authority.resource_denied", reason: "The command resources are malformed." };
  }

  const requestedResources = new Set(payload.resources);
  const permittedResources = new Set(envelope.resources);
  if (requestedResources.size !== payload.resources.length) {
    return { valid: false, reasonCode: "authority.resource_denied", reason: "The command contains duplicate resources." };
  }

  const unpermitted = payload.resources.find((resource) => !permittedResources.has(resource));
  if (unpermitted) {
    return { valid: false, reasonCode: "authority.resource_denied", reason: `${unpermitted} is outside the signed resource scope.` };
  }

  const omitted = envelope.resources.find((resource) => !requestedResources.has(resource));
  if (omitted) {
    return { valid: false, reasonCode: "authority.resource_denied", reason: `The command omits the required ${omitted} resource.` };
  }

  const parameter = scopedParameterResource(payload);
  if (!parameter.valid) {
    return { valid: false, reasonCode: "authority.parameter_denied", reason: parameter.reason };
  }
  if (parameter.resource && !permittedResources.has(parameter.resource)) {
    return {
      valid: false,
      reasonCode: "authority.parameter_denied",
      reason: `The requested value resolves to ${parameter.resource}, which is outside the immutable Action Envelope.`,
    };
  }
  return { valid: true, reasonCode: "authority.scope_valid", reason: "The exact operation, resources and safety-relevant value match the Action Envelope." };
}

function scopedParameterResource(payload) {
  if (payload.operation === "restore_safe_temperature") {
    if (!Number.isFinite(payload.value) || payload.unit !== "c") {
      return { valid: false, reason: "The temperature command does not contain a valid Celsius setpoint." };
    }
    return { valid: true, resource: `setpoint:${payload.value}c` };
  }
  if (payload.operation === "run_scheduled_defrost") {
    if (!Number.isSafeInteger(payload.value) || payload.value < 1 || payload.unit !== "hours") {
      return { valid: false, reason: "The defrost command does not contain a valid whole-hour duration." };
    }
    return { valid: true, resource: `duration:${payload.value}h` };
  }
  return { valid: true, resource: null };
}

function decisionEvidence({ scenario, payload, signature, record, verification, scope, decision }) {
  const body = {
    type: "coldchain.decisionEvidence",
    version: 1,
    decisionId: `AE-${contentHash({ scenario: scenario.id, payload }).slice(2, 10).toUpperCase()}`,
    commandId: payload.commandId,
    decision,
    reasonCode: decision === "allowed" ? "authority.verified" : scope.reasonCode,
    reason: decision === "allowed" ? "AgentEnvelope signature, public record and exact Action Envelope scope passed; a legitimacy reference is present." : scope.reason,
    checkedAt: DEMO_TIME,
    commandHash: contentHash(payload),
    signature,
    signerAddress: record?.agentAddress ?? seedAddress(attackerSeed),
    recordId: record?.recordId ?? null,
    actionEnvelopeHash: record?.actionEnvelopeHash ?? null,
    checks: {
      identity: verification.valid,
      authority: Boolean(record),
      operationScope: scope.valid,
      legitimacy: Boolean(record),
    },
  };
  return {
    ...body,
    evidenceHash: contentHash(body),
    evidenceSignature: signAction(decisionSeed, body),
    evidenceSigner: seedAddress(decisionSeed),
  };
}

function executionOutcome(payload, evidence) {
  const body = {
    type: "coldchain.simulatorExecutionOutcome",
    version: 1,
    commandId: payload.commandId,
    decisionId: evidence.decisionId,
    status: "completed",
    completedAt: DEMO_TIME,
    effect: payload.value === null ? payload.operation : `${payload.operation}:${payload.value}${payload.unit ?? ""}`,
  };
  return {
    ...body,
    outcomeHash: contentHash(body),
    outcomeSignature: signAction(controllerSeed, body),
    outcomeSigner: seedAddress(controllerSeed),
  };
}

function runScenario(scenarioId) {
  const scenario = scenarios.find((candidate) => candidate.id === scenarioId) ?? scenarios[0];
  const payload = commandPayload(scenario);
  const authority = scenario.authorityId ? authorities[scenario.authorityId] : null;
  const signature = authority ? signWithCapability(authority.capability, payload) : signAction(attackerSeed, payload);
  const record = authority?.record ?? null;
  const verification = record
    ? verifyRecord(record, {
        payload,
        signature,
        actionIndex: record.actionEnvelope.actionIndex,
        expectedActionEnvelopeHash: record.actionEnvelopeHash,
      })
    : verifyAction({ message: payload, signature, expectedAddress: domain.domainAddress });
  const scope = verifyAgentEnvelopeScope(record, payload);
  const decision = verification.valid && scope.valid ? "allowed" : "denied";
  const evidence = decisionEvidence({ scenario, payload, signature, record, verification, scope, decision });
  const outcome = decision === "allowed" ? executionOutcome(payload, evidence) : null;

  return {
    scenario,
    payload,
    signature,
    record,
    verification,
    scope,
    decision,
    evidence,
    outcome,
    temperature: decision === "allowed" ? scenario.finalTemperature : scenario.initialTemperature,
  };
}

function witnessEntry(result, previousHash = null, sequence = 1) {
  const body = {
    sequence,
    previousHash,
    decisionId: result.evidence.decisionId,
    commandHash: result.evidence.commandHash,
    decision: result.decision,
    outcomeHash: result.outcome?.outcomeHash ?? null,
  };
  return { ...body, entryHash: contentHash(body) };
}

export {
  authorities,
  domain,
  runScenario,
  scenarios,
  witnessEntry,
};
