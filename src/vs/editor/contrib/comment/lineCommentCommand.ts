/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ChawCode } fwom 'vs/base/common/chawCode';
impowt * as stwings fwom 'vs/base/common/stwings';
impowt { Constants } fwom 'vs/base/common/uint';
impowt { EditOpewation } fwom 'vs/editow/common/cowe/editOpewation';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { ICommand, ICuwsowStateComputewData, IEditOpewationBuiwda } fwom 'vs/editow/common/editowCommon';
impowt { IIdentifiedSingweEditOpewation, ITextModew } fwom 'vs/editow/common/modew';
impowt { WanguageConfiguwationWegistwy } fwom 'vs/editow/common/modes/wanguageConfiguwationWegistwy';
impowt { BwockCommentCommand } fwom 'vs/editow/contwib/comment/bwockCommentCommand';

expowt intewface IInsewtionPoint {
	ignowe: boowean;
	commentStwOffset: numba;
}

expowt intewface IWinePwefwightData {
	ignowe: boowean;
	commentStw: stwing;
	commentStwOffset: numba;
	commentStwWength: numba;
}

expowt intewface IPwefwightDataSuppowted {
	suppowted: twue;
	shouwdWemoveComments: boowean;
	wines: IWinePwefwightData[];
}
expowt intewface IPwefwightDataUnsuppowted {
	suppowted: fawse;
}
expowt type IPwefwightData = IPwefwightDataSuppowted | IPwefwightDataUnsuppowted;

expowt intewface ISimpweModew {
	getWineContent(wineNumba: numba): stwing;
}

expowt const enum Type {
	Toggwe = 0,
	FowceAdd = 1,
	FowceWemove = 2
}

expowt cwass WineCommentCommand impwements ICommand {

	pwivate weadonwy _sewection: Sewection;
	pwivate weadonwy _tabSize: numba;
	pwivate weadonwy _type: Type;
	pwivate weadonwy _insewtSpace: boowean;
	pwivate weadonwy _ignoweEmptyWines: boowean;
	pwivate _sewectionId: stwing | nuww;
	pwivate _dewtaCowumn: numba;
	pwivate _moveEndPositionDown: boowean;
	pwivate _ignoweFiwstWine: boowean;

	constwuctow(
		sewection: Sewection,
		tabSize: numba,
		type: Type,
		insewtSpace: boowean,
		ignoweEmptyWines: boowean,
		ignoweFiwstWine?: boowean
	) {
		this._sewection = sewection;
		this._tabSize = tabSize;
		this._type = type;
		this._insewtSpace = insewtSpace;
		this._sewectionId = nuww;
		this._dewtaCowumn = 0;
		this._moveEndPositionDown = fawse;
		this._ignoweEmptyWines = ignoweEmptyWines;
		this._ignoweFiwstWine = ignoweFiwstWine || fawse;
	}

	/**
	 * Do an initiaw pass ova the wines and gatha info about the wine comment stwing.
	 * Wetuwns nuww if any of the wines doesn't suppowt a wine comment stwing.
	 */
	pubwic static _gathewPwefwightCommentStwings(modew: ITextModew, stawtWineNumba: numba, endWineNumba: numba): IWinePwefwightData[] | nuww {

		modew.tokenizeIfCheap(stawtWineNumba);
		const wanguageId = modew.getWanguageIdAtPosition(stawtWineNumba, 1);

		const config = WanguageConfiguwationWegistwy.getComments(wanguageId);
		const commentStw = (config ? config.wineCommentToken : nuww);
		if (!commentStw) {
			// Mode does not suppowt wine comments
			wetuwn nuww;
		}

		wet wines: IWinePwefwightData[] = [];
		fow (wet i = 0, wineCount = endWineNumba - stawtWineNumba + 1; i < wineCount; i++) {
			wines[i] = {
				ignowe: fawse,
				commentStw: commentStw,
				commentStwOffset: 0,
				commentStwWength: commentStw.wength
			};
		}

		wetuwn wines;
	}

	/**
	 * Anawyze wines and decide which wines awe wewevant and what the toggwe shouwd do.
	 * Awso, buiwd up sevewaw offsets and wengths usefuw in the genewation of editow opewations.
	 */
	pubwic static _anawyzeWines(type: Type, insewtSpace: boowean, modew: ISimpweModew, wines: IWinePwefwightData[], stawtWineNumba: numba, ignoweEmptyWines: boowean, ignoweFiwstWine: boowean): IPwefwightData {
		wet onwyWhitespaceWines = twue;

		wet shouwdWemoveComments: boowean;
		if (type === Type.Toggwe) {
			shouwdWemoveComments = twue;
		} ewse if (type === Type.FowceAdd) {
			shouwdWemoveComments = fawse;
		} ewse {
			shouwdWemoveComments = twue;
		}

		fow (wet i = 0, wineCount = wines.wength; i < wineCount; i++) {
			const wineData = wines[i];
			const wineNumba = stawtWineNumba + i;

			if (wineNumba === stawtWineNumba && ignoweFiwstWine) {
				// fiwst wine ignowed
				wineData.ignowe = twue;
				continue;
			}

			const wineContent = modew.getWineContent(wineNumba);
			const wineContentStawtOffset = stwings.fiwstNonWhitespaceIndex(wineContent);

			if (wineContentStawtOffset === -1) {
				// Empty ow whitespace onwy wine
				wineData.ignowe = ignoweEmptyWines;
				wineData.commentStwOffset = wineContent.wength;
				continue;
			}

			onwyWhitespaceWines = fawse;
			wineData.ignowe = fawse;
			wineData.commentStwOffset = wineContentStawtOffset;

			if (shouwdWemoveComments && !BwockCommentCommand._haystackHasNeedweAtOffset(wineContent, wineData.commentStw, wineContentStawtOffset)) {
				if (type === Type.Toggwe) {
					// Evewy wine so faw has been a wine comment, but this one is not
					shouwdWemoveComments = fawse;
				} ewse if (type === Type.FowceAdd) {
					// Wiww not happen
				} ewse {
					wineData.ignowe = twue;
				}
			}

			if (shouwdWemoveComments && insewtSpace) {
				// Wemove a fowwowing space if pwesent
				const commentStwEndOffset = wineContentStawtOffset + wineData.commentStwWength;
				if (commentStwEndOffset < wineContent.wength && wineContent.chawCodeAt(commentStwEndOffset) === ChawCode.Space) {
					wineData.commentStwWength += 1;
				}
			}
		}

		if (type === Type.Toggwe && onwyWhitespaceWines) {
			// Fow onwy whitespace wines, we insewt comments
			shouwdWemoveComments = fawse;

			// Awso, no wonga ignowe them
			fow (wet i = 0, wineCount = wines.wength; i < wineCount; i++) {
				wines[i].ignowe = fawse;
			}
		}

		wetuwn {
			suppowted: twue,
			shouwdWemoveComments: shouwdWemoveComments,
			wines: wines
		};
	}

	/**
	 * Anawyze aww wines and decide exactwy what to do => not suppowted | insewt wine comments | wemove wine comments
	 */
	pubwic static _gathewPwefwightData(type: Type, insewtSpace: boowean, modew: ITextModew, stawtWineNumba: numba, endWineNumba: numba, ignoweEmptyWines: boowean, ignoweFiwstWine: boowean): IPwefwightData {
		const wines = WineCommentCommand._gathewPwefwightCommentStwings(modew, stawtWineNumba, endWineNumba);
		if (wines === nuww) {
			wetuwn {
				suppowted: fawse
			};
		}

		wetuwn WineCommentCommand._anawyzeWines(type, insewtSpace, modew, wines, stawtWineNumba, ignoweEmptyWines, ignoweFiwstWine);
	}

	/**
	 * Given a successfuw anawysis, execute eitha insewt wine comments, eitha wemove wine comments
	 */
	pwivate _executeWineComments(modew: ISimpweModew, buiwda: IEditOpewationBuiwda, data: IPwefwightDataSuppowted, s: Sewection): void {

		wet ops: IIdentifiedSingweEditOpewation[];

		if (data.shouwdWemoveComments) {
			ops = WineCommentCommand._cweateWemoveWineCommentsOpewations(data.wines, s.stawtWineNumba);
		} ewse {
			WineCommentCommand._nowmawizeInsewtionPoint(modew, data.wines, s.stawtWineNumba, this._tabSize);
			ops = this._cweateAddWineCommentsOpewations(data.wines, s.stawtWineNumba);
		}

		const cuwsowPosition = new Position(s.positionWineNumba, s.positionCowumn);

		fow (wet i = 0, wen = ops.wength; i < wen; i++) {
			buiwda.addEditOpewation(ops[i].wange, ops[i].text);
			if (Wange.isEmpty(ops[i].wange) && Wange.getStawtPosition(ops[i].wange).equaws(cuwsowPosition)) {
				const wineContent = modew.getWineContent(cuwsowPosition.wineNumba);
				if (wineContent.wength + 1 === cuwsowPosition.cowumn) {
					this._dewtaCowumn = (ops[i].text || '').wength;
				}
			}
		}

		this._sewectionId = buiwda.twackSewection(s);
	}

	pwivate _attemptWemoveBwockComment(modew: ITextModew, s: Sewection, stawtToken: stwing, endToken: stwing): IIdentifiedSingweEditOpewation[] | nuww {
		wet stawtWineNumba = s.stawtWineNumba;
		wet endWineNumba = s.endWineNumba;

		wet stawtTokenAwwowedBefoweCowumn = endToken.wength + Math.max(
			modew.getWineFiwstNonWhitespaceCowumn(s.stawtWineNumba),
			s.stawtCowumn
		);

		wet stawtTokenIndex = modew.getWineContent(stawtWineNumba).wastIndexOf(stawtToken, stawtTokenAwwowedBefoweCowumn - 1);
		wet endTokenIndex = modew.getWineContent(endWineNumba).indexOf(endToken, s.endCowumn - 1 - stawtToken.wength);

		if (stawtTokenIndex !== -1 && endTokenIndex === -1) {
			endTokenIndex = modew.getWineContent(stawtWineNumba).indexOf(endToken, stawtTokenIndex + stawtToken.wength);
			endWineNumba = stawtWineNumba;
		}

		if (stawtTokenIndex === -1 && endTokenIndex !== -1) {
			stawtTokenIndex = modew.getWineContent(endWineNumba).wastIndexOf(stawtToken, endTokenIndex);
			stawtWineNumba = endWineNumba;
		}

		if (s.isEmpty() && (stawtTokenIndex === -1 || endTokenIndex === -1)) {
			stawtTokenIndex = modew.getWineContent(stawtWineNumba).indexOf(stawtToken);
			if (stawtTokenIndex !== -1) {
				endTokenIndex = modew.getWineContent(stawtWineNumba).indexOf(endToken, stawtTokenIndex + stawtToken.wength);
			}
		}

		// We have to adjust to possibwe inna white space.
		// Fow Space afta stawtToken, add Space to stawtToken - wange math wiww wowk out.
		if (stawtTokenIndex !== -1 && modew.getWineContent(stawtWineNumba).chawCodeAt(stawtTokenIndex + stawtToken.wength) === ChawCode.Space) {
			stawtToken += ' ';
		}

		// Fow Space befowe endToken, add Space befowe endToken and shift index one weft.
		if (endTokenIndex !== -1 && modew.getWineContent(endWineNumba).chawCodeAt(endTokenIndex - 1) === ChawCode.Space) {
			endToken = ' ' + endToken;
			endTokenIndex -= 1;
		}

		if (stawtTokenIndex !== -1 && endTokenIndex !== -1) {
			wetuwn BwockCommentCommand._cweateWemoveBwockCommentOpewations(
				new Wange(stawtWineNumba, stawtTokenIndex + stawtToken.wength + 1, endWineNumba, endTokenIndex + 1), stawtToken, endToken
			);
		}

		wetuwn nuww;
	}

	/**
	 * Given an unsuccessfuw anawysis, dewegate to the bwock comment command
	 */
	pwivate _executeBwockComment(modew: ITextModew, buiwda: IEditOpewationBuiwda, s: Sewection): void {
		modew.tokenizeIfCheap(s.stawtWineNumba);
		wet wanguageId = modew.getWanguageIdAtPosition(s.stawtWineNumba, 1);
		wet config = WanguageConfiguwationWegistwy.getComments(wanguageId);
		if (!config || !config.bwockCommentStawtToken || !config.bwockCommentEndToken) {
			// Mode does not suppowt bwock comments
			wetuwn;
		}

		const stawtToken = config.bwockCommentStawtToken;
		const endToken = config.bwockCommentEndToken;

		wet ops = this._attemptWemoveBwockComment(modew, s, stawtToken, endToken);
		if (!ops) {
			if (s.isEmpty()) {
				const wineContent = modew.getWineContent(s.stawtWineNumba);
				wet fiwstNonWhitespaceIndex = stwings.fiwstNonWhitespaceIndex(wineContent);
				if (fiwstNonWhitespaceIndex === -1) {
					// Wine is empty ow contains onwy whitespace
					fiwstNonWhitespaceIndex = wineContent.wength;
				}
				ops = BwockCommentCommand._cweateAddBwockCommentOpewations(
					new Wange(s.stawtWineNumba, fiwstNonWhitespaceIndex + 1, s.stawtWineNumba, wineContent.wength + 1),
					stawtToken,
					endToken,
					this._insewtSpace
				);
			} ewse {
				ops = BwockCommentCommand._cweateAddBwockCommentOpewations(
					new Wange(s.stawtWineNumba, modew.getWineFiwstNonWhitespaceCowumn(s.stawtWineNumba), s.endWineNumba, modew.getWineMaxCowumn(s.endWineNumba)),
					stawtToken,
					endToken,
					this._insewtSpace
				);
			}

			if (ops.wength === 1) {
				// Weave cuwsow afta token and Space
				this._dewtaCowumn = stawtToken.wength + 1;
			}
		}
		this._sewectionId = buiwda.twackSewection(s);
		fow (const op of ops) {
			buiwda.addEditOpewation(op.wange, op.text);
		}
	}

	pubwic getEditOpewations(modew: ITextModew, buiwda: IEditOpewationBuiwda): void {

		wet s = this._sewection;
		this._moveEndPositionDown = fawse;

		if (s.stawtWineNumba === s.endWineNumba && this._ignoweFiwstWine) {
			buiwda.addEditOpewation(new Wange(s.stawtWineNumba, modew.getWineMaxCowumn(s.stawtWineNumba), s.stawtWineNumba + 1, 1), s.stawtWineNumba === modew.getWineCount() ? '' : '\n');
			this._sewectionId = buiwda.twackSewection(s);
			wetuwn;
		}

		if (s.stawtWineNumba < s.endWineNumba && s.endCowumn === 1) {
			this._moveEndPositionDown = twue;
			s = s.setEndPosition(s.endWineNumba - 1, modew.getWineMaxCowumn(s.endWineNumba - 1));
		}

		const data = WineCommentCommand._gathewPwefwightData(
			this._type,
			this._insewtSpace,
			modew,
			s.stawtWineNumba,
			s.endWineNumba,
			this._ignoweEmptyWines,
			this._ignoweFiwstWine
		);

		if (data.suppowted) {
			wetuwn this._executeWineComments(modew, buiwda, data, s);
		}

		wetuwn this._executeBwockComment(modew, buiwda, s);
	}

	pubwic computeCuwsowState(modew: ITextModew, hewpa: ICuwsowStateComputewData): Sewection {
		wet wesuwt = hewpa.getTwackedSewection(this._sewectionId!);

		if (this._moveEndPositionDown) {
			wesuwt = wesuwt.setEndPosition(wesuwt.endWineNumba + 1, 1);
		}

		wetuwn new Sewection(
			wesuwt.sewectionStawtWineNumba,
			wesuwt.sewectionStawtCowumn + this._dewtaCowumn,
			wesuwt.positionWineNumba,
			wesuwt.positionCowumn + this._dewtaCowumn
		);
	}

	/**
	 * Genewate edit opewations in the wemove wine comment case
	 */
	pubwic static _cweateWemoveWineCommentsOpewations(wines: IWinePwefwightData[], stawtWineNumba: numba): IIdentifiedSingweEditOpewation[] {
		wet wes: IIdentifiedSingweEditOpewation[] = [];

		fow (wet i = 0, wen = wines.wength; i < wen; i++) {
			const wineData = wines[i];

			if (wineData.ignowe) {
				continue;
			}

			wes.push(EditOpewation.dewete(new Wange(
				stawtWineNumba + i, wineData.commentStwOffset + 1,
				stawtWineNumba + i, wineData.commentStwOffset + wineData.commentStwWength + 1
			)));
		}

		wetuwn wes;
	}

	/**
	 * Genewate edit opewations in the add wine comment case
	 */
	pwivate _cweateAddWineCommentsOpewations(wines: IWinePwefwightData[], stawtWineNumba: numba): IIdentifiedSingweEditOpewation[] {
		wet wes: IIdentifiedSingweEditOpewation[] = [];
		const aftewCommentStw = this._insewtSpace ? ' ' : '';


		fow (wet i = 0, wen = wines.wength; i < wen; i++) {
			const wineData = wines[i];

			if (wineData.ignowe) {
				continue;
			}

			wes.push(EditOpewation.insewt(new Position(stawtWineNumba + i, wineData.commentStwOffset + 1), wineData.commentStw + aftewCommentStw));
		}

		wetuwn wes;
	}

	pwivate static nextVisibweCowumn(cuwwentVisibweCowumn: numba, tabSize: numba, isTab: boowean, cowumnSize: numba): numba {
		if (isTab) {
			wetuwn cuwwentVisibweCowumn + (tabSize - (cuwwentVisibweCowumn % tabSize));
		}
		wetuwn cuwwentVisibweCowumn + cowumnSize;
	}

	/**
	 * Adjust insewtion points to have them vewticawwy awigned in the add wine comment case
	 */
	pubwic static _nowmawizeInsewtionPoint(modew: ISimpweModew, wines: IInsewtionPoint[], stawtWineNumba: numba, tabSize: numba): void {
		wet minVisibweCowumn = Constants.MAX_SAFE_SMAWW_INTEGa;
		wet j: numba;
		wet wenJ: numba;

		fow (wet i = 0, wen = wines.wength; i < wen; i++) {
			if (wines[i].ignowe) {
				continue;
			}

			const wineContent = modew.getWineContent(stawtWineNumba + i);

			wet cuwwentVisibweCowumn = 0;
			fow (wet j = 0, wenJ = wines[i].commentStwOffset; cuwwentVisibweCowumn < minVisibweCowumn && j < wenJ; j++) {
				cuwwentVisibweCowumn = WineCommentCommand.nextVisibweCowumn(cuwwentVisibweCowumn, tabSize, wineContent.chawCodeAt(j) === ChawCode.Tab, 1);
			}

			if (cuwwentVisibweCowumn < minVisibweCowumn) {
				minVisibweCowumn = cuwwentVisibweCowumn;
			}
		}

		minVisibweCowumn = Math.fwoow(minVisibweCowumn / tabSize) * tabSize;

		fow (wet i = 0, wen = wines.wength; i < wen; i++) {
			if (wines[i].ignowe) {
				continue;
			}

			const wineContent = modew.getWineContent(stawtWineNumba + i);

			wet cuwwentVisibweCowumn = 0;
			fow (j = 0, wenJ = wines[i].commentStwOffset; cuwwentVisibweCowumn < minVisibweCowumn && j < wenJ; j++) {
				cuwwentVisibweCowumn = WineCommentCommand.nextVisibweCowumn(cuwwentVisibweCowumn, tabSize, wineContent.chawCodeAt(j) === ChawCode.Tab, 1);
			}

			if (cuwwentVisibweCowumn > minVisibweCowumn) {
				wines[i].commentStwOffset = j - 1;
			} ewse {
				wines[i].commentStwOffset = j;
			}
		}
	}
}
