/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveElement, isHTMLElement } from '../../../../base/browser/dom.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplementation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { localize } from '../../../../nls.js';
import { AccessibilityVerbositySettingId } from '../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import { SessionWorktreeCleanupEditorFocusedContext } from '../../../common/contextkeys.js';

/**
 * Editor-scoped accessibility help for the Manage Agent Session Storage editor. It replaces the
 * window-wide chat help while this editor is focused, so screen reader users hear guidance about
 * the filters, table, and cleanup controls instead of the chat input.
 */
export class SessionWorktreeCleanupAccessibilityHelp implements IAccessibleViewImplementation {
	readonly priority = 130;
	readonly name = 'sessionWorktreeCleanup';
	readonly type = AccessibleViewType.Help;
	readonly when = SessionWorktreeCleanupEditorFocusedContext;

	getProvider(_accessor: ServicesAccessor) {
		const previouslyFocused = getActiveElement();
		const content: string[] = [
			localize('sessionWorktreeCleanupHelp.overview', "You are in the Manage Agent Session Storage editor. It lists agent session worktrees that are inactive and eligible for cleanup so you can mark those sessions as done and reclaim disk space."),
			localize('sessionWorktreeCleanupHelp.filter', "Use the Untouched For selector to choose how long a session must be inactive to be eligible. Changing it re-measures storage and updates the table and summary."),
			localize('sessionWorktreeCleanupHelp.summary', "A summary line above the table reports how many worktrees are eligible and about how much storage they use. A nearby info button explains why sessions are included or excluded."),
			localize('sessionWorktreeCleanupHelp.table', "The table lists one row per eligible session with its title, when it was last used, and its worktree size. Use Tab to move into the table. Each row has a checkbox to select it and an Open Session button, and a Select All checkbox in the header toggles every eligible row."),
			localize('sessionWorktreeCleanupHelp.cleanup', "Activate Mark as Done and Clean Up to mark the selected sessions as done and delete their worktrees after confirmation. It is disabled until at least one session is selected, and its label reports how much storage will be reclaimed."),
			localize('sessionWorktreeCleanupHelp.automatic', "The Automatic Cleanup section can automatically mark merged pull request sessions as done and optionally delete them after a retention period. It also includes a setting to turn the storage cleanup suggestion on or off."),
			localize('sessionWorktreeCleanupHelp.reopen', "Return to this editor any time by running Manage Agent Session Storage from the Command Palette, the Sessions More Actions menu, or a session's context menu."),
		];
		return new AccessibleContentProvider(
			AccessibleViewProviderId.SessionsStorageCleanup,
			{ type: AccessibleViewType.Help },
			() => content.join('\n'),
			() => {
				if (isHTMLElement(previouslyFocused) && previouslyFocused.isConnected) {
					previouslyFocused.focus();
				}
			},
			AccessibilityVerbositySettingId.SessionWorktreeCleanup,
		);
	}
}
