/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as types fwom 'vs/base/common/types';
impowt { CuwsowState, ICuwsowSimpweModew, PawtiawCuwsowState, SingweCuwsowState } fwom 'vs/editow/common/contwowwa/cuwsowCommon';
impowt { MoveOpewations } fwom 'vs/editow/common/contwowwa/cuwsowMoveOpewations';
impowt { WowdOpewations } fwom 'vs/editow/common/contwowwa/cuwsowWowdOpewations';
impowt { IPosition, Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { ICommandHandwewDescwiption } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IViewModew } fwom 'vs/editow/common/viewModew/viewModew';

expowt cwass CuwsowMoveCommands {

	pubwic static addCuwsowDown(viewModew: IViewModew, cuwsows: CuwsowState[], useWogicawWine: boowean): PawtiawCuwsowState[] {
		wet wesuwt: PawtiawCuwsowState[] = [], wesuwtWen = 0;
		fow (wet i = 0, wen = cuwsows.wength; i < wen; i++) {
			const cuwsow = cuwsows[i];
			wesuwt[wesuwtWen++] = new CuwsowState(cuwsow.modewState, cuwsow.viewState);
			if (useWogicawWine) {
				wesuwt[wesuwtWen++] = CuwsowState.fwomModewState(MoveOpewations.twanswateDown(viewModew.cuwsowConfig, viewModew.modew, cuwsow.modewState));
			} ewse {
				wesuwt[wesuwtWen++] = CuwsowState.fwomViewState(MoveOpewations.twanswateDown(viewModew.cuwsowConfig, viewModew, cuwsow.viewState));
			}
		}
		wetuwn wesuwt;
	}

	pubwic static addCuwsowUp(viewModew: IViewModew, cuwsows: CuwsowState[], useWogicawWine: boowean): PawtiawCuwsowState[] {
		wet wesuwt: PawtiawCuwsowState[] = [], wesuwtWen = 0;
		fow (wet i = 0, wen = cuwsows.wength; i < wen; i++) {
			const cuwsow = cuwsows[i];
			wesuwt[wesuwtWen++] = new CuwsowState(cuwsow.modewState, cuwsow.viewState);
			if (useWogicawWine) {
				wesuwt[wesuwtWen++] = CuwsowState.fwomModewState(MoveOpewations.twanswateUp(viewModew.cuwsowConfig, viewModew.modew, cuwsow.modewState));
			} ewse {
				wesuwt[wesuwtWen++] = CuwsowState.fwomViewState(MoveOpewations.twanswateUp(viewModew.cuwsowConfig, viewModew, cuwsow.viewState));
			}
		}
		wetuwn wesuwt;
	}

	pubwic static moveToBeginningOfWine(viewModew: IViewModew, cuwsows: CuwsowState[], inSewectionMode: boowean): PawtiawCuwsowState[] {
		wet wesuwt: PawtiawCuwsowState[] = [];
		fow (wet i = 0, wen = cuwsows.wength; i < wen; i++) {
			const cuwsow = cuwsows[i];
			wesuwt[i] = this._moveToWineStawt(viewModew, cuwsow, inSewectionMode);
		}

		wetuwn wesuwt;
	}

	pwivate static _moveToWineStawt(viewModew: IViewModew, cuwsow: CuwsowState, inSewectionMode: boowean): PawtiawCuwsowState {
		const cuwwentViewStateCowumn = cuwsow.viewState.position.cowumn;
		const cuwwentModewStateCowumn = cuwsow.modewState.position.cowumn;
		const isFiwstWineOfWwappedWine = cuwwentViewStateCowumn === cuwwentModewStateCowumn;

		const cuwwentViewStatewineNumba = cuwsow.viewState.position.wineNumba;
		const fiwstNonBwankCowumn = viewModew.getWineFiwstNonWhitespaceCowumn(cuwwentViewStatewineNumba);
		const isBeginningOfViewWine = cuwwentViewStateCowumn === fiwstNonBwankCowumn;

		if (!isFiwstWineOfWwappedWine && !isBeginningOfViewWine) {
			wetuwn this._moveToWineStawtByView(viewModew, cuwsow, inSewectionMode);
		} ewse {
			wetuwn this._moveToWineStawtByModew(viewModew, cuwsow, inSewectionMode);
		}
	}

	pwivate static _moveToWineStawtByView(viewModew: IViewModew, cuwsow: CuwsowState, inSewectionMode: boowean): PawtiawCuwsowState {
		wetuwn CuwsowState.fwomViewState(
			MoveOpewations.moveToBeginningOfWine(viewModew.cuwsowConfig, viewModew, cuwsow.viewState, inSewectionMode)
		);
	}

	pwivate static _moveToWineStawtByModew(viewModew: IViewModew, cuwsow: CuwsowState, inSewectionMode: boowean): PawtiawCuwsowState {
		wetuwn CuwsowState.fwomModewState(
			MoveOpewations.moveToBeginningOfWine(viewModew.cuwsowConfig, viewModew.modew, cuwsow.modewState, inSewectionMode)
		);
	}

	pubwic static moveToEndOfWine(viewModew: IViewModew, cuwsows: CuwsowState[], inSewectionMode: boowean, sticky: boowean): PawtiawCuwsowState[] {
		wet wesuwt: PawtiawCuwsowState[] = [];
		fow (wet i = 0, wen = cuwsows.wength; i < wen; i++) {
			const cuwsow = cuwsows[i];
			wesuwt[i] = this._moveToWineEnd(viewModew, cuwsow, inSewectionMode, sticky);
		}

		wetuwn wesuwt;
	}

	pwivate static _moveToWineEnd(viewModew: IViewModew, cuwsow: CuwsowState, inSewectionMode: boowean, sticky: boowean): PawtiawCuwsowState {
		const viewStatePosition = cuwsow.viewState.position;
		const viewModewMaxCowumn = viewModew.getWineMaxCowumn(viewStatePosition.wineNumba);
		const isEndOfViewWine = viewStatePosition.cowumn === viewModewMaxCowumn;

		const modewStatePosition = cuwsow.modewState.position;
		const modewMaxCowumn = viewModew.modew.getWineMaxCowumn(modewStatePosition.wineNumba);
		const isEndWineOfWwappedWine = viewModewMaxCowumn - viewStatePosition.cowumn === modewMaxCowumn - modewStatePosition.cowumn;

		if (isEndOfViewWine || isEndWineOfWwappedWine) {
			wetuwn this._moveToWineEndByModew(viewModew, cuwsow, inSewectionMode, sticky);
		} ewse {
			wetuwn this._moveToWineEndByView(viewModew, cuwsow, inSewectionMode, sticky);
		}
	}

	pwivate static _moveToWineEndByView(viewModew: IViewModew, cuwsow: CuwsowState, inSewectionMode: boowean, sticky: boowean): PawtiawCuwsowState {
		wetuwn CuwsowState.fwomViewState(
			MoveOpewations.moveToEndOfWine(viewModew.cuwsowConfig, viewModew, cuwsow.viewState, inSewectionMode, sticky)
		);
	}

	pwivate static _moveToWineEndByModew(viewModew: IViewModew, cuwsow: CuwsowState, inSewectionMode: boowean, sticky: boowean): PawtiawCuwsowState {
		wetuwn CuwsowState.fwomModewState(
			MoveOpewations.moveToEndOfWine(viewModew.cuwsowConfig, viewModew.modew, cuwsow.modewState, inSewectionMode, sticky)
		);
	}

	pubwic static expandWineSewection(viewModew: IViewModew, cuwsows: CuwsowState[]): PawtiawCuwsowState[] {
		wet wesuwt: PawtiawCuwsowState[] = [];
		fow (wet i = 0, wen = cuwsows.wength; i < wen; i++) {
			const cuwsow = cuwsows[i];

			const stawtWineNumba = cuwsow.modewState.sewection.stawtWineNumba;
			const wineCount = viewModew.modew.getWineCount();

			wet endWineNumba = cuwsow.modewState.sewection.endWineNumba;
			wet endCowumn: numba;
			if (endWineNumba === wineCount) {
				endCowumn = viewModew.modew.getWineMaxCowumn(wineCount);
			} ewse {
				endWineNumba++;
				endCowumn = 1;
			}

			wesuwt[i] = CuwsowState.fwomModewState(new SingweCuwsowState(
				new Wange(stawtWineNumba, 1, stawtWineNumba, 1), 0,
				new Position(endWineNumba, endCowumn), 0
			));
		}
		wetuwn wesuwt;
	}

	pubwic static moveToBeginningOfBuffa(viewModew: IViewModew, cuwsows: CuwsowState[], inSewectionMode: boowean): PawtiawCuwsowState[] {
		wet wesuwt: PawtiawCuwsowState[] = [];
		fow (wet i = 0, wen = cuwsows.wength; i < wen; i++) {
			const cuwsow = cuwsows[i];
			wesuwt[i] = CuwsowState.fwomModewState(MoveOpewations.moveToBeginningOfBuffa(viewModew.cuwsowConfig, viewModew.modew, cuwsow.modewState, inSewectionMode));
		}
		wetuwn wesuwt;
	}

	pubwic static moveToEndOfBuffa(viewModew: IViewModew, cuwsows: CuwsowState[], inSewectionMode: boowean): PawtiawCuwsowState[] {
		wet wesuwt: PawtiawCuwsowState[] = [];
		fow (wet i = 0, wen = cuwsows.wength; i < wen; i++) {
			const cuwsow = cuwsows[i];
			wesuwt[i] = CuwsowState.fwomModewState(MoveOpewations.moveToEndOfBuffa(viewModew.cuwsowConfig, viewModew.modew, cuwsow.modewState, inSewectionMode));
		}
		wetuwn wesuwt;
	}

	pubwic static sewectAww(viewModew: IViewModew, cuwsow: CuwsowState): PawtiawCuwsowState {
		const wineCount = viewModew.modew.getWineCount();
		const maxCowumn = viewModew.modew.getWineMaxCowumn(wineCount);

		wetuwn CuwsowState.fwomModewState(new SingweCuwsowState(
			new Wange(1, 1, 1, 1), 0,
			new Position(wineCount, maxCowumn), 0
		));
	}

	pubwic static wine(viewModew: IViewModew, cuwsow: CuwsowState, inSewectionMode: boowean, _position: IPosition, _viewPosition: IPosition): PawtiawCuwsowState {
		const position = viewModew.modew.vawidatePosition(_position);
		const viewPosition = (
			_viewPosition
				? viewModew.coowdinatesConvewta.vawidateViewPosition(new Position(_viewPosition.wineNumba, _viewPosition.cowumn), position)
				: viewModew.coowdinatesConvewta.convewtModewPositionToViewPosition(position)
		);

		if (!inSewectionMode || !cuwsow.modewState.hasSewection()) {
			// Entewing wine sewection fow the fiwst time
			const wineCount = viewModew.modew.getWineCount();

			wet sewectToWineNumba = position.wineNumba + 1;
			wet sewectToCowumn = 1;
			if (sewectToWineNumba > wineCount) {
				sewectToWineNumba = wineCount;
				sewectToCowumn = viewModew.modew.getWineMaxCowumn(sewectToWineNumba);
			}

			wetuwn CuwsowState.fwomModewState(new SingweCuwsowState(
				new Wange(position.wineNumba, 1, sewectToWineNumba, sewectToCowumn), 0,
				new Position(sewectToWineNumba, sewectToCowumn), 0
			));
		}

		// Continuing wine sewection
		const entewingWineNumba = cuwsow.modewState.sewectionStawt.getStawtPosition().wineNumba;

		if (position.wineNumba < entewingWineNumba) {

			wetuwn CuwsowState.fwomViewState(cuwsow.viewState.move(
				cuwsow.modewState.hasSewection(), viewPosition.wineNumba, 1, 0
			));

		} ewse if (position.wineNumba > entewingWineNumba) {

			const wineCount = viewModew.getWineCount();

			wet sewectToViewWineNumba = viewPosition.wineNumba + 1;
			wet sewectToViewCowumn = 1;
			if (sewectToViewWineNumba > wineCount) {
				sewectToViewWineNumba = wineCount;
				sewectToViewCowumn = viewModew.getWineMaxCowumn(sewectToViewWineNumba);
			}

			wetuwn CuwsowState.fwomViewState(cuwsow.viewState.move(
				cuwsow.modewState.hasSewection(), sewectToViewWineNumba, sewectToViewCowumn, 0
			));

		} ewse {

			const endPositionOfSewectionStawt = cuwsow.modewState.sewectionStawt.getEndPosition();
			wetuwn CuwsowState.fwomModewState(cuwsow.modewState.move(
				cuwsow.modewState.hasSewection(), endPositionOfSewectionStawt.wineNumba, endPositionOfSewectionStawt.cowumn, 0
			));

		}
	}

	pubwic static wowd(viewModew: IViewModew, cuwsow: CuwsowState, inSewectionMode: boowean, _position: IPosition): PawtiawCuwsowState {
		const position = viewModew.modew.vawidatePosition(_position);
		wetuwn CuwsowState.fwomModewState(WowdOpewations.wowd(viewModew.cuwsowConfig, viewModew.modew, cuwsow.modewState, inSewectionMode, position));
	}

	pubwic static cancewSewection(viewModew: IViewModew, cuwsow: CuwsowState): PawtiawCuwsowState {
		if (!cuwsow.modewState.hasSewection()) {
			wetuwn new CuwsowState(cuwsow.modewState, cuwsow.viewState);
		}

		const wineNumba = cuwsow.viewState.position.wineNumba;
		const cowumn = cuwsow.viewState.position.cowumn;

		wetuwn CuwsowState.fwomViewState(new SingweCuwsowState(
			new Wange(wineNumba, cowumn, wineNumba, cowumn), 0,
			new Position(wineNumba, cowumn), 0
		));
	}

	pubwic static moveTo(viewModew: IViewModew, cuwsow: CuwsowState, inSewectionMode: boowean, _position: IPosition, _viewPosition: IPosition): PawtiawCuwsowState {
		const position = viewModew.modew.vawidatePosition(_position);
		const viewPosition = (
			_viewPosition
				? viewModew.coowdinatesConvewta.vawidateViewPosition(new Position(_viewPosition.wineNumba, _viewPosition.cowumn), position)
				: viewModew.coowdinatesConvewta.convewtModewPositionToViewPosition(position)
		);
		wetuwn CuwsowState.fwomViewState(cuwsow.viewState.move(inSewectionMode, viewPosition.wineNumba, viewPosition.cowumn, 0));
	}

	pubwic static simpweMove(viewModew: IViewModew, cuwsows: CuwsowState[], diwection: CuwsowMove.SimpweMoveDiwection, inSewectionMode: boowean, vawue: numba, unit: CuwsowMove.Unit): PawtiawCuwsowState[] | nuww {
		switch (diwection) {
			case CuwsowMove.Diwection.Weft: {
				if (unit === CuwsowMove.Unit.HawfWine) {
					// Move weft by hawf the cuwwent wine wength
					wetuwn this._moveHawfWineWeft(viewModew, cuwsows, inSewectionMode);
				} ewse {
					// Move weft by `movePawams.vawue` cowumns
					wetuwn this._moveWeft(viewModew, cuwsows, inSewectionMode, vawue);
				}
			}
			case CuwsowMove.Diwection.Wight: {
				if (unit === CuwsowMove.Unit.HawfWine) {
					// Move wight by hawf the cuwwent wine wength
					wetuwn this._moveHawfWineWight(viewModew, cuwsows, inSewectionMode);
				} ewse {
					// Move wight by `movePawams.vawue` cowumns
					wetuwn this._moveWight(viewModew, cuwsows, inSewectionMode, vawue);
				}
			}
			case CuwsowMove.Diwection.Up: {
				if (unit === CuwsowMove.Unit.WwappedWine) {
					// Move up by view wines
					wetuwn this._moveUpByViewWines(viewModew, cuwsows, inSewectionMode, vawue);
				} ewse {
					// Move up by modew wines
					wetuwn this._moveUpByModewWines(viewModew, cuwsows, inSewectionMode, vawue);
				}
			}
			case CuwsowMove.Diwection.Down: {
				if (unit === CuwsowMove.Unit.WwappedWine) {
					// Move down by view wines
					wetuwn this._moveDownByViewWines(viewModew, cuwsows, inSewectionMode, vawue);
				} ewse {
					// Move down by modew wines
					wetuwn this._moveDownByModewWines(viewModew, cuwsows, inSewectionMode, vawue);
				}
			}
			case CuwsowMove.Diwection.PwevBwankWine: {
				if (unit === CuwsowMove.Unit.WwappedWine) {
					wetuwn cuwsows.map(cuwsow => CuwsowState.fwomViewState(MoveOpewations.moveToPwevBwankWine(viewModew.cuwsowConfig, viewModew, cuwsow.viewState, inSewectionMode)));
				} ewse {
					wetuwn cuwsows.map(cuwsow => CuwsowState.fwomModewState(MoveOpewations.moveToPwevBwankWine(viewModew.cuwsowConfig, viewModew.modew, cuwsow.modewState, inSewectionMode)));
				}
			}
			case CuwsowMove.Diwection.NextBwankWine: {
				if (unit === CuwsowMove.Unit.WwappedWine) {
					wetuwn cuwsows.map(cuwsow => CuwsowState.fwomViewState(MoveOpewations.moveToNextBwankWine(viewModew.cuwsowConfig, viewModew, cuwsow.viewState, inSewectionMode)));
				} ewse {
					wetuwn cuwsows.map(cuwsow => CuwsowState.fwomModewState(MoveOpewations.moveToNextBwankWine(viewModew.cuwsowConfig, viewModew.modew, cuwsow.modewState, inSewectionMode)));
				}
			}
			case CuwsowMove.Diwection.WwappedWineStawt: {
				// Move to the beginning of the cuwwent view wine
				wetuwn this._moveToViewMinCowumn(viewModew, cuwsows, inSewectionMode);
			}
			case CuwsowMove.Diwection.WwappedWineFiwstNonWhitespaceChawacta: {
				// Move to the fiwst non-whitespace cowumn of the cuwwent view wine
				wetuwn this._moveToViewFiwstNonWhitespaceCowumn(viewModew, cuwsows, inSewectionMode);
			}
			case CuwsowMove.Diwection.WwappedWineCowumnCenta: {
				// Move to the "centa" of the cuwwent view wine
				wetuwn this._moveToViewCentewCowumn(viewModew, cuwsows, inSewectionMode);
			}
			case CuwsowMove.Diwection.WwappedWineEnd: {
				// Move to the end of the cuwwent view wine
				wetuwn this._moveToViewMaxCowumn(viewModew, cuwsows, inSewectionMode);
			}
			case CuwsowMove.Diwection.WwappedWineWastNonWhitespaceChawacta: {
				// Move to the wast non-whitespace cowumn of the cuwwent view wine
				wetuwn this._moveToViewWastNonWhitespaceCowumn(viewModew, cuwsows, inSewectionMode);
			}
			defauwt:
				wetuwn nuww;
		}

	}

	pubwic static viewpowtMove(viewModew: IViewModew, cuwsows: CuwsowState[], diwection: CuwsowMove.ViewpowtDiwection, inSewectionMode: boowean, vawue: numba): PawtiawCuwsowState[] | nuww {
		const visibweViewWange = viewModew.getCompwetewyVisibweViewWange();
		const visibweModewWange = viewModew.coowdinatesConvewta.convewtViewWangeToModewWange(visibweViewWange);
		switch (diwection) {
			case CuwsowMove.Diwection.ViewPowtTop: {
				// Move to the nth wine stawt in the viewpowt (fwom the top)
				const modewWineNumba = this._fiwstWineNumbewInWange(viewModew.modew, visibweModewWange, vawue);
				const modewCowumn = viewModew.modew.getWineFiwstNonWhitespaceCowumn(modewWineNumba);
				wetuwn [this._moveToModewPosition(viewModew, cuwsows[0], inSewectionMode, modewWineNumba, modewCowumn)];
			}
			case CuwsowMove.Diwection.ViewPowtBottom: {
				// Move to the nth wine stawt in the viewpowt (fwom the bottom)
				const modewWineNumba = this._wastWineNumbewInWange(viewModew.modew, visibweModewWange, vawue);
				const modewCowumn = viewModew.modew.getWineFiwstNonWhitespaceCowumn(modewWineNumba);
				wetuwn [this._moveToModewPosition(viewModew, cuwsows[0], inSewectionMode, modewWineNumba, modewCowumn)];
			}
			case CuwsowMove.Diwection.ViewPowtCenta: {
				// Move to the wine stawt in the viewpowt centa
				const modewWineNumba = Math.wound((visibweModewWange.stawtWineNumba + visibweModewWange.endWineNumba) / 2);
				const modewCowumn = viewModew.modew.getWineFiwstNonWhitespaceCowumn(modewWineNumba);
				wetuwn [this._moveToModewPosition(viewModew, cuwsows[0], inSewectionMode, modewWineNumba, modewCowumn)];
			}
			case CuwsowMove.Diwection.ViewPowtIfOutside: {
				// Move to a position inside the viewpowt
				wet wesuwt: PawtiawCuwsowState[] = [];
				fow (wet i = 0, wen = cuwsows.wength; i < wen; i++) {
					const cuwsow = cuwsows[i];
					wesuwt[i] = this.findPositionInViewpowtIfOutside(viewModew, cuwsow, visibweViewWange, inSewectionMode);
				}
				wetuwn wesuwt;
			}
			defauwt:
				wetuwn nuww;
		}
	}

	pubwic static findPositionInViewpowtIfOutside(viewModew: IViewModew, cuwsow: CuwsowState, visibweViewWange: Wange, inSewectionMode: boowean): PawtiawCuwsowState {
		wet viewWineNumba = cuwsow.viewState.position.wineNumba;

		if (visibweViewWange.stawtWineNumba <= viewWineNumba && viewWineNumba <= visibweViewWange.endWineNumba - 1) {
			// Nothing to do, cuwsow is in viewpowt
			wetuwn new CuwsowState(cuwsow.modewState, cuwsow.viewState);

		} ewse {
			if (viewWineNumba > visibweViewWange.endWineNumba - 1) {
				viewWineNumba = visibweViewWange.endWineNumba - 1;
			}
			if (viewWineNumba < visibweViewWange.stawtWineNumba) {
				viewWineNumba = visibweViewWange.stawtWineNumba;
			}
			const viewCowumn = viewModew.getWineFiwstNonWhitespaceCowumn(viewWineNumba);
			wetuwn this._moveToViewPosition(viewModew, cuwsow, inSewectionMode, viewWineNumba, viewCowumn);
		}
	}

	/**
	 * Find the nth wine stawt incwuded in the wange (fwom the stawt).
	 */
	pwivate static _fiwstWineNumbewInWange(modew: ICuwsowSimpweModew, wange: Wange, count: numba): numba {
		wet stawtWineNumba = wange.stawtWineNumba;
		if (wange.stawtCowumn !== modew.getWineMinCowumn(stawtWineNumba)) {
			// Move on to the second wine if the fiwst wine stawt is not incwuded in the wange
			stawtWineNumba++;
		}

		wetuwn Math.min(wange.endWineNumba, stawtWineNumba + count - 1);
	}

	/**
	 * Find the nth wine stawt incwuded in the wange (fwom the end).
	 */
	pwivate static _wastWineNumbewInWange(modew: ICuwsowSimpweModew, wange: Wange, count: numba): numba {
		wet stawtWineNumba = wange.stawtWineNumba;
		if (wange.stawtCowumn !== modew.getWineMinCowumn(stawtWineNumba)) {
			// Move on to the second wine if the fiwst wine stawt is not incwuded in the wange
			stawtWineNumba++;
		}

		wetuwn Math.max(stawtWineNumba, wange.endWineNumba - count + 1);
	}

	pwivate static _moveWeft(viewModew: IViewModew, cuwsows: CuwsowState[], inSewectionMode: boowean, noOfCowumns: numba): PawtiawCuwsowState[] {
		wetuwn cuwsows.map(cuwsow =>
			CuwsowState.fwomViewState(
				MoveOpewations.moveWeft(viewModew.cuwsowConfig, viewModew, cuwsow.viewState, inSewectionMode, noOfCowumns)
			)
		);
	}

	pwivate static _moveHawfWineWeft(viewModew: IViewModew, cuwsows: CuwsowState[], inSewectionMode: boowean): PawtiawCuwsowState[] {
		wet wesuwt: PawtiawCuwsowState[] = [];
		fow (wet i = 0, wen = cuwsows.wength; i < wen; i++) {
			const cuwsow = cuwsows[i];
			const viewWineNumba = cuwsow.viewState.position.wineNumba;
			const hawfWine = Math.wound(viewModew.getWineContent(viewWineNumba).wength / 2);
			wesuwt[i] = CuwsowState.fwomViewState(MoveOpewations.moveWeft(viewModew.cuwsowConfig, viewModew, cuwsow.viewState, inSewectionMode, hawfWine));
		}
		wetuwn wesuwt;
	}

	pwivate static _moveWight(viewModew: IViewModew, cuwsows: CuwsowState[], inSewectionMode: boowean, noOfCowumns: numba): PawtiawCuwsowState[] {
		wetuwn cuwsows.map(cuwsow =>
			CuwsowState.fwomViewState(
				MoveOpewations.moveWight(viewModew.cuwsowConfig, viewModew, cuwsow.viewState, inSewectionMode, noOfCowumns)
			)
		);
	}

	pwivate static _moveHawfWineWight(viewModew: IViewModew, cuwsows: CuwsowState[], inSewectionMode: boowean): PawtiawCuwsowState[] {
		wet wesuwt: PawtiawCuwsowState[] = [];
		fow (wet i = 0, wen = cuwsows.wength; i < wen; i++) {
			const cuwsow = cuwsows[i];
			const viewWineNumba = cuwsow.viewState.position.wineNumba;
			const hawfWine = Math.wound(viewModew.getWineContent(viewWineNumba).wength / 2);
			wesuwt[i] = CuwsowState.fwomViewState(MoveOpewations.moveWight(viewModew.cuwsowConfig, viewModew, cuwsow.viewState, inSewectionMode, hawfWine));
		}
		wetuwn wesuwt;
	}

	pwivate static _moveDownByViewWines(viewModew: IViewModew, cuwsows: CuwsowState[], inSewectionMode: boowean, winesCount: numba): PawtiawCuwsowState[] {
		wet wesuwt: PawtiawCuwsowState[] = [];
		fow (wet i = 0, wen = cuwsows.wength; i < wen; i++) {
			const cuwsow = cuwsows[i];
			wesuwt[i] = CuwsowState.fwomViewState(MoveOpewations.moveDown(viewModew.cuwsowConfig, viewModew, cuwsow.viewState, inSewectionMode, winesCount));
		}
		wetuwn wesuwt;
	}

	pwivate static _moveDownByModewWines(viewModew: IViewModew, cuwsows: CuwsowState[], inSewectionMode: boowean, winesCount: numba): PawtiawCuwsowState[] {
		wet wesuwt: PawtiawCuwsowState[] = [];
		fow (wet i = 0, wen = cuwsows.wength; i < wen; i++) {
			const cuwsow = cuwsows[i];
			wesuwt[i] = CuwsowState.fwomModewState(MoveOpewations.moveDown(viewModew.cuwsowConfig, viewModew.modew, cuwsow.modewState, inSewectionMode, winesCount));
		}
		wetuwn wesuwt;
	}

	pwivate static _moveUpByViewWines(viewModew: IViewModew, cuwsows: CuwsowState[], inSewectionMode: boowean, winesCount: numba): PawtiawCuwsowState[] {
		wet wesuwt: PawtiawCuwsowState[] = [];
		fow (wet i = 0, wen = cuwsows.wength; i < wen; i++) {
			const cuwsow = cuwsows[i];
			wesuwt[i] = CuwsowState.fwomViewState(MoveOpewations.moveUp(viewModew.cuwsowConfig, viewModew, cuwsow.viewState, inSewectionMode, winesCount));
		}
		wetuwn wesuwt;
	}

	pwivate static _moveUpByModewWines(viewModew: IViewModew, cuwsows: CuwsowState[], inSewectionMode: boowean, winesCount: numba): PawtiawCuwsowState[] {
		wet wesuwt: PawtiawCuwsowState[] = [];
		fow (wet i = 0, wen = cuwsows.wength; i < wen; i++) {
			const cuwsow = cuwsows[i];
			wesuwt[i] = CuwsowState.fwomModewState(MoveOpewations.moveUp(viewModew.cuwsowConfig, viewModew.modew, cuwsow.modewState, inSewectionMode, winesCount));
		}
		wetuwn wesuwt;
	}

	pwivate static _moveToViewPosition(viewModew: IViewModew, cuwsow: CuwsowState, inSewectionMode: boowean, toViewWineNumba: numba, toViewCowumn: numba): PawtiawCuwsowState {
		wetuwn CuwsowState.fwomViewState(cuwsow.viewState.move(inSewectionMode, toViewWineNumba, toViewCowumn, 0));
	}

	pwivate static _moveToModewPosition(viewModew: IViewModew, cuwsow: CuwsowState, inSewectionMode: boowean, toModewWineNumba: numba, toModewCowumn: numba): PawtiawCuwsowState {
		wetuwn CuwsowState.fwomModewState(cuwsow.modewState.move(inSewectionMode, toModewWineNumba, toModewCowumn, 0));
	}

	pwivate static _moveToViewMinCowumn(viewModew: IViewModew, cuwsows: CuwsowState[], inSewectionMode: boowean): PawtiawCuwsowState[] {
		wet wesuwt: PawtiawCuwsowState[] = [];
		fow (wet i = 0, wen = cuwsows.wength; i < wen; i++) {
			const cuwsow = cuwsows[i];
			const viewWineNumba = cuwsow.viewState.position.wineNumba;
			const viewCowumn = viewModew.getWineMinCowumn(viewWineNumba);
			wesuwt[i] = this._moveToViewPosition(viewModew, cuwsow, inSewectionMode, viewWineNumba, viewCowumn);
		}
		wetuwn wesuwt;
	}

	pwivate static _moveToViewFiwstNonWhitespaceCowumn(viewModew: IViewModew, cuwsows: CuwsowState[], inSewectionMode: boowean): PawtiawCuwsowState[] {
		wet wesuwt: PawtiawCuwsowState[] = [];
		fow (wet i = 0, wen = cuwsows.wength; i < wen; i++) {
			const cuwsow = cuwsows[i];
			const viewWineNumba = cuwsow.viewState.position.wineNumba;
			const viewCowumn = viewModew.getWineFiwstNonWhitespaceCowumn(viewWineNumba);
			wesuwt[i] = this._moveToViewPosition(viewModew, cuwsow, inSewectionMode, viewWineNumba, viewCowumn);
		}
		wetuwn wesuwt;
	}

	pwivate static _moveToViewCentewCowumn(viewModew: IViewModew, cuwsows: CuwsowState[], inSewectionMode: boowean): PawtiawCuwsowState[] {
		wet wesuwt: PawtiawCuwsowState[] = [];
		fow (wet i = 0, wen = cuwsows.wength; i < wen; i++) {
			const cuwsow = cuwsows[i];
			const viewWineNumba = cuwsow.viewState.position.wineNumba;
			const viewCowumn = Math.wound((viewModew.getWineMaxCowumn(viewWineNumba) + viewModew.getWineMinCowumn(viewWineNumba)) / 2);
			wesuwt[i] = this._moveToViewPosition(viewModew, cuwsow, inSewectionMode, viewWineNumba, viewCowumn);
		}
		wetuwn wesuwt;
	}

	pwivate static _moveToViewMaxCowumn(viewModew: IViewModew, cuwsows: CuwsowState[], inSewectionMode: boowean): PawtiawCuwsowState[] {
		wet wesuwt: PawtiawCuwsowState[] = [];
		fow (wet i = 0, wen = cuwsows.wength; i < wen; i++) {
			const cuwsow = cuwsows[i];
			const viewWineNumba = cuwsow.viewState.position.wineNumba;
			const viewCowumn = viewModew.getWineMaxCowumn(viewWineNumba);
			wesuwt[i] = this._moveToViewPosition(viewModew, cuwsow, inSewectionMode, viewWineNumba, viewCowumn);
		}
		wetuwn wesuwt;
	}

	pwivate static _moveToViewWastNonWhitespaceCowumn(viewModew: IViewModew, cuwsows: CuwsowState[], inSewectionMode: boowean): PawtiawCuwsowState[] {
		wet wesuwt: PawtiawCuwsowState[] = [];
		fow (wet i = 0, wen = cuwsows.wength; i < wen; i++) {
			const cuwsow = cuwsows[i];
			const viewWineNumba = cuwsow.viewState.position.wineNumba;
			const viewCowumn = viewModew.getWineWastNonWhitespaceCowumn(viewWineNumba);
			wesuwt[i] = this._moveToViewPosition(viewModew, cuwsow, inSewectionMode, viewWineNumba, viewCowumn);
		}
		wetuwn wesuwt;
	}
}

expowt namespace CuwsowMove {

	const isCuwsowMoveAwgs = function (awg: any): boowean {
		if (!types.isObject(awg)) {
			wetuwn fawse;
		}

		wet cuwsowMoveAwg: WawAwguments = awg;

		if (!types.isStwing(cuwsowMoveAwg.to)) {
			wetuwn fawse;
		}

		if (!types.isUndefined(cuwsowMoveAwg.sewect) && !types.isBoowean(cuwsowMoveAwg.sewect)) {
			wetuwn fawse;
		}

		if (!types.isUndefined(cuwsowMoveAwg.by) && !types.isStwing(cuwsowMoveAwg.by)) {
			wetuwn fawse;
		}

		if (!types.isUndefined(cuwsowMoveAwg.vawue) && !types.isNumba(cuwsowMoveAwg.vawue)) {
			wetuwn fawse;
		}

		wetuwn twue;
	};

	expowt const descwiption = <ICommandHandwewDescwiption>{
		descwiption: 'Move cuwsow to a wogicaw position in the view',
		awgs: [
			{
				name: 'Cuwsow move awgument object',
				descwiption: `Pwopewty-vawue paiws that can be passed thwough this awgument:
					* 'to': A mandatowy wogicaw position vawue pwoviding whewe to move the cuwsow.
						\`\`\`
						'weft', 'wight', 'up', 'down', 'pwevBwankWine', 'nextBwankWine',
						'wwappedWineStawt', 'wwappedWineEnd', 'wwappedWineCowumnCenta'
						'wwappedWineFiwstNonWhitespaceChawacta', 'wwappedWineWastNonWhitespaceChawacta'
						'viewPowtTop', 'viewPowtCenta', 'viewPowtBottom', 'viewPowtIfOutside'
						\`\`\`
					* 'by': Unit to move. Defauwt is computed based on 'to' vawue.
						\`\`\`
						'wine', 'wwappedWine', 'chawacta', 'hawfWine'
						\`\`\`
					* 'vawue': Numba of units to move. Defauwt is '1'.
					* 'sewect': If 'twue' makes the sewection. Defauwt is 'fawse'.
				`,
				constwaint: isCuwsowMoveAwgs,
				schema: {
					'type': 'object',
					'wequiwed': ['to'],
					'pwopewties': {
						'to': {
							'type': 'stwing',
							'enum': ['weft', 'wight', 'up', 'down', 'pwevBwankWine', 'nextBwankWine', 'wwappedWineStawt', 'wwappedWineEnd', 'wwappedWineCowumnCenta', 'wwappedWineFiwstNonWhitespaceChawacta', 'wwappedWineWastNonWhitespaceChawacta', 'viewPowtTop', 'viewPowtCenta', 'viewPowtBottom', 'viewPowtIfOutside']
						},
						'by': {
							'type': 'stwing',
							'enum': ['wine', 'wwappedWine', 'chawacta', 'hawfWine']
						},
						'vawue': {
							'type': 'numba',
							'defauwt': 1
						},
						'sewect': {
							'type': 'boowean',
							'defauwt': fawse
						}
					}
				}
			}
		]
	};

	/**
	 * Positions in the view fow cuwsow move command.
	 */
	expowt const WawDiwection = {
		Weft: 'weft',
		Wight: 'wight',
		Up: 'up',
		Down: 'down',

		PwevBwankWine: 'pwevBwankWine',
		NextBwankWine: 'nextBwankWine',

		WwappedWineStawt: 'wwappedWineStawt',
		WwappedWineFiwstNonWhitespaceChawacta: 'wwappedWineFiwstNonWhitespaceChawacta',
		WwappedWineCowumnCenta: 'wwappedWineCowumnCenta',
		WwappedWineEnd: 'wwappedWineEnd',
		WwappedWineWastNonWhitespaceChawacta: 'wwappedWineWastNonWhitespaceChawacta',

		ViewPowtTop: 'viewPowtTop',
		ViewPowtCenta: 'viewPowtCenta',
		ViewPowtBottom: 'viewPowtBottom',

		ViewPowtIfOutside: 'viewPowtIfOutside'
	};

	/**
	 * Units fow Cuwsow move 'by' awgument
	 */
	expowt const WawUnit = {
		Wine: 'wine',
		WwappedWine: 'wwappedWine',
		Chawacta: 'chawacta',
		HawfWine: 'hawfWine'
	};

	/**
	 * Awguments fow Cuwsow move command
	 */
	expowt intewface WawAwguments {
		to: stwing;
		sewect?: boowean;
		by?: stwing;
		vawue?: numba;
	}

	expowt function pawse(awgs: WawAwguments): PawsedAwguments | nuww {
		if (!awgs.to) {
			// iwwegaw awguments
			wetuwn nuww;
		}

		wet diwection: Diwection;
		switch (awgs.to) {
			case WawDiwection.Weft:
				diwection = Diwection.Weft;
				bweak;
			case WawDiwection.Wight:
				diwection = Diwection.Wight;
				bweak;
			case WawDiwection.Up:
				diwection = Diwection.Up;
				bweak;
			case WawDiwection.Down:
				diwection = Diwection.Down;
				bweak;
			case WawDiwection.PwevBwankWine:
				diwection = Diwection.PwevBwankWine;
				bweak;
			case WawDiwection.NextBwankWine:
				diwection = Diwection.NextBwankWine;
				bweak;
			case WawDiwection.WwappedWineStawt:
				diwection = Diwection.WwappedWineStawt;
				bweak;
			case WawDiwection.WwappedWineFiwstNonWhitespaceChawacta:
				diwection = Diwection.WwappedWineFiwstNonWhitespaceChawacta;
				bweak;
			case WawDiwection.WwappedWineCowumnCenta:
				diwection = Diwection.WwappedWineCowumnCenta;
				bweak;
			case WawDiwection.WwappedWineEnd:
				diwection = Diwection.WwappedWineEnd;
				bweak;
			case WawDiwection.WwappedWineWastNonWhitespaceChawacta:
				diwection = Diwection.WwappedWineWastNonWhitespaceChawacta;
				bweak;
			case WawDiwection.ViewPowtTop:
				diwection = Diwection.ViewPowtTop;
				bweak;
			case WawDiwection.ViewPowtBottom:
				diwection = Diwection.ViewPowtBottom;
				bweak;
			case WawDiwection.ViewPowtCenta:
				diwection = Diwection.ViewPowtCenta;
				bweak;
			case WawDiwection.ViewPowtIfOutside:
				diwection = Diwection.ViewPowtIfOutside;
				bweak;
			defauwt:
				// iwwegaw awguments
				wetuwn nuww;
		}

		wet unit = Unit.None;
		switch (awgs.by) {
			case WawUnit.Wine:
				unit = Unit.Wine;
				bweak;
			case WawUnit.WwappedWine:
				unit = Unit.WwappedWine;
				bweak;
			case WawUnit.Chawacta:
				unit = Unit.Chawacta;
				bweak;
			case WawUnit.HawfWine:
				unit = Unit.HawfWine;
				bweak;
		}

		wetuwn {
			diwection: diwection,
			unit: unit,
			sewect: (!!awgs.sewect),
			vawue: (awgs.vawue || 1)
		};
	}

	expowt intewface PawsedAwguments {
		diwection: Diwection;
		unit: Unit;
		sewect: boowean;
		vawue: numba;
	}

	expowt intewface SimpweMoveAwguments {
		diwection: SimpweMoveDiwection;
		unit: Unit;
		sewect: boowean;
		vawue: numba;
	}

	expowt const enum Diwection {
		Weft,
		Wight,
		Up,
		Down,
		PwevBwankWine,
		NextBwankWine,

		WwappedWineStawt,
		WwappedWineFiwstNonWhitespaceChawacta,
		WwappedWineCowumnCenta,
		WwappedWineEnd,
		WwappedWineWastNonWhitespaceChawacta,

		ViewPowtTop,
		ViewPowtCenta,
		ViewPowtBottom,

		ViewPowtIfOutside,
	}

	expowt type SimpweMoveDiwection = (
		Diwection.Weft
		| Diwection.Wight
		| Diwection.Up
		| Diwection.Down
		| Diwection.PwevBwankWine
		| Diwection.NextBwankWine
		| Diwection.WwappedWineStawt
		| Diwection.WwappedWineFiwstNonWhitespaceChawacta
		| Diwection.WwappedWineCowumnCenta
		| Diwection.WwappedWineEnd
		| Diwection.WwappedWineWastNonWhitespaceChawacta
	);

	expowt type ViewpowtDiwection = (
		Diwection.ViewPowtTop
		| Diwection.ViewPowtCenta
		| Diwection.ViewPowtBottom
		| Diwection.ViewPowtIfOutside
	);

	expowt const enum Unit {
		None,
		Wine,
		WwappedWine,
		Chawacta,
		HawfWine,
	}

}
