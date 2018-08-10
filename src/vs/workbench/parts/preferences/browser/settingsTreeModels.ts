/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as arrays from 'vs/base/common/arrays';
import * as objects from 'vs/base/common/objects';
import URI from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { ConfigurationTarget, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { SettingsTarget } from 'vs/workbench/parts/preferences/browser/preferencesWidgets';
import { ITOCEntry } from 'vs/workbench/parts/preferences/browser/settingsLayout';
import { IExtensionSetting, ISearchResult, ISetting } from 'vs/workbench/services/preferences/common/preferences';

export const MODIFIED_SETTING_TAG = 'modified';
export const ONLINE_SERVICES_SETTING_TAG = 'usesOnlineServices';

export interface ISettingsEditorViewState {
	settingsTarget: SettingsTarget;
	tagFilters?: Set<string>;
	filterToCategory?: SettingsTreeGroupElement;
}

export abstract class SettingsTreeElement {
	id: string;
	parent: SettingsTreeGroupElement;
}

export class SettingsTreeGroupElement extends SettingsTreeElement {
	children: (SettingsTreeGroupElement | SettingsTreeSettingElement | SettingsTreeNewExtensionsElement)[];
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
	valueType: 'enum' | 'string' | 'integer' | 'number' | 'boolean' | 'exclude' | 'complex';

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

export class SettingsTreeModel {
	protected _root: SettingsTreeGroupElement;
	private _treeElementsById = new Map<string, SettingsTreeElement>();
	private _treeElementsBySettingName = new Map<string, SettingsTreeElement>();
	private _tocRoot: ITOCEntry;

	constructor(
		private _viewState: ISettingsEditorViewState,
		@IConfigurationService private _configurationService: IConfigurationService
	) { }

	get root(): SettingsTreeGroupElement {
		return this._root;
	}

	update(newTocRoot = this._tocRoot): void {
		const newRoot = this.createSettingsTreeGroupElement(newTocRoot);
		if (newRoot.children[0] instanceof SettingsTreeGroupElement) {
			(<SettingsTreeGroupElement>newRoot.children[0]).isFirstGroup = true; // TODO
		}

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
		} else {
			element.children = [];
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

function sanitizeId(id: string): string {
	return id.replace(/[\.\/]/, '_');
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

export function isExcludeSetting(setting: ISetting): boolean {
	return setting.key === 'files.exclude' ||
		setting.key === 'search.exclude';
}

function createSettingsTreeSettingElement(setting: ISetting, parent: SettingsTreeGroupElement, settingsTarget: SettingsTarget, configurationService: IConfigurationService): SettingsTreeSettingElement {
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
	} else {
		element.valueType = 'complex';
	}

	return element;
}

export enum SearchResultIdx {
	Local = 0,
	Remote = 1,
	NewExtensions = 2
}

export class SearchResultModel extends SettingsTreeModel {
	private rawSearchResults: ISearchResult[];
	private cachedUniqueSearchResults: ISearchResult[];
	private newExtensionSearchResults: ISearchResult;

	readonly id = 'searchResultModel';

	constructor(
		viewState: ISettingsEditorViewState,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super(viewState, configurationService);
		this.update({ id: 'searchResultModel', label: '' });
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
		this.update({
			id: 'searchResultModel',
			label: 'searchResultModel',
			settings: this.getFlatSettings()
		});

		if (this.newExtensionSearchResults) {
			const newExtElement = new SettingsTreeNewExtensionsElement();
			newExtElement.parent = this._root;
			newExtElement.id = 'newExtensions';
			const resultExtensionIds = this.newExtensionSearchResults.filterMatches
				.map(result => (<IExtensionSetting>result.setting))
				.filter(setting => setting.extensionName && setting.extensionPublisher)
				.map(setting => `${setting.extensionPublisher}.${setting.extensionName}`);
			newExtElement.extensionIds = arrays.distinct(resultExtensionIds);
			this._root.children.push(newExtElement);
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