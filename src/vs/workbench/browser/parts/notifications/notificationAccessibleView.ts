/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction } from 'vs/base/common/actions';
import { Codicon } from 'vs/base/common/codicons';
import { ThemeIcon } from 'vs/base/common/themables';
import { localize } from 'vs/nls';
import { IAccessibleViewService, AccessibleViewProviderId, AccessibleViewType } from 'vs/platform/accessibility/browser/accessibleView';
import { IAccessibleViewImplentation, alertAccessibleViewFocusChange } from 'vs/platform/accessibility/browser/accessibleViewRegistry';
import { IAccessibilitySignalService, AccessibilitySignal } from 'vs/platform/accessibilitySignal/browser/accessibilitySignalService';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IListService, WorkbenchList } from 'vs/platform/list/browser/listService';
import { getNotificationFromContext } from 'vs/workbench/browser/parts/notifications/notificationsCommands';
import { NotificationFocusedContext } from 'vs/workbench/common/contextkeys';
import { INotificationViewItem } from 'vs/workbench/common/notifications';

export class NotificationAccessibleView implements IAccessibleViewImplentation {
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
			let length: number | undefined;
			const list = listService.lastFocusedList;
			if (list instanceof WorkbenchList) {
				notificationIndex = list.indexOf(notification);
				length = list.length;
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
			const message = notification.message.original.toString();
			if (!message) {
				return;
			}
			notification.onDidClose(() => accessibleViewService.next());
			return {
				id: AccessibleViewProviderId.Notification,
				provideContent: () => {
					return notification.source ? localize('notification.accessibleViewSrc', '{0} Source: {1}', message, notification.source) : localize('notification.accessibleView', '{0}', message);
				},
				onClose(): void {
					focusList();
				},
				next(): void {
					if (!list) {
						return;
					}
					focusList();
					list.focusNext();
					alertAccessibleViewFocusChange(notificationIndex, length, 'next');
					getProvider();
				},
				previous(): void {
					if (!list) {
						return;
					}
					focusList();
					list.focusPrevious();
					alertAccessibleViewFocusChange(notificationIndex, length, 'previous');
					getProvider();
				},
				verbositySettingKey: 'accessibility.verbosity.notification',
				options: { type: AccessibleViewType.View },
				actions: getActionsFromNotification(notification, accessibilitySignalService)
			};
		}
		return getProvider();
	}
	dispose() { }
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

