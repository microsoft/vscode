/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { IProductService } from '../../../product/common/productService.js';
import { SSHAuthMethod, type ISSHAgentHostConfig } from '../../common/sshRemoteAgentHost.js';
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

	constructor(execResponses: Array<{ stdout: string; code: number }> = []) {
		this._execResponses = execResponses;
	}

	on(event: string, listener: (...args: never[]) => void): this {
		if (event === 'close') {
			this._closeListeners.push(listener as () => void);
		}
		return this;
	}

	fireClose(): void {
		for (const listener of this._closeListeners) {
			listener();
		}
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
		_onMessage: (data: string) => void, _onClose: () => void,
	) {
		this.relayCalled++;
		const hookResult = this.relayHook?.(this.relayCalled);
		const result = hookResult ?? this.relayResult;
		if (result instanceof Error) {
			throw result;
		}
		return result;
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

	test('returns existing connection on duplicate connect', async () => {
		// First connect: provide exec responses for uname -s, uname -m, CLI --version check,
		// and the findRunningAgentHost state file check (cat fails = no existing)
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

		// Second connect with same config — should return the cached connection
		const result2 = await service.connect(config);
		assert.strictEqual(result2.connectionId, result1.connectionId);
		assert.strictEqual(result2.connectionToken, result1.connectionToken);
		assert.strictEqual(result2.sshConfigHost, 'myalias');
		// Should NOT have started a second agent host
		assert.strictEqual(service.startCalled, 1);
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
			{ stdout: existingState, code: 0 },   // cat state file (found)
			{ stdout: '', code: 0 },              // kill -0 (PID alive)
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
			{ stdout: existingState, code: 0 },   // cat state file (found)
			{ stdout: '', code: 0 },              // kill -0 (PID alive)
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
		// disconnect fires both closed and changed
		assert.ok(events.includes(`closed:${result.connectionId}`));
		assert.strictEqual(events.filter(e => e === 'changed').length, 2);
	});
});
