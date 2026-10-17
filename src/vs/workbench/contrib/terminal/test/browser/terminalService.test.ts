/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, fail, strictEqual } from 'assert';
import { DeferredPromise, disposableTimeout } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { TestDialogService } from '../../../../../platform/dialogs/test/common/testDialogService.js';
import { TerminalLocation, TitleEventSource, type ITerminalBackend, type TerminalIcon } from '../../../../../platform/terminal/common/terminal.js';
import { ITerminalInstance, ITerminalInstanceService, ITerminalService } from '../../browser/terminal.js';
import { TerminalService } from '../../browser/terminalService.js';
import { TERMINAL_CONFIG_SECTION } from '../../common/terminal.js';
import { IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import type { IConfigurationChangeEvent } from '../../../../../platform/configuration/common/configuration.js';

suite('Workbench - TerminalService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let terminalService: TerminalService;
	let configurationService: TestConfigurationService;
	let dialogService: TestDialogService;
	let instantiationService: ReturnType<typeof workbenchInstantiationService>;

	setup(async () => {
		dialogService = new TestDialogService();
		configurationService = new TestConfigurationService({
			files: {},
			terminal: {
				integrated: {
					confirmOnKill: 'never',
					enablePersistentSessions: true
				}
			}
		});

		instantiationService = workbenchInstantiationService({
			configurationService: () => configurationService,
		}, store);
		instantiationService.stub(IDialogService, dialogService);
		instantiationService.stub(ITerminalInstanceService, 'getBackend', undefined);
		instantiationService.stub(ITerminalInstanceService, 'getRegisteredBackends', []);
		instantiationService.stub(IRemoteAgentService, 'getConnection', null);

		terminalService = store.add(instantiationService.createInstance(TerminalService));
		instantiationService.stub(ITerminalService, terminalService);
	});

	suite('background terminals', () => {
		test('should remove disposed hidden terminals and their listeners', async () => {
			const disposalEmitters = Array.from({ length: 3 }, () => store.add(new Emitter<ITerminalInstance>()));
			const instances = disposalEmitters.map((emitter, index) => ({
				instanceId: index + 1,
				onDisposed: emitter.event,
			} satisfies Partial<ITerminalInstance> as unknown as ITerminalInstance));
			let instanceIndex = 0;
			instantiationService.stub(ITerminalInstanceService, 'convertProfileToShellLaunchConfig', () => ({ hideFromUser: true }));
			instantiationService.stub(ITerminalInstanceService, 'createInstance', () => instances[instanceIndex++]);
			terminalService.registerProcessSupport(true);

			const backgroundedTerminalDisposables = Reflect.get(terminalService, '_backgroundedTerminalDisposables') as { size: number };
			for (let i = 0; i < instances.length; i++) {
				const instance = await terminalService.createTerminal({
					config: { hideFromUser: true },
					skipContributedProfileCheck: true,
				});

				strictEqual(terminalService.instances.includes(instance), true);
				strictEqual(backgroundedTerminalDisposables.size, 1);
				strictEqual(disposalEmitters[i].hasListeners(), true);

				disposalEmitters[i].fire(instance);

				strictEqual(terminalService.instances.includes(instance), false);
				strictEqual(backgroundedTerminalDisposables.size, 0);
				strictEqual(disposalEmitters[i].hasListeners(), false);
			}
		});
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
		test('should settle when the process already exited before disposal', async () => {
			// A failed task terminal is kept alive after its process exits, so disposing it fires onDisposed but never onExit again.
			const onDisposedEmitter = store.add(new Emitter<ITerminalInstance>());
			let disposeCount = 0;
			const instance = {
				target: TerminalLocation.Panel,
				hasChildProcesses: false,
				exitCode: 1,
				isDisposed: false,
				onExit: onExitEmitter.event,
				onDisposed: onDisposedEmitter.event,
				dispose: () => {
					disposeCount++;
					onDisposedEmitter.fire(instance);
				}
			} satisfies Partial<ITerminalInstance> as unknown as ITerminalInstance;

			deepStrictEqual({
				result: await settleWithin(terminalService.safeDisposeTerminal(instance)),
				disposeCount
			}, { result: 'settled', disposeCount: 1 });
		});
		test('should settle without waiting when the instance is already disposed', async () => {
			// Disposing an already disposed instance is a no-op, so no exit or dispose event fires.
			const instance = {
				target: TerminalLocation.Panel,
				hasChildProcesses: false,
				isDisposed: true,
				onExit: onExitEmitter.event,
				dispose: () => { }
			} satisfies Partial<ITerminalInstance> as unknown as ITerminalInstance;

			strictEqual(await settleWithin(terminalService.safeDisposeTerminal(instance)), 'settled');
		});
	});

	suite('persistent title and icon updates', () => {
		let backend: TestPersistentTerminalBackend;

		setup(() => {
			backend = new TestPersistentTerminalBackend();
			(terminalService as unknown as { _primaryBackend: Partial<ITerminalBackend> })._primaryBackend = backend;
		});

		test('should not update pty host metadata for custom pty terminals', async () => {
			const instance = createTerminalInstance({ customPtyImplementation: true });

			await runWithFakedTimers({}, async () => {
				updateTitle(terminalService, instance);
				updateIcon(terminalService, instance, false);
			});

			strictEqual(backend.titleUpdateCount, 0);
			strictEqual(backend.iconUpdateCount, 0);
		});

		test('should update pty host metadata for regular pty terminals', async () => {
			const instance = createTerminalInstance();

			await runWithFakedTimers({}, async () => {
				updateTitle(terminalService, instance);
				updateIcon(terminalService, instance, true);
			});

			strictEqual(backend.titleUpdateCount, 1);
			strictEqual(backend.iconUpdateCount, 1);
			strictEqual(backend.lastTitle, 'terminal title');
			strictEqual(backend.lastIconUserInitiated, true);
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

/**
 * Resolves to `'settled'` when the promise resolves within the grace period, otherwise `'pending'`.
 * Used to assert that a promise settles rather than relying on a mocha timeout.
 */
async function settleWithin(promise: Promise<void>): Promise<'settled' | 'pending'> {
	const onGracePeriodElapsed = new DeferredPromise<'pending'>();
	const gracePeriod = disposableTimeout(() => onGracePeriodElapsed.complete('pending'), 250);
	try {
		return await Promise.race([
			promise.then(() => 'settled' as const),
			onGracePeriodElapsed.p
		]);
	} finally {
		gracePeriod.dispose();
	}
}

class TestPersistentTerminalBackend implements Partial<ITerminalBackend> {
	titleUpdateCount = 0;
	iconUpdateCount = 0;
	lastTitle: string | undefined;
	lastIconUserInitiated: boolean | undefined;

	async updateTitle(_id: number, title: string, _titleSource: TitleEventSource): Promise<void> {
		this.titleUpdateCount++;
		this.lastTitle = title;
	}

	async updateIcon(_id: number, userInitiated: boolean, _icon: TerminalIcon, _color?: string): Promise<void> {
		this.iconUpdateCount++;
		this.lastIconUserInitiated = userInitiated;
	}
}

function createTerminalInstance(options?: { customPtyImplementation?: boolean }): ITerminalInstance {
	return {
		persistentProcessId: 13,
		title: 'terminal title',
		titleSource: TitleEventSource.Process,
		staticTitle: undefined,
		icon: { id: 'remote' },
		color: undefined,
		isDisposed: false,
		shellLaunchConfig: options?.customPtyImplementation
			? { customPtyImplementation: () => { throw new Error('should not be called'); } }
			: {},
	} satisfies Partial<ITerminalInstance> as unknown as ITerminalInstance;
}

function updateTitle(terminalService: TerminalService, instance: ITerminalInstance): void {
	const fn = Reflect.get(terminalService, '_updateTitle') as (instance: ITerminalInstance) => void;
	fn.call(terminalService, instance);
}

function updateIcon(terminalService: TerminalService, instance: ITerminalInstance, userInitiated: boolean): void {
	const fn = Reflect.get(terminalService, '_updateIcon') as (instance: ITerminalInstance, userInitiated: boolean) => void;
	fn.call(terminalService, instance, userInitiated);
}
