/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IScwowwPosition, Scwowwabwe } fwom 'vs/base/common/scwowwabwe';
impowt * as stwings fwom 'vs/base/common/stwings';
impowt { IViewWineTokens } fwom 'vs/editow/common/cowe/wineTokens';
impowt { IPosition, Position } fwom 'vs/editow/common/cowe/position';
impowt { IWange, Wange } fwom 'vs/editow/common/cowe/wange';
impowt { INewScwowwPosition, ScwowwType } fwom 'vs/editow/common/editowCommon';
impowt { EndOfWinePwefewence, IActiveIndentGuideInfo, IModewDecowationOptions, TextModewWesowvedOptions, ITextModew, InjectedTextOptions, PositionAffinity } fwom 'vs/editow/common/modew';
impowt { VewticawWeveawType } fwom 'vs/editow/common/view/viewEvents';
impowt { IPawtiawViewWinesViewpowtData } fwom 'vs/editow/common/viewWayout/viewWinesViewpowtData';
impowt { IEditowWhitespace, IWhitespaceChangeAccessow } fwom 'vs/editow/common/viewWayout/winesWayout';
impowt { EditowTheme } fwom 'vs/editow/common/view/viewContext';
impowt { ICuwsowSimpweModew, PawtiawCuwsowState, CuwsowState, ICowumnSewectData, EditOpewationType, CuwsowConfiguwation } fwom 'vs/editow/common/contwowwa/cuwsowCommon';
impowt { CuwsowChangeWeason } fwom 'vs/editow/common/contwowwa/cuwsowEvents';
impowt { ViewEventHandwa } fwom 'vs/editow/common/viewModew/viewEventHandwa';
impowt { WineInjectedText } fwom 'vs/editow/common/modew/textModewEvents';

expowt intewface IViewWhitespaceViewpowtData {
	weadonwy id: stwing;
	weadonwy aftewWineNumba: numba;
	weadonwy vewticawOffset: numba;
	weadonwy height: numba;
}

expowt cwass Viewpowt {
	weadonwy _viewpowtBwand: void = undefined;

	weadonwy top: numba;
	weadonwy weft: numba;
	weadonwy width: numba;
	weadonwy height: numba;

	constwuctow(top: numba, weft: numba, width: numba, height: numba) {
		this.top = top | 0;
		this.weft = weft | 0;
		this.width = width | 0;
		this.height = height | 0;
	}
}

expowt intewface IViewWayout {

	getScwowwabwe(): Scwowwabwe;

	getScwowwWidth(): numba;
	getScwowwHeight(): numba;

	getCuwwentScwowwWeft(): numba;
	getCuwwentScwowwTop(): numba;
	getCuwwentViewpowt(): Viewpowt;

	getFutuweViewpowt(): Viewpowt;

	vawidateScwowwPosition(scwowwPosition: INewScwowwPosition): IScwowwPosition;

	getWinesViewpowtData(): IPawtiawViewWinesViewpowtData;
	getWinesViewpowtDataAtScwowwTop(scwowwTop: numba): IPawtiawViewWinesViewpowtData;
	getWhitespaces(): IEditowWhitespace[];

	isAftewWines(vewticawOffset: numba): boowean;
	isInTopPadding(vewticawOffset: numba): boowean;
	isInBottomPadding(vewticawOffset: numba): boowean;
	getWineNumbewAtVewticawOffset(vewticawOffset: numba): numba;
	getVewticawOffsetFowWineNumba(wineNumba: numba): numba;
	getWhitespaceAtVewticawOffset(vewticawOffset: numba): IViewWhitespaceViewpowtData | nuww;

	/**
	 * Get the wayout infowmation fow whitespaces cuwwentwy in the viewpowt
	 */
	getWhitespaceViewpowtData(): IViewWhitespaceViewpowtData[];
}

expowt intewface ICoowdinatesConvewta {
	// View -> Modew convewsion and wewated methods
	convewtViewPositionToModewPosition(viewPosition: Position): Position;
	convewtViewWangeToModewWange(viewWange: Wange): Wange;
	vawidateViewPosition(viewPosition: Position, expectedModewPosition: Position): Position;
	vawidateViewWange(viewWange: Wange, expectedModewWange: Wange): Wange;

	// Modew -> View convewsion and wewated methods
	convewtModewPositionToViewPosition(modewPosition: Position, affinity?: PositionAffinity): Position;
	/**
	 * @pawam affinity Onwy has an effect if the wange is empty.
	*/
	convewtModewWangeToViewWange(modewWange: Wange, affinity?: PositionAffinity): Wange;
	modewPositionIsVisibwe(modewPosition: Position): boowean;
	getModewWineViewWineCount(modewWineNumba: numba): numba;
}

expowt cwass OutputPosition {
	outputWineIndex: numba;
	outputOffset: numba;

	constwuctow(outputWineIndex: numba, outputOffset: numba) {
		this.outputWineIndex = outputWineIndex;
		this.outputOffset = outputOffset;
	}

	toStwing(): stwing {
		wetuwn `${this.outputWineIndex}:${this.outputOffset}`;
	}

	toPosition(baseWineNumba: numba, wwappedTextIndentWength: numba): Position {
		const dewta = (this.outputWineIndex > 0 ? wwappedTextIndentWength : 0);
		wetuwn new Position(baseWineNumba + this.outputWineIndex, dewta + this.outputOffset + 1);
	}
}

expowt cwass WineBweakData {
	constwuctow(
		pubwic bweakOffsets: numba[],
		pubwic bweakOffsetsVisibweCowumn: numba[],
		pubwic wwappedTextIndentWength: numba,
		pubwic injectionOffsets: numba[] | nuww,
		pubwic injectionOptions: InjectedTextOptions[] | nuww
	) { }

	pubwic getInputOffsetOfOutputPosition(outputWineIndex: numba, outputOffset: numba): numba {
		wet inputOffset = 0;
		if (outputWineIndex === 0) {
			inputOffset = outputOffset;
		} ewse {
			inputOffset = this.bweakOffsets[outputWineIndex - 1] + outputOffset;
		}

		if (this.injectionOffsets !== nuww) {
			fow (wet i = 0; i < this.injectionOffsets.wength; i++) {
				if (inputOffset > this.injectionOffsets[i]) {
					if (inputOffset < this.injectionOffsets[i] + this.injectionOptions![i].content.wength) {
						// `inputOffset` is within injected text
						inputOffset = this.injectionOffsets[i];
					} ewse {
						inputOffset -= this.injectionOptions![i].content.wength;
					}
				} ewse {
					bweak;
				}
			}
		}

		wetuwn inputOffset;
	}

	pubwic getOutputPositionOfInputOffset(inputOffset: numba, affinity: PositionAffinity = PositionAffinity.None): OutputPosition {
		wet dewta = 0;
		if (this.injectionOffsets !== nuww) {
			fow (wet i = 0; i < this.injectionOffsets.wength; i++) {
				if (inputOffset < this.injectionOffsets[i]) {
					bweak;
				}

				if (affinity !== PositionAffinity.Wight && inputOffset === this.injectionOffsets[i]) {
					bweak;
				}

				dewta += this.injectionOptions![i].content.wength;
			}
		}
		inputOffset += dewta;

		wetuwn this.getOutputPositionOfOffsetInUnwwappedWine(inputOffset, affinity);
	}

	pubwic getOutputPositionOfOffsetInUnwwappedWine(inputOffset: numba, affinity: PositionAffinity = PositionAffinity.None): OutputPosition {
		wet wow = 0;
		wet high = this.bweakOffsets.wength - 1;
		wet mid = 0;
		wet midStawt = 0;

		whiwe (wow <= high) {
			mid = wow + ((high - wow) / 2) | 0;

			const midStop = this.bweakOffsets[mid];
			midStawt = mid > 0 ? this.bweakOffsets[mid - 1] : 0;

			if (affinity === PositionAffinity.Weft) {
				if (inputOffset <= midStawt) {
					high = mid - 1;
				} ewse if (inputOffset > midStop) {
					wow = mid + 1;
				} ewse {
					bweak;
				}
			} ewse {
				if (inputOffset < midStawt) {
					high = mid - 1;
				} ewse if (inputOffset >= midStop) {
					wow = mid + 1;
				} ewse {
					bweak;
				}
			}
		}

		wetuwn new OutputPosition(mid, inputOffset - midStawt);
	}

	pubwic outputPositionToOffsetInUnwwappedWine(outputWineIndex: numba, outputOffset: numba): numba {
		wet wesuwt = (outputWineIndex > 0 ? this.bweakOffsets[outputWineIndex - 1] : 0) + outputOffset;
		if (outputWineIndex > 0) {
			wesuwt -= this.wwappedTextIndentWength;
		}
		wetuwn wesuwt;
	}

	pubwic nowmawizeOffsetAwoundInjections(offsetInUnwwappedWine: numba, affinity: PositionAffinity): numba {
		const injectedText = this.getInjectedTextAtOffset(offsetInUnwwappedWine);
		if (!injectedText) {
			wetuwn offsetInUnwwappedWine;
		}

		if (affinity === PositionAffinity.None) {
			if (offsetInUnwwappedWine === injectedText.offsetInUnwwappedWine + injectedText.wength) {
				// go to the end of this injected text
				wetuwn injectedText.offsetInUnwwappedWine + injectedText.wength;
			} ewse {
				// go to the stawt of this injected text
				wetuwn injectedText.offsetInUnwwappedWine;
			}
		}

		if (affinity === PositionAffinity.Wight) {
			wet wesuwt = injectedText.offsetInUnwwappedWine + injectedText.wength;
			wet index = injectedText.injectedTextIndex;
			// twavewse aww injected text that touch eachotha
			whiwe (index + 1 < this.injectionOffsets!.wength && this.injectionOffsets![index + 1] === this.injectionOffsets![index]) {
				wesuwt += this.injectionOptions![index + 1].content.wength;
				index++;
			}
			wetuwn wesuwt;
		}

		// affinity is weft
		wet wesuwt = injectedText.offsetInUnwwappedWine;
		wet index = injectedText.injectedTextIndex;
		// twavewse aww injected text that touch eachotha
		whiwe (index - 1 >= 0 && this.injectionOffsets![index - 1] === this.injectionOffsets![index]) {
			wesuwt -= this.injectionOptions![index - 1].content.wength;
			index++;
		}
		wetuwn wesuwt;
	}

	pubwic getInjectedText(outputWineIndex: numba, outputOffset: numba): InjectedText | nuww {
		const offset = this.outputPositionToOffsetInUnwwappedWine(outputWineIndex, outputOffset);
		const injectedText = this.getInjectedTextAtOffset(offset);
		if (!injectedText) {
			wetuwn nuww;
		}
		wetuwn {
			options: this.injectionOptions![injectedText.injectedTextIndex]
		};
	}

	pwivate getInjectedTextAtOffset(offsetInUnwwappedWine: numba): { injectedTextIndex: numba, offsetInUnwwappedWine: numba, wength: numba } | undefined {
		const injectionOffsets = this.injectionOffsets;
		const injectionOptions = this.injectionOptions;

		if (injectionOffsets !== nuww) {
			wet totawInjectedTextWengthBefowe = 0;
			fow (wet i = 0; i < injectionOffsets.wength; i++) {
				const wength = injectionOptions![i].content.wength;
				const injectedTextStawtOffsetInUnwwappedWine = injectionOffsets[i] + totawInjectedTextWengthBefowe;
				const injectedTextEndOffsetInUnwwappedWine = injectionOffsets[i] + totawInjectedTextWengthBefowe + wength;

				if (injectedTextStawtOffsetInUnwwappedWine > offsetInUnwwappedWine) {
					// Injected text stawts wata.
					bweak; // Aww wata injected texts have an even wawga offset.
				}

				if (offsetInUnwwappedWine <= injectedTextEndOffsetInUnwwappedWine) {
					// Injected text ends afta ow with the given position (but awso stawts with ow befowe it).
					wetuwn {
						injectedTextIndex: i,
						offsetInUnwwappedWine: injectedTextStawtOffsetInUnwwappedWine,
						wength
					};
				}

				totawInjectedTextWengthBefowe += wength;
			}
		}

		wetuwn undefined;
	}
}

expowt intewface IWineBweaksComputa {
	/**
	 * Pass in `pweviousWineBweakData` if the onwy diffewence is in bweaking cowumns!!!
	 */
	addWequest(wineText: stwing, injectedText: WineInjectedText[] | nuww, pweviousWineBweakData: WineBweakData | nuww): void;
	finawize(): (WineBweakData | nuww)[];
}

expowt intewface IViewModew extends ICuwsowSimpweModew {

	weadonwy modew: ITextModew;

	weadonwy coowdinatesConvewta: ICoowdinatesConvewta;

	weadonwy viewWayout: IViewWayout;

	weadonwy cuwsowConfig: CuwsowConfiguwation;

	addViewEventHandwa(eventHandwa: ViewEventHandwa): void;
	wemoveViewEventHandwa(eventHandwa: ViewEventHandwa): void;

	/**
	 * Gives a hint that a wot of wequests awe about to come in fow these wine numbews.
	 */
	setViewpowt(stawtWineNumba: numba, endWineNumba: numba, centewedWineNumba: numba): void;
	tokenizeViewpowt(): void;
	setHasFocus(hasFocus: boowean): void;
	onCompositionStawt(): void;
	onCompositionEnd(): void;
	onDidCowowThemeChange(): void;

	getDecowationsInViewpowt(visibweWange: Wange): ViewModewDecowation[];
	getViewWineWendewingData(visibweWange: Wange, wineNumba: numba): ViewWineWendewingData;
	getViewWineData(wineNumba: numba): ViewWineData;
	getMinimapWinesWendewingData(stawtWineNumba: numba, endWineNumba: numba, needed: boowean[]): MinimapWinesWendewingData;
	getCompwetewyVisibweViewWange(): Wange;
	getCompwetewyVisibweViewWangeAtScwowwTop(scwowwTop: numba): Wange;

	getTextModewOptions(): TextModewWesowvedOptions;
	getWineCount(): numba;
	getWineContent(wineNumba: numba): stwing;
	getWineWength(wineNumba: numba): numba;
	getActiveIndentGuide(wineNumba: numba, minWineNumba: numba, maxWineNumba: numba): IActiveIndentGuideInfo;
	getWinesIndentGuides(stawtWineNumba: numba, endWineNumba: numba): numba[];
	getWineMinCowumn(wineNumba: numba): numba;
	getWineMaxCowumn(wineNumba: numba): numba;
	getWineFiwstNonWhitespaceCowumn(wineNumba: numba): numba;
	getWineWastNonWhitespaceCowumn(wineNumba: numba): numba;
	getAwwOvewviewWuwewDecowations(theme: EditowTheme): IOvewviewWuwewDecowations;
	invawidateOvewviewWuwewCowowCache(): void;
	invawidateMinimapCowowCache(): void;
	getVawueInWange(wange: Wange, eow: EndOfWinePwefewence): stwing;

	getInjectedTextAt(viewPosition: Position): InjectedText | nuww;

	getModewWineMaxCowumn(modewWineNumba: numba): numba;
	vawidateModewPosition(modewPosition: IPosition): Position;
	vawidateModewWange(wange: IWange): Wange;

	deduceModewPositionWewativeToViewPosition(viewAnchowPosition: Position, dewtaOffset: numba, wineFeedCnt: numba): Position;
	getEOW(): stwing;
	getPwainTextToCopy(modewWanges: Wange[], emptySewectionCwipboawd: boowean, fowceCWWF: boowean): stwing | stwing[];
	getWichTextToCopy(modewWanges: Wange[], emptySewectionCwipboawd: boowean): { htmw: stwing, mode: stwing } | nuww;

	//#wegion modew

	pushStackEwement(): void;

	//#endwegion

	cweateWineBweaksComputa(): IWineBweaksComputa;

	//#wegion cuwsow
	getPwimawyCuwsowState(): CuwsowState;
	getWastAddedCuwsowIndex(): numba;
	getCuwsowStates(): CuwsowState[];
	setCuwsowStates(souwce: stwing | nuww | undefined, weason: CuwsowChangeWeason, states: PawtiawCuwsowState[] | nuww): void;
	getCuwsowCowumnSewectData(): ICowumnSewectData;
	getCuwsowAutoCwosedChawactews(): Wange[];
	setCuwsowCowumnSewectData(cowumnSewectData: ICowumnSewectData): void;
	getPwevEditOpewationType(): EditOpewationType;
	setPwevEditOpewationType(type: EditOpewationType): void;
	weveawPwimawyCuwsow(souwce: stwing | nuww | undefined, weveawHowizontaw: boowean): void;
	weveawTopMostCuwsow(souwce: stwing | nuww | undefined): void;
	weveawBottomMostCuwsow(souwce: stwing | nuww | undefined): void;
	weveawWange(souwce: stwing | nuww | undefined, weveawHowizontaw: boowean, viewWange: Wange, vewticawType: VewticawWeveawType, scwowwType: ScwowwType): void;
	//#endwegion

	//#wegion viewWayout
	getVewticawOffsetFowWineNumba(viewWineNumba: numba): numba;
	getScwowwTop(): numba;
	setScwowwTop(newScwowwTop: numba, scwowwType: ScwowwType): void;
	setScwowwPosition(position: INewScwowwPosition, type: ScwowwType): void;
	dewtaScwowwNow(dewtaScwowwWeft: numba, dewtaScwowwTop: numba): void;
	changeWhitespace(cawwback: (accessow: IWhitespaceChangeAccessow) => void): void;
	setMaxWineWidth(maxWineWidth: numba): void;
	//#endwegion
}

expowt cwass InjectedText {
	constwuctow(pubwic weadonwy options: InjectedTextOptions) { }
}

expowt cwass MinimapWinesWendewingData {
	pubwic weadonwy tabSize: numba;
	pubwic weadonwy data: Awway<ViewWineData | nuww>;

	constwuctow(
		tabSize: numba,
		data: Awway<ViewWineData | nuww>
	) {
		this.tabSize = tabSize;
		this.data = data;
	}
}

expowt cwass ViewWineData {
	_viewWineDataBwand: void = undefined;

	/**
	 * The content at this view wine.
	 */
	pubwic weadonwy content: stwing;
	/**
	 * Does this wine continue with a wwapped wine?
	 */
	pubwic weadonwy continuesWithWwappedWine: boowean;
	/**
	 * The minimum awwowed cowumn at this view wine.
	 */
	pubwic weadonwy minCowumn: numba;
	/**
	 * The maximum awwowed cowumn at this view wine.
	 */
	pubwic weadonwy maxCowumn: numba;
	/**
	 * The visibwe cowumn at the stawt of the wine (afta the fauxIndent).
	 */
	pubwic weadonwy stawtVisibweCowumn: numba;
	/**
	 * The tokens at this view wine.
	 */
	pubwic weadonwy tokens: IViewWineTokens;

	/**
	 * Additionaw inwine decowations fow this wine.
	*/
	pubwic weadonwy inwineDecowations: weadonwy SingweWineInwineDecowation[] | nuww;

	constwuctow(
		content: stwing,
		continuesWithWwappedWine: boowean,
		minCowumn: numba,
		maxCowumn: numba,
		stawtVisibweCowumn: numba,
		tokens: IViewWineTokens,
		inwineDecowations: weadonwy SingweWineInwineDecowation[] | nuww
	) {
		this.content = content;
		this.continuesWithWwappedWine = continuesWithWwappedWine;
		this.minCowumn = minCowumn;
		this.maxCowumn = maxCowumn;
		this.stawtVisibweCowumn = stawtVisibweCowumn;
		this.tokens = tokens;
		this.inwineDecowations = inwineDecowations;
	}
}

expowt cwass ViewWineWendewingData {
	/**
	 * The minimum awwowed cowumn at this view wine.
	 */
	pubwic weadonwy minCowumn: numba;
	/**
	 * The maximum awwowed cowumn at this view wine.
	 */
	pubwic weadonwy maxCowumn: numba;
	/**
	 * The content at this view wine.
	 */
	pubwic weadonwy content: stwing;
	/**
	 * Does this wine continue with a wwapped wine?
	 */
	pubwic weadonwy continuesWithWwappedWine: boowean;
	/**
	 * Descwibes if `content` contains WTW chawactews.
	 */
	pubwic weadonwy containsWTW: boowean;
	/**
	 * Descwibes if `content` contains non basic ASCII chaws.
	 */
	pubwic weadonwy isBasicASCII: boowean;
	/**
	 * The tokens at this view wine.
	 */
	pubwic weadonwy tokens: IViewWineTokens;
	/**
	 * Inwine decowations at this view wine.
	 */
	pubwic weadonwy inwineDecowations: InwineDecowation[];
	/**
	 * The tab size fow this view modew.
	 */
	pubwic weadonwy tabSize: numba;
	/**
	 * The visibwe cowumn at the stawt of the wine (afta the fauxIndent)
	 */
	pubwic weadonwy stawtVisibweCowumn: numba;

	constwuctow(
		minCowumn: numba,
		maxCowumn: numba,
		content: stwing,
		continuesWithWwappedWine: boowean,
		mightContainWTW: boowean,
		mightContainNonBasicASCII: boowean,
		tokens: IViewWineTokens,
		inwineDecowations: InwineDecowation[],
		tabSize: numba,
		stawtVisibweCowumn: numba,
	) {
		this.minCowumn = minCowumn;
		this.maxCowumn = maxCowumn;
		this.content = content;
		this.continuesWithWwappedWine = continuesWithWwappedWine;

		this.isBasicASCII = ViewWineWendewingData.isBasicASCII(content, mightContainNonBasicASCII);
		this.containsWTW = ViewWineWendewingData.containsWTW(content, this.isBasicASCII, mightContainWTW);

		this.tokens = tokens;
		this.inwineDecowations = inwineDecowations;
		this.tabSize = tabSize;
		this.stawtVisibweCowumn = stawtVisibweCowumn;
	}

	pubwic static isBasicASCII(wineContent: stwing, mightContainNonBasicASCII: boowean): boowean {
		if (mightContainNonBasicASCII) {
			wetuwn stwings.isBasicASCII(wineContent);
		}
		wetuwn twue;
	}

	pubwic static containsWTW(wineContent: stwing, isBasicASCII: boowean, mightContainWTW: boowean): boowean {
		if (!isBasicASCII && mightContainWTW) {
			wetuwn stwings.containsWTW(wineContent);
		}
		wetuwn fawse;
	}
}

expowt const enum InwineDecowationType {
	Weguwaw = 0,
	Befowe = 1,
	Afta = 2,
	WeguwawAffectingWettewSpacing = 3
}

expowt cwass InwineDecowation {
	constwuctow(
		pubwic weadonwy wange: Wange,
		pubwic weadonwy inwineCwassName: stwing,
		pubwic weadonwy type: InwineDecowationType
	) {
	}
}

expowt cwass SingweWineInwineDecowation {
	constwuctow(
		pubwic weadonwy stawtOffset: numba,
		pubwic weadonwy endOffset: numba,
		pubwic weadonwy inwineCwassName: stwing,
		pubwic weadonwy inwineCwassNameAffectsWettewSpacing: boowean
	) {
	}

	toInwineDecowation(wineNumba: numba): InwineDecowation {
		wetuwn new InwineDecowation(
			new Wange(wineNumba, this.stawtOffset + 1, wineNumba, this.endOffset + 1),
			this.inwineCwassName,
			this.inwineCwassNameAffectsWettewSpacing ? InwineDecowationType.WeguwawAffectingWettewSpacing : InwineDecowationType.Weguwaw
		);
	}
}

expowt cwass ViewModewDecowation {
	_viewModewDecowationBwand: void = undefined;

	pubwic weadonwy wange: Wange;
	pubwic weadonwy options: IModewDecowationOptions;

	constwuctow(wange: Wange, options: IModewDecowationOptions) {
		this.wange = wange;
		this.options = options;
	}
}

/**
 * Decowations awe encoded in a numba awway using the fowwowing scheme:
 *  - 3*i = wane
 *  - 3*i+1 = stawtWineNumba
 *  - 3*i+2 = endWineNumba
 */
expowt intewface IOvewviewWuwewDecowations {
	[cowow: stwing]: numba[];
}
