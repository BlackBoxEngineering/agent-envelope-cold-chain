import { useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleOff,
  ClipboardCheck,
  DatabaseZap,
  FileCheck2,
  Fingerprint,
  Gauge,
  KeyRound,
  Link2,
  LockKeyhole,
  Play,
  RadioTower,
  RotateCcw,
  ServerCog,
  ShieldCheck,
  Snowflake,
  Thermometer,
  TriangleAlert,
  UserRoundCheck,
  X,
  XCircle,
} from "lucide-react";
import { authorities, domain, scenarios } from "./coldChainAuthority.js";
import {
  clearHostedConfig,
  hostedConfigStatus,
  hostedRoleSummaries,
  initialHostedConfig,
  prepareHostedCommand,
  admitHostedCommand,
  submitHostedCompletion,
  saveHostedConfig,
} from "./coldChainHosted.js";

import { createExecutor } from "./coldChainExecutor.js";

const viewIds = new Set(["run", "authority", "evidence", "setup"]);
const VIEW_KEY = "agent-envelope-cold-chain:view";

function initialView() {
  const requested = new URLSearchParams(window.location.search).get("view");
  if (viewIds.has(requested)) return requested;
  const stored = window.localStorage.getItem(VIEW_KEY);
  return viewIds.has(stored) ? stored : "run";
}

function App() {
  const [view, setView] = useState(initialView);
  const executor = useRef(null);
  if (!executor.current) executor.current = createExecutor({
    storage: window.localStorage,
    withLock: (work) => {
      if (!navigator.locks) return Promise.reject(new Error("This demo requires Web Locks; execution is blocked in this browser."));
      return navigator.locks.request("cold-chain-executor-v2", work);
    },
    hosted: { prepare: prepareHostedCommand, admit: admitHostedCommand, submit: submitHostedCompletion },
  });
  const [clientError, setClientError] = useState("");
  const [snapshot, setSnapshot] = useState(() => {
    try { return executor.current.snapshot(); }
    catch { return { commands: {}, order: [], ledger: [], temperature: 4, legitimacy: { status: "suspended" } }; }
  });
  const [activeId, setActiveId] = useState(snapshot.order[0] ?? "");
  const [scenarioId, setScenarioId] = useState(snapshot.commands[activeId]?.packet.scenario.id ?? "normal");
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState("paused");
  const [mode, setMode] = useState("offline");
  const [fault, setFault] = useState("none");
  const [validityMs, setValidityMs] = useState(300_000);
  const [hostedConfig, setHostedConfig] = useState(() => initialHostedConfig());
  const timers = useRef(new Set());
  const active = snapshot.commands[activeId];
  const result = active?.lastResult ?? null;
  const ledger = snapshot.ledger;
  const temperature = snapshot.temperature;
  const scenario = scenarios.find(item => item.id === scenarioId) ?? scenarios[0];
  const displayedMode = active?.mode ?? mode;
  const hostedState = {
    ...hostedConfigStatus(hostedConfig),
    label: displayedMode === "offline" ? "offline" : active?.reportError ? "report pending" : active?.hosted?.outcomeReceipt ? "recorded" : active?.hosted?.report?.valid ? "admitted" : "approval required",
    message: displayedMode === "offline" ? "Local SDK verification plus client execution policy. No hosted calls."
      : active?.reportError ? "Execution completed; reporting remains pending: " + active.reportError
      : active?.hosted?.outcomeReceipt ? "Completion report accepted. See the receipt for witness and MIR status."
      : "Hosted mint, registration and current verification must succeed before the simulated effect.",
    publishing: phase === "verifying" && displayedMode === "hosted",
    records: active?.hosted?.outcomeReceipt ? [{
      roleLabel: active.hosted.roleLabel, record: active.packet.record,
      report: active.hosted.report, outcomeReceipt: active.hosted.outcomeReceipt,
    }] : [],
    recordUrl: active?.hosted?.registered ? "https://agentenvelope.io/records/" + active.packet.record.recordId : "",
    ledgerUrl: active?.hosted?.registered ? "https://agentenvelope.io/ledger?tab=activity" : "",
  };

  function clearScheduledWork() {
    timers.current.forEach(timer => window.clearTimeout(timer));
    timers.current.clear();
  }
  useEffect(() => () => clearScheduledWork(), []);
  useEffect(() => {
    const refresh = () => { try { setSnapshot(executor.current.snapshot()); } catch (error) { setClientError(error.message); } };
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, []);
  function sync(id = activeId) {
    const state = executor.current.snapshot();
    setSnapshot(state);
    setActiveId(id);
    if (state.commands[id]) setScenarioId(state.commands[id].packet.scenario.id);
    return state.commands[id]?.lastResult;
  }
  async function perform(work) {
    clearScheduledWork();
    setClientError("");
    setPhase("verifying");
    try {
      const id = await work();
      const next = sync(id);
      setPhase(next?.decision === "denied" ? "denied" : next?.executionStatus === "completed" ? "allowed" : "monitoring");
    } catch (error) {
      setClientError(error.message);
      try { sync(executor.current.snapshot().order[0] ?? ""); } catch {}
      setPhase("monitoring");
    }
    const timer = window.setTimeout(() => { timers.current.delete(timer); setPhase("monitoring"); }, 700);
    timers.current.add(timer);
  }
  function selectScenario(id) {
    if (!running || phase === "verifying") return;
    setScenarioId(id);
    void perform(async () => {
      const commandId = await executor.current.queue(id, { mode, validityMs });
      setActiveId(commandId);
      await executor.current.run(commandId, { fault, config: hostedConfig });
      return commandId;
    });
  }
  function resume() {
    void perform(async () => {
      await executor.current.run(activeId, { config: hostedConfig });
      return activeId;
    });
  }
  function retrieve() {
    void perform(async () => {
      await executor.current.receipt(activeId, { config: hostedConfig });
      return activeId;
    });
  }
  async function changeLegitimacy() {
    await executor.current.setLegitimacy(snapshot.legitimacy.status === "legitimate" ? "suspended" : "legitimate");
    sync();
  }
  function changeView(next) {
    if (!viewIds.has(next)) return;
    setView(next);
    window.localStorage.setItem(VIEW_KEY, next);
    const url = new URL(window.location.href);
    url.searchParams.set("view", next);
    window.history.replaceState({}, "", url);
  }
  function updateHostedConfig(patch) { setHostedConfig(current => ({ ...current, ...patch })); }
  function saveHostedSession() { saveHostedConfig(hostedConfig); }
  function clearHostedSession() { clearHostedConfig(); setHostedConfig(initialHostedConfig()); }
  async function reset() {
    if (phase === "verifying") return;
    if (!window.confirm("Clear local demo commands, receipts and evidence? This does NOT reset hosted budgets or revoke hosted authority.")) return;
    clearScheduledWork();
    await executor.current.reset();
    setSnapshot(executor.current.snapshot());
    setActiveId(""); setScenarioId("normal"); setRunning(false); setPhase("paused"); setClientError("");
  }
  function startSystem() { setRunning(true); setPhase("monitoring"); }
  const controls = {
    mode, setMode, fault, setFault, validityMs, setValidityMs, snapshot, activeId,
    onSelect: id => sync(id), onResume: resume, onReceipt: retrieve,
    onLegitimacy: () => { void changeLegitimacy().catch(error => setClientError(error.message)); },
    clientError,
  };

  return (
    <main className="app-shell">
      <Toolbar view={view} running={running} onStart={startSystem} onViewChange={changeView} onReset={() => { void reset().catch(error => setClientError(error.message)); }} />
      {view === "run" && (
        <RunWorkspace
          scenario={scenario}
          scenarioId={scenarioId}
          result={result}
          ledger={ledger}
          running={running}
          temperature={temperature}
          phase={phase}
          hosted={{
            config: hostedConfig,
            state: hostedState,
            roles: hostedRoleSummaries(hostedConfig),
          }}
          controls={controls}
          onStart={startSystem}
          onSelectScenario={selectScenario}
        />
      )}
      {view === "authority" && <AuthorityView />}
      {view === "evidence" && <EvidenceView ledger={ledger} onRun={() => changeView("run")} />}
      {view === "setup" && (
        <SetupView
          hostedConfig={hostedConfig}
          hostedState={hostedState}
          hostedRoles={hostedRoleSummaries(hostedConfig)}
          onHostedChange={updateHostedConfig}
          onHostedSave={saveHostedSession}
          onHostedClear={clearHostedSession}
        />
      )}
      <footer>
        <span>AgentEnvelope Cold Chain</span>
        <span className="footer-separator">•</span>
        <span>SDK authority checks + client execution policy · simulated equipment</span>
      </footer>
    </main>
  );
}

function executionLabel(result) {
  if (result.outcome) return "Completed in simulator";
  return ({
    queued: "Not read — queued",
    received: "Read — not started",
    unknown: "Outcome unknown — halted",
    "receipt-missing": "Receipt missing — retrieve, do not repeat",
    completed: "Already completed — execution refused",
    "not-started": "Not attempted",
  })[result.executionStatus] ?? "Not attempted";
}

function ExecutionControls({ controls: c, busy, running }) {
  const active = c.snapshot.commands[c.activeId];
  return (
    <section className="panel execution-controls">
      <PanelHeading icon={ServerCog} eyebrow="Client responsibilities" title="Execution and recovery lab" />
      <p>Each event issues a new demo command and loads its incident temperature. Mode, break point and validity apply to new commands only. Run selected retries the original; receipt retrieval never executes it.</p>
      <label>Execution mode<select aria-label="Execution mode" value={c.mode} disabled={busy} onChange={e => c.setMode(e.target.value)}>
        <option value="offline">Offline SDK + local client policy</option>
        <option value="hosted">Hosted approval required</option>
      </select></label>
      <label>Break point<select aria-label="Break point" value={c.fault} disabled={busy} onChange={e => c.setFault(e.target.value)}>
        <option value="none">No interruption</option>
        <option value="before-read">Before read — keep queued</option>
        <option value="after-read">After read — not started</option>
        <option value="before-effect">After reservation — before effect</option>
        <option value="after-effect">After effect — before receipt saved</option>
        <option value="receipt-lost">After receipt saved — reply lost</option>
      </select></label>
      <label>Command validity<select aria-label="Command validity" value={c.validityMs} disabled={busy} onChange={e => c.setValidityMs(Number(e.target.value))}>
        <option value={300000}>5 minutes</option><option value={5000}>5 seconds — expiry test</option>
      </select></label>
      <p className="local-policy">Local policy: <strong>{c.snapshot.legitimacy.status}</strong> · version {c.snapshot.legitimacy.version}</p>
      <button type="button" disabled={busy} onClick={c.onLegitimacy}>{c.snapshot.legitimacy.status === "legitimate" ? "Suspend local legitimacy" : "Restore local legitimacy"}</button>
      <label>Stored commands<select aria-label="Stored commands" disabled={busy || !c.snapshot.order.length} value={c.activeId} onChange={e => c.onSelect(e.target.value)}>
        {!c.snapshot.order.length && <option value="">No commands</option>}
        {c.snapshot.order.map(id => <option key={id} value={id}>{c.snapshot.commands[id].packet.scenario.shortLabel} · {id.slice(0, 8)} · {c.snapshot.commands[id].stage}</option>)}
      </select></label>
      {active && <dl className="facts">
        <Fact label="Command ID" value={c.activeId} mono />
        <Fact label="Recorded state" value={active.stage} />
        <Fact label="Simulated effects" value={String(active.effectCount)} />
        <Fact label="Command mode" value={active.mode} />
        <Fact label="Expires" value={active.packet.record?.expiry ?? "No trusted authority"} />
      </dl>}
      <div className="execution-buttons">
        <button type="button" disabled={busy || !running || !active} onClick={c.onResume}>Run selected command</button>
        <button type="button" disabled={busy || !active} onClick={c.onReceipt}>Retrieve receipt / retry report</button>
        <button type="button" disabled={busy} onClick={() => window.location.reload()}>Reload executor</button>
      </div>
      {c.clientError && <p role="alert">{c.clientError}</p>}
      <small>Persistent single-origin browser simulation, serialized with Web Locks. Unknown outcomes halt this zone; Reset clears the local sandbox, not hosted budgets.</small>
    </section>
  );
}

function Toolbar({ view, running, onStart, onViewChange, onReset }) {
  const items = [
    ["run", Snowflake, "Cold chain run"],
    ["authority", KeyRound, "Authority map"],
    ["evidence", DatabaseZap, "Incident evidence"],
    ["setup", BookOpen, "Setup guide"],
  ];
  return (
    <header className="toolbar">
      <div className="brand">
        <div className="brand-mark"><Snowflake size={25} /></div>
        <div>
          <h1>AgentEnvelope Cold Chain</h1>
          <p>Stop the command. Preserve the evidence.</p>
        </div>
      </div>
      <nav className="view-switch" aria-label="Cold chain views">
        {items.map(([id, Icon, label]) => (
          <button key={id} className={view === id ? "selected" : ""} type="button" onClick={() => onViewChange(id)}>
            <Icon size={16} aria-hidden="true" />{label}
          </button>
        ))}
      </nav>
      <div className="run-controls">
        {!running && view === "run" && <button className="reset-button" type="button" onClick={onStart}><Play size={16} /> Start system</button>}
        <span className={`live-state ${running ? "running" : "paused"}`}><i />{running ? "Live" : "Stopped"}</span>
        <button className="reset-button" type="button" onClick={onReset}><RotateCcw size={16} /> Reset</button>
      </div>
    </header>
  );
}

function RunWorkspace({ scenario, scenarioId, result, ledger, running, temperature, phase, hosted, controls, onStart, onSelectScenario }) {
  const busy = running && phase !== "monitoring";
  return (
    <section className="workspace">
      <aside className="side-panel left-panel">
        <ExecutionControls controls={controls} busy={phase === "verifying"} running={running} />
        <section className="panel scenario-panel">
          <PanelHeading icon={AlertTriangle} eyebrow="Incident feed" title="Try an operational event" />
          <div className="scenario-list">
            {scenarios.map((item, index) => (
              <button
                key={item.id}
                className={scenarioId === item.id ? "active" : ""}
                type="button"
                disabled={!running || busy}
                onClick={() => onSelectScenario(item.id)}
              >
                <span className="scenario-number">0{index + 1}</span>
                <span><strong>{item.shortLabel}</strong><small>{item.title}</small></span>
                <ArrowRight size={15} />
              </button>
            ))}
          </div>
        </section>

        <section className="panel proposed-command">
          <PanelHeading icon={ServerCog} eyebrow="Pending" title="Proposed command" />
          <dl className="facts">
            <Fact label="Issuer" value={scenario.source} />
            <Fact label="Operation" value={scenario.command.operation} mono />
            <Fact label="Target" value="Store 184 / Chilled 03" />
            {scenario.command.value !== null && <Fact label="Requested value" value={scenario.command.displayValue ?? `${scenario.command.value}°C`} />}
          </dl>
          <p>{scenario.summary}</p>
          {running && (
            <div className={`system-running-note ${busy ? "busy" : ""}`}>
              <Activity size={17} />{busy ? "Event in progress…" : "System live — select an event above"}
            </div>
          )}
        </section>

        <details className="panel boundary-panel">
          <summary><LockKeyhole size={17} /> Enforcement boundary <ChevronDown size={16} /></summary>
          <p>The demo client enforces scope, current local policy and durable use reservations around SDK verification. Browser storage and demo keys are not production custody. Hosted mode adds online approval before execution.</p>
        </details>
      </aside>

      <div className="center-panel">
        <AuthorityFlow result={result} phase={phase} running={running} />
        <ColdRoom scenario={scenario} result={result} temperature={temperature} phase={phase} running={running} />
        <DecisionTimeline ledger={ledger} />
      </div>

      <aside className="side-panel right-panel">
        <DecisionPanel result={result} phase={phase} />
        <ChecksPanel result={result} phase={phase} />
        <EvidenceCard result={result} />
        <HostedRecordsPanel hosted={hosted} />
      </aside>
    </section>
  );
}

function AuthorityFlow({ result, phase, running }) {
  const allowed = result?.decision === "allowed";
  const denied = result?.decision === "denied";
  const verifying = phase === "verifying" || phase === "recovering";
  const checked = result && !result.checksDeferred;
  const steps = [
    [Fingerprint, "SDK verification", verifying ? "checking" : checked ? (result.verification.valid ? "verified" : "failed") : "waiting"],
    [KeyRound, "Authority", verifying ? "checking" : checked ? (result.record ? "found" : "missing") : "waiting"],
    [ShieldCheck, "Client scope", verifying ? "checking" : checked ? (result.scope.valid ? "matched" : "denied") : "waiting"],
    [ClipboardCheck, "Evidence", verifying ? "preparing" : result ? "recorded" : "waiting"],
  ];
  const headline = !running ? "System paused" : verifying ? "Verifying command" : result ? ({ allowed: "Allowed", denied: "Denied", paused: "Paused", recorded: "Historical receipt" })[result.decision] : "Gateway ready";
  return (
    <section className={`authority-flow ${!verifying && allowed ? "allowed" : ""} ${!verifying && denied ? "denied" : ""} ${verifying ? "verifying" : ""}`} aria-label="Command authority flow">
      <div className="flow-intro"><span>Command admission</span><strong>{headline}</strong></div>
      <div className="flow-steps">
        {steps.map(([Icon, label, status], index) => (
          <div className={`flow-step ${status}`} key={label}>
            <div><Icon size={18} /></div><span>{label}</span><small>{status}</small>
            {index < steps.length - 1 && <i />}
          </div>
        ))}
      </div>
    </section>
  );
}

function ColdRoom({ scenario, result, temperature, phase, running }) {
  const denied = result?.decision === "denied";
  const allowed = result?.decision === "allowed";
  const verifying = phase === "verifying";
  const recovering = phase === "recovering";
  const severity = temperature > 8 ? "danger" : temperature > 5 ? "warning" : "safe";
  const stateLabel = !running ? "System paused" : verifying ? "Evaluating command" : result?.decision === "paused" ? "Execution paused" : result?.decision === "recorded" ? "Historical receipt" : denied ? "Command isolated" : allowed ? "Command completed" : "Simulator ready";
  const stateIcon = denied ? <XCircle size={17} /> : allowed ? <CheckCircle2 size={17} /> : <Activity size={17} />;
  const cabinetTemperatures = [temperature + 0.1, temperature - 0.2, temperature];
  return (
    <section className={`cold-room ${severity} ${running ? "running" : "paused"}`} aria-label="Cold-chain refrigeration system">
      <div className="room-header">
        <div><span>Store 184 · Chilled zone 03</span><h2>Refrigeration control boundary</h2></div>
        <div className={`system-state ${denied ? "denied" : allowed ? "allowed" : recovering || verifying ? "verifying" : "monitoring"}`}>
          {stateIcon}{stateLabel}
        </div>
      </div>
      <div className="plant-grid">
        <div className="temperature-stack">
          <Thermometer size={31} />
          <strong>{formatTemperature(temperature)}°C</strong>
          <span>Simulated temperature</span>
          <div className="temperature-track"><i style={{ height: `${Math.min(100, Math.max(8, (temperature + 25) * 1.35))}%` }} /></div>
        </div>
        <div className="cabinet-bank">
          {["Chilled A", "Chilled B", "Chilled C"].map((label, index) => (
            <div className="cabinet" key={label}>
              <div className="cabinet-glass"><Snowflake size={22} /><span>{formatTemperature(cabinetTemperatures[index])}°</span></div>
              <strong>{label}</strong><small>{index === 2 ? "Command target" : "Simulated sensor"}</small>
            </div>
          ))}
        </div>
        <div className="controller-rack">
          <div className="rack-title"><ServerCog size={20} /><span>AgentEnvelope gateway</span></div>
          <div className={`gateway-light ${denied ? "red" : allowed ? "green" : "amber"}`} />
          <dl>
            <Fact label="Mode" value={verifying ? "Checking authority" : result?.outcome ? "Stored completion" : result?.executionStatus === "unknown" ? "Halted: uncertain outcome" : denied ? "Fail closed" : "Awaiting command"} />
            <Fact label="Compressor" value={scenario.id === "compressor" ? "Fault scenario; dispatch is not repair" : "Simulated equipment"} />
            <Fact label="Defrost" value={result?.scenario.id === "authority-breakout-attempt" && denied ? "8-hour scope breakout blocked" : result?.scenario.id === "attack" && denied ? "Malicious request blocked" : "Scheduled only"} />
          </dl>
        </div>
      </div>
      <div className={`command-strip ${denied ? "denied" : allowed ? "allowed" : ""}`}>
        {denied ? <CircleOff size={19} /> : allowed ? <Check size={19} /> : <RadioTower size={19} />}
        <div>
          <strong>{verifying ? "authority.verification_in_progress" : recovering ? "recovery.authority_requested" : result ? result.evidence.reasonCode : "Gateway ready"}</strong>
          <span>{verifying ? "SDK verification plus client checks of exact resources and safety-relevant values." : result ? result.evidence.reason : "Choose an event to submit a command to the simulator."}</span>
        </div>
      </div>
    </section>
  );
}

function DecisionTimeline({ ledger }) {
  return (
    <section className="timeline-panel">
      <div className="timeline-heading"><div><span>Hash-linked evidence</span><h2>Decision timeline</h2></div><strong>{ledger.length} entries</strong></div>
      {ledger.length === 0 ? (
        <div className="empty-timeline"><Link2 size={19} /><span>Each submitted command will add a hash-linked decision entry.</span></div>
      ) : (
        <ol>
          {ledger.slice(0, 5).map((entry) => (
            <li key={entry.entryHash} className={entry.result.decision}>
              <span className="timeline-dot" />
              <div><strong>{entry.result.scenario.title}</strong><small>{entry.result.evidence.decisionId} · {entry.result.evidence.reasonCode}</small></div>
              <span>{entry.result.decision}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function DecisionPanel({ result, phase }) {
  if (phase === "verifying" || phase === "recovering") return (
    <section className="panel decision-panel verifying">
      <PanelHeading icon={Gauge} eyebrow="Decision" title={phase === "recovering" ? "Authorising recovery" : "Verification in progress"} />
      <p>The SDK checks the signed record and time window. The client checks refrigeration scope, current local policy and remaining uses; hosted mode also requires online approval.</p>
    </section>
  );
  if (!result) return (
    <section className="panel decision-panel idle">
      <PanelHeading icon={Gauge} eyebrow="Decision" title="Awaiting command" />
      <p>Authority is evaluated before the simulator changes refrigeration state.</p>
    </section>
  );
  const allowed = result.decision === "allowed";
  return (
    <section className={`panel decision-panel ${result.decision}`}>
      <PanelHeading icon={allowed || result.decision === "recorded" ? CheckCircle2 : result.decision === "paused" ? CircleOff : XCircle} eyebrow={result.decision === "recorded" ? "Historical evidence" : "Admission decision"} title={result.decision === "recorded" ? "Receipt recovered" : result.decision === "paused" ? "Paused — no automatic retry" : allowed ? "Allowed" : "Denied"} />
      <div className="decision-id"><span>Decision ID</span><strong>{result.evidence.decisionId}</strong></div>
      <p>{result.evidence.reason}</p>
      {result.scenario.admissionNote && <div className="admission-limit"><TriangleAlert size={17} /><span>{result.scenario.admissionNote}</span></div>}
      <div className="execution-state">
        <span>Execution</span>
        <strong>{executionLabel(result)}</strong>
      </div>
    </section>
  );
}

function ChecksPanel({ result, phase }) {
  const checks = phase === "verifying" || phase === "recovering" ? null : result?.evidence.checks;
  const rows = [
    ["SDK signature, envelope and time", checks?.identity],
    ["Public authority record", checks?.authority],
    ["Exact operation, rules and resources", checks?.operationScope],
    ["Client operational legitimacy", checks?.legitimacy],
    ["Client remaining-use check", checks?.uses],
  ];
  return (
    <section className="panel checks-panel">
      <PanelHeading icon={ShieldCheck} eyebrow="Verification" title="Authority checks" />
      {result?.decision === "recorded" && <p>Receipt retrieval does not check or renew execution authority. Prior decisions remain in the evidence timeline.</p>}
      <div className="check-list">
        {rows.map(([label, state]) => (
          <div key={label} className={state === undefined ? "waiting" : state ? "pass" : "fail"}>
            {state === undefined ? <span className="waiting-dot" /> : state ? <Check size={16} /> : <X size={16} />}
            <span>{label}</span><strong>{state === undefined ? "waiting" : state ? "pass" : "fail"}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function EvidenceCard({ result }) {
  return (
    <details className="panel evidence-card" open>
      <summary><FileCheck2 size={18} /><div><span>Evidence</span><strong>What can be proved</strong></div><ChevronDown size={16} /></summary>
      {!result ? <p>No decision evidence yet.</p> : (
        <dl className="evidence-facts">
          <Fact label="Command hash" value={shortHash(result.evidence.commandHash)} mono />
          <Fact label="Record" value={result.record?.recordId ?? "No matching record"} mono />
          <Fact label="Evidence hash" value={shortHash(result.evidence.evidenceHash)} mono />
          <Fact label="Demo decision signer" value={shortHash(result.evidence.evidenceSigner)} mono />
          <Fact label="Outcome" value={result.outcome ? shortHash(result.outcome.outcomeHash) : executionLabel(result)} mono={Boolean(result.outcome)} />
        </dl>
      )}
    </details>
  );
}

function HostedRecordsPanel({ hosted }) {
  const state = hosted?.state ?? { label: "configuration required", message: "Hosted publishing is not configured." };
  const latest = state.records?.[0];
  const className = state.label.replaceAll(" ", "-");
  return (
    <section className={`panel hosted-records-panel ${className}`}>
      <PanelHeading icon={Link2} eyebrow="Hosted lifecycle" title="Portal records" />
      <div className="hosted-state-row">
        <span className={`hosted-state-pill ${className}`}>{state.publishing ? "publishing" : state.label}</span>
        <strong>{state.label === "offline" ? "Local simulation" : state.ready ? "Hosted mode selected" : "Hosted setup required"}</strong>
      </div>
      <p>{state.message}</p>
      {latest && (
        <dl className="evidence-facts hosted-latest">
          <Fact label="Authority" value={latest.roleLabel} />
          <Fact label="Record" value={shortHash(latest.record.recordId)} mono />
          <Fact label="Verification" value={latest.report.valid ? "allowed" : "denied"} />
          <Fact label="Completion" value={latest.outcomeReceipt.witness ? "witness receipt returned" : latest.outcomeReceipt.accepted ? "report accepted; no witness proof returned" : "not recorded"} />
        </dl>
      )}
      {(state.recordUrl || state.ledgerUrl) && (
        <div className="hosted-record-links">
          {state.recordUrl && <a href={state.recordUrl} target="_blank" rel="noreferrer">Open record</a>}
          {state.ledgerUrl && <a href={state.ledgerUrl} target="_blank" rel="noreferrer">Open ledger</a>}
        </div>
      )}
      <small>Configure portal delegates and credentials in Setup guide. Denied local attempts remain in the incident chain without minting a hosted capability.</small>
    </section>
  );
}

function AuthorityView() {
  return (
    <section className="page-view">
      <PageHero eyebrow="Sovereign authority" title="One Domain. Five scoped authority templates." body="Monitoring can observe and alert. Maintenance can dispatch. Site control can restore a safe setpoint or run only the exact defrost schedule in its separately derived authority. Knowing the right value never grants control authority—and a known signer cannot break out of scope." />
      <div className="authority-summary">
        <section className="domain-card">
          <span>Domain</span><h2>Store 184 refrigeration</h2>
          <Fact label="Namespace" value={domain.domainInfo.namespace} mono />
          <Fact label="Domain ID" value={domain.domainInfo.domainId} mono />
          <Fact label="Domain hash" value={shortHash(domain.domainHash)} mono />
        </section>
        <div className="authority-cards">
          {Object.values(authorities).map(({ definition, record }) => (
            <article key={record.recordId}>
              <div className="authority-icon"><UserRoundCheck size={20} /></div>
              <span>{definition.label}</span><h3>{definition.operation}</h3>
              <p>{definition.resources.join(" · ")}</p>
              <dl><Fact label="Agent" value={shortHash(record.agentAddress)} mono /><Fact label="Record" value="Preview only; each event issues fresh bounded demo authority" /></dl>
            </article>
          ))}
        </div>
      </div>
      <div className="authority-path"><span>Vault</span><i /><span>Domain</span><i /><span>Agent authority</span><i /><span>Legitimacy</span><i /><span>Records</span><i /><span>Ledger</span></div>
    </section>
  );
}

function EvidenceView({ ledger, onRun }) {
  return (
    <section className="page-view">
      <PageHero eyebrow="Incident evidence" title="Admission and completion are separate evidence." body="The demo records command attempts and delivery interruptions. A completed simulation adds a separate receipt; admission alone does not prove completion. Local demo keys and browser storage are not independent or tamper-resistant evidence." />
      {ledger.length === 0 ? (
        <section className="large-empty"><DatabaseZap size={34} /><h2>No incident evidence yet</h2><p>Run one or more scenarios to build the local hash-linked evidence chain.</p><button type="button" onClick={onRun}>Open cold-chain run</button></section>
      ) : (
        <div className="evidence-table-wrap">
          <table className="evidence-table">
            <thead><tr><th>#</th><th>Scenario</th><th>Decision</th><th>Decision ID</th><th>Reason</th><th>Execution</th><th>Chain hash</th></tr></thead>
            <tbody>{ledger.map((entry) => <tr key={entry.entryHash}><td>{entry.sequence}</td><td>{entry.result.scenario.title}</td><td><StatusPill value={entry.result.decision} /></td><td className="mono">{entry.result.evidence.decisionId}</td><td>{entry.result.evidence.reasonCode}</td><td>{executionLabel(entry.result)}</td><td className="mono">{shortHash(entry.entryHash)}</td></tr>)}</tbody>
          </table>
        </div>
      )}
      <div className="evidence-limitations">
        <section className="evidence-boundary"><TriangleAlert size={21} /><div><strong>Command boundary</strong><p>A denied command proves the gateway rejected that submitted attempt. It cannot record a path that bypasses the gateway entirely.</p></div></section>
        <section className="evidence-boundary"><RadioTower size={21} /><div><strong>Observation boundary</strong><p>This chain records what arrived. It does not prove that an expected temperature reading arrived on schedule; silence and a quiet night remain indistinguishable here.</p></div></section>
        <section className="evidence-boundary"><UserRoundCheck size={21} /><div><strong>Hosted witness path</strong><p>The demo runs locally by default. In explicitly selected hosted mode, commands must be minted, registered and verified through AgentEnvelope before simulation. Completed receipts are submitted separately; reporting failure never re-executes a command. Configured witnessing and MIR processing remain backend concerns.</p></div></section>
      </div>
    </section>
  );
}

function SetupView({ hostedConfig, hostedState, hostedRoles, onHostedChange, onHostedSave, onHostedClear }) {
  const ingressPaths = [
    ["Internet", "Remote management"],
    ["Contractor", "Protected service access"],
    ["Provider", "Multi-store platform"],
  ];
  const stages = [
    ["01", "Harden the controller", "Remove public management exposure, update supported firmware, replace end-of-life equipment, and require protected remote access."],
    ["02", "Create the Domain", "Project the store refrigeration Domain from a locally held Vault root. Hosted services never receive the root or derived private seeds."],
    ["03", "Issue narrow authority", "Give each controller only the operation and resources it needs. Observation authority is not control authority."],
    ["04", "Verify before actuation", "Make the trusted gateway the controller’s only operational command path and fail closed when authority is missing or mismatched."],
    ["05", "Record decision and outcome", "Preserve signed decision evidence for every attempt and record execution separately after a permitted command completes."],
  ];
  return (
    <section className="page-view setup-view">
      <PageHero eyebrow="Deployment model" title="AgentEnvelope complements controller security." body="The demo models cryptographic command admission. It does not pretend to replace firmware maintenance, segmentation, firewalls, VPNs, physical safety controls or incident response." />
      <section className="threat-model">
        <div className="threat-copy">
          <span>Ingress-independent authority</span>
          <h2>Different routes. One command boundary.</h2>
          <p>The incident's initial access route has not been established publicly. Whatever upstream path carries a request, it must meet the same identity and authority check before actuation.</p>
        </div>
        <div className="ingress-map" aria-label="Possible command paths converging on the AgentEnvelope gateway">
          <div className="ingress-paths">
            {ingressPaths.map(([name, detail]) => <div key={name}><strong>{name}</strong><small>{detail}</small></div>)}
          </div>
          <ArrowRight size={24} />
          <div className="gateway-boundary"><LockKeyhole size={22} /><strong>AgentEnvelope gateway</strong><small>Verify · allow / deny · witness</small></div>
          <ArrowRight size={24} />
          <div className="controller-node"><ServerCog size={22} /><strong>Controller</strong><small>Operational actuation</small></div>
        </div>
        <p className="boundary-warning"><TriangleAlert size={18} /><span>The gateway must be the only operational command path. A route that actuates beneath or around it is outside the AgentEnvelope boundary.</span></p>
      </section>
      <div className="setup-grid">{stages.map(([number, title, body]) => <article key={number}><span>{number}</span><div><h2>{title}</h2><p>{body}</p></div></article>)}</div>
      <section className="hosted-setup">
        <div className="hosted-setup-heading">
          <div><span>Optional hosted demonstration</span><h2>Connect portal-created agents</h2><p>Offline mode is the default even with credentials configured. Select Hosted approval explicitly in the run controls to require online admission before execution. Credentials entered here are kept only for this browser session.</p></div>
          <a href="https://agentenvelope.io/agents" target="_blank" rel="noreferrer">Open Agent Authority</a>
        </div>
        <div className="hosted-config-grid">
          <label><span>API key</span><input type="password" value={hostedConfig.apiKey} onChange={(event) => onHostedChange({ apiKey: event.target.value })} placeholder="VITE_AE_API_KEY" /></label>
          <label><span>Owner user id</span><input value={hostedConfig.ownerUserId} onChange={(event) => onHostedChange({ ownerUserId: event.target.value })} placeholder="VITE_AE_OWNER_USER_ID" /></label>
        </div>
        <div className="hosted-role-list">
          {hostedRoles.map((role) => (
            <details key={role.id} className="hosted-role">
              <summary><span><strong>{role.label}</strong><small>{role.delegateId}</small></span><em>{role.validation.valid && role.botKeyReady && role.mintMaterialReady ? "ready" : "setup required"}</em></summary>
              <p>{role.scope}</p>
              {!role.validation.valid && <p className="hosted-role-warning">{role.validation.message}</p>}
              <div className="hosted-config-grid">
                <label><span>Bot key</span><input type="password" value={hostedConfig[`${role.id}BotKey`]} onChange={(event) => onHostedChange({ [`${role.id}BotKey`]: event.target.value })} placeholder={`VITE_AE_${role.id.toUpperCase()}_BOT_KEY`} /></label>
                <label><span>Mint material</span><input type="password" value={hostedConfig[`${role.id}MintMaterial`]} onChange={(event) => onHostedChange({ [`${role.id}MintMaterial`]: event.target.value })} placeholder={`VITE_AE_${role.id.toUpperCase()}_MINT_MATERIAL`} /></label>
              </div>
            </details>
          ))}
        </div>
        <div className="hosted-setup-footer">
          <p><strong>{hostedState.label}</strong><span>{hostedState.message}</span></p>
          <div><button type="button" onClick={onHostedClear}>Clear session</button><button className="primary" type="button" onClick={onHostedSave}>Save session</button></div>
        </div>
      </section>
      <section className="claim-box"><ShieldCheck size={26} /><div><span>The defensible claim</span><h2>Only commands carrying valid, scoped authority reach the simulated controller—and every submitted decision leaves cryptographic evidence.</h2></div></section>
    </section>
  );
}

function PageHero({ eyebrow, title, body }) {
  return <header className="page-hero"><span>{eyebrow}</span><h1>{title}</h1><p>{body}</p></header>;
}

function PanelHeading({ icon: Icon, eyebrow, title }) {
  return <div className="panel-heading"><Icon size={18} /><div><span>{eyebrow}</span><h2>{title}</h2></div></div>;
}

function Fact({ label, value, mono = false }) {
  return <div><dt>{label}</dt><dd className={mono ? "mono" : ""}>{value}</dd></div>;
}

function StatusPill({ value }) {
  return <span className={`status-pill ${value}`}>{value}</span>;
}

function shortHash(value) {
  if (!value) return "—";
  return value.length > 24 ? `${value.slice(0, 12)}…${value.slice(-8)}` : value;
}

function formatTemperature(value) {
  return Number(value).toFixed(1);
}

export default App;
