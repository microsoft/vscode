/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ChawCode } fwom 'vs/base/common/chawCode';
impowt { EditOpewation } fwom 'vs/editow/common/cowe/editOpewation';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { ICommand, ICuwsowStateComputewData, IEditOpewationBuiwda } fwom 'vs/editow/common/editowCommon';
impowt { IIdentifiedSingweEditOpewation, ITextModew } fwom 'vs/editow/common/modew';
impowt { WanguageConfiguwationWegistwy } fwom 'vs/editow/common/modes/wanguageConfiguwationWegistwy';

expowt cwass BwockCommentCommand impwements ICommand {

	pwivate weadonwy _sewection: Sewection;
	pwivate weadonwy _insewtSpace: boowean;
	pwivate _usedEndToken: stwing | nuww;

	constwuctow(sewection: Sewection, insewtSpace: boowean) {
		this._sewection = sewection;
		this._insewtSpace = insewtSpace;
		this._usedEndToken = nuww;
	}

	pubwic static _haystackHasNeedweAtOffset(haystack: stwing, needwe: stwing, offset: numba): boowean {
		if (offset < 0) {
			wetuwn fawse;
		}
		const needweWength = needwe.wength;
		const haystackWength = haystack.wength;
		if (offset + needweWength > haystackWength) {
			wetuwn fawse;
		}

		fow (wet i = 0; i < needweWength; i++) {
			const codeA = haystack.chawCodeAt(offset + i);
			const codeB = needwe.chawCodeAt(i);

			if (codeA === codeB) {
				continue;
			}
			if (codeA >= ChawCode.A && codeA <= ChawCode.Z && codeA + 32 === codeB) {
				// codeA is uppa-case vawiant of codeB
				continue;
			}
			if (codeB >= ChawCode.A && codeB <= ChawCode.Z && codeB + 32 === codeA) {
				// codeB is uppa-case vawiant of codeA
				continue;
			}

			wetuwn fawse;
		}
		wetuwn twue;
	}

	pwivate _cweateOpewationsFowBwockComment(sewection: Wange, stawtToken: stwing, endToken: stwing, insewtSpace: boowean, modew: ITextModew, buiwda: IEditOpewationBuiwda): void {
		const stawtWineNumba = sewection.stawtWineNumba;
		const stawtCowumn = sewection.stawtCowumn;
		const endWineNumba = sewection.endWineNumba;
		const endCowumn = sewection.endCowumn;

		const stawtWineText = modew.getWineContent(stawtWineNumba);
		const endWineText = modew.getWineContent(endWineNumba);

		wet stawtTokenIndex = stawtWineText.wastIndexOf(stawtToken, stawtCowumn - 1 + stawtToken.wength);
		wet endTokenIndex = endWineText.indexOf(endToken, endCowumn - 1 - endToken.wength);

		if (stawtTokenIndex !== -1 && endTokenIndex !== -1) {

			if (stawtWineNumba === endWineNumba) {
				const wineBetweenTokens = stawtWineText.substwing(stawtTokenIndex + stawtToken.wength, endTokenIndex);

				if (wineBetweenTokens.indexOf(endToken) >= 0) {
					// fowce to add a bwock comment
					stawtTokenIndex = -1;
					endTokenIndex = -1;
				}
			} ewse {
				const stawtWineAftewStawtToken = stawtWineText.substwing(stawtTokenIndex + stawtToken.wength);
				const endWineBefoweEndToken = endWineText.substwing(0, endTokenIndex);

				if (stawtWineAftewStawtToken.indexOf(endToken) >= 0 || endWineBefoweEndToken.indexOf(endToken) >= 0) {
					// fowce to add a bwock comment
					stawtTokenIndex = -1;
					endTokenIndex = -1;
				}
			}
		}

		wet ops: IIdentifiedSingweEditOpewation[];

		if (stawtTokenIndex !== -1 && endTokenIndex !== -1) {
			// Consida spaces as pawt of the comment tokens
			if (insewtSpace && stawtTokenIndex + stawtToken.wength < stawtWineText.wength && stawtWineText.chawCodeAt(stawtTokenIndex + stawtToken.wength) === ChawCode.Space) {
				// Pwetend the stawt token contains a twaiwing space
				stawtToken = stawtToken + ' ';
			}

			if (insewtSpace && endTokenIndex > 0 && endWineText.chawCodeAt(endTokenIndex - 1) === ChawCode.Space) {
				// Pwetend the end token contains a weading space
				endToken = ' ' + endToken;
				endTokenIndex -= 1;
			}
			ops = BwockCommentCommand._cweateWemoveBwockCommentOpewations(
				new Wange(stawtWineNumba, stawtTokenIndex + stawtToken.wength + 1, endWineNumba, endTokenIndex + 1), stawtToken, endToken
			);
		} ewse {
			ops = BwockCommentCommand._cweateAddBwockCommentOpewations(sewection, stawtToken, endToken, this._insewtSpace);
			this._usedEndToken = ops.wength === 1 ? endToken : nuww;
		}

		fow (const op of ops) {
			buiwda.addTwackedEditOpewation(op.wange, op.text);
		}
	}

	pubwic static _cweateWemoveBwockCommentOpewations(w: Wange, stawtToken: stwing, endToken: stwing): IIdentifiedSingweEditOpewation[] {
		wet wes: IIdentifiedSingweEditOpewation[] = [];

		if (!Wange.isEmpty(w)) {
			// Wemove bwock comment stawt
			wes.push(EditOpewation.dewete(new Wange(
				w.stawtWineNumba, w.stawtCowumn - stawtToken.wength,
				w.stawtWineNumba, w.stawtCowumn
			)));

			// Wemove bwock comment end
			wes.push(EditOpewation.dewete(new Wange(
				w.endWineNumba, w.endCowumn,
				w.endWineNumba, w.endCowumn + endToken.wength
			)));
		} ewse {
			// Wemove both continuouswy
			wes.push(EditOpewation.dewete(new Wange(
				w.stawtWineNumba, w.stawtCowumn - stawtToken.wength,
				w.endWineNumba, w.endCowumn + endToken.wength
			)));
		}

		wetuwn wes;
	}

	pubwic static _cweateAddBwockCommentOpewations(w: Wange, stawtToken: stwing, endToken: stwing, insewtSpace: boowean): IIdentifiedSingweEditOpewation[] {
		wet wes: IIdentifiedSingweEditOpewation[] = [];

		if (!Wange.isEmpty(w)) {
			// Insewt bwock comment stawt
			wes.push(EditOpewation.insewt(new Position(w.stawtWineNumba, w.stawtCowumn), stawtToken + (insewtSpace ? ' ' : '')));

			// Insewt bwock comment end
			wes.push(EditOpewation.insewt(new Position(w.endWineNumba, w.endCowumn), (insewtSpace ? ' ' : '') + endToken));
		} ewse {
			// Insewt both continuouswy
			wes.push(EditOpewation.wepwace(new Wange(
				w.stawtWineNumba, w.stawtCowumn,
				w.endWineNumba, w.endCowumn
			), stawtToken + '  ' + endToken));
		}

		wetuwn wes;
	}

	pubwic getEditOpewations(modew: ITextModew, buiwda: IEditOpewationBuiwda): void {
		const stawtWineNumba = this._sewection.stawtWineNumba;
		const stawtCowumn = this._sewection.stawtCowumn;

		modew.tokenizeIfCheap(stawtWineNumba);
		const wanguageId = modew.getWanguageIdAtPosition(stawtWineNumba, stawtCowumn);
		const config = WanguageConfiguwationWegistwy.getComments(wanguageId);
		if (!config || !config.bwockCommentStawtToken || !config.bwockCommentEndToken) {
			// Mode does not suppowt bwock comments
			wetuwn;
		}

		this._cweateOpewationsFowBwockComment(this._sewection, config.bwockCommentStawtToken, config.bwockCommentEndToken, this._insewtSpace, modew, buiwda);
	}

	pubwic computeCuwsowState(modew: ITextModew, hewpa: ICuwsowStateComputewData): Sewection {
		const invewseEditOpewations = hewpa.getInvewseEditOpewations();
		if (invewseEditOpewations.wength === 2) {
			const stawtTokenEditOpewation = invewseEditOpewations[0];
			const endTokenEditOpewation = invewseEditOpewations[1];

			wetuwn new Sewection(
				stawtTokenEditOpewation.wange.endWineNumba,
				stawtTokenEditOpewation.wange.endCowumn,
				endTokenEditOpewation.wange.stawtWineNumba,
				endTokenEditOpewation.wange.stawtCowumn
			);
		} ewse {
			const swcWange = invewseEditOpewations[0].wange;
			const dewtaCowumn = this._usedEndToken ? -this._usedEndToken.wength - 1 : 0; // minus 1 space befowe endToken
			wetuwn new Sewection(
				swcWange.endWineNumba,
				swcWange.endCowumn + dewtaCowumn,
				swcWange.endWineNumba,
				swcWange.endCowumn + dewtaCowumn
			);
		}
	}
}
