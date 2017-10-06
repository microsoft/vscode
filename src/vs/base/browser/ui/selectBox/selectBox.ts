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
	selectOptionCheckedBackground: Color.fromHex('#000080'),
	selectOptionHoverBackground: Color.fromHex('#2A2D2E'),
	selectOptionCheckedOutline: Color.fromHex('#b09800'),
	selectOptionHoverOutline: Color.fromHex('#b09800')
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

	// cleidigh
	private styles: ISelectBoxStyles;

	// private selectBackground: Color;
	// private selectForeground: Color;
	// private selectBorder: Color;
	// private selectOptionCheckedBackground: Color;
	// private selectOptionCheckedForeground: Color;
	// private selectOptionHoverBackground: Color;
	private selectDropDownContainer: HTMLElement;
	private selectDropDownElement: HTMLSelectElement;
	private styleElement: HTMLStyleElement;
	private selectElementPosition: IDomNodePagePosition;
	private selectDropDownMouseSelect: boolean;

	constructor(options: string[], selected: number, styles: ISelectBoxStyles = clone(defaultStyles)) {
		super();

		this.selectElement = document.createElement('select');
		this.selectElement.className = 'select-box';

		this.selectElementPosition = null;

		// Create fixed div for child dropdown - toggle visibility
		this.selectDropDownContainer = dom.$('.select-box-dropdown-div');
		this.selectDropDownElement = document.createElement('select');
		this.selectDropDownElement.className = 'select-box-dropdown';
		this.selectDropDownMouseSelect = false;

		this.styleElement = dom.createStyleSheet(this.selectDropDownContainer);

		this.setOptions(options, selected);
		this.toDispose = [];
		this._onDidSelect = new Emitter<ISelectData>();

		// this.styles = options || Object.create(null);
		this.styles = styles;
		mixin(this.styles, defaultStyles, false);

		// this.selectBackground = styles.selectBackground;
		// this.selectForeground = styles.selectForeground;
		// this.selectBorder = styles.selectBorder;

		this.toDispose.push(dom.addStandardDisposableListener(this.selectElement, 'change', (e) => {
			this.selectElement.title = e.target.value;
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

		this.toDispose.push(dom.addDisposableListener(this.selectDropDownElement, dom.EventType.MOUSE_OVER, (e: MouseEvent) => {
			console.debug('mouse over ' + (<HTMLElement>e.target).nodeName);

			// return;

			if ((<HTMLElement>e.target).nodeName === 'OPTION') {
				// (<HTMLElement>e.target).style.boxShadow = `0 0 10px 100px ${this.styles.selectOptionHoverBackground} inset`;

				if (this.styles.selectOptionHoverBackground) {
					(<HTMLElement>e.target).style.boxShadow = `0 0 10px 100px ${this.styles.selectOptionHoverBackground} inset`;
				}
				if (this.styles.selectOptionHoverOutline) {
					console.debug('HoweverOutline');
					(<HTMLElement>e.target).style.boxShadow = `0 0 10px 100px ${this.styles.selectBackground} inset`;
					// (<HTMLElement>e.target).style.boxShadow = `0 0 10px 100px #008000 inset`;
					(<HTMLElement>e.target).style.outlineColor = `${this.styles.selectOptionHoverOutline}`;
					(<HTMLElement>e.target).style.outlineOffset = `-1px`;
					(<HTMLElement>e.target).style.outlineStyle = `dashed`;
					(<HTMLElement>e.target).style.outlineWidth = `2px`;
				}
			}
		}));

		this.toDispose.push(dom.addDisposableListener(this.selectDropDownElement, dom.EventType.MOUSE_OUT, (e: MouseEvent) => {
			console.debug('mouse out');
			// return;
			console.debug((<HTMLElement>e.target).nodeName);

			if ((<HTMLElement>e.target).nodeName === 'OPTION') {
				(<HTMLElement>e.target).style.boxShadow = `0 0 10px 100px ${this.styles.selectBackground} inset`;
				// (<HTMLElement>e.target).style.boxShadow = null;
				(<HTMLElement>e.target).style.outlineStyle = null;
				(<HTMLElement>e.target).style.outlineColor = null;
				(<HTMLElement>e.target).style.outlineOffset = null;
			}
		}));

		this.toDispose.push(dom.addDisposableListener(this.selectDropDownElement, dom.EventType.MOUSE_DOWN, (e: MouseEvent) => {
			if (e.button === 0) {
				this.selectElement.selectedIndex = this.selectDropDownElement.selectedIndex;

				if (this.options.length === 1) {
					this.closeDropDown();
					this._onDidSelect.fire({
						index: this.selectElement.selectedIndex,
						selected: this.selectElement.title
					});

					// this._onDidSelect.fire(this.selectElement.title);
					event.preventDefault();
					event.stopPropagation();
				} else {
					this.selectDropDownMouseSelect = true;
					event.stopPropagation();
				}
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

			if (this.selectDropDownMouseSelect) {
				this.selectDropDownMouseSelect = false;
				this.closeDropDown();

				this._onDidSelect.fire({
					index: this.selectElement.selectedIndex,
					selected: this.selectElement.title
				});

				// this._onDidSelect.fire(this.selectElement.title);
			}
		}));

		this.toDispose.push(dom.addDisposableListener(this.selectDropDownElement, dom.EventType.KEY_UP, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);

			if (event.equals(KeyCode.Tab) || event.equals(KeyCode.Enter) || event.equals(KeyCode.Escape)) {
				this.closeDropDown();
				this._onDidSelect.fire({
					index: this.selectElement.selectedIndex,
					selected: this.selectElement.title
				});

				// this._onDidSelect.fire(this.selectElement.title);
				event.stopPropagation();

				if (event.equals(KeyCode.Escape)) {
					event.stopPropagation();
				}
			}
		}));

		this.toDispose.push(dom.addDisposableListener(this.selectDropDownContainer, dom.EventType.ANIMATION_ITERATION, (e) => {
			this.layoutDropDown(false, true);
		}));

	}


	private closeDropDown() {
		// clone drop-down to parent and hide
		this.selectElement.selectedIndex = this.selectDropDownElement.selectedIndex;
		this.selectElement.title = this.selectDropDownElement.title;
		dom.toggleClass(this.selectDropDownContainer, 'visible', false);
		// dom.toggleClass(this.selectElement, 'border', false);
		dom.toggleClass(this.selectElement, 'synthetic-focus', false);
		this.selectElement.focus();

	}

	private layoutDropDown(repositionOpaque: boolean, makeVisible: boolean) {
		const newSlPos = dom.getDomNodePagePosition(this.selectElement);

		// console.debug('layout');


		this.selectDropDownElement.selectedIndex = this.selectElement.selectedIndex;
		this.selectDropDownElement.title = this.selectElement.title;


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

			// this.selectDropDownContainer.style.width = '250px';
			// this.selectDropDownElement.style.overflow = 'none';

			if (repositionOpaque) {
				this.selectDropDownContainer.style.opacity = '1';
			}
		};

		// this.selectDropDownContainer.style.width = '200px';
		// this.selectDropDownContainer.style.height = '250px';
		// this.selectDropDownContainer.style.backgroundColor = '#909800';
		this.selectDropDownElement.style.overflowY = 'hidden';

		this.selectDropDownElement.setAttribute('size', (this.options.length).toString());
		if (this.options.length === 1) {
			// console.debug('SingleOption');
			dom.toggleClass(this.selectDropDownElement, 'select-box-dropdown-single-option', true);
			if (process.platform === 'darwin') {
				this.selectDropDownElement.setAttribute('size', '2');
			}
			this.selectDropDownElement.setAttribute('size', '2');
		} else {
			dom.toggleClass(this.selectDropDownElement, 'select-box-dropdown-single-option', false);
		}

		if (makeVisible) {
			dom.toggleClass(this.selectDropDownContainer, 'visible', true);
			// dom.toggleClass(this.selectElement, 'border', true);
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
				this.selectElement.add(this.createOption(option, disabled === i));
				this.selectDropDownElement.add(this.createOption(option, disabled === i++));
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
		this.selectDropDownElement.selectedIndex = this.selected;
		this.selectDropDownElement.title = this.options[this.selected];
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
		console.debug('Render');
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

		// this.selectBackground = styles.selectBackground;
		// this.selectForeground = styles.selectForeground;
		// this.selectForeground = styles.selectForeground;
		// this.selectBorder = styles.selectBorder;


		// this.styles.selectOptionCheckedBackground = defaultStyles.selectOptionCheckedBackground;
		// if (this.styles.selectOptionCheckedBackground === null) {
		// 	console.debug('UseDefaultCheckedBackground');
		// 	this.styles.selectOptionCheckedBackground = Color.fromHex('#000080');
		// }

		// if (this.styles.selectOptionCheckedBackground === null) {
		// 	this.styles.selectOptionHoverBackground = Color.fromHex('#513415');
		// }
		// this.styles.selectOptionCheckedBackground = new Color(new RGBA(0x7c, 0x50, 0x21, 0.7));
		// this.styles.selectOptionHoverBackground = new Color(new RGBA(0x7c, 0x50, 0x21, 0.3));
		// this.styles.selectOptionCheckedForeground = defaultStyles.selectOptionCheckedForeground;
		// this.styles.selectOptionHoverBackground = defaultStyles.selectOptionHoverBackground;
		// content.push(`.monaco-workbench .select-box-dropdown { -webkit-appearance: none; !important; `);

		// const focusBorder2 = Color.fromHex('#800000');
		// const focusBorder2 = this.styles.selectFocusBorder;
		// const pseudoSelectFocus = `.monaco-workbench .select-box.border { border: 1px solid ${focusBorder2} !important; }`;
		// console.debug(pseudoSelectFocus);

		// console.debug('optionCheckedBackground ' + styles.selectOptionCheckedBackground.toString());
		// console.debug('optionHoverBackground ' + styles.selectOptionHoverBackground.toString());

		contentSingleOption.push(`.monaco-workbench .select-box-dropdown-single-option { -webkit-appearance: none; height: 1.5em !important; `);
		// contentSingleOption.push(` border-color: ${this.styles.selectBorder} !important; `);
		// contentSingleOption.push(` border-color: #008000 !important; `);
		contentSingleOption.push(` padding-left: 1px !important; `);
		// contentSingleOption.push(` padding-bottom: 1px !important; `);

		// contentSingleOption.push(` outline-style: dotted !important; `);
		// contentSingleOption.push(` outline-color: ${this.styles.selectOptionCheckedOutline} !important; `);
		// contentSingleOption.push(` outline-offset: -1x !important; `);
		// contentSingleOption.push(` outline-width: 2px !important; `);
		// contentSingleOption.push(` border-style: dotted !important; `);

		// content.push(pseudoSelectFocus);
		// content.push(`.monaco-workbench .select-box-dropdown select:focus { border: none !important; }`);
		// content.push(`.monaco-workbench .select-box.border { border: 1px solid ${this.styles.selectFocusBorder} !important; }`);
		// content.push(`.monaco-workbench .select-box.border { outline: 1px solid ${this.styles.selectFocusBorder} !important; }`);
		// content.push(`.monaco-workbench .select-box.border { border-color: ${this.styles.selectFocusBorder} !important; border-width: 1px; border-top: solid !important; border-bottom: none !important; border-left: solid !important; border-right: solid !important;}`);
		// content.push(`.monaco-workbench .select-box.border { border-color: #800000 !important; border-width: 1px; border-style: solid solid none solid !important;}`);
		// content.push(`.monaco-workbench .select-box.border { border-color: #800000 !important; border-width: 1px; }`);

		// if (this.styles.selectOptionCheckedBackground !== null) {
		if (this.styles.selectOptionCheckedBackground) {
			content.push(`.monaco-workbench .select-box-dropdown option:checked { box-shadow: 0 0 10px 100px ${this.styles.selectOptionCheckedBackground} inset !important;}`);

			// content.push(`.monaco-workbench .select-box-dropdown option:checked { outline: 2px dotted #909800; outline-offset: -1px; }`);
			// content.push(`.monaco-workbench .select-box-dropdown option:checked { box-shadow: 0 0 10px 100px ${this.styles.selectBackground} inset !important;}`);

			// content.push(`.monaco-workbench .select-box-dropdown option:not:(checked) { box-shadow: 0 0 10px 100px ${this.styles.selectBackground} inset !important;}`);
			console.debug('Background');
			contentSingleOption.push(` background-color: ${this.styles.selectOptionCheckedBackground} !important; `);
		}

		if (this.styles.selectOptionCheckedOutline) {
			// content.push(`.monaco-workbench .select-box-dropdown option:checked { box-shadow: 0 0 10px 100px ${this.styles.selectOptionCheckedBackground} inset !important;}`);
			console.debug('CheckedOutline');
			content.push(`.monaco-workbench .select-box-dropdown option:checked { outline: 2px dotted ${this.styles.selectOptionCheckedOutline}; outline-offset: -1px; }`);
			content.push(`.monaco-workbench .select-box-dropdown option:checked { box-shadow: 0 0 10px 100px ${this.styles.selectBackground} inset !important;}`);

			// content.push(`.monaco-workbench .select-box-dropdown option:not:(checked) { box-shadow: 0 0 10px 100px ${this.styles.selectBackground} inset !important;}`);
			// contentSingleOption.push(`outline: 2px dotted ${this.styles.selectOptionCheckedOutline}; outline-offset: -1px; `);
			// contentSingleOption.push(` background-color: ${this.styles.selectOptionCheckedBackground} !important; `);
		}

		// if (this.styles.selectOptionHoverBackground !== null) {
		// if (this.styles.selectOptionHoverBackground) {

		// console.debug('Hover');
		// content.push(`.monaco-workbench .select-box-dropdown option:hover { box-shadow: 0 0 10px 100px ${this.styles.selectOptionHoverBackground} inset !important; }`);
		// content.push(`.monaco-workbench .select-box-dropdown option:not:(hover) { box-shadow: 0 0 10px 100px ${this.styles.selectBackground} inset !important;}`);
		// content.push(`.monaco-workbench .select-box-dropdown option:hover:checked { box-shadow: 0 0 10px 100px ${this.styles.selectOptionHoverBackground} inset; }`);
		// content.push(`.monaco-workbench .select-box-dropdown-single-option:hover { box-shadow: 0 0 10px 100px ${this.styles.selectOptionHoverBackground} inset !important; background-color: ${this.styles.selectOptionHoverBackground} !important;}`);
		// }

		contentSingleOption.push(` }`);
		// contentSingleOption.push(`.monaco-workbench .select-box-dropdown-single-option option:hover { box-shadow: 0 0 10px 100px ${this.styles.selectOptionHoverBackground} inset !important; background-color: ${styles.selectOptionHoverBackground} !important;}`);

		// contentSingleOption.push(`.monaco-workbench .select-box-dropdown-single-option option:checked { outline: 2px dotted ${this.styles.selectOptionCheckedOutline}; outline-offset: -1px; }`);
		// contentSingleOption.push(`.monaco-workbench .select-box-dropdown-single-option select { outline: 2px dotted ${this.styles.selectOptionCheckedOutline}; outline-offset: -1px; }`);
		content.push(contentSingleOption.join('\n'));
		this.styleElement.innerHTML = content.join('\n');
		this.applyStyles();
	}

	protected applyStyles(): void {
		if (this.selectElement && this.selectDropDownElement) {

			const background = this.styles.selectBackground ? this.styles.selectBackground.toString() : null;
			const foreground = this.styles.selectForeground ? this.styles.selectForeground.toString() : null;
			// const foreground = this.styles.selectForeground ? this.foreground.toString() : null;
			// const foreground = this.styles.foreground ? this.styles.foreground.toString() : null;

			const border = this.styles.selectBorder ? this.styles.selectBorder.toString() : null;
			const border2 = this.styles.selectOptionsBorder ? this.styles.selectOptionsBorder.toString() : null;
			// const border2 = '#800000';
			console.debug(border2);
			this.selectElement.style.backgroundColor = background;
			this.selectElement.style.color = foreground;
			this.selectElement.style.borderColor = border;

			this.selectDropDownElement.style.backgroundColor = background;
			this.selectDropDownElement.style.color = foreground;
			this.selectDropDownElement.style.borderColor = border2;
			this.selectDropDownElement.style.outlineColor = border2;
			this.selectDropDownElement.style.outlineStyle = 'solid';
			this.selectDropDownElement.style.outlineWidth = '1px';

			const options = this.selectDropDownElement.querySelectorAll('option');

			for (var index = 0; index < options.length; index++) {
				var option = options[index];
				option.style.boxShadow = null;
				option.style.outlineStyle = null;
				option.style.outlineColor = null;
				option.style.outlineOffset = null;
			}


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