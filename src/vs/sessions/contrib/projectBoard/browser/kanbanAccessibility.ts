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
			localize('kanban.help.overview', "You are in Agents Hub. Chats are arranged first in Unassigned, then in cells by area and priority."),
			localize('kanban.help.sessionList', "Use Toggle Session List in Board Settings to show sidebar-style sessions with expandable chats instead of cards. Each session appears in one cell without workspace grouping. In a session list, use Up and Down to navigate, Right and Left to expand or collapse chats, and Enter to open. Drag a session or nested chat, or press Control or Command Shift M, to move the whole session. Tab moves between lists and board controls. Turn the setting off to restore cards and inline question answering."),
			localize('kanban.help.navigation', "Use Tab to move among board controls and cards. With a card focused, use the arrow keys to move between cards, Enter or Space to open the chat, and Control or Command Shift M to choose a board cell. Tab to a live card's Mark as Done button to archive its entire backing session, including other chats, without deleting conversations or placements. This stops active requests. The card button affects only that session, not other selected sessions. Unsent standalone drafts retain a Delete Session Draft action."),
			localize('kanban.help.selection', "Tab to a live card's selection checkbox and press Space to select or deselect it. Select several cards, then use Mark as Done in the board toolbar or context menu. This archives each selected card's entire backing session, including other chats in that session, without deleting conversations or placements. Use Clear Selection to start over. Selection does not mark chats as read."),
			localize('kanban.help.sidePanel', "Turn on Open Chat in Side Panel in Board Settings to open chats beside Kanban in the secondary sidebar. Close the side-panel chat to return focus to its card. With the setting off, chats open in standalone windows; press Escape to close a standalone chat window. Session drafts and the separate Project Board window keep their standalone opening behavior."),
			localize('kanban.help.currentChat', "The conversation visible in the side panel is marked current on its exact card with a highlight frame and an accessible description, without an additional visible label. If the monitored card is in a folded child group, that group's disclosure control names it without expanding. This is independent of keyboard focus and the checkboxes used for Mark as Done. Hiding or closing the side panel removes the indication. In session list mode, Open Accessible View identifies the monitored conversation without changing list selection."),
			localize('kanban.help.toggleSidePanel', "Use Toggle Side Panel ({0}) to hide or show the chat beside Kanban without stopping a running request.", '<keybinding:workbench.action.agentToggleSidePanel>'),
			localize('kanban.help.rename', "Right-click a card and choose Rename, or press F2 with the card focused, to rename that chat when supported. This updates the card title, not the owning session or its other chats."),
			localize('kanban.help.move', "A card's Move to row and Move to column context submenus list the other rows or columns and preserve the other coordinate. Unassigned cards use the first row or column for the missing coordinate. These actions move the clicked chat only; moving a child gives it its own placement. Use Control or Command Shift M for Unassigned or Follow Parent."),
			localize('kanban.help.editing', "Use the custom view header buttons to add rows or columns, show archived chats, start a new session, or change board settings. Turn off Auto-include Sessions to show only explicitly placed chats, then drag a session from the Sessions list onto a board cell to add it. Use the row and column controls on the board to rename, reorder, or remove axes. Drag a card onto a cell to move it."),
			localize('kanban.help.newSession', "New Session opens a dialog with the same workspace and agent pickers as the Agents window. Double-click empty space in an expanded grid cell to open this dialog with that cell selected in Project Path. Choose a workspace and send a prompt to start the chat. Escape dismisses an open picker before closing the dialog."),
			localize('kanban.help.accessibleView', "Use Open Accessible View to read all current board cells and chats as text."),
			localize('kanban.help.collapse', "Use the disclosure buttons at the right of each header to collapse rows, columns, or Unassigned. Collapsed groups show the total and counts by state: Busy, Needs Input, Error, Idle, Starting, Draft and Unavailable. Counts include hidden children and overflow chats; session list mode counts owning sessions. Hidden cards are skipped by navigation, and dropping into a collapsed cell expands it. Collapsing preserves pending answers and does not stop agents."),
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
