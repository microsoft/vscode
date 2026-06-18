/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { SyncStatus, IUserDataSyncService, IUserDataSyncEnablementService } from '../../../../../platform/userDataSync/common/userDataSync.js';
import { IUserDataSyncWorkbenchService } from '../../../../services/userDataSync/common/userDataSync.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { SettingsChangeRelauncher } from '../../browser/relauncher.contribution.js';

suite('SettingsChangeRelauncher', () => {

	const disposables = new DisposableStore();

	let restartCount: number;
	let confirmResult: boolean;
	let confirmCount: number;

	function createRelauncher(initialConfiguration: Record<string, unknown>): TestConfigurationService {
		// `update()` reads `config.window.titleBarStyle` unconditionally on native, so
		// the `window` object must always be present on the configuration root.
		initialConfiguration.window ??= {};
		const configurationService = new TestConfigurationService(initialConfiguration);

		const hostService = { hasFocus: true, restart: async () => { restartCount++; } } as Partial<IHostService> as IHostService;
		const dialogService = { confirm: async () => { confirmCount++; return { confirmed: confirmResult }; } } as Partial<IDialogService> as IDialogService;
		const userDataSyncService = { status: SyncStatus.Idle } as Partial<IUserDataSyncService> as IUserDataSyncService;
		const userDataSyncEnablementService = { isEnabled: () => true } as Partial<IUserDataSyncEnablementService> as IUserDataSyncEnablementService;
		const userDataSyncWorkbenchService = { onDidTurnOnSync: Event.None } as Partial<IUserDataSyncWorkbenchService> as IUserDataSyncWorkbenchService;
		const productService = { nameLong: 'Test Product' } as Partial<IProductService> as IProductService;

		disposables.add(new SettingsChangeRelauncher(hostService, configurationService, userDataSyncService, userDataSyncEnablementService, userDataSyncWorkbenchService, productService, dialogService));

		return configurationService;
	}

	function fireChange(configurationService: TestConfigurationService, key: string, source = ConfigurationTarget.USER): void {
		configurationService.onDidChangeConfigurationEmitter.fire({
			source,
			affectedKeys: new Set([key]),
			change: { keys: [key], overrides: [] },
			affectsConfiguration: (configuration: string) => configuration === key,
		});
	}

	async function changeSetting<T extends Record<string, unknown>>(key: string, createConfiguration: () => T, applyChange: (configuration: T) => void, source = ConfigurationTarget.USER): Promise<void> {
		const configuration = createConfiguration();
		const configurationService = createRelauncher(configuration);

		applyChange(configuration);
		fireChange(configurationService, key, source);
		await Promise.resolve();
	}

	setup(() => {
		restartCount = 0;
		confirmCount = 0;
		confirmResult = false;
	});

	teardown(() => {
		disposables.clear();
	});

	test('prompts to restart when chat.agentHost.claudeAgent.enabled changes', async () => {
		confirmResult = true;
		await changeSetting(
			'chat.agentHost.claudeAgent.enabled',
			() => ({ chat: { agentHost: { claudeAgent: { enabled: true } } } }),
			c => c.chat.agentHost.claudeAgent.enabled = false);

		assert.strictEqual(confirmCount, 1, 'should prompt to restart');
		assert.strictEqual(restartCount, 1, 'should restart when confirmed');
	});

	test('prompts to restart when chat.agentHost.codexAgent.enabled changes', async () => {
		confirmResult = true;
		await changeSetting(
			'chat.agentHost.codexAgent.enabled',
			() => ({ chat: { agentHost: { codexAgent: { enabled: true } } } }),
			c => c.chat.agentHost.codexAgent.enabled = false);

		assert.strictEqual(confirmCount, 1, 'should prompt to restart');
		assert.strictEqual(restartCount, 1, 'should restart when confirmed');
	});

	test('prompts to restart when chat.agents.claude.preferAgentHost changes', async () => {
		confirmResult = true;
		await changeSetting(
			'chat.agents.claude.preferAgentHost',
			() => ({ chat: { agents: { claude: { preferAgentHost: true } } } }),
			c => c.chat.agents.claude.preferAgentHost = false);

		assert.strictEqual(confirmCount, 1, 'should prompt to restart');
		assert.strictEqual(restartCount, 1, 'should restart when confirmed');
	});

	test('prompts to restart when chat.editor.claude.preferAgentHost changes', async () => {
		confirmResult = true;
		await changeSetting(
			'chat.editor.claude.preferAgentHost',
			() => ({ chat: { editor: { claude: { preferAgentHost: true } } } }),
			c => c.chat.editor.claude.preferAgentHost = false);

		assert.strictEqual(confirmCount, 1, 'should prompt to restart');
		assert.strictEqual(restartCount, 1, 'should restart when confirmed');
	});

	test('does not restart when the confirmation is declined', async () => {
		confirmResult = false;
		await changeSetting(
			'chat.agentHost.claudeAgent.enabled',
			() => ({ chat: { agentHost: { claudeAgent: { enabled: true } } } }),
			c => c.chat.agentHost.claudeAgent.enabled = false);

		assert.strictEqual(confirmCount, 1, 'should prompt to restart');
		assert.strictEqual(restartCount, 0, 'should not restart when declined');
	});

	test('does not prompt when only the default value changes', async () => {
		confirmResult = true;
		await changeSetting(
			'chat.agentHost.claudeAgent.enabled',
			() => ({ chat: { agentHost: { claudeAgent: { enabled: true } } } }),
			c => c.chat.agentHost.claudeAgent.enabled = false,
			ConfigurationTarget.DEFAULT);

		assert.strictEqual(confirmCount, 0, 'should not prompt for default changes');
		assert.strictEqual(restartCount, 0);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
