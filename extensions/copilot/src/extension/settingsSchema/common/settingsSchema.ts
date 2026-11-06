/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { BaseConfig } from '../../../platform/configuration/common/configurationService';
import type { EmptyJsonSchema, JsonSchema, ObjectJsonSchema } from '../../../platform/configuration/common/jsonSchema';
import { escapeRegExpCharacters } from '../../../util/vs/base/common/strings';

const advancedSettingPrefixPattern = String.raw`github\.copilot(?:\.chat)?\.advanced\.`;
const advancedSettingPrefixRegex = new RegExp(`^${advancedSettingPrefixPattern}`);

type SettingsSchemaConfig = Pick<BaseConfig<unknown>, 'fullyQualifiedId' | 'validator'>;

export function buildSettingsSchema(isInternal: false, configs: Iterable<SettingsSchemaConfig>, unknownAdvancedSettingDeprecationMessage: string): EmptyJsonSchema;
export function buildSettingsSchema(isInternal: true, configs: Iterable<SettingsSchemaConfig>, unknownAdvancedSettingDeprecationMessage: string): ObjectJsonSchema;
export function buildSettingsSchema(isInternal: boolean, configs: Iterable<SettingsSchemaConfig>, unknownAdvancedSettingDeprecationMessage: string): JsonSchema;
export function buildSettingsSchema(isInternal: boolean, configs: Iterable<SettingsSchemaConfig>, unknownAdvancedSettingDeprecationMessage: string): JsonSchema {
	if (!isInternal) {
		return {};
	}

	const properties: Record<string, JsonSchema> = {};
	const registeredAdvancedSettingIds = new Set<string>();

	for (const config of configs) {
		properties[config.fullyQualifiedId] = {
			description: 'Recognized Advanced Setting.\nIgnore the warning "Unknown Configuration Setting", which cannot be suppressed.',
			...(config.validator?.toSchema() ?? {}),
		};

		if (advancedSettingPrefixRegex.test(config.fullyQualifiedId)) {
			registeredAdvancedSettingIds.add(config.fullyQualifiedId);
		}
	}

	const escapedRegisteredSettingIds = [...registeredAdvancedSettingIds]
		.sort()
		.map(escapeRegExpCharacters);
	const registeredSettingExclusion = escapedRegisteredSettingIds.length > 0
		? `(?!(?:${escapedRegisteredSettingIds.join('|')})$)`
		: '';
	const unknownAdvancedSettingPattern = `^${registeredSettingExclusion}${advancedSettingPrefixPattern}.*$`;

	return {
		type: 'object',
		properties,
		patternProperties: {
			[unknownAdvancedSettingPattern]: {
				deprecationMessage: unknownAdvancedSettingDeprecationMessage,
			}
		}
	};
}
