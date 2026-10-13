# AgentEnvelope Cold Chain

A simulated hosted AgentEnvelope demonstration of sovereign derived authority for connected refrigeration systems. It runs locally by default and can be connected to the real hosted mint, record, verification and completed-outcome routes with portal-created delegates.

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

The local simulator contains deterministic demonstration authority so every scenario works without an account or network connection. For the optional hosted path, use the portal to create the cold-chain Domain and three runtime delegates:

- **Temperature monitor** — may read temperatures and alert an engineer.
- **Maintenance dispatch** — may dispatch an approved refrigeration contractor.
- **Site engineer controller** — may restore the exact safe setpoint or run the exact one-hour defrost schedule through separately scoped authorities.

Each runtime delegate is bounded by its signed operations, resources, action-index range, mint limits, time window and required legitimacy reference. The browser receives only the signed handoff, runtime bot key and one-time mint material; it never receives the Vault root or Domain seed.

For each locally allowed action, the connected demonstration then:

1. Builds and signs a `MintRequest` against the matching portal delegate.
2. Calls `/sovereign/mint`, where hosted governance checks delegate signature, scope, replay, mint limits and current legitimacy.
3. Derives the one-use action capability locally from the handoff material.
4. Registers a seedless `PublicActionRecord` through `/sovereign/agents/register-delegated`.
5. Signs the cold-chain command with the derived action seed and verifies it through `/sovereign/verify`.
6. Signs a separate `agentenvelope.executionOutcome` after the simulated action completes and submits it through `/sovereign/outcomes`.
7. The backend attempts the configured AgentEnvelope witness append for verification and completion. When enabled for that account, external witness and MIR processing happen behind the API.

The demo does not mint a hosted capability for a command that already failed local identity or exact-scope admission. Those denied attempts remain in its local signed decision evidence and hash-linked incident sequence. The hosted verifier itself can record a denied verification when a registered record is found but its submitted action fails verification; that is a different boundary from an unknown or locally rejected command.

API keys provide access to the hosted service. They are not authority.

## Live demonstration

Press **Start system** to bring the refrigeration loop online and continuously report the temperature of Chilled Zone 03. Once it is live, each operational event is itself the trigger: select a compressor fault, an unauthorised 50°C defrost attempt or a legitimate command and watch the system respond without a second submission step.

Each request pauses at the AgentEnvelope gateway while its signature, public authority record and exact Action Envelope scope are checked; the demo also shows whether a legitimacy reference is present. The cold-chain integration canonically projects safety-relevant values into resources instead of trusting caller-supplied labels. AgentEnvelope admission then requires an exact match with the immutable Action Envelope. Rejected commands never reach the controller, but still leave signed decision evidence. A compressor fault progresses into a separately authorised site-engineer recovery, so the viewer can watch the safe setpoint return and see both decisions added to the linked evidence trail.

## Evidence, not arguments

Every command submitted through the simulated trusted gateway produces locally signed decision evidence containing:

- the command hash;
- the signer address;
- the matching public authority record;
- the Action Envelope hash;
- the scope decision and legitimacy reference;
- the allow or deny reason; and
- the decision time.

The simulator then wraps each decision and optional outcome hash in a separate local hash-linked sequence entry containing the preceding entry hash. The decision signature and the sequence link are deliberately not described as the same object.

Allowed commands add a separately signed execution outcome. Denied commands record that execution was not attempted.

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
- whether the controller executed it; and
- whether links within the exported sequence remain intact.

The local simulator signs its own decisions with deterministic demo keys and does not call hosted services until valid portal handoffs and credentials are configured. Once connected, an allowed simulator action also follows the real hosted mint, delegated registration, verification and execution-outcome routes. The backend attempts its configured verification and completion witness appends; whether AILeash or MIR is enabled is account and backend configuration, not a claim the browser can make by itself.

Those roles are deliberately separate. MIR does not custody the AgentEnvelope head, and an authority check alone sends nothing to MIR. Locally denied attempts remain in this demo's local evidence sequence. MIR receives only completed outcomes submitted to `/sovereign/outcomes`, and only when the backend MIR integration is enabled. The current AgentEnvelope verifier does not use MIR history as an admission-time behaviour signal.

The chain also records only what arrived. It does not prove that a temperature reading expected every minute actually arrived. A six-hour monitoring silence and a genuinely quiet six hours are indistinguishable without a separate, implemented record of observations due.

## Demo scenarios

- **Normal alert:** authorised monitoring raises an engineer alert.
- **Compressor fault:** bounded maintenance authority dispatches the approved contractor.
- **50°C attack:** an unknown signer attempts forced high-temperature defrost. The command is denied and added to the local evidence chain.
- **Correct, no authority:** a read-only monitor proposes the correct 4°C value but cannot issue a control command.
- **Authorised recovery:** the site engineer restores the safe setpoint; admission and completion are recorded separately.
- **Scope breakout attempt:** a known site-engineer signer requests an eight-hour defrost cycle while presenting the permitted one-hour resource label. The command projects to `duration:8h`, which does not match its immutable `duration:1h` Action Envelope. AgentEnvelope accepts the identity and signature but denies the out-of-scope command; execution is recorded as not attempted.

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
npm run test:smoke
```

## Connect the hosted portal

1. In AgentEnvelope, create or open the refrigeration Domain used for this demo.
2. Create these three runtime delegates on **Agent Authority**:

   - **Temperature monitor**: operations `alert_engineer`, `read_temperature`; resources `store:184`, `zone:chilled-03`.
   - **Maintenance dispatch**: operation `dispatch_contractor`; resources `contractor:approved-refrigeration`, `store:184`, `zone:chilled-03`.
   - **Site engineer controller**: operations `restore_safe_temperature`, `run_scheduled_defrost`; resources `setpoint:4c`, `duration:1h`, `store:184`, `zone:chilled-03`.

3. Attach a required legitimacy reference to each delegate and choose an action-index range large enough for repeated demonstration runs.
4. Replace these placeholder files with the downloaded portal handoff JSON:

   - `mint-delegate.monitor.json`
   - `mint-delegate.dispatch.json`
   - `mint-delegate.engineer.json`

5. Copy each delegate's one-time mint material before leaving the portal. The portal does not retain it for later display.
6. Generate a separate 32-byte worker bot key for each role. The portal does not supply worker private keys. For this demonstration's `any-signed-bot` policy, one can be generated with `node --input-type=module -e "import { randomBytes } from 'node:crypto'; console.log(randomBytes(32).toString('hex'))"`.
7. Copy `.env.example` to `.env.local` and add the hosted API key, owner user id, three bot keys and three mint-material values. Alternatively, enter them in **Setup guide**; that form stores them only in browser `sessionStorage`.
8. Restart the Vite server after changing environment variables or handoff files. The **Portal records** panel changes to `ready`; allowed actions then publish automatically.

`VITE_` values are visible to browser code. This is intentional for a demonstration handoff and is not a production secret-custody design. A production refrigeration gateway should store runtime secrets in its trusted service or device boundary and call the same API routes from there. Never commit populated `.env.local` or handoff secret values.
