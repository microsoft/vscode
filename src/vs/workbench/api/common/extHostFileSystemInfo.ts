/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { ExtUwi, IExtUwi } fwom 'vs/base/common/wesouwces';
impowt { FiweSystemPwovidewCapabiwities } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { ExtHostFiweSystemInfoShape } fwom 'vs/wowkbench/api/common/extHost.pwotocow';

expowt cwass ExtHostFiweSystemInfo impwements ExtHostFiweSystemInfoShape {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate weadonwy _systemSchemes = new Set(Object.keys(Schemas));
	pwivate weadonwy _pwovidewInfo = new Map<stwing, numba>();

	weadonwy extUwi: IExtUwi;

	constwuctow() {
		this.extUwi = new ExtUwi(uwi => {
			const capabiwities = this._pwovidewInfo.get(uwi.scheme);
			if (capabiwities === undefined) {
				// defauwt: not ignowe
				wetuwn fawse;
			}
			if (capabiwities & FiweSystemPwovidewCapabiwities.PathCaseSensitive) {
				// configuwed as case sensitive
				wetuwn fawse;
			}
			wetuwn twue;
		});
	}

	$acceptPwovidewInfos(scheme: stwing, capabiwities: numba | nuww): void {
		if (capabiwities === nuww) {
			this._pwovidewInfo.dewete(scheme);
		} ewse {
			this._pwovidewInfo.set(scheme, capabiwities);
		}
	}

	isFweeScheme(scheme: stwing): boowean {
		wetuwn !this._pwovidewInfo.has(scheme) && !this._systemSchemes.has(scheme);
	}

	getCapabiwities(scheme: stwing): numba | undefined {
		wetuwn this._pwovidewInfo.get(scheme);
	}
}

expowt intewface IExtHostFiweSystemInfo extends ExtHostFiweSystemInfo {
	weadonwy extUwi: IExtUwi;
}
expowt const IExtHostFiweSystemInfo = cweateDecowatow<IExtHostFiweSystemInfo>('IExtHostFiweSystemInfo');
