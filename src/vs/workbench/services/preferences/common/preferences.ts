/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IEditor, Position, IEditorOptions } from 'vs/platform/editor/common/editor';
import { ITextModel } from 'vs/editor/common/model';
import { IRange } from 'vs/editor/common/core/range';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { join } from 'vs/base/common/paths';
import { ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { Event } from 'vs/base/common/event';
import { IStringDictionary } from 'vs/base/common/collections';
import { ILocalExtension } from 'vs/platform/extensionManagement/common/extensionManagement';
import { localize } from 'vs/nls';

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

	// TODO@roblou maybe need new type and new EditorModel for GUI editor instead of ISetting which is used for text settings editor
	type?: string | string[];
	enum?: string[];
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
	openSettings(): TPromise<IEditor>;
	openSettings2(): TPromise<IEditor>;
	openGlobalSettings(options?: IEditorOptions, position?: Position): TPromise<IEditor>;
	openWorkspaceSettings(options?: IEditorOptions, position?: Position): TPromise<IEditor>;
	openFolderSettings(folder: URI, options?: IEditorOptions, position?: Position): TPromise<IEditor>;
	switchSettings(target: ConfigurationTarget, resource: URI): TPromise<void>;
	openGlobalKeybindingSettings(textual: boolean): TPromise<void>;

	configureSettingsForLanguage(language: string): void;
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

export const FOLDER_SETTINGS_PATH = join('.vscode', 'settings.json');
export const DEFAULT_SETTINGS_EDITOR_SETTING = 'workbench.settings.openDefaultSettings';
