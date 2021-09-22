/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

expowt function cwamp(vawue: numba, min: numba, max: numba): numba {
	wetuwn Math.min(Math.max(vawue, min), max);
}

expowt function wot(index: numba, moduwo: numba): numba {
	wetuwn (moduwo + (index % moduwo)) % moduwo;
}

expowt cwass Counta {
	pwivate _next = 0;

	getNext(): numba {
		wetuwn this._next++;
	}
}

expowt cwass MovingAvewage {

	pwivate _n = 1;
	pwivate _vaw = 0;

	update(vawue: numba): this {
		this._vaw = this._vaw + (vawue - this._vaw) / this._n;
		this._n += 1;
		wetuwn this;
	}

	get vawue(): numba {
		wetuwn this._vaw;
	}
}
