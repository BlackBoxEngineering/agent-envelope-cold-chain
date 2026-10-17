# AgentEnvelope Cold Chain

A client-execution simulator for AgentEnvelope refrigeration authority. It defaults to offline SDK verification plus explicit local execution policy. Optional hosted mode requires mint, registration and verification approval **before** the simulated effect. This is a test harness, not a production refrigeration controller.

> **Stop the command. Preserve the evidence. End the blame game.**

## The problem

During the night of 11–12 October 2026, attackers remotely changed refrigeration settings across French supermarkets. Forced defrost cycles reportedly pushed some systems towards 50°C, spoiled stock and damaged equipment. On 13 October, the French government said approximately 700 supermarkets had been affected.

Reporting connected some affected stores to older Danfoss control software. CERT-FR's alert is broader: it identifies compromises involving remotely managed Danfoss AK-SM and AK-SC controllers, Copeland xweb and Dixell xweb systems, and warns against exposing management interfaces directly to the Internet. Le Monde reported that attackers extended some defrost cycles from one hour to eight hours to delay alarms.

Sources: [CERT-FR](https://www.cert.ssi.gouv.fr/alerte/CERTFR-2026-ALE-012/), [Le Monde](https://www.lemonde.fr/en/economy/article/2026/10/13/a-disastrous-day-for-french-supermarkets-after-massive-cyberattack-targets-refrigeration-systems_6758535_19.html), [BleepingComputer](https://www.bleepingcomputer.com/news/security/cyberattack-shuts-down-refrigerators-at-french-supermarkets/), [Associated Press](https://apnews.com/article/france-cyberattack-supermarkets-refrigeration-systems-78a813a8efd466b360655339f96083dc).

The refrigeration system already knows how to cool food. The security question is:

> **Who is allowed to issue an operational command?**

## Attack path and authority boundary

The initial intrusion method has not been established publicly. Internet-exposed management, a contractor connection or a shared service-provider path are plausible architectures, not confirmed explanations for this incident.

```text
Internet management ──────┐
Contractor access ────────┼──> AgentEnvelope gateway ──> Controller ──> Fridges
Service-provider platform ┘          allow / deny
```

The ingress route does not change the authority question at the gateway: does the signer hold valid, current and correctly scoped authority for this command?

That claim has a strict boundary. The AgentEnvelope gateway must be the controller's only operational command path. An exploit that can actuate the equipment beneath or around that gateway cannot be admitted, denied or evidenced by AgentEnvelope.

Supported firmware, removal of direct Internet exposure and protected remote access are therefore part of the argument, not a footnote. AgentEnvelope governs the commands that cross its verification boundary; it does not repair an end-of-life controller or secure a bypass around that boundary.

## No central authority issuer

The Vault is the sovereign identity spine. Authority is derived cryptographically:

```text
Vault -> Domain -> Agent authority -> Action Envelope -> Signed command
```

There is no central issuer of derived authority. The portal provides the operational surface, while authority remains rooted in the locally controlled Vault and the AgentEnvelope SDK.

The hosted service can verify, govern, record and witness authority. It cannot independently create sovereign authority or reconstruct the private derivation path.

## Simulated and hosted command flow

The local issuer uses public deterministic demo keys, but creates a distinct command ID and a fresh, finite `BOTH` envelope for each new event. Each capability declares `maxUses: 1`. The client persists and serializes consumption; the SDK verifier does not spend that allowance. Offline issuance is an unrestricted demo fixture, not enforcement of a shared hosted `maxMints` budget.

For the optional hosted path, use the portal to create the cold-chain Domain and three runtime delegates:

- **Temperature monitor** — may read temperatures and alert an engineer.
- **Maintenance dispatch** — may dispatch an approved refrigeration contractor.
- **Site engineer controller** — may restore the exact safe setpoint or run the exact one-hour defrost schedule through separately scoped authorities.

Each runtime delegate is bounded by its signed operations, resources, action-index range, mint limits, time window and required legitimacy reference. The browser receives only the signed handoff, runtime bot key and one-time mint material; it never receives the Vault root or Domain seed.

Select **Hosted approval required** explicitly; entering credentials alone does not enable it. For each locally eligible command, the demonstration:

1. Builds and signs one `MintRequest` against the matching portal delegate, preserving the original command's expiry and intersecting its dates with the delegate window.
2. Derives the public action record and signed command locally. Persists their exact request/nonce and record before making any network call. Private derivability is not proof of hosted admission.
3. Requires a matching approval from `/sovereign/mint`, then accepted registration from `/sovereign/agents/register-delegated`.
4. Requires a valid report from `/sovereign/verify`; rechecks local authority, expiry, scope, legitimacy and remaining uses after the asynchronous calls.
5. Persists an execution reservation before applying the simulated effect. A reserved but unresolved attempt is never automatically replayed or refunded.
6. Saves a separate signed simulator completion receipt. Only then signs and submits `agentenvelope.executionOutcome` through `/sovereign/outcomes`.
7. Displays the returned reporting status without calling `accepted: true` a witness proof. Witness/MIR behaviour remains conditional on backend configuration and returned evidence.

Mint, registration or verification rejection blocks execution. A reporting failure **after** execution leaves a completed command with a pending report. Retrying the report does not execute, mint, or refresh the command's time window.

If a mint response is lost, the identical persisted request can be retried. A duplicate-nonce response is not treated as approval; the demo stays blocked. The current API does not provide recovery of the original mint-approval receipt. Issuing a fresh nonce would consume another mint, so this harness never does that automatically.

The demo does not mint a hosted capability for a command that already failed local identity or exact-scope admission. Those denied attempts remain in its local signed decision evidence and hash-linked incident sequence. The hosted verifier itself can record a denied verification when a registered record is found but its submitted action fails verification; that is a different boundary from an unknown or locally rejected command.

API keys provide access to the hosted service. They are not authority.

## Live demonstration

Press **Start system**, choose a mode and optional break point in **Execution and recovery lab**, then select an operational event. Selecting an event explicitly loads its incident temperature and issues a new command; it is not passive sensor monitoring. There is no background cooling or automatic repair timer. Dispatching a contractor does not restore refrigeration; **Authorised recovery** is a separate, explicitly issued control command.

The SDK checks the signed record and time window. The cold-chain client binds the actual operation, store, zone, value and unit to the signed envelope instead of trusting caller-supplied resource labels. It separately checks a current, versioned local legitimacy policy and remaining uses. **Suspend local legitimacy** changes this local policy only; it does not revoke hosted records or update portal legitimacy. Hosted mode additionally requires the backend's current verification decision.

### Restart and receipt experiments

| Break point | Stored condition | Safe next step |
| --- | --- | --- |
| Before read | Queued, no admission checks or use reservation | Reload, start, run the same selected command if still eligible |
| After read | Received, not started | Recheck current rules and run the same command |
| After reservation / before effect | Reserved, outcome uncertain after interruption | Halt the zone and investigate; no automatic refund or retry |
| After effect / before receipt saved | Effect happened in the simulator, no durable completion receipt | Halt the zone; absence of a receipt is not proof of non-execution |
| After receipt saved / reply lost | Completed, caller missing receipt | Retrieve the saved receipt; never execute again |

Use the five-second validity option to demonstrate expiry during downtime. Changing the controls affects new commands only, not the selected stored command. A completed command remains consumed after reload. Receipt retrieval is historical and works after authority expiry; it grants no new execution permission. Hosted reporting can still fail after expiry or a legitimacy change because the existing backend validates the report against current authority. The local receipt remains available; this demo does not change that API behaviour.

Commands, use reservations, receipts and the local evidence chain survive reload in `localStorage`. Web Locks serialize same-origin tabs. Unsupported locks, corrupt storage and failed reservation writes block execution. An unresolved attempt blocks new work for this demo zone. **Reset** explicitly clears the local sandbox only; it does not revoke existing hosted capabilities, refund budgets or reconcile a real device.

This is deliberately a browser simulation: storage is editable/clearable, keys are demo or browser-held credentials, devices/origins do not share counters, and no physically atomic effect-plus-receipt guarantee is claimed. Production needs trusted device/service custody, durable consumption state shared by all relevant executors, and an operational reconciliation process for uncertain effects.

## Evidence, not arguments

Every command submitted through the simulated trusted gateway produces locally signed decision evidence containing:

- the command hash;
- the signer address;
- the matching public authority record;
- the Action Envelope hash;
- the client scope, current local legitimacy and remaining-use checks;
- the allow, deny, pause or receipt-retrieval reason; and
- the decision time.

The simulator then wraps each decision and optional outcome hash in a separate local hash-linked sequence entry containing the preceding entry hash. The decision signature and the sequence link are deliberately not described as the same object.

Only completed simulations add a separately signed execution outcome. An admitted command can still stop before completion. A refused duplicate may refer to an earlier completed effect; rejection does not erase history. A pre-read interruption is recorded by the harness with admission checks explicitly left unperformed.

```text
Command attempt
      |
      v
Authority verification
      |
      v
Signed allow / deny decision
      |
      +------ denied ------> no execution
      |
      +------ allowed -----> controller execution
                                  |
                                  v
                         signed execution outcome
```

The resulting evidence distinguishes:

- who submitted the command;
- which authority it carried;
- why it was accepted or rejected;
- whether the simulator has a stored completion receipt (unknown is a separate state); and
- whether links within the exported sequence remain intact.

The local simulator signs its own decisions with public demo keys. Its hash chain demonstrates linking, not independent authenticity, tamper-resistant custody or proof of physical execution. No hosted service is called unless hosted mode is explicitly selected. In that mode the backend attempts its configured verification and completion witness appends; whether AILeash or MIR is enabled is account and backend configuration, not a claim the browser can make by itself.

Those roles are deliberately separate. MIR does not custody the AgentEnvelope head, and an authority check alone sends nothing to MIR. Locally denied attempts remain in this demo's local evidence sequence. MIR receives only completed outcomes submitted to `/sovereign/outcomes`, and only when the backend MIR integration is enabled. The current AgentEnvelope verifier does not use MIR history as an admission-time behaviour signal.

The chain also records only what arrived. It does not prove that a temperature reading expected every minute actually arrived. A six-hour monitoring silence and a genuinely quiet six hours are indistinguishable without a separate, implemented record of observations due.

## Demo scenarios

- **Normal alert:** authorised monitoring raises an engineer alert.
- **Compressor fault:** bounded maintenance authority dispatches the approved contractor.
- **50°C attack:** an unknown signer attempts forced high-temperature defrost. The command is denied and added to the local evidence chain.
- **Correct, no authority:** a read-only monitor proposes the correct 4°C value but cannot issue a control command.
- **Authorised recovery:** the site engineer restores the safe setpoint; admission and completion are recorded separately.
- **Scope breakout attempt:** a known site-engineer signer requests an eight-hour defrost cycle while presenting the permitted one-hour resource label. The client projects the actual value to `duration:8h`, which does not match its immutable `duration:1h` Action Envelope. SDK signature verification passes, but the client scope adapter denies execution.

```text
Knowledge ≠ Authority
```

## Run locally

```bash
npm install
npm run dev
```

```bash
npm run build
npm test
npm run test:smoke
```

Unit tests exercise the real SDK and local executor. Browser tests mock hosted responses and block external traffic; they are not deployed-backend tests. Playwright uses the installed Edge browser on Windows (see `playwright.config.js`).

## Connect the hosted portal

The hosted path uses a portal Vault, one cold-chain Domain and three bounded runtime delegates. The Vault root and Domain seed never enter this repository.

### 1. Create or open your Vault

1. Sign in to [AgentEnvelope](https://agentenvelope.io/) and open **Dashboard**.
2. Under **Your Vault**, create an encrypted Vault if the account does not already have one.
3. Keep the Vault passphrase safe. You need it in the portal to sign the Domain and each `MintDelegate`; the hosted service does not receive the Vault root.
4. Confirm that the Vault is shown as **Encrypted** before continuing.

An existing Vault can be reused. Do not create a new Vault merely to rerun the demo.

### 2. Create the cold-chain Domain

Open **Workspace -> Domains**, choose **Create Domain**, and enter:

| Field | Value |
| --- | --- |
| Namespace | `cold-chain` |
| Domain ID | `refrigeration-control` |
| Kind | `infrastructure` |

This produces the authority branch used by every runtime in the demonstration. Open the Domain once it has been created and confirm that the heading reads `cold-chain / refrigeration-control / infrastructure`.

### 3. Create the runtime delegates

Open **Workspace -> Agent Authority**, select the `cold-chain / refrigeration-control / infrastructure` Domain, and choose **Add delegate**. Create all three delegates with the following common settings:

| Setting | Value |
| --- | --- |
| Bot policy | `any-signed-bot` |
| Max mints | `500` |
| Max uses per action | `1` |
| Action index min | `0` |
| Action index max | `1000` |
| Delegate expiry | A future date covering the intended demonstration period |
| Create legitimacy state for this delegate | Enabled |

Use these exact names and boundaries:

| Delegate name | Allowed operations | Allowed resources |
| --- | --- | --- |
| `Temperature monitor` | `alert_engineer`, `read_temperature` | `store:184`, `zone:chilled-03` |
| `Maintenance dispatch` | `dispatch_contractor` | `contractor:approved-refrigeration`, `store:184`, `zone:chilled-03` |
| `Site engineer controller` | `restore_safe_temperature`, `run_scheduled_defrost` | `setpoint:4c`, `duration:1h`, `store:184`, `zone:chilled-03` |

Enter the Vault passphrase and choose **Sign MintDelegate** for each one. Enabling the legitimacy option creates the neutral hosted legitimacy state used during mint and verification; the cold-chain application still defines the refrigeration-specific safety meaning of the operations and resources.

### 4. Save each worker handoff

After signing a delegate, copy its **handoff JSON** into the matching file and copy the displayed **mint material** immediately:

| Delegate | Handoff file | Mint-material variable |
| --- | --- | --- |
| Temperature monitor | `mint-delegate.monitor.json` | `VITE_AE_MONITOR_MINT_MATERIAL` |
| Maintenance dispatch | `mint-delegate.dispatch.json` | `VITE_AE_DISPATCH_MINT_MATERIAL` |
| Site engineer controller | `mint-delegate.engineer.json` | `VITE_AE_ENGINEER_MINT_MATERIAL` |

The portal displays mint material only as part of the signing handoff; it cannot recover it later without unlocking the Vault again. Draft 00 derives this material from the Vault identity root and Domain hash, so delegates in the same Domain can display the same value. Keep separate environment-variable slots because these are separate runtime deployments. The delegate and mint request are incorporated later when the SDK derives each action seed, so their action capabilities remain distinct.

### 5. Configure the three workers

Generate a different 32-byte bot key for each runtime. The portal does not create or retain worker private keys:

```bash
node --input-type=module -e "import { randomBytes } from 'node:crypto'; console.log('0x' + randomBytes(32).toString('hex'))"
```

Run that command three times, then copy `.env.example` to `.env.local` and populate:

```dotenv
VITE_AE_API_BASE=https://jemdjwteae.execute-api.us-east-1.amazonaws.com/v1
VITE_AE_API_KEY=<hosted API key>
VITE_AE_OWNER_USER_ID=<portal account owner user id>

VITE_AE_MONITOR_BOT_KEY=<temperature-monitor bot key>
VITE_AE_MONITOR_MINT_MATERIAL=<temperature-monitor mint material>

VITE_AE_DISPATCH_BOT_KEY=<maintenance-dispatch bot key>
VITE_AE_DISPATCH_MINT_MATERIAL=<maintenance-dispatch mint material>

VITE_AE_ENGINEER_BOT_KEY=<site-engineer bot key>
VITE_AE_ENGINEER_MINT_MATERIAL=<site-engineer mint material>
```

The hosted API key and owner user id come from the same AgentEnvelope account that owns the Domain and delegates. As an alternative to `.env.local`, enter these values in the demonstration's **Setup guide**; that form stores them only in browser `sessionStorage`.

### 6. Run and confirm the connection

Restart the Vite server after changing environment variables or handoff files:

```bash
npm run dev
```

Check the setup's role readiness, then explicitly select **Hosted approval required** in the run controls. Run one allowed scenario and confirm that mint, registration and verification succeed before the simulator acts. The **Portal records** panel then shows whether the completion report was accepted or remains pending. Locally denied identity or scope tests intentionally remain in the simulator's incident evidence and do not mint hosted authority. Real hosted runs consume the delegate's mint budget; use a dedicated test account and bounded test delegates.

`VITE_` values are visible to browser code. This is intentional for a demonstration handoff and is not a production secret-custody design. A production refrigeration gateway should store runtime secrets in its trusted service or device boundary and call the same API routes from there. Never commit a populated `.env.local`, bot keys or mint material.
