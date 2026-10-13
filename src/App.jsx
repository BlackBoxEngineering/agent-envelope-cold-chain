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
import { authorities, domain, runScenario, scenarios, witnessEntry } from "./coldChainAuthority.js";

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
  const [scenarioId, setScenarioId] = useState("normal");
  const [result, setResult] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [running, setRunning] = useState(false);
  const [temperature, setTemperature] = useState(4);
  const [phase, setPhase] = useState("paused");
  const timers = useRef(new Set());
  const temperatureTick = useRef(0);
  const scenario = scenarios.find((item) => item.id === scenarioId) ?? scenarios[0];

  function schedule(callback, delay) {
    const timer = window.setTimeout(() => {
      timers.current.delete(timer);
      callback();
    }, delay);
    timers.current.add(timer);
  }

  function clearScheduledWork() {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current.clear();
  }

  useEffect(() => () => clearScheduledWork(), []);

  useEffect(() => {
    if (!running || phase !== "monitoring") return undefined;
    const offsets = [0, 0.1, 0, -0.1, 0.2, 0, -0.2];
    const interval = window.setInterval(() => {
      setTemperature((current) => {
        if (current > 4.2) return Number(Math.max(4, current - 0.2).toFixed(1));
        if (current < 3.8) return Number(Math.min(4, current + 0.2).toFixed(1));
        temperatureTick.current = (temperatureTick.current + 1) % offsets.length;
        return Number((4 + offsets[temperatureTick.current]).toFixed(1));
      });
    }, 900);
    return () => window.clearInterval(interval);
  }, [running, phase]);

  function changeView(next) {
    if (!viewIds.has(next)) return;
    setView(next);
    window.localStorage.setItem(VIEW_KEY, next);
    const url = new URL(window.location.href);
    url.searchParams.set("view", next);
    window.history.replaceState({}, "", url);
  }

  function selectScenario(nextId) {
    if (!running || phase !== "monitoring") return;
    setScenarioId(nextId);
    execute(nextId);
  }

  function execute(nextScenarioId = scenarioId) {
    if (!running || phase === "verifying" || phase === "recovering") return;
    const selected = scenarios.find((item) => item.id === nextScenarioId) ?? scenarios[0];
    if (selected.id !== "attack") setTemperature(selected.initialTemperature);
    setPhase("verifying");
    schedule(() => {
      const next = runScenario(selected.id);
      setResult(next);
      appendToLedger(next);
      if (next.decision === "denied") {
        setPhase("denied");
        schedule(() => setPhase("monitoring"), 1800);
        return;
      }

      setTemperature(next.temperature);
      setPhase("allowed");
      if (selected.id === "compressor") {
        schedule(() => {
          setPhase("recovering");
          setScenarioId("authorised-recovery");
          schedule(() => {
            const recovery = runScenario("authorised-recovery");
            setResult(recovery);
            setTemperature(recovery.temperature);
            appendToLedger(recovery);
            setPhase("allowed");
            schedule(() => setPhase("monitoring"), 1800);
          }, 1200);
        }, 1200);
      } else {
        schedule(() => setPhase("monitoring"), 1800);
      }
    }, 700);
  }

  function appendToLedger(next) {
    setLedger((current) => {
      const previousHash = current.at(0)?.entryHash ?? null;
      const entry = witnessEntry(next, previousHash, current.length + 1);
      return [{ ...entry, result: next }, ...current];
    });
  }

  function reset() {
    clearScheduledWork();
    setScenarioId("normal");
    setResult(null);
    setLedger([]);
    setRunning(false);
    setTemperature(4);
    setPhase("paused");
  }

  function startSystem() {
    setRunning(true);
    setTemperature(4);
    setPhase("monitoring");
  }

  return (
    <main className="app-shell">
      <Toolbar view={view} running={running} onViewChange={changeView} onReset={reset} />
      {view === "run" && (
        <RunWorkspace
          scenario={scenario}
          scenarioId={scenarioId}
          result={result}
          ledger={ledger}
          running={running}
          temperature={temperature}
          phase={phase}
          onStart={startSystem}
          onSelectScenario={selectScenario}
        />
      )}
      {view === "authority" && <AuthorityView />}
      {view === "evidence" && <EvidenceView ledger={ledger} onRun={() => changeView("run")} />}
      {view === "setup" && <SetupView />}
      <footer>
        <span>AgentEnvelope Cold Chain</span>
        <span className="footer-separator">•</span>
        <span>Deterministic authority admission and tamper-evident evidence</span>
      </footer>
    </main>
  );
}

function Toolbar({ view, running, onViewChange, onReset }) {
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
        <span className={`live-state ${running ? "running" : "paused"}`}><i />{running ? "Live" : "Stopped"}</span>
        <button className="reset-button" type="button" onClick={onReset}><RotateCcw size={16} /> Reset</button>
      </div>
    </header>
  );
}

function RunWorkspace({ scenario, scenarioId, result, ledger, running, temperature, phase, onStart, onSelectScenario }) {
  const busy = running && phase !== "monitoring";
  return (
    <section className="workspace">
      <aside className="side-panel left-panel">
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
            {scenario.command.value !== null && <Fact label="Requested value" value={`${scenario.command.value}°C`} />}
          </dl>
          <p>{scenario.summary}</p>
          {!running ? (
            <button className="run-button" type="button" onClick={onStart}>
              <Play size={18} fill="currentColor" /> Start system
            </button>
          ) : (
            <div className={`system-running-note ${busy ? "busy" : ""}`}>
              <Activity size={17} />{busy ? "Event in progress…" : "System live — select an event above"}
            </div>
          )}
        </section>

        <details className="panel boundary-panel">
          <summary><LockKeyhole size={17} /> Enforcement boundary <ChevronDown size={16} /></summary>
          <p>The simulated controller accepts commands only through this verifier. Network isolation, patched firmware and protected management access remain required.</p>
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
      </aside>
    </section>
  );
}

function AuthorityFlow({ result, phase, running }) {
  const allowed = result?.decision === "allowed";
  const denied = result?.decision === "denied";
  const verifying = phase === "verifying" || phase === "recovering";
  const steps = [
    [Fingerprint, "Identity", verifying ? "checking" : result ? (result.verification.valid ? "verified" : "failed") : "waiting"],
    [KeyRound, "Authority", verifying ? "checking" : result ? (result.record ? "found" : "missing") : "waiting"],
    [ShieldCheck, "Scope", verifying ? "checking" : result ? (result.scope.valid ? "matched" : "denied") : "waiting"],
    [ClipboardCheck, "Evidence", verifying ? "preparing" : result ? "recorded" : "waiting"],
  ];
  const headline = !running ? "System paused" : verifying ? (phase === "recovering" ? "Authorising recovery" : "Verifying command") : result ? (allowed ? "Allowed" : "Denied") : "Gateway ready";
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
  const denied = phase === "denied";
  const allowed = phase === "allowed";
  const verifying = phase === "verifying";
  const recovering = phase === "recovering";
  const severity = temperature > 8 ? "danger" : temperature > 5 ? "warning" : "safe";
  const stateLabel = !running ? "System paused" : verifying ? "Evaluating command" : recovering ? "Authorised recovery" : denied ? "Command isolated" : allowed ? "Command admitted" : "Refrigeration active";
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
          <span>Measured temperature</span>
          <div className="temperature-track"><i style={{ height: `${Math.min(100, Math.max(8, (temperature + 25) * 1.35))}%` }} /></div>
        </div>
        <div className="cabinet-bank">
          {["Chilled A", "Chilled B", "Chilled C"].map((label, index) => (
            <div className="cabinet" key={label}>
              <div className="cabinet-glass"><Snowflake size={22} /><span>{formatTemperature(cabinetTemperatures[index])}°</span></div>
              <strong>{label}</strong><small>{index === 2 ? "Command target" : "Live sensor"}</small>
            </div>
          ))}
        </div>
        <div className="controller-rack">
          <div className="rack-title"><ServerCog size={20} /><span>Trusted gateway</span></div>
          <div className={`gateway-light ${denied ? "red" : allowed ? "green" : "amber"}`} />
          <dl>
            <Fact label="Mode" value={!running ? "Paused" : denied ? "Fail closed" : recovering ? "Recovery admission" : verifying ? "Checking authority" : allowed ? "Executing" : "Admission guard"} />
            <Fact label="Compressor" value={recovering ? "Recovery requested" : scenario.id === "compressor" && phase !== "monitoring" ? "Fault detected" : "Online"} />
            <Fact label="Defrost" value={result?.scenario.id === "attack" && denied ? "Malicious request blocked" : "Scheduled only"} />
          </dl>
        </div>
      </div>
      <div className={`command-strip ${denied ? "denied" : allowed ? "allowed" : ""}`}>
        {denied ? <CircleOff size={19} /> : allowed ? <Check size={19} /> : <RadioTower size={19} />}
        <div>
          <strong>{verifying ? "authority.verification_in_progress" : recovering ? "recovery.authority_requested" : result ? result.evidence.reasonCode : "Gateway ready"}</strong>
          <span>{verifying ? "Checking signer, public authority record, operation and resource scope." : recovering ? "The site-engineer restoration is being verified as a separate command." : result ? result.evidence.reason : "The refrigeration loop is live. Choose an event to submit a command."}</span>
        </div>
      </div>
    </section>
  );
}

function DecisionTimeline({ ledger }) {
  return (
    <section className="timeline-panel">
      <div className="timeline-heading"><div><span>Witness chain</span><h2>Decision timeline</h2></div><strong>{ledger.length} entries</strong></div>
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
      <p>{phase === "recovering" ? "A separately scoped site-engineer command must pass admission before the safe setpoint can be restored." : "The gateway is checking cryptographic identity, the public authority record and exact command scope."}</p>
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
      <PanelHeading icon={allowed ? CheckCircle2 : XCircle} eyebrow="Admission decision" title={allowed ? "Allowed" : "Denied"} />
      <div className="decision-id"><span>Decision ID</span><strong>{result.evidence.decisionId}</strong></div>
      <p>{result.evidence.reason}</p>
      <div className="execution-state">
        <span>Execution</span>
        <strong>{result.outcome ? "Completed in simulator" : "Not attempted"}</strong>
      </div>
    </section>
  );
}

function ChecksPanel({ result, phase }) {
  const checks = phase === "verifying" || phase === "recovering" ? null : result?.evidence.checks;
  const rows = [
    ["Identity signature", checks?.identity],
    ["Public authority record", checks?.authority],
    ["Operation and resource scope", checks?.operationScope],
    ["Current legitimacy reference", checks?.legitimacy],
  ];
  return (
    <section className="panel checks-panel">
      <PanelHeading icon={ShieldCheck} eyebrow="Verification" title="Authority checks" />
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
          <Fact label="Witness signer" value={shortHash(result.evidence.evidenceSigner)} mono />
          <Fact label="Outcome" value={result.outcome ? shortHash(result.outcome.outcomeHash) : "None — denied before execution"} mono={Boolean(result.outcome)} />
        </dl>
      )}
    </details>
  );
}

function AuthorityView() {
  return (
    <section className="page-view">
      <PageHero eyebrow="Sovereign authority" title="One Domain. Four deliberately separate authorities." body="The monitoring service can observe and alert. Maintenance can dispatch. Only the site engineer controller can restore the safe setpoint. Knowing the right value never grants control authority." />
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
              <dl><Fact label="Agent" value={shortHash(record.agentAddress)} mono /><Fact label="Record" value={record.recordId} mono /></dl>
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
      <PageHero eyebrow="Incident evidence" title="A decision trail, not an editable story." body="Every command submitted through the trusted gateway creates signed decision evidence. Allowed commands add a separate simulator outcome, keeping admission distinct from execution." />
      {ledger.length === 0 ? (
        <section className="large-empty"><DatabaseZap size={34} /><h2>No incident evidence yet</h2><p>Run one or more scenarios to build the local witness chain.</p><button type="button" onClick={onRun}>Open cold-chain run</button></section>
      ) : (
        <div className="evidence-table-wrap">
          <table className="evidence-table">
            <thead><tr><th>#</th><th>Scenario</th><th>Decision</th><th>Decision ID</th><th>Reason</th><th>Execution</th><th>Chain hash</th></tr></thead>
            <tbody>{ledger.map((entry) => <tr key={entry.entryHash}><td>{entry.sequence}</td><td>{entry.result.scenario.title}</td><td><StatusPill value={entry.result.decision} /></td><td className="mono">{entry.result.evidence.decisionId}</td><td>{entry.result.evidence.reasonCode}</td><td>{entry.result.outcome ? "completed" : "not attempted"}</td><td className="mono">{shortHash(entry.entryHash)}</td></tr>)}</tbody>
          </table>
        </div>
      )}
      <section className="evidence-boundary"><TriangleAlert size={21} /><div><strong>Evidence boundary</strong><p>A denied command proves the gateway rejected that submitted attempt. It cannot record a path that bypasses the gateway entirely. The controller must make verified admission its only command path.</p></div></section>
    </section>
  );
}

function SetupView() {
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
      <div className="setup-grid">{stages.map(([number, title, body]) => <article key={number}><span>{number}</span><div><h2>{title}</h2><p>{body}</p></div></article>)}</div>
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
