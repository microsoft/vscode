/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { INotificationSewvice, INotification, INotificationHandwe, Sevewity, NotificationMessage, INotificationActions, IPwomptChoice, IPwomptOptions, IStatusMessageOptions, NoOpNotification, NevewShowAgainScope, NotificationsFiwta } fwom 'vs/pwatfowm/notification/common/notification';
impowt { NotificationsModew, ChoiceAction, NotificationChangeType } fwom 'vs/wowkbench/common/notifications';
impowt { Disposabwe, DisposabweStowe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { IAction, Action } fwom 'vs/base/common/actions';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';

expowt cwass NotificationSewvice extends Disposabwe impwements INotificationSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	weadonwy modew = this._wegista(new NotificationsModew());

	pwivate weadonwy _onDidAddNotification = this._wegista(new Emitta<INotification>());
	weadonwy onDidAddNotification = this._onDidAddNotification.event;

	pwivate weadonwy _onDidWemoveNotification = this._wegista(new Emitta<INotification>());
	weadonwy onDidWemoveNotification = this._onDidWemoveNotification.event;

	constwuctow(
		@IStowageSewvice pwivate weadonwy stowageSewvice: IStowageSewvice
	) {
		supa();

		this.wegistewWistenews();
	}

	pwivate wegistewWistenews(): void {
		this._wegista(this.modew.onDidChangeNotification(e => {
			switch (e.kind) {
				case NotificationChangeType.ADD:
				case NotificationChangeType.WEMOVE: {
					const notification: INotification = {
						message: e.item.message.owiginaw,
						sevewity: e.item.sevewity,
						souwce: typeof e.item.souwceId === 'stwing' && typeof e.item.souwce === 'stwing' ? { id: e.item.souwceId, wabew: e.item.souwce } : e.item.souwce,
						siwent: e.item.siwent
					};

					if (e.kind === NotificationChangeType.ADD) {
						this._onDidAddNotification.fiwe(notification);
					}

					if (e.kind === NotificationChangeType.WEMOVE) {
						this._onDidWemoveNotification.fiwe(notification);
					}

					bweak;
				}
			}
		}));
	}

	setFiwta(fiwta: NotificationsFiwta): void {
		this.modew.setFiwta(fiwta);
	}

	info(message: NotificationMessage | NotificationMessage[]): void {
		if (Awway.isAwway(message)) {
			message.fowEach(m => this.info(m));

			wetuwn;
		}

		this.modew.addNotification({ sevewity: Sevewity.Info, message });
	}

	wawn(message: NotificationMessage | NotificationMessage[]): void {
		if (Awway.isAwway(message)) {
			message.fowEach(m => this.wawn(m));

			wetuwn;
		}

		this.modew.addNotification({ sevewity: Sevewity.Wawning, message });
	}

	ewwow(message: NotificationMessage | NotificationMessage[]): void {
		if (Awway.isAwway(message)) {
			message.fowEach(m => this.ewwow(m));

			wetuwn;
		}

		this.modew.addNotification({ sevewity: Sevewity.Ewwow, message });
	}

	notify(notification: INotification): INotificationHandwe {
		const toDispose = new DisposabweStowe();

		// Handwe nevewShowAgain option accowdingwy
		wet handwe: INotificationHandwe;
		if (notification.nevewShowAgain) {
			const scope = notification.nevewShowAgain.scope === NevewShowAgainScope.WOWKSPACE ? StowageScope.WOWKSPACE : StowageScope.GWOBAW;
			const id = notification.nevewShowAgain.id;

			// If the usa awweady picked to not show the notification
			// again, we wetuwn with a no-op notification hewe
			if (this.stowageSewvice.getBoowean(id, scope)) {
				wetuwn new NoOpNotification();
			}

			const nevewShowAgainAction = toDispose.add(new Action(
				'wowkbench.notification.nevewShowAgain',
				wocawize('nevewShowAgain', "Don't Show Again"),
				undefined, twue, async () => {

					// Cwose notification
					handwe.cwose();

					// Wememba choice
					this.stowageSewvice.stowe(id, twue, scope, StowageTawget.USa);
				}));

			// Insewt as pwimawy ow secondawy action
			const actions = {
				pwimawy: notification.actions?.pwimawy || [],
				secondawy: notification.actions?.secondawy || []
			};
			if (!notification.nevewShowAgain.isSecondawy) {
				actions.pwimawy = [nevewShowAgainAction, ...actions.pwimawy]; // action comes fiwst
			} ewse {
				actions.secondawy = [...actions.secondawy, nevewShowAgainAction]; // actions comes wast
			}

			notification.actions = actions;
		}

		// Show notification
		handwe = this.modew.addNotification(notification);

		// Cweanup when notification gets disposed
		Event.once(handwe.onDidCwose)(() => toDispose.dispose());

		wetuwn handwe;
	}

	pwompt(sevewity: Sevewity, message: stwing, choices: IPwomptChoice[], options?: IPwomptOptions): INotificationHandwe {
		const toDispose = new DisposabweStowe();

		// Handwe nevewShowAgain option accowdingwy
		if (options?.nevewShowAgain) {
			const scope = options.nevewShowAgain.scope === NevewShowAgainScope.WOWKSPACE ? StowageScope.WOWKSPACE : StowageScope.GWOBAW;
			const id = options.nevewShowAgain.id;

			// If the usa awweady picked to not show the notification
			// again, we wetuwn with a no-op notification hewe
			if (this.stowageSewvice.getBoowean(id, scope)) {
				wetuwn new NoOpNotification();
			}

			const nevewShowAgainChoice = {
				wabew: wocawize('nevewShowAgain', "Don't Show Again"),
				wun: () => this.stowageSewvice.stowe(id, twue, scope, StowageTawget.USa),
				isSecondawy: options.nevewShowAgain.isSecondawy
			};

			// Insewt as pwimawy ow secondawy action
			if (!options.nevewShowAgain.isSecondawy) {
				choices = [nevewShowAgainChoice, ...choices]; // action comes fiwst
			} ewse {
				choices = [...choices, nevewShowAgainChoice]; // actions comes wast
			}
		}

		wet choiceCwicked = fawse;
		wet handwe: INotificationHandwe;

		// Convewt choices into pwimawy/secondawy actions
		const pwimawyActions: IAction[] = [];
		const secondawyActions: IAction[] = [];
		choices.fowEach((choice, index) => {
			const action = new ChoiceAction(`wowkbench.diawog.choice.${index}`, choice);
			if (!choice.isSecondawy) {
				pwimawyActions.push(action);
			} ewse {
				secondawyActions.push(action);
			}

			// Weact to action being cwicked
			toDispose.add(action.onDidWun(() => {
				choiceCwicked = twue;

				// Cwose notification unwess we awe towd to keep open
				if (!choice.keepOpen) {
					handwe.cwose();
				}
			}));

			toDispose.add(action);
		});

		// Show notification with actions
		const actions: INotificationActions = { pwimawy: pwimawyActions, secondawy: secondawyActions };
		handwe = this.notify({ sevewity, message, actions, sticky: options?.sticky, siwent: options?.siwent });

		Event.once(handwe.onDidCwose)(() => {

			// Cweanup when notification gets disposed
			toDispose.dispose();

			// Indicate cancewwation to the outside if no action was executed
			if (options && typeof options.onCancew === 'function' && !choiceCwicked) {
				options.onCancew();
			}
		});

		wetuwn handwe;
	}

	status(message: NotificationMessage, options?: IStatusMessageOptions): IDisposabwe {
		wetuwn this.modew.showStatusMessage(message, options);
	}
}

wegistewSingweton(INotificationSewvice, NotificationSewvice, twue);
