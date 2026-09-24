/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveElement, isHTMLElement } from '../../../../base/browser/dom.js';
import { localize } from '../../../../nls.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplementation, AccessibleViewRegistry } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { AccessibilityVerbositySettingId } from '../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import { Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
import { IAgentWorkbenchLayoutService } from '../../../browser/workbench.js';
import { InboxCustomViewFocusContext } from '../../../common/contextkeys.js';
import { IInboxNotificationItem, IInboxNotificationsService } from '../common/inboxNotificationsService.js';
import { getInboxNotificationKindLabel, getInboxNotificationPriorityLabel } from './inboxNotificationsLabels.js';

class InboxNotificationsAccessibilityHelp implements IAccessibleViewImplementation {
	readonly type = AccessibleViewType.Help;
	readonly priority = 105;
	readonly name = 'sessions-inbox-notifications-help';
	readonly when = InboxCustomViewFocusContext;

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider {
		const restoreFocus = createFocusRestorer(accessor.get(IAgentWorkbenchLayoutService));
		const content = [
			localize('inboxNotifications.help.overview', "You are in the Inbox view. It lists prioritized notifications that need attention."),
			localize('inboxNotifications.help.repository', "Cards include repository badges when a notification is associated with a repository."),
			localize('inboxNotifications.help.pullRequestStates', "Pull request notifications show state chips with pull request icons so you can quickly scan checks, comments, and merge readiness. Activate a pull request chip to open that pull request."),
			localize('inboxNotifications.help.navigation', "Use Up Arrow and Down Arrow to move focus between notification cards. Press Enter or Space on a card to move focus into its detail pane; details, including a generated summary and the conversation, appear there. Press Escape in the detail pane to return focus to the selected notification card. Tab moves through the actions and inline controls for the focused notification."),
			localize('inboxNotifications.help.tiers', "In Priority sort, notifications are grouped into collapsible tiers: Now, Next, and Later. Activate a tier header to collapse or expand that group. Resolved notifications are grouped under Completed."),
			localize('inboxNotifications.help.sorting', "Use the Priority and Recent toggle buttons to switch sorting order. Priority is the default; the pressed button is the active sort."),
			localize('inboxNotifications.help.showCompleted', "Use the Completed filter button to show or hide notifications you have already resolved. While Completed is active, Priority and Recent are disabled until you turn Completed off."),
			localize('inboxNotifications.help.feedback', "Use the Inbox Was Useful button in the toolbar to send quick positive feedback."),
			localize('inboxNotifications.help.actions', "When input is needed, the card shows an inline question carousel or confirmation controls; answer or confirm directly in the card. Select the card to see a summary of the decision and context in the detail pane, or open the session for full context. CI and review notifications may include actions such as Fix CI Failures, Address Reviews, and Merge Pull Request. Some actions include a More Actions menu where you can set that action to run by default. Use Done to clear a notification."),
			localize('inboxNotifications.help.liveUpdates', "New notifications appear automatically. While your focus is inside inline input controls, list updates pause and a banner lets you show new notifications when you are ready."),
			localize('inboxNotifications.help.loading', "When Inbox data is refreshing, a spinner appears in the Inbox header so you know the list is updating."),
			localize('inboxNotifications.help.done', "Done clears a notification and marks its session as read when available."),
			localize('inboxNotifications.help.accessibleView', "Use Open Accessible View to read the full notification list as plain text."),
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
	readonly when = InboxCustomViewFocusContext;

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider {
		const notificationsService = accessor.get(IInboxNotificationsService);
		const restoreFocus = createFocusRestorer(accessor.get(IAgentWorkbenchLayoutService));
		return new AccessibleContentProvider(
			AccessibleViewProviderId.InboxNotifications,
			{ type: AccessibleViewType.View },
			() => buildInboxNotificationsAccessibleContent(notificationsService.notifications.get()),
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
			layoutService.focusPart(Parts.CUSTOM_VIEW_GRID_PART);
		}
	};
}

export function buildInboxNotificationsAccessibleContent(items: readonly Pick<IInboxNotificationItem, 'kind' | 'priority' | 'title' | 'description' | 'repositoryLabel' | 'pullRequestStates'>[]): string {
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
	}
	return lines.join('\n');
}

AccessibleViewRegistry.register(new InboxNotificationsAccessibilityHelp());
AccessibleViewRegistry.register(new InboxNotificationsAccessibleView());
