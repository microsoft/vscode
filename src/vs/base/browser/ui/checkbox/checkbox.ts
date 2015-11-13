/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./checkbox';
import nls = require('vs/nls');
import Builder = require('vs/base/browser/builder');
import mouse = require('vs/base/browser/mouseEvent');
import keyboard = require('vs/base/browser/keyboardEvent');
import {KeyCode} from 'vs/base/common/keyCodes';

var $ = Builder.$;

export class Checkbox {

	private actionClassName: string;
	private title: string;
	public isChecked: boolean;
	private onChange: () => void;
	private listenersToRemove: { (): void; }[];
	public domNode: HTMLElement;

	constructor(actionClassName: string, title: string, isChecked: boolean, onChange: () => void) {
		this.actionClassName = actionClassName;
		this.title = title;
		this.isChecked = isChecked;
		this.onChange = onChange;

		this.listenersToRemove = [];

		this.domNode = document.createElement('div');
		this.domNode.title = title;
		this.render();

		$(this.domNode).attr({
			'aria-checked': 'false',
			'aria-label': this.title,
			'tabindex': 0,
			'role': 'checkbox'
		});

		$(this.domNode).on('click', (e: MouseEvent) => {
			var ev = new mouse.StandardMouseEvent(e);
			this.isChecked = !this.isChecked;
			this.render();
			this.onChange();
			ev.preventDefault();
		}, this.listenersToRemove);

		$(this.domNode).on('keydown', (browserEvent: KeyboardEvent) => {
			var keyboardEvent = new keyboard.StandardKeyboardEvent(browserEvent);
			if (keyboardEvent.keyCode === KeyCode.Space || keyboardEvent.keyCode === KeyCode.Enter) {
				this.isChecked = !this.isChecked;
				this.render();
				this.onChange();
				keyboardEvent.preventDefault();
			}
		}, this.listenersToRemove);
	}

	public focus(): void {
		this.domNode.focus();
	}

	private render(): void {
		this.domNode.className = this.className();
	}

	public setChecked(newIsChecked: boolean): void {
		this.isChecked = newIsChecked;
		$(this.domNode).attr('aria-checked', this.isChecked);
		this.render();
	}

	private className(): string {
		return 'custom-checkbox ' + this.actionClassName + ' ' + (this.isChecked ? 'checked' : 'unchecked');
	}

	public width(): number {
		return 2 /*marginleft*/ + 2 /*border*/ + 2 /*padding*/ + 16 /* icon width */;
	}

	public enable(): void {
		this.domNode.tabIndex = 0;
	}

	public disable(): void {
		this.domNode.tabIndex = -1;
	}

	public destroy(): void {
		this.listenersToRemove.forEach((element) => {
			element();
		});
		this.listenersToRemove = [];
	}
}