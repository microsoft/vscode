/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./checkbox';

import * as nls from 'vs/nls';
import {StandardMouseEvent} from 'vs/base/browser/mouseEvent';
import {StandardKeyboardEvent} from 'vs/base/browser/keyboardEvent';
import {KeyCode} from 'vs/base/common/keyCodes';
import {IDisposable, disposeAll} from 'vs/base/common/lifecycle';
import * as DomUtils from 'vs/base/browser/dom';

export interface ICheckboxOpts {
	actionClassName: string;
	title: string;
	isChecked: boolean;
	onChange: () => void;
}

export class Checkbox implements IDisposable {

	private _opts: ICheckboxOpts;
	private _toDispose: IDisposable[];
	public domNode: HTMLElement;

	private _checked: boolean;

	constructor(opts:ICheckboxOpts) {
		this._opts = opts;
		this._checked = this._opts.isChecked;
		this._toDispose = [];

		this.domNode = document.createElement('div');
		this.domNode.title = this._opts.title;
		this.domNode.className = this._className();
		this.domNode.tabIndex = 0;
		this.domNode.setAttribute('role', 'checkbox');
		this.domNode.setAttribute('aria-checked', String(this._checked));
		this.domNode.setAttribute('aria-label', this._opts.title);

		this._toDispose.push(DomUtils.addDisposableListener(this.domNode, 'click', (e:MouseEvent) => {
			var ev = new StandardMouseEvent(e);
			this._checked = !this._checked;
			this.domNode.className = this._className();
			this._opts.onChange();
			ev.preventDefault();
		}));

		this._toDispose.push(DomUtils.addDisposableListener(this.domNode, 'keydown', (browserEvent: KeyboardEvent) => {
			var keyboardEvent = new StandardKeyboardEvent(browserEvent);
			if (keyboardEvent.keyCode === KeyCode.Space || keyboardEvent.keyCode === KeyCode.Enter) {
				this._checked = !this._checked;
				this.domNode.className = this._className();
				this._opts.onChange();
				keyboardEvent.preventDefault();
			}
		}));
	}

	public dispose(): void {
		this._toDispose = disposeAll(this._toDispose);
	}

	public focus(): void {
		this.domNode.focus();
	}

	public get checked(): boolean {
		return this._checked;
	}

	public set checked(newIsChecked:boolean) {
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
		this.domNode.tabIndex = -1;
		this.domNode.setAttribute('aria-disabled', String(true));
	}
}
