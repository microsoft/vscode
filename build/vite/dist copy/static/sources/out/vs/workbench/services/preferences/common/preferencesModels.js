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
import { coalesce } from '../../../../base/common/arrays.js';
import { Emitter } from '../../../../base/common/event.js';
import { visit } from '../../../../base/common/json.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Range } from '../../../../editor/common/core/range.js';
import { Selection } from '../../../../editor/common/core/selection.js';
import * as nls from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { Extensions, OVERRIDE_PROPERTY_REGEX } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorModel } from '../../../common/editor/editorModel.js';
import { SettingMatchType } from './preferences.js';
import { FOLDER_SCOPES, WORKSPACE_SCOPES } from '../../configuration/common/configuration.js';
import { createValidator } from './preferencesValidation.js';
import { isString } from '../../../../base/common/types.js';
export const nullRange = { startLineNumber: -1, startColumn: -1, endLineNumber: -1, endColumn: -1 };
function isNullRange(range) { return range.startLineNumber === -1 && range.startColumn === -1 && range.endLineNumber === -1 && range.endColumn === -1; }
/**
 * Strips VS Code's custom `#settingId#` link syntax from a markdown string so the setting key
 * remains as inline code (e.g. `` `settingId` ``). Useful for contexts that don't render markdown links.
 */
export function fixSettingLinks(text) {
    return text.replace(/`#([^#`]*)#`/g, (_, settingName) => `\`${settingName}\``);
}
class AbstractSettingsModel extends EditorModel {
    constructor() {
        super(...arguments);
        this._currentResultGroups = new Map();
    }
    updateResultGroup(id, resultGroup) {
        if (resultGroup) {
            this._currentResultGroups.set(id, resultGroup);
        }
        else {
            this._currentResultGroups.delete(id);
        }
        this.removeDuplicateResults();
        return this.update();
    }
    /**
     * Remove duplicates between result groups, preferring results in earlier groups
     */
    removeDuplicateResults() {
        const settingKeys = new Set();
        [...this._currentResultGroups.keys()]
            .sort((a, b) => this._currentResultGroups.get(a).order - this._currentResultGroups.get(b).order)
            .forEach(groupId => {
            const group = this._currentResultGroups.get(groupId);
            group.result.filterMatches = group.result.filterMatches.filter(s => !settingKeys.has(s.setting.key));
            group.result.filterMatches.forEach(s => settingKeys.add(s.setting.key));
        });
    }
    filterSettings(filter, groupFilter, settingMatcher) {
        const allGroups = this.filterGroups;
        const filterMatches = [];
        for (const group of allGroups) {
            const groupMatched = groupFilter(group);
            for (const section of group.sections) {
                for (const setting of section.settings) {
                    const settingMatchResult = settingMatcher(setting, group);
                    if (groupMatched || settingMatchResult) {
                        filterMatches.push({
                            setting,
                            matches: settingMatchResult && settingMatchResult.matches,
                            matchType: settingMatchResult?.matchType ?? SettingMatchType.None,
                            keyMatchScore: settingMatchResult?.keyMatchScore ?? 0,
                            score: settingMatchResult?.score ?? 0
                        });
                    }
                }
            }
        }
        return filterMatches;
    }
    getPreference(key) {
        for (const group of this.settingsGroups) {
            for (const section of group.sections) {
                for (const setting of section.settings) {
                    if (key === setting.key) {
                        return setting;
                    }
                }
            }
        }
        return undefined;
    }
    collectMetadata(groups) {
        const metadata = Object.create(null);
        let hasMetadata = false;
        groups.forEach(g => {
            if (g.result.metadata) {
                metadata[g.id] = g.result.metadata;
                hasMetadata = true;
            }
        });
        return hasMetadata ? metadata : null;
    }
    get filterGroups() {
        return this.settingsGroups;
    }
}
export class SettingsEditorModel extends AbstractSettingsModel {
    constructor(reference, _configurationTarget) {
        super();
        this._configurationTarget = _configurationTarget;
        this._onDidChangeGroups = this._register(new Emitter());
        this.onDidChangeGroups = this._onDidChangeGroups.event;
        this.settingsModel = reference.object.textEditorModel;
        this._register(this.onWillDispose(() => reference.dispose()));
        this._register(this.settingsModel.onDidChangeContent(() => {
            this._settingsGroups = undefined;
            this._onDidChangeGroups.fire();
        }));
    }
    get uri() {
        return this.settingsModel.uri;
    }
    get configurationTarget() {
        return this._configurationTarget;
    }
    get settingsGroups() {
        if (!this._settingsGroups) {
            this.parse();
        }
        return this._settingsGroups;
    }
    get content() {
        return this.settingsModel.getValue();
    }
    isSettingsProperty(property, previousParents) {
        return previousParents.length === 0; // Settings is root
    }
    parse() {
        this._settingsGroups = parse(this.settingsModel, (property, previousParents) => this.isSettingsProperty(property, previousParents));
    }
    update() {
        const resultGroups = [...this._currentResultGroups.values()];
        if (!resultGroups.length) {
            return undefined;
        }
        // Transform resultGroups into IFilterResult - ISetting ranges are already correct here
        const filteredSettings = [];
        const matches = [];
        resultGroups.forEach(group => {
            group.result.filterMatches.forEach(filterMatch => {
                filteredSettings.push(filterMatch.setting);
                if (filterMatch.matches) {
                    matches.push(...filterMatch.matches);
                }
            });
        });
        let filteredGroup;
        const modelGroup = this.settingsGroups[0]; // Editable model has one or zero groups
        if (modelGroup) {
            filteredGroup = {
                id: modelGroup.id,
                range: modelGroup.range,
                sections: [{
                        settings: filteredSettings
                    }],
                title: modelGroup.title,
                titleRange: modelGroup.titleRange,
                order: modelGroup.order,
                extensionInfo: modelGroup.extensionInfo
            };
        }
        const metadata = this.collectMetadata(resultGroups);
        return {
            allGroups: this.settingsGroups,
            filteredGroups: filteredGroup ? [filteredGroup] : [],
            matches,
            metadata: metadata ?? undefined
        };
    }
}
let Settings2EditorModel = class Settings2EditorModel extends AbstractSettingsModel {
    constructor(_defaultSettings, configurationService) {
        super();
        this._defaultSettings = _defaultSettings;
        this._onDidChangeGroups = this._register(new Emitter());
        this.onDidChangeGroups = this._onDidChangeGroups.event;
        this.additionalGroups = [];
        this.dirty = false;
        this._register(configurationService.onDidChangeConfiguration(e => {
            if (e.source === 7 /* ConfigurationTarget.DEFAULT */) {
                this.dirty = true;
                this._onDidChangeGroups.fire();
            }
        }));
        this._register(Registry.as(Extensions.Configuration).onDidSchemaChange(e => {
            this.dirty = true;
            this._onDidChangeGroups.fire();
        }));
    }
    /** Doesn't include the "Commonly Used" group */
    get filterGroups() {
        return this.settingsGroups.slice(1);
    }
    get settingsGroups() {
        const groups = this._defaultSettings.getSettingsGroups(this.dirty);
        this.dirty = false;
        return [...groups, ...this.additionalGroups];
    }
    /** For programmatically added groups outside of registered configurations */
    setAdditionalGroups(groups) {
        this.additionalGroups = groups;
    }
    update() {
        throw new Error('Not supported');
    }
};
Settings2EditorModel = __decorate([
    __param(1, IConfigurationService)
], Settings2EditorModel);
export { Settings2EditorModel };
function parse(model, isSettingsProperty) {
    const settings = [];
    let overrideSetting = null;
    let currentProperty = null;
    let currentParent = [];
    const previousParents = [];
    let settingsPropertyIndex = -1;
    const range = {
        startLineNumber: 0,
        startColumn: 0,
        endLineNumber: 0,
        endColumn: 0
    };
    function onValue(value, offset, length) {
        if (Array.isArray(currentParent)) {
            currentParent.push(value);
        }
        else if (currentProperty) {
            currentParent[currentProperty] = value;
        }
        if (previousParents.length === settingsPropertyIndex + 1 || (previousParents.length === settingsPropertyIndex + 2 && overrideSetting !== null)) {
            // settings value started
            const setting = previousParents.length === settingsPropertyIndex + 1 ? settings[settings.length - 1] : overrideSetting.overrides[overrideSetting.overrides.length - 1];
            if (setting) {
                const valueStartPosition = model.getPositionAt(offset);
                const valueEndPosition = model.getPositionAt(offset + length);
                setting.value = value;
                setting.valueRange = {
                    startLineNumber: valueStartPosition.lineNumber,
                    startColumn: valueStartPosition.column,
                    endLineNumber: valueEndPosition.lineNumber,
                    endColumn: valueEndPosition.column
                };
                setting.range = Object.assign(setting.range, {
                    endLineNumber: valueEndPosition.lineNumber,
                    endColumn: valueEndPosition.column
                });
            }
        }
    }
    const visitor = {
        onObjectBegin: (offset, length) => {
            if (isSettingsProperty(currentProperty, previousParents)) {
                // Settings started
                settingsPropertyIndex = previousParents.length;
                const position = model.getPositionAt(offset);
                range.startLineNumber = position.lineNumber;
                range.startColumn = position.column;
            }
            const object = {};
            onValue(object, offset, length);
            currentParent = object;
            currentProperty = null;
            previousParents.push(currentParent);
        },
        onObjectProperty: (name, offset, length) => {
            currentProperty = name;
            if (previousParents.length === settingsPropertyIndex + 1 || (previousParents.length === settingsPropertyIndex + 2 && overrideSetting !== null)) {
                // setting started
                const settingStartPosition = model.getPositionAt(offset);
                const setting = {
                    description: [],
                    descriptionIsMarkdown: false,
                    key: name,
                    keyRange: {
                        startLineNumber: settingStartPosition.lineNumber,
                        startColumn: settingStartPosition.column + 1,
                        endLineNumber: settingStartPosition.lineNumber,
                        endColumn: settingStartPosition.column + length
                    },
                    range: {
                        startLineNumber: settingStartPosition.lineNumber,
                        startColumn: settingStartPosition.column,
                        endLineNumber: 0,
                        endColumn: 0
                    },
                    value: null,
                    valueRange: nullRange,
                    descriptionRanges: [],
                    overrides: [],
                    overrideOf: overrideSetting ?? undefined,
                };
                if (previousParents.length === settingsPropertyIndex + 1) {
                    settings.push(setting);
                    if (OVERRIDE_PROPERTY_REGEX.test(name)) {
                        overrideSetting = setting;
                    }
                }
                else {
                    overrideSetting.overrides.push(setting);
                }
            }
        },
        onObjectEnd: (offset, length) => {
            currentParent = previousParents.pop();
            if (settingsPropertyIndex !== -1 && (previousParents.length === settingsPropertyIndex + 1 || (previousParents.length === settingsPropertyIndex + 2 && overrideSetting !== null))) {
                // setting ended
                const setting = previousParents.length === settingsPropertyIndex + 1 ? settings[settings.length - 1] : overrideSetting.overrides[overrideSetting.overrides.length - 1];
                if (setting) {
                    const valueEndPosition = model.getPositionAt(offset + length);
                    setting.valueRange = Object.assign(setting.valueRange, {
                        endLineNumber: valueEndPosition.lineNumber,
                        endColumn: valueEndPosition.column
                    });
                    setting.range = Object.assign(setting.range, {
                        endLineNumber: valueEndPosition.lineNumber,
                        endColumn: valueEndPosition.column
                    });
                }
                if (previousParents.length === settingsPropertyIndex + 1) {
                    overrideSetting = null;
                }
            }
            if (previousParents.length === settingsPropertyIndex) {
                // settings ended
                const position = model.getPositionAt(offset);
                range.endLineNumber = position.lineNumber;
                range.endColumn = position.column;
                settingsPropertyIndex = -1;
            }
        },
        onArrayBegin: (offset, length) => {
            const array = [];
            onValue(array, offset, length);
            previousParents.push(currentParent);
            currentParent = array;
            currentProperty = null;
        },
        onArrayEnd: (offset, length) => {
            currentParent = previousParents.pop();
            if (previousParents.length === settingsPropertyIndex + 1 || (previousParents.length === settingsPropertyIndex + 2 && overrideSetting !== null)) {
                // setting value ended
                const setting = previousParents.length === settingsPropertyIndex + 1 ? settings[settings.length - 1] : overrideSetting.overrides[overrideSetting.overrides.length - 1];
                if (setting) {
                    const valueEndPosition = model.getPositionAt(offset + length);
                    setting.valueRange = Object.assign(setting.valueRange, {
                        endLineNumber: valueEndPosition.lineNumber,
                        endColumn: valueEndPosition.column
                    });
                    setting.range = Object.assign(setting.range, {
                        endLineNumber: valueEndPosition.lineNumber,
                        endColumn: valueEndPosition.column
                    });
                }
            }
        },
        onLiteralValue: onValue,
        onError: (error) => {
            const setting = settings[settings.length - 1];
            if (setting && (isNullRange(setting.range) || isNullRange(setting.keyRange) || isNullRange(setting.valueRange))) {
                settings.pop();
            }
        }
    };
    if (!model.isDisposed()) {
        visit(model.getValue(), visitor);
    }
    return settings.length > 0 ? [{
            id: model.isDisposed() ? '' : model.id,
            sections: [
                {
                    settings
                }
            ],
            title: '',
            titleRange: nullRange,
            range
        }] : [];
}
export class WorkspaceConfigurationEditorModel extends SettingsEditorModel {
    constructor() {
        super(...arguments);
        this._configurationGroups = [];
    }
    get configurationGroups() {
        return this._configurationGroups;
    }
    parse() {
        super.parse();
        this._configurationGroups = parse(this.settingsModel, (property, previousParents) => previousParents.length === 0);
    }
    isSettingsProperty(property, previousParents) {
        return property === 'settings' && previousParents.length === 1;
    }
}
export class DefaultSettings extends Disposable {
    constructor(_mostCommonlyUsedSettingsKeys, target, configurationService) {
        super();
        this._mostCommonlyUsedSettingsKeys = _mostCommonlyUsedSettingsKeys;
        this.target = target;
        this.configurationService = configurationService;
        this._settingsByName = new Map();
        this._onDidChange = this._register(new Emitter());
        this.onDidChange = this._onDidChange.event;
        this._register(configurationService.onDidChangeConfiguration(e => {
            if (e.source === 7 /* ConfigurationTarget.DEFAULT */) {
                this.reset();
                this._onDidChange.fire();
            }
        }));
    }
    getContent(forceUpdate = false) {
        if (!this._content || forceUpdate) {
            this.initialize();
        }
        return this._content;
    }
    getContentWithoutMostCommonlyUsed(forceUpdate = false) {
        if (!this._contentWithoutMostCommonlyUsed || forceUpdate) {
            this.initialize();
        }
        return this._contentWithoutMostCommonlyUsed;
    }
    getSettingsGroups(forceUpdate = false) {
        if (!this._allSettingsGroups || forceUpdate) {
            this.initialize();
        }
        return this._allSettingsGroups;
    }
    initialize() {
        this._allSettingsGroups = this.parse();
        this._content = this.toContent(this._allSettingsGroups, 0);
        this._contentWithoutMostCommonlyUsed = this.toContent(this._allSettingsGroups, 1);
    }
    reset() {
        this._content = undefined;
        this._contentWithoutMostCommonlyUsed = undefined;
        this._allSettingsGroups = undefined;
    }
    parse() {
        const settingsGroups = this.getRegisteredGroups();
        this.initAllSettingsMap(settingsGroups);
        const mostCommonlyUsed = this.getMostCommonlyUsedSettings();
        return [mostCommonlyUsed, ...settingsGroups];
    }
    getRegisteredGroups() {
        const registry = Registry.as(Extensions.Configuration);
        const allConfigurations = { ...registry.getConfigurationProperties() };
        const excludedConfigurations = registry.getExcludedConfigurationProperties();
        for (const policyKey of this.configurationService.keys().policy ?? []) {
            const policyConfiguration = excludedConfigurations[policyKey];
            if (policyConfiguration) {
                allConfigurations[policyKey] = policyConfiguration;
            }
        }
        const groups = this.removeEmptySettingsGroups(this.parseProperties(allConfigurations).sort(this.compareGroups));
        return this.sortGroups(groups);
    }
    sortGroups(groups) {
        groups.forEach(group => {
            group.sections.forEach(section => {
                section.settings.sort((a, b) => a.key.localeCompare(b.key));
            });
        });
        return groups;
    }
    initAllSettingsMap(allSettingsGroups) {
        this._settingsByName = new Map();
        for (const group of allSettingsGroups) {
            for (const section of group.sections) {
                for (const setting of section.settings) {
                    this._settingsByName.set(setting.key, setting);
                }
            }
        }
    }
    getMostCommonlyUsedSettings() {
        const settings = coalesce(this._mostCommonlyUsedSettingsKeys.map(key => {
            const setting = this._settingsByName.get(key);
            if (setting) {
                return {
                    description: setting.description,
                    key: setting.key,
                    value: setting.value,
                    keyRange: nullRange,
                    range: nullRange,
                    valueRange: nullRange,
                    overrides: [],
                    scope: 5 /* ConfigurationScope.RESOURCE */,
                    type: setting.type,
                    enum: setting.enum,
                    enumDescriptions: setting.enumDescriptions,
                    descriptionRanges: []
                };
            }
            return null;
        }));
        return {
            id: 'mostCommonlyUsed',
            range: nullRange,
            title: nls.localize('commonlyUsed', "Commonly Used"),
            titleRange: nullRange,
            sections: [
                {
                    settings
                }
            ]
        };
    }
    parseProperties(properties) {
        const result = [];
        const byTitle = new Map();
        const byId = new Map();
        for (const [key, property] of Object.entries(properties)) {
            if (!property.section) {
                continue;
            }
            let settingsGroup;
            if (property.section.title) {
                const groups = byTitle.get(property.section.title);
                if (groups) {
                    const extensionId = property.section.extensionInfo?.id;
                    settingsGroup = groups.find(g => g.extensionInfo?.id === extensionId);
                }
            }
            if (!settingsGroup && property.section.id) {
                const groups = byId.get(property.section.id);
                if (groups) {
                    const extensionId = property.section.extensionInfo?.id;
                    settingsGroup = groups.find(g => g.extensionInfo?.id === extensionId && !g.title);
                }
                if (settingsGroup && !settingsGroup?.title && property.section.title) {
                    settingsGroup.title = property.section.title;
                    const byTitleGroups = byTitle.get(property.section.title);
                    if (byTitleGroups) {
                        byTitleGroups.push(settingsGroup);
                    }
                    else {
                        byTitle.set(property.section.title, [settingsGroup]);
                    }
                }
            }
            if (!settingsGroup) {
                settingsGroup = { sections: [{ title: property.section.title, settings: [] }], id: property.section.id || '', title: property.section.title ?? '', titleRange: nullRange, order: property.section.order, range: nullRange, extensionInfo: isString(property.source) ? undefined : property.source };
                result.push(settingsGroup);
                if (property.section.title) {
                    const byTitleGroups = byTitle.get(property.section.title);
                    if (byTitleGroups) {
                        byTitleGroups.push(settingsGroup);
                    }
                    else {
                        byTitle.set(property.section.title, [settingsGroup]);
                    }
                }
                if (property.section.id) {
                    const byIdGroups = byId.get(property.section.id);
                    if (byIdGroups) {
                        byIdGroups.push(settingsGroup);
                    }
                    else {
                        byId.set(property.section.id, [settingsGroup]);
                    }
                }
            }
            const setting = this.parseSetting(key, property);
            if (setting) {
                settingsGroup.sections[0].settings.push(setting);
            }
        }
        return result;
    }
    removeEmptySettingsGroups(settingsGroups) {
        const result = [];
        for (const settingsGroup of settingsGroups) {
            settingsGroup.sections = settingsGroup.sections.filter(section => section.settings.length > 0);
            if (settingsGroup.sections.length) {
                result.push(settingsGroup);
            }
        }
        return result;
    }
    parseSetting(key, prop) {
        if (!this.matchesScope(prop)) {
            return undefined;
        }
        const value = prop.default;
        let description = (prop.markdownDescription || prop.description || '');
        if (typeof description !== 'string') {
            description = '';
        }
        const descriptionLines = description.split('\n');
        const overrides = OVERRIDE_PROPERTY_REGEX.test(key) ? this.parseOverrideSettings(prop.default) : [];
        let listItemType;
        if (prop.type === 'array' && prop.items && !Array.isArray(prop.items) && prop.items.type) {
            if (prop.items.enum) {
                listItemType = 'enum';
            }
            else if (!Array.isArray(prop.items.type)) {
                listItemType = prop.items.type;
            }
        }
        const objectProperties = prop.type === 'object' ? prop.properties : undefined;
        const objectPatternProperties = prop.type === 'object' ? prop.patternProperties : undefined;
        const objectAdditionalProperties = prop.type === 'object' ? prop.additionalProperties : undefined;
        const propertyNames = prop.type === 'object' ? prop.propertyNames : undefined;
        let enumToUse = prop.enum;
        let enumDescriptions = prop.markdownEnumDescriptions ?? prop.enumDescriptions;
        let enumDescriptionsAreMarkdown = !!prop.markdownEnumDescriptions;
        if (listItemType === 'enum' && !Array.isArray(prop.items)) {
            enumToUse = prop.items.enum;
            enumDescriptions = prop.items.markdownEnumDescriptions ?? prop.items.enumDescriptions;
            enumDescriptionsAreMarkdown = !!prop.items.markdownEnumDescriptions;
        }
        let allKeysAreBoolean = false;
        if (prop.type === 'object' && !prop.additionalProperties && prop.properties && Object.keys(prop.properties).length) {
            allKeysAreBoolean = Object.keys(prop.properties).every(key => {
                return prop.properties[key].type === 'boolean';
            });
        }
        let isLanguageTagSetting = false;
        if (OVERRIDE_PROPERTY_REGEX.test(key)) {
            isLanguageTagSetting = true;
        }
        let defaultValueSource;
        if (!isLanguageTagSetting) {
            const registeredConfigurationProp = prop;
            if (registeredConfigurationProp && registeredConfigurationProp.defaultValueSource) {
                defaultValueSource = registeredConfigurationProp.defaultValueSource;
            }
        }
        if (!enumToUse && (prop.enumItemLabels || enumDescriptions || enumDescriptionsAreMarkdown)) {
            console.error(`The setting ${key} has enum-related fields, but doesn't have an enum field. This setting may render improperly in the Settings editor.`);
        }
        return {
            key,
            value,
            description: descriptionLines,
            descriptionIsMarkdown: !!prop.markdownDescription,
            keywords: prop.keywords,
            range: nullRange,
            keyRange: nullRange,
            valueRange: nullRange,
            descriptionRanges: [],
            overrides,
            scope: prop.scope,
            type: prop.type,
            arrayItemType: listItemType,
            objectProperties,
            objectPatternProperties,
            objectAdditionalProperties,
            propertyNames,
            enum: enumToUse,
            enumDescriptions: enumDescriptions,
            enumDescriptionsAreMarkdown: enumDescriptionsAreMarkdown,
            enumItemLabels: prop.enumItemLabels,
            uniqueItems: prop.uniqueItems,
            tags: prop.tags,
            disallowSyncIgnore: prop.disallowSyncIgnore,
            restricted: prop.restricted,
            extensionInfo: isString(prop.source) ? undefined : prop.source,
            deprecationMessage: prop.markdownDeprecationMessage || prop.deprecationMessage,
            deprecationMessageIsMarkdown: !!prop.markdownDeprecationMessage,
            validator: createValidator(prop),
            allKeysAreBoolean,
            editPresentation: prop.editPresentation,
            order: prop.order,
            nonLanguageSpecificDefaultValueSource: defaultValueSource,
            isLanguageTagSetting,
            categoryLabel: (isString(prop.source) ? undefined : prop.source?.id) === prop.section?.id ? prop.title : prop.section?.id
        };
    }
    parseOverrideSettings(overrideSettings) {
        return Object.keys(overrideSettings).map((key) => ({
            key,
            value: overrideSettings[key],
            description: [],
            descriptionIsMarkdown: false,
            range: nullRange,
            keyRange: nullRange,
            valueRange: nullRange,
            descriptionRanges: [],
            overrides: []
        }));
    }
    matchesScope(property) {
        if (!property.scope) {
            return true;
        }
        if (this.target === 6 /* ConfigurationTarget.WORKSPACE_FOLDER */) {
            return FOLDER_SCOPES.indexOf(property.scope) !== -1;
        }
        if (this.target === 5 /* ConfigurationTarget.WORKSPACE */) {
            return WORKSPACE_SCOPES.indexOf(property.scope) !== -1;
        }
        return true;
    }
    compareGroups(c1, c2) {
        if (typeof c1?.order !== 'number') {
            return 1;
        }
        if (typeof c2?.order !== 'number') {
            return -1;
        }
        if (c1.order === c2.order) {
            const title1 = c1.title || '';
            const title2 = c2.title || '';
            return title1.localeCompare(title2);
        }
        return c1.order - c2.order;
    }
    toContent(settingsGroups, startIndex) {
        const builder = new SettingsContentBuilder();
        for (let i = startIndex; i < settingsGroups.length; i++) {
            builder.pushGroup(settingsGroups[i], i === startIndex, i === settingsGroups.length - 1);
        }
        return builder.getContent();
    }
}
export class DefaultSettingsEditorModel extends AbstractSettingsModel {
    constructor(_uri, reference, defaultSettings) {
        super();
        this._uri = _uri;
        this.defaultSettings = defaultSettings;
        this._onDidChangeGroups = this._register(new Emitter());
        this.onDidChangeGroups = this._onDidChangeGroups.event;
        this._register(defaultSettings.onDidChange(() => this._onDidChangeGroups.fire()));
        this._model = reference.object.textEditorModel;
        this._register(this.onWillDispose(() => reference.dispose()));
    }
    get uri() {
        return this._uri;
    }
    get target() {
        return this.defaultSettings.target;
    }
    get settingsGroups() {
        return this.defaultSettings.getSettingsGroups();
    }
    get filterGroups() {
        // Don't look at "commonly used" for filter
        return this.settingsGroups.slice(1);
    }
    update() {
        if (this._model.isDisposed()) {
            return undefined;
        }
        // Grab current result groups, only render non-empty groups
        const resultGroups = [...this._currentResultGroups.values()]
            .sort((a, b) => a.order - b.order);
        const nonEmptyResultGroups = resultGroups.filter(group => group.result.filterMatches.length);
        const startLine = this.settingsGroups.at(-1).range.endLineNumber + 2;
        const { settingsGroups: filteredGroups, matches } = this.writeResultGroups(nonEmptyResultGroups, startLine);
        const metadata = this.collectMetadata(resultGroups);
        return resultGroups.length ?
            {
                allGroups: this.settingsGroups,
                filteredGroups,
                matches,
                metadata: metadata ?? undefined
            } :
            undefined;
    }
    /**
     * Translate the ISearchResultGroups to text, and write it to the editor model
     */
    writeResultGroups(groups, startLine) {
        const contentBuilderOffset = startLine - 1;
        const builder = new SettingsContentBuilder(contentBuilderOffset);
        const settingsGroups = [];
        const matches = [];
        if (groups.length) {
            builder.pushLine(',');
            groups.forEach(resultGroup => {
                const settingsGroup = this.getGroup(resultGroup);
                settingsGroups.push(settingsGroup);
                matches.push(...this.writeSettingsGroupToBuilder(builder, settingsGroup, resultGroup.result.filterMatches));
            });
        }
        // note: 1-indexed line numbers here
        const groupContent = builder.getContent() + '\n';
        const groupEndLine = this._model.getLineCount();
        const cursorPosition = new Selection(startLine, 1, startLine, 1);
        const edit = {
            text: groupContent,
            forceMoveMarkers: true,
            range: new Range(startLine, 1, groupEndLine, 1)
        };
        this._model.pushEditOperations([cursorPosition], [edit], () => [cursorPosition]);
        // Force tokenization now - otherwise it may be slightly delayed, causing a flash of white text
        const tokenizeTo = Math.min(startLine + 60, this._model.getLineCount());
        this._model.tokenization.forceTokenization(tokenizeTo);
        return { matches, settingsGroups };
    }
    writeSettingsGroupToBuilder(builder, settingsGroup, filterMatches) {
        filterMatches = filterMatches
            .map(filteredMatch => {
            // Fix match ranges to offset from setting start line
            return {
                setting: filteredMatch.setting,
                score: filteredMatch.score,
                matchType: filteredMatch.matchType,
                keyMatchScore: filteredMatch.keyMatchScore,
                matches: filteredMatch.matches && filteredMatch.matches.map(match => {
                    return new Range(match.startLineNumber - filteredMatch.setting.range.startLineNumber, match.startColumn, match.endLineNumber - filteredMatch.setting.range.startLineNumber, match.endColumn);
                })
            };
        });
        builder.pushGroup(settingsGroup);
        // builder has rewritten settings ranges, fix match ranges
        const fixedMatches = filterMatches
            .map(m => m.matches || [])
            .flatMap((settingMatches, i) => {
            const setting = settingsGroup.sections[0].settings[i];
            return settingMatches.map(range => {
                return new Range(range.startLineNumber + setting.range.startLineNumber, range.startColumn, range.endLineNumber + setting.range.startLineNumber, range.endColumn);
            });
        });
        return fixedMatches;
    }
    copySetting(setting) {
        return {
            description: setting.description,
            scope: setting.scope,
            type: setting.type,
            enum: setting.enum,
            enumDescriptions: setting.enumDescriptions,
            key: setting.key,
            value: setting.value,
            range: setting.range,
            overrides: [],
            overrideOf: setting.overrideOf,
            tags: setting.tags,
            deprecationMessage: setting.deprecationMessage,
            keyRange: nullRange,
            valueRange: nullRange,
            descriptionIsMarkdown: undefined,
            descriptionRanges: []
        };
    }
    getPreference(key) {
        for (const group of this.settingsGroups) {
            for (const section of group.sections) {
                for (const setting of section.settings) {
                    if (setting.key === key) {
                        return setting;
                    }
                }
            }
        }
        return undefined;
    }
    getGroup(resultGroup) {
        return {
            id: resultGroup.id,
            range: nullRange,
            title: resultGroup.label,
            titleRange: nullRange,
            sections: [
                {
                    settings: resultGroup.result.filterMatches.map(m => this.copySetting(m.setting))
                }
            ]
        };
    }
}
class SettingsContentBuilder {
    get lineCountWithOffset() {
        return this._contentByLines.length + this._rangeOffset;
    }
    get lastLine() {
        return this._contentByLines[this._contentByLines.length - 1] || '';
    }
    constructor(_rangeOffset = 0) {
        this._rangeOffset = _rangeOffset;
        this._contentByLines = [];
    }
    pushLine(...lineText) {
        this._contentByLines.push(...lineText);
    }
    pushGroup(settingsGroups, isFirst, isLast) {
        this._contentByLines.push(isFirst ? '[{' : '{');
        const lastSetting = this._pushGroup(settingsGroups, '  ');
        if (lastSetting) {
            // Strip the comma from the last setting
            const lineIdx = lastSetting.range.endLineNumber - this._rangeOffset;
            const content = this._contentByLines[lineIdx - 2];
            this._contentByLines[lineIdx - 2] = content.substring(0, content.length - 1);
        }
        this._contentByLines.push(isLast ? '}]' : '},');
    }
    _pushGroup(group, indent) {
        let lastSetting = null;
        const groupStart = this.lineCountWithOffset + 1;
        for (const section of group.sections) {
            if (section.title) {
                this.addDescription([section.title], indent, this._contentByLines);
            }
            if (section.settings.length) {
                for (const setting of section.settings) {
                    this.pushSetting(setting, indent);
                    lastSetting = setting;
                }
            }
        }
        group.range = { startLineNumber: groupStart, startColumn: 1, endLineNumber: this.lineCountWithOffset, endColumn: this.lastLine.length };
        return lastSetting;
    }
    getContent() {
        return this._contentByLines.join('\n');
    }
    pushSetting(setting, indent) {
        const settingStart = this.lineCountWithOffset + 1;
        this.pushSettingDescription(setting, indent);
        let preValueContent = indent;
        const keyString = JSON.stringify(setting.key);
        preValueContent += keyString;
        setting.keyRange = { startLineNumber: this.lineCountWithOffset + 1, startColumn: preValueContent.indexOf(setting.key) + 1, endLineNumber: this.lineCountWithOffset + 1, endColumn: setting.key.length };
        preValueContent += ': ';
        const valueStart = this.lineCountWithOffset + 1;
        this.pushValue(setting, preValueContent, indent);
        setting.valueRange = { startLineNumber: valueStart, startColumn: preValueContent.length + 1, endLineNumber: this.lineCountWithOffset, endColumn: this.lastLine.length + 1 };
        this._contentByLines[this._contentByLines.length - 1] += ',';
        this._contentByLines.push('');
        setting.range = { startLineNumber: settingStart, startColumn: 1, endLineNumber: this.lineCountWithOffset, endColumn: this.lastLine.length };
    }
    pushSettingDescription(setting, indent) {
        setting.descriptionRanges = [];
        const descriptionPreValue = indent + '// ';
        const deprecationMessageLines = setting.deprecationMessage?.split(/\n/g) ?? [];
        for (let line of [...deprecationMessageLines, ...setting.description]) {
            line = fixSettingLinks(line);
            this._contentByLines.push(descriptionPreValue + line);
            setting.descriptionRanges.push({ startLineNumber: this.lineCountWithOffset, startColumn: this.lastLine.indexOf(line) + 1, endLineNumber: this.lineCountWithOffset, endColumn: this.lastLine.length });
        }
        if (setting.enum && setting.enumDescriptions?.some(desc => !!desc)) {
            setting.enumDescriptions.forEach((desc, i) => {
                const displayEnum = escapeInvisibleChars(String(setting.enum[i]));
                const line = desc ?
                    `${displayEnum}: ${fixSettingLinks(desc)}` :
                    displayEnum;
                const lines = line.split(/\n/g);
                lines[0] = ' - ' + lines[0];
                this._contentByLines.push(...lines.map(l => `${indent}// ${l}`));
                setting.descriptionRanges.push({ startLineNumber: this.lineCountWithOffset, startColumn: this.lastLine.indexOf(line) + 1, endLineNumber: this.lineCountWithOffset, endColumn: this.lastLine.length });
            });
        }
    }
    pushValue(setting, preValueConent, indent) {
        const valueString = JSON.stringify(setting.value, null, indent);
        if (valueString && (typeof setting.value === 'object')) {
            if (setting.overrides && setting.overrides.length) {
                this._contentByLines.push(preValueConent + ' {');
                for (const subSetting of setting.overrides) {
                    this.pushSetting(subSetting, indent + indent);
                    this._contentByLines.pop();
                }
                const lastSetting = setting.overrides[setting.overrides.length - 1];
                const content = this._contentByLines[lastSetting.range.endLineNumber - 2];
                this._contentByLines[lastSetting.range.endLineNumber - 2] = content.substring(0, content.length - 1);
                this._contentByLines.push(indent + '}');
            }
            else {
                const mulitLineValue = valueString.split('\n');
                this._contentByLines.push(preValueConent + mulitLineValue[0]);
                for (let i = 1; i < mulitLineValue.length; i++) {
                    this._contentByLines.push(indent + mulitLineValue[i]);
                }
            }
        }
        else {
            this._contentByLines.push(preValueConent + valueString);
        }
    }
    addDescription(description, indent, result) {
        for (const line of description) {
            result.push(indent + '// ' + line);
        }
    }
}
class RawSettingsContentBuilder extends SettingsContentBuilder {
    constructor(indent = '\t') {
        super(0);
        this.indent = indent;
    }
    pushGroup(settingsGroups) {
        this._pushGroup(settingsGroups, this.indent);
    }
}
export class DefaultRawSettingsEditorModel extends Disposable {
    constructor(defaultSettings) {
        super();
        this.defaultSettings = defaultSettings;
        this._content = null;
        this._onDidContentChanged = this._register(new Emitter());
        this.onDidContentChanged = this._onDidContentChanged.event;
        this._register(defaultSettings.onDidChange(() => {
            this._content = null;
            this._onDidContentChanged.fire();
        }));
    }
    get content() {
        if (this._content === null) {
            const builder = new RawSettingsContentBuilder();
            builder.pushLine('{');
            for (const settingsGroup of this.defaultSettings.getRegisteredGroups()) {
                builder.pushGroup(settingsGroup);
            }
            builder.pushLine('}');
            this._content = builder.getContent();
        }
        return this._content;
    }
}
function escapeInvisibleChars(enumValue) {
    return enumValue && enumValue
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r');
}
export function defaultKeybindingsContents(keybindingService) {
    const defaultsHeader = '// ' + nls.localize('defaultKeybindingsHeader', "Override key bindings by placing them into your key bindings file.");
    return defaultsHeader + '\n' + keybindingService.getDefaultKeybindingsContent();
}
let DefaultKeybindingsEditorModel = class DefaultKeybindingsEditorModel {
    constructor(_uri, keybindingService) {
        this._uri = _uri;
        this.keybindingService = keybindingService;
    }
    get uri() {
        return this._uri;
    }
    get content() {
        if (!this._content) {
            this._content = defaultKeybindingsContents(this.keybindingService);
        }
        return this._content;
    }
    getPreference() {
        return null;
    }
    dispose() {
        // Not disposable
    }
};
DefaultKeybindingsEditorModel = __decorate([
    __param(1, IKeybindingService)
], DefaultKeybindingsEditorModel);
export { DefaultKeybindingsEditorModel };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJlZmVyZW5jZXNNb2RlbHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvcHJlZmVyZW5jZXMvY29tbW9uL3ByZWZlcmVuY2VzTW9kZWxzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUU3RCxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxFQUFlLEtBQUssRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxVQUFVLEVBQWMsTUFBTSxzQ0FBc0MsQ0FBQztBQUU5RSxPQUFPLEVBQVUsS0FBSyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDeEUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBSXhFLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0JBQW9CLENBQUM7QUFDMUMsT0FBTyxFQUF1QixxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ3hILE9BQU8sRUFBdUQsVUFBVSxFQUFzRix1QkFBdUIsRUFBRSxNQUFNLG9FQUFvRSxDQUFDO0FBQ2xRLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUM1RSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDcEUsT0FBTyxFQUE2SyxnQkFBZ0IsRUFBRSxNQUFNLGtCQUFrQixDQUFDO0FBQy9OLE9BQU8sRUFBRSxhQUFhLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUM5RixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDN0Qs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