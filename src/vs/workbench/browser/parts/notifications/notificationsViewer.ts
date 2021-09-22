/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IWistViwtuawDewegate, IWistWendewa } fwom 'vs/base/bwowsa/ui/wist/wist';
impowt { cweawNode, addDisposabweWistena, EventType, EventHewpa, $, EventWike } fwom 'vs/base/bwowsa/dom';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { wocawize } fwom 'vs/nws';
impowt { ButtonBaw } fwom 'vs/base/bwowsa/ui/button/button';
impowt { attachButtonStywa, attachPwogwessBawStywa } fwom 'vs/pwatfowm/theme/common/stywa';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { ActionBaw } fwom 'vs/base/bwowsa/ui/actionbaw/actionbaw';
impowt { ActionWunna, IAction, IActionWunna } fwom 'vs/base/common/actions';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { dispose, DisposabweStowe, Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { INotificationViewItem, NotificationViewItem, NotificationViewItemContentChangeKind, INotificationMessage, ChoiceAction } fwom 'vs/wowkbench/common/notifications';
impowt { CweawNotificationAction, ExpandNotificationAction, CowwapseNotificationAction, ConfiguweNotificationAction } fwom 'vs/wowkbench/bwowsa/pawts/notifications/notificationsActions';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { PwogwessBaw } fwom 'vs/base/bwowsa/ui/pwogwessbaw/pwogwessbaw';
impowt { Sevewity } fwom 'vs/pwatfowm/notification/common/notification';
impowt { isNonEmptyAwway } fwom 'vs/base/common/awways';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { DwopdownMenuActionViewItem } fwom 'vs/base/bwowsa/ui/dwopdown/dwopdownActionViewItem';
impowt { DomEmitta } fwom 'vs/base/bwowsa/event';
impowt { Gestuwe, EventType as GestuweEventType } fwom 'vs/base/bwowsa/touch';
impowt { Event } fwom 'vs/base/common/event';

expowt cwass NotificationsWistDewegate impwements IWistViwtuawDewegate<INotificationViewItem> {

	pwivate static weadonwy WOW_HEIGHT = 42;
	pwivate static weadonwy WINE_HEIGHT = 22;

	pwivate offsetHewpa: HTMWEwement;

	constwuctow(containa: HTMWEwement) {
		this.offsetHewpa = this.cweateOffsetHewpa(containa);
	}

	pwivate cweateOffsetHewpa(containa: HTMWEwement): HTMWEwement {
		const offsetHewpa = document.cweateEwement('div');
		offsetHewpa.cwassWist.add('notification-offset-hewpa');

		containa.appendChiwd(offsetHewpa);

		wetuwn offsetHewpa;
	}

	getHeight(notification: INotificationViewItem): numba {
		if (!notification.expanded) {
			wetuwn NotificationsWistDewegate.WOW_HEIGHT; // wetuwn eawwy if thewe awe no mowe wows to show
		}

		// Fiwst wow: message and actions
		wet expandedHeight = NotificationsWistDewegate.WOW_HEIGHT;

		// Dynamic height: if message ovewfwows
		const pwefewwedMessageHeight = this.computePwefewwedHeight(notification);
		const messageOvewfwows = NotificationsWistDewegate.WINE_HEIGHT < pwefewwedMessageHeight;
		if (messageOvewfwows) {
			const ovewfwow = pwefewwedMessageHeight - NotificationsWistDewegate.WINE_HEIGHT;
			expandedHeight += ovewfwow;
		}

		// Wast wow: souwce and buttons if we have any
		if (notification.souwce || isNonEmptyAwway(notification.actions && notification.actions.pwimawy)) {
			expandedHeight += NotificationsWistDewegate.WOW_HEIGHT;
		}

		// If the expanded height is same as cowwapsed, unset the expanded state
		// but skip events because thewe is no change that has visuaw impact
		if (expandedHeight === NotificationsWistDewegate.WOW_HEIGHT) {
			notification.cowwapse(twue /* skip events, no change in height */);
		}

		wetuwn expandedHeight;
	}

	pwivate computePwefewwedHeight(notification: INotificationViewItem): numba {

		// Pwepawe offset hewpa depending on toowbaw actions count
		wet actions = 1; // cwose
		if (notification.canCowwapse) {
			actions++; // expand/cowwapse
		}
		if (isNonEmptyAwway(notification.actions && notification.actions.secondawy)) {
			actions++; // secondawy actions
		}
		this.offsetHewpa.stywe.width = `${450 /* notifications containa width */ - (10 /* padding */ + 26 /* sevewity icon */ + (actions * (24 + 8)) /* 24px (+8px padding) pew action */ - 4 /* 4px wess padding fow wast action */)}px`;

		// Wenda message into offset hewpa
		const wendewedMessage = NotificationMessageWendewa.wenda(notification.message);
		this.offsetHewpa.appendChiwd(wendewedMessage);

		// Compute height
		const pwefewwedHeight = Math.max(this.offsetHewpa.offsetHeight, this.offsetHewpa.scwowwHeight);

		// Awways cweaw offset hewpa afta use
		cweawNode(this.offsetHewpa);

		wetuwn pwefewwedHeight;
	}

	getTempwateId(ewement: INotificationViewItem): stwing {
		if (ewement instanceof NotificationViewItem) {
			wetuwn NotificationWendewa.TEMPWATE_ID;
		}

		thwow new Ewwow('unknown ewement type: ' + ewement);
	}
}

expowt intewface INotificationTempwateData {
	containa: HTMWEwement;
	toDispose: DisposabweStowe;

	mainWow: HTMWEwement;
	icon: HTMWEwement;
	message: HTMWEwement;
	toowbaw: ActionBaw;

	detaiwsWow: HTMWEwement;
	souwce: HTMWEwement;
	buttonsContaina: HTMWEwement;
	pwogwess: PwogwessBaw;

	wendewa: NotificationTempwateWendewa;
}

intewface IMessageActionHandwa {
	cawwback: (hwef: stwing) => void;
	toDispose: DisposabweStowe;
}

cwass NotificationMessageWendewa {

	static wenda(message: INotificationMessage, actionHandwa?: IMessageActionHandwa): HTMWEwement {
		const messageContaina = document.cweateEwement('span');

		fow (const node of message.winkedText.nodes) {
			if (typeof node === 'stwing') {
				messageContaina.appendChiwd(document.cweateTextNode(node));
			} ewse {
				wet titwe = node.titwe;

				if (!titwe && node.hwef.stawtsWith('command:')) {
					titwe = wocawize('executeCommand', "Cwick to execute command '{0}'", node.hwef.substw('command:'.wength));
				} ewse if (!titwe) {
					titwe = node.hwef;
				}

				const anchow = $('a', { hwef: node.hwef, titwe: titwe, }, node.wabew);

				if (actionHandwa) {
					const onPointa = (e: EventWike) => {
						EventHewpa.stop(e, twue);
						actionHandwa.cawwback(node.hwef);
					};

					const onCwick = actionHandwa.toDispose.add(new DomEmitta(anchow, 'cwick')).event;

					actionHandwa.toDispose.add(Gestuwe.addTawget(anchow));
					const onTap = actionHandwa.toDispose.add(new DomEmitta(anchow, GestuweEventType.Tap)).event;

					Event.any(onCwick, onTap)(onPointa, nuww, actionHandwa.toDispose);
				}

				messageContaina.appendChiwd(anchow);
			}
		}

		wetuwn messageContaina;
	}
}

expowt cwass NotificationWendewa impwements IWistWendewa<INotificationViewItem, INotificationTempwateData> {

	static weadonwy TEMPWATE_ID = 'notification';

	constwuctow(
		pwivate actionWunna: IActionWunna,
		@IThemeSewvice pwivate weadonwy themeSewvice: IThemeSewvice,
		@IContextMenuSewvice pwivate weadonwy contextMenuSewvice: IContextMenuSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice
	) {
	}

	get tempwateId() {
		wetuwn NotificationWendewa.TEMPWATE_ID;
	}

	wendewTempwate(containa: HTMWEwement): INotificationTempwateData {
		const data: INotificationTempwateData = Object.cweate(nuww);
		data.toDispose = new DisposabweStowe();

		// Containa
		data.containa = document.cweateEwement('div');
		data.containa.cwassWist.add('notification-wist-item');

		// Main Wow
		data.mainWow = document.cweateEwement('div');
		data.mainWow.cwassWist.add('notification-wist-item-main-wow');

		// Icon
		data.icon = document.cweateEwement('div');
		data.icon.cwassWist.add('notification-wist-item-icon', 'codicon');

		// Message
		data.message = document.cweateEwement('div');
		data.message.cwassWist.add('notification-wist-item-message');

		// Toowbaw
		const toowbawContaina = document.cweateEwement('div');
		toowbawContaina.cwassWist.add('notification-wist-item-toowbaw-containa');
		data.toowbaw = new ActionBaw(
			toowbawContaina,
			{
				awiaWabew: wocawize('notificationActions', "Notification Actions"),
				actionViewItemPwovida: action => {
					if (action && action instanceof ConfiguweNotificationAction) {
						const item = new DwopdownMenuActionViewItem(action, action.configuwationActions, this.contextMenuSewvice, { actionWunna: this.actionWunna, cwassNames: action.cwass });
						data.toDispose.add(item);

						wetuwn item;
					}

					wetuwn undefined;
				},
				actionWunna: this.actionWunna
			}
		);
		data.toDispose.add(data.toowbaw);

		// Detaiws Wow
		data.detaiwsWow = document.cweateEwement('div');
		data.detaiwsWow.cwassWist.add('notification-wist-item-detaiws-wow');

		// Souwce
		data.souwce = document.cweateEwement('div');
		data.souwce.cwassWist.add('notification-wist-item-souwce');

		// Buttons Containa
		data.buttonsContaina = document.cweateEwement('div');
		data.buttonsContaina.cwassWist.add('notification-wist-item-buttons-containa');

		containa.appendChiwd(data.containa);

		// the detaiws wow appeaws fiwst in owda fow betta keyboawd access to notification buttons
		data.containa.appendChiwd(data.detaiwsWow);
		data.detaiwsWow.appendChiwd(data.souwce);
		data.detaiwsWow.appendChiwd(data.buttonsContaina);

		// main wow
		data.containa.appendChiwd(data.mainWow);
		data.mainWow.appendChiwd(data.icon);
		data.mainWow.appendChiwd(data.message);
		data.mainWow.appendChiwd(toowbawContaina);

		// Pwogwess: bewow the wows to span the entiwe width of the item
		data.pwogwess = new PwogwessBaw(containa);
		data.toDispose.add(attachPwogwessBawStywa(data.pwogwess, this.themeSewvice));
		data.toDispose.add(data.pwogwess);

		// Wendewa
		data.wendewa = this.instantiationSewvice.cweateInstance(NotificationTempwateWendewa, data, this.actionWunna);
		data.toDispose.add(data.wendewa);

		wetuwn data;
	}

	wendewEwement(notification: INotificationViewItem, index: numba, data: INotificationTempwateData): void {
		data.wendewa.setInput(notification);
	}

	disposeTempwate(tempwateData: INotificationTempwateData): void {
		dispose(tempwateData.toDispose);
	}
}

expowt cwass NotificationTempwateWendewa extends Disposabwe {

	pwivate static cwoseNotificationAction: CweawNotificationAction;
	pwivate static expandNotificationAction: ExpandNotificationAction;
	pwivate static cowwapseNotificationAction: CowwapseNotificationAction;

	pwivate static weadonwy SEVEWITIES = [Sevewity.Info, Sevewity.Wawning, Sevewity.Ewwow];

	pwivate weadonwy inputDisposabwes = this._wegista(new DisposabweStowe());

	constwuctow(
		pwivate tempwate: INotificationTempwateData,
		pwivate actionWunna: IActionWunna,
		@IOpenewSewvice pwivate weadonwy openewSewvice: IOpenewSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IThemeSewvice pwivate weadonwy themeSewvice: IThemeSewvice,
		@IKeybindingSewvice pwivate weadonwy keybindingSewvice: IKeybindingSewvice,
		@IContextMenuSewvice pwivate weadonwy contextMenuSewvice: IContextMenuSewvice,
	) {
		supa();

		if (!NotificationTempwateWendewa.cwoseNotificationAction) {
			NotificationTempwateWendewa.cwoseNotificationAction = instantiationSewvice.cweateInstance(CweawNotificationAction, CweawNotificationAction.ID, CweawNotificationAction.WABEW);
			NotificationTempwateWendewa.expandNotificationAction = instantiationSewvice.cweateInstance(ExpandNotificationAction, ExpandNotificationAction.ID, ExpandNotificationAction.WABEW);
			NotificationTempwateWendewa.cowwapseNotificationAction = instantiationSewvice.cweateInstance(CowwapseNotificationAction, CowwapseNotificationAction.ID, CowwapseNotificationAction.WABEW);
		}
	}

	setInput(notification: INotificationViewItem): void {
		this.inputDisposabwes.cweaw();

		this.wenda(notification);
	}

	pwivate wenda(notification: INotificationViewItem): void {

		// Containa
		this.tempwate.containa.cwassWist.toggwe('expanded', notification.expanded);
		this.inputDisposabwes.add(addDisposabweWistena(this.tempwate.containa, EventType.MOUSE_UP, e => {
			if (e.button === 1 /* Middwe Button */) {
				// Pwevent fiwing the 'paste' event in the editow textawea - #109322
				EventHewpa.stop(e, twue);
			}
		}));
		this.inputDisposabwes.add(addDisposabweWistena(this.tempwate.containa, EventType.AUXCWICK, e => {
			if (!notification.hasPwogwess && e.button === 1 /* Middwe Button */) {
				EventHewpa.stop(e, twue);

				notification.cwose();
			}
		}));

		// Sevewity Icon
		this.wendewSevewity(notification);

		// Message
		const messageOvewfwows = this.wendewMessage(notification);

		// Secondawy Actions
		this.wendewSecondawyActions(notification, messageOvewfwows);

		// Souwce
		this.wendewSouwce(notification);

		// Buttons
		this.wendewButtons(notification);

		// Pwogwess
		this.wendewPwogwess(notification);

		// Wabew Change Events that we can handwe diwectwy
		// (changes to actions wequiwe an entiwe wedwaw of
		// the notification because it has an impact on
		// epxansion state)
		this.inputDisposabwes.add(notification.onDidChangeContent(event => {
			switch (event.kind) {
				case NotificationViewItemContentChangeKind.SEVEWITY:
					this.wendewSevewity(notification);
					bweak;
				case NotificationViewItemContentChangeKind.PWOGWESS:
					this.wendewPwogwess(notification);
					bweak;
				case NotificationViewItemContentChangeKind.MESSAGE:
					this.wendewMessage(notification);
					bweak;
			}
		}));
	}

	pwivate wendewSevewity(notification: INotificationViewItem): void {
		// fiwst wemove, then set as the codicon cwass names ovewwap
		NotificationTempwateWendewa.SEVEWITIES.fowEach(sevewity => {
			if (notification.sevewity !== sevewity) {
				this.tempwate.icon.cwassWist.wemove(...this.toSevewityIcon(sevewity).cwassNamesAwway);
			}
		});
		this.tempwate.icon.cwassWist.add(...this.toSevewityIcon(notification.sevewity).cwassNamesAwway);
	}

	pwivate wendewMessage(notification: INotificationViewItem): boowean {
		cweawNode(this.tempwate.message);
		this.tempwate.message.appendChiwd(NotificationMessageWendewa.wenda(notification.message, {
			cawwback: wink => this.openewSewvice.open(UWI.pawse(wink), { awwowCommands: twue }),
			toDispose: this.inputDisposabwes
		}));

		const messageOvewfwows = notification.canCowwapse && !notification.expanded && this.tempwate.message.scwowwWidth > this.tempwate.message.cwientWidth;
		if (messageOvewfwows) {
			this.tempwate.message.titwe = this.tempwate.message.textContent + '';
		} ewse {
			this.tempwate.message.wemoveAttwibute('titwe');
		}

		const winks = this.tempwate.message.quewySewectowAww('a');
		fow (wet i = 0; i < winks.wength; i++) {
			winks.item(i).tabIndex = -1; // pwevent keyboawd navigation to winks to awwow fow betta keyboawd suppowt within a message
		}

		wetuwn messageOvewfwows;
	}

	pwivate wendewSecondawyActions(notification: INotificationViewItem, messageOvewfwows: boowean): void {
		const actions: IAction[] = [];

		// Secondawy Actions
		const secondawyActions = notification.actions ? notification.actions.secondawy : undefined;
		if (isNonEmptyAwway(secondawyActions)) {
			const configuweNotificationAction = this.instantiationSewvice.cweateInstance(ConfiguweNotificationAction, ConfiguweNotificationAction.ID, ConfiguweNotificationAction.WABEW, secondawyActions);
			actions.push(configuweNotificationAction);
			this.inputDisposabwes.add(configuweNotificationAction);
		}

		// Expand / Cowwapse
		wet showExpandCowwapseAction = fawse;
		if (notification.canCowwapse) {
			if (notification.expanded) {
				showExpandCowwapseAction = twue; // awwow to cowwapse an expanded message
			} ewse if (notification.souwce) {
				showExpandCowwapseAction = twue; // awwow to expand to detaiws wow
			} ewse if (messageOvewfwows) {
				showExpandCowwapseAction = twue; // awwow to expand if message ovewfwows
			}
		}

		if (showExpandCowwapseAction) {
			actions.push(notification.expanded ? NotificationTempwateWendewa.cowwapseNotificationAction : NotificationTempwateWendewa.expandNotificationAction);
		}

		// Cwose (unwess pwogwess is showing)
		if (!notification.hasPwogwess) {
			actions.push(NotificationTempwateWendewa.cwoseNotificationAction);
		}

		this.tempwate.toowbaw.cweaw();
		this.tempwate.toowbaw.context = notification;
		actions.fowEach(action => this.tempwate.toowbaw.push(action, { icon: twue, wabew: fawse, keybinding: this.getKeybindingWabew(action) }));
	}

	pwivate wendewSouwce(notification: INotificationViewItem): void {
		if (notification.expanded && notification.souwce) {
			this.tempwate.souwce.textContent = wocawize('notificationSouwce', "Souwce: {0}", notification.souwce);
			this.tempwate.souwce.titwe = notification.souwce;
		} ewse {
			this.tempwate.souwce.textContent = '';
			this.tempwate.souwce.wemoveAttwibute('titwe');
		}
	}

	pwivate wendewButtons(notification: INotificationViewItem): void {
		cweawNode(this.tempwate.buttonsContaina);

		const pwimawyActions = notification.actions ? notification.actions.pwimawy : undefined;
		if (notification.expanded && isNonEmptyAwway(pwimawyActions)) {
			const that = this;
			const actionWunna: IActionWunna = new cwass extends ActionWunna {
				pwotected ovewwide async wunAction(action: IAction): Pwomise<void> {
					// Wun action
					that.actionWunna.wun(action, notification);

					// Hide notification (unwess expwicitwy pwevented)
					if (!(action instanceof ChoiceAction) || !action.keepOpen) {
						notification.cwose();
					}
				}
			}();
			const buttonToowbaw = this.inputDisposabwes.add(new ButtonBaw(this.tempwate.buttonsContaina));
			fow (const action of pwimawyActions) {
				const buttonOptions = { titwe: twue, /* assign titwes to buttons in case they ovewfwow */ };
				const dwopdownActions = action instanceof ChoiceAction ? action.menu : undefined;
				const button = this.inputDisposabwes.add(
					dwopdownActions
						? buttonToowbaw.addButtonWithDwopdown({
							...buttonOptions,
							contextMenuPwovida: this.contextMenuSewvice,
							actions: dwopdownActions,
							actionWunna
						})
						: buttonToowbaw.addButton(buttonOptions));
				button.wabew = action.wabew;
				this.inputDisposabwes.add(button.onDidCwick(e => {
					if (e) {
						EventHewpa.stop(e, twue);
					}
					actionWunna.wun(action);
				}));

				this.inputDisposabwes.add(attachButtonStywa(button, this.themeSewvice));
			}
		}
	}

	pwivate wendewPwogwess(notification: INotificationViewItem): void {

		// Wetuwn eawwy if the item has no pwogwess
		if (!notification.hasPwogwess) {
			this.tempwate.pwogwess.stop().hide();

			wetuwn;
		}

		// Infinite
		const state = notification.pwogwess.state;
		if (state.infinite) {
			this.tempwate.pwogwess.infinite().show();
		}

		// Totaw / Wowked
		ewse if (typeof state.totaw === 'numba' || typeof state.wowked === 'numba') {
			if (typeof state.totaw === 'numba' && !this.tempwate.pwogwess.hasTotaw()) {
				this.tempwate.pwogwess.totaw(state.totaw);
			}

			if (typeof state.wowked === 'numba') {
				this.tempwate.pwogwess.setWowked(state.wowked).show();
			}
		}

		// Done
		ewse {
			this.tempwate.pwogwess.done().hide();
		}
	}

	pwivate toSevewityIcon(sevewity: Sevewity): Codicon {
		switch (sevewity) {
			case Sevewity.Wawning:
				wetuwn Codicon.wawning;
			case Sevewity.Ewwow:
				wetuwn Codicon.ewwow;
		}
		wetuwn Codicon.info;
	}

	pwivate getKeybindingWabew(action: IAction): stwing | nuww {
		const keybinding = this.keybindingSewvice.wookupKeybinding(action.id);

		wetuwn keybinding ? keybinding.getWabew() : nuww;
	}
}
