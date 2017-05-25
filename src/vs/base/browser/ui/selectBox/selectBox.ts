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
import { clone } from 'vs/base/common/objects';
import { IDomNodePagePosition } from '../../dom';

export interface ISelectBoxStyles {
	selectBackground?: Color;
	selectForeground?: Color;
	selectBorder?: Color;
	selectOptionCheckedBackground?: Color;
	selectOptionCheckedForeground?: Color;
	selectOptionHoverBackground?: Color;
}

const defaultStyles = {
	selectBackground: Color.fromHex('#3C3C3C'),
	selectForeground: Color.fromHex('#F0F0F0'),
	selectBorder: Color.fromHex('#3C3C3C'),
	selectOptionCheckedBackground: Color.fromHex('#0E639C'),
	selectOptionCheckedForeground: Color.fromHex('#ffffff'),
	selectOptionHoverBackground: Color.fromHex('#2A2D2E')
};

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
	private selectOptionCheckedBackground: Color;
	private selectOptionCheckedForeground: Color;
	private selectOptionHoverBackground: Color;
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
		this._onDidSelect = new Emitter<string>();

		this.selectBackground = styles.selectBackground;
		this.selectForeground = styles.selectForeground;
		this.selectBorder = styles.selectBorder;

		this.toDispose.push(dom.addStandardDisposableListener(this.selectElement, 'change', (e) => {
			this.selectElement.title = e.target.value;
			this._onDidSelect.fire(e.target.value);
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
				this.selectElement.selectedIndex = this.selectDropDownElement.selectedIndex;

				if (this.options.length === 1) {
					this.closeDropDown();
					this._onDidSelect.fire(this.selectElement.title);
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
				this._onDidSelect.fire(this.selectElement.title);
			}
		}));

		this.toDispose.push(dom.addDisposableListener(this.selectDropDownElement, dom.EventType.KEY_UP, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);

			if (event.equals(KeyCode.Tab) || event.equals(KeyCode.Enter) || event.equals(KeyCode.Escape)) {
				this.closeDropDown();
				this._onDidSelect.fire(this.selectElement.title);
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
		this.selectElement.focus();
	}

	private layoutDropDown(repositionOpaque: boolean, makeVisible: boolean) {
		const newSlPos = dom.getDomNodePagePosition(this.selectElement);

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

			this.selectDropDownContainer.style.top = (newSlPos.top + newSlPos.height).toString() + 'px';
			this.selectDropDownContainer.style.left = (newSlPos.left).toString() + 'px';
			const selectMinWidth = dom.getTotalWidth(this.selectDropDownElement);
			const selectOptimalWidth = Math.max(selectMinWidth, Math.round(newSlPos.width)).toString() + 'px';
			this.selectDropDownElement.style.width = selectOptimalWidth;

			if (repositionOpaque) {
				this.selectDropDownContainer.style.opacity = '1';
			}
		};

		this.selectDropDownElement.setAttribute('size', (this.options.length).toString());
		if (this.options.length === 1) {
			dom.toggleClass(this.selectDropDownElement, 'select-box-dropdown-single-option', true);
			if (process.platform === 'darwin') {
				this.selectDropDownElement.setAttribute('size', '2');
			}
		} else {
			dom.toggleClass(this.selectDropDownElement, 'select-box-dropdown-single-option', false);
		}

		if (makeVisible) {
			dom.toggleClass(this.selectDropDownContainer, 'visible', true);
		}
	}

	public get onDidSelect(): Event<string> {
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
				this.selectElement.add(this.createOption(option, disabled === i++));
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

		this.selectBackground = styles.selectBackground;
		this.selectForeground = styles.selectForeground;
		this.selectBorder = styles.selectBorder;


		this.selectOptionCheckedBackground = styles.selectOptionCheckedBackground;
		this.selectOptionCheckedForeground = styles.selectOptionCheckedForeground;
		this.selectOptionHoverBackground = styles.selectOptionHoverBackground;

		contentSingleOption.push(`.monaco-workbench .select-box-dropdown-single-option { -webkit-appearance: none; height: 1.5em !important; `);
		contentSingleOption.push(` border-color: ${styles.selectBorder} !important; `);
		contentSingleOption.push(` padding-left: 5px !important; `);

		if (styles.selectOptionCheckedBackground) {
			content.push(`.monaco-workbench .select-box-dropdown option:checked { box-shadow: 0 0 10px 100px ${styles.selectOptionCheckedBackground} inset; }`);
			contentSingleOption.push(` background-color: ${styles.selectOptionCheckedBackground} !important; `);
		}
		if (styles.selectOptionCheckedForeground) {
			content.push(`.monaco-workbench .select-box-dropdown option:checked { color: ${styles.selectOptionCheckedForeground}; }`);
			contentSingleOption.push(` color: ${styles.selectOptionCheckedForeground} !important; `);
		}
		if (styles.selectOptionHoverBackground) {
			content.push(`.monaco-workbench .select-box-dropdown option:hover { box-shadow: 0 0 10px 100px ${styles.selectOptionHoverBackground} inset; }`);
			content.push(`.monaco-workbench .select-box-dropdown-single-option:hover { box-shadow: 0 0 10px 100px ${styles.selectOptionHoverBackground} inset !important; background-color: ${styles.selectOptionHoverBackground} !important;}`);
		}

		contentSingleOption.push(` }`);
		contentSingleOption.push(`.monaco-workbench .select-box-dropdown-single-option option:hover { box-shadow: 0 0 10px 100px ${styles.selectOptionHoverBackground} inset !important; background-color: ${styles.selectOptionHoverBackground} !important;}`);
		content.push(contentSingleOption.join('\n'));
		this.styleElement.innerHTML = content.join('\n');
		this.applyStyles();
	}

	protected applyStyles(): void {
		if (this.selectElement && this.selectDropDownElement) {

			const background = this.selectBackground ? this.selectBackground.toString() : null;
			const foreground = this.selectForeground ? this.selectForeground.toString() : null;
			const border = this.selectBorder ? this.selectBorder.toString() : null;

			this.selectElement.style.backgroundColor = background;
			this.selectElement.style.color = foreground;
			this.selectElement.style.borderColor = border;

			this.selectDropDownElement.style.backgroundColor = background;
			this.selectDropDownElement.style.color = foreground;
			this.selectDropDownElement.style.borderColor = border;
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