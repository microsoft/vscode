/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce } from 'vs/base/common/arrays';
import { IStringDictionary } from 'vs/base/common/collections';
import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { equals } from 'vs/base/common/objects';
import { addToValueTree, IOverrides, toValuesTree } from 'vs/platform/configuration/common/configuration';
import { ConfigurationModel } from 'vs/platform/configuration/common/configurationModels';
import { Extensions, IConfigurationRegistry, overrideIdentifiersFromKey, OVERRIDE_PROPERTY_REGEX } from 'vs/platform/configuration/common/configurationRegistry';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IFileService } from 'vs/platform/files/common/files';
import { ILogService } from 'vs/platform/log/common/log';
import { FilePolicyService } from 'vs/platform/policy/common/filePolicyService';
import { IPolicyService, NullPolicyService, PolicyName } from 'vs/platform/policy/common/policy';
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

	private readonly policyService: IPolicyService;
	private readonly policyNamesToKeys = new Map<PolicyName, string>();

	private _configurationModel = new ConfigurationModel();
	get configurationModel() { return this._configurationModel; }

	constructor(
		private readonly defaultConfiguration: DefaultConfiguration,
		fileService: IFileService,
		environmentService: IEnvironmentService,
		logService: ILogService
	) {
		super();
		this.policyService = environmentService.policyFile ? new FilePolicyService(environmentService.policyFile, fileService, logService) : new NullPolicyService();
	}

	async initialize(): Promise<ConfigurationModel> {
		await this.policyService.initialize();
		this.updateKeys(this.defaultConfiguration.configurationModel.keys, false);
		this._register(this.policyService.onDidChange(policyNames => this.onDidChangePolicies(policyNames)));
		this._register(this.defaultConfiguration.onDidChangeConfiguration(({ properties }) => this.updateKeys(properties, true)));
		return this._configurationModel;
	}

	private updateKeys(keys: string[], trigger: boolean): void {
		const configurationProperties = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurationProperties();
		const keyPolicyNamePairs: [string, PolicyName][] = coalesce(keys.map(key => {
			const policyName = configurationProperties[key].policy?.name;
			return policyName ? [key, policyName] : undefined;
		}));
		this.update(keyPolicyNamePairs, trigger);
	}

	private onDidChangePolicies(policyNames: readonly PolicyName[]): void {
		const keyPolicyNamePairs: [string, PolicyName][] = coalesce(policyNames.map(policyName => {
			const key = this.policyNamesToKeys.get(policyName);
			return key ? [key, policyName] : undefined;
		}));
		this.update(keyPolicyNamePairs, true);
	}

	private update(keyPolicyNamePairs: [string, PolicyName][], trigger: boolean): void {
		if (!keyPolicyNamePairs.length) {
			return;
		}

		const updated: string[] = [];
		this._configurationModel = this._configurationModel.isFrozen() ? this._configurationModel.clone() : this._configurationModel;
		const isEmpty = this._configurationModel.isEmpty();
		for (const [key, policyName] of keyPolicyNamePairs) {
			this.policyNamesToKeys.set(policyName, key);
			const value = this.policyService.getPolicyValue(policyName);
			if (!isEmpty && equals(this._configurationModel.getValue(key), value)) {
				continue;
			}
			if (value === undefined) {
				this._configurationModel.removeValue(key);
			} else {
				this._configurationModel.setValue(key, value);
			}
			updated.push(key);
		}

		if (updated.length && trigger) {
			this._onDidChangeConfiguration.fire(this._configurationModel);
		}
	}

}
