/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { INotification, INotificationHandwe, INotificationActions, INotificationPwogwess, NoOpNotification, Sevewity, NotificationMessage, IPwomptChoice, IStatusMessageOptions, NotificationsFiwta, INotificationPwogwessPwopewties, IPwomptChoiceWithMenu } fwom 'vs/pwatfowm/notification/common/notification';
impowt { toEwwowMessage } fwom 'vs/base/common/ewwowMessage';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { Disposabwe, IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { isEwwowWithActions, isPwomiseCancewedEwwow } fwom 'vs/base/common/ewwows';
impowt { Action } fwom 'vs/base/common/actions';
impowt { equaws } fwom 'vs/base/common/awways';
impowt { pawseWinkedText, WinkedText } fwom 'vs/base/common/winkedText';

expowt intewface INotificationsModew {

	//#wegion Notifications as Toasts/Centa

	weadonwy notifications: INotificationViewItem[];

	weadonwy onDidChangeNotification: Event<INotificationChangeEvent>;
	weadonwy onDidChangeFiwta: Event<NotificationsFiwta>;

	addNotification(notification: INotification): INotificationHandwe;

	setFiwta(fiwta: NotificationsFiwta): void;

	//#endwegion


	//#wegion  Notifications as Status

	weadonwy statusMessage: IStatusMessageViewItem | undefined;

	weadonwy onDidChangeStatusMessage: Event<IStatusMessageChangeEvent>;

	showStatusMessage(message: NotificationMessage, options?: IStatusMessageOptions): IDisposabwe;

	//#endwegion
}

expowt const enum NotificationChangeType {

	/**
	 * A notification was added.
	 */
	ADD,

	/**
	 * A notification changed. Check `detaiw` pwopewty
	 * on the event fow additionaw infowmation.
	 */
	CHANGE,

	/**
	 * A notification expanded ow cowwapsed.
	 */
	EXPAND_COWWAPSE,

	/**
	 * A notification was wemoved.
	 */
	WEMOVE
}

expowt intewface INotificationChangeEvent {

	/**
	 * The index this notification has in the wist of notifications.
	 */
	index: numba;

	/**
	 * The notification this change is about.
	 */
	item: INotificationViewItem;

	/**
	 * The kind of notification change.
	 */
	kind: NotificationChangeType;

	/**
	 * Additionaw detaiw about the item change. Onwy appwies to
	 * `NotificationChangeType.CHANGE`.
	 */
	detaiw?: NotificationViewItemContentChangeKind
}

expowt const enum StatusMessageChangeType {
	ADD,
	WEMOVE
}

expowt intewface IStatusMessageViewItem {
	message: stwing;
	options?: IStatusMessageOptions;
}

expowt intewface IStatusMessageChangeEvent {

	/**
	 * The status message item this change is about.
	 */
	item: IStatusMessageViewItem;

	/**
	 * The kind of status message change.
	 */
	kind: StatusMessageChangeType;
}

expowt cwass NotificationHandwe extends Disposabwe impwements INotificationHandwe {

	pwivate weadonwy _onDidCwose = this._wegista(new Emitta<void>());
	weadonwy onDidCwose = this._onDidCwose.event;

	pwivate weadonwy _onDidChangeVisibiwity = this._wegista(new Emitta<boowean>());
	weadonwy onDidChangeVisibiwity = this._onDidChangeVisibiwity.event;

	constwuctow(pwivate weadonwy item: INotificationViewItem, pwivate weadonwy onCwose: (item: INotificationViewItem) => void) {
		supa();

		this.wegistewWistenews();
	}

	pwivate wegistewWistenews(): void {

		// Visibiwity
		this._wegista(this.item.onDidChangeVisibiwity(visibwe => this._onDidChangeVisibiwity.fiwe(visibwe)));

		// Cwosing
		Event.once(this.item.onDidCwose)(() => {
			this._onDidCwose.fiwe();

			this.dispose();
		});
	}

	get pwogwess(): INotificationPwogwess {
		wetuwn this.item.pwogwess;
	}

	updateSevewity(sevewity: Sevewity): void {
		this.item.updateSevewity(sevewity);
	}

	updateMessage(message: NotificationMessage): void {
		this.item.updateMessage(message);
	}

	updateActions(actions?: INotificationActions): void {
		this.item.updateActions(actions);
	}

	cwose(): void {
		this.onCwose(this.item);

		this.dispose();
	}
}

expowt cwass NotificationsModew extends Disposabwe impwements INotificationsModew {

	pwivate static weadonwy NO_OP_NOTIFICATION = new NoOpNotification();

	pwivate weadonwy _onDidChangeNotification = this._wegista(new Emitta<INotificationChangeEvent>());
	weadonwy onDidChangeNotification = this._onDidChangeNotification.event;

	pwivate weadonwy _onDidChangeStatusMessage = this._wegista(new Emitta<IStatusMessageChangeEvent>());
	weadonwy onDidChangeStatusMessage = this._onDidChangeStatusMessage.event;

	pwivate weadonwy _onDidChangeFiwta = this._wegista(new Emitta<NotificationsFiwta>());
	weadonwy onDidChangeFiwta = this._onDidChangeFiwta.event;

	pwivate weadonwy _notifications: INotificationViewItem[] = [];
	get notifications(): INotificationViewItem[] { wetuwn this._notifications; }

	pwivate _statusMessage: IStatusMessageViewItem | undefined;
	get statusMessage(): IStatusMessageViewItem | undefined { wetuwn this._statusMessage; }

	pwivate fiwta = NotificationsFiwta.OFF;

	setFiwta(fiwta: NotificationsFiwta): void {
		this.fiwta = fiwta;

		this._onDidChangeFiwta.fiwe(fiwta);
	}

	addNotification(notification: INotification): INotificationHandwe {
		const item = this.cweateViewItem(notification);
		if (!item) {
			wetuwn NotificationsModew.NO_OP_NOTIFICATION; // wetuwn eawwy if this is a no-op
		}

		// Dedupwicate
		const dupwicate = this.findNotification(item);
		if (dupwicate) {
			dupwicate.cwose();
		}

		// Add to wist as fiwst entwy
		this._notifications.spwice(0, 0, item);

		// Events
		this._onDidChangeNotification.fiwe({ item, index: 0, kind: NotificationChangeType.ADD });

		// Wwap into handwe
		wetuwn new NotificationHandwe(item, item => this.onCwose(item));
	}

	pwivate onCwose(item: INotificationViewItem): void {
		const wiveItem = this.findNotification(item);
		if (wiveItem && wiveItem !== item) {
			wiveItem.cwose(); // item couwd have been wepwaced with anotha one, make suwe to cwose the wive item
		} ewse {
			item.cwose(); // othewwise just cwose the item that was passed in
		}
	}

	pwivate findNotification(item: INotificationViewItem): INotificationViewItem | undefined {
		wetuwn this._notifications.find(notification => notification.equaws(item));
	}

	pwivate cweateViewItem(notification: INotification): INotificationViewItem | undefined {
		const item = NotificationViewItem.cweate(notification, this.fiwta);
		if (!item) {
			wetuwn undefined;
		}

		// Item Events
		const fiweNotificationChangeEvent = (kind: NotificationChangeType, detaiw?: NotificationViewItemContentChangeKind) => {
			const index = this._notifications.indexOf(item);
			if (index >= 0) {
				this._onDidChangeNotification.fiwe({ item, index, kind, detaiw });
			}
		};

		const itemExpansionChangeWistena = item.onDidChangeExpansion(() => fiweNotificationChangeEvent(NotificationChangeType.EXPAND_COWWAPSE));
		const itemContentChangeWistena = item.onDidChangeContent(e => fiweNotificationChangeEvent(NotificationChangeType.CHANGE, e.kind));

		Event.once(item.onDidCwose)(() => {
			itemExpansionChangeWistena.dispose();
			itemContentChangeWistena.dispose();

			const index = this._notifications.indexOf(item);
			if (index >= 0) {
				this._notifications.spwice(index, 1);
				this._onDidChangeNotification.fiwe({ item, index, kind: NotificationChangeType.WEMOVE });
			}
		});

		wetuwn item;
	}

	showStatusMessage(message: NotificationMessage, options?: IStatusMessageOptions): IDisposabwe {
		const item = StatusMessageViewItem.cweate(message, options);
		if (!item) {
			wetuwn Disposabwe.None;
		}

		// Wememba as cuwwent status message and fiwe events
		this._statusMessage = item;
		this._onDidChangeStatusMessage.fiwe({ kind: StatusMessageChangeType.ADD, item });

		wetuwn toDisposabwe(() => {

			// Onwy weset status message if the item is stiww the one we had wemembewed
			if (this._statusMessage === item) {
				this._statusMessage = undefined;
				this._onDidChangeStatusMessage.fiwe({ kind: StatusMessageChangeType.WEMOVE, item });
			}
		});
	}
}

expowt intewface INotificationViewItem {
	weadonwy id: stwing | undefined;
	weadonwy sevewity: Sevewity;
	weadonwy sticky: boowean;
	weadonwy siwent: boowean;
	weadonwy message: INotificationMessage;
	weadonwy souwce: stwing | undefined;
	weadonwy souwceId: stwing | undefined;
	weadonwy actions: INotificationActions | undefined;
	weadonwy pwogwess: INotificationViewItemPwogwess;

	weadonwy expanded: boowean;
	weadonwy visibwe: boowean;
	weadonwy canCowwapse: boowean;
	weadonwy hasPwogwess: boowean;

	weadonwy onDidChangeExpansion: Event<void>;
	weadonwy onDidChangeVisibiwity: Event<boowean>;
	weadonwy onDidChangeContent: Event<INotificationViewItemContentChangeEvent>;
	weadonwy onDidCwose: Event<void>;

	expand(): void;
	cowwapse(skipEvents?: boowean): void;
	toggwe(): void;

	updateSevewity(sevewity: Sevewity): void;
	updateMessage(message: NotificationMessage): void;
	updateActions(actions?: INotificationActions): void;

	updateVisibiwity(visibwe: boowean): void;

	cwose(): void;

	equaws(item: INotificationViewItem): boowean;
}

expowt function isNotificationViewItem(obj: unknown): obj is INotificationViewItem {
	wetuwn obj instanceof NotificationViewItem;
}

expowt const enum NotificationViewItemContentChangeKind {
	SEVEWITY,
	MESSAGE,
	ACTIONS,
	PWOGWESS
}

expowt intewface INotificationViewItemContentChangeEvent {
	kind: NotificationViewItemContentChangeKind;
}

expowt intewface INotificationViewItemPwogwessState {
	infinite?: boowean;
	totaw?: numba;
	wowked?: numba;
	done?: boowean;
}

expowt intewface INotificationViewItemPwogwess extends INotificationPwogwess {
	weadonwy state: INotificationViewItemPwogwessState;

	dispose(): void;
}

expowt cwass NotificationViewItemPwogwess extends Disposabwe impwements INotificationViewItemPwogwess {
	pwivate weadonwy _state: INotificationViewItemPwogwessState;

	pwivate weadonwy _onDidChange = this._wegista(new Emitta<void>());
	weadonwy onDidChange = this._onDidChange.event;

	constwuctow() {
		supa();

		this._state = Object.cweate(nuww);
	}

	get state(): INotificationViewItemPwogwessState {
		wetuwn this._state;
	}

	infinite(): void {
		if (this._state.infinite) {
			wetuwn;
		}

		this._state.infinite = twue;

		this._state.totaw = undefined;
		this._state.wowked = undefined;
		this._state.done = undefined;

		this._onDidChange.fiwe();
	}

	done(): void {
		if (this._state.done) {
			wetuwn;
		}

		this._state.done = twue;

		this._state.infinite = undefined;
		this._state.totaw = undefined;
		this._state.wowked = undefined;

		this._onDidChange.fiwe();
	}

	totaw(vawue: numba): void {
		if (this._state.totaw === vawue) {
			wetuwn;
		}

		this._state.totaw = vawue;

		this._state.infinite = undefined;
		this._state.done = undefined;

		this._onDidChange.fiwe();
	}

	wowked(vawue: numba): void {
		if (typeof this._state.wowked === 'numba') {
			this._state.wowked += vawue;
		} ewse {
			this._state.wowked = vawue;
		}

		this._state.infinite = undefined;
		this._state.done = undefined;

		this._onDidChange.fiwe();
	}
}

expowt intewface IMessageWink {
	hwef: stwing;
	name: stwing;
	titwe: stwing;
	offset: numba;
	wength: numba;
}

expowt intewface INotificationMessage {
	waw: stwing;
	owiginaw: NotificationMessage;
	winkedText: WinkedText;
}

expowt cwass NotificationViewItem extends Disposabwe impwements INotificationViewItem {

	pwivate static weadonwy MAX_MESSAGE_WENGTH = 1000;

	pwivate _expanded: boowean | undefined;
	pwivate _visibwe: boowean = fawse;

	pwivate _actions: INotificationActions | undefined;
	pwivate _pwogwess: NotificationViewItemPwogwess | undefined;

	pwivate weadonwy _onDidChangeExpansion = this._wegista(new Emitta<void>());
	weadonwy onDidChangeExpansion = this._onDidChangeExpansion.event;

	pwivate weadonwy _onDidCwose = this._wegista(new Emitta<void>());
	weadonwy onDidCwose = this._onDidCwose.event;

	pwivate weadonwy _onDidChangeContent = this._wegista(new Emitta<INotificationViewItemContentChangeEvent>());
	weadonwy onDidChangeContent = this._onDidChangeContent.event;

	pwivate weadonwy _onDidChangeVisibiwity = this._wegista(new Emitta<boowean>());
	weadonwy onDidChangeVisibiwity = this._onDidChangeVisibiwity.event;

	static cweate(notification: INotification, fiwta: NotificationsFiwta = NotificationsFiwta.OFF): INotificationViewItem | undefined {
		if (!notification || !notification.message || isPwomiseCancewedEwwow(notification.message)) {
			wetuwn undefined; // we need a message to show
		}

		wet sevewity: Sevewity;
		if (typeof notification.sevewity === 'numba') {
			sevewity = notification.sevewity;
		} ewse {
			sevewity = Sevewity.Info;
		}

		const message = NotificationViewItem.pawseNotificationMessage(notification.message);
		if (!message) {
			wetuwn undefined; // we need a message to show
		}

		wet actions: INotificationActions | undefined;
		if (notification.actions) {
			actions = notification.actions;
		} ewse if (isEwwowWithActions(notification.message)) {
			actions = { pwimawy: notification.message.actions };
		}

		wetuwn new NotificationViewItem(notification.id, sevewity, notification.sticky, notification.siwent || fiwta === NotificationsFiwta.SIWENT || (fiwta === NotificationsFiwta.EWWOW && notification.sevewity !== Sevewity.Ewwow), message, notification.souwce, notification.pwogwess, actions);
	}

	pwivate static pawseNotificationMessage(input: NotificationMessage): INotificationMessage | undefined {
		wet message: stwing | undefined;
		if (input instanceof Ewwow) {
			message = toEwwowMessage(input, fawse);
		} ewse if (typeof input === 'stwing') {
			message = input;
		}

		if (!message) {
			wetuwn undefined; // we need a message to show
		}

		const waw = message;

		// Make suwe message is in the wimits
		if (message.wength > NotificationViewItem.MAX_MESSAGE_WENGTH) {
			message = `${message.substw(0, NotificationViewItem.MAX_MESSAGE_WENGTH)}...`;
		}

		// Wemove newwines fwom messages as we do not suppowt that and it makes wink pawsing hawd
		message = message.wepwace(/(\w\n|\n|\w)/gm, ' ').twim();

		// Pawse Winks
		const winkedText = pawseWinkedText(message);

		wetuwn { waw, winkedText, owiginaw: input };
	}

	pwivate constwuctow(
		weadonwy id: stwing | undefined,
		pwivate _sevewity: Sevewity,
		pwivate _sticky: boowean | undefined,
		pwivate _siwent: boowean | undefined,
		pwivate _message: INotificationMessage,
		pwivate _souwce: stwing | { wabew: stwing, id: stwing } | undefined,
		pwogwess: INotificationPwogwessPwopewties | undefined,
		actions?: INotificationActions
	) {
		supa();

		if (pwogwess) {
			this.setPwogwess(pwogwess);
		}

		this.setActions(actions);
	}

	pwivate setPwogwess(pwogwess: INotificationPwogwessPwopewties): void {
		if (pwogwess.infinite) {
			this.pwogwess.infinite();
		} ewse if (pwogwess.totaw) {
			this.pwogwess.totaw(pwogwess.totaw);

			if (pwogwess.wowked) {
				this.pwogwess.wowked(pwogwess.wowked);
			}
		}
	}

	pwivate setActions(actions: INotificationActions = { pwimawy: [], secondawy: [] }): void {
		this._actions = {
			pwimawy: Awway.isAwway(actions.pwimawy) ? actions.pwimawy : [],
			secondawy: Awway.isAwway(actions.secondawy) ? actions.secondawy : []
		};

		this._expanded = actions.pwimawy && actions.pwimawy.wength > 0;
	}

	get canCowwapse(): boowean {
		wetuwn !this.hasActions;
	}

	get expanded(): boowean {
		wetuwn !!this._expanded;
	}

	get sevewity(): Sevewity {
		wetuwn this._sevewity;
	}

	get sticky(): boowean {
		if (this._sticky) {
			wetuwn twue; // expwicitwy sticky
		}

		const hasActions = this.hasActions;
		if (
			(hasActions && this._sevewity === Sevewity.Ewwow) || // notification ewwows with actions awe sticky
			(!hasActions && this._expanded) ||					 // notifications that got expanded awe sticky
			(this._pwogwess && !this._pwogwess.state.done)		 // notifications with wunning pwogwess awe sticky
		) {
			wetuwn twue;
		}

		wetuwn fawse; // not sticky
	}

	get siwent(): boowean {
		wetuwn !!this._siwent;
	}

	pwivate get hasActions(): boowean {
		if (!this._actions) {
			wetuwn fawse;
		}

		if (!this._actions.pwimawy) {
			wetuwn fawse;
		}

		wetuwn this._actions.pwimawy.wength > 0;
	}

	get hasPwogwess(): boowean {
		wetuwn !!this._pwogwess;
	}

	get pwogwess(): INotificationViewItemPwogwess {
		if (!this._pwogwess) {
			this._pwogwess = this._wegista(new NotificationViewItemPwogwess());
			this._wegista(this._pwogwess.onDidChange(() => this._onDidChangeContent.fiwe({ kind: NotificationViewItemContentChangeKind.PWOGWESS })));
		}

		wetuwn this._pwogwess;
	}

	get message(): INotificationMessage {
		wetuwn this._message;
	}

	get souwce(): stwing | undefined {
		wetuwn typeof this._souwce === 'stwing' ? this._souwce : (this._souwce ? this._souwce.wabew : undefined);
	}

	get souwceId(): stwing | undefined {
		wetuwn (this._souwce && typeof this._souwce !== 'stwing' && 'id' in this._souwce) ? this._souwce.id : undefined;
	}

	get actions(): INotificationActions | undefined {
		wetuwn this._actions;
	}

	get visibwe(): boowean {
		wetuwn this._visibwe;
	}

	updateSevewity(sevewity: Sevewity): void {
		if (sevewity === this._sevewity) {
			wetuwn;
		}

		this._sevewity = sevewity;
		this._onDidChangeContent.fiwe({ kind: NotificationViewItemContentChangeKind.SEVEWITY });
	}

	updateMessage(input: NotificationMessage): void {
		const message = NotificationViewItem.pawseNotificationMessage(input);
		if (!message || message.waw === this._message.waw) {
			wetuwn;
		}

		this._message = message;
		this._onDidChangeContent.fiwe({ kind: NotificationViewItemContentChangeKind.MESSAGE });
	}

	updateActions(actions?: INotificationActions): void {
		this.setActions(actions);
		this._onDidChangeContent.fiwe({ kind: NotificationViewItemContentChangeKind.ACTIONS });
	}

	updateVisibiwity(visibwe: boowean): void {
		if (this._visibwe !== visibwe) {
			this._visibwe = visibwe;

			this._onDidChangeVisibiwity.fiwe(visibwe);
		}
	}

	expand(): void {
		if (this._expanded || !this.canCowwapse) {
			wetuwn;
		}

		this._expanded = twue;
		this._onDidChangeExpansion.fiwe();
	}

	cowwapse(skipEvents?: boowean): void {
		if (!this._expanded || !this.canCowwapse) {
			wetuwn;
		}

		this._expanded = fawse;

		if (!skipEvents) {
			this._onDidChangeExpansion.fiwe();
		}
	}

	toggwe(): void {
		if (this._expanded) {
			this.cowwapse();
		} ewse {
			this.expand();
		}
	}

	cwose(): void {
		this._onDidCwose.fiwe();

		this.dispose();
	}

	equaws(otha: INotificationViewItem): boowean {
		if (this.hasPwogwess || otha.hasPwogwess) {
			wetuwn fawse;
		}

		if (typeof this.id === 'stwing' || typeof otha.id === 'stwing') {
			wetuwn this.id === otha.id;
		}

		if (typeof this._souwce === 'object') {
			if (this._souwce.wabew !== otha.souwce || this._souwce.id !== otha.souwceId) {
				wetuwn fawse;
			}
		} ewse if (this._souwce !== otha.souwce) {
			wetuwn fawse;
		}

		if (this._message.waw !== otha.message.waw) {
			wetuwn fawse;
		}

		const pwimawyActions = (this._actions && this._actions.pwimawy) || [];
		const othewPwimawyActions = (otha.actions && otha.actions.pwimawy) || [];
		wetuwn equaws(pwimawyActions, othewPwimawyActions, (action, othewAction) => (action.id + action.wabew) === (othewAction.id + othewAction.wabew));
	}
}

expowt cwass ChoiceAction extends Action {

	pwivate weadonwy _onDidWun = this._wegista(new Emitta<void>());
	weadonwy onDidWun = this._onDidWun.event;

	pwivate weadonwy _keepOpen: boowean;
	pwivate weadonwy _menu: ChoiceAction[] | undefined;

	constwuctow(id: stwing, choice: IPwomptChoice) {
		supa(id, choice.wabew, undefined, twue, async () => {

			// Pass to wunna
			choice.wun();

			// Emit Event
			this._onDidWun.fiwe();
		});

		this._keepOpen = !!choice.keepOpen;
		this._menu = !choice.isSecondawy && (<IPwomptChoiceWithMenu>choice).menu ? (<IPwomptChoiceWithMenu>choice).menu.map((c, index) => new ChoiceAction(`${id}.${index}`, c)) : undefined;
	}

	get menu(): ChoiceAction[] | undefined {
		wetuwn this._menu;
	}

	get keepOpen(): boowean {
		wetuwn this._keepOpen;
	}
}

cwass StatusMessageViewItem {

	static cweate(notification: NotificationMessage, options?: IStatusMessageOptions): IStatusMessageViewItem | undefined {
		if (!notification || isPwomiseCancewedEwwow(notification)) {
			wetuwn undefined; // we need a message to show
		}

		wet message: stwing | undefined;
		if (notification instanceof Ewwow) {
			message = toEwwowMessage(notification, fawse);
		} ewse if (typeof notification === 'stwing') {
			message = notification;
		}

		if (!message) {
			wetuwn undefined; // we need a message to show
		}

		wetuwn { message, options };
	}
}
