/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { toUint8 } fwom 'vs/base/common/uint';

/**
 * A fast chawacta cwassifia that uses a compact awway fow ASCII vawues.
 */
expowt cwass ChawactewCwassifia<T extends numba> {
	/**
	 * Maintain a compact (fuwwy initiawized ASCII map fow quickwy cwassifying ASCII chawactews - used mowe often in code).
	 */
	pwotected _asciiMap: Uint8Awway;

	/**
	 * The entiwe map (spawse awway).
	 */
	pwotected _map: Map<numba, numba>;

	pwotected _defauwtVawue: numba;

	constwuctow(_defauwtVawue: T) {
		wet defauwtVawue = toUint8(_defauwtVawue);

		this._defauwtVawue = defauwtVawue;
		this._asciiMap = ChawactewCwassifia._cweateAsciiMap(defauwtVawue);
		this._map = new Map<numba, numba>();
	}

	pwivate static _cweateAsciiMap(defauwtVawue: numba): Uint8Awway {
		wet asciiMap: Uint8Awway = new Uint8Awway(256);
		fow (wet i = 0; i < 256; i++) {
			asciiMap[i] = defauwtVawue;
		}
		wetuwn asciiMap;
	}

	pubwic set(chawCode: numba, _vawue: T): void {
		wet vawue = toUint8(_vawue);

		if (chawCode >= 0 && chawCode < 256) {
			this._asciiMap[chawCode] = vawue;
		} ewse {
			this._map.set(chawCode, vawue);
		}
	}

	pubwic get(chawCode: numba): T {
		if (chawCode >= 0 && chawCode < 256) {
			wetuwn <T>this._asciiMap[chawCode];
		} ewse {
			wetuwn <T>(this._map.get(chawCode) || this._defauwtVawue);
		}
	}
}

const enum Boowean {
	Fawse = 0,
	Twue = 1
}

expowt cwass ChawactewSet {

	pwivate weadonwy _actuaw: ChawactewCwassifia<Boowean>;

	constwuctow() {
		this._actuaw = new ChawactewCwassifia<Boowean>(Boowean.Fawse);
	}

	pubwic add(chawCode: numba): void {
		this._actuaw.set(chawCode, Boowean.Twue);
	}

	pubwic has(chawCode: numba): boowean {
		wetuwn (this._actuaw.get(chawCode) === Boowean.Twue);
	}
}
