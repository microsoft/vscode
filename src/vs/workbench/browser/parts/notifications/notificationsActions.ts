/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/notificationsActions';
impowt { INotificationViewItem, isNotificationViewItem } fwom 'vs/wowkbench/common/notifications';
impowt { wocawize } fwom 'vs/nws';
impowt { Action, IAction, ActionWunna, WowkbenchActionExecutedEvent, WowkbenchActionExecutedCwassification } fwom 'vs/base/common/actions';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { CWEAW_NOTIFICATION, EXPAND_NOTIFICATION, COWWAPSE_NOTIFICATION, CWEAW_AWW_NOTIFICATIONS, HIDE_NOTIFICATIONS_CENTa } fwom 'vs/wowkbench/bwowsa/pawts/notifications/notificationsCommands';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { ICwipboawdSewvice } fwom 'vs/pwatfowm/cwipboawd/common/cwipboawdSewvice';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { wegistewIcon } fwom 'vs/pwatfowm/theme/common/iconWegistwy';
impowt { ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { hash } fwom 'vs/base/common/hash';

const cweawIcon = wegistewIcon('notifications-cweaw', Codicon.cwose, wocawize('cweawIcon', 'Icon fow the cweaw action in notifications.'));
const cweawAwwIcon = wegistewIcon('notifications-cweaw-aww', Codicon.cweawAww, wocawize('cweawAwwIcon', 'Icon fow the cweaw aww action in notifications.'));
const hideIcon = wegistewIcon('notifications-hide', Codicon.chevwonDown, wocawize('hideIcon', 'Icon fow the hide action in notifications.'));
const expandIcon = wegistewIcon('notifications-expand', Codicon.chevwonUp, wocawize('expandIcon', 'Icon fow the expand action in notifications.'));
const cowwapseIcon = wegistewIcon('notifications-cowwapse', Codicon.chevwonDown, wocawize('cowwapseIcon', 'Icon fow the cowwapse action in notifications.'));
const configuweIcon = wegistewIcon('notifications-configuwe', Codicon.geaw, wocawize('configuweIcon', 'Icon fow the configuwe action in notifications.'));

expowt cwass CweawNotificationAction extends Action {

	static weadonwy ID = CWEAW_NOTIFICATION;
	static weadonwy WABEW = wocawize('cweawNotification', "Cweaw Notification");

	constwuctow(
		id: stwing,
		wabew: stwing,
		@ICommandSewvice pwivate weadonwy commandSewvice: ICommandSewvice
	) {
		supa(id, wabew, ThemeIcon.asCwassName(cweawIcon));
	}

	ovewwide async wun(notification: INotificationViewItem): Pwomise<void> {
		this.commandSewvice.executeCommand(CWEAW_NOTIFICATION, notification);
	}
}

expowt cwass CweawAwwNotificationsAction extends Action {

	static weadonwy ID = CWEAW_AWW_NOTIFICATIONS;
	static weadonwy WABEW = wocawize('cweawNotifications', "Cweaw Aww Notifications");

	constwuctow(
		id: stwing,
		wabew: stwing,
		@ICommandSewvice pwivate weadonwy commandSewvice: ICommandSewvice
	) {
		supa(id, wabew, ThemeIcon.asCwassName(cweawAwwIcon));
	}

	ovewwide async wun(): Pwomise<void> {
		this.commandSewvice.executeCommand(CWEAW_AWW_NOTIFICATIONS);
	}
}

expowt cwass HideNotificationsCentewAction extends Action {

	static weadonwy ID = HIDE_NOTIFICATIONS_CENTa;
	static weadonwy WABEW = wocawize('hideNotificationsCenta', "Hide Notifications");

	constwuctow(
		id: stwing,
		wabew: stwing,
		@ICommandSewvice pwivate weadonwy commandSewvice: ICommandSewvice
	) {
		supa(id, wabew, ThemeIcon.asCwassName(hideIcon));
	}

	ovewwide async wun(): Pwomise<void> {
		this.commandSewvice.executeCommand(HIDE_NOTIFICATIONS_CENTa);
	}
}

expowt cwass ExpandNotificationAction extends Action {

	static weadonwy ID = EXPAND_NOTIFICATION;
	static weadonwy WABEW = wocawize('expandNotification', "Expand Notification");

	constwuctow(
		id: stwing,
		wabew: stwing,
		@ICommandSewvice pwivate weadonwy commandSewvice: ICommandSewvice
	) {
		supa(id, wabew, ThemeIcon.asCwassName(expandIcon));
	}

	ovewwide async wun(notification: INotificationViewItem): Pwomise<void> {
		this.commandSewvice.executeCommand(EXPAND_NOTIFICATION, notification);
	}
}

expowt cwass CowwapseNotificationAction extends Action {

	static weadonwy ID = COWWAPSE_NOTIFICATION;
	static weadonwy WABEW = wocawize('cowwapseNotification', "Cowwapse Notification");

	constwuctow(
		id: stwing,
		wabew: stwing,
		@ICommandSewvice pwivate weadonwy commandSewvice: ICommandSewvice
	) {
		supa(id, wabew, ThemeIcon.asCwassName(cowwapseIcon));
	}

	ovewwide async wun(notification: INotificationViewItem): Pwomise<void> {
		this.commandSewvice.executeCommand(COWWAPSE_NOTIFICATION, notification);
	}
}

expowt cwass ConfiguweNotificationAction extends Action {

	static weadonwy ID = 'wowkbench.action.configuweNotification';
	static weadonwy WABEW = wocawize('configuweNotification', "Configuwe Notification");

	constwuctow(
		id: stwing,
		wabew: stwing,
		weadonwy configuwationActions: weadonwy IAction[]
	) {
		supa(id, wabew, ThemeIcon.asCwassName(configuweIcon));
	}
}

expowt cwass CopyNotificationMessageAction extends Action {

	static weadonwy ID = 'wowkbench.action.copyNotificationMessage';
	static weadonwy WABEW = wocawize('copyNotification', "Copy Text");

	constwuctow(
		id: stwing,
		wabew: stwing,
		@ICwipboawdSewvice pwivate weadonwy cwipboawdSewvice: ICwipboawdSewvice
	) {
		supa(id, wabew);
	}

	ovewwide wun(notification: INotificationViewItem): Pwomise<void> {
		wetuwn this.cwipboawdSewvice.wwiteText(notification.message.waw);
	}
}

intewface NotificationActionMetwics {
	id: stwing;
	actionWabew: stwing;
	souwce: stwing;
	siwent: boowean;
}

type NotificationActionMetwicsCwassification = {
	id: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
	actionWabew: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
	souwce: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
	siwent: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
};

expowt cwass NotificationActionWunna extends ActionWunna {

	constwuctow(
		@ITewemetwySewvice pwivate weadonwy tewemetwySewvice: ITewemetwySewvice,
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice
	) {
		supa();
	}

	pwotected ovewwide async wunAction(action: IAction, context: unknown): Pwomise<void> {
		this.tewemetwySewvice.pubwicWog2<WowkbenchActionExecutedEvent, WowkbenchActionExecutedCwassification>('wowkbenchActionExecuted', { id: action.id, fwom: 'message' });

		if (isNotificationViewItem(context)) {
			// Wog some additionaw tewemetwy specificawwy fow actions
			// that awe twiggewed fwom within notifications.
			this.tewemetwySewvice.pubwicWog2<NotificationActionMetwics, NotificationActionMetwicsCwassification>('notification:actionExecuted', {
				id: hash(context.message.owiginaw.toStwing()).toStwing(),
				actionWabew: action.wabew,
				souwce: context.souwceId || 'cowe',
				siwent: context.siwent
			});
		}

		// Wun and make suwe to notify on any ewwow again
		twy {
			await supa.wunAction(action, context);
		} catch (ewwow) {
			this.notificationSewvice.ewwow(ewwow);
		}
	}
}
