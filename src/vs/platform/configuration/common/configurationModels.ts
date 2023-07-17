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

function freeze<T>(data: T): T {
	return Object.isFrozen(data) ? data : objects.deepFreeze(data);
}

interface IInspectValue<V> {
	value?: V;
	override?: V;
	merged?: V;
}

export class ConfigurationModel implements IConfigurationModel {

	private readonly overrideConfigurations = new Map<string, ConfigurationModel>();

	constructor(
		private readonly _contents: any = {},
		private readonly _keys: string[] = [],
		private readonly _overrides: IOverrides[] = [],
		readonly raw?: ReadonlyArray<IStringDictionary<any> | ConfigurationModel>
	) {
	}

	private _rawConfiguration: ConfigurationModel | undefined;
	get rawConfiguration(): ConfigurationModel {
		if (!this._rawConfiguration) {
			if (this.raw?.length) {
				const rawConfigurationModels = this.raw.map(raw => {
					if (raw instanceof ConfigurationModel) {
						return raw;
					}
					const parser = new ConfigurationModelParser('');
					parser.parseRaw(raw);
					return parser.configurationModel;
				});
				this._rawConfiguration = rawConfigurationModels.reduce((previous, current) => current === previous ? current : previous.merge(current), rawConfigurationModels[0]);
			} else {
				// raw is same as current
				this._rawConfiguration = this;
			}
		}
		return this._rawConfiguration;
	}

	get contents(): any {
		return this._contents;
	}

	get overrides(): IOverrides[] {
		return this._overrides;
	}

	get keys(): string[] {
		return this._keys;
	}

	isEmpty(): boolean {
		return this._keys.length === 0 && Object.keys(this._contents).length === 0 && this._overrides.length === 0;
	}

	getValue<V>(section: string | undefined): V {
		return section ? getConfigurationValue<any>(this.contents, section) : this.contents;
	}

	inspect<V>(section: string | undefined, overrideIdentifier?: string | null): IInspectValue<V> {
		const value = this.rawConfiguration.getValue<V>(section);
		const override = overrideIdentifier ? this.rawConfiguration.getOverrideValue<V>(section, overrideIdentifier) : undefined;
		const merged = overrideIdentifier ? this.rawConfiguration.override(overrideIdentifier).getValue<V>(section) : value;
		return { value, override, merged };
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
		const raws = this.raw?.length ? [...this.raw] : [this];

		for (const other of others) {
			raws.push(...(other.raw?.length ? other.raw : [other]));
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
		return new ConfigurationModel(contents, keys, overrides, raws.every(raw => raw instanceof ConfigurationModel) ? undefined : raws);
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
			if (override.identifiers.length === 1 && override.identifiers[0] === identifier) {
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

	public addValue(key: string, value: any): void {
		this.updateValue(key, value, true);
	}

	public setValue(key: string, value: any): void {
		this.updateValue(key, value, false);
	}

	public removeValue(key: string): void {
		const index = this.keys.indexOf(key);
		if (index === -1) {
			return;
		}
		this.keys.splice(index, 1);
		removeFromValueTree(this.contents, key);
		if (OVERRIDE_PROPERTY_REGEX.test(key)) {
			this.overrides.splice(this.overrides.findIndex(o => arrays.equals(o.identifiers, overrideIdentifiersFromKey(key))), 1);
		}
	}

	private updateValue(key: string, value: any, add: boolean): void {
		addToValueTree(this.contents, key, value, e => console.error(e));
		add = add || this.keys.indexOf(key) === -1;
		if (add) {
			this.keys.push(key);
		}
		if (OVERRIDE_PROPERTY_REGEX.test(key)) {
			this.overrides.push({
				identifiers: overrideIdentifiersFromKey(key),
				keys: Object.keys(this.contents[key]),
				contents: toValuesTree(this.contents[key], message => console.error(message)),
			});
		}
	}
}

export interface ConfigurationParseOptions {
	scopes?: ConfigurationScope[];
	skipRestricted?: boolean;
	include?: string[];
	exclude?: string[];
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
		const { contents, keys, overrides, restricted, hasExcludedProperties } = this.doParseRaw(raw, options);
		this._configurationModel = new ConfigurationModel(contents, keys, overrides, hasExcludedProperties ? [raw] : undefined /* raw has not changed */);
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

	protected doParseRaw(raw: any, options?: ConfigurationParseOptions): IConfigurationModel & { restricted?: string[]; hasExcludedProperties?: boolean } {
		const configurationProperties = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurationProperties();
		const filtered = this.filter(raw, configurationProperties, true, options);
		raw = filtered.raw;
		const contents = toValuesTree(raw, message => console.error(`Conflict in settings file ${this._name}: ${message}`));
		const keys = Object.keys(raw);
		const overrides = this.toOverrides(raw, message => console.error(`Conflict in settings file ${this._name}: ${message}`));
		return { contents, keys, overrides, restricted: filtered.restricted, hasExcludedProperties: filtered.hasExcludedProperties };
	}

	private filter(properties: any, configurationProperties: { [qualifiedKey: string]: IConfigurationPropertySchema | undefined }, filterOverriddenProperties: boolean, options?: ConfigurationParseOptions): { raw: {}; restricted: string[]; hasExcludedProperties: boolean } {
		let hasExcludedProperties = false;
		if (!options?.scopes && !options?.skipRestricted && !options?.exclude?.length) {
			return { raw: properties, restricted: [], hasExcludedProperties };
		}
		const raw: any = {};
		const restricted: string[] = [];
		for (const key in properties) {
			if (OVERRIDE_PROPERTY_REGEX.test(key) && filterOverriddenProperties) {
				const result = this.filter(properties[key], configurationProperties, false, options);
				raw[key] = result.raw;
				hasExcludedProperties = hasExcludedProperties || result.hasExcludedProperties;
				restricted.push(...result.restricted);
			} else {
				const propertySchema = configurationProperties[key];
				const scope = propertySchema ? typeof propertySchema.scope !== 'undefined' ? propertySchema.scope : ConfigurationScope.WINDOW : undefined;
				if (propertySchema?.restricted) {
					restricted.push(key);
				}
				if (!options.exclude?.includes(key) /* Check exclude */
					&& (options.include?.includes(key) /* Check include */
						|| ((scope === undefined || options.scopes === undefined || options.scopes.includes(scope)) /* Check scopes */
							&& !(options.skipRestricted && propertySchema?.restricted)))) /* Check restricted */ {
					raw[key] = properties[key];
				} else {
					hasExcludedProperties = true;
				}
			}
		}
		return { raw, restricted, hasExcludedProperties };
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
	protected readonly _onDidChange: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	constructor(
		private readonly userSettingsResource: URI,
		protected parseOptions: ConfigurationParseOptions,
		extUri: IExtUri,
		private readonly fileService: IFileService
	) {
		super();
		this.parser = new ConfigurationModelParser(this.userSettingsResource.toString());
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

	reparse(parseOptions?: ConfigurationParseOptions): ConfigurationModel {
		if (parseOptions) {
			this.parseOptions = parseOptions;
		}
		this.parser.reparse(this.parseOptions);
		return this.parser.configurationModel;
	}

	getRestrictedSettings(): string[] {
		return this.parser.restrictedConfigurations;
	}
}

class ConfigurationInspectValue<V> implements IConfigurationValue<V> {

	constructor(
		private readonly key: string,
		private readonly overrides: IConfigurationOverrides,
		private readonly _value: V | undefined,
		readonly overrideIdentifiers: string[] | undefined,
		private readonly defaultConfiguration: ConfigurationModel,
		private readonly policyConfiguration: ConfigurationModel | undefined,
		private readonly applicationConfiguration: ConfigurationModel | undefined,
		private readonly userConfiguration: ConfigurationModel,
		private readonly localUserConfiguration: ConfigurationModel,
		private readonly remoteUserConfiguration: ConfigurationModel,
		private readonly workspaceConfiguration: ConfigurationModel | undefined,
		private readonly folderConfigurationModel: ConfigurationModel | undefined,
		private readonly memoryConfigurationModel: ConfigurationModel
	) {
	}

	get value(): V | undefined {
		return freeze(this._value);
	}

	private inspect<V>(model: ConfigurationModel, section: string | undefined, overrideIdentifier?: string | null): IInspectValue<V> {
		const inspectValue = model.inspect<V>(section, overrideIdentifier);
		return {
			get value() { return freeze(inspectValue.value); },
			get override() { return freeze(inspectValue.override); },
			get merged() { return freeze(inspectValue.merged); }
		};
	}

	private _defaultInspectValue: IInspectValue<V> | undefined;
	private get defaultInspectValue(): IInspectValue<V> {
		if (!this._defaultInspectValue) {
			this._defaultInspectValue = this.inspect<V>(this.defaultConfiguration, this.key, this.overrides.overrideIdentifier);
		}
		return this._defaultInspectValue;
	}

	get defaultValue(): V | undefined {
		return this.defaultInspectValue.merged;
	}

	get default(): { value?: V; override?: V } | undefined {
		return this.defaultInspectValue.value !== undefined || this.defaultInspectValue.override !== undefined ? { value: this.defaultInspectValue.value, override: this.defaultInspectValue.override } : undefined;
	}

	private _policyInspectValue: IInspectValue<V> | undefined | null;
	private get policyInspectValue(): IInspectValue<V> | null {
		if (this._policyInspectValue === undefined) {
			this._policyInspectValue = this.policyConfiguration ? this.inspect<V>(this.policyConfiguration, this.key) : null;
		}
		return this._policyInspectValue;
	}

	get policyValue(): V | undefined {
		return this.policyInspectValue?.merged;
	}

	get policy(): { value?: V; override?: V } | undefined {
		return this.policyInspectValue?.value !== undefined ? { value: this.policyInspectValue.value } : undefined;
	}

	private _applicationInspectValue: IInspectValue<V> | undefined | null;
	private get applicationInspectValue(): IInspectValue<V> | null {
		if (this._applicationInspectValue === undefined) {
			this._applicationInspectValue = this.applicationConfiguration ? this.inspect<V>(this.applicationConfiguration, this.key) : null;
		}
		return this._applicationInspectValue;
	}

	get applicationValue(): V | undefined {
		return this.applicationInspectValue?.merged;
	}

	get application(): { value?: V; override?: V } | undefined {
		return this.applicationInspectValue?.value !== undefined || this.applicationInspectValue?.override !== undefined ? { value: this.applicationInspectValue.value, override: this.applicationInspectValue.override } : undefined;
	}

	private _userInspectValue: IInspectValue<V> | undefined;
	private get userInspectValue(): IInspectValue<V> {
		if (!this._userInspectValue) {
			this._userInspectValue = this.inspect<V>(this.userConfiguration, this.key, this.overrides.overrideIdentifier);
		}
		return this._userInspectValue;
	}

	get userValue(): V | undefined {
		return this.userInspectValue.merged;
	}

	get user(): { value?: V; override?: V } | undefined {
		return this.userInspectValue.value !== undefined || this.userInspectValue.override !== undefined ? { value: this.userInspectValue.value, override: this.userInspectValue.override } : undefined;
	}

	private _userLocalInspectValue: IInspectValue<V> | undefined;
	private get userLocalInspectValue(): IInspectValue<V> {
		if (!this._userLocalInspectValue) {
			this._userLocalInspectValue = this.inspect<V>(this.localUserConfiguration, this.key, this.overrides.overrideIdentifier);
		}
		return this._userLocalInspectValue;
	}

	get userLocalValue(): V | undefined {
		return this.userLocalInspectValue.merged;
	}

	get userLocal(): { value?: V; override?: V } | undefined {
		return this.userLocalInspectValue.value !== undefined || this.userLocalInspectValue.override !== undefined ? { value: this.userLocalInspectValue.value, override: this.userLocalInspectValue.override } : undefined;
	}

	private _userRemoteInspectValue: IInspectValue<V> | undefined;
	private get userRemoteInspectValue(): IInspectValue<V> {
		if (!this._userRemoteInspectValue) {
			this._userRemoteInspectValue = this.inspect<V>(this.remoteUserConfiguration, this.key, this.overrides.overrideIdentifier);
		}
		return this._userRemoteInspectValue;
	}

	get userRemoteValue(): V | undefined {
		return this.userRemoteInspectValue.merged;
	}

	get userRemote(): { value?: V; override?: V } | undefined {
		return this.userRemoteInspectValue.value !== undefined || this.userRemoteInspectValue.override !== undefined ? { value: this.userRemoteInspectValue.value, override: this.userRemoteInspectValue.override } : undefined;
	}

	private _workspaceInspectValue: IInspectValue<V> | undefined | null;
	private get workspaceInspectValue(): IInspectValue<V> | null {
		if (this._workspaceInspectValue === undefined) {
			this._workspaceInspectValue = this.workspaceConfiguration ? this.inspect<V>(this.workspaceConfiguration, this.key, this.overrides.overrideIdentifier) : null;
		}
		return this._workspaceInspectValue;
	}

	get workspaceValue(): V | undefined {
		return this.workspaceInspectValue?.merged;
	}

	get workspace(): { value?: V; override?: V } | undefined {
		return this.workspaceInspectValue?.value !== undefined || this.workspaceInspectValue?.override !== undefined ? { value: this.workspaceInspectValue.value, override: this.workspaceInspectValue.override } : undefined;
	}

	private _workspaceFolderInspectValue: IInspectValue<V> | undefined | null;
	private get workspaceFolderInspectValue(): IInspectValue<V> | null {
		if (this._workspaceFolderInspectValue === undefined) {
			this._workspaceFolderInspectValue = this.folderConfigurationModel ? this.inspect<V>(this.folderConfigurationModel, this.key, this.overrides.overrideIdentifier) : null;
		}
		return this._workspaceFolderInspectValue;
	}

	get workspaceFolderValue(): V | undefined {
		return this.workspaceFolderInspectValue?.merged;
	}

	get workspaceFolder(): { value?: V; override?: V } | undefined {
		return this.workspaceFolderInspectValue?.value !== undefined || this.workspaceFolderInspectValue?.override !== undefined ? { value: this.workspaceFolderInspectValue.value, override: this.workspaceFolderInspectValue.override } : undefined;
	}

	private _memoryInspectValue: IInspectValue<V> | undefined;
	private get memoryInspectValue(): IInspectValue<V> {
		if (this._memoryInspectValue === undefined) {
			this._memoryInspectValue = this.inspect<V>(this.memoryConfigurationModel, this.key, this.overrides.overrideIdentifier);
		}
		return this._memoryInspectValue;
	}

	get memoryValue(): V | undefined {
		return this.memoryInspectValue.merged;
	}

	get memory(): { value?: V; override?: V } | undefined {
		return this.memoryInspectValue.value !== undefined || this.memoryInspectValue.override !== undefined ? { value: this.memoryInspectValue.value, override: this.memoryInspectValue.override } : undefined;
	}

}

export class Configuration {

	private _workspaceConsolidatedConfiguration: ConfigurationModel | null = null;
	private _foldersConsolidatedConfigurations = new ResourceMap<ConfigurationModel>();

	constructor(
		private _defaultConfiguration: ConfigurationModel,
		private _policyConfiguration: ConfigurationModel,
		private _applicationConfiguration: ConfigurationModel,
		private _localUserConfiguration: ConfigurationModel,
		private _remoteUserConfiguration: ConfigurationModel = new ConfigurationModel(),
		private _workspaceConfiguration: ConfigurationModel = new ConfigurationModel(),
		private _folderConfigurations: ResourceMap<ConfigurationModel> = new ResourceMap<ConfigurationModel>(),
		private _memoryConfiguration: ConfigurationModel = new ConfigurationModel(),
		private _memoryConfigurationByResource: ResourceMap<ConfigurationModel> = new ResourceMap<ConfigurationModel>()
	) {
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
		const overrideIdentifiers = new Set<string>();
		for (const override of consolidateConfigurationModel.overrides) {
			for (const overrideIdentifier of override.identifiers) {
				if (consolidateConfigurationModel.getOverrideValue(key, overrideIdentifier) !== undefined) {
					overrideIdentifiers.add(overrideIdentifier);
				}
			}
		}

		return new ConfigurationInspectValue<C>(
			key,
			overrides,
			consolidateConfigurationModel.getValue<C>(key),
			overrideIdentifiers.size ? [...overrideIdentifiers] : undefined,
			this._defaultConfiguration,
			this._policyConfiguration.isEmpty() ? undefined : this._policyConfiguration,
			this.applicationConfiguration.isEmpty() ? undefined : this.applicationConfiguration,
			this.userConfiguration,
			this.localUserConfiguration,
			this.remoteUserConfiguration,
			workspace ? this._workspaceConfiguration : undefined,
			folderConfigurationModel ? folderConfigurationModel : undefined,
			memoryConfigurationModel
		);

	}

	keys(workspace: Workspace | undefined): {
		default: string[];
		user: string[];
		workspace: string[];
		workspaceFolder: string[];
	} {
		const folderConfigurationModel = this.getFolderConfigurationModelForResource(undefined, workspace);
		return {
			default: this._defaultConfiguration.keys.slice(0),
			user: this.userConfiguration.keys.slice(0),
			workspace: this._workspaceConfiguration.keys.slice(0),
			workspaceFolder: folderConfigurationModel ? folderConfigurationModel.keys.slice(0) : []
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
		this._defaultConfiguration.keys.forEach(key => keys.add(key));
		this.userConfiguration.keys.forEach(key => keys.add(key));
		this._workspaceConfiguration.keys.forEach(key => keys.add(key));
		this._folderConfigurations.forEach(folderConfiguration => folderConfiguration.keys.forEach(key => keys.add(key)));
		return [...keys.values()];
	}

	protected allOverrideIdentifiers(): string[] {
		const keys: Set<string> = new Set<string>();
		this._defaultConfiguration.getAllOverrideIdentifiers().forEach(key => keys.add(key));
		this.userConfiguration.getAllOverrideIdentifiers().forEach(key => keys.add(key));
		this._workspaceConfiguration.getAllOverrideIdentifiers().forEach(key => keys.add(key));
		this._folderConfigurations.forEach(folderConfiguration => folderConfiguration.getAllOverrideIdentifiers().forEach(key => keys.add(key)));
		return [...keys.values()];
	}

	protected getAllKeysForOverrideIdentifier(overrideIdentifier: string): string[] {
		const keys: Set<string> = new Set<string>();
		this._defaultConfiguration.getKeysForOverrideIdentifier(overrideIdentifier).forEach(key => keys.add(key));
		this.userConfiguration.getKeysForOverrideIdentifier(overrideIdentifier).forEach(key => keys.add(key));
		this._workspaceConfiguration.getKeysForOverrideIdentifier(overrideIdentifier).forEach(key => keys.add(key));
		this._folderConfigurations.forEach(folderConfiguration => folderConfiguration.getKeysForOverrideIdentifier(overrideIdentifier).forEach(key => keys.add(key)));
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
		return new Configuration(defaultConfiguration, policyConfiguration, applicationConfiguration, userConfiguration, new ConfigurationModel(), workspaceConfiguration, folders, new ConfigurationModel(), new ResourceMap<ConfigurationModel>());
	}

	private static parseConfigurationModel(model: IConfigurationModel): ConfigurationModel {
		return new ConfigurationModel(model.contents, model.keys, model.overrides);
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

	private readonly _marker = '\n';
	private readonly _markerCode1 = this._marker.charCodeAt(0);
	private readonly _markerCode2 = '.'.charCodeAt(0);
	private readonly _affectsConfigStr: string;

	readonly affectedKeys = new Set<string>();
	source!: ConfigurationTarget;
	sourceConfig: any;

	constructor(readonly change: IConfigurationChange, private readonly previous: { workspace?: Workspace; data: IConfigurationData } | undefined, private readonly currentConfiguraiton: Configuration, private readonly currentWorkspace?: Workspace) {
		for (const key of change.keys) {
			this.affectedKeys.add(key);
		}
		for (const [, keys] of change.overrides) {
			for (const key of keys) {
				this.affectedKeys.add(key);
			}
		}

		// Example: '\nfoo.bar\nabc.def\n'
		this._affectsConfigStr = this._marker;
		for (const key of this.affectedKeys) {
			this._affectsConfigStr += key + this._marker;
		}
	}

	private _previousConfiguration: Configuration | undefined = undefined;
	get previousConfiguration(): Configuration | undefined {
		if (!this._previousConfiguration && this.previous) {
			this._previousConfiguration = Configuration.parse(this.previous.data);
		}
		return this._previousConfiguration;
	}

	affectsConfiguration(section: string, overrides?: IConfigurationOverrides): boolean {
		// we have one large string with all keys that have changed. we pad (marker) the section
		// and check that either find it padded or before a segment character
		const needle = this._marker + section;
		const idx = this._affectsConfigStr.indexOf(needle);
		if (idx < 0) {
			// NOT: (marker + section)
			return false;
		}
		const pos = idx + needle.length;
		if (pos >= this._affectsConfigStr.length) {
			return false;
		}
		const code = this._affectsConfigStr.charCodeAt(pos);
		if (code !== this._markerCode1 && code !== this._markerCode2) {
			// NOT: section + (marker | segment)
			return false;
		}
		if (overrides) {
			const value1 = this.previousConfiguration ? this.previousConfiguration.getValue(section, overrides, this.previous?.workspace) : undefined;
			const value2 = this.currentConfiguraiton.getValue(section, overrides, this.currentWorkspace);
			return !objects.equals(value1, value2);
		}
		return true;
	}
}

function compare(from: ConfigurationModel | undefined, to: ConfigurationModel | undefined): IConfigurationCompareResult {
	const { added, removed, updated } = compareConfigurationContents(to?.rawConfiguration, from?.rawConfiguration);
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
