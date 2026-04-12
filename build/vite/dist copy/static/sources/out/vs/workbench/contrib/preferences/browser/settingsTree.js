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
var AbstractSettingRenderer_1, CopySettingIdAction_1, CopySettingAsJSONAction_1, CopySettingAsURLAction_1, SyncSettingAction_1, ApplySettingToAllProfilesAction_1;
import { BrowserFeatures } from '../../../../base/browser/canIUse.js';
import * as DOM from '../../../../base/browser/dom.js';
import * as domStylesheetsJs from '../../../../base/browser/domStylesheets.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { renderAsPlaintext } from '../../../../base/browser/markdownRenderer.js';
import * as aria from '../../../../base/browser/ui/aria/aria.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { SimpleIconLabel } from '../../../../base/browser/ui/iconLabel/simpleIconLabel.js';
import { InputBox } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { CachedListVirtualDelegate } from '../../../../base/browser/ui/list/list.js';
import { DefaultStyleController } from '../../../../base/browser/ui/list/listWidget.js';
import { SelectBox } from '../../../../base/browser/ui/selectBox/selectBox.js';
import { Toggle, unthemedToggleStyles } from '../../../../base/browser/ui/toggle/toggle.js';
import { ToolBar } from '../../../../base/browser/ui/toolbar/toolbar.js';
import { RenderIndentGuides } from '../../../../base/browser/ui/tree/abstractTree.js';
import { ObjectTreeModel } from '../../../../base/browser/ui/tree/objectTreeModel.js';
import { Action, Separator } from '../../../../base/common/actions.js';
import { distinct } from '../../../../base/common/arrays.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, isDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { isIOS } from '../../../../base/common/platform.js';
import { escapeRegExpCharacters } from '../../../../base/common/strings.js';
import { isDefined, isUndefinedOrNull } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { IMarkdownRendererService } from '../../../../platform/markdown/browser/markdownRenderer.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { localize } from '../../../../nls.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService, getLanguageTagSettingPlainKey } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService, IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IListService, WorkbenchObjectTree } from '../../../../platform/list/browser/listService.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { defaultButtonStyles, getInputBoxStyle, getListStyles, getSelectBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { editorBackground, foreground } from '../../../../platform/theme/common/colorRegistry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { getIgnoredSettings } from '../../../../platform/userDataSync/common/settingsMerge.js';
import { IUserDataSyncEnablementService, getDefaultIgnoredSettings } from '../../../../platform/userDataSync/common/userDataSync.js';
import { hasNativeContextMenu } from '../../../../platform/window/common/window.js';
import { APPLICATION_SCOPES, APPLY_ALL_PROFILES_SETTING, IWorkbenchConfigurationService } from '../../../services/configuration/common/configuration.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { SETTINGS_AUTHORITY, SettingValueType } from '../../../services/preferences/common/preferences.js';
import { getInvalidTypeError } from '../../../services/preferences/common/preferencesValidation.js';
import { IExtensionsWorkbenchService } from '../../extensions/common/extensions.js';
import { LANGUAGE_SETTING_TAG, SETTINGS_EDITOR_COMMAND_SHOW_CONTEXT_MENU, compareTwoNullableNumbers } from '../common/preferences.js';
import { settingsNumberInputBackground, settingsNumberInputBorder, settingsNumberInputForeground, settingsSelectBackground, settingsSelectBorder, settingsSelectForeground, settingsSelectListBorder, settingsTextInputBackground, settingsTextInputBorder, settingsTextInputForeground } from '../common/settingsEditorColorRegistry.js';
import { settingsMoreActionIcon } from './preferencesIcons.js';
import { SettingsTreeIndicatorsLabel, getIndicatorsLabelAriaLabel } from './settingsEditorSettingIndicators.js';
import { SettingsTreeGroupElement, SettingsTreeNewExtensionsElement, SettingsTreeSettingElement, inspectSetting, objectSettingSupportsRemoveDefaultValue, settingKeyToDisplayFormat } from './settingsTreeModels.js';
import { ExcludeSettingWidget, IncludeSettingWidget, ListSettingWidget, ObjectSettingCheckboxWidget, ObjectSettingDropdownWidget } from './settingsWidgets.js';
const $ = DOM.$;
const multiGroupTocSettings = new Set([
    'accessibility.signals.chatUserActionRequired',
    'accessibility.signals.chatResponseReceived'
]);
function getIncludeExcludeDisplayValue(element) {
    const elementDefaultValue = typeof element.defaultValue === 'object'
        ? element.defaultValue ?? {}
        : {};
    const data = element.isConfigured ?
        { ...elementDefaultValue, ...element.scopeValue } :
        elementDefaultValue;
    return Object.keys(data)
        .filter(key => !!data[key])
        .map(key => {
        const defaultValue = elementDefaultValue[key];
        // Get source if it's a default value
        let source;
        if (defaultValue === data[key] && element.setting.type === 'object' && element.defaultValueSource instanceof Map) {
            const defaultSource = element.defaultValueSource.get(`${element.setting.key}.${key}`);
            source = typeof defaultSource === 'string' ? defaultSource : defaultSource?.displayName;
        }
        const value = data[key];
        const sibling = typeof value === 'boolean' ? undefined : value.when;
        return {
            value: {
                type: 'string',
                data: key
            },
            sibling,
            elementType: element.valueType,
            source
        };
    });
}
function areAllPropertiesDefined(properties, itemsToDisplay) {
    const staticProperties = new Set(properties);
    itemsToDisplay.forEach(({ key }) => staticProperties.delete(key.data));
    return staticProperties.size === 0;
}
function getEnumOptionsFromSchema(schema) {
    if (schema.anyOf) {
        return schema.anyOf.map(getEnumOptionsFromSchema).flat();
    }
    const enumDescriptions = schema.enumDescriptions ?? [];
    return (schema.enum ?? []).map((value, idx) => {
        const description = idx < enumDescriptions.length
            ? enumDescriptions[idx]
            : undefined;
        return { value, description };
    });
}
function getObjectValueType(schema) {
    if (schema.anyOf) {
        const subTypes = schema.anyOf.map(getObjectValueType);
        if (subTypes.some(type => type === 'enum')) {
            return 'enum';
        }
        return 'string';
    }
    if (schema.type === 'boolean') {
        return 'boolean';
    }
    else if (schema.type === 'string' && isDefined(schema.enum) && schema.enum.length > 0) {
        return 'enum';
    }
    else {
        return 'string';
    }
}
function getObjectEntryValueDisplayValue(type, data, options) {
    if (type === 'boolean') {
        return { type, data: !!data };
    }
    else if (type === 'enum') {
        return { type, data: '' + data, options };
    }
    else {
        return { type, data: '' + data };
    }
}
function getObjectDisplayValue(element) {
    const elementDefaultValue = typeof element.defaultValue === 'object'
        ? element.defaultValue ?? {}
        : {};
    const elementScopeValue = typeof element.scopeValue === 'object'
        ? element.scopeValue ?? {}
        : {};
    const data = element.isConfigured ?
        { ...elementDefaultValue, ...elementScopeValue } :
        element.hasPolicyValue ? element.scopeValue :
            elementDefaultValue;
    const { objectProperties, objectPatternProperties, objectAdditionalProperties } = element.setting;
    const patternsAndSchemas = Object
        .entries(objectPatternProperties ?? {})
        .map(([pattern, schema]) => ({
        pattern: new RegExp(pattern),
        schema
    }));
    const wellDefinedKeyEnumOptions = Object.entries(objectProperties ?? {}).map(([key, schema]) => ({ value: key, description: schema.description }));
    return Object.keys(data).map(key => {
        const defaultValue = elementDefaultValue[key];
        // Get source if it's a default value
        let source;
        if (defaultValue === data[key] && element.setting.type === 'object' && element.defaultValueSource instanceof Map) {
            const defaultSource = element.defaultValueSource.get(`${element.setting.key}.${key}`);
            source = typeof defaultSource === 'string' ? defaultSource : defaultSource?.displayName;
        }
        if (isDefined(objectProperties) && key in objectProperties) {
            const valueEnumOptions = getEnumOptionsFromSchema(objectProperties[key]);
            return {
                key: {
                    type: 'enum',
                    data: key,
                    options: wellDefinedKeyEnumOptions,
                },
                value: getObjectEntryValueDisplayValue(getObjectValueType(objectProperties[key]), data[key], valueEnumOptions),
                keyDescription: objectProperties[key].description,
                removable: isUndefinedOrNull(defaultValue),
                resetable: !isUndefinedOrNull(defaultValue),
                source
            };
        }
        // The row is removable if it doesn't have a default value assigned or the setting supports removing the default value.
        // If a default value is assigned and the user modified the default, it can be reset back to the default.
        const removable = defaultValue === undefined || objectSettingSupportsRemoveDefaultValue(element.setting.key);
        const resetable = !!defaultValue && defaultValue !== data[key];
        const schema = patternsAndSchemas.find(({ pattern }) => pattern.test(key))?.schema;
        if (schema) {
            const valueEnumOptions = getEnumOptionsFromSchema(schema);
            return {
                key: { type: 'string', data: key },
                value: getObjectEntryValueDisplayValue(getObjectValueType(schema), data[key], valueEnumOptions),
                keyDescription: schema.description,
                removable,
                resetable,
                source
            };
        }
        const additionalValueEnums = getEnumOptionsFromSchema(typeof objectAdditionalProperties === 'boolean'
            ? {}
            : objectAdditionalProperties ?? {});
        return {
            key: { type: 'string', data: key },
            value: getObjectEntryValueDisplayValue(typeof objectAdditionalProperties === 'object' ? getObjectValueType(objectAdditionalProperties) : 'string', data[key], additionalValueEnums),
            keyDescription: typeof objectAdditionalProperties === 'object' ? objectAdditionalProperties.description : undefined,
            removable,
            resetable,
            source
        };
    }).filter(item => !isUndefinedOrNull(item.value.data));
}
function getBoolObjectDisplayValue(element) {
    const elementDefaultValue = typeof element.defaultValue === 'object'
        ? element.defaultValue ?? {}
        : {};
    const elementScopeValue = typeof element.scopeValue === 'object'
        ? element.scopeValue ?? {}
        : {};
    const data = element.isConfigured ?
        { ...elementDefaultValue, ...elementScopeValue } :
        elementDefaultValue;
    const { objectProperties } = element.setting;
    const displayValues = [];
    for (const key in objectProperties) {
        const defaultValue = elementDefaultValue[key];
        // Get source if it's a default value
        let source;
        if (defaultValue === data[key] && element.setting.type === 'object' && element.defaultValueSource instanceof Map) {
            const defaultSource = element.defaultValueSource.get(key);
            source = typeof defaultSource === 'string' ? defaultSource : defaultSource?.displayName;
        }
        displayValues.push({
            key: {
                type: 'string',
                data: key
            },
            value: {
                type: 'boolean',
                data: !!data[key]
            },
            keyDescription: objectProperties[key].description,
            removable: false,
            resetable: true,
            source
        });
    }
    return displayValues;
}
function createArraySuggester(element) {
    return (keys, idx) => {
        const enumOptions = [];
        if (element.setting.enum) {
            element.setting.enum.forEach((key, i) => {
                // include the currently selected value, even if uniqueItems is true
                if (!element.setting.uniqueItems || (idx !== undefined && key === keys[idx]) || !keys.includes(key)) {
                    const description = element.setting.enumDescriptions?.[i];
                    enumOptions.push({ value: key, description });
                }
            });
        }
        return enumOptions.length > 0
            ? { type: 'enum', data: enumOptions[0].value, options: enumOptions }
            : undefined;
    };
}
function createObjectKeySuggester(element) {
    const { objectProperties } = element.setting;
    const allStaticKeys = Object.keys(objectProperties ?? {});
    return keys => {
        const existingKeys = new Set(keys);
        const enumOptions = [];
        allStaticKeys.forEach(staticKey => {
            if (!existingKeys.has(staticKey)) {
                enumOptions.push({ value: staticKey, description: objectProperties[staticKey].description });
            }
        });
        return enumOptions.length > 0
            ? { type: 'enum', data: enumOptions[0].value, options: enumOptions }
            : undefined;
    };
}
function createObjectValueSuggester(element) {
    const { objectProperties, objectPatternProperties, objectAdditionalProperties } = element.setting;
    const patternsAndSchemas = Object
        .entries(objectPatternProperties ?? {})
        .map(([pattern, schema]) => ({
        pattern: new RegExp(pattern),
        schema
    }));
    return (key) => {
        let suggestedSchema;
        if (isDefined(objectProperties) && key in objectProperties) {
            suggestedSchema = objectProperties[key];
        }
        const patternSchema = suggestedSchema ?? patternsAndSchemas.find(({ pattern }) => pattern.test(key))?.schema;
        if (isDefined(patternSchema)) {
            suggestedSchema = patternSchema;
        }
        else if (isDefined(objectAdditionalProperties) && typeof objectAdditionalProperties === 'object') {
            suggestedSchema = objectAdditionalProperties;
        }
        if (isDefined(suggestedSchema)) {
            const type = getObjectValueType(suggestedSchema);
            if (type === 'boolean') {
                return { type, data: suggestedSchema.default ?? true };
            }
            else if (type === 'enum') {
                const options = getEnumOptionsFromSchema(suggestedSchema);
                return { type, data: suggestedSchema.default ?? options[0].value, options };
            }
            else {
                return { type, data: suggestedSchema.default ?? '' };
            }
        }
        return;
    };
}
function isNonNullableNumericType(type) {
    return type === 'number' || type === 'integer';
}
function parseNumericObjectValues(dataElement, v) {
    const newRecord = {};
    for (const key in v) {
        // Set to true/false once we're sure of the answer
        let keyMatchesNumericProperty;
        const patternProperties = dataElement.setting.objectPatternProperties;
        const properties = dataElement.setting.objectProperties;
        const additionalProperties = dataElement.setting.objectAdditionalProperties;
        // Match the current record key against the properties of the object
        if (properties) {
            for (const propKey in properties) {
                if (propKey === key) {
                    keyMatchesNumericProperty = isNonNullableNumericType(properties[propKey].type);
                    break;
                }
            }
        }
        if (keyMatchesNumericProperty === undefined && patternProperties) {
            for (const patternKey in patternProperties) {
                if (key.match(patternKey)) {
                    keyMatchesNumericProperty = isNonNullableNumericType(patternProperties[patternKey].type);
                    break;
                }
            }
        }
        if (keyMatchesNumericProperty === undefined && additionalProperties && typeof additionalProperties !== 'boolean') {
            if (isNonNullableNumericType(additionalProperties.type)) {
                keyMatchesNumericProperty = true;
            }
        }
        newRecord[key] = keyMatchesNumericProperty ? Number(v[key]) : v[key];
    }
    return newRecord;
}
function getListDisplayValue(element) {
    if (!element.value || !Array.isArray(element.value)) {
        return [];
    }
    if (element.setting.arrayItemType === 'enum') {
        let enumOptions = [];
        if (element.setting.enum) {
            enumOptions = element.setting.enum.map((setting, i) => {
                return {
                    value: setting,
                    description: element.setting.enumDescriptions?.[i]
                };
            });
        }
        return element.value.map((key) => {
            return {
                value: {
                    type: 'enum',
                    data: key,
                    options: enumOptions
                }
            };
        });
    }
    else {
        return element.value.map((key) => {
            return {
                value: {
                    type: 'string',
                    data: key
                }
            };
        });
    }
}
function getShowAddButtonList(dataElement, listDisplayValue) {
    if (dataElement.setting.enum && dataElement.setting.uniqueItems) {
        return dataElement.setting.enum.length - listDisplayValue.length > 0;
    }
    else {
        return true;
    }
}
export function resolveSettingsTree(tocData, coreSettingsGroups, filter, logService) {
    const allSettings = getFlatSettings(coreSettingsGroups);
    return {
        tree: _resolveSettingsTree(tocData, allSettings, filter, logService),
        leftoverSettings: allSettings
    };
}
export function resolveConfiguredUntrustedSettings(groups, target, languageFilter, configurationService) {
    const allSettings = getFlatSettings(groups);
    return [...allSettings].filter(setting => setting.restricted && inspectSetting(setting.key, target, languageFilter, configurationService).isConfigured);
}
export async function createTocTreeForExtensionSettings(extensionService, groups, filter) {
    const extGroupTree = new Map();
    const addEntryToTree = (extensionId, extensionName, childEntry) => {
        if (!extGroupTree.has(extensionId)) {
            const rootEntry = {
                id: extensionId,
                label: extensionName,
                children: []
            };
            extGroupTree.set(extensionId, rootEntry);
        }
        extGroupTree.get(extensionId).children.push(childEntry);
    };
    const processGroupEntry = async (group) => {
        const flatSettings = group.sections.map(section => section.settings).flat();
        const settings = filter ? getMatchingSettings(new Set(flatSettings), filter) : flatSettings;
        sortSettings(settings);
        const extensionId = group.extensionInfo.id;
        const extension = await extensionService.getExtension(extensionId);
        const extensionName = extension?.displayName ?? extension?.name ?? extensionId;
        // There could be multiple groups with the same extension id that all belong to the same extension.
        // To avoid highlighting all groups upon expanding the extension's ToC entry,
        // use the group ID only if it is non-empty and isn't the extension ID.
        // Ref https://github.com/microsoft/vscode/issues/241521.
        const settingGroupId = (group.id && group.id !== extensionId) ? group.id : group.title;
        const childEntry = {
            id: settingGroupId,
            label: group.title,
            order: group.order,
            settings
        };
        addEntryToTree(extensionId, extensionName, childEntry);
    };
    const processPromises = groups.map(g => processGroupEntry(g));
    return Promise.all(processPromises).then(() => {
        const extGroups = [];
        for (const extensionRootEntry of extGroupTree.values()) {
            if (extensionRootEntry.children.length === 1) {
                // There is a single category for this extension.
                // Push a flattened setting.
                extGroups.push({
                    id: extensionRootEntry.id,
                    label: extensionRootEntry.children[0].label,
                    settings: extensionRootEntry.children[0].settings
                });
            }
            else {
                // Sort the categories.
                // Leave the undefined order categories untouched.
                extensionRootEntry.children.sort((a, b) => {
                    return compareTwoNullableNumbers(a.order, b.order);
                });
                // If there is a category that matches the setting name,
                // add the settings in manually as "ungrouped" settings.
                // https://github.com/microsoft/vscode/issues/137259
                const ungroupedChild = extensionRootEntry.children.find(child => child.label === extensionRootEntry.label);
                if (ungroupedChild && !ungroupedChild.children) {
                    const groupedChildren = extensionRootEntry.children.filter(child => child !== ungroupedChild);
                    extGroups.push({
                        id: extensionRootEntry.id,
                        label: extensionRootEntry.label,
                        settings: ungroupedChild.settings,
                        children: groupedChildren
                    });
                }
                else {
                    // Push all the groups as-is.
                    extGroups.push(extensionRootEntry);
                }
            }
        }
        // Sort the outermost settings.
        extGroups.sort((a, b) => a.label.localeCompare(b.label));
        return {
            id: 'extensions',
            label: localize('extensions', "Extensions"),
            children: extGroups
        };
    });
}
function _resolveSettingsTree(tocData, allSettings, filter, logService) {
    let children;
    if (tocData.children) {
        children = tocData.children
            .filter(child => child.hide !== true)
            .map(child => _resolveSettingsTree(child, allSettings, filter, logService))
            .filter(child => child.children?.length || child.settings?.length);
    }
    let settings;
    if (filter || tocData.settings) {
        settings = getMatchingSettings(allSettings, {
            include: {
                keyPatterns: [...filter?.include?.keyPatterns ?? [], ...tocData.settings ?? []],
                tags: filter?.include?.tags ? [...filter.include.tags] : []
            },
            exclude: filter?.exclude ?? {}
        });
        sortSettings(settings);
    }
    if (!children && !settings) {
        throw new Error(`TOC node has no child groups or settings: ${tocData.id}`);
    }
    return {
        id: tocData.id,
        label: tocData.label,
        children,
        settings
    };
}
/**
 * Sort settings so that preview and experimental settings are deprioritized.
 * Within each tier, sort the settings by order, then alphabetically.
 */
function sortSettings(settings) {
    const SETTING_STATUS_NORMAL = 0;
    const SETTING_STATUS_PREVIEW = 1;
    const SETTING_STATUS_EXPERIMENTAL = 2;
    const getExperimentalStatus = (setting) => {
        if (setting.tags?.includes('experimental')) {
            return SETTING_STATUS_EXPERIMENTAL;
        }
        else if (setting.tags?.includes('preview')) {
            return SETTING_STATUS_PREVIEW;
        }
        return SETTING_STATUS_NORMAL;
    };
    settings.sort((a, b) => {
        const experimentalStatusA = getExperimentalStatus(a);
        const experimentalStatusB = getExperimentalStatus(b);
        if (experimentalStatusA !== experimentalStatusB) {
            return experimentalStatusA - experimentalStatusB;
        }
        const orderComparison = compareTwoNullableNumbers(a.order, b.order);
        return orderComparison !== 0 ? orderComparison : a.key.localeCompare(b.key);
    });
}
function getMatchingSettings(allSettings, filter) {
    const result = [];
    allSettings.forEach(setting => {
        let shouldInclude = false;
        let shouldExclude = false;
        // Check include filters
        if (filter.include?.keyPatterns) {
            shouldInclude = filter.include.keyPatterns.some(pattern => {
                if (pattern.startsWith('@tag:')) {
                    const tagName = pattern.substring(5);
                    return setting.tags?.includes(tagName);
                }
                else {
                    return settingMatches(setting, pattern);
                }
            });
        }
        else {
            shouldInclude = true;
        }
        if (shouldInclude && filter.include?.tags?.length) {
            shouldInclude = filter.include.tags.some(tag => setting.tags?.includes(tag));
        }
        // Check exclude filters (takes precedence)
        if (filter.exclude?.keyPatterns) {
            shouldExclude = filter.exclude.keyPatterns.some(pattern => {
                if (pattern.startsWith('@tag:')) {
                    const tagName = pattern.substring(5);
                    return setting.tags?.includes(tagName);
                }
                else {
                    return settingMatches(setting, pattern);
                }
            });
        }
        if (!shouldExclude && filter.exclude?.tags?.length) {
            shouldExclude = filter.exclude.tags.some(tag => setting.tags?.includes(tag));
        }
        // Include if matches include filter and doesn't match exclude filter
        if (shouldInclude && !shouldExclude) {
            result.push(setting);
            if (!multiGroupTocSettings.has(setting.key)) {
                allSettings.delete(setting);
            }
        }
    });
    return result;
}
const settingPatternCache = new Map();
export function createSettingMatchRegExp(pattern) {
    pattern = escapeRegExpCharacters(pattern)
        .replace(/\\\*/g, '.*');
    return new RegExp(`^${pattern}$`, 'i');
}
function settingMatches(s, pattern) {
    let regExp = settingPatternCache.get(pattern);
    if (!regExp) {
        regExp = createSettingMatchRegExp(pattern);
        settingPatternCache.set(pattern, regExp);
    }
    return regExp.test(s.key);
}
function getFlatSettings(settingsGroups) {
    const result = new Set();
    for (const group of settingsGroups) {
        for (const section of group.sections) {
            for (const s of section.settings) {
                if (!s.overrides || !s.overrides.length) {
                    result.add(s);
                }
            }
        }
    }
    return result;
}
const SETTINGS_TEXT_TEMPLATE_ID = 'settings.text.template';
const SETTINGS_MULTILINE_TEXT_TEMPLATE_ID = 'settings.multilineText.template';
const SETTINGS_NUMBER_TEMPLATE_ID = 'settings.number.template';
const SETTINGS_ENUM_TEMPLATE_ID = 'settings.enum.template';
const SETTINGS_BOOL_TEMPLATE_ID = 'settings.bool.template';
const SETTINGS_ARRAY_TEMPLATE_ID = 'settings.array.template';
const SETTINGS_EXCLUDE_TEMPLATE_ID = 'settings.exclude.template';
const SETTINGS_INCLUDE_TEMPLATE_ID = 'settings.include.template';
const SETTINGS_OBJECT_TEMPLATE_ID = 'settings.object.template';
const SETTINGS_BOOL_OBJECT_TEMPLATE_ID = 'settings.boolObject.template';
const SETTINGS_COMPLEX_TEMPLATE_ID = 'settings.complex.template';
const SETTINGS_COMPLEX_OBJECT_TEMPLATE_ID = 'settings.complexObject.template';
const SETTINGS_NEW_EXTENSIONS_TEMPLATE_ID = 'settings.newExtensions.template';
const SETTINGS_ELEMENT_TEMPLATE_ID = 'settings.group.template';
const SETTINGS_EXTENSION_TOGGLE_TEMPLATE_ID = 'settings.extensionToggle.template';
function removeChildrenFromTabOrder(node) {
    // eslint-disable-next-line no-restricted-syntax
    const focusableElements = node.querySelectorAll(`
		[tabindex="0"],
		input:not([tabindex="-1"]),
		select:not([tabindex="-1"]),
		textarea:not([tabindex="-1"]),
		a:not([tabindex="-1"]),
		button:not([tabindex="-1"]),
		area:not([tabindex="-1"])
	`);
    focusableElements.forEach(element => {
        element.setAttribute(AbstractSettingRenderer.ELEMENT_FOCUSABLE_ATTR, 'true');
        element.setAttribute('tabindex', '-1');
    });
}
function addChildrenToTabOrder(node) {
    // eslint-disable-next-line no-restricted-syntax
    const focusableElements = node.querySelectorAll(`[${AbstractSettingRenderer.ELEMENT_FOCUSABLE_ATTR}="true"]`);
    focusableElements.forEach(element => {
        element.removeAttribute(AbstractSettingRenderer.ELEMENT_FOCUSABLE_ATTR);
        element.setAttribute('tabindex', '0');
    });
}
let AbstractSettingRenderer = class AbstractSettingRenderer extends Disposable {
    static { AbstractSettingRenderer_1 = this; }
    static { this.CONTROL_CLASS = 'setting-control-focus-target'; }
    static { this.CONTROL_SELECTOR = '.' + this.CONTROL_CLASS; }
    static { this.CONTENTS_CLASS = 'setting-item-contents'; }
    static { this.CONTENTS_SELECTOR = '.' + this.CONTENTS_CLASS; }
    static { this.ALL_ROWS_SELECTOR = '.monaco-list-row'; }
    static { this.SETTING_KEY_ATTR = 'data-key'; }
    static { this.SETTING_ID_ATTR = 'data-id'; }
    static { this.ELEMENT_FOCUSABLE_ATTR = 'data-focusable'; }
    constructor(settingActions, disposableActionFactory, _themeService, _contextViewService, _openerService, _instantiationService, _commandService, _contextMenuService, _keybindingService, _configService, _extensionsService, _extensionsWorkbenchService, _productService, _telemetryService, _hoverService, _markdownRendererService) {
        super();
        this.settingActions = settingActions;
        this.disposableActionFactory = disposableActionFactory;
        this._themeService = _themeService;
        this._contextViewService = _contextViewService;
        this._openerService = _openerService;
        this._instantiationService = _instantiationService;
        this._commandService = _commandService;
        this._contextMenuService = _contextMenuService;
        this._keybindingService = _keybindingService;
        this._configService = _configService;
        this._extensionsService = _extensionsService;
        this._extensionsWorkbenchService = _extensionsWorkbenchService;
        this._productService = _productService;
        this._telemetryService = _telemetryService;
        this._hoverService = _hoverService;
        this._markdownRendererService = _markdownRendererService;
        this._onDidClickOverrideElement = this._register(new Emitter());
        this.onDidClickOverrideElement = this._onDidClickOverrideElement.event;
        this._onDidChangeSetting = this._register(new Emitter());
        this.onDidChangeSetting = this._onDidChangeSetting.event;
        this._onDidOpenSettings = this._register(new Emitter());
        this.onDidOpenSettings = this._onDidOpenSettings.event;
        this._onDidClickSettingLink = this._register(new Emitter());
        this.onDidClickSettingLink = this._onDidClickSettingLink.event;
        this._onDidFocusSetting = this._register(new Emitter());
        this.onDidFocusSetting = this._onDidFocusSetting.event;
        this._onDidChangeIgnoredSettings = this._register(new Emitter());
        this.onDidChangeIgnoredSettings = this._onDidChangeIgnoredSettings.event;
        this._onDidChangeSettingHeight = this._register(new Emitter());
        this.onDidChangeSettingHeight = this._onDidChangeSettingHeight.event;
        this._onApplyFilter = this._register(new Emitter());
        this.onApplyFilter = this._onApplyFilter.event;
        this.ignoredSettings = getIgnoredSettings(getDefaultIgnoredSettings(), this._configService);
        this._register(this._configService.onDidChangeConfiguration(e => {
            this.ignoredSettings = getIgnoredSettings(getDefaultIgnoredSettings(), this._configService);
            this._onDidChangeIgnoredSettings.fire();
        }));
    }
    renderCommonTemplate(tree, _container, typeClass) {
        _container.classList.add('setting-item');
        _container.classList.add('setting-item-' + typeClass);
        const toDispose = new DisposableStore();
        const container = DOM.append(_container, $(AbstractSettingRenderer_1.CONTENTS_SELECTOR));
        container.classList.add('settings-row-inner-container');
        const titleElement = DOM.append(container, $('.setting-item-title'));
        const labelCategoryContainer = DOM.append(titleElement, $('.setting-item-cat-label-container'));
        const categoryElement = DOM.append(labelCategoryContainer, $('span.setting-item-category'));
        const labelElementContainer = DOM.append(labelCategoryContainer, $('span.setting-item-label'));
        const labelElement = toDispose.add(new SimpleIconLabel(labelElementContainer));
        const indicatorsLabel = toDispose.add(this._instantiationService.createInstance(SettingsTreeIndicatorsLabel, titleElement));
        const descriptionElement = DOM.append(container, $('.setting-item-description'));
        const modifiedIndicatorElement = DOM.append(container, $('.setting-item-modified-indicator'));
        toDispose.add(this._hoverService.setupDelayedHover(modifiedIndicatorElement, {
            content: localize('modified', "The setting has been configured in the current scope.")
        }));
        const valueElement = DOM.append(container, $('.setting-item-value'));
        const controlElement = DOM.append(valueElement, $('div.setting-item-control'));
        const deprecationWarningElement = DOM.append(container, $('.setting-item-deprecation-message'));
        const toolbarContainer = DOM.append(container, $('.setting-toolbar-container'));
        const toolbar = this.renderSettingToolbar(toolbarContainer);
        const template = {
            toDispose,
            elementDisposables: toDispose.add(new DisposableStore()),
            containerElement: container,
            categoryElement,
            labelElement,
            descriptionElement,
            controlElement,
            deprecationWarningElement,
            indicatorsLabel,
            toolbar
        };
        // Prevent clicks from being handled by list
        toDispose.add(DOM.addDisposableListener(controlElement, DOM.EventType.MOUSE_DOWN, e => e.stopPropagation()));
        toDispose.add(DOM.addDisposableListener(titleElement, DOM.EventType.MOUSE_ENTER, e => container.classList.add('mouseover')));
        toDispose.add(DOM.addDisposableListener(titleElement, DOM.EventType.MOUSE_LEAVE, e => container.classList.remove('mouseover')));
        return template;
    }
    addSettingElementFocusHandler(template) {
        const focusTracker = DOM.trackFocus(template.containerElement);
        template.toDispose.add(focusTracker);
        template.toDispose.add(focusTracker.onDidBlur(() => {
            if (template.containerElement.classList.contains('focused')) {
                template.containerElement.classList.remove('focused');
            }
        }));
        template.toDispose.add(focusTracker.onDidFocus(() => {
            template.containerElement.classList.add('focused');
            if (template.context) {
                this._onDidFocusSetting.fire(template.context);
            }
        }));
    }
    renderSettingToolbar(container) {
        const toggleMenuTitle = this._keybindingService.appendKeybinding(localize('settingsContextMenuTitle', "More Actions... "), SETTINGS_EDITOR_COMMAND_SHOW_CONTEXT_MENU);
        const toolbar = new ToolBar(container, this._contextMenuService, {
            toggleMenuTitle,
            renderDropdownAsChildElement: !isIOS,
            moreIcon: settingsMoreActionIcon
        });
        return toolbar;
    }
    renderSettingElement(node, index, template) {
        const element = node.element;
        // The element must inspect itself to get information for
        // the modified indicator and the overridden Settings indicators.
        element.inspectSelf();
        template.context = element;
        template.toolbar.context = element;
        const actions = this.disposableActionFactory(element.setting, element.settingsTarget);
        actions.forEach(a => isDisposable(a) && template.elementDisposables.add(a));
        template.toolbar.setActions([], [...this.settingActions, ...actions]);
        const setting = element.setting;
        template.containerElement.classList.toggle('is-configured', element.isConfigured);
        template.containerElement.setAttribute(AbstractSettingRenderer_1.SETTING_KEY_ATTR, element.setting.key);
        template.containerElement.setAttribute(AbstractSettingRenderer_1.SETTING_ID_ATTR, element.id);
        const titleTooltip = setting.key + (element.isConfigured ? ' - Modified' : '');
        template.categoryElement.textContent = element.displayCategory ? (element.displayCategory + ': ') : '';
        template.elementDisposables.add(this._hoverService.setupDelayedHover(template.categoryElement, { content: titleTooltip }));
        template.labelElement.text = element.displayLabel;
        template.labelElement.title = titleTooltip;
        template.descriptionElement.innerText = '';
        if (element.setting.descriptionIsMarkdown) {
            const renderedDescription = this.renderSettingMarkdown(element, template.containerElement, element.description, template.elementDisposables);
            template.descriptionElement.appendChild(renderedDescription);
        }
        else {
            template.descriptionElement.innerText = element.description;
        }
        template.indicatorsLabel.updateScopeOverrides(element, this._onDidClickOverrideElement, this._onApplyFilter);
        template.elementDisposables.add(this._configService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(APPLY_ALL_PROFILES_SETTING)) {
                template.indicatorsLabel.updateScopeOverrides(element, this._onDidClickOverrideElement, this._onApplyFilter);
            }
        }));
        const onChange = (value) => this._onDidChangeSetting.fire({
            key: element.setting.key,
            value,
            type: template.context.valueType,
            manualReset: false,
            scope: element.setting.scope
        });
        const deprecationText = element.setting.deprecationMessage || '';
        if (deprecationText && element.setting.deprecationMessageIsMarkdown) {
            template.deprecationWarningElement.innerText = '';
            template.deprecationWarningElement.appendChild(this.renderSettingMarkdown(element, template.containerElement, element.setting.deprecationMessage, template.elementDisposables));
        }
        else {
            template.deprecationWarningElement.innerText = deprecationText;
        }
        template.deprecationWarningElement.prepend($('.codicon.codicon-error'));
        template.containerElement.classList.toggle('is-deprecated', !!deprecationText);
        this.renderValue(element, template, onChange);
        template.indicatorsLabel.updateWorkspaceTrust(element);
        template.indicatorsLabel.updateSyncIgnored(element, this.ignoredSettings);
        template.indicatorsLabel.updateDefaultOverrideIndicator(element);
        template.indicatorsLabel.updatePreviewIndicator(element);
        template.indicatorsLabel.updateAdvancedIndicator(element);
        template.elementDisposables.add(this.onDidChangeIgnoredSettings(() => {
            template.indicatorsLabel.updateSyncIgnored(element, this.ignoredSettings);
        }));
        this.updateSettingTabbable(element, template);
        template.elementDisposables.add(element.onDidChangeTabbable(() => {
            this.updateSettingTabbable(element, template);
        }));
    }
    updateSettingTabbable(element, template) {
        if (element.tabbable) {
            addChildrenToTabOrder(template.containerElement);
        }
        else {
            removeChildrenFromTabOrder(template.containerElement);
        }
    }
    renderSettingMarkdown(element, container, text, disposables) {
        // Rewrite `#editor.fontSize#` to link format
        text = fixSettingLinks(text);
        const renderedMarkdown = disposables.add(this._markdownRendererService.render({ value: text, isTrusted: true }, {
            actionHandler: (content) => {
                if (content.startsWith('#')) {
                    const e = {
                        source: element,
                        targetKey: content.substring(1)
                    };
                    this._onDidClickSettingLink.fire(e);
                }
                else {
                    this._openerService.open(content, { allowCommands: true }).catch(onUnexpectedError);
                }
            },
            asyncRenderCallback: () => {
                const height = container.clientHeight;
                if (height) {
                    this._onDidChangeSettingHeight.fire({ element, height });
                }
            },
        }));
        renderedMarkdown.element.classList.add('setting-item-markdown');
        cleanRenderedMarkdown(renderedMarkdown.element);
        return renderedMarkdown.element;
    }
    disposeTemplate(template) {
        template.toDispose.dispose();
    }
    disposeElement(_element, _index, template) {
        template.elementDisposables?.clear();
    }
};
AbstractSettingRenderer = AbstractSettingRenderer_1 = __decorate([
    __param(2, IThemeService),
    __param(3, IContextViewService),
    __param(4, IOpenerService),
    __param(5, IInstantiationService),
    __param(6, ICommandService),
    __param(7, IContextMenuService),
    __param(8, IKeybindingService),
    __param(9, IConfigurationService),
    __param(10, IExtensionService),
    __param(11, IExtensionsWorkbenchService),
    __param(12, IProductService),
    __param(13, ITelemetryService),
    __param(14, IHoverService),
    __param(15, IMarkdownRendererService)
], AbstractSettingRenderer);
export { AbstractSettingRenderer };
class SettingGroupRenderer {
    constructor() {
        this.templateId = SETTINGS_ELEMENT_TEMPLATE_ID;
    }
    renderTemplate(container) {
        container.classList.add('group-title');
        const template = {
            parent: container,
            toDispose: new DisposableStore()
        };
        return template;
    }
    renderElement(element, index, templateData) {
        templateData.parent.innerText = '';
        const labelElement = DOM.append(templateData.parent, $('div.settings-group-title-label.settings-row-inner-container'));
        labelElement.classList.add(`settings-group-level-${element.element.level}`);
        labelElement.textContent = element.element.label;
        if (element.element.isFirstGroup) {
            labelElement.classList.add('settings-group-first');
        }
    }
    disposeTemplate(templateData) {
        templateData.toDispose.dispose();
    }
}
let SettingNewExtensionsRenderer = class SettingNewExtensionsRenderer {
    constructor(_commandService) {
        this._commandService = _commandService;
        this.templateId = SETTINGS_NEW_EXTENSIONS_TEMPLATE_ID;
    }
    renderTemplate(container) {
        const toDispose = new DisposableStore();
        container.classList.add('setting-item-new-extensions');
        const button = new Button(container, { title: true, ...defaultButtonStyles });
        toDispose.add(button);
        toDispose.add(button.onDidClick(() => {
            if (template.context) {
                this._commandService.executeCommand('workbench.extensions.action.showExtensionsWithIds', template.context.extensionIds);
            }
        }));
        button.label = localize('newExtensionsButtonLabel', "Show matching extensions");
        button.element.classList.add('settings-new-extensions-button');
        const template = {
            button,
            toDispose
        };
        return template;
    }
    renderElement(element, index, templateData) {
        templateData.context = element.element;
    }
    disposeTemplate(template) {
        template.toDispose.dispose();
    }
};
SettingNewExtensionsRenderer = __decorate([
    __param(0, ICommandService)
], SettingNewExtensionsRenderer);
export { SettingNewExtensionsRenderer };
export class SettingComplexRenderer extends AbstractSettingRenderer {
    constructor() {
        super(...arguments);
        this.templateId = SETTINGS_COMPLEX_TEMPLATE_ID;
    }
    static { this.EDIT_IN_JSON_LABEL = localize('editInSettingsJson', "Edit in settings.json"); }
    renderTemplate(container) {
        const common = this.renderCommonTemplate(null, container, 'complex');
        const openSettingsButton = DOM.append(common.controlElement, $('a.edit-in-settings-button'));
        openSettingsButton.classList.add(AbstractSettingRenderer.CONTROL_CLASS);
        openSettingsButton.role = 'button';
        const validationErrorMessageElement = $('.setting-item-validation-message');
        common.containerElement.appendChild(validationErrorMessageElement);
        const template = {
            ...common,
            button: openSettingsButton,
            validationErrorMessageElement
        };
        this.addSettingElementFocusHandler(template);
        return template;
    }
    renderElement(element, index, templateData) {
        super.renderSettingElement(element, index, templateData);
    }
    renderValue(dataElement, template, onChange) {
        const plainKey = getLanguageTagSettingPlainKey(dataElement.setting.key);
        const editLanguageSettingLabel = localize('editLanguageSettingLabel', "Edit settings for {0}", plainKey);
        const isLanguageTagSetting = dataElement.setting.isLanguageTagSetting;
        template.button.textContent = isLanguageTagSetting
            ? editLanguageSettingLabel
            : SettingComplexRenderer.EDIT_IN_JSON_LABEL;
        const onClickOrKeydown = (e) => {
            if (isLanguageTagSetting) {
                this._onApplyFilter.fire(`@${LANGUAGE_SETTING_TAG}${plainKey.replaceAll(' ', '')}`);
            }
            else {
                this._onDidOpenSettings.fire(dataElement.setting.key);
            }
            e.preventDefault();
            e.stopPropagation();
        };
        template.elementDisposables.add(DOM.addDisposableListener(template.button, DOM.EventType.CLICK, (e) => {
            onClickOrKeydown(e);
        }));
        template.elementDisposables.add(DOM.addDisposableListener(template.button, DOM.EventType.KEY_DOWN, (e) => {
            const ev = new StandardKeyboardEvent(e);
            if (ev.equals(10 /* KeyCode.Space */) || ev.equals(3 /* KeyCode.Enter */)) {
                onClickOrKeydown(e);
            }
        }));
        this.renderValidations(dataElement, template);
        if (isLanguageTagSetting) {
            template.button.setAttribute('aria-label', editLanguageSettingLabel);
        }
        else {
            template.button.setAttribute('aria-label', `${SettingComplexRenderer.EDIT_IN_JSON_LABEL}: ${dataElement.setting.key}`);
        }
    }
    renderValidations(dataElement, template) {
        const errMsg = dataElement.isConfigured && getInvalidTypeError(dataElement.value, dataElement.setting.type);
        if (errMsg) {
            template.containerElement.classList.add('invalid-input');
            template.validationErrorMessageElement.innerText = errMsg;
            return;
        }
        template.containerElement.classList.remove('invalid-input');
    }
}
class SettingComplexObjectRenderer extends SettingComplexRenderer {
    constructor() {
        super(...arguments);
        this.templateId = SETTINGS_COMPLEX_OBJECT_TEMPLATE_ID;
    }
    renderTemplate(container) {
        const common = this.renderCommonTemplate(null, container, 'list');
        const objectSettingWidget = common.toDispose.add(this._instantiationService.createInstance(ObjectSettingDropdownWidget, common.controlElement));
        objectSettingWidget.domNode.classList.add(AbstractSettingRenderer.CONTROL_CLASS);
        const openSettingsButton = DOM.append(DOM.append(common.controlElement, $('.complex-object-edit-in-settings-button-container')), $('a.complex-object.edit-in-settings-button'));
        openSettingsButton.classList.add(AbstractSettingRenderer.CONTROL_CLASS);
        openSettingsButton.role = 'button';
        const validationErrorMessageElement = $('.setting-item-validation-message');
        common.containerElement.appendChild(validationErrorMessageElement);
        const template = {
            ...common,
            button: openSettingsButton,
            validationErrorMessageElement,
            objectSettingWidget
        };
        this.addSettingElementFocusHandler(template);
        return template;
    }
    renderValue(dataElement, template, onChange) {
        const items = getObjectDisplayValue(dataElement);
        template.objectSettingWidget.setValue(items, {
            settingKey: dataElement.setting.key,
            showAddButton: false,
            isReadOnly: true,
        });
        template.button.parentElement?.classList.toggle('hide', dataElement.hasPolicyValue);
        super.renderValue(dataElement, template, onChange);
    }
}
class SettingArrayRenderer extends AbstractSettingRenderer {
    constructor() {
        super(...arguments);
        this.templateId = SETTINGS_ARRAY_TEMPLATE_ID;
    }
    renderTemplate(container) {
        const common = this.renderCommonTemplate(null, container, 'list');
        // eslint-disable-next-line no-restricted-syntax
        const descriptionElement = common.containerElement.querySelector('.setting-item-description');
        const validationErrorMessageElement = $('.setting-item-validation-message');
        descriptionElement.after(validationErrorMessageElement);
        const listWidget = this._instantiationService.createInstance(ListSettingWidget, common.controlElement);
        listWidget.domNode.classList.add(AbstractSettingRenderer.CONTROL_CLASS);
        common.toDispose.add(listWidget);
        const template = {
            ...common,
            listWidget,
            validationErrorMessageElement
        };
        this.addSettingElementFocusHandler(template);
        common.toDispose.add(listWidget.onDidChangeList(e => {
            const newList = this.computeNewList(template, e);
            template.onChange?.(newList);
        }));
        return template;
    }
    computeNewList(template, e) {
        if (template.context) {
            let newValue = [];
            if (Array.isArray(template.context.scopeValue)) {
                newValue = [...template.context.scopeValue];
            }
            else if (Array.isArray(template.context.value)) {
                newValue = [...template.context.value];
            }
            if (e.type === 'move') {
                // A drag and drop occurred
                const sourceIndex = e.sourceIndex;
                const targetIndex = e.targetIndex;
                const splicedElem = newValue.splice(sourceIndex, 1)[0];
                newValue.splice(targetIndex, 0, splicedElem);
            }
            else if (e.type === 'remove' || e.type === 'reset') {
                newValue.splice(e.targetIndex, 1);
            }
            else if (e.type === 'change') {
                const itemValueData = e.newItem.value.data.toString();
                // Update value
                if (e.targetIndex > -1) {
                    newValue[e.targetIndex] = itemValueData;
                }
                // For some reason, we are updating and cannot find original value
                // Just append the value in this case
                else {
                    newValue.push(itemValueData);
                }
            }
            else if (e.type === 'add') {
                newValue.push(e.newItem.value.data.toString());
            }
            if (template.context.defaultValue &&
                Array.isArray(template.context.defaultValue) &&
                template.context.defaultValue.length === newValue.length &&
                template.context.defaultValue.join() === newValue.join()) {
                return undefined;
            }
            return newValue;
        }
        return undefined;
    }
    renderElement(element, index, templateData) {
        super.renderSettingElement(element, index, templateData);
    }
    renderValue(dataElement, template, onChange) {
        const value = getListDisplayValue(dataElement);
        const keySuggester = dataElement.setting.enum ? createArraySuggester(dataElement) : undefined;
        template.listWidget.setValue(value, {
            showAddButton: getShowAddButtonList(dataElement, value),
            keySuggester
        });
        template.context = dataElement;
        template.elementDisposables.add(toDisposable(() => {
            template.listWidget.cancelEdit();
        }));
        template.onChange = (v) => {
            if (v && !renderArrayValidations(dataElement, template, v, false)) {
                const itemType = dataElement.setting.arrayItemType;
                const arrToSave = isNonNullableNumericType(itemType) ? v.map(a => +a) : v;
                onChange(arrToSave);
            }
            else {
                // Save the setting unparsed and containing the errors.
                // renderArrayValidations will render relevant error messages.
                onChange(v);
            }
        };
        renderArrayValidations(dataElement, template, value.map(v => v.value.data.toString()), true);
    }
}
class AbstractSettingObjectRenderer extends AbstractSettingRenderer {
    renderTemplateWithWidget(common, widget) {
        widget.domNode.classList.add(AbstractSettingRenderer.CONTROL_CLASS);
        common.toDispose.add(widget);
        // eslint-disable-next-line no-restricted-syntax
        const descriptionElement = common.containerElement.querySelector('.setting-item-description');
        const validationErrorMessageElement = $('.setting-item-validation-message');
        descriptionElement.after(validationErrorMessageElement);
        const template = {
            ...common,
            validationErrorMessageElement
        };
        if (widget instanceof ObjectSettingCheckboxWidget) {
            template.objectCheckboxWidget = widget;
        }
        else {
            template.objectDropdownWidget = widget;
        }
        this.addSettingElementFocusHandler(template);
        return template;
    }
    renderElement(element, index, templateData) {
        super.renderSettingElement(element, index, templateData);
    }
}
class SettingObjectRenderer extends AbstractSettingObjectRenderer {
    constructor() {
        super(...arguments);
        this.templateId = SETTINGS_OBJECT_TEMPLATE_ID;
    }
    renderTemplate(container) {
        const common = this.renderCommonTemplate(null, container, 'list');
        const widget = this._instantiationService.createInstance(ObjectSettingDropdownWidget, common.controlElement);
        const template = this.renderTemplateWithWidget(common, widget);
        common.toDispose.add(widget.onDidChangeList(e => {
            this.onDidChangeObject(template, e);
        }));
        return template;
    }
    onDidChangeObject(template, e) {
        const widget = template.objectDropdownWidget;
        if (template.context) {
            const settingSupportsRemoveDefault = objectSettingSupportsRemoveDefaultValue(template.context.setting.key);
            const defaultValue = typeof template.context.defaultValue === 'object'
                ? template.context.defaultValue ?? {}
                : {};
            const scopeValue = typeof template.context.scopeValue === 'object'
                ? template.context.scopeValue ?? {}
                : {};
            const newValue = { ...template.context.scopeValue }; // Initialize with scoped values as removed default values are not rendered
            const newItems = [];
            widget.items.forEach((item, idx) => {
                // Item was updated
                if ((e.type === 'change' || e.type === 'move') && e.targetIndex === idx) {
                    // If the key of the default value is changed, remove the default value
                    if (e.originalItem.key.data !== e.newItem.key.data && settingSupportsRemoveDefault && e.originalItem.key.data in defaultValue) {
                        newValue[e.originalItem.key.data] = null;
                    }
                    else {
                        delete newValue[e.originalItem.key.data];
                    }
                    newValue[e.newItem.key.data] = e.newItem.value.data;
                    newItems.push(e.newItem);
                }
                // All remaining items, but skip the one that we just updated
                else if ((e.type !== 'change' && e.type !== 'move') || e.newItem.key.data !== item.key.data) {
                    newValue[item.key.data] = item.value.data;
                    newItems.push(item);
                }
            });
            // Item was deleted
            if (e.type === 'remove' || e.type === 'reset') {
                const objectKey = e.originalItem.key.data;
                const removingDefaultValue = e.type === 'remove' && settingSupportsRemoveDefault && defaultValue[objectKey] === e.originalItem.value.data;
                if (removingDefaultValue) {
                    newValue[objectKey] = null;
                }
                else {
                    delete newValue[objectKey];
                }
                const itemToDelete = newItems.findIndex(item => item.key.data === objectKey);
                const defaultItemValue = defaultValue[objectKey];
                // Item does not have a default or default is bing removed
                if (removingDefaultValue || isUndefinedOrNull(defaultValue[objectKey]) && itemToDelete > -1) {
                    newItems.splice(itemToDelete, 1);
                }
                else if (!removingDefaultValue && itemToDelete > -1) {
                    newItems[itemToDelete].value.data = defaultItemValue;
                }
            }
            // New item was added
            else if (e.type === 'add') {
                newValue[e.newItem.key.data] = e.newItem.value.data;
                newItems.push(e.newItem);
            }
            Object.entries(newValue).forEach(([key, value]) => {
                // value from the scope has changed back to the default
                if (scopeValue[key] !== value && defaultValue[key] === value && !(settingSupportsRemoveDefault && value === null)) {
                    delete newValue[key];
                }
            });
            const newObject = Object.keys(newValue).length === 0 ? undefined : newValue;
            template.objectDropdownWidget.setValue(newItems);
            template.onChange?.(newObject);
        }
    }
    renderValue(dataElement, template, onChange) {
        const items = getObjectDisplayValue(dataElement);
        const { key, objectProperties, objectPatternProperties, objectAdditionalProperties, propertyNames } = dataElement.setting;
        template.objectDropdownWidget.setValue(items, {
            settingKey: key,
            showAddButton: objectAdditionalProperties === false
                ? (!areAllPropertiesDefined(Object.keys(objectProperties ?? {}), items) ||
                    isDefined(objectPatternProperties))
                : true,
            keySuggester: createObjectKeySuggester(dataElement),
            valueSuggester: createObjectValueSuggester(dataElement),
            propertyNames
        });
        template.context = dataElement;
        template.elementDisposables.add(toDisposable(() => {
            template.objectDropdownWidget.cancelEdit();
        }));
        template.onChange = (v) => {
            if (v && !renderArrayValidations(dataElement, template, v, false)) {
                const parsedRecord = parseNumericObjectValues(dataElement, v);
                onChange(parsedRecord);
            }
            else {
                // Save the setting unparsed and containing the errors.
                // renderArrayValidations will render relevant error messages.
                onChange(v);
            }
        };
        renderArrayValidations(dataElement, template, dataElement.value, true);
    }
}
class SettingBoolObjectRenderer extends AbstractSettingObjectRenderer {
    constructor() {
        super(...arguments);
        this.templateId = SETTINGS_BOOL_OBJECT_TEMPLATE_ID;
    }
    renderTemplate(container) {
        const common = this.renderCommonTemplate(null, container, 'list');
        const widget = this._instantiationService.createInstance(ObjectSettingCheckboxWidget, common.controlElement);
        const template = this.renderTemplateWithWidget(common, widget);
        common.toDispose.add(widget.onDidChangeList(e => {
            this.onDidChangeObject(template, e);
        }));
        return template;
    }
    onDidChangeObject(template, e) {
        if (template.context) {
            const widget = template.objectCheckboxWidget;
            const defaultValue = typeof template.context.defaultValue === 'object'
                ? template.context.defaultValue ?? {}
                : {};
            const scopeValue = typeof template.context.scopeValue === 'object'
                ? template.context.scopeValue ?? {}
                : {};
            const newValue = { ...template.context.scopeValue }; // Initialize with scoped values as removed default values are not rendered
            const newItems = [];
            if (e.type !== 'change') {
                console.warn('Unexpected event type', e.type, 'for bool object setting', template.context.setting.key);
                return;
            }
            widget.items.forEach((item, idx) => {
                // Item was updated
                if (e.targetIndex === idx) {
                    newValue[e.newItem.key.data] = e.newItem.value.data;
                    newItems.push(e.newItem);
                }
                // All remaining items, but skip the one that we just updated
                else if (e.newItem.key.data !== item.key.data) {
                    newValue[item.key.data] = item.value.data;
                    newItems.push(item);
                }
            });
            Object.entries(newValue).forEach(([key, value]) => {
                // value from the scope has changed back to the default
                if (scopeValue[key] !== value && defaultValue[key] === value) {
                    delete newValue[key];
                }
            });
            const newObject = Object.keys(newValue).length === 0 ? undefined : newValue;
            template.objectCheckboxWidget.setValue(newItems);
            template.onChange?.(newObject);
            // Focus this setting explicitly, in case we were previously
            // focused on another setting and clicked a checkbox/value container
            // for this setting.
            this._onDidFocusSetting.fire(template.context);
        }
    }
    renderValue(dataElement, template, onChange) {
        const items = getBoolObjectDisplayValue(dataElement);
        const { key } = dataElement.setting;
        template.objectCheckboxWidget.setValue(items, {
            settingKey: key
        });
        template.context = dataElement;
        template.onChange = (v) => {
            onChange(v);
        };
    }
}
class SettingIncludeExcludeRenderer extends AbstractSettingRenderer {
    renderTemplate(container) {
        const common = this.renderCommonTemplate(null, container, 'list');
        const includeExcludeWidget = this._instantiationService.createInstance(this.isExclude() ? ExcludeSettingWidget : IncludeSettingWidget, common.controlElement);
        includeExcludeWidget.domNode.classList.add(AbstractSettingRenderer.CONTROL_CLASS);
        common.toDispose.add(includeExcludeWidget);
        const template = {
            ...common,
            includeExcludeWidget
        };
        this.addSettingElementFocusHandler(template);
        common.toDispose.add(includeExcludeWidget.onDidChangeList(e => this.onDidChangeIncludeExclude(template, e)));
        return template;
    }
    onDidChangeIncludeExclude(template, e) {
        if (template.context) {
            const newValue = { ...template.context.scopeValue };
            // first delete the existing entry, if present
            if (e.type !== 'add') {
                if (e.originalItem.value.data.toString() in template.context.defaultValue) {
                    // delete a default by overriding it
                    newValue[e.originalItem.value.data.toString()] = false;
                }
                else {
                    delete newValue[e.originalItem.value.data.toString()];
                }
            }
            // then add the new or updated entry, if present
            if (e.type === 'change' || e.type === 'add' || e.type === 'move') {
                if (e.newItem.value.data.toString() in template.context.defaultValue && !e.newItem.sibling) {
                    // add a default by deleting its override
                    delete newValue[e.newItem.value.data.toString()];
                }
                else {
                    newValue[e.newItem.value.data.toString()] = e.newItem.sibling ? { when: e.newItem.sibling } : true;
                }
            }
            function sortKeys(obj) {
                const sortedKeys = Object.keys(obj)
                    .sort((a, b) => a.localeCompare(b));
                const retVal = {};
                for (const key of sortedKeys) {
                    retVal[key] = obj[key];
                }
                return retVal;
            }
            this._onDidChangeSetting.fire({
                key: template.context.setting.key,
                value: Object.keys(newValue).length === 0 ? undefined : sortKeys(newValue),
                type: template.context.valueType,
                manualReset: false,
                scope: template.context.setting.scope
            });
        }
    }
    renderElement(element, index, templateData) {
        super.renderSettingElement(element, index, templateData);
    }
    renderValue(dataElement, template, onChange) {
        const value = getIncludeExcludeDisplayValue(dataElement);
        template.includeExcludeWidget.setValue(value, { isReadOnly: dataElement.hasPolicyValue });
        template.context = dataElement;
        template.elementDisposables.add(toDisposable(() => {
            template.includeExcludeWidget.cancelEdit();
        }));
    }
}
class SettingExcludeRenderer extends SettingIncludeExcludeRenderer {
    constructor() {
        super(...arguments);
        this.templateId = SETTINGS_EXCLUDE_TEMPLATE_ID;
    }
    isExclude() {
        return true;
    }
}
class SettingIncludeRenderer extends SettingIncludeExcludeRenderer {
    constructor() {
        super(...arguments);
        this.templateId = SETTINGS_INCLUDE_TEMPLATE_ID;
    }
    isExclude() {
        return false;
    }
}
const settingsInputBoxStyles = getInputBoxStyle({
    inputBackground: settingsTextInputBackground,
    inputForeground: settingsTextInputForeground,
    inputBorder: settingsTextInputBorder
});
class AbstractSettingTextRenderer extends AbstractSettingRenderer {
    constructor() {
        super(...arguments);
        this.MULTILINE_MAX_HEIGHT = 150;
    }
    renderTemplate(_container, useMultiline) {
        const common = this.renderCommonTemplate(null, _container, 'text');
        const validationErrorMessageElement = DOM.append(common.containerElement, $('.setting-item-validation-message'));
        const inputBoxOptions = {
            flexibleHeight: useMultiline,
            flexibleWidth: false,
            flexibleMaxHeight: this.MULTILINE_MAX_HEIGHT,
            inputBoxStyles: settingsInputBoxStyles
        };
        const inputBox = new InputBox(common.controlElement, this._contextViewService, inputBoxOptions);
        common.toDispose.add(inputBox);
        common.toDispose.add(inputBox.onDidChange(e => {
            template.onChange?.(e);
        }));
        common.toDispose.add(inputBox);
        inputBox.inputElement.classList.add(AbstractSettingRenderer.CONTROL_CLASS);
        inputBox.inputElement.tabIndex = 0;
        const template = {
            ...common,
            inputBox,
            validationErrorMessageElement
        };
        this.addSettingElementFocusHandler(template);
        return template;
    }
    renderElement(element, index, templateData) {
        super.renderSettingElement(element, index, templateData);
    }
    renderValue(dataElement, template, onChange) {
        template.onChange = undefined;
        template.inputBox.value = dataElement.value;
        template.inputBox.setEnabled(!dataElement.hasPolicyValue);
        template.inputBox.setAriaLabel(dataElement.setting.key);
        template.onChange = value => {
            if (!renderValidations(dataElement, template, false)) {
                onChange(value);
            }
        };
        renderValidations(dataElement, template, true);
    }
}
class SettingTextRenderer extends AbstractSettingTextRenderer {
    constructor() {
        super(...arguments);
        this.templateId = SETTINGS_TEXT_TEMPLATE_ID;
    }
    renderTemplate(_container) {
        const template = super.renderTemplate(_container, false);
        // TODO@9at8: listWidget filters out all key events from input boxes, so we need to come up with a better way
        // Disable ArrowUp and ArrowDown behaviour in favor of list navigation
        template.toDispose.add(DOM.addStandardDisposableListener(template.inputBox.inputElement, DOM.EventType.KEY_DOWN, e => {
            if (e.equals(16 /* KeyCode.UpArrow */) || e.equals(18 /* KeyCode.DownArrow */)) {
                e.preventDefault();
            }
        }));
        return template;
    }
}
class SettingMultilineTextRenderer extends AbstractSettingTextRenderer {
    constructor() {
        super(...arguments);
        this.templateId = SETTINGS_MULTILINE_TEXT_TEMPLATE_ID;
    }
    renderTemplate(_container) {
        return super.renderTemplate(_container, true);
    }
    renderValue(dataElement, template, onChange) {
        const onChangeOverride = (value) => {
            // Ensure the model is up to date since a different value will be rendered as different height when probing the height.
            dataElement.value = value;
            onChange(value);
        };
        super.renderValue(dataElement, template, onChangeOverride);
        template.elementDisposables.add(template.inputBox.onDidHeightChange(e => {
            const height = template.containerElement.clientHeight;
            // Don't fire event if height is reported as 0,
            // which sometimes happens when clicking onto a new setting.
            if (height) {
                this._onDidChangeSettingHeight.fire({
                    element: dataElement,
                    height: template.containerElement.clientHeight
                });
            }
        }));
        template.inputBox.layout();
    }
}
class SettingEnumRenderer extends AbstractSettingRenderer {
    constructor() {
        super(...arguments);
        this.templateId = SETTINGS_ENUM_TEMPLATE_ID;
    }
    renderTemplate(container) {
        const common = this.renderCommonTemplate(null, container, 'enum');
        const styles = getSelectBoxStyles({
            selectBackground: settingsSelectBackground,
            selectForeground: settingsSelectForeground,
            selectBorder: settingsSelectBorder,
            selectListBorder: settingsSelectListBorder
        });
        const selectBox = new SelectBox([], 0, this._contextViewService, styles, {
            useCustomDrawn: !hasNativeContextMenu(this._configService) || !(isIOS && BrowserFeatures.pointerEvents)
        });
        common.toDispose.add(selectBox);
        selectBox.render(common.controlElement);
        // eslint-disable-next-line no-restricted-syntax
        const selectElement = common.controlElement.querySelector('select');
        if (selectElement) {
            selectElement.classList.add(AbstractSettingRenderer.CONTROL_CLASS);
            selectElement.tabIndex = 0;
        }
        common.toDispose.add(selectBox.onDidSelect(e => {
            template.onChange?.(e.index);
        }));
        const enumDescriptionElement = common.containerElement.insertBefore($('.setting-item-enumDescription'), common.descriptionElement.nextSibling);
        const template = {
            ...common,
            selectBox,
            selectElement,
            enumDescriptionElement
        };
        this.addSettingElementFocusHandler(template);
        return template;
    }
    renderElement(element, index, templateData) {
        super.renderSettingElement(element, index, templateData);
    }
    renderValue(dataElement, template, onChange) {
        // Make shallow copies here so that we don't modify the actual dataElement later
        const enumItemLabels = dataElement.setting.enumItemLabels ? [...dataElement.setting.enumItemLabels] : [];
        const enumDescriptions = dataElement.setting.enumDescriptions ? [...dataElement.setting.enumDescriptions] : [];
        const settingEnum = [...dataElement.setting.enum];
        const enumDescriptionsAreMarkdown = dataElement.setting.enumDescriptionsAreMarkdown;
        const disposables = new DisposableStore();
        template.elementDisposables.add(disposables);
        let createdDefault = false;
        if (!settingEnum.includes(dataElement.defaultValue)) {
            // Add a new potentially blank default setting
            settingEnum.unshift(dataElement.defaultValue);
            enumDescriptions.unshift('');
            enumItemLabels.unshift('');
            createdDefault = true;
        }
        // Use String constructor in case of null or undefined values
        const stringifiedDefaultValue = escapeInvisibleChars(String(dataElement.defaultValue));
        const displayOptions = settingEnum
            .map(String)
            .map(escapeInvisibleChars)
            .map((data, index) => {
            const description = (enumDescriptions[index] && (enumDescriptionsAreMarkdown ? fixSettingLinks(enumDescriptions[index], false) : enumDescriptions[index]));
            return {
                text: enumItemLabels[index] ? enumItemLabels[index] : data,
                detail: enumItemLabels[index] ? data : '',
                description,
                descriptionIsMarkdown: enumDescriptionsAreMarkdown,
                descriptionMarkdownActionHandler: (content) => {
                    this._openerService.open(content).catch(onUnexpectedError);
                },
                decoratorRight: (((data === stringifiedDefaultValue) || (createdDefault && index === 0)) ? localize('settings.Default', "default") : '')
            };
        });
        template.selectBox.setOptions(displayOptions);
        template.selectBox.setAriaLabel(dataElement.setting.key);
        template.selectBox.setEnabled(!dataElement.hasPolicyValue);
        let idx = settingEnum.indexOf(dataElement.value);
        if (idx === -1) {
            idx = 0;
        }
        template.onChange = undefined;
        template.selectBox.select(idx);
        template.onChange = (idx) => {
            if (createdDefault && idx === 0) {
                onChange(dataElement.defaultValue);
            }
            else {
                onChange(settingEnum[idx]);
            }
        };
        template.enumDescriptionElement.innerText = '';
    }
}
const settingsNumberInputBoxStyles = getInputBoxStyle({
    inputBackground: settingsNumberInputBackground,
    inputForeground: settingsNumberInputForeground,
    inputBorder: settingsNumberInputBorder
});
class SettingNumberRenderer extends AbstractSettingRenderer {
    constructor() {
        super(...arguments);
        this.templateId = SETTINGS_NUMBER_TEMPLATE_ID;
    }
    renderTemplate(_container) {
        const common = super.renderCommonTemplate(null, _container, 'number');
        const validationErrorMessageElement = DOM.append(common.containerElement, $('.setting-item-validation-message'));
        const inputBox = new InputBox(common.controlElement, this._contextViewService, { type: 'number', inputBoxStyles: settingsNumberInputBoxStyles });
        common.toDispose.add(inputBox);
        common.toDispose.add(inputBox.onDidChange(e => {
            template.onChange?.(e);
        }));
        common.toDispose.add(inputBox);
        inputBox.inputElement.classList.add(AbstractSettingRenderer.CONTROL_CLASS);
        inputBox.inputElement.tabIndex = 0;
        const template = {
            ...common,
            inputBox,
            validationErrorMessageElement
        };
        this.addSettingElementFocusHandler(template);
        return template;
    }
    renderElement(element, index, templateData) {
        super.renderSettingElement(element, index, templateData);
    }
    renderValue(dataElement, template, onChange) {
        const numParseFn = (dataElement.valueType === 'integer' || dataElement.valueType === 'nullable-integer')
            ? parseInt : parseFloat;
        const nullNumParseFn = (dataElement.valueType === 'nullable-integer' || dataElement.valueType === 'nullable-number')
            ? ((v) => v === '' ? null : numParseFn(v)) : numParseFn;
        template.onChange = undefined;
        template.inputBox.value = typeof dataElement.value === 'number' ?
            dataElement.value.toString() : '';
        template.inputBox.step = dataElement.valueType.includes('integer') ? '1' : 'any';
        template.inputBox.setAriaLabel(dataElement.setting.key);
        template.inputBox.setEnabled(!dataElement.hasPolicyValue);
        template.onChange = value => {
            if (!renderValidations(dataElement, template, false)) {
                onChange(nullNumParseFn(value));
            }
        };
        renderValidations(dataElement, template, true);
    }
}
class SettingBoolRenderer extends AbstractSettingRenderer {
    constructor() {
        super(...arguments);
        this.templateId = SETTINGS_BOOL_TEMPLATE_ID;
    }
    renderTemplate(_container) {
        _container.classList.add('setting-item');
        _container.classList.add('setting-item-bool');
        const toDispose = new DisposableStore();
        const container = DOM.append(_container, $(AbstractSettingRenderer.CONTENTS_SELECTOR));
        container.classList.add('settings-row-inner-container');
        const titleElement = DOM.append(container, $('.setting-item-title'));
        const categoryElement = DOM.append(titleElement, $('span.setting-item-category'));
        const labelElementContainer = DOM.append(titleElement, $('span.setting-item-label'));
        const labelElement = toDispose.add(new SimpleIconLabel(labelElementContainer));
        const indicatorsLabel = toDispose.add(this._instantiationService.createInstance(SettingsTreeIndicatorsLabel, titleElement));
        const descriptionAndValueElement = DOM.append(container, $('.setting-item-value-description'));
        const controlElement = DOM.append(descriptionAndValueElement, $('.setting-item-bool-control'));
        const descriptionElement = DOM.append(descriptionAndValueElement, $('.setting-item-description'));
        const modifiedIndicatorElement = DOM.append(container, $('.setting-item-modified-indicator'));
        toDispose.add(this._hoverService.setupDelayedHover(modifiedIndicatorElement, {
            content: localize('modified', "The setting has been configured in the current scope.")
        }));
        const deprecationWarningElement = DOM.append(container, $('.setting-item-deprecation-message'));
        const checkbox = new Toggle({ icon: Codicon.check, actionClassName: 'setting-value-checkbox', isChecked: true, title: '', ...unthemedToggleStyles });
        controlElement.appendChild(checkbox.domNode);
        toDispose.add(checkbox);
        toDispose.add(checkbox.onChange(() => {
            template.onChange(checkbox.checked);
        }));
        checkbox.domNode.classList.add(AbstractSettingRenderer.CONTROL_CLASS);
        const toolbarContainer = DOM.append(container, $('.setting-toolbar-container'));
        const toolbar = this.renderSettingToolbar(toolbarContainer);
        toDispose.add(toolbar);
        const template = {
            toDispose,
            elementDisposables: toDispose.add(new DisposableStore()),
            containerElement: container,
            categoryElement,
            labelElement,
            controlElement,
            checkbox,
            descriptionElement,
            deprecationWarningElement,
            indicatorsLabel,
            toolbar
        };
        this.addSettingElementFocusHandler(template);
        // Prevent clicks from being handled by list
        toDispose.add(DOM.addDisposableListener(controlElement, 'mousedown', (e) => e.stopPropagation()));
        toDispose.add(DOM.addDisposableListener(titleElement, DOM.EventType.MOUSE_ENTER, e => container.classList.add('mouseover')));
        toDispose.add(DOM.addDisposableListener(titleElement, DOM.EventType.MOUSE_LEAVE, e => container.classList.remove('mouseover')));
        return template;
    }
    renderElement(element, index, templateData) {
        super.renderSettingElement(element, index, templateData);
    }
    renderValue(dataElement, template, onChange) {
        template.onChange = undefined;
        template.checkbox.checked = dataElement.value;
        if (dataElement.hasPolicyValue) {
            template.checkbox.disable();
            template.descriptionElement.classList.add('disabled');
        }
        else {
            template.checkbox.enable();
            template.descriptionElement.classList.remove('disabled');
            // Need to listen for mouse clicks on description and toggle checkbox - use target ID for safety
            // Also have to ignore embedded links - too buried to stop propagation
            template.elementDisposables.add(DOM.addDisposableListener(template.descriptionElement, DOM.EventType.MOUSE_DOWN, (e) => {
                const targetElement = e.target;
                // Toggle target checkbox
                if (targetElement.tagName.toLowerCase() !== 'a') {
                    template.checkbox.checked = !template.checkbox.checked;
                    template.onChange(template.checkbox.checked);
                }
                DOM.EventHelper.stop(e);
            }));
        }
        template.checkbox.setTitle(dataElement.setting.key);
        template.onChange = onChange;
    }
}
class SettingsExtensionToggleRenderer extends AbstractSettingRenderer {
    constructor() {
        super(...arguments);
        this.templateId = SETTINGS_EXTENSION_TOGGLE_TEMPLATE_ID;
        this._onDidDismissExtensionSetting = this._register(new Emitter());
        this.onDidDismissExtensionSetting = this._onDidDismissExtensionSetting.event;
    }
    renderTemplate(_container) {
        const common = super.renderCommonTemplate(null, _container, 'extension-toggle');
        const actionButton = new Button(common.containerElement, {
            title: false,
            ...defaultButtonStyles
        });
        actionButton.element.classList.add('setting-item-extension-toggle-button');
        actionButton.label = localize('showExtension', "Show Extension");
        const dismissButton = new Button(common.containerElement, {
            title: false,
            secondary: true,
            ...defaultButtonStyles
        });
        dismissButton.element.classList.add('setting-item-extension-dismiss-button');
        dismissButton.label = localize('dismiss', "Dismiss");
        const template = {
            ...common,
            actionButton,
            dismissButton
        };
        this.addSettingElementFocusHandler(template);
        return template;
    }
    renderElement(element, index, templateData) {
        super.renderSettingElement(element, index, templateData);
    }
    renderValue(dataElement, template, onChange) {
        template.elementDisposables.clear();
        const extensionId = dataElement.setting.displayExtensionId;
        template.elementDisposables.add(template.actionButton.onDidClick(async () => {
            this._telemetryService.publicLog2('ManageExtensionClick', { extensionId });
            this._commandService.executeCommand('extension.open', extensionId);
        }));
        template.elementDisposables.add(template.dismissButton.onDidClick(async () => {
            this._telemetryService.publicLog2('DismissExtensionClick', { extensionId });
            this._onDidDismissExtensionSetting.fire(extensionId);
        }));
    }
}
let SettingTreeRenderers = class SettingTreeRenderers extends Disposable {
    constructor(_instantiationService, _contextMenuService, _contextViewService, _userDataSyncEnablementService) {
        super();
        this._instantiationService = _instantiationService;
        this._contextMenuService = _contextMenuService;
        this._contextViewService = _contextViewService;
        this._userDataSyncEnablementService = _userDataSyncEnablementService;
        this._onDidChangeSetting = this._register(new Emitter());
        this.settingActions = [
            new Action('settings.resetSetting', localize('resetSettingLabel', "Reset Setting"), undefined, undefined, async (context) => {
                if (context instanceof SettingsTreeSettingElement) {
                    if (!context.isUntrusted) {
                        this._onDidChangeSetting.fire({
                            key: context.setting.key,
                            value: undefined,
                            type: context.setting.type,
                            manualReset: true,
                            scope: context.setting.scope
                        });
                    }
                }
            }),
            new Separator(),
            this._instantiationService.createInstance(CopySettingIdAction),
            this._instantiationService.createInstance(CopySettingAsJSONAction),
            this._instantiationService.createInstance(CopySettingAsURLAction),
        ];
        const actionFactory = (setting, settingTarget) => this.getActionsForSetting(setting, settingTarget);
        const emptyActionFactory = (_) => [];
        const extensionRenderer = this._instantiationService.createInstance(SettingsExtensionToggleRenderer, [], emptyActionFactory);
        const settingRenderers = [
            this._instantiationService.createInstance(SettingBoolRenderer, this.settingActions, actionFactory),
            this._instantiationService.createInstance(SettingNumberRenderer, this.settingActions, actionFactory),
            this._instantiationService.createInstance(SettingArrayRenderer, this.settingActions, actionFactory),
            this._instantiationService.createInstance(SettingComplexRenderer, this.settingActions, actionFactory),
            this._instantiationService.createInstance(SettingComplexObjectRenderer, this.settingActions, actionFactory),
            this._instantiationService.createInstance(SettingTextRenderer, this.settingActions, actionFactory),
            this._instantiationService.createInstance(SettingMultilineTextRenderer, this.settingActions, actionFactory),
            this._instantiationService.createInstance(SettingExcludeRenderer, this.settingActions, actionFactory),
            this._instantiationService.createInstance(SettingIncludeRenderer, this.settingActions, actionFactory),
            this._instantiationService.createInstance(SettingEnumRenderer, this.settingActions, actionFactory),
            this._instantiationService.createInstance(SettingObjectRenderer, this.settingActions, actionFactory),
            this._instantiationService.createInstance(SettingBoolObjectRenderer, this.settingActions, actionFactory),
            extensionRenderer
        ];
        this.onDidClickOverrideElement = Event.any(...settingRenderers.map(r => r.onDidClickOverrideElement));
        this.onDidChangeSetting = Event.any(...settingRenderers.map(r => r.onDidChangeSetting), this._onDidChangeSetting.event);
        this.onDidDismissExtensionSetting = extensionRenderer.onDidDismissExtensionSetting;
        this.onDidOpenSettings = Event.any(...settingRenderers.map(r => r.onDidOpenSettings));
        this.onDidClickSettingLink = Event.any(...settingRenderers.map(r => r.onDidClickSettingLink));
        this.onDidFocusSetting = Event.any(...settingRenderers.map(r => r.onDidFocusSetting));
        this.onDidChangeSettingHeight = Event.any(...settingRenderers.map(r => r.onDidChangeSettingHeight));
        this.onApplyFilter = Event.any(...settingRenderers.map(r => r.onApplyFilter));
        this.allRenderers = [
            ...settingRenderers,
            this._instantiationService.createInstance(SettingGroupRenderer),
            this._instantiationService.createInstance(SettingNewExtensionsRenderer),
        ];
    }
    getActionsForSetting(setting, settingTarget) {
        const actions = [];
        if (!(setting.scope && APPLICATION_SCOPES.includes(setting.scope)) && settingTarget === 3 /* ConfigurationTarget.USER_LOCAL */) {
            actions.push(this._instantiationService.createInstance(ApplySettingToAllProfilesAction, setting));
        }
        if (this._userDataSyncEnablementService.isEnabled() && !setting.disallowSyncIgnore) {
            actions.push(this._instantiationService.createInstance(SyncSettingAction, setting));
        }
        if (actions.length) {
            actions.splice(0, 0, new Separator());
        }
        return actions;
    }
    cancelSuggesters() {
        this._contextViewService.hideContextView();
    }
    showContextMenu(element, settingDOMElement) {
        // eslint-disable-next-line no-restricted-syntax
        const toolbarElement = settingDOMElement.querySelector('.monaco-toolbar');
        if (toolbarElement) {
            this._contextMenuService.showContextMenu({
                getActions: () => this.settingActions,
                getAnchor: () => toolbarElement,
                getActionsContext: () => element
            });
        }
    }
    getSettingDOMElementForDOMElement(domElement) {
        const parent = DOM.findParentWithClass(domElement, AbstractSettingRenderer.CONTENTS_CLASS);
        if (parent) {
            return parent;
        }
        return null;
    }
    getDOMElementsForSettingKey(treeContainer, key) {
        // eslint-disable-next-line no-restricted-syntax
        return treeContainer.querySelectorAll(`[${AbstractSettingRenderer.SETTING_KEY_ATTR}="${key}"]`);
    }
    getKeyForDOMElementInSetting(element) {
        const settingElement = this.getSettingDOMElementForDOMElement(element);
        return settingElement && settingElement.getAttribute(AbstractSettingRenderer.SETTING_KEY_ATTR);
    }
    getIdForDOMElementInSetting(element) {
        const settingElement = this.getSettingDOMElementForDOMElement(element);
        return settingElement && settingElement.getAttribute(AbstractSettingRenderer.SETTING_ID_ATTR);
    }
    dispose() {
        super.dispose();
        this.settingActions.forEach(action => {
            if (isDisposable(action)) {
                action.dispose();
            }
        });
        this.allRenderers.forEach(renderer => {
            if (isDisposable(renderer)) {
                renderer.dispose();
            }
        });
    }
};
SettingTreeRenderers = __decorate([
    __param(0, IInstantiationService),
    __param(1, IContextMenuService),
    __param(2, IContextViewService),
    __param(3, IUserDataSyncEnablementService)
], SettingTreeRenderers);
export { SettingTreeRenderers };
/**
 * Validate and render any error message. Returns true if the value is invalid.
 */
function renderValidations(dataElement, template, calledOnStartup) {
    if (dataElement.setting.validator) {
        const errMsg = dataElement.setting.validator(template.inputBox.value);
        if (errMsg) {
            template.containerElement.classList.add('invalid-input');
            template.validationErrorMessageElement.innerText = errMsg;
            const validationError = localize('validationError', "Validation Error.");
            template.inputBox.inputElement.parentElement.setAttribute('aria-label', [validationError, errMsg].join(' '));
            if (!calledOnStartup) {
                aria.status(validationError + ' ' + errMsg);
            }
            return true;
        }
        else {
            template.inputBox.inputElement.parentElement.removeAttribute('aria-label');
        }
    }
    template.containerElement.classList.remove('invalid-input');
    return false;
}
/**
 * Validate and render any error message for arrays. Returns true if the value is invalid.
 */
function renderArrayValidations(dataElement, template, value, calledOnStartup) {
    template.containerElement.classList.add('invalid-input');
    if (dataElement.setting.validator) {
        const errMsg = dataElement.setting.validator(value);
        if (errMsg && errMsg !== '') {
            template.containerElement.classList.add('invalid-input');
            template.validationErrorMessageElement.innerText = errMsg;
            const validationError = localize('validationError', "Validation Error.");
            template.containerElement.setAttribute('aria-label', [dataElement.setting.key, validationError, errMsg].join(' '));
            if (!calledOnStartup) {
                aria.status(validationError + ' ' + errMsg);
            }
            return true;
        }
        else {
            template.containerElement.setAttribute('aria-label', dataElement.setting.key);
            template.containerElement.classList.remove('invalid-input');
        }
    }
    return false;
}
function cleanRenderedMarkdown(element) {
    for (let i = 0; i < element.childNodes.length; i++) {
        const child = element.childNodes.item(i);
        const tagName = child.tagName && child.tagName.toLowerCase();
        if (tagName === 'img') {
            child.remove();
        }
        else {
            cleanRenderedMarkdown(child);
        }
    }
}
function fixSettingLinks(text, linkify = true) {
    return text.replace(/`#([^#\s`]+)#`|'#([^#\s']+)#'/g, (match, backticksGroup, quotesGroup) => {
        const settingKey = backticksGroup ?? quotesGroup;
        const targetDisplayFormat = settingKeyToDisplayFormat(settingKey);
        const targetName = `${targetDisplayFormat.category}: ${targetDisplayFormat.label}`;
        return linkify ?
            `[${targetName}](#${settingKey} "${settingKey}")` :
            `"${targetName}"`;
    });
}
function escapeInvisibleChars(enumValue) {
    return enumValue && enumValue
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r');
}
let SettingsTreeFilter = class SettingsTreeFilter {
    constructor(viewState, isFilteringGroups, environmentService) {
        this.viewState = viewState;
        this.isFilteringGroups = isFilteringGroups;
        this.environmentService = environmentService;
    }
    filter(element, parentVisibility) {
        // Filter during search
        if (this.viewState.categoryFilter && element instanceof SettingsTreeSettingElement) {
            if (!this.settingContainedInGroup(element.setting, this.viewState.categoryFilter)) {
                return false;
            }
        }
        // Non-user scope selected
        if (element instanceof SettingsTreeSettingElement && this.viewState.settingsTarget !== 3 /* ConfigurationTarget.USER_LOCAL */) {
            const isRemote = !!this.environmentService.remoteAuthority;
            if (!element.matchesScope(this.viewState.settingsTarget, isRemote)) {
                return false;
            }
        }
        // Group with no visible children
        if (element instanceof SettingsTreeGroupElement) {
            // When filtering to a specific category, only show that category and its descendants
            if (this.isFilteringGroups && this.viewState.categoryFilter) {
                if (!this.groupIsRelatedToCategory(element, this.viewState.categoryFilter)) {
                    return false;
                }
                // For groups related to the category, skip the count check and recurse
                // to let child settings be filtered
                return 2 /* TreeVisibility.Recurse */;
            }
            if (typeof element.count === 'number') {
                return element.count > 0;
            }
            return 2 /* TreeVisibility.Recurse */;
        }
        // Filtered "new extensions" button
        if (element instanceof SettingsTreeNewExtensionsElement) {
            if (this.viewState.tagFilters?.size || this.viewState.categoryFilter) {
                return false;
            }
        }
        return true;
    }
    settingContainedInGroup(setting, group) {
        return group.children.some(child => {
            if (child instanceof SettingsTreeGroupElement) {
                return this.settingContainedInGroup(setting, child);
            }
            else if (child instanceof SettingsTreeSettingElement) {
                return child.setting.key === setting.key;
            }
            else {
                return false;
            }
        });
    }
    /**
     * Checks if a group is related to the filtered category.
     * A group is related if it's the category itself, a descendant of it, or an ancestor of it.
     */
    groupIsRelatedToCategory(group, category) {
        // Check if this group is the category itself
        if (group.id === category.id) {
            return true;
        }
        // Check if this group is a descendant of the category
        let parent = group.parent;
        while (parent) {
            if (parent.id === category.id) {
                return true;
            }
            parent = parent.parent;
        }
        // Check if this group is an ancestor of the category
        let categoryParent = category.parent;
        while (categoryParent) {
            if (categoryParent.id === group.id) {
                return true;
            }
            categoryParent = categoryParent.parent;
        }
        return false;
    }
};
SettingsTreeFilter = __decorate([
    __param(2, IWorkbenchEnvironmentService)
], SettingsTreeFilter);
export { SettingsTreeFilter };
class SettingsTreeDelegate extends CachedListVirtualDelegate {
    getTemplateId(element) {
        if (element instanceof SettingsTreeGroupElement) {
            return SETTINGS_ELEMENT_TEMPLATE_ID;
        }
        if (element instanceof SettingsTreeSettingElement) {
            if (element.valueType === SettingValueType.ExtensionToggle) {
                return SETTINGS_EXTENSION_TOGGLE_TEMPLATE_ID;
            }
            const invalidTypeError = element.isConfigured && getInvalidTypeError(element.value, element.setting.type);
            if (invalidTypeError) {
                return SETTINGS_COMPLEX_TEMPLATE_ID;
            }
            if (element.valueType === SettingValueType.Boolean) {
                return SETTINGS_BOOL_TEMPLATE_ID;
            }
            if (element.valueType === SettingValueType.Integer ||
                element.valueType === SettingValueType.Number ||
                element.valueType === SettingValueType.NullableInteger ||
                element.valueType === SettingValueType.NullableNumber) {
                return SETTINGS_NUMBER_TEMPLATE_ID;
            }
            if (element.valueType === SettingValueType.MultilineString) {
                return SETTINGS_MULTILINE_TEXT_TEMPLATE_ID;
            }
            if (element.valueType === SettingValueType.String) {
                return SETTINGS_TEXT_TEMPLATE_ID;
            }
            if (element.valueType === SettingValueType.Enum) {
                return SETTINGS_ENUM_TEMPLATE_ID;
            }
            if (element.valueType === SettingValueType.Array) {
                return SETTINGS_ARRAY_TEMPLATE_ID;
            }
            if (element.valueType === SettingValueType.Exclude) {
                return SETTINGS_EXCLUDE_TEMPLATE_ID;
            }
            if (element.valueType === SettingValueType.Include) {
                return SETTINGS_INCLUDE_TEMPLATE_ID;
            }
            if (element.valueType === SettingValueType.Object) {
                return SETTINGS_OBJECT_TEMPLATE_ID;
            }
            if (element.valueType === SettingValueType.BooleanObject) {
                return SETTINGS_BOOL_OBJECT_TEMPLATE_ID;
            }
            if (element.valueType === SettingValueType.ComplexObject) {
                return SETTINGS_COMPLEX_OBJECT_TEMPLATE_ID;
            }
            if (element.valueType === SettingValueType.LanguageTag) {
                return SETTINGS_COMPLEX_TEMPLATE_ID;
            }
            return SETTINGS_COMPLEX_TEMPLATE_ID;
        }
        if (element instanceof SettingsTreeNewExtensionsElement) {
            return SETTINGS_NEW_EXTENSIONS_TEMPLATE_ID;
        }
        throw new Error('unknown element type: ' + element);
    }
    hasDynamicHeight(element) {
        return !(element instanceof SettingsTreeGroupElement);
    }
    estimateHeight(element) {
        if (element instanceof SettingsTreeGroupElement) {
            return 42;
        }
        return element instanceof SettingsTreeSettingElement && element.valueType === SettingValueType.Boolean ? 78 : 104;
    }
}
export class NonCollapsibleObjectTreeModel extends ObjectTreeModel {
    isCollapsible(element) {
        return false;
    }
    setCollapsed(element, collapsed, recursive) {
        return false;
    }
}
class SettingsTreeAccessibilityProvider {
    constructor(configurationService, languageService, userDataProfilesService) {
        this.configurationService = configurationService;
        this.languageService = languageService;
        this.userDataProfilesService = userDataProfilesService;
    }
    getAriaLabel(element) {
        if (element instanceof SettingsTreeSettingElement) {
            const ariaLabelSections = [];
            ariaLabelSections.push(`${element.displayCategory} ${element.displayLabel}.`);
            if (element.isConfigured) {
                const modifiedText = localize('settings.Modified', 'Modified.');
                ariaLabelSections.push(modifiedText);
            }
            const indicatorsLabelAriaLabel = getIndicatorsLabelAriaLabel(element, this.configurationService, this.userDataProfilesService, this.languageService);
            if (indicatorsLabelAriaLabel.length) {
                ariaLabelSections.push(`${indicatorsLabelAriaLabel}.`);
            }
            const descriptionWithoutSettingLinks = renderAsPlaintext({ value: fixSettingLinks(element.description, false) });
            if (descriptionWithoutSettingLinks.length) {
                ariaLabelSections.push(descriptionWithoutSettingLinks);
            }
            return ariaLabelSections.join(' ');
        }
        else if (element instanceof SettingsTreeGroupElement) {
            return element.label;
        }
        else {
            return element.id;
        }
    }
    getWidgetAriaLabel() {
        return localize('settings', "Settings");
    }
}
let SettingsTree = class SettingsTree extends WorkbenchObjectTree {
    constructor(container, viewState, renderers, contextKeyService, listService, configurationService, instantiationService, languageService, userDataProfilesService) {
        super('SettingsTree', container, new SettingsTreeDelegate(), renderers, {
            horizontalScrolling: false,
            supportDynamicHeights: true,
            scrollToActiveElement: true,
            identityProvider: {
                getId(e) {
                    return e.id;
                }
            },
            accessibilityProvider: new SettingsTreeAccessibilityProvider(configurationService, languageService, userDataProfilesService),
            styleController: id => new DefaultStyleController(domStylesheetsJs.createStyleSheet(container), id),
            filter: instantiationService.createInstance(SettingsTreeFilter, viewState, true),
            smoothScrolling: configurationService.getValue('workbench.list.smoothScrolling'),
            multipleSelectionSupport: false,
            findWidgetEnabled: false,
            renderIndentGuides: RenderIndentGuides.None,
            transformOptimization: false // Disable transform optimization #177470
        }, instantiationService, contextKeyService, listService, configurationService);
        this.getHTMLElement().classList.add('settings-editor-tree');
        this.style(getListStyles({
            listBackground: editorBackground,
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
            listInactiveSelectionForeground: foreground,
            listInactiveFocusBackground: editorBackground,
            listInactiveFocusOutline: editorBackground,
            treeIndentGuidesStroke: undefined,
            treeInactiveIndentGuidesStroke: undefined,
        }));
        this.disposables.add(configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('workbench.list.smoothScrolling')) {
                this.updateOptions({
                    smoothScrolling: configurationService.getValue('workbench.list.smoothScrolling')
                });
            }
        }));
    }
    createModel(user, options) {
        return new NonCollapsibleObjectTreeModel(user, options);
    }
};
SettingsTree = __decorate([
    __param(3, IContextKeyService),
    __param(4, IListService),
    __param(5, IWorkbenchConfigurationService),
    __param(6, IInstantiationService),
    __param(7, ILanguageService),
    __param(8, IUserDataProfilesService)
], SettingsTree);
export { SettingsTree };
let CopySettingIdAction = class CopySettingIdAction extends Action {
    static { CopySettingIdAction_1 = this; }
    static { this.ID = 'settings.copySettingId'; }
    static { this.LABEL = localize('copySettingIdLabel', "Copy Setting ID"); }
    constructor(clipboardService) {
        super(CopySettingIdAction_1.ID, CopySettingIdAction_1.LABEL);
        this.clipboardService = clipboardService;
    }
    async run(context) {
        if (context) {
            await this.clipboardService.writeText(context.setting.key);
        }
        return Promise.resolve(undefined);
    }
};
CopySettingIdAction = CopySettingIdAction_1 = __decorate([
    __param(0, IClipboardService)
], CopySettingIdAction);
let CopySettingAsJSONAction = class CopySettingAsJSONAction extends Action {
    static { CopySettingAsJSONAction_1 = this; }
    static { this.ID = 'settings.copySettingAsJSON'; }
    static { this.LABEL = localize('copySettingAsJSONLabel', "Copy Setting as JSON"); }
    constructor(clipboardService) {
        super(CopySettingAsJSONAction_1.ID, CopySettingAsJSONAction_1.LABEL);
        this.clipboardService = clipboardService;
    }
    async run(context) {
        if (context) {
            const jsonResult = `"${context.setting.key}": ${JSON.stringify(context.value, undefined, '  ')}`;
            await this.clipboardService.writeText(jsonResult);
        }
        return Promise.resolve(undefined);
    }
};
CopySettingAsJSONAction = CopySettingAsJSONAction_1 = __decorate([
    __param(0, IClipboardService)
], CopySettingAsJSONAction);
let CopySettingAsURLAction = class CopySettingAsURLAction extends Action {
    static { CopySettingAsURLAction_1 = this; }
    static { this.ID = 'settings.copySettingAsURL'; }
    static { this.LABEL = localize('copySettingAsURLLabel', "Copy Setting as URL"); }
    constructor(clipboardService, productService) {
        super(CopySettingAsURLAction_1.ID, CopySettingAsURLAction_1.LABEL);
        this.clipboardService = clipboardService;
        this.productService = productService;
    }
    async run(context) {
        if (context) {
            const settingKey = context.setting.key;
            const product = this.productService.urlProtocol;
            const uri = URI.from({ scheme: product, authority: SETTINGS_AUTHORITY, path: `/${settingKey}` }, true);
            await this.clipboardService.writeText(uri.toString());
        }
        return Promise.resolve(undefined);
    }
};
CopySettingAsURLAction = CopySettingAsURLAction_1 = __decorate([
    __param(0, IClipboardService),
    __param(1, IProductService)
], CopySettingAsURLAction);
let SyncSettingAction = class SyncSettingAction extends Action {
    static { SyncSettingAction_1 = this; }
    static { this.ID = 'settings.stopSyncingSetting'; }
    static { this.LABEL = localize('stopSyncingSetting', "Sync This Setting"); }
    constructor(setting, configService) {
        super(SyncSettingAction_1.ID, SyncSettingAction_1.LABEL);
        this.setting = setting;
        this.configService = configService;
        this._register(Event.filter(configService.onDidChangeConfiguration, e => e.affectsConfiguration('settingsSync.ignoredSettings'))(() => this.update()));
        this.update();
    }
    async update() {
        const ignoredSettings = getIgnoredSettings(getDefaultIgnoredSettings(), this.configService);
        this.checked = !ignoredSettings.includes(this.setting.key);
    }
    async run() {
        // first remove the current setting completely from ignored settings
        let currentValue = [...this.configService.getValue('settingsSync.ignoredSettings')];
        currentValue = currentValue.filter(v => v !== this.setting.key && v !== `-${this.setting.key}`);
        const defaultIgnoredSettings = getDefaultIgnoredSettings();
        const isDefaultIgnored = defaultIgnoredSettings.includes(this.setting.key);
        const askedToSync = !this.checked;
        // If asked to sync, then add only if it is ignored by default
        if (askedToSync && isDefaultIgnored) {
            currentValue.push(`-${this.setting.key}`);
        }
        // If asked not to sync, then add only if it is not ignored by default
        if (!askedToSync && !isDefaultIgnored) {
            currentValue.push(this.setting.key);
        }
        this.configService.updateValue('settingsSync.ignoredSettings', currentValue.length ? currentValue : undefined, 2 /* ConfigurationTarget.USER */);
        return Promise.resolve(undefined);
    }
};
SyncSettingAction = SyncSettingAction_1 = __decorate([
    __param(1, IConfigurationService)
], SyncSettingAction);
let ApplySettingToAllProfilesAction = class ApplySettingToAllProfilesAction extends Action {
    static { ApplySettingToAllProfilesAction_1 = this; }
    static { this.ID = 'settings.applyToAllProfiles'; }
    static { this.LABEL = localize('applyToAllProfiles', "Apply Setting to all Profiles"); }
    constructor(setting, configService) {
        super(ApplySettingToAllProfilesAction_1.ID, ApplySettingToAllProfilesAction_1.LABEL);
        this.setting = setting;
        this.configService = configService;
        this._register(Event.filter(configService.onDidChangeConfiguration, e => e.affectsConfiguration(APPLY_ALL_PROFILES_SETTING))(() => this.update()));
        this.update();
    }
    update() {
        const allProfilesSettings = this.configService.getValue(APPLY_ALL_PROFILES_SETTING);
        this.checked = allProfilesSettings.includes(this.setting.key);
    }
    async run() {
        // first remove the current setting completely from ignored settings
        const value = this.configService.getValue(APPLY_ALL_PROFILES_SETTING) ?? [];
        if (this.checked) {
            value.splice(value.indexOf(this.setting.key), 1);
        }
        else {
            value.push(this.setting.key);
        }
        const newValue = distinct(value);
        if (this.checked) {
            await this.configService.updateValue(this.setting.key, this.configService.inspect(this.setting.key).application?.value, 3 /* ConfigurationTarget.USER_LOCAL */);
            await this.configService.updateValue(APPLY_ALL_PROFILES_SETTING, newValue.length ? newValue : undefined, 3 /* ConfigurationTarget.USER_LOCAL */);
        }
        else {
            await this.configService.updateValue(APPLY_ALL_PROFILES_SETTING, newValue.length ? newValue : undefined, 3 /* ConfigurationTarget.USER_LOCAL */);
            await this.configService.updateValue(this.setting.key, this.configService.inspect(this.setting.key).userLocal?.value, 3 /* ConfigurationTarget.USER_LOCAL */);
        }
    }
};
ApplySettingToAllProfilesAction = ApplySettingToAllProfilesAction_1 = __decorate([
    __param(1, IWorkbenchConfigurationService)
], ApplySettingToAllProfilesAction);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2V0dGluZ3NUcmVlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvcHJlZmVyZW5jZXMvYnJvd3Nlci9zZXR0aW5nc1RyZWUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUN0RSxPQUFPLEtBQUssR0FBRyxNQUFNLGlDQUFpQyxDQUFDO0FBQ3ZELE9BQU8sS0FBSyxnQkFBZ0IsTUFBTSw0Q0FBNEMsQ0FBQztBQUMvRSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUNsRixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUVqRixPQUFPLEtBQUssSUFBSSxNQUFNLDBDQUEwQyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUN0RSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDM0YsT0FBTyxFQUFpQixRQUFRLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUMzRixPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNyRixPQUFPLEVBQUUsc0JBQXNCLEVBQThCLE1BQU0sZ0RBQWdELENBQUM7QUFDcEgsT0FBTyxFQUFxQixTQUFTLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUNsRyxPQUFPLEVBQUUsTUFBTSxFQUFFLG9CQUFvQixFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDNUYsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBRXRGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUV0RixPQUFPLEVBQUUsTUFBTSxFQUFXLFNBQVMsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM3RCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDdEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUdsRSxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxZQUFZLEVBQUUsWUFBWSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDL0csT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxTQUFTLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNoRixPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDckcsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0saURBQWlELENBQUM7QUFDbkYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBQzlGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNuRixPQUFPLEVBQXVCLHFCQUFxQixFQUFFLDZCQUE2QixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFFdkosT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDMUYsT0FBTyxFQUFFLG1CQUFtQixFQUFFLG1CQUFtQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDbkgsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxZQUFZLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUVyRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDOUUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQ3hGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxnQkFBZ0IsRUFBRSxhQUFhLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUMvSSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsVUFBVSxFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDbEcsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ2xGLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLGdFQUFnRSxDQUFDO0FBQzFHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBQy9GLE9BQU8sRUFBRSw4QkFBOEIsRUFBRSx5QkFBeUIsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQ3JJLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSwwQkFBMEIsRUFBRSw4QkFBOEIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQ3pKLE9BQU8sRUFBRSw0QkFBNEIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQzFHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3RGLE9BQU8sRUFBNEIsa0JBQWtCLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUNySSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUNwRyxPQUFPLEVBQUUsMkJBQTJCLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNwRixPQUFPLEVBQUUsb0JBQW9CLEVBQUUseUNBQXlDLEVBQUUseUJBQXlCLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUN0SSxPQUFPLEVBQUUsNkJBQTZCLEVBQUUseUJBQXlCLEVBQUUsNkJBQTZCLEVBQUUsd0JBQXdCLEVBQUUsb0JBQW9CLEVBQUUsd0JBQXdCLEVBQUUsd0JBQXdCLEVBQUUsMkJBQTJCLEVBQUUsdUJBQXVCLEVBQUUsMkJBQTJCLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUMxVSxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUUvRCxPQUFPLEVBQThCLDJCQUEyQixFQUFFLDJCQUEyQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFNUksT0FBTyxFQUF5RSx3QkFBd0IsRUFBRSxnQ0FBZ0MsRUFBRSwwQkFBMEIsRUFBRSxjQUFjLEVBQUUsdUNBQXVDLEVBQUUseUJBQXlCLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUM1UixPQUFPLEVBQUUsb0JBQW9CLEVBQStJLG9CQUFvQixFQUFFLGlCQUFpQixFQUFFLDJCQUEyQixFQUFFLDJCQUEyQixFQUFpQyxNQUFNLHNCQUFzQixDQUFDO0FBRTNVLE1BQU0sQ0FBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFFaEIsTUFBTSxxQkFBcUIsR0FBRyxJQUFJLEdBQUcsQ0FBQztJQUNyQyw4Q0FBOEM7SUFDOUMsNENBQTRDO0NBQzVDLENBQUMsQ0FBQztBQUVILFNBQVMsNkJBQTZCLENBQUMsT0FBbUM7SUFDekUsTUFBTSxtQkFBbUIsR0FBNEIsT0FBTyxPQUFPLENBQUMsWUFBWSxLQUFLLFFBQVE7UUFDNUYsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxZQUFZLElBQUksRUFBRTtRQUM1QixDQUFDLENBQUMsRUFBRSxDQUFDO0lBRU4sTUFBTSxJQUFJLEdBQUcsT0FBTyxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBQ2xDLEVBQUUsR0FBRyxtQkFBbUIsRUFBRSxHQUFHLE9BQU8sQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDO1FBQ25ELG1CQUFtQixDQUFDO0lBRXJCLE9BQU8sTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUM7U0FDdEIsTUFBTSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztTQUMxQixHQUFHLENBQUMsR0FBRyxDQUFDLEVBQUU7UUFDVixNQUFNLFlBQVksR0FBRyxtQkFBbUIsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUU5QyxxQ0FBcUM7UUFDckMsSUFBSSxNQUEwQixDQUFDO1FBQy9CLElBQUksWUFBWSxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxPQUFPLENBQUMsT0FBTyxDQUFDLElBQUksS0FBSyxRQUFRLElBQUksT0FBTyxDQUFDLGtCQUFrQixZQUFZLEdBQUcsRUFBRSxDQUFDO1lBQ2xILE1BQU0sYUFBYSxHQUFHLE9BQU8sQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLENBQUMsR0FBRyxPQUFPLENBQUMsT0FBTyxDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUUsQ0FBQyxDQUFDO1lBQ3RGLE1BQU0sR0FBRyxPQUFPLGFBQWEsS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsYUFBYSxFQUFFLFdBQVcsQ0FBQztRQUN6RixDQUFDO1FBRUQsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3hCLE1BQU0sT0FBTyxHQUFHLE9BQU8sS0FBSyxLQUFLLFNBQVMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDO1FBQ3BFLE9BQU87WUFDTixLQUFLLEVBQUU7Z0JBQ04sSUFBSSxFQUFFLFFBQVE7Z0JBQ2QsSUFBSSxFQUFFLEdBQUc7YUFDVDtZQUNELE9BQU87WUFDUCxXQUFXLEVBQUUsT0FBTyxDQUFDLFNBQVM7WUFDOUIsTUFBTTtTQUNOLENBQUM7SUFDSCxDQUFDLENBQUMsQ0FBQztBQUNMLENBQUM7QUFFRCxTQUFTLHVCQUF1QixDQUFDLFVBQW9CLEVBQUUsY0FBaUM7SUFDdkYsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLEdBQUcsQ0FBQyxVQUFVLENBQUMsQ0FBQztJQUM3QyxjQUFjLENBQUMsT0FBTyxDQUFDLENBQUMsRUFBRSxHQUFHLEVBQUUsRUFBRSxFQUFFLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBQ3ZFLE9BQU8sZ0JBQWdCLENBQUMsSUFBSSxLQUFLLENBQUMsQ0FBQztBQUNwQyxDQUFDO0FBRUQsU0FBUyx3QkFBd0IsQ0FBQyxNQUFtQjtJQUNwRCxJQUFJLE1BQU0sQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNsQixPQUFPLE1BQU0sQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLHdCQUF3QixDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7SUFDMUQsQ0FBQztJQUVELE1BQU0sZ0JBQWdCLEdBQUcsTUFBTSxDQUFDLGdCQUFnQixJQUFJLEVBQUUsQ0FBQztJQUV2RCxPQUFPLENBQUMsTUFBTSxDQUFDLElBQUksSUFBSSxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxLQUFLLEVBQUUsR0FBRyxFQUFFLEVBQUU7UUFDN0MsTUFBTSxXQUFXLEdBQUcsR0FBRyxHQUFHLGdCQUFnQixDQUFDLE1BQU07WUFDaEQsQ0FBQyxDQUFDLGdCQUFnQixDQUFDLEdBQUcsQ0FBQztZQUN2QixDQUFDLENBQUMsU0FBUyxDQUFDO1FBRWIsT0FBTyxFQUFFLEtBQUssRUFBRSxXQUFXLEVBQUUsQ0FBQztJQUMvQixDQUFDLENBQUMsQ0FBQztBQUNKLENBQUM7QUFFRCxTQUFTLGtCQUFrQixDQUFDLE1BQW1CO0lBQzlDLElBQUksTUFBTSxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ2xCLE1BQU0sUUFBUSxHQUFHLE1BQU0sQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLGtCQUFrQixDQUFDLENBQUM7UUFDdEQsSUFBSSxRQUFRLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxLQUFLLE1BQU0sQ0FBQyxFQUFFLENBQUM7WUFDNUMsT0FBTyxNQUFNLENBQUM7UUFDZixDQUFDO1FBQ0QsT0FBTyxRQUFRLENBQUM7SUFDakIsQ0FBQztJQUVELElBQUksTUFBTSxDQUFDLElBQUksS0FBSyxTQUFTLEVBQUUsQ0FBQztRQUMvQixPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDO1NBQU0sSUFBSSxNQUFNLENBQUMsSUFBSSxLQUFLLFFBQVEsSUFBSSxTQUFTLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO1FBQ3pGLE9BQU8sTUFBTSxDQUFDO0lBQ2YsQ0FBQztTQUFNLENBQUM7UUFDUCxPQUFPLFFBQVEsQ0FBQztJQUNqQixDQUFDO0FBQ0YsQ0FBQztBQUVELFNBQVMsK0JBQStCLENBQUMsSUFBeUIsRUFBRSxJQUFhLEVBQUUsT0FBNEI7SUFDOUcsSUFBSSxJQUFJLEtBQUssU0FBUyxFQUFFLENBQUM7UUFDeEIsT0FBTyxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO0lBQy9CLENBQUM7U0FBTSxJQUFJLElBQUksS0FBSyxNQUFNLEVBQUUsQ0FBQztRQUM1QixPQUFPLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxFQUFFLEdBQUcsSUFBSSxFQUFFLE9BQU8sRUFBRSxDQUFDO0lBQzNDLENBQUM7U0FBTSxDQUFDO1FBQ1AsT0FBTyxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsRUFBRSxHQUFHLElBQUksRUFBRSxDQUFDO0lBQ2xDLENBQUM7QUFDRixDQUFDO0FBRUQsU0FBUyxxQkFBcUIsQ0FBQyxPQUFtQztJQUNqRSxNQUFNLG1CQUFtQixHQUE0QixPQUFPLE9BQU8sQ0FBQyxZQUFZLEtBQUssUUFBUTtRQUM1RixDQUFDLENBQUMsT0FBTyxDQUFDLFlBQVksSUFBSSxFQUFFO1FBQzVCLENBQUMsQ0FBQyxFQUFFLENBQUM7SUFFTixNQUFNLGlCQUFpQixHQUE0QixPQUFPLE9BQU8sQ0FBQyxVQUFVLEtBQUssUUFBUTtRQUN4RixDQUFDLENBQUMsT0FBTyxDQUFDLFVBQVUsSUFBSSxFQUFFO1FBQzFCLENBQUMsQ0FBQyxFQUFFLENBQUM7SUFFTixNQUFNLElBQUksR0FBRyxPQUFPLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDbEMsRUFBRSxHQUFHLG1CQUFtQixFQUFFLEdBQUcsaUJBQWlCLEVBQUUsQ0FBQyxDQUFDO1FBQ2xELE9BQU8sQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUM1QyxtQkFBbUIsQ0FBQztJQUV0QixNQUFNLEVBQUUsZ0JBQWdCLEVBQUUsdUJBQXVCLEVBQUUsMEJBQTBCLEVBQUUsR0FBRyxPQUFPLENBQUMsT0FBTyxDQUFDO0lBQ2xHLE1BQU0sa0JBQWtCLEdBQUcsTUFBTTtTQUMvQixPQUFPLENBQUMsdUJBQXVCLElBQUksRUFBRSxDQUFDO1NBQ3RDLEdBQUcsQ0FBQyxDQUFDLENBQUMsT0FBTyxFQUFFLE1BQU0sQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQzVCLE9BQU8sRUFBRSxJQUFJLE1BQU0sQ0FBQyxPQUFPLENBQUM7UUFDNUIsTUFBTTtLQUNOLENBQUMsQ0FBQyxDQUFDO0lBRUwsTUFBTSx5QkFBeUIsR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDLGdCQUFnQixJQUFJLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FDM0UsQ0FBQyxDQUFDLEdBQUcsRUFBRSxNQUFNLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUUsV0FBVyxFQUFFLE1BQU0sQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUNwRSxDQUFDO0lBRUYsT0FBTyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRTtRQUNsQyxNQUFNLFlBQVksR0FBRyxtQkFBbUIsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUU5QyxxQ0FBcUM7UUFDckMsSUFBSSxNQUEwQixDQUFDO1FBQy9CLElBQUksWUFBWSxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxPQUFPLENBQUMsT0FBTyxDQUFDLElBQUksS0FBSyxRQUFRLElBQUksT0FBTyxDQUFDLGtCQUFrQixZQUFZLEdBQUcsRUFBRSxDQUFDO1lBQ2xILE1BQU0sYUFBYSxHQUFHLE9BQU8sQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLENBQUMsR0FBRyxPQUFPLENBQUMsT0FBTyxDQUFDLEdBQUcsSUFBSSxHQUFHLEVBQUUsQ0FBQyxDQUFDO1lBQ3RGLE1BQU0sR0FBRyxPQUFPLGFBQWEsS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsYUFBYSxFQUFFLFdBQVcsQ0FBQztRQUN6RixDQUFDO1FBRUQsSUFBSSxTQUFTLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxHQUFHLElBQUksZ0JBQWdCLEVBQUUsQ0FBQztZQUM1RCxNQUFNLGdCQUFnQixHQUFHLHdCQUF3QixDQUFDLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7WUFDekUsT0FBTztnQkFDTixHQUFHLEVBQUU7b0JBQ0osSUFBSSxFQUFFLE1BQU07b0JBQ1osSUFBSSxFQUFFLEdBQUc7b0JBQ1QsT0FBTyxFQUFFLHlCQUF5QjtpQkFDbEM7Z0JBQ0QsS0FBSyxFQUFFLCtCQUErQixDQUFDLGtCQUFrQixDQUFDLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLGdCQUFnQixDQUFDO2dCQUM5RyxjQUFjLEVBQUUsZ0JBQWdCLENBQUMsR0FBRyxDQUFDLENBQUMsV0FBVztnQkFDakQsU0FBUyxFQUFFLGlCQUFpQixDQUFDLFlBQVksQ0FBQztnQkFDMUMsU0FBUyxFQUFFLENBQUMsaUJBQWlCLENBQUMsWUFBWSxDQUFDO2dCQUMzQyxNQUFNO2FBQ29CLENBQUM7UUFDN0IsQ0FBQztRQUVELHVIQUF1SDtRQUN2SCx5R0FBeUc7UUFDekcsTUFBTSxTQUFTLEdBQUcsWUFBWSxLQUFLLFNBQVMsSUFBSSx1Q0FBdUMsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQzdHLE1BQU0sU0FBUyxHQUFHLENBQUMsQ0FBQyxZQUFZLElBQUksWUFBWSxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUMvRCxNQUFNLE1BQU0sR0FBRyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsQ0FBQyxFQUFFLE9BQU8sRUFBRSxFQUFFLEVBQUUsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsTUFBTSxDQUFDO1FBQ25GLElBQUksTUFBTSxFQUFFLENBQUM7WUFDWixNQUFNLGdCQUFnQixHQUFHLHdCQUF3QixDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQzFELE9BQU87Z0JBQ04sR0FBRyxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFO2dCQUNsQyxLQUFLLEVBQUUsK0JBQStCLENBQUMsa0JBQWtCLENBQUMsTUFBTSxDQUFDLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLGdCQUFnQixDQUFDO2dCQUMvRixjQUFjLEVBQUUsTUFBTSxDQUFDLFdBQVc7Z0JBQ2xDLFNBQVM7Z0JBQ1QsU0FBUztnQkFDVCxNQUFNO2FBQ29CLENBQUM7UUFDN0IsQ0FBQztRQUVELE1BQU0sb0JBQW9CLEdBQUcsd0JBQXdCLENBQ3BELE9BQU8sMEJBQTBCLEtBQUssU0FBUztZQUM5QyxDQUFDLENBQUMsRUFBRTtZQUNKLENBQUMsQ0FBQywwQkFBMEIsSUFBSSxFQUFFLENBQ25DLENBQUM7UUFFRixPQUFPO1lBQ04sR0FBRyxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFO1lBQ2xDLEtBQUssRUFBRSwrQkFBK0IsQ0FDckMsT0FBTywwQkFBMEIsS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLGtCQUFrQixDQUFDLDBCQUEwQixDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsRUFDMUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUNULG9CQUFvQixDQUNwQjtZQUNELGNBQWMsRUFBRSxPQUFPLDBCQUEwQixLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsMEJBQTBCLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxTQUFTO1lBQ25ILFNBQVM7WUFDVCxTQUFTO1lBQ1QsTUFBTTtTQUNvQixDQUFDO0lBQzdCLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO0FBQ3hELENBQUM7QUFFRCxTQUFTLHlCQUF5QixDQUFDLE9BQW1DO0lBQ3JFLE1BQU0sbUJBQW1CLEdBQTRCLE9BQU8sT0FBTyxDQUFDLFlBQVksS0FBSyxRQUFRO1FBQzVGLENBQUMsQ0FBQyxPQUFPLENBQUMsWUFBWSxJQUFJLEVBQUU7UUFDNUIsQ0FBQyxDQUFDLEVBQUUsQ0FBQztJQUVOLE1BQU0saUJBQWlCLEdBQTRCLE9BQU8sT0FBTyxDQUFDLFVBQVUsS0FBSyxRQUFRO1FBQ3hGLENBQUMsQ0FBQyxPQUFPLENBQUMsVUFBVSxJQUFJLEVBQUU7UUFDMUIsQ0FBQyxDQUFDLEVBQUUsQ0FBQztJQUVOLE1BQU0sSUFBSSxHQUFHLE9BQU8sQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUNsQyxFQUFFLEdBQUcsbUJBQW1CLEVBQUUsR0FBRyxpQkFBaUIsRUFBRSxDQUFDLENBQUM7UUFDbEQsbUJBQW1CLENBQUM7SUFFckIsTUFBTSxFQUFFLGdCQUFnQixFQUFFLEdBQUcsT0FBTyxDQUFDLE9BQU8sQ0FBQztJQUM3QyxNQUFNLGFBQWEsR0FBMEIsRUFBRSxDQUFDO0lBQ2hELEtBQUssTUFBTSxHQUFHLElBQUksZ0JBQWdCLEVBQUUsQ0FBQztRQUNwQyxNQUFNLFlBQVksR0FBRyxtQkFBbUIsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUU5QyxxQ0FBcUM7UUFDckMsSUFBSSxNQUEwQixDQUFDO1FBQy9CLElBQUksWUFBWSxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxPQUFPLENBQUMsT0FBTyxDQUFDLElBQUksS0FBSyxRQUFRLElBQUksT0FBTyxDQUFDLGtCQUFrQixZQUFZLEdBQUcsRUFBRSxDQUFDO1lBQ2xILE1BQU0sYUFBYSxHQUFHLE9BQU8sQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDMUQsTUFBTSxHQUFHLE9BQU8sYUFBYSxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxhQUFhLEVBQUUsV0FBVyxDQUFDO1FBQ3pGLENBQUM7UUFFRCxhQUFhLENBQUMsSUFBSSxDQUFDO1lBQ2xCLEdBQUcsRUFBRTtnQkFDSixJQUFJLEVBQUUsUUFBUTtnQkFDZCxJQUFJLEVBQUUsR0FBRzthQUNUO1lBQ0QsS0FBSyxFQUFFO2dCQUNOLElBQUksRUFBRSxTQUFTO2dCQUNmLElBQUksRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQzthQUNqQjtZQUNELGNBQWMsRUFBRSxnQkFBZ0IsQ0FBQyxHQUFHLENBQUMsQ0FBQyxXQUFXO1lBQ2pELFNBQVMsRUFBRSxLQUFLO1lBQ2hCLFNBQVMsRUFBRSxJQUFJO1lBQ2YsTUFBTTtTQUNOLENBQUMsQ0FBQztJQUNKLENBQUM7SUFDRCxPQUFPLGFBQWEsQ0FBQztBQUN0QixDQUFDO0FBRUQsU0FBUyxvQkFBb0IsQ0FBQyxPQUFtQztJQUNoRSxPQUFPLENBQUMsSUFBSSxFQUFFLEdBQUcsRUFBRSxFQUFFO1FBQ3BCLE1BQU0sV0FBVyxHQUF3QixFQUFFLENBQUM7UUFFNUMsSUFBSSxPQUFPLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxDQUFDO1lBQzFCLE9BQU8sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLEVBQUUsRUFBRTtnQkFDdkMsb0VBQW9FO2dCQUNwRSxJQUFJLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxXQUFXLElBQUksQ0FBQyxHQUFHLEtBQUssU0FBUyxJQUFJLEdBQUcsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztvQkFDckcsTUFBTSxXQUFXLEdBQUcsT0FBTyxDQUFDLE9BQU8sQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUMxRCxXQUFXLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLEdBQUcsRUFBRSxXQUFXLEVBQUUsQ0FBQyxDQUFDO2dCQUMvQyxDQUFDO1lBQ0YsQ0FBQyxDQUFDLENBQUM7UUFDSixDQUFDO1FBRUQsT0FBTyxXQUFXLENBQUMsTUFBTSxHQUFHLENBQUM7WUFDNUIsQ0FBQyxDQUFDLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssRUFBRSxPQUFPLEVBQUUsV0FBVyxFQUFFO1lBQ3BFLENBQUMsQ0FBQyxTQUFTLENBQUM7SUFDZCxDQUFDLENBQUM7QUFDSCxDQUFDO0FBRUQsU0FBUyx3QkFBd0IsQ0FBQyxPQUFtQztJQUNwRSxNQUFNLEVBQUUsZ0JBQWdCLEVBQUUsR0FBRyxPQUFPLENBQUMsT0FBTyxDQUFDO0lBQzdDLE1BQU0sYUFBYSxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLElBQUksRUFBRSxDQUFDLENBQUM7SUFFMUQsT0FBTyxJQUFJLENBQUMsRUFBRTtRQUNiLE1BQU0sWUFBWSxHQUFHLElBQUksR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ25DLE1BQU0sV0FBVyxHQUF3QixFQUFFLENBQUM7UUFFNUMsYUFBYSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsRUFBRTtZQUNqQyxJQUFJLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDO2dCQUNsQyxXQUFXLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRSxXQUFXLEVBQUUsZ0JBQWlCLENBQUMsU0FBUyxDQUFDLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQztZQUMvRixDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUM7UUFFSCxPQUFPLFdBQVcsQ0FBQyxNQUFNLEdBQUcsQ0FBQztZQUM1QixDQUFDLENBQUMsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFLE9BQU8sRUFBRSxXQUFXLEVBQUU7WUFDcEUsQ0FBQyxDQUFDLFNBQVMsQ0FBQztJQUNkLENBQUMsQ0FBQztBQUNILENBQUM7QUFFRCxTQUFTLDBCQUEwQixDQUFDLE9BQW1DO0lBQ3RFLE1BQU0sRUFBRSxnQkFBZ0IsRUFBRSx1QkFBdUIsRUFBRSwwQkFBMEIsRUFBRSxHQUFHLE9BQU8sQ0FBQyxPQUFPLENBQUM7SUFFbEcsTUFBTSxrQkFBa0IsR0FBRyxNQUFNO1NBQy9CLE9BQU8sQ0FBQyx1QkFBdUIsSUFBSSxFQUFFLENBQUM7U0FDdEMsR0FBRyxDQUFDLENBQUMsQ0FBQyxPQUFPLEVBQUUsTUFBTSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDNUIsT0FBTyxFQUFFLElBQUksTUFBTSxDQUFDLE9BQU8sQ0FBQztRQUM1QixNQUFNO0tBQ04sQ0FBQyxDQUFDLENBQUM7SUFFTCxPQUFPLENBQUMsR0FBVyxFQUFFLEVBQUU7UUFDdEIsSUFBSSxlQUF3QyxDQUFDO1FBRTdDLElBQUksU0FBUyxDQUFDLGdCQUFnQixDQUFDLElBQUksR0FBRyxJQUFJLGdCQUFnQixFQUFFLENBQUM7WUFDNUQsZUFBZSxHQUFHLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3pDLENBQUM7UUFFRCxNQUFNLGFBQWEsR0FBRyxlQUFlLElBQUksa0JBQWtCLENBQUMsSUFBSSxDQUFDLENBQUMsRUFBRSxPQUFPLEVBQUUsRUFBRSxFQUFFLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLE1BQU0sQ0FBQztRQUU3RyxJQUFJLFNBQVMsQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDO1lBQzlCLGVBQWUsR0FBRyxhQUFhLENBQUM7UUFDakMsQ0FBQzthQUFNLElBQUksU0FBUyxDQUFDLDBCQUEwQixDQUFDLElBQUksT0FBTywwQkFBMEIsS0FBSyxRQUFRLEVBQUUsQ0FBQztZQUNwRyxlQUFlLEdBQUcsMEJBQTBCLENBQUM7UUFDOUMsQ0FBQztRQUVELElBQUksU0FBUyxDQUFDLGVBQWUsQ0FBQyxFQUFFLENBQUM7WUFDaEMsTUFBTSxJQUFJLEdBQUcsa0JBQWtCLENBQUMsZUFBZSxDQUFDLENBQUM7WUFFakQsSUFBSSxJQUFJLEtBQUssU0FBUyxFQUFFLENBQUM7Z0JBQ3hCLE9BQU8sRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLGVBQWUsQ0FBQyxPQUFPLElBQUksSUFBSSxFQUFFLENBQUM7WUFDeEQsQ0FBQztpQkFBTSxJQUFJLElBQUksS0FBSyxNQUFNLEVBQUUsQ0FBQztnQkFDNUIsTUFBTSxPQUFPLEdBQUcsd0JBQXdCLENBQUMsZUFBZSxDQUFDLENBQUM7Z0JBQzFELE9BQU8sRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLGVBQWUsQ0FBQyxPQUFPLElBQUksT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssRUFBRSxPQUFPLEVBQUUsQ0FBQztZQUM3RSxDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsT0FBTyxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsZUFBZSxDQUFDLE9BQU8sSUFBSSxFQUFFLEVBQUUsQ0FBQztZQUN0RCxDQUFDO1FBQ0YsQ0FBQztRQUVELE9BQU87SUFDUixDQUFDLENBQUM7QUFDSCxDQUFDO0FBRUQsU0FBUyx3QkFBd0IsQ0FBQyxJQUFhO0lBQzlDLE9BQU8sSUFBSSxLQUFLLFFBQVEsSUFBSSxJQUFJLEtBQUssU0FBUyxDQUFDO0FBQ2hELENBQUM7QUFFRCxTQUFTLHdCQUF3QixDQUFDLFdBQXVDLEVBQUUsQ0FBMEI7SUFDcEcsTUFBTSxTQUFTLEdBQTRCLEVBQUUsQ0FBQztJQUM5QyxLQUFLLE1BQU0sR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDO1FBQ3JCLGtEQUFrRDtRQUNsRCxJQUFJLHlCQUE4QyxDQUFDO1FBQ25ELE1BQU0saUJBQWlCLEdBQUcsV0FBVyxDQUFDLE9BQU8sQ0FBQyx1QkFBdUIsQ0FBQztRQUN0RSxNQUFNLFVBQVUsR0FBRyxXQUFXLENBQUMsT0FBTyxDQUFDLGdCQUFnQixDQUFDO1FBQ3hELE1BQU0sb0JBQW9CLEdBQUcsV0FBVyxDQUFDLE9BQU8sQ0FBQywwQkFBMEIsQ0FBQztRQUU1RSxvRUFBb0U7UUFDcEUsSUFBSSxVQUFVLEVBQUUsQ0FBQztZQUNoQixLQUFLLE1BQU0sT0FBTyxJQUFJLFVBQVUsRUFBRSxDQUFDO2dCQUNsQyxJQUFJLE9BQU8sS0FBSyxHQUFHLEVBQUUsQ0FBQztvQkFDckIseUJBQXlCLEdBQUcsd0JBQXdCLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO29CQUMvRSxNQUFNO2dCQUNQLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQztRQUNELElBQUkseUJBQXlCLEtBQUssU0FBUyxJQUFJLGlCQUFpQixFQUFFLENBQUM7WUFDbEUsS0FBSyxNQUFNLFVBQVUsSUFBSSxpQkFBaUIsRUFBRSxDQUFDO2dCQUM1QyxJQUFJLEdBQUcsQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQztvQkFDM0IseUJBQXlCLEdBQUcsd0JBQXdCLENBQUMsaUJBQWlCLENBQUMsVUFBVSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUM7b0JBQ3pGLE1BQU07Z0JBQ1AsQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDO1FBQ0QsSUFBSSx5QkFBeUIsS0FBSyxTQUFTLElBQUksb0JBQW9CLElBQUksT0FBTyxvQkFBb0IsS0FBSyxTQUFTLEVBQUUsQ0FBQztZQUNsSCxJQUFJLHdCQUF3QixDQUFDLG9CQUFvQixDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7Z0JBQ3pELHlCQUF5QixHQUFHLElBQUksQ0FBQztZQUNsQyxDQUFDO1FBQ0YsQ0FBQztRQUNELFNBQVMsQ0FBQyxHQUFHLENBQUMsR0FBRyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDdEUsQ0FBQztJQUNELE9BQU8sU0FBUyxDQUFDO0FBQ2xCLENBQUM7QUFFRCxTQUFTLG1CQUFtQixDQUFDLE9BQW1DO0lBQy9ELElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztRQUNyRCxPQUFPLEVBQUUsQ0FBQztJQUNYLENBQUM7SUFFRCxJQUFJLE9BQU8sQ0FBQyxPQUFPLENBQUMsYUFBYSxLQUFLLE1BQU0sRUFBRSxDQUFDO1FBQzlDLElBQUksV0FBVyxHQUF3QixFQUFFLENBQUM7UUFDMUMsSUFBSSxPQUFPLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxDQUFDO1lBQzFCLFdBQVcsR0FBRyxPQUFPLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxFQUFFLEVBQUU7Z0JBQ3JELE9BQU87b0JBQ04sS0FBSyxFQUFFLE9BQU87b0JBQ2QsV0FBVyxFQUFFLE9BQU8sQ0FBQyxPQUFPLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQyxDQUFDLENBQUM7aUJBQ2xELENBQUM7WUFDSCxDQUFDLENBQUMsQ0FBQztRQUNKLENBQUM7UUFDRCxPQUFPLE9BQU8sQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBVyxFQUFFLEVBQUU7WUFDeEMsT0FBTztnQkFDTixLQUFLLEVBQUU7b0JBQ04sSUFBSSxFQUFFLE1BQU07b0JBQ1osSUFBSSxFQUFFLEdBQUc7b0JBQ1QsT0FBTyxFQUFFLFdBQVc7aUJBQ3BCO2FBQ0QsQ0FBQztRQUNILENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQztTQUFNLENBQUM7UUFDUCxPQUFPLE9BQU8sQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBVyxFQUFFLEVBQUU7WUFDeEMsT0FBTztnQkFDTixLQUFLLEVBQUU7b0JBQ04sSUFBSSxFQUFFLFFBQVE7b0JBQ2QsSUFBSSxFQUFFLEdBQUc7aUJBQ1Q7YUFDRCxDQUFDO1FBQ0gsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDO0FBQ0YsQ0FBQztBQUVELFNBQVMsb0JBQW9CLENBQUMsV0FBdUMsRUFBRSxnQkFBaUM7SUFDdkcsSUFBSSxXQUFXLENBQUMsT0FBTyxDQUFDLElBQUksSUFBSSxXQUFXLENBQUMsT0FBTyxDQUFDLFdBQVcsRUFBRSxDQUFDO1FBQ2pFLE9BQU8sV0FBVyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsTUFBTSxHQUFHLGdCQUFnQixDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUM7SUFDdEUsQ0FBQztTQUFNLENBQUM7UUFDUCxPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7QUFDRixDQUFDO0FBRUQsTUFBTSxVQUFVLG1CQUFtQixDQUFDLE9BQTBCLEVBQUUsa0JBQW9DLEVBQUUsTUFBOEIsRUFBRSxVQUF1QjtJQUM1SixNQUFNLFdBQVcsR0FBRyxlQUFlLENBQUMsa0JBQWtCLENBQUMsQ0FBQztJQUN4RCxPQUFPO1FBQ04sSUFBSSxFQUFFLG9CQUFvQixDQUFDLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxFQUFFLFVBQVUsQ0FBQztRQUNwRSxnQkFBZ0IsRUFBRSxXQUFXO0tBQzdCLENBQUM7QUFDSCxDQUFDO0FBRUQsTUFBTSxVQUFVLGtDQUFrQyxDQUFDLE1BQXdCLEVBQUUsTUFBc0IsRUFBRSxjQUFrQyxFQUFFLG9CQUFvRDtJQUM1TCxNQUFNLFdBQVcsR0FBRyxlQUFlLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDNUMsT0FBTyxDQUFDLEdBQUcsV0FBVyxDQUFDLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFDLFVBQVUsSUFBSSxjQUFjLENBQUMsT0FBTyxDQUFDLEdBQUcsRUFBRSxNQUFNLEVBQUUsY0FBYyxFQUFFLG9CQUFvQixDQUFDLENBQUMsWUFBWSxDQUFDLENBQUM7QUFDekosQ0FBQztBQUVELE1BQU0sQ0FBQyxLQUFLLFVBQVUsaUNBQWlDLENBQUMsZ0JBQW1DLEVBQUUsTUFBd0IsRUFBRSxNQUE4QjtJQUNwSixNQUFNLFlBQVksR0FBRyxJQUFJLEdBQUcsRUFBK0IsQ0FBQztJQUM1RCxNQUFNLGNBQWMsR0FBRyxDQUFDLFdBQW1CLEVBQUUsYUFBcUIsRUFBRSxVQUErQixFQUFFLEVBQUU7UUFDdEcsSUFBSSxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLEVBQUUsQ0FBQztZQUNwQyxNQUFNLFNBQVMsR0FBRztnQkFDakIsRUFBRSxFQUFFLFdBQVc7Z0JBQ2YsS0FBSyxFQUFFLGFBQWE7Z0JBQ3BCLFFBQVEsRUFBRSxFQUFFO2FBQ1osQ0FBQztZQUNGLFlBQVksQ0FBQyxHQUFHLENBQUMsV0FBVyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQzFDLENBQUM7UUFDRCxZQUFZLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBRSxDQUFDLFFBQVMsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7SUFDM0QsQ0FBQyxDQUFDO0lBQ0YsTUFBTSxpQkFBaUIsR0FBRyxLQUFLLEVBQUUsS0FBcUIsRUFBRSxFQUFFO1FBQ3pELE1BQU0sWUFBWSxHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO1FBQzVFLE1BQU0sUUFBUSxHQUFHLE1BQU0sQ0FBQyxDQUFDLENBQUMsbUJBQW1CLENBQUMsSUFBSSxHQUFHLENBQUMsWUFBWSxDQUFDLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLFlBQVksQ0FBQztRQUM1RixZQUFZLENBQUMsUUFBUSxDQUFDLENBQUM7UUFFdkIsTUFBTSxXQUFXLEdBQUcsS0FBSyxDQUFDLGFBQWMsQ0FBQyxFQUFFLENBQUM7UUFDNUMsTUFBTSxTQUFTLEdBQUcsTUFBTSxnQkFBZ0IsQ0FBQyxZQUFZLENBQUMsV0FBVyxDQUFDLENBQUM7UUFDbkUsTUFBTSxhQUFhLEdBQUcsU0FBUyxFQUFFLFdBQVcsSUFBSSxTQUFTLEVBQUUsSUFBSSxJQUFJLFdBQVcsQ0FBQztRQUUvRSxtR0FBbUc7UUFDbkcsNkVBQTZFO1FBQzdFLHVFQUF1RTtRQUN2RSx5REFBeUQ7UUFDekQsTUFBTSxjQUFjLEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRSxJQUFJLEtBQUssQ0FBQyxFQUFFLEtBQUssV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUM7UUFFdkYsTUFBTSxVQUFVLEdBQXdCO1lBQ3ZDLEVBQUUsRUFBRSxjQUFjO1lBQ2xCLEtBQUssRUFBRSxLQUFLLENBQUMsS0FBSztZQUNsQixLQUFLLEVBQUUsS0FBSyxDQUFDLEtBQUs7WUFDbEIsUUFBUTtTQUNSLENBQUM7UUFDRixjQUFjLENBQUMsV0FBVyxFQUFFLGFBQWEsRUFBRSxVQUFVLENBQUMsQ0FBQztJQUN4RCxDQUFDLENBQUM7SUFFRixNQUFNLGVBQWUsR0FBRyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUM5RCxPQUFPLE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRTtRQUM3QyxNQUFNLFNBQVMsR0FBMEIsRUFBRSxDQUFDO1FBQzVDLEtBQUssTUFBTSxrQkFBa0IsSUFBSSxZQUFZLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQztZQUN4RCxJQUFJLGtCQUFrQixDQUFDLFFBQVMsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7Z0JBQy9DLGlEQUFpRDtnQkFDakQsNEJBQTRCO2dCQUM1QixTQUFTLENBQUMsSUFBSSxDQUFDO29CQUNkLEVBQUUsRUFBRSxrQkFBa0IsQ0FBQyxFQUFFO29CQUN6QixLQUFLLEVBQUUsa0JBQWtCLENBQUMsUUFBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUs7b0JBQzVDLFFBQVEsRUFBRSxrQkFBa0IsQ0FBQyxRQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUTtpQkFDbEQsQ0FBQyxDQUFDO1lBQ0osQ0FBQztpQkFBTSxDQUFDO2dCQUNQLHVCQUF1QjtnQkFDdkIsa0RBQWtEO2dCQUNsRCxrQkFBa0IsQ0FBQyxRQUFTLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFO29CQUMxQyxPQUFPLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUNwRCxDQUFDLENBQUMsQ0FBQztnQkFFSCx3REFBd0Q7Z0JBQ3hELHdEQUF3RDtnQkFDeEQsb0RBQW9EO2dCQUNwRCxNQUFNLGNBQWMsR0FBRyxrQkFBa0IsQ0FBQyxRQUFTLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLEtBQUssS0FBSyxrQkFBa0IsQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFDNUcsSUFBSSxjQUFjLElBQUksQ0FBQyxjQUFjLENBQUMsUUFBUSxFQUFFLENBQUM7b0JBQ2hELE1BQU0sZUFBZSxHQUFHLGtCQUFrQixDQUFDLFFBQVMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxLQUFLLEtBQUssY0FBYyxDQUFDLENBQUM7b0JBQy9GLFNBQVMsQ0FBQyxJQUFJLENBQUM7d0JBQ2QsRUFBRSxFQUFFLGtCQUFrQixDQUFDLEVBQUU7d0JBQ3pCLEtBQUssRUFBRSxrQkFBa0IsQ0FBQyxLQUFLO3dCQUMvQixRQUFRLEVBQUUsY0FBYyxDQUFDLFFBQVE7d0JBQ2pDLFFBQVEsRUFBRSxlQUFlO3FCQUN6QixDQUFDLENBQUM7Z0JBQ0osQ0FBQztxQkFBTSxDQUFDO29CQUNQLDZCQUE2QjtvQkFDN0IsU0FBUyxDQUFDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO2dCQUNwQyxDQUFDO1lBQ0YsQ0FBQztRQUNGLENBQUM7UUFFRCwrQkFBK0I7UUFDL0IsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1FBRXpELE9BQU87WUFDTixFQUFFLEVBQUUsWUFBWTtZQUNoQixLQUFLLEVBQUUsUUFBUSxDQUFDLFlBQVksRUFBRSxZQUFZLENBQUM7WUFDM0MsUUFBUSxFQUFFLFNBQVM7U0FDbkIsQ0FBQztJQUNILENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQztBQUVELFNBQVMsb0JBQW9CLENBQUMsT0FBMEIsRUFBRSxXQUEwQixFQUFFLE1BQThCLEVBQUUsVUFBdUI7SUFDNUksSUFBSSxRQUEyQyxDQUFDO0lBQ2hELElBQUksT0FBTyxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQ3RCLFFBQVEsR0FBRyxPQUFPLENBQUMsUUFBUTthQUN6QixNQUFNLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsSUFBSSxLQUFLLElBQUksQ0FBQzthQUNwQyxHQUFHLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxvQkFBb0IsQ0FBQyxLQUFLLEVBQUUsV0FBVyxFQUFFLE1BQU0sRUFBRSxVQUFVLENBQUMsQ0FBQzthQUMxRSxNQUFNLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsUUFBUSxFQUFFLE1BQU0sSUFBSSxLQUFLLENBQUMsUUFBUSxFQUFFLE1BQU0sQ0FBQyxDQUFDO0lBQ3JFLENBQUM7SUFFRCxJQUFJLFFBQWdDLENBQUM7SUFDckMsSUFBSSxNQUFNLElBQUksT0FBTyxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQ2hDLFFBQVEsR0FBRyxtQkFBbUIsQ0FBQyxXQUFXLEVBQUU7WUFDM0MsT0FBTyxFQUFFO2dCQUNSLFdBQVcsRUFBRSxDQUFDLEdBQUcsTUFBTSxFQUFFLE9BQU8sRUFBRSxXQUFXLElBQUksRUFBRSxFQUFFLEdBQUcsT0FBTyxDQUFDLFFBQVEsSUFBSSxFQUFFLENBQUM7Z0JBQy9FLElBQUksRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUU7YUFDM0Q7WUFDRCxPQUFPLEVBQUUsTUFBTSxFQUFFLE9BQU8sSUFBSSxFQUFFO1NBQzlCLENBQUMsQ0FBQztRQUNILFlBQVksQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUN4QixDQUFDO0lBRUQsSUFBSSxDQUFDLFFBQVEsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQzVCLE1BQU0sSUFBSSxLQUFLLENBQUMsNkNBQTZDLE9BQU8sQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBQzVFLENBQUM7SUFFRCxPQUFPO1FBQ04sRUFBRSxFQUFFLE9BQU8sQ0FBQyxFQUFFO1FBQ2QsS0FBSyxFQUFFLE9BQU8sQ0FBQyxLQUFLO1FBQ3BCLFFBQVE7UUFDUixRQUFRO0tBQ1IsQ0FBQztBQUNILENBQUM7QUFFRDs7O0dBR0c7QUFDSCxTQUFTLFlBQVksQ0FBQyxRQUFvQjtJQUN6QyxNQUFNLHFCQUFxQixHQUFHLENBQUMsQ0FBQztJQUNoQyxNQUFNLHNCQUFzQixHQUFHLENBQUMsQ0FBQztJQUNqQyxNQUFNLDJCQUEyQixHQUFHLENBQUMsQ0FBQztJQUV0QyxNQUFNLHFCQUFxQixHQUFHLENBQUMsT0FBaUIsRUFBRSxFQUFFO1FBQ25ELElBQUksT0FBTyxDQUFDLElBQUksRUFBRSxRQUFRLENBQUMsY0FBYyxDQUFDLEVBQUUsQ0FBQztZQUM1QyxPQUFPLDJCQUEyQixDQUFDO1FBQ3BDLENBQUM7YUFBTSxJQUFJLE9BQU8sQ0FBQyxJQUFJLEVBQUUsUUFBUSxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUM7WUFDOUMsT0FBTyxzQkFBc0IsQ0FBQztRQUMvQixDQUFDO1FBQ0QsT0FBTyxxQkFBcUIsQ0FBQztJQUM5QixDQUFDLENBQUM7SUFFRixRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFO1FBQ3RCLE1BQU0sbUJBQW1CLEdBQUcscUJBQXFCLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDckQsTUFBTSxtQkFBbUIsR0FBRyxxQkFBcUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNyRCxJQUFJLG1CQUFtQixLQUFLLG1CQUFtQixFQUFFLENBQUM7WUFDakQsT0FBTyxtQkFBbUIsR0FBRyxtQkFBbUIsQ0FBQztRQUNsRCxDQUFDO1FBRUQsTUFBTSxlQUFlLEdBQUcseUJBQXlCLENBQUMsQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDcEUsT0FBTyxlQUFlLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUM3RSxDQUFDLENBQUMsQ0FBQztBQUNKLENBQUM7QUFFRCxTQUFTLG1CQUFtQixDQUFDLFdBQTBCLEVBQUUsTUFBa0I7SUFDMUUsTUFBTSxNQUFNLEdBQWUsRUFBRSxDQUFDO0lBRTlCLFdBQVcsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLEVBQUU7UUFDN0IsSUFBSSxhQUFhLEdBQUcsS0FBSyxDQUFDO1FBQzFCLElBQUksYUFBYSxHQUFHLEtBQUssQ0FBQztRQUUxQix3QkFBd0I7UUFDeEIsSUFBSSxNQUFNLENBQUMsT0FBTyxFQUFFLFdBQVcsRUFBRSxDQUFDO1lBQ2pDLGFBQWEsR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEVBQUU7Z0JBQ3pELElBQUksT0FBTyxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO29CQUNqQyxNQUFNLE9BQU8sR0FBRyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUNyQyxPQUFPLE9BQU8sQ0FBQyxJQUFJLEVBQUUsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDO2dCQUN4QyxDQUFDO3FCQUFNLENBQUM7b0JBQ1AsT0FBTyxjQUFjLENBQUMsT0FBTyxFQUFFLE9BQU8sQ0FBQyxDQUFDO2dCQUN6QyxDQUFDO1lBQ0YsQ0FBQyxDQUFDLENBQUM7UUFDSixDQUFDO2FBQU0sQ0FBQztZQUNQLGFBQWEsR0FBRyxJQUFJLENBQUM7UUFDdEIsQ0FBQztRQUVELElBQUksYUFBYSxJQUFJLE1BQU0sQ0FBQyxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxDQUFDO1lBQ25ELGFBQWEsR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQzlFLENBQUM7UUFFRCwyQ0FBMkM7UUFDM0MsSUFBSSxNQUFNLENBQUMsT0FBTyxFQUFFLFdBQVcsRUFBRSxDQUFDO1lBQ2pDLGFBQWEsR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEVBQUU7Z0JBQ3pELElBQUksT0FBTyxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO29CQUNqQyxNQUFNLE9BQU8sR0FBRyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUNyQyxPQUFPLE9BQU8sQ0FBQyxJQUFJLEVBQUUsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDO2dCQUN4QyxDQUFDO3FCQUFNLENBQUM7b0JBQ1AsT0FBTyxjQUFjLENBQUMsT0FBTyxFQUFFLE9BQU8sQ0FBQyxDQUFDO2dCQUN6QyxDQUFDO1lBQ0YsQ0FBQyxDQUFDLENBQUM7UUFDSixDQUFDO1FBRUQsSUFBSSxDQUFDLGFBQWEsSUFBSSxNQUFNLENBQUMsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsQ0FBQztZQUNwRCxhQUFhLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUM5RSxDQUFDO1FBRUQscUVBQXFFO1FBQ3JFLElBQUksYUFBYSxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7WUFDckMsTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUNyQixJQUFJLENBQUMscUJBQXFCLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUM3QyxXQUFXLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQzdCLENBQUM7UUFDRixDQUFDO0lBQ0YsQ0FBQyxDQUFDLENBQUM7SUFFSCxPQUFPLE1BQU0sQ0FBQztBQUNmLENBQUM7QUFFRCxNQUFNLG1CQUFtQixHQUFHLElBQUksR0FBRyxFQUFrQixDQUFDO0FBRXRELE1BQU0sVUFBVSx3QkFBd0IsQ0FBQyxPQUFlO0lBQ3ZELE9BQU8sR0FBRyxzQkFBc0IsQ0FBQyxPQUFPLENBQUM7U0FDdkMsT0FBTyxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsQ0FBQztJQUV6QixPQUFPLElBQUksTUFBTSxDQUFDLElBQUksT0FBTyxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUM7QUFDeEMsQ0FBQztBQUVELFNBQVMsY0FBYyxDQUFDLENBQVcsRUFBRSxPQUFlO0lBQ25ELElBQUksTUFBTSxHQUFHLG1CQUFtQixDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUM5QyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7UUFDYixNQUFNLEdBQUcsd0JBQXdCLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDM0MsbUJBQW1CLENBQUMsR0FBRyxDQUFDLE9BQU8sRUFBRSxNQUFNLENBQUMsQ0FBQztJQUMxQyxDQUFDO0lBRUQsT0FBTyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUMzQixDQUFDO0FBRUQsU0FBUyxlQUFlLENBQUMsY0FBZ0M7SUFDeEQsTUFBTSxNQUFNLEdBQWtCLElBQUksR0FBRyxFQUFFLENBQUM7SUFFeEMsS0FBSyxNQUFNLEtBQUssSUFBSSxjQUFjLEVBQUUsQ0FBQztRQUNwQyxLQUFLLE1BQU0sT0FBTyxJQUFJLEtBQUssQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUN0QyxLQUFLLE1BQU0sQ0FBQyxJQUFJLE9BQU8sQ0FBQyxRQUFRLEVBQUUsQ0FBQztnQkFDbEMsSUFBSSxDQUFDLENBQUMsQ0FBQyxTQUFTLElBQUksQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLE1BQU0sRUFBRSxDQUFDO29CQUN6QyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNmLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7SUFFRCxPQUFPLE1BQU0sQ0FBQztBQUNmLENBQUM7QUE2RUQsTUFBTSx5QkFBeUIsR0FBRyx3QkFBd0IsQ0FBQztBQUMzRCxNQUFNLG1DQUFtQyxHQUFHLGlDQUFpQyxDQUFDO0FBQzlFLE1BQU0sMkJBQTJCLEdBQUcsMEJBQTBCLENBQUM7QUFDL0QsTUFBTSx5QkFBeUIsR0FBRyx3QkFBd0IsQ0FBQztBQUMzRCxNQUFNLHlCQUF5QixHQUFHLHdCQUF3QixDQUFDO0FBQzNELE1BQU0sMEJBQTBCLEdBQUcseUJBQXlCLENBQUM7QUFDN0QsTUFBTSw0QkFBNEIsR0FBRywyQkFBMkIsQ0FBQztBQUNqRSxNQUFNLDRCQUE0QixHQUFHLDJCQUEyQixDQUFDO0FBQ2pFLE1BQU0sMkJBQTJCLEdBQUcsMEJBQTBCLENBQUM7QUFDL0QsTUFBTSxnQ0FBZ0MsR0FBRyw4QkFBOEIsQ0FBQztBQUN4RSxNQUFNLDRCQUE0QixHQUFHLDJCQUEyQixDQUFDO0FBQ2pFLE1BQU0sbUNBQW1DLEdBQUcsaUNBQWlDLENBQUM7QUFDOUUsTUFBTSxtQ0FBbUMsR0FBRyxpQ0FBaUMsQ0FBQztBQUM5RSxNQUFNLDRCQUE0QixHQUFHLHlCQUF5QixDQUFDO0FBQy9ELE1BQU0scUNBQXFDLEdBQUcsbUNBQW1DLENBQUM7QUFlbEYsU0FBUywwQkFBMEIsQ0FBQyxJQUFhO0lBQ2hELGdEQUFnRDtJQUNoRCxNQUFNLGlCQUFpQixHQUFHLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQzs7Ozs7Ozs7RUFRL0MsQ0FBQyxDQUFDO0lBRUgsaUJBQWlCLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxFQUFFO1FBQ25DLE9BQU8sQ0FBQyxZQUFZLENBQUMsdUJBQXVCLENBQUMsc0JBQXNCLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFDN0UsT0FBTyxDQUFDLFlBQVksQ0FBQyxVQUFVLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDeEMsQ0FBQyxDQUFDLENBQUM7QUFDSixDQUFDO0FBRUQsU0FBUyxxQkFBcUIsQ0FBQyxJQUFhO0lBQzNDLGdEQUFnRDtJQUNoRCxNQUFNLGlCQUFpQixHQUFHLElBQUksQ0FBQyxnQkFBZ0IsQ0FDOUMsSUFBSSx1QkFBdUIsQ0FBQyxzQkFBc0IsVUFBVSxDQUM1RCxDQUFDO0lBRUYsaUJBQWlCLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxFQUFFO1FBQ25DLE9BQU8sQ0FBQyxlQUFlLENBQUMsdUJBQXVCLENBQUMsc0JBQXNCLENBQUMsQ0FBQztRQUN4RSxPQUFPLENBQUMsWUFBWSxDQUFDLFVBQVUsRUFBRSxHQUFHLENBQUMsQ0FBQztJQUN2QyxDQUFDLENBQUMsQ0FBQztBQUNKLENBQUM7QUFPTSxJQUFlLHVCQUF1QixHQUF0QyxNQUFlLHVCQUF3QixTQUFRLFVBQVU7O2FBSS9DLGtCQUFhLEdBQUcsOEJBQThCLEFBQWpDLENBQWtDO2FBQy9DLHFCQUFnQixHQUFHLEdBQUcsR0FBRyxJQUFJLENBQUMsYUFBYSxBQUEzQixDQUE0QjthQUM1QyxtQkFBYyxHQUFHLHVCQUF1QixBQUExQixDQUEyQjthQUN6QyxzQkFBaUIsR0FBRyxHQUFHLEdBQUcsSUFBSSxDQUFDLGNBQWMsQUFBNUIsQ0FBNkI7YUFDOUMsc0JBQWlCLEdBQUcsa0JBQWtCLEFBQXJCLENBQXNCO2FBRXZDLHFCQUFnQixHQUFHLFVBQVUsQUFBYixDQUFjO2FBQzlCLG9CQUFlLEdBQUcsU0FBUyxBQUFaLENBQWE7YUFDNUIsMkJBQXNCLEdBQUcsZ0JBQWdCLEFBQW5CLENBQW9CO0lBMkIxRCxZQUNrQixjQUF5QixFQUN6Qix1QkFBd0YsRUFDMUYsYUFBK0MsRUFDekMsbUJBQTJELEVBQ2hFLGNBQWlELEVBQzFDLHFCQUErRCxFQUNyRSxlQUFtRCxFQUMvQyxtQkFBMkQsRUFDNUQsa0JBQXlELEVBQ3RELGNBQXdELEVBQzVELGtCQUF3RCxFQUM5QywyQkFBMkUsRUFDdkYsZUFBbUQsRUFDakQsaUJBQXVELEVBQzNELGFBQStDLEVBQ3BDLHdCQUFtRTtRQUU3RixLQUFLLEVBQUUsQ0FBQztRQWpCUyxtQkFBYyxHQUFkLGNBQWMsQ0FBVztRQUN6Qiw0QkFBdUIsR0FBdkIsdUJBQXVCLENBQWlFO1FBQ3ZFLGtCQUFhLEdBQWIsYUFBYSxDQUFlO1FBQ3RCLHdCQUFtQixHQUFuQixtQkFBbUIsQ0FBcUI7UUFDN0MsbUJBQWMsR0FBZCxjQUFjLENBQWdCO1FBQ3ZCLDBCQUFxQixHQUFyQixxQkFBcUIsQ0FBdUI7UUFDbEQsb0JBQWUsR0FBZixlQUFlLENBQWlCO1FBQzVCLHdCQUFtQixHQUFuQixtQkFBbUIsQ0FBcUI7UUFDekMsdUJBQWtCLEdBQWxCLGtCQUFrQixDQUFvQjtRQUNuQyxtQkFBYyxHQUFkLGNBQWMsQ0FBdUI7UUFDekMsdUJBQWtCLEdBQWxCLGtCQUFrQixDQUFtQjtRQUMzQixnQ0FBMkIsR0FBM0IsMkJBQTJCLENBQTZCO1FBQ3BFLG9CQUFlLEdBQWYsZUFBZSxDQUFpQjtRQUM5QixzQkFBaUIsR0FBakIsaUJBQWlCLENBQW1CO1FBQ3hDLGtCQUFhLEdBQWIsYUFBYSxDQUFlO1FBQ25CLDZCQUF3QixHQUF4Qix3QkFBd0IsQ0FBMEI7UUF6QzdFLCtCQUEwQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQThCLENBQUMsQ0FBQztRQUMvRiw4QkFBeUIsR0FBc0MsSUFBSSxDQUFDLDBCQUEwQixDQUFDLEtBQUssQ0FBQztRQUUzRix3QkFBbUIsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUF1QixDQUFDLENBQUM7UUFDbkYsdUJBQWtCLEdBQStCLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxLQUFLLENBQUM7UUFFdEUsdUJBQWtCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBVSxDQUFDLENBQUM7UUFDckUsc0JBQWlCLEdBQWtCLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxLQUFLLENBQUM7UUFFekQsMkJBQXNCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBMEIsQ0FBQyxDQUFDO1FBQ3ZGLDBCQUFxQixHQUFrQyxJQUFJLENBQUMsc0JBQXNCLENBQUMsS0FBSyxDQUFDO1FBRS9FLHVCQUFrQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQThCLENBQUMsQ0FBQztRQUN6RixzQkFBaUIsR0FBc0MsSUFBSSxDQUFDLGtCQUFrQixDQUFDLEtBQUssQ0FBQztRQUc3RSxnQ0FBMkIsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFRLENBQUMsQ0FBQztRQUMxRSwrQkFBMEIsR0FBZ0IsSUFBSSxDQUFDLDJCQUEyQixDQUFDLEtBQUssQ0FBQztRQUV2RSw4QkFBeUIsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFzQixDQUFDLENBQUM7UUFDeEYsNkJBQXdCLEdBQThCLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxLQUFLLENBQUM7UUFFakYsbUJBQWMsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFVLENBQUMsQ0FBQztRQUNqRSxrQkFBYSxHQUFrQixJQUFJLENBQUMsY0FBYyxDQUFDLEtBQUssQ0FBQztRQXNCakUsSUFBSSxDQUFDLGVBQWUsR0FBRyxrQkFBa0IsQ0FBQyx5QkFBeUIsRUFBRSxFQUFFLElBQUksQ0FBQyxjQUFjLENBQUMsQ0FBQztRQUM1RixJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsd0JBQXdCLENBQUMsQ0FBQyxDQUFDLEVBQUU7WUFDL0QsSUFBSSxDQUFDLGVBQWUsR0FBRyxrQkFBa0IsQ0FBQyx5QkFBeUIsRUFBRSxFQUFFLElBQUksQ0FBQyxjQUFjLENBQUMsQ0FBQztZQUM1RixJQUFJLENBQUMsMkJBQTJCLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDekMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUM7SUFNUyxvQkFBb0IsQ0FBQyxJQUFhLEVBQUUsVUFBdUIsRUFBRSxTQUFpQjtRQUN2RixVQUFVLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsQ0FBQztRQUN6QyxVQUFVLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxlQUFlLEdBQUcsU0FBUyxDQUFDLENBQUM7UUFFdEQsTUFBTSxTQUFTLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztRQUV4QyxNQUFNLFNBQVMsR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLFVBQVUsRUFBRSxDQUFDLENBQUMseUJBQXVCLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDO1FBQ3ZGLFNBQVMsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLDhCQUE4QixDQUFDLENBQUM7UUFDeEQsTUFBTSxZQUFZLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDLHFCQUFxQixDQUFDLENBQUMsQ0FBQztRQUNyRSxNQUFNLHNCQUFzQixHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsWUFBWSxFQUFFLENBQUMsQ0FBQyxtQ0FBbUMsQ0FBQyxDQUFDLENBQUM7UUFDaEcsTUFBTSxlQUFlLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxzQkFBc0IsRUFBRSxDQUFDLENBQUMsNEJBQTRCLENBQUMsQ0FBQyxDQUFDO1FBQzVGLE1BQU0scUJBQXFCLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxzQkFBc0IsRUFBRSxDQUFDLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDO1FBQy9GLE1BQU0sWUFBWSxHQUFHLFNBQVMsQ0FBQyxHQUFHLENBQUMsSUFBSSxlQUFlLENBQUMscUJBQXFCLENBQUMsQ0FBQyxDQUFDO1FBQy9FLE1BQU0sZUFBZSxHQUFHLFNBQVMsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLHFCQUFxQixDQUFDLGNBQWMsQ0FBQywyQkFBMkIsRUFBRSxZQUFZLENBQUMsQ0FBQyxDQUFDO1FBRTVILE1BQU0sa0JBQWtCLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDLDJCQUEyQixDQUFDLENBQUMsQ0FBQztRQUNqRixNQUFNLHdCQUF3QixHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQyxrQ0FBa0MsQ0FBQyxDQUFDLENBQUM7UUFDOUYsU0FBUyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLGlCQUFpQixDQUFDLHdCQUF3QixFQUFFO1lBQzVFLE9BQU8sRUFBRSxRQUFRLENBQUMsVUFBVSxFQUFFLHVEQUF1RCxDQUFDO1NBQ3RGLENBQUMsQ0FBQyxDQUFDO1FBRUosTUFBTSxZQUFZLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDLHFCQUFxQixDQUFDLENBQUMsQ0FBQztRQUNyRSxNQUFNLGNBQWMsR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLFlBQVksRUFBRSxDQUFDLENBQUMsMEJBQTBCLENBQUMsQ0FBQyxDQUFDO1FBRS9FLE1BQU0seUJBQXlCLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDLG1DQUFtQyxDQUFDLENBQUMsQ0FBQztRQUVoRyxNQUFNLGdCQUFnQixHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQyw0QkFBNEIsQ0FBQyxDQUFDLENBQUM7UUFDaEYsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixDQUFDLGdCQUFnQixDQUFDLENBQUM7UUFFNUQsTUFBTSxRQUFRLEdBQXlCO1lBQ3RDLFNBQVM7WUFDVCxrQkFBa0IsRUFBRSxTQUFTLENBQUMsR0FBRyxDQUFDLElBQUksZUFBZSxFQUFFLENBQUM7WUFFeEQsZ0JBQWdCLEVBQUUsU0FBUztZQUMzQixlQUFlO1lBQ2YsWUFBWTtZQUNaLGtCQUFrQjtZQUNsQixjQUFjO1lBQ2QseUJBQXlCO1lBQ3pCLGVBQWU7WUFDZixPQUFPO1NBQ1AsQ0FBQztRQUVGLDRDQUE0QztRQUM1QyxTQUFTLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQyxjQUFjLEVBQUUsR0FBRyxDQUFDLFNBQVMsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsZUFBZSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRTdHLFNBQVMsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDLFlBQVksRUFBRSxHQUFHLENBQUMsU0FBUyxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUM3SCxTQUFTLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQyxZQUFZLEVBQUUsR0FBRyxDQUFDLFNBQVMsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFaEksT0FBTyxRQUFRLENBQUM7SUFDakIsQ0FBQztJQUVTLDZCQUE2QixDQUFDLFFBQThCO1FBQ3JFLE1BQU0sWUFBWSxHQUFHLEdBQUcsQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLGdCQUFnQixDQUFDLENBQUM7UUFDL0QsUUFBUSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDckMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLFNBQVMsQ0FBQyxHQUFHLEVBQUU7WUFDbEQsSUFBSSxRQUFRLENBQUMsZ0JBQWdCLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDO2dCQUM3RCxRQUFRLENBQUMsZ0JBQWdCLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUN2RCxDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVKLFFBQVEsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxVQUFVLENBQUMsR0FBRyxFQUFFO1lBQ25ELFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBRW5ELElBQUksUUFBUSxDQUFDLE9BQU8sRUFBRSxDQUFDO2dCQUN0QixJQUFJLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUNoRCxDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFUyxvQkFBb0IsQ0FBQyxTQUFzQjtRQUNwRCxNQUFNLGVBQWUsR0FBRyxJQUFJLENBQUMsa0JBQWtCLENBQUMsZ0JBQWdCLENBQy9ELFFBQVEsQ0FBQywwQkFBMEIsRUFBRSxrQkFBa0IsQ0FBQyxFQUN4RCx5Q0FBeUMsQ0FBQyxDQUFDO1FBRTVDLE1BQU0sT0FBTyxHQUFHLElBQUksT0FBTyxDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsbUJBQW1CLEVBQUU7WUFDaEUsZUFBZTtZQUNmLDRCQUE0QixFQUFFLENBQUMsS0FBSztZQUNwQyxRQUFRLEVBQUUsc0JBQXNCO1NBQ2hDLENBQUMsQ0FBQztRQUNILE9BQU8sT0FBTyxDQUFDO0lBQ2hCLENBQUM7SUFFUyxvQkFBb0IsQ0FBQyxJQUFrRCxFQUFFLEtBQWEsRUFBRSxRQUF5RDtRQUMxSixNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDO1FBRTdCLHlEQUF5RDtRQUN6RCxpRUFBaUU7UUFDakUsT0FBTyxDQUFDLFdBQVcsRUFBRSxDQUFDO1FBRXRCLFFBQVEsQ0FBQyxPQUFPLEdBQUcsT0FBTyxDQUFDO1FBQzNCLFFBQVEsQ0FBQyxPQUFPLENBQUMsT0FBTyxHQUFHLE9BQU8sQ0FBQztRQUNuQyxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsdUJBQXVCLENBQUMsT0FBTyxDQUFDLE9BQU8sRUFBRSxPQUFPLENBQUMsY0FBYyxDQUFDLENBQUM7UUFDdEYsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsSUFBSSxRQUFRLENBQUMsa0JBQWtCLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDNUUsUUFBUSxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsRUFBRSxFQUFFLENBQUMsR0FBRyxJQUFJLENBQUMsY0FBYyxFQUFFLEdBQUcsT0FBTyxDQUFDLENBQUMsQ0FBQztRQUV0RSxNQUFNLE9BQU8sR0FBRyxPQUFPLENBQUMsT0FBTyxDQUFDO1FBRWhDLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLGVBQWUsRUFBRSxPQUFPLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDbEYsUUFBUSxDQUFDLGdCQUFnQixDQUFDLFlBQVksQ0FBQyx5QkFBdUIsQ0FBQyxnQkFBZ0IsRUFBRSxPQUFPLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3RHLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxZQUFZLENBQUMseUJBQXVCLENBQUMsZUFBZSxFQUFFLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUU1RixNQUFNLFlBQVksR0FBRyxPQUFPLENBQUMsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUMvRSxRQUFRLENBQUMsZUFBZSxDQUFDLFdBQVcsR0FBRyxPQUFPLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxlQUFlLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztRQUN2RyxRQUFRLENBQUMsa0JBQWtCLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsaUJBQWlCLENBQUMsUUFBUSxDQUFDLGVBQWUsRUFBRSxFQUFFLE9BQU8sRUFBRSxZQUFZLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFM0gsUUFBUSxDQUFDLFlBQVksQ0FBQyxJQUFJLEdBQUcsT0FBTyxDQUFDLFlBQVksQ0FBQztRQUNsRCxRQUFRLENBQUMsWUFBWSxDQUFDLEtBQUssR0FBRyxZQUFZLENBQUM7UUFFM0MsUUFBUSxDQUFDLGtCQUFrQixDQUFDLFNBQVMsR0FBRyxFQUFFLENBQUM7UUFDM0MsSUFBSSxPQUFPLENBQUMsT0FBTyxDQUFDLHFCQUFxQixFQUFFLENBQUM7WUFDM0MsTUFBTSxtQkFBbUIsR0FBRyxJQUFJLENBQUMscUJBQXFCLENBQUMsT0FBTyxFQUFFLFFBQVEsQ0FBQyxnQkFBZ0IsRUFBRSxPQUFPLENBQUMsV0FBVyxFQUFFLFFBQVEsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1lBQzdJLFFBQVEsQ0FBQyxrQkFBa0IsQ0FBQyxXQUFXLENBQUMsbUJBQW1CLENBQUMsQ0FBQztRQUM5RCxDQUFDO2FBQU0sQ0FBQztZQUNQLFFBQVEsQ0FBQyxrQkFBa0IsQ0FBQyxTQUFTLEdBQUcsT0FBTyxDQUFDLFdBQVcsQ0FBQztRQUM3RCxDQUFDO1FBRUQsUUFBUSxDQUFDLGVBQWUsQ0FBQyxvQkFBb0IsQ0FBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLDBCQUEwQixFQUFFLElBQUksQ0FBQyxjQUFjLENBQUMsQ0FBQztRQUM3RyxRQUFRLENBQUMsa0JBQWtCLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsd0JBQXdCLENBQUMsQ0FBQyxDQUFDLEVBQUU7WUFDaEYsSUFBSSxDQUFDLENBQUMsb0JBQW9CLENBQUMsMEJBQTBCLENBQUMsRUFBRSxDQUFDO2dCQUN4RCxRQUFRLENBQUMsZUFBZSxDQUFDLG9CQUFvQixDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsMEJBQTBCLEVBQUUsSUFBSSxDQUFDLGNBQWMsQ0FBQyxDQUFDO1lBQzlHLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosTUFBTSxRQUFRLEdBQUcsQ0FBQyxLQUFjLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLENBQUM7WUFDbEUsR0FBRyxFQUFFLE9BQU8sQ0FBQyxPQUFPLENBQUMsR0FBRztZQUN4QixLQUFLO1lBQ0wsSUFBSSxFQUFFLFFBQVEsQ0FBQyxPQUFRLENBQUMsU0FBUztZQUNqQyxXQUFXLEVBQUUsS0FBSztZQUNsQixLQUFLLEVBQUUsT0FBTyxDQUFDLE9BQU8sQ0FBQyxLQUFLO1NBQzVCLENBQUMsQ0FBQztRQUNILE1BQU0sZUFBZSxHQUFHLE9BQU8sQ0FBQyxPQUFPLENBQUMsa0JBQWtCLElBQUksRUFBRSxDQUFDO1FBQ2pFLElBQUksZUFBZSxJQUFJLE9BQU8sQ0FBQyxPQUFPLENBQUMsNEJBQTRCLEVBQUUsQ0FBQztZQUNyRSxRQUFRLENBQUMseUJBQXlCLENBQUMsU0FBUyxHQUFHLEVBQUUsQ0FBQztZQUNsRCxRQUFRLENBQUMseUJBQXlCLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxPQUFPLEVBQUUsUUFBUSxDQUFDLGdCQUFnQixFQUFFLE9BQU8sQ0FBQyxPQUFPLENBQUMsa0JBQW1CLEVBQUUsUUFBUSxDQUFDLGtCQUFrQixDQUFDLENBQUMsQ0FBQztRQUNsTCxDQUFDO2FBQU0sQ0FBQztZQUNQLFFBQVEsQ0FBQyx5QkFBeUIsQ0FBQyxTQUFTLEdBQUcsZUFBZSxDQUFDO1FBQ2hFLENBQUM7UUFDRCxRQUFRLENBQUMseUJBQXlCLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDLENBQUM7UUFDeEUsUUFBUSxDQUFDLGdCQUFnQixDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsZUFBZSxFQUFFLENBQUMsQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUUvRSxJQUFJLENBQUMsV0FBVyxDQUFDLE9BQU8sRUFBd0IsUUFBUSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBRXBFLFFBQVEsQ0FBQyxlQUFlLENBQUMsb0JBQW9CLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDdkQsUUFBUSxDQUFDLGVBQWUsQ0FBQyxpQkFBaUIsQ0FBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLGVBQWUsQ0FBQyxDQUFDO1FBQzFFLFFBQVEsQ0FBQyxlQUFlLENBQUMsOEJBQThCLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDakUsUUFBUSxDQUFDLGVBQWUsQ0FBQyxzQkFBc0IsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUN6RCxRQUFRLENBQUMsZUFBZSxDQUFDLHVCQUF1QixDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQzFELFFBQVEsQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLDBCQUEwQixDQUFDLEdBQUcsRUFBRTtZQUNwRSxRQUFRLENBQUMsZUFBZSxDQUFDLGlCQUFpQixDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUM7UUFDM0UsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVKLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxPQUFPLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFDOUMsUUFBUSxDQUFDLGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsbUJBQW1CLENBQUMsR0FBRyxFQUFFO1lBQ2hFLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxPQUFPLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFDL0MsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFTyxxQkFBcUIsQ0FBQyxPQUFtQyxFQUFFLFFBQXlEO1FBQzNILElBQUksT0FBTyxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ3RCLHFCQUFxQixDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1FBQ2xELENBQUM7YUFBTSxDQUFDO1lBQ1AsMEJBQTBCLENBQUMsUUFBUSxDQUFDLGdCQUFnQixDQUFDLENBQUM7UUFDdkQsQ0FBQztJQUNGLENBQUM7SUFFTyxxQkFBcUIsQ0FBQyxPQUFtQyxFQUFFLFNBQXNCLEVBQUUsSUFBWSxFQUFFLFdBQTRCO1FBQ3BJLDZDQUE2QztRQUM3QyxJQUFJLEdBQUcsZUFBZSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBRTdCLE1BQU0sZ0JBQWdCLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsd0JBQXdCLENBQUMsTUFBTSxDQUFDLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLEVBQUU7WUFDL0csYUFBYSxFQUFFLENBQUMsT0FBZSxFQUFFLEVBQUU7Z0JBQ2xDLElBQUksT0FBTyxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO29CQUM3QixNQUFNLENBQUMsR0FBMkI7d0JBQ2pDLE1BQU0sRUFBRSxPQUFPO3dCQUNmLFNBQVMsRUFBRSxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztxQkFDL0IsQ0FBQztvQkFDRixJQUFJLENBQUMsc0JBQXNCLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNyQyxDQUFDO3FCQUFNLENBQUM7b0JBQ1AsSUFBSSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLEVBQUUsYUFBYSxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLGlCQUFpQixDQUFDLENBQUM7Z0JBQ3JGLENBQUM7WUFDRixDQUFDO1lBQ0QsbUJBQW1CLEVBQUUsR0FBRyxFQUFFO2dCQUN6QixNQUFNLE1BQU0sR0FBRyxTQUFTLENBQUMsWUFBWSxDQUFDO2dCQUN0QyxJQUFJLE1BQU0sRUFBRSxDQUFDO29CQUNaLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxJQUFJLENBQUMsRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLENBQUMsQ0FBQztnQkFDMUQsQ0FBQztZQUNGLENBQUM7U0FDRCxDQUFDLENBQUMsQ0FBQztRQUVKLGdCQUFnQixDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLHVCQUF1QixDQUFDLENBQUM7UUFDaEUscUJBQXFCLENBQUMsZ0JBQWdCLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDaEQsT0FBTyxnQkFBZ0IsQ0FBQyxPQUFPLENBQUM7SUFDakMsQ0FBQztJQUlELGVBQWUsQ0FBQyxRQUE2QjtRQUM1QyxRQUFRLENBQUMsU0FBUyxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQzlCLENBQUM7SUFFRCxjQUFjLENBQUMsUUFBd0MsRUFBRSxNQUFjLEVBQUUsUUFBNkI7UUFDcEcsUUFBaUMsQ0FBQyxrQkFBa0IsRUFBRSxLQUFLLEVBQUUsQ0FBQztJQUNoRSxDQUFDOztBQWpSb0IsdUJBQXVCO0lBMEMxQyxXQUFBLGFBQWEsQ0FBQTtJQUNiLFdBQUEsbUJBQW1CLENBQUE7SUFDbkIsV0FBQSxjQUFjLENBQUE7SUFDZCxXQUFBLHFCQUFxQixDQUFBO0lBQ3JCLFdBQUEsZUFBZSxDQUFBO0lBQ2YsV0FBQSxtQkFBbUIsQ0FBQTtJQUNuQixXQUFBLGtCQUFrQixDQUFBO0lBQ2xCLFdBQUEscUJBQXFCLENBQUE7SUFDckIsWUFBQSxpQkFBaUIsQ0FBQTtJQUNqQixZQUFBLDJCQUEyQixDQUFBO0lBQzNCLFlBQUEsZUFBZSxDQUFBO0lBQ2YsWUFBQSxpQkFBaUIsQ0FBQTtJQUNqQixZQUFBLGFBQWEsQ0FBQTtJQUNiLFlBQUEsd0JBQXdCLENBQUE7R0F2REwsdUJBQXVCLENBa1I1Qzs7QUFFRCxNQUFNLG9CQUFvQjtJQUExQjtRQUNDLGVBQVUsR0FBRyw0QkFBNEIsQ0FBQztJQTJCM0MsQ0FBQztJQXpCQSxjQUFjLENBQUMsU0FBc0I7UUFDcEMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLENBQUM7UUFFdkMsTUFBTSxRQUFRLEdBQXdCO1lBQ3JDLE1BQU0sRUFBRSxTQUFTO1lBQ2pCLFNBQVMsRUFBRSxJQUFJLGVBQWUsRUFBRTtTQUNoQyxDQUFDO1FBRUYsT0FBTyxRQUFRLENBQUM7SUFDakIsQ0FBQztJQUVELGFBQWEsQ0FBQyxPQUFtRCxFQUFFLEtBQWEsRUFBRSxZQUFpQztRQUNsSCxZQUFZLENBQUMsTUFBTSxDQUFDLFNBQVMsR0FBRyxFQUFFLENBQUM7UUFDbkMsTUFBTSxZQUFZLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxZQUFZLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyw2REFBNkQsQ0FBQyxDQUFDLENBQUM7UUFDdkgsWUFBWSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsd0JBQXdCLE9BQU8sQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQztRQUM1RSxZQUFZLENBQUMsV0FBVyxHQUFHLE9BQU8sQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDO1FBRWpELElBQUksT0FBTyxDQUFDLE9BQU8sQ0FBQyxZQUFZLEVBQUUsQ0FBQztZQUNsQyxZQUFZLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDO1FBQ3BELENBQUM7SUFDRixDQUFDO0lBRUQsZUFBZSxDQUFDLFlBQWlDO1FBQ2hELFlBQVksQ0FBQyxTQUFTLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDbEMsQ0FBQztDQUNEO0FBRU0sSUFBTSw0QkFBNEIsR0FBbEMsTUFBTSw0QkFBNEI7SUFHeEMsWUFDa0IsZUFBaUQ7UUFBaEMsb0JBQWUsR0FBZixlQUFlLENBQWlCO1FBSG5FLGVBQVUsR0FBRyxtQ0FBbUMsQ0FBQztJQUtqRCxDQUFDO0lBRUQsY0FBYyxDQUFDLFNBQXNCO1FBQ3BDLE1BQU0sU0FBUyxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7UUFFeEMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsNkJBQTZCLENBQUMsQ0FBQztRQUV2RCxNQUFNLE1BQU0sR0FBRyxJQUFJLE1BQU0sQ0FBQyxTQUFTLEVBQUUsRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFLEdBQUcsbUJBQW1CLEVBQUUsQ0FBQyxDQUFDO1FBQzlFLFNBQVMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDdEIsU0FBUyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLEdBQUcsRUFBRTtZQUNwQyxJQUFJLFFBQVEsQ0FBQyxPQUFPLEVBQUUsQ0FBQztnQkFDdEIsSUFBSSxDQUFDLGVBQWUsQ0FBQyxjQUFjLENBQUMsbURBQW1ELEVBQUUsUUFBUSxDQUFDLE9BQU8sQ0FBQyxZQUFZLENBQUMsQ0FBQztZQUN6SCxDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNKLE1BQU0sQ0FBQyxLQUFLLEdBQUcsUUFBUSxDQUFDLDBCQUEwQixFQUFFLDBCQUEwQixDQUFDLENBQUM7UUFDaEYsTUFBTSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLGdDQUFnQyxDQUFDLENBQUM7UUFFL0QsTUFBTSxRQUFRLEdBQWtDO1lBQy9DLE1BQU07WUFDTixTQUFTO1NBQ1QsQ0FBQztRQUVGLE9BQU8sUUFBUSxDQUFDO0lBQ2pCLENBQUM7SUFFRCxhQUFhLENBQUMsT0FBMkQsRUFBRSxLQUFhLEVBQUUsWUFBMkM7UUFDcEksWUFBWSxDQUFDLE9BQU8sR0FBRyxPQUFPLENBQUMsT0FBTyxDQUFDO0lBQ3hDLENBQUM7SUFFRCxlQUFlLENBQUMsUUFBNkI7UUFDNUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUM5QixDQUFDO0NBQ0QsQ0FBQTtBQXRDWSw0QkFBNEI7SUFJdEMsV0FBQSxlQUFlLENBQUE7R0FKTCw0QkFBNEIsQ0FzQ3hDOztBQUVELE1BQU0sT0FBTyxzQkFBdUIsU0FBUSx1QkFBdUI7SUFBbkU7O1FBR0MsZUFBVSxHQUFHLDRCQUE0QixDQUFDO0lBeUUzQyxDQUFDO2FBM0V3Qix1QkFBa0IsR0FBRyxRQUFRLENBQUMsb0JBQW9CLEVBQUUsdUJBQXVCLENBQUMsQUFBMUQsQ0FBMkQ7SUFJckcsY0FBYyxDQUFDLFNBQXNCO1FBQ3BDLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJLEVBQUUsU0FBUyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBRXJFLE1BQU0sa0JBQWtCLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsY0FBYyxFQUFFLENBQUMsQ0FBQywyQkFBMkIsQ0FBQyxDQUFDLENBQUM7UUFDN0Ysa0JBQWtCLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyx1QkFBdUIsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUN4RSxrQkFBa0IsQ0FBQyxJQUFJLEdBQUcsUUFBUSxDQUFDO1FBRW5DLE1BQU0sNkJBQTZCLEdBQUcsQ0FBQyxDQUFDLGtDQUFrQyxDQUFDLENBQUM7UUFDNUUsTUFBTSxDQUFDLGdCQUFnQixDQUFDLFdBQVcsQ0FBQyw2QkFBNkIsQ0FBQyxDQUFDO1FBRW5FLE1BQU0sUUFBUSxHQUFnQztZQUM3QyxHQUFHLE1BQU07WUFDVCxNQUFNLEVBQUUsa0JBQWtCO1lBQzFCLDZCQUE2QjtTQUM3QixDQUFDO1FBRUYsSUFBSSxDQUFDLDZCQUE2QixDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBRTdDLE9BQU8sUUFBUSxDQUFDO0lBQ2pCLENBQUM7SUFFRCxhQUFhLENBQUMsT0FBcUQsRUFBRSxLQUFhLEVBQUUsWUFBeUM7UUFDNUgsS0FBSyxDQUFDLG9CQUFvQixDQUFDLE9BQU8sRUFBRSxLQUFLLEVBQUUsWUFBWSxDQUFDLENBQUM7SUFDMUQsQ0FBQztJQUVTLFdBQVcsQ0FBQyxXQUF1QyxFQUFFLFFBQXFDLEVBQUUsUUFBaUM7UUFDdEksTUFBTSxRQUFRLEdBQUcsNkJBQTZCLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUN4RSxNQUFNLHdCQUF3QixHQUFHLFFBQVEsQ0FBQywwQkFBMEIsRUFBRSx1QkFBdUIsRUFBRSxRQUFRLENBQUMsQ0FBQztRQUN6RyxNQUFNLG9CQUFvQixHQUFHLFdBQVcsQ0FBQyxPQUFPLENBQUMsb0JBQW9CLENBQUM7UUFDdEUsUUFBUSxDQUFDLE1BQU0sQ0FBQyxXQUFXLEdBQUcsb0JBQW9CO1lBQ2pELENBQUMsQ0FBQyx3QkFBd0I7WUFDMUIsQ0FBQyxDQUFDLHNCQUFzQixDQUFDLGtCQUFrQixDQUFDO1FBRTdDLE1BQU0sZ0JBQWdCLEdBQUcsQ0FBQyxDQUFVLEVBQUUsRUFBRTtZQUN2QyxJQUFJLG9CQUFvQixFQUFFLENBQUM7Z0JBQzFCLElBQUksQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLElBQUksb0JBQW9CLEdBQUcsUUFBUSxDQUFDLFVBQVUsQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ3JGLENBQUM7aUJBQU0sQ0FBQztnQkFDUCxJQUFJLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDdkQsQ0FBQztZQUNELENBQUMsQ0FBQyxjQUFjLEVBQUUsQ0FBQztZQUNuQixDQUFDLENBQUMsZUFBZSxFQUFFLENBQUM7UUFDckIsQ0FBQyxDQUFDO1FBQ0YsUUFBUSxDQUFDLGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMscUJBQXFCLENBQUMsUUFBUSxDQUFDLE1BQU0sRUFBRSxHQUFHLENBQUMsU0FBUyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsRUFBRSxFQUFFO1lBQ3JHLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3JCLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDSixRQUFRLENBQUMsa0JBQWtCLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFLEdBQUcsQ0FBQyxTQUFTLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxFQUFFLEVBQUU7WUFDeEcsTUFBTSxFQUFFLEdBQUcsSUFBSSxxQkFBcUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN4QyxJQUFJLEVBQUUsQ0FBQyxNQUFNLHdCQUFlLElBQUksRUFBRSxDQUFDLE1BQU0sdUJBQWUsRUFBRSxDQUFDO2dCQUMxRCxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNyQixDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVKLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxXQUFXLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFFOUMsSUFBSSxvQkFBb0IsRUFBRSxDQUFDO1lBQzFCLFFBQVEsQ0FBQyxNQUFNLENBQUMsWUFBWSxDQUFDLFlBQVksRUFBRSx3QkFBd0IsQ0FBQyxDQUFDO1FBQ3RFLENBQUM7YUFBTSxDQUFDO1lBQ1AsUUFBUSxDQUFDLE1BQU0sQ0FBQyxZQUFZLENBQUMsWUFBWSxFQUFFLEdBQUcsc0JBQXNCLENBQUMsa0JBQWtCLEtBQUssV0FBVyxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDO1FBQ3hILENBQUM7SUFDRixDQUFDO0lBRU8saUJBQWlCLENBQUMsV0FBdUMsRUFBRSxRQUFxQztRQUN2RyxNQUFNLE1BQU0sR0FBRyxXQUFXLENBQUMsWUFBWSxJQUFJLG1CQUFtQixDQUFDLFdBQVcsQ0FBQyxLQUFLLEVBQUUsV0FBVyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUM1RyxJQUFJLE1BQU0sRUFBRSxDQUFDO1lBQ1osUUFBUSxDQUFDLGdCQUFnQixDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLENBQUM7WUFDekQsUUFBUSxDQUFDLDZCQUE2QixDQUFDLFNBQVMsR0FBRyxNQUFNLENBQUM7WUFDMUQsT0FBTztRQUNSLENBQUM7UUFFRCxRQUFRLENBQUMsZ0JBQWdCLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxlQUFlLENBQUMsQ0FBQztJQUM3RCxDQUFDOztBQUdGLE1BQU0sNEJBQTZCLFNBQVEsc0JBQXNCO0lBQWpFOztRQUVVLGVBQVUsR0FBRyxtQ0FBbUMsQ0FBQztJQXFDM0QsQ0FBQztJQW5DUyxjQUFjLENBQUMsU0FBc0I7UUFDN0MsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixDQUFDLElBQUksRUFBRSxTQUFTLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFFbEUsTUFBTSxtQkFBbUIsR0FBRyxNQUFNLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMscUJBQXFCLENBQUMsY0FBYyxDQUFDLDJCQUEyQixFQUFFLE1BQU0sQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDO1FBQ2hKLG1CQUFtQixDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLHVCQUF1QixDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBRWpGLE1BQU0sa0JBQWtCLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxjQUFjLEVBQUUsQ0FBQyxDQUFDLG1EQUFtRCxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsMENBQTBDLENBQUMsQ0FBQyxDQUFDO1FBQ2hMLGtCQUFrQixDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsdUJBQXVCLENBQUMsYUFBYSxDQUFDLENBQUM7UUFDeEUsa0JBQWtCLENBQUMsSUFBSSxHQUFHLFFBQVEsQ0FBQztRQUVuQyxNQUFNLDZCQUE2QixHQUFHLENBQUMsQ0FBQyxrQ0FBa0MsQ0FBQyxDQUFDO1FBQzVFLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxXQUFXLENBQUMsNkJBQTZCLENBQUMsQ0FBQztRQUVuRSxNQUFNLFFBQVEsR0FBc0M7WUFDbkQsR0FBRyxNQUFNO1lBQ1QsTUFBTSxFQUFFLGtCQUFrQjtZQUMxQiw2QkFBNkI7WUFDN0IsbUJBQW1CO1NBQ25CLENBQUM7UUFFRixJQUFJLENBQUMsNkJBQTZCLENBQUMsUUFBUSxDQUFDLENBQUM7UUFFN0MsT0FBTyxRQUFRLENBQUM7SUFDakIsQ0FBQztJQUVrQixXQUFXLENBQUMsV0FBdUMsRUFBRSxRQUEyQyxFQUFFLFFBQWlDO1FBQ3JKLE1BQU0sS0FBSyxHQUFHLHFCQUFxQixDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQ2pELFFBQVEsQ0FBQyxtQkFBbUIsQ0FBQyxRQUFRLENBQUMsS0FBSyxFQUFFO1lBQzVDLFVBQVUsRUFBRSxXQUFXLENBQUMsT0FBTyxDQUFDLEdBQUc7WUFDbkMsYUFBYSxFQUFFLEtBQUs7WUFDcEIsVUFBVSxFQUFFLElBQUk7U0FDaEIsQ0FBQyxDQUFDO1FBQ0gsUUFBUSxDQUFDLE1BQU0sQ0FBQyxhQUFhLEVBQUUsU0FBUyxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsV0FBVyxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBQ3BGLEtBQUssQ0FBQyxXQUFXLENBQUMsV0FBVyxFQUFFLFFBQVEsRUFBRSxRQUFRLENBQUMsQ0FBQztJQUNwRCxDQUFDO0NBQ0Q7QUFFRCxNQUFNLG9CQUFxQixTQUFRLHVCQUF1QjtJQUExRDs7UUFDQyxlQUFVLEdBQUcsMEJBQTBCLENBQUM7SUE2R3pDLENBQUM7SUEzR0EsY0FBYyxDQUFDLFNBQXNCO1FBQ3BDLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJLEVBQUUsU0FBUyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQ2xFLGdEQUFnRDtRQUNoRCxNQUFNLGtCQUFrQixHQUFHLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxhQUFhLENBQUMsMkJBQTJCLENBQUUsQ0FBQztRQUMvRixNQUFNLDZCQUE2QixHQUFHLENBQUMsQ0FBQyxrQ0FBa0MsQ0FBQyxDQUFDO1FBQzVFLGtCQUFrQixDQUFDLEtBQUssQ0FBQyw2QkFBNkIsQ0FBQyxDQUFDO1FBRXhELE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxjQUFjLENBQUMsaUJBQWlCLEVBQUUsTUFBTSxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBQ3ZHLFVBQVUsQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyx1QkFBdUIsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUN4RSxNQUFNLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUVqQyxNQUFNLFFBQVEsR0FBNkI7WUFDMUMsR0FBRyxNQUFNO1lBQ1QsVUFBVTtZQUNWLDZCQUE2QjtTQUM3QixDQUFDO1FBRUYsSUFBSSxDQUFDLDZCQUE2QixDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBRTdDLE1BQU0sQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUNuQixVQUFVLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQyxFQUFFO1lBQzlCLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ2pELFFBQVEsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUM5QixDQUFDLENBQUMsQ0FDRixDQUFDO1FBRUYsT0FBTyxRQUFRLENBQUM7SUFDakIsQ0FBQztJQUVPLGNBQWMsQ0FBQyxRQUFrQyxFQUFFLENBQWtDO1FBQzVGLElBQUksUUFBUSxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ3RCLElBQUksUUFBUSxHQUFhLEVBQUUsQ0FBQztZQUM1QixJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDO2dCQUNoRCxRQUFRLEdBQUcsQ0FBQyxHQUFHLFFBQVEsQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLENBQUM7WUFDN0MsQ0FBQztpQkFBTSxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO2dCQUNsRCxRQUFRLEdBQUcsQ0FBQyxHQUFHLFFBQVEsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDeEMsQ0FBQztZQUVELElBQUksQ0FBQyxDQUFDLElBQUksS0FBSyxNQUFNLEVBQUUsQ0FBQztnQkFDdkIsMkJBQTJCO2dCQUMzQixNQUFNLFdBQVcsR0FBRyxDQUFDLENBQUMsV0FBVyxDQUFDO2dCQUNsQyxNQUFNLFdBQVcsR0FBRyxDQUFDLENBQUMsV0FBVyxDQUFDO2dCQUNsQyxNQUFNLFdBQVcsR0FBRyxRQUFRLENBQUMsTUFBTSxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDdkQsUUFBUSxDQUFDLE1BQU0sQ0FBQyxXQUFXLEVBQUUsQ0FBQyxFQUFFLFdBQVcsQ0FBQyxDQUFDO1lBQzlDLENBQUM7aUJBQU0sSUFBSSxDQUFDLENBQUMsSUFBSSxLQUFLLFFBQVEsSUFBSSxDQUFDLENBQUMsSUFBSSxLQUFLLE9BQU8sRUFBRSxDQUFDO2dCQUN0RCxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDbkMsQ0FBQztpQkFBTSxJQUFJLENBQUMsQ0FBQyxJQUFJLEtBQUssUUFBUSxFQUFFLENBQUM7Z0JBQ2hDLE1BQU0sYUFBYSxHQUFHLENBQUMsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztnQkFFdEQsZUFBZTtnQkFDZixJQUFJLENBQUMsQ0FBQyxXQUFXLEdBQUcsQ0FBQyxDQUFDLEVBQUUsQ0FBQztvQkFDeEIsUUFBUSxDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUMsR0FBRyxhQUFhLENBQUM7Z0JBQ3pDLENBQUM7Z0JBQ0Qsa0VBQWtFO2dCQUNsRSxxQ0FBcUM7cUJBQ2hDLENBQUM7b0JBQ0wsUUFBUSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztnQkFDOUIsQ0FBQztZQUNGLENBQUM7aUJBQU0sSUFBSSxDQUFDLENBQUMsSUFBSSxLQUFLLEtBQUssRUFBRSxDQUFDO2dCQUM3QixRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO1lBQ2hELENBQUM7WUFFRCxJQUNDLFFBQVEsQ0FBQyxPQUFPLENBQUMsWUFBWTtnQkFDN0IsS0FBSyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQztnQkFDNUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxZQUFZLENBQUMsTUFBTSxLQUFLLFFBQVEsQ0FBQyxNQUFNO2dCQUN4RCxRQUFRLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQyxJQUFJLEVBQUUsS0FBSyxRQUFRLENBQUMsSUFBSSxFQUFFLEVBQ3ZELENBQUM7Z0JBQ0YsT0FBTyxTQUFTLENBQUM7WUFDbEIsQ0FBQztZQUNELE9BQU8sUUFBUSxDQUFDO1FBQ2pCLENBQUM7UUFFRCxPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDO0lBRUQsYUFBYSxDQUFDLE9BQXFELEVBQUUsS0FBYSxFQUFFLFlBQXNDO1FBQ3pILEtBQUssQ0FBQyxvQkFBb0IsQ0FBQyxPQUFPLEVBQUUsS0FBSyxFQUFFLFlBQVksQ0FBQyxDQUFDO0lBQzFELENBQUM7SUFFUyxXQUFXLENBQUMsV0FBdUMsRUFBRSxRQUFrQyxFQUFFLFFBQTBEO1FBQzVKLE1BQU0sS0FBSyxHQUFHLG1CQUFtQixDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQy9DLE1BQU0sWUFBWSxHQUFHLFdBQVcsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxvQkFBb0IsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDO1FBQzlGLFFBQVEsQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLEtBQUssRUFBRTtZQUNuQyxhQUFhLEVBQUUsb0JBQW9CLENBQUMsV0FBVyxFQUFFLEtBQUssQ0FBQztZQUN2RCxZQUFZO1NBQ1osQ0FBQyxDQUFDO1FBQ0gsUUFBUSxDQUFDLE9BQU8sR0FBRyxXQUFXLENBQUM7UUFFL0IsUUFBUSxDQUFDLGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsR0FBRyxFQUFFO1lBQ2pELFFBQVEsQ0FBQyxVQUFVLENBQUMsVUFBVSxFQUFFLENBQUM7UUFDbEMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVKLFFBQVEsQ0FBQyxRQUFRLEdBQUcsQ0FBQyxDQUF1QixFQUFFLEVBQUU7WUFDL0MsSUFBSSxDQUFDLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxXQUFXLEVBQUUsUUFBUSxFQUFFLENBQUMsRUFBRSxLQUFLLENBQUMsRUFBRSxDQUFDO2dCQUNuRSxNQUFNLFFBQVEsR0FBRyxXQUFXLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQztnQkFDbkQsTUFBTSxTQUFTLEdBQUcsd0JBQXdCLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQzFFLFFBQVEsQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUNyQixDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsdURBQXVEO2dCQUN2RCw4REFBOEQ7Z0JBQzlELFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNiLENBQUM7UUFDRixDQUFDLENBQUM7UUFFRixzQkFBc0IsQ0FBQyxXQUFXLEVBQUUsUUFBUSxFQUFFLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQzlGLENBQUM7Q0FDRDtBQUVELE1BQWUsNkJBQThCLFNBQVEsdUJBQXVCO0lBRWpFLHdCQUF3QixDQUFDLE1BQTRCLEVBQUUsTUFBaUU7UUFDakksTUFBTSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLHVCQUF1QixDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBQ3BFLE1BQU0sQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRTdCLGdEQUFnRDtRQUNoRCxNQUFNLGtCQUFrQixHQUFHLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxhQUFhLENBQUMsMkJBQTJCLENBQUUsQ0FBQztRQUMvRixNQUFNLDZCQUE2QixHQUFHLENBQUMsQ0FBQyxrQ0FBa0MsQ0FBQyxDQUFDO1FBQzVFLGtCQUFrQixDQUFDLEtBQUssQ0FBQyw2QkFBNkIsQ0FBQyxDQUFDO1FBRXhELE1BQU0sUUFBUSxHQUErQjtZQUM1QyxHQUFHLE1BQU07WUFDVCw2QkFBNkI7U0FDN0IsQ0FBQztRQUNGLElBQUksTUFBTSxZQUFZLDJCQUEyQixFQUFFLENBQUM7WUFDbkQsUUFBUSxDQUFDLG9CQUFvQixHQUFHLE1BQU0sQ0FBQztRQUN4QyxDQUFDO2FBQU0sQ0FBQztZQUNQLFFBQVEsQ0FBQyxvQkFBb0IsR0FBRyxNQUFNLENBQUM7UUFDeEMsQ0FBQztRQUVELElBQUksQ0FBQyw2QkFBNkIsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUM3QyxPQUFPLFFBQVEsQ0FBQztJQUNqQixDQUFDO0lBRUQsYUFBYSxDQUFDLE9BQXFELEVBQUUsS0FBYSxFQUFFLFlBQXdDO1FBQzNILEtBQUssQ0FBQyxvQkFBb0IsQ0FBQyxPQUFPLEVBQUUsS0FBSyxFQUFFLFlBQVksQ0FBQyxDQUFDO0lBQzFELENBQUM7Q0FDRDtBQUVELE1BQU0scUJBQXNCLFNBQVEsNkJBQTZCO0lBQWpFOztRQUNVLGVBQVUsR0FBRywyQkFBMkIsQ0FBQztJQXdIbkQsQ0FBQztJQXRIQSxjQUFjLENBQUMsU0FBc0I7UUFDcEMsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixDQUFDLElBQUksRUFBRSxTQUFTLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFDbEUsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLHFCQUFxQixDQUFDLGNBQWMsQ0FBQywyQkFBMkIsRUFBRSxNQUFNLENBQUMsY0FBYyxDQUFDLENBQUM7UUFDN0csTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLHdCQUF3QixDQUFDLE1BQU0sRUFBRSxNQUFNLENBQUMsQ0FBQztRQUMvRCxNQUFNLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQyxFQUFFO1lBQy9DLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDckMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNKLE9BQU8sUUFBUSxDQUFDO0lBQ2pCLENBQUM7SUFFTyxpQkFBaUIsQ0FBQyxRQUFvQyxFQUFFLENBQW9DO1FBQ25HLE1BQU0sTUFBTSxHQUFHLFFBQVEsQ0FBQyxvQkFBcUIsQ0FBQztRQUM5QyxJQUFJLFFBQVEsQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUN0QixNQUFNLDRCQUE0QixHQUFHLHVDQUF1QyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQzNHLE1BQU0sWUFBWSxHQUE0QixPQUFPLFFBQVEsQ0FBQyxPQUFPLENBQUMsWUFBWSxLQUFLLFFBQVE7Z0JBQzlGLENBQUMsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLFlBQVksSUFBSSxFQUFFO2dCQUNyQyxDQUFDLENBQUMsRUFBRSxDQUFDO1lBRU4sTUFBTSxVQUFVLEdBQTRCLE9BQU8sUUFBUSxDQUFDLE9BQU8sQ0FBQyxVQUFVLEtBQUssUUFBUTtnQkFDMUYsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsVUFBVSxJQUFJLEVBQUU7Z0JBQ25DLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFFTixNQUFNLFFBQVEsR0FBNEIsRUFBRSxHQUFHLFFBQVEsQ0FBQyxPQUFPLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQywyRUFBMkU7WUFDekosTUFBTSxRQUFRLEdBQXNCLEVBQUUsQ0FBQztZQUV2QyxNQUFNLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksRUFBRSxHQUFHLEVBQUUsRUFBRTtnQkFDbEMsbUJBQW1CO2dCQUNuQixJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksS0FBSyxRQUFRLElBQUksQ0FBQyxDQUFDLElBQUksS0FBSyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsV0FBVyxLQUFLLEdBQUcsRUFBRSxDQUFDO29CQUN6RSx1RUFBdUU7b0JBQ3ZFLElBQUksQ0FBQyxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsSUFBSSxLQUFLLENBQUMsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksSUFBSSw0QkFBNEIsSUFBSSxDQUFDLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxJQUFJLElBQUksWUFBWSxFQUFFLENBQUM7d0JBQy9ILFFBQVEsQ0FBQyxDQUFDLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUM7b0JBQzFDLENBQUM7eUJBQU0sQ0FBQzt3QkFDUCxPQUFPLFFBQVEsQ0FBQyxDQUFDLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQztvQkFDMUMsQ0FBQztvQkFDRCxRQUFRLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDO29CQUNwRCxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQztnQkFDMUIsQ0FBQztnQkFDRCw2REFBNkQ7cUJBQ3hELElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxLQUFLLFFBQVEsSUFBSSxDQUFDLENBQUMsSUFBSSxLQUFLLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxDQUFDO29CQUM3RixRQUFRLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQztvQkFDMUMsUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDckIsQ0FBQztZQUNGLENBQUMsQ0FBQyxDQUFDO1lBRUgsbUJBQW1CO1lBQ25CLElBQUksQ0FBQyxDQUFDLElBQUksS0FBSyxRQUFRLElBQUksQ0FBQyxDQUFDLElBQUksS0FBSyxPQUFPLEVBQUUsQ0FBQztnQkFDL0MsTUFBTSxTQUFTLEdBQUcsQ0FBQyxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDO2dCQUMxQyxNQUFNLG9CQUFvQixHQUFHLENBQUMsQ0FBQyxJQUFJLEtBQUssUUFBUSxJQUFJLDRCQUE0QixJQUFJLFlBQVksQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUM7Z0JBQzFJLElBQUksb0JBQW9CLEVBQUUsQ0FBQztvQkFDMUIsUUFBUSxDQUFDLFNBQVMsQ0FBQyxHQUFHLElBQUksQ0FBQztnQkFDNUIsQ0FBQztxQkFBTSxDQUFDO29CQUNQLE9BQU8sUUFBUSxDQUFDLFNBQVMsQ0FBQyxDQUFDO2dCQUM1QixDQUFDO2dCQUVELE1BQU0sWUFBWSxHQUFHLFFBQVEsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksS0FBSyxTQUFTLENBQUMsQ0FBQztnQkFDN0UsTUFBTSxnQkFBZ0IsR0FBRyxZQUFZLENBQUMsU0FBUyxDQUFxQixDQUFDO2dCQUVyRSwwREFBMEQ7Z0JBQzFELElBQUksb0JBQW9CLElBQUksaUJBQWlCLENBQUMsWUFBWSxDQUFDLFNBQVMsQ0FBQyxDQUFDLElBQUksWUFBWSxHQUFHLENBQUMsQ0FBQyxFQUFFLENBQUM7b0JBQzdGLFFBQVEsQ0FBQyxNQUFNLENBQUMsWUFBWSxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUNsQyxDQUFDO3FCQUFNLElBQUksQ0FBQyxvQkFBb0IsSUFBSSxZQUFZLEdBQUcsQ0FBQyxDQUFDLEVBQUUsQ0FBQztvQkFDdkQsUUFBUSxDQUFDLFlBQVksQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLEdBQUcsZ0JBQWdCLENBQUM7Z0JBQ3RELENBQUM7WUFDRixDQUFDO1lBQ0QscUJBQXFCO2lCQUNoQixJQUFJLENBQUMsQ0FBQyxJQUFJLEtBQUssS0FBSyxFQUFFLENBQUM7Z0JBQzNCLFFBQVEsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUM7Z0JBQ3BELFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQzFCLENBQUM7WUFFRCxNQUFNLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLEtBQUssQ0FBQyxFQUFFLEVBQUU7Z0JBQ2pELHVEQUF1RDtnQkFDdkQsSUFBSSxVQUFVLENBQUMsR0FBRyxDQUFDLEtBQUssS0FBSyxJQUFJLFlBQVksQ0FBQyxHQUFHLENBQUMsS0FBSyxLQUFLLElBQUksQ0FBQyxDQUFDLDRCQUE0QixJQUFJLEtBQUssS0FBSyxJQUFJLENBQUMsRUFBRSxDQUFDO29CQUNuSCxPQUFPLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDdEIsQ0FBQztZQUNGLENBQUMsQ0FBQyxDQUFDO1lBRUgsTUFBTSxTQUFTLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxNQUFNLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQztZQUM1RSxRQUFRLENBQUMsb0JBQXFCLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQ2xELFFBQVEsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUNoQyxDQUFDO0lBQ0YsQ0FBQztJQUVTLFdBQVcsQ0FBQyxXQUF1QyxFQUFFLFFBQW9DLEVBQUUsUUFBOEQ7UUFDbEssTUFBTSxLQUFLLEdBQUcscUJBQXFCLENBQUMsV0FBVyxDQUFDLENBQUM7UUFDakQsTUFBTSxFQUFFLEdBQUcsRUFBRSxnQkFBZ0IsRUFBRSx1QkFBdUIsRUFBRSwwQkFBMEIsRUFBRSxhQUFhLEVBQUUsR0FBRyxXQUFXLENBQUMsT0FBTyxDQUFDO1FBRTFILFFBQVEsQ0FBQyxvQkFBcUIsQ0FBQyxRQUFRLENBQUMsS0FBSyxFQUFFO1lBQzlDLFVBQVUsRUFBRSxHQUFHO1lBQ2YsYUFBYSxFQUFFLDBCQUEwQixLQUFLLEtBQUs7Z0JBQ2xELENBQUMsQ0FBQyxDQUNELENBQUMsdUJBQXVCLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsSUFBSSxFQUFFLENBQUMsRUFBRSxLQUFLLENBQUM7b0JBQ3BFLFNBQVMsQ0FBQyx1QkFBdUIsQ0FBQyxDQUNsQztnQkFDRCxDQUFDLENBQUMsSUFBSTtZQUNQLFlBQVksRUFBRSx3QkFBd0IsQ0FBQyxXQUFXLENBQUM7WUFDbkQsY0FBYyxFQUFFLDBCQUEwQixDQUFDLFdBQVcsQ0FBQztZQUN2RCxhQUFhO1NBQ2IsQ0FBQyxDQUFDO1FBRUgsUUFBUSxDQUFDLE9BQU8sR0FBRyxXQUFXLENBQUM7UUFFL0IsUUFBUSxDQUFDLGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsR0FBRyxFQUFFO1lBQ2pELFFBQVEsQ0FBQyxvQkFBcUIsQ0FBQyxVQUFVLEVBQUUsQ0FBQztRQUM3QyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosUUFBUSxDQUFDLFFBQVEsR0FBRyxDQUFDLENBQXNDLEVBQUUsRUFBRTtZQUM5RCxJQUFJLENBQUMsSUFBSSxDQUFDLHNCQUFzQixDQUFDLFdBQVcsRUFBRSxRQUFRLEVBQUUsQ0FBQyxFQUFFLEtBQUssQ0FBQyxFQUFFLENBQUM7Z0JBQ25FLE1BQU0sWUFBWSxHQUFHLHdCQUF3QixDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFDOUQsUUFBUSxDQUFDLFlBQVksQ0FBQyxDQUFDO1lBQ3hCLENBQUM7aUJBQU0sQ0FBQztnQkFDUCx1REFBdUQ7Z0JBQ3ZELDhEQUE4RDtnQkFDOUQsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ2IsQ0FBQztRQUNGLENBQUMsQ0FBQztRQUNGLHNCQUFzQixDQUFDLFdBQVcsRUFBRSxRQUFRLEVBQUUsV0FBVyxDQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsQ0FBQztJQUN4RSxDQUFDO0NBQ0Q7QUFFRCxNQUFNLHlCQUEwQixTQUFRLDZCQUE2QjtJQUFyRTs7UUFDVSxlQUFVLEdBQUcsZ0NBQWdDLENBQUM7SUEyRXhELENBQUM7SUF6RUEsY0FBYyxDQUFDLFNBQXNCO1FBQ3BDLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJLEVBQUUsU0FBUyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQ2xFLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxjQUFjLENBQUMsMkJBQTJCLEVBQUUsTUFBTSxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBQzdHLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxNQUFNLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFDL0QsTUFBTSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUMsRUFBRTtZQUMvQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3JDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDSixPQUFPLFFBQVEsQ0FBQztJQUNqQixDQUFDO0lBRVMsaUJBQWlCLENBQUMsUUFBb0MsRUFBRSxDQUF3QztRQUN6RyxJQUFJLFFBQVEsQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUN0QixNQUFNLE1BQU0sR0FBRyxRQUFRLENBQUMsb0JBQXFCLENBQUM7WUFDOUMsTUFBTSxZQUFZLEdBQTRCLE9BQU8sUUFBUSxDQUFDLE9BQU8sQ0FBQyxZQUFZLEtBQUssUUFBUTtnQkFDOUYsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsWUFBWSxJQUFJLEVBQUU7Z0JBQ3JDLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFFTixNQUFNLFVBQVUsR0FBNEIsT0FBTyxRQUFRLENBQUMsT0FBTyxDQUFDLFVBQVUsS0FBSyxRQUFRO2dCQUMxRixDQUFDLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxVQUFVLElBQUksRUFBRTtnQkFDbkMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztZQUVOLE1BQU0sUUFBUSxHQUE0QixFQUFFLEdBQUcsUUFBUSxDQUFDLE9BQU8sQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDLDJFQUEyRTtZQUN6SixNQUFNLFFBQVEsR0FBMEIsRUFBRSxDQUFDO1lBRTNDLElBQUksQ0FBQyxDQUFDLElBQUksS0FBSyxRQUFRLEVBQUUsQ0FBQztnQkFDekIsT0FBTyxDQUFDLElBQUksQ0FBQyx1QkFBdUIsRUFBRSxDQUFDLENBQUMsSUFBSSxFQUFFLHlCQUF5QixFQUFFLFFBQVEsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDO2dCQUN2RyxPQUFPO1lBQ1IsQ0FBQztZQUVELE1BQU0sQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxFQUFFLEdBQUcsRUFBRSxFQUFFO2dCQUNsQyxtQkFBbUI7Z0JBQ25CLElBQUksQ0FBQyxDQUFDLFdBQVcsS0FBSyxHQUFHLEVBQUUsQ0FBQztvQkFDM0IsUUFBUSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQztvQkFDcEQsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUM7Z0JBQzFCLENBQUM7Z0JBQ0QsNkRBQTZEO3FCQUN4RCxJQUFJLENBQUMsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxDQUFDO29CQUMvQyxRQUFRLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQztvQkFDMUMsUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDckIsQ0FBQztZQUNGLENBQUMsQ0FBQyxDQUFDO1lBRUgsTUFBTSxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxLQUFLLENBQUMsRUFBRSxFQUFFO2dCQUNqRCx1REFBdUQ7Z0JBQ3ZELElBQUksVUFBVSxDQUFDLEdBQUcsQ0FBQyxLQUFLLEtBQUssSUFBSSxZQUFZLENBQUMsR0FBRyxDQUFDLEtBQUssS0FBSyxFQUFFLENBQUM7b0JBQzlELE9BQU8sUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDO2dCQUN0QixDQUFDO1lBQ0YsQ0FBQyxDQUFDLENBQUM7WUFFSCxNQUFNLFNBQVMsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLE1BQU0sS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDO1lBQzVFLFFBQVEsQ0FBQyxvQkFBcUIsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDbEQsUUFBUSxDQUFDLFFBQVEsRUFBRSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBRS9CLDREQUE0RDtZQUM1RCxvRUFBb0U7WUFDcEUsb0JBQW9CO1lBQ3BCLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ2hELENBQUM7SUFDRixDQUFDO0lBRVMsV0FBVyxDQUFDLFdBQXVDLEVBQUUsUUFBb0MsRUFBRSxRQUE4RDtRQUNsSyxNQUFNLEtBQUssR0FBRyx5QkFBeUIsQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUNyRCxNQUFNLEVBQUUsR0FBRyxFQUFFLEdBQUcsV0FBVyxDQUFDLE9BQU8sQ0FBQztRQUVwQyxRQUFRLENBQUMsb0JBQXFCLENBQUMsUUFBUSxDQUFDLEtBQUssRUFBRTtZQUM5QyxVQUFVLEVBQUUsR0FBRztTQUNmLENBQUMsQ0FBQztRQUVILFFBQVEsQ0FBQyxPQUFPLEdBQUcsV0FBVyxDQUFDO1FBQy9CLFFBQVEsQ0FBQyxRQUFRLEdBQUcsQ0FBQyxDQUFzQyxFQUFFLEVBQUU7WUFDOUQsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ2IsQ0FBQyxDQUFDO0lBQ0gsQ0FBQztDQUNEO0FBRUQsTUFBZSw2QkFBOEIsU0FBUSx1QkFBdUI7SUFJM0UsY0FBYyxDQUFDLFNBQXNCO1FBQ3BDLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJLEVBQUUsU0FBUyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBRWxFLE1BQU0sb0JBQW9CLEdBQUcsSUFBSSxDQUFDLHFCQUFxQixDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQyxDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQyxvQkFBb0IsRUFBRSxNQUFNLENBQUMsY0FBYyxDQUFDLENBQUM7UUFDOUosb0JBQW9CLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsdUJBQXVCLENBQUMsYUFBYSxDQUFDLENBQUM7UUFDbEYsTUFBTSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsb0JBQW9CLENBQUMsQ0FBQztRQUUzQyxNQUFNLFFBQVEsR0FBdUM7WUFDcEQsR0FBRyxNQUFNO1lBQ1Qsb0JBQW9CO1NBQ3BCLENBQUM7UUFFRixJQUFJLENBQUMsNkJBQTZCLENBQUMsUUFBUSxDQUFDLENBQUM7UUFFN0MsTUFBTSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsb0JBQW9CLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLHlCQUF5QixDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFN0csT0FBTyxRQUFRLENBQUM7SUFDakIsQ0FBQztJQUVPLHlCQUF5QixDQUFDLFFBQTRDLEVBQUUsQ0FBa0M7UUFDakgsSUFBSSxRQUFRLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDdEIsTUFBTSxRQUFRLEdBQUcsRUFBRSxHQUFHLFFBQVEsQ0FBQyxPQUFPLENBQUMsVUFBVSxFQUFFLENBQUM7WUFFcEQsOENBQThDO1lBQzlDLElBQUksQ0FBQyxDQUFDLElBQUksS0FBSyxLQUFLLEVBQUUsQ0FBQztnQkFDdEIsSUFBSSxDQUFDLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLElBQUksUUFBUSxDQUFDLE9BQU8sQ0FBQyxZQUFZLEVBQUUsQ0FBQztvQkFDM0Usb0NBQW9DO29CQUNwQyxRQUFRLENBQUMsQ0FBQyxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDLEdBQUcsS0FBSyxDQUFDO2dCQUN4RCxDQUFDO3FCQUFNLENBQUM7b0JBQ1AsT0FBTyxRQUFRLENBQUMsQ0FBQyxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7Z0JBQ3ZELENBQUM7WUFDRixDQUFDO1lBRUQsZ0RBQWdEO1lBQ2hELElBQUksQ0FBQyxDQUFDLElBQUksS0FBSyxRQUFRLElBQUksQ0FBQyxDQUFDLElBQUksS0FBSyxLQUFLLElBQUksQ0FBQyxDQUFDLElBQUksS0FBSyxNQUFNLEVBQUUsQ0FBQztnQkFDbEUsSUFBSSxDQUFDLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLElBQUksUUFBUSxDQUFDLE9BQU8sQ0FBQyxZQUFZLElBQUksQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLE9BQU8sRUFBRSxDQUFDO29CQUM1Rix5Q0FBeUM7b0JBQ3pDLE9BQU8sUUFBUSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO2dCQUNsRCxDQUFDO3FCQUFNLENBQUM7b0JBQ1AsUUFBUSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUM7Z0JBQ3BHLENBQUM7WUFDRixDQUFDO1lBRUQsU0FBUyxRQUFRLENBQW1CLEdBQU07Z0JBQ3pDLE1BQU0sVUFBVSxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDO3FCQUNqQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFtQixDQUFDO2dCQUV2RCxNQUFNLE1BQU0sR0FBZSxFQUFFLENBQUM7Z0JBQzlCLEtBQUssTUFBTSxHQUFHLElBQUksVUFBVSxFQUFFLENBQUM7b0JBQzlCLE1BQU0sQ0FBQyxHQUFHLENBQUMsR0FBRyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQ3hCLENBQUM7Z0JBQ0QsT0FBTyxNQUFNLENBQUM7WUFDZixDQUFDO1lBRUQsSUFBSSxDQUFDLG1CQUFtQixDQUFDLElBQUksQ0FBQztnQkFDN0IsR0FBRyxFQUFFLFFBQVEsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLEdBQUc7Z0JBQ2pDLEtBQUssRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLE1BQU0sS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQztnQkFDMUUsSUFBSSxFQUFFLFFBQVEsQ0FBQyxPQUFPLENBQUMsU0FBUztnQkFDaEMsV0FBVyxFQUFFLEtBQUs7Z0JBQ2xCLEtBQUssRUFBRSxRQUFRLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxLQUFLO2FBQ3JDLENBQUMsQ0FBQztRQUNKLENBQUM7SUFDRixDQUFDO0lBRUQsYUFBYSxDQUFDLE9BQXFELEVBQUUsS0FBYSxFQUFFLFlBQWdEO1FBQ25JLEtBQUssQ0FBQyxvQkFBb0IsQ0FBQyxPQUFPLEVBQUUsS0FBSyxFQUFFLFlBQVksQ0FBQyxDQUFDO0lBQzFELENBQUM7SUFFUyxXQUFXLENBQUMsV0FBdUMsRUFBRSxRQUE0QyxFQUFFLFFBQWlDO1FBQzdJLE1BQU0sS0FBSyxHQUFHLDZCQUE2QixDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQ3pELFFBQVEsQ0FBQyxvQkFBb0IsQ0FBQyxRQUFRLENBQUMsS0FBSyxFQUFFLEVBQUUsVUFBVSxFQUFFLFdBQVcsQ0FBQyxjQUFjLEVBQUUsQ0FBQyxDQUFDO1FBQzFGLFFBQVEsQ0FBQyxPQUFPLEdBQUcsV0FBVyxDQUFDO1FBQy9CLFFBQVEsQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLEdBQUcsRUFBRTtZQUNqRCxRQUFRLENBQUMsb0JBQW9CLENBQUMsVUFBVSxFQUFFLENBQUM7UUFDNUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRDtBQUVELE1BQU0sc0JBQXVCLFNBQVEsNkJBQTZCO0lBQWxFOztRQUNDLGVBQVUsR0FBRyw0QkFBNEIsQ0FBQztJQUszQyxDQUFDO0lBSG1CLFNBQVM7UUFDM0IsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0NBQ0Q7QUFFRCxNQUFNLHNCQUF1QixTQUFRLDZCQUE2QjtJQUFsRTs7UUFDQyxlQUFVLEdBQUcsNEJBQTRCLENBQUM7SUFLM0MsQ0FBQztJQUhtQixTQUFTO1FBQzNCLE9BQU8sS0FBSyxDQUFDO0lBQ2QsQ0FBQztDQUNEO0FBRUQsTUFBTSxzQkFBc0IsR0FBRyxnQkFBZ0IsQ0FBQztJQUMvQyxlQUFlLEVBQUUsMkJBQTJCO0lBQzVDLGVBQWUsRUFBRSwyQkFBMkI7SUFDNUMsV0FBVyxFQUFFLHVCQUF1QjtDQUNwQyxDQUFDLENBQUM7QUFFSCxNQUFlLDJCQUE0QixTQUFRLHVCQUF1QjtJQUExRTs7UUFDa0IseUJBQW9CLEdBQUcsR0FBRyxDQUFDO0lBa0Q3QyxDQUFDO0lBaERBLGNBQWMsQ0FBQyxVQUF1QixFQUFFLFlBQXNCO1FBQzdELE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJLEVBQUUsVUFBVSxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQ25FLE1BQU0sNkJBQTZCLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQyxDQUFDLGtDQUFrQyxDQUFDLENBQUMsQ0FBQztRQUVqSCxNQUFNLGVBQWUsR0FBa0I7WUFDdEMsY0FBYyxFQUFFLFlBQVk7WUFDNUIsYUFBYSxFQUFFLEtBQUs7WUFDcEIsaUJBQWlCLEVBQUUsSUFBSSxDQUFDLG9CQUFvQjtZQUM1QyxjQUFjLEVBQUUsc0JBQXNCO1NBQ3RDLENBQUM7UUFDRixNQUFNLFFBQVEsR0FBRyxJQUFJLFFBQVEsQ0FBQyxNQUFNLENBQUMsY0FBYyxFQUFFLElBQUksQ0FBQyxtQkFBbUIsRUFBRSxlQUFlLENBQUMsQ0FBQztRQUNoRyxNQUFNLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUMvQixNQUFNLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FDbkIsUUFBUSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsRUFBRTtZQUN4QixRQUFRLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDeEIsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNMLE1BQU0sQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQy9CLFFBQVEsQ0FBQyxZQUFZLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyx1QkFBdUIsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUMzRSxRQUFRLENBQUMsWUFBWSxDQUFDLFFBQVEsR0FBRyxDQUFDLENBQUM7UUFFbkMsTUFBTSxRQUFRLEdBQTZCO1lBQzFDLEdBQUcsTUFBTTtZQUNULFFBQVE7WUFDUiw2QkFBNkI7U0FDN0IsQ0FBQztRQUVGLElBQUksQ0FBQyw2QkFBNkIsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUU3QyxPQUFPLFFBQVEsQ0FBQztJQUNqQixDQUFDO0lBRUQsYUFBYSxDQUFDLE9BQXFELEVBQUUsS0FBYSxFQUFFLFlBQXNDO1FBQ3pILEtBQUssQ0FBQyxvQkFBb0IsQ0FBQyxPQUFPLEVBQUUsS0FBSyxFQUFFLFlBQVksQ0FBQyxDQUFDO0lBQzFELENBQUM7SUFFUyxXQUFXLENBQUMsV0FBdUMsRUFBRSxRQUFrQyxFQUFFLFFBQWlDO1FBQ25JLFFBQVEsQ0FBQyxRQUFRLEdBQUcsU0FBUyxDQUFDO1FBQzlCLFFBQVEsQ0FBQyxRQUFRLENBQUMsS0FBSyxHQUFHLFdBQVcsQ0FBQyxLQUFLLENBQUM7UUFDNUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsQ0FBQyxXQUFXLENBQUMsY0FBYyxDQUFDLENBQUM7UUFDMUQsUUFBUSxDQUFDLFFBQVEsQ0FBQyxZQUFZLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUN4RCxRQUFRLENBQUMsUUFBUSxHQUFHLEtBQUssQ0FBQyxFQUFFO1lBQzNCLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxXQUFXLEVBQUUsUUFBUSxFQUFFLEtBQUssQ0FBQyxFQUFFLENBQUM7Z0JBQ3RELFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUNqQixDQUFDO1FBQ0YsQ0FBQyxDQUFDO1FBRUYsaUJBQWlCLENBQUMsV0FBVyxFQUFFLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQztJQUNoRCxDQUFDO0NBQ0Q7QUFFRCxNQUFNLG1CQUFvQixTQUFRLDJCQUEyQjtJQUE3RDs7UUFDQyxlQUFVLEdBQUcseUJBQXlCLENBQUM7SUFleEMsQ0FBQztJQWJTLGNBQWMsQ0FBQyxVQUF1QjtRQUM5QyxNQUFNLFFBQVEsR0FBRyxLQUFLLENBQUMsY0FBYyxDQUFDLFVBQVUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV6RCw2R0FBNkc7UUFDN0csc0VBQXNFO1FBQ3RFLFFBQVEsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyw2QkFBNkIsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLFlBQVksRUFBRSxHQUFHLENBQUMsU0FBUyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsRUFBRTtZQUNwSCxJQUFJLENBQUMsQ0FBQyxNQUFNLDBCQUFpQixJQUFJLENBQUMsQ0FBQyxNQUFNLDRCQUFtQixFQUFFLENBQUM7Z0JBQzlELENBQUMsQ0FBQyxjQUFjLEVBQUUsQ0FBQztZQUNwQixDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVKLE9BQU8sUUFBUSxDQUFDO0lBQ2pCLENBQUM7Q0FDRDtBQUVELE1BQU0sNEJBQTZCLFNBQVEsMkJBQTJCO0lBQXRFOztRQUNDLGVBQVUsR0FBRyxtQ0FBbUMsQ0FBQztJQTRCbEQsQ0FBQztJQTFCUyxjQUFjLENBQUMsVUFBdUI7UUFDOUMsT0FBTyxLQUFLLENBQUMsY0FBYyxDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsQ0FBQztJQUMvQyxDQUFDO0lBRWtCLFdBQVcsQ0FBQyxXQUF1QyxFQUFFLFFBQWtDLEVBQUUsUUFBaUM7UUFDNUksTUFBTSxnQkFBZ0IsR0FBRyxDQUFDLEtBQWEsRUFBRSxFQUFFO1lBQzFDLHVIQUF1SDtZQUN2SCxXQUFXLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztZQUMxQixRQUFRLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDakIsQ0FBQyxDQUFDO1FBQ0YsS0FBSyxDQUFDLFdBQVcsQ0FBQyxXQUFXLEVBQUUsUUFBUSxFQUFFLGdCQUFnQixDQUFDLENBQUM7UUFDM0QsUUFBUSxDQUFDLGtCQUFrQixDQUFDLEdBQUcsQ0FDOUIsUUFBUSxDQUFDLFFBQVEsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsRUFBRTtZQUN2QyxNQUFNLE1BQU0sR0FBRyxRQUFRLENBQUMsZ0JBQWdCLENBQUMsWUFBWSxDQUFDO1lBQ3RELCtDQUErQztZQUMvQyw0REFBNEQ7WUFDNUQsSUFBSSxNQUFNLEVBQUUsQ0FBQztnQkFDWixJQUFJLENBQUMseUJBQXlCLENBQUMsSUFBSSxDQUFDO29CQUNuQyxPQUFPLEVBQUUsV0FBVztvQkFDcEIsTUFBTSxFQUFFLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxZQUFZO2lCQUM5QyxDQUFDLENBQUM7WUFDSixDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQ0YsQ0FBQztRQUNGLFFBQVEsQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFLENBQUM7SUFDNUIsQ0FBQztDQUNEO0FBRUQsTUFBTSxtQkFBb0IsU0FBUSx1QkFBdUI7SUFBekQ7O1FBQ0MsZUFBVSxHQUFHLHlCQUF5QixDQUFDO0lBMkd4QyxDQUFDO0lBekdBLGNBQWMsQ0FBQyxTQUFzQjtRQUNwQyxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsb0JBQW9CLENBQUMsSUFBSSxFQUFFLFNBQVMsRUFBRSxNQUFNLENBQUMsQ0FBQztRQUVsRSxNQUFNLE1BQU0sR0FBRyxrQkFBa0IsQ0FBQztZQUNqQyxnQkFBZ0IsRUFBRSx3QkFBd0I7WUFDMUMsZ0JBQWdCLEVBQUUsd0JBQXdCO1lBQzFDLFlBQVksRUFBRSxvQkFBb0I7WUFDbEMsZ0JBQWdCLEVBQUUsd0JBQXdCO1NBQzFDLENBQUMsQ0FBQztRQUVILE1BQU0sU0FBUyxHQUFHLElBQUksU0FBUyxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsSUFBSSxDQUFDLG1CQUFtQixFQUFFLE1BQU0sRUFBRTtZQUN4RSxjQUFjLEVBQUUsQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxDQUFDLEtBQUssSUFBSSxlQUFlLENBQUMsYUFBYSxDQUFDO1NBQ3ZHLENBQUMsQ0FBQztRQUVILE1BQU0sQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ2hDLFNBQVMsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBQ3hDLGdEQUFnRDtRQUNoRCxNQUFNLGFBQWEsR0FBRyxNQUFNLENBQUMsY0FBYyxDQUFDLGFBQWEsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUNwRSxJQUFJLGFBQWEsRUFBRSxDQUFDO1lBQ25CLGFBQWEsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLHVCQUF1QixDQUFDLGFBQWEsQ0FBQyxDQUFDO1lBQ25FLGFBQWEsQ0FBQyxRQUFRLEdBQUcsQ0FBQyxDQUFDO1FBQzVCLENBQUM7UUFFRCxNQUFNLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FDbkIsU0FBUyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsRUFBRTtZQUN6QixRQUFRLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQzlCLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFTCxNQUFNLHNCQUFzQixHQUFHLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLCtCQUErQixDQUFDLEVBQUUsTUFBTSxDQUFDLGtCQUFrQixDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBRS9JLE1BQU0sUUFBUSxHQUE2QjtZQUMxQyxHQUFHLE1BQU07WUFDVCxTQUFTO1lBQ1QsYUFBYTtZQUNiLHNCQUFzQjtTQUN0QixDQUFDO1FBRUYsSUFBSSxDQUFDLDZCQUE2QixDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBRTdDLE9BQU8sUUFBUSxDQUFDO0lBQ2pCLENBQUM7SUFFRCxhQUFhLENBQUMsT0FBcUQsRUFBRSxLQUFhLEVBQUUsWUFBc0M7UUFDekgsS0FBSyxDQUFDLG9CQUFvQixDQUFDLE9BQU8sRUFBRSxLQUFLLEVBQUUsWUFBWSxDQUFDLENBQUM7SUFDMUQsQ0FBQztJQUVTLFdBQVcsQ0FBQyxXQUF1QyxFQUFFLFFBQWtDLEVBQUUsUUFBaUM7UUFDbkksZ0ZBQWdGO1FBQ2hGLE1BQU0sY0FBYyxHQUFHLFdBQVcsQ0FBQyxPQUFPLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsV0FBVyxDQUFDLE9BQU8sQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO1FBQ3pHLE1BQU0sZ0JBQWdCLEdBQUcsV0FBVyxDQUFDLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLFdBQVcsQ0FBQyxPQUFPLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO1FBQy9HLE1BQU0sV0FBVyxHQUFHLENBQUMsR0FBRyxXQUFXLENBQUMsT0FBTyxDQUFDLElBQUssQ0FBQyxDQUFDO1FBQ25ELE1BQU0sMkJBQTJCLEdBQUcsV0FBVyxDQUFDLE9BQU8sQ0FBQywyQkFBMkIsQ0FBQztRQUVwRixNQUFNLFdBQVcsR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO1FBQzFDLFFBQVEsQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLENBQUM7UUFFN0MsSUFBSSxjQUFjLEdBQUcsS0FBSyxDQUFDO1FBQzNCLElBQUksQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxZQUFZLENBQUMsRUFBRSxDQUFDO1lBQ3JELDhDQUE4QztZQUM5QyxXQUFXLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxZQUFZLENBQUMsQ0FBQztZQUM5QyxnQkFBZ0IsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDN0IsY0FBYyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUMzQixjQUFjLEdBQUcsSUFBSSxDQUFDO1FBQ3ZCLENBQUM7UUFFRCw2REFBNkQ7UUFDN0QsTUFBTSx1QkFBdUIsR0FBRyxvQkFBb0IsQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUM7UUFDdkYsTUFBTSxjQUFjLEdBQXdCLFdBQVc7YUFDckQsR0FBRyxDQUFDLE1BQU0sQ0FBQzthQUNYLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQzthQUN6QixHQUFHLENBQUMsQ0FBQyxJQUFJLEVBQUUsS0FBSyxFQUFFLEVBQUU7WUFDcEIsTUFBTSxXQUFXLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLDJCQUEyQixDQUFDLENBQUMsQ0FBQyxlQUFlLENBQUMsZ0JBQWdCLENBQUMsS0FBSyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLGdCQUFnQixDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUMzSixPQUFPO2dCQUNOLElBQUksRUFBRSxjQUFjLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSTtnQkFDMUQsTUFBTSxFQUFFLGNBQWMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFO2dCQUN6QyxXQUFXO2dCQUNYLHFCQUFxQixFQUFFLDJCQUEyQjtnQkFDbEQsZ0NBQWdDLEVBQUUsQ0FBQyxPQUFPLEVBQUUsRUFBRTtvQkFDN0MsSUFBSSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsS0FBSyxDQUFDLGlCQUFpQixDQUFDLENBQUM7Z0JBQzVELENBQUM7Z0JBQ0QsY0FBYyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksS0FBSyx1QkFBdUIsQ0FBQyxJQUFJLENBQUMsY0FBYyxJQUFJLEtBQUssS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsa0JBQWtCLEVBQUUsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQzthQUM1RyxDQUFDO1FBQy9CLENBQUMsQ0FBQyxDQUFDO1FBRUosUUFBUSxDQUFDLFNBQVMsQ0FBQyxVQUFVLENBQUMsY0FBYyxDQUFDLENBQUM7UUFDOUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxZQUFZLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUN6RCxRQUFRLENBQUMsU0FBUyxDQUFDLFVBQVUsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxjQUFjLENBQUMsQ0FBQztRQUUzRCxJQUFJLEdBQUcsR0FBRyxXQUFXLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNqRCxJQUFJLEdBQUcsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDO1lBQ2hCLEdBQUcsR0FBRyxDQUFDLENBQUM7UUFDVCxDQUFDO1FBRUQsUUFBUSxDQUFDLFFBQVEsR0FBRyxTQUFTLENBQUM7UUFDOUIsUUFBUSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDL0IsUUFBUSxDQUFDLFFBQVEsR0FBRyxDQUFDLEdBQUcsRUFBRSxFQUFFO1lBQzNCLElBQUksY0FBYyxJQUFJLEdBQUcsS0FBSyxDQUFDLEVBQUUsQ0FBQztnQkFDakMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxZQUFZLENBQUMsQ0FBQztZQUNwQyxDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsUUFBUSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQzVCLENBQUM7UUFDRixDQUFDLENBQUM7UUFFRixRQUFRLENBQUMsc0JBQXNCLENBQUMsU0FBUyxHQUFHLEVBQUUsQ0FBQztJQUNoRCxDQUFDO0NBQ0Q7QUFFRCxNQUFNLDRCQUE0QixHQUFHLGdCQUFnQixDQUFDO0lBQ3JELGVBQWUsRUFBRSw2QkFBNkI7SUFDOUMsZUFBZSxFQUFFLDZCQUE2QjtJQUM5QyxXQUFXLEVBQUUseUJBQXlCO0NBQ3RDLENBQUMsQ0FBQztBQUVILE1BQU0scUJBQXNCLFNBQVEsdUJBQXVCO0lBQTNEOztRQUNDLGVBQVUsR0FBRywyQkFBMkIsQ0FBQztJQW9EMUMsQ0FBQztJQWxEQSxjQUFjLENBQUMsVUFBdUI7UUFDckMsTUFBTSxNQUFNLEdBQUcsS0FBSyxDQUFDLG9CQUFvQixDQUFDLElBQUksRUFBRSxVQUFVLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFDdEUsTUFBTSw2QkFBNkIsR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDLENBQUMsa0NBQWtDLENBQUMsQ0FBQyxDQUFDO1FBRWpILE1BQU0sUUFBUSxHQUFHLElBQUksUUFBUSxDQUFDLE1BQU0sQ0FBQyxjQUFjLEVBQUUsSUFBSSxDQUFDLG1CQUFtQixFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxjQUFjLEVBQUUsNEJBQTRCLEVBQUUsQ0FBQyxDQUFDO1FBQ2pKLE1BQU0sQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQy9CLE1BQU0sQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUNuQixRQUFRLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxFQUFFO1lBQ3hCLFFBQVEsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN4QixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ0wsTUFBTSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDL0IsUUFBUSxDQUFDLFlBQVksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLHVCQUF1QixDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBQzNFLFFBQVEsQ0FBQyxZQUFZLENBQUMsUUFBUSxHQUFHLENBQUMsQ0FBQztRQUVuQyxNQUFNLFFBQVEsR0FBK0I7WUFDNUMsR0FBRyxNQUFNO1lBQ1QsUUFBUTtZQUNSLDZCQUE2QjtTQUM3QixDQUFDO1FBRUYsSUFBSSxDQUFDLDZCQUE2QixDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBRTdDLE9BQU8sUUFBUSxDQUFDO0lBQ2pCLENBQUM7SUFFRCxhQUFhLENBQUMsT0FBcUQsRUFBRSxLQUFhLEVBQUUsWUFBd0M7UUFDM0gsS0FBSyxDQUFDLG9CQUFvQixDQUFDLE9BQU8sRUFBRSxLQUFLLEVBQUUsWUFBWSxDQUFDLENBQUM7SUFDMUQsQ0FBQztJQUVTLFdBQVcsQ0FBQyxXQUF1QyxFQUFFLFFBQW9DLEVBQUUsUUFBd0M7UUFDNUksTUFBTSxVQUFVLEdBQUcsQ0FBQyxXQUFXLENBQUMsU0FBUyxLQUFLLFNBQVMsSUFBSSxXQUFXLENBQUMsU0FBUyxLQUFLLGtCQUFrQixDQUFDO1lBQ3ZHLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQztRQUV6QixNQUFNLGNBQWMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxTQUFTLEtBQUssa0JBQWtCLElBQUksV0FBVyxDQUFDLFNBQVMsS0FBSyxpQkFBaUIsQ0FBQztZQUNuSCxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQVMsRUFBRSxFQUFFLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDO1FBRWpFLFFBQVEsQ0FBQyxRQUFRLEdBQUcsU0FBUyxDQUFDO1FBQzlCLFFBQVEsQ0FBQyxRQUFRLENBQUMsS0FBSyxHQUFHLE9BQU8sV0FBVyxDQUFDLEtBQUssS0FBSyxRQUFRLENBQUMsQ0FBQztZQUNoRSxXQUFXLENBQUMsS0FBSyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7UUFDbkMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEdBQUcsV0FBVyxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDO1FBQ2pGLFFBQVEsQ0FBQyxRQUFRLENBQUMsWUFBWSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDeEQsUUFBUSxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsQ0FBQyxXQUFXLENBQUMsY0FBYyxDQUFDLENBQUM7UUFDMUQsUUFBUSxDQUFDLFFBQVEsR0FBRyxLQUFLLENBQUMsRUFBRTtZQUMzQixJQUFJLENBQUMsaUJBQWlCLENBQUMsV0FBVyxFQUFFLFFBQVEsRUFBRSxLQUFLLENBQUMsRUFBRSxDQUFDO2dCQUN0RCxRQUFRLENBQUMsY0FBYyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7WUFDakMsQ0FBQztRQUNGLENBQUMsQ0FBQztRQUVGLGlCQUFpQixDQUFDLFdBQVcsRUFBRSxRQUFRLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDaEQsQ0FBQztDQUNEO0FBRUQsTUFBTSxtQkFBb0IsU0FBUSx1QkFBdUI7SUFBekQ7O1FBQ0MsZUFBVSxHQUFHLHlCQUF5QixDQUFDO0lBOEZ4QyxDQUFDO0lBNUZBLGNBQWMsQ0FBQyxVQUF1QjtRQUNyQyxVQUFVLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsQ0FBQztRQUN6QyxVQUFVLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO1FBRTlDLE1BQU0sU0FBUyxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7UUFFeEMsTUFBTSxTQUFTLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDLHVCQUF1QixDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQztRQUN2RixTQUFTLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDO1FBRXhELE1BQU0sWUFBWSxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDLENBQUM7UUFDckUsTUFBTSxlQUFlLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxZQUFZLEVBQUUsQ0FBQyxDQUFDLDRCQUE0QixDQUFDLENBQUMsQ0FBQztRQUNsRixNQUFNLHFCQUFxQixHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsWUFBWSxFQUFFLENBQUMsQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUM7UUFDckYsTUFBTSxZQUFZLEdBQUcsU0FBUyxDQUFDLEdBQUcsQ0FBQyxJQUFJLGVBQWUsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDLENBQUM7UUFDL0UsTUFBTSxlQUFlLEdBQUcsU0FBUyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMscUJBQXFCLENBQUMsY0FBYyxDQUFDLDJCQUEyQixFQUFFLFlBQVksQ0FBQyxDQUFDLENBQUM7UUFFNUgsTUFBTSwwQkFBMEIsR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUMsaUNBQWlDLENBQUMsQ0FBQyxDQUFDO1FBQy9GLE1BQU0sY0FBYyxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsMEJBQTBCLEVBQUUsQ0FBQyxDQUFDLDRCQUE0QixDQUFDLENBQUMsQ0FBQztRQUMvRixNQUFNLGtCQUFrQixHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsMEJBQTBCLEVBQUUsQ0FBQyxDQUFDLDJCQUEyQixDQUFDLENBQUMsQ0FBQztRQUNsRyxNQUFNLHdCQUF3QixHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQyxrQ0FBa0MsQ0FBQyxDQUFDLENBQUM7UUFDOUYsU0FBUyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLGlCQUFpQixDQUFDLHdCQUF3QixFQUFFO1lBQzVFLE9BQU8sRUFBRSxRQUFRLENBQUMsVUFBVSxFQUFFLHVEQUF1RCxDQUFDO1NBQ3RGLENBQUMsQ0FBQyxDQUFDO1FBRUosTUFBTSx5QkFBeUIsR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUMsbUNBQW1DLENBQUMsQ0FBQyxDQUFDO1FBRWhHLE1BQU0sUUFBUSxHQUFHLElBQUksTUFBTSxDQUFDLEVBQUUsSUFBSSxFQUFFLE9BQU8sQ0FBQyxLQUFLLEVBQUUsZUFBZSxFQUFFLHdCQUF3QixFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLEVBQUUsRUFBRSxHQUFHLG9CQUFvQixFQUFFLENBQUMsQ0FBQztRQUNySixjQUFjLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUM3QyxTQUFTLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ3hCLFNBQVMsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxHQUFHLEVBQUU7WUFDcEMsUUFBUSxDQUFDLFFBQVMsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDdEMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVKLFFBQVEsQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyx1QkFBdUIsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUN0RSxNQUFNLGdCQUFnQixHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQyw0QkFBNEIsQ0FBQyxDQUFDLENBQUM7UUFDaEYsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixDQUFDLGdCQUFnQixDQUFDLENBQUM7UUFDNUQsU0FBUyxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUV2QixNQUFNLFFBQVEsR0FBNkI7WUFDMUMsU0FBUztZQUNULGtCQUFrQixFQUFFLFNBQVMsQ0FBQyxHQUFHLENBQUMsSUFBSSxlQUFlLEVBQUUsQ0FBQztZQUV4RCxnQkFBZ0IsRUFBRSxTQUFTO1lBQzNCLGVBQWU7WUFDZixZQUFZO1lBQ1osY0FBYztZQUNkLFFBQVE7WUFDUixrQkFBa0I7WUFDbEIseUJBQXlCO1lBQ3pCLGVBQWU7WUFDZixPQUFPO1NBQ1AsQ0FBQztRQUVGLElBQUksQ0FBQyw2QkFBNkIsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUU3Qyw0Q0FBNEM7UUFDNUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMscUJBQXFCLENBQUMsY0FBYyxFQUFFLFdBQVcsRUFBRSxDQUFDLENBQWMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLGVBQWUsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMvRyxTQUFTLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQyxZQUFZLEVBQUUsR0FBRyxDQUFDLFNBQVMsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDN0gsU0FBUyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMscUJBQXFCLENBQUMsWUFBWSxFQUFFLEdBQUcsQ0FBQyxTQUFTLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRWhJLE9BQU8sUUFBUSxDQUFDO0lBQ2pCLENBQUM7SUFFRCxhQUFhLENBQUMsT0FBcUQsRUFBRSxLQUFhLEVBQUUsWUFBc0M7UUFDekgsS0FBSyxDQUFDLG9CQUFvQixDQUFDLE9BQU8sRUFBRSxLQUFLLEVBQUUsWUFBWSxDQUFDLENBQUM7SUFDMUQsQ0FBQztJQUVTLFdBQVcsQ0FBQyxXQUF1QyxFQUFFLFFBQWtDLEVBQUUsUUFBa0M7UUFDcEksUUFBUSxDQUFDLFFBQVEsR0FBRyxTQUFTLENBQUM7UUFDOUIsUUFBUSxDQUFDLFFBQVEsQ0FBQyxPQUFPLEdBQUcsV0FBVyxDQUFDLEtBQUssQ0FBQztRQUM5QyxJQUFJLFdBQVcsQ0FBQyxjQUFjLEVBQUUsQ0FBQztZQUNoQyxRQUFRLENBQUMsUUFBUSxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQzVCLFFBQVEsQ0FBQyxrQkFBa0IsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ3ZELENBQUM7YUFBTSxDQUFDO1lBQ1AsUUFBUSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUMzQixRQUFRLENBQUMsa0JBQWtCLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUV6RCxnR0FBZ0c7WUFDaEcsc0VBQXNFO1lBQ3RFLFFBQVEsQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDLFFBQVEsQ0FBQyxrQkFBa0IsRUFBRSxHQUFHLENBQUMsU0FBUyxDQUFDLFVBQVUsRUFBRSxDQUFDLENBQUMsRUFBRSxFQUFFO2dCQUN0SCxNQUFNLGFBQWEsR0FBZ0IsQ0FBQyxDQUFDLE1BQU0sQ0FBQztnQkFFNUMseUJBQXlCO2dCQUN6QixJQUFJLGFBQWEsQ0FBQyxPQUFPLENBQUMsV0FBVyxFQUFFLEtBQUssR0FBRyxFQUFFLENBQUM7b0JBQ2pELFFBQVEsQ0FBQyxRQUFRLENBQUMsT0FBTyxHQUFHLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUM7b0JBQ3ZELFFBQVEsQ0FBQyxRQUFTLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQztnQkFDL0MsQ0FBQztnQkFDRCxHQUFHLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN6QixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ0wsQ0FBQztRQUNELFFBQVEsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDcEQsUUFBUSxDQUFDLFFBQVEsR0FBRyxRQUFRLENBQUM7SUFDOUIsQ0FBQztDQUNEO0FBUUQsTUFBTSwrQkFBZ0MsU0FBUSx1QkFBdUI7SUFBckU7O1FBQ0MsZUFBVSxHQUFHLHFDQUFxQyxDQUFDO1FBRWxDLGtDQUE2QixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQVUsQ0FBQyxDQUFDO1FBQzlFLGlDQUE0QixHQUFHLElBQUksQ0FBQyw2QkFBNkIsQ0FBQyxLQUFLLENBQUM7SUFpRGxGLENBQUM7SUEvQ0EsY0FBYyxDQUFDLFVBQXVCO1FBQ3JDLE1BQU0sTUFBTSxHQUFHLEtBQUssQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJLEVBQUUsVUFBVSxFQUFFLGtCQUFrQixDQUFDLENBQUM7UUFFaEYsTUFBTSxZQUFZLEdBQUcsSUFBSSxNQUFNLENBQUMsTUFBTSxDQUFDLGdCQUFnQixFQUFFO1lBQ3hELEtBQUssRUFBRSxLQUFLO1lBQ1osR0FBRyxtQkFBbUI7U0FDdEIsQ0FBQyxDQUFDO1FBQ0gsWUFBWSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLHNDQUFzQyxDQUFDLENBQUM7UUFDM0UsWUFBWSxDQUFDLEtBQUssR0FBRyxRQUFRLENBQUMsZUFBZSxFQUFFLGdCQUFnQixDQUFDLENBQUM7UUFFakUsTUFBTSxhQUFhLEdBQUcsSUFBSSxNQUFNLENBQUMsTUFBTSxDQUFDLGdCQUFnQixFQUFFO1lBQ3pELEtBQUssRUFBRSxLQUFLO1lBQ1osU0FBUyxFQUFFLElBQUk7WUFDZixHQUFHLG1CQUFtQjtTQUN0QixDQUFDLENBQUM7UUFDSCxhQUFhLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsdUNBQXVDLENBQUMsQ0FBQztRQUM3RSxhQUFhLENBQUMsS0FBSyxHQUFHLFFBQVEsQ0FBQyxTQUFTLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFFckQsTUFBTSxRQUFRLEdBQXdDO1lBQ3JELEdBQUcsTUFBTTtZQUNULFlBQVk7WUFDWixhQUFhO1NBQ2IsQ0FBQztRQUVGLElBQUksQ0FBQyw2QkFBNkIsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUU3QyxPQUFPLFFBQVEsQ0FBQztJQUNqQixDQUFDO0lBRUQsYUFBYSxDQUFDLE9BQXFELEVBQUUsS0FBYSxFQUFFLFlBQWlEO1FBQ3BJLEtBQUssQ0FBQyxvQkFBb0IsQ0FBQyxPQUFPLEVBQUUsS0FBSyxFQUFFLFlBQVksQ0FBQyxDQUFDO0lBQzFELENBQUM7SUFFUyxXQUFXLENBQUMsV0FBdUMsRUFBRSxRQUE2QyxFQUFFLFFBQWdDO1FBQzdJLFFBQVEsQ0FBQyxrQkFBa0IsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUVwQyxNQUFNLFdBQVcsR0FBRyxXQUFXLENBQUMsT0FBTyxDQUFDLGtCQUFtQixDQUFDO1FBQzVELFFBQVEsQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQyxVQUFVLENBQUMsS0FBSyxJQUFJLEVBQUU7WUFDM0UsSUFBSSxDQUFDLGlCQUFpQixDQUFDLFVBQVUsQ0FBdUUsc0JBQXNCLEVBQUUsRUFBRSxXQUFXLEVBQUUsQ0FBQyxDQUFDO1lBQ2pKLElBQUksQ0FBQyxlQUFlLENBQUMsY0FBYyxDQUFDLGdCQUFnQixFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBQ3BFLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFSixRQUFRLENBQUMsa0JBQWtCLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsVUFBVSxDQUFDLEtBQUssSUFBSSxFQUFFO1lBQzVFLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxVQUFVLENBQXVFLHVCQUF1QixFQUFFLEVBQUUsV0FBVyxFQUFFLENBQUMsQ0FBQztZQUNsSixJQUFJLENBQUMsNkJBQTZCLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQ3RELENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Q7QUFFTSxJQUFNLG9CQUFvQixHQUExQixNQUFNLG9CQUFxQixTQUFRLFVBQVU7SUFzQm5ELFlBQ3dCLHFCQUE2RCxFQUMvRCxtQkFBeUQsRUFDekQsbUJBQXlELEVBQzlDLDhCQUErRTtRQUUvRyxLQUFLLEVBQUUsQ0FBQztRQUxnQywwQkFBcUIsR0FBckIscUJBQXFCLENBQXVCO1FBQzlDLHdCQUFtQixHQUFuQixtQkFBbUIsQ0FBcUI7UUFDeEMsd0JBQW1CLEdBQW5CLG1CQUFtQixDQUFxQjtRQUM3QixtQ0FBOEIsR0FBOUIsOEJBQThCLENBQWdDO1FBdkIvRix3QkFBbUIsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUF1QixDQUFDLENBQUM7UUEwQnpGLElBQUksQ0FBQyxjQUFjLEdBQUc7WUFDckIsSUFBSSxNQUFNLENBQUMsdUJBQXVCLEVBQUUsUUFBUSxDQUFDLG1CQUFtQixFQUFFLGVBQWUsQ0FBQyxFQUFFLFNBQVMsRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFDLE9BQU8sRUFBQyxFQUFFO2dCQUN6SCxJQUFJLE9BQU8sWUFBWSwwQkFBMEIsRUFBRSxDQUFDO29CQUNuRCxJQUFJLENBQUMsT0FBTyxDQUFDLFdBQVcsRUFBRSxDQUFDO3dCQUMxQixJQUFJLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDOzRCQUM3QixHQUFHLEVBQUUsT0FBTyxDQUFDLE9BQU8sQ0FBQyxHQUFHOzRCQUN4QixLQUFLLEVBQUUsU0FBUzs0QkFDaEIsSUFBSSxFQUFFLE9BQU8sQ0FBQyxPQUFPLENBQUMsSUFBd0I7NEJBQzlDLFdBQVcsRUFBRSxJQUFJOzRCQUNqQixLQUFLLEVBQUUsT0FBTyxDQUFDLE9BQU8sQ0FBQyxLQUFLO3lCQUM1QixDQUFDLENBQUM7b0JBQ0osQ0FBQztnQkFDRixDQUFDO1lBQ0YsQ0FBQyxDQUFDO1lBQ0YsSUFBSSxTQUFTLEVBQUU7WUFDZixJQUFJLENBQUMscUJBQXFCLENBQUMsY0FBYyxDQUFDLG1CQUFtQixDQUFDO1lBQzlELElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxjQUFjLENBQUMsdUJBQXVCLENBQUM7WUFDbEUsSUFBSSxDQUFDLHFCQUFxQixDQUFDLGNBQWMsQ0FBQyxzQkFBc0IsQ0FBQztTQUNqRSxDQUFDO1FBRUYsTUFBTSxhQUFhLEdBQUcsQ0FBQyxPQUFpQixFQUFFLGFBQTZCLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxPQUFPLEVBQUUsYUFBYSxDQUFDLENBQUM7UUFDOUgsTUFBTSxrQkFBa0IsR0FBRyxDQUFDLENBQVcsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDO1FBQy9DLE1BQU0saUJBQWlCLEdBQUcsSUFBSSxDQUFDLHFCQUFxQixDQUFDLGNBQWMsQ0FBQywrQkFBK0IsRUFBRSxFQUFFLEVBQUUsa0JBQWtCLENBQUMsQ0FBQztRQUM3SCxNQUFNLGdCQUFnQixHQUFHO1lBQ3hCLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxjQUFjLENBQUMsbUJBQW1CLEVBQUUsSUFBSSxDQUFDLGNBQWMsRUFBRSxhQUFhLENBQUM7WUFDbEcsSUFBSSxDQUFDLHFCQUFxQixDQUFDLGNBQWMsQ0FBQyxxQkFBcUIsRUFBRSxJQUFJLENBQUMsY0FBYyxFQUFFLGFBQWEsQ0FBQztZQUNwRyxJQUFJLENBQUMscUJBQXFCLENBQUMsY0FBYyxDQUFDLG9CQUFvQixFQUFFLElBQUksQ0FBQyxjQUFjLEVBQUUsYUFBYSxDQUFDO1lBQ25HLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxjQUFjLENBQUMsc0JBQXNCLEVBQUUsSUFBSSxDQUFDLGNBQWMsRUFBRSxhQUFhLENBQUM7WUFDckcsSUFBSSxDQUFDLHFCQUFxQixDQUFDLGNBQWMsQ0FBQyw0QkFBNEIsRUFBRSxJQUFJLENBQUMsY0FBYyxFQUFFLGFBQWEsQ0FBQztZQUMzRyxJQUFJLENBQUMscUJBQXFCLENBQUMsY0FBYyxDQUFDLG1CQUFtQixFQUFFLElBQUksQ0FBQyxjQUFjLEVBQUUsYUFBYSxDQUFDO1lBQ2xHLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxjQUFjLENBQUMsNEJBQTRCLEVBQUUsSUFBSSxDQUFDLGNBQWMsRUFBRSxhQUFhLENBQUM7WUFDM0csSUFBSSxDQUFDLHFCQUFxQixDQUFDLGNBQWMsQ0FBQyxzQkFBc0IsRUFBRSxJQUFJLENBQUMsY0FBYyxFQUFFLGFBQWEsQ0FBQztZQUNyRyxJQUFJLENBQUMscUJBQXFCLENBQUMsY0FBYyxDQUFDLHNCQUFzQixFQUFFLElBQUksQ0FBQyxjQUFjLEVBQUUsYUFBYSxDQUFDO1lBQ3JHLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxjQUFjLENBQUMsbUJBQW1CLEVBQUUsSUFBSSxDQUFDLGNBQWMsRUFBRSxhQUFhLENBQUM7WUFDbEcsSUFBSSxDQUFDLHFCQUFxQixDQUFDLGNBQWMsQ0FBQyxxQkFBcUIsRUFBRSxJQUFJLENBQUMsY0FBYyxFQUFFLGFBQWEsQ0FBQztZQUNwRyxJQUFJLENBQUMscUJBQXFCLENBQUMsY0FBYyxDQUFDLHlCQUF5QixFQUFFLElBQUksQ0FBQyxjQUFjLEVBQUUsYUFBYSxDQUFDO1lBQ3hHLGlCQUFpQjtTQUNqQixDQUFDO1FBRUYsSUFBSSxDQUFDLHlCQUF5QixHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsR0FBRyxnQkFBZ0IsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDO1FBQ3RHLElBQUksQ0FBQyxrQkFBa0IsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUNsQyxHQUFHLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxrQkFBa0IsQ0FBQyxFQUNsRCxJQUFJLENBQUMsbUJBQW1CLENBQUMsS0FBSyxDQUM5QixDQUFDO1FBQ0YsSUFBSSxDQUFDLDRCQUE0QixHQUFHLGlCQUFpQixDQUFDLDRCQUE0QixDQUFDO1FBQ25GLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLEdBQUcsZ0JBQWdCLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQztRQUN0RixJQUFJLENBQUMscUJBQXFCLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxHQUFHLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDLENBQUM7UUFDOUYsSUFBSSxDQUFDLGlCQUFpQixHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsR0FBRyxnQkFBZ0IsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDO1FBQ3RGLElBQUksQ0FBQyx3QkFBd0IsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLEdBQUcsZ0JBQWdCLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLHdCQUF3QixDQUFDLENBQUMsQ0FBQztRQUNwRyxJQUFJLENBQUMsYUFBYSxHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsR0FBRyxnQkFBZ0IsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQztRQUU5RSxJQUFJLENBQUMsWUFBWSxHQUFHO1lBQ25CLEdBQUcsZ0JBQWdCO1lBQ25CLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxjQUFjLENBQUMsb0JBQW9CLENBQUM7WUFDL0QsSUFBSSxDQUFDLHFCQUFxQixDQUFDLGNBQWMsQ0FBQyw0QkFBNEIsQ0FBQztTQUN2RSxDQUFDO0lBQ0gsQ0FBQztJQUVPLG9CQUFvQixDQUFDLE9BQWlCLEVBQUUsYUFBNkI7UUFDNUUsTUFBTSxPQUFPLEdBQWMsRUFBRSxDQUFDO1FBQzlCLElBQUksQ0FBQyxDQUFDLE9BQU8sQ0FBQyxLQUFLLElBQUksa0JBQWtCLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxJQUFJLGFBQWEsMkNBQW1DLEVBQUUsQ0FBQztZQUN4SCxPQUFPLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxjQUFjLENBQUMsK0JBQStCLEVBQUUsT0FBTyxDQUFDLENBQUMsQ0FBQztRQUNuRyxDQUFDO1FBQ0QsSUFBSSxJQUFJLENBQUMsOEJBQThCLENBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyxPQUFPLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztZQUNwRixPQUFPLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxjQUFjLENBQUMsaUJBQWlCLEVBQUUsT0FBTyxDQUFDLENBQUMsQ0FBQztRQUNyRixDQUFDO1FBQ0QsSUFBSSxPQUFPLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDcEIsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLElBQUksU0FBUyxFQUFFLENBQUMsQ0FBQztRQUN2QyxDQUFDO1FBQ0QsT0FBTyxPQUFPLENBQUM7SUFDaEIsQ0FBQztJQUVELGdCQUFnQjtRQUNmLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxlQUFlLEVBQUUsQ0FBQztJQUM1QyxDQUFDO0lBRUQsZUFBZSxDQUFDLE9BQW1DLEVBQUUsaUJBQThCO1FBQ2xGLGdEQUFnRDtRQUNoRCxNQUFNLGNBQWMsR0FBRyxpQkFBaUIsQ0FBQyxhQUFhLENBQUMsaUJBQWlCLENBQUMsQ0FBQztRQUMxRSxJQUFJLGNBQWMsRUFBRSxDQUFDO1lBQ3BCLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxlQUFlLENBQUM7Z0JBQ3hDLFVBQVUsRUFBRSxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsY0FBYztnQkFDckMsU0FBUyxFQUFFLEdBQUcsRUFBRSxDQUFjLGNBQWM7Z0JBQzVDLGlCQUFpQixFQUFFLEdBQUcsRUFBRSxDQUFDLE9BQU87YUFDaEMsQ0FBQyxDQUFDO1FBQ0osQ0FBQztJQUNGLENBQUM7SUFFRCxpQ0FBaUMsQ0FBQyxVQUF1QjtRQUN4RCxNQUFNLE1BQU0sR0FBRyxHQUFHLENBQUMsbUJBQW1CLENBQUMsVUFBVSxFQUFFLHVCQUF1QixDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBQzNGLElBQUksTUFBTSxFQUFFLENBQUM7WUFDWixPQUFPLE1BQU0sQ0FBQztRQUNmLENBQUM7UUFFRCxPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7SUFFRCwyQkFBMkIsQ0FBQyxhQUEwQixFQUFFLEdBQVc7UUFDbEUsZ0RBQWdEO1FBQ2hELE9BQU8sYUFBYSxDQUFDLGdCQUFnQixDQUFDLElBQUksdUJBQXVCLENBQUMsZ0JBQWdCLEtBQUssR0FBRyxJQUFJLENBQUMsQ0FBQztJQUNqRyxDQUFDO0lBRUQsNEJBQTRCLENBQUMsT0FBb0I7UUFDaEQsTUFBTSxjQUFjLEdBQUcsSUFBSSxDQUFDLGlDQUFpQyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ3ZFLE9BQU8sY0FBYyxJQUFJLGNBQWMsQ0FBQyxZQUFZLENBQUMsdUJBQXVCLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztJQUNoRyxDQUFDO0lBRUQsMkJBQTJCLENBQUMsT0FBb0I7UUFDL0MsTUFBTSxjQUFjLEdBQUcsSUFBSSxDQUFDLGlDQUFpQyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ3ZFLE9BQU8sY0FBYyxJQUFJLGNBQWMsQ0FBQyxZQUFZLENBQUMsdUJBQXVCLENBQUMsZUFBZSxDQUFDLENBQUM7SUFDL0YsQ0FBQztJQUVRLE9BQU87UUFDZixLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDaEIsSUFBSSxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLEVBQUU7WUFDcEMsSUFBSSxZQUFZLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQztnQkFDMUIsTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ2xCLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQztRQUNILElBQUksQ0FBQyxZQUFZLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxFQUFFO1lBQ3BDLElBQUksWUFBWSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUM7Z0JBQzVCLFFBQVEsQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUNwQixDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDO0NBQ0QsQ0FBQTtBQTFKWSxvQkFBb0I7SUF1QjlCLFdBQUEscUJBQXFCLENBQUE7SUFDckIsV0FBQSxtQkFBbUIsQ0FBQTtJQUNuQixXQUFBLG1CQUFtQixDQUFBO0lBQ25CLFdBQUEsOEJBQThCLENBQUE7R0ExQnBCLG9CQUFvQixDQTBKaEM7O0FBRUQ7O0dBRUc7QUFDSCxTQUFTLGlCQUFpQixDQUFDLFdBQXVDLEVBQUUsUUFBa0MsRUFBRSxlQUF3QjtJQUMvSCxJQUFJLFdBQVcsQ0FBQyxPQUFPLENBQUMsU0FBUyxFQUFFLENBQUM7UUFDbkMsTUFBTSxNQUFNLEdBQUcsV0FBVyxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUN0RSxJQUFJLE1BQU0sRUFBRSxDQUFDO1lBQ1osUUFBUSxDQUFDLGdCQUFnQixDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLENBQUM7WUFDekQsUUFBUSxDQUFDLDZCQUE2QixDQUFDLFNBQVMsR0FBRyxNQUFNLENBQUM7WUFDMUQsTUFBTSxlQUFlLEdBQUcsUUFBUSxDQUFDLGlCQUFpQixFQUFFLG1CQUFtQixDQUFDLENBQUM7WUFDekUsUUFBUSxDQUFDLFFBQVEsQ0FBQyxZQUFZLENBQUMsYUFBYyxDQUFDLFlBQVksQ0FBQyxZQUFZLEVBQUUsQ0FBQyxlQUFlLEVBQUUsTUFBTSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7WUFDOUcsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO2dCQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsZUFBZSxHQUFHLEdBQUcsR0FBRyxNQUFNLENBQUMsQ0FBQztZQUFDLENBQUM7WUFDdEUsT0FBTyxJQUFJLENBQUM7UUFDYixDQUFDO2FBQU0sQ0FBQztZQUNQLFFBQVEsQ0FBQyxRQUFRLENBQUMsWUFBWSxDQUFDLGFBQWMsQ0FBQyxlQUFlLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDN0UsQ0FBQztJQUNGLENBQUM7SUFDRCxRQUFRLENBQUMsZ0JBQWdCLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxlQUFlLENBQUMsQ0FBQztJQUM1RCxPQUFPLEtBQUssQ0FBQztBQUNkLENBQUM7QUFFRDs7R0FFRztBQUNILFNBQVMsc0JBQXNCLENBQzlCLFdBQXVDLEVBQ3ZDLFFBQStELEVBQy9ELEtBQXFELEVBQ3JELGVBQXdCO0lBRXhCLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLGVBQWUsQ0FBQyxDQUFDO0lBQ3pELElBQUksV0FBVyxDQUFDLE9BQU8sQ0FBQyxTQUFTLEVBQUUsQ0FBQztRQUNuQyxNQUFNLE1BQU0sR0FBRyxXQUFXLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNwRCxJQUFJLE1BQU0sSUFBSSxNQUFNLEtBQUssRUFBRSxFQUFFLENBQUM7WUFDN0IsUUFBUSxDQUFDLGdCQUFnQixDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLENBQUM7WUFDekQsUUFBUSxDQUFDLDZCQUE2QixDQUFDLFNBQVMsR0FBRyxNQUFNLENBQUM7WUFDMUQsTUFBTSxlQUFlLEdBQUcsUUFBUSxDQUFDLGlCQUFpQixFQUFFLG1CQUFtQixDQUFDLENBQUM7WUFDekUsUUFBUSxDQUFDLGdCQUFnQixDQUFDLFlBQVksQ0FBQyxZQUFZLEVBQUUsQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLEdBQUcsRUFBRSxlQUFlLEVBQUUsTUFBTSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7WUFDbkgsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO2dCQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsZUFBZSxHQUFHLEdBQUcsR0FBRyxNQUFNLENBQUMsQ0FBQztZQUFDLENBQUM7WUFDdEUsT0FBTyxJQUFJLENBQUM7UUFDYixDQUFDO2FBQU0sQ0FBQztZQUNQLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxZQUFZLENBQUMsWUFBWSxFQUFFLFdBQVcsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDOUUsUUFBUSxDQUFDLGdCQUFnQixDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsZUFBZSxDQUFDLENBQUM7UUFDN0QsQ0FBQztJQUNGLENBQUM7SUFDRCxPQUFPLEtBQUssQ0FBQztBQUNkLENBQUM7QUFFRCxTQUFTLHFCQUFxQixDQUFDLE9BQWE7SUFDM0MsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLE9BQU8sQ0FBQyxVQUFVLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7UUFDcEQsTUFBTSxLQUFLLEdBQUcsT0FBTyxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFekMsTUFBTSxPQUFPLEdBQWEsS0FBTSxDQUFDLE9BQU8sSUFBYyxLQUFNLENBQUMsT0FBTyxDQUFDLFdBQVcsRUFBRSxDQUFDO1FBQ25GLElBQUksT0FBTyxLQUFLLEtBQUssRUFBRSxDQUFDO1lBQ3ZCLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUNoQixDQUFDO2FBQU0sQ0FBQztZQUNQLHFCQUFxQixDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQzlCLENBQUM7SUFDRixDQUFDO0FBQ0YsQ0FBQztBQUVELFNBQVMsZUFBZSxDQUFDLElBQVksRUFBRSxPQUFPLEdBQUcsSUFBSTtJQUNwRCxPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsZ0NBQWdDLEVBQUUsQ0FBQyxLQUFLLEVBQUUsY0FBYyxFQUFFLFdBQVcsRUFBRSxFQUFFO1FBQzVGLE1BQU0sVUFBVSxHQUFXLGNBQWMsSUFBSSxXQUFXLENBQUM7UUFDekQsTUFBTSxtQkFBbUIsR0FBRyx5QkFBeUIsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUNsRSxNQUFNLFVBQVUsR0FBRyxHQUFHLG1CQUFtQixDQUFDLFFBQVEsS0FBSyxtQkFBbUIsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNuRixPQUFPLE9BQU8sQ0FBQyxDQUFDO1lBQ2YsSUFBSSxVQUFVLE1BQU0sVUFBVSxLQUFLLFVBQVUsSUFBSSxDQUFDLENBQUM7WUFDbkQsSUFBSSxVQUFVLEdBQUcsQ0FBQztJQUNwQixDQUFDLENBQUMsQ0FBQztBQUNKLENBQUM7QUFFRCxTQUFTLG9CQUFvQixDQUFDLFNBQWlCO0lBQzlDLE9BQU8sU0FBUyxJQUFJLFNBQVM7U0FDM0IsT0FBTyxDQUFDLEtBQUssRUFBRSxLQUFLLENBQUM7U0FDckIsT0FBTyxDQUFDLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQztBQUN6QixDQUFDO0FBR00sSUFBTSxrQkFBa0IsR0FBeEIsTUFBTSxrQkFBa0I7SUFDOUIsWUFDUyxTQUFtQyxFQUNuQyxpQkFBMEIsRUFDSSxrQkFBZ0Q7UUFGOUUsY0FBUyxHQUFULFNBQVMsQ0FBMEI7UUFDbkMsc0JBQWlCLEdBQWpCLGlCQUFpQixDQUFTO1FBQ0ksdUJBQWtCLEdBQWxCLGtCQUFrQixDQUE4QjtJQUNuRixDQUFDO0lBRUwsTUFBTSxDQUFDLE9BQTRCLEVBQUUsZ0JBQWdDO1FBQ3BFLHVCQUF1QjtRQUN2QixJQUFJLElBQUksQ0FBQyxTQUFTLENBQUMsY0FBYyxJQUFJLE9BQU8sWUFBWSwwQkFBMEIsRUFBRSxDQUFDO1lBQ3BGLElBQUksQ0FBQyxJQUFJLENBQUMsdUJBQXVCLENBQUMsT0FBTyxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLGNBQWMsQ0FBQyxFQUFFLENBQUM7Z0JBQ25GLE9BQU8sS0FBSyxDQUFDO1lBQ2QsQ0FBQztRQUNGLENBQUM7UUFFRCwwQkFBMEI7UUFDMUIsSUFBSSxPQUFPLFlBQVksMEJBQTBCLElBQUksSUFBSSxDQUFDLFNBQVMsQ0FBQyxjQUFjLDJDQUFtQyxFQUFFLENBQUM7WUFDdkgsTUFBTSxRQUFRLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxlQUFlLENBQUM7WUFDM0QsSUFBSSxDQUFDLE9BQU8sQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxjQUFjLEVBQUUsUUFBUSxDQUFDLEVBQUUsQ0FBQztnQkFDcEUsT0FBTyxLQUFLLENBQUM7WUFDZCxDQUFDO1FBQ0YsQ0FBQztRQUVELGlDQUFpQztRQUNqQyxJQUFJLE9BQU8sWUFBWSx3QkFBd0IsRUFBRSxDQUFDO1lBQ2pELHFGQUFxRjtZQUNyRixJQUFJLElBQUksQ0FBQyxpQkFBaUIsSUFBSSxJQUFJLENBQUMsU0FBUyxDQUFDLGNBQWMsRUFBRSxDQUFDO2dCQUM3RCxJQUFJLENBQUMsSUFBSSxDQUFDLHdCQUF3QixDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLGNBQWMsQ0FBQyxFQUFFLENBQUM7b0JBQzVFLE9BQU8sS0FBSyxDQUFDO2dCQUNkLENBQUM7Z0JBQ0QsdUVBQXVFO2dCQUN2RSxvQ0FBb0M7Z0JBQ3BDLHNDQUE4QjtZQUMvQixDQUFDO1lBRUQsSUFBSSxPQUFPLE9BQU8sQ0FBQyxLQUFLLEtBQUssUUFBUSxFQUFFLENBQUM7Z0JBQ3ZDLE9BQU8sT0FBTyxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUM7WUFDMUIsQ0FBQztZQUVELHNDQUE4QjtRQUMvQixDQUFDO1FBRUQsbUNBQW1DO1FBQ25DLElBQUksT0FBTyxZQUFZLGdDQUFnQyxFQUFFLENBQUM7WUFDekQsSUFBSSxJQUFJLENBQUMsU0FBUyxDQUFDLFVBQVUsRUFBRSxJQUFJLElBQUksSUFBSSxDQUFDLFNBQVMsQ0FBQyxjQUFjLEVBQUUsQ0FBQztnQkFDdEUsT0FBTyxLQUFLLENBQUM7WUFDZCxDQUFDO1FBQ0YsQ0FBQztRQUVELE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQUVPLHVCQUF1QixDQUFDLE9BQWlCLEVBQUUsS0FBK0I7UUFDakYsT0FBTyxLQUFLLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRTtZQUNsQyxJQUFJLEtBQUssWUFBWSx3QkFBd0IsRUFBRSxDQUFDO2dCQUMvQyxPQUFPLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxPQUFPLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDckQsQ0FBQztpQkFBTSxJQUFJLEtBQUssWUFBWSwwQkFBMEIsRUFBRSxDQUFDO2dCQUN4RCxPQUFPLEtBQUssQ0FBQyxPQUFPLENBQUMsR0FBRyxLQUFLLE9BQU8sQ0FBQyxHQUFHLENBQUM7WUFDMUMsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLE9BQU8sS0FBSyxDQUFDO1lBQ2QsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVEOzs7T0FHRztJQUNLLHdCQUF3QixDQUFDLEtBQStCLEVBQUUsUUFBa0M7UUFDbkcsNkNBQTZDO1FBQzdDLElBQUksS0FBSyxDQUFDLEVBQUUsS0FBSyxRQUFRLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDOUIsT0FBTyxJQUFJLENBQUM7UUFDYixDQUFDO1FBRUQsc0RBQXNEO1FBQ3RELElBQUksTUFBTSxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUM7UUFDMUIsT0FBTyxNQUFNLEVBQUUsQ0FBQztZQUNmLElBQUksTUFBTSxDQUFDLEVBQUUsS0FBSyxRQUFRLENBQUMsRUFBRSxFQUFFLENBQUM7Z0JBQy9CLE9BQU8sSUFBSSxDQUFDO1lBQ2IsQ0FBQztZQUNELE1BQU0sR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDO1FBQ3hCLENBQUM7UUFFRCxxREFBcUQ7UUFDckQsSUFBSSxjQUFjLEdBQUcsUUFBUSxDQUFDLE1BQU0sQ0FBQztRQUNyQyxPQUFPLGNBQWMsRUFBRSxDQUFDO1lBQ3ZCLElBQUksY0FBYyxDQUFDLEVBQUUsS0FBSyxLQUFLLENBQUMsRUFBRSxFQUFFLENBQUM7Z0JBQ3BDLE9BQU8sSUFBSSxDQUFDO1lBQ2IsQ0FBQztZQUNELGNBQWMsR0FBRyxjQUFjLENBQUMsTUFBTSxDQUFDO1FBQ3hDLENBQUM7UUFFRCxPQUFPLEtBQUssQ0FBQztJQUNkLENBQUM7Q0FDRCxDQUFBO0FBOUZZLGtCQUFrQjtJQUk1QixXQUFBLDRCQUE0QixDQUFBO0dBSmxCLGtCQUFrQixDQThGOUI7O0FBRUQsTUFBTSxvQkFBcUIsU0FBUSx5QkFBaUQ7SUFFbkYsYUFBYSxDQUFDLE9BQWlHO1FBQzlHLElBQUksT0FBTyxZQUFZLHdCQUF3QixFQUFFLENBQUM7WUFDakQsT0FBTyw0QkFBNEIsQ0FBQztRQUNyQyxDQUFDO1FBRUQsSUFBSSxPQUFPLFlBQVksMEJBQTBCLEVBQUUsQ0FBQztZQUNuRCxJQUFJLE9BQU8sQ0FBQyxTQUFTLEtBQUssZ0JBQWdCLENBQUMsZUFBZSxFQUFFLENBQUM7Z0JBQzVELE9BQU8scUNBQXFDLENBQUM7WUFDOUMsQ0FBQztZQUVELE1BQU0sZ0JBQWdCLEdBQUcsT0FBTyxDQUFDLFlBQVksSUFBSSxtQkFBbUIsQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLE9BQU8sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDMUcsSUFBSSxnQkFBZ0IsRUFBRSxDQUFDO2dCQUN0QixPQUFPLDRCQUE0QixDQUFDO1lBQ3JDLENBQUM7WUFFRCxJQUFJLE9BQU8sQ0FBQyxTQUFTLEtBQUssZ0JBQWdCLENBQUMsT0FBTyxFQUFFLENBQUM7Z0JBQ3BELE9BQU8seUJBQXlCLENBQUM7WUFDbEMsQ0FBQztZQUVELElBQUksT0FBTyxDQUFDLFNBQVMsS0FBSyxnQkFBZ0IsQ0FBQyxPQUFPO2dCQUNqRCxPQUFPLENBQUMsU0FBUyxLQUFLLGdCQUFnQixDQUFDLE1BQU07Z0JBQzdDLE9BQU8sQ0FBQyxTQUFTLEtBQUssZ0JBQWdCLENBQUMsZUFBZTtnQkFDdEQsT0FBTyxDQUFDLFNBQVMsS0FBSyxnQkFBZ0IsQ0FBQyxjQUFjLEVBQUUsQ0FBQztnQkFDeEQsT0FBTywyQkFBMkIsQ0FBQztZQUNwQyxDQUFDO1lBRUQsSUFBSSxPQUFPLENBQUMsU0FBUyxLQUFLLGdCQUFnQixDQUFDLGVBQWUsRUFBRSxDQUFDO2dCQUM1RCxPQUFPLG1DQUFtQyxDQUFDO1lBQzVDLENBQUM7WUFFRCxJQUFJLE9BQU8sQ0FBQyxTQUFTLEtBQUssZ0JBQWdCLENBQUMsTUFBTSxFQUFFLENBQUM7Z0JBQ25ELE9BQU8seUJBQXlCLENBQUM7WUFDbEMsQ0FBQztZQUVELElBQUksT0FBTyxDQUFDLFNBQVMsS0FBSyxnQkFBZ0IsQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDakQsT0FBTyx5QkFBeUIsQ0FBQztZQUNsQyxDQUFDO1lBRUQsSUFBSSxPQUFPLENBQUMsU0FBUyxLQUFLLGdCQUFnQixDQUFDLEtBQUssRUFBRSxDQUFDO2dCQUNsRCxPQUFPLDBCQUEwQixDQUFDO1lBQ25DLENBQUM7WUFFRCxJQUFJLE9BQU8sQ0FBQyxTQUFTLEtBQUssZ0JBQWdCLENBQUMsT0FBTyxFQUFFLENBQUM7Z0JBQ3BELE9BQU8sNEJBQTRCLENBQUM7WUFDckMsQ0FBQztZQUVELElBQUksT0FBTyxDQUFDLFNBQVMsS0FBSyxnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUsQ0FBQztnQkFDcEQsT0FBTyw0QkFBNEIsQ0FBQztZQUNyQyxDQUFDO1lBRUQsSUFBSSxPQUFPLENBQUMsU0FBUyxLQUFLLGdCQUFnQixDQUFDLE1BQU0sRUFBRSxDQUFDO2dCQUNuRCxPQUFPLDJCQUEyQixDQUFDO1lBQ3BDLENBQUM7WUFFRCxJQUFJLE9BQU8sQ0FBQyxTQUFTLEtBQUssZ0JBQWdCLENBQUMsYUFBYSxFQUFFLENBQUM7Z0JBQzFELE9BQU8sZ0NBQWdDLENBQUM7WUFDekMsQ0FBQztZQUVELElBQUksT0FBTyxDQUFDLFNBQVMsS0FBSyxnQkFBZ0IsQ0FBQyxhQUFhLEVBQUUsQ0FBQztnQkFDMUQsT0FBTyxtQ0FBbUMsQ0FBQztZQUM1QyxDQUFDO1lBRUQsSUFBSSxPQUFPLENBQUMsU0FBUyxLQUFLLGdCQUFnQixDQUFDLFdBQVcsRUFBRSxDQUFDO2dCQUN4RCxPQUFPLDRCQUE0QixDQUFDO1lBQ3JDLENBQUM7WUFFRCxPQUFPLDRCQUE0QixDQUFDO1FBQ3JDLENBQUM7UUFFRCxJQUFJLE9BQU8sWUFBWSxnQ0FBZ0MsRUFBRSxDQUFDO1lBQ3pELE9BQU8sbUNBQW1DLENBQUM7UUFDNUMsQ0FBQztRQUVELE1BQU0sSUFBSSxLQUFLLENBQUMsd0JBQXdCLEdBQUcsT0FBTyxDQUFDLENBQUM7SUFDckQsQ0FBQztJQUVELGdCQUFnQixDQUFDLE9BQWlHO1FBQ2pILE9BQU8sQ0FBQyxDQUFDLE9BQU8sWUFBWSx3QkFBd0IsQ0FBQyxDQUFDO0lBQ3ZELENBQUM7SUFFUyxjQUFjLENBQUMsT0FBK0I7UUFDdkQsSUFBSSxPQUFPLFlBQVksd0JBQXdCLEVBQUUsQ0FBQztZQUNqRCxPQUFPLEVBQUUsQ0FBQztRQUNYLENBQUM7UUFFRCxPQUFPLE9BQU8sWUFBWSwwQkFBMEIsSUFBSSxPQUFPLENBQUMsU0FBUyxLQUFLLGdCQUFnQixDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUM7SUFDbkgsQ0FBQztDQUNEO0FBRUQsTUFBTSxPQUFPLDZCQUFpQyxTQUFRLGVBQWtCO0lBQzlELGFBQWEsQ0FBQyxPQUFVO1FBQ2hDLE9BQU8sS0FBSyxDQUFDO0lBQ2QsQ0FBQztJQUVRLFlBQVksQ0FBQyxPQUFVLEVBQUUsU0FBbUIsRUFBRSxTQUFtQjtRQUN6RSxPQUFPLEtBQUssQ0FBQztJQUNkLENBQUM7Q0FDRDtBQUVELE1BQU0saUNBQWlDO0lBQ3RDLFlBQTZCLG9CQUFvRCxFQUFtQixlQUFpQyxFQUFtQix1QkFBaUQ7UUFBNUsseUJBQW9CLEdBQXBCLG9CQUFvQixDQUFnQztRQUFtQixvQkFBZSxHQUFmLGVBQWUsQ0FBa0I7UUFBbUIsNEJBQXVCLEdBQXZCLHVCQUF1QixDQUEwQjtJQUN6TSxDQUFDO0lBRUQsWUFBWSxDQUFDLE9BQTRCO1FBQ3hDLElBQUksT0FBTyxZQUFZLDBCQUEwQixFQUFFLENBQUM7WUFDbkQsTUFBTSxpQkFBaUIsR0FBYSxFQUFFLENBQUM7WUFDdkMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLEdBQUcsT0FBTyxDQUFDLGVBQWUsSUFBSSxPQUFPLENBQUMsWUFBWSxHQUFHLENBQUMsQ0FBQztZQUU5RSxJQUFJLE9BQU8sQ0FBQyxZQUFZLEVBQUUsQ0FBQztnQkFDMUIsTUFBTSxZQUFZLEdBQUcsUUFBUSxDQUFDLG1CQUFtQixFQUFFLFdBQVcsQ0FBQyxDQUFDO2dCQUNoRSxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUM7WUFDdEMsQ0FBQztZQUVELE1BQU0sd0JBQXdCLEdBQUcsMkJBQTJCLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxvQkFBb0IsRUFBRSxJQUFJLENBQUMsdUJBQXVCLEVBQUUsSUFBSSxDQUFDLGVBQWUsQ0FBQyxDQUFDO1lBQ3JKLElBQUksd0JBQXdCLENBQUMsTUFBTSxFQUFFLENBQUM7Z0JBQ3JDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxHQUFHLHdCQUF3QixHQUFHLENBQUMsQ0FBQztZQUN4RCxDQUFDO1lBRUQsTUFBTSw4QkFBOEIsR0FBRyxpQkFBaUIsQ0FBQyxFQUFFLEtBQUssRUFBRSxlQUFlLENBQUMsT0FBTyxDQUFDLFdBQVcsRUFBRSxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDakgsSUFBSSw4QkFBOEIsQ0FBQyxNQUFNLEVBQUUsQ0FBQztnQkFDM0MsaUJBQWlCLENBQUMsSUFBSSxDQUFDLDhCQUE4QixDQUFDLENBQUM7WUFDeEQsQ0FBQztZQUNELE9BQU8saUJBQWlCLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3BDLENBQUM7YUFBTSxJQUFJLE9BQU8sWUFBWSx3QkFBd0IsRUFBRSxDQUFDO1lBQ3hELE9BQU8sT0FBTyxDQUFDLEtBQUssQ0FBQztRQUN0QixDQUFDO2FBQU0sQ0FBQztZQUNQLE9BQU8sT0FBTyxDQUFDLEVBQUUsQ0FBQztRQUNuQixDQUFDO0lBQ0YsQ0FBQztJQUVELGtCQUFrQjtRQUNqQixPQUFPLFFBQVEsQ0FBQyxVQUFVLEVBQUUsVUFBVSxDQUFDLENBQUM7SUFDekMsQ0FBQztDQUNEO0FBRU0sSUFBTSxZQUFZLEdBQWxCLE1BQU0sWUFBYSxTQUFRLG1CQUF3QztJQUN6RSxZQUNDLFNBQXNCLEVBQ3RCLFNBQW1DLEVBQ25DLFNBQTBDLEVBQ3RCLGlCQUFxQyxFQUMzQyxXQUF5QixFQUNQLG9CQUFvRCxFQUM3RCxvQkFBMkMsRUFDaEQsZUFBaUMsRUFDekIsdUJBQWlEO1FBRTNFLEtBQUssQ0FBQyxjQUFjLEVBQUUsU0FBUyxFQUM5QixJQUFJLG9CQUFvQixFQUFFLEVBQzFCLFNBQVMsRUFDVDtZQUNDLG1CQUFtQixFQUFFLEtBQUs7WUFDMUIscUJBQXFCLEVBQUUsSUFBSTtZQUMzQixxQkFBcUIsRUFBRSxJQUFJO1lBQzNCLGdCQUFnQixFQUFFO2dCQUNqQixLQUFLLENBQUMsQ0FBQztvQkFDTixPQUFPLENBQUMsQ0FBQyxFQUFFLENBQUM7Z0JBQ2IsQ0FBQzthQUNEO1lBQ0QscUJBQXFCLEVBQUUsSUFBSSxpQ0FBaUMsQ0FBQyxvQkFBb0IsRUFBRSxlQUFlLEVBQUUsdUJBQXVCLENBQUM7WUFDNUgsZUFBZSxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsSUFBSSxzQkFBc0IsQ0FBQyxnQkFBZ0IsQ0FBQyxnQkFBZ0IsQ0FBQyxTQUFTLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDbkcsTUFBTSxFQUFFLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxrQkFBa0IsRUFBRSxTQUFTLEVBQUUsSUFBSSxDQUFDO1lBQ2hGLGVBQWUsRUFBRSxvQkFBb0IsQ0FBQyxRQUFRLENBQVUsZ0NBQWdDLENBQUM7WUFDekYsd0JBQXdCLEVBQUUsS0FBSztZQUMvQixpQkFBaUIsRUFBRSxLQUFLO1lBQ3hCLGtCQUFrQixFQUFFLGtCQUFrQixDQUFDLElBQUk7WUFDM0MscUJBQXFCLEVBQUUsS0FBSyxDQUFDLHlDQUF5QztTQUN0RSxFQUNELG9CQUFvQixFQUNwQixpQkFBaUIsRUFDakIsV0FBVyxFQUNYLG9CQUFvQixDQUNwQixDQUFDO1FBRUYsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsc0JBQXNCLENBQUMsQ0FBQztRQUU1RCxJQUFJLENBQUMsS0FBSyxDQUFDLGFBQWEsQ0FBQztZQUN4QixjQUFjLEVBQUUsZ0JBQWdCO1lBQ2hDLDZCQUE2QixFQUFFLGdCQUFnQjtZQUMvQyw2QkFBNkIsRUFBRSxVQUFVO1lBQ3pDLCtCQUErQixFQUFFLGdCQUFnQjtZQUNqRCwrQkFBK0IsRUFBRSxVQUFVO1lBQzNDLG1CQUFtQixFQUFFLGdCQUFnQjtZQUNyQyxtQkFBbUIsRUFBRSxVQUFVO1lBQy9CLG1CQUFtQixFQUFFLFVBQVU7WUFDL0IsbUJBQW1CLEVBQUUsZ0JBQWdCO1lBQ3JDLGdCQUFnQixFQUFFLGdCQUFnQjtZQUNsQyxnQkFBZ0IsRUFBRSxnQkFBZ0I7WUFDbEMsK0JBQStCLEVBQUUsZ0JBQWdCO1lBQ2pELCtCQUErQixFQUFFLFVBQVU7WUFDM0MsMkJBQTJCLEVBQUUsZ0JBQWdCO1lBQzdDLHdCQUF3QixFQUFFLGdCQUFnQjtZQUMxQyxzQkFBc0IsRUFBRSxTQUFTO1lBQ2pDLDhCQUE4QixFQUFFLFNBQVM7U0FDekMsQ0FBQyxDQUFDLENBQUM7UUFFSixJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDLENBQUMsRUFBRTtZQUN0RSxJQUFJLENBQUMsQ0FBQyxvQkFBb0IsQ0FBQyxnQ0FBZ0MsQ0FBQyxFQUFFLENBQUM7Z0JBQzlELElBQUksQ0FBQyxhQUFhLENBQUM7b0JBQ2xCLGVBQWUsRUFBRSxvQkFBb0IsQ0FBQyxRQUFRLENBQVUsZ0NBQWdDLENBQUM7aUJBQ3pGLENBQUMsQ0FBQztZQUNKLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVrQixXQUFXLENBQUMsSUFBWSxFQUFFLE9BQTZEO1FBQ3pHLE9BQU8sSUFBSSw2QkFBNkIsQ0FBeUIsSUFBSSxFQUFFLE9BQU8sQ0FBQyxDQUFDO0lBQ2pGLENBQUM7Q0FDRCxDQUFBO0FBekVZLFlBQVk7SUFLdEIsV0FBQSxrQkFBa0IsQ0FBQTtJQUNsQixXQUFBLFlBQVksQ0FBQTtJQUNaLFdBQUEsOEJBQThCLENBQUE7SUFDOUIsV0FBQSxxQkFBcUIsQ0FBQTtJQUNyQixXQUFBLGdCQUFnQixDQUFBO0lBQ2hCLFdBQUEsd0JBQXdCLENBQUE7R0FWZCxZQUFZLENBeUV4Qjs7QUFFRCxJQUFNLG1CQUFtQixHQUF6QixNQUFNLG1CQUFvQixTQUFRLE1BQU07O2FBQ3ZCLE9BQUUsR0FBRyx3QkFBd0IsQUFBM0IsQ0FBNEI7YUFDOUIsVUFBSyxHQUFHLFFBQVEsQ0FBQyxvQkFBb0IsRUFBRSxpQkFBaUIsQ0FBQyxBQUFwRCxDQUFxRDtJQUUxRSxZQUNxQyxnQkFBbUM7UUFFdkUsS0FBSyxDQUFDLHFCQUFtQixDQUFDLEVBQUUsRUFBRSxxQkFBbUIsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUZyQixxQkFBZ0IsR0FBaEIsZ0JBQWdCLENBQW1CO0lBR3hFLENBQUM7SUFFUSxLQUFLLENBQUMsR0FBRyxDQUFDLE9BQW1DO1FBQ3JELElBQUksT0FBTyxFQUFFLENBQUM7WUFDYixNQUFNLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUM1RCxDQUFDO1FBRUQsT0FBTyxPQUFPLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDO0lBQ25DLENBQUM7O0FBaEJJLG1CQUFtQjtJQUt0QixXQUFBLGlCQUFpQixDQUFBO0dBTGQsbUJBQW1CLENBaUJ4QjtBQUVELElBQU0sdUJBQXVCLEdBQTdCLE1BQU0sdUJBQXdCLFNBQVEsTUFBTTs7YUFDM0IsT0FBRSxHQUFHLDRCQUE0QixBQUEvQixDQUFnQzthQUNsQyxVQUFLLEdBQUcsUUFBUSxDQUFDLHdCQUF3QixFQUFFLHNCQUFzQixDQUFDLEFBQTdELENBQThEO0lBRW5GLFlBQ3FDLGdCQUFtQztRQUV2RSxLQUFLLENBQUMseUJBQXVCLENBQUMsRUFBRSxFQUFFLHlCQUF1QixDQUFDLEtBQUssQ0FBQyxDQUFDO1FBRjdCLHFCQUFnQixHQUFoQixnQkFBZ0IsQ0FBbUI7SUFHeEUsQ0FBQztJQUVRLEtBQUssQ0FBQyxHQUFHLENBQUMsT0FBbUM7UUFDckQsSUFBSSxPQUFPLEVBQUUsQ0FBQztZQUNiLE1BQU0sVUFBVSxHQUFHLElBQUksT0FBTyxDQUFDLE9BQU8sQ0FBQyxHQUFHLE1BQU0sSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLFNBQVMsRUFBRSxJQUFJLENBQUMsRUFBRSxDQUFDO1lBQ2pHLE1BQU0sSUFBSSxDQUFDLGdCQUFnQixDQUFDLFNBQVMsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUNuRCxDQUFDO1FBRUQsT0FBTyxPQUFPLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDO0lBQ25DLENBQUM7O0FBakJJLHVCQUF1QjtJQUsxQixXQUFBLGlCQUFpQixDQUFBO0dBTGQsdUJBQXVCLENBa0I1QjtBQUVELElBQU0sc0JBQXNCLEdBQTVCLE1BQU0sc0JBQXVCLFNBQVEsTUFBTTs7YUFDMUIsT0FBRSxHQUFHLDJCQUEyQixBQUE5QixDQUErQjthQUNqQyxVQUFLLEdBQUcsUUFBUSxDQUFDLHVCQUF1QixFQUFFLHFCQUFxQixDQUFDLEFBQTNELENBQTREO0lBRWpGLFlBQ3FDLGdCQUFtQyxFQUNyQyxjQUErQjtRQUVqRSxLQUFLLENBQUMsd0JBQXNCLENBQUMsRUFBRSxFQUFFLHdCQUFzQixDQUFDLEtBQUssQ0FBQyxDQUFDO1FBSDNCLHFCQUFnQixHQUFoQixnQkFBZ0IsQ0FBbUI7UUFDckMsbUJBQWMsR0FBZCxjQUFjLENBQWlCO0lBR2xFLENBQUM7SUFFUSxLQUFLLENBQUMsR0FBRyxDQUFDLE9BQW1DO1FBQ3JELElBQUksT0FBTyxFQUFFLENBQUM7WUFDYixNQUFNLFVBQVUsR0FBRyxPQUFPLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQztZQUN2QyxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDLFdBQVcsQ0FBQztZQUNoRCxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsa0JBQWtCLEVBQUUsSUFBSSxFQUFFLElBQUksVUFBVSxFQUFFLEVBQUUsRUFBRSxJQUFJLENBQUMsQ0FBQztZQUN2RyxNQUFNLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7UUFDdkQsQ0FBQztRQUVELE9BQU8sT0FBTyxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUNuQyxDQUFDOztBQXBCSSxzQkFBc0I7SUFLekIsV0FBQSxpQkFBaUIsQ0FBQTtJQUNqQixXQUFBLGVBQWUsQ0FBQTtHQU5aLHNCQUFzQixDQXFCM0I7QUFFRCxJQUFNLGlCQUFpQixHQUF2QixNQUFNLGlCQUFrQixTQUFRLE1BQU07O2FBQ3JCLE9BQUUsR0FBRyw2QkFBNkIsQUFBaEMsQ0FBaUM7YUFDbkMsVUFBSyxHQUFHLFFBQVEsQ0FBQyxvQkFBb0IsRUFBRSxtQkFBbUIsQ0FBQyxBQUF0RCxDQUF1RDtJQUU1RSxZQUNrQixPQUFpQixFQUNNLGFBQW9DO1FBRTVFLEtBQUssQ0FBQyxtQkFBaUIsQ0FBQyxFQUFFLEVBQUUsbUJBQWlCLENBQUMsS0FBSyxDQUFDLENBQUM7UUFIcEMsWUFBTyxHQUFQLE9BQU8sQ0FBVTtRQUNNLGtCQUFhLEdBQWIsYUFBYSxDQUF1QjtRQUc1RSxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsYUFBYSxDQUFDLHdCQUF3QixFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLG9CQUFvQixDQUFDLDhCQUE4QixDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3ZKLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztJQUNmLENBQUM7SUFFRCxLQUFLLENBQUMsTUFBTTtRQUNYLE1BQU0sZUFBZSxHQUFHLGtCQUFrQixDQUFDLHlCQUF5QixFQUFFLEVBQUUsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBQzVGLElBQUksQ0FBQyxPQUFPLEdBQUcsQ0FBQyxlQUFlLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDNUQsQ0FBQztJQUVRLEtBQUssQ0FBQyxHQUFHO1FBQ2pCLG9FQUFvRTtRQUNwRSxJQUFJLFlBQVksR0FBRyxDQUFDLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxRQUFRLENBQVcsOEJBQThCLENBQUMsQ0FBQyxDQUFDO1FBQzlGLFlBQVksR0FBRyxZQUFZLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxLQUFLLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxJQUFJLENBQUMsS0FBSyxJQUFJLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQztRQUVoRyxNQUFNLHNCQUFzQixHQUFHLHlCQUF5QixFQUFFLENBQUM7UUFDM0QsTUFBTSxnQkFBZ0IsR0FBRyxzQkFBc0IsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUMzRSxNQUFNLFdBQVcsR0FBRyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUM7UUFFbEMsOERBQThEO1FBQzlELElBQUksV0FBVyxJQUFJLGdCQUFnQixFQUFFLENBQUM7WUFDckMsWUFBWSxDQUFDLElBQUksQ0FBQyxJQUFJLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQztRQUMzQyxDQUFDO1FBRUQsc0VBQXNFO1FBQ3RFLElBQUksQ0FBQyxXQUFXLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO1lBQ3ZDLFlBQVksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNyQyxDQUFDO1FBRUQsSUFBSSxDQUFDLGFBQWEsQ0FBQyxXQUFXLENBQUMsOEJBQThCLEVBQUUsWUFBWSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxTQUFTLG1DQUEyQixDQUFDO1FBRXpJLE9BQU8sT0FBTyxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUNuQyxDQUFDOztBQXhDSSxpQkFBaUI7SUFNcEIsV0FBQSxxQkFBcUIsQ0FBQTtHQU5sQixpQkFBaUIsQ0EwQ3RCO0FBRUQsSUFBTSwrQkFBK0IsR0FBckMsTUFBTSwrQkFBZ0MsU0FBUSxNQUFNOzthQUNuQyxPQUFFLEdBQUcsNkJBQTZCLEFBQWhDLENBQWlDO2FBQ25DLFVBQUssR0FBRyxRQUFRLENBQUMsb0JBQW9CLEVBQUUsK0JBQStCLENBQUMsQUFBbEUsQ0FBbUU7SUFFeEYsWUFDa0IsT0FBaUIsRUFDZSxhQUE2QztRQUU5RixLQUFLLENBQUMsaUNBQStCLENBQUMsRUFBRSxFQUFFLGlDQUErQixDQUFDLEtBQUssQ0FBQyxDQUFDO1FBSGhFLFlBQU8sR0FBUCxPQUFPLENBQVU7UUFDZSxrQkFBYSxHQUFiLGFBQWEsQ0FBZ0M7UUFHOUYsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLGFBQWEsQ0FBQyx3QkFBd0IsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxvQkFBb0IsQ0FBQywwQkFBMEIsQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNuSixJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7SUFDZixDQUFDO0lBRUQsTUFBTTtRQUNMLE1BQU0sbUJBQW1CLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxRQUFRLENBQVcsMEJBQTBCLENBQUMsQ0FBQztRQUM5RixJQUFJLENBQUMsT0FBTyxHQUFHLG1CQUFtQixDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQy9ELENBQUM7SUFFUSxLQUFLLENBQUMsR0FBRztRQUNqQixvRUFBb0U7UUFDcEUsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxRQUFRLENBQVcsMEJBQTBCLENBQUMsSUFBSSxFQUFFLENBQUM7UUFFdEYsSUFBSSxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDbEIsS0FBSyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDbEQsQ0FBQzthQUFNLENBQUM7WUFDUCxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDOUIsQ0FBQztRQUVELE1BQU0sUUFBUSxHQUFHLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNqQyxJQUFJLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUNsQixNQUFNLElBQUksQ0FBQyxhQUFhLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsV0FBVyxFQUFFLEtBQUsseUNBQWlDLENBQUM7WUFDeEosTUFBTSxJQUFJLENBQUMsYUFBYSxDQUFDLFdBQVcsQ0FBQywwQkFBMEIsRUFBRSxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLFNBQVMseUNBQWlDLENBQUM7UUFDMUksQ0FBQzthQUFNLENBQUM7WUFDUCxNQUFNLElBQUksQ0FBQyxhQUFhLENBQUMsV0FBVyxDQUFDLDBCQUEwQixFQUFFLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsU0FBUyx5Q0FBaUMsQ0FBQztZQUN6SSxNQUFNLElBQUksQ0FBQyxhQUFhLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsU0FBUyxFQUFFLEtBQUsseUNBQWlDLENBQUM7UUFDdkosQ0FBQztJQUNGLENBQUM7O0FBcENJLCtCQUErQjtJQU1sQyxXQUFBLDhCQUE4QixDQUFBO0dBTjNCLCtCQUErQixDQXNDcEMifQ==