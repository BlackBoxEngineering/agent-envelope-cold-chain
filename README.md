# AgentEnvelope Cold Chain

A hosted demonstration of sovereign derived authority for connected refrigeration systems.

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

## Hosted command flow

The portal is used to create the cold-chain Domain and its Agent authorities:

- **Temperature monitor** — may read temperatures and alert an engineer.
- **Maintenance dispatch** — may dispatch an approved refrigeration contractor.
- **Site engineer controller** — may restore a safe setpoint or change defrost duration through separately scoped authorities.

Each Agent authority is bounded by its signed operation, resources, action limits and legitimacy reference.

At runtime:

1. The machine presents its signed delegated request.
2. Hosted governance checks the delegate, request signature, scope, replay, limits and current legitimacy.
3. The machine derives its capability locally.
4. A seedless `PublicActionRecord` is registered for verification.
5. The signed command is checked against that record and its immutable `ActionEnvelope`.
6. An allowed command reaches the trusted controller gateway; a denied command does not.
7. The hosted backend appends the allow or deny decision to the AgentEnvelope witness chain.
8. A completed action produces a separately signed execution outcome and its own witness block.
9. When configured, AILeash retains the AgentEnvelope public head as an external custody witness. MIR receives opaque completed-action events and publishes a checkpoint chain that AgentEnvelope independently verifies.

API keys provide access to the hosted service. They are not authority.

## Live demonstration

Press **Start system** to bring the refrigeration loop online and continuously report the temperature of Chilled Zone 03. Once it is live, each operational event is itself the trigger: select a compressor fault, an unauthorised 50°C defrost attempt or a legitimate command and watch the system respond without a second submission step.

Each request pauses at the trusted gateway while its signature, public authority record and operation/resource scope are checked; the demo also shows whether a legitimacy reference is present. Rejected commands never reach the controller, but still leave signed decision evidence. A compressor fault progresses into a separately authorised site-engineer recovery, so the viewer can watch the safe setpoint return and see both decisions added to the linked evidence trail.

## Evidence, not arguments

Every command submitted through the trusted gateway produces locally signed decision evidence containing:

- the command hash;
- the signer address;
- the matching public authority record;
- the Action Envelope hash;
- the scope decision and legitimacy reference;
- the allow or deny reason;
- the decision time; and
- the preceding evidence-chain hash.

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

The local simulator signs its own decisions with a deterministic demo key and does not call the hosted integrations. The implemented hosted path is stronger: AgentEnvelope appends verification and completion witness blocks; AILeash can retain the AgentEnvelope public head outside the portal; and MIR can receive verified completed-action events while AgentEnvelope independently checks MIR's published checkpoint chain.

Those roles are deliberately separate. MIR does not custody the AgentEnvelope head, and an authority check alone sends nothing to MIR. Denied attempts remain in the AgentEnvelope witness chain; MIR receives only explicitly reported completed outcomes. The current AgentEnvelope verifier does not use MIR history as an admission-time behaviour signal.

The chain also records only what arrived. It does not prove that a temperature reading expected every minute actually arrived. A six-hour monitoring silence and a genuinely quiet six hours are indistinguishable without a separate, implemented record of observations due.

## Demo scenarios

- **Normal alert:** authorised monitoring raises an engineer alert.
- **Compressor fault:** bounded maintenance authority dispatches the approved contractor.
- **50°C attack:** an unknown signer attempts forced high-temperature defrost. The command is denied and added to the local evidence chain.
- **Correct, no authority:** a read-only monitor proposes the correct 4°C value but cannot issue a control command.
- **Authorised recovery:** the site engineer restores the safe setpoint; admission and completion are recorded separately.
- **Valid authority attack:** a compromised site-engineer controller submits an in-scope eight-hour defrost change. Every implemented authority check passes, so AgentEnvelope allows it and records the outcome. Authority verification does not prove benign intent or an uncompromised credential, and the current verifier does not consult external behaviour history.

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
