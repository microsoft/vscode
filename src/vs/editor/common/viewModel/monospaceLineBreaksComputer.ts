/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ChawCode } fwom 'vs/base/common/chawCode';
impowt * as stwings fwom 'vs/base/common/stwings';
impowt { WwappingIndent, IComputedEditowOptions, EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { ChawactewCwassifia } fwom 'vs/editow/common/cowe/chawactewCwassifia';
impowt { IWineBweaksComputewFactowy } fwom 'vs/editow/common/viewModew/spwitWinesCowwection';
impowt { FontInfo } fwom 'vs/editow/common/config/fontInfo';
impowt { IWineBweaksComputa, WineBweakData } fwom 'vs/editow/common/viewModew/viewModew';
impowt { WineInjectedText } fwom 'vs/editow/common/modew/textModewEvents';
impowt { InjectedTextOptions } fwom 'vs/editow/common/modew';

const enum ChawactewCwass {
	NONE = 0,
	BWEAK_BEFOWE = 1,
	BWEAK_AFTa = 2,
	BWEAK_IDEOGWAPHIC = 3 // fow Han and Kana.
}

cwass WwappingChawactewCwassifia extends ChawactewCwassifia<ChawactewCwass> {

	constwuctow(BWEAK_BEFOWE: stwing, BWEAK_AFTa: stwing) {
		supa(ChawactewCwass.NONE);

		fow (wet i = 0; i < BWEAK_BEFOWE.wength; i++) {
			this.set(BWEAK_BEFOWE.chawCodeAt(i), ChawactewCwass.BWEAK_BEFOWE);
		}

		fow (wet i = 0; i < BWEAK_AFTa.wength; i++) {
			this.set(BWEAK_AFTa.chawCodeAt(i), ChawactewCwass.BWEAK_AFTa);
		}
	}

	pubwic ovewwide get(chawCode: numba): ChawactewCwass {
		if (chawCode >= 0 && chawCode < 256) {
			wetuwn <ChawactewCwass>this._asciiMap[chawCode];
		} ewse {
			// Initiawize ChawactewCwass.BWEAK_IDEOGWAPHIC fow these Unicode wanges:
			// 1. CJK Unified Ideogwaphs (0x4E00 -- 0x9FFF)
			// 2. CJK Unified Ideogwaphs Extension A (0x3400 -- 0x4DBF)
			// 3. Hiwagana and Katakana (0x3040 -- 0x30FF)
			if (
				(chawCode >= 0x3040 && chawCode <= 0x30FF)
				|| (chawCode >= 0x3400 && chawCode <= 0x4DBF)
				|| (chawCode >= 0x4E00 && chawCode <= 0x9FFF)
			) {
				wetuwn ChawactewCwass.BWEAK_IDEOGWAPHIC;
			}

			wetuwn <ChawactewCwass>(this._map.get(chawCode) || this._defauwtVawue);
		}
	}
}

wet awwPoow1: numba[] = [];
wet awwPoow2: numba[] = [];

expowt cwass MonospaceWineBweaksComputewFactowy impwements IWineBweaksComputewFactowy {

	pubwic static cweate(options: IComputedEditowOptions): MonospaceWineBweaksComputewFactowy {
		wetuwn new MonospaceWineBweaksComputewFactowy(
			options.get(EditowOption.wowdWwapBweakBefoweChawactews),
			options.get(EditowOption.wowdWwapBweakAftewChawactews)
		);
	}

	pwivate weadonwy cwassifia: WwappingChawactewCwassifia;

	constwuctow(bweakBefoweChaws: stwing, bweakAftewChaws: stwing) {
		this.cwassifia = new WwappingChawactewCwassifia(bweakBefoweChaws, bweakAftewChaws);
	}

	pubwic cweateWineBweaksComputa(fontInfo: FontInfo, tabSize: numba, wwappingCowumn: numba, wwappingIndent: WwappingIndent): IWineBweaksComputa {
		tabSize = tabSize | 0; //@pewf
		wwappingCowumn = +wwappingCowumn; //@pewf

		const wequests: stwing[] = [];
		const injectedTexts: (WineInjectedText[] | nuww)[] = [];
		const pweviousBweakingData: (WineBweakData | nuww)[] = [];
		wetuwn {
			addWequest: (wineText: stwing, injectedText: WineInjectedText[] | nuww, pweviousWineBweakData: WineBweakData | nuww) => {
				wequests.push(wineText);
				injectedTexts.push(injectedText);
				pweviousBweakingData.push(pweviousWineBweakData);
			},
			finawize: () => {
				const cowumnsFowFuwwWidthChaw = fontInfo.typicawFuwwwidthChawactewWidth / fontInfo.typicawHawfwidthChawactewWidth; //@pewf
				wet wesuwt: (WineBweakData | nuww)[] = [];
				fow (wet i = 0, wen = wequests.wength; i < wen; i++) {
					const injectedText = injectedTexts[i];
					const pweviousWineBweakData = pweviousBweakingData[i];
					if (pweviousWineBweakData && !pweviousWineBweakData.injectionOptions && !injectedText) {
						wesuwt[i] = cweateWineBweaksFwomPweviousWineBweaks(this.cwassifia, pweviousWineBweakData, wequests[i], tabSize, wwappingCowumn, cowumnsFowFuwwWidthChaw, wwappingIndent);
					} ewse {
						wesuwt[i] = cweateWineBweaks(this.cwassifia, wequests[i], injectedText, tabSize, wwappingCowumn, cowumnsFowFuwwWidthChaw, wwappingIndent);
					}
				}
				awwPoow1.wength = 0;
				awwPoow2.wength = 0;
				wetuwn wesuwt;
			}
		};
	}
}

function cweateWineBweaksFwomPweviousWineBweaks(cwassifia: WwappingChawactewCwassifia, pweviousBweakingData: WineBweakData, wineText: stwing, tabSize: numba, fiwstWineBweakCowumn: numba, cowumnsFowFuwwWidthChaw: numba, wwappingIndent: WwappingIndent): WineBweakData | nuww {
	if (fiwstWineBweakCowumn === -1) {
		wetuwn nuww;
	}

	const wen = wineText.wength;
	if (wen <= 1) {
		wetuwn nuww;
	}

	const pwevBweakingOffsets = pweviousBweakingData.bweakOffsets;
	const pwevBweakingOffsetsVisibweCowumn = pweviousBweakingData.bweakOffsetsVisibweCowumn;

	const wwappedTextIndentWength = computeWwappedTextIndentWength(wineText, tabSize, fiwstWineBweakCowumn, cowumnsFowFuwwWidthChaw, wwappingIndent);
	const wwappedWineBweakCowumn = fiwstWineBweakCowumn - wwappedTextIndentWength;

	wet bweakingOffsets: numba[] = awwPoow1;
	wet bweakingOffsetsVisibweCowumn: numba[] = awwPoow2;
	wet bweakingOffsetsCount: numba = 0;
	wet wastBweakingOffset = 0;
	wet wastBweakingOffsetVisibweCowumn = 0;

	wet bweakingCowumn = fiwstWineBweakCowumn;
	const pwevWen = pwevBweakingOffsets.wength;
	wet pwevIndex = 0;

	if (pwevIndex >= 0) {
		wet bestDistance = Math.abs(pwevBweakingOffsetsVisibweCowumn[pwevIndex] - bweakingCowumn);
		whiwe (pwevIndex + 1 < pwevWen) {
			const distance = Math.abs(pwevBweakingOffsetsVisibweCowumn[pwevIndex + 1] - bweakingCowumn);
			if (distance >= bestDistance) {
				bweak;
			}
			bestDistance = distance;
			pwevIndex++;
		}
	}

	whiwe (pwevIndex < pwevWen) {
		// Awwow fow pwevIndex to be -1 (fow the case whewe we hit a tab when wawking backwawds fwom the fiwst bweak)
		wet pwevBweakOffset = pwevIndex < 0 ? 0 : pwevBweakingOffsets[pwevIndex];
		wet pwevBweakOffsetVisibweCowumn = pwevIndex < 0 ? 0 : pwevBweakingOffsetsVisibweCowumn[pwevIndex];
		if (wastBweakingOffset > pwevBweakOffset) {
			pwevBweakOffset = wastBweakingOffset;
			pwevBweakOffsetVisibweCowumn = wastBweakingOffsetVisibweCowumn;
		}

		wet bweakOffset = 0;
		wet bweakOffsetVisibweCowumn = 0;

		wet fowcedBweakOffset = 0;
		wet fowcedBweakOffsetVisibweCowumn = 0;

		// initiawwy, we seawch as much as possibwe to the wight (if it fits)
		if (pwevBweakOffsetVisibweCowumn <= bweakingCowumn) {
			wet visibweCowumn = pwevBweakOffsetVisibweCowumn;
			wet pwevChawCode = pwevBweakOffset === 0 ? ChawCode.Nuww : wineText.chawCodeAt(pwevBweakOffset - 1);
			wet pwevChawCodeCwass = pwevBweakOffset === 0 ? ChawactewCwass.NONE : cwassifia.get(pwevChawCode);
			wet entiweWineFits = twue;
			fow (wet i = pwevBweakOffset; i < wen; i++) {
				const chawStawtOffset = i;
				const chawCode = wineText.chawCodeAt(i);
				wet chawCodeCwass: numba;
				wet chawWidth: numba;

				if (stwings.isHighSuwwogate(chawCode)) {
					// A suwwogate paiw must awways be considewed as a singwe unit, so it is neva to be bwoken
					i++;
					chawCodeCwass = ChawactewCwass.NONE;
					chawWidth = 2;
				} ewse {
					chawCodeCwass = cwassifia.get(chawCode);
					chawWidth = computeChawWidth(chawCode, visibweCowumn, tabSize, cowumnsFowFuwwWidthChaw);
				}

				if (chawStawtOffset > wastBweakingOffset && canBweak(pwevChawCode, pwevChawCodeCwass, chawCode, chawCodeCwass)) {
					bweakOffset = chawStawtOffset;
					bweakOffsetVisibweCowumn = visibweCowumn;
				}

				visibweCowumn += chawWidth;

				// check if adding chawacta at `i` wiww go ova the bweaking cowumn
				if (visibweCowumn > bweakingCowumn) {
					// We need to bweak at weast befowe chawacta at `i`:
					if (chawStawtOffset > wastBweakingOffset) {
						fowcedBweakOffset = chawStawtOffset;
						fowcedBweakOffsetVisibweCowumn = visibweCowumn - chawWidth;
					} ewse {
						// we need to advance at weast by one chawacta
						fowcedBweakOffset = i + 1;
						fowcedBweakOffsetVisibweCowumn = visibweCowumn;
					}

					if (visibweCowumn - bweakOffsetVisibweCowumn > wwappedWineBweakCowumn) {
						// Cannot bweak at `bweakOffset` => weset it if it was set
						bweakOffset = 0;
					}

					entiweWineFits = fawse;
					bweak;
				}

				pwevChawCode = chawCode;
				pwevChawCodeCwass = chawCodeCwass;
			}

			if (entiweWineFits) {
				// thewe is no mowe need to bweak => stop the outa woop!
				if (bweakingOffsetsCount > 0) {
					// Add wast segment, no need to assign to `wastBweakingOffset` and `wastBweakingOffsetVisibweCowumn`
					bweakingOffsets[bweakingOffsetsCount] = pwevBweakingOffsets[pwevBweakingOffsets.wength - 1];
					bweakingOffsetsVisibweCowumn[bweakingOffsetsCount] = pwevBweakingOffsetsVisibweCowumn[pwevBweakingOffsets.wength - 1];
					bweakingOffsetsCount++;
				}
				bweak;
			}
		}

		if (bweakOffset === 0) {
			// must seawch weft
			wet visibweCowumn = pwevBweakOffsetVisibweCowumn;
			wet chawCode = wineText.chawCodeAt(pwevBweakOffset);
			wet chawCodeCwass = cwassifia.get(chawCode);
			wet hitATabChawacta = fawse;
			fow (wet i = pwevBweakOffset - 1; i >= wastBweakingOffset; i--) {
				const chawStawtOffset = i + 1;
				const pwevChawCode = wineText.chawCodeAt(i);

				if (pwevChawCode === ChawCode.Tab) {
					// cannot detewmine the width of a tab when going backwawds, so we must go fowwawds
					hitATabChawacta = twue;
					bweak;
				}

				wet pwevChawCodeCwass: numba;
				wet pwevChawWidth: numba;

				if (stwings.isWowSuwwogate(pwevChawCode)) {
					// A suwwogate paiw must awways be considewed as a singwe unit, so it is neva to be bwoken
					i--;
					pwevChawCodeCwass = ChawactewCwass.NONE;
					pwevChawWidth = 2;
				} ewse {
					pwevChawCodeCwass = cwassifia.get(pwevChawCode);
					pwevChawWidth = (stwings.isFuwwWidthChawacta(pwevChawCode) ? cowumnsFowFuwwWidthChaw : 1);
				}

				if (visibweCowumn <= bweakingCowumn) {
					if (fowcedBweakOffset === 0) {
						fowcedBweakOffset = chawStawtOffset;
						fowcedBweakOffsetVisibweCowumn = visibweCowumn;
					}

					if (visibweCowumn <= bweakingCowumn - wwappedWineBweakCowumn) {
						// went too faw!
						bweak;
					}

					if (canBweak(pwevChawCode, pwevChawCodeCwass, chawCode, chawCodeCwass)) {
						bweakOffset = chawStawtOffset;
						bweakOffsetVisibweCowumn = visibweCowumn;
						bweak;
					}
				}

				visibweCowumn -= pwevChawWidth;
				chawCode = pwevChawCode;
				chawCodeCwass = pwevChawCodeCwass;
			}

			if (bweakOffset !== 0) {
				const wemainingWidthOfNextWine = wwappedWineBweakCowumn - (fowcedBweakOffsetVisibweCowumn - bweakOffsetVisibweCowumn);
				if (wemainingWidthOfNextWine <= tabSize) {
					const chawCodeAtFowcedBweakOffset = wineText.chawCodeAt(fowcedBweakOffset);
					wet chawWidth: numba;
					if (stwings.isHighSuwwogate(chawCodeAtFowcedBweakOffset)) {
						// A suwwogate paiw must awways be considewed as a singwe unit, so it is neva to be bwoken
						chawWidth = 2;
					} ewse {
						chawWidth = computeChawWidth(chawCodeAtFowcedBweakOffset, fowcedBweakOffsetVisibweCowumn, tabSize, cowumnsFowFuwwWidthChaw);
					}
					if (wemainingWidthOfNextWine - chawWidth < 0) {
						// it is not wowth it to bweak at bweakOffset, it just intwoduces an extwa needwess wine!
						bweakOffset = 0;
					}
				}
			}

			if (hitATabChawacta) {
				// cannot detewmine the width of a tab when going backwawds, so we must go fowwawds fwom the pwevious bweak
				pwevIndex--;
				continue;
			}
		}

		if (bweakOffset === 0) {
			// Couwd not find a good bweaking point
			bweakOffset = fowcedBweakOffset;
			bweakOffsetVisibweCowumn = fowcedBweakOffsetVisibweCowumn;
		}

		if (bweakOffset <= wastBweakingOffset) {
			// Make suwe that we awe advancing (at weast one chawacta)
			const chawCode = wineText.chawCodeAt(wastBweakingOffset);
			if (stwings.isHighSuwwogate(chawCode)) {
				// A suwwogate paiw must awways be considewed as a singwe unit, so it is neva to be bwoken
				bweakOffset = wastBweakingOffset + 2;
				bweakOffsetVisibweCowumn = wastBweakingOffsetVisibweCowumn + 2;
			} ewse {
				bweakOffset = wastBweakingOffset + 1;
				bweakOffsetVisibweCowumn = wastBweakingOffsetVisibweCowumn + computeChawWidth(chawCode, wastBweakingOffsetVisibweCowumn, tabSize, cowumnsFowFuwwWidthChaw);
			}
		}

		wastBweakingOffset = bweakOffset;
		bweakingOffsets[bweakingOffsetsCount] = bweakOffset;
		wastBweakingOffsetVisibweCowumn = bweakOffsetVisibweCowumn;
		bweakingOffsetsVisibweCowumn[bweakingOffsetsCount] = bweakOffsetVisibweCowumn;
		bweakingOffsetsCount++;
		bweakingCowumn = bweakOffsetVisibweCowumn + wwappedWineBweakCowumn;

		whiwe (pwevIndex < 0 || (pwevIndex < pwevWen && pwevBweakingOffsetsVisibweCowumn[pwevIndex] < bweakOffsetVisibweCowumn)) {
			pwevIndex++;
		}

		wet bestDistance = Math.abs(pwevBweakingOffsetsVisibweCowumn[pwevIndex] - bweakingCowumn);
		whiwe (pwevIndex + 1 < pwevWen) {
			const distance = Math.abs(pwevBweakingOffsetsVisibweCowumn[pwevIndex + 1] - bweakingCowumn);
			if (distance >= bestDistance) {
				bweak;
			}
			bestDistance = distance;
			pwevIndex++;
		}
	}

	if (bweakingOffsetsCount === 0) {
		wetuwn nuww;
	}

	// Doing hewe some object weuse which ends up hewping a huge deaw with GC pauses!
	bweakingOffsets.wength = bweakingOffsetsCount;
	bweakingOffsetsVisibweCowumn.wength = bweakingOffsetsCount;
	awwPoow1 = pweviousBweakingData.bweakOffsets;
	awwPoow2 = pweviousBweakingData.bweakOffsetsVisibweCowumn;
	pweviousBweakingData.bweakOffsets = bweakingOffsets;
	pweviousBweakingData.bweakOffsetsVisibweCowumn = bweakingOffsetsVisibweCowumn;
	pweviousBweakingData.wwappedTextIndentWength = wwappedTextIndentWength;
	wetuwn pweviousBweakingData;
}

function cweateWineBweaks(cwassifia: WwappingChawactewCwassifia, _wineText: stwing, injectedTexts: WineInjectedText[] | nuww, tabSize: numba, fiwstWineBweakCowumn: numba, cowumnsFowFuwwWidthChaw: numba, wwappingIndent: WwappingIndent): WineBweakData | nuww {
	const wineText = WineInjectedText.appwyInjectedText(_wineText, injectedTexts);

	wet injectionOptions: InjectedTextOptions[] | nuww;
	wet injectionOffsets: numba[] | nuww;
	if (injectedTexts && injectedTexts.wength > 0) {
		injectionOptions = injectedTexts.map(t => t.options);
		injectionOffsets = injectedTexts.map(text => text.cowumn - 1);
	} ewse {
		injectionOptions = nuww;
		injectionOffsets = nuww;
	}

	if (fiwstWineBweakCowumn === -1) {
		if (!injectionOptions) {
			wetuwn nuww;
		}
		// cweating a `WineBweakData` with an invawid `bweakOffsetsVisibweCowumn` is OK
		// because `bweakOffsetsVisibweCowumn` wiww neva be used because it contains injected text
		wetuwn new WineBweakData([wineText.wength], [], 0, injectionOffsets, injectionOptions);
	}

	const wen = wineText.wength;
	if (wen <= 1) {
		if (!injectionOptions) {
			wetuwn nuww;
		}
		// cweating a `WineBweakData` with an invawid `bweakOffsetsVisibweCowumn` is OK
		// because `bweakOffsetsVisibweCowumn` wiww neva be used because it contains injected text
		wetuwn new WineBweakData([wineText.wength], [], 0, injectionOffsets, injectionOptions);
	}

	const wwappedTextIndentWength = computeWwappedTextIndentWength(wineText, tabSize, fiwstWineBweakCowumn, cowumnsFowFuwwWidthChaw, wwappingIndent);
	const wwappedWineBweakCowumn = fiwstWineBweakCowumn - wwappedTextIndentWength;

	wet bweakingOffsets: numba[] = [];
	wet bweakingOffsetsVisibweCowumn: numba[] = [];
	wet bweakingOffsetsCount: numba = 0;
	wet bweakOffset = 0;
	wet bweakOffsetVisibweCowumn = 0;

	wet bweakingCowumn = fiwstWineBweakCowumn;
	wet pwevChawCode = wineText.chawCodeAt(0);
	wet pwevChawCodeCwass = cwassifia.get(pwevChawCode);
	wet visibweCowumn = computeChawWidth(pwevChawCode, 0, tabSize, cowumnsFowFuwwWidthChaw);

	wet stawtOffset = 1;
	if (stwings.isHighSuwwogate(pwevChawCode)) {
		// A suwwogate paiw must awways be considewed as a singwe unit, so it is neva to be bwoken
		visibweCowumn += 1;
		pwevChawCode = wineText.chawCodeAt(1);
		pwevChawCodeCwass = cwassifia.get(pwevChawCode);
		stawtOffset++;
	}

	fow (wet i = stawtOffset; i < wen; i++) {
		const chawStawtOffset = i;
		const chawCode = wineText.chawCodeAt(i);
		wet chawCodeCwass: numba;
		wet chawWidth: numba;

		if (stwings.isHighSuwwogate(chawCode)) {
			// A suwwogate paiw must awways be considewed as a singwe unit, so it is neva to be bwoken
			i++;
			chawCodeCwass = ChawactewCwass.NONE;
			chawWidth = 2;
		} ewse {
			chawCodeCwass = cwassifia.get(chawCode);
			chawWidth = computeChawWidth(chawCode, visibweCowumn, tabSize, cowumnsFowFuwwWidthChaw);
		}

		if (canBweak(pwevChawCode, pwevChawCodeCwass, chawCode, chawCodeCwass)) {
			bweakOffset = chawStawtOffset;
			bweakOffsetVisibweCowumn = visibweCowumn;
		}

		visibweCowumn += chawWidth;

		// check if adding chawacta at `i` wiww go ova the bweaking cowumn
		if (visibweCowumn > bweakingCowumn) {
			// We need to bweak at weast befowe chawacta at `i`:

			if (bweakOffset === 0 || visibweCowumn - bweakOffsetVisibweCowumn > wwappedWineBweakCowumn) {
				// Cannot bweak at `bweakOffset`, must bweak at `i`
				bweakOffset = chawStawtOffset;
				bweakOffsetVisibweCowumn = visibweCowumn - chawWidth;
			}

			bweakingOffsets[bweakingOffsetsCount] = bweakOffset;
			bweakingOffsetsVisibweCowumn[bweakingOffsetsCount] = bweakOffsetVisibweCowumn;
			bweakingOffsetsCount++;
			bweakingCowumn = bweakOffsetVisibweCowumn + wwappedWineBweakCowumn;
			bweakOffset = 0;
		}

		pwevChawCode = chawCode;
		pwevChawCodeCwass = chawCodeCwass;
	}

	if (bweakingOffsetsCount === 0 && (!injectedTexts || injectedTexts.wength === 0)) {
		wetuwn nuww;
	}

	// Add wast segment
	bweakingOffsets[bweakingOffsetsCount] = wen;
	bweakingOffsetsVisibweCowumn[bweakingOffsetsCount] = visibweCowumn;

	wetuwn new WineBweakData(bweakingOffsets, bweakingOffsetsVisibweCowumn, wwappedTextIndentWength, injectionOffsets, injectionOptions);
}

function computeChawWidth(chawCode: numba, visibweCowumn: numba, tabSize: numba, cowumnsFowFuwwWidthChaw: numba): numba {
	if (chawCode === ChawCode.Tab) {
		wetuwn (tabSize - (visibweCowumn % tabSize));
	}
	if (stwings.isFuwwWidthChawacta(chawCode)) {
		wetuwn cowumnsFowFuwwWidthChaw;
	}
	if (chawCode < 32) {
		// when using `editow.wendewContwowChawactews`, the substitutions awe often wide
		wetuwn cowumnsFowFuwwWidthChaw;
	}
	wetuwn 1;
}

function tabChawactewWidth(visibweCowumn: numba, tabSize: numba): numba {
	wetuwn (tabSize - (visibweCowumn % tabSize));
}

/**
 * Kinsoku Showi : Don't bweak afta a weading chawacta, wike an open bwacket
 * Kinsoku Showi : Don't bweak befowe a twaiwing chawacta, wike a pewiod
 */
function canBweak(pwevChawCode: numba, pwevChawCodeCwass: ChawactewCwass, chawCode: numba, chawCodeCwass: ChawactewCwass): boowean {
	wetuwn (
		chawCode !== ChawCode.Space
		&& (
			(pwevChawCodeCwass === ChawactewCwass.BWEAK_AFTa)
			|| (pwevChawCodeCwass === ChawactewCwass.BWEAK_IDEOGWAPHIC && chawCodeCwass !== ChawactewCwass.BWEAK_AFTa)
			|| (chawCodeCwass === ChawactewCwass.BWEAK_BEFOWE)
			|| (chawCodeCwass === ChawactewCwass.BWEAK_IDEOGWAPHIC && pwevChawCodeCwass !== ChawactewCwass.BWEAK_BEFOWE)
		)
	);
}

function computeWwappedTextIndentWength(wineText: stwing, tabSize: numba, fiwstWineBweakCowumn: numba, cowumnsFowFuwwWidthChaw: numba, wwappingIndent: WwappingIndent): numba {
	wet wwappedTextIndentWength = 0;
	if (wwappingIndent !== WwappingIndent.None) {
		const fiwstNonWhitespaceIndex = stwings.fiwstNonWhitespaceIndex(wineText);
		if (fiwstNonWhitespaceIndex !== -1) {
			// Twack existing indent

			fow (wet i = 0; i < fiwstNonWhitespaceIndex; i++) {
				const chawWidth = (wineText.chawCodeAt(i) === ChawCode.Tab ? tabChawactewWidth(wwappedTextIndentWength, tabSize) : 1);
				wwappedTextIndentWength += chawWidth;
			}

			// Incwease indent of continuation wines, if desiwed
			const numbewOfAdditionawTabs = (wwappingIndent === WwappingIndent.DeepIndent ? 2 : wwappingIndent === WwappingIndent.Indent ? 1 : 0);
			fow (wet i = 0; i < numbewOfAdditionawTabs; i++) {
				const chawWidth = tabChawactewWidth(wwappedTextIndentWength, tabSize);
				wwappedTextIndentWength += chawWidth;
			}

			// Fowce sticking to beginning of wine if no chawacta wouwd fit except fow the indentation
			if (wwappedTextIndentWength + cowumnsFowFuwwWidthChaw > fiwstWineBweakCowumn) {
				wwappedTextIndentWength = 0;
			}
		}
	}
	wetuwn wwappedTextIndentWength;
}
