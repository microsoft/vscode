/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { IProductService } from '../../../product/common/productService.js';
import { SSHAuthMethod, type ISSHAgentHostConfig, type ISSHConnectProgress } from '../../common/sshRemoteAgentHost.js';
import { SSHRemoteAgentHostMainService } from '../../node/sshRemoteAgentHostService.js';

/** Minimal mock SSHChannel for testing. */
class MockSSHChannel {
	readonly stderr = { on: () => { } };
	on(_event: string, _listener?: (...args: never[]) => void): this { return this; }
	close(): void { }
}

/**
 * Mock SSHClient that records exec calls and returns configured responses.
 * Each call to `exec` shifts the next response from the queue.
 */
class MockSSHClient {
	readonly execCalls: string[] = [];
	ended = false;

	private readonly _execResponses: Array<{ stdout: string; code: number }>;
	private readonly _closeListeners: Array<() => void> = [];
	private readonly _errorListeners: Array<() => void> = [];

	constructor(execResponses: Array<{ stdout: string; code: number }> = []) {
		this._execResponses = execResponses;
	}

	on(event: string, listener: (...args: never[]) => void): this {
		if (event === 'close') {
			this._closeListeners.push(listener as () => void);
		} else if (event === 'error') {
			this._errorListeners.push(listener as () => void);
		}
		return this;
	}

	removeListener(event: string, listener: (...args: unknown[]) => void): this {
		const list = event === 'close' ? this._closeListeners : event === 'error' ? this._errorListeners : undefined;
		if (list) {
			const idx = list.indexOf(listener as () => void);
			if (idx >= 0) {
				list.splice(idx, 1);
			}
		}
		return this;
	}

	fireClose(): void {
		for (const listener of this._closeListeners) {
			listener();
		}
	}

	get closeListenerCount(): number {
		return this._closeListeners.length;
	}

	get errorListenerCount(): number {
		return this._errorListeners.length;
	}

	connect(): void { /* no-op */ }

	exec(command: string, callback: (err: Error | undefined, stream: unknown) => void): this {
		this.execCalls.push(command);
		const response = this._execResponses.shift() ?? { stdout: '', code: 0 };
		const channel = new MockSSHChannel();
		// Simulate async SSH exec: resolve immediately via microtask
		queueMicrotask(() => {
			// Fire data events
			if (response.stdout) {
				const origOn = channel.on.bind(channel);
				// Re-bind on to capture data handler
				let dataHandler: ((data: Buffer) => void) | undefined;
				let closeHandler: ((code: number) => void) | undefined;
				channel.on = ((event: string, listener: (...args: unknown[]) => void) => {
					if (event === 'data') {
						dataHandler = listener as (data: Buffer) => void;
					} else if (event === 'close') {
						closeHandler = listener as (code: number) => void;
					}
					return origOn(event, listener);
				}) as typeof channel.on;
				callback(undefined, channel);
				if (dataHandler) {
					dataHandler(Buffer.from(response.stdout));
				}
				if (closeHandler) {
					closeHandler(response.code);
				}
			} else {
				// No stdout — just call back and fire close
				let closeHandler: ((code: number) => void) | undefined;
				const origOn = channel.on.bind(channel);
				channel.on = ((event: string, listener: (...args: unknown[]) => void) => {
					if (event === 'close') {
						closeHandler = listener as (code: number) => void;
					}
					return origOn(event, listener);
				}) as typeof channel.on;
				callback(undefined, channel);
				if (closeHandler) {
					closeHandler(response.code);
				}
			}
		});
		return this;
	}

	forwardOut(
		_srcIP: string, _srcPort: number, _dstIP: string, _dstPort: number,
		_callback: (err: Error | undefined, channel: unknown) => void,
	): this {
		return this;
	}

	end(): void {
		this.ended = true;
	}
}

function makeConfig(overrides?: Partial<ISSHAgentHostConfig>): ISSHAgentHostConfig {
	return {
		host: '10.0.0.1',
		username: 'testuser',
		authMethod: SSHAuthMethod.Agent,
		name: 'test-host',
		...overrides,
	};
}

/**
 * Testable subclass of SSHRemoteAgentHostMainService.
 * Overrides the SSH/WebSocket layer so the entire connect flow runs in-process
 * without needing `ssh2` or `ws` modules.
 */
class TestableSSHRemoteAgentHostMainService extends SSHRemoteAgentHostMainService {

	readonly mockClients: MockSSHClient[] = [];

	/** Responses that _connectSSH will hand to MockSSHClient for its exec queue. */
	execResponses: Array<{ stdout: string; code: number }> = [];

	/** What _startRemoteAgentHost will resolve with. */
	startResult: { port: number; connectionToken: string | undefined; pid: number | undefined } = {
		port: 9999, connectionToken: 'tok-abc', pid: 42,
	};
	startCalled = 0;

	/** What _createWebSocketRelay will resolve with. Set to an Error to reject. */
	relayResult: { send: (data: string) => void; close: () => void } | Error = {
		send: () => { },
		close: () => { },
	};
	relayCalled = 0;

	/** Override to intercept relay creation in specific tests. */
	relayHook: ((call: number) => { send: (data: string) => void; close: () => void } | Error | undefined) | undefined;

	/** Stored onMessage callbacks from relays, most recent last. */
	private readonly _relayMessageCallbacks: Array<(data: string) => void> = [];
	/** Stored onClose callbacks from relays, most recent last. */
	private readonly _relayCloseCallbacks: Array<() => void> = [];
	/** Stored relay result objects, most recent last (for makePreviousRelaySyncClose). */
	private readonly _relayResults: Array<{ send: (data: string) => void; close: () => void }> = [];

	protected override async _connectSSH(
		_config: ISSHAgentHostConfig,
	) {
		const client = new MockSSHClient(this.execResponses);
		this.mockClients.push(client);
		return client as never;
	}

	protected override async _startRemoteAgentHost(
		_client: unknown, _quality: string, _commandOverride?: string,
	) {
		this.startCalled++;
		return { ...this.startResult, stream: new MockSSHChannel() as never };
	}

	protected override async _createWebSocketRelay(
		_client: unknown, _dstHost: string, _dstPort: number, _connectionToken: string | undefined,
		onMessage: (data: string) => void, onClose: () => void,
	) {
		this.relayCalled++;
		this._relayMessageCallbacks.push(onMessage);
		this._relayCloseCallbacks.push(onClose);
		const hookResult = this.relayHook?.(this.relayCalled);
		if (hookResult !== undefined) {
			if (hookResult instanceof Error) {
				throw hookResult;
			}
			this._relayResults.push(hookResult);
			return hookResult;
		}
		const result = this.relayResult;
		if (result instanceof Error) {
			throw result;
		}
		// Return a distinct object per call so each SSHConnection gets its own relay
		const relayObj = { send: result.send, close: result.close };
		this._relayResults.push(relayObj);
		return relayObj;
	}

	override async resolveSSHConfig(_host: string): ReturnType<SSHRemoteAgentHostMainService['resolveSSHConfig']> {
		return {
			hostname: '10.0.0.1',
			port: 22,
			user: 'testuser',
			identityFile: [],
			forwardAgent: false,
		};
	}

	/**
	 * Simulate the old (superseded) relay's WebSocket close event firing.
	 * This calls the onClose callback of the second-to-last relay.
	 */
	simulateOldRelayClose(): void {
		if (this._relayCloseCallbacks.length >= 2) {
			this._relayCloseCallbacks[this._relayCloseCallbacks.length - 2]();
		}
	}

	/**
	 * Modify the most recently created relay so that calling close()
	 * synchronously fires its onClose callback. This simulates a WebSocket
	 * implementation that fires the 'close' event inline during ws.close().
	 */
	makePreviousRelaySyncClose(): void {
		const idx = this._relayResults.length - 1;
		if (idx >= 0 && this._relayCloseCallbacks.length > idx) {
			const onClose = this._relayCloseCallbacks[idx];
			this._relayResults[idx].close = () => { onClose(); };
		}
	}

	/**
	 * Simulate a message arriving on a specific relay (0-indexed).
	 * Defaults to the most recent relay.
	 */
	simulateRelayMessage(data: string, relayIndex?: number): void {
		const idx = relayIndex ?? this._relayMessageCallbacks.length - 1;
		this._relayMessageCallbacks[idx]?.(data);
	}

	/**
	 * Simulate the current (active) relay's WebSocket close event firing.
	 */
	simulateCurrentRelayClose(): void {
		if (this._relayCloseCallbacks.length > 0) {
			this._relayCloseCallbacks[this._relayCloseCallbacks.length - 1]();
		}
	}
}

suite('SSHRemoteAgentHostMainService - connect flow', () => {

	const disposables = new DisposableStore();
	let service: TestableSSHRemoteAgentHostMainService;

	setup(() => {
		const logService = new NullLogService();
		const productService: Pick<IProductService, '_serviceBrand' | 'quality'> = {
			_serviceBrand: undefined,
			quality: 'insider',
		};
		service = new TestableSSHRemoteAgentHostMainService(
			logService,
			productService as IProductService,
		);
		disposables.add(service);
	});

	teardown(() => disposables.clear());

	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns existing connection on duplicate connect without replacing relay', async () => {
		// First connect: uname, CLI check, findRunningAgentHost (no state), write state
		service.execResponses = [
			{ stdout: 'Linux\n', code: 0 },      // uname -s
			{ stdout: 'x86_64\n', code: 0 },      // uname -m
			{ stdout: '1.0.0\n', code: 0 },       // CLI --version (already installed)
			{ stdout: '', code: 1 },               // cat state file (not found)
			{ stdout: '', code: 0 },               // echo state file (write)
		];

		const config = makeConfig({ sshConfigHost: 'myalias' });
		const result1 = await service.connect(config);
		assert.strictEqual(result1.connectionId, 'ssh:myalias');
		assert.strictEqual(result1.sshConfigHost, 'myalias');
		assert.strictEqual(service.startCalled, 1);
		assert.strictEqual(service.relayCalled, 1);

		// Second connect without replaceRelay — returns existing info
		// without creating a new relay or restarting the agent
		const result2 = await service.connect(config);
		assert.strictEqual(result2.connectionId, result1.connectionId);
		assert.strictEqual(result2.connectionToken, result1.connectionToken);
		assert.strictEqual(result2.sshConfigHost, 'myalias');
		assert.strictEqual(service.startCalled, 1);
		assert.strictEqual(service.relayCalled, 1); // no new relay
	});

	test('creates fresh relay on reconnect without restarting agent', async () => {
		// First connect: uname, CLI check, findRunningAgentHost (no state), write state
		service.execResponses = [
			{ stdout: 'Linux\n', code: 0 },      // uname -s
			{ stdout: 'x86_64\n', code: 0 },      // uname -m
			{ stdout: '1.0.0\n', code: 0 },       // CLI --version (already installed)
			{ stdout: '', code: 1 },               // cat state file (not found)
			{ stdout: '', code: 0 },               // echo state file (write)
		];

		const config = makeConfig({ sshConfigHost: 'myalias' });
		const result1 = await service.connect(config);
		assert.strictEqual(service.startCalled, 1);
		assert.strictEqual(service.relayCalled, 1);

		// Reconnect — creates fresh relay on existing SSH tunnel
		const result2 = await service.reconnect('myalias', 'test-agent');
		assert.strictEqual(result2.connectionId, result1.connectionId);
		assert.strictEqual(result2.connectionToken, result1.connectionToken);
		assert.strictEqual(service.startCalled, 1); // no restart
		assert.strictEqual(service.relayCalled, 2); // fresh relay
	});

	test('reconnect does not fire onDidRelayClose for superseded relay', async () => {
		service.execResponses = [
			{ stdout: 'Linux\n', code: 0 },
			{ stdout: 'x86_64\n', code: 0 },
			{ stdout: '1.0.0\n', code: 0 },
			{ stdout: '', code: 1 },
			{ stdout: '', code: 0 },
		];

		const config = makeConfig({ sshConfigHost: 'myalias' });
		await service.connect(config);

		const closeEvents: string[] = [];
		disposables.add(service.onDidRelayClose(id => closeEvents.push(id)));

		// Reconnect replaces the relay — old relay close should be suppressed
		await service.reconnect('myalias', 'test-agent');

		// Simulate the old relay's close event firing asynchronously
		service.simulateOldRelayClose();

		assert.deepStrictEqual(closeEvents, []);
	});

	test('reconnect suppresses synchronous close from old relay during replacement', async () => {
		service.execResponses = [
			{ stdout: 'Linux\n', code: 0 },
			{ stdout: 'x86_64\n', code: 0 },
			{ stdout: '1.0.0\n', code: 0 },
			{ stdout: '', code: 1 },
			{ stdout: '', code: 0 },
		];

		const config = makeConfig({ sshConfigHost: 'myalias' });
		await service.connect(config);

		const closeEvents: string[] = [];
		disposables.add(service.onDidRelayClose(id => closeEvents.push(id)));

		// Make the first relay's close() synchronously fire its onClose callback,
		// simulating a WebSocket that fires 'close' synchronously on ws.close().
		service.makePreviousRelaySyncClose();

		await service.reconnect('myalias', 'test-agent');
		assert.deepStrictEqual(closeEvents, []);
	});

	test('uses sshConfigHost as connection key when present', async () => {
		service.execResponses = [
			{ stdout: 'Linux\n', code: 0 },
			{ stdout: 'x86_64\n', code: 0 },
			{ stdout: '1.0.0\n', code: 0 },
			{ stdout: '', code: 1 },
			{ stdout: '', code: 0 },
		];

		const result = await service.connect(makeConfig({ sshConfigHost: 'myhost' }));
		assert.strictEqual(result.connectionId, 'ssh:myhost');
		assert.strictEqual(result.sshConfigHost, 'myhost');
	});

	test('skips platform detection and CLI install with remoteAgentHostCommand', async () => {
		// With a custom command, only state file check + write should happen
		service.execResponses = [
			{ stdout: '', code: 1 },  // cat state file (not found)
			{ stdout: '', code: 0 },  // echo state file (write)
		];

		const result = await service.connect(makeConfig({
			remoteAgentHostCommand: '/custom/agent --port 0',
		}));
		assert.strictEqual(result.connectionId, 'testuser@10.0.0.1:22');
		assert.strictEqual(service.startCalled, 1);

		// Verify no uname calls were made (custom command skips platform detection)
		const client = service.mockClients[0];
		assert.ok(!client.execCalls.some(c => c.includes('uname')));
	});

	test('reuses existing agent host when state file has valid PID', async () => {
		const existingState = JSON.stringify({ pid: 1234, port: 7777, connectionToken: 'existing-tok' });
		service.execResponses = [
			{ stdout: 'Linux\n', code: 0 },       // uname -s
			{ stdout: 'x86_64\n', code: 0 },      // uname -m
			{ stdout: '1.0.0\n', code: 0 },       // CLI --version
			{ stdout: existingState, code: 0 },    // cat state file (found)
			{ stdout: '', code: 0 },               // kill -0 (PID alive)
		];

		const result = await service.connect(makeConfig());

		// Should NOT have started a new agent host
		assert.strictEqual(service.startCalled, 0);
		// Should have connected the WebSocket relay
		assert.strictEqual(service.relayCalled, 1);
		// Connection token should come from the state file
		assert.strictEqual(result.connectionToken, 'existing-tok');
	});

	test('starts fresh when state file PID is dead', async () => {
		const staleState = JSON.stringify({ pid: 9999, port: 7777, connectionToken: 'old-tok' });
		service.execResponses = [
			{ stdout: 'Linux\n', code: 0 },       // uname -s
			{ stdout: 'x86_64\n', code: 0 },      // uname -m
			{ stdout: '1.0.0\n', code: 0 },       // CLI --version
			{ stdout: staleState, code: 0 },       // cat state file
			{ stdout: '', code: 1 },               // kill -0 (PID dead)
			{ stdout: '', code: 0 },               // rm -f state file
			{ stdout: '', code: 0 },               // echo state file (write new)
		];

		const result = await service.connect(makeConfig());

		// Should have started a new agent host since PID was dead
		assert.strictEqual(service.startCalled, 1);
		// Token should come from new start, not the stale state
		assert.strictEqual(result.connectionToken, 'tok-abc');
	});

	test('falls back to fresh start when relay to reused agent fails', async () => {
		const existingState = JSON.stringify({ pid: 1234, port: 7777, connectionToken: 'existing-tok' });
		service.execResponses = [
			{ stdout: 'Linux\n', code: 0 },       // uname -s
			{ stdout: 'x86_64\n', code: 0 },      // uname -m
			{ stdout: '1.0.0\n', code: 0 },       // CLI --version
			{ stdout: existingState, code: 0 },    // cat state file (found)
			{ stdout: '', code: 0 },               // kill -0 (PID alive)
			// cleanup: cat state file, kill PID, rm state file
			{ stdout: existingState, code: 0 },
			{ stdout: '', code: 0 },
			{ stdout: '', code: 0 },
			// write new state file after fresh start
			{ stdout: '', code: 0 },
		];

		// First relay attempt fails, second succeeds
		let relayCallCount = 0;
		service.relayHook = () => {
			relayCallCount++;
			if (relayCallCount === 1) {
				return new Error('connection refused');
			}
			return { send: () => { }, close: () => { } };
		};

		const result = await service.connect(makeConfig());

		// Should have started a fresh agent host after relay failure
		assert.strictEqual(service.startCalled, 1);
		assert.strictEqual(relayCallCount, 2);
		assert.strictEqual(result.connectionToken, 'tok-abc');
	});

	test('does not retry when relay fails on freshly started agent', async () => {
		service.execResponses = [
			{ stdout: 'Linux\n', code: 0 },
			{ stdout: 'x86_64\n', code: 0 },
			{ stdout: '1.0.0\n', code: 0 },
			{ stdout: '', code: 1 },               // no state file
			{ stdout: '', code: 0 },               // write state
		];

		service.relayResult = new Error('connection refused');

		await assert.rejects(
			() => service.connect(makeConfig()),
			/connection refused/,
		);
		assert.strictEqual(service.startCalled, 1);
	});

	test('cleans up SSH client on error', async () => {
		service.execResponses = [
			{ stdout: 'Linux\n', code: 0 },
			{ stdout: 'x86_64\n', code: 0 },
			{ stdout: '1.0.0\n', code: 0 },
			{ stdout: '', code: 1 },
			{ stdout: '', code: 0 },
		];

		service.relayResult = new Error('boom');

		await assert.rejects(() => service.connect(makeConfig()));

		// SSH client should have been ended in the catch block
		assert.strictEqual(service.mockClients[0].ended, true);
	});

	test('sanitizes config in result (strips password and privateKeyPath)', async () => {
		service.execResponses = [
			{ stdout: '', code: 1 },
			{ stdout: '', code: 0 },
		];

		const result = await service.connect(makeConfig({
			remoteAgentHostCommand: '/agent',
			authMethod: SSHAuthMethod.Password,
			password: 'secret123',
			privateKeyPath: '/home/user/.ssh/id_rsa',
		}));

		assert.strictEqual((result.config as Record<string, unknown>)['password'], undefined);
		assert.strictEqual((result.config as Record<string, unknown>)['privateKeyPath'], undefined);
		assert.strictEqual(result.config.host, '10.0.0.1');
	});

	test('disconnect removes connection and allows reconnect', async () => {
		service.execResponses = [
			{ stdout: '', code: 1 },
			{ stdout: '', code: 0 },
		];

		const result = await service.connect(makeConfig({
			remoteAgentHostCommand: '/agent',
		}));

		// Disconnect
		await service.disconnect(result.connectionId);

		// Next connect should create a new connection
		service.execResponses = [
			{ stdout: '', code: 1 },
			{ stdout: '', code: 0 },
		];
		service.startCalled = 0;

		const result2 = await service.connect(makeConfig({
			remoteAgentHostCommand: '/agent',
		}));
		assert.strictEqual(service.startCalled, 1);
		assert.strictEqual(result2.connectionId, result.connectionId);
	});

	test('fires onDidChangeConnections on connect and disconnect', async () => {
		service.execResponses = [
			{ stdout: '', code: 1 },
			{ stdout: '', code: 0 },
		];

		const events: string[] = [];
		disposables.add(service.onDidChangeConnections(() => events.push('changed')));
		disposables.add(service.onDidCloseConnection(id => events.push(`closed:${id}`)));

		const result = await service.connect(makeConfig({
			remoteAgentHostCommand: '/agent',
		}));
		assert.strictEqual(events.length, 1);
		assert.strictEqual(events[0], 'changed');

		await service.disconnect(result.connectionId);
		// disconnect fires close before change
		assert.deepStrictEqual(events, [
			'changed',
			`closed:${result.connectionId}`,
			'changed',
		]);
	});

	// --- Relay message routing ---

	test('relay messages fire onDidRelayMessage with correct connectionId', async () => {
		service.execResponses = [
			{ stdout: '', code: 1 },
			{ stdout: '', code: 0 },
		];

		const result = await service.connect(makeConfig({
			remoteAgentHostCommand: '/agent',
		}));

		const messages: Array<{ connectionId: string; data: string }> = [];
		disposables.add(service.onDidRelayMessage(msg => messages.push(msg)));

		service.simulateRelayMessage('{"jsonrpc":"2.0","id":1}');
		service.simulateRelayMessage('{"jsonrpc":"2.0","id":2}');

		assert.deepStrictEqual(messages, [
			{ connectionId: result.connectionId, data: '{"jsonrpc":"2.0","id":1}' },
			{ connectionId: result.connectionId, data: '{"jsonrpc":"2.0","id":2}' },
		]);
	});

	test('relay close fires onDidRelayClose with correct connectionId', async () => {
		service.execResponses = [
			{ stdout: '', code: 1 },
			{ stdout: '', code: 0 },
		];

		const result = await service.connect(makeConfig({
			remoteAgentHostCommand: '/agent',
		}));

		const closes: string[] = [];
		disposables.add(service.onDidRelayClose(id => closes.push(id)));

		service.simulateCurrentRelayClose();

		assert.deepStrictEqual(closes, [result.connectionId]);
	});

	test('relaySend delivers data to the correct connection', async () => {
		const sentData: string[] = [];
		service.relayResult = {
			send: (data: string) => sentData.push(data),
			close: () => { },
		};

		service.execResponses = [
			{ stdout: '', code: 1 },
			{ stdout: '', code: 0 },
		];
		const result = await service.connect(makeConfig({
			remoteAgentHostCommand: '/agent',
		}));

		await service.relaySend(result.connectionId, 'hello');
		await service.relaySend(result.connectionId, 'world');

		assert.deepStrictEqual(sentData, ['hello', 'world']);
	});

	test('relaySend to unknown connectionId is a no-op', async () => {
		service.execResponses = [
			{ stdout: '', code: 1 },
			{ stdout: '', code: 0 },
		];
		await service.connect(makeConfig({ remoteAgentHostCommand: '/agent' }));

		// Should not throw
		await service.relaySend('nonexistent', 'data');
	});

	// --- Multiple independent connections ---

	test('connects to two different hosts independently', async () => {
		// First host
		service.execResponses = [
			{ stdout: '', code: 1 },
			{ stdout: '', code: 0 },
		];
		const r1 = await service.connect(makeConfig({
			host: '10.0.0.1', remoteAgentHostCommand: '/agent',
		}));

		// Second host
		service.execResponses = [
			{ stdout: '', code: 1 },
			{ stdout: '', code: 0 },
		];
		const r2 = await service.connect(makeConfig({
			host: '10.0.0.2', remoteAgentHostCommand: '/agent',
		}));

		assert.notStrictEqual(r1.connectionId, r2.connectionId);
		assert.strictEqual(service.startCalled, 2);
		assert.strictEqual(service.relayCalled, 2);
	});

	test('disconnect one host does not affect the other', async () => {
		service.execResponses = [
			{ stdout: '', code: 1 },
			{ stdout: '', code: 0 },
		];
		const r1 = await service.connect(makeConfig({
			host: '10.0.0.1', remoteAgentHostCommand: '/agent',
		}));

		service.execResponses = [
			{ stdout: '', code: 1 },
			{ stdout: '', code: 0 },
		];
		const r2 = await service.connect(makeConfig({
			host: '10.0.0.2', remoteAgentHostCommand: '/agent',
		}));

		await service.disconnect(r1.connectionId);

		// r2 should still be live — duplicate connect returns existing info
		const r2Again = await service.connect(makeConfig({
			host: '10.0.0.2', remoteAgentHostCommand: '/agent',
		}));
		assert.strictEqual(r2Again.connectionId, r2.connectionId);
		// No new start or relay was needed
		assert.strictEqual(service.startCalled, 2);
		assert.strictEqual(service.relayCalled, 2);
	});

	// --- Relay messages route to correct connection when multiple exist ---

	test('relay messages from two connections are distinguished by connectionId', async () => {
		service.execResponses = [
			{ stdout: '', code: 1 },
			{ stdout: '', code: 0 },
		];
		const r1 = await service.connect(makeConfig({
			host: '10.0.0.1', remoteAgentHostCommand: '/agent',
		}));

		service.execResponses = [
			{ stdout: '', code: 1 },
			{ stdout: '', code: 0 },
		];
		const r2 = await service.connect(makeConfig({
			host: '10.0.0.2', remoteAgentHostCommand: '/agent',
		}));

		const messages: Array<{ connectionId: string; data: string }> = [];
		disposables.add(service.onDidRelayMessage(msg => messages.push(msg)));

		// Message on first connection's relay (index 0)
		service.simulateRelayMessage('msg-from-host1', 0);
		// Message on second connection's relay (index 1)
		service.simulateRelayMessage('msg-from-host2', 1);

		assert.deepStrictEqual(messages, [
			{ connectionId: r1.connectionId, data: 'msg-from-host1' },
			{ connectionId: r2.connectionId, data: 'msg-from-host2' },
		]);
	});

	// --- Reconnect creates fresh SSH connection after disconnect ---

	test('reconnect after disconnect establishes a new SSH connection', async () => {
		service.execResponses = [
			{ stdout: 'Linux\n', code: 0 },
			{ stdout: 'x86_64\n', code: 0 },
			{ stdout: '1.0.0\n', code: 0 },
			{ stdout: '', code: 1 },
			{ stdout: '', code: 0 },
		];
		const r1 = await service.connect(makeConfig({ sshConfigHost: 'myhost' }));
		assert.strictEqual(service.mockClients.length, 1);

		await service.disconnect(r1.connectionId);

		service.execResponses = [
			{ stdout: 'Linux\n', code: 0 },
			{ stdout: 'x86_64\n', code: 0 },
			{ stdout: '1.0.0\n', code: 0 },
			{ stdout: '', code: 1 },
			{ stdout: '', code: 0 },
		];

		const r2 = await service.reconnect('myhost', 'test-host');
		// Should have created a fresh SSH client (not reused the old one)
		assert.strictEqual(service.mockClients.length, 2);
		assert.strictEqual(r2.connectionId, r1.connectionId);
	});

	// --- Progress events ---

	test('fires progress events during connect', async () => {
		service.execResponses = [
			{ stdout: 'Linux\n', code: 0 },
			{ stdout: 'x86_64\n', code: 0 },
			{ stdout: '1.0.0\n', code: 0 },
			{ stdout: '', code: 1 },
			{ stdout: '', code: 0 },
		];

		const progress: ISSHConnectProgress[] = [];
		disposables.add(service.onDidReportConnectProgress(p => progress.push(p)));

		await service.connect(makeConfig({ sshConfigHost: 'myhost' }));

		// Expect at least: SSH connecting, platform detection, CLI check, start agent, relay
		assert.ok(progress.length >= 3, `expected at least 3 progress events, got ${progress.length}`);
		assert.ok(progress.every(p => p.connectionKey === 'ssh:myhost'));
		assert.ok(progress.every(p => p.message.length > 0), 'all progress messages should be non-empty');
	});

	// --- SSH client close triggers connection disposal ---

	test('SSH client close event disposes the connection', async () => {
		service.execResponses = [
			{ stdout: '', code: 1 },
			{ stdout: '', code: 0 },
		];

		const result = await service.connect(makeConfig({
			remoteAgentHostCommand: '/agent',
		}));

		const closeEvents: string[] = [];
		disposables.add(service.onDidCloseConnection(id => closeEvents.push(id)));

		// Simulate the SSH client closing (e.g. network drop)
		service.mockClients[0].fireClose();

		assert.deepStrictEqual(closeEvents, [result.connectionId]);
	});

	// --- CLI install flow ---

	test('skips CLI download when CLI is already installed', async () => {
		service.execResponses = [
			{ stdout: 'Linux\n', code: 0 },       // uname -s
			{ stdout: 'x86_64\n', code: 0 },      // uname -m
			{ stdout: '1.0.0\n', code: 0 },       // CLI --version succeeds
			{ stdout: '', code: 1 },               // cat state file (not found)
			{ stdout: '', code: 0 },               // echo state file (write)
		];

		await service.connect(makeConfig());

		// The exec calls should NOT include any curl/tar/install commands
		const execCalls = service.mockClients[0].execCalls;
		assert.ok(!execCalls.some(c => c.includes('curl') || c.includes('tar')),
			'should not download CLI when already installed');
	});

	test('downloads CLI when version check fails', async () => {
		service.execResponses = [
			{ stdout: 'Linux\n', code: 0 },       // uname -s
			{ stdout: 'x86_64\n', code: 0 },      // uname -m
			{ stdout: '', code: 127 },             // CLI --version fails (not found)
			{ stdout: '', code: 0 },               // curl | tar install
			{ stdout: '', code: 1 },               // cat state file (not found)
			{ stdout: '', code: 0 },               // echo state file (write)
		];

		await service.connect(makeConfig());

		const execCalls = service.mockClients[0].execCalls;
		assert.ok(execCalls.some(c => c.includes('curl')),
			'should download CLI when not installed');
	});

	// --- Connection key formats ---

	test('uses host:port as connection key without sshConfigHost', async () => {
		service.execResponses = [
			{ stdout: '', code: 1 },
			{ stdout: '', code: 0 },
		];

		const result = await service.connect(makeConfig({
			host: '192.168.1.1',
			port: 2222,
			remoteAgentHostCommand: '/agent',
		}));
		assert.strictEqual(result.connectionId, 'testuser@192.168.1.1:2222');
	});

	test('defaults to port 22 in connection key', async () => {
		service.execResponses = [
			{ stdout: '', code: 1 },
			{ stdout: '', code: 0 },
		];

		const result = await service.connect(makeConfig({
			host: '192.168.1.1',
			remoteAgentHostCommand: '/agent',
		}));
		assert.strictEqual(result.connectionId, 'testuser@192.168.1.1:22');
	});

	// --- Reconnect preserves connection token from initial connect ---

	test('reconnect preserves connection token and address', async () => {
		service.execResponses = [
			{ stdout: 'Linux\n', code: 0 },
			{ stdout: 'x86_64\n', code: 0 },
			{ stdout: '1.0.0\n', code: 0 },
			{ stdout: '', code: 1 },
			{ stdout: '', code: 0 },
		];

		const original = await service.connect(makeConfig({ sshConfigHost: 'myhost' }));

		const reconnected = await service.reconnect('myhost', 'new-name');
		assert.strictEqual(reconnected.connectionToken, original.connectionToken);
		assert.strictEqual(reconnected.address, original.address);
		assert.strictEqual(reconnected.connectionId, original.connectionId);
	});

	// --- Relay messages from superseded relay are still routed (not gated) ---

	test('messages from superseded relay still arrive (only close is suppressed)', async () => {
		service.execResponses = [
			{ stdout: 'Linux\n', code: 0 },
			{ stdout: 'x86_64\n', code: 0 },
			{ stdout: '1.0.0\n', code: 0 },
			{ stdout: '', code: 1 },
			{ stdout: '', code: 0 },
		];

		const result = await service.connect(makeConfig({ sshConfigHost: 'myhost' }));

		const messages: Array<{ connectionId: string; data: string }> = [];
		disposables.add(service.onDidRelayMessage(msg => messages.push(msg)));

		// Reconnect replaces the relay
		await service.reconnect('myhost', 'test-host');

		// Simulate a message arriving from the OLD relay (index 0)
		service.simulateRelayMessage('stale-message', 0);
		// And from the NEW relay (index 1)
		service.simulateRelayMessage('fresh-message', 1);

		// Both messages arrive — message suppression is deliberately NOT done
		assert.deepStrictEqual(messages, [
			{ connectionId: result.connectionId, data: 'stale-message' },
			{ connectionId: result.connectionId, data: 'fresh-message' },
		]);
	});

	// --- Reconnect failure cleans up detached SSH client ---

	test('reconnect cleans up SSH client when relay recreation fails', async () => {
		service.execResponses = [
			{ stdout: 'Linux\n', code: 0 },
			{ stdout: 'x86_64\n', code: 0 },
			{ stdout: '1.0.0\n', code: 0 },
			{ stdout: '', code: 1 },
			{ stdout: '', code: 0 },
		];

		await service.connect(makeConfig({ sshConfigHost: 'myhost' }));
		const originalClient = service.mockClients[0];
		assert.strictEqual(originalClient.ended, false);

		// Make relay creation fail on the next call (the reconnect attempt)
		service.relayHook = (call) => {
			if (call === 2) {
				return new Error('relay failed');
			}
			return undefined;
		};

		const closeEvents: string[] = [];
		disposables.add(service.onDidCloseConnection(id => closeEvents.push(id)));

		await assert.rejects(
			() => service.reconnect('myhost', 'test-host'),
			/relay failed/,
		);

		// SSH client should have been cleaned up despite the failure
		assert.strictEqual(originalClient.ended, true);
		// Close event should have fired to notify the renderer
		assert.deepStrictEqual(closeEvents, ['ssh:myhost']);
	});

	// --- Reconnect cleans up old SSH client listeners ---

	test('reconnect removes old close/error listeners from shared SSH client', async () => {
		service.execResponses = [
			{ stdout: 'Linux\n', code: 0 },
			{ stdout: 'x86_64\n', code: 0 },
			{ stdout: '1.0.0\n', code: 0 },
			{ stdout: '', code: 1 },
			{ stdout: '', code: 0 },
		];

		await service.connect(makeConfig({ sshConfigHost: 'myhost' }));
		const client = service.mockClients[0];

		// After initial connect, the SSH client has close/error listeners from SSHConnection
		const closeListenersBefore = client.closeListenerCount;
		const errorListenersBefore = client.errorListenerCount;
		assert.ok(closeListenersBefore > 0, 'should have close listeners after connect');
		assert.ok(errorListenersBefore > 0, 'should have error listeners after connect');

		// Reconnect replaces the SSHConnection — old listeners should be removed
		await service.reconnect('myhost', 'test-host');

		// Listener count should not grow — old ones removed, new ones added
		assert.strictEqual(client.closeListenerCount, closeListenersBefore);
		assert.strictEqual(client.errorListenerCount, errorListenersBefore);
	});
});

/**
 * Subclass that runs the real _connectSSH auth-config logic but replaces
 * the ssh2 Client with a mock that captures the connectConfig and resolves
 * immediately.
 */
class ConnectSSHTestService extends SSHRemoteAgentHostMainService {

	lastConnectConfig: Record<string, unknown> | undefined;
	fallbackKeyResult: { path: string; contents: Buffer } | undefined;
	agentSock: string | undefined = undefined;

	async testConnectSSH(config: ISSHAgentHostConfig) {
		return this._connectSSH(config);
	}

	protected override async _connectSSH(config: ISSHAgentHostConfig) {
		// Replicate the auth-config building from the real _connectSSH,
		// then capture the config instead of opening a real SSH connection.
		const connectConfig: Record<string, unknown> = {
			host: config.host,
			port: config.port ?? 22,
			username: config.username,
		};

		switch (config.authMethod) {
			case SSHAuthMethod.Agent: {
				connectConfig.agent = this.agentSock;
				if (!this.agentSock) {
					const fallbackKey = await this._findDefaultKeyFile();
					if (fallbackKey) {
						connectConfig.privateKey = fallbackKey.contents;
					}
				}
				break;
			}
			case SSHAuthMethod.KeyFile:
				// skip actual file read for tests
				break;
			case SSHAuthMethod.Password:
				connectConfig.password = config.password;
				break;
		}

		if (config.agentForward && connectConfig.agent) {
			connectConfig.agentForward = true;
		}

		this.lastConnectConfig = connectConfig;
		return new MockSSHClient() as never;
	}

	protected override async _findDefaultKeyFile() {
		return this.fallbackKeyResult;
	}
}

suite('SSHRemoteAgentHostMainService - _connectSSH auth config', () => {

	const disposables = new DisposableStore();
	let service: ConnectSSHTestService;

	setup(() => {
		const logService = new NullLogService();
		const productService: Pick<IProductService, '_serviceBrand' | 'quality'> = {
			_serviceBrand: undefined,
			quality: 'insider',
		};
		service = new ConnectSSHTestService(
			logService,
			productService as IProductService,
		);
		disposables.add(service);
	});

	teardown(() => disposables.clear());

	ensureNoDisposablesAreLeakedInTestSuite();

	test('agent auth with agent present does not load fallback key', async () => {
		service.agentSock = '/tmp/ssh-agent.sock';
		service.fallbackKeyResult = { path: '~/.ssh/id_ed25519', contents: Buffer.from('encrypted-key') };

		await service.testConnectSSH(makeConfig({ authMethod: SSHAuthMethod.Agent }));

		assert.ok(service.lastConnectConfig, 'connectConfig should be captured');
		assert.ok(Object.hasOwn(service.lastConnectConfig, 'agent'), 'should set agent');
		assert.strictEqual(service.lastConnectConfig.privateKey, undefined, 'should not load fallback key when agent is present');
	});

	test('agent auth without agent socket loads fallback key', async () => {
		service.agentSock = undefined;
		const keyContents = Buffer.from('unencrypted-key');
		service.fallbackKeyResult = { path: '~/.ssh/id_ed25519', contents: keyContents };

		await service.testConnectSSH(makeConfig({ authMethod: SSHAuthMethod.Agent }));

		assert.ok(service.lastConnectConfig, 'connectConfig should be captured');
		assert.strictEqual(service.lastConnectConfig.privateKey, keyContents, 'should load fallback key when no agent');
	});

	test('agent auth with agentForward sets agentForward', async () => {
		service.agentSock = '/tmp/ssh-agent.sock';
		await service.testConnectSSH(makeConfig({ authMethod: SSHAuthMethod.Agent, agentForward: true }));

		assert.ok(service.lastConnectConfig, 'connectConfig should be captured');
		assert.ok(Object.hasOwn(service.lastConnectConfig, 'agent'), 'should set agent');
		assert.strictEqual(service.lastConnectConfig.agentForward, true, 'should set agentForward');
	});

	test('agentForward without agent auth is ignored', async () => {
		await service.testConnectSSH(makeConfig({ authMethod: SSHAuthMethod.Password, password: 'pw', agentForward: true }));

		assert.ok(service.lastConnectConfig, 'connectConfig should be captured');
		assert.strictEqual(service.lastConnectConfig.agentForward, undefined, 'should not set agentForward without agent');
	});
});
