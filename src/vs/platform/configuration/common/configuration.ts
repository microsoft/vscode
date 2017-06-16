/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import * as arrays from 'vs/base/common/arrays';
import * as types from 'vs/base/common/types';
import * as objects from 'vs/base/common/objects';
import URI from 'vs/base/common/uri';
import { StrictResourceMap } from 'vs/base/common/map';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import Event from 'vs/base/common/event';

export const IConfigurationService = createDecorator<IConfigurationService>('configurationService');

export interface IConfigurationOverrides {
	language?: string;
	resource?: URI;
}

export type IConfigurationValues = { [key: string]: IConfigurationValue<any> };

export interface IConfigurationService {
	_serviceBrand: any;

	getConfigurationData<T>(): IConfigurationData<T>;

	/**
	 * Fetches the appropriate section of the configuration JSON file.
	 * This will be an object keyed off the section name.
	 */
	getConfiguration<T>(section?: string, overrides?: IConfigurationOverrides): T;

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

	/**
	 * Returns the defined values of configurations in the different scopes.
	 */
	values(): IConfigurationValues;
}

export enum ConfigurationSource {
	Default = 1,
	User,
	Workspace
}

export interface IConfigurationServiceEvent {
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
	workspace: T;
}

export interface IConfigurationKeys {
	default: string[];
	user: string[];
	workspace: string[];
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

export interface IConfiguraionModel<T> {
	contents: T;
	overrides: IOverrides<T>[];
}

export interface IOverrides<T> {
	contents: T;
	identifiers: string[];
}

export class ConfigurationModel<T> implements IConfiguraionModel<T> {

	protected _keys: string[] = [];

	constructor(protected _contents: T = <T>{}, protected _overrides: IOverrides<T>[] = []) {
	}

	public get contents(): T {
		return this._contents;
	}

	public get overrides(): IOverrides<T>[] {
		return this._overrides;
	}

	public get keys(): string[] {
		return this._keys;
	}

	public getContentsFor<V>(section: string): V {
		return objects.clone(this.contents[section]);
	}

	public override<V>(identifier: string): ConfigurationModel<V> {
		const result = new ConfigurationModel<V>();
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

	public merge(other: ConfigurationModel<T>, overwrite: boolean = true): ConfigurationModel<T> {
		const mergedModel = new ConfigurationModel<T>();
		this.doMerge(mergedModel, this, overwrite);
		this.doMerge(mergedModel, other, overwrite);
		return mergedModel;
	}

	protected doMerge(source: ConfigurationModel<T>, target: ConfigurationModel<T>, overwrite: boolean = true) {
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

export interface IConfigurationData<T> {
	defaults: IConfiguraionModel<T>;
	user: IConfiguraionModel<T>;
	folders: { [folder: string]: IConfiguraionModel<T> };
	workspaceUri: string;
}

export class Configuration<T> {

	private _global: ConfigurationModel<T>;
	private _workspace: ConfigurationModel<T>;
	protected _foldersConsolidated: StrictResourceMap<ConfigurationModel<T>>;

	constructor(protected _defaults: ConfigurationModel<T>, protected _user: ConfigurationModel<T>, protected folders: StrictResourceMap<ConfigurationModel<T>> = new StrictResourceMap<ConfigurationModel<T>>(), protected workspaceUri?: URI) {
		this.merge();
	}

	get defaults(): ConfigurationModel<T> {
		return this._defaults;
	}

	get user(): ConfigurationModel<T> {
		return this._user;
	}

	get workspace(): ConfigurationModel<T> {
		return this._workspace;
	}

	protected merge(): void {
		this._global = this._workspace = new ConfigurationModel<T>().merge(this._defaults).merge(this._user);
		this._foldersConsolidated = new StrictResourceMap<ConfigurationModel<T>>();
		for (const folder of this.folders.keys()) {
			this.mergeFolder(folder);
		}
	}

	protected mergeFolder(folder: URI) {
		if (this.workspaceUri && this.workspaceUri.fsPath === folder.fsPath) {
			this._workspace = new ConfigurationModel<T>().merge(this._global).merge(this.folders.get(this.workspaceUri));
			this._foldersConsolidated.set(folder, this._workspace);
		} else {
			this._foldersConsolidated.set(folder, new ConfigurationModel<T>().merge(this._workspace).merge(this.folders.get(folder)));
		}
	}

	getValue<C>(section: string = '', overrides: IConfigurationOverrides = {}): C {
		const configModel = this.getConfigurationModel(overrides);
		return section ? configModel.getContentsFor<C>(section) : configModel.contents;
	}

	lookup<C>(key: string, overrideIdentifier?: string): IConfigurationValue<C> {
		// make sure to clone the configuration so that the receiver does not tamper with the values
		return {
			default: objects.clone(getConfigurationValue<C>(overrideIdentifier ? this._defaults.override(overrideIdentifier).contents : this._defaults.contents, key)),
			user: objects.clone(getConfigurationValue<C>(overrideIdentifier ? this._user.override(overrideIdentifier).contents : this._user.contents, key)),
			workspace: objects.clone(this.workspaceUri ? getConfigurationValue<C>(overrideIdentifier ? this.folders.get(this.workspaceUri).override(overrideIdentifier).contents : this.folders.get(this.workspaceUri).contents, key) : void 0),
			value: objects.clone(getConfigurationValue<C>(overrideIdentifier ? this._workspace.override(overrideIdentifier).contents : this._workspace.contents, key))
		};
	}

	keys(): IConfigurationKeys {
		return {
			default: this._defaults.keys,
			user: this._user.keys,
			workspace: this.workspaceUri ? this.folders.get(this.workspaceUri).keys : []
		};
	}

	values(): IConfigurationValues {
		const result = Object.create(null);
		const keyset = this.keys();
		const keys = [...keyset.workspace, ...keyset.user, ...keyset.default].sort();

		let lastKey: string;
		for (const key of keys) {
			if (key !== lastKey) {
				lastKey = key;
				result[key] = this.lookup(key);
			}
		}

		return result;
	}

	values2(): Map<string, IConfigurationValue<T>> {
		const result: Map<string, IConfigurationValue<T>> = new Map<string, IConfigurationValue<T>>();
		const keyset = this.keys();
		const keys = [...keyset.workspace, ...keyset.user, ...keyset.default].sort();

		let lastKey: string;
		for (const key of keys) {
			if (key !== lastKey) {
				lastKey = key;
				result.set(key, this.lookup<T>(key));
			}
		}

		return result;
	}

	private getConfigurationModel<C>(overrides: IConfigurationOverrides): ConfigurationModel<any> {
		let configurationModel = overrides.resource ? this._foldersConsolidated.get(overrides.resource) || this._workspace : this._workspace;
		return overrides.language ? configurationModel.override<T>(overrides.language) : configurationModel;
	}

	public toData(): IConfigurationData<any> {
		return {
			defaults: {
				contents: this._defaults.contents,
				overrides: this._defaults.overrides
			},
			user: {
				contents: this._user.contents,
				overrides: this._user.overrides
			},
			folders: this.folders.keys().reduce((result, folder) => {
				const { contents, overrides } = this.folders.get(folder);
				result[folder.toString()] = { contents, overrides };
				return result;
			}, Object.create({})),
			workspaceUri: this.workspaceUri ? this.workspaceUri.toString() : void 0
		};
	}

	public static parse(data: IConfigurationData<any>): Configuration<any> {
		const defaults = Configuration.parseConfigurationModel(data.defaults);
		const user = Configuration.parseConfigurationModel(data.user);
		const folders: StrictResourceMap<ConfigurationModel<any>> = Object.keys(data.folders).reduce((result, key) => {
			result.set(URI.parse(key), Configuration.parseConfigurationModel(data.folders[key]));
			return result;
		}, new StrictResourceMap<ConfigurationModel<any>>());
		const workspaceUri = data.workspaceUri ? URI.parse(data.workspaceUri) : void 0;
		return new Configuration<any>(defaults, user, folders, workspaceUri);
	}

	private static parseConfigurationModel(model: IConfiguraionModel<any>): ConfigurationModel<any> {
		return new ConfigurationModel(model.contents, model.overrides);
	}
}