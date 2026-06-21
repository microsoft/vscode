/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStringDictionary } from '../../../../../../base/common/collections.js';
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
 * Filters a (e.g. restored) configuration down to what the *current* schema
 * accepts, so a value captured against an older schema cannot be re-pinned as a
 * stale override. Two rules are applied:
 *   1. Keys absent from the current schema are dropped (removed properties).
 *   2. Values that violate the property's `enum` constraint are dropped, so the
 *      property falls back to its live default instead of an invalid value.
 * Properties without an `enum` keep their value (no constraint to validate
 * against). When the schema is missing entirely, nothing can be validated and an
 * empty configuration is returned.
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
		const propSchema = properties[key];
		if (!propSchema) {
			continue;
		}
		if (Array.isArray(propSchema.enum) && !propSchema.enum.includes(value)) {
			continue;
		}
		result[key] = value;
	}
	return result;
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
