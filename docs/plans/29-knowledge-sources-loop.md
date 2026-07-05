# Plan 29 - Knowledge, sources and real MCP

> **For agentic workers:** implement with `superpowers:subagent-driven-development`.
> Small, live-verified, stacked PRs off `main`.
> Context of record: [11-product-review-2026-07.md](../11-product-review-2026-07.md) findings P0-3 and P1-1; format spec [08](../08-living-documents-format-spec.md); the `mcp` source kind has been an honest stub since decision 9.

**Goal:** The Knowledge screen becomes the project's real source library (every bound source, its kind, freshness, and which documents depend on it), bound figures answer "where from, how fresh" on hover, the `mcp` source kind actually resolves, and there is a first credential story for authenticated sources.

**Architecture:** The data already exists: the lock's `bindings` (`IBindingEntry`: resolved/source/sourceHash/syncedAt/appliedBy/kind) and `context` entries, plus the orchestrator's reverse-edge graph (`browser/agentOrchestrator.ts`), together describe every source → document dependency.
Knowledge is a projection of that graph rendered in `screenRender.ts`; the freshness affordance is a PM decoration tooltip; MCP resolution goes through the localhost proxy (same trust boundary as model calls, decision 14) so credentials stay out of the renderer.
Our-surface + proxy script; 0 core patches expected.

**Tech stack:** existing contrib; proxy (`scripts/lwd-anthropic-proxy.js`) gains a `/mcp` route implementing MCP client-over-stdio for locally configured servers.

## Global constraints

- **Real data only**: Knowledge lists sources actually referenced by documents in the folder (`bind:` links, `sources:`/`context:` frontmatter); org-scope stays a labelled "Soon" only if iteration 4 slips - never fake org content.
- Credentials never in the renderer or in the lock (decision 14 extended): secrets live server-side with the proxy; the lock stores only source identity + hashes.
- Provenance rendering stays escape-on-render safe (the [04](../04-risks-and-predictions.md) injection invariant): MCP/API payloads are text, never markup.
- Tabs; nls strings; disposables; Australian English; no em dashes.
- `typecheck-client` + `valid-layers-check` clean per PR; screenshots to `docs/plans/29-verify/`.

## Current state (exact anchors)

- Source kinds: `SourceKind = 'file' | 'api' | 'mcp'` (`common/livingDocsModel.ts`); `file` and `api` resolve; `mcp` parses and round-trips only (decision 9).
- Bindings: `IBindingEntry` carries `syncedAt` + `sourceHash` - freshness data is already persisted per bind key.
- Provenance UX: gutter dot → source-peek drawer (`getSourcePeek`, `common/livingDocs.ts:315`); `revealSource` falls back to the CSV for non-file kinds ([04](../04-risks-and-predictions.md) "provenance is shallow").
- Knowledge screen: "Soon" stub with Org/Project tabs (plan 17 iter 7).
- Bound figures: PM `bound_figure` atoms (decision 46) - no tooltip today.
- Reverse edges: the orchestrator's dependency graph maps sources → dependent docs (`agentOrchestrator.ts`, dirty-queue block `:259`).

## Decisions to settle in iteration 1

- **D29-A - Knowledge information architecture.** Recommendation: one Project tab shipping now - a SOURCES table (kind icon, name, kind, `syncedAt` relative, freshness dot, "used by N docs") + a detail drawer per source (the documents and bind keys that depend on it, with jump-to-doc).
  Org tab stays visibly "Soon" until a real org store exists (do not fabricate).
- **D29-B - MCP server configuration.** Recommendation: `mcp.json` at the folder root (`{ servers: { crm: { command: 'npx', args: [...] } } }`), executed by the proxy (which owns process + credentials); bind syntax stays `bind:key@mcp:server.tool/field` as parsed today.
- **D29-C - secret storage.** Recommendation: proxy-side `~/.abstract/secrets.json` (0600) keyed by server name, set via a proxy CLI (`node scripts/lwd-anthropic-proxy.js set-secret crm ...`); the app shows "connected / needs credentials" state only. Desktop-native safe storage is a later upgrade; never the workspace folder.

## Iteration plan

### Iteration 1 - The source registry (data layer)

- Service: `listSources(): Promise<readonly ISourceInfo[]>` where `ISourceInfo { id: string; kind: SourceKind; label: string; syncedAt: string | undefined; fresh: boolean; usedBy: readonly { doc: URI; keys: readonly string[] }[] }` - built by folding every loaded doc's lock `bindings` + `context` with the orchestrator's reverse edges; no new persistence, pure projection.
- Freshness: `fresh` = current source hash equals the lock's `sourceHash` (reuse `_recomputeFreshness` logic, `livingDocsService.ts:645`; extract the hash-compare into a shared helper rather than duplicating).
- Tests: a two-doc fixture sharing one CSV yields one source row with `usedBy` length 2 and correct keys; api source carries kind `'api'`.
- Gate: unit tests green.

### Iteration 2 - The Knowledge screen, real

- Replace the stub in `screenRender.ts` with D29-A: the SOURCES table + per-source detail drawer (in-screen, comp-card style - never a split editor, G1).
- **Add source** becomes real for the two working kinds: file picker scoped to the folder's data files (reuses the plan-13 in-app picker, decision 40) and an API URL row (label + URL + optional JSON-path template, matching what `api` bindings already store).
  Adding a source updates the target doc's `sources:` frontmatter through the existing service write path.
- **Remove** detaches a source from a chosen doc (edits frontmatter; bind links referencing it flag as unresolved in the editor rather than silently keeping stale values - surface via the existing stale-binding mechanism).
- Remove the screen's "Soon" labels for shipped actions; Org tab keeps a single honest "Soon" chip per D29-A.
- Gate: live: table reflects the sample folder truthfully; add + remove round-trip; jump-to-doc opens the editor; screenshots to `29-verify/`.

### Iteration 3 - Freshness on the figure (hover provenance)

- PM bundle: extend the `bound_figure` atom's DOM with `data-bind-key`; no rebuild needed if the attribute already renders - check `lwdpm-entry.js` first; otherwise rebuild per [../lwd-pm-bundle-build.md](../lwd-pm-bundle-build.md).
- In the doc webview (`browser/livingDocRender.ts`): on figure hover, a quiet tooltip card: `metrics.csv · row 7 · synced 2 h ago` (+ amber "source changed since" line when stale), data supplied by extending the existing render message payload with per-key `{ source, location, syncedAt, fresh }` from the lock.
  Click behaviour (source-peek drawer) is unchanged.
- The same tooltip on gutter dots (they already carry the block association in `buildPmDecorationSpec`, `common/livingDocPmDecorations.ts:106`).
- Gate: hover any bound figure → truthful tooltip; stale source shows the amber line; nothing shifts layout (the tooltip floats).

### Iteration 4 - MCP resolves + API auth

- Proxy: implement D29-B/D29-C - `/mcp/resolve` route: `{ server, tool, args, field }` → spawn/reuse the configured MCP server (stdio JSON-RPC: `initialize`, `tools/call`), extract `field` from the result, return `{ value, raw }`; 10 s timeout; structured errors.
- Service: implement the `mcp` branch of source resolution (beside the `api` fetch), calling the proxy; `revealSource`/source-peek for `mcp` and `api` kinds shows the raw response payload with the extracted field highlighted (closing the "falls back to the CSV" gap) instead of pretending to be a file.
- API auth: allow `api` sources to name a proxy-side secret (`auth: crm-token` in the source entry); the proxy injects the header; the renderer never sees it.
- Ship a demo `mcp.json` + a tiny local MCP server script under `scripts/` (e.g. serving rows from a JSON file) so the E2E is reproducible offline.
- Tests: MCP JSON-RPC framing unit-tested in the proxy script's test (plain node test, like the existing proxy checks); service-side: `mcp` binding resolves through a stubbed proxy response; unresolved server → binding flagged, doc still renders.
- Gate: live E2E: a doc bound to `bind:pipeline@mcp:demo.query/total` resolves a real value via the demo server; source-peek shows the MCP payload; killing the server degrades to a flagged stale binding, not an error toast.

## Acceptance criteria

- [ ] `listSources` projection with dependency fan-in; unit-tested. _(iter 1)_
- [ ] Knowledge screen: real SOURCES table + detail drawer + working Add/Remove; only the Org tab remains "Soon". _(iter 2)_
- [ ] Bound figures + gutter dots answer "where from, how fresh" on hover, truthfully. _(iter 3)_
- [ ] `mcp` kind resolves end-to-end via the proxy; `api`/`mcp` source-peek shows the real payload; API auth via proxy-side secrets. _(iter 4)_
- [ ] Credentials never appear in renderer code, the lock, or the workspace folder.
- [ ] `typecheck-client` + `valid-layers-check` clean; **0 core patches**; Knowledge design-match >= 90%.

## Verify approach

`npm run watch`; web :8080 + proxy :8090; chrome-devtools drives.
E2E: sample folder → Knowledge shows CSV + GitHub API + demo MCP source → hover tooltips → break a source (edit the CSV) → freshness flips everywhere (screen, tooltip, context tab).
Desktop pass for the MCP stdio spawn (web build cannot spawn; the proxy does the spawning, so web works too - verify both).
Log D29-A/B/C to `docs/07-decision-log.md`.
