# French supermarket refrigeration cyberattack

Status: 13 October 2026  
Scope: Publicly available information as of this date

## Executive summary

During the night of 11–12 October 2026, attackers remotely altered refrigeration controls used by French supermarkets. The reported changes forced or extended defrost cycles, raised temperatures in refrigerators, freezers and cold rooms, delayed alarms, spoiled food and damaged equipment.

French Finance Minister Roland Lescure told Parliament on 13 October that about 700 of France's roughly 10,000 supermarkets were affected. This is the strongest current national estimate, but other reports cite lower totals and the investigation is continuing.

CERT-FR initially warned about compromises affecting Danfoss AK-SM and AK-SC remote refrigeration controllers. On 13 October it expanded the affected-system list to include Copeland xweb and Dixell xweb. CERT-FR warned that exposing management interfaces directly to the Internet is contrary to good practice and said attack campaigns were probably still active.

The initial intrusion mechanism has not been established publicly. Previously disclosed Danfoss vulnerabilities and widespread Internet exposure provide credible technical paths, but there is no official confirmation that a particular CVE was used in this incident.

## Confidence and attribution

This document distinguishes:

- **Confirmed by an authority or vendor:** statements from CERT-FR/ANSSI, Danfoss or named public officials.
- **Attributed reporting:** details reported by established news organisations, retailers or refrigeration specialists.
- **Engineering assessment:** a technically plausible interpretation that has not been established as incident fact.
- **Unknown:** information that is not yet public or remains disputed.

## Timeline

| Date and time | Event |
| --- | --- |
| 2025-03-24 | Danfoss published DSA-2025-03-01 for CVE-2025-41450, an authentication weakness affecting AK-SM 8xxA before version 4.2. |
| 2025-08-01 | Danfoss published DSA-2025-08-01 covering CVE-2025-41451 and CVE-2025-41452 in AK-SM 8xxA before version 4.3.1. |
| 2026-10-11, approximately 23:00 | One affected store owner told Le Monde the attack probably began around this time. This is a store-level account, not a confirmed start time for the whole campaign. |
| 2026-10-12, approximately 04:00 | Staff and delivery personnel began discovering abnormal temperatures and damage at affected stores. |
| 2026-10-12 | Retailers publicly confirmed refrigeration disruption. CERT-FR issued alert CERTFR-2026-ALE-012. Danfoss said it was working with affected customers. |
| Night of 12–13 October | Similar manipulation was reported against some Dixell-equipped stores. |
| 2026-10-13 | CERT-FR expanded its alert to include Copeland xweb and Dixell xweb. The French finance minister gave an estimate of about 700 affected supermarkets. The Paris prosecutor's cybercrime unit was investigating. |

## Reported impact

### Store counts

The figures are moving and describe different scopes:

| Figure | Attribution |
| --- | --- |
| About 700 of France's approximately 10,000 supermarkets | French Finance Minister Roland Lescure, reported by AP on 13 October |
| 300 Intermarché and Netto stores | Groupement Mousquetaires, reported by AP |
| 80 of Coopérative U's 2,000 stores | Coopérative U, reported by AP |
| Around 300 Intermarché/Netto, about 100 Coopérative U, 80 Carrefour, several E.Leclerc and around 30 Monoprix locations | Le Monde's early breakdown |
| Around 500 stores | Industry reporting on 12 October |
| 250–350 stores | Earlier reporting before the national estimate |

The figures should not be added together: they overlap and were collected at different stages.

### Operational and physical effects

Reported effects include:

- forced or continuous defrost operation;
- defrost periods extended from one hour to eight hours to delay alarms;
- refrigeration and cold-room settings raised towards 50°C;
- a later, smaller wave in which a refrigeration specialist reported a Dixell-equipped installation being assigned extreme values, including 150°C for frozen goods;
- discarded fresh and frozen inventory;
- temporary store closures and refrigerated displays remaining unavailable;
- flooding or sprinkler activation at at least one site;
- reports of equipment melting and fires;
- store-level losses, including one retailer's reported €21,000 inventory loss; and
- national losses expected to reach millions of euros, although no final audited total exists.

One refrigeration specialist told Le Monde that a Dixell-targeted store near Bordeaux detected abnormal temperature movement around 04:00 and intervened before goods were lost. Another Dixell-equipped E.Leclerc reportedly discarded refrigerated stock.

## Affected organisations

Public reporting names stores or groups including:

- Intermarché;
- Netto;
- Coopérative U and Super U;
- Carrefour and Carrefour Market;
- E.Leclerc;
- Monoprix; and
- Metro France.

Picard told Le Monde it was not affected.

A separate cybersecurity incident led Ahold Delhaize to take systems offline in the Netherlands, Belgium and the United States. No public evidence currently establishes that it was part of the French refrigeration campaign.

## Affected technology

### Systems named by CERT-FR

CERT-FR's 13 October alert names:

- Danfoss AK-SM series;
- Danfoss AK-SC series;
- Copeland xweb; and
- Dixell xweb.

### Danfoss models and support status

Danfoss told industry media that most affected units were legacy products or supported products running outdated firmware:

- **AK-SM 800:** declared end of life in 2021;
- **AK-SC 355:** phased out in 2016 and no longer receiving software or security updates; and
- **AK-SM 800A:** affected examples were reportedly running outdated firmware.

Danfoss said it had long advised customers to keep supported controllers current, migrate legacy systems, strengthen network protections and remove direct Internet exposure.

## What the attackers changed

The attack was directed at operational refrigeration management, not at the refrigerators as consumer appliances.

A typical control path is:

```text
Remote management interface or service-provider access
                         |
                         v
             Refrigeration system manager
                         |
                         v
       Pack, case and cold-room controllers
                         |
                         v
               Fridges and freezers
```

These system managers can monitor circuits, change temperature thresholds, adjust schedules, manage alarms and perform remote maintenance. Altering defrost schedules can raise cabinet temperatures without issuing a simple command labelled “turn refrigeration off.”

Le Monde reported that some attackers changed the normal one-hour defrost cycle to eight hours specifically to delay alarms. That makes detectability part of the attack: the adversary changed both the physical process and when operators would learn about it.

## Exposure and known vulnerabilities

### Internet exposure

Claroty Team82 reported finding thousands of publicly accessible Danfoss AK-SM 800A management interfaces; its published research showed 2,765 exposed devices in a Censys scan. This number describes discoverable systems, not confirmed victims.

CERT-FR's incident guidance says directly exposing a refrigeration-management interface on a public IP address is contrary to good practice.

### CVE-2025-41450

- Product: Danfoss AK-SM 8xxA before version 4.2.
- Type: improper authentication/authentication bypass.
- Vendor score: CVSS 8.2, High.
- Published by Danfoss: 24 March 2025.
- Fix: version 4.2 or later.

Danfoss's advisory describes disclosure of sensitive information. Claroty's deeper research describes a hidden “code-of-the-day” path based on the controller's date which could produce an authenticated administrative session.

### CVE-2025-41451

- Product: Danfoss AK-SM 8xxA before version 4.3.1.
- Type: post-authentication OS command injection.
- Vendor score: CVSS 8.7, High.
- Published by Danfoss: 1 August 2025.
- Fix: version 4.3.1 or later.

The flaw could allow remote code execution after authentication.

### CVE-2025-41452

- Product: Danfoss AK-SM 8xxA before version 4.3.1.
- Type: post-authentication external control of web-server configuration.
- Vendor score: CVSS 6.8, Medium.
- Published by Danfoss: 1 August 2025.
- Fix: version 4.3.1 or later.

Claroty reported that the affected functionality could be used to manipulate web routing and trigger a denial of service.

### What is not proven

The disclosed vulnerabilities demonstrate plausible ways to gain privileged control of an exposed, unpatched AK-SM 800A. They do **not** establish that these vulnerabilities were used against the supermarkets.

The following remain unknown:

- the initial access method for each affected controller family;
- whether attackers exploited a CVE, reused credentials, abused a service-provider account or used several methods;
- whether all affected stores were part of one coordinated campaign;
- whether a shared platform or contractor was compromised;
- the identity, location and motive of the attackers;
- whether persistence was installed;
- the complete number of victims and final financial loss; and
- whether the separate Ahold Delhaize incident was related.

No public claim of responsibility had been reported by Le Monde as of 13 October.

## Plausible architectures

Several architectures could explain remote access:

```text
Internet
   |
Public management interface
   |
Refrigeration controller
```

```text
Contractor VPN or remote-support account
   |
Store or building-management network
   |
Refrigeration controller
```

```text
Service provider
   |
Shared fleet-management path
   |
Controllers across many stores
```

Public reporting mentions Internet-exposed consoles, refrigeration contractors and an external service provider. The scale makes shared operational paths worth investigating, but it does not prove that one shared platform was the point of compromise.

## Official remediation

CERT-FR recommends the following.

For equipment not believed to be compromised:

1. Remove direct Internet exposure, including exposure through a public IP address.
2. Check the complete configuration, especially defrost schedules.
3. Restore access only through a secure VPN or protected network.
4. Apply vendor firmware updates and security guidance.
5. For Danfoss equipment, enable Strict security mode and change default passwords.

For compromised equipment:

1. Remove Internet exposure.
2. Factory-reset the controller.
3. Reconfigure it before returning it to service.
4. Apply available fixes and the vendor's hardening guidance.

CERT-FR warns that resetting an unsupported, Internet-exposed controller is insufficient because it remains vulnerable to reinfection. End-of-life equipment should be removed from direct exposure and replaced or otherwise isolated.

Operational recovery should also include:

- independent food-safety assessment before returning stock to sale;
- validation of every setpoint, defrost schedule, alarm threshold and notification route;
- review of local and remote accounts;
- credential and key rotation;
- preservation of controller, firewall, VPN and service-provider logs;
- confirmation that alarms and telemetry are arriving on schedule; and
- verification that remote management cannot bypass the intended command gateway.

## AgentEnvelope analysis

### The authority question

AgentEnvelope asks:

> Does this signed command carry valid, current and correctly scoped authority?

That check is independent of whether a request arrived through Wi-Fi, a VPN, a cloud platform or a contractor connection—but only if the AgentEnvelope-verifying gateway is the controller's sole operational command path.

### What the Action Envelope fixes

An AgentEnvelope v1 `ActionEnvelope` fixes one agent id, Domain, action index, operation, resource set, time window, decay mode and maximum-use declaration. The complete canonical envelope is hashed before the action capability is derived. Changing any of those fields produces a different authority.

For this cold-chain example, an exact duration is represented as a resource:

```text
operation: run_scheduled_defrost
resources: store:184, zone:chilled-03, duration:1h
actionIndex: 5
decayMode: ACTION
maxUses: 1
```

AgentEnvelope v1 does not contain a generic numeric predicate language such as `duration <= 1h`. The cold-chain integration canonically projects the requested value into a resource—for example, an eight-hour request becomes `duration:8h`—and requires an exact match with the immutable Action Envelope. It does not trust a caller-supplied `duration:1h` label when the payload actually requests eight hours.

This projection is an essential integration step. The generic SDK verifies the signed payload, action index, public record, envelope commitment and decay, but it cannot infer refrigeration semantics from arbitrary JSON. The local demo performs the projection and exact comparison explicitly. A production gateway must do the equivalent before actuation.

### What AgentEnvelope can stop

Where every actuation request must cross the gateway, AgentEnvelope can reject:

- an unknown signer;
- a signer with no public authority record;
- a command outside the authorised operation;
- a command whose canonically projected resources or values are outside its Action Envelope;
- an invalid signature;
- an inactive record, wrong action index, mismatched envelope hash or expired time window; and
- stale or invalid hosted legitimacy.

A denial can still produce evidence showing that execution was not attempted. This records an important negative fact, not merely actions that completed.

### Use limits and repeated valid commands

The Action Envelope commits to `limits.maxUses`, and `ACTION` or `BOTH` decay requires a positive maximum-use count. However, v1 deliberately records `limits.enforcement: "external"`: the SDK's record verification is stateless except for time and cannot know whether a use slot has already been consumed.

The current hosted action-verification route reports `maxUses` but does not atomically consume an action use or reject a repeated action payload. The local simulator also does not model a durable use counter. It would therefore be inaccurate to claim that the implemented hosted path already stops eight individually valid one-hour commands by counting them.

That is separate from delegated mint governance. Hosted mint already enforces mint-request nonce replay, the delegate's `maxMints`, required legitimacy and the requested `maxUses` ceiling. Atomic consumption of an already-derived action capability remains an action-admission responsibility that must be implemented before relying on `maxUses` operationally.

### Who can derive broader authority

Authority is derived rather than centrally issued. The customer-controlled Vault derives the Domain authority. A direct action capability is derived locally from that authority. For autonomous runtimes, the Domain authority can sign a `MintDelegate` that fixes:

- allowed operations and resources;
- the permitted action-index range;
- `maxMints`;
- `maxUsesPerAction`;
- the delegate time window;
- the accepted bot policy; and
- an optional legitimacy reference.

A runtime cannot request `duration:8h` through a delegate restricted to `duration:1h`, and it cannot raise its own mint or use ceilings. The hosted mint path verifies the Domain signature, bot signature and these bounds, then enforces nonce replay, mint count and current legitimacy.

The authority owner still has to define the correct operational bounds. AgentEnvelope makes those bounds immutable and verifiable; it does not decide that one hour or 4°C is safe for a particular refrigeration installation. A compromised Vault or Domain signing authority would have a larger blast radius than a captured action capability and belongs in the threat model.

Mint completion is currently written to the hosted audit trail and can receive a signed AgentEnvelope receipt when the attestation key is configured. It is not currently appended to the AgentEnvelope witness chain, so minting must not be described as witnessed end to end.

### The two demo denials

The cold-chain demo includes two deliberately different failures:

1. **Unknown signer:** the 50°C request has no matching authority and is denied.
2. **Scope breakout attempt:** a known site-engineer signer requests an eight-hour defrost duration while presenting the permitted one-hour resource label. The integration projects the command to `duration:8h`, which does not match its immutable `duration:1h` Action Envelope. Identity and signature checks pass; exact scope fails, so execution is denied and recorded as not attempted.

The second case shows why recognising a signer is not enough. A valid action identity cannot extend its own authority. Capturing one derived action capability exposes that envelope; it does not reveal the Vault, Domain key or sibling action capabilities. Its practical blast radius still depends on enforcing the envelope's time window and externally governed use limit.

### What AgentEnvelope cannot stop by authority checking alone

AgentEnvelope does not solve:

- an exploit that actuates below or around the gateway;
- compromised controller firmware;
- obsolete or unpatched devices;
- direct Internet exposure;
- distinguishing legitimate use from stolen signing capability when the requested action exactly matches the derived scope;
- inferring intent from an otherwise valid, exactly scoped command;
- aggregate harm caused by repeated valid commands when stateful use or rate controls are absent;
- incorrect safety bounds chosen by the authority owner; or
- a compromised credential behaving within its established pattern.

### Evidence and witnessing

The implemented hosted AgentEnvelope path separates admission from execution:

1. The backend finds the published action record and verifies the signed action.
2. For a found record, the backend attempts to append the allow or deny report to the AgentEnvelope witness chain.
3. If an allowed action completes, the runtime submits a separately signed execution outcome.
4. The backend verifies that outcome and attempts to append a completion witness block.
5. If enabled, AILeash/Sebbi receives the AgentEnvelope public head as an external custody witness.
6. If enabled and server-configured, MIR receives an opaque `agent.action.completed` event.
7. AgentEnvelope independently retrieves and recomputes MIR's public checkpoint chain.

An unknown `recordId` or `agentId` currently returns `404` before a hosted verification report or witness block is created. The local cold-chain simulator still records its unknown-signer denial in its own signed, hash-linked evidence sequence. Those are different implementations and must not be conflated.

The roles are not interchangeable:

- AILeash/Sebbi provides external custody of the AgentEnvelope head.
- MIR provides completed-action transparency and a separately verifiable checkpoint history.
- MIR does not custody the AgentEnvelope head.
- Authority verification alone sends nothing to MIR.
- Denied verification reports for found records can remain in the AgentEnvelope witness chain and are not MIR completion events.
- The current AgentEnvelope verifier does not use MIR participation history as an admission-time signal.

The local cold-chain simulator demonstrates signed decisions, outcomes and hash linkage without calling these hosted integrations.

Witness-chain append is fail-closed only when the backend's `WITNESS_REQUIRED` setting is enabled. External observation is asynchronous: the configured hourly observer sends the current AgentEnvelope head to AILeash and checks MIR's public checkpoints. Required external receipts are not currently available in the beta.

### The missing-observation problem

The incident exposed a second class of evidence problem. If a temperature reading is expected every minute but no reading arrives for six hours, a command ledger alone cannot distinguish deliberate suppression from a quiet night.

Tamper evidence proves properties of records that exist. It does not prove that an expected observation was produced.

Closing that gap requires a separately designed observation expectation—for example, a signed schedule or heartbeat—and a designated observer able to attest that it did not receive the expected reading by the deadline. Such evidence proves the observer's non-receipt under the stated schedule; it does not prove universal non-existence. This is not currently implemented in AgentEnvelope or the cold-chain demo and should not be implied by command signatures or witness-chain integrity.

## Sources

Primary and authoritative:

- [CERT-FR alert CERTFR-2026-ALE-012](https://www.cert.ssi.gouv.fr/alerte/CERTFR-2026-ALE-012/)
- [Danfoss DSA-2025-03-01: CVE-2025-41450](https://www.danfoss.com/en/service-and-support/coordinated-vulnerability-disclosure/danfoss-security-advisories/dsa-2025-03-01/)
- [Danfoss DSA-2025-08-01: CVE-2025-41451 and CVE-2025-41452](https://www.danfoss.com/en/service-and-support/coordinated-vulnerability-disclosure/danfoss-security-advisories/dsa-2025-08-01/)
- [Claroty Team82 technical research](https://claroty.com/team82/research/freeze-the-controller-defrost-the-food-uncovering-vulnerabilities-in-danfoss-refrigeration-controllers)

Incident reporting:

- [Associated Press: national estimate and investigation](https://apnews.com/article/france-cyberattack-supermarkets-refrigeration-systems-78a813a8efd466b360655339f96083dc)
- [Le Monde: initial attack, defrost manipulation and impact](https://www.lemonde.fr/en/economy/article/2026/10/13/a-disastrous-day-for-french-supermarkets-after-massive-cyberattack-targets-refrigeration-systems_6758535_19.html)
- [Le Monde: follow-on attacks involving other controller families](https://www.lemonde.fr/en/pixels/article/2026/10/13/after-danfoss-hackers-strike-other-refrigeration-systems-used-in-france_6758565_13.html)
- [Cooling Post: Danfoss statement on legacy products and outdated firmware](https://www.coolingpost.com/world-news/danfoss-moves-to-mitigate-cyberattack/)
- [BleepingComputer: early incident and exposure reporting](https://www.bleepingcomputer.com/news/security/cyberattack-shuts-down-refrigerators-at-french-supermarkets/)

## Update policy

This is a fast-moving incident. New official information should be reconciled into the sections above rather than appended without context. In particular, future updates should identify:

- which claims are newly confirmed;
- whether victim counts describe stores, controllers or retail groups;
- whether a specific intrusion method or vulnerability is established;
- whether attribution has changed;
- whether indicators of compromise have been published; and
- the publication date and source for every correction.
