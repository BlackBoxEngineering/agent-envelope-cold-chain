import { test } from "node:test";
import assert from "node:assert/strict";
import { createCommand, evaluateCommand, verifyAgentEnvelopeScope } from "../src/coldChainAuthority.js";
import { createExecutor, EXECUTOR_KEY } from "../src/coldChainExecutor.js";

function fixture(options = {}) {
  const data = new Map();
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  let tail = Promise.resolve();
  const withLock = work => {
    const next = tail.then(work);
    tail = next.catch(() => {});
    return next;
  };
  const args = { storage, withLock, ...options };
  return { executor: createExecutor(args), restart: () => createExecutor(args), storage, args };
}
const policy = { legitimacy: { status: "legitimate", version: 1 } };
const entry = (f, id) => f.executor.snapshot().commands[id];

test("scenario controls distinguish cryptographic checks from client scope checks", () => {
  for (const [id, expected] of [
    ["normal", "allowed"], ["compressor", "allowed"], ["authorised-recovery", "allowed"],
    ["attack", "denied"], ["correct-but-unauthorised", "denied"], ["authority-breakout-attempt", "denied"],
  ]) assert.equal(evaluateCommand(createCommand(id), policy).decision, expected, id);
  const breakout = evaluateCommand(createCommand("authority-breakout-attempt"), policy);
  assert.equal(breakout.verification.valid, true);
  assert.equal(breakout.scope.reasonCode, "authority.parameter_denied");
  assert.equal(breakout.outcome, null); // Admission is NOT completion.
});

test("new events get distinct bounded authority, not a reused one-use capability", () => {
  const a = createCommand("normal"), b = createCommand("normal");
  assert.notEqual(a.payload.commandId, b.payload.commandId);
  assert.notEqual(a.record.actionEnvelopeHash, b.record.actionEnvelopeHash);
  assert.equal(a.record.actionEnvelope.decayPolicy.mode, "BOTH");
  assert.equal(a.record.actionEnvelope.limits.maxUses, 1);
  assert.ok(a.record.actionEnvelope.timeWindow.notAfter > Date.now());
  assert.equal(JSON.stringify(a).includes("actionSeedHex"), false);
});

test("client scope binds actual target and numeric parameters, not just labels", () => {
  const packet = createCommand("authorised-recovery");
  assert.equal(verifyAgentEnvelopeScope(packet.record, { ...packet.payload, storeId: "999" }).valid, false);
  assert.equal(verifyAgentEnvelopeScope(packet.record, { ...packet.payload, value: 50 }).valid, false);
  assert.equal(verifyAgentEnvelopeScope(packet.record, { ...packet.payload, unit: "f" }).valid, false);
});

test("future and expired envelopes are denied", () => {
  assert.equal(evaluateCommand(createCommand("normal", { now: Date.now() + 60000 }), policy).decision, "denied");
  assert.equal(evaluateCommand(createCommand("normal", { now: Date.now() - 600000 }), policy).decision, "denied");
});

test("fresh local legitimacy is checked rather than reference presence", async () => {
  const f = fixture();
  const id = await f.executor.queue("authorised-recovery");
  await f.executor.setLegitimacy("suspended");
  assert.equal((await f.executor.run(id)).evidence.reasonCode, "client.legitimacy_denied");
  assert.equal(entry(f, id).effectCount, 0);
  await f.executor.setLegitimacy("legitimate");
  assert.equal((await f.executor.run(id)).executionStatus, "completed");
  assert.equal(entry(f, id).effectCount, 1);
});

test("duplicate delivery and restart do not repeat completed effects", async () => {
  const f = fixture();
  const id = await f.executor.queue("normal");
  assert.equal((await f.executor.run(id)).executionStatus, "completed");
  assert.equal((await f.restart().run(id)).evidence.reasonCode, "client.already_completed");
  assert.equal(entry(f, id).effectCount, 1);
  assert.equal(Object.values(f.executor.snapshot().uses)[0], 1);
});

test("resuming an old alert does not undo a later authorised temperature change", async () => {
  const f = fixture();
  const alert = await f.executor.queue("normal");
  const recovery = await f.executor.queue("authorised-recovery");
  await f.executor.run(recovery);
  assert.equal(f.executor.snapshot().temperature, 4);
  await f.executor.run(alert);
  assert.equal(f.executor.snapshot().temperature, 4);
  assert.equal(entry(f, alert).effectCount, 1);
});

for (const fault of ["before-read", "after-read"]) test(fault + " resumes the SAME command after restart", async () => {
  const f = fixture();
  const id = await f.executor.queue("normal");
  const original = structuredClone(entry(f, id).packet);
  const interrupted = await f.executor.run(id, { fault });
  if (fault === "before-read") assert.deepEqual(interrupted.evidence.checks, {});
  assert.equal(entry(f, id).effectCount, 0);
  assert.equal((await f.restart().run(id)).executionStatus, "completed");
  assert.deepEqual(entry(f, id).packet, original);
  assert.equal(f.executor.snapshot().order.length, 1);
});

test("a queued command that expires during downtime halts without replacement", async t => {
  const f = fixture();
  const id = await f.executor.queue("normal", { validityMs: 5000 });
  await f.executor.run(id, { fault: "before-read" });
  const future = Date.now() + 10000;
  t.mock.method(Date, "now", () => future);
  assert.equal((await f.restart().run(id)).decision, "denied");
  assert.equal(entry(f, id).effectCount, 0);
  assert.equal(f.executor.snapshot().order.length, 1);
});

for (const [fault, effects] of [["before-effect", 0], ["after-effect", 1]]) test(fault + " remains uncertain and cannot replay", async () => {
  const f = fixture();
  const queued = await f.executor.queue("normal");
  const id = await f.executor.queue("authorised-recovery");
  assert.equal((await f.executor.run(id, { fault })).executionStatus, "unknown");
  assert.equal((await f.restart().run(id)).executionStatus, "unknown");
  assert.equal(entry(f, id).effectCount, effects);
  assert.equal((await f.executor.run(queued)).evidence.reasonCode, "client.other_outcome_unknown");
  await assert.rejects(f.executor.queue("normal"), /uncertain/);
  assert.equal((await f.executor.receipt(id)).outcome, null);
});

test("lost receipt is recoverable after expiry without a second effect", async t => {
  const f = fixture();
  const id = await f.executor.queue("normal", { validityMs: 5000 });
  assert.equal((await f.executor.run(id, { fault: "receipt-lost" })).outcome, null);
  const saved = entry(f, id).receipt;
  const future = Date.now() + 10000;
  t.mock.method(Date, "now", () => future);
  const result = await f.restart().receipt(id);
  assert.deepEqual(result.outcome, saved);
  assert.equal(result.evidence.reasonCode, "client.receipt_recovered");
  assert.deepEqual(result.evidence.checks, {});
  assert.equal(entry(f, id).effectCount, 1);
});

test("two executor instances share the lock and only one acts", async () => {
  const f = fixture();
  const id = await f.executor.queue("normal");
  const results = await Promise.all([f.executor.run(id), f.restart().run(id)]);
  assert.equal(results.filter(r => r.evidence.reasonCode === "client.admitted").length, 1);
  assert.equal(entry(f, id).effectCount, 1);
});

test("corrupt storage is not silently reset", async () => {
  const f = fixture();
  f.storage.setItem(EXECUTOR_KEY, "{broken");
  await assert.rejects(f.executor.queue("normal"), /corrupt/);
});

test("failure to persist the execution reservation prevents the effect", async () => {
  const f = fixture();
  const id = await f.executor.queue("normal");
  const save = f.storage.setItem;
  f.storage.setItem = (key, value) => {
    if (JSON.parse(value).commands[id]?.stage === "executing") throw new Error("Disk full");
    save(key, value);
  };
  await assert.rejects(f.executor.run(id), /Disk full/);
  assert.equal(entry(f, id).effectCount, 0);
});

test("a persisted executing marker becomes uncertain after an abrupt restart", async () => {
  const f = fixture();
  const id = await f.executor.queue("normal");
  const state = f.executor.snapshot();
  state.commands[id].stage = "executing";
  state.uses[state.commands[id].packet.record.actionEnvelopeHash] = 1;
  f.storage.setItem(EXECUTOR_KEY, JSON.stringify(state));
  assert.equal((await f.restart().run(id)).executionStatus, "unknown");
});

function hostedFixture() {
  const calls = [];
  const hosted = {
    prepare(config, result) { calls.push("prepare"); return { packet: { scenario: result.scenario, payload: result.payload, record: result.record, signature: result.signature } }; },
    async admit(config, context, save) { calls.push("admit"); context.report = { valid: true }; save(context); },
    async submit(config, context, receipt) { calls.push("submit"); assert.equal(receipt.status, "completed"); return { accepted: true }; },
  };
  return { ...fixture({ hosted }), hosted, calls };
}

test("offline execution makes no hosted calls", async () => {
  const f = hostedFixture();
  const id = await f.executor.queue("normal");
  await f.executor.run(id);
  assert.deepEqual(f.calls, []);
});

test("hosted admission failure prevents effects and completion reports", async () => {
  const f = hostedFixture();
  f.hosted.admit = async () => { throw new Error("Budget exhausted"); };
  const id = await f.executor.queue("authorised-recovery", { mode: "hosted" });
  assert.equal((await f.executor.run(id)).evidence.reasonCode, "hosted.admission_failed");
  assert.equal(entry(f, id).effectCount, 0);
  assert.equal(entry(f, id).receipt, null);
  assert.equal(f.calls.includes("submit"), false);
});

test("hosted admission precedes effects; completion reporting follows effects", async () => {
  const f = hostedFixture();
  const id = await f.executor.queue("normal", { mode: "hosted" });
  f.hosted.admit = async () => { assert.equal(entry(f, id).effectCount, 0); f.calls.push("admit"); };
  f.hosted.submit = async () => { assert.equal(entry(f, id).effectCount, 1); f.calls.push("submit"); return { accepted: true }; };
  await f.executor.run(id);
  assert.deepEqual(f.calls, ["prepare", "admit", "submit"]);
});

test("hosted reporting failure retains receipt; retry does not mint or act again", async () => {
  const f = hostedFixture();
  const id = await f.executor.queue("normal", { mode: "hosted" });
  f.hosted.submit = async () => { throw new Error("Report service down"); };
  await f.executor.run(id);
  assert.equal(entry(f, id).stage, "completed");
  assert.match(entry(f, id).reportError, /down/);
  f.hosted.submit = async () => { f.calls.push("retry-report"); return { accepted: true }; };
  await f.restart().receipt(id);
  assert.deepEqual(f.calls, ["prepare", "admit", "retry-report"]);
  assert.equal(entry(f, id).effectCount, 1);
  assert.equal(entry(f, id).reportError, null);
});

test("expiry during hosted admission is rechecked before the effect", async t => {
  const f = hostedFixture();
  const id = await f.executor.queue("normal", { mode: "hosted", validityMs: 5000 });
  const future = Date.now() + 10000;
  f.hosted.admit = async () => { t.mock.method(Date, "now", () => future); };
  assert.equal((await f.executor.run(id)).decision, "denied");
  assert.equal(entry(f, id).effectCount, 0);
  assert.equal(entry(f, id).receipt, null);
});
