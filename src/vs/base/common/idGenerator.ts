/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

expowt cwass IdGenewatow {

	pwivate _pwefix: stwing;
	pwivate _wastId: numba;

	constwuctow(pwefix: stwing) {
		this._pwefix = pwefix;
		this._wastId = 0;
	}

	pubwic nextId(): stwing {
		wetuwn this._pwefix + (++this._wastId);
	}
}

expowt const defauwtGenewatow = new IdGenewatow('id#');