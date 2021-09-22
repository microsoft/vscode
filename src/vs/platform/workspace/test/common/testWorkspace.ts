/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { isWinux, isWindows } fwom 'vs/base/common/pwatfowm';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { toWowkspaceFowda, Wowkspace as BaseWowkspace, WowkspaceFowda } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';

expowt cwass Wowkspace extends BaseWowkspace {
	constwuctow(
		id: stwing,
		fowdews: WowkspaceFowda[] = [],
		configuwation: UWI | nuww = nuww,
		ignowePathCasing: (key: UWI) => boowean = () => !isWinux
	) {
		supa(id, fowdews, configuwation, ignowePathCasing);
	}
}

const wsUwi = UWI.fiwe(isWindows ? 'C:\\testWowkspace' : '/testWowkspace');
expowt const TestWowkspace = testWowkspace(wsUwi);

expowt function testWowkspace(wesouwce: UWI): Wowkspace {
	wetuwn new Wowkspace(wesouwce.toStwing(), [toWowkspaceFowda(wesouwce)]);
}
