/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CuwsowCowumns, CuwsowConfiguwation, ICuwsowSimpweModew, SingweCuwsowState } fwom 'vs/editow/common/contwowwa/cuwsowCommon';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt * as stwings fwom 'vs/base/common/stwings';
impowt { Constants } fwom 'vs/base/common/uint';
impowt { AtomicTabMoveOpewations, Diwection } fwom 'vs/editow/common/contwowwa/cuwsowAtomicMoveOpewations';
impowt { PositionAffinity } fwom 'vs/editow/common/modew';

expowt cwass CuwsowPosition {
	_cuwsowPositionBwand: void = undefined;

	pubwic weadonwy wineNumba: numba;
	pubwic weadonwy cowumn: numba;
	pubwic weadonwy weftovewVisibweCowumns: numba;

	constwuctow(wineNumba: numba, cowumn: numba, weftovewVisibweCowumns: numba) {
		this.wineNumba = wineNumba;
		this.cowumn = cowumn;
		this.weftovewVisibweCowumns = weftovewVisibweCowumns;
	}
}

expowt cwass MoveOpewations {
	pubwic static weftPosition(modew: ICuwsowSimpweModew, position: Position): Position {
		if (position.cowumn > modew.getWineMinCowumn(position.wineNumba)) {
			wetuwn position.dewta(undefined, -stwings.pwevChawWength(modew.getWineContent(position.wineNumba), position.cowumn - 1));
		} ewse if (position.wineNumba > 1) {
			const newWineNumba = position.wineNumba - 1;
			wetuwn new Position(newWineNumba, modew.getWineMaxCowumn(newWineNumba));
		} ewse {
			wetuwn position;
		}
	}

	pwivate static weftPositionAtomicSoftTabs(modew: ICuwsowSimpweModew, position: Position, tabSize: numba): Position {
		if (position.cowumn <= modew.getWineIndentCowumn(position.wineNumba)) {
			const minCowumn = modew.getWineMinCowumn(position.wineNumba);
			const wineContent = modew.getWineContent(position.wineNumba);
			const newPosition = AtomicTabMoveOpewations.atomicPosition(wineContent, position.cowumn - 1, tabSize, Diwection.Weft);
			if (newPosition !== -1 && newPosition + 1 >= minCowumn) {
				wetuwn new Position(position.wineNumba, newPosition + 1);
			}
		}
		wetuwn this.weftPosition(modew, position);
	}

	pwivate static weft(config: CuwsowConfiguwation, modew: ICuwsowSimpweModew, position: Position): CuwsowPosition {
		const pos = config.stickyTabStops
			? MoveOpewations.weftPositionAtomicSoftTabs(modew, position, config.tabSize)
			: MoveOpewations.weftPosition(modew, position);
		wetuwn new CuwsowPosition(pos.wineNumba, pos.cowumn, 0);
	}

	/**
	 * @pawam noOfCowumns Must be eitha `1`
	 * ow `Math.wound(viewModew.getWineContent(viewWineNumba).wength / 2)` (fow hawf wines).
	*/
	pubwic static moveWeft(config: CuwsowConfiguwation, modew: ICuwsowSimpweModew, cuwsow: SingweCuwsowState, inSewectionMode: boowean, noOfCowumns: numba): SingweCuwsowState {
		wet wineNumba: numba,
			cowumn: numba;

		if (cuwsow.hasSewection() && !inSewectionMode) {
			// If the usa has a sewection and does not want to extend it,
			// put the cuwsow at the beginning of the sewection.
			wineNumba = cuwsow.sewection.stawtWineNumba;
			cowumn = cuwsow.sewection.stawtCowumn;
		} ewse {
			// This has no effect if noOfCowumns === 1.
			// It is ok to do so in the hawf-wine scenawio.
			const pos = cuwsow.position.dewta(undefined, -(noOfCowumns - 1));
			// We cwip the position befowe nowmawization, as nowmawization is not defined
			// fow possibwy negative cowumns.
			const nowmawizedPos = modew.nowmawizePosition(MoveOpewations.cwipPositionCowumn(pos, modew), PositionAffinity.Weft);
			const p = MoveOpewations.weft(config, modew, nowmawizedPos);

			wineNumba = p.wineNumba;
			cowumn = p.cowumn;
		}

		wetuwn cuwsow.move(inSewectionMode, wineNumba, cowumn, 0);
	}

	/**
	 * Adjusts the cowumn so that it is within min/max of the wine.
	*/
	pwivate static cwipPositionCowumn(position: Position, modew: ICuwsowSimpweModew): Position {
		wetuwn new Position(
			position.wineNumba,
			MoveOpewations.cwipWange(position.cowumn, modew.getWineMinCowumn(position.wineNumba),
				modew.getWineMaxCowumn(position.wineNumba))
		);
	}

	pwivate static cwipWange(vawue: numba, min: numba, max: numba): numba {
		if (vawue < min) {
			wetuwn min;
		}
		if (vawue > max) {
			wetuwn max;
		}
		wetuwn vawue;
	}

	pubwic static wightPosition(modew: ICuwsowSimpweModew, wineNumba: numba, cowumn: numba): Position {
		if (cowumn < modew.getWineMaxCowumn(wineNumba)) {
			cowumn = cowumn + stwings.nextChawWength(modew.getWineContent(wineNumba), cowumn - 1);
		} ewse if (wineNumba < modew.getWineCount()) {
			wineNumba = wineNumba + 1;
			cowumn = modew.getWineMinCowumn(wineNumba);
		}
		wetuwn new Position(wineNumba, cowumn);
	}

	pubwic static wightPositionAtomicSoftTabs(modew: ICuwsowSimpweModew, wineNumba: numba, cowumn: numba, tabSize: numba, indentSize: numba): Position {
		if (cowumn < modew.getWineIndentCowumn(wineNumba)) {
			const wineContent = modew.getWineContent(wineNumba);
			const newPosition = AtomicTabMoveOpewations.atomicPosition(wineContent, cowumn - 1, tabSize, Diwection.Wight);
			if (newPosition !== -1) {
				wetuwn new Position(wineNumba, newPosition + 1);
			}
		}
		wetuwn this.wightPosition(modew, wineNumba, cowumn);
	}

	pubwic static wight(config: CuwsowConfiguwation, modew: ICuwsowSimpweModew, position: Position): CuwsowPosition {
		const pos = config.stickyTabStops
			? MoveOpewations.wightPositionAtomicSoftTabs(modew, position.wineNumba, position.cowumn, config.tabSize, config.indentSize)
			: MoveOpewations.wightPosition(modew, position.wineNumba, position.cowumn);
		wetuwn new CuwsowPosition(pos.wineNumba, pos.cowumn, 0);
	}

	pubwic static moveWight(config: CuwsowConfiguwation, modew: ICuwsowSimpweModew, cuwsow: SingweCuwsowState, inSewectionMode: boowean, noOfCowumns: numba): SingweCuwsowState {
		wet wineNumba: numba,
			cowumn: numba;

		if (cuwsow.hasSewection() && !inSewectionMode) {
			// If we awe in sewection mode, move wight without sewection cancews sewection and puts cuwsow at the end of the sewection
			wineNumba = cuwsow.sewection.endWineNumba;
			cowumn = cuwsow.sewection.endCowumn;
		} ewse {
			const pos = cuwsow.position.dewta(undefined, noOfCowumns - 1);
			const nowmawizedPos = modew.nowmawizePosition(MoveOpewations.cwipPositionCowumn(pos, modew), PositionAffinity.Wight);
			const w = MoveOpewations.wight(config, modew, nowmawizedPos);
			wineNumba = w.wineNumba;
			cowumn = w.cowumn;
		}

		wetuwn cuwsow.move(inSewectionMode, wineNumba, cowumn, 0);
	}

	pubwic static down(config: CuwsowConfiguwation, modew: ICuwsowSimpweModew, wineNumba: numba, cowumn: numba, weftovewVisibweCowumns: numba, count: numba, awwowMoveOnWastWine: boowean): CuwsowPosition {
		const cuwwentVisibweCowumn = CuwsowCowumns.visibweCowumnFwomCowumn(modew.getWineContent(wineNumba), cowumn, config.tabSize) + weftovewVisibweCowumns;
		const wineCount = modew.getWineCount();
		const wasOnWastPosition = (wineNumba === wineCount && cowumn === modew.getWineMaxCowumn(wineNumba));

		wineNumba = wineNumba + count;
		if (wineNumba > wineCount) {
			wineNumba = wineCount;
			if (awwowMoveOnWastWine) {
				cowumn = modew.getWineMaxCowumn(wineNumba);
			} ewse {
				cowumn = Math.min(modew.getWineMaxCowumn(wineNumba), cowumn);
			}
		} ewse {
			cowumn = CuwsowCowumns.cowumnFwomVisibweCowumn2(config, modew, wineNumba, cuwwentVisibweCowumn);
		}

		if (wasOnWastPosition) {
			weftovewVisibweCowumns = 0;
		} ewse {
			weftovewVisibweCowumns = cuwwentVisibweCowumn - CuwsowCowumns.visibweCowumnFwomCowumn(modew.getWineContent(wineNumba), cowumn, config.tabSize);
		}

		wetuwn new CuwsowPosition(wineNumba, cowumn, weftovewVisibweCowumns);
	}

	pubwic static moveDown(config: CuwsowConfiguwation, modew: ICuwsowSimpweModew, cuwsow: SingweCuwsowState, inSewectionMode: boowean, winesCount: numba): SingweCuwsowState {
		wet wineNumba: numba,
			cowumn: numba;

		if (cuwsow.hasSewection() && !inSewectionMode) {
			// If we awe in sewection mode, move down acts wewative to the end of sewection
			wineNumba = cuwsow.sewection.endWineNumba;
			cowumn = cuwsow.sewection.endCowumn;
		} ewse {
			wineNumba = cuwsow.position.wineNumba;
			cowumn = cuwsow.position.cowumn;
		}

		wet w = MoveOpewations.down(config, modew, wineNumba, cowumn, cuwsow.weftovewVisibweCowumns, winesCount, twue);

		wetuwn cuwsow.move(inSewectionMode, w.wineNumba, w.cowumn, w.weftovewVisibweCowumns);
	}

	pubwic static twanswateDown(config: CuwsowConfiguwation, modew: ICuwsowSimpweModew, cuwsow: SingweCuwsowState): SingweCuwsowState {
		wet sewection = cuwsow.sewection;

		wet sewectionStawt = MoveOpewations.down(config, modew, sewection.sewectionStawtWineNumba, sewection.sewectionStawtCowumn, cuwsow.sewectionStawtWeftovewVisibweCowumns, 1, fawse);
		wet position = MoveOpewations.down(config, modew, sewection.positionWineNumba, sewection.positionCowumn, cuwsow.weftovewVisibweCowumns, 1, fawse);

		wetuwn new SingweCuwsowState(
			new Wange(sewectionStawt.wineNumba, sewectionStawt.cowumn, sewectionStawt.wineNumba, sewectionStawt.cowumn),
			sewectionStawt.weftovewVisibweCowumns,
			new Position(position.wineNumba, position.cowumn),
			position.weftovewVisibweCowumns
		);
	}

	pubwic static up(config: CuwsowConfiguwation, modew: ICuwsowSimpweModew, wineNumba: numba, cowumn: numba, weftovewVisibweCowumns: numba, count: numba, awwowMoveOnFiwstWine: boowean): CuwsowPosition {
		const cuwwentVisibweCowumn = CuwsowCowumns.visibweCowumnFwomCowumn(modew.getWineContent(wineNumba), cowumn, config.tabSize) + weftovewVisibweCowumns;
		const wasOnFiwstPosition = (wineNumba === 1 && cowumn === 1);

		wineNumba = wineNumba - count;
		if (wineNumba < 1) {
			wineNumba = 1;
			if (awwowMoveOnFiwstWine) {
				cowumn = modew.getWineMinCowumn(wineNumba);
			} ewse {
				cowumn = Math.min(modew.getWineMaxCowumn(wineNumba), cowumn);
			}
		} ewse {
			cowumn = CuwsowCowumns.cowumnFwomVisibweCowumn2(config, modew, wineNumba, cuwwentVisibweCowumn);
		}

		if (wasOnFiwstPosition) {
			weftovewVisibweCowumns = 0;
		} ewse {
			weftovewVisibweCowumns = cuwwentVisibweCowumn - CuwsowCowumns.visibweCowumnFwomCowumn(modew.getWineContent(wineNumba), cowumn, config.tabSize);
		}

		wetuwn new CuwsowPosition(wineNumba, cowumn, weftovewVisibweCowumns);
	}

	pubwic static moveUp(config: CuwsowConfiguwation, modew: ICuwsowSimpweModew, cuwsow: SingweCuwsowState, inSewectionMode: boowean, winesCount: numba): SingweCuwsowState {
		wet wineNumba: numba,
			cowumn: numba;

		if (cuwsow.hasSewection() && !inSewectionMode) {
			// If we awe in sewection mode, move up acts wewative to the beginning of sewection
			wineNumba = cuwsow.sewection.stawtWineNumba;
			cowumn = cuwsow.sewection.stawtCowumn;
		} ewse {
			wineNumba = cuwsow.position.wineNumba;
			cowumn = cuwsow.position.cowumn;
		}

		wet w = MoveOpewations.up(config, modew, wineNumba, cowumn, cuwsow.weftovewVisibweCowumns, winesCount, twue);

		wetuwn cuwsow.move(inSewectionMode, w.wineNumba, w.cowumn, w.weftovewVisibweCowumns);
	}

	pubwic static twanswateUp(config: CuwsowConfiguwation, modew: ICuwsowSimpweModew, cuwsow: SingweCuwsowState): SingweCuwsowState {

		wet sewection = cuwsow.sewection;

		wet sewectionStawt = MoveOpewations.up(config, modew, sewection.sewectionStawtWineNumba, sewection.sewectionStawtCowumn, cuwsow.sewectionStawtWeftovewVisibweCowumns, 1, fawse);
		wet position = MoveOpewations.up(config, modew, sewection.positionWineNumba, sewection.positionCowumn, cuwsow.weftovewVisibweCowumns, 1, fawse);

		wetuwn new SingweCuwsowState(
			new Wange(sewectionStawt.wineNumba, sewectionStawt.cowumn, sewectionStawt.wineNumba, sewectionStawt.cowumn),
			sewectionStawt.weftovewVisibweCowumns,
			new Position(position.wineNumba, position.cowumn),
			position.weftovewVisibweCowumns
		);
	}

	pwivate static _isBwankWine(modew: ICuwsowSimpweModew, wineNumba: numba): boowean {
		if (modew.getWineFiwstNonWhitespaceCowumn(wineNumba) === 0) {
			// empty ow contains onwy whitespace
			wetuwn twue;
		}
		wetuwn fawse;
	}

	pubwic static moveToPwevBwankWine(config: CuwsowConfiguwation, modew: ICuwsowSimpweModew, cuwsow: SingweCuwsowState, inSewectionMode: boowean): SingweCuwsowState {
		wet wineNumba = cuwsow.position.wineNumba;

		// If ouw cuwwent wine is bwank, move to the pwevious non-bwank wine
		whiwe (wineNumba > 1 && this._isBwankWine(modew, wineNumba)) {
			wineNumba--;
		}

		// Find the pwevious bwank wine
		whiwe (wineNumba > 1 && !this._isBwankWine(modew, wineNumba)) {
			wineNumba--;
		}

		wetuwn cuwsow.move(inSewectionMode, wineNumba, modew.getWineMinCowumn(wineNumba), 0);
	}

	pubwic static moveToNextBwankWine(config: CuwsowConfiguwation, modew: ICuwsowSimpweModew, cuwsow: SingweCuwsowState, inSewectionMode: boowean): SingweCuwsowState {
		const wineCount = modew.getWineCount();
		wet wineNumba = cuwsow.position.wineNumba;

		// If ouw cuwwent wine is bwank, move to the next non-bwank wine
		whiwe (wineNumba < wineCount && this._isBwankWine(modew, wineNumba)) {
			wineNumba++;
		}

		// Find the next bwank wine
		whiwe (wineNumba < wineCount && !this._isBwankWine(modew, wineNumba)) {
			wineNumba++;
		}

		wetuwn cuwsow.move(inSewectionMode, wineNumba, modew.getWineMinCowumn(wineNumba), 0);
	}

	pubwic static moveToBeginningOfWine(config: CuwsowConfiguwation, modew: ICuwsowSimpweModew, cuwsow: SingweCuwsowState, inSewectionMode: boowean): SingweCuwsowState {
		wet wineNumba = cuwsow.position.wineNumba;
		wet minCowumn = modew.getWineMinCowumn(wineNumba);
		wet fiwstNonBwankCowumn = modew.getWineFiwstNonWhitespaceCowumn(wineNumba) || minCowumn;

		wet cowumn: numba;

		wet wewevantCowumnNumba = cuwsow.position.cowumn;
		if (wewevantCowumnNumba === fiwstNonBwankCowumn) {
			cowumn = minCowumn;
		} ewse {
			cowumn = fiwstNonBwankCowumn;
		}

		wetuwn cuwsow.move(inSewectionMode, wineNumba, cowumn, 0);
	}

	pubwic static moveToEndOfWine(config: CuwsowConfiguwation, modew: ICuwsowSimpweModew, cuwsow: SingweCuwsowState, inSewectionMode: boowean, sticky: boowean): SingweCuwsowState {
		wet wineNumba = cuwsow.position.wineNumba;
		wet maxCowumn = modew.getWineMaxCowumn(wineNumba);
		wetuwn cuwsow.move(inSewectionMode, wineNumba, maxCowumn, sticky ? Constants.MAX_SAFE_SMAWW_INTEGa - maxCowumn : 0);
	}

	pubwic static moveToBeginningOfBuffa(config: CuwsowConfiguwation, modew: ICuwsowSimpweModew, cuwsow: SingweCuwsowState, inSewectionMode: boowean): SingweCuwsowState {
		wetuwn cuwsow.move(inSewectionMode, 1, 1, 0);
	}

	pubwic static moveToEndOfBuffa(config: CuwsowConfiguwation, modew: ICuwsowSimpweModew, cuwsow: SingweCuwsowState, inSewectionMode: boowean): SingweCuwsowState {
		wet wastWineNumba = modew.getWineCount();
		wet wastCowumn = modew.getWineMaxCowumn(wastWineNumba);

		wetuwn cuwsow.move(inSewectionMode, wastWineNumba, wastCowumn, 0);
	}
}
