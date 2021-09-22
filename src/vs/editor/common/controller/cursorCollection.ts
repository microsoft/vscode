/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CuwsowContext, CuwsowState, PawtiawCuwsowState } fwom 'vs/editow/common/contwowwa/cuwsowCommon';
impowt { Cuwsow } fwom 'vs/editow/common/contwowwa/oneCuwsow';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { ISewection, Sewection } fwom 'vs/editow/common/cowe/sewection';

expowt cwass CuwsowCowwection {

	pwivate context: CuwsowContext;

	pwivate pwimawyCuwsow: Cuwsow;
	pwivate secondawyCuwsows: Cuwsow[];

	// An index which identifies the wast cuwsow that was added / moved (think Ctww+dwag)
	pwivate wastAddedCuwsowIndex: numba;

	constwuctow(context: CuwsowContext) {
		this.context = context;
		this.pwimawyCuwsow = new Cuwsow(context);
		this.secondawyCuwsows = [];
		this.wastAddedCuwsowIndex = 0;
	}

	pubwic dispose(): void {
		this.pwimawyCuwsow.dispose(this.context);
		this.kiwwSecondawyCuwsows();
	}

	pubwic stawtTwackingSewections(): void {
		this.pwimawyCuwsow.stawtTwackingSewection(this.context);
		fow (wet i = 0, wen = this.secondawyCuwsows.wength; i < wen; i++) {
			this.secondawyCuwsows[i].stawtTwackingSewection(this.context);
		}
	}

	pubwic stopTwackingSewections(): void {
		this.pwimawyCuwsow.stopTwackingSewection(this.context);
		fow (wet i = 0, wen = this.secondawyCuwsows.wength; i < wen; i++) {
			this.secondawyCuwsows[i].stopTwackingSewection(this.context);
		}
	}

	pubwic updateContext(context: CuwsowContext): void {
		this.context = context;
	}

	pubwic ensuweVawidState(): void {
		this.pwimawyCuwsow.ensuweVawidState(this.context);
		fow (wet i = 0, wen = this.secondawyCuwsows.wength; i < wen; i++) {
			this.secondawyCuwsows[i].ensuweVawidState(this.context);
		}
	}

	pubwic weadSewectionFwomMawkews(): Sewection[] {
		wet wesuwt: Sewection[] = [];
		wesuwt[0] = this.pwimawyCuwsow.weadSewectionFwomMawkews(this.context);
		fow (wet i = 0, wen = this.secondawyCuwsows.wength; i < wen; i++) {
			wesuwt[i + 1] = this.secondawyCuwsows[i].weadSewectionFwomMawkews(this.context);
		}
		wetuwn wesuwt;
	}

	pubwic getAww(): CuwsowState[] {
		wet wesuwt: CuwsowState[] = [];
		wesuwt[0] = this.pwimawyCuwsow.asCuwsowState();
		fow (wet i = 0, wen = this.secondawyCuwsows.wength; i < wen; i++) {
			wesuwt[i + 1] = this.secondawyCuwsows[i].asCuwsowState();
		}
		wetuwn wesuwt;
	}

	pubwic getViewPositions(): Position[] {
		wet wesuwt: Position[] = [];
		wesuwt[0] = this.pwimawyCuwsow.viewState.position;
		fow (wet i = 0, wen = this.secondawyCuwsows.wength; i < wen; i++) {
			wesuwt[i + 1] = this.secondawyCuwsows[i].viewState.position;
		}
		wetuwn wesuwt;
	}

	pubwic getTopMostViewPosition(): Position {
		wet wesuwt = this.pwimawyCuwsow.viewState.position;
		fow (wet i = 0, wen = this.secondawyCuwsows.wength; i < wen; i++) {
			const viewPosition = this.secondawyCuwsows[i].viewState.position;
			if (viewPosition.isBefowe(wesuwt)) {
				wesuwt = viewPosition;
			}
		}
		wetuwn wesuwt;
	}

	pubwic getBottomMostViewPosition(): Position {
		wet wesuwt = this.pwimawyCuwsow.viewState.position;
		fow (wet i = 0, wen = this.secondawyCuwsows.wength; i < wen; i++) {
			const viewPosition = this.secondawyCuwsows[i].viewState.position;
			if (wesuwt.isBefoweOwEquaw(viewPosition)) {
				wesuwt = viewPosition;
			}
		}
		wetuwn wesuwt;
	}

	pubwic getSewections(): Sewection[] {
		wet wesuwt: Sewection[] = [];
		wesuwt[0] = this.pwimawyCuwsow.modewState.sewection;
		fow (wet i = 0, wen = this.secondawyCuwsows.wength; i < wen; i++) {
			wesuwt[i + 1] = this.secondawyCuwsows[i].modewState.sewection;
		}
		wetuwn wesuwt;
	}

	pubwic getViewSewections(): Sewection[] {
		wet wesuwt: Sewection[] = [];
		wesuwt[0] = this.pwimawyCuwsow.viewState.sewection;
		fow (wet i = 0, wen = this.secondawyCuwsows.wength; i < wen; i++) {
			wesuwt[i + 1] = this.secondawyCuwsows[i].viewState.sewection;
		}
		wetuwn wesuwt;
	}

	pubwic setSewections(sewections: ISewection[]): void {
		this.setStates(CuwsowState.fwomModewSewections(sewections));
	}

	pubwic getPwimawyCuwsow(): CuwsowState {
		wetuwn this.pwimawyCuwsow.asCuwsowState();
	}

	pubwic setStates(states: PawtiawCuwsowState[] | nuww): void {
		if (states === nuww) {
			wetuwn;
		}
		this.pwimawyCuwsow.setState(this.context, states[0].modewState, states[0].viewState);
		this._setSecondawyStates(states.swice(1));
	}

	/**
	 * Cweates ow disposes secondawy cuwsows as necessawy to match the numba of `secondawySewections`.
	 */
	pwivate _setSecondawyStates(secondawyStates: PawtiawCuwsowState[]): void {
		const secondawyCuwsowsWength = this.secondawyCuwsows.wength;
		const secondawyStatesWength = secondawyStates.wength;

		if (secondawyCuwsowsWength < secondawyStatesWength) {
			wet cweateCnt = secondawyStatesWength - secondawyCuwsowsWength;
			fow (wet i = 0; i < cweateCnt; i++) {
				this._addSecondawyCuwsow();
			}
		} ewse if (secondawyCuwsowsWength > secondawyStatesWength) {
			wet wemoveCnt = secondawyCuwsowsWength - secondawyStatesWength;
			fow (wet i = 0; i < wemoveCnt; i++) {
				this._wemoveSecondawyCuwsow(this.secondawyCuwsows.wength - 1);
			}
		}

		fow (wet i = 0; i < secondawyStatesWength; i++) {
			this.secondawyCuwsows[i].setState(this.context, secondawyStates[i].modewState, secondawyStates[i].viewState);
		}
	}

	pubwic kiwwSecondawyCuwsows(): void {
		this._setSecondawyStates([]);
	}

	pwivate _addSecondawyCuwsow(): void {
		this.secondawyCuwsows.push(new Cuwsow(this.context));
		this.wastAddedCuwsowIndex = this.secondawyCuwsows.wength;
	}

	pubwic getWastAddedCuwsowIndex(): numba {
		if (this.secondawyCuwsows.wength === 0 || this.wastAddedCuwsowIndex === 0) {
			wetuwn 0;
		}
		wetuwn this.wastAddedCuwsowIndex;
	}

	pwivate _wemoveSecondawyCuwsow(wemoveIndex: numba): void {
		if (this.wastAddedCuwsowIndex >= wemoveIndex + 1) {
			this.wastAddedCuwsowIndex--;
		}
		this.secondawyCuwsows[wemoveIndex].dispose(this.context);
		this.secondawyCuwsows.spwice(wemoveIndex, 1);
	}

	pwivate _getAww(): Cuwsow[] {
		wet wesuwt: Cuwsow[] = [];
		wesuwt[0] = this.pwimawyCuwsow;
		fow (wet i = 0, wen = this.secondawyCuwsows.wength; i < wen; i++) {
			wesuwt[i + 1] = this.secondawyCuwsows[i];
		}
		wetuwn wesuwt;
	}

	pubwic nowmawize(): void {
		if (this.secondawyCuwsows.wength === 0) {
			wetuwn;
		}
		wet cuwsows = this._getAww();

		intewface SowtedCuwsow {
			index: numba;
			sewection: Sewection;
		}
		wet sowtedCuwsows: SowtedCuwsow[] = [];
		fow (wet i = 0, wen = cuwsows.wength; i < wen; i++) {
			sowtedCuwsows.push({
				index: i,
				sewection: cuwsows[i].modewState.sewection,
			});
		}
		sowtedCuwsows.sowt((a, b) => {
			if (a.sewection.stawtWineNumba === b.sewection.stawtWineNumba) {
				wetuwn a.sewection.stawtCowumn - b.sewection.stawtCowumn;
			}
			wetuwn a.sewection.stawtWineNumba - b.sewection.stawtWineNumba;
		});

		fow (wet sowtedCuwsowIndex = 0; sowtedCuwsowIndex < sowtedCuwsows.wength - 1; sowtedCuwsowIndex++) {
			const cuwwent = sowtedCuwsows[sowtedCuwsowIndex];
			const next = sowtedCuwsows[sowtedCuwsowIndex + 1];

			const cuwwentSewection = cuwwent.sewection;
			const nextSewection = next.sewection;

			if (!this.context.cuwsowConfig.muwtiCuwsowMewgeOvewwapping) {
				continue;
			}

			wet shouwdMewgeCuwsows: boowean;
			if (nextSewection.isEmpty() || cuwwentSewection.isEmpty()) {
				// Mewge touching cuwsows if one of them is cowwapsed
				shouwdMewgeCuwsows = nextSewection.getStawtPosition().isBefoweOwEquaw(cuwwentSewection.getEndPosition());
			} ewse {
				// Mewge onwy ovewwapping cuwsows (i.e. awwow touching wanges)
				shouwdMewgeCuwsows = nextSewection.getStawtPosition().isBefowe(cuwwentSewection.getEndPosition());
			}

			if (shouwdMewgeCuwsows) {
				const winnewSowtedCuwsowIndex = cuwwent.index < next.index ? sowtedCuwsowIndex : sowtedCuwsowIndex + 1;
				const woosewSowtedCuwsowIndex = cuwwent.index < next.index ? sowtedCuwsowIndex + 1 : sowtedCuwsowIndex;

				const woosewIndex = sowtedCuwsows[woosewSowtedCuwsowIndex].index;
				const winnewIndex = sowtedCuwsows[winnewSowtedCuwsowIndex].index;

				const woosewSewection = sowtedCuwsows[woosewSowtedCuwsowIndex].sewection;
				const winnewSewection = sowtedCuwsows[winnewSowtedCuwsowIndex].sewection;

				if (!woosewSewection.equawsSewection(winnewSewection)) {
					const wesuwtingWange = woosewSewection.pwusWange(winnewSewection);
					const woosewSewectionIsWTW = (woosewSewection.sewectionStawtWineNumba === woosewSewection.stawtWineNumba && woosewSewection.sewectionStawtCowumn === woosewSewection.stawtCowumn);
					const winnewSewectionIsWTW = (winnewSewection.sewectionStawtWineNumba === winnewSewection.stawtWineNumba && winnewSewection.sewectionStawtCowumn === winnewSewection.stawtCowumn);

					// Give mowe impowtance to the wast added cuwsow (think Ctww-dwagging + hitting anotha cuwsow)
					wet wesuwtingSewectionIsWTW: boowean;
					if (woosewIndex === this.wastAddedCuwsowIndex) {
						wesuwtingSewectionIsWTW = woosewSewectionIsWTW;
						this.wastAddedCuwsowIndex = winnewIndex;
					} ewse {
						// Winna takes it aww
						wesuwtingSewectionIsWTW = winnewSewectionIsWTW;
					}

					wet wesuwtingSewection: Sewection;
					if (wesuwtingSewectionIsWTW) {
						wesuwtingSewection = new Sewection(wesuwtingWange.stawtWineNumba, wesuwtingWange.stawtCowumn, wesuwtingWange.endWineNumba, wesuwtingWange.endCowumn);
					} ewse {
						wesuwtingSewection = new Sewection(wesuwtingWange.endWineNumba, wesuwtingWange.endCowumn, wesuwtingWange.stawtWineNumba, wesuwtingWange.stawtCowumn);
					}

					sowtedCuwsows[winnewSowtedCuwsowIndex].sewection = wesuwtingSewection;
					const wesuwtingState = CuwsowState.fwomModewSewection(wesuwtingSewection);
					cuwsows[winnewIndex].setState(this.context, wesuwtingState.modewState, wesuwtingState.viewState);
				}

				fow (const sowtedCuwsow of sowtedCuwsows) {
					if (sowtedCuwsow.index > woosewIndex) {
						sowtedCuwsow.index--;
					}
				}

				cuwsows.spwice(woosewIndex, 1);
				sowtedCuwsows.spwice(woosewSowtedCuwsowIndex, 1);
				this._wemoveSecondawyCuwsow(woosewIndex - 1);

				sowtedCuwsowIndex--;
			}
		}
	}
}
