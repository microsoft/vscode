/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ConfigurationScope, Extensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService, IConfigurationValue } from '../../../../platform/configuration/common/configuration.js';
import { refineServiceDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Event } from '../../../../base/common/event.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { IAnyWorkspaceIdentifier } from '../../../../platform/workspace/common/workspace.js';
import { IStringDictionary } from '../../../../base/common/collections.js';
import { Registry } from '../../../../platform/registry/common/platform.js';

export const FOLDER_CONFIG_FOLDER_NAME = '.vscode';
export const FOLDER_SETTINGS_NAME = 'settings';
export const FOLDER_SETTINGS_PATH = `${FOLDER_CONFIG_FOLDER_NAME}/${FOLDER_SETTINGS_NAME}.json`;

export const defaultSettingsSchemaId = 'vscode://schemas/settings/default';
export const userSettingsSchemaId = 'vscode://schemas/settings/user';
export const profileSettingsSchemaId = 'vscode://schemas/settings/profile';
export const machineSettingsSchemaId = 'vscode://schemas/settings/machine';
export const workspaceSettingsSchemaId = 'vscode://schemas/settings/workspace';
export const folderSettingsSchemaId = 'vscode://schemas/settings/folder';
export const layoutSettingsSchemaId = 'vscode://schemas/settings/layout';
export const launchSchemaId = 'vscode://schemas/launch';
export const tasksSchemaId = 'vscode://schemas/tasks';
export const mcpSchemaId = 'vscode://schemas/mcp';

export const APPLICATION_SCOPES = [ConfigurationScope.APPLICATION, ConfigurationScope.APPLICATION_MACHINE];
export const PROFILE_SCOPES = [ConfigurationScope.MACHINE, ConfigurationScope.WINDOW, ConfigurationScope.RESOURCE, ConfigurationScope.LANGUAGE_OVERRIDABLE, ConfigurationScope.MACHINE_OVERRIDABLE];
export const LOCAL_MACHINE_PROFILE_SCOPES = [ConfigurationScope.WINDOW, ConfigurationScope.RESOURCE, ConfigurationScope.LANGUAGE_OVERRIDABLE];
export const LOCAL_MACHINE_SCOPES = [ConfigurationScope.APPLICATION, ...LOCAL_MACHINE_PROFILE_SCOPES];
export const REMOTE_MACHINE_SCOPES = [ConfigurationScope.MACHINE, ConfigurationScope.APPLICATION_MACHINE, ConfigurationScope.WINDOW, ConfigurationScope.RESOURCE, ConfigurationScope.LANGUAGE_OVERRIDABLE, ConfigurationScope.MACHINE_OVERRIDABLE];
export const WORKSPACE_SCOPES = [ConfigurationScope.WINDOW, ConfigurationScope.RESOURCE, ConfigurationScope.LANGUAGE_OVERRIDABLE, ConfigurationScope.MACHINE_OVERRIDABLE];
export const FOLDER_SCOPES = [ConfigurationScope.RESOURCE, ConfigurationScope.LANGUAGE_OVERRIDABLE, ConfigurationScope.MACHINE_OVERRIDABLE];

export const TASKS_CONFIGURATION_KEY = 'tasks';
export const LAUNCH_CONFIGURATION_KEY = 'launch';
export const MCP_CONFIGURATION_KEY = 'mcp';

export const WORKSPACE_STANDALONE_CONFIGURATIONS = Object.create(null);
WORKSPACE_STANDALONE_CONFIGURATIONS[TASKS_CONFIGURATION_KEY] = `${FOLDER_CONFIG_FOLDER_NAME}/${TASKS_CONFIGURATION_KEY}.json`;
WORKSPACE_STANDALONE_CONFIGURATIONS[LAUNCH_CONFIGURATION_KEY] = `${FOLDER_CONFIG_FOLDER_NAME}/${LAUNCH_CONFIGURATION_KEY}.json`;
WORKSPACE_STANDALONE_CONFIGURATIONS[MCP_CONFIGURATION_KEY] = `${FOLDER_CONFIG_FOLDER_NAME}/${MCP_CONFIGURATION_KEY}.json`;
export const USER_STANDALONE_CONFIGURATIONS = Object.create(null);
USER_STANDALONE_CONFIGURATIONS[TASKS_CONFIGURATION_KEY] = `${TASKS_CONFIGURATION_KEY}.json`;
USER_STANDALONE_CONFIGURATIONS[MCP_CONFIGURATION_KEY] = `${MCP_CONFIGURATION_KEY}.json`;

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

	/**
	 * The named layout that is active in this window, `undefined` if no named layout is active.
	 */
	readonly layoutSettings: ILayoutSettings | undefined;

	/**
	 * Fires when {@link layoutSettings} changes: another named layout became active, or the
	 * name or the locked state of the active one changed.
	 */
	readonly onDidChangeLayoutSettings: Event<void>;

	/**
	 * Applies the settings of the named layout that becomes active in this window, or of no
	 * named layout. The settings of a named layout are read from its settings file and take
	 * precedence over user, workspace and workspace folder settings in this window only.
	 * Settings that are not layout overridable and language specific values are ignored.
	 *
	 * The settings file is watched for changes. Use {@link reloadConfiguration} with the
	 * `LAYOUT` target to read it.
	 *
	 * @param lastKnownSettings The settings that apply until the settings file is read. If not
	 * given, the current settings are kept for the same settings file and cleared for another one.
	 */
	setLayoutSettings(layout: ILayoutSettings | undefined, lastKnownSettings?: IStringDictionary<unknown>): void;

	/**
	 * Returns the settings of the named layout that is active in this window.
	 * The result is empty if no named layout is active.
	 */
	getLayoutConfiguration(): IStringDictionary<unknown>;

	/**
	 * Whether changes to the given setting apply to the named layout that is active in this
	 * window: a named layout is active and can define the setting. Changes that do not target
	 * a scope, and that are not language specific, are written to the layout then.
	 */
	isActiveLayoutSetting(key: string): boolean;
}

/**
 * A named layout whose settings apply to a window, see {@link IWorkbenchConfigurationService.setLayoutSettings}.
 */
export interface ILayoutSettings {

	/**
	 * The name of the layout, shown to the user.
	 */
	readonly name: string;

	/**
	 * The settings file of the layout.
	 */
	readonly resource: URI;

	/**
	 * Whether the layout is locked. The settings of a locked layout cannot be changed.
	 */
	readonly locked: boolean;

	/**
	 * Whether the extension that contributes the layout locked it. Users cannot unlock such a layout.
	 */
	readonly lockedByExtension?: boolean;
}

/**
 * Returns `true` if a named layout can define the value of the given setting.
 */
export function isLayoutOverridableSetting(key: string): boolean {
	return Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurationProperties()[key]?.layoutOverridable === true;
}

/**
 * Returns the keys of all settings a named layout can define.
 */
export function getLayoutOverridableSettings(): string[] {
	const properties = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurationProperties();
	return Object.keys(properties).filter(key => properties[key].layoutOverridable === true);
}

/**
 * Returns the value a setting would have if the named layout did not define it: the value
 * of the workspace folder, workspace, user or application settings, or the default value.
 * Layout settings have primitive values, so the value of the most specific scope is the result.
 */
export function getValueWithoutLayout<T>(inspected: IConfigurationValue<T>): T | undefined {
	return inspected.workspaceFolderValue ?? inspected.workspaceValue ?? inspected.userValue ?? inspected.applicationValue ?? inspected.defaultValue;
}

export const TASKS_DEFAULT = '{\n\t\"version\": \"2.0.0\",\n\t\"tasks\": []\n}';

export const APPLY_ALL_PROFILES_SETTING = 'workbench.settings.applyToAllProfiles';
