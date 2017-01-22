/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import Event from 'vs/base/common/event';

export const IConfigurationService = createDecorator<IConfigurationService>('configurationService');

export interface IConfigurationOptions {
	overrideIdentifier?: string;
	section?: string;
}

export interface IConfigurationService {
	_serviceBrand: any;

	/**
	 * Fetches the appropriate section of the configuration JSON file.
	 * This will be an object keyed off the section name.
	 */
	getConfiguration<T>(section?: string): T;
	getConfiguration<T>(options?: IConfigurationOptions): T;

	/**
	 * Resolves a configuration key to its values in the different scopes
	 * the setting is defined.
	 */
	lookup<T>(key: string, overrideIdentifier?: string): IConfigurationValue<T>;

	/**
	 * Returns the defined keys of configurations in the different scopes
	 * the key is defined.
	 */
	keys(): IConfigurationKeys;

	/**
	 * Similar to #getConfiguration() but ensures that the latest configuration
	 * from disk is fetched.
	 */
	reloadConfiguration<T>(section?: string): TPromise<T>;

	/**
	 * Event that fires when the configuration changes.
	 */
	onDidUpdateConfiguration: Event<IConfigurationServiceEvent>;
}

export enum ConfigurationSource {
	Default = 1,
	User,
	Workspace
}

export interface IConfigurationServiceEvent {
	/**
	 * The full configuration.
	 */
	config: any;
	/**
	 * The type of source that triggered this event.
	 */
	source: ConfigurationSource;
	/**
	 * The part of the configuration contributed by the source of this event.
	 */
	sourceConfig: any;
}

export interface IConfigurationValue<T> {
	value: T;
	default: T;
	user: T;
}

export interface IConfigurationKeys {
	default: string[];
	user: string[];
}

/**
 * A helper function to get the configuration value with a specific settings path (e.g. config.some.setting)
 */
export function getConfigurationValue<T>(config: any, settingPath: string, defaultValue?: T): T {
	function accessSetting(config: any, path: string[]): any {
		let current = config;
		for (let i = 0; i < path.length; i++) {
			current = current[path[i]];
			if (typeof current === 'undefined' || current === null) {
				return undefined;
			}
		}
		return <T>current;
	}

	const path = settingPath.split('.');
	const result = accessSetting(config, path);

	return typeof result === 'undefined' ? defaultValue : result;
}

export interface IConfigModel<T> {
	contents: T;
	overrides: IOverrides<T>[];
	keys: string[];
	raw: any;
	unfilteredRaw: any;
	errors: any[];

	merge(other: IConfigModel<T>, overwrite?: boolean): IConfigModel<T>;
	config<V>(section: string): IConfigModel<V>;
	configWithOverrides<V>(identifier: string, section?: string): IConfigModel<V>;
	refilter(): void;
	hasActiveFilter(): boolean;
}

export interface IOverrides<T> {
	contents: T;
	identifiers: string[];
}