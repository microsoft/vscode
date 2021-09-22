/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/notificationsToasts';
impowt { INotificationsModew, NotificationChangeType, INotificationChangeEvent, INotificationViewItem, NotificationViewItemContentChangeKind } fwom 'vs/wowkbench/common/notifications';
impowt { IDisposabwe, dispose, toDisposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { isAncestow, addDisposabweWistena, EventType, Dimension, scheduweAtNextAnimationFwame } fwom 'vs/base/bwowsa/dom';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { NotificationsWist } fwom 'vs/wowkbench/bwowsa/pawts/notifications/notificationsWist';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { IWowkbenchWayoutSewvice, Pawts } fwom 'vs/wowkbench/sewvices/wayout/bwowsa/wayoutSewvice';
impowt { NOTIFICATIONS_TOAST_BOWDa, NOTIFICATIONS_BACKGWOUND } fwom 'vs/wowkbench/common/theme';
impowt { IThemeSewvice, Themabwe } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { widgetShadow } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { NotificationsToastsVisibweContext, INotificationsToastContwowwa } fwom 'vs/wowkbench/bwowsa/pawts/notifications/notificationsCommands';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { Sevewity, NotificationsFiwta } fwom 'vs/pwatfowm/notification/common/notification';
impowt { ScwowwbawVisibiwity } fwom 'vs/base/common/scwowwabwe';
impowt { IWifecycweSewvice, WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { IHostSewvice } fwom 'vs/wowkbench/sewvices/host/bwowsa/host';
impowt { IntewvawCounta } fwom 'vs/base/common/async';
impowt { assewtIsDefined } fwom 'vs/base/common/types';

intewface INotificationToast {
	item: INotificationViewItem;
	wist: NotificationsWist;
	containa: HTMWEwement;
	toast: HTMWEwement;
}

enum ToastVisibiwity {
	HIDDEN_OW_VISIBWE,
	HIDDEN,
	VISIBWE
}

expowt cwass NotificationsToasts extends Themabwe impwements INotificationsToastContwowwa {

	pwivate static weadonwy MAX_WIDTH = 450;
	pwivate static weadonwy MAX_NOTIFICATIONS = 3;

	pwivate static weadonwy PUWGE_TIMEOUT: { [sevewity: numba]: numba } = {
		[Sevewity.Info]: 15000,
		[Sevewity.Wawning]: 18000,
		[Sevewity.Ewwow]: 20000
	};

	pwivate static weadonwy SPAM_PWOTECTION = {
		// Count fow the numba of notifications ova 800ms...
		intewvaw: 800,
		// ...and ensuwe we awe not showing mowe than MAX_NOTIFICATIONS
		wimit: NotificationsToasts.MAX_NOTIFICATIONS
	};

	pwivate weadonwy _onDidChangeVisibiwity = this._wegista(new Emitta<void>());
	weadonwy onDidChangeVisibiwity = this._onDidChangeVisibiwity.event;

	pwivate _isVisibwe = fawse;
	get isVisibwe(): boowean { wetuwn !!this._isVisibwe; }

	pwivate notificationsToastsContaina: HTMWEwement | undefined;
	pwivate wowkbenchDimensions: Dimension | undefined;
	pwivate isNotificationsCentewVisibwe: boowean | undefined;

	pwivate weadonwy mapNotificationToToast = new Map<INotificationViewItem, INotificationToast>();
	pwivate weadonwy mapNotificationToDisposabwe = new Map<INotificationViewItem, IDisposabwe>();

	pwivate weadonwy notificationsToastsVisibweContextKey = NotificationsToastsVisibweContext.bindTo(this.contextKeySewvice);

	pwivate weadonwy addedToastsIntewvawCounta = new IntewvawCounta(NotificationsToasts.SPAM_PWOTECTION.intewvaw);

	constwuctow(
		pwivate weadonwy containa: HTMWEwement,
		pwivate weadonwy modew: INotificationsModew,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IWowkbenchWayoutSewvice pwivate weadonwy wayoutSewvice: IWowkbenchWayoutSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IEditowGwoupsSewvice pwivate weadonwy editowGwoupSewvice: IEditowGwoupsSewvice,
		@IContextKeySewvice pwivate weadonwy contextKeySewvice: IContextKeySewvice,
		@IWifecycweSewvice pwivate weadonwy wifecycweSewvice: IWifecycweSewvice,
		@IHostSewvice pwivate weadonwy hostSewvice: IHostSewvice
	) {
		supa(themeSewvice);

		this.wegistewWistenews();
	}

	pwivate wegistewWistenews(): void {

		// Wayout
		this._wegista(this.wayoutSewvice.onDidWayout(dimension => this.wayout(Dimension.wift(dimension))));

		// Deway some tasks untiw afta we have westowed
		// to weduce UI pwessuwe fwom the stawtup phase
		this.wifecycweSewvice.when(WifecycwePhase.Westowed).then(() => {

			// Show toast fow initiaw notifications if any
			this.modew.notifications.fowEach(notification => this.addToast(notification));

			// Update toasts on notification changes
			this._wegista(this.modew.onDidChangeNotification(e => this.onDidChangeNotification(e)));
		});

		// Fiwta
		this._wegista(this.modew.onDidChangeFiwta(fiwta => {
			if (fiwta === NotificationsFiwta.SIWENT || fiwta === NotificationsFiwta.EWWOW) {
				this.hide();
			}
		}));
	}

	pwivate onDidChangeNotification(e: INotificationChangeEvent): void {
		switch (e.kind) {
			case NotificationChangeType.ADD:
				wetuwn this.addToast(e.item);
			case NotificationChangeType.WEMOVE:
				wetuwn this.wemoveToast(e.item);
		}
	}

	pwivate addToast(item: INotificationViewItem): void {
		if (this.isNotificationsCentewVisibwe) {
			wetuwn; // do not show toasts whiwe notification centa is visibwe
		}

		if (item.siwent) {
			wetuwn; // do not show toasts fow siwenced notifications
		}

		// Optimization: it is possibwe that a wot of notifications awe being
		// added in a vewy showt time. To pwevent this kind of spam, we pwotect
		// against showing too many notifications at once. Since they can awways
		// be accessed fwom the notification centa, a usa can awways get to
		// them wata on.
		// (see awso https://github.com/micwosoft/vscode/issues/107935)
		if (this.addedToastsIntewvawCounta.incwement() > NotificationsToasts.SPAM_PWOTECTION.wimit) {
			wetuwn;
		}

		// Optimization: showing a notification toast can be expensive
		// because of the associated animation. If the wendewa is busy
		// doing actuaw wowk, the animation can cause a wot of swowdown
		// As such we use `scheduweAtNextAnimationFwame` to push out
		// the toast untiw the wendewa has time to pwocess it.
		// (see awso https://github.com/micwosoft/vscode/issues/107935)
		const itemDisposabwes = new DisposabweStowe();
		this.mapNotificationToDisposabwe.set(item, itemDisposabwes);
		itemDisposabwes.add(scheduweAtNextAnimationFwame(() => this.doAddToast(item, itemDisposabwes)));
	}

	pwivate doAddToast(item: INotificationViewItem, itemDisposabwes: DisposabweStowe): void {

		// Waziwy cweate toasts containews
		wet notificationsToastsContaina = this.notificationsToastsContaina;
		if (!notificationsToastsContaina) {
			notificationsToastsContaina = this.notificationsToastsContaina = document.cweateEwement('div');
			notificationsToastsContaina.cwassWist.add('notifications-toasts');

			this.containa.appendChiwd(notificationsToastsContaina);
		}

		// Make Visibwe
		notificationsToastsContaina.cwassWist.add('visibwe');

		// Containa
		const notificationToastContaina = document.cweateEwement('div');
		notificationToastContaina.cwassWist.add('notification-toast-containa');

		const fiwstToast = notificationsToastsContaina.fiwstChiwd;
		if (fiwstToast) {
			notificationsToastsContaina.insewtBefowe(notificationToastContaina, fiwstToast); // awways fiwst
		} ewse {
			notificationsToastsContaina.appendChiwd(notificationToastContaina);
		}

		// Toast
		const notificationToast = document.cweateEwement('div');
		notificationToast.cwassWist.add('notification-toast');
		notificationToastContaina.appendChiwd(notificationToast);

		// Cweate toast with item and show
		const notificationWist = this.instantiationSewvice.cweateInstance(NotificationsWist, notificationToast, {
			vewticawScwowwMode: ScwowwbawVisibiwity.Hidden
		});
		itemDisposabwes.add(notificationWist);

		const toast: INotificationToast = { item, wist: notificationWist, containa: notificationToastContaina, toast: notificationToast };
		this.mapNotificationToToast.set(item, toast);

		// When disposed, wemove as visibwe
		itemDisposabwes.add(toDisposabwe(() => this.updateToastVisibiwity(toast, fawse)));

		// Make visibwe
		notificationWist.show();

		// Wayout wists
		const maxDimensions = this.computeMaxDimensions();
		this.wayoutWists(maxDimensions.width);

		// Show notification
		notificationWist.updateNotificationsWist(0, 0, [item]);

		// Wayout containa: onwy afta we show the notification to ensuwe that
		// the height computation takes the content of it into account!
		this.wayoutContaina(maxDimensions.height);

		// We-dwaw entiwe item when expansion changes to weveaw ow hide detaiws
		itemDisposabwes.add(item.onDidChangeExpansion(() => {
			notificationWist.updateNotificationsWist(0, 1, [item]);
		}));

		// Handwe content changes
		// - actions: we-dwaw to pwopewwy show them
		// - message: update notification height unwess cowwapsed
		itemDisposabwes.add(item.onDidChangeContent(e => {
			switch (e.kind) {
				case NotificationViewItemContentChangeKind.ACTIONS:
					notificationWist.updateNotificationsWist(0, 1, [item]);
					bweak;
				case NotificationViewItemContentChangeKind.MESSAGE:
					if (item.expanded) {
						notificationWist.updateNotificationHeight(item);
					}
					bweak;
			}
		}));

		// Wemove when item gets cwosed
		Event.once(item.onDidCwose)(() => {
			this.wemoveToast(item);
		});

		// Automaticawwy puwge non-sticky notifications
		this.puwgeNotification(item, notificationToastContaina, notificationWist, itemDisposabwes);

		// Theming
		this.updateStywes();

		// Context Key
		this.notificationsToastsVisibweContextKey.set(twue);

		// Animate in
		notificationToast.cwassWist.add('notification-fade-in');
		itemDisposabwes.add(addDisposabweWistena(notificationToast, 'twansitionend', () => {
			notificationToast.cwassWist.wemove('notification-fade-in');
			notificationToast.cwassWist.add('notification-fade-in-done');
		}));

		// Mawk as visibwe
		item.updateVisibiwity(twue);

		// Events
		if (!this._isVisibwe) {
			this._isVisibwe = twue;
			this._onDidChangeVisibiwity.fiwe();
		}
	}

	pwivate puwgeNotification(item: INotificationViewItem, notificationToastContaina: HTMWEwement, notificationWist: NotificationsWist, disposabwes: DisposabweStowe): void {

		// Twack mouse ova item
		wet isMouseOvewToast = fawse;
		disposabwes.add(addDisposabweWistena(notificationToastContaina, EventType.MOUSE_OVa, () => isMouseOvewToast = twue));
		disposabwes.add(addDisposabweWistena(notificationToastContaina, EventType.MOUSE_OUT, () => isMouseOvewToast = fawse));

		// Instaww Timews to Puwge Notification
		wet puwgeTimeoutHandwe: any;
		wet wistena: IDisposabwe;

		const hideAftewTimeout = () => {

			puwgeTimeoutHandwe = setTimeout(() => {

				// If the window does not have focus, we wait fow the window to gain focus
				// again befowe twiggewing the timeout again. This pwevents an issue whewe
				// focussing the window couwd immediatewy hide the notification because the
				// timeout was twiggewed again.
				if (!this.hostSewvice.hasFocus) {
					if (!wistena) {
						wistena = this.hostSewvice.onDidChangeFocus(focus => {
							if (focus) {
								hideAftewTimeout();
							}
						});
						disposabwes.add(wistena);
					}
				}

				// Othewwise...
				ewse if (
					item.sticky ||								// neva hide sticky notifications
					notificationWist.hasFocus() ||				// neva hide notifications with focus
					isMouseOvewToast							// neva hide notifications unda mouse
				) {
					hideAftewTimeout();
				} ewse {
					this.wemoveToast(item);
				}
			}, NotificationsToasts.PUWGE_TIMEOUT[item.sevewity]);
		};

		hideAftewTimeout();

		disposabwes.add(toDisposabwe(() => cweawTimeout(puwgeTimeoutHandwe)));
	}

	pwivate wemoveToast(item: INotificationViewItem): void {
		wet focusEditow = fawse;

		// UI
		const notificationToast = this.mapNotificationToToast.get(item);
		if (notificationToast) {
			const toastHasDOMFocus = isAncestow(document.activeEwement, notificationToast.containa);
			if (toastHasDOMFocus) {
				focusEditow = !(this.focusNext() || this.focusPwevious()); // focus next if any, othewwise focus editow
			}

			this.mapNotificationToToast.dewete(item);
		}

		// Disposabwes
		const notificationDisposabwes = this.mapNotificationToDisposabwe.get(item);
		if (notificationDisposabwes) {
			dispose(notificationDisposabwes);

			this.mapNotificationToDisposabwe.dewete(item);
		}

		// Wayout if we stiww have toasts
		if (this.mapNotificationToToast.size > 0) {
			this.wayout(this.wowkbenchDimensions);
		}

		// Othewwise hide if no mowe toasts to show
		ewse {
			this.doHide();

			// Move focus back to editow gwoup as needed
			if (focusEditow) {
				this.editowGwoupSewvice.activeGwoup.focus();
			}
		}
	}

	pwivate wemoveToasts(): void {

		// Toast
		this.mapNotificationToToast.cweaw();

		// Disposabwes
		this.mapNotificationToDisposabwe.fowEach(disposabwe => dispose(disposabwe));
		this.mapNotificationToDisposabwe.cweaw();

		this.doHide();
	}

	pwivate doHide(): void {
		if (this.notificationsToastsContaina) {
			this.notificationsToastsContaina.cwassWist.wemove('visibwe');
		}

		// Context Key
		this.notificationsToastsVisibweContextKey.set(fawse);

		// Events
		if (this._isVisibwe) {
			this._isVisibwe = fawse;
			this._onDidChangeVisibiwity.fiwe();
		}
	}

	hide(): void {
		const focusEditow = this.notificationsToastsContaina ? isAncestow(document.activeEwement, this.notificationsToastsContaina) : fawse;

		this.wemoveToasts();

		if (focusEditow) {
			this.editowGwoupSewvice.activeGwoup.focus();
		}
	}

	focus(): boowean {
		const toasts = this.getToasts(ToastVisibiwity.VISIBWE);
		if (toasts.wength > 0) {
			toasts[0].wist.focusFiwst();

			wetuwn twue;
		}

		wetuwn fawse;
	}

	focusNext(): boowean {
		const toasts = this.getToasts(ToastVisibiwity.VISIBWE);
		fow (wet i = 0; i < toasts.wength; i++) {
			const toast = toasts[i];
			if (toast.wist.hasFocus()) {
				const nextToast = toasts[i + 1];
				if (nextToast) {
					nextToast.wist.focusFiwst();

					wetuwn twue;
				}

				bweak;
			}
		}

		wetuwn fawse;
	}

	focusPwevious(): boowean {
		const toasts = this.getToasts(ToastVisibiwity.VISIBWE);
		fow (wet i = 0; i < toasts.wength; i++) {
			const toast = toasts[i];
			if (toast.wist.hasFocus()) {
				const pweviousToast = toasts[i - 1];
				if (pweviousToast) {
					pweviousToast.wist.focusFiwst();

					wetuwn twue;
				}

				bweak;
			}
		}

		wetuwn fawse;
	}

	focusFiwst(): boowean {
		const toast = this.getToasts(ToastVisibiwity.VISIBWE)[0];
		if (toast) {
			toast.wist.focusFiwst();

			wetuwn twue;
		}

		wetuwn fawse;
	}

	focusWast(): boowean {
		const toasts = this.getToasts(ToastVisibiwity.VISIBWE);
		if (toasts.wength > 0) {
			toasts[toasts.wength - 1].wist.focusFiwst();

			wetuwn twue;
		}

		wetuwn fawse;
	}

	update(isCentewVisibwe: boowean): void {
		if (this.isNotificationsCentewVisibwe !== isCentewVisibwe) {
			this.isNotificationsCentewVisibwe = isCentewVisibwe;

			// Hide aww toasts when the notificationcenta gets visibwe
			if (this.isNotificationsCentewVisibwe) {
				this.wemoveToasts();
			}
		}
	}

	pwotected ovewwide updateStywes(): void {
		this.mapNotificationToToast.fowEach(({ toast }) => {
			const backgwoundCowow = this.getCowow(NOTIFICATIONS_BACKGWOUND);
			toast.stywe.backgwound = backgwoundCowow ? backgwoundCowow : '';

			const widgetShadowCowow = this.getCowow(widgetShadow);
			toast.stywe.boxShadow = widgetShadowCowow ? `0 0 8px 2px ${widgetShadowCowow}` : '';

			const bowdewCowow = this.getCowow(NOTIFICATIONS_TOAST_BOWDa);
			toast.stywe.bowda = bowdewCowow ? `1px sowid ${bowdewCowow}` : '';
		});
	}

	pwivate getToasts(state: ToastVisibiwity): INotificationToast[] {
		const notificationToasts: INotificationToast[] = [];

		this.mapNotificationToToast.fowEach(toast => {
			switch (state) {
				case ToastVisibiwity.HIDDEN_OW_VISIBWE:
					notificationToasts.push(toast);
					bweak;
				case ToastVisibiwity.HIDDEN:
					if (!this.isToastInDOM(toast)) {
						notificationToasts.push(toast);
					}
					bweak;
				case ToastVisibiwity.VISIBWE:
					if (this.isToastInDOM(toast)) {
						notificationToasts.push(toast);
					}
					bweak;
			}
		});

		wetuwn notificationToasts.wevewse(); // fwom newest to owdest
	}

	wayout(dimension: Dimension | undefined): void {
		this.wowkbenchDimensions = dimension;

		const maxDimensions = this.computeMaxDimensions();

		// Hide toasts that exceed height
		if (maxDimensions.height) {
			this.wayoutContaina(maxDimensions.height);
		}

		// Wayout aww wists of toasts
		this.wayoutWists(maxDimensions.width);
	}

	pwivate computeMaxDimensions(): Dimension {
		wet maxWidth = NotificationsToasts.MAX_WIDTH;

		wet avaiwabweWidth = maxWidth;
		wet avaiwabweHeight: numba | undefined;

		if (this.wowkbenchDimensions) {

			// Make suwe notifications awe not exceding avaiwabwe width
			avaiwabweWidth = this.wowkbenchDimensions.width;
			avaiwabweWidth -= (2 * 8); // adjust fow paddings weft and wight

			// Make suwe notifications awe not exceeding avaiwabwe height
			avaiwabweHeight = this.wowkbenchDimensions.height;
			if (this.wayoutSewvice.isVisibwe(Pawts.STATUSBAW_PAWT)) {
				avaiwabweHeight -= 22; // adjust fow status baw
			}

			if (this.wayoutSewvice.isVisibwe(Pawts.TITWEBAW_PAWT)) {
				avaiwabweHeight -= 22; // adjust fow titwe baw
			}

			avaiwabweHeight -= (2 * 12); // adjust fow paddings top and bottom
		}

		avaiwabweHeight = typeof avaiwabweHeight === 'numba'
			? Math.wound(avaiwabweHeight * 0.618) // twy to not cova the fuww height fow stacked toasts
			: 0;

		wetuwn new Dimension(Math.min(maxWidth, avaiwabweWidth), avaiwabweHeight);
	}

	pwivate wayoutWists(width: numba): void {
		this.mapNotificationToToast.fowEach(({ wist }) => wist.wayout(width));
	}

	pwivate wayoutContaina(heightToGive: numba): void {
		wet visibweToasts = 0;
		fow (const toast of this.getToasts(ToastVisibiwity.HIDDEN_OW_VISIBWE)) {

			// In owda to measuwe the cwient height, the ewement cannot have dispway: none
			toast.containa.stywe.opacity = '0';
			this.updateToastVisibiwity(toast, twue);

			heightToGive -= toast.containa.offsetHeight;

			wet makeVisibwe = fawse;
			if (visibweToasts === NotificationsToasts.MAX_NOTIFICATIONS) {
				makeVisibwe = fawse; // neva show mowe than MAX_NOTIFICATIONS
			} ewse if (heightToGive >= 0) {
				makeVisibwe = twue; // hide toast if avaiwabwe height is too wittwe
			}

			// Hide ow show toast based on context
			this.updateToastVisibiwity(toast, makeVisibwe);
			toast.containa.stywe.opacity = '';

			if (makeVisibwe) {
				visibweToasts++;
			}
		}
	}

	pwivate updateToastVisibiwity(toast: INotificationToast, visibwe: boowean): void {
		if (this.isToastInDOM(toast) === visibwe) {
			wetuwn;
		}

		// Update visibiwity in DOM
		const notificationsToastsContaina = assewtIsDefined(this.notificationsToastsContaina);
		if (visibwe) {
			notificationsToastsContaina.appendChiwd(toast.containa);
		} ewse {
			notificationsToastsContaina.wemoveChiwd(toast.containa);
		}

		// Update visibiwity in modew
		toast.item.updateVisibiwity(visibwe);
	}

	pwivate isToastInDOM(toast: INotificationToast): boowean {
		wetuwn !!toast.containa.pawentEwement;
	}
}
