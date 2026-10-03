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
import { COPILOT_SANDBOX_ALLOW_BYPASS_KEY, COPILOT_SANDBOX_ALLOW_OUTBOUND_KEY, COPILOT_SANDBOX_ENABLED_KEY } from '../../../../../../platform/policy/common/copilotManagedSettings.js';
import { Registry } from '../../../../../../platform/registry/common/platform.js';
import { WorkspaceConfigurationModelParser } from '../../../../../services/configuration/common/configurationModels.js';
import { sandboxAllowNetworkMigration, terminalChatAgentToolsConfiguration, TerminalChatAgentToolsSettingId } from '../../common/terminalChatAgentToolsConfiguration.js';

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

	test('registers one sandbox enablement setting for all operating systems', () => {
		assert.deepStrictEqual({
			enabled: terminalChatAgentToolsConfiguration[AgentSandboxSettingId.AgentSandboxEnabled].enum,
			windows: terminalChatAgentToolsConfiguration['chat.agent.sandbox.enabledWindows'],
		}, { enabled: ['off', 'on'], windows: undefined });
	});

	test('adds sandbox search keywords and ordering to settings consumed by the Agent Host Copilot sandbox', () => {
		const settingIds = [
			[AgentSandboxSettingId.AgentSandboxEnabled, 10],
			[AgentSandboxSettingId.AgentSandboxAllowNetwork, 20],
			[AgentSandboxSettingId.AgentSandboxAllowLocalNetwork, 25],
			[AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands, 30],
			[AgentSandboxSettingId.AgentSandboxMcpServers, 40],
			[AgentSandboxSettingId.AgentSandboxLspServers, 50],
			[AgentSandboxSettingId.AgentSandboxAllowDevToolAccess, 60],
			[AgentSandboxSettingId.AgentSandboxUserConfiguredPaths, 65],
			[AgentSandboxSettingId.AgentSandboxLinuxFileSystem, 70],
			[AgentSandboxSettingId.AgentSandboxMacFileSystem, 80],
			[AgentSandboxSettingId.AgentSandboxWindowsFileSystem, 90],
		] as const;
		assert.deepStrictEqual(
			Object.entries(terminalChatAgentToolsConfiguration)
				.filter(([, setting]) => setting.keywords?.some(keyword => /sandbox/i.test(keyword)))
				.map(([id, setting]) => [id, setting.keywords, setting.order]),
			settingIds.map(([id, order]) => [id, ['Sandbox', 'sandboxing'], order]),
		);
	});

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

	test('registers Copilot user-configured paths and warns about legacy filesystem settings', () => {
		const setting = terminalChatAgentToolsConfiguration[AgentSandboxSettingId.AgentSandboxUserConfiguredPaths];
		assert.deepStrictEqual({
			description: setting.markdownDescription,
			type: setting.type,
			properties: Object.entries(setting.properties ?? {}).map(([key, schema]) => [key, schema.type, schema.items]),
			default: setting.default,
			restricted: setting.restricted,
			additionalProperties: setting.additionalProperties,
			legacy: [
				AgentSandboxSettingId.AgentSandboxLinuxFileSystem,
				AgentSandboxSettingId.AgentSandboxMacFileSystem,
				AgentSandboxSettingId.AgentSandboxWindowsFileSystem,
			].map(key => {
				const legacy = terminalChatAgentToolsConfiguration[key];
				return [legacy.markdownDeprecationMessage, legacy.deprecationMessageShowInSettings, legacy.deprecated];
			}),
		}, {
			description: 'Customize file path permissions in the sandbox.',
			type: ['object'],
			properties: ['readwritePaths', 'readonlyPaths', 'deniedPaths'].map(key => [key, 'array', { type: 'string' }]),
			default: { readwritePaths: [], readonlyPaths: [], deniedPaths: [] },
			restricted: true,
			additionalProperties: false,
			legacy: Array.from({ length: 3 }, () => [
				'This setting will be deprecated soon. For the Copilot Agent Host sandbox, use `#chat.agent.sandbox.fileSystem.userConfiguredPaths#` instead.', true, undefined,
			]),
		});
	});

	test('migrates saved outbound choices without overwriting the new setting', async () => {
		const results = [];
		for (const value of [false, true]) {
			for (const existing of [undefined, false, true]) {
				results.push(await sandboxAllowNetworkMigration.migrateFn(value, key =>
					key === AgentSandboxSettingId.AgentSandboxAllowNetwork ? existing : undefined));
			}
		}
		const removed = ['chat.agent.sandbox.allowNetwork', { value: undefined }];
		assert.deepStrictEqual(results, [
			[[AgentSandboxSettingId.AgentSandboxAllowNetwork, { value: false }], removed],
			[removed],
			[removed],
			[[AgentSandboxSettingId.AgentSandboxAllowNetwork, { value: true }], removed],
			[removed],
			[removed],
		]);
	});

	test('warns about upcoming sandbox setting deprecation without changing defaults', () => {
		const settingIds = [
			AgentSandboxSettingId.AgentSandboxRetryWithAllowNetworkRequests,
			AgentSandboxSettingId.AgentSandboxAdvancedRuntime,
		];
		assert.deepStrictEqual(settingIds.map(id => {
			const setting = terminalChatAgentToolsConfiguration[id];
			return {
				deprecated: setting.deprecated,
				deprecationMessage: setting.markdownDeprecationMessage,
				showInSettings: setting.deprecationMessageShowInSettings,
				default: setting.default,
				restricted: setting.restricted,
			};
		}), [true, { enableWeakerNestedSandbox: false }].map(defaultValue => ({
			deprecated: undefined,
			deprecationMessage: 'This setting will be deprecated soon. It does not apply to the Copilot Agent Host sandbox.',
			showInSettings: true,
			default: defaultValue,
			restricted: true,
		})));
	});

	test('marks legacy sandbox device policies deprecated and identifies managed-settings replacements', () => {
		const policies = [
			[AgentSandboxSettingId.AgentSandboxEnabled, 'ChatAgentSandboxEnabled', COPILOT_SANDBOX_ENABLED_KEY],
			[AgentSandboxSettingId.AgentSandboxAllowNetwork, 'ChatAgentSandboxAllowNetwork', COPILOT_SANDBOX_ALLOW_OUTBOUND_KEY],
			[AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands, 'ChatAgentSandboxAllowUnsandboxedCommands', COPILOT_SANDBOX_ALLOW_BYPASS_KEY],
		] as const;
		for (const [id, name, replacement] of policies) {
			const policy = terminalChatAgentToolsConfiguration[id].policy;
			assert.strictEqual(policy?.name, name);
			assert.match(policy.localization.description.value, /^Deprecated\./);
			assert.ok(policy.localization.description.value.includes(replacement), name);
		}
	});

	test('keeps Agent Host sandbox controls available without setting deprecation', () => {
		const settingIds = [
			AgentSandboxSettingId.AgentSandboxEnabled,
			AgentSandboxSettingId.AgentSandboxAllowNetwork,
			AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands,
			AgentSandboxSettingId.AgentSandboxAllowLocalNetwork,
			AgentSandboxSettingId.AgentSandboxMcpServers,
			AgentSandboxSettingId.AgentSandboxLspServers,
			AgentSandboxSettingId.AgentSandboxAllowDevToolAccess,
			AgentSandboxSettingId.AgentSandboxUserConfiguredPaths,
		];
		assert.deepStrictEqual(settingIds.map(id => {
			const setting = terminalChatAgentToolsConfiguration[id];
			return {
				deprecated: setting.deprecated,
				deprecationMessage: setting.markdownDeprecationMessage,
			};
		}), settingIds.map(() => ({
			deprecated: undefined,
			deprecationMessage: undefined,
		})));
	});

	test('registers terminal safety settings as restricted', () => {
		assert.deepStrictEqual(
			restrictedSettingIds.map(id => terminalChatAgentToolsConfiguration[id].restricted),
			restrictedSettingIds.map(() => true),
		);
	});

	for (const [key, defaultValue] of [
		[AgentSandboxSettingId.AgentSandboxMcpServers, true],
		[AgentSandboxSettingId.AgentSandboxLspServers, true],
		[AgentSandboxSettingId.AgentSandboxAllowDevToolAccess, true],
		[AgentSandboxSettingId.AgentSandboxAllowLocalNetwork, false],
	] as const) {
		test(`defaults ${key} to ${defaultValue} while preserving explicit choices`, async () => {
			const logService = new NullLogService();
			const defaults = await store.add(new DefaultConfiguration(logService)).initialize();
			const values = [defaults.getValue<boolean>(key)];
			for (const value of [false, true]) {
				const parser = new ConfigurationModelParser('sandboxServerSettings', logService);
				parser.parse(JSON.stringify({ [key]: value }));
				values.push(defaults.merge(parser.configurationModel).getValue<boolean>(key));
			}
			const setting = terminalChatAgentToolsConfiguration[key];
			assert.deepStrictEqual({
				values, type: setting.type, restricted: setting.restricted, tags: setting.tags,
				placeholder: setting.markdownDescription?.includes('This setting has no effect yet.'),
			}, { values: [defaultValue, false, true], type: 'boolean', restricted: true, tags: undefined, placeholder: false });
		});
	}

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
