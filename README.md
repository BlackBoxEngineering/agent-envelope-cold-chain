# AgentEnvelope Cold Chain

A hosted demonstration of sovereign derived authority for connected refrigeration systems.

> **Stop the command. Preserve the evidence. End the blame game.**

## The problem

During the night of 11–12 October 2026, attackers remotely changed refrigeration settings across French supermarkets. Forced defrost cycles reportedly pushed some systems towards 50°C, spoiled stock and damaged equipment. On 13 October, the French government said approximately 700 supermarkets had been affected.

Sources: [CERT-FR](https://www.cert.ssi.gouv.fr/alerte/CERTFR-2026-ALE-012/), [Associated Press](https://apnews.com/article/france-cyberattack-supermarkets-refrigeration-systems-78a813a8efd466b360655339f96083dc), [Reuters](https://live.euronext.com/en/financial-news/investigators-hunt-french-supermarket-fridge-hackers-no-claim-responsibility).

The refrigeration system already knows how to cool food. The security question is:

> **Who is allowed to issue an operational command?**

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
- **Site engineer controller** — may restore a safe setpoint within its exact scope.

Each Agent authority is bounded by its signed operation, resources, action limits and legitimacy reference.

At runtime:

1. The machine presents its signed delegated request.
2. Hosted governance checks the delegate, request signature, scope, replay, limits and current legitimacy.
3. The machine derives its capability locally.
4. A seedless `PublicActionRecord` is registered for verification.
5. The signed command is checked against that record and its immutable `ActionEnvelope`.
6. An allowed command reaches the trusted controller gateway; a denied command does not.
7. The decision is witnessed.
8. A completed action produces a separately signed execution outcome.

API keys provide access to the hosted service. They are not authority.

## Live demonstration

Press **Start system** to bring the refrigeration loop online and continuously report the temperature of Chilled Zone 03. Once it is live, each operational event is itself the trigger: select a compressor fault, an unauthorised 50°C defrost attempt or a legitimate command and watch the system respond without a second submission step.

Each request pauses at the trusted gateway while identity, public authority, scope and legitimacy are checked. Rejected commands never reach the controller, but still leave witnessed decision evidence. A compressor fault progresses into a separately authorised site-engineer recovery, so the viewer can watch the safe setpoint return and see both decisions added to the linked evidence trail.

## Evidence, not arguments

Every command submitted through the trusted gateway produces decision evidence containing:

- the command hash;
- the signer address;
- the matching public authority record;
- the Action Envelope hash;
- the scope and legitimacy decision;
- the allow or deny reason;
- the decision time; and
- the preceding witness-chain hash.

Allowed commands add a separately signed execution outcome. Denied commands record that execution was not attempted.

```text
Command attempt
      |
      v
Authority verification
      |
      v
Witnessed allow / deny decision
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
- whether the recorded sequence was later altered.

The blame game stops. The evidence remains.

## Demo scenarios

- **Normal alert:** authorised monitoring raises an engineer alert.
- **Compressor fault:** bounded maintenance authority dispatches the approved contractor.
- **50°C attack:** an unknown signer attempts forced high-temperature defrost. The command is denied and witnessed.
- **Correct, no authority:** a read-only monitor proposes the correct 4°C value but cannot issue a control command.
- **Authorised recovery:** the site engineer restores the safe setpoint; admission and completion are recorded separately.

```text
Knowledge ≠ Authority
```

## Deployment boundary

The trusted gateway is the controller's operational command path. Production deployments combine that boundary with supported controllers, current firmware and protected network access.

## Run locally

```bash
npm install
npm run dev
```

```bash
npm run build
npm run test:smoke
```
