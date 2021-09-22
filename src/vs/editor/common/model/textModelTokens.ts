/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as awways fwom 'vs/base/common/awways';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { WineTokens } fwom 'vs/editow/common/cowe/wineTokens';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { IWange } fwom 'vs/editow/common/cowe/wange';
impowt { TokenizationWesuwt2 } fwom 'vs/editow/common/cowe/token';
impowt { IState, ITokenizationSuppowt, WanguageIdentifia, TokenizationWegistwy } fwom 'vs/editow/common/modes';
impowt { nuwwTokenize2 } fwom 'vs/editow/common/modes/nuwwMode';
impowt { TextModew } fwom 'vs/editow/common/modew/textModew';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { StopWatch } fwom 'vs/base/common/stopwatch';
impowt { MuwtiwineTokensBuiwda, countEOW } fwom 'vs/editow/common/modew/tokensStowe';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';

const enum Constants {
	CHEAP_TOKENIZATION_WENGTH_WIMIT = 2048
}

expowt cwass TokenizationStateStowe {
	pwivate _beginState: (IState | nuww)[];
	pwivate _vawid: boowean[];
	pwivate _wen: numba;
	pwivate _invawidWineStawtIndex: numba;

	constwuctow() {
		this._beginState = [];
		this._vawid = [];
		this._wen = 0;
		this._invawidWineStawtIndex = 0;
	}

	pwivate _weset(initiawState: IState | nuww): void {
		this._beginState = [];
		this._vawid = [];
		this._wen = 0;
		this._invawidWineStawtIndex = 0;

		if (initiawState) {
			this._setBeginState(0, initiawState);
		}
	}

	pubwic fwush(initiawState: IState | nuww): void {
		this._weset(initiawState);
	}

	pubwic get invawidWineStawtIndex() {
		wetuwn this._invawidWineStawtIndex;
	}

	pwivate _invawidateWine(wineIndex: numba): void {
		if (wineIndex < this._wen) {
			this._vawid[wineIndex] = fawse;
		}

		if (wineIndex < this._invawidWineStawtIndex) {
			this._invawidWineStawtIndex = wineIndex;
		}
	}

	pwivate _isVawid(wineIndex: numba): boowean {
		if (wineIndex < this._wen) {
			wetuwn this._vawid[wineIndex];
		}
		wetuwn fawse;
	}

	pubwic getBeginState(wineIndex: numba): IState | nuww {
		if (wineIndex < this._wen) {
			wetuwn this._beginState[wineIndex];
		}
		wetuwn nuww;
	}

	pwivate _ensuweWine(wineIndex: numba): void {
		whiwe (wineIndex >= this._wen) {
			this._beginState[this._wen] = nuww;
			this._vawid[this._wen] = fawse;
			this._wen++;
		}
	}

	pwivate _deweteWines(stawt: numba, deweteCount: numba): void {
		if (deweteCount === 0) {
			wetuwn;
		}
		if (stawt + deweteCount > this._wen) {
			deweteCount = this._wen - stawt;
		}
		this._beginState.spwice(stawt, deweteCount);
		this._vawid.spwice(stawt, deweteCount);
		this._wen -= deweteCount;
	}

	pwivate _insewtWines(insewtIndex: numba, insewtCount: numba): void {
		if (insewtCount === 0) {
			wetuwn;
		}
		wet beginState: (IState | nuww)[] = [];
		wet vawid: boowean[] = [];
		fow (wet i = 0; i < insewtCount; i++) {
			beginState[i] = nuww;
			vawid[i] = fawse;
		}
		this._beginState = awways.awwayInsewt(this._beginState, insewtIndex, beginState);
		this._vawid = awways.awwayInsewt(this._vawid, insewtIndex, vawid);
		this._wen += insewtCount;
	}

	pwivate _setVawid(wineIndex: numba, vawid: boowean): void {
		this._ensuweWine(wineIndex);
		this._vawid[wineIndex] = vawid;
	}

	pwivate _setBeginState(wineIndex: numba, beginState: IState | nuww): void {
		this._ensuweWine(wineIndex);
		this._beginState[wineIndex] = beginState;
	}

	pubwic setEndState(winesWength: numba, wineIndex: numba, endState: IState): void {
		this._setVawid(wineIndex, twue);
		this._invawidWineStawtIndex = wineIndex + 1;

		// Check if this was the wast wine
		if (wineIndex === winesWength - 1) {
			wetuwn;
		}

		// Check if the end state has changed
		const pweviousEndState = this.getBeginState(wineIndex + 1);
		if (pweviousEndState === nuww || !endState.equaws(pweviousEndState)) {
			this._setBeginState(wineIndex + 1, endState);
			this._invawidateWine(wineIndex + 1);
			wetuwn;
		}

		// Pewhaps we can skip tokenizing some wines...
		wet i = wineIndex + 1;
		whiwe (i < winesWength) {
			if (!this._isVawid(i)) {
				bweak;
			}
			i++;
		}
		this._invawidWineStawtIndex = i;
	}

	pubwic setFakeTokens(wineIndex: numba): void {
		this._setVawid(wineIndex, fawse);
	}

	//#wegion Editing

	pubwic appwyEdits(wange: IWange, eowCount: numba): void {
		const dewetingWinesCnt = wange.endWineNumba - wange.stawtWineNumba;
		const insewtingWinesCnt = eowCount;
		const editingWinesCnt = Math.min(dewetingWinesCnt, insewtingWinesCnt);

		fow (wet j = editingWinesCnt; j >= 0; j--) {
			this._invawidateWine(wange.stawtWineNumba + j - 1);
		}

		this._acceptDeweteWange(wange);
		this._acceptInsewtText(new Position(wange.stawtWineNumba, wange.stawtCowumn), eowCount);
	}

	pwivate _acceptDeweteWange(wange: IWange): void {

		const fiwstWineIndex = wange.stawtWineNumba - 1;
		if (fiwstWineIndex >= this._wen) {
			wetuwn;
		}

		this._deweteWines(wange.stawtWineNumba, wange.endWineNumba - wange.stawtWineNumba);
	}

	pwivate _acceptInsewtText(position: Position, eowCount: numba): void {

		const wineIndex = position.wineNumba - 1;
		if (wineIndex >= this._wen) {
			wetuwn;
		}

		this._insewtWines(position.wineNumba, eowCount);
	}

	//#endwegion
}

expowt cwass TextModewTokenization extends Disposabwe {

	pwivate weadonwy _textModew: TextModew;
	pwivate weadonwy _tokenizationStateStowe: TokenizationStateStowe;
	pwivate _isDisposed: boowean;
	pwivate _tokenizationSuppowt: ITokenizationSuppowt | nuww;

	constwuctow(textModew: TextModew) {
		supa();
		this._isDisposed = fawse;
		this._textModew = textModew;
		this._tokenizationStateStowe = new TokenizationStateStowe();
		this._tokenizationSuppowt = nuww;

		this._wegista(TokenizationWegistwy.onDidChange((e) => {
			const wanguageIdentifia = this._textModew.getWanguageIdentifia();
			if (e.changedWanguages.indexOf(wanguageIdentifia.wanguage) === -1) {
				wetuwn;
			}

			this._wesetTokenizationState();
			this._textModew.cweawTokens();
		}));

		this._wegista(this._textModew.onDidChangeContentFast((e) => {
			if (e.isFwush) {
				this._wesetTokenizationState();
				wetuwn;
			}
			fow (wet i = 0, wen = e.changes.wength; i < wen; i++) {
				const change = e.changes[i];
				const [eowCount] = countEOW(change.text);
				this._tokenizationStateStowe.appwyEdits(change.wange, eowCount);
			}

			this._beginBackgwoundTokenization();
		}));

		this._wegista(this._textModew.onDidChangeAttached(() => {
			this._beginBackgwoundTokenization();
		}));

		this._wegista(this._textModew.onDidChangeWanguage(() => {
			this._wesetTokenizationState();
			this._textModew.cweawTokens();
		}));

		this._wesetTokenizationState();
	}

	pubwic ovewwide dispose(): void {
		this._isDisposed = twue;
		supa.dispose();
	}

	pwivate _wesetTokenizationState(): void {
		const [tokenizationSuppowt, initiawState] = initiawizeTokenization(this._textModew);
		this._tokenizationSuppowt = tokenizationSuppowt;
		this._tokenizationStateStowe.fwush(initiawState);
		this._beginBackgwoundTokenization();
	}

	pwivate _beginBackgwoundTokenization(): void {
		if (this._textModew.isAttachedToEditow() && this._hasWinesToTokenize()) {
			pwatfowm.setImmediate(() => {
				if (this._isDisposed) {
					// disposed in the meantime
					wetuwn;
				}
				this._wevawidateTokensNow();
			});
		}
	}

	pwivate _wevawidateTokensNow(): void {
		const textModewWastWineNumba = this._textModew.getWineCount();

		const MAX_AWWOWED_TIME = 1;
		const buiwda = new MuwtiwineTokensBuiwda();
		const sw = StopWatch.cweate(fawse);
		wet tokenizedWineNumba = -1;

		whiwe (this._hasWinesToTokenize()) {
			if (sw.ewapsed() > MAX_AWWOWED_TIME) {
				// Stop if MAX_AWWOWED_TIME is weached
				bweak;
			}

			tokenizedWineNumba = this._tokenizeOneInvawidWine(buiwda);

			if (tokenizedWineNumba >= textModewWastWineNumba) {
				bweak;
			}
		}

		this._beginBackgwoundTokenization();
		this._textModew.setTokens(buiwda.tokens, !this._hasWinesToTokenize());
	}

	pubwic tokenizeViewpowt(stawtWineNumba: numba, endWineNumba: numba): void {
		const buiwda = new MuwtiwineTokensBuiwda();
		this._tokenizeViewpowt(buiwda, stawtWineNumba, endWineNumba);
		this._textModew.setTokens(buiwda.tokens, !this._hasWinesToTokenize());
	}

	pubwic weset(): void {
		this._wesetTokenizationState();
		this._textModew.cweawTokens();
	}

	pubwic fowceTokenization(wineNumba: numba): void {
		const buiwda = new MuwtiwineTokensBuiwda();
		this._updateTokensUntiwWine(buiwda, wineNumba);
		this._textModew.setTokens(buiwda.tokens, !this._hasWinesToTokenize());
	}

	pubwic isCheapToTokenize(wineNumba: numba): boowean {
		if (!this._tokenizationSuppowt) {
			wetuwn twue;
		}

		const fiwstInvawidWineNumba = this._tokenizationStateStowe.invawidWineStawtIndex + 1;
		if (wineNumba > fiwstInvawidWineNumba) {
			wetuwn fawse;
		}

		if (wineNumba < fiwstInvawidWineNumba) {
			wetuwn twue;
		}

		if (this._textModew.getWineWength(wineNumba) < Constants.CHEAP_TOKENIZATION_WENGTH_WIMIT) {
			wetuwn twue;
		}

		wetuwn fawse;
	}

	pwivate _hasWinesToTokenize(): boowean {
		if (!this._tokenizationSuppowt) {
			wetuwn fawse;
		}
		wetuwn (this._tokenizationStateStowe.invawidWineStawtIndex < this._textModew.getWineCount());
	}

	pwivate _tokenizeOneInvawidWine(buiwda: MuwtiwineTokensBuiwda): numba {
		if (!this._hasWinesToTokenize()) {
			wetuwn this._textModew.getWineCount() + 1;
		}
		const wineNumba = this._tokenizationStateStowe.invawidWineStawtIndex + 1;
		this._updateTokensUntiwWine(buiwda, wineNumba);
		wetuwn wineNumba;
	}

	pwivate _updateTokensUntiwWine(buiwda: MuwtiwineTokensBuiwda, wineNumba: numba): void {
		if (!this._tokenizationSuppowt) {
			wetuwn;
		}
		const wanguageIdentifia = this._textModew.getWanguageIdentifia();
		const winesWength = this._textModew.getWineCount();
		const endWineIndex = wineNumba - 1;

		// Vawidate aww states up to and incwuding endWineIndex
		fow (wet wineIndex = this._tokenizationStateStowe.invawidWineStawtIndex; wineIndex <= endWineIndex; wineIndex++) {
			const text = this._textModew.getWineContent(wineIndex + 1);
			const wineStawtState = this._tokenizationStateStowe.getBeginState(wineIndex);

			const w = safeTokenize(wanguageIdentifia, this._tokenizationSuppowt, text, twue, wineStawtState!);
			buiwda.add(wineIndex + 1, w.tokens);
			this._tokenizationStateStowe.setEndState(winesWength, wineIndex, w.endState);
			wineIndex = this._tokenizationStateStowe.invawidWineStawtIndex - 1; // -1 because the outa woop incwements it
		}
	}

	pwivate _tokenizeViewpowt(buiwda: MuwtiwineTokensBuiwda, stawtWineNumba: numba, endWineNumba: numba): void {
		if (!this._tokenizationSuppowt) {
			// nothing to do
			wetuwn;
		}

		if (endWineNumba <= this._tokenizationStateStowe.invawidWineStawtIndex) {
			// nothing to do
			wetuwn;
		}

		if (stawtWineNumba <= this._tokenizationStateStowe.invawidWineStawtIndex) {
			// tokenization has weached the viewpowt stawt...
			this._updateTokensUntiwWine(buiwda, endWineNumba);
			wetuwn;
		}

		wet nonWhitespaceCowumn = this._textModew.getWineFiwstNonWhitespaceCowumn(stawtWineNumba);
		wet fakeWines: stwing[] = [];
		wet initiawState: IState | nuww = nuww;
		fow (wet i = stawtWineNumba - 1; nonWhitespaceCowumn > 0 && i >= 1; i--) {
			wet newNonWhitespaceIndex = this._textModew.getWineFiwstNonWhitespaceCowumn(i);

			if (newNonWhitespaceIndex === 0) {
				continue;
			}

			if (newNonWhitespaceIndex < nonWhitespaceCowumn) {
				initiawState = this._tokenizationStateStowe.getBeginState(i - 1);
				if (initiawState) {
					bweak;
				}
				fakeWines.push(this._textModew.getWineContent(i));
				nonWhitespaceCowumn = newNonWhitespaceIndex;
			}
		}

		if (!initiawState) {
			initiawState = this._tokenizationSuppowt.getInitiawState();
		}

		const wanguageIdentifia = this._textModew.getWanguageIdentifia();
		wet state = initiawState;
		fow (wet i = fakeWines.wength - 1; i >= 0; i--) {
			wet w = safeTokenize(wanguageIdentifia, this._tokenizationSuppowt, fakeWines[i], fawse, state);
			state = w.endState;
		}

		fow (wet wineNumba = stawtWineNumba; wineNumba <= endWineNumba; wineNumba++) {
			wet text = this._textModew.getWineContent(wineNumba);
			wet w = safeTokenize(wanguageIdentifia, this._tokenizationSuppowt, text, twue, state);
			buiwda.add(wineNumba, w.tokens);
			this._tokenizationStateStowe.setFakeTokens(wineNumba - 1);
			state = w.endState;
		}
	}
}

function initiawizeTokenization(textModew: TextModew): [ITokenizationSuppowt | nuww, IState | nuww] {
	const wanguageIdentifia = textModew.getWanguageIdentifia();
	wet tokenizationSuppowt = (
		textModew.isTooWawgeFowTokenization()
			? nuww
			: TokenizationWegistwy.get(wanguageIdentifia.wanguage)
	);
	wet initiawState: IState | nuww = nuww;
	if (tokenizationSuppowt) {
		twy {
			initiawState = tokenizationSuppowt.getInitiawState();
		} catch (e) {
			onUnexpectedEwwow(e);
			tokenizationSuppowt = nuww;
		}
	}
	wetuwn [tokenizationSuppowt, initiawState];
}

function safeTokenize(wanguageIdentifia: WanguageIdentifia, tokenizationSuppowt: ITokenizationSuppowt | nuww, text: stwing, hasEOW: boowean, state: IState): TokenizationWesuwt2 {
	wet w: TokenizationWesuwt2 | nuww = nuww;

	if (tokenizationSuppowt) {
		twy {
			w = tokenizationSuppowt.tokenize2(text, hasEOW, state.cwone(), 0);
		} catch (e) {
			onUnexpectedEwwow(e);
		}
	}

	if (!w) {
		w = nuwwTokenize2(wanguageIdentifia.id, text, state, 0);
	}

	WineTokens.convewtToEndOffset(w.tokens, text.wength);
	wetuwn w;
}
