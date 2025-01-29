/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as arrays from '../../../base/common/arrays.js';
import { IStringDictionary } from '../../../base/common/collections.js';
import { Emitter, Event } from '../../../base/common/event.js';
import * as json from '../../../base/common/json.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { getOrSet, ResourceMap } from '../../../base/common/map.js';
import * as objects from '../../../base/common/objects.js';
import { IExtUri } from '../../../base/common/resources.js';
import * as types from '../../../base/common/types.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { addToValueTree, ConfigurationTarget, getConfigurationValue, IConfigurationChange, IConfigurationChangeEvent, IConfigurationCompareResult, IConfigurationData, IConfigurationModel, IConfigurationOverrides, IConfigurationUpdateOverrides, IConfigurationValue, IInspectValue, IOverrides, removeFromValueTree, toValuesTree } from './configuration.js';
import { ConfigurationScope, Extensions, IConfigurationPropertySchema, IConfigurationRegistry, overrideIdentifiersFromKey, OVERRIDE_PROPERTY_REGEX } from './configurationRegistry.js';
import { FileOperation, IFileService } from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';
import { Registry } from '../../registry/common/platform.js';
import { Workspace } from '../../workspace/common/workspace.js';

function freeze<T>(data: T): T {
	return Object.isFrozen(data) ? data : objects.deepFreeze(data);
}

type InspectValue<V> = IInspectValue<V> & { merged?: V };

export class ConfigurationModel implements IConfigurationModel {

	static createEmptyModel(logService: ILogService): ConfigurationModel {
		return new ConfigurationModel({}, [], [], undefined, logService);
	}

	private readonly overrideConfigurations = new Map<string, ConfigurationModel>();

	constructor(
		private readonly _contents: any,
		private readonly _keys: string[],
		private readonly _overrides: IOverrides[],
		readonly raw: IStringDictionary<any> | ReadonlyArray<IStringDictionary<any> | ConfigurationModel> | undefined,
		private readonly logService: ILogService
	) {
	}

	private _rawConfiguration: ConfigurationModel | undefined;
	get rawConfiguration(): ConfigurationModel {
		if (!this._rawConfiguration) {
			if (this.raw) {
				const rawConfigurationModels = (Array.isArray(this.raw) ? this.raw : [this.raw]).map(raw => {
					if (raw instanceof ConfigurationModel) {
						return raw;
					}
					const parser = new ConfigurationModelParser('', this.logService);
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

	inspect<V>(section: string | undefined, overrideIdentifier?: string | null): InspectValue<V> {
		const that = this;
		return {
			get value() {
				return freeze(that.rawConfiguration.getValue<V>(section));
			},
			get override() {
				return overrideIdentifier ? freeze(that.rawConfiguration.getOverrideValue<V>(section, overrideIdentifier)) : undefined;
			},
			get merged() {
				return freeze(overrideIdentifier ? that.rawConfiguration.override(overrideIdentifier).getValue<V>(section) : that.rawConfiguration.getValue<V>(section));
			},
			get overrides() {
				const overrides: { readonly identifiers: string[]; readonly value: V }[] = [];
				for (const { contents, identifiers, keys } of that.rawConfiguration.overrides) {
					const value = new ConfigurationModel(contents, keys, [], undefined, that.logService).getValue<V>(section);
					if (value !== undefined) {
						overrides.push({ identifiers, value });
					}
				}
				return overrides.length ? freeze(overrides) : undefined;
			}
		};
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
		const raws = this.raw ? Array.isArray(this.raw) ? [...this.raw] : [this.raw] : [this];

		for (const other of others) {
			raws.push(...(other.raw ? Array.isArray(other.raw) ? other.raw : [other.raw] : [other]));
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
		return new ConfigurationModel(contents, keys, overrides, !raws.length || raws.every(raw => raw instanceof ConfigurationModel) ? undefined : raws, this.logService);
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

		return new ConfigurationModel(contents, this.keys, this.overrides, undefined, this.logService);
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
		addToValueTree(this.contents, key, value, e => this.logService.error(e));
		add = add || this.keys.indexOf(key) === -1;
		if (add) {
			this.keys.push(key);
		}
		if (OVERRIDE_PROPERTY_REGEX.test(key)) {
			const identifiers = overrideIdentifiersFromKey(key);
			const override = {
				identifiers,
				keys: Object.keys(this.contents[key]),
				contents: toValuesTree(this.contents[key], message => this.logService.error(message)),
			};
			const index = this.overrides.findIndex(o => arrays.equals(o.identifiers, identifiers));
			if (index !== -1) {
				this.overrides[index] = override;
			} else {
				this.overrides.push(override);
			}
		}
	}
}

export interface ConfigurationParseOptions {
	skipUnregistered?: boolean;
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

	constructor(
		protected readonly _name: string,
		protected readonly logService: ILogService
	) { }

	get configurationModel(): ConfigurationModel {
		return this._configurationModel || ConfigurationModel.createEmptyModel(this.logService);
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
		this._configurationModel = new ConfigurationModel(contents, keys, overrides, hasExcludedProperties ? [raw] : undefined /* raw has not changed */, this.logService);
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
				this.logService.error(`Error while parsing settings file ${this._name}: ${e}`);
				this._parseErrors = [e];
			}
		}

		return raw;
	}

	protected doParseRaw(raw: any, options?: ConfigurationParseOptions): IConfigurationModel & { restricted?: string[]; hasExcludedProperties?: boolean } {
		const configurationProperties = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurationProperties();
		const filtered = this.filter(raw, configurationProperties, true, options);
		raw = filtered.raw;
		const contents = toValuesTree(raw, message => this.logService.error(`Conflict in settings file ${this._name}: ${message}`));
		const keys = Object.keys(raw);
		const overrides = this.toOverrides(raw, message => this.logService.error(`Conflict in settings file ${this._name}: ${message}`));
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
				if (propertySchema?.restricted) {
					restricted.push(key);
				}
				if (this.shouldInclude(key, propertySchema, options)) {
					raw[key] = properties[key];
				} else {
					hasExcludedProperties = true;
				}
			}
		}
		return { raw, restricted, hasExcludedProperties };
	}

	private shouldInclude(key: string, propertySchema: IConfigurationPropertySchema | undefined, options: ConfigurationParseOptions): boolean {
		if (options.exclude?.includes(key)) {
			return false;
		}

		if (options.include?.includes(key)) {
			return true;
		}

		if (options.skipRestricted && propertySchema?.restricted) {
			return false;
		}

		if (options.skipUnregistered && !propertySchema) {
			return false;
		}

		const scope = propertySchema ? typeof propertySchema.scope !== 'undefined' ? propertySchema.scope : ConfigurationScope.WINDOW : undefined;
		if (scope === undefined || options.scopes === undefined) {
			return true;
		}

		return options.scopes.includes(scope);
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
		private readonly fileService: IFileService,
		private readonly logService: ILogService,
	) {
		super();
		this.parser = new ConfigurationModelParser(this.userSettingsResource.toString(), logService);
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
			return ConfigurationModel.createEmptyModel(this.logService);
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

	private toInspectValue(inspectValue: IInspectValue<V> | undefined | null): IInspectValue<V> | undefined {
		return inspectValue?.value !== undefined || inspectValue?.override !== undefined || inspectValue?.overrides !== undefined ? inspectValue : undefined;
	}

	private _defaultInspectValue: InspectValue<V> | undefined;
	private get defaultInspectValue(): InspectValue<V> {
		if (!this._defaultInspectValue) {
			this._defaultInspectValue = this.defaultConfiguration.inspect<V>(this.key, this.overrides.overrideIdentifier);
		}
		return this._defaultInspectValue;
	}

	get defaultValue(): V | undefined {
		return this.defaultInspectValue.merged;
	}

	get default(): IInspectValue<V> | undefined {
		return this.toInspectValue(this.defaultInspectValue);
	}

	private _policyInspectValue: InspectValue<V> | undefined | null;
	private get policyInspectValue(): InspectValue<V> | null {
		if (this._policyInspectValue === undefined) {
			this._policyInspectValue = this.policyConfiguration ? this.policyConfiguration.inspect<V>(this.key) : null;
		}
		return this._policyInspectValue;
	}

	get policyValue(): V | undefined {
		return this.policyInspectValue?.merged;
	}

	get policy(): IInspectValue<V> | undefined {
		return this.policyInspectValue?.value !== undefined ? { value: this.policyInspectValue.value } : undefined;
	}

	private _applicationInspectValue: InspectValue<V> | undefined | null;
	private get applicationInspectValue(): InspectValue<V> | null {
		if (this._applicationInspectValue === undefined) {
			this._applicationInspectValue = this.applicationConfiguration ? this.applicationConfiguration.inspect<V>(this.key) : null;
		}
		return this._applicationInspectValue;
	}

	get applicationValue(): V | undefined {
		return this.applicationInspectValue?.merged;
	}

	get application(): IInspectValue<V> | undefined {
		return this.toInspectValue(this.applicationInspectValue);
	}

	private _userInspectValue: InspectValue<V> | undefined;
	private get userInspectValue(): InspectValue<V> {
		if (!this._userInspectValue) {
			this._userInspectValue = this.userConfiguration.inspect<V>(this.key, this.overrides.overrideIdentifier);
		}
		return this._userInspectValue;
	}

	get userValue(): V | undefined {
		return this.userInspectValue.merged;
	}

	get user(): IInspectValue<V> | undefined {
		return this.toInspectValue(this.userInspectValue);
	}

	private _userLocalInspectValue: InspectValue<V> | undefined;
	private get userLocalInspectValue(): InspectValue<V> {
		if (!this._userLocalInspectValue) {
			this._userLocalInspectValue = this.localUserConfiguration.inspect<V>(this.key, this.overrides.overrideIdentifier);
		}
		return this._userLocalInspectValue;
	}

	get userLocalValue(): V | undefined {
		return this.userLocalInspectValue.merged;
	}

	get userLocal(): IInspectValue<V> | undefined {
		return this.toInspectValue(this.userLocalInspectValue);
	}

	private _userRemoteInspectValue: InspectValue<V> | undefined;
	private get userRemoteInspectValue(): InspectValue<V> {
		if (!this._userRemoteInspectValue) {
			this._userRemoteInspectValue = this.remoteUserConfiguration.inspect<V>(this.key, this.overrides.overrideIdentifier);
		}
		return this._userRemoteInspectValue;
	}

	get userRemoteValue(): V | undefined {
		return this.userRemoteInspectValue.merged;
	}

	get userRemote(): IInspectValue<V> | undefined {
		return this.toInspectValue(this.userRemoteInspectValue);
	}

	private _workspaceInspectValue: InspectValue<V> | undefined | null;
	private get workspaceInspectValue(): InspectValue<V> | null {
		if (this._workspaceInspectValue === undefined) {
			this._workspaceInspectValue = this.workspaceConfiguration ? this.workspaceConfiguration.inspect<V>(this.key, this.overrides.overrideIdentifier) : null;
		}
		return this._workspaceInspectValue;
	}

	get workspaceValue(): V | undefined {
		return this.workspaceInspectValue?.merged;
	}

	get workspace(): IInspectValue<V> | undefined {
		return this.toInspectValue(this.workspaceInspectValue);
	}

	private _workspaceFolderInspectValue: InspectValue<V> | undefined | null;
	private get workspaceFolderInspectValue(): InspectValue<V> | null {
		if (this._workspaceFolderInspectValue === undefined) {
			this._workspaceFolderInspectValue = this.folderConfigurationModel ? this.folderConfigurationModel.inspect<V>(this.key, this.overrides.overrideIdentifier) : null;
		}
		return this._workspaceFolderInspectValue;
	}

	get workspaceFolderValue(): V | undefined {
		return this.workspaceFolderInspectValue?.merged;
	}

	get workspaceFolder(): IInspectValue<V> | undefined {
		return this.toInspectValue(this.workspaceFolderInspectValue);
	}

	private _memoryInspectValue: InspectValue<V> | undefined;
	private get memoryInspectValue(): InspectValue<V> {
		if (this._memoryInspectValue === undefined) {
			this._memoryInspectValue = this.memoryConfigurationModel.inspect<V>(this.key, this.overrides.overrideIdentifier);
		}
		return this._memoryInspectValue;
	}

	get memoryValue(): V | undefined {
		return this.memoryInspectValue.merged;
	}

	get memory(): IInspectValue<V> | undefined {
		return this.toInspectValue(this.memoryInspectValue);
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
		private _remoteUserConfiguration: ConfigurationModel,
		private _workspaceConfiguration: ConfigurationModel,
		private _folderConfigurations: ResourceMap<ConfigurationModel>,
		private _memoryConfiguration: ConfigurationModel,
		private _memoryConfigurationByResource: ResourceMap<ConfigurationModel>,
		private readonly logService: ILogService
	) {
	}

	getValue(section: string | undefined, overrides: IConfigurationOverrides, workspace: Workspace | undefined): any {
		const consolidateConfigurationModel = this.getConsolidatedConfigurationModel(overrides, workspace);
		return consolidateConfigurationModel.getValue(section);
	}

	updateValue(key: string, value: any, overrides: IConfigurationUpdateOverrides = {}): void {
		let memoryConfiguration: ConfigurationModel | undefined;
		if (overrides.resource) {
			memoryConfiguration = this._memoryConfigurationByResource.get(overrides.resource);
			if (!memoryConfiguration) {
				memoryConfiguration = ConfigurationModel.createEmptyModel(this.logService);
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
		const consolidateConfigurationModel = this.getConsolidatedConfigurationModel(overrides, workspace);
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
			if (this._remoteUserConfiguration.isEmpty()) {
				this._userConfiguration = this._localUserConfiguration;
			} else {
				const merged = this._localUserConfiguration.merge(this._remoteUserConfiguration);
				this._userConfiguration = new ConfigurationModel(merged.contents, merged.keys, merged.overrides, undefined, this.logService);
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

	get folderConfigurations(): ResourceMap<ConfigurationModel> {
		return this._folderConfigurations;
	}

	private getConsolidatedConfigurationModel(overrides: IConfigurationOverrides, workspace: Workspace | undefined): ConfigurationModel {
		let configurationModel = this.getConsolidatedConfigurationModelForResource(overrides, workspace);
		if (overrides.overrideIdentifier) {
			configurationModel = configurationModel.override(overrides.overrideIdentifier);
		}
		if (!this._policyConfiguration.isEmpty()) {
			// clone by merging
			configurationModel = configurationModel.merge();
			for (const key of this._policyConfiguration.keys) {
				configurationModel.setValue(key, this._policyConfiguration.getValue(key));
			}
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
				keys: this._defaultConfiguration.keys,
			},
			policy: {
				contents: this._policyConfiguration.contents,
				overrides: this._policyConfiguration.overrides,
				keys: this._policyConfiguration.keys
			},
			application: {
				contents: this.applicationConfiguration.contents,
				overrides: this.applicationConfiguration.overrides,
				keys: this.applicationConfiguration.keys,
				raw: Array.isArray(this.applicationConfiguration.raw) ? undefined : this.applicationConfiguration.raw
			},
			userLocal: {
				contents: this.localUserConfiguration.contents,
				overrides: this.localUserConfiguration.overrides,
				keys: this.localUserConfiguration.keys,
				raw: Array.isArray(this.localUserConfiguration.raw) ? undefined : this.localUserConfiguration.raw
			},
			userRemote: {
				contents: this.remoteUserConfiguration.contents,
				overrides: this.remoteUserConfiguration.overrides,
				keys: this.remoteUserConfiguration.keys,
				raw: Array.isArray(this.remoteUserConfiguration.raw) ? undefined : this.remoteUserConfiguration.raw
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

	static parse(data: IConfigurationData, logService: ILogService): Configuration {
		const defaultConfiguration = this.parseConfigurationModel(data.defaults, logService);
		const policyConfiguration = this.parseConfigurationModel(data.policy, logService);
		const applicationConfiguration = this.parseConfigurationModel(data.application, logService);
		const userLocalConfiguration = this.parseConfigurationModel(data.userLocal, logService);
		const userRemoteConfiguration = this.parseConfigurationModel(data.userRemote, logService);
		const workspaceConfiguration = this.parseConfigurationModel(data.workspace, logService);
		const folders: ResourceMap<ConfigurationModel> = data.folders.reduce((result, value) => {
			result.set(URI.revive(value[0]), this.parseConfigurationModel(value[1], logService));
			return result;
		}, new ResourceMap<ConfigurationModel>());
		return new Configuration(
			defaultConfiguration,
			policyConfiguration,
			applicationConfiguration,
			userLocalConfiguration,
			userRemoteConfiguration,
			workspaceConfiguration,
			folders,
			ConfigurationModel.createEmptyModel(logService),
			new ResourceMap<ConfigurationModel>(),
			logService
		);
	}

	private static parseConfigurationModel(model: IConfigurationModel, logService: ILogService): ConfigurationModel {
		return new ConfigurationModel(model.contents, model.keys, model.overrides, model.raw, logService);
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

	constructor(
		readonly change: IConfigurationChange,
		private readonly previous: { workspace?: Workspace; data: IConfigurationData } | undefined,
		private readonly currentConfiguraiton: Configuration,
		private readonly currentWorkspace: Workspace | undefined,
		private readonly logService: ILogService
	) {
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
			this._previousConfiguration = Configuration.parse(this.previous.data, this.logService);
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
