/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./selectBoxCustom';

import * as nls from 'vs/nls';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { Event, Emitter, chain } from 'vs/base/common/event';
import { KeyCode, KeyCodeUtils } from 'vs/base/common/keyCodes';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import * as dom from 'vs/base/browser/dom';
import * as arrays from 'vs/base/common/arrays';
import { IContextViewProvider, AnchorPosition } from 'vs/base/browser/ui/contextview/contextview';
import { List } from 'vs/base/browser/ui/list/listWidget';
import { IVirtualDelegate, IRenderer } from 'vs/base/browser/ui/list/list';
import { domEvent } from 'vs/base/browser/event';
import { ScrollbarVisibility } from 'vs/base/common/scrollable';
import { ISelectBoxDelegate, ISelectBoxOptions, ISelectBoxStyles, ISelectData } from 'vs/base/browser/ui/selectBox/selectBox';
import { isMacintosh } from 'vs/base/common/platform';

const $ = dom.$;

const SELECT_OPTION_ENTRY_TEMPLATE_ID = 'selectOption.entry.template';

export interface ISelectOptionItem {
	optionText: string;
	optionDisabled: boolean;
}

interface ISelectListTemplateData {
	root: HTMLElement;
	optionText: HTMLElement;
	disposables: IDisposable[];
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
		const optionDisabled = (<ISelectOptionItem>element).optionDisabled;

		data.optionText.textContent = optionText;
		data.root.setAttribute('aria-label', nls.localize('selectAriaOption', "{0}", optionText));

		// Workaround for list labels
		data.root.setAttribute('aria-selected', 'true');

		// pseudo-select disabled option
		if (optionDisabled) {
			dom.addClass((<HTMLElement>data.root), 'option-disabled');
		} else {
			// Make sure we do class removal from prior template rendering
			dom.removeClass((<HTMLElement>data.root), 'option-disabled');
		}
	}

	disposeElement(): void {
		// noop
	}

	disposeTemplate(templateData: ISelectListTemplateData): void {
		templateData.disposables = dispose(templateData.disposables);
	}
}

export class SelectBoxList implements ISelectBoxDelegate, IVirtualDelegate<ISelectOptionItem> {

	private static readonly DEFAULT_DROPDOWN_MINIMUM_BOTTOM_MARGIN = 32;
	private static readonly DEFAULT_DROPDOWN_MINIMUM_TOP_MARGIN = 42;
	private static readonly DEFAULT_MINIMUM_VISIBLE_OPTIONS = 3;

	private _isVisible: boolean;
	private selectBoxOptions: ISelectBoxOptions;
	private selectElement: HTMLSelectElement;
	private options: string[];
	private selected: number;
	private disabledOptionIndex: number;
	private readonly _onDidSelect: Emitter<ISelectData>;
	private toDispose: IDisposable[];
	private styles: ISelectBoxStyles;
	private listRenderer: SelectListRenderer;
	private contextViewProvider: IContextViewProvider;
	private selectDropDownContainer: HTMLElement;
	private styleElement: HTMLStyleElement;
	private selectList: List<ISelectOptionItem>;
	private selectDropDownListContainer: HTMLElement;
	private widthControlElement: HTMLElement;
	private _currentSelection: number;
	private _dropDownPosition: AnchorPosition;

	constructor(options: string[], selected: number, contextViewProvider: IContextViewProvider, styles: ISelectBoxStyles, selectBoxOptions?: ISelectBoxOptions) {

		this.toDispose = [];
		this._isVisible = false;
		this.selectBoxOptions = selectBoxOptions || Object.create(null);

		if (typeof this.selectBoxOptions.minBottomMargin !== 'number') {
			this.selectBoxOptions.minBottomMargin = SelectBoxList.DEFAULT_DROPDOWN_MINIMUM_BOTTOM_MARGIN;
		} else if (this.selectBoxOptions.minBottomMargin < 0) {
			this.selectBoxOptions.minBottomMargin = 0;
		}

		this.selectElement = document.createElement('select');
		// Use custom CSS vars for padding calculation
		this.selectElement.className = 'monaco-select-box monaco-select-box-dropdown-padding';

		if (typeof this.selectBoxOptions.ariaLabel === 'string') {
			this.selectElement.setAttribute('aria-label', this.selectBoxOptions.ariaLabel);
		}

		this._onDidSelect = new Emitter<ISelectData>();

		this.styles = styles;

		this.registerListeners();
		this.constructSelectDropDown(contextViewProvider);

		this.setOptions(options, selected);
	}

	// IDelegate - List renderer

	getHeight(): number {
		return 18;
	}

	getTemplateId(): string {
		return SELECT_OPTION_ENTRY_TEMPLATE_ID;
	}

	private constructSelectDropDown(contextViewProvider: IContextViewProvider) {

		// SetUp ContextView container to hold select Dropdown
		this.contextViewProvider = contextViewProvider;
		this.selectDropDownContainer = dom.$('.monaco-select-box-dropdown-container');
		// Use custom CSS vars for padding calculation (shared with parent select)
		dom.addClass(this.selectDropDownContainer, 'monaco-select-box-dropdown-padding');
		// Setup list for drop-down select
		this.createSelectList(this.selectDropDownContainer);

		// Create span flex box item/div we can measure and control
		let widthControlOuterDiv = dom.append(this.selectDropDownContainer, $('.select-box-dropdown-container-width-control'));
		let widthControlInnerDiv = dom.append(widthControlOuterDiv, $('.width-control-div'));
		this.widthControlElement = document.createElement('span');
		this.widthControlElement.className = 'option-text-width-control';
		dom.append(widthControlInnerDiv, this.widthControlElement);

		// Always default to below position
		this._dropDownPosition = AnchorPosition.BELOW;

		// Inline stylesheet for themes
		this.styleElement = dom.createStyleSheet(this.selectDropDownContainer);
	}

	private registerListeners() {

		// Parent native select keyboard listeners

		this.toDispose.push(dom.addStandardDisposableListener(this.selectElement, 'change', (e) => {
			this.selectElement.title = e.target.value;
			this._onDidSelect.fire({
				index: e.target.selectedIndex,
				selected: e.target.value
			});
		}));

		// Have to implement both keyboard and mouse controllers to handle disabled options
		// Intercept mouse events to override normal select actions on parents

		this.toDispose.push(dom.addDisposableListener(this.selectElement, dom.EventType.CLICK, (e) => {
			dom.EventHelper.stop(e);

			if (this._isVisible) {
				this.hideSelectDropDown(true);
			} else {
				this.showSelectDropDown();
			}
		}));

		this.toDispose.push(dom.addDisposableListener(this.selectElement, dom.EventType.MOUSE_DOWN, (e) => {
			dom.EventHelper.stop(e);
		}));

		// Intercept keyboard handling

		this.toDispose.push(dom.addDisposableListener(this.selectElement, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			let showDropDown = false;

			// Create and drop down select list on keyboard select
			if (isMacintosh) {
				if (event.keyCode === KeyCode.DownArrow || event.keyCode === KeyCode.UpArrow || event.keyCode === KeyCode.Space || event.keyCode === KeyCode.Enter) {
					showDropDown = true;
				}
			} else {
				if (event.keyCode === KeyCode.DownArrow && event.altKey || event.keyCode === KeyCode.UpArrow && event.altKey || event.keyCode === KeyCode.Space || event.keyCode === KeyCode.Enter) {
					showDropDown = true;
				}
			}

			if (showDropDown) {
				this.showSelectDropDown();
				dom.EventHelper.stop(e);
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

			// Mirror options in drop-down
			// Populate select list for non-native select mode
			if (this.selectList && !!this.options) {
				let listEntries: ISelectOptionItem[];

				listEntries = [];
				if (disabled !== undefined) {
					this.disabledOptionIndex = disabled;
				}
				for (let index = 0; index < this.options.length; index++) {
					const element = this.options[index];
					let optionDisabled: boolean;
					index === this.disabledOptionIndex ? optionDisabled = true : optionDisabled = false;
					listEntries.push({ optionText: element, optionDisabled: optionDisabled });
				}

				this.selectList.splice(0, this.selectList.length, listEntries);
			}
		}

		if (selected !== undefined) {
			this.select(selected);
			// Set current = selected since this is not necessarily a user exit
			this._currentSelection = this.selected;
		}
	}

	public select(index: number): void {

		if (index >= 0 && index < this.options.length) {
			this.selected = index;
		} else if (index > this.options.length - 1) {
			// Adjust index to end of list
			// This could make client out of sync with the select
			this.select(this.options.length - 1);
		} else if (this.selected < 0) {
			this.selected = 0;
		}

		this.selectElement.selectedIndex = this.selected;
		this.selectElement.title = this.options[this.selected];
	}

	public setAriaLabel(label: string): void {
		this.selectBoxOptions.ariaLabel = label;
		this.selectElement.setAttribute('aria-label', this.selectBoxOptions.ariaLabel);
		this.selectList.getHTMLElement().setAttribute('aria-label', this.selectBoxOptions.ariaLabel);
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

		const content: string[] = [];

		this.styles = styles;

		// Style non-native select mode

		if (this.styles.listFocusBackground) {
			content.push(`.monaco-select-box-dropdown-container > .select-box-dropdown-list-container .monaco-list .monaco-list-row.focused { background-color: ${this.styles.listFocusBackground} !important; }`);
		}

		if (this.styles.listFocusForeground) {
			content.push(`.monaco-select-box-dropdown-container > .select-box-dropdown-list-container .monaco-list .monaco-list-row.focused:not(:hover) { color: ${this.styles.listFocusForeground} !important; }`);
		}

		// Hover foreground - ignore for disabled options
		if (this.styles.listHoverForeground) {
			content.push(`.monaco-select-box-dropdown-container > .select-box-dropdown-list-container .monaco-list .monaco-list-row:hover { color: ${this.styles.listHoverForeground} !important; }`);
			content.push(`.monaco-select-box-dropdown-container > .select-box-dropdown-list-container .monaco-list .monaco-list-row.option-disabled:hover { background-color: ${this.styles.listActiveSelectionForeground} !important; }`);
		}

		// Hover background - ignore for disabled options
		if (this.styles.listHoverBackground) {
			content.push(`.monaco-select-box-dropdown-container > .select-box-dropdown-list-container .monaco-list .monaco-list-row:not(.option-disabled):not(.focused):hover { background-color: ${this.styles.listHoverBackground} !important; }`);
			content.push(`.monaco-select-box-dropdown-container > .select-box-dropdown-list-container .monaco-list .monaco-list-row.option-disabled:hover { background-color: ${this.styles.selectBackground} !important; }`);
		}

		// Match quickOpen outline styles - ignore for disabled options
		if (this.styles.listFocusOutline) {
			content.push(`.monaco-select-box-dropdown-container > .select-box-dropdown-list-container .monaco-list .monaco-list-row.focused { outline: 1.6px dotted ${this.styles.listFocusOutline} !important; outline-offset: -1.6px !important; }`);
		}

		if (this.styles.listHoverOutline) {
			content.push(`.monaco-select-box-dropdown-container > .select-box-dropdown-list-container .monaco-list .monaco-list-row:hover:not(.focused) { outline: 1.6px dashed ${this.styles.listHoverOutline} !important; outline-offset: -1.6px !important; }`);
			content.push(`.monaco-select-box-dropdown-container > .select-box-dropdown-list-container .monaco-list .monaco-list-row.option-disabled:hover { outline: none !important; }`);
		}

		this.styleElement.innerHTML = content.join('\n');

		this.applyStyles();
	}

	public applyStyles(): void {

		// Style parent select

		let background = null;

		if (this.selectElement) {
			background = this.styles.selectBackground ? this.styles.selectBackground.toString() : null;
			const foreground = this.styles.selectForeground ? this.styles.selectForeground.toString() : null;
			const border = this.styles.selectBorder ? this.styles.selectBorder.toString() : null;

			this.selectElement.style.backgroundColor = background;
			this.selectElement.style.color = foreground;
			this.selectElement.style.borderColor = border;
		}

		// Style drop down select list (non-native mode only)

		if (this.selectList) {
			this.selectList.style({});

			let listBackground = this.styles.selectListBackground ? this.styles.selectListBackground.toString() : background;
			this.selectDropDownListContainer.style.backgroundColor = listBackground;
			const optionsBorder = this.styles.focusBorder ? this.styles.focusBorder.toString() : null;
			this.selectDropDownContainer.style.outlineColor = optionsBorder;
			this.selectDropDownContainer.style.outlineOffset = '-1px';
		}
	}

	private createOption(value: string, index: number, disabled?: boolean): HTMLOptionElement {
		let option = document.createElement('option');
		option.value = value;
		option.text = value;
		option.disabled = disabled;

		return option;
	}

	// ContextView dropdown methods

	private showSelectDropDown() {
		if (!this.contextViewProvider || this._isVisible) {
			return;
		}

		// Set drop-down position above/below from required height and margins
		this.layoutSelectDropDown(true);

		this._isVisible = true;
		this.cloneElementFont(this.selectElement, this.selectDropDownContainer);

		this.contextViewProvider.showContextView({
			getAnchor: () => this.selectElement,
			render: (container: HTMLElement) => this.renderSelectDropDown(container),
			layout: () => this.layoutSelectDropDown(),
			onHide: () => {
				dom.toggleClass(this.selectDropDownContainer, 'visible', false);
				dom.toggleClass(this.selectElement, 'synthetic-focus', false);
			},
			anchorPosition: this._dropDownPosition
		});

		// Track initial selection the case user escape, blur
		this._currentSelection = this.selected;
	}

	private hideSelectDropDown(focusSelect: boolean) {
		if (!this.contextViewProvider || !this._isVisible) {
			return;
		}

		this._isVisible = false;

		if (focusSelect) {
			this.selectElement.focus();
		}
		this.contextViewProvider.hideContextView();
	}

	private renderSelectDropDown(container: HTMLElement): IDisposable {
		container.appendChild(this.selectDropDownContainer);

		this.layoutSelectDropDown();
		return {
			dispose: () => {
				// contextView will dispose itself if moving from one View to another
				try {
					container.removeChild(this.selectDropDownContainer); // remove to take out the CSS rules we add
				}
				catch (error) {
					// Ignore, removed already by change of focus
				}
			}
		};
	}

	private layoutSelectDropDown(preLayoutPosition?: boolean) {

		// Layout ContextView drop down select list and container
		// Have to manage our vertical overflow, sizing, position below or above
		// Position has to be determined and set prior to contextView instantiation

		if (this.selectList) {

			const selectPosition = dom.getDomNodePagePosition(this.selectElement);
			const styles = getComputedStyle(this.selectElement);
			const verticalPadding = parseFloat(styles.getPropertyValue('--dropdown-padding-top')) + parseFloat(styles.getPropertyValue('--dropdown-padding-bottom'));
			let maxSelectDropDownHeight = 0;
			maxSelectDropDownHeight = (window.innerHeight - selectPosition.top - selectPosition.height - this.selectBoxOptions.minBottomMargin);

			this.selectList.layout();
			let listHeight = this.selectList.contentHeight;

			// If we are only doing pre-layout check/adjust position only
			// Calculate vertical space available, flip up if insufficient
			// Use reflected padding on parent select, ContextView style properties not available before DOM attachment
			if (preLayoutPosition) {

				// Always show complete list items - never more than Max available vertical height
				if (listHeight + verticalPadding > maxSelectDropDownHeight) {
					const maxVisibleOptions = ((Math.floor((maxSelectDropDownHeight - verticalPadding) / this.getHeight())));

					// Check if we can at least show min items otherwise flip above
					if (maxVisibleOptions < SelectBoxList.DEFAULT_MINIMUM_VISIBLE_OPTIONS) {
						this._dropDownPosition = AnchorPosition.ABOVE;
					} else {
						this._dropDownPosition = AnchorPosition.BELOW;
					}
				}
				// Do full layout on showSelectDropDown only
				return;
			}

			// Make visible to enable measurements
			dom.toggleClass(this.selectDropDownContainer, 'visible', true);

			// SetUp list dimensions and layout - account for container padding
			// Use position to check above or below available space
			if (this._dropDownPosition === AnchorPosition.BELOW) {
				// Set container height to max from select bottom to margin (default/minBottomMargin)
				if (listHeight + verticalPadding > maxSelectDropDownHeight) {
					listHeight = ((Math.floor((maxSelectDropDownHeight - verticalPadding) / this.getHeight())) * this.getHeight());
				}
			} else {
				// Set container height to max from select top to margin (default/minTopMargin)
				maxSelectDropDownHeight = (selectPosition.top - SelectBoxList.DEFAULT_DROPDOWN_MINIMUM_TOP_MARGIN);
				if (listHeight + verticalPadding > maxSelectDropDownHeight) {
					listHeight = ((Math.floor((maxSelectDropDownHeight - SelectBoxList.DEFAULT_DROPDOWN_MINIMUM_TOP_MARGIN) / this.getHeight())) * this.getHeight());
				}
			}

			// Set adjusted list height and relayout
			this.selectList.layout(listHeight);
			this.selectList.domFocus();

			// Finally set focus on selected item
			if (this.selectList.length > 0) {
				this.selectList.setFocus([this.selected || 0]);
				this.selectList.reveal(this.selectList.getFocus()[0] || 0);
			}

			// Set final container height after adjustments
			this.selectDropDownContainer.style.height = (listHeight + verticalPadding) + 'px';

			// Determine optimal width - min(longest option), opt(parent select, excluding margins), max(ContextView controlled)
			const selectWidth = this.selectElement.offsetWidth;
			const selectMinWidth = this.setWidthControlElement(this.widthControlElement);
			const selectOptimalWidth = Math.max(selectMinWidth, Math.round(selectWidth)).toString() + 'px';

			this.selectDropDownContainer.style.width = selectOptimalWidth;

			// Maintain focus outline on parent select as well as list container - tabindex for focus
			this.selectDropDownListContainer.setAttribute('tabindex', '0');
			dom.toggleClass(this.selectElement, 'synthetic-focus', true);
			dom.toggleClass(this.selectDropDownContainer, 'synthetic-focus', true);
		}
	}

	private setWidthControlElement(container: HTMLElement): number {
		let elementWidth = 0;

		if (container && !!this.options) {
			let longest = 0;

			for (let index = 0; index < this.options.length; index++) {
				if (this.options[index].length > this.options[longest].length) {
					longest = index;
				}
			}

			container.innerHTML = this.options[longest];
			elementWidth = dom.getTotalWidth(container);
		}

		return elementWidth;
	}

	private cloneElementFont(source: HTMLElement, target: HTMLElement) {
		const fontSize = window.getComputedStyle(source, null).getPropertyValue('font-size');
		const fontFamily = window.getComputedStyle(source, null).getPropertyValue('font-family');
		target.style.fontFamily = fontFamily;
		target.style.fontSize = fontSize;
	}

	private createSelectList(parent: HTMLElement): void {

		// SetUp container for list
		this.selectDropDownListContainer = dom.append(parent, $('.select-box-dropdown-list-container'));

		this.listRenderer = new SelectListRenderer();

		this.selectList = new List(this.selectDropDownListContainer, this, [this.listRenderer], {
			ariaLabel: this.selectBoxOptions.ariaLabel,
			useShadows: false,
			selectOnMouseDown: false,
			verticalScrollMode: ScrollbarVisibility.Visible,
			keyboardSupport: false,
			mouseSupport: false
		});

		// SetUp list keyboard controller - control navigation, disabled items, focus
		const onSelectDropDownKeyDown = chain(domEvent(this.selectDropDownListContainer, 'keydown'))
			.filter(() => this.selectList.length > 0)
			.map(e => new StandardKeyboardEvent(e));

		onSelectDropDownKeyDown.filter(e => e.keyCode === KeyCode.Enter).on(e => this.onEnter(e), this, this.toDispose);
		onSelectDropDownKeyDown.filter(e => e.keyCode === KeyCode.Escape).on(e => this.onEscape(e), this, this.toDispose);
		onSelectDropDownKeyDown.filter(e => e.keyCode === KeyCode.UpArrow).on(this.onUpArrow, this, this.toDispose);
		onSelectDropDownKeyDown.filter(e => e.keyCode === KeyCode.DownArrow).on(this.onDownArrow, this, this.toDispose);
		onSelectDropDownKeyDown.filter(e => e.keyCode === KeyCode.PageDown).on(this.onPageDown, this, this.toDispose);
		onSelectDropDownKeyDown.filter(e => e.keyCode === KeyCode.PageUp).on(this.onPageUp, this, this.toDispose);
		onSelectDropDownKeyDown.filter(e => e.keyCode === KeyCode.Home).on(this.onHome, this, this.toDispose);
		onSelectDropDownKeyDown.filter(e => e.keyCode === KeyCode.End).on(this.onEnd, this, this.toDispose);
		onSelectDropDownKeyDown.filter(e => (e.keyCode >= KeyCode.KEY_0 && e.keyCode <= KeyCode.KEY_Z) || (e.keyCode >= KeyCode.US_SEMICOLON && e.keyCode <= KeyCode.NUMPAD_DIVIDE)).on(this.onCharacter, this, this.toDispose);

		// SetUp list mouse controller - control navigation, disabled items, focus

		chain(domEvent(this.selectList.getHTMLElement(), 'mouseup'))
			.filter(() => this.selectList.length > 0)
			.on(e => this.onMouseUp(e), this, this.toDispose);

		this.toDispose.push(this.selectList.onDidBlur(e => this.onListBlur()));

		this.selectList.getHTMLElement().setAttribute('aria-expanded', 'true');
	}

	// List methods

	// List mouse controller - active exit, select option, fire onDidSelect if change, return focus to parent select
	private onMouseUp(e: MouseEvent): void {

		dom.EventHelper.stop(e);

		// Check our mouse event is on an option (not scrollbar)
		if (!e.toElement.classList.contains('option-text')) {
			return;
		}

		const listRowElement = e.toElement.parentElement;
		const index = Number(listRowElement.getAttribute('data-index'));
		const disabled = listRowElement.classList.contains('option-disabled');

		// Ignore mouse selection of disabled options
		if (index >= 0 && index < this.options.length && !disabled) {
			this.selected = index;
			this.select(this.selected);

			this.selectList.setFocus([this.selected]);
			this.selectList.reveal(this.selectList.getFocus()[0]);

			// Only fire if selection change
			if (this.selected !== this._currentSelection) {
				// Set current = selected
				this._currentSelection = this.selected;

				this._onDidSelect.fire({
					index: this.selectElement.selectedIndex,
					selected: this.selectElement.title
				});
			}

			this.hideSelectDropDown(true);
		}
	}

	// List Exit - passive - implicit no selection change, hide drop-down
	private onListBlur(): void {

		if (this.selected !== this._currentSelection) {
			// Reset selected to current if no change
			this.select(this._currentSelection);
		}

		this.hideSelectDropDown(false);
	}

	// List keyboard controller

	// List exit - active - hide ContextView dropdown, reset selection, return focus to parent select
	private onEscape(e: StandardKeyboardEvent): void {
		dom.EventHelper.stop(e);

		// Reset selection to value when opened
		this.select(this._currentSelection);
		this.hideSelectDropDown(true);
	}

	// List exit - active - hide ContextView dropdown, return focus to parent select, fire onDidSelect if change
	private onEnter(e: StandardKeyboardEvent): void {
		dom.EventHelper.stop(e);

		// Only fire if selection change
		if (this.selected !== this._currentSelection) {
			this._currentSelection = this.selected;
			this._onDidSelect.fire({
				index: this.selectElement.selectedIndex,
				selected: this.selectElement.title
			});
		}

		this.hideSelectDropDown(true);
	}

	// List navigation - have to handle a disabled option (jump over)
	private onDownArrow(): void {
		if (this.selected < this.options.length - 1) {
			// Skip disabled options
			if ((this.selected + 1) === this.disabledOptionIndex && this.options.length > this.selected + 2) {
				this.selected += 2;
			} else {
				this.selected++;
			}
			// Set focus/selection - only fire event when closing drop-down or on blur
			this.select(this.selected);
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
			// Set focus/selection - only fire event when closing drop-down or on blur
			this.select(this.selected);
			this.selectList.setFocus([this.selected]);
			this.selectList.reveal(this.selectList.getFocus()[0]);
		}
	}

	private onPageUp(e: StandardKeyboardEvent): void {
		dom.EventHelper.stop(e);

		this.selectList.focusPreviousPage();

		// Allow scrolling to settle
		setTimeout(() => {
			this.selected = this.selectList.getFocus()[0];

			// Shift selection down if we land on a disabled option
			if (this.selected === this.disabledOptionIndex && this.selected < this.options.length - 1) {
				this.selected++;
				this.selectList.setFocus([this.selected]);
			}
			this.selectList.reveal(this.selected);
			this.select(this.selected);
		}, 1);
	}

	private onPageDown(e: StandardKeyboardEvent): void {
		dom.EventHelper.stop(e);

		this.selectList.focusNextPage();

		// Allow scrolling to settle
		setTimeout(() => {
			this.selected = this.selectList.getFocus()[0];

			// Shift selection up if we land on a disabled option
			if (this.selected === this.disabledOptionIndex && this.selected > 0) {
				this.selected--;
				this.selectList.setFocus([this.selected]);
			}
			this.selectList.reveal(this.selected);
			this.select(this.selected);
		}, 1);
	}

	private onHome(e: StandardKeyboardEvent): void {
		dom.EventHelper.stop(e);

		if (this.options.length < 2) {
			return;
		}
		this.selected = 0;
		if (this.selected === this.disabledOptionIndex && this.selected > 1) {
			this.selected++;
		}
		this.selectList.setFocus([this.selected]);
		this.selectList.reveal(this.selected);
		this.select(this.selected);
	}

	private onEnd(e: StandardKeyboardEvent): void {
		dom.EventHelper.stop(e);

		if (this.options.length < 2) {
			return;
		}
		this.selected = this.options.length - 1;
		if (this.selected === this.disabledOptionIndex && this.selected > 1) {
			this.selected--;
		}
		this.selectList.setFocus([this.selected]);
		this.selectList.reveal(this.selected);
		this.select(this.selected);
	}

	// Mimic option first character navigation of native select
	private onCharacter(e: StandardKeyboardEvent): void {
		const ch = KeyCodeUtils.toString(e.keyCode);
		let optionIndex = -1;

		for (let i = 0; i < this.options.length - 1; i++) {
			optionIndex = (i + this.selected + 1) % this.options.length;
			if (this.options[optionIndex].charAt(0).toUpperCase() === ch) {
				this.select(optionIndex);
				this.selectList.setFocus([optionIndex]);
				this.selectList.reveal(this.selectList.getFocus()[0]);
				dom.EventHelper.stop(e);
				break;
			}
		}
	}

	public dispose(): void {
		this.hideSelectDropDown(false);
		this.toDispose = dispose(this.toDispose);
	}
}
