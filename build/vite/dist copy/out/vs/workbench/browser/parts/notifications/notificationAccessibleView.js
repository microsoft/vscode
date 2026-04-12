/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { IAccessibleViewService, AccessibleContentProvider } from '../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibilitySignalService, AccessibilitySignal } from '../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IListService, WorkbenchList } from '../../../../platform/list/browser/listService.js';
import { getNotificationFromContext } from './notificationsCommands.js';
import { NotificationFocusedContext } from '../../../common/contextkeys.js';
import { withSeverityPrefix } from '../../../../platform/notification/common/notification.js';
export class NotificationAccessibleView {
    constructor() {
        this.priority = 90;
        this.name = 'notifications';
        this.when = NotificationFocusedContext;
        this.type = "view" /* AccessibleViewType.View */;
    }
    getProvider(accessor) {
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
            let notificationIndex;
            const list = listService.lastFocusedList;
            if (list instanceof WorkbenchList) {
                notificationIndex = list.indexOf(notification);
            }
            if (notificationIndex === undefined) {
                return;
            }
            function focusList() {
                commandService.executeCommand('notifications.showList');
                if (list && notificationIndex !== undefined) {
                    list.domFocus();
                    try {
                        list.setFocus([notificationIndex]);
                    }
                    catch { }
                }
            }
            function getContentForNotification() {
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
            return new AccessibleContentProvider("notification" /* AccessibleViewProviderId.Notification */, { type: "view" /* AccessibleViewType.View */ }, () => content, () => focusList(), 'accessibility.verbosity.notification', undefined, getActionsFromNotification(notification, accessibilitySignalService), () => {
                if (!list) {
                    return;
                }
                focusList();
                list.focusNext();
                return getContentForNotification();
            }, () => {
                if (!list) {
                    return;
                }
                focusList();
                list.focusPrevious();
                return getContentForNotification();
            });
        }
        return getProvider();
    }
}
function getActionsFromNotification(notification, accessibilitySignalService) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90aWZpY2F0aW9uQWNjZXNzaWJsZVZpZXcuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYnJvd3Nlci9wYXJ0cy9ub3RpZmljYXRpb25zL25vdGlmaWNhdGlvbkFjY2Vzc2libGVWaWV3LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDakUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxzQkFBc0IsRUFBZ0QseUJBQXlCLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUUvSyxPQUFPLEVBQUUsMkJBQTJCLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxnRkFBZ0YsQ0FBQztBQUNsSixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFFbkYsT0FBTyxFQUFFLFlBQVksRUFBRSxhQUFhLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUMvRixPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUN4RSxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUU1RSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUU5RixNQUFNLE9BQU8sMEJBQTBCO0lBQXZDO1FBQ1UsYUFBUSxHQUFHLEVBQUUsQ0FBQztRQUNkLFNBQUksR0FBRyxlQUFlLENBQUM7UUFDdkIsU0FBSSxHQUFHLDBCQUEwQixDQUFDO1FBQ2xDLFNBQUksd0NBQTJCO0lBeUV6QyxDQUFDO0lBeEVBLFdBQVcsQ0FBQyxRQUEwQjtRQUNyQyxNQUFNLHFCQUFxQixHQUFHLFFBQVEsQ0FBQyxHQUFH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