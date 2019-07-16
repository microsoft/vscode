/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
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
import { foreground, inputBackground, inputBorder, inputForeground, listActiveSelectionBackground, listActiveSelectionForeground, listHoverBackground, listHoverForeground, listInactiveSelectionBackground, listInactiveSelectionForeground, registerColor, selectBackground, selectBorder, selectForeground, textLinkForeground, textPreformatForeground, editorWidgetBorder, textLinkActiveForeground } from 'vs/platform/theme/common/colorRegistry';
import { attachButtonStyler, attachInputBoxStyler } from 'vs/platform/theme/common/styler';
import { ICssStyleCollector, ITheme, IThemeService, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { disposableTimeout } from 'vs/base/common/async';

const $ = DOM.$;
export const settingsHeaderForeground = registerColor('settings.headerForeground', { light: '#444444', dark: '#e7e7e7', hc: '#ffffff' }, localize('headerForeground', "(For settings editor preview) The foreground color for a section header or active title."));
export const modifiedItemIndicator = registerColor('settings.modifiedItemIndicator', {
	light: new Color(new RGBA(102, 175, 224)),
	dark: new Color(new RGBA(12, 125, 157)),
	hc: new Color(new RGBA(0, 73, 122))
}, localize('modifiedItemForeground', "(For settings editor preview) The color of the modified setting indicator."));

// Enum control colors
export const settingsSelectBackground = registerColor('settings.dropdownBackground', { dark: selectBackground, light: selectBackground, hc: selectBackground }, localize('settingsDropdownBackground', "(For settings editor preview) Settings editor dropdown background."));
export const settingsSelectForeground = registerColor('settings.dropdownForeground', { dark: selectForeground, light: selectForeground, hc: selectForeground }, localize('settingsDropdownForeground', "(For settings editor preview) Settings editor dropdown foreground."));
export const settingsSelectBorder = registerColor('settings.dropdownBorder', { dark: selectBorder, light: selectBorder, hc: selectBorder }, localize('settingsDropdownBorder', "(For settings editor preview) Settings editor dropdown border."));
export const settingsSelectListBorder = registerColor('settings.dropdownListBorder', { dark: editorWidgetBorder, light: editorWidgetBorder, hc: editorWidgetBorder }, localize('settingsDropdownListBorder', "(For settings editor preview) Settings editor dropdown list border. This surrounds the options and separates the options from the description."));

// Bool control colors
export const settingsCheckboxBackground = registerColor('settings.checkboxBackground', { dark: selectBackground, light: selectBackground, hc: selectBackground }, localize('settingsCheckboxBackground', "(For settings editor preview) Settings editor checkbox background."));
export const settingsCheckboxForeground = registerColor('settings.checkboxForeground', { dark: selectForeground, light: selectForeground, hc: selectForeground }, localize('settingsCheckboxForeground', "(For settings editor preview) Settings editor checkbox foreground."));
export const settingsCheckboxBorder = registerColor('settings.checkboxBorder', { dark: selectBorder, light: selectBorder, hc: selectBorder }, localize('settingsCheckboxBorder', "(For settings editor preview) Settings editor checkbox border."));

// Text control colors
export const settingsTextInputBackground = registerColor('settings.textInputBackground', { dark: inputBackground, light: inputBackground, hc: inputBackground }, localize('textInputBoxBackground', "(For settings editor preview) Settings editor text input box background."));
export const settingsTextInputForeground = registerColor('settings.textInputForeground', { dark: inputForeground, light: inputForeground, hc: inputForeground }, localize('textInputBoxForeground', "(For settings editor preview) Settings editor text input box foreground."));
export const settingsTextInputBorder = registerColor('settings.textInputBorder', { dark: inputBorder, light: inputBorder, hc: inputBorder }, localize('textInputBoxBorder', "(For settings editor preview) Settings editor text input box border."));

// Number control colors
export const settingsNumberInputBackground = registerColor('settings.numberInputBackground', { dark: inputBackground, light: inputBackground, hc: inputBackground }, localize('numberInputBoxBackground', "(For settings editor preview) Settings editor number input box background."));
export const settingsNumberInputForeground = registerColor('settings.numberInputForeground', { dark: inputForeground, light: inputForeground, hc: inputForeground }, localize('numberInputBoxForeground', "(For settings editor preview) Settings editor number input box foreground."));
export const settingsNumberInputBorder = registerColor('settings.numberInputBorder', { dark: inputBorder, light: inputBorder, hc: inputBorder }, localize('numberInputBoxBorder', "(For settings editor preview) Settings editor number input box border."));

registerThemingParticipant((theme: ITheme, collector: ICssStyleCollector) => {
	const checkboxBackgroundColor = theme.getColor(settingsCheckboxBackground);
	if (checkboxBackgroundColor) {
		collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item-bool .setting-value-checkbox { background-color: ${checkboxBackgroundColor} !important; }`);
	}

	const checkboxBorderColor = theme.getColor(settingsCheckboxBorder);
	if (checkboxBorderColor) {
		collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item-bool .setting-value-checkbox { border-color: ${checkboxBorderColor} !important; }`);
	}

	const link = theme.getColor(textLinkForeground);
	if (link) {
		collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item-contents .setting-item-description-markdown a { color: ${link}; }`);
		collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item-contents .setting-item-description-markdown a > code { color: ${link}; }`);
		collector.addRule(`.monaco-select-box-dropdown-container > .select-box-details-pane > .select-box-description-markdown a { color: ${link}; }`);
		collector.addRule(`.monaco-select-box-dropdown-container > .select-box-details-pane > .select-box-description-markdown a > code { color: ${link}; }`);
	}

	const activeLink = theme.getColor(textLinkActiveForeground);
	if (activeLink) {
		collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item-contents .setting-item-description-markdown a:hover, .settings-editor > .settings-body > .settings-tree-container .setting-item-contents .setting-item-description-markdown a:active { color: ${activeLink}; }`);
		collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item-contents .setting-item-description-markdown a:hover > code, .settings-editor > .settings-body > .settings-tree-container .setting-item-contents .setting-item-description-markdown a:active > code { color: ${activeLink}; }`);
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

	// Exclude control
	const listHoverBackgroundColor = theme.getColor(listHoverBackground);
	if (listHoverBackgroundColor) {
		collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item.setting-item-exclude .setting-exclude-row:hover { background-color: ${listHoverBackgroundColor}; }`);
	}

	const listHoverForegroundColor = theme.getColor(listHoverForeground);
	if (listHoverForegroundColor) {
		collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item.setting-item-exclude .setting-exclude-row:hover { color: ${listHoverForegroundColor}; }`);
	}

	const listSelectBackgroundColor = theme.getColor(listActiveSelectionBackground);
	if (listSelectBackgroundColor) {
		collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item.setting-item-exclude .setting-exclude-row.selected:focus { background-color: ${listSelectBackgroundColor}; }`);
	}

	const listInactiveSelectionBackgroundColor = theme.getColor(listInactiveSelectionBackground);
	if (listInactiveSelectionBackgroundColor) {
		collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item.setting-item-exclude .setting-exclude-row.selected:not(:focus) { background-color: ${listInactiveSelectionBackgroundColor}; }`);
	}

	const listInactiveSelectionForegroundColor = theme.getColor(listInactiveSelectionForeground);
	if (listInactiveSelectionForegroundColor) {
		collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item.setting-item-exclude .setting-exclude-row.selected:not(:focus) { color: ${listInactiveSelectionForegroundColor}; }`);
	}

	const listSelectForegroundColor = theme.getColor(listActiveSelectionForeground);
	if (listSelectForegroundColor) {
		collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item.setting-item-exclude .setting-exclude-row.selected:focus { color: ${listSelectForegroundColor}; }`);
	}

	const codeTextForegroundColor = theme.getColor(textPreformatForeground);
	if (codeTextForegroundColor) {
		collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item .setting-item-description-markdown code { color: ${codeTextForegroundColor} }`);
		collector.addRule(`.monaco-select-box-dropdown-container > .select-box-details-pane > .select-box-description-markdown code { color: ${codeTextForegroundColor} }`);

	}

	const modifiedItemIndicatorColor = theme.getColor(modifiedItemIndicator);
	if (modifiedItemIndicatorColor) {
		collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item-contents > .setting-item-modified-indicator { border-color: ${modifiedItemIndicatorColor}; }`);
	}
});

export class ExcludeSettingListModel {
	private _dataItems: IExcludeDataItem[] = [];
	private _editKey: string | null;
	private _selectedIdx: number | null;

	get items(): IExcludeViewItem[] {
		const items = this._dataItems.map((item, i) => {
			const editing = item.pattern === this._editKey;
			return <IExcludeViewItem>{
				...item,
				editing,
				selected: i === this._selectedIdx || editing
			};
		});

		if (this._editKey === '') {
			items.push({
				editing: true,
				selected: true,
				pattern: '',
				sibling: ''
			});
		}

		return items;
	}

	setEditKey(key: string | null): void {
		this._editKey = key;
	}

	setValue(excludeData: IExcludeDataItem[]): void {
		this._dataItems = excludeData;
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

export interface IExcludeChangeEvent {
	originalPattern: string;
	pattern?: string;
	sibling?: string;
}

export class ExcludeSettingWidget extends Disposable {
	private listElement: HTMLElement;
	private readonly listDisposables = this._register(new DisposableStore());

	private model = new ExcludeSettingListModel();

	private readonly _onDidChangeExclude = this._register(new Emitter<IExcludeChangeEvent>());
	readonly onDidChangeExclude: Event<IExcludeChangeEvent> = this._onDidChangeExclude.event;

	get domNode(): HTMLElement {
		return this.listElement;
	}

	constructor(
		private container: HTMLElement,
		@IThemeService private readonly themeService: IThemeService,
		@IContextViewService private readonly contextViewService: IContextViewService
	) {
		super();

		this.listElement = DOM.append(container, $('.setting-exclude-widget'));
		this.listElement.setAttribute('tabindex', '0');
		DOM.append(container, this.renderAddButton());
		this.renderList();

		this._register(DOM.addDisposableListener(this.listElement, DOM.EventType.CLICK, e => this.onListClick(e)));
		this._register(DOM.addDisposableListener(this.listElement, DOM.EventType.DBLCLICK, e => this.onListDoubleClick(e)));

		this._register(DOM.addStandardDisposableListener(this.listElement, 'keydown', (e: KeyboardEvent) => {
			if (e.keyCode === KeyCode.UpArrow) {
				this.model.selectPrevious();
				this.renderList();
				e.preventDefault();
				e.stopPropagation();
			} else if (e.keyCode === KeyCode.DownArrow) {
				this.model.selectNext();
				this.renderList();
				e.preventDefault();
				e.stopPropagation();
			}
		}));
	}

	setValue(excludeData: IExcludeDataItem[]): void {
		this.model.setValue(excludeData);
		this.renderList();
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
			this.editSetting(item.pattern);
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

		const element = DOM.findParentWithClass((<any>e.target), 'setting-exclude-row');
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

	private renderList(): void {
		const focused = DOM.isAncestor(document.activeElement, this.listElement);

		DOM.clearNode(this.listElement);
		this.listDisposables.clear();

		const newMode = this.model.items.some(item => !!(item.editing && !item.pattern));
		DOM.toggleClass(this.container, 'setting-exclude-new-mode', newMode);

		this.model.items
			.map((item, i) => this.renderItem(item, i, focused))
			.forEach(itemElement => this.listElement.appendChild(itemElement));

		const listHeight = 22 * this.model.items.length;
		this.listElement.style.height = listHeight + 'px';
	}

	private createDeleteAction(key: string): IAction {
		return <IAction>{
			class: 'setting-excludeAction-remove',
			enabled: true,
			id: 'workbench.action.removeExcludeItem',
			tooltip: localize('removeExcludeItem', "Remove Exclude Item"),
			run: () => this._onDidChangeExclude.fire({ originalPattern: key, pattern: undefined })
		};
	}

	private createEditAction(key: string): IAction {
		return <IAction>{
			class: 'setting-excludeAction-edit',
			enabled: true,
			id: 'workbench.action.editExcludeItem',
			tooltip: localize('editExcludeItem', "Edit Exclude Item"),
			run: () => {
				this.editSetting(key);
			}
		};
	}

	private editSetting(key: string): void {
		this.model.setEditKey(key);
		this.renderList();
	}

	private renderItem(item: IExcludeViewItem, idx: number, listFocused: boolean): HTMLElement {
		return item.editing ?
			this.renderEditItem(item) :
			this.renderDataItem(item, idx, listFocused);
	}

	private renderDataItem(item: IExcludeViewItem, idx: number, listFocused: boolean): HTMLElement {
		const rowElement = $('.setting-exclude-row');
		rowElement.setAttribute('data-index', idx + '');
		rowElement.setAttribute('tabindex', item.selected ? '0' : '-1');
		DOM.toggleClass(rowElement, 'selected', item.selected);

		const actionBar = new ActionBar(rowElement);
		this.listDisposables.add(actionBar);

		const patternElement = DOM.append(rowElement, $('.setting-exclude-pattern'));
		const siblingElement = DOM.append(rowElement, $('.setting-exclude-sibling'));
		patternElement.textContent = item.pattern;
		siblingElement.textContent = item.sibling ? ('when: ' + item.sibling) : null;

		actionBar.push([
			this.createEditAction(item.pattern),
			this.createDeleteAction(item.pattern)
		], { icon: true, label: false });

		rowElement.title = item.sibling ?
			localize('excludeSiblingHintLabel', "Exclude files matching `{0}`, only when a file matching `{1}` is present", item.pattern, item.sibling) :
			localize('excludePatternHintLabel', "Exclude files matching `{0}`", item.pattern);

		if (item.selected) {
			if (listFocused) {
				setTimeout(() => {
					rowElement.focus();
				}, 10);
			}
		}

		return rowElement;
	}

	private renderAddButton(): HTMLElement {
		const rowElement = $('.setting-exclude-new-row');

		const startAddButton = this._register(new Button(rowElement));
		startAddButton.label = localize('addPattern', "Add Pattern");
		startAddButton.element.classList.add('setting-exclude-addButton');
		this._register(attachButtonStyler(startAddButton, this.themeService));

		this._register(startAddButton.onDidClick(() => {
			this.model.setEditKey('');
			this.renderList();
		}));

		return rowElement;
	}

	private renderEditItem(item: IExcludeViewItem): HTMLElement {
		const rowElement = $('.setting-exclude-edit-row');

		const onSubmit = (edited: boolean) => {
			this.model.setEditKey(null);
			const pattern = patternInput.value.trim();
			if (edited && pattern) {
				this._onDidChangeExclude.fire({
					originalPattern: item.pattern,
					pattern,
					sibling: siblingInput && siblingInput.value.trim()
				});
			}
			this.renderList();
		};

		const onKeydown = (e: StandardKeyboardEvent) => {
			if (e.equals(KeyCode.Enter)) {
				onSubmit(true);
			} else if (e.equals(KeyCode.Escape)) {
				onSubmit(false);
				e.preventDefault();
			}
		};

		const patternInput = new InputBox(rowElement, this.contextViewService, {
			placeholder: localize('excludePatternInputPlaceholder', "Exclude Pattern...")
		});
		patternInput.element.classList.add('setting-exclude-patternInput');
		this.listDisposables.add(attachInputBoxStyler(patternInput, this.themeService, {
			inputBackground: settingsTextInputBackground,
			inputForeground: settingsTextInputForeground,
			inputBorder: settingsTextInputBorder
		}));
		this.listDisposables.add(patternInput);
		patternInput.value = item.pattern;
		this.listDisposables.add(DOM.addStandardDisposableListener(patternInput.inputElement, DOM.EventType.KEY_DOWN, onKeydown));

		let siblingInput: InputBox;
		if (item.sibling) {
			siblingInput = new InputBox(rowElement, this.contextViewService, {
				placeholder: localize('excludeSiblingInputPlaceholder', "When Pattern Is Present...")
			});
			siblingInput.element.classList.add('setting-exclude-siblingInput');
			this.listDisposables.add(siblingInput);
			this.listDisposables.add(attachInputBoxStyler(siblingInput, this.themeService, {
				inputBackground: settingsTextInputBackground,
				inputForeground: settingsTextInputForeground,
				inputBorder: settingsTextInputBorder
			}));
			siblingInput.value = item.sibling;
			this.listDisposables.add(DOM.addStandardDisposableListener(siblingInput.inputElement, DOM.EventType.KEY_DOWN, onKeydown));
		}

		const okButton = this._register(new Button(rowElement));
		okButton.label = localize('okButton', "OK");
		okButton.element.classList.add('setting-exclude-okButton');
		this.listDisposables.add(attachButtonStyler(okButton, this.themeService));
		this.listDisposables.add(okButton.onDidClick(() => onSubmit(true)));

		const cancelButton = this._register(new Button(rowElement));
		cancelButton.label = localize('cancelButton', "Cancel");
		cancelButton.element.classList.add('setting-exclude-cancelButton');
		this.listDisposables.add(attachButtonStyler(cancelButton, this.themeService));
		this.listDisposables.add(cancelButton.onDidClick(() => onSubmit(false)));

		this.listDisposables.add(
			disposableTimeout(() => {
				patternInput.focus();
				patternInput.select();
			}));

		return rowElement;
	}
}

export interface IExcludeDataItem {
	pattern: string;
	sibling?: string;
}

interface IExcludeViewItem extends IExcludeDataItem {
	editing?: boolean;
	selected?: boolean;
}
