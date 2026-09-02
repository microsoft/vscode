/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { localize } from '../../../../nls.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplementation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { AccessibilityVerbositySettingId } from '../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import { FocusedViewContext } from '../../../../workbench/common/contextkeys.js';
import { IAgentWorkbenchLayoutService } from '../../../browser/workbench.js';
import { CHANGES_VIEW_ID } from '../common/changes.js';
import { ChangesViewPane } from './changesView.js';

/**
 * Accessibility help dialog for the Changes view. Documents the file tree and
 * the collapsible Checks section beneath it, and how to operate them with the
 * keyboard.
 */
export class SessionsChangesAccessibilityHelp implements IAccessibleViewImplementation {
	readonly priority = 115;
	readonly name = 'sessionsChanges';
	readonly type = AccessibleViewType.Help;
	readonly when = FocusedViewContext.isEqualTo(CHANGES_VIEW_ID);

	getProvider(accessor: ServicesAccessor) {
		const viewsService = accessor.get(IViewsService);
		const layoutService = accessor.get(IAgentWorkbenchLayoutService);

		const content: string[] = [];
		content.push(localize('sessionsChanges.overview', "You are in the Changes view. It shows the files changed by the current session as a tree, followed by a collapsible Checks section."));
		content.push(localize('sessionsChanges.tree', "Use the up and down arrow keys to move between changed files, and the left and right arrow keys to collapse or expand folders. Press Enter to open the selected file's diff."));
		content.push(localize('sessionsChanges.checks', "The Checks section lists the continuous integration checks for the session's pull request. Its header is a button: press Enter or Space to collapse or expand it{0}.", '<keybinding:sessions.action.revealCIChecks>'));
		content.push(localize('sessionsChanges.viewMode', "The Changes view can show files as a tree or a flat list. Use the view's toolbar actions to switch between Tree and List modes."));
		content.push(localize('sessionsChanges.operations', "When available, the Changes toolbar or editor title bar also provides actions to commit, merge, sync, or create a pull request. When Agent Merge is the primary action, activate it to toggle Agent Merge and use its dropdown to configure it. Use Tab and Shift+Tab to move between the file list and toolbar actions."));
		content.push(layoutService.isSinglePaneLayoutEnabled
			? localize('sessionsChanges.diffView.singlePane', "File diffs can prefer side-by-side or inline layout. Unless screen reader optimized mode is enabled, side-by-side diffs automatically use inline layout when space is limited. Use Always Show Inline Diff in the editor header's More Actions menu, or use the Toggle Preferred Diff View command to switch the preference{0}.", '<keybinding:toggle.diff.renderSideBySide>')
			: localize('sessionsChanges.diffView.classic', "File diffs can use side-by-side or inline layout. Use Inline View in the editor title area's More Actions menu, or use the Toggle Inline View command to switch the layout{0}.", '<keybinding:toggle.diff.renderSideBySide>'));

		return new AccessibleContentProvider(
			AccessibleViewProviderId.SessionsChanges,
			{ type: AccessibleViewType.Help },
			() => content.join('\n'),
			() => {
				const view = viewsService.getViewWithId<ChangesViewPane>(CHANGES_VIEW_ID);
				view?.focus();
			},
			AccessibilityVerbositySettingId.SessionsChanges,
		);
	}
}
