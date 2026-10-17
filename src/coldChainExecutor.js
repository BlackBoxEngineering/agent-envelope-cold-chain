import {
  createCommand, evaluateCommand, makeDecision, executionOutcome, witnessEntry,
} from "./coldChainAuthority.js";

export const EXECUTOR_KEY = "agentenvelope:cold-chain-executor:v2";
const emptyState = () => ({
  version: 2, commands: {}, order: [], uses: {}, ledger: [], temperature: 4,
  legitimacy: { status: "legitimate", version: 1 },
});

// Browser storage is a DEMO persistence mechanism, not tamper-resistant custody.
// All command transitions use one cross-tab Web Lock; unsupported storage/locks
// fail closed rather than pretending that in-memory checks survive a restart.
export function createExecutor({ storage, withLock, hosted } = {}) {
  if (!storage || !withLock) throw new Error("Persistent storage and executor locking are required.");
  function read() {
    const raw = storage.getItem(EXECUTOR_KEY);
    if (raw === null) return emptyState();
    let state;
    try { state = JSON.parse(raw); } catch { throw new Error("Executor history is corrupt; execution is blocked. Explicitly reset the demo to start over."); }
    if (state?.version !== 2 || !state.commands || !Array.isArray(state.order) ||
        !state.uses || !Array.isArray(state.ledger) || !state.legitimacy ||
        !Number.isFinite(state.temperature)) throw new Error("Executor history is invalid; execution is blocked.");
    return state;
  }
  function write(state) {
    // Callers do not proceed to effects unless this succeeds.
    storage.setItem(EXECUTOR_KEY, JSON.stringify(state));
  }
  function update(change) {
    const state = read();
    change(state);
    write(state);
    return state;
  }
  function log(state, entry, result) {
    entry.lastResult = result;
    const previous = state.ledger[0]?.entryHash ?? null;
    state.ledger.unshift({ ...witnessEntry(result, previous, state.ledger.length + 1), result });
  }
  function recordResult(id, result, stage) {
    update(state => {
      const entry = state.commands[id];
      if (stage) entry.stage = stage;
      log(state, entry, result);
    });
    return result;
  }
  function currentResult(entry, state) {
    return evaluateCommand(entry.packet, {
      legitimacy: state.legitimacy,
      uses: state.uses[entry.packet.record?.actionEnvelopeHash] ?? 0,
    });
  }
  async function publishReceipt(id, config) {
    let state = read(), entry = state.commands[id];
    if (entry.mode !== "hosted" || !entry.receipt || !entry.receiptDelivered || entry.hosted?.outcomeReceipt) return;
    try {
      const receipt = await hosted.submit(config, entry.hosted, entry.receipt);
      update(s => { s.commands[id].hosted.outcomeReceipt = receipt; s.commands[id].reportError = null; });
    } catch (error) {
      // Completion cannot be undone by an unavailable reporting service.
      update(s => { s.commands[id].reportError = error.message; });
    }
  }
  return {
    snapshot: read,
    queue(scenarioId, { mode = "offline", validityMs = 300_000 } = {}) {
      return withLock(() => {
        if (!["offline", "hosted"].includes(mode)) throw new Error("Invalid execution mode");
        const packet = createCommand(scenarioId, { validityMs });
        const id = packet.payload.commandId;
        update(state => {
          // Do not issue new work around an uncertain prior physical effect.
          if (Object.values(state.commands).some(e => ["executing", "unknown"].includes(e.stage))) {
            throw new Error("An earlier outcome is uncertain. Investigate before issuing more commands.");
          }
          state.commands[id] = { packet, mode, stage: "queued", receipt: null, receiptDelivered: false, effectCount: 0 };
          state.order.unshift(id);
          state.temperature = packet.scenario.initialTemperature; // Incident input, not an actuator effect.
        });
        return id;
      });
    },
    setLegitimacy(status) {
      return withLock(() => {
        if (!["legitimate", "suspended"].includes(status)) throw new Error("Invalid local policy");
        return update(state => { state.legitimacy = { status, version: state.legitimacy.version + 1 }; });
      });
    },
    run(id, { fault = "none", config } = {}) {
      return withLock(async () => {
        let state = read(), entry = state.commands[id];
        if (!entry) throw new Error("Unknown command");
        if (fault === "before-read" && entry.stage === "queued") {
          const unread = makeDecision({ ...entry.packet, verification: {}, scope: {}, checksDeferred: true, outcome: null },
            "paused", "client.not_read", "Delivery interrupted before the executor read the command. The original command remains queued; no admission checks ran.");
          return recordResult(id, { ...unread, executionStatus: "queued" });
        }
        let result = currentResult(entry, state);
        if (entry.stage === "completed") {
          result = makeDecision(result, "denied", "client.already_completed", "Execution refused: this command already completed. Retrieve its stored receipt instead.");
          return recordResult(id, { ...result, executionStatus: "completed", outcome: entry.receiptDelivered ? entry.receipt : null });
        }
        if (["executing", "unknown"].includes(entry.stage)) {
          result = makeDecision(result, "paused", "client.outcome_unknown", "A prior attempt may have acted. Execution is blocked pending investigation.");
          return recordResult(id, { ...result, executionStatus: "unknown" }, "unknown");
        }
        if (Object.entries(state.commands).some(([otherId, item]) => otherId !== id && ["executing", "unknown"].includes(item.stage))) {
          result = makeDecision(result, "paused", "client.other_outcome_unknown", "Another command in this zone has an uncertain outcome. Execution is blocked.");
          return recordResult(id, { ...result, executionStatus: entry.stage });
        }
        update(s => { s.commands[id].stage = "received"; });
        if (fault === "after-read") {
          result = makeDecision(result, "paused", "client.not_started", "Read but not started. Resume this original command only if its rules still permit execution.");
          return recordResult(id, { ...result, executionStatus: "received" });
        }
        if (result.decision !== "allowed") return recordResult(id, result, "received");
        if (entry.mode === "hosted") {
          try {
            if (!entry.hosted) {
              const context = hosted.prepare(config, result);
              update(s => { s.commands[id].hosted = context; s.commands[id].packet = context.packet; });
            }
            entry = read().commands[id];
            await hosted.admit(config, entry.hosted, context => {
              update(s => { s.commands[id].hosted = context; });
            });
          } catch (error) {
            state = read(); entry = state.commands[id];
            result = makeDecision(currentResult(entry, state), "denied", "hosted.admission_failed", error.message);
            return recordResult(id, result, "received");
          }
        }
        // The window may have expired while hosted checks were in flight.
        state = read(); entry = state.commands[id];
        result = currentResult(entry, state);
        if (result.decision !== "allowed") return recordResult(id, result, "received");
        const authorityKey = entry.packet.record.actionEnvelopeHash;
        update(s => {
          s.uses[authorityKey] = (s.uses[authorityKey] ?? 0) + 1;
          s.commands[id].stage = "executing"; // Durable reservation BEFORE effect.
        });
        if (fault === "before-effect") {
          result = makeDecision(result, "paused", "client.outcome_unknown", "Interrupted after reserving execution. After restart the executor must treat the outcome as uncertain.");
          return recordResult(id, { ...result, executionStatus: "unknown" }, "unknown");
        }
        update(s => {
          // Observation/dispatch must not change the refrigeration controls.
          if (entry.packet.payload.operation === "restore_safe_temperature") {
            s.temperature = entry.packet.payload.value;
          }
          s.commands[id].effectCount += 1; // Observable simulator effect only.
        });
        if (fault === "after-effect") {
          result = makeDecision(result, "paused", "client.outcome_unknown", "The simulator acted but its receipt was not saved. Do not automatically repeat the command.");
          return recordResult(id, { ...result, executionStatus: "unknown" }, "unknown");
        }
        const receipt = executionOutcome(entry.packet, result.evidence);
        const delivered = fault !== "receipt-lost";
        update(s => {
          const item = s.commands[id];
          item.stage = "completed"; item.receipt = receipt; item.receiptDelivered = delivered;
          log(s, item, delivered
            ? { ...result, outcome: receipt, executionStatus: "completed" }
            : { ...makeDecision(result, "paused", "client.receipt_lost", "Completed at the simulated device, but the reply was lost. Retrieve the receipt; do not re-execute."),
                outcome: null, executionStatus: "receipt-missing" });
        });
        if (delivered) await publishReceipt(id, config);
        return read().commands[id].lastResult;
      });
    },
    receipt(id, { config } = {}) {
      return withLock(async () => {
        const state = read(), entry = state.commands[id];
        if (!entry) throw new Error("Unknown command");
        // Retrieval is historical evidence, not fresh execution permission.
        if (!entry.receipt) {
          return recordResult(id, {
            ...makeDecision(currentResult(entry, state), "paused", "client.no_receipt", "No completed receipt is available. This does not prove that no effect occurred."),
            executionStatus: ["executing", "unknown"].includes(entry.stage) ? "unknown" : entry.stage,
          });
        }
        const result = {
          ...makeDecision({ ...(entry.lastResult ?? entry.packet), checksDeferred: true }, "recorded", "client.receipt_recovered", "Historical completion receipt recovered. No command was executed or minted; no fresh admission checks were made."),
          outcome: entry.receipt, executionStatus: "completed",
        };
        update(s => { s.commands[id].receiptDelivered = true; log(s, s.commands[id], result); });
        await publishReceipt(id, config);
        return result;
      });
    },
    reset() { return withLock(() => { write(emptyState()); }); },
  };
}
