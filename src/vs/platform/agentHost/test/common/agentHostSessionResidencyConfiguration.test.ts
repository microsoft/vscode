/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ConfigurationScope, Extensions, IConfigurationRegistry } from '../../../configuration/common/configurationRegistry.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { Registry } from '../../../registry/common/platform.js';
import { AgentHostConfigurationSyncTarget, resolveAgentHostConfigurationSyncPatch } from '../../common/agentHostConfigurationSync.js';
import { AgentHostSessionResidencyLimitConfigKey, platformRootSchema } from '../../common/agentHostSchema.js';
import { AgentHostSessionResidencyLimitSettingId } from '../../common/agentService.js';
import { sessionResidencyConfigurationProperties } from '../../common/sessionResidencyConfiguration.js';

suite('Agent Host session residency configuration', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const registry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
	const configurationNode = { id: 'testSessionResidency', properties: sessionResidencyConfigurationProperties };
	suiteSetup(() => registry.registerConfiguration(configurationNode));
	suiteTeardown(() => registry.deregisterConfigurations([configurationNode]));

	test('exposes a non-negative application-scoped integer with the existing default', () => {
		const property = registry.getConfigurationProperties()[AgentHostSessionResidencyLimitSettingId];
		assert.deepStrictEqual({
			type: property.type,
			minimum: property.minimum,
			default: property.default,
			scope: property.scope,
			agentHost: property.agentHost,
			rootDefault: platformRootSchema.definition[AgentHostSessionResidencyLimitConfigKey].protocol.default,
		}, {
			type: 'integer',
			minimum: 0,
			default: 10,
			scope: ConfigurationScope.APPLICATION,
			agentHost: { key: AgentHostSessionResidencyLimitConfigKey },
			rootDefault: 10,
		});
	});

	for (const target of [AgentHostConfigurationSyncTarget.Local, AgentHostConfigurationSyncTarget.Remote, AgentHostConfigurationSyncTarget.RemoteExtensionHost]) {
		for (const value of [undefined, 0, 3, 'invalid', 1.5]) {
			test(`mirrors a valid global limit to ${target}: ${value}`, () => {
				const configuration = new TestConfigurationService({ [AgentHostSessionResidencyLimitSettingId]: value });
				disposables.add(configuration.onDidChangeConfigurationEmitter);
				const patch = resolveAgentHostConfigurationSyncPatch(configuration, target);
				assert.strictEqual(patch[AgentHostSessionResidencyLimitConfigKey], typeof value === 'number' && Number.isInteger(value) ? value : 10);
			});
		}
	}
});
