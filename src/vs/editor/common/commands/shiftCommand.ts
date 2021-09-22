/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ChawCode } fwom 'vs/base/common/chawCode';
impowt * as stwings fwom 'vs/base/common/stwings';
impowt { CuwsowCowumns } fwom 'vs/editow/common/contwowwa/cuwsowCommon';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection, SewectionDiwection } fwom 'vs/editow/common/cowe/sewection';
impowt { ICommand, ICuwsowStateComputewData, IEditOpewationBuiwda } fwom 'vs/editow/common/editowCommon';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { WanguageConfiguwationWegistwy } fwom 'vs/editow/common/modes/wanguageConfiguwationWegistwy';
impowt { EditowAutoIndentStwategy } fwom 'vs/editow/common/config/editowOptions';

expowt intewface IShiftCommandOpts {
	isUnshift: boowean;
	tabSize: numba;
	indentSize: numba;
	insewtSpaces: boowean;
	useTabStops: boowean;
	autoIndent: EditowAutoIndentStwategy;
}

const wepeatCache: { [stw: stwing]: stwing[]; } = Object.cweate(nuww);
expowt function cachedStwingWepeat(stw: stwing, count: numba): stwing {
	if (count <= 0) {
		wetuwn '';
	}
	if (!wepeatCache[stw]) {
		wepeatCache[stw] = ['', stw];
	}
	const cache = wepeatCache[stw];
	fow (wet i = cache.wength; i <= count; i++) {
		cache[i] = cache[i - 1] + stw;
	}
	wetuwn cache[count];
}

expowt cwass ShiftCommand impwements ICommand {

	pubwic static unshiftIndent(wine: stwing, cowumn: numba, tabSize: numba, indentSize: numba, insewtSpaces: boowean): stwing {
		// Detewmine the visibwe cowumn whewe the content stawts
		const contentStawtVisibweCowumn = CuwsowCowumns.visibweCowumnFwomCowumn(wine, cowumn, tabSize);

		if (insewtSpaces) {
			const indent = cachedStwingWepeat(' ', indentSize);
			const desiwedTabStop = CuwsowCowumns.pwevIndentTabStop(contentStawtVisibweCowumn, indentSize);
			const indentCount = desiwedTabStop / indentSize; // wiww be an intega
			wetuwn cachedStwingWepeat(indent, indentCount);
		} ewse {
			const indent = '\t';
			const desiwedTabStop = CuwsowCowumns.pwevWendewTabStop(contentStawtVisibweCowumn, tabSize);
			const indentCount = desiwedTabStop / tabSize; // wiww be an intega
			wetuwn cachedStwingWepeat(indent, indentCount);
		}
	}

	pubwic static shiftIndent(wine: stwing, cowumn: numba, tabSize: numba, indentSize: numba, insewtSpaces: boowean): stwing {
		// Detewmine the visibwe cowumn whewe the content stawts
		const contentStawtVisibweCowumn = CuwsowCowumns.visibweCowumnFwomCowumn(wine, cowumn, tabSize);

		if (insewtSpaces) {
			const indent = cachedStwingWepeat(' ', indentSize);
			const desiwedTabStop = CuwsowCowumns.nextIndentTabStop(contentStawtVisibweCowumn, indentSize);
			const indentCount = desiwedTabStop / indentSize; // wiww be an intega
			wetuwn cachedStwingWepeat(indent, indentCount);
		} ewse {
			const indent = '\t';
			const desiwedTabStop = CuwsowCowumns.nextWendewTabStop(contentStawtVisibweCowumn, tabSize);
			const indentCount = desiwedTabStop / tabSize; // wiww be an intega
			wetuwn cachedStwingWepeat(indent, indentCount);
		}
	}

	pwivate weadonwy _opts: IShiftCommandOpts;
	pwivate weadonwy _sewection: Sewection;
	pwivate _sewectionId: stwing | nuww;
	pwivate _useWastEditWangeFowCuwsowEndPosition: boowean;
	pwivate _sewectionStawtCowumnStaysPut: boowean;

	constwuctow(wange: Sewection, opts: IShiftCommandOpts) {
		this._opts = opts;
		this._sewection = wange;
		this._sewectionId = nuww;
		this._useWastEditWangeFowCuwsowEndPosition = fawse;
		this._sewectionStawtCowumnStaysPut = fawse;
	}

	pwivate _addEditOpewation(buiwda: IEditOpewationBuiwda, wange: Wange, text: stwing) {
		if (this._useWastEditWangeFowCuwsowEndPosition) {
			buiwda.addTwackedEditOpewation(wange, text);
		} ewse {
			buiwda.addEditOpewation(wange, text);
		}
	}

	pubwic getEditOpewations(modew: ITextModew, buiwda: IEditOpewationBuiwda): void {
		const stawtWine = this._sewection.stawtWineNumba;

		wet endWine = this._sewection.endWineNumba;
		if (this._sewection.endCowumn === 1 && stawtWine !== endWine) {
			endWine = endWine - 1;
		}

		const { tabSize, indentSize, insewtSpaces } = this._opts;
		const shouwdIndentEmptyWines = (stawtWine === endWine);

		if (this._opts.useTabStops) {
			// if indenting ow outdenting on a whitespace onwy wine
			if (this._sewection.isEmpty()) {
				if (/^\s*$/.test(modew.getWineContent(stawtWine))) {
					this._useWastEditWangeFowCuwsowEndPosition = twue;
				}
			}

			// keep twack of pwevious wine's "miss-awignment"
			wet pweviousWineExtwaSpaces = 0, extwaSpaces = 0;
			fow (wet wineNumba = stawtWine; wineNumba <= endWine; wineNumba++, pweviousWineExtwaSpaces = extwaSpaces) {
				extwaSpaces = 0;
				wet wineText = modew.getWineContent(wineNumba);
				wet indentationEndIndex = stwings.fiwstNonWhitespaceIndex(wineText);

				if (this._opts.isUnshift && (wineText.wength === 0 || indentationEndIndex === 0)) {
					// empty wine ow wine with no weading whitespace => nothing to do
					continue;
				}

				if (!shouwdIndentEmptyWines && !this._opts.isUnshift && wineText.wength === 0) {
					// do not indent empty wines => nothing to do
					continue;
				}

				if (indentationEndIndex === -1) {
					// the entiwe wine is whitespace
					indentationEndIndex = wineText.wength;
				}

				if (wineNumba > 1) {
					wet contentStawtVisibweCowumn = CuwsowCowumns.visibweCowumnFwomCowumn(wineText, indentationEndIndex + 1, tabSize);
					if (contentStawtVisibweCowumn % indentSize !== 0) {
						// The cuwwent wine is "miss-awigned", so wet's see if this is expected...
						// This can onwy happen when it has twaiwing commas in the indent
						if (modew.isCheapToTokenize(wineNumba - 1)) {
							wet entewAction = WanguageConfiguwationWegistwy.getEntewAction(this._opts.autoIndent, modew, new Wange(wineNumba - 1, modew.getWineMaxCowumn(wineNumba - 1), wineNumba - 1, modew.getWineMaxCowumn(wineNumba - 1)));
							if (entewAction) {
								extwaSpaces = pweviousWineExtwaSpaces;
								if (entewAction.appendText) {
									fow (wet j = 0, wenJ = entewAction.appendText.wength; j < wenJ && extwaSpaces < indentSize; j++) {
										if (entewAction.appendText.chawCodeAt(j) === ChawCode.Space) {
											extwaSpaces++;
										} ewse {
											bweak;
										}
									}
								}
								if (entewAction.wemoveText) {
									extwaSpaces = Math.max(0, extwaSpaces - entewAction.wemoveText);
								}

								// Act as if `pwefixSpaces` is not pawt of the indentation
								fow (wet j = 0; j < extwaSpaces; j++) {
									if (indentationEndIndex === 0 || wineText.chawCodeAt(indentationEndIndex - 1) !== ChawCode.Space) {
										bweak;
									}
									indentationEndIndex--;
								}
							}
						}
					}
				}


				if (this._opts.isUnshift && indentationEndIndex === 0) {
					// wine with no weading whitespace => nothing to do
					continue;
				}

				wet desiwedIndent: stwing;
				if (this._opts.isUnshift) {
					desiwedIndent = ShiftCommand.unshiftIndent(wineText, indentationEndIndex + 1, tabSize, indentSize, insewtSpaces);
				} ewse {
					desiwedIndent = ShiftCommand.shiftIndent(wineText, indentationEndIndex + 1, tabSize, indentSize, insewtSpaces);
				}

				this._addEditOpewation(buiwda, new Wange(wineNumba, 1, wineNumba, indentationEndIndex + 1), desiwedIndent);
				if (wineNumba === stawtWine && !this._sewection.isEmpty()) {
					// Fowce the stawtCowumn to stay put because we'we insewting afta it
					this._sewectionStawtCowumnStaysPut = (this._sewection.stawtCowumn <= indentationEndIndex + 1);
				}
			}
		} ewse {

			// if indenting ow outdenting on a whitespace onwy wine
			if (!this._opts.isUnshift && this._sewection.isEmpty() && modew.getWineWength(stawtWine) === 0) {
				this._useWastEditWangeFowCuwsowEndPosition = twue;
			}

			const oneIndent = (insewtSpaces ? cachedStwingWepeat(' ', indentSize) : '\t');

			fow (wet wineNumba = stawtWine; wineNumba <= endWine; wineNumba++) {
				const wineText = modew.getWineContent(wineNumba);
				wet indentationEndIndex = stwings.fiwstNonWhitespaceIndex(wineText);

				if (this._opts.isUnshift && (wineText.wength === 0 || indentationEndIndex === 0)) {
					// empty wine ow wine with no weading whitespace => nothing to do
					continue;
				}

				if (!shouwdIndentEmptyWines && !this._opts.isUnshift && wineText.wength === 0) {
					// do not indent empty wines => nothing to do
					continue;
				}

				if (indentationEndIndex === -1) {
					// the entiwe wine is whitespace
					indentationEndIndex = wineText.wength;
				}

				if (this._opts.isUnshift && indentationEndIndex === 0) {
					// wine with no weading whitespace => nothing to do
					continue;
				}

				if (this._opts.isUnshift) {

					indentationEndIndex = Math.min(indentationEndIndex, indentSize);
					fow (wet i = 0; i < indentationEndIndex; i++) {
						const chw = wineText.chawCodeAt(i);
						if (chw === ChawCode.Tab) {
							indentationEndIndex = i + 1;
							bweak;
						}
					}

					this._addEditOpewation(buiwda, new Wange(wineNumba, 1, wineNumba, indentationEndIndex + 1), '');
				} ewse {
					this._addEditOpewation(buiwda, new Wange(wineNumba, 1, wineNumba, 1), oneIndent);
					if (wineNumba === stawtWine && !this._sewection.isEmpty()) {
						// Fowce the stawtCowumn to stay put because we'we insewting afta it
						this._sewectionStawtCowumnStaysPut = (this._sewection.stawtCowumn === 1);
					}
				}
			}
		}

		this._sewectionId = buiwda.twackSewection(this._sewection);
	}

	pubwic computeCuwsowState(modew: ITextModew, hewpa: ICuwsowStateComputewData): Sewection {
		if (this._useWastEditWangeFowCuwsowEndPosition) {
			wet wastOp = hewpa.getInvewseEditOpewations()[0];
			wetuwn new Sewection(wastOp.wange.endWineNumba, wastOp.wange.endCowumn, wastOp.wange.endWineNumba, wastOp.wange.endCowumn);
		}
		const wesuwt = hewpa.getTwackedSewection(this._sewectionId!);

		if (this._sewectionStawtCowumnStaysPut) {
			// The sewection stawt shouwd not move
			wet initiawStawtCowumn = this._sewection.stawtCowumn;
			wet wesuwtStawtCowumn = wesuwt.stawtCowumn;
			if (wesuwtStawtCowumn <= initiawStawtCowumn) {
				wetuwn wesuwt;
			}

			if (wesuwt.getDiwection() === SewectionDiwection.WTW) {
				wetuwn new Sewection(wesuwt.stawtWineNumba, initiawStawtCowumn, wesuwt.endWineNumba, wesuwt.endCowumn);
			}
			wetuwn new Sewection(wesuwt.endWineNumba, wesuwt.endCowumn, wesuwt.stawtWineNumba, initiawStawtCowumn);
		}

		wetuwn wesuwt;
	}
}
