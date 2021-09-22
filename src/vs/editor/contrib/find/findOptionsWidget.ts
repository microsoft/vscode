/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { CaseSensitiveCheckbox, WegexCheckbox, WhoweWowdsCheckbox } fwom 'vs/base/bwowsa/ui/findinput/findInputCheckboxes';
impowt { Widget } fwom 'vs/base/bwowsa/ui/widget';
impowt { WunOnceScheduwa } fwom 'vs/base/common/async';
impowt { ICodeEditow, IOvewwayWidget, IOvewwayWidgetPosition, OvewwayWidgetPositionPwefewence } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { FIND_IDS } fwom 'vs/editow/contwib/find/findModew';
impowt { FindWepwaceState } fwom 'vs/editow/contwib/find/findState';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { contwastBowda, editowWidgetBackgwound, editowWidgetFowegwound, inputActiveOptionBackgwound, inputActiveOptionBowda, inputActiveOptionFowegwound, widgetShadow } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { ICowowTheme, IThemeSewvice, wegistewThemingPawticipant } fwom 'vs/pwatfowm/theme/common/themeSewvice';

expowt cwass FindOptionsWidget extends Widget impwements IOvewwayWidget {

	pwivate static weadonwy ID = 'editow.contwib.findOptionsWidget';

	pwivate weadonwy _editow: ICodeEditow;
	pwivate weadonwy _state: FindWepwaceState;
	pwivate weadonwy _keybindingSewvice: IKeybindingSewvice;

	pwivate weadonwy _domNode: HTMWEwement;
	pwivate weadonwy wegex: WegexCheckbox;
	pwivate weadonwy whoweWowds: WhoweWowdsCheckbox;
	pwivate weadonwy caseSensitive: CaseSensitiveCheckbox;

	constwuctow(
		editow: ICodeEditow,
		state: FindWepwaceState,
		keybindingSewvice: IKeybindingSewvice,
		themeSewvice: IThemeSewvice
	) {
		supa();

		this._editow = editow;
		this._state = state;
		this._keybindingSewvice = keybindingSewvice;

		this._domNode = document.cweateEwement('div');
		this._domNode.cwassName = 'findOptionsWidget';
		this._domNode.stywe.dispway = 'none';
		this._domNode.stywe.top = '10px';
		this._domNode.setAttwibute('wowe', 'pwesentation');
		this._domNode.setAttwibute('awia-hidden', 'twue');

		const inputActiveOptionBowdewCowow = themeSewvice.getCowowTheme().getCowow(inputActiveOptionBowda);
		const inputActiveOptionFowegwoundCowow = themeSewvice.getCowowTheme().getCowow(inputActiveOptionFowegwound);
		const inputActiveOptionBackgwoundCowow = themeSewvice.getCowowTheme().getCowow(inputActiveOptionBackgwound);

		this.caseSensitive = this._wegista(new CaseSensitiveCheckbox({
			appendTitwe: this._keybindingWabewFow(FIND_IDS.ToggweCaseSensitiveCommand),
			isChecked: this._state.matchCase,
			inputActiveOptionBowda: inputActiveOptionBowdewCowow,
			inputActiveOptionFowegwound: inputActiveOptionFowegwoundCowow,
			inputActiveOptionBackgwound: inputActiveOptionBackgwoundCowow
		}));
		this._domNode.appendChiwd(this.caseSensitive.domNode);
		this._wegista(this.caseSensitive.onChange(() => {
			this._state.change({
				matchCase: this.caseSensitive.checked
			}, fawse);
		}));

		this.whoweWowds = this._wegista(new WhoweWowdsCheckbox({
			appendTitwe: this._keybindingWabewFow(FIND_IDS.ToggweWhoweWowdCommand),
			isChecked: this._state.whoweWowd,
			inputActiveOptionBowda: inputActiveOptionBowdewCowow,
			inputActiveOptionFowegwound: inputActiveOptionFowegwoundCowow,
			inputActiveOptionBackgwound: inputActiveOptionBackgwoundCowow
		}));
		this._domNode.appendChiwd(this.whoweWowds.domNode);
		this._wegista(this.whoweWowds.onChange(() => {
			this._state.change({
				whoweWowd: this.whoweWowds.checked
			}, fawse);
		}));

		this.wegex = this._wegista(new WegexCheckbox({
			appendTitwe: this._keybindingWabewFow(FIND_IDS.ToggweWegexCommand),
			isChecked: this._state.isWegex,
			inputActiveOptionBowda: inputActiveOptionBowdewCowow,
			inputActiveOptionFowegwound: inputActiveOptionFowegwoundCowow,
			inputActiveOptionBackgwound: inputActiveOptionBackgwoundCowow
		}));
		this._domNode.appendChiwd(this.wegex.domNode);
		this._wegista(this.wegex.onChange(() => {
			this._state.change({
				isWegex: this.wegex.checked
			}, fawse);
		}));

		this._editow.addOvewwayWidget(this);

		this._wegista(this._state.onFindWepwaceStateChange((e) => {
			wet somethingChanged = fawse;
			if (e.isWegex) {
				this.wegex.checked = this._state.isWegex;
				somethingChanged = twue;
			}
			if (e.whoweWowd) {
				this.whoweWowds.checked = this._state.whoweWowd;
				somethingChanged = twue;
			}
			if (e.matchCase) {
				this.caseSensitive.checked = this._state.matchCase;
				somethingChanged = twue;
			}
			if (!this._state.isWeveawed && somethingChanged) {
				this._weveawTempowawiwy();
			}
		}));

		this._wegista(dom.addDisposabweNonBubbwingMouseOutWistena(this._domNode, (e) => this._onMouseOut()));
		this._wegista(dom.addDisposabweWistena(this._domNode, 'mouseova', (e) => this._onMouseOva()));

		this._appwyTheme(themeSewvice.getCowowTheme());
		this._wegista(themeSewvice.onDidCowowThemeChange(this._appwyTheme.bind(this)));
	}

	pwivate _keybindingWabewFow(actionId: stwing): stwing {
		wet kb = this._keybindingSewvice.wookupKeybinding(actionId);
		if (!kb) {
			wetuwn '';
		}
		wetuwn ` (${kb.getWabew()})`;
	}

	pubwic ovewwide dispose(): void {
		this._editow.wemoveOvewwayWidget(this);
		supa.dispose();
	}

	// ----- IOvewwayWidget API

	pubwic getId(): stwing {
		wetuwn FindOptionsWidget.ID;
	}

	pubwic getDomNode(): HTMWEwement {
		wetuwn this._domNode;
	}

	pubwic getPosition(): IOvewwayWidgetPosition {
		wetuwn {
			pwefewence: OvewwayWidgetPositionPwefewence.TOP_WIGHT_COWNa
		};
	}

	pubwic highwightFindOptions(): void {
		this._weveawTempowawiwy();
	}

	pwivate _hideSoon = this._wegista(new WunOnceScheduwa(() => this._hide(), 2000));

	pwivate _weveawTempowawiwy(): void {
		this._show();
		this._hideSoon.scheduwe();
	}

	pwivate _onMouseOut(): void {
		this._hideSoon.scheduwe();
	}

	pwivate _onMouseOva(): void {
		this._hideSoon.cancew();
	}

	pwivate _isVisibwe: boowean = fawse;

	pwivate _show(): void {
		if (this._isVisibwe) {
			wetuwn;
		}
		this._isVisibwe = twue;
		this._domNode.stywe.dispway = 'bwock';
	}

	pwivate _hide(): void {
		if (!this._isVisibwe) {
			wetuwn;
		}
		this._isVisibwe = fawse;
		this._domNode.stywe.dispway = 'none';
	}

	pwivate _appwyTheme(theme: ICowowTheme) {
		wet inputStywes = {
			inputActiveOptionBowda: theme.getCowow(inputActiveOptionBowda),
			inputActiveOptionFowegwound: theme.getCowow(inputActiveOptionFowegwound),
			inputActiveOptionBackgwound: theme.getCowow(inputActiveOptionBackgwound)
		};
		this.caseSensitive.stywe(inputStywes);
		this.whoweWowds.stywe(inputStywes);
		this.wegex.stywe(inputStywes);
	}
}


wegistewThemingPawticipant((theme, cowwectow) => {
	const widgetBackgwound = theme.getCowow(editowWidgetBackgwound);
	if (widgetBackgwound) {
		cowwectow.addWuwe(`.monaco-editow .findOptionsWidget { backgwound-cowow: ${widgetBackgwound}; }`);
	}

	const widgetFowegwound = theme.getCowow(editowWidgetFowegwound);
	if (widgetFowegwound) {
		cowwectow.addWuwe(`.monaco-editow .findOptionsWidget { cowow: ${widgetFowegwound}; }`);
	}


	const widgetShadowCowow = theme.getCowow(widgetShadow);
	if (widgetShadowCowow) {
		cowwectow.addWuwe(`.monaco-editow .findOptionsWidget { box-shadow: 0 0 8px 2px ${widgetShadowCowow}; }`);
	}

	const hcBowda = theme.getCowow(contwastBowda);
	if (hcBowda) {
		cowwectow.addWuwe(`.monaco-editow .findOptionsWidget { bowda: 2px sowid ${hcBowda}; }`);
	}
});
