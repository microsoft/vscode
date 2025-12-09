/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IStringDictionary } from '../../../../base/common/collections.js';
import { IExtensionRecommendations } from '../../../../base/common/product.js';
import { localize } from '../../../../nls.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IExtensionGalleryService, IGalleryExtension } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { ISearchResult, ISettingsEditorModel } from '../../../services/preferences/common/preferences.js';

export interface IWorkbenchSettingsConfiguration {
	workbench: {
		settings: {
			openDefaultSettings: boolean;
			naturalLanguageSearchEndpoint: string;
			naturalLanguageSearchKey: string;
			naturalLanguageSearchAutoIngestFeedback: boolean;
			useNaturalLanguageSearchPost: boolean;
			enableNaturalLanguageSearch: boolean;
			enableNaturalLanguageSearchFeedback: boolean;
		};
	};
}

export interface IEndpointDetails {
	urlBase: string;
	key?: string;
}

export const IPreferencesSearchService = createDecorator<IPreferencesSearchService>('preferencesSearchService');

export interface IPreferencesSearchService {
	readonly _serviceBrand: undefined;

	getLocalSearchProvider(filter: string): ISearchProvider;
	getRemoteSearchProvider(filter: string, newExtensionsOnly?: boolean): ISearchProvider | undefined;
	getAiSearchProvider(filter: string): IAiSearchProvider | undefined;
}

export interface ISearchProvider {
	searchModel(preferencesModel: ISettingsEditorModel, token: CancellationToken): Promise<ISearchResult | null>;
}

export interface IRemoteSearchProvider extends ISearchProvider {
	setFilter(filter: string): void;
}

export interface IAiSearchProvider extends IRemoteSearchProvider {
	getLLMRankedResults(token: CancellationToken): Promise<ISearchResult | null>;
}

export const PREFERENCES_EDITOR_COMMAND_OPEN = 'workbench.preferences.action.openPreferencesEditor';
export const CONTEXT_PREFERENCES_SEARCH_FOCUS = new RawContextKey<boolean>('inPreferencesSearch', false);

export const SETTINGS_EDITOR_COMMAND_CLEAR_SEARCH_RESULTS = 'settings.action.clearSearchResults';
export const SETTINGS_EDITOR_COMMAND_SHOW_AI_RESULTS = 'settings.action.showAIResults';
export const SETTINGS_EDITOR_COMMAND_TOGGLE_AI_SEARCH = 'settings.action.toggleAiSearch';
export const SETTINGS_EDITOR_COMMAND_SHOW_CONTEXT_MENU = 'settings.action.showContextMenu';
export const SETTINGS_EDITOR_COMMAND_SUGGEST_FILTERS = 'settings.action.suggestFilters';

export const CONTEXT_SETTINGS_EDITOR = new RawContextKey<boolean>('inSettingsEditor', false);
export const CONTEXT_SETTINGS_JSON_EDITOR = new RawContextKey<boolean>('inSettingsJSONEditor', false);
export const CONTEXT_SETTINGS_SEARCH_FOCUS = new RawContextKey<boolean>('inSettingsSearch', false);
export const CONTEXT_TOC_ROW_FOCUS = new RawContextKey<boolean>('settingsTocRowFocus', false);
export const CONTEXT_SETTINGS_ROW_FOCUS = new RawContextKey<boolean>('settingRowFocus', false);
export const CONTEXT_KEYBINDINGS_EDITOR = new RawContextKey<boolean>('inKeybindings', false);
export const CONTEXT_KEYBINDINGS_SEARCH_FOCUS = new RawContextKey<boolean>('inKeybindingsSearch', false);
export const CONTEXT_KEYBINDING_FOCUS = new RawContextKey<boolean>('keybindingFocus', false);
export const CONTEXT_WHEN_FOCUS = new RawContextKey<boolean>('whenFocus', false);
export const CONTEXT_AI_SETTING_RESULTS_AVAILABLE = new RawContextKey<boolean>('aiSettingResultsAvailable', false);

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
export const EMBEDDINGS_ONLY_SEARCH_PROVIDER_NAME = 'embeddingsOnly';
export const EMBEDDINGS_SEARCH_PROVIDER_NAME = 'embeddingsFull';
export const LLM_RANKED_SEARCH_PROVIDER_NAME = 'llmRanked';

export enum WorkbenchSettingsEditorSettings {
	ShowAISearchToggle = 'workbench.settings.showAISearchToggle',
	EnableNaturalLanguageSearch = 'workbench.settings.enableNaturalLanguageSearch',
}

export type ExtensionToggleData = {
	settingsEditorRecommendedExtensions: IStringDictionary<IExtensionRecommendations>;
	recommendedExtensionsGalleryInfo: IStringDictionary<IGalleryExtension>;
	commonlyUsed: string[];
};

let cachedExtensionToggleData: ExtensionToggleData | undefined;

export async function getExperimentalExtensionToggleData(
	chatEntitlementService: IChatEntitlementService,
	extensionGalleryService: IExtensionGalleryService,
	productService: IProductService,
): Promise<ExtensionToggleData | undefined> {
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

	if (productService.extensionRecommendations && productService.commonlyUsedSettings) {
		const settingsEditorRecommendedExtensions: IStringDictionary<IExtensionRecommendations> = {};
		Object.keys(productService.extensionRecommendations).forEach(extensionId => {
			const extensionInfo = productService.extensionRecommendations![extensionId];
			if (extensionInfo.onSettingsEditorOpen) {
				settingsEditorRecommendedExtensions[extensionId] = extensionInfo;
			}
		});

		const recommendedExtensionsGalleryInfo: IStringDictionary<IGalleryExtension> = {};
		for (const key in settingsEditorRecommendedExtensions) {
			const extensionId = key;
			// Recommend prerelease if not on Stable.
			const isStable = productService.quality === 'stable';
			try {
				const extensions = await raceTimeout(
					extensionGalleryService.getExtensions([{ id: extensionId, preRelease: !isStable }], CancellationToken.None),
					EXTENSION_FETCH_TIMEOUT_MS);
				if (extensions?.length === 1) {
					recommendedExtensionsGalleryInfo[key] = extensions[0];
				} else {
					// same as network connection fail. we do not want a blank settings page: https://github.com/microsoft/vscode/issues/195722
					// so instead of returning partial data we return undefined here
					return undefined;
				}
			} catch (e) {
				// Network connection fail. Return nothing rather than partial data.
				return undefined;
			}
		}

		cachedExtensionToggleData = {
			settingsEditorRecommendedExtensions,
			recommendedExtensionsGalleryInfo,
			commonlyUsed: productService.commonlyUsedSettings
		};
		return cachedExtensionToggleData;
	}
	return undefined;
}

/**
 * Compares two nullable numbers such that null values always come after defined ones.
 */
export function compareTwoNullableNumbers(a: number | undefined, b: number | undefined): number {
	const aOrMax = a ?? Number.MAX_SAFE_INTEGER;
	const bOrMax = b ?? Number.MAX_SAFE_INTEGER;
	if (aOrMax < bOrMax) {
		return -1;
	} else if (aOrMax > bOrMax) {
		return 1;
	} else {
		return 0;
	}
}

export const PREVIEW_INDICATOR_DESCRIPTION = localize('previewIndicatorDescription', "Preview setting: this setting controls a new feature that is still under refinement yet ready to use. Feedback is welcome.");
export const EXPERIMENTAL_INDICATOR_DESCRIPTION = localize('experimentalIndicatorDescription', "Experimental setting: this setting controls a new feature that is actively being developed and may be unstable. It is subject to change or removal.");
export const ADVANCED_INDICATOR_DESCRIPTION = localize('advancedIndicatorDescription', "Advanced setting: this setting is intended for advanced scenarios and configurations. Only modify this if you know what it does.");

export const knownAcronyms = new Set<string>();
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

export const knownTermMappings = new Map<string, string>();
knownTermMappings.set('power shell', 'PowerShell');
knownTermMappings.set('powershell', 'PowerShell');
knownTermMappings.set('javascript', 'JavaScript');
knownTermMappings.set('typescript', 'TypeScript');
knownTermMappings.set('github', 'GitHub');
knownTermMappings.set('jet brains', 'JetBrains');
knownTermMappings.set('jetbrains', 'JetBrains');
knownTermMappings.set('re sharper', 'ReSharper');
knownTermMappings.set('resharper', 'ReSharper');

export function wordifyKey(key: string): string {
	key = key
		.replace(/\.([a-z0-9])/g, (_, p1) => ` \u203A ${p1.toUpperCase()}`) // Replace dot with spaced '>'
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2') // Camel case to spacing, fooBar => foo Bar
		.replace(/([A-Z]{1,})([A-Z][a-z])/g, '$1 $2') // Split consecutive capitals letters, AISearch => AI Search
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
