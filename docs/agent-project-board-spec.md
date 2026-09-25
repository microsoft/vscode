# Agents Hub design

Revision: 2026-09-15. Status: P0/P1 prototype implemented; optional P2 work is not a committed feature set.

This is the contributor-facing design for the shared feature branch `agent-hub-main`. It consolidates the product contract from the original hackathon handoff without requiring the private planning workspace or conversation history.

Start with the [contributor setup guide](agent-project-board-setup.md). Repository-relative paths below refer to this VS Code checkout.

## Purpose

Provide a persistent, user-arranged, two-axis overview of individual agent chats. Users should be able to organize parallel work, notice live state changes and open the exact conversation without changing the main Agents window's selected session.

The board organizes and visualizes work. It does not schedule agents, create workflow dependencies or change execution priority.

## Terms and ownership

- **Session:** Existing VS Code container for one or more chats, workspace, provider and shared context.
- **Chat:** Individual conversation within a session.
- **Card:** Live projection of one visible chat, identified by provider, session resource and chat resource.
- **Board:** Named, profile-local organization of the shared conversation catalogue, identified by an immutable board ID.
- **Cell:** Intersection of a user-defined area row and priority column.
- **Unassigned:** Per-board tray for eligible chats without a placement on that board.
- **Recency:** Timestamp of the most recent submitted user prompt, not agent activity or last visit.
- **Visited:** Existing provider-owned read state, never a separate board-owned flag.

Moving a card changes only its placement on the current board. The same conversation can appear on multiple boards; its transcript, status, read state, credits and approvals remain shared. Chats sharing a session still share that session's workspace and context; different cells or boards do not provide worktree isolation.

## Product contract

### Windows and navigation

- The Sessions sidebar's expandable Agents Hub section contains one item per board and New Board. Selecting a board opens it in the embedded Hub without changing any standalone board window.
- The current board owns the active-view highlight and `aria-current` marker. Agents Hub is a neutral group heading, not a second selected item; keyboard focus cues remain independent.
- `Agents: Open Agents Hub` opens the selected board in a separate auxiliary window. There is at most one standalone window per board; different boards can remain open simultaneously. Reopening a board focuses its existing window.
- Under custom-titlebar configuration, each board reuses the Sessions auxiliary titlebar and native controls, titled `Agents Hub — <board name>` without a session command center. Renaming updates the matching window, not the Agents owner.
- Existing command and custom-view IDs remain stable. The v2 collection uses a new storage key and retains legacy data for recovery.
- Invoking the command from an ordinary Editor hands off to that Agents window, rather than creating a separate board for the Editor's profile.
- Double-click, Enter or Space opens the exact chat in a compact standalone chat editor. Reopening the same chat reuses its window; different chats get independent windows.
- Embedded Agents Hub's Board Settings includes **Open Chat in Side Panel**, off by default and persisted with the profile's board configuration. When enabled, double-click, Enter or Space on a chat card opens the exact conversation in the secondary sidebar beside Agents Hub without changing the main Agents selection. Closing the side-panel chat returns focus to its card; leaving Agents Hub restores the previous side-panel composition. Turning the preference off closes the side-panel chat and restores standalone opening for subsequent activations. The separate Agents Hub window and session drafts retain their standalone behavior.
- Standalone chat windows reuse `ChatEditorInput` and `ChatEditor`, not another full Agents workbench. Opening one preserves the main Agents selection.
- Visible and native window titles follow the chat's current title, including publication, rename and restoration.
- Interaction-mode and permission pickers appear once and apply to that editor's chat.
- Escape uses the normal editor-close lifecycle. Popups, find and editor selections dismiss first. Closing preserves unsent input, published conversations and running work.
- Closing a standalone chat returns to the originating board and view, even if the embedded Hub switched boards in the meantime. It never recreates a closed/deleted board.
- Closing the board releases its subscriptions, not the agents or already-open chat windows.

### Board management

- Create, rename and delete boards by stable ID. New boards begin with all existing and future eligible conversations, General/P0-P3 axes, and Auto-include Sessions enabled.
- Each board owns its axes, placements, display mode/fields and chat-opening preference. Auto-include Sessions can be disabled independently for a curated board.
- Deleting a board requires confirmation and removes only its organization. It closes that board's window and selects another board in the embedded Hub when needed; deleting the last board shows New Board rather than silently recreating data.
- Switching embedded boards retains their local folding, scrolling and pending answer inputs. Inactive views stop discovering/loading new previews; shared bounded preview leases preserve pending interactions without multiplying transcript references per board.
- Selection-only changes retain board/configuration identities and do not reactivate unrelated views. Burst history/prompt-preview updates coalesce their DOM rendering, while direct user changes and pending actions remain immediate.
- Ready metadata previews may stay warm without active leases inside the existing sixteen-model budget. Idle entries yield to active demand in least-recently-used order; optional credit/configuration observation is disabled while idle. Unfinished loads still cancel, and closing the last Hub surface clears idle previews.
- Async pickers and management actions retain their originating board ID; deleted IDs are rejected rather than redirected to another board.

### Layout and placement

- Start with one General row, P0/P1/P2/P3 columns and an Unassigned tray.
- Support adding, renaming, reordering and deleting both axes. Persist stable IDs rather than labels.
- Keep at least one row and column; require nonempty labels.
- A chat has one placement or is Unassigned within each board independently. Drag/drop and Ctrl/Cmd+Shift+M provide movement; the latter opens a searchable destination picker.
- Auto-include Sessions defaults on. Turning it off hides unplaced chats and drafts without deleting them; collapsed Unassigned counts exclude those entries. Dragging a session from the Sessions list into a cell explicitly places its visible chats, even with auto-inclusion off, and expands a collapsed destination.
- Hover/focus reveals the card Delete action where supported. Deletion explicitly warns that it deletes the backing session (including its chats) across every board, then removes its placements everywhere after successful deletion. Draft deletion closes its editor through the normal close lifecycle before discarding the owned draft; canceling either confirmation preserves it.
- Card context menus do not enumerate every destination. Axis-edit menus remain.
- Where the chat supports renaming, F2 or the card's Rename context-menu action changes that chat's title, not its owning session or sibling chats. Canceling leaves the title unchanged.
- Deleting an occupied axis requires confirmation and returns affected placements to Unassigned, including archived placements. Cancellation changes nothing.
- Arrow keys follow the visible card geometry. Home/End focus the first/last card and scroll it into view.
- Clicking the board background, grid cells or Unassigned must not draw container focus outlines. Keyboard navigation retains visible focus indicators.
- Nested question inputs and links keep their own keyboard/mouse behavior; they do not accidentally open or move the card.
- The standalone board owns a bounded `DomScrollableElement`, matching the workbench's themed scrollbar tracks and thumbs rather than native browser scrollbars. Keep its viewport and scrollbar DOM stable across card updates; synchronize both axes after wheel, thumb, keyboard and programmatic scrolling, viewport resizing and asynchronous content growth. Embedded boards use only their custom view host's themed scroll container.
- Expanded content must remain reachable, and ordinary live updates preserve scroll position. When embedded via the custom view's styled scrolling, the board notifies the host on any content-height change (for example, expanding a "+more" group) so the host's scroll container rescans immediately rather than lagging behind its passive resize observer.
- Frameless disclosure buttons at the right of each header independently collapse rows, columns and Unassigned. Row/column label buttons are also frameless, retaining focus and hover feedback. Row/tray bodies shrink to summaries; columns become narrow rails. Headers and collapsed cells label their entry counts as `1 session` / `N sessions` and retain live Needs Input counts, including overflow; chat/draft identity and counting are unchanged.
- Collapse is per-view and temporary, like cell expansion: reopening a view starts expanded, and embedded/auxiliary views can fold independently. Axis labels still open their edit menus. Collapsing changes no placement, read state or running work.
- Collapsed cells remain drop targets; a local move into one expands the destination. Returning from a standalone chat reveals its collapsed row/column/tray. Card-arrow navigation skips hidden cards.
- Retain pending question/approval DOM and the existing bounded model references while collapsed so entered answers are not discarded. Collapsed content is hidden from tab navigation; accessible overview text labels collapsed groups.

### Session list presentation

- **Toggle Session List** in Board Settings is off by default and saved with the profile's board preferences. It replaces live cards with the shared Sessions list renderer, following the Automations embedding pattern, without workspace or date sections. The board's axes remain unchanged.
- A session appears in only one cell, with its visible chats nested using the sidebar's expand/collapse behavior. A single occupied cell determines its destination; additional unplaced chats stay nested under the same session. If saved chats occupy conflicting cells, the session is Unassigned in list mode, or hidden when Auto-include Sessions is off. Merely toggling the presentation does not rewrite saved chat placements.
- Dragging either a session row or a nested chat, or using Ctrl/Cmd+Shift+M, moves all of that session's visible chats together. Returning to cards reflects the move. Dropping into a collapsed destination expands it, and dropping into Unassigned removes placements.
- Lists retain their identity and expansion state during live updates and use the board's outer scroller. Opening the session row opens its main chat; opening a nested row opens that exact chat, honoring the board's side-panel preference.
- Card-only metrics and question-answer widgets remain available in card mode. List mode retains standard session approval controls, and drafts and unavailable placements retain their existing fallback presentation.

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
- Select multiple live cards and use **Mark as Done** to archive their backing sessions together without deleting conversations or placements. Archiving a session also archives its other chats, including unselected siblings; selecting multiple siblings archives the session only once. Selection is local to the board view, does not mark conversations read, and excludes drafts, unavailable cards and already archived chats. Failed archive operations remain visible and retryable.

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

- New Session hosts the actual Agents `NewChatWidget` in a modal, including workspace, provider, model, configuration, attachments and prompt controls. The workspace picker supplies the selected folder; workspace trust and provider availability are checked before creating an isolated draft.
- The board placement picker is labeled **Project Path**; the workspace is chosen separately in the shared composer. There is no bottom Cancel button. The close control and Escape dismiss the modal while no submission is pending.
- As soon as submission exposes a running provisional conversation, embedded Hub creation dismisses the modal and opens that exact chat in the side panel, without opening a native window or replacing the main Agents draft. This creation handoff is independent of the existing-card **Open Chat in Side Panel** preference. Creation from a standalone board opens the submitted conversation in its standalone chat window. Neither route waits for canonical discovery or the agent's response to finish.
- The modal carries the original board ID and selected destination independently of global board selection. Place the existing provisional provider/session/chat identity immediately and reconcile it with canonical identity without duplicates or overwriting subsequent moves. Unassigned is the default when auto-inclusion is enabled; otherwise require an explicit cell so the created card remains visible. Placement is local board state, not provider metadata or prompt text.
- Modal drafts have independent input storage per board and embedded/standalone surface. Dismissal preserves unsent input for reopening but disposes only the owned unsent session; failures before acceptance retain input and surface an error. An accepted send owns its draft until canonical discovery settles, independently of the modal lifetime. Late discovery failures are logged and notified, never automatically resubmitted. Changing workspace, canceling trust or removing a provider must never submit to a stale prior target.
- Previously opened standalone drafts remain in Unassigned and can reopen their composer.
- The regular Agents window's current unsent draft appears immediately as a passive preview. Enter its first message in Agents; the board does not create a second composer or take cleanup ownership.
- Independently discovered chats arrive without reopening the board. Publication reconciles previews to live cards without duplicates.
- Discarding/replacing an Agents-owned draft removes only its borrowed preview. Automation-dialog drafts are outside this integration.
- Closing an untouched board-owned composer discards only that owned draft. Retain work after typing, adding attachments, sending, a pending send or a failed send.
- Publication ends provisional backend-cleanup ownership. Releasing a UI/model reference must not delete a published conversation.
- Draft card identity remains stable when its input model resource changes.

### Storage and errors

- Persist the versioned board collection, stable board IDs/names/order, embedded selection, and each board's axes, placements and preferences in profile-local storage. Migrate the legacy single-board configuration intact into Default and retain the old payload for recovery; older display preferences keep their existing defaults.
- Do not persist transcript copies, runtime status, credentials or artifact caches as board configuration.
- Keep placement information when a provider disappears. Definitively unavailable placed chats have an explicit Remove Placement action.
- Corrupt saved state locks mutation until an explicit confirmed reset; do not silently replace it with defaults.
- Surface load, save, navigation and submission failures with normal logging/notifications.

## Architecture and code map

Use VS Code core DOM, CSS, observables and services; do not introduce a webview, separate backend or generic workflow framework.

- [Board model](../src/vs/sessions/contrib/projectBoard/common/projectBoardModel.ts): identity, placement projection, filtering, recency and visible-card calculations.
- [Board catalogue](../src/vs/sessions/contrib/projectBoard/browser/projectBoardCatalog.ts): versioned collection, legacy migration and board management.
- [Board state](../src/vs/sessions/contrib/projectBoard/browser/projectBoardState.ts): board-scoped axis/placement and preference mutations.
- [Board view/service](../src/vs/sessions/contrib/projectBoard/browser/projectBoardService.ts): auxiliary board lifecycle, rendering, scrolling, focus, keyboard and drag/drop.
- [Navigation and drafts](../src/vs/sessions/contrib/projectBoard/browser/projectBoardNavigation.ts): exact-chat windows, creation, model references, publication and safe cleanup.
- [Metadata](../src/vs/sessions/contrib/projectBoard/browser/projectBoardMetadata.ts) and [questions](../src/vs/sessions/contrib/projectBoard/browser/projectBoardQuestions.ts): bounded projections of existing chat data and shared question widgets.
- [Preview pool](../src/vs/sessions/contrib/projectBoard/browser/projectBoardPreviewPool.ts): shared, ref-counted metadata/question helpers and per-process budgets across board views.
- [Contribution](../src/vs/sessions/contrib/projectBoard/browser/projectBoard.contribution.ts): command/keybinding registration.
- [Session management contract](../src/vs/sessions/services/sessions/common/sessionsManagement.ts): authoritative discovery and draft lifecycle.
- [Provisional-session service](../src/vs/workbench/contrib/chat/browser/agentSessions/agentHost/agentHostUntitledProvisionalSessionService.ts): backend-generation ownership; publication protects conversations from provisional cleanup.

`vs/sessions` may import `vs/workbench` and lower layers; ordinary workbench code must not import the higher Sessions layer. Keep provider-specific decisions in providers and native-window changes narrowly scoped.

## Capability boundaries

- Multiple named boards in one canonical Agents profile; no cross-device synchronization, team sharing or execution isolation.
- At most sixteen distinct active or warm-cached chat models are retained for prompt metadata across all boards. Already-loaded hidden chats can supply timestamp-only updates; cold hidden histories remain unknown until expanded.
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
- **PB-09:** Chat-level and session-level archive filtering without lost placements; multi-card selection, bulk Mark as Done, stale selection and partial-failure retry.
- **PB-10:** Stable editable axes, confirmed deletion and archived-placement accounting.
- **PB-11:** Accurate shared context, keyboard accessibility, non-color state and reachable content.
- **PB-15:** Interactive Ask User, custom answers, validation, exactly-once submission and refresh-safe input.
- **PB-16:** Shared New Session composer with Project Path and no footer action, isolated modal workspace/configuration/draft state, dismissal and trust, immediate embedded side-panel/standalone-window handoff after submission, original-board canonical placement, passive Agents draft discovery and publication without duplicates.
- **PB-17:** Cleanup only of untouched owned drafts; preserve entered, attached, pending, failed and submitted work.
- **PB-18:** Independent persisted display toggles, including default-visible Last Prompt and migration of the old Description preference; bottom status-bar layout and transparent metrics; state-duration transitions and lower bounds; reported zero versus unavailable credits; timer updates preserve focus/scroll and release on close.
- **PB-19:** Independent model/permission rows; exact chat/session configuration, bounded observation, no global-setting or sibling-chat substitution, live updates, and explicit unknown values.
- **PB-20:** Shared Keep Going and tool approval controls, exact request/option IDs and approval scope, stale/duplicate protection, retryable failures, retained control identity, and no cross-window focus or accidental read marking.
- **PB-21:** Themed auxiliary titlebar, fixed independent title, normal window controls, content sizing on resize/fullscreen, singleton behavior and disposal without orphaned chrome.
- **PB-22:** Independent row/column/tray collapse, compact layout, live summary counts, accessible disclosure state, hidden-card navigation exclusion, drop/reveal behavior, view-local reset and preservation of pending input.
- **PB-23:** Legacy-to-Default migration with untouched recovery data; named-board CRUD and empty-Hub recovery; independent placements, settings and native windows; explicit-ID sidebar/command routing; originating-board focus; pending answers across switching; globally bounded preview leases; deleting boards preserves agents while deleting sessions clears all board placements.

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
