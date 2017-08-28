/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./checkbox';

import DOM = require('vs/base/browser/dom');
import * as objects from 'vs/base/common/objects';
import { KeyCode } from 'vs/base/common/keyCodes';
import { Widget } from 'vs/base/browser/ui/widget';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { Color } from 'vs/base/common/color';

export interface ICheckboxOpts extends ICheckboxStyles {
	actionClassName: string;
	title: string;
	isChecked: boolean;
	onChange: (viaKeyboard: boolean) => void;
	onKeyDown?: (e: IKeyboardEvent) => void;
}

export interface ICheckboxStyles {
	inputActiveOptionBorder?: Color;
}

const defaultOpts = {
	inputActiveOptionBorder: Color.fromHex('#007ACC')
};

export class Checkbox extends Widget {

	private _opts: ICheckboxOpts;
	public domNode: HTMLElement;

	private _checked: boolean;

	constructor(opts: ICheckboxOpts) {
		super();
		this._opts = objects.clone(opts);
		objects.mixin(this._opts, defaultOpts, false);
		this._checked = this._opts.isChecked;

		this.domNode = document.createElement('div');
		this.domNode.title = this._opts.title;
		this.domNode.className = this._className();
		this.domNode.tabIndex = 0;
		this.domNode.setAttribute('role', 'checkbox');
		this.domNode.setAttribute('aria-checked', String(this._checked));
		this.domNode.setAttribute('aria-label', this._opts.title);

		this.applyStyles();

		this.onclick(this.domNode, (ev) => {
			this.checked = !this._checked;
			this._opts.onChange(false);
			ev.preventDefault();
		});

		this.onkeydown(this.domNode, (keyboardEvent) => {
			if (keyboardEvent.keyCode === KeyCode.Space || keyboardEvent.keyCode === KeyCode.Enter) {
				this.checked = !this._checked;
				this._opts.onChange(true);
				keyboardEvent.preventDefault();
				return;
			}

			if (this._opts.onKeyDown) {
				this._opts.onKeyDown(keyboardEvent);
			}
		});
	}

	public focus(): void {
		this.domNode.focus();
	}

	public get checked(): boolean {
		return this._checked;
	}

	public set checked(newIsChecked: boolean) {
		this._checked = newIsChecked;
		this.domNode.setAttribute('aria-checked', String(this._checked));
		this.domNode.className = this._className();
		this.applyStyles();
	}

	private _className(): string {
		return 'custom-checkbox ' + this._opts.actionClassName + ' ' + (this._checked ? 'checked' : 'unchecked');
	}

	public width(): number {
		return 2 /*marginleft*/ + 2 /*border*/ + 2 /*padding*/ + 16 /* icon width */;
	}

	public style(styles: ICheckboxStyles): void {
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

	public enable(): void {
		this.domNode.tabIndex = 0;
		this.domNode.setAttribute('aria-disabled', String(false));
	}

	public disable(): void {
		DOM.removeTabIndexAndUpdateFocus(this.domNode);
		this.domNode.setAttribute('aria-disabled', String(true));
	}
}
