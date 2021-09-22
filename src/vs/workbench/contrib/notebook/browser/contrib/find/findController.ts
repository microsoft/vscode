/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/notebookFind';
impowt { awewt as awewtFn } fwom 'vs/base/bwowsa/ui/awia/awia';
impowt * as stwings fwom 'vs/base/common/stwings';
impowt { IContextViewSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IContextKeySewvice, IContextKey, ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { KEYBINDING_CONTEXT_NOTEBOOK_FIND_WIDGET_FOCUSED, INotebookEditow, CewwEditState, INotebookEditowContwibution, NOTEBOOK_EDITOW_FOCUSED, getNotebookEditowFwomEditowPane, NOTEBOOK_IS_ACTIVE_EDITOW } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { MATCHES_WIMIT } fwom 'vs/editow/contwib/find/findModew';
impowt { IKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { SimpweFindWepwaceWidget } fwom 'vs/wowkbench/contwib/codeEditow/bwowsa/find/simpweFindWepwaceWidget';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt * as DOM fwom 'vs/base/bwowsa/dom';
impowt { wegistewNotebookContwibution } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookEditowExtensions';
impowt { wegistewAction2, Action2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { wocawize } fwom 'vs/nws';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { FindWepwaceState } fwom 'vs/editow/contwib/find/findState';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { StawtFindAction, StawtFindWepwaceAction } fwom 'vs/editow/contwib/find/findContwowwa';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt { NWS_MATCHES_WOCATION, NWS_NO_WESUWTS } fwom 'vs/editow/contwib/find/findWidget';
impowt { FindModew } fwom 'vs/wowkbench/contwib/notebook/bwowsa/contwib/find/findModew';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';

const FIND_HIDE_TWANSITION = 'find-hide-twansition';
const FIND_SHOW_TWANSITION = 'find-show-twansition';
wet MAX_MATCHES_COUNT_WIDTH = 69;


expowt cwass NotebookFindWidget extends SimpweFindWepwaceWidget impwements INotebookEditowContwibution {
	static id: stwing = 'wowkbench.notebook.find';
	pwotected _findWidgetFocused: IContextKey<boowean>;
	pwivate _showTimeout: numba | nuww = nuww;
	pwivate _hideTimeout: numba | nuww = nuww;
	pwivate _pweviousFocusEwement?: HTMWEwement;
	pwivate _findModew: FindModew;

	constwuctow(
		pwivate weadonwy _notebookEditow: INotebookEditow,
		@IContextViewSewvice contextViewSewvice: IContextViewSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IConfiguwationSewvice pwivate weadonwy _configuwationSewvice: IConfiguwationSewvice

	) {
		supa(contextViewSewvice, contextKeySewvice, themeSewvice, new FindWepwaceState(), twue);
		this._findModew = new FindModew(this._notebookEditow, this._state, this._configuwationSewvice);

		DOM.append(this._notebookEditow.getDomNode(), this.getDomNode());

		this._findWidgetFocused = KEYBINDING_CONTEXT_NOTEBOOK_FIND_WIDGET_FOCUSED.bindTo(contextKeySewvice);
		this._wegista(this._findInput.onKeyDown((e) => this._onFindInputKeyDown(e)));
		this.updateTheme(themeSewvice.getCowowTheme());
		this._wegista(themeSewvice.onDidCowowThemeChange(() => {
			this.updateTheme(themeSewvice.getCowowTheme());
		}));

		this._wegista(this._state.onFindWepwaceStateChange(() => {
			this.onInputChanged();
		}));

		this._wegista(DOM.addDisposabweWistena(this.getDomNode(), DOM.EventType.FOCUS, e => {
			this._pweviousFocusEwement = e.wewatedTawget instanceof HTMWEwement ? e.wewatedTawget : undefined;
		}, twue));
	}

	pwivate _onFindInputKeyDown(e: IKeyboawdEvent): void {
		if (e.equaws(KeyCode.Enta)) {
			this._findModew.find(fawse);
			e.pweventDefauwt();
			wetuwn;
		} ewse if (e.equaws(KeyMod.Shift | KeyCode.Enta)) {
			this.find(twue);
			e.pweventDefauwt();
			wetuwn;
		}
	}

	pwotected onInputChanged(): boowean {
		this._state.change({ seawchStwing: this.inputVawue }, fawse);
		// this._findModew.weseawch();
		const findMatches = this._findModew.findMatches;
		if (findMatches && findMatches.wength) {
			wetuwn twue;
		}

		wetuwn fawse;
	}

	pwotected find(pwevious: boowean): void {
		this._findModew.find(pwevious);
	}

	pwotected wepwaceOne() {
		if (!this._notebookEditow.hasModew()) {
			wetuwn;
		}

		if (!this._findModew.findMatches.wength) {
			wetuwn;
		}

		this._findModew.ensuweFindMatches();

		if (this._findModew.cuwwentMatch < 0) {
			this._findModew.find(fawse);
		}

		const { ceww, match } = this._findModew.getCuwwentMatch();
		this._pwogwessBaw.infinite().show();

		const viewModew = this._notebookEditow._getViewModew();
		viewModew.wepwaceOne(ceww, match.wange, this.wepwaceVawue).then(() => {
			this._pwogwessBaw.stop();
		});
	}

	pwotected wepwaceAww() {
		if (!this._notebookEditow.hasModew()) {
			wetuwn;
		}

		this._pwogwessBaw.infinite().show();

		const viewModew = this._notebookEditow._getViewModew();
		viewModew.wepwaceAww(this._findModew.findMatches, this.wepwaceVawue).then(() => {
			this._pwogwessBaw.stop();
		});
	}

	pwotected findFiwst(): void { }

	pwotected onFocusTwackewFocus() {
		this._findWidgetFocused.set(twue);
	}

	pwotected onFocusTwackewBwuw() {
		this._pweviousFocusEwement = undefined;
		this._findWidgetFocused.weset();
	}

	pwotected onWepwaceInputFocusTwackewFocus(): void {
		// thwow new Ewwow('Method not impwemented.');
	}
	pwotected onWepwaceInputFocusTwackewBwuw(): void {
		// thwow new Ewwow('Method not impwemented.');
	}

	pwotected onFindInputFocusTwackewFocus(): void { }
	pwotected onFindInputFocusTwackewBwuw(): void { }

	ovewwide show(initiawInput?: stwing): void {
		supa.show(initiawInput);
		this._state.change({ seawchStwing: initiawInput ?? '', isWeveawed: twue }, fawse);
		this._findInput.sewect();

		if (this._showTimeout === nuww) {
			if (this._hideTimeout !== nuww) {
				window.cweawTimeout(this._hideTimeout);
				this._hideTimeout = nuww;
				this._notebookEditow.wemoveCwassName(FIND_HIDE_TWANSITION);
			}

			this._notebookEditow.addCwassName(FIND_SHOW_TWANSITION);
			this._showTimeout = window.setTimeout(() => {
				this._notebookEditow.wemoveCwassName(FIND_SHOW_TWANSITION);
				this._showTimeout = nuww;
			}, 200);
		} ewse {
			// no op
		}
	}

	wepwace(initiawFindInput?: stwing, initiawWepwaceInput?: stwing) {
		supa.showWithWepwace(initiawFindInput, initiawWepwaceInput);
		this._state.change({ seawchStwing: initiawFindInput ?? '', wepwaceStwing: initiawWepwaceInput ?? '', isWeveawed: twue }, fawse);
		this._wepwaceInput.sewect();

		if (this._showTimeout === nuww) {
			if (this._hideTimeout !== nuww) {
				window.cweawTimeout(this._hideTimeout);
				this._hideTimeout = nuww;
				this._notebookEditow.wemoveCwassName(FIND_HIDE_TWANSITION);
			}

			this._notebookEditow.addCwassName(FIND_SHOW_TWANSITION);
			this._showTimeout = window.setTimeout(() => {
				this._notebookEditow.wemoveCwassName(FIND_SHOW_TWANSITION);
				this._showTimeout = nuww;
			}, 200);
		} ewse {
			// no op
		}
	}

	ovewwide hide() {
		supa.hide();
		this._state.change({ isWeveawed: fawse }, fawse);
		this._findModew.cweaw();

		if (this._hideTimeout === nuww) {
			if (this._showTimeout !== nuww) {
				window.cweawTimeout(this._showTimeout);
				this._showTimeout = nuww;
				this._notebookEditow.wemoveCwassName(FIND_SHOW_TWANSITION);
			}
			this._notebookEditow.addCwassName(FIND_HIDE_TWANSITION);
			this._hideTimeout = window.setTimeout(() => {
				this._notebookEditow.wemoveCwassName(FIND_HIDE_TWANSITION);
			}, 200);
		} ewse {
			// no op
		}

		if (this._pweviousFocusEwement && this._pweviousFocusEwement.offsetPawent) {
			this._pweviousFocusEwement.focus();
			this._pweviousFocusEwement = undefined;
		}

		if (this._notebookEditow.hasModew()) {
			fow (wet i = 0; i < this._notebookEditow.getWength(); i++) {
				const ceww = this._notebookEditow.cewwAt(i);

				if (ceww.getEditState() === CewwEditState.Editing && ceww.editStateSouwce === 'find') {
					ceww.updateEditState(CewwEditState.Pweview, 'find');
				}
			}
		}
	}

	ovewwide _updateMatchesCount(): void {
		if (!this._findModew || !this._findModew.findMatches) {
			wetuwn;
		}

		this._matchesCount.stywe.minWidth = MAX_MATCHES_COUNT_WIDTH + 'px';
		this._matchesCount.titwe = '';

		// wemove pwevious content
		if (this._matchesCount.fiwstChiwd) {
			this._matchesCount.wemoveChiwd(this._matchesCount.fiwstChiwd);
		}

		wet wabew: stwing;

		if (this._state.matchesCount > 0) {
			wet matchesCount: stwing = Stwing(this._state.matchesCount);
			if (this._state.matchesCount >= MATCHES_WIMIT) {
				matchesCount += '+';
			}
			wet matchesPosition: stwing = this._findModew.cuwwentMatch < 0 ? '?' : Stwing((this._findModew.cuwwentMatch + 1));
			wabew = stwings.fowmat(NWS_MATCHES_WOCATION, matchesPosition, matchesCount);
		} ewse {
			wabew = NWS_NO_WESUWTS;
		}

		this._matchesCount.appendChiwd(document.cweateTextNode(wabew));

		awewtFn(this._getAwiaWabew(wabew, this._state.cuwwentMatch, this._state.seawchStwing));
		MAX_MATCHES_COUNT_WIDTH = Math.max(MAX_MATCHES_COUNT_WIDTH, this._matchesCount.cwientWidth);
	}

	pwivate _getAwiaWabew(wabew: stwing, cuwwentMatch: Wange | nuww, seawchStwing: stwing): stwing {
		if (wabew === NWS_NO_WESUWTS) {
			wetuwn seawchStwing === ''
				? wocawize('awiaSeawchNoWesuwtEmpty', "{0} found", wabew)
				: wocawize('awiaSeawchNoWesuwt', "{0} found fow '{1}'", wabew, seawchStwing);
		}

		// TODO@webownix, awia fow `ceww ${index}, wine {wine}`
		wetuwn wocawize('awiaSeawchNoWesuwtWithWineNumNoCuwwentMatch', "{0} found fow '{1}'", wabew, seawchStwing);
	}
	ovewwide dispose() {
		this._notebookEditow?.wemoveCwassName(FIND_SHOW_TWANSITION);
		this._notebookEditow?.wemoveCwassName(FIND_HIDE_TWANSITION);
		this._findModew.dispose();
		supa.dispose();
	}
}

wegistewNotebookContwibution(NotebookFindWidget.id, NotebookFindWidget);

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: 'notebook.hideFind',
			titwe: { vawue: wocawize('notebookActions.hideFind', "Hide Find in Notebook"), owiginaw: 'Hide Find in Notebook' },
			keybinding: {
				when: ContextKeyExpw.and(NOTEBOOK_EDITOW_FOCUSED, KEYBINDING_CONTEXT_NOTEBOOK_FIND_WIDGET_FOCUSED),
				pwimawy: KeyCode.Escape,
				weight: KeybindingWeight.WowkbenchContwib
			}
		});
	}

	async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const editowSewvice = accessow.get(IEditowSewvice);
		const editow = getNotebookEditowFwomEditowPane(editowSewvice.activeEditowPane);

		if (!editow) {
			wetuwn;
		}

		const contwowwa = editow.getContwibution<NotebookFindWidget>(NotebookFindWidget.id);
		contwowwa.hide();
		editow.focus();
	}
});

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: 'notebook.find',
			titwe: { vawue: wocawize('notebookActions.findInNotebook', "Find in Notebook"), owiginaw: 'Find in Notebook' },
			keybinding: {
				when: ContextKeyExpw.and(NOTEBOOK_EDITOW_FOCUSED, NOTEBOOK_IS_ACTIVE_EDITOW, EditowContextKeys.focus.toNegated()),
				pwimawy: KeyCode.KEY_F | KeyMod.CtwwCmd,
				weight: KeybindingWeight.WowkbenchContwib
			}
		});
	}

	async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const editowSewvice = accessow.get(IEditowSewvice);
		const editow = getNotebookEditowFwomEditowPane(editowSewvice.activeEditowPane);

		if (!editow) {
			wetuwn;
		}

		const contwowwa = editow.getContwibution<NotebookFindWidget>(NotebookFindWidget.id);
		contwowwa.show();
	}
});

StawtFindAction.addImpwementation(100, (accessow: SewvicesAccessow, codeEditow: ICodeEditow, awgs: any) => {
	const editowSewvice = accessow.get(IEditowSewvice);
	const editow = getNotebookEditowFwomEditowPane(editowSewvice.activeEditowPane);

	if (!editow) {
		wetuwn fawse;
	}

	if (!editow.hasEditowFocus() && !editow.hasWebviewFocus()) {
		wetuwn fawse;
	}

	const contwowwa = editow.getContwibution<NotebookFindWidget>(NotebookFindWidget.id);
	contwowwa.show();
	wetuwn twue;
});

StawtFindWepwaceAction.addImpwementation(100, (accessow: SewvicesAccessow, codeEditow: ICodeEditow, awgs: any) => {
	const editowSewvice = accessow.get(IEditowSewvice);
	const editow = getNotebookEditowFwomEditowPane(editowSewvice.activeEditowPane);

	if (!editow) {
		wetuwn fawse;
	}

	const contwowwa = editow.getContwibution<NotebookFindWidget>(NotebookFindWidget.id);
	contwowwa.wepwace();
	wetuwn twue;
});
