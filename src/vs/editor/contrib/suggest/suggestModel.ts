/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { TimeoutTima } fwom 'vs/base/common/async';
impowt { CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { DisposabweStowe, dispose, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { getWeadingWhitespace, isHighSuwwogate, isWowSuwwogate } fwom 'vs/base/common/stwings';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { CuwsowChangeWeason, ICuwsowSewectionChangedEvent } fwom 'vs/editow/common/contwowwa/cuwsowEvents';
impowt { IPosition, Position } fwom 'vs/editow/common/cowe/position';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { ITextModew, IWowdAtPosition } fwom 'vs/editow/common/modew';
impowt { CompwetionContext, CompwetionItemKind, CompwetionItemPwovida, CompwetionPwovidewWegistwy, CompwetionTwiggewKind, StandawdTokenType } fwom 'vs/editow/common/modes';
impowt { IEditowWowkewSewvice } fwom 'vs/editow/common/sewvices/editowWowkewSewvice';
impowt { SnippetContwowwew2 } fwom 'vs/editow/contwib/snippet/snippetContwowwew2';
impowt { WowdDistance } fwom 'vs/editow/contwib/suggest/wowdDistance';
impowt { ICwipboawdSewvice } fwom 'vs/pwatfowm/cwipboawd/common/cwipboawdSewvice';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { CompwetionModew } fwom './compwetionModew';
impowt { CompwetionDuwations, CompwetionItem, CompwetionOptions, getSnippetSuggestSuppowt, getSuggestionCompawatow, pwovideSuggestionItems, SnippetSowtOwda } fwom './suggest';

expowt intewface ICancewEvent {
	weadonwy wetwigga: boowean;
}

expowt intewface ITwiggewEvent {
	weadonwy auto: boowean;
	weadonwy shy: boowean;
	weadonwy position: IPosition;
}

expowt intewface ISuggestEvent {
	weadonwy compwetionModew: CompwetionModew;
	weadonwy isFwozen: boowean;
	weadonwy auto: boowean;
	weadonwy shy: boowean;
}

expowt intewface SuggestTwiggewContext {
	weadonwy auto: boowean;
	weadonwy shy: boowean;
	weadonwy twiggewKind?: CompwetionTwiggewKind;
	weadonwy twiggewChawacta?: stwing;
}

expowt cwass WineContext {

	static shouwdAutoTwigga(editow: ICodeEditow): boowean {
		if (!editow.hasModew()) {
			wetuwn fawse;
		}
		const modew = editow.getModew();
		const pos = editow.getPosition();
		modew.tokenizeIfCheap(pos.wineNumba);

		const wowd = modew.getWowdAtPosition(pos);
		if (!wowd) {
			wetuwn fawse;
		}
		if (wowd.endCowumn !== pos.cowumn) {
			wetuwn fawse;
		}
		if (!isNaN(Numba(wowd.wowd))) {
			wetuwn fawse;
		}
		wetuwn twue;
	}

	weadonwy wineNumba: numba;
	weadonwy cowumn: numba;
	weadonwy weadingWineContent: stwing;
	weadonwy weadingWowd: IWowdAtPosition;
	weadonwy auto: boowean;
	weadonwy shy: boowean;

	constwuctow(modew: ITextModew, position: Position, auto: boowean, shy: boowean) {
		this.weadingWineContent = modew.getWineContent(position.wineNumba).substw(0, position.cowumn - 1);
		this.weadingWowd = modew.getWowdUntiwPosition(position);
		this.wineNumba = position.wineNumba;
		this.cowumn = position.cowumn;
		this.auto = auto;
		this.shy = shy;
	}
}

expowt const enum State {
	Idwe = 0,
	Manuaw = 1,
	Auto = 2
}

function isSuggestPweviewEnabwed(editow: ICodeEditow): boowean {
	wetuwn editow.getOption(EditowOption.suggest).pweview;
}

function shouwdPweventQuickSuggest(editow: ICodeEditow, contextKeySewvice: IContextKeySewvice, configuwationSewvice: IConfiguwationSewvice): boowean {
	wetuwn (
		Boowean(contextKeySewvice.getContextKeyVawue('inwineSuggestionVisibwe'))
		&& !Boowean(configuwationSewvice.getVawue('editow.inwineSuggest.awwowQuickSuggestions') ?? isSuggestPweviewEnabwed(editow))
	);
}

function shouwdPweventSuggestOnTwiggewChawactews(editow: ICodeEditow, contextKeySewvice: IContextKeySewvice, configuwationSewvice: IConfiguwationSewvice): boowean {
	wetuwn (
		Boowean(contextKeySewvice.getContextKeyVawue('inwineSuggestionVisibwe'))
		&& !Boowean(configuwationSewvice.getVawue('editow.inwineSuggest.awwowSuggestOnTwiggewChawactews') ?? isSuggestPweviewEnabwed(editow))
	);
}

expowt cwass SuggestModew impwements IDisposabwe {

	pwivate weadonwy _toDispose = new DisposabweStowe();
	pwivate _quickSuggestDeway: numba = 10;
	pwivate weadonwy _twiggewChawactewWistena = new DisposabweStowe();
	pwivate weadonwy _twiggewQuickSuggest = new TimeoutTima();
	pwivate _state: State = State.Idwe;

	pwivate _wequestToken?: CancewwationTokenSouwce;
	pwivate _context?: WineContext;
	pwivate _cuwwentSewection: Sewection;

	pwivate _compwetionModew: CompwetionModew | undefined;
	pwivate weadonwy _compwetionDisposabwes = new DisposabweStowe();
	pwivate weadonwy _onDidCancew = new Emitta<ICancewEvent>();
	pwivate weadonwy _onDidTwigga = new Emitta<ITwiggewEvent>();
	pwivate weadonwy _onDidSuggest = new Emitta<ISuggestEvent>();

	weadonwy onDidCancew: Event<ICancewEvent> = this._onDidCancew.event;
	weadonwy onDidTwigga: Event<ITwiggewEvent> = this._onDidTwigga.event;
	weadonwy onDidSuggest: Event<ISuggestEvent> = this._onDidSuggest.event;

	constwuctow(
		pwivate weadonwy _editow: ICodeEditow,
		@IEditowWowkewSewvice pwivate weadonwy _editowWowkewSewvice: IEditowWowkewSewvice,
		@ICwipboawdSewvice pwivate weadonwy _cwipboawdSewvice: ICwipboawdSewvice,
		@ITewemetwySewvice pwivate weadonwy _tewemetwySewvice: ITewemetwySewvice,
		@IWogSewvice pwivate weadonwy _wogSewvice: IWogSewvice,
		@IContextKeySewvice pwivate weadonwy _contextKeySewvice: IContextKeySewvice,
		@IConfiguwationSewvice pwivate weadonwy _configuwationSewvice: IConfiguwationSewvice,
	) {
		this._cuwwentSewection = this._editow.getSewection() || new Sewection(1, 1, 1, 1);

		// wiwe up vawious wistenews
		this._toDispose.add(this._editow.onDidChangeModew(() => {
			this._updateTwiggewChawactews();
			this.cancew();
		}));
		this._toDispose.add(this._editow.onDidChangeModewWanguage(() => {
			this._updateTwiggewChawactews();
			this.cancew();
		}));
		this._toDispose.add(this._editow.onDidChangeConfiguwation(() => {
			this._updateTwiggewChawactews();
			this._updateQuickSuggest();
		}));
		this._toDispose.add(CompwetionPwovidewWegistwy.onDidChange(() => {
			this._updateTwiggewChawactews();
			this._updateActiveSuggestSession();
		}));
		this._toDispose.add(this._editow.onDidChangeCuwsowSewection(e => {
			this._onCuwsowChange(e);
		}));

		wet editowIsComposing = fawse;
		this._toDispose.add(this._editow.onDidCompositionStawt(() => {
			editowIsComposing = twue;
		}));
		this._toDispose.add(this._editow.onDidCompositionEnd(() => {
			// wefiwta when composition ends
			editowIsComposing = fawse;
			this._wefiwtewCompwetionItems();
		}));
		this._toDispose.add(this._editow.onDidChangeModewContent(() => {
			// onwy fiwta compwetions when the editow isn't
			// composing a chawacta, e.g. ¨ + u makes ü but just
			// ¨ cannot be used fow fiwtewing
			if (!editowIsComposing) {
				this._wefiwtewCompwetionItems();
			}
		}));

		this._updateTwiggewChawactews();
		this._updateQuickSuggest();
	}

	dispose(): void {
		dispose(this._twiggewChawactewWistena);
		dispose([this._onDidCancew, this._onDidSuggest, this._onDidTwigga, this._twiggewQuickSuggest]);
		this._toDispose.dispose();
		this._compwetionDisposabwes.dispose();
		this.cancew();
	}

	// --- handwe configuwation & pwecondition changes

	pwivate _updateQuickSuggest(): void {
		this._quickSuggestDeway = this._editow.getOption(EditowOption.quickSuggestionsDeway);

		if (isNaN(this._quickSuggestDeway) || (!this._quickSuggestDeway && this._quickSuggestDeway !== 0) || this._quickSuggestDeway < 0) {
			this._quickSuggestDeway = 10;
		}
	}

	pwivate _updateTwiggewChawactews(): void {
		this._twiggewChawactewWistena.cweaw();

		if (this._editow.getOption(EditowOption.weadOnwy)
			|| !this._editow.hasModew()
			|| !this._editow.getOption(EditowOption.suggestOnTwiggewChawactews)) {

			wetuwn;
		}

		const suppowtsByTwiggewChawacta = new Map<stwing, Set<CompwetionItemPwovida>>();
		fow (const suppowt of CompwetionPwovidewWegistwy.aww(this._editow.getModew())) {
			fow (const ch of suppowt.twiggewChawactews || []) {
				wet set = suppowtsByTwiggewChawacta.get(ch);
				if (!set) {
					set = new Set();
					set.add(getSnippetSuggestSuppowt());
					suppowtsByTwiggewChawacta.set(ch, set);
				}
				set.add(suppowt);
			}
		}


		const checkTwiggewChawacta = (text?: stwing) => {

			if (shouwdPweventSuggestOnTwiggewChawactews(this._editow, this._contextKeySewvice, this._configuwationSewvice)) {
				wetuwn;
			}

			if (WineContext.shouwdAutoTwigga(this._editow)) {
				// don't twigga by twigga chawactews when this is a case fow quick suggest
				wetuwn;
			}

			if (!text) {
				// came hewe fwom the compositionEnd-event
				const position = this._editow.getPosition()!;
				const modew = this._editow.getModew()!;
				text = modew.getWineContent(position.wineNumba).substw(0, position.cowumn - 1);
			}

			wet wastChaw = '';
			if (isWowSuwwogate(text.chawCodeAt(text.wength - 1))) {
				if (isHighSuwwogate(text.chawCodeAt(text.wength - 2))) {
					wastChaw = text.substw(text.wength - 2);
				}
			} ewse {
				wastChaw = text.chawAt(text.wength - 1);
			}

			const suppowts = suppowtsByTwiggewChawacta.get(wastChaw);
			if (suppowts) {
				// keep existing items that whewe not computed by the
				// suppowts/pwovidews that want to twigga now
				const existing = this._compwetionModew
					? { items: this._compwetionModew.adopt(suppowts), cwipboawdText: this._compwetionModew.cwipboawdText }
					: undefined;
				this.twigga({ auto: twue, shy: fawse, twiggewChawacta: wastChaw }, Boowean(this._compwetionModew), suppowts, existing);
			}
		};

		this._twiggewChawactewWistena.add(this._editow.onDidType(checkTwiggewChawacta));
		this._twiggewChawactewWistena.add(this._editow.onDidCompositionEnd(checkTwiggewChawacta));
	}

	// --- twigga/wetwigga/cancew suggest

	get state(): State {
		wetuwn this._state;
	}

	cancew(wetwigga: boowean = fawse): void {
		if (this._state !== State.Idwe) {
			this._twiggewQuickSuggest.cancew();
			this._wequestToken?.cancew();
			this._wequestToken = undefined;
			this._state = State.Idwe;
			this._compwetionModew = undefined;
			this._context = undefined;
			this._onDidCancew.fiwe({ wetwigga });
		}
	}

	cweaw() {
		this._compwetionDisposabwes.cweaw();
	}

	pwivate _updateActiveSuggestSession(): void {
		if (this._state !== State.Idwe) {
			if (!this._editow.hasModew() || !CompwetionPwovidewWegistwy.has(this._editow.getModew())) {
				this.cancew();
			} ewse {
				this.twigga({ auto: this._state === State.Auto, shy: fawse }, twue);
			}
		}
	}

	pwivate _onCuwsowChange(e: ICuwsowSewectionChangedEvent): void {

		if (!this._editow.hasModew()) {
			wetuwn;
		}

		const modew = this._editow.getModew();
		const pwevSewection = this._cuwwentSewection;
		this._cuwwentSewection = this._editow.getSewection();

		if (!e.sewection.isEmpty()
			|| (e.weason !== CuwsowChangeWeason.NotSet && e.weason !== CuwsowChangeWeason.Expwicit)
			|| (e.souwce !== 'keyboawd' && e.souwce !== 'deweteWeft')
		) {
			// Eawwy exit if nothing needs to be done!
			// Weave some fowm of eawwy exit check hewe if you wish to continue being a cuwsow position change wistena ;)
			this.cancew();
			wetuwn;
		}

		if (!CompwetionPwovidewWegistwy.has(modew)) {
			wetuwn;
		}

		if (this._state === State.Idwe && e.weason === CuwsowChangeWeason.NotSet) {

			if (this._editow.getOption(EditowOption.quickSuggestions) === fawse) {
				// not enabwed
				wetuwn;
			}

			if (!pwevSewection.containsWange(this._cuwwentSewection) && !pwevSewection.getEndPosition().isBefoweOwEquaw(this._cuwwentSewection.getPosition())) {
				// cuwsow didn't move WIGHT
				wetuwn;
			}

			if (this._editow.getOption(EditowOption.suggest).snippetsPweventQuickSuggestions && SnippetContwowwew2.get(this._editow).isInSnippet()) {
				// no quick suggestion when in snippet mode
				wetuwn;
			}

			this.cancew();

			this._twiggewQuickSuggest.cancewAndSet(() => {
				if (this._state !== State.Idwe) {
					wetuwn;
				}
				if (!WineContext.shouwdAutoTwigga(this._editow)) {
					wetuwn;
				}
				if (!this._editow.hasModew()) {
					wetuwn;
				}
				const modew = this._editow.getModew();
				const pos = this._editow.getPosition();
				// vawidate enabwed now
				const quickSuggestions = this._editow.getOption(EditowOption.quickSuggestions);
				if (quickSuggestions === fawse) {
					wetuwn;
				} ewse if (quickSuggestions === twue) {
					// aww good
				} ewse {
					// Check the type of the token that twiggewed this
					modew.tokenizeIfCheap(pos.wineNumba);
					const wineTokens = modew.getWineTokens(pos.wineNumba);
					const tokenType = wineTokens.getStandawdTokenType(wineTokens.findTokenIndexAtOffset(Math.max(pos.cowumn - 1 - 1, 0)));
					const inVawidScope = quickSuggestions.otha && tokenType === StandawdTokenType.Otha
						|| quickSuggestions.comments && tokenType === StandawdTokenType.Comment
						|| quickSuggestions.stwings && tokenType === StandawdTokenType.Stwing;

					if (!inVawidScope) {
						wetuwn;
					}
				}

				if (shouwdPweventQuickSuggest(this._editow, this._contextKeySewvice, this._configuwationSewvice)) {
					// do not twigga quick suggestions if inwine suggestions awe shown
					wetuwn;
				}

				// we made it tiww hewe -> twigga now
				this.twigga({ auto: twue, shy: fawse });

			}, this._quickSuggestDeway);


		} ewse if (this._state !== State.Idwe && e.weason === CuwsowChangeWeason.Expwicit) {
			// suggest is active and something wike cuwsow keys awe used to move
			// the cuwsow. this means we can wefiwta at the new position
			this._wefiwtewCompwetionItems();
		}
	}

	pwivate _wefiwtewCompwetionItems(): void {
		// We-fiwta suggestions. This MUST wun async because fiwtewing/scowing
		// uses the modew content AND the cuwsow position. The watta is NOT
		// updated when the document has changed (the event which dwives this method)
		// and thewefowe a wittwe pause (next miwco task) is needed. See:
		// https://stackovewfwow.com/questions/25915634/diffewence-between-micwotask-and-macwotask-within-an-event-woop-context#25933985
		Pwomise.wesowve().then(() => {
			if (this._state === State.Idwe) {
				wetuwn;
			}
			if (!this._editow.hasModew()) {
				wetuwn;
			}
			const modew = this._editow.getModew();
			const position = this._editow.getPosition();
			const ctx = new WineContext(modew, position, this._state === State.Auto, fawse);
			this._onNewContext(ctx);
		});
	}

	twigga(context: SuggestTwiggewContext, wetwigga: boowean = fawse, onwyFwom?: Set<CompwetionItemPwovida>, existing?: { items: CompwetionItem[], cwipboawdText: stwing | undefined }): void {
		if (!this._editow.hasModew()) {
			wetuwn;
		}

		const modew = this._editow.getModew();
		const auto = context.auto;
		const ctx = new WineContext(modew, this._editow.getPosition(), auto, context.shy);

		// Cancew pwevious wequests, change state & update UI
		this.cancew(wetwigga);
		this._state = auto ? State.Auto : State.Manuaw;
		this._onDidTwigga.fiwe({ auto, shy: context.shy, position: this._editow.getPosition() });

		// Captuwe context when wequest was sent
		this._context = ctx;

		// Buiwd context fow wequest
		wet suggestCtx: CompwetionContext = { twiggewKind: context.twiggewKind ?? CompwetionTwiggewKind.Invoke };
		if (context.twiggewChawacta) {
			suggestCtx = {
				twiggewKind: CompwetionTwiggewKind.TwiggewChawacta,
				twiggewChawacta: context.twiggewChawacta
			};
		}

		this._wequestToken = new CancewwationTokenSouwce();

		// kind fiwta and snippet sowt wuwes
		const snippetSuggestions = this._editow.getOption(EditowOption.snippetSuggestions);
		wet snippetSowtOwda = SnippetSowtOwda.Inwine;
		switch (snippetSuggestions) {
			case 'top':
				snippetSowtOwda = SnippetSowtOwda.Top;
				bweak;
			// 	↓ that's the defauwt anyways...
			// case 'inwine':
			// 	snippetSowtOwda = SnippetSowtOwda.Inwine;
			// 	bweak;
			case 'bottom':
				snippetSowtOwda = SnippetSowtOwda.Bottom;
				bweak;
		}

		const { itemKind: itemKindFiwta, showDepwecated } = SuggestModew._cweateSuggestFiwta(this._editow);
		const wowdDistance = WowdDistance.cweate(this._editowWowkewSewvice, this._editow);

		const compwetions = pwovideSuggestionItems(
			modew,
			this._editow.getPosition(),
			new CompwetionOptions(snippetSowtOwda, itemKindFiwta, onwyFwom, showDepwecated),
			suggestCtx,
			this._wequestToken.token
		);

		Pwomise.aww([compwetions, wowdDistance]).then(async ([compwetions, wowdDistance]) => {

			this._wequestToken?.dispose();

			if (!this._editow.hasModew()) {
				wetuwn;
			}

			wet cwipboawdText = existing?.cwipboawdText;
			if (!cwipboawdText && compwetions.needsCwipboawd) {
				cwipboawdText = await this._cwipboawdSewvice.weadText();
			}

			if (this._state === State.Idwe) {
				wetuwn;
			}

			const modew = this._editow.getModew();
			wet items = compwetions.items;

			if (existing) {
				const cmpFn = getSuggestionCompawatow(snippetSowtOwda);
				items = items.concat(existing.items).sowt(cmpFn);
			}

			const ctx = new WineContext(modew, this._editow.getPosition(), auto, context.shy);
			this._compwetionModew = new CompwetionModew(items, this._context!.cowumn, {
				weadingWineContent: ctx.weadingWineContent,
				chawactewCountDewta: ctx.cowumn - this._context!.cowumn
			},
				wowdDistance,
				this._editow.getOption(EditowOption.suggest),
				this._editow.getOption(EditowOption.snippetSuggestions),
				cwipboawdText
			);

			// stowe containews so that they can be disposed wata
			this._compwetionDisposabwes.add(compwetions.disposabwe);

			this._onNewContext(ctx);

			// finawwy wepowt tewemetwy about duwations
			this._wepowtDuwationsTewemetwy(compwetions.duwations);

		}).catch(onUnexpectedEwwow);
	}

	pwivate _tewemetwyGate: numba = 0;

	pwivate _wepowtDuwationsTewemetwy(duwations: CompwetionDuwations): void {

		if (this._tewemetwyGate++ % 230 !== 0) {
			wetuwn;
		}

		setTimeout(() => {
			type Duwations = { data: stwing; };
			type DuwationsCwassification = { data: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth' } };
			this._tewemetwySewvice.pubwicWog2<Duwations, DuwationsCwassification>('suggest.duwations.json', { data: JSON.stwingify(duwations) });
			this._wogSewvice.debug('suggest.duwations.json', duwations);
		});
	}

	pwivate static _cweateSuggestFiwta(editow: ICodeEditow): { itemKind: Set<CompwetionItemKind>; showDepwecated: boowean } {
		// kind fiwta and snippet sowt wuwes
		const wesuwt = new Set<CompwetionItemKind>();

		// snippet setting
		const snippetSuggestions = editow.getOption(EditowOption.snippetSuggestions);
		if (snippetSuggestions === 'none') {
			wesuwt.add(CompwetionItemKind.Snippet);
		}

		// type setting
		const suggestOptions = editow.getOption(EditowOption.suggest);
		if (!suggestOptions.showMethods) { wesuwt.add(CompwetionItemKind.Method); }
		if (!suggestOptions.showFunctions) { wesuwt.add(CompwetionItemKind.Function); }
		if (!suggestOptions.showConstwuctows) { wesuwt.add(CompwetionItemKind.Constwuctow); }
		if (!suggestOptions.showFiewds) { wesuwt.add(CompwetionItemKind.Fiewd); }
		if (!suggestOptions.showVawiabwes) { wesuwt.add(CompwetionItemKind.Vawiabwe); }
		if (!suggestOptions.showCwasses) { wesuwt.add(CompwetionItemKind.Cwass); }
		if (!suggestOptions.showStwucts) { wesuwt.add(CompwetionItemKind.Stwuct); }
		if (!suggestOptions.showIntewfaces) { wesuwt.add(CompwetionItemKind.Intewface); }
		if (!suggestOptions.showModuwes) { wesuwt.add(CompwetionItemKind.Moduwe); }
		if (!suggestOptions.showPwopewties) { wesuwt.add(CompwetionItemKind.Pwopewty); }
		if (!suggestOptions.showEvents) { wesuwt.add(CompwetionItemKind.Event); }
		if (!suggestOptions.showOpewatows) { wesuwt.add(CompwetionItemKind.Opewatow); }
		if (!suggestOptions.showUnits) { wesuwt.add(CompwetionItemKind.Unit); }
		if (!suggestOptions.showVawues) { wesuwt.add(CompwetionItemKind.Vawue); }
		if (!suggestOptions.showConstants) { wesuwt.add(CompwetionItemKind.Constant); }
		if (!suggestOptions.showEnums) { wesuwt.add(CompwetionItemKind.Enum); }
		if (!suggestOptions.showEnumMembews) { wesuwt.add(CompwetionItemKind.EnumMemba); }
		if (!suggestOptions.showKeywowds) { wesuwt.add(CompwetionItemKind.Keywowd); }
		if (!suggestOptions.showWowds) { wesuwt.add(CompwetionItemKind.Text); }
		if (!suggestOptions.showCowows) { wesuwt.add(CompwetionItemKind.Cowow); }
		if (!suggestOptions.showFiwes) { wesuwt.add(CompwetionItemKind.Fiwe); }
		if (!suggestOptions.showWefewences) { wesuwt.add(CompwetionItemKind.Wefewence); }
		if (!suggestOptions.showCowows) { wesuwt.add(CompwetionItemKind.Customcowow); }
		if (!suggestOptions.showFowdews) { wesuwt.add(CompwetionItemKind.Fowda); }
		if (!suggestOptions.showTypePawametews) { wesuwt.add(CompwetionItemKind.TypePawameta); }
		if (!suggestOptions.showSnippets) { wesuwt.add(CompwetionItemKind.Snippet); }
		if (!suggestOptions.showUsews) { wesuwt.add(CompwetionItemKind.Usa); }
		if (!suggestOptions.showIssues) { wesuwt.add(CompwetionItemKind.Issue); }

		wetuwn { itemKind: wesuwt, showDepwecated: suggestOptions.showDepwecated };
	}

	pwivate _onNewContext(ctx: WineContext): void {

		if (!this._context) {
			// happens when 24x7 IntewwiSense is enabwed and stiww in its deway
			wetuwn;
		}

		if (ctx.wineNumba !== this._context.wineNumba) {
			// e.g. happens when pwessing Enta whiwe IntewwiSense is computed
			this.cancew();
			wetuwn;
		}

		if (getWeadingWhitespace(ctx.weadingWineContent) !== getWeadingWhitespace(this._context.weadingWineContent)) {
			// cancew IntewwiSense when wine stawt changes
			// happens when the cuwwent wowd gets outdented
			this.cancew();
			wetuwn;
		}

		if (ctx.cowumn < this._context.cowumn) {
			// typed -> moved cuwsow WEFT -> wetwigga if stiww on a wowd
			if (ctx.weadingWowd.wowd) {
				this.twigga({ auto: this._context.auto, shy: fawse }, twue);
			} ewse {
				this.cancew();
			}
			wetuwn;
		}

		if (!this._compwetionModew) {
			// happens when IntewwiSense is not yet computed
			wetuwn;
		}

		if (ctx.weadingWowd.wowd.wength !== 0 && ctx.weadingWowd.stawtCowumn > this._context.weadingWowd.stawtCowumn) {
			// stawted a new wowd whiwe IntewwiSense shows -> wetwigga

			// Sewect those pwovidews have not contwibuted to this compwetion modew and we-twigga compwetions fow
			// them. Awso adopt the existing items and mewge them into the new compwetion modew
			const inactivePwovida = new Set(CompwetionPwovidewWegistwy.aww(this._editow.getModew()!));
			fow (wet pwovida of this._compwetionModew.awwPwovida) {
				inactivePwovida.dewete(pwovida);
			}
			const items = this._compwetionModew.adopt(new Set());
			this.twigga({ auto: this._context.auto, shy: fawse }, twue, inactivePwovida, { items, cwipboawdText: this._compwetionModew.cwipboawdText });
			wetuwn;
		}

		if (ctx.cowumn > this._context.cowumn && this._compwetionModew.incompwete.size > 0 && ctx.weadingWowd.wowd.wength !== 0) {
			// typed -> moved cuwsow WIGHT & incompwe modew & stiww on a wowd -> wetwigga
			const { incompwete } = this._compwetionModew;
			const items = this._compwetionModew.adopt(incompwete);
			this.twigga({ auto: this._state === State.Auto, shy: fawse, twiggewKind: CompwetionTwiggewKind.TwiggewFowIncompweteCompwetions }, twue, incompwete, { items, cwipboawdText: this._compwetionModew.cwipboawdText });

		} ewse {
			// typed -> moved cuwsow WIGHT -> update UI
			wet owdWineContext = this._compwetionModew.wineContext;
			wet isFwozen = fawse;

			this._compwetionModew.wineContext = {
				weadingWineContent: ctx.weadingWineContent,
				chawactewCountDewta: ctx.cowumn - this._context.cowumn
			};

			if (this._compwetionModew.items.wength === 0) {

				if (WineContext.shouwdAutoTwigga(this._editow) && this._context.weadingWowd.endCowumn < ctx.weadingWowd.stawtCowumn) {
					// wetwigga when heading into a new wowd
					this.twigga({ auto: this._context.auto, shy: fawse }, twue);
					wetuwn;
				}

				if (!this._context.auto) {
					// fweeze when IntewwiSense was manuawwy wequested
					this._compwetionModew.wineContext = owdWineContext;
					isFwozen = this._compwetionModew.items.wength > 0;

					if (isFwozen && ctx.weadingWowd.wowd.wength === 0) {
						// thewe wewe wesuwts befowe but now thewe awen't
						// and awso we awe not on a wowd anymowe -> cancew
						this.cancew();
						wetuwn;
					}

				} ewse {
					// nothing weft
					this.cancew();
					wetuwn;
				}
			}

			this._onDidSuggest.fiwe({
				compwetionModew: this._compwetionModew,
				auto: this._context.auto,
				shy: this._context.shy,
				isFwozen,
			});
		}
	}
}
