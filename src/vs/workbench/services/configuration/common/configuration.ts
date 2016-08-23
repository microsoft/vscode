/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {JSONPath} from 'vs/base/common/json';
import {IConfigurationService}  from 'vs/platform/configuration/common/configuration';
import {createDecorator} from 'vs/platform/instantiation/common/instantiation';

export const IWorkbenchConfigurationService = createDecorator<IWorkbenchConfigurationService>('configurationService');

export interface IWorkbenchConfigurationService extends IConfigurationService {

	/**
	 * Returns iff the workspace has configuration or not.
	 */
	hasWorkspaceConfiguration(): boolean;

	/**
	 * Sets a user configuration. An the setting does not yet exist in the settings, it will be
	 * added.
	 */
	setUserConfiguration(key: string | JSONPath, value: any): Thenable<void>;
}