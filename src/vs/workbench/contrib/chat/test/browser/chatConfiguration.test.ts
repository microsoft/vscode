/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AgentHostAutoArchiveMergedSessionsAfterDaysConfigKey, AgentHostAutoDeleteArchivedMergedSessionsAfterDaysConfigKey } from '../../../../../platform/agentHost/common/agentHostSchema.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { ConfigurationMigration, Extensions as WorkbenchConfigurationExtensions, IConfigurationMigrationRegistry } from '../../../../common/configuration.js';
import { ChatConfiguration } from '../../common/constants.js';
import '../../browser/agentSessionsConfiguration.js';

const configurationProperties = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurationProperties();
const legacyAutoArchiveMigration = Registry.as<IConfigurationMigrationRegistry & { readonly migrations: readonly ConfigurationMigration[] }>(WorkbenchConfigurationExtensions.ConfigurationMigration).migrations
	.find(migration => migration.key === 'chat.agentSessions.autoArchiveMergedSessionsAfterDays');

suite('Chat configuration', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('registers automatic merged-session cleanup settings', () => {
		assert.deepStrictEqual([
			ChatConfiguration.AutoMarkAsDoneMergedSessionsAfterDays,
			ChatConfiguration.AutoDeleteArchivedMergedSessionsAfterDays,
		].map(key => ({
			key,
			tags: configurationProperties[key]?.tags,
			agentHostKey: configurationProperties[key]?.agentHost?.key,
		})), [{
			key: ChatConfiguration.AutoMarkAsDoneMergedSessionsAfterDays,
			tags: ['preview', 'agentSessionCleanup'],
			agentHostKey: AgentHostAutoArchiveMergedSessionsAfterDaysConfigKey,
		}, {
			key: ChatConfiguration.AutoDeleteArchivedMergedSessionsAfterDays,
			tags: ['preview', 'agentSessionCleanup'],
			agentHostKey: AgentHostAutoDeleteArchivedMergedSessionsAfterDaysConfigKey,
		}]);
	});

	test('migrates auto archive to auto mark as done without overwriting an existing value', async () => {
		assert.deepStrictEqual({
			unset: await legacyAutoArchiveMigration?.migrateFn(15, () => undefined),
			preserve: await legacyAutoArchiveMigration?.migrateFn(15, () => 30),
		}, {
			unset: [
				['chat.agentSessions.autoArchiveMergedSessionsAfterDays', { value: undefined }],
				[ChatConfiguration.AutoMarkAsDoneMergedSessionsAfterDays, { value: 15 }],
			],
			preserve: [
				['chat.agentSessions.autoArchiveMergedSessionsAfterDays', { value: undefined }],
			],
		});
	});
});
