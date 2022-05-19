/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce } from 'vs/base/common/arrays';
import { IStringDictionary } from 'vs/base/common/collections';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { equals } from 'vs/base/common/objects';
import { isEmptyObject } from 'vs/base/common/types';
import { addToValueTree, IOverrides, toValuesTree } from 'vs/platform/configuration/common/configuration';
import { ConfigurationModel } from 'vs/platform/configuration/common/configurationModels';
import { Extensions, IConfigurationRegistry, overrideIdentifiersFromKey, OVERRIDE_PROPERTY_REGEX } from 'vs/platform/configuration/common/configurationRegistry';
import { ILogService } from 'vs/platform/log/common/log';
import { IPolicyService, PolicyDefinition, PolicyName, PolicyValue } from 'vs/platform/policy/common/policy';
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

export interface IPolicyConfiguration {
	readonly onDidChangeConfiguration: Event<ConfigurationModel>;
	readonly configurationModel: ConfigurationModel;
	initialize(): Promise<ConfigurationModel>;
}

export class NullPolicyConfiguration implements IPolicyConfiguration {
	readonly onDidChangeConfiguration = Event.None;
	readonly configurationModel = new ConfigurationModel();
	async initialize() { return this.configurationModel; }
}

export class PolicyConfiguration extends Disposable implements IPolicyConfiguration {

	private readonly _onDidChangeConfiguration = this._register(new Emitter<ConfigurationModel>());
	readonly onDidChangeConfiguration = this._onDidChangeConfiguration.event;

	private _configurationModel = new ConfigurationModel();
	get configurationModel() { return this._configurationModel; }

	constructor(
		private readonly defaultConfiguration: DefaultConfiguration,
		@IPolicyService private readonly policyService: IPolicyService,
		@ILogService private readonly logService: ILogService
	) {
		super();
	}

	async initialize(): Promise<ConfigurationModel> {
		this.update(await this.registerPolicyDefinitions(this.defaultConfiguration.configurationModel.keys), false);
		this._register(this.policyService.onDidChange(policyNames => this.onDidChangePolicies(policyNames)));
		this._register(this.defaultConfiguration.onDidChangeConfiguration(async ({ properties }) => this.update(await this.registerPolicyDefinitions(properties), true)));
		return this._configurationModel;
	}

	private async registerPolicyDefinitions(properties: string[]): Promise<string[]> {
		const policyDefinitions: IStringDictionary<PolicyDefinition> = {};
		const keys: string[] = [];
		const configurationProperties = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurationProperties();

		for (const key of properties) {
			const config = configurationProperties[key];
			if (!config) {
				// Config is removed. So add it to the list if in case it was registered as policy before
				keys.push(key);
				continue;
			}
			if (config.policy) {
				if (config.type !== 'string' && config.type !== 'number') {
					this.logService.warn(`Policy ${config.policy.name} has unsupported type ${config.type}`);
					continue;
				}
				keys.push(key);
				policyDefinitions[config.policy.name] = { type: config.type };
			}
		}

		if (!isEmptyObject(policyDefinitions)) {
			await this.policyService.registerPolicyDefinitions(policyDefinitions);
		}

		return keys;
	}

	private onDidChangePolicies(policyNames: readonly PolicyName[]): void {
		const policyConfigurations = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getPolicyConfigurations();
		const keys = coalesce(policyNames.map(policyName => policyConfigurations.get(policyName)));
		this.update(keys, true);
	}

	private update(keys: string[], trigger: boolean): void {
		const configurationProperties = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurationProperties();
		const changed: [string, PolicyValue | undefined][] = [];
		const wasEmpty = this._configurationModel.isEmpty();

		for (const key of keys) {
			const policyName = configurationProperties[key]?.policy?.name;
			if (policyName) {
				const policyValue = this.policyService.getPolicyValue(policyName);
				if (wasEmpty ? policyValue !== undefined : !equals(this._configurationModel.getValue(key), policyValue)) {
					changed.push([key, policyValue]);
				}
			} else {
				if (this._configurationModel.getValue(key) !== undefined) {
					changed.push([key, undefined]);
				}
			}
		}

		if (changed.length) {
			const old = this._configurationModel;
			this._configurationModel = new ConfigurationModel();
			for (const key of old.keys) {
				this._configurationModel.setValue(key, old.getValue(key));
			}
			for (const [key, policyValue] of changed) {
				if (policyValue === undefined) {
					this._configurationModel.removeValue(key);
				} else {
					this._configurationModel.setValue(key, policyValue);
				}
			}
			if (trigger) {
				this._onDidChangeConfiguration.fire(this._configurationModel);
			}
		}
	}


}
