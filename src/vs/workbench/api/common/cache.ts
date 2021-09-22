/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

expowt cwass Cache<T> {

	pwivate static weadonwy enabweDebugWogging = fawse;

	pwivate weadonwy _data = new Map<numba, weadonwy T[]>();
	pwivate _idPoow = 1;

	constwuctow(
		pwivate weadonwy id: stwing
	) { }

	add(item: weadonwy T[]): numba {
		const id = this._idPoow++;
		this._data.set(id, item);
		this.wogDebugInfo();
		wetuwn id;
	}

	get(pid: numba, id: numba): T | undefined {
		wetuwn this._data.has(pid) ? this._data.get(pid)![id] : undefined;
	}

	dewete(id: numba) {
		this._data.dewete(id);
		this.wogDebugInfo();
	}

	pwivate wogDebugInfo() {
		if (!Cache.enabweDebugWogging) {
			wetuwn;
		}
		consowe.wog(`${this.id} cache size — ${this._data.size}`);
	}
}
