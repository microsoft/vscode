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
- Accepted activation immediately shows **Loading...** beside the card title, without rebuilding the card or changing its runtime/read state. The side panel reveals a lightweight target-title/loading header while trust is pending, without creating a chat widget or loading provider history until trust is granted. Keep an explicit loading status through exact-model hydration. An already-visible loaded exact-chat panel retains its widget and avoids a loading-surface flash.
- After standalone trust approval, reveal the compact destination window before awaiting editor hydration; opt into the native chat editor's loading UI for local and contributed sessions. Give the visible loading surface a paint opportunity before synchronous widget/history binding, without delaying already-loaded exact-panel reuse or hidden-window loading. Model completion must not refocus an older window or mark it read after a newer card activation or after the user leaves/closes its window. Cancellation clears transient feedback without an error notification. A failed new-window open closes only its newly created, still-empty auxiliary part, never another window or a part containing editors.
- Both embedded and standalone Agents Hub Board Settings include **Open Chat in Side Panel**, off by default and persisted with the profile's board configuration. When enabled, card and Session List activation opens the exact conversation beside that originating board: the secondary sidebar in the embedded Hub, or a resizable right-hand pane inside the standalone board window. Neither route changes the main Agents selection or creates a separate chat window. Closing returns focus to that surface's card; disabling closes its pane and restores separate chat-window routing. Standalone windows retain bounded input/transcript-state caches across close/reopen without keeping widgets/models alive. New-session modal and legacy draft routing remain unchanged.
- The side-panel host owns transient current-chat identity, keyed by provider, owning-session resource and chat resource, after the chat loads successfully. Same-address canonical session replacement updates that identity; changed-address replacement closes the pane rather than indicating a stale conversation. Switching chats clears the previous identity while loading; closing, load failure, leaving or switching embedded boards, and disabling side-panel opening clear it. Hiding the auxiliary bar suppresses the current indication until it is shown again.
- Reopening the already-visible, successfully loaded exact chat reuses its side-panel widget and bound model, retaining input, transcript state and the current-card frame. Trust is still checked, and closing returns focus to the latest opening card. If the pane, bound model or exact identity changes during that check, use the normal loading path; cancelled or superseded opens cannot refocus or mark a newer chat read. This avoids repeated transcript rendering, not first-open hydration or rendering. No additional history preload or model/widget cache is introduced.
- Each surface marks only the exact chat loaded in its own side panel current, independently of keyboard focus, multi-selection, the main Agents selection and panels in other windows. Its frame uses `agentsHub.activeChatBorder` (the theme's chart green by default), distinct from the selected-card background and focus-colored outer outline; both remain visible when a card is monitored and selected. A folded child's disclosure uses the same monitored color and names the child without expanding the group or marking its parent current. Updating this indication does not navigate, mark read, persist state or replace card inputs. Session-list mode preserves its own selection semantics, reports the monitored conversation in Accessible View, and restores the card indication when returning to cards.
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
- Cards without a metadata slot offer **Pending refresh**, not duplicate prompt-unavailable/preview-limit warnings. An explicit refresh loads that exact chat's existing history without navigation, read-state changes or inference. It prefers idle slots, then revokes the least-recently-acquired noninteractive preview across all views, retaining the same sixteen-model bound. Pending questions and approvals never yield their slots; when every slot is protected, report the restriction explicitly and leave refresh retryable. Loading displays disabled **Refreshing...**; genuine provider failures, absent user requests and empty stored text retain their distinct messages.
- Deferred cards also refresh automatically during renderer idle time, starting one background preview at a time per view. Background acquisition may rotate settled noninteractive helpers but never cancels an unfinished load or pending interaction. Retain bounded prompt/context/configuration/credit snapshots separately from model references so refreshed cards do not revert to Pending refresh when their helper yields. Reuse existing helpers for live observation, invalidate snapshots when chat identity, update time or runtime state changes, and pause/cancel queued work when its view becomes inactive or closes.
- Async pickers and management actions retain their originating board ID; deleted IDs are rejected rather than redirected to another board.

### Layout and placement

- Start with one General row, P0/P1/P2/P3 columns and an Unassigned tray.
- Use a full-width grouping heading for each row instead of reserving a label column. Grid cells omit their redundant visible row/column label, retaining their accessible name, keyboard target, drop target and empty-space creation behavior.
- Place a native fuzzy search box between the board title and header actions in embedded and standalone views. Match all whitespace-separated terms across title, owning-session title, description, workspace label, state, provider and associated PR labels without loading transcripts for search. Preserve hierarchy for a matching descendant and filter Session List by any matching chat in the owning session.
- Search, topic and state filters are temporary per view, combine by intersection, and do not alter placements, read state or running work. Search reaches overflow chats before pagination, temporarily expands group folds, clears bulk selection, preserves pending-answer DOM, and restores folds when cleared. Escape clears all filters; Enter/Down focuses a visible card. Unavailable identities and legacy drafts remain searchable. Returning from a chat clears filters when revealing its origin.
- Activate a banner state count to toggle a single state filter. Selecting another switches state; the total chat count clears only state. Keep other facets available and retain the selected state at zero count. Banner counts respect text/topic, archive and auto-inclusion filters but ignore state; grid/tray counts reflect the visible projection. Preserve ancestors of matching children. Session List state filtering uses owning-session status and read state. State controls expose their pressed state and remain keyboard-accessible with horizontal scrolling at narrow widths.
- **Show Archived** lives in Board Settings, not a header button. Remove the header **New Session** button; retain the command and cell double-click creation.
- Support adding, renaming, reordering and deleting both axes. Persist stable IDs rather than labels.
- Keep at least one row and column; require nonempty labels.
- A chat has one explicit placement per board or inherits its main chat's placement; roots without a placement are Unassigned. Drag/drop and Ctrl/Cmd+Shift+M provide movement; the latter opens a searchable destination picker.
- Auto-include Sessions defaults on. Turning it off hides unplaced roots and drafts without deleting them; children of explicitly placed parents remain included. Collapsed Unassigned counts exclude hidden entries. Dragging a session from the Sessions list into a cell explicitly places its visible chats, even with auto-inclusion off, and expands a collapsed destination.
- Live cards have neither selection checkboxes nor inline **Mark as Done** buttons. Done remains in the toolbar and card context menu: it archives the entire backing session (including its other chats), stops active requests through the shared Sessions lifecycle, and preserves conversations and placements on every board. A context menu opened on a selected card targets the selection; one opened on an unselected card targets only that card's session. Archived, unavailable and unsent cards have no Done action. Legacy standalone drafts retain their confirmed **Delete Session Draft** action: deleting closes the editor through the normal close lifecycle before discarding the owned draft; canceling either confirmation preserves it.
- Card context menus offer **Move to row** and **Move to column**, listing every other configured axis value and preserving the counterpart coordinate. Unassigned cards use the first configured counterpart; inherited child coordinates count as current placement. Moves affect the clicked chat in that board, expand the destination and restore focus. An axis with no alternatives is disabled, as are both moves on read-only boards. The searchable picker retains Unassigned/Follow Parent.
- Where the chat supports renaming, F2 or the card's Rename context-menu action changes that chat's title, not its owning session or sibling chats. Canceling leaves the title unchanged.
- **Copy Chat Link** in a live Agent Host card's context menu reuses the native exact-chat link command, including local/remote and read-only child chats. It copies the clicked chat, not the selection or owning session's main chat, without opening or marking it read. Unsupported providers have no copy-link action; failures are reported.
- **Mark as Unread** in a live card's context menu uses the native provider-owned owning-session read-state action, not a local per-card overlay or the selected batch. Offer it for a read owning session while connected and unarchived, including read-only user-peer cards; explain its session scope. Providers control individual chat read flags, so fixed-read peer badges are not rewritten. Revalidate availability before execution and report provider failures with retry.
- **New Chat in This Session** is available from a supported card's context menu and the session-panel title context menu, targeting that card/panel's owning session rather than the main selection or selected batch. Reuse the native peer-chat composer and command. Quick, archived, external, disconnected and parent-managed sessions are ineligible in Hub menus; recheck stale targets and report command failures.
- Deleting an occupied axis requires confirmation and returns affected placements to Unassigned, including archived placements. Cancellation changes nothing.
- Arrow keys follow the visible card geometry. Home/End focus the first/last card and scroll it into view.
- Clicking the board background, grid cells or Unassigned must not draw container focus outlines. Keyboard navigation retains visible focus indicators.
- Nested question inputs and links keep their own keyboard/mouse behavior; they do not accidentally open or move the card.
- The standalone board owns a bounded `DomScrollableElement`, matching the workbench's themed scrollbar tracks and thumbs rather than native browser scrollbars. Keep its viewport and scrollbar DOM stable across card updates; synchronize both axes after wheel, thumb, keyboard and programmatic scrolling, viewport resizing and asynchronous content growth. Embedded boards use their custom view host for outer scrolling.
- Pin the selection controls and Unassigned tray above the grid in both surfaces. Limit the pinned region to half the viewport, with a separate themed scroll viewport for excess Unassigned content. Keep its heading and total/state counts visible when expanded as well as collapsed, without a duplicate Needs Input notice. Retain tray scroll position across live updates and folding, preserve pending input, and reveal grid keyboard targets below the pinned region. Native Session List mode receives the bounded tray height so its own keyboard reveal and virtualization remain correct.
- Include column headings in that same pinned region, aligned to the grid's shared column tracks through horizontal scrolling and column collapse. Background renders preserve the visible card/row anchor and its offset below the pinned area in the actual outer viewport, including the embedded custom-view scroller. Build replacement content off-DOM before committing it. Defer automatic recency ordering while either viewport is scrolled or a card is being edited; apply it when browsing returns to the top and interaction guards clear. Live states and metadata still update without reordering the working cell.
- Put board-wide totals and state counts to the left of the selected-chat count in the pinned banner. Count the current presentation across Unassigned and every cell, including folded descendants, overflow, eligible drafts and unavailable placements; honor archive visibility, auto-inclusion and text/topic filters without loading more history. Selection, collapse and the selected state filter do not change these facets. Keep the summary single-line and horizontally scrollable, with full text available on hover and in Accessible View; selection controls remain reachable at narrow widths. Keep totals visible in Session List mode, which counts owning sessions rather than individual chats.
- Use **chat/chats**, not **conversation/conversations**, in Hub UI text, with singular/plural count labels. All Hub summaries use **chat/chats**, including Session List mode; its represented-entry counting and owning-session state semantics remain unchanged. Retain **session/sessions** for operations that genuinely affect an entire owning session.
- Omit the visible board subtitle and archive-scope explanatory line. Keep the session-wide, non-deleting Mark as Done warning in its accessible description and hover.
- Expanded content must remain reachable, and ordinary live updates preserve scroll position. When embedded via the custom view's styled scrolling, the board notifies the host on any content-height change (for example, expanding a "+more" group) so the host's scroll container rescans immediately rather than lagging behind its passive resize observer.
- Each full-width row heading is left-aligned, with a leading chevron and bold label forming one frameless collapse/expand button. Clicking either part, Enter or Space toggles the row. A separate ellipsis button immediately after the label retains its rename, reorder and delete menu. Collapsed row totals follow that menu on the same line; the label, menu icon and counts are vertically centered. Unassigned also combines its label and leading chevron into one disclosure, with total/state counts immediately after it. Column labels retain their edit menus and right-side disclosures. All retain focus and hover feedback. Grid-cell summaries and attention counts align right without changing tray or child-summary alignment.
- Board headings, axis labels, control labels, card titles, workspace labels and state summaries remain single-line, with ellipsis where constrained; full names remain accessible and hovered titles/summaries expose full text. Prompt, description and pending-answer content can still wrap. Row labels use bold weight to distinguish them from columns.
- Collapsing a row hides all of its per-column cells from layout, leaving only the full-width heading. Keep the row's aggregate chat total and nonzero state counts immediately after the label's ellipsis menu, on the same centered line; do not show separate cell summaries beneath a collapsed row. Retain hidden cell/input DOM for re-expansion. Column headers, column-collapsed cells in expanded rows, the tray and child groups show their total plus nonzero Busy, Needs Input, Error, Idle unread, Idle read, Starting, Draft and Unavailable counts, with compact decorative native pet sprites. Counts include nested and overflow chats, honor archive/auto-inclusion filters, and update live; list mode counts owning sessions and observes their read state rather than a nested chat's read state.
- Persist row, column and Unassigned folds, individual card-detail expansion, child-group expansion and cell overflow limits in profile-machine storage, separately for each board's embedded and standalone surface. Reopening, renderer reload and restart restore them; unrelated boards and surfaces remain independent. New axes and Unassigned start expanded, and new cards/child groups start collapsed. Search temporarily reveals folded content without changing saved folds. Deliberate movement and close-return reveal persist the newly expanded destination. Axis labels still open their edit menus. Folding changes no placement, read state or running work.
- Column-collapsed cells remain visible drop targets while their row is expanded. Row collapse hides the entire cell row; moving a chat to that row or returning from a standalone chat expands its destination through the existing reveal path. Card-arrow navigation skips hidden cards.
- Retain pending question/approval DOM and the existing bounded model references while collapsed so entered answers are not discarded. Collapsed content is hidden from tab navigation; accessible overview text labels collapsed groups.
- Each eligible live card, including user-created peers and archived cards, has a frameless chevron to the right of its title. It hides or reveals workspace, prompt, configuration, context pills, pending interactions and bottom metrics without rebuilding the card on toggle. Title, runtime state and read-only/archived/disconnected cues remain visible. Unsaved/new cards start collapsed; explicit expansion persists independently per board and surface through live updates, presentation switches and view recreation. Detail folding does not fold child-session groups or stop background metadata refresh. Preserve pending-answer DOM and text, close hidden context popups, rescan scrolling and expose `aria-expanded`/`aria-controls`; Accessible View retains details and identifies the collapsed state.

Working pet badges composite the native orange-gold construction hard hat onto the shared typing sprite using its accessory rig, including the reduced-motion frame and both variants. Cache composites per view; preserve the native cadence, phase continuity and resolved workbench motion preference. Do not unlock achievements, change the selected accessory or enable the floating pet.

Normal main-editor opens, including Settings via Ctrl/Cmd+comma when not routed to a modal, dismiss a covering custom view before revealing the editor. Preserve modal/auxiliary routing and suppressed background working-set restoration; do not add duplicate shortcut bindings.

### Supervisor topic filters

- **Enable Topics** is an explicit consent action, off by default for every view. Feed the supervisor from metadata readiness and already-loaded model events; it does not wait for every board chat to load. Existing renderer-idle backfill includes all eligible board chats, independent of search, pagination, folds and card/list presentation, within the shared sixteen-metadata-helper cap and one new background load at a time. Already loaded models supply small snapshots without acquiring another reference. It does not execute tools, read files or send messages to monitored agents.
- Replace the total sixty-chat cutoff with an all-board FIFO work queue. Analyze at most eight ready/changed chats per request, one inference at a time and at most once per two minutes automatically while active. Coalesce repeated updates, preserve unprocessed chats ahead of newly changed analyzed chats, and skip unchanged snapshots. Manual **Refresh Topics** retries pending work or explicitly refreshes completed snapshots. Stop/cancel on view deactivation, closure or **Stop Topics**; resume unfinished work on reactivation and discard results for removed or changed identities. Errors require explicit retry.
- Send bounded titles/descriptions/workspace/state, at most 1500 characters of latest submitted prompt and 2048 characters from at most 64 completed-response parts, not full transcripts. Streaming response tokens do not repeatedly invalidate summaries. Chats awaiting details remain pending; inaccessible history may receive an explicitly labeled metadata-only summary, while real detail-load errors remain visible and retryable.
- Require one validated brief of at most 400 characters for every supplied chat in a successful batch. Show its plain-text **Summary** field even while card details are collapsed, with full hover/Accessible View text and search support. Merge successful results without replacing other chats; label earlier snapshots and retain them on errors/Stop. Show completed/total, waiting-detail and queued counts separately from errors.
- Show the six largest plain-text topic chips under search. Merge case-insensitive labels, count each analyzed chat once per topic, replace its old memberships when a newer summary arrives and remove ineligible/disappeared chats. Until analysis catches up, topics represent completed snapshots, not undiscovered work. Validated batch indices map to exact provider/session/chat card IDs; chips intersect with text search and do not change placements/read state or sidebar selection.
- Retain successful analyses in a native local, tool-disabled supervisor chat model, with up to twenty snapshots per transcript segment. **Supervisor Chat** opens that transcript read-only in a chat window. This is a board-view analysis session, not a remote agent or a session controlling the monitored agents; separate views require separate opt-in.
- Surface missing sign-in/model availability, timeout, provider failure, invalid schema and oversized output explicitly. Preserve any previous topics as a visibly failed/stale result rather than inventing heuristic replacements. A successful empty result displays **No topics found**. This feature requires access to `copilot-utility-small`; agent-host models that reject direct LM requests are not a fallback.

### Session list presentation

- **Toggle Session List** in Board Settings is off by default and saved with the profile's board preferences. It replaces live cards with the shared Sessions list renderer, following the Automations embedding pattern, without workspace or date sections. The board's axes remain unchanged.
- A session appears in only one cell, with its visible chats nested using the sidebar's expand/collapse behavior. A single occupied cell determines its destination; additional unplaced chats stay nested under the same session. If saved chats occupy conflicting cells, the session is Unassigned in list mode, or hidden when Auto-include Sessions is off. Merely toggling the presentation does not rewrite saved chat placements.
- Dragging either a session row or a nested chat, or using Ctrl/Cmd+Shift+M, moves all of that session's visible chats together. Returning to cards reflects the move. Dropping into a collapsed destination expands it, and dropping into Unassigned removes placements.
- Lists retain their identity and expansion state during live updates and use the board's outer scroller. Opening the session row opens its main chat; opening a nested row opens that exact chat, honoring the board's side-panel preference.
- Card-only metrics and question-answer widgets remain available in card mode. List mode retains standard session approval controls, and drafts and unavailable placements retain their existing fallback presentation.

### Live cards

- Keep one card per eligible user-facing chat. User-created **New Chat in This Session** peers follow the native sidebar's child eligibility beneath the main chat, including eligible read-only peers. Exclude `origin.kind: Tool` chats and sessions with provider-supplied `createdBySession`: tool-created subsessions/workers are controlled by their parent and are not separate board work. Exclude them consistently from cards, Session List, state counts, search/topic snapshots and metadata previews. Do not infer provenance from titles, read-only state or resource-name patterns.
- Observe late creation provenance and remove newly identified parent-managed sessions from the board projection without deleting, archiving, cancelling or changing their provider chats or saved placements. Remember discovered tool provenance for the lifetime of a view, including provider removal, so saved tool placements do not become unavailable placeholders. Corrected provider provenance restores normal user-chat eligibility; no provenance is inferred or added to persistent configuration.
- Unplaced children follow their parent's cell without additional saved placements. An explicit child placement in another cell displays that child separately; clearing the override with **Follow Parent** in the move picker or a drop into Unassigned restores inheritance. Explicit same-cell children remain nested but retain their saved placement when the parent moves.
- Child groups start collapsed in both card and Session List modes unless that board/surface has saved expansion. Both presentations share the surface's deliberate group disclosure state, preserving it through live updates and reopening. Folding preserves each child's identity, pending input, running work and read state; child counts and state breakdowns include every descendant. Hidden children are excluded from keyboard navigation, and returning from a child reveals every folded ancestor, including cell overflow.
- If a user peer's main chat is temporarily unavailable or archived, eligible peers remain visible as independent cards rather than disappearing. Existing user-chat placements remain intact across card/list toggles, and the native list keeps its existing eligibility and session-wide movement rules.
- Display title, workspace, runtime state, current-step description when reported, optional last prompt and categorized context pills. Do not repeat the owning session title as a visible `Session:` line; preserve ownership in the accessible card label.
- Use themed state color plus text and a decorative indicator: Busy/Starting, Needs Input, Error and Idle. Split Idle into read/unread.
- Display **Idle, read** and **Idle, unread** consistently on cards, summaries and accessible content; only the presentation changes, not provider-owned read semantics. Summaries use sleeping and waking pets.
- Card and summary state indicators share the native chat pet's sprite sources and configured stable/insiders variant: animated typing for Busy, worry for Needs Input, speechless for Error, sleeping for read Idle and waking for unread Idle. Starting summaries use rendering; Draft and Unavailable summary entries use idle and dizzy. Submitted legacy drafts also use the working pet. Follow the native `workbench.reduceMotion` policy: `auto` follows the OS, `on` uses static images and `off` explicitly enables typing even when the OS requests reduced motion. Cache validated sprites per view and keep typing on a continuous phase across rerenders, including progress updates faster than a frame; updates must not flash a loading fallback or freeze the first frame. Do not instantiate interactive pet widgets or enable the floating pet. Keep explicit state text and decorative-image semantics; log asset failures and use a static glyph fallback, never the running-person GIF. Center icons with flex layout and an explicit line-height, reserving their geometry before loading; summaries use compact images.
- Selecting, displaying, expanding or moving a card does not mark it read. Explicit opening follows provider-owned read marking.
- A disconnected provider is a separate stale/unavailable warning, not a replacement runtime state or an empty successful board.
- Replace inline context/PR links with the chat editor's native **Artifacts**, **References**, and **Pull Requests** dropdown pills. Show only populated categories, count their entries, and retain the dropdown even for a single entry. Recorded `isArtifact` provenance distinguishes produced artifacts from references; do not infer generated files from extensions or names. References also include the represented chat's loaded last-prompt context in its own dropdown section. Deduplicate targets, preferring owned PRs and recorded artifacts over repeated references. Deferred history still offers **Pending refresh**, not an empty or unavailable context claim.
- Reuse the native pill toolbar, dropdown, artifact section builder, file icons, copy-location actions and theme styling. Pills wrap within a narrow card. Opening an entry opens its resource without opening or marking the chat, moving the card or sending a prompt; command execution remains disabled. File/image artifacts use the resource opener rather than activating a different chat or attaching to its image carousel. The Hub does not inherit the active chat's global pill visibility or PR filters, and does not offer artifact removal.
- Associated PR dropdown entries retain repository/number labels, provider-reported state icons/colors, and available titles/states on hover and accessible labels. Reuse native Sessions provenance filtering: session-owned associations and legacy primary PRs qualify, while inherited checkout PRs and mere references stay in **References**. Read the represented chat's workspace (falling back to its session) plus explicitly recorded session PR artifacts, deduplicate by URI, and observe provider updates without loading chat history or starting separate PR polling. Associated PRs open externally.
- Retain pill widgets across live card rebuilds so keyboard focus and open dropdowns survive metadata/state changes. Update open entries in place; close the popup when its card is hidden, folded away, removed or its board is deactivated/disposed. Popup interaction belongs to the board's own window. Accessible View includes all available category labels, item labels and locations, including folded chats.

### Recency, overflow and archive

- Order by genuine submitted-request timestamps. Never substitute `updatedAt`, creation time, title changes or visit time.
- Unknown timestamps sort after known timestamps, with stable chat identity as the tie-breaker.
- Initially display three cards per cell. `+N more` reveals three additional cards at a time; Show Less restores the cap. Remember that limit per board/surface and cell across reopening. Removing an axis prunes its obsolete fold and cell-overflow entries.
- Expanded content grows the row; do not add cell-internal scrolling.
- Compute overflow after archive filtering. Cell attention counts include hidden Needs Input cards without changing recency ordering.
- Hide chats archived individually or through their owning session by default. Preserve their placements; Show Archived/unarchive restores them.
- Select multiple live cards and use **Mark as Done** to archive their backing sessions together without deleting conversations or placements. Archiving a session also archives its other chats, including unselected siblings; selecting multiple siblings archives the session only once. Selection is local to the board view, does not mark conversations read, and excludes drafts, unavailable cards and already archived chats. Failed archive operations remain visible and retryable.
- Click a card to select only it; Ctrl/Cmd+click toggles it, Shift+click selects a range of visible cards, and Ctrl/Cmd+Shift+click adds that range. Ctrl/Cmd+Shift+Enter toggles the focused card, matching the native list selection shortcut. Plain Enter/Space and unmodified double-click retain exact-chat opening. Modified double-clicks do not open chats; nested inputs, pills, links and disclosure controls never change selection. Expose selected state through the accessible card description and the live selection count, not an unsupported `aria-selected` attribute on a group.

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
- Double-click empty space in an expanded grid cell to open the same modal with that cell preselected in **Project Path**, in both embedded and standalone views. Chat cards, nested controls, Unassigned and collapsed cells retain their existing interactions; repeated activation opens only one dialog.
- The board placement picker is labeled **Project Path**; the workspace is chosen separately in the shared composer. There is no bottom Cancel button. The close control and Escape dismiss the modal while no submission is pending.
- As soon as submission exposes a running provisional conversation, embedded Hub creation dismisses the modal and opens that exact chat in the side panel, without opening a native window or replacing the main Agents draft. This creation handoff is independent of the existing-card **Open Chat in Side Panel** preference. Creation from a standalone board opens the submitted conversation in its standalone chat window. Neither route waits for canonical discovery or the agent's response to finish.
- The modal carries the original board ID and selected destination independently of global board selection. Place the existing provisional provider/session/chat identity immediately and reconcile it with canonical identity without duplicates or overwriting subsequent moves. Unassigned is the default when auto-inclusion is enabled; otherwise require an explicit cell so the created card remains visible. Placement is local board state, not provider metadata or prompt text.
- Modal drafts have independent input storage per board and embedded/standalone surface. Dismissal preserves unsent input for reopening but disposes only the owned unsent session; failures before acceptance retain input and surface an error. An accepted send owns its draft until canonical discovery settles, independently of the modal lifetime. Late discovery failures are logged and notified, never automatically resubmitted. Changing workspace, canceling trust or removing a provider must never submit to a stale prior target.
- Previously opened standalone drafts remain in Unassigned and can reopen their composer.
- The regular Agents window's current unsent draft is not displayed or counted in Unassigned. Its input and lifetime remain owned by Agents.
- Independently discovered chats arrive without reopening the board. Publication makes the regular Agents draft visible as one live card, without duplicates.
- Discarding/replacing an Agents-owned draft does not change the board or transfer cleanup ownership. Automation-dialog drafts are outside this integration.
- Closing an untouched board-owned composer discards only that owned draft. Retain work after typing, adding attachments, sending, a pending send or a failed send.
- Publication ends provisional backend-cleanup ownership. Releasing a UI/model reference must not delete a published conversation.
- Draft card identity remains stable when its input model resource changes.

### Storage and errors

- Persist the versioned board collection, stable board IDs/names/order, embedded selection, and each board's axes, placements and preferences in profile-local storage. Migrate the legacy single-board configuration intact into Default and retain the old payload for recovery; older display preferences keep their existing defaults.
- Each placement may retain `lastKnown` identity labels: chat title, owning-session title and optional workspace label, each bounded to 512 UTF-16 code units. The Hub service observes provider labels without loading chat models, updates existing placements across boards, and retains labels when discovery omits a chat. Moving or canonicalizing a placement retains its labels; removing the placement removes them. Older placements without labels remain valid.
- Do not persist transcript copies, runtime status, credentials or artifact caches as board configuration.
- Store versioned fold-only UI payloads separately under `sessions.agentHub.viewState.<encoded-board-id>.<surface>`. Do not save bulk selection, search/state/topic filters, supervisor execution or chat inputs in that payload. Unchanged runtime/metadata updates do not write it. Canonical main-chat identity reconciliation carries saved detail/group expansion; deleting a board removes only its two surface keys, and explicit Reset Hub clears all Hub view-state keys. Corrupt state is reported and preserved, with explicit Reset Saved View State recovery; failed writes report that current changes are temporary and offer retry.
- A placed chat absent from provider discovery is shown as unavailable, not presumed deleted or disposed. Display retained labels explicitly as last known in cards and the accessible view; older anonymous placements expose their provider/chat identifier. Rediscovery restores live provider data in the same cell without duplication. Keep the explicit Remove Placement action, which removes organization only.
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
- **PB-02:** Chat-granular identity, live discovery and tool/parent-managed session exclusion while retaining user peers.
- **PB-03:** Exactly-one-card movement, Unassigned return, picker cancellation and stale-selection safety.
- **PB-04:** State/read transitions; board observation and movement do not mark read or start work.
- **PB-05:** Exact standalone opening/reuse, main-selection isolation, title/configuration correctness and close/reopen preservation.
- **PB-03/PB-05 regression:** Create a session, send `hi`, close while Busy or after Idle, move to General/P1 and reopen. Preserve canonical identity, title and transcript after model-reference disposal.

### P1: useful persistent board

- **PB-06:** Persistence, Editor-to-Agents handoff, singleton behavior and corrupt-state recovery.
- **PB-07:** Genuine prompt recency and honest missing/historical metadata; user-priority Pending refresh at the shared quota, revocation across views, protected pending inputs, loading/error states and no navigation/read/inference side effects.
- **PB-08:** Eight-card expansion: 3 + 5 hidden, then 6 + 2 hidden, then 8; correct attention counts.
- **PB-09:** Chat-level and session-level archive filtering without lost placements; toolbar/context-menu Mark as Done in embedded and standalone boards without inline card buttons, session-wide worker/sibling scope, restoration, modifier/range/keyboard selection, stale selection and partial-failure retry.
- **PB-10:** Stable editable axes, confirmed deletion and archived-placement accounting.
- **PB-11:** Accurate shared context and associated PR provenance, chat-scoped workspace data, deduplication, live icon/title updates, safe external opening, keyboard accessibility, non-color state and reachable content.
- **PB-15:** Interactive Ask User, custom answers, validation, exactly-once submission and refresh-safe input.
- **PB-16:** Shared New Session composer with Project Path and no footer action, empty-cell double-click with preselected destination, isolated modal workspace/configuration/draft state, dismissal and trust, immediate embedded side-panel/standalone-window handoff after submission, original-board canonical placement, hidden Agents drafts and publication without duplicates.
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

- Rich transcript search beyond the board's title/description/workspace/state/PR-label filter.
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
