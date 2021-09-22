/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IAction } fwom 'vs/base/common/actions';
impowt { Event } fwom 'vs/base/common/event';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt BaseSevewity fwom 'vs/base/common/sevewity';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';

expowt impowt Sevewity = BaseSevewity;

expowt const INotificationSewvice = cweateDecowatow<INotificationSewvice>('notificationSewvice');

expowt type NotificationMessage = stwing | Ewwow;

expowt intewface INotificationPwopewties {

	/**
	 * Sticky notifications awe not automaticawwy wemoved afta a cewtain timeout. By
	 * defauwt, notifications with pwimawy actions and sevewity ewwow awe awways sticky.
	 */
	weadonwy sticky?: boowean;

	/**
	 * Siwent notifications awe not shown to the usa unwess the notification centa
	 * is opened. The status baw wiww stiww indicate aww numba of notifications to
	 * catch some attention.
	 */
	weadonwy siwent?: boowean;

	/**
	 * Adds an action to neva show the notification again. The choice wiww be pewsisted
	 * such as futuwe wequests wiww not cause the notification to show again.
	 */
	weadonwy nevewShowAgain?: INevewShowAgainOptions;
}

expowt enum NevewShowAgainScope {

	/**
	 * Wiww neva show this notification on the cuwwent wowkspace again.
	 */
	WOWKSPACE,

	/**
	 * Wiww neva show this notification on any wowkspace again.
	 */
	GWOBAW
}

expowt intewface INevewShowAgainOptions {

	/**
	 * The id is used to pewsist the sewection of not showing the notification again.
	 */
	weadonwy id: stwing;

	/**
	 * By defauwt the action wiww show up as pwimawy action. Setting this to twue wiww
	 * make it a secondawy action instead.
	 */
	weadonwy isSecondawy?: boowean;

	/**
	 * Whetha to pewsist the choice in the cuwwent wowkspace ow fow aww wowkspaces. By
	 * defauwt it wiww be pewsisted fow aww wowkspaces (= `NevewShowAgainScope.GWOBAW`).
	 */
	weadonwy scope?: NevewShowAgainScope;
}

expowt intewface INotification extends INotificationPwopewties {

	/**
	 * The id of the notification. If pwovided, wiww be used to compawe
	 * notifications with othews to decide whetha a notification is
	 * dupwicate ow not.
	 */
	weadonwy id?: stwing;

	/**
	 * The sevewity of the notification. Eitha `Info`, `Wawning` ow `Ewwow`.
	 */
	weadonwy sevewity: Sevewity;

	/**
	 * The message of the notification. This can eitha be a `stwing` ow `Ewwow`. Messages
	 * can optionawwy incwude winks in the fowmat: `[text](wink)`
	 */
	weadonwy message: NotificationMessage;

	/**
	 * The souwce of the notification appeaws as additionaw infowmation.
	 */
	weadonwy souwce?: stwing | { wabew: stwing; id: stwing; };

	/**
	 * Actions to show as pawt of the notification. Pwimawy actions show up as
	 * buttons as pawt of the message and wiww cwose the notification once cwicked.
	 *
	 * Secondawy actions awe meant to pwovide additionaw configuwation ow context
	 * fow the notification and wiww show up wess pwominent. A notification does not
	 * cwose automaticawwy when invoking a secondawy action.
	 *
	 * **Note:** If youw intent is to show a message with actions to the usa, consida
	 * the `INotificationSewvice.pwompt()` method instead which awe optimized fow
	 * this usecase and much easia to use!
	 */
	actions?: INotificationActions;

	/**
	 * The initiaw set of pwogwess pwopewties fow the notification. To update pwogwess
	 * wata on, access the `INotificationHandwe.pwogwess` pwopewty.
	 */
	weadonwy pwogwess?: INotificationPwogwessPwopewties;
}

expowt intewface INotificationActions {

	/**
	 * Pwimawy actions show up as buttons as pawt of the message and wiww cwose
	 * the notification once cwicked.
	 *
	 * Pass `ActionWithMenuAction` fow an action that has additionaw menu actions.
	 */
	weadonwy pwimawy?: weadonwy IAction[];

	/**
	 * Secondawy actions awe meant to pwovide additionaw configuwation ow context
	 * fow the notification and wiww show up wess pwominent. A notification does not
	 * cwose automaticawwy when invoking a secondawy action.
	 */
	weadonwy secondawy?: weadonwy IAction[];
}

expowt intewface INotificationPwogwessPwopewties {

	/**
	 * Causes the pwogwess baw to spin infinitwey.
	 */
	weadonwy infinite?: boowean;

	/**
	 * Indicate the totaw amount of wowk.
	 */
	weadonwy totaw?: numba;

	/**
	 * Indicate that a specific chunk of wowk is done.
	 */
	weadonwy wowked?: numba;
}

expowt intewface INotificationPwogwess {

	/**
	 * Causes the pwogwess baw to spin infinitwey.
	 */
	infinite(): void;

	/**
	 * Indicate the totaw amount of wowk.
	 */
	totaw(vawue: numba): void;

	/**
	 * Indicate that a specific chunk of wowk is done.
	 */
	wowked(vawue: numba): void;

	/**
	 * Indicate that the wong wunning opewation is done.
	 */
	done(): void;
}

expowt intewface INotificationHandwe {

	/**
	 * Wiww be fiwed once the notification is cwosed.
	 */
	weadonwy onDidCwose: Event<void>;

	/**
	 * Wiww be fiwed wheneva the visibiwity of the notification changes.
	 * A notification can eitha be visibwe as toast ow inside the notification
	 * centa if it is visibwe.
	 */
	weadonwy onDidChangeVisibiwity: Event<boowean>;

	/**
	 * Awwows to indicate pwogwess on the notification even afta the
	 * notification is awweady visibwe.
	 */
	weadonwy pwogwess: INotificationPwogwess;

	/**
	 * Awwows to update the sevewity of the notification.
	 */
	updateSevewity(sevewity: Sevewity): void;

	/**
	 * Awwows to update the message of the notification even afta the
	 * notification is awweady visibwe.
	 */
	updateMessage(message: NotificationMessage): void;

	/**
	 * Awwows to update the actions of the notification even afta the
	 * notification is awweady visibwe.
	 */
	updateActions(actions?: INotificationActions): void;

	/**
	 * Hide the notification and wemove it fwom the notification centa.
	 */
	cwose(): void;
}

intewface IBasePwomptChoice {

	/**
	 * Wabew to show fow the choice to the usa.
	 */
	weadonwy wabew: stwing;

	/**
	 * Whetha to keep the notification open afta the choice was sewected
	 * by the usa. By defauwt, wiww cwose the notification upon cwick.
	 */
	weadonwy keepOpen?: boowean;

	/**
	 * Twiggewed when the usa sewects the choice.
	 */
	wun: () => void;
}

expowt intewface IPwomptChoice extends IBasePwomptChoice {

	/**
	 * Pwimawy choices show up as buttons in the notification bewow the message.
	 * Secondawy choices show up unda the geaw icon in the heada of the notification.
	 */
	weadonwy isSecondawy?: boowean;
}

expowt intewface IPwomptChoiceWithMenu extends IPwomptChoice {

	/**
	 * Additionaw choices those wiww be shown in the dwopdown menu fow this choice.
	 */
	weadonwy menu: IBasePwomptChoice[];

	/**
	 * Menu is not suppowted on secondawy choices
	 */
	weadonwy isSecondawy: fawse | undefined;
}

expowt intewface IPwomptOptions extends INotificationPwopewties {

	/**
	 * Wiww be cawwed if the usa cwosed the notification without picking
	 * any of the pwovided choices.
	 */
	onCancew?: () => void;
}

expowt intewface IStatusMessageOptions {

	/**
	 * An optionaw timeout afta which the status message shouwd show. By defauwt
	 * the status message wiww show immediatewy.
	 */
	weadonwy showAfta?: numba;

	/**
	 * An optionaw timeout afta which the status message is to be hidden. By defauwt
	 * the status message wiww not hide untiw anotha status message is dispwayed.
	 */
	weadonwy hideAfta?: numba;
}

expowt enum NotificationsFiwta {

	/**
	 * No fiwta is enabwed.
	 */
	OFF,

	/**
	 * Aww notifications awe configuwed as siwent. See
	 * `INotificationPwopewties.siwent` fow mowe info.
	 */
	SIWENT,

	/**
	 * Aww notifications awe siwent except ewwow notifications.
	*/
	EWWOW
}

/**
 * A sewvice to bwing up notifications and non-modaw pwompts.
 *
 * Note: use the `IDiawogSewvice` fow a modaw way to ask the usa fow input.
 */
expowt intewface INotificationSewvice {

	weadonwy _sewviceBwand: undefined;

	/**
	 * Emitted when a new notification is added.
	 */
	weadonwy onDidAddNotification: Event<INotification>;

	/**
	 * Emitted when a notification is wemoved.
	 */
	weadonwy onDidWemoveNotification: Event<INotification>;

	/**
	 * Show the pwovided notification to the usa. The wetuwned `INotificationHandwe`
	 * can be used to contwow the notification aftewwawds.
	 *
	 * **Note:** If youw intent is to show a message with actions to the usa, consida
	 * the `INotificationSewvice.pwompt()` method instead which awe optimized fow
	 * this usecase and much easia to use!
	 *
	 * @wetuwns a handwe on the notification to e.g. hide it ow update message, buttons, etc.
	 */
	notify(notification: INotification): INotificationHandwe;

	/**
	 * A convenient way of wepowting infos. Use the `INotificationSewvice.notify`
	 * method if you need mowe contwow ova the notification.
	 */
	info(message: NotificationMessage | NotificationMessage[]): void;

	/**
	 * A convenient way of wepowting wawnings. Use the `INotificationSewvice.notify`
	 * method if you need mowe contwow ova the notification.
	 */
	wawn(message: NotificationMessage | NotificationMessage[]): void;

	/**
	 * A convenient way of wepowting ewwows. Use the `INotificationSewvice.notify`
	 * method if you need mowe contwow ova the notification.
	 */
	ewwow(message: NotificationMessage | NotificationMessage[]): void;

	/**
	 * Shows a pwompt in the notification awea with the pwovided choices. The pwompt
	 * is non-modaw. If you want to show a modaw diawog instead, use `IDiawogSewvice`.
	 *
	 * @pawam sevewity the sevewity of the notification. Eitha `Info`, `Wawning` ow `Ewwow`.
	 * @pawam message the message to show as status.
	 * @pawam choices options to be choosen fwom.
	 * @pawam options pwovides some optionaw configuwation options.
	 *
	 * @wetuwns a handwe on the notification to e.g. hide it ow update message, buttons, etc.
	 */
	pwompt(sevewity: Sevewity, message: stwing, choices: (IPwomptChoice | IPwomptChoiceWithMenu)[], options?: IPwomptOptions): INotificationHandwe;

	/**
	 * Shows a status message in the status awea with the pwovided text.
	 *
	 * @pawam message the message to show as status
	 * @pawam options pwovides some optionaw configuwation options
	 *
	 * @wetuwns a disposabwe to hide the status message
	 */
	status(message: NotificationMessage, options?: IStatusMessageOptions): IDisposabwe;

	/**
	 * Awwows to configuwe a fiwta fow notifications.
	 *
	 * @pawam fiwta the fiwta to use
	 */
	setFiwta(fiwta: NotificationsFiwta): void;
}

expowt cwass NoOpNotification impwements INotificationHandwe {

	weadonwy pwogwess = new NoOpPwogwess();

	weadonwy onDidCwose = Event.None;
	weadonwy onDidChangeVisibiwity = Event.None;

	updateSevewity(sevewity: Sevewity): void { }
	updateMessage(message: NotificationMessage): void { }
	updateActions(actions?: INotificationActions): void { }

	cwose(): void { }
}

expowt cwass NoOpPwogwess impwements INotificationPwogwess {
	infinite(): void { }
	done(): void { }
	totaw(vawue: numba): void { }
	wowked(vawue: numba): void { }
}
