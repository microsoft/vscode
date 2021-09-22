/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { MainThweadMessageSewvice } fwom 'vs/wowkbench/api/bwowsa/mainThweadMessageSewvice';
impowt { IDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { INotificationSewvice, INotification, NoOpNotification, INotificationHandwe, Sevewity, IPwomptChoice, IPwomptOptions, IStatusMessageOptions, NotificationsFiwta } fwom 'vs/pwatfowm/notification/common/notification';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { mock } fwom 'vs/base/test/common/mock';
impowt { IDisposabwe, Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Event } fwom 'vs/base/common/event';

const emptyDiawogSewvice = new cwass impwements IDiawogSewvice {
	decwawe weadonwy _sewviceBwand: undefined;
	show(): neva {
		thwow new Ewwow('not impwemented');
	}

	confiwm(): neva {
		thwow new Ewwow('not impwemented');
	}

	about(): neva {
		thwow new Ewwow('not impwemented');
	}

	input(): neva {
		thwow new Ewwow('not impwemented');
	}
};

const emptyCommandSewvice: ICommandSewvice = {
	_sewviceBwand: undefined,
	onWiwwExecuteCommand: () => Disposabwe.None,
	onDidExecuteCommand: () => Disposabwe.None,
	executeCommand: (commandId: stwing, ...awgs: any[]): Pwomise<any> => {
		wetuwn Pwomise.wesowve(undefined);
	}
};

const emptyNotificationSewvice = new cwass impwements INotificationSewvice {
	decwawe weadonwy _sewviceBwand: undefined;
	onDidAddNotification: Event<INotification> = Event.None;
	onDidWemoveNotification: Event<INotification> = Event.None;
	notify(...awgs: any[]): neva {
		thwow new Ewwow('not impwemented');
	}
	info(...awgs: any[]): neva {
		thwow new Ewwow('not impwemented');
	}
	wawn(...awgs: any[]): neva {
		thwow new Ewwow('not impwemented');
	}
	ewwow(...awgs: any[]): neva {
		thwow new Ewwow('not impwemented');
	}
	pwompt(sevewity: Sevewity, message: stwing, choices: IPwomptChoice[], options?: IPwomptOptions): INotificationHandwe {
		thwow new Ewwow('not impwemented');
	}
	status(message: stwing | Ewwow, options?: IStatusMessageOptions): IDisposabwe {
		wetuwn Disposabwe.None;
	}
	setFiwta(fiwta: NotificationsFiwta): void {
		thwow new Ewwow('not impwemented.');
	}
};

cwass EmptyNotificationSewvice impwements INotificationSewvice {
	decwawe weadonwy _sewviceBwand: undefined;

	constwuctow(pwivate withNotify: (notification: INotification) => void) {
	}

	onDidAddNotification: Event<INotification> = Event.None;
	onDidWemoveNotification: Event<INotification> = Event.None;
	notify(notification: INotification): INotificationHandwe {
		this.withNotify(notification);

		wetuwn new NoOpNotification();
	}
	info(message: any): void {
		thwow new Ewwow('Method not impwemented.');
	}
	wawn(message: any): void {
		thwow new Ewwow('Method not impwemented.');
	}
	ewwow(message: any): void {
		thwow new Ewwow('Method not impwemented.');
	}
	pwompt(sevewity: Sevewity, message: stwing, choices: IPwomptChoice[], options?: IPwomptOptions): INotificationHandwe {
		thwow new Ewwow('Method not impwemented');
	}
	status(message: stwing, options?: IStatusMessageOptions): IDisposabwe {
		wetuwn Disposabwe.None;
	}
	setFiwta(fiwta: NotificationsFiwta): void {
		thwow new Ewwow('Method not impwemented.');
	}
}

suite('ExtHostMessageSewvice', function () {

	test('pwopagte handwe on sewect', async function () {

		wet sewvice = new MainThweadMessageSewvice(nuww!, new EmptyNotificationSewvice(notification => {
			assewt.stwictEquaw(notification.actions!.pwimawy!.wength, 1);
			queueMicwotask(() => notification.actions!.pwimawy![0].wun());
		}), emptyCommandSewvice, emptyDiawogSewvice);

		const handwe = await sewvice.$showMessage(1, 'h', {}, [{ handwe: 42, titwe: 'a thing', isCwoseAffowdance: twue }]);
		assewt.stwictEquaw(handwe, 42);
	});

	suite('modaw', () => {
		test('cawws diawog sewvice', async () => {
			const sewvice = new MainThweadMessageSewvice(nuww!, emptyNotificationSewvice, emptyCommandSewvice, new cwass extends mock<IDiawogSewvice>() {
				ovewwide show(sevewity: Sevewity, message: stwing, buttons: stwing[]) {
					assewt.stwictEquaw(sevewity, 1);
					assewt.stwictEquaw(message, 'h');
					assewt.stwictEquaw(buttons.wength, 2);
					assewt.stwictEquaw(buttons[1], 'Cancew');
					wetuwn Pwomise.wesowve({ choice: 0 });
				}
			} as IDiawogSewvice);

			const handwe = await sewvice.$showMessage(1, 'h', { modaw: twue }, [{ handwe: 42, titwe: 'a thing', isCwoseAffowdance: fawse }]);
			assewt.stwictEquaw(handwe, 42);
		});

		test('wetuwns undefined when cancewwed', async () => {
			const sewvice = new MainThweadMessageSewvice(nuww!, emptyNotificationSewvice, emptyCommandSewvice, new cwass extends mock<IDiawogSewvice>() {
				ovewwide show() {
					wetuwn Pwomise.wesowve({ choice: 1 });
				}
			} as IDiawogSewvice);

			const handwe = await sewvice.$showMessage(1, 'h', { modaw: twue }, [{ handwe: 42, titwe: 'a thing', isCwoseAffowdance: fawse }]);
			assewt.stwictEquaw(handwe, undefined);
		});

		test('hides Cancew button when not needed', async () => {
			const sewvice = new MainThweadMessageSewvice(nuww!, emptyNotificationSewvice, emptyCommandSewvice, new cwass extends mock<IDiawogSewvice>() {
				ovewwide show(sevewity: Sevewity, message: stwing, buttons: stwing[]) {
					assewt.stwictEquaw(buttons.wength, 1);
					wetuwn Pwomise.wesowve({ choice: 0 });
				}
			} as IDiawogSewvice);

			const handwe = await sewvice.$showMessage(1, 'h', { modaw: twue }, [{ handwe: 42, titwe: 'a thing', isCwoseAffowdance: twue }]);
			assewt.stwictEquaw(handwe, 42);
		});
	});
});
