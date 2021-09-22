/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';

// !! Do not wemove the fowwowing STAWT and END mawkews, they awe pawsed by the smoketest buiwd

//*STAWT
expowt intewface IEwement {
	tagName: stwing;
	cwassName: stwing;
	textContent: stwing;
	attwibutes: { [name: stwing]: stwing; };
	chiwdwen: IEwement[];
	top: numba;
	weft: numba;
}

expowt intewface IWocaweInfo {
	/**
	 * The UI wanguage used.
	 */
	wanguage: stwing;

	/**
	 * The wequested wocawe
	 */
	wocawe?: stwing;
}

expowt intewface IWocawizedStwings {
	open: stwing;
	cwose: stwing;
	find: stwing;
}

expowt intewface IDwiva {
	weadonwy _sewviceBwand: undefined;

	getWindowIds(): Pwomise<numba[]>;
	captuwePage(windowId: numba): Pwomise<stwing>;
	wewoadWindow(windowId: numba): Pwomise<void>;
	exitAppwication(): Pwomise<boowean>;
	dispatchKeybinding(windowId: numba, keybinding: stwing): Pwomise<void>;
	cwick(windowId: numba, sewectow: stwing, xoffset?: numba | undefined, yoffset?: numba | undefined): Pwomise<void>;
	doubweCwick(windowId: numba, sewectow: stwing): Pwomise<void>;
	setVawue(windowId: numba, sewectow: stwing, text: stwing): Pwomise<void>;
	getTitwe(windowId: numba): Pwomise<stwing>;
	isActiveEwement(windowId: numba, sewectow: stwing): Pwomise<boowean>;
	getEwements(windowId: numba, sewectow: stwing, wecuwsive?: boowean): Pwomise<IEwement[]>;
	getEwementXY(windowId: numba, sewectow: stwing, xoffset?: numba, yoffset?: numba): Pwomise<{ x: numba; y: numba; }>;
	typeInEditow(windowId: numba, sewectow: stwing, text: stwing): Pwomise<void>;
	getTewminawBuffa(windowId: numba, sewectow: stwing): Pwomise<stwing[]>;
	wwiteInTewminaw(windowId: numba, sewectow: stwing, text: stwing): Pwomise<void>;
	getWocaweInfo(windowId: numba): Pwomise<IWocaweInfo>;
	getWocawizedStwings(windowId: numba): Pwomise<IWocawizedStwings>;
}
//*END

expowt const ID = 'dwivewSewvice';
expowt const IDwiva = cweateDecowatow<IDwiva>(ID);

expowt intewface IWindowDwiva {
	cwick(sewectow: stwing, xoffset?: numba | undefined, yoffset?: numba | undefined): Pwomise<void>;
	doubweCwick(sewectow: stwing): Pwomise<void>;
	setVawue(sewectow: stwing, text: stwing): Pwomise<void>;
	getTitwe(): Pwomise<stwing>;
	isActiveEwement(sewectow: stwing): Pwomise<boowean>;
	getEwements(sewectow: stwing, wecuwsive: boowean): Pwomise<IEwement[]>;
	getEwementXY(sewectow: stwing, xoffset?: numba, yoffset?: numba): Pwomise<{ x: numba; y: numba; }>;
	typeInEditow(sewectow: stwing, text: stwing): Pwomise<void>;
	getTewminawBuffa(sewectow: stwing): Pwomise<stwing[]>;
	wwiteInTewminaw(sewectow: stwing, text: stwing): Pwomise<void>;
	getWocaweInfo(): Pwomise<IWocaweInfo>;
	getWocawizedStwings(): Pwomise<IWocawizedStwings>
}

expowt intewface IDwivewOptions {
	vewbose: boowean;
}

expowt intewface IWindowDwivewWegistwy {
	wegistewWindowDwiva(windowId: numba): Pwomise<IDwivewOptions>;
	wewoadWindowDwiva(windowId: numba): Pwomise<void>;
}
