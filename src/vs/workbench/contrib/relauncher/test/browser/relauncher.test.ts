/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { SyncStatus, IUserDataSyncService, IUserDataSyncEnablementService } from '../../../../../platform/userDataSync/common/userDataSync.js';
import { IWorkspace, IWorkspaceContextService, IWorkspaceFoldersChangeEvent, WorkbenchState } from '../../../../../platform/workspace/common/workspace.js';
import { testWorkspace } from '../../../../../platform/workspace/test/common/testWorkspace.js';
import { IUserDataSyncWorkbenchService } from '../../../../services/userDataSync/common/userDataSync.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { IAgenticModeService } from '../../../../services/agenticMode/common/agenticMode.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { SettingsChangeRelauncher, WorkspaceChangeExtHostRelauncher } from '../../browser/relauncher.contribution.js';

suite('SettingsChangeRelauncher', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

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

	test('prompts to restart when chat.agentHost.claudeAgent.enabled changes', async () => {
		confirmResult = true;
		await changeSetting(
			'chat.agentHost.claudeAgent.enabled',
			() => ({ chat: { agentHost: { claudeAgent: { enabled: true } } } }),
			c => c.chat.agentHost.claudeAgent.enabled = false);

		assert.strictEqual(confirmCount, 1, 'should prompt to restart');
		assert.strictEqual(restartCount, 1, 'should restart when confirmed');
	});

	test('prompts to restart when chat.agentHost.computerUse.enabled changes', async () => {
		confirmResult = true;
		await changeSetting(
			'chat.agentHost.computerUse.enabled',
			() => ({ chat: { agentHost: { computerUse: { enabled: false } } } }),
			c => c.chat.agentHost.computerUse.enabled = true);

		assert.deepStrictEqual({ confirmCount, restartCount }, { confirmCount: 1, restartCount: 1 });
	});

	test('does not prompt to restart when chat.viewSessions.sessionsList.enabled is turned on or off, which applies live', async () => {
		confirmResult = true;
		await changeSetting(
			'chat.viewSessions.sessionsList.enabled',
			() => ({ chat: { viewSessions: { sessionsList: { enabled: false } } } }),
			c => c.chat.viewSessions.sessionsList.enabled = true);
		const turnedOn = { confirmCount, restartCount };
		await changeSetting(
			'chat.viewSessions.sessionsList.enabled',
			() => ({ chat: { viewSessions: { sessionsList: { enabled: true } } } }),
			c => c.chat.viewSessions.sessionsList.enabled = false);

		assert.deepStrictEqual({ turnedOn, turnedOff: { confirmCount, restartCount } }, { turnedOn: { confirmCount: 0, restartCount: 0 }, turnedOff: { confirmCount: 0, restartCount: 0 } });
	});

	test('does not prompt to restart when chat.agentHost.codexAgent.enabled changes', async () => {
		confirmResult = true;
		await changeSetting(
			'chat.agentHost.codexAgent.enabled',
			() => ({ chat: { agentHost: { codexAgent: { enabled: true } } } }),
			c => c.chat.agentHost.codexAgent.enabled = false);

		assert.strictEqual(confirmCount, 0, 'should not prompt to restart');
		assert.strictEqual(restartCount, 0, 'should not restart');
	});

	test('does not prompt to restart when chat.agentHost.byokModels.enabled changes', async () => {
		confirmResult = true;
		await changeSetting(
			'chat.agentHost.byokModels.enabled',
			() => ({ chat: { agentHost: { byokModels: { enabled: true } } } }),
			c => c.chat.agentHost.byokModels.enabled = false);

		assert.strictEqual(confirmCount, 0, 'should not prompt to restart');
		assert.strictEqual(restartCount, 0, 'should not restart');
	});

	test('prompts to restart when chat.editor.codex.preferAgentHost changes', async () => {
		confirmResult = true;
		await changeSetting(
			'chat.editor.codex.preferAgentHost',
			() => ({ chat: { editor: { codex: { preferAgentHost: true } } } }),
			c => c.chat.editor.codex.preferAgentHost = false);

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

});

suite('WorkspaceChangeExtHostRelauncher', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	/**
	 * Creates the relauncher on a workspace window. A remote window reloads instead of restarting the
	 * extension host, which makes the restart observable on every platform.
	 */
	async function createRelauncher() {
		const state = { workbenchState: WorkbenchState.WORKSPACE, workspace: testWorkspace(URI.file('/first')) as IWorkspace, isAgenticMode: false, restarts: 0 };
		const onDidChangeWorkbenchState = disposables.add(new Emitter<WorkbenchState>());
		const onDidChangeWorkspaceFolders = disposables.add(new Emitter<IWorkspaceFoldersChangeEvent>());
		const contextService = {
			getCompleteWorkspace: async () => state.workspace,
			getWorkspace: () => state.workspace,
			getWorkbenchState: () => state.workbenchState,
			onDidChangeWorkbenchState: onDidChangeWorkbenchState.event,
			onDidChangeWorkspaceFolders: onDidChangeWorkspaceFolders.event,
		} as Partial<IWorkspaceContextService> as IWorkspaceContextService;
		const agenticModeService = { get isActive() { return state.isAgenticMode; } } as Partial<IAgenticModeService> as IAgenticModeService;
		const hostService = { reload: async () => { state.restarts++; } } as Partial<IHostService> as IHostService;
		const environmentService = { remoteAuthority: 'test' } as Partial<IWorkbenchEnvironmentService> as IWorkbenchEnvironmentService;

		disposables.add(new WorkspaceChangeExtHostRelauncher(contextService, {} as IExtensionService, hostService, environmentService, agenticModeService));
		await timeout(0);

		const changeFirstFolder = async (path: string | undefined, workbenchState = state.workbenchState) => {
			state.workbenchState = workbenchState;
			state.workspace = path ? testWorkspace(URI.file(path)) : testWorkspace();
			onDidChangeWorkspaceFolders.fire({ added: [], removed: [], changed: [] });
			await timeout(20);
			return state.restarts;
		};
		return { state, changeFirstFolder };
	}

	test('restarts the extension host only when the first folder changes outside Agentic Mode', async () => {
		const { state, changeFirstFolder } = await createRelauncher();

		const outsideMode = await changeFirstFolder('/second');
		state.isAgenticMode = true;
		const inMode = await changeFirstFolder('/third');
		state.isAgenticMode = false;
		const leavingMode = await changeFirstFolder(undefined, WorkbenchState.EMPTY);

		assert.deepStrictEqual({ outsideMode, inMode, leavingMode }, { outsideMode: 1, inMode: 1, leavingMode: 1 });
	});

	test('does not restart the extension host when a workspace window gets its own folders back on leaving Agentic Mode', async () => {
		const { state, changeFirstFolder } = await createRelauncher();

		state.isAgenticMode = true;
		const entering = await changeFirstFolder('/session', WorkbenchState.EMPTY);
		const sessionChanged = await changeFirstFolder('/other-session');
		state.isAgenticMode = false;
		const leaving = await changeFirstFolder('/first', WorkbenchState.WORKSPACE);
		const afterLeaving = await changeFirstFolder('/second');

		assert.deepStrictEqual({ entering, sessionChanged, leaving, afterLeaving }, { entering: 0, sessionChanged: 0, leaving: 0, afterLeaving: 1 });
	});
});
