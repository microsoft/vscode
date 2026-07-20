# Claude Agent Host — Architecture Consolidation Roadmap

> Derived from the architecture analysis in this folder (`00-SYNTHESIS.md` +
> reports `01`–`05`), produced by the `/improve-codebase-architecture` skill.
> Domain vocabulary: [`../CONTEXT.md`](../CONTEXT.md). Architecture vocabulary:
> Module / Interface / Depth / Seam / Leverage / Locality; deletion test.
>
> **Status:** proposed — not started. Sequence and IDs are stable references for
> the analysis reports; these are **not** feature-phase numbers (do not confuse
> with `roadmap.md` Phase N).

## North star

The four core runtime modules — `ClaudeAgent`, `ClaudeAgentSession`,
`ClaudeSdkPipeline`, `ClaudePromptQueue` — are **correctly wired but blurrily
divided**. There are no true reference cycles (every upward flow is an `Event` or
a `this`-capturing closure) and no confirmed lifecycle bug (the pipeline is
created and disposed exactly once). The friction is: **duplication** (the
rematerializer rebuilds `Options` ~50% copy-pasted from `materialize`), **hidden
back-references** (two avoidable closures), **statefulness** (a six-field
bijective config double-cache; cached enrichment snapshots), **smear** (permission
-mode resolution across 4 files / 8 sites), and **god-objects** (a session with
≥15 responsibilities and no isolated test; an agent that hides a peer-chat
manager).

The target end-state is **focused, legible, testable modules** where:
- the rematerializer *seam* stays (it correctly breaks the Pipeline→Session
  cycle) but carries a **built subprocess from a factory**, not a re-entrant
  closure that duplicates Options-building;
- each cross-cutting concern (config, permission-mode, abort, turn-completion)
  has **exactly one owner**;
- each extracted collaborator has its **own small test surface**, shrinking the
  7010-line `claudeAgent.test.ts`;
- `ClaudePromptQueue` is untouched — it is already the reference shape.

## Guiding constraints

1. **Pure refactors.** No protocol / behaviour change (the sole exception is
   dead-code removal in Tier 0). The full Claude test suite stays green at every
   step; a step is not done until `typecheck-client`, `eslint`,
   `valid-layers-check`, and the Claude unit + integration tests pass.
2. **One PR per step, at a verifiable boundary.** Each step below is sized to
   land independently.
3. **Preserve the load-bearing invariants.** Several subtle behaviours are
   correct-but-fragile; each step names the invariant it must not break:
   - the rematerializer's `markDirty()`-on-failure semantics
     (`claudeAgentSession.ts:568-569`);
   - every post-materialize `session.abortController` reader is
     `!isPipelineReady`-guarded (the controller forks after the first rebind);
   - WarmQuery teardown is idempotent only via SDK `close()` memoization;
   - `materialize` throws if `_pipeline` is already set (once-per-session).
4. **Traceability.** Each step cites its source report and the synthesis
   candidate ID.

## Execution order (dependency-sequenced)

```
  Tier 0 ✅ → C1 ✅ → C9 ✅ → C5 → { C6, C7 }
                  └→ C3 · C4 ✅ · C8   (independent; any time after C1)

  C2 = one owner for live config (desired-on-session vs applied-on-pipeline)
       — folded into C9 (shipped): the immutable pipeline holds only the
       ephemeral `_applied*` dedup, seeded once per build.
  C9 = immutable pipeline / session-orchestrated rebuild (shipped):
       deleted the rematerializer pass-in (claudeAgentSession.ts)
       + the whole in-place swap machinery; superseded C2
```

**Rationale.** Tier 0 first — free interface-shrink, unblocks nothing but clears
noise. **C1 is the keystone**: it removes the duplication *and* the two-phase
init, and it creates the seam that makes C2, C5, and C7 smaller and safer. C2/C3/
C4 are independent of each other and can land in any order after C1. C5 (split
the session) precedes C6/C7 because those operate on the shrunk session. C8 is
independent and can slot in whenever.

**C9 (immutable pipeline)** is the end-state for the rematerializer: sequence it
after C2 (so it inherits a single config owner) and before C5. Highest-value /
highest-risk step — it deletes the last pipeline→session callback (the pass-in at
`claudeAgentSession.ts:476`) and the entire in-place swap machinery.

---

## Steps

Legend — **Serves:** `dup` duplication/rematerializer · `cyc` overlap/circular ·
`life` lifecycle/statefulness.

### Tier 0 — Remove dead code  ·  Serves: cyc  ·  ✅ done
- **Source:** reports 01, 03, 04 (three agents grep-confirmed zero production callers).
- **Goal:** shrink the public surface with no behaviour change.
- **Files:** `claudeAgentSession.ts`, `claudeSdkPipeline.ts`.
- **The change:** delete `ClaudeAgentSession.seedBijectiveState`,
  `ClaudeAgentSession.attachRematerializer`, `ClaudeAgentSession.rebindForClientTools`,
  `ClaudeSdkPipeline.setClientToolOwner`, `ClaudeSdkPipeline.reloadPlugins`.
  Verify each has no production caller (tests may reference some — update or drop
  those tests).
- **Result:** done — also removed the router's orphaned `setClientToolOwner`, two stranded imports, the dead `IRematerializer` re-export, and the `reloadPlugins` test suite. +4 / -102 across 5 files. `typecheck-client` + `eslint` clean; node suite green except the stale compiled `reloadPlugins` test binary (no `watch-client` on this checkout; clears on next build) and 3 unrelated pre-existing timeouts.
- **Acceptance:** grep shows no remaining references; suite green.
- **Risk:** low. Only trap is a test that exercised a now-deleted wrapper — port
  it to the direct call the wrapper forwarded to.

### C1 — Extract an `SdkQueryFactory` (Options + WarmQuery building)  ·  Serves: dup, cyc, life  ·  ★ keystone  ·  ✅ done
- **Source:** report 03; testability payoff in report 05.
- **Goal:** one place builds a `WarmQuery` (+ its `AbortController`) from
  declarative session state; both the first `materialize` and every rebind call
  it. Kill the ~50% duplication and the two-phase `attachRematerializer` init.
- **Files:** `claudeAgentSession.ts` (`materialize` L443-461, the rematerializer
  closure L534-572), `claudeSdkPipeline.ts` (ctor, `_rebindQuery`, `_ensureQueryBound`,
  `send`), `claudeSdkOptions.ts`.
- **The change:** introduce a module that, given `{ model, agent, permissionMode,
  toolDiff, customizationsDiff, workingDirectory, transport, isResume,
  resumeAnchor, canUseTool, onElicitation, serverToolHost }`, produces the SDK
  `Options` and the started `WarmQuery`. The pipeline receives a
  `rebuild: () => Promise<{ warm, abortController }>` (or the factory) **at
  construction**, so `_rebindQuery` no longer depends on a later `attachRematerializer`
  and no longer throws-if-unattached. The initial materialize and the rebuild path
  are the same call with `isResume` / fresh-controller as the only deltas.
- **Preserve:** the `markDirty()`-on-failure semantics (fold into the factory's
  failure path or keep on the session and let the factory rethrow); the
  resume-anchor clear-on-success (`_pendingResumeSessionAt = undefined`).
- **Shipped shape (deviation from the module sketch above):** per the deletion
  test, a standalone module would only relocate the session-state coupling (it
  would have to take the mutable diffs + resume anchor), so instead the two build
  bodies collapsed into ONE private
  `ClaudeAgentSession._startSdkQuery(isResume, abortController)`; the thin
  `_rebuildSdkQuery()` wrapper (holding the `markDirty()`-on-failure retry) is
  passed to the pipeline **at construction**. The pipeline's `attachRematerializer`
  + throw-if-unattached are gone (rematerializer is a required ctor param now); the
  closure-captured `ctx` became an explicit `_sdkStart` field (de-closured).
- **Result:** `buildOptions` now has a single caller; two-phase init removed;
  model/effort no longer derived a third time. Full branch (Tier 0 + C1) is
  +124 / −209. Validated: `typecheck-client` + `eslint` clean; pipeline test 16/16
  (rebind now wired via a ctor-injected fake), agent test 194/194 (real materialize
  path), queue + router green. No isolated Options unit test was added — the
  assembly stays private and is covered via the agent suite; its own test surface
  arrives with C5 (split the session).

### C2 — Sink the bijective config cache wholly into the pipeline  ·  Serves: dup, life  ·  ⬜ proposed
- **Source:** reports 02 (statefulness standout), 04.
- **Goal:** one owner of "what has the SDK been told." Remove a statefulness axis
  from the session.
- **⚠ Reframed by C9.** Do NOT sink *desired* config into the pipeline: C9 makes
  the pipeline immutable, so desired config must live on the SESSION (it has to
  survive a pipeline rebuild). The right split is **desired on the session,
  applied on the pipeline** — which removes the pipeline's `_current*` cache and
  the session↔pipeline desired-config duplication. Under C9 this shrinks to
  cleaning up the per-pipeline `_applied*` dedup, so **C2 largely folds into C9**;
  keep it standalone only to land config cleanup before the bigger C9 reshape.
- **Files:** `claudeSdkPipeline.ts` (`_applied*`/`_current*` L194-201,
  `seedCurrentConfig`, `_replayCurrentConfig`, `setModel/setEffort/setPermissionMode`),
  `claudeAgentSession.ts` (`setModel`/`setAgent`, the `seedCurrentConfig` call,
  effort derivation `resolveClaudeEffort`).
- **The change:** the session hands the pipeline *desired* config only; the
  pipeline owns current-vs-applied and the dirty check. Collapse the two parallel
  six-field sets into one structure. Move effort derivation to the pipeline (or
  pass a resolved effort once, not re-derived per turn). Post-C1, the factory
  already bakes the startup values, so `_replayCurrentConfig`'s redundant re-push
  can be dropped.
- **Preserve:** the "clear effort to `null` when switching to a non-effort model"
  behaviour (Haiku 400 guard, `claudeSdkPipeline.ts:366`).
- **Acceptance:** the session no longer holds applied/current config; one dirty
  check; suite green including the model-switch effort tests.
- **Risk:** medium — the mid-turn-safe setter semantics must survive.

### C3 — One owner for permission-mode resolution  ·  Serves: dup  ·  ⬜ proposed
- **Source:** report 04 (8 sites across 4 files).
- **Goal:** the `readClaudePermissionMode(cfg,uri) ?? overlay ?? 'default'`
  fallback chain lives once. (Aligns with the project rule: domain logic belongs
  in the domain service, not re-implemented in consumers.)
- **Files:** `claudeSessionPermissionMode.ts` (home for the resolver),
  `claudeAgent.ts` (sites at ~936, 1066, 1342, 1475), `claudeAgentSession.ts`
  (sites at ~439, 535, 700).
- **The change:** a single `resolvePermissionMode(uri, fallback?)` owning the full
  chain; every site delegates. Keep the pure `narrowClaudePermissionMode` where it is.
- **Acceptance:** one resolution function; the `?? … ?? 'default'` tail appears
  once; suite green.
- **Risk:** low.

### C4 — Queue owns abort/done; delete the two back-reference closures  ·  Serves: cyc, life  ·  ✅ shipped
- **Source:** report 01 (closure inventory).
- **Goal:** remove the two avoidable dotted edges from the coupling map.
- **Files:** `claudeSdkPipeline.ts` (`_getAbortSignal` L245, `_onSteeringYielded`
  L246, `_wireAbortHandler`), `claudePromptQueue.ts` (`iterable.next` abort check
  L66, `notifyAborted` L163, `resetForRebind`).
- **The change:** (a) the queue owns a `_done` boolean set by `notifyAborted` and
  cleared by `resetForRebind`, so `next()` no longer reads the pipeline's live
  controller through `_getAbortSignal` — delete that closure. (b) expose steering
  -yielded as `ClaudePromptQueue.onDidYieldSteering: Event`, matching the existing
  router→pipeline `Event` pattern; the pipeline subscribes instead of injecting a
  callback.
- **Preserve:** the parked-`next()` wake semantics; abort must still return
  `{ done: true }` promptly.
- **Acceptance:** the queue no longer receives a `() => AbortSignal`; steering is
  an `Event`; `claudePromptQueue.test.ts` updated; suite green.
- **Risk:** low-medium — verify the post-rebind path still wakes the parked
  iterator (the `_done`-cleared-on-`resetForRebind` timing).

### C5 — Split the god-object session  ·  Serves: cyc, life  ·  ⬜ proposed
- **Source:** report 04 (≥15 responsibilities), report 05 (no isolated test).
- **Goal:** move the session toward "coordinator"; give the extracted pieces test
  surfaces.
- **Files:** `claudeAgentSession.ts`.
- **The change (two extractions, can be two sub-PRs):**
  - `SessionPendingState` — the pending-permission + pending-user-input
    `PendingRequestRegistry`s plus `requestPermission` / `requestUserInput` /
    `respond*` / `denyAll`-on-abort. It needs only the `chatChannelUri` + the
    progress emitter, not the whole session.
  - Credit accounting (`_currentTurnNanoAiu`, `recordTurnCredits`,
    `_enrichSignalWithCredits`) + MCP-contributor enrichment
    (`_enrichSignalWithMcpContributor`, `_lastCustomizations`) into a signal
    transform the pipeline output passes through — and prefer *deriving* the MCP
    contributor over caching `_lastCustomizations`.
- **Acceptance:** each extraction has a dedicated unit test; the session file
  shrinks; suite green.
- **Risk:** medium — the enrichment cache removal must not change emitted signals.

### C6 — Extract the peer-chat manager out of `ClaudeAgent`  ·  Serves: cyc  ·  ⬜ proposed
- **Source:** report 04 ("two modules in a trench coat").
- **Goal:** the agent becomes the `IAgent` surface again; peer-chat backing gets
  its own seam and test surface.
- **Files:** `claudeAgent.ts` — `_chatBackings`, `_createChat`, `_forkChat`,
  `_materializeChatLocked`, `_buildProvisionalChat`, `_resolveParentSession`,
  `materializeChat`, `_updateChatBackingModel`, `_resolveChatSdkId`,
  `_resolveChatBacking`, `_ensureSessionEntry` (~17 members).
- **The change:** move the peer-chat lifecycle into its own module that the agent
  delegates to; the agent keeps only the `IAgent.chats` surface wiring.
- **Acceptance:** the peer-chat module has its own tests; `claudeAgent.test.ts`
  shrinks; suite green.
- **Risk:** medium — the `_sessionSequencer` keying (session id vs chat key) must
  be preserved exactly; this is where the concurrency invariants live.

### C7 — Model Provisional vs Materialized as two types  ·  Serves: life  ·  ⬜ proposed
- **Source:** report 02 (AbortController divergence, `isPipelineReady` branching).
- **Goal:** make the session's phase legible in the type system; make the
  AbortController divergence unrepresentable.
- **Files:** `claudeAgentSession.ts` (`isPipelineReady`, `_requirePipeline`, raw
  `abortController` exposure), and every caller that branches on `isPipelineReady`
  / reads `session.abortController` (`claudeAgent.ts` ~1186, 1194, 1825, 1945, 2218).
- **The change:** a provisional type exposing `abortProvisional()` and
  `materialize(): MaterializedSession`; the materialized type never exposes the
  raw controller. Callers hold the phase in the type instead of branching on a
  boolean.
- **Acceptance:** no caller reads a raw `abortController`; `isPipelineReady`
  branches collapse into type-level distinction; suite green.
- **Risk:** medium-high — touches many call sites; do after C5 when the session is
  smaller. Could be scoped down to just hiding the controller behind
  `abortProvisional()` if the full type split is too invasive.

### C8 — Unify subprocess teardown into one awaitable verb  ·  Serves: life  ·  ⬜ proposed
- **Source:** report 02 (three teardown spellings, H1/H2).
- **Goal:** one teardown path whose safety doesn't rest on SDK `close()`
  memoization being an implementation detail.
- **Files:** `claudeSdkPipeline.ts` (`shutdownAndWait` L288, the dispose-chain
  `toDisposable` L259-262, the manual `oldWarm.asyncDispose` in `_rebindQuery`).
- **The change:** funnel all three through one internal awaitable teardown that is
  explicitly idempotent (guard a `_torndown` flag rather than relying on SDK
  memoization); document which callers need to *await* exit (`shutdownAndWait`,
  for same-`--session-id` reuse) vs fire-and-forget (dispose).
- **Acceptance:** one teardown implementation; the double-asyncDispose is guarded
  in our code, not just the SDK; suite green.
- **Risk:** low-medium — must still await real subprocess exit on the remove-all
  path (the CLI rejects a fresh spawn while `<id>.jsonl` exists).

### C9 — Immutable pipeline / session-orchestrated rebuild  ·  Serves: cyc, life  ·  ★ removes the rematerializer  ·  ✅ shipped
- **Source:** the "Option B" design conversation (2026-07-16). Enabled by C1's
  `_startSdkQuery` extraction; explicitly requested.
- **Goal:** `ClaudeSdkPipeline` owns exactly ONE `WarmQuery` for its whole life
  (never swapped). A rebind becomes: the SESSION disposes the old pipeline and
  constructs a fresh one seeded from current state via `_startSdkQuery`. Nothing
  is handed to the pipeline to call back out — the rematerializer pass-in at
  `claudeAgentSession.ts:476` disappears, and the entire in-place swap machinery
  is deleted.
- **Files:** `claudeSdkPipeline.ts` (remove `_rematerializer`, `_rebindQuery`,
  `_needsRebind` self-heal, the `_runConsumerLoop` re-arm + `_processMessages`
  swap guards; make `_warm` / `_abortController` `readonly`; expose a terminal
  `isDead`), `claudeAgentSession.ts` (its `send` pre-flight becomes the single
  "reuse vs rebuild" decision — it already checks `toolDiff.hasDifference ||
  clientCustomizationsDiff.hasDifference || _pendingResumeSessionAt`; it gains
  `|| pipeline.isDead` and, instead of `pipeline.rebindForRestart()`, disposes the
  old pipeline and builds a new one).
- **Removed state / control flow (the payoff):**
  - `_rematerializer` (the pass-in at :476) — GONE.
  - `_rebindQuery` (~50 lines: placeholder controller, dispose-during-rebind and
    aborted-during-rebind gates) — GONE.
  - `_needsRebind` self-heal — GONE (pipeline reports terminal `isDead`; it never
    resurrects itself).
  - `_abortController` SWAP + the session/pipeline controller divergence
    (report 02 H4) — GONE (`readonly`; one controller per pipeline).
  - consumer-loop handoff (`_runConsumerLoop` re-arm; `_processMessages`
    `this._query !== query` guards) — GONE (old loop ends; the new pipeline's
    starts).
  - the pipeline's `_current*` desired-config cache — GONE (desired lives on the
    session; each new pipeline is seeded once). This is why **C9 supersedes most
    of C2**.
- **The crux to grill — queue + steering across a rebind.** Today the queue
  SURVIVES a rebind (`resetForRebind` re-parks the same instance). An immutable
  pipeline means a rebind = a FRESH queue: the old pipeline's pending entries fail
  on dispose and the session re-queues the current prompt onto the new pipeline.
  Rebind only fires on the `send` pre-flight (between turns, or recovering a dead
  query — never mid-turn), so this is *likely* safe, but the M10 steering-preempt
  path and in-flight-entry handling MUST be re-verified. This is the load-bearing
  design question.
- **Preserve:** abort-during-rebuild races (now covered by the session's existing
  materialize-style abort gates, not the pipeline's placeholder dance); the resume
  anchor semantics; that a dead query stays awaitable for teardown
  (same-`--session-id` reuse on remove-all / `shutdownAndWait`).
- **Depends on:** C1 (done). **Config ownership settled** (see `../CONTEXT.md` M5):
  desired-on-session, applied-on-pipeline, no host-side staging; the pipeline
  sheds `_current*` + `_replayCurrentConfig`. **C2 folds into C9.**
- **Acceptance:** `claudeSdkPipeline.ts` has no `_rematerializer` / `_rebindQuery`
  / query-swap; its constructor takes no rebuild hook; rebind is a session concern;
  pipeline + agent suites green (rebind, abort-recovery, steering, truncate-restore
  all still pass).
- **Risk:** HIGH. Touches the consumer loop, steering/M10, and abort races — the
  most delicate machinery in the four files. Its own PR, with the queue question
  settled up front.

---

## Open questions (grill before implementing)

- **C1:** does the factory take the session by a narrow interface or a flat value
  bag? Where does `markDirty()`-on-failure live — factory or session?
- **C2:** is `permissionMode` part of the same cache as model/effort, or its own
  thing given it has a live runtime setter (`Query.setPermissionMode`) while
  effort does not?
- **C4:** does `onDidYieldSteering` need to stay synchronous with the yield
  (steering-consumed ordering, CONTEXT M10) — i.e. can it be an `Event` without
  changing when `steering_consumed` fires?
- **C5:** do the pending registries need the session at all, or just the
  `chatChannelUri` + the progress emitter?
- **Queue tension (unsettled):** report 05 calls the queue the *reference* module;
  report 04 calls its split the *weakest* (turn-completion is co-owned with the
  pipeline via `settleHead` vs `_processMessages`). Decide whether the
  `ChatTurnComplete` decision moves entirely to one side. Not scheduled above
  until resolved.
- **C9 — queue/steering across a rebind (verify, likely benign):** an immutable
  pipeline yields a FRESH queue on rebuild. Traced 2026-07-16: the queue is always
  EMPTY at rebind (rebind fires only on the `send` pre-flight — between turns — or
  post-abort where `failAll` already cleared it; steering only exists mid-turn, so
  it never coexists with a rebuild). So nothing migrates. Must be re-confirmed with
  the steering + truncate-restore tests once implemented. (Config-home is settled —
  see the C9 entry / `../CONTEXT.md` M5.)
- **C9 — agent becomes a live setter (decided; confirm before deleting the rebuild).**
  Treat `agent` like `model`: a live `applyFlagSettings({ agent })` on the pipeline
  (deduped vs `_appliedAgent`), no rebuild. The code's prior "no-op" finding is
  believed stale (SDK docs now specify next-turn application incl. the agent's model
  override / hooks / system prompt). One fewer rebuild trigger → leaner C9. **Gate:**
  a ~15-min live E2E must confirm the runtime swap actually applies before the
  `markDirty()`-on-agent-change rebuild is removed — a silent no-op is worse than a
  restart.

## Non-goals

- **Not fixing a disposal bug** — the audit found none. C7/C8 buy *legibility and
  less state*, not a leak fix. Don't let the effort masquerade as bug-hunting.
- **The rematerializer seam is removed in phases, not kept forever.** C1 keeps it
  but changes its currency (a thin `_rebuildSdkQuery` passed at construction, not
  a fat closure). **C9** is where it actually goes away — by making the pipeline
  immutable so nothing is passed in to call back out. Folding the pipeline into
  the session (the *other* way to remove it) stays a non-goal: that just rebuilds
  the god-object.
- **Not chasing "5 modules" as a target** — the count is a consequence of taking
  C5–C7, not a goal. A maintainer can stop after C1+C5 and still win.
- **No protocol / IAgent surface change** — this is internal consolidation only.
