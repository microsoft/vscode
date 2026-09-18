/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ConfigurationModelParser } from '../../../../../../platform/configuration/common/configurationModels.js';
import { DefaultConfiguration } from '../../../../../../platform/configuration/common/configurations.js';
import { AgentSandboxSettingId } from '../../../../../../platform/sandbox/common/settings.js';
import { Extensions, IConfigurationNode, IConfigurationRegistry } from '../../../../../../platform/configuration/common/configurationRegistry.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { Registry } from '../../../../../../platform/registry/common/platform.js';
import { WorkspaceConfigurationModelParser } from '../../../../../services/configuration/common/configurationModels.js';
import { terminalChatAgentToolsConfiguration, TerminalChatAgentToolsSettingId } from '../../common/terminalChatAgentToolsConfiguration.js';

suite('Terminal chat agent tools configuration', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const configurationRegistry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
	const configurationNode: IConfigurationNode = {
		id: 'terminalChatAgentToolsConfigurationTest',
		type: 'object',
		properties: terminalChatAgentToolsConfiguration,
	};
	const restrictedSettingIds = [
		TerminalChatAgentToolsSettingId.EnableAutoApprove,
		TerminalChatAgentToolsSettingId.AutoApprove,
		TerminalChatAgentToolsSettingId.IgnoreDefaultAutoApproveRules,
		TerminalChatAgentToolsSettingId.BlockDetectedFileWrites,
		TerminalChatAgentToolsSettingId.DeprecatedAutoApproveCompatible,
	];
	const workspaceValues: Record<string, unknown> = {
		[TerminalChatAgentToolsSettingId.EnableAutoApprove]: false,
		[TerminalChatAgentToolsSettingId.AutoApprove]: { '/.*/': true },
		[TerminalChatAgentToolsSettingId.IgnoreDefaultAutoApproveRules]: true,
		[TerminalChatAgentToolsSettingId.BlockDetectedFileWrites]: 'never',
		[TerminalChatAgentToolsSettingId.DeprecatedAutoApproveCompatible]: { '/.*/': true },
	};

	suiteSetup(() => {
		configurationRegistry.registerConfiguration(configurationNode);
	});

	suiteTeardown(() => configurationRegistry.deregisterConfigurations([configurationNode]));

	test('allows sandbox network access by default and preserves explicit overrides', async () => {
		const logService = new NullLogService();
		const defaults = await store.add(new DefaultConfiguration(logService)).initialize();
		const settingId = AgentSandboxSettingId.AgentSandboxAllowNetwork;
		const values = [defaults.getValue<boolean>(settingId)];
		for (const value of [false, true]) {
			const parser = new ConfigurationModelParser('sandboxNetworkSettings', logService);
			parser.parse(JSON.stringify({ [settingId]: value }));
			values.push(defaults.merge(parser.configurationModel).getValue<boolean>(settingId));
		}
		assert.deepStrictEqual(values, [true, false, true]);
	});

	test('registers terminal safety settings as restricted', () => {
		assert.deepStrictEqual(
			restrictedSettingIds.map(id => terminalChatAgentToolsConfiguration[id].restricted),
			restrictedSettingIds.map(() => true),
		);
	});

	test('filters terminal safety settings from an untrusted single-folder workspace', () => {
		const parser = new ConfigurationModelParser('terminalSafetySettings', new NullLogService());
		parser.parse(JSON.stringify(workspaceValues), { skipRestricted: true });

		assert.deepStrictEqual({
			values: restrictedSettingIds.map(id => parser.configurationModel.getValue(id)),
			restricted: parser.restrictedConfigurations.filter(id => restrictedSettingIds.includes(id as TerminalChatAgentToolsSettingId)),
		}, {
			values: restrictedSettingIds.map(() => undefined),
			restricted: restrictedSettingIds,
		});
	});

	test('filters terminal safety settings from an untrusted workspace file', () => {
		const parser = new WorkspaceConfigurationModelParser('terminalSafetySettings', new NullLogService());
		parser.parse(JSON.stringify({ folders: [], settings: workspaceValues }), { skipRestricted: true });

		assert.deepStrictEqual({
			values: restrictedSettingIds.map(id => parser.settingsModel.getValue(id)),
			restricted: parser.getRestrictedWorkspaceSettings().filter(id => restrictedSettingIds.includes(id as TerminalChatAgentToolsSettingId)),
		}, {
			values: restrictedSettingIds.map(() => undefined),
			restricted: restrictedSettingIds,
		});
	});

	test('preserves terminal safety settings in a trusted workspace', () => {
		const parser = new ConfigurationModelParser('terminalSafetySettings', new NullLogService());
		parser.parse(JSON.stringify(workspaceValues));

		assert.deepStrictEqual(
			restrictedSettingIds.map(id => parser.configurationModel.getValue(id)),
			restrictedSettingIds.map(id => workspaceValues[id]),
		);
	});
});
