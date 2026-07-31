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
import { CHANGES_VIEW_ID } from '../common/changes.js';
import { ChangesViewPane } from './changesView.js';

/**
 * Accessibility help dialog for the Changes view. Documents the file tree and
 * the two collapsible sections beneath it - Other Files and Checks - and how
 * to operate them with the keyboard.
 */
export class SessionsChangesAccessibilityHelp implements IAccessibleViewImplementation {
	readonly priority = 115;
	readonly name = 'sessionsChanges';
	readonly type = AccessibleViewType.Help;
	readonly when = FocusedViewContext.isEqualTo(CHANGES_VIEW_ID);

	getProvider(accessor: ServicesAccessor) {
		const viewsService = accessor.get(IViewsService);

		const content: string[] = [];
		content.push(localize('sessionsChanges.overview', "You are in the Changes view. It shows the files changed by the current session as a tree, followed by two collapsible sections: Other Files and Checks."));
		content.push(localize('sessionsChanges.tree', "Use the up and down arrow keys to move between changed files, and the left and right arrow keys to collapse or expand folders. Press Enter to open the selected file's diff."));
		content.push(localize('sessionsChanges.sessionFiles', "The Other Files section lists files that were created, edited, or deleted outside the workspace during this session, such as configuration files in your home directory. These files are not part of the workspace and won't be committed."));
		content.push(localize('sessionsChanges.sessionFilesToggle', "The Other Files header is a button. Press Enter or Space to collapse or expand the list. When expanded, use the arrow keys to move through the files and press Enter to open one: created or deleted files open in an editor, while edited files open as a diff against their pre-session content."));
		content.push(localize('sessionsChanges.checks', "The Checks section lists the continuous integration checks for the session's pull request. Its header is a button: press Enter or Space to collapse or expand it{0}.", '<keybinding:sessions.action.revealCIChecks>'));
		content.push(localize('sessionsChanges.viewMode', "The Changes view can show files as a tree or a flat list. Use the view's toolbar actions to switch between Tree and List modes."));
		content.push(localize('sessionsChanges.diffView', "File diffs can be shown side by side or inline. Use the Toggle Diff View command to switch between them{0}.", '<keybinding:toggle.diff.renderSideBySide>'));

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
