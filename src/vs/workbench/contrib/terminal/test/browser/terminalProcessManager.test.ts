/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, ok, strictEqual } from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { encodeHex, VSBuffer } from '../../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Schemas } from '../../../../../base/common/network.js';
import { getCaseInsensitive } from '../../../../../base/common/objects.js';
import { isWindows, OperatingSystem, type IProcessEnvironment } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { IConfigurationService, type IConfigurationChangeEvent } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { EnvironmentVariableMutatorType, type IEnvironmentVariableCollection } from '../../../../../platform/terminal/common/environmentVariable.js';
import { ITerminalChildProcess, TitleEventSource, type IProcessReadyEvent, type ITerminalBackend, type ITerminalProcessOptions } from '../../../../../platform/terminal/common/terminal.js';
import { ITerminalInstanceService, ITerminalService } from '../../browser/terminal.js';
import { TerminalProcessManager } from '../../browser/terminalProcessManager.js';
import { IEnvironmentVariableService } from '../../common/environmentVariable.js';
import { IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { IRemoteAgentEnvironment } from '../../../../../platform/remote/common/remoteAgentEnvironment.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';

function listenerCount(emitter: Emitter<unknown>): number {
	return (emitter as unknown as { _size: number })._size ?? 0;
}

class TestTerminalChildProcess implements ITerminalChildProcess {
	id: number = 0;
	readonly calls: string[] = [];
	private readonly _onProcessReady = new Emitter<IProcessReadyEvent>();
	get capabilities() { return []; }
	constructor(
		readonly shouldPersist: boolean
	) {
	}
	fireReady(pid: number): void {
		this._onProcessReady.fire({ pid, cwd: '', windowsPty: undefined });
	}
	updateProperty(property: any, value: any): Promise<void> {
		throw new Error('Method not implemented.');
	}

	readonly onProcessOverrideDimensions?: Event<any> | undefined;
	readonly onProcessResolvedShellLaunchConfig?: Event<any> | undefined;
	readonly onDidChangeHasChildProcesses?: Event<any> | undefined;

	onDidChangeProperty = Event.None;
	onProcessData = Event.None;
	onProcessExit = Event.None;
	onProcessReady = this._onProcessReady.event;
	onProcessTitleChanged = Event.None;
	onProcessShellTypeChanged = Event.None;
	async start(): Promise<undefined> { this.calls.push('start'); return undefined; }
	shutdown(immediate: boolean): void { }
	input(data: string): void { }
	sendSignal(signal: string): void { }
	resize(cols: number, rows: number): void { }
	clearBuffer(): void { }
	setParentWindow(handle: VSBuffer): void { this.calls.push(`setParentWindow ${encodeHex(handle)}`); }
	acknowledgeDataEvent(charCount: number): void { }
	async setUnicodeVersion(version: '6' | '11'): Promise<void> { }
	async getInitialCwd(): Promise<string> { return ''; }
	async getCwd(): Promise<string> { return ''; }
	async processBinary(data: string): Promise<void> { }
	refreshProperty(property: any): Promise<any> { return Promise.resolve(''); }
}

class TestTerminalInstanceService implements Partial<ITerminalInstanceService> {
	readonly ptyHostRestartEmitter = new Emitter<void>();
	readonly revivedAttachArgs: [id: number, pid: number][] = [];
	readonly createdProcesses: TestTerminalChildProcess[] = [];
	readonly createProcessRequests: { env: IProcessEnvironment; options: ITerminalProcessOptions }[] = [];
	refuseRevivedAttach = false;
	async getBackend() {
		return {
			onPtyHostExit: Event.None,
			onPtyHostUnresponsive: Event.None,
			onPtyHostResponsive: Event.None,
			onPtyHostRestart: this.ptyHostRestartEmitter.event,
			onDidMoveWindowInstance: Event.None,
			onDidRequestDetach: Event.None,
			createProcess: (
				shellLaunchConfig: any,
				cwd: string,
				cols: number,
				rows: number,
				unicodeVersion: '6' | '11',
				env: IProcessEnvironment,
				options: ITerminalProcessOptions,
				shouldPersist: boolean
			) => {
				this.createProcessRequests.push({ env: { ...env }, options });
				const childProcess = new TestTerminalChildProcess(shouldPersist);
				childProcess.id = this.createdProcesses.push(childProcess);
				return childProcess;
			},
			attachToRevivedProcess: async (id: number, pid: number) => {
				this.revivedAttachArgs.push([id, pid]);
				return this.refuseRevivedAttach ? undefined : new TestTerminalChildProcess(true);
			},
			getLatency: () => Promise.resolve([]),
			getShellEnvironment: () => Promise.resolve({})
		} as unknown as ITerminalBackend;
	}
}

suite('Workbench - TerminalProcessManager', () => {
	let manager: TerminalProcessManager;
	let terminalInstanceService: TestTerminalInstanceService;
	let environmentVariableService: IEnvironmentVariableService;
	let instantiationService: ReturnType<typeof workbenchInstantiationService>;

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	setup(async () => {
		instantiationService = workbenchInstantiationService(undefined, store);
		const configurationService = instantiationService.get(IConfigurationService) as TestConfigurationService;
		await configurationService.setUserConfiguration('editor', { fontFamily: 'foo' });
		await configurationService.setUserConfiguration('terminal', {
			integrated: {
				fontFamily: 'bar',
				enablePersistentSessions: true,
				shellIntegration: {
					enabled: false
				}
			}
		});
		configurationService.onDidChangeConfigurationEmitter.fire({
			affectsConfiguration: () => true,
		} satisfies Partial<IConfigurationChangeEvent> as unknown as IConfigurationChangeEvent);
		terminalInstanceService = new TestTerminalInstanceService();
		store.add(terminalInstanceService.ptyHostRestartEmitter);
		instantiationService.stub(ITerminalInstanceService, terminalInstanceService);
		instantiationService.stub(ITerminalService, { setNextCommandId: async () => { } } as Partial<ITerminalService>);
		environmentVariableService = instantiationService.get(IEnvironmentVariableService);

		manager = store.add(instantiationService.createInstance(TerminalProcessManager, 1, undefined, undefined, undefined));
	});

	interface IEnvironmentVariableCollectionWithProducer extends IEnvironmentVariableCollection {
		readonly remoteAuthority?: string | null;
	}

	function setCollection(extensionIdentifier: string, collection: IEnvironmentVariableCollectionWithProducer): void {
		environmentVariableService.set(extensionIdentifier, collection);
	}

	function serializedVariables(options: ITerminalProcessOptions): string[] {
		return options.environmentVariableCollections?.flatMap(([, collection]) => collection.map(([, mutator]) => mutator.variable)) ?? [];
	}

	test('does not apply or serialize PATH from a different terminal host while retaining non-PATH variables', async () => {
		setCollection('foreign.extension', {
			remoteAuthority: 'ssh-remote+foreign-host',
			map: new Map([
				['foreign-path', { variable: 'PATH', value: ':/foreign/bin', type: EnvironmentVariableMutatorType.Append }],
				['shared-value', { variable: 'SHARED_VALUE', value: 'available', type: EnvironmentVariableMutatorType.Replace }]
			])
		});
		setCollection('local.extension', {
			remoteAuthority: null,
			map: new Map([
				['local-path', { variable: 'PATH', value: ':/local/bin', type: EnvironmentVariableMutatorType.Append }]
			])
		});

		await manager.createProcess({}, 80, 24, false);

		const request = terminalInstanceService.createProcessRequests.at(-1)!;
		const path = request.env.PATH ?? getCaseInsensitive(request.env, 'PATH');
		ok(typeof path === 'string');
		strictEqual(path.includes('/foreign/bin'), false);
		strictEqual(path.includes('/local/bin'), true);
		strictEqual(request.env.SHARED_VALUE, 'available');
		deepStrictEqual(serializedVariables(request.options), ['SHARED_VALUE', 'PATH']);
	});

	test('does not carry a historical collection into a strict-environment launch', async () => {
		const historicalManager = store.add(instantiationService.createInstance(TerminalProcessManager, 2, undefined, new Map([
			['historical.extension', {
				map: new Map([
					['historical-path', { variable: 'PATH', value: ':/historical/bin', type: EnvironmentVariableMutatorType.Append }]
				])
			}]
		]), undefined));
		const environmentInfoChanges: (typeof historicalManager.environmentVariableInfo)[] = [];
		store.add(historicalManager.onEnvironmentVariableInfoChanged(info => environmentInfoChanges.push(info)));

		await historicalManager.createProcess({ strictEnv: true, env: { PATH: '/strict/bin' } }, 80, 24, false);

		const request = terminalInstanceService.createProcessRequests.at(-1)!;
		strictEqual(request.env.PATH, '/strict/bin');
		strictEqual(request.options.environmentVariableCollections, undefined);
		strictEqual(historicalManager.environmentVariableInfo, undefined);
		deepStrictEqual(environmentInfoChanges, [undefined]);
	});

	test('clears historical PATH status when attachment falls back to a fresh launch with no eligible collection', async () => {
		const historicalManager = store.add(instantiationService.createInstance(TerminalProcessManager, 3, undefined, new Map([
			['historical.extension', {
				map: new Map([
					['historical-path', { variable: 'PATH', value: ':/historical/bin', type: EnvironmentVariableMutatorType.Append }]
				])
			}]
		]), undefined));
		terminalInstanceService.refuseRevivedAttach = true;
		const environmentInfoChanges: (typeof historicalManager.environmentVariableInfo)[] = [];
		store.add(historicalManager.onEnvironmentVariableInfoChanged(info => environmentInfoChanges.push(info)));

		await historicalManager.createProcess({
			attachPersistentProcess: { id: 21, pid: 72265, findRevivedId: true, title: 'zsh', titleSource: TitleEventSource.Process, cwd: '', shellIntegrationNonce: '' }
		}, 80, 24, false);

		strictEqual(historicalManager.environmentVariableInfo, undefined);
		deepStrictEqual(environmentInfoChanges, [undefined]);
	});

	test('ignores collection changes that affect only another terminal host', async () => {
		setCollection('foreign.extension', {
			remoteAuthority: 'ssh-remote+foreign-host',
			map: new Map([
				['foreign-path', { variable: 'PATH', value: ':/foreign/bin', type: EnvironmentVariableMutatorType.Append }]
			])
		});
		await manager.createProcess({}, 80, 24, false);

		const changeCollectionsEmitter = (environmentVariableService as unknown as { _onDidChangeCollections: Emitter<unknown> })._onDidChangeCollections;
		changeCollectionsEmitter.fire(environmentVariableService.mergedCollection);

		strictEqual(manager.environmentVariableInfo, undefined);
	});

	for (const os of [OperatingSystem.Windows, OperatingSystem.Linux, OperatingSystem.Macintosh]) {
		test(`uses remote OS ${os} and case-insensitive authority for process options and updates`, async () => {
			instantiationService.stub(IRemoteAgentService, {
				getEnvironment: async () => upcastPartial<IRemoteAgentEnvironment>({ os, userHome: URI.file('/home/test') })
			});
			setCollection('remote.extension', {
				remoteAuthority: 'wsl+ubuntu',
				map: new Map([['PATH', { variable: 'PATH', value: '/tools:', type: EnvironmentVariableMutatorType.Prepend }]])
			});
			setCollection('local.extension', {
				remoteAuthority: null,
				map: new Map(['Path', 'path'].map(variable => [variable, {
					variable, value: 'value', type: EnvironmentVariableMutatorType.Replace
				}]))
			});
			const remoteManager = store.add(instantiationService.createInstance(TerminalProcessManager, 3,
				URI.from({ scheme: Schemas.vscodeRemote, authority: 'wsl+Ubuntu', path: '/workspace' }), undefined, undefined));
			await remoteManager.createProcess({}, 80, 24, false);
			const variables = serializedVariables(terminalInstanceService.createProcessRequests.at(-1)!.options);
			const beforeUpdate = remoteManager.environmentVariableInfo?.requiresAction;

			const changed = Event.toPromise(environmentVariableService.onDidChangeCollections);
			setCollection('remote.extension', {
				remoteAuthority: 'WSL+UBUNTU',
				map: new Map([['PATH', { variable: 'PATH', value: '/updated:', type: EnvironmentVariableMutatorType.Prepend }]])
			});
			await changed;

			deepStrictEqual({ variables, beforeUpdate, afterUpdate: remoteManager.environmentVariableInfo?.requiresAction }, {
				variables: os === OperatingSystem.Windows ? ['PATH'] : ['PATH', 'Path', 'path'],
				beforeUpdate: false,
				afterUpdate: true
			});
		});
	}

	test('does not accumulate environment variable collection listeners when relaunching', async () => {
		const changeCollectionsEmitter = (environmentVariableService as unknown as { _onDidChangeCollections: Emitter<unknown> })._onDidChangeCollections;
		const initialListenerCount = listenerCount(changeCollectionsEmitter);

		await manager.createProcess({}, 80, 24, false);
		strictEqual(listenerCount(changeCollectionsEmitter), initialListenerCount + 1);

		for (let i = 0; i < 3; i++) {
			await manager.relaunch({}, 80, 24, false);
			strictEqual(listenerCount(changeCollectionsEmitter), initialListenerCount + 1);
		}
	});

	test('relaunch does not report the previous shell pid for the new process before it is ready', async () => {
		await manager.createProcess({}, 80, 24, false);
		terminalInstanceService.createdProcesses[0].fireReady(1001);
		const beforeRelaunch = { id: manager.persistentProcessId, pid: manager.shellProcessId };

		await manager.relaunch({}, 80, 24, false);
		const whileStarting = { id: manager.persistentProcessId, pid: manager.shellProcessId };

		terminalInstanceService.createdProcesses[1].fireReady(2002);
		const afterReady = { id: manager.persistentProcessId, pid: manager.shellProcessId };

		deepStrictEqual({ beforeRelaunch, whileStarting, afterReady }, {
			beforeRelaunch: { id: 1, pid: 1001 },
			whileStarting: { id: 2, pid: undefined },
			afterReady: { id: 2, pid: 2002 }
		});
	});

	suite('process persistence', () => {
		suite('local', () => {
			test('regular terminal should persist', async () => {
				const p = await manager.createProcess({
				}, 1, 1, false);
				strictEqual(p, undefined);
				strictEqual(manager.shouldPersist, true);
			});
			test('task terminal should not persist', async () => {
				const p = await manager.createProcess({
					isFeatureTerminal: true
				}, 1, 1, false);
				strictEqual(p, undefined);
				strictEqual(manager.shouldPersist, false);
			});
			test('restored terminal reattaches with the pid it was saved with', async () => {
				await manager.createProcess({
					attachPersistentProcess: { id: 21, pid: 72265, findRevivedId: true, title: 'zsh', titleSource: TitleEventSource.Process, cwd: '', shellIntegrationNonce: '' }
				}, 1, 1, false);
				deepStrictEqual(terminalInstanceService.revivedAttachArgs, [[21, 72265]]);
			});
			test('restored terminal starts a new process when reattaching is refused', async () => {
				terminalInstanceService.refuseRevivedAttach = true;
				await manager.createProcess({
					attachPersistentProcess: { id: 21, pid: 72265, findRevivedId: true, title: 'zsh', titleSource: TitleEventSource.Process, cwd: '', shellIntegrationNonce: '' }
				}, 1, 1, false);
				deepStrictEqual(
					{ revivedAttachArgs: terminalInstanceService.revivedAttachArgs, persistentProcessId: manager.persistentProcessId },
					{ revivedAttachArgs: [[21, 72265]], persistentProcessId: 1 }
				);
			});
		});
		suite('remote', () => {
			const remoteCwd = URI.from({
				scheme: Schemas.vscodeRemote,
				path: 'test/cwd'
			});

			test('regular terminal should persist', async () => {
				const p = await manager.createProcess({
					cwd: remoteCwd
				}, 1, 1, false);
				strictEqual(p, undefined);
				strictEqual(manager.shouldPersist, true);
			});
			test('task terminal should not persist', async () => {
				const p = await manager.createProcess({
					isFeatureTerminal: true,
					cwd: remoteCwd
				}, 1, 1, false);
				strictEqual(p, undefined);
				strictEqual(manager.shouldPersist, false);
			});
		});
	});

	suite('pty host restart', () => {
		async function fireRestartAndCaptureData(os: OperatingSystem, rows: number): Promise<string> {
			await manager.createProcess({}, 80, rows, false);
			manager.os = os;
			let captured: string | undefined;
			store.add(manager.onProcessData(e => captured = e.data));
			terminalInstanceService.ptyHostRestartEmitter.fire();
			return captured!;
		}

		test('appends viewport-clearing newlines and ESC[H on Windows', async () => {
			const data = await fireRestartAndCaptureData(OperatingSystem.Windows, 24);
			deepStrictEqual(
				{ endsWithViewportClear: data.endsWith('\r\n'.repeat(23) + '\x1b[H') },
				{ endsWithViewportClear: true }
			);
		});

		test('does not append viewport-clearing sequence on non-Windows', async () => {
			const data = await fireRestartAndCaptureData(OperatingSystem.Linux, 24);
			deepStrictEqual(
				{ containsCursorHome: data.includes('\x1b[H') },
				{ containsCursorHome: false }
			);
		});

		test('does not append viewport-clearing sequence on Windows when rows is 0', async () => {
			const data = await fireRestartAndCaptureData(OperatingSystem.Windows, 0);
			deepStrictEqual(
				{ containsCursorHome: data.includes('\x1b[H') },
				{ containsCursorHome: false }
			);
		});
	});

	suite('parent window', () => {
		function windowHandle(low: number, high: number = 0): VSBuffer {
			const handle = VSBuffer.alloc(8);
			handle.writeUInt32LE(low, 0);
			handle.writeUInt32LE(high, 4);
			return handle;
		}

		function sent(windowId: number): string {
			return `setParentWindow ${encodeHex(windowHandle(windowId))}`;
		}

		async function setReparentConsoleWindow(enabled: boolean): Promise<void> {
			const configurationService = instantiationService.get(IConfigurationService) as TestConfigurationService;
			const terminalConfig = configurationService.getValue<{ integrated?: object } | undefined>('terminal');
			await configurationService.setUserConfiguration('terminal', { integrated: { ...terminalConfig?.integrated, windowsReparentConsoleWindow: enabled } });
			configurationService.onDidChangeConfigurationEmitter.fire({
				affectsConfiguration: () => true,
			} satisfies Partial<IConfigurationChangeEvent> as unknown as IConfigurationChangeEvent);
		}

		setup(async () => {
			await setReparentConsoleWindow(true);
			instantiationService.stub(IHostService, 'getNativeWindowHandle', async (windowId: number) => windowHandle(windowId));
		});

		test('sets the parent window before the process starts', async () => {
			await manager.setParentWindow(4);
			await manager.createProcess({}, 80, 24, false);
			deepStrictEqual(terminalInstanceService.createdProcesses.map(p => p.calls), [isWindows ? [sent(4), 'start'] : ['start']]);
		});

		test('updates the parent window only when the terminal moves to another window', async () => {
			await manager.setParentWindow(4);
			await manager.createProcess({}, 80, 24, false);
			await manager.setParentWindow(4);
			await manager.setParentWindow(5);
			deepStrictEqual(terminalInstanceService.createdProcesses.map(p => p.calls), [isWindows ? [sent(4), 'start', sent(5)] : ['start']]);
		});

		test('waits for the latest window before starting when the terminal moves during startup', async () => {
			const lookups = new Map<number, DeferredPromise<VSBuffer>>();
			instantiationService.stub(IHostService, 'getNativeWindowHandle', (windowId: number) => {
				let lookup = lookups.get(windowId);
				if (!lookup) {
					lookup = new DeferredPromise<VSBuffer>();
					lookups.set(windowId, lookup);
				}
				return lookup.p;
			});
			manager.setParentWindow(4);
			manager.setParentWindow(5);
			const created = manager.createProcess({}, 80, 24, false);
			await lookups.get(4)?.complete(windowHandle(4));
			await timeout(0);
			ok(!isWindows || terminalInstanceService.createdProcesses.every(p => !p.calls.includes('start')), 'must not start before the latest window handle is known');
			await lookups.get(5)?.complete(windowHandle(5));
			await created;
			deepStrictEqual(terminalInstanceService.createdProcesses.map(p => p.calls), [isWindows ? [sent(5), 'start'] : ['start']]);
		});

		test('passes all bytes of the window handle through unchanged', async () => {
			instantiationService.stub(IHostService, 'getNativeWindowHandle', async () => windowHandle(0x80001234, 0x00000001));
			await manager.setParentWindow(4);
			await manager.createProcess({}, 80, 24, false);
			deepStrictEqual(terminalInstanceService.createdProcesses.map(p => p.calls), [isWindows ? ['setParentWindow 3412008001000000', 'start'] : ['start']]);
		});

		test('does nothing when the setting is disabled', async () => {
			await setReparentConsoleWindow(false);
			await manager.setParentWindow(4);
			await manager.createProcess({}, 80, 24, false);
			deepStrictEqual(terminalInstanceService.createdProcesses.map(p => p.calls), [['start']]);
		});

		test('does not set the parent window of a process relaunched after the setting is disabled', async () => {
			await manager.setParentWindow(4);
			await manager.createProcess({}, 80, 24, false);
			await setReparentConsoleWindow(false);
			await manager.relaunch({}, 80, 24, false);
			deepStrictEqual(terminalInstanceService.createdProcesses.map(p => p.calls), [isWindows ? [sent(4), 'start'] : ['start'], ['start']]);
		});

		test('sets the parent window of a process relaunched after the setting is enabled', async () => {
			await setReparentConsoleWindow(false);
			await manager.setParentWindow(4);
			await manager.createProcess({}, 80, 24, false);
			await setReparentConsoleWindow(true);
			await manager.relaunch({}, 80, 24, false);
			deepStrictEqual(terminalInstanceService.createdProcesses.map(p => p.calls), [['start'], isWindows ? [sent(4), 'start'] : ['start']]);
		});

		test('uses the window the terminal moved to while the setting was disabled', async () => {
			await manager.setParentWindow(4);
			await manager.createProcess({}, 80, 24, false);
			await setReparentConsoleWindow(false);
			await manager.setParentWindow(5);
			await setReparentConsoleWindow(true);
			await manager.relaunch({}, 80, 24, false);
			deepStrictEqual(terminalInstanceService.createdProcesses.map(p => p.calls), isWindows ? [[sent(4), 'start'], [sent(5), 'start']] : [['start'], ['start']]);
		});

		test('does not send the previous window\'s handle when the new window\'s handle is not found', async () => {
			instantiationService.stub(IHostService, 'getNativeWindowHandle', async (windowId: number) => windowId === 5 ? undefined : windowHandle(windowId));
			await manager.setParentWindow(4);
			await manager.createProcess({}, 80, 24, false);
			await manager.setParentWindow(5);
			await manager.relaunch({}, 80, 24, false);
			deepStrictEqual(terminalInstanceService.createdProcesses.map(p => p.calls), [isWindows ? [sent(4), 'start'] : ['start'], ['start']]);
		});
	});
});
