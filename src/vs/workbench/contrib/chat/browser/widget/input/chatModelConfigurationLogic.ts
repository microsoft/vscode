/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStringDictionary } from '../../../../../../base/common/collections.js';
import { IJSONSchema } from '../../../../../../base/common/jsonSchema.js';
import { ILanguageModelConfigurationSchema } from '../../../common/languageModels.js';

/**
 * Extracts the schema-default values from a model configuration schema, keyed by
 * property name. Properties without a `default` are omitted.
 */
export function extractSchemaDefaults(schema: ILanguageModelConfigurationSchema | undefined): IStringDictionary<unknown> {
	const defaults: IStringDictionary<unknown> = {};
	if (schema?.properties) {
		for (const [key, propSchema] of Object.entries(schema.properties)) {
			if (propSchema.default !== undefined) {
				defaults[key] = propSchema.default;
			}
		}
	}
	return defaults;
}

/**
 * Filters a configuration down to what the *current* schema accepts, so neither a value
 * captured against an older schema nor one supplied by an experiment treatment can be pinned
 * as an invalid override. A value is kept only when its property is declared and every
 * constraint this understands is satisfied:
 *   1. Keys absent from the current schema are dropped (removed properties).
 *   2. `enum` and `const` must contain the value.
 *   3. `type` must match, including a union of types.
 *   4. Numeric bounds and string `pattern`/length are enforced when declared.
 * A property using a composite schema (`anyOf`, `oneOf`, `allOf`, `not`, `$ref`) is failed
 * closed, since a value cannot be checked against a shape this does not interpret. When the
 * schema is missing entirely, nothing can be validated and an empty configuration is returned.
 */
export function filterConfigurationToSchema(
	values: IStringDictionary<unknown>,
	schema: ILanguageModelConfigurationSchema | undefined,
): IStringDictionary<unknown> {
	const properties = schema?.properties;
	if (!properties) {
		return {};
	}
	const result: IStringDictionary<unknown> = {};
	for (const [key, value] of Object.entries(values)) {
		const propSchema = Object.hasOwn(properties, key) ? properties[key] : undefined;
		if (!propSchema) {
			continue;
		}
		if (satisfiesPropertySchema(value, propSchema)) {
			result[key] = value;
		}
	}
	return result;
}

function satisfiesPropertySchema(value: unknown, schema: IJSONSchema): boolean {
	// A shape this does not interpret cannot be checked, so the value is not kept.
	if (schema.anyOf || schema.oneOf || schema.allOf || schema.not || schema.$ref) {
		return false;
	}
	if (schema.const !== undefined && value !== schema.const) {
		return false;
	}
	if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
		return false;
	}
	if (schema.type !== undefined) {
		const types = Array.isArray(schema.type) ? schema.type : [schema.type];
		if (!types.some(type => matchesJSONSchemaType(value, type))) {
			return false;
		}
	}
	if (typeof value === 'number') {
		// `exclusiveMinimum`/`exclusiveMaximum` are a boolean modifier in draft 4 and a number
		// in later drafts, so only the numeric form is comparable.
		const exclusiveMinimum = typeof schema.exclusiveMinimum === 'number' ? schema.exclusiveMinimum : undefined;
		const exclusiveMaximum = typeof schema.exclusiveMaximum === 'number' ? schema.exclusiveMaximum : undefined;
		if ((schema.minimum !== undefined && value < schema.minimum)
			|| (schema.maximum !== undefined && value > schema.maximum)
			|| (exclusiveMinimum !== undefined && value <= exclusiveMinimum)
			|| (exclusiveMaximum !== undefined && value >= exclusiveMaximum)) {
			return false;
		}
	}
	if (typeof value === 'string') {
		if ((schema.minLength !== undefined && value.length < schema.minLength)
			|| (schema.maxLength !== undefined && value.length > schema.maxLength)) {
			return false;
		}
		if (schema.pattern !== undefined) {
			try {
				if (!new RegExp(schema.pattern).test(value)) {
					return false;
				}
			} catch {
				return false;
			}
		}
	}
	return true;
}

function matchesJSONSchemaType(value: unknown, type: string): boolean {
	switch (type) {
		case 'string': return typeof value === 'string';
		case 'number': return typeof value === 'number' && Number.isFinite(value);
		case 'integer': return typeof value === 'number' && Number.isInteger(value);
		case 'boolean': return typeof value === 'boolean';
		case 'null': return value === null;
		case 'array': return Array.isArray(value);
		case 'object': return typeof value === 'object' && value !== null && !Array.isArray(value);
		default: return false;
	}
}

/**
 * Resolves the effective configuration for a model within a single
 * `(location, sessionType)` scope.
 *
 * A *present* stored entry — even an empty one, which marks an explicit
 * reset-to-default — wins and is merged over the schema defaults. Only a
 * *missing* entry (`undefined`) falls back to the profile-global value, which is
 * the one-time migration for setups that pre-date per-editor scoping.
 *
 * Schema defaults are merged in every branch so a value the user never
 * explicitly set (e.g. a model's default `contextSize`) is always present in the
 * resolved configuration. Otherwise the model picker — which paints the schema
 * default when a key is absent — would show one value while the request and the
 * context-usage widget, which read the resolved configuration, fall back to the
 * model's full native window. See issue #320393.
 *
 * Distinguishing "present but empty" from "absent" is what prevents a newly
 * opened editor from reverting an explicit default selection back to a stale
 * profile-global value. See issue #320393.
 */
export function resolveModelConfiguration(
	storedEntry: IStringDictionary<unknown> | undefined,
	schemaDefaults: IStringDictionary<unknown>,
	globalConfig: IStringDictionary<unknown> | undefined,
): IStringDictionary<unknown> {
	if (storedEntry) {
		return { ...schemaDefaults, ...storedEntry };
	}
	return globalConfig ? { ...schemaDefaults, ...globalConfig } : { ...schemaDefaults };
}

/**
 * Computes the entry to persist for a model after applying `values` on top of the
 * `current` effective configuration. Values equal to their schema default are
 * stripped so storage holds only genuine user overrides.
 *
 * The result may be an empty object: callers are expected to still persist it so
 * that an explicit reset-to-default is remembered and does not fall back to the
 * profile-global value on the next read. See issue #320393.
 */
export function computeStoredConfiguration(
	current: IStringDictionary<unknown>,
	values: IStringDictionary<unknown>,
	schemaDefaults: IStringDictionary<unknown>,
): IStringDictionary<unknown> {
	const merged = { ...current, ...values };
	const stripped: IStringDictionary<unknown> = {};
	for (const [key, value] of Object.entries(merged)) {
		if (schemaDefaults[key] !== value) {
			stripped[key] = value;
		}
	}
	return stripped;
}
