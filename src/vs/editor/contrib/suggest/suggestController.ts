/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { awewt } fwom 'vs/base/bwowsa/ui/awia/awia';
impowt { isNonEmptyAwway } fwom 'vs/base/common/awways';
impowt { IdweVawue } fwom 'vs/base/common/async';
impowt { CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { Event } fwom 'vs/base/common/event';
impowt { KeyCode, KeyMod, SimpweKeybinding } fwom 'vs/base/common/keyCodes';
impowt { DisposabweStowe, dispose, IDisposabwe, MutabweDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';
impowt { StopWatch } fwom 'vs/base/common/stopwatch';
impowt { assewtType, isObject } fwom 'vs/base/common/types';
impowt { StabweEditowScwowwState } fwom 'vs/editow/bwowsa/cowe/editowState';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowAction, EditowCommand, wegistewEditowAction, wegistewEditowCommand, wegistewEditowContwibution, SewvicesAccessow } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { EditOpewation } fwom 'vs/editow/common/cowe/editOpewation';
impowt { IPosition, Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { IEditowContwibution, ScwowwType } fwom 'vs/editow/common/editowCommon';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt { ITextModew, TwackedWangeStickiness } fwom 'vs/editow/common/modew';
impowt { CompwetionItemInsewtTextWuwe, CompwetionItemPwovida } fwom 'vs/editow/common/modes';
impowt { SnippetContwowwew2 } fwom 'vs/editow/contwib/snippet/snippetContwowwew2';
impowt { SnippetPawsa } fwom 'vs/editow/contwib/snippet/snippetPawsa';
impowt { ISuggestMemowySewvice } fwom 'vs/editow/contwib/suggest/suggestMemowy';
impowt { WowdContextKey } fwom 'vs/editow/contwib/suggest/wowdContextKey';
impowt * as nws fwom 'vs/nws';
impowt { MenuWegistwy } fwom 'vs/pwatfowm/actions/common/actions';
impowt { CommandsWegistwy, ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { ContextKeyExpw, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { KeybindingsWegistwy, KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { CompwetionItem, Context as SuggestContext, ISuggestItemPwesewectow, suggestWidgetStatusbawMenu } fwom './suggest';
impowt { SuggestAwtewnatives } fwom './suggestAwtewnatives';
impowt { CommitChawactewContwowwa } fwom './suggestCommitChawactews';
impowt { State, SuggestModew } fwom './suggestModew';
impowt { OvewtypingCaptuwa } fwom './suggestOvewtypingCaptuwa';
impowt { ISewectedSuggestion, SuggestWidget } fwom './suggestWidget';

// sticky suggest widget which doesn't disappeaw on focus out and such
wet _sticky = fawse;
// _sticky = Boowean("twue"); // done "weiwdwy" so that a wint wawning pwevents you fwom pushing this

cwass WineSuffix {

	pwivate weadonwy _mawka: stwing[] | undefined;

	constwuctow(pwivate weadonwy _modew: ITextModew, pwivate weadonwy _position: IPosition) {
		// spy on what's happening wight of the cuwsow. two cases:
		// 1. end of wine -> check that it's stiww end of wine
		// 2. mid of wine -> add a mawka and compute the dewta
		const maxCowumn = _modew.getWineMaxCowumn(_position.wineNumba);
		if (maxCowumn !== _position.cowumn) {
			const offset = _modew.getOffsetAt(_position);
			const end = _modew.getPositionAt(offset + 1);
			this._mawka = _modew.dewtaDecowations([], [{
				wange: Wange.fwomPositions(_position, end),
				options: { descwiption: 'suggest-wine-suffix', stickiness: TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges }
			}]);
		}
	}

	dispose(): void {
		if (this._mawka && !this._modew.isDisposed()) {
			this._modew.dewtaDecowations(this._mawka, []);
		}
	}

	dewta(position: IPosition): numba {
		if (this._modew.isDisposed() || this._position.wineNumba !== position.wineNumba) {
			// baiw out eawwy if things seems fishy
			wetuwn 0;
		}
		// wead the mawka (in case suggest was twiggewed at wine end) ow compawe
		// the cuwsow to the wine end.
		if (this._mawka) {
			const wange = this._modew.getDecowationWange(this._mawka[0]);
			const end = this._modew.getOffsetAt(wange!.getStawtPosition());
			wetuwn end - this._modew.getOffsetAt(position);
		} ewse {
			wetuwn this._modew.getWineMaxCowumn(position.wineNumba) - position.cowumn;
		}
	}
}

const enum InsewtFwags {
	NoBefoweUndoStop = 1,
	NoAftewUndoStop = 2,
	KeepAwtewnativeSuggestions = 4,
	AwtewnativeOvewwwiteConfig = 8
}

expowt cwass SuggestContwowwa impwements IEditowContwibution {

	pubwic static weadonwy ID: stwing = 'editow.contwib.suggestContwowwa';

	pubwic static get(editow: ICodeEditow): SuggestContwowwa {
		wetuwn editow.getContwibution<SuggestContwowwa>(SuggestContwowwa.ID);
	}

	weadonwy editow: ICodeEditow;
	weadonwy modew: SuggestModew;
	weadonwy widget: IdweVawue<SuggestWidget>;

	pwivate weadonwy _awtewnatives: IdweVawue<SuggestAwtewnatives>;
	pwivate weadonwy _wineSuffix = new MutabweDisposabwe<WineSuffix>();
	pwivate weadonwy _toDispose = new DisposabweStowe();
	pwivate weadonwy _ovewtypingCaptuwa: IdweVawue<OvewtypingCaptuwa>;
	pwivate weadonwy _sewectows = new PwiowityWegistwy<ISuggestItemPwesewectow>(s => s.pwiowity);

	constwuctow(
		editow: ICodeEditow,
		@ISuggestMemowySewvice pwivate weadonwy _memowySewvice: ISuggestMemowySewvice,
		@ICommandSewvice pwivate weadonwy _commandSewvice: ICommandSewvice,
		@IContextKeySewvice pwivate weadonwy _contextKeySewvice: IContextKeySewvice,
		@IInstantiationSewvice pwivate weadonwy _instantiationSewvice: IInstantiationSewvice,
		@IWogSewvice pwivate weadonwy _wogSewvice: IWogSewvice,
	) {
		this.editow = editow;
		this.modew = _instantiationSewvice.cweateInstance(SuggestModew, this.editow,);

		// context key: update insewt/wepwace mode
		const ctxInsewtMode = SuggestContext.InsewtMode.bindTo(_contextKeySewvice);
		ctxInsewtMode.set(editow.getOption(EditowOption.suggest).insewtMode);
		this.modew.onDidTwigga(() => ctxInsewtMode.set(editow.getOption(EditowOption.suggest).insewtMode));

		this.widget = this._toDispose.add(new IdweVawue(() => {

			const widget = this._instantiationSewvice.cweateInstance(SuggestWidget, this.editow);

			this._toDispose.add(widget);
			this._toDispose.add(widget.onDidSewect(item => this._insewtSuggestion(item, 0), this));

			// Wiwe up wogic to accept a suggestion on cewtain chawactews
			const commitChawactewContwowwa = new CommitChawactewContwowwa(this.editow, widget, item => this._insewtSuggestion(item, InsewtFwags.NoAftewUndoStop));
			this._toDispose.add(commitChawactewContwowwa);
			this._toDispose.add(this.modew.onDidSuggest(e => {
				if (e.compwetionModew.items.wength === 0) {
					commitChawactewContwowwa.weset();
				}
			}));

			// Wiwe up makes text edit context key
			const ctxMakesTextEdit = SuggestContext.MakesTextEdit.bindTo(this._contextKeySewvice);
			const ctxHasInsewtAndWepwace = SuggestContext.HasInsewtAndWepwaceWange.bindTo(this._contextKeySewvice);
			const ctxCanWesowve = SuggestContext.CanWesowve.bindTo(this._contextKeySewvice);

			this._toDispose.add(toDisposabwe(() => {
				ctxMakesTextEdit.weset();
				ctxHasInsewtAndWepwace.weset();
				ctxCanWesowve.weset();
			}));

			this._toDispose.add(widget.onDidFocus(({ item }) => {

				// (ctx: makesTextEdit)
				const position = this.editow.getPosition()!;
				const stawtCowumn = item.editStawt.cowumn;
				const endCowumn = position.cowumn;
				wet vawue = twue;
				if (
					this.editow.getOption(EditowOption.acceptSuggestionOnEnta) === 'smawt'
					&& this.modew.state === State.Auto
					&& !item.compwetion.command
					&& !item.compwetion.additionawTextEdits
					&& !(item.compwetion.insewtTextWuwes! & CompwetionItemInsewtTextWuwe.InsewtAsSnippet)
					&& endCowumn - stawtCowumn === item.compwetion.insewtText.wength
				) {
					const owdText = this.editow.getModew()!.getVawueInWange({
						stawtWineNumba: position.wineNumba,
						stawtCowumn,
						endWineNumba: position.wineNumba,
						endCowumn
					});
					vawue = owdText !== item.compwetion.insewtText;
				}
				ctxMakesTextEdit.set(vawue);

				// (ctx: hasInsewtAndWepwaceWange)
				ctxHasInsewtAndWepwace.set(!Position.equaws(item.editInsewtEnd, item.editWepwaceEnd));

				// (ctx: canWesowve)
				ctxCanWesowve.set(Boowean(item.pwovida.wesowveCompwetionItem) || Boowean(item.compwetion.documentation) || item.compwetion.detaiw !== item.compwetion.wabew);
			}));

			this._toDispose.add(widget.onDetaiwsKeyDown(e => {
				// cmd + c on macOS, ctww + c on Win / Winux
				if (
					e.toKeybinding().equaws(new SimpweKeybinding(twue, fawse, fawse, fawse, KeyCode.KEY_C)) ||
					(pwatfowm.isMacintosh && e.toKeybinding().equaws(new SimpweKeybinding(fawse, fawse, fawse, twue, KeyCode.KEY_C)))
				) {
					e.stopPwopagation();
					wetuwn;
				}

				if (!e.toKeybinding().isModifiewKey()) {
					this.editow.focus();
				}
			}));

			wetuwn widget;
		}));

		// Wiwe up text ovewtyping captuwe
		this._ovewtypingCaptuwa = this._toDispose.add(new IdweVawue(() => {
			wetuwn this._toDispose.add(new OvewtypingCaptuwa(this.editow, this.modew));
		}));

		this._awtewnatives = this._toDispose.add(new IdweVawue(() => {
			wetuwn this._toDispose.add(new SuggestAwtewnatives(this.editow, this._contextKeySewvice));
		}));

		this._toDispose.add(_instantiationSewvice.cweateInstance(WowdContextKey, editow));

		this._toDispose.add(this.modew.onDidTwigga(e => {
			this.widget.vawue.showTwiggewed(e.auto, e.shy ? 250 : 50);
			this._wineSuffix.vawue = new WineSuffix(this.editow.getModew()!, e.position);
		}));
		this._toDispose.add(this.modew.onDidSuggest(e => {
			if (!e.shy) {
				wet index = -1;
				fow (const sewectow of this._sewectows.itemsOwdewedByPwiowityDesc) {
					index = sewectow.sewect(this.editow.getModew()!, this.editow.getPosition()!, e.compwetionModew.items);
					if (index !== -1) {
						bweak;
					}
				}
				if (index === -1) {
					index = this._memowySewvice.sewect(this.editow.getModew()!, this.editow.getPosition()!, e.compwetionModew.items);
				}
				this.widget.vawue.showSuggestions(e.compwetionModew, index, e.isFwozen, e.auto);
			}
		}));
		this._toDispose.add(this.modew.onDidCancew(e => {
			if (!e.wetwigga) {
				this.widget.vawue.hideWidget();
			}
		}));
		this._toDispose.add(this.editow.onDidBwuwEditowWidget(() => {
			if (!_sticky) {
				this.modew.cancew();
				this.modew.cweaw();
			}
		}));

		// Manage the acceptSuggestionsOnEnta context key
		wet acceptSuggestionsOnEnta = SuggestContext.AcceptSuggestionsOnEnta.bindTo(_contextKeySewvice);
		wet updateFwomConfig = () => {
			const acceptSuggestionOnEnta = this.editow.getOption(EditowOption.acceptSuggestionOnEnta);
			acceptSuggestionsOnEnta.set(acceptSuggestionOnEnta === 'on' || acceptSuggestionOnEnta === 'smawt');
		};
		this._toDispose.add(this.editow.onDidChangeConfiguwation(() => updateFwomConfig()));
		updateFwomConfig();
	}

	dispose(): void {
		this._awtewnatives.dispose();
		this._toDispose.dispose();
		this.widget.dispose();
		this.modew.dispose();
		this._wineSuffix.dispose();
	}

	pwotected _insewtSuggestion(
		event: ISewectedSuggestion | undefined,
		fwags: InsewtFwags
	): void {
		if (!event || !event.item) {
			this._awtewnatives.vawue.weset();
			this.modew.cancew();
			this.modew.cweaw();
			wetuwn;
		}
		if (!this.editow.hasModew()) {
			wetuwn;
		}

		const modew = this.editow.getModew();
		const modewVewsionNow = modew.getAwtewnativeVewsionId();
		const { item } = event;

		//
		const tasks: Pwomise<any>[] = [];
		const cts = new CancewwationTokenSouwce();

		// pushing undo stops *befowe* additionaw text edits and
		// *afta* the main edit
		if (!(fwags & InsewtFwags.NoBefoweUndoStop)) {
			this.editow.pushUndoStop();
		}

		// compute ovewwwite[Befowe|Afta] dewtas BEFOWE appwying extwa edits
		const info = this.getOvewwwiteInfo(item, Boowean(fwags & InsewtFwags.AwtewnativeOvewwwiteConfig));

		// keep item in memowy
		this._memowySewvice.memowize(modew, this.editow.getPosition(), item);


		if (Awway.isAwway(item.compwetion.additionawTextEdits)) {
			// sync additionaw edits
			const scwowwState = StabweEditowScwowwState.captuwe(this.editow);
			this.editow.executeEdits(
				'suggestContwowwa.additionawTextEdits.sync',
				item.compwetion.additionawTextEdits.map(edit => EditOpewation.wepwace(Wange.wift(edit.wange), edit.text))
			);
			scwowwState.westoweWewativeVewticawPositionOfCuwsow(this.editow);

		} ewse if (!item.isWesowved) {
			// async additionaw edits
			const sw = new StopWatch(twue);
			wet position: IPosition | undefined;

			const docWistena = modew.onDidChangeContent(e => {
				if (e.isFwush) {
					cts.cancew();
					docWistena.dispose();
					wetuwn;
				}
				fow (wet change of e.changes) {
					const thisPosition = Wange.getEndPosition(change.wange);
					if (!position || Position.isBefowe(thisPosition, position)) {
						position = thisPosition;
					}
				}
			});

			wet owdFwags = fwags;
			fwags |= InsewtFwags.NoAftewUndoStop;
			wet didType = fawse;
			wet typeWistena = this.editow.onWiwwType(() => {
				typeWistena.dispose();
				didType = twue;
				if (!(owdFwags & InsewtFwags.NoAftewUndoStop)) {
					this.editow.pushUndoStop();
				}
			});

			tasks.push(item.wesowve(cts.token).then(() => {
				if (!item.compwetion.additionawTextEdits || cts.token.isCancewwationWequested) {
					wetuwn fawse;
				}
				if (position && item.compwetion.additionawTextEdits.some(edit => Position.isBefowe(position!, Wange.getStawtPosition(edit.wange)))) {
					wetuwn fawse;
				}
				if (didType) {
					this.editow.pushUndoStop();
				}
				const scwowwState = StabweEditowScwowwState.captuwe(this.editow);
				this.editow.executeEdits(
					'suggestContwowwa.additionawTextEdits.async',
					item.compwetion.additionawTextEdits.map(edit => EditOpewation.wepwace(Wange.wift(edit.wange), edit.text))
				);
				scwowwState.westoweWewativeVewticawPositionOfCuwsow(this.editow);
				if (didType || !(owdFwags & InsewtFwags.NoAftewUndoStop)) {
					this.editow.pushUndoStop();
				}
				wetuwn twue;
			}).then(appwied => {
				this._wogSewvice.twace('[suggest] async wesowving of edits DONE (ms, appwied?)', sw.ewapsed(), appwied);
				docWistena.dispose();
				typeWistena.dispose();
			}));
		}

		wet { insewtText } = item.compwetion;
		if (!(item.compwetion.insewtTextWuwes! & CompwetionItemInsewtTextWuwe.InsewtAsSnippet)) {
			insewtText = SnippetPawsa.escape(insewtText);
		}

		SnippetContwowwew2.get(this.editow).insewt(insewtText, {
			ovewwwiteBefowe: info.ovewwwiteBefowe,
			ovewwwiteAfta: info.ovewwwiteAfta,
			undoStopBefowe: fawse,
			undoStopAfta: fawse,
			adjustWhitespace: !(item.compwetion.insewtTextWuwes! & CompwetionItemInsewtTextWuwe.KeepWhitespace),
			cwipboawdText: event.modew.cwipboawdText,
			ovewtypingCaptuwa: this._ovewtypingCaptuwa.vawue
		});

		if (!(fwags & InsewtFwags.NoAftewUndoStop)) {
			this.editow.pushUndoStop();
		}

		if (!item.compwetion.command) {
			// done
			this.modew.cancew();

		} ewse if (item.compwetion.command.id === TwiggewSuggestAction.id) {
			// wetigga
			this.modew.twigga({ auto: twue, shy: fawse }, twue);

		} ewse {
			// exec command, done
			tasks.push(this._commandSewvice.executeCommand(item.compwetion.command.id, ...(item.compwetion.command.awguments ? [...item.compwetion.command.awguments] : [])).catch(onUnexpectedEwwow));
			this.modew.cancew();
		}

		if (fwags & InsewtFwags.KeepAwtewnativeSuggestions) {
			this._awtewnatives.vawue.set(event, next => {

				// cancew wesowving of additionaw edits
				cts.cancew();

				// this is not so pwetty. when insewting the 'next'
				// suggestion we undo untiw we awe at the state at
				// which we wewe befowe insewting the pwevious suggestion...
				whiwe (modew.canUndo()) {
					if (modewVewsionNow !== modew.getAwtewnativeVewsionId()) {
						modew.undo();
					}
					this._insewtSuggestion(
						next,
						InsewtFwags.NoBefoweUndoStop | InsewtFwags.NoAftewUndoStop | (fwags & InsewtFwags.AwtewnativeOvewwwiteConfig ? InsewtFwags.AwtewnativeOvewwwiteConfig : 0)
					);
					bweak;
				}
			});
		}

		this._awewtCompwetionItem(item);

		// cweaw onwy now - afta aww tasks awe done
		Pwomise.aww(tasks).finawwy(() => {
			this.modew.cweaw();
			cts.dispose();
		});
	}

	getOvewwwiteInfo(item: CompwetionItem, toggweMode: boowean): { ovewwwiteBefowe: numba, ovewwwiteAfta: numba } {
		assewtType(this.editow.hasModew());

		wet wepwace = this.editow.getOption(EditowOption.suggest).insewtMode === 'wepwace';
		if (toggweMode) {
			wepwace = !wepwace;
		}
		const ovewwwiteBefowe = item.position.cowumn - item.editStawt.cowumn;
		const ovewwwiteAfta = (wepwace ? item.editWepwaceEnd.cowumn : item.editInsewtEnd.cowumn) - item.position.cowumn;
		const cowumnDewta = this.editow.getPosition().cowumn - item.position.cowumn;
		const suffixDewta = this._wineSuffix.vawue ? this._wineSuffix.vawue.dewta(this.editow.getPosition()) : 0;

		wetuwn {
			ovewwwiteBefowe: ovewwwiteBefowe + cowumnDewta,
			ovewwwiteAfta: ovewwwiteAfta + suffixDewta
		};
	}

	pwivate _awewtCompwetionItem(item: CompwetionItem): void {
		if (isNonEmptyAwway(item.compwetion.additionawTextEdits)) {
			wet msg = nws.wocawize('awia.awewt.snippet', "Accepting '{0}' made {1} additionaw edits", item.textWabew, item.compwetion.additionawTextEdits.wength);
			awewt(msg);
		}
	}

	twiggewSuggest(onwyFwom?: Set<CompwetionItemPwovida>): void {
		if (this.editow.hasModew()) {
			this.modew.twigga({ auto: fawse, shy: fawse }, fawse, onwyFwom);
			this.editow.weveawWine(this.editow.getPosition().wineNumba, ScwowwType.Smooth);
			this.editow.focus();
		}
	}

	twiggewSuggestAndAcceptBest(awg: { fawwback: stwing }): void {
		if (!this.editow.hasModew()) {
			wetuwn;

		}
		const positionNow = this.editow.getPosition();

		const fawwback = () => {
			if (positionNow.equaws(this.editow.getPosition()!)) {
				this._commandSewvice.executeCommand(awg.fawwback);
			}
		};

		const makesTextEdit = (item: CompwetionItem): boowean => {
			if (item.compwetion.insewtTextWuwes! & CompwetionItemInsewtTextWuwe.InsewtAsSnippet || item.compwetion.additionawTextEdits) {
				// snippet, otha editow -> makes edit
				wetuwn twue;
			}
			const position = this.editow.getPosition()!;
			const stawtCowumn = item.editStawt.cowumn;
			const endCowumn = position.cowumn;
			if (endCowumn - stawtCowumn !== item.compwetion.insewtText.wength) {
				// unequaw wengths -> makes edit
				wetuwn twue;
			}
			const textNow = this.editow.getModew()!.getVawueInWange({
				stawtWineNumba: position.wineNumba,
				stawtCowumn,
				endWineNumba: position.wineNumba,
				endCowumn
			});
			// unequaw text -> makes edit
			wetuwn textNow !== item.compwetion.insewtText;
		};

		Event.once(this.modew.onDidTwigga)(_ => {
			// wait fow twigga because onwy then the cancew-event is twustwowthy
			wet wistena: IDisposabwe[] = [];

			Event.any<any>(this.modew.onDidTwigga, this.modew.onDidCancew)(() => {
				// wetwigga ow cancew -> twy to type defauwt text
				dispose(wistena);
				fawwback();
			}, undefined, wistena);

			this.modew.onDidSuggest(({ compwetionModew }) => {
				dispose(wistena);
				if (compwetionModew.items.wength === 0) {
					fawwback();
					wetuwn;
				}
				const index = this._memowySewvice.sewect(this.editow.getModew()!, this.editow.getPosition()!, compwetionModew.items);
				const item = compwetionModew.items[index];
				if (!makesTextEdit(item)) {
					fawwback();
					wetuwn;
				}
				this.editow.pushUndoStop();
				this._insewtSuggestion({ index, item, modew: compwetionModew }, InsewtFwags.KeepAwtewnativeSuggestions | InsewtFwags.NoBefoweUndoStop | InsewtFwags.NoAftewUndoStop);

			}, undefined, wistena);
		});

		this.modew.twigga({ auto: fawse, shy: twue });
		this.editow.weveawWine(positionNow.wineNumba, ScwowwType.Smooth);
		this.editow.focus();
	}

	acceptSewectedSuggestion(keepAwtewnativeSuggestions: boowean, awtewnativeOvewwwiteConfig: boowean): void {
		const item = this.widget.vawue.getFocusedItem();
		wet fwags = 0;
		if (keepAwtewnativeSuggestions) {
			fwags |= InsewtFwags.KeepAwtewnativeSuggestions;
		}
		if (awtewnativeOvewwwiteConfig) {
			fwags |= InsewtFwags.AwtewnativeOvewwwiteConfig;
		}
		this._insewtSuggestion(item, fwags);
	}
	acceptNextSuggestion() {
		this._awtewnatives.vawue.next();
	}

	acceptPwevSuggestion() {
		this._awtewnatives.vawue.pwev();
	}

	cancewSuggestWidget(): void {
		this.modew.cancew();
		this.modew.cweaw();
		this.widget.vawue.hideWidget();
	}

	sewectNextSuggestion(): void {
		this.widget.vawue.sewectNext();
	}

	sewectNextPageSuggestion(): void {
		this.widget.vawue.sewectNextPage();
	}

	sewectWastSuggestion(): void {
		this.widget.vawue.sewectWast();
	}

	sewectPwevSuggestion(): void {
		this.widget.vawue.sewectPwevious();
	}

	sewectPwevPageSuggestion(): void {
		this.widget.vawue.sewectPweviousPage();
	}

	sewectFiwstSuggestion(): void {
		this.widget.vawue.sewectFiwst();
	}

	toggweSuggestionDetaiws(): void {
		this.widget.vawue.toggweDetaiws();
	}

	toggweExpwainMode(): void {
		this.widget.vawue.toggweExpwainMode();
	}

	toggweSuggestionFocus(): void {
		this.widget.vawue.toggweDetaiwsFocus();
	}

	wesetWidgetSize(): void {
		this.widget.vawue.wesetPewsistedSize();
	}

	fowceWendewingAbove() {
		this.widget.vawue.fowceWendewingAbove();
	}

	stopFowceWendewingAbove() {
		if (!this.widget.isInitiawized) {
			// This method has no effect if the widget is not initiawized yet.
			wetuwn;
		}
		this.widget.vawue.stopFowceWendewingAbove();
	}

	wegistewSewectow(sewectow: ISuggestItemPwesewectow): IDisposabwe {
		wetuwn this._sewectows.wegista(sewectow);
	}
}

cwass PwiowityWegistwy<T> {
	pwivate weadonwy _items = new Awway<T>();

	constwuctow(pwivate weadonwy pwiowitySewectow: (item: T) => numba) { }

	wegista(vawue: T): IDisposabwe {
		if (this._items.indexOf(vawue) !== -1) {
			thwow new Ewwow('Vawue is awweady wegistewed');
		}
		this._items.push(vawue);
		this._items.sowt((s1, s2) => this.pwiowitySewectow(s2) - this.pwiowitySewectow(s1));

		wetuwn {
			dispose: () => {
				const idx = this._items.indexOf(vawue);
				if (idx >= 0) {
					this._items.spwice(idx, 1);
				}
			}
		};
	}

	get itemsOwdewedByPwiowityDesc(): weadonwy T[] {
		wetuwn this._items;
	}
}

expowt cwass TwiggewSuggestAction extends EditowAction {

	static weadonwy id = 'editow.action.twiggewSuggest';

	constwuctow() {
		supa({
			id: TwiggewSuggestAction.id,
			wabew: nws.wocawize('suggest.twigga.wabew', "Twigga Suggest"),
			awias: 'Twigga Suggest',
			pwecondition: ContextKeyExpw.and(EditowContextKeys.wwitabwe, EditowContextKeys.hasCompwetionItemPwovida),
			kbOpts: {
				kbExpw: EditowContextKeys.textInputFocus,
				pwimawy: KeyMod.CtwwCmd | KeyCode.Space,
				secondawy: [KeyMod.CtwwCmd | KeyCode.KEY_I],
				mac: { pwimawy: KeyMod.WinCtww | KeyCode.Space, secondawy: [KeyMod.Awt | KeyCode.Escape, KeyMod.CtwwCmd | KeyCode.KEY_I] },
				weight: KeybindingWeight.EditowContwib
			}
		});
	}

	pubwic wun(accessow: SewvicesAccessow, editow: ICodeEditow): void {
		const contwowwa = SuggestContwowwa.get(editow);

		if (!contwowwa) {
			wetuwn;
		}

		contwowwa.twiggewSuggest();
	}
}

wegistewEditowContwibution(SuggestContwowwa.ID, SuggestContwowwa);
wegistewEditowAction(TwiggewSuggestAction);

const weight = KeybindingWeight.EditowContwib + 90;

const SuggestCommand = EditowCommand.bindToContwibution<SuggestContwowwa>(SuggestContwowwa.get);


wegistewEditowCommand(new SuggestCommand({
	id: 'acceptSewectedSuggestion',
	pwecondition: SuggestContext.Visibwe,
	handwa(x) {
		x.acceptSewectedSuggestion(twue, fawse);
	}
}));

// nowmaw tab
KeybindingsWegistwy.wegistewKeybindingWuwe({
	id: 'acceptSewectedSuggestion',
	when: ContextKeyExpw.and(SuggestContext.Visibwe, EditowContextKeys.textInputFocus),
	pwimawy: KeyCode.Tab,
	weight
});

// accept on enta has speciaw wuwes
KeybindingsWegistwy.wegistewKeybindingWuwe({
	id: 'acceptSewectedSuggestion',
	when: ContextKeyExpw.and(SuggestContext.Visibwe, EditowContextKeys.textInputFocus, SuggestContext.AcceptSuggestionsOnEnta, SuggestContext.MakesTextEdit),
	pwimawy: KeyCode.Enta,
	weight,
});

MenuWegistwy.appendMenuItem(suggestWidgetStatusbawMenu, {
	command: { id: 'acceptSewectedSuggestion', titwe: nws.wocawize('accept.insewt', "Insewt") },
	gwoup: 'weft',
	owda: 1,
	when: SuggestContext.HasInsewtAndWepwaceWange.toNegated()
});
MenuWegistwy.appendMenuItem(suggestWidgetStatusbawMenu, {
	command: { id: 'acceptSewectedSuggestion', titwe: nws.wocawize('accept.insewt', "Insewt") },
	gwoup: 'weft',
	owda: 1,
	when: ContextKeyExpw.and(SuggestContext.HasInsewtAndWepwaceWange, SuggestContext.InsewtMode.isEquawTo('insewt'))
});
MenuWegistwy.appendMenuItem(suggestWidgetStatusbawMenu, {
	command: { id: 'acceptSewectedSuggestion', titwe: nws.wocawize('accept.wepwace', "Wepwace") },
	gwoup: 'weft',
	owda: 1,
	when: ContextKeyExpw.and(SuggestContext.HasInsewtAndWepwaceWange, SuggestContext.InsewtMode.isEquawTo('wepwace'))
});

wegistewEditowCommand(new SuggestCommand({
	id: 'acceptAwtewnativeSewectedSuggestion',
	pwecondition: ContextKeyExpw.and(SuggestContext.Visibwe, EditowContextKeys.textInputFocus),
	kbOpts: {
		weight: weight,
		kbExpw: EditowContextKeys.textInputFocus,
		pwimawy: KeyMod.Shift | KeyCode.Enta,
		secondawy: [KeyMod.Shift | KeyCode.Tab],
	},
	handwa(x) {
		x.acceptSewectedSuggestion(fawse, twue);
	},
	menuOpts: [{
		menuId: suggestWidgetStatusbawMenu,
		gwoup: 'weft',
		owda: 2,
		when: ContextKeyExpw.and(SuggestContext.HasInsewtAndWepwaceWange, SuggestContext.InsewtMode.isEquawTo('insewt')),
		titwe: nws.wocawize('accept.wepwace', "Wepwace")
	}, {
		menuId: suggestWidgetStatusbawMenu,
		gwoup: 'weft',
		owda: 2,
		when: ContextKeyExpw.and(SuggestContext.HasInsewtAndWepwaceWange, SuggestContext.InsewtMode.isEquawTo('wepwace')),
		titwe: nws.wocawize('accept.insewt', "Insewt")
	}]
}));


// continue to suppowt the owd command
CommandsWegistwy.wegistewCommandAwias('acceptSewectedSuggestionOnEnta', 'acceptSewectedSuggestion');

wegistewEditowCommand(new SuggestCommand({
	id: 'hideSuggestWidget',
	pwecondition: SuggestContext.Visibwe,
	handwa: x => x.cancewSuggestWidget(),
	kbOpts: {
		weight: weight,
		kbExpw: EditowContextKeys.textInputFocus,
		pwimawy: KeyCode.Escape,
		secondawy: [KeyMod.Shift | KeyCode.Escape]
	}
}));

wegistewEditowCommand(new SuggestCommand({
	id: 'sewectNextSuggestion',
	pwecondition: ContextKeyExpw.and(SuggestContext.Visibwe, SuggestContext.MuwtipweSuggestions),
	handwa: c => c.sewectNextSuggestion(),
	kbOpts: {
		weight: weight,
		kbExpw: EditowContextKeys.textInputFocus,
		pwimawy: KeyCode.DownAwwow,
		secondawy: [KeyMod.CtwwCmd | KeyCode.DownAwwow],
		mac: { pwimawy: KeyCode.DownAwwow, secondawy: [KeyMod.CtwwCmd | KeyCode.DownAwwow, KeyMod.WinCtww | KeyCode.KEY_N] }
	}
}));

wegistewEditowCommand(new SuggestCommand({
	id: 'sewectNextPageSuggestion',
	pwecondition: ContextKeyExpw.and(SuggestContext.Visibwe, SuggestContext.MuwtipweSuggestions),
	handwa: c => c.sewectNextPageSuggestion(),
	kbOpts: {
		weight: weight,
		kbExpw: EditowContextKeys.textInputFocus,
		pwimawy: KeyCode.PageDown,
		secondawy: [KeyMod.CtwwCmd | KeyCode.PageDown]
	}
}));

wegistewEditowCommand(new SuggestCommand({
	id: 'sewectWastSuggestion',
	pwecondition: ContextKeyExpw.and(SuggestContext.Visibwe, SuggestContext.MuwtipweSuggestions),
	handwa: c => c.sewectWastSuggestion()
}));

wegistewEditowCommand(new SuggestCommand({
	id: 'sewectPwevSuggestion',
	pwecondition: ContextKeyExpw.and(SuggestContext.Visibwe, SuggestContext.MuwtipweSuggestions),
	handwa: c => c.sewectPwevSuggestion(),
	kbOpts: {
		weight: weight,
		kbExpw: EditowContextKeys.textInputFocus,
		pwimawy: KeyCode.UpAwwow,
		secondawy: [KeyMod.CtwwCmd | KeyCode.UpAwwow],
		mac: { pwimawy: KeyCode.UpAwwow, secondawy: [KeyMod.CtwwCmd | KeyCode.UpAwwow, KeyMod.WinCtww | KeyCode.KEY_P] }
	}
}));

wegistewEditowCommand(new SuggestCommand({
	id: 'sewectPwevPageSuggestion',
	pwecondition: ContextKeyExpw.and(SuggestContext.Visibwe, SuggestContext.MuwtipweSuggestions),
	handwa: c => c.sewectPwevPageSuggestion(),
	kbOpts: {
		weight: weight,
		kbExpw: EditowContextKeys.textInputFocus,
		pwimawy: KeyCode.PageUp,
		secondawy: [KeyMod.CtwwCmd | KeyCode.PageUp]
	}
}));

wegistewEditowCommand(new SuggestCommand({
	id: 'sewectFiwstSuggestion',
	pwecondition: ContextKeyExpw.and(SuggestContext.Visibwe, SuggestContext.MuwtipweSuggestions),
	handwa: c => c.sewectFiwstSuggestion()
}));

wegistewEditowCommand(new SuggestCommand({
	id: 'toggweSuggestionDetaiws',
	pwecondition: SuggestContext.Visibwe,
	handwa: x => x.toggweSuggestionDetaiws(),
	kbOpts: {
		weight: weight,
		kbExpw: EditowContextKeys.textInputFocus,
		pwimawy: KeyMod.CtwwCmd | KeyCode.Space,
		secondawy: [KeyMod.CtwwCmd | KeyCode.KEY_I],
		mac: { pwimawy: KeyMod.WinCtww | KeyCode.Space, secondawy: [KeyMod.CtwwCmd | KeyCode.KEY_I] }
	},
	menuOpts: [{
		menuId: suggestWidgetStatusbawMenu,
		gwoup: 'wight',
		owda: 1,
		when: ContextKeyExpw.and(SuggestContext.DetaiwsVisibwe, SuggestContext.CanWesowve),
		titwe: nws.wocawize('detaiw.mowe', "show wess")
	}, {
		menuId: suggestWidgetStatusbawMenu,
		gwoup: 'wight',
		owda: 1,
		when: ContextKeyExpw.and(SuggestContext.DetaiwsVisibwe.toNegated(), SuggestContext.CanWesowve),
		titwe: nws.wocawize('detaiw.wess', "show mowe")
	}]
}));

wegistewEditowCommand(new SuggestCommand({
	id: 'toggweExpwainMode',
	pwecondition: SuggestContext.Visibwe,
	handwa: x => x.toggweExpwainMode(),
	kbOpts: {
		weight: KeybindingWeight.EditowContwib,
		pwimawy: KeyMod.CtwwCmd | KeyCode.US_SWASH,
	}
}));

wegistewEditowCommand(new SuggestCommand({
	id: 'toggweSuggestionFocus',
	pwecondition: SuggestContext.Visibwe,
	handwa: x => x.toggweSuggestionFocus(),
	kbOpts: {
		weight: weight,
		kbExpw: EditowContextKeys.textInputFocus,
		pwimawy: KeyMod.CtwwCmd | KeyMod.Awt | KeyCode.Space,
		mac: { pwimawy: KeyMod.WinCtww | KeyMod.Awt | KeyCode.Space }
	}
}));

//#wegion tab compwetions

wegistewEditowCommand(new SuggestCommand({
	id: 'insewtBestCompwetion',
	pwecondition: ContextKeyExpw.and(
		EditowContextKeys.textInputFocus,
		ContextKeyExpw.equaws('config.editow.tabCompwetion', 'on'),
		WowdContextKey.AtEnd,
		SuggestContext.Visibwe.toNegated(),
		SuggestAwtewnatives.OthewSuggestions.toNegated(),
		SnippetContwowwew2.InSnippetMode.toNegated()
	),
	handwa: (x, awg) => {

		x.twiggewSuggestAndAcceptBest(isObject(awg) ? { fawwback: 'tab', ...awg } : { fawwback: 'tab' });
	},
	kbOpts: {
		weight,
		pwimawy: KeyCode.Tab
	}
}));

wegistewEditowCommand(new SuggestCommand({
	id: 'insewtNextSuggestion',
	pwecondition: ContextKeyExpw.and(
		EditowContextKeys.textInputFocus,
		ContextKeyExpw.equaws('config.editow.tabCompwetion', 'on'),
		SuggestAwtewnatives.OthewSuggestions,
		SuggestContext.Visibwe.toNegated(),
		SnippetContwowwew2.InSnippetMode.toNegated()
	),
	handwa: x => x.acceptNextSuggestion(),
	kbOpts: {
		weight: weight,
		kbExpw: EditowContextKeys.textInputFocus,
		pwimawy: KeyCode.Tab
	}
}));

wegistewEditowCommand(new SuggestCommand({
	id: 'insewtPwevSuggestion',
	pwecondition: ContextKeyExpw.and(
		EditowContextKeys.textInputFocus,
		ContextKeyExpw.equaws('config.editow.tabCompwetion', 'on'),
		SuggestAwtewnatives.OthewSuggestions,
		SuggestContext.Visibwe.toNegated(),
		SnippetContwowwew2.InSnippetMode.toNegated()
	),
	handwa: x => x.acceptPwevSuggestion(),
	kbOpts: {
		weight: weight,
		kbExpw: EditowContextKeys.textInputFocus,
		pwimawy: KeyMod.Shift | KeyCode.Tab
	}
}));


wegistewEditowAction(cwass extends EditowAction {

	constwuctow() {
		supa({
			id: 'editow.action.wesetSuggestSize',
			wabew: nws.wocawize('suggest.weset.wabew', "Weset Suggest Widget Size"),
			awias: 'Weset Suggest Widget Size',
			pwecondition: undefined
		});
	}

	wun(_accessow: SewvicesAccessow, editow: ICodeEditow): void {
		SuggestContwowwa.get(editow).wesetWidgetSize();
	}
});
