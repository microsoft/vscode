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
import { IInboxNotificationItem, IInboxNotificationsService } from '../common/inboxNotificationsService.js';
import { getInboxNotificationKindLabel, getInboxNotificationPriorityLabel } from './inboxNotificationsLabels.js';
import { InboxNotificationsView } from './inboxNotificationsView.js';

class InboxNotificationsAccessibilityHelp implements IAccessibleViewImplementation {
	readonly type = AccessibleViewType.Help;
	readonly priority = 105;
	readonly name = 'sessions-inbox-notifications-help';
	readonly when = ContextKeyExpr.and(InboxCanvasFocusContext, ChatContextKeys.inChatSession.negate());

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider {
		const restoreFocus = createFocusRestorer(accessor.get(IAgentWorkbenchLayoutService));
		const content = [
			localize('inboxNotifications.help.overview', "You are in the Inbox canvas tab. It lists prioritized notifications across sessions. Switching sessions keeps the canvas available. Close the tab to hide it; use Show Inbox or Add Tab, Canvas, Inbox to reopen it."),
			localize('inboxNotifications.help.evidence', "The detail pane shows evidence when it is available: recorded images, artifacts, and references. Identical image content is consolidated, and image artifacts are not repeated in the artifact list. Inspect image opens the image carousel for this evidence collection. AI-written previews and Agent interpretation appear at the top of this pane, not on notification cards. Interpretation is shown directly, without a disclosure control, and may summarize relevant execution results with links to their sources. Raw terminal output remains in the terminal or chat response; exit codes do not establish correctness or coverage. Empty evidence and interpretation sections are not shown."),
			localize('inboxNotifications.help.canvases', "Extension canvases lists canvases supplied by the selected conversation's extensions. Choose one to interact with it in the detail pane. Hide canvas releases its Inbox presentation without closing the provider's canvas. Read canvas opens a plain-text accessible snapshot. Within a canvas, Tab moves through page controls; use <keybinding:workbench.action.focusNextPart> to leave the page. A canvas requiring input can be opened by asking the agent in the existing reply input."),
			localize('inboxNotifications.help.repository', "Cards include repository badges when a notification is associated with a repository."),
			localize('inboxNotifications.help.pullRequestStates', "Pull request notifications show state chips with pull request icons so you can quickly scan checks, comments, and merge readiness. Activate a pull request chip to open that pull request."),
			localize('inboxNotifications.help.navigation', "Use Up Arrow and Down Arrow to move focus between notification cards. Press Enter or Space on a card to move focus into its detail pane; additional evidence and the conversation appear there. Press Escape in the detail pane outside Chat to return focus to the selected notification card. Tab moves through section headers, actions, and inline controls throughout the notification list."),
			localize('inboxNotifications.help.chat', "For session notifications, the detail pane contains a chat input below its evidence. The Show chat response section is collapsed by default; focus its heading and press Enter or Space to show the last request and response, including updates while the response runs. It opens scrolled to the end without moving focus. It does not show the full conversation history, questions, or confirmation controls. Tab into the chat input to send a follow-up without leaving Inbox. A successfully submitted request marks the notification as done without archiving the session. The input remains open if its notification disappears. Use Open Session on the notification card to read the full conversation. Within the embedded chat input, standard Chat keyboard shortcuts and accessibility help apply; Escape retains its normal Chat behavior."),
			localize('inboxNotifications.help.newSession', "Activate New Session in the Inbox toolbar to compose a new session above the notification list. The notification list remains visible. Activating New Session again hides the input; activating it once more restores the same draft. Standard new-session workspace, agent, model, and send controls apply."),
			localize('inboxNotifications.help.tiers', "In Priority sort, notifications are grouped into collapsible tiers: Now, Next, and Later. Activate a tier header to collapse or expand that group. Resolved notifications are grouped under Completed."),
			localize('inboxNotifications.help.sorting', "Use the Priority and Recent toggle buttons to switch sorting order. Priority is the default; the pressed button is the active sort."),
			localize('inboxNotifications.help.filter', "Use the Filter button to open a checklist of categories — Now, Next, Later, and Completed — and toggle which are shown. Completed is hidden by default. Sorting by Priority or Recent still applies to whichever categories are visible."),
			localize('inboxNotifications.help.feedback', "Use the Inbox Was Useful button in the toolbar to send quick positive feedback."),
			localize('inboxNotifications.help.actions', "The notification date appears beside its session title. Open Session and Done are at the top right of the card. When input is needed, the card shows an inline question carousel or confirmation controls; answer or confirm directly in the card. Select the card to see a summary of the decision and context in the detail pane, or open the session for full context. CI and review notifications may include actions such as Fix CI Failures, Address Reviews, and Merge Pull Request when supported. Eligible session cleanup actions include a More Actions menu for configuring automatic cleanup. Use Done to clear a notification."),
			localize('inboxNotifications.help.liveUpdates', "New notifications appear automatically. While your focus is inside inline input controls, list updates pause and a banner lets you show new notifications when you are ready."),
			localize('inboxNotifications.help.toolApprovals', "Inline terminal approvals show the command and any disclaimer. Tool results and requests requiring richer confirmation controls must be reviewed using Open Session."),
			localize('inboxNotifications.help.loading', "When Inbox data is refreshing, a spinner appears in the Inbox header so you know the list is updating."),
			localize('inboxNotifications.help.done', "Mark Notification as Done clears only the notification and marks its session as read when available. It does not archive the session. Completed notifications do not offer inline input controls on their cards; use the conversation in the detail pane or open the session to respond to a question that is still pending."),
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
				buildInboxNotificationsAccessibleContent(notificationsService.notifications.get()),
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

export function buildInboxNotificationsAccessibleContent(items: readonly Pick<IInboxNotificationItem, 'kind' | 'priority' | 'title' | 'description' | 'repositoryLabel' | 'pullRequestStates' | 'needsInputPart'>[]): string {
	if (items.length === 0) {
		return localize('inboxNotifications.accessibleView.empty', "No active notifications.");
	}

	const lines: string[] = [
		localize('inboxNotifications.accessibleView.header', "Inbox notifications"),
		'',
	];
	for (const [index, item] of items.entries()) {
		lines.push(localize('inboxNotifications.accessibleView.itemTitle', "{0}. {1}", index + 1, item.title));
		lines.push(localize(
			'inboxNotifications.accessibleView.itemMeta',
			"   Priority: {0}. Type: {1}",
			getInboxNotificationPriorityLabel(item.priority),
			getInboxNotificationKindLabel(item.kind),
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
