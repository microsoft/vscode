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
import '../../browser/agentSessionsConfiguration.js';

const configurationProperties = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurationProperties();
const registeredAgentSessionsSettings = [
	ChatConfiguration.UnifiedWorkspacePicker,
	ChatConfiguration.AutoMarkAsDoneMergedSessionsAfterDays,
	ChatConfiguration.AutoDeleteArchivedMergedSessionsAfterDays,
].map(key => configurationProperties[key] !== undefined);
const legacyAutoArchiveMigration = Registry.as<IConfigurationMigrationRegistry & { readonly migrations: readonly ConfigurationMigration[] }>(WorkbenchConfigurationExtensions.ConfigurationMigration).migrations
	.find(migration => migration.key === 'chat.agentSessions.autoArchiveMergedSessionsAfterDays');

suite('Chat configuration', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('registers Agents Window settings in the shared workbench contribution', () => {
		assert.deepStrictEqual(registeredAgentSessionsSettings, [true, true, true]);
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
