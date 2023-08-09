/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as arrays from 'vs/base/common/arrays';
import { escapeRegExpCharacters, isFalsyOrWhitespace } from 'vs/base/common/strings';
import { isUndefinedOrNull } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { ConfigurationTarget, IConfigurationValue } from 'vs/platform/configuration/common/configuration';
import { SettingsTarget } from 'vs/workbench/contrib/preferences/browser/preferencesWidgets';
import { ITOCEntry, knownAcronyms, knownTermMappings, tocData } from 'vs/workbench/contrib/preferences/browser/settingsLayout';
import { ENABLE_EXTENSION_TOGGLE_SETTINGS, ENABLE_LANGUAGE_FILTER, MODIFIED_SETTING_TAG, POLICY_SETTING_TAG, REQUIRE_TRUSTED_WORKSPACE_SETTING_TAG } from 'vs/workbench/contrib/preferences/common/preferences';
import { IExtensionSetting, ISearchResult, ISetting, SettingValueType } from 'vs/workbench/services/preferences/common/preferences';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { FOLDER_SCOPES, WORKSPACE_SCOPES, REMOTE_MACHINE_SCOPES, LOCAL_MACHINE_SCOPES, IWorkbenchConfigurationService, APPLICATION_SCOPES } from 'vs/workbench/services/configuration/common/configuration';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import { Disposable } from 'vs/base/common/lifecycle';
import { Emitter } from 'vs/base/common/event';
import { ConfigurationScope, EditPresentationTypes, Extensions, IConfigurationRegistry, IExtensionInfo } from 'vs/platform/configuration/common/configurationRegistry';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { Registry } from 'vs/platform/registry/common/platform';
import { IUserDataProfileService } from 'vs/workbench/services/userDataProfile/common/userDataProfile';
import { IProductService } from 'vs/platform/product/common/productService';

export const ONLINE_SERVICES_SETTING_TAG = 'usesOnlineServices';

export interface ISettingsEditorViewState {
	settingsTarget: SettingsTarget;
	query?: string; // used to keep track of loading from setInput vs loading from cache
	tagFilters?: Set<string>;
	extensionFilters?: Set<string>;
	featureFilters?: Set<string>;
	idFilters?: Set<string>;
	languageFilter?: string;
	filterToCategory?: SettingsTreeGroupElement;
}

export abstract class SettingsTreeElement extends Disposable {
	id: string;
	parent?: SettingsTreeGroupElement;

	private _tabbable = false;
	protected readonly _onDidChangeTabbable = new Emitter<void>();
	readonly onDidChangeTabbable = this._onDidChangeTabbable.event;

	constructor(_id: string) {
		super();
		this.id = _id;
	}

	get tabbable(): boolean {
		return this._tabbable;
	}

	set tabbable(value: boolean) {
		this._tabbable = value;
		this._onDidChangeTabbable.fire();
	}
}

export type SettingsTreeGroupChild = (SettingsTreeGroupElement | SettingsTreeSettingElement | SettingsTreeNewExtensionsElement);

export class SettingsTreeGroupElement extends SettingsTreeElement {
	count?: number;
	label: string;
	level: number;
	isFirstGroup: boolean;

	private _childSettingKeys: Set<string> = new Set();
	private _children: SettingsTreeGroupChild[] = [];

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

	constructor(_id: string, count: number | undefined, label: string, level: number, isFirstGroup: boolean) {
		super(_id);

		this.count = count;
		this.label = label;
		this.level = level;
		this.isFirstGroup = isFirstGroup;
	}

	/**
	 * Returns whether this group contains the given child key (to a depth of 1 only)
	 */
	containsSetting(key: string): boolean {
		return this._childSettingKeys.has(key);
	}
}

export class SettingsTreeNewExtensionsElement extends SettingsTreeElement {
	constructor(_id: string, public readonly extensionIds: string[]) {
		super(_id);
	}
}

export class SettingsTreeSettingElement extends SettingsTreeElement {
	private static readonly MAX_DESC_LINES = 20;

	setting: ISetting;

	private _displayCategory: string | null = null;
	private _displayLabel: string | null = null;

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
	 * The source of the default value to display.
	 * This value also accounts for extension-contributed language-specific default value overrides.
	 */
	defaultValueSource: string | IExtensionInfo | undefined;

	/**
	 * Whether the setting is configured in the selected scope.
	 */
	isConfigured = false;

	/**
	 * Whether the setting requires trusted target
	 */
	isUntrusted = false;

	/**
	 * Whether the setting is under a policy that blocks all changes.
	 */
	hasPolicyValue = false;

	tags?: Set<string>;
	overriddenScopeList: string[] = [];
	overriddenDefaultsLanguageList: string[] = [];

	/**
	 * For each language that contributes setting values or default overrides, we can see those values here.
	 */
	languageOverrideValues: Map<string, IConfigurationValue<unknown>> = new Map<string, IConfigurationValue<unknown>>();

	description!: string;
	valueType!: SettingValueType;

	constructor(
		setting: ISetting,
		parent: SettingsTreeGroupElement,
		inspectResult: IInspectResult,
		isWorkspaceTrusted: boolean,
		readonly settingsTarget: SettingsTarget,
		private readonly languageService: ILanguageService,
		private readonly productService: IProductService
	) {
		super(sanitizeId(parent.id + '_' + setting.key));
		this.setting = setting;
		this.parent = parent;

		this.update(inspectResult, isWorkspaceTrusted);
	}

	get displayCategory(): string {
		if (!this._displayCategory) {
			this.initLabels();
		}

		return this._displayCategory!;
	}

	get displayLabel(): string {
		if (!this._displayLabel) {
			this.initLabels();
		}

		return this._displayLabel!;
	}

	private initLabels(): void {
		if (this.setting.title) {
			this._displayLabel = this.setting.title;
			this._displayCategory = '';
			return;
		}
		const displayKeyFormat = settingKeyToDisplayFormat(this.setting.key, this.parent!.id, this.setting.isLanguageTagSetting);
		this._displayLabel = displayKeyFormat.label;
		this._displayCategory = displayKeyFormat.category;
	}

	update(inspectResult: IInspectResult, isWorkspaceTrusted: boolean): void {
		let { isConfigured, inspected, targetSelector, inspectedLanguageOverrides, languageSelector } = inspectResult;

		switch (targetSelector) {
			case 'workspaceFolderValue':
			case 'workspaceValue':
				this.isUntrusted = !!this.setting.restricted && !isWorkspaceTrusted;
				break;
		}

		let displayValue = isConfigured ? inspected[targetSelector] : inspected.defaultValue;
		const overriddenScopeList: string[] = [];
		const overriddenDefaultsLanguageList: string[] = [];
		if ((languageSelector || targetSelector !== 'workspaceValue') && typeof inspected.workspaceValue !== 'undefined') {
			overriddenScopeList.push('workspace:');
		}
		if ((languageSelector || targetSelector !== 'userRemoteValue') && typeof inspected.userRemoteValue !== 'undefined') {
			overriddenScopeList.push('remote:');
		}
		if ((languageSelector || targetSelector !== 'userLocalValue') && typeof inspected.userLocalValue !== 'undefined') {
			overriddenScopeList.push('user:');
		}

		if (inspected.overrideIdentifiers) {
			for (const overrideIdentifier of inspected.overrideIdentifiers) {
				const inspectedOverride = inspectedLanguageOverrides.get(overrideIdentifier);
				if (inspectedOverride) {
					if (this.languageService.isRegisteredLanguageId(overrideIdentifier)) {
						if (languageSelector !== overrideIdentifier && typeof inspectedOverride.default?.override !== 'undefined') {
							overriddenDefaultsLanguageList.push(overrideIdentifier);
						}
						if ((languageSelector !== overrideIdentifier || targetSelector !== 'workspaceValue') && typeof inspectedOverride.workspace?.override !== 'undefined') {
							overriddenScopeList.push(`workspace:${overrideIdentifier}`);
						}
						if ((languageSelector !== overrideIdentifier || targetSelector !== 'userRemoteValue') && typeof inspectedOverride.userRemote?.override !== 'undefined') {
							overriddenScopeList.push(`remote:${overrideIdentifier}`);
						}
						if ((languageSelector !== overrideIdentifier || targetSelector !== 'userLocalValue') && typeof inspectedOverride.userLocal?.override !== 'undefined') {
							overriddenScopeList.push(`user:${overrideIdentifier}`);
						}
					}
					this.languageOverrideValues.set(overrideIdentifier, inspectedOverride);
				}
			}
		}
		this.overriddenScopeList = overriddenScopeList;
		this.overriddenDefaultsLanguageList = overriddenDefaultsLanguageList;

		// The user might have added, removed, or modified a language filter,
		// so we reset the default value source to the non-language-specific default value source for now.
		this.defaultValueSource = this.setting.nonLanguageSpecificDefaultValueSource;

		if (inspected.policyValue) {
			this.hasPolicyValue = true;
			isConfigured = false; // The user did not manually configure the setting themselves.
			displayValue = inspected.policyValue;
			this.scopeValue = inspected.policyValue;
			this.defaultValue = inspected.defaultValue;
		} else if (languageSelector && this.languageOverrideValues.has(languageSelector)) {
			const overrideValues = this.languageOverrideValues.get(languageSelector)!;
			// In the worst case, go back to using the previous display value.
			// Also, sometimes the override is in the form of a default value override, so consider that second.
			displayValue = (isConfigured ? overrideValues[targetSelector] : overrideValues.defaultValue) ?? displayValue;
			this.scopeValue = isConfigured && overrideValues[targetSelector];
			this.defaultValue = overrideValues.defaultValue ?? inspected.defaultValue;

			const registryValues = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurationDefaultsOverrides();
			const overrideValueSource = registryValues.get(`[${languageSelector}]`)?.valuesSources?.get(this.setting.key);
			if (overrideValueSource) {
				this.defaultValueSource = overrideValueSource;
			}
		} else {
			this.scopeValue = isConfigured && inspected[targetSelector];
			this.defaultValue = inspected.defaultValue;
		}

		this.value = displayValue;
		this.isConfigured = isConfigured;
		if (isConfigured || this.setting.tags || this.tags || this.setting.restricted || this.hasPolicyValue) {
			// Don't create an empty Set for all 1000 settings, only if needed
			this.tags = new Set<string>();
			if (isConfigured) {
				this.tags.add(MODIFIED_SETTING_TAG);
			}

			this.setting.tags?.forEach(tag => this.tags!.add(tag));

			if (this.setting.restricted) {
				this.tags.add(REQUIRE_TRUSTED_WORKSPACE_SETTING_TAG);
			}

			if (this.hasPolicyValue) {
				this.tags.add(POLICY_SETTING_TAG);
			}
		}

		if (this.setting.description.length > SettingsTreeSettingElement.MAX_DESC_LINES) {
			const truncatedDescLines = this.setting.description.slice(0, SettingsTreeSettingElement.MAX_DESC_LINES);
			truncatedDescLines.push('[...]');
			this.description = truncatedDescLines.join('\n');
		} else {
			this.description = this.setting.description.join('\n');
		}

		if (isExtensionToggleSetting(this.setting, this.productService)) {
			this.valueType = SettingValueType.ExtensionToggle;
		} else if (this.setting.enum && (!this.setting.type || settingTypeEnumRenderable(this.setting.type))) {
			this.valueType = SettingValueType.Enum;
		} else if (this.setting.type === 'string') {
			if (this.setting.editPresentation === EditPresentationTypes.Multiline) {
				this.valueType = SettingValueType.MultilineString;
			} else {
				this.valueType = SettingValueType.String;
			}
		} else if (isExcludeSetting(this.setting)) {
			this.valueType = SettingValueType.Exclude;
		} else if (isIncludeSetting(this.setting)) {
			this.valueType = SettingValueType.Include;
		} else if (this.setting.type === 'integer') {
			this.valueType = SettingValueType.Integer;
		} else if (this.setting.type === 'number') {
			this.valueType = SettingValueType.Number;
		} else if (this.setting.type === 'boolean') {
			this.valueType = SettingValueType.Boolean;
		} else if (this.setting.type === 'array' && this.setting.arrayItemType &&
			['string', 'enum', 'number', 'integer'].includes(this.setting.arrayItemType)) {
			this.valueType = SettingValueType.Array;
		} else if (Array.isArray(this.setting.type) && this.setting.type.includes(SettingValueType.Null) && this.setting.type.length === 2) {
			if (this.setting.type.includes(SettingValueType.Integer)) {
				this.valueType = SettingValueType.NullableInteger;
			} else if (this.setting.type.includes(SettingValueType.Number)) {
				this.valueType = SettingValueType.NullableNumber;
			} else {
				this.valueType = SettingValueType.Complex;
			}
		} else if (isObjectSetting(this.setting)) {
			if (this.setting.allKeysAreBoolean) {
				this.valueType = SettingValueType.BooleanObject;
			} else {
				this.valueType = SettingValueType.Object;
			}
		} else if (this.setting.isLanguageTagSetting) {
			this.valueType = SettingValueType.LanguageTag;
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
				hasFilteredTag = hasFilteredTag && this.tags!.has(tag);
			});
			return hasFilteredTag;
		} else {
			return false;
		}
	}

	matchesScope(scope: SettingsTarget, isRemote: boolean): boolean {
		const configTarget = URI.isUri(scope) ? ConfigurationTarget.WORKSPACE_FOLDER : scope;

		if (!this.setting.scope) {
			return true;
		}

		if (configTarget === ConfigurationTarget.APPLICATION) {
			return APPLICATION_SCOPES.includes(this.setting.scope);
		}

		if (configTarget === ConfigurationTarget.WORKSPACE_FOLDER) {
			return FOLDER_SCOPES.includes(this.setting.scope);
		}

		if (configTarget === ConfigurationTarget.WORKSPACE) {
			return WORKSPACE_SCOPES.includes(this.setting.scope);
		}

		if (configTarget === ConfigurationTarget.USER_REMOTE) {
			return REMOTE_MACHINE_SCOPES.includes(this.setting.scope);
		}

		if (configTarget === ConfigurationTarget.USER_LOCAL) {
			if (isRemote) {
				return LOCAL_MACHINE_SCOPES.includes(this.setting.scope);
			}
		}

		return true;
	}

	matchesAnyExtension(extensionFilters?: Set<string>): boolean {
		if (!extensionFilters || !extensionFilters.size) {
			return true;
		}

		if (!this.setting.extensionInfo) {
			return false;
		}

		return Array.from(extensionFilters).some(extensionId => extensionId.toLowerCase() === this.setting.extensionInfo!.id.toLowerCase());
	}

	matchesAnyFeature(featureFilters?: Set<string>): boolean {
		if (!featureFilters || !featureFilters.size) {
			return true;
		}

		const features = tocData.children!.find(child => child.id === 'features');

		return Array.from(featureFilters).some(filter => {
			if (features && features.children) {
				const feature = features.children.find(feature => 'features/' + filter === feature.id);
				if (feature) {
					const patterns = feature.settings?.map(setting => createSettingMatchRegExp(setting));
					return patterns && !this.setting.extensionInfo && patterns.some(pattern => pattern.test(this.setting.key.toLowerCase()));
				} else {
					return false;
				}
			} else {
				return false;
			}
		});
	}

	matchesAnyId(idFilters?: Set<string>): boolean {
		if (!idFilters || !idFilters.size) {
			return true;
		}
		return idFilters.has(this.setting.key);
	}

	matchesAllLanguages(languageFilter?: string): boolean {
		if (!languageFilter) {
			// We're not filtering by language.
			return true;
		}

		if (!this.languageService.isRegisteredLanguageId(languageFilter)) {
			// We're trying to filter by an invalid language.
			return false;
		}

		// We have a language filter in the search widget at this point.
		// We decide to show all language overridable settings to make the
		// lang filter act more like a scope filter,
		// rather than adding on an implicit @modified as well.
		if (this.setting.scope === ConfigurationScope.LANGUAGE_OVERRIDABLE) {
			return true;
		}

		return false;
	}
}


function createSettingMatchRegExp(pattern: string): RegExp {
	pattern = escapeRegExpCharacters(pattern)
		.replace(/\\\*/g, '.*');

	return new RegExp(`^${pattern}$`, 'i');
}

export class SettingsTreeModel {
	protected _root!: SettingsTreeGroupElement;
	private _treeElementsBySettingName = new Map<string, SettingsTreeSettingElement[]>();
	private _tocRoot!: ITOCEntry<ISetting>;

	constructor(
		protected _viewState: ISettingsEditorViewState,
		private _isWorkspaceTrusted: boolean,
		@IWorkbenchConfigurationService private readonly _configurationService: IWorkbenchConfigurationService,
		@ILanguageService private readonly _languageService: ILanguageService,
		@IUserDataProfileService private readonly _userDataProfileService: IUserDataProfileService,
		@IProductService private readonly _productService: IProductService
	) {
	}

	get root(): SettingsTreeGroupElement {
		return this._root;
	}

	update(newTocRoot = this._tocRoot): void {
		this._treeElementsBySettingName.clear();

		const newRoot = this.createSettingsTreeGroupElement(newTocRoot);
		if (newRoot.children[0] instanceof SettingsTreeGroupElement) {
			(<SettingsTreeGroupElement>newRoot.children[0]).isFirstGroup = true;
		}

		if (this._root) {
			this.disposeChildren(this._root.children);
			this._root.children = newRoot.children;
		} else {
			this._root = newRoot;
		}
	}

	updateWorkspaceTrust(workspaceTrusted: boolean): void {
		this._isWorkspaceTrusted = workspaceTrusted;
		this.updateRequireTrustedTargetElements();
	}

	private disposeChildren(children: SettingsTreeGroupChild[]) {
		for (const child of children) {
			this.recursiveDispose(child);
		}
	}

	private recursiveDispose(element: SettingsTreeElement) {
		if (element instanceof SettingsTreeGroupElement) {
			this.disposeChildren(element.children);
		}

		element.dispose();
	}

	getElementsByName(name: string): SettingsTreeSettingElement[] | null {
		return this._treeElementsBySettingName.get(name) ?? null;
	}

	updateElementsByName(name: string): void {
		if (!this._treeElementsBySettingName.has(name)) {
			return;
		}

		this.updateSettings(this._treeElementsBySettingName.get(name)!);
	}

	private updateRequireTrustedTargetElements(): void {
		this.updateSettings([...this._treeElementsBySettingName.values()].flat().filter(s => s.isUntrusted));
	}

	private getTargetToInspect(setting: ISetting): SettingsTarget {
		if (!this._userDataProfileService.currentProfile.isDefault) {
			if (setting.scope === ConfigurationScope.APPLICATION) {
				return ConfigurationTarget.APPLICATION;
			}
			if (this._configurationService.isSettingAppliedForAllProfiles(setting.key) && this._viewState.settingsTarget === ConfigurationTarget.USER_LOCAL) {
				return ConfigurationTarget.APPLICATION;
			}
		}
		return this._viewState.settingsTarget;
	}

	private updateSettings(settings: SettingsTreeSettingElement[]): void {
		for (const element of settings) {
			const target = this.getTargetToInspect(element.setting);
			const inspectResult = inspectSetting(element.setting.key, target, this._viewState.languageFilter, this._configurationService);
			element.update(inspectResult, this._isWorkspaceTrusted);
		}
	}

	private createSettingsTreeGroupElement(tocEntry: ITOCEntry<ISetting>, parent?: SettingsTreeGroupElement): SettingsTreeGroupElement {
		const depth = parent ? this.getDepth(parent) + 1 : 0;
		const element = new SettingsTreeGroupElement(tocEntry.id, undefined, tocEntry.label, depth, false);
		element.parent = parent;

		const children: SettingsTreeGroupChild[] = [];
		if (tocEntry.settings) {
			const settingChildren = tocEntry.settings.map(s => this.createSettingsTreeSettingElement(s, element))
				.filter(el => el.setting.deprecationMessage ? el.isConfigured : true);
			children.push(...settingChildren);
		}

		if (tocEntry.children) {
			const groupChildren = tocEntry.children.map(child => this.createSettingsTreeGroupElement(child, element));
			children.push(...groupChildren);
		}

		element.children = children;

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
		const target = this.getTargetToInspect(setting);
		const inspectResult = inspectSetting(setting.key, target, this._viewState.languageFilter, this._configurationService);
		const element = new SettingsTreeSettingElement(setting, parent, inspectResult, this._isWorkspaceTrusted, this._viewState.settingsTarget, this._languageService, this._productService);

		const nameElements = this._treeElementsBySettingName.get(setting.key) || [];
		nameElements.push(element);
		this._treeElementsBySettingName.set(setting.key, nameElements);
		return element;
	}
}

interface IInspectResult {
	isConfigured: boolean;
	inspected: IConfigurationValue<unknown>;
	targetSelector: 'applicationValue' | 'userLocalValue' | 'userRemoteValue' | 'workspaceValue' | 'workspaceFolderValue';
	inspectedLanguageOverrides: Map<string, IConfigurationValue<unknown>>;
	languageSelector: string | undefined;
}

export function inspectSetting(key: string, target: SettingsTarget, languageFilter: string | undefined, configurationService: IWorkbenchConfigurationService): IInspectResult {
	const inspectOverrides = URI.isUri(target) ? { resource: target } : undefined;
	const inspected = configurationService.inspect(key, inspectOverrides);
	const targetSelector = target === ConfigurationTarget.APPLICATION ? 'applicationValue' :
		target === ConfigurationTarget.USER_LOCAL ? 'userLocalValue' :
			target === ConfigurationTarget.USER_REMOTE ? 'userRemoteValue' :
				target === ConfigurationTarget.WORKSPACE ? 'workspaceValue' :
					'workspaceFolderValue';
	const targetOverrideSelector = target === ConfigurationTarget.APPLICATION ? 'application' :
		target === ConfigurationTarget.USER_LOCAL ? 'userLocal' :
			target === ConfigurationTarget.USER_REMOTE ? 'userRemote' :
				target === ConfigurationTarget.WORKSPACE ? 'workspace' :
					'workspaceFolder';
	let isConfigured = typeof inspected[targetSelector] !== 'undefined';

	const overrideIdentifiers = inspected.overrideIdentifiers;
	const inspectedLanguageOverrides = new Map<string, IConfigurationValue<unknown>>();

	// We must reset isConfigured to be false if languageFilter is set, and manually
	// determine whether it can be set to true later.
	if (languageFilter) {
		isConfigured = false;
	}
	if (overrideIdentifiers) {
		// The setting we're looking at has language overrides.
		for (const overrideIdentifier of overrideIdentifiers) {
			inspectedLanguageOverrides.set(overrideIdentifier, configurationService.inspect(key, { overrideIdentifier }));
		}

		// For all language filters, see if there's an override for that filter.
		if (languageFilter) {
			if (inspectedLanguageOverrides.has(languageFilter)) {
				const overrideValue = inspectedLanguageOverrides.get(languageFilter)![targetOverrideSelector]?.override;
				if (typeof overrideValue !== 'undefined') {
					isConfigured = true;
				}
			}
		}
	}

	return { isConfigured, inspected, targetSelector, inspectedLanguageOverrides, languageSelector: languageFilter };
}

function sanitizeId(id: string): string {
	return id.replace(/[\.\/]/, '_');
}

export function settingKeyToDisplayFormat(key: string, groupId: string = '', isLanguageTagSetting: boolean = false): { category: string; label: string } {
	const lastDotIdx = key.lastIndexOf('.');
	let category = '';
	if (lastDotIdx >= 0) {
		category = key.substring(0, lastDotIdx);
		key = key.substring(lastDotIdx + 1);
	}

	groupId = groupId.replace(/\//g, '.');
	category = trimCategoryForGroup(category, groupId);
	category = wordifyKey(category);

	if (isLanguageTagSetting) {
		key = key.replace(/[\[\]]/g, '');
		key = '$(bracket) ' + key;
	}

	const label = wordifyKey(key);
	return { category, label };
}

function wordifyKey(key: string): string {
	key = key
		.replace(/\.([a-z0-9])/g, (_, p1) => ` \u203A ${p1.toUpperCase()}`) // Replace dot with spaced '>'
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2') // Camel case to spacing, fooBar => foo Bar
		.replace(/^[a-z]/g, match => match.toUpperCase()) // Upper casing all first letters, foo => Foo
		.replace(/\b\w+\b/g, match => { // Upper casing known acronyms
			return knownAcronyms.has(match.toLowerCase()) ?
				match.toUpperCase() :
				match;
		});

	for (const [k, v] of knownTermMappings) {
		key = key.replace(new RegExp(`\\b${k}\\b`, 'gi'), v);
	}

	return key;
}

/**
 * Removes redundant sections of the category label.
 * A redundant section is a section already reflected in the groupId.
 *
 * @param category The category of the specific setting.
 * @param groupId The author + extension ID.
 * @returns The new category label to use.
 */
function trimCategoryForGroup(category: string, groupId: string): string {
	const doTrim = (forward: boolean) => {
		// Remove the Insiders portion if the category doesn't use it.
		if (!/insiders$/i.test(category)) {
			groupId = groupId.replace(/-?insiders$/i, '');
		}
		const parts = groupId.split('.')
			.map(part => {
				// Remove hyphens, but only if that results in a match with the category.
				if (part.replace(/-/g, '').toLowerCase() === category.toLowerCase()) {
					return part.replace(/-/g, '');
				} else {
					return part;
				}
			});
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

function isExtensionToggleSetting(setting: ISetting, productService: IProductService): boolean {
	return ENABLE_EXTENSION_TOGGLE_SETTINGS &&
		!!productService.extensionRecommendations &&
		!!setting.displayExtensionId;
}

function isExcludeSetting(setting: ISetting): boolean {
	return setting.key === 'files.exclude' ||
		setting.key === 'search.exclude' ||
		setting.key === 'workbench.localHistory.exclude' ||
		setting.key === 'explorer.autoRevealExclude' ||
		setting.key === 'files.readonlyExclude' ||
		setting.key === 'files.watcherExclude';
}

function isIncludeSetting(setting: ISetting): boolean {
	return setting.key === 'files.readonlyInclude';
}

function isObjectRenderableSchema({ type }: IJSONSchema): boolean {
	return type === 'string' || type === 'boolean' || type === 'integer' || type === 'number';
}

function isObjectSetting({
	type,
	objectProperties,
	objectPatternProperties,
	objectAdditionalProperties
}: ISetting): boolean {
	if (type !== 'object') {
		return false;
	}

	// object can have any shape
	if (
		isUndefinedOrNull(objectProperties) &&
		isUndefinedOrNull(objectPatternProperties) &&
		isUndefinedOrNull(objectAdditionalProperties)
	) {
		return false;
	}

	// objectAdditionalProperties allow the setting to have any shape,
	// but if there's a pattern property that handles everything, then every
	// property will match that patternProperty, so we don't need to look at
	// the value of objectAdditionalProperties in that case.
	if ((objectAdditionalProperties === true || objectAdditionalProperties === undefined)
		&& !Object.keys(objectPatternProperties ?? {}).includes('.*')) {
		return false;
	}

	const schemas = [...Object.values(objectProperties ?? {}), ...Object.values(objectPatternProperties ?? {})];

	if (objectAdditionalProperties && typeof objectAdditionalProperties === 'object') {
		schemas.push(objectAdditionalProperties);
	}

	// Flatten anyof schemas
	const flatSchemas = arrays.flatten(schemas.map((schema): IJSONSchema[] => {
		if (Array.isArray(schema.anyOf)) {
			return schema.anyOf;
		}
		return [schema];
	}));

	return flatSchemas.every(isObjectRenderableSchema);
}

function settingTypeEnumRenderable(_type: string | string[]) {
	const enumRenderableSettingTypes = ['string', 'boolean', 'null', 'integer', 'number'];
	const type = Array.isArray(_type) ? _type : [_type];
	return type.every(type => enumRenderableSettingTypes.includes(type));
}

export const enum SearchResultIdx {
	Local = 0,
	Remote = 1,
	NewExtensions = 2
}

export class SearchResultModel extends SettingsTreeModel {
	private rawSearchResults: ISearchResult[] | null = null;
	private cachedUniqueSearchResults: ISearchResult[] | null = null;
	private newExtensionSearchResults: ISearchResult | null = null;
	private searchResultCount: number | null = null;

	readonly id = 'searchResultModel';

	constructor(
		viewState: ISettingsEditorViewState,
		isWorkspaceTrusted: boolean,
		@IWorkbenchConfigurationService configurationService: IWorkbenchConfigurationService,
		@IWorkbenchEnvironmentService private environmentService: IWorkbenchEnvironmentService,
		@ILanguageService languageService: ILanguageService,
		@IUserDataProfileService userDataProfileService: IUserDataProfileService,
		@IProductService productService: IProductService
	) {
		super(viewState, isWorkspaceTrusted, configurationService, languageService, userDataProfileService, productService);
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
		localResult?.filterMatches.forEach(m => localMatchKeys.add(m.setting.key));

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
		return this.rawSearchResults || [];
	}

	setResult(order: SearchResultIdx, result: ISearchResult | null): void {
		this.cachedUniqueSearchResults = null;
		this.newExtensionSearchResults = null;

		this.rawSearchResults = this.rawSearchResults || [];
		if (!result) {
			delete this.rawSearchResults[order];
			return;
		}

		if (result.exactMatch) {
			this.rawSearchResults = [];
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
		const isRemote = !!this.environmentService.remoteAuthority;

		this.root.children = this.root.children
			.filter(child => child instanceof SettingsTreeSettingElement && child.matchesAllTags(this._viewState.tagFilters) && child.matchesScope(this._viewState.settingsTarget, isRemote) && child.matchesAnyExtension(this._viewState.extensionFilters) && child.matchesAnyId(this._viewState.idFilters) && child.matchesAnyFeature(this._viewState.featureFilters) && child.matchesAllLanguages(this._viewState.languageFilter));
		this.searchResultCount = this.root.children.length;

		if (this.newExtensionSearchResults?.filterMatches.length) {
			let resultExtensionIds = this.newExtensionSearchResults.filterMatches
				.map(result => (<IExtensionSetting>result.setting))
				.filter(setting => setting.extensionName && setting.extensionPublisher)
				.map(setting => `${setting.extensionPublisher}.${setting.extensionName}`);
			resultExtensionIds = arrays.distinct(resultExtensionIds);

			if (resultExtensionIds.length) {
				const newExtElement = new SettingsTreeNewExtensionsElement('newExtensions', resultExtensionIds);
				newExtElement.parent = this._root;
				this._root.children.push(newExtElement);
			}
		}
	}

	getUniqueResultsCount(): number {
		return this.searchResultCount ?? 0;
	}

	private getFlatSettings(): ISetting[] {
		const flatSettings: ISetting[] = [];
		arrays.coalesce(this.getUniqueResults())
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
	extensionFilters: string[];
	idFilters: string[];
	featureFilters: string[];
	languageFilter: string | undefined;
}

const tagRegex = /(^|\s)@tag:("([^"]*)"|[^"]\S*)/g;
const extensionRegex = /(^|\s)@ext:("([^"]*)"|[^"]\S*)?/g;
const featureRegex = /(^|\s)@feature:("([^"]*)"|[^"]\S*)?/g;
const idRegex = /(^|\s)@id:("([^"]*)"|[^"]\S*)?/g;
const languageRegex = /(^|\s)@lang:("([^"]*)"|[^"]\S*)?/g;

export function parseQuery(query: string): IParsedQuery {
	/**
	 * A helper function to parse the query on one type of regex.
	 *
	 * @param query The search query
	 * @param filterRegex The regex to use on the query
	 * @param parsedParts The parts that the regex parses out will be appended to the array passed in here.
	 * @returns The query with the parsed parts removed
	 */
	function getTagsForType(query: string, filterRegex: RegExp, parsedParts: string[]): string {
		return query.replace(filterRegex, (_, __, quotedParsedElement, unquotedParsedElement) => {
			const parsedElement: string = unquotedParsedElement || quotedParsedElement;
			if (parsedElement) {
				parsedParts.push(...parsedElement.split(',').map(s => s.trim()).filter(s => !isFalsyOrWhitespace(s)));
			}
			return '';
		});
	}

	const tags: string[] = [];
	query = query.replace(tagRegex, (_, __, quotedTag, tag) => {
		tags.push(tag || quotedTag);
		return '';
	});

	query = query.replace(`@${MODIFIED_SETTING_TAG}`, () => {
		tags.push(MODIFIED_SETTING_TAG);
		return '';
	});

	query = query.replace(`@${POLICY_SETTING_TAG}`, () => {
		tags.push(POLICY_SETTING_TAG);
		return '';
	});

	const extensions: string[] = [];
	const features: string[] = [];
	const ids: string[] = [];
	const langs: string[] = [];
	query = getTagsForType(query, extensionRegex, extensions);
	query = getTagsForType(query, featureRegex, features);
	query = getTagsForType(query, idRegex, ids);

	if (ENABLE_LANGUAGE_FILTER) {
		query = getTagsForType(query, languageRegex, langs);
	}

	query = query.trim();

	// For now, only return the first found language filter
	return {
		tags,
		extensionFilters: extensions,
		featureFilters: features,
		idFilters: ids,
		languageFilter: langs.length ? langs[0] : undefined,
		query,
	};
}
