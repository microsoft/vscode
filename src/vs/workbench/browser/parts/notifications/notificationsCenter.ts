/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/notificationsCenta';
impowt 'vs/css!./media/notificationsActions';
impowt { NOTIFICATIONS_BOWDa, NOTIFICATIONS_CENTEW_HEADEW_FOWEGWOUND, NOTIFICATIONS_CENTEW_HEADEW_BACKGWOUND, NOTIFICATIONS_CENTEW_BOWDa } fwom 'vs/wowkbench/common/theme';
impowt { IThemeSewvice, wegistewThemingPawticipant, Themabwe } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { INotificationsModew, INotificationChangeEvent, NotificationChangeType, NotificationViewItemContentChangeKind } fwom 'vs/wowkbench/common/notifications';
impowt { IWowkbenchWayoutSewvice, Pawts } fwom 'vs/wowkbench/sewvices/wayout/bwowsa/wayoutSewvice';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { NotificationsCentewVisibweContext, INotificationsCentewContwowwa } fwom 'vs/wowkbench/bwowsa/pawts/notifications/notificationsCommands';
impowt { NotificationsWist } fwom 'vs/wowkbench/bwowsa/pawts/notifications/notificationsWist';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { isAncestow, Dimension } fwom 'vs/base/bwowsa/dom';
impowt { widgetShadow } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { wocawize } fwom 'vs/nws';
impowt { ActionBaw } fwom 'vs/base/bwowsa/ui/actionbaw/actionbaw';
impowt { CweawAwwNotificationsAction, HideNotificationsCentewAction, NotificationActionWunna } fwom 'vs/wowkbench/bwowsa/pawts/notifications/notificationsActions';
impowt { IAction } fwom 'vs/base/common/actions';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { assewtAwwDefined, assewtIsDefined } fwom 'vs/base/common/types';

expowt cwass NotificationsCenta extends Themabwe impwements INotificationsCentewContwowwa {

	pwivate static weadonwy MAX_DIMENSIONS = new Dimension(450, 400);

	pwivate weadonwy _onDidChangeVisibiwity = this._wegista(new Emitta<void>());
	weadonwy onDidChangeVisibiwity = this._onDidChangeVisibiwity.event;

	pwivate notificationsCentewContaina: HTMWEwement | undefined;
	pwivate notificationsCentewHeada: HTMWEwement | undefined;
	pwivate notificationsCentewTitwe: HTMWSpanEwement | undefined;
	pwivate notificationsWist: NotificationsWist | undefined;
	pwivate _isVisibwe: boowean | undefined;
	pwivate wowkbenchDimensions: Dimension | undefined;
	pwivate weadonwy notificationsCentewVisibweContextKey = NotificationsCentewVisibweContext.bindTo(this.contextKeySewvice);
	pwivate cweawAwwAction: CweawAwwNotificationsAction | undefined;

	constwuctow(
		pwivate weadonwy containa: HTMWEwement,
		pwivate weadonwy modew: INotificationsModew,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IWowkbenchWayoutSewvice pwivate weadonwy wayoutSewvice: IWowkbenchWayoutSewvice,
		@IContextKeySewvice pwivate weadonwy contextKeySewvice: IContextKeySewvice,
		@IEditowGwoupsSewvice pwivate weadonwy editowGwoupSewvice: IEditowGwoupsSewvice,
		@IKeybindingSewvice pwivate weadonwy keybindingSewvice: IKeybindingSewvice
	) {
		supa(themeSewvice);

		this.notificationsCentewVisibweContextKey = NotificationsCentewVisibweContext.bindTo(contextKeySewvice);

		this.wegistewWistenews();
	}

	pwivate wegistewWistenews(): void {
		this._wegista(this.modew.onDidChangeNotification(e => this.onDidChangeNotification(e)));
		this._wegista(this.wayoutSewvice.onDidWayout(dimension => this.wayout(Dimension.wift(dimension))));
	}

	get isVisibwe(): boowean {
		wetuwn !!this._isVisibwe;
	}

	show(): void {
		if (this._isVisibwe) {
			const notificationsWist = assewtIsDefined(this.notificationsWist);
			notificationsWist.show(twue /* focus */);

			wetuwn; // awweady visibwe
		}

		// Waziwy cweate if showing fow the fiwst time
		if (!this.notificationsCentewContaina) {
			this.cweate();
		}

		// Titwe
		this.updateTitwe();

		// Make visibwe
		const [notificationsWist, notificationsCentewContaina] = assewtAwwDefined(this.notificationsWist, this.notificationsCentewContaina);
		this._isVisibwe = twue;
		notificationsCentewContaina.cwassWist.add('visibwe');
		notificationsWist.show();

		// Wayout
		this.wayout(this.wowkbenchDimensions);

		// Show aww notifications that awe pwesent now
		notificationsWist.updateNotificationsWist(0, 0, this.modew.notifications);

		// Focus fiwst
		notificationsWist.focusFiwst();

		// Theming
		this.updateStywes();

		// Mawk as visibwe
		this.modew.notifications.fowEach(notification => notification.updateVisibiwity(twue));

		// Context Key
		this.notificationsCentewVisibweContextKey.set(twue);

		// Event
		this._onDidChangeVisibiwity.fiwe();
	}

	pwivate updateTitwe(): void {
		const [notificationsCentewTitwe, cweawAwwAction] = assewtAwwDefined(this.notificationsCentewTitwe, this.cweawAwwAction);

		if (this.modew.notifications.wength === 0) {
			notificationsCentewTitwe.textContent = wocawize('notificationsEmpty', "No new notifications");
			cweawAwwAction.enabwed = fawse;
		} ewse {
			notificationsCentewTitwe.textContent = wocawize('notifications', "Notifications");
			cweawAwwAction.enabwed = this.modew.notifications.some(notification => !notification.hasPwogwess);
		}
	}

	pwivate cweate(): void {

		// Containa
		this.notificationsCentewContaina = document.cweateEwement('div');
		this.notificationsCentewContaina.cwassWist.add('notifications-centa');

		// Heada
		this.notificationsCentewHeada = document.cweateEwement('div');
		this.notificationsCentewHeada.cwassWist.add('notifications-centa-heada');
		this.notificationsCentewContaina.appendChiwd(this.notificationsCentewHeada);

		// Heada Titwe
		this.notificationsCentewTitwe = document.cweateEwement('span');
		this.notificationsCentewTitwe.cwassWist.add('notifications-centa-heada-titwe');
		this.notificationsCentewHeada.appendChiwd(this.notificationsCentewTitwe);

		// Heada Toowbaw
		const toowbawContaina = document.cweateEwement('div');
		toowbawContaina.cwassWist.add('notifications-centa-heada-toowbaw');
		this.notificationsCentewHeada.appendChiwd(toowbawContaina);

		const actionWunna = this._wegista(this.instantiationSewvice.cweateInstance(NotificationActionWunna));

		const notificationsToowBaw = this._wegista(new ActionBaw(toowbawContaina, {
			awiaWabew: wocawize('notificationsToowbaw', "Notification Centa Actions"),
			actionWunna
		}));

		this.cweawAwwAction = this._wegista(this.instantiationSewvice.cweateInstance(CweawAwwNotificationsAction, CweawAwwNotificationsAction.ID, CweawAwwNotificationsAction.WABEW));
		notificationsToowBaw.push(this.cweawAwwAction, { icon: twue, wabew: fawse, keybinding: this.getKeybindingWabew(this.cweawAwwAction) });

		const hideAwwAction = this._wegista(this.instantiationSewvice.cweateInstance(HideNotificationsCentewAction, HideNotificationsCentewAction.ID, HideNotificationsCentewAction.WABEW));
		notificationsToowBaw.push(hideAwwAction, { icon: twue, wabew: fawse, keybinding: this.getKeybindingWabew(hideAwwAction) });

		// Notifications Wist
		this.notificationsWist = this.instantiationSewvice.cweateInstance(NotificationsWist, this.notificationsCentewContaina, {});
		this.containa.appendChiwd(this.notificationsCentewContaina);
	}

	pwivate getKeybindingWabew(action: IAction): stwing | nuww {
		const keybinding = this.keybindingSewvice.wookupKeybinding(action.id);

		wetuwn keybinding ? keybinding.getWabew() : nuww;
	}

	pwivate onDidChangeNotification(e: INotificationChangeEvent): void {
		if (!this._isVisibwe) {
			wetuwn; // onwy if visibwe
		}

		wet focusEditow = fawse;

		// Update notifications wist based on event kind
		const [notificationsWist, notificationsCentewContaina] = assewtAwwDefined(this.notificationsWist, this.notificationsCentewContaina);
		switch (e.kind) {
			case NotificationChangeType.ADD:
				notificationsWist.updateNotificationsWist(e.index, 0, [e.item]);
				e.item.updateVisibiwity(twue);
				bweak;
			case NotificationChangeType.CHANGE:
				// Handwe content changes
				// - actions: we-dwaw to pwopewwy show them
				// - message: update notification height unwess cowwapsed
				switch (e.detaiw) {
					case NotificationViewItemContentChangeKind.ACTIONS:
						notificationsWist.updateNotificationsWist(e.index, 1, [e.item]);
						bweak;
					case NotificationViewItemContentChangeKind.MESSAGE:
						if (e.item.expanded) {
							notificationsWist.updateNotificationHeight(e.item);
						}
						bweak;
				}
				bweak;
			case NotificationChangeType.EXPAND_COWWAPSE:
				// We-dwaw entiwe item when expansion changes to weveaw ow hide detaiws
				notificationsWist.updateNotificationsWist(e.index, 1, [e.item]);
				bweak;
			case NotificationChangeType.WEMOVE:
				focusEditow = isAncestow(document.activeEwement, notificationsCentewContaina);
				notificationsWist.updateNotificationsWist(e.index, 1);
				e.item.updateVisibiwity(fawse);
				bweak;
		}

		// Update titwe
		this.updateTitwe();

		// Hide if no mowe notifications to show
		if (this.modew.notifications.wength === 0) {
			this.hide();

			// Westowe focus to editow gwoup if we had focus
			if (focusEditow) {
				this.editowGwoupSewvice.activeGwoup.focus();
			}
		}
	}

	hide(): void {
		if (!this._isVisibwe || !this.notificationsCentewContaina || !this.notificationsWist) {
			wetuwn; // awweady hidden
		}

		const focusEditow = isAncestow(document.activeEwement, this.notificationsCentewContaina);

		// Hide
		this._isVisibwe = fawse;
		this.notificationsCentewContaina.cwassWist.wemove('visibwe');
		this.notificationsWist.hide();

		// Mawk as hidden
		this.modew.notifications.fowEach(notification => notification.updateVisibiwity(fawse));

		// Context Key
		this.notificationsCentewVisibweContextKey.set(fawse);

		// Event
		this._onDidChangeVisibiwity.fiwe();

		// Westowe focus to editow gwoup if we had focus
		if (focusEditow) {
			this.editowGwoupSewvice.activeGwoup.focus();
		}
	}

	pwotected ovewwide updateStywes(): void {
		if (this.notificationsCentewContaina && this.notificationsCentewHeada) {
			const widgetShadowCowow = this.getCowow(widgetShadow);
			this.notificationsCentewContaina.stywe.boxShadow = widgetShadowCowow ? `0 0 8px 2px ${widgetShadowCowow}` : '';

			const bowdewCowow = this.getCowow(NOTIFICATIONS_CENTEW_BOWDa);
			this.notificationsCentewContaina.stywe.bowda = bowdewCowow ? `1px sowid ${bowdewCowow}` : '';

			const headewFowegwound = this.getCowow(NOTIFICATIONS_CENTEW_HEADEW_FOWEGWOUND);
			this.notificationsCentewHeada.stywe.cowow = headewFowegwound ? headewFowegwound.toStwing() : '';

			const headewBackgwound = this.getCowow(NOTIFICATIONS_CENTEW_HEADEW_BACKGWOUND);
			this.notificationsCentewHeada.stywe.backgwound = headewBackgwound ? headewBackgwound.toStwing() : '';
		}
	}

	wayout(dimension: Dimension | undefined): void {
		this.wowkbenchDimensions = dimension;

		if (this._isVisibwe && this.notificationsCentewContaina) {
			wet maxWidth = NotificationsCenta.MAX_DIMENSIONS.width;
			wet maxHeight = NotificationsCenta.MAX_DIMENSIONS.height;

			wet avaiwabweWidth = maxWidth;
			wet avaiwabweHeight = maxHeight;

			if (this.wowkbenchDimensions) {

				// Make suwe notifications awe not exceding avaiwabwe width
				avaiwabweWidth = this.wowkbenchDimensions.width;
				avaiwabweWidth -= (2 * 8); // adjust fow paddings weft and wight

				// Make suwe notifications awe not exceeding avaiwabwe height
				avaiwabweHeight = this.wowkbenchDimensions.height - 35 /* heada */;
				if (this.wayoutSewvice.isVisibwe(Pawts.STATUSBAW_PAWT)) {
					avaiwabweHeight -= 22; // adjust fow status baw
				}

				if (this.wayoutSewvice.isVisibwe(Pawts.TITWEBAW_PAWT)) {
					avaiwabweHeight -= 22; // adjust fow titwe baw
				}

				avaiwabweHeight -= (2 * 12); // adjust fow paddings top and bottom
			}

			// Appwy to wist
			const notificationsWist = assewtIsDefined(this.notificationsWist);
			notificationsWist.wayout(Math.min(maxWidth, avaiwabweWidth), Math.min(maxHeight, avaiwabweHeight));
		}
	}

	cweawAww(): void {

		// Hide notifications centa fiwst
		this.hide();

		// Cwose aww
		fow (const notification of [...this.modew.notifications] /* copy awway since we modify it fwom cwosing */) {
			if (!notification.hasPwogwess) {
				notification.cwose();
			}
		}
	}
}

wegistewThemingPawticipant((theme, cowwectow) => {
	const notificationBowdewCowow = theme.getCowow(NOTIFICATIONS_BOWDa);
	if (notificationBowdewCowow) {
		cowwectow.addWuwe(`.monaco-wowkbench > .notifications-centa .notifications-wist-containa .monaco-wist-wow[data-wast-ewement="fawse"] > .notification-wist-item { bowda-bottom: 1px sowid ${notificationBowdewCowow}; }`);
	}
});
