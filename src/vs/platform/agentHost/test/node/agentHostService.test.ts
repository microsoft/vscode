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

	private readonly _exitEmitters: Emitter<{ code: number; signal: string }>[] = [];
	private readonly _channel = new TestChannel();
	readonly connectionStores: DisposableStore[] = [];
	startCount = 0;

	async start(): Promise<IAgentHostConnection> {
		this.startCount++;
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

	fireProcessExit(code: number): void {
		this._exitEmitters.at(-1)?.fire({ code, signal: 'unknown' });
	}

	dispose(): void {
		this._onRequestConnection.dispose();
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
		starter: TestAgentHostStarter;
		telemetryService: TestTelemetryService;
	}> {
		const starter = new TestAgentHostStarter();
		const telemetryService = new TestTelemetryService();
		disposables.add(new AgentHostProcessManager(
			starter,
			platform,
			new NullLogService(),
			disposables.add(new NullLoggerService()),
			telemetryService,
		));
		starter.requestConnection();
		await Promise.resolve();
		return { starter, telemetryService };
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
		await Promise.resolve();

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

	test('stops after the configured number of restarts', async () => {
		const { starter, telemetryService } = await createManager();

		for (let restartCount = 0; restartCount <= 5; restartCount++) {
			starter.fireProcessExit(17);
			await Promise.resolve();
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
