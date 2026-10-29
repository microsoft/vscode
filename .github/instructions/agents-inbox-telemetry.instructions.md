---
description: Use when working on, analyzing, or reconstructing Sessions Inbox telemetry (the inbox attention-trajectory and meta-routing events) and how it sequences within the Agents window
---

# Agents window inbox telemetry

The Sessions Inbox emits a family of `agents/inbox*` telemetry events describing which inbox items appeared, what the user clicked, and what they decided, with bounded, non‑PII metadata. Inbox view events describe focus and dwell within the Inbox; they do not track focus across other Agents-window surfaces.

This document is inbox-centric: it explains how inbox events link and sequence within the whole
Agents window, how to reconstruct a trajectory from either the **local telemetry log** or **Kusto**,
and documents the bounded outcomes used by item-lifecycle events. Non-inbox `agents/*` events are cataloged only briefly, for linking; see
their own sources for full field lists.

> All events follow the GDPR patterns in [telemetry.instructions.md](./telemetry.instructions.md):
> bounded `SystemMetaData`. No titles, message content, inferred content labels, file paths, or repo names are emitted. Content-classification model calls and telemetry are not part of the Inbox; adding them requires privacy review of their purpose, classification, and handling.

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
3. Use `agents/inboxViewState` for Inbox focus and dwell. Focus on other surfaces is not tracked.
4. Link item‑level events to a session with `agentSessionId` (SHA‑1 of the session id — see the
   hashing note below) and `providerId`.

Existing session, automation, PR-action, and feedback events can be correlated with Inbox events by `common.sequence`; these events do not establish which surface held focus between interactions.

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
| `agents/windowLayout`, `agents/windowSessionStart`, `agents/firstTimeWindowOpen` | Window lifecycle | layout / session context |
| `agents/sessionOpen` | A session is opened | `source` (`inbox` = from the Inbox, `notification` = from an OS notification), `outcome`, durations |
| `agents/requestSent`, `agents/session*`, `agents/*PullRequest`, `agents/commit*`, `agents/feedback*` | Session / PR / feedback actions | see [sessionsTelemetry.contribution.ts](../../src/vs/sessions/contrib/sessions/browser/sessionsTelemetry.contribution.ts) |

### Sessions Inbox

| Event | Emitted when | Notes |
|---|---|---|
| `agents/inboxImpression` | A card is first shown | The "shown‑but‑not‑acted" negatives for attention analysis. |
| `agents/inboxClick` | A discrete click in the inbox | Coarse `relX`/`relY` **0–9 bins** (a 10×10 grid, never exact coordinates); shares `actionId` with the interaction it triggers. |
| `agents/inboxInteraction` | A semantic action (open, run action, answer, dismiss…) | Rich context: `priorityTier`, `answerKind`/`answerCharCount`, `msSinceItemFirstSeen`, `msSinceSelection`, `result`, `actionId`. |
| `agents/inboxViewState` | View open/close, filter, sort, dwell | |
| `agents/inboxPreviewGenerated`, `agents/inboxDetailSummaryGenerated` | Utility‑model preview / evidence pack generated on demand | Bounded outcome only. |
| `agents/inboxItemLifecycle` | An item enters or leaves the inbox | `outcome` (see [lifecycle](#item-lifecycle-outcomes)), `msInInbox`. |

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
4. Use `common.isAgentsWindow` and `common.sequence` to order events, and `agentSessionId` where available to correlate session-scoped events. The log describes Inbox focus, impressions, clicks, interactions, and lifecycle, not a complete cross-surface focus trajectory.

## Reconstructing from Kusto

In official builds the same events are additionally sent to the OneDataSystem web appender (see
`telemetryService.ts`), so they land in the VS Code telemetry cluster. **The authoritative cluster,
database, table, and column names live in the vscode‑tools Kusto instructions** — consult
[kusto.instructions.md](./kusto.instructions.md) before querying; the sketch below shows only the
shape (property keys are typically lower‑cased in Kusto and numbers/booleans land in `Measures`):

```kql
RawEventsVW
| where EventName startswith "monacoworkbench/agents/"
| where todouble(Measures["common.isagentswindow"]) == 1
| extend Seq = toint(Measures["common.sequence"])
| extend Sid = coalesce(tostring(Properties["agentsessionid"]), tostring(Properties["contextagentsessionid"]))
| order by ClientTimestamp asc, Seq asc
| project ClientTimestamp, Seq, EventName, Sid,
          FromSurface = tostring(Properties["fromsurface"]),
          ToSurface = tostring(Properties["tosurface"]),
          TransitionCause = tostring(Properties["transitioncause"]),
          PreviousFocusedDwellMs = todouble(Measures["previousfocuseddwellms"]),
          Outcome = tostring(Properties["outcome"]),
          Properties, Measures
```

To follow one item/session across the trajectory, add `| where Sid == "<hash>"`.

## Item lifecycle outcomes

`agents/inboxItemLifecycle` records an item entering or leaving the inbox, so the item lifecycle (and
the outcomes that feed the meta‑routing feedback loop) sequence alongside the rest of the trajectory.

The first enabled snapshot is seeded silently, even when empty. Disabling Inbox or hiding AI clears tracking silently; reenabling seeds a new snapshot. Pending-input hydration and Completed-to-PR-card refinement transfer observation time without fabricating entry/removal events. Tracking is window-local, not persisted: `msInInbox` measures observation during this enabled window, not item lifetime across reloads. Late provider arrivals after the initial snapshot count as entries.

| `outcome` | Meaning |
|---|---|
| `entered` | A previously unseen item appeared after the initial enabled snapshot. |
| `reentered` | The same item ID reappeared after leaving during this enabled tracking window. |
| `dismissed` | The user dismissed the item. |
| `removed` | The item left for another reason (answered elsewhere, PR closed, source gone). |
| `unknown` | Reason could not be determined. |

Also carries `notificationKind`, `priorityTier`, `needsInput`, `msInInbox` (dwell before leaving; `0`
on entry), `agentSessionId`, `providerId`. "Agent finished vs. user acted" is reconstructable from the
sequence: a `runAction`/answer `agents/inboxInteraction` immediately preceding a `removed` outcome is
a user‑driven resolution.
