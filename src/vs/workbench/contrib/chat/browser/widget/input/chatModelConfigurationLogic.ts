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
 * Resolves the effective configuration for a model within a single
 * `(location, sessionType)` scope.
 *
 * A *present* stored entry — even an empty one, which marks an explicit
 * reset-to-default — wins and is merged over the schema defaults. Only a
 * *missing* entry (`undefined`) falls back to the profile-global value, which is
 * the one-time migration for setups that pre-date per-editor scoping.
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
	return globalConfig ? { ...globalConfig } : {};
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
