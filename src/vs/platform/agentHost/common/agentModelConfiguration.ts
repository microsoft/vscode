/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { formatTokenCount } from '../../../base/common/numbers.js';
import { localize } from '../../../nls.js';
import { hasLongContextSurcharge, type ICAPIModelBilling } from './meta/agentModelMeta.js';
import type { ConfigPropertySchema, JsonPrimitive, ModelSelection } from './state/protocol/state.js';
import { isObject } from '../../../base/common/types.js';

/** Model-configuration key for the selected context-window size, in tokens. */
export const ContextSizeConfigKey = 'contextSize';

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
	readonly sourceModels?: readonly { readonly id: string; readonly modelSourceId: string; readonly options: IAgentModelConfigurationOptions }[];
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

function readModelConfigurationOptions(options: unknown): IAgentModelConfigurationOptions | undefined {
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
	return { defaults, readOnly, ...(managedDefaults !== undefined ? { managedDefaults } : {}), ...(fields.choices !== undefined ? { choices } : {}) };
}

/** Reads only the current chat's report, including explicit removal across JSON serialization. */
export function readAgentModelConfigurationReport(config: Readonly<Record<string, unknown>> | undefined, chat: string): IAgentModelConfigurationReport | undefined {
	const reports = config?.[agentModelConfigurationReportKey];
	const candidate: unknown = isObject(reports) ? Object.entries(reports).find(([key]) => key === chat)?.[1] : undefined;
	if (!isObject(candidate)) {
		return undefined;
	}
	const value: { models?: unknown; sourceModels?: unknown; current?: unknown } = candidate;
	if (!isObject(value.models)) {
		return undefined;
	}
	const models: [string, IAgentModelConfigurationOptions][] = [];
	for (const [id, raw] of Object.entries(value.models)) {
		const options = readModelConfigurationOptions(raw);
		if (!options) {
			return undefined;
		}
		models.push([id, options]);
	}
	const sourceModels: { id: string; modelSourceId: string; options: IAgentModelConfigurationOptions }[] = [];
	if (value.sourceModels !== undefined) {
		if (!Array.isArray(value.sourceModels)) {
			return undefined;
		}
		for (const raw of value.sourceModels) {
			if (!isObject(raw)) {
				return undefined;
			}
			const source: { id?: unknown; modelSourceId?: unknown; options?: unknown } = raw;
			const options = readModelConfigurationOptions(source.options);
			if (!options || typeof source.id !== 'string' || typeof source.modelSourceId !== 'string' || !source.modelSourceId.trim()) {
				return undefined;
			}
			sourceModels.push({ id: source.id, modelSourceId: source.modelSourceId, options });
		}
	}
	let current: ModelSelection | undefined;
	if (value.current !== undefined) {
		if (!isObject(value.current)) {
			return undefined;
		}
		const selection: { id?: unknown; config?: unknown; modelSourceId?: unknown } = value.current;
		if (typeof selection.id !== 'string' || (selection.modelSourceId !== undefined && (typeof selection.modelSourceId !== 'string' || !selection.modelSourceId.trim()))) {
			return undefined;
		}
		const config = selection.config === undefined ? undefined : readPrimitiveRecord(selection.config);
		if (selection.config !== undefined && !config) {
			return undefined;
		}
		current = { id: selection.id, ...(config ? { config } : {}), ...(selection.modelSourceId !== undefined ? { modelSourceId: selection.modelSourceId } : {}) };
	}
	return { models: Object.fromEntries(models), ...(value.sourceModels !== undefined ? { sourceModels } : {}), ...(current ? { current } : {}) };
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
