/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../base/common/event.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { IChannel, IChannelClient } from '../../../base/parts/ipc/common/ipc.js';
import { IAgentHostConnection, IAgentHostStarter } from '../../../platform/agentHost/common/agent.js';
import { AgentHostIpcChannels } from '../../../platform/agentHost/common/agentService.js';
import { NullLogService, NullLoggerService } from '../../../platform/log/common/log.js';
import { NullTelemetryServiceShape } from '../../../platform/telemetry/common/telemetryUtils.js';
import { ServerAgentHostManager } from '../../node/serverAgentHostManager.js';
import { IServerLifetimeService } from '../../node/serverLifetimeService.js';

// ---- Mock helpers -----------------------------------------------------------

class MockChannel implements IChannel {
	private readonly _listeners = new Map<string, Emitter<unknown>>();
	private readonly _callResults = new Map<string, unknown>();

	getEmitter(event: string): Emitter<unknown> {
		let emitter = this._listeners.get(event);
		if (!emitter) {
			emitter = new Emitter<unknown>();
			this._listeners.set(event, emitter);
		}
		return emitter;
	}

	setCallResult(command: string, value: unknown): void {
		this._callResults.set(command, value);
	}

	call<T>(command: string, _arg?: unknown): Promise<T> {
		return Promise.resolve((this._callResults.get(command) ?? undefined) as T);
	}

	listen<T>(event: string, _arg?: unknown): Event<T> {
		return this.getEmitter(event).event as Event<T>;
	}

	dispose(): void {
		for (const emitter of this._listeners.values()) {
			emitter.dispose();
		}
		this._listeners.clear();
	}
}

class MockAgentHostStarter implements IAgentHostStarter {
	private readonly _onDidProcessExit = new Emitter<{ code: number; signal: string }>();
	private _startError: Error | undefined;

	readonly agentHostChannel = new MockChannel();
	readonly loggerChannel: MockChannel;
	readonly connectionTrackerChannel = new MockChannel();

	constructor() {
		this.loggerChannel = new MockChannel();
		this.loggerChannel.setCallResult('getRegisteredLoggers', []);
	}

	async start(): Promise<IAgentHostConnection> {
		if (this._startError) {
			const error = this._startError;
			this._startError = undefined;
			throw error;
		}

		const store = new DisposableStore();
		const client: IChannelClient = {
			getChannel: <T extends IChannel>(name: string): T => {
				switch (name) {
					case AgentHostIpcChannels.AgentHost:
						return this.agentHostChannel as unknown as T;
					case AgentHostIpcChannels.Logger:
						return this.loggerChannel as unknown as T;
					case AgentHostIpcChannels.ConnectionTracker:
						return this.connectionTrackerChannel as unknown as T;
					default:
						throw new Error(`Unknown channel: ${name}`);
				}
			},
		};
		return {
			client,
			store,
			onDidProcessExit: this._onDidProcessExit.event,
		};
	}

	fireProcessExit(code: number): void {
		this._onDidProcessExit.fire({ code, signal: '' });
	}

	failNextStart(error: Error): void {
		this._startError = error;
	}

	dispose(): void {
		this._onDidProcessExit.dispose();
		this.agentHostChannel.dispose();
		this.loggerChannel.dispose();
		this.connectionTrackerChannel.dispose();
	}
}

class MockServerLifetimeService implements IServerLifetimeService {
	declare readonly _serviceBrand: undefined;

	private _activeCount = 0;

	get hasActiveConsumers(): boolean {
		return this._activeCount > 0;
	}

	active(_consumer: string): IDisposable {
		this._activeCount++;
		return toDisposable(() => { this._activeCount--; });
	}

	delay(): void { }
}

class TestTelemetryService extends NullTelemetryServiceShape {
	readonly errorEvents: { eventName: string; data: unknown }[] = [];

	override publicLogError2(eventName?: string, data?: unknown): void {
		if (eventName) {
			this.errorEvents.push({ eventName, data });
		}
	}
}

suite('ServerAgentHostManager', () => {
	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	let starter: MockAgentHostStarter;
	let lifetimeService: MockServerLifetimeService;
	let telemetryService: TestTelemetryService;

	setup(() => {
		starter = new MockAgentHostStarter();
		lifetimeService = new MockServerLifetimeService();
		telemetryService = new TestTelemetryService();
	});

	function createManager(): ServerAgentHostManager {
		return ds.add(new ServerAgentHostManager(
			starter,
			new NullLogService(),
			ds.add(new NullLoggerService()),
			lifetimeService,
			telemetryService,
		));
	}

	// `ServerAgentHostManager._start()` is async (awaits `starter.start()`).
	// Wait a microtask so the channel listeners are wired up before tests fire events.
	async function waitForStart(): Promise<void> {
		await Promise.resolve();
	}

	function fireActiveSessions(count: number): void {
		starter.agentHostChannel.getEmitter('onDidAction').fire({
			action: { type: 'root/activeSessionsChanged', activeSessions: count },
			serverSeq: 1,
			origin: undefined,
		});
	}

	function fireConnectionCount(count: number): void {
		starter.connectionTrackerChannel.getEmitter('onDidChangeConnectionCount').fire(count);
	}

	test('no lifetime token initially', async () => {
		createManager();
		await waitForStart();
		assert.strictEqual(lifetimeService.hasActiveConsumers, false);
	});

	test('acquires token when sessions become active', async () => {
		createManager();
		await waitForStart();
		fireActiveSessions(1);
		assert.strictEqual(lifetimeService.hasActiveConsumers, true);
	});

	test('acquires token when standalone WebSocket clients connect', async () => {
		createManager();
		await waitForStart();
		fireConnectionCount(2);
		assert.strictEqual(lifetimeService.hasActiveConsumers, true);
	});

	test('releases token only when both sessions and standalone WebSocket connections are zero', async () => {
		createManager();
		await waitForStart();

		fireActiveSessions(1);
		assert.strictEqual(lifetimeService.hasActiveConsumers, true);

		fireConnectionCount(1);
		assert.strictEqual(lifetimeService.hasActiveConsumers, true);

		fireActiveSessions(0);
		assert.strictEqual(lifetimeService.hasActiveConsumers, true);

		fireConnectionCount(0);
		assert.strictEqual(lifetimeService.hasActiveConsumers, false);
	});

	test('process exit resets both signals and clears token', async () => {
		createManager();
		await waitForStart();
		fireActiveSessions(2);
		fireConnectionCount(1);
		assert.strictEqual(lifetimeService.hasActiveConsumers, true);

		starter.fireProcessExit(1);
		assert.strictEqual(lifetimeService.hasActiveConsumers, false);
	});

	test('reports unexpected process exit', async () => {
		createManager();
		await waitForStart();

		starter.fireProcessExit(17);

		assert.deepStrictEqual(telemetryService.errorEvents, [{
			eventName: 'agentHost.processError',
			data: {
				kind: 'unexpectedExit',
				code: 17,
				restartCount: 0,
				willRestart: true,
				isError: true,
			},
		}]);
	});

	test('reports process start failure', async () => {
		const error = new Error('test start failure');
		error.stack = 'test start failure stack';
		starter.failNextStart(error);
		createManager();
		await waitForStart();
		await waitForStart();

		assert.deepStrictEqual(telemetryService.errorEvents, [{
			eventName: 'agentHost.processError',
			data: {
				kind: 'startFailed',
				restartCount: 0,
				willRestart: true,
				isError: true,
				callstack: 'test start failure stack',
				msg: 'test start failure',
			},
		}]);
	});
});
