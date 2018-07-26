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
import { localize } from 'vs/nls';
import { ConfigurationTarget, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IListService, WorkbenchTree, WorkbenchTreeController } from 'vs/platform/list/browser/listService';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { editorBackground, focusBorder, foreground } from 'vs/platform/theme/common/colorRegistry';
import { attachButtonStyler, attachInputBoxStyler, attachSelectBoxStyler, attachStyler } from 'vs/platform/theme/common/styler';
import { ICssStyleCollector, ITheme, IThemeService, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { SettingsTarget } from 'vs/workbench/parts/preferences/browser/preferencesWidgets';
import { ITOCEntry } from 'vs/workbench/parts/preferences/browser/settingsLayout';
import { ExcludeSettingWidget, settingsNumberInputBackground, settingsNumberInputBorder, settingsNumberInputForeground, settingsSelectBackground, settingsSelectBorder, settingsSelectForeground, settingsTextInputBorder, settingsTextInputForeground, settingItemInactiveSelectionBorder, settingsHeaderForeground, settingsTextInputBackground, IExcludeDataItem } from 'vs/workbench/parts/preferences/browser/settingsWidgets';
import { ISearchResult, ISetting, ISettingsGroup } from 'vs/workbench/services/preferences/common/preferences';

const $ = DOM.$;

export abstract class SettingsTreeElement {
	id: string;
	parent: any; // SearchResultModel or group element... TODO search should be more similar to the normal case
}

export class SettingsTreeGroupElement extends SettingsTreeElement {
	children: (SettingsTreeGroupElement | SettingsTreeSettingElement)[];
	label: string;
	level: number;
	isFirstGroup: boolean;
}

export class SettingsTreeSettingElement extends SettingsTreeElement {
	setting: ISetting;

	displayCategory: string;
	displayLabel: string;

	/**
	 * scopeValue || defaultValue, for rendering convenience.
	 */
	value: any;

	/**
	 * The value in the current settings scope.
	 */
	scopeValue: any;

	/**
	 * The default value
	 */
	defaultValue?: any;

	/**
	 * Whether the setting is configured in the selected scope.
	 */
	isConfigured: boolean;

	overriddenScopeList: string[];
	description: string;
	valueType: 'enum' | 'string' | 'integer' | 'number' | 'boolean' | 'exclude' | 'complex';
}

export interface ITOCEntry {
	id: string;
	label: string;
	children?: ITOCEntry[];
	settings?: (string | ISetting)[];
}

export class SettingsTreeModel {
	private _root: SettingsTreeGroupElement;
	private _treeElementsById = new Map<string, SettingsTreeElement>();
	private _treeElementsBySettingName = new Map<string, SettingsTreeElement>();

	constructor(
		private _viewState: ISettingsEditorViewState,
		private _tocRoot: ITOCEntry,
		@IConfigurationService private _configurationService: IConfigurationService
	) {
		this.update(this._tocRoot);
	}

	get root(): SettingsTreeGroupElement {
		return this._root;
	}

	update(newTocRoot = this._tocRoot): void {
		const newRoot = this.createSettingsTreeGroupElement(newTocRoot);
		(<SettingsTreeGroupElement>newRoot.children[0]).isFirstGroup = true;

		if (this._root) {
			this._root.children = newRoot.children;
		} else {
			this._root = newRoot;
		}
	}

	getElementById(id: string): SettingsTreeElement {
		return this._treeElementsById.get(id);
	}

	getElementByName(name: string): SettingsTreeElement {
		return this._treeElementsBySettingName.get(name);
	}

	private createSettingsTreeGroupElement(tocEntry: ITOCEntry, parent?: SettingsTreeGroupElement): SettingsTreeGroupElement {
		const element = new SettingsTreeGroupElement();
		element.id = tocEntry.id;
		element.label = tocEntry.label;
		element.parent = parent;
		element.level = this.getDepth(element);

		if (tocEntry.children) {
			element.children = tocEntry.children.map(child => this.createSettingsTreeGroupElement(child, element));
		} else if (tocEntry.settings) {
			element.children = tocEntry.settings.map(s => this.createSettingsTreeSettingElement(<ISetting>s, element));
		}

		this._treeElementsById.set(element.id, element);
		return element;
	}

	private getDepth(element: SettingsTreeElement): number {
		if (element.parent) {
			return 1 + this.getDepth(element.parent);
		} else {
			return 0;
		}
	}

	private createSettingsTreeSettingElement(setting: ISetting, parent: SettingsTreeGroupElement): SettingsTreeSettingElement {
		const element = createSettingsTreeSettingElement(setting, parent, this._viewState.settingsTarget, this._configurationService);
		this._treeElementsById.set(element.id, element);
		this._treeElementsBySettingName.set(setting.key, element);
		return element;
	}
}

function sanitizeId(id: string): string {
	return id.replace(/[\.\/]/, '_');
}

function createSettingsTreeSettingElement(setting: ISetting, parent: any, settingsTarget: SettingsTarget, configurationService: IConfigurationService): SettingsTreeSettingElement {
	const element = new SettingsTreeSettingElement();
	element.id = sanitizeId(parent.id + '_' + setting.key);
	element.parent = parent;

	const inspectResult = inspectSetting(setting.key, settingsTarget, configurationService);
	const { isConfigured, inspected, targetSelector } = inspectResult;

	const displayValue = isConfigured ? inspected[targetSelector] : inspected.default;
	const overriddenScopeList = [];
	if (targetSelector === 'user' && typeof inspected.workspace !== 'undefined') {
		overriddenScopeList.push(localize('workspace', "Workspace"));
	}

	if (targetSelector === 'workspace' && typeof inspected.user !== 'undefined') {
		overriddenScopeList.push(localize('user', "User"));
	}

	const displayKeyFormat = settingKeyToDisplayFormat(setting.key, parent.id);
	element.setting = setting;
	element.displayLabel = displayKeyFormat.label;
	element.displayCategory = displayKeyFormat.category;

	element.value = displayValue;
	element.scopeValue = isConfigured && inspected[targetSelector];
	element.defaultValue = inspected.default;

	element.isConfigured = isConfigured;
	element.overriddenScopeList = overriddenScopeList;
	element.description = setting.description.join('\n');

	if (setting.enum && (setting.type === 'string' || !setting.type)) {
		element.valueType = 'enum';
	} else if (setting.type === 'string') {
		element.valueType = 'string';
	} else if (isExcludeSetting(setting)) {
		element.valueType = 'exclude';
	} else if (setting.type === 'integer') {
		element.valueType = 'integer';
	} else if (setting.type === 'number') {
		element.valueType = 'number';
	} else if (setting.type === 'boolean') {
		element.valueType = 'boolean';
	} else {
		element.valueType = 'complex';
	}

	return element;
}

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

interface IInspectResult {
	isConfigured: boolean;
	inspected: any;
	targetSelector: string;
}

function inspectSetting(key: string, target: SettingsTarget, configurationService: IConfigurationService): IInspectResult {
	const inspectOverrides = URI.isUri(target) ? { resource: target } : undefined;
	const inspected = configurationService.inspect(key, inspectOverrides);
	const targetSelector = target === ConfigurationTarget.USER ? 'user' :
		target === ConfigurationTarget.WORKSPACE ? 'workspace' :
			'workspaceFolder';
	const isConfigured = typeof inspected[targetSelector] !== 'undefined';

	return { isConfigured, inspected, targetSelector };
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
		if (element instanceof SearchResultModel) {
			return true;
		}

		if (element instanceof SettingsTreeGroupElement) {
			return true;
		}

		return false;
	}

	getChildren(tree: ITree, element: SettingsTreeElement): TPromise<any, any> {
		return TPromise.as(this._getChildren(element));
	}

	private _getChildren(element: SettingsTreeElement): SettingsTreeElement[] {
		if (element instanceof SearchResultModel) {
			return element.getChildren();
		} else if (element instanceof SettingsTreeGroupElement) {
			return element.children;
		} else {
			// No children...
			return null;
		}
	}

	getParent(tree: ITree, element: SettingsTreeElement): TPromise<any, any> {
		return TPromise.wrap(element.parent);
	}

	shouldAutoexpand(): boolean {
		return true;
	}
}

export function settingKeyToDisplayFormat(key: string, groupId = ''): { category: string, label: string } {
	let label = wordifyKey(key);
	const lastDotIdx = label.lastIndexOf('.');
	let category = '';
	if (lastDotIdx >= 0) {
		category = label.substr(0, lastDotIdx);
		label = label.substr(lastDotIdx + 1);
	}

	groupId = wordifyKey(groupId.replace(/\//g, '.'));
	category = trimCategoryForGroup(category, groupId);

	return { category, label };
}

function wordifyKey(key: string): string {
	return key
		.replace(/\.([a-z])/g, (match, p1) => `.${p1.toUpperCase()}`)
		.replace(/([a-z])([A-Z])/g, '$1 $2') // fooBar => foo Bar
		.replace(/^[a-z]/g, match => match.toUpperCase()); // foo => Foo
}

function trimCategoryForGroup(category: string, groupId: string): string {
	const doTrim = forward => {
		const parts = groupId.split('.');
		while (parts.length) {
			const reg = new RegExp(`^${parts.join('\\.')}(\\.|$)`, 'i');
			if (reg.test(category)) {
				return category.replace(reg, '');
			}

			if (forward) {
				parts.pop();
			} else {
				parts.shift();
			}
		}

		return null;
	};

	let trimmed = doTrim(true);
	if (trimmed === null) {
		trimmed = doTrim(false);
	}

	if (trimmed === null) {
		trimmed = category;
	}

	return trimmed;
}

export interface ISettingsEditorViewState {
	settingsTarget: SettingsTarget;
	showConfiguredOnly?: boolean;
	tagFilters?: Set<string>;
	filterToCategory?: SettingsTreeGroupElement;
}

interface IDisposableTemplate {
	toDispose: IDisposable[];
}

interface ISettingItemTemplate<T = any> extends IDisposableTemplate {
	onChange?: (value: T) => void;

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
}

interface ISettingComplexItemTemplate extends ISettingItemTemplate<void> {
	button: Button;
}

interface ISettingExcludeItemTemplate extends ISettingItemTemplate<void> {
	excludeWidget: ExcludeSettingWidget;
	context?: SettingsTreeSettingElement;
}

function isExcludeSetting(setting: ISetting): boolean {
	return setting.key === 'files.exclude' ||
		setting.key === 'search.exclude';
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
const SETTINGS_GROUP_ELEMENT_TEMPLATE_ID = 'settings.group.template';

export interface ISettingChangeEvent {
	key: string;
	value: any; // undefined => reset/unconfigure
}

export class SettingsRenderer implements ITreeRenderer {

	private static readonly SETTING_ROW_HEIGHT = 98;
	private static readonly SETTING_BOOL_ROW_HEIGHT = 65;
	public static readonly MAX_ENUM_DESCRIPTIONS = 10;

	private readonly _onDidChangeSetting: Emitter<ISettingChangeEvent> = new Emitter<ISettingChangeEvent>();
	public readonly onDidChangeSetting: Event<ISettingChangeEvent> = this._onDidChangeSetting.event;

	private readonly _onDidOpenSettings: Emitter<void> = new Emitter<void>();
	public readonly onDidOpenSettings: Event<void> = this._onDidOpenSettings.event;

	private readonly _onDidClickSettingLink: Emitter<string> = new Emitter<string>();
	public readonly onDidClickSettingLink: Event<string> = this._onDidClickSettingLink.event;

	private measureContainer: HTMLElement;

	constructor(
		_measureContainer: HTMLElement,
		@IThemeService private themeService: IThemeService,
		@IContextViewService private contextViewService: IContextViewService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		this.measureContainer = DOM.append(_measureContainer, $('.setting-measure-container.monaco-tree-row'));
	}

	getHeight(tree: ITree, element: SettingsTreeElement): number {
		if (element instanceof SettingsTreeGroupElement) {
			if (element.isFirstGroup) {
				return 31;
			}

			return 40 + (7 * element.level);
		}

		if (element instanceof SettingsTreeSettingElement) {
			const isSelected = this.elementIsSelected(tree, element);
			if (isSelected) {
				return this.measureSettingElementHeight(tree, element);
			} else if (isExcludeSetting(element.setting)) {
				return this._getExcludeSettingHeight(element);
			} else {
				return this._getUnexpandedSettingHeight(element);
			}
		}

		return 0;
	}

	_getExcludeSettingHeight(element: SettingsTreeSettingElement): number {
		const displayValue = getExcludeDisplayValue(element);
		return (displayValue.length + 1) * 22 + 80;
	}

	_getUnexpandedSettingHeight(element: SettingsTreeSettingElement): number {
		if (element.valueType === 'boolean') {
			return SettingsRenderer.SETTING_BOOL_ROW_HEIGHT;
		} else {
			return SettingsRenderer.SETTING_ROW_HEIGHT;
		}
	}

	private measureSettingElementHeight(tree: ITree, element: SettingsTreeSettingElement): number {
		const measureHelper = DOM.append(this.measureContainer, $('.setting-measure-helper'));

		const templateId = this.getTemplateId(tree, element);
		const template = this.renderTemplate(tree, templateId, measureHelper);
		this.renderElement(tree, element, templateId, template);

		const height = this.measureContainer.offsetHeight;
		this.measureContainer.removeChild(this.measureContainer.firstChild);
		return Math.max(height, this._getUnexpandedSettingHeight(element));
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

		const template: ISettingTextItemTemplate = {
			...common,
			inputBox
		};

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

		const template: ISettingNumberItemTemplate = {
			...common,
			inputBox
		};

		return template;
	}

	private renderSettingBoolTemplate(tree: ITree, container: HTMLElement): ISettingBoolItemTemplate {
		DOM.addClass(container, 'setting-item');
		DOM.addClass(container, 'setting-item-bool');

		const titleElement = DOM.append(container, $('.setting-item-title'));
		const categoryElement = DOM.append(titleElement, $('span.setting-item-category'));
		const labelElement = DOM.append(titleElement, $('span.setting-item-label'));
		const isConfiguredElement = DOM.append(titleElement, $('span.setting-item-is-configured-label'));
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

		common.toDispose.push(
			selectBox.onDidSelect(e => {
				if (template.onChange) {
					template.onChange(e.index);
				}
			}));

		const template: ISettingEnumItemTemplate = {
			...common,
			selectBox
		};

		return template;
	}

	private renderSettingExcludeTemplate(tree: ITree, container: HTMLElement): ISettingExcludeItemTemplate {
		const common = this.renderCommonTemplate(tree, container, 'exclude');

		const excludeWidget = this.instantiationService.createInstance(ExcludeSettingWidget, common.controlElement);
		common.toDispose.push(excludeWidget);

		const template: ISettingExcludeItemTemplate = {
			...common,
			excludeWidget
		};

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
		common.toDispose.push(openSettingsButton.onDidClick(() => this._onDidOpenSettings.fire()));
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

		return template;
	}

	renderElement(tree: ITree, element: SettingsTreeElement, templateId: string, template: any): void {
		if (templateId === SETTINGS_GROUP_ELEMENT_TEMPLATE_ID) {
			return this.renderGroupElement(<SettingsTreeGroupElement>element, template);
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

	private elementIsSelected(tree: ITree, element: SettingsTreeElement): boolean {
		const selection = tree.getSelection();
		const selectedElement: SettingsTreeElement = selection && selection[0];
		return selectedElement && selectedElement.id === element.id;
	}

	private renderSettingElement(tree: ITree, element: SettingsTreeSettingElement, templateId: string, template: ISettingItemTemplate | ISettingBoolItemTemplate): void {
		const isSelected = !!this.elementIsSelected(tree, element);
		const setting = element.setting;

		DOM.toggleClass(template.containerElement, 'is-configured', element.isConfigured);
		DOM.toggleClass(template.containerElement, 'is-expanded', isSelected);
		template.containerElement.id = element.id.replace(/\./g, '_');

		const titleTooltip = setting.key;
		template.categoryElement.textContent = element.displayCategory && (element.displayCategory + ': ');
		template.categoryElement.title = titleTooltip;

		template.labelElement.textContent = element.displayLabel;
		template.labelElement.title = titleTooltip;

		let enumDescriptionText = '';
		if (element.valueType === 'enum' && element.setting.enumDescriptions && element.setting.enum && element.setting.enum.length < SettingsRenderer.MAX_ENUM_DESCRIPTIONS) {
			enumDescriptionText = '\n' + element.setting.enumDescriptions
				.map((desc, i) => desc ?
					` - \`${element.setting.enum[i]}\`: ${desc}` :
					` - \`${element.setting.enum[i]}\``)
				.filter(desc => !!desc)
				.join('\n');
		}

		// Rewrite `#editor.fontSize#` to link format
		const descriptionText = (element.description + enumDescriptionText)
			.replace(/`#(.*)#`/g, (match, settingName) => `[\`${settingName}\`](#${settingName})`);

		const renderedDescription = renderMarkdown({ value: descriptionText }, {
			actionHandler: {
				callback: (content: string) => {
					if (startsWith(content, '#')) {
						this._onDidClickSettingLink.fire(content.substr(1));
					} else {
						this.openerService.open(URI.parse(content)).then(void 0, onUnexpectedError);
					}
				},
				disposeables: template.toDispose
			}
		});
		cleanRenderedMarkdown(renderedDescription);
		renderedDescription.classList.add('setting-item-description-markdown');
		template.descriptionElement.innerHTML = '';
		template.descriptionElement.appendChild(renderedDescription);
		(<any>renderedDescription.querySelectorAll('a')).forEach(aElement => {
			aElement.tabIndex = isSelected ? 0 : -1;
		});

		this.renderValue(element, isSelected, templateId, <ISettingItemTemplate>template);

		template.isConfiguredElement.textContent = element.isConfigured ? localize('configured', "Modified") : '';

		if (element.overriddenScopeList.length) {
			let otherOverridesLabel = element.isConfigured ?
				localize('alsoConfiguredIn', "Also modified in") :
				localize('configuredIn', "Modified in");

			template.otherOverridesElement.textContent = `(${otherOverridesLabel}: ${element.overriddenScopeList.join(', ')})`;
		} else {
			template.otherOverridesElement.textContent = '';
		}
	}

	private renderValue(element: SettingsTreeSettingElement, isSelected: boolean, templateId: string, template: ISettingItemTemplate | ISettingBoolItemTemplate): void {
		const onChange = value => this._onDidChangeSetting.fire({ key: element.setting.key, value });

		if (templateId === SETTINGS_ENUM_TEMPLATE_ID) {
			this.renderEnum(element, isSelected, <ISettingEnumItemTemplate>template, onChange);
		} else if (templateId === SETTINGS_TEXT_TEMPLATE_ID) {
			this.renderText(element, isSelected, <ISettingTextItemTemplate>template, onChange);
		} else if (templateId === SETTINGS_NUMBER_TEMPLATE_ID) {
			this.renderNumber(element, isSelected, <ISettingTextItemTemplate>template, onChange);
		} else if (templateId === SETTINGS_BOOL_TEMPLATE_ID) {
			this.renderBool(element, isSelected, <ISettingBoolItemTemplate>template, onChange);
		} else if (templateId === SETTINGS_EXCLUDE_TEMPLATE_ID) {
			this.renderExcludeSetting(element, isSelected, <ISettingExcludeItemTemplate>template);
		} else if (templateId === SETTINGS_COMPLEX_TEMPLATE_ID) {
			this.renderComplexSetting(element, isSelected, <ISettingComplexItemTemplate>template);
		}
	}

	private renderBool(dataElement: SettingsTreeSettingElement, isSelected: boolean, template: ISettingBoolItemTemplate, onChange: (value: boolean) => void): void {
		template.onChange = null;
		template.checkbox.checked = dataElement.value;
		template.onChange = onChange;

		template.checkbox.domNode.tabIndex = isSelected ? 0 : -1;
	}

	private renderEnum(dataElement: SettingsTreeSettingElement, isSelected: boolean, template: ISettingEnumItemTemplate, onChange: (value: string) => void): void {
		const displayOptions = getDisplayEnumOptions(dataElement.setting);
		template.selectBox.setOptions(displayOptions);

		const label = dataElement.displayCategory + ' ' + dataElement.displayLabel;
		template.selectBox.setAriaLabel(label);

		const idx = dataElement.setting.enum.indexOf(dataElement.value);
		template.onChange = null;
		template.selectBox.select(idx);
		template.onChange = idx => onChange(dataElement.setting.enum[idx]);

		if (template.controlElement.firstElementChild) {
			template.controlElement.firstElementChild.setAttribute('tabindex', isSelected ? '0' : '-1');
		}
	}

	private renderText(dataElement: SettingsTreeSettingElement, isSelected: boolean, template: ISettingTextItemTemplate, onChange: (value: string) => void): void {
		template.onChange = null;
		template.inputBox.value = dataElement.value;
		template.onChange = value => onChange(value);
		template.inputBox.inputElement.tabIndex = isSelected ? 0 : -1;
	}

	private renderNumber(dataElement: SettingsTreeSettingElement, isSelected: boolean, template: ISettingTextItemTemplate, onChange: (value: number) => void): void {
		template.onChange = null;
		template.inputBox.value = dataElement.value;
		template.onChange = value => onChange(parseFn(value));
		template.inputBox.inputElement.tabIndex = isSelected ? 0 : -1;

		const parseFn = dataElement.valueType === 'integer' ? parseInt : parseFloat;
	}

	private renderExcludeSetting(dataElement: SettingsTreeSettingElement, isSelected: boolean, template: ISettingExcludeItemTemplate): void {
		const value = getExcludeDisplayValue(dataElement);
		template.excludeWidget.setValue(value);
		template.context = dataElement;
	}

	private renderComplexSetting(dataElement: SettingsTreeSettingElement, isSelected: boolean, template: ISettingComplexItemTemplate): void {
		template.button.element.tabIndex = isSelected ? 0 : -1;

		template.onChange = () => this._onDidOpenSettings.fire();
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

	return setting.enum.map(escapeInvisibleChars);
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
		if (this.viewState.filterToCategory && element instanceof SettingsTreeSettingElement) {
			if (!this.settingContainedInGroup(element.setting, this.viewState.filterToCategory)) {
				return false;
			}
		}

		if (element instanceof SettingsTreeSettingElement && this.viewState.showConfiguredOnly) {
			return element.isConfigured;
		}

		if (element instanceof SettingsTreeGroupElement && this.viewState.showConfiguredOnly) {
			return this.groupHasConfiguredSetting(element);
		}

		if (element instanceof SettingsTreeSettingElement && this.viewState.tagFilters && this.viewState.tagFilters.size) {
			if (element.setting.tags) {
				return element.setting.tags.some(tag => this.viewState.tagFilters.has(tag));
			} else {
				return false;
			}
		}

		if (element instanceof SettingsTreeGroupElement && this.viewState.tagFilters && this.viewState.tagFilters.size) {
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

	private groupHasConfiguredSetting(element: SettingsTreeGroupElement): boolean {
		for (let child of element.children) {
			if (child instanceof SettingsTreeSettingElement) {
				if (child.isConfigured) {
					return true;
				}
			} else if (child instanceof SettingsTreeGroupElement) {
				if (this.groupHasConfiguredSetting(child)) {
					return true;
				}
			}
		}

		return false;
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

export enum SearchResultIdx {
	Local = 0,
	Remote = 1
}

export class SearchResultModel {
	private rawSearchResults: ISearchResult[];
	private cachedUniqueSearchResults: ISearchResult[];
	private children: SettingsTreeSettingElement[];

	readonly id = 'searchResultModel';

	constructor(
		private _viewState: ISettingsEditorViewState,
		@IConfigurationService private _configurationService: IConfigurationService
	) { }

	getChildren(): SettingsTreeSettingElement[] {
		return this.children;
	}

	getUniqueResults(): ISearchResult[] {
		if (this.cachedUniqueSearchResults) {
			return this.cachedUniqueSearchResults;
		}

		if (!this.rawSearchResults) {
			return [];
		}

		const localMatchKeys = new Set();
		const localResult = objects.deepClone(this.rawSearchResults[SearchResultIdx.Local]);
		if (localResult) {
			localResult.filterMatches.forEach(m => localMatchKeys.add(m.setting.key));
		}

		const remoteResult = objects.deepClone(this.rawSearchResults[SearchResultIdx.Remote]);
		if (remoteResult) {
			remoteResult.filterMatches = remoteResult.filterMatches.filter(m => !localMatchKeys.has(m.setting.key));
		}

		this.cachedUniqueSearchResults = [localResult, remoteResult];
		return this.cachedUniqueSearchResults;
	}

	getRawResults(): ISearchResult[] {
		return this.rawSearchResults;
	}

	setResult(type: SearchResultIdx, result: ISearchResult): void {
		this.cachedUniqueSearchResults = null;
		this.rawSearchResults = this.rawSearchResults || [];
		if (!result) {
			delete this.rawSearchResults[type];
			return;
		}

		this.rawSearchResults[type] = result;
		this.updateChildren();
	}

	updateChildren(): void {
		this.children = this.getFlatSettings()
			.map(s => createSettingsTreeSettingElement(s, this, this._viewState.settingsTarget, this._configurationService));
	}

	private getFlatSettings(): ISetting[] {
		const flatSettings: ISetting[] = [];
		this.getUniqueResults()
			.filter(r => !!r)
			.forEach(r => {
				flatSettings.push(
					...r.filterMatches.map(m => m.setting));
			});

		return flatSettings;
	}
}

class NonExpandableTree extends WorkbenchTree {
	expand(): TPromise<any, any> {
		return TPromise.wrap(null);
	}

	collapse(): TPromise<any, any> {
		return TPromise.wrap(null);
	}
}

export class SettingsTree extends NonExpandableTree {
	constructor(
		container: HTMLElement,
		viewState: ISettingsEditorViewState,
		configuration: Partial<ITreeConfiguration>,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IListService listService: IListService,
		@IThemeService themeService: IThemeService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		const treeClass = 'settings-editor-tree';

		const fullConfiguration = <ITreeConfiguration>{
			dataSource: instantiationService.createInstance(SettingsDataSource, viewState),
			controller: instantiationService.createInstance(SettingsTreeController),
			accessibilityProvider: instantiationService.createInstance(SettingsAccessibilityProvider),
			filter: instantiationService.createInstance(SettingsTreeFilter, viewState),
			styler: new DefaultTreestyler(DOM.createStyleSheet(), treeClass),

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
			options,
			contextKeyService,
			listService,
			themeService,
			instantiationService,
			configurationService);

		this.disposables.push(registerThemingParticipant((theme: ITheme, collector: ICssStyleCollector) => {
			const activeBorderColor = theme.getColor(focusBorder);
			if (activeBorderColor) {
				collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .monaco-tree:focus .monaco-tree-row.focused {outline: solid 1px ${activeBorderColor}; outline-offset: -1px; }`);
			}

			const inactiveBorderColor = theme.getColor(settingItemInactiveSelectionBorder);
			if (inactiveBorderColor) {
				collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .monaco-tree .monaco-tree-row.focused {outline: solid 1px ${inactiveBorderColor}; outline-offset: -1px; }`);
			}

			const foregroundColor = theme.getColor(foreground);
			if (foregroundColor) {
				// Links appear inside other elements in markdown. CSS opacity acts like a mask. So we have to dynamically compute the description color to avoid
				// applying an opacity to the link color.
				const fgWithOpacity = new Color(new RGBA(foregroundColor.rgba.r, foregroundColor.rgba.g, foregroundColor.rgba.b, .7));
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
			listInactiveSelectionBackground: editorBackground,
			listInactiveSelectionForeground: foreground
		}, colors => {
			this.style(colors);
		}));
	}
}
