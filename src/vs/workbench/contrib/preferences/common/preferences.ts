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
}

export interface ISearchProvider {
	searchModel(preferencesModel: ISettingsEditorModel, token?: CancellationToken): Promise<ISearchResult | null>;
}

export interface IRemoteSearchProvider extends ISearchProvider {
	setFilter(filter: string): void;
}

export const SETTINGS_EDITOR_COMMAND_CLEAR_SEARCH_RESULTS = 'settings.action.clearSearchResults';
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
export const KEYBOARD_LAYOUT_OPEN_PICKER = 'workbench.action.openKeyboardLayoutPicker';

export const ENABLE_LANGUAGE_FILTER = true;

export const ENABLE_EXTENSION_TOGGLE_SETTINGS = true;
export const EXTENSION_FETCH_TIMEOUT_MS = 1000;

export type ExtensionToggleData = {
	settingsEditorRecommendedExtensions: IStringDictionary<IExtensionRecommendations>;
	recommendedExtensionsGalleryInfo: IStringDictionary<IGalleryExtension>;
	commonlyUsed: string[];
};

let cachedExtensionToggleData: ExtensionToggleData | undefined;

export async function getExperimentalExtensionToggleData(extensionGalleryService: IExtensionGalleryService, productService: IProductService): Promise<ExtensionToggleData | undefined> {
	if (!ENABLE_EXTENSION_TOGGLE_SETTINGS) {
		return undefined;
	}

	if (!extensionGalleryService.isEnabled()) {
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
				const extensions = await raceTimeout(extensionGalleryService.getExtensions([{ id: extensionId, preRelease: !isStable }], CancellationToken.None), EXTENSION_FETCH_TIMEOUT_MS);
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

export const PREVIEW_INDICATOR_DESCRIPTION = localize('previewIndicatorDescription', "This setting controls a new feature that is still under refinement yet ready to use. Feedback is welcome.");
export const EXPERIMENTAL_INDICATOR_DESCRIPTION = localize('experimentalIndicatorDescription', "This setting controls a new feature that is actively being developed and may be unstable. It is subject to change or removal.");
