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
			localize('inboxNotifications.help.overview', "You are in the Inbox canvas tab. Each row combines a session's notifications. Its icon identifies the event, such as a question, approval, CI result, review comment, merge, or completion. In narrow lists, the duplicate visible event label is omitted to leave more room for titles; hover the icon to read the event label. Screen readers include the event in the row label. A generated title describes the current action or latest completed work, with the work or session title below it. A Visual indicator means image evidence is available. The timestamp is at the far right. Switching sessions keeps this canvas available."),
			localize('inboxNotifications.help.evidence', "Selecting a row opens evidence to the side without marking the session as read. Marking a session as Done, answering a question, or handling a confirmation marks only the associated conversation as read, unless newer activity has arrived. Questions and confirmation controls appear only in evidence. Recorded images, artifacts, references, and pull request states remain inspectable. When available, agent interpretation appears before notification details, including questions and confirmations. It is a generated summary, not proof of correctness. Inspect image opens the image carousel."),
			localize('inboxNotifications.help.canvases', "Extension canvases lists only canvases already opened in the selected conversation, not available extension suggestions. Choose one to interact with it in the detail pane. Hide canvas releases its Inbox presentation without closing the provider's canvas. Read canvas opens a plain-text accessible snapshot. Within a canvas, Tab moves through page controls; use <keybinding:workbench.action.focusNextPart> to leave the page."),
			localize('inboxNotifications.help.repository', "Repository and pull request details are available in evidence rather than on the session row."),
			localize('inboxNotifications.help.pullRequestStates', "Pull request notifications show links with pull request icons so you can quickly scan checks, comments, and merge readiness. Multiple pull requests appear in a list. When there are more than three, activate the pull request count to expand or collapse the list. Tab through the links and activate one to open that pull request."),
			localize('inboxNotifications.help.navigation', "Use Left and Right Arrow, Home, and End in the tab list. At narrow widths, the tabs scroll horizontally and the focused tab is brought into view. Use Up and Down Arrow between session rows. Enter or Space selects a row and focuses evidence. Tab reaches row actions, evidence controls, and the composer. Escape outside an input closes evidence and returns focus to the row, or to the new-session composer if the row is filtered out."),
			localize('inboxNotifications.help.history', "Go Back{0} and Go Forward{1} navigate between Inbox, sessions, and other visited views without resetting your Inbox selection, filters, or drafts.", '<keybinding:sessions.goBack>', '<keybinding:sessions.goForward>'),
			localize('inboxNotifications.help.chat', "The reply composer sits below the selected evidence, outside its scrolling area. Its label identifies the selected conversation. Working sessions show their latest response live in evidence; Show chat response expands and reveals other responses. More agent context expands supporting interpretation without hiding approval inputs. Standard Chat shortcuts and accessibility help apply inside the composer. Escape there retains its normal Chat behavior."),
			localize('inboxNotifications.help.newSession', "While Inbox is active, the sidebar New Session button and the New Session command or keybinding open and focus the bottom new-session composer. Deselecting a row or closing evidence also returns the composer to new-session mode. Paste images into the focused composer or drag files and images onto it to attach them. Drafts are preserved when changing targets. Sending from this composer starts a new session in the background without leaving Inbox. Selecting an existing session opens it outside Inbox."),
			localize('inboxNotifications.help.tabs', "Ready for you contains outstanding asks and completed work until you explicitly mark it as Done. Selecting completed work shows its generated response summary without moving it to Done. Reading the full session does not move it to Done either. Working contains active sessions without outstanding asks. Ready to merge requires passing CI on an open, non-draft pull request. On hold contains sessions you explicitly held until you resume them, even across reloads. Done contains explicitly completed, archived, or merged sessions. Tab counts count combined session rows. The Inbox badge counts Ready for you rows, independent of search and filters."),
			localize('inboxNotifications.help.sorting', "Use the Priority and Recent toggle buttons to switch sorting order. Priority is the default; the pressed button is the active sort."),
			localize('inboxNotifications.help.filter', "Search and the priority filter apply within the selected tab without changing its count."),
			localize('inboxNotifications.help.feedback', "Use Send Positive Feedback at the top right, alongside the search, sorting, and filter controls, to send quick positive feedback. The button confirms when feedback is sent."),
			localize('inboxNotifications.help.actions', "Supported CI, review, and merge actions appear directly on each session row and in the evidence header before Open Session. When CI failures and review comments both need attention, Fix CI & Address Reviews sends one request to handle both. Tab to these buttons and press Enter or Space to run an action without opening evidence. Hold or Resume and Mark Session as Done replace the timestamp when hovering or focusing a row. These actions are keyboard accessible. Hold changes Inbox organization; it does not stop the agent. Mark Session as Done is also available in the evidence header and moves the selected session to Done without archiving it. Evidence offers cleanup actions."),
			localize('inboxNotifications.help.completion', "Opening the full session dismisses its completion notification, but does not answer questions, approve requests, or dismiss CI and review issues. Failed or canceled actions remain pending. If an action moves your selected session to another tab, evidence closes and the composer returns to New Session. A completed background action never clears a newer selection."),
			localize('inboxNotifications.help.liveUpdates', "While evidence is selected or focus is in the list, passive updates preserve the reading order and selected conversation. Titles and current approval state update without a refresh notice. Agent interpretation refreshes when a response in the selected conversation completes, without changing your reply draft. If new sessions arrive outside the current reading list, Show Inbox Updates reveals them. Changing tabs, search, or sorting applies those choices immediately. Passive workflow changes do not close selected evidence; explicit Hold and Done actions do."),
			localize('inboxNotifications.help.toolApprovals', "Approvals in evidence use the same cards as chat and show the terminal command or read-only tool input and any disclaimer. Use the approval or skip buttons to respond; additional approval scopes are in the adjacent dropdown. When available, Explain opens a side chat without approving the command. Tool results and requests requiring editable inputs or richer confirmation controls must be reviewed using Open Session."),
			localize('inboxNotifications.help.planReviews', "Plan reviews in evidence use the same card as chat. Read the plan summary, use Open Full Plan to inspect the file, and choose an implementation option or Reject without opening the session. Tab reaches the review controls and the implementation dropdown. Feedback is available when supported by the request."),
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
				InboxNotificationsView.getActiveInstance()?.getEmptyAccessibleContent() ?? buildInboxNotificationsAccessibleContent(notificationsService.sessionRows.get().map(row => ({
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
		if (item.needsInputPart?.kind === 'planReview') {
			const part = item.needsInputPart;
			lines.push(part.title, renderAsPlaintext({ value: part.content }));
			lines.push(localize('inboxNotifications.accessibleView.planActions', "Plan actions: {0}, Reject", part.actions.map(action => action.label).join(', ')));
			if (part.planUri) {
				lines.push(localize('inboxNotifications.accessibleView.openPlan', "Open Full Plan"));
			}
		}
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
