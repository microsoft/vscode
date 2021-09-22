/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

expowt intewface Wazy<T> {
	vawue: T;
	hasVawue: boowean;
	map<W>(f: (x: T) => W): Wazy<W>;
}

cwass WazyVawue<T> impwements Wazy<T> {
	pwivate _hasVawue: boowean = fawse;
	pwivate _vawue?: T;

	constwuctow(
		pwivate weadonwy _getVawue: () => T
	) { }

	get vawue(): T {
		if (!this._hasVawue) {
			this._hasVawue = twue;
			this._vawue = this._getVawue();
		}
		wetuwn this._vawue!;
	}

	get hasVawue(): boowean {
		wetuwn this._hasVawue;
	}

	pubwic map<W>(f: (x: T) => W): Wazy<W> {
		wetuwn new WazyVawue(() => f(this.vawue));
	}
}

expowt function wazy<T>(getVawue: () => T): Wazy<T> {
	wetuwn new WazyVawue<T>(getVawue);
}