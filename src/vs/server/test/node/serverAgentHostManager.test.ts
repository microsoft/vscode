/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../base/common/async.js';
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
	startCount = 0;
	readonly connectionStores: DisposableStore[] = [];

	readonly agentHostChannel = new MockChannel();
	readonly loggerChannel: MockChannel;
	readonly connectionTrackerChannel = new MockChannel();

	constructor() {
		this.loggerChannel = new MockChannel();
		this.loggerChannel.setCallResult('getRegisteredLoggers', []);
	}

	async start(): Promise<IAgentHostConnection> {
		this.startCount++;
		if (this._startError) {
			const error = this._startError;
			this._startError = undefined;
			throw error;
		}

		const store = new DisposableStore();
		this.connectionStores.push(store);
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

	function createManager(options = {}): ServerAgentHostManager {
		return ds.add(new ServerAgentHostManager(
			starter,
			options,
			new NullLogService(),
			ds.add(new NullLoggerService()),
			lifetimeService,
			telemetryService,
		));
	}

	// `ServerAgentHostManager` reports startup complete only once the agent host
	// confirms its configured WebSocket listener is bound, so wait for the real
	// signal rather than a fixed number of microtasks.
	async function waitForStart(manager: ServerAgentHostManager): Promise<void> {
		await manager.ensureStarted();
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
		const manager = createManager();
		await waitForStart(manager);
		assert.strictEqual(lifetimeService.hasActiveConsumers, false);
	});

	test('acquires token when sessions become active', async () => {
		const manager = createManager();
		await waitForStart(manager);
		fireActiveSessions(1);
		assert.strictEqual(lifetimeService.hasActiveConsumers, true);
	});

	test('acquires token when standalone WebSocket clients connect', async () => {
		const manager = createManager();
		await waitForStart(manager);
		fireConnectionCount(2);
		assert.strictEqual(lifetimeService.hasActiveConsumers, true);
	});

	test('releases token only when both sessions and standalone WebSocket connections are zero', async () => {
		const manager = createManager();
		await waitForStart(manager);

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
		const manager = createManager();
		await waitForStart(manager);
		fireActiveSessions(2);
		fireConnectionCount(1);
		assert.strictEqual(lifetimeService.hasActiveConsumers, true);

		starter.fireProcessExit(1);
		assert.strictEqual(lifetimeService.hasActiveConsumers, false);
	});

	test('reports unexpected process exit', async () => {
		const manager = createManager();
		await waitForStart(manager);

		starter.fireProcessExit(17);

		assert.deepStrictEqual(telemetryService.errorEvents, [{
			eventName: 'agentHost.processError',
			data: {
				hostLaunchKind: 'vscode_cli',
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
		const manager = createManager();
		await waitForStart(manager);

		assert.deepStrictEqual(telemetryService.errorEvents, [{
			eventName: 'agentHost.processError',
			data: {
				hostLaunchKind: 'vscode_cli',
				kind: 'startFailed',
				restartCount: 0,
				willRestart: true,
				isError: true,
				callstack: 'test start failure stack',
				msg: 'test start failure',
			},
		}]);
	});

	test('starts eagerly by default', async () => {
		const manager = createManager();

		await manager.ensureStarted();
		assert.strictEqual(starter.startCount, 1);
	});

	test('does not start lazily until requested', async () => {
		const manager = createManager({ startMode: 'lazy' });

		assert.strictEqual(starter.startCount, 0);
		await manager.ensureStarted();
		assert.strictEqual(starter.startCount, 1);
	});

	test('shares concurrent lazy startup', async () => {
		const manager = createManager({ startMode: 'lazy' });

		await Promise.all([
			manager.ensureStarted(),
			manager.ensureStarted(),
		]);
		assert.strictEqual(starter.startCount, 1);
	});

	test('restarts after a lazy agent host crash', async () => {
		const manager = createManager({ startMode: 'lazy' });
		await manager.ensureStarted();

		starter.fireProcessExit(1);
		await manager.ensureStarted();
		assert.strictEqual(starter.startCount, 2);
	});

	test('waits for the configured WebSocket listener before resolving startup', async () => {
		const ready = new DeferredPromise<void>();
		starter.connectionTrackerChannel.setCallResult('waitForConfiguredWebSocketServer', ready.p);
		const manager = createManager({ startMode: 'lazy' });
		const start = manager.ensureStarted();
		let started = false;
		void start.then(() => started = true);

		await Promise.resolve();
		assert.strictEqual(started, false);

		await ready.complete();
		await start;
		assert.strictEqual(started, true);
	});

	test('disposes the agent host connection when the manager shuts down during startup', async () => {
		const ready = new DeferredPromise<void>();
		starter.connectionTrackerChannel.setCallResult('waitForConfiguredWebSocketServer', ready.p);
		const manager = createManager({ startMode: 'lazy' });
		const start = manager.ensureStarted();

		await Promise.resolve();
		manager.dispose();
		await ready.complete();
		await start;

		assert.strictEqual(starter.connectionStores[0].isDisposed, true);
	});

	test('allows a new explicit start after exhausting crash restarts', async () => {
		const manager = createManager({ startMode: 'lazy' });
		await manager.ensureStarted();

		for (let i = 0; i <= 5; i++) {
			starter.fireProcessExit(1);
			await manager.ensureStarted();
		}
		starter.fireProcessExit(1);
		await manager.ensureStarted();

		assert.strictEqual(starter.startCount, 8);
	});

	test('keeps the original request pending while a transient start failure is retried', async () => {
		const manager = createManager({ startMode: 'lazy' });
		starter.failNextStart(new Error('transient'));

		await manager.ensureStarted();

		assert.strictEqual(starter.startCount, 2);
	});

	test('does not double-restart when the host exits during startup', async () => {
		const ready = new DeferredPromise<void>();
		starter.connectionTrackerChannel.setCallResult('waitForConfiguredWebSocketServer', ready.p);
		const manager = createManager({ startMode: 'lazy' });
		const start = manager.ensureStarted();

		await Promise.resolve();
		// The IPC client rejects in-flight requests before surfacing the exit, so
		// both the readiness rejection and the exit event race to restart.
		starter.connectionTrackerChannel.setCallResult('waitForConfiguredWebSocketServer', Promise.resolve());
		ready.error(new Error('canceled'));
		starter.fireProcessExit(1);
		await start;

		assert.strictEqual(starter.startCount, 2);
	});
});
