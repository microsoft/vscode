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

	readonly agentHostChannel = new MockChannel();
	readonly loggerChannel: MockChannel;
	readonly connectionTrackerChannel = new MockChannel();

	constructor() {
		this.loggerChannel = new MockChannel();
		this.loggerChannel.setCallResult('getRegisteredLoggers', []);
	}

	start(): IAgentHostConnection {
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

suite('ServerAgentHostManager', () => {
	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	let starter: MockAgentHostStarter;
	let lifetimeService: MockServerLifetimeService;

	setup(() => {
		starter = new MockAgentHostStarter();
		lifetimeService = new MockServerLifetimeService();
	});

	function createManager(): ServerAgentHostManager {
		return ds.add(new ServerAgentHostManager(
			starter,
			new NullLogService(),
			ds.add(new NullLoggerService()),
			lifetimeService,
		));
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

	test('no lifetime token initially', () => {
		createManager();
		assert.strictEqual(lifetimeService.hasActiveConsumers, false);
	});

	test('acquires token when sessions become active', () => {
		createManager();
		fireActiveSessions(1);
		assert.strictEqual(lifetimeService.hasActiveConsumers, true);
	});

	test('acquires token when clients connect (no active sessions)', () => {
		createManager();
		fireConnectionCount(2);
		assert.strictEqual(lifetimeService.hasActiveConsumers, true);
	});

	test('releases token only when both sessions and connections are zero', () => {
		createManager();

		// Sessions active, no connections
		fireActiveSessions(1);
		assert.strictEqual(lifetimeService.hasActiveConsumers, true);

		// Connections appear too
		fireConnectionCount(1);
		assert.strictEqual(lifetimeService.hasActiveConsumers, true);

		// Sessions go idle, but connections remain
		fireActiveSessions(0);
		assert.strictEqual(lifetimeService.hasActiveConsumers, true);

		// Connections drop to zero -- now both are idle
		fireConnectionCount(0);
		assert.strictEqual(lifetimeService.hasActiveConsumers, false);
	});

	test('releases token only when connections drop after sessions already idle', () => {
		createManager();

		fireConnectionCount(3);
		assert.strictEqual(lifetimeService.hasActiveConsumers, true);

		fireConnectionCount(0);
		assert.strictEqual(lifetimeService.hasActiveConsumers, false);
	});

	test('process exit resets both signals and clears token', () => {
		createManager();

		fireActiveSessions(2);
		fireConnectionCount(1);
		assert.strictEqual(lifetimeService.hasActiveConsumers, true);

		starter.fireProcessExit(1);
		assert.strictEqual(lifetimeService.hasActiveConsumers, false);
	});
});
