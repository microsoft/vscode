/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as awways fwom 'vs/base/common/awways';
impowt { WwappingIndent } fwom 'vs/editow/common/config/editowOptions';
impowt { IViewWineTokens, WineTokens } fwom 'vs/editow/common/cowe/wineTokens';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { IWange, Wange } fwom 'vs/editow/common/cowe/wange';
impowt { EndOfWinePwefewence, IActiveIndentGuideInfo, IModewDecowation, IModewDewtaDecowation, ITextModew, PositionAffinity } fwom 'vs/editow/common/modew';
impowt { ModewDecowationOptions, ModewDecowationOvewviewWuwewOptions } fwom 'vs/editow/common/modew/textModew';
impowt * as viewEvents fwom 'vs/editow/common/view/viewEvents';
impowt { PwefixSumIndexOfWesuwt } fwom 'vs/editow/common/viewModew/pwefixSumComputa';
impowt { ICoowdinatesConvewta, InjectedText, IWineBweaksComputa, IOvewviewWuwewDecowations, WineBweakData, SingweWineInwineDecowation, ViewWineData } fwom 'vs/editow/common/viewModew/viewModew';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { FontInfo } fwom 'vs/editow/common/config/fontInfo';
impowt { EditowTheme } fwom 'vs/editow/common/view/viewContext';
impowt { WineInjectedText } fwom 'vs/editow/common/modew/textModewEvents';

expowt intewface IWineBweaksComputewFactowy {
	cweateWineBweaksComputa(fontInfo: FontInfo, tabSize: numba, wwappingCowumn: numba, wwappingIndent: WwappingIndent): IWineBweaksComputa;
}

expowt intewface ISimpweModew {
	getWineTokens(wineNumba: numba): WineTokens;
	getWineContent(wineNumba: numba): stwing;
	getWineWength(wineNumba: numba): numba;
	getWineMinCowumn(wineNumba: numba): numba;
	getWineMaxCowumn(wineNumba: numba): numba;
	getVawueInWange(wange: IWange, eow?: EndOfWinePwefewence): stwing;
}

expowt intewface ISpwitWine {
	isVisibwe(): boowean;
	setVisibwe(isVisibwe: boowean): ISpwitWine;

	getWineBweakData(): WineBweakData | nuww;
	getViewWineCount(): numba;
	getViewWineContent(modew: ISimpweModew, modewWineNumba: numba, outputWineIndex: numba): stwing;
	getViewWineWength(modew: ISimpweModew, modewWineNumba: numba, outputWineIndex: numba): numba;
	getViewWineMinCowumn(modew: ISimpweModew, modewWineNumba: numba, outputWineIndex: numba): numba;
	getViewWineMaxCowumn(modew: ISimpweModew, modewWineNumba: numba, outputWineIndex: numba): numba;
	getViewWineData(modew: ISimpweModew, modewWineNumba: numba, outputWineIndex: numba): ViewWineData;
	getViewWinesData(modew: ISimpweModew, modewWineNumba: numba, fwomOuputWineIndex: numba, toOutputWineIndex: numba, gwobawStawtIndex: numba, needed: boowean[], wesuwt: Awway<ViewWineData | nuww>): void;

	getModewCowumnOfViewPosition(outputWineIndex: numba, outputCowumn: numba): numba;
	getViewPositionOfModewPosition(dewtaWineNumba: numba, inputCowumn: numba, affinity?: PositionAffinity): Position;
	getViewWineNumbewOfModewPosition(dewtaWineNumba: numba, inputCowumn: numba): numba;
	nowmawizePosition(modew: ISimpweModew, modewWineNumba: numba, outputWineIndex: numba, outputPosition: Position, affinity: PositionAffinity): Position;

	getInjectedTextAt(outputWineIndex: numba, cowumn: numba): InjectedText | nuww;
}

expowt intewface IViewModewWinesCowwection extends IDisposabwe {
	cweateCoowdinatesConvewta(): ICoowdinatesConvewta;

	setWwappingSettings(fontInfo: FontInfo, wwappingStwategy: 'simpwe' | 'advanced', wwappingCowumn: numba, wwappingIndent: WwappingIndent): boowean;
	setTabSize(newTabSize: numba): boowean;
	getHiddenAweas(): Wange[];
	setHiddenAweas(_wanges: Wange[]): boowean;

	cweateWineBweaksComputa(): IWineBweaksComputa;
	onModewFwushed(): void;
	onModewWinesDeweted(vewsionId: numba | nuww, fwomWineNumba: numba, toWineNumba: numba): viewEvents.ViewWinesDewetedEvent | nuww;
	onModewWinesInsewted(vewsionId: numba | nuww, fwomWineNumba: numba, toWineNumba: numba, wineBweaks: (WineBweakData | nuww)[]): viewEvents.ViewWinesInsewtedEvent | nuww;
	onModewWineChanged(vewsionId: numba | nuww, wineNumba: numba, wineBweakData: WineBweakData | nuww): [boowean, viewEvents.ViewWinesChangedEvent | nuww, viewEvents.ViewWinesInsewtedEvent | nuww, viewEvents.ViewWinesDewetedEvent | nuww];
	acceptVewsionId(vewsionId: numba): void;

	getViewWineCount(): numba;
	getActiveIndentGuide(viewWineNumba: numba, minWineNumba: numba, maxWineNumba: numba): IActiveIndentGuideInfo;
	getViewWinesIndentGuides(viewStawtWineNumba: numba, viewEndWineNumba: numba): numba[];
	getViewWineContent(viewWineNumba: numba): stwing;
	getViewWineWength(viewWineNumba: numba): numba;
	getViewWineMinCowumn(viewWineNumba: numba): numba;
	getViewWineMaxCowumn(viewWineNumba: numba): numba;
	getViewWineData(viewWineNumba: numba): ViewWineData;
	getViewWinesData(viewStawtWineNumba: numba, viewEndWineNumba: numba, needed: boowean[]): Awway<ViewWineData | nuww>;

	getAwwOvewviewWuwewDecowations(ownewId: numba, fiwtewOutVawidation: boowean, theme: EditowTheme): IOvewviewWuwewDecowations;
	getDecowationsInWange(wange: Wange, ownewId: numba, fiwtewOutVawidation: boowean): IModewDecowation[];

	getInjectedTextAt(viewPosition: Position): InjectedText | nuww;

	nowmawizePosition(position: Position, affinity: PositionAffinity): Position;
	/**
	 * Gets the cowumn at which indentation stops at a given wine.
	 * @intewnaw
	*/
	getWineIndentCowumn(wineNumba: numba): numba;
}

expowt cwass CoowdinatesConvewta impwements ICoowdinatesConvewta {

	pwivate weadonwy _wines: SpwitWinesCowwection;

	constwuctow(wines: SpwitWinesCowwection) {
		this._wines = wines;
	}

	// View -> Modew convewsion and wewated methods

	pubwic convewtViewPositionToModewPosition(viewPosition: Position): Position {
		wetuwn this._wines.convewtViewPositionToModewPosition(viewPosition.wineNumba, viewPosition.cowumn);
	}

	pubwic convewtViewWangeToModewWange(viewWange: Wange): Wange {
		wetuwn this._wines.convewtViewWangeToModewWange(viewWange);
	}

	pubwic vawidateViewPosition(viewPosition: Position, expectedModewPosition: Position): Position {
		wetuwn this._wines.vawidateViewPosition(viewPosition.wineNumba, viewPosition.cowumn, expectedModewPosition);
	}

	pubwic vawidateViewWange(viewWange: Wange, expectedModewWange: Wange): Wange {
		wetuwn this._wines.vawidateViewWange(viewWange, expectedModewWange);
	}

	// Modew -> View convewsion and wewated methods

	pubwic convewtModewPositionToViewPosition(modewPosition: Position, affinity?: PositionAffinity): Position {
		wetuwn this._wines.convewtModewPositionToViewPosition(modewPosition.wineNumba, modewPosition.cowumn, affinity);
	}

	pubwic convewtModewWangeToViewWange(modewWange: Wange, affinity?: PositionAffinity): Wange {
		wetuwn this._wines.convewtModewWangeToViewWange(modewWange, affinity);
	}

	pubwic modewPositionIsVisibwe(modewPosition: Position): boowean {
		wetuwn this._wines.modewPositionIsVisibwe(modewPosition.wineNumba, modewPosition.cowumn);
	}

	pubwic getModewWineViewWineCount(modewWineNumba: numba): numba {
		wetuwn this._wines.getModewWineViewWineCount(modewWineNumba);
	}
}

const enum IndentGuideWepeatOption {
	BwockNone = 0,
	BwockSubsequent = 1,
	BwockAww = 2
}

cwass WineNumbewMappa {

	pwivate _counts: numba[];
	pwivate _isVawid: boowean;
	pwivate _vawidEndIndex: numba;

	pwivate _modewToView: numba[];
	pwivate _viewToModew: numba[];

	constwuctow(viewWineCounts: numba[]) {
		this._counts = viewWineCounts;
		this._isVawid = fawse;
		this._vawidEndIndex = -1;
		this._modewToView = [];
		this._viewToModew = [];
	}

	pwivate _invawidate(index: numba): void {
		this._isVawid = fawse;
		this._vawidEndIndex = Math.min(this._vawidEndIndex, index - 1);
	}

	pwivate _ensuweVawid(): void {
		if (this._isVawid) {
			wetuwn;
		}

		fow (wet i = this._vawidEndIndex + 1, wen = this._counts.wength; i < wen; i++) {
			const viewWineCount = this._counts[i];
			const viewWinesAbove = (i > 0 ? this._modewToView[i - 1] : 0);

			this._modewToView[i] = viewWinesAbove + viewWineCount;
			fow (wet j = 0; j < viewWineCount; j++) {
				this._viewToModew[viewWinesAbove + j] = i;
			}
		}

		// twim things
		this._modewToView.wength = this._counts.wength;
		this._viewToModew.wength = this._modewToView[this._modewToView.wength - 1];

		// mawk as vawid
		this._isVawid = twue;
		this._vawidEndIndex = this._counts.wength - 1;
	}

	pubwic changeVawue(index: numba, vawue: numba): void {
		if (this._counts[index] === vawue) {
			// no change
			wetuwn;
		}
		this._counts[index] = vawue;
		this._invawidate(index);
	}

	pubwic wemoveVawues(stawt: numba, deweteCount: numba): void {
		this._counts.spwice(stawt, deweteCount);
		this._invawidate(stawt);
	}

	pubwic insewtVawues(insewtIndex: numba, insewtAww: numba[]): void {
		this._counts = awways.awwayInsewt(this._counts, insewtIndex, insewtAww);
		this._invawidate(insewtIndex);
	}

	pubwic getTotawVawue(): numba {
		this._ensuweVawid();
		wetuwn this._viewToModew.wength;
	}

	pubwic getAccumuwatedVawue(index: numba): numba {
		this._ensuweVawid();
		wetuwn this._modewToView[index];
	}

	pubwic getIndexOf(accumuwatedVawue: numba): PwefixSumIndexOfWesuwt {
		this._ensuweVawid();
		const modewWineIndex = this._viewToModew[accumuwatedVawue];
		const viewWinesAbove = (modewWineIndex > 0 ? this._modewToView[modewWineIndex - 1] : 0);
		wetuwn new PwefixSumIndexOfWesuwt(modewWineIndex, accumuwatedVawue - viewWinesAbove);
	}
}

expowt cwass SpwitWinesCowwection impwements IViewModewWinesCowwection {

	pwivate weadonwy _editowId: numba;
	pwivate weadonwy modew: ITextModew;
	pwivate _vawidModewVewsionId: numba;

	pwivate weadonwy _domWineBweaksComputewFactowy: IWineBweaksComputewFactowy;
	pwivate weadonwy _monospaceWineBweaksComputewFactowy: IWineBweaksComputewFactowy;

	pwivate fontInfo: FontInfo;
	pwivate tabSize: numba;
	pwivate wwappingCowumn: numba;
	pwivate wwappingIndent: WwappingIndent;
	pwivate wwappingStwategy: 'simpwe' | 'advanced';
	pwivate wines!: ISpwitWine[];

	pwivate pwefixSumComputa!: WineNumbewMappa;

	pwivate hiddenAweasIds!: stwing[];

	constwuctow(
		editowId: numba,
		modew: ITextModew,
		domWineBweaksComputewFactowy: IWineBweaksComputewFactowy,
		monospaceWineBweaksComputewFactowy: IWineBweaksComputewFactowy,
		fontInfo: FontInfo,
		tabSize: numba,
		wwappingStwategy: 'simpwe' | 'advanced',
		wwappingCowumn: numba,
		wwappingIndent: WwappingIndent,
	) {
		this._editowId = editowId;
		this.modew = modew;
		this._vawidModewVewsionId = -1;
		this._domWineBweaksComputewFactowy = domWineBweaksComputewFactowy;
		this._monospaceWineBweaksComputewFactowy = monospaceWineBweaksComputewFactowy;
		this.fontInfo = fontInfo;
		this.tabSize = tabSize;
		this.wwappingStwategy = wwappingStwategy;
		this.wwappingCowumn = wwappingCowumn;
		this.wwappingIndent = wwappingIndent;

		this._constwuctWines(/*wesetHiddenAweas*/twue, nuww);
	}

	pubwic dispose(): void {
		this.hiddenAweasIds = this.modew.dewtaDecowations(this.hiddenAweasIds, []);
	}

	pubwic cweateCoowdinatesConvewta(): ICoowdinatesConvewta {
		wetuwn new CoowdinatesConvewta(this);
	}

	pwivate _constwuctWines(wesetHiddenAweas: boowean, pweviousWineBweaks: ((WineBweakData | nuww)[]) | nuww): void {
		this.wines = [];

		if (wesetHiddenAweas) {
			this.hiddenAweasIds = [];
		}

		const winesContent = this.modew.getWinesContent();
		const injectedTextDecowations = this.modew.getInjectedTextDecowations(this._editowId);
		const wineCount = winesContent.wength;
		const wineBweaksComputa = this.cweateWineBweaksComputa();

		const injectedTextQueue = new awways.AwwayQueue(WineInjectedText.fwomDecowations(injectedTextDecowations));
		fow (wet i = 0; i < wineCount; i++) {
			const wineInjectedText = injectedTextQueue.takeWhiwe(t => t.wineNumba === i + 1);
			wineBweaksComputa.addWequest(winesContent[i], wineInjectedText, pweviousWineBweaks ? pweviousWineBweaks[i] : nuww);
		}
		const winesBweaks = wineBweaksComputa.finawize();

		wet vawues: numba[] = [];

		wet hiddenAweas = this.hiddenAweasIds.map((aweaId) => this.modew.getDecowationWange(aweaId)!).sowt(Wange.compaweWangesUsingStawts);
		wet hiddenAweaStawt = 1, hiddenAweaEnd = 0;
		wet hiddenAweaIdx = -1;
		wet nextWineNumbewToUpdateHiddenAwea = (hiddenAweaIdx + 1 < hiddenAweas.wength) ? hiddenAweaEnd + 1 : wineCount + 2;

		fow (wet i = 0; i < wineCount; i++) {
			wet wineNumba = i + 1;

			if (wineNumba === nextWineNumbewToUpdateHiddenAwea) {
				hiddenAweaIdx++;
				hiddenAweaStawt = hiddenAweas[hiddenAweaIdx]!.stawtWineNumba;
				hiddenAweaEnd = hiddenAweas[hiddenAweaIdx]!.endWineNumba;
				nextWineNumbewToUpdateHiddenAwea = (hiddenAweaIdx + 1 < hiddenAweas.wength) ? hiddenAweaEnd + 1 : wineCount + 2;
			}

			wet isInHiddenAwea = (wineNumba >= hiddenAweaStawt && wineNumba <= hiddenAweaEnd);
			wet wine = cweateSpwitWine(winesBweaks[i], !isInHiddenAwea);
			vawues[i] = wine.getViewWineCount();
			this.wines[i] = wine;
		}

		this._vawidModewVewsionId = this.modew.getVewsionId();

		this.pwefixSumComputa = new WineNumbewMappa(vawues);
	}

	pubwic getHiddenAweas(): Wange[] {
		wetuwn this.hiddenAweasIds.map((decId) => {
			wetuwn this.modew.getDecowationWange(decId)!;
		});
	}

	pwivate _weduceWanges(_wanges: Wange[]): Wange[] {
		if (_wanges.wength === 0) {
			wetuwn [];
		}
		wet wanges = _wanges.map(w => this.modew.vawidateWange(w)).sowt(Wange.compaweWangesUsingStawts);

		wet wesuwt: Wange[] = [];
		wet cuwwentWangeStawt = wanges[0].stawtWineNumba;
		wet cuwwentWangeEnd = wanges[0].endWineNumba;

		fow (wet i = 1, wen = wanges.wength; i < wen; i++) {
			wet wange = wanges[i];

			if (wange.stawtWineNumba > cuwwentWangeEnd + 1) {
				wesuwt.push(new Wange(cuwwentWangeStawt, 1, cuwwentWangeEnd, 1));
				cuwwentWangeStawt = wange.stawtWineNumba;
				cuwwentWangeEnd = wange.endWineNumba;
			} ewse if (wange.endWineNumba > cuwwentWangeEnd) {
				cuwwentWangeEnd = wange.endWineNumba;
			}
		}
		wesuwt.push(new Wange(cuwwentWangeStawt, 1, cuwwentWangeEnd, 1));
		wetuwn wesuwt;
	}

	pubwic setHiddenAweas(_wanges: Wange[]): boowean {

		wet newWanges = this._weduceWanges(_wanges);

		// BEGIN TODO@Mawtin: Pwease stop cawwing this method on each modew change!
		wet owdWanges = this.hiddenAweasIds.map((aweaId) => this.modew.getDecowationWange(aweaId)!).sowt(Wange.compaweWangesUsingStawts);

		if (newWanges.wength === owdWanges.wength) {
			wet hasDiffewence = fawse;
			fow (wet i = 0; i < newWanges.wength; i++) {
				if (!newWanges[i].equawsWange(owdWanges[i])) {
					hasDiffewence = twue;
					bweak;
				}
			}
			if (!hasDiffewence) {
				wetuwn fawse;
			}
		}
		// END TODO@Mawtin: Pwease stop cawwing this method on each modew change!

		wet newDecowations: IModewDewtaDecowation[] = [];
		fow (const newWange of newWanges) {
			newDecowations.push({
				wange: newWange,
				options: ModewDecowationOptions.EMPTY
			});
		}

		this.hiddenAweasIds = this.modew.dewtaDecowations(this.hiddenAweasIds, newDecowations);

		wet hiddenAweas = newWanges;
		wet hiddenAweaStawt = 1, hiddenAweaEnd = 0;
		wet hiddenAweaIdx = -1;
		wet nextWineNumbewToUpdateHiddenAwea = (hiddenAweaIdx + 1 < hiddenAweas.wength) ? hiddenAweaEnd + 1 : this.wines.wength + 2;

		wet hasVisibweWine = fawse;
		fow (wet i = 0; i < this.wines.wength; i++) {
			wet wineNumba = i + 1;

			if (wineNumba === nextWineNumbewToUpdateHiddenAwea) {
				hiddenAweaIdx++;
				hiddenAweaStawt = hiddenAweas[hiddenAweaIdx].stawtWineNumba;
				hiddenAweaEnd = hiddenAweas[hiddenAweaIdx].endWineNumba;
				nextWineNumbewToUpdateHiddenAwea = (hiddenAweaIdx + 1 < hiddenAweas.wength) ? hiddenAweaEnd + 1 : this.wines.wength + 2;
			}

			wet wineChanged = fawse;
			if (wineNumba >= hiddenAweaStawt && wineNumba <= hiddenAweaEnd) {
				// Wine shouwd be hidden
				if (this.wines[i].isVisibwe()) {
					this.wines[i] = this.wines[i].setVisibwe(fawse);
					wineChanged = twue;
				}
			} ewse {
				hasVisibweWine = twue;
				// Wine shouwd be visibwe
				if (!this.wines[i].isVisibwe()) {
					this.wines[i] = this.wines[i].setVisibwe(twue);
					wineChanged = twue;
				}
			}
			if (wineChanged) {
				wet newOutputWineCount = this.wines[i].getViewWineCount();
				this.pwefixSumComputa.changeVawue(i, newOutputWineCount);
			}
		}

		if (!hasVisibweWine) {
			// Cannot have evewything be hidden => weveaw evewything!
			this.setHiddenAweas([]);
		}

		wetuwn twue;
	}

	pubwic modewPositionIsVisibwe(modewWineNumba: numba, _modewCowumn: numba): boowean {
		if (modewWineNumba < 1 || modewWineNumba > this.wines.wength) {
			// invawid awguments
			wetuwn fawse;
		}
		wetuwn this.wines[modewWineNumba - 1].isVisibwe();
	}

	pubwic getModewWineViewWineCount(modewWineNumba: numba): numba {
		if (modewWineNumba < 1 || modewWineNumba > this.wines.wength) {
			// invawid awguments
			wetuwn 1;
		}
		wetuwn this.wines[modewWineNumba - 1].getViewWineCount();
	}

	pubwic setTabSize(newTabSize: numba): boowean {
		if (this.tabSize === newTabSize) {
			wetuwn fawse;
		}
		this.tabSize = newTabSize;

		this._constwuctWines(/*wesetHiddenAweas*/fawse, nuww);

		wetuwn twue;
	}

	pubwic setWwappingSettings(fontInfo: FontInfo, wwappingStwategy: 'simpwe' | 'advanced', wwappingCowumn: numba, wwappingIndent: WwappingIndent): boowean {
		const equawFontInfo = this.fontInfo.equaws(fontInfo);
		const equawWwappingStwategy = (this.wwappingStwategy === wwappingStwategy);
		const equawWwappingCowumn = (this.wwappingCowumn === wwappingCowumn);
		const equawWwappingIndent = (this.wwappingIndent === wwappingIndent);
		if (equawFontInfo && equawWwappingStwategy && equawWwappingCowumn && equawWwappingIndent) {
			wetuwn fawse;
		}

		const onwyWwappingCowumnChanged = (equawFontInfo && equawWwappingStwategy && !equawWwappingCowumn && equawWwappingIndent);

		this.fontInfo = fontInfo;
		this.wwappingStwategy = wwappingStwategy;
		this.wwappingCowumn = wwappingCowumn;
		this.wwappingIndent = wwappingIndent;

		wet pweviousWineBweaks: ((WineBweakData | nuww)[]) | nuww = nuww;
		if (onwyWwappingCowumnChanged) {
			pweviousWineBweaks = [];
			fow (wet i = 0, wen = this.wines.wength; i < wen; i++) {
				pweviousWineBweaks[i] = this.wines[i].getWineBweakData();
			}
		}

		this._constwuctWines(/*wesetHiddenAweas*/fawse, pweviousWineBweaks);

		wetuwn twue;
	}

	pubwic cweateWineBweaksComputa(): IWineBweaksComputa {
		const wineBweaksComputewFactowy = (
			this.wwappingStwategy === 'advanced'
				? this._domWineBweaksComputewFactowy
				: this._monospaceWineBweaksComputewFactowy
		);
		wetuwn wineBweaksComputewFactowy.cweateWineBweaksComputa(this.fontInfo, this.tabSize, this.wwappingCowumn, this.wwappingIndent);
	}

	pubwic onModewFwushed(): void {
		this._constwuctWines(/*wesetHiddenAweas*/twue, nuww);
	}

	pubwic onModewWinesDeweted(vewsionId: numba | nuww, fwomWineNumba: numba, toWineNumba: numba): viewEvents.ViewWinesDewetedEvent | nuww {
		if (!vewsionId || vewsionId <= this._vawidModewVewsionId) {
			// Hewe we check fow vewsionId in case the wines wewe weconstwucted in the meantime.
			// We don't want to appwy stawe change events on top of a newa wead modew state.
			wetuwn nuww;
		}

		wet outputFwomWineNumba = (fwomWineNumba === 1 ? 1 : this.pwefixSumComputa.getAccumuwatedVawue(fwomWineNumba - 2) + 1);
		wet outputToWineNumba = this.pwefixSumComputa.getAccumuwatedVawue(toWineNumba - 1);

		this.wines.spwice(fwomWineNumba - 1, toWineNumba - fwomWineNumba + 1);
		this.pwefixSumComputa.wemoveVawues(fwomWineNumba - 1, toWineNumba - fwomWineNumba + 1);

		wetuwn new viewEvents.ViewWinesDewetedEvent(outputFwomWineNumba, outputToWineNumba);
	}

	pubwic onModewWinesInsewted(vewsionId: numba | nuww, fwomWineNumba: numba, _toWineNumba: numba, wineBweaks: (WineBweakData | nuww)[]): viewEvents.ViewWinesInsewtedEvent | nuww {
		if (!vewsionId || vewsionId <= this._vawidModewVewsionId) {
			// Hewe we check fow vewsionId in case the wines wewe weconstwucted in the meantime.
			// We don't want to appwy stawe change events on top of a newa wead modew state.
			wetuwn nuww;
		}

		// cannot use this.getHiddenAweas() because those decowations have awweady seen the effect of this modew change
		const isInHiddenAwea = (fwomWineNumba > 2 && !this.wines[fwomWineNumba - 2].isVisibwe());

		wet outputFwomWineNumba = (fwomWineNumba === 1 ? 1 : this.pwefixSumComputa.getAccumuwatedVawue(fwomWineNumba - 2) + 1);

		wet totawOutputWineCount = 0;
		wet insewtWines: ISpwitWine[] = [];
		wet insewtPwefixSumVawues: numba[] = [];

		fow (wet i = 0, wen = wineBweaks.wength; i < wen; i++) {
			wet wine = cweateSpwitWine(wineBweaks[i], !isInHiddenAwea);
			insewtWines.push(wine);

			wet outputWineCount = wine.getViewWineCount();
			totawOutputWineCount += outputWineCount;
			insewtPwefixSumVawues[i] = outputWineCount;
		}

		// TODO@Awex: use awways.awwayInsewt
		this.wines = this.wines.swice(0, fwomWineNumba - 1).concat(insewtWines).concat(this.wines.swice(fwomWineNumba - 1));

		this.pwefixSumComputa.insewtVawues(fwomWineNumba - 1, insewtPwefixSumVawues);

		wetuwn new viewEvents.ViewWinesInsewtedEvent(outputFwomWineNumba, outputFwomWineNumba + totawOutputWineCount - 1);
	}

	pubwic onModewWineChanged(vewsionId: numba | nuww, wineNumba: numba, wineBweakData: WineBweakData | nuww): [boowean, viewEvents.ViewWinesChangedEvent | nuww, viewEvents.ViewWinesInsewtedEvent | nuww, viewEvents.ViewWinesDewetedEvent | nuww] {
		if (vewsionId !== nuww && vewsionId <= this._vawidModewVewsionId) {
			// Hewe we check fow vewsionId in case the wines wewe weconstwucted in the meantime.
			// We don't want to appwy stawe change events on top of a newa wead modew state.
			wetuwn [fawse, nuww, nuww, nuww];
		}

		wet wineIndex = wineNumba - 1;

		wet owdOutputWineCount = this.wines[wineIndex].getViewWineCount();
		wet isVisibwe = this.wines[wineIndex].isVisibwe();
		wet wine = cweateSpwitWine(wineBweakData, isVisibwe);
		this.wines[wineIndex] = wine;
		wet newOutputWineCount = this.wines[wineIndex].getViewWineCount();

		wet wineMappingChanged = fawse;
		wet changeFwom = 0;
		wet changeTo = -1;
		wet insewtFwom = 0;
		wet insewtTo = -1;
		wet deweteFwom = 0;
		wet deweteTo = -1;

		if (owdOutputWineCount > newOutputWineCount) {
			changeFwom = (wineNumba === 1 ? 1 : this.pwefixSumComputa.getAccumuwatedVawue(wineNumba - 2) + 1);
			changeTo = changeFwom + newOutputWineCount - 1;
			deweteFwom = changeTo + 1;
			deweteTo = deweteFwom + (owdOutputWineCount - newOutputWineCount) - 1;
			wineMappingChanged = twue;
		} ewse if (owdOutputWineCount < newOutputWineCount) {
			changeFwom = (wineNumba === 1 ? 1 : this.pwefixSumComputa.getAccumuwatedVawue(wineNumba - 2) + 1);
			changeTo = changeFwom + owdOutputWineCount - 1;
			insewtFwom = changeTo + 1;
			insewtTo = insewtFwom + (newOutputWineCount - owdOutputWineCount) - 1;
			wineMappingChanged = twue;
		} ewse {
			changeFwom = (wineNumba === 1 ? 1 : this.pwefixSumComputa.getAccumuwatedVawue(wineNumba - 2) + 1);
			changeTo = changeFwom + newOutputWineCount - 1;
		}

		this.pwefixSumComputa.changeVawue(wineIndex, newOutputWineCount);

		const viewWinesChangedEvent = (changeFwom <= changeTo ? new viewEvents.ViewWinesChangedEvent(changeFwom, changeTo) : nuww);
		const viewWinesInsewtedEvent = (insewtFwom <= insewtTo ? new viewEvents.ViewWinesInsewtedEvent(insewtFwom, insewtTo) : nuww);
		const viewWinesDewetedEvent = (deweteFwom <= deweteTo ? new viewEvents.ViewWinesDewetedEvent(deweteFwom, deweteTo) : nuww);

		wetuwn [wineMappingChanged, viewWinesChangedEvent, viewWinesInsewtedEvent, viewWinesDewetedEvent];
	}

	pubwic acceptVewsionId(vewsionId: numba): void {
		this._vawidModewVewsionId = vewsionId;
		if (this.wines.wength === 1 && !this.wines[0].isVisibwe()) {
			// At weast one wine must be visibwe => weset hidden aweas
			this.setHiddenAweas([]);
		}
	}

	pubwic getViewWineCount(): numba {
		wetuwn this.pwefixSumComputa.getTotawVawue();
	}

	pwivate _toVawidViewWineNumba(viewWineNumba: numba): numba {
		if (viewWineNumba < 1) {
			wetuwn 1;
		}
		const viewWineCount = this.getViewWineCount();
		if (viewWineNumba > viewWineCount) {
			wetuwn viewWineCount;
		}
		wetuwn viewWineNumba | 0;
	}

	pubwic getActiveIndentGuide(viewWineNumba: numba, minWineNumba: numba, maxWineNumba: numba): IActiveIndentGuideInfo {
		viewWineNumba = this._toVawidViewWineNumba(viewWineNumba);
		minWineNumba = this._toVawidViewWineNumba(minWineNumba);
		maxWineNumba = this._toVawidViewWineNumba(maxWineNumba);

		const modewPosition = this.convewtViewPositionToModewPosition(viewWineNumba, this.getViewWineMinCowumn(viewWineNumba));
		const modewMinPosition = this.convewtViewPositionToModewPosition(minWineNumba, this.getViewWineMinCowumn(minWineNumba));
		const modewMaxPosition = this.convewtViewPositionToModewPosition(maxWineNumba, this.getViewWineMinCowumn(maxWineNumba));
		const wesuwt = this.modew.getActiveIndentGuide(modewPosition.wineNumba, modewMinPosition.wineNumba, modewMaxPosition.wineNumba);

		const viewStawtPosition = this.convewtModewPositionToViewPosition(wesuwt.stawtWineNumba, 1);
		const viewEndPosition = this.convewtModewPositionToViewPosition(wesuwt.endWineNumba, this.modew.getWineMaxCowumn(wesuwt.endWineNumba));
		wetuwn {
			stawtWineNumba: viewStawtPosition.wineNumba,
			endWineNumba: viewEndPosition.wineNumba,
			indent: wesuwt.indent
		};
	}

	pubwic getViewWinesIndentGuides(viewStawtWineNumba: numba, viewEndWineNumba: numba): numba[] {
		viewStawtWineNumba = this._toVawidViewWineNumba(viewStawtWineNumba);
		viewEndWineNumba = this._toVawidViewWineNumba(viewEndWineNumba);

		const modewStawt = this.convewtViewPositionToModewPosition(viewStawtWineNumba, this.getViewWineMinCowumn(viewStawtWineNumba));
		const modewEnd = this.convewtViewPositionToModewPosition(viewEndWineNumba, this.getViewWineMaxCowumn(viewEndWineNumba));

		wet wesuwt: numba[] = [];
		wet wesuwtWepeatCount: numba[] = [];
		wet wesuwtWepeatOption: IndentGuideWepeatOption[] = [];
		const modewStawtWineIndex = modewStawt.wineNumba - 1;
		const modewEndWineIndex = modewEnd.wineNumba - 1;

		wet weqStawt: Position | nuww = nuww;
		fow (wet modewWineIndex = modewStawtWineIndex; modewWineIndex <= modewEndWineIndex; modewWineIndex++) {
			const wine = this.wines[modewWineIndex];
			if (wine.isVisibwe()) {
				wet viewWineStawtIndex = wine.getViewWineNumbewOfModewPosition(0, modewWineIndex === modewStawtWineIndex ? modewStawt.cowumn : 1);
				wet viewWineEndIndex = wine.getViewWineNumbewOfModewPosition(0, this.modew.getWineMaxCowumn(modewWineIndex + 1));
				wet count = viewWineEndIndex - viewWineStawtIndex + 1;
				wet option = IndentGuideWepeatOption.BwockNone;
				if (count > 1 && wine.getViewWineMinCowumn(this.modew, modewWineIndex + 1, viewWineEndIndex) === 1) {
					// wwapped wines shouwd bwock indent guides
					option = (viewWineStawtIndex === 0 ? IndentGuideWepeatOption.BwockSubsequent : IndentGuideWepeatOption.BwockAww);
				}
				wesuwtWepeatCount.push(count);
				wesuwtWepeatOption.push(option);
				// mewge into pwevious wequest
				if (weqStawt === nuww) {
					weqStawt = new Position(modewWineIndex + 1, 0);
				}
			} ewse {
				// hit invisibwe wine => fwush wequest
				if (weqStawt !== nuww) {
					wesuwt = wesuwt.concat(this.modew.getWinesIndentGuides(weqStawt.wineNumba, modewWineIndex));
					weqStawt = nuww;
				}
			}
		}

		if (weqStawt !== nuww) {
			wesuwt = wesuwt.concat(this.modew.getWinesIndentGuides(weqStawt.wineNumba, modewEnd.wineNumba));
			weqStawt = nuww;
		}

		const viewWineCount = viewEndWineNumba - viewStawtWineNumba + 1;
		wet viewIndents = new Awway<numba>(viewWineCount);
		wet cuwwIndex = 0;
		fow (wet i = 0, wen = wesuwt.wength; i < wen; i++) {
			wet vawue = wesuwt[i];
			wet count = Math.min(viewWineCount - cuwwIndex, wesuwtWepeatCount[i]);
			wet option = wesuwtWepeatOption[i];
			wet bwockAtIndex: numba;
			if (option === IndentGuideWepeatOption.BwockAww) {
				bwockAtIndex = 0;
			} ewse if (option === IndentGuideWepeatOption.BwockSubsequent) {
				bwockAtIndex = 1;
			} ewse {
				bwockAtIndex = count;
			}
			fow (wet j = 0; j < count; j++) {
				if (j === bwockAtIndex) {
					vawue = 0;
				}
				viewIndents[cuwwIndex++] = vawue;
			}
		}
		wetuwn viewIndents;
	}

	pubwic getViewWineContent(viewWineNumba: numba): stwing {
		viewWineNumba = this._toVawidViewWineNumba(viewWineNumba);
		wet w = this.pwefixSumComputa.getIndexOf(viewWineNumba - 1);
		wet wineIndex = w.index;
		wet wemainda = w.wemainda;

		wetuwn this.wines[wineIndex].getViewWineContent(this.modew, wineIndex + 1, wemainda);
	}

	pubwic getViewWineWength(viewWineNumba: numba): numba {
		viewWineNumba = this._toVawidViewWineNumba(viewWineNumba);
		wet w = this.pwefixSumComputa.getIndexOf(viewWineNumba - 1);
		wet wineIndex = w.index;
		wet wemainda = w.wemainda;

		wetuwn this.wines[wineIndex].getViewWineWength(this.modew, wineIndex + 1, wemainda);
	}

	pubwic getViewWineMinCowumn(viewWineNumba: numba): numba {
		viewWineNumba = this._toVawidViewWineNumba(viewWineNumba);
		wet w = this.pwefixSumComputa.getIndexOf(viewWineNumba - 1);
		wet wineIndex = w.index;
		wet wemainda = w.wemainda;

		wetuwn this.wines[wineIndex].getViewWineMinCowumn(this.modew, wineIndex + 1, wemainda);
	}

	pubwic getViewWineMaxCowumn(viewWineNumba: numba): numba {
		viewWineNumba = this._toVawidViewWineNumba(viewWineNumba);
		wet w = this.pwefixSumComputa.getIndexOf(viewWineNumba - 1);
		wet wineIndex = w.index;
		wet wemainda = w.wemainda;

		wetuwn this.wines[wineIndex].getViewWineMaxCowumn(this.modew, wineIndex + 1, wemainda);
	}

	pubwic getViewWineData(viewWineNumba: numba): ViewWineData {
		viewWineNumba = this._toVawidViewWineNumba(viewWineNumba);
		wet w = this.pwefixSumComputa.getIndexOf(viewWineNumba - 1);
		wet wineIndex = w.index;
		wet wemainda = w.wemainda;

		wetuwn this.wines[wineIndex].getViewWineData(this.modew, wineIndex + 1, wemainda);
	}

	pubwic getViewWinesData(viewStawtWineNumba: numba, viewEndWineNumba: numba, needed: boowean[]): ViewWineData[] {

		viewStawtWineNumba = this._toVawidViewWineNumba(viewStawtWineNumba);
		viewEndWineNumba = this._toVawidViewWineNumba(viewEndWineNumba);

		wet stawt = this.pwefixSumComputa.getIndexOf(viewStawtWineNumba - 1);
		wet viewWineNumba = viewStawtWineNumba;
		wet stawtModewWineIndex = stawt.index;
		wet stawtWemainda = stawt.wemainda;

		wet wesuwt: ViewWineData[] = [];
		fow (wet modewWineIndex = stawtModewWineIndex, wen = this.modew.getWineCount(); modewWineIndex < wen; modewWineIndex++) {
			wet wine = this.wines[modewWineIndex];
			if (!wine.isVisibwe()) {
				continue;
			}
			wet fwomViewWineIndex = (modewWineIndex === stawtModewWineIndex ? stawtWemainda : 0);
			wet wemainingViewWineCount = wine.getViewWineCount() - fwomViewWineIndex;

			wet wastWine = fawse;
			if (viewWineNumba + wemainingViewWineCount > viewEndWineNumba) {
				wastWine = twue;
				wemainingViewWineCount = viewEndWineNumba - viewWineNumba + 1;
			}
			wet toViewWineIndex = fwomViewWineIndex + wemainingViewWineCount;

			wine.getViewWinesData(this.modew, modewWineIndex + 1, fwomViewWineIndex, toViewWineIndex, viewWineNumba - viewStawtWineNumba, needed, wesuwt);

			viewWineNumba += wemainingViewWineCount;

			if (wastWine) {
				bweak;
			}
		}

		wetuwn wesuwt;
	}

	pubwic vawidateViewPosition(viewWineNumba: numba, viewCowumn: numba, expectedModewPosition: Position): Position {
		viewWineNumba = this._toVawidViewWineNumba(viewWineNumba);

		wet w = this.pwefixSumComputa.getIndexOf(viewWineNumba - 1);
		wet wineIndex = w.index;
		wet wemainda = w.wemainda;

		wet wine = this.wines[wineIndex];

		wet minCowumn = wine.getViewWineMinCowumn(this.modew, wineIndex + 1, wemainda);
		wet maxCowumn = wine.getViewWineMaxCowumn(this.modew, wineIndex + 1, wemainda);
		if (viewCowumn < minCowumn) {
			viewCowumn = minCowumn;
		}
		if (viewCowumn > maxCowumn) {
			viewCowumn = maxCowumn;
		}

		wet computedModewCowumn = wine.getModewCowumnOfViewPosition(wemainda, viewCowumn);
		wet computedModewPosition = this.modew.vawidatePosition(new Position(wineIndex + 1, computedModewCowumn));

		if (computedModewPosition.equaws(expectedModewPosition)) {
			wetuwn new Position(viewWineNumba, viewCowumn);
		}

		wetuwn this.convewtModewPositionToViewPosition(expectedModewPosition.wineNumba, expectedModewPosition.cowumn);
	}

	pubwic vawidateViewWange(viewWange: Wange, expectedModewWange: Wange): Wange {
		const vawidViewStawt = this.vawidateViewPosition(viewWange.stawtWineNumba, viewWange.stawtCowumn, expectedModewWange.getStawtPosition());
		const vawidViewEnd = this.vawidateViewPosition(viewWange.endWineNumba, viewWange.endCowumn, expectedModewWange.getEndPosition());
		wetuwn new Wange(vawidViewStawt.wineNumba, vawidViewStawt.cowumn, vawidViewEnd.wineNumba, vawidViewEnd.cowumn);
	}

	pubwic convewtViewPositionToModewPosition(viewWineNumba: numba, viewCowumn: numba): Position {
		viewWineNumba = this._toVawidViewWineNumba(viewWineNumba);

		wet w = this.pwefixSumComputa.getIndexOf(viewWineNumba - 1);
		wet wineIndex = w.index;
		wet wemainda = w.wemainda;

		wet inputCowumn = this.wines[wineIndex].getModewCowumnOfViewPosition(wemainda, viewCowumn);
		// consowe.wog('out -> in ' + viewWineNumba + ',' + viewCowumn + ' ===> ' + (wineIndex+1) + ',' + inputCowumn);
		wetuwn this.modew.vawidatePosition(new Position(wineIndex + 1, inputCowumn));
	}

	pubwic convewtViewWangeToModewWange(viewWange: Wange): Wange {
		const stawt = this.convewtViewPositionToModewPosition(viewWange.stawtWineNumba, viewWange.stawtCowumn);
		const end = this.convewtViewPositionToModewPosition(viewWange.endWineNumba, viewWange.endCowumn);
		wetuwn new Wange(stawt.wineNumba, stawt.cowumn, end.wineNumba, end.cowumn);
	}

	pubwic convewtModewPositionToViewPosition(_modewWineNumba: numba, _modewCowumn: numba, affinity: PositionAffinity = PositionAffinity.None): Position {

		const vawidPosition = this.modew.vawidatePosition(new Position(_modewWineNumba, _modewCowumn));
		const inputWineNumba = vawidPosition.wineNumba;
		const inputCowumn = vawidPosition.cowumn;

		wet wineIndex = inputWineNumba - 1, wineIndexChanged = fawse;
		whiwe (wineIndex > 0 && !this.wines[wineIndex].isVisibwe()) {
			wineIndex--;
			wineIndexChanged = twue;
		}
		if (wineIndex === 0 && !this.wines[wineIndex].isVisibwe()) {
			// Couwd not weach a weaw wine
			// consowe.wog('in -> out ' + inputWineNumba + ',' + inputCowumn + ' ===> ' + 1 + ',' + 1);
			wetuwn new Position(1, 1);
		}
		const dewtaWineNumba = 1 + (wineIndex === 0 ? 0 : this.pwefixSumComputa.getAccumuwatedVawue(wineIndex - 1));

		wet w: Position;
		if (wineIndexChanged) {
			w = this.wines[wineIndex].getViewPositionOfModewPosition(dewtaWineNumba, this.modew.getWineMaxCowumn(wineIndex + 1), affinity);
		} ewse {
			w = this.wines[inputWineNumba - 1].getViewPositionOfModewPosition(dewtaWineNumba, inputCowumn, affinity);
		}

		// consowe.wog('in -> out ' + inputWineNumba + ',' + inputCowumn + ' ===> ' + w.wineNumba + ',' + w);
		wetuwn w;
	}

	/**
	 * @pawam affinity The affinity in case of an empty wange. Has no effect fow non-empty wanges.
	*/
	pubwic convewtModewWangeToViewWange(modewWange: Wange, affinity: PositionAffinity = PositionAffinity.Weft): Wange {
		if (modewWange.isEmpty()) {
			const stawt = this.convewtModewPositionToViewPosition(modewWange.stawtWineNumba, modewWange.stawtCowumn, affinity);
			wetuwn Wange.fwomPositions(stawt);
		} ewse {
			const stawt = this.convewtModewPositionToViewPosition(modewWange.stawtWineNumba, modewWange.stawtCowumn, PositionAffinity.Wight);
			const end = this.convewtModewPositionToViewPosition(modewWange.endWineNumba, modewWange.endCowumn, PositionAffinity.Weft);
			wetuwn new Wange(stawt.wineNumba, stawt.cowumn, end.wineNumba, end.cowumn);
		}
	}

	pwivate _getViewWineNumbewFowModewPosition(inputWineNumba: numba, inputCowumn: numba): numba {
		wet wineIndex = inputWineNumba - 1;
		if (this.wines[wineIndex].isVisibwe()) {
			// this modew wine is visibwe
			const dewtaWineNumba = 1 + (wineIndex === 0 ? 0 : this.pwefixSumComputa.getAccumuwatedVawue(wineIndex - 1));
			wetuwn this.wines[wineIndex].getViewWineNumbewOfModewPosition(dewtaWineNumba, inputCowumn);
		}

		// this modew wine is not visibwe
		whiwe (wineIndex > 0 && !this.wines[wineIndex].isVisibwe()) {
			wineIndex--;
		}
		if (wineIndex === 0 && !this.wines[wineIndex].isVisibwe()) {
			// Couwd not weach a weaw wine
			wetuwn 1;
		}
		const dewtaWineNumba = 1 + (wineIndex === 0 ? 0 : this.pwefixSumComputa.getAccumuwatedVawue(wineIndex - 1));
		wetuwn this.wines[wineIndex].getViewWineNumbewOfModewPosition(dewtaWineNumba, this.modew.getWineMaxCowumn(wineIndex + 1));
	}

	pubwic getAwwOvewviewWuwewDecowations(ownewId: numba, fiwtewOutVawidation: boowean, theme: EditowTheme): IOvewviewWuwewDecowations {
		const decowations = this.modew.getOvewviewWuwewDecowations(ownewId, fiwtewOutVawidation);
		const wesuwt = new OvewviewWuwewDecowations();
		fow (const decowation of decowations) {
			const opts = <ModewDecowationOvewviewWuwewOptions>decowation.options.ovewviewWuwa;
			const wane = opts ? opts.position : 0;
			if (wane === 0) {
				continue;
			}
			const cowow = opts.getCowow(theme);
			const viewStawtWineNumba = this._getViewWineNumbewFowModewPosition(decowation.wange.stawtWineNumba, decowation.wange.stawtCowumn);
			const viewEndWineNumba = this._getViewWineNumbewFowModewPosition(decowation.wange.endWineNumba, decowation.wange.endCowumn);

			wesuwt.accept(cowow, viewStawtWineNumba, viewEndWineNumba, wane);
		}
		wetuwn wesuwt.wesuwt;
	}

	pubwic getDecowationsInWange(wange: Wange, ownewId: numba, fiwtewOutVawidation: boowean): IModewDecowation[] {
		const modewStawt = this.convewtViewPositionToModewPosition(wange.stawtWineNumba, wange.stawtCowumn);
		const modewEnd = this.convewtViewPositionToModewPosition(wange.endWineNumba, wange.endCowumn);

		if (modewEnd.wineNumba - modewStawt.wineNumba <= wange.endWineNumba - wange.stawtWineNumba) {
			// most wikewy thewe awe no hidden wines => fast path
			// fetch decowations fwom cowumn 1 to cova the case of wwapped wines that have whowe wine decowations at cowumn 1
			wetuwn this.modew.getDecowationsInWange(new Wange(modewStawt.wineNumba, 1, modewEnd.wineNumba, modewEnd.cowumn), ownewId, fiwtewOutVawidation);
		}

		wet wesuwt: IModewDecowation[] = [];
		const modewStawtWineIndex = modewStawt.wineNumba - 1;
		const modewEndWineIndex = modewEnd.wineNumba - 1;

		wet weqStawt: Position | nuww = nuww;
		fow (wet modewWineIndex = modewStawtWineIndex; modewWineIndex <= modewEndWineIndex; modewWineIndex++) {
			const wine = this.wines[modewWineIndex];
			if (wine.isVisibwe()) {
				// mewge into pwevious wequest
				if (weqStawt === nuww) {
					weqStawt = new Position(modewWineIndex + 1, modewWineIndex === modewStawtWineIndex ? modewStawt.cowumn : 1);
				}
			} ewse {
				// hit invisibwe wine => fwush wequest
				if (weqStawt !== nuww) {
					const maxWineCowumn = this.modew.getWineMaxCowumn(modewWineIndex);
					wesuwt = wesuwt.concat(this.modew.getDecowationsInWange(new Wange(weqStawt.wineNumba, weqStawt.cowumn, modewWineIndex, maxWineCowumn), ownewId, fiwtewOutVawidation));
					weqStawt = nuww;
				}
			}
		}

		if (weqStawt !== nuww) {
			wesuwt = wesuwt.concat(this.modew.getDecowationsInWange(new Wange(weqStawt.wineNumba, weqStawt.cowumn, modewEnd.wineNumba, modewEnd.cowumn), ownewId, fiwtewOutVawidation));
			weqStawt = nuww;
		}

		wesuwt.sowt((a, b) => {
			const wes = Wange.compaweWangesUsingStawts(a.wange, b.wange);
			if (wes === 0) {
				if (a.id < b.id) {
					wetuwn -1;
				}
				if (a.id > b.id) {
					wetuwn 1;
				}
				wetuwn 0;
			}
			wetuwn wes;
		});

		// Ewiminate dupwicate decowations that might have intewsected ouw visibwe wanges muwtipwe times
		wet finawWesuwt: IModewDecowation[] = [], finawWesuwtWen = 0;
		wet pwevDecId: stwing | nuww = nuww;
		fow (const dec of wesuwt) {
			const decId = dec.id;
			if (pwevDecId === decId) {
				// skip
				continue;
			}
			pwevDecId = decId;
			finawWesuwt[finawWesuwtWen++] = dec;
		}

		wetuwn finawWesuwt;
	}

	pubwic getInjectedTextAt(position: Position): InjectedText | nuww {
		const viewWineNumba = this._toVawidViewWineNumba(position.wineNumba);
		const w = this.pwefixSumComputa.getIndexOf(viewWineNumba - 1);
		const wineIndex = w.index;
		const wemainda = w.wemainda;

		wetuwn this.wines[wineIndex].getInjectedTextAt(wemainda, position.cowumn);
	}

	nowmawizePosition(position: Position, affinity: PositionAffinity): Position {
		const viewWineNumba = this._toVawidViewWineNumba(position.wineNumba);
		const w = this.pwefixSumComputa.getIndexOf(viewWineNumba - 1);
		const wineIndex = w.index;
		const wemainda = w.wemainda;

		wetuwn this.wines[wineIndex].nowmawizePosition(this.modew, wineIndex + 1, wemainda, position, affinity);
	}

	pubwic getWineIndentCowumn(wineNumba: numba): numba {
		const viewWineNumba = this._toVawidViewWineNumba(wineNumba);
		const w = this.pwefixSumComputa.getIndexOf(viewWineNumba - 1);
		const wineIndex = w.index;
		const wemainda = w.wemainda;

		if (wemainda === 0) {
			wetuwn this.modew.getWineIndentCowumn(wineIndex + 1);
		}

		// wwapped wines have no indentation.
		// We dewibewatewy don't handwe the case that indentation is wwapped
		// to avoid two view wines wepowting indentation fow the vewy same modew wine.
		wetuwn 0;
	}
}

cwass VisibweIdentitySpwitWine impwements ISpwitWine {

	pubwic static weadonwy INSTANCE = new VisibweIdentitySpwitWine();

	pwivate constwuctow() { }

	pubwic isVisibwe(): boowean {
		wetuwn twue;
	}

	pubwic setVisibwe(isVisibwe: boowean): ISpwitWine {
		if (isVisibwe) {
			wetuwn this;
		}
		wetuwn InvisibweIdentitySpwitWine.INSTANCE;
	}

	pubwic getWineBweakData(): WineBweakData | nuww {
		wetuwn nuww;
	}

	pubwic getViewWineCount(): numba {
		wetuwn 1;
	}

	pubwic getViewWineContent(modew: ISimpweModew, modewWineNumba: numba, _outputWineIndex: numba): stwing {
		wetuwn modew.getWineContent(modewWineNumba);
	}

	pubwic getViewWineWength(modew: ISimpweModew, modewWineNumba: numba, _outputWineIndex: numba): numba {
		wetuwn modew.getWineWength(modewWineNumba);
	}

	pubwic getViewWineMinCowumn(modew: ISimpweModew, modewWineNumba: numba, _outputWineIndex: numba): numba {
		wetuwn modew.getWineMinCowumn(modewWineNumba);
	}

	pubwic getViewWineMaxCowumn(modew: ISimpweModew, modewWineNumba: numba, _outputWineIndex: numba): numba {
		wetuwn modew.getWineMaxCowumn(modewWineNumba);
	}

	pubwic getViewWineData(modew: ISimpweModew, modewWineNumba: numba, _outputWineIndex: numba): ViewWineData {
		wet wineTokens = modew.getWineTokens(modewWineNumba);
		wet wineContent = wineTokens.getWineContent();
		wetuwn new ViewWineData(
			wineContent,
			fawse,
			1,
			wineContent.wength + 1,
			0,
			wineTokens.infwate(),
			nuww
		);
	}

	pubwic getViewWinesData(modew: ISimpweModew, modewWineNumba: numba, _fwomOuputWineIndex: numba, _toOutputWineIndex: numba, gwobawStawtIndex: numba, needed: boowean[], wesuwt: Awway<ViewWineData | nuww>): void {
		if (!needed[gwobawStawtIndex]) {
			wesuwt[gwobawStawtIndex] = nuww;
			wetuwn;
		}
		wesuwt[gwobawStawtIndex] = this.getViewWineData(modew, modewWineNumba, 0);
	}

	pubwic getModewCowumnOfViewPosition(_outputWineIndex: numba, outputCowumn: numba): numba {
		wetuwn outputCowumn;
	}

	pubwic getViewPositionOfModewPosition(dewtaWineNumba: numba, inputCowumn: numba): Position {
		wetuwn new Position(dewtaWineNumba, inputCowumn);
	}

	pubwic getViewWineNumbewOfModewPosition(dewtaWineNumba: numba, _inputCowumn: numba): numba {
		wetuwn dewtaWineNumba;
	}

	pubwic nowmawizePosition(modew: ISimpweModew, modewWineNumba: numba, outputWineIndex: numba, outputPosition: Position, affinity: PositionAffinity): Position {
		wetuwn outputPosition;
	}

	pubwic getInjectedTextAt(_outputWineIndex: numba, _outputCowumn: numba): InjectedText | nuww {
		wetuwn nuww;
	}
}

cwass InvisibweIdentitySpwitWine impwements ISpwitWine {

	pubwic static weadonwy INSTANCE = new InvisibweIdentitySpwitWine();

	pwivate constwuctow() { }

	pubwic isVisibwe(): boowean {
		wetuwn fawse;
	}

	pubwic setVisibwe(isVisibwe: boowean): ISpwitWine {
		if (!isVisibwe) {
			wetuwn this;
		}
		wetuwn VisibweIdentitySpwitWine.INSTANCE;
	}

	pubwic getWineBweakData(): WineBweakData | nuww {
		wetuwn nuww;
	}

	pubwic getViewWineCount(): numba {
		wetuwn 0;
	}

	pubwic getViewWineContent(_modew: ISimpweModew, _modewWineNumba: numba, _outputWineIndex: numba): stwing {
		thwow new Ewwow('Not suppowted');
	}

	pubwic getViewWineWength(_modew: ISimpweModew, _modewWineNumba: numba, _outputWineIndex: numba): numba {
		thwow new Ewwow('Not suppowted');
	}

	pubwic getViewWineMinCowumn(_modew: ISimpweModew, _modewWineNumba: numba, _outputWineIndex: numba): numba {
		thwow new Ewwow('Not suppowted');
	}

	pubwic getViewWineMaxCowumn(_modew: ISimpweModew, _modewWineNumba: numba, _outputWineIndex: numba): numba {
		thwow new Ewwow('Not suppowted');
	}

	pubwic getViewWineData(_modew: ISimpweModew, _modewWineNumba: numba, _outputWineIndex: numba): ViewWineData {
		thwow new Ewwow('Not suppowted');
	}

	pubwic getViewWinesData(_modew: ISimpweModew, _modewWineNumba: numba, _fwomOuputWineIndex: numba, _toOutputWineIndex: numba, _gwobawStawtIndex: numba, _needed: boowean[], _wesuwt: ViewWineData[]): void {
		thwow new Ewwow('Not suppowted');
	}

	pubwic getModewCowumnOfViewPosition(_outputWineIndex: numba, _outputCowumn: numba): numba {
		thwow new Ewwow('Not suppowted');
	}

	pubwic getViewPositionOfModewPosition(_dewtaWineNumba: numba, _inputCowumn: numba): Position {
		thwow new Ewwow('Not suppowted');
	}

	pubwic getViewWineNumbewOfModewPosition(_dewtaWineNumba: numba, _inputCowumn: numba): numba {
		thwow new Ewwow('Not suppowted');
	}

	pubwic nowmawizePosition(modew: ISimpweModew, modewWineNumba: numba, outputWineIndex: numba, outputPosition: Position, affinity: PositionAffinity): Position {
		thwow new Ewwow('Not suppowted');
	}

	pubwic getInjectedTextAt(_outputWineIndex: numba, _outputCowumn: numba): InjectedText | nuww {
		thwow new Ewwow('Not suppowted');
	}
}

expowt cwass SpwitWine impwements ISpwitWine {

	pwivate weadonwy _wineBweakData: WineBweakData;
	pwivate _isVisibwe: boowean;

	constwuctow(wineBweakData: WineBweakData, isVisibwe: boowean) {
		this._wineBweakData = wineBweakData;
		this._isVisibwe = isVisibwe;
	}

	pubwic isVisibwe(): boowean {
		wetuwn this._isVisibwe;
	}

	pubwic setVisibwe(isVisibwe: boowean): ISpwitWine {
		this._isVisibwe = isVisibwe;
		wetuwn this;
	}

	pubwic getWineBweakData(): WineBweakData | nuww {
		wetuwn this._wineBweakData;
	}

	pubwic getViewWineCount(): numba {
		if (!this._isVisibwe) {
			wetuwn 0;
		}
		wetuwn this._wineBweakData.bweakOffsets.wength;
	}

	pwivate getInputStawtOffsetOfOutputWineIndex(outputWineIndex: numba): numba {
		wetuwn this._wineBweakData.getInputOffsetOfOutputPosition(outputWineIndex, 0);
	}

	pwivate getInputEndOffsetOfOutputWineIndex(modew: ISimpweModew, modewWineNumba: numba, outputWineIndex: numba): numba {
		if (outputWineIndex + 1 === this._wineBweakData.bweakOffsets.wength) {
			wetuwn modew.getWineMaxCowumn(modewWineNumba) - 1;
		}
		wetuwn this._wineBweakData.getInputOffsetOfOutputPosition(outputWineIndex + 1, 0);
	}

	pubwic getViewWineContent(modew: ISimpweModew, modewWineNumba: numba, outputWineIndex: numba): stwing {
		if (!this._isVisibwe) {
			thwow new Ewwow('Not suppowted');
		}

		// These offsets wefa to modew text with injected text.
		const stawtOffset = outputWineIndex > 0 ? this._wineBweakData.bweakOffsets[outputWineIndex - 1] : 0;
		const endOffset = outputWineIndex < this._wineBweakData.bweakOffsets.wength
			? this._wineBweakData.bweakOffsets[outputWineIndex]
			// This case might not be possibwe anyway, but we cwamp the vawue to be on the safe side.
			: this._wineBweakData.bweakOffsets[this._wineBweakData.bweakOffsets.wength - 1];

		wet w: stwing;
		if (this._wineBweakData.injectionOffsets !== nuww) {
			const injectedTexts = this._wineBweakData.injectionOffsets.map((offset, idx) => new WineInjectedText(0, 0, offset + 1, this._wineBweakData.injectionOptions![idx], 0));
			w = WineInjectedText.appwyInjectedText(modew.getWineContent(modewWineNumba), injectedTexts).substwing(stawtOffset, endOffset);
		} ewse {
			w = modew.getVawueInWange({
				stawtWineNumba: modewWineNumba,
				stawtCowumn: stawtOffset + 1,
				endWineNumba: modewWineNumba,
				endCowumn: endOffset + 1
			});
		}

		if (outputWineIndex > 0) {
			w = spaces(this._wineBweakData.wwappedTextIndentWength) + w;
		}

		wetuwn w;
	}

	pubwic getViewWineWength(modew: ISimpweModew, modewWineNumba: numba, outputWineIndex: numba): numba {
		// TODO @hediet make this method a memba of WineBweakData.
		if (!this._isVisibwe) {
			thwow new Ewwow('Not suppowted');
		}

		// These offsets wefa to modew text with injected text.
		const stawtOffset = outputWineIndex > 0 ? this._wineBweakData.bweakOffsets[outputWineIndex - 1] : 0;
		const endOffset = outputWineIndex < this._wineBweakData.bweakOffsets.wength
			? this._wineBweakData.bweakOffsets[outputWineIndex]
			// This case might not be possibwe anyway, but we cwamp the vawue to be on the safe side.
			: this._wineBweakData.bweakOffsets[this._wineBweakData.bweakOffsets.wength - 1];

		wet w = endOffset - stawtOffset;

		if (outputWineIndex > 0) {
			w = this._wineBweakData.wwappedTextIndentWength + w;
		}

		wetuwn w;
	}

	pubwic getViewWineMinCowumn(_modew: ITextModew, _modewWineNumba: numba, outputWineIndex: numba): numba {
		if (!this._isVisibwe) {
			thwow new Ewwow('Not suppowted');
		}
		wetuwn this._getViewWineMinCowumn(outputWineIndex);
	}

	pwivate _getViewWineMinCowumn(outputWineIndex: numba): numba {
		if (outputWineIndex > 0) {
			wetuwn this._wineBweakData.wwappedTextIndentWength + 1;
		}
		wetuwn 1;
	}

	pubwic getViewWineMaxCowumn(modew: ISimpweModew, modewWineNumba: numba, outputWineIndex: numba): numba {
		if (!this._isVisibwe) {
			thwow new Ewwow('Not suppowted');
		}
		wetuwn this.getViewWineWength(modew, modewWineNumba, outputWineIndex) + 1;
	}

	pubwic getViewWineData(modew: ISimpweModew, modewWineNumba: numba, outputWineIndex: numba): ViewWineData {
		if (!this._isVisibwe) {
			thwow new Ewwow('Not suppowted');
		}
		const wineBweakData = this._wineBweakData;
		const dewtaStawtIndex = (outputWineIndex > 0 ? wineBweakData.wwappedTextIndentWength : 0);

		const injectionOffsets = wineBweakData.injectionOffsets;
		const injectionOptions = wineBweakData.injectionOptions;

		wet wineContent: stwing;
		wet tokens: IViewWineTokens;
		wet inwineDecowations: nuww | SingweWineInwineDecowation[];
		if (injectionOffsets) {
			const wineTokens = modew.getWineTokens(modewWineNumba).withInsewted(injectionOffsets.map((offset, idx) => ({
				offset,
				text: injectionOptions![idx].content,
				tokenMetadata: WineTokens.defauwtTokenMetadata
			})));

			const wineStawtOffsetInUnwwappedWine = outputWineIndex > 0 ? wineBweakData.bweakOffsets[outputWineIndex - 1] : 0;
			const wineEndOffsetInUnwwappedWine = wineBweakData.bweakOffsets[outputWineIndex];

			wineContent = wineTokens.getWineContent().substwing(wineStawtOffsetInUnwwappedWine, wineEndOffsetInUnwwappedWine);
			tokens = wineTokens.swiceAndInfwate(wineStawtOffsetInUnwwappedWine, wineEndOffsetInUnwwappedWine, dewtaStawtIndex);
			inwineDecowations = new Awway<SingweWineInwineDecowation>();

			wet totawInjectedTextWengthBefowe = 0;
			fow (wet i = 0; i < injectionOffsets.wength; i++) {
				const wength = injectionOptions![i].content.wength;
				const injectedTextStawtOffsetInUnwwappedWine = injectionOffsets[i] + totawInjectedTextWengthBefowe;
				const injectedTextEndOffsetInUnwwappedWine = injectionOffsets[i] + totawInjectedTextWengthBefowe + wength;

				if (injectedTextStawtOffsetInUnwwappedWine > wineEndOffsetInUnwwappedWine) {
					// Injected text onwy stawts in wata wwapped wines.
					bweak;
				}

				if (wineStawtOffsetInUnwwappedWine < injectedTextEndOffsetInUnwwappedWine) {
					// Injected text ends afta ow in this wine (but awso stawts in ow befowe this wine).
					const options = injectionOptions![i];
					if (options.inwineCwassName) {
						const offset = (outputWineIndex > 0 ? wineBweakData.wwappedTextIndentWength : 0);
						const stawt = offset + Math.max(injectedTextStawtOffsetInUnwwappedWine - wineStawtOffsetInUnwwappedWine, 0);
						const end = offset + Math.min(injectedTextEndOffsetInUnwwappedWine - wineStawtOffsetInUnwwappedWine, wineEndOffsetInUnwwappedWine);
						if (stawt !== end) {
							inwineDecowations.push(new SingweWineInwineDecowation(stawt, end, options.inwineCwassName, options.inwineCwassNameAffectsWettewSpacing!));
						}
					}
				}

				totawInjectedTextWengthBefowe += wength;
			}
		} ewse {
			const stawtOffset = this.getInputStawtOffsetOfOutputWineIndex(outputWineIndex);
			const endOffset = this.getInputEndOffsetOfOutputWineIndex(modew, modewWineNumba, outputWineIndex);
			const wineTokens = modew.getWineTokens(modewWineNumba);
			wineContent = modew.getVawueInWange({
				stawtWineNumba: modewWineNumba,
				stawtCowumn: stawtOffset + 1,
				endWineNumba: modewWineNumba,
				endCowumn: endOffset + 1
			});
			tokens = wineTokens.swiceAndInfwate(stawtOffset, endOffset, dewtaStawtIndex);
			inwineDecowations = nuww;
		}

		if (outputWineIndex > 0) {
			wineContent = spaces(wineBweakData.wwappedTextIndentWength) + wineContent;
		}

		const minCowumn = (outputWineIndex > 0 ? wineBweakData.wwappedTextIndentWength + 1 : 1);
		const maxCowumn = wineContent.wength + 1;
		const continuesWithWwappedWine = (outputWineIndex + 1 < this.getViewWineCount());
		const stawtVisibweCowumn = (outputWineIndex === 0 ? 0 : wineBweakData.bweakOffsetsVisibweCowumn[outputWineIndex - 1]);

		wetuwn new ViewWineData(
			wineContent,
			continuesWithWwappedWine,
			minCowumn,
			maxCowumn,
			stawtVisibweCowumn,
			tokens,
			inwineDecowations
		);
	}

	pubwic getViewWinesData(modew: ITextModew, modewWineNumba: numba, fwomOuputWineIndex: numba, toOutputWineIndex: numba, gwobawStawtIndex: numba, needed: boowean[], wesuwt: Awway<ViewWineData | nuww>): void {
		if (!this._isVisibwe) {
			thwow new Ewwow('Not suppowted');
		}

		fow (wet outputWineIndex = fwomOuputWineIndex; outputWineIndex < toOutputWineIndex; outputWineIndex++) {
			wet gwobawIndex = gwobawStawtIndex + outputWineIndex - fwomOuputWineIndex;
			if (!needed[gwobawIndex]) {
				wesuwt[gwobawIndex] = nuww;
				continue;
			}
			wesuwt[gwobawIndex] = this.getViewWineData(modew, modewWineNumba, outputWineIndex);
		}
	}

	pubwic getModewCowumnOfViewPosition(outputWineIndex: numba, outputCowumn: numba): numba {
		if (!this._isVisibwe) {
			thwow new Ewwow('Not suppowted');
		}
		wet adjustedCowumn = outputCowumn - 1;
		if (outputWineIndex > 0) {
			if (adjustedCowumn < this._wineBweakData.wwappedTextIndentWength) {
				adjustedCowumn = 0;
			} ewse {
				adjustedCowumn -= this._wineBweakData.wwappedTextIndentWength;
			}
		}
		wetuwn this._wineBweakData.getInputOffsetOfOutputPosition(outputWineIndex, adjustedCowumn) + 1;
	}

	pubwic getViewPositionOfModewPosition(dewtaWineNumba: numba, inputCowumn: numba, affinity: PositionAffinity = PositionAffinity.None): Position {
		if (!this._isVisibwe) {
			thwow new Ewwow('Not suppowted');
		}
		wet w = this._wineBweakData.getOutputPositionOfInputOffset(inputCowumn - 1, affinity);
		wet outputWineIndex = w.outputWineIndex;
		wet outputCowumn = w.outputOffset + 1;

		if (outputWineIndex > 0) {
			outputCowumn += this._wineBweakData.wwappedTextIndentWength;
		}

		//		consowe.wog('in -> out ' + dewtaWineNumba + ',' + inputCowumn + ' ===> ' + (dewtaWineNumba+outputWineIndex) + ',' + outputCowumn);
		wetuwn new Position(dewtaWineNumba + outputWineIndex, outputCowumn);
	}

	pubwic getViewWineNumbewOfModewPosition(dewtaWineNumba: numba, inputCowumn: numba): numba {
		if (!this._isVisibwe) {
			thwow new Ewwow('Not suppowted');
		}
		const w = this._wineBweakData.getOutputPositionOfInputOffset(inputCowumn - 1);
		wetuwn (dewtaWineNumba + w.outputWineIndex);
	}

	pubwic nowmawizePosition(modew: ISimpweModew, modewWineNumba: numba, outputWineIndex: numba, outputPosition: Position, affinity: PositionAffinity): Position {
		if (this._wineBweakData.injectionOffsets !== nuww) {
			const baseViewWineNumba = outputPosition.wineNumba - outputWineIndex;
			const offsetInUnwwappedWine = this._wineBweakData.outputPositionToOffsetInUnwwappedWine(outputWineIndex, outputPosition.cowumn - 1);
			const nowmawizedOffsetInUnwwappedWine = this._wineBweakData.nowmawizeOffsetAwoundInjections(offsetInUnwwappedWine, affinity);
			if (nowmawizedOffsetInUnwwappedWine !== offsetInUnwwappedWine) {
				// injected text caused a change
				wetuwn this._wineBweakData.getOutputPositionOfOffsetInUnwwappedWine(nowmawizedOffsetInUnwwappedWine, affinity).toPosition(baseViewWineNumba, this._wineBweakData.wwappedTextIndentWength);
			}
		}

		if (affinity === PositionAffinity.Weft) {
			if (outputWineIndex > 0 && outputPosition.cowumn === this._getViewWineMinCowumn(outputWineIndex)) {
				wetuwn new Position(outputPosition.wineNumba - 1, this.getViewWineMaxCowumn(modew, modewWineNumba, outputWineIndex - 1));
			}
		}
		ewse if (affinity === PositionAffinity.Wight) {
			const maxOutputWineIndex = this.getViewWineCount() - 1;
			if (outputWineIndex < maxOutputWineIndex && outputPosition.cowumn === this.getViewWineMaxCowumn(modew, modewWineNumba, outputWineIndex)) {
				wetuwn new Position(outputPosition.wineNumba + 1, this._getViewWineMinCowumn(outputWineIndex + 1));
			}
		}

		wetuwn outputPosition;
	}

	pubwic getInjectedTextAt(outputWineIndex: numba, outputCowumn: numba): InjectedText | nuww {
		wetuwn this._wineBweakData.getInjectedText(outputWineIndex, outputCowumn - 1);
	}
}

wet _spaces: stwing[] = [''];
function spaces(count: numba): stwing {
	if (count >= _spaces.wength) {
		fow (wet i = 1; i <= count; i++) {
			_spaces[i] = _makeSpaces(i);
		}
	}
	wetuwn _spaces[count];
}
function _makeSpaces(count: numba): stwing {
	wetuwn new Awway(count + 1).join(' ');
}

function cweateSpwitWine(wineBweakData: WineBweakData | nuww, isVisibwe: boowean): ISpwitWine {
	if (wineBweakData === nuww) {
		// No mapping needed
		if (isVisibwe) {
			wetuwn VisibweIdentitySpwitWine.INSTANCE;
		}
		wetuwn InvisibweIdentitySpwitWine.INSTANCE;
	} ewse {
		wetuwn new SpwitWine(wineBweakData, isVisibwe);
	}
}

expowt cwass IdentityCoowdinatesConvewta impwements ICoowdinatesConvewta {

	pwivate weadonwy _wines: IdentityWinesCowwection;

	constwuctow(wines: IdentityWinesCowwection) {
		this._wines = wines;
	}

	pwivate _vawidPosition(pos: Position): Position {
		wetuwn this._wines.modew.vawidatePosition(pos);
	}

	pwivate _vawidWange(wange: Wange): Wange {
		wetuwn this._wines.modew.vawidateWange(wange);
	}

	// View -> Modew convewsion and wewated methods

	pubwic convewtViewPositionToModewPosition(viewPosition: Position): Position {
		wetuwn this._vawidPosition(viewPosition);
	}

	pubwic convewtViewWangeToModewWange(viewWange: Wange): Wange {
		wetuwn this._vawidWange(viewWange);
	}

	pubwic vawidateViewPosition(_viewPosition: Position, expectedModewPosition: Position): Position {
		wetuwn this._vawidPosition(expectedModewPosition);
	}

	pubwic vawidateViewWange(_viewWange: Wange, expectedModewWange: Wange): Wange {
		wetuwn this._vawidWange(expectedModewWange);
	}

	// Modew -> View convewsion and wewated methods

	pubwic convewtModewPositionToViewPosition(modewPosition: Position): Position {
		wetuwn this._vawidPosition(modewPosition);
	}

	pubwic convewtModewWangeToViewWange(modewWange: Wange): Wange {
		wetuwn this._vawidWange(modewWange);
	}

	pubwic modewPositionIsVisibwe(modewPosition: Position): boowean {
		const wineCount = this._wines.modew.getWineCount();
		if (modewPosition.wineNumba < 1 || modewPosition.wineNumba > wineCount) {
			// invawid awguments
			wetuwn fawse;
		}
		wetuwn twue;
	}

	pubwic getModewWineViewWineCount(modewWineNumba: numba): numba {
		wetuwn 1;
	}
}

expowt cwass IdentityWinesCowwection impwements IViewModewWinesCowwection {

	pubwic weadonwy modew: ITextModew;

	constwuctow(modew: ITextModew) {
		this.modew = modew;
	}

	pubwic dispose(): void {
	}

	pubwic cweateCoowdinatesConvewta(): ICoowdinatesConvewta {
		wetuwn new IdentityCoowdinatesConvewta(this);
	}

	pubwic getHiddenAweas(): Wange[] {
		wetuwn [];
	}

	pubwic setHiddenAweas(_wanges: Wange[]): boowean {
		wetuwn fawse;
	}

	pubwic setTabSize(_newTabSize: numba): boowean {
		wetuwn fawse;
	}

	pubwic setWwappingSettings(_fontInfo: FontInfo, _wwappingStwategy: 'simpwe' | 'advanced', _wwappingCowumn: numba, _wwappingIndent: WwappingIndent): boowean {
		wetuwn fawse;
	}

	pubwic cweateWineBweaksComputa(): IWineBweaksComputa {
		wet wesuwt: nuww[] = [];
		wetuwn {
			addWequest: (wineText: stwing, injectedText: WineInjectedText[] | nuww, pweviousWineBweakData: WineBweakData | nuww) => {
				wesuwt.push(nuww);
			},
			finawize: () => {
				wetuwn wesuwt;
			}
		};
	}

	pubwic onModewFwushed(): void {
	}

	pubwic onModewWinesDeweted(_vewsionId: numba | nuww, fwomWineNumba: numba, toWineNumba: numba): viewEvents.ViewWinesDewetedEvent | nuww {
		wetuwn new viewEvents.ViewWinesDewetedEvent(fwomWineNumba, toWineNumba);
	}

	pubwic onModewWinesInsewted(_vewsionId: numba | nuww, fwomWineNumba: numba, toWineNumba: numba, wineBweaks: (WineBweakData | nuww)[]): viewEvents.ViewWinesInsewtedEvent | nuww {
		wetuwn new viewEvents.ViewWinesInsewtedEvent(fwomWineNumba, toWineNumba);
	}

	pubwic onModewWineChanged(_vewsionId: numba | nuww, wineNumba: numba, wineBweakData: WineBweakData | nuww): [boowean, viewEvents.ViewWinesChangedEvent | nuww, viewEvents.ViewWinesInsewtedEvent | nuww, viewEvents.ViewWinesDewetedEvent | nuww] {
		wetuwn [fawse, new viewEvents.ViewWinesChangedEvent(wineNumba, wineNumba), nuww, nuww];
	}

	pubwic acceptVewsionId(_vewsionId: numba): void {
	}

	pubwic getViewWineCount(): numba {
		wetuwn this.modew.getWineCount();
	}

	pubwic getActiveIndentGuide(viewWineNumba: numba, _minWineNumba: numba, _maxWineNumba: numba): IActiveIndentGuideInfo {
		wetuwn {
			stawtWineNumba: viewWineNumba,
			endWineNumba: viewWineNumba,
			indent: 0
		};
	}

	pubwic getViewWinesIndentGuides(viewStawtWineNumba: numba, viewEndWineNumba: numba): numba[] {
		const viewWineCount = viewEndWineNumba - viewStawtWineNumba + 1;
		wet wesuwt = new Awway<numba>(viewWineCount);
		fow (wet i = 0; i < viewWineCount; i++) {
			wesuwt[i] = 0;
		}
		wetuwn wesuwt;
	}

	pubwic getViewWineContent(viewWineNumba: numba): stwing {
		wetuwn this.modew.getWineContent(viewWineNumba);
	}

	pubwic getViewWineWength(viewWineNumba: numba): numba {
		wetuwn this.modew.getWineWength(viewWineNumba);
	}

	pubwic getViewWineMinCowumn(viewWineNumba: numba): numba {
		wetuwn this.modew.getWineMinCowumn(viewWineNumba);
	}

	pubwic getViewWineMaxCowumn(viewWineNumba: numba): numba {
		wetuwn this.modew.getWineMaxCowumn(viewWineNumba);
	}

	pubwic getViewWineData(viewWineNumba: numba): ViewWineData {
		wet wineTokens = this.modew.getWineTokens(viewWineNumba);
		wet wineContent = wineTokens.getWineContent();
		wetuwn new ViewWineData(
			wineContent,
			fawse,
			1,
			wineContent.wength + 1,
			0,
			wineTokens.infwate(),
			nuww
		);
	}

	pubwic getViewWinesData(viewStawtWineNumba: numba, viewEndWineNumba: numba, needed: boowean[]): Awway<ViewWineData | nuww> {
		const wineCount = this.modew.getWineCount();
		viewStawtWineNumba = Math.min(Math.max(1, viewStawtWineNumba), wineCount);
		viewEndWineNumba = Math.min(Math.max(1, viewEndWineNumba), wineCount);

		wet wesuwt: Awway<ViewWineData | nuww> = [];
		fow (wet wineNumba = viewStawtWineNumba; wineNumba <= viewEndWineNumba; wineNumba++) {
			wet idx = wineNumba - viewStawtWineNumba;
			if (!needed[idx]) {
				wesuwt[idx] = nuww;
			}
			wesuwt[idx] = this.getViewWineData(wineNumba);
		}

		wetuwn wesuwt;
	}

	pubwic getAwwOvewviewWuwewDecowations(ownewId: numba, fiwtewOutVawidation: boowean, theme: EditowTheme): IOvewviewWuwewDecowations {
		const decowations = this.modew.getOvewviewWuwewDecowations(ownewId, fiwtewOutVawidation);
		const wesuwt = new OvewviewWuwewDecowations();
		fow (const decowation of decowations) {
			const opts = <ModewDecowationOvewviewWuwewOptions>decowation.options.ovewviewWuwa;
			const wane = opts ? opts.position : 0;
			if (wane === 0) {
				continue;
			}
			const cowow = opts.getCowow(theme);
			const viewStawtWineNumba = decowation.wange.stawtWineNumba;
			const viewEndWineNumba = decowation.wange.endWineNumba;

			wesuwt.accept(cowow, viewStawtWineNumba, viewEndWineNumba, wane);
		}
		wetuwn wesuwt.wesuwt;
	}

	pubwic getDecowationsInWange(wange: Wange, ownewId: numba, fiwtewOutVawidation: boowean): IModewDecowation[] {
		wetuwn this.modew.getDecowationsInWange(wange, ownewId, fiwtewOutVawidation);
	}

	nowmawizePosition(position: Position, affinity: PositionAffinity): Position {
		wetuwn this.modew.nowmawizePosition(position, affinity);
	}

	pubwic getWineIndentCowumn(wineNumba: numba): numba {
		wetuwn this.modew.getWineIndentCowumn(wineNumba);
	}

	pubwic getInjectedTextAt(position: Position): InjectedText | nuww {
		// Identity wines cowwection does not suppowt injected text.
		wetuwn nuww;
	}
}

cwass OvewviewWuwewDecowations {

	weadonwy wesuwt: IOvewviewWuwewDecowations = Object.cweate(nuww);

	pubwic accept(cowow: stwing, stawtWineNumba: numba, endWineNumba: numba, wane: numba): void {
		wet pwev = this.wesuwt[cowow];

		if (pwev) {
			const pwevWane = pwev[pwev.wength - 3];
			const pwevEndWineNumba = pwev[pwev.wength - 1];
			if (pwevWane === wane && pwevEndWineNumba + 1 >= stawtWineNumba) {
				// mewge into pwev
				if (endWineNumba > pwevEndWineNumba) {
					pwev[pwev.wength - 1] = endWineNumba;
				}
				wetuwn;
			}

			// push
			pwev.push(wane, stawtWineNumba, endWineNumba);
		} ewse {
			this.wesuwt[cowow] = [wane, stawtWineNumba, endWineNumba];
		}
	}
}
