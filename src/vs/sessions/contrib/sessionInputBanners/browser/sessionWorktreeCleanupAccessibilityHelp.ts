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
			localize('sessionWorktreeCleanupHelp.allWorktreesOverview', "You are in the Worktree Cleanup editor. It lists all agent session worktrees, including recent and protected sessions. Normal cleanup commits uncommitted changes before removing a worktree. Force Remove is different: after a separate confirmation, it permanently discards uncommitted changes and ignored or untracked files. Cleaning up a session marks it as done; you can restore the session later to recreate its worktree from committed changes."),
			localize('sessionWorktreeCleanupHelp.workspaceAndAgeFilters', "Use the Untouched For selector to filter by inactivity starting at one day, or choose Any time to include sessions used today. When worktrees belong to multiple workspaces, use the Workspace selector to show one workspace or All workspaces. Filters limit both the table and cleanup selection. Changing workspace clears the selection."),
			localize('sessionWorktreeCleanupHelp.activeMeasurementProgress', "A status line above the results reports the number of worktrees processed out of the scan total, independently of the filters. Sessions marked as done are not measured and are excluded from the scan total. Failed measurements count as processed. The final count remains visible when the scan completes."),
			localize('sessionWorktreeCleanupHelp.cachedActiveSizes', "Supported hosts save worktree sizes in the session database. Opening or refreshing cleanup reuses unchanged idle sizes and measures new, changed, or active worktrees. Done sessions are excluded from disk scans; their cleanup status can still be refreshed. Automatic storage hint checks use the same saved sizes and are limited to once an hour through existing triggers, without a recurring timer."),
			localize('sessionWorktreeCleanupHelp.storageStates', "Disk usage shows an estimate, Measuring, Not measured, or Measurement failed. Done sessions and worktrees without a listed session are intentionally not measured. Mixed selections report known storage and the number of unmeasured worktrees, not a complete estimate. Disk usage is not guaranteed freed space."),
			localize('sessionWorktreeCleanupHelp.inventory', "One table lists available, pending, and protected worktrees. Each row has a title or branch, checkout path, workspace, last session activity, disk usage, status, and actions. Worktrees without a listed session have no session activity date. Use Show to filter to Needs attention. Select All includes every matching selectable worktree, including off-screen rows. Active sessions and sessions waiting for input must be selected manually."),
			localize('sessionWorktreeCleanupHelp.sorting', "Use Sort by to order each table by Size, largest first, or Session Recency, newest first. Worktrees without a known size or session date sort last. Sorting preserves your checkbox choices and does not rescan storage."),
			localize('sessionWorktreeCleanupHelp.forceRemoval', "On supported hosts, failed, deferred, or in-use worktrees that are verified to exist have initially unchecked checkboxes in Needs attention. Select individual rows with Space, or use this category's Select All to select or clear all worktrees eligible for forced removal. This selection is separate from normal cleanup. Activate Force Remove Worktrees to remove the selected worktrees after one confirmation warning that all their uncommitted changes and ignored or untracked files will be permanently lost. Forced removal overrides references from other sessions or chats, which may stop working when their worktree is deleted. Canceling preserves the selection and leaves the worktrees untouched. Hosts still validate managed worktree paths and branches; normal and automatic cleanup still respect usage references."),
			localize('sessionWorktreeCleanupHelp.managedWorktrees', "Only managed agent worktrees are eligible, including agent branches created with a configured prefix. Errors and unverified removals remain visible. Worktrees without a listed session are selected by default when eligible and no age filter applies. With an age filter, their age is unavailable and they must be selected manually. Explicit checkbox choices survive updates and age-filter changes."),
			localize('sessionWorktreeCleanupHelp.inventoryNavigation', "The inventory has one vertical scroll area. Columns can be resized; headers and rows scroll horizontally together in narrow windows. Only nearby rows are rendered. Use {0} and {1} for rows, {2} and {3} for pages, and {4} and {5} for the first and last rows. Use {6} to open the focused session and Space to toggle its checkbox. Tab reaches the focused row's checkbox, session link, and actions. Row announcements include position, checkout path, activity, storage, and cleanup status.", '<keybinding:list.focusUp>', '<keybinding:list.focusDown>', '<keybinding:list.focusPageUp>', '<keybinding:list.focusPageDown>', '<keybinding:list.focusFirst>', '<keybinding:list.focusLast>', '<keybinding:list.select>'),
			localize('sessionWorktreeCleanupHelp.cleanupDiskUsage', "Activate Clean Up Worktrees to schedule removal of the selected sessions' worktrees and mark those sessions as done after confirmation. It is disabled until at least one session is selected. Its label reports the selected worktree count and, when every selected session has a size estimate, their estimated disk usage."),
			localize('sessionWorktreeCleanupHelp.batchLifecycle', "Confirmed cleanup continues when this editor closes. Reopening reconnects to queued, pending, and failed requests. Closing does not cancel accepted host removals. Pending work cannot be submitted twice, and one scheduling failure does not stop the rest of the batch. The batch summary counts all results independently of filters. Show Results reveals confirmed removals with zero disk usage, no checkbox, and usable session links; Hide Results returns to remaining worktrees."),
			localize('sessionWorktreeCleanupHelp.rowActions', "Each eligible row has a Clean Up action that affects only that row without changing other checkbox choices. Failed rows offer Retry Cleanup, Recheck, or explicitly destructive Force Remove when supported. Retry Failed Worktrees is always normal cleanup, never forced removal. Recheck refreshes inventory and verification. Status explains why protected rows cannot be cleaned up. A failed or unavailable existence check is not confirmed removal."),
			localize('sessionWorktreeCleanupHelp.collapsedSettings', "Cleanup Settings is collapsed below the inventory. Focus its heading and press Enter or Space to expand it. Changes are saved immediately. Checkboxes enable automatic completion or deletion of merged pull request sessions; adjacent inputs set retention days. Another checkbox controls storage cleanup suggestions."),
			localize('sessionWorktreeCleanupHelp.reopen', "Return to this editor any time by running Open Worktree Cleanup from the Command Palette or the Sessions More Actions menu."),
			localize('sessionWorktreeCleanupHelp.close', "Use {0} to close the Worktree Cleanup modal. Focus returns to the previous editor or control.", '<keybinding:workbench.action.closeModalEditor>'),
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
