/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as arrays from 'vs/base/common/arrays';
import { isArray } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { ConfigurationTarget, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ConfigurationScope } from 'vs/platform/configuration/common/configurationRegistry';
import { SettingsTarget } from 'vs/workbench/parts/preferences/browser/preferencesWidgets';
import { ITOCEntry, knownAcronyms } from 'vs/workbench/parts/preferences/browser/settingsLayout';
import { IExtensionSetting, ISearchResult, ISetting, SettingValueType } from 'vs/workbench/services/preferences/common/preferences';
import { MODIFIED_SETTING_TAG } from 'vs/workbench/parts/preferences/common/preferences';

export const ONLINE_SERVICES_SETTING_TAG = 'usesOnlineServices';

export interface ISettingsEditorViewState {
	settingsTarget: SettingsTarget;
	tagFilters?: Set<string>;
	filterToCategory?: SettingsTreeGroupElement;
}

export abstract class SettingsTreeElement {
	id: string;
	parent: SettingsTreeGroupElement;

	/**
	 * Index assigned in display order, used for paging.
	 */
	index: number;
}

export type SettingsTreeGroupChild = (SettingsTreeGroupElement | SettingsTreeSettingElement | SettingsTreeNewExtensionsElement);

export class SettingsTreeGroupElement extends SettingsTreeElement {
	count?: number;
	label: string;
	level: number;
	isFirstGroup: boolean;

	private _childSettingKeys: Set<string>;
	private _children: SettingsTreeGroupChild[];

	get children(): SettingsTreeGroupChild[] {
		return this._children;
	}

	set children(newChildren: SettingsTreeGroupChild[]) {
		this._children = newChildren;

		this._childSettingKeys = new Set();
		this._children.forEach(child => {
			if (child instanceof SettingsTreeSettingElement) {
				this._childSettingKeys.add(child.setting.key);
			}
		});
	}

	/**
	 * Returns whether this group contains the given child key (to a depth of 1 only)
	 */
	containsSetting(key: string): boolean {
		return this._childSettingKeys.has(key);
	}
}

export class SettingsTreeNewExtensionsElement extends SettingsTreeElement {
	extensionIds: string[];
}

export class SettingsTreeSettingElement extends SettingsTreeElement {
	setting: ISetting;

	private _displayCategory: string;
	private _displayLabel: string;

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
	valueType: SettingValueType;

	constructor(setting: ISetting, parent: SettingsTreeGroupElement, index: number, inspectResult: IInspectResult) {
		super();
		this.index = index;
		this.setting = setting;
		this.parent = parent;
		this.id = sanitizeId(parent.id + '_' + setting.key);

		this.update(inspectResult);
	}

	get displayCategory(): string {
		if (!this._displayCategory) {
			this.initLabel();
		}

		return this._displayCategory;
	}

	get displayLabel(): string {
		if (!this._displayLabel) {
			this.initLabel();
		}

		return this._displayLabel;
	}

	private initLabel(): void {
		const displayKeyFormat = settingKeyToDisplayFormat(this.setting.key, this.parent.id);
		this._displayLabel = displayKeyFormat.label;
		this._displayCategory = displayKeyFormat.category;
	}

	update(inspectResult: IInspectResult): void {
		const { isConfigured, inspected, targetSelector } = inspectResult;

		const displayValue = isConfigured ? inspected[targetSelector] : inspected.default;
		const overriddenScopeList: string[] = [];
		if (targetSelector === 'user' && typeof inspected.workspace !== 'undefined') {
			overriddenScopeList.push(localize('workspace', "Workspace"));
		}

		if (targetSelector === 'workspace' && typeof inspected.user !== 'undefined') {
			overriddenScopeList.push(localize('user', "User"));
		}

		this.value = displayValue;
		this.scopeValue = isConfigured && inspected[targetSelector];
		this.defaultValue = inspected.default;

		this.isConfigured = isConfigured;
		if (isConfigured || this.setting.tags || this.tags) {
			// Don't create an empty Set for all 1000 settings, only if needed
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

		if (this.setting.enum && (!this.setting.type || settingTypeEnumRenderable(this.setting.type))) {
			this.valueType = SettingValueType.Enum;
		} else if (this.setting.type === 'string') {
			this.valueType = SettingValueType.String;
		} else if (isExcludeSetting(this.setting)) {
			this.valueType = SettingValueType.Exclude;
		} else if (this.setting.type === 'integer') {
			this.valueType = SettingValueType.Integer;
		} else if (this.setting.type === 'number') {
			this.valueType = SettingValueType.Number;
		} else if (this.setting.type === 'boolean') {
			this.valueType = SettingValueType.Boolean;
		} else if (isArray(this.setting.type) && this.setting.type.indexOf(SettingValueType.Null) > -1 && this.setting.type.length === 2) {
			if (this.setting.type.indexOf(SettingValueType.Integer) > -1) {
				this.valueType = SettingValueType.NullableInteger;
			} else if (this.setting.type.indexOf(SettingValueType.Number) > -1) {
				this.valueType = SettingValueType.NullableNumber;
			} else {
				this.valueType = SettingValueType.Complex;
			}
		} else {
			this.valueType = SettingValueType.Complex;
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

	matchesScope(scope: SettingsTarget): boolean {
		const configTarget = URI.isUri(scope) ? ConfigurationTarget.WORKSPACE_FOLDER : scope;

		if (configTarget === ConfigurationTarget.WORKSPACE_FOLDER) {
			return this.setting.scope === ConfigurationScope.RESOURCE;
		}

		if (configTarget === ConfigurationTarget.WORKSPACE) {
			return this.setting.scope === ConfigurationScope.WINDOW || this.setting.scope === ConfigurationScope.RESOURCE;
		}

		return true;
	}
}

export class SettingsTreeModel {
	protected _root: SettingsTreeGroupElement;
	protected _treeElementsById = new Map<string, SettingsTreeElement>();
	private _treeElementsBySettingName = new Map<string, SettingsTreeSettingElement[]>();
	private _tocRoot: ITOCEntry;

	constructor(
		protected _viewState: ISettingsEditorViewState,
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

	getElementsByName(name: string): SettingsTreeSettingElement[] {
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
		const index = this._treeElementsById.size;
		element.index = index;
		element.id = tocEntry.id;
		element.label = tocEntry.label;
		element.parent = parent;
		element.level = this.getDepth(element);

		const children: SettingsTreeGroupChild[] = [];
		if (tocEntry.settings) {
			const settingChildren = tocEntry.settings.map(s => this.createSettingsTreeSettingElement(<ISetting>s, element))
				.filter(el => el.setting.deprecationMessage ? el.isConfigured : true);
			children.push(...settingChildren);
		}

		if (tocEntry.children) {
			const groupChildren = tocEntry.children.map(child => this.createSettingsTreeGroupElement(child, element));
			children.push(...groupChildren);
		}

		element.children = children;

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
		const index = this._treeElementsById.size;
		const inspectResult = inspectSetting(setting.key, this._viewState.settingsTarget, this._configurationService);
		const element = new SettingsTreeSettingElement(setting, parent, index, inspectResult);
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
		.replace(/^[a-z]/g, match => match.toUpperCase()) // foo => Foo
		.replace(/\b\w+\b/g, match => {
			return knownAcronyms.has(match.toLowerCase()) ?
				match.toUpperCase() :
				match;
		});
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
		setting.key === 'search.exclude' ||
		setting.key === 'files.watcherExclude';
}

function settingTypeEnumRenderable(_type: string | string[]) {
	const enumRenderableSettingTypes = ['string', 'boolean', 'null', 'integer', 'number'];
	let type = isArray(_type) ? _type : [_type];
	return type.every(type => enumRenderableSettingTypes.indexOf(type) > -1);
}

export const enum SearchResultIdx {
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
		const localResult = this.rawSearchResults[SearchResultIdx.Local];
		if (localResult) {
			localResult.filterMatches.forEach(m => localMatchKeys.add(m.setting.key));
		}

		const remoteResult = this.rawSearchResults[SearchResultIdx.Remote];
		if (remoteResult) {
			remoteResult.filterMatches = remoteResult.filterMatches.filter(m => !localMatchKeys.has(m.setting.key));
		}

		if (remoteResult) {
			this.newExtensionSearchResults = this.rawSearchResults[SearchResultIdx.NewExtensions];
		}

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

		// Save time, filter children in the search model instead of relying on the tree filter, which still requires heights to be calculated.
		this.root.children = this.root.children
			.filter(child => child instanceof SettingsTreeSettingElement && child.matchesAllTags(this._viewState.tagFilters) && child.matchesScope(this._viewState.settingsTarget));

		if (this.newExtensionSearchResults && this.newExtensionSearchResults.filterMatches.length) {
			const newExtElement = new SettingsTreeNewExtensionsElement();
			newExtElement.index = this._treeElementsById.size;
			newExtElement.parent = this._root;
			newExtElement.id = 'newExtensions';
			this._treeElementsById.set(newExtElement.id, newExtElement);

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

export interface IParsedQuery {
	tags: string[];
	query: string;
}

const tagRegex = /(^|\s)@tag:("([^"]*)"|[^"]\S*)/g;
export function parseQuery(query: string): IParsedQuery {
	const tags: string[] = [];
	query = query.replace(tagRegex, (_, __, quotedTag, tag) => {
		tags.push(tag || quotedTag);
		return '';
	});

	query = query.replace(`@${MODIFIED_SETTING_TAG}`, () => {
		tags.push(MODIFIED_SETTING_TAG);
		return '';
	});

	query = query.trim();

	return {
		tags,
		query
	};
}
