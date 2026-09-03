/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ConfigurationTarget } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NullTelemetryServiceShape } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { TerminalSettingId } from '../../../../../../platform/terminal/common/terminal.js';
import { TerminalChatAgentToolsSettingId } from '../../../chatAgentTools/common/terminalChatAgentToolsConfiguration.js';
import { TerminalProfileConfigurationTelemetry } from '../../browser/terminalProfileConfigurationTelemetry.js';

class TestTelemetryService extends NullTelemetryServiceShape {
	readonly events: { readonly name: string; readonly data: unknown }[] = [];

	override publicLog2(eventName?: string, data?: unknown): void {
		if (eventName) {
			this.events.push({ name: eventName, data });
		}
	}
}

suite('TerminalProfileConfigurationTelemetry', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let configurationService: TestConfigurationService;
	let telemetryService: TestTelemetryService;

	setup(() => {
		configurationService = new TestConfigurationService();
		telemetryService = new TestTelemetryService();
		store.add(new TerminalProfileConfigurationTelemetry(configurationService, telemetryService));
	});

	async function changeSetting(settingId: string, value: unknown, source = ConfigurationTarget.USER): Promise<void> {
		await configurationService.setUserConfiguration(settingId, value);
		configurationService.onDidChangeConfigurationEmitter.fire({
			affectsConfiguration: key => key === settingId,
			affectedKeys: new Set([settingId]),
			change: { keys: [settingId], overrides: [] },
			source,
		});
	}

	test('reports changes for each terminal profile setting without profile contents', async () => {
		const settings = [
			{ settingId: TerminalChatAgentToolsSettingId.TerminalProfileLinux, profileType: 'chat', os: 'linux', value: { path: '/bin/bash' } },
			{ settingId: TerminalChatAgentToolsSettingId.TerminalProfileMacOs, profileType: 'chat', os: 'osx', value: { path: '/bin/zsh' } },
			{ settingId: TerminalChatAgentToolsSettingId.TerminalProfileWindows, profileType: 'chat', os: 'windows', value: { path: 'pwsh.exe' } },
			{ settingId: TerminalSettingId.AutomationProfileLinux, profileType: 'automation', os: 'linux', value: { path: '/bin/bash' } },
			{ settingId: TerminalSettingId.AutomationProfileMacOs, profileType: 'automation', os: 'osx', value: { path: '/bin/zsh' } },
			{ settingId: TerminalSettingId.AutomationProfileWindows, profileType: 'automation', os: 'windows', value: { path: 'pwsh.exe' } },
			{ settingId: TerminalSettingId.DefaultProfileLinux, profileType: 'default', os: 'linux', value: 'bash' },
			{ settingId: TerminalSettingId.DefaultProfileMacOs, profileType: 'default', os: 'osx', value: 'zsh' },
			{ settingId: TerminalSettingId.DefaultProfileWindows, profileType: 'default', os: 'windows', value: 'PowerShell' },
		] as const;

		for (const setting of settings) {
			await changeSetting(setting.settingId, setting.value);
		}

		assert.deepStrictEqual(telemetryService.events, settings.map(({ value, ...setting }) => ({
			name: 'terminal/profileSettingChanged',
			data: {
				...setting,
				configured: true,
				changeType: 'added',
				source: 'USER',
			},
		})));
	});

	test('reports added, changed, and removed settings and ignores unrelated settings', async () => {
		await changeSetting(TerminalSettingId.DefaultProfileLinux, 'bash');
		await changeSetting(TerminalSettingId.DefaultProfileLinux, 'zsh', ConfigurationTarget.WORKSPACE);
		await changeSetting(TerminalSettingId.DefaultProfileLinux, null, ConfigurationTarget.USER_REMOTE);
		await changeSetting(TerminalSettingId.FontSize, 16);

		assert.deepStrictEqual(telemetryService.events, [
			{
				name: 'terminal/profileSettingChanged',
				data: {
					settingId: TerminalSettingId.DefaultProfileLinux,
					profileType: 'default',
					os: 'linux',
					configured: true,
					changeType: 'added',
					source: 'USER',
				},
			},
			{
				name: 'terminal/profileSettingChanged',
				data: {
					settingId: TerminalSettingId.DefaultProfileLinux,
					profileType: 'default',
					os: 'linux',
					configured: true,
					changeType: 'changed',
					source: 'WORKSPACE',
				},
			},
			{
				name: 'terminal/profileSettingChanged',
				data: {
					settingId: TerminalSettingId.DefaultProfileLinux,
					profileType: 'default',
					os: 'linux',
					configured: false,
					changeType: 'removed',
					source: 'USER_REMOTE',
				},
			},
		]);
	});
});
