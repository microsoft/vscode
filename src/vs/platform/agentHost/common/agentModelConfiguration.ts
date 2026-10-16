/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { formatTokenCount } from '../../../base/common/numbers.js';
import { localize } from '../../../nls.js';
import type { IByokLmContextSizeOptions } from './agentHostByokLm.js';
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

/**
 * Synthesizes the context-size picker property for a BYOK model from the sizes
 * its renderer provider advertises (see {@link IByokLmContextSizeOptions}). The
 * provider's labels, descriptions and default win; a missing label falls back to
 * the formatted token count, and a missing default to the largest size, which is
 * what the model runs against when nothing is selected.
 */
export function createByokContextSizeConfigSchemaProperty(options: IByokLmContextSizeOptions | undefined): ConfigPropertySchema | undefined {
	const values = normalizeByokContextSizes(options);
	// Same threshold as `resolveByokContextSize`: a picker and an applied size go together.
	if (!options || values.length < 2) {
		return undefined;
	}
	// Labels and descriptions are parallel to the advertised values, not the normalized ones.
	const { labels, descriptions } = options;
	const indexOf = (value: number) => options.values.indexOf(value);
	return {
		type: 'number',
		title: localize('copilot.modelContextSize.title', "Context Size"),
		description: localize('copilot.modelContextSize.description', "Selects the context window size for this model."),
		default: resolveByokContextSize(options, undefined),
		enum: values,
		enumLabels: values.map(value => labels?.[indexOf(value)] || formatTokenCount(value)),
		...(descriptions ? { enumDescriptions: values.map(value => descriptions[indexOf(value)] ?? '') } : {}),
	};
}

/**
 * Resolves the prompt-token budget a session runs a BYOK model against:
 * `selected` when the model still offers it, else the provider's default, else
 * the largest size offered. `undefined` when the model offers fewer than two
 * sizes — no choice means no picker, and a budget the user cannot see or change
 * must not be applied — so a stale selection never reaches the runtime as an
 * arbitrary number either.
 */
export function resolveByokContextSize(options: IByokLmContextSizeOptions | undefined, selected: number | undefined): number | undefined {
	const values = normalizeByokContextSizes(options);
	if (!options || values.length < 2) {
		return undefined;
	}
	if (selected !== undefined && values.includes(selected)) {
		return selected;
	}
	if (options.default !== undefined && values.includes(options.default)) {
		return options.default;
	}
	return Math.max(...values);
}

/** The distinct, finite, positive sizes of {@link IByokLmContextSizeOptions.values}, in advertised order. */
function normalizeByokContextSizes(options: IByokLmContextSizeOptions | undefined): number[] {
	const values: number[] = [];
	for (const value of options?.values ?? []) {
		if (typeof value === 'number' && Number.isFinite(value) && value > 0 && !values.includes(value)) {
			values.push(value);
		}
	}
	return values;
}

/** Reads a finite, positive context-window selection from a model config. */
export function getModelContextSize(model: ModelSelection | undefined): number | undefined {
	const value = Number(model?.config?.[ContextSizeConfigKey]);
	return Number.isFinite(value) && value > 0 ? value : undefined;
}
