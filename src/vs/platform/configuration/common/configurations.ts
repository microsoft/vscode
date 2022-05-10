/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStringDictionary } from 'vs/base/common/collections';
import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { addToValueTree, IOverrides, toValuesTree } from 'vs/platform/configuration/common/configuration';
import { ConfigurationModel } from 'vs/platform/configuration/common/configurationModels';
import { Extensions, IConfigurationRegistry, overrideIdentifiersFromKey, OVERRIDE_PROPERTY_REGEX } from 'vs/platform/configuration/common/configurationRegistry';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IFileService } from 'vs/platform/files/common/files';
import { ILogService } from 'vs/platform/log/common/log';
import { PolicyModel } from 'vs/platform/policy/common/policy';
import { Registry } from 'vs/platform/registry/common/platform';

export class DefaultConfiguration extends Disposable {

	private readonly _onDidChangeConfiguration = this._register(new Emitter<{ defaults: ConfigurationModel; properties: string[] }>());
	readonly onDidChangeConfiguration = this._onDidChangeConfiguration.event;

	private _configurationModel: ConfigurationModel | undefined;
	get configurationModel(): ConfigurationModel {
		if (!this._configurationModel) {
			this._configurationModel = new DefaultConfigurationModel(this.getConfigurationDefaultOverrides());
		}
		return this._configurationModel;
	}

	async initialize(): Promise<ConfigurationModel> {
		this._configurationModel = undefined;
		this._register(Registry.as<IConfigurationRegistry>(Extensions.Configuration).onDidUpdateConfiguration(({ properties, defaultsOverrides }) => this.onDidUpdateConfiguration(properties, defaultsOverrides)));
		return this.configurationModel;
	}

	reload(): ConfigurationModel {
		this._configurationModel = undefined;
		return this.configurationModel;
	}

	protected onDidUpdateConfiguration(properties: string[], defaultsOverrides?: boolean): void {
		this._configurationModel = undefined;
		this._onDidChangeConfiguration.fire({ defaults: this.configurationModel, properties });
	}

	protected getConfigurationDefaultOverrides(): IStringDictionary<any> {
		return {};
	}

}

export class DefaultConfigurationModel extends ConfigurationModel {

	constructor(configurationDefaultsOverrides: IStringDictionary<any> = {}) {
		const properties = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurationProperties();
		const keys = Object.keys(properties);
		const contents: any = Object.create(null);
		const overrides: IOverrides[] = [];

		for (const key in properties) {
			const defaultOverrideValue = configurationDefaultsOverrides[key];
			const value = defaultOverrideValue !== undefined ? defaultOverrideValue : properties[key].default;
			addToValueTree(contents, key, value, message => console.error(`Conflict in default settings: ${message}`));
		}
		for (const key of Object.keys(contents)) {
			if (OVERRIDE_PROPERTY_REGEX.test(key)) {
				overrides.push({
					identifiers: overrideIdentifiersFromKey(key),
					keys: Object.keys(contents[key]),
					contents: toValuesTree(contents[key], message => console.error(`Conflict in default settings file: ${message}`)),
				});
			}
		}

		super(contents, keys, overrides);
	}
}

export class PolicyConfiguration extends Disposable {

	private readonly _onDidChangeConfiguration = this._register(new Emitter<ConfigurationModel>());
	readonly onDidChangeConfiguration = this._onDidChangeConfiguration.event;

	private readonly policies: PolicyModel;

	constructor(
		private readonly defaultConfiguration: DefaultConfiguration,
		fileService: IFileService,
		environmentService: IEnvironmentService,
		logService: ILogService
	) {
		super();
		this.policies = new PolicyModel(fileService, environmentService, logService);
	}

	private _configurationModel: ConfigurationModel | undefined;
	get configurationModel(): ConfigurationModel {
		if (!this._configurationModel) {
			const configurationProperties = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurationProperties();
			const keys: string[] = [];
			const contents: any = Object.create(null);
			for (const key of this.defaultConfiguration.configurationModel.keys) {
				const policyName = configurationProperties[key].policy?.name;
				if (!policyName) {
					continue;
				}
				const value = this.policies.getPolicy(policyName);
				if (value === undefined) {
					continue;
				}
				keys.push(key);
				addToValueTree(contents, key, value, message => console.error(`Conflict in policy settings: ${message}`));
			}
			this._configurationModel = new ConfigurationModel(contents, keys, []);
		}
		return this._configurationModel;
	}

	async initialize(): Promise<ConfigurationModel> {
		await this.policies.initialize();
		this._register(this.policies.onDidChange(e => this.onDidChange()));
		this._register(this.defaultConfiguration.onDidChangeConfiguration(({ properties }) => this.onDidDefaultConfigurationChange(properties)));
		return this.reload();
	}

	reload(): ConfigurationModel {
		this._configurationModel = undefined;
		return this.configurationModel;
	}

	private onDidDefaultConfigurationChange(properties: string[]): void {
		const configurationProperties = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurationProperties();
		if (properties.some(key => configurationProperties[key].policy?.name)) {
			this.onDidChange();
		}
	}

	private onDidChange(): void {
		this._onDidChangeConfiguration.fire(this.reload());
	}

}
