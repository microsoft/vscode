/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../dom.js';
import { EventType, Gesture } from '../../touch.js';
import { ISelectBoxDelegate, ISelectBoxOptions, ISelectBoxStyles, ISelectData, ISelectOptionItem } from './selectBox.js';
import * as arrays from '../../../common/arrays.js';
import { Emitter, Event } from '../../../common/event.js';
import { KeyCode } from '../../../common/keyCodes.js';
import { Disposable } from '../../../common/lifecycle.js';
import { isMacintosh } from '../../../common/platform.js';

export class SelectBoxNative extends Disposable implements ISelectBoxDelegate {

	private selectElement: HTMLSelectElement;
	private selectBoxOptions: ISelectBoxOptions;
	private options: ISelectOptionItem[];
	private selected = 0;
	private readonly _onDidSelect: Emitter<ISelectData>;
	private styles: ISelectBoxStyles;

	constructor(options: ISelectOptionItem[], selected: number, styles: ISelectBoxStyles, selectBoxOptions?: ISelectBoxOptions) {
		super();
		this.selectBoxOptions = selectBoxOptions || Object.create(null);

		this.options = [];

		this.selectElement = document.createElement('select');

		this.selectElement.className = 'monaco-select-box';

		if (typeof this.selectBoxOptions.ariaLabel === 'string') {
			this.selectElement.setAttribute('aria-label', this.selectBoxOptions.ariaLabel);
		}

		if (typeof this.selectBoxOptions.ariaDescription === 'string') {
			this.selectElement.setAttribute('aria-description', this.selectBoxOptions.ariaDescription);
		}

		this._onDidSelect = this._register(new Emitter<ISelectData>());

		this.styles = styles;

		this.registerListeners();
		this.setOptions(options, selected);
	}

	private registerListeners() {
		this._register(Gesture.addTarget(this.selectElement));
		[EventType.Tap].forEach(eventType => {
			this._register(dom.addDisposableListener(this.selectElement, eventType, (e) => {
				this.selectElement.focus();
			}));
		});

		this._register(dom.addStandardDisposableListener(this.selectElement, 'click', (e) => {
			dom.EventHelper.stop(e, true);
		}));

		this._register(dom.addStandardDisposableListener(this.selectElement, 'change', (e) => {
			this.selectElement.title = e.target.value;
			this._onDidSelect.fire({
				index: e.target.selectedIndex,
				selected: e.target.value
			});
		}));

		this._register(dom.addStandardDisposableListener(this.selectElement, 'keydown', (e) => {
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

	public setOptions(options: ISelectOptionItem[], selected?: number): void {

		if (!this.options || !arrays.equals(this.options, options)) {
			this.options = options;
			this.selectElement.options.length = 0;

			this.options.forEach((option, index) => {
				this.selectElement.add(this.createOption(option.text, index, option.isDisabled));
			});

		}

		if (selected !== undefined) {
			this.select(selected);
		}
	}

	public select(index: number): void {
		if (this.options.length === 0) {
			this.selected = 0;
		} else if (index >= 0 && index < this.options.length) {
			this.selected = index;
		} else if (index > this.options.length - 1) {
			// Adjust index to end of list
			// This could make client out of sync with the select
			this.select(this.options.length - 1);
		} else if (this.selected < 0) {
			this.selected = 0;
		}

		this.selectElement.selectedIndex = this.selected;
		if ((this.selected < this.options.length) && typeof this.options[this.selected].text === 'string') {
			this.selectElement.title = this.options[this.selected].text;
		} else {
			this.selectElement.title = '';
		}
	}

	public setAriaLabel(label: string): void {
		this.selectBoxOptions.ariaLabel = label;
		this.selectElement.setAttribute('aria-label', label);
	}

	public focus(): void {
		if (this.selectElement) {
			this.selectElement.tabIndex = 0;
			this.selectElement.focus();
		}
	}

	public blur(): void {
		if (this.selectElement) {
			this.selectElement.tabIndex = -1;
			this.selectElement.blur();
		}
	}

	public setEnabled(enable: boolean): void {
		this.selectElement.disabled = !enable;
	}

	public setFocusable(focusable: boolean): void {
		this.selectElement.tabIndex = focusable ? 0 : -1;
	}

	public render(container: HTMLElement): void {
		container.classList.add('select-container');
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
			this.selectElement.style.backgroundColor = this.styles.selectBackground ?? '';
			this.selectElement.style.color = this.styles.selectForeground ?? '';
			this.selectElement.style.borderColor = this.styles.selectBorder ?? '';
		}

	}

	private createOption(value: string, index: number, disabled?: boolean): HTMLOptionElement {
		const option = document.createElement('option');
		option.value = value;
		option.text = value;
		option.disabled = !!disabled;

		return option;
	}
}
