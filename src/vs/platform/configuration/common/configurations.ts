/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce } from '../../../base/common/arrays.js';
import { IStringDictionary } from '../../../base/common/collections.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { deepClone, equals } from '../../../base/common/objects.js';
import { isEmptyObject, isString } from '../../../base/common/types.js';
import { ConfigurationModel } from './configurationModels.js';
import { Extensions, IConfigurationRegistry, IRegisteredConfigurationPropertySchema } from './configurationRegistry.js';
import { ILogService, NullLogService } from '../../log/common/log.js';
import { IPolicyService, PolicyDefinition, PolicyValue } from '../../policy/common/policy.js';
import { Registry } from '../../registry/common/platform.js';
import { getErrorMessage } from '../../../base/common/errors.js';
import * as json from '../../../base/common/json.js';
import { PolicyName } from '../../../base/common/policy.js';

export class DefaultConfiguration extends Disposable {

	private readonly _onDidChangeConfiguration = this._register(new Emitter<{ defaults: ConfigurationModel; properties: string[] }>());
	readonly onDidChangeConfiguration = this._onDidChangeConfiguration.event;

	private _configurationModel: ConfigurationModel;
	get configurationModel(): ConfigurationModel {
		return this._configurationModel;
	}

	constructor(private readonly logService: ILogService) {
		super();
		this._configurationModel = ConfigurationModel.createEmptyModel(logService);
	}

	async initialize(): Promise<ConfigurationModel> {
		this.resetConfigurationModel();
		this._register(Registry.as<IConfigurationRegistry>(Extensions.Configuration).onDidUpdateConfiguration(({ properties, defaultsOverrides }) => this.onDidUpdateConfiguration(Array.from(properties), defaultsOverrides)));
		return this.configurationModel;
	}

	reload(): ConfigurationModel {
		this.resetConfigurationModel();
		return this.configurationModel;
	}

	protected onDidUpdateConfiguration(properties: string[], defaultsOverrides?: boolean): void {
		this.updateConfigurationModel(properties, Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurationProperties());
		this._onDidChangeConfiguration.fire({ defaults: this.configurationModel, properties });
	}

	protected getConfigurationDefaultOverrides(): IStringDictionary<unknown> {
		return {};
	}

	private resetConfigurationModel(): void {
		this._configurationModel = ConfigurationModel.createEmptyModel(this.logService);
		const properties = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurationProperties();
		this.updateConfigurationModel(Object.keys(properties), properties);
	}

	private updateConfigurationModel(properties: string[], configurationProperties: IStringDictionary<IRegisteredConfigurationPropertySchema>): void {
		const configurationDefaultsOverrides = this.getConfigurationDefaultOverrides();
		for (const key of properties) {
			const defaultOverrideValue = configurationDefaultsOverrides[key];
			const propertySchema = configurationProperties[key];
			if (defaultOverrideValue !== undefined) {
				this._configurationModel.setValue(key, defaultOverrideValue);
			} else if (propertySchema) {
				this._configurationModel.setValue(key, deepClone(propertySchema.default));
			} else {
				this._configurationModel.removeValue(key);
			}
		}
	}

}

export interface IPolicyConfiguration {
	readonly onDidChangeConfiguration: Event<ConfigurationModel>;
	readonly configurationModel: ConfigurationModel;
	initialize(): Promise<ConfigurationModel>;
}

export class NullPolicyConfiguration implements IPolicyConfiguration {
	readonly onDidChangeConfiguration = Event.None;
	readonly configurationModel = ConfigurationModel.createEmptyModel(new NullLogService());
	async initialize() { return this.configurationModel; }
}

type ParsedType = IStringDictionary<unknown> | Array<unknown>;

export class PolicyConfiguration extends Disposable implements IPolicyConfiguration {

	private readonly _onDidChangeConfiguration = this._register(new Emitter<ConfigurationModel>());
	readonly onDidChangeConfiguration = this._onDidChangeConfiguration.event;

	private readonly configurationRegistry: IConfigurationRegistry;

	private _configurationModel: ConfigurationModel;
	get configurationModel() { return this._configurationModel; }

	constructor(
		private readonly defaultConfiguration: DefaultConfiguration,
		@IPolicyService private readonly policyService: IPolicyService,
		@ILogService private readonly logService: ILogService
	) {
		super();
		this._configurationModel = ConfigurationModel.createEmptyModel(this.logService);
		this.configurationRegistry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
	}

	async initialize(): Promise<ConfigurationModel> {
		this.logService.trace('PolicyConfiguration#initialize');

		this.update(await this.updatePolicyDefinitions(this.defaultConfiguration.configurationModel.keys), false);
		this.update(await this.updatePolicyDefinitions(Object.keys(this.configurationRegistry.getExcludedConfigurationProperties())), false);
		this._register(this.policyService.onDidChange(policyNames => this.onDidChangePolicies(policyNames)));
		this._register(this.defaultConfiguration.onDidChangeConfiguration(async ({ properties }) => this.update(await this.updatePolicyDefinitions(properties), true)));
		return this._configurationModel;
	}

	private async updatePolicyDefinitions(properties: string[]): Promise<string[]> {
		this.logService.trace('PolicyConfiguration#updatePolicyDefinitions', properties);
		const policyDefinitions: IStringDictionary<PolicyDefinition> = {};
		const keys: string[] = [];
		const configurationProperties = this.configurationRegistry.getConfigurationProperties();
		const excludedConfigurationProperties = this.configurationRegistry.getExcludedConfigurationProperties();

		for (const key of properties) {
			const config = configurationProperties[key] ?? excludedConfigurationProperties[key];
			if (!config) {
				// Config is removed. So add it to the list if in case it was registered as policy before
				keys.push(key);
				continue;
			}
			if (config.policy) {
				if (config.type !== 'string' && config.type !== 'number' && config.type !== 'array' && config.type !== 'object' && config.type !== 'boolean') {
					this.logService.warn(`Policy ${config.policy.name} has unsupported type ${config.type}`);
					continue;
				}
				const { value } = config.policy;
				keys.push(key);
				policyDefinitions[config.policy.name] = {
					type: config.type === 'number' ? 'number' : config.type === 'boolean' ? 'boolean' : 'string',
					value,
				};
			}
		}

		if (!isEmptyObject(policyDefinitions)) {
			await this.policyService.updatePolicyDefinitions(policyDefinitions);
		}

		return keys;
	}

	private onDidChangePolicies(policyNames: readonly PolicyName[]): void {
		this.logService.trace('PolicyConfiguration#onDidChangePolicies', policyNames);
		const policyConfigurations = this.configurationRegistry.getPolicyConfigurations();
		const keys = coalesce(policyNames.map(policyName => policyConfigurations.get(policyName)));
		this.update(keys, true);
	}

	private update(keys: string[], trigger: boolean): void {
		this.logService.trace('PolicyConfiguration#update', keys);
		const configurationProperties = this.configurationRegistry.getConfigurationProperties();
		const excludedConfigurationProperties = this.configurationRegistry.getExcludedConfigurationProperties();
		const changed: [string, unknown][] = [];
		const wasEmpty = this._configurationModel.isEmpty();

		for (const key of keys) {
			const proprety = configurationProperties[key] ?? excludedConfigurationProperties[key];
			const policyName = proprety?.policy?.name;
			if (policyName) {
				let policyValue: PolicyValue | ParsedType | undefined = this.policyService.getPolicyValue(policyName);
				if (isString(policyValue) && proprety.type !== 'string') {
					try {
						policyValue = this.parse(policyValue);
					} catch (e) {
						this.logService.error(`Error parsing policy value ${policyName}:`, getErrorMessage(e));
						continue;
					}
				}
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
			this.logService.trace('PolicyConfiguration#changed', changed);
			const old = this._configurationModel;
			this._configurationModel = ConfigurationModel.createEmptyModel(this.logService);
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

	private parse(content: string): ParsedType {
		let raw: ParsedType = {};
		let currentProperty: string | null = null;
		let currentParent: ParsedType = [];
		const previousParents: Array<ParsedType> = [];
		const parseErrors: json.ParseError[] = [];

		function onValue(value: unknown) {
			if (Array.isArray(currentParent)) {
				currentParent.push(value);
			} else if (currentProperty !== null) {
				if (currentParent[currentProperty] !== undefined) {
					throw new Error(`Duplicate property found: ${currentProperty}`);
				}
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
				currentParent = previousParents.pop()!;
			},
			onArrayBegin: () => {
				const array: unknown[] = [];
				onValue(array);
				previousParents.push(currentParent);
				currentParent = array;
				currentProperty = null;
			},
			onArrayEnd: () => {
				currentParent = previousParents.pop()!;
			},
			onLiteralValue: onValue,
			onError: (error: json.ParseErrorCode, offset: number, length: number) => {
				parseErrors.push({ error, offset, length });
			}
		};

		if (content) {
			json.visit(content, visitor);
			raw = (currentParent[0] as ParsedType | undefined) || raw;
		}

		if (parseErrors.length > 0) {
			throw new Error(parseErrors.map(e => getErrorMessage(e.error)).join('\n'));
		}

		return raw;
	}
}
