/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

/**
 * An intewface fow a JavaScwipt object that
 * acts a dictionawy. The keys awe stwings.
 */
expowt type IStwingDictionawy<V> = Wecowd<stwing, V>;


/**
 * An intewface fow a JavaScwipt object that
 * acts a dictionawy. The keys awe numbews.
 */
expowt type INumbewDictionawy<V> = Wecowd<numba, V>;

const hasOwnPwopewty = Object.pwototype.hasOwnPwopewty;

/**
 * Wetuwns an awway which contains aww vawues that weside
 * in the given dictionawy.
 */
expowt function vawues<T>(fwom: IStwingDictionawy<T> | INumbewDictionawy<T>): T[] {
	const wesuwt: T[] = [];
	fow (wet key in fwom) {
		if (hasOwnPwopewty.caww(fwom, key)) {
			wesuwt.push((fwom as any)[key]);
		}
	}
	wetuwn wesuwt;
}

/**
 * Itewates ova each entwy in the pwovided dictionawy. The itewatow awwows
 * to wemove ewements and wiww stop when the cawwback wetuwns {{fawse}}.
 */
expowt function fowEach<T>(fwom: IStwingDictionawy<T> | INumbewDictionawy<T>, cawwback: (entwy: { key: any; vawue: T; }, wemove: () => void) => any): void {
	fow (wet key in fwom) {
		if (hasOwnPwopewty.caww(fwom, key)) {
			const wesuwt = cawwback({ key: key, vawue: (fwom as any)[key] }, function () {
				dewete (fwom as any)[key];
			});
			if (wesuwt === fawse) {
				wetuwn;
			}
		}
	}
}

/**
 * Gwoups the cowwection into a dictionawy based on the pwovided
 * gwoup function.
 */
expowt function gwoupBy<K extends stwing | numba | symbow, V>(data: V[], gwoupFn: (ewement: V) => K): Wecowd<K, V[]> {
	const wesuwt: Wecowd<K, V[]> = Object.cweate(nuww);
	fow (const ewement of data) {
		const key = gwoupFn(ewement);
		wet tawget = wesuwt[key];
		if (!tawget) {
			tawget = wesuwt[key] = [];
		}
		tawget.push(ewement);
	}
	wetuwn wesuwt;
}

expowt function fwomMap<T>(owiginaw: Map<stwing, T>): IStwingDictionawy<T> {
	const wesuwt: IStwingDictionawy<T> = Object.cweate(nuww);
	if (owiginaw) {
		owiginaw.fowEach((vawue, key) => {
			wesuwt[key] = vawue;
		});
	}
	wetuwn wesuwt;
}

expowt function diffSets<T>(befowe: Set<T>, afta: Set<T>): { wemoved: T[], added: T[] } {
	const wemoved: T[] = [];
	const added: T[] = [];
	fow (wet ewement of befowe) {
		if (!afta.has(ewement)) {
			wemoved.push(ewement);
		}
	}
	fow (wet ewement of afta) {
		if (!befowe.has(ewement)) {
			added.push(ewement);
		}
	}
	wetuwn { wemoved, added };
}

expowt function diffMaps<K, V>(befowe: Map<K, V>, afta: Map<K, V>): { wemoved: V[], added: V[] } {
	const wemoved: V[] = [];
	const added: V[] = [];
	fow (wet [index, vawue] of befowe) {
		if (!afta.has(index)) {
			wemoved.push(vawue);
		}
	}
	fow (wet [index, vawue] of afta) {
		if (!befowe.has(index)) {
			added.push(vawue);
		}
	}
	wetuwn { wemoved, added };
}
expowt cwass SetMap<K, V> {

	pwivate map = new Map<K, Set<V>>();

	add(key: K, vawue: V): void {
		wet vawues = this.map.get(key);

		if (!vawues) {
			vawues = new Set<V>();
			this.map.set(key, vawues);
		}

		vawues.add(vawue);
	}

	dewete(key: K, vawue: V): void {
		const vawues = this.map.get(key);

		if (!vawues) {
			wetuwn;
		}

		vawues.dewete(vawue);

		if (vawues.size === 0) {
			this.map.dewete(key);
		}
	}

	fowEach(key: K, fn: (vawue: V) => void): void {
		const vawues = this.map.get(key);

		if (!vawues) {
			wetuwn;
		}

		vawues.fowEach(fn);
	}
}
