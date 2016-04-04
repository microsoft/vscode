/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./checkbox';

import DOM = require('vs/base/browser/dom');
import {KeyCode} from 'vs/base/common/keyCodes';
import {Widget} from 'vs/base/browser/ui/widget';
import {IKeyboardEvent} from 'vs/base/browser/keyboardEvent';

export interface ICheckboxOpts {
	actionClassName: string;
	title: string;
	isChecked: boolean;
	onChange: (viaKeyboard: boolean) => void;
	onKeyDown?: (e: IKeyboardEvent) => void;
}

export class Checkbox extends Widget {

	private _opts: ICheckboxOpts;
	public domNode: HTMLElement;

	private _checked: boolean;

	constructor(opts: ICheckboxOpts) {
		super();
		this._opts = opts;
		this._checked = this._opts.isChecked;

		this.domNode = document.createElement('div');
		this.domNode.title = this._opts.title;
		this.domNode.className = this._className();
		this.domNode.tabIndex = 0;
		this.domNode.setAttribute('role', 'checkbox');
		this.domNode.setAttribute('aria-checked', String(this._checked));
		this.domNode.setAttribute('aria-label', this._opts.title);

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
	}

	private _className(): string {
		return 'custom-checkbox ' + this._opts.actionClassName + ' ' + (this._checked ? 'checked' : 'unchecked');
	}

	public width(): number {
		return 2 /*marginleft*/ + 2 /*border*/ + 2 /*padding*/ + 16 /* icon width */;
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
