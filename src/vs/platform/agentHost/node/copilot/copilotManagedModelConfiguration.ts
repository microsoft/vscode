/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotClient, CopilotSession } from '@github/copilot-sdk';
import type { IAgentModelInfo } from '../../common/agent.js';
import { isModelConfigurationDefault, modelConfigurationSourceKey, type IAgentModelConfigurationReport, type IAgentModelConfigurationOptions } from '../../common/agentModelConfiguration.js';
import { readAgentManagedModelDefaults, withAgentManagedModelDefaults, withAgentModelConfigurationDefaults } from '../../common/meta/agentModelConfigurationMeta.js';
import type { JsonPrimitive, ModelSelection } from '../../common/state/protocol/state.js';
import type { ILogService } from '../../../log/common/log.js';

type ResolvedManagedSettings = Awaited<ReturnType<CopilotClient['rpc']['managedSettings']['resolve']>>;
export type CopilotManagedModelPolicy = Pick<ResolvedManagedSettings, 'values' | 'meta'>;

const modelOptionKeys = ['thinkingLevel', 'contextSize', 'tier'] as const;

/** Reads the runtime-composed Auto startup default. */
export function getCopilotManagedAutoPreference(policy: CopilotManagedModelPolicy): string | undefined {
	return policy.values?.autoTier;
}

/** Keeps per-chat policy and the applied runtime model out of the shared catalog and preference store. */
export function createCopilotModelConfigurationReport(
	models: readonly IAgentModelInfo[],
	policy: CopilotManagedModelPolicy,
	current: Awaited<ReturnType<CopilotSession['rpc']['model']['getCurrent']>>,
	requested: ModelSelection | undefined,
	logService: ILogService,
): IAgentModelConfigurationReport {
	const entries: [string, IAgentModelConfigurationOptions][] = models.map(model => {
		const projected = projectCopilotManagedModelConfiguration(model, policy, logService);
		const properties = projected.configSchema?.properties ?? {};
		const defaults: [string, JsonPrimitive][] = [];
		const readOnly: string[] = [];
		const choices: [string, NonNullable<IAgentModelConfigurationOptions['choices']>[string]][] = [];
		for (const key of modelOptionKeys) {
			const property = properties[key];
			if (property?.enum) {
				choices.push([key, { values: property.enum, ...(property.enumLabels ? { labels: property.enumLabels } : {}), ...(property.enumDescriptions ? { descriptions: property.enumDescriptions } : {}) }]);
			}
			const value = property?.default;
			if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
				defaults.push([key, value]);
				if (property.readOnly) {
					readOnly.push(key);
				}
			}
		}
		const managedDefaults = readAgentManagedModelDefaults(projected)?.keys ?? [];
		return [model.id, { defaults: Object.fromEntries(defaults), readOnly, choices: Object.fromEntries(choices), ...(managedDefaults.length ? { managedDefaults } : {}) }];
	});
	const options = Object.fromEntries(entries);
	const currentModelId = current.modelId && (current.providerId ? `${current.providerId}/${current.modelId}` : current.modelId);
	const model = models.find(model => model.id === currentModelId);
	const config: Record<string, JsonPrimitive> = {};
	if (model && currentModelId) {
		const properties = model.configSchema?.properties;
		const values = {
			thinkingLevel: current.reasoningEffort,
			contextSize: current.contextTier === undefined ? undefined : current.contextTier === 'long_context' ? properties?.contextSize?.enum?.at(-1) : properties?.contextSize?.enum?.[0],
			tier: current.autoTier,
		};
		for (const key of modelOptionKeys) {
			const value = values[key];
			if (value === undefined || !properties?.[key]?.enum?.includes(value)) {
				continue;
			}
			config[key] = value;
			config[modelConfigurationSourceKey(key)] = options[currentModelId]?.readOnly.includes(key) ? 'managed'
				: requested?.id === currentModelId && requested.config?.[key] !== undefined && !isModelConfigurationDefault(requested.config, key) ? 'explicit' : 'default';
		}
	}
	return { models: options, ...(currentModelId ? { current: { id: currentModelId, config } } : {}) };
}

/** Projects runtime-composed startup defaults without inferring locks from server-normalized values. */
export function projectCopilotManagedModelConfiguration(model: IAgentModelInfo, policy: CopilotManagedModelPolicy, logService: ILogService): IAgentModelInfo {
	const schema = model.configSchema;
	const managedModel = policy.values?.model === model.id;
	if (!schema) {
		return managedModel ? { ...model, _meta: withAgentManagedModelDefaults(model._meta, { model: true, keys: [] }) } : model;
	}
	const properties = { ...schema.properties };
	const values = policy.values;
	const concreteModel = values?.model === model.id && model.id !== 'auto';
	const autoPreference = model.id === 'auto' ? getCopilotManagedAutoPreference(policy) : undefined;
	const entries = [
		{ key: 'thinkingLevel', value: concreteModel ? values.effortLevel : undefined },
		{
			key: 'contextSize',
			value: concreteModel && values.contextTier !== undefined
				? values.contextTier === 'long_context' ? properties.contextSize?.enum?.at(-1) : properties.contextSize?.enum?.[0]
				: undefined,
		},
		{ key: 'tier', value: autoPreference },
	];
	const managedKeys: string[] = [];
	for (const { key, value } of entries) {
		if (value === undefined) {
			continue;
		}
		const property = properties[key];
		if (!property?.enum?.includes(value)) {
			logService.warn(`[Copilot] Managed model option '${key}' is not offered by the selected model; leaving its picker unchanged.`);
			continue;
		}
		properties[key] = { ...property, default: value };
		managedKeys.push(key);
	}
	const keys = modelOptionKeys.filter(key => Object.hasOwn(properties, key));
	const meta = withAgentModelConfigurationDefaults(model._meta, keys);
	return {
		...model,
		configSchema: { ...schema, properties },
		_meta: managedModel || managedKeys.length ? withAgentManagedModelDefaults(meta, { model: managedModel, keys: managedKeys }) : meta,
	};
}

/** Leaves implicit options for the runtime to resolve only when that policy owns the selected model option. */
export function omitCopilotManagedModelDefaults(model: ModelSelection, policy: CopilotManagedModelPolicy): ModelSelection;
export function omitCopilotManagedModelDefaults(model: ModelSelection | undefined, policy: CopilotManagedModelPolicy): ModelSelection | undefined;
export function omitCopilotManagedModelDefaults(model: ModelSelection | undefined, policy: CopilotManagedModelPolicy): ModelSelection | undefined {
	if (!model?.config) {
		return model;
	}
	const values = policy.values;
	const concreteModel = values?.model === model.id && model.id !== 'auto';
	const autoPreference = model.id === 'auto' ? getCopilotManagedAutoPreference(policy) : undefined;
	const options = [
		['thinkingLevel', concreteModel && values.effortLevel !== undefined],
		['contextSize', concreteModel && values.contextTier !== undefined],
		['tier', autoPreference !== undefined],
	] as const;
	const config = { ...model.config };
	for (const [key, managed] of options) {
		if (managed && isModelConfigurationDefault(config, key)) {
			delete config[key];
		}
	}
	return { ...model, config };
}
