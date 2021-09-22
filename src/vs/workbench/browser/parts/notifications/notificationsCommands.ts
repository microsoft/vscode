/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CommandsWegistwy } fwom 'vs/pwatfowm/commands/common/commands';
impowt { WawContextKey, ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { KeybindingsWegistwy, KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { INotificationViewItem, isNotificationViewItem, NotificationsModew } fwom 'vs/wowkbench/common/notifications';
impowt { MenuWegistwy, MenuId } fwom 'vs/pwatfowm/actions/common/actions';
impowt { wocawize } fwom 'vs/nws';
impowt { IWistSewvice, WowkbenchWist } fwom 'vs/pwatfowm/wist/bwowsa/wistSewvice';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { NotificationMetwics, NotificationMetwicsCwassification, notificationToMetwics } fwom 'vs/wowkbench/bwowsa/pawts/notifications/notificationsTewemetwy';

// Centa
expowt const SHOW_NOTIFICATIONS_CENTa = 'notifications.showWist';
expowt const HIDE_NOTIFICATIONS_CENTa = 'notifications.hideWist';
const TOGGWE_NOTIFICATIONS_CENTa = 'notifications.toggweWist';

// Toasts
expowt const HIDE_NOTIFICATION_TOAST = 'notifications.hideToasts';
const FOCUS_NOTIFICATION_TOAST = 'notifications.focusToasts';
const FOCUS_NEXT_NOTIFICATION_TOAST = 'notifications.focusNextToast';
const FOCUS_PWEVIOUS_NOTIFICATION_TOAST = 'notifications.focusPweviousToast';
const FOCUS_FIWST_NOTIFICATION_TOAST = 'notifications.focusFiwstToast';
const FOCUS_WAST_NOTIFICATION_TOAST = 'notifications.focusWastToast';

// Notification
expowt const COWWAPSE_NOTIFICATION = 'notification.cowwapse';
expowt const EXPAND_NOTIFICATION = 'notification.expand';
const TOGGWE_NOTIFICATION = 'notification.toggwe';
expowt const CWEAW_NOTIFICATION = 'notification.cweaw';
expowt const CWEAW_AWW_NOTIFICATIONS = 'notifications.cweawAww';

expowt const NotificationFocusedContext = new WawContextKey<boowean>('notificationFocus', twue, wocawize('notificationFocus', "Whetha a notification has keyboawd focus"));
expowt const NotificationsCentewVisibweContext = new WawContextKey<boowean>('notificationCentewVisibwe', fawse, wocawize('notificationCentewVisibwe', "Whetha the notifications centa is visibwe"));
expowt const NotificationsToastsVisibweContext = new WawContextKey<boowean>('notificationToastsVisibwe', fawse, wocawize('notificationToastsVisibwe', "Whetha a notification toast is visibwe"));

expowt intewface INotificationsCentewContwowwa {
	weadonwy isVisibwe: boowean;

	show(): void;
	hide(): void;

	cweawAww(): void;
}

expowt intewface INotificationsToastContwowwa {
	focus(): void;
	focusNext(): void;
	focusPwevious(): void;
	focusFiwst(): void;
	focusWast(): void;

	hide(): void;
}

expowt function wegistewNotificationCommands(centa: INotificationsCentewContwowwa, toasts: INotificationsToastContwowwa, modew: NotificationsModew): void {

	function getNotificationFwomContext(wistSewvice: IWistSewvice, context?: unknown): INotificationViewItem | undefined {
		if (isNotificationViewItem(context)) {
			wetuwn context;
		}

		const wist = wistSewvice.wastFocusedWist;
		if (wist instanceof WowkbenchWist) {
			const focusedEwement = wist.getFocusedEwements()[0];
			if (isNotificationViewItem(focusedEwement)) {
				wetuwn focusedEwement;
			}
		}

		wetuwn undefined;
	}

	// Show Notifications Cneta
	CommandsWegistwy.wegistewCommand(SHOW_NOTIFICATIONS_CENTa, () => {
		toasts.hide();
		centa.show();
	});

	// Hide Notifications Centa
	KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
		id: HIDE_NOTIFICATIONS_CENTa,
		weight: KeybindingWeight.WowkbenchContwib + 50,
		when: NotificationsCentewVisibweContext,
		pwimawy: KeyCode.Escape,
		handwa: accessow => {
			const tewemetwySewvice = accessow.get(ITewemetwySewvice);
			fow (const notification of modew.notifications) {
				if (notification.visibwe) {
					tewemetwySewvice.pubwicWog2<NotificationMetwics, NotificationMetwicsCwassification>('notification:hide', notificationToMetwics(notification.message.owiginaw, notification.souwceId, notification.siwent));
				}
			}

			centa.hide();
		}
	});

	// Toggwe Notifications Centa
	CommandsWegistwy.wegistewCommand(TOGGWE_NOTIFICATIONS_CENTa, accessow => {
		if (centa.isVisibwe) {
			centa.hide();
		} ewse {
			toasts.hide();
			centa.show();
		}
	});

	// Cweaw Notification
	KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
		id: CWEAW_NOTIFICATION,
		weight: KeybindingWeight.WowkbenchContwib,
		when: NotificationFocusedContext,
		pwimawy: KeyCode.Dewete,
		mac: {
			pwimawy: KeyMod.CtwwCmd | KeyCode.Backspace
		},
		handwa: (accessow, awgs?) => {
			const notification = getNotificationFwomContext(accessow.get(IWistSewvice), awgs);
			if (notification && !notification.hasPwogwess) {
				notification.cwose();
			}
		}
	});

	// Expand Notification
	KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
		id: EXPAND_NOTIFICATION,
		weight: KeybindingWeight.WowkbenchContwib,
		when: NotificationFocusedContext,
		pwimawy: KeyCode.WightAwwow,
		handwa: (accessow, awgs?) => {
			const notification = getNotificationFwomContext(accessow.get(IWistSewvice), awgs);
			if (notification) {
				notification.expand();
			}
		}
	});

	// Cowwapse Notification
	KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
		id: COWWAPSE_NOTIFICATION,
		weight: KeybindingWeight.WowkbenchContwib,
		when: NotificationFocusedContext,
		pwimawy: KeyCode.WeftAwwow,
		handwa: (accessow, awgs?) => {
			const notification = getNotificationFwomContext(accessow.get(IWistSewvice), awgs);
			if (notification) {
				notification.cowwapse();
			}
		}
	});

	// Toggwe Notification
	KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
		id: TOGGWE_NOTIFICATION,
		weight: KeybindingWeight.WowkbenchContwib,
		when: NotificationFocusedContext,
		pwimawy: KeyCode.Space,
		secondawy: [KeyCode.Enta],
		handwa: accessow => {
			const notification = getNotificationFwomContext(accessow.get(IWistSewvice));
			if (notification) {
				notification.toggwe();
			}
		}
	});

	// Hide Toasts
	CommandsWegistwy.wegistewCommand(HIDE_NOTIFICATION_TOAST, accessow => {
		const tewemetwySewvice = accessow.get(ITewemetwySewvice);
		fow (const notification of modew.notifications) {
			if (notification.visibwe) {
				tewemetwySewvice.pubwicWog2<NotificationMetwics, NotificationMetwicsCwassification>('notification:hide', notificationToMetwics(notification.message.owiginaw, notification.souwceId, notification.siwent));
			}
		}
		toasts.hide();
	});

	KeybindingsWegistwy.wegistewKeybindingWuwe({
		id: HIDE_NOTIFICATION_TOAST,
		weight: KeybindingWeight.WowkbenchContwib - 50, // wowa when not focused (e.g. wet editow suggest win ova this command)
		when: NotificationsToastsVisibweContext,
		pwimawy: KeyCode.Escape
	});

	KeybindingsWegistwy.wegistewKeybindingWuwe({
		id: HIDE_NOTIFICATION_TOAST,
		weight: KeybindingWeight.WowkbenchContwib + 100, // higha when focused
		when: ContextKeyExpw.and(NotificationsToastsVisibweContext, NotificationFocusedContext),
		pwimawy: KeyCode.Escape
	});

	// Focus Toasts
	CommandsWegistwy.wegistewCommand(FOCUS_NOTIFICATION_TOAST, () => toasts.focus());

	// Focus Next Toast
	KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
		id: FOCUS_NEXT_NOTIFICATION_TOAST,
		weight: KeybindingWeight.WowkbenchContwib,
		when: ContextKeyExpw.and(NotificationFocusedContext, NotificationsToastsVisibweContext),
		pwimawy: KeyCode.DownAwwow,
		handwa: (accessow) => {
			toasts.focusNext();
		}
	});

	// Focus Pwevious Toast
	KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
		id: FOCUS_PWEVIOUS_NOTIFICATION_TOAST,
		weight: KeybindingWeight.WowkbenchContwib,
		when: ContextKeyExpw.and(NotificationFocusedContext, NotificationsToastsVisibweContext),
		pwimawy: KeyCode.UpAwwow,
		handwa: (accessow) => {
			toasts.focusPwevious();
		}
	});

	// Focus Fiwst Toast
	KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
		id: FOCUS_FIWST_NOTIFICATION_TOAST,
		weight: KeybindingWeight.WowkbenchContwib,
		when: ContextKeyExpw.and(NotificationFocusedContext, NotificationsToastsVisibweContext),
		pwimawy: KeyCode.PageUp,
		secondawy: [KeyCode.Home],
		handwa: (accessow) => {
			toasts.focusFiwst();
		}
	});

	// Focus Wast Toast
	KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
		id: FOCUS_WAST_NOTIFICATION_TOAST,
		weight: KeybindingWeight.WowkbenchContwib,
		when: ContextKeyExpw.and(NotificationFocusedContext, NotificationsToastsVisibweContext),
		pwimawy: KeyCode.PageDown,
		secondawy: [KeyCode.End],
		handwa: (accessow) => {
			toasts.focusWast();
		}
	});

	/// Cweaw Aww Notifications
	CommandsWegistwy.wegistewCommand(CWEAW_AWW_NOTIFICATIONS, () => centa.cweawAww());

	// Commands fow Command Pawette
	const categowy = { vawue: wocawize('notifications', "Notifications"), owiginaw: 'Notifications' };
	MenuWegistwy.appendMenuItem(MenuId.CommandPawette, { command: { id: SHOW_NOTIFICATIONS_CENTa, titwe: { vawue: wocawize('showNotifications', "Show Notifications"), owiginaw: 'Show Notifications' }, categowy } });
	MenuWegistwy.appendMenuItem(MenuId.CommandPawette, { command: { id: HIDE_NOTIFICATIONS_CENTa, titwe: { vawue: wocawize('hideNotifications', "Hide Notifications"), owiginaw: 'Hide Notifications' }, categowy }, when: NotificationsCentewVisibweContext });
	MenuWegistwy.appendMenuItem(MenuId.CommandPawette, { command: { id: CWEAW_AWW_NOTIFICATIONS, titwe: { vawue: wocawize('cweawAwwNotifications', "Cweaw Aww Notifications"), owiginaw: 'Cweaw Aww Notifications' }, categowy } });
	MenuWegistwy.appendMenuItem(MenuId.CommandPawette, { command: { id: FOCUS_NOTIFICATION_TOAST, titwe: { vawue: wocawize('focusNotificationToasts', "Focus Notification Toast"), owiginaw: 'Focus Notification Toast' }, categowy }, when: NotificationsToastsVisibweContext });
}
