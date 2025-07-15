/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeyChord, KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { INotificationViewItem, isNotificationViewItem, NotificationsModel } from '../../../common/notifications.js';
import { MenuRegistry, MenuId } from '../../../../platform/actions/common/actions.js';
import { localize, localize2 } from '../../../../nls.js';
import { IListService, WorkbenchList } from '../../../../platform/list/browser/listService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { NotificationFocusedContext, NotificationsCenterVisibleContext, NotificationsToastsVisibleContext } from '../../../common/contextkeys.js';
import { INotificationService, INotificationSourceFilter, NotificationsFilter } from '../../../../platform/notification/common/notification.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ActionRunner, IAction, WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification } from '../../../../base/common/actions.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';

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

export interface INotificationsCenterController {
	readonly isVisible: boolean;

	show(): void;
	hide(): void;

	clearAll(): void;
}

export interface INotificationsToastController {
	focus(): void;
	focusNext(): void;
	focusPrevious(): void;
	focusFirst(): void;
	focusLast(): void;

	hide(): void;
}

export function getNotificationFromContext(listService: IListService, context?: unknown): INotificationViewItem | undefined {
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

export function registerNotificationCommands(center: INotificationsCenterController, toasts: INotificationsToastController, model: NotificationsModel): void {

	// Show Notifications Cneter
	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: SHOW_NOTIFICATIONS_CENTER,
		weight: KeybindingWeight.WorkbenchContrib,
		primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyN),
		handler: () => {
			toasts.hide();
			center.show();
		}
	});

	// Hide Notifications Center
	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: HIDE_NOTIFICATIONS_CENTER,
		weight: KeybindingWeight.WorkbenchContrib + 50,
		when: NotificationsCenterVisibleContext,
		primary: KeyCode.Escape,
		handler: () => center.hide()
	});

	// Toggle Notifications Center
	CommandsRegistry.registerCommand(TOGGLE_NOTIFICATIONS_CENTER, () => {
		if (center.isVisible) {
			center.hide();
		} else {
			toasts.hide();
			center.show();
		}
	});

	// Clear Notification
	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: CLEAR_NOTIFICATION,
		weight: KeybindingWeight.WorkbenchContrib,
		when: NotificationFocusedContext,
		primary: KeyCode.Delete,
		mac: {
			primary: KeyMod.CtrlCmd | KeyCode.Backspace
		},
		handler: (accessor, args?) => {
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
		weight: KeybindingWeight.WorkbenchContrib,
		when: NotificationFocusedContext,
		primary: KeyCode.RightArrow,
		handler: (accessor, args?) => {
			const notification = getNotificationFromContext(accessor.get(IListService), args);
			notification?.expand();
		}
	});

	// Accept Primary Action
	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: ACCEPT_PRIMARY_ACTION_NOTIFICATION,
		weight: KeybindingWeight.WorkbenchContrib,
		when: ContextKeyExpr.or(NotificationFocusedContext, NotificationsToastsVisibleContext),
		primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyA,
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
		weight: KeybindingWeight.WorkbenchContrib,
		when: NotificationFocusedContext,
		primary: KeyCode.LeftArrow,
		handler: (accessor, args?) => {
			const notification = getNotificationFromContext(accessor.get(IListService), args);
			notification?.collapse();
		}
	});

	// Toggle Notification
	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: TOGGLE_NOTIFICATION,
		weight: KeybindingWeight.WorkbenchContrib,
		when: NotificationFocusedContext,
		primary: KeyCode.Space,
		secondary: [KeyCode.Enter],
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
		weight: KeybindingWeight.WorkbenchContrib - 50, // lower when not focused (e.g. let editor suggest win over this command)
		when: NotificationsToastsVisibleContext,
		primary: KeyCode.Escape
	});

	KeybindingsRegistry.registerKeybindingRule({
		id: HIDE_NOTIFICATION_TOAST,
		weight: KeybindingWeight.WorkbenchContrib + 100, // higher when focused
		when: ContextKeyExpr.and(NotificationsToastsVisibleContext, NotificationFocusedContext),
		primary: KeyCode.Escape
	});

	// Focus Toasts
	CommandsRegistry.registerCommand(FOCUS_NOTIFICATION_TOAST, () => toasts.focus());

	// Focus Next Toast
	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: FOCUS_NEXT_NOTIFICATION_TOAST,
		weight: KeybindingWeight.WorkbenchContrib,
		when: ContextKeyExpr.and(NotificationFocusedContext, NotificationsToastsVisibleContext),
		primary: KeyCode.DownArrow,
		handler: () => {
			toasts.focusNext();
		}
	});

	// Focus Previous Toast
	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: FOCUS_PREVIOUS_NOTIFICATION_TOAST,
		weight: KeybindingWeight.WorkbenchContrib,
		when: ContextKeyExpr.and(NotificationFocusedContext, NotificationsToastsVisibleContext),
		primary: KeyCode.UpArrow,
		handler: () => {
			toasts.focusPrevious();
		}
	});

	// Focus First Toast
	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: FOCUS_FIRST_NOTIFICATION_TOAST,
		weight: KeybindingWeight.WorkbenchContrib,
		when: ContextKeyExpr.and(NotificationFocusedContext, NotificationsToastsVisibleContext),
		primary: KeyCode.PageUp,
		secondary: [KeyCode.Home],
		handler: () => {
			toasts.focusFirst();
		}
	});

	// Focus Last Toast
	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: FOCUS_LAST_NOTIFICATION_TOAST,
		weight: KeybindingWeight.WorkbenchContrib,
		when: ContextKeyExpr.and(NotificationFocusedContext, NotificationsToastsVisibleContext),
		primary: KeyCode.PageDown,
		secondary: [KeyCode.End],
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
		const picker = disposables.add(quickInputService.createQuickPick<IQuickPickItem & INotificationSourceFilter>());

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
}


export class NotificationActionRunner extends ActionRunner {

	constructor(
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@INotificationService private readonly notificationService: INotificationService
	) {
		super();
	}

	protected override async runAction(action: IAction, context: unknown): Promise<void> {
		this.telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', { id: action.id, from: 'message' });

		// Run and make sure to notify on any error again
		try {
			await super.runAction(action, context);
		} catch (error) {
			this.notificationService.error(error);
		}
	}
}
