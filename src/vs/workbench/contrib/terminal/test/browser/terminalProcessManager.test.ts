/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, strictEqual } from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Schemas } from '../../../../../base/common/network.js';
import { OperatingSystem } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService, type IConfigurationChangeEvent } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IRemoteAgentEnvironment } from '../../../../../platform/remote/common/remoteAgentEnvironment.js';
import { ITerminalChildProcess, type IPtyHostAttachTarget, type ITerminalBackend } from '../../../../../platform/terminal/common/terminal.js';
import { ITerminalInstanceService, ITerminalService } from '../../browser/terminal.js';
import { TerminalProcessManager } from '../../browser/terminalProcessManager.js';
import { IEnvironmentVariableService } from '../../common/environmentVariable.js';
import { IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';

function listenerCount(emitter: Emitter<unknown>): number {
	return (emitter as unknown as { _size: number })._size ?? 0;
}

class TestTerminalChildProcess implements ITerminalChildProcess {
	id: number = 0;
	get capabilities() { return []; }
	constructor(
		readonly shouldPersist: boolean,
		private readonly _calls: string[] = []
	) {
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
	onProcessReady = Event.None;
	onProcessTitleChanged = Event.None;
	onProcessShellTypeChanged = Event.None;
	async start(): Promise<undefined> { this._calls.push('start'); return undefined; }
	shutdown(immediate: boolean): void { }
	input(data: string): void { }
	sendSignal(signal: string): void { }
	resize(cols: number, rows: number): void { this._calls.push(`resize ${cols}x${rows}`); }
	clearBuffer(): void { }
	acknowledgeDataEvent(charCount: number): void { }
	async setUnicodeVersion(version: '6' | '11'): Promise<void> { }
	async getInitialCwd(): Promise<string> { return ''; }
	async getCwd(): Promise<string> { return ''; }
	async processBinary(data: string): Promise<void> { }
	refreshProperty(property: any): Promise<any> { return Promise.resolve(''); }
}

class TestTerminalInstanceService implements Partial<ITerminalInstanceService> {
	readonly ptyHostRestartEmitter = new Emitter<void>();
	readonly processCalls: string[] = [];
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
				env: any,
				options: any,
				shouldPersist: boolean
			) => new TestTerminalChildProcess(shouldPersist, this.processCalls),
			attachToProcess: async (id: number) => new TestTerminalChildProcess(true, this.processCalls),
			getLatency: () => Promise.resolve([]),
			getShellEnvironment: () => Promise.resolve({})
		} as unknown as ITerminalBackend;
	}
}

suite('Workbench - TerminalProcessManager', () => {
	let instantiationService: TestInstantiationService;
	let manager: TerminalProcessManager;
	let terminalInstanceService: TestTerminalInstanceService;
	let environmentVariableService: IEnvironmentVariableService;

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

	suite('attach', () => {
		const attachPersistentProcess = upcastPartial<IPtyHostAttachTarget>({ id: 1 });

		test('resizes an attached process to the terminal size before starting it', async () => {
			await manager.createProcess({ attachPersistentProcess }, 78, 12);
			deepStrictEqual(terminalInstanceService.processCalls, ['resize 78x12', 'start']);
		});

		test('does not resize a launched process before starting it', async () => {
			await manager.createProcess({}, 78, 12);
			deepStrictEqual(terminalInstanceService.processCalls, ['start']);
		});

		test('does not resize an attached remote process before starting it', async () => {
			instantiationService.stub(IRemoteAgentService, 'getEnvironment', async () => upcastPartial<IRemoteAgentEnvironment>({ userHome: URI.file('/home/test'), os: OperatingSystem.Linux }));
			const remoteCwd = URI.from({ scheme: Schemas.vscodeRemote, authority: 'test', path: '/cwd' });
			const remoteManager = store.add(instantiationService.createInstance(TerminalProcessManager, 2, remoteCwd, undefined, undefined));
			await remoteManager.createProcess({ attachPersistentProcess }, 78, 12);
			deepStrictEqual(terminalInstanceService.processCalls, ['start']);
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
});
