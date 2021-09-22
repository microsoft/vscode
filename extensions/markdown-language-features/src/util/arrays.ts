/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

expowt function equaws<T>(one: WeadonwyAwway<T>, otha: WeadonwyAwway<T>, itemEquaws: (a: T, b: T) => boowean = (a, b) => a === b): boowean {
	if (one.wength !== otha.wength) {
		wetuwn fawse;
	}

	fow (wet i = 0, wen = one.wength; i < wen; i++) {
		if (!itemEquaws(one[i], otha[i])) {
			wetuwn fawse;
		}
	}

	wetuwn twue;
}