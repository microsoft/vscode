/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IValue } from './promptFileParser.js';
import { ILanguageModelChatMetadata, type ILanguageModelChatMetadataAndIdentifier, type ILanguageModelConfigurationSchema } from '../languageModels.js';

export interface ICustomAgentModelEntry {
	readonly name: string;
	readonly reasoningEffort?: string;
	readonly contextSize?: number;
}

export type CustomAgentModelEntry = string | ICustomAgentModelEntry;

export interface IResolvedCustomAgentModel {
	readonly entry: CustomAgentModelEntry;
	readonly model: ILanguageModelChatMetadataAndIdentifier;
	readonly modelConfiguration: Record<string, string | number> | undefined;
}

export interface ICustomAgentModelConfigurationProperty {
	readonly key: string;
	readonly schema: NonNullable<ILanguageModelConfigurationSchema['properties']>[string];
}

export interface ICustomAgentContextSizeBounds {
	readonly minimum: number;
	readonly maximum: number;
}

export interface ICustomAgentModelInvocationOverrides {
	readonly reasoningEffort?: string;
	readonly contextSize?: number;
}

const defaultCustomAgentContextSizeMinimum = 10_000;

function isPositiveSafeInteger(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

export function getCustomAgentModelName(entry: CustomAgentModelEntry): string {
	return typeof entry === 'string' ? entry : entry.name;
}

export function isCustomAgentModelEntry(value: unknown): value is CustomAgentModelEntry {
	if (typeof value === 'string') {
		return value.trim().length > 0;
	}
	if (typeof value !== 'object' || value === null) {
		return false;
	}
	const entry = value as { name?: unknown; reasoningEffort?: unknown; contextSize?: unknown };
	const keys = Object.keys(value);
	return keys.every(key => key === 'name' || key === 'reasoningEffort' || key === 'contextSize') &&
		typeof entry.name === 'string' && entry.name.trim().length > 0 &&
		(entry.reasoningEffort === undefined || typeof entry.reasoningEffort === 'string' && entry.reasoningEffort.trim().length > 0) &&
		(entry.contextSize === undefined || isPositiveSafeInteger(entry.contextSize));
}

export function isCustomAgentModelEntries(value: unknown): value is readonly CustomAgentModelEntry[] {
	return Array.isArray(value) && value.every(isCustomAgentModelEntry);
}

export function customAgentModelEntriesEqual(a: readonly CustomAgentModelEntry[] | undefined, b: readonly CustomAgentModelEntry[] | undefined): boolean {
	if (a === b) {
		return true;
	}
	if (!a || !b || a.length !== b.length) {
		return false;
	}
	return a.every((entry, index) => {
		const other = b[index];
		return typeof entry === 'string' || typeof other === 'string'
			? entry === other
			: entry.name === other.name && entry.reasoningEffort === other.reasoningEffort && entry.contextSize === other.contextSize;
	});
}

export function getCustomAgentModelConfigurationProperty(metadata: ILanguageModelChatMetadata, group: 'navigation' | 'tokens'): ICustomAgentModelConfigurationProperty | undefined {
	const property = Object.entries(metadata.configurationSchema?.properties ?? {}).find(([, schema]) => schema.group === group);
	return property ? { key: property[0], schema: property[1] } : undefined;
}

export function getCustomAgentContextSizeBounds(metadata: ILanguageModelChatMetadata, schema: ICustomAgentModelConfigurationProperty['schema']): ICustomAgentContextSizeBounds {
	const enumMaximum = Math.max(...(schema.enum?.filter(isPositiveSafeInteger) ?? []), 0);
	const schemaMaximum = typeof schema.maximum === 'number' && Number.isFinite(schema.maximum) ? Math.floor(schema.maximum) : 0;
	const declaredMaximums = [enumMaximum, schemaMaximum].filter(maximum => maximum > 0);
	const maximum = declaredMaximums.length ? Math.min(...declaredMaximums) : Math.max(1, Math.floor(metadata.maxInputTokens));
	const schemaMinimum = typeof schema.minimum === 'number' && Number.isFinite(schema.minimum) ? Math.ceil(schema.minimum) : defaultCustomAgentContextSizeMinimum;
	return {
		minimum: Math.min(Math.max(1, schemaMinimum), maximum),
		maximum,
	};
}

function acceptsString(schema: ICustomAgentModelConfigurationProperty['schema']): boolean {
	return schema.type === 'string' || Array.isArray(schema.type) && schema.type.includes('string') || schema.type === undefined && (!schema.enum || schema.enum.every(value => typeof value === 'string'));
}

function acceptsNumber(schema: ICustomAgentModelConfigurationProperty['schema']): boolean {
	return schema.type === 'number' || schema.type === 'integer' || Array.isArray(schema.type) && (schema.type.includes('number') || schema.type.includes('integer')) || schema.type === undefined && (!schema.enum || schema.enum.every(value => typeof value === 'number'));
}

export function getCustomAgentModelConfiguration(entry: CustomAgentModelEntry, metadata: ILanguageModelChatMetadata): Record<string, string | number> | undefined {
	if (typeof entry === 'string') {
		return undefined;
	}
	const properties = metadata.configurationSchema?.properties;
	if (!properties) {
		return undefined;
	}

	const result: Record<string, string | number> = {};
	if (entry.reasoningEffort !== undefined) {
		const property = getCustomAgentModelConfigurationProperty(metadata, 'navigation');
		if (property) {
			const { key, schema } = property;
			if (acceptsString(schema) && (!schema.enum || schema.enum.includes(entry.reasoningEffort))) {
				result[key] = entry.reasoningEffort;
			}
		}
	}
	if (isPositiveSafeInteger(entry.contextSize)) {
		const property = getCustomAgentModelConfigurationProperty(metadata, 'tokens');
		if (property) {
			const { key, schema } = property;
			if (acceptsNumber(schema)) {
				const bounds = getCustomAgentContextSizeBounds(metadata, schema);
				result[key] = Math.max(bounds.minimum, Math.min(bounds.maximum, entry.contextSize));
			}
		}
	}
	return Object.keys(result).length ? result : undefined;
}

/**
 * Maps per-invocation model overrides to the selected provider's configuration
 * properties. Unlike custom-agent frontmatter defaults, invocation overrides
 * are strict so the caller can correct an incompatible request and retry.
 */
export function getCustomAgentModelInvocationConfiguration(overrides: ICustomAgentModelInvocationOverrides, metadata: ILanguageModelChatMetadata): Record<string, string | number> | undefined {
	const result: Record<string, string | number> = {};
	const modelName = ILanguageModelChatMetadata.asQualifiedName(metadata);

	if (overrides.reasoningEffort !== undefined) {
		const reasoningEffort = overrides.reasoningEffort;
		if (typeof reasoningEffort !== 'string' || !reasoningEffort.trim()) {
			throw new Error(`reasoningEffort must be a non-empty string for resolved model '${modelName}'.`);
		}

		const property = getCustomAgentModelConfigurationProperty(metadata, 'navigation');
		if (!property || !acceptsString(property.schema)) {
			throw new Error(`Resolved model '${modelName}' does not support reasoningEffort overrides.`);
		}

		const supportedValues = property.schema.enum?.filter((value): value is string => typeof value === 'string');
		if (property.schema.enum && !property.schema.enum.includes(reasoningEffort)) {
			throw new Error(`reasoningEffort '${reasoningEffort}' is not supported by resolved model '${modelName}'. Supported values: ${supportedValues?.join(', ') || 'none'}.`);
		}
		result[property.key] = reasoningEffort;
	}

	if (overrides.contextSize !== undefined) {
		const contextSize = overrides.contextSize;
		if (!isPositiveSafeInteger(contextSize)) {
			throw new Error(`contextSize must be a positive integer for resolved model '${modelName}'.`);
		}

		const property = getCustomAgentModelConfigurationProperty(metadata, 'tokens');
		if (!property || !acceptsNumber(property.schema)) {
			throw new Error(`Resolved model '${modelName}' does not support contextSize overrides.`);
		}

		const bounds = getCustomAgentContextSizeBounds(metadata, property.schema);
		if (contextSize < bounds.minimum || contextSize > bounds.maximum) {
			throw new Error(`contextSize ${contextSize} is outside the supported range for resolved model '${modelName}'. Supported range: ${bounds.minimum}-${bounds.maximum}.`);
		}
		result[property.key] = contextSize;
	}

	return Object.keys(result).length ? result : undefined;
}

export function resolveCustomAgentModel(entries: readonly CustomAgentModelEntry[], models: readonly ILanguageModelChatMetadataAndIdentifier[]): IResolvedCustomAgentModel | undefined {
	for (const entry of entries) {
		const model = models.find(candidate => ILanguageModelChatMetadata.matchesQualifiedName(getCustomAgentModelName(entry), candidate.metadata));
		if (model) {
			return { entry, model, modelConfiguration: getCustomAgentModelConfiguration(entry, model.metadata) };
		}
	}
	return undefined;
}

export function parseCustomAgentModelEntries(value: IValue | undefined): readonly CustomAgentModelEntry[] | undefined {
	if (!value) {
		return undefined;
	}
	if (value.type === 'scalar') {
		const name = value.value.trim();
		return name ? [name] : undefined;
	}
	if (value.type !== 'sequence') {
		return undefined;
	}

	const result: CustomAgentModelEntry[] = [];
	for (const item of value.items) {
		if (item.type === 'scalar') {
			const name = item.value.trim();
			if (name) {
				result.push(name);
			}
			continue;
		}
		if (item.type !== 'map') {
			continue;
		}

		const nameValue = item.properties.find(property => property.key.value === 'name')?.value;
		if (nameValue?.type !== 'scalar' || !nameValue.value.trim()) {
			continue;
		}
		const reasoningEffortValue = item.properties.find(property => property.key.value === 'reasoning-effort')?.value;
		const contextSizeValue = item.properties.find(property => property.key.value === 'context-size')?.value;
		const reasoningEffort = reasoningEffortValue?.type === 'scalar' ? reasoningEffortValue.value.trim() || undefined : undefined;
		const contextSize = contextSizeValue?.type === 'scalar' ? Number(contextSizeValue.value) : undefined;
		result.push({
			name: nameValue.value.trim(),
			...(reasoningEffort !== undefined ? { reasoningEffort } : {}),
			...(isPositiveSafeInteger(contextSize) ? { contextSize } : {}),
		});
	}
	return result.length ? result : undefined;
}
