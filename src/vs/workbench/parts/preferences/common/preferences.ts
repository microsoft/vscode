/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { join } from 'vs/base/common/paths';
import { ISettingsEditorModel, ISearchResult } from 'vs/workbench/services/preferences/common/preferences';
import { IEditor } from 'vs/platform/editor/common/editor';
import { IKeybindingItemEntry } from 'vs/workbench/services/preferences/common/keybindingsEditorModel';

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
		}
	};
}

export interface IEndpointDetails {
	urlBase: string;
	key?: string;
}

export const IPreferencesSearchService = createDecorator<IPreferencesSearchService>('preferencesSearchService');

export interface IPreferencesSearchService {
	_serviceBrand: any;

	getLocalSearchProvider(filter: string): ISearchProvider;
	getRemoteSearchProvider(filter: string, newExtensionsOnly?: boolean): ISearchProvider;
}

export interface ISearchProvider {
	searchModel(preferencesModel: ISettingsEditorModel): TPromise<ISearchResult>;
}

export interface IKeybindingsEditor extends IEditor {

	activeKeybindingEntry: IKeybindingItemEntry;

	search(filter: string): void;
	clearSearchResults(): void;
	focusKeybindings(): void;
	defineKeybinding(keybindingEntry: IKeybindingItemEntry): TPromise<any>;
	removeKeybinding(keybindingEntry: IKeybindingItemEntry): TPromise<any>;
	resetKeybinding(keybindingEntry: IKeybindingItemEntry): TPromise<any>;
	copyKeybinding(keybindingEntry: IKeybindingItemEntry): TPromise<any>;
	copyKeybindingCommand(keybindingEntry: IKeybindingItemEntry): TPromise<any>;
	showSimilarKeybindings(keybindingEntry: IKeybindingItemEntry): TPromise<any>;
}

export const CONTEXT_SETTINGS_EDITOR = new RawContextKey<boolean>('inSettingsEditor', false);
export const CONTEXT_SETTINGS_SEARCH_FOCUS = new RawContextKey<boolean>('inSettingsSearch', false);
export const CONTEXT_KEYBINDINGS_EDITOR = new RawContextKey<boolean>('inKeybindings', false);
export const CONTEXT_KEYBINDINGS_SEARCH_FOCUS = new RawContextKey<boolean>('inKeybindingsSearch', false);
export const CONTEXT_KEYBINDING_FOCUS = new RawContextKey<boolean>('keybindingFocus', false);

export const SETTINGS_EDITOR_COMMAND_SEARCH = 'settings.action.search';
export const SETTINGS_EDITOR_COMMAND_CLEAR_SEARCH_RESULTS = 'settings.action.clearSearchResults';
export const SETTINGS_EDITOR_COMMAND_FOCUS_NEXT_SETTING = 'settings.action.focusNextSetting';
export const SETTINGS_EDITOR_COMMAND_FOCUS_PREVIOUS_SETTING = 'settings.action.focusPreviousSetting';
export const SETTINGS_EDITOR_COMMAND_FOCUS_FILE = 'settings.action.focusSettingsFile';
export const SETTINGS_EDITOR_COMMAND_EDIT_FOCUSED_SETTING = 'settings.action.editFocusedSetting';
export const KEYBINDINGS_EDITOR_COMMAND_SEARCH = 'keybindings.editor.searchKeybindings';
export const KEYBINDINGS_EDITOR_COMMAND_CLEAR_SEARCH_RESULTS = 'keybindings.editor.clearSearchResults';
export const KEYBINDINGS_EDITOR_COMMAND_DEFINE = 'keybindings.editor.defineKeybinding';
export const KEYBINDINGS_EDITOR_COMMAND_REMOVE = 'keybindings.editor.removeKeybinding';
export const KEYBINDINGS_EDITOR_COMMAND_RESET = 'keybindings.editor.resetKeybinding';
export const KEYBINDINGS_EDITOR_COMMAND_COPY = 'keybindings.editor.copyKeybindingEntry';
export const KEYBINDINGS_EDITOR_COMMAND_COPY_COMMAND = 'keybindings.editor.copyCommandKeybindingEntry';
export const KEYBINDINGS_EDITOR_COMMAND_SHOW_SIMILAR = 'keybindings.editor.showConflicts';
export const KEYBINDINGS_EDITOR_COMMAND_FOCUS_KEYBINDINGS = 'keybindings.editor.focusKeybindings';
export const KEYBINDINGS_EDITOR_SHOW_DEFAULT_KEYBINDINGS = 'keybindings.editor.showDefaultKeybindings';
export const KEYBINDINGS_EDITOR_SHOW_USER_KEYBINDINGS = 'keybindings.editor.showUserKeybindings';

export const FOLDER_SETTINGS_PATH = join('.vscode', 'settings.json');
export const DEFAULT_SETTINGS_EDITOR_SETTING = 'workbench.settings.openDefaultSettings';
