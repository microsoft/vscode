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
import { IModel } from 'vs/editor/common/editorCommon';
import { IKeybindingItemEntry } from 'vs/workbench/parts/preferences/common/keybindingsEditorModel';
import { IRange } from 'vs/editor/common/core/range';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { join } from 'vs/base/common/paths';
import { ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import Event from 'vs/base/common/event';

export interface IWorkbenchSettingsConfiguration {
	workbench: {
		settings: {
			openDefaultSettings: boolean;
			naturalLanguageSearchEndpoint: string;
			naturalLanguageSearchKey: string;
			naturalLanguageSearchAutoIngestFeedback: boolean;
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

export interface IFilterResult {
	query: string;
	filteredGroups: ISettingsGroup[];
	allGroups: ISettingsGroup[];
	matches: IRange[];
	fuzzySearchAvailable?: boolean;
	metadata?: IFilterMetadata;
}

export interface IScoredResults {
	[key: string]: number;
}

export interface IFilterMetadata {
	remoteUrl: string;
	timestamp: number;
	duration: number;
	scoredResults: IScoredResults;

	/** The name of the server that actually served the request */
	context: string;
}

export interface IPreferencesEditorModel<T> {
	uri: URI;
	getPreference(key: string): T;
	dispose(): void;
}

export type IGroupFilter = (group: ISettingsGroup) => boolean;
export type ISettingFilter = (setting: ISetting) => IRange[];

export interface ISettingsEditorModel extends IPreferencesEditorModel<ISetting> {
	readonly onDidChangeGroups: Event<void>;
	settingsGroups: ISettingsGroup[];
	groupsTerms: string[];
	filterSettings(filter: string, groupFilter: IGroupFilter, settingFilter: ISettingFilter, mostRelevantSettings?: string[]): IFilterResult;
	findValueMatches(filter: string, setting: ISetting): IRange[];
}

export interface IKeybindingsEditorModel<T> extends IPreferencesEditorModel<T> {
}

export const IPreferencesService = createDecorator<IPreferencesService>('preferencesService');

export interface IPreferencesService {
	_serviceBrand: any;

	userSettingsResource: URI;
	workspaceSettingsResource: URI;
	getFolderSettingsResource(resource: URI): URI;

	resolveModel(uri: URI): TPromise<IModel>;
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
	showConflicts(keybindingEntry: IKeybindingItemEntry): TPromise<any>;
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

	remoteSearchAllowed: boolean;
	endpoint: IEndpointDetails;
	onRemoteSearchEnablementChanged: Event<boolean>;

	startSearch(filter: string, remote: boolean): IPreferencesSearchModel;
}

export interface IPreferencesSearchModel {
	filterPreferences(preferencesModel: ISettingsEditorModel): TPromise<IFilterResult>;
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
export const KEYBINDINGS_EDITOR_COMMAND_SEARCH = 'keybindings.editor.searchKeybindings';
export const KEYBINDINGS_EDITOR_COMMAND_CLEAR_SEARCH_RESULTS = 'keybindings.editor.clearSearchResults';
export const KEYBINDINGS_EDITOR_COMMAND_DEFINE = 'keybindings.editor.defineKeybinding';
export const KEYBINDINGS_EDITOR_COMMAND_REMOVE = 'keybindings.editor.removeKeybinding';
export const KEYBINDINGS_EDITOR_COMMAND_RESET = 'keybindings.editor.resetKeybinding';
export const KEYBINDINGS_EDITOR_COMMAND_COPY = 'keybindings.editor.copyKeybindingEntry';
export const KEYBINDINGS_EDITOR_COMMAND_SHOW_CONFLICTS = 'keybindings.editor.showConflicts';
export const KEYBINDINGS_EDITOR_COMMAND_FOCUS_KEYBINDINGS = 'keybindings.editor.focusKeybindings';

export const FOLDER_SETTINGS_PATH = join('.vscode', 'settings.json');
export const DEFAULT_SETTINGS_EDITOR_SETTING = 'workbench.settings.openDefaultSettings';