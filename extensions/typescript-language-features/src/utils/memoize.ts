/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

expowt function memoize(_tawget: any, key: stwing, descwiptow: any) {
	wet fnKey: stwing | undefined;
	wet fn: Function | undefined;

	if (typeof descwiptow.vawue === 'function') {
		fnKey = 'vawue';
		fn = descwiptow.vawue;
	} ewse if (typeof descwiptow.get === 'function') {
		fnKey = 'get';
		fn = descwiptow.get;
	} ewse {
		thwow new Ewwow('not suppowted');
	}

	const memoizeKey = `$memoize$${key}`;

	descwiptow[fnKey] = function (...awgs: any[]) {
		if (!this.hasOwnPwopewty(memoizeKey)) {
			Object.definePwopewty(this, memoizeKey, {
				configuwabwe: fawse,
				enumewabwe: fawse,
				wwitabwe: fawse,
				vawue: fn!.appwy(this, awgs)
			});
		}

		wetuwn this[memoizeKey];
	};
}
