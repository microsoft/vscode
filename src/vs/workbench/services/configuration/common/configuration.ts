/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService, IConfigurationValue, IConfigurationKeys } from 'vs/platform/configuration/common/configuration';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const CONFIG_DEFAULT_NAME = 'settings';
export const WORKSPACE_CONFIG_FOLDER_DEFAULT_NAME = '.vscode';
export const WORKSPACE_CONFIG_DEFAULT_PATH = `${WORKSPACE_CONFIG_FOLDER_DEFAULT_NAME}/${CONFIG_DEFAULT_NAME}.json`;

export const IWorkspaceConfigurationService = createDecorator<IWorkspaceConfigurationService>('configurationService');

export type IWorkspaceConfigurationValues = { [key: string]: IWorkspaceConfigurationValue<any> };

export interface IWorkspaceConfigurationService extends IConfigurationService {

	/**
	 * Returns untrusted configuration keys for the current workspace.
	 */
	getUnsupportedWorkspaceKeys(): string[];

	/**
	 * Override for the IConfigurationService#lookup() method that adds information about workspace settings.
	 */
	lookup<T>(key: string): IWorkspaceConfigurationValue<T>;

	/**
	 * Override for the IConfigurationService#keys() method that adds information about workspace settings.
	 */
	keys(): IWorkspaceConfigurationKeys;

	/**
	 * Returns the defined values of configurations in the different scopes.
	 */
	values(): IWorkspaceConfigurationValues;
}

export interface IWorkspaceConfigurationValue<T> extends IConfigurationValue<T> {
	workspace: T;
}

export interface IWorkspaceConfigurationKeys extends IConfigurationKeys {
	workspace: string[];
}

export const WORKSPACE_STANDALONE_CONFIGURATIONS = {
	'tasks': `${WORKSPACE_CONFIG_FOLDER_DEFAULT_NAME}/tasks.json`,
	'launch': `${WORKSPACE_CONFIG_FOLDER_DEFAULT_NAME}/launch.json`
};