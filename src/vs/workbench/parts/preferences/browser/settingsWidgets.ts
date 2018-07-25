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
import { Emitter, Event } from 'vs/base/common/event';
import { KeyCode } from 'vs/base/common/keyCodes';
import { Disposable, dispose, IDisposable } from 'vs/base/common/lifecycle';
import 'vs/css!./media/settingsWidgets';
import { localize } from 'vs/nls';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { foreground, inputBackground, inputBorder, inputForeground, listHoverBackground, registerColor, selectBackground, selectBorder, selectForeground, textLinkForeground } from 'vs/platform/theme/common/colorRegistry';
import { attachButtonStyler, attachInputBoxStyler } from 'vs/platform/theme/common/styler';
import { ICssStyleCollector, ITheme, IThemeService, registerThemingParticipant } from 'vs/platform/theme/common/themeService';

const $ = DOM.$;
export const settingsHeaderForeground = registerColor('settings.headerForeground', { light: '#444444', dark: '#e7e7e7', hc: '#ffffff' }, localize('headerForeground', "(For settings editor preview) The foreground color for a section header or active title in the editor."));
export const modifiedItemForeground = registerColor('settings.modifiedItemForeground', { light: '#019001', dark: '#73C991', hc: '#73C991' }, localize('modifiedItemForeground', "(For settings editor preview) The foreground color for a modified setting."));
export const settingItemInactiveSelectionBorder = registerColor('settings.inactiveSelectedItemBorder', { dark: '#3F3F46', light: '#CCCEDB', hc: null }, localize('settingItemInactiveSelectionBorder', "(For settings editor preview) The color of the selected setting row border, when the settings list does not have focus."));

// Enum control colors
export const settingsSelectBackground = registerColor('settings.dropdownBackground', { dark: selectBackground, light: selectBackground, hc: selectBackground }, localize('settingsDropdownBackground', "(For settings editor preview) Settings editor dropdown background."));
export const settingsSelectForeground = registerColor('settings.dropdownForeground', { dark: selectForeground, light: selectForeground, hc: selectForeground }, localize('settingsDropdownForeground', "(For settings editor preview) Settings editor dropdown foreground."));
export const settingsSelectBorder = registerColor('settings.dropdownBorder', { dark: selectBorder, light: selectBorder, hc: selectBorder }, localize('settingsDropdownBorder', "(For settings editor preview) Settings editor dropdown border."));

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
	const modifiedItemForegroundColor = theme.getColor(modifiedItemForeground);
	if (modifiedItemForegroundColor) {
		collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item.is-configured .setting-item-is-configured-label { color: ${modifiedItemForegroundColor}; }`);
		collector.addRule(`.settings-editor > .settings-header > .settings-header-controls .settings-header-controls-right .toolbar-toggle-more::before { background-color: ${modifiedItemForegroundColor}; }`);
	}

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
		collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item .setting-item-description a { color: ${link}; }`);
		collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item .setting-item-description a > code { color: ${link}; }`);
	}

	const headerForegroundColor = theme.getColor(settingsHeaderForeground);
	if (headerForegroundColor) {
		collector.addRule(`.settings-editor > .settings-header > .settings-header-controls .settings-tabs-widget .action-label.checked { color: ${headerForegroundColor}; border-bottom-color: ${headerForegroundColor}; }`);
	}

	const foregroundColor = theme.getColor(foreground);
	if (foregroundColor) {
		collector.addRule(`.settings-editor > .settings-header > .settings-header-controls .settings-tabs-widget .action-label { color: ${foregroundColor}; }`);
	}

	const listHoverBackgroundColor = theme.getColor(listHoverBackground);
	if (listHoverBackgroundColor) {
		collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item.setting-item-exclude .setting-exclude-row:hover { background-color: ${listHoverBackgroundColor}; }`);
	}
});

enum AddItemMode {
	None,
	Pattern,
	PatternWithSibling
}

export class ExcludeSettingListModel {
	private _dataItems: IExcludeItem[] = [];
	private _newItem = AddItemMode.None;

	get items(): IExcludeItem[] {
		const items = [
			...this._dataItems
		];

		// items.push(<INewExcludeItem>{
		// 	id: 'newItem',
		// 	mode: this._newItem
		// });

		return items;
	}

	setAddItemMode(mode: AddItemMode): void {
		this._newItem = mode;
	}

	setValue(excludeValue: any, defaultValue: any): void {
		this._dataItems = this.excludeValueToItems(excludeValue);
	}

	private excludeValueToItems(excludeValue: any): IExcludeItem[] {
		return Object.keys(excludeValue)
			.map(key => {
				const value = excludeValue[key];
				const sibling = typeof value === 'boolean' ? undefined : value.when;

				return {
					id: key,
					pattern: key,
					sibling
				};
			});
	}
}

interface IExcludeChangeEvent {
	originalPattern: string;
	pattern: string;
}

export class ExcludeSettingWidget extends Disposable {
	private listElement: HTMLElement;
	private listDisposables: IDisposable[] = [];
	private patternInput: InputBox;

	private model = new ExcludeSettingListModel();

	private readonly _onDidChangeExclude: Emitter<IExcludeChangeEvent> = new Emitter<IExcludeChangeEvent>();
	public readonly onDidChangeExclude: Event<IExcludeChangeEvent> = this._onDidChangeExclude.event;

	constructor(
		container: HTMLElement,
		@IThemeService private themeService: IThemeService,
		@IContextViewService private contextViewService: IContextViewService
	) {
		super();

		this.listElement = DOM.append(container, $('.setting-exclude-widget'));
		DOM.append(container, this.renderAddItem());
		this.update();
	}

	setValue(excludeValue: any): void {
		this.model.setValue(excludeValue, void 0);
		this.patternInput.value = '';
		this.update();
	}

	private update(): void {
		DOM.clearNode(this.listElement);
		this.listDisposables = dispose(this.listDisposables);

		this.model.items
			.map(item => this.renderItem(item))
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
			run: () => { }
		};
	}

	private renderItem(item: IExcludeItem): HTMLElement {
		return isExcludeDataItem(item) ?
			this.renderDataItem(item) :
			this.renderEditItem(item);
	}

	private renderDataItem(item: IExcludeDataItem): HTMLElement {
		const rowElement = $('.setting-exclude-row');
		const actionBar = new ActionBar(rowElement);
		this.listDisposables.push(actionBar);

		const patternElement = DOM.append(rowElement, $('.setting-exclude-pattern'));
		const siblingElement = DOM.append(rowElement, $('.setting-exclude-sibling'));
		patternElement.textContent = item.pattern;
		siblingElement.textContent = item.sibling && ('when: ' + item.sibling);

		actionBar.push([
			this.createEditAction(item.pattern),
			this.createDeleteAction(item.pattern)
		], { icon: true, label: false });

		rowElement.title = item.sibling ?
			localize('excludeSiblingHintLabel', "Exclude files matching `{0}`, only when a file matching `{1}` is present", item.pattern, item.sibling) :
			localize('excludePatternHintLabel', "Exclude files matching `{0}`", item.pattern);

		return rowElement;
	}

	private renderAddItem(): HTMLElement {
		const rowElement = $('.setting-exclude-new-row');
		this.patternInput = new InputBox(rowElement, this.contextViewService, {
			placeholder: localize('excludePatternInputPlaceholder', "Exclude Pattern...")
		});
		this.patternInput.element.classList.add('setting-exclude-patternInput');
		this._register(attachInputBoxStyler(this.patternInput, this.themeService, {
			inputBackground: settingsTextInputBackground,
			inputForeground: settingsTextInputForeground,
			inputBorder: settingsTextInputBorder
		}));
		this._register(this.patternInput);

		const addPatternButton = this._register(new Button(rowElement));
		addPatternButton.label = localize('addPattern', "Add Pattern");
		addPatternButton.element.classList.add('setting-exclude-addPattern', 'setting-exclude-addButton');
		this._register(attachButtonStyler(addPatternButton, this.themeService));

		const addItem = () => this._onDidChangeExclude.fire({
			originalPattern: undefined,
			pattern: this.patternInput.value
		});

		this._register(addPatternButton.onDidClick(addItem));

		const onKeydown = (e: StandardKeyboardEvent) => {
			if (e.equals(KeyCode.Enter)) {
				addItem();
			}
		};
		this._register(DOM.addStandardDisposableListener(this.patternInput.inputElement, DOM.EventType.KEY_DOWN, onKeydown));

		return rowElement;
	}

	private renderEditItem(item: INewExcludeItem): HTMLElement {
		const rowElement = $('.setting-exclude-edit-row');

		const onKeydown = (e: StandardKeyboardEvent) => {
			if (e.equals(KeyCode.Enter)) {
				this._onDidChangeExclude.fire({
					originalPattern: undefined,
					pattern: patternInput.value
				});
			}
		};

		const patternInput = new InputBox(rowElement, this.contextViewService, {
			placeholder: localize('excludePatternInputPlaceholder', "Exclude Pattern...")
		});
		patternInput.element.classList.add('setting-exclude-patternInput');
		this.listDisposables.push(attachInputBoxStyler(patternInput, this.themeService, {
			inputBackground: settingsTextInputBackground,
			inputForeground: settingsTextInputForeground,
			inputBorder: settingsTextInputBorder
		}));
		this.listDisposables.push(patternInput);
		this.listDisposables.push(DOM.addStandardDisposableListener(patternInput.inputElement, DOM.EventType.KEY_DOWN, onKeydown));

		const siblingInput = new InputBox(rowElement, this.contextViewService, {
			placeholder: localize('excludeSiblingInputPlaceholder', "When Pattern Is Present...")
		});
		siblingInput.element.classList.add('setting-exclude-siblingInput');
		this.listDisposables.push(siblingInput);
		this.listDisposables.push(attachInputBoxStyler(siblingInput, this.themeService, {
			inputBackground: settingsTextInputBackground,
			inputForeground: settingsTextInputForeground,
			inputBorder: settingsTextInputBorder
		}));
		this.listDisposables.push(DOM.addStandardDisposableListener(siblingInput.inputElement, DOM.EventType.KEY_DOWN, onKeydown));

		rowElement.classList.add('setting-exclude-newExcludeItem');

		rowElement.classList.remove('setting-exclude-newPattern');
		rowElement.classList.remove('setting-exclude-newPatternWithSibling');
		if (item.mode === AddItemMode.Pattern) {
			rowElement.classList.add('setting-exclude-newPattern');
			patternInput.focus();
			patternInput.select();
		} else if (item.mode === AddItemMode.PatternWithSibling) {
			rowElement.classList.add('setting-exclude-newPatternWithSibling');
		}

		return rowElement;
	}

	dispose() {
		super.dispose();
		this.listDisposables = dispose(this.listDisposables);
	}
}

interface IExcludeDataItem {
	id: string;
	pattern: string;
	sibling?: string;
}

interface INewExcludeItem {
	id: string;
	mode: AddItemMode;
}

type IExcludeItem = IExcludeDataItem | INewExcludeItem;

function isExcludeDataItem(excludeItem: IExcludeItem): excludeItem is IExcludeDataItem {
	return !!(<IExcludeDataItem>excludeItem).pattern;
}

// class EditExcludeItemAction extends Action {

// 	static readonly ID = 'workbench.action.editExcludeItem';
// 	static readonly LABEL = localize('editExcludeItem', "Edit Exclude Item");

// 	constructor() {
// 		super(EditExcludeItemAction.ID, EditExcludeItemAction.LABEL);

// 		this.class = 'setting-excludeAction-edit';
// 	}

// 	run(item: IExcludeItem): TPromise<boolean> {
// 		return TPromise.wrap(true);
// 	}
// }
