/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, fail, rejects, strictEqual } from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { URI } from '../../../../../base/common/uri.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Emitter } from '../../../../../base/common/event.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { TestDialogService } from '../../../../../platform/dialogs/test/common/testDialogService.js';
import { IShellLaunchConfig, ITerminalChatOwner, TerminalLocation, TitleEventSource, type ITerminalBackend, type TerminalIcon } from '../../../../../platform/terminal/common/terminal.js';
import { ITerminalInstance, ITerminalInstanceService, ITerminalService } from '../../browser/terminal.js';
import { TerminalService } from '../../browser/terminalService.js';
import { ITerminalProfileService, TERMINAL_CONFIG_SECTION } from '../../common/terminal.js';
import { IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import type { IConfigurationChangeEvent } from '../../../../../platform/configuration/common/configuration.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { mock } from '../../../../../base/test/common/mock.js';

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
		test('native backend identity is stable and qualified by remote authority before initialization', () => {
			const local = terminalService.defaultBackendIdentity;
			instantiationService.stub(IWorkbenchEnvironmentService, new class extends mock<IWorkbenchEnvironmentService>() {
				override readonly remoteAuthority = 'SSH-Remote+Host';
			});
			const remote = store.add(instantiationService.createInstance(TerminalService));
			deepStrictEqual([local, remote.defaultBackendIdentity], ['pty', 'pty:ssh-remote+host']);
		});

		test('creation options capture origin cwd and generation before profiles are ready', async () => {
			let generation = 1;
			const owner: ITerminalChatOwner = { backend: 'pty', sessionResource: 'opaque:/session', chatResource: 'opaque:/A' };
			store.add(terminalService.registerChatOwnerProvider(() => owner, undefined, () => {
				const captured = generation;
				return { cwd: URI.file('/A'), isCurrent: () => captured === generation };
			}));
			const origin = terminalService.captureChatCreationOptions();
			const profiles = new DeferredPromise<void>();
			instantiationService.stub(ITerminalProfileService, 'availableProfiles', []);
			instantiationService.stub(ITerminalProfileService, 'profilesReady', profiles.p);
			instantiationService.stub(ITerminalInstanceService, 'convertProfileToShellLaunchConfig', (config: IShellLaunchConfig) => ({ ...config }));
			const creating = terminalService.createTerminal({ ...origin, config: { hideFromUser: true }, skipContributedProfileCheck: true });
			const rejection = rejects(creating, CancellationError);
			generation++;
			await profiles.complete();
			await rejection;
			deepStrictEqual({ cwd: origin.cwd, current: origin.isCurrent?.(), instances: terminalService.instances.length }, { cwd: URI.file('/A'), current: false, instances: 0 });
		});

		test('captures the request origin before asynchronous creation and preserves restored backend ownership', async () => {
			const firstOwner: ITerminalChatOwner = { backend: 'pty', sessionResource: 'opaque:/session', chatResource: 'opaque:/A' };
			const secondOwner = { ...firstOwner, chatResource: 'opaque:/B' };
			let focusedOwner = firstOwner;
			store.add(terminalService.registerChatOwnerProvider(() => focusedOwner));
			const configs: IShellLaunchConfig[] = [];
			instantiationService.stub(ITerminalInstanceService, 'convertProfileToShellLaunchConfig', (config: IShellLaunchConfig) => ({ ...config }));
			instantiationService.stub(ITerminalInstanceService, 'createInstance', (config: IShellLaunchConfig) => {
				configs.push(config);
				return {
					instanceId: 400 + configs.length,
					shellLaunchConfig: config,
					onDisposed: store.add(new Emitter<ITerminalInstance>()).event,
				} satisfies Partial<ITerminalInstance> as ITerminalInstance;
			});
			terminalService.registerProcessSupport(true);
			const creating = terminalService.createTerminal({ config: { hideFromUser: true }, skipContributedProfileCheck: true });
			focusedOwner = secondOwner;
			await creating;
			await terminalService.createTerminal({
				config: { hideFromUser: true, attachPersistentProcess: { id: 17, pid: 100, title: 'restored', titleSource: TitleEventSource.Api, cwd: '/same', shellIntegrationNonce: 'nonce', chatOwner: firstOwner } },
				skipContributedProfileCheck: true,
			});
			await terminalService.createTerminal({ config: { hideFromUser: true }, chatOwner: null, skipContributedProfileCheck: true });
			await terminalService.createTerminal({ config: { hideFromUser: true, chatOwner: firstOwner }, chatOwner: secondOwner, skipContributedProfileCheck: true });
			deepStrictEqual(configs.map(config => config.chatOwner), [firstOwner, firstOwner, undefined, firstOwner]);
		});

		test('owned contributed creation snapshots host and cwd and returns its background process without focus', async () => {
			const firstOwner: ITerminalChatOwner = { backend: 'agentHost:A', sessionResource: 'opaque:/session', chatResource: 'opaque:/A' };
			const secondOwner = { ...firstOwner, backend: 'agentHost:B', chatResource: 'opaque:/B' };
			let focusedOwner = firstOwner;
			let focusCalls = 0;
			const profiles = new DeferredPromise<void>();
			const requests: { id: string; cwd: string | URI | undefined }[] = [];
			const configs: IShellLaunchConfig[] = [];
			store.add(terminalService.registerChatOwnerProvider(() => focusedOwner, () => false, owner => ({ cwd: URI.file(owner.chatResource === firstOwner.chatResource ? '/A' : '/B') })));
			instantiationService.stub(ITerminalProfileService, 'getDefaultProfile', undefined);
			instantiationService.stub(ITerminalProfileService, 'availableProfiles', []);
			instantiationService.stub(ITerminalProfileService, 'profilesReady', profiles.p);
			instantiationService.stub(ITerminalProfileService, 'getContributedDefaultProfile', () => Promise.resolve({ extensionIdentifier: focusedOwner.backend, id: focusedOwner.chatResource, title: 'Host' }));
			instantiationService.stub(ITerminalInstanceService, 'convertProfileToShellLaunchConfig', (config: IShellLaunchConfig) => ({ ...config }));
			instantiationService.stub(ITerminalInstanceService, 'createInstance', (config: IShellLaunchConfig) => {
				configs.push(config);
				return {
					instanceId: 400 + configs.length,
					shellLaunchConfig: config,
					onDisposed: store.add(new Emitter<ITerminalInstance>()).event,
					focusWhenReady: async () => { focusCalls++; },
				} satisfies Partial<ITerminalInstance> as ITerminalInstance;
			});
			terminalService.createContributedTerminalProfile = async (_extension, id, options) => {
				requests.push({ id, cwd: options.cwd });
				await terminalService.createTerminal({
					config: { hideFromUser: true, customPtyImplementation: () => { throw new Error('Not launched'); } },
					chatOwner: options.chatOwner,
					skipContributedProfileCheck: true,
				});
			};
			terminalService.registerProcessSupport(true);
			const creating = terminalService.createTerminal();
			focusedOwner = secondOwner;
			await profiles.complete();
			const created = await creating;
			deepStrictEqual({ requests, owner: created.shellLaunchConfig.chatOwner, focusCalls }, { requests: [{ id: firstOwner.chatResource, cwd: URI.file('/A') }], owner: firstOwner, focusCalls: 0 });
		});

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

		test('owned cleanup rechecks its generation after terminal confirmation before disposal', async () => {
			await setConfirmOnKill(configurationService, 'always');
			const confirmation = new DeferredPromise<{ confirmed: boolean }>();
			instantiationService.stub(IDialogService, 'confirm', () => confirmation.p);
			let current = true;
			let disposed = 0;
			const instance = {
				instanceId: 1,
				target: TerminalLocation.Panel,
				hasChildProcesses: true,
				onExit: onExitEmitter.event,
				dispose: () => { disposed++; onExitEmitter.fire(undefined); },
			} satisfies Partial<ITerminalInstance> as ITerminalInstance;
			const closing = terminalService.safeDisposeTerminal(instance, () => current);
			current = false;
			await confirmation.complete({ confirmed: true });
			await closing;
			strictEqual(disposed, 0);
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
