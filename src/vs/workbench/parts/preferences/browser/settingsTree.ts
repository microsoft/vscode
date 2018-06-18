/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { IMouseEvent } from 'vs/base/browser/mouseEvent';
import { Button } from 'vs/base/browser/ui/button/button';
import { InputBox } from 'vs/base/browser/ui/inputbox/inputBox';
import { SelectBox } from 'vs/base/browser/ui/selectBox/selectBox';
import * as arrays from 'vs/base/common/arrays';
import { Color } from 'vs/base/common/color';
import { Emitter, Event } from 'vs/base/common/event';
import { KeyCode } from 'vs/base/common/keyCodes';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import * as objects from 'vs/base/common/objects';
import { escapeRegExpCharacters } from 'vs/base/common/strings';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { IAccessibilityProvider, IDataSource, IFilter, IRenderer, ITree } from 'vs/base/parts/tree/browser/tree';
import { localize } from 'vs/nls';
import { ConfigurationTarget, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { WorkbenchTreeController } from 'vs/platform/list/browser/listService';
import { editorActiveLinkForeground, registerColor } from 'vs/platform/theme/common/colorRegistry';
import { attachButtonStyler, attachInputBoxStyler, attachSelectBoxStyler } from 'vs/platform/theme/common/styler';
import { ICssStyleCollector, ITheme, IThemeService, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { SettingsTarget } from 'vs/workbench/parts/preferences/browser/preferencesWidgets';
import { ITOCEntry } from 'vs/workbench/parts/preferences/browser/settingsLayout';
import { ISearchResult, ISetting, ISettingsGroup } from 'vs/workbench/services/preferences/common/preferences';

const $ = DOM.$;

export const modifiedItemForeground = registerColor('settings.modifiedItemForeground', {
	light: '#019001',
	dark: '#73C991',
	hc: '#73C991'
}, localize('modifiedItemForeground', "(For settings editor preview) The foreground color for a modified setting."));

registerThemingParticipant((theme: ITheme, collector: ICssStyleCollector) => {
	const modifiedItemForegroundColor = theme.getColor(modifiedItemForeground);
	if (modifiedItemForegroundColor) {
		collector.addRule(`.settings-editor > .settings-editor-right > .settings-body > .settings-tree-container .setting-item.is-configured .setting-item-is-configured-label { color: ${modifiedItemForegroundColor}; }`);
	}
});

export abstract class SettingsTreeElement {
	id: string;
	parent: any; // SearchResultModel or group element... TODO search should be more similar to the normal case
}

export class SettingsTreeGroupElement extends SettingsTreeElement {
	children: (SettingsTreeGroupElement | SettingsTreeSettingElement)[];
	label: string;
	level: number;
}

export class SettingsTreeSettingElement extends SettingsTreeElement {
	setting: ISetting;

	isExpanded: boolean;
	displayCategory: string;
	displayLabel: string;
	value: any;
	isConfigured: boolean;
	overriddenScopeList: string[];
	description: string;
	valueType?: string | string[];
	enum?: string[];
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

	constructor(
		private viewState: ISettingsEditorViewState,
		tocRoot: ITOCEntry,
		@IConfigurationService private configurationService: IConfigurationService
	) {
		this.update(tocRoot);
	}

	get root(): SettingsTreeElement {
		return this._root;
	}

	update(newTocRoot: ITOCEntry): void {
		const newRoot = this.createSettingsTreeGroupElement(newTocRoot);
		if (this._root) {
			this._root.children = newRoot.children;
		} else {
			this._root = newRoot;
		}
	}

	getElementById(id: string): SettingsTreeElement {
		return this._treeElementsById.get(id);
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
		const element = createSettingsTreeSettingElement(setting, parent, this.viewState.settingsTarget, this.configurationService);
		this._treeElementsById.set(element.id, element);
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

	const { isConfigured, inspected, targetSelector } = inspectSetting(setting.key, settingsTarget, configurationService);

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
	element.isExpanded = false;

	element.value = displayValue;
	element.isConfigured = isConfigured;
	element.overriddenScopeList = overriddenScopeList;
	element.description = setting.description.join('\n');
	element.enum = setting.enum;
	element.valueType = setting.type;

	return element;
}

function inspectSetting(key: string, target: SettingsTarget, configurationService: IConfigurationService): { isConfigured: boolean, inspected: any, targetSelector: string } {
	const inspectOverrides = URI.isUri(target) ? { resource: target } : undefined;
	const inspected = configurationService.inspect(key, inspectOverrides);
	const targetSelector = target === ConfigurationTarget.USER ? 'user' :
		target === ConfigurationTarget.WORKSPACE ? 'workspace' :
			'workspaceFolder';
	const isConfigured = typeof inspected[targetSelector] !== 'undefined';

	return { isConfigured, inspected, targetSelector };
}

export function resolveSettingsTree(tocData: ITOCEntry, settingsGroups: ISettingsGroup[]): ITOCEntry {
	return _resolveSettingsTree(tocData, getFlatSettings(settingsGroups));
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
			children: tocData.children.map(child => _resolveSettingsTree(child, allSettings))
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
				result.add(s);
			}
		}
	}

	return result;
}


export class SettingsDataSource implements IDataSource {

	constructor(
		private viewState: ISettingsEditorViewState,
		@IConfigurationService private configurationService: IConfigurationService
	) { }

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

	private getSearchResultChildren(searchResult: SearchResultModel): SettingsTreeSettingElement[] {
		return searchResult.getFlatSettings()
			.map(s => createSettingsTreeSettingElement(s, searchResult, this.viewState.settingsTarget, this.configurationService));
	}

	getChildren(tree: ITree, element: SettingsTreeElement): TPromise<any, any> {
		return TPromise.as(this._getChildren(element));
	}

	private _getChildren(element: SettingsTreeElement): SettingsTreeElement[] {
		if (element instanceof SearchResultModel) {
			return this.getSearchResultChildren(element);
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
	// const categoryWithoutSpaces = category.replace(/ /g, '');

	const doTrim = forward => {
		const parts = groupId.split('.');
		while (parts.length) {
			const reg = new RegExp(`^${parts.join('\\.')}(\\.|$)`, 'i');
			if (reg.test(category)) {
				return category.replace(reg, '');
			}

			// if (reg.test(categoryWithoutSpaces)) {
			// 	return categoryWithoutSpaces.replace(reg, '');
			// }

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
}

interface IDisposableTemplate {
	toDispose: IDisposable[];
}

interface ISettingItemTemplate extends IDisposableTemplate {
	parent: HTMLElement;

	context?: SettingsTreeSettingElement;
	containerElement: HTMLElement;
	categoryElement: HTMLElement;
	labelElement: HTMLElement;
	descriptionElement: HTMLElement;
	valueElement: HTMLElement;
	isConfiguredElement: HTMLElement;
	otherOverridesElement: HTMLElement;
}

interface IGroupTitleTemplate extends IDisposableTemplate {
	context?: SettingsTreeGroupElement;
	parent: HTMLElement;
}

const SETTINGS_ELEMENT_TEMPLATE_ID = 'settings.entry.template';
const SETTINGS_GROUP_ELEMENT_TEMPLATE_ID = 'settings.group.template';

export interface ISettingChangeEvent {
	key: string;
	value: any; // undefined => reset/unconfigure
}

export class SettingsRenderer implements IRenderer {

	private static readonly SETTING_ROW_HEIGHT = 82;

	private readonly _onDidChangeSetting: Emitter<ISettingChangeEvent> = new Emitter<ISettingChangeEvent>();
	public readonly onDidChangeSetting: Event<ISettingChangeEvent> = this._onDidChangeSetting.event;

	private readonly _onDidOpenSettings: Emitter<void> = new Emitter<void>();
	public readonly onDidOpenSettings: Event<void> = this._onDidOpenSettings.event;

	private measureContainer: HTMLElement;

	constructor(
		_measureContainer: HTMLElement,
		@IThemeService private themeService: IThemeService,
		@IContextViewService private contextViewService: IContextViewService
	) {
		this.measureContainer = DOM.append(_measureContainer, $('.setting-measure-container.monaco-tree-row'));
	}

	getHeight(tree: ITree, element: SettingsTreeElement): number {
		if (element instanceof SettingsTreeGroupElement) {
			return 40 + (4 * element.level);
		}

		if (element instanceof SettingsTreeSettingElement) {
			const isSelected = this.elementIsSelected(tree, element);
			if (isSelected) {
				return this.measureSettingElementHeight(tree, element);
			} else {
				return SettingsRenderer.SETTING_ROW_HEIGHT;
			}
		}

		return 0;
	}

	private measureSettingElementHeight(tree: ITree, element: SettingsTreeSettingElement): number {
		const measureHelper = DOM.append(this.measureContainer, $('.setting-measure-helper'));

		const template = this.renderSettingTemplate(tree, measureHelper);
		this.renderSettingElement(tree, element, template);

		const height = measureHelper.offsetHeight;
		this.measureContainer.removeChild(this.measureContainer.firstChild);
		return Math.max(height, SettingsRenderer.SETTING_ROW_HEIGHT);
	}

	getTemplateId(tree: ITree, element: SettingsTreeElement): string {
		if (element instanceof SettingsTreeGroupElement) {
			return SETTINGS_GROUP_ELEMENT_TEMPLATE_ID;
		}

		if (element instanceof SettingsTreeSettingElement) {
			return SETTINGS_ELEMENT_TEMPLATE_ID;
		}

		return '';
	}

	renderTemplate(tree: ITree, templateId: string, container: HTMLElement) {
		if (templateId === SETTINGS_GROUP_ELEMENT_TEMPLATE_ID) {
			return this.renderGroupTitleTemplate(container);
		}

		if (templateId === SETTINGS_ELEMENT_TEMPLATE_ID) {
			return this.renderSettingTemplate(tree, container);
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

	private renderSettingTemplate(tree: ITree, container: HTMLElement): ISettingItemTemplate {
		DOM.addClass(container, 'setting-item');

		const titleElement = DOM.append(container, $('.setting-item-title'));
		const categoryElement = DOM.append(titleElement, $('span.setting-item-category'));
		const labelElement = DOM.append(titleElement, $('span.setting-item-label'));
		const isConfiguredElement = DOM.append(titleElement, $('span.setting-item-is-configured-label'));
		const otherOverridesElement = DOM.append(titleElement, $('span.setting-item-overrides'));
		const descriptionElement = DOM.append(container, $('.setting-item-description'));

		const valueElement = DOM.append(container, $('.setting-item-value'));

		const toDispose = [];
		const template: ISettingItemTemplate = {
			parent: container,
			toDispose,

			containerElement: container,
			categoryElement,
			labelElement,
			descriptionElement,
			valueElement,
			isConfiguredElement,
			otherOverridesElement
		};

		// Prevent clicks from being handled by list
		toDispose.push(DOM.addDisposableListener(valueElement, 'mousedown', (e: IMouseEvent) => e.stopPropagation()));

		toDispose.push(DOM.addStandardDisposableListener(valueElement, 'keydown', (e: StandardKeyboardEvent) => {
			if (e.keyCode === KeyCode.Escape) {
				tree.domFocus();
				e.browserEvent.stopPropagation();
			}
		}));

		return template;
	}

	renderElement(tree: ITree, element: SettingsTreeElement, templateId: string, template: any): void {
		if (templateId === SETTINGS_ELEMENT_TEMPLATE_ID) {
			return this.renderSettingElement(tree, <SettingsTreeSettingElement>element, template);
		}

		if (templateId === SETTINGS_GROUP_ELEMENT_TEMPLATE_ID) {
			return this.renderGroupElement(<SettingsTreeGroupElement>element, template);
		}
	}

	private renderGroupElement(element: SettingsTreeGroupElement, template: IGroupTitleTemplate): void {
		template.parent.innerHTML = '';
		const labelElement = DOM.append(template.parent, $('h3.settings-group-title-label'));
		labelElement.classList.add(`settings-group-level-${element.level}`);
		labelElement.textContent = (<SettingsTreeGroupElement>element).label;
	}

	private elementIsSelected(tree: ITree, element: SettingsTreeElement): boolean {
		const selection = tree.getSelection();
		const selectedElement: SettingsTreeElement = selection && selection[0];
		return selectedElement && selectedElement.id === element.id;
	}

	private renderSettingElement(tree: ITree, element: SettingsTreeSettingElement, template: ISettingItemTemplate): void {
		const isSelected = !!this.elementIsSelected(tree, element);
		const setting = element.setting;

		template.context = element;
		DOM.toggleClass(template.parent, 'is-configured', element.isConfigured);
		DOM.toggleClass(template.parent, 'is-expanded', isSelected);
		template.containerElement.id = element.id;

		const titleTooltip = setting.key;
		template.categoryElement.textContent = element.displayCategory && (element.displayCategory + ': ');
		template.categoryElement.title = titleTooltip;

		template.labelElement.textContent = element.displayLabel;
		template.labelElement.title = titleTooltip;
		template.descriptionElement.textContent = element.description;

		this.renderValue(element, isSelected, template);
		const resetButton = new Button(template.valueElement);
		const resetText = localize('resetButtonTitle', "reset");
		resetButton.label = resetText;
		resetButton.element.title = resetText;
		resetButton.element.classList.add('setting-reset-button');
		resetButton.element.tabIndex = isSelected ? 0 : -1;

		template.toDispose.push(attachButtonStyler(resetButton, this.themeService, {
			buttonBackground: Color.transparent.toString(),
			buttonHoverBackground: Color.transparent.toString(),
			buttonForeground: editorActiveLinkForeground
		}));

		template.toDispose.push(resetButton.onDidClick(e => {
			this._onDidChangeSetting.fire({ key: element.setting.key, value: undefined });
		}));
		template.toDispose.push(resetButton);

		template.isConfiguredElement.textContent = element.isConfigured ? localize('configured', "Modified") : '';

		if (element.overriddenScopeList.length) {
			let otherOverridesLabel = element.isConfigured ?
				localize('alsoConfiguredIn', "Also modified in") :
				localize('configuredIn', "Modified in");

			template.otherOverridesElement.textContent = `(${otherOverridesLabel}: ${element.overriddenScopeList.join(', ')})`;
		}
	}

	private renderValue(element: SettingsTreeSettingElement, isSelected: boolean, template: ISettingItemTemplate): void {
		const onChange = value => this._onDidChangeSetting.fire({ key: element.setting.key, value });
		template.valueElement.innerHTML = '';

		const valueControlElement = DOM.append(template.valueElement, $('.setting-item-control'));
		if (element.enum && (element.valueType === 'string' || !element.valueType)) {
			valueControlElement.classList.add('setting-type-enum');
			this.renderEnum(element, isSelected, template, valueControlElement, onChange);
		} else if (element.valueType === 'boolean') {
			valueControlElement.classList.add('setting-type-boolean');
			this.renderBool(element, isSelected, template, valueControlElement, onChange);
		} else if (element.valueType === 'string') {
			valueControlElement.classList.add('setting-type-string');
			this.renderText(element, isSelected, template, valueControlElement, onChange);
		} else if (element.valueType === 'number' || element.valueType === 'integer') {
			valueControlElement.classList.add('setting-type-number');
			this.renderText(element, isSelected, template, valueControlElement, value => onChange(parseInt(value)));
		} else {
			valueControlElement.classList.add('setting-type-complex');
			this.renderEditInSettingsJson(element, isSelected, template, valueControlElement);
		}
	}

	private renderBool(dataElement: SettingsTreeSettingElement, isSelected: boolean, template: ISettingItemTemplate, element: HTMLElement, onChange: (value: boolean) => void): void {
		const checkboxElement = <HTMLInputElement>DOM.append(element, $('input.setting-value-checkbox.setting-value-input'));
		checkboxElement.type = 'checkbox';
		checkboxElement.checked = dataElement.value;
		checkboxElement.tabIndex = isSelected ? 0 : -1;

		template.toDispose.push(DOM.addDisposableListener(checkboxElement, 'change', e => onChange(checkboxElement.checked)));
	}

	private renderEnum(dataElement: SettingsTreeSettingElement, isSelected: boolean, template: ISettingItemTemplate, element: HTMLElement, onChange: (value: string) => void): void {
		const idx = dataElement.enum.indexOf(dataElement.value);
		const displayOptions = dataElement.enum.map(escapeInvisibleChars);
		const selectBox = new SelectBox(displayOptions, idx, this.contextViewService);
		template.toDispose.push(attachSelectBoxStyler(selectBox, this.themeService));
		selectBox.render(element);
		if (element.firstElementChild) {
			element.firstElementChild.setAttribute('tabindex', isSelected ? '0' : '-1');
		}

		template.toDispose.push(
			selectBox.onDidSelect(e => onChange(dataElement.enum[e.index])));
	}

	private renderText(dataElement: SettingsTreeSettingElement, isSelected: boolean, template: ISettingItemTemplate, element: HTMLElement, onChange: (value: string) => void): void {
		const inputBox = new InputBox(element, this.contextViewService);
		template.toDispose.push(attachInputBoxStyler(inputBox, this.themeService));
		template.toDispose.push(inputBox);
		inputBox.value = dataElement.value;
		inputBox.inputElement.tabIndex = isSelected ? 0 : -1;

		template.toDispose.push(
			inputBox.onDidChange(e => onChange(e)));
	}

	private renderEditInSettingsJson(dataElement: SettingsTreeSettingElement, isSelected: boolean, template: ISettingItemTemplate, element: HTMLElement): void {
		const openSettingsButton = new Button(element, { title: true, buttonBackground: null, buttonHoverBackground: null });
		openSettingsButton.onDidClick(() => this._onDidOpenSettings.fire());
		openSettingsButton.label = localize('editInSettingsJson', "Edit in settings.json");
		openSettingsButton.element.classList.add('edit-in-settings-button');
		openSettingsButton.element.tabIndex = isSelected ? 0 : -1;

		template.toDispose.push(openSettingsButton);
		template.toDispose.push(attachButtonStyler(openSettingsButton, this.themeService, {
			buttonBackground: Color.transparent.toString(),
			buttonHoverBackground: Color.transparent.toString(),
			buttonForeground: 'foreground'
		}));
	}

	disposeTemplate(tree: ITree, templateId: string, template: IDisposableTemplate): void {
		dispose(template.toDispose);
	}
}

function escapeInvisibleChars(enumValue: string): string {
	return enumValue && enumValue
		.replace(/\n/g, '\\n')
		.replace(/\r/g, '\\r');
}

export class SettingsTreeFilter implements IFilter {
	constructor(
		private viewState: ISettingsEditorViewState,
		@IConfigurationService private configurationService: IConfigurationService
	) { }

	isVisible(tree: ITree, element: SettingsTreeElement): boolean {
		if (this.viewState.showConfiguredOnly && element instanceof SettingsTreeSettingElement) {
			return element.isConfigured;
		}

		if (element instanceof SettingsTreeGroupElement && this.viewState.showConfiguredOnly) {
			return this.groupHasConfiguredSetting(element);
		}

		return true;
	}

	private groupHasConfiguredSetting(element: SettingsTreeGroupElement): boolean {
		for (let child of element.children) {
			if (child instanceof SettingsTreeSettingElement) {
				const { isConfigured } = inspectSetting(child.setting.key, this.viewState.settingsTarget, this.configurationService);
				if (isConfigured) {
					return true;
				}
			} else {
				if (child instanceof SettingsTreeGroupElement) {
					return this.groupHasConfiguredSetting(child);
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

	readonly id = 'searchResultModel';

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
		this.rawSearchResults[type] = result;
	}

	getFlatSettings(): ISetting[] {
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
