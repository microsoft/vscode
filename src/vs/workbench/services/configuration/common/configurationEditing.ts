/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {createDecorator, ServiceIdentifier} from 'vs/platform/instantiation/common/instantiation';

export const IConfigurationEditingService = createDecorator<IConfigurationEditingService>('configurationEditingService');

export enum ConfigurationEditingResult {
	OK,
	ERROR_UNKNOWN_KEY,
	ERROR_NO_WORKSPACE_OPENED,
	ERROR_CONFIGURATION_FILE_DIRTY,
	ERROR_INVALID_CONFIGURATION
}

export enum ConfigurationTarget {
	USER,
	WORKSPACE
}

export interface IConfigurationValue {
	key: string;
	value: any;
}

export interface IConfigurationEditingService {

	_serviceBrand: ServiceIdentifier<any>;

	writeConfiguration(target: ConfigurationTarget, values: IConfigurationValue[]): TPromise<ConfigurationEditingResult>;
}