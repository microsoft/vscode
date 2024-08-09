/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BrowserFeatures } from 'vs/base/browser/canIUse';
import * as DOM from 'vs/base/browser/dom';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { Button } from 'vs/base/browser/ui/button/button';
import { Toggle, unthemedToggleStyles } from 'vs/base/browser/ui/toggle/toggle';
import { InputBox } from 'vs/base/browser/ui/inputbox/inputBox';
import { SelectBox } from 'vs/base/browser/ui/selectBox/selectBox';
import { IAction } from 'vs/base/common/actions';
import { disposableTimeout } from 'vs/base/common/async';
import { Codicon } from 'vs/base/common/codicons';
import { Emitter, Event } from 'vs/base/common/event';
import { KeyCode } from 'vs/base/common/keyCodes';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { isIOS } from 'vs/base/common/platform';
import { isDefined, isUndefinedOrNull } from 'vs/base/common/types';
import 'vs/css!./media/settingsWidgets';
import { localize } from 'vs/nls';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ThemeIcon } from 'vs/base/common/themables';
import { settingsDiscardIcon, settingsEditIcon, settingsRemoveIcon } from 'vs/workbench/contrib/preferences/browser/preferencesIcons';
import { settingsSelectBackground, settingsSelectBorder, settingsSelectForeground, settingsSelectListBorder, settingsTextInputBackground, settingsTextInputBorder, settingsTextInputForeground } from 'vs/workbench/contrib/preferences/common/settingsEditorColorRegistry';
import { defaultButtonStyles, getInputBoxStyle, getSelectBoxStyles } from 'vs/platform/theme/browser/defaultStyles';
import { getDefaultHoverDelegate } from 'vs/base/browser/ui/hover/hoverDelegateFactory';
import { IHoverService } from 'vs/platform/hover/browser/hover';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { IManagedHoverTooltipMarkdownString } from 'vs/base/browser/ui/hover/hover';
import { SettingValueType } from 'vs/workbench/services/preferences/common/preferences';

const $ = DOM.$;

type EditKey = 'none' | 'create' | number;

type RowElementGroup = {
	rowElement: HTMLElement;
	keyElement: HTMLElement;
	valueElement?: HTMLElement;
};

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

	select(idx: number | null): void {
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
	type: 'change';
	originalItem: TDataItem;
	newItem: TDataItem;
	targetIndex: number;
}

export interface ISettingListAddEvent<TDataItem extends object> {
	type: 'add';
	newItem: TDataItem;
	targetIndex: number;
}

export interface ISettingListMoveEvent<TDataItem extends object> {
	type: 'move';
	originalItem: TDataItem;
	newItem: TDataItem;
	targetIndex: number;
	sourceIndex: number;
}

export interface ISettingListRemoveEvent<TDataItem extends object> {
	type: 'remove';
	originalItem: TDataItem;
	targetIndex: number;
}

export interface ISettingListResetEvent<TDataItem extends object> {
	type: 'reset';
	originalItem: TDataItem;
	targetIndex: number;
}

export type SettingListEvent<TDataItem extends object> = ISettingListChangeEvent<TDataItem> | ISettingListAddEvent<TDataItem> | ISettingListMoveEvent<TDataItem> | ISettingListRemoveEvent<TDataItem> | ISettingListResetEvent<TDataItem>;

export abstract class AbstractListSettingWidget<TDataItem extends object> extends Disposable {
	private listElement: HTMLElement;
	private rowElements: HTMLElement[] = [];

	protected readonly _onDidChangeList = this._register(new Emitter<SettingListEvent<TDataItem>>());
	protected readonly model = new ListSettingListModel<TDataItem>(this.getEmptyItem());
	protected readonly listDisposables = this._register(new DisposableStore());

	readonly onDidChangeList: Event<SettingListEvent<TDataItem>> = this._onDidChangeList.event;

	get domNode(): HTMLElement {
		return this.listElement;
	}

	get items(): TDataItem[] {
		return this.model.items;
	}

	get inReadMode(): boolean {
		return this.model.items.every(item => !item.editing);
	}

	constructor(
		private container: HTMLElement,
		@IThemeService protected readonly themeService: IThemeService,
		@IContextViewService protected readonly contextViewService: IContextViewService
	) {
		super();

		this.listElement = DOM.append(container, $('div'));
		this.listElement.setAttribute('role', 'list');
		this.getContainerClasses().forEach(c => this.listElement.classList.add(c));
		DOM.append(container, this.renderAddButton());
		this.renderList();

		this._register(DOM.addDisposableListener(this.listElement, DOM.EventType.POINTER_DOWN, e => this.onListClick(e)));
		this._register(DOM.addDisposableListener(this.listElement, DOM.EventType.DBLCLICK, e => this.onListDoubleClick(e)));

		this._register(DOM.addStandardDisposableListener(this.listElement, 'keydown', (e: StandardKeyboardEvent) => {
			if (e.equals(KeyCode.UpArrow)) {
				this.selectPreviousRow();
			} else if (e.equals(KeyCode.DownArrow)) {
				this.selectNextRow();
			} else {
				return;
			}

			e.preventDefault();
			e.stopPropagation();
		}));
	}

	setValue(listData: TDataItem[]): void {
		this.model.setValue(listData);
		this.renderList();
	}

	abstract isItemNew(item: TDataItem): boolean;
	protected abstract getEmptyItem(): TDataItem;
	protected abstract getContainerClasses(): string[];
	protected abstract getActionsForItem(item: TDataItem, idx: number): IAction[];
	protected abstract renderItem(item: TDataItem, idx: number): RowElementGroup;
	protected abstract renderEdit(item: TDataItem, idx: number): HTMLElement;
	protected abstract addTooltipsToRow(rowElement: RowElementGroup, item: TDataItem): void;
	protected abstract getLocalizedStrings(): {
		deleteActionTooltip: string;
		editActionTooltip: string;
		addButtonLabel: string;
	};

	protected renderHeader(): HTMLElement | undefined {
		return;
	}

	protected isAddButtonVisible(): boolean {
		return true;
	}

	protected renderList(): void {
		const focused = DOM.isAncestorOfActiveElement(this.listElement);

		DOM.clearNode(this.listElement);
		this.listDisposables.clear();

		const newMode = this.model.items.some(item => !!(item.editing && this.isItemNew(item)));
		this.container.classList.toggle('setting-list-hide-add-button', !this.isAddButtonVisible() || newMode);

		if (this.model.items.length) {
			this.listElement.tabIndex = 0;
		} else {
			this.listElement.removeAttribute('tabIndex');
		}

		const header = this.renderHeader();

		if (header) {
			this.listElement.appendChild(header);
		}

		this.rowElements = this.model.items.map((item, i) => this.renderDataOrEditItem(item, i, focused));
		this.rowElements.forEach(rowElement => this.listElement.appendChild(rowElement));

	}

	protected createBasicSelectBox(value: IObjectEnumData): SelectBox {
		const selectBoxOptions = value.options.map(({ value, description }) => ({ text: value, description }));
		const selected = value.options.findIndex(option => value.data === option.value);

		const styles = getSelectBoxStyles({
			selectBackground: settingsSelectBackground,
			selectForeground: settingsSelectForeground,
			selectBorder: settingsSelectBorder,
			selectListBorder: settingsSelectListBorder
		});


		const selectBox = new SelectBox(selectBoxOptions, selected, this.contextViewService, styles, {
			useCustomDrawn: !(isIOS && BrowserFeatures.pointerEvents)
		});
		return selectBox;
	}

	protected editSetting(idx: number): void {
		this.model.setEditKey(idx);
		this.renderList();
	}

	public cancelEdit(): void {
		this.model.setEditKey('none');
		this.renderList();
	}

	protected handleItemChange(originalItem: TDataItem, changedItem: TDataItem, idx: number) {
		this.model.setEditKey('none');

		if (this.isItemNew(originalItem)) {
			this._onDidChangeList.fire({
				type: 'add',
				newItem: changedItem,
				targetIndex: idx,
			});
		} else {
			this._onDidChangeList.fire({
				type: 'change',
				originalItem,
				newItem: changedItem,
				targetIndex: idx,
			});
		}

		this.renderList();
	}

	protected renderDataOrEditItem(item: IListViewItem<TDataItem>, idx: number, listFocused: boolean): HTMLElement {
		const rowElement = item.editing ?
			this.renderEdit(item, idx) :
			this.renderDataItem(item, idx, listFocused);

		rowElement.setAttribute('role', 'listitem');

		return rowElement;
	}

	private renderDataItem(item: IListViewItem<TDataItem>, idx: number, listFocused: boolean): HTMLElement {
		const rowElementGroup = this.renderItem(item, idx);
		const rowElement = rowElementGroup.rowElement;

		rowElement.setAttribute('data-index', idx + '');
		rowElement.setAttribute('tabindex', item.selected ? '0' : '-1');
		rowElement.classList.toggle('selected', item.selected);

		const actionBar = new ActionBar(rowElement);
		this.listDisposables.add(actionBar);

		actionBar.push(this.getActionsForItem(item, idx), { icon: true, label: true });
		this.addTooltipsToRow(rowElementGroup, item);

		if (item.selected && listFocused) {
			disposableTimeout(() => rowElement.focus(), undefined, this.listDisposables);
		}

		this.listDisposables.add(DOM.addDisposableListener(rowElement, 'click', (e) => {
			// There is a parent list widget, which is the one that holds the list of settings.
			// Prevent the parent widget from trying to interpret this click event.
			e.stopPropagation();
		}));

		return rowElement;
	}

	private renderAddButton(): HTMLElement {
		const rowElement = $('.setting-list-new-row');

		const startAddButton = this._register(new Button(rowElement, defaultButtonStyles));
		startAddButton.label = this.getLocalizedStrings().addButtonLabel;
		startAddButton.element.classList.add('setting-list-addButton');

		this._register(startAddButton.onDidClick(() => {
			this.model.setEditKey('create');
			this.renderList();
		}));

		return rowElement;
	}

	private onListClick(e: PointerEvent): void {
		const targetIdx = this.getClickedItemIndex(e);
		if (targetIdx < 0) {
			return;
		}

		e.preventDefault();
		e.stopImmediatePropagation();
		if (this.model.getSelected() === targetIdx) {
			return;
		}

		this.selectRow(targetIdx);
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

		const actionbar = DOM.findParentWithClass(e.target as HTMLElement, 'monaco-action-bar');
		if (actionbar) {
			// Don't handle doubleclicks inside the action bar
			return -1;
		}

		const element = DOM.findParentWithClass(e.target as HTMLElement, 'setting-list-row');
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

	private selectRow(idx: number): void {
		this.model.select(idx);
		this.rowElements.forEach(row => row.classList.remove('selected'));

		const selectedRow = this.rowElements[this.model.getSelected()!];

		selectedRow.classList.add('selected');
		selectedRow.focus();
	}

	private selectNextRow(): void {
		this.model.selectNext();
		this.selectRow(this.model.getSelected()!);
	}

	private selectPreviousRow(): void {
		this.model.selectPrevious();
		this.selectRow(this.model.getSelected()!);
	}
}

interface IListSetValueOptions {
	showAddButton: boolean;
	keySuggester?: IObjectKeySuggester;
}

export interface IListDataItem {
	value: ObjectKey;
	sibling?: string;
}

interface ListSettingWidgetDragDetails<TListDataItem extends IListDataItem> {
	element: HTMLElement;
	item: TListDataItem;
	itemIndex: number;
}

export class ListSettingWidget<TListDataItem extends IListDataItem> extends AbstractListSettingWidget<TListDataItem> {
	private keyValueSuggester: IObjectKeySuggester | undefined;
	private showAddButton: boolean = true;

	override setValue(listData: TListDataItem[], options?: IListSetValueOptions) {
		this.keyValueSuggester = options?.keySuggester;
		this.showAddButton = options?.showAddButton ?? true;
		super.setValue(listData);
	}

	constructor(
		container: HTMLElement,
		@IThemeService themeService: IThemeService,
		@IContextViewService contextViewService: IContextViewService,
		@IHoverService protected readonly hoverService: IHoverService
	) {
		super(container, themeService, contextViewService);
	}

	protected getEmptyItem(): TListDataItem {
		return {
			value: {
				type: 'string',
				data: ''
			}
		} as TListDataItem;
	}

	protected override isAddButtonVisible(): boolean {
		return this.showAddButton;
	}

	protected getContainerClasses(): string[] {
		return ['setting-list-widget'];
	}

	protected getActionsForItem(item: TListDataItem, idx: number): IAction[] {
		return [
			{
				class: ThemeIcon.asClassName(settingsEditIcon),
				enabled: true,
				id: 'workbench.action.editListItem',
				tooltip: this.getLocalizedStrings().editActionTooltip,
				run: () => this.editSetting(idx)
			},
			{
				class: ThemeIcon.asClassName(settingsRemoveIcon),
				enabled: true,
				id: 'workbench.action.removeListItem',
				tooltip: this.getLocalizedStrings().deleteActionTooltip,
				run: () => this._onDidChangeList.fire({ type: 'remove', originalItem: item, targetIndex: idx })
			}
		] as IAction[];
	}

	private dragDetails: ListSettingWidgetDragDetails<TListDataItem> | undefined;

	private getDragImage(item: TListDataItem): HTMLElement {
		const dragImage = $('.monaco-drag-image');
		dragImage.textContent = item.value.data;
		return dragImage;
	}

	protected renderItem(item: TListDataItem, idx: number): RowElementGroup {
		const rowElement = $('.setting-list-row');
		const valueElement = DOM.append(rowElement, $('.setting-list-value'));
		const siblingElement = DOM.append(rowElement, $('.setting-list-sibling'));

		valueElement.textContent = item.value.data.toString();
		siblingElement.textContent = item.sibling ? `when: ${item.sibling}` : null;

		this.addDragAndDrop(rowElement, item, idx);
		return { rowElement, keyElement: valueElement, valueElement: siblingElement };
	}

	protected addDragAndDrop(rowElement: HTMLElement, item: TListDataItem, idx: number) {
		if (this.inReadMode) {
			rowElement.draggable = true;
			rowElement.classList.add('draggable');
		} else {
			rowElement.draggable = false;
			rowElement.classList.remove('draggable');
		}

		this.listDisposables.add(DOM.addDisposableListener(rowElement, DOM.EventType.DRAG_START, (ev) => {
			this.dragDetails = {
				element: rowElement,
				item,
				itemIndex: idx
			};
			if (ev.dataTransfer) {
				ev.dataTransfer.dropEffect = 'move';
				const dragImage = this.getDragImage(item);
				rowElement.ownerDocument.body.appendChild(dragImage);
				ev.dataTransfer.setDragImage(dragImage, -10, -10);
				setTimeout(() => dragImage.remove(), 0);
			}
		}));
		this.listDisposables.add(DOM.addDisposableListener(rowElement, DOM.EventType.DRAG_OVER, (ev) => {
			if (!this.dragDetails) {
				return false;
			}
			ev.preventDefault();
			if (ev.dataTransfer) {
				ev.dataTransfer.dropEffect = 'move';
			}
			return true;
		}));
		let counter = 0;
		this.listDisposables.add(DOM.addDisposableListener(rowElement, DOM.EventType.DRAG_ENTER, (ev) => {
			counter++;
			rowElement.classList.add('drag-hover');
		}));
		this.listDisposables.add(DOM.addDisposableListener(rowElement, DOM.EventType.DRAG_LEAVE, (ev) => {
			counter--;
			if (!counter) {
				rowElement.classList.remove('drag-hover');
			}
		}));
		this.listDisposables.add(DOM.addDisposableListener(rowElement, DOM.EventType.DROP, (ev) => {
			// cancel the op if we dragged to a completely different setting
			if (!this.dragDetails) {
				return false;
			}
			ev.preventDefault();
			counter = 0;
			if (this.dragDetails.element !== rowElement) {
				this._onDidChangeList.fire({
					type: 'move',
					originalItem: this.dragDetails.item,
					sourceIndex: this.dragDetails.itemIndex,
					newItem: item,
					targetIndex: idx
				});
			}
			return true;
		}));
		this.listDisposables.add(DOM.addDisposableListener(rowElement, DOM.EventType.DRAG_END, (ev) => {
			counter = 0;
			rowElement.classList.remove('drag-hover');
			ev.dataTransfer?.clearData();
			if (this.dragDetails) {
				this.dragDetails = undefined;
			}
		}));
	}

	protected renderEdit(item: TListDataItem, idx: number): HTMLElement {
		const rowElement = $('.setting-list-edit-row');
		let valueInput: InputBox | SelectBox;
		let currentDisplayValue: string;
		let currentEnumOptions: IObjectEnumOption[] | undefined;

		if (this.keyValueSuggester) {
			const enumData = this.keyValueSuggester(this.model.items.map(({ value: { data } }) => data), idx);
			item = {
				...item,
				value: {
					type: 'enum',
					data: item.value.data,
					options: enumData ? enumData.options : []
				}
			};
		}

		switch (item.value.type) {
			case 'string':
				valueInput = this.renderInputBox(item.value, rowElement);
				break;
			case 'enum':
				valueInput = this.renderDropdown(item.value, rowElement);
				currentEnumOptions = item.value.options;
				if (item.value.options.length) {
					currentDisplayValue = this.isItemNew(item) ?
						currentEnumOptions[0].value : item.value.data;
				}
				break;
		}

		const updatedInputBoxItem = (): TListDataItem => {
			const inputBox = valueInput as InputBox;
			return {
				value: {
					type: 'string',
					data: inputBox.value
				},
				sibling: siblingInput?.value
			} as TListDataItem;
		};
		const updatedSelectBoxItem = (selectedValue: string): TListDataItem => {
			return {
				value: {
					type: 'enum',
					data: selectedValue,
					options: currentEnumOptions ?? []
				}
			} as TListDataItem;
		};
		const onKeyDown = (e: StandardKeyboardEvent) => {
			if (e.equals(KeyCode.Enter)) {
				this.handleItemChange(item, updatedInputBoxItem(), idx);
			} else if (e.equals(KeyCode.Escape)) {
				this.cancelEdit();
				e.preventDefault();
			}
			rowElement?.focus();
		};

		if (item.value.type !== 'string') {
			const selectBox = valueInput as SelectBox;
			this.listDisposables.add(
				selectBox.onDidSelect(({ selected }) => {
					currentDisplayValue = selected;
				})
			);
		} else {
			const inputBox = valueInput as InputBox;
			this.listDisposables.add(
				DOM.addStandardDisposableListener(inputBox.inputElement, DOM.EventType.KEY_DOWN, onKeyDown)
			);
		}

		let siblingInput: InputBox | undefined;
		if (!isUndefinedOrNull(item.sibling)) {
			siblingInput = new InputBox(rowElement, this.contextViewService, {
				placeholder: this.getLocalizedStrings().siblingInputPlaceholder,
				inputBoxStyles: getInputBoxStyle({
					inputBackground: settingsTextInputBackground,
					inputForeground: settingsTextInputForeground,
					inputBorder: settingsTextInputBorder
				})
			});
			siblingInput.element.classList.add('setting-list-siblingInput');
			this.listDisposables.add(siblingInput);
			siblingInput.value = item.sibling;

			this.listDisposables.add(
				DOM.addStandardDisposableListener(siblingInput.inputElement, DOM.EventType.KEY_DOWN, onKeyDown)
			);
		} else if (valueInput instanceof InputBox) {
			valueInput.element.classList.add('no-sibling');
		}

		const okButton = this.listDisposables.add(new Button(rowElement, defaultButtonStyles));
		okButton.label = localize('okButton', "OK");
		okButton.element.classList.add('setting-list-ok-button');

		this.listDisposables.add(okButton.onDidClick(() => {
			if (item.value.type === 'string') {
				this.handleItemChange(item, updatedInputBoxItem(), idx);
			} else {
				this.handleItemChange(item, updatedSelectBoxItem(currentDisplayValue), idx);
			}
		}));

		const cancelButton = this.listDisposables.add(new Button(rowElement, { secondary: true, ...defaultButtonStyles }));
		cancelButton.label = localize('cancelButton', "Cancel");
		cancelButton.element.classList.add('setting-list-cancel-button');

		this.listDisposables.add(cancelButton.onDidClick(() => this.cancelEdit()));

		this.listDisposables.add(
			disposableTimeout(() => {
				valueInput.focus();
				if (valueInput instanceof InputBox) {
					valueInput.select();
				}
			})
		);

		return rowElement;
	}

	override isItemNew(item: TListDataItem): boolean {
		return item.value.data === '';
	}

	protected addTooltipsToRow(rowElementGroup: RowElementGroup, { value, sibling }: TListDataItem) {
		const title = isUndefinedOrNull(sibling)
			? localize('listValueHintLabel', "List item `{0}`", value.data)
			: localize('listSiblingHintLabel', "List item `{0}` with sibling `${1}`", value.data, sibling);

		const { rowElement } = rowElementGroup;
		this.listDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), rowElement, title));
		rowElement.setAttribute('aria-label', title);
	}

	protected getLocalizedStrings() {
		return {
			deleteActionTooltip: localize('removeItem', "Remove Item"),
			editActionTooltip: localize('editItem', "Edit Item"),
			addButtonLabel: localize('addItem', "Add Item"),
			inputPlaceholder: localize('itemInputPlaceholder', "Item..."),
			siblingInputPlaceholder: localize('listSiblingInputPlaceholder', "Sibling..."),
		};
	}

	private renderInputBox(value: ObjectValue, rowElement: HTMLElement): InputBox {
		const valueInput = new InputBox(rowElement, this.contextViewService, {
			placeholder: this.getLocalizedStrings().inputPlaceholder,
			inputBoxStyles: getInputBoxStyle({
				inputBackground: settingsTextInputBackground,
				inputForeground: settingsTextInputForeground,
				inputBorder: settingsTextInputBorder
			})
		});

		valueInput.element.classList.add('setting-list-valueInput');
		this.listDisposables.add(valueInput);
		valueInput.value = value.data.toString();

		return valueInput;
	}

	private renderDropdown(value: ObjectKey, rowElement: HTMLElement): SelectBox {
		if (value.type !== 'enum') {
			throw new Error('Valuetype must be enum.');
		}
		const selectBox = this.createBasicSelectBox(value);

		const wrapper = $('.setting-list-object-list-row');
		selectBox.render(wrapper);
		rowElement.appendChild(wrapper);

		return selectBox;
	}
}

export class ExcludeSettingWidget extends ListSettingWidget<IIncludeExcludeDataItem> {
	protected override getContainerClasses() {
		return ['setting-list-include-exclude-widget'];
	}

	protected override addDragAndDrop(rowElement: HTMLElement, item: IIncludeExcludeDataItem, idx: number) {
		return;
	}

	protected override addTooltipsToRow(rowElementGroup: RowElementGroup, item: IIncludeExcludeDataItem): void {
		let title = isUndefinedOrNull(item.sibling)
			? localize('excludePatternHintLabel', "Exclude files matching `{0}`", item.value.data)
			: localize('excludeSiblingHintLabel', "Exclude files matching `{0}`, only when a file matching `{1}` is present", item.value.data, item.sibling);

		if (item.source) {
			title += localize('excludeIncludeSource', ". Default value provided by `{0}`", item.source);
		}

		const markdownTitle = new MarkdownString().appendMarkdown(title);

		const { rowElement } = rowElementGroup;
		this.listDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), rowElement, { markdown: markdownTitle, markdownNotSupportedFallback: title }));
		rowElement.setAttribute('aria-label', title);
	}

	protected override getLocalizedStrings() {
		return {
			deleteActionTooltip: localize('removeExcludeItem', "Remove Exclude Item"),
			editActionTooltip: localize('editExcludeItem', "Edit Exclude Item"),
			addButtonLabel: localize('addPattern', "Add Pattern"),
			inputPlaceholder: localize('excludePatternInputPlaceholder', "Exclude Pattern..."),
			siblingInputPlaceholder: localize('excludeSiblingInputPlaceholder', "When Pattern Is Present..."),
		};
	}
}

export class IncludeSettingWidget extends ListSettingWidget<IIncludeExcludeDataItem> {
	protected override getContainerClasses() {
		return ['setting-list-include-exclude-widget'];
	}

	protected override addDragAndDrop(rowElement: HTMLElement, item: IIncludeExcludeDataItem, idx: number) {
		return;
	}

	protected override addTooltipsToRow(rowElementGroup: RowElementGroup, item: IIncludeExcludeDataItem): void {
		let title = isUndefinedOrNull(item.sibling)
			? localize('includePatternHintLabel', "Include files matching `{0}`", item.value.data)
			: localize('includeSiblingHintLabel', "Include files matching `{0}`, only when a file matching `{1}` is present", item.value.data, item.sibling);

		if (item.source) {
			title += localize('excludeIncludeSource', ". Default value provided by `{0}`", item.source);
		}

		const markdownTitle = new MarkdownString().appendMarkdown(title);

		const { rowElement } = rowElementGroup;
		this.listDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), rowElement, { markdown: markdownTitle, markdownNotSupportedFallback: title }));
		rowElement.setAttribute('aria-label', title);
	}

	protected override getLocalizedStrings() {
		return {
			deleteActionTooltip: localize('removeIncludeItem', "Remove Include Item"),
			editActionTooltip: localize('editIncludeItem', "Edit Include Item"),
			addButtonLabel: localize('addPattern', "Add Pattern"),
			inputPlaceholder: localize('includePatternInputPlaceholder', "Include Pattern..."),
			siblingInputPlaceholder: localize('includeSiblingInputPlaceholder', "When Pattern Is Present..."),
		};
	}
}

interface IObjectStringData {
	type: 'string';
	data: string;
}

export interface IObjectEnumOption {
	value: string;
	description?: string;
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
type ObjectWidget = InputBox | SelectBox;

export interface IObjectDataItem {
	key: ObjectKey;
	value: ObjectValue;
	keyDescription?: string;
	source?: string;
	removable: boolean;
	resetable: boolean;
}

export interface IIncludeExcludeDataItem {
	value: ObjectKey;
	elementType: SettingValueType;
	sibling?: string;
	source?: string;
}

export interface IObjectValueSuggester {
	(key: string): ObjectValue | undefined;
}

export interface IObjectKeySuggester {
	(existingKeys: string[], idx?: number): IObjectEnumData | undefined;
}

interface IObjectSetValueOptions {
	settingKey: string;
	showAddButton: boolean;
	keySuggester: IObjectKeySuggester;
	valueSuggester: IObjectValueSuggester;
}

interface IObjectRenderEditWidgetOptions {
	isKey: boolean;
	idx: number;
	readonly originalItem: IObjectDataItem;
	readonly changedItem: IObjectDataItem;
	update(keyOrValue: ObjectKey | ObjectValue): void;
}

export class ObjectSettingDropdownWidget extends AbstractListSettingWidget<IObjectDataItem> {
	private currentSettingKey: string = '';
	private showAddButton: boolean = true;
	private keySuggester: IObjectKeySuggester = () => undefined;
	private valueSuggester: IObjectValueSuggester = () => undefined;

	constructor(
		container: HTMLElement,
		@IThemeService themeService: IThemeService,
		@IContextViewService contextViewService: IContextViewService,
		@IHoverService private readonly hoverService: IHoverService,
	) {
		super(container, themeService, contextViewService);
	}

	override setValue(listData: IObjectDataItem[], options?: IObjectSetValueOptions): void {
		this.showAddButton = options?.showAddButton ?? this.showAddButton;
		this.keySuggester = options?.keySuggester ?? this.keySuggester;
		this.valueSuggester = options?.valueSuggester ?? this.valueSuggester;

		if (isDefined(options) && options.settingKey !== this.currentSettingKey) {
			this.model.setEditKey('none');
			this.model.select(null);
			this.currentSettingKey = options.settingKey;
		}

		super.setValue(listData);
	}

	override isItemNew(item: IObjectDataItem): boolean {
		return item.key.data === '' && item.value.data === '';
	}

	protected override isAddButtonVisible(): boolean {
		return this.showAddButton;
	}

	protected getEmptyItem(): IObjectDataItem {
		return {
			key: { type: 'string', data: '' },
			value: { type: 'string', data: '' },
			removable: true,
			resetable: false
		};
	}

	protected getContainerClasses() {
		return ['setting-list-object-widget'];
	}

	protected getActionsForItem(item: IObjectDataItem, idx: number): IAction[] {
		const actions: IAction[] = [
			{
				class: ThemeIcon.asClassName(settingsEditIcon),
				enabled: true,
				id: 'workbench.action.editListItem',
				label: '',
				tooltip: this.getLocalizedStrings().editActionTooltip,
				run: () => this.editSetting(idx)
			},
		];

		if (item.resetable) {
			actions.push({
				class: ThemeIcon.asClassName(settingsDiscardIcon),
				enabled: true,
				id: 'workbench.action.resetListItem',
				label: '',
				tooltip: this.getLocalizedStrings().resetActionTooltip,
				run: () => this._onDidChangeList.fire({ type: 'reset', originalItem: item, targetIndex: idx })
			});
		}

		if (item.removable) {
			actions.push({
				class: ThemeIcon.asClassName(settingsRemoveIcon),
				enabled: true,
				id: 'workbench.action.removeListItem',
				label: '',
				tooltip: this.getLocalizedStrings().deleteActionTooltip,
				run: () => this._onDidChangeList.fire({ type: 'remove', originalItem: item, targetIndex: idx })
			});
		}

		return actions;
	}

	protected override renderHeader() {
		const header = $('.setting-list-row-header');
		const keyHeader = DOM.append(header, $('.setting-list-object-key'));
		const valueHeader = DOM.append(header, $('.setting-list-object-value'));
		const { keyHeaderText, valueHeaderText } = this.getLocalizedStrings();

		keyHeader.textContent = keyHeaderText;
		valueHeader.textContent = valueHeaderText;

		return header;
	}

	protected renderItem(item: IObjectDataItem, idx: number): RowElementGroup {
		const rowElement = $('.setting-list-row');
		rowElement.classList.add('setting-list-object-row');

		const keyElement = DOM.append(rowElement, $('.setting-list-object-key'));
		const valueElement = DOM.append(rowElement, $('.setting-list-object-value'));

		keyElement.textContent = item.key.data;
		valueElement.textContent = item.value.data.toString();

		return { rowElement, keyElement, valueElement };
	}

	protected renderEdit(item: IObjectDataItem, idx: number): HTMLElement {
		const rowElement = $('.setting-list-edit-row.setting-list-object-row');

		const changedItem = { ...item };
		const onKeyChange = (key: ObjectKey) => {
			changedItem.key = key;
			okButton.enabled = key.data !== '';

			const suggestedValue = this.valueSuggester(key.data) ?? item.value;

			if (this.shouldUseSuggestion(item.value, changedItem.value, suggestedValue)) {
				onValueChange(suggestedValue);
				renderLatestValue();
			}
		};
		const onValueChange = (value: ObjectValue) => {
			changedItem.value = value;
		};

		let keyWidget: ObjectWidget | undefined;
		let keyElement: HTMLElement;

		if (this.showAddButton) {
			if (this.isItemNew(item)) {
				const suggestedKey = this.keySuggester(this.model.items.map(({ key: { data } }) => data));

				if (isDefined(suggestedKey)) {
					changedItem.key = suggestedKey;
					const suggestedValue = this.valueSuggester(changedItem.key.data);
					onValueChange(suggestedValue ?? changedItem.value);
				}
			}

			const { widget, element } = this.renderEditWidget(changedItem.key, {
				idx,
				isKey: true,
				originalItem: item,
				changedItem,
				update: onKeyChange,
			});
			keyWidget = widget;
			keyElement = element;
		} else {
			keyElement = $('.setting-list-object-key');
			keyElement.textContent = item.key.data;
		}

		let valueWidget: ObjectWidget;
		const valueContainer = $('.setting-list-object-value-container');

		const renderLatestValue = () => {
			const { widget, element } = this.renderEditWidget(changedItem.value, {
				idx,
				isKey: false,
				originalItem: item,
				changedItem,
				update: onValueChange,
			});

			valueWidget = widget;

			DOM.clearNode(valueContainer);
			valueContainer.append(element);
		};

		renderLatestValue();

		rowElement.append(keyElement, valueContainer);

		const okButton = this.listDisposables.add(new Button(rowElement, defaultButtonStyles));
		okButton.enabled = changedItem.key.data !== '';
		okButton.label = localize('okButton', "OK");
		okButton.element.classList.add('setting-list-ok-button');

		this.listDisposables.add(okButton.onDidClick(() => this.handleItemChange(item, changedItem, idx)));

		const cancelButton = this.listDisposables.add(new Button(rowElement, { secondary: true, ...defaultButtonStyles }));
		cancelButton.label = localize('cancelButton', "Cancel");
		cancelButton.element.classList.add('setting-list-cancel-button');

		this.listDisposables.add(cancelButton.onDidClick(() => this.cancelEdit()));

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

	private renderEditWidget(
		keyOrValue: ObjectKey | ObjectValue,
		options: IObjectRenderEditWidgetOptions,
	) {
		switch (keyOrValue.type) {
			case 'string':
				return this.renderStringEditWidget(keyOrValue, options);
			case 'enum':
				return this.renderEnumEditWidget(keyOrValue, options);
			case 'boolean':
				return this.renderEnumEditWidget(
					{
						type: 'enum',
						data: keyOrValue.data.toString(),
						options: [{ value: 'true' }, { value: 'false' }],
					},
					options,
				);
		}
	}

	private renderStringEditWidget(
		keyOrValue: IObjectStringData,
		{ idx, isKey, originalItem, changedItem, update }: IObjectRenderEditWidgetOptions,
	) {
		const wrapper = $(isKey ? '.setting-list-object-input-key' : '.setting-list-object-input-value');
		const inputBox = new InputBox(wrapper, this.contextViewService, {
			placeholder: isKey
				? localize('objectKeyInputPlaceholder', "Key")
				: localize('objectValueInputPlaceholder', "Value"),
			inputBoxStyles: getInputBoxStyle({
				inputBackground: settingsTextInputBackground,
				inputForeground: settingsTextInputForeground,
				inputBorder: settingsTextInputBorder
			})
		});

		inputBox.element.classList.add('setting-list-object-input');

		this.listDisposables.add(inputBox);
		inputBox.value = keyOrValue.data;

		this.listDisposables.add(inputBox.onDidChange(value => update({ ...keyOrValue, data: value })));

		const onKeyDown = (e: StandardKeyboardEvent) => {
			if (e.equals(KeyCode.Enter)) {
				this.handleItemChange(originalItem, changedItem, idx);
			} else if (e.equals(KeyCode.Escape)) {
				this.cancelEdit();
				e.preventDefault();
			}
		};

		this.listDisposables.add(
			DOM.addStandardDisposableListener(inputBox.inputElement, DOM.EventType.KEY_DOWN, onKeyDown)
		);

		return { widget: inputBox, element: wrapper };
	}

	private renderEnumEditWidget(
		keyOrValue: IObjectEnumData,
		{ isKey, changedItem, update }: IObjectRenderEditWidgetOptions,
	) {
		const selectBox = this.createBasicSelectBox(keyOrValue);

		const changedKeyOrValue = isKey ? changedItem.key : changedItem.value;
		this.listDisposables.add(
			selectBox.onDidSelect(({ selected }) =>
				update(
					changedKeyOrValue.type === 'boolean'
						? { ...changedKeyOrValue, data: selected === 'true' ? true : false }
						: { ...changedKeyOrValue, data: selected },
				)
			)
		);

		const wrapper = $('.setting-list-object-input');
		wrapper.classList.add(
			isKey ? 'setting-list-object-input-key' : 'setting-list-object-input-value',
		);

		selectBox.render(wrapper);

		// Switch to the first item if the user set something invalid in the json
		const selected = keyOrValue.options.findIndex(option => keyOrValue.data === option.value);
		if (selected === -1 && keyOrValue.options.length) {
			update(
				changedKeyOrValue.type === 'boolean'
					? { ...changedKeyOrValue, data: true }
					: { ...changedKeyOrValue, data: keyOrValue.options[0].value }
			);
		} else if (changedKeyOrValue.type === 'boolean') {
			// https://github.com/microsoft/vscode/issues/129581
			update({ ...changedKeyOrValue, data: keyOrValue.data === 'true' });
		}

		return { widget: selectBox, element: wrapper };
	}

	private shouldUseSuggestion(originalValue: ObjectValue, previousValue: ObjectValue, newValue: ObjectValue): boolean {
		// suggestion is exactly the same
		if (newValue.type !== 'enum' && newValue.type === previousValue.type && newValue.data === previousValue.data) {
			return false;
		}

		// item is new, use suggestion
		if (originalValue.data === '') {
			return true;
		}

		if (previousValue.type === newValue.type && newValue.type !== 'enum') {
			return false;
		}

		// check if all enum options are the same
		if (previousValue.type === 'enum' && newValue.type === 'enum') {
			const previousEnums = new Set(previousValue.options.map(({ value }) => value));
			newValue.options.forEach(({ value }) => previousEnums.delete(value));

			// all options are the same
			if (previousEnums.size === 0) {
				return false;
			}
		}

		return true;
	}

	protected addTooltipsToRow(rowElementGroup: RowElementGroup, item: IObjectDataItem): void {
		const { keyElement, valueElement, rowElement } = rowElementGroup;

		let accessibleDescription;
		if (item.source) {
			accessibleDescription = localize('objectPairHintLabelWithSource', "The property `{0}` is set to `{1}` by `{2}`.", item.key.data, item.value.data, item.source);
		} else {
			accessibleDescription = localize('objectPairHintLabel', "The property `{0}` is set to `{1}`.", item.key.data, item.value.data);
		}

		const markdownString = { markdown: new MarkdownString().appendMarkdown(accessibleDescription), markdownNotSupportedFallback: accessibleDescription };

		const keyDescription: string | IManagedHoverTooltipMarkdownString = this.getEnumDescription(item.key) ?? item.keyDescription ?? markdownString;
		this.listDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), keyElement, keyDescription));

		const valueDescription: string | IManagedHoverTooltipMarkdownString = this.getEnumDescription(item.value) ?? markdownString;
		this.listDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), valueElement!, valueDescription));

		rowElement.setAttribute('aria-label', accessibleDescription);
	}

	private getEnumDescription(keyOrValue: ObjectKey | ObjectValue): string | undefined {
		const enumDescription = keyOrValue.type === 'enum'
			? keyOrValue.options.find(({ value }) => keyOrValue.data === value)?.description
			: undefined;
		return enumDescription;
	}

	protected getLocalizedStrings() {
		return {
			deleteActionTooltip: localize('removeItem', "Remove Item"),
			resetActionTooltip: localize('resetItem', "Reset Item"),
			editActionTooltip: localize('editItem', "Edit Item"),
			addButtonLabel: localize('addItem', "Add Item"),
			keyHeaderText: localize('objectKeyHeader', "Item"),
			valueHeaderText: localize('objectValueHeader', "Value"),
		};
	}
}

interface IBoolObjectSetValueOptions {
	settingKey: string;
}

export interface IBoolObjectDataItem {
	key: IObjectStringData;
	value: IObjectBoolData;
	keyDescription?: string;
	source?: string;
	removable: false;
	resetable: boolean;
}

export class ObjectSettingCheckboxWidget extends AbstractListSettingWidget<IBoolObjectDataItem> {
	private currentSettingKey: string = '';

	constructor(
		container: HTMLElement,
		@IThemeService themeService: IThemeService,
		@IContextViewService contextViewService: IContextViewService,
		@IHoverService private readonly hoverService: IHoverService,
	) {
		super(container, themeService, contextViewService);
	}

	override setValue(listData: IBoolObjectDataItem[], options?: IBoolObjectSetValueOptions): void {
		if (isDefined(options) && options.settingKey !== this.currentSettingKey) {
			this.model.setEditKey('none');
			this.model.select(null);
			this.currentSettingKey = options.settingKey;
		}

		super.setValue(listData);
	}

	override isItemNew(item: IBoolObjectDataItem): boolean {
		return !item.key.data && !item.value.data;
	}

	protected getEmptyItem(): IBoolObjectDataItem {
		return {
			key: { type: 'string', data: '' },
			value: { type: 'boolean', data: false },
			removable: false,
			resetable: true
		};
	}

	protected getContainerClasses() {
		return ['setting-list-object-widget'];
	}

	protected getActionsForItem(item: IBoolObjectDataItem, idx: number): IAction[] {
		return [];
	}

	protected override isAddButtonVisible(): boolean {
		return false;
	}

	protected override renderHeader() {
		return undefined;
	}

	protected override renderDataOrEditItem(item: IListViewItem<IBoolObjectDataItem>, idx: number, listFocused: boolean): HTMLElement {
		const rowElement = this.renderEdit(item, idx);
		rowElement.setAttribute('role', 'listitem');
		return rowElement;
	}

	protected renderItem(item: IBoolObjectDataItem, idx: number): RowElementGroup {
		// Return just the containers, since we always render in edit mode anyway
		const rowElement = $('.blank-row');
		const keyElement = $('.blank-row-key');
		return { rowElement, keyElement };
	}

	protected renderEdit(item: IBoolObjectDataItem, idx: number): HTMLElement {
		const rowElement = $('.setting-list-edit-row.setting-list-object-row.setting-item-bool');

		const changedItem = { ...item };
		const onValueChange = (newValue: boolean) => {
			changedItem.value.data = newValue;
			this.handleItemChange(item, changedItem, idx);
		};
		const checkboxDescription = item.keyDescription ? `${item.keyDescription} (${item.key.data})` : item.key.data;
		const { element, widget: checkbox } = this.renderEditWidget((changedItem.value as IObjectBoolData).data, checkboxDescription, onValueChange);
		rowElement.appendChild(element);

		const valueElement = DOM.append(rowElement, $('.setting-list-object-value'));
		valueElement.textContent = checkboxDescription;

		// We add the tooltips here, because the method is not called by default
		// for widgets in edit mode
		const rowElementGroup = { rowElement, keyElement: valueElement, valueElement: checkbox.domNode };
		this.addTooltipsToRow(rowElementGroup, item);

		this._register(DOM.addDisposableListener(valueElement, DOM.EventType.MOUSE_DOWN, e => {
			const targetElement = <HTMLElement>e.target;
			if (targetElement.tagName.toLowerCase() !== 'a') {
				checkbox.checked = !checkbox.checked;
				onValueChange(checkbox.checked);
			}
			DOM.EventHelper.stop(e);
		}));

		return rowElement;
	}

	private renderEditWidget(
		value: boolean,
		checkboxDescription: string,
		onValueChange: (newValue: boolean) => void
	) {
		const checkbox = new Toggle({
			icon: Codicon.check,
			actionClassName: 'setting-value-checkbox',
			isChecked: value,
			title: checkboxDescription,
			...unthemedToggleStyles
		});

		this.listDisposables.add(checkbox);

		const wrapper = $('.setting-list-object-input');
		wrapper.classList.add('setting-list-object-input-key-checkbox');
		checkbox.domNode.classList.add('setting-value-checkbox');
		wrapper.appendChild(checkbox.domNode);

		this._register(DOM.addDisposableListener(wrapper, DOM.EventType.MOUSE_DOWN, e => {
			checkbox.checked = !checkbox.checked;
			onValueChange(checkbox.checked);

			// Without this line, the settings editor assumes
			// we lost focus on this setting completely.
			e.stopImmediatePropagation();
		}));

		return { widget: checkbox, element: wrapper };
	}

	protected addTooltipsToRow(rowElementGroup: RowElementGroup, item: IBoolObjectDataItem): void {
		const accessibleDescription = localize('objectPairHintLabel', "The property `{0}` is set to `{1}`.", item.key.data, item.value.data);
		const title = item.keyDescription ?? accessibleDescription;
		const { rowElement, keyElement, valueElement } = rowElementGroup;

		this.listDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), keyElement, title));
		valueElement!.setAttribute('aria-label', accessibleDescription);
		rowElement.setAttribute('aria-label', accessibleDescription);
	}

	protected getLocalizedStrings() {
		return {
			deleteActionTooltip: localize('removeItem', "Remove Item"),
			resetActionTooltip: localize('resetItem', "Reset Item"),
			editActionTooltip: localize('editItem', "Edit Item"),
			addButtonLabel: localize('addItem', "Add Item"),
			keyHeaderText: localize('objectKeyHeader', "Item"),
			valueHeaderText: localize('objectValueHeader', "Value"),
		};
	}
}
