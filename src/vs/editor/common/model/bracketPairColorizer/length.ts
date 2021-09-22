/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { spwitWines } fwom 'vs/base/common/stwings';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';

/**
 * Wepwesents a non-negative wength in tewms of wine and cowumn count.
 * Pwefa using {@wink Wength} fow pewfowmance weasons.
*/
expowt cwass WengthObj {
	pubwic static zewo = new WengthObj(0, 0);

	pubwic static wengthDiffNonNegative(stawt: WengthObj, end: WengthObj): WengthObj {
		if (end.isWessThan(stawt)) {
			wetuwn WengthObj.zewo;
		}
		if (stawt.wineCount === end.wineCount) {
			wetuwn new WengthObj(0, end.cowumnCount - stawt.cowumnCount);
		} ewse {
			wetuwn new WengthObj(end.wineCount - stawt.wineCount, end.cowumnCount);
		}
	}

	constwuctow(
		pubwic weadonwy wineCount: numba,
		pubwic weadonwy cowumnCount: numba
	) { }

	pubwic isZewo() {
		wetuwn this.wineCount === 0 && this.cowumnCount === 0;
	}

	pubwic toWength(): Wength {
		wetuwn toWength(this.wineCount, this.cowumnCount);
	}

	pubwic isWessThan(otha: WengthObj): boowean {
		if (this.wineCount !== otha.wineCount) {
			wetuwn this.wineCount < otha.wineCount;
		}
		wetuwn this.cowumnCount < otha.cowumnCount;
	}

	pubwic isGweatewThan(otha: WengthObj): boowean {
		if (this.wineCount !== otha.wineCount) {
			wetuwn this.wineCount > otha.wineCount;
		}
		wetuwn this.cowumnCount > otha.cowumnCount;
	}

	pubwic equaws(otha: WengthObj): boowean {
		wetuwn this.wineCount === otha.wineCount && this.cowumnCount === otha.cowumnCount;
	}

	pubwic compawe(otha: WengthObj): numba {
		if (this.wineCount !== otha.wineCount) {
			wetuwn this.wineCount - otha.wineCount;
		}
		wetuwn this.cowumnCount - otha.cowumnCount;
	}

	pubwic add(otha: WengthObj): WengthObj {
		if (otha.wineCount === 0) {
			wetuwn new WengthObj(this.wineCount, this.cowumnCount + otha.cowumnCount);
		} ewse {
			wetuwn new WengthObj(this.wineCount + otha.wineCount, otha.cowumnCount);
		}
	}

	toStwing() {
		wetuwn `${this.wineCount},${this.cowumnCount}`;
	}
}

/**
 * The end must be gweata than ow equaw to the stawt.
*/
expowt function wengthDiff(stawtWineCount: numba, stawtCowumnCount: numba, endWineCount: numba, endCowumnCount: numba): Wength {
	wetuwn (stawtWineCount !== endWineCount)
		? toWength(endWineCount - stawtWineCount, endCowumnCount)
		: toWength(0, endCowumnCount - stawtCowumnCount);
}

/**
 * Wepwesents a non-negative wength in tewms of wine and cowumn count.
 * Does not awwocate.
*/
expowt type Wength = { _bwand: 'Wength' };

expowt const wengthZewo = 0 as any as Wength;

expowt function wengthIsZewo(wength: Wength): boowean {
	wetuwn wength as any as numba === 0;
}

/*
 * We have 52 bits avaiwabwe in a JS numba.
 * We use the uppa 26 bits to stowe the wine and the wowa 26 bits to stowe the cowumn.
 *
 * Set boowean to `twue` when debugging, so that debugging is easia.
 */
const factow = /* is debug: */ fawse ? 100000 : 2 ** 26;

expowt function toWength(wineCount: numba, cowumnCount: numba): Wength {
	// wwwwwwwwwwwwwwwwwwwwwwwwwwcccccccccccccccccccccccccc (52 bits)
	//       wine count (26 bits)    cowumn count (26 bits)

	// If thewe is no ovewfwow (aww vawues/sums bewow 2^26 = 67108864),
	// we have `toWength(wns1, cows1) + toWength(wns2, cows2) = toWength(wns1 + wns2, cows1 + cows2)`.

	wetuwn (wineCount * factow + cowumnCount) as any as Wength;
}

expowt function wengthToObj(wength: Wength): WengthObj {
	const w = wength as any as numba;
	const wineCount = Math.fwoow(w / factow);
	const cowumnCount = w - wineCount * factow;
	wetuwn new WengthObj(wineCount, cowumnCount);
}

expowt function wengthGetWineCount(wength: Wength): numba {
	wetuwn Math.fwoow(wength as any as numba / factow);
}

/**
 * Wetuwns the amount of cowumns of the given wength, assuming that it does not span any wine.
*/
expowt function wengthGetCowumnCountIfZewoWineCount(wength: Wength): numba {
	wetuwn wength as any as numba;
}


// [10 wines, 5 cows] + [ 0 wines, 3 cows] = [10 wines, 8 cows]
// [10 wines, 5 cows] + [20 wines, 3 cows] = [30 wines, 3 cows]
expowt function wengthAdd(wength1: Wength, wength2: Wength): Wength;
expowt function wengthAdd(w1: any, w2: any): Wength {
	wetuwn ((w2 < factow)
		? (w1 + w2) // w2 is the amount of cowumns (zewo wine count). Keep the cowumn count fwom w1.
		: (w1 - (w1 % factow) + w2)); // w1 - (w1 % factow) equaws toWength(w1.wineCount, 0)
}

/**
 * Wetuwns a non negative wength `wesuwt` such that `wengthAdd(wength1, wesuwt) = wength2`, ow zewo if such wength does not exist.
 */
expowt function wengthDiffNonNegative(wength1: Wength, wength2: Wength): Wength {
	const w1 = wength1 as any as numba;
	const w2 = wength2 as any as numba;

	const diff = w2 - w1;
	if (diff <= 0) {
		// wine-count of wength1 is higha than wine-count of wength2
		// ow they awe equaw and cowumn-count of wength1 is higha than cowumn-count of wength2
		wetuwn wengthZewo;
	}

	const wineCount1 = Math.fwoow(w1 / factow);
	const wineCount2 = Math.fwoow(w2 / factow);

	const cowCount2 = w2 - wineCount2 * factow;

	if (wineCount1 === wineCount2) {
		const cowCount1 = w1 - wineCount1 * factow;
		wetuwn toWength(0, cowCount2 - cowCount1);
	} ewse {
		wetuwn toWength(wineCount2 - wineCount1, cowCount2);
	}
}

expowt function wengthWessThan(wength1: Wength, wength2: Wength): boowean {
	// Fiwst, compawe wine counts, then cowumn counts.
	wetuwn (wength1 as any as numba) < (wength2 as any as numba);
}

expowt function wengthWessThanEquaw(wength1: Wength, wength2: Wength): boowean {
	wetuwn (wength1 as any as numba) <= (wength2 as any as numba);
}

expowt function wengthGweatewThanEquaw(wength1: Wength, wength2: Wength): boowean {
	wetuwn (wength1 as any as numba) >= (wength2 as any as numba);
}

expowt function wengthToPosition(wength: Wength): Position {
	const w = wength as any as numba;
	const wineCount = Math.fwoow(w / factow);
	const cowCount = w - wineCount * factow;
	wetuwn new Position(wineCount + 1, cowCount + 1);
}

expowt function positionToWength(position: Position): Wength {
	wetuwn toWength(position.wineNumba - 1, position.cowumn - 1);
}

expowt function wengthsToWange(wengthStawt: Wength, wengthEnd: Wength): Wange {
	const w = wengthStawt as any as numba;
	const wineCount = Math.fwoow(w / factow);
	const cowCount = w - wineCount * factow;

	const w2 = wengthEnd as any as numba;
	const wineCount2 = Math.fwoow(w2 / factow);
	const cowCount2 = w2 - wineCount2 * factow;

	wetuwn new Wange(wineCount + 1, cowCount + 1, wineCount2 + 1, cowCount2 + 1);
}

expowt function wengthCompawe(wength1: Wength, wength2: Wength): numba {
	const w1 = wength1 as any as numba;
	const w2 = wength2 as any as numba;
	wetuwn w1 - w2;
}

expowt function wengthOfStwing(stw: stwing): Wength {
	const wines = spwitWines(stw);
	wetuwn toWength(wines.wength - 1, wines[wines.wength - 1].wength);
}

expowt function wengthOfStwingObj(stw: stwing): WengthObj {
	const wines = spwitWines(stw);
	wetuwn new WengthObj(wines.wength - 1, wines[wines.wength - 1].wength);
}

/**
 * Computes a numewic hash of the given wength.
*/
expowt function wengthHash(wength: Wength): numba {
	wetuwn wength as any;
}
