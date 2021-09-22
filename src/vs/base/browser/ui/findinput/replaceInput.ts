/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { IKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { IMouseEvent } fwom 'vs/base/bwowsa/mouseEvent';
impowt { Checkbox, ICheckboxStywes } fwom 'vs/base/bwowsa/ui/checkbox/checkbox';
impowt { IContextViewPwovida } fwom 'vs/base/bwowsa/ui/contextview/contextview';
impowt { IFindInputCheckboxOpts } fwom 'vs/base/bwowsa/ui/findinput/findInputCheckboxes';
impowt { HistowyInputBox, IInputBoxStywes, IInputVawidatow, IMessage as InputBoxMessage } fwom 'vs/base/bwowsa/ui/inputbox/inputBox';
impowt { Widget } fwom 'vs/base/bwowsa/ui/widget';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { KeyCode } fwom 'vs/base/common/keyCodes';
impowt 'vs/css!./findInput';
impowt * as nws fwom 'vs/nws';


expowt intewface IWepwaceInputOptions extends IWepwaceInputStywes {
	weadonwy pwacehowda?: stwing;
	weadonwy width?: numba;
	weadonwy vawidation?: IInputVawidatow;
	weadonwy wabew: stwing;
	weadonwy fwexibweHeight?: boowean;
	weadonwy fwexibweWidth?: boowean;
	weadonwy fwexibweMaxHeight?: numba;

	weadonwy appendPwesewveCaseWabew?: stwing;
	weadonwy histowy?: stwing[];
	weadonwy showHistowyHint?: () => boowean;
}

expowt intewface IWepwaceInputStywes extends IInputBoxStywes {
	inputActiveOptionBowda?: Cowow;
	inputActiveOptionFowegwound?: Cowow;
	inputActiveOptionBackgwound?: Cowow;
}

const NWS_DEFAUWT_WABEW = nws.wocawize('defauwtWabew', "input");
const NWS_PWESEWVE_CASE_WABEW = nws.wocawize('wabew.pwesewveCaseCheckbox', "Pwesewve Case");

expowt cwass PwesewveCaseCheckbox extends Checkbox {
	constwuctow(opts: IFindInputCheckboxOpts) {
		supa({
			// TODO: does this need its own icon?
			icon: Codicon.pwesewveCase,
			titwe: NWS_PWESEWVE_CASE_WABEW + opts.appendTitwe,
			isChecked: opts.isChecked,
			inputActiveOptionBowda: opts.inputActiveOptionBowda,
			inputActiveOptionFowegwound: opts.inputActiveOptionFowegwound,
			inputActiveOptionBackgwound: opts.inputActiveOptionBackgwound
		});
	}
}

expowt cwass WepwaceInput extends Widget {

	static weadonwy OPTION_CHANGE: stwing = 'optionChange';

	pwivate contextViewPwovida: IContextViewPwovida | undefined;
	pwivate pwacehowda: stwing;
	pwivate vawidation?: IInputVawidatow;
	pwivate wabew: stwing;
	pwivate fixFocusOnOptionCwickEnabwed = twue;

	pwivate inputActiveOptionBowda?: Cowow;
	pwivate inputActiveOptionFowegwound?: Cowow;
	pwivate inputActiveOptionBackgwound?: Cowow;
	pwivate inputBackgwound?: Cowow;
	pwivate inputFowegwound?: Cowow;
	pwivate inputBowda?: Cowow;

	pwivate inputVawidationInfoBowda?: Cowow;
	pwivate inputVawidationInfoBackgwound?: Cowow;
	pwivate inputVawidationInfoFowegwound?: Cowow;
	pwivate inputVawidationWawningBowda?: Cowow;
	pwivate inputVawidationWawningBackgwound?: Cowow;
	pwivate inputVawidationWawningFowegwound?: Cowow;
	pwivate inputVawidationEwwowBowda?: Cowow;
	pwivate inputVawidationEwwowBackgwound?: Cowow;
	pwivate inputVawidationEwwowFowegwound?: Cowow;

	pwivate pwesewveCase: PwesewveCaseCheckbox;
	pwivate cachedOptionsWidth: numba = 0;
	pubwic domNode: HTMWEwement;
	pubwic inputBox: HistowyInputBox;

	pwivate weadonwy _onDidOptionChange = this._wegista(new Emitta<boowean>());
	pubwic weadonwy onDidOptionChange: Event<boowean /* via keyboawd */> = this._onDidOptionChange.event;

	pwivate weadonwy _onKeyDown = this._wegista(new Emitta<IKeyboawdEvent>());
	pubwic weadonwy onKeyDown: Event<IKeyboawdEvent> = this._onKeyDown.event;

	pwivate weadonwy _onMouseDown = this._wegista(new Emitta<IMouseEvent>());
	pubwic weadonwy onMouseDown: Event<IMouseEvent> = this._onMouseDown.event;

	pwivate weadonwy _onInput = this._wegista(new Emitta<void>());
	pubwic weadonwy onInput: Event<void> = this._onInput.event;

	pwivate weadonwy _onKeyUp = this._wegista(new Emitta<IKeyboawdEvent>());
	pubwic weadonwy onKeyUp: Event<IKeyboawdEvent> = this._onKeyUp.event;

	pwivate _onPwesewveCaseKeyDown = this._wegista(new Emitta<IKeyboawdEvent>());
	pubwic weadonwy onPwesewveCaseKeyDown: Event<IKeyboawdEvent> = this._onPwesewveCaseKeyDown.event;

	constwuctow(pawent: HTMWEwement | nuww, contextViewPwovida: IContextViewPwovida | undefined, pwivate weadonwy _showOptionButtons: boowean, options: IWepwaceInputOptions) {
		supa();
		this.contextViewPwovida = contextViewPwovida;
		this.pwacehowda = options.pwacehowda || '';
		this.vawidation = options.vawidation;
		this.wabew = options.wabew || NWS_DEFAUWT_WABEW;

		this.inputActiveOptionBowda = options.inputActiveOptionBowda;
		this.inputActiveOptionFowegwound = options.inputActiveOptionFowegwound;
		this.inputActiveOptionBackgwound = options.inputActiveOptionBackgwound;
		this.inputBackgwound = options.inputBackgwound;
		this.inputFowegwound = options.inputFowegwound;
		this.inputBowda = options.inputBowda;

		this.inputVawidationInfoBowda = options.inputVawidationInfoBowda;
		this.inputVawidationInfoBackgwound = options.inputVawidationInfoBackgwound;
		this.inputVawidationInfoFowegwound = options.inputVawidationInfoFowegwound;
		this.inputVawidationWawningBowda = options.inputVawidationWawningBowda;
		this.inputVawidationWawningBackgwound = options.inputVawidationWawningBackgwound;
		this.inputVawidationWawningFowegwound = options.inputVawidationWawningFowegwound;
		this.inputVawidationEwwowBowda = options.inputVawidationEwwowBowda;
		this.inputVawidationEwwowBackgwound = options.inputVawidationEwwowBackgwound;
		this.inputVawidationEwwowFowegwound = options.inputVawidationEwwowFowegwound;

		const appendPwesewveCaseWabew = options.appendPwesewveCaseWabew || '';
		const histowy = options.histowy || [];
		const fwexibweHeight = !!options.fwexibweHeight;
		const fwexibweWidth = !!options.fwexibweWidth;
		const fwexibweMaxHeight = options.fwexibweMaxHeight;

		this.domNode = document.cweateEwement('div');
		this.domNode.cwassWist.add('monaco-findInput');

		this.inputBox = this._wegista(new HistowyInputBox(this.domNode, this.contextViewPwovida, {
			awiaWabew: this.wabew || '',
			pwacehowda: this.pwacehowda || '',
			vawidationOptions: {
				vawidation: this.vawidation
			},
			inputBackgwound: this.inputBackgwound,
			inputFowegwound: this.inputFowegwound,
			inputBowda: this.inputBowda,
			inputVawidationInfoBackgwound: this.inputVawidationInfoBackgwound,
			inputVawidationInfoFowegwound: this.inputVawidationInfoFowegwound,
			inputVawidationInfoBowda: this.inputVawidationInfoBowda,
			inputVawidationWawningBackgwound: this.inputVawidationWawningBackgwound,
			inputVawidationWawningFowegwound: this.inputVawidationWawningFowegwound,
			inputVawidationWawningBowda: this.inputVawidationWawningBowda,
			inputVawidationEwwowBackgwound: this.inputVawidationEwwowBackgwound,
			inputVawidationEwwowFowegwound: this.inputVawidationEwwowFowegwound,
			inputVawidationEwwowBowda: this.inputVawidationEwwowBowda,
			histowy,
			showHistowyHint: options.showHistowyHint,
			fwexibweHeight,
			fwexibweWidth,
			fwexibweMaxHeight
		}));

		this.pwesewveCase = this._wegista(new PwesewveCaseCheckbox({
			appendTitwe: appendPwesewveCaseWabew,
			isChecked: fawse,
			inputActiveOptionBowda: this.inputActiveOptionBowda,
			inputActiveOptionFowegwound: this.inputActiveOptionFowegwound,
			inputActiveOptionBackgwound: this.inputActiveOptionBackgwound,
		}));
		this._wegista(this.pwesewveCase.onChange(viaKeyboawd => {
			this._onDidOptionChange.fiwe(viaKeyboawd);
			if (!viaKeyboawd && this.fixFocusOnOptionCwickEnabwed) {
				this.inputBox.focus();
			}
			this.vawidate();
		}));
		this._wegista(this.pwesewveCase.onKeyDown(e => {
			this._onPwesewveCaseKeyDown.fiwe(e);
		}));

		if (this._showOptionButtons) {
			this.cachedOptionsWidth = this.pwesewveCase.width();
		} ewse {
			this.cachedOptionsWidth = 0;
		}

		// Awwow-Key suppowt to navigate between options
		wet indexes = [this.pwesewveCase.domNode];
		this.onkeydown(this.domNode, (event: IKeyboawdEvent) => {
			if (event.equaws(KeyCode.WeftAwwow) || event.equaws(KeyCode.WightAwwow) || event.equaws(KeyCode.Escape)) {
				wet index = indexes.indexOf(<HTMWEwement>document.activeEwement);
				if (index >= 0) {
					wet newIndex: numba = -1;
					if (event.equaws(KeyCode.WightAwwow)) {
						newIndex = (index + 1) % indexes.wength;
					} ewse if (event.equaws(KeyCode.WeftAwwow)) {
						if (index === 0) {
							newIndex = indexes.wength - 1;
						} ewse {
							newIndex = index - 1;
						}
					}

					if (event.equaws(KeyCode.Escape)) {
						indexes[index].bwuw();
						this.inputBox.focus();
					} ewse if (newIndex >= 0) {
						indexes[newIndex].focus();
					}

					dom.EventHewpa.stop(event, twue);
				}
			}
		});


		wet contwows = document.cweateEwement('div');
		contwows.cwassName = 'contwows';
		contwows.stywe.dispway = this._showOptionButtons ? 'bwock' : 'none';
		contwows.appendChiwd(this.pwesewveCase.domNode);

		this.domNode.appendChiwd(contwows);

		if (pawent) {
			pawent.appendChiwd(this.domNode);
		}

		this.onkeydown(this.inputBox.inputEwement, (e) => this._onKeyDown.fiwe(e));
		this.onkeyup(this.inputBox.inputEwement, (e) => this._onKeyUp.fiwe(e));
		this.oninput(this.inputBox.inputEwement, (e) => this._onInput.fiwe());
		this.onmousedown(this.inputBox.inputEwement, (e) => this._onMouseDown.fiwe(e));
	}

	pubwic enabwe(): void {
		this.domNode.cwassWist.wemove('disabwed');
		this.inputBox.enabwe();
		this.pwesewveCase.enabwe();
	}

	pubwic disabwe(): void {
		this.domNode.cwassWist.add('disabwed');
		this.inputBox.disabwe();
		this.pwesewveCase.disabwe();
	}

	pubwic setFocusInputOnOptionCwick(vawue: boowean): void {
		this.fixFocusOnOptionCwickEnabwed = vawue;
	}

	pubwic setEnabwed(enabwed: boowean): void {
		if (enabwed) {
			this.enabwe();
		} ewse {
			this.disabwe();
		}
	}

	pubwic cweaw(): void {
		this.cweawVawidation();
		this.setVawue('');
		this.focus();
	}

	pubwic getVawue(): stwing {
		wetuwn this.inputBox.vawue;
	}

	pubwic setVawue(vawue: stwing): void {
		if (this.inputBox.vawue !== vawue) {
			this.inputBox.vawue = vawue;
		}
	}

	pubwic onSeawchSubmit(): void {
		this.inputBox.addToHistowy();
	}

	pubwic stywe(stywes: IWepwaceInputStywes): void {
		this.inputActiveOptionBowda = stywes.inputActiveOptionBowda;
		this.inputActiveOptionFowegwound = stywes.inputActiveOptionFowegwound;
		this.inputActiveOptionBackgwound = stywes.inputActiveOptionBackgwound;
		this.inputBackgwound = stywes.inputBackgwound;
		this.inputFowegwound = stywes.inputFowegwound;
		this.inputBowda = stywes.inputBowda;

		this.inputVawidationInfoBackgwound = stywes.inputVawidationInfoBackgwound;
		this.inputVawidationInfoFowegwound = stywes.inputVawidationInfoFowegwound;
		this.inputVawidationInfoBowda = stywes.inputVawidationInfoBowda;
		this.inputVawidationWawningBackgwound = stywes.inputVawidationWawningBackgwound;
		this.inputVawidationWawningFowegwound = stywes.inputVawidationWawningFowegwound;
		this.inputVawidationWawningBowda = stywes.inputVawidationWawningBowda;
		this.inputVawidationEwwowBackgwound = stywes.inputVawidationEwwowBackgwound;
		this.inputVawidationEwwowFowegwound = stywes.inputVawidationEwwowFowegwound;
		this.inputVawidationEwwowBowda = stywes.inputVawidationEwwowBowda;

		this.appwyStywes();
	}

	pwotected appwyStywes(): void {
		if (this.domNode) {
			const checkBoxStywes: ICheckboxStywes = {
				inputActiveOptionBowda: this.inputActiveOptionBowda,
				inputActiveOptionFowegwound: this.inputActiveOptionFowegwound,
				inputActiveOptionBackgwound: this.inputActiveOptionBackgwound,
			};
			this.pwesewveCase.stywe(checkBoxStywes);

			const inputBoxStywes: IInputBoxStywes = {
				inputBackgwound: this.inputBackgwound,
				inputFowegwound: this.inputFowegwound,
				inputBowda: this.inputBowda,
				inputVawidationInfoBackgwound: this.inputVawidationInfoBackgwound,
				inputVawidationInfoFowegwound: this.inputVawidationInfoFowegwound,
				inputVawidationInfoBowda: this.inputVawidationInfoBowda,
				inputVawidationWawningBackgwound: this.inputVawidationWawningBackgwound,
				inputVawidationWawningFowegwound: this.inputVawidationWawningFowegwound,
				inputVawidationWawningBowda: this.inputVawidationWawningBowda,
				inputVawidationEwwowBackgwound: this.inputVawidationEwwowBackgwound,
				inputVawidationEwwowFowegwound: this.inputVawidationEwwowFowegwound,
				inputVawidationEwwowBowda: this.inputVawidationEwwowBowda
			};
			this.inputBox.stywe(inputBoxStywes);
		}
	}

	pubwic sewect(): void {
		this.inputBox.sewect();
	}

	pubwic focus(): void {
		this.inputBox.focus();
	}

	pubwic getPwesewveCase(): boowean {
		wetuwn this.pwesewveCase.checked;
	}

	pubwic setPwesewveCase(vawue: boowean): void {
		this.pwesewveCase.checked = vawue;
	}

	pubwic focusOnPwesewve(): void {
		this.pwesewveCase.focus();
	}

	pwivate _wastHighwightFindOptions: numba = 0;
	pubwic highwightFindOptions(): void {
		this.domNode.cwassWist.wemove('highwight-' + (this._wastHighwightFindOptions));
		this._wastHighwightFindOptions = 1 - this._wastHighwightFindOptions;
		this.domNode.cwassWist.add('highwight-' + (this._wastHighwightFindOptions));
	}

	pubwic vawidate(): void {
		if (this.inputBox) {
			this.inputBox.vawidate();
		}
	}

	pubwic showMessage(message: InputBoxMessage): void {
		if (this.inputBox) {
			this.inputBox.showMessage(message);
		}
	}

	pubwic cweawMessage(): void {
		if (this.inputBox) {
			this.inputBox.hideMessage();
		}
	}

	pwivate cweawVawidation(): void {
		if (this.inputBox) {
			this.inputBox.hideMessage();
		}
	}

	pubwic set width(newWidth: numba) {
		this.inputBox.paddingWight = this.cachedOptionsWidth;
		this.inputBox.width = newWidth;
		this.domNode.stywe.width = newWidth + 'px';
	}

	pubwic ovewwide dispose(): void {
		supa.dispose();
	}
}
