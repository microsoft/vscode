/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ConfigurationScope } from 'vs/platform/configuration/common/configurationRegistry';

export const FOLDER_CONFIG_FOLDER_NAME = '.vscode';
export const FOLDER_SETTINGS_NAME = 'settings';
export const FOLDER_SETTINGS_PATH = `${FOLDER_CONFIG_FOLDER_NAME}/${FOLDER_SETTINGS_NAME}.json`;

export const defaultSettingsSchemaId = 'vscode://schemas/settings/default';
export const userSettingsSchemaId = 'vscode://schemas/settings/user';
export const machineSettingsSchemaId = 'vscode://schemas/settings/machine';
export const workspaceSettingsSchemaId = 'vscode://schemas/settings/workspace';
export const folderSettingsSchemaId = 'vscode://schemas/settings/folder';
export const launchSchemaId = 'vscode://schemas/launch';

export const LOCAL_MACHINE_SCOPES = [ConfigurationScope.APPLICATION, ConfigurationScope.WINDOW, ConfigurationScope.RESOURCE];
export const REMOTE_MACHINE_SCOPES = [ConfigurationScope.MACHINE, ConfigurationScope.WINDOW, ConfigurationScope.RESOURCE, ConfigurationScope.MACHINE_OVERRIDABLE];
export const WORKSPACE_SCOPES = [ConfigurationScope.WINDOW, ConfigurationScope.RESOURCE, ConfigurationScope.MACHINE_OVERRIDABLE];
export const FOLDER_SCOPES = [ConfigurationScope.RESOURCE, ConfigurationScope.MACHINE_OVERRIDABLE];

export const TASKS_CONFIGURATION_KEY = 'tasks';
export const LAUNCH_CONFIGURATION_KEY = 'launch';

export const WORKSPACE_STANDALONE_CONFIGURATIONS = Object.create(null);
WORKSPACE_STANDALONE_CONFIGURATIONS[TASKS_CONFIGURATION_KEY] = `${FOLDER_CONFIG_FOLDER_NAME}/${TASKS_CONFIGURATION_KEY}.json`;
WORKSPACE_STANDALONE_CONFIGURATIONS[LAUNCH_CONFIGURATION_KEY] = `${FOLDER_CONFIG_FOLDER_NAME}/${LAUNCH_CONFIGURATION_KEY}.json`;

export type ConfigurationKey = { type: 'user' | 'workspaces' | 'folder', key: string };

export interface IConfigurationCache {

	read(key: ConfigurationKey): Promise<string>;
	write(key: ConfigurationKey, content: string): Promise<void>;
	remove(key: ConfigurationKey): Promise<void>;

}
