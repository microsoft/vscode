/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { KeybindingsRegistry } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeyChord } from '../../../../base/common/keyCodes.js';
import { isNotificationViewItem } from '../../../common/notifications.js';
import { Action2, MenuRegistry, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { localize, localize2 } from '../../../../nls.js';
import { IListService, WorkbenchList } from '../../../../platform/list/browser/listService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { NotificationFocusedContext, NotificationsCenterVisibleContext, NotificationsToastsVisibleContext } from '../../../common/contextkeys.js';
import { INotificationService, NotificationsFilter } from '../../../../platform/notification/common/notification.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ActionRunner } from '../../../../base/common/actions.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
// Center
export const SHOW_NOTIFICATIONS_CENTER = 'notifications.showList';
export const HIDE_NOTIFICATIONS_CENTER = 'notifications.hideList';
const TOGGLE_NOTIFICATIONS_CENTER = 'notifications.toggleList';
// Toasts
export const HIDE_NOTIFICATION_TOAST = 'notifications.hideToasts';
const FOCUS_NOTIFICATION_TOAST = 'notifications.focusToasts';
const FOCUS_NEXT_NOTIFICATION_TOAST = 'notifications.focusNextToast';
const FOCUS_PREVIOUS_NOTIFICATION_TOAST = 'notifications.focusPreviousToast';
const FOCUS_FIRST_NOTIFICATION_TOAST = 'notifications.focusFirstToast';
const FOCUS_LAST_NOTIFICATION_TOAST = 'notifications.focusLastToast';
// Notification
export const COLLAPSE_NOTIFICATION = 'notification.collapse';
export const EXPAND_NOTIFICATION = 'notification.expand';
export const ACCEPT_PRIMARY_ACTION_NOTIFICATION = 'notification.acceptPrimaryAction';
const TOGGLE_NOTIFICATION = 'notification.toggle';
export const CLEAR_NOTIFICATION = 'notification.clear';
export const CLEAR_ALL_NOTIFICATIONS = 'notifications.clearAll';
export const TOGGLE_DO_NOT_DISTURB_MODE = 'notifications.toggleDoNotDisturbMode';
export const TOGGLE_DO_NOT_DISTURB_MODE_BY_SOURCE = 'notifications.toggleDoNotDisturbModeBySource';
export function getNotificationFromContext(listService, context) {
    if (isNotificationViewItem(context)) {
        return context;
    }
    const list = listService.lastFocusedList;
    if (list instanceof WorkbenchList) {
        let element = list.getFocusedElements()[0];
        if (!isNotificationViewItem(element)) {
            if (list.isDOMFocused()) {
                // the notification list might have received focus
                // via keyboard and might not have a focused element.
                // in that case just return the first element
                // https://github.com/microsoft/vscode/issues/191705
                element = list.element(0);
            }
        }
        if (isNotificationViewItem(element)) {
            return element;
        }
    }
    return undefined;
}
export function registerNotificationCommands(center, toasts, model) {
    // Show Notifications Cneter
    KeybindingsRegistry.registerCommandAndKeybindingRule({
        id: SHOW_NOTIFICATIONS_CENTER,
        weight: 200 /* KeybindingWeight.WorkbenchContrib */,
        primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 44 /* KeyCode.KeyN */),
        handler: () => {
            toasts.hide();
            center.show();
        }
    });
    // Hide Notifications Center
    KeybindingsRegistry.registerCommandAndKeybindingRule({
        id: HIDE_NOTIFICATIONS_CENTER,
        weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 50,
        when: NotificationsCenterVisibleContext,
        primary: 9 /* KeyCode.Escape */,
        handler: () => center.hide()
    });
    // Toggle Notifications Center
    CommandsRegistry.registerCommand(TOGGLE_NOTIFICATIONS_CENTER, () => {
        if (center.isVisible) {
            center.hide();
        }
        else {
            toasts.hide();
            center.show();
        }
    });
    // Clear Notification
    KeybindingsRegistry.registerCommandAndKeybindingRule({
        id: CLEAR_NOTIFICATION,
        weight: 200 /* KeybindingWeight.WorkbenchContrib */,
        when: NotificationFocusedContext,
        primary: 20 /* KeyCode.Delete */,
        mac: {
            primary: 2048 /* KeyMod.CtrlCmd */ | 1 /* KeyCode.Backspace */
        },
        handler: (accessor, args) => {
            const accessibilitySignalService = accessor.get(IAccessibilitySignalService);
            const notification = getNotificationFromContext(accessor.get(IListService), args);
            if (notification && !notification.hasProgress) {
                notification.close();
                accessibilitySignalService.playSignal(AccessibilitySignal.clear);
            }
        }
    });
    // Expand Notification
    KeybindingsRegistry.registerCommandAndKeybindingRule({
        id: EXPAND_NOTIFICATION,
        weight: 200 /* KeybindingWeight.WorkbenchContrib */,
        when: NotificationFocusedContext,
        primary: 17 /* KeyCode.RightArrow */,
        handler: (accessor, args) => {
            const notification = getNotificationFromContext(accessor.get(IListService), args);
            notification?.expand();
        }
    });
    // Accept Primary Action
    KeybindingsRegistry.registerCommandAndKeybindingRule({
        id: ACCEPT_PRIMARY_ACTION_NOTIFICATION,
        weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 1,
        when: ContextKeyExpr.or(NotificationFocusedContext, NotificationsToastsVisibleContext),
        primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 31 /* KeyCode.KeyA */,
        handler: (accessor) => {
            const actionRunner = accessor.get(IInstantiationService).createInstance(NotificationActionRunner);
            const notification = getNotificationFromContext(accessor.get(IListService)) || model.notifications.at(0);
            if (!notification) {
                return;
            }
            const primaryAction = notification.actions?.primary ? notification.actions.primary.at(0) : undefined;
            if (!primaryAction) {
                return;
            }
            actionRunner.run(primaryAction, notification);
            notification.close();
            actionRunner.dispose();
        }
    });
    // Collapse Notification
    KeybindingsRegistry.registerCommandAndKeybindingRule({
        id: COLLAPSE_NOTIFICATION,
        weight: 200 /* KeybindingWeight.WorkbenchContrib */,
        when: NotificationFocusedContext,
        primary: 15 /* KeyCode.LeftArrow */,
        handler: (accessor, args) => {
            const notification = getNotificationFromContext(accessor.get(IListService), args);
            notification?.collapse();
        }
    });
    // Toggle Notification
    KeybindingsRegistry.registerCommandAndKeybindingRule({
        id: TOGGLE_NOTIFICATION,
        weight: 200 /* KeybindingWeight.WorkbenchContrib */,
        when: NotificationFocusedContext,
        primary: 10 /* KeyCode.Space */,
        secondary: [3 /* KeyCode.Enter */],
        handler: accessor => {
            const notification = getNotificationFromContext(accessor.get(IListService));
            notification?.toggle();
        }
    });
    // Hide Toasts
    CommandsRegistry.registerCommand(HIDE_NOTIFICATION_TOAST, accessor => {
        toasts.hide();
    });
    KeybindingsRegistry.registerKeybindingRule({
        id: HIDE_NOTIFICATION_TOAST,
        weight: 200 /* KeybindingWeight.WorkbenchContrib */ - 50, // lower when not focused (e.g. let editor suggest win over this command)
        when: NotificationsToastsVisibleContext,
        primary: 9 /* KeyCode.Escape */
    });
    KeybindingsRegistry.registerKeybindingRule({
        id: HIDE_NOTIFICATION_TOAST,
        weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 100, // higher when focused
        when: ContextKeyExpr.and(NotificationsToastsVisibleContext, NotificationFocusedContext),
        primary: 9 /* KeyCode.Escape */
    });
    // Focus Toasts
    CommandsRegistry.registerCommand(FOCUS_NOTIFICATION_TOAST, () => toasts.focus());
    // Focus Next Toast
    KeybindingsRegistry.registerCommandAndKeybindingRule({
        id: FOCUS_NEXT_NOTIFICATION_TOAST,
        weight: 200 /* KeybindingWeight.WorkbenchContrib */,
        when: ContextKeyExpr.and(NotificationFocusedContext, NotificationsToastsVisibleContext),
        primary: 18 /* KeyCode.DownArrow */,
        handler: () => {
            toasts.focusNext();
        }
    });
    // Focus Previous Toast
    KeybindingsRegistry.registerCommandAndKeybindingRule({
        id: FOCUS_PREVIOUS_NOTIFICATION_TOAST,
        weight: 200 /* KeybindingWeight.WorkbenchContrib */,
        when: ContextKeyExpr.and(NotificationFocusedContext, NotificationsToastsVisibleContext),
        primary: 16 /* KeyCode.UpArrow */,
        handler: () => {
            toasts.focusPrevious();
        }
    });
    // Focus First Toast
    KeybindingsRegistry.registerCommandAndKeybindingRule({
        id: FOCUS_FIRST_NOTIFICATION_TOAST,
        weight: 200 /* KeybindingWeight.WorkbenchContrib */,
        when: ContextKeyExpr.and(NotificationFocusedContext, NotificationsToastsVisibleContext),
        primary: 11 /* KeyCode.PageUp */,
        secondary: [14 /* KeyCode.Home */],
        handler: () => {
            toasts.focusFirst();
        }
    });
    // Focus Last Toast
    KeybindingsRegistry.registerCommandAndKeybindingRule({
        id: FOCUS_LAST_NOTIFICATION_TOAST,
        weight: 200 /* KeybindingWeight.WorkbenchContrib */,
        when: ContextKeyExpr.and(NotificationFocusedContext, NotificationsToastsVisibleContext),
        primary: 12 /* KeyCode.PageDown */,
        secondary: [13 /* KeyCode.End */],
        handler: () => {
            toasts.focusLast();
        }
    });
    // Clear All Notifications
    CommandsRegistry.registerCommand(CLEAR_ALL_NOTIFICATIONS, () => center.clearAll());
    // Toggle Do Not Disturb Mode
    CommandsRegistry.registerCommand(TOGGLE_DO_NOT_DISTURB_MODE, accessor => {
        const notificationService = accessor.get(INotificationService);
        notificationService.setFilter(notificationService.getFilter() === NotificationsFilter.ERROR ? NotificationsFilter.OFF : NotificationsFilter.ERROR);
    });
    // Configure Do Not Disturb by Source
    CommandsRegistry.registerCommand(TOGGLE_DO_NOT_DISTURB_MODE_BY_SOURCE, accessor => {
        const notificationService = accessor.get(INotificationService);
        const quickInputService = accessor.get(IQuickInputService);
        const sortedFilters = notificationService.getFilters().sort((a, b) => a.label.localeCompare(b.label));
        const disposables = new DisposableStore();
        const picker = disposables.add(quickInputService.createQuickPick());
        picker.items = sortedFilters.map(source => ({
            id: source.id,
            label: source.label,
            tooltip: `${source.label} (${source.id})`,
            filter: source.filter
        }));
        picker.canSelectMany = true;
        picker.placeholder = localize('selectSources', "Select sources to enable all notifications from");
        picker.selectedItems = picker.items.filter(item => item.filter === NotificationsFilter.OFF);
        picker.show();
        disposables.add(picker.onDidAccept(async () => {
            for (const item of picker.items) {
                notificationService.setFilter({
                    id: item.id,
                    label: item.label,
                    filter: picker.selectedItems.includes(item) ? NotificationsFilter.OFF : NotificationsFilter.ERROR
                });
            }
            picker.hide();
        }));
        disposables.add(picker.onDidHide(() => disposables.dispose()));
    });
    // Commands for Command Palette
    const category = localize2('notifications', 'Notifications');
    MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: SHOW_NOTIFICATIONS_CENTER, title: localize2('showNotifications', 'Show Notifications'), category } });
    MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: HIDE_NOTIFICATIONS_CENTER, title: localize2('hideNotifications', 'Hide Notifications'), category }, when: NotificationsCenterVisibleContext });
    MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: CLEAR_ALL_NOTIFICATIONS, title: localize2('clearAllNotifications', 'Clear All Notifications'), category } });
    MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: ACCEPT_PRIMARY_ACTION_NOTIFICATION, title: localize2('acceptNotificationPrimaryAction', 'Accept Notification Primary Action'), category } });
    MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: TOGGLE_DO_NOT_DISTURB_MODE, title: localize2('toggleDoNotDisturbMode', 'Toggle Do Not Disturb Mode'), category } });
    MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: TOGGLE_DO_NOT_DISTURB_MODE_BY_SOURCE, title: localize2('toggleDoNotDisturbModeBySource', 'Toggle Do Not Disturb Mode By Source...'), category } });
    MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: FOCUS_NOTIFICATION_TOAST, title: localize2('focusNotificationToasts', 'Focus Notification Toast'), category }, when: NotificationsToastsVisibleContext });
    // Bell icon in the title bar (when notifications are positioned at top-right)
    MenuRegistry.appendMenuItem(MenuId.TitleBar, {
        command: {
            id: TOGGLE_NOTIFICATIONS_CENTER,
            title: localize('toggleNotifications', "Toggle Notifications"),
            icon: Codicon.bell,
        },
        group: 'navigation',
        order: 10000,
        when: ContextKeyExpr.and(ContextKeyExpr.equals(`config.${"workbench.notifications.position" /* NotificationsSettings.NOTIFICATIONS_POSITION */}`, "top-right" /* NotificationsPosition.TOP_RIGHT */), ContextKeyExpr.equals(`config.${"workbench.notifications.showInTitleBar" /* NotificationsSettings.NOTIFICATIONS_BUTTON */}`, true))
    });
}
// Notification Position Actions
registerAction2(class SetNotificationsPositionBottomRight extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.setNotificationsPosition.bottomRight',
            title: localize2('positionBottomRight', 'Bottom Right'),
            toggled: ContextKeyExpr.equals(`config.${"workbench.notifications.position" /* NotificationsSettings.NOTIFICATIONS_POSITION */}`, "bottom-right" /* NotificationsPosition.BOTTOM_RIGHT */),
            menu: {
                id: MenuId.NotificationsCenterPositionMenu,
                order: 1
            }
        });
    }
    run(accessor) {
        accessor.get(IConfigurationService).updateValue("workbench.notifications.position" /* NotificationsSettings.NOTIFICATIONS_POSITION */, "bottom-right" /* NotificationsPosition.BOTTOM_RIGHT */);
    }
});
registerAction2(class SetNotificationsPositionBottomLeft extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.setNotificationsPosition.bottomLeft',
            title: localize2('positionBottomLeft', 'Bottom Left'),
            toggled: ContextKeyExpr.equals(`config.${"workbench.notifications.position" /* NotificationsSettings.NOTIFICATIONS_POSITION */}`, "bottom-left" /* NotificationsPosition.BOTTOM_LEFT */),
            menu: {
                id: MenuId.NotificationsCenterPositionMenu,
                order: 2
            }
        });
    }
    run(accessor) {
        accessor.get(IConfigurationService).updateValue("workbench.notifications.position" /* NotificationsSettings.NOTIFICATIONS_POSITION */, "bottom-left" /* NotificationsPosition.BOTTOM_LEFT */);
    }
});
registerAction2(class SetNotificationsPositionTopRight extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.setNotificationsPosition.topRight',
            title: localize2('positionTopRight', 'Top Right'),
            toggled: ContextKeyExpr.equals(`config.${"workbench.notifications.position" /* NotificationsSettings.NOTIFICATIONS_POSITION */}`, "top-right" /* NotificationsPosition.TOP_RIGHT */),
            menu: {
                id: MenuId.NotificationsCenterPositionMenu,
                order: 3
            }
        });
    }
    run(accessor) {
        accessor.get(IConfigurationService).updateValue("workbench.notifications.position" /* NotificationsSettings.NOTIFICATIONS_POSITION */, "top-right" /* NotificationsPosition.TOP_RIGHT */);
    }
});
let NotificationActionRunner = class NotificationActionRunner extends ActionRunner {
    constructor(telemetryService, notificationService) {
        super();
        this.telemetryService = telemetryService;
        this.notificationService = notificationService;
    }
    async runAction(action, context) {
        this.telemetryService.publicLog2('workbenchActionExecuted', { id: action.id, from: 'message' });
        // Run and make sure to notify on any error again
        try {
            await super.runAction(action, context);
        }
        catch (error) {
            this.notificationService.error(error);
        }
    }
};
NotificationActionRunner = __decorate([
    __param(0, ITelemetryService),
    __param(1, INotificationService)
], NotificationActionRunner);
export { NotificationActionRunner };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90aWZpY2F0aW9uc0NvbW1hbmRzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2Jyb3dzZXIvcGFydHMvbm90aWZpY2F0aW9ucy9ub3RpZmljYXRpb25zQ29tbWFuZHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDcEYsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxtQkFBbUIsRUFBb0IsTUFBTSwrREFBK0QsQ0FBQztBQUN0SCxPQUFPLEVBQUUsUUFBUSxFQUFtQixNQUFNLHFDQUFxQyxDQUFDO0FBQ2hGLE9BQU8sRUFBeUIsc0JBQXNCLEVBQW9FLE1BQU0sa0NBQWtDLENBQUM7QUFDbkssT0FBTyxFQUFFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxFQUFFLGVBQWUsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ2hILE9BQU8sRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDekQsT0FBTyxFQUFFLFlBQVksRUFBRSxhQUFhLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUMvRixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUN2RixPQUFPLEVBQUUsMEJBQTBCLEVBQUUsaUNBQWlDLEVBQUUsaUNBQWlDLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNsSixPQUFPLEVBQUUsb0JBQW9CLEVBQTZCLG1CQUFtQixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDaEosT0FBTyxFQUFFLHFCQUFxQixFQUFvQixNQUFNLDREQUE0RCxDQUFDO0FBQ3JILE9BQU8sRUFBRSxZQUFZLEVBQWdGLE1BQU0sb0NBQW9DLENBQUM7QUFDaEos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