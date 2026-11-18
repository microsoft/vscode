/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { formatTokenCount } from '../../../base/common/numbers.js';
import { localize } from '../../../nls.js';
import { hasLongContextSurcharge, type ICAPIModelBilling } from './meta/agentModelMeta.js';
import { ReasoningEffortConfigKey } from './reasoningEffort.js';
import type { ConfigPropertySchema, JsonPrimitive, ModelSelection } from './state/protocol/state.js';
import { isObject } from '../../../base/common/types.js';

/** Model-configuration key for the selected context-window size, in tokens. */
export const ContextSizeConfigKey = 'contextSize';

/**
 * @deprecated Legacy key that stored the resolved tier string (`'default'` / `'long_context'`)
 * directly. Replaced by the numeric {@link ContextSizeConfigKey}; Copilot still reads it from persisted
 * selections, before {@link ContextSizeConfigKey}, for backward compatibility.
 */
export const ContextTierConfigKey = 'contextTier';

/** Copilot's alias of the `thinkingLevel` key, which Copilot reads when that key is absent. */
export const CopilotReasoningEffortConfigKey = 'reasoningEffort';

/** The context windows that can be requested without naming a size: a model's standard window, or its largest. */
export const modelContextTiers = ['default', 'long_context'] as const;
export type ModelContextTier = typeof modelContextTiers[number];

/** Other keys that carry the same option as a key, which an explicit value of that key supersedes. */
const modelConfigurationAliasKeys: Readonly<Record<string, readonly string[]>> = {
	[ContextSizeConfigKey]: [ContextTierConfigKey],
	[ReasoningEffortConfigKey]: [CopilotReasoningEffortConfigKey],
};

export const agentModelConfigurationReportKey = 'vscode.modelConfiguration';

export interface IAgentModelConfigurationOptions {
	readonly defaults: Readonly<Record<string, JsonPrimitive>>;
	readonly readOnly: readonly string[];
	readonly managedDefaults?: readonly string[];
	readonly choices?: Readonly<Record<string, { readonly values: JsonPrimitive[]; readonly labels?: string[]; readonly descriptions?: string[] }>>;
}

/** A server-owned, chat-scoped snapshot; personal preferences are not stored here. */
export interface IAgentModelConfigurationReport {
	readonly models: Readonly<Record<string, IAgentModelConfigurationOptions>>;
	readonly current?: ModelSelection;
}

function readPrimitiveRecord(value: unknown): Record<string, JsonPrimitive> | undefined {
	if (!isObject(value)) {
		return undefined;
	}
	const entries: [string, JsonPrimitive][] = [];
	for (const [key, item] of Object.entries(value)) {
		if (isModelConfigurationPrimitive(item)) {
			entries.push([key, item]);
		} else {
			return undefined;
		}
	}
	return Object.fromEntries(entries);
}

function isModelConfigurationPrimitive(value: unknown): value is JsonPrimitive {
	return value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value));
}

/** Reads only the current chat's report, including explicit removal across JSON serialization. */
export function readAgentModelConfigurationReport(config: Readonly<Record<string, unknown>> | undefined, chat: string): IAgentModelConfigurationReport | undefined {
	const reports = config?.[agentModelConfigurationReportKey];
	const candidate: unknown = isObject(reports) ? Object.entries(reports).find(([key]) => key === chat)?.[1] : undefined;
	if (!isObject(candidate)) {
		return undefined;
	}
	const value: { models?: unknown; current?: unknown } = candidate;
	if (!isObject(value.models)) {
		return undefined;
	}
	const models: [string, IAgentModelConfigurationOptions][] = [];
	for (const [id, options] of Object.entries(value.models)) {
		if (!isObject(options)) {
			return undefined;
		}
		const fields: { defaults?: unknown; readOnly?: unknown; choices?: unknown; managedDefaults?: unknown } = options;
		const defaults = readPrimitiveRecord(fields.defaults);
		const readOnly = fields.readOnly;
		if (!defaults || !Array.isArray(readOnly) || !readOnly.every((key): key is string => typeof key === 'string' && Object.hasOwn(defaults, key))) {
			return undefined;
		}
		const managedDefaults = fields.managedDefaults;
		if (managedDefaults !== undefined && (!Array.isArray(managedDefaults) || !managedDefaults.every((key): key is string => typeof key === 'string' && Object.hasOwn(defaults, key)))) {
			return undefined;
		}
		const choices: Record<string, { values: JsonPrimitive[]; labels?: string[]; descriptions?: string[] }> = {};
		if (fields.choices !== undefined) {
			if (!isObject(fields.choices)) {
				return undefined;
			}
			for (const [key, raw] of Object.entries(fields.choices)) {
				if (!isObject(raw)) {
					return undefined;
				}
				const choice: { values?: unknown; labels?: unknown; descriptions?: unknown } = raw;
				if (!Array.isArray(choice.values) || !choice.values.every(isModelConfigurationPrimitive)
					|| (choice.labels !== undefined && (!Array.isArray(choice.labels) || choice.labels.length !== choice.values.length || !choice.labels.every((label): label is string => typeof label === 'string')))
					|| (choice.descriptions !== undefined && (!Array.isArray(choice.descriptions) || choice.descriptions.length !== choice.values.length || !choice.descriptions.every((description): description is string => typeof description === 'string')))) {
					return undefined;
				}
				choices[key] = { values: choice.values, ...(choice.labels ? { labels: choice.labels } : {}), ...(choice.descriptions ? { descriptions: choice.descriptions } : {}) };
			}
		}
		models.push([id, { defaults, readOnly, ...(managedDefaults !== undefined ? { managedDefaults } : {}), ...(fields.choices !== undefined ? { choices } : {}) }]);
	}
	let current: ModelSelection | undefined;
	if (value.current !== undefined) {
		if (!isObject(value.current)) {
			return undefined;
		}
		const selection: { id?: unknown; config?: unknown } = value.current;
		if (typeof selection.id !== 'string') {
			return undefined;
		}
		const config = selection.config === undefined ? undefined : readPrimitiveRecord(selection.config);
		if (selection.config !== undefined && !config) {
			return undefined;
		}
		current = { id: selection.id, ...(config ? { config } : {}) };
	}
	return { models: Object.fromEntries(models), ...(current ? { current } : {}) };
}

/** Scalar provenance survives ModelSelection.config without becoming an SDK model option. */
export function modelConfigurationSourceKey(key: string): string {
	return `vscode.modelConfiguration.${key}.source`;
}

export function isModelConfigurationDefault(configuration: Readonly<Record<string, unknown>> | undefined, key: string): boolean {
	const source = configuration?.[modelConfigurationSourceKey(key)];
	return source === 'default' || source === 'managed';
}

/**
 * Sets model options as explicit choices, so a provider applies them even where a managed default owns the option,
 * and removes each option's legacy alias, which could otherwise override or contradict it. Other options are kept.
 */
export function withExplicitModelConfiguration(selection: ModelSelection, values: Readonly<Record<string, JsonPrimitive>>): ModelSelection {
	const config = { ...selection.config };
	for (const [key, value] of Object.entries(values)) {
		for (const alias of modelConfigurationAliasKeys[key] ?? []) {
			delete config[alias];
			delete config[modelConfigurationSourceKey(alias)];
		}
		config[key] = value;
		config[modelConfigurationSourceKey(key)] = 'explicit';
	}
	return { ...selection, config };
}

/**
 * The context-window size a tier selects from a model's context-size property: its first (standard) window for
 * `default`, its last (largest) for `long_context`.
 */
export function getContextSizeForTier(property: ConfigPropertySchema | undefined, tier: ModelContextTier): JsonPrimitive | undefined {
	return tier === 'long_context' ? property?.enum?.at(-1) : property?.enum?.[0];
}

/**
 * Synthesizes the shared context-size picker property for a CAPI model with a
 * distinct long-context tier.
 */
export function createContextSizeConfigSchemaProperty(billing: ICAPIModelBilling | undefined): ConfigPropertySchema | undefined {
	const tokenPrices = billing?.tokenPrices;
	const defaultMax = tokenPrices?.contextMax;
	const longContextMax = tokenPrices?.longContext?.contextMax;
	return createContextSizeConfigSchemaPropertyFromLimits(
		defaultMax,
		longContextMax,
		hasLongContextSurcharge(billing) ? defaultMax : longContextMax,
	);
}

/**
 * Synthesizes the shared context-size picker property from provider-owned limits.
 */
export function createContextSizeConfigSchemaPropertyFromLimits(defaultMax: number | undefined, longContextMax: number | undefined, selectedDefault = defaultMax): ConfigPropertySchema | undefined {
	if (!defaultMax || !longContextMax || defaultMax >= longContextMax) {
		return undefined;
	}

	return {
		type: 'number',
		title: localize('copilot.modelContextSize.title', "Context Size"),
		description: localize('copilot.modelContextSize.description', "Selects the context window size for this model."),
		default: selectedDefault === longContextMax ? longContextMax : defaultMax,
		enum: [defaultMax, longContextMax],
		enumLabels: [formatTokenCount(defaultMax), formatTokenCount(longContextMax)],
		enumDescriptions: [
			localize('copilot.modelContextSize.default', "Default"),
			localize('copilot.modelContextSize.longerSessions', "Longer sessions"),
		],
	};
}

/** Reads a finite, positive context-window selection from a model config. */
export function getModelContextSize(model: ModelSelection | undefined): number | undefined {
	const value = Number(model?.config?.[ContextSizeConfigKey]);
	return Number.isFinite(value) && value > 0 ? value : undefined;
}
