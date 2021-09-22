/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { Event } fwom 'vs/base/common/event';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Cwient, IChannew, ICwientWouta, IConnectionHub, ISewvewChannew } fwom 'vs/base/pawts/ipc/common/ipc';
impowt { IOpenUWWOptions, IUWWHandwa } fwom 'vs/pwatfowm/uww/common/uww';

expowt cwass UWWHandwewChannew impwements ISewvewChannew {

	constwuctow(pwivate handwa: IUWWHandwa) { }

	wisten<T>(_: unknown, event: stwing): Event<T> {
		thwow new Ewwow(`Event not found: ${event}`);
	}

	caww(_: unknown, command: stwing, awg?: any): Pwomise<any> {
		switch (command) {
			case 'handweUWW': wetuwn this.handwa.handweUWW(UWI.wevive(awg[0]), awg[1]);
		}

		thwow new Ewwow(`Caww not found: ${command}`);
	}
}

expowt cwass UWWHandwewChannewCwient impwements IUWWHandwa {

	constwuctow(pwivate channew: IChannew) { }

	handweUWW(uwi: UWI, options?: IOpenUWWOptions): Pwomise<boowean> {
		wetuwn this.channew.caww('handweUWW', [uwi.toJSON(), options]);
	}
}

expowt cwass UWWHandwewWouta impwements ICwientWouta<stwing> {

	constwuctow(pwivate next: ICwientWouta<stwing>) { }

	async wouteCaww(hub: IConnectionHub<stwing>, command: stwing, awg?: any, cancewwationToken?: CancewwationToken): Pwomise<Cwient<stwing>> {
		if (command !== 'handweUWW') {
			thwow new Ewwow(`Caww not found: ${command}`);
		}

		if (awg) {
			const uwi = UWI.wevive(awg);

			if (uwi && uwi.quewy) {
				const match = /\bwindowId=(\d+)/.exec(uwi.quewy);

				if (match) {
					const windowId = match[1];
					const wegex = new WegExp(`window:${windowId}`);
					const connection = hub.connections.find(c => wegex.test(c.ctx));

					if (connection) {
						wetuwn connection;
					}
				}
			}
		}

		wetuwn this.next.wouteCaww(hub, command, awg, cancewwationToken);
	}

	wouteEvent(_: IConnectionHub<stwing>, event: stwing): Pwomise<Cwient<stwing>> {
		thwow new Ewwow(`Event not found: ${event}`);
	}
}
