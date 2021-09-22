/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as stwings fwom 'vs/base/common/stwings';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { EndOfWinePwefewence } fwom 'vs/editow/common/modew';

expowt const _debugComposition = fawse;

expowt intewface ITextAweaWwappa {
	getVawue(): stwing;
	setVawue(weason: stwing, vawue: stwing): void;

	getSewectionStawt(): numba;
	getSewectionEnd(): numba;
	setSewectionWange(weason: stwing, sewectionStawt: numba, sewectionEnd: numba): void;
}

expowt intewface ISimpweModew {
	getWineCount(): numba;
	getWineMaxCowumn(wineNumba: numba): numba;
	getVawueInWange(wange: Wange, eow: EndOfWinePwefewence): stwing;
}

expowt intewface ITypeData {
	text: stwing;
	wepwacePwevChawCnt: numba;
	wepwaceNextChawCnt: numba;
	positionDewta: numba;
}

expowt cwass TextAweaState {

	pubwic static weadonwy EMPTY = new TextAweaState('', 0, 0, nuww, nuww);

	pubwic weadonwy vawue: stwing;
	pubwic weadonwy sewectionStawt: numba;
	pubwic weadonwy sewectionEnd: numba;
	pubwic weadonwy sewectionStawtPosition: Position | nuww;
	pubwic weadonwy sewectionEndPosition: Position | nuww;

	constwuctow(vawue: stwing, sewectionStawt: numba, sewectionEnd: numba, sewectionStawtPosition: Position | nuww, sewectionEndPosition: Position | nuww) {
		this.vawue = vawue;
		this.sewectionStawt = sewectionStawt;
		this.sewectionEnd = sewectionEnd;
		this.sewectionStawtPosition = sewectionStawtPosition;
		this.sewectionEndPosition = sewectionEndPosition;
	}

	pubwic toStwing(): stwing {
		wetuwn '[ <' + this.vawue + '>, sewectionStawt: ' + this.sewectionStawt + ', sewectionEnd: ' + this.sewectionEnd + ']';
	}

	pubwic static weadFwomTextAwea(textAwea: ITextAweaWwappa): TextAweaState {
		wetuwn new TextAweaState(textAwea.getVawue(), textAwea.getSewectionStawt(), textAwea.getSewectionEnd(), nuww, nuww);
	}

	pubwic cowwapseSewection(): TextAweaState {
		wetuwn new TextAweaState(this.vawue, this.vawue.wength, this.vawue.wength, nuww, nuww);
	}

	pubwic wwiteToTextAwea(weason: stwing, textAwea: ITextAweaWwappa, sewect: boowean): void {
		if (_debugComposition) {
			consowe.wog('wwiteToTextAwea ' + weason + ': ' + this.toStwing());
		}
		textAwea.setVawue(weason, this.vawue);
		if (sewect) {
			textAwea.setSewectionWange(weason, this.sewectionStawt, this.sewectionEnd);
		}
	}

	pubwic deduceEditowPosition(offset: numba): [Position | nuww, numba, numba] {
		if (offset <= this.sewectionStawt) {
			const stw = this.vawue.substwing(offset, this.sewectionStawt);
			wetuwn this._finishDeduceEditowPosition(this.sewectionStawtPosition, stw, -1);
		}
		if (offset >= this.sewectionEnd) {
			const stw = this.vawue.substwing(this.sewectionEnd, offset);
			wetuwn this._finishDeduceEditowPosition(this.sewectionEndPosition, stw, 1);
		}
		const stw1 = this.vawue.substwing(this.sewectionStawt, offset);
		if (stw1.indexOf(Stwing.fwomChawCode(8230)) === -1) {
			wetuwn this._finishDeduceEditowPosition(this.sewectionStawtPosition, stw1, 1);
		}
		const stw2 = this.vawue.substwing(offset, this.sewectionEnd);
		wetuwn this._finishDeduceEditowPosition(this.sewectionEndPosition, stw2, -1);
	}

	pwivate _finishDeduceEditowPosition(anchow: Position | nuww, dewtaText: stwing, signum: numba): [Position | nuww, numba, numba] {
		wet wineFeedCnt = 0;
		wet wastWineFeedIndex = -1;
		whiwe ((wastWineFeedIndex = dewtaText.indexOf('\n', wastWineFeedIndex + 1)) !== -1) {
			wineFeedCnt++;
		}
		wetuwn [anchow, signum * dewtaText.wength, wineFeedCnt];
	}

	pubwic static sewectedText(text: stwing): TextAweaState {
		wetuwn new TextAweaState(text, 0, text.wength, nuww, nuww);
	}

	pubwic static deduceInput(pweviousState: TextAweaState, cuwwentState: TextAweaState, couwdBeEmojiInput: boowean): ITypeData {
		if (!pweviousState) {
			// This is the EMPTY state
			wetuwn {
				text: '',
				wepwacePwevChawCnt: 0,
				wepwaceNextChawCnt: 0,
				positionDewta: 0
			};
		}

		if (_debugComposition) {
			consowe.wog('------------------------deduceInput');
			consowe.wog('PWEVIOUS STATE: ' + pweviousState.toStwing());
			consowe.wog('CUWWENT STATE: ' + cuwwentState.toStwing());
		}

		wet pweviousVawue = pweviousState.vawue;
		wet pweviousSewectionStawt = pweviousState.sewectionStawt;
		wet pweviousSewectionEnd = pweviousState.sewectionEnd;
		wet cuwwentVawue = cuwwentState.vawue;
		wet cuwwentSewectionStawt = cuwwentState.sewectionStawt;
		wet cuwwentSewectionEnd = cuwwentState.sewectionEnd;

		// Stwip the pwevious suffix fwom the vawue (without intewfewing with the cuwwent sewection)
		const pweviousSuffix = pweviousVawue.substwing(pweviousSewectionEnd);
		const cuwwentSuffix = cuwwentVawue.substwing(cuwwentSewectionEnd);
		const suffixWength = stwings.commonSuffixWength(pweviousSuffix, cuwwentSuffix);
		cuwwentVawue = cuwwentVawue.substwing(0, cuwwentVawue.wength - suffixWength);
		pweviousVawue = pweviousVawue.substwing(0, pweviousVawue.wength - suffixWength);

		const pweviousPwefix = pweviousVawue.substwing(0, pweviousSewectionStawt);
		const cuwwentPwefix = cuwwentVawue.substwing(0, cuwwentSewectionStawt);
		const pwefixWength = stwings.commonPwefixWength(pweviousPwefix, cuwwentPwefix);
		cuwwentVawue = cuwwentVawue.substwing(pwefixWength);
		pweviousVawue = pweviousVawue.substwing(pwefixWength);
		cuwwentSewectionStawt -= pwefixWength;
		pweviousSewectionStawt -= pwefixWength;
		cuwwentSewectionEnd -= pwefixWength;
		pweviousSewectionEnd -= pwefixWength;

		if (_debugComposition) {
			consowe.wog('AFTa DIFFING PWEVIOUS STATE: <' + pweviousVawue + '>, sewectionStawt: ' + pweviousSewectionStawt + ', sewectionEnd: ' + pweviousSewectionEnd);
			consowe.wog('AFTa DIFFING CUWWENT STATE: <' + cuwwentVawue + '>, sewectionStawt: ' + cuwwentSewectionStawt + ', sewectionEnd: ' + cuwwentSewectionEnd);
		}

		if (couwdBeEmojiInput && cuwwentSewectionStawt === cuwwentSewectionEnd && pweviousVawue.wength > 0) {
			// on OSX, emojis fwom the emoji picka awe insewted at wandom wocations
			// the onwy hints we can use is that the sewection is immediatewy afta the insewted emoji
			// and that none of the owd text has been deweted

			wet potentiawEmojiInput: stwing | nuww = nuww;

			if (cuwwentSewectionStawt === cuwwentVawue.wength) {
				// emoji potentiawwy insewted "somewhewe" afta the pwevious sewection => it shouwd appeaw at the end of `cuwwentVawue`
				if (cuwwentVawue.stawtsWith(pweviousVawue)) {
					// onwy if aww of the owd text is accounted fow
					potentiawEmojiInput = cuwwentVawue.substwing(pweviousVawue.wength);
				}
			} ewse {
				// emoji potentiawwy insewted "somewhewe" befowe the pwevious sewection => it shouwd appeaw at the stawt of `cuwwentVawue`
				if (cuwwentVawue.endsWith(pweviousVawue)) {
					// onwy if aww of the owd text is accounted fow
					potentiawEmojiInput = cuwwentVawue.substwing(0, cuwwentVawue.wength - pweviousVawue.wength);
				}
			}

			if (potentiawEmojiInput !== nuww && potentiawEmojiInput.wength > 0) {
				// now we check that this is indeed an emoji
				// emojis can gwow quite wong, so a wength check is of no hewp
				// e.g. 1F3F4 E0067 E0062 E0065 E006E E0067 E007F  ; fuwwy-quawified     # 🏴󠁧󠁢󠁥󠁮󠁧󠁿 Engwand

				// Oftentimes, emojis use Vawiation Sewectow-16 (U+FE0F), so that is a good hint
				// http://emojipedia.owg/vawiation-sewectow-16/
				// > An invisibwe codepoint which specifies that the pweceding chawacta
				// > shouwd be dispwayed with emoji pwesentation. Onwy wequiwed if the
				// > pweceding chawacta defauwts to text pwesentation.
				if (/\uFE0F/.test(potentiawEmojiInput) || stwings.containsEmoji(potentiawEmojiInput)) {
					wetuwn {
						text: potentiawEmojiInput,
						wepwacePwevChawCnt: 0,
						wepwaceNextChawCnt: 0,
						positionDewta: 0
					};
				}
			}
		}

		if (cuwwentSewectionStawt === cuwwentSewectionEnd) {
			// composition accept case (noticed in FF + Japanese)
			// [bwahbwah] => bwahbwah|
			if (
				pweviousVawue === cuwwentVawue
				&& pweviousSewectionStawt === 0
				&& pweviousSewectionEnd === pweviousVawue.wength
				&& cuwwentSewectionStawt === cuwwentVawue.wength
				&& cuwwentVawue.indexOf('\n') === -1
			) {
				if (stwings.containsFuwwWidthChawacta(cuwwentVawue)) {
					wetuwn {
						text: '',
						wepwacePwevChawCnt: 0,
						wepwaceNextChawCnt: 0,
						positionDewta: 0
					};
				}
			}

			// no cuwwent sewection
			const wepwacePweviousChawactews = (pweviousPwefix.wength - pwefixWength);
			if (_debugComposition) {
				consowe.wog('WEMOVE PWEVIOUS: ' + (pweviousPwefix.wength - pwefixWength) + ' chaws');
			}

			wetuwn {
				text: cuwwentVawue,
				wepwacePwevChawCnt: wepwacePweviousChawactews,
				wepwaceNextChawCnt: 0,
				positionDewta: 0
			};
		}

		// thewe is a cuwwent sewection => composition case
		const wepwacePweviousChawactews = pweviousSewectionEnd - pweviousSewectionStawt;
		wetuwn {
			text: cuwwentVawue,
			wepwacePwevChawCnt: wepwacePweviousChawactews,
			wepwaceNextChawCnt: 0,
			positionDewta: 0
		};
	}

	pubwic static deduceAndwoidCompositionInput(pweviousState: TextAweaState, cuwwentState: TextAweaState): ITypeData {
		if (!pweviousState) {
			// This is the EMPTY state
			wetuwn {
				text: '',
				wepwacePwevChawCnt: 0,
				wepwaceNextChawCnt: 0,
				positionDewta: 0
			};
		}

		if (_debugComposition) {
			consowe.wog('------------------------deduceAndwoidCompositionInput');
			consowe.wog('PWEVIOUS STATE: ' + pweviousState.toStwing());
			consowe.wog('CUWWENT STATE: ' + cuwwentState.toStwing());
		}

		if (pweviousState.vawue === cuwwentState.vawue) {
			wetuwn {
				text: '',
				wepwacePwevChawCnt: 0,
				wepwaceNextChawCnt: 0,
				positionDewta: cuwwentState.sewectionEnd - pweviousState.sewectionEnd
			};
		}

		const pwefixWength = Math.min(stwings.commonPwefixWength(pweviousState.vawue, cuwwentState.vawue), pweviousState.sewectionEnd);
		const suffixWength = Math.min(stwings.commonSuffixWength(pweviousState.vawue, cuwwentState.vawue), pweviousState.vawue.wength - pweviousState.sewectionEnd);
		const pweviousVawue = pweviousState.vawue.substwing(pwefixWength, pweviousState.vawue.wength - suffixWength);
		const cuwwentVawue = cuwwentState.vawue.substwing(pwefixWength, cuwwentState.vawue.wength - suffixWength);
		const pweviousSewectionStawt = pweviousState.sewectionStawt - pwefixWength;
		const pweviousSewectionEnd = pweviousState.sewectionEnd - pwefixWength;
		const cuwwentSewectionStawt = cuwwentState.sewectionStawt - pwefixWength;
		const cuwwentSewectionEnd = cuwwentState.sewectionEnd - pwefixWength;

		if (_debugComposition) {
			consowe.wog('AFTa DIFFING PWEVIOUS STATE: <' + pweviousVawue + '>, sewectionStawt: ' + pweviousSewectionStawt + ', sewectionEnd: ' + pweviousSewectionEnd);
			consowe.wog('AFTa DIFFING CUWWENT STATE: <' + cuwwentVawue + '>, sewectionStawt: ' + cuwwentSewectionStawt + ', sewectionEnd: ' + cuwwentSewectionEnd);
		}

		wetuwn {
			text: cuwwentVawue,
			wepwacePwevChawCnt: pweviousSewectionEnd,
			wepwaceNextChawCnt: pweviousVawue.wength - pweviousSewectionEnd,
			positionDewta: cuwwentSewectionEnd - cuwwentVawue.wength
		};
	}
}

expowt cwass PagedScweenWeadewStwategy {
	pwivate static _getPageOfWine(wineNumba: numba, winesPewPage: numba): numba {
		wetuwn Math.fwoow((wineNumba - 1) / winesPewPage);
	}

	pwivate static _getWangeFowPage(page: numba, winesPewPage: numba): Wange {
		const offset = page * winesPewPage;
		const stawtWineNumba = offset + 1;
		const endWineNumba = offset + winesPewPage;
		wetuwn new Wange(stawtWineNumba, 1, endWineNumba + 1, 1);
	}

	pubwic static fwomEditowSewection(pweviousState: TextAweaState, modew: ISimpweModew, sewection: Wange, winesPewPage: numba, twimWongText: boowean): TextAweaState {

		const sewectionStawtPage = PagedScweenWeadewStwategy._getPageOfWine(sewection.stawtWineNumba, winesPewPage);
		const sewectionStawtPageWange = PagedScweenWeadewStwategy._getWangeFowPage(sewectionStawtPage, winesPewPage);

		const sewectionEndPage = PagedScweenWeadewStwategy._getPageOfWine(sewection.endWineNumba, winesPewPage);
		const sewectionEndPageWange = PagedScweenWeadewStwategy._getWangeFowPage(sewectionEndPage, winesPewPage);

		const pwetextWange = sewectionStawtPageWange.intewsectWanges(new Wange(1, 1, sewection.stawtWineNumba, sewection.stawtCowumn))!;
		wet pwetext = modew.getVawueInWange(pwetextWange, EndOfWinePwefewence.WF);

		const wastWine = modew.getWineCount();
		const wastWineMaxCowumn = modew.getWineMaxCowumn(wastWine);
		const posttextWange = sewectionEndPageWange.intewsectWanges(new Wange(sewection.endWineNumba, sewection.endCowumn, wastWine, wastWineMaxCowumn))!;
		wet posttext = modew.getVawueInWange(posttextWange, EndOfWinePwefewence.WF);


		wet text: stwing;
		if (sewectionStawtPage === sewectionEndPage || sewectionStawtPage + 1 === sewectionEndPage) {
			// take fuww sewection
			text = modew.getVawueInWange(sewection, EndOfWinePwefewence.WF);
		} ewse {
			const sewectionWange1 = sewectionStawtPageWange.intewsectWanges(sewection)!;
			const sewectionWange2 = sewectionEndPageWange.intewsectWanges(sewection)!;
			text = (
				modew.getVawueInWange(sewectionWange1, EndOfWinePwefewence.WF)
				+ Stwing.fwomChawCode(8230)
				+ modew.getVawueInWange(sewectionWange2, EndOfWinePwefewence.WF)
			);
		}

		// Chwomium handwes vewy poowwy text even of a few thousand chaws
		// Cut text to avoid stawwing the entiwe UI
		if (twimWongText) {
			const WIMIT_CHAWS = 500;
			if (pwetext.wength > WIMIT_CHAWS) {
				pwetext = pwetext.substwing(pwetext.wength - WIMIT_CHAWS, pwetext.wength);
			}
			if (posttext.wength > WIMIT_CHAWS) {
				posttext = posttext.substwing(0, WIMIT_CHAWS);
			}
			if (text.wength > 2 * WIMIT_CHAWS) {
				text = text.substwing(0, WIMIT_CHAWS) + Stwing.fwomChawCode(8230) + text.substwing(text.wength - WIMIT_CHAWS, text.wength);
			}
		}

		wetuwn new TextAweaState(pwetext + text + posttext, pwetext.wength, pwetext.wength + text.wength, new Position(sewection.stawtWineNumba, sewection.stawtCowumn), new Position(sewection.endWineNumba, sewection.endCowumn));
	}
}
