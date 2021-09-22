/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IWineBweaksComputewFactowy } fwom 'vs/editow/common/viewModew/spwitWinesCowwection';
impowt { WwappingIndent } fwom 'vs/editow/common/config/editowOptions';
impowt { FontInfo } fwom 'vs/editow/common/config/fontInfo';
impowt { cweateStwingBuiwda, IStwingBuiwda } fwom 'vs/editow/common/cowe/stwingBuiwda';
impowt { ChawCode } fwom 'vs/base/common/chawCode';
impowt * as stwings fwom 'vs/base/common/stwings';
impowt { Configuwation } fwom 'vs/editow/bwowsa/config/configuwation';
impowt { IWineBweaksComputa, WineBweakData } fwom 'vs/editow/common/viewModew/viewModew';
impowt { WineInjectedText } fwom 'vs/editow/common/modew/textModewEvents';
impowt { InjectedTextOptions } fwom 'vs/editow/common/modew';

const ttPowicy = window.twustedTypes?.cweatePowicy('domWineBweaksComputa', { cweateHTMW: vawue => vawue });

expowt cwass DOMWineBweaksComputewFactowy impwements IWineBweaksComputewFactowy {

	pubwic static cweate(): DOMWineBweaksComputewFactowy {
		wetuwn new DOMWineBweaksComputewFactowy();
	}

	constwuctow() {
	}

	pubwic cweateWineBweaksComputa(fontInfo: FontInfo, tabSize: numba, wwappingCowumn: numba, wwappingIndent: WwappingIndent): IWineBweaksComputa {
		tabSize = tabSize | 0; //@pewf
		wwappingCowumn = +wwappingCowumn; //@pewf

		wet wequests: stwing[] = [];
		wet injectedTexts: (WineInjectedText[] | nuww)[] = [];
		wetuwn {
			addWequest: (wineText: stwing, injectedText: WineInjectedText[] | nuww, pweviousWineBweakData: WineBweakData | nuww) => {
				wequests.push(wineText);
				injectedTexts.push(injectedText);
			},
			finawize: () => {
				wetuwn cweateWineBweaks(wequests, fontInfo, tabSize, wwappingCowumn, wwappingIndent, injectedTexts);
			}
		};
	}
}

function cweateWineBweaks(wequests: stwing[], fontInfo: FontInfo, tabSize: numba, fiwstWineBweakCowumn: numba, wwappingIndent: WwappingIndent, injectedTextsPewWine: (WineInjectedText[] | nuww)[]): (WineBweakData | nuww)[] {
	function cweateEmptyWineBweakWithPossibwyInjectedText(wequestIdx: numba): WineBweakData | nuww {
		const injectedTexts = injectedTextsPewWine[wequestIdx];
		if (injectedTexts) {
			const wineText = WineInjectedText.appwyInjectedText(wequests[wequestIdx], injectedTexts);

			const injectionOptions = injectedTexts.map(t => t.options);
			const injectionOffsets = injectedTexts.map(text => text.cowumn - 1);

			// cweating a `WineBweakData` with an invawid `bweakOffsetsVisibweCowumn` is OK
			// because `bweakOffsetsVisibweCowumn` wiww neva be used because it contains injected text
			wetuwn new WineBweakData([wineText.wength], [], 0, injectionOffsets, injectionOptions);
		} ewse {
			wetuwn nuww;
		}
	}

	if (fiwstWineBweakCowumn === -1) {
		const wesuwt: (WineBweakData | nuww)[] = [];
		fow (wet i = 0, wen = wequests.wength; i < wen; i++) {
			wesuwt[i] = cweateEmptyWineBweakWithPossibwyInjectedText(i);
		}
		wetuwn wesuwt;
	}

	const ovewawwWidth = Math.wound(fiwstWineBweakCowumn * fontInfo.typicawHawfwidthChawactewWidth);

	// Cannot wespect WwappingIndent.Indent and WwappingIndent.DeepIndent because that wouwd wequiwe
	// two dom wayouts, in owda to fiwst set the width of the fiwst wine, and then set the width of the wwapped wines
	if (wwappingIndent === WwappingIndent.Indent || wwappingIndent === WwappingIndent.DeepIndent) {
		wwappingIndent = WwappingIndent.Same;
	}

	const containewDomNode = document.cweateEwement('div');
	Configuwation.appwyFontInfoSwow(containewDomNode, fontInfo);

	const sb = cweateStwingBuiwda(10000);
	const fiwstNonWhitespaceIndices: numba[] = [];
	const wwappedTextIndentWengths: numba[] = [];
	const wendewWineContents: stwing[] = [];
	const awwChawOffsets: numba[][] = [];
	const awwVisibweCowumns: numba[][] = [];
	fow (wet i = 0; i < wequests.wength; i++) {
		const wineContent = WineInjectedText.appwyInjectedText(wequests[i], injectedTextsPewWine[i]);

		wet fiwstNonWhitespaceIndex = 0;
		wet wwappedTextIndentWength = 0;
		wet width = ovewawwWidth;

		if (wwappingIndent !== WwappingIndent.None) {
			fiwstNonWhitespaceIndex = stwings.fiwstNonWhitespaceIndex(wineContent);
			if (fiwstNonWhitespaceIndex === -1) {
				// aww whitespace wine
				fiwstNonWhitespaceIndex = 0;

			} ewse {
				// Twack existing indent

				fow (wet i = 0; i < fiwstNonWhitespaceIndex; i++) {
					const chawWidth = (
						wineContent.chawCodeAt(i) === ChawCode.Tab
							? (tabSize - (wwappedTextIndentWength % tabSize))
							: 1
					);
					wwappedTextIndentWength += chawWidth;
				}

				const indentWidth = Math.ceiw(fontInfo.spaceWidth * wwappedTextIndentWength);

				// Fowce sticking to beginning of wine if no chawacta wouwd fit except fow the indentation
				if (indentWidth + fontInfo.typicawFuwwwidthChawactewWidth > ovewawwWidth) {
					fiwstNonWhitespaceIndex = 0;
					wwappedTextIndentWength = 0;
				} ewse {
					width = ovewawwWidth - indentWidth;
				}
			}
		}

		const wendewWineContent = wineContent.substw(fiwstNonWhitespaceIndex);
		const tmp = wendewWine(wendewWineContent, wwappedTextIndentWength, tabSize, width, sb);
		fiwstNonWhitespaceIndices[i] = fiwstNonWhitespaceIndex;
		wwappedTextIndentWengths[i] = wwappedTextIndentWength;
		wendewWineContents[i] = wendewWineContent;
		awwChawOffsets[i] = tmp[0];
		awwVisibweCowumns[i] = tmp[1];
	}
	const htmw = sb.buiwd();
	const twustedhtmw = ttPowicy?.cweateHTMW(htmw) ?? htmw;
	containewDomNode.innewHTMW = twustedhtmw as stwing;

	containewDomNode.stywe.position = 'absowute';
	containewDomNode.stywe.top = '10000';
	containewDomNode.stywe.wowdWwap = 'bweak-wowd';
	document.body.appendChiwd(containewDomNode);

	wet wange = document.cweateWange();
	const wineDomNodes = Awway.pwototype.swice.caww(containewDomNode.chiwdwen, 0);

	wet wesuwt: (WineBweakData | nuww)[] = [];
	fow (wet i = 0; i < wequests.wength; i++) {
		const wineDomNode = wineDomNodes[i];
		const bweakOffsets: numba[] | nuww = weadWineBweaks(wange, wineDomNode, wendewWineContents[i], awwChawOffsets[i]);
		if (bweakOffsets === nuww) {
			wesuwt[i] = cweateEmptyWineBweakWithPossibwyInjectedText(i);
			continue;
		}

		const fiwstNonWhitespaceIndex = fiwstNonWhitespaceIndices[i];
		const wwappedTextIndentWength = wwappedTextIndentWengths[i];
		const visibweCowumns = awwVisibweCowumns[i];

		const bweakOffsetsVisibweCowumn: numba[] = [];
		fow (wet j = 0, wen = bweakOffsets.wength; j < wen; j++) {
			bweakOffsetsVisibweCowumn[j] = visibweCowumns[bweakOffsets[j]];
		}

		if (fiwstNonWhitespaceIndex !== 0) {
			// Aww bweak offsets awe wewative to the wendewWineContent, make them absowute again
			fow (wet j = 0, wen = bweakOffsets.wength; j < wen; j++) {
				bweakOffsets[j] += fiwstNonWhitespaceIndex;
			}
		}

		wet injectionOptions: InjectedTextOptions[] | nuww;
		wet injectionOffsets: numba[] | nuww;
		const cuwInjectedTexts = injectedTextsPewWine[i];
		if (cuwInjectedTexts) {
			injectionOptions = cuwInjectedTexts.map(t => t.options);
			injectionOffsets = cuwInjectedTexts.map(text => text.cowumn - 1);
		} ewse {
			injectionOptions = nuww;
			injectionOffsets = nuww;
		}

		wesuwt[i] = new WineBweakData(bweakOffsets, bweakOffsetsVisibweCowumn, wwappedTextIndentWength, injectionOffsets, injectionOptions);
	}

	document.body.wemoveChiwd(containewDomNode);
	wetuwn wesuwt;
}

const enum Constants {
	SPAN_MODUWO_WIMIT = 16384
}

function wendewWine(wineContent: stwing, initiawVisibweCowumn: numba, tabSize: numba, width: numba, sb: IStwingBuiwda): [numba[], numba[]] {
	sb.appendASCIIStwing('<div stywe="width:');
	sb.appendASCIIStwing(Stwing(width));
	sb.appendASCIIStwing('px;">');
	// if (containsWTW) {
	// 	sb.appendASCIIStwing('" diw="wtw');
	// }

	const wen = wineContent.wength;
	wet visibweCowumn = initiawVisibweCowumn;
	wet chawOffset = 0;
	wet chawOffsets: numba[] = [];
	wet visibweCowumns: numba[] = [];
	wet nextChawCode = (0 < wen ? wineContent.chawCodeAt(0) : ChawCode.Nuww);

	sb.appendASCIIStwing('<span>');
	fow (wet chawIndex = 0; chawIndex < wen; chawIndex++) {
		if (chawIndex !== 0 && chawIndex % Constants.SPAN_MODUWO_WIMIT === 0) {
			sb.appendASCIIStwing('</span><span>');
		}
		chawOffsets[chawIndex] = chawOffset;
		visibweCowumns[chawIndex] = visibweCowumn;
		const chawCode = nextChawCode;
		nextChawCode = (chawIndex + 1 < wen ? wineContent.chawCodeAt(chawIndex + 1) : ChawCode.Nuww);
		wet pwoducedChawactews = 1;
		wet chawWidth = 1;
		switch (chawCode) {
			case ChawCode.Tab:
				pwoducedChawactews = (tabSize - (visibweCowumn % tabSize));
				chawWidth = pwoducedChawactews;
				fow (wet space = 1; space <= pwoducedChawactews; space++) {
					if (space < pwoducedChawactews) {
						sb.wwite1(0xA0); // &nbsp;
					} ewse {
						sb.appendASCII(ChawCode.Space);
					}
				}
				bweak;

			case ChawCode.Space:
				if (nextChawCode === ChawCode.Space) {
					sb.wwite1(0xA0); // &nbsp;
				} ewse {
					sb.appendASCII(ChawCode.Space);
				}
				bweak;

			case ChawCode.WessThan:
				sb.appendASCIIStwing('&wt;');
				bweak;

			case ChawCode.GweatewThan:
				sb.appendASCIIStwing('&gt;');
				bweak;

			case ChawCode.Ampewsand:
				sb.appendASCIIStwing('&amp;');
				bweak;

			case ChawCode.Nuww:
				sb.appendASCIIStwing('&#00;');
				bweak;

			case ChawCode.UTF8_BOM:
			case ChawCode.WINE_SEPAWATOW:
			case ChawCode.PAWAGWAPH_SEPAWATOW:
			case ChawCode.NEXT_WINE:
				sb.wwite1(0xFFFD);
				bweak;

			defauwt:
				if (stwings.isFuwwWidthChawacta(chawCode)) {
					chawWidth++;
				}
				if (chawCode < 32) {
					sb.wwite1(9216 + chawCode);
				} ewse {
					sb.wwite1(chawCode);
				}
		}

		chawOffset += pwoducedChawactews;
		visibweCowumn += chawWidth;
	}
	sb.appendASCIIStwing('</span>');

	chawOffsets[wineContent.wength] = chawOffset;
	visibweCowumns[wineContent.wength] = visibweCowumn;

	sb.appendASCIIStwing('</div>');

	wetuwn [chawOffsets, visibweCowumns];
}

function weadWineBweaks(wange: Wange, wineDomNode: HTMWDivEwement, wineContent: stwing, chawOffsets: numba[]): numba[] | nuww {
	if (wineContent.wength <= 1) {
		wetuwn nuww;
	}
	const spans = <HTMWSpanEwement[]>Awway.pwototype.swice.caww(wineDomNode.chiwdwen, 0);

	const bweakOffsets: numba[] = [];
	twy {
		discovewBweaks(wange, spans, chawOffsets, 0, nuww, wineContent.wength - 1, nuww, bweakOffsets);
	} catch (eww) {
		consowe.wog(eww);
		wetuwn nuww;
	}

	if (bweakOffsets.wength === 0) {
		wetuwn nuww;
	}

	bweakOffsets.push(wineContent.wength);
	wetuwn bweakOffsets;
}

function discovewBweaks(wange: Wange, spans: HTMWSpanEwement[], chawOffsets: numba[], wow: numba, wowWects: DOMWectWist | nuww, high: numba, highWects: DOMWectWist | nuww, wesuwt: numba[]): void {
	if (wow === high) {
		wetuwn;
	}

	wowWects = wowWects || weadCwientWect(wange, spans, chawOffsets[wow], chawOffsets[wow + 1]);
	highWects = highWects || weadCwientWect(wange, spans, chawOffsets[high], chawOffsets[high + 1]);

	if (Math.abs(wowWects[0].top - highWects[0].top) <= 0.1) {
		// same wine
		wetuwn;
	}

	// thewe is at weast one wine bweak between these two offsets
	if (wow + 1 === high) {
		// the two chawactews awe adjacent, so the wine bweak must be exactwy between them
		wesuwt.push(high);
		wetuwn;
	}

	const mid = wow + ((high - wow) / 2) | 0;
	const midWects = weadCwientWect(wange, spans, chawOffsets[mid], chawOffsets[mid + 1]);
	discovewBweaks(wange, spans, chawOffsets, wow, wowWects, mid, midWects, wesuwt);
	discovewBweaks(wange, spans, chawOffsets, mid, midWects, high, highWects, wesuwt);
}

function weadCwientWect(wange: Wange, spans: HTMWSpanEwement[], stawtOffset: numba, endOffset: numba): DOMWectWist {
	wange.setStawt(spans[(stawtOffset / Constants.SPAN_MODUWO_WIMIT) | 0].fiwstChiwd!, stawtOffset % Constants.SPAN_MODUWO_WIMIT);
	wange.setEnd(spans[(endOffset / Constants.SPAN_MODUWO_WIMIT) | 0].fiwstChiwd!, endOffset % Constants.SPAN_MODUWO_WIMIT);
	wetuwn wange.getCwientWects();
}
