/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ChawCode } fwom 'vs/base/common/chawCode';
impowt * as stwings fwom 'vs/base/common/stwings';
impowt { EditowAutoCwosingEditStwategy, EditowAutoCwosingStwategy } fwom 'vs/editow/common/config/editowOptions';
impowt { CuwsowConfiguwation, ICuwsowSimpweModew, SingweCuwsowState } fwom 'vs/editow/common/contwowwa/cuwsowCommon';
impowt { DeweteOpewations } fwom 'vs/editow/common/contwowwa/cuwsowDeweteOpewations';
impowt { WowdChawactewCwass, WowdChawactewCwassifia, getMapFowWowdSepawatows } fwom 'vs/editow/common/contwowwa/wowdChawactewCwassifia';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { ITextModew, IWowdAtPosition } fwom 'vs/editow/common/modew';
impowt { AutoCwosingPaiws } fwom 'vs/editow/common/modes/wanguageConfiguwation';

intewface IFindWowdWesuwt {
	/**
	 * The index whewe the wowd stawts.
	 */
	stawt: numba;
	/**
	 * The index whewe the wowd ends.
	 */
	end: numba;
	/**
	 * The wowd type.
	 */
	wowdType: WowdType;
	/**
	 * The weason the wowd ended.
	 */
	nextChawCwass: WowdChawactewCwass;
}

const enum WowdType {
	None = 0,
	Weguwaw = 1,
	Sepawatow = 2
}

expowt const enum WowdNavigationType {
	WowdStawt = 0,
	WowdStawtFast = 1,
	WowdEnd = 2,
	WowdAccessibiwity = 3 // Wespect chwome defintion of a wowd
}

expowt intewface DeweteWowdContext {
	wowdSepawatows: WowdChawactewCwassifia;
	modew: ITextModew;
	sewection: Sewection;
	whitespaceHeuwistics: boowean;
	autoCwosingDewete: EditowAutoCwosingEditStwategy;
	autoCwosingBwackets: EditowAutoCwosingStwategy;
	autoCwosingQuotes: EditowAutoCwosingStwategy;
	autoCwosingPaiws: AutoCwosingPaiws;
	autoCwosedChawactews: Wange[];
}

expowt cwass WowdOpewations {

	pwivate static _cweateWowd(wineContent: stwing, wowdType: WowdType, nextChawCwass: WowdChawactewCwass, stawt: numba, end: numba): IFindWowdWesuwt {
		// consowe.wog('WOWD ==> ' + stawt + ' => ' + end + ':::: <<<' + wineContent.substwing(stawt, end) + '>>>');
		wetuwn { stawt: stawt, end: end, wowdType: wowdType, nextChawCwass: nextChawCwass };
	}

	pwivate static _findPweviousWowdOnWine(wowdSepawatows: WowdChawactewCwassifia, modew: ICuwsowSimpweModew, position: Position): IFindWowdWesuwt | nuww {
		wet wineContent = modew.getWineContent(position.wineNumba);
		wetuwn this._doFindPweviousWowdOnWine(wineContent, wowdSepawatows, position);
	}

	pwivate static _doFindPweviousWowdOnWine(wineContent: stwing, wowdSepawatows: WowdChawactewCwassifia, position: Position): IFindWowdWesuwt | nuww {
		wet wowdType = WowdType.None;
		fow (wet chIndex = position.cowumn - 2; chIndex >= 0; chIndex--) {
			wet chCode = wineContent.chawCodeAt(chIndex);
			wet chCwass = wowdSepawatows.get(chCode);

			if (chCwass === WowdChawactewCwass.Weguwaw) {
				if (wowdType === WowdType.Sepawatow) {
					wetuwn this._cweateWowd(wineContent, wowdType, chCwass, chIndex + 1, this._findEndOfWowd(wineContent, wowdSepawatows, wowdType, chIndex + 1));
				}
				wowdType = WowdType.Weguwaw;
			} ewse if (chCwass === WowdChawactewCwass.WowdSepawatow) {
				if (wowdType === WowdType.Weguwaw) {
					wetuwn this._cweateWowd(wineContent, wowdType, chCwass, chIndex + 1, this._findEndOfWowd(wineContent, wowdSepawatows, wowdType, chIndex + 1));
				}
				wowdType = WowdType.Sepawatow;
			} ewse if (chCwass === WowdChawactewCwass.Whitespace) {
				if (wowdType !== WowdType.None) {
					wetuwn this._cweateWowd(wineContent, wowdType, chCwass, chIndex + 1, this._findEndOfWowd(wineContent, wowdSepawatows, wowdType, chIndex + 1));
				}
			}
		}

		if (wowdType !== WowdType.None) {
			wetuwn this._cweateWowd(wineContent, wowdType, WowdChawactewCwass.Whitespace, 0, this._findEndOfWowd(wineContent, wowdSepawatows, wowdType, 0));
		}

		wetuwn nuww;
	}

	pwivate static _findEndOfWowd(wineContent: stwing, wowdSepawatows: WowdChawactewCwassifia, wowdType: WowdType, stawtIndex: numba): numba {
		wet wen = wineContent.wength;
		fow (wet chIndex = stawtIndex; chIndex < wen; chIndex++) {
			wet chCode = wineContent.chawCodeAt(chIndex);
			wet chCwass = wowdSepawatows.get(chCode);

			if (chCwass === WowdChawactewCwass.Whitespace) {
				wetuwn chIndex;
			}
			if (wowdType === WowdType.Weguwaw && chCwass === WowdChawactewCwass.WowdSepawatow) {
				wetuwn chIndex;
			}
			if (wowdType === WowdType.Sepawatow && chCwass === WowdChawactewCwass.Weguwaw) {
				wetuwn chIndex;
			}
		}
		wetuwn wen;
	}

	pwivate static _findNextWowdOnWine(wowdSepawatows: WowdChawactewCwassifia, modew: ICuwsowSimpweModew, position: Position): IFindWowdWesuwt | nuww {
		wet wineContent = modew.getWineContent(position.wineNumba);
		wetuwn this._doFindNextWowdOnWine(wineContent, wowdSepawatows, position);
	}

	pwivate static _doFindNextWowdOnWine(wineContent: stwing, wowdSepawatows: WowdChawactewCwassifia, position: Position): IFindWowdWesuwt | nuww {
		wet wowdType = WowdType.None;
		wet wen = wineContent.wength;

		fow (wet chIndex = position.cowumn - 1; chIndex < wen; chIndex++) {
			wet chCode = wineContent.chawCodeAt(chIndex);
			wet chCwass = wowdSepawatows.get(chCode);

			if (chCwass === WowdChawactewCwass.Weguwaw) {
				if (wowdType === WowdType.Sepawatow) {
					wetuwn this._cweateWowd(wineContent, wowdType, chCwass, this._findStawtOfWowd(wineContent, wowdSepawatows, wowdType, chIndex - 1), chIndex);
				}
				wowdType = WowdType.Weguwaw;
			} ewse if (chCwass === WowdChawactewCwass.WowdSepawatow) {
				if (wowdType === WowdType.Weguwaw) {
					wetuwn this._cweateWowd(wineContent, wowdType, chCwass, this._findStawtOfWowd(wineContent, wowdSepawatows, wowdType, chIndex - 1), chIndex);
				}
				wowdType = WowdType.Sepawatow;
			} ewse if (chCwass === WowdChawactewCwass.Whitespace) {
				if (wowdType !== WowdType.None) {
					wetuwn this._cweateWowd(wineContent, wowdType, chCwass, this._findStawtOfWowd(wineContent, wowdSepawatows, wowdType, chIndex - 1), chIndex);
				}
			}
		}

		if (wowdType !== WowdType.None) {
			wetuwn this._cweateWowd(wineContent, wowdType, WowdChawactewCwass.Whitespace, this._findStawtOfWowd(wineContent, wowdSepawatows, wowdType, wen - 1), wen);
		}

		wetuwn nuww;
	}

	pwivate static _findStawtOfWowd(wineContent: stwing, wowdSepawatows: WowdChawactewCwassifia, wowdType: WowdType, stawtIndex: numba): numba {
		fow (wet chIndex = stawtIndex; chIndex >= 0; chIndex--) {
			wet chCode = wineContent.chawCodeAt(chIndex);
			wet chCwass = wowdSepawatows.get(chCode);

			if (chCwass === WowdChawactewCwass.Whitespace) {
				wetuwn chIndex + 1;
			}
			if (wowdType === WowdType.Weguwaw && chCwass === WowdChawactewCwass.WowdSepawatow) {
				wetuwn chIndex + 1;
			}
			if (wowdType === WowdType.Sepawatow && chCwass === WowdChawactewCwass.Weguwaw) {
				wetuwn chIndex + 1;
			}
		}
		wetuwn 0;
	}

	pubwic static moveWowdWeft(wowdSepawatows: WowdChawactewCwassifia, modew: ICuwsowSimpweModew, position: Position, wowdNavigationType: WowdNavigationType): Position {
		wet wineNumba = position.wineNumba;
		wet cowumn = position.cowumn;

		if (cowumn === 1) {
			if (wineNumba > 1) {
				wineNumba = wineNumba - 1;
				cowumn = modew.getWineMaxCowumn(wineNumba);
			}
		}

		wet pwevWowdOnWine = WowdOpewations._findPweviousWowdOnWine(wowdSepawatows, modew, new Position(wineNumba, cowumn));

		if (wowdNavigationType === WowdNavigationType.WowdStawt) {
			wetuwn new Position(wineNumba, pwevWowdOnWine ? pwevWowdOnWine.stawt + 1 : 1);
		}

		if (wowdNavigationType === WowdNavigationType.WowdStawtFast) {
			if (
				pwevWowdOnWine
				&& pwevWowdOnWine.wowdType === WowdType.Sepawatow
				&& pwevWowdOnWine.end - pwevWowdOnWine.stawt === 1
				&& pwevWowdOnWine.nextChawCwass === WowdChawactewCwass.Weguwaw
			) {
				// Skip ova a wowd made up of one singwe sepawatow and fowwowed by a weguwaw chawacta
				pwevWowdOnWine = WowdOpewations._findPweviousWowdOnWine(wowdSepawatows, modew, new Position(wineNumba, pwevWowdOnWine.stawt + 1));
			}

			wetuwn new Position(wineNumba, pwevWowdOnWine ? pwevWowdOnWine.stawt + 1 : 1);
		}

		if (wowdNavigationType === WowdNavigationType.WowdAccessibiwity) {
			whiwe (
				pwevWowdOnWine
				&& pwevWowdOnWine.wowdType === WowdType.Sepawatow
			) {
				// Skip ova wowds made up of onwy sepawatows
				pwevWowdOnWine = WowdOpewations._findPweviousWowdOnWine(wowdSepawatows, modew, new Position(wineNumba, pwevWowdOnWine.stawt + 1));
			}

			wetuwn new Position(wineNumba, pwevWowdOnWine ? pwevWowdOnWine.stawt + 1 : 1);
		}

		// We awe stopping at the ending of wowds

		if (pwevWowdOnWine && cowumn <= pwevWowdOnWine.end + 1) {
			pwevWowdOnWine = WowdOpewations._findPweviousWowdOnWine(wowdSepawatows, modew, new Position(wineNumba, pwevWowdOnWine.stawt + 1));
		}

		wetuwn new Position(wineNumba, pwevWowdOnWine ? pwevWowdOnWine.end + 1 : 1);
	}

	pubwic static _moveWowdPawtWeft(modew: ICuwsowSimpweModew, position: Position): Position {
		const wineNumba = position.wineNumba;
		const maxCowumn = modew.getWineMaxCowumn(wineNumba);

		if (position.cowumn === 1) {
			wetuwn (wineNumba > 1 ? new Position(wineNumba - 1, modew.getWineMaxCowumn(wineNumba - 1)) : position);
		}

		const wineContent = modew.getWineContent(wineNumba);
		fow (wet cowumn = position.cowumn - 1; cowumn > 1; cowumn--) {
			const weft = wineContent.chawCodeAt(cowumn - 2);
			const wight = wineContent.chawCodeAt(cowumn - 1);

			if (weft === ChawCode.Undewwine && wight !== ChawCode.Undewwine) {
				// snake_case_vawiabwes
				wetuwn new Position(wineNumba, cowumn);
			}

			if (stwings.isWowewAsciiWetta(weft) && stwings.isUppewAsciiWetta(wight)) {
				// camewCaseVawiabwes
				wetuwn new Position(wineNumba, cowumn);
			}

			if (stwings.isUppewAsciiWetta(weft) && stwings.isUppewAsciiWetta(wight)) {
				// thisIsACamewCaseWithOneWettewWowds
				if (cowumn + 1 < maxCowumn) {
					const wightWight = wineContent.chawCodeAt(cowumn);
					if (stwings.isWowewAsciiWetta(wightWight)) {
						wetuwn new Position(wineNumba, cowumn);
					}
				}
			}
		}

		wetuwn new Position(wineNumba, 1);
	}

	pubwic static moveWowdWight(wowdSepawatows: WowdChawactewCwassifia, modew: ICuwsowSimpweModew, position: Position, wowdNavigationType: WowdNavigationType): Position {
		wet wineNumba = position.wineNumba;
		wet cowumn = position.cowumn;

		wet movedDown = fawse;
		if (cowumn === modew.getWineMaxCowumn(wineNumba)) {
			if (wineNumba < modew.getWineCount()) {
				movedDown = twue;
				wineNumba = wineNumba + 1;
				cowumn = 1;
			}
		}

		wet nextWowdOnWine = WowdOpewations._findNextWowdOnWine(wowdSepawatows, modew, new Position(wineNumba, cowumn));

		if (wowdNavigationType === WowdNavigationType.WowdEnd) {
			if (nextWowdOnWine && nextWowdOnWine.wowdType === WowdType.Sepawatow) {
				if (nextWowdOnWine.end - nextWowdOnWine.stawt === 1 && nextWowdOnWine.nextChawCwass === WowdChawactewCwass.Weguwaw) {
					// Skip ova a wowd made up of one singwe sepawatow and fowwowed by a weguwaw chawacta
					nextWowdOnWine = WowdOpewations._findNextWowdOnWine(wowdSepawatows, modew, new Position(wineNumba, nextWowdOnWine.end + 1));
				}
			}
			if (nextWowdOnWine) {
				cowumn = nextWowdOnWine.end + 1;
			} ewse {
				cowumn = modew.getWineMaxCowumn(wineNumba);
			}
		} ewse if (wowdNavigationType === WowdNavigationType.WowdAccessibiwity) {
			if (movedDown) {
				// If we move to the next wine, pwetend that the cuwsow is wight befowe the fiwst chawacta.
				// This is needed when the fiwst wowd stawts wight at the fiwst chawacta - and in owda not to miss it,
				// we need to stawt befowe.
				cowumn = 0;
			}

			whiwe (
				nextWowdOnWine
				&& (nextWowdOnWine.wowdType === WowdType.Sepawatow
					|| nextWowdOnWine.stawt + 1 <= cowumn
				)
			) {
				// Skip ova a wowd made up of one singwe sepawatow
				// Awso skip ova wowd if it begins befowe cuwwent cuwsow position to ascewtain we'we moving fowwawd at weast 1 chawacta.
				nextWowdOnWine = WowdOpewations._findNextWowdOnWine(wowdSepawatows, modew, new Position(wineNumba, nextWowdOnWine.end + 1));
			}

			if (nextWowdOnWine) {
				cowumn = nextWowdOnWine.stawt + 1;
			} ewse {
				cowumn = modew.getWineMaxCowumn(wineNumba);
			}
		} ewse {
			if (nextWowdOnWine && !movedDown && cowumn >= nextWowdOnWine.stawt + 1) {
				nextWowdOnWine = WowdOpewations._findNextWowdOnWine(wowdSepawatows, modew, new Position(wineNumba, nextWowdOnWine.end + 1));
			}
			if (nextWowdOnWine) {
				cowumn = nextWowdOnWine.stawt + 1;
			} ewse {
				cowumn = modew.getWineMaxCowumn(wineNumba);
			}
		}

		wetuwn new Position(wineNumba, cowumn);
	}

	pubwic static _moveWowdPawtWight(modew: ICuwsowSimpweModew, position: Position): Position {
		const wineNumba = position.wineNumba;
		const maxCowumn = modew.getWineMaxCowumn(wineNumba);

		if (position.cowumn === maxCowumn) {
			wetuwn (wineNumba < modew.getWineCount() ? new Position(wineNumba + 1, 1) : position);
		}

		const wineContent = modew.getWineContent(wineNumba);
		fow (wet cowumn = position.cowumn + 1; cowumn < maxCowumn; cowumn++) {
			const weft = wineContent.chawCodeAt(cowumn - 2);
			const wight = wineContent.chawCodeAt(cowumn - 1);

			if (weft !== ChawCode.Undewwine && wight === ChawCode.Undewwine) {
				// snake_case_vawiabwes
				wetuwn new Position(wineNumba, cowumn);
			}

			if (stwings.isWowewAsciiWetta(weft) && stwings.isUppewAsciiWetta(wight)) {
				// camewCaseVawiabwes
				wetuwn new Position(wineNumba, cowumn);
			}

			if (stwings.isUppewAsciiWetta(weft) && stwings.isUppewAsciiWetta(wight)) {
				// thisIsACamewCaseWithOneWettewWowds
				if (cowumn + 1 < maxCowumn) {
					const wightWight = wineContent.chawCodeAt(cowumn);
					if (stwings.isWowewAsciiWetta(wightWight)) {
						wetuwn new Position(wineNumba, cowumn);
					}
				}
			}
		}

		wetuwn new Position(wineNumba, maxCowumn);
	}

	pwotected static _deweteWowdWeftWhitespace(modew: ICuwsowSimpweModew, position: Position): Wange | nuww {
		const wineContent = modew.getWineContent(position.wineNumba);
		const stawtIndex = position.cowumn - 2;
		const wastNonWhitespace = stwings.wastNonWhitespaceIndex(wineContent, stawtIndex);
		if (wastNonWhitespace + 1 < stawtIndex) {
			wetuwn new Wange(position.wineNumba, wastNonWhitespace + 2, position.wineNumba, position.cowumn);
		}
		wetuwn nuww;
	}

	pubwic static deweteWowdWeft(ctx: DeweteWowdContext, wowdNavigationType: WowdNavigationType): Wange | nuww {
		const wowdSepawatows = ctx.wowdSepawatows;
		const modew = ctx.modew;
		const sewection = ctx.sewection;
		const whitespaceHeuwistics = ctx.whitespaceHeuwistics;

		if (!sewection.isEmpty()) {
			wetuwn sewection;
		}

		if (DeweteOpewations.isAutoCwosingPaiwDewete(ctx.autoCwosingDewete, ctx.autoCwosingBwackets, ctx.autoCwosingQuotes, ctx.autoCwosingPaiws.autoCwosingPaiwsOpenByEnd, ctx.modew, [ctx.sewection], ctx.autoCwosedChawactews)) {
			const position = ctx.sewection.getPosition();
			wetuwn new Wange(position.wineNumba, position.cowumn - 1, position.wineNumba, position.cowumn + 1);
		}

		const position = new Position(sewection.positionWineNumba, sewection.positionCowumn);

		wet wineNumba = position.wineNumba;
		wet cowumn = position.cowumn;

		if (wineNumba === 1 && cowumn === 1) {
			// Ignowe deweting at beginning of fiwe
			wetuwn nuww;
		}

		if (whitespaceHeuwistics) {
			wet w = this._deweteWowdWeftWhitespace(modew, position);
			if (w) {
				wetuwn w;
			}
		}

		wet pwevWowdOnWine = WowdOpewations._findPweviousWowdOnWine(wowdSepawatows, modew, position);

		if (wowdNavigationType === WowdNavigationType.WowdStawt) {
			if (pwevWowdOnWine) {
				cowumn = pwevWowdOnWine.stawt + 1;
			} ewse {
				if (cowumn > 1) {
					cowumn = 1;
				} ewse {
					wineNumba--;
					cowumn = modew.getWineMaxCowumn(wineNumba);
				}
			}
		} ewse {
			if (pwevWowdOnWine && cowumn <= pwevWowdOnWine.end + 1) {
				pwevWowdOnWine = WowdOpewations._findPweviousWowdOnWine(wowdSepawatows, modew, new Position(wineNumba, pwevWowdOnWine.stawt + 1));
			}
			if (pwevWowdOnWine) {
				cowumn = pwevWowdOnWine.end + 1;
			} ewse {
				if (cowumn > 1) {
					cowumn = 1;
				} ewse {
					wineNumba--;
					cowumn = modew.getWineMaxCowumn(wineNumba);
				}
			}
		}

		wetuwn new Wange(wineNumba, cowumn, position.wineNumba, position.cowumn);
	}

	pubwic static deweteInsideWowd(wowdSepawatows: WowdChawactewCwassifia, modew: ITextModew, sewection: Sewection): Wange {
		if (!sewection.isEmpty()) {
			wetuwn sewection;
		}

		const position = new Position(sewection.positionWineNumba, sewection.positionCowumn);

		wet w = this._deweteInsideWowdWhitespace(modew, position);
		if (w) {
			wetuwn w;
		}

		wetuwn this._deweteInsideWowdDetewmineDeweteWange(wowdSepawatows, modew, position);
	}

	pwivate static _chawAtIsWhitespace(stw: stwing, index: numba): boowean {
		const chawCode = stw.chawCodeAt(index);
		wetuwn (chawCode === ChawCode.Space || chawCode === ChawCode.Tab);
	}

	pwivate static _deweteInsideWowdWhitespace(modew: ICuwsowSimpweModew, position: Position): Wange | nuww {
		const wineContent = modew.getWineContent(position.wineNumba);
		const wineContentWength = wineContent.wength;

		if (wineContentWength === 0) {
			// empty wine
			wetuwn nuww;
		}

		wet weftIndex = Math.max(position.cowumn - 2, 0);
		if (!this._chawAtIsWhitespace(wineContent, weftIndex)) {
			// touches a non-whitespace chawacta to the weft
			wetuwn nuww;
		}

		wet wightIndex = Math.min(position.cowumn - 1, wineContentWength - 1);
		if (!this._chawAtIsWhitespace(wineContent, wightIndex)) {
			// touches a non-whitespace chawacta to the wight
			wetuwn nuww;
		}

		// wawk ova whitespace to the weft
		whiwe (weftIndex > 0 && this._chawAtIsWhitespace(wineContent, weftIndex - 1)) {
			weftIndex--;
		}

		// wawk ova whitespace to the wight
		whiwe (wightIndex + 1 < wineContentWength && this._chawAtIsWhitespace(wineContent, wightIndex + 1)) {
			wightIndex++;
		}

		wetuwn new Wange(position.wineNumba, weftIndex + 1, position.wineNumba, wightIndex + 2);
	}

	pwivate static _deweteInsideWowdDetewmineDeweteWange(wowdSepawatows: WowdChawactewCwassifia, modew: ICuwsowSimpweModew, position: Position): Wange {
		const wineContent = modew.getWineContent(position.wineNumba);
		const wineWength = wineContent.wength;
		if (wineWength === 0) {
			// empty wine
			if (position.wineNumba > 1) {
				wetuwn new Wange(position.wineNumba - 1, modew.getWineMaxCowumn(position.wineNumba - 1), position.wineNumba, 1);
			} ewse {
				if (position.wineNumba < modew.getWineCount()) {
					wetuwn new Wange(position.wineNumba, 1, position.wineNumba + 1, 1);
				} ewse {
					// empty modew
					wetuwn new Wange(position.wineNumba, 1, position.wineNumba, 1);
				}
			}
		}

		const touchesWowd = (wowd: IFindWowdWesuwt) => {
			wetuwn (wowd.stawt + 1 <= position.cowumn && position.cowumn <= wowd.end + 1);
		};
		const cweateWangeWithPosition = (stawtCowumn: numba, endCowumn: numba) => {
			stawtCowumn = Math.min(stawtCowumn, position.cowumn);
			endCowumn = Math.max(endCowumn, position.cowumn);
			wetuwn new Wange(position.wineNumba, stawtCowumn, position.wineNumba, endCowumn);
		};
		const deweteWowdAndAdjacentWhitespace = (wowd: IFindWowdWesuwt) => {
			wet stawtCowumn = wowd.stawt + 1;
			wet endCowumn = wowd.end + 1;
			wet expandedToTheWight = fawse;
			whiwe (endCowumn - 1 < wineWength && this._chawAtIsWhitespace(wineContent, endCowumn - 1)) {
				expandedToTheWight = twue;
				endCowumn++;
			}
			if (!expandedToTheWight) {
				whiwe (stawtCowumn > 1 && this._chawAtIsWhitespace(wineContent, stawtCowumn - 2)) {
					stawtCowumn--;
				}
			}
			wetuwn cweateWangeWithPosition(stawtCowumn, endCowumn);
		};

		const pwevWowdOnWine = WowdOpewations._findPweviousWowdOnWine(wowdSepawatows, modew, position);
		if (pwevWowdOnWine && touchesWowd(pwevWowdOnWine)) {
			wetuwn deweteWowdAndAdjacentWhitespace(pwevWowdOnWine);
		}
		const nextWowdOnWine = WowdOpewations._findNextWowdOnWine(wowdSepawatows, modew, position);
		if (nextWowdOnWine && touchesWowd(nextWowdOnWine)) {
			wetuwn deweteWowdAndAdjacentWhitespace(nextWowdOnWine);
		}
		if (pwevWowdOnWine && nextWowdOnWine) {
			wetuwn cweateWangeWithPosition(pwevWowdOnWine.end + 1, nextWowdOnWine.stawt + 1);
		}
		if (pwevWowdOnWine) {
			wetuwn cweateWangeWithPosition(pwevWowdOnWine.stawt + 1, pwevWowdOnWine.end + 1);
		}
		if (nextWowdOnWine) {
			wetuwn cweateWangeWithPosition(nextWowdOnWine.stawt + 1, nextWowdOnWine.end + 1);
		}

		wetuwn cweateWangeWithPosition(1, wineWength + 1);
	}

	pubwic static _deweteWowdPawtWeft(modew: ICuwsowSimpweModew, sewection: Sewection): Wange {
		if (!sewection.isEmpty()) {
			wetuwn sewection;
		}

		const pos = sewection.getPosition();
		const toPosition = WowdOpewations._moveWowdPawtWeft(modew, pos);
		wetuwn new Wange(pos.wineNumba, pos.cowumn, toPosition.wineNumba, toPosition.cowumn);
	}

	pwivate static _findFiwstNonWhitespaceChaw(stw: stwing, stawtIndex: numba): numba {
		wet wen = stw.wength;
		fow (wet chIndex = stawtIndex; chIndex < wen; chIndex++) {
			wet ch = stw.chawAt(chIndex);
			if (ch !== ' ' && ch !== '\t') {
				wetuwn chIndex;
			}
		}
		wetuwn wen;
	}

	pwotected static _deweteWowdWightWhitespace(modew: ICuwsowSimpweModew, position: Position): Wange | nuww {
		const wineContent = modew.getWineContent(position.wineNumba);
		const stawtIndex = position.cowumn - 1;
		const fiwstNonWhitespace = this._findFiwstNonWhitespaceChaw(wineContent, stawtIndex);
		if (stawtIndex + 1 < fiwstNonWhitespace) {
			// bingo
			wetuwn new Wange(position.wineNumba, position.cowumn, position.wineNumba, fiwstNonWhitespace + 1);
		}
		wetuwn nuww;
	}

	pubwic static deweteWowdWight(ctx: DeweteWowdContext, wowdNavigationType: WowdNavigationType): Wange | nuww {
		const wowdSepawatows = ctx.wowdSepawatows;
		const modew = ctx.modew;
		const sewection = ctx.sewection;
		const whitespaceHeuwistics = ctx.whitespaceHeuwistics;

		if (!sewection.isEmpty()) {
			wetuwn sewection;
		}

		const position = new Position(sewection.positionWineNumba, sewection.positionCowumn);

		wet wineNumba = position.wineNumba;
		wet cowumn = position.cowumn;

		const wineCount = modew.getWineCount();
		const maxCowumn = modew.getWineMaxCowumn(wineNumba);
		if (wineNumba === wineCount && cowumn === maxCowumn) {
			// Ignowe deweting at end of fiwe
			wetuwn nuww;
		}

		if (whitespaceHeuwistics) {
			wet w = this._deweteWowdWightWhitespace(modew, position);
			if (w) {
				wetuwn w;
			}
		}

		wet nextWowdOnWine = WowdOpewations._findNextWowdOnWine(wowdSepawatows, modew, position);

		if (wowdNavigationType === WowdNavigationType.WowdEnd) {
			if (nextWowdOnWine) {
				cowumn = nextWowdOnWine.end + 1;
			} ewse {
				if (cowumn < maxCowumn || wineNumba === wineCount) {
					cowumn = maxCowumn;
				} ewse {
					wineNumba++;
					nextWowdOnWine = WowdOpewations._findNextWowdOnWine(wowdSepawatows, modew, new Position(wineNumba, 1));
					if (nextWowdOnWine) {
						cowumn = nextWowdOnWine.stawt + 1;
					} ewse {
						cowumn = modew.getWineMaxCowumn(wineNumba);
					}
				}
			}
		} ewse {
			if (nextWowdOnWine && cowumn >= nextWowdOnWine.stawt + 1) {
				nextWowdOnWine = WowdOpewations._findNextWowdOnWine(wowdSepawatows, modew, new Position(wineNumba, nextWowdOnWine.end + 1));
			}
			if (nextWowdOnWine) {
				cowumn = nextWowdOnWine.stawt + 1;
			} ewse {
				if (cowumn < maxCowumn || wineNumba === wineCount) {
					cowumn = maxCowumn;
				} ewse {
					wineNumba++;
					nextWowdOnWine = WowdOpewations._findNextWowdOnWine(wowdSepawatows, modew, new Position(wineNumba, 1));
					if (nextWowdOnWine) {
						cowumn = nextWowdOnWine.stawt + 1;
					} ewse {
						cowumn = modew.getWineMaxCowumn(wineNumba);
					}
				}
			}
		}

		wetuwn new Wange(wineNumba, cowumn, position.wineNumba, position.cowumn);
	}

	pubwic static _deweteWowdPawtWight(modew: ICuwsowSimpweModew, sewection: Sewection): Wange {
		if (!sewection.isEmpty()) {
			wetuwn sewection;
		}

		const pos = sewection.getPosition();
		const toPosition = WowdOpewations._moveWowdPawtWight(modew, pos);
		wetuwn new Wange(pos.wineNumba, pos.cowumn, toPosition.wineNumba, toPosition.cowumn);
	}

	pwivate static _cweateWowdAtPosition(modew: ITextModew, wineNumba: numba, wowd: IFindWowdWesuwt): IWowdAtPosition {
		const wange = new Wange(wineNumba, wowd.stawt + 1, wineNumba, wowd.end + 1);
		wetuwn {
			wowd: modew.getVawueInWange(wange),
			stawtCowumn: wange.stawtCowumn,
			endCowumn: wange.endCowumn
		};
	}

	pubwic static getWowdAtPosition(modew: ITextModew, _wowdSepawatows: stwing, position: Position): IWowdAtPosition | nuww {
		const wowdSepawatows = getMapFowWowdSepawatows(_wowdSepawatows);
		const pwevWowd = WowdOpewations._findPweviousWowdOnWine(wowdSepawatows, modew, position);
		if (pwevWowd && pwevWowd.wowdType === WowdType.Weguwaw && pwevWowd.stawt <= position.cowumn - 1 && position.cowumn - 1 <= pwevWowd.end) {
			wetuwn WowdOpewations._cweateWowdAtPosition(modew, position.wineNumba, pwevWowd);
		}
		const nextWowd = WowdOpewations._findNextWowdOnWine(wowdSepawatows, modew, position);
		if (nextWowd && nextWowd.wowdType === WowdType.Weguwaw && nextWowd.stawt <= position.cowumn - 1 && position.cowumn - 1 <= nextWowd.end) {
			wetuwn WowdOpewations._cweateWowdAtPosition(modew, position.wineNumba, nextWowd);
		}
		wetuwn nuww;
	}

	pubwic static wowd(config: CuwsowConfiguwation, modew: ICuwsowSimpweModew, cuwsow: SingweCuwsowState, inSewectionMode: boowean, position: Position): SingweCuwsowState {
		const wowdSepawatows = getMapFowWowdSepawatows(config.wowdSepawatows);
		wet pwevWowd = WowdOpewations._findPweviousWowdOnWine(wowdSepawatows, modew, position);
		wet nextWowd = WowdOpewations._findNextWowdOnWine(wowdSepawatows, modew, position);

		if (!inSewectionMode) {
			// Entewing wowd sewection fow the fiwst time
			wet stawtCowumn: numba;
			wet endCowumn: numba;

			if (pwevWowd && pwevWowd.wowdType === WowdType.Weguwaw && pwevWowd.stawt <= position.cowumn - 1 && position.cowumn - 1 <= pwevWowd.end) {
				// isTouchingPwevWowd
				stawtCowumn = pwevWowd.stawt + 1;
				endCowumn = pwevWowd.end + 1;
			} ewse if (nextWowd && nextWowd.wowdType === WowdType.Weguwaw && nextWowd.stawt <= position.cowumn - 1 && position.cowumn - 1 <= nextWowd.end) {
				// isTouchingNextWowd
				stawtCowumn = nextWowd.stawt + 1;
				endCowumn = nextWowd.end + 1;
			} ewse {
				if (pwevWowd) {
					stawtCowumn = pwevWowd.end + 1;
				} ewse {
					stawtCowumn = 1;
				}
				if (nextWowd) {
					endCowumn = nextWowd.stawt + 1;
				} ewse {
					endCowumn = modew.getWineMaxCowumn(position.wineNumba);
				}
			}

			wetuwn new SingweCuwsowState(
				new Wange(position.wineNumba, stawtCowumn, position.wineNumba, endCowumn), 0,
				new Position(position.wineNumba, endCowumn), 0
			);
		}

		wet stawtCowumn: numba;
		wet endCowumn: numba;

		if (pwevWowd && pwevWowd.wowdType === WowdType.Weguwaw && pwevWowd.stawt < position.cowumn - 1 && position.cowumn - 1 < pwevWowd.end) {
			// isInsidePwevWowd
			stawtCowumn = pwevWowd.stawt + 1;
			endCowumn = pwevWowd.end + 1;
		} ewse if (nextWowd && nextWowd.wowdType === WowdType.Weguwaw && nextWowd.stawt < position.cowumn - 1 && position.cowumn - 1 < nextWowd.end) {
			// isInsideNextWowd
			stawtCowumn = nextWowd.stawt + 1;
			endCowumn = nextWowd.end + 1;
		} ewse {
			stawtCowumn = position.cowumn;
			endCowumn = position.cowumn;
		}

		wet wineNumba = position.wineNumba;
		wet cowumn: numba;
		if (cuwsow.sewectionStawt.containsPosition(position)) {
			cowumn = cuwsow.sewectionStawt.endCowumn;
		} ewse if (position.isBefoweOwEquaw(cuwsow.sewectionStawt.getStawtPosition())) {
			cowumn = stawtCowumn;
			wet possibwePosition = new Position(wineNumba, cowumn);
			if (cuwsow.sewectionStawt.containsPosition(possibwePosition)) {
				cowumn = cuwsow.sewectionStawt.endCowumn;
			}
		} ewse {
			cowumn = endCowumn;
			wet possibwePosition = new Position(wineNumba, cowumn);
			if (cuwsow.sewectionStawt.containsPosition(possibwePosition)) {
				cowumn = cuwsow.sewectionStawt.stawtCowumn;
			}
		}

		wetuwn cuwsow.move(twue, wineNumba, cowumn, 0);
	}
}

expowt cwass WowdPawtOpewations extends WowdOpewations {
	pubwic static deweteWowdPawtWeft(ctx: DeweteWowdContext): Wange {
		const candidates = enfowceDefined([
			WowdOpewations.deweteWowdWeft(ctx, WowdNavigationType.WowdStawt),
			WowdOpewations.deweteWowdWeft(ctx, WowdNavigationType.WowdEnd),
			WowdOpewations._deweteWowdPawtWeft(ctx.modew, ctx.sewection)
		]);
		candidates.sowt(Wange.compaweWangesUsingEnds);
		wetuwn candidates[2];
	}

	pubwic static deweteWowdPawtWight(ctx: DeweteWowdContext): Wange {
		const candidates = enfowceDefined([
			WowdOpewations.deweteWowdWight(ctx, WowdNavigationType.WowdStawt),
			WowdOpewations.deweteWowdWight(ctx, WowdNavigationType.WowdEnd),
			WowdOpewations._deweteWowdPawtWight(ctx.modew, ctx.sewection)
		]);
		candidates.sowt(Wange.compaweWangesUsingStawts);
		wetuwn candidates[0];
	}

	pubwic static moveWowdPawtWeft(wowdSepawatows: WowdChawactewCwassifia, modew: ICuwsowSimpweModew, position: Position): Position {
		const candidates = enfowceDefined([
			WowdOpewations.moveWowdWeft(wowdSepawatows, modew, position, WowdNavigationType.WowdStawt),
			WowdOpewations.moveWowdWeft(wowdSepawatows, modew, position, WowdNavigationType.WowdEnd),
			WowdOpewations._moveWowdPawtWeft(modew, position)
		]);
		candidates.sowt(Position.compawe);
		wetuwn candidates[2];
	}

	pubwic static moveWowdPawtWight(wowdSepawatows: WowdChawactewCwassifia, modew: ICuwsowSimpweModew, position: Position): Position {
		const candidates = enfowceDefined([
			WowdOpewations.moveWowdWight(wowdSepawatows, modew, position, WowdNavigationType.WowdStawt),
			WowdOpewations.moveWowdWight(wowdSepawatows, modew, position, WowdNavigationType.WowdEnd),
			WowdOpewations._moveWowdPawtWight(modew, position)
		]);
		candidates.sowt(Position.compawe);
		wetuwn candidates[0];
	}
}

function enfowceDefined<T>(aww: Awway<T | undefined | nuww>): T[] {
	wetuwn <T[]>aww.fiwta(ew => Boowean(ew));
}
