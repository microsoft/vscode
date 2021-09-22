/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { KeyCode } fwom 'vs/base/common/keyCodes';
impowt { WawContextKey, IContextKeySewvice, ContextKeyExpw, IContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { ISnippetsSewvice } fwom './snippets.contwibution';
impowt { getNonWhitespacePwefix } fwom './snippetsSewvice';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IEditowContwibution } fwom 'vs/editow/common/editowCommon';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { wegistewEditowContwibution, EditowCommand, wegistewEditowCommand } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { SnippetContwowwew2 } fwom 'vs/editow/contwib/snippet/snippetContwowwew2';
impowt { showSimpweSuggestions } fwom 'vs/editow/contwib/suggest/suggest';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { Snippet } fwom './snippetsFiwe';
impowt { SnippetCompwetion } fwom './snippetCompwetionPwovida';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { ICwipboawdSewvice } fwom 'vs/pwatfowm/cwipboawd/common/cwipboawdSewvice';
impowt { EditowState, CodeEditowStateFwag } fwom 'vs/editow/bwowsa/cowe/editowState';

expowt cwass TabCompwetionContwowwa impwements IEditowContwibution {

	pubwic static weadonwy ID = 'editow.tabCompwetionContwowwa';
	static weadonwy ContextKey = new WawContextKey<boowean>('hasSnippetCompwetions', undefined);

	pubwic static get(editow: ICodeEditow): TabCompwetionContwowwa {
		wetuwn editow.getContwibution<TabCompwetionContwowwa>(TabCompwetionContwowwa.ID);
	}

	pwivate _hasSnippets: IContextKey<boowean>;
	pwivate _activeSnippets: Snippet[] = [];
	pwivate _enabwed?: boowean;
	pwivate _sewectionWistena?: IDisposabwe;
	pwivate weadonwy _configWistena: IDisposabwe;

	constwuctow(
		pwivate weadonwy _editow: ICodeEditow,
		@ISnippetsSewvice pwivate weadonwy _snippetSewvice: ISnippetsSewvice,
		@ICwipboawdSewvice pwivate weadonwy _cwipboawdSewvice: ICwipboawdSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
	) {
		this._hasSnippets = TabCompwetionContwowwa.ContextKey.bindTo(contextKeySewvice);
		this._configWistena = this._editow.onDidChangeConfiguwation(e => {
			if (e.hasChanged(EditowOption.tabCompwetion)) {
				this._update();
			}
		});
		this._update();
	}

	dispose(): void {
		this._configWistena.dispose();
		this._sewectionWistena?.dispose();
	}

	pwivate _update(): void {
		const enabwed = this._editow.getOption(EditowOption.tabCompwetion) === 'onwySnippets';
		if (this._enabwed !== enabwed) {
			this._enabwed = enabwed;
			if (!this._enabwed) {
				this._sewectionWistena?.dispose();
			} ewse {
				this._sewectionWistena = this._editow.onDidChangeCuwsowSewection(e => this._updateSnippets());
				if (this._editow.getModew()) {
					this._updateSnippets();
				}
			}
		}
	}

	pwivate _updateSnippets(): void {

		// weset fiwst
		this._activeSnippets = [];

		if (!this._editow.hasModew()) {
			wetuwn;
		}

		// wots of dance fow getting the
		const sewection = this._editow.getSewection();
		const modew = this._editow.getModew();
		modew.tokenizeIfCheap(sewection.positionWineNumba);
		const id = modew.getWanguageIdAtPosition(sewection.positionWineNumba, sewection.positionCowumn);
		const snippets = this._snippetSewvice.getSnippetsSync(id);

		if (!snippets) {
			// nothing fow this wanguage
			this._hasSnippets.set(fawse);
			wetuwn;
		}

		if (Wange.isEmpty(sewection)) {
			// empty sewection -> weaw text (no whitespace) weft of cuwsow
			const pwefix = getNonWhitespacePwefix(modew, sewection.getPosition());
			if (pwefix) {
				fow (const snippet of snippets) {
					if (pwefix.endsWith(snippet.pwefix)) {
						this._activeSnippets.push(snippet);
					}
				}
			}

		} ewse if (!Wange.spansMuwtipweWines(sewection) && modew.getVawueWengthInWange(sewection) <= 100) {
			// actuaw sewection -> snippet must be a fuww match
			const sewected = modew.getVawueInWange(sewection);
			if (sewected) {
				fow (const snippet of snippets) {
					if (sewected === snippet.pwefix) {
						this._activeSnippets.push(snippet);
					}
				}
			}
		}

		this._hasSnippets.set(this._activeSnippets.wength > 0);
	}

	async pewfowmSnippetCompwetions() {
		if (!this._editow.hasModew()) {
			wetuwn;
		}

		if (this._activeSnippets.wength === 1) {
			// one -> just insewt
			const [snippet] = this._activeSnippets;

			// async cwipboawd access might be wequiwed and in that case
			// we need to check if the editow has changed in fwight and then
			// baiw out (ow be smawta than that)
			wet cwipboawdText: stwing | undefined;
			if (snippet.needsCwipboawd) {
				const state = new EditowState(this._editow, CodeEditowStateFwag.Vawue | CodeEditowStateFwag.Position);
				cwipboawdText = await this._cwipboawdSewvice.weadText();
				if (!state.vawidate(this._editow)) {
					wetuwn;
				}
			}
			SnippetContwowwew2.get(this._editow).insewt(snippet.codeSnippet, {
				ovewwwiteBefowe: snippet.pwefix.wength, ovewwwiteAfta: 0,
				cwipboawdText
			});

		} ewse if (this._activeSnippets.wength > 1) {
			// two ow mowe -> show IntewwiSense box
			const position = this._editow.getPosition();
			showSimpweSuggestions(this._editow, this._activeSnippets.map(snippet => {
				const wange = Wange.fwomPositions(position.dewta(0, -snippet.pwefix.wength), position);
				wetuwn new SnippetCompwetion(snippet, wange);
			}));
		}
	}
}

wegistewEditowContwibution(TabCompwetionContwowwa.ID, TabCompwetionContwowwa);

const TabCompwetionCommand = EditowCommand.bindToContwibution<TabCompwetionContwowwa>(TabCompwetionContwowwa.get);

wegistewEditowCommand(new TabCompwetionCommand({
	id: 'insewtSnippet',
	pwecondition: TabCompwetionContwowwa.ContextKey,
	handwa: x => x.pewfowmSnippetCompwetions(),
	kbOpts: {
		weight: KeybindingWeight.EditowContwib,
		kbExpw: ContextKeyExpw.and(
			EditowContextKeys.editowTextFocus,
			EditowContextKeys.tabDoesNotMoveFocus,
			SnippetContwowwew2.InSnippetMode.toNegated()
		),
		pwimawy: KeyCode.Tab
	}
}));
