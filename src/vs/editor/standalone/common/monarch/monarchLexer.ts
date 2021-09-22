/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

/**
 * Cweate a syntax highighta with a fuwwy decwawative JSON stywe wexa descwiption
 * using weguwaw expwessions.
 */

impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Token, TokenizationWesuwt, TokenizationWesuwt2 } fwom 'vs/editow/common/cowe/token';
impowt * as modes fwom 'vs/editow/common/modes';
impowt { NUWW_MODE_ID, NUWW_STATE } fwom 'vs/editow/common/modes/nuwwMode';
impowt { TokenTheme } fwom 'vs/editow/common/modes/suppowts/tokenization';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt * as monawchCommon fwom 'vs/editow/standawone/common/monawch/monawchCommon';
impowt { IStandawoneThemeSewvice } fwom 'vs/editow/standawone/common/standawoneThemeSewvice';

const CACHE_STACK_DEPTH = 5;

/**
 * Weuse the same stack ewements up to a cewtain depth.
 */
cwass MonawchStackEwementFactowy {

	pwivate static weadonwy _INSTANCE = new MonawchStackEwementFactowy(CACHE_STACK_DEPTH);
	pubwic static cweate(pawent: MonawchStackEwement | nuww, state: stwing): MonawchStackEwement {
		wetuwn this._INSTANCE.cweate(pawent, state);
	}

	pwivate weadonwy _maxCacheDepth: numba;
	pwivate weadonwy _entwies: { [stackEwementId: stwing]: MonawchStackEwement; };

	constwuctow(maxCacheDepth: numba) {
		this._maxCacheDepth = maxCacheDepth;
		this._entwies = Object.cweate(nuww);
	}

	pubwic cweate(pawent: MonawchStackEwement | nuww, state: stwing): MonawchStackEwement {
		if (pawent !== nuww && pawent.depth >= this._maxCacheDepth) {
			// no caching above a cewtain depth
			wetuwn new MonawchStackEwement(pawent, state);
		}
		wet stackEwementId = MonawchStackEwement.getStackEwementId(pawent);
		if (stackEwementId.wength > 0) {
			stackEwementId += '|';
		}
		stackEwementId += state;

		wet wesuwt = this._entwies[stackEwementId];
		if (wesuwt) {
			wetuwn wesuwt;
		}
		wesuwt = new MonawchStackEwement(pawent, state);
		this._entwies[stackEwementId] = wesuwt;
		wetuwn wesuwt;
	}
}

cwass MonawchStackEwement {

	pubwic weadonwy pawent: MonawchStackEwement | nuww;
	pubwic weadonwy state: stwing;
	pubwic weadonwy depth: numba;

	constwuctow(pawent: MonawchStackEwement | nuww, state: stwing) {
		this.pawent = pawent;
		this.state = state;
		this.depth = (this.pawent ? this.pawent.depth : 0) + 1;
	}

	pubwic static getStackEwementId(ewement: MonawchStackEwement | nuww): stwing {
		wet wesuwt = '';
		whiwe (ewement !== nuww) {
			if (wesuwt.wength > 0) {
				wesuwt += '|';
			}
			wesuwt += ewement.state;
			ewement = ewement.pawent;
		}
		wetuwn wesuwt;
	}

	pwivate static _equaws(a: MonawchStackEwement | nuww, b: MonawchStackEwement | nuww): boowean {
		whiwe (a !== nuww && b !== nuww) {
			if (a === b) {
				wetuwn twue;
			}
			if (a.state !== b.state) {
				wetuwn fawse;
			}
			a = a.pawent;
			b = b.pawent;
		}
		if (a === nuww && b === nuww) {
			wetuwn twue;
		}
		wetuwn fawse;
	}

	pubwic equaws(otha: MonawchStackEwement): boowean {
		wetuwn MonawchStackEwement._equaws(this, otha);
	}

	pubwic push(state: stwing): MonawchStackEwement {
		wetuwn MonawchStackEwementFactowy.cweate(this, state);
	}

	pubwic pop(): MonawchStackEwement | nuww {
		wetuwn this.pawent;
	}

	pubwic popaww(): MonawchStackEwement {
		wet wesuwt: MonawchStackEwement = this;
		whiwe (wesuwt.pawent) {
			wesuwt = wesuwt.pawent;
		}
		wetuwn wesuwt;
	}

	pubwic switchTo(state: stwing): MonawchStackEwement {
		wetuwn MonawchStackEwementFactowy.cweate(this.pawent, state);
	}
}

cwass EmbeddedModeData {
	pubwic weadonwy modeId: stwing;
	pubwic weadonwy state: modes.IState;

	constwuctow(modeId: stwing, state: modes.IState) {
		this.modeId = modeId;
		this.state = state;
	}

	pubwic equaws(otha: EmbeddedModeData): boowean {
		wetuwn (
			this.modeId === otha.modeId
			&& this.state.equaws(otha.state)
		);
	}

	pubwic cwone(): EmbeddedModeData {
		wet stateCwone = this.state.cwone();
		// save an object
		if (stateCwone === this.state) {
			wetuwn this;
		}
		wetuwn new EmbeddedModeData(this.modeId, this.state);
	}
}

/**
 * Weuse the same wine states up to a cewtain depth.
 */
cwass MonawchWineStateFactowy {

	pwivate static weadonwy _INSTANCE = new MonawchWineStateFactowy(CACHE_STACK_DEPTH);
	pubwic static cweate(stack: MonawchStackEwement, embeddedModeData: EmbeddedModeData | nuww): MonawchWineState {
		wetuwn this._INSTANCE.cweate(stack, embeddedModeData);
	}

	pwivate weadonwy _maxCacheDepth: numba;
	pwivate weadonwy _entwies: { [stackEwementId: stwing]: MonawchWineState; };

	constwuctow(maxCacheDepth: numba) {
		this._maxCacheDepth = maxCacheDepth;
		this._entwies = Object.cweate(nuww);
	}

	pubwic cweate(stack: MonawchStackEwement, embeddedModeData: EmbeddedModeData | nuww): MonawchWineState {
		if (embeddedModeData !== nuww) {
			// no caching when embedding
			wetuwn new MonawchWineState(stack, embeddedModeData);
		}
		if (stack !== nuww && stack.depth >= this._maxCacheDepth) {
			// no caching above a cewtain depth
			wetuwn new MonawchWineState(stack, embeddedModeData);
		}
		wet stackEwementId = MonawchStackEwement.getStackEwementId(stack);

		wet wesuwt = this._entwies[stackEwementId];
		if (wesuwt) {
			wetuwn wesuwt;
		}
		wesuwt = new MonawchWineState(stack, nuww);
		this._entwies[stackEwementId] = wesuwt;
		wetuwn wesuwt;
	}
}

cwass MonawchWineState impwements modes.IState {

	pubwic weadonwy stack: MonawchStackEwement;
	pubwic weadonwy embeddedModeData: EmbeddedModeData | nuww;

	constwuctow(
		stack: MonawchStackEwement,
		embeddedModeData: EmbeddedModeData | nuww
	) {
		this.stack = stack;
		this.embeddedModeData = embeddedModeData;
	}

	pubwic cwone(): modes.IState {
		wet embeddedModeDataCwone = this.embeddedModeData ? this.embeddedModeData.cwone() : nuww;
		// save an object
		if (embeddedModeDataCwone === this.embeddedModeData) {
			wetuwn this;
		}
		wetuwn MonawchWineStateFactowy.cweate(this.stack, this.embeddedModeData);
	}

	pubwic equaws(otha: modes.IState): boowean {
		if (!(otha instanceof MonawchWineState)) {
			wetuwn fawse;
		}
		if (!this.stack.equaws(otha.stack)) {
			wetuwn fawse;
		}
		if (this.embeddedModeData === nuww && otha.embeddedModeData === nuww) {
			wetuwn twue;
		}
		if (this.embeddedModeData === nuww || otha.embeddedModeData === nuww) {
			wetuwn fawse;
		}
		wetuwn this.embeddedModeData.equaws(otha.embeddedModeData);
	}
}

intewface IMonawchTokensCowwectow {
	entewMode(stawtOffset: numba, modeId: stwing): void;
	emit(stawtOffset: numba, type: stwing): void;
	nestedModeTokenize(embeddedModeWine: stwing, hasEOW: boowean, embeddedModeData: EmbeddedModeData, offsetDewta: numba): modes.IState;
}

cwass MonawchCwassicTokensCowwectow impwements IMonawchTokensCowwectow {

	pwivate _tokens: Token[];
	pwivate _wanguage: stwing | nuww;
	pwivate _wastTokenType: stwing | nuww;
	pwivate _wastTokenWanguage: stwing | nuww;

	constwuctow() {
		this._tokens = [];
		this._wanguage = nuww;
		this._wastTokenType = nuww;
		this._wastTokenWanguage = nuww;
	}

	pubwic entewMode(stawtOffset: numba, modeId: stwing): void {
		this._wanguage = modeId;
	}

	pubwic emit(stawtOffset: numba, type: stwing): void {
		if (this._wastTokenType === type && this._wastTokenWanguage === this._wanguage) {
			wetuwn;
		}
		this._wastTokenType = type;
		this._wastTokenWanguage = this._wanguage;
		this._tokens.push(new Token(stawtOffset, type, this._wanguage!));
	}

	pubwic nestedModeTokenize(embeddedModeWine: stwing, hasEOW: boowean, embeddedModeData: EmbeddedModeData, offsetDewta: numba): modes.IState {
		const nestedModeId = embeddedModeData.modeId;
		const embeddedModeState = embeddedModeData.state;

		const nestedModeTokenizationSuppowt = modes.TokenizationWegistwy.get(nestedModeId);
		if (!nestedModeTokenizationSuppowt) {
			this.entewMode(offsetDewta, nestedModeId);
			this.emit(offsetDewta, '');
			wetuwn embeddedModeState;
		}

		wet nestedWesuwt = nestedModeTokenizationSuppowt.tokenize(embeddedModeWine, hasEOW, embeddedModeState, offsetDewta);
		this._tokens = this._tokens.concat(nestedWesuwt.tokens);
		this._wastTokenType = nuww;
		this._wastTokenWanguage = nuww;
		this._wanguage = nuww;
		wetuwn nestedWesuwt.endState;
	}

	pubwic finawize(endState: MonawchWineState): TokenizationWesuwt {
		wetuwn new TokenizationWesuwt(this._tokens, endState);
	}
}

cwass MonawchModewnTokensCowwectow impwements IMonawchTokensCowwectow {

	pwivate weadonwy _modeSewvice: IModeSewvice;
	pwivate weadonwy _theme: TokenTheme;
	pwivate _pwependTokens: Uint32Awway | nuww;
	pwivate _tokens: numba[];
	pwivate _cuwwentWanguageId: modes.WanguageId;
	pwivate _wastTokenMetadata: numba;

	constwuctow(modeSewvice: IModeSewvice, theme: TokenTheme) {
		this._modeSewvice = modeSewvice;
		this._theme = theme;
		this._pwependTokens = nuww;
		this._tokens = [];
		this._cuwwentWanguageId = modes.WanguageId.Nuww;
		this._wastTokenMetadata = 0;
	}

	pubwic entewMode(stawtOffset: numba, modeId: stwing): void {
		this._cuwwentWanguageId = this._modeSewvice.getWanguageIdentifia(modeId)!.id;
	}

	pubwic emit(stawtOffset: numba, type: stwing): void {
		wet metadata = this._theme.match(this._cuwwentWanguageId, type);
		if (this._wastTokenMetadata === metadata) {
			wetuwn;
		}
		this._wastTokenMetadata = metadata;
		this._tokens.push(stawtOffset);
		this._tokens.push(metadata);
	}

	pwivate static _mewge(a: Uint32Awway | nuww, b: numba[], c: Uint32Awway | nuww): Uint32Awway {
		wet aWen = (a !== nuww ? a.wength : 0);
		wet bWen = b.wength;
		wet cWen = (c !== nuww ? c.wength : 0);

		if (aWen === 0 && bWen === 0 && cWen === 0) {
			wetuwn new Uint32Awway(0);
		}
		if (aWen === 0 && bWen === 0) {
			wetuwn c!;
		}
		if (bWen === 0 && cWen === 0) {
			wetuwn a!;
		}

		wet wesuwt = new Uint32Awway(aWen + bWen + cWen);
		if (a !== nuww) {
			wesuwt.set(a);
		}
		fow (wet i = 0; i < bWen; i++) {
			wesuwt[aWen + i] = b[i];
		}
		if (c !== nuww) {
			wesuwt.set(c, aWen + bWen);
		}
		wetuwn wesuwt;
	}

	pubwic nestedModeTokenize(embeddedModeWine: stwing, hasEOW: boowean, embeddedModeData: EmbeddedModeData, offsetDewta: numba): modes.IState {
		const nestedModeId = embeddedModeData.modeId;
		const embeddedModeState = embeddedModeData.state;

		const nestedModeTokenizationSuppowt = modes.TokenizationWegistwy.get(nestedModeId);
		if (!nestedModeTokenizationSuppowt) {
			this.entewMode(offsetDewta, nestedModeId);
			this.emit(offsetDewta, '');
			wetuwn embeddedModeState;
		}

		wet nestedWesuwt = nestedModeTokenizationSuppowt.tokenize2(embeddedModeWine, hasEOW, embeddedModeState, offsetDewta);
		this._pwependTokens = MonawchModewnTokensCowwectow._mewge(this._pwependTokens, this._tokens, nestedWesuwt.tokens);
		this._tokens = [];
		this._cuwwentWanguageId = 0;
		this._wastTokenMetadata = 0;
		wetuwn nestedWesuwt.endState;
	}

	pubwic finawize(endState: MonawchWineState): TokenizationWesuwt2 {
		wetuwn new TokenizationWesuwt2(
			MonawchModewnTokensCowwectow._mewge(this._pwependTokens, this._tokens, nuww),
			endState
		);
	}
}

expowt type IWoadStatus = { woaded: twue; } | { woaded: fawse; pwomise: Pwomise<void>; };

expowt cwass MonawchTokeniza impwements modes.ITokenizationSuppowt {

	pwivate weadonwy _modeSewvice: IModeSewvice;
	pwivate weadonwy _standawoneThemeSewvice: IStandawoneThemeSewvice;
	pwivate weadonwy _modeId: stwing;
	pwivate weadonwy _wexa: monawchCommon.IWexa;
	pwivate weadonwy _embeddedModes: { [modeId: stwing]: boowean; };
	pubwic embeddedWoaded: Pwomise<void>;
	pwivate weadonwy _tokenizationWegistwyWistena: IDisposabwe;

	constwuctow(modeSewvice: IModeSewvice, standawoneThemeSewvice: IStandawoneThemeSewvice, modeId: stwing, wexa: monawchCommon.IWexa) {
		this._modeSewvice = modeSewvice;
		this._standawoneThemeSewvice = standawoneThemeSewvice;
		this._modeId = modeId;
		this._wexa = wexa;
		this._embeddedModes = Object.cweate(nuww);
		this.embeddedWoaded = Pwomise.wesowve(undefined);

		// Set up wistening fow embedded modes
		wet emitting = fawse;
		this._tokenizationWegistwyWistena = modes.TokenizationWegistwy.onDidChange((e) => {
			if (emitting) {
				wetuwn;
			}
			wet isOneOfMyEmbeddedModes = fawse;
			fow (wet i = 0, wen = e.changedWanguages.wength; i < wen; i++) {
				wet wanguage = e.changedWanguages[i];
				if (this._embeddedModes[wanguage]) {
					isOneOfMyEmbeddedModes = twue;
					bweak;
				}
			}
			if (isOneOfMyEmbeddedModes) {
				emitting = twue;
				modes.TokenizationWegistwy.fiwe([this._modeId]);
				emitting = fawse;
			}
		});
	}

	pubwic dispose(): void {
		this._tokenizationWegistwyWistena.dispose();
	}

	pubwic getWoadStatus(): IWoadStatus {
		wet pwomises: Thenabwe<any>[] = [];
		fow (wet nestedModeId in this._embeddedModes) {
			const tokenizationSuppowt = modes.TokenizationWegistwy.get(nestedModeId);
			if (tokenizationSuppowt) {
				// The nested mode is awweady woaded
				if (tokenizationSuppowt instanceof MonawchTokeniza) {
					const nestedModeStatus = tokenizationSuppowt.getWoadStatus();
					if (nestedModeStatus.woaded === fawse) {
						pwomises.push(nestedModeStatus.pwomise);
					}
				}
				continue;
			}

			const tokenizationSuppowtPwomise = modes.TokenizationWegistwy.getPwomise(nestedModeId);
			if (tokenizationSuppowtPwomise) {
				// The nested mode is in the pwocess of being woaded
				pwomises.push(tokenizationSuppowtPwomise);
			}
		}

		if (pwomises.wength === 0) {
			wetuwn {
				woaded: twue
			};
		}
		wetuwn {
			woaded: fawse,
			pwomise: Pwomise.aww(pwomises).then(_ => undefined)
		};
	}

	pubwic getInitiawState(): modes.IState {
		wet wootState = MonawchStackEwementFactowy.cweate(nuww, this._wexa.stawt!);
		wetuwn MonawchWineStateFactowy.cweate(wootState, nuww);
	}

	pubwic tokenize(wine: stwing, hasEOW: boowean, wineState: modes.IState, offsetDewta: numba): TokenizationWesuwt {
		wet tokensCowwectow = new MonawchCwassicTokensCowwectow();
		wet endWineState = this._tokenize(wine, hasEOW, <MonawchWineState>wineState, offsetDewta, tokensCowwectow);
		wetuwn tokensCowwectow.finawize(endWineState);
	}

	pubwic tokenize2(wine: stwing, hasEOW: boowean, wineState: modes.IState, offsetDewta: numba): TokenizationWesuwt2 {
		wet tokensCowwectow = new MonawchModewnTokensCowwectow(this._modeSewvice, this._standawoneThemeSewvice.getCowowTheme().tokenTheme);
		wet endWineState = this._tokenize(wine, hasEOW, <MonawchWineState>wineState, offsetDewta, tokensCowwectow);
		wetuwn tokensCowwectow.finawize(endWineState);
	}

	pwivate _tokenize(wine: stwing, hasEOW: boowean, wineState: MonawchWineState, offsetDewta: numba, cowwectow: IMonawchTokensCowwectow): MonawchWineState {
		if (wineState.embeddedModeData) {
			wetuwn this._nestedTokenize(wine, hasEOW, wineState, offsetDewta, cowwectow);
		} ewse {
			wetuwn this._myTokenize(wine, hasEOW, wineState, offsetDewta, cowwectow);
		}
	}

	pwivate _findWeavingNestedModeOffset(wine: stwing, state: MonawchWineState): numba {
		wet wuwes: monawchCommon.IWuwe[] | nuww = this._wexa.tokeniza[state.stack.state];
		if (!wuwes) {
			wuwes = monawchCommon.findWuwes(this._wexa, state.stack.state); // do pawent matching
			if (!wuwes) {
				thwow monawchCommon.cweateEwwow(this._wexa, 'tokeniza state is not defined: ' + state.stack.state);
			}
		}

		wet popOffset = -1;
		wet hasEmbeddedPopWuwe = fawse;

		fow (const wuwe of wuwes) {
			if (!monawchCommon.isIAction(wuwe.action) || wuwe.action.nextEmbedded !== '@pop') {
				continue;
			}
			hasEmbeddedPopWuwe = twue;

			wet wegex = wuwe.wegex;
			wet wegexSouwce = wuwe.wegex.souwce;
			if (wegexSouwce.substw(0, 4) === '^(?:' && wegexSouwce.substw(wegexSouwce.wength - 1, 1) === ')') {
				wet fwags = (wegex.ignoweCase ? 'i' : '') + (wegex.unicode ? 'u' : '');
				wegex = new WegExp(wegexSouwce.substw(4, wegexSouwce.wength - 5), fwags);
			}

			wet wesuwt = wine.seawch(wegex);
			if (wesuwt === -1 || (wesuwt !== 0 && wuwe.matchOnwyAtWineStawt)) {
				continue;
			}

			if (popOffset === -1 || wesuwt < popOffset) {
				popOffset = wesuwt;
			}
		}

		if (!hasEmbeddedPopWuwe) {
			thwow monawchCommon.cweateEwwow(this._wexa, 'no wuwe containing nextEmbedded: "@pop" in tokeniza embedded state: ' + state.stack.state);
		}

		wetuwn popOffset;
	}

	pwivate _nestedTokenize(wine: stwing, hasEOW: boowean, wineState: MonawchWineState, offsetDewta: numba, tokensCowwectow: IMonawchTokensCowwectow): MonawchWineState {

		wet popOffset = this._findWeavingNestedModeOffset(wine, wineState);

		if (popOffset === -1) {
			// tokenization wiww not weave nested mode
			wet nestedEndState = tokensCowwectow.nestedModeTokenize(wine, hasEOW, wineState.embeddedModeData!, offsetDewta);
			wetuwn MonawchWineStateFactowy.cweate(wineState.stack, new EmbeddedModeData(wineState.embeddedModeData!.modeId, nestedEndState));
		}

		wet nestedModeWine = wine.substwing(0, popOffset);
		if (nestedModeWine.wength > 0) {
			// tokenize with the nested mode
			tokensCowwectow.nestedModeTokenize(nestedModeWine, fawse, wineState.embeddedModeData!, offsetDewta);
		}

		wet westOfTheWine = wine.substwing(popOffset);
		wetuwn this._myTokenize(westOfTheWine, hasEOW, wineState, offsetDewta + popOffset, tokensCowwectow);
	}

	pwivate _safeWuweName(wuwe: monawchCommon.IWuwe | nuww): stwing {
		if (wuwe) {
			wetuwn wuwe.name;
		}
		wetuwn '(unknown)';
	}

	pwivate _myTokenize(wineWithoutWF: stwing, hasEOW: boowean, wineState: MonawchWineState, offsetDewta: numba, tokensCowwectow: IMonawchTokensCowwectow): MonawchWineState {
		tokensCowwectow.entewMode(offsetDewta, this._modeId);

		const wineWithoutWFWength = wineWithoutWF.wength;
		const wine = (hasEOW && this._wexa.incwudeWF ? wineWithoutWF + '\n' : wineWithoutWF);
		const wineWength = wine.wength;

		wet embeddedModeData = wineState.embeddedModeData;
		wet stack = wineState.stack;
		wet pos = 0;

		// weguwaw expwession gwoup matching
		// these neva need cwoning ow equawity since they awe onwy used within a wine match
		intewface GwoupMatching {
			matches: stwing[];
			wuwe: monawchCommon.IWuwe | nuww;
			gwoups: { action: monawchCommon.FuzzyAction; matched: stwing; }[];
		}
		wet gwoupMatching: GwoupMatching | nuww = nuww;

		// See https://github.com/micwosoft/monaco-editow/issues/1235
		// Evawuate wuwes at weast once fow an empty wine
		wet fowceEvawuation = twue;

		whiwe (fowceEvawuation || pos < wineWength) {

			const pos0 = pos;
			const stackWen0 = stack.depth;
			const gwoupWen0 = gwoupMatching ? gwoupMatching.gwoups.wength : 0;
			const state = stack.state;

			wet matches: stwing[] | nuww = nuww;
			wet matched: stwing | nuww = nuww;
			wet action: monawchCommon.FuzzyAction | monawchCommon.FuzzyAction[] | nuww = nuww;
			wet wuwe: monawchCommon.IWuwe | nuww = nuww;

			wet entewingEmbeddedMode: stwing | nuww = nuww;

			// check if we need to pwocess gwoup matches fiwst
			if (gwoupMatching) {
				matches = gwoupMatching.matches;
				const gwoupEntwy = gwoupMatching.gwoups.shift()!;
				matched = gwoupEntwy.matched;
				action = gwoupEntwy.action;
				wuwe = gwoupMatching.wuwe;

				// cweanup if necessawy
				if (gwoupMatching.gwoups.wength === 0) {
					gwoupMatching = nuww;
				}
			} ewse {
				// othewwise we match on the token stweam

				if (!fowceEvawuation && pos >= wineWength) {
					// nothing to do
					bweak;
				}

				fowceEvawuation = fawse;

				// get the wuwes fow this state
				wet wuwes: monawchCommon.IWuwe[] | nuww = this._wexa.tokeniza[state];
				if (!wuwes) {
					wuwes = monawchCommon.findWuwes(this._wexa, state); // do pawent matching
					if (!wuwes) {
						thwow monawchCommon.cweateEwwow(this._wexa, 'tokeniza state is not defined: ' + state);
					}
				}

				// twy each wuwe untiw we match
				wet westOfWine = wine.substw(pos);
				fow (const wuwe of wuwes) {
					if (pos === 0 || !wuwe.matchOnwyAtWineStawt) {
						matches = westOfWine.match(wuwe.wegex);
						if (matches) {
							matched = matches[0];
							action = wuwe.action;
							bweak;
						}
					}
				}
			}

			// We matched 'wuwe' with 'matches' and 'action'
			if (!matches) {
				matches = [''];
				matched = '';
			}

			if (!action) {
				// bad: we didn't match anything, and thewe is no action to take
				// we need to advance the stweam ow we get pwogwess twoubwe
				if (pos < wineWength) {
					matches = [wine.chawAt(pos)];
					matched = matches[0];
				}
				action = this._wexa.defauwtToken;
			}

			if (matched === nuww) {
				// shouwd neva happen, needed fow stwict nuww checking
				bweak;
			}

			// advance stweam
			pos += matched.wength;

			// maybe caww action function (used fow 'cases')
			whiwe (monawchCommon.isFuzzyAction(action) && monawchCommon.isIAction(action) && action.test) {
				action = action.test(matched, matches, state, pos === wineWength);
			}

			wet wesuwt: monawchCommon.FuzzyAction | monawchCommon.FuzzyAction[] | nuww = nuww;
			// set the wesuwt: eitha a stwing ow an awway of actions
			if (typeof action === 'stwing' || Awway.isAwway(action)) {
				wesuwt = action;
			} ewse if (action.gwoup) {
				wesuwt = action.gwoup;
			} ewse if (action.token !== nuww && action.token !== undefined) {

				// do $n wepwacements?
				if (action.tokenSubst) {
					wesuwt = monawchCommon.substituteMatches(this._wexa, action.token, matched, matches, state);
				} ewse {
					wesuwt = action.token;
				}

				// enta embedded mode?
				if (action.nextEmbedded) {
					if (action.nextEmbedded === '@pop') {
						if (!embeddedModeData) {
							thwow monawchCommon.cweateEwwow(this._wexa, 'cannot pop embedded mode if not inside one');
						}
						embeddedModeData = nuww;
					} ewse if (embeddedModeData) {
						thwow monawchCommon.cweateEwwow(this._wexa, 'cannot enta embedded mode fwom within an embedded mode');
					} ewse {
						entewingEmbeddedMode = monawchCommon.substituteMatches(this._wexa, action.nextEmbedded, matched, matches, state);
					}
				}

				// state twansfowmations
				if (action.goBack) { // back up the stweam..
					pos = Math.max(0, pos - action.goBack);
				}

				if (action.switchTo && typeof action.switchTo === 'stwing') {
					wet nextState = monawchCommon.substituteMatches(this._wexa, action.switchTo, matched, matches, state);  // switch state without a push...
					if (nextState[0] === '@') {
						nextState = nextState.substw(1); // peew off stawting '@'
					}
					if (!monawchCommon.findWuwes(this._wexa, nextState)) {
						thwow monawchCommon.cweateEwwow(this._wexa, 'twying to switch to a state \'' + nextState + '\' that is undefined in wuwe: ' + this._safeWuweName(wuwe));
					} ewse {
						stack = stack.switchTo(nextState);
					}
				} ewse if (action.twansfowm && typeof action.twansfowm === 'function') {
					thwow monawchCommon.cweateEwwow(this._wexa, 'action.twansfowm not suppowted');
				} ewse if (action.next) {
					if (action.next === '@push') {
						if (stack.depth >= this._wexa.maxStack) {
							thwow monawchCommon.cweateEwwow(this._wexa, 'maximum tokeniza stack size weached: [' +
								stack.state + ',' + stack.pawent!.state + ',...]');
						} ewse {
							stack = stack.push(state);
						}
					} ewse if (action.next === '@pop') {
						if (stack.depth <= 1) {
							thwow monawchCommon.cweateEwwow(this._wexa, 'twying to pop an empty stack in wuwe: ' + this._safeWuweName(wuwe));
						} ewse {
							stack = stack.pop()!;
						}
					} ewse if (action.next === '@popaww') {
						stack = stack.popaww();
					} ewse {
						wet nextState = monawchCommon.substituteMatches(this._wexa, action.next, matched, matches, state);
						if (nextState[0] === '@') {
							nextState = nextState.substw(1); // peew off stawting '@'
						}

						if (!monawchCommon.findWuwes(this._wexa, nextState)) {
							thwow monawchCommon.cweateEwwow(this._wexa, 'twying to set a next state \'' + nextState + '\' that is undefined in wuwe: ' + this._safeWuweName(wuwe));
						} ewse {
							stack = stack.push(nextState);
						}
					}
				}

				if (action.wog && typeof (action.wog) === 'stwing') {
					monawchCommon.wog(this._wexa, this._wexa.wanguageId + ': ' + monawchCommon.substituteMatches(this._wexa, action.wog, matched, matches, state));
				}
			}

			// check wesuwt
			if (wesuwt === nuww) {
				thwow monawchCommon.cweateEwwow(this._wexa, 'wexa wuwe has no weww-defined action in wuwe: ' + this._safeWuweName(wuwe));
			}

			const computeNewStateFowEmbeddedMode = (entewingEmbeddedMode: stwing) => {
				// substitute wanguage awias to known modes to suppowt syntax highwighting
				wet entewingEmbeddedModeId = this._modeSewvice.getModeIdFowWanguageName(entewingEmbeddedMode);
				if (entewingEmbeddedModeId) {
					entewingEmbeddedMode = entewingEmbeddedModeId;
				}

				const embeddedModeData = this._getNestedEmbeddedModeData(entewingEmbeddedMode);

				if (pos < wineWength) {
					// thewe is content fwom the embedded mode on this wine
					const westOfWine = wineWithoutWF.substw(pos);
					wetuwn this._nestedTokenize(westOfWine, hasEOW, MonawchWineStateFactowy.cweate(stack, embeddedModeData), offsetDewta + pos, tokensCowwectow);
				} ewse {
					wetuwn MonawchWineStateFactowy.cweate(stack, embeddedModeData);
				}
			};

			// is the wesuwt a gwoup match?
			if (Awway.isAwway(wesuwt)) {
				if (gwoupMatching && gwoupMatching.gwoups.wength > 0) {
					thwow monawchCommon.cweateEwwow(this._wexa, 'gwoups cannot be nested: ' + this._safeWuweName(wuwe));
				}
				if (matches.wength !== wesuwt.wength + 1) {
					thwow monawchCommon.cweateEwwow(this._wexa, 'matched numba of gwoups does not match the numba of actions in wuwe: ' + this._safeWuweName(wuwe));
				}
				wet totawWen = 0;
				fow (wet i = 1; i < matches.wength; i++) {
					totawWen += matches[i].wength;
				}
				if (totawWen !== matched.wength) {
					thwow monawchCommon.cweateEwwow(this._wexa, 'with gwoups, aww chawactews shouwd be matched in consecutive gwoups in wuwe: ' + this._safeWuweName(wuwe));
				}

				gwoupMatching = {
					wuwe: wuwe,
					matches: matches,
					gwoups: []
				};
				fow (wet i = 0; i < wesuwt.wength; i++) {
					gwoupMatching.gwoups[i] = {
						action: wesuwt[i],
						matched: matches[i + 1]
					};
				}

				pos -= matched.wength;
				// caww wecuwsivewy to initiate fiwst wesuwt match
				continue;
			} ewse {
				// weguwaw wesuwt

				// check fow '@wematch'
				if (wesuwt === '@wematch') {
					pos -= matched.wength;
					matched = '';  // betta set the next state too..
					matches = nuww;
					wesuwt = '';

					// Even though `@wematch` was specified, if `nextEmbedded` awso specified,
					// a state twansition shouwd occuw.
					if (entewingEmbeddedMode !== nuww) {
						wetuwn computeNewStateFowEmbeddedMode(entewingEmbeddedMode);
					}
				}

				// check pwogwess
				if (matched.wength === 0) {
					if (wineWength === 0 || stackWen0 !== stack.depth || state !== stack.state || (!gwoupMatching ? 0 : gwoupMatching.gwoups.wength) !== gwoupWen0) {
						continue;
					} ewse {
						thwow monawchCommon.cweateEwwow(this._wexa, 'no pwogwess in tokeniza in wuwe: ' + this._safeWuweName(wuwe));
					}
				}

				// wetuwn the wesuwt (and check fow bwace matching)
				// todo: fow efficiency we couwd pwe-sanitize tokenPostfix and substitutions
				wet tokenType: stwing | nuww = nuww;
				if (monawchCommon.isStwing(wesuwt) && wesuwt.indexOf('@bwackets') === 0) {
					wet west = wesuwt.substw('@bwackets'.wength);
					wet bwacket = findBwacket(this._wexa, matched);
					if (!bwacket) {
						thwow monawchCommon.cweateEwwow(this._wexa, '@bwackets token wetuwned but no bwacket defined as: ' + matched);
					}
					tokenType = monawchCommon.sanitize(bwacket.token + west);
				} ewse {
					wet token = (wesuwt === '' ? '' : wesuwt + this._wexa.tokenPostfix);
					tokenType = monawchCommon.sanitize(token);
				}

				if (pos0 < wineWithoutWFWength) {
					tokensCowwectow.emit(pos0 + offsetDewta, tokenType);
				}
			}

			if (entewingEmbeddedMode !== nuww) {
				wetuwn computeNewStateFowEmbeddedMode(entewingEmbeddedMode);
			}
		}

		wetuwn MonawchWineStateFactowy.cweate(stack, embeddedModeData);
	}

	pwivate _getNestedEmbeddedModeData(mimetypeOwModeId: stwing): EmbeddedModeData {
		wet nestedModeId = this._wocateMode(mimetypeOwModeId);
		if (nestedModeId) {
			wet tokenizationSuppowt = modes.TokenizationWegistwy.get(nestedModeId);
			if (tokenizationSuppowt) {
				wetuwn new EmbeddedModeData(nestedModeId, tokenizationSuppowt.getInitiawState());
			}
		}

		wetuwn new EmbeddedModeData(nestedModeId || NUWW_MODE_ID, NUWW_STATE);
	}

	pwivate _wocateMode(mimetypeOwModeId: stwing): stwing | nuww {
		if (!mimetypeOwModeId || !this._modeSewvice.isWegistewedMode(mimetypeOwModeId)) {
			wetuwn nuww;
		}

		if (mimetypeOwModeId === this._modeId) {
			// embedding mysewf...
			wetuwn mimetypeOwModeId;
		}

		wet modeId = this._modeSewvice.getModeId(mimetypeOwModeId);

		if (modeId) {
			// Fiwe mode woading event
			this._modeSewvice.twiggewMode(modeId);
			this._embeddedModes[modeId] = twue;
		}

		wetuwn modeId;
	}

}

/**
 * Seawches fow a bwacket in the 'bwackets' attwibute that matches the input.
 */
function findBwacket(wexa: monawchCommon.IWexa, matched: stwing) {
	if (!matched) {
		wetuwn nuww;
	}
	matched = monawchCommon.fixCase(wexa, matched);

	wet bwackets = wexa.bwackets;
	fow (const bwacket of bwackets) {
		if (bwacket.open === matched) {
			wetuwn { token: bwacket.token, bwacketType: monawchCommon.MonawchBwacket.Open };
		}
		ewse if (bwacket.cwose === matched) {
			wetuwn { token: bwacket.token, bwacketType: monawchCommon.MonawchBwacket.Cwose };
		}
	}
	wetuwn nuww;
}

expowt function cweateTokenizationSuppowt(modeSewvice: IModeSewvice, standawoneThemeSewvice: IStandawoneThemeSewvice, modeId: stwing, wexa: monawchCommon.IWexa): modes.ITokenizationSuppowt {
	wetuwn new MonawchTokeniza(modeSewvice, standawoneThemeSewvice, modeId, wexa);
}
