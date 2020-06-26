/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { StandardKeyboardEvent, IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { Button } from 'vs/base/browser/ui/button/button';
import { InputBox } from 'vs/base/browser/ui/inputbox/inputBox';
import { IAction } from 'vs/base/common/actions';
import { Color, RGBA } from 'vs/base/common/color';
import { Emitter, Event } from 'vs/base/common/event';
import { KeyCode } from 'vs/base/common/keyCodes';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import 'vs/css!./media/settingsWidgets';
import { localize } from 'vs/nls';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { foreground, inputBackground, inputBorder, inputForeground, listActiveSelectionBackground, listActiveSelectionForeground, listHoverBackground, listHoverForeground, listInactiveSelectionBackground, listInactiveSelectionForeground, registerColor, selectBackground, selectBorder, selectForeground, textLinkForeground, textPreformatForeground, editorWidgetBorder, textLinkActiveForeground, simpleCheckboxBackground, simpleCheckboxForeground, simpleCheckboxBorder } from 'vs/platform/theme/common/colorRegistry';
import { attachButtonStyler, attachInputBoxStyler, attachSelectBoxStyler } from 'vs/platform/theme/common/styler';
import { ICssStyleCollector, IColorTheme, IThemeService, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { disposableTimeout } from 'vs/base/common/async';
import { isUndefinedOrNull } from 'vs/base/common/types';
import { preferencesEditIcon } from 'vs/workbench/contrib/preferences/browser/preferencesWidgets';
import { SelectBox } from 'vs/base/browser/ui/selectBox/selectBox';
import { isIOS } from 'vs/base/common/platform';
import { BrowserFeatures } from 'vs/base/browser/canIUse';

const $ = DOM.$;
export const settingsHeaderForeground = registerColor('settings.headerForeground', { light: '#444444', dark: '#e7e7e7', hc: '#ffffff' }, localize('headerForeground', "The foreground color for a section header or active title."));
export const modifiedItemIndicator = registerColor('settings.modifiedItemIndicator', {
	light: new Color(new RGBA(102, 175, 224)),
	dark: new Color(new RGBA(12, 125, 157)),
	hc: new Color(new RGBA(0, 73, 122))
}, localize('modifiedItemForeground', "The color of the modified setting indicator."));

// Enum control colors
export const settingsSelectBackground = registerColor('settings.dropdownBackground', { dark: selectBackground, light: selectBackground, hc: selectBackground }, localize('settingsDropdownBackground', "Settings editor dropdown background."));
export const settingsSelectForeground = registerColor('settings.dropdownForeground', { dark: selectForeground, light: selectForeground, hc: selectForeground }, localize('settingsDropdownForeground', "Settings editor dropdown foreground."));
export const settingsSelectBorder = registerColor('settings.dropdownBorder', { dark: selectBorder, light: selectBorder, hc: selectBorder }, localize('settingsDropdownBorder', "Settings editor dropdown border."));
export const settingsSelectListBorder = registerColor('settings.dropdownListBorder', { dark: editorWidgetBorder, light: editorWidgetBorder, hc: editorWidgetBorder }, localize('settingsDropdownListBorder', "Settings editor dropdown list border. This surrounds the options and separates the options from the description."));

// Bool control colors
export const settingsCheckboxBackground = registerColor('settings.checkboxBackground', { dark: simpleCheckboxBackground, light: simpleCheckboxBackground, hc: simpleCheckboxBackground }, localize('settingsCheckboxBackground', "Settings editor checkbox background."));
export const settingsCheckboxForeground = registerColor('settings.checkboxForeground', { dark: simpleCheckboxForeground, light: simpleCheckboxForeground, hc: simpleCheckboxForeground }, localize('settingsCheckboxForeground', "Settings editor checkbox foreground."));
export const settingsCheckboxBorder = registerColor('settings.checkboxBorder', { dark: simpleCheckboxBorder, light: simpleCheckboxBorder, hc: simpleCheckboxBorder }, localize('settingsCheckboxBorder', "Settings editor checkbox border."));

// Text control colors
export const settingsTextInputBackground = registerColor('settings.textInputBackground', { dark: inputBackground, light: inputBackground, hc: inputBackground }, localize('textInputBoxBackground', "Settings editor text input box background."));
export const settingsTextInputForeground = registerColor('settings.textInputForeground', { dark: inputForeground, light: inputForeground, hc: inputForeground }, localize('textInputBoxForeground', "Settings editor text input box foreground."));
export const settingsTextInputBorder = registerColor('settings.textInputBorder', { dark: inputBorder, light: inputBorder, hc: inputBorder }, localize('textInputBoxBorder', "Settings editor text input box border."));

// Number control colors
export const settingsNumberInputBackground = registerColor('settings.numberInputBackground', { dark: inputBackground, light: inputBackground, hc: inputBackground }, localize('numberInputBoxBackground', "Settings editor number input box background."));
export const settingsNumberInputForeground = registerColor('settings.numberInputForeground', { dark: inputForeground, light: inputForeground, hc: inputForeground }, localize('numberInputBoxForeground', "Settings editor number input box foreground."));
export const settingsNumberInputBorder = registerColor('settings.numberInputBorder', { dark: inputBorder, light: inputBorder, hc: inputBorder }, localize('numberInputBoxBorder', "Settings editor number input box border."));

registerThemingParticipant((theme: IColorTheme, collector: ICssStyleCollector) => {
	const checkboxBackgroundColor = theme.getColor(settingsCheckboxBackground);
	if (checkboxBackgroundColor) {
		collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item-bool .setting-value-checkbox { background-color: ${checkboxBackgroundColor} !important; }`);
	}

	const checkboxForegroundColor = theme.getColor(settingsCheckboxForeground);
	if (checkboxForegroundColor) {
		collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item-bool .setting-value-checkbox { color: ${checkboxForegroundColor} !important; }`);
	}

	const checkboxBorderColor = theme.getColor(settingsCheckboxBorder);
	if (checkboxBorderColor) {
		collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item-bool .setting-value-checkbox { border-color: ${checkboxBorderColor} !important; }`);
	}

	const link = theme.getColor(textLinkForeground);
	if (link) {
		collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item-contents .setting-item-markdown a { color: ${link}; }`);
		collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item-contents .setting-item-markdown a > code { color: ${link}; }`);
		collector.addRule(`.monaco-select-box-dropdown-container > .select-box-details-pane > .select-box-description-markdown a { color: ${link}; }`);
		collector.addRule(`.monaco-select-box-dropdown-container > .select-box-details-pane > .select-box-description-markdown a > code { color: ${link}; }`);
	}

	const activeLink = theme.getColor(textLinkActiveForeground);
	if (activeLink) {
		collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item-contents .setting-item-markdown a:hover, .settings-editor > .settings-body > .settings-tree-container .setting-item-contents .setting-item-markdown a:active { color: ${activeLink}; }`);
		collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item-contents .setting-item-markdown a:hover > code, .settings-editor > .settings-body > .settings-tree-container .setting-item-contents .setting-item-markdown a:active > code { color: ${activeLink}; }`);
		collector.addRule(`.monaco-select-box-dropdown-container > .select-box-details-pane > .select-box-description-markdown a:hover, .monaco-select-box-dropdown-container > .select-box-details-pane > .select-box-description-markdown a:active { color: ${activeLink}; }`);
		collector.addRule(`.monaco-select-box-dropdown-container > .select-box-details-pane > .select-box-description-markdown a:hover > code, .monaco-select-box-dropdown-container > .select-box-details-pane > .select-box-description-markdown a:active > code { color: ${activeLink}; }`);
	}

	const headerForegroundColor = theme.getColor(settingsHeaderForeground);
	if (headerForegroundColor) {
		collector.addRule(`.settings-editor > .settings-header > .settings-header-controls .settings-tabs-widget .action-label.checked { color: ${headerForegroundColor}; border-bottom-color: ${headerForegroundColor}; }`);
	}

	const foregroundColor = theme.getColor(foreground);
	if (foregroundColor) {
		collector.addRule(`.settings-editor > .settings-header > .settings-header-controls .settings-tabs-widget .action-label { color: ${foregroundColor}; }`);
	}

	// List control
	const listHoverBackgroundColor = theme.getColor(listHoverBackground);
	if (listHoverBackgroundColor) {
		collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item.setting-item-list .setting-list-row:hover { background-color: ${listHoverBackgroundColor}; }`);
	}

	const listHoverForegroundColor = theme.getColor(listHoverForeground);
	if (listHoverForegroundColor) {
		collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item.setting-item-list .setting-list-row:hover { color: ${listHoverForegroundColor}; }`);
	}

	const listSelectBackgroundColor = theme.getColor(listActiveSelectionBackground);
	if (listSelectBackgroundColor) {
		collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item.setting-item-list .setting-list-row.selected:focus { background-color: ${listSelectBackgroundColor}; }`);
	}

	const listInactiveSelectionBackgroundColor = theme.getColor(listInactiveSelectionBackground);
	if (listInactiveSelectionBackgroundColor) {
		collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item.setting-item-list .setting-list-row.selected:not(:focus) { background-color: ${listInactiveSelectionBackgroundColor}; }`);
	}

	const listInactiveSelectionForegroundColor = theme.getColor(listInactiveSelectionForeground);
	if (listInactiveSelectionForegroundColor) {
		collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item.setting-item-list .setting-list-row.selected:not(:focus) { color: ${listInactiveSelectionForegroundColor}; }`);
	}

	const listSelectForegroundColor = theme.getColor(listActiveSelectionForeground);
	if (listSelectForegroundColor) {
		collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item.setting-item-list .setting-list-row.selected:focus { color: ${listSelectForegroundColor}; }`);
	}

	const codeTextForegroundColor = theme.getColor(textPreformatForeground);
	if (codeTextForegroundColor) {
		collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item .setting-item-markdown code { color: ${codeTextForegroundColor} }`);
		collector.addRule(`.monaco-select-box-dropdown-container > .select-box-details-pane > .select-box-description-markdown code { color: ${codeTextForegroundColor} }`);

	}

	const modifiedItemIndicatorColor = theme.getColor(modifiedItemIndicator);
	if (modifiedItemIndicatorColor) {
		collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item-contents > .setting-item-modified-indicator { border-color: ${modifiedItemIndicatorColor}; }`);
	}
});

type EditKey = 'none' | 'create' | number;

type IListViewItem<TDataItem extends object> = TDataItem & {
	editing?: boolean;
	selected?: boolean;
};

export class ListSettingListModel<TDataItem extends object> {
	protected _dataItems: TDataItem[] = [];
	private _editKey: EditKey | null = null;
	private _selectedIdx: number | null = null;
	private _newDataItem: TDataItem;

	get items(): IListViewItem<TDataItem>[] {
		const items = this._dataItems.map((item, i) => {
			const editing = typeof this._editKey === 'number' && this._editKey === i;
			return {
				...item,
				editing,
				selected: i === this._selectedIdx || editing
			};
		});

		if (this._editKey === 'create') {
			items.push({
				editing: true,
				selected: true,
				...this._newDataItem,
			});
		}

		return items;
	}

	constructor(newItem: TDataItem) {
		this._newDataItem = newItem;
	}

	setEditKey(key: EditKey): void {
		this._editKey = key;
	}

	setValue(listData: TDataItem[]): void {
		this._dataItems = listData;
	}

	select(idx: number): void {
		this._selectedIdx = idx;
	}

	getSelected(): number | null {
		return this._selectedIdx;
	}

	selectNext(): void {
		if (typeof this._selectedIdx === 'number') {
			this._selectedIdx = Math.min(this._selectedIdx + 1, this._dataItems.length - 1);
		} else {
			this._selectedIdx = 0;
		}
	}

	selectPrevious(): void {
		if (typeof this._selectedIdx === 'number') {
			this._selectedIdx = Math.max(this._selectedIdx - 1, 0);
		} else {
			this._selectedIdx = 0;
		}
	}
}

export interface ISettingListChangeEvent<TDataItem extends object> {
	originalItem: TDataItem;
	item?: TDataItem;
	targetIndex?: number;
}

interface IEditHandlers<TDataItem extends object> {
	onKeydown(event: IKeyboardEvent, updatedItem: TDataItem): void
	onSubmit(updatedItem: TDataItem): void
	onCancel(): void
}

abstract class AbstractListSettingWidget<TDataItem extends object> extends Disposable {
	private listElement: HTMLElement;

	protected readonly _onDidChangeList = this._register(new Emitter<ISettingListChangeEvent<TDataItem>>());
	protected readonly model = new ListSettingListModel<TDataItem>(this.getEmptyItem());
	protected readonly listDisposables = this._register(new DisposableStore());

	readonly onDidChangeList: Event<ISettingListChangeEvent<TDataItem>> = this._onDidChangeList.event;

	get domNode(): HTMLElement {
		return this.listElement;
	}

	get items(): TDataItem[] {
		return this.model.items;
	}

	constructor(
		private container: HTMLElement,
		@IThemeService protected readonly themeService: IThemeService,
		@IContextViewService protected readonly contextViewService: IContextViewService
	) {
		super();

		this.listElement = DOM.append(container, $('div'));
		this.getContainerClasses().forEach(c => this.listElement.classList.add(c));
		this.listElement.setAttribute('tabindex', '0');
		DOM.append(container, this.renderAddButton());
		this.renderList();

		this._register(DOM.addDisposableListener(this.listElement, DOM.EventType.CLICK, e => this.onListClick(e)));
		this._register(DOM.addDisposableListener(this.listElement, DOM.EventType.DBLCLICK, e => this.onListDoubleClick(e)));

		this._register(DOM.addStandardDisposableListener(this.listElement, 'keydown', (e: KeyboardEvent) => {
			if (e.keyCode === KeyCode.UpArrow) {
				const selectedIndex = this.model.getSelected();
				this.model.selectPrevious();
				if (this.model.getSelected() !== selectedIndex) {
					this.renderList();
				}
				e.preventDefault();
				e.stopPropagation();
			} else if (e.keyCode === KeyCode.DownArrow) {
				const selectedIndex = this.model.getSelected();
				this.model.selectNext();
				if (this.model.getSelected() !== selectedIndex) {
					this.renderList();
				}
				e.preventDefault();
				e.stopPropagation();
			}
		}));
	}

	setValue(listData: TDataItem[]): void {
		this.model.setValue(listData);
		this.renderList();
	}

	protected abstract getEmptyItem(): TDataItem;
	protected abstract getContainerClasses(): string[];
	protected abstract getActionsForItem(item: TDataItem, idx: number): IAction[];
	protected abstract renderItem(item: TDataItem): HTMLElement;
	protected abstract renderEdit(item: TDataItem, handlers: IEditHandlers<TDataItem>): HTMLElement;
	protected abstract isItemNew(item: TDataItem): boolean;
	protected abstract getLocalizedRowTitle(item: TDataItem): string;
	protected abstract getLocalizedStrings(): {
		deleteActionTooltip: string
		editActionTooltip: string
		addButtonLabel: string
	};

	protected renderHeader(): HTMLElement | undefined {
		return;
	}

	protected isAddButtonVisible(): boolean {
		return true;
	}

	protected renderList(): void {
		const focused = DOM.isAncestor(document.activeElement, this.listElement);

		DOM.clearNode(this.listElement);
		this.listDisposables.clear();

		const newMode = this.model.items.some(item => !!(item.editing && this.isItemNew(item)));
		DOM.toggleClass(this.container, 'setting-list-hide-add-button', !this.isAddButtonVisible() || newMode);

		const header = this.renderHeader();
		const ITEM_HEIGHT = 24;
		let listHeight = ITEM_HEIGHT * this.model.items.length;

		if (header) {
			listHeight += ITEM_HEIGHT;
			this.listElement.appendChild(header);
		}

		this.model.items
			.map((item, i) => this.renderDataOrEditItem(item, i, focused))
			.forEach(itemElement => this.listElement.appendChild(itemElement));

		this.listElement.style.height = listHeight + 'px';
	}

	protected editSetting(idx: number): void {
		this.model.setEditKey(idx);
		this.renderList();
	}

	private renderDataOrEditItem(item: IListViewItem<TDataItem>, idx: number, listFocused: boolean): HTMLElement {
		return item.editing ?
			this.renderEditItem(item, idx) :
			this.renderDataItem(item, idx, listFocused);
	}

	private renderDataItem(item: IListViewItem<TDataItem>, idx: number, listFocused: boolean): HTMLElement {
		const rowElement = this.renderItem(item);

		rowElement.setAttribute('data-index', idx + '');
		rowElement.setAttribute('tabindex', item.selected ? '0' : '-1');
		DOM.toggleClass(rowElement, 'selected', item.selected);

		const actionBar = new ActionBar(rowElement);
		this.listDisposables.add(actionBar);

		actionBar.push(this.getActionsForItem(item, idx), { icon: true, label: true });
		rowElement.title = this.getLocalizedRowTitle(item);

		if (item.selected) {
			if (listFocused) {
				setTimeout(() => {
					rowElement.focus();
				}, 10);
			}
		}

		return rowElement;
	}

	private renderEditItem(item: IListViewItem<TDataItem>, idx: number): HTMLElement {
		let rowElement: HTMLElement | undefined;

		const onCancel = () => {
			this.model.setEditKey('none');
			this.renderList();
		};

		const onSubmit = (updatedItem: TDataItem) => {
			this.model.setEditKey('none');

			if (!isUndefinedOrNull(updatedItem)) {
				this._onDidChangeList.fire({
					originalItem: item,
					item: updatedItem,
					targetIndex: idx,
				});
			}

			this.renderList();
		};

		const onKeydown = (e: StandardKeyboardEvent, updatedItem: TDataItem) => {
			if (e.equals(KeyCode.Enter)) {
				onSubmit(updatedItem);
			} else if (e.equals(KeyCode.Escape)) {
				onCancel();
				e.preventDefault();
			}
			rowElement?.focus();
		};

		rowElement = this.renderEdit(item, { onSubmit, onKeydown, onCancel });

		return rowElement;
	}

	private renderAddButton(): HTMLElement {
		const rowElement = $('.setting-list-new-row');

		const startAddButton = this._register(new Button(rowElement));
		startAddButton.label = this.getLocalizedStrings().addButtonLabel;
		startAddButton.element.classList.add('setting-list-addButton');
		this._register(attachButtonStyler(startAddButton, this.themeService));

		this._register(startAddButton.onDidClick(() => {
			this.model.setEditKey('create');
			this.renderList();
		}));

		return rowElement;
	}

	private onListClick(e: MouseEvent): void {
		const targetIdx = this.getClickedItemIndex(e);
		if (targetIdx < 0) {
			return;
		}

		if (this.model.getSelected() === targetIdx) {
			return;
		}

		this.model.select(targetIdx);
		this.renderList();
		e.preventDefault();
		e.stopPropagation();
	}

	private onListDoubleClick(e: MouseEvent): void {
		const targetIdx = this.getClickedItemIndex(e);
		if (targetIdx < 0) {
			return;
		}

		const item = this.model.items[targetIdx];
		if (item) {
			this.editSetting(targetIdx);
			e.preventDefault();
			e.stopPropagation();
		}
	}

	private getClickedItemIndex(e: MouseEvent): number {
		if (!e.target) {
			return -1;
		}

		const actionbar = DOM.findParentWithClass(<any>e.target, 'monaco-action-bar');
		if (actionbar) {
			// Don't handle doubleclicks inside the action bar
			return -1;
		}

		const element = DOM.findParentWithClass((<any>e.target), 'setting-list-row');
		if (!element) {
			return -1;
		}

		const targetIdxStr = element.getAttribute('data-index');
		if (!targetIdxStr) {
			return -1;
		}

		const targetIdx = parseInt(targetIdxStr);
		return targetIdx;
	}
}

export interface IListDataItem {
	value: string
	sibling?: string
}

export class ListSettingWidget extends AbstractListSettingWidget<IListDataItem> {
	protected getEmptyItem(): IListDataItem {
		return { value: '' };
	}

	protected getContainerClasses(): string[] {
		return ['setting-list-widget'];
	}

	protected getActionsForItem(item: IListDataItem, idx: number): IAction[] {
		return [
			{
				class: preferencesEditIcon.classNames,
				enabled: true,
				id: 'workbench.action.editListItem',
				tooltip: this.getLocalizedStrings().editActionTooltip,
				run: () => this.editSetting(idx)
			},
			{
				class: 'codicon-close',
				enabled: true,
				id: 'workbench.action.removeListItem',
				tooltip: this.getLocalizedStrings().deleteActionTooltip,
				run: () => this._onDidChangeList.fire({ originalItem: item, item: undefined, targetIndex: idx })
			}
		] as IAction[];
	}

	protected renderItem(item: IListDataItem): HTMLElement {
		const rowElement = $('.setting-list-row');

		const valueElement = DOM.append(rowElement, $('.setting-list-value'));
		const siblingElement = DOM.append(rowElement, $('.setting-list-sibling'));

		valueElement.textContent = item.value;
		siblingElement.textContent = item.sibling ? `when: ${item.sibling}` : null;

		return rowElement;
	}

	protected renderEdit(item: IListDataItem, { onKeydown, onSubmit, onCancel }: IEditHandlers<IListDataItem>): HTMLElement {
		const rowElement = $('.setting-list-edit-row');

		const updatedItem = () => ({
			value: valueInput.value,
			sibling: siblingInput?.value
		});

		const valueInput = new InputBox(rowElement, this.contextViewService, {
			placeholder: this.getLocalizedStrings().inputPlaceholder
		});

		valueInput.element.classList.add('setting-list-valueInput');
		this.listDisposables.add(attachInputBoxStyler(valueInput, this.themeService, {
			inputBackground: settingsTextInputBackground,
			inputForeground: settingsTextInputForeground,
			inputBorder: settingsTextInputBorder
		}));
		this.listDisposables.add(valueInput);
		valueInput.value = item.value;

		this.listDisposables.add(DOM.addStandardDisposableListener(valueInput.inputElement, DOM.EventType.KEY_DOWN, e => onKeydown(e, updatedItem())));

		let siblingInput: InputBox | undefined;
		if (!isUndefinedOrNull(item.sibling)) {
			siblingInput = new InputBox(rowElement, this.contextViewService, {
				placeholder: this.getLocalizedStrings().siblingInputPlaceholder
			});
			siblingInput.element.classList.add('setting-list-siblingInput');
			this.listDisposables.add(siblingInput);
			this.listDisposables.add(attachInputBoxStyler(siblingInput, this.themeService, {
				inputBackground: settingsTextInputBackground,
				inputForeground: settingsTextInputForeground,
				inputBorder: settingsTextInputBorder
			}));
			siblingInput.value = item.sibling;

			this.listDisposables.add(DOM.addStandardDisposableListener(siblingInput.inputElement, DOM.EventType.KEY_DOWN, e => onKeydown(e, updatedItem())));
		}

		const okButton = this._register(new Button(rowElement));
		okButton.label = localize('okButton', "OK");
		okButton.element.classList.add('setting-list-ok-button');

		this.listDisposables.add(attachButtonStyler(okButton, this.themeService));
		this.listDisposables.add(okButton.onDidClick(() => onSubmit(updatedItem())));

		const cancelButton = this._register(new Button(rowElement));
		cancelButton.label = localize('cancelButton', "Cancel");
		cancelButton.element.classList.add('setting-list-cancel-button');

		this.listDisposables.add(attachButtonStyler(cancelButton, this.themeService));
		this.listDisposables.add(cancelButton.onDidClick(onCancel));

		this.listDisposables.add(
			disposableTimeout(() => {
				valueInput.focus();
				valueInput.select();
			})
		);

		return rowElement;
	}

	protected isItemNew(item: IListDataItem): boolean {
		return item.value === '';
	}

	protected getLocalizedRowTitle({ value, sibling }: IListDataItem): string {
		return isUndefinedOrNull(sibling)
			? localize('listValueHintLabel', "List item `{0}`", value)
			: localize('listSiblingHintLabel', "List item `{0}` with sibling `${1}`", value, sibling);
	}

	protected getLocalizedStrings() {
		return {
			deleteActionTooltip: localize('removeItem', "Remove Item"),
			editActionTooltip: localize('editItem', "Edit Item"),
			addButtonLabel: localize('addItem', "Add Item"),
			inputPlaceholder: localize('itemInputPlaceholder', "String Item..."),
			siblingInputPlaceholder: localize('listSiblingInputPlaceholder', "Sibling..."),
		};
	}
}

export class ExcludeSettingWidget extends ListSettingWidget {
	protected getContainerClasses() {
		return ['setting-list-exclude-widget'];
	}

	protected getLocalizedRowTitle({ value, sibling }: IListDataItem): string {
		return isUndefinedOrNull(sibling)
			? localize('excludePatternHintLabel', "Exclude files matching `{0}`", value)
			: localize('excludeSiblingHintLabel', "Exclude files matching `{0}`, only when a file matching `{1}` is present", value, sibling);
	}

	protected getLocalizedStrings() {
		return {
			deleteActionTooltip: localize('removeExcludeItem', "Remove Exclude Item"),
			editActionTooltip: localize('editExcludeItem', "Edit Exclude Item"),
			addButtonLabel: localize('addPattern', "Add Pattern"),
			inputPlaceholder: localize('excludePatternInputPlaceholder', "Exclude Pattern..."),
			siblingInputPlaceholder: localize('excludeSiblingInputPlaceholder', "When Pattern Is Present..."),
		};
	}
}

interface IObjectStringData {
	type: 'string';
	data: string;
}

export interface IObjectEnumOption {
	value: string;
	description?: string
}

interface IObjectEnumData {
	type: 'enum';
	data: string;
	options: IObjectEnumOption[];
}

interface IObjectBoolData {
	type: 'boolean';
	data: boolean;
}

type ObjectKey = IObjectStringData | IObjectEnumData;
export type ObjectValue = IObjectStringData | IObjectEnumData | IObjectBoolData;

export interface IObjectDataItem {
	key: ObjectKey;
	value: ObjectValue;
	removable: boolean;
}

interface IObjectSetValueOptions {
	showAddButton?: boolean;
}

export class ObjectSettingWidget extends AbstractListSettingWidget<IObjectDataItem> {
	private showAddButton: boolean = true;

	setValue(listData: IObjectDataItem[], options?: IObjectSetValueOptions): void {
		this.showAddButton = options?.showAddButton ?? this.showAddButton;
		super.setValue(listData);
	}

	isItemNew(item: IObjectDataItem): boolean {
		return item.key.data === '' && item.value.data === '';
	}

	protected isAddButtonVisible(): boolean {
		return this.showAddButton;
	}

	protected getEmptyItem(): IObjectDataItem {
		return {
			key: { type: 'string', data: '' },
			value: { type: 'string', data: '' },
			removable: true,
		};
	}

	protected getContainerClasses() {
		return ['setting-list-object-widget'];
	}

	protected getActionsForItem(item: IObjectDataItem, idx: number): IAction[] {
		const actions = [
			{
				class: preferencesEditIcon.classNames,
				enabled: true,
				id: 'workbench.action.editListItem',
				tooltip: this.getLocalizedStrings().editActionTooltip,
				run: () => this.editSetting(idx)
			},
		] as IAction[];

		if (item.removable) {
			actions.push({
				class: 'codicon-close',
				enabled: true,
				id: 'workbench.action.removeListItem',
				tooltip: this.getLocalizedStrings().deleteActionTooltip,
				run: () => this._onDidChangeList.fire({ originalItem: item, item: undefined, targetIndex: idx })
			} as IAction);
		} else {
			actions.push({
				class: 'codicon-discard',
				enabled: true,
				id: 'workbench.action.resetListItem',
				tooltip: this.getLocalizedStrings().resetActionTooltip,
				run: () => this._onDidChangeList.fire({ originalItem: item, item: undefined, targetIndex: idx })
			} as IAction);
		}

		return actions;
	}

	protected renderHeader() {
		if (this.model.items.length > 0) {
			const header = $('.setting-list-row-header');
			const keyHeader = DOM.append(header, $('.setting-list-object-key'));
			const valueHeader = DOM.append(header, $('.setting-list-object-value'));
			const { keyHeaderText, valueHeaderText } = this.getLocalizedStrings();

			keyHeader.textContent = keyHeaderText;
			valueHeader.textContent = valueHeaderText;

			return header;
		}

		return;
	}

	protected renderItem(item: IObjectDataItem): HTMLElement {
		const rowElement = $('.setting-list-row');
		rowElement.classList.add('setting-list-object-row');

		const keyElement = DOM.append(rowElement, $('.setting-list-object-key'));
		const valueElement = DOM.append(rowElement, $('.setting-list-object-value'));

		keyElement.textContent = item.key.data;
		valueElement.textContent = item.value.data.toString();

		return rowElement;
	}

	protected renderEdit(item: IObjectDataItem, { onSubmit, onKeydown, onCancel }: IEditHandlers<IObjectDataItem>): HTMLElement {
		const rowElement = $('.setting-list-edit-row');
		rowElement.classList.add('setting-list-object-row');

		let keyWidget: InputBox | SelectBox | undefined;

		if (this.showAddButton) {
			keyWidget = this.renderEditWidget(item.key, rowElement, true);
		} else {
			const keyElement = DOM.append(rowElement, $('.setting-list-object-key'));
			keyElement.textContent = item.key.data;
		}

		const valueWidget = this.renderEditWidget(item.value, rowElement, false);

		const updatedItem = () => {
			const newItem = { ...item };

			if (keyWidget instanceof InputBox) {
				newItem.key = { type: 'string', data: keyWidget.value };
			}

			if (valueWidget instanceof InputBox) {
				newItem.value = { type: 'string', data: valueWidget.value };
			}

			return newItem;
		};

		if (keyWidget instanceof InputBox) {
			keyWidget.setPlaceHolder(this.getLocalizedStrings().keyInputPlaceholder);
			this.listDisposables.add(DOM.addStandardDisposableListener(keyWidget.inputElement, DOM.EventType.KEY_DOWN, e => onKeydown(e, updatedItem())));
		} else if (keyWidget instanceof SelectBox) {
			this.listDisposables.add(
				keyWidget.onDidSelect(({ selected }) => {
					const editKey = this.model.items.findIndex(({ key }) => selected === key.data);

					if (editKey >= 0) {
						this.model.select(editKey);
						this.model.setEditKey(editKey);
						this.renderList();
					} else {
						onSubmit({ ...item, key: { ...item.key, data: selected } });
					}
				})
			);
		}

		if (valueWidget instanceof InputBox) {
			valueWidget.setPlaceHolder(this.getLocalizedStrings().valueInputPlaceholder);
			this.listDisposables.add(DOM.addStandardDisposableListener(valueWidget.inputElement, DOM.EventType.KEY_DOWN, e => onKeydown(e, updatedItem())));
		} else if (valueWidget instanceof SelectBox) {
			this.listDisposables.add(
				valueWidget.onDidSelect(({ selected }) => {
					onSubmit({
						...item,
						value: item.value.type === 'boolean'
							? { ...item.value, data: selected === 'true' ? true : false }
							: { ...item.value, data: selected },
					});
				})
			);
		}

		const okButton = this._register(new Button(rowElement));
		okButton.label = localize('okButton', "OK");
		okButton.element.classList.add('setting-list-ok-button');

		this.listDisposables.add(attachButtonStyler(okButton, this.themeService));
		this.listDisposables.add(okButton.onDidClick(() => onSubmit(updatedItem())));

		const cancelButton = this._register(new Button(rowElement));
		cancelButton.label = localize('cancelButton', "Cancel");
		cancelButton.element.classList.add('setting-list-cancel-button');

		this.listDisposables.add(attachButtonStyler(cancelButton, this.themeService));
		this.listDisposables.add(cancelButton.onDidClick(onCancel));

		this.listDisposables.add(
			disposableTimeout(() => {
				const widget = keyWidget ?? valueWidget;

				widget.focus();

				if (widget instanceof InputBox) {
					widget.select();
				}
			})
		);

		return rowElement;
	}

	protected getLocalizedRowTitle(item: IObjectDataItem): string {
		const enumDescription = item.key.type === 'enum'
			? item.key.options.find(({ value }) => item.key.data === value)?.description
			: undefined;

		return enumDescription ?? localize('objectPairHintLabel', "The key `{0}` maps to `{1}`", item.key.data, item.value.data);
	}

	protected getLocalizedStrings() {
		return {
			deleteActionTooltip: localize('removeItem', "Remove Item"),
			resetActionTooltip: localize('resetItem', "Reset Item"),
			editActionTooltip: localize('editItem', "Edit Item"),
			addButtonLabel: localize('addItem', "Add Item"),
			keyHeaderText: localize('objectKeyHeader', "Item"),
			valueHeaderText: localize('objectValueHeader', "Value"),
			keyInputPlaceholder: localize('objectKeyInputPlaceholder', "Key"),
			valueInputPlaceholder: localize('objectValueInputPlaceholder', "Value"),
		};
	}

	private renderEditWidget(keyOrValue: ObjectKey | ObjectValue, rowElement: HTMLElement, isKey: boolean) {
		switch (keyOrValue.type) {
			case 'string':
				return this.renderStringEditWidget(keyOrValue, rowElement, isKey);
			case 'enum':
				return this.renderEnumEditWidget(keyOrValue, rowElement, isKey);
			case 'boolean':
				return this.renderEnumEditWidget(
					{
						type: 'enum',
						data: keyOrValue.data.toString(),
						options: [{ value: 'true' }, { value: 'false' }],
					},
					rowElement,
					isKey
				);
		}
	}

	private renderStringEditWidget(keyOrValue: IObjectStringData, rowElement: HTMLElement, isKey: boolean) {
		const inputBox = new InputBox(rowElement, this.contextViewService);

		inputBox.element.classList.add(
			'setting-list-object-input',
			isKey ? 'setting-list-object-input-key' : 'setting-list-object-input-value',
		);

		this.listDisposables.add(attachInputBoxStyler(inputBox, this.themeService, {
			inputBackground: settingsTextInputBackground,
			inputForeground: settingsTextInputForeground,
			inputBorder: settingsTextInputBorder
		}));
		this.listDisposables.add(inputBox);
		inputBox.value = keyOrValue.data;

		return inputBox;
	}

	private renderEnumEditWidget(keyOrValue: IObjectEnumData, rowElement: HTMLElement, isKey: boolean) {
		const selectBoxOptions = keyOrValue.options.map(({ value, description }) => ({ text: value, description }));
		const selected = keyOrValue.options.findIndex(option => keyOrValue.data === option.value);

		const selectBox = new SelectBox(selectBoxOptions, selected, this.contextViewService, undefined, {
			useCustomDrawn: !(isIOS && BrowserFeatures.pointerEvents)
		});

		this.listDisposables.add(attachSelectBoxStyler(selectBox, this.themeService, {
			selectBackground: settingsSelectBackground,
			selectForeground: settingsSelectForeground,
			selectBorder: settingsSelectBorder,
			selectListBorder: settingsSelectListBorder
		}));

		const wrapper = $('.setting-list-object-input');
		wrapper.classList.add(
			isKey ? 'setting-list-object-input-key' : 'setting-list-object-input-value',
		);

		selectBox.render(wrapper);
		rowElement.append(wrapper);

		return selectBox;
	}
}
