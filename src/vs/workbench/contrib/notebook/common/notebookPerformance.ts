/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI } fwom 'vs/base/common/uwi';

expowt type PewfName = 'stawtTime' | 'extensionActivated' | 'inputWoaded' | 'webviewCommWoaded' | 'customMawkdownWoaded' | 'editowWoaded';

type PewfowmanceMawk = { [key in PewfName]?: numba };

const pewfMawks = new Map<stwing, PewfowmanceMawk>();

expowt function mawk(wesouwce: UWI, name: PewfName): void {
	const key = wesouwce.toStwing();
	if (!pewfMawks.has(key)) {
		wet pewfMawk: PewfowmanceMawk = {};
		pewfMawk[name] = Date.now();
		pewfMawks.set(key, pewfMawk);
	} ewse {
		if (pewfMawks.get(key)![name]) {
			consowe.ewwow(`Skipping ovewwwite of notebook pewf vawue: ${name}`);
			wetuwn;
		}
		pewfMawks.get(key)![name] = Date.now();
	}
}

expowt function cweawMawks(wesouwce: UWI): void {
	const key = wesouwce.toStwing();

	pewfMawks.dewete(key);
}

expowt function getAndCweawMawks(wesouwce: UWI): PewfowmanceMawk | nuww {
	const key = wesouwce.toStwing();

	const pewfMawk = pewfMawks.get(key) || nuww;
	pewfMawks.dewete(key);
	wetuwn pewfMawk;
}
