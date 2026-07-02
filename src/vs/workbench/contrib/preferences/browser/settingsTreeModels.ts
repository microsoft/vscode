/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as arrays from '../../../../base/common/arrays.js';
import { Emitter } from '../../../../base/common/event.js';
import { IJSONSchema } from '../../../../base/common/jsonSchema.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { escapeRegExpCharacters, isFalsyOrWhitespace } from '../../../../base/common/strings.js';
import { isUndefinedOrNull } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { ConfigurationTarget, getLanguageTagSettingPlainKey, IConfigurationValue } from '../../../../platform/configuration/common/configuration.js';
import { ConfigurationDefaultValueSource, ConfigurationScope, EditPresentationTypes, Extensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { USER_LOCAL_AND_REMOTE_SETTINGS } from '../../../../platform/request/common/request.js';
import { localize } from '../../../../nls.js';
import { APPLICATION_SCOPES, FOLDER_SCOPES, IWorkbenchConfigurationService, LOCAL_MACHINE_SCOPES, REMOTE_MACHINE_SCOPES, WORKSPACE_SCOPES } from '../../../services/configuration/common/configuration.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IExtensionSetting, ISearchResult, ISetting, ISettingMatch, SettingMatchType, SettingValueType } from '../../../services/preferences/common/preferences.js';
import { IUserDataProfileService } from '../../../services/userDataProfile/common/userDataProfile.js';
import { AGENTS_WINDOW_SETTING_TAG, ENABLE_EXTENSION_TOGGLE_SETTINGS, ENABLE_LANGUAGE_FILTER, MODIFIED_SETTING_TAG, POLICY_SETTING_TAG, REQUIRE_TRUSTED_WORKSPACE_SETTING_TAG, compareTwoNullableNumbers, wordifyKey } from '../common/preferences.js';
import { SettingsTarget } from './preferencesWidgets.js';
import { ITOCEntry, tocData } from './settingsLayout.js';

export const ONLINE_SERVICES_SETTING_TAG = 'usesOnlineServices';

export interface ISettingsEditorViewState {
	settingsTarget: SettingsTarget;
	query?: string; // used to keep track of loading from setInput vs loading from cache
	tagFilters?: Set<string>;
	extensionFilters?: Set<string>;
	featureFilters?: Set<string>;
	idFilters?: Set<string>;
	languageFilter?: string;
	categoryFilter?: SettingsTreeGroupElement;
}

export abstract class SettingsTreeElement extends Disposable {
	id: string;
	parent?: SettingsTreeGroupElement;

	private _tabbable = false;

	private readonly _onDidChangeTabbable = this._register(new Emitter<void>());
	get onDidChangeTabbable() { return this._onDidChangeTabbable.event; }

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
	defaultValueSource: ConfigurationDefaultValueSource | undefined;

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

	/**
	 * Whether the setting is read-only in the Agents window.
	 */
	isAgentsWindowReadOnly = false;

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
		readonly settingsTarget: SettingsTarget,
		private readonly isWorkspaceTrusted: boolean,
		private readonly languageFilter: string | undefined,
		private readonly languageService: ILanguageService,
		private readonly productService: IProductService,
		private readonly userDataProfileService: IUserDataProfileService,
		private readonly configurationService: IWorkbenchConfigurationService,
		private readonly isSessionsWindow: boolean,
	) {
		super(sanitizeId(parent.id + '_' + setting.key));
		this.setting = setting;
		this.parent = parent;

		// Make sure description and valueType are initialized
		this.initSettingDescription();
		this.initSettingEnumDescriptions();
		this.initSettingValueType();
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
		const displayOverride = SETTING_DISPLAY_OVERRIDES.get(this.setting.key);
		if (displayOverride) {
			this._displayLabel = displayOverride.label;
			this._displayCategory = displayOverride.category;
		} else if (this.setting.title) {
			this._displayLabel = this.setting.title;
			this._displayCategory = this.setting.categoryLabel ?? null;
		} else {
			const displayKeyFormat = settingKeyToDisplayFormat(this.setting.key, this.parent!.id, this.setting.isLanguageTagSetting);
			this._displayLabel = displayKeyFormat.label;
			this._displayCategory = displayKeyFormat.category;
		}

		if (!this._displayCategory) {
			this._displayCategory = 'Other';
		}

		if (!isBilingualSettingTitle(this._displayLabel)) {
			this._displayLabel = toBilingualSettingTitle(this._displayCategory, this._displayLabel);
		}
		this._displayCategory = '';
	}

	private initSettingDescription() {
		const descriptionOverride = SETTING_DESCRIPTION_OVERRIDES.get(this.setting.key);
		if (descriptionOverride) {
			this.description = descriptionOverride;
			return;
		}

		if (this.setting.description.length > SettingsTreeSettingElement.MAX_DESC_LINES) {
			const truncatedDescLines = this.setting.description.slice(0, SettingsTreeSettingElement.MAX_DESC_LINES);
			truncatedDescLines.push('[...]');
			this.description = truncatedDescLines.join('\n');
		} else {
			this.description = this.setting.description.join('\n');
		}
	}

	private initSettingEnumDescriptions(): void {
		const enumDescriptionOverrides = SETTING_ENUM_DESCRIPTION_OVERRIDES.get(this.setting.key);
		if (!enumDescriptionOverrides || !this.setting.enum) {
			return;
		}

		this.setting.enumDescriptions = this.setting.enum.map((value, index) => {
			return enumDescriptionOverrides.get(String(value)) ?? this.setting.enumDescriptions?.[index] ?? '';
		});
		this.setting.enumDescriptionsAreMarkdown = true;
	}

	private initSettingValueType() {
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
		} else {
			const schemaType = getObjectSettingSchemaType(this.setting);
			if (schemaType) {
				if (this.setting.allKeysAreBoolean) {
					this.valueType = SettingValueType.BooleanObject;
				} else if (schemaType === 'simple') {
					this.valueType = SettingValueType.Object;
				} else {
					this.valueType = SettingValueType.ComplexObject;
				}
			} else if (this.setting.isLanguageTagSetting) {
				this.valueType = SettingValueType.LanguageTag;
			} else {
				this.valueType = SettingValueType.Complex;
			}
		}
	}

	inspectSelf() {
		const targetToInspect = this.getTargetToInspect(this.setting);
		const inspectResult = inspectSetting(this.setting.key, targetToInspect, this.languageFilter, this.configurationService);
		this.update(inspectResult, this.isWorkspaceTrusted);
	}

	private getTargetToInspect(setting: ISetting): SettingsTarget {
		if (!this.userDataProfileService.currentProfile.isDefault && !this.userDataProfileService.currentProfile.useDefaultFlags?.settings) {
			if (setting.scope === ConfigurationScope.APPLICATION) {
				return ConfigurationTarget.APPLICATION;
			}
			if (this.configurationService.isSettingAppliedForAllProfiles(setting.key) && this.settingsTarget === ConfigurationTarget.USER_LOCAL) {
				return ConfigurationTarget.APPLICATION;
			}
		}
		return this.settingsTarget;
	}

	private update(inspectResult: IInspectResult, isWorkspaceTrusted: boolean): void {
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

		if (inspected.policyValue !== undefined) {
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
			const source = registryValues.get(`[${languageSelector}]`)?.source;
			const overrideValueSource = source instanceof Map ? source.get(this.setting.key) : undefined;
			if (overrideValueSource) {
				this.defaultValueSource = overrideValueSource;
			}
		} else {
			this.scopeValue = isConfigured && inspected[targetSelector];
			this.defaultValue = inspected.defaultValue;
		}

		let hasAgentsWindowOverride = false;
		if (this.isSessionsWindow) {
			const property = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurationProperties()[this.setting.key];
			hasAgentsWindowOverride = !!property?.agentsWindow;
			this.isAgentsWindowReadOnly = !!property?.agentsWindow?.readOnly;
			if (this.isAgentsWindowReadOnly) {
				isConfigured = false;
			}
		}

		this.value = displayValue;
		this.isConfigured = isConfigured;
		if (isConfigured || this.setting.tags || this.tags || this.setting.restricted || this.hasPolicyValue || hasAgentsWindowOverride) {
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

			if (hasAgentsWindowOverride) {
				this.tags.add(AGENTS_WINDOW_SETTING_TAG);
			}
		}
	}

	matchesAllTags(tagFilters?: Set<string>): boolean {
		if (!tagFilters?.size) {
			// This setting, which may have tags,
			// matches against a query with no tags.
			return true;
		}

		if (!this.tags) {
			// The setting must inspect itself to get tag information
			// including for the hasPolicy tag.
			this.inspectSelf();
		}

		// Handle the special 'stable' tag filter
		if (tagFilters.has('stable')) {
			// For stable filter, exclude preview and experimental settings
			if (this.tags?.has('preview') || this.tags?.has('experimental')) {
				return false;
			}
			// Check other filters (excluding 'stable' itself)
			const otherFilters = new Set(Array.from(tagFilters).filter(tag => tag !== 'stable'));
			if (otherFilters.size === 0) {
				return true;
			}
			return !!this.tags?.size &&
				Array.from(otherFilters).every(tag => this.tags!.has(tag));
		}

		// Check that the filter tags are a subset of this setting's tags
		return !!this.tags?.size &&
			Array.from(tagFilters).every(tag => this.tags!.has(tag));
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
			return REMOTE_MACHINE_SCOPES.includes(this.setting.scope) || USER_LOCAL_AND_REMOTE_SETTINGS.includes(this.setting.key);
		}

		if (configTarget === ConfigurationTarget.USER_LOCAL) {
			if (isRemote) {
				return LOCAL_MACHINE_SCOPES.includes(this.setting.scope) || USER_LOCAL_AND_REMOTE_SETTINGS.includes(this.setting.key);
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

		// Restrict to core settings
		if (this.setting.extensionInfo) {
			return false;
		}

		// Chat settings are now in their own top-level category
		if (featureFilters.has('chat')) {
			const chatFeatures = tocData.children!.find(child => child.id === 'chat');
			if (chatFeatures?.children) {
				const patterns = chatFeatures.children
					.flatMap(feature => feature.settings ?? [])
					.map(setting => createSettingMatchRegExp(setting));
				if (patterns.some(pattern => pattern.test(this.setting.key))) {
					return true;
				}
			}
		}

		const features = tocData.children!.find(child => child.id === 'features');
		return Array.from(featureFilters).some(filter => {
			if (features?.children) {
				const feature = features.children.find(feature => 'features/' + filter === feature.id);
				if (feature?.settings) {
					const patterns = feature.settings.map(setting => createSettingMatchRegExp(setting));
					return patterns.some(pattern => pattern.test(this.setting.key));
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

		// Check for exact match first
		if (idFilters.has(this.setting.key)) {
			return true;
		}

		// Check for wildcard patterns (ending with .*)
		for (const filter of idFilters) {
			if (filter.endsWith('*')) {
				const prefix = filter.slice(0, -1); // Remove '*' suffix
				if (this.setting.key.startsWith(prefix)) {
					return true;
				}
			}
		}

		return false;
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

export class SettingsTreeModel implements IDisposable {
	protected _root!: SettingsTreeGroupElement;
	private _tocRoot!: ITOCEntry<ISetting>;
	private readonly _treeElementsBySettingName = new Map<string, SettingsTreeSettingElement[]>();

	constructor(
		protected readonly _viewState: ISettingsEditorViewState,
		private _isWorkspaceTrusted: boolean,
		@IWorkbenchConfigurationService private readonly _configurationService: IWorkbenchConfigurationService,
		@ILanguageService private readonly _languageService: ILanguageService,
		@IUserDataProfileService private readonly _userDataProfileService: IUserDataProfileService,
		@IProductService private readonly _productService: IProductService,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
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
			newRoot.dispose();
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
			this.disposeChildAndRecurse(child);
		}
	}

	private disposeChildAndRecurse(element: SettingsTreeElement) {
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

		this.reinspectSettings(this._treeElementsBySettingName.get(name)!);
	}

	private updateRequireTrustedTargetElements(): void {
		this.reinspectSettings([...this._treeElementsBySettingName.values()].flat().filter(s => s.isUntrusted));
	}

	private reinspectSettings(settings: SettingsTreeSettingElement[]): void {
		for (const element of settings) {
			element.inspectSelf();
		}
	}

	private createSettingsTreeGroupElement(tocEntry: ITOCEntry<ISetting>, parent?: SettingsTreeGroupElement): SettingsTreeGroupElement {
		const depth = parent ? this.getDepth(parent) + 1 : 0;
		const element = new SettingsTreeGroupElement(tocEntry.id, undefined, tocEntry.label, depth, false);
		element.parent = parent;

		const children: SettingsTreeGroupChild[] = [];
		if (tocEntry.settings) {
			const settingChildren = tocEntry.settings.map(s => this.createSettingsTreeSettingElement(s, element));
			for (const child of settingChildren) {
				if (!child.setting.deprecationMessage) {
					children.push(child);
				} else {
					child.inspectSelf();
					if (child.isConfigured) {
						children.push(child);
					} else {
						child.dispose();
					}
				}
			}
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
		const element = new SettingsTreeSettingElement(
			setting,
			parent,
			this._viewState.settingsTarget,
			this._isWorkspaceTrusted,
			this._viewState.languageFilter,
			this._languageService,
			this._productService,
			this._userDataProfileService,
			this._configurationService,
			this._environmentService.isSessionsWindow);

		const nameElements = this._treeElementsBySettingName.get(setting.key) ?? [];
		nameElements.push(element);
		this._treeElementsBySettingName.set(setting.key, nameElements);
		return element;
	}

	dispose() {
		this._treeElementsBySettingName.clear();
		this.disposeChildAndRecurse(this._root);
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

export function sanitizeId(id: string): string {
	return id.replace(/[\.\/]/g, '_');
}

const SETTING_DISPLAY_OVERRIDES = new Map<string, { category: string; label: string }>([
	['chat.agent.maxRequests', { category: '', label: localize('settingDisplay.chat.agent.maxRequests', "Chat Agent: Max Requests\n\u804A\u5929\u667A\u80FD\u4F53\uFF1A\u6700\u5927\u8BF7\u6C42\u6570") }],
	['editor.defaultFormatter', { category: '', label: localize('settingDisplay.editor.defaultFormatter', "Editor: Default Formatter\n\u7F16\u8F91\u5668\uFF1A\u9ED8\u8BA4\u683C\u5F0F\u5316\u7A0B\u5E8F") }],
	['editor.fontFamily', { category: '', label: localize('settingDisplay.editor.fontFamily', "Editor: Font Family\n\u7F16\u8F91\u5668\uFF1A\u5B57\u4F53\u7CFB\u5217") }],
	['editor.fontSize', { category: '', label: localize('settingDisplay.editor.fontSize', "Editor: Font Size\n\u7F16\u8F91\u5668\uFF1A\u5B57\u4F53\u5927\u5C0F") }],
	['editor.formatOnPaste', { category: '', label: localize('settingDisplay.editor.formatOnPaste', "Editor: Format On Paste\n\u7F16\u8F91\u5668\uFF1A\u7C98\u8D34\u65F6\u683C\u5F0F\u5316") }],
	['editor.formatOnSave', { category: '', label: localize('settingDisplay.editor.formatOnSave', "Editor: Format On Save\n\u7F16\u8F91\u5668\uFF1A\u4FDD\u5B58\u65F6\u683C\u5F0F\u5316") }],
	['editor.mouseWheelZoom', { category: '', label: localize('settingDisplay.editor.mouseWheelZoom', "Editor: Mouse Wheel Zoom\n\u7F16\u8F91\u5668\uFF1A\u9F20\u6807\u6EDA\u8F6E\u7F29\u653E") }],
	['editor.tabSize', { category: '', label: localize('settingDisplay.editor.tabSize', "Editor: Tab Size\n\u7F16\u8F91\u5668\uFF1A\u5236\u8868\u7B26\u5927\u5C0F") }],
	['editor.wordWrap', { category: '', label: localize('settingDisplay.editor.wordWrap', "Editor: Word Wrap\n\u7F16\u8F91\u5668\uFF1A\u81EA\u52A8\u6362\u884C") }],
	['files.autoSave', { category: '', label: localize('settingDisplay.files.autoSave', "Files: Auto Save\n\u6587\u4EF6\uFF1A\u81EA\u52A8\u4FDD\u5B58") }],
	['files.exclude', { category: '', label: localize('settingDisplay.files.exclude', "Files: Exclude\n\u6587\u4EF6\uFF1A\u6392\u9664") }],
	['workbench.colorTheme', { category: '', label: localize('settingDisplay.workbench.colorTheme', "Workbench: Color Theme\n\u5DE5\u4F5C\u53F0\uFF1A\u989C\u8272\u4E3B\u9898") }],
	['editor.cursorBlinking', { category: '', label: localize('settingDisplay.editor.cursorBlinking', "Cursor Blinking\n\u5149\u6807\u95EA\u70C1") }],
	['editor.cursorHeight', { category: '', label: localize('settingDisplay.editor.cursorHeight', "Cursor Height\n\u5149\u6807\u9AD8\u5EA6") }],
	['editor.cursorSmoothCaretAnimation', { category: '', label: localize('settingDisplay.editor.cursorSmoothCaretAnimation', "Cursor Smooth Caret Animation\n\u5E73\u6ED1\u5149\u6807\u52A8\u753B") }],
	['editor.cursorStyle', { category: '', label: localize('settingDisplay.editor.cursorStyle', "Cursor Style\n\u5149\u6807\u6837\u5F0F") }],
	['editor.cursorSurroundingLines', { category: '', label: localize('settingDisplay.editor.cursorSurroundingLines', "Cursor Surrounding Lines\n\u5149\u6807\u5468\u56F4\u884C\u6570") }],
	['editor.cursorSurroundingLinesStyle', { category: '', label: localize('settingDisplay.editor.cursorSurroundingLinesStyle', "Cursor Surrounding Lines Style\n\u5149\u6807\u5468\u56F4\u884C\u6837\u5F0F") }],
	['editor.cursorWidth', { category: '', label: localize('settingDisplay.editor.cursorWidth', "Cursor Width\n\u5149\u6807\u5BBD\u5EA6") }],
	['editor.find.addExtraSpaceOnTop', { category: '', label: localize('settingDisplay.editor.find.addExtraSpaceOnTop', "Add Extra Space On Top\n\u9876\u90E8\u6DFB\u52A0\u989D\u5916\u7A7A\u95F4") }],
	['editor.find.autoFindInSelection', { category: '', label: localize('settingDisplay.editor.find.autoFindInSelection', "Auto Find In Selection\n\u81EA\u52A8\u5728\u9009\u533A\u4E2D\u67E5\u627E") }],
	['editor.find.closeOnResult', { category: '', label: localize('settingDisplay.editor.find.closeOnResult', "Close On Result\n\u627E\u5230\u7ED3\u679C\u540E\u5173\u95ED") }],
	['editor.find.cursorMoveOnType', { category: '', label: localize('settingDisplay.editor.find.cursorMoveOnType', "Cursor Move On Type\n\u8F93\u5165\u65F6\u79FB\u52A8\u5149\u6807") }],
	['editor.find.findOnType', { category: '', label: localize('settingDisplay.editor.find.findOnType', "Find On Type\n\u8F93\u5165\u65F6\u67E5\u627E") }],
	['editor.find.history', { category: '', label: localize('settingDisplay.editor.find.history', "History\n\u5386\u53F2\u8BB0\u5F55") }],
	['editor.find.loop', { category: '', label: localize('settingDisplay.editor.find.loop', "Loop\n\u5FAA\u73AF\u67E5\u627E") }],
	['editor.find.replaceHistory', { category: '', label: localize('settingDisplay.editor.find.replaceHistory', "Replace History\n\u66FF\u6362\u5386\u53F2\u8BB0\u5F55") }],
	['editor.find.seedSearchStringFromSelection', { category: '', label: localize('settingDisplay.editor.find.seedSearchStringFromSelection', "Seed Search String From Selection\n\u4ECE\u9009\u533A\u586B\u5145\u641C\u7D22\u5B57\u7B26\u4E32") }],
	['editor.fontLigatures', { category: '', label: localize('settingDisplay.editor.fontLigatures', "Font Ligatures\n\u5B57\u4F53\u8FDE\u5B57") }],
	['editor.fontVariations', { category: '', label: localize('settingDisplay.editor.fontVariations', "Font Variations\n\u5B57\u4F53\u53D8\u4F53") }],
	['editor.fontWeight', { category: '', label: localize('settingDisplay.editor.fontWeight', "Font Weight\n\u5B57\u4F53\u7C97\u7EC6") }],
	['editor.formatOnSaveMode', { category: '', label: localize('settingDisplay.editor.formatOnSaveMode', "Format On Save Mode\n\u4FDD\u5B58\u65F6\u683C\u5F0F\u5316\u6A21\u5F0F") }],
	['editor.formatOnType', { category: '', label: localize('settingDisplay.editor.formatOnType', "Format On Type\n\u8F93\u5165\u65F6\u683C\u5F0F\u5316") }],
	['diffEditor.codeLens', { category: '', label: localize('settingDisplay.diffEditor.codeLens', "Code Lens\n\u4EE3\u7801\u900F\u955C") }],
	['diffEditor.diffAlgorithm', { category: '', label: localize('settingDisplay.diffEditor.diffAlgorithm', "Diff Algorithm\n\u5DEE\u5F02\u7B97\u6CD5") }],
	['diffEditor.experimental.showEmptyDecorations', { category: '', label: localize('settingDisplay.diffEditor.experimental.showEmptyDecorations', "Experimental: Show Empty Decorations\n\u5B9E\u9A8C\u6027\uFF1A\u663E\u793A\u7A7A\u88C5\u9970") }],
	['diffEditor.experimental.showMoves', { category: '', label: localize('settingDisplay.diffEditor.experimental.showMoves', "Experimental: Show Moves\n\u5B9E\u9A8C\u6027\uFF1A\u663E\u793A\u79FB\u52A8") }],
	['diffEditor.experimental.useTrueInlineView', { category: '', label: localize('settingDisplay.diffEditor.experimental.useTrueInlineView', "Experimental: Use True Inline View\n\u5B9E\u9A8C\u6027\uFF1A\u4F7F\u7528\u771F\u6B63\u7684\u5185\u8054\u89C6\u56FE") }],
	['diffEditor.hideUnchangedRegions.contextLineCount', { category: '', label: localize('settingDisplay.diffEditor.hideUnchangedRegions.contextLineCount', "Hide Unchanged Regions: Context Line Count\n\u9690\u85CF\u672A\u66F4\u6539\u533A\u57DF\uFF1A\u4E0A\u4E0B\u6587\u884C\u6570") }],
	['diffEditor.hideUnchangedRegions.enabled', { category: '', label: localize('settingDisplay.diffEditor.hideUnchangedRegions.enabled', "Hide Unchanged Regions: Enabled\n\u9690\u85CF\u672A\u66F4\u6539\u533A\u57DF\uFF1A\u542F\u7528") }],
	['diffEditor.hideUnchangedRegions.minimumLineCount', { category: '', label: localize('settingDisplay.diffEditor.hideUnchangedRegions.minimumLineCount', "Hide Unchanged Regions: Minimum Line Count\n\u9690\u85CF\u672A\u66F4\u6539\u533A\u57DF\uFF1A\u6700\u5C0F\u884C\u6570") }],
	['diffEditor.hideUnchangedRegions.revealLineCount', { category: '', label: localize('settingDisplay.diffEditor.hideUnchangedRegions.revealLineCount', "Hide Unchanged Regions: Reveal Line Count\n\u9690\u85CF\u672A\u66F4\u6539\u533A\u57DF\uFF1A\u663E\u793A\u884C\u6570") }],
	['diffEditor.ignoreTrimWhitespace', { category: '', label: localize('settingDisplay.diffEditor.ignoreTrimWhitespace', "Ignore Trim Whitespace\n\u5FFD\u7565\u4FEE\u526A\u7A7A\u767D") }],
	['diffEditor.maxComputationTime', { category: '', label: localize('settingDisplay.diffEditor.maxComputationTime', "Max Computation Time\n\u6700\u5927\u8BA1\u7B97\u65F6\u95F4") }],
	['diffEditor.maxFileSize', { category: '', label: localize('settingDisplay.diffEditor.maxFileSize', "Max File Size\n\u6700\u5927\u6587\u4EF6\u5927\u5C0F") }],
	['diffEditor.renderGutterMenu', { category: '', label: localize('settingDisplay.diffEditor.renderGutterMenu', "Render Gutter Menu\n\u6E32\u67D3\u88C5\u8BA2\u7EBF\u83DC\u5355") }],
	['diffEditor.renderIndicators', { category: '', label: localize('settingDisplay.diffEditor.renderIndicators', "Render Indicators\n\u6E32\u67D3\u6307\u793A\u5668") }],
	['diffEditor.renderMarginRevertIcon', { category: '', label: localize('settingDisplay.diffEditor.renderMarginRevertIcon', "Render Margin Revert Icon\n\u6E32\u67D3\u8FB9\u8DDD\u8FD8\u539F\u56FE\u6807") }],
	['diffEditor.renderSideBySide', { category: '', label: localize('settingDisplay.diffEditor.renderSideBySide', "Render Side By Side\n\u5E76\u6392\u6E32\u67D3") }],
	['diffEditor.renderSideBySideInlineBreakpoint', { category: '', label: localize('settingDisplay.diffEditor.renderSideBySideInlineBreakpoint', "Render Side By Side Inline Breakpoint\n\u5E76\u6392\u6E32\u67D3\u5185\u8054\u65AD\u70B9") }],
	['diffEditor.useInlineViewWhenSpaceIsLimited', { category: '', label: localize('settingDisplay.diffEditor.useInlineViewWhenSpaceIsLimited', "Use Inline View When Space Is Limited\n\u7A7A\u95F4\u6709\u9650\u65F6\u4F7F\u7528\u5185\u8054\u89C6\u56FE") }],
	['diffEditor.wordWrap', { category: '', label: localize('settingDisplay.diffEditor.wordWrap', "Word Wrap\n\u81EA\u52A8\u6362\u884C") }],
	['editor.minimap.autohide', { category: '', label: localize('settingDisplay.editor.minimap.autohide', "Autohide\n\u81EA\u52A8\u9690\u85CF") }],
	['editor.minimap.enabled', { category: '', label: localize('settingDisplay.editor.minimap.enabled', "Enabled\n\u542F\u7528") }],
	['editor.minimap.markSectionHeaderRegex', { category: '', label: localize('settingDisplay.editor.minimap.markSectionHeaderRegex', "Mark Section Header Regex\n\u6807\u8BB0\u8282\u6807\u9898\u6B63\u5219\u8868\u8FBE\u5F0F") }],
	['editor.minimap.maxColumn', { category: '', label: localize('settingDisplay.editor.minimap.maxColumn', "Max Column\n\u6700\u5927\u5217") }],
	['editor.minimap.renderCharacters', { category: '', label: localize('settingDisplay.editor.minimap.renderCharacters', "Render Characters\n\u6E32\u67D3\u5B57\u7B26") }],
	['editor.minimap.scale', { category: '', label: localize('settingDisplay.editor.minimap.scale', "Scale\n\u7F29\u653E\u6BD4\u4F8B") }],
	['editor.minimap.sectionHeaderFontSize', { category: '', label: localize('settingDisplay.editor.minimap.sectionHeaderFontSize', "Section Header Font Size\n\u8282\u6807\u9898\u5B57\u4F53\u5927\u5C0F") }],
	['editor.minimap.sectionHeaderLetterSpacing', { category: '', label: localize('settingDisplay.editor.minimap.sectionHeaderLetterSpacing', "Section Header Letter Spacing\n\u8282\u6807\u9898\u5B57\u6BCD\u95F4\u8DDD") }],
	['editor.minimap.showMarkSectionHeaders', { category: '', label: localize('settingDisplay.editor.minimap.showMarkSectionHeaders', "Show Mark Section Headers\n\u663E\u793A\u6807\u8BB0\u8282\u6807\u9898") }],
	['editor.minimap.showRegionSectionHeaders', { category: '', label: localize('settingDisplay.editor.minimap.showRegionSectionHeaders', "Show Region Section Headers\n\u663E\u793A\u533A\u57DF\u8282\u6807\u9898") }],
	['editor.minimap.showSlider', { category: '', label: localize('settingDisplay.editor.minimap.showSlider', "Show Slider\n\u663E\u793A\u6ED1\u5757") }],
	['editor.minimap.side', { category: '', label: localize('settingDisplay.editor.minimap.side', "Side\n\u4F4D\u7F6E") }],
	['editor.minimap.size', { category: '', label: localize('settingDisplay.editor.minimap.size', "Size\n\u5927\u5C0F") }],
	['editor.acceptSuggestionOnCommitCharacter', { category: '', label: localize('settingDisplay.editor.acceptSuggestionOnCommitCharacter', "Accept Suggestion On Commit Character\n\u8F93\u5165\u63D0\u4EA4\u5B57\u7B26\u65F6\u63A5\u53D7\u5EFA\u8BAE") }],
	['editor.acceptSuggestionOnEnter', { category: '', label: localize('settingDisplay.editor.acceptSuggestionOnEnter', "Accept Suggestion On Enter\n\u6309 Enter \u65F6\u63A5\u53D7\u5EFA\u8BAE") }],
	['editor.inlineSuggest.edits.allowCodeShifting', { category: '', label: localize('settingDisplay.editor.inlineSuggest.edits.allowCodeShifting', "Edits: Allow Code Shifting\n\u7F16\u8F91\uFF1A\u5141\u8BB8\u4EE3\u7801\u4F4D\u79FB") }],
	['editor.inlineSuggest.edits.renderSideBySide', { category: '', label: localize('settingDisplay.editor.inlineSuggest.edits.renderSideBySide', "Edits: Render Side By Side\n\u7F16\u8F91\uFF1A\u5E76\u6392\u6E32\u67D3") }],
	['editor.inlineSuggest.edits.showCollapsed', { category: '', label: localize('settingDisplay.editor.inlineSuggest.edits.showCollapsed', "Edits: Show Collapsed\n\u7F16\u8F91\uFF1A\u663E\u793A\u6298\u53E0\u72B6\u6001") }],
	['editor.inlineSuggest.edits.showLongDistanceHint', { category: '', label: localize('settingDisplay.editor.inlineSuggest.edits.showLongDistanceHint', "Edits: Show Long Distance Hint\n\u7F16\u8F91\uFF1A\u663E\u793A\u8FDC\u8DDD\u79BB\u63D0\u793A") }],
	['editor.inlineSuggest.experimental.emptyResponseInformation', { category: '', label: localize('settingDisplay.editor.inlineSuggest.experimental.emptyResponseInformation', "Experimental: Empty Response Information\n\u5B9E\u9A8C\u6027\uFF1A\u7A7A\u54CD\u5E94\u4FE1\u606F") }],
	['editor.inlineSuggest.experimental.showOnSuggestConflict', { category: '', label: localize('settingDisplay.editor.inlineSuggest.experimental.showOnSuggestConflict', "Experimental: Show On Suggest Conflict\n\u5B9E\u9A8C\u6027\uFF1A\u5EFA\u8BAE\u51B2\u7A81\u65F6\u663E\u793A") }],
	['editor.inlineSuggest.experimental.suppressInlineSuggestions', { category: '', label: localize('settingDisplay.editor.inlineSuggest.experimental.suppressInlineSuggestions', "Experimental: Suppress Inline Suggestions\n\u5B9E\u9A8C\u6027\uFF1A\u6291\u5236\u5185\u8054\u5EFA\u8BAE") }],
	['editor.suggest.filterGraceful', { category: '', label: localize('settingDisplay.editor.suggest.filterGraceful', "Filter Graceful\n\u5BB9\u9519\u7B5B\u9009") }],
	['editor.suggest.filteredTypes', { category: '', label: localize('settingDisplay.editor.suggest.filteredTypes', "Filtered Types\n\u5DF2\u7B5B\u9009\u7C7B\u578B") }],
	['editor.inlineSuggest.fontFamily', { category: '', label: localize('settingDisplay.editor.inlineSuggest.fontFamily', "Font Family\n\u5B57\u4F53\u7CFB\u5217") }],
	['editor.suggest.insertMode', { category: '', label: localize('settingDisplay.editor.suggest.insertMode', "Insert Mode\n\u63D2\u5165\u6A21\u5F0F") }],
	['editor.suggest.localityBonus', { category: '', label: localize('settingDisplay.editor.suggest.localityBonus', "Locality Bonus\n\u5C40\u90E8\u6027\u52A0\u5206") }],
	['editor.suggest.matchOnWordStartOnly', { category: '', label: localize('settingDisplay.editor.suggest.matchOnWordStartOnly', "Match On Word Start Only\n\u4EC5\u5339\u914D\u8BCD\u9996") }],
	['editor.suggest.maxVisibleSuggestions', { category: '', label: localize('settingDisplay.editor.suggest.maxVisibleSuggestions', "Max Visible Suggestions\n\u6700\u5927\u53EF\u89C1\u5EFA\u8BAE\u6570") }],
	['editor.inlineSuggest.minShowDelay', { category: '', label: localize('settingDisplay.editor.inlineSuggest.minShowDelay', "Min Show Delay\n\u6700\u5C0F\u663E\u793A\u5EF6\u8FDF") }],
	['editor.suggest.preview', { category: '', label: localize('settingDisplay.editor.suggest.preview', "Preview\n\u9884\u89C8") }],
	['editor.quickSuggestions', { category: '', label: localize('settingDisplay.editor.quickSuggestions', "Quick Suggestions\n\u5FEB\u901F\u5EFA\u8BAE") }],
	['editor.quickSuggestionsDelay', { category: '', label: localize('settingDisplay.editor.quickSuggestionsDelay', "Quick Suggestions Delay\n\u5FEB\u901F\u5EFA\u8BAE\u5EF6\u8FDF") }],
	['editor.screenReaderAnnounceInlineSuggestion', { category: '', label: localize('settingDisplay.editor.screenReaderAnnounceInlineSuggestion', "Screen Reader Announce Inline Suggestion\n\u5C4F\u5E55\u9605\u8BFB\u5668\u6717\u8BFB\u5185\u8054\u5EFA\u8BAE") }],
	['editor.suggest.selectionMode', { category: '', label: localize('settingDisplay.editor.suggest.selectionMode', "Selection Mode\n\u9009\u62E9\u6A21\u5F0F") }],
	['editor.suggest.shareSuggestSelections', { category: '', label: localize('settingDisplay.editor.suggest.shareSuggestSelections', "Share Suggest Selections\n\u5171\u4EAB\u5EFA\u8BAE\u9009\u62E9") }],
	['editor.suggest.showClasses', { category: '', label: localize('settingDisplay.editor.suggest.showClasses', "Show Classes\n\u663E\u793A\u7C7B") }],
	['editor.suggest.showColors', { category: '', label: localize('settingDisplay.editor.suggest.showColors', "Show Colors\n\u663E\u793A\u989C\u8272") }],
	['editor.suggest.showConstants', { category: '', label: localize('settingDisplay.editor.suggest.showConstants', "Show Constants\n\u663E\u793A\u5E38\u91CF") }],
	['editor.suggest.showConstructors', { category: '', label: localize('settingDisplay.editor.suggest.showConstructors', "Show Constructors\n\u663E\u793A\u6784\u9020\u51FD\u6570") }],
	['editor.suggest.showCustomcolors', { category: '', label: localize('settingDisplay.editor.suggest.showCustomcolors', "Show Customcolors\n\u663E\u793A\u81EA\u5B9A\u4E49\u989C\u8272") }],
	['editor.suggest.showDeprecated', { category: '', label: localize('settingDisplay.editor.suggest.showDeprecated', "Show Deprecated\n\u663E\u793A\u5DF2\u5F03\u7528\u9879") }],
	['editor.suggest.showEnumMembers', { category: '', label: localize('settingDisplay.editor.suggest.showEnumMembers', "Show Enum Members\n\u663E\u793A\u679A\u4E3E\u6210\u5458") }],
	['editor.suggest.showEnums', { category: '', label: localize('settingDisplay.editor.suggest.showEnums', "Show Enums\n\u663E\u793A\u679A\u4E3E") }],
	['editor.suggest.showEvents', { category: '', label: localize('settingDisplay.editor.suggest.showEvents', "Show Events\n\u663E\u793A\u4E8B\u4EF6") }],
	['editor.suggest.showFields', { category: '', label: localize('settingDisplay.editor.suggest.showFields', "Show Fields\n\u663E\u793A\u5B57\u6BB5") }],
	['editor.suggest.showFiles', { category: '', label: localize('settingDisplay.editor.suggest.showFiles', "Show Files\n\u663E\u793A\u6587\u4EF6") }],
	['editor.suggest.showFolders', { category: '', label: localize('settingDisplay.editor.suggest.showFolders', "Show Folders\n\u663E\u793A\u6587\u4EF6\u5939") }],
	['editor.suggest.showFunctions', { category: '', label: localize('settingDisplay.editor.suggest.showFunctions', "Show Functions\n\u663E\u793A\u51FD\u6570") }],
	['editor.suggest.showIcons', { category: '', label: localize('settingDisplay.editor.suggest.showIcons', "Show Icons\n\u663E\u793A\u56FE\u6807") }],
	['editor.suggest.showInlineDetails', { category: '', label: localize('settingDisplay.editor.suggest.showInlineDetails', "Show Inline Details\n\u663E\u793A\u5185\u8054\u8BE6\u7EC6\u4FE1\u606F") }],
	['editor.suggest.showInterfaces', { category: '', label: localize('settingDisplay.editor.suggest.showInterfaces', "Show Interfaces\n\u663E\u793A\u63A5\u53E3") }],
	['editor.suggest.showIssues', { category: '', label: localize('settingDisplay.editor.suggest.showIssues', "Show Issues\n\u663E\u793A\u95EE\u9898") }],
	['editor.suggest.showKeywords', { category: '', label: localize('settingDisplay.editor.suggest.showKeywords', "Show Keywords\n\u663E\u793A\u5173\u952E\u5B57") }],
	['editor.suggest.showMethods', { category: '', label: localize('settingDisplay.editor.suggest.showMethods', "Show Methods\n\u663E\u793A\u65B9\u6CD5") }],
	['editor.suggest.showModules', { category: '', label: localize('settingDisplay.editor.suggest.showModules', "Show Modules\n\u663E\u793A\u6A21\u5757") }],
	['editor.suggest.showOperators', { category: '', label: localize('settingDisplay.editor.suggest.showOperators', "Show Operators\n\u663E\u793A\u8FD0\u7B97\u7B26") }],
	['editor.suggest.showProperties', { category: '', label: localize('settingDisplay.editor.suggest.showProperties', "Show Properties\n\u663E\u793A\u5C5E\u6027") }],
	['editor.suggest.showReferences', { category: '', label: localize('settingDisplay.editor.suggest.showReferences', "Show References\n\u663E\u793A\u5F15\u7528") }],
	['editor.suggest.showSnippets', { category: '', label: localize('settingDisplay.editor.suggest.showSnippets', "Show Snippets\n\u663E\u793A\u4EE3\u7801\u7247\u6BB5") }],
	['editor.suggest.showStatusBar', { category: '', label: localize('settingDisplay.editor.suggest.showStatusBar', "Show Status Bar\n\u663E\u793A\u72B6\u6001\u680F") }],
	['editor.suggest.showStructs', { category: '', label: localize('settingDisplay.editor.suggest.showStructs', "Show Structs\n\u663E\u793A\u7ED3\u6784\u4F53") }],
	['editor.inlineSuggest.showToolbar', { category: '', label: localize('settingDisplay.editor.inlineSuggest.showToolbar', "Show Toolbar\n\u663E\u793A\u5DE5\u5177\u680F") }],
	['editor.suggest.showTypeParameters', { category: '', label: localize('settingDisplay.editor.suggest.showTypeParameters', "Show Type Parameters\n\u663E\u793A\u7C7B\u578B\u53C2\u6570") }],
	['editor.suggest.showUnits', { category: '', label: localize('settingDisplay.editor.suggest.showUnits', "Show Units\n\u663E\u793A\u5355\u4F4D") }],
	['editor.suggest.showUsers', { category: '', label: localize('settingDisplay.editor.suggest.showUsers', "Show Users\n\u663E\u793A\u7528\u6237") }],
	['editor.suggest.showValues', { category: '', label: localize('settingDisplay.editor.suggest.showValues', "Show Values\n\u663E\u793A\u503C") }],
	['editor.suggest.showVariables', { category: '', label: localize('settingDisplay.editor.suggest.showVariables', "Show Variables\n\u663E\u793A\u53D8\u91CF") }],
	['editor.suggest.showWords', { category: '', label: localize('settingDisplay.editor.suggest.showWords', "Show Words\n\u663E\u793A\u5355\u8BCD") }],
	['editor.snippetSuggestions', { category: '', label: localize('settingDisplay.editor.snippetSuggestions', "Snippet Suggestions\n\u4EE3\u7801\u7247\u6BB5\u5EFA\u8BAE") }],
	['editor.suggest.snippetsPreventQuickSuggestions', { category: '', label: localize('settingDisplay.editor.suggest.snippetsPreventQuickSuggestions', "Snippets Prevent Quick Suggestions\n\u4EE3\u7801\u7247\u6BB5\u963B\u6B62\u5FEB\u901F\u5EFA\u8BAE") }],
	['editor.suggestFontSize', { category: '', label: localize('settingDisplay.editor.suggestFontSize', "Suggest Font Size\n\u5EFA\u8BAE\u5B57\u4F53\u5927\u5C0F") }],
	['editor.suggestLineHeight', { category: '', label: localize('settingDisplay.editor.suggestLineHeight', "Suggest Line Height\n\u5EFA\u8BAE\u884C\u9AD8") }],
	['editor.suggestOnTriggerCharacters', { category: '', label: localize('settingDisplay.editor.suggestOnTriggerCharacters', "Suggest On Trigger Characters\n\u89E6\u53D1\u5B57\u7B26\u65F6\u663E\u793A\u5EFA\u8BAE") }],
	['editor.suggestSelection', { category: '', label: localize('settingDisplay.editor.suggestSelection', "Suggest Selection\n\u5EFA\u8BAE\u9009\u62E9") }],
	['editor.inlineSuggest.suppressInSnippetMode', { category: '', label: localize('settingDisplay.editor.inlineSuggest.suppressInSnippetMode', "Suppress In Snippet Mode\n\u4EE3\u7801\u7247\u6BB5\u6A21\u5F0F\u4E0B\u6291\u5236") }],
	['editor.inlineSuggest.suppressSuggestions', { category: '', label: localize('settingDisplay.editor.inlineSuggest.suppressSuggestions', "Suppress Suggestions\n\u6291\u5236\u5EFA\u8BAE") }],
	['editor.inlineSuggest.syntaxHighlightingEnabled', { category: '', label: localize('settingDisplay.editor.inlineSuggest.syntaxHighlightingEnabled', "Syntax Highlighting Enabled\n\u542F\u7528\u8BED\u6CD5\u9AD8\u4EAE") }],
	['editor.tabCompletion', { category: '', label: localize('settingDisplay.editor.tabCompletion', "Tab Completion\nTab \u8865\u5168") }],
	['editor.tabFocusMode', { category: '', label: localize('settingDisplay.editor.tabFocusMode', "Tab Focus Mode\nTab \u7126\u70B9\u6A21\u5F0F") }],
	['editor.inlineSuggest.triggerCommandOnProviderChange', { category: '', label: localize('settingDisplay.editor.inlineSuggest.triggerCommandOnProviderChange', "Trigger Command On Provider Change\n\u63D0\u4F9B\u7A0B\u5E8F\u53D8\u5316\u65F6\u89E6\u53D1\u547D\u4EE4") }],
	['editor.wordBasedSuggestions', { category: '', label: localize('settingDisplay.editor.wordBasedSuggestions', "Word Based Suggestions\n\u57FA\u4E8E\u5355\u8BCD\u7684\u5EFA\u8BAE") }],
	['files.associations', { category: '', label: localize('settingDisplay.files.associations', "Associations\n\u5173\u8054") }],
	['files.autoGuessEncoding', { category: '', label: localize('settingDisplay.files.autoGuessEncoding', "Auto Guess Encoding\n\u81EA\u52A8\u731C\u6D4B\u7F16\u7801") }],
	['files.autoSaveDelay', { category: '', label: localize('settingDisplay.files.autoSaveDelay', "Auto Save Delay\n\u81EA\u52A8\u4FDD\u5B58\u5EF6\u8FDF") }],
	['files.autoSaveWhenNoErrors', { category: '', label: localize('settingDisplay.files.autoSaveWhenNoErrors', "Auto Save When No Errors\n\u65E0\u9519\u8BEF\u65F6\u81EA\u52A8\u4FDD\u5B58") }],
	['files.autoSaveWorkspaceFilesOnly', { category: '', label: localize('settingDisplay.files.autoSaveWorkspaceFilesOnly', "Auto Save Workspace Files Only\n\u4EC5\u81EA\u52A8\u4FDD\u5B58\u5DE5\u4F5C\u533A\u6587\u4EF6") }],
	['files.candidateGuessEncodings', { category: '', label: localize('settingDisplay.files.candidateGuessEncodings', "Candidate Guess Encodings\n\u5019\u9009\u731C\u6D4B\u7F16\u7801") }],
	['files.defaultLanguage', { category: '', label: localize('settingDisplay.files.defaultLanguage', "Default Language\n\u9ED8\u8BA4\u8BED\u8A00") }],
	['files.dialog.defaultPath', { category: '', label: localize('settingDisplay.files.dialog.defaultPath', "Dialog: Default Path\n\u5BF9\u8BDD\u6846\uFF1A\u9ED8\u8BA4\u8DEF\u5F84") }],
	['files.enableTrash', { category: '', label: localize('settingDisplay.files.enableTrash', "Enable Trash\n\u542F\u7528\u56DE\u6536\u7AD9") }],
	['files.encoding', { category: '', label: localize('settingDisplay.files.encoding', "Encoding\n\u7F16\u7801") }],
	['files.eol', { category: '', label: localize('settingDisplay.files.eol', "Eol\n\u884C\u5C3E\u7B26") }],
	['files.hotExit', { category: '', label: localize('settingDisplay.files.hotExit', "Hot Exit\n\u70ED\u9000\u51FA") }],
	['files.insertFinalNewline', { category: '', label: localize('settingDisplay.files.insertFinalNewline', "Insert Final Newline\n\u63D2\u5165\u6700\u7EC8\u6362\u884C") }],
	['files.participants.timeout', { category: '', label: localize('settingDisplay.files.participants.timeout', "Participants: Timeout\n\u53C2\u4E0E\u8005\uFF1A\u8D85\u65F6") }],
	['files.readonlyExclude', { category: '', label: localize('settingDisplay.files.readonlyExclude', "Readonly Exclude\n\u53EA\u8BFB\u6392\u9664") }],
	['files.readonlyFromPermissions', { category: '', label: localize('settingDisplay.files.readonlyFromPermissions', "Readonly From Permissions\n\u6839\u636E\u6743\u9650\u8BBE\u4E3A\u53EA\u8BFB") }],
	['files.readonlyInclude', { category: '', label: localize('settingDisplay.files.readonlyInclude', "Readonly Include\n\u53EA\u8BFB\u5305\u542B") }],
	['files.restoreUndoStack', { category: '', label: localize('settingDisplay.files.restoreUndoStack', "Restore Undo Stack\n\u6062\u590D\u64A4\u9500\u6808") }],
	['files.saveConflictResolution', { category: '', label: localize('settingDisplay.files.saveConflictResolution', "Save Conflict Resolution\n\u4FDD\u5B58\u51B2\u7A81\u89E3\u51B3") }],
	['files.simpleDialog.enable', { category: '', label: localize('settingDisplay.files.simpleDialog.enable', "Simple Dialog: Enable\n\u7B80\u5355\u5BF9\u8BDD\u6846\uFF1A\u542F\u7528") }],
	['files.trimFinalNewlines', { category: '', label: localize('settingDisplay.files.trimFinalNewlines', "Trim Final Newlines\n\u4FEE\u526A\u6700\u7EC8\u6362\u884C") }],
	['files.trimTrailingWhitespace', { category: '', label: localize('settingDisplay.files.trimTrailingWhitespace', "Trim Trailing Whitespace\n\u4FEE\u526A\u5C3E\u968F\u7A7A\u767D") }],
	['files.trimTrailingWhitespaceInRegexAndStrings', { category: '', label: localize('settingDisplay.files.trimTrailingWhitespaceInRegexAndStrings', "Trim Trailing Whitespace In Regex And Strings\n\u5728\u6B63\u5219\u8868\u8FBE\u5F0F\u548C\u5B57\u7B26\u4E32\u4E2D\u4FEE\u526A\u5C3E\u968F\u7A7A\u767D") }],
	['files.watcherExclude', { category: '', label: localize('settingDisplay.files.watcherExclude', "Watcher Exclude\n\u76D1\u89C6\u5668\u6392\u9664") }],
	['files.watcherInclude', { category: '', label: localize('settingDisplay.files.watcherInclude', "Watcher Include\n\u76D1\u89C6\u5668\u5305\u542B") }]
]);

const SETTING_DESCRIPTION_OVERRIDES = new Map<string, string>([
	['editor.autoIndentOnPasteWithinString', localize('settingDescription.editor.autoIndentOnPasteWithinString', "Controls whether the editor should automatically auto-indent the pasted content when pasted within a string. This takes effect when autoIndentOnPaste is true.\n\u5728\u5B57\u7B26\u4E32\u5185\u7C98\u8D34\u5185\u5BB9\u65F6\uFF0C\u81EA\u52A8\u5E2E\u4F60\u7F29\u8FDB\u3002\u53EA\u6709\u5F00\u542F autoIndentOnPaste \u65F6\u624D\u6709\u6548\u3002")],
	['editor.autoSurround', localize('settingDescription.editor.autoSurround', "Controls whether the editor should automatically surround selections when typing quotes or brackets.\n\u63A7\u5236\u662F\u5426\u5728\u8F93\u5165\u5F15\u53F7\u6216\u62EC\u53F7\u65F6\u81EA\u52A8\u5305\u56F4\u9009\u4E2D\u7684\u6587\u5B57\u3002")],
	['editor.bracketPairColorization.enabled', localize('settingDescription.editor.bracketPairColorization.enabled', "Controls whether bracket pair colorization is enabled or not. Use `#workbench.colorCustomizations#` to override the bracket highlight colors.\n\u5F00\u542F\u540E\uFF0C\u4E0D\u540C\u5C42\u7EA7\u7684\u62EC\u53F7\u4F1A\u7528\u4E0D\u540C\u989C\u8272\u663E\u793A\u3002")],
	['editor.formatOnSave', localize('settingDescription.editor.formatOnSave', "Format a file on save. A formatter must be available and the editor must not be shutting down. When `#files.autoSave#` is set to `afterDelay`, the file will only be formatted when saved explicitly.\n\u4FDD\u5B58\u65F6\u81EA\u52A8\u6392\u7248\u4EE3\u7801\u3002\u4F46\u5FC5\u987B\u662F\u624B\u52A8\u4FDD\u5B58\uFF08\u6309 Ctrl + S\uFF09\u624D\u6709\u6548\uFF0C\u81EA\u52A8\u4FDD\u5B58\u65F6\u4E0D\u4F1A\u6392\u7248\u3002")],
	['files.autoSave', localize('settingDescription.files.autoSave', "Controls [auto save](https://code.visualstudio.com/docs/editor/codebasics#_save-auto-save) of editors that have unsaved changes.\n\u63A7\u5236\u6587\u4EF6\u8981\u4E0D\u8981\u81EA\u52A8\u4FDD\u5B58\u3002")]
]);

const SETTING_ENUM_DESCRIPTION_OVERRIDES = new Map<string, Map<string, string>>([
	['files.autoSave', new Map<string, string>([
		['off', localize('settingEnumDescription.files.autoSave.off', "An editor with changes is never automatically saved.\n\u4E0D\u81EA\u52A8\u4FDD\u5B58\uFF08\u5FC5\u987B\u81EA\u5DF1\u6309 Ctrl + S\uFF09\u3002")],
		['afterDelay', localize('settingEnumDescription.files.autoSave.afterDelay', "An editor with changes is automatically saved after the configured `#files.autoSaveDelay#`.\n\u7B49\u4E00\u4F1A\u5C31\u5B58\uFF08\u6253\u5B8C\u5B57\u8FC7 1 \u79D2\u949F\u81EA\u5DF1\u5B58\uFF09\u3002")],
		['onFocusChange', localize('settingEnumDescription.files.autoSave.onFocusChange', "An editor with changes is automatically saved when the editor loses focus.\n\u70B9\u522B\u7684\u5730\u65B9\u5C31\u5B58\uFF08\u9F20\u6807\u53EA\u8981\u70B9\u5230\u4EE3\u7801\u533A\u5916\u9762\u5C31\u5B58\uFF09\u3002")],
		['onWindowChange', localize('settingEnumDescription.files.autoSave.onWindowChange', "An editor with changes is automatically saved when the window loses focus.\n\u5207\u7A97\u53E3\u5C31\u5B58\uFF08\u6BD4\u5982\u5207\u6362\u5230\u6D4F\u89C8\u5668\u6216\u522B\u7684\u8F6F\u4EF6\u65F6\u5C31\u5B58\uFF09\u3002")]
	])]
]);

function isBilingualSettingTitle(label: string): boolean {
	return label.includes('\n');
}

export function toBilingualSettingTitle(category: string, label: string): string {
	const englishTitle = normalizeSettingTitle(category ? `${category}: ${label}` : label);
	const chineseTitle = translateSettingTitle(englishTitle);
	return `${englishTitle}\n${chineseTitle}`;
}

function normalizeSettingTitle(title: string): string {
	return title.replace(/\s+/g, ' ').replace(/\s*:\s*/g, ': ').trim();
}

function translateSettingTitle(title: string): string {
	const fullTitle = SETTING_FULL_TITLE_TRANSLATIONS.get(title.toLowerCase());
	if (fullTitle) {
		return fullTitle;
	}

	const colonIndex = title.indexOf(': ');
	if (colonIndex >= 0) {
		const category = title.substring(0, colonIndex);
		const label = title.substring(colonIndex + 2);
		return `${translateSettingTitlePart(category)}\uFF1A${translateSettingTitlePart(label)}`;
	}
	return translateSettingTitlePart(title);
}

function translateSettingTitlePart(part: string): string {
	const normalized = part.trim();
	if (!normalized) {
		return normalized;
	}

	const exactPhrase = SETTING_TITLE_PHRASE_TRANSLATIONS.get(normalized.toLowerCase());
	if (exactPhrase) {
		return exactPhrase;
	}

	const hierarchyParts = normalized.split(' \u203A ');
	if (hierarchyParts.length > 1) {
		return hierarchyParts.map(translateSettingTitlePart).join(' \u203A ');
	}

	const tokens = normalized.split(/\s+/);
	const translatedTokens: string[] = [];
	for (let index = 0; index < tokens.length;) {
		let matched = false;
		for (let length = Math.min(5, tokens.length - index); length > 1; length--) {
			const key = tokens.slice(index, index + length).map(settingTitleTokenKey).join(' ');
			const phrase = SETTING_TITLE_PHRASE_TRANSLATIONS.get(key);
			if (phrase) {
				translatedTokens.push(phrase);
				index += length;
				matched = true;
				break;
			}
		}
		if (!matched) {
			translatedTokens.push(translateSettingTitleToken(tokens[index]));
			index++;
		}
	}

	return joinTranslatedTitleTokens(translatedTokens);
}

function settingTitleTokenKey(token: string): string {
	return token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').toLowerCase();
}

function translateSettingTitleToken(token: string): string {
	if (/^\$\(.+\)$/.test(token)) {
		return token;
	}

	const match = /^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u.exec(token);
	const prefix = match?.[1] ?? '';
	const core = match?.[2] ?? token;
	const suffix = match?.[3] ?? '';
	if (!core) {
		return token;
	}

	const lower = core.toLowerCase();
	let translated = SETTING_TITLE_WORD_TRANSLATIONS.get(lower);
	if (!translated && lower.endsWith('ies')) {
		translated = SETTING_TITLE_WORD_TRANSLATIONS.get(`${lower.slice(0, -3)}y`);
	}
	if (!translated && lower.endsWith('s')) {
		translated = SETTING_TITLE_WORD_TRANSLATIONS.get(lower.slice(0, -1));
	}

	return `${prefix}${translated ?? core}${suffix}`;
}

function joinTranslatedTitleTokens(tokens: string[]): string {
	let result = '';
	for (const token of tokens) {
		if (!result) {
			result = token;
		} else if (/[A-Za-z0-9)]$/.test(result) || /^[A-Za-z0-9$(]/.test(token)) {
			result += ` ${token}`;
		} else {
			result += token;
		}
	}
	return result;
}

const SETTING_FULL_TITLE_TRANSLATIONS = new Map<string, string>([
	['bracket pair colorization: enabled', '\u5F69\u8272\u62EC\u53F7\uFF1A\u5DF2\u5F00\u542F'],
	['editor \u203A bracket pair colorization: enabled', '\u7F16\u8F91\u5668 \u203A \u5F69\u8272\u62EC\u53F7\uFF1A\u5DF2\u5F00\u542F']
]);

const SETTING_TITLE_PHRASE_TRANSLATIONS = new Map<string, string>([
	['accessibility page size', '\u8F85\u52A9\u529F\u80FD\u9875\u9762\u5927\u5C0F'],
	['accessibility support', '\u8F85\u52A9\u529F\u80FD\u652F\u6301'],
	['allowed network domains', '\u5141\u8BB8\u7684\u7F51\u7EDC\u57DF'],
	['allow auto approve', '\u5141\u8BB8\u81EA\u52A8\u6279\u51C6'],
	['allow variable fonts', '\u5141\u8BB8\u53EF\u53D8\u5B57\u4F53'],
	['allow variable fonts in accessibility mode', '\u5728\u8F85\u52A9\u529F\u80FD\u6A21\u5F0F\u4E0B\u5141\u8BB8\u53EF\u53D8\u5B57\u4F53'],
	['allow variable line heights', '\u5141\u8BB8\u53EF\u53D8\u884C\u9AD8'],
	['auto approve', '\u81EA\u52A8\u6279\u51C6'],
	['auto closing brackets', '\u81EA\u52A8\u95ED\u5408\u62EC\u53F7'],
	['auto closing comments', '\u81EA\u52A8\u95ED\u5408\u6CE8\u91CA'],
	['auto closing delete', '\u81EA\u52A8\u95ED\u5408\u5220\u9664'],
	['auto closing overtype', '\u81EA\u52A8\u95ED\u5408\u8986\u76D6\u8F93\u5165'],
	['auto closing quotes', '\u81EA\u52A8\u95ED\u5408\u5F15\u53F7'],
	['auto indent on paste within string', '\u5728\u5B57\u7B26\u4E32\u5185\u7C98\u8D34\u65F6\uFF1A\u81EA\u52A8\u7F29\u8FDB'],
	['auto resume', '\u81EA\u52A8\u6062\u590D'],
	['auto save', '\u81EA\u52A8\u4FDD\u5B58'],
	['auto save delay', '\u81EA\u52A8\u4FDD\u5B58\u5EF6\u8FDF'],
	['auto surround', '\u81EA\u52A8\u5305\u56F4'],
	['breadcrumbs', '\u5BFC\u822A\u8DEF\u5F84'],
	['bracket pair colorization', '\u5F69\u8272\u62EC\u53F7'],
	['bracket pair colorization enabled', '\u5F69\u8272\u62EC\u53F7\uFF1A\u5DF2\u5F00\u542F'],
	['browser', '\u6D4F\u89C8\u5668'],
	['cloud changes', '\u4E91\u7AEF\u66F4\u6539'],
	['code lens', '\u4EE3\u7801\u900F\u955C'],
	['color theme', '\u989C\u8272\u4E3B\u9898'],
	['command palette', '\u547D\u4EE4\u9762\u677F'],
	['continue on', '\u7EE7\u7EED\u5F00\u542F'],
	['default formatter', '\u9ED8\u8BA4\u683C\u5F0F\u5316\u7A0B\u5E8F'],
	['detect participant', '\u68C0\u6D4B\u53C2\u4E0E\u8005'],
	['diff editor', '\u5DEE\u5F02\u7F16\u8F91\u5668'],
	['editor font family', '\u7F16\u8F91\u5668\u5B57\u4F53\u7CFB\u5217'],
	['editor font size', '\u7F16\u8F91\u5668\u5B57\u4F53\u5927\u5C0F'],
	['editor tab size', '\u7F16\u8F91\u5668\u5236\u8868\u7B26\u5927\u5C0F'],
	['file changes', '\u6587\u4EF6\u66F4\u6539'],
	['large file confirmation', '\u5927\u6587\u4EF6\u786E\u8BA4'],
	['font family', '\u5B57\u4F53\u7CFB\u5217'],
	['font ligatures', '\u5B57\u4F53\u8FDE\u5B57'],
	['font size', '\u5B57\u4F53\u5927\u5C0F'],
	['font variations', '\u5B57\u4F53\u53D8\u4F53'],
	['font weight', '\u5B57\u4F53\u7C97\u7EC6'],
	['format on paste', '\u7C98\u8D34\u65F6\u683C\u5F0F\u5316'],
	['format on save', '\u4FDD\u5B58\u65F6\u683C\u5F0F\u5316'],
	['format on save mode', '\u4FDD\u5B58\u65F6\u683C\u5F0F\u5316\u6A21\u5F0F'],
	['format on type', '\u8F93\u5165\u65F6\u683C\u5F0F\u5316'],
	['hot exit', '\u70ED\u9000\u51FA'],
	['implicit context', '\u9690\u5F0F\u4E0A\u4E0B\u6587'],
	['inline suggest', '\u5185\u8054\u5EFA\u8BAE'],
	['inline suggestion', '\u5185\u8054\u5EFA\u8BAE'],
	['inline suggestions', '\u5185\u8054\u5EFA\u8BAE'],
	['max requests', '\u6700\u5927\u8BF7\u6C42\u6570'],
	['mouse wheel zoom', '\u9F20\u6807\u6EDA\u8F6E\u7F29\u653E'],
	['network filter', '\u7F51\u7EDC\u7B5B\u9009\u5668'],
	['notifications position', '\u901A\u77E5\u4F4D\u7F6E'],
	['preserve input', '\u4FDD\u7559\u8F93\u5165'],
	['prompt in trusted workspace', '\u5728\u53D7\u4FE1\u4EFB\u5DE5\u4F5C\u533A\u4E2D\u63D0\u793A'],
	['quick access', '\u5FEB\u901F\u8BBF\u95EE'],
	['quick open', '\u5FEB\u901F\u6253\u5F00'],
	['quick suggestions', '\u5FEB\u901F\u5EFA\u8BAE'],
	['quick suggestions delay', '\u5FEB\u901F\u5EFA\u8BAE\u5EF6\u8FDF'],
	['sandbox advanced', '\u6C99\u76D2\u9AD8\u7EA7'],
	['screen reader', '\u5C4F\u5E55\u9605\u8BFB\u5668'],
	['screencast mode', '\u5C4F\u5E55\u6295\u5C04\u6A21\u5F0F'],
	['show file changes', '\u663E\u793A\u6587\u4EF6\u66F4\u6539'],
	['sign out', '\u9000\u51FA\u767B\u5F55'],
	['source control', '\u6E90\u4EE3\u7801\u7BA1\u7406'],
	['status bar', '\u72B6\u6001\u680F'],
	['suggested context', '\u5EFA\u8BAE\u7684\u4E0A\u4E0B\u6587'],
	['tab size', '\u5236\u8868\u7B26\u5927\u5C0F'],
	['text editor', '\u6587\u672C\u7F16\u8F91\u5668'],
	['title bar', '\u6807\u9898\u680F'],
	['title separator', '\u6807\u9898\u5206\u9694\u7B26'],
	['trusted domains', '\u53D7\u4FE1\u4EFB\u57DF'],
	['trusted workspace', '\u53D7\u4FE1\u4EFB\u5DE5\u4F5C\u533A'],
	['word wrap', '\u81EA\u52A8\u6362\u884C'],
	['workspace trust', '\u5DE5\u4F5C\u533A\u4FE1\u4EFB']
]);

const SETTING_TITLE_WORD_TRANSLATIONS = new Map<string, string>([
	['access', '\u8BBF\u95EE'],
	['accessibility', '\u8F85\u52A9\u529F\u80FD'],
	['action', '\u64CD\u4F5C'],
	['actions', '\u64CD\u4F5C'],
	['active', '\u6D3B\u52A8'],
	['activity', '\u6D3B\u52A8'],
	['additional', '\u9644\u52A0'],
	['agent', '\u667A\u80FD\u4F53'],
	['agents', '\u667A\u80FD\u4F53'],
	['algorithm', '\u7B97\u6CD5'],
	['allow', '\u5141\u8BB8'],
	['alternative', '\u5907\u7528'],
	['always', '\u59CB\u7EC8'],
	['api', 'API'],
	['application', '\u5E94\u7528\u7A0B\u5E8F'],
	['advanced', '\u9AD8\u7EA7'],
	['approve', '\u6279\u51C6'],
	['associations', '\u5173\u8054'],
	['async', '\u5F02\u6B65'],
	['auto', '\u81EA\u52A8'],
	['available', '\u53EF\u7528'],
	['backend', '\u540E\u7AEF'],
	['bar', '\u680F'],
	['base', '\u57FA\u7840'],
	['batch', '\u6279\u91CF'],
	['bracket', '\u62EC\u53F7'],
	['brackets', '\u62EC\u53F7'],
	['branch', '\u5206\u652F'],
	['breadcrumbs', '\u5BFC\u822A\u8DEF\u5F84'],
	['breakpoint', '\u65AD\u70B9'],
	['breakpoints', '\u65AD\u70B9'],
	['border', '\u8FB9\u6846'],
	['browser', '\u6D4F\u89C8\u5668'],
	['cache', '\u7F13\u5B58'],
	['cell', '\u5355\u5143\u683C'],
	['character', '\u5B57\u7B26'],
	['characters', '\u5B57\u7B26'],
	['change', '\u66F4\u6539'],
	['changed', '\u5DF2\u66F4\u6539'],
	['changes', '\u66F4\u6539'],
	['chat', '\u804A\u5929'],
	['checkpoint', '\u68C0\u67E5\u70B9'],
	['checkpoints', '\u68C0\u67E5\u70B9'],
	['class', '\u7C7B'],
	['classes', '\u7C7B'],
	['close', '\u5173\u95ED'],
	['closing', '\u95ED\u5408'],
	['cloud', '\u4E91\u7AEF'],
	['code', '\u4EE3\u7801'],
	['color', '\u989C\u8272'],
	['colors', '\u989C\u8272'],
	['column', '\u5217'],
	['command', '\u547D\u4EE4'],
	['commands', '\u547D\u4EE4'],
	['comment', '\u6CE8\u91CA'],
	['comments', '\u6CE8\u91CA'],
	['commit', '\u63D0\u4EA4'],
	['compact', '\u7D27\u51D1'],
	['completion', '\u8865\u5168'],
	['confirmation', '\u786E\u8BA4'],
	['conflict', '\u51B2\u7A81'],
	['connect', '\u8FDE\u63A5'],
	['context', '\u4E0A\u4E0B\u6587'],
	['continue', '\u7EE7\u7EED'],
	['constant', '\u5E38\u91CF'],
	['constants', '\u5E38\u91CF'],
	['constructor', '\u6784\u9020\u51FD\u6570'],
	['constructors', '\u6784\u9020\u51FD\u6570'],
	['control', '\u63A7\u5236'],
	['controls', '\u63A7\u4EF6'],
	['copilot', 'Copilot'],
	['copy', '\u590D\u5236'],
	['count', '\u6570\u91CF'],
	['cursor', '\u5149\u6807'],
	['custom', '\u81EA\u5B9A\u4E49'],
	['debug', '\u8C03\u8BD5'],
	['declaration', '\u58F0\u660E'],
	['declarations', '\u58F0\u660E'],
	['default', '\u9ED8\u8BA4'],
	['delete', '\u5220\u9664'],
	['delay', '\u5EF6\u8FDF'],
	['detect', '\u68C0\u6D4B'],
	['deprecated', '\u5DF2\u5F03\u7528'],
	['details', '\u8BE6\u7EC6\u4FE1\u606F'],
	['diagnostics', '\u8BCA\u65AD'],
	['diff', '\u5DEE\u5F02'],
	['directory', '\u76EE\u5F55'],
	['disable', '\u7981\u7528'],
	['disabled', '\u5DF2\u7981\u7528'],
	['domain', '\u57DF'],
	['domains', '\u57DF'],
	['editor', '\u7F16\u8F91\u5668'],
	['edits', '\u7F16\u8F91'],
	['enable', '\u542F\u7528'],
	['enabled', '\u542F\u7528'],
	['encoding', '\u7F16\u7801'],
	['end', '\u7ED3\u675F'],
	['enter', 'Enter'],
	['empty', '\u7A7A'],
	['enum', '\u679A\u4E3E'],
	['enums', '\u679A\u4E3E'],
	['environment', '\u73AF\u5883'],
	['error', '\u9519\u8BEF'],
	['errors', '\u9519\u8BEF'],
	['event', '\u4E8B\u4EF6'],
	['events', '\u4E8B\u4EF6'],
	['exclude', '\u6392\u9664'],
	['expanded', '\u5C55\u5F00'],
	['experiments', '\u5B9E\u9A8C'],
	['experimental', '\u5B9E\u9A8C\u6027'],
	['explorer', '\u8D44\u6E90\u7BA1\u7406\u5668'],
	['extension', '\u6269\u5C55'],
	['extensions', '\u6269\u5C55'],
	['external', '\u5916\u90E8'],
	['family', '\u7CFB\u5217'],
	['feature', '\u529F\u80FD'],
	['features', '\u529F\u80FD'],
	['fetch', '\u62C9\u53D6'],
	['file', '\u6587\u4EF6'],
	['files', '\u6587\u4EF6'],
	['filter', '\u7B5B\u9009'],
	['filtered', '\u5DF2\u7B5B\u9009'],
	['find', '\u67E5\u627E'],
	['focus', '\u7126\u70B9'],
	['folder', '\u6587\u4EF6\u5939'],
	['folders', '\u6587\u4EF6\u5939'],
	['font', '\u5B57\u4F53'],
	['fonts', '\u5B57\u4F53'],
	['format', '\u683C\u5F0F\u5316'],
	['formatter', '\u683C\u5F0F\u5316\u7A0B\u5E8F'],
	['formatting', '\u683C\u5F0F\u5316'],
	['function', '\u51FD\u6570'],
	['functions', '\u51FD\u6570'],
	['git', 'Git'],
	['github', 'GitHub'],
	['graceful', '\u5E73\u6ED1'],
	['group', '\u7EC4'],
	['grouped', '\u5206\u7EC4'],
	['groups', '\u7EC4'],
	['gutter', '\u88C5\u8BA2\u7EBF'],
	['height', '\u9AD8\u5EA6'],
	['heights', '\u9AD8\u5EA6'],
	['hide', '\u9690\u85CF'],
	['highlight', '\u7A81\u51FA\u663E\u793A'],
	['hint', '\u63D0\u793A'],
	['history', '\u5386\u53F2\u8BB0\u5F55'],
	['icon', '\u56FE\u6807'],
	['icons', '\u56FE\u6807'],
	['ignore', '\u5FFD\u7565'],
	['include', '\u5305\u542B'],
	['indentation', '\u7F29\u8FDB'],
	['indicator', '\u6307\u793A\u5668'],
	['indicators', '\u6307\u793A\u5668'],
	['implicit', '\u9690\u5F0F'],
	['inline', '\u5185\u8054'],
	['input', '\u8F93\u5165'],
	['insert', '\u63D2\u5165'],
	['integrated', '\u96C6\u6210'],
	['interface', '\u63A5\u53E3'],
	['interfaces', '\u63A5\u53E3'],
	['issue', '\u95EE\u9898'],
	['issues', '\u95EE\u9898'],
	['keyword', '\u5173\u952E\u5B57'],
	['keywords', '\u5173\u952E\u5B57'],
	['language', '\u8BED\u8A00'],
	['large', '\u5927'],
	['layout', '\u5E03\u5C40'],
	['lens', '\u900F\u955C'],
	['letter', '\u5B57\u6BCD'],
	['ligatures', '\u8FDE\u5B57'],
	['limit', '\u9650\u5236'],
	['line', '\u884C'],
	['lines', '\u884C'],
	['list', '\u5217\u8868'],
	['local', '\u672C\u5730'],
	['location', '\u4F4D\u7F6E'],
	['loop', '\u5FAA\u73AF'],
	['markdown', 'Markdown'],
	['mark', '\u6807\u8BB0'],
	['margin', '\u8FB9\u8DDD'],
	['match', '\u5339\u914D'],
	['management', '\u7BA1\u7406'],
	['max', '\u6700\u5927'],
	['maximum', '\u6700\u5927'],
	['memory', '\u5185\u5B58'],
	['menu', '\u83DC\u5355'],
	['merge', '\u5408\u5E76'],
	['method', '\u65B9\u6CD5'],
	['methods', '\u65B9\u6CD5'],
	['min', '\u6700\u5C0F'],
	['minimap', '\u7F29\u7565\u56FE'],
	['minimum', '\u6700\u5C0F'],
	['mode', '\u6A21\u5F0F'],
	['model', '\u6A21\u578B'],
	['modified', '\u5DF2\u4FEE\u6539'],
	['module', '\u6A21\u5757'],
	['modules', '\u6A21\u5757'],
	['mouse', '\u9F20\u6807'],
	['move', '\u79FB\u52A8'],
	['moves', '\u79FB\u52A8'],
	['multiple', '\u591A\u4E2A'],
	['name', '\u540D\u79F0'],
	['network', '\u7F51\u7EDC'],
	['new', '\u65B0\u5EFA'],
	['newline', '\u6362\u884C'],
	['notifications', '\u901A\u77E5'],
	['notebook', '\u7B14\u8BB0\u672C'],
	['number', '\u6570\u5B57'],
	['off', '\u5173\u95ED'],
	['on', '\u5F00\u542F'],
	['open', '\u6253\u5F00'],
	['operator', '\u8FD0\u7B97\u7B26'],
	['operators', '\u8FD0\u7B97\u7B26'],
	['other', '\u5176\u4ED6'],
	['output', '\u8F93\u51FA'],
	['overrides', '\u8986\u76D6'],
	['overtype', '\u8986\u76D6\u8F93\u5165'],
	['page', '\u9875\u9762'],
	['parameter', '\u53C2\u6570'],
	['parameters', '\u53C2\u6570'],
	['participant', '\u53C2\u4E0E\u8005'],
	['paste', '\u7C98\u8D34'],
	['path', '\u8DEF\u5F84'],
	['paths', '\u8DEF\u5F84'],
	['permission', '\u6743\u9650'],
	['permissions', '\u6743\u9650'],
	['position', '\u4F4D\u7F6E'],
	['preserve', '\u4FDD\u7559'],
	['preview', '\u9884\u89C8'],
	['prompt', '\u63D0\u793A'],
	['profile', '\u914D\u7F6E\u6587\u4EF6'],
	['profiles', '\u914D\u7F6E\u6587\u4EF6'],
	['progress', '\u8FDB\u5EA6'],
	['properties', '\u5C5E\u6027'],
	['property', '\u5C5E\u6027'],
	['pull', '\u62C9\u53D6'],
	['push', '\u63A8\u9001'],
	['quick', '\u5FEB\u901F'],
	['quote', '\u5F15\u53F7'],
	['quotes', '\u5F15\u53F7'],
	['readonly', '\u53EA\u8BFB'],
	['recent', '\u6700\u8FD1'],
	['reference', '\u5F15\u7528'],
	['references', '\u5F15\u7528'],
	['regex', '\u6B63\u5219\u8868\u8FBE\u5F0F'],
	['remote', '\u8FDC\u7A0B'],
	['render', '\u6E32\u67D3'],
	['replace', '\u66FF\u6362'],
	['repository', '\u5B58\u50A8\u5E93'],
	['repositories', '\u5B58\u50A8\u5E93'],
	['request', '\u8BF7\u6C42'],
	['requests', '\u8BF7\u6C42'],
	['resume', '\u6062\u590D'],
	['restore', '\u6062\u590D'],
	['runtime', '\u8FD0\u884C\u65F6'],
	['result', '\u7ED3\u679C'],
	['review', '\u5BA1\u9605'],
	['sandbox', '\u6C99\u76D2'],
	['save', '\u4FDD\u5B58'],
	['scale', '\u7F29\u653E\u6BD4\u4F8B'],
	['screencast', '\u5C4F\u5E55\u6295\u5C04'],
	['screen', '\u5C4F\u5E55'],
	['scroll', '\u6EDA\u52A8'],
	['scrollbar', '\u6EDA\u52A8\u6761'],
	['search', '\u641C\u7D22'],
	['section', '\u8282'],
	['security', '\u5B89\u5168\u6027'],
	['selection', '\u9009\u62E9'],
	['selectors', '\u9009\u62E9\u5668'],
	['semicolon', '\u5206\u53F7'],
	['semicolons', '\u5206\u53F7'],
	['separator', '\u5206\u9694\u7B26'],
	['session', '\u4F1A\u8BDD'],
	['sessions', '\u4F1A\u8BDD'],
	['setting', '\u8BBE\u7F6E'],
	['settings', '\u8BBE\u7F6E'],
	['shell', 'Shell'],
	['show', '\u663E\u793A'],
	['side', '\u4FA7\u8FB9'],
	['size', '\u5927\u5C0F'],
	['sizing', '\u5927\u5C0F\u8C03\u6574'],
	['slider', '\u6ED1\u5757'],
	['smart', '\u667A\u80FD'],
	['snippet', '\u4EE3\u7801\u7247\u6BB5'],
	['snippets', '\u4EE3\u7801\u7247\u6BB5'],
	['source', '\u6E90'],
	['space', '\u7A7A\u683C'],
	['spaces', '\u7A7A\u683C'],
	['specific', '\u7279\u5B9A'],
	['split', '\u62C6\u5206'],
	['startup', '\u542F\u52A8'],
	['status', '\u72B6\u6001'],
	['string', '\u5B57\u7B26\u4E32'],
	['strings', '\u5B57\u7B26\u4E32'],
	['struct', '\u7ED3\u6784\u4F53'],
	['structs', '\u7ED3\u6784\u4F53'],
	['suggest', '\u5EFA\u8BAE'],
	['suggested', '\u5EFA\u8BAE\u7684'],
	['suggestion', '\u5EFA\u8BAE'],
	['suggestions', '\u5EFA\u8BAE'],
	['support', '\u652F\u6301'],
	['sync', '\u540C\u6B65'],
	['syntax', '\u8BED\u6CD5'],
	['tab', '\u5236\u8868\u7B26'],
	['tag', '\u6807\u7B7E'],
	['tags', '\u6807\u7B7E'],
	['terminal', '\u7EC8\u7AEF'],
	['theme', '\u4E3B\u9898'],
	['time', '\u65F6\u95F4'],
	['timeout', '\u8D85\u65F6'],
	['title', '\u6807\u9898'],
	['token', '\u4EE4\u724C'],
	['tokenization', '\u6807\u8BB0\u5316'],
	['toolbar', '\u5DE5\u5177\u680F'],
	['tool', '\u5DE5\u5177'],
	['tools', '\u5DE5\u5177'],
	['trailing', '\u5C3E\u968F'],
	['tree', '\u6811'],
	['trim', '\u4FEE\u526A'],
	['trust', '\u4FE1\u4EFB'],
	['trusted', '\u53D7\u4FE1\u4EFB'],
	['type', '\u7C7B\u578B'],
	['types', '\u7C7B\u578B'],
	['unit', '\u5355\u4F4D'],
	['units', '\u5355\u4F4D'],
	['unknown', '\u672A\u77E5'],
	['update', '\u66F4\u65B0'],
	['url', 'URL'],
	['uri', 'URI'],
	['use', '\u4F7F\u7528'],
	['used', '\u4F7F\u7528'],
	['user', '\u7528\u6237'],
	['users', '\u7528\u6237'],
	['value', '\u503C'],
	['values', '\u503C'],
	['variable', '\u53EF\u53D8'],
	['variables', '\u53D8\u91CF'],
	['variation', '\u53D8\u4F53'],
	['variations', '\u53D8\u4F53'],
	['vendor', '\u4F9B\u5E94\u5546'],
	['view', '\u89C6\u56FE'],
	['visible', '\u53EF\u89C1'],
	['watcher', '\u76D1\u89C6\u5668'],
	['wheel', '\u6EDA\u8F6E'],
	['when', '\u65F6'],
	['width', '\u5BBD\u5EA6'],
	['window', '\u7A97\u53E3'],
	['windows', '\u7A97\u53E3'],
	['word', '\u5355\u8BCD'],
	['words', '\u5355\u8BCD'],
	['workbench', '\u5DE5\u4F5C\u53F0'],
	['workspace', '\u5DE5\u4F5C\u533A'],
	['wrap', '\u6362\u884C'],
	['accept', '\u63A5\u53D7'],
	['activation', '\u6FC0\u6D3B'],
	['add', '\u6DFB\u52A0'],
	['after', '\u4E4B\u540E'],
	['all', '\u5168\u90E8'],
	['alt', 'Alt'],
	['and', '\u548C'],
	['animation', '\u52A8\u753B'],
	['announce', '\u64AD\u62A5'],
	['anthropic', 'Anthropic'],
	['arrays', '\u6570\u7EC4'],
	['as', '\u4F5C\u4E3A'],
	['ask', '\u8BE2\u95EE'],
	['at', '\u5728'],
	['attribute', '\u5C5E\u6027'],
	['attributes', '\u5C5E\u6027'],
	['autohide', '\u81EA\u52A8\u9690\u85CF'],
	['background', '\u80CC\u666F'],
	['badge', '\u5FBD\u7AE0'],
	['badges', '\u5FBD\u7AE0'],
	['based', '\u57FA\u4E8E'],
	['before', '\u4E4B\u524D'],
	['behavior', '\u884C\u4E3A'],
	['behaviour', '\u884C\u4E3A'],
	['black', '\u9ED1\u8272'],
	['blinking', '\u95EA\u70C1'],
	['blue', '\u84DD\u8272'],
	['bonus', '\u52A0\u6210'],
	['booleans', '\u5E03\u5C14\u503C'],
	['break', '\u4E2D\u65AD'],
	['bright', '\u4EAE\u8272'],
	['button', '\u6309\u94AE'],
	['by', '\u6309'],
	['call', '\u8C03\u7528'],
	['candidate', '\u5019\u9009'],
	['candidates', '\u5019\u9009'],
	['caret', '\u63D2\u5165\u5149\u6807'],
	['case', '\u5927\u5C0F\u5199'],
	['certificates', '\u8BC1\u4E66'],
	['channel', '\u901A\u9053'],
	['check', '\u68C0\u67E5'],
	['clear', '\u6E05\u9664'],
	['cli', 'CLI'],
	['click', '\u70B9\u51FB'],
	['clipboard', '\u526A\u8D34\u677F'],
	['collapse', '\u6298\u53E0'],
	['collapsed', '\u5DF2\u6298\u53E0'],
	['colorization', '\u7740\u8272'],
	['completed', '\u5DF2\u5B8C\u6210'],
	['computation', '\u8BA1\u7B97'],
	['config', '\u914D\u7F6E'],
	['configuration', '\u914D\u7F6E'],
	['confirm', '\u786E\u8BA4'],
	['confirmed', '\u5DF2\u786E\u8BA4'],
	['console', '\u63A7\u5236\u53F0'],
	['content', '\u5185\u5BB9'],
	['contrib', '\u8D21\u732E'],
	['conversation', '\u5BF9\u8BDD'],
	['create', '\u521B\u5EFA'],
	['ctrl', 'Ctrl'],
	['current', '\u5F53\u524D'],
	['customcolors', '\u81EA\u5B9A\u4E49\u989C\u8272'],
	['customizations', '\u81EA\u5B9A\u4E49\u9879'],
	['cyan', '\u9752\u8272'],
	['debounce', '\u9632\u6296'],
	['debugging', '\u8C03\u8BD5'],
	['decorations', '\u88C5\u9970'],
	['deferred', '\u5EF6\u8FDF'],
	['definition', '\u5B9A\u4E49'],
	['definitions', '\u5B9A\u4E49'],
	['deletion', '\u5220\u9664'],
	['demand', '\u6309\u9700'],
	['desc', '\u63CF\u8FF0'],
	['detection', '\u68C0\u6D4B'],
	['dialog', '\u5BF9\u8BDD\u6846'],
	['disassembly', '\u53CD\u6C47\u7F16'],
	['distance', '\u8DDD\u79BB'],
	['double', '\u53CC\u51FB'],
	['drop', '\u62D6\u653E'],
	['eagerness', '\u79EF\u6781\u7A0B\u5EA6'],
	['edit', '\u7F16\u8F91'],
	['edited', '\u5DF2\u7F16\u8F91'],
	['editing', '\u7F16\u8F91'],
	['effort', '\u529B\u5EA6'],
	['ending', '\u7ED3\u5C3E'],
	['everywhere', '\u6240\u6709\u4F4D\u7F6E'],
	['exec', '\u6267\u884C'],
	['execution', '\u6267\u884C'],
	['exit', '\u9000\u51FA'],
	['expand', '\u5C55\u5F00'],
	['failed', '\u5931\u8D25'],
	['fallback', '\u56DE\u9000'],
	['feedback', '\u53CD\u9988'],
	['fields', '\u5B57\u6BB5'],
	['final', '\u6700\u7EC8'],
	['finished', '\u5DF2\u5B8C\u6210'],
	['first', '\u7B2C\u4E00\u4E2A'],
	['fix', '\u4FEE\u590D'],
	['fixed', '\u56FA\u5B9A'],
	['follow', '\u8DDF\u968F'],
	['for', '\u7528\u4E8E'],
	['forward', '\u8F6C\u53D1'],
	['forwarded', '\u5DF2\u8F6C\u53D1'],
	['from', '\u6765\u81EA'],
	['full', '\u5B8C\u6574'],
	['generate', '\u751F\u6210'],
	['generation', '\u751F\u6210'],
	['global', '\u5168\u5C40'],
	['gr', 'Gr'],
	['graph', '\u56FE'],
	['green', '\u7EFF\u8272'],
	['guess', '\u731C\u6D4B'],
	['guides', '\u53C2\u8003\u7EBF'],
	['handling', '\u5904\u7406'],
	['has', '\u6709'],
	['header', '\u6807\u9898'],
	['headers', '\u6807\u9898'],
	['highlighting', '\u9AD8\u4EAE'],
	['host', '\u4E3B\u673A'],
	['hot', '\u70ED\u9000\u51FA'],
	['hover', '\u60AC\u505C'],
	['identical', '\u76F8\u540C'],
	['ids', '\u6807\u8BC6\u7B26'],
	['ignored', '\u5DF2\u5FFD\u7565'],
	['imports', '\u5BFC\u5165'],
	['in', '\u5728'],
	['incoming', '\u4F20\u5165'],
	['index', '\u7D22\u5F15'],
	['info', '\u4FE1\u606F'],
	['information', '\u4FE1\u606F'],
	['initialize', '\u521D\u59CB\u5316'],
	['install', '\u5B89\u88C5'],
	['instruction', '\u6307\u4EE4'],
	['instructions', '\u6307\u4EE4'],
	['internal', '\u5185\u90E8'],
	['interval', '\u95F4\u9694'],
	['into', '\u5230'],
	['is', '\u662F'],
	['key', '\u952E'],
	['keyboard', '\u952E\u76D8'],
	['kind', '\u79CD\u7C7B'],
	['label', '\u6807\u7B7E'],
	['labels', '\u6807\u7B7E'],
	['launch', '\u542F\u52A8'],
	['launcher', '\u542F\u52A8\u5668'],
	['lazy', '\u5EF6\u8FDF'],
	['length', '\u957F\u5EA6'],
	['links', '\u94FE\u63A5'],
	['lint', 'Lint'],
	['linux', 'Linux'],
	['localhost', '\u672C\u5730\u4E3B\u673A'],
	['locality', '\u5C40\u90E8\u6027'],
	['log', '\u65E5\u5FD7'],
	['logging', '\u8BB0\u5F55\u65E5\u5FD7'],
	['long', '\u957F'],
	['maintain', '\u7EF4\u62A4'],
	['map', '\u6620\u5C04'],
	['markers', '\u6807\u8BB0'],
	['members', '\u6210\u5458'],
	['message', '\u6D88\u606F'],
	['middle', '\u4E2D\u952E'],
	['modal', '\u6A21\u6001'],
	['motion', '\u52A8\u6548'],
	['native', '\u672C\u673A'],
	['natural', '\u81EA\u7136\u8BED\u8A00'],
	['navigation', '\u5BFC\u822A'],
	['navigator', '\u5BFC\u822A\u5668'],
	['nearest', '\u6700\u8FD1'],
	['nesting', '\u5D4C\u5957'],
	['next', '\u4E0B\u4E00\u4E2A'],
	['no', '\u65E0'],
	['notes', '\u53D1\u884C\u8BF4\u660E'],
	['null', '\u7A7A\u503C'],
	['objects', '\u5BF9\u8C61'],
	['only', '\u4EC5'],
	['opening', '\u5F00\u59CB'],
	['options', '\u9009\u9879'],
	['order', '\u987A\u5E8F'],
	['organize', '\u6574\u7406'],
	['outline', '\u5927\u7EB2'],
	['overlay', '\u8986\u76D6\u5C42'],
	['overview', '\u6982\u89C8'],
	['packages', '\u5305'],
	['pair', '\u5BF9'],
	['pairs', '\u5BF9'],
	['palette', '\u9762\u677F'],
	['panel', '\u9762\u677F'],
	['parent', '\u7236\u7EA7'],
	['pattern', '\u6A21\u5F0F'],
	['patterns', '\u6A21\u5F0F'],
	['pcre2', 'PCRE2'],
	['per', '\u6BCF\u4E2A'],
	['period', '\u5468\u671F'],
	['pinned', '\u5DF2\u56FA\u5B9A'],
	['plan', '\u8BA1\u5212'],
	['port', '\u7AEF\u53E3'],
	['ports', '\u7AEF\u53E3'],
	['post', '\u4E4B\u540E'],
	['pr', 'PR'],
	['pre', '\u9884\u542F\u52A8'],
	['prefer', '\u9996\u9009'],
	['preferences', '\u9996\u9009\u9879'],
	['presentation', '\u5448\u73B0'],
	['prevent', '\u963B\u6B62'],
	['principal', '\u4E3B\u4F53'],
	['prior', '\u5148\u524D'],
	['project', '\u9879\u76EE'],
	['protocol', '\u534F\u8BAE'],
	['provider', '\u63D0\u4F9B\u7A0B\u5E8F'],
	['proxy', '\u4EE3\u7406'],
	['reader', '\u9605\u8BFB\u5668'],
	['ready', '\u5C31\u7EEA'],
	['recommendations', '\u63A8\u8350'],
	['recording', '\u5F55\u5236'],
	['red', '\u7EA2\u8272'],
	['reduce', '\u51CF\u5C11'],
	['reduced', '\u5DF2\u51CF\u5C11'],
	['region', '\u533A\u57DF'],
	['regions', '\u533A\u57DF'],
	['relative', '\u76F8\u5BF9'],
	['release', '\u53D1\u5E03'],
	['rename', '\u91CD\u547D\u540D'],
	['repl', 'REPL'],
	['resolution', '\u89E3\u51B3'],
	['resolve', '\u89E3\u51B3'],
	['response', '\u54CD\u5E94'],
	['responses', '\u54CD\u5E94'],
	['reuse', '\u91CD\u7528'],
	['reusing', '\u91CD\u7528'],
	['reveal', '\u663E\u793A'],
	['revert', '\u8FD8\u539F'],
	['rich', '\u5BCC\u6587\u672C'],
	['ripgrep', 'Ripgrep'],
	['ruler', '\u6807\u5C3A'],
	['run', '\u8FD0\u884C'],
	['sash', '\u5206\u9694\u6761'],
	['scan', '\u626B\u63CF'],
	['scm', '\u6E90\u4EE3\u7801\u7BA1\u7406'],
	['secondary', '\u6B21\u7EA7'],
	['seed', '\u9884\u586B'],
	['select', '\u9009\u62E9'],
	['semantic', '\u8BED\u4E49'],
	['server', '\u670D\u52A1\u5668'],
	['service', '\u670D\u52A1'],
	['sets', '\u96C6\u5408'],
	['share', '\u5171\u4EAB'],
	['shifting', '\u79FB\u4F4D'],
	['signal', '\u4FE1\u53F7'],
	['signals', '\u4FE1\u53F7'],
	['simple', '\u7B80\u5355'],
	['single', '\u5355\u51FB'],
	['sitter', 'Sitter'],
	['slash', '\u659C\u6760'],
	['slow', '\u6162\u901F'],
	['smooth', '\u5E73\u6ED1'],
	['socket', '\u5957\u63A5\u5B57'],
	['sort', '\u6392\u5E8F'],
	['spacing', '\u95F4\u8DDD'],
	['specifier', '\u8BF4\u660E\u7B26'],
	['ssl', 'SSL'],
	['stack', '\u6808'],
	['start', '\u5F00\u59CB'],
	['state', '\u72B6\u6001'],
	['sticky', '\u7C98\u6EDE'],
	['style', '\u6837\u5F0F'],
	['sub', '\u5B50'],
	['subagent', '\u5B50\u667A\u80FD\u4F53'],
	['suppress', '\u6291\u5236'],
	['surrounding', '\u5468\u56F4'],
	['symbol', '\u7B26\u53F7'],
	['symbols', '\u7B26\u53F7'],
	['symlinks', '\u7B26\u53F7\u94FE\u63A5'],
	['system', '\u7CFB\u7EDF'],
	['task', '\u4EFB\u52A1'],
	['telemetry', '\u9065\u6D4B'],
	['thread', '\u7EBF\u7A0B'],
	['threads', '\u7EBF\u7A0B'],
	['tips', '\u63D0\u793A'],
	['to', '\u5230'],
	['toggle', '\u5207\u6362'],
	['top', '\u9876\u90E8'],
	['trace', '\u8DDF\u8E2A'],
	['trash', '\u56DE\u6536\u7AD9'],
	['trigger', '\u89E6\u53D1'],
	['true', '\u771F\u6B63'],
	['tsc', 'TSC'],
	['tsserver', 'TSServer'],
	['unchanged', '\u672A\u66F4\u6539'],
	['undo', '\u64A4\u9500'],
	['unified', '\u7EDF\u4E00'],
	['unpin', '\u53D6\u6D88\u56FA\u5B9A'],
	['visibility', '\u53EF\u89C1\u6027'],
	['voice', '\u8BED\u97F3'],
	['walkthrough', '\u6F14\u7EC3'],
	['warning', '\u8B66\u544A'],
	['web', 'Web'],
	['websearch', 'Web \u641C\u7D22'],
	['weight', '\u7C97\u7EC6'],
	['while', '\u671F\u95F4'],
	['white', '\u767D\u8272'],
	['with', '\u4E0E'],
	['wizard', '\u5411\u5BFC'],
	['working', '\u5DE5\u4F5C'],
	['about', '\u5173\u4E8E'],
	['above', '\u4E0A\u65B9'],
	['account', '\u8D26\u6237'],
	['affinity', '\u4EB2\u548C\u6027'],
	['aliasing', '\u6297\u952F\u9F7F'],
	['allowed', '\u5141\u8BB8'],
	['ambiguous', '\u6B67\u4E49'],
	['announcements', '\u64AD\u62A5'],
	['anonymous', '\u533F\u540D'],
	['ansi', 'ANSI'],
	['applied', '\u5DF2\u5E94\u7528'],
	['area', '\u533A\u57DF'],
	['arguments', '\u53C2\u6570'],
	['back', '\u540E\u9000'],
	['bell', '\u94C3\u58F0'],
	['binary', '\u4E8C\u8FDB\u5236'],
	['bottom', '\u5E95\u90E8'],
	['capture', '\u6355\u83B7'],
	['centered', '\u5C45\u4E2D'],
	['checkout', '\u68C0\u51FA'],
	['closed', '\u5DF2\u5173\u95ED'],
	['colorized', '\u5DF2\u7740\u8272'],
	['container', '\u5BB9\u5668'],
	['crash', '\u5D29\u6E83'],
	['cwd', '\u5F53\u524D\u5DE5\u4F5C\u76EE\u5F55'],
	['cycle', '\u5FAA\u73AF'],
	['dangerously', '\u5371\u9669\u5730'],
	['data', '\u6570\u636E'],
	['deleted', '\u5DF2\u5220\u9664'],
	['density', '\u5BC6\u5EA6'],
	['description', '\u63CF\u8FF0'],
	['dimensions', '\u5C3A\u5BF8'],
	['direction', '\u65B9\u5411'],
	['dirty', '\u810F\u6587\u4EF6'],
	['dispatch', '\u5206\u6D3E'],
	['download', '\u4E0B\u8F7D'],
	['draft', '\u8349\u7A3F'],
	['drag', '\u62D6\u52A8'],
	['dropped', '\u5DF2\u62D6\u653E'],
	['editorparts', '\u7F16\u8F91\u5668\u90E8\u4EF6'],
	['endpoint', '\u7AEF\u70B9'],
	['entries', '\u6761\u76EE'],
	['env', '\u73AF\u5883'],
	['exe', '\u53EF\u6267\u884C\u6587\u4EF6'],
	['explain', '\u89E3\u91CA'],
	['exporter', '\u5BFC\u51FA\u5668'],
	['extra', '\u989D\u5916'],
	['foreground', '\u524D\u666F'],
	['goto', '\u8F6C\u5230'],
	['handler', '\u5904\u7406\u7A0B\u5E8F'],
	['horizontal', '\u6C34\u5E73'],
	['inactive', '\u975E\u6D3B\u52A8'],
	['indent', '\u7F29\u8FDB'],
	['inlay', '\u5D4C\u5165\u63D0\u793A'],
	['kerberos', 'Kerberos'],
	['limited', '\u53D7\u9650'],
	['magenta', '\u54C1\u7EA2\u8272'],
	['maximized', '\u6700\u5927\u5316'],
	['namespaces', '\u547D\u540D\u7A7A\u95F4'],
	['navigate', '\u5BFC\u822A'],
	['osx', 'macOS'],
	['otel', 'OTel'],
	['otlp', 'OTLP'],
	['outgoing', '\u4F20\u51FA'],
	['padding', '\u5185\u8FB9\u8DDD'],
	['problems', '\u95EE\u9898'],
	['resource', '\u8D44\u6E90'],
	['selector', '\u9009\u62E9\u5668'],
	['sign', '\u767B\u5F55'],
	['skill', '\u6280\u80FD'],
	['storage', '\u5B58\u50A8'],
	['strict', '\u4E25\u683C'],
	['timeline', '\u65F6\u95F4\u7EBF'],
	['touchbar', '\u89E6\u63A7\u680F'],
	['unc', 'UNC'],
	['unicode', 'Unicode'],
	['untitled', '\u672A\u547D\u540D'],
	['v2', 'V2'],
	['vertical', '\u5782\u76F4'],
	['welcome', '\u6B22\u8FCE'],
	['whitespace', '\u7A7A\u767D'],
	['widget', '\u5C0F\u7EC4\u4EF6'],
	['wrapping', '\u6362\u884C'],
	['yellow', '\u9EC4\u8272'],
	['agentic', '\u667A\u80FD\u4F53\u5316'],
	['approved', '\u5DF2\u6279\u51C6'],
	['field', '\u5B57\u6BB5'],
	['fixes', '\u4FEE\u590D'],
	['folded', '\u5DF2\u6298\u53E0'],
	['folding', '\u6298\u53E0'],
	['force', '\u5F3A\u5236'],
	['fullscreen', '\u5168\u5C4F'],
	['general', '\u5E38\u89C4'],
	['git-cmd', 'Git CMD'],
	['go', '\u8F6C\u5230'],
	['hiding', '\u9690\u85CF'],
	['highlighter', '\u9AD8\u4EAE\u5668'],
	['if', '\u5982\u679C'],
	['implementation', '\u5B9E\u73B0'],
	['implementations', '\u5B9E\u73B0'],
	['incremental', '\u589E\u91CF'],
	['independent', '\u72EC\u7ACB'],
	['ini', 'INI'],
	['inserted', '\u5DF2\u63D2\u5165'],
	['invisible', '\u4E0D\u53EF\u89C1'],
	['kept', '\u5DF2\u4FDD\u7559'],
	['keybindings', '\u952E\u7ED1\u5B9A'],
	['last', '\u6700\u540E'],
	['latency', '\u5EF6\u8FDF'],
	['leading', '\u524D\u5BFC'],
	['level', '\u7EA7\u522B'],
	['lexicographic', '\u5B57\u5178\u5E8F'],
	['lightbulb', '\u706F\u6CE1'],
	['locale', '\u533A\u57DF\u8BBE\u7F6E'],
	['locally', '\u672C\u5730'],
	['lock', '\u9501\u5B9A'],
	['lost', '\u4E22\u5931'],
	['matches', '\u5339\u914D\u9879'],
	['md', 'Markdown'],
	['metadata', '\u5143\u6570\u636E'],
	['mnemonics', '\u52A9\u8BB0\u952E'],
	['more', '\u66F4\u591A'],
	['moving', '\u79FB\u52A8'],
	['multi', '\u591A\u5149\u6807'],
	['naming', '\u547D\u540D'],
	['nearby', '\u9644\u8FD1'],
	['of', '\u7684'],
	['onboarding', '\u5165\u95E8\u5F15\u5BFC'],
	['optimizations', '\u4F18\u5316'],
	['optimized', '\u5DF2\u4F18\u5316'],
	['or', '\u6216'],
	['organizations', '\u7EC4\u7EC7'],
	['out', '\u9000\u51FA'],
	['outfile', '\u8F93\u51FA\u6587\u4EF6'],
	['override', '\u8986\u76D6'],
	['partial', '\u90E8\u5206'],
	['peek', '\u901F\u89C8'],
	['performance', '\u6027\u80FD'],
	['pool', '\u6C60'],
	['positioning', '\u5B9A\u4F4D'],
	['press', '\u6309\u4E0B'],
	['probability', '\u6982\u7387'],
	['profiling', '\u5206\u6790'],
	['quietly', '\u9759\u9ED8'],
	['read', '\u8BFB\u53D6'],
	['received', '\u5DF2\u6536\u5230'],
	['removal', '\u79FB\u9664'],
	['renderer', '\u6E32\u67D3\u5668'],
	['reporter', '\u62A5\u544A\u5668'],
	['required', '\u5FC5\u9700'],
	['reroute', '\u91CD\u65B0\u8DEF\u7531'],
	['resize', '\u8C03\u6574\u5927\u5C0F'],
	['restrict', '\u9650\u5236'],
	['retry', '\u91CD\u8BD5'],
	['reverse', '\u53CD\u5411'],
	['row', '\u884C'],
	['run-in-new-chat', '\u5728\u65B0\u804A\u5929\u4E2D\u8FD0\u884C'],
	['sampling', '\u91C7\u6837'],
	['scope', '\u8303\u56F4'],
	['selected', '\u5DF2\u9009\u62E9'],
	['sent', '\u5DF2\u53D1\u9001'],
	['separate', '\u5355\u72EC'],
	['shared', '\u5171\u4EAB'],
	['skip', '\u8DF3\u8FC7'],
	['stable', '\u7A33\u5B9A'],
	['started', '\u5DF2\u5F00\u59CB'],
	['stopped', '\u5DF2\u505C\u6B62'],
	['store', '\u5B58\u50A8'],
	['strategy', '\u7B56\u7565'],
	['subwords', '\u5B50\u8BCD'],
	['succeeded', '\u6210\u529F'],
	['swipe', '\u6ED1\u52A8'],
	['switch', '\u5207\u6362'],
	['taskkill', '\u7ED3\u675F\u4EFB\u52A1'],
	['thinking', '\u601D\u8003'],
	['through', '\u7A7F\u900F'],
	['toc', '\u76EE\u5F55'],
	['todo', '\u5F85\u529E'],
	['transparency', '\u900F\u660E\u5EA6'],
	['triggered', '\u5DF2\u89E6\u53D1'],
	['underline', '\u4E0B\u5212\u7EBF'],
	['undone', '\u5DF2\u64A4\u9500'],
	['unification', '\u7EDF\u4E00'],
	['upgrade', '\u5347\u7EA7'],
	['upvote', '\u70B9\u8D5E'],
	['verbose', '\u8BE6\u7EC6'],
	['verification', '\u9A8C\u8BC1'],
	['virtual', '\u865A\u62DF'],
	['volume', '\u97F3\u91CF'],
	['watch', '\u76D1\u89C6'],
	['without', '\u4E0D\u5E26'],
	['worker', '\u5DE5\u4F5C\u7EBF\u7A0B'],
	['zen', 'Zen'],
	['zoom', '\u7F29\u653E']
]);

export function settingKeyToDisplayFormat(key: string, groupId: string = '', isLanguageTagSetting: boolean = false): { category: string; label: string } {
	const override = SETTING_DISPLAY_OVERRIDES.get(key);
	if (override) {
		return override;
	}

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
		key = getLanguageTagSettingPlainKey(key);
		key = '$(bracket) ' + key;
	}

	const label = wordifyKey(key);
	return { category, label };
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

// The values of the following settings when a default values has been removed
export function objectSettingSupportsRemoveDefaultValue(key: string): boolean {
	return key === 'workbench.editor.customLabels.patterns';
}

function isSimpleType(type: string | undefined): boolean {
	return type === 'string' || type === 'boolean' || type === 'integer' || type === 'number';
}

function getObjectRenderableSchemaType(schema: IJSONSchema, key: string): 'simple' | 'complex' | false {
	const { type } = schema;

	if (Array.isArray(type)) {
		if (objectSettingSupportsRemoveDefaultValue(key) && type.length === 2) {
			if (type.includes('null') && (type.includes('string') || type.includes('boolean') || type.includes('integer') || type.includes('number'))) {
				return 'simple';
			}
		}

		for (const t of type) {
			if (!isSimpleType(t)) {
				return false;
			}
		}
		return 'complex';
	}

	if (isSimpleType(type)) {
		return 'simple';
	}

	if (type === 'array') {
		if (schema.items) {
			const itemSchemas = Array.isArray(schema.items) ? schema.items : [schema.items];
			for (const { type } of itemSchemas) {
				if (Array.isArray(type)) {
					for (const t of type) {
						if (!isSimpleType(t)) {
							return false;
						}
					}
					return 'complex';
				}
				if (!isSimpleType(type)) {
					return false;
				}
				return 'complex';
			}
		}
		return false;
	}

	return false;
}

function getObjectSettingSchemaType({
	key,
	type,
	objectProperties,
	objectPatternProperties,
	objectAdditionalProperties
}: ISetting): 'simple' | 'complex' | false {
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

	let schemaType: 'simple' | 'complex' | false = 'simple';
	for (const schema of schemas) {
		for (const subSchema of Array.isArray(schema.anyOf) ? schema.anyOf : [schema]) {
			const subSchemaType = getObjectRenderableSchemaType(subSchema, key);
			if (subSchemaType === false) {
				return false;
			}
			if (subSchemaType === 'complex') {
				schemaType = 'complex';
			}
		}
	}

	return schemaType;
}

function settingTypeEnumRenderable(_type: string | string[]) {
	const enumRenderableSettingTypes = ['string', 'boolean', 'null', 'integer', 'number'];
	const type = Array.isArray(_type) ? _type : [_type];
	return type.every(type => enumRenderableSettingTypes.includes(type));
}

export const enum SearchResultIdx {
	Local = 0,
	Remote = 1,
	NewExtensions = 2,
	Embeddings = 3,
	AiSelected = 4
}

export class SearchResultModel extends SettingsTreeModel {
	private rawSearchResults: ISearchResult[] | null = null;
	private cachedUniqueSearchResults: Map<boolean, ISearchResult | null>;
	private newExtensionSearchResults: ISearchResult | null = null;
	private searchResultCount: number | null = null;
	private settingsOrderByTocIndex: Map<string, number> | null;
	private aiFilterEnabled: boolean = false;

	readonly id = 'searchResultModel';

	constructor(
		viewState: ISettingsEditorViewState,
		settingsOrderByTocIndex: Map<string, number> | null,
		isWorkspaceTrusted: boolean,
		@IWorkbenchConfigurationService configurationService: IWorkbenchConfigurationService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@ILanguageService languageService: ILanguageService,
		@IUserDataProfileService userDataProfileService: IUserDataProfileService,
		@IProductService productService: IProductService
	) {
		super(viewState, isWorkspaceTrusted, configurationService, languageService, userDataProfileService, productService, environmentService);
		this.settingsOrderByTocIndex = settingsOrderByTocIndex;
		this.cachedUniqueSearchResults = new Map();
		this.update({ id: 'searchResultModel', label: '' });
	}

	set showAiResults(show: boolean) {
		this.aiFilterEnabled = show;
		this.updateChildren();
	}

	private sortResults(filterMatches: ISettingMatch[]): ISettingMatch[] {
		if (this.settingsOrderByTocIndex) {
			for (const match of filterMatches) {
				match.setting.internalOrder = this.settingsOrderByTocIndex.get(match.setting.key);
			}
		}

		// The search only has filters, so we can sort by the order in the TOC.
		if (!this._viewState.query) {
			return filterMatches.sort((a, b) => compareTwoNullableNumbers(a.setting.internalOrder, b.setting.internalOrder));
		}

		// Sort the settings according to their relevancy.
		// https://github.com/microsoft/vscode/issues/197773
		filterMatches.sort((a, b) => {
			if (a.matchType !== b.matchType) {
				// Sort by match type if the match types are not the same.
				// The priority of the match type is given by the SettingMatchType enum.
				return b.matchType - a.matchType;
			} else if ((a.matchType & SettingMatchType.NonContiguousWordsInSettingsLabel) || (a.matchType & SettingMatchType.ContiguousWordsInSettingsLabel)) {
				// The match types of a and b are the same and can be sorted by their number of matched words.
				// If those numbers are the same, sort by the order in the table of contents.
				return (b.keyMatchScore - a.keyMatchScore) || compareTwoNullableNumbers(a.setting.internalOrder, b.setting.internalOrder);
			} else if (a.matchType === SettingMatchType.RemoteMatch) {
				// The match types are the same and are RemoteMatch.
				// Sort by score.
				return b.score - a.score;
			} else {
				// The match types are the same but are not RemoteMatch.
				// Sort by their order in the table of contents.
				return compareTwoNullableNumbers(a.setting.internalOrder, b.setting.internalOrder);
			}
		});

		// Remove duplicates, which sometimes occur with settings
		// such as the experimental toggle setting.
		return arrays.distinct(filterMatches, (match) => match.setting.key);
	}

	getUniqueSearchResults(): ISearchResult | null {
		const cachedResults = this.cachedUniqueSearchResults.get(this.aiFilterEnabled);
		if (cachedResults) {
			return cachedResults;
		}

		if (!this.rawSearchResults) {
			return null;
		}

		let combinedFilterMatches: ISettingMatch[] = [];

		if (this.aiFilterEnabled) {
			const aiSelectedKeys = new Set<string>();
			const aiSelectedResult = this.rawSearchResults[SearchResultIdx.AiSelected];
			if (aiSelectedResult) {
				aiSelectedResult.filterMatches.forEach(m => aiSelectedKeys.add(m.setting.key));
				combinedFilterMatches = aiSelectedResult.filterMatches;
			}

			const embeddingsResult = this.rawSearchResults[SearchResultIdx.Embeddings];
			if (embeddingsResult) {
				embeddingsResult.filterMatches = embeddingsResult.filterMatches.filter(m => !aiSelectedKeys.has(m.setting.key));
				combinedFilterMatches = combinedFilterMatches.concat(embeddingsResult.filterMatches);
			}
			const result = {
				filterMatches: combinedFilterMatches,
				exactMatch: false
			};
			this.cachedUniqueSearchResults.set(true, result);
			return result;
		}

		const localMatchKeys = new Set<string>();
		const localResult = this.rawSearchResults[SearchResultIdx.Local];
		if (localResult) {
			localResult.filterMatches.forEach(m => localMatchKeys.add(m.setting.key));
			combinedFilterMatches = localResult.filterMatches;
		}

		const remoteResult = this.rawSearchResults[SearchResultIdx.Remote];
		if (remoteResult) {
			remoteResult.filterMatches = remoteResult.filterMatches.filter(m => !localMatchKeys.has(m.setting.key));
			combinedFilterMatches = combinedFilterMatches.concat(remoteResult.filterMatches);

			this.newExtensionSearchResults = this.rawSearchResults[SearchResultIdx.NewExtensions];
		}
		combinedFilterMatches = this.sortResults(combinedFilterMatches);
		const result = {
			filterMatches: combinedFilterMatches,
			exactMatch: localResult.exactMatch // remote results should never have an exact match
		};
		this.cachedUniqueSearchResults.set(false, result);
		return result;
	}

	getRawResults(): ISearchResult[] {
		return this.rawSearchResults ?? [];
	}

	private getUniqueSearchResultSettings(): ISetting[] {
		return this.getUniqueSearchResults()?.filterMatches.map(m => m.setting) ?? [];
	}

	updateChildren(): void {
		this.update({
			id: 'searchResultModel',
			label: 'searchResultModel',
			settings: this.getUniqueSearchResultSettings()
		});

		// Save time by filtering children in the search model instead of relying on the tree filter, which still requires heights to be calculated.
		const isRemote = !!this.environmentService.remoteAuthority;

		const newChildren = [];
		for (const child of this.root.children) {
			if (child instanceof SettingsTreeSettingElement
				&& child.matchesAllTags(this._viewState.tagFilters)
				&& child.matchesScope(this._viewState.settingsTarget, isRemote)
				&& child.matchesAnyExtension(this._viewState.extensionFilters)
				&& child.matchesAnyId(this._viewState.idFilters)
				&& child.matchesAnyFeature(this._viewState.featureFilters)
				&& child.matchesAllLanguages(this._viewState.languageFilter)) {
				newChildren.push(child);
			} else {
				child.dispose();
			}
		}
		this.root.children = newChildren;
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

	setResult(order: SearchResultIdx, result: ISearchResult | null): void {
		this.cachedUniqueSearchResults.clear();
		this.newExtensionSearchResults = null;

		if (this.rawSearchResults && order === SearchResultIdx.Local) {
			// To prevent the Settings editor from showing
			// stale remote results mid-search.
			delete this.rawSearchResults[SearchResultIdx.Remote];
		}

		this.rawSearchResults ??= [];
		if (!result) {
			delete this.rawSearchResults[order];
			return;
		}

		this.rawSearchResults[order] = result;
		this.updateChildren();
	}

	getUniqueResultsCount(): number {
		return this.searchResultCount ?? 0;
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

	query = query.replace(`@${AGENTS_WINDOW_SETTING_TAG}`, () => {
		tags.push(AGENTS_WINDOW_SETTING_TAG);
		return '';
	});

	// Handle @stable by excluding preview and experimental tags
	query = query.replace(/@stable/g, () => {
		tags.push('stable');
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
