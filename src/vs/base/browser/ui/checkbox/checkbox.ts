/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./checkbox';
import * as DOM from 'vs/base/browser/dom';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { Widget } from 'vs/base/browser/ui/widget';
import { Color } from 'vs/base/common/color';
import { Emitter, Event } from 'vs/base/common/event';
import { KeyCode } from 'vs/base/common/keyCodes';
import * as objects from 'vs/base/common/objects';
import { BaseActionItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';

export interface ICheckboxOpts extends ICheckboxStyles {
	readonly actionClassName?: string;
	readonly title: string;
	readonly isChecked: boolean;
}

export interface ICheckboxStyles {
	inputActiveOptionBorder?: Color;
}

const defaultOpts = {
	inputActiveOptionBorder: Color.fromHex('#007ACC')
};

export class CheckboxActionItem extends BaseActionItem {

	private checkbox: Checkbox;
	private disposables: IDisposable[] = [];

	render(container: HTMLElement): void {
		this.element = container;

		this.disposables = dispose(this.disposables);
		this.checkbox = new Checkbox({
			actionClassName: this._action.class,
			isChecked: this._action.checked,
			title: this._action.label
		});
		this.disposables.push(this.checkbox);
		this.checkbox.onChange(() => this._action.checked = this.checkbox.checked, this, this.disposables);
		this.element.appendChild(this.checkbox.domNode);
	}

	updateEnabled(): void {
		if (this.checkbox) {
			if (this.isEnabled()) {
				this.checkbox.enable();
			} else {
				this.checkbox.disable();
			}
		}
	}

	updateChecked(): void {
		if (this.checkbox) {
			this.checkbox.checked = this._action.checked;
		}
	}

	dipsose(): void {
		this.disposables = dispose(this.disposables);
		super.dispose();
	}

}

export class Checkbox extends Widget {

	private readonly _onChange = this._register(new Emitter<boolean>());
	get onChange(): Event<boolean /* via keyboard */> { return this._onChange.event; }

	private readonly _onKeyDown = this._register(new Emitter<IKeyboardEvent>());
	get onKeyDown(): Event<IKeyboardEvent> { return this._onKeyDown.event; }

	private readonly _opts: ICheckboxOpts;
	readonly domNode: HTMLElement;

	private _checked: boolean;

	constructor(opts: ICheckboxOpts) {
		super();

		this._opts = objects.deepClone(opts);
		objects.mixin(this._opts, defaultOpts, false);
		this._checked = this._opts.isChecked;

		this.domNode = document.createElement('div');
		this.domNode.title = this._opts.title;
		this.domNode.className = 'monaco-custom-checkbox ' + (this._opts.actionClassName || '') + ' ' + (this._checked ? 'checked' : 'unchecked');
		this.domNode.tabIndex = 0;
		this.domNode.setAttribute('role', 'checkbox');
		this.domNode.setAttribute('aria-checked', String(this._checked));
		this.domNode.setAttribute('aria-label', this._opts.title);

		this.applyStyles();

		this.onclick(this.domNode, (ev) => {
			this.checked = !this._checked;
			this._onChange.fire(false);
			ev.preventDefault();
		});

		this.onkeydown(this.domNode, (keyboardEvent) => {
			if (keyboardEvent.keyCode === KeyCode.Space || keyboardEvent.keyCode === KeyCode.Enter) {
				this.checked = !this._checked;
				this._onChange.fire(true);
				keyboardEvent.preventDefault();
				return;
			}

			this._onKeyDown.fire(keyboardEvent);
		});
	}

	get enabled(): boolean {
		return this.domNode.getAttribute('aria-disabled') !== 'true';
	}

	focus(): void {
		this.domNode.focus();
	}

	get checked(): boolean {
		return this._checked;
	}

	set checked(newIsChecked: boolean) {
		this._checked = newIsChecked;
		this.domNode.setAttribute('aria-checked', String(this._checked));
		if (this._checked) {
			this.domNode.classList.add('checked');
		} else {
			this.domNode.classList.remove('checked');
		}

		this.applyStyles();
	}

	width(): number {
		return 2 /*marginleft*/ + 2 /*border*/ + 2 /*padding*/ + 16 /* icon width */;
	}

	style(styles: ICheckboxStyles): void {
		if (styles.inputActiveOptionBorder) {
			this._opts.inputActiveOptionBorder = styles.inputActiveOptionBorder;
		}
		this.applyStyles();
	}

	protected applyStyles(): void {
		if (this.domNode) {
			this.domNode.style.borderColor = this._checked && this._opts.inputActiveOptionBorder ? this._opts.inputActiveOptionBorder.toString() : 'transparent';
		}
	}

	enable(): void {
		this.domNode.tabIndex = 0;
		this.domNode.setAttribute('aria-disabled', String(false));
	}

	disable(): void {
		DOM.removeTabIndexAndUpdateFocus(this.domNode);
		this.domNode.setAttribute('aria-disabled', String(true));
	}
}
