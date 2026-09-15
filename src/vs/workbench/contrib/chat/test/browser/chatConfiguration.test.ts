/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { ConfigurationMigration, Extensions as WorkbenchConfigurationExtensions, IConfigurationMigrationRegistry } from '../../../../common/configuration.js';
import { ChatConfiguration } from '../../common/constants.js';
import { chatProgressConfigurationProperties } from '../../browser/chatProgressConfiguration.js';
import '../../browser/agentSessionsConfiguration.js';

const configurationProperties = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurationProperties();
const registeredAgentSessionsSettings = [
	ChatConfiguration.UnifiedWorkspacePicker,
	ChatConfiguration.AutoMarkAsDoneMergedSessionsAfterDays,
	ChatConfiguration.AutoDeleteArchivedMergedSessionsAfterDays,
].map(key => configurationProperties[key] !== undefined);
const legacyAutoArchiveMigration = Registry.as<IConfigurationMigrationRegistry & { readonly migrations: readonly ConfigurationMigration[] }>(WorkbenchConfigurationExtensions.ConfigurationMigration).migrations
	.find(migration => migration.key === 'chat.agentSessions.autoArchiveMergedSessionsAfterDays');
const persistentProgressSetting = chatProgressConfigurationProperties[ChatConfiguration.PersistentProgress];

suite('Chat configuration', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('registers Agents Window settings in the shared workbench contribution', () => {
		assert.deepStrictEqual(registeredAgentSessionsSettings, [true, true, true]);
	});

	test('defines persistent progress as an opt-in experimental setting', () => {
		assert.deepStrictEqual({
			type: persistentProgressSetting.type,
			default: persistentProgressSetting.default,
			tags: persistentProgressSetting.tags,
		}, {
			type: 'string',
			default: 'off',
			tags: ['experimental'],
		});
	});

	test('defines exactly one persistent progress setting, defaulting to Off', () => {
		const setting = chatProgressConfigurationProperties[ChatConfiguration.PersistentProgress];
		assert.deepStrictEqual({
			settings: Object.keys(chatProgressConfigurationProperties),
			type: setting.type,
			default: setting.default,
			values: setting.enum,
			labels: setting.enumItemLabels,
			descriptions: setting.enumDescriptions.length,
		}, {
			settings: ['chat.experimental.persistentProgress'],
			type: 'string',
			default: 'off',
			values: ['off', 'weave', 'orbit', 'accordion', 'dial'],
			labels: ['Off', 'Weave', 'Orbit and Lock', 'Accordion', 'Dial Rotation'],
			descriptions: 5,
		});
	});

	test('migrates the auto archive setting to auto mark as done', async () => {
		assert.deepStrictEqual({
			includeApplication: legacyAutoArchiveMigration?.includeApplication,
			result: await legacyAutoArchiveMigration?.migrateFn(15, () => undefined),
		}, {
			includeApplication: true,
			result: [
				['chat.agentSessions.autoArchiveMergedSessionsAfterDays', { value: undefined }],
				[ChatConfiguration.AutoMarkAsDoneMergedSessionsAfterDays, { value: 15 }],
			],
		});
	});

	test('does not overwrite the auto mark as done setting during migration', async () => {
		assert.deepStrictEqual(await legacyAutoArchiveMigration?.migrateFn(15, () => 30), [
			['chat.agentSessions.autoArchiveMergedSessionsAfterDays', { value: undefined }],
		]);
	});
});
