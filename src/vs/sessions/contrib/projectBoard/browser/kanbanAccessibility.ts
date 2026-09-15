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
			localize('kanban.help.overview', "You are in the Kanban view. Chats are arranged first in Unassigned, then in cells by area and priority."),
			localize('kanban.help.navigation', "Use Tab to move among board controls and cards. With a card focused, use the arrow keys to move between cards, Enter or Space to open the chat, Escape to close its standalone window, and Control or Command Shift M to choose a board cell. Tab to a card's Delete button to permanently delete its backing session or discard its draft."),
			localize('kanban.help.editing', "Use the custom view header buttons to add rows or columns, show archived chats, start a new session, or change board settings. Turn off Auto-include Sessions to show only explicitly placed chats, then drag a session from the Sessions list onto a board cell to add it. Use the row and column controls on the board to rename, reorder, or remove axes. Drag a card onto a cell to move it."),
			localize('kanban.help.accessibleView', "Use Open Accessible View to read all current board cells and chats as text."),
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
