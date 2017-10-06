/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./selectBox';

import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import Event, { Emitter, chain } from 'vs/base/common/event';
import { KeyCode } from 'vs/base/common/keyCodes';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { Widget } from 'vs/base/browser/ui/widget';
import * as dom from 'vs/base/browser/dom';
import * as arrays from 'vs/base/common/arrays';
import { Color } from 'vs/base/common/color';
import { clone, mixin } from 'vs/base/common/objects';
import { IContextViewProvider } from 'vs/base/browser/ui/contextview/contextview';
import { List, IListStyles } from 'vs/base/browser/ui/list/listWidget';
import { IDelegate, IRenderer, IListEvent } from 'vs/base/browser/ui/list/list';
import { domEvent } from 'vs/base/browser/event';
import { ScrollbarVisibility } from 'vs/base/common/scrollable';

const $ = dom.$;

export const SELECT_OPTION_ENTRY_TEMPLATE_ID = 'selectOption.entry.template';

export interface IListEntry {
	id: string;
	templateId: string;
}

export interface ISelectOptionItem {
	optionText: string;
}

interface ISelectListTemplateData {
	root: HTMLElement;
	optionText: HTMLElement;
	disposables: IDisposable[];
}

// TODO: cleidigh what height?
class Delegate implements IDelegate<ISelectOptionItem> {
	getHeight(): number {
		return 20;
	}

	getTemplateId(): string {
		return SELECT_OPTION_ENTRY_TEMPLATE_ID;
	}
}

class SelectListRenderer implements IRenderer<ISelectOptionItem, ISelectListTemplateData> {

	get templateId(): string { return SELECT_OPTION_ENTRY_TEMPLATE_ID; }

	constructor() { }

	renderTemplate(container: HTMLElement): any {
		const data = <ISelectListTemplateData>Object.create(null);
		data.disposables = [];
		data.root = container;
		data.optionText = dom.append(container, $('.option-text'));

		return data;
	}

	renderElement(element: ISelectOptionItem, index: number, templateData: ISelectListTemplateData): void {
		const data = <ISelectListTemplateData>templateData;
		const optionText = (<ISelectOptionItem>element).optionText;

		data.optionText.textContent = optionText;
	}

	disposeTemplate(templateData: ISelectListTemplateData): void {
		templateData.disposables = dispose(templateData.disposables);
	}

}

export interface ISelectBoxStyles extends IListStyles {
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

	private static SELECT_DROPDOWN_BOTTOM_MARGIN = 10;
	// private static SELECT_DROPDOWN_SIDE_MARGIN = 15;

	private _useNativeSelect: boolean;
	private selectElement: HTMLSelectElement;
	private options: string[];
	private selected: number;
	private disabledOptionIndex: number;
	private container: HTMLElement;
	private _onDidSelect: Emitter<ISelectData>;
	private toDispose: IDisposable[];
	private styles: ISelectBoxStyles;

	private contextViewProvider: IContextViewProvider;
	private selectDropDownContainerWrapper: HTMLElement;
	private selectDropDownContainer: HTMLElement;
	private styleElement: HTMLStyleElement;
	private selectList: List<ISelectOptionItem>;
	private selectDropDownListContainer: HTMLElement;
	private widthControlElement: HTMLElement;
	private widthControDivElement: HTMLElement;

	constructor(options: string[], selected: number, contextViewProvider: IContextViewProvider, styles: ISelectBoxStyles = clone(defaultStyles)) {
		super();

		// Hardcode native select switch based on platform
		switch (process.platform) {
			case 'darwin':
				this._useNativeSelect = true;
				break;
			case 'win32':
			default:
				this._useNativeSelect = false;
				break;
		}

		// this._useNativeSelect = true;
		// this._useNativeSelect = false;

		this.selectElement = document.createElement('select');
		this.selectElement.className = 'select-box';

		this.setOptions(options, selected);
		this.toDispose = [];
		this._onDidSelect = new Emitter<ISelectData>();

		this.styles = styles;
		mixin(this.styles, defaultStyles, false);


		this.registerNativeSelectListeners();

		if (!this._useNativeSelect) {
			this.constructSelectDropDown(contextViewProvider);
			this.registerSelectDropDownListeners();
		}



	}



	private constructSelectDropDown(contextViewProvider: IContextViewProvider) {

		// SetUp ContextView container to hold select Dropdown
		// We have to use a wrapper div to enable CSS file visibility

		this.contextViewProvider = contextViewProvider;

		this.selectDropDownContainerWrapper = dom.$('.select-dropdown-container-wrapper');
		this.selectDropDownContainer = dom.$('.select-dropdown-container');
		dom.append(this.selectDropDownContainerWrapper, this.selectDropDownContainer);

		// Setup list for drop-down select
		this.createSelectList(this.selectDropDownContainer);

		// TODO:cleidigh - find better width control
		let widthControlOuterDiv = dom.append(this.selectDropDownContainer, $('.select-dropdown-container-width-control'));
		let widthControlInnerDiv = dom.append(widthControlOuterDiv, $('.width-control-div'));
		this.widthControlElement = document.createElement('span');
		this.widthControlElement.className = 'option-text-width-control';
		dom.append(widthControlInnerDiv, this.widthControlElement);
		this.widthControDivElement = widthControlInnerDiv;
		// TODO:cleidigh - find better width control

		// InLine stylesheet for themes
		this.styleElement = dom.createStyleSheet(this.selectDropDownContainer);
	}

	private registerNativeSelectListeners() {

		this.toDispose.push(dom.addStandardDisposableListener(this.selectElement, 'change', (e) => {
			this.selectElement.title = e.target.value;
			this._onDidSelect.fire({
				index: e.target.selectedIndex,
				selected: e.target.value
			});
		}));

	}


	private registerSelectDropDownListeners() {


		// Intercept mouse events to override normal select actions

		this.toDispose.push(dom.addDisposableListener(this.selectElement, dom.EventType.CLICK, () => {
			this.showSelectDropDown();
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



		// Intercept keyboard handling

		this.toDispose.push(dom.addDisposableListener(this.selectElement, dom.EventType.KEY_UP, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			event.preventDefault();
			event.stopPropagation();
		}));

		this.toDispose.push(dom.addDisposableListener(this.selectElement, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			// dom.toggleClass(this.selectElement, 'synthetic-focus', false);
			const event = new StandardKeyboardEvent(e);
			let showDropDown = false;

			switch (process.platform) {
				case 'darwin':
					if (event.keyCode === KeyCode.DownArrow || event.keyCode === KeyCode.UpArrow || event.keyCode === KeyCode.Space) {
						showDropDown = true;
					}
					break;
				case 'win32':
				default:
					if (event.keyCode === KeyCode.DownArrow && event.altKey || event.keyCode === KeyCode.Space) {
						showDropDown = true;
					}
					break;
			}

			if (showDropDown) {
				this.showSelectDropDown();
				event.preventDefault();
				event.stopPropagation();
			}
		}));

		this.toDispose.push(dom.addDisposableListener(this.selectElement, dom.EventType.KEY_PRESS, (e: KeyboardEvent) => {
			event.preventDefault();
		}));

	}


	public get onDidSelect(): Event<ISelectData> {
		return this._onDidSelect.event;
	}

	public setOptions(options: string[], selected?: number, disabled?: number): void {
		if (!this.options || !arrays.equals(this.options, options)) {
			this.options = options;

			// Mirror options in drop-down
			this.selectElement.options.length = 0;
			// cleidigh remove
			// this.selectDropDownElement.options.length = 0;
			let i = 0;
			this.options.forEach((option) => {
				this.selectElement.add(this.createOption(option, i, disabled === i++));
				// this.selectDropDownElement.add(this.createOption(option, i, disabled === i++));
			});

			// cleidigh populate select list



			if (this.selectList && !!this.options) {
				let listEntries: ISelectOptionItem[];

				listEntries = [];
				if (disabled !== undefined) {
					this.disabledOptionIndex = disabled;
				}
				this.options.forEach(element => {
					listEntries.push({ optionText: element });
				});

				this.selectList.splice(0, this.selectList.length, listEntries);
			}
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

		this.applyStyles();
	}

	public style(styles: ISelectBoxStyles): void {
		const content: string[] = [];

		this.styles = styles;

		// We can only style non-native select mode
		if (!this._useNativeSelect) {

			if (this.styles.selectOptionCheckedOutline) {
				content.push(`.monaco-workbench .selectbox-dropdown-list-container .monaco-list .monaco-list-row.focused { outline: 2px dotted ${this.styles.selectOptionCheckedOutline}; outline-offset: -1px; }`);
			}

			if (this.styles.selectOptionHoverOutline) {
				content.push(`.monaco-workbench .selectbox-dropdown-list-container .monaco-list .monaco-list-row:hover { outline: 2px dashed ${this.styles.selectOptionCheckedOutline}; outline-offset: -1px; }`);
			}

			this.styleElement.innerHTML = content.join('\n');

		}

		this.applyStyles();
	}

	protected applyStyles(): void {

		if (this.selectElement) {
			const background = this.styles.selectBackground ? this.styles.selectBackground.toString() : null;
			const foreground = this.styles.selectForeground ? this.styles.selectForeground.toString() : null;
			const border = this.styles.selectBorder ? this.styles.selectBorder.toString() : null;

			this.selectElement.style.backgroundColor = background;
			this.selectElement.style.color = foreground;
			this.selectElement.style.borderColor = border;
		}

		if (this.selectList) {
			this.selectList.style({
				listFocusBackground: this.styles.selectOptionCheckedBackground,
				listHoverBackground: this.styles.selectOptionHoverBackground,
				listFocusOutline: this.styles.selectOptionCheckedOutline,
				listHoverOutline: this.styles.selectOptionHoverOutline
			});

			const background = this.styles.selectBackground ? this.styles.selectBackground.toString() : null;
			this.selectDropDownListContainer.style.backgroundColor = background;
			const optionsBorder = this.styles.selectOptionsBorder ? this.styles.selectOptionsBorder.toString() : null;
			this.selectDropDownContainer.style.outlineColor = optionsBorder;
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
		super.dispose();
	}

	private showSelectDropDown() {

		if (!this.contextViewProvider) {
			return;
		}

		this.contextViewProvider.showContextView({
			getAnchor: () => this.selectElement,
			render: (container: HTMLElement) => { return this.renderSelectDropDown(container); },
			layout: () => this.layoutSelectDropDown(),
			onHide: () => {
				dom.toggleClass(this.selectDropDownContainer, 'visible', false);
				dom.toggleClass(this.selectElement, 'synthetic-focus', false);
			}
		});

	}

	private hideSelectDropDown() {
		this.contextViewProvider.hideContextView();
	}

	private renderSelectDropDown(container: HTMLElement) {
		// Add the wrapper container
		this.container.appendChild(this.selectDropDownContainerWrapper);
		this.layoutSelectDropDown();
		return null;
	}

	private layoutSelectDropDown() {

		// Need to be visible to measure
		dom.toggleClass(this.selectDropDownContainer, 'visible', true);

		const selectWidth = dom.getTotalWidth(this.selectElement);
		const selectPosition = dom.getDomNodePagePosition(this.selectElement);


		// TODO:cleidigh - have to figure out ContextView tracking problem
		// const selectDropDownPosition = dom.getDomNodePagePosition(this.selectDropDownContainer);
		// const selectDropDownPositionWrapper = dom.getDomNodePagePosition(this.selectDropDownContainerWrapper);

		// console.debug('Positions');
		// console.debug('S:W ' + selectPosition.left + ' ' + selectDropDownPositionWrapper.left);
		// console.debug('S:D ' + selectPosition.left + ' ' + selectDropDownPosition.left);

		// if (selectPosition.left !== selectDropDownPositionWrapper.left) {
		// 	// const leftDelta = selectDropDownPositionWrapper.left - selectPosition.left;
		// 	// console.debug('Select Wrapper DifferentPosition ' + leftDelta);
		// }


		// Adjust container position - anchors can move like terminal drop-down!
		// if (selectPosition.left !== selectDropDownPosition.left) {
		// const leftDelta = selectDropDownPosition.left - selectPosition.left;
		// console.debug('SelectDifferentPosition ' + leftDelta);

		// Must adjust ContextView wrapper container - use left offset delta
		// this.selectDropDownContainerWrapper.style.left = -leftDelta + 'px';
		// this.selectDropDownContainerWrapper.style.left = selectPosition.left + 'px';
		// }

		// Set container height to max from select bottom to margin above status bar
		const statusBarHeight = dom.getTotalHeight(document.getElementById('workbench.parts.statusbar'));
		const maxSelectDropDownHeight = (window.innerHeight - selectPosition.top - selectPosition.height - statusBarHeight - SelectBox.SELECT_DROPDOWN_BOTTOM_MARGIN);

		// SetUp list dimensions and layout
		if (this.selectList) {
			let listHeight = this.selectList.contentHeight;
			// console.debug('ListHeight ' + listHeight);
			if (listHeight > maxSelectDropDownHeight) {
				listHeight = maxSelectDropDownHeight - 2;
				// console.debug('Adjusted ListHeight ' + listHeight);
			}

			this.cloneElementFont(this.selectElement, this.selectDropDownContainer);
			this.selectList.layout(listHeight);
			this.selectList.domFocus();
			this.selectList.setFocus([this.selected]);
			this.selectDropDownContainer.style.height = listHeight + 6 + 'px';
		}

		const selectMinWidth = this.setWidthControlElement(this.widthControlElement);
		const selectOptimalWidth = Math.max(selectMinWidth, Math.round(selectWidth)).toString() + 'px';
		this.selectDropDownContainer.style.width = selectOptimalWidth;

		// Maintain focus outline on parent select as well as list container
		dom.toggleClass(this.selectElement, 'synthetic-focus', true);
		dom.toggleClass(this.selectDropDownContainer, 'synthetic-focus', true);

		this.selectDropDownListContainer.setAttribute('tabindex', '0');

	}

	private createSelectList(parent: HTMLElement): void {

		// SetUp container for list
		this.selectDropDownListContainer = dom.append(parent, $('.selectbox-dropdown-list-container'));

		let renderer = new SelectListRenderer();

		this.selectList = new List(this.selectDropDownListContainer, new Delegate(), [renderer], {
			useShadows: false,
			selectOnMouseDown: true,
			verticalScrollMode: ScrollbarVisibility.Visible,
			keyboardSupport: false,
		});

		const onSelectDropDownKeyDown = chain(domEvent(this.selectDropDownListContainer, 'keydown'))
			.filter(() => this.selectList.length > 0)
			.map(e => new StandardKeyboardEvent(e));

		onSelectDropDownKeyDown.filter(e => e.keyCode === KeyCode.Enter).on(this.onEnter, this, this.toDispose);
		onSelectDropDownKeyDown.filter(e => e.keyCode === KeyCode.Escape).on(e => this.onEscape(e), this, this.toDispose);
		onSelectDropDownKeyDown.filter(e => e.keyCode === KeyCode.UpArrow).on(this.onUpArrow, this, this.toDispose);
		onSelectDropDownKeyDown.filter(e => e.keyCode === KeyCode.DownArrow).on(this.onDownArrow, this, this.toDispose);

		this.toDispose = [
			this.selectList.onSelectionChange(e => this.onListSelection(e)),
			this.selectList.onDOMBlur(e => this.onListBlur())
		];

	}


	private onListSelection(e: IListEvent<ISelectOptionItem>): void {

		if (e.indexes[0] !== undefined) {
			console.debug(e.elements[0].optionText);
			this.selected = e.indexes[0];
			this.selectElement.selectedIndex = this.selected;
			this.selectList.setFocus([this.selected]);
			this.selectList.reveal(this.selectList.getFocus()[0]);
			this._onDidSelect.fire({
				index: this.selectElement.selectedIndex,
				selected: this.selectElement.title
			});

			this.hideSelectDropDown();
			event.preventDefault();
			event.stopPropagation();
		}
	}

	private onListBlur(): void {
		console.debug('ListBlur');
		this.hideSelectDropDown();
	}


	private setWidthControlElement(container: HTMLElement): number {

		let elementWidth = 0;
		if (container && !!this.options) {
			let longest = 0;

			for (var index = 0; index < this.options.length; index++) {
				// console.debug('options push');
				if (this.options[index].length > this.options[longest].length) {
					longest = index;
				}
			};

			container.innerHTML = this.options[longest];
			this.cloneElementFont(this.selectElement, container);
			elementWidth = dom.getTotalWidth(container);
		}

		return elementWidth;
	}

	public cloneElementFont(source: HTMLElement, target: HTMLElement) {
		var fontSize = window.getComputedStyle(source, null).getPropertyValue('font-size');
		var fontFamily = window.getComputedStyle(source, null).getPropertyValue('font-family');
		target.style.fontFamily = fontFamily;
		target.style.fontSize = fontSize;
	}

	private onEscape(e: StandardKeyboardEvent): void {
		e.preventDefault();
		e.stopPropagation();

		this.hideSelectDropDown();
		this.selectElement.focus();

		this._onDidSelect.fire({
			index: this.selectElement.selectedIndex,
			selected: this.selectElement.title
		});

	}

	private onEnter(e: StandardKeyboardEvent): void {
		e.preventDefault();
		e.stopPropagation();

		this.selectElement.focus();
		this.hideSelectDropDown();
		this._onDidSelect.fire({
			index: this.selectElement.selectedIndex,
			selected: this.selectElement.title
		});
	}

	private onDownArrow(): void {

		if (this.selected < this.options.length - 1) {
			// Skip disabled options
			if ((this.selected + 1) === this.disabledOptionIndex && this.options.length > this.selected + 2) {
				this.selected += 2;
			} else {
				this.selected++;
			}
			this.selectElement.selectedIndex = this.selected;
			this.selectList.setFocus([this.selected]);
			this.selectList.reveal(this.selectList.getFocus()[0]);

		}
	}

	private onUpArrow(): void {

		if (this.selected > 0) {
			// Skip disabled options
			if ((this.selected - 1) === this.disabledOptionIndex && this.selected > 1) {
				this.selected -= 2;
			} else {
				this.selected--;
			}
			this.selectElement.selectedIndex = this.selected;
			this.selectList.setFocus([this.selected]);
			this.selectList.reveal(this.selectList.getFocus()[0]);

		}
	}

}

