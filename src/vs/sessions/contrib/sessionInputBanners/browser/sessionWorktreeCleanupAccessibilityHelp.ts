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
 * Editor-scoped accessibility help for the Worktree Cleanup editor. It replaces the
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
			localize('sessionWorktreeCleanupHelp.allWorktreesOverview', "You are in the Worktree Cleanup editor. It lists all agent session worktrees, including recent and protected sessions. Any uncommitted changes are committed before a worktree is removed. Cleaning up a session marks it as done; you can restore the session later to recreate its worktree."),
			localize('sessionWorktreeCleanupHelp.workspaceAndAgeFilters', "Use the Untouched For selector to filter by inactivity starting at one day, or choose Any time to include sessions used today. When worktrees belong to multiple workspaces, use the Workspace selector to show one workspace or All workspaces. Filters limit both the table and cleanup selection. Changing workspace clears the selection."),
			localize('sessionWorktreeCleanupHelp.measurementProgress', "A status line above the results reports the overall number of worktrees processed out of the scan total, independently of the filters. Failed measurements count as processed. The final count remains visible when the scan completes."),
			localize('sessionWorktreeCleanupHelp.cachedSizes', "Supported hosts save worktree sizes in the session database. Opening or refreshing cleanup reuses unchanged idle sizes and measures new, changed, or active worktrees. Automatic storage hint checks use the same saved sizes and are limited to once an hour through existing triggers, without a recurring timer. Removed or recreated worktrees are checked when cleanup refreshes."),
			localize('sessionWorktreeCleanupHelp.matchingWorktreesSummary', "A summary line above the table reports how many matching worktrees can be cleaned up and, when nonzero, about how much storage they use. A nearby info button explains eligibility. When no worktrees match the filters, an informational message replaces the summary, action, and table."),
			localize('sessionWorktreeCleanupHelp.workspaceAndProtectedRows', "The main table lists worktrees that can be cleaned up, with each session's title, workspace, last used time, and worktree size. Active sessions and sessions waiting for input have an unchecked checkbox for manual selection. Other worktrees are in the collapsed Unavailable for cleanup section, with an explanation below each title and no checkbox. Use Tab to focus the section heading and Enter or Space to expand or collapse it. Each session title is a link that opens the session and includes its cleanup explanation. The Select All checkbox in the main table header toggles every row in the current filter that can be cleaned up."),
			localize('sessionWorktreeCleanupHelp.cleanup', "Activate Clean Up Worktrees to delete the selected sessions' worktrees and mark those sessions as done after confirmation. It is disabled until at least one session is selected, and its label reports how many worktrees will be cleaned up."),
			localize('sessionWorktreeCleanupHelp.retry', "Sessions already marked as done can still have worktrees. When their host supports retrying cleanup, these rows are selected by default unless a previous removal failed. Failed cleanup requires manual selection. Activate Clean Up Worktrees to retry without deleting session history. Scheduled and running cleanup is not selectable. Cleanup you request stays visible in the main table while it progresses, without a checkbox, and disappears when removal is confirmed. An explanation below each session title reports blocked, deferred, or failed cleanup, including the error when available. Worktree still present means the previous outcome is unknown, not that cleanup failed."),
			localize('sessionWorktreeCleanupHelp.automatic', "Changes in the Cleanup Settings section are saved immediately. Background cleanup evaluates existing and future sessions after confirming their eligibility. Use the checkboxes to enable automatic completion or deletion of merged pull request sessions, then adjust the number of days in the adjacent input. Another checkbox turns the storage cleanup suggestion on or off."),
			localize('sessionWorktreeCleanupHelp.reopen', "Return to this editor any time by running Open Worktree Cleanup from the Command Palette or the Sessions More Actions menu."),
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
