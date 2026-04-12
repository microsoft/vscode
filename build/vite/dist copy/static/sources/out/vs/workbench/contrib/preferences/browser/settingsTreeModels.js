/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import * as arrays from '../../../../base/common/arrays.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { escapeRegExpCharacters, isFalsyOrWhitespace } from '../../../../base/common/strings.js';
import { isUndefinedOrNull } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { getLanguageTagSettingPlainKey } from '../../../../platform/configuration/common/configuration.js';
import { EditPresentationTypes, Extensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { USER_LOCAL_AND_REMOTE_SETTINGS } from '../../../../platform/request/common/request.js';
import { APPLICATION_SCOPES, FOLDER_SCOPES, IWorkbenchConfigurationService, LOCAL_MACHINE_SCOPES, REMOTE_MACHINE_SCOPES, WORKSPACE_SCOPES } from '../../../services/configuration/common/configuration.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { SettingMatchType, SettingValueType } from '../../../services/preferences/common/preferences.js';
import { IUserDataProfileService } from '../../../services/userDataProfile/common/userDataProfile.js';
import { ENABLE_EXTENSION_TOGGLE_SETTINGS, ENABLE_LANGUAGE_FILTER, MODIFIED_SETTING_TAG, POLICY_SETTING_TAG, REQUIRE_TRUSTED_WORKSPACE_SETTING_TAG, compareTwoNullableNumbers, wordifyKey } from '../common/preferences.js';
import { tocData } from './settingsLayout.js';
export const ONLINE_SERVICES_SETTING_TAG = 'usesOnlineServices';
export class SettingsTreeElement extends Disposable {
    get onDidChangeTabbable() { return this._onDidChangeTabbable.event; }
    constructor(_id) {
        super();
        this._tabbable = false;
        this._onDidChangeTabbable = this._register(new Emitter());
        this.id = _id;
    }
    get tabbable() {
        return this._tabbable;
    }
    set tabbable(value) {
        this._tabbable = value;
        this._onDidChangeTabbable.fire();
    }
}
export class SettingsTreeGroupElement extends SettingsTreeElement {
    get children() {
        return this._children;
    }
    set children(newChildren) {
        this._children = newChildren;
        this._childSettingKeys = new Set();
        this._children.forEach(child => {
            if (child instanceof SettingsTreeSettingElement) {
                this._childSettingKeys.add(child.setting.key);
            }
        });
    }
    constructor(_id, count, label, level, isFirstGroup) {
        super(_id);
        this._childSettingKeys = new Set();
        this._children = [];
        this.count = count;
        this.label = label;
        this.level = level;
        this.isFirstGroup = isFirstGroup;
    }
    /**
     * Returns whether this group contains the given child key (to a depth of 1 only)
     */
    containsSetting(key) {
        return this._childSettingKeys.has(key);
    }
}
export class SettingsTreeNewExtensionsElement extends SettingsTreeElement {
    constructor(_id, extensionIds) {
        super(_id);
        this.extensionIds = extensionIds;
    }
}
export class SettingsTreeSettingElement extends SettingsTreeElement {
    static { this.MAX_DESC_LINES = 20; }
    constructor(setting, parent, settingsTarget, isWorkspaceTrusted, languageFilter, languageService, productService, userDataProfileService, configurationService) {
        super(sanitizeId(parent.id + '_' + setting.key));
        this.settingsTarget = settingsTarget;
        this.isWorkspaceTrusted = isWorkspaceTrusted;
        this.languageFilter = languageFilter;
        this.languageService = languageService;
        this.productService = productService;
        this.userDataProfileService = userDataProfileService;
        this.configurationService = configurationService;
        this._displayCategory = null;
        this._displayLabel = null;
        /**
         * Whether the setting is configured in the selected scope.
         */
        this.isConfigured = false;
        /**
         * Whether the setting requires trusted target
         */
        this.isUntrusted = false;
        /**
         * Whether the setting is under a policy that blocks all changes.
         */
        this.hasPolicyValue = false;
        this.overriddenScopeList = [];
        this.overriddenDefaultsLanguageList = [];
        /**
         * For each language that contributes setting values or default overrides, we can see those values here.
         */
        this.languageOverrideValues = new Map();
        this.setting = setting;
        this.parent = parent;
        // Make sure description and valueType are initialized
        this.initSettingDescription();
        this.initSettingValueType();
    }
    get displayCategory() {
        if (!this._displayCategory) {
            this.initLabels();
        }
        return this._displayCategory;
    }
    get displayLabel() {
        if (!this._displayLabel) {
            this.initLabels();
        }
        return this._displayLabel;
    }
    initLabels() {
        if (this.setting.title) {
            this._displayLabel = this.setting.title;
            this._displayCategory = this.setting.categoryLabel ?? null;
            return;
        }
        const displayKeyFormat = settingKeyToDisplayFormat(this.setting.key, this.parent.id, this.setting.isLanguageTagSetting);
        this._displayLabel = displayKeyFormat.label;
        this._displayCategory = displayKeyFormat.category;
    }
    initSettingDescription() {
        if (this.setting.description.length > SettingsTreeSettingElement.MAX_DESC_LINES) {
            const truncatedDescLines = this.setting.description.slice(0, SettingsTreeSettingElement.MAX_DESC_LINES);
            truncatedDescLines.push('[...]');
            this.description = truncatedDescLines.join('\n');
        }
        else {
            this.description = this.setting.description.join('\n');
        }
    }
    initSettingValueType() {
        if (isExtensionToggleSetting(this.setting, this.productService)) {
            this.valueType = SettingValueType.ExtensionToggle;
        }
        else if (this.setting.enum && (!this.setting.type || settingTypeEnumRenderable(this.setting.type))) {
            this.valueType = SettingValueType.Enum;
        }
        else if (this.setting.type === 'string') {
            if (this.setting.editPresentation === EditPresentationTypes.Multiline) {
                this.valueType = SettingValueType.MultilineString;
            }
            else {
                this.valueType = SettingValueType.String;
            }
        }
        else if (isExcludeSetting(this.setting)) {
            this.valueType = SettingValueType.Exclude;
        }
        else if (isIncludeSetting(this.setting)) {
            this.valueType = SettingValueType.Include;
        }
        else if (this.setting.type === 'integer') {
            this.valueType = SettingValueType.Integer;
        }
        else if (this.setting.type === 'number') {
            this.valueType = SettingValueType.Number;
        }
        else if (this.setting.type === 'boolean') {
            this.valueType = SettingValueType.Boolean;
        }
        else if (this.setting.type === 'array' && this.setting.arrayItemType &&
            ['string', 'enum', 'number', 'integer'].includes(this.setting.arrayItemType)) {
            this.valueType = SettingValueType.Array;
        }
        else if (Array.isArray(this.setting.type) && this.setting.type.includes(SettingValueType.Null) && this.setting.type.length === 2) {
            if (this.setting.type.includes(SettingValueType.Integer)) {
                this.valueType = SettingValueType.NullableInteger;
            }
            else if (this.setting.type.includes(SettingValueType.Number)) {
                this.valueType = SettingValueType.NullableNumber;
            }
            else {
                this.valueType = SettingValueType.Complex;
            }
        }
        else {
            const schemaType = getObjectSettingSchemaType(this.setting);
            if (schemaType) {
                if (this.setting.allKeysAreBoolean) {
                    this.valueType = SettingValueType.BooleanObject;
                }
                else if (schemaType === 'simple') {
                    this.valueType = SettingValueType.Object;
                }
                else {
                    this.valueType = SettingValueType.ComplexObject;
                }
            }
            else if (this.setting.isLanguageTagSetting) {
                this.valueType = SettingValueType.LanguageTag;
            }
            else {
                this.valueType = SettingValueType.Complex;
            }
        }
    }
    inspectSelf() {
        const targetToInspect = this.getTargetToInspect(this.setting);
        const inspectResult = inspectSetting(this.setting.key, targetToInspect, this.languageFilter, this.configurationService);
        this.update(inspectResult, this.isWorkspaceTrusted);
    }
    getTargetToInspect(setting) {
        if (!this.userDataProfileService.currentProfile.isDefault && !this.userDataProfileService.currentProfile.useDefaultFlags?.settings) {
            if (setting.scope === 1 /* ConfigurationScope.APPLICATION */) {
                return 1 /* ConfigurationTarget.APPLICATION */;
            }
            if (this.configurationService.isSettingAppliedForAllProfiles(setting.key) && this.settingsTarget === 3 /* ConfigurationTarget.USER_LOCAL */) {
                return 1 /* ConfigurationTarget.APPLICATION */;
            }
        }
        return this.settingsTarget;
    }
    update(inspectResult, isWorkspaceTrusted) {
        let { isConfigured, inspected, targetSelector, inspectedLanguageOverrides, languageSelector } = inspectResult;
        switch (targetSelector) {
            case 'workspaceFolderValue':
            case 'workspaceValue':
                this.isUntrusted = !!this.setting.restricted && !isWorkspaceTrusted;
                break;
        }
        let displayValue = isConfigured ? inspected[targetSelector] : inspected.defaultValue;
        const overriddenScopeList = [];
        const overriddenDefaultsLanguageList = [];
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
        }
        else if (languageSelector && this.languageOverrideValues.has(languageSelector)) {
            const overrideValues = this.languageOverrideValues.get(languageSelector);
            // In the worst case, go back to using the previous display value.
            // Also, sometimes the override is in the form of a default value override, so consider that second.
            displayValue = (isConfigured ? overrideValues[targetSelector] : overrideValues.defaultValue) ?? displayValue;
            this.scopeValue = isConfigured && overrideValues[targetSelector];
            this.defaultValue = overrideValues.defaultValue ?? inspected.defaultValue;
            const registryValues = Registry.as(Extensions.Configuration).getConfigurationDefaultsOverrides();
            const source = registryValues.get(`[${languageSelector}]`)?.source;
            const overrideValueSource = source instanceof Map ? source.get(this.setting.key) : undefined;
            if (overrideValueSource) {
                this.defaultValueSource = overrideValueSource;
            }
        }
        else {
            this.scopeValue = isConfigured && inspected[targetSelector];
            this.defaultValue = inspected.defaultValue;
        }
        this.value = displayValue;
        this.isConfigured = isConfigured;
        if (isConfigured || this.setting.tags || this.tags || this.setting.restricted || this.hasPolicyValue) {
            // Don't create an empty Set for all 1000 settings, only if needed
            this.tags = new Set();
            if (isConfigured) {
                this.tags.add(MODIFIED_SETTING_TAG);
            }
            this.setting.tags?.forEach(tag => this.tags.add(tag));
            if (this.setting.restricted) {
                this.tags.add(REQUIRE_TRUSTED_WORKSPACE_SETTING_TAG);
            }
            if (this.hasPolicyValue) {
                this.tags.add(POLICY_SETTING_TAG);
            }
        }
    }
    matchesAllTags(tagFilters) {
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
                Array.from(otherFilters).every(tag => this.tags.has(tag));
        }
        // Check that the filter tags are a subset of this setting's tags
        return !!this.tags?.size &&
            Array.from(tagFilters).every(tag => this.tags.has(tag));
    }
    matchesScope(scope, isRemote) {
        const configTarget = URI.isUri(scope) ? 6 /* ConfigurationTarget.WORKSPACE_FOLDER */ : scope;
        if (!this.setting.scope) {
            return true;
        }
        if (configTarget === 1 /* ConfigurationTarget.APPLICATION */) {
            return APPLICATION_SCOPES.includes(this.setting.scope);
        }
        if (configTarget === 6 /* ConfigurationTarget.WORKSPACE_FOLDER */) {
            return FOLDER_SCOPES.includes(this.setting.scope);
        }
        if (configTarget === 5 /* ConfigurationTarget.WORKSPACE */) {
            return WORKSPACE_SCOPES.includes(this.setting.scope);
        }
        if (configTarget === 4 /* ConfigurationTarget.USER_REMOTE */) {
            return REMOTE_MACHINE_SCOPES.includes(this.setting.scope) || USER_LOCAL_AND_REMOTE_SETTINGS.includes(this.setting.key);
        }
        if (configTarget === 3 /* ConfigurationTarget.USER_LOCAL */) {
            if (isRemote) {
                return LOCAL_MACHINE_SCOPES.includes(this.setting.scope) || USER_LOCAL_AND_REMOTE_SETTINGS.includes(this.setting.key);
            }
        }
        return true;
    }
    matchesAnyExtension(extensionFilters) {
        if (!extensionFilters || !extensionFilters.size) {
            return true;
        }
        if (!this.setting.extensionInfo) {
            return false;
        }
        return Array.from(extensionFilters).some(extensionId => extensionId.toLowerCase() === this.setting.extensionInfo.id.toLowerCase());
    }
    matchesAnyFeature(featureFilters) {
        if (!featureFilters || !featureFilters.size) {
            return true;
        }
        // Restrict to core settings
        if (this.setting.extensionInfo) {
            return false;
        }
        // Chat settings are now in their own top-level category
        if (featureFilters.has('chat')) {
            const chatFeatures = tocData.children.find(child => child.id === 'chat');
            if (chatFeatures?.children) {
                const patterns = chatFeatures.children
                    .flatMap(feature => feature.settings ?? [])
                    .map(setting => createSettingMatchRegExp(setting));
                if (patterns.some(pattern => pattern.test(this.setting.key))) {
                    return true;
                }
            }
        }
        const features = tocData.children.find(child => child.id === 'features');
        return Array.from(featureFilters).some(filter => {
            if (features?.children) {
                const feature = features.children.find(feature => 'features/' + filter === feature.id);
                if (feature?.settings) {
                    const patterns = feature.settings.map(setting => createSettingMatchRegExp(setting));
                    return patterns.some(pattern => pattern.test(this.setting.key));
                }
                else {
                    return false;
                }
            }
            else {
                return false;
            }
        });
    }
    matchesAnyId(idFilters) {
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
    matchesAllLanguages(languageFilter) {
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
        if (this.setting.scope === 6 /* ConfigurationScope.LANGUAGE_OVERRIDABLE */) {
            return true;
        }
        return false;
    }
}
function createSettingMatchRegExp(pattern) {
    pattern = escapeRegExpCharacters(pattern)
        .replace(/\\\*/g, '.*');
    return new RegExp(`^${pattern}$`, 'i');
}
let SettingsTreeModel = class SettingsTreeModel {
    constructor(_viewState, _isWorkspaceTrusted, _configurationService, _languageService, _userDataProfileService, _productService) {
        this._viewState = _viewState;
        this._isWorkspaceTrusted = _isWorkspaceTrusted;
        this._configurationService = _configurationService;
        this._languageService = _languageService;
        this._userDataProfileService = _userDataProfileService;
        this._productService = _productService;
        this._treeElementsBySettingName = new Map();
    }
    get root() {
        return this._root;
    }
    update(newTocRoot = this._tocRoot) {
        this._treeElementsBySettingName.clear();
        const newRoot = this.createSettingsTreeGroupElement(newTocRoot);
        if (newRoot.children[0] instanceof SettingsTreeGroupElement) {
            newRoot.children[0].isFirstGroup = true;
        }
        if (this._root) {
            this.disposeChildren(this._root.children);
            this._root.children = newRoot.children;
            newRoot.dispose();
        }
        else {
            this._root = newRoot;
        }
    }
    updateWorkspaceTrust(workspaceTrusted) {
        this._isWorkspaceTrusted = workspaceTrusted;
        this.updateRequireTrustedTargetElements();
    }
    disposeChildren(children) {
        for (const child of children) {
            this.disposeChildAndRecurse(child);
        }
    }
    disposeChildAndRecurse(element) {
        if (element instanceof SettingsTreeGroupElement) {
            this.disposeChildren(element.children);
        }
        element.dispose();
    }
    getElementsByName(name) {
        return this._treeElementsBySettingName.get(name) ?? null;
    }
    updateElementsByName(name) {
        if (!this._treeElementsBySettingName.has(name)) {
            return;
        }
        this.reinspectSettings(this._treeElementsBySettingName.get(name));
    }
    updateRequireTrustedTargetElements() {
        this.reinspectSettings([...this._treeElementsBySettingName.values()].flat().filter(s => s.isUntrusted));
    }
    reinspectSettings(settings) {
        for (const element of settings) {
            element.inspectSelf();
        }
    }
    createSettingsTreeGroupElement(tocEntry, parent) {
        const depth = parent ? this.getDepth(parent) + 1 : 0;
        const element = new SettingsTreeGroupElement(tocEntry.id, undefined, tocEntry.label, depth, false);
        element.parent = parent;
        const children = [];
        if (tocEntry.settings) {
            const settingChildren = tocEntry.settings.map(s => this.createSettingsTreeSettingElement(s, element));
            for (const child of settingChildren) {
                if (!child.setting.deprecationMessage) {
                    children.push(child);
                }
                else {
                    child.inspectSelf();
                    if (child.isConfigured) {
                        children.push(child);
                    }
                    else {
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
    getDepth(element) {
        if (element.parent) {
            return 1 + this.getDepth(element.parent);
        }
        else {
            return 0;
        }
    }
    createSettingsTreeSettingElement(setting, parent) {
        const element = new SettingsTreeSettingElement(setting, parent, this._viewState.settingsTarget, this._isWorkspaceTrusted, this._viewState.languageFilter, this._languageService, this._productService, this._userDataProfileService, this._configurationService);
        const nameElements = this._treeElementsBySettingName.get(setting.key) ?? [];
        nameElements.push(element);
        this._treeElementsBySettingName.set(setting.key, nameElements);
        return element;
    }
    dispose() {
        this._treeElementsBySettingName.clear();
        this.disposeChildAndRecurse(this._root);
    }
};
SettingsTreeModel = __decorate([
    __param(2, IWorkbenchConfigurationService),
    __param(3, ILanguageService),
    __param(4, IUserDataProfileService),
    __param(5, IProductService)
], SettingsTreeModel);
export { SettingsTreeModel };
export function inspectSetting(key, target, languageFilter, configurationService) {
    const inspectOverrides = URI.isUri(target) ? { resource: target } : undefined;
    const inspected = configurationService.inspect(key, inspectOverrides);
    const targetSelector = target === 1 /* ConfigurationTarget.APPLICATION */ ? 'applicationValue' :
        target === 3 /* ConfigurationTarget.USER_LOCAL */ ? 'userLocalValue' :
            target === 4 /* ConfigurationTarget.USER_REMOTE */ ? 'userRemoteValue' :
                target === 5 /* ConfigurationTarget.WORKSPACE */ ? 'workspaceValue' :
                    'workspaceFolderValue';
    const targetOverrideSelector = target === 1 /* ConfigurationTarget.APPLICATION */ ? 'application' :
        target === 3 /* ConfigurationTarget.USER_LOCAL */ ? 'userLocal' :
            target === 4 /* ConfigurationTarget.USER_REMOTE */ ? 'userRemote' :
                target === 5 /* ConfigurationTarget.WORKSPACE */ ? 'workspace' :
                    'workspaceFolder';
    let isConfigured = typeof inspected[targetSelector] !== 'undefined';
    const overrideIdentifiers = inspected.overrideIdentifiers;
    const inspectedLanguageOverrides = new Map();
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
                const overrideValue = inspectedLanguageOverrides.get(languageFilter)[targetOverrideSelector]?.override;
                if (typeof overrideValue !== 'undefined') {
                    isConfigured = true;
                }
            }
        }
    }
    return { isConfigured, inspected, targetSelector, inspectedLanguageOverrides, languageSelector: languageFilter };
}
export function sanitizeId(id) {
    return id.replace(/[\.\/]/g, '_');
}
export function settingKeyToDisplayFormat(key, groupId = '', isLanguageTagSetting = false) {
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
function trimCategoryForGroup(category, groupId) {
    const doTrim = (forward) => {
        // Remove the Insiders portion if the category doesn't use it.
        if (!/insiders$/i.test(category)) {
            groupId = groupId.replace(/-?insiders$/i, '');
        }
        const parts = groupId.split('.')
            .map(part => {
            // Remove hyphens, but only if that results in a match with the category.
            if (part.replace(/-/g, '').toLowerCase() === category.toLowerCase()) {
                return part.replace(/-/g, '');
            }
            else {
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
            }
            else {
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
function isExtensionToggleSetting(setting, productService) {
    return ENABLE_EXTENSION_TOGGLE_SETTINGS &&
        !!productService.extensionRecommendations &&
        !!setting.displayExtensionId;
}
function isExcludeSetting(setting) {
    return setting.key === 'files.exclude' ||
        setting.key === 'search.exclude' ||
        setting.key === 'workbench.localHistory.exclude' ||
        setting.key === 'explorer.autoRevealExclude' ||
        setting.key === 'files.readonlyExclude' ||
        setting.key === 'files.watcherExclude';
}
function isIncludeSetting(setting) {
    return setting.key === 'files.readonlyInclude';
}
// The values of the following settings when a default values has been removed
export function objectSettingSupportsRemoveDefaultValue(key) {
    return key === 'workbench.editor.customLabels.patterns';
}
function isSimpleType(type) {
    return type === 'string' || type === 'boolean' || type === 'integer' || type === 'number';
}
function getObjectRenderableSchemaType(schema, key) {
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
function getObjectSettingSchemaType({ key, type, objectProperties, objectPatternProperties, objectAdditionalProperties }) {
    if (type !== 'object') {
        return false;
    }
    // object can have any shape
    if (isUndefinedOrNull(objectProperties) &&
        isUndefinedOrNull(objectPatternProperties) &&
        isUndefinedOrNull(objectAdditionalProperties)) {
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
    let schemaType = 'simple';
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
function settingTypeEnumRenderable(_type) {
    const enumRenderableSettingTypes = ['string', 'boolean', 'null', 'integer', 'number'];
    const type = Array.isArray(_type) ? _type : [_type];
    return type.every(type => enumRenderableSettingTypes.includes(type));
}
export var SearchResultIdx;
(function (SearchResultIdx) {
    SearchResultIdx[SearchResultIdx["Local"] = 0] = "Local";
    SearchResultIdx[SearchResultIdx["Remote"] = 1] = "Remote";
    SearchResultIdx[SearchResultIdx["NewExtensions"] = 2] = "NewExtensions";
    SearchResultIdx[SearchResultIdx["Embeddings"] = 3] = "Embeddings";
    SearchResultIdx[SearchResultIdx["AiSelected"] = 4] = "AiSelected";
})(SearchResultIdx || (SearchResultIdx = {}));
let SearchResultModel = class SearchResultModel extends SettingsTreeModel {
    constructor(viewState, settingsOrderByTocIndex, isWorkspaceTrusted, configurationService, environmentService, languageService, userDataProfileService, productService) {
        super(viewState, isWorkspaceTrusted, configurationService, languageService, userDataProfileService, productService);
        this.environmentService = environmentService;
        this.rawSearchResults = null;
        this.newExtensionSearchResults = null;
        this.searchResultCount = null;
        this.aiFilterEnabled = false;
        this.id = 'searchResultModel';
        this.settingsOrderByTocIndex = settingsOrderByTocIndex;
        this.cachedUniqueSearchResults = new Map();
        this.update({ id: 'searchResultModel', label: '' });
    }
    set showAiResults(show) {
        this.aiFilterEnabled = show;
        this.updateChildren();
    }
    sortResults(filterMatches) {
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
            }
            else if ((a.matchType & SettingMatchType.NonContiguousWordsInSettingsLabel) || (a.matchType & SettingMatchType.ContiguousWordsInSettingsLabel)) {
                // The match types of a and b are the same and can be sorted by their number of matched words.
                // If those numbers are the same, sort by the order in the table of contents.
                return (b.keyMatchScore - a.keyMatchScore) || compareTwoNullableNumbers(a.setting.internalOrder, b.setting.internalOrder);
            }
            else if (a.matchType === SettingMatchType.RemoteMatch) {
                // The match types are the same and are RemoteMatch.
                // Sort by score.
                return b.score - a.score;
            }
            else {
                // The match types are the same but are not RemoteMatch.
                // Sort by their order in the table of contents.
                return compareTwoNullableNumbers(a.setting.internalOrder, b.setting.internalOrder);
            }
        });
        // Remove duplicates, which sometimes occur with settings
        // such as the experimental toggle setting.
        return arrays.distinct(filterMatches, (match) => match.setting.key);
    }
    getUniqueSearchResults() {
        const cachedResults = this.cachedUniqueSearchResults.get(this.aiFilterEnabled);
        if (cachedResults) {
            return cachedResults;
        }
        if (!this.rawSearchResults) {
            return null;
        }
        let combinedFilterMatches = [];
        if (this.aiFilterEnabled) {
            const aiSelectedKeys = new Set();
            const aiSelectedResult = this.rawSearchResults[4 /* SearchResultIdx.AiSelected */];
            if (aiSelectedResult) {
                aiSelectedResult.filterMatches.forEach(m => aiSelectedKeys.add(m.setting.key));
                combinedFilterMatches = aiSelectedResult.filterMatches;
            }
            const embeddingsResult = this.rawSearchResults[3 /* SearchResultIdx.Embeddings */];
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
        const localMatchKeys = new Set();
        const localResult = this.rawSearchResults[0 /* SearchResultIdx.Local */];
        if (localResult) {
            localResult.filterMatches.forEach(m => localMatchKeys.add(m.setting.key));
            combinedFilterMatches = localResult.filterMatches;
        }
        const remoteResult = this.rawSearchResults[1 /* SearchResultIdx.Remote */];
        if (remoteResult) {
            remoteResult.filterMatches = remoteResult.filterMatches.filter(m => !localMatchKeys.has(m.setting.key));
            combinedFilterMatches = combinedFilterMatches.concat(remoteResult.filterMatches);
            this.newExtensionSearchResults = this.rawSearchResults[2 /* SearchResultIdx.NewExtensions */];
        }
        combinedFilterMatches = this.sortResults(combinedFilterMatches);
        const result = {
            filterMatches: combinedFilterMatches,
            exactMatch: localResult.exactMatch // remote results should never have an exact match
        };
        this.cachedUniqueSearchResults.set(false, result);
        return result;
    }
    getRawResults() {
        return this.rawSearchResults ?? [];
    }
    getUniqueSearchResultSettings() {
        return this.getUniqueSearchResults()?.filterMatches.map(m => m.setting) ?? [];
    }
    updateChildren() {
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
            }
            else {
                child.dispose();
            }
        }
        this.root.children = newChildren;
        this.searchResultCount = this.root.children.length;
        if (this.newExtensionSearchResults?.filterMatches.length) {
            let resultExtensionIds = this.newExtensionSearchResults.filterMatches
                .map(result => result.setting)
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
    setResult(order, result) {
        this.cachedUniqueSearchResults.clear();
        this.newExtensionSearchResults = null;
        if (this.rawSearchResults && order === 0 /* SearchResultIdx.Local */) {
            // To prevent the Settings editor from showing
            // stale remote results mid-search.
            delete this.rawSearchResults[1 /* SearchResultIdx.Remote */];
        }
        this.rawSearchResults ??= [];
        if (!result) {
            delete this.rawSearchResults[order];
            return;
        }
        this.rawSearchResults[order] = result;
        this.updateChildren();
    }
    getUniqueResultsCount() {
        return this.searchResultCount ?? 0;
    }
};
SearchResultModel = __decorate([
    __param(3, IWorkbenchConfigurationService),
    __param(4, IWorkbenchEnvironmentService),
    __param(5, ILanguageService),
    __param(6, IUserDataProfileService),
    __param(7, IProductService)
], SearchResultModel);
export { SearchResultModel };
const tagRegex = /(^|\s)@tag:("([^"]*)"|[^"]\S*)/g;
const extensionRegex = /(^|\s)@ext:("([^"]*)"|[^"]\S*)?/g;
const featureRegex = /(^|\s)@feature:("([^"]*)"|[^"]\S*)?/g;
const idRegex = /(^|\s)@id:("([^"]*)"|[^"]\S*)?/g;
const languageRegex = /(^|\s)@lang:("([^"]*)"|[^"]\S*)?/g;
export function parseQuery(query) {
    /**
     * A helper function to parse the query on one type of regex.
     *
     * @param query The search query
     * @param filterRegex The regex to use on the query
     * @param parsedParts The parts that the regex parses out will be appended to the array passed in here.
     * @returns The query with the parsed parts removed
     */
    function getTagsForType(query, filterRegex, parsedParts) {
        return query.replace(filterRegex, (_, __, quotedParsedElement, unquotedParsedElement) => {
            const parsedElement = unquotedParsedElement || quotedParsedElement;
            if (parsedElement) {
                parsedParts.push(...parsedElement.split(',').map(s => s.trim()).filter(s => !isFalsyOrWhitespace(s)));
            }
            return '';
        });
    }
    const tags = [];
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
    // Handle @stable by excluding preview and experimental tags
    query = query.replace(/@stable/g, () => {
        tags.push('stable');
        return '';
    });
    const extensions = [];
    const features = [];
    const ids = [];
    const langs = [];
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2V0dGluZ3NUcmVlTW9kZWxzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvcHJlZmVyZW5jZXMvYnJvd3Nlci9zZXR0aW5nc1RyZWVNb2RlbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLE1BQU0sTUFBTSxtQ0FBbUMsQ0FBQztBQUM1RCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFM0QsT0FBTyxFQUFFLFVBQVUsRUFBZSxNQUFNLHNDQUFzQyxDQUFDO0FBQy9FLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxtQkFBbUIsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ2pHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNyRCxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUNuRixPQUFPLEVBQXVCLDZCQUE2QixFQUF1QixNQUFNLDREQUE0RCxDQUFDO0FBQ3JKLE9BQU8sRUFBdUQscUJBQXFCLEVBQUUsVUFBVSxFQUEwQixNQUFNLG9FQUFvRSxDQUFDO0FBQ3BNLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUN4RixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDNUUsT0FBTyxFQUFFLDhCQUE4QixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDaEcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLGFBQWEsRUFBRSw4QkFBOEIsRUFBRSxvQkFBb0IsRUFBRSxxQkFBcUIsRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQzNNLE9BQU8sRUFBRSw0QkFBNEIsRUFB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