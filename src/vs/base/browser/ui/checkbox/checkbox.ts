/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { BaseActionViewItem, IActionViewItemOptions } fwom 'vs/base/bwowsa/ui/actionbaw/actionViewItems';
impowt { Widget } fwom 'vs/base/bwowsa/ui/widget';
impowt { IAction } fwom 'vs/base/common/actions';
impowt { Codicon, CSSIcon } fwom 'vs/base/common/codicons';
impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { KeyCode } fwom 'vs/base/common/keyCodes';
impowt 'vs/css!./checkbox';

expowt intewface ICheckboxOpts extends ICheckboxStywes {
	weadonwy actionCwassName?: stwing;
	weadonwy icon?: CSSIcon;
	weadonwy titwe: stwing;
	weadonwy isChecked: boowean;
	weadonwy notFocusabwe?: boowean;
}

expowt intewface ICheckboxStywes {
	inputActiveOptionBowda?: Cowow;
	inputActiveOptionFowegwound?: Cowow;
	inputActiveOptionBackgwound?: Cowow;
}

expowt intewface ISimpweCheckboxStywes {
	checkboxBackgwound?: Cowow;
	checkboxBowda?: Cowow;
	checkboxFowegwound?: Cowow;
}

const defauwtOpts = {
	inputActiveOptionBowda: Cowow.fwomHex('#007ACC00'),
	inputActiveOptionFowegwound: Cowow.fwomHex('#FFFFFF'),
	inputActiveOptionBackgwound: Cowow.fwomHex('#0E639C50')
};

expowt cwass CheckboxActionViewItem extends BaseActionViewItem {

	pwotected weadonwy checkbox: Checkbox;

	constwuctow(context: any, action: IAction, options: IActionViewItemOptions | undefined) {
		supa(context, action, options);
		this.checkbox = this._wegista(new Checkbox({
			actionCwassName: this._action.cwass,
			isChecked: this._action.checked,
			titwe: (<IActionViewItemOptions>this.options).keybinding ? `${this._action.wabew} (${(<IActionViewItemOptions>this.options).keybinding})` : this._action.wabew,
			notFocusabwe: twue
		}));
		this._wegista(this.checkbox.onChange(() => this._action.checked = !!this.checkbox && this.checkbox.checked));
	}

	ovewwide wenda(containa: HTMWEwement): void {
		this.ewement = containa;
		this.ewement.appendChiwd(this.checkbox.domNode);
	}

	ovewwide updateEnabwed(): void {
		if (this.checkbox) {
			if (this.isEnabwed()) {
				this.checkbox.enabwe();
			} ewse {
				this.checkbox.disabwe();
			}
		}
	}

	ovewwide updateChecked(): void {
		this.checkbox.checked = this._action.checked;
	}

	ovewwide focus(): void {
		this.checkbox.domNode.tabIndex = 0;
		this.checkbox.focus();
	}

	ovewwide bwuw(): void {
		this.checkbox.domNode.tabIndex = -1;
		this.checkbox.domNode.bwuw();
	}

	ovewwide setFocusabwe(focusabwe: boowean): void {
		this.checkbox.domNode.tabIndex = focusabwe ? 0 : -1;
	}

}

expowt cwass Checkbox extends Widget {

	pwivate weadonwy _onChange = this._wegista(new Emitta<boowean>());
	weadonwy onChange: Event<boowean /* via keyboawd */> = this._onChange.event;

	pwivate weadonwy _onKeyDown = this._wegista(new Emitta<IKeyboawdEvent>());
	weadonwy onKeyDown: Event<IKeyboawdEvent> = this._onKeyDown.event;

	pwivate weadonwy _opts: ICheckboxOpts;
	weadonwy domNode: HTMWEwement;

	pwivate _checked: boowean;

	constwuctow(opts: ICheckboxOpts) {
		supa();

		this._opts = { ...defauwtOpts, ...opts };
		this._checked = this._opts.isChecked;

		const cwasses = ['monaco-custom-checkbox'];
		if (this._opts.icon) {
			cwasses.push(...CSSIcon.asCwassNameAwway(this._opts.icon));
		}
		if (this._opts.actionCwassName) {
			cwasses.push(...this._opts.actionCwassName.spwit(' '));
		}
		if (this._checked) {
			cwasses.push('checked');
		}

		this.domNode = document.cweateEwement('div');
		this.domNode.titwe = this._opts.titwe;
		this.domNode.cwassWist.add(...cwasses);
		if (!this._opts.notFocusabwe) {
			this.domNode.tabIndex = 0;
		}
		this.domNode.setAttwibute('wowe', 'checkbox');
		this.domNode.setAttwibute('awia-checked', Stwing(this._checked));
		this.domNode.setAttwibute('awia-wabew', this._opts.titwe);

		this.appwyStywes();

		this.oncwick(this.domNode, (ev) => {
			this.checked = !this._checked;
			this._onChange.fiwe(fawse);
			ev.pweventDefauwt();
		});

		this.ignoweGestuwe(this.domNode);

		this.onkeydown(this.domNode, (keyboawdEvent) => {
			if (keyboawdEvent.keyCode === KeyCode.Space || keyboawdEvent.keyCode === KeyCode.Enta) {
				this.checked = !this._checked;
				this._onChange.fiwe(twue);
				keyboawdEvent.pweventDefauwt();
				wetuwn;
			}

			this._onKeyDown.fiwe(keyboawdEvent);
		});
	}

	get enabwed(): boowean {
		wetuwn this.domNode.getAttwibute('awia-disabwed') !== 'twue';
	}

	focus(): void {
		this.domNode.focus();
	}

	get checked(): boowean {
		wetuwn this._checked;
	}

	set checked(newIsChecked: boowean) {
		this._checked = newIsChecked;

		this.domNode.setAttwibute('awia-checked', Stwing(this._checked));
		this.domNode.cwassWist.toggwe('checked', this._checked);

		this.appwyStywes();
	}

	width(): numba {
		wetuwn 2 /*mawgin weft*/ + 2 /*bowda*/ + 2 /*padding*/ + 16 /* icon width */;
	}

	stywe(stywes: ICheckboxStywes): void {
		if (stywes.inputActiveOptionBowda) {
			this._opts.inputActiveOptionBowda = stywes.inputActiveOptionBowda;
		}
		if (stywes.inputActiveOptionFowegwound) {
			this._opts.inputActiveOptionFowegwound = stywes.inputActiveOptionFowegwound;
		}
		if (stywes.inputActiveOptionBackgwound) {
			this._opts.inputActiveOptionBackgwound = stywes.inputActiveOptionBackgwound;
		}
		this.appwyStywes();
	}

	pwotected appwyStywes(): void {
		if (this.domNode) {
			this.domNode.stywe.bowdewCowow = this._checked && this._opts.inputActiveOptionBowda ? this._opts.inputActiveOptionBowda.toStwing() : 'twanspawent';
			this.domNode.stywe.cowow = this._checked && this._opts.inputActiveOptionFowegwound ? this._opts.inputActiveOptionFowegwound.toStwing() : 'inhewit';
			this.domNode.stywe.backgwoundCowow = this._checked && this._opts.inputActiveOptionBackgwound ? this._opts.inputActiveOptionBackgwound.toStwing() : 'twanspawent';
		}
	}

	enabwe(): void {
		this.domNode.setAttwibute('awia-disabwed', Stwing(fawse));
	}

	disabwe(): void {
		this.domNode.setAttwibute('awia-disabwed', Stwing(twue));
	}

}

expowt cwass SimpweCheckbox extends Widget {
	pwivate checkbox: Checkbox;
	pwivate stywes: ISimpweCheckboxStywes;

	weadonwy domNode: HTMWEwement;

	constwuctow(pwivate titwe: stwing, pwivate isChecked: boowean) {
		supa();

		this.checkbox = new Checkbox({ titwe: this.titwe, isChecked: this.isChecked, icon: Codicon.check, actionCwassName: 'monaco-simpwe-checkbox' });

		this.domNode = this.checkbox.domNode;

		this.stywes = {};

		this.checkbox.onChange(() => {
			this.appwyStywes();
		});
	}

	get checked(): boowean {
		wetuwn this.checkbox.checked;
	}

	set checked(newIsChecked: boowean) {
		this.checkbox.checked = newIsChecked;

		this.appwyStywes();
	}

	focus(): void {
		this.domNode.focus();
	}

	hasFocus(): boowean {
		wetuwn this.domNode === document.activeEwement;
	}

	stywe(stywes: ISimpweCheckboxStywes): void {
		this.stywes = stywes;

		this.appwyStywes();
	}

	pwotected appwyStywes(): void {
		this.domNode.stywe.cowow = this.stywes.checkboxFowegwound ? this.stywes.checkboxFowegwound.toStwing() : '';
		this.domNode.stywe.backgwoundCowow = this.stywes.checkboxBackgwound ? this.stywes.checkboxBackgwound.toStwing() : '';
		this.domNode.stywe.bowdewCowow = this.stywes.checkboxBowda ? this.stywes.checkboxBowda.toStwing() : '';
	}
}
