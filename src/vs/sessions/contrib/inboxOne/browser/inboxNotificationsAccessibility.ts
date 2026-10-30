/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveElement, isHTMLElement } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { renderAsPlaintext } from '../../../../base/browser/markdownRenderer.js';
import { localize } from '../../../../nls.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplementation, AccessibleViewRegistry } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { AccessibilityVerbositySettingId } from '../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
import { IAgentWorkbenchLayoutService } from '../../../browser/workbench.js';
import { InboxCanvasFocusContext } from '../../../common/contextkeys.js';
import { IInboxNotificationItem, IInboxNotificationsService, IInboxSessionRow } from '../common/inboxNotificationsService.js';
import { getInboxNotificationLabel, getInboxNotificationPriorityLabel, getInboxTabLabel } from './inboxNotificationsLabels.js';
import { InboxNotificationsView } from './inboxNotificationsView.js';

class InboxNotificationsAccessibilityHelp implements IAccessibleViewImplementation {
	readonly type = AccessibleViewType.Help;
	readonly priority = 105;
	readonly name = 'sessions-inbox-notifications-help';
	readonly when = ContextKeyExpr.and(InboxCanvasFocusContext, ChatContextKeys.inChatSession.negate());

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider {
		const restoreFocus = createFocusRestorer(accessor.get(IAgentWorkbenchLayoutService));
		const content = [
			localize('inboxNotifications.help.overview', "You are in the Inbox canvas tab. Each row combines a session's notifications. Its icon identifies the event, such as a question, approval, CI result, review comment, merge, or completion. Its primary title suggests an action; the session title appears below it. A Visual indicator means image evidence is available. The timestamp is at the far right. Switching sessions keeps this canvas available."),
			localize('inboxNotifications.help.evidence', "Selecting a row opens evidence to the side without marking the session as read. Questions and confirmation controls appear only in evidence. Recorded images, artifacts, references, and pull request states remain inspectable. Agent interpretation is a generated summary, not proof of correctness. Inspect image opens the image carousel."),
			localize('inboxNotifications.help.canvases', "Extension canvases lists only canvases already opened in the selected conversation, not available extension suggestions. Choose one to interact with it in the detail pane. Hide canvas releases its Inbox presentation without closing the provider's canvas. Read canvas opens a plain-text accessible snapshot. Within a canvas, Tab moves through page controls; use <keybinding:workbench.action.focusNextPart> to leave the page."),
			localize('inboxNotifications.help.repository', "Cards include repository badges when a notification is associated with a repository."),
			localize('inboxNotifications.help.pullRequestStates', "Pull request notifications show links with pull request icons so you can quickly scan checks, comments, and merge readiness. Multiple pull requests appear in a list. When there are more than three, activate the pull request count to expand or collapse the list. Tab through the links and activate one to open that pull request."),
			localize('inboxNotifications.help.navigation', "Use Left and Right Arrow, Home, and End in the tab list. Use Up and Down Arrow between session rows. Enter or Space selects a row and focuses evidence. Tab reaches row actions, evidence controls, and the composer. Escape outside an input closes evidence and returns focus to the row, or to the new-session composer if the row is filtered out."),
			localize('inboxNotifications.help.chat', "One composer stays at the bottom, outside evidence. Its label identifies the selected conversation. Working sessions show their latest response live in evidence. Standard Chat shortcuts and accessibility help apply inside the composer. Escape there retains its normal Chat behavior."),
			localize('inboxNotifications.help.newSession', "New Session, its command or keybinding, deselecting a row, and closing evidence return the bottom composer to new-session mode. Drafts are preserved when changing targets. Sending a new session starts it in the background without leaving Inbox."),
			localize('inboxNotifications.help.tabs', "Ready for you contains outstanding asks and unread completed work. Working contains active sessions without outstanding asks. Ready to merge requires passing CI on an open, non-draft pull request. On hold contains sessions you explicitly held until you resume them, even across reloads. Done contains explicitly completed, archived, merged, or read completed sessions. Tab counts count combined session rows."),
			localize('inboxNotifications.help.sorting', "Use the Priority and Recent toggle buttons to switch sorting order. Priority is the default; the pressed button is the active sort."),
			localize('inboxNotifications.help.filter', "Search and the priority filter apply within the selected tab without changing its count."),
			localize('inboxNotifications.help.feedback', "Use the Inbox Was Useful button in the toolbar to send quick positive feedback."),
			localize('inboxNotifications.help.actions', "Hold or Resume and Mark Session as Done replace the timestamp when hovering or focusing a row. These actions are keyboard accessible. Hold changes Inbox organization; it does not stop the agent. Mark Session as Done is also available in the evidence header and moves the selected session to Done without archiving it. Evidence offers supported CI, review, merge, and cleanup actions."),
			localize('inboxNotifications.help.completion', "Opening the full session dismisses its completion notification, but does not answer questions, approve requests, or dismiss CI and review issues. Failed or canceled actions remain pending. If an action moves your selected session to another tab, evidence closes and the composer returns to New Session. A completed background action never clears a newer selection."),
			localize('inboxNotifications.help.liveUpdates', "New notifications appear automatically. While your focus is inside inline input controls, list updates pause and a banner lets you show new notifications when you are ready."),
			localize('inboxNotifications.help.toolApprovals', "Approvals in evidence use the same cards as chat and show the terminal command or read-only tool input and any disclaimer. Use the approval or skip buttons to respond; additional approval scopes are in the adjacent dropdown. When available, Explain opens a side chat without approving the command. Tool results and requests requiring editable inputs or richer confirmation controls must be reviewed using Open Session."),
			localize('inboxNotifications.help.loading', "When Inbox data is refreshing, a spinner appears in the Inbox header so you know the list is updating."),
			localize('inboxNotifications.help.done', "New work can return a Done session to an active tab. On hold persists until you explicitly resume it."),
			localize('inboxNotifications.help.accessibleView', "Use Open Accessible View to read the notification list and the selected notification's evidence as plain text. When focus is inside an extension canvas, Accessible View reads that canvas instead."),
		].join('\n');
		return new AccessibleContentProvider(
			AccessibleViewProviderId.InboxNotifications,
			{ type: AccessibleViewType.Help },
			() => content,
			restoreFocus,
			AccessibilityVerbositySettingId.InboxNotifications,
		);
	}
}

class InboxNotificationsAccessibleView implements IAccessibleViewImplementation {
	readonly type = AccessibleViewType.View;
	readonly priority = 105;
	readonly name = 'sessions-inbox-notifications-view';
	readonly when = ContextKeyExpr.and(InboxCanvasFocusContext, ChatContextKeys.inChatSession.negate());

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider {
		const notificationsService = accessor.get(IInboxNotificationsService);
		const canvasProvider = InboxNotificationsView.getActiveInstance()?.getCanvasAccessibleProvider();
		if (canvasProvider) {
			return canvasProvider;
		}
		const restoreFocus = createFocusRestorer(accessor.get(IAgentWorkbenchLayoutService));
		return new AccessibleContentProvider(
			AccessibleViewProviderId.InboxNotifications,
			{ type: AccessibleViewType.View },
			() => [
				buildInboxNotificationsAccessibleContent(notificationsService.sessionRows.get().map(row => ({
					...row, title: row.previewSignature ? notificationsService.previews.get().get(row.previewSignature) ?? row.title : row.title,
				}))),
				InboxNotificationsView.getActiveInstance()?.getDetailAccessibleContent(),
			].filter(Boolean).join('\n\n'),
			restoreFocus,
			AccessibilityVerbositySettingId.InboxNotifications,
		);
	}
}

function createFocusRestorer(layoutService: IAgentWorkbenchLayoutService): () => void {
	const focusedElement = getActiveElement();
	return () => {
		if (isHTMLElement(focusedElement) && focusedElement.isConnected) {
			focusedElement.focus();
		} else {
			layoutService.focusPart(Parts.EDITOR_PART, mainWindow);
		}
	};
}

export function buildInboxNotificationsAccessibleContent(items: readonly (Pick<IInboxNotificationItem, 'kind' | 'priority' | 'title' | 'description' | 'repositoryLabel' | 'pullRequestStates' | 'needsInputPart'> & Partial<Pick<IInboxSessionRow, 'tab' | 'sessionTitle' | 'hasImages' | 'timestamp' | 'notifications'>>)[]): string {
	if (items.length === 0) {
		return localize('inboxNotifications.accessibleView.empty', "No active notifications.");
	}

	const lines: string[] = [
		localize('inboxNotifications.accessibleView.header', "Inbox notifications"),
		'',
	];
	for (const [index, item] of items.entries()) {
		lines.push(localize('inboxNotifications.accessibleView.itemTitle', "{0}. {1}", index + 1, item.title));
		if (item.sessionTitle && item.tab) {
			lines.push(localize('inbox.accessible.session', "Session: {0}. Tab: {1}.", item.sessionTitle, getInboxTabLabel(item.tab)));
		}
		if (item.hasImages) {
			lines.push(localize('inbox.accessible.visual', "Visual evidence available."));
		}
		if (item.timestamp !== undefined) {
			lines.push(new Date(item.timestamp).toLocaleString());
		}
		lines.push(localize(
			'inboxNotifications.accessibleView.itemMeta',
			"   Priority: {0}. Type: {1}",
			getInboxNotificationPriorityLabel(item.priority),
			getInboxNotificationLabel(item),
		));
		if (item.repositoryLabel) {
			lines.push(localize('inboxNotifications.accessibleView.itemRepository', "   Repository: {0}", item.repositoryLabel));
		}
		if (item.pullRequestStates?.length) {
			lines.push(localize(
				'inboxNotifications.accessibleView.itemPullRequestStates',
				"   Pull request states: {0}",
				item.pullRequestStates.map(state => `${state.label} (${state.statusLabel})`).join(', '),
			));
		}
		lines.push(localize('inboxNotifications.accessibleView.itemDescription', "   {0}", item.description));
		if (item.needsInputPart?.kind === 'toolConfirmation') {
			const part = item.needsInputPart;
			for (const text of [part.originMessage, part.title, part.message, part.commandLine, part.disclaimer]) {
				if (text) {
					lines.push(typeof text === 'string' ? text : renderAsPlaintext(text));
				}
			}
			if (!part.buttons.length) {
				lines.push(localize('inboxNotifications.accessibleView.reviewInSession', "Open the session to review the full request and respond."));
			}
		}
	}
	return lines.join('\n');
}

AccessibleViewRegistry.register(new InboxNotificationsAccessibilityHelp());
AccessibleViewRegistry.register(new InboxNotificationsAccessibleView());
