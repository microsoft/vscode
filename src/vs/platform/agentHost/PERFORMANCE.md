# Agent Host startup performance telemetry

Agent Host emits content-free product telemetry through its existing
`ITelemetryService`. This is separate from the opt-in [OTel pipeline](OTEL.md).
It respects the effective usage-telemetry level, including launch-time and
host-configuration restrictions. The same records are available in the Agent
Host log at trace level, without enabling product telemetry.

The client already reports `agentHost.startup` from the start request through
connection, authentication, and the first successful session list. The host
reports `agentHost.startupMark` to explain the work inside that process.
These are different boundaries: host markers do not separately time process
launch, network transport, client authentication, or rendering. Cumulative
first-list and startup-settled measurements can still include waiting for a
client request; they are not substitutes for the client's startup duration.

## Identity and clock

`agentHostSessionId` is a random UUID created with the bootstrap marker recorder
and carried into the primary runtime graph.
It survives client reconnects, multiple clients, and provider restarts, and
changes when the host process restarts. It is not a conversation ID or a user
identifier. Every startup timing carries it explicitly; the telemetry service
also attaches it as `common.agentHostSessionId` to subsequent host events.
It is not an AHP protocol extension and is not available on the client startup
event.

Records have numeric `schemaVersion: 1`, `attempt`, and `timestampMs`, plus
bounded `name`, `provider`, and `hostLaunchKind`. `since` names an explicit
predecessor and `durationMs` is present only when that predecessor was observed.
`outcome` is present when an operation settles, not on start markers.
All timings use Node's producer-local `performance.now()` clock. `timestampMs`
is an offset from that process's performance time origin, not a wall-clock
timestamp. Sort by that offset within one host ID to reconstruct overlaps;
never subtract clocks from different processes.

## Instrumentation API

Record milestones where they happen, rather than carrying timestamps through
startup code and reconstructing intervals at the end:

```ts
startup.mark('bootstrapStart');
// Create the configuration foundation.
startup.mark('configuration', { since: 'bootstrapStart' });
// Initialize telemetry.
startup.mark('telemetry', { since: 'configuration' });
```

Each allowlisted milestone is recorded once per normalized provider, defaulting
to `host`. Data can include the workload metrics below. `since` is explicit: an unrelated or overlapping marker must not
change the meaning of a duration. Dashboards can use the supplied duration or
compute their own deltas from the named markers. A missing predecessor is
logged and the duration is omitted, never silently replaced with zero.

`AgentHostStartupMarks` is the small, service-free bootstrap buffer; the primary
DI graph receives that same instance. Once composition has applied the effective
telemetry configuration, the service's first marker drains the buffered marks
with their original timestamps. No telemetry setter or caller-managed clock is
needed.

For repeated/asynchronous work, `start(operation, provider)` is a scoped helper
over the same marker schema. It emits `<operation>Start`, and its handle's
`complete(outcome, metrics)` emits `<operation>` with `since` pointing to that
start. Pair these markers by **host ID, provider, and attempt**, not just name.
The handle also protects against overlapping requests, stale completions, and
unbounded retries; callers do not manage timestamps or correlation tokens.

Keep operation bookkeeping, workload aggregation and payload construction in
focused helpers, leaving the measured control flow to name boundaries and
outcomes. Aggregate only for an observed operation or a pending first milestone
with collection enabled; skip telemetry-only counting afterward. Helpers reuse
existing snapshots and results, rather than repeating enumeration or database work.

## Boundaries

| Marker | What is measured |
| --- | --- |
| `processStart` | Synthetic marker at Node's performance time origin (`0`), the root of cumulative startup measurements. |
| `bootstrapStart` | Entry into shared runtime bootstrap. |
| `bootstrap` | Node performance time origin through completion of runtime construction; includes entry-module loading and pre-bootstrap work. |
| `configuration` | Entry into shared runtime bootstrap through synchronous foundation creation. |
| `telemetry` | Asynchronous telemetry initialization, including identifier resolution. |
| `services` | Service registration, composition, and contribution activation after telemetry initialization. |
| `hostReady` | Node performance time origin until the entry point's initial transport setup settles. An optional WebSocket startup failure reports `error`, even if another ingress remains usable. |
| `firstSessionList` | Node performance time origin until the first session-list computation succeeds, regardless of which concurrent visibility mode owns the sampled operation handle. Includes the winning computation's workload counts. |
| `startupSettled` | Node performance time origin until both host setup and the first successful listing have settled, immediately before deferred work is released. |
| `providerContext` | Once-per-provider snapshot of the first catalog-access gate check, including activation and local SDK availability. This has no duration and may occur after startup. |
| `sessionList` | A sampled host session-list computation, including its in-computation epoch refreshes. Failed attempts are reported separately until success or the attempt cap. Different visibility modes can overlap; this is not necessarily the first successful listing. |
| `sessionMigration` | Provider catalog import, including enumeration when needed, synchronization, and publication. |
| `sessionMigrationScan` | Provider enumeration for migration, before filtering to migratable sessions. |
| `sessionDiscoveryScan` | Provider enumeration for external-chat discovery, before visibility/subagent filtering. |
| `firstSessionDiscoveryResult` | Node performance time origin until the first provider discovery pass finishes processing its result and synchronously emitting its candidate batches. Also records a processed zero-candidate result when no event is emitted. Does not wait for host registration or imply exhaustive/error-free enumeration. |
| `sessionDiscoveryRegistration` | One received discovery batch's host registration processing: registry snapshots, host filtering, accepted registry writes, catalog synchronization, and existing post-processing. Starts when the batch reaches registration, after its queue wait and any forced migration. Ends after scheduling, **not awaiting**, external-session publication reconciliation. |
| `firstSessionDiscoveryRegistration` | Node performance time origin until the first discovery registration batch completes without an observed registration/post-processing failure or pending catalog synchronization. Includes that batch's counts, independently of operation sampling. Not completion of all batches or all providers. |
| `sessionMetadataScan` | Copilot bulk enumeration used to prewarm metadata on catalog fallback. |

The six `session*` operations also emit corresponding `*Start` markers.
`bootstrap`, `hostReady`, `firstSessionList`, and `startupSettled` are cumulative
milestones, not additive phases. The latter two are independent of the operation
retry cap. They have no `outcome` field; a failed listing cannot emit them.
`startupSettled` includes any wait for the first request on a prestarted server,
so it is not a measure of computation latency alone.
Provider work can overlap them or run later. In particular, external discovery
can be deferred until after the first listing, and Codex can defer enumeration
until explicit use. An observed scan is not necessarily on the startup critical
path: use its start marker and the host milestones to distinguish those cases.
Collection never activates or downloads a provider solely to obtain counts.

The two `firstSessionDiscovery*` milestones are also cumulative, once per
provider, and have no `outcome` field. A provider result can contain only a
subset of its catalog (for example, a truncated Codex scan or Copilot
classification failures). A successful registration is about the received
batch, not the completeness of its source scan. Neither milestone means that
an external row has been published to clients or rendered.

## Startup graph

Square brackets identify emitted markers. Vertical flow shows execution order,
not additive durations; `since` identifies the predecessor used for a duration.
All markers carry the same host-lifetime `agentHostSessionId`.

### Runtime bootstrap and readiness

```text
[processStart @ 0]                         synthetic Node time-origin marker
    |
    | Load entry modules and run pre-bootstrap setup
    v
[bootstrapStart]
    |
    | Create configuration, authentication, proxy and storage foundation
    v
[configuration]                           since: bootstrapStart
    |
    | Await telemetry initialization and identifier resolution
    v
[telemetry]                               since: configuration
    |
    | Register services, compose the runtime and activate contributions
    v
[services]                                since: telemetry
    |
    v
[bootstrap]                               since: processStart
    |
    | Publish buffered markers using effective telemetry consent
    v
Register enabled providers and activate protocol transports
    |
    +-- Provider catalog imports --------------------> See operations below
    |
    +-- Initial transport setup settles
    |       |
    |       v
    |   [hostReady]                       since: processStart
    |       |
    |       +---------------------------------------+
    |                                               |
    +-- Session-list computation                    |
            |                                       |
            v                                       |
        [firstSessionList] -------------------------+--> BOTH reached
                                                           |
                                                           v
                                                   [startupSettled]
                                                   since: processStart
                                                           |
                                                           v
                                                   Deferred maintenance and
                                                   usual external discovery
```

Provider work and session listing can overlap transport startup. `hostReady`
means initial transport setup has settled, not that the first listing has
finished; an optional WebSocket failure can produce `outcome: error` while
another ingress remains usable. The first-list and startup-settled markers do
not depend on the sampled `sessionList` handle: a faster concurrent mode or a
success after three sampled failures still records the real milestones.

### Session and provider operations

Each end marker below has `since` pointing to its corresponding `*Start`.
Operations are paired within the same host ID, provider and attempt.

```text
Existing provider catalog-access check (whichever operation reaches it first)
    [providerContext] + activationState and sdkAvailability
        |
        +-- Enumeration permitted --> Continue to the relevant scan below
        +-- Activation/SDK required --> Defer; no fabricated scan or zero count

Provider catalog import (per provider, when the catalog is enabled)
    [sessionMigrationStart]
        |
        | Reuse the existing backfill decision for migrationState
        |
        +-- If enumeration is needed and available:
        |       [sessionMigrationScanStart]
        |           |
        |           | Enumerate provider sessions
        |           v
        |       [sessionMigrationScan] + scannedSessionCount
        |
        | Synchronize, import and publish, or settle without a scan
        v
    [sessionMigration] + migrationState, migrationForced and available counts

Session-list computation
    [sessionListStart]
        |
        | Read persisted registry
        | Wait for initial provider migration only if the registry is empty
        | Read central catalog
        |
        +-- If Copilot bulk metadata fallback is needed:
        |       [sessionMetadataScanStart]
        |           |
        |           | Enumerate Copilot metadata
        |           v
        |       [sessionMetadataScan] + scannedSessionCount
        |
        | Resolve metadata, apply visibility and live-state overlays
        | Recompute inside this observation if registrations changed
        v
    [sessionList] + per-provider registration counts, visibility and I/O deltas
        |
        +-- First successful computation, even without a sampled handle:
                [firstSessionList] + that computation's workload counts

External-chat discovery (early or deferred)
    [sessionDiscoveryScanStart]
        |
        | Enumerate provider sessions
        v
    [sessionDiscoveryScan] + scannedSessionCount
        |
        | Map, classify, filter and synchronously emit candidate batches
        v
    [firstSessionDiscoveryResult]         since: processStart, including empty

Each emitted batch independently enters the existing per-provider host queue
        |
        | Wait for earlier batches and any required forced migration
        v
    [sessionDiscoveryRegistrationStart]
        |
        | Host filtering, registration, catalog sync and post-processing
        | Schedule external publication reconciliation without awaiting it
        v
    [sessionDiscoveryRegistration] + counts and outcome
        |
        +-- First successful batch, even after the observation cap:
                [firstSessionDiscoveryRegistration]  since: processStart

Coalesced session-list reconciliation and deferred title work run separately
```

Provider processing and host registration can overlap: Copilot emits multiple
batches during one pass, so the first registration can finish before
`firstSessionDiscoveryResult`. Conversely, a provider can finish emitting all
batches before registration starts. Codex can share an enumeration with
migration, so a discovery result need not have a `sessionDiscoveryScan` marker.
Do not pair scans and registration batches by attempt, proximity, or the latest
successful scan. Only pair each operation with its own `*Start` within the same
host, provider, and attempt.

The result milestone observes the first normally completed processing pass,
including zero candidates after filtering or deduplication. Copilot and Codex
do not emit empty candidate events; their result milestone can therefore exist
without a registration operation. Claude's existing empty event still takes
the existing host path. A deferred/unavailable provider, thrown processing
failure, or shutdown-abandoned result does not record this milestone. Later
readiness/discovery can record it, even after scan sampling stops. Provider
restarts do not reset either first-discovery milestone within the host lifetime.

Migration and discovery scans exist for Copilot, Claude and Codex; metadata
prewarming is Copilot-only. Codex scan end markers also include `pageCount` and
`truncated`. Legacy migration or catalog backfill can start discovery before
the startup-settled barrier. Providers may defer scanning until later use, so
not every startup produces every marker.

### Marker locations

| Markers | Where they are set |
| --- | --- |
| `processStart` | Synthesized by [the bootstrap marker recorder](node/agentHostStartupPerformance.ts) with timestamp `0`. |
| `bootstrapStart`, `configuration`, `telemetry`, `services`, `bootstrap` | At the corresponding boundaries in [shared runtime bootstrap](node/agentHostBootstrap.ts). |
| `hostReady` | In `markStartupComplete` in [the agent service](node/agentService.ts), called by [the utility/child-process entry point](node/agentHostMain.ts) or [the standalone server entry point](node/agentHostServerMain.ts). |
| `firstSessionList` | In `_recordSessionListCompleted` in [the agent service](node/agentService.ts), on the first successful computation. |
| `startupSettled` | In `_openStartupSettled` in [the agent service](node/agentService.ts), before the barrier opens. |
| `providerContext` | At existing catalog-access checks in [Copilot](node/copilot/copilotAgent.ts), [Claude](node/claude/claudeAgent.ts) and [Codex](node/codex/codexAgent.ts). |
| `sessionListStart`, `sessionList` | Around `_computeSessions` in [the agent service](node/agentService.ts). |
| `sessionMigrationStart`, `sessionMigration` | Around provider catalog import in [the agent service](node/agentService.ts). |
| `sessionMigrationScanStart`, `sessionMigrationScan`, `sessionDiscoveryScanStart`, `sessionDiscoveryScan` | Around enumeration in [Copilot](node/copilot/copilotAgent.ts), [Claude](node/claude/claudeAgent.ts) and [Codex](node/codex/codexAgent.ts). |
| `firstSessionDiscoveryResult` | After result processing and candidate emission in [Copilot](node/copilot/copilotAgent.ts), [Claude](node/claude/claudeAgent.ts) and [Codex](node/codex/codexAgent.ts), including normally completed empty results. |
| `sessionDiscoveryRegistrationStart`, `sessionDiscoveryRegistration`, `firstSessionDiscoveryRegistration` | In `_registerDiscoveredChatsWithStartupTelemetry`, wrapping registration after the existing queued migration in [the agent service](node/agentService.ts). |
| `sessionMetadataScanStart`, `sessionMetadataScan` | In the SDK enumeration wrapper used by `prewarmSessionMetadata` in [Copilot](node/copilot/copilotAgent.ts). |

## Workload counts

The successful `sessionList` end marker and `firstSessionList` milestone carry
the following metrics when collection was enabled for the computation:

- `registeredSessionCount` and `copilotSessionCount`, `claudeSessionCount`,
  `codexSessionCount`, `otherSessionCount`: registrations **before** visibility
  filtering, from the final computation's existing registry snapshot.
- `visibleSessionCount`, `hiddenSessionCount`, and `stateFallbackCount`: returned
  rows, rows hidden by the external-session mode, and live-state overlay rows.
- `catalogServedCount` and `providerFallbackCount`: rows served from the central
  catalog versus rows requiring provider metadata fallback in the final pass.
- `catalogEnabled` and `externalSessionsMode`: the listing's execution mode.
- `databaseOpenCount` and `databaseStatCount`, when supported by the storage
  service: process-wide counter deltas over the entire computation, including
  epoch refreshes. These include overlapping work, so do not sum them across
  overlapping phases as if they were exclusive I/O counts.

Scan end markers contain `scannedSessionCount`: entries returned by the provider's
existing enumeration **before host filtering**. This can exceed the host's
registration count. It is not a measurement of physical files visited inside an
SDK, nor necessarily a count of unique top-level chats. Codex also reports
`pageCount` and `truncated`; page caps and repeated cursors produce `partial`
observations, not complete catalog-size measurements.

Migration records include synchronized, already-current, excluded, incomplete,
and failed candidate counts. `incompleteSessionCount` includes stale exclusions.
A deferred or unavailable catalog has no scan count, not a synthetic zero.

### Discovery counts

`firstSessionDiscoveryResult` records `candidateSessionCount` and
`externalSessionCount`: candidates actually emitted by that processing pass,
and the subset the provider classified as external. Copilot aggregates all
of its emitted batches after deduplication. Claude counts its unknown chats;
Codex counts new/changed chats, which can include known internal chats.
These are not catalog totals or host registrations.

Copilot also records `filteredSessionCount` (enumerated entries deliberately
not emitted, including known, suppressed, stale and duplicate entries) and
`failedSessionCount` (entries skipped after a caught classification failure).
Claude records its known-chat filtering count. Codex omits filtering counts
because native-subagent filtering happens inside the shared listing path;
Claude and Codex omit failure counts rather than claiming their lower-level
metadata recovery paths were error-free. Missing counts are unknown, not zero.
A zero-candidate result only describes the observed result, not an empty
provider-wide catalog. In particular, retain Copilot's failed count and Codex's
separately observed scan truncation when interpreting coverage.

`sessionDiscoveryRegistration` and `firstSessionDiscoveryRegistration` use
counts from **one received batch**, not accumulated provider totals:

- `candidateSessionCount`: entries in that event.
- `externalSessionCount`: entries the provider marked external, before host
  provenance corrections and visibility filtering.
- `registeredSessionCount`: accepted registry writes, even if later processing
  of that entry fails. This does not count published/visible rows.
- `filteredSessionCount`: entries deliberately skipped without a new
  registration (already registered, subagent/backing, stale, or tombstoned).
- `failedSessionCount`: entries whose processing threw into the registration
  loop's existing per-candidate error handler.
- `incompleteSessionCount`: entries whose catalog synchronization returned
  `pending`.

Counts need not partition the batch: an accepted write can precede a failure
or pending synchronization. Batch-level errors do not invent per-candidate
failures, and cancellation only retains progress actually collected.
An observed per-entry failure, pending synchronization, or caught
post-processing write failure yields `partial`, not `success`, even though
product error handling still logs and continues. An escaping batch error
yields `error`; cancellation or a no-longer-current provider yields `cancelled`.
Recovered failures internal to metadata helpers are not an exhaustive error
count. Publication reconciliation can later fail independently of a successful
registration observation.

For first registration latency, use
`firstSessionDiscoveryRegistration.durationMs`, grouped by provider. It includes
the time before that batch, unlike the sampled registration operation duration.
Keep result-only, partial, missing and late observations separate; do not
manufacture an all-providers-complete timestamp or label either boundary
"visible". The first successful batch may itself be empty or entirely filtered.

For a graph of listing latency by Copilot volume, filter successful
`sessionList` records and group `durationMs` by `copilotSessionCount < 100`,
`== 100`, and `> 100`. Use `firstSessionList.durationMs` for process-relative
first-list latency, and join its counts to `startupSettled` on the host ID for
startup-settled cohorts. Do not substitute a slower concurrent sampled listing
or filter these milestones on `outcome == success`.

For process readiness by **provider-wide** volume, join
`hostReady` to a successful, non-truncated Copilot scan on `agentHostSessionId`.
Select a scan end-marker name explicitly, or deduplicate across scan purposes, before
joining; otherwise migration and discovery can multiply rows. Keep missing
counts separate from zero, and filter out late scans when analyzing startup.
Apply the same approach to Claude and Codex. Numeric and boolean telemetry
fields are measurements, including the schema version and flags.

## Startup context and dashboard cohorts

`hostReady`, `firstSessionList`, and `startupSettled` include a small snapshot:

- `copilotRegistered`, `claudeRegistered`, `codexRegistered`: whether each
  provider is registered at that milestone, not whether it is authenticated,
  connected, or has its SDK installed.
- `catalogEnabled` and `migrateLegacyEnabled`: the frozen decisions, when known.
  Taking the snapshot does not initialize or freeze either decision.
- `externalSessionsMode`: the mode at the milestone; on `firstSessionList`,
  this is the winning computation's mode rather than a concurrent request's mode.

Each observed `sessionMigration` end marker carries `migrationState`:
`backfilled`, `required`, or `unknown` if the existing backfill check failed.
`migrationForced` distinguishes forced enumeration of an already-backfilled
catalog. The values come from the migration's existing decision, before work
runs, and survive deferred/unavailable/error outcomes; telemetry does not
repeat the database read. These describe catalog warmness, not OS cache state.

The `providerContext` snapshot records the first catalog-access decision:

| Field | Values and meaning |
| --- | --- |
| `activationState` | `active` / `inactive` for an explicit activation gate (Codex), `notRequired` when catalog access has no such gate (Copilot and Claude), or `unknown`. |
| `sdkAvailability` | `available` / `unavailable` from an existing no-download check (or the statically imported Copilot SDK), or `unknown` when no catalog check ran or the check failed. |

`inactive` Codex does not perform an extra SDK probe to fill in the snapshot.
An SDK being available does not mean authentication or a provider connection
is ready. Snapshots are never overwritten by subsequent activation, download,
provider restart, or discovery. A backfilled catalog may skip the access check
entirely; a later discovery may be the first check.

For startup cohorts, join a provider snapshot only when its `timestampMs` is at
or before the milestone being analyzed. Treat an absent or later snapshot as
unknown; do not use a check hours later to classify startup. Keep unknown
separate from false, unavailable, and zero. Select one migration attempt and
scan purpose before joining, and retain sample/coverage counts alongside
percentiles. These fields do not provide machine-cache or authentication
cohorts, nor a denominator for launches that fail before telemetry publication.

## Cost and failure handling

The collector observes up to three attempts per allowlisted operation/provider,
stopping after success. Overlapping operations for the same key are not
double-counted. Unknown providers collapse to `other` before keys or telemetry
are retained. Each attempt emits at most two markers; milestones and provider
context snapshots emit once per key. There are no per-session events, timers, performance observers,
additional filesystem reads, SDK calls, or telemetry-triggered background work.
Additional counting uses only already-loaded registry snapshots and discovery
candidate arrays, for an observed operation or a pending first milestone.
`isPending` checks the same normalized milestone keys without reading a clock;
combine it with `isEnabled` before telemetry-only aggregation. Disabled
completions still consume their milestones without payload aggregation, so they
are not replayed after opt-in. Later listings/scans/registrations do not allocate
timing handles or read the clock once their observations and first milestones
are complete.

Markers use the existing telemetry transport without awaiting a flush
on the startup path. Telemetry sink exceptions are logged and cannot fail the
operation. Consent is checked at observation start and emission. Buffered
bootstrap markers are consumed only after telemetry configuration is available;
marks suppressed at that point are not replayed on later opt-in. An operation
begun with usage telemetry off is not retroactively uploaded on opt-in either.

Outcomes are `success`, `error`, `unavailable`, `deferred`, `partial`, and
`cancelled`. Open observations are cancelled on runtime disposal. Failed or
partial attempts keep only measurements actually observed. After three
unsuccessful attempts there are no further operation markers for that key;
`firstSessionList`, `startupSettled`, and `firstSessionDiscoveryRegistration`
still report a later first success. `firstSessionDiscoveryResult` similarly
does not depend on a sampled scan handle.
A start without
an end can indicate in-flight work, a crash, a consent change, or delivery loss;
it is not a successful zero-duration operation. Hard process
termination, failures before telemetry exists, and transport loss can leave
gaps; absence is not evidence of success. Existing process-failure telemetry
continues to cover failures outside the runtime.

The implementation is in
[`node/agentHostStartupPerformance.ts`](node/agentHostStartupPerformance.ts).
Bootstrap records named milestones and publishes them only after
composition has applied the host telemetry configuration. Providers report at
their existing enumeration and processed-result boundaries; the orchestrator
reports at its existing listing, migration and discovery registration boundaries.
Startup telemetry does not use chat lifecycle
contributions, since no turn or hydration hook owns these operations.
