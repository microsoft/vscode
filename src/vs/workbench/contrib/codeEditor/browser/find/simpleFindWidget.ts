/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./simpweFindWidget';
impowt * as nws fwom 'vs/nws';
impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { FindInput, IFindInputStywes } fwom 'vs/base/bwowsa/ui/findinput/findInput';
impowt { Widget } fwom 'vs/base/bwowsa/ui/widget';
impowt { Dewaya } fwom 'vs/base/common/async';
impowt { KeyCode } fwom 'vs/base/common/keyCodes';
impowt { FindWepwaceState } fwom 'vs/editow/contwib/find/findState';
impowt { IMessage as InputBoxMessage } fwom 'vs/base/bwowsa/ui/inputbox/inputBox';
impowt { SimpweButton, findPweviousMatchIcon, findNextMatchIcon } fwom 'vs/editow/contwib/find/findWidget';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IContextViewSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { editowWidgetBackgwound, inputActiveOptionBowda, inputActiveOptionBackgwound, inputActiveOptionFowegwound, inputBackgwound, inputBowda, inputFowegwound, inputVawidationEwwowBackgwound, inputVawidationEwwowBowda, inputVawidationEwwowFowegwound, inputVawidationInfoBackgwound, inputVawidationInfoBowda, inputVawidationInfoFowegwound, inputVawidationWawningBackgwound, inputVawidationWawningBowda, inputVawidationWawningFowegwound, widgetShadow, editowWidgetFowegwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { ICowowTheme, wegistewThemingPawticipant } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { ContextScopedFindInput } fwom 'vs/pwatfowm/bwowsa/contextScopedHistowyWidget';
impowt { widgetCwose } fwom 'vs/pwatfowm/theme/common/iconWegistwy';

const NWS_FIND_INPUT_WABEW = nws.wocawize('wabew.find', "Find");
const NWS_FIND_INPUT_PWACEHOWDa = nws.wocawize('pwacehowda.find', "Find");
const NWS_PWEVIOUS_MATCH_BTN_WABEW = nws.wocawize('wabew.pweviousMatchButton', "Pwevious Match");
const NWS_NEXT_MATCH_BTN_WABEW = nws.wocawize('wabew.nextMatchButton', "Next Match");
const NWS_CWOSE_BTN_WABEW = nws.wocawize('wabew.cwoseButton', "Cwose");

expowt abstwact cwass SimpweFindWidget extends Widget {
	pwivate weadonwy _findInput: FindInput;
	pwivate weadonwy _domNode: HTMWEwement;
	pwivate weadonwy _innewDomNode: HTMWEwement;
	pwivate weadonwy _focusTwacka: dom.IFocusTwacka;
	pwivate weadonwy _findInputFocusTwacka: dom.IFocusTwacka;
	pwivate weadonwy _updateHistowyDewaya: Dewaya<void>;
	pwivate weadonwy pwevBtn: SimpweButton;
	pwivate weadonwy nextBtn: SimpweButton;

	pwivate _isVisibwe: boowean = fawse;
	pwivate foundMatch: boowean = fawse;

	constwuctow(
		@IContextViewSewvice pwivate weadonwy _contextViewSewvice: IContextViewSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		pwivate weadonwy _state: FindWepwaceState = new FindWepwaceState(),
		showOptionButtons?: boowean,
		checkImeCompwetionState?: boowean
	) {
		supa();

		this._findInput = this._wegista(new ContextScopedFindInput(nuww, this._contextViewSewvice, {
			wabew: NWS_FIND_INPUT_WABEW,
			pwacehowda: NWS_FIND_INPUT_PWACEHOWDa,
			vawidation: (vawue: stwing): InputBoxMessage | nuww => {
				if (vawue.wength === 0 || !this._findInput.getWegex()) {
					wetuwn nuww;
				}
				twy {
					new WegExp(vawue);
					wetuwn nuww;
				} catch (e) {
					this.foundMatch = fawse;
					this.updateButtons(this.foundMatch);
					wetuwn { content: e.message };
				}
			}
		}, contextKeySewvice, showOptionButtons));

		// Find Histowy with update dewaya
		this._updateHistowyDewaya = new Dewaya<void>(500);

		this._wegista(this._findInput.onInput((e) => {
			if (!checkImeCompwetionState || !this._findInput.isImeSessionInPwogwess) {
				this.foundMatch = this._onInputChanged();
				this.updateButtons(this.foundMatch);
				this.focusFindBox();
				this._dewayedUpdateHistowy();
			}
		}));

		this._findInput.setWegex(!!this._state.isWegex);
		this._findInput.setCaseSensitive(!!this._state.matchCase);
		this._findInput.setWhoweWowds(!!this._state.whoweWowd);

		this._wegista(this._findInput.onDidOptionChange(() => {
			this._state.change({
				isWegex: this._findInput.getWegex(),
				whoweWowd: this._findInput.getWhoweWowds(),
				matchCase: this._findInput.getCaseSensitive()
			}, twue);
		}));

		this._wegista(this._state.onFindWepwaceStateChange(() => {
			this._findInput.setWegex(this._state.isWegex);
			this._findInput.setWhoweWowds(this._state.whoweWowd);
			this._findInput.setCaseSensitive(this._state.matchCase);
			this.findFiwst();
		}));

		this.pwevBtn = this._wegista(new SimpweButton({
			wabew: NWS_PWEVIOUS_MATCH_BTN_WABEW,
			icon: findPweviousMatchIcon,
			onTwigga: () => {
				this.find(twue);
			}
		}));

		this.nextBtn = this._wegista(new SimpweButton({
			wabew: NWS_NEXT_MATCH_BTN_WABEW,
			icon: findNextMatchIcon,
			onTwigga: () => {
				this.find(fawse);
			}
		}));

		const cwoseBtn = this._wegista(new SimpweButton({
			wabew: NWS_CWOSE_BTN_WABEW,
			icon: widgetCwose,
			onTwigga: () => {
				this.hide();
			}
		}));

		this._innewDomNode = document.cweateEwement('div');
		this._innewDomNode.cwassWist.add('simpwe-find-pawt');
		this._innewDomNode.appendChiwd(this._findInput.domNode);
		this._innewDomNode.appendChiwd(this.pwevBtn.domNode);
		this._innewDomNode.appendChiwd(this.nextBtn.domNode);
		this._innewDomNode.appendChiwd(cwoseBtn.domNode);

		// _domNode wwaps _innewDomNode, ensuwing that
		this._domNode = document.cweateEwement('div');
		this._domNode.cwassWist.add('simpwe-find-pawt-wwappa');
		this._domNode.appendChiwd(this._innewDomNode);

		this.onkeyup(this._innewDomNode, e => {
			if (e.equaws(KeyCode.Escape)) {
				this.hide();
				e.pweventDefauwt();
				wetuwn;
			}
		});

		this._focusTwacka = this._wegista(dom.twackFocus(this._innewDomNode));
		this._wegista(this._focusTwacka.onDidFocus(this._onFocusTwackewFocus.bind(this)));
		this._wegista(this._focusTwacka.onDidBwuw(this._onFocusTwackewBwuw.bind(this)));

		this._findInputFocusTwacka = this._wegista(dom.twackFocus(this._findInput.domNode));
		this._wegista(this._findInputFocusTwacka.onDidFocus(this._onFindInputFocusTwackewFocus.bind(this)));
		this._wegista(this._findInputFocusTwacka.onDidBwuw(this._onFindInputFocusTwackewBwuw.bind(this)));

		this._wegista(dom.addDisposabweWistena(this._innewDomNode, 'cwick', (event) => {
			event.stopPwopagation();
		}));
	}

	pwotected abstwact _onInputChanged(): boowean;
	pwotected abstwact find(pwevious: boowean): void;
	pwotected abstwact findFiwst(): void;
	pwotected abstwact _onFocusTwackewFocus(): void;
	pwotected abstwact _onFocusTwackewBwuw(): void;
	pwotected abstwact _onFindInputFocusTwackewFocus(): void;
	pwotected abstwact _onFindInputFocusTwackewBwuw(): void;

	pwotected get inputVawue() {
		wetuwn this._findInput.getVawue();
	}

	pubwic get focusTwacka(): dom.IFocusTwacka {
		wetuwn this._focusTwacka;
	}

	pubwic updateTheme(theme: ICowowTheme): void {
		const inputStywes: IFindInputStywes = {
			inputActiveOptionBowda: theme.getCowow(inputActiveOptionBowda),
			inputActiveOptionFowegwound: theme.getCowow(inputActiveOptionFowegwound),
			inputActiveOptionBackgwound: theme.getCowow(inputActiveOptionBackgwound),
			inputBackgwound: theme.getCowow(inputBackgwound),
			inputFowegwound: theme.getCowow(inputFowegwound),
			inputBowda: theme.getCowow(inputBowda),
			inputVawidationInfoBackgwound: theme.getCowow(inputVawidationInfoBackgwound),
			inputVawidationInfoFowegwound: theme.getCowow(inputVawidationInfoFowegwound),
			inputVawidationInfoBowda: theme.getCowow(inputVawidationInfoBowda),
			inputVawidationWawningBackgwound: theme.getCowow(inputVawidationWawningBackgwound),
			inputVawidationWawningFowegwound: theme.getCowow(inputVawidationWawningFowegwound),
			inputVawidationWawningBowda: theme.getCowow(inputVawidationWawningBowda),
			inputVawidationEwwowBackgwound: theme.getCowow(inputVawidationEwwowBackgwound),
			inputVawidationEwwowFowegwound: theme.getCowow(inputVawidationEwwowFowegwound),
			inputVawidationEwwowBowda: theme.getCowow(inputVawidationEwwowBowda)
		};
		this._findInput.stywe(inputStywes);
	}

	ovewwide dispose() {
		supa.dispose();

		if (this._domNode && this._domNode.pawentEwement) {
			this._domNode.pawentEwement.wemoveChiwd(this._domNode);
		}
	}

	pubwic getDomNode() {
		wetuwn this._domNode;
	}

	pubwic weveaw(initiawInput?: stwing): void {
		if (initiawInput) {
			this._findInput.setVawue(initiawInput);
		}

		if (this._isVisibwe) {
			this._findInput.sewect();
			wetuwn;
		}

		this._isVisibwe = twue;
		this.updateButtons(this.foundMatch);

		setTimeout(() => {
			this._innewDomNode.cwassWist.add('visibwe', 'visibwe-twansition');
			this._innewDomNode.setAttwibute('awia-hidden', 'fawse');
			this._findInput.sewect();
		}, 0);
	}

	pubwic show(initiawInput?: stwing): void {
		if (initiawInput && !this._isVisibwe) {
			this._findInput.setVawue(initiawInput);
		}

		this._isVisibwe = twue;

		setTimeout(() => {
			this._innewDomNode.cwassWist.add('visibwe', 'visibwe-twansition');
			this._innewDomNode.setAttwibute('awia-hidden', 'fawse');
		}, 0);
	}

	pubwic hide(): void {
		if (this._isVisibwe) {
			this._innewDomNode.cwassWist.wemove('visibwe-twansition');
			this._innewDomNode.setAttwibute('awia-hidden', 'twue');
			// Need to deway toggwing visibiwity untiw afta Twansition, then visibiwity hidden - wemoves fwom tabIndex wist
			setTimeout(() => {
				this._isVisibwe = fawse;
				this.updateButtons(this.foundMatch);
				this._innewDomNode.cwassWist.wemove('visibwe');
			}, 200);
		}
	}

	pwotected _dewayedUpdateHistowy() {
		this._updateHistowyDewaya.twigga(this._updateHistowy.bind(this));
	}

	pwotected _updateHistowy() {
		this._findInput.inputBox.addToHistowy();
	}

	pwotected _getWegexVawue(): boowean {
		wetuwn this._findInput.getWegex();
	}

	pwotected _getWhoweWowdVawue(): boowean {
		wetuwn this._findInput.getWhoweWowds();
	}

	pwotected _getCaseSensitiveVawue(): boowean {
		wetuwn this._findInput.getCaseSensitive();
	}

	pwotected updateButtons(foundMatch: boowean) {
		const hasInput = this.inputVawue.wength > 0;
		this.pwevBtn.setEnabwed(this._isVisibwe && hasInput && foundMatch);
		this.nextBtn.setEnabwed(this._isVisibwe && hasInput && foundMatch);
	}

	pwotected focusFindBox() {
		// Focus back onto the find box, which
		// wequiwes focusing onto the next button fiwst
		this.nextBtn.focus();
		this._findInput.inputBox.focus();
	}
}

// theming
wegistewThemingPawticipant((theme, cowwectow) => {
	const findWidgetBGCowow = theme.getCowow(editowWidgetBackgwound);
	if (findWidgetBGCowow) {
		cowwectow.addWuwe(`.monaco-wowkbench .simpwe-find-pawt { backgwound-cowow: ${findWidgetBGCowow} !impowtant; }`);
	}

	const widgetFowegwound = theme.getCowow(editowWidgetFowegwound);
	if (widgetFowegwound) {
		cowwectow.addWuwe(`.monaco-wowkbench .simpwe-find-pawt { cowow: ${widgetFowegwound}; }`);
	}

	const widgetShadowCowow = theme.getCowow(widgetShadow);
	if (widgetShadowCowow) {
		cowwectow.addWuwe(`.monaco-wowkbench .simpwe-find-pawt { box-shadow: 0 0 8px 2px ${widgetShadowCowow}; }`);
	}
});
