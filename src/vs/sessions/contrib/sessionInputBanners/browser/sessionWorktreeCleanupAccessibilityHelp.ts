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
			localize('sessionWorktreeCleanupHelp.activeMeasurementProgress', "A status line above the results reports the number of worktrees processed out of the scan total, independently of the filters. Sessions marked as done are not measured and are excluded from the scan total. Failed measurements count as processed. The final count remains visible when the scan completes."),
			localize('sessionWorktreeCleanupHelp.cachedActiveSizes', "Supported hosts save worktree sizes in the session database. Opening or refreshing cleanup reuses unchanged idle sizes and measures new, changed, or active worktrees. Done sessions are excluded from disk scans; their cleanup status can still be refreshed. Automatic storage hint checks use the same saved sizes and are limited to once an hour through existing triggers, without a recurring timer."),
			localize('sessionWorktreeCleanupHelp.diskUsageSummary', "A summary line above the table reports how many matching worktrees can be cleaned up. Disk usage estimates describe allocated file storage, not guaranteed freed space. Shared filesystem data and snapshots can reduce the space actually freed. Sessions marked as done show a dash instead of a size. Totals are omitted when they include a done session. A nearby info button explains eligibility. When no worktrees match the filters, an informational message replaces the summary, action, and table."),
			localize('sessionWorktreeCleanupHelp.workspaceAndProtectedRows', "The main table lists worktrees that can be cleaned up, with each session's title, workspace, last used time, and worktree size. Active sessions and sessions waiting for input have an unchecked checkbox for manual selection. Other worktrees are in the collapsed Unavailable for cleanup section, with an explanation below each title and no checkbox. Use Tab to focus the section heading and Enter or Space to expand or collapse it. Each session title is a link that opens the session and includes its cleanup explanation. The Select All checkbox above the main table toggles every row in the current filter that can be cleaned up."),
			localize('sessionWorktreeCleanupHelp.virtualizedTables', "Each table scrolls independently below its column headers. Columns can be resized, and narrow windows allow horizontal scrolling of the headers and rows together. Only rows near the visible area are rendered. Use {0} and {1} to navigate rows, {2} and {3} to navigate pages, and {4} and {5} to reach the first and last rows. Use {6} to open the focused session and Space to toggle its cleanup checkbox when available. Tab moves into the focused row's checkbox or session link. Row announcements include position, session title, workspace, last used time, storage, and cleanup status. Select All and the selected count and estimated size include matching off-screen worktrees.", '<keybinding:list.focusUp>', '<keybinding:list.focusDown>', '<keybinding:list.focusPageUp>', '<keybinding:list.focusPageDown>', '<keybinding:list.focusFirst>', '<keybinding:list.focusLast>', '<keybinding:list.select>'),
			localize('sessionWorktreeCleanupHelp.cleanupDiskUsage', "Activate Clean Up Worktrees to schedule removal of the selected sessions' worktrees and mark those sessions as done after confirmation. It is disabled until at least one session is selected. Its label reports the selected worktree count and, when every selected session has a size estimate, their estimated disk usage."),
			localize('sessionWorktreeCleanupHelp.verifiedBatchResults', "After confirmation, selected rows immediately show Queued for cleanup. A spinner replaces their checkboxes while cleanup is queued, pending, or running. Waiting for cleanup means the host has not confirmed progress yet, not that removal succeeded. Cleanup cannot be submitted again while requests are being scheduled. Other selections are preserved. A persistent status line reports removed, pending, failed, and unresolved worktrees, independently of the filters. When the host confirms all of a session's worktrees are absent, its row stays in place with Worktree removed and zero disk usage. Removed rows cannot be selected again, but their session links remain available. Reopening this editor omits confirmed removals. A scheduling failure does not stop the remaining requests. Retry Failed Worktrees retries failed rows in the current filter without selecting unrelated rows; it is disabled when none can be retried."),
			localize('sessionWorktreeCleanupHelp.checkedRetry', "Sessions already marked as done can still have worktrees. Their host checks whether the worktree paths exist without scanning their contents. Remaining worktrees show a dash for unmeasured disk usage, and are selected by default when their host supports retrying cleanup, including previous failures. Activate Clean Up Worktrees to retry without deleting session history or waiting for the automatic retry. Scheduled and running cleanup is not selectable. Cleanup you request stays visible in the main table while it progresses, without a checkbox. An explanation below each session title reports blocked, deferred, or failed cleanup, including the error when available. Supported hosts preserve failed and deferred cleanup outcomes across restarts. An unavailable or failed existence check never means zero disk usage or confirmed removal."),
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
