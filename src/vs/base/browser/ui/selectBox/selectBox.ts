/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./selectBox';

import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import Event, { Emitter } from 'vs/base/common/event';
import { KeyCode } from 'vs/base/common/keyCodes';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { Widget } from 'vs/base/browser/ui/widget';
import * as dom from 'vs/base/browser/dom';
import * as arrays from 'vs/base/common/arrays';
import { Color } from 'vs/base/common/color';
import { clone, mixin } from 'vs/base/common/objects';
import { IDomNodePagePosition } from '../../dom';


export interface ISelectBoxStyles {
	selectBackground?: Color;
	selectForeground?: Color;
	selectBorder?: Color;
	selectOptionsBorder?: Color;
	selectOptionCheckedBackground?: Color;
	selectOptionHoverBackground?: Color;
	selectOptionCheckedOutline?: Color;
	selectOptionHoverOutline?: Color;

}

export const defaultStyles = {
	selectBackground: Color.fromHex('#3C3C3C'),
	selectForeground: Color.fromHex('#F0F0F0'),
	selectBorder: Color.fromHex('#3C3C3C'),
	selectOptionsBorder: Color.fromHex('#3C3Ca0'),
	selectOptionCheckedBackground: Color.fromHex('#073655'),
	selectOptionHoverBackground: Color.fromHex('#2A2D2E'),
	selectOptionCheckedOutline: Color.fromHex('#F38518'),
	selectOptionHoverOutline: Color.fromHex('#F38518')
};

export interface ISelectData {
	selected: string;
	index: number;
}

export class SelectBox extends Widget {

	private selectElement: HTMLSelectElement;
	private options: string[];
	private selected: number;
	private container: HTMLElement;
	private _onDidSelect: Emitter<ISelectData>;
	private toDispose: IDisposable[];
	private styles: ISelectBoxStyles;
	private selectDropDownContainer: HTMLElement;
	private selectDropDownElement: HTMLSelectElement;
	private styleElement: HTMLStyleElement;
	private selectElementPosition: IDomNodePagePosition;
	// private selectDropDownMouseSelect: boolean;

	constructor(options: string[], selected: number, styles: ISelectBoxStyles = clone(defaultStyles)) {
		super();

		this.selectElement = document.createElement('select');
		this.selectElement.className = 'select-box';

		this.selectElementPosition = null;

		// Create fixed div for child dropdown - toggle visibility
		this.selectDropDownContainer = dom.$('.select-box-dropdown-div');
		this.selectDropDownElement = document.createElement('select');
		this.selectDropDownElement.className = 'select-box-dropdown';
		// this.selectDropDownMouseSelect = false;

		this.styleElement = dom.createStyleSheet(this.selectDropDownContainer);

		this.setOptions(options, selected);
		this.toDispose = [];
		this._onDidSelect = new Emitter<ISelectData>();

		this.styles = styles;
		mixin(this.styles, defaultStyles, false);

		this.toDispose.push(dom.addStandardDisposableListener(this.selectElement, 'change', (e) => {
			this.selectElement.title = e.target.value;
			console.debug(this.selectElement.title);
			this._onDidSelect.fire({
				index: e.target.selectedIndex,
				selected: e.target.value
			});
		}));

		// Intercept mouse events to override normal select actions

		this.toDispose.push(dom.addDisposableListener(this.selectElement, dom.EventType.CLICK, () => {
			this.layoutDropDown(true, true);
			this.selectDropDownElement.focus();
			event.preventDefault();
			event.stopPropagation();
		}));

		this.toDispose.push(dom.addDisposableListener(this.selectElement, dom.EventType.MOUSE_UP, () => {
			event.preventDefault();
			event.stopPropagation();
		}));

		this.toDispose.push(dom.addDisposableListener(this.selectElement, dom.EventType.MOUSE_DOWN, () => {
			event.preventDefault();
			event.stopPropagation();
		}));


		this.toDispose.push(dom.addDisposableListener(this.selectDropDownElement, dom.EventType.MOUSE_DOWN, (e: MouseEvent) => {
			if (e.button === 0) {
				// let options = this.selectDropDownElement.querySelectorAll('option');
				const selectedOption = <HTMLElement>this.selectDropDownElement.querySelector('option.selected');
				dom.toggleClass(selectedOption, 'selected', false);
				// console.debug('Mouseclick' +(<HTMLElement>e.target).outerHTML);
				// console.debug((<HTMLElement>e.target).getAttribute('value'));
				// const optionIndex = this.options.indexOf((<HTMLElement>e.target).getAttribute('value'));
				const optionIndex = Number((<HTMLElement>e.target).getAttribute('optionIndex'));
				// console.debug('OptionIndex '+optionIndex);
				// this.selectElement.selectedIndex = this.selectDropDownElement.selectedIndex;
				this.selectElement.selectedIndex = optionIndex;
				this.selected = optionIndex;

				this.closeDropDown();
				this._onDidSelect.fire({
					index: this.selectElement.selectedIndex,
					selected: this.selectElement.title
				});

				event.preventDefault();
				event.stopPropagation();
			}
		}));

		this.toDispose.push(dom.addDisposableListener(this.selectDropDownElement, dom.EventType.MOUSE_UP, () => {
			event.stopPropagation();
		}));

		this.toDispose.push(dom.addDisposableListener(this.selectDropDownElement, dom.EventType.MOUSE_DOWN, () => {
			event.stopPropagation();
		}));

		// Intercept keyboard handling

		this.toDispose.push(dom.addDisposableListener(this.selectElement, dom.EventType.KEY_UP, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			event.preventDefault();
			event.stopPropagation();
		}));

		this.toDispose.push(dom.addDisposableListener(this.selectElement, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			let showDropDown = false;

			switch (process.platform) {
				case 'darwin':
					if (event.keyCode === KeyCode.DownArrow || event.keyCode === KeyCode.UpArrow) {
						showDropDown = true;
					}
					break;
				case 'win32':
				default:
					if (event.keyCode === KeyCode.DownArrow && event.altKey) {
						showDropDown = true;
					}
					break;
			}

			if (showDropDown) {
				this.layoutDropDown(true, true);
				this.selectDropDownElement.focus();
				event.preventDefault();
				event.stopPropagation();
			}
		}));

		this.toDispose.push(dom.addDisposableListener(this.selectElement, dom.EventType.KEY_PRESS, (e: KeyboardEvent) => {
			event.preventDefault();
		}));

		this.toDispose.push(dom.addStandardDisposableListener(this.selectDropDownElement, 'focusout', e => {
			this.closeDropDown();
		}));

		this.toDispose.push(dom.addStandardDisposableListener(this.selectDropDownElement, 'change', (e) => {
			this.selectElement.title = e.target.value;
			this.selectDropDownElement.title = e.target.value;
			this.selectElement.selectedIndex = this.selectDropDownElement.selectedIndex;

			console.debug('SelectDropDownChange');

			// if (this.selectDropDownMouseSelect) {
			// 	this.selectDropDownMouseSelect = false;
			// 	this.closeDropDown();

			// 	this._onDidSelect.fire({
			// 		index: this.selectElement.selectedIndex,
			// 		selected: this.selectElement.title
			// 	});

			// 	// this._onDidSelect.fire(this.selectElement.title);
			// }
		}));

		this.toDispose.push(dom.addDisposableListener(this.selectDropDownElement, dom.EventType.KEY_UP, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			event.preventDefault();
			event.stopPropagation();
		}));


		this.toDispose.push(dom.addDisposableListener(this.selectDropDownElement, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			const options = this.selectDropDownElement.querySelectorAll('option');

			if (event.equals(KeyCode.Tab) || event.equals(KeyCode.Enter) || event.equals(KeyCode.Escape)) {
				dom.toggleClass(options[this.selected], 'selected', false);
				this.closeDropDown();
				this._onDidSelect.fire({
					index: this.selectElement.selectedIndex,
					selected: this.selectElement.title
				});
			}

			if (event.equals(KeyCode.DownArrow)) {
				if (this.selected < this.options.length - 1) {
					if (options[this.selected + 1].getAttribute('disabled') !== null && this.options.length > this.selected + 2) {
						dom.toggleClass(options[this.selected], 'selected', false);
						this.selected += 2;
					} else {
						dom.toggleClass(options[this.selected], 'selected', false);
						this.selected++;
					}
					this.selectElement.selectedIndex = this.selected;
					dom.toggleClass(options[this.selected], 'selected', true);
				}
			}

			if (event.equals(KeyCode.UpArrow)) {
				if (this.selected > 0) {
					if (options[this.selected - 1].getAttribute('disabled') !== null && this.selected > 1) {
						dom.toggleClass(options[this.selected], 'selected', false);
						this.selected -= 2;
					} else {
						dom.toggleClass(options[this.selected], 'selected', false);
						this.selected--;
					}
					this.selectElement.selectedIndex = this.selected;
					dom.toggleClass(options[this.selected], 'selected', true);
				}
			}

			event.preventDefault();
			event.stopPropagation();
		}));

		this.toDispose.push(dom.addDisposableListener(this.selectDropDownContainer, dom.EventType.ANIMATION_ITERATION, (e) => {
			this.layoutDropDown(false, true);
		}));

	}


	private closeDropDown() {
		// clone drop-down to parent and hide

		this.selectElement.selectedIndex = this.selected;
		dom.toggleClass(this.selectDropDownContainer, 'visible', false);
		dom.toggleClass(this.selectElement, 'synthetic-focus', false);
		this.selectElement.focus();

	}

	private layoutDropDown(repositionOpaque: boolean, makeVisible: boolean) {
		const newSlPos = dom.getDomNodePagePosition(this.selectElement);

		// this.selectDropDownElement.title = this.selectElement.title;

		if (this.selectElementPosition === null ||
			this.selectElementPosition.left !== newSlPos.left ||
			this.selectElementPosition.top !== newSlPos.top ||
			this.selectElementPosition.width !== newSlPos.width ||
			this.selectElementPosition.height !== newSlPos.height
		) {
			this.selectElementPosition = newSlPos;
			if (repositionOpaque) {
				this.selectDropDownContainer.style.opacity = '0';
				dom.toggleClass(this.selectDropDownContainer, 'visible', true);
			}

			this.selectDropDownContainer.style.top = (newSlPos.top + newSlPos.height - 1).toString() + 'px';
			this.selectDropDownContainer.style.left = (newSlPos.left).toString() + 'px';
			const selectMinWidth = dom.getTotalWidth(this.selectDropDownElement) - 2;
			const selectOptimalWidth = Math.max(selectMinWidth, Math.round(newSlPos.width)).toString() + 'px';
			this.selectDropDownElement.style.width = selectOptimalWidth;

			if (repositionOpaque) {
				this.selectDropDownContainer.style.opacity = '1';
			}
		};

		// No scrollbar
		this.selectDropDownElement.style.overflowY = 'hidden';
		// Hide selected option - we self manage to style
		this.selectDropDownElement.selectedIndex = this.options.length;
		const selectSize = (this.options.length * 1.5).toString() + 'em';
		this.selectDropDownElement.setAttribute('size', (this.options.length + 1).toString());
		this.selectDropDownElement.style.height = selectSize;

		// Use class control for pseudo- selection
		const options = this.selectDropDownElement.querySelectorAll('option');
		dom.toggleClass(options[this.selected], 'selected', true);

		// Single option select requires hiding arrow - 'appearance: none'
		if (this.options.length === 1) {
			dom.toggleClass(this.selectDropDownElement, 'select-box-dropdown-single-option', true);
			// if (process.platform === 'darwin') {
			// this.selectDropDownElement.setAttribute('size', '2');
			// }
			this.selectDropDownElement.setAttribute('size', '2');
		} else {
			dom.toggleClass(this.selectDropDownElement, 'select-box-dropdown-single-option', false);
		}

		if (makeVisible) {
			dom.toggleClass(this.selectDropDownContainer, 'visible', true);
			// Use synthetic focus to highlight parent select
			dom.toggleClass(this.selectElement, 'synthetic-focus', true);
		}
	}

	public get onDidSelect(): Event<ISelectData> {
		return this._onDidSelect.event;
	}

	public setOptions(options: string[], selected?: number, disabled?: number): void {
		if (!this.options || !arrays.equals(this.options, options)) {
			this.options = options;

			// Mirror options in drop-down
			this.selectElement.options.length = 0;
			this.selectDropDownElement.options.length = 0;
			let i = 0;
			this.options.forEach((option) => {
				this.selectElement.add(this.createOption(option, i, disabled === i));
				this.selectDropDownElement.add(this.createOption(option, i, disabled === i++));
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

		// this.selectDropDownElement.title = this.options[this.selected];
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
		dom.addClass(container, 'select-container-relative');
		container.appendChild(this.selectElement);
		this.setOptions(this.options, this.selected);
		this.selectDropDownContainer.appendChild(this.selectDropDownElement);
		this.container.appendChild(this.selectDropDownContainer);
		this.applyStyles();
	}

	public style(styles: ISelectBoxStyles): void {
		const content: string[] = [];
		const contentSingleOption: string[] = [];

		this.styles = styles;

		// Single option select styling
		contentSingleOption.push(`.monaco-workbench .select-box-dropdown-single-option { -webkit-appearance: none; height: 1.5em !important; `);
		contentSingleOption.push(` padding-left: 1px !important; `);

		// Style selected background
		if (this.styles.selectOptionCheckedBackground) {
			content.push(`.monaco-workbench .select-box-dropdown option.selected { box-shadow: 0 0 10px 100px ${this.styles.selectOptionCheckedBackground} inset !important;}`);
			contentSingleOption.push(` background-color: ${this.styles.selectOptionCheckedBackground} !important; `);
		}

		if (this.styles.selectOptionCheckedOutline) {
			content.push(`.monaco-workbench .select-box-dropdown option.selected { outline: 2px dotted ${this.styles.selectOptionCheckedOutline}; outline-offset: -1px; }`);
		}

		if (this.styles.selectOptionHoverBackground) {
			content.push(`.monaco-workbench .select-box-dropdown option.enabled:hover { box-shadow: 0 0 10px 100px ${this.styles.selectOptionHoverBackground} inset !important; }`);
		}

		if (this.styles.selectOptionHoverOutline) {
			content.push(`.monaco-workbench .select-box-dropdown option.enabled:hover { outline: 2px dashed ${this.styles.selectOptionCheckedOutline}; outline-offset: -1px; }`);
		}

		contentSingleOption.push(` }`);

		content.push(contentSingleOption.join('\n'));
		this.styleElement.innerHTML = content.join('\n');
		this.applyStyles();
	}

	protected applyStyles(): void {
		if (this.selectElement && this.selectDropDownElement) {

			const background = this.styles.selectBackground ? this.styles.selectBackground.toString() : null;
			const foreground = this.styles.selectForeground ? this.styles.selectForeground.toString() : null;

			const border = this.styles.selectBorder ? this.styles.selectBorder.toString() : null;
			const border2 = this.styles.selectOptionsBorder ? this.styles.selectOptionsBorder.toString() : null;

			this.selectElement.style.backgroundColor = background;
			this.selectElement.style.color = foreground;
			this.selectElement.style.borderColor = border;

			this.selectDropDownElement.style.backgroundColor = background;
			this.selectDropDownElement.style.color = foreground;
			this.selectDropDownElement.style.borderColor = border2;
			this.selectDropDownElement.style.outlineColor = border2;
			this.selectDropDownElement.style.outlineStyle = 'solid';
			this.selectDropDownElement.style.outlineWidth = '1px';
		}
	}

	private createOption(value: string, index: number, disabled?: boolean): HTMLOptionElement {
		let option = document.createElement('option');
		option.value = value;
		option.text = value;
		option.disabled = disabled;
		option.setAttribute('optionIndex', index.toString());
		if (!disabled) {
			dom.toggleClass(option, 'enabled', true);
		}
		return option;
	}

	public dispose(): void {
		this.toDispose = dispose(this.toDispose);
		super.dispose();
	}
}