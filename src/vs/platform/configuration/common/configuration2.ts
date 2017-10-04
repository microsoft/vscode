/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import Event from 'vs/base/common/event';

export const IConfigurationService = createDecorator<IConfigurationService>('configurationService');

export interface IConfigurationOverrides {
	overrideIdentifier?: string;
	resource?: URI;
}

export enum ConfigurationTarget {
	USER,
	WORKSPACE,
	WORKSPACE_FOLDER,
	MEMORY
}

export interface IConfigurationServiceEvent {
	sections: string[];
	keys: string[];
}

export interface IConfiguration {
	readonly [key: string]: any;
}

export interface IConfigurationService {
	_serviceBrand: any;

	onDidUpdateConfiguration: Event<IConfigurationServiceEvent>;

	getConfiguration<T extends IConfiguration>(): T;
	getConfiguration<T extends IConfiguration>(section: string): T;
	getConfiguration<T extends IConfiguration>(overrides: IConfigurationOverrides): T;
	getConfiguration<T extends IConfiguration>(section: string, overrides: IConfigurationOverrides): T;

	updateConfiguration(key: string, value: any): TPromise<void>;
	updateConfiguration(key: string, value: any, overrides: IConfigurationOverrides): TPromise<void>;
	updateConfiguration(key: string, value: any, target: ConfigurationTarget): TPromise<void>;
	updateConfiguration(key: string, value: any, overrides: IConfigurationOverrides, target: ConfigurationTarget): TPromise<void>;

	inspect<T>(key: string): {
		default: T,
		user: T,
		workspace: T,
		workspaceFolder: T
		value: T,
	};

	keys(): {
		default: string[];
		user: string[];
		workspace: string[];
		workspaceFolder: string[];
	};
}