/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { renderMarkdown } from 'vs/base/browser/htmlContentRenderer';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { IMouseEvent } from 'vs/base/browser/mouseEvent';
import { Button } from 'vs/base/browser/ui/button/button';
import { Checkbox } from 'vs/base/browser/ui/checkbox/checkbox';
import { InputBox } from 'vs/base/browser/ui/inputbox/inputBox';
import { SelectBox } from 'vs/base/browser/ui/selectBox/selectBox';
import * as arrays from 'vs/base/common/arrays';
import { Color, RGBA } from 'vs/base/common/color';
import { onUnexpectedError } from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { KeyCode } from 'vs/base/common/keyCodes';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import * as objects from 'vs/base/common/objects';
import { escapeRegExpCharacters, startsWith } from 'vs/base/common/strings';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { IAccessibilityProvider, IDataSource, IFilter, IRenderer as ITreeRenderer, ITree, ITreeConfiguration } from 'vs/base/parts/tree/browser/tree';
import { DefaultTreestyler } from 'vs/base/parts/tree/browser/treeDefaults';
import { Tree } from 'vs/base/parts/tree/browser/treeImpl';
import { localize } from 'vs/nls';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { WorkbenchTreeController } from 'vs/platform/list/browser/listService';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { editorBackground, focusBorder, foreground } from 'vs/platform/theme/common/colorRegistry';
import { attachButtonStyler, attachInputBoxStyler, attachSelectBoxStyler, attachStyler } from 'vs/platform/theme/common/styler';
import { ICssStyleCollector, ITheme, IThemeService, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { ITOCEntry } from 'vs/workbench/parts/preferences/browser/settingsLayout';
import { ISettingsEditorViewState, isExcludeSetting, SettingsTreeElement, SettingsTreeGroupElement, SettingsTreeNewExtensionsElement, SettingsTreeSettingElement } from 'vs/workbench/parts/preferences/browser/settingsTreeModels';
import { ExcludeSettingWidget, IExcludeDataItem, settingsHeaderForeground, settingsNumberInputBackground, settingsNumberInputBorder, settingsNumberInputForeground, settingsSelectBackground, settingsSelectBorder, settingsSelectForeground, settingsTextInputBackground, settingsTextInputBorder, settingsTextInputForeground } from 'vs/workbench/parts/preferences/browser/settingsWidgets';
import { ISetting, ISettingsGroup } from 'vs/workbench/services/preferences/common/preferences';

const $ = DOM.$;


function getExcludeDisplayValue(element: SettingsTreeSettingElement): IExcludeDataItem[] {
	const data = element.isConfigured ?
		objects.mixin({ ...element.scopeValue }, element.defaultValue, false) :
		element.defaultValue;

	return Object.keys(data)
		.filter(key => !!data[key])
		.map(key => {
			const value = data[key];
			const sibling = typeof value === 'boolean' ? undefined : value.when;

			return {
				id: key,
				pattern: key,
				sibling
			};
		});
}

export function resolveSettingsTree(tocData: ITOCEntry, coreSettingsGroups: ISettingsGroup[]): { tree: ITOCEntry, leftoverSettings: Set<ISetting> } {
	const allSettings = getFlatSettings(coreSettingsGroups);
	return {
		tree: _resolveSettingsTree(tocData, allSettings),
		leftoverSettings: allSettings
	};
}

export function resolveExtensionsSettings(groups: ISettingsGroup[]): ITOCEntry {
	const settingsGroupToEntry = (group: ISettingsGroup) => {
		const flatSettings = arrays.flatten(
			group.sections.map(section => section.settings));

		return {
			id: group.id,
			label: group.title,
			settings: flatSettings
		};
	};

	const extGroups = groups
		.sort((a, b) => a.title.localeCompare(b.title))
		.map(g => settingsGroupToEntry(g));

	return {
		id: 'extensions',
		label: localize('extensions', "Extensions"),
		children: extGroups
	};
}

function _resolveSettingsTree(tocData: ITOCEntry, allSettings: Set<ISetting>): ITOCEntry {
	if (tocData.settings) {
		return <ITOCEntry>{
			id: tocData.id,
			label: tocData.label,
			settings: arrays.flatten(tocData.settings.map(pattern => getMatchingSettings(allSettings, <string>pattern)))
		};
	} else if (tocData.children) {
		return <ITOCEntry>{
			id: tocData.id,
			label: tocData.label,
			children: tocData.children
				.map(child => _resolveSettingsTree(child, allSettings))
				.filter(child => (child.children && child.children.length) || (child.settings && child.settings.length))
		};
	}

	return null;
}

function getMatchingSettings(allSettings: Set<ISetting>, pattern: string): ISetting[] {
	const result: ISetting[] = [];

	allSettings.forEach(s => {
		if (settingMatches(s, pattern)) {
			result.push(s);
			allSettings.delete(s);
		}
	});


	return result.sort((a, b) => a.key.localeCompare(b.key));
}

function settingMatches(s: ISetting, pattern: string): boolean {
	pattern = escapeRegExpCharacters(pattern)
		.replace(/\\\*/g, '.*');

	const regexp = new RegExp(`^${pattern}`, 'i');
	return regexp.test(s.key);
}

function getFlatSettings(settingsGroups: ISettingsGroup[]) {
	const result: Set<ISetting> = new Set();

	for (let group of settingsGroups) {
		for (let section of group.sections) {
			for (let s of section.settings) {
				if (!s.overrides || !s.overrides.length) {
					result.add(s);
				}
			}
		}
	}

	return result;
}


export class SettingsDataSource implements IDataSource {

	getId(tree: ITree, element: SettingsTreeElement): string {
		return element.id;
	}

	hasChildren(tree: ITree, element: SettingsTreeElement): boolean {
		if (element instanceof SettingsTreeGroupElement) {
			return true;
		}

		return false;
	}

	getChildren(tree: ITree, element: SettingsTreeElement): TPromise<any> {
		return TPromise.as(this._getChildren(element));
	}

	private _getChildren(element: SettingsTreeElement): SettingsTreeElement[] {
		if (element instanceof SettingsTreeGroupElement) {
			return element.children;
		} else {
			// No children...
			return null;
		}
	}

	getParent(tree: ITree, element: SettingsTreeElement): TPromise<any> {
		return TPromise.wrap(element && element.parent);
	}

	shouldAutoexpand(): boolean {
		return true;
	}
}

interface IDisposableTemplate {
	toDispose: IDisposable[];
}

interface ISettingItemTemplate<T = any> extends IDisposableTemplate {
	onChange?: (value: T) => void;

	context?: SettingsTreeSettingElement;
	containerElement: HTMLElement;
	categoryElement: HTMLElement;
	labelElement: HTMLElement;
	descriptionElement: HTMLElement;
	controlElement: HTMLElement;
	isConfiguredElement: HTMLElement;
	otherOverridesElement: HTMLElement;
}

interface ISettingBoolItemTemplate extends ISettingItemTemplate<boolean> {
	checkbox: Checkbox;
}

interface ISettingTextItemTemplate extends ISettingItemTemplate<string> {
	inputBox: InputBox;
}

type ISettingNumberItemTemplate = ISettingTextItemTemplate;

interface ISettingEnumItemTemplate extends ISettingItemTemplate<number> {
	selectBox: SelectBox;
	enumDescriptionElement: HTMLElement;
}

interface ISettingComplexItemTemplate extends ISettingItemTemplate<void> {
	button: Button;
}

interface ISettingExcludeItemTemplate extends ISettingItemTemplate<void> {
	excludeWidget: ExcludeSettingWidget;
}

interface ISettingNewExtensionsTemplate extends IDisposableTemplate {
	button: Button;
	context?: SettingsTreeNewExtensionsElement;
}

interface IGroupTitleTemplate extends IDisposableTemplate {
	context?: SettingsTreeGroupElement;
	parent: HTMLElement;
}

const SETTINGS_TEXT_TEMPLATE_ID = 'settings.text.template';
const SETTINGS_NUMBER_TEMPLATE_ID = 'settings.number.template';
const SETTINGS_ENUM_TEMPLATE_ID = 'settings.enum.template';
const SETTINGS_BOOL_TEMPLATE_ID = 'settings.bool.template';
const SETTINGS_EXCLUDE_TEMPLATE_ID = 'settings.exclude.template';
const SETTINGS_COMPLEX_TEMPLATE_ID = 'settings.complex.template';
const SETTINGS_NEW_EXTENSIONS_TEMPLATE_ID = 'settings.newExtensions.template';
const SETTINGS_GROUP_ELEMENT_TEMPLATE_ID = 'settings.group.template';

export interface ISettingChangeEvent {
	key: string;
	value: any; // undefined => reset/unconfigure
}

export class SettingsRenderer implements ITreeRenderer {

	public static readonly MAX_ENUM_DESCRIPTIONS = 10;

	public static readonly CONTROL_CLASS = 'setting-control-focus-target';
	public static readonly CONTROL_SELECTOR = '.' + SettingsRenderer.CONTROL_CLASS;

	private static readonly SETTING_KEY_ATTR = 'data-key';

	private readonly _onDidChangeSetting: Emitter<ISettingChangeEvent> = new Emitter<ISettingChangeEvent>();
	public readonly onDidChangeSetting: Event<ISettingChangeEvent> = this._onDidChangeSetting.event;

	private readonly _onDidOpenSettings: Emitter<string> = new Emitter<string>();
	public readonly onDidOpenSettings: Event<string> = this._onDidOpenSettings.event;

	private readonly _onDidClickSettingLink: Emitter<string> = new Emitter<string>();
	public readonly onDidClickSettingLink: Event<string> = this._onDidClickSettingLink.event;

	private readonly _onDidFocusSetting: Emitter<SettingsTreeSettingElement> = new Emitter<SettingsTreeSettingElement>();
	public readonly onDidFocusSetting: Event<SettingsTreeSettingElement> = this._onDidFocusSetting.event;

	private measureContainer: HTMLElement;
	private measureTemplatesPool = new Map<string, ISettingItemTemplate>();
	private rowHeightCache = new Map<string, number>();
	private lastRenderedWidth: number;

	constructor(
		_measureContainer: HTMLElement,
		@IThemeService private themeService: IThemeService,
		@IContextViewService private contextViewService: IContextViewService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		this.measureContainer = DOM.append(_measureContainer, $('.setting-measure-container.monaco-tree-row'));
	}

	updateWidth(width: number): void {
		if (this.lastRenderedWidth !== width) {
			this.rowHeightCache = new Map<string, number>();
		}

		this.lastRenderedWidth = width;
	}

	getHeight(tree: ITree, element: SettingsTreeElement): number {
		if (this.rowHeightCache.has(element.id)) {
			return this.rowHeightCache.get(element.id);
		}

		const h = this._getHeight(tree, element);
		this.rowHeightCache.set(element.id, h);
		return h;
	}

	_getHeight(tree: ITree, element: SettingsTreeElement): number {
		if (element instanceof SettingsTreeGroupElement) {
			if (element.isFirstGroup) {
				return 31;
			}

			return 40 + (7 * element.level);
		}

		if (element instanceof SettingsTreeSettingElement) {
			if (isExcludeSetting(element.setting)) {
				return this._getExcludeSettingHeight(element);
			} else {
				return this.measureSettingElementHeight(tree, element);
			}
		}

		if (element instanceof SettingsTreeNewExtensionsElement) {
			return 40;
		}

		return 0;
	}

	_getExcludeSettingHeight(element: SettingsTreeSettingElement): number {
		const displayValue = getExcludeDisplayValue(element);
		return (displayValue.length + 1) * 22 + 80;
	}

	private measureSettingElementHeight(tree: ITree, element: SettingsTreeSettingElement): number {
		const templateId = this.getTemplateId(tree, element);
		const template: ISettingItemTemplate = this.measureTemplatesPool.get(templateId) || this.renderTemplate(tree, templateId, $('.setting-measure-helper')) as ISettingItemTemplate;
		this.renderElement(tree, element, templateId, template);

		this.measureContainer.appendChild(template.containerElement);
		const height = this.measureContainer.offsetHeight;
		this.measureContainer.removeChild(this.measureContainer.firstChild);
		return height;
	}

	getTemplateId(tree: ITree, element: SettingsTreeElement): string {

		if (element instanceof SettingsTreeGroupElement) {
			return SETTINGS_GROUP_ELEMENT_TEMPLATE_ID;
		}

		if (element instanceof SettingsTreeSettingElement) {
			if (element.valueType === 'boolean') {
				return SETTINGS_BOOL_TEMPLATE_ID;
			}

			if (element.valueType === 'integer' || element.valueType === 'number') {
				return SETTINGS_NUMBER_TEMPLATE_ID;
			}

			if (element.valueType === 'string') {
				return SETTINGS_TEXT_TEMPLATE_ID;
			}

			if (element.valueType === 'enum') {
				return SETTINGS_ENUM_TEMPLATE_ID;
			}

			if (element.valueType === 'exclude') {
				return SETTINGS_EXCLUDE_TEMPLATE_ID;
			}

			return SETTINGS_COMPLEX_TEMPLATE_ID;
		}

		if (element instanceof SettingsTreeNewExtensionsElement) {
			return SETTINGS_NEW_EXTENSIONS_TEMPLATE_ID;
		}

		return '';
	}

	renderTemplate(tree: ITree, templateId: string, container: HTMLElement) {
		if (templateId === SETTINGS_GROUP_ELEMENT_TEMPLATE_ID) {
			return this.renderGroupTitleTemplate(container);
		}

		if (templateId === SETTINGS_TEXT_TEMPLATE_ID) {
			return this.renderSettingTextTemplate(tree, container);
		}

		if (templateId === SETTINGS_NUMBER_TEMPLATE_ID) {
			return this.renderSettingNumberTemplate(tree, container);
		}

		if (templateId === SETTINGS_BOOL_TEMPLATE_ID) {
			return this.renderSettingBoolTemplate(tree, container);
		}

		if (templateId === SETTINGS_ENUM_TEMPLATE_ID) {
			return this.renderSettingEnumTemplate(tree, container);
		}

		if (templateId === SETTINGS_EXCLUDE_TEMPLATE_ID) {
			return this.renderSettingExcludeTemplate(tree, container);
		}

		if (templateId === SETTINGS_COMPLEX_TEMPLATE_ID) {
			return this.renderSettingComplexTemplate(tree, container);
		}

		if (templateId === SETTINGS_NEW_EXTENSIONS_TEMPLATE_ID) {
			return this.renderNewExtensionsTemplate(container);
		}

		return null;
	}

	private renderGroupTitleTemplate(container: HTMLElement): IGroupTitleTemplate {
		DOM.addClass(container, 'group-title');

		const toDispose = [];
		const template: IGroupTitleTemplate = {
			parent: container,
			toDispose
		};

		return template;
	}

	private renderCommonTemplate(tree: ITree, container: HTMLElement, typeClass: string): ISettingItemTemplate {
		DOM.addClass(container, 'setting-item');
		DOM.addClass(container, 'setting-item-' + typeClass);
		const titleElement = DOM.append(container, $('.setting-item-title'));
		const categoryElement = DOM.append(titleElement, $('span.setting-item-category'));
		const labelElement = DOM.append(titleElement, $('span.setting-item-label'));
		const isConfiguredElement = DOM.append(titleElement, $('span.setting-item-is-configured-label'));
		isConfiguredElement.textContent = localize('configured', "Modified");
		const otherOverridesElement = DOM.append(titleElement, $('span.setting-item-overrides'));
		const descriptionElement = DOM.append(container, $('.setting-item-description'));

		const valueElement = DOM.append(container, $('.setting-item-value'));
		const controlElement = DOM.append(valueElement, $('div.setting-item-control'));

		const toDispose = [];
		const template: ISettingItemTemplate = {
			toDispose,

			containerElement: container,
			categoryElement,
			labelElement,
			descriptionElement,
			controlElement,
			isConfiguredElement,
			otherOverridesElement
		};

		// Prevent clicks from being handled by list
		toDispose.push(DOM.addDisposableListener(controlElement, 'mousedown', (e: IMouseEvent) => e.stopPropagation()));

		toDispose.push(DOM.addStandardDisposableListener(valueElement, 'keydown', (e: StandardKeyboardEvent) => {
			if (e.keyCode === KeyCode.Escape) {
				tree.domFocus();
				e.browserEvent.stopPropagation();
			}
		}));

		return template;
	}

	private addSettingElementFocusHandler(template: ISettingItemTemplate): void {
		template.toDispose.push(DOM.addDisposableListener(template.containerElement, 'focus', e => {
			if (template.context) {
				this._onDidFocusSetting.fire(template.context);
			}
		}, true));
	}

	private renderSettingTextTemplate(tree: ITree, container: HTMLElement, type = 'text'): ISettingTextItemTemplate {
		const common = this.renderCommonTemplate(tree, container, 'text');

		const inputBox = new InputBox(common.controlElement, this.contextViewService);
		common.toDispose.push(inputBox);
		common.toDispose.push(attachInputBoxStyler(inputBox, this.themeService, {
			inputBackground: settingsTextInputBackground,
			inputForeground: settingsTextInputForeground,
			inputBorder: settingsTextInputBorder
		}));
		common.toDispose.push(
			inputBox.onDidChange(e => {
				if (template.onChange) {
					template.onChange(e);
				}
			}));
		common.toDispose.push(inputBox);
		inputBox.inputElement.classList.add(SettingsRenderer.CONTROL_CLASS);

		const template: ISettingTextItemTemplate = {
			...common,
			inputBox
		};

		this.addSettingElementFocusHandler(template);

		return template;
	}

	private renderSettingNumberTemplate(tree: ITree, container: HTMLElement): ISettingNumberItemTemplate {
		const common = this.renderCommonTemplate(tree, container, 'number');

		const inputBox = new InputBox(common.controlElement, this.contextViewService);
		common.toDispose.push(inputBox);
		common.toDispose.push(attachInputBoxStyler(inputBox, this.themeService, {
			inputBackground: settingsNumberInputBackground,
			inputForeground: settingsNumberInputForeground,
			inputBorder: settingsNumberInputBorder
		}));
		common.toDispose.push(
			inputBox.onDidChange(e => {
				if (template.onChange) {
					template.onChange(e);
				}
			}));
		common.toDispose.push(inputBox);
		inputBox.inputElement.classList.add(SettingsRenderer.CONTROL_CLASS);

		const template: ISettingNumberItemTemplate = {
			...common,
			inputBox
		};

		this.addSettingElementFocusHandler(template);

		return template;
	}

	private renderSettingBoolTemplate(tree: ITree, container: HTMLElement): ISettingBoolItemTemplate {
		DOM.addClass(container, 'setting-item');
		DOM.addClass(container, 'setting-item-bool');

		const titleElement = DOM.append(container, $('.setting-item-title'));
		const categoryElement = DOM.append(titleElement, $('span.setting-item-category'));
		const labelElement = DOM.append(titleElement, $('span.setting-item-label'));
		const isConfiguredElement = DOM.append(titleElement, $('span.setting-item-is-configured-label'));
		isConfiguredElement.textContent = localize('configured', "Modified");
		const otherOverridesElement = DOM.append(titleElement, $('span.setting-item-overrides'));

		const descriptionAndValueElement = DOM.append(container, $('.setting-item-value-description'));
		const controlElement = DOM.append(descriptionAndValueElement, $('.setting-item-bool-control'));
		const descriptionElement = DOM.append(descriptionAndValueElement, $('.setting-item-description'));

		const toDispose = [];
		const checkbox = new Checkbox({ actionClassName: 'setting-value-checkbox', isChecked: true, title: '', inputActiveOptionBorder: null });
		controlElement.appendChild(checkbox.domNode);
		toDispose.push(checkbox);
		toDispose.push(checkbox.onChange(() => {
			if (template.onChange) {
				template.onChange(checkbox.checked);
			}
		}));
		checkbox.domNode.classList.add(SettingsRenderer.CONTROL_CLASS);

		const template: ISettingBoolItemTemplate = {
			toDispose,

			containerElement: container,
			categoryElement,
			labelElement,
			controlElement,
			checkbox,
			descriptionElement,
			isConfiguredElement,
			otherOverridesElement
		};

		this.addSettingElementFocusHandler(template);

		// Prevent clicks from being handled by list
		toDispose.push(DOM.addDisposableListener(controlElement, 'mousedown', (e: IMouseEvent) => e.stopPropagation()));

		toDispose.push(DOM.addStandardDisposableListener(controlElement, 'keydown', (e: StandardKeyboardEvent) => {
			if (e.keyCode === KeyCode.Escape) {
				tree.domFocus();
				e.browserEvent.stopPropagation();
			}
		}));

		return template;
	}

	private renderSettingEnumTemplate(tree: ITree, container: HTMLElement): ISettingEnumItemTemplate {
		const common = this.renderCommonTemplate(tree, container, 'enum');

		const selectBox = new SelectBox([], undefined, this.contextViewService);
		common.toDispose.push(selectBox);
		common.toDispose.push(attachSelectBoxStyler(selectBox, this.themeService, {
			selectBackground: settingsSelectBackground,
			selectForeground: settingsSelectForeground,
			selectBorder: settingsSelectBorder
		}));
		selectBox.render(common.controlElement);
		const selectElement = common.controlElement.querySelector('select');
		if (selectElement) {
			selectElement.classList.add(SettingsRenderer.CONTROL_CLASS);
		}

		common.toDispose.push(
			selectBox.onDidSelect(e => {
				if (template.onChange) {
					template.onChange(e.index);
				}
			}));

		const enumDescriptionElement = common.containerElement.insertBefore($('.setting-item-enumDescription'), common.descriptionElement.nextSibling);

		const template: ISettingEnumItemTemplate = {
			...common,
			selectBox,
			enumDescriptionElement
		};

		this.addSettingElementFocusHandler(template);

		return template;
	}

	private renderSettingExcludeTemplate(tree: ITree, container: HTMLElement): ISettingExcludeItemTemplate {
		const common = this.renderCommonTemplate(tree, container, 'exclude');

		const excludeWidget = this.instantiationService.createInstance(ExcludeSettingWidget, common.controlElement);
		excludeWidget.domNode.classList.add(SettingsRenderer.CONTROL_CLASS);
		common.toDispose.push(excludeWidget);

		const template: ISettingExcludeItemTemplate = {
			...common,
			excludeWidget
		};

		this.addSettingElementFocusHandler(template);

		common.toDispose.push(excludeWidget.onDidChangeExclude(e => {
			if (template.context) {
				const newValue = {
					...template.context.scopeValue
				};

				if (e.pattern) {
					if (e.originalPattern in newValue) {
						// editing something present in the value
						newValue[e.pattern] = newValue[e.originalPattern];
						delete newValue[e.originalPattern];
					} else if (e.originalPattern) {
						// editing a default
						newValue[e.originalPattern] = false;
						newValue[e.pattern] = template.context.defaultValue[e.originalPattern];
					} else {
						// adding a new pattern
						newValue[e.pattern] = true;
					}
				} else {
					if (e.originalPattern in newValue) {
						// deleting a configured pattern
						delete newValue[e.originalPattern];
					} else if (e.originalPattern) {
						// "deleting" a default by overriding it
						newValue[e.originalPattern] = false;
					}
				}

				this._onDidChangeSetting.fire({
					key: template.context.setting.key,
					value: newValue
				});
			}
		}));

		return template;
	}

	private renderSettingComplexTemplate(tree: ITree, container: HTMLElement): ISettingComplexItemTemplate {
		const common = this.renderCommonTemplate(tree, container, 'complex');

		const openSettingsButton = new Button(common.controlElement, { title: true, buttonBackground: null, buttonHoverBackground: null });
		common.toDispose.push(openSettingsButton);
		common.toDispose.push(openSettingsButton.onDidClick(() => template.onChange(null)));
		openSettingsButton.label = localize('editInSettingsJson', "Edit in settings.json");
		openSettingsButton.element.classList.add('edit-in-settings-button');

		common.toDispose.push(attachButtonStyler(openSettingsButton, this.themeService, {
			buttonBackground: Color.transparent.toString(),
			buttonHoverBackground: Color.transparent.toString(),
			buttonForeground: 'foreground'
		}));

		const template: ISettingComplexItemTemplate = {
			...common,
			button: openSettingsButton
		};

		this.addSettingElementFocusHandler(template);

		return template;
	}

	private renderNewExtensionsTemplate(container: HTMLElement): ISettingNewExtensionsTemplate {
		const toDispose = [];

		container.classList.add('setting-item-new-extensions');

		const button = new Button(container, { title: true, buttonBackground: null, buttonHoverBackground: null });
		toDispose.push(button);
		toDispose.push(button.onDidClick(() => {
			if (template.context) {
				this.commandService.executeCommand('workbench.extensions.action.showExtensionsWithIds', template.context.extensionIds);
			}
		}));
		button.label = localize('newExtensionsButtonLabel', "Show other matching extensions");
		button.element.classList.add('settings-new-extensions-button');
		toDispose.push(attachButtonStyler(button, this.themeService));

		const template: ISettingNewExtensionsTemplate = {
			button,
			toDispose
		};

		// this.addSettingElementFocusHandler(template);

		return template;
	}

	renderElement(tree: ITree, element: SettingsTreeElement, templateId: string, template: any): void {
		if (templateId === SETTINGS_GROUP_ELEMENT_TEMPLATE_ID) {
			return this.renderGroupElement(<SettingsTreeGroupElement>element, template);
		}

		if (templateId === SETTINGS_NEW_EXTENSIONS_TEMPLATE_ID) {
			return this.renderNewExtensionsElement(<SettingsTreeNewExtensionsElement>element, template);
		}

		return this.renderSettingElement(tree, <SettingsTreeSettingElement>element, templateId, template);
	}

	private renderGroupElement(element: SettingsTreeGroupElement, template: IGroupTitleTemplate): void {
		template.parent.innerHTML = '';
		const labelElement = DOM.append(template.parent, $('div.settings-group-title-label'));
		labelElement.classList.add(`settings-group-level-${element.level}`);
		labelElement.textContent = (<SettingsTreeGroupElement>element).label;

		if (element.isFirstGroup) {
			labelElement.classList.add('settings-group-first');
		}
	}

	private renderNewExtensionsElement(element: SettingsTreeNewExtensionsElement, template: ISettingNewExtensionsTemplate): void {
		template.context = element;
	}

	public getSettingKeyForDOMElement(domElement: HTMLElement): string {
		const parent = DOM.findParentWithClass(domElement, 'setting-item');
		if (parent) {
			return parent.getAttribute(SettingsRenderer.SETTING_KEY_ATTR);
		}

		return null;
	}

	public getDOMElementsForSettingKey(treeContainer: HTMLElement, key: string): NodeListOf<HTMLElement> {
		return treeContainer.querySelectorAll(`[${SettingsRenderer.SETTING_KEY_ATTR}="${key}"]`);
	}

	private renderSettingElement(tree: ITree, element: SettingsTreeSettingElement, templateId: string, template: ISettingItemTemplate | ISettingBoolItemTemplate): void {
		template.context = element;

		const setting = element.setting;

		DOM.toggleClass(template.containerElement, 'is-configured', element.isConfigured);
		DOM.toggleClass(template.containerElement, 'is-expanded', true);
		template.containerElement.setAttribute(SettingsRenderer.SETTING_KEY_ATTR, element.setting.key);

		const titleTooltip = setting.key;
		template.categoryElement.textContent = element.displayCategory && (element.displayCategory + ': ');
		template.categoryElement.title = titleTooltip;

		template.labelElement.textContent = element.displayLabel;
		template.labelElement.title = titleTooltip;

		this.renderValue(element, templateId, <ISettingItemTemplate>template);
		template.descriptionElement.innerHTML = '';
		if (element.setting.descriptionIsMarkdown) {
			const renderedDescription = this.renderDescriptionMarkdown(element.description, template.toDispose);
			template.descriptionElement.appendChild(renderedDescription);
		} else {
			template.descriptionElement.innerText = element.description;
		}

		if (element.overriddenScopeList.length) {
			let otherOverridesLabel = element.isConfigured ?
				localize('alsoConfiguredIn', "Also modified in") :
				localize('configuredIn', "Modified in");

			template.otherOverridesElement.textContent = `(${otherOverridesLabel}: ${element.overriddenScopeList.join(', ')})`;
		} else {
			template.otherOverridesElement.textContent = '';
		}
	}

	private renderDescriptionMarkdown(text: string, disposeables: IDisposable[]): HTMLElement {
		// Rewrite `#editor.fontSize#` to link format
		text = fixSettingLinks(text);

		const renderedMarkdown = renderMarkdown({ value: text }, {
			actionHandler: {
				callback: (content: string) => {
					if (startsWith(content, '#')) {
						this._onDidClickSettingLink.fire(content.substr(1));
					} else {
						this.openerService.open(URI.parse(content)).then(void 0, onUnexpectedError);
					}
				},
				disposeables
			}
		});

		renderedMarkdown.classList.add('setting-item-description-markdown');
		cleanRenderedMarkdown(renderedMarkdown);
		return renderedMarkdown;
	}

	private renderValue(element: SettingsTreeSettingElement, templateId: string, template: ISettingItemTemplate | ISettingBoolItemTemplate): void {
		const onChange = value => this._onDidChangeSetting.fire({ key: element.setting.key, value });

		if (templateId === SETTINGS_ENUM_TEMPLATE_ID) {
			this.renderEnum(element, <ISettingEnumItemTemplate>template, onChange);
		} else if (templateId === SETTINGS_TEXT_TEMPLATE_ID) {
			this.renderText(element, <ISettingTextItemTemplate>template, onChange);
		} else if (templateId === SETTINGS_NUMBER_TEMPLATE_ID) {
			this.renderNumber(element, <ISettingTextItemTemplate>template, onChange);
		} else if (templateId === SETTINGS_BOOL_TEMPLATE_ID) {
			this.renderBool(element, <ISettingBoolItemTemplate>template, onChange);
		} else if (templateId === SETTINGS_EXCLUDE_TEMPLATE_ID) {
			this.renderExcludeSetting(element, <ISettingExcludeItemTemplate>template);
		} else if (templateId === SETTINGS_COMPLEX_TEMPLATE_ID) {
			this.renderComplexSetting(element, <ISettingComplexItemTemplate>template);
		}
	}

	private renderBool(dataElement: SettingsTreeSettingElement, template: ISettingBoolItemTemplate, onChange: (value: boolean) => void): void {
		template.onChange = null;
		template.checkbox.checked = dataElement.value;
		template.onChange = onChange;

		// Setup and add ARIA attributes
		// Create id and label for control/input element - parent is wrapper div
		const id = (dataElement.displayCategory + '_' + dataElement.displayLabel).replace(/ /g, '_');
		const label = ' ' + dataElement.displayCategory + ' ' + dataElement.displayLabel + ' checkbox ' + (dataElement.value ? 'checked ' : 'unchecked ') + template.isConfiguredElement.textContent;

		// We use the parent control div for the aria-labelledby target
		// Does not appear you can use the direct label on the element itself within a tree
		template.checkbox.domNode.parentElement.setAttribute('id', id);
		template.checkbox.domNode.parentElement.setAttribute('aria-label', label);

		// Labels will not be read on descendent input elements of the parent treeitem
		// unless defined as role=treeitem and indirect aria-labelledby approach
		// TODO: Determine method to normally label input items with value read last
		template.checkbox.domNode.setAttribute('id', id + 'item');
		template.checkbox.domNode.setAttribute('role', 'treeitem');
		template.checkbox.domNode.setAttribute('aria-labelledby', id + 'item ' + id);

	}

	private renderEnum(dataElement: SettingsTreeSettingElement, template: ISettingEnumItemTemplate, onChange: (value: string) => void): void {
		const displayOptions = getDisplayEnumOptions(dataElement.setting);
		template.selectBox.setOptions(displayOptions);

		const label = ' ' + dataElement.displayCategory + ' ' + dataElement.displayLabel + ' combobox ' + template.isConfiguredElement.textContent;

		template.selectBox.setAriaLabel(label);

		const idx = dataElement.setting.enum.indexOf(dataElement.value);
		template.onChange = null;
		template.selectBox.select(idx);
		template.onChange = idx => onChange(dataElement.setting.enum[idx]);

		if (template.controlElement.firstElementChild) {
			// SelectBox needs to be treeitem to read correctly within tree
			template.controlElement.firstElementChild.setAttribute('role', 'treeitem');
		}

		template.enumDescriptionElement.innerHTML = '';
		// if (dataElement.setting.enumDescriptions && dataElement.setting.enum && dataElement.setting.enum.length < SettingsRenderer.MAX_ENUM_DESCRIPTIONS) {
		// 	if (isSelected) {
		// 		let enumDescriptionText = '\n' + dataElement.setting.enumDescriptions
		// 			.map((desc, i) => {
		// 				const displayEnum = escapeInvisibleChars(dataElement.setting.enum[i]);
		// 				return desc ?
		// 					` - \`${displayEnum}\`: ${desc}` :
		// 					` - \`${dataElement.setting.enum[i]}\``;
		// 			})
		// 			.filter(desc => !!desc)
		// 			.join('\n');

		// 		const renderedMarkdown = this.renderDescriptionMarkdown(fixSettingLinks(enumDescriptionText), template.toDispose);
		// 		template.enumDescriptionElement.appendChild(renderedMarkdown);
		// 	}

		// 	return { overflows: true };
		// }
	}

	private renderText(dataElement: SettingsTreeSettingElement, template: ISettingTextItemTemplate, onChange: (value: string) => void): void {
		template.onChange = null;
		template.inputBox.value = dataElement.value;
		template.onChange = value => onChange(value);

		// Setup and add ARIA attributes
		// Create id and label for control/input element - parent is wrapper div
		const id = (dataElement.displayCategory + '_' + dataElement.displayLabel).replace(/ /g, '_');
		const label = ' ' + dataElement.displayCategory + ' ' + dataElement.displayLabel + ' ' + template.isConfiguredElement.textContent;

		// We use the parent control div for the aria-labelledby target
		// Does not appear you can use the direct label on the element itself within a tree
		template.inputBox.inputElement.parentElement.setAttribute('id', id);
		template.inputBox.inputElement.parentElement.setAttribute('aria-label', label);

		// Labels will not be read on descendent input elements of the parent treeitem
		// unless defined as role=treeitem and indirect aria-labelledby approach
		// TODO: Determine method to normally label input items with value read last
		template.inputBox.inputElement.setAttribute('id', id + 'item');
		template.inputBox.inputElement.setAttribute('role', 'treeitem');
		template.inputBox.inputElement.setAttribute('aria-labelledby', id + 'item ' + id);

	}


	private renderNumber(dataElement: SettingsTreeSettingElement, template: ISettingTextItemTemplate, onChange: (value: number) => void): void {
		template.onChange = null;
		template.inputBox.value = dataElement.value;
		template.onChange = value => onChange(parseFn(value));

		const parseFn = dataElement.valueType === 'integer' ? parseInt : parseFloat;

		// Setup and add ARIA attributes
		// Create id and label for control/input element - parent is wrapper div
		const id = (dataElement.displayCategory + '_' + dataElement.displayLabel).replace(/ /g, '_');
		const label = ' ' + dataElement.displayCategory + ' ' + dataElement.displayLabel + ' number ' + template.isConfiguredElement.textContent;

		// We use the parent control div for the aria-labelledby target
		// Does not appear you can use the direct label on the element itself within a tree
		template.inputBox.inputElement.parentElement.setAttribute('id', id);
		template.inputBox.inputElement.parentElement.setAttribute('aria-label', label);

		// Labels will not be read on descendent input elements of the parent treeitem
		// unless defined as role=treeitem and indirect aria-labelledby approach
		// TODO: Determine method to normally label input items with value read last
		template.inputBox.inputElement.setAttribute('id', id + 'item');
		template.inputBox.inputElement.setAttribute('role', 'treeitem');
		template.inputBox.inputElement.setAttribute('aria-labelledby', id + 'item ' + id);

	}

	private renderExcludeSetting(dataElement: SettingsTreeSettingElement, template: ISettingExcludeItemTemplate): void {
		const value = getExcludeDisplayValue(dataElement);
		template.excludeWidget.setValue(value);
		template.context = dataElement;
	}

	private renderComplexSetting(dataElement: SettingsTreeSettingElement, template: ISettingComplexItemTemplate): void {
		template.onChange = () => this._onDidOpenSettings.fire(dataElement.setting.key);
	}

	disposeTemplate(tree: ITree, templateId: string, template: IDisposableTemplate): void {
		dispose(template.toDispose);
	}
}

function cleanRenderedMarkdown(element: Node): void {
	for (let i = 0; i < element.childNodes.length; i++) {
		const child = element.childNodes.item(i);

		const tagName = (<Element>child).tagName && (<Element>child).tagName.toLowerCase();
		if (tagName === 'img') {
			element.removeChild(child);
		} else {
			cleanRenderedMarkdown(child);
		}
	}
}

function fixSettingLinks(text: string): string {
	return text.replace(/`#([^#]*)#`/g, (match, settingName) => `[\`${settingName}\`](#${settingName})`);
}

function getDisplayEnumOptions(setting: ISetting): string[] {
	if (setting.enum.length > SettingsRenderer.MAX_ENUM_DESCRIPTIONS && setting.enumDescriptions) {
		return setting.enum
			.map(escapeInvisibleChars)
			.map((value, i) => {
				return setting.enumDescriptions[i] ?
					`${value}: ${setting.enumDescriptions[i]}` :
					value;
			});
	}

	return setting.enum
		.map(String)
		.map(escapeInvisibleChars);
}

function escapeInvisibleChars(enumValue: string): string {
	return enumValue && enumValue
		.replace(/\n/g, '\\n')
		.replace(/\r/g, '\\r');
}

export class SettingsTreeFilter implements IFilter {
	constructor(
		private viewState: ISettingsEditorViewState,
	) { }

	isVisible(tree: ITree, element: SettingsTreeElement): boolean {
		// Filter during search
		if (this.viewState.filterToCategory && element instanceof SettingsTreeSettingElement) {
			if (!this.settingContainedInGroup(element.setting, this.viewState.filterToCategory)) {
				return false;
			}
		}

		if (element instanceof SettingsTreeSettingElement && this.viewState.tagFilters) {
			return element.matchesAllTags(this.viewState.tagFilters);
		}

		if (element instanceof SettingsTreeGroupElement) {
			if (typeof element.count === 'number') {
				return element.count > 0;
			}

			return element.children.some(child => this.isVisible(tree, child));
		}

		return true;
	}

	private settingContainedInGroup(setting: ISetting, group: SettingsTreeGroupElement): boolean {
		return group.children.some(child => {
			if (child instanceof SettingsTreeGroupElement) {
				return this.settingContainedInGroup(setting, child);
			} else if (child instanceof SettingsTreeSettingElement) {
				return child.setting.key === setting.key;
			} else {
				return false;
			}
		});
	}
}

export class SettingsTreeController extends WorkbenchTreeController {
	constructor(
		@IConfigurationService configurationService: IConfigurationService
	) {
		super({}, configurationService);
	}

	protected onLeftClick(tree: ITree, element: any, eventish: IMouseEvent, origin?: string): boolean {
		const isLink = eventish.target.tagName.toLowerCase() === 'a' ||
			eventish.target.parentElement.tagName.toLowerCase() === 'a'; // <code> inside <a>

		if (isLink && DOM.findParentWithClass(eventish.target, 'setting-item-description-markdown', tree.getHTMLElement())) {
			return true;
		}

		// Without this, clicking on the setting description causes the tree to lose focus. I don't know why.
		// The superclass does not always call it because of DND which is not used here.
		eventish.preventDefault();

		return super.onLeftClick(tree, element, eventish, origin);
	}
}

export class SettingsAccessibilityProvider implements IAccessibilityProvider {
	getAriaLabel(tree: ITree, element: SettingsTreeElement): string {
		if (!element) {
			return '';
		}

		if (element instanceof SettingsTreeSettingElement) {
			return localize('settingRowAriaLabel', "{0} {1}, Setting", element.displayCategory, element.displayLabel);
		}

		if (element instanceof SettingsTreeGroupElement) {
			return localize('groupRowAriaLabel', "{0}, group", element.label);
		}

		return '';
	}
}

class NonExpandableOrSelectableTree extends Tree {
	expand(): TPromise<any> {
		return TPromise.wrap(null);
	}

	collapse(): TPromise<any> {
		return TPromise.wrap(null);
	}

	public setFocus(element?: any, eventPayload?: any): void {
		return;
	}

	public focusNext(count?: number, eventPayload?: any): void {
		return;
	}

	public focusPrevious(count?: number, eventPayload?: any): void {
		return;
	}

	public focusParent(eventPayload?: any): void {
		return;
	}

	public focusFirstChild(eventPayload?: any): void {
		return;
	}

	public focusFirst(eventPayload?: any, from?: any): void {
		return;
	}

	public focusNth(index: number, eventPayload?: any): void {
		return;
	}

	public focusLast(eventPayload?: any, from?: any): void {
		return;
	}

	public focusNextPage(eventPayload?: any): void {
		return;
	}

	public focusPreviousPage(eventPayload?: any): void {
		return;
	}

	public select(element: any, eventPayload?: any): void {
		return;
	}

	public selectRange(fromElement: any, toElement: any, eventPayload?: any): void {
		return;
	}

	public selectAll(elements: any[], eventPayload?: any): void {
		return;
	}

	public setSelection(elements: any[], eventPayload?: any): void {
		return;
	}

	public toggleSelection(element: any, eventPayload?: any): void {
		return;
	}
}

export class SettingsTree extends NonExpandableOrSelectableTree {
	protected disposables: IDisposable[];

	constructor(
		container: HTMLElement,
		viewState: ISettingsEditorViewState,
		configuration: Partial<ITreeConfiguration>,
		@IThemeService themeService: IThemeService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		const treeClass = 'settings-editor-tree';

		const controller = instantiationService.createInstance(SettingsTreeController);
		const fullConfiguration = <ITreeConfiguration>{
			dataSource: instantiationService.createInstance(SettingsDataSource, viewState),
			controller,
			accessibilityProvider: instantiationService.createInstance(SettingsAccessibilityProvider),
			filter: instantiationService.createInstance(SettingsTreeFilter, viewState),
			styler: new DefaultTreestyler(DOM.createStyleSheet(container), treeClass),

			...configuration
		};

		const options = {
			ariaLabel: localize('treeAriaLabel', "Settings"),
			showLoading: false,
			indentPixels: 0,
			twistiePixels: 0,
		};

		super(container,
			fullConfiguration,
			options);

		this.disposables = [];
		this.disposables.push(controller);

		this.disposables.push(registerThemingParticipant((theme: ITheme, collector: ICssStyleCollector) => {
			const activeBorderColor = theme.getColor(focusBorder);
			if (activeBorderColor) {
				// TODO@rob - why isn't this applied when added to the stylesheet from tocTree.ts? Seems like a chromium glitch.
				collector.addRule(`.settings-editor > .settings-body > .settings-toc-container .monaco-tree:focus .monaco-tree-row.focused {outline: solid 1px ${activeBorderColor}; outline-offset: -1px;  }`);
			}

			const foregroundColor = theme.getColor(foreground);
			if (foregroundColor) {
				// Links appear inside other elements in markdown. CSS opacity acts like a mask. So we have to dynamically compute the description color to avoid
				// applying an opacity to the link color.
				const fgWithOpacity = new Color(new RGBA(foregroundColor.rgba.r, foregroundColor.rgba.g, foregroundColor.rgba.b, .9));
				collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item .setting-item-description { color: ${fgWithOpacity}; }`);
			}

			const headerForegroundColor = theme.getColor(settingsHeaderForeground);
			if (headerForegroundColor) {
				collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .settings-group-title-label { color: ${headerForegroundColor} };`);
			}
		}));

		this.getHTMLElement().classList.add(treeClass);

		this.disposables.push(attachStyler(themeService, {
			listActiveSelectionBackground: editorBackground,
			listActiveSelectionForeground: foreground,
			listFocusAndSelectionBackground: editorBackground,
			listFocusAndSelectionForeground: foreground,
			listFocusBackground: editorBackground,
			listFocusForeground: foreground,
			listHoverForeground: foreground,
			listHoverBackground: editorBackground,
			listHoverOutline: editorBackground,
			listFocusOutline: editorBackground,
			listInactiveSelectionBackground: editorBackground,
			listInactiveSelectionForeground: foreground
		}, colors => {
			this.style(colors);
		}));
	}
}
