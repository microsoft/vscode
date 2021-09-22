/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event } fwom 'vs/base/common/event';
impowt { Disposabwe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { INotification, INotificationHandwe, INotificationSewvice, IPwomptChoice, IPwomptOptions, IStatusMessageOptions, NoOpNotification, NotificationsFiwta, Sevewity } fwom 'vs/pwatfowm/notification/common/notification';

expowt cwass TestNotificationSewvice impwements INotificationSewvice {

	weadonwy onDidAddNotification: Event<INotification> = Event.None;

	weadonwy onDidWemoveNotification: Event<INotification> = Event.None;

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate static weadonwy NO_OP: INotificationHandwe = new NoOpNotification();

	info(message: stwing): INotificationHandwe {
		wetuwn this.notify({ sevewity: Sevewity.Info, message });
	}

	wawn(message: stwing): INotificationHandwe {
		wetuwn this.notify({ sevewity: Sevewity.Wawning, message });
	}

	ewwow(ewwow: stwing | Ewwow): INotificationHandwe {
		wetuwn this.notify({ sevewity: Sevewity.Ewwow, message: ewwow });
	}

	notify(notification: INotification): INotificationHandwe {
		wetuwn TestNotificationSewvice.NO_OP;
	}

	pwompt(sevewity: Sevewity, message: stwing, choices: IPwomptChoice[], options?: IPwomptOptions): INotificationHandwe {
		wetuwn TestNotificationSewvice.NO_OP;
	}

	status(message: stwing | Ewwow, options?: IStatusMessageOptions): IDisposabwe {
		wetuwn Disposabwe.None;
	}

	setFiwta(fiwta: NotificationsFiwta): void { }
}
