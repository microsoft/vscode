/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { stub } from 'sinon';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AgentNetworkDomainSettingId } from '../../../../../platform/networkFilter/common/settings.js';
import { AgentSandboxSettingId } from '../../../../../platform/sandbox/common/settings.js';
import { terminalContribConfiguration } from '../../../terminal/terminalContribExports.js';
import { chatNetworkDomainConfigurationMigrations, chatNetworkDomainConfigurationProperties } from '../../browser/chatNetworkConfiguration.js';

suite('Chat network configuration', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('presents valid managed allowed hosts and ignores invalid values', () => {
		const presentation = chatNetworkDomainConfigurationProperties[AgentNetworkDomainSettingId.AllowedNetworkDomains].managedSettingsPresentation!;
		const consoleWarn = stub(console, 'warn');
		try {
			const values = [undefined, '["example.com"]', '[]', '', '[', 'null', '{}', '[123]', true, 123]
				.map(value => presentation(() => value));
			assert.deepStrictEqual({
				values,
				warnings: consoleWarn.callCount,
			}, {
				values: [undefined, ['example.com'], [], undefined, undefined, undefined, undefined, undefined, undefined, undefined],
				warnings: 7,
			});
		} finally {
			consoleWarn.restore();
		}
	});

	test('orders sandbox domain settings after user-configured paths and preserves policy names', () => {
		const properties = {
			...terminalContribConfiguration,
			...chatNetworkDomainConfigurationProperties,
		};
		assert.deepStrictEqual([
			AgentSandboxSettingId.AgentSandboxUserConfiguredPaths,
			AgentNetworkDomainSettingId.AllowedNetworkDomains,
			AgentNetworkDomainSettingId.DeniedNetworkDomains,
		].map(key => ({
			key,
			order: properties[key].order,
			policy: properties[key].policy?.name,
		})), [
			{ key: 'chat.agent.sandbox.fileSystem.userConfiguredPaths', order: 65, policy: undefined },
			{ key: 'chat.agent.sandbox.network.allowedDomains', order: 66, policy: 'ChatAgentAllowedNetworkDomains' },
			{ key: 'chat.agent.sandbox.network.deniedDomains', order: 67, policy: 'ChatAgentDeniedNetworkDomains' },
		]);
	});

	for (const [oldKey, newKey] of [
		['chat.agent.allowedNetworkDomains', AgentNetworkDomainSettingId.AllowedNetworkDomains],
		['chat.agent.deniedNetworkDomains', AgentNetworkDomainSettingId.DeniedNetworkDomains],
	]) {
		test(`migrates ${oldKey} including application settings without overwriting the new key`, async () => {
			const migration = chatNetworkDomainConfigurationMigrations.find(migration => migration.key === oldKey);
			assert.deepStrictEqual({
				includeApplication: migration?.includeApplication,
				migrated: await migration?.migrateFn(['example.com'], () => undefined),
				preserved: await migration?.migrateFn(['example.com'], () => ['existing.com']),
				preservedEmpty: await migration?.migrateFn(['example.com'], () => []),
			}, {
				includeApplication: true,
				migrated: [[oldKey, { value: undefined }], [newKey, { value: ['example.com'] }]],
				preserved: [[oldKey, { value: undefined }]],
				preservedEmpty: [[oldKey, { value: undefined }]],
			});
		});
	}
});
