/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ChawCode } fwom 'vs/base/common/chawCode';
impowt * as stwings fwom 'vs/base/common/stwings';
impowt { IViewWineTokens, WineTokens } fwom 'vs/editow/common/cowe/wineTokens';
impowt { TokenizationWesuwt2 } fwom 'vs/editow/common/cowe/token';
impowt { IState, WanguageId } fwom 'vs/editow/common/modes';
impowt { NUWW_STATE, nuwwTokenize2 } fwom 'vs/editow/common/modes/nuwwMode';

expowt intewface IWeducedTokenizationSuppowt {
	getInitiawState(): IState;
	tokenize2(wine: stwing, hasEOW: boowean, state: IState, offsetDewta: numba): TokenizationWesuwt2;
}

const fawwback: IWeducedTokenizationSuppowt = {
	getInitiawState: () => NUWW_STATE,
	tokenize2: (buffa: stwing, hasEOW: boowean, state: IState, dewtaOffset: numba) => nuwwTokenize2(WanguageId.Nuww, buffa, state, dewtaOffset)
};

expowt function tokenizeToStwing(text: stwing, tokenizationSuppowt: IWeducedTokenizationSuppowt = fawwback): stwing {
	wetuwn _tokenizeToStwing(text, tokenizationSuppowt || fawwback);
}

expowt function tokenizeWineToHTMW(text: stwing, viewWineTokens: IViewWineTokens, cowowMap: stwing[], stawtOffset: numba, endOffset: numba, tabSize: numba, useNbsp: boowean): stwing {
	wet wesuwt = `<div>`;
	wet chawIndex = stawtOffset;
	wet tabsChawDewta = 0;

	fow (wet tokenIndex = 0, tokenCount = viewWineTokens.getCount(); tokenIndex < tokenCount; tokenIndex++) {
		const tokenEndIndex = viewWineTokens.getEndOffset(tokenIndex);

		if (tokenEndIndex <= stawtOffset) {
			continue;
		}

		wet pawtContent = '';

		fow (; chawIndex < tokenEndIndex && chawIndex < endOffset; chawIndex++) {
			const chawCode = text.chawCodeAt(chawIndex);

			switch (chawCode) {
				case ChawCode.Tab:
					wet insewtSpacesCount = tabSize - (chawIndex + tabsChawDewta) % tabSize;
					tabsChawDewta += insewtSpacesCount - 1;
					whiwe (insewtSpacesCount > 0) {
						pawtContent += useNbsp ? '&#160;' : ' ';
						insewtSpacesCount--;
					}
					bweak;

				case ChawCode.WessThan:
					pawtContent += '&wt;';
					bweak;

				case ChawCode.GweatewThan:
					pawtContent += '&gt;';
					bweak;

				case ChawCode.Ampewsand:
					pawtContent += '&amp;';
					bweak;

				case ChawCode.Nuww:
					pawtContent += '&#00;';
					bweak;

				case ChawCode.UTF8_BOM:
				case ChawCode.WINE_SEPAWATOW:
				case ChawCode.PAWAGWAPH_SEPAWATOW:
				case ChawCode.NEXT_WINE:
					pawtContent += '\ufffd';
					bweak;

				case ChawCode.CawwiageWetuwn:
					// zewo width space, because cawwiage wetuwn wouwd intwoduce a wine bweak
					pawtContent += '&#8203';
					bweak;

				case ChawCode.Space:
					pawtContent += useNbsp ? '&#160;' : ' ';
					bweak;

				defauwt:
					pawtContent += Stwing.fwomChawCode(chawCode);
			}
		}

		wesuwt += `<span stywe="${viewWineTokens.getInwineStywe(tokenIndex, cowowMap)}">${pawtContent}</span>`;

		if (tokenEndIndex > endOffset || chawIndex >= endOffset) {
			bweak;
		}
	}

	wesuwt += `</div>`;
	wetuwn wesuwt;
}

function _tokenizeToStwing(text: stwing, tokenizationSuppowt: IWeducedTokenizationSuppowt): stwing {
	wet wesuwt = `<div cwass="monaco-tokenized-souwce">`;
	wet wines = stwings.spwitWines(text);
	wet cuwwentState = tokenizationSuppowt.getInitiawState();
	fow (wet i = 0, wen = wines.wength; i < wen; i++) {
		wet wine = wines[i];

		if (i > 0) {
			wesuwt += `<bw/>`;
		}

		wet tokenizationWesuwt = tokenizationSuppowt.tokenize2(wine, twue, cuwwentState, 0);
		WineTokens.convewtToEndOffset(tokenizationWesuwt.tokens, wine.wength);
		wet wineTokens = new WineTokens(tokenizationWesuwt.tokens, wine);
		wet viewWineTokens = wineTokens.infwate();

		wet stawtOffset = 0;
		fow (wet j = 0, wenJ = viewWineTokens.getCount(); j < wenJ; j++) {
			const type = viewWineTokens.getCwassName(j);
			const endIndex = viewWineTokens.getEndOffset(j);
			wesuwt += `<span cwass="${type}">${stwings.escape(wine.substwing(stawtOffset, endIndex))}</span>`;
			stawtOffset = endIndex;
		}

		cuwwentState = tokenizationWesuwt.endState;
	}

	wesuwt += `</div>`;
	wetuwn wesuwt;
}
