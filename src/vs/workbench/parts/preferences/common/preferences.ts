/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IEditor, Position, IEditorOptions } from 'vs/platform/editor/common/editor';
import { ITextModel } from 'vs/editor/common/model';
import { IKeybindingItemEntry } from 'vs/workbench/parts/preferences/common/keybindingsEditorModel';
import { IRange } from 'vs/editor/common/core/range';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { join } from 'vs/base/common/paths';
import { ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { Event } from 'vs/base/common/event';
import { IStringDictionary } from 'vs/base/common/collections';
import { ILocalExtension } from 'vs/platform/extensionManagement/common/extensionManagement';

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

export interface ISettingsGroup {
	id: string;
	range: IRange;
	title: string;
	titleRange: IRange;
	sections: ISettingsSection[];
}

export interface ISettingsSection {
	titleRange?: IRange;
	title?: string;
	settings: ISetting[];
}

export interface ISetting {
	range: IRange;
	key: string;
	keyRange: IRange;
	value: any;
	valueRange: IRange;
	description: string[];
	descriptionRanges: IRange[];
	overrides?: ISetting[];
	overrideOf?: ISetting;
}

export interface IExtensionSetting extends ISetting {
	extensionName: string;
	extensionPublisher: string;
}

export interface ISearchResult {
	filterMatches: ISettingMatch[];
	metadata?: IFilterMetadata;
}

export interface ISearchResultGroup {
	id: string;
	label: string;
	result: ISearchResult;
	order: number;
}

export interface IFilterResult {
	query?: string;
	filteredGroups: ISettingsGroup[];
	allGroups: ISettingsGroup[];
	matches: IRange[];
	metadata?: IStringDictionary<IFilterMetadata>;
}

export interface ISettingMatch {
	setting: ISetting;
	matches: IRange[];
	score: number;
}

export interface IScoredResults {
	[key: string]: IRemoteSetting;
}

export interface IRemoteSetting {
	score: number;
	key: string;
	id: string;
	defaultValue: string;
	description: string;
	packageId: string;
	extensionName?: string;
	extensionPublisher?: string;
}

export interface IFilterMetadata {
	requestUrl: string;
	requestBody: string;
	timestamp: number;
	duration: number;
	scoredResults: IScoredResults;
	extensions?: ILocalExtension[];

	/** The number of requests made, since requests are split by number of filters */
	requestCount?: number;

	/** The name of the server that actually served the request */
	context: string;
}

export interface IPreferencesEditorModel<T> {
	uri: URI;
	getPreference(key: string): T;
	dispose(): void;
}

export type IGroupFilter = (group: ISettingsGroup) => boolean;
export type ISettingMatcher = (setting: ISetting, group: ISettingsGroup) => { matches: IRange[], score: number };

export interface ISettingsEditorModel extends IPreferencesEditorModel<ISetting> {
	readonly onDidChangeGroups: Event<void>;
	settingsGroups: ISettingsGroup[];
	filterSettings(filter: string, groupFilter: IGroupFilter, settingMatcher: ISettingMatcher): ISettingMatch[];
	findValueMatches(filter: string, setting: ISetting): IRange[];
	updateResultGroup(id: string, resultGroup: ISearchResultGroup): IFilterResult;
}

export interface IKeybindingsEditorModel<T> extends IPreferencesEditorModel<T> {
}

export const IPreferencesService = createDecorator<IPreferencesService>('preferencesService');

export interface IPreferencesService {
	_serviceBrand: any;

	userSettingsResource: URI;
	workspaceSettingsResource: URI;
	getFolderSettingsResource(resource: URI): URI;

	resolveModel(uri: URI): TPromise<ITextModel>;
	createPreferencesEditorModel<T>(uri: URI): TPromise<IPreferencesEditorModel<T>>;

	openRawDefaultSettings(): TPromise<void>;
	openGlobalSettings(options?: IEditorOptions, position?: Position): TPromise<IEditor>;
	openWorkspaceSettings(options?: IEditorOptions, position?: Position): TPromise<IEditor>;
	openFolderSettings(folder: URI, options?: IEditorOptions, position?: Position): TPromise<IEditor>;
	switchSettings(target: ConfigurationTarget, resource: URI): TPromise<void>;
	openGlobalKeybindingSettings(textual: boolean): TPromise<void>;

	configureSettingsForLanguage(language: string): void;
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

export function getSettingsTargetName(target: ConfigurationTarget, resource: URI, workspaceContextService: IWorkspaceContextService): string {
	switch (target) {
		case ConfigurationTarget.USER:
			return localize('userSettingsTarget', "User Settings");
		case ConfigurationTarget.WORKSPACE:
			return localize('workspaceSettingsTarget', "Workspace Settings");
		case ConfigurationTarget.WORKSPACE_FOLDER:
			const folder = workspaceContextService.getWorkspaceFolder(resource);
			return folder ? folder.name : '';
	}
	return '';
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
