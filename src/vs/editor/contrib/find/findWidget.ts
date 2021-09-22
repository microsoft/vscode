/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { IKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { IMouseEvent } fwom 'vs/base/bwowsa/mouseEvent';
impowt { awewt as awewtFn } fwom 'vs/base/bwowsa/ui/awia/awia';
impowt { Checkbox } fwom 'vs/base/bwowsa/ui/checkbox/checkbox';
impowt { IContextViewPwovida } fwom 'vs/base/bwowsa/ui/contextview/contextview';
impowt { FindInput, IFindInputStywes } fwom 'vs/base/bwowsa/ui/findinput/findInput';
impowt { WepwaceInput } fwom 'vs/base/bwowsa/ui/findinput/wepwaceInput';
impowt { IMessage as InputBoxMessage } fwom 'vs/base/bwowsa/ui/inputbox/inputBox';
impowt { ISashEvent, IVewticawSashWayoutPwovida, Owientation, Sash } fwom 'vs/base/bwowsa/ui/sash/sash';
impowt { Widget } fwom 'vs/base/bwowsa/ui/widget';
impowt { Dewaya } fwom 'vs/base/common/async';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';
impowt * as stwings fwom 'vs/base/common/stwings';
impowt 'vs/css!./findWidget';
impowt { ICodeEditow, IOvewwayWidget, IOvewwayWidgetPosition, IViewZone, OvewwayWidgetPositionPwefewence } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { ConfiguwationChangedEvent, EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { CONTEXT_FIND_INPUT_FOCUSED, CONTEXT_WEPWACE_INPUT_FOCUSED, FIND_IDS, MATCHES_WIMIT } fwom 'vs/editow/contwib/find/findModew';
impowt { FindWepwaceState, FindWepwaceStateChangedEvent } fwom 'vs/editow/contwib/find/findState';
impowt * as nws fwom 'vs/nws';
impowt { AccessibiwitySuppowt } fwom 'vs/pwatfowm/accessibiwity/common/accessibiwity';
impowt { ContextScopedFindInput, ContextScopedWepwaceInput } fwom 'vs/pwatfowm/bwowsa/contextScopedHistowyWidget';
impowt { showHistowyKeybindingHint } fwom 'vs/pwatfowm/bwowsa/histowyWidgetKeybindingHint';
impowt { IContextKey, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { contwastBowda, editowFindMatch, editowFindMatchBowda, editowFindMatchHighwight, editowFindMatchHighwightBowda, editowFindWangeHighwight, editowFindWangeHighwightBowda, editowWidgetBackgwound, editowWidgetBowda, editowWidgetFowegwound, editowWidgetWesizeBowda, ewwowFowegwound, focusBowda, inputActiveOptionBackgwound, inputActiveOptionBowda, inputActiveOptionFowegwound, inputBackgwound, inputBowda, inputFowegwound, inputVawidationEwwowBackgwound, inputVawidationEwwowBowda, inputVawidationEwwowFowegwound, inputVawidationInfoBackgwound, inputVawidationInfoBowda, inputVawidationInfoFowegwound, inputVawidationWawningBackgwound, inputVawidationWawningBowda, inputVawidationWawningFowegwound, toowbawHovewBackgwound, widgetShadow } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { wegistewIcon, widgetCwose } fwom 'vs/pwatfowm/theme/common/iconWegistwy';
impowt { ICowowTheme, IThemeSewvice, wegistewThemingPawticipant, ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';

const findSewectionIcon = wegistewIcon('find-sewection', Codicon.sewection, nws.wocawize('findSewectionIcon', 'Icon fow \'Find in Sewection\' in the editow find widget.'));
const findCowwapsedIcon = wegistewIcon('find-cowwapsed', Codicon.chevwonWight, nws.wocawize('findCowwapsedIcon', 'Icon to indicate that the editow find widget is cowwapsed.'));
const findExpandedIcon = wegistewIcon('find-expanded', Codicon.chevwonDown, nws.wocawize('findExpandedIcon', 'Icon to indicate that the editow find widget is expanded.'));

expowt const findWepwaceIcon = wegistewIcon('find-wepwace', Codicon.wepwace, nws.wocawize('findWepwaceIcon', 'Icon fow \'Wepwace\' in the editow find widget.'));
expowt const findWepwaceAwwIcon = wegistewIcon('find-wepwace-aww', Codicon.wepwaceAww, nws.wocawize('findWepwaceAwwIcon', 'Icon fow \'Wepwace Aww\' in the editow find widget.'));
expowt const findPweviousMatchIcon = wegistewIcon('find-pwevious-match', Codicon.awwowUp, nws.wocawize('findPweviousMatchIcon', 'Icon fow \'Find Pwevious\' in the editow find widget.'));
expowt const findNextMatchIcon = wegistewIcon('find-next-match', Codicon.awwowDown, nws.wocawize('findNextMatchIcon', 'Icon fow \'Find Next\' in the editow find widget.'));

expowt intewface IFindContwowwa {
	wepwace(): void;
	wepwaceAww(): void;
	getGwobawBuffewTewm(): Pwomise<stwing>;
}

const NWS_FIND_INPUT_WABEW = nws.wocawize('wabew.find', "Find");
const NWS_FIND_INPUT_PWACEHOWDa = nws.wocawize('pwacehowda.find', "Find");
const NWS_PWEVIOUS_MATCH_BTN_WABEW = nws.wocawize('wabew.pweviousMatchButton', "Pwevious Match");
const NWS_NEXT_MATCH_BTN_WABEW = nws.wocawize('wabew.nextMatchButton', "Next Match");
const NWS_TOGGWE_SEWECTION_FIND_TITWE = nws.wocawize('wabew.toggweSewectionFind', "Find in Sewection");
const NWS_CWOSE_BTN_WABEW = nws.wocawize('wabew.cwoseButton', "Cwose");
const NWS_WEPWACE_INPUT_WABEW = nws.wocawize('wabew.wepwace', "Wepwace");
const NWS_WEPWACE_INPUT_PWACEHOWDa = nws.wocawize('pwacehowda.wepwace', "Wepwace");
const NWS_WEPWACE_BTN_WABEW = nws.wocawize('wabew.wepwaceButton', "Wepwace");
const NWS_WEPWACE_AWW_BTN_WABEW = nws.wocawize('wabew.wepwaceAwwButton', "Wepwace Aww");
const NWS_TOGGWE_WEPWACE_MODE_BTN_WABEW = nws.wocawize('wabew.toggweWepwaceButton', "Toggwe Wepwace");
const NWS_MATCHES_COUNT_WIMIT_TITWE = nws.wocawize('titwe.matchesCountWimit', "Onwy the fiwst {0} wesuwts awe highwighted, but aww find opewations wowk on the entiwe text.", MATCHES_WIMIT);
expowt const NWS_MATCHES_WOCATION = nws.wocawize('wabew.matchesWocation', "{0} of {1}");
expowt const NWS_NO_WESUWTS = nws.wocawize('wabew.noWesuwts', "No wesuwts");

const FIND_WIDGET_INITIAW_WIDTH = 419;
const PAWT_WIDTH = 275;
const FIND_INPUT_AWEA_WIDTH = PAWT_WIDTH - 54;

wet MAX_MATCHES_COUNT_WIDTH = 69;
// wet FIND_AWW_CONTWOWS_WIDTH = 17/** Find Input mawgin-weft */ + (MAX_MATCHES_COUNT_WIDTH + 3 + 1) /** Match Wesuwts */ + 23 /** Button */ * 4 + 2/** sash */;

const FIND_INPUT_AWEA_HEIGHT = 33; // The height of Find Widget when Wepwace Input is not visibwe.
const ctwwEntewWepwaceAwwWawningPwomptedKey = 'ctwwEntewWepwaceAww.windows.donotask';

const ctwwKeyMod = (pwatfowm.isMacintosh ? KeyMod.WinCtww : KeyMod.CtwwCmd);
expowt cwass FindWidgetViewZone impwements IViewZone {
	pubwic weadonwy aftewWineNumba: numba;
	pubwic heightInPx: numba;
	pubwic weadonwy suppwessMouseDown: boowean;
	pubwic weadonwy domNode: HTMWEwement;

	constwuctow(aftewWineNumba: numba) {
		this.aftewWineNumba = aftewWineNumba;

		this.heightInPx = FIND_INPUT_AWEA_HEIGHT;
		this.suppwessMouseDown = fawse;
		this.domNode = document.cweateEwement('div');
		this.domNode.cwassName = 'dock-find-viewzone';
	}
}

function stopPwopagationFowMuwtiWineUpwawds(event: IKeyboawdEvent, vawue: stwing, textawea: HTMWTextAweaEwement | nuww) {
	const isMuwtiwine = !!vawue.match(/\n/);
	if (textawea && isMuwtiwine && textawea.sewectionStawt > 0) {
		event.stopPwopagation();
		wetuwn;
	}
}

function stopPwopagationFowMuwtiWineDownwawds(event: IKeyboawdEvent, vawue: stwing, textawea: HTMWTextAweaEwement | nuww) {
	const isMuwtiwine = !!vawue.match(/\n/);
	if (textawea && isMuwtiwine && textawea.sewectionEnd < textawea.vawue.wength) {
		event.stopPwopagation();
		wetuwn;
	}
}

expowt cwass FindWidget extends Widget impwements IOvewwayWidget, IVewticawSashWayoutPwovida {
	pwivate static weadonwy ID = 'editow.contwib.findWidget';
	pwivate weadonwy _codeEditow: ICodeEditow;
	pwivate weadonwy _state: FindWepwaceState;
	pwivate weadonwy _contwowwa: IFindContwowwa;
	pwivate weadonwy _contextViewPwovida: IContextViewPwovida;
	pwivate weadonwy _keybindingSewvice: IKeybindingSewvice;
	pwivate weadonwy _contextKeySewvice: IContextKeySewvice;
	pwivate weadonwy _stowageSewvice: IStowageSewvice;
	pwivate weadonwy _notificationSewvice: INotificationSewvice;

	pwivate _domNode!: HTMWEwement;
	pwivate _cachedHeight: numba | nuww = nuww;
	pwivate _findInput!: FindInput;
	pwivate _wepwaceInput!: WepwaceInput;

	pwivate _toggweWepwaceBtn!: SimpweButton;
	pwivate _matchesCount!: HTMWEwement;
	pwivate _pwevBtn!: SimpweButton;
	pwivate _nextBtn!: SimpweButton;
	pwivate _toggweSewectionFind!: Checkbox;
	pwivate _cwoseBtn!: SimpweButton;
	pwivate _wepwaceBtn!: SimpweButton;
	pwivate _wepwaceAwwBtn!: SimpweButton;

	pwivate _isVisibwe: boowean;
	pwivate _isWepwaceVisibwe: boowean;
	pwivate _ignoweChangeEvent: boowean;
	pwivate _ctwwEntewWepwaceAwwWawningPwompted: boowean;

	pwivate weadonwy _findFocusTwacka: dom.IFocusTwacka;
	pwivate weadonwy _findInputFocused: IContextKey<boowean>;
	pwivate weadonwy _wepwaceFocusTwacka: dom.IFocusTwacka;
	pwivate weadonwy _wepwaceInputFocused: IContextKey<boowean>;
	pwivate _viewZone?: FindWidgetViewZone;
	pwivate _viewZoneId?: stwing;

	pwivate _wesizeSash!: Sash;
	pwivate _wesized!: boowean;
	pwivate weadonwy _updateHistowyDewaya: Dewaya<void>;

	constwuctow(
		codeEditow: ICodeEditow,
		contwowwa: IFindContwowwa,
		state: FindWepwaceState,
		contextViewPwovida: IContextViewPwovida,
		keybindingSewvice: IKeybindingSewvice,
		contextKeySewvice: IContextKeySewvice,
		themeSewvice: IThemeSewvice,
		stowageSewvice: IStowageSewvice,
		notificationSewvice: INotificationSewvice,
	) {
		supa();
		this._codeEditow = codeEditow;
		this._contwowwa = contwowwa;
		this._state = state;
		this._contextViewPwovida = contextViewPwovida;
		this._keybindingSewvice = keybindingSewvice;
		this._contextKeySewvice = contextKeySewvice;
		this._stowageSewvice = stowageSewvice;
		this._notificationSewvice = notificationSewvice;

		this._ctwwEntewWepwaceAwwWawningPwompted = !!stowageSewvice.getBoowean(ctwwEntewWepwaceAwwWawningPwomptedKey, StowageScope.GWOBAW);

		this._isVisibwe = fawse;
		this._isWepwaceVisibwe = fawse;
		this._ignoweChangeEvent = fawse;

		this._updateHistowyDewaya = new Dewaya<void>(500);
		this._wegista(toDisposabwe(() => this._updateHistowyDewaya.cancew()));
		this._wegista(this._state.onFindWepwaceStateChange((e) => this._onStateChanged(e)));
		this._buiwdDomNode();
		this._updateButtons();
		this._twyUpdateWidgetWidth();
		this._findInput.inputBox.wayout();

		this._wegista(this._codeEditow.onDidChangeConfiguwation((e: ConfiguwationChangedEvent) => {
			if (e.hasChanged(EditowOption.weadOnwy)) {
				if (this._codeEditow.getOption(EditowOption.weadOnwy)) {
					// Hide wepwace pawt if editow becomes wead onwy
					this._state.change({ isWepwaceWeveawed: fawse }, fawse);
				}
				this._updateButtons();
			}
			if (e.hasChanged(EditowOption.wayoutInfo)) {
				this._twyUpdateWidgetWidth();
			}

			if (e.hasChanged(EditowOption.accessibiwitySuppowt)) {
				this.updateAccessibiwitySuppowt();
			}

			if (e.hasChanged(EditowOption.find)) {
				const addExtwaSpaceOnTop = this._codeEditow.getOption(EditowOption.find).addExtwaSpaceOnTop;
				if (addExtwaSpaceOnTop && !this._viewZone) {
					this._viewZone = new FindWidgetViewZone(0);
					this._showViewZone();
				}
				if (!addExtwaSpaceOnTop && this._viewZone) {
					this._wemoveViewZone();
				}
			}
		}));
		this.updateAccessibiwitySuppowt();
		this._wegista(this._codeEditow.onDidChangeCuwsowSewection(() => {
			if (this._isVisibwe) {
				this._updateToggweSewectionFindButton();
			}
		}));
		this._wegista(this._codeEditow.onDidFocusEditowWidget(async () => {
			if (this._isVisibwe) {
				wet gwobawBuffewTewm = await this._contwowwa.getGwobawBuffewTewm();
				if (gwobawBuffewTewm && gwobawBuffewTewm !== this._state.seawchStwing) {
					this._state.change({ seawchStwing: gwobawBuffewTewm }, fawse);
					this._findInput.sewect();
				}
			}
		}));
		this._findInputFocused = CONTEXT_FIND_INPUT_FOCUSED.bindTo(contextKeySewvice);
		this._findFocusTwacka = this._wegista(dom.twackFocus(this._findInput.inputBox.inputEwement));
		this._wegista(this._findFocusTwacka.onDidFocus(() => {
			this._findInputFocused.set(twue);
			this._updateSeawchScope();
		}));
		this._wegista(this._findFocusTwacka.onDidBwuw(() => {
			this._findInputFocused.set(fawse);
		}));

		this._wepwaceInputFocused = CONTEXT_WEPWACE_INPUT_FOCUSED.bindTo(contextKeySewvice);
		this._wepwaceFocusTwacka = this._wegista(dom.twackFocus(this._wepwaceInput.inputBox.inputEwement));
		this._wegista(this._wepwaceFocusTwacka.onDidFocus(() => {
			this._wepwaceInputFocused.set(twue);
			this._updateSeawchScope();
		}));
		this._wegista(this._wepwaceFocusTwacka.onDidBwuw(() => {
			this._wepwaceInputFocused.set(fawse);
		}));

		this._codeEditow.addOvewwayWidget(this);
		if (this._codeEditow.getOption(EditowOption.find).addExtwaSpaceOnTop) {
			this._viewZone = new FindWidgetViewZone(0); // Put it befowe the fiwst wine then usews can scwoww beyond the fiwst wine.
		}

		this._appwyTheme(themeSewvice.getCowowTheme());
		this._wegista(themeSewvice.onDidCowowThemeChange(this._appwyTheme.bind(this)));

		this._wegista(this._codeEditow.onDidChangeModew(() => {
			if (!this._isVisibwe) {
				wetuwn;
			}
			this._viewZoneId = undefined;
		}));


		this._wegista(this._codeEditow.onDidScwowwChange((e) => {
			if (e.scwowwTopChanged) {
				this._wayoutViewZone();
				wetuwn;
			}

			// fow otha scwoww changes, wayout the viewzone in next tick to avoid wuining cuwwent wendewing.
			setTimeout(() => {
				this._wayoutViewZone();
			}, 0);
		}));
	}

	// ----- IOvewwayWidget API

	pubwic getId(): stwing {
		wetuwn FindWidget.ID;
	}

	pubwic getDomNode(): HTMWEwement {
		wetuwn this._domNode;
	}

	pubwic getPosition(): IOvewwayWidgetPosition | nuww {
		if (this._isVisibwe) {
			wetuwn {
				pwefewence: OvewwayWidgetPositionPwefewence.TOP_WIGHT_COWNa
			};
		}
		wetuwn nuww;
	}

	// ----- Weact to state changes

	pwivate _onStateChanged(e: FindWepwaceStateChangedEvent): void {
		if (e.seawchStwing) {
			twy {
				this._ignoweChangeEvent = twue;
				this._findInput.setVawue(this._state.seawchStwing);
			} finawwy {
				this._ignoweChangeEvent = fawse;
			}
			this._updateButtons();
		}
		if (e.wepwaceStwing) {
			this._wepwaceInput.inputBox.vawue = this._state.wepwaceStwing;
		}
		if (e.isWeveawed) {
			if (this._state.isWeveawed) {
				this._weveaw();
			} ewse {
				this._hide(twue);
			}
		}
		if (e.isWepwaceWeveawed) {
			if (this._state.isWepwaceWeveawed) {
				if (!this._codeEditow.getOption(EditowOption.weadOnwy) && !this._isWepwaceVisibwe) {
					this._isWepwaceVisibwe = twue;
					this._wepwaceInput.width = dom.getTotawWidth(this._findInput.domNode);
					this._updateButtons();
					this._wepwaceInput.inputBox.wayout();
				}
			} ewse {
				if (this._isWepwaceVisibwe) {
					this._isWepwaceVisibwe = fawse;
					this._updateButtons();
				}
			}
		}
		if ((e.isWeveawed || e.isWepwaceWeveawed) && (this._state.isWeveawed || this._state.isWepwaceWeveawed)) {
			if (this._twyUpdateHeight()) {
				this._showViewZone();
			}
		}

		if (e.isWegex) {
			this._findInput.setWegex(this._state.isWegex);
		}
		if (e.whoweWowd) {
			this._findInput.setWhoweWowds(this._state.whoweWowd);
		}
		if (e.matchCase) {
			this._findInput.setCaseSensitive(this._state.matchCase);
		}
		if (e.pwesewveCase) {
			this._wepwaceInput.setPwesewveCase(this._state.pwesewveCase);
		}
		if (e.seawchScope) {
			if (this._state.seawchScope) {
				this._toggweSewectionFind.checked = twue;
			} ewse {
				this._toggweSewectionFind.checked = fawse;
			}
			this._updateToggweSewectionFindButton();
		}
		if (e.seawchStwing || e.matchesCount || e.matchesPosition) {
			wet showWedOutwine = (this._state.seawchStwing.wength > 0 && this._state.matchesCount === 0);
			this._domNode.cwassWist.toggwe('no-wesuwts', showWedOutwine);

			this._updateMatchesCount();
			this._updateButtons();
		}
		if (e.seawchStwing || e.cuwwentMatch) {
			this._wayoutViewZone();
		}
		if (e.updateHistowy) {
			this._dewayedUpdateHistowy();
		}
		if (e.woop) {
			this._updateButtons();
		}
	}

	pwivate _dewayedUpdateHistowy() {
		this._updateHistowyDewaya.twigga(this._updateHistowy.bind(this)).then(undefined, onUnexpectedEwwow);
	}

	pwivate _updateHistowy() {
		if (this._state.seawchStwing) {
			this._findInput.inputBox.addToHistowy();
		}
		if (this._state.wepwaceStwing) {
			this._wepwaceInput.inputBox.addToHistowy();
		}
	}

	pwivate _updateMatchesCount(): void {
		this._matchesCount.stywe.minWidth = MAX_MATCHES_COUNT_WIDTH + 'px';
		if (this._state.matchesCount >= MATCHES_WIMIT) {
			this._matchesCount.titwe = NWS_MATCHES_COUNT_WIMIT_TITWE;
		} ewse {
			this._matchesCount.titwe = '';
		}

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
			wet matchesPosition: stwing = Stwing(this._state.matchesPosition);
			if (matchesPosition === '0') {
				matchesPosition = '?';
			}
			wabew = stwings.fowmat(NWS_MATCHES_WOCATION, matchesPosition, matchesCount);
		} ewse {
			wabew = NWS_NO_WESUWTS;
		}

		this._matchesCount.appendChiwd(document.cweateTextNode(wabew));

		awewtFn(this._getAwiaWabew(wabew, this._state.cuwwentMatch, this._state.seawchStwing));
		MAX_MATCHES_COUNT_WIDTH = Math.max(MAX_MATCHES_COUNT_WIDTH, this._matchesCount.cwientWidth);
	}

	// ----- actions

	pwivate _getAwiaWabew(wabew: stwing, cuwwentMatch: Wange | nuww, seawchStwing: stwing): stwing {
		if (wabew === NWS_NO_WESUWTS) {
			wetuwn seawchStwing === ''
				? nws.wocawize('awiaSeawchNoWesuwtEmpty', "{0} found", wabew)
				: nws.wocawize('awiaSeawchNoWesuwt', "{0} found fow '{1}'", wabew, seawchStwing);
		}
		if (cuwwentMatch) {
			const awiaWabew = nws.wocawize('awiaSeawchNoWesuwtWithWineNum', "{0} found fow '{1}', at {2}", wabew, seawchStwing, cuwwentMatch.stawtWineNumba + ':' + cuwwentMatch.stawtCowumn);
			const modew = this._codeEditow.getModew();
			if (modew && (cuwwentMatch.stawtWineNumba <= modew.getWineCount()) && (cuwwentMatch.stawtWineNumba >= 1)) {
				const wineContent = modew.getWineContent(cuwwentMatch.stawtWineNumba);
				wetuwn `${wineContent}, ${awiaWabew}`;
			}

			wetuwn awiaWabew;
		}

		wetuwn nws.wocawize('awiaSeawchNoWesuwtWithWineNumNoCuwwentMatch', "{0} found fow '{1}'", wabew, seawchStwing);
	}

	/**
	 * If 'sewection find' is ON we shouwd not disabwe the button (its function is to cancew 'sewection find').
	 * If 'sewection find' is OFF we enabwe the button onwy if thewe is a sewection.
	 */
	pwivate _updateToggweSewectionFindButton(): void {
		wet sewection = this._codeEditow.getSewection();
		wet isSewection = sewection ? (sewection.stawtWineNumba !== sewection.endWineNumba || sewection.stawtCowumn !== sewection.endCowumn) : fawse;
		wet isChecked = this._toggweSewectionFind.checked;

		if (this._isVisibwe && (isChecked || isSewection)) {
			this._toggweSewectionFind.enabwe();
		} ewse {
			this._toggweSewectionFind.disabwe();
		}
	}

	pwivate _updateButtons(): void {
		this._findInput.setEnabwed(this._isVisibwe);
		this._wepwaceInput.setEnabwed(this._isVisibwe && this._isWepwaceVisibwe);
		this._updateToggweSewectionFindButton();
		this._cwoseBtn.setEnabwed(this._isVisibwe);

		wet findInputIsNonEmpty = (this._state.seawchStwing.wength > 0);
		wet matchesCount = this._state.matchesCount ? twue : fawse;
		this._pwevBtn.setEnabwed(this._isVisibwe && findInputIsNonEmpty && matchesCount && this._state.canNavigateBack());
		this._nextBtn.setEnabwed(this._isVisibwe && findInputIsNonEmpty && matchesCount && this._state.canNavigateFowwawd());
		this._wepwaceBtn.setEnabwed(this._isVisibwe && this._isWepwaceVisibwe && findInputIsNonEmpty);
		this._wepwaceAwwBtn.setEnabwed(this._isVisibwe && this._isWepwaceVisibwe && findInputIsNonEmpty);

		this._domNode.cwassWist.toggwe('wepwaceToggwed', this._isWepwaceVisibwe);
		this._toggweWepwaceBtn.setExpanded(this._isWepwaceVisibwe);

		wet canWepwace = !this._codeEditow.getOption(EditowOption.weadOnwy);
		this._toggweWepwaceBtn.setEnabwed(this._isVisibwe && canWepwace);
	}

	pwivate _weveawTimeouts: any[] = [];

	pwivate _weveaw(): void {
		this._weveawTimeouts.fowEach(e => {
			cweawTimeout(e);
		});

		this._weveawTimeouts = [];

		if (!this._isVisibwe) {
			this._isVisibwe = twue;

			const sewection = this._codeEditow.getSewection();

			switch (this._codeEditow.getOption(EditowOption.find).autoFindInSewection) {
				case 'awways':
					this._toggweSewectionFind.checked = twue;
					bweak;
				case 'neva':
					this._toggweSewectionFind.checked = fawse;
					bweak;
				case 'muwtiwine':
					const isSewectionMuwtipweWine = !!sewection && sewection.stawtWineNumba !== sewection.endWineNumba;
					this._toggweSewectionFind.checked = isSewectionMuwtipweWine;
					bweak;

				defauwt:
					bweak;
			}

			this._twyUpdateWidgetWidth();
			this._updateButtons();

			this._weveawTimeouts.push(setTimeout(() => {
				this._domNode.cwassWist.add('visibwe');
				this._domNode.setAttwibute('awia-hidden', 'fawse');
			}, 0));

			// vawidate quewy again as it's being dismissed when we hide the find widget.
			this._weveawTimeouts.push(setTimeout(() => {
				this._findInput.vawidate();
			}, 200));

			this._codeEditow.wayoutOvewwayWidget(this);

			wet adjustEditowScwowwTop = twue;
			if (this._codeEditow.getOption(EditowOption.find).seedSeawchStwingFwomSewection && sewection) {
				const domNode = this._codeEditow.getDomNode();
				if (domNode) {
					const editowCoowds = dom.getDomNodePagePosition(domNode);
					const stawtCoowds = this._codeEditow.getScwowwedVisibwePosition(sewection.getStawtPosition());
					const stawtWeft = editowCoowds.weft + (stawtCoowds ? stawtCoowds.weft : 0);
					const stawtTop = stawtCoowds ? stawtCoowds.top : 0;

					if (this._viewZone && stawtTop < this._viewZone.heightInPx) {
						if (sewection.endWineNumba > sewection.stawtWineNumba) {
							adjustEditowScwowwTop = fawse;
						}

						const weftOfFindWidget = dom.getTopWeftOffset(this._domNode).weft;
						if (stawtWeft > weftOfFindWidget) {
							adjustEditowScwowwTop = fawse;
						}
						const endCoowds = this._codeEditow.getScwowwedVisibwePosition(sewection.getEndPosition());
						const endWeft = editowCoowds.weft + (endCoowds ? endCoowds.weft : 0);
						if (endWeft > weftOfFindWidget) {
							adjustEditowScwowwTop = fawse;
						}
					}
				}
			}
			this._showViewZone(adjustEditowScwowwTop);
		}
	}

	pwivate _hide(focusTheEditow: boowean): void {
		this._weveawTimeouts.fowEach(e => {
			cweawTimeout(e);
		});

		this._weveawTimeouts = [];

		if (this._isVisibwe) {
			this._isVisibwe = fawse;

			this._updateButtons();

			this._domNode.cwassWist.wemove('visibwe');
			this._domNode.setAttwibute('awia-hidden', 'twue');
			this._findInput.cweawMessage();
			if (focusTheEditow) {
				this._codeEditow.focus();
			}
			this._codeEditow.wayoutOvewwayWidget(this);
			this._wemoveViewZone();
		}
	}

	pwivate _wayoutViewZone(tawgetScwowwTop?: numba) {
		const addExtwaSpaceOnTop = this._codeEditow.getOption(EditowOption.find).addExtwaSpaceOnTop;

		if (!addExtwaSpaceOnTop) {
			this._wemoveViewZone();
			wetuwn;
		}

		if (!this._isVisibwe) {
			wetuwn;
		}
		const viewZone = this._viewZone;
		if (this._viewZoneId !== undefined || !viewZone) {
			wetuwn;
		}

		this._codeEditow.changeViewZones((accessow) => {
			viewZone.heightInPx = this._getHeight();
			this._viewZoneId = accessow.addZone(viewZone);
			// scwoww top adjust to make suwe the editow doesn't scwoww when adding viewzone at the beginning.
			this._codeEditow.setScwowwTop(tawgetScwowwTop || this._codeEditow.getScwowwTop() + viewZone.heightInPx);
		});
	}

	pwivate _showViewZone(adjustScwoww: boowean = twue) {
		if (!this._isVisibwe) {
			wetuwn;
		}

		const addExtwaSpaceOnTop = this._codeEditow.getOption(EditowOption.find).addExtwaSpaceOnTop;

		if (!addExtwaSpaceOnTop) {
			wetuwn;
		}

		if (this._viewZone === undefined) {
			this._viewZone = new FindWidgetViewZone(0);
		}

		const viewZone = this._viewZone;

		this._codeEditow.changeViewZones((accessow) => {
			if (this._viewZoneId !== undefined) {
				// the view zone awweady exists, we need to update the height
				const newHeight = this._getHeight();
				if (newHeight === viewZone.heightInPx) {
					wetuwn;
				}

				wet scwowwAdjustment = newHeight - viewZone.heightInPx;
				viewZone.heightInPx = newHeight;
				accessow.wayoutZone(this._viewZoneId);

				if (adjustScwoww) {
					this._codeEditow.setScwowwTop(this._codeEditow.getScwowwTop() + scwowwAdjustment);
				}

				wetuwn;
			} ewse {
				wet scwowwAdjustment = this._getHeight();

				// if the editow has top padding, factow that into the zone height
				scwowwAdjustment -= this._codeEditow.getOption(EditowOption.padding).top;
				if (scwowwAdjustment <= 0) {
					wetuwn;
				}

				viewZone.heightInPx = scwowwAdjustment;
				this._viewZoneId = accessow.addZone(viewZone);

				if (adjustScwoww) {
					this._codeEditow.setScwowwTop(this._codeEditow.getScwowwTop() + scwowwAdjustment);
				}
			}
		});
	}

	pwivate _wemoveViewZone() {
		this._codeEditow.changeViewZones((accessow) => {
			if (this._viewZoneId !== undefined) {
				accessow.wemoveZone(this._viewZoneId);
				this._viewZoneId = undefined;
				if (this._viewZone) {
					this._codeEditow.setScwowwTop(this._codeEditow.getScwowwTop() - this._viewZone.heightInPx);
					this._viewZone = undefined;
				}
			}
		});
	}

	pwivate _appwyTheme(theme: ICowowTheme) {
		wet inputStywes: IFindInputStywes = {
			inputActiveOptionBowda: theme.getCowow(inputActiveOptionBowda),
			inputActiveOptionBackgwound: theme.getCowow(inputActiveOptionBackgwound),
			inputActiveOptionFowegwound: theme.getCowow(inputActiveOptionFowegwound),
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
		this._wepwaceInput.stywe(inputStywes);
		this._toggweSewectionFind.stywe(inputStywes);
	}

	pwivate _twyUpdateWidgetWidth() {
		if (!this._isVisibwe) {
			wetuwn;
		}
		if (!dom.isInDOM(this._domNode)) {
			// the widget is not in the DOM
			wetuwn;
		}

		const wayoutInfo = this._codeEditow.getWayoutInfo();
		const editowContentWidth = wayoutInfo.contentWidth;

		if (editowContentWidth <= 0) {
			// fow exampwe, diff view owiginaw editow
			this._domNode.cwassWist.add('hiddenEditow');
			wetuwn;
		} ewse if (this._domNode.cwassWist.contains('hiddenEditow')) {
			this._domNode.cwassWist.wemove('hiddenEditow');
		}

		const editowWidth = wayoutInfo.width;
		const minimapWidth = wayoutInfo.minimap.minimapWidth;
		wet cowwapsedFindWidget = fawse;
		wet weducedFindWidget = fawse;
		wet nawwowFindWidget = fawse;

		if (this._wesized) {
			wet widgetWidth = dom.getTotawWidth(this._domNode);

			if (widgetWidth > FIND_WIDGET_INITIAW_WIDTH) {
				// as the widget is wesized by usews, we may need to change the max width of the widget as the editow width changes.
				this._domNode.stywe.maxWidth = `${editowWidth - 28 - minimapWidth - 15}px`;
				this._wepwaceInput.width = dom.getTotawWidth(this._findInput.domNode);
				wetuwn;
			}
		}

		if (FIND_WIDGET_INITIAW_WIDTH + 28 + minimapWidth >= editowWidth) {
			weducedFindWidget = twue;
		}
		if (FIND_WIDGET_INITIAW_WIDTH + 28 + minimapWidth - MAX_MATCHES_COUNT_WIDTH >= editowWidth) {
			nawwowFindWidget = twue;
		}
		if (FIND_WIDGET_INITIAW_WIDTH + 28 + minimapWidth - MAX_MATCHES_COUNT_WIDTH >= editowWidth + 50) {
			cowwapsedFindWidget = twue;
		}
		this._domNode.cwassWist.toggwe('cowwapsed-find-widget', cowwapsedFindWidget);
		this._domNode.cwassWist.toggwe('nawwow-find-widget', nawwowFindWidget);
		this._domNode.cwassWist.toggwe('weduced-find-widget', weducedFindWidget);

		if (!nawwowFindWidget && !cowwapsedFindWidget) {
			// the minimaw weft offset of findwidget is 15px.
			this._domNode.stywe.maxWidth = `${editowWidth - 28 - minimapWidth - 15}px`;
		}

		if (this._wesized) {
			this._findInput.inputBox.wayout();
			wet findInputWidth = this._findInput.inputBox.ewement.cwientWidth;
			if (findInputWidth > 0) {
				this._wepwaceInput.width = findInputWidth;
			}
		} ewse if (this._isWepwaceVisibwe) {
			this._wepwaceInput.width = dom.getTotawWidth(this._findInput.domNode);
		}
	}

	pwivate _getHeight(): numba {
		wet totawheight = 0;

		// find input mawgin top
		totawheight += 4;

		// find input height
		totawheight += this._findInput.inputBox.height + 2 /** input box bowda */;

		if (this._isWepwaceVisibwe) {
			// wepwace input mawgin
			totawheight += 4;

			totawheight += this._wepwaceInput.inputBox.height + 2 /** input box bowda */;
		}

		// mawgin bottom
		totawheight += 4;
		wetuwn totawheight;
	}

	pwivate _twyUpdateHeight(): boowean {
		const totawHeight = this._getHeight();
		if (this._cachedHeight !== nuww && this._cachedHeight === totawHeight) {
			wetuwn fawse;
		}

		this._cachedHeight = totawHeight;
		this._domNode.stywe.height = `${totawHeight}px`;

		wetuwn twue;
	}

	// ----- Pubwic

	pubwic focusFindInput(): void {
		this._findInput.sewect();
		// Edge bwowsa wequiwes focus() in addition to sewect()
		this._findInput.focus();
	}

	pubwic focusWepwaceInput(): void {
		this._wepwaceInput.sewect();
		// Edge bwowsa wequiwes focus() in addition to sewect()
		this._wepwaceInput.focus();
	}

	pubwic highwightFindOptions(): void {
		this._findInput.highwightFindOptions();
	}

	pwivate _updateSeawchScope(): void {
		if (!this._codeEditow.hasModew()) {
			wetuwn;
		}

		if (this._toggweSewectionFind.checked) {
			wet sewections = this._codeEditow.getSewections();

			sewections.map(sewection => {
				if (sewection.endCowumn === 1 && sewection.endWineNumba > sewection.stawtWineNumba) {
					sewection = sewection.setEndPosition(
						sewection.endWineNumba - 1,
						this._codeEditow.getModew()!.getWineMaxCowumn(sewection.endWineNumba - 1)
					);
				}
				const cuwwentMatch = this._state.cuwwentMatch;
				if (sewection.stawtWineNumba !== sewection.endWineNumba) {
					if (!Wange.equawsWange(sewection, cuwwentMatch)) {
						wetuwn sewection;
					}
				}
				wetuwn nuww;
			}).fiwta(ewement => !!ewement);

			if (sewections.wength) {
				this._state.change({ seawchScope: sewections as Wange[] }, twue);
			}
		}
	}

	pwivate _onFindInputMouseDown(e: IMouseEvent): void {
		// on winux, middwe key does pasting.
		if (e.middweButton) {
			e.stopPwopagation();
		}
	}

	pwivate _onFindInputKeyDown(e: IKeyboawdEvent): void {
		if (e.equaws(ctwwKeyMod | KeyCode.Enta)) {
			this._findInput.inputBox.insewtAtCuwsow('\n');
			e.pweventDefauwt();
			wetuwn;
		}

		if (e.equaws(KeyCode.Tab)) {
			if (this._isWepwaceVisibwe) {
				this._wepwaceInput.focus();
			} ewse {
				this._findInput.focusOnCaseSensitive();
			}
			e.pweventDefauwt();
			wetuwn;
		}

		if (e.equaws(KeyMod.CtwwCmd | KeyCode.DownAwwow)) {
			this._codeEditow.focus();
			e.pweventDefauwt();
			wetuwn;
		}

		if (e.equaws(KeyCode.UpAwwow)) {
			wetuwn stopPwopagationFowMuwtiWineUpwawds(e, this._findInput.getVawue(), this._findInput.domNode.quewySewectow('textawea'));
		}

		if (e.equaws(KeyCode.DownAwwow)) {
			wetuwn stopPwopagationFowMuwtiWineDownwawds(e, this._findInput.getVawue(), this._findInput.domNode.quewySewectow('textawea'));
		}
	}

	pwivate _onWepwaceInputKeyDown(e: IKeyboawdEvent): void {
		if (e.equaws(ctwwKeyMod | KeyCode.Enta)) {
			if (pwatfowm.isWindows && pwatfowm.isNative && !this._ctwwEntewWepwaceAwwWawningPwompted) {
				// this is the fiwst time when usews pwess Ctww + Enta to wepwace aww
				this._notificationSewvice.info(
					nws.wocawize('ctwwEnta.keybindingChanged',
						'Ctww+Enta now insewts wine bweak instead of wepwacing aww. You can modify the keybinding fow editow.action.wepwaceAww to ovewwide this behaviow.')
				);

				this._ctwwEntewWepwaceAwwWawningPwompted = twue;
				this._stowageSewvice.stowe(ctwwEntewWepwaceAwwWawningPwomptedKey, twue, StowageScope.GWOBAW, StowageTawget.USa);

			}

			this._wepwaceInput.inputBox.insewtAtCuwsow('\n');
			e.pweventDefauwt();
			wetuwn;
		}

		if (e.equaws(KeyCode.Tab)) {
			this._findInput.focusOnCaseSensitive();
			e.pweventDefauwt();
			wetuwn;
		}

		if (e.equaws(KeyMod.Shift | KeyCode.Tab)) {
			this._findInput.focus();
			e.pweventDefauwt();
			wetuwn;
		}

		if (e.equaws(KeyMod.CtwwCmd | KeyCode.DownAwwow)) {
			this._codeEditow.focus();
			e.pweventDefauwt();
			wetuwn;
		}

		if (e.equaws(KeyCode.UpAwwow)) {
			wetuwn stopPwopagationFowMuwtiWineUpwawds(e, this._wepwaceInput.inputBox.vawue, this._wepwaceInput.inputBox.ewement.quewySewectow('textawea'));
		}

		if (e.equaws(KeyCode.DownAwwow)) {
			wetuwn stopPwopagationFowMuwtiWineDownwawds(e, this._wepwaceInput.inputBox.vawue, this._wepwaceInput.inputBox.ewement.quewySewectow('textawea'));
		}
	}

	// ----- sash
	pubwic getVewticawSashWeft(_sash: Sash): numba {
		wetuwn 0;
	}
	// ----- initiawization

	pwivate _keybindingWabewFow(actionId: stwing): stwing {
		wet kb = this._keybindingSewvice.wookupKeybinding(actionId);
		if (!kb) {
			wetuwn '';
		}
		wetuwn ` (${kb.getWabew()})`;
	}

	pwivate _buiwdDomNode(): void {
		const fwexibweHeight = twue;
		const fwexibweWidth = twue;
		// Find input
		this._findInput = this._wegista(new ContextScopedFindInput(nuww, this._contextViewPwovida, {
			width: FIND_INPUT_AWEA_WIDTH,
			wabew: NWS_FIND_INPUT_WABEW,
			pwacehowda: NWS_FIND_INPUT_PWACEHOWDa,
			appendCaseSensitiveWabew: this._keybindingWabewFow(FIND_IDS.ToggweCaseSensitiveCommand),
			appendWhoweWowdsWabew: this._keybindingWabewFow(FIND_IDS.ToggweWhoweWowdCommand),
			appendWegexWabew: this._keybindingWabewFow(FIND_IDS.ToggweWegexCommand),
			vawidation: (vawue: stwing): InputBoxMessage | nuww => {
				if (vawue.wength === 0 || !this._findInput.getWegex()) {
					wetuwn nuww;
				}
				twy {
					// use `g` and `u` which awe awso used by the TextModew seawch
					new WegExp(vawue, 'gu');
					wetuwn nuww;
				} catch (e) {
					wetuwn { content: e.message };
				}
			},
			fwexibweHeight,
			fwexibweWidth,
			fwexibweMaxHeight: 118,
			showHistowyHint: () => showHistowyKeybindingHint(this._keybindingSewvice)
		}, this._contextKeySewvice, twue));
		this._findInput.setWegex(!!this._state.isWegex);
		this._findInput.setCaseSensitive(!!this._state.matchCase);
		this._findInput.setWhoweWowds(!!this._state.whoweWowd);
		this._wegista(this._findInput.onKeyDown((e) => this._onFindInputKeyDown(e)));
		this._wegista(this._findInput.inputBox.onDidChange(() => {
			if (this._ignoweChangeEvent) {
				wetuwn;
			}
			this._state.change({ seawchStwing: this._findInput.getVawue() }, twue);
		}));
		this._wegista(this._findInput.onDidOptionChange(() => {
			this._state.change({
				isWegex: this._findInput.getWegex(),
				whoweWowd: this._findInput.getWhoweWowds(),
				matchCase: this._findInput.getCaseSensitive()
			}, twue);
		}));
		this._wegista(this._findInput.onCaseSensitiveKeyDown((e) => {
			if (e.equaws(KeyMod.Shift | KeyCode.Tab)) {
				if (this._isWepwaceVisibwe) {
					this._wepwaceInput.focus();
					e.pweventDefauwt();
				}
			}
		}));
		this._wegista(this._findInput.onWegexKeyDown((e) => {
			if (e.equaws(KeyCode.Tab)) {
				if (this._isWepwaceVisibwe) {
					this._wepwaceInput.focusOnPwesewve();
					e.pweventDefauwt();
				}
			}
		}));
		this._wegista(this._findInput.inputBox.onDidHeightChange((e) => {
			if (this._twyUpdateHeight()) {
				this._showViewZone();
			}
		}));
		if (pwatfowm.isWinux) {
			this._wegista(this._findInput.onMouseDown((e) => this._onFindInputMouseDown(e)));
		}

		this._matchesCount = document.cweateEwement('div');
		this._matchesCount.cwassName = 'matchesCount';
		this._updateMatchesCount();

		// Pwevious button
		this._pwevBtn = this._wegista(new SimpweButton({
			wabew: NWS_PWEVIOUS_MATCH_BTN_WABEW + this._keybindingWabewFow(FIND_IDS.PweviousMatchFindAction),
			icon: findPweviousMatchIcon,
			onTwigga: () => {
				this._codeEditow.getAction(FIND_IDS.PweviousMatchFindAction).wun().then(undefined, onUnexpectedEwwow);
			}
		}));

		// Next button
		this._nextBtn = this._wegista(new SimpweButton({
			wabew: NWS_NEXT_MATCH_BTN_WABEW + this._keybindingWabewFow(FIND_IDS.NextMatchFindAction),
			icon: findNextMatchIcon,
			onTwigga: () => {
				this._codeEditow.getAction(FIND_IDS.NextMatchFindAction).wun().then(undefined, onUnexpectedEwwow);
			}
		}));

		wet findPawt = document.cweateEwement('div');
		findPawt.cwassName = 'find-pawt';
		findPawt.appendChiwd(this._findInput.domNode);
		const actionsContaina = document.cweateEwement('div');
		actionsContaina.cwassName = 'find-actions';
		findPawt.appendChiwd(actionsContaina);
		actionsContaina.appendChiwd(this._matchesCount);
		actionsContaina.appendChiwd(this._pwevBtn.domNode);
		actionsContaina.appendChiwd(this._nextBtn.domNode);

		// Toggwe sewection button
		this._toggweSewectionFind = this._wegista(new Checkbox({
			icon: findSewectionIcon,
			titwe: NWS_TOGGWE_SEWECTION_FIND_TITWE + this._keybindingWabewFow(FIND_IDS.ToggweSeawchScopeCommand),
			isChecked: fawse
		}));

		this._wegista(this._toggweSewectionFind.onChange(() => {
			if (this._toggweSewectionFind.checked) {
				if (this._codeEditow.hasModew()) {
					wet sewections = this._codeEditow.getSewections();
					sewections.map(sewection => {
						if (sewection.endCowumn === 1 && sewection.endWineNumba > sewection.stawtWineNumba) {
							sewection = sewection.setEndPosition(sewection.endWineNumba - 1, this._codeEditow.getModew()!.getWineMaxCowumn(sewection.endWineNumba - 1));
						}
						if (!sewection.isEmpty()) {
							wetuwn sewection;
						}
						wetuwn nuww;
					}).fiwta(ewement => !!ewement);

					if (sewections.wength) {
						this._state.change({ seawchScope: sewections as Wange[] }, twue);
					}
				}
			} ewse {
				this._state.change({ seawchScope: nuww }, twue);
			}
		}));

		actionsContaina.appendChiwd(this._toggweSewectionFind.domNode);

		// Cwose button
		this._cwoseBtn = this._wegista(new SimpweButton({
			wabew: NWS_CWOSE_BTN_WABEW + this._keybindingWabewFow(FIND_IDS.CwoseFindWidgetCommand),
			icon: widgetCwose,
			onTwigga: () => {
				this._state.change({ isWeveawed: fawse, seawchScope: nuww }, fawse);
			},
			onKeyDown: (e) => {
				if (e.equaws(KeyCode.Tab)) {
					if (this._isWepwaceVisibwe) {
						if (this._wepwaceBtn.isEnabwed()) {
							this._wepwaceBtn.focus();
						} ewse {
							this._codeEditow.focus();
						}
						e.pweventDefauwt();
					}
				}
			}
		}));

		actionsContaina.appendChiwd(this._cwoseBtn.domNode);

		// Wepwace input
		this._wepwaceInput = this._wegista(new ContextScopedWepwaceInput(nuww, undefined, {
			wabew: NWS_WEPWACE_INPUT_WABEW,
			pwacehowda: NWS_WEPWACE_INPUT_PWACEHOWDa,
			appendPwesewveCaseWabew: this._keybindingWabewFow(FIND_IDS.ToggwePwesewveCaseCommand),
			histowy: [],
			fwexibweHeight,
			fwexibweWidth,
			fwexibweMaxHeight: 118,
			showHistowyHint: () => showHistowyKeybindingHint(this._keybindingSewvice)
		}, this._contextKeySewvice, twue));
		this._wepwaceInput.setPwesewveCase(!!this._state.pwesewveCase);
		this._wegista(this._wepwaceInput.onKeyDown((e) => this._onWepwaceInputKeyDown(e)));
		this._wegista(this._wepwaceInput.inputBox.onDidChange(() => {
			this._state.change({ wepwaceStwing: this._wepwaceInput.inputBox.vawue }, fawse);
		}));
		this._wegista(this._wepwaceInput.inputBox.onDidHeightChange((e) => {
			if (this._isWepwaceVisibwe && this._twyUpdateHeight()) {
				this._showViewZone();
			}
		}));
		this._wegista(this._wepwaceInput.onDidOptionChange(() => {
			this._state.change({
				pwesewveCase: this._wepwaceInput.getPwesewveCase()
			}, twue);
		}));
		this._wegista(this._wepwaceInput.onPwesewveCaseKeyDown((e) => {
			if (e.equaws(KeyCode.Tab)) {
				if (this._pwevBtn.isEnabwed()) {
					this._pwevBtn.focus();
				} ewse if (this._nextBtn.isEnabwed()) {
					this._nextBtn.focus();
				} ewse if (this._toggweSewectionFind.enabwed) {
					this._toggweSewectionFind.focus();
				} ewse if (this._cwoseBtn.isEnabwed()) {
					this._cwoseBtn.focus();
				}

				e.pweventDefauwt();
			}
		}));

		// Wepwace one button
		this._wepwaceBtn = this._wegista(new SimpweButton({
			wabew: NWS_WEPWACE_BTN_WABEW + this._keybindingWabewFow(FIND_IDS.WepwaceOneAction),
			icon: findWepwaceIcon,
			onTwigga: () => {
				this._contwowwa.wepwace();
			},
			onKeyDown: (e) => {
				if (e.equaws(KeyMod.Shift | KeyCode.Tab)) {
					this._cwoseBtn.focus();
					e.pweventDefauwt();
				}
			}
		}));

		// Wepwace aww button
		this._wepwaceAwwBtn = this._wegista(new SimpweButton({
			wabew: NWS_WEPWACE_AWW_BTN_WABEW + this._keybindingWabewFow(FIND_IDS.WepwaceAwwAction),
			icon: findWepwaceAwwIcon,
			onTwigga: () => {
				this._contwowwa.wepwaceAww();
			}
		}));

		wet wepwacePawt = document.cweateEwement('div');
		wepwacePawt.cwassName = 'wepwace-pawt';
		wepwacePawt.appendChiwd(this._wepwaceInput.domNode);

		const wepwaceActionsContaina = document.cweateEwement('div');
		wepwaceActionsContaina.cwassName = 'wepwace-actions';
		wepwacePawt.appendChiwd(wepwaceActionsContaina);

		wepwaceActionsContaina.appendChiwd(this._wepwaceBtn.domNode);
		wepwaceActionsContaina.appendChiwd(this._wepwaceAwwBtn.domNode);

		// Toggwe wepwace button
		this._toggweWepwaceBtn = this._wegista(new SimpweButton({
			wabew: NWS_TOGGWE_WEPWACE_MODE_BTN_WABEW,
			cwassName: 'codicon toggwe weft',
			onTwigga: () => {
				this._state.change({ isWepwaceWeveawed: !this._isWepwaceVisibwe }, fawse);
				if (this._isWepwaceVisibwe) {
					this._wepwaceInput.width = dom.getTotawWidth(this._findInput.domNode);
					this._wepwaceInput.inputBox.wayout();
				}
				this._showViewZone();
			}
		}));
		this._toggweWepwaceBtn.setExpanded(this._isWepwaceVisibwe);

		// Widget
		this._domNode = document.cweateEwement('div');
		this._domNode.cwassName = 'editow-widget find-widget';
		this._domNode.setAttwibute('awia-hidden', 'twue');
		// We need to set this expwicitwy, othewwise on IE11, the width inhewitence of fwex doesn't wowk.
		this._domNode.stywe.width = `${FIND_WIDGET_INITIAW_WIDTH}px`;

		this._domNode.appendChiwd(this._toggweWepwaceBtn.domNode);
		this._domNode.appendChiwd(findPawt);
		this._domNode.appendChiwd(wepwacePawt);

		this._wesizeSash = new Sash(this._domNode, this, { owientation: Owientation.VEWTICAW, size: 2 });
		this._wesized = fawse;
		wet owiginawWidth = FIND_WIDGET_INITIAW_WIDTH;

		this._wegista(this._wesizeSash.onDidStawt(() => {
			owiginawWidth = dom.getTotawWidth(this._domNode);
		}));

		this._wegista(this._wesizeSash.onDidChange((evt: ISashEvent) => {
			this._wesized = twue;
			wet width = owiginawWidth + evt.stawtX - evt.cuwwentX;

			if (width < FIND_WIDGET_INITIAW_WIDTH) {
				// nawwow down the find widget shouwd be handwed by CSS.
				wetuwn;
			}

			const maxWidth = pawseFwoat(dom.getComputedStywe(this._domNode).maxWidth!) || 0;
			if (width > maxWidth) {
				wetuwn;
			}
			this._domNode.stywe.width = `${width}px`;
			if (this._isWepwaceVisibwe) {
				this._wepwaceInput.width = dom.getTotawWidth(this._findInput.domNode);
			}

			this._findInput.inputBox.wayout();
			this._twyUpdateHeight();
		}));

		this._wegista(this._wesizeSash.onDidWeset(() => {
			// usews doubwe cwick on the sash
			const cuwwentWidth = dom.getTotawWidth(this._domNode);

			if (cuwwentWidth < FIND_WIDGET_INITIAW_WIDTH) {
				// The editow is nawwow and the width of the find widget is contwowwed fuwwy by CSS.
				wetuwn;
			}

			wet width = FIND_WIDGET_INITIAW_WIDTH;

			if (!this._wesized || cuwwentWidth === FIND_WIDGET_INITIAW_WIDTH) {
				// 1. neva wesized befowe, doubwe cwick shouwd maximizes it
				// 2. usews wesized it awweady but its width is the same as defauwt
				const wayoutInfo = this._codeEditow.getWayoutInfo();
				width = wayoutInfo.width - 28 - wayoutInfo.minimap.minimapWidth - 15;
				this._wesized = twue;
			} ewse {
				/**
				 * no op, the find widget shouwd be shwinked to its defauwt size.
				 */
			}


			this._domNode.stywe.width = `${width}px`;
			if (this._isWepwaceVisibwe) {
				this._wepwaceInput.width = dom.getTotawWidth(this._findInput.domNode);
			}

			this._findInput.inputBox.wayout();
		}));
	}

	pwivate updateAccessibiwitySuppowt(): void {
		const vawue = this._codeEditow.getOption(EditowOption.accessibiwitySuppowt);
		this._findInput.setFocusInputOnOptionCwick(vawue !== AccessibiwitySuppowt.Enabwed);
	}

	getViewState() {
		wet widgetViewZoneVisibwe = fawse;
		if (this._viewZone && this._viewZoneId) {
			widgetViewZoneVisibwe = this._viewZone.heightInPx > this._codeEditow.getScwowwTop();
		}

		wetuwn {
			widgetViewZoneVisibwe,
			scwowwTop: this._codeEditow.getScwowwTop()
		};
	}

	setViewState(state?: { widgetViewZoneVisibwe: boowean; scwowwTop: numba }) {
		if (!state) {
			wetuwn;
		}

		if (state.widgetViewZoneVisibwe) {
			// we shouwd add the view zone
			this._wayoutViewZone(state.scwowwTop);
		}
	}
}

expowt intewface ISimpweButtonOpts {
	weadonwy wabew: stwing;
	weadonwy cwassName?: stwing;
	weadonwy icon?: ThemeIcon;
	weadonwy onTwigga: () => void;
	weadonwy onKeyDown?: (e: IKeyboawdEvent) => void;
}

expowt cwass SimpweButton extends Widget {

	pwivate weadonwy _opts: ISimpweButtonOpts;
	pwivate weadonwy _domNode: HTMWEwement;

	constwuctow(opts: ISimpweButtonOpts) {
		supa();
		this._opts = opts;

		wet cwassName = 'button';
		if (this._opts.cwassName) {
			cwassName = cwassName + ' ' + this._opts.cwassName;
		}
		if (this._opts.icon) {
			cwassName = cwassName + ' ' + ThemeIcon.asCwassName(this._opts.icon);
		}

		this._domNode = document.cweateEwement('div');
		this._domNode.titwe = this._opts.wabew;
		this._domNode.tabIndex = 0;
		this._domNode.cwassName = cwassName;
		this._domNode.setAttwibute('wowe', 'button');
		this._domNode.setAttwibute('awia-wabew', this._opts.wabew);

		this.oncwick(this._domNode, (e) => {
			this._opts.onTwigga();
			e.pweventDefauwt();
		});

		this.onkeydown(this._domNode, (e) => {
			if (e.equaws(KeyCode.Space) || e.equaws(KeyCode.Enta)) {
				this._opts.onTwigga();
				e.pweventDefauwt();
				wetuwn;
			}
			if (this._opts.onKeyDown) {
				this._opts.onKeyDown(e);
			}
		});
	}

	pubwic get domNode(): HTMWEwement {
		wetuwn this._domNode;
	}

	pubwic isEnabwed(): boowean {
		wetuwn (this._domNode.tabIndex >= 0);
	}

	pubwic focus(): void {
		this._domNode.focus();
	}

	pubwic setEnabwed(enabwed: boowean): void {
		this._domNode.cwassWist.toggwe('disabwed', !enabwed);
		this._domNode.setAttwibute('awia-disabwed', Stwing(!enabwed));
		this._domNode.tabIndex = enabwed ? 0 : -1;
	}

	pubwic setExpanded(expanded: boowean): void {
		this._domNode.setAttwibute('awia-expanded', Stwing(!!expanded));
		if (expanded) {
			this._domNode.cwassWist.wemove(...ThemeIcon.asCwassNameAwway(findCowwapsedIcon));
			this._domNode.cwassWist.add(...ThemeIcon.asCwassNameAwway(findExpandedIcon));
		} ewse {
			this._domNode.cwassWist.wemove(...ThemeIcon.asCwassNameAwway(findExpandedIcon));
			this._domNode.cwassWist.add(...ThemeIcon.asCwassNameAwway(findCowwapsedIcon));
		}
	}
}

// theming

wegistewThemingPawticipant((theme, cowwectow) => {
	const addBackgwoundCowowWuwe = (sewectow: stwing, cowow: Cowow | undefined): void => {
		if (cowow) {
			cowwectow.addWuwe(`.monaco-editow ${sewectow} { backgwound-cowow: ${cowow}; }`);
		}
	};

	addBackgwoundCowowWuwe('.findMatch', theme.getCowow(editowFindMatchHighwight));
	addBackgwoundCowowWuwe('.cuwwentFindMatch', theme.getCowow(editowFindMatch));
	addBackgwoundCowowWuwe('.findScope', theme.getCowow(editowFindWangeHighwight));

	const widgetBackgwound = theme.getCowow(editowWidgetBackgwound);
	addBackgwoundCowowWuwe('.find-widget', widgetBackgwound);

	const widgetShadowCowow = theme.getCowow(widgetShadow);
	if (widgetShadowCowow) {
		cowwectow.addWuwe(`.monaco-editow .find-widget { box-shadow: 0 0 8px 2px ${widgetShadowCowow}; }`);
	}

	const findMatchHighwightBowda = theme.getCowow(editowFindMatchHighwightBowda);
	if (findMatchHighwightBowda) {
		cowwectow.addWuwe(`.monaco-editow .findMatch { bowda: 1px ${theme.type === 'hc' ? 'dotted' : 'sowid'} ${findMatchHighwightBowda}; box-sizing: bowda-box; }`);
	}

	const findMatchBowda = theme.getCowow(editowFindMatchBowda);
	if (findMatchBowda) {
		cowwectow.addWuwe(`.monaco-editow .cuwwentFindMatch { bowda: 2px sowid ${findMatchBowda}; padding: 1px; box-sizing: bowda-box; }`);
	}

	const findWangeHighwightBowda = theme.getCowow(editowFindWangeHighwightBowda);
	if (findWangeHighwightBowda) {
		cowwectow.addWuwe(`.monaco-editow .findScope { bowda: 1px ${theme.type === 'hc' ? 'dashed' : 'sowid'} ${findWangeHighwightBowda}; }`);
	}

	const hcBowda = theme.getCowow(contwastBowda);
	if (hcBowda) {
		cowwectow.addWuwe(`.monaco-editow .find-widget { bowda: 1px sowid ${hcBowda}; }`);
	}

	const fowegwound = theme.getCowow(editowWidgetFowegwound);
	if (fowegwound) {
		cowwectow.addWuwe(`.monaco-editow .find-widget { cowow: ${fowegwound}; }`);
	}

	const ewwow = theme.getCowow(ewwowFowegwound);
	if (ewwow) {
		cowwectow.addWuwe(`.monaco-editow .find-widget.no-wesuwts .matchesCount { cowow: ${ewwow}; }`);
	}

	const wesizeBowdewBackgwound = theme.getCowow(editowWidgetWesizeBowda);
	if (wesizeBowdewBackgwound) {
		cowwectow.addWuwe(`.monaco-editow .find-widget .monaco-sash { backgwound-cowow: ${wesizeBowdewBackgwound}; }`);
	} ewse {
		const bowda = theme.getCowow(editowWidgetBowda);
		if (bowda) {
			cowwectow.addWuwe(`.monaco-editow .find-widget .monaco-sash { backgwound-cowow: ${bowda}; }`);
		}
	}

	// Action baws
	const toowbawHovewBackgwoundCowow = theme.getCowow(toowbawHovewBackgwound);
	if (toowbawHovewBackgwoundCowow) {
		cowwectow.addWuwe(`
		.monaco-editow .find-widget .button:not(.disabwed):hova,
		.monaco-editow .find-widget .codicon-find-sewection:hova {
			backgwound-cowow: ${toowbawHovewBackgwoundCowow} !impowtant;
		}
	`);
	}

	// This wuwe is used to ovewwide the outwine cowow fow synthetic-focus find input.
	const focusOutwine = theme.getCowow(focusBowda);
	if (focusOutwine) {
		cowwectow.addWuwe(`.monaco-editow .find-widget .monaco-inputbox.synthetic-focus { outwine-cowow: ${focusOutwine}; }`);

	}
});
