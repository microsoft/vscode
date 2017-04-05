/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./selectBox';

import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import Event, { Emitter } from 'vs/base/common/event';
import { Widget } from 'vs/base/browser/ui/widget';
import * as dom from 'vs/base/browser/dom';
import * as arrays from 'vs/base/common/arrays';
import { Color } from "vs/base/common/color";

export interface ISelectBoxStyles {
	selectBackground?: Color;
	selectForeground?: Color;
	selectBorder?: Color;
}

export class SelectBox extends Widget {

	private selectElement: HTMLSelectElement;
	private options: string[];
	private selected: number;
	private container: HTMLElement;
	private _onDidSelect: Emitter<string>;
	private toDispose: IDisposable[];
	private selectBackground: Color;
	private selectForeground: Color;
	private selectBorder: Color;

	constructor(options: string[], selected: number, styles?: ISelectBoxStyles) {
		super();

		this.selectElement = document.createElement('select');
		this.selectElement.className = 'select-box';

		this.setOptions(options, selected);
		this.toDispose = [];
		this._onDidSelect = new Emitter<string>();

		if (styles) {
			this.selectBackground = styles.selectBackground;
			this.selectForeground = styles.selectForeground;
			this.selectBorder = styles.selectBorder;
		}

		this.toDispose.push(dom.addStandardDisposableListener(this.selectElement, 'change', (e) => {
			this.selectElement.title = e.target.value;
			this._onDidSelect.fire(e.target.value);
		}));
	}

	public get onDidSelect(): Event<string> {
		return this._onDidSelect.event;
	}

	public setOptions(options: string[], selected?: number, disabled?: number): void {
		if (!this.options || !arrays.equals(this.options, options)) {
			this.options = options;

			this.selectElement.options.length = 0;
			let i = 0;
			this.options.forEach((option) => {
				this.selectElement.add(this.createOption(option, disabled === i++));
			});
		}
		this.select(selected);
	}

	public select(index: number): void {
		if (index >= 0 && index < this.options.length) {
			this.selected = index;
		} else if (this.selected < 0) {
			this.selected = 0;
		}

		this.selectElement.selectedIndex = this.selected;
		this.selectElement.title = this.options[this.selected];
	}

	public focus(): void {
		if (this.selectElement) {
			this.selectElement.focus();
		}
	}

	public blur(): void {
		if (this.selectElement) {
			this.selectElement.blur();
		}
	}

	public render(container: HTMLElement): void {
		this.container = container;
		dom.addClass(container, 'select-container');
		container.appendChild(this.selectElement);
		this.setOptions(this.options, this.selected);

		this._applyStyles();
	}

	public style(styles: ISelectBoxStyles) {
		this.selectBackground = styles.selectBackground;
		this.selectForeground = styles.selectForeground;
		this.selectBorder = styles.selectBorder;

		this._applyStyles();
	}

	protected _applyStyles() {
		if (this.selectElement) {
			const background = this.selectBackground ? this.selectBackground.toString() : null;
			const foreground = this.selectForeground ? this.selectForeground.toString() : null;
			const border = this.selectBorder ? this.selectBorder.toString() : null;

			this.selectElement.style.backgroundColor = background;
			this.selectElement.style.color = foreground;
			this.selectElement.style.borderColor = border;
		}
	}

	private createOption(value: string, disabled?: boolean): HTMLOptionElement {
		let option = document.createElement('option');
		option.value = value;
		option.text = value;
		option.disabled = disabled;

		return option;
	}

	public dispose(): void {
		this.toDispose = dispose(this.toDispose);
		super.dispose();
	}
}