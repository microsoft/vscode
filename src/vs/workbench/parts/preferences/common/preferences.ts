/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IRange } from 'vs/editor/common/editorCommon';
import URI from 'vs/base/common/uri';
import { IConfigurationValue } from 'vs/workbench/services/configuration/common/configurationEditing';

export interface ISettingsGroup {
	titleRange: IRange;
	title: string;
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
	value: any;
	valueRange: IRange;
	description: string;
}

export interface IPreferencesEditorModel {
	uri: URI;
	content: string;
}

export interface ISettingsEditorModel extends IPreferencesEditorModel {
	settingsGroups: ISettingsGroup[];
}

export interface IKeybindingsEditorModel extends IPreferencesEditorModel {
}

export const IPreferencesService = createDecorator<IPreferencesService>('preferencesService');

export interface IPreferencesService {
	_serviceBrand: any;

	defaultSettings: ISettingsEditorModel;
	defaultKeybindings: IKeybindingsEditorModel;

	resolvePreferencesEditorModel(uri: URI): TPromise<IPreferencesEditorModel>;

	openGlobalSettings(): TPromise<void>;
	openWorkspaceSettings(): TPromise<void>;
	openGlobalKeybindingSettings(): TPromise<void>;
	copyConfiguration(configurationValue: IConfigurationValue): void;
}