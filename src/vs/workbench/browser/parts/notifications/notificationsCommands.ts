/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { KeyChord, KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { INotificationViewItem, isNotificationViewItem, NotificationsModel } from 'vs/workbench/common/notifications';
import { MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';
import { localize } from 'vs/nls';
import { IListService, WorkbenchList } from 'vs/platform/list/browser/listService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { NotificationMetrics, NotificationMetricsClassification, notificationToMetrics } from 'vs/workbench/browser/parts/notifications/notificationsTelemetry';
import { NotificationFocusedContext, NotificationsCenterVisibleContext, NotificationsToastsVisibleContext } from 'vs/workbench/common/contextkeys';
import { INotificationService, NotificationPriority } from 'vs/platform/notification/common/notification';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ActionRunner, IAction, WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification } from 'vs/base/common/actions';
import { hash } from 'vs/base/common/hash';
import { firstOrDefault } from 'vs/base/common/arrays';

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
				// via keyboard and might not have a focussed element.
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
		handler: accessor => {
			const telemetryService = accessor.get(ITelemetryService);
			for (const notification of model.notifications) {
				if (notification.visible) {
					telemetryService.publicLog2<NotificationMetrics, NotificationMetricsClassification>('notification:hide', notificationToMetrics(notification.message.original, notification.sourceId, notification.priority === NotificationPriority.SILENT));
				}
			}

			center.hide();
		}
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
			const notification = getNotificationFromContext(accessor.get(IListService), args);
			if (notification && !notification.hasProgress) {
				notification.close();
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
		when: ContextKeyExpr.and(NotificationsToastsVisibleContext),
		primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyA,
		handler: (accessor) => {
			const actionRunner = accessor.get(IInstantiationService).createInstance(NotificationActionRunner);
			const notification = firstOrDefault(model.notifications);
			if (!notification) {
				return;
			}
			const primaryAction = notification.actions?.primary ? firstOrDefault(notification.actions.primary) : undefined;
			if (!primaryAction) {
				return;
			}
			actionRunner.run(primaryAction, notification);
			notification.close();
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
		const telemetryService = accessor.get(ITelemetryService);
		for (const notification of model.notifications) {
			if (notification.visible) {
				telemetryService.publicLog2<NotificationMetrics, NotificationMetricsClassification>('notification:hide', notificationToMetrics(notification.message.original, notification.sourceId, notification.priority === NotificationPriority.SILENT));
			}
		}
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

		notificationService.doNotDisturbMode = !notificationService.doNotDisturbMode;
	});

	// Commands for Command Palette
	const category = { value: localize('notifications', "Notifications"), original: 'Notifications' };
	MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: SHOW_NOTIFICATIONS_CENTER, title: { value: localize('showNotifications', "Show Notifications"), original: 'Show Notifications' }, category } });
	MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: HIDE_NOTIFICATIONS_CENTER, title: { value: localize('hideNotifications', "Hide Notifications"), original: 'Hide Notifications' }, category }, when: NotificationsCenterVisibleContext });
	MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: CLEAR_ALL_NOTIFICATIONS, title: { value: localize('clearAllNotifications', "Clear All Notifications"), original: 'Clear All Notifications' }, category } });
	MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: ACCEPT_PRIMARY_ACTION_NOTIFICATION, title: { value: localize('acceptNotificationPrimaryAction', "Accept Notification Primary Action"), original: 'Accept Notification Primary Action' }, category } });
	MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: TOGGLE_DO_NOT_DISTURB_MODE, title: { value: localize('toggleDoNotDisturbMode', "Toggle Do Not Disturb Mode"), original: 'Toggle Do Not Disturb Mode' }, category } });
	MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: FOCUS_NOTIFICATION_TOAST, title: { value: localize('focusNotificationToasts', "Focus Notification Toast"), original: 'Focus Notification Toast' }, category }, when: NotificationsToastsVisibleContext });
}


interface NotificationActionMetrics {
	readonly id: string;
	readonly actionLabel: string;
	readonly source: string;
	readonly silent: boolean;
}

type NotificationActionMetricsClassification = {
	id: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The identifier of the action that was run from a notification.' };
	actionLabel: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The label of the action that was run from a notification.' };
	source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The source of the notification where an action was run.' };
	silent: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the notification where an action was run is silent or not.' };
	owner: 'bpasero';
	comment: 'Tracks when actions are fired from notifcations and how they were fired.';
};

export class NotificationActionRunner extends ActionRunner {

	constructor(
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@INotificationService private readonly notificationService: INotificationService
	) {
		super();
	}

	protected override async runAction(action: IAction, context: unknown): Promise<void> {
		this.telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', { id: action.id, from: 'message' });

		if (isNotificationViewItem(context)) {
			// Log some additional telemetry specifically for actions
			// that are triggered from within notifications.
			this.telemetryService.publicLog2<NotificationActionMetrics, NotificationActionMetricsClassification>('notification:actionExecuted', {
				id: hash(context.message.original.toString()).toString(),
				actionLabel: action.label,
				source: context.sourceId || 'core',
				silent: context.priority === NotificationPriority.SILENT
			});
		}

		// Run and make sure to notify on any error again
		try {
			await super.runAction(action, context);
		} catch (error) {
			this.notificationService.error(error);
		}
	}
}
