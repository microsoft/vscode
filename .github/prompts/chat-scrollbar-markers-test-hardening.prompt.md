# Prompt: Harden Tests for Chat Scrollbar Prompt Marker Feature

## Context

You are working in the `microsoft/vscode` repository on the worktree branch `agents/chat-scrollbar-markers-impl`. This branch implements a **chat scrollbar prompt marker** feature: colored markers rendered on the chat transcript's overview ruler that let users see and navigate to prompts, ask-question responses, file-change responses, compaction requests, and error responses.

A follow-up effort will refactor the **internal implementation** of this feature for **performance** and **memory-leak prevention**. Your job is to **harden the existing test coverage** so that those internal refactors can be made safely — the tests must lock in the observable behavior (inputs → outputs, DOM structure, lifecycle, disposal) without over-coupling to implementation details that are about to change.

## Hard guardrail

**You MUST NOT modify any test file (or non-test file) that is unrelated to this worktree's changes.** Concretely, the only files you may touch are:

- `src/vs/workbench/contrib/chat/test/browser/actions/chatPromptNavigationActions.test.ts` (existing — extend it)
- New test files you create **under** `src/vs/workbench/contrib/chat/test/browser/` that are clearly scoped to the scrollbar marker feature
- You may create new test helper/fake files under the same test folder

If a test you want to write would require editing a shared test utility or an unrelated test suite to compile or run, **stop** and instead write the test against a self-contained fake/stub that lives entirely within your new test files. Do not touch shared fixtures, shared test utilities, or any test file outside the chat scrollbar marker scope.

Run `git diff main...HEAD --name-only` to confirm the exact set of production files this feature touches; your tests must only target behavior exposed by those files.

## What the feature does (the behavior to lock down)

### Pure helpers — `src/vs/workbench/contrib/chat/browser/actions/chatPromptNavigationActions.ts`

These exported functions are the core taxonomy logic and are already partially tested:

- `getScrollbarPromptMarkerRequests(items)` — returns the deduplicated, system-initiated-filtered set of request view models that have markers.
- `getScrollbarPromptMarkerDescriptors(items)` — computes the full set of marker descriptors (id, requestId, request, target, markerType, lane, priority, minHeight, optional topRatio/heightRatio).
- `getFocusedScrollbarPromptMarkerRequestId(item)` / `getFocusedScrollbarPromptMarkerId(item)` — map a focused request/response to its marker id.
- `applyScrollbarPromptMarkerClickBehavior(target, item, behavior)` — reveal-only vs reveal-and-focus dispatch.
- Enums: `ChatScrollbarPromptMarkerType` (`Prompt`, `AskQuestion`, `FileChange`, `Compaction`, `Error`), `ChatScrollbarPromptMarkerLane` (`Left`, `Right`, `Full`).

The descriptor algorithm has three phases: (1) index responses by request id, (2) deduplicate requests by message text (or by id for compaction), keeping the latest attempt, (3) emit one prompt/compaction marker per surviving request plus zero-or-more response markers classified by error → ask-question → file-change (with sub-row clustering) → file-change fallback.

### Controller — `ChatScrollbarPromptMarkerController` (private class in `chatListWidget.ts`)

A `Disposable` that owns a container `div`, a `markerById` map, a `targetById` map, and three `MutableDisposable` parent listeners (pointerdown, click, mouseup). It depends on a `host: ChatListWidget` surface with these methods: `getOverviewRulerLayoutInfo()`, `renderHeight`, `scrollHeight`, `getItems()`, `hasElement()`, `getElementTop()`, `getElementHeight()`, `getFocus()`, `reveal()`, `focusItem()`. It also takes `IConfigurationService`, `IFileService`, `ILogService`.

Key behaviors:
- `layout()` — re-parents the container into the overview ruler parent, sizes it, (re)attaches parent listeners when the parent changes, then renders.
- `refresh()` — re-renders markers.
- `setVisible(visible)` — toggles container display.
- `renderMarkers()` — computes descriptors, filters to elements the host has, scales positions by `rulerHeight/scrollHeight`, applies `minHeight`, resolves overlaps with a two-pass push-down/clamp, reuses existing marker DOM nodes, removes stale markers, updates `markerById`/`targetById`, writes a debug log line.
- `getTargetAtPoint(clientX, clientY)` — full-width Y hit-testing; when markers overlap at the same Y, prefers right-lane (prompt) > left-lane > full-lane.
- `onOverviewRulerPointerDown` / `onOverviewRulerMouseUp` / `onOverviewRulerClick` — pointerdown activates a marker (preventDefault/stopPropagation, reveal); mouseup and click are suppressed while `markerActivated` is true to prevent the scrollbar stealing focus.
- `revealItem(item)` — reveals immediately; if behavior is `RevealAndFocus`, retries `focusItem` across up to 10 animation frames until `hasElement(item)` is true.
- Disposal removes the container from the DOM and clears all listeners.

### Config & model additions

- `ChatScrollbarPromptMarkerClickBehavior` enum (`RevealAndFocus`, `Reveal`) in `common/constants.ts`.
- `ChatConfiguration.ScrollbarPromptMarkerClickBehavior` config registration in `chat.shared.contribution.ts`.
- `IChatRequestViewModel.editedFileEvents` added in `common/model/chatViewModel.ts`.

### Base layer additions (thin pass-throughs)

- `IListView.getOverviewRulerLayoutInfo()` and `ListView.getOverviewRulerLayoutInfo()` in `listView.ts`.
- `List.getOverviewRulerLayoutInfo()` and `List.getElementHeight(index)` in `listWidget.ts`.
- `AbstractTree.getOverviewRulerLayoutInfo()`, `getElementTop(ref)`, `getElementHeight(ref)` in `abstractTree.ts`.

## What to do

Harden the test suite so an internal refactor for performance and memory safety cannot silently change observable behavior. Cover **both primary and edge cases**. Specifically:

### 1. Extend `chatPromptNavigationActions.test.ts` (pure helpers)

Add tests for cases not yet covered, including edge cases:

- **Empty input** → `getScrollbarPromptMarkerDescriptors([])` returns `[]`.
- **Requests with no paired response** → still emit a prompt marker; no response marker.
- **Multiple retries of the same message text** → only the latest attempt (highest `attempt`, tie-break on `timestamp`) survives; verify the survivor's id.
- **Compaction deduplication by id** → two compaction requests with the same message text but different ids both survive (they dedup by id, not text).
- **Compaction with `isSystemInitiated: true`** → survives (system-initiated filter exempts compaction).
- **Error classification priority** → a response with both `errorDetails` and ask-question/file-change parts is classified as `Error`.
- **Ask-question vs file-change priority** → a response with both an ask-questions tool and file edits is classified as `AskQuestion` (error > ask-question > file-change).
- **File-change fallback when response is missing** → request with `editedFileEvents` and no response emits a `FileChange` marker targeting the request.
- **File-change fallback when response has no edit parts** → request with `editedFileEvents` and a response with no edit parts emits a `FileChange` marker targeting the response.
- **Single file-change response** → descriptor id is the response id (no `#fileChangeN` suffix).
- **`topRatio`/`heightRatio` correctness** for multi-cluster responses — verify the ratios against `parts.length`, including the `Math.max(..., 1/parts.length)` floor on `heightRatio`.
- **`minHeight` is always 4** on every emitted descriptor.
- **`getFocusedScrollbarPromptMarkerId`** with a response → returns the response's own id (not the request id).
- **`applyScrollbarPromptMarkerClickBehavior`** with `Reveal` → only `reveal` is called, `focusItem` is never called.

Keep using the existing `request()`/`response()` factory helpers; extend them only if needed. Prefer snapshot-style `assert.deepStrictEqual` over many small assertions (per repo learnings).

### 2. Create a new controller test file

Create `src/vs/workbench/contrib/chat/test/browser/widget/chatScrollbarPromptMarkerController.test.ts` that tests `ChatScrollbarPromptMarkerController` through a **self-contained fake host**. The controller class is not exported, so either:

- (Preferred) Test it indirectly by extracting the controller into its own exported file as part of your work **only if** that extraction is a pure move with no behavioral change and does not touch any unrelated file; OR
- Test the observable behavior via the public `ChatListWidget` surface using the existing chat widget test patterns already in `src/vs/workbench/contrib/chat/test/browser/` — but **only** if you can do so without modifying any existing test file. If neither is possible without touching unrelated files, document the blocker and instead write the tests against a minimal local re-implementation of the host interface that mirrors the real `ChatListWidget` method signatures, clearly labeled as a behavioral contract test.

The controller tests must cover:

**Primary cases:**
- `layout()` places the container inside the overview ruler parent and sizes it to `renderHeight × scrollbarWidth`.
- `refresh()` / `renderMarkers()` produces one marker element per descriptor, with correct `data-marker-id`, `data-marker-type`, `className` (type + lane classes), `style.top`, `style.height`, `style.zIndex`.
- Lane styling: left-lane markers get `left:0; width:50%`, right-lane get `right:0; width:50%`, full-lane get `left:0; right:0; width:auto`.
- `active` class toggles on the marker whose id matches the focused item.
- Stale markers are removed from the DOM and from `markerById` when descriptors shrink.
- Marker DOM nodes are **reused** across renders (same element reference) when the descriptor id persists — verify by identity.
- `setVisible(false)` hides the container; `setVisible(true)` shows it (when `renderHeight > 0`).
- `getTargetAtPoint` returns the correct target for a click inside a marker's Y range, even when the click is in the opposite lane (full-width hit-testing).
- Overlap resolution: when two markers would overlap vertically, the lower one is pushed down and clamped to `rulerHeight - height`.
- `minHeight` enforcement: a marker whose scaled height is below `minHeight` is centered around its scaled top.

**Edge cases:**
- `scrollHeight <= 0` or `renderHeight <= 0` → all markers cleared, container hidden.
- `getOverviewRulerLayoutInfo()` returns `undefined` → `renderMarkers` is a no-op.
- No descriptors (empty items) → no marker elements, container hidden.
- `getTargetAtPoint` outside the container bounds → returns `undefined`.
- `getTargetAtPoint` when `visible === false` or container is `display:none` → returns `undefined`.
- Overlapping markers at the same Y: right-lane (prompt) wins over left-lane wins over full-lane.
- `layout()` re-attaches parent listeners when the overview ruler parent element changes (simulate a new parent) and does **not** re-attach when the parent stays the same.
- `revealItem` with `RevealAndFocus` calls `reveal` immediately and retries `focusItem` across animation frames until `hasElement` returns true (use a fake that returns false N times then true).
- `revealItem` with `Reveal` calls `reveal` only and never `focusItem`.
- Pointerdown on a marker sets `markerActivated`, calls `preventDefault`/`stopPropagation`, and calls `reveal` on the resolved target; the subsequent `click` and `mouseup` are suppressed (preventDefault/stopPropagation) and do not reach the host.
- Pointerdown outside any marker → no activation, no reveal.

**Lifecycle / memory-leak tests (critical for the upcoming perf refactor):**
- After `dispose()`: the container is removed from the DOM, `markerById` and `targetById` are empty, and no parent listeners remain attached. Verify by asserting that dispatching pointerdown/click/mouseup on the former parent calls none of the host methods.
- Repeated `refresh()` calls do not accumulate marker DOM nodes (node count stays equal to descriptor count, not growing per call).
- Repeated `layout()` calls with the same parent do not register additional listeners (listener count is stable).
- `renderMarkers` called many times with the same descriptors does not leak stale nodes (the stale-removal loop runs every time).
- Use `ensureNoDisposablesAreLeakedInTestSuite()` at the top of the suite (the existing test file already does this — follow the same pattern).

### 3. Do not add integration tests that require launching VS Code

Keep everything as unit tests runnable via `scripts/test.sh --grep`. Do not add `.integrationTest.ts` files. Do not add tests that require a real workbench instantiation unless they can run without modifying shared test infrastructure.

## Constraints recap

- **No functional changes** to production code. You may only add/extend tests. The single exception is a pure move of `ChatScrollbarPromptMarkerController` into its own file if needed for testability — and only if it changes zero behavior and touches zero unrelated files.
- **No changes to any test file unrelated to this worktree.** When in doubt, create a new file rather than editing an existing shared one.
- Follow VS Code coding guidelines: tabs, single-quoted non-externalized strings, `assert` from `node:assert`, `ensureNoDisposablesAreLeakedInTestSuite()`, JSDoc on exported test helpers, Microsoft copyright header.
- Prefer `assert.deepStrictEqual` snapshot-style assertions over many precise ones.
- Do not stub global objects or use `any` casts to install fakes — make dependencies injectable or pass fakes that implement the real interface.
- After writing tests, run `npm run typecheck-client` and `scripts/test.sh --grep <your-suite-name>` to confirm they compile and pass. Fix any compilation errors before declaring done.

## Deliverables

1. Extended `chatPromptNavigationActions.test.ts` with the edge cases listed above.
2. New `chatScrollbarPromptMarkerController.test.ts` (or similarly named) covering the controller's observable behavior, overlap resolution, hit-testing, click suppression, reveal/focus retry, and disposal/leak scenarios.
3. A short summary of what behaviors are now locked down and which ones are intentionally left untested (and why), so the perf refactor agent knows the safety net's boundaries.
