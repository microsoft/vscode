/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { getActiveElement, isHTMLElement } from '../../../../base/browser/dom.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { localize } from '../../../../nls.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplementation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { AccessibilityVerbositySettingId } from '../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import { FocusedViewContext } from '../../../../workbench/common/contextkeys.js';
import { IAgentWorkbenchLayoutService } from '../../../browser/workbench.js';
import { CHANGES_VIEW_ID, CreatePullRequestFocusedContext } from '../common/changes.js';
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
	readonly when = ContextKeyExpr.or(FocusedViewContext.isEqualTo(CHANGES_VIEW_ID), CreatePullRequestFocusedContext);

	getProvider(accessor: ServicesAccessor) {
		const focusedElement = getActiveElement();
		if (isHTMLElement(focusedElement) && focusedElement.closest('.create-pull-request-widget')) {
			return new AccessibleContentProvider(
				AccessibleViewProviderId.SessionsChanges,
				{ type: AccessibleViewType.Help },
				() => [
					localize('sessionsChanges.createPR.overview', "You are in the Create Pull Request form. Title and description are generated in the background. Each field shows a loading indicator and reports a busy state until generation finishes. You may start editing immediately; generated text never replaces your edits."),
					localize('sessionsChanges.createPR.branches', "The header identifies the repository, followed by the base branch on the left and source branch on the right. The arrow points toward the base branch that will receive the changes."),
					localize('sessionsChanges.createPR.navigation', "Use Tab and Shift+Tab to move between fields and buttons. Use arrow keys to choose a merge option and Space to toggle Create as Draft."),
					localize('sessionsChanges.createPR.draft', "Create as Draft keeps the pull request in draft until it is ready for review."),
					localize('sessionsChanges.createPR.merge', "Merge Manually leaves merging to you. Selecting Agent Merge reveals checkboxes for addressing reviews, fixing CI failures, and resolving conflicts or behind branches. Merge Pull Request lets you turn merging off, merge only if Agent Merge made no changes, or merge when ready. Session settings are changed only on submission, not when opening or cancelling the form. Auto-Merge asks GitHub to merge when requirements pass and lets you choose an allowed merge method. GitHub auto-merge is not available for drafts."),
					localize('sessionsChanges.createPR.preferences', "Draft, merge options, and the last-used submission action are remembered across sessions in this profile, even if you cancel. Title, description, repository, and branches are not remembered. Unavailable options are not applied, but your preferences are kept for repositories and hosts that support them."),
					localize('sessionsChanges.createPR.agentMergeHints', "Each Agent Merge checkbox has a description explaining what it does and when it acts. Focus a checkbox to hear its description, or hover over the info icon after its label to read it. Press Space to toggle it."),
					localize('sessionsChanges.createPR.submit', "Create PR commits and pushes your changes and creates the pull request directly. When available, Tab to Pull Request Actions and press Enter or Space to open the dropdown. Choose Send Create PR Message to send the form details and options to this session's chat instead. The last-used action becomes the primary button. Control+Enter on Windows and Linux, or Command+Enter on macOS, runs that primary action. Press Escape to dismiss the dropdown, or Escape in the form or Cancel to close without submitting."),
				].join('\n'),
				() => focusedElement.focus(),
				AccessibilityVerbositySettingId.SessionsChanges,
			);
		}
		const viewsService = accessor.get(IViewsService);
		const layoutService = accessor.get(IAgentWorkbenchLayoutService);

		const content: string[] = [];
		content.push(localize('sessionsChanges.overview', "You are in the Changes view. It shows the files changed by the current session as a tree, followed by a collapsible Checks section."));
		content.push(localize('sessionsChanges.tree', "Use the up and down arrow keys to move between changed files, and the left and right arrow keys to collapse or expand folders. Press Enter to open the selected file's diff."));
		content.push(localize('sessionsChanges.checks', "The Checks section lists the continuous integration checks for the session's pull request. Its header is a button: press Enter or Space to collapse or expand it{0}.", '<keybinding:sessions.action.revealCIChecks>'));
		content.push(localize('sessionsChanges.viewMode', "The Changes view can show files as a tree or a flat list. Use the view's toolbar actions to switch between Tree and List modes."));
		content.push(localize('sessionsChanges.operations', "When available, the Changes toolbar or editor title bar also provides actions to commit, merge, sync, or create a pull request. When Agent Merge is the primary action, activate it to toggle Agent Merge and use its dropdown to configure it. Use Tab and Shift+Tab to move between the file list and toolbar actions."));
		content.push(localize('sessionsChanges.createPR', "For Agent Host sessions, Create PR opens a form with generated, editable title and description, a draft checkbox, and merge options. The form appears while generation is in progress and preserves anything you type. Use Tab to navigate and Escape to cancel."));
		content.push(layoutService.isSinglePaneLayoutEnabled
			? localize('sessionsChanges.diffView.singlePane', "Use Diff View in the editor title area's More Actions menu to select inline, side-by-side, or automatic layout. The Toggle Preferred Diff View command switches between inline and automatic layout{0}.", '<keybinding:toggle.diff.renderSideBySide>')
			: localize('sessionsChanges.diffView.classic', "Use Diff View in the editor title area's More Actions menu to select inline, side-by-side, or automatic layout. The Toggle Preferred Diff View command switches between inline and automatic layout{0}.", '<keybinding:toggle.diff.renderSideBySide>'));
		content.push(localize('sessionsChanges.editorWordWrap', "Use Word Wrap in the editor title area's More Actions menu to control word wrapping independently for code and multi-diff editors in the Agents window."));

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
