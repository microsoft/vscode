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

	test('returns undefined when nothing is configured', () => {
		const cfg = new TestConfigurationService();
		assert.strictEqual(
			readSandboxSetting<string>(cfg, new NullLogService(), AgentSandboxSettingId.AgentSandboxEnabled),
			undefined,
		);
	});

	test('falls back to deprecated key when modern key is not user-set', () => {
		// Build a config where the deprecated parent key is explicitly user-set.
		// `chat.agent.sandbox` is the deprecated namespace parent of
		// `chat.agent.sandbox.enabled`, but `TestConfigurationService.inspect`
		// only reflects the exact user keys, so this exercises the fallback
		// path cleanly.
		const cfg = new TestConfigurationService();
		cfg.setUserConfiguration(AgentSandboxSettingId.DeprecatedAgentSandboxEnabled, AgentSandboxEnabledValue.AllowNetwork);

		assert.strictEqual(
			readSandboxSetting<string>(cfg, new NullLogService(), AgentSandboxSettingId.AgentSandboxEnabled),
			AgentSandboxEnabledValue.AllowNetwork,
		);
	});

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

	test('normalizes legacy boolean form when arriving via the deprecated key', () => {
		const cfg = new TestConfigurationService();
		cfg.setUserConfiguration(AgentSandboxSettingId.DeprecatedAgentSandboxEnabled, true);

		assert.strictEqual(
			readSandboxSetting<string>(cfg, new NullLogService(), AgentSandboxSettingId.AgentSandboxEnabled),
			AgentSandboxEnabledValue.On,
		);
	});

	test('modern user value wins over deprecated user value', () => {
		const cfg = new TestConfigurationService();
		cfg.setUserConfiguration(AgentSandboxSettingId.AgentSandboxEnabled, AgentSandboxEnabledValue.On);
		cfg.setUserConfiguration(AgentSandboxSettingId.DeprecatedAgentSandboxEnabled, AgentSandboxEnabledValue.AllowNetwork);

		assert.strictEqual(
			readSandboxSetting<string>(cfg, new NullLogService(), AgentSandboxSettingId.AgentSandboxEnabled),
			AgentSandboxEnabledValue.On,
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
