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
 * Editor-scoped accessibility help for the Clean Up Agent Worktrees editor. It replaces the
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
			localize('sessionWorktreeCleanupHelp.overview', "You are in the Clean Up Agent Worktrees editor. It lists agent session worktrees that are inactive and eligible for cleanup so you can reclaim the disk space they use. Cleaning up a session marks it as done and deletes its worktree; you can restore the session later to recreate it."),
			localize('sessionWorktreeCleanupHelp.filter', "Use the Untouched For selector to choose how long a session must be inactive to be eligible. Changing it re-measures storage and updates the table and summary."),
			localize('sessionWorktreeCleanupHelp.summary', "A summary line above the table reports how many worktrees are eligible and about how much storage they use. A nearby info button explains why sessions are included or excluded."),
			localize('sessionWorktreeCleanupHelp.table', "The table lists one row per eligible session with its title, when it was last used, and its worktree size. Use Tab to move into the table. Each row has a checkbox to select it and a session title link that opens the session, and a Select All checkbox in the header toggles every eligible row."),
			localize('sessionWorktreeCleanupHelp.cleanup', "Activate Clean Up Worktrees to delete the selected sessions' worktrees and mark those sessions as done after confirmation. It is disabled until at least one session is selected, and its label reports how many worktrees will be cleaned up."),
			localize('sessionWorktreeCleanupHelp.automatic', "The Cleanup Settings section can automatically mark merged pull request sessions as done and optionally delete them after a retention period. It also includes a setting to turn the storage cleanup suggestion on or off."),
			localize('sessionWorktreeCleanupHelp.reopen', "Return to this editor any time by running Clean Up Agent Worktrees from the Command Palette, the Sessions More Actions menu, or a session's context menu."),
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
