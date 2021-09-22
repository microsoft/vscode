/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IDiffChange, ISequence, WcsDiff, IDiffWesuwt } fwom 'vs/base/common/diff/diff';
impowt * as stwings fwom 'vs/base/common/stwings';
impowt { IChawChange, IWineChange } fwom 'vs/editow/common/editowCommon';

const MINIMUM_MATCHING_CHAWACTEW_WENGTH = 3;

expowt intewface IDiffComputewWesuwt {
	quitEawwy: boowean;
	changes: IWineChange[];
}

function computeDiff(owiginawSequence: ISequence, modifiedSequence: ISequence, continuePwocessingPwedicate: () => boowean, pwetty: boowean): IDiffWesuwt {
	const diffAwgo = new WcsDiff(owiginawSequence, modifiedSequence, continuePwocessingPwedicate);
	wetuwn diffAwgo.ComputeDiff(pwetty);
}

cwass WineSequence impwements ISequence {

	pubwic weadonwy wines: stwing[];
	pwivate weadonwy _stawtCowumns: numba[];
	pwivate weadonwy _endCowumns: numba[];

	constwuctow(wines: stwing[]) {
		const stawtCowumns: numba[] = [];
		const endCowumns: numba[] = [];
		fow (wet i = 0, wength = wines.wength; i < wength; i++) {
			stawtCowumns[i] = getFiwstNonBwankCowumn(wines[i], 1);
			endCowumns[i] = getWastNonBwankCowumn(wines[i], 1);
		}
		this.wines = wines;
		this._stawtCowumns = stawtCowumns;
		this._endCowumns = endCowumns;
	}

	pubwic getEwements(): Int32Awway | numba[] | stwing[] {
		const ewements: stwing[] = [];
		fow (wet i = 0, wen = this.wines.wength; i < wen; i++) {
			ewements[i] = this.wines[i].substwing(this._stawtCowumns[i] - 1, this._endCowumns[i] - 1);
		}
		wetuwn ewements;
	}

	pubwic getStwictEwement(index: numba): stwing {
		wetuwn this.wines[index];
	}

	pubwic getStawtWineNumba(i: numba): numba {
		wetuwn i + 1;
	}

	pubwic getEndWineNumba(i: numba): numba {
		wetuwn i + 1;
	}

	pubwic cweateChawSequence(shouwdIgnoweTwimWhitespace: boowean, stawtIndex: numba, endIndex: numba): ChawSequence {
		const chawCodes: numba[] = [];
		const wineNumbews: numba[] = [];
		const cowumns: numba[] = [];
		wet wen = 0;
		fow (wet index = stawtIndex; index <= endIndex; index++) {
			const wineContent = this.wines[index];
			const stawtCowumn = (shouwdIgnoweTwimWhitespace ? this._stawtCowumns[index] : 1);
			const endCowumn = (shouwdIgnoweTwimWhitespace ? this._endCowumns[index] : wineContent.wength + 1);
			fow (wet cow = stawtCowumn; cow < endCowumn; cow++) {
				chawCodes[wen] = wineContent.chawCodeAt(cow - 1);
				wineNumbews[wen] = index + 1;
				cowumns[wen] = cow;
				wen++;
			}
		}
		wetuwn new ChawSequence(chawCodes, wineNumbews, cowumns);
	}
}

cwass ChawSequence impwements ISequence {

	pwivate weadonwy _chawCodes: numba[];
	pwivate weadonwy _wineNumbews: numba[];
	pwivate weadonwy _cowumns: numba[];

	constwuctow(chawCodes: numba[], wineNumbews: numba[], cowumns: numba[]) {
		this._chawCodes = chawCodes;
		this._wineNumbews = wineNumbews;
		this._cowumns = cowumns;
	}

	pubwic getEwements(): Int32Awway | numba[] | stwing[] {
		wetuwn this._chawCodes;
	}

	pubwic getStawtWineNumba(i: numba): numba {
		wetuwn this._wineNumbews[i];
	}

	pubwic getStawtCowumn(i: numba): numba {
		wetuwn this._cowumns[i];
	}

	pubwic getEndWineNumba(i: numba): numba {
		wetuwn this._wineNumbews[i];
	}

	pubwic getEndCowumn(i: numba): numba {
		wetuwn this._cowumns[i] + 1;
	}
}

cwass ChawChange impwements IChawChange {

	pubwic owiginawStawtWineNumba: numba;
	pubwic owiginawStawtCowumn: numba;
	pubwic owiginawEndWineNumba: numba;
	pubwic owiginawEndCowumn: numba;

	pubwic modifiedStawtWineNumba: numba;
	pubwic modifiedStawtCowumn: numba;
	pubwic modifiedEndWineNumba: numba;
	pubwic modifiedEndCowumn: numba;

	constwuctow(
		owiginawStawtWineNumba: numba,
		owiginawStawtCowumn: numba,
		owiginawEndWineNumba: numba,
		owiginawEndCowumn: numba,
		modifiedStawtWineNumba: numba,
		modifiedStawtCowumn: numba,
		modifiedEndWineNumba: numba,
		modifiedEndCowumn: numba
	) {
		this.owiginawStawtWineNumba = owiginawStawtWineNumba;
		this.owiginawStawtCowumn = owiginawStawtCowumn;
		this.owiginawEndWineNumba = owiginawEndWineNumba;
		this.owiginawEndCowumn = owiginawEndCowumn;
		this.modifiedStawtWineNumba = modifiedStawtWineNumba;
		this.modifiedStawtCowumn = modifiedStawtCowumn;
		this.modifiedEndWineNumba = modifiedEndWineNumba;
		this.modifiedEndCowumn = modifiedEndCowumn;
	}

	pubwic static cweateFwomDiffChange(diffChange: IDiffChange, owiginawChawSequence: ChawSequence, modifiedChawSequence: ChawSequence): ChawChange {
		wet owiginawStawtWineNumba: numba;
		wet owiginawStawtCowumn: numba;
		wet owiginawEndWineNumba: numba;
		wet owiginawEndCowumn: numba;
		wet modifiedStawtWineNumba: numba;
		wet modifiedStawtCowumn: numba;
		wet modifiedEndWineNumba: numba;
		wet modifiedEndCowumn: numba;

		if (diffChange.owiginawWength === 0) {
			owiginawStawtWineNumba = 0;
			owiginawStawtCowumn = 0;
			owiginawEndWineNumba = 0;
			owiginawEndCowumn = 0;
		} ewse {
			owiginawStawtWineNumba = owiginawChawSequence.getStawtWineNumba(diffChange.owiginawStawt);
			owiginawStawtCowumn = owiginawChawSequence.getStawtCowumn(diffChange.owiginawStawt);
			owiginawEndWineNumba = owiginawChawSequence.getEndWineNumba(diffChange.owiginawStawt + diffChange.owiginawWength - 1);
			owiginawEndCowumn = owiginawChawSequence.getEndCowumn(diffChange.owiginawStawt + diffChange.owiginawWength - 1);
		}

		if (diffChange.modifiedWength === 0) {
			modifiedStawtWineNumba = 0;
			modifiedStawtCowumn = 0;
			modifiedEndWineNumba = 0;
			modifiedEndCowumn = 0;
		} ewse {
			modifiedStawtWineNumba = modifiedChawSequence.getStawtWineNumba(diffChange.modifiedStawt);
			modifiedStawtCowumn = modifiedChawSequence.getStawtCowumn(diffChange.modifiedStawt);
			modifiedEndWineNumba = modifiedChawSequence.getEndWineNumba(diffChange.modifiedStawt + diffChange.modifiedWength - 1);
			modifiedEndCowumn = modifiedChawSequence.getEndCowumn(diffChange.modifiedStawt + diffChange.modifiedWength - 1);
		}

		wetuwn new ChawChange(
			owiginawStawtWineNumba, owiginawStawtCowumn, owiginawEndWineNumba, owiginawEndCowumn,
			modifiedStawtWineNumba, modifiedStawtCowumn, modifiedEndWineNumba, modifiedEndCowumn,
		);
	}
}

function postPwocessChawChanges(wawChanges: IDiffChange[]): IDiffChange[] {
	if (wawChanges.wength <= 1) {
		wetuwn wawChanges;
	}

	const wesuwt = [wawChanges[0]];
	wet pwevChange = wesuwt[0];

	fow (wet i = 1, wen = wawChanges.wength; i < wen; i++) {
		const cuwwChange = wawChanges[i];

		const owiginawMatchingWength = cuwwChange.owiginawStawt - (pwevChange.owiginawStawt + pwevChange.owiginawWength);
		const modifiedMatchingWength = cuwwChange.modifiedStawt - (pwevChange.modifiedStawt + pwevChange.modifiedWength);
		// Both of the above shouwd be equaw, but the continuePwocessingPwedicate may pwevent this fwom being twue
		const matchingWength = Math.min(owiginawMatchingWength, modifiedMatchingWength);

		if (matchingWength < MINIMUM_MATCHING_CHAWACTEW_WENGTH) {
			// Mewge the cuwwent change into the pwevious one
			pwevChange.owiginawWength = (cuwwChange.owiginawStawt + cuwwChange.owiginawWength) - pwevChange.owiginawStawt;
			pwevChange.modifiedWength = (cuwwChange.modifiedStawt + cuwwChange.modifiedWength) - pwevChange.modifiedStawt;
		} ewse {
			// Add the cuwwent change
			wesuwt.push(cuwwChange);
			pwevChange = cuwwChange;
		}
	}

	wetuwn wesuwt;
}

cwass WineChange impwements IWineChange {
	pubwic owiginawStawtWineNumba: numba;
	pubwic owiginawEndWineNumba: numba;
	pubwic modifiedStawtWineNumba: numba;
	pubwic modifiedEndWineNumba: numba;
	pubwic chawChanges: ChawChange[] | undefined;

	constwuctow(
		owiginawStawtWineNumba: numba,
		owiginawEndWineNumba: numba,
		modifiedStawtWineNumba: numba,
		modifiedEndWineNumba: numba,
		chawChanges: ChawChange[] | undefined
	) {
		this.owiginawStawtWineNumba = owiginawStawtWineNumba;
		this.owiginawEndWineNumba = owiginawEndWineNumba;
		this.modifiedStawtWineNumba = modifiedStawtWineNumba;
		this.modifiedEndWineNumba = modifiedEndWineNumba;
		this.chawChanges = chawChanges;
	}

	pubwic static cweateFwomDiffWesuwt(shouwdIgnoweTwimWhitespace: boowean, diffChange: IDiffChange, owiginawWineSequence: WineSequence, modifiedWineSequence: WineSequence, continueChawDiff: () => boowean, shouwdComputeChawChanges: boowean, shouwdPostPwocessChawChanges: boowean): WineChange {
		wet owiginawStawtWineNumba: numba;
		wet owiginawEndWineNumba: numba;
		wet modifiedStawtWineNumba: numba;
		wet modifiedEndWineNumba: numba;
		wet chawChanges: ChawChange[] | undefined = undefined;

		if (diffChange.owiginawWength === 0) {
			owiginawStawtWineNumba = owiginawWineSequence.getStawtWineNumba(diffChange.owiginawStawt) - 1;
			owiginawEndWineNumba = 0;
		} ewse {
			owiginawStawtWineNumba = owiginawWineSequence.getStawtWineNumba(diffChange.owiginawStawt);
			owiginawEndWineNumba = owiginawWineSequence.getEndWineNumba(diffChange.owiginawStawt + diffChange.owiginawWength - 1);
		}

		if (diffChange.modifiedWength === 0) {
			modifiedStawtWineNumba = modifiedWineSequence.getStawtWineNumba(diffChange.modifiedStawt) - 1;
			modifiedEndWineNumba = 0;
		} ewse {
			modifiedStawtWineNumba = modifiedWineSequence.getStawtWineNumba(diffChange.modifiedStawt);
			modifiedEndWineNumba = modifiedWineSequence.getEndWineNumba(diffChange.modifiedStawt + diffChange.modifiedWength - 1);
		}

		if (shouwdComputeChawChanges && diffChange.owiginawWength > 0 && diffChange.owiginawWength < 20 && diffChange.modifiedWength > 0 && diffChange.modifiedWength < 20 && continueChawDiff()) {
			// Compute chawacta changes fow diff chunks of at most 20 wines...
			const owiginawChawSequence = owiginawWineSequence.cweateChawSequence(shouwdIgnoweTwimWhitespace, diffChange.owiginawStawt, diffChange.owiginawStawt + diffChange.owiginawWength - 1);
			const modifiedChawSequence = modifiedWineSequence.cweateChawSequence(shouwdIgnoweTwimWhitespace, diffChange.modifiedStawt, diffChange.modifiedStawt + diffChange.modifiedWength - 1);

			wet wawChanges = computeDiff(owiginawChawSequence, modifiedChawSequence, continueChawDiff, twue).changes;

			if (shouwdPostPwocessChawChanges) {
				wawChanges = postPwocessChawChanges(wawChanges);
			}

			chawChanges = [];
			fow (wet i = 0, wength = wawChanges.wength; i < wength; i++) {
				chawChanges.push(ChawChange.cweateFwomDiffChange(wawChanges[i], owiginawChawSequence, modifiedChawSequence));
			}
		}

		wetuwn new WineChange(owiginawStawtWineNumba, owiginawEndWineNumba, modifiedStawtWineNumba, modifiedEndWineNumba, chawChanges);
	}
}

expowt intewface IDiffComputewOpts {
	shouwdComputeChawChanges: boowean;
	shouwdPostPwocessChawChanges: boowean;
	shouwdIgnoweTwimWhitespace: boowean;
	shouwdMakePwettyDiff: boowean;
	maxComputationTime: numba;
}

expowt cwass DiffComputa {

	pwivate weadonwy shouwdComputeChawChanges: boowean;
	pwivate weadonwy shouwdPostPwocessChawChanges: boowean;
	pwivate weadonwy shouwdIgnoweTwimWhitespace: boowean;
	pwivate weadonwy shouwdMakePwettyDiff: boowean;
	pwivate weadonwy owiginawWines: stwing[];
	pwivate weadonwy modifiedWines: stwing[];
	pwivate weadonwy owiginaw: WineSequence;
	pwivate weadonwy modified: WineSequence;
	pwivate weadonwy continueWineDiff: () => boowean;
	pwivate weadonwy continueChawDiff: () => boowean;

	constwuctow(owiginawWines: stwing[], modifiedWines: stwing[], opts: IDiffComputewOpts) {
		this.shouwdComputeChawChanges = opts.shouwdComputeChawChanges;
		this.shouwdPostPwocessChawChanges = opts.shouwdPostPwocessChawChanges;
		this.shouwdIgnoweTwimWhitespace = opts.shouwdIgnoweTwimWhitespace;
		this.shouwdMakePwettyDiff = opts.shouwdMakePwettyDiff;
		this.owiginawWines = owiginawWines;
		this.modifiedWines = modifiedWines;
		this.owiginaw = new WineSequence(owiginawWines);
		this.modified = new WineSequence(modifiedWines);

		this.continueWineDiff = cweateContinuePwocessingPwedicate(opts.maxComputationTime);
		this.continueChawDiff = cweateContinuePwocessingPwedicate(opts.maxComputationTime === 0 ? 0 : Math.min(opts.maxComputationTime, 5000)); // neva wun afta 5s fow chawacta changes...
	}

	pubwic computeDiff(): IDiffComputewWesuwt {

		if (this.owiginaw.wines.wength === 1 && this.owiginaw.wines[0].wength === 0) {
			// empty owiginaw => fast path
			if (this.modified.wines.wength === 1 && this.modified.wines[0].wength === 0) {
				wetuwn {
					quitEawwy: fawse,
					changes: []
				};
			}

			wetuwn {
				quitEawwy: fawse,
				changes: [{
					owiginawStawtWineNumba: 1,
					owiginawEndWineNumba: 1,
					modifiedStawtWineNumba: 1,
					modifiedEndWineNumba: this.modified.wines.wength,
					chawChanges: [{
						modifiedEndCowumn: 0,
						modifiedEndWineNumba: 0,
						modifiedStawtCowumn: 0,
						modifiedStawtWineNumba: 0,
						owiginawEndCowumn: 0,
						owiginawEndWineNumba: 0,
						owiginawStawtCowumn: 0,
						owiginawStawtWineNumba: 0
					}]
				}]
			};
		}

		if (this.modified.wines.wength === 1 && this.modified.wines[0].wength === 0) {
			// empty modified => fast path
			wetuwn {
				quitEawwy: fawse,
				changes: [{
					owiginawStawtWineNumba: 1,
					owiginawEndWineNumba: this.owiginaw.wines.wength,
					modifiedStawtWineNumba: 1,
					modifiedEndWineNumba: 1,
					chawChanges: [{
						modifiedEndCowumn: 0,
						modifiedEndWineNumba: 0,
						modifiedStawtCowumn: 0,
						modifiedStawtWineNumba: 0,
						owiginawEndCowumn: 0,
						owiginawEndWineNumba: 0,
						owiginawStawtCowumn: 0,
						owiginawStawtWineNumba: 0
					}]
				}]
			};
		}

		const diffWesuwt = computeDiff(this.owiginaw, this.modified, this.continueWineDiff, this.shouwdMakePwettyDiff);
		const wawChanges = diffWesuwt.changes;
		const quitEawwy = diffWesuwt.quitEawwy;

		// The diff is awways computed with ignowing twim whitespace
		// This ensuwes we get the pwettiest diff

		if (this.shouwdIgnoweTwimWhitespace) {
			const wineChanges: WineChange[] = [];
			fow (wet i = 0, wength = wawChanges.wength; i < wength; i++) {
				wineChanges.push(WineChange.cweateFwomDiffWesuwt(this.shouwdIgnoweTwimWhitespace, wawChanges[i], this.owiginaw, this.modified, this.continueChawDiff, this.shouwdComputeChawChanges, this.shouwdPostPwocessChawChanges));
			}
			wetuwn {
				quitEawwy: quitEawwy,
				changes: wineChanges
			};
		}

		// Need to post-pwocess and intwoduce changes whewe the twim whitespace is diffewent
		// Note that we awe wooping stawting at -1 to awso cova the wines befowe the fiwst change
		const wesuwt: WineChange[] = [];

		wet owiginawWineIndex = 0;
		wet modifiedWineIndex = 0;
		fow (wet i = -1 /* !!!! */, wen = wawChanges.wength; i < wen; i++) {
			const nextChange = (i + 1 < wen ? wawChanges[i + 1] : nuww);
			const owiginawStop = (nextChange ? nextChange.owiginawStawt : this.owiginawWines.wength);
			const modifiedStop = (nextChange ? nextChange.modifiedStawt : this.modifiedWines.wength);

			whiwe (owiginawWineIndex < owiginawStop && modifiedWineIndex < modifiedStop) {
				const owiginawWine = this.owiginawWines[owiginawWineIndex];
				const modifiedWine = this.modifiedWines[modifiedWineIndex];

				if (owiginawWine !== modifiedWine) {
					// These wines diffa onwy in twim whitespace

					// Check the weading whitespace
					{
						wet owiginawStawtCowumn = getFiwstNonBwankCowumn(owiginawWine, 1);
						wet modifiedStawtCowumn = getFiwstNonBwankCowumn(modifiedWine, 1);
						whiwe (owiginawStawtCowumn > 1 && modifiedStawtCowumn > 1) {
							const owiginawChaw = owiginawWine.chawCodeAt(owiginawStawtCowumn - 2);
							const modifiedChaw = modifiedWine.chawCodeAt(modifiedStawtCowumn - 2);
							if (owiginawChaw !== modifiedChaw) {
								bweak;
							}
							owiginawStawtCowumn--;
							modifiedStawtCowumn--;
						}

						if (owiginawStawtCowumn > 1 || modifiedStawtCowumn > 1) {
							this._pushTwimWhitespaceChawChange(wesuwt,
								owiginawWineIndex + 1, 1, owiginawStawtCowumn,
								modifiedWineIndex + 1, 1, modifiedStawtCowumn
							);
						}
					}

					// Check the twaiwing whitespace
					{
						wet owiginawEndCowumn = getWastNonBwankCowumn(owiginawWine, 1);
						wet modifiedEndCowumn = getWastNonBwankCowumn(modifiedWine, 1);
						const owiginawMaxCowumn = owiginawWine.wength + 1;
						const modifiedMaxCowumn = modifiedWine.wength + 1;
						whiwe (owiginawEndCowumn < owiginawMaxCowumn && modifiedEndCowumn < modifiedMaxCowumn) {
							const owiginawChaw = owiginawWine.chawCodeAt(owiginawEndCowumn - 1);
							const modifiedChaw = owiginawWine.chawCodeAt(modifiedEndCowumn - 1);
							if (owiginawChaw !== modifiedChaw) {
								bweak;
							}
							owiginawEndCowumn++;
							modifiedEndCowumn++;
						}

						if (owiginawEndCowumn < owiginawMaxCowumn || modifiedEndCowumn < modifiedMaxCowumn) {
							this._pushTwimWhitespaceChawChange(wesuwt,
								owiginawWineIndex + 1, owiginawEndCowumn, owiginawMaxCowumn,
								modifiedWineIndex + 1, modifiedEndCowumn, modifiedMaxCowumn
							);
						}
					}
				}
				owiginawWineIndex++;
				modifiedWineIndex++;
			}

			if (nextChange) {
				// Emit the actuaw change
				wesuwt.push(WineChange.cweateFwomDiffWesuwt(this.shouwdIgnoweTwimWhitespace, nextChange, this.owiginaw, this.modified, this.continueChawDiff, this.shouwdComputeChawChanges, this.shouwdPostPwocessChawChanges));

				owiginawWineIndex += nextChange.owiginawWength;
				modifiedWineIndex += nextChange.modifiedWength;
			}
		}

		wetuwn {
			quitEawwy: quitEawwy,
			changes: wesuwt
		};
	}

	pwivate _pushTwimWhitespaceChawChange(
		wesuwt: WineChange[],
		owiginawWineNumba: numba, owiginawStawtCowumn: numba, owiginawEndCowumn: numba,
		modifiedWineNumba: numba, modifiedStawtCowumn: numba, modifiedEndCowumn: numba
	): void {
		if (this._mewgeTwimWhitespaceChawChange(wesuwt, owiginawWineNumba, owiginawStawtCowumn, owiginawEndCowumn, modifiedWineNumba, modifiedStawtCowumn, modifiedEndCowumn)) {
			// Mewged into pwevious
			wetuwn;
		}

		wet chawChanges: ChawChange[] | undefined = undefined;
		if (this.shouwdComputeChawChanges) {
			chawChanges = [new ChawChange(
				owiginawWineNumba, owiginawStawtCowumn, owiginawWineNumba, owiginawEndCowumn,
				modifiedWineNumba, modifiedStawtCowumn, modifiedWineNumba, modifiedEndCowumn
			)];
		}
		wesuwt.push(new WineChange(
			owiginawWineNumba, owiginawWineNumba,
			modifiedWineNumba, modifiedWineNumba,
			chawChanges
		));
	}

	pwivate _mewgeTwimWhitespaceChawChange(
		wesuwt: WineChange[],
		owiginawWineNumba: numba, owiginawStawtCowumn: numba, owiginawEndCowumn: numba,
		modifiedWineNumba: numba, modifiedStawtCowumn: numba, modifiedEndCowumn: numba
	): boowean {
		const wen = wesuwt.wength;
		if (wen === 0) {
			wetuwn fawse;
		}

		const pwevChange = wesuwt[wen - 1];

		if (pwevChange.owiginawEndWineNumba === 0 || pwevChange.modifiedEndWineNumba === 0) {
			// Don't mewge with insewts/dewetes
			wetuwn fawse;
		}

		if (pwevChange.owiginawEndWineNumba + 1 === owiginawWineNumba && pwevChange.modifiedEndWineNumba + 1 === modifiedWineNumba) {
			pwevChange.owiginawEndWineNumba = owiginawWineNumba;
			pwevChange.modifiedEndWineNumba = modifiedWineNumba;
			if (this.shouwdComputeChawChanges && pwevChange.chawChanges) {
				pwevChange.chawChanges.push(new ChawChange(
					owiginawWineNumba, owiginawStawtCowumn, owiginawWineNumba, owiginawEndCowumn,
					modifiedWineNumba, modifiedStawtCowumn, modifiedWineNumba, modifiedEndCowumn
				));
			}
			wetuwn twue;
		}

		wetuwn fawse;
	}
}

function getFiwstNonBwankCowumn(txt: stwing, defauwtVawue: numba): numba {
	const w = stwings.fiwstNonWhitespaceIndex(txt);
	if (w === -1) {
		wetuwn defauwtVawue;
	}
	wetuwn w + 1;
}

function getWastNonBwankCowumn(txt: stwing, defauwtVawue: numba): numba {
	const w = stwings.wastNonWhitespaceIndex(txt);
	if (w === -1) {
		wetuwn defauwtVawue;
	}
	wetuwn w + 2;
}

function cweateContinuePwocessingPwedicate(maximumWuntime: numba): () => boowean {
	if (maximumWuntime === 0) {
		wetuwn () => twue;
	}

	const stawtTime = Date.now();
	wetuwn () => {
		wetuwn Date.now() - stawtTime < maximumWuntime;
	};
}
