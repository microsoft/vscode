/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { IChannel, IChannelClient } from '../../../../base/parts/ipc/common/ipc.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService, NullLoggerService } from '../../../log/common/log.js';
import { NullTelemetryServiceShape } from '../../../telemetry/common/telemetryUtils.js';
import { IAgentHostConnection, IAgentHostStarter } from '../../common/agent.js';
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
	private readonly _onRequestConnection = new Emitter<void>();
	readonly onRequestConnection = this._onRequestConnection.event;
	private readonly _onRequestRestart = new Emitter<void>();
	readonly onRequestRestart = this._onRequestRestart.event;
	private readonly _onDidStart = new Emitter<number>();

	private readonly _exitEmitters: Emitter<{ code: number; signal: string }>[] = [];
	private readonly _channel = new TestChannel();
	readonly connectionStores: DisposableStore[] = [];
	startCount = 0;

	async start(): Promise<IAgentHostConnection> {
		this.startCount++;
		this._onDidStart.fire(this.startCount);
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
		};
	}

	requestConnection(): void {
		this._onRequestConnection.fire();
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

	dispose(): void {
		this._onRequestConnection.dispose();
		this._onRequestRestart.dispose();
		this._onDidStart.dispose();
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
		starter.requestConnection();
		await starter.waitForStartCount(1);
		return { manager, starter, telemetryService };
	}

	for (const [name, code] of [
		['STATUS_DLL_INIT_FAILED_LOGOFF', 0xC000026B],
		['DBG_TERMINATE_PROCESS', 0x40010004],
	] as const) {
		test(`does not restart or report ${name} during Windows shutdown`, async () => {
			const { starter, telemetryService } = await createManager('win32');

			starter.fireProcessExit(code);
			await Promise.resolve();

			assert.deepStrictEqual({
				startCount: starter.startCount,
				connectionDisposed: starter.connectionStores[0].isDisposed,
				errorEvents: telemetryService.errorEvents,
			}, {
				startCount: 1,
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
			connectionStoresDisposed: starter.connectionStores.map(store => store.isDisposed),
			errorEvents: telemetryService.errorEvents,
		}, {
			startCount: 4,
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
			connectionStoresDisposed: starter.connectionStores.map(store => store.isDisposed),
			errorEvents: telemetryService.errorEvents,
		}, {
			startCount: 2,
			connectionStoresDisposed: [true, false],
			errorEvents: [],
		});
	});

	test('rejects lifecycle work after disposal', async () => {
		const { manager } = await createManager();
		manager.dispose();

		assert.throws(() => manager.restart(), /Object has been disposed/);
	});

	test('stops after the configured number of restarts', async () => {
		const { starter, telemetryService } = await createManager();

		for (let restartCount = 0; restartCount <= 5; restartCount++) {
			starter.fireProcessExit(17);
			if (restartCount < 5) {
				await starter.waitForStartCount(restartCount + 2);
			}
		}

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
});
