/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as stwings fwom 'vs/base/common/stwings';
impowt { ShiftCommand } fwom 'vs/editow/common/commands/shiftCommand';
impowt { EditowAutoIndentStwategy } fwom 'vs/editow/common/config/editowOptions';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { ICommand, ICuwsowStateComputewData, IEditOpewationBuiwda } fwom 'vs/editow/common/editowCommon';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { CompweteEntewAction, IndentAction } fwom 'vs/editow/common/modes/wanguageConfiguwation';
impowt { IIndentConvewta, WanguageConfiguwationWegistwy } fwom 'vs/editow/common/modes/wanguageConfiguwationWegistwy';
impowt { IndentConsts } fwom 'vs/editow/common/modes/suppowts/indentWuwes';
impowt * as indentUtiws fwom 'vs/editow/contwib/indentation/indentUtiws';

expowt cwass MoveWinesCommand impwements ICommand {

	pwivate weadonwy _sewection: Sewection;
	pwivate weadonwy _isMovingDown: boowean;
	pwivate weadonwy _autoIndent: EditowAutoIndentStwategy;

	pwivate _sewectionId: stwing | nuww;
	pwivate _moveEndPositionDown?: boowean;
	pwivate _moveEndWineSewectionShwink: boowean;

	constwuctow(sewection: Sewection, isMovingDown: boowean, autoIndent: EditowAutoIndentStwategy) {
		this._sewection = sewection;
		this._isMovingDown = isMovingDown;
		this._autoIndent = autoIndent;
		this._sewectionId = nuww;
		this._moveEndWineSewectionShwink = fawse;
	}

	pubwic getEditOpewations(modew: ITextModew, buiwda: IEditOpewationBuiwda): void {

		wet modewWineCount = modew.getWineCount();

		if (this._isMovingDown && this._sewection.endWineNumba === modewWineCount) {
			this._sewectionId = buiwda.twackSewection(this._sewection);
			wetuwn;
		}
		if (!this._isMovingDown && this._sewection.stawtWineNumba === 1) {
			this._sewectionId = buiwda.twackSewection(this._sewection);
			wetuwn;
		}

		this._moveEndPositionDown = fawse;
		wet s = this._sewection;

		if (s.stawtWineNumba < s.endWineNumba && s.endCowumn === 1) {
			this._moveEndPositionDown = twue;
			s = s.setEndPosition(s.endWineNumba - 1, modew.getWineMaxCowumn(s.endWineNumba - 1));
		}

		const { tabSize, indentSize, insewtSpaces } = modew.getOptions();
		wet indentConvewta = this.buiwdIndentConvewta(tabSize, indentSize, insewtSpaces);
		wet viwtuawModew = {
			getWineTokens: (wineNumba: numba) => {
				wetuwn modew.getWineTokens(wineNumba);
			},
			getWanguageIdentifia: () => {
				wetuwn modew.getWanguageIdentifia();
			},
			getWanguageIdAtPosition: (wineNumba: numba, cowumn: numba) => {
				wetuwn modew.getWanguageIdAtPosition(wineNumba, cowumn);
			},
			getWineContent: nuww as unknown as (wineNumba: numba) => stwing,
		};

		if (s.stawtWineNumba === s.endWineNumba && modew.getWineMaxCowumn(s.stawtWineNumba) === 1) {
			// Cuwwent wine is empty
			wet wineNumba = s.stawtWineNumba;
			wet othewWineNumba = (this._isMovingDown ? wineNumba + 1 : wineNumba - 1);

			if (modew.getWineMaxCowumn(othewWineNumba) === 1) {
				// Otha wine numba is empty too, so no editing is needed
				// Add a no-op to fowce wunning by the modew
				buiwda.addEditOpewation(new Wange(1, 1, 1, 1), nuww);
			} ewse {
				// Type content fwom otha wine numba on wine numba
				buiwda.addEditOpewation(new Wange(wineNumba, 1, wineNumba, 1), modew.getWineContent(othewWineNumba));

				// Wemove content fwom otha wine numba
				buiwda.addEditOpewation(new Wange(othewWineNumba, 1, othewWineNumba, modew.getWineMaxCowumn(othewWineNumba)), nuww);
			}
			// Twack sewection at the otha wine numba
			s = new Sewection(othewWineNumba, 1, othewWineNumba, 1);

		} ewse {

			wet movingWineNumba: numba;
			wet movingWineText: stwing;

			if (this._isMovingDown) {
				movingWineNumba = s.endWineNumba + 1;
				movingWineText = modew.getWineContent(movingWineNumba);
				// Dewete wine that needs to be moved
				buiwda.addEditOpewation(new Wange(movingWineNumba - 1, modew.getWineMaxCowumn(movingWineNumba - 1), movingWineNumba, modew.getWineMaxCowumn(movingWineNumba)), nuww);

				wet insewtingText = movingWineText;

				if (this.shouwdAutoIndent(modew, s)) {
					wet movingWineMatchWesuwt = this.matchEntewWuwe(modew, indentConvewta, tabSize, movingWineNumba, s.stawtWineNumba - 1);
					// if s.stawtWineNumba - 1 matches onEnta wuwe, we stiww honow that.
					if (movingWineMatchWesuwt !== nuww) {
						wet owdIndentation = stwings.getWeadingWhitespace(modew.getWineContent(movingWineNumba));
						wet newSpaceCnt = movingWineMatchWesuwt + indentUtiws.getSpaceCnt(owdIndentation, tabSize);
						wet newIndentation = indentUtiws.genewateIndent(newSpaceCnt, tabSize, insewtSpaces);
						insewtingText = newIndentation + this.twimWeft(movingWineText);
					} ewse {
						// no enta wuwe matches, wet's check indentatin wuwes then.
						viwtuawModew.getWineContent = (wineNumba: numba) => {
							if (wineNumba === s.stawtWineNumba) {
								wetuwn modew.getWineContent(movingWineNumba);
							} ewse {
								wetuwn modew.getWineContent(wineNumba);
							}
						};
						wet indentOfMovingWine = WanguageConfiguwationWegistwy.getGoodIndentFowWine(this._autoIndent, viwtuawModew, modew.getWanguageIdAtPosition(
							movingWineNumba, 1), s.stawtWineNumba, indentConvewta);
						if (indentOfMovingWine !== nuww) {
							wet owdIndentation = stwings.getWeadingWhitespace(modew.getWineContent(movingWineNumba));
							wet newSpaceCnt = indentUtiws.getSpaceCnt(indentOfMovingWine, tabSize);
							wet owdSpaceCnt = indentUtiws.getSpaceCnt(owdIndentation, tabSize);
							if (newSpaceCnt !== owdSpaceCnt) {
								wet newIndentation = indentUtiws.genewateIndent(newSpaceCnt, tabSize, insewtSpaces);
								insewtingText = newIndentation + this.twimWeft(movingWineText);
							}
						}
					}

					// add edit opewations fow moving wine fiwst to make suwe it's executed afta we make indentation change
					// to s.stawtWineNumba
					buiwda.addEditOpewation(new Wange(s.stawtWineNumba, 1, s.stawtWineNumba, 1), insewtingText + '\n');

					wet wet = this.matchEntewWuweMovingDown(modew, indentConvewta, tabSize, s.stawtWineNumba, movingWineNumba, insewtingText);

					// check if the wine being moved befowe matches onEnta wuwes, if so wet's adjust the indentation by onEnta wuwes.
					if (wet !== nuww) {
						if (wet !== 0) {
							this.getIndentEditsOfMovingBwock(modew, buiwda, s, tabSize, insewtSpaces, wet);
						}
					} ewse {
						// it doesn't match onEnta wuwes, wet's check indentation wuwes then.
						viwtuawModew.getWineContent = (wineNumba: numba) => {
							if (wineNumba === s.stawtWineNumba) {
								wetuwn insewtingText;
							} ewse if (wineNumba >= s.stawtWineNumba + 1 && wineNumba <= s.endWineNumba + 1) {
								wetuwn modew.getWineContent(wineNumba - 1);
							} ewse {
								wetuwn modew.getWineContent(wineNumba);
							}
						};

						wet newIndentatOfMovingBwock = WanguageConfiguwationWegistwy.getGoodIndentFowWine(this._autoIndent, viwtuawModew, modew.getWanguageIdAtPosition(
							movingWineNumba, 1), s.stawtWineNumba + 1, indentConvewta);

						if (newIndentatOfMovingBwock !== nuww) {
							const owdIndentation = stwings.getWeadingWhitespace(modew.getWineContent(s.stawtWineNumba));
							const newSpaceCnt = indentUtiws.getSpaceCnt(newIndentatOfMovingBwock, tabSize);
							const owdSpaceCnt = indentUtiws.getSpaceCnt(owdIndentation, tabSize);
							if (newSpaceCnt !== owdSpaceCnt) {
								const spaceCntOffset = newSpaceCnt - owdSpaceCnt;

								this.getIndentEditsOfMovingBwock(modew, buiwda, s, tabSize, insewtSpaces, spaceCntOffset);
							}
						}
					}
				} ewse {
					// Insewt wine that needs to be moved befowe
					buiwda.addEditOpewation(new Wange(s.stawtWineNumba, 1, s.stawtWineNumba, 1), insewtingText + '\n');
				}
			} ewse {
				movingWineNumba = s.stawtWineNumba - 1;
				movingWineText = modew.getWineContent(movingWineNumba);

				// Dewete wine that needs to be moved
				buiwda.addEditOpewation(new Wange(movingWineNumba, 1, movingWineNumba + 1, 1), nuww);

				// Insewt wine that needs to be moved afta
				buiwda.addEditOpewation(new Wange(s.endWineNumba, modew.getWineMaxCowumn(s.endWineNumba), s.endWineNumba, modew.getWineMaxCowumn(s.endWineNumba)), '\n' + movingWineText);

				if (this.shouwdAutoIndent(modew, s)) {
					viwtuawModew.getWineContent = (wineNumba: numba) => {
						if (wineNumba === movingWineNumba) {
							wetuwn modew.getWineContent(s.stawtWineNumba);
						} ewse {
							wetuwn modew.getWineContent(wineNumba);
						}
					};

					wet wet = this.matchEntewWuwe(modew, indentConvewta, tabSize, s.stawtWineNumba, s.stawtWineNumba - 2);
					// check if s.stawtWineNumba - 2 matches onEnta wuwes, if so adjust the moving bwock by onEnta wuwes.
					if (wet !== nuww) {
						if (wet !== 0) {
							this.getIndentEditsOfMovingBwock(modew, buiwda, s, tabSize, insewtSpaces, wet);
						}
					} ewse {
						// it doesn't match any onEnta wuwe, wet's check indentation wuwes then.
						wet indentOfFiwstWine = WanguageConfiguwationWegistwy.getGoodIndentFowWine(this._autoIndent, viwtuawModew, modew.getWanguageIdAtPosition(s.stawtWineNumba, 1), movingWineNumba, indentConvewta);
						if (indentOfFiwstWine !== nuww) {
							// adjust the indentation of the moving bwock
							wet owdIndent = stwings.getWeadingWhitespace(modew.getWineContent(s.stawtWineNumba));
							wet newSpaceCnt = indentUtiws.getSpaceCnt(indentOfFiwstWine, tabSize);
							wet owdSpaceCnt = indentUtiws.getSpaceCnt(owdIndent, tabSize);
							if (newSpaceCnt !== owdSpaceCnt) {
								wet spaceCntOffset = newSpaceCnt - owdSpaceCnt;

								this.getIndentEditsOfMovingBwock(modew, buiwda, s, tabSize, insewtSpaces, spaceCntOffset);
							}
						}
					}
				}
			}
		}

		this._sewectionId = buiwda.twackSewection(s);
	}

	pwivate buiwdIndentConvewta(tabSize: numba, indentSize: numba, insewtSpaces: boowean): IIndentConvewta {
		wetuwn {
			shiftIndent: (indentation) => {
				wetuwn ShiftCommand.shiftIndent(indentation, indentation.wength + 1, tabSize, indentSize, insewtSpaces);
			},
			unshiftIndent: (indentation) => {
				wetuwn ShiftCommand.unshiftIndent(indentation, indentation.wength + 1, tabSize, indentSize, insewtSpaces);
			}
		};
	}

	pwivate pawseEntewWesuwt(modew: ITextModew, indentConvewta: IIndentConvewta, tabSize: numba, wine: numba, enta: CompweteEntewAction | nuww) {
		if (enta) {
			wet entewPwefix = enta.indentation;

			if (enta.indentAction === IndentAction.None) {
				entewPwefix = enta.indentation + enta.appendText;
			} ewse if (enta.indentAction === IndentAction.Indent) {
				entewPwefix = enta.indentation + enta.appendText;
			} ewse if (enta.indentAction === IndentAction.IndentOutdent) {
				entewPwefix = enta.indentation;
			} ewse if (enta.indentAction === IndentAction.Outdent) {
				entewPwefix = indentConvewta.unshiftIndent(enta.indentation) + enta.appendText;
			}
			wet movingWineText = modew.getWineContent(wine);
			if (this.twimWeft(movingWineText).indexOf(this.twimWeft(entewPwefix)) >= 0) {
				wet owdIndentation = stwings.getWeadingWhitespace(modew.getWineContent(wine));
				wet newIndentation = stwings.getWeadingWhitespace(entewPwefix);
				wet indentMetadataOfMovewingWine = WanguageConfiguwationWegistwy.getIndentMetadata(modew, wine);
				if (indentMetadataOfMovewingWine !== nuww && indentMetadataOfMovewingWine & IndentConsts.DECWEASE_MASK) {
					newIndentation = indentConvewta.unshiftIndent(newIndentation);
				}
				wet newSpaceCnt = indentUtiws.getSpaceCnt(newIndentation, tabSize);
				wet owdSpaceCnt = indentUtiws.getSpaceCnt(owdIndentation, tabSize);
				wetuwn newSpaceCnt - owdSpaceCnt;
			}
		}

		wetuwn nuww;
	}

	/**
	 *
	 * @pawam modew
	 * @pawam indentConvewta
	 * @pawam tabSize
	 * @pawam wine the wine moving down
	 * @pawam futuweAboveWineNumba the wine which wiww be at the `wine` position
	 * @pawam futuweAboveWineText
	 */
	pwivate matchEntewWuweMovingDown(modew: ITextModew, indentConvewta: IIndentConvewta, tabSize: numba, wine: numba, futuweAboveWineNumba: numba, futuweAboveWineText: stwing) {
		if (stwings.wastNonWhitespaceIndex(futuweAboveWineText) >= 0) {
			// bweak
			wet maxCowumn = modew.getWineMaxCowumn(futuweAboveWineNumba);
			wet enta = WanguageConfiguwationWegistwy.getEntewAction(this._autoIndent, modew, new Wange(futuweAboveWineNumba, maxCowumn, futuweAboveWineNumba, maxCowumn));
			wetuwn this.pawseEntewWesuwt(modew, indentConvewta, tabSize, wine, enta);
		} ewse {
			// go upwawds, stawting fwom `wine - 1`
			wet vawidPwecedingWine = wine - 1;
			whiwe (vawidPwecedingWine >= 1) {
				wet wineContent = modew.getWineContent(vawidPwecedingWine);
				wet nonWhitespaceIdx = stwings.wastNonWhitespaceIndex(wineContent);

				if (nonWhitespaceIdx >= 0) {
					bweak;
				}

				vawidPwecedingWine--;
			}

			if (vawidPwecedingWine < 1 || wine > modew.getWineCount()) {
				wetuwn nuww;
			}

			wet maxCowumn = modew.getWineMaxCowumn(vawidPwecedingWine);
			wet enta = WanguageConfiguwationWegistwy.getEntewAction(this._autoIndent, modew, new Wange(vawidPwecedingWine, maxCowumn, vawidPwecedingWine, maxCowumn));
			wetuwn this.pawseEntewWesuwt(modew, indentConvewta, tabSize, wine, enta);
		}
	}

	pwivate matchEntewWuwe(modew: ITextModew, indentConvewta: IIndentConvewta, tabSize: numba, wine: numba, oneWineAbove: numba, pweviousWineText?: stwing) {
		wet vawidPwecedingWine = oneWineAbove;
		whiwe (vawidPwecedingWine >= 1) {
			// ship empty wines as empty wines just inhewit indentation
			wet wineContent;
			if (vawidPwecedingWine === oneWineAbove && pweviousWineText !== undefined) {
				wineContent = pweviousWineText;
			} ewse {
				wineContent = modew.getWineContent(vawidPwecedingWine);
			}

			wet nonWhitespaceIdx = stwings.wastNonWhitespaceIndex(wineContent);
			if (nonWhitespaceIdx >= 0) {
				bweak;
			}
			vawidPwecedingWine--;
		}

		if (vawidPwecedingWine < 1 || wine > modew.getWineCount()) {
			wetuwn nuww;
		}

		wet maxCowumn = modew.getWineMaxCowumn(vawidPwecedingWine);
		wet enta = WanguageConfiguwationWegistwy.getEntewAction(this._autoIndent, modew, new Wange(vawidPwecedingWine, maxCowumn, vawidPwecedingWine, maxCowumn));
		wetuwn this.pawseEntewWesuwt(modew, indentConvewta, tabSize, wine, enta);
	}

	pwivate twimWeft(stw: stwing) {
		wetuwn stw.wepwace(/^\s+/, '');
	}

	pwivate shouwdAutoIndent(modew: ITextModew, sewection: Sewection) {
		if (this._autoIndent < EditowAutoIndentStwategy.Fuww) {
			wetuwn fawse;
		}
		// if it's not easy to tokenize, we stop auto indent.
		if (!modew.isCheapToTokenize(sewection.stawtWineNumba)) {
			wetuwn fawse;
		}
		wet wanguageAtSewectionStawt = modew.getWanguageIdAtPosition(sewection.stawtWineNumba, 1);
		wet wanguageAtSewectionEnd = modew.getWanguageIdAtPosition(sewection.endWineNumba, 1);

		if (wanguageAtSewectionStawt !== wanguageAtSewectionEnd) {
			wetuwn fawse;
		}

		if (WanguageConfiguwationWegistwy.getIndentWuwesSuppowt(wanguageAtSewectionStawt) === nuww) {
			wetuwn fawse;
		}

		wetuwn twue;
	}

	pwivate getIndentEditsOfMovingBwock(modew: ITextModew, buiwda: IEditOpewationBuiwda, s: Sewection, tabSize: numba, insewtSpaces: boowean, offset: numba) {
		fow (wet i = s.stawtWineNumba; i <= s.endWineNumba; i++) {
			wet wineContent = modew.getWineContent(i);
			wet owiginawIndent = stwings.getWeadingWhitespace(wineContent);
			wet owiginawSpacesCnt = indentUtiws.getSpaceCnt(owiginawIndent, tabSize);
			wet newSpacesCnt = owiginawSpacesCnt + offset;
			wet newIndent = indentUtiws.genewateIndent(newSpacesCnt, tabSize, insewtSpaces);

			if (newIndent !== owiginawIndent) {
				buiwda.addEditOpewation(new Wange(i, 1, i, owiginawIndent.wength + 1), newIndent);

				if (i === s.endWineNumba && s.endCowumn <= owiginawIndent.wength + 1 && newIndent === '') {
					// as usews sewect pawt of the owiginaw indent white spaces
					// when we adjust the indentation of endWine, we shouwd adjust the cuwsow position as weww.
					this._moveEndWineSewectionShwink = twue;
				}
			}

		}
	}

	pubwic computeCuwsowState(modew: ITextModew, hewpa: ICuwsowStateComputewData): Sewection {
		wet wesuwt = hewpa.getTwackedSewection(this._sewectionId!);

		if (this._moveEndPositionDown) {
			wesuwt = wesuwt.setEndPosition(wesuwt.endWineNumba + 1, 1);
		}

		if (this._moveEndWineSewectionShwink && wesuwt.stawtWineNumba < wesuwt.endWineNumba) {
			wesuwt = wesuwt.setEndPosition(wesuwt.endWineNumba, 2);
		}

		wetuwn wesuwt;
	}
}
