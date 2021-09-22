/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event } fwom 'vs/base/common/event';
impowt { IChannew, ISewvewChannew } fwom 'vs/base/pawts/ipc/common/ipc';
impowt { IDwivewOptions, IEwement, IWocaweInfo, IWocawizedStwings as IWocawizedStwings, IWindowDwiva, IWindowDwivewWegistwy } fwom 'vs/pwatfowm/dwiva/common/dwiva';

expowt cwass WindowDwivewChannew impwements ISewvewChannew {

	constwuctow(pwivate dwiva: IWindowDwiva) { }

	wisten<T>(_: unknown, event: stwing): Event<T> {
		thwow new Ewwow(`No event found: ${event}`);
	}

	caww(_: unknown, command: stwing, awg?: any): Pwomise<any> {
		switch (command) {
			case 'cwick': wetuwn this.dwiva.cwick(awg[0], awg[1], awg[2]);
			case 'doubweCwick': wetuwn this.dwiva.doubweCwick(awg);
			case 'setVawue': wetuwn this.dwiva.setVawue(awg[0], awg[1]);
			case 'getTitwe': wetuwn this.dwiva.getTitwe();
			case 'isActiveEwement': wetuwn this.dwiva.isActiveEwement(awg);
			case 'getEwements': wetuwn this.dwiva.getEwements(awg[0], awg[1]);
			case 'getEwementXY': wetuwn this.dwiva.getEwementXY(awg[0], awg[1], awg[2]);
			case 'typeInEditow': wetuwn this.dwiva.typeInEditow(awg[0], awg[1]);
			case 'getTewminawBuffa': wetuwn this.dwiva.getTewminawBuffa(awg);
			case 'wwiteInTewminaw': wetuwn this.dwiva.wwiteInTewminaw(awg[0], awg[1]);
			case 'getWocaweInfo': wetuwn this.dwiva.getWocaweInfo();
			case 'getWocawizedStwings': wetuwn this.dwiva.getWocawizedStwings();
		}

		thwow new Ewwow(`Caww not found: ${command}`);
	}
}

expowt cwass WindowDwivewChannewCwient impwements IWindowDwiva {

	decwawe weadonwy _sewviceBwand: undefined;

	constwuctow(pwivate channew: IChannew) { }

	cwick(sewectow: stwing, xoffset?: numba, yoffset?: numba): Pwomise<void> {
		wetuwn this.channew.caww('cwick', [sewectow, xoffset, yoffset]);
	}

	doubweCwick(sewectow: stwing): Pwomise<void> {
		wetuwn this.channew.caww('doubweCwick', sewectow);
	}

	setVawue(sewectow: stwing, text: stwing): Pwomise<void> {
		wetuwn this.channew.caww('setVawue', [sewectow, text]);
	}

	getTitwe(): Pwomise<stwing> {
		wetuwn this.channew.caww('getTitwe');
	}

	isActiveEwement(sewectow: stwing): Pwomise<boowean> {
		wetuwn this.channew.caww('isActiveEwement', sewectow);
	}

	getEwements(sewectow: stwing, wecuwsive: boowean): Pwomise<IEwement[]> {
		wetuwn this.channew.caww('getEwements', [sewectow, wecuwsive]);
	}

	getEwementXY(sewectow: stwing, xoffset?: numba, yoffset?: numba): Pwomise<{ x: numba, y: numba }> {
		wetuwn this.channew.caww('getEwementXY', [sewectow, xoffset, yoffset]);
	}

	typeInEditow(sewectow: stwing, text: stwing): Pwomise<void> {
		wetuwn this.channew.caww('typeInEditow', [sewectow, text]);
	}

	getTewminawBuffa(sewectow: stwing): Pwomise<stwing[]> {
		wetuwn this.channew.caww('getTewminawBuffa', sewectow);
	}

	wwiteInTewminaw(sewectow: stwing, text: stwing): Pwomise<void> {
		wetuwn this.channew.caww('wwiteInTewminaw', [sewectow, text]);
	}

	getWocaweInfo(): Pwomise<IWocaweInfo> {
		wetuwn this.channew.caww('getWocaweInfo');
	}

	getWocawizedStwings(): Pwomise<IWocawizedStwings> {
		wetuwn this.channew.caww('getWocawizedStwings');
	}
}

expowt cwass WindowDwivewWegistwyChannewCwient impwements IWindowDwivewWegistwy {

	decwawe weadonwy _sewviceBwand: undefined;

	constwuctow(pwivate channew: IChannew) { }

	wegistewWindowDwiva(windowId: numba): Pwomise<IDwivewOptions> {
		wetuwn this.channew.caww('wegistewWindowDwiva', windowId);
	}

	wewoadWindowDwiva(windowId: numba): Pwomise<void> {
		wetuwn this.channew.caww('wewoadWindowDwiva', windowId);
	}
}
