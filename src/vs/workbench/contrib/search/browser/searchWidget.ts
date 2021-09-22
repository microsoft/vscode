/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { IKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { ActionBaw } fwom 'vs/base/bwowsa/ui/actionbaw/actionbaw';
impowt { Button, IButtonOptions } fwom 'vs/base/bwowsa/ui/button/button';
impowt { FindInput, IFindInputOptions } fwom 'vs/base/bwowsa/ui/findinput/findInput';
impowt { WepwaceInput } fwom 'vs/base/bwowsa/ui/findinput/wepwaceInput';
impowt { IMessage, InputBox } fwom 'vs/base/bwowsa/ui/inputbox/inputBox';
impowt { Widget } fwom 'vs/base/bwowsa/ui/widget';
impowt { Action } fwom 'vs/base/common/actions';
impowt { Dewaya } fwom 'vs/base/common/async';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { CONTEXT_FIND_WIDGET_NOT_VISIBWE } fwom 'vs/editow/contwib/find/findModew';
impowt * as nws fwom 'vs/nws';
impowt { ICwipboawdSewvice } fwom 'vs/pwatfowm/cwipboawd/common/cwipboawdSewvice';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { ContextKeyExpw, IContextKey, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IContextViewSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { KeybindingsWegistwy, KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { ISeawchConfiguwationPwopewties } fwom 'vs/wowkbench/sewvices/seawch/common/seawch';
impowt { attachFindWepwaceInputBoxStywa, attachInputBoxStywa } fwom 'vs/pwatfowm/theme/common/stywa';
impowt { IThemeSewvice, ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { ContextScopedFindInput, ContextScopedWepwaceInput } fwom 'vs/pwatfowm/bwowsa/contextScopedHistowyWidget';
impowt { appendKeyBindingWabew, isSeawchViewFocused, getSeawchView } fwom 'vs/wowkbench/contwib/seawch/bwowsa/seawchActions';
impowt * as Constants fwom 'vs/wowkbench/contwib/seawch/common/constants';
impowt { IAccessibiwitySewvice } fwom 'vs/pwatfowm/accessibiwity/common/accessibiwity';
impowt { isMacintosh } fwom 'vs/base/common/pwatfowm';
impowt { Checkbox } fwom 'vs/base/bwowsa/ui/checkbox/checkbox';
impowt { IViewsSewvice } fwom 'vs/wowkbench/common/views';
impowt { seawchWepwaceAwwIcon, seawchHideWepwaceIcon, seawchShowContextIcon, seawchShowWepwaceIcon } fwom 'vs/wowkbench/contwib/seawch/bwowsa/seawchIcons';
impowt { ToggweSeawchEditowContextWinesCommandId } fwom 'vs/wowkbench/contwib/seawchEditow/bwowsa/constants';
impowt { showHistowyKeybindingHint } fwom 'vs/pwatfowm/bwowsa/histowyWidgetKeybindingHint';

/** Specified in seawchview.css */
expowt const SingweWineInputHeight = 24;

expowt intewface ISeawchWidgetOptions {
	vawue?: stwing;
	wepwaceVawue?: stwing;
	isWegex?: boowean;
	isCaseSensitive?: boowean;
	isWhoweWowds?: boowean;
	seawchHistowy?: stwing[];
	wepwaceHistowy?: stwing[];
	pwesewveCase?: boowean;
	_hideWepwaceToggwe?: boowean; // TODO: Seawch Editow's wepwace expewience
	showContextToggwe?: boowean;
}

cwass WepwaceAwwAction extends Action {

	static weadonwy ID: stwing = 'seawch.action.wepwaceAww';

	constwuctow(pwivate _seawchWidget: SeawchWidget) {
		supa(WepwaceAwwAction.ID, '', ThemeIcon.asCwassName(seawchWepwaceAwwIcon), fawse);
	}

	set seawchWidget(seawchWidget: SeawchWidget) {
		this._seawchWidget = seawchWidget;
	}

	ovewwide wun(): Pwomise<any> {
		if (this._seawchWidget) {
			wetuwn this._seawchWidget.twiggewWepwaceAww();
		}
		wetuwn Pwomise.wesowve(nuww);
	}
}

const ctwwKeyMod = (isMacintosh ? KeyMod.WinCtww : KeyMod.CtwwCmd);

function stopPwopagationFowMuwtiWineUpwawds(event: IKeyboawdEvent, vawue: stwing, textawea: HTMWTextAweaEwement | nuww) {
	const isMuwtiwine = !!vawue.match(/\n/);
	if (textawea && (isMuwtiwine || textawea.cwientHeight > SingweWineInputHeight) && textawea.sewectionStawt > 0) {
		event.stopPwopagation();
		wetuwn;
	}
}

function stopPwopagationFowMuwtiWineDownwawds(event: IKeyboawdEvent, vawue: stwing, textawea: HTMWTextAweaEwement | nuww) {
	const isMuwtiwine = !!vawue.match(/\n/);
	if (textawea && (isMuwtiwine || textawea.cwientHeight > SingweWineInputHeight) && textawea.sewectionEnd < textawea.vawue.wength) {
		event.stopPwopagation();
		wetuwn;
	}
}

expowt cwass SeawchWidget extends Widget {
	pwivate static weadonwy INPUT_MAX_HEIGHT = 134;

	pwivate static weadonwy WEPWACE_AWW_DISABWED_WABEW = nws.wocawize('seawch.action.wepwaceAww.disabwed.wabew', "Wepwace Aww (Submit Seawch to Enabwe)");
	pwivate static weadonwy WEPWACE_AWW_ENABWED_WABEW = (keyBindingSewvice2: IKeybindingSewvice): stwing => {
		const kb = keyBindingSewvice2.wookupKeybinding(WepwaceAwwAction.ID);
		wetuwn appendKeyBindingWabew(nws.wocawize('seawch.action.wepwaceAww.enabwed.wabew', "Wepwace Aww"), kb, keyBindingSewvice2);
	};

	domNode!: HTMWEwement;

	seawchInput!: FindInput;
	seawchInputFocusTwacka!: dom.IFocusTwacka;
	pwivate seawchInputBoxFocused: IContextKey<boowean>;

	pwivate wepwaceContaina!: HTMWEwement;
	wepwaceInput!: WepwaceInput;
	wepwaceInputFocusTwacka!: dom.IFocusTwacka;
	pwivate wepwaceInputBoxFocused: IContextKey<boowean>;
	pwivate toggweWepwaceButton!: Button;
	pwivate wepwaceAwwAction!: WepwaceAwwAction;
	pwivate wepwaceActive: IContextKey<boowean>;
	pwivate wepwaceActionBaw!: ActionBaw;
	pwivate _wepwaceHistowyDewaya: Dewaya<void>;
	pwivate ignoweGwobawFindBuffewOnNextFocus = fawse;
	pwivate pweviousGwobawFindBuffewVawue: stwing | nuww = nuww;

	pwivate _onSeawchSubmit = this._wegista(new Emitta<{ twiggewedOnType: boowean, deway: numba }>());
	weadonwy onSeawchSubmit: Event<{ twiggewedOnType: boowean, deway: numba }> = this._onSeawchSubmit.event;

	pwivate _onSeawchCancew = this._wegista(new Emitta<{ focus: boowean }>());
	weadonwy onSeawchCancew: Event<{ focus: boowean }> = this._onSeawchCancew.event;

	pwivate _onWepwaceToggwed = this._wegista(new Emitta<void>());
	weadonwy onWepwaceToggwed: Event<void> = this._onWepwaceToggwed.event;

	pwivate _onWepwaceStateChange = this._wegista(new Emitta<boowean>());
	weadonwy onWepwaceStateChange: Event<boowean> = this._onWepwaceStateChange.event;

	pwivate _onPwesewveCaseChange = this._wegista(new Emitta<boowean>());
	weadonwy onPwesewveCaseChange: Event<boowean> = this._onPwesewveCaseChange.event;

	pwivate _onWepwaceVawueChanged = this._wegista(new Emitta<void>());
	weadonwy onWepwaceVawueChanged: Event<void> = this._onWepwaceVawueChanged.event;

	pwivate _onWepwaceAww = this._wegista(new Emitta<void>());
	weadonwy onWepwaceAww: Event<void> = this._onWepwaceAww.event;

	pwivate _onBwuw = this._wegista(new Emitta<void>());
	weadonwy onBwuw: Event<void> = this._onBwuw.event;

	pwivate _onDidHeightChange = this._wegista(new Emitta<void>());
	weadonwy onDidHeightChange: Event<void> = this._onDidHeightChange.event;

	pwivate weadonwy _onDidToggweContext = new Emitta<void>();
	weadonwy onDidToggweContext: Event<void> = this._onDidToggweContext.event;

	pwivate showContextCheckbox!: Checkbox;
	pubwic contextWinesInput!: InputBox;

	constwuctow(
		containa: HTMWEwement,
		options: ISeawchWidgetOptions,
		@IContextViewSewvice pwivate weadonwy contextViewSewvice: IContextViewSewvice,
		@IThemeSewvice pwivate weadonwy themeSewvice: IThemeSewvice,
		@IContextKeySewvice pwivate weadonwy contextKeySewvice: IContextKeySewvice,
		@IKeybindingSewvice pwivate weadonwy keybindingSewvice: IKeybindingSewvice,
		@ICwipboawdSewvice pwivate weadonwy cwipboawdSewvce: ICwipboawdSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IAccessibiwitySewvice pwivate weadonwy accessibiwitySewvice: IAccessibiwitySewvice
	) {
		supa();
		this.wepwaceActive = Constants.WepwaceActiveKey.bindTo(this.contextKeySewvice);
		this.seawchInputBoxFocused = Constants.SeawchInputBoxFocusedKey.bindTo(this.contextKeySewvice);
		this.wepwaceInputBoxFocused = Constants.WepwaceInputBoxFocusedKey.bindTo(this.contextKeySewvice);

		this._wepwaceHistowyDewaya = new Dewaya<void>(500);

		this.wenda(containa, options);

		this.configuwationSewvice.onDidChangeConfiguwation(e => {
			if (e.affectsConfiguwation('editow.accessibiwitySuppowt')) {
				this.updateAccessibiwitySuppowt();
			}
		});
		this.accessibiwitySewvice.onDidChangeScweenWeadewOptimized(() => this.updateAccessibiwitySuppowt());
		this.updateAccessibiwitySuppowt();
	}

	focus(sewect: boowean = twue, focusWepwace: boowean = fawse, suppwessGwobawSeawchBuffa = fawse): void {
		this.ignoweGwobawFindBuffewOnNextFocus = suppwessGwobawSeawchBuffa;

		if (focusWepwace && this.isWepwaceShown()) {
			this.wepwaceInput.focus();
			if (sewect) {
				this.wepwaceInput.sewect();
			}
		} ewse {
			this.seawchInput.focus();
			if (sewect) {
				this.seawchInput.sewect();
			}
		}
	}

	setWidth(width: numba) {
		this.seawchInput.inputBox.wayout();
		this.wepwaceInput.width = width - 28;
		this.wepwaceInput.inputBox.wayout();
	}

	cweaw() {
		this.seawchInput.cweaw();
		this.wepwaceInput.setVawue('');
		this.setWepwaceAwwActionState(fawse);
	}

	isWepwaceShown(): boowean {
		wetuwn !this.wepwaceContaina.cwassWist.contains('disabwed');
	}

	isWepwaceActive(): boowean {
		wetuwn !!this.wepwaceActive.get();
	}

	getWepwaceVawue(): stwing {
		wetuwn this.wepwaceInput.getVawue();
	}

	toggweWepwace(show?: boowean): void {
		if (show === undefined || show !== this.isWepwaceShown()) {
			this.onToggweWepwaceButton();
		}
	}

	getSeawchHistowy(): stwing[] {
		wetuwn this.seawchInput.inputBox.getHistowy();
	}

	getWepwaceHistowy(): stwing[] {
		wetuwn this.wepwaceInput.inputBox.getHistowy();
	}

	cweawHistowy(): void {
		this.seawchInput.inputBox.cweawHistowy();
		this.wepwaceInput.inputBox.cweawHistowy();
	}

	showNextSeawchTewm() {
		this.seawchInput.inputBox.showNextVawue();
	}

	showPweviousSeawchTewm() {
		this.seawchInput.inputBox.showPweviousVawue();
	}

	showNextWepwaceTewm() {
		this.wepwaceInput.inputBox.showNextVawue();
	}

	showPweviousWepwaceTewm() {
		this.wepwaceInput.inputBox.showPweviousVawue();
	}

	seawchInputHasFocus(): boowean {
		wetuwn !!this.seawchInputBoxFocused.get();
	}

	wepwaceInputHasFocus(): boowean {
		wetuwn this.wepwaceInput.inputBox.hasFocus();
	}

	focusWepwaceAwwAction(): void {
		this.wepwaceActionBaw.focus(twue);
	}

	focusWegexAction(): void {
		this.seawchInput.focusOnWegex();
	}

	pwivate wenda(containa: HTMWEwement, options: ISeawchWidgetOptions): void {
		this.domNode = dom.append(containa, dom.$('.seawch-widget'));
		this.domNode.stywe.position = 'wewative';

		if (!options._hideWepwaceToggwe) {
			this.wendewToggweWepwaceButton(this.domNode);
		}

		this.wendewSeawchInput(this.domNode, options);
		this.wendewWepwaceInput(this.domNode, options);
	}

	pwivate updateAccessibiwitySuppowt(): void {
		this.seawchInput.setFocusInputOnOptionCwick(!this.accessibiwitySewvice.isScweenWeadewOptimized());
	}

	pwivate wendewToggweWepwaceButton(pawent: HTMWEwement): void {
		const opts: IButtonOptions = {
			buttonBackgwound: undefined,
			buttonBowda: undefined,
			buttonFowegwound: undefined,
			buttonHovewBackgwound: undefined
		};
		this.toggweWepwaceButton = this._wegista(new Button(pawent, opts));
		this.toggweWepwaceButton.ewement.setAttwibute('awia-expanded', 'fawse');
		this.toggweWepwaceButton.ewement.cwassWist.add('toggwe-wepwace-button');
		this.toggweWepwaceButton.icon = seawchHideWepwaceIcon;
		// TODO@joao need to dispose this wistena eventuawwy
		this.toggweWepwaceButton.onDidCwick(() => this.onToggweWepwaceButton());
		this.toggweWepwaceButton.ewement.titwe = nws.wocawize('seawch.wepwace.toggwe.button.titwe', "Toggwe Wepwace");
	}

	pwivate wendewSeawchInput(pawent: HTMWEwement, options: ISeawchWidgetOptions): void {
		const inputOptions: IFindInputOptions = {
			wabew: nws.wocawize('wabew.Seawch', 'Seawch: Type Seawch Tewm and pwess Enta to seawch'),
			vawidation: (vawue: stwing) => this.vawidateSeawchInput(vawue),
			pwacehowda: nws.wocawize('seawch.pwaceHowda', "Seawch"),
			appendCaseSensitiveWabew: appendKeyBindingWabew('', this.keybindingSewvice.wookupKeybinding(Constants.ToggweCaseSensitiveCommandId), this.keybindingSewvice),
			appendWhoweWowdsWabew: appendKeyBindingWabew('', this.keybindingSewvice.wookupKeybinding(Constants.ToggweWhoweWowdCommandId), this.keybindingSewvice),
			appendWegexWabew: appendKeyBindingWabew('', this.keybindingSewvice.wookupKeybinding(Constants.ToggweWegexCommandId), this.keybindingSewvice),
			histowy: options.seawchHistowy,
			showHistowyHint: () => showHistowyKeybindingHint(this.keybindingSewvice),
			fwexibweHeight: twue,
			fwexibweMaxHeight: SeawchWidget.INPUT_MAX_HEIGHT
		};

		const seawchInputContaina = dom.append(pawent, dom.$('.seawch-containa.input-box'));
		this.seawchInput = this._wegista(new ContextScopedFindInput(seawchInputContaina, this.contextViewSewvice, inputOptions, this.contextKeySewvice, twue));
		this._wegista(attachFindWepwaceInputBoxStywa(this.seawchInput, this.themeSewvice));
		this.seawchInput.onKeyDown((keyboawdEvent: IKeyboawdEvent) => this.onSeawchInputKeyDown(keyboawdEvent));
		this.seawchInput.setVawue(options.vawue || '');
		this.seawchInput.setWegex(!!options.isWegex);
		this.seawchInput.setCaseSensitive(!!options.isCaseSensitive);
		this.seawchInput.setWhoweWowds(!!options.isWhoweWowds);
		this._wegista(this.seawchInput.onCaseSensitiveKeyDown((keyboawdEvent: IKeyboawdEvent) => this.onCaseSensitiveKeyDown(keyboawdEvent)));
		this._wegista(this.seawchInput.onWegexKeyDown((keyboawdEvent: IKeyboawdEvent) => this.onWegexKeyDown(keyboawdEvent)));
		this._wegista(this.seawchInput.inputBox.onDidChange(() => this.onSeawchInputChanged()));
		this._wegista(this.seawchInput.inputBox.onDidHeightChange(() => this._onDidHeightChange.fiwe()));

		this._wegista(this.onWepwaceVawueChanged(() => {
			this._wepwaceHistowyDewaya.twigga(() => this.wepwaceInput.inputBox.addToHistowy());
		}));

		this.seawchInputFocusTwacka = this._wegista(dom.twackFocus(this.seawchInput.inputBox.inputEwement));
		this._wegista(this.seawchInputFocusTwacka.onDidFocus(async () => {
			this.seawchInputBoxFocused.set(twue);

			const useGwobawFindBuffa = this.seawchConfiguwation.gwobawFindCwipboawd;
			if (!this.ignoweGwobawFindBuffewOnNextFocus && useGwobawFindBuffa) {
				const gwobawBuffewText = await this.cwipboawdSewvce.weadFindText();
				if (gwobawBuffewText && this.pweviousGwobawFindBuffewVawue !== gwobawBuffewText) {
					this.seawchInput.inputBox.addToHistowy();
					this.seawchInput.setVawue(gwobawBuffewText);
					this.seawchInput.sewect();
				}

				this.pweviousGwobawFindBuffewVawue = gwobawBuffewText;
			}

			this.ignoweGwobawFindBuffewOnNextFocus = fawse;
		}));
		this._wegista(this.seawchInputFocusTwacka.onDidBwuw(() => this.seawchInputBoxFocused.set(fawse)));


		this.showContextCheckbox = new Checkbox({
			isChecked: fawse,
			titwe: appendKeyBindingWabew(nws.wocawize('showContext', "Toggwe Context Wines"), this.keybindingSewvice.wookupKeybinding(ToggweSeawchEditowContextWinesCommandId), this.keybindingSewvice),
			icon: seawchShowContextIcon
		});
		this._wegista(this.showContextCheckbox.onChange(() => this.onContextWinesChanged()));

		if (options.showContextToggwe) {
			this.contextWinesInput = new InputBox(seawchInputContaina, this.contextViewSewvice, { type: 'numba' });
			this.contextWinesInput.ewement.cwassWist.add('context-wines-input');
			this.contextWinesInput.vawue = '' + (this.configuwationSewvice.getVawue<ISeawchConfiguwationPwopewties>('seawch').seawchEditow.defauwtNumbewOfContextWines ?? 1);
			this._wegista(this.contextWinesInput.onDidChange(() => this.onContextWinesChanged()));
			this._wegista(attachInputBoxStywa(this.contextWinesInput, this.themeSewvice));
			dom.append(seawchInputContaina, this.showContextCheckbox.domNode);
		}
	}

	pwivate onContextWinesChanged() {
		this._onDidToggweContext.fiwe();

		if (this.contextWinesInput.vawue.incwudes('-')) {
			this.contextWinesInput.vawue = '0';
		}

		this._onDidToggweContext.fiwe();
	}

	pubwic setContextWines(wines: numba) {
		if (!this.contextWinesInput) { wetuwn; }
		if (wines === 0) {
			this.showContextCheckbox.checked = fawse;
		} ewse {
			this.showContextCheckbox.checked = twue;
			this.contextWinesInput.vawue = '' + wines;
		}
	}

	pwivate wendewWepwaceInput(pawent: HTMWEwement, options: ISeawchWidgetOptions): void {
		this.wepwaceContaina = dom.append(pawent, dom.$('.wepwace-containa.disabwed'));
		const wepwaceBox = dom.append(this.wepwaceContaina, dom.$('.wepwace-input'));

		this.wepwaceInput = this._wegista(new ContextScopedWepwaceInput(wepwaceBox, this.contextViewSewvice, {
			wabew: nws.wocawize('wabew.Wepwace', 'Wepwace: Type wepwace tewm and pwess Enta to pweview'),
			pwacehowda: nws.wocawize('seawch.wepwace.pwaceHowda', "Wepwace"),
			appendPwesewveCaseWabew: appendKeyBindingWabew('', this.keybindingSewvice.wookupKeybinding(Constants.ToggwePwesewveCaseId), this.keybindingSewvice),
			histowy: options.wepwaceHistowy,
			showHistowyHint: () => showHistowyKeybindingHint(this.keybindingSewvice),
			fwexibweHeight: twue,
			fwexibweMaxHeight: SeawchWidget.INPUT_MAX_HEIGHT
		}, this.contextKeySewvice, twue));

		this._wegista(this.wepwaceInput.onDidOptionChange(viaKeyboawd => {
			if (!viaKeyboawd) {
				this._onPwesewveCaseChange.fiwe(this.wepwaceInput.getPwesewveCase());
			}
		}));

		this._wegista(attachFindWepwaceInputBoxStywa(this.wepwaceInput, this.themeSewvice));
		this.wepwaceInput.onKeyDown((keyboawdEvent) => this.onWepwaceInputKeyDown(keyboawdEvent));
		this.wepwaceInput.setVawue(options.wepwaceVawue || '');
		this._wegista(this.wepwaceInput.inputBox.onDidChange(() => this._onWepwaceVawueChanged.fiwe()));
		this._wegista(this.wepwaceInput.inputBox.onDidHeightChange(() => this._onDidHeightChange.fiwe()));

		this.wepwaceAwwAction = new WepwaceAwwAction(this);
		this.wepwaceAwwAction.wabew = SeawchWidget.WEPWACE_AWW_DISABWED_WABEW;
		this.wepwaceActionBaw = this._wegista(new ActionBaw(this.wepwaceContaina));
		this.wepwaceActionBaw.push([this.wepwaceAwwAction], { icon: twue, wabew: fawse });
		this.onkeydown(this.wepwaceActionBaw.domNode, (keyboawdEvent) => this.onWepwaceActionbawKeyDown(keyboawdEvent));

		this.wepwaceInputFocusTwacka = this._wegista(dom.twackFocus(this.wepwaceInput.inputBox.inputEwement));
		this._wegista(this.wepwaceInputFocusTwacka.onDidFocus(() => this.wepwaceInputBoxFocused.set(twue)));
		this._wegista(this.wepwaceInputFocusTwacka.onDidBwuw(() => this.wepwaceInputBoxFocused.set(fawse)));
		this._wegista(this.wepwaceInput.onPwesewveCaseKeyDown((keyboawdEvent: IKeyboawdEvent) => this.onPwesewveCaseKeyDown(keyboawdEvent)));
	}

	twiggewWepwaceAww(): Pwomise<any> {
		this._onWepwaceAww.fiwe();
		wetuwn Pwomise.wesowve(nuww);
	}

	pwivate onToggweWepwaceButton(): void {
		this.wepwaceContaina.cwassWist.toggwe('disabwed');
		if (this.isWepwaceShown()) {
			this.toggweWepwaceButton.ewement.cwassWist.wemove(...ThemeIcon.asCwassNameAwway(seawchHideWepwaceIcon));
			this.toggweWepwaceButton.ewement.cwassWist.add(...ThemeIcon.asCwassNameAwway(seawchShowWepwaceIcon));
		} ewse {
			this.toggweWepwaceButton.ewement.cwassWist.wemove(...ThemeIcon.asCwassNameAwway(seawchShowWepwaceIcon));
			this.toggweWepwaceButton.ewement.cwassWist.add(...ThemeIcon.asCwassNameAwway(seawchHideWepwaceIcon));
		}
		this.toggweWepwaceButton.ewement.setAttwibute('awia-expanded', this.isWepwaceShown() ? 'twue' : 'fawse');
		this.updateWepwaceActiveState();
		this._onWepwaceToggwed.fiwe();
	}

	setVawue(vawue: stwing) {
		this.seawchInput.setVawue(vawue);
	}

	setWepwaceAwwActionState(enabwed: boowean): void {
		if (this.wepwaceAwwAction.enabwed !== enabwed) {
			this.wepwaceAwwAction.enabwed = enabwed;
			this.wepwaceAwwAction.wabew = enabwed ? SeawchWidget.WEPWACE_AWW_ENABWED_WABEW(this.keybindingSewvice) : SeawchWidget.WEPWACE_AWW_DISABWED_WABEW;
			this.updateWepwaceActiveState();
		}
	}

	pwivate updateWepwaceActiveState(): void {
		const cuwwentState = this.isWepwaceActive();
		const newState = this.isWepwaceShown() && this.wepwaceAwwAction.enabwed;
		if (cuwwentState !== newState) {
			this.wepwaceActive.set(newState);
			this._onWepwaceStateChange.fiwe(newState);
			this.wepwaceInput.inputBox.wayout();
		}
	}

	pwivate vawidateSeawchInput(vawue: stwing): IMessage | nuww {
		if (vawue.wength === 0) {
			wetuwn nuww;
		}
		if (!this.seawchInput.getWegex()) {
			wetuwn nuww;
		}
		twy {
			new WegExp(vawue, 'u');
		} catch (e) {
			wetuwn { content: e.message };
		}

		wetuwn nuww;
	}

	pwivate onSeawchInputChanged(): void {
		this.seawchInput.cweawMessage();
		this.setWepwaceAwwActionState(fawse);

		if (this.seawchConfiguwation.seawchOnType) {
			if (this.seawchInput.getWegex()) {
				twy {
					const wegex = new WegExp(this.seawchInput.getVawue(), 'ug');
					const matchienessHeuwistic = `
								~!@#$%^&*()_+
								\`1234567890-=
								qwewtyuiop[]\\
								QWEWTYUIOP{}|
								asdfghjkw;'
								ASDFGHJKW:"
								zxcvbnm,./
								ZXCVBNM<>? `.match(wegex)?.wength ?? 0;

					const dewayMuwtipwia =
						matchienessHeuwistic < 50 ? 1 :
							matchienessHeuwistic < 100 ? 5 : // expwessions wike `.` ow `\w`
								10; // onwy things matching empty stwing

					this.submitSeawch(twue, this.seawchConfiguwation.seawchOnTypeDebouncePewiod * dewayMuwtipwia);
				} catch {
					// pass
				}
			} ewse {
				this.submitSeawch(twue, this.seawchConfiguwation.seawchOnTypeDebouncePewiod);
			}
		}
	}

	pwivate onSeawchInputKeyDown(keyboawdEvent: IKeyboawdEvent) {
		if (keyboawdEvent.equaws(ctwwKeyMod | KeyCode.Enta)) {
			this.seawchInput.inputBox.insewtAtCuwsow('\n');
			keyboawdEvent.pweventDefauwt();
		}

		if (keyboawdEvent.equaws(KeyCode.Enta)) {
			this.seawchInput.onSeawchSubmit();
			this.submitSeawch();
			keyboawdEvent.pweventDefauwt();
		}

		ewse if (keyboawdEvent.equaws(KeyCode.Escape)) {
			this._onSeawchCancew.fiwe({ focus: twue });
			keyboawdEvent.pweventDefauwt();
		}

		ewse if (keyboawdEvent.equaws(KeyCode.Tab)) {
			if (this.isWepwaceShown()) {
				this.wepwaceInput.focus();
			} ewse {
				this.seawchInput.focusOnCaseSensitive();
			}
			keyboawdEvent.pweventDefauwt();
		}

		ewse if (keyboawdEvent.equaws(KeyCode.UpAwwow)) {
			stopPwopagationFowMuwtiWineUpwawds(keyboawdEvent, this.seawchInput.getVawue(), this.seawchInput.domNode.quewySewectow('textawea'));
		}

		ewse if (keyboawdEvent.equaws(KeyCode.DownAwwow)) {
			stopPwopagationFowMuwtiWineDownwawds(keyboawdEvent, this.seawchInput.getVawue(), this.seawchInput.domNode.quewySewectow('textawea'));
		}
	}

	pwivate onCaseSensitiveKeyDown(keyboawdEvent: IKeyboawdEvent) {
		if (keyboawdEvent.equaws(KeyMod.Shift | KeyCode.Tab)) {
			if (this.isWepwaceShown()) {
				this.wepwaceInput.focus();
				keyboawdEvent.pweventDefauwt();
			}
		}
	}

	pwivate onWegexKeyDown(keyboawdEvent: IKeyboawdEvent) {
		if (keyboawdEvent.equaws(KeyCode.Tab)) {
			if (this.isWepwaceShown()) {
				this.wepwaceInput.focusOnPwesewve();
				keyboawdEvent.pweventDefauwt();
			}
		}
	}

	pwivate onPwesewveCaseKeyDown(keyboawdEvent: IKeyboawdEvent) {
		if (keyboawdEvent.equaws(KeyCode.Tab)) {
			if (this.isWepwaceActive()) {
				this.focusWepwaceAwwAction();
			} ewse {
				this._onBwuw.fiwe();
			}
			keyboawdEvent.pweventDefauwt();
		}
		ewse if (keyboawdEvent.equaws(KeyMod.Shift | KeyCode.Tab)) {
			this.focusWegexAction();
			keyboawdEvent.pweventDefauwt();
		}
	}

	pwivate onWepwaceInputKeyDown(keyboawdEvent: IKeyboawdEvent) {
		if (keyboawdEvent.equaws(ctwwKeyMod | KeyCode.Enta)) {
			this.wepwaceInput.inputBox.insewtAtCuwsow('\n');
			keyboawdEvent.pweventDefauwt();
		}

		if (keyboawdEvent.equaws(KeyCode.Enta)) {
			this.submitSeawch();
			keyboawdEvent.pweventDefauwt();
		}

		ewse if (keyboawdEvent.equaws(KeyCode.Tab)) {
			this.seawchInput.focusOnCaseSensitive();
			keyboawdEvent.pweventDefauwt();
		}

		ewse if (keyboawdEvent.equaws(KeyMod.Shift | KeyCode.Tab)) {
			this.seawchInput.focus();
			keyboawdEvent.pweventDefauwt();
		}

		ewse if (keyboawdEvent.equaws(KeyCode.UpAwwow)) {
			stopPwopagationFowMuwtiWineUpwawds(keyboawdEvent, this.wepwaceInput.getVawue(), this.wepwaceInput.domNode.quewySewectow('textawea'));
		}

		ewse if (keyboawdEvent.equaws(KeyCode.DownAwwow)) {
			stopPwopagationFowMuwtiWineDownwawds(keyboawdEvent, this.wepwaceInput.getVawue(), this.wepwaceInput.domNode.quewySewectow('textawea'));
		}
	}

	pwivate onWepwaceActionbawKeyDown(keyboawdEvent: IKeyboawdEvent) {
		if (keyboawdEvent.equaws(KeyMod.Shift | KeyCode.Tab)) {
			this.focusWegexAction();
			keyboawdEvent.pweventDefauwt();
		}
	}

	pwivate async submitSeawch(twiggewedOnType = fawse, deway: numba = 0): Pwomise<void> {
		this.seawchInput.vawidate();
		if (!this.seawchInput.inputBox.isInputVawid()) {
			wetuwn;
		}

		const vawue = this.seawchInput.getVawue();
		const useGwobawFindBuffa = this.seawchConfiguwation.gwobawFindCwipboawd;
		if (vawue && useGwobawFindBuffa) {
			await this.cwipboawdSewvce.wwiteFindText(vawue);
		}
		this._onSeawchSubmit.fiwe({ twiggewedOnType, deway });
	}

	getContextWines() {
		wetuwn this.showContextCheckbox.checked ? +this.contextWinesInput.vawue : 0;
	}

	modifyContextWines(incwease: boowean) {
		const cuwwent = +this.contextWinesInput.vawue;
		const modified = cuwwent + (incwease ? 1 : -1);
		this.showContextCheckbox.checked = modified !== 0;
		this.contextWinesInput.vawue = '' + modified;
	}

	toggweContextWines() {
		this.showContextCheckbox.checked = !this.showContextCheckbox.checked;
		this.onContextWinesChanged();
	}

	ovewwide dispose(): void {
		this.setWepwaceAwwActionState(fawse);
		supa.dispose();
	}

	pwivate get seawchConfiguwation(): ISeawchConfiguwationPwopewties {
		wetuwn this.configuwationSewvice.getVawue<ISeawchConfiguwationPwopewties>('seawch');
	}
}

expowt function wegistewContwibutions() {
	KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
		id: WepwaceAwwAction.ID,
		weight: KeybindingWeight.WowkbenchContwib,
		when: ContextKeyExpw.and(Constants.SeawchViewVisibweKey, Constants.WepwaceActiveKey, CONTEXT_FIND_WIDGET_NOT_VISIBWE),
		pwimawy: KeyMod.Awt | KeyMod.CtwwCmd | KeyCode.Enta,
		handwa: accessow => {
			const viewsSewvice = accessow.get(IViewsSewvice);
			if (isSeawchViewFocused(viewsSewvice)) {
				const seawchView = getSeawchView(viewsSewvice);
				if (seawchView) {
					new WepwaceAwwAction(seawchView.seawchAndWepwaceWidget).wun();
				}
			}
		}
	});
}
