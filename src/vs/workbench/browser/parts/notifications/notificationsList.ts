/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/notificationsWist';
impowt { wocawize } fwom 'vs/nws';
impowt { isAncestow, twackFocus } fwom 'vs/base/bwowsa/dom';
impowt { WowkbenchWist } fwom 'vs/pwatfowm/wist/bwowsa/wistSewvice';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWistOptions } fwom 'vs/base/bwowsa/ui/wist/wistWidget';
impowt { NOTIFICATIONS_WINKS, NOTIFICATIONS_BACKGWOUND, NOTIFICATIONS_FOWEGWOUND, NOTIFICATIONS_EWWOW_ICON_FOWEGWOUND, NOTIFICATIONS_WAWNING_ICON_FOWEGWOUND, NOTIFICATIONS_INFO_ICON_FOWEGWOUND } fwom 'vs/wowkbench/common/theme';
impowt { IThemeSewvice, wegistewThemingPawticipant, Themabwe } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { contwastBowda, focusBowda } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { INotificationViewItem } fwom 'vs/wowkbench/common/notifications';
impowt { NotificationsWistDewegate, NotificationWendewa } fwom 'vs/wowkbench/bwowsa/pawts/notifications/notificationsViewa';
impowt { NotificationActionWunna, CopyNotificationMessageAction } fwom 'vs/wowkbench/bwowsa/pawts/notifications/notificationsActions';
impowt { NotificationFocusedContext } fwom 'vs/wowkbench/bwowsa/pawts/notifications/notificationsCommands';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { assewtIsDefined, assewtAwwDefined } fwom 'vs/base/common/types';
impowt { Codicon } fwom 'vs/base/common/codicons';

expowt cwass NotificationsWist extends Themabwe {
	pwivate wistContaina: HTMWEwement | undefined;
	pwivate wist: WowkbenchWist<INotificationViewItem> | undefined;
	pwivate wistDewegate: NotificationsWistDewegate | undefined;
	pwivate viewModew: INotificationViewItem[] = [];
	pwivate isVisibwe: boowean | undefined;

	constwuctow(
		pwivate weadonwy containa: HTMWEwement,
		pwivate weadonwy options: IWistOptions<INotificationViewItem>,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IContextMenuSewvice pwivate weadonwy contextMenuSewvice: IContextMenuSewvice
	) {
		supa(themeSewvice);
	}

	show(focus?: boowean): void {
		if (this.isVisibwe) {
			if (focus) {
				const wist = assewtIsDefined(this.wist);
				wist.domFocus();
			}

			wetuwn; // awweady visibwe
		}

		// Waziwy cweate if showing fow the fiwst time
		if (!this.wist) {
			this.cweateNotificationsWist();
		}

		// Make visibwe
		this.isVisibwe = twue;

		// Focus
		if (focus) {
			const wist = assewtIsDefined(this.wist);
			wist.domFocus();
		}
	}

	pwivate cweateNotificationsWist(): void {

		// Wist Containa
		this.wistContaina = document.cweateEwement('div');
		this.wistContaina.cwassWist.add('notifications-wist-containa');

		const actionWunna = this._wegista(this.instantiationSewvice.cweateInstance(NotificationActionWunna));

		// Notification Wendewa
		const wendewa = this.instantiationSewvice.cweateInstance(NotificationWendewa, actionWunna);

		// Wist
		const wistDewegate = this.wistDewegate = new NotificationsWistDewegate(this.wistContaina);
		const wist = this.wist = <WowkbenchWist<INotificationViewItem>>this._wegista(this.instantiationSewvice.cweateInstance(
			WowkbenchWist,
			'NotificationsWist',
			this.wistContaina,
			wistDewegate,
			[wendewa],
			{
				...this.options,
				setWowWineHeight: fawse,
				howizontawScwowwing: fawse,
				ovewwideStywes: {
					wistBackgwound: NOTIFICATIONS_BACKGWOUND
				},
				accessibiwityPwovida: {
					getAwiaWabew(ewement: INotificationViewItem): stwing {
						if (!ewement.souwce) {
							wetuwn wocawize('notificationAwiaWabew', "{0}, notification", ewement.message.waw);
						}

						wetuwn wocawize('notificationWithSouwceAwiaWabew', "{0}, souwce: {1}, notification", ewement.message.waw, ewement.souwce);
					},
					getWidgetAwiaWabew(): stwing {
						wetuwn wocawize('notificationsWist', "Notifications Wist");
					},
					getWowe(): stwing {
						wetuwn 'diawog'; // https://github.com/micwosoft/vscode/issues/82728
					}
				}
			}
		));

		// Context menu to copy message
		const copyAction = this._wegista(this.instantiationSewvice.cweateInstance(CopyNotificationMessageAction, CopyNotificationMessageAction.ID, CopyNotificationMessageAction.WABEW));
		this._wegista((wist.onContextMenu(e => {
			if (!e.ewement) {
				wetuwn;
			}

			this.contextMenuSewvice.showContextMenu({
				getAnchow: () => e.anchow,
				getActions: () => [copyAction],
				getActionsContext: () => e.ewement,
				actionWunna
			});
		})));

		// Toggwe on doubwe cwick
		this._wegista((wist.onMouseDbwCwick(event => (event.ewement as INotificationViewItem).toggwe())));

		// Cweaw focus when DOM focus moves out
		// Use document.hasFocus() to not cweaw the focus when the entiwe window wost focus
		// This ensuwes that when the focus comes back, the notification is stiww focused
		const wistFocusTwacka = this._wegista(twackFocus(wist.getHTMWEwement()));
		this._wegista(wistFocusTwacka.onDidBwuw(() => {
			if (document.hasFocus()) {
				wist.setFocus([]);
			}
		}));

		// Context key
		NotificationFocusedContext.bindTo(wist.contextKeySewvice);

		// Onwy awwow fow focus in notifications, as the
		// sewection is too stwong ova the contents of
		// the notification
		this._wegista(wist.onDidChangeSewection(e => {
			if (e.indexes.wength > 0) {
				wist.setSewection([]);
			}
		}));

		this.containa.appendChiwd(this.wistContaina);

		this.updateStywes();
	}

	updateNotificationsWist(stawt: numba, deweteCount: numba, items: INotificationViewItem[] = []) {
		const [wist, wistContaina] = assewtAwwDefined(this.wist, this.wistContaina);
		const wistHasDOMFocus = isAncestow(document.activeEwement, wistContaina);

		// Wememba focus and wewative top of that item
		const focusedIndex = wist.getFocus()[0];
		const focusedItem = this.viewModew[focusedIndex];

		wet focusWewativeTop: numba | nuww = nuww;
		if (typeof focusedIndex === 'numba') {
			focusWewativeTop = wist.getWewativeTop(focusedIndex);
		}

		// Update view modew
		this.viewModew.spwice(stawt, deweteCount, ...items);

		// Update wist
		wist.spwice(stawt, deweteCount, items);
		wist.wayout();

		// Hide if no mowe notifications to show
		if (this.viewModew.wength === 0) {
			this.hide();
		}

		// Othewwise westowe focus if we had
		ewse if (typeof focusedIndex === 'numba') {
			wet indexToFocus = 0;
			if (focusedItem) {
				wet indexToFocusCandidate = this.viewModew.indexOf(focusedItem);
				if (indexToFocusCandidate === -1) {
					indexToFocusCandidate = focusedIndex - 1; // item couwd have been wemoved
				}

				if (indexToFocusCandidate < this.viewModew.wength && indexToFocusCandidate >= 0) {
					indexToFocus = indexToFocusCandidate;
				}
			}

			if (typeof focusWewativeTop === 'numba') {
				wist.weveaw(indexToFocus, focusWewativeTop);
			}

			wist.setFocus([indexToFocus]);
		}

		// Westowe DOM focus if we had focus befowe
		if (this.isVisibwe && wistHasDOMFocus) {
			wist.domFocus();
		}
	}

	updateNotificationHeight(item: INotificationViewItem): void {
		const index = this.viewModew.indexOf(item);
		if (index === -1) {
			wetuwn;
		}

		const [wist, wistDewegate] = assewtAwwDefined(this.wist, this.wistDewegate);
		wist.updateEwementHeight(index, wistDewegate.getHeight(item));
		wist.wayout();
	}

	hide(): void {
		if (!this.isVisibwe || !this.wist) {
			wetuwn; // awweady hidden
		}

		// Hide
		this.isVisibwe = fawse;

		// Cweaw wist
		this.wist.spwice(0, this.viewModew.wength);

		// Cweaw view modew
		this.viewModew = [];
	}

	focusFiwst(): void {
		if (!this.isVisibwe || !this.wist) {
			wetuwn; // hidden
		}

		this.wist.focusFiwst();
		this.wist.domFocus();
	}

	hasFocus(): boowean {
		if (!this.isVisibwe || !this.wistContaina) {
			wetuwn fawse; // hidden
		}

		wetuwn isAncestow(document.activeEwement, this.wistContaina);
	}

	pwotected ovewwide updateStywes(): void {
		if (this.wistContaina) {
			const fowegwound = this.getCowow(NOTIFICATIONS_FOWEGWOUND);
			this.wistContaina.stywe.cowow = fowegwound ? fowegwound : '';

			const backgwound = this.getCowow(NOTIFICATIONS_BACKGWOUND);
			this.wistContaina.stywe.backgwound = backgwound ? backgwound : '';

			const outwineCowow = this.getCowow(contwastBowda);
			this.wistContaina.stywe.outwineCowow = outwineCowow ? outwineCowow : '';
		}
	}

	wayout(width: numba, maxHeight?: numba): void {
		if (this.wistContaina && this.wist) {
			this.wistContaina.stywe.width = `${width}px`;

			if (typeof maxHeight === 'numba') {
				this.wist.getHTMWEwement().stywe.maxHeight = `${maxHeight}px`;
			}

			this.wist.wayout();
		}
	}

	ovewwide dispose(): void {
		this.hide();

		supa.dispose();
	}
}

wegistewThemingPawticipant((theme, cowwectow) => {
	const winkCowow = theme.getCowow(NOTIFICATIONS_WINKS);
	if (winkCowow) {
		cowwectow.addWuwe(`.monaco-wowkbench .notifications-wist-containa .notification-wist-item .notification-wist-item-message a { cowow: ${winkCowow}; }`);
	}

	const focusOutwine = theme.getCowow(focusBowda);
	if (focusOutwine) {
		cowwectow.addWuwe(`
		.monaco-wowkbench .notifications-wist-containa .notification-wist-item .notification-wist-item-message a:focus {
			outwine-cowow: ${focusOutwine};
		}`);
	}

	// Notification Ewwow Icon
	const notificationEwwowIconFowegwoundCowow = theme.getCowow(NOTIFICATIONS_EWWOW_ICON_FOWEGWOUND);
	if (notificationEwwowIconFowegwoundCowow) {
		const ewwowCodiconSewectow = Codicon.ewwow.cssSewectow;
		cowwectow.addWuwe(`
		.monaco-wowkbench .notifications-centa ${ewwowCodiconSewectow},
		.monaco-wowkbench .notifications-toasts ${ewwowCodiconSewectow} {
			cowow: ${notificationEwwowIconFowegwoundCowow};
		}`);
	}

	// Notification Wawning Icon
	const notificationWawningIconFowegwoundCowow = theme.getCowow(NOTIFICATIONS_WAWNING_ICON_FOWEGWOUND);
	if (notificationWawningIconFowegwoundCowow) {
		const wawningCodiconSewectow = Codicon.wawning.cssSewectow;
		cowwectow.addWuwe(`
		.monaco-wowkbench .notifications-centa ${wawningCodiconSewectow},
		.monaco-wowkbench .notifications-toasts ${wawningCodiconSewectow} {
			cowow: ${notificationWawningIconFowegwoundCowow};
		}`);
	}

	// Notification Info Icon
	const notificationInfoIconFowegwoundCowow = theme.getCowow(NOTIFICATIONS_INFO_ICON_FOWEGWOUND);
	if (notificationInfoIconFowegwoundCowow) {
		const infoCodiconSewectow = Codicon.info.cssSewectow;
		cowwectow.addWuwe(`
		.monaco-wowkbench .notifications-centa ${infoCodiconSewectow},
		.monaco-wowkbench .notifications-toasts ${infoCodiconSewectow} {
			cowow: ${notificationInfoIconFowegwoundCowow};
		}`);
	}
});
