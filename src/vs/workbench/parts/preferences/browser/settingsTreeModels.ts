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

	constructor(setting: ISetting, parent: SettingsTreeGroupElement, inspectResult: IInspectResult) {
		super();
		this.setting = setting;
		this.parent = parent;
		this.id = sanitizeId(parent.id + '_' + setting.key);

		this.update(inspectResult);
	}

	update(inspectResult: IInspectResult): void {
		const { isConfigured, inspected, targetSelector } = inspectResult;

		const displayValue = isConfigured ? inspected[targetSelector] : inspected.default;
		const overriddenScopeList = [];
		if (targetSelector === 'user' && typeof inspected.workspace !== 'undefined') {
			overriddenScopeList.push(localize('workspace', "Workspace"));
		}

		if (targetSelector === 'workspace' && typeof inspected.user !== 'undefined') {
			overriddenScopeList.push(localize('user', "User"));
		}

		const displayKeyFormat = settingKeyToDisplayFormat(this.setting.key, this.parent.id);
		this.displayLabel = displayKeyFormat.label;
		this.displayCategory = displayKeyFormat.category;

		this.value = displayValue;
		this.scopeValue = isConfigured && inspected[targetSelector];
		this.defaultValue = inspected.default;

		this.isConfigured = isConfigured;
		if (isConfigured || this.setting.tags) {
			this.tags = new Set<string>();
			if (isConfigured) {
				this.tags.add(MODIFIED_SETTING_TAG);
			}

			if (this.setting.tags) {
				this.setting.tags.forEach(tag => this.tags.add(tag));
			}
		}

		this.overriddenScopeList = overriddenScopeList;
		this.description = this.setting.description.join('\n');

		if (this.setting.enum && (this.setting.type === 'string' || !this.setting.type)) {
			this.valueType = 'enum';
		} else if (this.setting.type === 'string') {
			this.valueType = 'string';
		} else if (isExcludeSetting(this.setting)) {
			this.valueType = 'exclude';
		} else if (this.setting.type === 'integer') {
			this.valueType = 'integer';
		} else if (this.setting.type === 'number') {
			this.valueType = 'number';
		} else if (this.setting.type === 'boolean') {
			this.valueType = 'boolean';
		} else {
			this.valueType = 'complex';
		}
	}

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
	private _treeElementsBySettingName = new Map<string, SettingsTreeSettingElement[]>();
	private _tocRoot: ITOCEntry;

	constructor(
		private _viewState: ISettingsEditorViewState,
		@IConfigurationService private _configurationService: IConfigurationService
	) { }

	get root(): SettingsTreeGroupElement {
		return this._root;
	}

	update(newTocRoot = this._tocRoot): void {
		this._treeElementsById.clear();
		this._treeElementsBySettingName.clear();

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

	getElementByName(name: string): SettingsTreeSettingElement[] {
		return this._treeElementsBySettingName.get(name);
	}

	updateElementsByName(name: string): void {
		if (!this._treeElementsBySettingName.has(name)) {
			return;
		}

		this._treeElementsBySettingName.get(name).forEach(element => {
			const inspectResult = inspectSetting(element.setting.key, this._viewState.settingsTarget, this._configurationService);
			element.update(inspectResult);
		});
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
		const inspectResult = inspectSetting(setting.key, this._viewState.settingsTarget, this._configurationService);
		const element = new SettingsTreeSettingElement(setting, parent, inspectResult);
		this._treeElementsById.set(element.id, element);

		const nameElements = this._treeElementsBySettingName.get(setting.key) || [];
		nameElements.push(element);
		this._treeElementsBySettingName.set(setting.key, nameElements);
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
		.replace(/\.([a-z])/g, (match, p1) => ` › ${p1.toUpperCase()}`)
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