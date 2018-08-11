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
import { ConfigurationTarget, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IListService, WorkbenchTreeController } from 'vs/platform/list/browser/listService';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { editorBackground, focusBorder, foreground, errorForeground, inputValidationErrorBackground, inputValidationErrorBorder } from 'vs/platform/theme/common/colorRegistry';
import { attachButtonStyler, attachInputBoxStyler, attachSelectBoxStyler, attachStyler } from 'vs/platform/theme/common/styler';
import { ICssStyleCollector, ITheme, IThemeService, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { SettingsTarget } from 'vs/workbench/parts/preferences/browser/preferencesWidgets';
import { ITOCEntry } from 'vs/workbench/parts/preferences/browser/settingsLayout';
import { ExcludeSettingWidget, IExcludeDataItem, settingsHeaderForeground, settingsNumberInputBackground, settingsNumberInputBorder, settingsNumberInputForeground, settingsSelectBackground, settingsSelectBorder, settingsSelectForeground, settingsTextInputBackground, settingsTextInputBorder, settingsTextInputForeground } from 'vs/workbench/parts/preferences/browser/settingsWidgets';
import { IExtensionSetting, ISearchResult, ISetting, ISettingsGroup } from 'vs/workbench/services/preferences/common/preferences';
import { isArray } from 'vs/base/common/types';

const $ = DOM.$;

export const MODIFIED_SETTING_TAG = 'modified';
export const ONLINE_SERVICES_SETTING_TAG = 'usesOnlineServices';

export abstract class SettingsTreeElement {
	id: string;
	parent: any; // SearchResultModel or group element... TODO search should be more similar to the normal case
}

export class SettingsTreeGroupElement extends SettingsTreeElement {
	children: (SettingsTreeGroupElement | SettingsTreeSettingElement)[];
	count?: number;
	label: string;
	level: number;
	isFirstGroup: boolean;
}

export class SettingsTreeNewExtensionsElement extends SettingsTreeElement {
	extensionIds: string[];
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

	tags?: Set<string>;
	overriddenScopeList: string[];
	description: string;
	valueType: 'enum' | 'string' | 'integer' | 'number' | 'boolean' | 'exclude' | 'complex' | 'nullable-integer' | 'nullable-number';

	matchesAllTags(tagFilters?: Set<string>): boolean {
		if (!tagFilters || !tagFilters.size) {
			return true;
		}

		if (this.tags) {
			let hasFilteredTag = true;
			tagFilters.forEach(tag => {
				hasFilteredTag = hasFilteredTag && this.tags.has(tag);
			});
			return hasFilteredTag;
		} else {
			return false;
		}
	}
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
			element.children = tocEntry.settings.map(s => this.createSettingsTreeSettingElement(<ISetting>s, element))
				.filter(el => el.setting.deprecationMessage ? el.isConfigured : true);
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

function createSettingsTreeSettingElement(setting: ISetting, parent: SearchResultModel | SettingsTreeGroupElement, settingsTarget: SettingsTarget, configurationService: IConfigurationService): SettingsTreeSettingElement {
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
	if (isConfigured || setting.tags) {
		element.tags = new Set<string>();
		if (isConfigured) {
			element.tags.add(MODIFIED_SETTING_TAG);
		}

		if (setting.tags) {
			setting.tags.forEach(tag => element.tags.add(tag));
		}
	}

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
	} else if (isArray(setting.type) && setting.type.indexOf('null') > -1 && setting.type.length === 2) {
		if (setting.type.indexOf('number') > -1) {
			element.valueType = 'nullable-integer';
		} else if (setting.type.indexOf('number') > -1) {
			element.valueType = 'nullable-number';
		}
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

	getChildren(tree: ITree, element: SettingsTreeElement): TPromise<any> {
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

	getParent(tree: ITree, element: SettingsTreeElement): TPromise<any> {
		return TPromise.wrap(element && element.parent);
	}

	shouldAutoexpand(): boolean {
		return true;
	}
}

export function settingKeyToDisplayFormat(key: string, groupId = ''): { category: string, label: string } {
	const lastDotIdx = key.lastIndexOf('.');
	let category = '';
	if (lastDotIdx >= 0) {
		category = key.substr(0, lastDotIdx);
		key = key.substr(lastDotIdx + 1);
	}

	groupId = groupId.replace(/\//g, '.');
	category = trimCategoryForGroup(category, groupId);
	category = wordifyKey(category);

	const label = wordifyKey(key);
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
	tagFilters?: Set<string>;
	filterToCategory?: SettingsTreeGroupElement;
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
	deprecationWarningElement: HTMLElement;
	isConfiguredElement: HTMLElement;
	otherOverridesElement: HTMLElement;
}

interface ISettingBoolItemTemplate extends ISettingItemTemplate<boolean> {
	checkbox: Checkbox;
}

interface ISettingTextItemTemplate extends ISettingItemTemplate<string> {
	inputBox: InputBox;
	validationErrorMessageElement: HTMLElement;
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
const SETTINGS_NEW_EXTENSIONS_TEMPLATE_ID = 'settings.newExtensions.template';
const SETTINGS_GROUP_ELEMENT_TEMPLATE_ID = 'settings.group.template';

export interface ISettingChangeEvent {
	key: string;
	value: any; // undefined => reset/unconfigure
}

export class SettingsRenderer implements ITreeRenderer {

	public static readonly MAX_ENUM_DESCRIPTIONS = 10;

	private static readonly CONTROL_CLASS = 'setting-control-focus-target';
	public static readonly CONTROL_SELECTOR = '.' + SettingsRenderer.CONTROL_CLASS;

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

			if (element.valueType === 'integer' || element.valueType === 'number' || element.valueType === 'nullable-integer' || element.valueType === 'nullable-number') {
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
		const otherOverridesElement = DOM.append(titleElement, $('span.setting-item-overrides'));
		const descriptionElement = DOM.append(container, $('.setting-item-description'));

		const valueElement = DOM.append(container, $('.setting-item-value'));
		const controlElement = DOM.append(valueElement, $('div.setting-item-control'));

		const deprecationWarningElement = DOM.append(container, $('.setting-item-deprecation-message'));

		const toDispose = [];
		const template: ISettingItemTemplate = {
			toDispose,

			containerElement: container,
			categoryElement,
			labelElement,
			descriptionElement,
			controlElement,
			deprecationWarningElement,
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
		const validationErrorMessageElement = DOM.append(container, $('.setting-item-validation-message'));

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
			inputBox,
			validationErrorMessageElement
		};

		this.addSettingElementFocusHandler(template);

		return template;
	}

	private renderSettingNumberTemplate(tree: ITree, container: HTMLElement): ISettingNumberItemTemplate {
		const common = this.renderCommonTemplate(tree, container, 'number');
		const validationErrorMessageElement = DOM.append(container, $('.setting-item-validation-message'));

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
			inputBox,
			validationErrorMessageElement
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
		const otherOverridesElement = DOM.append(titleElement, $('span.setting-item-overrides'));

		const descriptionAndValueElement = DOM.append(container, $('.setting-item-value-description'));
		const controlElement = DOM.append(descriptionAndValueElement, $('.setting-item-bool-control'));
		const descriptionElement = DOM.append(descriptionAndValueElement, $('.setting-item-description'));

		const deprecationWarningElement = DOM.append(container, $('.setting-item-deprecation-message'));

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
			deprecationWarningElement,
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

	private renderSettingElement(tree: ITree, element: SettingsTreeSettingElement, templateId: string, template: ISettingItemTemplate | ISettingBoolItemTemplate): void {
		template.context = element;

		const setting = element.setting;

		DOM.toggleClass(template.containerElement, 'is-configured', element.isConfigured);
		DOM.toggleClass(template.containerElement, 'is-expanded', true);
		template.containerElement.id = element.id.replace(/\./g, '_');

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
		template.deprecationWarningElement.innerText = element.setting.deprecationMessage || '';

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
		template.onChange = value => { renderValidations(dataElement, template); onChange(value); };

		renderValidations(dataElement, template);
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
		const parseFn = (dataElement.valueType === 'integer' || dataElement.valueType === 'nullable-integer') ? parseInt : parseFloat;

		template.onChange = null;
		template.inputBox.value = dataElement.value;
		template.onChange = value => { renderValidations(dataElement, template); onChange(parseFn(value)); };

		renderValidations(dataElement, template);
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

function renderValidations(dataElement: SettingsTreeSettingElement, template: ISettingTextItemTemplate) {
	if (dataElement.setting.validator) {
		let errMsg = dataElement.setting.validator(template.inputBox.value);
		if (errMsg) {
			DOM.addClass(template.containerElement, 'invalid-input');
			template.validationErrorMessageElement.innerText = errMsg;
			return;
		}
	}
	DOM.removeClass(template.containerElement, 'invalid-input');
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

export enum SearchResultIdx {
	Local = 0,
	Remote = 1,
	NewExtensions = 2
}

export class SearchResultModel {
	private rawSearchResults: ISearchResult[];
	private cachedUniqueSearchResults: ISearchResult[];
	private newExtensionSearchResults: ISearchResult;
	private children: (SettingsTreeSettingElement | SettingsTreeNewExtensionsElement)[];

	readonly id = 'searchResultModel';

	constructor(
		private _viewState: ISettingsEditorViewState,
		@IConfigurationService private _configurationService: IConfigurationService
	) { }

	getChildren(): (SettingsTreeSettingElement | SettingsTreeNewExtensionsElement)[] {
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

		this.newExtensionSearchResults = objects.deepClone(this.rawSearchResults[SearchResultIdx.NewExtensions]);

		this.cachedUniqueSearchResults = [localResult, remoteResult];
		return this.cachedUniqueSearchResults;
	}

	getRawResults(): ISearchResult[] {
		return this.rawSearchResults;
	}

	setResult(order: SearchResultIdx, result: ISearchResult): void {
		this.cachedUniqueSearchResults = null;
		this.rawSearchResults = this.rawSearchResults || [];
		if (!result) {
			delete this.rawSearchResults[order];
			return;
		}

		this.rawSearchResults[order] = result;
		this.updateChildren();
	}

	updateChildren(): void {
		this.children = this.getFlatSettings()
			.map(s => createSettingsTreeSettingElement(s, this, this._viewState.settingsTarget, this._configurationService))
			.filter(el => el.setting.deprecationMessage ? el.isConfigured : true);

		if (this.newExtensionSearchResults) {
			const newExtElement = new SettingsTreeNewExtensionsElement();
			newExtElement.parent = this;
			newExtElement.id = 'newExtensions';
			const resultExtensionIds = this.newExtensionSearchResults.filterMatches
				.map(result => (<IExtensionSetting>result.setting))
				.filter(setting => setting.extensionName && setting.extensionPublisher)
				.map(setting => `${setting.extensionPublisher}.${setting.extensionName}`);
			newExtElement.extensionIds = arrays.distinct(resultExtensionIds);
			this.children.push(newExtElement);
		}
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
		@IContextKeyService contextKeyService: IContextKeyService,
		@IListService listService: IListService,
		@IThemeService themeService: IThemeService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService
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

			const errorColor = theme.getColor(errorForeground);
			if (errorColor) {
				collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item .setting-item-deprecation-message { color: ${errorColor}; }`);
			}

			const invalidInputBackground = theme.getColor(inputValidationErrorBackground);
			if (invalidInputBackground) {
				collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item .setting-item-validation-message { background-color: ${invalidInputBackground}; }`);
			}

			const invalidInputBorder = theme.getColor(inputValidationErrorBorder);
			if (invalidInputBorder) {
				collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item .setting-item-validation-message { border-style:solid; border-width: 1px; border-color: ${invalidInputBorder}; }`);
				collector.addRule(`.settings-editor > .settings-body > .settings-tree-container .setting-item.invalid-input .setting-item-control .monaco-inputbox.idle { outline-width: 0; border-style:solid; border-width: 1px; border-color: ${invalidInputBorder}; }`);
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
