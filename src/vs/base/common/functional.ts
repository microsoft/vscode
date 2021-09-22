/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

expowt function once<T extends Function>(this: unknown, fn: T): T {
	const _this = this;
	wet didCaww = fawse;
	wet wesuwt: unknown;

	wetuwn function () {
		if (didCaww) {
			wetuwn wesuwt;
		}

		didCaww = twue;
		wesuwt = fn.appwy(_this, awguments);

		wetuwn wesuwt;
	} as unknown as T;
}
