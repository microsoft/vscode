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
			localize('inboxNotifications.help.navigation', "Use Up Arrow and Down Arrow to move focus between notification cards. Tab moves through actions for the focused notification."),
			localize('inboxNotifications.help.actions', "Use Open Session to navigate to the session. CI and review notifications may include actions such as Fix CI Failures, Address Reviews, and Merge Pull Request. Use Dismiss to remove a notification from the list."),
			localize('inboxNotifications.help.markRead', "Completed session notifications include Mark as Read to clear unread state without opening."),
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

export function buildInboxNotificationsAccessibleContent(items: readonly Pick<IInboxNotificationItem, 'kind' | 'priority' | 'title' | 'description'>[]): string {
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
		lines.push(localize('inboxNotifications.accessibleView.itemDescription', "   {0}", item.description));
	}
	return lines.join('\n');
}

AccessibleViewRegistry.register(new InboxNotificationsAccessibilityHelp());
AccessibleViewRegistry.register(new InboxNotificationsAccessibleView());
