# Agents Hub design

Revision: 2026-09-15. Status: P0/P1 prototype implemented; optional P2 work is not a committed feature set.

This is the contributor-facing design for the shared feature branch `bryanchen-d/agents-board-view`. It consolidates the product contract from the original hackathon handoff without requiring the private planning workspace or conversation history.

Start with the [contributor setup guide](agent-project-board-setup.md). Repository-relative paths below refer to this VS Code checkout.

## Purpose

Provide a persistent, user-arranged, two-axis overview of individual agent chats. Users should be able to organize parallel work, notice live state changes and open the exact conversation without changing the main Agents window's selected session.

The board organizes and visualizes work. It does not schedule agents, create workflow dependencies or change execution priority.

## Terms and ownership

- **Session:** Existing VS Code container for one or more chats, workspace, provider and shared context.
- **Chat:** Individual conversation within a session.
- **Card:** Live projection of one visible chat, identified by provider, session resource and chat resource.
- **Cell:** Intersection of a user-defined area row and priority column.
- **Unassigned:** Automatic tray for eligible chats without a placement.
- **Recency:** Timestamp of the most recent submitted user prompt, not agent activity or last visit.
- **Visited:** Existing provider-owned read state, never a separate board-owned flag.

Moving a card changes only its placement. Chats sharing a session still share that session's workspace and context; different cells do not provide worktree isolation.

## Product contract

### Windows and navigation

- `Agents: Open Agents Hub` opens a separate auxiliary window. Repeating the command focuses the existing board for the canonical Agents profile.
- The Sessions sidebar's Agents Hub entry embeds the same board inside the Agents window, using the custom view's styled scrolling and accessibility support. Both presentations share profile configuration; they are not separate named boards. Their view lifetimes, accessibility content and focus return must remain independent when both are open.
- Under custom-titlebar configuration, the board reuses the Sessions auxiliary titlebar and its standard native window controls, with a fixed Agents Hub title and no session command center. Reserve the chrome height outside the board's scroll viewport and keep title/control routing scoped to that auxiliary window.
- Agents Hub is the user-facing feature name. Existing `projectBoard`/`kanban` command IDs, custom-view IDs, storage keys and source paths remain stable for compatibility.
- Invoking the command from an ordinary Editor hands off to that Agents window, rather than creating a separate board for the Editor's profile.
- Double-click, Enter or Space opens the exact chat in a compact standalone chat editor. Reopening the same chat reuses its window; different chats get independent windows.
- Standalone chat windows reuse `ChatEditorInput` and `ChatEditor`, not another full Agents workbench. Opening one preserves the main Agents selection.
- Visible and native window titles follow the chat's current title, including publication, rename and restoration.
- Interaction-mode and permission pickers appear once and apply to that editor's chat.
- Escape uses the normal editor-close lifecycle. Popups, find and editor selections dismiss first. Closing preserves unsent input, published conversations and running work.
- When the board remains open, closing a standalone chat returns focus to its card. Closing a chat never reopens a closed board.
- Closing the board releases its subscriptions, not the agents or already-open chat windows.

### Layout and placement

- Start with one General row, P0/P1/P2/P3 columns and an Unassigned tray.
- Support adding, renaming, reordering and deleting both axes. Persist stable IDs rather than labels.
- Keep at least one row and column; require nonempty labels.
- A chat has one placement or is Unassigned. Drag/drop and Ctrl/Cmd+Shift+M provide movement; the latter opens a searchable destination picker.
- Auto-include Sessions defaults on. Turning it off hides unplaced chats and drafts without deleting them; collapsed Unassigned counts exclude those entries. Dragging a session from the Sessions list into a cell explicitly places its visible chats, even with auto-inclusion off, and expands a collapsed destination.
- Hover/focus reveals the card Delete action where supported. Deletion requires confirmation and deletes the backing session (including its chats), not merely its board placement. Draft deletion closes its editor through the normal close lifecycle before discarding the owned draft; canceling either confirmation preserves it.
- Card context menus do not enumerate every destination. Axis-edit menus remain.
- Where the chat supports renaming, F2 or the card's Rename context-menu action changes that chat's title, not its owning session or sibling chats. Canceling leaves the title unchanged.
- Deleting an occupied axis requires confirmation and returns affected placements to Unassigned, including archived placements. Cancellation changes nothing.
- Arrow keys follow the visible card geometry. Home/End focus the first/last card and scroll it into view.
- Clicking the board background, grid cells or Unassigned must not draw container focus outlines. Keyboard navigation retains visible focus indicators.
- Nested question inputs and links keep their own keyboard/mouse behavior; they do not accidentally open or move the card.
- The board owns its bounded scroll surface. Expanded content must remain reachable, and ordinary live updates preserve scroll position. When embedded via the custom view's styled scrolling, the board notifies the host on any content-height change (for example, expanding a "+more" group) so the host's scroll container rescans immediately rather than lagging behind its passive resize observer.
- Frameless disclosure buttons at the right of each header independently collapse rows, columns and Unassigned. Row/column label buttons are also frameless, retaining focus and hover feedback. Row/tray bodies shrink to summaries; columns become narrow rails. Headers and collapsed cells label their entry counts as `1 session` / `N sessions` and retain live Needs Input counts, including overflow; chat/draft identity and counting are unchanged.
- Collapse is per-view and temporary, like cell expansion: reopening a view starts expanded, and embedded/auxiliary views can fold independently. Axis labels still open their edit menus. Collapsing changes no placement, read state or running work.
- Collapsed cells remain drop targets; a local move into one expands the destination. Returning from a standalone chat reveals its collapsed row/column/tray. Card-arrow navigation skips hidden cards.
- Retain pending question/approval DOM and the existing bounded model references while collapsed so entered answers are not discarded. Collapsed content is hidden from tab navigation; accessible overview text labels collapsed groups.

### Live cards

- Render visible chats separately, including multiple chats from one session. Exclude provider-hidden internal workers; label visible read-only chats.
- Display title, workspace, runtime state, current-step description when reported, optional last prompt and available context links. Do not repeat the owning session title as a visible `Session:` line; preserve ownership in the accessible card label.
- Use themed state color plus text and a decorative indicator: Busy/Starting, Needs Input, Error and Idle. Split Idle into visited/unvisited.
- Idle uses one sleeping-face glyph when visited and one eyes glyph when unvisited to attract attention; keep visited/unvisited text and read semantics unchanged.
- Busy/Starting uses the bundled running-person animation, with a static reduced-motion fallback.
- Selecting, displaying, expanding or moving a card does not mark it read. Explicit opening follows provider-owned read marking.
- A disconnected provider is a separate stale/unavailable warning, not a replacement runtime state or an empty successful board.
- Opening a context link opens that resource without also opening the chat. Session-level artifacts are labeled shared context.

### Recency, overflow and archive

- Order by genuine submitted-request timestamps. Never substitute `updatedAt`, creation time, title changes or visit time.
- Unknown timestamps sort after known timestamps, with stable chat identity as the tie-breaker.
- Initially display three cards per cell. `+N more` reveals three additional cards at a time; Show Less restores the cap. Expansion resets on board reopen.
- Expanded content grows the row; do not add cell-internal scrolling.
- Compute overflow after archive filtering. Cell attention counts include hidden Needs Input cards without changing recency ordering.
- Hide chats archived individually or through their owning session by default. Preserve their placements; Show Archived/unarchive restores them.

### Display settings

- The top-right gear button independently toggles Time in State, AI Credits, Last Prompt, Model Details, and Agent & Permissions. Last Prompt defaults on; other optional fields default off. Last Prompt replaces the earlier Description toggle, which targeted the often-empty provider action rather than the visible prompt. Migrate its saved choice without resetting other preferences.
- Model Details is one compact row for the represented chat's selected model, thinking/configuration level, context size and harness. Agent & Permissions is a separate compact row for its agent, execution mode and permission setting. Long values truncate with full labeled values on hover.
- Configuration rows are read-only: use chat-scoped input/model metadata, the provider's model catalogue and owning-session configuration schema/labels. Never use the main Agents selection or global model preferences. Current selection is not necessarily the model used by an earlier turn (especially Auto). Unknown/unreported values and preview limits remain explicit.
- Configuration reuses at most sixteen retained metadata helpers; enable observation only while a configuration row is shown. Changes to input text or selections must not rebuild rows. Provider configuration changes update the represented session's row; reading it must not change permissions or select a chat.
- Each live card ends in a wrapping status bar: last-prompt timestamp on the left, optional clock/state-time and credit-card-icon widgets on the right. Metrics have transparent backgrounds and theme-aware secondary foregrounds. Display AI credits with the shared credit formatter (up to one decimal place), not converted currency. Credit hover explains the latest reported per-chat total, provider update timing and unavailable-data meaning.
- Reported usage updates the credit total even while a response is running, including billing-only refinements and subagent usage. Providers may report after individual model calls or only when a turn ends; do not estimate additional credits from elapsed time or streamed tokens.
- Time in State applies to non-archived live cards, not drafts. Track each chat's observed runtime transitions, independently of prompt/output updates, read state and placement. Update only timer text once per second; do not rebuild cards or disturb question input, focus or scroll.
- The first observed state is a lower bound labeled `at least`; its real start may precede opening the board. An observed transition resets the timer. A disconnected provider shows unavailable; reconnecting starts a new lower bound. Reopening the board starts fresh observation, not a fabricated continuation across unseen transitions.
- AI Credits uses the existing chat model's cumulative session cost, including provider-reported backend totals and subagent costs. It is scoped to that card's chat, not an account balance or an aggregate across sibling chats in the owning session.
- Distinguish reported zero from unavailable billing data. Unknown or preview-limited chats show unavailable, never zero or an estimate derived from tokens. Totals reflect reported usage and can lag billing.
- Reuse the existing bounded visible metadata references. When credits are off, do not scan or observe usage history; when on, usage changes update totals without rescanning on streamed text.

### Questions

- Needs Input cards reuse the interactive `ChatQuestionCarouselPart` and common answer-submission path.
- Support provider-supplied titles, descriptions, options, custom answers when allowed, multiple questions and validation.
- Retain the widget for the original pending carousel so values, selection and focus survive board refreshes.
- Submit to the exact request and original backend option values. Reject stale, duplicate or externally answered forms.
- Merely displaying a form does not submit it or mark the conversation read.
- Archived/read-only chats and oversized or unresolvable forms retain an explicit open-in-chat fallback.

### Continuation and tool approvals

- If the latest visible response offers Keep Going or another resumable-error confirmation, show the same `ChatErrorConfirmationContentPart` on its card. Preserve the original request, provider data and request-ID behavior rather than sending a fabricated continuation prompt.
- Pending tool execution and result-review approvals use the actual `ChatToolInvocationPart`, including its normal tool-specific content, primary/secondary controls and split-button dropdown. Preserve provider option IDs, approval scopes, policy restrictions and risk information.
- Merely rendering controls never approves, changes permission settings or marks the chat read. Card drag/open handlers do not consume nested control interactions.
- Guard actions against newer requests, completed/canceled tools, archived/read-only or disconnected chats and disposed views. Duplicate continuation clicks across board/chat surfaces share an in-flight guard. Failed actions remain retryable and surface errors.
- Board actions do not redirect focus to a chat widget in another window. Retain shared controls across unrelated card refreshes, including an open scope menu or focused input.
- Reuse bounded retained metadata models; render at most eight pending tools per card with an explicit open-in-chat notice for additional actions. Authentication, standalone elicitation/confirmation types and unresolved actions keep their existing fallback rather than inventing partial approval controls.

### Creation and draft lifecycle

- A top-right New Session button opens a standalone composer without selecting another main Agents chat.
- Board-owned drafts appear in Unassigned and can reopen their composer.
- The regular Agents window's current unsent draft appears immediately as a passive preview. Enter its first message in Agents; the board does not create a second composer or take cleanup ownership.
- Independently discovered chats arrive without reopening the board. Publication reconciles previews to live cards without duplicates.
- Discarding/replacing an Agents-owned draft removes only its borrowed preview. Automation-dialog drafts are outside this integration.
- Closing an untouched board-owned composer discards only that owned draft. Retain work after typing, adding attachments, sending, a pending send or a failed send.
- Publication ends provisional backend-cleanup ownership. Releasing a UI/model reference must not delete a published conversation.
- Draft card identity remains stable when its input model resource changes.

### Storage and errors

- Persist only the configuration version, ordered axis IDs/labels, placements and display preferences in profile-local storage. Existing configurations without display preferences keep both metrics off.
- Do not persist transcript copies, runtime status, credentials or artifact caches as board configuration.
- Keep placement information when a provider disappears. Definitively unavailable placed chats have an explicit Remove Placement action.
- Corrupt saved state locks mutation until an explicit confirmed reset; do not silently replace it with defaults.
- Surface load, save, navigation and submission failures with normal logging/notifications.

## Architecture and code map

Use VS Code core DOM, CSS, observables and services; do not introduce a webview, separate backend or generic workflow framework.

- [Board model](../src/vs/sessions/contrib/projectBoard/common/projectBoardModel.ts): identity, placement projection, filtering, recency and visible-card calculations.
- [Board state](../src/vs/sessions/contrib/projectBoard/browser/projectBoardState.ts): validated profile storage and axis/placement mutations.
- [Board view/service](../src/vs/sessions/contrib/projectBoard/browser/projectBoardService.ts): auxiliary board lifecycle, rendering, scrolling, focus, keyboard and drag/drop.
- [Navigation and drafts](../src/vs/sessions/contrib/projectBoard/browser/projectBoardNavigation.ts): exact-chat windows, creation, model references, publication and safe cleanup.
- [Metadata](../src/vs/sessions/contrib/projectBoard/browser/projectBoardMetadata.ts) and [questions](../src/vs/sessions/contrib/projectBoard/browser/projectBoardQuestions.ts): bounded projections of existing chat data and shared question widgets.
- [Contribution](../src/vs/sessions/contrib/projectBoard/browser/projectBoard.contribution.ts): command/keybinding registration.
- [Session management contract](../src/vs/sessions/services/sessions/common/sessionsManagement.ts): authoritative discovery and draft lifecycle.
- [Provisional-session service](../src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/agentHostUntitledProvisionalSessionService.ts): backend-generation ownership; publication protects conversations from provisional cleanup.

`vs/sessions` may import `vs/workbench` and lower layers; ordinary workbench code must not import the higher Sessions layer. Keep provider-specific decisions in providers and native-window changes narrowly scoped.

## Capability boundaries

- One canonical Agents profile-local board; no cross-device synchronization or multiple named boards.
- At most sixteen displayed chat models are retained for prompt metadata. Already-loaded hidden chats can supply timestamp-only updates; cold hidden histories remain unknown until expanded.
- At most eight Needs Input cards load question previews concurrently. Additional cards direct users to their chat.
- Missing prompt text/time is explicit. An empty stored request is informational (`No prompt text`), not an agent failure.
- Local Copilot flows have been exercised in Windows OSS with real models. Other providers and macOS/Linux native behavior require their own validation.
- Synthetic tests verify deterministic behavior, not real authentication or provider availability.

## Scenario gates

Delivery phases are independent of the editable P0/P1/P2/P3 column labels.

### P0: basic workflow

- **PB-01:** Separate-window launch and singleton reuse.
- **PB-02:** Chat-granular identity, live discovery and hidden-worker exclusion.
- **PB-03:** Exactly-one-card movement, Unassigned return, picker cancellation and stale-selection safety.
- **PB-04:** State/read transitions; board observation and movement do not mark read or start work.
- **PB-05:** Exact standalone opening/reuse, main-selection isolation, title/configuration correctness and close/reopen preservation.
- **PB-03/PB-05 regression:** Create a session, send `hi`, close while Busy or after Idle, move to General/P1 and reopen. Preserve canonical identity, title and transcript after model-reference disposal.

### P1: useful persistent board

- **PB-06:** Persistence, Editor-to-Agents handoff, singleton behavior and corrupt-state recovery.
- **PB-07:** Genuine prompt recency and honest missing/historical metadata.
- **PB-08:** Eight-card expansion: 3 + 5 hidden, then 6 + 2 hidden, then 8; correct attention counts.
- **PB-09:** Chat-level and session-level archive filtering without lost placements.
- **PB-10:** Stable editable axes, confirmed deletion and archived-placement accounting.
- **PB-11:** Accurate shared context, keyboard accessibility, non-color state and reachable content.
- **PB-15:** Interactive Ask User, custom answers, validation, exactly-once submission and refresh-safe input.
- **PB-16:** Standalone creation, passive Agents draft discovery and publication without duplicates.
- **PB-17:** Cleanup only of untouched owned drafts; preserve entered, attached, pending, failed and submitted work.
- **PB-18:** Independent persisted display toggles, including default-visible Last Prompt and migration of the old Description preference; bottom status-bar layout and transparent metrics; state-duration transitions and lower bounds; reported zero versus unavailable credits; timer updates preserve focus/scroll and release on close.
- **PB-19:** Independent model/permission rows; exact chat/session configuration, bounded observation, no global-setting or sibling-chat substitution, live updates, and explicit unknown values.
- **PB-20:** Shared Keep Going and tool approval controls, exact request/option IDs and approval scope, stale/duplicate protection, retryable failures, retained control identity, and no cross-window focus or accidental read marking.
- **PB-21:** Themed auxiliary titlebar, fixed independent title, normal window controls, content sizing on resize/fullscreen, singleton behavior and disposal without orphaned chrome.
- **PB-22:** Independent row/column/tray collapse, compact layout, live summary counts, accessible disclosure state, hidden-card navigation exclusion, drop/reveal behavior, view-local reset and preservation of pending input.

### Resilience before optional P2

- **PB-12:** Disconnect/reconnect and provider failures preserve useful state without duplicate cards.
- **PB-13:** Board/owner lifecycle, fresh subscriptions and no accidental agent termination.
- **PB-14:** Fifty-chat interaction fixture, visible caps, live updates during drag/focus, bounded scrolling and host-class mirroring.

### Optional P2 candidates

Only consider these after cumulative P0/P1 and resilience gates pass:

- Tray search by chat title, owning session or workspace.
- Richer inline prompt/current-step/context expansion.
- Visual refinements for long labels, themes, zoom and reduced motion.
- Larger-board measurements with an agreed dataset and explicit budgets.

Graph connections, scheduling, new providers, multi-board support and synchronization are not part of P2. There is no agreed large-board performance threshold yet.

## Validation and contribution policy

Preserve each green scenario as a regression gate. Add a focused failing test at the real failure boundary, implement the fix and rerun the relevant cumulative suites.

- Model tests establish membership, ordering and restoration.
- Renderer tests establish DOM behavior, bounded layout, keyboard navigation and question handling.
- Native tests establish actual scrolling, editing keys, focus and window lifecycle; DOM counts or injected text are insufficient.
- Real-provider tests establish authentication, live data and continuation; mocks cannot establish those properties.

Use the commands and native gate in the [setup guide](agent-project-board-setup.md). Keep tests at suite scope, preserve disposal checks, and report exact counts, platforms, providers and unrun scenarios.

The prototype already implements P0/P1. New contributors should inspect the current branch, choose a bounded issue and extend the implementation rather than restarting the historical hackathon plan.
