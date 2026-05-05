/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert, { fail } from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { TestDialogService } from '../../../../../platform/dialogs/test/common/testDialogService.js';
import { TerminalExitReason, TerminalLocation } from '../../../../../platform/terminal/common/terminal.js';
import { ITerminalGroupService, ITerminalInstance, ITerminalInstanceService, ITerminalService } from '../../browser/terminal.js';
import { TerminalService } from '../../browser/terminalService.js';
import { TERMINAL_CONFIG_SECTION } from '../../common/terminal.js';
import { IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { workbenchInstantiationService, TestLifecycleService } from '../../../../test/browser/workbenchTestServices.js';
import type { IConfigurationChangeEvent } from '../../../../../platform/configuration/common/configuration.js';
import { ILifecycleService, ShutdownReason } from '../../../../services/lifecycle/common/lifecycle.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';

suite('Workbench - TerminalService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let terminalService: TerminalService;
	let configurationService: TestConfigurationService;
	let dialogService: TestDialogService;
	let lifecycleService: TestLifecycleService;

	setup(async () => {
		dialogService = new TestDialogService();
		configurationService = new TestConfigurationService({
			files: {},
			terminal: {
				integrated: {
					confirmOnKill: 'never'
				}
			}
		});

		const instantiationService = workbenchInstantiationService({
			configurationService: () => configurationService,
		}, store);
		instantiationService.stub(IDialogService, dialogService);
		instantiationService.stub(ITerminalInstanceService, 'getBackend', undefined);
		instantiationService.stub(ITerminalInstanceService, 'getRegisteredBackends', []);
		instantiationService.stub(IRemoteAgentService, 'getConnection', null);

		terminalService = store.add(instantiationService.createInstance(TerminalService));
		instantiationService.stub(ITerminalService, terminalService);
		lifecycleService = instantiationService.get(ILifecycleService) as TestLifecycleService;
	});

	suite('safeDisposeTerminal', () => {
		let onExitEmitter: Emitter<number | undefined>;

		setup(() => {
			onExitEmitter = store.add(new Emitter<number | undefined>());
		});

		test('should not show prompt when confirmOnKill is never', async () => {
			await setConfirmOnKill(configurationService, 'never');
			await terminalService.safeDisposeTerminal({
				target: TerminalLocation.Editor,
				hasChildProcesses: true,
				onExit: onExitEmitter.event,
				dispose: () => onExitEmitter.fire(undefined)
			} satisfies Partial<ITerminalInstance> as unknown as ITerminalInstance);
			await terminalService.safeDisposeTerminal({
				target: TerminalLocation.Panel,
				hasChildProcesses: true,
				onExit: onExitEmitter.event,
				dispose: () => onExitEmitter.fire(undefined)
			} satisfies Partial<ITerminalInstance> as unknown as ITerminalInstance);
		});
		test('should not show prompt when any terminal editor is closed (handled by editor itself)', async () => {
			await setConfirmOnKill(configurationService, 'editor');
			terminalService.safeDisposeTerminal({
				target: TerminalLocation.Editor,
				hasChildProcesses: true,
				onExit: onExitEmitter.event,
				dispose: () => onExitEmitter.fire(undefined)
			} satisfies Partial<ITerminalInstance> as unknown as ITerminalInstance);
			await setConfirmOnKill(configurationService, 'always');
			terminalService.safeDisposeTerminal({
				target: TerminalLocation.Editor,
				hasChildProcesses: true,
				onExit: onExitEmitter.event,
				dispose: () => onExitEmitter.fire(undefined)
			} satisfies Partial<ITerminalInstance> as unknown as ITerminalInstance);
		});
		test('should not show prompt when confirmOnKill is editor and panel terminal is closed', async () => {
			await setConfirmOnKill(configurationService, 'editor');
			terminalService.safeDisposeTerminal({
				target: TerminalLocation.Panel,
				hasChildProcesses: true,
				onExit: onExitEmitter.event,
				dispose: () => onExitEmitter.fire(undefined)
			} satisfies Partial<ITerminalInstance> as unknown as ITerminalInstance);
		});
		test('should show prompt when confirmOnKill is panel and panel terminal is closed', async () => {
			await setConfirmOnKill(configurationService, 'panel');
			// No child process cases
			dialogService.setConfirmResult({ confirmed: false });
			terminalService.safeDisposeTerminal({
				target: TerminalLocation.Panel,
				hasChildProcesses: false,
				onExit: onExitEmitter.event,
				dispose: () => onExitEmitter.fire(undefined)
			} satisfies Partial<ITerminalInstance> as unknown as ITerminalInstance);
			dialogService.setConfirmResult({ confirmed: true });
			terminalService.safeDisposeTerminal({
				target: TerminalLocation.Panel,
				hasChildProcesses: false,
				onExit: onExitEmitter.event,
				dispose: () => onExitEmitter.fire(undefined)
			} satisfies Partial<ITerminalInstance> as unknown as ITerminalInstance);
			// Child process cases
			dialogService.setConfirmResult({ confirmed: false });
			await terminalService.safeDisposeTerminal({
				target: TerminalLocation.Panel,
				hasChildProcesses: true,
				dispose: () => fail()
			} satisfies Partial<ITerminalInstance> as unknown as ITerminalInstance);
			dialogService.setConfirmResult({ confirmed: true });
			terminalService.safeDisposeTerminal({
				target: TerminalLocation.Panel,
				hasChildProcesses: true,
				onExit: onExitEmitter.event,
				dispose: () => onExitEmitter.fire(undefined)
			} satisfies Partial<ITerminalInstance> as unknown as ITerminalInstance);
		});
		test('should show prompt when confirmOnKill is always and panel terminal is closed', async () => {
			await setConfirmOnKill(configurationService, 'always');
			// No child process cases
			dialogService.setConfirmResult({ confirmed: false });
			terminalService.safeDisposeTerminal({
				target: TerminalLocation.Panel,
				hasChildProcesses: false,
				onExit: onExitEmitter.event,
				dispose: () => onExitEmitter.fire(undefined)
			} satisfies Partial<ITerminalInstance> as unknown as ITerminalInstance);
			dialogService.setConfirmResult({ confirmed: true });
			terminalService.safeDisposeTerminal({
				target: TerminalLocation.Panel,
				hasChildProcesses: false,
				onExit: onExitEmitter.event,
				dispose: () => onExitEmitter.fire(undefined)
			} satisfies Partial<ITerminalInstance> as unknown as ITerminalInstance);
			// Child process cases
			dialogService.setConfirmResult({ confirmed: false });
			await terminalService.safeDisposeTerminal({
				target: TerminalLocation.Panel,
				hasChildProcesses: true,
				dispose: () => fail()
			} satisfies Partial<ITerminalInstance> as unknown as ITerminalInstance);
			dialogService.setConfirmResult({ confirmed: true });
			terminalService.safeDisposeTerminal({
				target: TerminalLocation.Panel,
				hasChildProcesses: true,
				onExit: onExitEmitter.event,
				dispose: () => onExitEmitter.fire(undefined)
			} satisfies Partial<ITerminalInstance> as unknown as ITerminalInstance);
		});
	});

	suite('_onWillShutdown', () => {
		// Regression test for https://github.com/microsoft/vscode/issues/304649
		// Closing one window must not kill PTY processes that other open windows rely on.
		test('should detach (not dispose) terminal processes when other windows are still open', () => {
			let detachCalled = false;
			let disposeCalled = false;

			const fakeInstance = {
				shouldPersist: false,
				detachProcessAndDispose: (_reason: TerminalExitReason) => {
					detachCalled = true;
					return Promise.resolve();
				},
				dispose: (_reason?: TerminalExitReason) => {
					disposeCalled = true;
				},
			} satisfies Partial<ITerminalInstance> as unknown as ITerminalInstance;

			// Expose the internal group service instances list via the stub.
			const groupService = (terminalService as unknown as { _terminalGroupService: ITerminalGroupService })._terminalGroupService;
			const originalInstances = Object.getOwnPropertyDescriptor(groupService, 'instances');
			Object.defineProperty(groupService, 'instances', { get: () => [fakeInstance], configurable: true });

			// Simulate: _onBeforeShutdownAsync already ran and found 2 open windows.
			(terminalService as unknown as { _shutdownWindowCount: number })._shutdownWindowCount = 2;

			lifecycleService.fireShutdown(ShutdownReason.CLOSE);

			// Restore the original descriptor.
			if (originalInstances) {
				Object.defineProperty(groupService, 'instances', originalInstances);
			} else {
				Object.defineProperty(groupService, 'instances', { get: () => [], configurable: true });
			}

			assert.strictEqual(detachCalled, true, 'detachProcessAndDispose should be called when other windows are open');
			assert.strictEqual(disposeCalled, false, 'dispose should NOT be called when other windows are open');
		});

		test('should dispose (kill) terminal processes when this is the last open window', () => {
			let detachCalled = false;
			let disposeCalled = false;

			const fakeInstance = {
				shouldPersist: false,
				detachProcessAndDispose: (_reason: TerminalExitReason) => {
					detachCalled = true;
					return Promise.resolve();
				},
				dispose: (_reason?: TerminalExitReason) => {
					disposeCalled = true;
				},
			} satisfies Partial<ITerminalInstance> as unknown as ITerminalInstance;

			const groupService = (terminalService as unknown as { _terminalGroupService: ITerminalGroupService })._terminalGroupService;
			const originalInstances = Object.getOwnPropertyDescriptor(groupService, 'instances');
			Object.defineProperty(groupService, 'instances', { get: () => [fakeInstance], configurable: true });

			// Simulate: only 1 window open (this is the last one).
			(terminalService as unknown as { _shutdownWindowCount: number })._shutdownWindowCount = 1;

			lifecycleService.fireShutdown(ShutdownReason.CLOSE);

			if (originalInstances) {
				Object.defineProperty(groupService, 'instances', originalInstances);
			} else {
				Object.defineProperty(groupService, 'instances', { get: () => [], configurable: true });
			}

			assert.strictEqual(disposeCalled, true, 'dispose should be called when this is the last window');
			assert.strictEqual(detachCalled, false, 'detachProcessAndDispose should NOT be called when this is the last window');
		});

		test('should detach (not dispose) when window count is unknown but multiple windows are open', () => {
			// When _shutdownWindowCount is undefined (native delegate not set), default to safe behaviour.
			// This test documents that the guard only fires when the count is explicitly > 1.
			let disposeCalled = false;

			const fakeInstance = {
				shouldPersist: false,
				detachProcessAndDispose: (_reason: TerminalExitReason) => Promise.resolve(),
				dispose: (_reason?: TerminalExitReason) => { disposeCalled = true; },
			} satisfies Partial<ITerminalInstance> as unknown as ITerminalInstance;

			const groupService = (terminalService as unknown as { _terminalGroupService: ITerminalGroupService })._terminalGroupService;
			const originalInstances = Object.getOwnPropertyDescriptor(groupService, 'instances');
			Object.defineProperty(groupService, 'instances', { get: () => [fakeInstance], configurable: true });

			// Leave _shutdownWindowCount as undefined (no native delegate).
			(terminalService as unknown as { _shutdownWindowCount: number | undefined })._shutdownWindowCount = undefined;

			lifecycleService.fireWillShutdown({
				reason: ShutdownReason.CLOSE,
				join: () => { },
				joiners: () => [],
				force: () => { },
				token: CancellationToken.None,
			});

			if (originalInstances) {
				Object.defineProperty(groupService, 'instances', originalInstances);
			} else {
				Object.defineProperty(groupService, 'instances', { get: () => [], configurable: true });
			}

			// When count is undefined the guard does not activate, so dispose is called.
			assert.strictEqual(disposeCalled, true, 'dispose should be called when window count is unknown');
		});
	});
});

async function setConfirmOnKill(configurationService: TestConfigurationService, value: 'never' | 'always' | 'panel' | 'editor') {
	await configurationService.setUserConfiguration(TERMINAL_CONFIG_SECTION, { confirmOnKill: value });
	configurationService.onDidChangeConfigurationEmitter.fire({
		affectsConfiguration: () => true,
		affectedKeys: ['terminal.integrated.confirmOnKill']
	} as unknown as IConfigurationChangeEvent);
}
