/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { createDecorator, ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { IConfigurationOverrides } from 'vs/platform/configuration/common/configuration';

export const IConfigurationEditingService = createDecorator<IConfigurationEditingService>('configurationEditingService');

export enum ConfigurationEditingErrorCode {

	/**
	 * Error when trying to write a configuration key that is not registered.
	 */
	ERROR_UNKNOWN_KEY,

	/**
	 * Error when trying to write an invalid folder configuration key to folder settings.
	 */
	ERROR_INVALID_FOLDER_CONFIGURATION,

	/**
	 * Error when trying to write to user target but not supported for provided key.
	 */
	ERROR_INVALID_USER_TARGET,

	/**
	 * Error when trying to write a configuration key to folder target
	 */
	ERROR_INVALID_FOLDER_TARGET,

	/**
	 * Error when trying to write to the workspace configuration without having a workspace opened.
	 */
	ERROR_NO_WORKSPACE_OPENED,

	/**
	 * Error when trying to write and save to the configuration file while it is dirty in the editor.
	 */
	ERROR_CONFIGURATION_FILE_DIRTY,

	/**
	 * Error when trying to write to a configuration file that contains JSON errors.
	 */
	ERROR_INVALID_CONFIGURATION
}

export class ConfigurationEditingError extends Error {
	constructor(message: string, public code: ConfigurationEditingErrorCode) {
		super(message);
	}
}

export enum ConfigurationTarget {

	/**
	 * Targets the user configuration file for writing.
	 */
	USER,

	/**
	 * Targets the workspace configuration file for writing. This only works if a workspace is opened.
	 */
	WORKSPACE,

	/**
	 * Targets the folder configuration file for writing. This only works if a workspace is opened.
	 */
	FOLDER
}

export interface IConfigurationValue {
	key: string;
	value: any;
}

export interface IConfigurationEditingOptions {
	/**
	 * If `true`, do not saves the configuration. Default is `false`.
	 */
	donotSave?: boolean;
	/**
	 * If `true`, do not notifies the error to user by showing the message box. Default is `false`.
	 */
	donotNotifyError?: boolean;
	/**
	 * Scope of configuration to be written into.
	 */
	scopes?: IConfigurationOverrides;
}

export interface IConfigurationEditingService {

	_serviceBrand: ServiceIdentifier<any>;

	/**
	 * Allows to write the configuration value to either the user or workspace configuration file and save it if asked to save.
	 * The returned promise will be in error state in any of the error cases from [ConfigurationEditingErrorCode](#ConfigurationEditingErrorCode)
	 */
	writeConfiguration(target: ConfigurationTarget, value: IConfigurationValue, options?: IConfigurationEditingOptions): TPromise<void>;
}