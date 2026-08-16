/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { IChannel, IChannelClient } from '../../../../base/parts/ipc/common/ipc.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService, NullLoggerService } from '../../../log/common/log.js';
import { NullTelemetryServiceShape } from '../../../telemetry/common/telemetryUtils.js';
import { IAgentHostConnection, IAgentHostShutdownRequest, IAgentHostStarter, IAgentHostStartRequest } from '../../common/agent.js';
import { AgentHostProcessManager } from '../../node/agentHostService.js';

class TestChannel implements IChannel {
	call<T>(_command: string, _arg?: unknown): Promise<T> {
		return Promise.resolve([] as T);
	}

	listen<T>(_event: string, _arg?: unknown): Event<T> {
		return Event.None;
	}
}

class TestAgentHostStarter implements IAgentHostStarter {
	private readonly _onRequestConnection = new Emitter<IAgentHostStartRequest>();
	readonly onRequestConnection = this._onRequestConnection.event;
	private readonly _onRequestRestart = new Emitter<void>();
	readonly onRequestRestart = this._onRequestRestart.event;
	private readonly _onWillShutdown = new Emitter<IAgentHostShutdownRequest>();
	readonly onWillShutdown = this._onWillShutdown.event;
	private readonly _onDidStart = new Emitter<number>();

	private readonly _exitEmitters: Emitter<{ code: number; signal: string }>[] = [];
	private readonly _channel = new TestChannel();
	readonly connectionStores: DisposableStore[] = [];
	startCount = 0;
	shutdownCount = 0;
	isDisposed = false;
	private _startError: Error | undefined;
	private _startBarrier: DeferredPromise<void> | undefined;
	private _shutdownBarrier: DeferredPromise<void> | undefined;

	async start(): Promise<IAgentHostConnection> {
		this.startCount++;
		this._onDidStart.fire(this.startCount);
		const startBarrier = this._startBarrier;
		if (startBarrier) {
			await startBarrier.p;
			if (this._startBarrier === startBarrier) {
				this._startBarrier = undefined;
			}
		}
		if (this._startError) {
			const error = this._startError;
			this._startError = undefined;
			throw error;
		}
		const exitEmitter = new Emitter<{ code: number; signal: string }>();
		this._exitEmitters.push(exitEmitter);
		const store = new DisposableStore();
		store.add(exitEmitter);
		this.connectionStores.push(store);
		const client: IChannelClient = {
			getChannel: <T extends IChannel>(): T => this._channel as T,
		};
		return {
			client,
			store,
			onDidProcessExit: exitEmitter.event,
			shutdown: async () => {
				this.shutdownCount++;
				await this._shutdownBarrier?.p;
			},
		};
	}

	requestConnection(): Promise<void> {
		let startPromise: Promise<void> | undefined;
		this._onRequestConnection.fire({
			waitUntil: promise => startPromise = promise,
		});
		if (!startPromise) {
			throw new Error('Start request was not handled.');
		}
		return startPromise;
	}

	requestRestart(): void {
		this._onRequestRestart.fire();
	}

	async waitForStartCount(startCount: number): Promise<void> {
		if (this.startCount >= startCount) {
			return;
		}
		await Event.toPromise(Event.filter(this._onDidStart.event, count => count >= startCount));
	}

	fireProcessExit(code: number): void {
		this._exitEmitters.at(-1)?.fire({ code, signal: 'unknown' });
	}

	failNextStart(error: Error): void {
		this._startError = error;
	}

	blockNextStart(): DeferredPromise<void> {
		this._startBarrier = new DeferredPromise<void>();
		return this._startBarrier;
	}

	blockShutdown(): DeferredPromise<void> {
		this._shutdownBarrier = new DeferredPromise<void>();
		return this._shutdownBarrier;
	}

	requestShutdown(): Promise<void> {
		let shutdownPromise: Promise<void> | undefined;
		this._onWillShutdown.fire({
			join: promise => shutdownPromise = promise,
		});
		if (!shutdownPromise) {
			throw new Error('Shutdown request was not handled.');
		}
		return shutdownPromise;
	}

	dispose(): void {
		this.isDisposed = true;
		this._onRequestConnection.dispose();
		this._onRequestRestart.dispose();
		this._onDidStart.dispose();
		this._onWillShutdown.dispose();
		for (const store of this.connectionStores) {
			store.dispose();
		}
	}
}

class TestTelemetryService extends NullTelemetryServiceShape {
	readonly errorEvents: { eventName: string; data: unknown }[] = [];

	override publicLogError2(eventName?: string, data?: unknown): void {
		if (eventName) {
			this.errorEvents.push({ eventName, data });
		}
	}
}

suite('AgentHostProcessManager', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	async function createManager(platform: NodeJS.Platform = 'linux'): Promise<{
		manager: AgentHostProcessManager;
		starter: TestAgentHostStarter;
		telemetryService: TestTelemetryService;
	}> {
		const starter = new TestAgentHostStarter();
		const telemetryService = new TestTelemetryService();
		const manager = disposables.add(new AgentHostProcessManager(
			starter,
			platform,
			new NullLogService(),
			disposables.add(new NullLoggerService()),
			telemetryService,
		));
		await starter.requestConnection();
		return { manager, starter, telemetryService };
	}

	for (const [name, code] of [
		['STATUS_DLL_INIT_FAILED_LOGOFF', 0xC000026B],
		['DBG_TERMINATE_PROCESS', 0x40010004],
	] as const) {
		test(`does not automatically restart or report ${name}, but allows explicit recovery`, async () => {
			const { manager, starter, telemetryService } = await createManager('win32');

			starter.fireProcessExit(code);
			await Promise.resolve();
			const startCountAfterExit = starter.startCount;
			await manager.restart();

			assert.deepStrictEqual({
				startCountAfterExit,
				startCountAfterRestart: starter.startCount,
				connectionDisposed: starter.connectionStores[0].isDisposed,
				errorEvents: telemetryService.errorEvents,
			}, {
				startCountAfterExit: 1,
				startCountAfterRestart: 2,
				connectionDisposed: true,
				errorEvents: [],
			});
		});
	}

	test('restarts and reports the same exit code on non-Windows platforms', async () => {
		const { starter, telemetryService } = await createManager('linux');

		starter.fireProcessExit(0xC000026B);
		await starter.waitForStartCount(2);

		assert.deepStrictEqual({
			startCount: starter.startCount,
			errorEvents: telemetryService.errorEvents,
		}, {
			startCount: 2,
			errorEvents: [{
				eventName: 'agentHost.processError',
				data: {
					hostLaunchKind: 'vscode_main_process',
					kind: 'unexpectedExit',
					code: 0xC000026B,
					restartCount: 0,
					willRestart: true,
					isError: true,
				},
			}],
		});
	});

	test('explicit restart disposes the current process and resets crash recovery', async () => {
		const { manager, starter, telemetryService } = await createManager();

		starter.fireProcessExit(17);
		await starter.waitForStartCount(2);
		await manager.restart();
		starter.fireProcessExit(18);
		await starter.waitForStartCount(4);

		assert.deepStrictEqual({
			startCount: starter.startCount,
			shutdownCount: starter.shutdownCount,
			connectionStoresDisposed: starter.connectionStores.map(store => store.isDisposed),
			errorEvents: telemetryService.errorEvents,
		}, {
			startCount: 4,
			shutdownCount: 1,
			connectionStoresDisposed: [true, true, true, false],
			errorEvents: [
				{ eventName: 'agentHost.processError', data: { hostLaunchKind: 'vscode_main_process', kind: 'unexpectedExit', code: 17, restartCount: 0, willRestart: true, isError: true } },
				{ eventName: 'agentHost.processError', data: { hostLaunchKind: 'vscode_main_process', kind: 'unexpectedExit', code: 18, restartCount: 0, willRestart: true, isError: true } },
			],
		});
	});

	test('handles restart requests from the starter', async () => {
		const { starter, telemetryService } = await createManager();

		starter.requestRestart();
		await starter.waitForStartCount(2);

		assert.deepStrictEqual({
			startCount: starter.startCount,
			shutdownCount: starter.shutdownCount,
			connectionStoresDisposed: starter.connectionStores.map(store => store.isDisposed),
			errorEvents: telemetryService.errorEvents,
		}, {
			startCount: 2,
			shutdownCount: 1,
			connectionStoresDisposed: [true, false],
			errorEvents: [],
		});
	});

	test('rejects lifecycle work after disposal', async () => {
		const { manager } = await createManager();
		manager.dispose();

		await assert.rejects(manager.restart(), /shutting down/);
	});

	test('stops after the configured number of restarts', async () => {
		const { starter, telemetryService } = await createManager();

		for (let restartCount = 0; restartCount <= 5; restartCount++) {
			starter.fireProcessExit(17);
			if (restartCount < 5) {
				await starter.waitForStartCount(restartCount + 2);
			}
		}
		await assert.rejects(starter.requestConnection(), /stopped after 5 restarts/);

		assert.deepStrictEqual({
			startCount: starter.startCount,
			errorEvents: telemetryService.errorEvents,
		}, {
			startCount: 6,
			errorEvents: [
				{ eventName: 'agentHost.processError', data: { hostLaunchKind: 'vscode_main_process', kind: 'unexpectedExit', code: 17, restartCount: 0, willRestart: true, isError: true } },
				{ eventName: 'agentHost.processError', data: { hostLaunchKind: 'vscode_main_process', kind: 'unexpectedExit', code: 17, restartCount: 1, willRestart: true, isError: true } },
				{ eventName: 'agentHost.processError', data: { hostLaunchKind: 'vscode_main_process', kind: 'unexpectedExit', code: 17, restartCount: 2, willRestart: true, isError: true } },
				{ eventName: 'agentHost.processError', data: { hostLaunchKind: 'vscode_main_process', kind: 'unexpectedExit', code: 17, restartCount: 3, willRestart: true, isError: true } },
				{ eventName: 'agentHost.processError', data: { hostLaunchKind: 'vscode_main_process', kind: 'unexpectedExit', code: 17, restartCount: 4, willRestart: true, isError: true } },
				{ eventName: 'agentHost.processError', data: { hostLaunchKind: 'vscode_main_process', kind: 'unexpectedExit', code: 17, restartCount: 5, willRestart: false, isError: true } },
			],
		});
	});

	test('retries a failed start on the next connection request', async () => {
		const starter = new TestAgentHostStarter();
		const telemetryService = new TestTelemetryService();
		disposables.add(new AgentHostProcessManager(
			starter,
			'linux',
			new NullLogService(),
			disposables.add(new NullLoggerService()),
			telemetryService,
		));
		starter.failNextStart(new Error('failed'));

		await assert.rejects(starter.requestConnection(), /failed/);
		await starter.requestConnection();

		assert.deepStrictEqual({
			startCount: starter.startCount,
			errorEvents: telemetryService.errorEvents.length,
		}, {
			startCount: 2,
			errorEvents: 1,
		});
	});

	test('shares an in-flight start across connection requests', async () => {
		const starter = new TestAgentHostStarter();
		const barrier = starter.blockNextStart();
		disposables.add(new AgentHostProcessManager(
			starter,
			'linux',
			new NullLogService(),
			disposables.add(new NullLoggerService()),
			new TestTelemetryService(),
		));

		const firstRequest = starter.requestConnection();
		const secondRequest = starter.requestConnection();
		await Promise.resolve();
		const startCountWhileBlocked = starter.startCount;
		barrier.complete();
		await Promise.all([firstRequest, secondRequest]);

		assert.deepStrictEqual({
			startCountWhileBlocked,
			finalStartCount: starter.startCount,
		}, {
			startCountWhileBlocked: 1,
			finalStartCount: 1,
		});
	});

	test('serializes an explicit restart after an in-flight start', async () => {
		const starter = new TestAgentHostStarter();
		const barrier = starter.blockNextStart();
		const manager = disposables.add(new AgentHostProcessManager(
			starter,
			'linux',
			new NullLogService(),
			disposables.add(new NullLoggerService()),
			new TestTelemetryService(),
		));

		const initialStart = starter.requestConnection();
		const restart = manager.restart();
		await Promise.resolve();
		const startCountWhileBlocked = starter.startCount;
		barrier.complete();
		await Promise.all([initialStart, restart]);

		assert.deepStrictEqual({
			startCountWhileBlocked,
			finalStartCount: starter.startCount,
			connectionStoresDisposed: starter.connectionStores.map(store => store.isDisposed),
		}, {
			startCountWhileBlocked: 1,
			finalStartCount: 2,
			connectionStoresDisposed: [true, false],
		});
	});

	test('connection requests wait while explicit restart drains the old process', async () => {
		const { manager, starter } = await createManager();
		const shutdownBarrier = starter.blockShutdown();

		const restart = manager.restart();
		const connectionRequest = starter.requestConnection();
		let connectionResolved = false;
		void connectionRequest.then(() => connectionResolved = true);
		await Promise.resolve();
		const startCountWhileDraining = starter.startCount;
		const connectionResolvedWhileDraining = connectionResolved;
		shutdownBarrier.complete();
		await Promise.all([restart, connectionRequest]);

		assert.deepStrictEqual({
			startCountWhileDraining,
			connectionResolvedWhileDraining,
			finalStartCount: starter.startCount,
		}, {
			startCountWhileDraining: 1,
			connectionResolvedWhileDraining: false,
			finalStartCount: 2,
		});
	});

	test('joins graceful shutdown and disposes the connection', async () => {
		const { starter } = await createManager();

		await starter.requestShutdown();

		assert.deepStrictEqual({
			shutdownCount: starter.shutdownCount,
			connectionDisposed: starter.connectionStores[0].isDisposed,
		}, {
			shutdownCount: 1,
			connectionDisposed: true,
		});
	});

	test('bounds graceful shutdown before disposing the connection', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { starter } = await createManager();
		starter.blockShutdown();

		await starter.requestShutdown();

		assert.deepStrictEqual({
			shutdownCount: starter.shutdownCount,
			connectionDisposed: starter.connectionStores[0].isDisposed,
		}, {
			shutdownCount: 1,
			connectionDisposed: true,
		});
	}));

	test('bounds shutdown while startup is still pending', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const starter = new TestAgentHostStarter();
		starter.blockNextStart();
		disposables.add(new AgentHostProcessManager(
			starter,
			'linux',
			new NullLogService(),
			disposables.add(new NullLoggerService()),
			new TestTelemetryService(),
		));
		void starter.requestConnection().catch(() => { });

		await starter.requestShutdown();

		assert.deepStrictEqual({
			startCount: starter.startCount,
			shutdownCount: starter.shutdownCount,
			connectionCount: starter.connectionStores.length,
			starterDisposed: starter.isDisposed,
		}, {
			startCount: 1,
			shutdownCount: 0,
			connectionCount: 0,
			starterDisposed: true,
		});
	}));
});
