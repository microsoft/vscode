/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import * as arrays from 'vs/base/common/arrays';
import * as types from 'vs/base/common/types';
import * as objects from 'vs/base/common/objects';
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
			if (typeof current !== 'object' || current === null) {
				return undefined;
			}
			current = current[path[i]];
		}
		return <T>current;
	}

	const path = settingPath.split('.');
	const result = accessSetting(config, path);

	return typeof result === 'undefined' ? defaultValue : result;
}

export function merge(base: any, add: any, overwrite: boolean): void {
	Object.keys(add).forEach(key => {
		if (key in base) {
			if (types.isObject(base[key]) && types.isObject(add[key])) {
				merge(base[key], add[key], overwrite);
			} else if (overwrite) {
				base[key] = add[key];
			}
		} else {
			base[key] = add[key];
		}
	});
}

export interface IOverrides<T> {
	contents: T;
	identifiers: string[];
}

export class Configuration<T> {

	protected _keys: string[] = [];

	constructor(protected _contents: T = <T>{}, protected _overrides: IOverrides<T>[] = []) {
	}

	public get contents(): T {
		return this._contents;
	}

	public get keys(): string[] {
		return this._keys;
	}

	public getContentsFor<V>(section: string): V {
		return objects.clone(this.contents[section]);
	}

	public override<V>(identifier: string): Configuration<V> {
		const result = new Configuration<V>();
		const contents = objects.clone<any>(this.contents);
		if (this._overrides) {
			for (const override of this._overrides) {
				if (override.identifiers.indexOf(identifier) !== -1) {
					merge(contents, override.contents, true);
				}
			}
		}
		result._contents = contents;
		return result;
	}

	public merge(other: Configuration<T>, overwrite: boolean = true): Configuration<T> {
		const mergedModel = new Configuration<T>();
		this.doMerge(mergedModel, this, overwrite);
		this.doMerge(mergedModel, other, overwrite);
		return mergedModel;
	}

	protected doMerge(source: Configuration<T>, target: Configuration<T>, overwrite: boolean = true) {
		merge(source.contents, objects.clone(target.contents), overwrite);
		const overrides = objects.clone(source._overrides);
		for (const override of target._overrides) {
			const [sourceOverride] = overrides.filter(o => arrays.equals(o.identifiers, override.identifiers));
			if (sourceOverride) {
				merge(sourceOverride.contents, override.contents, overwrite);
			} else {
				overrides.push(override);
			}
		}
		source._overrides = overrides;
	}
}