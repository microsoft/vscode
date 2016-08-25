/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {IConfigurationService, IConfigurationValue}  from 'vs/platform/configuration/common/configuration';
import {createDecorator} from 'vs/platform/instantiation/common/instantiation';

export const CONFIG_DEFAULT_NAME = 'settings';
export const WORKSPACE_CONFIG_FOLDER_DEFAULT_NAME = '.vscode';
export const WORKSPACE_CONFIG_DEFAULT_PATH = '.vscode/settings.json';

export const IWorkbenchConfigurationService = createDecorator<IWorkbenchConfigurationService>('configurationService');

export interface IWorkbenchConfigurationService extends IConfigurationService {

	/**
	 * Returns iff the workspace has configuration or not.
	 */
	hasWorkspaceConfiguration(): boolean;

	/**
	 * Override for the IConfigurationService#lookup() method that adds information about workspace settings.
	 */
	lookup<T>(key: string): IWorkbenchConfigurationValue<T>;
}

export interface IWorkbenchConfigurationValue<T> extends IConfigurationValue<T> {
	workspace: T;
}