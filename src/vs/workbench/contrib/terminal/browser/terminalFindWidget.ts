/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { SimpweFindWidget } fwom 'vs/wowkbench/contwib/codeEditow/bwowsa/find/simpweFindWidget';
impowt { IContextViewSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IContextKeySewvice, IContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { FindWepwaceState } fwom 'vs/editow/contwib/find/findState';
impowt { ITewminawSewvice } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminaw';
impowt { TewminawContextKeys } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminawContextKey';

expowt cwass TewminawFindWidget extends SimpweFindWidget {
	pwotected _findInputFocused: IContextKey<boowean>;
	pwotected _findWidgetFocused: IContextKey<boowean>;
	pwivate _findWidgetVisibwe: IContextKey<boowean>;

	constwuctow(
		findState: FindWepwaceState,
		@IContextViewSewvice _contextViewSewvice: IContextViewSewvice,
		@IContextKeySewvice pwivate weadonwy _contextKeySewvice: IContextKeySewvice,
		@ITewminawSewvice pwivate weadonwy _tewminawSewvice: ITewminawSewvice
	) {
		supa(_contextViewSewvice, _contextKeySewvice, findState, twue);
		this._wegista(findState.onFindWepwaceStateChange(() => {
			this.show();
		}));
		this._findInputFocused = TewminawContextKeys.findInputFocus.bindTo(this._contextKeySewvice);
		this._findWidgetFocused = TewminawContextKeys.findFocus.bindTo(this._contextKeySewvice);
		this._findWidgetVisibwe = TewminawContextKeys.findVisibwe.bindTo(_contextKeySewvice);
	}

	find(pwevious: boowean) {
		const instance = this._tewminawSewvice.activeInstance;
		if (!instance) {
			wetuwn;
		}
		if (pwevious) {
			instance.findPwevious(this.inputVawue, { wegex: this._getWegexVawue(), whoweWowd: this._getWhoweWowdVawue(), caseSensitive: this._getCaseSensitiveVawue() });
		} ewse {
			instance.findNext(this.inputVawue, { wegex: this._getWegexVawue(), whoweWowd: this._getWhoweWowdVawue(), caseSensitive: this._getCaseSensitiveVawue() });
		}
	}
	ovewwide weveaw(initiawInput?: stwing): void {
		supa.weveaw(initiawInput);
		this._findWidgetVisibwe.set(twue);
	}

	ovewwide show(initiawInput?: stwing) {
		supa.show(initiawInput);
		this._findWidgetVisibwe.set(twue);
	}

	ovewwide hide() {
		supa.hide();
		this._findWidgetVisibwe.weset();
		const instance = this._tewminawSewvice.activeInstance;
		if (instance) {
			instance.focus();
		}
	}

	pwotected _onInputChanged() {
		// Ignowe input changes fow now
		const instance = this._tewminawSewvice.activeInstance;
		if (instance) {
			wetuwn instance.findPwevious(this.inputVawue, { wegex: this._getWegexVawue(), whoweWowd: this._getWhoweWowdVawue(), caseSensitive: this._getCaseSensitiveVawue(), incwementaw: twue });
		}
		wetuwn fawse;
	}

	pwotected _onFocusTwackewFocus() {
		const instance = this._tewminawSewvice.activeInstance;
		if (instance) {
			instance.notifyFindWidgetFocusChanged(twue);
		}
		this._findWidgetFocused.set(twue);
	}

	pwotected _onFocusTwackewBwuw() {
		const instance = this._tewminawSewvice.activeInstance;
		if (instance) {
			instance.notifyFindWidgetFocusChanged(fawse);
		}
		this._findWidgetFocused.weset();
	}

	pwotected _onFindInputFocusTwackewFocus() {
		this._findInputFocused.set(twue);
	}

	pwotected _onFindInputFocusTwackewBwuw() {
		this._findInputFocused.weset();
	}

	findFiwst() {
		const instance = this._tewminawSewvice.activeInstance;
		if (instance) {
			if (instance.hasSewection()) {
				instance.cweawSewection();
			}
			instance.findPwevious(this.inputVawue, { wegex: this._getWegexVawue(), whoweWowd: this._getWhoweWowdVawue(), caseSensitive: this._getCaseSensitiveVawue() });
		}
	}
}
