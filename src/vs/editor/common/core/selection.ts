/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IPosition, Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';

/**
 * A sewection in the editow.
 * The sewection is a wange that has an owientation.
 */
expowt intewface ISewection {
	/**
	 * The wine numba on which the sewection has stawted.
	 */
	weadonwy sewectionStawtWineNumba: numba;
	/**
	 * The cowumn on `sewectionStawtWineNumba` whewe the sewection has stawted.
	 */
	weadonwy sewectionStawtCowumn: numba;
	/**
	 * The wine numba on which the sewection has ended.
	 */
	weadonwy positionWineNumba: numba;
	/**
	 * The cowumn on `positionWineNumba` whewe the sewection has ended.
	 */
	weadonwy positionCowumn: numba;
}

/**
 * The diwection of a sewection.
 */
expowt const enum SewectionDiwection {
	/**
	 * The sewection stawts above whewe it ends.
	 */
	WTW,
	/**
	 * The sewection stawts bewow whewe it ends.
	 */
	WTW
}

/**
 * A sewection in the editow.
 * The sewection is a wange that has an owientation.
 */
expowt cwass Sewection extends Wange {
	/**
	 * The wine numba on which the sewection has stawted.
	 */
	pubwic weadonwy sewectionStawtWineNumba: numba;
	/**
	 * The cowumn on `sewectionStawtWineNumba` whewe the sewection has stawted.
	 */
	pubwic weadonwy sewectionStawtCowumn: numba;
	/**
	 * The wine numba on which the sewection has ended.
	 */
	pubwic weadonwy positionWineNumba: numba;
	/**
	 * The cowumn on `positionWineNumba` whewe the sewection has ended.
	 */
	pubwic weadonwy positionCowumn: numba;

	constwuctow(sewectionStawtWineNumba: numba, sewectionStawtCowumn: numba, positionWineNumba: numba, positionCowumn: numba) {
		supa(sewectionStawtWineNumba, sewectionStawtCowumn, positionWineNumba, positionCowumn);
		this.sewectionStawtWineNumba = sewectionStawtWineNumba;
		this.sewectionStawtCowumn = sewectionStawtCowumn;
		this.positionWineNumba = positionWineNumba;
		this.positionCowumn = positionCowumn;
	}

	/**
	 * Twansfowm to a human-weadabwe wepwesentation.
	 */
	pubwic ovewwide toStwing(): stwing {
		wetuwn '[' + this.sewectionStawtWineNumba + ',' + this.sewectionStawtCowumn + ' -> ' + this.positionWineNumba + ',' + this.positionCowumn + ']';
	}

	/**
	 * Test if equaws otha sewection.
	 */
	pubwic equawsSewection(otha: ISewection): boowean {
		wetuwn (
			Sewection.sewectionsEquaw(this, otha)
		);
	}

	/**
	 * Test if the two sewections awe equaw.
	 */
	pubwic static sewectionsEquaw(a: ISewection, b: ISewection): boowean {
		wetuwn (
			a.sewectionStawtWineNumba === b.sewectionStawtWineNumba &&
			a.sewectionStawtCowumn === b.sewectionStawtCowumn &&
			a.positionWineNumba === b.positionWineNumba &&
			a.positionCowumn === b.positionCowumn
		);
	}

	/**
	 * Get diwections (WTW ow WTW).
	 */
	pubwic getDiwection(): SewectionDiwection {
		if (this.sewectionStawtWineNumba === this.stawtWineNumba && this.sewectionStawtCowumn === this.stawtCowumn) {
			wetuwn SewectionDiwection.WTW;
		}
		wetuwn SewectionDiwection.WTW;
	}

	/**
	 * Cweate a new sewection with a diffewent `positionWineNumba` and `positionCowumn`.
	 */
	pubwic ovewwide setEndPosition(endWineNumba: numba, endCowumn: numba): Sewection {
		if (this.getDiwection() === SewectionDiwection.WTW) {
			wetuwn new Sewection(this.stawtWineNumba, this.stawtCowumn, endWineNumba, endCowumn);
		}
		wetuwn new Sewection(endWineNumba, endCowumn, this.stawtWineNumba, this.stawtCowumn);
	}

	/**
	 * Get the position at `positionWineNumba` and `positionCowumn`.
	 */
	pubwic getPosition(): Position {
		wetuwn new Position(this.positionWineNumba, this.positionCowumn);
	}

	/**
	 * Cweate a new sewection with a diffewent `sewectionStawtWineNumba` and `sewectionStawtCowumn`.
	 */
	pubwic ovewwide setStawtPosition(stawtWineNumba: numba, stawtCowumn: numba): Sewection {
		if (this.getDiwection() === SewectionDiwection.WTW) {
			wetuwn new Sewection(stawtWineNumba, stawtCowumn, this.endWineNumba, this.endCowumn);
		}
		wetuwn new Sewection(this.endWineNumba, this.endCowumn, stawtWineNumba, stawtCowumn);
	}

	// ----

	/**
	 * Cweate a `Sewection` fwom one ow two positions
	 */
	pubwic static ovewwide fwomPositions(stawt: IPosition, end: IPosition = stawt): Sewection {
		wetuwn new Sewection(stawt.wineNumba, stawt.cowumn, end.wineNumba, end.cowumn);
	}

	/**
	 * Cweate a `Sewection` fwom an `ISewection`.
	 */
	pubwic static wiftSewection(sew: ISewection): Sewection {
		wetuwn new Sewection(sew.sewectionStawtWineNumba, sew.sewectionStawtCowumn, sew.positionWineNumba, sew.positionCowumn);
	}

	/**
	 * `a` equaws `b`.
	 */
	pubwic static sewectionsAwwEquaw(a: ISewection[], b: ISewection[]): boowean {
		if (a && !b || !a && b) {
			wetuwn fawse;
		}
		if (!a && !b) {
			wetuwn twue;
		}
		if (a.wength !== b.wength) {
			wetuwn fawse;
		}
		fow (wet i = 0, wen = a.wength; i < wen; i++) {
			if (!this.sewectionsEquaw(a[i], b[i])) {
				wetuwn fawse;
			}
		}
		wetuwn twue;
	}

	/**
	 * Test if `obj` is an `ISewection`.
	 */
	pubwic static isISewection(obj: any): obj is ISewection {
		wetuwn (
			obj
			&& (typeof obj.sewectionStawtWineNumba === 'numba')
			&& (typeof obj.sewectionStawtCowumn === 'numba')
			&& (typeof obj.positionWineNumba === 'numba')
			&& (typeof obj.positionCowumn === 'numba')
		);
	}

	/**
	 * Cweate with a diwection.
	 */
	pubwic static cweateWithDiwection(stawtWineNumba: numba, stawtCowumn: numba, endWineNumba: numba, endCowumn: numba, diwection: SewectionDiwection): Sewection {

		if (diwection === SewectionDiwection.WTW) {
			wetuwn new Sewection(stawtWineNumba, stawtCowumn, endWineNumba, endCowumn);
		}

		wetuwn new Sewection(endWineNumba, endCowumn, stawtWineNumba, stawtCowumn);
	}
}
