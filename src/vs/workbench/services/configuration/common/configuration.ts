/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ConfigurationScope } from '../../../../platform/configuration/common/configurationRegistry.js';
import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { refineServiceDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Event } from '../../../../base/common/event.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { IAnyWorkspaceIdentifier } from '../../../../platform/workspace/common/workspace.js';

export const FOLDER_CONFIG_FOLDER_NAME = '.vscode';
export const FOLDER_SETTINGS_NAME = 'settings';
export const FOLDER_SETTINGS_PATH = `${FOLDER_CONFIG_FOLDER_NAME}/${FOLDER_SETTINGS_NAME}.json`;

export const defaultSettingsSchemaId = 'vscode://schemas/settings/default';
export const userSettingsSchemaId = 'vscode://schemas/settings/user';
export const profileSettingsSchemaId = 'vscode://schemas/settings/profile';
export const machineSettingsSchemaId = 'vscode://schemas/settings/machine';
export const workspaceSettingsSchemaId = 'vscode://schemas/settings/workspace';
export const folderSettingsSchemaId = 'vscode://schemas/settings/folder';
export const launchSchemaId = 'vscode://schemas/launch';
export const tasksSchemaId = 'vscode://schemas/tasks';

export const APPLICATION_SCOPES = [ConfigurationScope.APPLICATION, ConfigurationScope.APPLICATION_MACHINE];
export const PROFILE_SCOPES = [ConfigurationScope.MACHINE, ConfigurationScope.WINDOW, ConfigurationScope.RESOURCE, ConfigurationScope.LANGUAGE_OVERRIDABLE, ConfigurationScope.MACHINE_OVERRIDABLE];
export const LOCAL_MACHINE_PROFILE_SCOPES = [ConfigurationScope.WINDOW, ConfigurationScope.RESOURCE, ConfigurationScope.LANGUAGE_OVERRIDABLE];
export const LOCAL_MACHINE_SCOPES = [ConfigurationScope.APPLICATION, ...LOCAL_MACHINE_PROFILE_SCOPES];
export const REMOTE_MACHINE_SCOPES = [ConfigurationScope.MACHINE, ConfigurationScope.APPLICATION_MACHINE, ConfigurationScope.WINDOW, ConfigurationScope.RESOURCE, ConfigurationScope.LANGUAGE_OVERRIDABLE, ConfigurationScope.MACHINE_OVERRIDABLE];
export const WORKSPACE_SCOPES = [ConfigurationScope.WINDOW, ConfigurationScope.RESOURCE, ConfigurationScope.LANGUAGE_OVERRIDABLE, ConfigurationScope.MACHINE_OVERRIDABLE];
export const FOLDER_SCOPES = [ConfigurationScope.RESOURCE, ConfigurationScope.LANGUAGE_OVERRIDABLE, ConfigurationScope.MACHINE_OVERRIDABLE];

export const TASKS_CONFIGURATION_KEY = 'tasks';
export const LAUNCH_CONFIGURATION_KEY = 'launch';

export const WORKSPACE_STANDALONE_CONFIGURATIONS = Object.create(null);
WORKSPACE_STANDALONE_CONFIGURATIONS[TASKS_CONFIGURATION_KEY] = `${FOLDER_CONFIG_FOLDER_NAME}/${TASKS_CONFIGURATION_KEY}.json`;
WORKSPACE_STANDALONE_CONFIGURATIONS[LAUNCH_CONFIGURATION_KEY] = `${FOLDER_CONFIG_FOLDER_NAME}/${LAUNCH_CONFIGURATION_KEY}.json`;
export const USER_STANDALONE_CONFIGURATIONS = Object.create(null);
USER_STANDALONE_CONFIGURATIONS[TASKS_CONFIGURATION_KEY] = `${TASKS_CONFIGURATION_KEY}.json`;

export type ConfigurationKey = { type: 'defaults' | 'user' | 'workspaces' | 'folder'; key: string };

export interface IConfigurationCache {

	needsCaching(resource: URI): boolean;
	read(key: ConfigurationKey): Promise<string>;
	write(key: ConfigurationKey, content: string): Promise<void>;
	remove(key: ConfigurationKey): Promise<void>;

}

export type RestrictedSettings = {
	default: ReadonlyArray<string>;
	application?: ReadonlyArray<string>;
	userLocal?: ReadonlyArray<string>;
	userRemote?: ReadonlyArray<string>;
	workspace?: ReadonlyArray<string>;
	workspaceFolder?: ResourceMap<ReadonlyArray<string>>;
};

export const IWorkbenchConfigurationService = refineServiceDecorator<IConfigurationService, IWorkbenchConfigurationService>(IConfigurationService);
export interface IWorkbenchConfigurationService extends IConfigurationService {
	/**
	 * Restricted settings defined in each configuration target
	 */
	readonly restrictedSettings: RestrictedSettings;

	/**
	 * Event that triggers when the restricted settings changes
	 */
	readonly onDidChangeRestrictedSettings: Event<RestrictedSettings>;

	/**
	 * A promise that resolves when the remote configuration is loaded in a remote window.
	 * The promise is resolved immediately if the window is not remote.
	 */
	whenRemoteConfigurationLoaded(): Promise<void>;

	/**
	 * Initialize configuration service for the given workspace
	 * @param arg workspace Identifier
	 */
	initialize(arg: IAnyWorkspaceIdentifier): Promise<void>;

	/**
	 * Returns true if the setting can be applied for all profiles otherwise false.
	 * @param setting
	 */
	isSettingAppliedForAllProfiles(setting: string): boolean;
}

export const TASKS_DEFAULT = '{\n\t\"version\": \"2.0.0\",\n\t\"tasks\": []\n}';

export const APPLY_ALL_PROFILES_SETTING = 'workbench.settings.applyToAllProfiles';
