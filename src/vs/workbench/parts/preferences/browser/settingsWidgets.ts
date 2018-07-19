/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { Button } from 'vs/base/browser/ui/button/button';
import { Checkbox } from 'vs/base/browser/ui/checkbox/checkbox';
import { InputBox } from 'vs/base/browser/ui/inputbox/inputBox';
import { IRenderer, IVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { Action } from 'vs/base/common/actions';
import { Emitter, Event } from 'vs/base/common/event';
import { KeyCode } from 'vs/base/common/keyCodes';
import { Disposable, dispose, IDisposable } from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';
import 'vs/css!./media/settingsWidgets';
import { localize } from 'vs/nls';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { WorkbenchList } from 'vs/platform/list/browser/listService';
import { foreground, inputBackground, inputBorder, inputForeground, registerColor, selectBackground, selectBorder, selectForeground, textLinkForeground } from 'vs/platform/theme/common/colorRegistry';
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
		collector.addRule(`.settings-editor > .settings-header > .settings-header-controls .settings-tabs-widget .action-label { color: ${foregroundColor}; };`);
	}
});

enum AddItemMode {
	None,
	Pattern,
	PatternWithSibling
}

export class ExcludeSettingListModel {
	private _dataItems: IExcludeItem[];
	private _newItem: AddItemMode;

	get items(): IExcludeItem[] {
		const items = [
			...this._dataItems
		];

		items.push(<INewExcludeItem>{
			id: 'newItem',
			mode: this._newItem
		});

		return items;
	}

	setAddItemMode(mode: AddItemMode): void {
		this._newItem = mode;
	}

	setValue(excludeValue: any): void {
		this._dataItems = this.excludeValueToItems(excludeValue);
	}

	private excludeValueToItems(excludeValue: any): IExcludeItem[] {
		return Object.keys(excludeValue).map(key => {
			const value = excludeValue[key];
			const enabled = !!value;
			const sibling = typeof value === 'boolean' ? undefined : value.when;

			return {
				id: key,
				enabled,
				pattern: key,
				sibling
			};
		});
	}
}

export class ExcludeSettingWidget extends Disposable {
	private list: WorkbenchList<IExcludeItem>;

	private model = new ExcludeSettingListModel();

	constructor(
		container: HTMLElement,
		@IThemeService private themeService: IThemeService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super();

		const dataRenderer = new ExcludeDataItemRenderer();
		const newItemRenderer = this.instantiationService.createInstance(NewExcludeRenderer);
		const delegate = new ExcludeSettingListDelegate();
		this.list = this.instantiationService.createInstance(WorkbenchList, container, delegate, [newItemRenderer, dataRenderer], {
			identityProvider: element => element.id,
			multipleSelectionSupport: false
		}) as WorkbenchList<IExcludeItem>;
		this._register(this.list);

		const addPatternButton = this._register(new Button(container));
		addPatternButton.label = localize('addPattern', "Add Pattern");
		addPatternButton.element.classList.add('setting-exclude-addPattern', 'setting-exclude-addButton');
		this._register(attachButtonStyler(addPatternButton, this.themeService));
		this._register(addPatternButton.onDidClick(() => {
			this.model.setAddItemMode(AddItemMode.Pattern);
			this.update();
		}));

		const addSiblingPatternButton = this._register(new Button(container));
		addSiblingPatternButton.label = localize('addSiblingPattern', "Add Sibling Pattern");
		addSiblingPatternButton.element.classList.add('setting-exclude-addButton');
		this._register(attachButtonStyler(addSiblingPatternButton, this.themeService));
		this._register(addSiblingPatternButton.onDidClick(() => {
			this.model.setAddItemMode(AddItemMode.PatternWithSibling);
			this.update();
		}));
	}

	setValue(excludeValue: any): void {
		this.model.setValue(excludeValue);
		this.update();
	}

	private update(): void {
		this.list.splice(0, this.list.length, this.model.items);

		const listHeight = 22 * this.model.items.length;
		this.list.layout(listHeight);
		this.list.getHTMLElement().style.height = listHeight + 'px';
	}
}

interface IExcludeDataItem {
	id: string;
	enabled: boolean;
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

interface IExcludeDataItemTemplate {
	container: HTMLElement;

	checkbox: Checkbox;
	actionBar: ActionBar;
	patternElement: HTMLElement;
	siblingElement: HTMLElement;
	toDispose: IDisposable[];
}

class ExcludeDataItemRenderer implements IRenderer<IExcludeDataItem, IExcludeDataItemTemplate> {
	static readonly templateId: string = 'excludeDataItem';

	get templateId(): string {
		return ExcludeDataItemRenderer.templateId;
	}

	renderTemplate(container: HTMLElement): IExcludeDataItemTemplate {
		const toDispose = [];

		const checkbox = new Checkbox({ actionClassName: 'setting-exclude-checkbox', isChecked: true, title: '', inputActiveOptionBorder: null });
		container.appendChild(checkbox.domNode);
		toDispose.push(checkbox);
		toDispose.push(checkbox.onChange(() => {
			// if (template.onChange) {
			// 	template.onChange(checkbox.checked);
			// }
		}));

		const actionBar = new ActionBar(container);
		toDispose.push(actionBar);

		const editAction = new EditExcludeItemAction();
		const removeAction = new RemoveExcludeItemAction();
		toDispose.push(editAction, removeAction);
		actionBar.push([
			editAction, removeAction
		], { icon: true, label: false });

		return {
			container,
			checkbox,
			patternElement: DOM.append(container, $('.setting-exclude-pattern')),
			siblingElement: DOM.append(container, $('.setting-exclude-sibling')),
			toDispose,
			actionBar
		};
	}

	renderElement(element: IExcludeDataItem, index: number, templateData: IExcludeDataItemTemplate): void {
		templateData.patternElement.textContent = element.pattern;
		templateData.siblingElement.textContent = element.sibling;

		templateData.container.title = element.sibling ?
			localize('excludeSiblingHintLabel', "Exclude files matching `{0}`, only when a file matching `{1}` is present", element.pattern, element.sibling) :
			localize('excludePatternHintLabel', "Exclude files matching `{0}`", element.pattern);
	}

	disposeElement(element: IExcludeDataItem, index: number, templateData: IExcludeDataItemTemplate): void {
	}

	disposeTemplate(templateData: IExcludeDataItemTemplate): void {
		dispose(templateData.toDispose);
	}
}

interface INewExcludeItemTemplate {
	container: HTMLElement;

	patternInput: InputBox;
	siblingInput: InputBox;
	toDispose: IDisposable[];
}

interface INewExcludeItemEvent {
	pattern: string;
	sibling?: string;
}

class NewExcludeRenderer implements IRenderer<INewExcludeItem, INewExcludeItemTemplate> {
	static readonly templateId: string = 'newExcludeItem';

	private readonly _onNewExcludeItem: Emitter<INewExcludeItemEvent> = new Emitter<INewExcludeItemEvent>();
	public readonly onNewExcludeItem: Event<INewExcludeItemEvent> = this._onNewExcludeItem.event;

	constructor(
		@IContextViewService private contextViewService: IContextViewService,
		@IThemeService private themeService: IThemeService
	) {
	}

	get templateId(): string {
		return NewExcludeRenderer.templateId;
	}

	renderTemplate(container: HTMLElement): INewExcludeItemTemplate {
		const toDispose = [];

		const onKeydown = (e: StandardKeyboardEvent) => {
			if (e.equals(KeyCode.Enter)) {
				this._onNewExcludeItem.fire({
					pattern: patternInput.value,
					sibling: siblingInput.value
				});
			}
		};

		const patternInput = new InputBox(container, this.contextViewService, {
			placeholder: localize('excludePatternInputPlaceholder', "Exclude Pattern...")
		});
		patternInput.element.classList.add('setting-exclude-patternInput');
		toDispose.push(attachInputBoxStyler(patternInput, this.themeService, {
			inputBackground: settingsTextInputBackground,
			inputForeground: settingsTextInputForeground,
			inputBorder: settingsTextInputBorder
		}));
		toDispose.push(patternInput);
		toDispose.push(DOM.addStandardDisposableListener(patternInput.inputElement, DOM.EventType.KEY_DOWN, onKeydown));

		const siblingInput = new InputBox(container, this.contextViewService, {
			placeholder: localize('excludeSiblingInputPlaceholder', "When Pattern Is Present...")
		});
		siblingInput.element.classList.add('setting-exclude-siblingInput');
		toDispose.push(siblingInput);
		toDispose.push(attachInputBoxStyler(siblingInput, this.themeService, {
			inputBackground: settingsTextInputBackground,
			inputForeground: settingsTextInputForeground,
			inputBorder: settingsTextInputBorder
		}));
		toDispose.push(DOM.addStandardDisposableListener(siblingInput.inputElement, DOM.EventType.KEY_DOWN, onKeydown));

		return {
			container,
			patternInput,
			siblingInput,
			toDispose
		};
	}

	renderElement(element: INewExcludeItem, index: number, templateData: INewExcludeItemTemplate): void {
		templateData.container.classList.add('setting-exclude-newExcludeItem');

		templateData.container.classList.remove('setting-exclude-newPattern');
		templateData.container.classList.remove('setting-exclude-newPatternWithSibling');
		if (element.mode === AddItemMode.Pattern) {
			templateData.container.classList.add('setting-exclude-newPattern');
		} else if (element.mode === AddItemMode.PatternWithSibling) {
			templateData.container.classList.add('setting-exclude-newPatternWithSibling');
		}
	}

	disposeElement(element: INewExcludeItem, index: number, templateData: INewExcludeItemTemplate): void {
	}

	disposeTemplate(templateData: INewExcludeItemTemplate): void {
		dispose(templateData.toDispose);
	}
}

class ExcludeSettingListDelegate implements IVirtualDelegate<IExcludeItem> {
	getHeight(element: IExcludeItem): number {
		return 22;
	}

	getTemplateId(element: IExcludeItem): string {
		if (isExcludeDataItem(element)) {
			return ExcludeDataItemRenderer.templateId;
		} else {
			return NewExcludeRenderer.templateId;
		}
	}
}

class EditExcludeItemAction extends Action {

	static readonly ID = 'workbench.action.editExcludeItem';
	static readonly LABEL = localize('editExcludeItem', "Edit Exclude Item");

	constructor() {
		super(EditExcludeItemAction.ID, EditExcludeItemAction.LABEL);

		this.class = 'setting-excludeAction-edit';
	}

	run(item: IExcludeItem): TPromise<boolean> {
		return TPromise.wrap(true);
	}
}

class RemoveExcludeItemAction extends Action {

	static readonly ID = 'workbench.action.removeExcludeItem';
	static readonly LABEL = localize('removeExcludeItem', "Remove Exclude Item");

	constructor() {
		super(RemoveExcludeItemAction.ID, RemoveExcludeItemAction.LABEL);

		this.class = 'setting-excludeAction-remove';
	}

	run(item: IExcludeItem): TPromise<boolean> {
		return TPromise.wrap(true);
	}
}
