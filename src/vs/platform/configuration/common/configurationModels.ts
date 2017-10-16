/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as json from 'vs/base/common/json';
import { StrictResourceMap } from 'vs/base/common/map';
import * as arrays from 'vs/base/common/arrays';
import * as objects from 'vs/base/common/objects';
import URI from 'vs/base/common/uri';
import { Registry } from 'vs/platform/registry/common/platform';
import { IConfigurationRegistry, Extensions, OVERRIDE_PROPERTY_PATTERN } from 'vs/platform/configuration/common/configurationRegistry';
import { IOverrides, overrideIdentifierFromKey, addToValueTree, toValuesTree, IConfiguraionModel, merge, getConfigurationValue, IConfigurationOverrides, IConfigurationData, getDefaultValues, getConfigurationKeys, IConfigurationChangeEvent, ConfigurationTarget, removeFromValueTree } from 'vs/platform/configuration/common/configuration';
import { Workspace } from 'vs/platform/workspace/common/workspace';

export class ConfigurationModel implements IConfiguraionModel {

	constructor(protected _contents: any = {}, protected _keys: string[] = [], protected _overrides: IOverrides[] = []) {
	}

	public get contents(): any {
		return this._contents;
	}

	public get overrides(): IOverrides[] {
		return this._overrides;
	}

	public get keys(): string[] {
		return this._keys;
	}

	public getSectionContents<V>(section: string): V {
		return this.contents[section];
	}

	public setValue(key: string, value: any) {
		this.addKey(key);
		addToValueTree(this._contents, key, value, e => { throw new Error(e); });
	}

	public removeValue(key: string): void {
		if (this.removeKey(key)) {
			removeFromValueTree(this._contents, key);
		}
	}

	public setValueInOverrides(overrideIdentifier: string, key: string, value: any): void {
		let override = this._overrides.filter(override => override.identifiers.indexOf(overrideIdentifier) !== -1)[0];
		if (!override) {
			override = { identifiers: [overrideIdentifier], contents: {} };
			this._overrides.push(override);
		}
		addToValueTree(override.contents, key, value, e => { throw new Error(e); });
	}

	public override<V>(identifier: string): ConfigurationModel {
		const overrideContents = this.getContentsForOverrideIdentifer(identifier);

		if (!overrideContents || typeof overrideContents !== 'object' || !Object.keys(overrideContents).length) {
			// If there are no valid overrides, use base contents
			return new ConfigurationModel(this._contents);
		}

		let contents = {};
		for (const key of arrays.distinct([...Object.keys(this._contents), ...Object.keys(overrideContents)])) {

			let contentsForKey = this._contents[key];
			let overrideContentsForKey = overrideContents[key];

			// If there are override contents for the key, clone and merge otherwise use base contents
			if (overrideContentsForKey) {
				// Clone and merge only if base contents and override contents are of type object otherwise just override
				if (typeof contentsForKey === 'object' && typeof overrideContentsForKey === 'object') {
					contentsForKey = objects.clone(contentsForKey);
					merge(contentsForKey, overrideContentsForKey, true);
				} else {
					contentsForKey = overrideContentsForKey;
				}
			}

			contents[key] = contentsForKey;
		}
		return new ConfigurationModel(contents);
	}

	public merge(other: ConfigurationModel, overwrite: boolean = true): ConfigurationModel {
		const mergedModel = new ConfigurationModel();
		this.doMerge(mergedModel, this, overwrite);
		this.doMerge(mergedModel, other, overwrite);
		return mergedModel;
	}

	protected doMerge(source: ConfigurationModel, target: ConfigurationModel, overwrite: boolean = true) {
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

	private getContentsForOverrideIdentifer(identifier: string): any {
		for (const override of this._overrides) {
			if (override.identifiers.indexOf(identifier) !== -1) {
				return override.contents;
			}
		}
		return null;
	}

	private addKey(key: string): void {
		let index = this._keys.length;
		for (let i = 0; i < index; i++) {
			if (key.indexOf(this._keys[i]) === 0) {
				index = i;
			}
		}
		this._keys.splice(index, 1, key);
	}

	private removeKey(key: string): boolean {
		let index = this._keys.indexOf(key);
		if (index !== -1) {
			this._keys.splice(index, 1);
			return true;
		}
		return false;
	}
}

export class DefaultConfigurationModel extends ConfigurationModel {

	constructor() {
		super(getDefaultValues());
		this._keys = getConfigurationKeys();
		this._overrides = Object.keys(this._contents)
			.filter(key => OVERRIDE_PROPERTY_PATTERN.test(key))
			.map(key => {
				return <IOverrides>{
					identifiers: [overrideIdentifierFromKey(key).trim()],
					contents: toValuesTree(this._contents[key], message => console.error(`Conflict in default settings file: ${message}`))
				};
			});
	}

	public get keys(): string[] {
		return this._keys;
	}
}

interface Overrides extends IOverrides {
	raw: any;
}

export class CustomConfigurationModel extends ConfigurationModel {

	protected _parseErrors: any[] = [];

	constructor(content: string = '', private name: string = '') {
		super();
		if (content) {
			this.update(content);
		}
	}

	public get errors(): any[] {
		return this._parseErrors;
	}

	public update(content: string): void {
		let parsed: any = {};
		let overrides: Overrides[] = [];
		let currentProperty: string = null;
		let currentParent: any = [];
		let previousParents: any[] = [];
		let parseErrors: json.ParseError[] = [];

		function onValue(value: any) {
			if (Array.isArray(currentParent)) {
				(<any[]>currentParent).push(value);
			} else if (currentProperty) {
				currentParent[currentProperty] = value;
			}
			if (OVERRIDE_PROPERTY_PATTERN.test(currentProperty)) {
				onOverrideSettingsValue(currentProperty, value);
			}
		}

		function onOverrideSettingsValue(property: string, value: any): void {
			overrides.push({
				identifiers: [overrideIdentifierFromKey(property).trim()],
				raw: value,
				contents: null
			});
		}

		let visitor: json.JSONVisitor = {
			onObjectBegin: () => {
				let object = {};
				onValue(object);
				previousParents.push(currentParent);
				currentParent = object;
				currentProperty = null;
			},
			onObjectProperty: (name: string) => {
				currentProperty = name;
			},
			onObjectEnd: () => {
				currentParent = previousParents.pop();
			},
			onArrayBegin: () => {
				let array: any[] = [];
				onValue(array);
				previousParents.push(currentParent);
				currentParent = array;
				currentProperty = null;
			},
			onArrayEnd: () => {
				currentParent = previousParents.pop();
			},
			onLiteralValue: onValue,
			onError: (error: json.ParseErrorCode) => {
				parseErrors.push({ error: error });
			}
		};
		if (content) {
			try {
				json.visit(content, visitor);
				parsed = currentParent[0] || {};
			} catch (e) {
				console.error(`Error while parsing settings file ${this.name}: ${e}`);
				this._parseErrors = [e];
			}
		}
		this.processRaw(parsed);

		const configurationProperties = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurationProperties();
		this._overrides = overrides.map<IOverrides>(override => {
			// Filter unknown and non-overridable properties
			const raw = {};
			for (const key in override.raw) {
				if (configurationProperties[key] && configurationProperties[key].overridable) {
					raw[key] = override.raw[key];
				}
			}
			return {
				identifiers: override.identifiers,
				contents: toValuesTree(raw, message => console.error(`Conflict in settings file ${this.name}: ${message}`))
			};
		});
	}

	protected processRaw(raw: any): void {
		this._contents = toValuesTree(raw, message => console.error(`Conflict in settings file ${this.name}: ${message}`));
		this._keys = Object.keys(raw);
	}
}

export class Configuration {

	private _globalConfiguration: ConfigurationModel;
	private _workspaceConsolidatedConfiguration: ConfigurationModel;
	protected _foldersConsolidatedConfigurations: StrictResourceMap<ConfigurationModel>;

	constructor(protected _defaults: ConfigurationModel,
		protected _user: ConfigurationModel,
		protected _workspaceConfiguration: ConfigurationModel = new ConfigurationModel(),
		protected folders: StrictResourceMap<ConfigurationModel> = new StrictResourceMap<ConfigurationModel>(),
		protected _memoryConfiguration: ConfigurationModel = new ConfigurationModel(),
		protected _memoryConfigurationByResource: StrictResourceMap<ConfigurationModel> = new StrictResourceMap<ConfigurationModel>(),
		protected _workspace?: Workspace) {
		this.merge();
	}

	get defaults(): ConfigurationModel {
		return this._defaults;
	}

	get user(): ConfigurationModel {
		return this._user;
	}

	get workspace(): ConfigurationModel {
		return this._workspaceConfiguration;
	}

	protected merge(): void {
		this._globalConfiguration = this._defaults.merge(this._user);
		this.updateWorkspaceConsolidateConfiguration();
		this._foldersConsolidatedConfigurations = new StrictResourceMap<ConfigurationModel>();
		for (const folder of this.folders.keys()) {
			this.mergeFolder(folder);
		}
	}

	private updateWorkspaceConsolidateConfiguration() {
		this._workspaceConsolidatedConfiguration = this._globalConfiguration.merge(this._workspaceConfiguration).merge(this._memoryConfiguration);
	}

	protected mergeFolder(folder: URI) {
		this._foldersConsolidatedConfigurations.set(folder, this._workspaceConsolidatedConfiguration.merge(this.folders.get(folder)));
	}

	getSection<C>(section: string = '', overrides: IConfigurationOverrides = {}): C {
		const configModel = this.getConsolidateConfigurationModel(overrides);
		return Object.freeze(section ? configModel.getSectionContents<C>(section) : configModel.contents);
	}

	getValue(key: string, overrides: IConfigurationOverrides = {}): any {
		const consolidateConfigurationModel = this.getConsolidateConfigurationModel(overrides);
		return Object.freeze(getConfigurationValue<any>(consolidateConfigurationModel.contents, key));
	}

	updateValue(key: string, value: any, overrides: IConfigurationOverrides = {}): void {
		let memoryConfiguration: ConfigurationModel;
		if (overrides.resource) {
			memoryConfiguration = this._memoryConfigurationByResource.get(overrides.resource);
			if (!memoryConfiguration) {
				memoryConfiguration = new ConfigurationModel();
				this._memoryConfigurationByResource.set(overrides.resource, memoryConfiguration);
			}
		} else {
			memoryConfiguration = this._memoryConfiguration;
		}

		if (value === void 0) {
			memoryConfiguration.removeValue(key);
		} else {
			memoryConfiguration.setValue(key, value);
		}

		if (!overrides.resource) {
			this.updateWorkspaceConsolidateConfiguration();
		}
	}

	lookup<C>(key: string, overrides: IConfigurationOverrides = {}): {
		default: C,
		user: C,
		workspace: C,
		workspaceFolder: C
		memory?: C
		value: C,
	} {
		const consolidateConfigurationModel = this.getConsolidateConfigurationModel(overrides);
		const folderConfigurationModel = this.getFolderConfigurationModelForResource(overrides.resource);
		const memoryConfigurationModel = overrides.resource ? this._memoryConfigurationByResource.get(overrides.resource) || this._memoryConfiguration : this._memoryConfiguration;
		return Object.freeze({
			default: getConfigurationValue<C>(overrides.overrideIdentifier ? this._defaults.override(overrides.overrideIdentifier).contents : this._defaults.contents, key),
			user: getConfigurationValue<C>(overrides.overrideIdentifier ? this._user.override(overrides.overrideIdentifier).contents : this._user.contents, key),
			workspace: this._workspace ? getConfigurationValue<C>(overrides.overrideIdentifier ? this._workspaceConfiguration.override(overrides.overrideIdentifier).contents : this._workspaceConfiguration.contents, key) : void 0, //Check on workspace exists or not because _workspaceConfiguration is never null
			workspaceFolder: folderConfigurationModel ? getConfigurationValue<C>(overrides.overrideIdentifier ? folderConfigurationModel.override(overrides.overrideIdentifier).contents : folderConfigurationModel.contents, key) : void 0,
			memory: getConfigurationValue<C>(overrides.overrideIdentifier ? memoryConfigurationModel.override(overrides.overrideIdentifier).contents : memoryConfigurationModel.contents, key),
			value: getConfigurationValue<C>(consolidateConfigurationModel.contents, key)
		});
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

	private getConsolidateConfigurationModel<C>(overrides: IConfigurationOverrides): ConfigurationModel {
		let configurationModel = this.getConsolidatedConfigurationModelForResource(overrides);
		return overrides.overrideIdentifier ? configurationModel.override(overrides.overrideIdentifier) : configurationModel;
	}

	private getConsolidatedConfigurationModelForResource({ resource }: IConfigurationOverrides): ConfigurationModel {
		if (!this._workspace) {
			return this._globalConfiguration;
		}

		if (!resource) {
			return this._workspaceConsolidatedConfiguration;
		}

		let consolidateConfiguration = this._workspaceConsolidatedConfiguration;
		const root = this._workspace.getFolder(resource);
		if (root) {
			consolidateConfiguration = this._foldersConsolidatedConfigurations.get(root.uri) || this._workspaceConsolidatedConfiguration;
		}

		const memoryConfigurationForResource = this._memoryConfigurationByResource.get(resource);
		if (memoryConfigurationForResource) {
			consolidateConfiguration = consolidateConfiguration.merge(memoryConfigurationForResource);
		}

		return consolidateConfiguration;
	}

	private getFolderConfigurationModelForResource(resource?: URI): ConfigurationModel {
		if (!this._workspace || !resource) {
			return null;
		}

		const root = this._workspace.getFolder(resource);
		return root ? this.folders.get(root.uri) : null;
	}

	public toData(): IConfigurationData {
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

	public static parse(data: IConfigurationData, workspace: Workspace): Configuration {
		const defaultConfiguration = Configuration.parseConfigurationModel(data.defaults);
		const userConfiguration = Configuration.parseConfigurationModel(data.user);
		const workspaceConfiguration = Configuration.parseConfigurationModel(data.workspace);
		const folders: StrictResourceMap<ConfigurationModel> = Object.keys(data.folders).reduce((result, key) => {
			result.set(URI.parse(key), Configuration.parseConfigurationModel(data.folders[key]));
			return result;
		}, new StrictResourceMap<ConfigurationModel>());
		return new Configuration(defaultConfiguration, userConfiguration, workspaceConfiguration, folders, new ConfigurationModel(), new StrictResourceMap<ConfigurationModel>(), workspace);
	}

	private static parseConfigurationModel(model: IConfiguraionModel): ConfigurationModel {
		return new ConfigurationModel(model.contents, model.keys, model.overrides);
	}
}

export class AbstractConfigurationChangeEvent {

	protected doesConfigurationContains(configuration: ConfigurationModel, config: string): boolean {
		let changedKeysTree = configuration.contents;
		let requestedTree = toValuesTree({ [config]: true }, () => { });

		let key;
		while (typeof requestedTree === 'object' && (key = Object.keys(requestedTree)[0])) { // Only one key should present, since we added only one property
			changedKeysTree = changedKeysTree[key];
			if (!changedKeysTree) {
				return false; // Requested tree is not found
			}
			requestedTree = requestedTree[key];
		}
		return true;
	}

	protected updateKeys(configuration: ConfigurationModel, keys: string[], resource?: URI): void {
		for (const key of keys) {
			configuration.setValue(key, true);
		}
	}
}

export class AllKeysConfigurationChangeEvent extends AbstractConfigurationChangeEvent implements IConfigurationChangeEvent {

	private changedConfiguration: ConfigurationModel = null;

	constructor(readonly affectedKeys: string[], readonly source: ConfigurationTarget, readonly sourceConfig: any) { super(); }

	affectsConfiguration(config: string, resource?: URI): boolean {
		if (!this.changedConfiguration) {
			this.changedConfiguration = new ConfigurationModel();
			this.updateKeys(this.changedConfiguration, this.affectedKeys);
		}
		return this.doesConfigurationContains(this.changedConfiguration, config);
	}

}

export class ConfigurationChangeEvent extends AbstractConfigurationChangeEvent implements IConfigurationChangeEvent {

	private changedConfiguration: ConfigurationModel = new ConfigurationModel();
	private changedConfigurationByResource: StrictResourceMap<ConfigurationModel> = new StrictResourceMap<ConfigurationModel>();
	private resources: URI[] = [];

	private _source: ConfigurationTarget;
	private _sourceConfig: any;

	change(event: ConfigurationChangeEvent): ConfigurationChangeEvent
	change(keys: string[], resource?: URI): ConfigurationChangeEvent
	change(arg1: any, arg2?: any): ConfigurationChangeEvent {
		if (arg1 instanceof ConfigurationChangeEvent) {
			this.changedConfiguration = this.changedConfiguration.merge(arg1.changedConfiguration);
			for (const resource of arg1.resources) {
				let changedConfigurationByResource = this.getOrSetChangedConfigurationForResource(resource);
				changedConfigurationByResource = changedConfigurationByResource.merge(arg1.changedConfigurationByResource.get(resource));
				this.changedConfigurationByResource.set(resource, changedConfigurationByResource);
			}
		}
		this.changeWithKeys(arg1, arg2);
		return this;
	}

	telemetryData(source: ConfigurationTarget, sourceConfig: any): ConfigurationChangeEvent {
		this._source = source;
		this._sourceConfig = sourceConfig;
		return this;
	}

	get affectedKeys(): string[] {
		const keys = [...this.changedConfiguration.keys];
		this.changedConfigurationByResource.forEach(model => keys.push(...model.keys));
		return keys;
	}

	get source(): ConfigurationTarget {
		return this._source;
	}

	get sourceConfig(): any {
		return this._sourceConfig;
	}

	affectsConfiguration(config: string, resource?: URI): boolean {
		let configurationModelsToSearch: ConfigurationModel[] = [this.changedConfiguration];

		if (resource) {
			let model = this.changedConfigurationByResource.get(resource);
			if (model) {
				configurationModelsToSearch.push(model);
			}
		} else {
			configurationModelsToSearch.push(...this.changedConfigurationByResource.values());
		}

		for (const configuration of configurationModelsToSearch) {
			if (this.doesConfigurationContains(configuration, config)) {
				return true;
			}
		}

		return false;
	}

	private changeWithKeys(keys: string[], resource?: URI): void {
		let changedConfiguration = resource ? this.getOrSetChangedConfigurationForResource(resource) : this.changedConfiguration;
		this.updateKeys(changedConfiguration, keys);
	}

	private getOrSetChangedConfigurationForResource(resource: URI): ConfigurationModel {
		let changedConfigurationByResource = this.changedConfigurationByResource.get(resource);
		if (!changedConfigurationByResource) {
			changedConfigurationByResource = new ConfigurationModel();
			this.changedConfigurationByResource.set(resource, changedConfigurationByResource);
			this.resources.push(resource);
		}
		return changedConfigurationByResource;
	}
}