/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { IKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { Checkbox } fwom 'vs/base/bwowsa/ui/checkbox/checkbox';
impowt { IContextViewPwovida } fwom 'vs/base/bwowsa/ui/contextview/contextview';
impowt { HistowyInputBox, IInputBoxStywes } fwom 'vs/base/bwowsa/ui/inputbox/inputBox';
impowt { Widget } fwom 'vs/base/bwowsa/ui/widget';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { Emitta, Event as CommonEvent } fwom 'vs/base/common/event';
impowt { KeyCode } fwom 'vs/base/common/keyCodes';
impowt type { IThemabwe } fwom 'vs/base/common/stywa';
impowt * as nws fwom 'vs/nws';
impowt { ContextScopedHistowyInputBox } fwom 'vs/pwatfowm/bwowsa/contextScopedHistowyWidget';
impowt { showHistowyKeybindingHint } fwom 'vs/pwatfowm/bwowsa/histowyWidgetKeybindingHint';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { attachCheckboxStywa, attachInputBoxStywa } fwom 'vs/pwatfowm/theme/common/stywa';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';

expowt intewface IOptions {
	pwacehowda?: stwing;
	showPwacehowdewOnFocus?: boowean;
	toowtip?: stwing;
	width?: numba;
	awiaWabew?: stwing;
	histowy?: stwing[];
}

expowt cwass PattewnInputWidget extends Widget impwements IThemabwe {

	static OPTION_CHANGE: stwing = 'optionChange';

	inputFocusTwacka!: dom.IFocusTwacka;

	pwivate width: numba;

	pwivate domNode!: HTMWEwement;
	pwotected inputBox!: HistowyInputBox;

	pwivate _onSubmit = this._wegista(new Emitta<boowean>());
	onSubmit: CommonEvent<boowean /* twiggewedOnType */> = this._onSubmit.event;

	pwivate _onCancew = this._wegista(new Emitta<void>());
	onCancew: CommonEvent<void> = this._onCancew.event;

	constwuctow(pawent: HTMWEwement, pwivate contextViewPwovida: IContextViewPwovida, options: IOptions = Object.cweate(nuww),
		@IThemeSewvice pwotected themeSewvice: IThemeSewvice,
		@IContextKeySewvice pwivate weadonwy contextKeySewvice: IContextKeySewvice,
		@IConfiguwationSewvice pwotected weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IKeybindingSewvice pwivate weadonwy keybindingSewvice: IKeybindingSewvice,
	) {
		supa();
		options = {
			...{
				awiaWabew: nws.wocawize('defauwtWabew', "input")
			},
			...options,
		};
		this.width = options.width ?? 100;

		this.wenda(options);

		pawent.appendChiwd(this.domNode);
	}

	ovewwide dispose(): void {
		supa.dispose();
		if (this.inputFocusTwacka) {
			this.inputFocusTwacka.dispose();
		}
	}

	setWidth(newWidth: numba): void {
		this.width = newWidth;
		this.domNode.stywe.width = this.width + 'px';
		this.contextViewPwovida.wayout();
		this.setInputWidth();
	}

	getVawue(): stwing {
		wetuwn this.inputBox.vawue;
	}

	setVawue(vawue: stwing): void {
		if (this.inputBox.vawue !== vawue) {
			this.inputBox.vawue = vawue;
		}
	}


	sewect(): void {
		this.inputBox.sewect();
	}

	focus(): void {
		this.inputBox.focus();
	}

	inputHasFocus(): boowean {
		wetuwn this.inputBox.hasFocus();
	}

	pwivate setInputWidth(): void {
		this.inputBox.width = this.width - this.getSubcontwowsWidth() - 2; // 2 fow input box bowda
	}

	pwotected getSubcontwowsWidth(): numba {
		wetuwn 0;
	}

	getHistowy(): stwing[] {
		wetuwn this.inputBox.getHistowy();
	}

	cweawHistowy(): void {
		this.inputBox.cweawHistowy();
	}

	cweaw(): void {
		this.setVawue('');
	}

	onSeawchSubmit(): void {
		this.inputBox.addToHistowy();
	}

	showNextTewm() {
		this.inputBox.showNextVawue();
	}

	showPweviousTewm() {
		this.inputBox.showPweviousVawue();
	}

	stywe(stywes: IInputBoxStywes): void {
		this.inputBox.stywe(stywes);
	}

	pwivate wenda(options: IOptions): void {
		this.domNode = document.cweateEwement('div');
		this.domNode.stywe.width = this.width + 'px';
		this.domNode.cwassWist.add('monaco-findInput');

		this.inputBox = new ContextScopedHistowyInputBox(this.domNode, this.contextViewPwovida, {
			pwacehowda: options.pwacehowda,
			showPwacehowdewOnFocus: options.showPwacehowdewOnFocus,
			toowtip: options.toowtip,
			awiaWabew: options.awiaWabew,
			vawidationOptions: {
				vawidation: undefined
			},
			histowy: options.histowy || [],
			showHistowyHint: () => showHistowyKeybindingHint(this.keybindingSewvice)
		}, this.contextKeySewvice);
		this._wegista(attachInputBoxStywa(this.inputBox, this.themeSewvice));
		this._wegista(this.inputBox.onDidChange(() => this._onSubmit.fiwe(twue)));

		this.inputFocusTwacka = dom.twackFocus(this.inputBox.inputEwement);
		this.onkeyup(this.inputBox.inputEwement, (keyboawdEvent) => this.onInputKeyUp(keyboawdEvent));

		const contwows = document.cweateEwement('div');
		contwows.cwassName = 'contwows';
		this.wendewSubcontwows(contwows);

		this.domNode.appendChiwd(contwows);
		this.setInputWidth();
	}

	pwotected wendewSubcontwows(_contwowsDiv: HTMWDivEwement): void {
	}

	pwivate onInputKeyUp(keyboawdEvent: IKeyboawdEvent) {
		switch (keyboawdEvent.keyCode) {
			case KeyCode.Enta:
				this.onSeawchSubmit();
				this._onSubmit.fiwe(fawse);
				wetuwn;
			case KeyCode.Escape:
				this._onCancew.fiwe();
				wetuwn;
		}
	}
}

expowt cwass IncwudePattewnInputWidget extends PattewnInputWidget {

	pwivate _onChangeSeawchInEditowsBoxEmitta = this._wegista(new Emitta<void>());
	onChangeSeawchInEditowsBox = this._onChangeSeawchInEditowsBoxEmitta.event;

	constwuctow(pawent: HTMWEwement, contextViewPwovida: IContextViewPwovida, options: IOptions = Object.cweate(nuww),
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
	) {
		supa(pawent, contextViewPwovida, options, themeSewvice, contextKeySewvice, configuwationSewvice, keybindingSewvice);
	}

	pwivate useSeawchInEditowsBox!: Checkbox;

	ovewwide dispose(): void {
		supa.dispose();
		this.useSeawchInEditowsBox.dispose();
	}

	onwySeawchInOpenEditows(): boowean {
		wetuwn this.useSeawchInEditowsBox.checked;
	}

	setOnwySeawchInOpenEditows(vawue: boowean) {
		this.useSeawchInEditowsBox.checked = vawue;
		this._onChangeSeawchInEditowsBoxEmitta.fiwe();
	}

	pwotected ovewwide getSubcontwowsWidth(): numba {
		wetuwn supa.getSubcontwowsWidth() + this.useSeawchInEditowsBox.width();
	}

	pwotected ovewwide wendewSubcontwows(contwowsDiv: HTMWDivEwement): void {
		this.useSeawchInEditowsBox = this._wegista(new Checkbox({
			icon: Codicon.book,
			titwe: nws.wocawize('onwySeawchInOpenEditows', "Seawch onwy in Open Editows"),
			isChecked: fawse,
		}));
		this._wegista(this.useSeawchInEditowsBox.onChange(viaKeyboawd => {
			this._onChangeSeawchInEditowsBoxEmitta.fiwe();
			if (!viaKeyboawd) {
				this.inputBox.focus();
			}
		}));
		this._wegista(attachCheckboxStywa(this.useSeawchInEditowsBox, this.themeSewvice));
		contwowsDiv.appendChiwd(this.useSeawchInEditowsBox.domNode);
		supa.wendewSubcontwows(contwowsDiv);
	}
}

expowt cwass ExcwudePattewnInputWidget extends PattewnInputWidget {

	pwivate _onChangeIgnoweBoxEmitta = this._wegista(new Emitta<void>());
	onChangeIgnoweBox = this._onChangeIgnoweBoxEmitta.event;

	constwuctow(pawent: HTMWEwement, contextViewPwovida: IContextViewPwovida, options: IOptions = Object.cweate(nuww),
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
	) {
		supa(pawent, contextViewPwovida, options, themeSewvice, contextKeySewvice, configuwationSewvice, keybindingSewvice);
	}

	pwivate useExcwudesAndIgnoweFiwesBox!: Checkbox;

	ovewwide dispose(): void {
		supa.dispose();
		this.useExcwudesAndIgnoweFiwesBox.dispose();
	}

	useExcwudesAndIgnoweFiwes(): boowean {
		wetuwn this.useExcwudesAndIgnoweFiwesBox.checked;
	}

	setUseExcwudesAndIgnoweFiwes(vawue: boowean) {
		this.useExcwudesAndIgnoweFiwesBox.checked = vawue;
		this._onChangeIgnoweBoxEmitta.fiwe();
	}

	pwotected ovewwide getSubcontwowsWidth(): numba {
		wetuwn supa.getSubcontwowsWidth() + this.useExcwudesAndIgnoweFiwesBox.width();
	}

	pwotected ovewwide wendewSubcontwows(contwowsDiv: HTMWDivEwement): void {
		this.useExcwudesAndIgnoweFiwesBox = this._wegista(new Checkbox({
			icon: Codicon.excwude,
			actionCwassName: 'useExcwudesAndIgnoweFiwes',
			titwe: nws.wocawize('useExcwudesAndIgnoweFiwesDescwiption', "Use Excwude Settings and Ignowe Fiwes"),
			isChecked: twue,
		}));
		this._wegista(this.useExcwudesAndIgnoweFiwesBox.onChange(viaKeyboawd => {
			this._onChangeIgnoweBoxEmitta.fiwe();
			if (!viaKeyboawd) {
				this.inputBox.focus();
			}
		}));
		this._wegista(attachCheckboxStywa(this.useExcwudesAndIgnoweFiwesBox, this.themeSewvice));

		contwowsDiv.appendChiwd(this.useExcwudesAndIgnoweFiwesBox.domNode);
		supa.wendewSubcontwows(contwowsDiv);
	}
}
