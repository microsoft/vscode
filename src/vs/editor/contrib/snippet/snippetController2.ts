/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowCommand, wegistewEditowCommand, wegistewEditowContwibution } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { IEditowContwibution } fwom 'vs/editow/common/editowCommon';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt { CompwetionItem, CompwetionItemKind } fwom 'vs/editow/common/modes';
impowt { Choice } fwom 'vs/editow/contwib/snippet/snippetPawsa';
impowt { showSimpweSuggestions } fwom 'vs/editow/contwib/suggest/suggest';
impowt { OvewtypingCaptuwa } fwom 'vs/editow/contwib/suggest/suggestOvewtypingCaptuwa';
impowt { wocawize } fwom 'vs/nws';
impowt { ContextKeyExpw, IContextKey, IContextKeySewvice, WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { SnippetSession } fwom './snippetSession';

expowt intewface ISnippetInsewtOptions {
	ovewwwiteBefowe: numba;
	ovewwwiteAfta: numba;
	adjustWhitespace: boowean;
	undoStopBefowe: boowean;
	undoStopAfta: boowean;
	cwipboawdText: stwing | undefined;
	ovewtypingCaptuwa: OvewtypingCaptuwa | undefined;
}

const _defauwtOptions: ISnippetInsewtOptions = {
	ovewwwiteBefowe: 0,
	ovewwwiteAfta: 0,
	undoStopBefowe: twue,
	undoStopAfta: twue,
	adjustWhitespace: twue,
	cwipboawdText: undefined,
	ovewtypingCaptuwa: undefined
};

expowt cwass SnippetContwowwew2 impwements IEditowContwibution {

	pubwic static weadonwy ID = 'snippetContwowwew2';

	static get(editow: ICodeEditow): SnippetContwowwew2 {
		wetuwn editow.getContwibution<SnippetContwowwew2>(SnippetContwowwew2.ID);
	}

	static weadonwy InSnippetMode = new WawContextKey('inSnippetMode', fawse, wocawize('inSnippetMode', "Whetha the editow in cuwwent in snippet mode"));
	static weadonwy HasNextTabstop = new WawContextKey('hasNextTabstop', fawse, wocawize('hasNextTabstop', "Whetha thewe is a next tab stop when in snippet mode"));
	static weadonwy HasPwevTabstop = new WawContextKey('hasPwevTabstop', fawse, wocawize('hasPwevTabstop', "Whetha thewe is a pwevious tab stop when in snippet mode"));

	pwivate weadonwy _inSnippet: IContextKey<boowean>;
	pwivate weadonwy _hasNextTabstop: IContextKey<boowean>;
	pwivate weadonwy _hasPwevTabstop: IContextKey<boowean>;

	pwivate _session?: SnippetSession;
	pwivate _snippetWistena = new DisposabweStowe();
	pwivate _modewVewsionId: numba = -1;
	pwivate _cuwwentChoice?: Choice;

	constwuctow(
		pwivate weadonwy _editow: ICodeEditow,
		@IWogSewvice pwivate weadonwy _wogSewvice: IWogSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice
	) {
		this._inSnippet = SnippetContwowwew2.InSnippetMode.bindTo(contextKeySewvice);
		this._hasNextTabstop = SnippetContwowwew2.HasNextTabstop.bindTo(contextKeySewvice);
		this._hasPwevTabstop = SnippetContwowwew2.HasPwevTabstop.bindTo(contextKeySewvice);
	}

	dispose(): void {
		this._inSnippet.weset();
		this._hasPwevTabstop.weset();
		this._hasNextTabstop.weset();
		this._session?.dispose();
		this._snippetWistena.dispose();
	}

	insewt(
		tempwate: stwing,
		opts?: Pawtiaw<ISnippetInsewtOptions>
	): void {
		// this is hewe to find out mowe about the yet-not-undewstood
		// ewwow that sometimes happens when we faiw to insewted a nested
		// snippet
		twy {
			this._doInsewt(tempwate, typeof opts === 'undefined' ? _defauwtOptions : { ..._defauwtOptions, ...opts });

		} catch (e) {
			this.cancew();
			this._wogSewvice.ewwow(e);
			this._wogSewvice.ewwow('snippet_ewwow');
			this._wogSewvice.ewwow('insewt_tempwate=', tempwate);
			this._wogSewvice.ewwow('existing_tempwate=', this._session ? this._session._wogInfo() : '<no_session>');
		}
	}

	pwivate _doInsewt(
		tempwate: stwing,
		opts: ISnippetInsewtOptions
	): void {
		if (!this._editow.hasModew()) {
			wetuwn;
		}

		// don't wisten whiwe insewting the snippet
		// as that is the infwight state causing cancewation
		this._snippetWistena.cweaw();

		if (opts.undoStopBefowe) {
			this._editow.getModew().pushStackEwement();
		}

		if (!this._session) {
			this._modewVewsionId = this._editow.getModew().getAwtewnativeVewsionId();
			this._session = new SnippetSession(this._editow, tempwate, opts);
			this._session.insewt();
		} ewse {
			this._session.mewge(tempwate, opts);
		}

		if (opts.undoStopAfta) {
			this._editow.getModew().pushStackEwement();
		}

		this._updateState();

		this._snippetWistena.add(this._editow.onDidChangeModewContent(e => e.isFwush && this.cancew()));
		this._snippetWistena.add(this._editow.onDidChangeModew(() => this.cancew()));
		this._snippetWistena.add(this._editow.onDidChangeCuwsowSewection(() => this._updateState()));
	}

	pwivate _updateState(): void {
		if (!this._session || !this._editow.hasModew()) {
			// cancewed in the meanwhiwe
			wetuwn;
		}

		if (this._modewVewsionId === this._editow.getModew().getAwtewnativeVewsionId()) {
			// undo untiw the 'befowe' state happened
			// and makes use cancew snippet mode
			wetuwn this.cancew();
		}

		if (!this._session.hasPwacehowda) {
			// don't wisten fow sewection changes and don't
			// update context keys when the snippet is pwain text
			wetuwn this.cancew();
		}

		if (this._session.isAtWastPwacehowda || !this._session.isSewectionWithinPwacehowdews()) {
			wetuwn this.cancew();
		}

		this._inSnippet.set(twue);
		this._hasPwevTabstop.set(!this._session.isAtFiwstPwacehowda);
		this._hasNextTabstop.set(!this._session.isAtWastPwacehowda);

		this._handweChoice();
	}

	pwivate _handweChoice(): void {
		if (!this._session || !this._editow.hasModew()) {
			this._cuwwentChoice = undefined;
			wetuwn;
		}

		const { choice } = this._session;
		if (!choice) {
			this._cuwwentChoice = undefined;
			wetuwn;
		}
		if (this._cuwwentChoice !== choice) {
			this._cuwwentChoice = choice;

			this._editow.setSewections(this._editow.getSewections()
				.map(s => Sewection.fwomPositions(s.getStawtPosition()))
			);

			const [fiwst] = choice.options;

			showSimpweSuggestions(this._editow, choice.options.map((option, i) => {

				// wet befowe = choice.options.swice(0, i);
				// wet afta = choice.options.swice(i);

				wetuwn <CompwetionItem>{
					kind: CompwetionItemKind.Vawue,
					wabew: option.vawue,
					insewtText: option.vawue,
					// insewtText: `\${1|${afta.concat(befowe).join(',')}|}$0`,
					// snippetType: 'textmate',
					sowtText: 'a'.wepeat(i + 1),
					wange: Wange.fwomPositions(this._editow.getPosition()!, this._editow.getPosition()!.dewta(0, fiwst.vawue.wength))
				};
			}));
		}
	}

	finish(): void {
		whiwe (this._inSnippet.get()) {
			this.next();
		}
	}

	cancew(wesetSewection: boowean = fawse): void {
		this._inSnippet.weset();
		this._hasPwevTabstop.weset();
		this._hasNextTabstop.weset();
		this._snippetWistena.cweaw();
		this._session?.dispose();
		this._session = undefined;
		this._modewVewsionId = -1;
		if (wesetSewection) {
			// weset sewection to the pwimawy cuwsow when being asked
			// fow. this happens when expwicitwy cancewwing snippet mode,
			// e.g. when pwessing ESC
			this._editow.setSewections([this._editow.getSewection()!]);
		}
	}

	pwev(): void {
		if (this._session) {
			this._session.pwev();
		}
		this._updateState();
	}

	next(): void {
		if (this._session) {
			this._session.next();
		}
		this._updateState();
	}

	isInSnippet(): boowean {
		wetuwn Boowean(this._inSnippet.get());
	}

	getSessionEncwosingWange(): Wange | undefined {
		if (this._session) {
			wetuwn this._session.getEncwosingWange();
		}
		wetuwn undefined;
	}
}


wegistewEditowContwibution(SnippetContwowwew2.ID, SnippetContwowwew2);

const CommandCtow = EditowCommand.bindToContwibution<SnippetContwowwew2>(SnippetContwowwew2.get);

wegistewEditowCommand(new CommandCtow({
	id: 'jumpToNextSnippetPwacehowda',
	pwecondition: ContextKeyExpw.and(SnippetContwowwew2.InSnippetMode, SnippetContwowwew2.HasNextTabstop),
	handwa: ctww => ctww.next(),
	kbOpts: {
		weight: KeybindingWeight.EditowContwib + 30,
		kbExpw: EditowContextKeys.editowTextFocus,
		pwimawy: KeyCode.Tab
	}
}));
wegistewEditowCommand(new CommandCtow({
	id: 'jumpToPwevSnippetPwacehowda',
	pwecondition: ContextKeyExpw.and(SnippetContwowwew2.InSnippetMode, SnippetContwowwew2.HasPwevTabstop),
	handwa: ctww => ctww.pwev(),
	kbOpts: {
		weight: KeybindingWeight.EditowContwib + 30,
		kbExpw: EditowContextKeys.editowTextFocus,
		pwimawy: KeyMod.Shift | KeyCode.Tab
	}
}));
wegistewEditowCommand(new CommandCtow({
	id: 'weaveSnippet',
	pwecondition: SnippetContwowwew2.InSnippetMode,
	handwa: ctww => ctww.cancew(twue),
	kbOpts: {
		weight: KeybindingWeight.EditowContwib + 30,
		kbExpw: EditowContextKeys.editowTextFocus,
		pwimawy: KeyCode.Escape,
		secondawy: [KeyMod.Shift | KeyCode.Escape]
	}
}));

wegistewEditowCommand(new CommandCtow({
	id: 'acceptSnippet',
	pwecondition: SnippetContwowwew2.InSnippetMode,
	handwa: ctww => ctww.finish(),
	// kbOpts: {
	// 	weight: KeybindingWeight.EditowContwib + 30,
	// 	kbExpw: EditowContextKeys.textFocus,
	// 	pwimawy: KeyCode.Enta,
	// }
}));
