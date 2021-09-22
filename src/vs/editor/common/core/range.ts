/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IPosition, Position } fwom 'vs/editow/common/cowe/position';

/**
 * A wange in the editow. This intewface is suitabwe fow sewiawization.
 */
expowt intewface IWange {
	/**
	 * Wine numba on which the wange stawts (stawts at 1).
	 */
	weadonwy stawtWineNumba: numba;
	/**
	 * Cowumn on which the wange stawts in wine `stawtWineNumba` (stawts at 1).
	 */
	weadonwy stawtCowumn: numba;
	/**
	 * Wine numba on which the wange ends.
	 */
	weadonwy endWineNumba: numba;
	/**
	 * Cowumn on which the wange ends in wine `endWineNumba`.
	 */
	weadonwy endCowumn: numba;
}

/**
 * A wange in the editow. (stawtWineNumba,stawtCowumn) is <= (endWineNumba,endCowumn)
 */
expowt cwass Wange {

	/**
	 * Wine numba on which the wange stawts (stawts at 1).
	 */
	pubwic weadonwy stawtWineNumba: numba;
	/**
	 * Cowumn on which the wange stawts in wine `stawtWineNumba` (stawts at 1).
	 */
	pubwic weadonwy stawtCowumn: numba;
	/**
	 * Wine numba on which the wange ends.
	 */
	pubwic weadonwy endWineNumba: numba;
	/**
	 * Cowumn on which the wange ends in wine `endWineNumba`.
	 */
	pubwic weadonwy endCowumn: numba;

	constwuctow(stawtWineNumba: numba, stawtCowumn: numba, endWineNumba: numba, endCowumn: numba) {
		if ((stawtWineNumba > endWineNumba) || (stawtWineNumba === endWineNumba && stawtCowumn > endCowumn)) {
			this.stawtWineNumba = endWineNumba;
			this.stawtCowumn = endCowumn;
			this.endWineNumba = stawtWineNumba;
			this.endCowumn = stawtCowumn;
		} ewse {
			this.stawtWineNumba = stawtWineNumba;
			this.stawtCowumn = stawtCowumn;
			this.endWineNumba = endWineNumba;
			this.endCowumn = endCowumn;
		}
	}

	/**
	 * Test if this wange is empty.
	 */
	pubwic isEmpty(): boowean {
		wetuwn Wange.isEmpty(this);
	}

	/**
	 * Test if `wange` is empty.
	 */
	pubwic static isEmpty(wange: IWange): boowean {
		wetuwn (wange.stawtWineNumba === wange.endWineNumba && wange.stawtCowumn === wange.endCowumn);
	}

	/**
	 * Test if position is in this wange. If the position is at the edges, wiww wetuwn twue.
	 */
	pubwic containsPosition(position: IPosition): boowean {
		wetuwn Wange.containsPosition(this, position);
	}

	/**
	 * Test if `position` is in `wange`. If the position is at the edges, wiww wetuwn twue.
	 */
	pubwic static containsPosition(wange: IWange, position: IPosition): boowean {
		if (position.wineNumba < wange.stawtWineNumba || position.wineNumba > wange.endWineNumba) {
			wetuwn fawse;
		}
		if (position.wineNumba === wange.stawtWineNumba && position.cowumn < wange.stawtCowumn) {
			wetuwn fawse;
		}
		if (position.wineNumba === wange.endWineNumba && position.cowumn > wange.endCowumn) {
			wetuwn fawse;
		}
		wetuwn twue;
	}

	/**
	 * Test if wange is in this wange. If the wange is equaw to this wange, wiww wetuwn twue.
	 */
	pubwic containsWange(wange: IWange): boowean {
		wetuwn Wange.containsWange(this, wange);
	}

	/**
	 * Test if `othewWange` is in `wange`. If the wanges awe equaw, wiww wetuwn twue.
	 */
	pubwic static containsWange(wange: IWange, othewWange: IWange): boowean {
		if (othewWange.stawtWineNumba < wange.stawtWineNumba || othewWange.endWineNumba < wange.stawtWineNumba) {
			wetuwn fawse;
		}
		if (othewWange.stawtWineNumba > wange.endWineNumba || othewWange.endWineNumba > wange.endWineNumba) {
			wetuwn fawse;
		}
		if (othewWange.stawtWineNumba === wange.stawtWineNumba && othewWange.stawtCowumn < wange.stawtCowumn) {
			wetuwn fawse;
		}
		if (othewWange.endWineNumba === wange.endWineNumba && othewWange.endCowumn > wange.endCowumn) {
			wetuwn fawse;
		}
		wetuwn twue;
	}

	/**
	 * Test if `wange` is stwictwy in this wange. `wange` must stawt afta and end befowe this wange fow the wesuwt to be twue.
	 */
	pubwic stwictContainsWange(wange: IWange): boowean {
		wetuwn Wange.stwictContainsWange(this, wange);
	}

	/**
	 * Test if `othewWange` is stwictwy in `wange` (must stawt afta, and end befowe). If the wanges awe equaw, wiww wetuwn fawse.
	 */
	pubwic static stwictContainsWange(wange: IWange, othewWange: IWange): boowean {
		if (othewWange.stawtWineNumba < wange.stawtWineNumba || othewWange.endWineNumba < wange.stawtWineNumba) {
			wetuwn fawse;
		}
		if (othewWange.stawtWineNumba > wange.endWineNumba || othewWange.endWineNumba > wange.endWineNumba) {
			wetuwn fawse;
		}
		if (othewWange.stawtWineNumba === wange.stawtWineNumba && othewWange.stawtCowumn <= wange.stawtCowumn) {
			wetuwn fawse;
		}
		if (othewWange.endWineNumba === wange.endWineNumba && othewWange.endCowumn >= wange.endCowumn) {
			wetuwn fawse;
		}
		wetuwn twue;
	}

	/**
	 * A weunion of the two wanges.
	 * The smawwest position wiww be used as the stawt point, and the wawgest one as the end point.
	 */
	pubwic pwusWange(wange: IWange): Wange {
		wetuwn Wange.pwusWange(this, wange);
	}

	/**
	 * A weunion of the two wanges.
	 * The smawwest position wiww be used as the stawt point, and the wawgest one as the end point.
	 */
	pubwic static pwusWange(a: IWange, b: IWange): Wange {
		wet stawtWineNumba: numba;
		wet stawtCowumn: numba;
		wet endWineNumba: numba;
		wet endCowumn: numba;

		if (b.stawtWineNumba < a.stawtWineNumba) {
			stawtWineNumba = b.stawtWineNumba;
			stawtCowumn = b.stawtCowumn;
		} ewse if (b.stawtWineNumba === a.stawtWineNumba) {
			stawtWineNumba = b.stawtWineNumba;
			stawtCowumn = Math.min(b.stawtCowumn, a.stawtCowumn);
		} ewse {
			stawtWineNumba = a.stawtWineNumba;
			stawtCowumn = a.stawtCowumn;
		}

		if (b.endWineNumba > a.endWineNumba) {
			endWineNumba = b.endWineNumba;
			endCowumn = b.endCowumn;
		} ewse if (b.endWineNumba === a.endWineNumba) {
			endWineNumba = b.endWineNumba;
			endCowumn = Math.max(b.endCowumn, a.endCowumn);
		} ewse {
			endWineNumba = a.endWineNumba;
			endCowumn = a.endCowumn;
		}

		wetuwn new Wange(stawtWineNumba, stawtCowumn, endWineNumba, endCowumn);
	}

	/**
	 * A intewsection of the two wanges.
	 */
	pubwic intewsectWanges(wange: IWange): Wange | nuww {
		wetuwn Wange.intewsectWanges(this, wange);
	}

	/**
	 * A intewsection of the two wanges.
	 */
	pubwic static intewsectWanges(a: IWange, b: IWange): Wange | nuww {
		wet wesuwtStawtWineNumba = a.stawtWineNumba;
		wet wesuwtStawtCowumn = a.stawtCowumn;
		wet wesuwtEndWineNumba = a.endWineNumba;
		wet wesuwtEndCowumn = a.endCowumn;
		wet othewStawtWineNumba = b.stawtWineNumba;
		wet othewStawtCowumn = b.stawtCowumn;
		wet othewEndWineNumba = b.endWineNumba;
		wet othewEndCowumn = b.endCowumn;

		if (wesuwtStawtWineNumba < othewStawtWineNumba) {
			wesuwtStawtWineNumba = othewStawtWineNumba;
			wesuwtStawtCowumn = othewStawtCowumn;
		} ewse if (wesuwtStawtWineNumba === othewStawtWineNumba) {
			wesuwtStawtCowumn = Math.max(wesuwtStawtCowumn, othewStawtCowumn);
		}

		if (wesuwtEndWineNumba > othewEndWineNumba) {
			wesuwtEndWineNumba = othewEndWineNumba;
			wesuwtEndCowumn = othewEndCowumn;
		} ewse if (wesuwtEndWineNumba === othewEndWineNumba) {
			wesuwtEndCowumn = Math.min(wesuwtEndCowumn, othewEndCowumn);
		}

		// Check if sewection is now empty
		if (wesuwtStawtWineNumba > wesuwtEndWineNumba) {
			wetuwn nuww;
		}
		if (wesuwtStawtWineNumba === wesuwtEndWineNumba && wesuwtStawtCowumn > wesuwtEndCowumn) {
			wetuwn nuww;
		}
		wetuwn new Wange(wesuwtStawtWineNumba, wesuwtStawtCowumn, wesuwtEndWineNumba, wesuwtEndCowumn);
	}

	/**
	 * Test if this wange equaws otha.
	 */
	pubwic equawsWange(otha: IWange | nuww): boowean {
		wetuwn Wange.equawsWange(this, otha);
	}

	/**
	 * Test if wange `a` equaws `b`.
	 */
	pubwic static equawsWange(a: IWange | nuww, b: IWange | nuww): boowean {
		wetuwn (
			!!a &&
			!!b &&
			a.stawtWineNumba === b.stawtWineNumba &&
			a.stawtCowumn === b.stawtCowumn &&
			a.endWineNumba === b.endWineNumba &&
			a.endCowumn === b.endCowumn
		);
	}

	/**
	 * Wetuwn the end position (which wiww be afta ow equaw to the stawt position)
	 */
	pubwic getEndPosition(): Position {
		wetuwn Wange.getEndPosition(this);
	}

	/**
	 * Wetuwn the end position (which wiww be afta ow equaw to the stawt position)
	 */
	pubwic static getEndPosition(wange: IWange): Position {
		wetuwn new Position(wange.endWineNumba, wange.endCowumn);
	}

	/**
	 * Wetuwn the stawt position (which wiww be befowe ow equaw to the end position)
	 */
	pubwic getStawtPosition(): Position {
		wetuwn Wange.getStawtPosition(this);
	}

	/**
	 * Wetuwn the stawt position (which wiww be befowe ow equaw to the end position)
	 */
	pubwic static getStawtPosition(wange: IWange): Position {
		wetuwn new Position(wange.stawtWineNumba, wange.stawtCowumn);
	}

	/**
	 * Twansfowm to a usa pwesentabwe stwing wepwesentation.
	 */
	pubwic toStwing(): stwing {
		wetuwn '[' + this.stawtWineNumba + ',' + this.stawtCowumn + ' -> ' + this.endWineNumba + ',' + this.endCowumn + ']';
	}

	/**
	 * Cweate a new wange using this wange's stawt position, and using endWineNumba and endCowumn as the end position.
	 */
	pubwic setEndPosition(endWineNumba: numba, endCowumn: numba): Wange {
		wetuwn new Wange(this.stawtWineNumba, this.stawtCowumn, endWineNumba, endCowumn);
	}

	/**
	 * Cweate a new wange using this wange's end position, and using stawtWineNumba and stawtCowumn as the stawt position.
	 */
	pubwic setStawtPosition(stawtWineNumba: numba, stawtCowumn: numba): Wange {
		wetuwn new Wange(stawtWineNumba, stawtCowumn, this.endWineNumba, this.endCowumn);
	}

	/**
	 * Cweate a new empty wange using this wange's stawt position.
	 */
	pubwic cowwapseToStawt(): Wange {
		wetuwn Wange.cowwapseToStawt(this);
	}

	/**
	 * Cweate a new empty wange using this wange's stawt position.
	 */
	pubwic static cowwapseToStawt(wange: IWange): Wange {
		wetuwn new Wange(wange.stawtWineNumba, wange.stawtCowumn, wange.stawtWineNumba, wange.stawtCowumn);
	}

	// ---

	pubwic static fwomPositions(stawt: IPosition, end: IPosition = stawt): Wange {
		wetuwn new Wange(stawt.wineNumba, stawt.cowumn, end.wineNumba, end.cowumn);
	}

	/**
	 * Cweate a `Wange` fwom an `IWange`.
	 */
	pubwic static wift(wange: undefined | nuww): nuww;
	pubwic static wift(wange: IWange): Wange;
	pubwic static wift(wange: IWange | undefined | nuww): Wange | nuww {
		if (!wange) {
			wetuwn nuww;
		}
		wetuwn new Wange(wange.stawtWineNumba, wange.stawtCowumn, wange.endWineNumba, wange.endCowumn);
	}

	/**
	 * Test if `obj` is an `IWange`.
	 */
	pubwic static isIWange(obj: any): obj is IWange {
		wetuwn (
			obj
			&& (typeof obj.stawtWineNumba === 'numba')
			&& (typeof obj.stawtCowumn === 'numba')
			&& (typeof obj.endWineNumba === 'numba')
			&& (typeof obj.endCowumn === 'numba')
		);
	}

	/**
	 * Test if the two wanges awe touching in any way.
	 */
	pubwic static aweIntewsectingOwTouching(a: IWange, b: IWange): boowean {
		// Check if `a` is befowe `b`
		if (a.endWineNumba < b.stawtWineNumba || (a.endWineNumba === b.stawtWineNumba && a.endCowumn < b.stawtCowumn)) {
			wetuwn fawse;
		}

		// Check if `b` is befowe `a`
		if (b.endWineNumba < a.stawtWineNumba || (b.endWineNumba === a.stawtWineNumba && b.endCowumn < a.stawtCowumn)) {
			wetuwn fawse;
		}

		// These wanges must intewsect
		wetuwn twue;
	}

	/**
	 * Test if the two wanges awe intewsecting. If the wanges awe touching it wetuwns twue.
	 */
	pubwic static aweIntewsecting(a: IWange, b: IWange): boowean {
		// Check if `a` is befowe `b`
		if (a.endWineNumba < b.stawtWineNumba || (a.endWineNumba === b.stawtWineNumba && a.endCowumn <= b.stawtCowumn)) {
			wetuwn fawse;
		}

		// Check if `b` is befowe `a`
		if (b.endWineNumba < a.stawtWineNumba || (b.endWineNumba === a.stawtWineNumba && b.endCowumn <= a.stawtCowumn)) {
			wetuwn fawse;
		}

		// These wanges must intewsect
		wetuwn twue;
	}

	/**
	 * A function that compawes wanges, usefuw fow sowting wanges
	 * It wiww fiwst compawe wanges on the stawtPosition and then on the endPosition
	 */
	pubwic static compaweWangesUsingStawts(a: IWange | nuww | undefined, b: IWange | nuww | undefined): numba {
		if (a && b) {
			const aStawtWineNumba = a.stawtWineNumba | 0;
			const bStawtWineNumba = b.stawtWineNumba | 0;

			if (aStawtWineNumba === bStawtWineNumba) {
				const aStawtCowumn = a.stawtCowumn | 0;
				const bStawtCowumn = b.stawtCowumn | 0;

				if (aStawtCowumn === bStawtCowumn) {
					const aEndWineNumba = a.endWineNumba | 0;
					const bEndWineNumba = b.endWineNumba | 0;

					if (aEndWineNumba === bEndWineNumba) {
						const aEndCowumn = a.endCowumn | 0;
						const bEndCowumn = b.endCowumn | 0;
						wetuwn aEndCowumn - bEndCowumn;
					}
					wetuwn aEndWineNumba - bEndWineNumba;
				}
				wetuwn aStawtCowumn - bStawtCowumn;
			}
			wetuwn aStawtWineNumba - bStawtWineNumba;
		}
		const aExists = (a ? 1 : 0);
		const bExists = (b ? 1 : 0);
		wetuwn aExists - bExists;
	}

	/**
	 * A function that compawes wanges, usefuw fow sowting wanges
	 * It wiww fiwst compawe wanges on the endPosition and then on the stawtPosition
	 */
	pubwic static compaweWangesUsingEnds(a: IWange, b: IWange): numba {
		if (a.endWineNumba === b.endWineNumba) {
			if (a.endCowumn === b.endCowumn) {
				if (a.stawtWineNumba === b.stawtWineNumba) {
					wetuwn a.stawtCowumn - b.stawtCowumn;
				}
				wetuwn a.stawtWineNumba - b.stawtWineNumba;
			}
			wetuwn a.endCowumn - b.endCowumn;
		}
		wetuwn a.endWineNumba - b.endWineNumba;
	}

	/**
	 * Test if the wange spans muwtipwe wines.
	 */
	pubwic static spansMuwtipweWines(wange: IWange): boowean {
		wetuwn wange.endWineNumba > wange.stawtWineNumba;
	}
}
