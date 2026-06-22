/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
				this._configurationModel.setValue(key, this.getDefaultValue(key, propertySchema));
			} else {
				this._configurationModel.removeValue(key);
			}
		}
	}

	protected getDefaultValue(_key: string, propertySchema: IRegisteredConfigurationPropertySchema): unknown {
		return deepClone(propertySchema.default);
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

	/** Last definition submitted per policy name; avoids redundant re-registration. */
	private readonly _submittedPolicyDefinitions = new Map<PolicyName, PolicyDefinition>();

	/** Maps each policy-controlled setting key to its policy name, so removed keys can be re-resolved. */
	private readonly _policyNameByKey = new Map<string, PolicyName>();

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

	private toPolicyDefinitionType(configType: unknown, policyName: PolicyName): 'string' | 'number' | 'boolean' | undefined {
		// `configType` may be a single type or a union (e.g. `['array', 'null']`).
		// Normalize to an array and keep only the types we can represent as policies.
		const configTypes = Array.isArray(configType) ? configType : [configType];
		const supportedTypes = configTypes.filter(type => type === 'string' || type === 'number' || type === 'array' || type === 'object' || type === 'boolean');
		if (supportedTypes.length === 0) {
			this.logService.warn(`PolicyConfiguration#updatePolicyDefinitions - policy '${policyName}' has unsupported type '${configType}'`);
			return undefined;
		}
		return supportedTypes.includes('number') ? 'number' : supportedTypes.includes('boolean') ? 'boolean' : 'string';
	}

	private async updatePolicyDefinitions(properties: string[]): Promise<string[]> {
		this.logService.trace('PolicyConfiguration#updatePolicyDefinitions', properties);
		const keys: string[] = [];
		const policyNames = new Set<PolicyName>();
		const configurationProperties = this.configurationRegistry.getConfigurationProperties();
		const excludedConfigurationProperties = this.configurationRegistry.getExcludedConfigurationProperties();

		for (const key of properties) {
			const config = configurationProperties[key] ?? excludedConfigurationProperties[key];
			if (!config) {
				keys.push(key); // deregistered — update() will clear this key's applied policy value
				const removedPolicyName = this._policyNameByKey.get(key);
				if (removedPolicyName !== undefined) {
					this._policyNameByKey.delete(key);
					policyNames.add(removedPolicyName);
				}
				continue;
			}
			const policyName = config.policy?.name ?? config.policyReference?.name;
			if (policyName) {
				keys.push(key);
				policyNames.add(policyName);
				this._policyNameByKey.set(key, policyName);
			}
		}

		const changedDefinitions: IStringDictionary<PolicyDefinition> = {};
		for (const policyName of policyNames) {
			const definition = this.resolvePolicyDefinition(policyName);
			if (definition && !this.isSamePolicyDefinition(this._submittedPolicyDefinitions.get(policyName), definition)) {
				this._submittedPolicyDefinitions.set(policyName, definition);
				changedDefinitions[policyName] = definition;
			}
		}

		if (!isEmptyObject(changedDefinitions)) {
			await this.policyService.updatePolicyDefinitions(changedDefinitions);
		}

		return keys;
	}

	private isSamePolicyDefinition(a: PolicyDefinition | undefined, b: PolicyDefinition): boolean {
		return !!a && a.type === b.type && a.value === b.value && a.managedSettings === b.managedSettings && a.restrictedValue === b.restrictedValue;
	}

	/** Resolve the authoritative definition: owner wins; references provide a bare type fallback. */
	private resolvePolicyDefinition(policyName: PolicyName): PolicyDefinition | undefined {
		const configurationProperties = this.configurationRegistry.getConfigurationProperties();
		const excludedConfigurationProperties = this.configurationRegistry.getExcludedConfigurationProperties();

		const ownerKey = this.configurationRegistry.getPolicyConfigurations().get(policyName);
		if (ownerKey !== undefined) {
			const config = configurationProperties[ownerKey] ?? excludedConfigurationProperties[ownerKey];
			if (config?.policy) {
				const type = this.toPolicyDefinitionType(config.type, policyName);
				const { value, managedSettings, restrictedValue } = config.policy;
				return type ? { type, value, managedSettings, restrictedValue } : undefined;
			}
		}

		const referenceKeys = this.configurationRegistry.getPolicyReferenceConfigurations().get(policyName);
		for (const referenceKey of referenceKeys ?? []) {
			const config = configurationProperties[referenceKey] ?? excludedConfigurationProperties[referenceKey];
			if (config?.policyReference) {
				const type = this.toPolicyDefinitionType(config.type, policyName);
				return type ? { type } : undefined;
			}
		}

		return undefined;
	}

	private onDidChangePolicies(policyNames: readonly PolicyName[]): void {
		this.logService.trace('PolicyConfiguration#onDidChangePolicies', policyNames);
		const policyConfigurations = this.configurationRegistry.getPolicyConfigurations();
		const policyReferenceConfigurations = this.configurationRegistry.getPolicyReferenceConfigurations();
		const keys: string[] = [];
		for (const policyName of policyNames) {
			const owner = policyConfigurations.get(policyName);
			if (owner) {
				keys.push(owner);
			}
			const references = policyReferenceConfigurations.get(policyName);
			if (references) {
				keys.push(...references);
			}
		}
		this.update(keys, true);
	}

	private update(keys: string[], trigger: boolean): void {
		this.logService.trace('PolicyConfiguration#update', keys);
		const configurationProperties = this.configurationRegistry.getConfigurationProperties();
		const excludedConfigurationProperties = this.configurationRegistry.getExcludedConfigurationProperties();
		const changed: [string, unknown][] = [];
		const wasEmpty = this._configurationModel.isEmpty();

		for (const key of keys) {
			const property = configurationProperties[key] ?? excludedConfigurationProperties[key];
			const policyName = property?.policy?.name ?? property?.policyReference?.name;
			if (policyName) {
				let policyValue: PolicyValue | ParsedType | undefined = this.policyService.getPolicyValue(policyName);
				// `property.type` may be a single type or a union (e.g. `['array', 'null']`).
				// A string policy value carries a JSON payload that must be parsed unless the
				// setting itself is (or can be) a plain string.
				const acceptsStringType = Array.isArray(property.type) ? property.type.includes('string') : property.type === 'string';
				if (isString(policyValue) && !acceptsStringType) {
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
