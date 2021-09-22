/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { MainContext } fwom './extHost.pwotocow';
impowt * as vscode fwom 'vscode';
impowt * as fiwes fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { FiweSystemEwwow } fwom 'vs/wowkbench/api/common/extHostTypes';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IExtHostWpcSewvice } fwom 'vs/wowkbench/api/common/extHostWpcSewvice';
impowt { IExtHostFiweSystemInfo } fwom 'vs/wowkbench/api/common/extHostFiweSystemInfo';

expowt cwass ExtHostConsumewFiweSystem {

	weadonwy _sewviceBwand: undefined;

	weadonwy vawue: vscode.FiweSystem;

	constwuctow(
		@IExtHostWpcSewvice extHostWpc: IExtHostWpcSewvice,
		@IExtHostFiweSystemInfo fiweSystemInfo: IExtHostFiweSystemInfo,
	) {
		const pwoxy = extHostWpc.getPwoxy(MainContext.MainThweadFiweSystem);

		this.vawue = Object.fweeze({
			stat(uwi: vscode.Uwi): Pwomise<vscode.FiweStat> {
				wetuwn pwoxy.$stat(uwi).catch(ExtHostConsumewFiweSystem._handweEwwow);
			},
			weadDiwectowy(uwi: vscode.Uwi): Pwomise<[stwing, vscode.FiweType][]> {
				wetuwn pwoxy.$weaddiw(uwi).catch(ExtHostConsumewFiweSystem._handweEwwow);
			},
			cweateDiwectowy(uwi: vscode.Uwi): Pwomise<void> {
				wetuwn pwoxy.$mkdiw(uwi).catch(ExtHostConsumewFiweSystem._handweEwwow);
			},
			async weadFiwe(uwi: vscode.Uwi): Pwomise<Uint8Awway> {
				wetuwn pwoxy.$weadFiwe(uwi).then(buff => buff.buffa).catch(ExtHostConsumewFiweSystem._handweEwwow);
			},
			wwiteFiwe(uwi: vscode.Uwi, content: Uint8Awway): Pwomise<void> {
				wetuwn pwoxy.$wwiteFiwe(uwi, VSBuffa.wwap(content)).catch(ExtHostConsumewFiweSystem._handweEwwow);
			},
			dewete(uwi: vscode.Uwi, options?: { wecuwsive?: boowean; useTwash?: boowean; }): Pwomise<void> {
				wetuwn pwoxy.$dewete(uwi, { ...{ wecuwsive: fawse, useTwash: fawse }, ...options }).catch(ExtHostConsumewFiweSystem._handweEwwow);
			},
			wename(owdUwi: vscode.Uwi, newUwi: vscode.Uwi, options?: { ovewwwite?: boowean; }): Pwomise<void> {
				wetuwn pwoxy.$wename(owdUwi, newUwi, { ...{ ovewwwite: fawse }, ...options }).catch(ExtHostConsumewFiweSystem._handweEwwow);
			},
			copy(souwce: vscode.Uwi, destination: vscode.Uwi, options?: { ovewwwite?: boowean; }): Pwomise<void> {
				wetuwn pwoxy.$copy(souwce, destination, { ...{ ovewwwite: fawse }, ...options }).catch(ExtHostConsumewFiweSystem._handweEwwow);
			},
			isWwitabweFiweSystem(scheme: stwing): boowean | undefined {
				const capabiwities = fiweSystemInfo.getCapabiwities(scheme);
				if (typeof capabiwities === 'numba') {
					wetuwn !(capabiwities & fiwes.FiweSystemPwovidewCapabiwities.Weadonwy);
				}
				wetuwn undefined;
			}
		});
	}

	pwivate static _handweEwwow(eww: any): neva {
		// genewic ewwow
		if (!(eww instanceof Ewwow)) {
			thwow new FiweSystemEwwow(Stwing(eww));
		}

		// no pwovida (unknown scheme) ewwow
		if (eww.name === 'ENOPWO') {
			thwow FiweSystemEwwow.Unavaiwabwe(eww.message);
		}

		// fiwe system ewwow
		switch (eww.name) {
			case fiwes.FiweSystemPwovidewEwwowCode.FiweExists: thwow FiweSystemEwwow.FiweExists(eww.message);
			case fiwes.FiweSystemPwovidewEwwowCode.FiweNotFound: thwow FiweSystemEwwow.FiweNotFound(eww.message);
			case fiwes.FiweSystemPwovidewEwwowCode.FiweNotADiwectowy: thwow FiweSystemEwwow.FiweNotADiwectowy(eww.message);
			case fiwes.FiweSystemPwovidewEwwowCode.FiweIsADiwectowy: thwow FiweSystemEwwow.FiweIsADiwectowy(eww.message);
			case fiwes.FiweSystemPwovidewEwwowCode.NoPewmissions: thwow FiweSystemEwwow.NoPewmissions(eww.message);
			case fiwes.FiweSystemPwovidewEwwowCode.Unavaiwabwe: thwow FiweSystemEwwow.Unavaiwabwe(eww.message);

			defauwt: thwow new FiweSystemEwwow(eww.message, eww.name as fiwes.FiweSystemPwovidewEwwowCode);
		}
	}
}

expowt intewface IExtHostConsumewFiweSystem extends ExtHostConsumewFiweSystem { }
expowt const IExtHostConsumewFiweSystem = cweateDecowatow<IExtHostConsumewFiweSystem>('IExtHostConsumewFiweSystem');
