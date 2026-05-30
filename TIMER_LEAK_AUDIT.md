# Timer Leak Audit — `setTimeout` / `setInterval` (2026-05-30)

Audit of every `setTimeout` / `setInterval` call site in production code (`src/vs/**` and `extensions/**`), excluding tests, fixtures, build scripts, minified webview bundles, vendored test schedulers, and `*.d.ts`.

## Methodology

- Fan-out: 13 parallel subagents, each owning a non-overlapping partition.
- Each site read in its enclosing class + `dispose()` context.
- A site is reported **only** if at least one of these is true:
  1. **Accumulation** — handle stored in a field/variable and overwritten by a re-firing event without first calling `clearTimeout` on the previous value.
  2. **Leak on dispose** — timer captured by a member field of a long-lived/disposable class; callback captures `this`; `clearTimeout` is missing from `dispose()`.
  3. **Captured-store race** — `setTimeout(() => store.dispose(), N)` where `store` is a class field that may already be disposed when the timer fires.
  4. **Style candidate** — open-coded cancel-then-arm pattern (would be cleaner as `disposableTimeout` / `MutableDisposable`); reported as **L** only.
- Excluded patterns (intentional, not leaks): `await new Promise(r => setTimeout(r, ms))`, shutdown timers (`process.exit`), one-shot UX/accessibility signals with no captured field, defer-dispose of a *local* variable (`setTimeout(() => x.dispose(), 0)`), module-level startup probes that clear on connect, polling that the outer cancellation token tears down.

## Totals

| Severity | Count |
|---|---|
| **H** (definite leak — long-lived field never cleared, or accumulates per event) | **5** |
| **M** (dispose-during-pending-timer race, or bounded re-arm without clear) | **10** |
| **L** (`disposableTimeout` / `MutableDisposable` candidate; doesn't leak today) | **6** |
| **Total** | **21** |

Areas with **zero findings** (verified clean): `src/vs/editor/**`, `src/vs/workbench/contrib/chat/**`, `src/vs/sessions/**`, `extensions/npm/**`, `extensions/terminal-suggest/**`, and all theme/grammar-only extensions.

---

## High severity (5)

### H1 — `CommentNode` retains itself for 3 s after dispose
- File: [src/vs/workbench/contrib/comments/browser/commentNode.ts](src/vs/workbench/contrib/comments/browser/commentNode.ts#L735)
- Class: `CommentNode`
- Snippet: `this._clearTimeout = setTimeout(() => { this.domNode.classList.remove('focus'); }, 3000);`
- Why: Stored in a field, callback captures `this`. `dispose()` never calls `clearTimeout(this._clearTimeout)`, so a disposed node is retained until the 3 s timer fires.
- Fix: Add `clearTimeout(this._clearTimeout)` in `dispose()`, or assign via a `MutableDisposable<IDisposable>` wrapping `disposableTimeout(...)` from [src/vs/base/common/async.ts](src/vs/base/common/async.ts).

### H2 — `GitFileSystemProvider` 5-min interval is never cleared
- File: [extensions/git/src/fileSystemProvider.ts](extensions/git/src/fileSystemProvider.ts#L58)
- Class: `GitFileSystemProvider`
- Snippet: `setInterval(() => this.cleanup(), FIVE_MINUTES);`
- Why: Created in constructor, handle is **discarded**, not added to `this.disposables`. The callback captures `this` and fires forever; on workspace teardown the provider can never be GC'd.
- Fix: `this.disposables.push(toDisposable(() => clearInterval(this._cleanupInterval)));` after capturing the handle, or wrap in `IntervalTimer` from `vs/base/common/async`.

### H3 — `ReviewServiceImpl` interval not cleared in dispose
- File: [extensions/copilot/src/platform/review/vscode/reviewServiceImpl.ts](extensions/copilot/src/platform/review/vscode/reviewServiceImpl.ts#L136)
- Class: `ReviewServiceImpl`
- Snippet: `this._monitorActiveThread = setInterval(() => { ... }, 500);`
- Why: Field-stored interval is only cleared by a "no more comments" code path. If the service is disposed while comments are still tracked, the 500 ms interval (executing VS Code commands and capturing `this`) outlives the service indefinitely.
- Fix: `clearInterval(this._monitorActiveThread)` in `dispose()`; reset to `undefined`.

### H4 — `SurveyService` 5-minute timer scheduled in ctor, no dispose
- File: [extensions/copilot/src/platform/survey/vscode/surveyServiceImpl.ts](extensions/copilot/src/platform/survey/vscode/surveyServiceImpl.ts#L53)
- Class: `SurveyService`
- Snippet: `setTimeout(async () => { await this.updateUsageData(false); ... }, INACTIVE_TIMEOUT);`
- Why: Untracked handle, captures `this`, no `IDisposable` on the class. Timer runs and executes async work even after the extension/service is torn down.
- Fix: Implement `Disposable`; store handle; `clearTimeout` in `dispose()`.

### H5 — Markdown preview `#scrollingTimer` not cleared on dispose
- File: [extensions/markdown-language-features/src/preview/preview.ts](extensions/markdown-language-features/src/preview/preview.ts#L372)
- Class: `MarkdownPreview`
- Snippet: `this.#scrollingTimer = setTimeout(() => { this.#isScrolling = false; }, 200);`
- Why: Sibling `#throttleTimer` is cleared in `dispose()` (line 217) but `#scrollingTimer` is not. A preview disposed mid-scroll keeps the instance alive for ~200 ms via the captured `this`.
- Fix: Add `clearTimeout(this.#scrollingTimer)` alongside the existing `clearTimeout(this.#throttleTimer)`.

---

## Medium severity (10)

### M1 — `UserAttentionServiceEnv` debounce timer leaks on dispose
- File: [src/vs/workbench/services/userAttention/browser/userAttentionBrowser.ts](src/vs/workbench/services/userAttention/browser/userAttentionBrowser.ts#L125)
- Class: `UserAttentionServiceEnv` (extends `Disposable`)
- Snippet: `this._activityDebounceTimeout = setTimeout(() => { this._isUserActive.set(false, undefined); ... }, 500);`
- Why: Re-armed on every keyboard/mouse event but `dispose()` doesn't clear it; pending callback fires `.set()` on observables after dispose.
- Fix: Override `dispose()` to `clearTimeout(this._activityDebounceTimeout)`.

### M2 — `EditorPart` D&D opener timeouts not cleared on dispose
- File: [src/vs/workbench/browser/parts/editor/editorPart.ts](src/vs/workbench/browser/parts/editor/editorPart.ts#L1189)
- Class: `EditorPart.setupDragAndDropSupport`
- Snippet: `horizontalOpenerTimeout = setTimeout(() => openPartAtPosition(...), 200);` (and the vertical one)
- Why: Locals captured in drag handlers; if disposed during a drag-hover, the callback runs against torn-down services.
- Fix: Register both via the part's `DisposableStore` (e.g. `disposableTimeout`) or clear in a `dragend`/`dispose` path.

### M3 — `SCMInputWidget._validationTimer` not cleared on dispose
- File: [src/vs/workbench/contrib/scm/browser/scmInput.ts](src/vs/workbench/contrib/scm/browser/scmInput.ts#L562)
- Class: `SCMInputWidget`
- Snippet: `this._validationTimer = setTimeout(() => this.setValidation(undefined), SCMInputWidget.ValidationTimeouts[validation.type]);`
- Why: The setter clears the previous timer (good), but `dispose()` (line 831) doesn't — pending timer fires `setValidation` on a disposed widget.
- Fix: `clearTimeout(this._validationTimer)` in `dispose()`.

### M4 — `AbstractDebugAdapter` request timeout outlives disposal
- File: [src/vs/workbench/contrib/debug/common/abstractDebugAdapter.ts](src/vs/workbench/contrib/debug/common/abstractDebugAdapter.ts#L81)
- Class: `AbstractDebugAdapter`
- Snippet: `const timer = setTimeout(() => { clearTimeout(timer); ... }, timeout);`
- Why: Per-request timer is a local; if the request never resolves and the adapter is disposed, the closure (capturing the pending-requests map) lives until the timeout fires (potentially seconds–minutes).
- Fix: Track per-request timers in a `DisposableMap` and dispose on adapter `dispose()`.

### M5 — `LocalStorageURLCallbackProvider.checkCallbacksTimeout`
- File: [src/vs/code/browser/workbench/workbench.ts](src/vs/code/browser/workbench/workbench.ts#L366)
- Class: `LocalStorageURLCallbackProvider`
- Snippet: `this.checkCallbacksTimeout = setTimeout(() => { this.checkCallbacksTimeout = undefined; this.checkCallbacks(); }, 1000 - ellapsed);`
- Why: Field accumulates across storage events; `dispose()` does not clear it; the pending callback retains the instance.
- Fix: Override `dispose()` to `clearTimeout(this.checkCallbacksTimeout)`.

### M6 — `ExtensionUrlHandler` deferred drain timer leaks `this`
- File: [src/vs/workbench/services/extensions/browser/extensionUrlHandler.ts](src/vs/workbench/services/extensions/browser/extensionUrlHandler.ts#L150)
- Class: `ExtensionUrlHandler`
- Snippet: `setTimeout(() => cache.forEach(([uri, option]) => this.handleURL(uri, option)));`
- Why: Handle never stored; the next-tick callback captures `this`. If disposed in the same tick, the instance is retained until the tick runs.
- Fix: Store handle; `clearTimeout` in `dispose()` (or use `disposableTimeout` registered on the class's `Disposable` store).

### M7 — `McpGatewayService` port-startup timeout not tied to dispose
- File: [src/vs/platform/mcp/node/mcpGatewayService.ts](src/vs/platform/mcp/node/mcpGatewayService.ts#L289)
- Class: `McpGatewayService._startServer`
- Snippet: `const portTimeout = setTimeout(() => { deferredPromise.error(...); }, 5000);` (cleared in connect handlers, not in `dispose()`)
- Why: If the service is disposed during the 5 s startup window, the timer still fires and errors the deferred promise from a torn-down service.
- Fix: Track in a `MutableDisposable` field or `dispose()`-time `clearTimeout`.

### M8 — `BlockedExtensionService` outstanding timers leak on shutdown
- File: [extensions/copilot/src/platform/chat/common/blockedExtensionService.ts](extensions/copilot/src/platform/chat/common/blockedExtensionService.ts#L26)
- Class: `BlockedExtensionService`
- Snippet: `const timer = setTimeout(() => { this.blockedExtensions.delete(extensionId); }, ...); this.blockedExtensions.set(extensionId, timer);`
- Why: New reports clear prior timers for the same id (good), but the service has no `dispose()` — pending timers at shutdown are never cleared.
- Fix: Implement `IDisposable`; iterate the map and `clearTimeout` each on dispose.

### M9 — `ExtensionLinter` debounce timer not cleared on dispose
- File: [extensions/extension-editing/src/extensionLinter.ts](extensions/extension-editing/src/extensionLinter.ts#L106)
- Class: `ExtensionLinter`
- Snippet: `this.timer = setTimeout(() => { this.lint().catch(console.error); }, 300);`
- Why: `startTimer()` clears the previous timer (good), but `dispose()` (line 481) does not, so a pending lint fires after the linter is disposed.
- Fix: `clearTimeout(this.timer)` in `dispose()`.

### M10 — `PHPValidationProvider.delayers` reset orphans pending Delayers
- File: [extensions/php-language-features/src/features/validationProvider.ts](extensions/php-language-features/src/features/validationProvider.ts#L131)
- Class: `PHPValidationProvider.loadConfiguration`
- Snippet: `this.delayers = Object.create(null);`
- Why: On config reload, the entire delayers map is replaced — any `Delayer`s with pending timers are abandoned with their `setTimeout`s still queued.
- Fix: Iterate prior `delayers` and call `.cancel()` before replacing.

---

## Low severity (6, style candidates)

### L1 — `QuickInputList` next-tick A11Y query is untracked
- File: [src/vs/platform/quickinput/browser/quickInputList.ts](src/vs/platform/quickinput/browser/quickInputList.ts#L1160)
- Snippet: `setTimeout(() => { this._tree.getHTMLElement().querySelector(...); ... }, 0);`
- Why: Captures `this`; if disposed before next tick, accesses disposed `_tree`. Practically a 0 ms race.
- Fix: `disposableTimeout(() => { ... }, 0, this.disposables)`.

### L2 — `whenDeleted` polls indefinitely without timeout option
- File: [src/vs/base/node/pfs.ts](src/vs/base/node/pfs.ts#L220)
- Snippet: `const interval = setInterval(() => { fs.access(path, err => { if (err) clearInterval(interval); ... }); }, intervalMs);`
- Why: If the file is never deleted and the promise is abandoned, the interval polls forever.
- Fix: Add an optional `maxAttempts`/`timeoutMs` parameter that auto-cancels.

### L3 — `IssueReporterOverlay` screenshot countdown interval
- File: [src/vs/workbench/contrib/issue/browser/issueReporterOverlay.ts](src/vs/workbench/contrib/issue/browser/issueReporterOverlay.ts#L388)
- Snippet: `const interval = targetWindow.setInterval(() => { ... }, 1000);`
- Why: Local handle inside an action callback; survives bounded but isn't on a `DisposableStore` early.
- Fix: Hand to the overlay's existing `DisposableStore` immediately as `disposableWindowInterval`.

### L4 — `OutputResizeObserver` re-arms without prior-clear guard
- File: [src/vs/workbench/contrib/notebook/browser/view/renderers/webviewPreloads.ts](src/vs/workbench/contrib/notebook/browser/view/renderers/webviewPreloads.ts#L583)
- Snippet: `clearTimeout(this._outputResizeTimer); this._outputResizeTimer = setTimeout(() => { ... }, 250);`
- Why: Webview preload lifetime is bounded, so not an actual leak; pattern would still be clearer with a `MutableDisposable`-equivalent helper in the preload context.
- Fix (cosmetic): wrap the clear+assign in a small helper.

### L5 — `BatchedProcessor._timeout` lacks `IDisposable`
- File: [extensions/copilot/src/util/common/async.ts](extensions/copilot/src/util/common/async.ts#L100)
- Snippet: `this._timeout = setTimeout(() => this._flush(), this._waitingTimeMs);`
- Why: Self-clears in `_flush()`, but the class isn't disposable, so an abandoned instance can still fire one stale flush.
- Fix: Implement `IDisposable` and `clearTimeout` on dispose.

### L6 — `Askpass` cache eviction timers accumulate per request
- File: [extensions/git/src/askpass.ts](extensions/git/src/askpass.ts#L93)
- Snippet: `setTimeout(() => this.cache.delete(authority), 60_000);`
- Why: Multiple requests for the same authority within 60 s queue multiple deletes; bounded leak.
- Fix: Map per-authority timer; `clearTimeout` previous before scheduling new.

---

## Suggested fix patterns

For all H/M items, prefer one of:
- `disposableTimeout(fn, delay, store)` from [src/vs/base/common/async.ts](src/vs/base/common/async.ts) — registers itself in the given `DisposableStore` and cancels on dispose.
- `MutableDisposable<IDisposable>` holding the result of `disposableTimeout(...)` — auto-cancels the previous on re-assignment.
- `TimeoutTimer` / `IntervalTimer` from [src/vs/base/common/async.ts](src/vs/base/common/async.ts) — class fields with `cancelAndSet(fn, ms)`.
- For long-lived per-key timer maps: `DisposableMap<K>` with `disposableTimeout(...)` per entry.

## Notes / caveats

- Vendored copies of `vs/base` inside `extensions/copilot/src/util/vs/**` were only sanity-checked, not deeply audited — they should track upstream (`src/vs/base/**`, which is clean here).
- This audit is leak/accumulation-focused. There are many more *style*-only `setTimeout` sites that already work correctly and weren't reported.
- One-shot defer-dispose patterns (`setTimeout(() => local.dispose(), N)` for `local` allocated on the same line) and awaited `setTimeout(resolve, ms)` delays were deliberately not reported.
