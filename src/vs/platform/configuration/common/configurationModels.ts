/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as arrays from 'vs/base/common/arrays';
import { IStringDictionary } from 'vs/base/common/collections';
import { Emitter, Event } from 'vs/base/common/event';
import * as json from 'vs/base/common/json';
import { Disposable } from 'vs/base/common/lifecycle';
import { getOrSet, ResourceMap } from 'vs/base/common/map';
import * as objects from 'vs/base/common/objects';
import { IExtUri } from 'vs/base/common/resources';
import * as types from 'vs/base/common/types';
import { URI, UriComponents } from 'vs/base/common/uri';
import { addToValueTree, ConfigurationTarget, getConfigurationValue, IConfigurationChange, IConfigurationChangeEvent, IConfigurationCompareResult, IConfigurationData, IConfigurationModel, IConfigurationOverrides, IConfigurationUpdateOverrides, IConfigurationValue, IOverrides, removeFromValueTree, toValuesTree } from 'vs/platform/configuration/common/configuration';
import { ConfigurationScope, Extensions, IConfigurationPropertySchema, IConfigurationRegistry, overrideIdentifiersFromKey, OVERRIDE_PROPERTY_REGEX } from 'vs/platform/configuration/common/configurationRegistry';
import { FileOperation, IFileService } from 'vs/platform/files/common/files';
import { Registry } from 'vs/platform/registry/common/platform';
import { Workspace } from 'vs/platform/workspace/common/workspace';

export class ConfigurationModel implements IConfigurationModel {

	private frozen: boolean = false;
	private readonly overrideConfigurations = new Map<string, ConfigurationModel>();

	constructor(
		private readonly _contents: any = {},
		private readonly _keys: string[] = [],
		private readonly _overrides: IOverrides[] = []
	) {
	}

	get contents(): any {
		return this.checkAndFreeze(this._contents);
	}

	get overrides(): IOverrides[] {
		return this.checkAndFreeze(this._overrides);
	}

	get keys(): string[] {
		return this.checkAndFreeze(this._keys);
	}

	isEmpty(): boolean {
		return this._keys.length === 0 && Object.keys(this._contents).length === 0 && this._overrides.length === 0;
	}

	isFrozen(): boolean {
		return this.frozen;
	}

	getValue<V>(section: string | undefined): V {
		return section ? getConfigurationValue<any>(this.contents, section) : this.contents;
	}

	getOverrideValue<V>(section: string | undefined, overrideIdentifier: string): V | undefined {
		const overrideContents = this.getContentsForOverrideIdentifer(overrideIdentifier);
		return overrideContents
			? section ? getConfigurationValue<any>(overrideContents, section) : overrideContents
			: undefined;
	}

	getKeysForOverrideIdentifier(identifier: string): string[] {
		const keys: string[] = [];
		for (const override of this.overrides) {
			if (override.identifiers.includes(identifier)) {
				keys.push(...override.keys);
			}
		}
		return arrays.distinct(keys);
	}

	getAllOverrideIdentifiers(): string[] {
		const result: string[] = [];
		for (const override of this.overrides) {
			result.push(...override.identifiers);
		}
		return arrays.distinct(result);
	}

	override(identifier: string): ConfigurationModel {
		let overrideConfigurationModel = this.overrideConfigurations.get(identifier);
		if (!overrideConfigurationModel) {
			overrideConfigurationModel = this.createOverrideConfigurationModel(identifier);
			this.overrideConfigurations.set(identifier, overrideConfigurationModel);
		}
		return overrideConfigurationModel;
	}

	merge(...others: ConfigurationModel[]): ConfigurationModel {
		const contents = objects.deepClone(this.contents);
		const overrides = objects.deepClone(this.overrides);
		const keys = [...this.keys];

		for (const other of others) {
			if (other.isEmpty()) {
				continue;
			}
			this.mergeContents(contents, other.contents);

			for (const otherOverride of other.overrides) {
				const [override] = overrides.filter(o => arrays.equals(o.identifiers, otherOverride.identifiers));
				if (override) {
					this.mergeContents(override.contents, otherOverride.contents);
					override.keys.push(...otherOverride.keys);
					override.keys = arrays.distinct(override.keys);
				} else {
					overrides.push(objects.deepClone(otherOverride));
				}
			}
			for (const key of other.keys) {
				if (keys.indexOf(key) === -1) {
					keys.push(key);
				}
			}
		}
		return new ConfigurationModel(contents, keys, overrides);
	}

	freeze(): ConfigurationModel {
		this.frozen = true;
		return this;
	}

	clone(): ConfigurationModel {
		return new ConfigurationModel(objects.deepClone(this.contents), [...this.keys], objects.deepClone(this.overrides));
	}

	private createOverrideConfigurationModel(identifier: string): ConfigurationModel {
		const overrideContents = this.getContentsForOverrideIdentifer(identifier);

		if (!overrideContents || typeof overrideContents !== 'object' || !Object.keys(overrideContents).length) {
			// If there are no valid overrides, return self
			return this;
		}

		const contents: any = {};
		for (const key of arrays.distinct([...Object.keys(this.contents), ...Object.keys(overrideContents)])) {

			let contentsForKey = this.contents[key];
			const overrideContentsForKey = overrideContents[key];

			// If there are override contents for the key, clone and merge otherwise use base contents
			if (overrideContentsForKey) {
				// Clone and merge only if base contents and override contents are of type object otherwise just override
				if (typeof contentsForKey === 'object' && typeof overrideContentsForKey === 'object') {
					contentsForKey = objects.deepClone(contentsForKey);
					this.mergeContents(contentsForKey, overrideContentsForKey);
				} else {
					contentsForKey = overrideContentsForKey;
				}
			}

			contents[key] = contentsForKey;
		}

		return new ConfigurationModel(contents, this.keys, this.overrides);
	}

	private mergeContents(source: any, target: any): void {
		for (const key of Object.keys(target)) {
			if (key in source) {
				if (types.isObject(source[key]) && types.isObject(target[key])) {
					this.mergeContents(source[key], target[key]);
					continue;
				}
			}
			source[key] = objects.deepClone(target[key]);
		}
	}

	private checkAndFreeze<T>(data: T): T {
		if (this.frozen && !Object.isFrozen(data)) {
			return objects.deepFreeze(data);
		}
		return data;
	}

	private getContentsForOverrideIdentifer(identifier: string): any {
		let contentsForIdentifierOnly: IStringDictionary<any> | null = null;
		let contents: IStringDictionary<any> | null = null;
		const mergeContents = (contentsToMerge: any) => {
			if (contentsToMerge) {
				if (contents) {
					this.mergeContents(contents, contentsToMerge);
				} else {
					contents = objects.deepClone(contentsToMerge);
				}
			}
		};
		for (const override of this.overrides) {
			if (arrays.equals(override.identifiers, [identifier])) {
				contentsForIdentifierOnly = override.contents;
			} else if (override.identifiers.includes(identifier)) {
				mergeContents(override.contents);
			}
		}
		// Merge contents of the identifier only at the end to take precedence.
		mergeContents(contentsForIdentifierOnly);
		return contents;
	}

	toJSON(): IConfigurationModel {
		return {
			contents: this.contents,
			overrides: this.overrides,
			keys: this.keys
		};
	}

	// Update methods

	public setValue(key: string, value: any) {
		this.addKey(key);
		addToValueTree(this.contents, key, value, e => { throw new Error(e); });
	}

	public removeValue(key: string): void {
		if (this.removeKey(key)) {
			removeFromValueTree(this.contents, key);
		}
	}

	private addKey(key: string): void {
		let index = this.keys.length;
		for (let i = 0; i < index; i++) {
			if (key.indexOf(this.keys[i]) === 0) {
				index = i;
			}
		}
		this.keys.splice(index, 1, key);
	}

	private removeKey(key: string): boolean {
		const index = this.keys.indexOf(key);
		if (index !== -1) {
			this.keys.splice(index, 1);
			return true;
		}
		return false;
	}
}

export interface ConfigurationParseOptions {
	scopes: ConfigurationScope[] | undefined;
	skipRestricted?: boolean;
}

export class ConfigurationModelParser {

	private _raw: any = null;
	private _configurationModel: ConfigurationModel | null = null;
	private _restrictedConfigurations: string[] = [];
	private _parseErrors: any[] = [];

	constructor(protected readonly _name: string) { }

	get configurationModel(): ConfigurationModel {
		return this._configurationModel || new ConfigurationModel();
	}

	get restrictedConfigurations(): string[] {
		return this._restrictedConfigurations;
	}

	get errors(): any[] {
		return this._parseErrors;
	}

	public parse(content: string | null | undefined, options?: ConfigurationParseOptions): void {
		if (!types.isUndefinedOrNull(content)) {
			const raw = this.doParseContent(content);
			this.parseRaw(raw, options);
		}
	}

	public reparse(options: ConfigurationParseOptions): void {
		if (this._raw) {
			this.parseRaw(this._raw, options);
		}
	}

	public parseRaw(raw: any, options?: ConfigurationParseOptions): void {
		this._raw = raw;
		const { contents, keys, overrides, restricted } = this.doParseRaw(raw, options);
		this._configurationModel = new ConfigurationModel(contents, keys, overrides);
		this._restrictedConfigurations = restricted || [];
	}

	private doParseContent(content: string): any {
		let raw: any = {};
		let currentProperty: string | null = null;
		let currentParent: any = [];
		const previousParents: any[] = [];
		const parseErrors: json.ParseError[] = [];

		function onValue(value: any) {
			if (Array.isArray(currentParent)) {
				(<any[]>currentParent).push(value);
			} else if (currentProperty !== null) {
				currentParent[currentProperty] = value;
			}
		}

		const visitor: json.JSONVisitor = {
			onObjectBegin: () => {
				const object = {};
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
				const array: any[] = [];
				onValue(array);
				previousParents.push(currentParent);
				currentParent = array;
				currentProperty = null;
			},
			onArrayEnd: () => {
				currentParent = previousParents.pop();
			},
			onLiteralValue: onValue,
			onError: (error: json.ParseErrorCode, offset: number, length: number) => {
				parseErrors.push({ error, offset, length });
			}
		};
		if (content) {
			try {
				json.visit(content, visitor);
				raw = currentParent[0] || {};
			} catch (e) {
				console.error(`Error while parsing settings file ${this._name}: ${e}`);
				this._parseErrors = [e];
			}
		}

		return raw;
	}

	protected doParseRaw(raw: any, options?: ConfigurationParseOptions): IConfigurationModel & { restricted?: string[] } {
		const configurationProperties = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurationProperties();
		const filtered = this.filter(raw, configurationProperties, true, options);
		raw = filtered.raw;
		const contents = toValuesTree(raw, message => console.error(`Conflict in settings file ${this._name}: ${message}`));
		const keys = Object.keys(raw);
		const overrides = this.toOverrides(raw, message => console.error(`Conflict in settings file ${this._name}: ${message}`));
		return { contents, keys, overrides, restricted: filtered.restricted };
	}

	private filter(properties: any, configurationProperties: { [qualifiedKey: string]: IConfigurationPropertySchema | undefined }, filterOverriddenProperties: boolean, options?: ConfigurationParseOptions): { raw: {}; restricted: string[] } {
		if (!options?.scopes && !options?.skipRestricted) {
			return { raw: properties, restricted: [] };
		}
		const raw: any = {};
		const restricted: string[] = [];
		for (const key in properties) {
			if (OVERRIDE_PROPERTY_REGEX.test(key) && filterOverriddenProperties) {
				const result = this.filter(properties[key], configurationProperties, false, options);
				raw[key] = result.raw;
				restricted.push(...result.restricted);
			} else {
				const propertySchema = configurationProperties[key];
				const scope = propertySchema ? typeof propertySchema.scope !== 'undefined' ? propertySchema.scope : ConfigurationScope.WINDOW : undefined;
				if (propertySchema?.restricted) {
					restricted.push(key);
				}
				// Load unregistered configurations always.
				if (scope === undefined || options.scopes === undefined || options.scopes.includes(scope)) {
					if (!(options.skipRestricted && propertySchema?.restricted)) {
						raw[key] = properties[key];
					}
				}
			}
		}
		return { raw, restricted };
	}

	private toOverrides(raw: any, conflictReporter: (message: string) => void): IOverrides[] {
		const overrides: IOverrides[] = [];
		for (const key of Object.keys(raw)) {
			if (OVERRIDE_PROPERTY_REGEX.test(key)) {
				const overrideRaw: any = {};
				for (const keyInOverrideRaw in raw[key]) {
					overrideRaw[keyInOverrideRaw] = raw[key][keyInOverrideRaw];
				}
				overrides.push({
					identifiers: overrideIdentifiersFromKey(key),
					keys: Object.keys(overrideRaw),
					contents: toValuesTree(overrideRaw, conflictReporter)
				});
			}
		}
		return overrides;
	}

}

export class UserSettings extends Disposable {

	private readonly parser: ConfigurationModelParser;
	private readonly parseOptions: ConfigurationParseOptions;
	protected readonly _onDidChange: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	constructor(
		private readonly userSettingsResource: URI,
		private readonly scopes: ConfigurationScope[] | undefined,
		extUri: IExtUri,
		private readonly fileService: IFileService
	) {
		super();
		this.parser = new ConfigurationModelParser(this.userSettingsResource.toString());
		this.parseOptions = { scopes: this.scopes };
		this._register(this.fileService.watch(extUri.dirname(this.userSettingsResource)));
		// Also listen to the resource incase the resource is a symlink - https://github.com/microsoft/vscode/issues/118134
		this._register(this.fileService.watch(this.userSettingsResource));
		this._register(Event.any(
			Event.filter(this.fileService.onDidFilesChange, e => e.contains(this.userSettingsResource)),
			Event.filter(this.fileService.onDidRunOperation, e => (e.isOperation(FileOperation.CREATE) || e.isOperation(FileOperation.COPY) || e.isOperation(FileOperation.DELETE) || e.isOperation(FileOperation.WRITE)) && extUri.isEqual(e.resource, userSettingsResource))
		)(() => this._onDidChange.fire()));
	}

	async loadConfiguration(): Promise<ConfigurationModel> {
		try {
			const content = await this.fileService.readFile(this.userSettingsResource);
			this.parser.parse(content.value.toString() || '{}', this.parseOptions);
			return this.parser.configurationModel;
		} catch (e) {
			return new ConfigurationModel();
		}
	}

	reparse(): ConfigurationModel {
		this.parser.reparse(this.parseOptions);
		return this.parser.configurationModel;
	}

	getRestrictedSettings(): string[] {
		return this.parser.restrictedConfigurations;
	}
}


export class Configuration {

	private _workspaceConsolidatedConfiguration: ConfigurationModel | null = null;
	private _foldersConsolidatedConfigurations: ResourceMap<ConfigurationModel> = new ResourceMap<ConfigurationModel>();

	constructor(
		private _defaultConfiguration: ConfigurationModel,
		private _policyConfiguration: ConfigurationModel,
		private _applicationConfiguration: ConfigurationModel,
		private _localUserConfiguration: ConfigurationModel,
		private _remoteUserConfiguration: ConfigurationModel = new ConfigurationModel(),
		private _workspaceConfiguration: ConfigurationModel = new ConfigurationModel(),
		private _folderConfigurations: ResourceMap<ConfigurationModel> = new ResourceMap<ConfigurationModel>(),
		private _memoryConfiguration: ConfigurationModel = new ConfigurationModel(),
		private _memoryConfigurationByResource: ResourceMap<ConfigurationModel> = new ResourceMap<ConfigurationModel>(),
		private _freeze: boolean = true) {
	}

	getValue(section: string | undefined, overrides: IConfigurationOverrides, workspace: Workspace | undefined): any {
		const consolidateConfigurationModel = this.getConsolidatedConfigurationModel(section, overrides, workspace);
		return consolidateConfigurationModel.getValue(section);
	}

	updateValue(key: string, value: any, overrides: IConfigurationUpdateOverrides = {}): void {
		let memoryConfiguration: ConfigurationModel | undefined;
		if (overrides.resource) {
			memoryConfiguration = this._memoryConfigurationByResource.get(overrides.resource);
			if (!memoryConfiguration) {
				memoryConfiguration = new ConfigurationModel();
				this._memoryConfigurationByResource.set(overrides.resource, memoryConfiguration);
			}
		} else {
			memoryConfiguration = this._memoryConfiguration;
		}

		if (value === undefined) {
			memoryConfiguration.removeValue(key);
		} else {
			memoryConfiguration.setValue(key, value);
		}

		if (!overrides.resource) {
			this._workspaceConsolidatedConfiguration = null;
		}
	}

	inspect<C>(key: string, overrides: IConfigurationOverrides, workspace: Workspace | undefined): IConfigurationValue<C> {
		const consolidateConfigurationModel = this.getConsolidatedConfigurationModel(key, overrides, workspace);
		const folderConfigurationModel = this.getFolderConfigurationModelForResource(overrides.resource, workspace);
		const memoryConfigurationModel = overrides.resource ? this._memoryConfigurationByResource.get(overrides.resource) || this._memoryConfiguration : this._memoryConfiguration;

		const defaultValue = overrides.overrideIdentifier ? this._defaultConfiguration.freeze().override(overrides.overrideIdentifier).getValue<C>(key) : this._defaultConfiguration.freeze().getValue<C>(key);
		const policyValue = this._policyConfiguration.isEmpty() ? undefined : this._policyConfiguration.freeze().getValue<C>(key);
		const applicationValue = this.applicationConfiguration.isEmpty() ? undefined : this.applicationConfiguration.freeze().getValue<C>(key);
		const userValue = overrides.overrideIdentifier ? this.userConfiguration.freeze().override(overrides.overrideIdentifier).getValue<C>(key) : this.userConfiguration.freeze().getValue<C>(key);
		const userLocalValue = overrides.overrideIdentifier ? this.localUserConfiguration.freeze().override(overrides.overrideIdentifier).getValue<C>(key) : this.localUserConfiguration.freeze().getValue<C>(key);
		const userRemoteValue = overrides.overrideIdentifier ? this.remoteUserConfiguration.freeze().override(overrides.overrideIdentifier).getValue<C>(key) : this.remoteUserConfiguration.freeze().getValue<C>(key);
		const workspaceValue = workspace ? overrides.overrideIdentifier ? this._workspaceConfiguration.freeze().override(overrides.overrideIdentifier).getValue<C>(key) : this._workspaceConfiguration.freeze().getValue<C>(key) : undefined; //Check on workspace exists or not because _workspaceConfiguration is never null
		const workspaceFolderValue = folderConfigurationModel ? overrides.overrideIdentifier ? folderConfigurationModel.freeze().override(overrides.overrideIdentifier).getValue<C>(key) : folderConfigurationModel.freeze().getValue<C>(key) : undefined;
		const memoryValue = overrides.overrideIdentifier ? memoryConfigurationModel.override(overrides.overrideIdentifier).getValue<C>(key) : memoryConfigurationModel.getValue<C>(key);
		const value = consolidateConfigurationModel.getValue<C>(key);
		const overrideIdentifiers: string[] = arrays.distinct(consolidateConfigurationModel.overrides.map(override => override.identifiers).flat()).filter(overrideIdentifier => consolidateConfigurationModel.getOverrideValue(key, overrideIdentifier) !== undefined);

		return {
			defaultValue,
			policyValue,
			applicationValue,
			userValue,
			userLocalValue,
			userRemoteValue,
			workspaceValue,
			workspaceFolderValue,
			memoryValue,
			value,

			default: defaultValue !== undefined ? { value: this._defaultConfiguration.freeze().getValue(key), override: overrides.overrideIdentifier ? this._defaultConfiguration.freeze().getOverrideValue(key, overrides.overrideIdentifier) : undefined } : undefined,
			policy: policyValue !== undefined ? { value: policyValue } : undefined,
			application: applicationValue !== undefined ? { value: applicationValue, override: overrides.overrideIdentifier ? this.applicationConfiguration.freeze().getOverrideValue(key, overrides.overrideIdentifier) : undefined } : undefined,
			user: userValue !== undefined ? { value: this.userConfiguration.freeze().getValue(key), override: overrides.overrideIdentifier ? this.userConfiguration.freeze().getOverrideValue(key, overrides.overrideIdentifier) : undefined } : undefined,
			userLocal: userLocalValue !== undefined ? { value: this.localUserConfiguration.freeze().getValue(key), override: overrides.overrideIdentifier ? this.localUserConfiguration.freeze().getOverrideValue(key, overrides.overrideIdentifier) : undefined } : undefined,
			userRemote: userRemoteValue !== undefined ? { value: this.remoteUserConfiguration.freeze().getValue(key), override: overrides.overrideIdentifier ? this.remoteUserConfiguration.freeze().getOverrideValue(key, overrides.overrideIdentifier) : undefined } : undefined,
			workspace: workspaceValue !== undefined ? { value: this._workspaceConfiguration.freeze().getValue(key), override: overrides.overrideIdentifier ? this._workspaceConfiguration.freeze().getOverrideValue(key, overrides.overrideIdentifier) : undefined } : undefined,
			workspaceFolder: workspaceFolderValue !== undefined ? { value: folderConfigurationModel?.freeze().getValue(key), override: overrides.overrideIdentifier ? folderConfigurationModel?.freeze().getOverrideValue(key, overrides.overrideIdentifier) : undefined } : undefined,
			memory: memoryValue !== undefined ? { value: memoryConfigurationModel.getValue(key), override: overrides.overrideIdentifier ? memoryConfigurationModel.getOverrideValue(key, overrides.overrideIdentifier) : undefined } : undefined,

			overrideIdentifiers: overrideIdentifiers.length ? overrideIdentifiers : undefined
		};
	}

	keys(workspace: Workspace | undefined): {
		default: string[];
		user: string[];
		workspace: string[];
		workspaceFolder: string[];
	} {
		const folderConfigurationModel = this.getFolderConfigurationModelForResource(undefined, workspace);
		return {
			default: this._defaultConfiguration.freeze().keys,
			user: this.userConfiguration.freeze().keys,
			workspace: this._workspaceConfiguration.freeze().keys,
			workspaceFolder: folderConfigurationModel ? folderConfigurationModel.freeze().keys : []
		};
	}

	updateDefaultConfiguration(defaultConfiguration: ConfigurationModel): void {
		this._defaultConfiguration = defaultConfiguration;
		this._workspaceConsolidatedConfiguration = null;
		this._foldersConsolidatedConfigurations.clear();
	}

	updatePolicyConfiguration(policyConfiguration: ConfigurationModel): void {
		this._policyConfiguration = policyConfiguration;
	}

	updateApplicationConfiguration(applicationConfiguration: ConfigurationModel): void {
		this._applicationConfiguration = applicationConfiguration;
		this._workspaceConsolidatedConfiguration = null;
		this._foldersConsolidatedConfigurations.clear();
	}

	updateLocalUserConfiguration(localUserConfiguration: ConfigurationModel): void {
		this._localUserConfiguration = localUserConfiguration;
		this._userConfiguration = null;
		this._workspaceConsolidatedConfiguration = null;
		this._foldersConsolidatedConfigurations.clear();
	}

	updateRemoteUserConfiguration(remoteUserConfiguration: ConfigurationModel): void {
		this._remoteUserConfiguration = remoteUserConfiguration;
		this._userConfiguration = null;
		this._workspaceConsolidatedConfiguration = null;
		this._foldersConsolidatedConfigurations.clear();
	}

	updateWorkspaceConfiguration(workspaceConfiguration: ConfigurationModel): void {
		this._workspaceConfiguration = workspaceConfiguration;
		this._workspaceConsolidatedConfiguration = null;
		this._foldersConsolidatedConfigurations.clear();
	}

	updateFolderConfiguration(resource: URI, configuration: ConfigurationModel): void {
		this._folderConfigurations.set(resource, configuration);
		this._foldersConsolidatedConfigurations.delete(resource);
	}

	deleteFolderConfiguration(resource: URI): void {
		this.folderConfigurations.delete(resource);
		this._foldersConsolidatedConfigurations.delete(resource);
	}

	compareAndUpdateDefaultConfiguration(defaults: ConfigurationModel, keys?: string[]): IConfigurationChange {
		const overrides: [string, string[]][] = [];
		if (!keys) {
			const { added, updated, removed } = compare(this._defaultConfiguration, defaults);
			keys = [...added, ...updated, ...removed];
		}
		for (const key of keys) {
			for (const overrideIdentifier of overrideIdentifiersFromKey(key)) {
				const fromKeys = this._defaultConfiguration.getKeysForOverrideIdentifier(overrideIdentifier);
				const toKeys = defaults.getKeysForOverrideIdentifier(overrideIdentifier);
				const keys = [
					...toKeys.filter(key => fromKeys.indexOf(key) === -1),
					...fromKeys.filter(key => toKeys.indexOf(key) === -1),
					...fromKeys.filter(key => !objects.equals(this._defaultConfiguration.override(overrideIdentifier).getValue(key), defaults.override(overrideIdentifier).getValue(key)))
				];
				overrides.push([overrideIdentifier, keys]);
			}
		}
		this.updateDefaultConfiguration(defaults);
		return { keys, overrides };
	}

	compareAndUpdatePolicyConfiguration(policyConfiguration: ConfigurationModel): IConfigurationChange {
		const { added, updated, removed } = compare(this._policyConfiguration, policyConfiguration);
		const keys = [...added, ...updated, ...removed];
		if (keys.length) {
			this.updatePolicyConfiguration(policyConfiguration);
		}
		return { keys, overrides: [] };
	}

	compareAndUpdateApplicationConfiguration(application: ConfigurationModel): IConfigurationChange {
		const { added, updated, removed, overrides } = compare(this.applicationConfiguration, application);
		const keys = [...added, ...updated, ...removed];
		if (keys.length) {
			this.updateApplicationConfiguration(application);
		}
		return { keys, overrides };
	}

	compareAndUpdateLocalUserConfiguration(user: ConfigurationModel): IConfigurationChange {
		const { added, updated, removed, overrides } = compare(this.localUserConfiguration, user);
		const keys = [...added, ...updated, ...removed];
		if (keys.length) {
			this.updateLocalUserConfiguration(user);
		}
		return { keys, overrides };
	}

	compareAndUpdateRemoteUserConfiguration(user: ConfigurationModel): IConfigurationChange {
		const { added, updated, removed, overrides } = compare(this.remoteUserConfiguration, user);
		const keys = [...added, ...updated, ...removed];
		if (keys.length) {
			this.updateRemoteUserConfiguration(user);
		}
		return { keys, overrides };
	}

	compareAndUpdateWorkspaceConfiguration(workspaceConfiguration: ConfigurationModel): IConfigurationChange {
		const { added, updated, removed, overrides } = compare(this.workspaceConfiguration, workspaceConfiguration);
		const keys = [...added, ...updated, ...removed];
		if (keys.length) {
			this.updateWorkspaceConfiguration(workspaceConfiguration);
		}
		return { keys, overrides };
	}

	compareAndUpdateFolderConfiguration(resource: URI, folderConfiguration: ConfigurationModel): IConfigurationChange {
		const currentFolderConfiguration = this.folderConfigurations.get(resource);
		const { added, updated, removed, overrides } = compare(currentFolderConfiguration, folderConfiguration);
		const keys = [...added, ...updated, ...removed];
		if (keys.length || !currentFolderConfiguration) {
			this.updateFolderConfiguration(resource, folderConfiguration);
		}
		return { keys, overrides };
	}

	compareAndDeleteFolderConfiguration(folder: URI): IConfigurationChange {
		const folderConfig = this.folderConfigurations.get(folder);
		if (!folderConfig) {
			throw new Error('Unknown folder');
		}
		this.deleteFolderConfiguration(folder);
		const { added, updated, removed, overrides } = compare(folderConfig, undefined);
		return { keys: [...added, ...updated, ...removed], overrides };
	}

	get defaults(): ConfigurationModel {
		return this._defaultConfiguration;
	}

	get applicationConfiguration(): ConfigurationModel {
		return this._applicationConfiguration;
	}

	private _userConfiguration: ConfigurationModel | null = null;
	get userConfiguration(): ConfigurationModel {
		if (!this._userConfiguration) {
			this._userConfiguration = this._remoteUserConfiguration.isEmpty() ? this._localUserConfiguration : this._localUserConfiguration.merge(this._remoteUserConfiguration);
			if (this._freeze) {
				this._userConfiguration.freeze();
			}
		}
		return this._userConfiguration;
	}

	get localUserConfiguration(): ConfigurationModel {
		return this._localUserConfiguration;
	}

	get remoteUserConfiguration(): ConfigurationModel {
		return this._remoteUserConfiguration;
	}

	get workspaceConfiguration(): ConfigurationModel {
		return this._workspaceConfiguration;
	}

	protected get folderConfigurations(): ResourceMap<ConfigurationModel> {
		return this._folderConfigurations;
	}

	private getConsolidatedConfigurationModel(section: string | undefined, overrides: IConfigurationOverrides, workspace: Workspace | undefined): ConfigurationModel {
		let configurationModel = this.getConsolidatedConfigurationModelForResource(overrides, workspace);
		if (overrides.overrideIdentifier) {
			configurationModel = configurationModel.override(overrides.overrideIdentifier);
		}
		if (!this._policyConfiguration.isEmpty() && this._policyConfiguration.getValue(section) !== undefined) {
			configurationModel = configurationModel.merge(this._policyConfiguration);
		}
		return configurationModel;
	}

	private getConsolidatedConfigurationModelForResource({ resource }: IConfigurationOverrides, workspace: Workspace | undefined): ConfigurationModel {
		let consolidateConfiguration = this.getWorkspaceConsolidatedConfiguration();

		if (workspace && resource) {
			const root = workspace.getFolder(resource);
			if (root) {
				consolidateConfiguration = this.getFolderConsolidatedConfiguration(root.uri) || consolidateConfiguration;
			}
			const memoryConfigurationForResource = this._memoryConfigurationByResource.get(resource);
			if (memoryConfigurationForResource) {
				consolidateConfiguration = consolidateConfiguration.merge(memoryConfigurationForResource);
			}
		}

		return consolidateConfiguration;
	}

	private getWorkspaceConsolidatedConfiguration(): ConfigurationModel {
		if (!this._workspaceConsolidatedConfiguration) {
			this._workspaceConsolidatedConfiguration = this._defaultConfiguration.merge(this.applicationConfiguration, this.userConfiguration, this._workspaceConfiguration, this._memoryConfiguration);
			if (this._freeze) {
				this._workspaceConfiguration = this._workspaceConfiguration.freeze();
			}
		}
		return this._workspaceConsolidatedConfiguration;
	}

	private getFolderConsolidatedConfiguration(folder: URI): ConfigurationModel {
		let folderConsolidatedConfiguration = this._foldersConsolidatedConfigurations.get(folder);
		if (!folderConsolidatedConfiguration) {
			const workspaceConsolidateConfiguration = this.getWorkspaceConsolidatedConfiguration();
			const folderConfiguration = this._folderConfigurations.get(folder);
			if (folderConfiguration) {
				folderConsolidatedConfiguration = workspaceConsolidateConfiguration.merge(folderConfiguration);
				if (this._freeze) {
					folderConsolidatedConfiguration = folderConsolidatedConfiguration.freeze();
				}
				this._foldersConsolidatedConfigurations.set(folder, folderConsolidatedConfiguration);
			} else {
				folderConsolidatedConfiguration = workspaceConsolidateConfiguration;
			}
		}
		return folderConsolidatedConfiguration;
	}

	private getFolderConfigurationModelForResource(resource: URI | null | undefined, workspace: Workspace | undefined): ConfigurationModel | undefined {
		if (workspace && resource) {
			const root = workspace.getFolder(resource);
			if (root) {
				return this._folderConfigurations.get(root.uri);
			}
		}
		return undefined;
	}

	toData(): IConfigurationData {
		return {
			defaults: {
				contents: this._defaultConfiguration.contents,
				overrides: this._defaultConfiguration.overrides,
				keys: this._defaultConfiguration.keys
			},
			policy: {
				contents: this._policyConfiguration.contents,
				overrides: this._policyConfiguration.overrides,
				keys: this._policyConfiguration.keys
			},
			application: {
				contents: this.applicationConfiguration.contents,
				overrides: this.applicationConfiguration.overrides,
				keys: this.applicationConfiguration.keys
			},
			user: {
				contents: this.userConfiguration.contents,
				overrides: this.userConfiguration.overrides,
				keys: this.userConfiguration.keys
			},
			workspace: {
				contents: this._workspaceConfiguration.contents,
				overrides: this._workspaceConfiguration.overrides,
				keys: this._workspaceConfiguration.keys
			},
			folders: [...this._folderConfigurations.keys()].reduce<[UriComponents, IConfigurationModel][]>((result, folder) => {
				const { contents, overrides, keys } = this._folderConfigurations.get(folder)!;
				result.push([folder, { contents, overrides, keys }]);
				return result;
			}, [])
		};
	}

	allKeys(): string[] {
		const keys: Set<string> = new Set<string>();
		this._defaultConfiguration.freeze().keys.forEach(key => keys.add(key));
		this.userConfiguration.freeze().keys.forEach(key => keys.add(key));
		this._workspaceConfiguration.freeze().keys.forEach(key => keys.add(key));
		this._folderConfigurations.forEach(folderConfiguraiton => folderConfiguraiton.freeze().keys.forEach(key => keys.add(key)));
		return [...keys.values()];
	}

	protected allOverrideIdentifiers(): string[] {
		const keys: Set<string> = new Set<string>();
		this._defaultConfiguration.freeze().getAllOverrideIdentifiers().forEach(key => keys.add(key));
		this.userConfiguration.freeze().getAllOverrideIdentifiers().forEach(key => keys.add(key));
		this._workspaceConfiguration.freeze().getAllOverrideIdentifiers().forEach(key => keys.add(key));
		this._folderConfigurations.forEach(folderConfiguraiton => folderConfiguraiton.freeze().getAllOverrideIdentifiers().forEach(key => keys.add(key)));
		return [...keys.values()];
	}

	protected getAllKeysForOverrideIdentifier(overrideIdentifier: string): string[] {
		const keys: Set<string> = new Set<string>();
		this._defaultConfiguration.getKeysForOverrideIdentifier(overrideIdentifier).forEach(key => keys.add(key));
		this.userConfiguration.getKeysForOverrideIdentifier(overrideIdentifier).forEach(key => keys.add(key));
		this._workspaceConfiguration.getKeysForOverrideIdentifier(overrideIdentifier).forEach(key => keys.add(key));
		this._folderConfigurations.forEach(folderConfiguraiton => folderConfiguraiton.getKeysForOverrideIdentifier(overrideIdentifier).forEach(key => keys.add(key)));
		return [...keys.values()];
	}

	static parse(data: IConfigurationData): Configuration {
		const defaultConfiguration = this.parseConfigurationModel(data.defaults);
		const policyConfiguration = this.parseConfigurationModel(data.policy);
		const applicationConfiguration = this.parseConfigurationModel(data.application);
		const userConfiguration = this.parseConfigurationModel(data.user);
		const workspaceConfiguration = this.parseConfigurationModel(data.workspace);
		const folders: ResourceMap<ConfigurationModel> = data.folders.reduce((result, value) => {
			result.set(URI.revive(value[0]), this.parseConfigurationModel(value[1]));
			return result;
		}, new ResourceMap<ConfigurationModel>());
		return new Configuration(defaultConfiguration, policyConfiguration, applicationConfiguration, userConfiguration, new ConfigurationModel(), workspaceConfiguration, folders, new ConfigurationModel(), new ResourceMap<ConfigurationModel>(), false);
	}

	private static parseConfigurationModel(model: IConfigurationModel): ConfigurationModel {
		return new ConfigurationModel(model.contents, model.keys, model.overrides).freeze();
	}

}

export function mergeChanges(...changes: IConfigurationChange[]): IConfigurationChange {
	if (changes.length === 0) {
		return { keys: [], overrides: [] };
	}
	if (changes.length === 1) {
		return changes[0];
	}
	const keysSet = new Set<string>();
	const overridesMap = new Map<string, Set<string>>();
	for (const change of changes) {
		change.keys.forEach(key => keysSet.add(key));
		change.overrides.forEach(([identifier, keys]) => {
			const result = getOrSet(overridesMap, identifier, new Set<string>());
			keys.forEach(key => result.add(key));
		});
	}
	const overrides: [string, string[]][] = [];
	overridesMap.forEach((keys, identifier) => overrides.push([identifier, [...keys.values()]]));
	return { keys: [...keysSet.values()], overrides };
}

export class ConfigurationChangeEvent implements IConfigurationChangeEvent {

	private readonly affectedKeysTree: any;
	readonly affectedKeys: string[];
	source!: ConfigurationTarget;
	sourceConfig: any;

	constructor(readonly change: IConfigurationChange, private readonly previous: { workspace?: Workspace; data: IConfigurationData } | undefined, private readonly currentConfiguraiton: Configuration, private readonly currentWorkspace?: Workspace) {
		const keysSet = new Set<string>();
		change.keys.forEach(key => keysSet.add(key));
		change.overrides.forEach(([, keys]) => keys.forEach(key => keysSet.add(key)));
		this.affectedKeys = [...keysSet.values()];

		const configurationModel = new ConfigurationModel();
		this.affectedKeys.forEach(key => configurationModel.setValue(key, {}));
		this.affectedKeysTree = configurationModel.contents;
	}

	private _previousConfiguration: Configuration | undefined = undefined;
	get previousConfiguration(): Configuration | undefined {
		if (!this._previousConfiguration && this.previous) {
			this._previousConfiguration = Configuration.parse(this.previous.data);
		}
		return this._previousConfiguration;
	}

	affectsConfiguration(section: string, overrides?: IConfigurationOverrides): boolean {
		if (this.doesAffectedKeysTreeContains(this.affectedKeysTree, section)) {
			if (overrides) {
				const value1 = this.previousConfiguration ? this.previousConfiguration.getValue(section, overrides, this.previous?.workspace) : undefined;
				const value2 = this.currentConfiguraiton.getValue(section, overrides, this.currentWorkspace);
				return !objects.equals(value1, value2);
			}
			return true;
		}
		return false;
	}

	private doesAffectedKeysTreeContains(affectedKeysTree: any, section: string): boolean {
		let requestedTree = toValuesTree({ [section]: true }, () => { });

		let key;
		while (typeof requestedTree === 'object' && (key = Object.keys(requestedTree)[0])) { // Only one key should present, since we added only one property
			affectedKeysTree = affectedKeysTree[key];
			if (!affectedKeysTree) {
				return false; // Requested tree is not found
			}
			requestedTree = requestedTree[key];
		}
		return true;
	}
}

function compare(from: ConfigurationModel | undefined, to: ConfigurationModel | undefined): IConfigurationCompareResult {
	const { added, removed, updated } = compareConfigurationContents(to, from);
	const overrides: [string, string[]][] = [];

	const fromOverrideIdentifiers = from?.getAllOverrideIdentifiers() || [];
	const toOverrideIdentifiers = to?.getAllOverrideIdentifiers() || [];

	if (to) {
		const addedOverrideIdentifiers = toOverrideIdentifiers.filter(key => !fromOverrideIdentifiers.includes(key));
		for (const identifier of addedOverrideIdentifiers) {
			overrides.push([identifier, to.getKeysForOverrideIdentifier(identifier)]);
		}
	}

	if (from) {
		const removedOverrideIdentifiers = fromOverrideIdentifiers.filter(key => !toOverrideIdentifiers.includes(key));
		for (const identifier of removedOverrideIdentifiers) {
			overrides.push([identifier, from.getKeysForOverrideIdentifier(identifier)]);
		}
	}

	if (to && from) {
		for (const identifier of fromOverrideIdentifiers) {
			if (toOverrideIdentifiers.includes(identifier)) {
				const result = compareConfigurationContents({ contents: from.getOverrideValue(undefined, identifier) || {}, keys: from.getKeysForOverrideIdentifier(identifier) }, { contents: to.getOverrideValue(undefined, identifier) || {}, keys: to.getKeysForOverrideIdentifier(identifier) });
				overrides.push([identifier, [...result.added, ...result.removed, ...result.updated]]);
			}
		}
	}

	return { added, removed, updated, overrides };
}

function compareConfigurationContents(to: { keys: string[]; contents: any } | undefined, from: { keys: string[]; contents: any } | undefined) {
	const added = to
		? from ? to.keys.filter(key => from.keys.indexOf(key) === -1) : [...to.keys]
		: [];
	const removed = from
		? to ? from.keys.filter(key => to.keys.indexOf(key) === -1) : [...from.keys]
		: [];
	const updated: string[] = [];

	if (to && from) {
		for (const key of from.keys) {
			if (to.keys.indexOf(key) !== -1) {
				const value1 = getConfigurationValue(from.contents, key);
				const value2 = getConfigurationValue(to.contents, key);
				if (!objects.equals(value1, value2)) {
					updated.push(key);
				}
			}
		}
	}
	return { added, removed, updated };
}
