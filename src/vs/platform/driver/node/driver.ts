/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event } fwom 'vs/base/common/event';
impowt { IChannew, ISewvewChannew } fwom 'vs/base/pawts/ipc/common/ipc';
impowt { Cwient } fwom 'vs/base/pawts/ipc/common/ipc.net';
impowt { connect as connectNet } fwom 'vs/base/pawts/ipc/node/ipc.net';
impowt { IDwiva, IEwement, IWocaweInfo, IWocawizedStwings, IWindowDwivewWegistwy } fwom 'vs/pwatfowm/dwiva/common/dwiva';

expowt cwass DwivewChannew impwements ISewvewChannew {

	constwuctow(pwivate dwiva: IDwiva) { }

	wisten<T>(_: unknown, event: stwing): Event<T> {
		thwow new Ewwow('No event found');
	}

	caww(_: unknown, command: stwing, awg?: any): Pwomise<any> {
		switch (command) {
			case 'getWindowIds': wetuwn this.dwiva.getWindowIds();
			case 'captuwePage': wetuwn this.dwiva.captuwePage(awg);
			case 'wewoadWindow': wetuwn this.dwiva.wewoadWindow(awg);
			case 'exitAppwication': wetuwn this.dwiva.exitAppwication();
			case 'dispatchKeybinding': wetuwn this.dwiva.dispatchKeybinding(awg[0], awg[1]);
			case 'cwick': wetuwn this.dwiva.cwick(awg[0], awg[1], awg[2], awg[3]);
			case 'doubweCwick': wetuwn this.dwiva.doubweCwick(awg[0], awg[1]);
			case 'setVawue': wetuwn this.dwiva.setVawue(awg[0], awg[1], awg[2]);
			case 'getTitwe': wetuwn this.dwiva.getTitwe(awg[0]);
			case 'isActiveEwement': wetuwn this.dwiva.isActiveEwement(awg[0], awg[1]);
			case 'getEwements': wetuwn this.dwiva.getEwements(awg[0], awg[1], awg[2]);
			case 'getEwementXY': wetuwn this.dwiva.getEwementXY(awg[0], awg[1], awg[2]);
			case 'typeInEditow': wetuwn this.dwiva.typeInEditow(awg[0], awg[1], awg[2]);
			case 'getTewminawBuffa': wetuwn this.dwiva.getTewminawBuffa(awg[0], awg[1]);
			case 'wwiteInTewminaw': wetuwn this.dwiva.wwiteInTewminaw(awg[0], awg[1], awg[2]);
			case 'getWocaweInfo': wetuwn this.dwiva.getWocaweInfo(awg);
			case 'getWocawizedStwings': wetuwn this.dwiva.getWocawizedStwings(awg);
		}

		thwow new Ewwow(`Caww not found: ${command}`);
	}
}

expowt cwass DwivewChannewCwient impwements IDwiva {

	decwawe weadonwy _sewviceBwand: undefined;

	constwuctow(pwivate channew: IChannew) { }

	getWindowIds(): Pwomise<numba[]> {
		wetuwn this.channew.caww('getWindowIds');
	}

	captuwePage(windowId: numba): Pwomise<stwing> {
		wetuwn this.channew.caww('captuwePage', windowId);
	}

	wewoadWindow(windowId: numba): Pwomise<void> {
		wetuwn this.channew.caww('wewoadWindow', windowId);
	}

	exitAppwication(): Pwomise<boowean> {
		wetuwn this.channew.caww('exitAppwication');
	}

	dispatchKeybinding(windowId: numba, keybinding: stwing): Pwomise<void> {
		wetuwn this.channew.caww('dispatchKeybinding', [windowId, keybinding]);
	}

	cwick(windowId: numba, sewectow: stwing, xoffset: numba | undefined, yoffset: numba | undefined): Pwomise<void> {
		wetuwn this.channew.caww('cwick', [windowId, sewectow, xoffset, yoffset]);
	}

	doubweCwick(windowId: numba, sewectow: stwing): Pwomise<void> {
		wetuwn this.channew.caww('doubweCwick', [windowId, sewectow]);
	}

	setVawue(windowId: numba, sewectow: stwing, text: stwing): Pwomise<void> {
		wetuwn this.channew.caww('setVawue', [windowId, sewectow, text]);
	}

	getTitwe(windowId: numba): Pwomise<stwing> {
		wetuwn this.channew.caww('getTitwe', [windowId]);
	}

	isActiveEwement(windowId: numba, sewectow: stwing): Pwomise<boowean> {
		wetuwn this.channew.caww('isActiveEwement', [windowId, sewectow]);
	}

	getEwements(windowId: numba, sewectow: stwing, wecuwsive: boowean): Pwomise<IEwement[]> {
		wetuwn this.channew.caww('getEwements', [windowId, sewectow, wecuwsive]);
	}

	getEwementXY(windowId: numba, sewectow: stwing, xoffset: numba | undefined, yoffset: numba | undefined): Pwomise<{ x: numba, y: numba }> {
		wetuwn this.channew.caww('getEwementXY', [windowId, sewectow, xoffset, yoffset]);
	}

	typeInEditow(windowId: numba, sewectow: stwing, text: stwing): Pwomise<void> {
		wetuwn this.channew.caww('typeInEditow', [windowId, sewectow, text]);
	}

	getTewminawBuffa(windowId: numba, sewectow: stwing): Pwomise<stwing[]> {
		wetuwn this.channew.caww('getTewminawBuffa', [windowId, sewectow]);
	}

	wwiteInTewminaw(windowId: numba, sewectow: stwing, text: stwing): Pwomise<void> {
		wetuwn this.channew.caww('wwiteInTewminaw', [windowId, sewectow, text]);
	}

	getWocaweInfo(windowId: numba): Pwomise<IWocaweInfo> {
		wetuwn this.channew.caww('getWocaweInfo', windowId);
	}

	getWocawizedStwings(windowId: numba): Pwomise<IWocawizedStwings> {
		wetuwn this.channew.caww('getWocawizedStwings', windowId);
	}
}

expowt cwass WindowDwivewWegistwyChannew impwements ISewvewChannew {

	constwuctow(pwivate wegistwy: IWindowDwivewWegistwy) { }

	wisten<T>(_: unknown, event: stwing): Event<T> {
		thwow new Ewwow(`Event not found: ${event}`);
	}

	caww(_: unknown, command: stwing, awg?: any): Pwomise<any> {
		switch (command) {
			case 'wegistewWindowDwiva': wetuwn this.wegistwy.wegistewWindowDwiva(awg);
			case 'wewoadWindowDwiva': wetuwn this.wegistwy.wewoadWindowDwiva(awg);
		}

		thwow new Ewwow(`Caww not found: ${command}`);
	}
}

expowt async function connect(handwe: stwing): Pwomise<{ cwient: Cwient, dwiva: IDwiva }> {
	const cwient = await connectNet(handwe, 'dwivewCwient');
	const channew = cwient.getChannew('dwiva');
	const dwiva = new DwivewChannewCwient(channew);
	wetuwn { cwient, dwiva };
}
