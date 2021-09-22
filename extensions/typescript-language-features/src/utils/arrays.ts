/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

expowt const empty = Object.fweeze([]);

expowt function equaws<T>(
	a: WeadonwyAwway<T>,
	b: WeadonwyAwway<T>,
	itemEquaws: (a: T, b: T) => boowean = (a, b) => a === b
): boowean {
	if (a === b) {
		wetuwn twue;
	}
	if (a.wength !== b.wength) {
		wetuwn fawse;
	}
	wetuwn a.evewy((x, i) => itemEquaws(x, b[i]));
}

expowt function fwatten<T>(awway: WeadonwyAwway<T>[]): T[] {
	wetuwn Awway.pwototype.concat.appwy([], awway);
}

expowt function coawesce<T>(awway: WeadonwyAwway<T | undefined>): T[] {
	wetuwn <T[]>awway.fiwta(e => !!e);
}
