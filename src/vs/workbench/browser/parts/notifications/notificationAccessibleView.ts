/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction, toAction } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IAccessibleViewService, AccessibleViewProviderId, AccessibleViewType, AccessibleContentProvider } from '../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplementation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { IAccessibilitySignalService, AccessibilitySignal } from '../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IListService, WorkbenchList } from '../../../../platform/list/browser/listService.js';
import { getNotificationFromContext } from './notificationsCommands.js';
import { NotificationFocusedContext } from '../../../common/contextkeys.js';
import { INotificationViewItem, NotificationViewItemContentChangeKind } from '../../../common/notifications.js';
import { withSeverityPrefix } from '../../../../platform/notification/common/notification.js';
import { NotificationText } from '../../../../platform/notification/common/notificationMessage.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';

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
		const openerService = accessor.get(IOpenerService);

		function getProvider() {
			const initialNotification = getNotificationFromContext(listService);
			if (!initialNotification) {
				return;
			}
			let notification = initialNotification;
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

			function getContentForNotification(): string {
				const message = notification.message.original.toString();
				return withSeverityPrefix(notification.source ? localize('notification.accessibleViewSrc', '{0} Source: {1}', message, notification.source) : message, notification.severity);
			}
			let content = getContentForNotification();
			if (!content) {
				return;
			}
			const resources = new DisposableStore();
			const onDidChangeContent = resources.add(new Emitter<void>());
			let notificationListeners: DisposableStore | undefined;

			function updateContent(): void {
				content = getContentForNotification();
				provider.actions = getActionsFromNotification(notification, accessibilitySignalService, openerService);
			}

			function listenToNotification(): void {
				if (!notificationListeners || notificationListeners.isDisposed) {
					return;
				}
				notificationListeners.clear();
				notificationListeners.add(Event.once(notification.onDidClose)(() => accessibleViewService.next()));
				notificationListeners.add(notification.onDidChangeContent(event => {
					if (event.kind === NotificationViewItemContentChangeKind.MESSAGE || event.kind === NotificationViewItemContentChangeKind.ACTIONS || event.kind === NotificationViewItemContentChangeKind.SEVERITY) {
						updateContent();
						onDidChangeContent.fire();
					}
				}));
			}

			function updateNotification(): string | undefined {
				const focusedNotification = getNotificationFromContext(listService);
				if (!focusedNotification) {
					return;
				}
				notification = focusedNotification;
				if (list instanceof WorkbenchList) {
					notificationIndex = list.indexOf(notification);
				}
				updateContent();
				listenToNotification();
				return content;
			}

			const provider = new AccessibleContentProvider(
				AccessibleViewProviderId.Notification,
				{ type: AccessibleViewType.View },
				() => content,
				() => focusList(),
				'accessibility.verbosity.notification',
				() => {
					notificationListeners?.dispose();
					notificationListeners = new DisposableStore();
					updateContent();
					listenToNotification();
					return notificationListeners;
				},
				getActionsFromNotification(notification, accessibilitySignalService, openerService),
				() => {
					if (!list) {
						return;
					}
					focusList();
					list.focusNext();
					return updateNotification();
				},
				() => {
					if (!list) {
						return;
					}
					focusList();
					list.focusPrevious();
					return updateNotification();
				},
				onDidChangeContent.event,
			);
			provider.onDispose = () => {
				notificationListeners?.dispose();
				resources.dispose();
			};
			return provider;
		}
		return getProvider();
	}
}


function getActionsFromNotification(notification: INotificationViewItem, accessibilitySignalService: IAccessibilitySignalService, openerService: IOpenerService): IAction[] {
	const actions = [...notification.actions?.primary ?? [], ...notification.actions?.secondary ?? []].map(action => toAction({
		id: action.id,
		label: action.label,
		tooltip: action.tooltip,
		enabled: action.enabled,
		checked: action.checked,
		class: ThemeIcon.asClassName(Codicon.bell),
		run: () => {
			const result = action.run();
			notification.close();
			return result;
		},
	}));
	const manageExtension = actions.find(a => a.label.includes('Manage Extension'));
	if (manageExtension) {
		manageExtension.class = ThemeIcon.asClassName(Codicon.gear);
	}
	const nodes = notification.message.original instanceof NotificationText ? notification.message.original.nodes : notification.message.linkedText.nodes;
	for (const [index, node] of nodes.entries()) {
		if (typeof node !== 'string') {
			actions.push(toAction({
				id: `notification.link.${index}`,
				label: node.label,
				tooltip: node.title || node.href,
				class: ThemeIcon.asClassName(Codicon.link),
				run: () => openerService.open(URI.parse(node.href), { allowCommands: true }),
			}));
		}
	}
	actions.push({
		id: 'clearNotification', label: localize('clearNotification', "Clear Notification"), tooltip: localize('clearNotification', "Clear Notification"), run: () => {
			notification.close();
			accessibilitySignalService.playSignal(AccessibilitySignal.clear);
		}, enabled: true, class: ThemeIcon.asClassName(Codicon.clearAll)
	});
	return actions;
}
