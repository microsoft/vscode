/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { LinkedMap as Map } from 'vs/base/common/map';
import { IRange } from 'vs/editor/common/editorCommon';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IConfigurationValue } from 'vs/workbench/services/configuration/common/configurationEditing';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';

export interface ISettingsGroup {
	id: string;
	range: IRange;
	title: string;
	titleRange: IRange;
	sections: ISettingsSection[];
}

export interface ISettingsSection {
	descriptionRange?: IRange;
	description?: string;
	settings: ISetting[];
}

export interface ISetting {
	range: IRange;
	key: string;
	keyRange: IRange;
	value: any;
	valueRange: IRange;
	description: string;
	descriptionRange: IRange;
}

export interface IFilterResult {
	filteredGroups: ISettingsGroup[];
	allGroups: ISettingsGroup[];
	matches: Map<string, IRange[]>;
}

export interface IPreferencesEditorModel {
	uri: URI;
	content: string;
}

export interface ISettingsEditorModel extends IPreferencesEditorModel {
	settingsGroups: ISettingsGroup[];
	groupsTerms: string[];
	filterSettings(filter: string): IFilterResult;
}

export interface IKeybindingsEditorModel extends IPreferencesEditorModel {
}

export const IPreferencesService = createDecorator<IPreferencesService>('preferencesService');

export interface IPreferencesService {
	_serviceBrand: any;

	createDefaultPreferencesEditorModel(uri: URI): TPromise<IPreferencesEditorModel>;
	resolvePreferencesEditorModel(uri: URI): TPromise<IPreferencesEditorModel>;

	openGlobalSettings(): TPromise<void>;
	openWorkspaceSettings(): TPromise<void>;
	openGlobalKeybindingSettings(): TPromise<void>;

	copyConfiguration(configurationValue: IConfigurationValue): void;
}

export const CONTEXT_DEFAULT_SETTINGS_EDITOR = new RawContextKey<boolean>('defaultSettingsEditor', false);
export const DEFAULT_EDITOR_COMMAND_COLLAPSE_ALL = 'defaultSettingsEditor.action.collapseAllGroups';