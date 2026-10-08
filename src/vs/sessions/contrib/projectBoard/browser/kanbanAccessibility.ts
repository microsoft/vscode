/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveElement, isHTMLElement } from '../../../../base/browser/dom.js';
import { localize } from '../../../../nls.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../platform/accessibility/browser/accessibleView.js';
import { AccessibleViewRegistry, IAccessibleViewImplementation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { AccessibilityVerbositySettingId } from '../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import { Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
import { IAgentWorkbenchLayoutService } from '../../../browser/workbench.js';
import { KanbanCustomViewFocusContext } from '../../../common/contextkeys.js';
import { IProjectBoardService } from './projectBoardService.js';

function createFocusRestorer(layoutService: IAgentWorkbenchLayoutService): () => void {
	const focusedElement = getActiveElement();
	return () => {
		if (isHTMLElement(focusedElement) && focusedElement.isConnected) {
			focusedElement.focus();
		} else {
			layoutService.focusPart(Parts.CUSTOM_VIEW_GRID_PART);
		}
	};
}

class KanbanAccessibilityHelp implements IAccessibleViewImplementation {
	readonly type = AccessibleViewType.Help;
	readonly priority = 106;
	readonly name = 'sessions-kanban-help';
	readonly when = KanbanCustomViewFocusContext;

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider {
		const content = [
			localize('kanban.help.overview', "You are in Agents Hub. Chats are arranged first in Unassigned, then in cells by area and priority. The pinned banner shows board totals and counts by state to the left of the selected-chat count, including folded and overflow chats and respecting current filters. Session List mode counts owning sessions. Unassigned also shows its own total and state counts; its chats scroll separately when needed."),
			localize('kanban.help.sessionList', "Use Toggle Session List in Board Settings to show sidebar-style sessions with expandable chats instead of cards. Each session appears in one cell without workspace grouping. In a session list, use Up and Down to navigate, Right and Left to expand or collapse chats, and Enter to open. Drag a session or nested chat, or press Control or Command Shift M, to move the whole session. Tab moves between lists and board controls. Turn the setting off to restore cards and inline question answering."),
			localize('kanban.help.navigation', "Use Tab to move among board controls and cards. With a card focused, use the arrow keys to move between cards, Enter or Space to open the chat, and Control or Command Shift M to choose a board cell. Unsent standalone drafts retain a Delete Session Draft action."),
			localize('kanban.help.selection', "Click a live card to select only it. Use Control or Command click to toggle selection, Shift click to select a range of visible cards, or Control or Command Shift Enter on a focused card to toggle selection. Nested controls do not select cards. Use Mark as Done in the board toolbar or context menu to archive selected sessions, including their other chats, without deleting chats or placements. This stops active requests. Use Clear Selection to start over. Selection does not mark chats as read."),
			localize('kanban.help.sidePanel', "Turn on Open Chat in Side Panel in Board Settings to open chats beside the originating Agents Hub board. Embedded boards use the secondary sidebar; standalone boards use their own resizable right-hand pane. Close the side-panel chat to return focus to its card. Each surface marks only its own loaded chat current. With the setting off, chats open in separate chat windows. New-session modal and legacy draft routing are unchanged."),
			localize('kanban.help.currentChat', "The chat visible in the side panel is marked current on its exact card with a distinct themed frame and an accessible description, without an additional visible label. Selected cards use a separate selection background and outline. If the monitored card is in a folded child group, that group's disclosure control names it without expanding. This is independent of keyboard focus and multi-selection. Hiding or closing the side panel removes the indication. In session list mode, Open Accessible View identifies the monitored chat without changing list selection."),
			localize('kanban.help.toggleSidePanel', "Use Toggle Side Panel ({0}) to hide or show the chat beside Kanban without stopping a running request.", '<keybinding:workbench.action.agentToggleSidePanel>'),
			localize('kanban.help.rename', "Right-click a card and choose Rename, or press F2 with the card focused, to rename that chat when supported. This updates the card title, not the owning session or its other chats."),
			localize('kanban.help.copyLink', "Use Copy Chat Link in a local or remote Agent Host card's context menu to copy a link to that exact chat, including read-only child chats. Copying does not open the chat or mark it as read."),
			localize('kanban.help.markUnread', "Use Mark as Unread in a read session's card context menu to mark its owning session unread without opening it. The action does not affect other selected sessions or invent per-chat read flags; providers control individual chat read state."),
			localize('kanban.help.move', "A card's Move to row and Move to column context submenus list the other rows or columns and preserve the other coordinate. Unassigned cards use the first row or column for the missing coordinate. These actions move the clicked chat only; moving a child gives it its own placement. Use Control or Command Shift M for Unassigned or Follow Parent."),
			localize('kanban.help.search', "The search box between the title and header actions filters titles, descriptions, workspace labels, states and pull request labels using fuzzy matching. Every word must match one of these fields. Escape clears the search, selected topic and state. Filtering temporarily expands groups, clears card selection and preserves pending answers; clearing restores group folds. Session List mode filters owning sessions when any of their chats matches."),
			localize('kanban.help.stateFilters', "Activate a state count in the pinned banner to filter chats by that state, combined with the search and selected topic. Activate it again or the total chat count to clear just the state filter. The pressed button identifies the active state and remains available if its count reaches zero. Banner totals ignore the selected state so the other states remain reachable; tray and grid totals describe filtered entries. Session List mode uses the owning session's status and read state."),
			localize('kanban.help.topics', "Enable Topics asks permission for a tool-free supervisor to analyze all eligible board chats incrementally as details become available. Ready snapshots are queued in batches of up to eight; automatic analysis runs at most once every two minutes while this view is active. Summary text stays visible on collapsed cards and is searchable. Progress distinguishes completed summaries, waiting details and queued work; metadata-only and earlier snapshots are labeled. Topic buttons count analyzed chats, filter their exact identities and combine with search. Stop Topics or an inactive view pauses monitoring. Supervisor Chat opens the read-only analysis transcript. Only bounded latest-prompt and completed-response previews are used, not full histories. Model and detail-loading failures remain explicit and retryable."),
			localize('kanban.help.editing', "Use the header buttons to add rows or columns and the gear menu to Show Archived or change board settings. Row labels span the grid as group headings; cells retain accessible row and column names without redundant visible labels. Turn off Auto-include Sessions to show only explicitly placed chats, then drag a session from the Sessions list onto a board cell to add it. Use the row and column controls to rename, reorder, or remove axes."),
			localize('kanban.help.newSession', "There is no header New Session button. Use the New Session command or double-click empty space in an expanded grid cell to open the shared composer with that cell selected in Project Path. Choose a workspace and send a prompt to start the chat. Escape dismisses an open picker before closing the dialog."),
			localize('kanban.help.accessibleView', "Use Open Accessible View to read all current board cells and chats as text."),
			localize('kanban.help.refresh', "Cards whose details have not loaded offer Pending refresh and refresh automatically during idle time. Activate it to refresh immediately without opening the chat, marking it read or sending a prompt. Refreshing is disabled while loading. Previously loaded details remain visible when another preview needs a slot; pending loads, answers and approvals are protected from background refresh. Actual provider errors and missing prompt text remain explicit."),
			localize('kanban.help.contextPills', "Cards offer Artifacts, References and Pull Requests dropdown pills when that category has entries. Tab to the pills, use Left and Right to choose a category, and Enter or Space to expand it, including categories with one entry. Use Up and Down to choose an entry, Enter to open it, and Escape to close the dropdown. References include loaded last-prompt context. Associated pull requests appear independently of history previews with their available title and state. Opening context does not open or mark the chat as read. Open Accessible View includes the item labels and locations."),
			localize('kanban.help.cardDetails', "Live cards start with their details collapsed. Use the chevron to the right of each title to expand or collapse them. Title, runtime status and availability remain visible. Pending answers and approvals are retained without submitting them. Detail expansion is local to this board view and independent of child-session folding."),
			localize('kanban.help.createdSessions', "User-created New Chat in This Session peers remain beneath their main chat unless explicitly moved. Tool-origin chats and sessions created by an agent tool are managed by the parent and are not shown or counted in the Hub. Hiding them does not delete or cancel provider work. Provenance is not inferred from titles or read-only state."),
			localize('kanban.help.newPeer', "Use New Chat in This Session in a card's context menu or the session-panel title menu to open the native composer for that owning session. The action does not target another selected chat. Sessions that do not support peer chats, quick chats, archived, external or disconnected sessions are unavailable."),
			localize('kanban.help.savedFolds', "Card details, child-chat groups, rows, columns, Unassigned and each cell's More or Less limit are remembered for each board and separately for its embedded and standalone views. Reopening or reloading restores them. New cards and child groups still start collapsed. Search temporarily reveals folded groups without replacing saved folds; moving or returning to a chat remembers its expanded destination. Selection, filters, supervisor execution and chat input are not stored as folding state."),
			localize('kanban.help.stickyHeaders', "Column headings stay pinned with the selection controls and Unassigned tray. Background updates preserve the visible working card or row; automatic recency sorting pauses while you browse scrolled content or edit a card and resumes when you return to the top."),
			localize('kanban.help.loading', "Opening a card immediately shows Loading beside its title. The destination panel shows the selected chat title and loading status without waiting for history; workspace trust still gates model access. Chat windows are revealed while loading. Closing a loading destination cancels navigation, and older completions do not take focus back from a newer chat."),
			localize('kanban.help.collapse', "Click a row's bold, left-aligned label or its leading chevron to collapse or expand it; Enter and Space activate the same disclosure. The separate More Actions button immediately after the row label opens its rename, reorder and delete menu. Collapsing a row hides all its column cells and displays the aggregate total and state counts beside that button. Unassigned also combines its label and leading chevron into one disclosure, with counts immediately after it. Column disclosures remain at the right. Summaries show Busy, Needs Input, Error, Idle unread, Idle read, Starting, Draft and Unavailable, including hidden children and overflow chats; session list mode counts owning sessions and their read state. Hidden cards are skipped by navigation. Moving to a collapsed row expands the destination; column-collapsed cells remain visible drop targets in expanded rows. Collapsing preserves pending answers and does not stop agents."),
		].join('\n');
		return new AccessibleContentProvider(
			AccessibleViewProviderId.Kanban,
			{ type: AccessibleViewType.Help },
			() => content,
			createFocusRestorer(accessor.get(IAgentWorkbenchLayoutService)),
			AccessibilityVerbositySettingId.Kanban,
		);
	}
}

class KanbanAccessibleView implements IAccessibleViewImplementation {
	readonly type = AccessibleViewType.View;
	readonly priority = 106;
	readonly name = 'sessions-kanban-view';
	readonly when = KanbanCustomViewFocusContext;

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider {
		const projectBoardService = accessor.get(IProjectBoardService);
		return new AccessibleContentProvider(
			AccessibleViewProviderId.Kanban,
			{ type: AccessibleViewType.View },
			() => projectBoardService.getAccessibleContent(),
			createFocusRestorer(accessor.get(IAgentWorkbenchLayoutService)),
			AccessibilityVerbositySettingId.Kanban,
		);
	}
}

AccessibleViewRegistry.register(new KanbanAccessibilityHelp());
AccessibleViewRegistry.register(new KanbanAccessibleView());
