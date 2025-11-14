/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import * as arrays from '../../../common/arrays.js';
import { Emitter, Event } from '../../../common/event.js';
import { KeyCode, KeyCodeUtils } from '../../../common/keyCodes.js';
import { Disposable, DisposableStore, IDisposable } from '../../../common/lifecycle.js';
import { isMacintosh } from '../../../common/platform.js';
import { ScrollbarVisibility } from '../../../common/scrollable.js';
import * as cssJs from '../../cssValue.js';
import * as dom from '../../dom.js';
import * as domStylesheetsJs from '../../domStylesheets.js';
import { DomEmitter } from '../../event.js';
import { StandardKeyboardEvent } from '../../keyboardEvent.js';
import { IRenderedMarkdown, MarkdownActionHandler, renderMarkdown } from '../../markdownRenderer.js';
import { AnchorPosition, IContextViewProvider } from '../contextview/contextview.js';
import type { IManagedHover } from '../hover/hover.js';
import { getBaseLayerHoverDelegate } from '../hover/hoverDelegate2.js';
import { getDefaultHoverDelegate } from '../hover/hoverDelegateFactory.js';
import { IListEvent, IListRenderer, IListVirtualDelegate } from '../list/list.js';
import { List } from '../list/listWidget.js';
import { ISelectBoxDelegate, ISelectBoxOptions, ISelectBoxStyles, ISelectData, ISelectOptionItem } from './selectBox.js';
import './selectBoxCustom.css';


const $ = dom.$;

const SELECT_OPTION_ENTRY_TEMPLATE_ID = 'selectOption.entry.template';

interface ISelectListTemplateData {
	root: HTMLElement;
	text: HTMLElement;
	detail: HTMLElement;
	decoratorRight: HTMLElement;
}

class SelectListRenderer implements IListRenderer<ISelectOptionItem, ISelectListTemplateData> {

	get templateId(): string { return SELECT_OPTION_ENTRY_TEMPLATE_ID; }

	renderTemplate(container: HTMLElement): ISelectListTemplateData {
		const data: ISelectListTemplateData = Object.create(null);
		data.root = container;
		data.text = dom.append(container, $('.option-text'));
		data.detail = dom.append(container, $('.option-detail'));
		data.decoratorRight = dom.append(container, $('.option-decorator-right'));

		return data;
	}

	renderElement(element: ISelectOptionItem, index: number, templateData: ISelectListTemplateData): void {
		const data: ISelectListTemplateData = templateData;

		const text = element.text;
		const detail = element.detail;
		const decoratorRight = element.decoratorRight;

		const isDisabled = element.isDisabled;

		data.text.textContent = text;
		data.detail.textContent = !!detail ? detail : '';
		data.decoratorRight.textContent = !!decoratorRight ? decoratorRight : '';

		// pseudo-select disabled option
		if (isDisabled) {
			data.root.classList.add('option-disabled');
		} else {
			// Make sure we do class removal from prior template rendering
			data.root.classList.remove('option-disabled');
		}
	}

	disposeTemplate(_templateData: ISelectListTemplateData): void {
		// noop
	}
}

export class SelectBoxList extends Disposable implements ISelectBoxDelegate, IListVirtualDelegate<ISelectOptionItem> {

	private static readonly DEFAULT_DROPDOWN_MINIMUM_BOTTOM_MARGIN = 32;
	private static readonly DEFAULT_DROPDOWN_MINIMUM_TOP_MARGIN = 2;
	private static readonly DEFAULT_MINIMUM_VISIBLE_OPTIONS = 3;

	private _isVisible: boolean;
	private selectBoxOptions: ISelectBoxOptions;
	private selectElement: HTMLSelectElement;
	private container?: HTMLElement;
	private options: ISelectOptionItem[] = [];
	private selected: number;
	private readonly _onDidSelect: Emitter<ISelectData>;
	private readonly styles: ISelectBoxStyles;
	private listRenderer!: SelectListRenderer;
	private contextViewProvider!: IContextViewProvider;
	private selectDropDownContainer!: HTMLElement;
	private styleElement!: HTMLStyleElement;
	private selectList!: List<ISelectOptionItem>;
	private selectDropDownListContainer!: HTMLElement;
	private widthControlElement!: HTMLElement;
	private _currentSelection = 0;
	private _dropDownPosition!: AnchorPosition;
	private _hasDetails: boolean = false;
	private selectionDetailsPane!: HTMLElement;
	private readonly _selectionDetailsDisposables = this._register(new DisposableStore());
	private _skipLayout: boolean = false;
	private _cachedMaxDetailsHeight?: number;
	private _hover?: IManagedHover;

	private _sticky: boolean = false; // for dev purposes only

	constructor(options: ISelectOptionItem[], selected: number, contextViewProvider: IContextViewProvider, styles: ISelectBoxStyles, selectBoxOptions?: ISelectBoxOptions) {

		super();
		this._isVisible = false;
		this.styles = styles;

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

		if (typeof this.selectBoxOptions.ariaDescription === 'string') {
			this.selectElement.setAttribute('aria-description', this.selectBoxOptions.ariaDescription);
		}

		this._onDidSelect = new Emitter<ISelectData>();
		this._register(this._onDidSelect);

		this.registerListeners();
		this.constructSelectDropDown(contextViewProvider);

		this.selected = selected || 0;

		if (options) {
			this.setOptions(options, selected);
		}

		this.initStyleSheet();

	}

	private setTitle(title: string): void {
		if (!this._hover && title) {
			this._hover = this._register(getBaseLayerHoverDelegate().setupManagedHover(getDefaultHoverDelegate('mouse'), this.selectElement, title));
		} else if (this._hover) {
			this._hover.update(title);
		}
	}

	// IDelegate - List renderer

	getHeight(): number {
		return 22;
	}

	getTemplateId(): string {
		return SELECT_OPTION_ENTRY_TEMPLATE_ID;
	}

	private constructSelectDropDown(contextViewProvider: IContextViewProvider) {

		// SetUp ContextView container to hold select Dropdown
		this.contextViewProvider = contextViewProvider;
		this.selectDropDownContainer = dom.$('.monaco-select-box-dropdown-container');
		// Use custom CSS vars for padding calculation (shared with parent select)
		this.selectDropDownContainer.classList.add('monaco-select-box-dropdown-padding');

		// Setup container for select option details
		this.selectionDetailsPane = dom.append(this.selectDropDownContainer, $('.select-box-details-pane'));

		// Create span flex box item/div we can measure and control
		const widthControlOuterDiv = dom.append(this.selectDropDownContainer, $('.select-box-dropdown-container-width-control'));
		const widthControlInnerDiv = dom.append(widthControlOuterDiv, $('.width-control-div'));
		this.widthControlElement = document.createElement('span');
		this.widthControlElement.className = 'option-text-width-control';
		dom.append(widthControlInnerDiv, this.widthControlElement);

		// Always default to below position
		this._dropDownPosition = AnchorPosition.BELOW;

		// Inline stylesheet for themes
		this.styleElement = domStylesheetsJs.createStyleSheet(this.selectDropDownContainer);

		// Prevent dragging of dropdown #114329
		this.selectDropDownContainer.setAttribute('draggable', 'true');
		this._register(dom.addDisposableListener(this.selectDropDownContainer, dom.EventType.DRAG_START, (e) => {
			dom.EventHelper.stop(e, true);
		}));
	}

	private registerListeners() {

		// Parent native select keyboard listeners

		this._register(dom.addStandardDisposableListener(this.selectElement, 'change', (e) => {
			this.selected = e.target.selectedIndex;
			this._onDidSelect.fire({
				index: e.target.selectedIndex,
				selected: e.target.value
			});
			if (!!this.options[this.selected] && !!this.options[this.selected].text) {
				this.setTitle(this.options[this.selected].text);
			}
		}));

		// Have to implement both keyboard and mouse controllers to handle disabled options
		// Intercept mouse events to override normal select actions on parents

		this._register(dom.addDisposableListener(this.selectElement, dom.EventType.CLICK, (e) => {
			dom.EventHelper.stop(e);

			if (this._isVisible) {
				this.hideSelectDropDown(true);
			} else {
				this.showSelectDropDown();
			}
		}));

		this._register(dom.addDisposableListener(this.selectElement, dom.EventType.MOUSE_DOWN, (e) => {
			dom.EventHelper.stop(e);
		}));

		// Intercept touch events
		// The following implementation is slightly different from the mouse event handlers above.
		// Use the following helper variable, otherwise the list flickers.
		let listIsVisibleOnTouchStart: boolean;
		this._register(dom.addDisposableListener(this.selectElement, 'touchstart', (e) => {
			listIsVisibleOnTouchStart = this._isVisible;
		}));
		this._register(dom.addDisposableListener(this.selectElement, 'touchend', (e) => {
			dom.EventHelper.stop(e);

			if (listIsVisibleOnTouchStart) {
				this.hideSelectDropDown(true);
			} else {
				this.showSelectDropDown();
			}
		}));

		// Intercept keyboard handling

		this._register(dom.addDisposableListener(this.selectElement, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
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
				dom.EventHelper.stop(e, true);
			}
		}));
	}

	public get onDidSelect(): Event<ISelectData> {
		return this._onDidSelect.event;
	}

	public setOptions(options: ISelectOptionItem[], selected?: number): void {
		if (!arrays.equals(this.options, options)) {
			this.options = options;
			this.selectElement.options.length = 0;
			this._hasDetails = false;
			this._cachedMaxDetailsHeight = undefined;

			this.options.forEach((option, index) => {
				this.selectElement.add(this.createOption(option.text, index, option.isDisabled));
				if (typeof option.description === 'string') {
					this._hasDetails = true;
				}
			});
		}

		if (selected !== undefined) {
			this.select(selected);
			// Set current = selected since this is not necessarily a user exit
			this._currentSelection = this.selected;
		}
	}

	public setEnabled(enable: boolean): void {
		this.selectElement.disabled = !enable;
	}

	private setOptionsList() {

		// Mirror options in drop-down
		// Populate select list for non-native select mode
		this.selectList?.splice(0, this.selectList.length, this.options);
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
		if (!!this.options[this.selected] && !!this.options[this.selected].text) {
			this.setTitle(this.options[this.selected].text);
		}
	}

	public setAriaLabel(label: string): void {
		this.selectBoxOptions.ariaLabel = label;
		this.selectElement.setAttribute('aria-label', this.selectBoxOptions.ariaLabel);
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

	public setFocusable(focusable: boolean): void {
		this.selectElement.tabIndex = focusable ? 0 : -1;
	}

	public render(container: HTMLElement): void {
		this.container = container;
		container.classList.add('select-container');
		container.appendChild(this.selectElement);
		this.styleSelectElement();
	}

	private initStyleSheet(): void {

		const content: string[] = [];

		// Style non-native select mode

		if (this.styles.listFocusBackground) {
			content.push(`.monaco-select-box-dropdown-container > .select-box-dropdown-list-container .monaco-list .monaco-list-row.focused { background-color: ${this.styles.listFocusBackground} !important; }`);
		}

		if (this.styles.listFocusForeground) {
			content.push(`.monaco-select-box-dropdown-container > .select-box-dropdown-list-container .monaco-list .monaco-list-row.focused { color: ${this.styles.listFocusForeground} !important; }`);
		}

		if (this.styles.decoratorRightForeground) {
			content.push(`.monaco-select-box-dropdown-container > .select-box-dropdown-list-container .monaco-list .monaco-list-row:not(.focused) .option-decorator-right { color: ${this.styles.decoratorRightForeground}; }`);
		}

		if (this.styles.selectBackground && this.styles.selectBorder && this.styles.selectBorder !== this.styles.selectBackground) {
			content.push(`.monaco-select-box-dropdown-container { border: 1px solid ${this.styles.selectBorder} } `);
			content.push(`.monaco-select-box-dropdown-container > .select-box-details-pane.border-top { border-top: 1px solid ${this.styles.selectBorder} } `);
			content.push(`.monaco-select-box-dropdown-container > .select-box-details-pane.border-bottom { border-bottom: 1px solid ${this.styles.selectBorder} } `);

		}
		else if (this.styles.selectListBorder) {
			content.push(`.monaco-select-box-dropdown-container > .select-box-details-pane.border-top { border-top: 1px solid ${this.styles.selectListBorder} } `);
			content.push(`.monaco-select-box-dropdown-container > .select-box-details-pane.border-bottom { border-bottom: 1px solid ${this.styles.selectListBorder} } `);
		}

		// Hover foreground - ignore for disabled options
		if (this.styles.listHoverForeground) {
			content.push(`.monaco-select-box-dropdown-container > .select-box-dropdown-list-container .monaco-list .monaco-list-row:not(.option-disabled):not(.focused):hover { color: ${this.styles.listHoverForeground} !important; }`);
		}

		// Hover background - ignore for disabled options
		if (this.styles.listHoverBackground) {
			content.push(`.monaco-select-box-dropdown-container > .select-box-dropdown-list-container .monaco-list .monaco-list-row:not(.option-disabled):not(.focused):hover { background-color: ${this.styles.listHoverBackground} !important; }`);
		}

		// Match quick input outline styles - ignore for disabled options
		if (this.styles.listFocusOutline) {
			content.push(`.monaco-select-box-dropdown-container > .select-box-dropdown-list-container .monaco-list .monaco-list-row.focused { outline: 1.6px dotted ${this.styles.listFocusOutline} !important; outline-offset: -1.6px !important; }`);
		}

		if (this.styles.listHoverOutline) {
			content.push(`.monaco-select-box-dropdown-container > .select-box-dropdown-list-container .monaco-list .monaco-list-row:not(.option-disabled):not(.focused):hover { outline: 1.6px dashed ${this.styles.listHoverOutline} !important; outline-offset: -1.6px !important; }`);
		}

		// Clear list styles on focus and on hover for disabled options
		content.push(`.monaco-select-box-dropdown-container > .select-box-dropdown-list-container .monaco-list .monaco-list-row.option-disabled.focused { background-color: transparent !important; color: inherit !important; outline: none !important; }`);
		content.push(`.monaco-select-box-dropdown-container > .select-box-dropdown-list-container .monaco-list .monaco-list-row.option-disabled:hover { background-color: transparent !important; color: inherit !important; outline: none !important; }`);

		this.styleElement.textContent = content.join('\n');
	}

	private styleSelectElement(): void {
		const background = this.styles.selectBackground ?? '';
		const foreground = this.styles.selectForeground ?? '';
		const border = this.styles.selectBorder ?? '';

		this.selectElement.style.backgroundColor = background;
		this.selectElement.style.color = foreground;
		this.selectElement.style.borderColor = border;
	}

	private styleList() {
		const background = this.styles.selectBackground ?? '';

		const listBackground = cssJs.asCssValueWithDefault(this.styles.selectListBackground, background);
		this.selectDropDownListContainer.style.backgroundColor = listBackground;
		this.selectionDetailsPane.style.backgroundColor = listBackground;
		const optionsBorder = this.styles.focusBorder ?? '';
		this.selectDropDownContainer.style.outlineColor = optionsBorder;
		this.selectDropDownContainer.style.outlineOffset = '-1px';

		this.selectList.style(this.styles);
	}

	private createOption(value: string, index: number, disabled?: boolean): HTMLOptionElement {
		const option = document.createElement('option');
		option.value = value;
		option.text = value;
		option.disabled = !!disabled;

		return option;
	}

	// ContextView dropdown methods

	private showSelectDropDown() {
		this.selectionDetailsPane.textContent = '';

		if (!this.contextViewProvider || this._isVisible) {
			return;
		}

		// Lazily create and populate list only at open, moved from constructor
		this.createSelectList(this.selectDropDownContainer);
		this.setOptionsList();

		// This allows us to flip the position based on measurement
		// Set drop-down position above/below from required height and margins
		// If pre-layout cannot fit at least one option do not show drop-down

		this.contextViewProvider.showContextView({
			getAnchor: () => this.selectElement,
			render: (container: HTMLElement) => this.renderSelectDropDown(container, true),
			layout: () => {
				this.layoutSelectDropDown();
			},
			onHide: () => {
				this.selectDropDownContainer.classList.remove('visible');
				this.selectElement.classList.remove('synthetic-focus');
			},
			anchorPosition: this._dropDownPosition
		}, this.selectBoxOptions.optionsAsChildren ? this.container : undefined);

		// Hide so we can relay out
		this._isVisible = true;
		this.hideSelectDropDown(false);

		this.contextViewProvider.showContextView({
			getAnchor: () => this.selectElement,
			render: (container: HTMLElement) => this.renderSelectDropDown(container),
			layout: () => this.layoutSelectDropDown(),
			onHide: () => {
				this.selectDropDownContainer.classList.remove('visible');
				this.selectElement.classList.remove('synthetic-focus');
			},
			anchorPosition: this._dropDownPosition
		}, this.selectBoxOptions.optionsAsChildren ? this.container : undefined);

		// Track initial selection the case user escape, blur
		this._currentSelection = this.selected;
		this._isVisible = true;
		this.selectElement.setAttribute('aria-expanded', 'true');
	}

	private hideSelectDropDown(focusSelect: boolean) {
		if (!this.contextViewProvider || !this._isVisible) {
			return;
		}

		this._isVisible = false;
		this.selectElement.setAttribute('aria-expanded', 'false');

		if (focusSelect) {
			this.selectElement.focus();
		}

		this.contextViewProvider.hideContextView();
	}

	private renderSelectDropDown(container: HTMLElement, preLayoutPosition?: boolean): IDisposable {
		container.appendChild(this.selectDropDownContainer);

		// Pre-Layout allows us to change position
		this.layoutSelectDropDown(preLayoutPosition);

		return {
			dispose: () => {
				// contextView will dispose itself if moving from one View to another
				this.selectDropDownContainer.remove(); // remove to take out the CSS rules we add
			}
		};
	}

	// Iterate over detailed descriptions, find max height
	private measureMaxDetailsHeight(): number {
		let maxDetailsPaneHeight = 0;
		this.options.forEach((_option, index) => {
			this.updateDetail(index);

			if (this.selectionDetailsPane.offsetHeight > maxDetailsPaneHeight) {
				maxDetailsPaneHeight = this.selectionDetailsPane.offsetHeight;
			}
		});

		return maxDetailsPaneHeight;
	}

	private layoutSelectDropDown(preLayoutPosition?: boolean): boolean {

		// Avoid recursion from layout called in onListFocus
		if (this._skipLayout) {
			return false;
		}

		// Layout ContextView drop down select list and container
		// Have to manage our vertical overflow, sizing, position below or above
		// Position has to be determined and set prior to contextView instantiation

		if (this.selectList) {

			// Make visible to enable measurements
			this.selectDropDownContainer.classList.add('visible');

			const window = dom.getWindow(this.selectElement);
			const selectPosition = dom.getDomNodePagePosition(this.selectElement);
			const styles = dom.getWindow(this.selectElement).getComputedStyle(this.selectElement);
			const verticalPadding = parseFloat(styles.getPropertyValue('--dropdown-padding-top')) + parseFloat(styles.getPropertyValue('--dropdown-padding-bottom'));
			const maxSelectDropDownHeightBelow = (window.innerHeight - selectPosition.top - selectPosition.height - (this.selectBoxOptions.minBottomMargin || 0));
			const maxSelectDropDownHeightAbove = (selectPosition.top - SelectBoxList.DEFAULT_DROPDOWN_MINIMUM_TOP_MARGIN);

			// Determine optimal width - min(longest option), opt(parent select, excluding margins), max(ContextView controlled)
			const selectWidth = this.selectElement.offsetWidth;
			const selectMinWidth = this.setWidthControlElement(this.widthControlElement);
			const selectOptimalWidth = Math.max(selectMinWidth, Math.round(selectWidth)).toString() + 'px';

			this.selectDropDownContainer.style.width = selectOptimalWidth;

			// Get initial list height and determine space above and below
			this.selectList.getHTMLElement().style.height = '';
			this.selectList.layout();
			let listHeight = this.selectList.contentHeight;

			if (this._hasDetails && this._cachedMaxDetailsHeight === undefined) {
				this._cachedMaxDetailsHeight = this.measureMaxDetailsHeight();
			}
			const maxDetailsPaneHeight = this._hasDetails ? this._cachedMaxDetailsHeight! : 0;

			const minRequiredDropDownHeight = listHeight + verticalPadding + maxDetailsPaneHeight;
			const maxVisibleOptionsBelow = ((Math.floor((maxSelectDropDownHeightBelow - verticalPadding - maxDetailsPaneHeight) / this.getHeight())));
			const maxVisibleOptionsAbove = ((Math.floor((maxSelectDropDownHeightAbove - verticalPadding - maxDetailsPaneHeight) / this.getHeight())));

			// If we are only doing pre-layout check/adjust position only
			// Calculate vertical space available, flip up if insufficient
			// Use reflected padding on parent select, ContextView style
			// properties not available before DOM attachment

			if (preLayoutPosition) {

				// Check if select moved out of viewport , do not open
				// If at least one option cannot be shown, don't open the drop-down or hide/remove if open

				if ((selectPosition.top + selectPosition.height) > (window.innerHeight - 22)
					|| selectPosition.top < SelectBoxList.DEFAULT_DROPDOWN_MINIMUM_TOP_MARGIN
					|| ((maxVisibleOptionsBelow < 1) && (maxVisibleOptionsAbove < 1))) {
					// Indicate we cannot open
					return false;
				}

				// Determine if we have to flip up
				// Always show complete list items - never more than Max available vertical height
				if (maxVisibleOptionsBelow < SelectBoxList.DEFAULT_MINIMUM_VISIBLE_OPTIONS
					&& maxVisibleOptionsAbove > maxVisibleOptionsBelow
					&& this.options.length > maxVisibleOptionsBelow
				) {
					this._dropDownPosition = AnchorPosition.ABOVE;
					this.selectDropDownListContainer.remove();
					this.selectionDetailsPane.remove();
					this.selectDropDownContainer.appendChild(this.selectionDetailsPane);
					this.selectDropDownContainer.appendChild(this.selectDropDownListContainer);

					this.selectionDetailsPane.classList.remove('border-top');
					this.selectionDetailsPane.classList.add('border-bottom');

				} else {
					this._dropDownPosition = AnchorPosition.BELOW;
					this.selectDropDownListContainer.remove();
					this.selectionDetailsPane.remove();
					this.selectDropDownContainer.appendChild(this.selectDropDownListContainer);
					this.selectDropDownContainer.appendChild(this.selectionDetailsPane);

					this.selectionDetailsPane.classList.remove('border-bottom');
					this.selectionDetailsPane.classList.add('border-top');
				}
				// Do full layout on showSelectDropDown only
				return true;
			}

			// Check if select out of viewport or cutting into status bar
			if ((selectPosition.top + selectPosition.height) > (window.innerHeight - 22)
				|| selectPosition.top < SelectBoxList.DEFAULT_DROPDOWN_MINIMUM_TOP_MARGIN
				|| (this._dropDownPosition === AnchorPosition.BELOW && maxVisibleOptionsBelow < 1)
				|| (this._dropDownPosition === AnchorPosition.ABOVE && maxVisibleOptionsAbove < 1)) {
				// Cannot properly layout, close and hide
				this.hideSelectDropDown(true);
				return false;
			}

			// SetUp list dimensions and layout - account for container padding
			// Use position to check above or below available space
			if (this._dropDownPosition === AnchorPosition.BELOW) {
				if (this._isVisible && maxVisibleOptionsBelow + maxVisibleOptionsAbove < 1) {
					// If drop-down is visible, must be doing a DOM re-layout, hide since we don't fit
					// Hide drop-down, hide contextview, focus on parent select
					this.hideSelectDropDown(true);
					return false;
				}

				// Adjust list height to max from select bottom to margin (default/minBottomMargin)
				if (minRequiredDropDownHeight > maxSelectDropDownHeightBelow) {
					listHeight = (maxVisibleOptionsBelow * this.getHeight());
				}
			} else {
				if (minRequiredDropDownHeight > maxSelectDropDownHeightAbove) {
					listHeight = (maxVisibleOptionsAbove * this.getHeight());
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

			if (this._hasDetails) {
				// Leave the selectDropDownContainer to size itself according to children (list + details) - #57447
				this.selectList.getHTMLElement().style.height = (listHeight + verticalPadding) + 'px';
				this.selectDropDownContainer.style.height = '';
			} else {
				this.selectDropDownContainer.style.height = (listHeight + verticalPadding) + 'px';
			}

			this.updateDetail(this.selected);

			this.selectDropDownContainer.style.width = selectOptimalWidth;

			// Maintain focus outline on parent select as well as list container - tabindex for focus
			this.selectDropDownListContainer.setAttribute('tabindex', '0');
			this.selectElement.classList.add('synthetic-focus');
			this.selectDropDownContainer.classList.add('synthetic-focus');

			return true;
		} else {
			return false;
		}
	}

	private setWidthControlElement(container: HTMLElement): number {
		let elementWidth = 0;

		if (container) {
			let longest = 0;
			let longestLength = 0;

			this.options.forEach((option, index) => {
				const detailLength = !!option.detail ? option.detail.length : 0;
				const rightDecoratorLength = !!option.decoratorRight ? option.decoratorRight.length : 0;

				const len = option.text.length + detailLength + rightDecoratorLength;
				if (len > longestLength) {
					longest = index;
					longestLength = len;
				}
			});


			container.textContent = this.options[longest].text + (!!this.options[longest].decoratorRight ? (this.options[longest].decoratorRight + ' ') : '');
			elementWidth = dom.getTotalWidth(container);
		}

		return elementWidth;
	}

	private createSelectList(parent: HTMLElement): void {

		// If we have already constructive list on open, skip
		if (this.selectList) {
			return;
		}

		// SetUp container for list
		this.selectDropDownListContainer = dom.append(parent, $('.select-box-dropdown-list-container'));

		this.listRenderer = new SelectListRenderer();

		this.selectList = this._register(new List('SelectBoxCustom', this.selectDropDownListContainer, this, [this.listRenderer], {
			useShadows: false,
			verticalScrollMode: ScrollbarVisibility.Visible,
			keyboardSupport: false,
			mouseSupport: false,
			accessibilityProvider: {
				getAriaLabel: element => {
					let label = element.text;
					if (element.detail) {
						label += `. ${element.detail}`;
					}

					if (element.decoratorRight) {
						label += `. ${element.decoratorRight}`;
					}

					if (element.description) {
						label += `. ${element.description}`;
					}

					return label;
				},
				getWidgetAriaLabel: () => localize({ key: 'selectBox', comment: ['Behave like native select dropdown element.'] }, "Select Box"),
				getRole: () => isMacintosh ? '' : 'option',
				getWidgetRole: () => 'listbox'
			}
		}));
		if (this.selectBoxOptions.ariaLabel) {
			this.selectList.ariaLabel = this.selectBoxOptions.ariaLabel;
		}

		// SetUp list keyboard controller - control navigation, disabled items, focus
		const onKeyDown = this._register(new DomEmitter(this.selectDropDownListContainer, 'keydown'));
		const onSelectDropDownKeyDown = Event.chain(onKeyDown.event, $ =>
			$.filter(() => this.selectList.length > 0)
				.map(e => new StandardKeyboardEvent(e))
		);

		this._register(Event.chain(onSelectDropDownKeyDown, $ => $.filter(e => e.keyCode === KeyCode.Enter))(this.onEnter, this));
		this._register(Event.chain(onSelectDropDownKeyDown, $ => $.filter(e => e.keyCode === KeyCode.Tab))(this.onEnter, this)); // Tab should behave the same as enter, #79339
		this._register(Event.chain(onSelectDropDownKeyDown, $ => $.filter(e => e.keyCode === KeyCode.Escape))(this.onEscape, this));
		this._register(Event.chain(onSelectDropDownKeyDown, $ => $.filter(e => e.keyCode === KeyCode.UpArrow))(this.onUpArrow, this));
		this._register(Event.chain(onSelectDropDownKeyDown, $ => $.filter(e => e.keyCode === KeyCode.DownArrow))(this.onDownArrow, this));
		this._register(Event.chain(onSelectDropDownKeyDown, $ => $.filter(e => e.keyCode === KeyCode.PageDown))(this.onPageDown, this));
		this._register(Event.chain(onSelectDropDownKeyDown, $ => $.filter(e => e.keyCode === KeyCode.PageUp))(this.onPageUp, this));
		this._register(Event.chain(onSelectDropDownKeyDown, $ => $.filter(e => e.keyCode === KeyCode.Home))(this.onHome, this));
		this._register(Event.chain(onSelectDropDownKeyDown, $ => $.filter(e => e.keyCode === KeyCode.End))(this.onEnd, this));
		this._register(Event.chain(onSelectDropDownKeyDown, $ => $.filter(e => (e.keyCode >= KeyCode.Digit0 && e.keyCode <= KeyCode.KeyZ) || (e.keyCode >= KeyCode.Semicolon && e.keyCode <= KeyCode.NumpadDivide)))(this.onCharacter, this));

		// SetUp list mouse controller - control navigation, disabled items, focus
		this._register(dom.addDisposableListener(this.selectList.getHTMLElement(), dom.EventType.POINTER_UP, e => this.onPointerUp(e)));

		this._register(this.selectList.onMouseOver(e => typeof e.index !== 'undefined' && this.selectList.setFocus([e.index])));
		this._register(this.selectList.onDidChangeFocus(e => this.onListFocus(e)));

		this._register(dom.addDisposableListener(this.selectDropDownContainer, dom.EventType.FOCUS_OUT, e => {
			if (!this._isVisible || dom.isAncestor(e.relatedTarget as HTMLElement, this.selectDropDownContainer)) {
				return;
			}
			this.onListBlur();
		}));

		this.selectList.getHTMLElement().setAttribute('aria-label', this.selectBoxOptions.ariaLabel || '');
		this.selectList.getHTMLElement().setAttribute('aria-expanded', 'true');

		this.styleList();
	}

	// List methods

	// List mouse controller - active exit, select option, fire onDidSelect if change, return focus to parent select
	// Also takes in touchend events
	private onPointerUp(e: PointerEvent): void {

		if (!this.selectList.length) {
			return;
		}

		dom.EventHelper.stop(e);

		const target = <Element>e.target;
		if (!target) {
			return;
		}

		// Check our mouse event is on an option (not scrollbar)
		if (target.classList.contains('slider')) {
			return;
		}

		const listRowElement = target.closest('.monaco-list-row');

		if (!listRowElement) {
			return;
		}
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
					selected: this.options[this.selected].text

				});
				if (!!this.options[this.selected] && !!this.options[this.selected].text) {
					this.setTitle(this.options[this.selected].text);
				}
			}

			this.hideSelectDropDown(true);
		}
	}

	// List Exit - passive - implicit no selection change, hide drop-down
	private onListBlur(): void {
		if (this._sticky) { return; }
		if (this.selected !== this._currentSelection) {
			// Reset selected to current if no change
			this.select(this._currentSelection);
		}

		this.hideSelectDropDown(false);
	}


	private renderDescriptionMarkdown(text: string, actionHandler?: MarkdownActionHandler): IRenderedMarkdown {
		const cleanRenderedMarkdown = (element: Node) => {
			for (let i = 0; i < element.childNodes.length; i++) {
				const child = <Element>element.childNodes.item(i);

				const tagName = child.tagName && child.tagName.toLowerCase();
				if (tagName === 'img') {
					child.remove();
				} else {
					cleanRenderedMarkdown(child);
				}
			}
		};

		const rendered = renderMarkdown({ value: text, supportThemeIcons: true }, { actionHandler });

		rendered.element.classList.add('select-box-description-markdown');
		cleanRenderedMarkdown(rendered.element);

		return rendered;
	}

	// List Focus Change - passive - update details pane with newly focused element's data
	private onListFocus(e: IListEvent<ISelectOptionItem>) {
		// Skip during initial layout
		if (!this._isVisible || !this._hasDetails) {
			return;
		}

		this.updateDetail(e.indexes[0]);
	}

	private updateDetail(selectedIndex: number): void {
		// Reset
		this._selectionDetailsDisposables.clear();
		this.selectionDetailsPane.textContent = '';

		const option = this.options[selectedIndex];
		const description = option?.description ?? '';
		const descriptionIsMarkdown = option?.descriptionIsMarkdown ?? false;

		if (description) {
			if (descriptionIsMarkdown) {
				const actionHandler = option.descriptionMarkdownActionHandler;
				const result = this._selectionDetailsDisposables.add(this.renderDescriptionMarkdown(description, actionHandler));
				this.selectionDetailsPane.appendChild(result.element);
			} else {
				this.selectionDetailsPane.textContent = description;
			}
			this.selectionDetailsPane.style.display = 'block';
		} else {
			this.selectionDetailsPane.style.display = 'none';
		}

		// Avoid recursion
		this._skipLayout = true;
		this.contextViewProvider.layout();
		this._skipLayout = false;
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
				selected: this.options[this.selected].text
			});
			if (!!this.options[this.selected] && !!this.options[this.selected].text) {
				this.setTitle(this.options[this.selected].text);
			}
		}

		this.hideSelectDropDown(true);
	}

	// List navigation - have to handle a disabled option (jump over)
	private onDownArrow(e: StandardKeyboardEvent): void {
		if (this.selected < this.options.length - 1) {
			dom.EventHelper.stop(e, true);

			// Skip disabled options
			const nextOptionDisabled = this.options[this.selected + 1].isDisabled;

			if (nextOptionDisabled && this.options.length > this.selected + 2) {
				this.selected += 2;
			} else if (nextOptionDisabled) {
				return;
			} else {
				this.selected++;
			}

			// Set focus/selection - only fire event when closing drop-down or on blur
			this.select(this.selected);
			this.selectList.setFocus([this.selected]);
			this.selectList.reveal(this.selectList.getFocus()[0]);
		}
	}

	private onUpArrow(e: StandardKeyboardEvent): void {
		if (this.selected > 0) {
			dom.EventHelper.stop(e, true);
			// Skip disabled options
			const previousOptionDisabled = this.options[this.selected - 1].isDisabled;
			if (previousOptionDisabled && this.selected > 1) {
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
			if (this.options[this.selected].isDisabled && this.selected < this.options.length - 1) {
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
			if (this.options[this.selected].isDisabled && this.selected > 0) {
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
		if (this.options[this.selected].isDisabled && this.selected > 1) {
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
		if (this.options[this.selected].isDisabled && this.selected > 1) {
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
			if (this.options[optionIndex].text.charAt(0).toUpperCase() === ch && !this.options[optionIndex].isDisabled) {
				this.select(optionIndex);
				this.selectList.setFocus([optionIndex]);
				this.selectList.reveal(this.selectList.getFocus()[0]);
				dom.EventHelper.stop(e);
				break;
			}
		}
	}

	public override dispose(): void {
		this.hideSelectDropDown(false);
		super.dispose();
	}
}
