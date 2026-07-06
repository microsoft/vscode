# Plan 27 - Streaming, cancellation and model-call UX

> **For agentic workers:** implement with `superpowers:subagent-driven-development`.
> Small, live-verified, stacked PRs off `main`.
> Context of record: [11-product-review-2026-07.md](../11-product-review-2026-07.md) finding P0-2; model wiring [10-model-integration.md](../10-model-integration.md); streaming was explicitly deferred in decision 58 (plan 16 iter 5) - this plan is that revisit.

**Goal:** Chat feels alive: assistant prose streams token-by-token, tool steps appear as they happen, every in-flight call is cancellable (single-doc chat and project-wide fan-out), and errors offer a visible Retry instead of a dead-end toast.

**Architecture:** Three layers change, all ours: the proxy (`scripts/lwd-anthropic-proxy.js`) passes through Anthropic SSE; the service (`browser/livingDocsService.ts` `_callModel`, used at `:897` and the chat path) grows a streaming variant with `CancellationToken`; the rail (`browser/reviewRailView.ts` `_renderChat`) appends deltas to a live turn.
The JSON edit-proposal contract is the hard part: proposals are parsed from the *complete* response (`parseChatResponse` / `parseMultiChatResponse`, `common/livingDocMarkdown.ts:291,412`), so we stream the conversational prose but only commit proposals at stream end - the user sees words immediately, and diffs land when they are trustworthy.

**Tech stack:** Anthropic Messages API `stream: true` (SSE `content_block_delta`), Node http passthrough in the proxy, `CancellationTokenSource` (`vs/base/common/cancellation`), DOM append in the rail webview-less ViewPane.

## Global constraints

- The renderer speaks only to the localhost proxy; the credential never reaches the renderer (decision 14). Streaming must not change that.
- The no-model heuristic fallback and the single-silent-retry (decision 58) survive; streaming failures degrade to the current non-streaming path before falling back to heuristics.
- All proposals still route through the review engine (decision 17); never apply a partially-streamed edit.
- OpenRouter dev backend (`LWD_BACKEND=openrouter`, decision 44) must stream too (it is SSE-compatible); test both.
- Tabs; externalised UI strings; disposables registered; Australian English; no em dashes.
- `typecheck-client` + `valid-layers-check` clean per PR; screenshots/GIFs to `docs/plans/27-verify/`.

## Current state (exact anchors)

- Proxy: `scripts/lwd-anthropic-proxy.js` - buffers the full upstream JSON response; `/healthz` probe; `MODEL_MAX_TOKENS = 1024`.
- Service: `_hasModel()` probes with a 30 s TTL (`MODEL_PROBE_TTL_MS`); `_callModel(system, user)` returns the full text; chat sends via `sendChatMessage(resource, text)` (`common/livingDocs.ts:283`); busy state via `isChatBusy(resource)` (`:276`); turns are `IChatMessage` with `IChatStep[]` tool rows (`:109-131`).
- Rail: `_renderChat` renders the transcript; a CSS pulse "alive" indicator shows while busy (plan 16 iter 5).
- Fan-out: one model call carries the whole working set (decision 62); the run screen (`browser/screenEditor.ts`, `screenRender.ts`) polls run state; no cancel affordance anywhere.

## Decisions to settle in iteration 1

- **D27-A - streaming transport renderer-side.** `fetch` + `ReadableStream` reader on the proxy response (recommended; the request service does not expose streams cleanly).
  Confirm the web build's workbench CSP allows a streaming fetch to `http://localhost:8090` exactly as it allows the current one (same origin rules; only the read mode changes).
- **D27-B - partial-response salvage on cancel.** Recommendation: on user cancel, keep the streamed prose as the assistant turn (marked "stopped"), discard any proposal JSON, never queue partial edits.

## Iteration plan

### Iteration 1 - Proxy SSE passthrough

- Add `stream: true` support to `scripts/lwd-anthropic-proxy.js`: when the incoming body has `stream: true`, set upstream `stream: true`, pipe the SSE bytes straight through (`res.writeHead(200, {'content-type': 'text/event-stream', 'cache-control': 'no-cache'})`, `upstream.body.pipe(res)`), no buffering.
  Keep the non-streaming path byte-identical for existing callers.
- Handle the OpenRouter backend branch identically (it emits OpenAI-style SSE; normalise in the proxy to Anthropic-shaped `content_block_delta` events so the renderer parses one format - keep the mapping table small and explicit).
- Gate: `curl -N` against the proxy with `stream:true` shows deltas arriving incrementally on both backends; existing non-streaming requests unaffected (run the app once).

### Iteration 2 - Streaming service call + cancellation token

- Add to the service a private `_callModelStream(system, user, onDelta: (text: string) => void, token: CancellationToken): Promise<string>`: fetch with `stream: true`, read the SSE stream, accumulate + emit `content_block_delta.text` deltas, resolve with the full text; on `token` cancellation, abort the fetch (`AbortController`) and reject with a distinguishable `CancelledError`.
- `sendChatMessage` gains a per-document `CancellationTokenSource` stored beside the busy flag; expose `cancelChat(resource: URI): void` on `ILivingDocsService`; on stream failure that is not a cancel, fall back once to the buffered `_callModel` (preserving the decision-58 retry), then to heuristics.
- The final full text goes through the existing `parseChatResponse`/`parseMultiChatResponse` exactly as today - no change to the proposal contract.
- Tests: unit-test the SSE line parser as a pure function (`parseSseChunk` in `common/`), covering split-across-chunk events, `[DONE]`, and malformed lines; service-level test that cancel leaves no pending changes and clears busy state.
- Gate: unit tests green; live single-doc chat streams into the transcript (iteration 3 renders it; for this gate log deltas to console).

### Iteration 3 - The live turn in the rail

- `_renderChat` (`reviewRailView.ts`): while a reply streams, render a live assistant turn that appends delta text (plain text during streaming; run the existing Markdown-ish rendering once at stream end), autoscroll pinned to bottom unless the user scrolled up, keep the pulse indicator until first delta then swap to a subtle caret.
- Replace the composer send button with a **Stop** square while busy; Esc also cancels; a cancelled turn renders the salvage per D27-B with a muted "stopped" tag.
- Error turn: "The model call failed." + inline `Retry` button that re-sends the same user message (reusing the stored turn text), replacing the failed turn.
- Tool steps (`IChatStep`): emit them to the transcript as they occur (the service already builds them sequentially; fire `onDidChange` per step instead of once at the end).
- Gate: live: words appear < 1 s after send on a normal reply; Stop halts within one delta; Retry recovers a killed-proxy send after restart; GIF captured to `27-verify/`.

### Iteration 4 - Cancel the fan-out

- Project-wide runs: thread a `CancellationTokenSource` per run through the orchestrator path (`runAgent`, `browser/agentOrchestrator.ts:183`); the run screen's command strip gains **Stop run** which cancels the in-flight model call and marks unstarted docs "skipped" in the swarm grid (truthful per-tile state, matching plan 23's honesty rule).
- Docs already proposed keep their pending changes (they are reviewable work, not partial writes); the bottom bar totals reflect only what actually ran.
- Gate: start the 14-doc ISMS run, Stop after ~3 tiles; grid shows done/skipped truthfully; review works for the completed docs; no orphaned busy state.

## Acceptance criteria

- [ ] Proxy passes SSE through unbuffered on both backends; non-streaming path unchanged. _(iter 1)_
- [ ] `_callModelStream` + `cancelChat`: deltas, abort, retry-then-fallback ladder; SSE parser unit-tested. _(iter 2)_
- [x] Transcript streams live; Stop/Esc cancel; failed turns offer Retry; tool steps appear as they run. _(iter 3)_
- [x] Fan-out runs are stoppable with truthful per-doc states. _(iter 4)_
- [ ] Proposal parsing still end-of-stream only; no partial edit ever queued; heuristic fallback intact.
- [ ] `typecheck-client` + `valid-layers-check` clean; **0 core patches**.

## Verify approach

`npm run watch`; web build :8080 + proxy :8090 (`LWD_BACKEND=openrouter` for cost, then one Anthropic-OAuth pass).
chrome-devtools MCP drives; capture streaming as a short screencast/GIF frames.
Kill the proxy mid-stream to verify the error → Retry path; throttle via devtools to watch delta pacing.
Log D27-A/D27-B decisions to `docs/07-decision-log.md`.
