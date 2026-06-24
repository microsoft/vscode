/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { IAccessibleViewService, AccessibleViewProviderId, AccessibleViewType, AccessibleContentProvider } from '../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplementation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { IAccessibilitySignalService, AccessibilitySignal } from '../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IListService, WorkbenchList } from '../../../../platform/list/browser/listService.js';
import { getNotificationFromContext } from './notificationsCommands.js';
import { NotificationFocusedContext } from '../../../common/contextkeys.js';
import { INotificationViewItem } from '../../../common/notifications.js';
import { withSeverityPrefix } from '../../../../platform/notification/common/notification.js';

export class NotificationAccessibleView implements IAccessibleViewImplementation {
	readonly priority = 90;
	readonly name = 'notifications';
	readonly when = NotificationFocusedContext;
	readonly type = AccessibleViewType.View;
	getProvider(accessor: ServicesAccessor) {
		const accessibleViewService = accessor.get(IAccessibleViewService);
		const listService = accessor.get(IListService);
		const commandService = accessor.get(ICommandService);
		const accessibilitySignalService = accessor.get(IAccessibilitySignalService);

		function getProvider() {
			const notification = getNotificationFromContext(listService);
			if (!notification) {
				return;
			}
			commandService.executeCommand('notifications.showList');
			let notificationIndex: number | undefined;
			const list = listService.lastFocusedList;
			if (list instanceof WorkbenchList) {
				notificationIndex = list.indexOf(notification);
			}
			if (notificationIndex === undefined) {
				return;
			}

			function focusList(): void {
				commandService.executeCommand('notifications.showList');
				if (list && notificationIndex !== undefined) {
					list.domFocus();
					try {
						list.setFocus([notificationIndex]);
					} catch { }
				}
			}

			function getContentForNotification(): string | undefined {
				const notification = getNotificationFromContext(listService);
				const message = notification?.message.original.toString();
				if (!notification || !message) {
					return;
				}
				return withSeverityPrefix(notification.source ? localize('notification.accessibleViewSrc', '{0} Source: {1}', message, notification.source) : message, notification.severity);
			}
			const content = getContentForNotification();
			if (!content) {
				return;
			}
			notification.onDidClose(() => accessibleViewService.next());
			return new AccessibleContentProvider(
				AccessibleViewProviderId.Notification,
				{ type: AccessibleViewType.View },
				() => content,
				() => focusList(),
				'accessibility.verbosity.notification',
				undefined,
				getActionsFromNotification(notification, accessibilitySignalService),
				() => {
					if (!list) {
						return;
					}
					focusList();
					list.focusNext();
					return getContentForNotification();
				},
				() => {
					if (!list) {
						return;
					}
					focusList();
					list.focusPrevious();
					return getContentForNotification();
				},
			);
		}
		return getProvider();
	}
}


function getActionsFromNotification(notification: INotificationViewItem, accessibilitySignalService: IAccessibilitySignalService): IAction[] | undefined {
	let actions = undefined;
	if (notification.actions) {
		actions = [];
		if (notification.actions.primary) {
			actions.push(...notification.actions.primary);
		}
		if (notification.actions.secondary) {
			actions.push(...notification.actions.secondary);
		}
	}
	if (actions) {
		for (const action of actions) {
			action.class = ThemeIcon.asClassName(Codicon.bell);
			const initialAction = action.run;
			action.run = () => {
				initialAction();
				notification.close();
			};
		}
	}
	const manageExtension = actions?.find(a => a.label.includes('Manage Extension'));
	if (manageExtension) {
		manageExtension.class = ThemeIcon.asClassName(Codicon.gear);
	}
	if (actions) {
		actions.push({
			id: 'clearNotification', label: localize('clearNotification', "Clear Notification"), tooltip: localize('clearNotification', "Clear Notification"), run: () => {
				notification.close();
				accessibilitySignalService.playSignal(AccessibilitySignal.clear);
			}, enabled: true, class: ThemeIcon.asClassName(Codicon.clearAll)
		});
	}
	return actions;
}

