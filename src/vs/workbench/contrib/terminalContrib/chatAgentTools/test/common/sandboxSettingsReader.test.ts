/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { AgentNetworkDomainSettingId } from '../../../../../../platform/networkFilter/common/settings.js';
import { AgentSandboxEnabledValue, AgentSandboxSettingId } from '../../../../../../platform/sandbox/common/settings.js';
import { AgentHostSandboxKey } from '../../../../../../platform/agentHost/common/sandboxConfigSchema.js';
import { readAgentHostSandboxValues, readSandboxSetting } from '../../common/sandboxSettingsReader.js';
import { terminalChatAgentToolsConfiguration } from '../../common/terminalChatAgentToolsConfiguration.js';

suite('sandboxSettingsReader', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns user value for modern key', () => {
		const cfg = new TestConfigurationService();
		cfg.setUserConfiguration(AgentSandboxSettingId.AgentSandboxEnabled, AgentSandboxEnabledValue.On);

		assert.strictEqual(
			readSandboxSetting<string>(cfg, new NullLogService(), AgentSandboxSettingId.AgentSandboxEnabled),
			AgentSandboxEnabledValue.On,
		);
	});

	test('forwards the network default and explicit network restrictions to the agent host', async () => {
		const settingId = AgentSandboxSettingId.AgentSandboxAllowNetwork;
		const cfg = new TestConfigurationService({ [settingId]: terminalChatAgentToolsConfiguration[settingId].default });
		const logService = new NullLogService();
		const values = [readAgentHostSandboxValues(cfg, logService)];
		await cfg.setUserConfiguration(settingId, false);
		values.push(readAgentHostSandboxValues(cfg, logService));
		assert.deepStrictEqual(values, [
			{ [AgentHostSandboxKey.AllowNetwork]: true },
			{ [AgentHostSandboxKey.AllowNetwork]: false },
		]);
	});

	test('returns undefined when nothing is configured', () => {
		const cfg = new TestConfigurationService();
		assert.strictEqual(
			readSandboxSetting<string>(cfg, new NullLogService(), AgentSandboxSettingId.AgentSandboxEnabled),
			undefined,
		);
	});

	for (const [settingId, key, defaultValue] of [
		[AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands, AgentHostSandboxKey.AllowUnsandboxedCommands, true],
		[AgentSandboxSettingId.AgentSandboxMcpServers, AgentHostSandboxKey.SandboxMcpServers, true],
		[AgentSandboxSettingId.AgentSandboxLspServers, AgentHostSandboxKey.SandboxLspServers, true],
		[AgentSandboxSettingId.AgentSandboxAllowDevToolAccess, AgentHostSandboxKey.AllowDevToolAccess, false],
		[AgentSandboxSettingId.AgentSandboxAllowLocalNetwork, AgentHostSandboxKey.AllowLocalNetwork, false],
	] as const) {
		test(`forwards ${settingId} default and explicit choices to the agent host`, async () => {
			const cfg = new TestConfigurationService({ [settingId]: terminalChatAgentToolsConfiguration[settingId].default });
			const logService = new NullLogService();
			const values = [readAgentHostSandboxValues(cfg, logService)];
			for (const value of [false, true]) {
				await cfg.setUserConfiguration(settingId, value);
				values.push(readAgentHostSandboxValues(cfg, logService));
			}
			assert.deepStrictEqual(values, [{ [key]: defaultValue }, { [key]: false }, { [key]: true }]);
		});
	}

	test('normalizes legacy boolean form of chat.agent.sandbox.enabled', () => {
		const cfgOn = new TestConfigurationService();
		cfgOn.setUserConfiguration(AgentSandboxSettingId.AgentSandboxEnabled, true);
		assert.strictEqual(
			readSandboxSetting<string>(cfgOn, new NullLogService(), AgentSandboxSettingId.AgentSandboxEnabled),
			AgentSandboxEnabledValue.On,
		);

		const cfgOff = new TestConfigurationService();
		cfgOff.setUserConfiguration(AgentSandboxSettingId.AgentSandboxEnabled, false);
		assert.strictEqual(
			readSandboxSetting<string>(cfgOff, new NullLogService(), AgentSandboxSettingId.AgentSandboxEnabled),
			AgentSandboxEnabledValue.Off,
		);
	});

	test('readAgentHostSandboxValues builds a bag keyed by prefix-free agent-host sandbox sub-keys', () => {
		const cfg = new TestConfigurationService();
		cfg.setUserConfiguration(AgentSandboxSettingId.AgentSandboxEnabled, AgentSandboxEnabledValue.On);
		cfg.setUserConfiguration(AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands, true);
		cfg.setUserConfiguration(AgentNetworkDomainSettingId.AllowedNetworkDomains, ['example.com']);

		const bag = readAgentHostSandboxValues(cfg, new NullLogService());

		assert.deepStrictEqual(bag, {
			[AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On,
			[AgentHostSandboxKey.AllowUnsandboxedCommands]: true,
			[AgentHostSandboxKey.AllowedNetworkDomains]: ['example.com'],
		});
	});

	test('readAgentHostSandboxValues omits keys that are not user-configured', () => {
		const cfg = new TestConfigurationService();
		const bag = readAgentHostSandboxValues(cfg, new NullLogService());
		assert.deepStrictEqual(bag, {});
	});
});
