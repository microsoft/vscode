/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import Event, { Emitter } from 'vs/base/common/event';
import { KeyCode } from 'vs/base/common/keyCodes';
import * as dom from 'vs/base/browser/dom';
import * as arrays from 'vs/base/common/arrays';
import { ISelectBoxDelegate, ISelectBoxStyles, ISelectData } from 'vs/base/browser/ui/selectBox/selectBox';
import { isMacintosh } from 'vs/base/common/platform';

export class SelectBoxNative implements ISelectBoxDelegate {

	private selectElement: HTMLSelectElement;
	private options: string[];
	private selected: number;
	private readonly _onDidSelect: Emitter<ISelectData>;
	private toDispose: IDisposable[];
	private styles: ISelectBoxStyles;

	constructor(options: string[], selected: number, styles: ISelectBoxStyles) {

		this.toDispose = [];

		this.selectElement = document.createElement('select');
		this.selectElement.className = 'monaco-select-box';

		this._onDidSelect = new Emitter<ISelectData>();

		this.styles = styles;

		this.registerListeners();

		this.setOptions(options, selected);
	}

	private registerListeners() {

		this.toDispose.push(dom.addStandardDisposableListener(this.selectElement, 'change', (e) => {
			this.selectElement.title = e.target.value;
			this._onDidSelect.fire({
				index: e.target.selectedIndex,
				selected: e.target.value
			});
		}));

		this.toDispose.push(dom.addStandardDisposableListener(this.selectElement, 'keydown', (e) => {
			let showSelect = false;

			if (isMacintosh) {
				if (e.keyCode === KeyCode.DownArrow || e.keyCode === KeyCode.UpArrow || e.keyCode === KeyCode.Space) {
					showSelect = true;
				}
			} else {
				if (e.keyCode === KeyCode.DownArrow && e.altKey || e.keyCode === KeyCode.Space || e.keyCode === KeyCode.Enter) {
					showSelect = true;
				}
			}

			if (showSelect) {
				// Space, Enter, is used to expand select box, do not propagate it (prevent action bar action run)
				e.stopPropagation();
			}
		}));
	}

	public get onDidSelect(): Event<ISelectData> {
		return this._onDidSelect.event;
	}

	public setOptions(options: string[], selected?: number, disabled?: number): void {

		if (!this.options || !arrays.equals(this.options, options)) {
			this.options = options;
			this.selectElement.options.length = 0;

			let i = 0;
			this.options.forEach((option) => {
				this.selectElement.add(this.createOption(option, i, disabled === i++));
			});

		}

		if (selected !== undefined) {
			this.select(selected);
		}
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
		dom.addClass(container, 'select-container');
		container.appendChild(this.selectElement);
		this.setOptions(this.options, this.selected);
		this.applyStyles();
	}

	public style(styles: ISelectBoxStyles): void {
		this.styles = styles;
		this.applyStyles();
	}

	public applyStyles(): void {

		// Style native select
		if (this.selectElement) {
			const background = this.styles.selectBackground ? this.styles.selectBackground.toString() : null;
			const foreground = this.styles.selectForeground ? this.styles.selectForeground.toString() : null;
			const border = this.styles.selectBorder ? this.styles.selectBorder.toString() : null;

			this.selectElement.style.backgroundColor = background;
			this.selectElement.style.color = foreground;
			this.selectElement.style.borderColor = border;
		}

	}

	private createOption(value: string, index: number, disabled?: boolean): HTMLOptionElement {
		let option = document.createElement('option');
		option.value = value;
		option.text = value;
		option.disabled = disabled;

		return option;
	}

	public dispose(): void {
		this.toDispose = dispose(this.toDispose);
	}
}
