---
description: Use when working on, analyzing, or reconstructing Sessions Inbox telemetry (the inbox attention-trajectory and meta-routing events) and how it sequences within the Agents window
---

# Agents window inbox telemetry

The Sessions Inbox emits a family of `agents/inbox*` telemetry events that, together with the
window-wide `agents/*` events, reconstruct a user's **attention trajectory** — an ordered,
timestamped sequence of everything that happened around the inbox (which surface was focused, which
inbox items appeared, what the user clicked, what they decided) with rich, bounded, non‑PII metadata.
This is the data substrate for research on **adaptive, personalized meta‑routing for human‑agent
systems**.

This document is inbox-centric: it explains how inbox events link and sequence within the whole
Agents window, how to reconstruct a trajectory from either the **local telemetry log** or **Kusto**,
and documents the bounded ontologies used by the restricted classification, item‑lifecycle, and
routing‑decision events. Non-inbox `agents/*` events are cataloged only briefly, for linking; see
their own sources for full field lists.

> All events follow the GDPR patterns in [telemetry.instructions.md](./telemetry.instructions.md):
> bounded `SystemMetaData` unless a field is explicitly a restricted
> `EndUserPseudonymizedInformation` label. No titles, message content, file paths, or repo names are
> ever emitted.

## How events link and sequence

Every telemetry event (regardless of feature) is stamped by the core pipeline in
[commonProperties.ts](../../src/vs/platform/telemetry/common/commonProperties.ts) with:

| Common property | Meaning |
|---|---|
| `timestamp` | Wall‑clock time the event was recorded. |
| `common.timesincesessionstart` | Milliseconds since the window session started. |
| `common.sequence` | Monotonic counter (per telemetry‑service instance) — the exact intra‑session order. |
| `common.isAgentsWindow` | `true` for events emitted from the Agents window (see [workbenchCommonProperties.ts](../../src/vs/workbench/services/telemetry/common/workbenchCommonProperties.ts)). |

**To reconstruct a trajectory:**

1. Filter to one window session and `common.isAgentsWindow == true`.
2. Order by `common.sequence` (exact) or `timestamp` (cross‑process).
3. The active surface + dwell at any moment is the most recent `agents/activeContextChanged`
   before the event.
4. Link item‑level events to a session with `agentSessionId` (SHA‑1 of the session id — see the
   hashing note below) and `providerId`.

The trajectory is **not** limited to the inbox: chats, automations, customization, session
lifecycle, PR actions, and feedback all emit `agents/*` events and interleave by `common.sequence`.

### Identity / hashing

`agentSessionId` is the **unsalted SHA‑1** of the session id, produced by the shared
`hashSessionIdForTelemetry` in
[sessionsTelemetry.ts](../../src/vs/sessions/common/sessionsTelemetry.ts). This is the repo‑wide norm
for correlating session‑scoped events; do not introduce a different scheme for `agents/*` events
without changing that shared primitive (and getting privacy/security sign‑off).

## Event catalog

### Whole‑window / cross‑surface

| Event | Emitted when | Key fields |
|---|---|---|
| `agents/activeContextChanged` | Focus moves between window surfaces | `surface` (inbox/automations/customization/…), `cause`, `previousSurface`, `previousDwellMs` |
| `agents/windowLayout`, `agents/windowSessionStart`, `agents/firstTimeWindowOpen` | Window lifecycle | layout / session context |
| `agents/sessionOpen` | A session is opened | `source` (`notification` = from the inbox), `outcome`, durations |
| `agents/requestSent`, `agents/session*`, `agents/*PullRequest`, `agents/commit*`, `agents/feedback*` | Session / PR / feedback actions | see [sessionsTelemetry.contribution.ts](../../src/vs/sessions/contrib/sessions/browser/sessionsTelemetry.contribution.ts) |

### Sessions Inbox

| Event | Emitted when | Notes |
|---|---|---|
| `agents/inboxImpression` | A card is first shown | The "shown‑but‑not‑acted" negatives for attention analysis. |
| `agents/inboxClick` | A discrete click in the inbox | Coarse `relX`/`relY` **0–9 bins** (a 10×10 grid, never exact coordinates); shares `actionId` with the interaction it triggers. |
| `agents/inboxInteraction` | A semantic action (open, run action, answer, dismiss…) | Rich context: `priorityTier`, `answerKind`/`answerCharCount`, `msSinceItemFirstSeen`, `msSinceSelection`, `result`, `actionId`. |
| `agents/inboxViewState` | View open/close, filter, sort, dwell | |
| `agents/inboxPreviewGenerated`, `agents/inboxDetailSummaryGenerated` | Utility‑model preview / evidence pack generated on demand | Bounded outcome only. |
| `agents/inboxContentClassification` | On‑demand item classification (**restricted**) | Bounded content‑derived labels — see [ontology](#restricted-content-classification-ontology). |
| `agents/inboxItemLifecycle` | An item enters or leaves the inbox | `outcome` (see [lifecycle](#item-lifecycle-outcomes)), `msInInbox`. |
| `agents/inboxRoutingDecision` | An item first enters the inbox | The derived [routing plan](#routing-decision-schema). |

Correlate a raw click to its semantic action with the shared `actionId`
(`agents/inboxClick` ↔ `agents/inboxInteraction`).

## Reconstructing from the local telemetry log

Every `agents/*` event flows through the universal `TelemetryLogAppender`
([telemetryLogAppender.ts](../../src/vs/platform/telemetry/common/telemetryLogAppender.ts)) into the
local **Telemetry** output channel — the same local‑logging path used by inline suggestions / NES.

1. Enable telemetry logging (raise the telemetry log level / run the developer telemetry command),
   then open the **Output → Telemetry** channel.
2. Each line is `<eventName> <json-payload>`; the payload includes the common properties above.
3. Filter for `agents/` and order by the embedded `common.sequence` (or `timestamp`).
4. Because every event carries `common.isAgentsWindow`, `agentSessionId`, and `common.sequence`,
   the local log alone is enough to rebuild a full in‑session trajectory (focus changes, impressions,
   clicks, interactions, lifecycle, and routing decisions in order).

> **Restricted events are in the local log too.** There is no client‑side split: `_log` in
> [telemetryService.ts](../../src/vs/platform/telemetry/common/telemetryService.ts) forwards every
> event to *all* appenders, and `TelemetryLogAppender` logs them unfiltered. So
> `agents/inboxContentClassification` (whose labels are declared `EndUserPseudonymizedInformation`)
> appears in the local Telemetry log just like any other event — the "restricted" designation only
> governs downstream (cloud) storage and access, not local recording.

## Reconstructing from Kusto

In official builds the same events are additionally sent to the OneDataSystem web appender (see
`telemetryService.ts`), so they land in the VS Code telemetry cluster. **The authoritative cluster,
database, table, and column names live in the vscode‑tools Kusto instructions** — consult
[kusto.instructions.md](./kusto.instructions.md) before querying; the sketch below shows only the
shape (property keys are typically lower‑cased in Kusto and numbers/booleans land in `Measures`):

```kql
RawEventsVW
| where EventName startswith "agents/"
| where tostring(Properties["common.isagentswindow"]) == "true"
| extend Seq = toint(Measures["common.sequence"])
| extend Sid = tostring(Properties["agentsessionid"])
| order by ClientTimestamp asc, Seq asc
| project ClientTimestamp, Seq, EventName, Sid,
          Surface = tostring(Properties["surface"]),
          Outcome = tostring(Properties["outcome"]),
          Recipient = tostring(Properties["recipienttype"]),
          Properties, Measures
```

To follow one item/session across the trajectory, add `| where Sid == "<hash>"`.

### Which pipeline the restricted classification uses (and why not the Copilot enhanced table)

`agents/inboxContentClassification` is emitted with core `ITelemetryService.publicLog2`, and its
content‑derived label fields are declared `EndUserPseudonymizedInformation`. Two things follow from
how the core pipeline actually works:

- **No client‑side table routing.** `_log` in
  [telemetryService.ts](../../src/vs/platform/telemetry/common/telemetryService.ts) forwards every
  event to *all* appenders, and [1dsAppender.ts](../../src/vs/platform/telemetry/common/1dsAppender.ts)
  sends to a single instrumentation key. The `EndUserPseudonymizedInformation` classification is a
  compile‑time/GDPR **annotation** (for privacy review and downstream governance) — it does **not**
  redirect the event to a different iKey/table in the VS Code pipeline.
- **This is deliberately different from NES / Copilot restricted telemetry.** NES and inline
  suggestions ship *raw prompts and model outputs*, so they use Copilot's separate **enhanced**
  telemetry sender (a distinct instrumentation key → the dedicated `copilot_v0_restricted_copilot_event`
  hydro table; see [agentHostRestrictedTelemetry.ts](../../src/vs/platform/agentHost/node/agentHostRestrictedTelemetry.ts)
  and the Copilot extension's `ghTelemetrySender`). That path also does **not** mirror its payloads
  into the local Telemetry channel — it only writes status traces.

The inbox classification intentionally does **not** use that Copilot path: it emits **bounded enum
labels, never raw content**, so the `EndUserPseudonymizedInformation` annotation on `publicLog2` is
the appropriate, conservative treatment, and it keeps the event **locally inspectable** in the
standard Telemetry channel (see above) — which the Copilot enhanced path would sacrifice. If a
dedicated restricted table is ever required for this data, it would need the Copilot enhanced sender
plus an explicit local‑log mirror; that is out of scope here. Join the labels back to the rest of the
trajectory on `agentSessionId`.

## Restricted content‑classification ontology

`agents/inboxContentClassification` (ontology version **2**) is produced locally by the utility model
from the item title, transcript, and any pending request. Only the bounded labels below leave the
client; the raw content never does. Each axis is coerced to `unknown` (or `none`) if the model
returns anything out of range. The axes are intentionally **split** (request kind vs. subject; risk
vs. reversibility vs. environment) so a meta‑router can reason about who should handle an item and
whether an agent may act autonomously.

> **It is a separate, on‑demand event — not attached to lifecycle/routing events.** Classification
> runs at most once per item, only when the user opens the detail pane of a **completed** or
> **needs‑input** item (it piggybacks on the evidence‑pack generation and is model‑gated), so items
> the user never opens are never classified and most lifecycle events have no classification.
> Correlate a classification to that item's `agents/inboxItemLifecycle` / `agents/inboxInteraction` /
> `agents/inboxRoutingDecision` events by `agentSessionId` + `notificationKind` and `common.sequence`.
> The labels are deliberately **not** embedded in those events — that would both force a model call
> for every item (fan‑out) and leak restricted labels into ordinary `SystemMetaData` events.

| Field | Restricted? | Values |
|---|---|---|
| `workType` | yes | bugfix, feature, refactor, test, validation, docs, review, audit, config, dependency, migration, performance, diagnosis, analysis, planning, research, prototype, release, incident, chore, other, unknown |
| `domain` | yes | frontend, backend, api, database, pipeline, analytics, mobile, desktop, cli, integration, identity, security, observability, operations, infra, network, runtime, build, ci, scm, devtools, test, docs, ml, ai, embedded, accessibility, localization, compliance, other, unknown |
| `requestKind` | yes | approve, choose, clarify, provideInput, provideEvidence, review, performAction, acknowledge, other, none, unknown |
| `decisionSubject` | yes | design, requirements, scope, priority, tradeoff, ownership, access, resource, risk, policy, change, merge, release, target, conflict, other, none, unknown |
| `riskLevel` | yes | none, low, med, high, critical, unknown |
| `reversibility` | yes | reversible, partial, irreversible, unknown |
| `environment` | yes | local, isolated, shared, production, external, unknown |
| `evidenceState` | no (meta) | absent, sparse, sufficient, conflicting, unknown |
| `confidence` | no (meta) | low, med, high, unknown |

Plus meta: `ontologyVersion`, `inputScope` (`sessionContext`), `provenance` (`utilityModelInference`),
`notificationKind`, `agentSessionId`, `providerId`.

The ontology and derivation live in
[inboxNotificationsService.ts](../../src/vs/sessions/contrib/inboxOne/browser/inboxNotificationsService.ts)
(`CLASSIFICATION_*`, `parseContentClassification`). Bump `CLASSIFICATION_ONTOLOGY_VERSION` whenever
the label sets change.

## Item lifecycle outcomes

`agents/inboxItemLifecycle` records an item entering or leaving the inbox, so the item lifecycle (and
the outcomes that feed the meta‑routing feedback loop) sequence alongside the rest of the trajectory.

| `outcome` | Meaning |
|---|---|
| `entered` | Item appeared in the inbox for the first time. |
| `reentered` | Item reappeared after previously leaving (e.g. a new question arrived). |
| `dismissed` | The user dismissed the item. |
| `removed` | The item left for another reason (answered elsewhere, PR closed, source gone). |
| `unknown` | Reason could not be determined. |

Also carries `notificationKind`, `priorityTier`, `needsInput`, `msInInbox` (dwell before leaving; `0`
on entry), `agentSessionId`, `providerId`. "Agent finished vs. user acted" is reconstructable from the
sequence: a `runAction`/answer `agents/inboxInteraction` immediately preceding a `removed` outcome is
a user‑driven resolution.

## Routing‑decision schema

`agents/inboxRoutingDecision` logs the structured routing plan the inbox would produce for an item —
**who** should handle it, in **what order**, **when**, with **what evidence**, and with how much agent
**autonomy**. Today the plan is derived programmatically by an explicit rules stub
(`deriveRoutingPlan`); the schema is logged so a future learned meta‑router can replace the derivation
without changing the telemetry. Emitted once per entry.

| Field | Values |
|---|---|
| `recipientType` | human, agent, both, none |
| `ordering` | single, sequential, parallel |
| `timing` | immediate, deferred, scheduled |
| `priorityTier` | now, next, later, none |
| `evidenceScope` | none, summary, full |
| `autonomyLevel` | humanOnly, approvalRequired, autonomous |
| `decisionRequired` | yes, no |
| `riskLevel` | low, med, high |

Plus meta: `routingPlanVersion` (bump when the derivation changes), `provenance` (`ruleBasedStub`),
`notificationKind`, `agentSessionId`, `providerId`.
