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
import { Workspace, IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import Event from 'vs/base/common/event';
import { OVERRIDE_PROPERTY_PATTERN } from 'vs/platform/configuration/common/configurationRegistry';

export const IConfigurationService = createDecorator<IConfigurationService>('configurationService');

export interface IConfigurationOverrides {
	overrideIdentifier?: string;
	resource?: URI;
}

export enum ConfigurationTarget {
	DEFAULT = 1,
	USER,
	WORKSPACE,
	WORKSPACE_FOLDER,
	MEMORY
}

export interface IConfigurationChangeEvent {
	keys: string[];
	sections: string[];
	overrideIdentifiers?: string[];

	hasSectionChanged(section: string): boolean;
	hasKeyChanged(key: string): boolean;

	// Following data is used for telemetry
	source: ConfigurationTarget;
	sourceConfig: any;
}

export interface IConfigurationService {
	_serviceBrand: any;

	onDidUpdateConfiguration: Event<IConfigurationChangeEvent>;

	getConfiguration<T>(): T;
	getConfiguration<T>(section: string): T;
	getConfiguration<T>(overrides: IConfigurationOverrides): T;
	getConfiguration<T>(section: string, overrides: IConfigurationOverrides): T;

	getValue<T>(key: string, overrides?: IConfigurationOverrides): T;

	updateValue(key: string, value: any): TPromise<void>;
	updateValue(key: string, value: any, overrides: IConfigurationOverrides): TPromise<void>;
	updateValue(key: string, value: any, target: ConfigurationTarget): TPromise<void>;
	updateValue(key: string, value: any, overrides: IConfigurationOverrides, target: ConfigurationTarget): TPromise<void>;

	reloadConfiguration(): TPromise<void>;
	reloadConfiguration(folder: IWorkspaceFolder): TPromise<void>;

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

export function overrideIdentifierFromKey(key: string): string {
	return key.substring(1, key.length - 1);
}

export function keyFromOverrideIdentifier(overrideIdentifier: string): string {
	return `[${overrideIdentifier}]`;
}

export function toConfigurationUpdateEvent(udpated: string[], source: ConfigurationTarget, sourceConfig: any): IConfigurationChangeEvent {
	const overrideIdentifiers = [];
	const keys: string[] = [];
	for (const key of udpated) {
		if (OVERRIDE_PROPERTY_PATTERN.test(key)) {
			overrideIdentifiers.push(overrideIdentifierFromKey(key).trim());
		} else {
			keys.push(key);
		}
	}
	const sections = arrays.distinct(keys.map(key => key.split('.')[0]));
	const hasSectionChanged = (section) => sections.indexOf(section) !== -1;
	const hasKeyChanged = (key) => keys.indexOf(key) !== -1;

	return { keys, sections, overrideIdentifiers, source, sourceConfig, hasSectionChanged, hasKeyChanged };
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
	keys: string[];
	overrides: IOverrides<T>[];
}

export interface IOverrides<T> {
	contents: T;
	identifiers: string[];
}

export class ConfigurationModel<T> implements IConfiguraionModel<T> {

	constructor(protected _contents: T = <T>{}, protected _keys: string[] = [], protected _overrides: IOverrides<T>[] = []) {
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

export function compare(from: ConfigurationModel<any>, to: ConfigurationModel<any>): { added: string[], removed: string[], updated: string[] } {
	const added = to.keys.filter(key => from.keys.indexOf(key) === -1);
	const removed = from.keys.filter(key => to.keys.indexOf(key) === -1);
	const updated = [];

	for (const key of from.keys) {
		const value1 = getConfigurationValue(from.contents, key);
		const value2 = getConfigurationValue(to.contents, key);
		if (!objects.equals(value1, value2)) {
			updated.push(key);
		}
	}

	return { added, removed, updated };
}

export interface IConfigurationData<T> {
	defaults: IConfiguraionModel<T>;
	user: IConfiguraionModel<T>;
	workspace: IConfiguraionModel<T>;
	folders: { [folder: string]: IConfiguraionModel<T> };
}

export class Configuration<T> {

	private _globalConfiguration: ConfigurationModel<T>;
	private _workspaceConsolidatedConfiguration: ConfigurationModel<T>;
	protected _foldersConsolidatedConfigurations: StrictResourceMap<ConfigurationModel<T>>;

	constructor(protected _defaults: ConfigurationModel<T>, protected _user: ConfigurationModel<T>, protected _workspaceConfiguration: ConfigurationModel<T> = new ConfigurationModel<T>(), protected folders: StrictResourceMap<ConfigurationModel<T>> = new StrictResourceMap<ConfigurationModel<T>>(), protected _workspace?: Workspace) {
		this.merge();
	}

	get defaults(): ConfigurationModel<T> {
		return this._defaults;
	}

	get user(): ConfigurationModel<T> {
		return this._user;
	}

	get workspace(): ConfigurationModel<T> {
		return this._workspaceConfiguration;
	}

	protected merge(): void {
		this._globalConfiguration = new ConfigurationModel<T>().merge(this._defaults).merge(this._user);
		this._workspaceConsolidatedConfiguration = new ConfigurationModel<T>().merge(this._globalConfiguration).merge(this._workspaceConfiguration);
		this._foldersConsolidatedConfigurations = new StrictResourceMap<ConfigurationModel<T>>();
		for (const folder of this.folders.keys()) {
			this.mergeFolder(folder);
		}
	}

	protected mergeFolder(folder: URI) {
		this._foldersConsolidatedConfigurations.set(folder, new ConfigurationModel<T>().merge(this._workspaceConsolidatedConfiguration).merge(this.folders.get(folder)));
	}

	getValue<C>(section: string = '', overrides: IConfigurationOverrides = {}): C {
		const configModel = this.getConsolidateConfigurationModel(overrides);
		return section ? configModel.getContentsFor<C>(section) : configModel.contents;
	}

	getValue2(key: string, overrides: IConfigurationOverrides = {}): any {
		// make sure to clone the configuration so that the receiver does not tamper with the values
		const consolidateConfigurationModel = this.getConsolidateConfigurationModel(overrides);
		return objects.clone(getConfigurationValue<any>(consolidateConfigurationModel.contents, key));
	}

	lookup<C>(key: string, overrides: IConfigurationOverrides = {}): {
		default: C,
		user: C,
		workspace: C,
		workspaceFolder: C
		value: C,
	} {
		// make sure to clone the configuration so that the receiver does not tamper with the values
		const consolidateConfigurationModel = this.getConsolidateConfigurationModel(overrides);
		const folderConfigurationModel = this.getFolderConfigurationModelForResource(overrides.resource);
		return {
			default: objects.clone(getConfigurationValue<C>(overrides.overrideIdentifier ? this._defaults.override(overrides.overrideIdentifier).contents : this._defaults.contents, key)),
			user: objects.clone(getConfigurationValue<C>(overrides.overrideIdentifier ? this._user.override(overrides.overrideIdentifier).contents : this._user.contents, key)),
			workspace: objects.clone(this._workspace ? getConfigurationValue<C>(overrides.overrideIdentifier ? this._workspaceConfiguration.override(overrides.overrideIdentifier).contents : this._workspaceConfiguration.contents, key) : void 0), //Check on workspace exists or not because _workspaceConfiguration is never null
			workspaceFolder: objects.clone(folderConfigurationModel ? getConfigurationValue<C>(overrides.overrideIdentifier ? folderConfigurationModel.override(overrides.overrideIdentifier).contents : folderConfigurationModel.contents, key) : void 0),
			value: objects.clone(getConfigurationValue<C>(consolidateConfigurationModel.contents, key))
		};
	}

	keys(): {
		default: string[];
		user: string[];
		workspace: string[];
		workspaceFolder: string[];
	} {
		const folderConfigurationModel = this.getFolderConfigurationModelForResource();
		return {
			default: this._defaults.keys,
			user: this._user.keys,
			workspace: this._workspaceConfiguration.keys,
			workspaceFolder: folderConfigurationModel ? folderConfigurationModel.keys : []
		};
	}

	private getConsolidateConfigurationModel<C>(overrides: IConfigurationOverrides): ConfigurationModel<any> {
		let configurationModel = this.getConsolidatedConfigurationModelForResource(overrides);
		return overrides.overrideIdentifier ? configurationModel.override<T>(overrides.overrideIdentifier) : configurationModel;
	}

	private getConsolidatedConfigurationModelForResource({ resource }: IConfigurationOverrides): ConfigurationModel<any> {
		if (!this._workspace) {
			return this._globalConfiguration;
		}

		if (!resource) {
			return this._workspaceConsolidatedConfiguration;
		}

		const root = this._workspace.getFolder(resource);
		if (!root) {
			return this._workspaceConsolidatedConfiguration;
		}

		return this._foldersConsolidatedConfigurations.get(root.uri) || this._workspaceConsolidatedConfiguration;
	}

	private getFolderConfigurationModelForResource(resource?: URI): ConfigurationModel<any> {
		if (!this._workspace || !resource) {
			return null;
		}

		const root = this._workspace.getFolder(resource);
		return root ? this.folders.get(root.uri) : null;
	}

	public toData(): IConfigurationData<any> {
		return {
			defaults: {
				contents: this._defaults.contents,
				overrides: this._defaults.overrides,
				keys: this._defaults.keys
			},
			user: {
				contents: this._user.contents,
				overrides: this._user.overrides,
				keys: this._user.keys
			},
			workspace: {
				contents: this._workspaceConfiguration.contents,
				overrides: this._workspaceConfiguration.overrides,
				keys: this._workspaceConfiguration.keys
			},
			folders: this.folders.keys().reduce((result, folder) => {
				const { contents, overrides, keys } = this.folders.get(folder);
				result[folder.toString()] = { contents, overrides, keys };
				return result;
			}, Object.create({}))
		};
	}

	public static parse(data: IConfigurationData<any>, workspace: Workspace): Configuration<any> {
		const defaultConfiguration = Configuration.parseConfigurationModel(data.defaults);
		const userConfiguration = Configuration.parseConfigurationModel(data.user);
		const workspaceConfiguration = Configuration.parseConfigurationModel(data.workspace);
		const folders: StrictResourceMap<ConfigurationModel<any>> = Object.keys(data.folders).reduce((result, key) => {
			result.set(URI.parse(key), Configuration.parseConfigurationModel(data.folders[key]));
			return result;
		}, new StrictResourceMap<ConfigurationModel<any>>());
		return new Configuration<any>(defaultConfiguration, userConfiguration, workspaceConfiguration, folders, workspace);
	}

	private static parseConfigurationModel(model: IConfiguraionModel<any>): ConfigurationModel<any> {
		return new ConfigurationModel(model.contents, model.keys, model.overrides);
	}
}