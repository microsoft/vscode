/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { createDecorator, ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';

export const IConfigurationEditingService = createDecorator<IConfigurationEditingService>('configurationEditingService');

export enum ConfigurationEditingErrorCode {

	/**
	 * Error when trying to write a configuration key that is not registered.
	 */
	ERROR_UNKNOWN_KEY,

	/**
	 * Error when trying to write to user target but not supported for provided key.
	 */
	ERROR_INVALID_TARGET,

	/**
	 * Error when trying to write to the workspace configuration without having a workspace opened.
	 */
	ERROR_NO_WORKSPACE_OPENED,

	/**
	 * Error when trying to write to the configuration file while it is dirty in the editor.
	 */
	ERROR_CONFIGURATION_FILE_DIRTY,

	/**
	 * Error when trying to write to a configuration file that contains JSON errors.
	 */
	ERROR_INVALID_CONFIGURATION
}

export interface IConfigurationEditingError {
	code: ConfigurationEditingErrorCode;
	message: string;
}

export enum ConfigurationTarget {

	/**
	 * Targets the user configuration file for writing.
	 */
	USER,

	/**
	 * Targets the workspace configuration file for writing. This only works if a workspace is opened.
	 */
	WORKSPACE
}

export interface IConfigurationValue {
	key: string;
	value: any;
	overrideIdentifier?: string;
}

export interface IConfigurationEditingOptions {
	writeToBuffer: boolean;
	autoSave: boolean;
}

export interface IConfigurationEditingService {

	_serviceBrand: ServiceIdentifier<any>;

	/**
	 * Allows to write to either the user or workspace configuration file. The returned promise will be
	 * in error state in any of the error cases from [ConfigurationEditingErrorCode](#ConfigurationEditingErrorCode)
	 */
	writeConfiguration(target: ConfigurationTarget, value: IConfigurationValue, options?: IConfigurationEditingOptions): TPromise<void>;
}