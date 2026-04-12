/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { raceTimeout } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { localize } from '../../../../nls.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
export const IPreferencesSearchService = createDecorator('preferencesSearchService');
export const PREFERENCES_EDITOR_COMMAND_OPEN = 'workbench.preferences.action.openPreferencesEditor';
export const CONTEXT_PREFERENCES_SEARCH_FOCUS = new RawContextKey('inPreferencesSearch', false);
export const SETTINGS_EDITOR_COMMAND_CLEAR_SEARCH_RESULTS = 'settings.action.clearSearchResults';
export const SETTINGS_EDITOR_COMMAND_SHOW_AI_RESULTS = 'settings.action.showAIResults';
export const SETTINGS_EDITOR_COMMAND_TOGGLE_AI_SEARCH = 'settings.action.toggleAiSearch';
export const SETTINGS_EDITOR_COMMAND_SHOW_CONTEXT_MENU = 'settings.action.showContextMenu';
export const SETTINGS_EDITOR_COMMAND_SUGGEST_FILTERS = 'settings.action.suggestFilters';
export const CONTEXT_SETTINGS_EDITOR = new RawContextKey('inSettingsEditor', false);
export const CONTEXT_SETTINGS_JSON_EDITOR = new RawContextKey('inSettingsJSONEditor', false);
export const CONTEXT_SETTINGS_SEARCH_FOCUS = new RawContextKey('inSettingsSearch', false);
export const CONTEXT_TOC_ROW_FOCUS = new RawContextKey('settingsTocRowFocus', false);
export const CONTEXT_SETTINGS_ROW_FOCUS = new RawContextKey('settingRowFocus', false);
export const CONTEXT_KEYBINDINGS_EDITOR = new RawContextKey('inKeybindings', false);
export const CONTEXT_KEYBINDINGS_SEARCH_FOCUS = new RawContextKey('inKeybindingsSearch', false);
export const CONTEXT_KEYBINDINGS_SEARCH_HAS_VALUE = new RawContextKey('keybindingsSearchHasValue', false);
export const CONTEXT_KEYBINDING_FOCUS = new RawContextKey('keybindingFocus', false);
export const CONTEXT_WHEN_FOCUS = new RawContextKey('whenFocus', false);
export const CONTEXT_AI_SETTING_RESULTS_AVAILABLE = new RawContextKey('aiSettingResultsAvailable', false);
export const KEYBINDINGS_EDITOR_COMMAND_SEARCH = 'keybindings.editor.searchKeybindings';
export const KEYBINDINGS_EDITOR_COMMAND_CLEAR_SEARCH_RESULTS = 'keybindings.editor.clearSearchResults';
export const KEYBINDINGS_EDITOR_COMMAND_CLEAR_SEARCH_HISTORY = 'keybindings.editor.clearSearchHistory';
export const KEYBINDINGS_EDITOR_COMMAND_RECORD_SEARCH_KEYS = 'keybindings.editor.recordSearchKeys';
export const KEYBINDINGS_EDITOR_COMMAND_SORTBY_PRECEDENCE = 'keybindings.editor.toggleSortByPrecedence';
export const KEYBINDINGS_EDITOR_COMMAND_DEFINE = 'keybindings.editor.defineKeybinding';
export const KEYBINDINGS_EDITOR_COMMAND_ADD = 'keybindings.editor.addKeybinding';
export const KEYBINDINGS_EDITOR_COMMAND_DEFINE_WHEN = 'keybindings.editor.defineWhenExpression';
export const KEYBINDINGS_EDITOR_COMMAND_ACCEPT_WHEN = 'keybindings.editor.acceptWhenExpression';
export const KEYBINDINGS_EDITOR_COMMAND_REJECT_WHEN = 'keybindings.editor.rejectWhenExpression';
export const KEYBINDINGS_EDITOR_COMMAND_REMOVE = 'keybindings.editor.removeKeybinding';
export const KEYBINDINGS_EDITOR_COMMAND_RESET = 'keybindings.editor.resetKeybinding';
export const KEYBINDINGS_EDITOR_COMMAND_COPY = 'keybindings.editor.copyKeybindingEntry';
export const KEYBINDINGS_EDITOR_COMMAND_COPY_COMMAND = 'keybindings.editor.copyCommandKeybindingEntry';
export const KEYBINDINGS_EDITOR_COMMAND_COPY_COMMAND_TITLE = 'keybindings.editor.copyCommandTitle';
export const KEYBINDINGS_EDITOR_COMMAND_SHOW_SIMILAR = 'keybindings.editor.showConflicts';
export const KEYBINDINGS_EDITOR_COMMAND_FOCUS_KEYBINDINGS = 'keybindings.editor.focusKeybindings';
export const KEYBINDINGS_EDITOR_SHOW_DEFAULT_KEYBINDINGS = 'keybindings.editor.showDefaultKeybindings';
export const KEYBINDINGS_EDITOR_SHOW_USER_KEYBINDINGS = 'keybindings.editor.showUserKeybindings';
export const KEYBINDINGS_EDITOR_SHOW_EXTENSION_KEYBINDINGS = 'keybindings.editor.showExtensionKeybindings';
export const MODIFIED_SETTING_TAG = 'modified';
export const EXTENSION_SETTING_TAG = 'ext:';
export const FEATURE_SETTING_TAG = 'feature:';
export const ID_SETTING_TAG = 'id:';
export const LANGUAGE_SETTING_TAG = 'lang:';
export const GENERAL_TAG_SETTING_TAG = 'tag:';
export const POLICY_SETTING_TAG = 'hasPolicy';
export const WORKSPACE_TRUST_SETTING_TAG = 'workspaceTrust';
export const REQUIRE_TRUSTED_WORKSPACE_SETTING_TAG = 'requireTrustedWorkspace';
export const ADVANCED_SETTING_TAG = 'advanced';
export const KEYBOARD_LAYOUT_OPEN_PICKER = 'workbench.action.openKeyboardLayoutPicker';
export const ENABLE_LANGUAGE_FILTER = true;
export const ENABLE_EXTENSION_TOGGLE_SETTINGS = true;
export const EXTENSION_FETCH_TIMEOUT_MS = 1000;
export const STRING_MATCH_SEARCH_PROVIDER_NAME = 'local';
export const TF_IDF_SEARCH_PROVIDER_NAME = 'tfIdf';
export const FILTER_MODEL_SEARCH_PROVIDER_NAME = 'filterModel';
export const EMBEDDINGS_SEARCH_PROVIDER_NAME = 'embeddingsFull';
export const LLM_RANKED_SEARCH_PROVIDER_NAME = 'llmRanked';
export var WorkbenchSettingsEditorSettings;
(function (WorkbenchSettingsEditorSettings) {
    WorkbenchSettingsEditorSettings["ShowAISearchToggle"] = "workbench.settings.showAISearchToggle";
    WorkbenchSettingsEditorSettings["EnableNaturalLanguageSearch"] = "workbench.settings.enableNaturalLanguageSearch";
})(WorkbenchSettingsEditorSettings || (WorkbenchSettingsEditorSettings = {}));
let cachedExtensionToggleData;
export async function getExperimentalExtensionToggleData(chatEntitlementService, extensionGalleryService, productService) {
    if (!ENABLE_EXTENSION_TOGGLE_SETTINGS) {
        return undefined;
    }
    if (!extensionGalleryService.isEnabled()) {
        return undefined;
    }
    if (chatEntitlementService.sentiment.hidden || chatEntitlementService.sentiment.disabled) {
        return undefined;
    }
    if (cachedExtensionToggleData) {
        return cachedExtensionToggleData;
    }
    if (productService.extensionRecommendations) {
        const settingsEditorRecommendedExtensions = {};
        Object.keys(productService.extensionRecommendations).forEach(extensionId => {
            const extensionInfo = productService.extensionRecommendations[extensionId];
            if (extensionInfo.onSettingsEditorOpen) {
                settingsEditorRecommendedExtensions[extensionId] = extensionInfo;
            }
        });
        const recommendedExtensionsGalleryInfo = {};
        for (const key in settingsEditorRecommendedExtensions) {
            const extensionId = key;
            // Recommend prerelease if not on Stable.
            const isStable = productService.quality === 'stable';
            try {
                const extensions = await raceTimeout(extensionGalleryService.getExtensions([{ id: extensionId, preRelease: !isStable }], CancellationToken.None), EXTENSION_FETCH_TIMEOUT_MS);
                if (extensions?.length === 1) {
                    recommendedExtensionsGalleryInfo[key] = extensions[0];
                }
                else {
                    // same as network connection fail. we do not want a blank settings page: https://github.com/microsoft/vscode/issues/195722
                    // so instead of returning partial data we return undefined here
                    return undefined;
                }
            }
            catch (e) {
                // Network connection fail. Return nothing rather than partial data.
                return undefined;
            }
        }
        cachedExtensionToggleData = {
            settingsEditorRecommendedExtensions,
            recommendedExtensionsGalleryInfo
        };
        return cachedExtensionToggleData;
    }
    return undefined;
}
/**
 * Compares two nullable numbers such that null values always come after defined ones.
 */
export function compareTwoNullableNumbers(a, b) {
    const aOrMax = a ?? Number.MAX_SAFE_INTEGER;
    const bOrMax = b ?? Number.MAX_SAFE_INTEGER;
    if (aOrMax < bOrMax) {
        return -1;
    }
    else if (aOrMax > bOrMax) {
        return 1;
    }
    else {
        return 0;
    }
}
export const PREVIEW_INDICATOR_DESCRIPTION = localize('previewIndicatorDescription', "Preview setting: this setting controls a new feature that is still under refinement yet ready to use. Feedback is welcome.");
export const EXPERIMENTAL_INDICATOR_DESCRIPTION = localize('experimentalIndicatorDescription', "Experimental setting: this setting controls a new feature that is actively being developed and may be unstable. It is subject to change or removal.");
export const ADVANCED_INDICATOR_DESCRIPTION = localize('advancedIndicatorDescription', "Advanced setting: this setting is intended for advanced scenarios and configurations. Only modify this if you know what it does.");
export const knownAcronyms = new Set();
[
    'css',
    'html',
    'scss',
    'less',
    'json',
    'js',
    'ts',
    'ie',
    'id',
    'php',
    'scm',
].forEach(str => knownAcronyms.add(str));
export const knownTermMappings = new Map();
knownTermMappings.set('power shell', 'PowerShell');
knownTermMappings.set('powershell', 'PowerShell');
knownTermMappings.set('javascript', 'JavaScript');
knownTermMappings.set('typescript', 'TypeScript');
knownTermMappings.set('github', 'GitHub');
knownTermMappings.set('jet brains', 'JetBrains');
knownTermMappings.set('jetbrains', 'JetBrains');
knownTermMappings.set('re sharper', 'ReSharper');
knownTermMappings.set('resharper', 'ReSharper');
export function wordifyKey(key) {
    key = key
        .replace(/\.([a-z0-9])/g, (_, p1) => ` \u203A ${p1.toUpperCase()}`) // Replace dot with spaced '>'
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2') // Camel case to spacing, fooBar => foo Bar
        .replace(/([A-Z]{1,})([A-Z][a-z])/g, '$1 $2') // Split consecutive capitals letters, AISearch => AI Search
        .replace(/^[a-z]/g, match => match.toUpperCase()) // Upper casing all first letters, foo => Foo
        .replace(/\b\w+\b/g, match => {
        return knownAcronyms.has(match.toLowerCase()) ?
            match.toUpperCase() :
            match;
    });
    for (const [k, v] of knownTermMappings) {
        key = key.replace(new RegExp(`\\b${k}\\b`, 'gi'), v);
    }
    return key;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJlZmVyZW5jZXMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9wcmVmZXJlbmNlcy9jb21tb24vcHJlZmVyZW5jZXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBRzVFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFFckYsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBd0I3RixNQUFNLENBQUMsTUFBTSx5QkFBeUIsR0FBRyxlQUFlLENBQTRCLDBCQUEwQixDQUFDLENBQUM7QUFzQmhILE1BQU0sQ0FBQyxNQUFNLCtCQUErQixHQUFHLG9EQUFvRCxDQUFDO0FBQ3BHLE1BQU0sQ0FBQyxNQUFNLGdDQUFnQyxHQUFHLElBQUksYUFBYSxDQUFVLHFCQUFxQixFQUFFLEtBQUssQ0FBQyxDQUFDO0FBRXpHLE1BQU0sQ0FBQyxNQUFNLDRDQUE0QyxHQUFHLG9DQUFvQyxDQUFDO0FBQ2pHLE1BQU0sQ0FBQyxNQUFNLHVDQUF1QyxHQUFHLCtCQUErQixDQUFDO0FBQ3ZGLE1BQU0sQ0FBQyxNQUFNLHdDQUF3QyxHQUFHLGdDQUFnQyxDQUFDO0FBQ3pGLE1BQU0sQ0FBQyxNQUFNLHlDQUF5QyxHQUFHLGlDQUFpQyxDQUFDO0FBQzNGLE1BQU0sQ0FBQyxNQUFNLHVDQUF1QyxHQUFHLGdDQUFnQyxDQUFDO0FBRXhGLE1BQU0sQ0FBQyxNQUFNLHVCQUF1QixHQUFHLElBQUksYUFBYSxDQUFVLGtCQUFrQixFQUFFLEtBQUssQ0FBQyxDQUFDO0FB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