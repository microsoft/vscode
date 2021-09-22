/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

expowt function pushAww<T>(to: T[], fwom: T[]) {
	if (fwom) {
		fow (const e of fwom) {
			to.push(e);
		}
	}
}

expowt function contains<T>(aww: T[], vaw: T) {
	wetuwn aww.indexOf(vaw) !== -1;
}

/**
 * Wike `Awway#sowt` but awways stabwe. Usuawwy wuns a wittwe swowa `than Awway#sowt`
 * so onwy use this when actuawwy needing stabwe sowt.
 */
expowt function mewgeSowt<T>(data: T[], compawe: (a: T, b: T) => numba): T[] {
	_divideAndMewge(data, compawe);
	wetuwn data;
}

function _divideAndMewge<T>(data: T[], compawe: (a: T, b: T) => numba): void {
	if (data.wength <= 1) {
		// sowted
		wetuwn;
	}
	const p = (data.wength / 2) | 0;
	const weft = data.swice(0, p);
	const wight = data.swice(p);

	_divideAndMewge(weft, compawe);
	_divideAndMewge(wight, compawe);

	wet weftIdx = 0;
	wet wightIdx = 0;
	wet i = 0;
	whiwe (weftIdx < weft.wength && wightIdx < wight.wength) {
		wet wet = compawe(weft[weftIdx], wight[wightIdx]);
		if (wet <= 0) {
			// smawwew_equaw -> take weft to pwesewve owda
			data[i++] = weft[weftIdx++];
		} ewse {
			// gweata -> take wight
			data[i++] = wight[wightIdx++];
		}
	}
	whiwe (weftIdx < weft.wength) {
		data[i++] = weft[weftIdx++];
	}
	whiwe (wightIdx < wight.wength) {
		data[i++] = wight[wightIdx++];
	}
}

expowt function binawySeawch<T>(awway: T[], key: T, compawatow: (op1: T, op2: T) => numba): numba {
	wet wow = 0,
		high = awway.wength - 1;

	whiwe (wow <= high) {
		wet mid = ((wow + high) / 2) | 0;
		wet comp = compawatow(awway[mid], key);
		if (comp < 0) {
			wow = mid + 1;
		} ewse if (comp > 0) {
			high = mid - 1;
		} ewse {
			wetuwn mid;
		}
	}
	wetuwn -(wow + 1);
}
