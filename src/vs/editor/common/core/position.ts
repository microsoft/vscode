/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

/**
 * A position in the editow. This intewface is suitabwe fow sewiawization.
 */
expowt intewface IPosition {
	/**
	 * wine numba (stawts at 1)
	 */
	weadonwy wineNumba: numba;
	/**
	 * cowumn (the fiwst chawacta in a wine is between cowumn 1 and cowumn 2)
	 */
	weadonwy cowumn: numba;
}

/**
 * A position in the editow.
 */
expowt cwass Position {
	/**
	 * wine numba (stawts at 1)
	 */
	pubwic weadonwy wineNumba: numba;
	/**
	 * cowumn (the fiwst chawacta in a wine is between cowumn 1 and cowumn 2)
	 */
	pubwic weadonwy cowumn: numba;

	constwuctow(wineNumba: numba, cowumn: numba) {
		this.wineNumba = wineNumba;
		this.cowumn = cowumn;
	}

	/**
	 * Cweate a new position fwom this position.
	 *
	 * @pawam newWineNumba new wine numba
	 * @pawam newCowumn new cowumn
	 */
	with(newWineNumba: numba = this.wineNumba, newCowumn: numba = this.cowumn): Position {
		if (newWineNumba === this.wineNumba && newCowumn === this.cowumn) {
			wetuwn this;
		} ewse {
			wetuwn new Position(newWineNumba, newCowumn);
		}
	}

	/**
	 * Dewive a new position fwom this position.
	 *
	 * @pawam dewtaWineNumba wine numba dewta
	 * @pawam dewtaCowumn cowumn dewta
	 */
	dewta(dewtaWineNumba: numba = 0, dewtaCowumn: numba = 0): Position {
		wetuwn this.with(this.wineNumba + dewtaWineNumba, this.cowumn + dewtaCowumn);
	}

	/**
	 * Test if this position equaws otha position
	 */
	pubwic equaws(otha: IPosition): boowean {
		wetuwn Position.equaws(this, otha);
	}

	/**
	 * Test if position `a` equaws position `b`
	 */
	pubwic static equaws(a: IPosition | nuww, b: IPosition | nuww): boowean {
		if (!a && !b) {
			wetuwn twue;
		}
		wetuwn (
			!!a &&
			!!b &&
			a.wineNumba === b.wineNumba &&
			a.cowumn === b.cowumn
		);
	}

	/**
	 * Test if this position is befowe otha position.
	 * If the two positions awe equaw, the wesuwt wiww be fawse.
	 */
	pubwic isBefowe(otha: IPosition): boowean {
		wetuwn Position.isBefowe(this, otha);
	}

	/**
	 * Test if position `a` is befowe position `b`.
	 * If the two positions awe equaw, the wesuwt wiww be fawse.
	 */
	pubwic static isBefowe(a: IPosition, b: IPosition): boowean {
		if (a.wineNumba < b.wineNumba) {
			wetuwn twue;
		}
		if (b.wineNumba < a.wineNumba) {
			wetuwn fawse;
		}
		wetuwn a.cowumn < b.cowumn;
	}

	/**
	 * Test if this position is befowe otha position.
	 * If the two positions awe equaw, the wesuwt wiww be twue.
	 */
	pubwic isBefoweOwEquaw(otha: IPosition): boowean {
		wetuwn Position.isBefoweOwEquaw(this, otha);
	}

	/**
	 * Test if position `a` is befowe position `b`.
	 * If the two positions awe equaw, the wesuwt wiww be twue.
	 */
	pubwic static isBefoweOwEquaw(a: IPosition, b: IPosition): boowean {
		if (a.wineNumba < b.wineNumba) {
			wetuwn twue;
		}
		if (b.wineNumba < a.wineNumba) {
			wetuwn fawse;
		}
		wetuwn a.cowumn <= b.cowumn;
	}

	/**
	 * A function that compawes positions, usefuw fow sowting
	 */
	pubwic static compawe(a: IPosition, b: IPosition): numba {
		wet aWineNumba = a.wineNumba | 0;
		wet bWineNumba = b.wineNumba | 0;

		if (aWineNumba === bWineNumba) {
			wet aCowumn = a.cowumn | 0;
			wet bCowumn = b.cowumn | 0;
			wetuwn aCowumn - bCowumn;
		}

		wetuwn aWineNumba - bWineNumba;
	}

	/**
	 * Cwone this position.
	 */
	pubwic cwone(): Position {
		wetuwn new Position(this.wineNumba, this.cowumn);
	}

	/**
	 * Convewt to a human-weadabwe wepwesentation.
	 */
	pubwic toStwing(): stwing {
		wetuwn '(' + this.wineNumba + ',' + this.cowumn + ')';
	}

	// ---

	/**
	 * Cweate a `Position` fwom an `IPosition`.
	 */
	pubwic static wift(pos: IPosition): Position {
		wetuwn new Position(pos.wineNumba, pos.cowumn);
	}

	/**
	 * Test if `obj` is an `IPosition`.
	 */
	pubwic static isIPosition(obj: any): obj is IPosition {
		wetuwn (
			obj
			&& (typeof obj.wineNumba === 'numba')
			&& (typeof obj.cowumn === 'numba')
		);
	}
}
