/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals } from '../../../../base/common/objects.js';
import { toValuesTree, IConfigurationModel, IConfigurationOverrides, IConfigurationValue, IConfigurationChange } from '../../../../platform/configuration/common/configuration.js';
import { Configuration as BaseConfiguration, ConfigurationModelParser, ConfigurationModel, ConfigurationParseOptions } from '../../../../platform/configuration/common/configurationModels.js';
import { IStoredWorkspaceFolder } from '../../../../platform/workspaces/common/workspaces.js';
import { Workspace } from '../../../../platform/workspace/common/workspace.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { URI } from '../../../../base/common/uri.js';
import { isBoolean } from '../../../../base/common/types.js';
import { distinct } from '../../../../base/common/arrays.js';
import { ILogService } from '../../../../platform/log/common/log.js';

export class WorkspaceConfigurationModelParser extends ConfigurationModelParser {

	private _folders: IStoredWorkspaceFolder[] = [];
	private _transient: boolean = false;
	private _settingsModelParser: ConfigurationModelParser;
	private _launchModel: ConfigurationModel;
	private _tasksModel: ConfigurationModel;

	constructor(name: string, logService: ILogService) {
		super(name, logService);
		this._settingsModelParser = new ConfigurationModelParser(name, logService);
		this._launchModel = ConfigurationModel.createEmptyModel(logService);
		this._tasksModel = ConfigurationModel.createEmptyModel(logService);
	}

	get folders(): IStoredWorkspaceFolder[] {
		return this._folders;
	}

	get transient(): boolean {
		return this._transient;
	}

	get settingsModel(): ConfigurationModel {
		return this._settingsModelParser.configurationModel;
	}

	get launchModel(): ConfigurationModel {
		return this._launchModel;
	}

	get tasksModel(): ConfigurationModel {
		return this._tasksModel;
	}

	reparseWorkspaceSettings(configurationParseOptions: ConfigurationParseOptions): void {
		this._settingsModelParser.reparse(configurationParseOptions);
	}

	getRestrictedWorkspaceSettings(): string[] {
		return this._settingsModelParser.restrictedConfigurations;
	}

	protected override doParseRaw(raw: any, configurationParseOptions?: ConfigurationParseOptions): IConfigurationModel {
		this._folders = (raw['folders'] || []) as IStoredWorkspaceFolder[];
		this._transient = isBoolean(raw['transient']) && raw['transient'];
		this._settingsModelParser.parseRaw(raw['settings'], configurationParseOptions);
		this._launchModel = this.createConfigurationModelFrom(raw, 'launch');
		this._tasksModel = this.createConfigurationModelFrom(raw, 'tasks');
		return super.doParseRaw(raw, configurationParseOptions);
	}

	private createConfigurationModelFrom(raw: any, key: string): ConfigurationModel {
		const data = raw[key];
		if (data) {
			const contents = toValuesTree(data, message => console.error(`Conflict in settings file ${this._name}: ${message}`));
			const scopedContents = Object.create(null);
			scopedContents[key] = contents;
			const keys = Object.keys(data).map(k => `${key}.${k}`);
			return new ConfigurationModel(scopedContents, keys, [], undefined, this.logService);
		}
		return ConfigurationModel.createEmptyModel(this.logService);
	}
}

export class StandaloneConfigurationModelParser extends ConfigurationModelParser {

	constructor(name: string, private readonly scope: string, logService: ILogService,) {
		super(name, logService);
	}

	protected override doParseRaw(raw: any, configurationParseOptions?: ConfigurationParseOptions): IConfigurationModel {
		const contents = toValuesTree(raw, message => console.error(`Conflict in settings file ${this._name}: ${message}`));
		const scopedContents = Object.create(null);
		scopedContents[this.scope] = contents;
		const keys = Object.keys(raw).map(key => `${this.scope}.${key}`);
		return { contents: scopedContents, keys, overrides: [] };
	}

}

export class Configuration extends BaseConfiguration {

	constructor(
		defaults: ConfigurationModel,
		policy: ConfigurationModel,
		application: ConfigurationModel,
		localUser: ConfigurationModel,
		remoteUser: ConfigurationModel,
		workspaceConfiguration: ConfigurationModel,
		folders: ResourceMap<ConfigurationModel>,
		memoryConfiguration: ConfigurationModel,
		memoryConfigurationByResource: ResourceMap<ConfigurationModel>,
		private readonly _workspace: Workspace | undefined,
		logService: ILogService
	) {
		super(defaults, policy, application, localUser, remoteUser, workspaceConfiguration, folders, memoryConfiguration, memoryConfigurationByResource, logService);
	}

	override getValue(key: string | undefined, overrides: IConfigurationOverrides = {}): any {
		return super.getValue(key, overrides, this._workspace);
	}

	override inspect<C>(key: string, overrides: IConfigurationOverrides = {}): IConfigurationValue<C> {
		return super.inspect(key, overrides, this._workspace);
	}

	override keys(): {
		default: string[];
		user: string[];
		workspace: string[];
		workspaceFolder: string[];
	} {
		return super.keys(this._workspace);
	}

	override compareAndDeleteFolderConfiguration(folder: URI): IConfigurationChange {
		if (this._workspace && this._workspace.folders.length > 0 && this._workspace.folders[0].uri.toString() === folder.toString()) {
			// Do not remove workspace configuration
			return { keys: [], overrides: [] };
		}
		return super.compareAndDeleteFolderConfiguration(folder);
	}

	compare(other: Configuration): IConfigurationChange {
		const compare = (fromKeys: string[], toKeys: string[], overrideIdentifier?: string): string[] => {
			const keys: string[] = [];
			keys.push(...toKeys.filter(key => fromKeys.indexOf(key) === -1));
			keys.push(...fromKeys.filter(key => toKeys.indexOf(key) === -1));
			keys.push(...fromKeys.filter(key => {
				// Ignore if the key does not exist in both models
				if (toKeys.indexOf(key) === -1) {
					return false;
				}
				// Compare workspace value
				if (!equals(this.getValue(key, { overrideIdentifier }), other.getValue(key, { overrideIdentifier }))) {
					return true;
				}
				// Compare workspace folder value
				return this._workspace && this._workspace.folders.some(folder => !equals(this.getValue(key, { resource: folder.uri, overrideIdentifier }), other.getValue(key, { resource: folder.uri, overrideIdentifier })));
			}));
			return keys;
		};
		const keys = compare(this.allKeys(), other.allKeys());
		const overrides: [string, string[]][] = [];
		const allOverrideIdentifiers = distinct([...this.allOverrideIdentifiers(), ...other.allOverrideIdentifiers()]);
		for (const overrideIdentifier of allOverrideIdentifiers) {
			const keys = compare(this.getAllKeysForOverrideIdentifier(overrideIdentifier), other.getAllKeysForOverrideIdentifier(overrideIdentifier), overrideIdentifier);
			if (keys.length) {
				overrides.push([overrideIdentifier, keys]);
			}
		}
		return { keys, overrides };
	}

}
