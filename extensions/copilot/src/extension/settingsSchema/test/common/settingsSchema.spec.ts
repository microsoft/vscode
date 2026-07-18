/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, test } from 'vitest';
import { ConfigKey, globalConfigRegistry } from '../../../../platform/configuration/common/configurationService';
import type { JsonSchema, ObjectJsonSchema } from '../../../../platform/configuration/common/jsonSchema';
import { buildSettingsSchema } from '../../common/settingsSchema';

function getUnknownAdvancedSettingSchema(schema: ObjectJsonSchema): [string, JsonSchema] {
	const entries = Object.entries(schema.patternProperties ?? {});
	if (entries.length !== 1) {
		throw new Error(`Expected one unknown advanced setting schema, got ${entries.length}`);
	}
	return entries[0];
}

describe('SettingsSchema', () => {
	test('returns an empty schema for external users', () => {
		expect(buildSettingsSchema(false, globalConfigRegistry.configs.values())).toEqual({});
	});

	test('does not deprecate registered advanced settings', () => {
		const schema: ObjectJsonSchema = JSON.parse(JSON.stringify(buildSettingsSchema(true, globalConfigRegistry.configs.values())));
		const [patternSource, fallbackSchema] = getUnknownAdvancedSettingSchema(schema);
		const unknownAdvancedSettingRegex = new RegExp(patternSource);
		const issueSettingId = ConfigKey.TeamInternal.InlineEditsXtabSplitPatchOnDiff.fullyQualifiedId;

		expect({
			registeredSettingsMatchingFallback: Object.keys(schema.properties ?? {}).filter(id => unknownAdvancedSettingRegex.test(id)),
			issueSettingSchema: schema.properties?.[issueSettingId],
			fallbackSchema,
		}).toEqual({
			registeredSettingsMatchingFallback: [],
			issueSettingSchema: {
				description: 'Recognized Advanced Setting.\nIgnore the warning "Unknown Configuration Setting", which cannot be suppressed.',
				type: 'boolean',
			},
			fallbackSchema: {
				deprecated: true,
				description: 'Unknown advanced setting.\nIf you believe this is a supported setting, please file an issue so that it gets registered.',
			},
		});
	});

	test('only deprecates unknown advanced settings', () => {
		const registeredChatSetting = 'github.copilot.chat.advanced.feature[preview].enabled';
		const registeredSharedSetting = 'github.copilot.advanced.sharedFeature';
		const originalSchema = buildSettingsSchema(true, [
			{ fullyQualifiedId: registeredChatSetting },
			{ fullyQualifiedId: registeredSharedSetting },
		]);
		const [originalPatternSource] = getUnknownAdvancedSettingSchema(originalSchema);
		const schema: ObjectJsonSchema = JSON.parse(JSON.stringify(originalSchema));
		const [patternSource] = getUnknownAdvancedSettingSchema(schema);
		const unknownAdvancedSettingRegex = new RegExp(patternSource);
		const [emptyRegistryPatternSource] = getUnknownAdvancedSettingSchema(buildSettingsSchema(true, []));

		expect({
			serializedPatternPreserved: patternSource === originalPatternSource,
			registeredChatSetting: unknownAdvancedSettingRegex.test(registeredChatSetting),
			registeredSharedSetting: unknownAdvancedSettingRegex.test(registeredSharedSetting),
			knownSettingWithSuffix: unknownAdvancedSettingRegex.test(`${registeredChatSetting}.extra`),
			unknownChatSetting: unknownAdvancedSettingRegex.test('github.copilot.chat.advanced.unknown'),
			unknownSharedSetting: unknownAdvancedSettingRegex.test('github.copilot.advanced.unknown'),
			emptyRegistryUnknownSetting: new RegExp(emptyRegistryPatternSource).test('github.copilot.chat.advanced.unknown'),
			emptyAdvancedSuffix: unknownAdvancedSettingRegex.test('github.copilot.chat.advanced.'),
			unrelatedSetting: unknownAdvancedSettingRegex.test('editor.fontSize'),
			wrongSeparators: unknownAdvancedSettingRegex.test('githubXcopilotXchatXadvancedXunknown'),
			leadingJunk: unknownAdvancedSettingRegex.test(`prefix.${registeredChatSetting}`),
		}).toEqual({
			serializedPatternPreserved: true,
			registeredChatSetting: false,
			registeredSharedSetting: false,
			knownSettingWithSuffix: true,
			unknownChatSetting: true,
			unknownSharedSetting: true,
			emptyRegistryUnknownSetting: true,
			emptyAdvancedSuffix: true,
			unrelatedSetting: false,
			wrongSeparators: false,
			leadingJunk: false,
		});
	});
});
