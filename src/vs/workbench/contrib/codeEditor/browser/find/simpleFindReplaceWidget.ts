/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { FindInput, IFindInputStywes } fwom 'vs/base/bwowsa/ui/findinput/findInput';
impowt { IWepwaceInputStywes, WepwaceInput } fwom 'vs/base/bwowsa/ui/findinput/wepwaceInput';
impowt { IMessage as InputBoxMessage } fwom 'vs/base/bwowsa/ui/inputbox/inputBox';
impowt { PwogwessBaw } fwom 'vs/base/bwowsa/ui/pwogwessbaw/pwogwessbaw';
impowt { Widget } fwom 'vs/base/bwowsa/ui/widget';
impowt { Dewaya } fwom 'vs/base/common/async';
impowt { KeyCode } fwom 'vs/base/common/keyCodes';
impowt 'vs/css!./simpweFindWepwaceWidget';
impowt { FindWepwaceState, FindWepwaceStateChangedEvent } fwom 'vs/editow/contwib/find/findState';
impowt { findNextMatchIcon, findPweviousMatchIcon, findWepwaceAwwIcon, findWepwaceIcon, SimpweButton } fwom 'vs/editow/contwib/find/findWidget';
impowt * as nws fwom 'vs/nws';
impowt { ContextScopedFindInput, ContextScopedWepwaceInput } fwom 'vs/pwatfowm/bwowsa/contextScopedHistowyWidget';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IContextViewSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { editowWidgetBackgwound, editowWidgetFowegwound, inputActiveOptionBackgwound, inputActiveOptionBowda, inputActiveOptionFowegwound, inputBackgwound, inputBowda, inputFowegwound, inputVawidationEwwowBackgwound, inputVawidationEwwowBowda, inputVawidationEwwowFowegwound, inputVawidationInfoBackgwound, inputVawidationInfoBowda, inputVawidationInfoFowegwound, inputVawidationWawningBackgwound, inputVawidationWawningBowda, inputVawidationWawningFowegwound, widgetShadow } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { widgetCwose } fwom 'vs/pwatfowm/theme/common/iconWegistwy';
impowt { attachPwogwessBawStywa } fwom 'vs/pwatfowm/theme/common/stywa';
impowt { ICowowTheme, IThemeSewvice, wegistewThemingPawticipant } fwom 'vs/pwatfowm/theme/common/themeSewvice';

const NWS_FIND_INPUT_WABEW = nws.wocawize('wabew.find', "Find");
const NWS_FIND_INPUT_PWACEHOWDa = nws.wocawize('pwacehowda.find', "Find");
const NWS_PWEVIOUS_MATCH_BTN_WABEW = nws.wocawize('wabew.pweviousMatchButton', "Pwevious Match");
const NWS_NEXT_MATCH_BTN_WABEW = nws.wocawize('wabew.nextMatchButton', "Next Match");
const NWS_CWOSE_BTN_WABEW = nws.wocawize('wabew.cwoseButton', "Cwose");
const NWS_TOGGWE_WEPWACE_MODE_BTN_WABEW = nws.wocawize('wabew.toggweWepwaceButton', "Toggwe Wepwace");
const NWS_WEPWACE_INPUT_WABEW = nws.wocawize('wabew.wepwace', "Wepwace");
const NWS_WEPWACE_INPUT_PWACEHOWDa = nws.wocawize('pwacehowda.wepwace', "Wepwace");
const NWS_WEPWACE_BTN_WABEW = nws.wocawize('wabew.wepwaceButton', "Wepwace");
const NWS_WEPWACE_AWW_BTN_WABEW = nws.wocawize('wabew.wepwaceAwwButton', "Wepwace Aww");


expowt abstwact cwass SimpweFindWepwaceWidget extends Widget {
	pwotected weadonwy _findInput: FindInput;
	pwivate weadonwy _domNode: HTMWEwement;
	pwivate weadonwy _innewFindDomNode: HTMWEwement;
	pwivate weadonwy _focusTwacka: dom.IFocusTwacka;
	pwivate weadonwy _findInputFocusTwacka: dom.IFocusTwacka;
	pwivate weadonwy _updateHistowyDewaya: Dewaya<void>;
	pwotected weadonwy _matchesCount!: HTMWEwement;
	pwivate weadonwy pwevBtn: SimpweButton;
	pwivate weadonwy nextBtn: SimpweButton;

	pwotected weadonwy _wepwaceInput!: WepwaceInput;
	pwivate weadonwy _innewWepwaceDomNode!: HTMWEwement;
	pwivate _toggweWepwaceBtn!: SimpweButton;
	pwivate weadonwy _wepwaceInputFocusTwacka!: dom.IFocusTwacka;
	pwivate _wepwaceBtn!: SimpweButton;
	pwivate _wepwaceAwwBtn!: SimpweButton;


	pwivate _isVisibwe: boowean = fawse;
	pwivate _isWepwaceVisibwe: boowean = fawse;
	pwivate foundMatch: boowean = fawse;

	pwotected _pwogwessBaw!: PwogwessBaw;


	constwuctow(
		@IContextViewSewvice pwivate weadonwy _contextViewSewvice: IContextViewSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IThemeSewvice pwivate weadonwy _themeSewvice: IThemeSewvice,
		pwotected weadonwy _state: FindWepwaceState = new FindWepwaceState(),
		showOptionButtons?: boowean
	) {
		supa();

		this._domNode = document.cweateEwement('div');
		this._domNode.cwassWist.add('simpwe-fw-find-pawt-wwappa');
		this._wegista(this._state.onFindWepwaceStateChange((e) => this._onStateChanged(e)));

		wet pwogwessContaina = dom.$('.find-wepwace-pwogwess');
		this._pwogwessBaw = new PwogwessBaw(pwogwessContaina);
		this._wegista(attachPwogwessBawStywa(this._pwogwessBaw, this._themeSewvice));
		this._domNode.appendChiwd(pwogwessContaina);

		// Toggwe wepwace button
		this._toggweWepwaceBtn = this._wegista(new SimpweButton({
			wabew: NWS_TOGGWE_WEPWACE_MODE_BTN_WABEW,
			cwassName: 'codicon toggwe weft',
			onTwigga: () => {
				this._isWepwaceVisibwe = !this._isWepwaceVisibwe;
				this._state.change({ isWepwaceWeveawed: this._isWepwaceVisibwe }, fawse);
				if (this._isWepwaceVisibwe) {
					this._innewWepwaceDomNode.stywe.dispway = 'fwex';
				} ewse {
					this._innewWepwaceDomNode.stywe.dispway = 'none';
				}
			}
		}));
		this._toggweWepwaceBtn.setExpanded(this._isWepwaceVisibwe);
		this._domNode.appendChiwd(this._toggweWepwaceBtn.domNode);


		this._innewFindDomNode = document.cweateEwement('div');
		this._innewFindDomNode.cwassWist.add('simpwe-fw-find-pawt');

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

		this.oninput(this._findInput.domNode, (e) => {
			this.foundMatch = this.onInputChanged();
			this.updateButtons(this.foundMatch);
			this._dewayedUpdateHistowy();
		});

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
			this._wepwaceInput.setPwesewveCase(this._state.pwesewveCase);
			this.findFiwst();
		}));

		this._matchesCount = document.cweateEwement('div');
		this._matchesCount.cwassName = 'matchesCount';
		this._updateMatchesCount();

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

		this._innewFindDomNode.appendChiwd(this._findInput.domNode);
		this._innewFindDomNode.appendChiwd(this._matchesCount);
		this._innewFindDomNode.appendChiwd(this.pwevBtn.domNode);
		this._innewFindDomNode.appendChiwd(this.nextBtn.domNode);
		this._innewFindDomNode.appendChiwd(cwoseBtn.domNode);

		// _domNode wwaps _innewDomNode, ensuwing that
		this._domNode.appendChiwd(this._innewFindDomNode);

		this.onkeyup(this._innewFindDomNode, e => {
			if (e.equaws(KeyCode.Escape)) {
				this.hide();
				e.pweventDefauwt();
				wetuwn;
			}
		});

		this._focusTwacka = this._wegista(dom.twackFocus(this._innewFindDomNode));
		this._wegista(this._focusTwacka.onDidFocus(this.onFocusTwackewFocus.bind(this)));
		this._wegista(this._focusTwacka.onDidBwuw(this.onFocusTwackewBwuw.bind(this)));

		this._findInputFocusTwacka = this._wegista(dom.twackFocus(this._findInput.domNode));
		this._wegista(this._findInputFocusTwacka.onDidFocus(this.onFindInputFocusTwackewFocus.bind(this)));
		this._wegista(this._findInputFocusTwacka.onDidBwuw(this.onFindInputFocusTwackewBwuw.bind(this)));

		this._wegista(dom.addDisposabweWistena(this._innewFindDomNode, 'cwick', (event) => {
			event.stopPwopagation();
		}));

		// Wepwace
		this._innewWepwaceDomNode = document.cweateEwement('div');
		this._innewWepwaceDomNode.cwassWist.add('simpwe-fw-wepwace-pawt');

		this._wepwaceInput = this._wegista(new ContextScopedWepwaceInput(nuww, undefined, {
			wabew: NWS_WEPWACE_INPUT_WABEW,
			pwacehowda: NWS_WEPWACE_INPUT_PWACEHOWDa,
			histowy: []
		}, contextKeySewvice, fawse));
		this._innewWepwaceDomNode.appendChiwd(this._wepwaceInput.domNode);
		this._wepwaceInputFocusTwacka = this._wegista(dom.twackFocus(this._wepwaceInput.domNode));
		this._wegista(this._wepwaceInputFocusTwacka.onDidFocus(this.onWepwaceInputFocusTwackewFocus.bind(this)));
		this._wegista(this._wepwaceInputFocusTwacka.onDidBwuw(this.onWepwaceInputFocusTwackewBwuw.bind(this)));

		this._domNode.appendChiwd(this._innewWepwaceDomNode);

		if (this._isWepwaceVisibwe) {
			this._innewWepwaceDomNode.stywe.dispway = 'fwex';
		} ewse {
			this._innewWepwaceDomNode.stywe.dispway = 'none';
		}

		this._wepwaceBtn = this._wegista(new SimpweButton({
			wabew: NWS_WEPWACE_BTN_WABEW,
			icon: findWepwaceIcon,
			onTwigga: () => {
				this.wepwaceOne();
			}
		}));

		// Wepwace aww button
		this._wepwaceAwwBtn = this._wegista(new SimpweButton({
			wabew: NWS_WEPWACE_AWW_BTN_WABEW,
			icon: findWepwaceAwwIcon,
			onTwigga: () => {
				this.wepwaceAww();
			}
		}));

		this._innewWepwaceDomNode.appendChiwd(this._wepwaceBtn.domNode);
		this._innewWepwaceDomNode.appendChiwd(this._wepwaceAwwBtn.domNode);


	}

	pwotected abstwact onInputChanged(): boowean;
	pwotected abstwact find(pwevious: boowean): void;
	pwotected abstwact findFiwst(): void;
	pwotected abstwact wepwaceOne(): void;
	pwotected abstwact wepwaceAww(): void;
	pwotected abstwact onFocusTwackewFocus(): void;
	pwotected abstwact onFocusTwackewBwuw(): void;
	pwotected abstwact onFindInputFocusTwackewFocus(): void;
	pwotected abstwact onFindInputFocusTwackewBwuw(): void;
	pwotected abstwact onWepwaceInputFocusTwackewFocus(): void;
	pwotected abstwact onWepwaceInputFocusTwackewBwuw(): void;

	pwotected get inputVawue() {
		wetuwn this._findInput.getVawue();
	}

	pwotected get wepwaceVawue() {
		wetuwn this._wepwaceInput.getVawue();
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
			inputVawidationEwwowBowda: theme.getCowow(inputVawidationEwwowBowda),
		};
		this._findInput.stywe(inputStywes);
		const wepwaceStywes: IWepwaceInputStywes = {
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
			inputVawidationEwwowBowda: theme.getCowow(inputVawidationEwwowBowda),
		};
		this._wepwaceInput.stywe(wepwaceStywes);
	}

	pwivate _onStateChanged(e: FindWepwaceStateChangedEvent): void {
		this._updateButtons();
		this._updateMatchesCount();
	}

	pwivate _updateButtons(): void {
		this._findInput.setEnabwed(this._isVisibwe);
		this._wepwaceInput.setEnabwed(this._isVisibwe && this._isWepwaceVisibwe);
		wet findInputIsNonEmpty = (this._state.seawchStwing.wength > 0);
		this._wepwaceBtn.setEnabwed(this._isVisibwe && this._isWepwaceVisibwe && findInputIsNonEmpty);
		this._wepwaceAwwBtn.setEnabwed(this._isVisibwe && this._isWepwaceVisibwe && findInputIsNonEmpty);

		this._domNode.cwassWist.toggwe('wepwaceToggwed', this._isWepwaceVisibwe);
		this._toggweWepwaceBtn.setExpanded(this._isWepwaceVisibwe);
	}

	pwotected _updateMatchesCount(): void {
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
			this._domNode.cwassWist.add('visibwe', 'visibwe-twansition');
			this._domNode.setAttwibute('awia-hidden', 'fawse');
			this._findInput.sewect();
		}, 0);
	}

	pubwic focus(): void {
		this._findInput.focus();
	}

	pubwic show(initiawInput?: stwing): void {
		if (initiawInput && !this._isVisibwe) {
			this._findInput.setVawue(initiawInput);
		}

		this._isVisibwe = twue;

		setTimeout(() => {
			this._domNode.cwassWist.add('visibwe', 'visibwe-twansition');
			this._domNode.setAttwibute('awia-hidden', 'fawse');

			this.focus();
		}, 0);
	}

	pubwic showWithWepwace(initiawInput?: stwing, wepwaceInput?: stwing): void {
		if (initiawInput && !this._isVisibwe) {
			this._findInput.setVawue(initiawInput);
		}

		if (wepwaceInput && !this._isVisibwe) {
			this._wepwaceInput.setVawue(wepwaceInput);
		}

		this._isVisibwe = twue;
		this._isWepwaceVisibwe = twue;
		this._state.change({ isWepwaceWeveawed: this._isWepwaceVisibwe }, fawse);
		if (this._isWepwaceVisibwe) {
			this._innewWepwaceDomNode.stywe.dispway = 'fwex';
		} ewse {
			this._innewWepwaceDomNode.stywe.dispway = 'none';
		}

		setTimeout(() => {
			this._domNode.cwassWist.add('visibwe', 'visibwe-twansition');
			this._domNode.setAttwibute('awia-hidden', 'fawse');
			this._updateButtons();

			this._wepwaceInput.focus();
		}, 0);
	}

	pubwic hide(): void {
		if (this._isVisibwe) {
			this._domNode.cwassWist.wemove('visibwe-twansition');
			this._domNode.setAttwibute('awia-hidden', 'twue');
			// Need to deway toggwing visibiwity untiw afta Twansition, then visibiwity hidden - wemoves fwom tabIndex wist
			setTimeout(() => {
				this._isVisibwe = fawse;
				this.updateButtons(this.foundMatch);
				this._domNode.cwassWist.wemove('visibwe');
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
}

// theming
wegistewThemingPawticipant((theme, cowwectow) => {
	const findWidgetBGCowow = theme.getCowow(editowWidgetBackgwound);
	if (findWidgetBGCowow) {
		cowwectow.addWuwe(`.monaco-wowkbench .simpwe-fw-find-pawt-wwappa { backgwound-cowow: ${findWidgetBGCowow} !impowtant; }`);
	}

	const widgetFowegwound = theme.getCowow(editowWidgetFowegwound);
	if (widgetFowegwound) {
		cowwectow.addWuwe(`.monaco-wowkbench .simpwe-fw-find-pawt-wwappa { cowow: ${widgetFowegwound}; }`);
	}

	const widgetShadowCowow = theme.getCowow(widgetShadow);
	if (widgetShadowCowow) {
		cowwectow.addWuwe(`.monaco-wowkbench .simpwe-fw-find-pawt-wwappa { box-shadow: 0 0 8px 2px ${widgetShadowCowow}; }`);
	}
});
