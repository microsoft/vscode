/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as cp from 'child_process';
import { EventEmitter as NodeEventEmitter } from 'events';
import * as os from 'os';
import { PassThrough } from 'stream';
import { DeferredPromise } from '../../../../base/common/async.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { IProductService } from '../../../product/common/productService.js';
import { TelemetryConfiguration } from '../../../telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { AGENT_HOST_ENDPOINT_REGISTRY_SCHEMA_VERSION, type AgentHostEndpointAddress, type IAgentHostEndpointMetadata } from '../../common/agentHostEndpointRegistry.js';
import { isSSHHostKeyDeniedError, SSHAuthMethod, SSHHostKeyDeniedError, type ISSHAgentHostConfig, type ISSHConnectProgress, type ISSHEndpointSelection, type ISSHEndpointSelectionRequest, type ISSHKeyboardInteractivePrompt, type ISSHKeyboardInteractiveRequest, type ISSHResolvedConfig } from '../../common/sshRemoteAgentHost.js';
import { SSHRemoteAgentHostMainService, makeAuthHandler, type SSHAuthAttempt } from '../../node/sshRemoteAgentHostService.js';
import type { AnyAuthMethod, AuthenticationType, ConnectConfig } from 'ssh2';

const dataFolderName = '.vscode-insiders';
const quality = 'insider';

class RecordingLogService extends NullLogService {
	readonly errors: string[] = [];
	readonly warnings: string[] = [];

	override error(message: string | Error, ...args: unknown[]): void {
		this.errors.push([message, ...args].map(value => value instanceof Error ? value.message : String(value)).join(' '));
	}

	override warn(message: string, ...args: unknown[]): void {
		this.warnings.push([message, ...args].map(String).join(' '));
	}
}

/** Fixture builder for a shared-registry endpoint entry (`code agent endpoints` result). */
function makeEndpoint(overrides: Partial<IAgentHostEndpointMetadata> & Pick<IAgentHostEndpointMetadata, 'type' | 'pid' | 'instanceId'>): IAgentHostEndpointMetadata {
	return {
		schemaVersion: AGENT_HOST_ENDPOINT_REGISTRY_SCHEMA_VERSION,
		protocolVersion: '1.0.0',
		connectionToken: 'tok',
		endpoint: { type: 'tcp', host: '127.0.0.1', port: 8080 },
		...overrides,
	};
}

/** Build the JSON envelope printed by `code agent endpoints`. */
function agentEndpointsStdout(endpoints: readonly IAgentHostEndpointMetadata[], userDataPath = '/home/testuser'): string {
	return JSON.stringify({ userDataPath, endpoints });
}

/**
 * Build the exec-response queue for the common "CLI already installed"
 * registry-discovery path: `uname -s`, `uname -m`, `<cliBin> --version &&
 * <cliBin> update` (reuse), `agent endpoints`, then one `kill -0 <pid>` per distinct live
 * pid (all reported alive). Tests that need a dead PID, a missing CLI, or
 * additional responses (e.g. for a subsequent spawn) build their queues
 * manually or append to this one.
 */
function discoveryResponses(entries: readonly IAgentHostEndpointMetadata[], userDataPath = '/home/testuser'): Array<{ stdout: string; code: number }> {
	const responses: Array<{ stdout: string; code: number }> = [
		{ stdout: 'Linux\n', code: 0 },
		{ stdout: 'x86_64\n', code: 0 },
		{ stdout: '1.0.0\n__vscode_cli_update_exit_code__:0\n', code: 0 },
		{ stdout: agentEndpointsStdout(entries, userDataPath), code: 0 },
	];
	for (const _pid of new Set(entries.map(e => e.pid))) {
		responses.push({ stdout: '', code: 0 }); // kill -0 <pid> (alive)
	}
	return responses;
}

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

class KeyboardInteractiveMockSSHClient {
	ended = false;
	finishResponses: readonly string[] | undefined;

	private readonly _errorListeners: Array<(err: Error) => void> = [];

	on(event: 'ready', listener: () => void): this;
	on(event: 'error', listener: (err: Error) => void): this;
	on(event: 'close', listener: () => void): this;
	on(event: string, listener: ((err: Error) => void) | (() => void)): this {
		if (event === 'error') {
			this._errorListeners.push(listener as (err: Error) => void);
		}
		return this;
	}

	removeListener(_event: string, _listener: (...args: never[]) => void): this {
		return this;
	}

	connect(config: ConnectConfig): void {
		const authHandler = config.authHandler as ((methodsLeft: AuthenticationType[] | null, partialSuccess: boolean, callback: (next: AnyAuthMethod | false) => void) => void) | undefined;
		authHandler?.(null, false, method => {
			if (method && method.type === 'keyboard-interactive') {
				method.prompt('Keyboard', '', 'en-US', [{ prompt: 'Password: ', echo: false }], responses => {
					this.finishResponses = responses;
					this.fireError(new Error('All configured authentication methods failed'));
				});
			}
		});
	}

	end(): void {
		this.ended = true;
	}

	private fireError(err: Error): void {
		for (const listener of this._errorListeners) {
			listener(err);
		}
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
	lastConnectConfig: ISSHAgentHostConfig | undefined;
	resolvedConfigOverrides: Partial<ISSHResolvedConfig> = {};

	/**
	 * Responses that `_connectSSH`'s MockSSHClient hands out for its exec
	 * queue, in call order: `uname -s`, `uname -m`, CLI install check,
	 * `agent endpoints`, one `kill -0 <pid>` per distinct live pid, and any
	 * further spawn/`agent endpoints` calls a test's scenario requires. The
	 * `remoteAgentHostCommand` override path makes none of these calls at
	 * all, so tests using it can leave this empty.
	 */
	execResponses: Array<{ stdout: string; code: number }> = [];

	/** What _startRemoteAgentHost will resolve with (override-command path only). */
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

	/**
	 * If set to a positive number, the Nth `_createWebSocketRelay` call will
	 * return a promise that never resolves nor rejects. This simulates a
	 * silently dead SSH client where `forwardOut`'s callback never fires.
	 */
	hangRelayCreationOnCall: number | undefined;

	/** Public override so tests can shorten the relay creation timeout. */
	protected override relayCreationTimeoutMs: number = 30_000;

	/** Stored onMessage callbacks from relays, most recent last. */
	private readonly _relayMessageCallbacks: Array<(data: string) => void> = [];
	/** Stored onClose callbacks from relays, most recent last. */
	private readonly _relayCloseCallbacks: Array<() => void> = [];
	/** Stored relay result objects, most recent last (for makePreviousRelaySyncClose). */
	private readonly _relayResults: Array<{ send: (data: string) => void; close: () => void }> = [];

	protected override async _connectSSH(
		config: ISSHAgentHostConfig,
	) {
		this.lastConnectConfig = config;
		const client = new MockSSHClient(this.execResponses);
		this.mockClients.push(client);
		return client as never;
	}

	protected override async _startRemoteAgentHost(
		_client: unknown, _cliBin: string | undefined, _cliDataDir: string | undefined, _commandOverride?: string, _telemetryLevel?: TelemetryConfiguration,
	) {
		this.startCalled++;
		return { ...this.startResult, stream: new MockSSHChannel() as never };
	}

	protected override async _createWebSocketRelay(
		_client: unknown,
		_endpoint: AgentHostEndpointAddress,
		_relayCliBin: string,
		_relayCliDataDir: string,
		_relayInstanceId: string,
		_relayUserDataPath: string,
		_connectionToken: string | undefined,
		onMessage: (data: string) => void, onClose: () => void,
	) {
		this.relayCalled++;
		this._relayMessageCallbacks.push(onMessage);
		this._relayCloseCallbacks.push(onClose);
		if (this.hangRelayCreationOnCall === this.relayCalled) {
			// Simulate forwardOut hanging — never resolve. The wrapper in
			// `connect()` should still surface a timeout error instead of
			// hanging the whole connect() call.
			return new Promise<{ send: (data: string) => void; close: () => void }>(() => { /* never */ });
		}
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
			identityAgent: undefined,
			forwardAgent: false,
			userKnownHostsFiles: [],
			globalKnownHostsFiles: [],
			strictHostKeyChecking: undefined,
			...this.resolvedConfigOverrides,
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

	/** Sets the relay creation timeout; exposed for tests only. */
	setRelayCreationTimeoutForTest(ms: number): void {
		this.relayCreationTimeoutMs = ms;
	}

	startKeyboardInteractiveForTest(
		prompts: readonly ISSHKeyboardInteractivePrompt[],
		finish: (responses: readonly string[]) => void,
		cancelConnect: () => void,
	): string {
		return this._handleKeyboardInteractive('ssh:test-host', 'test-host', 'testuser', '', '', prompts, finish, cancelConnect);
	}

	/**
	 * Respond to the next endpoint-selection request fired while the given
	 * function runs, mirroring how the renderer's picker would answer.
	 * Registers the listener *before* invoking `fn` so it never misses the
	 * (synchronously-fired, asynchronously-awaited) request event.
	 */
	async withEndpointSelectionResponse<T>(selection: ISSHEndpointSelection, fn: () => Promise<T>): Promise<T> {
		const requests: ISSHEndpointSelectionRequest[] = [];
		const listener = this.onDidRequestEndpointSelection(request => {
			requests.push(request);
			void this.respondEndpointSelection(request.requestId, selection);
		});
		try {
			return await fn();
		} finally {
			listener.dispose();
		}
	}
}

class KeyboardInteractiveConnectTestService extends SSHRemoteAgentHostMainService {
	readonly client = new KeyboardInteractiveMockSSHClient();

	protected override async _createSSHClient() {
		return this.client as never;
	}

	protected override async _buildAuthAttempts(config: ISSHAgentHostConfig): Promise<SSHAuthAttempt[]> {
		return [{ type: 'keyboard-interactive', username: config.username }];
	}

	connectSSHForTest(config: ISSHAgentHostConfig) {
		return this._connectSSH(config, 'ssh:test-host');
	}
}

class ProxyMockSSHClient extends NodeEventEmitter {
	connectConfig: ConnectConfig | undefined;
	connectError: Error | undefined;
	autoReady = true;

	connect(config: ConnectConfig): void {
		this.connectConfig = config;
		if (this.connectError) {
			throw this.connectError;
		}
		config.sock?.on('error', error => this.emit('error', error));
		if (this.autoReady) {
			queueMicrotask(() => this.emit('ready'));
		}
	}

	end(): void {
		this.emit('close');
	}
}

class ProxyConnectTestService extends SSHRemoteAgentHostMainService {
	readonly client = new ProxyMockSSHClient();
	readonly spawned = new DeferredPromise<void>();
	readonly spawnCalls: Array<{ command: string; args: readonly string[] }> = [];
	readonly killedPids: number[] = [];
	spawnError: Error | undefined;
	clientCreated = false;
	readonly child = Object.assign(new NodeEventEmitter(), {
		pid: 1234,
		exitCode: null,
		signalCode: null,
		stdin: new PassThrough(),
		stdout: new PassThrough(),
		stderr: new PassThrough(),
		kill: () => true,
	}) as unknown as cp.ChildProcessWithoutNullStreams;

	override async resolveSSHConfig(): Promise<never> {
		throw new Error('unexpected config resolution');
	}

	protected override async _createSSHClient() {
		this.clientCreated = true;
		return this.client as never;
	}

	protected override async _buildAuthAttempts(): Promise<SSHAuthAttempt[]> {
		return [];
	}

	protected override _spawnProxyProcess(command: string, args: readonly string[]): cp.ChildProcessWithoutNullStreams {
		assert.strictEqual(this.clientCreated, true);
		this.spawnCalls.push({ command, args });
		queueMicrotask(() => {
			if (this.spawnError) {
				this.child.emit('error', this.spawnError);
			} else {
				this.child.emit('spawn');
				this.spawned.complete();
			}
		});
		return this.child;
	}

	protected override _killProxyProcess(pid: number): Promise<void> {
		this.killedPids.push(pid);
		return Promise.resolve();
	}

	connectSSHForTest(config: ISSHAgentHostConfig) {
		return this._connectSSH(config, 'ssh:test-host');
	}

	/**
	 * Build the transport on its own, without the surrounding connect flow, so
	 * the helper's stdio lifetime can be driven directly.
	 */
	createProxyTransportForTest(config: ISSHAgentHostConfig) {
		this.clientCreated = true;
		return this._createProxyTransport(config);
	}
}

suite('SSHRemoteAgentHostMainService - proxy transport', () => {
	const disposables = new DisposableStore();

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	test('leaves direct SSH connections unchanged', async () => {
		const service = disposables.add(new ProxyConnectTestService(new NullLogService(), { _serviceBrand: undefined, quality, dataFolderName } as IProductService, NullTelemetryService));

		await service.connectSSHForTest(makeConfig({ sshConfigHost: 'target-alias' }));

		assert.strictEqual(service.spawnCalls.length, 0);
		assert.strictEqual(service.client.connectConfig?.sock, undefined);
	});

	test('parses supported single-hop ProxyJump forms and attaches the ssh2 socket', async () => {
		const cases: Array<[string, readonly string[]]> = [
			['jumpserver', ['-o', 'BatchMode=yes', '-W', '[2001:db8::1]:2200', '--', 'jumpserver']],
			['alice@jumpserver', ['-o', 'BatchMode=yes', '-W', '[2001:db8::1]:2200', '--', 'alice@jumpserver']],
			['jumpserver:2222', ['-o', 'BatchMode=yes', '-p', '2222', '-W', '[2001:db8::1]:2200', '--', 'jumpserver']],
			['alice@realm@jumpserver:2222', ['-o', 'BatchMode=yes', '-p', '2222', '-W', '[2001:db8::1]:2200', '--', 'alice@realm@jumpserver']],
			// Destination is bare while `-W` stays bracketed: `getaddrinfo` rejects `[...]` for a numeric IPv6 host.
			['[2001:db8::2]', ['-o', 'BatchMode=yes', '-W', '[2001:db8::1]:2200', '--', '2001:db8::2']],
			['alice@realm@[2001:db8::2]:2222', ['-o', 'BatchMode=yes', '-p', '2222', '-W', '[2001:db8::1]:2200', '--', 'alice@realm@2001:db8::2']],
			// `ssh -G` normalizes these away, but accept them directly too.
			['ssh://jumpserver', ['-o', 'BatchMode=yes', '-W', '[2001:db8::1]:2200', '--', 'jumpserver']],
			['ssh://jumpserver:2222', ['-o', 'BatchMode=yes', '-p', '2222', '-W', '[2001:db8::1]:2200', '--', 'jumpserver']],
			['ssh://alice@jumpserver', ['-o', 'BatchMode=yes', '-W', '[2001:db8::1]:2200', '--', 'alice@jumpserver']],
			['ssh://alice@jumpserver:2222', ['-o', 'BatchMode=yes', '-p', '2222', '-W', '[2001:db8::1]:2200', '--', 'alice@jumpserver']],
			['ssh://[2001:db8::2]:2222', ['-o', 'BatchMode=yes', '-p', '2222', '-W', '[2001:db8::1]:2200', '--', '2001:db8::2']],
			['ssh://alice@[2001:db8::2]:2222', ['-o', 'BatchMode=yes', '-p', '2222', '-W', '[2001:db8::1]:2200', '--', 'alice@2001:db8::2']],
		];
		for (const [proxyJump, args] of cases) {
			const service = disposables.add(new ProxyConnectTestService(new NullLogService(), { _serviceBrand: undefined, quality, dataFolderName } as IProductService, NullTelemetryService));
			await service.connectSSHForTest(makeConfig({ host: '2001:db8::1', port: 2200, sshConfigHost: 'target-alias', proxyJump }));
			assert.deepStrictEqual(service.spawnCalls, [{ command: 'ssh', args }]);
			assert.ok(service.client.connectConfig?.sock);
			service.client.end();
			assert.deepStrictEqual(service.killedPids, [1234]);
		}
	});

	test('passes an option-like destination after the argument terminator', async () => {
		for (const proxyJump of ['-V', '-oProxyCommand=calc.exe', '--help']) {
			const service = disposables.add(new ProxyConnectTestService(new NullLogService(), { _serviceBrand: undefined, quality, dataFolderName } as IProductService, NullTelemetryService));
			await service.connectSSHForTest(makeConfig({ sshConfigHost: 'target-alias', proxyJump }));
			const args = service.spawnCalls[0].args;
			assert.deepStrictEqual(args.slice(-2), ['--', proxyJump]);
			assert.strictEqual(args.indexOf('--'), args.length - 2);
			service.client.end();
		}
	});

	test('expands ProxyJump percent tokens before parsing', async () => {
		// `ssh -G` reports ProxyJump with its tokens unexpanded, so without this
		// the helper is asked for a host literally named `%n-bastion`.
		const cases: Array<[string, readonly string[]]> = [
			['%n-bastion', ['-o', 'BatchMode=yes', '-W', '10.0.0.1:22', '--', 'target-alias-bastion']],
			['bastion-%h', ['-o', 'BatchMode=yes', '-W', '10.0.0.1:22', '--', 'bastion-10.0.0.1']],
			['%r@bastion', ['-o', 'BatchMode=yes', '-W', '10.0.0.1:22', '--', 'testuser@bastion']],
			['bastion:%p', ['-o', 'BatchMode=yes', '-p', '22', '-W', '10.0.0.1:22', '--', 'bastion']],
			['100%%-bastion', ['-o', 'BatchMode=yes', '-W', '10.0.0.1:22', '--', '100%-bastion']],
		];
		for (const [proxyJump, args] of cases) {
			const service = disposables.add(new ProxyConnectTestService(new NullLogService(), { _serviceBrand: undefined, quality, dataFolderName } as IProductService, NullTelemetryService));
			await service.connectSSHForTest(makeConfig({ sshConfigHost: 'target-alias', proxyJump }));
			assert.deepStrictEqual(service.spawnCalls, [{ command: 'ssh', args }], proxyJump);
			service.client.end();
		}
	});

	test('expands a token holding an IPv6 address without losing the jump port', async () => {
		// Expanding before splitting would turn `%h:24321` into `::1:24321`,
		// which then looks like a host with two colons and is rejected.
		const service = disposables.add(new ProxyConnectTestService(new NullLogService(), { _serviceBrand: undefined, quality, dataFolderName } as IProductService, NullTelemetryService));
		await service.connectSSHForTest(makeConfig({ host: '::1', port: 2200, sshConfigHost: 'target-alias', proxyJump: '%h:24321' }));
		assert.deepStrictEqual(service.spawnCalls, [{
			command: 'ssh',
			args: ['-o', 'BatchMode=yes', '-p', '24321', '-W', '[::1]:2200', '--', '::1'],
		}]);
		service.client.end();
	});

	test('rejects malformed ProxyJump values', async () => {
		for (const proxyJump of ['jump-one,jump-two', '[2001:db8::2', '[jump[inner]', '[]', '2001:db8::2', '@jump', 'jump:', 'jump:0', 'jump:65536']) {
			const service = disposables.add(new ProxyConnectTestService(new NullLogService(), { _serviceBrand: undefined, quality, dataFolderName } as IProductService, NullTelemetryService));
			await assert.rejects(service.connectSSHForTest(makeConfig({ sshConfigHost: 'target-alias', proxyJump })));
		}
	});

	test('rejects pre-spawn errors and synchronous SSH connect failures', async () => {
		const service = disposables.add(new ProxyConnectTestService(new NullLogService(), { _serviceBrand: undefined, quality, dataFolderName } as IProductService, NullTelemetryService));
		service.spawnError = new Error('spawn failed');
		await assert.rejects(service.connectSSHForTest(makeConfig({ sshConfigHost: 'target-alias', proxyJump: 'jumpserver' })), /spawn failed/);

		const connectFailure = disposables.add(new ProxyConnectTestService(new NullLogService(), { _serviceBrand: undefined, quality, dataFolderName } as IProductService, NullTelemetryService));
		connectFailure.client.connectError = new Error('connect failed');
		await assert.rejects(connectFailure.connectSSHForTest(makeConfig({ sshConfigHost: 'target-alias', proxyJump: 'jumpserver' })), /connect failed/);
		assert.deepStrictEqual(connectFailure.killedPids, [1234]);
	});

	test('allows a clean proxy exit without reporting an error', async () => {
		const clean = disposables.add(new ProxyConnectTestService(new NullLogService(), { _serviceBrand: undefined, quality, dataFolderName } as IProductService, NullTelemetryService));
		const transport = await clean.createProxyTransportForTest(makeConfig({ sshConfigHost: 'target-alias', proxyJump: 'jumpserver' }));
		assert.ok(transport);
		let socketError: Error | undefined;
		transport.socket.on('error', (err: Error) => { socketError = err; });

		Object.assign(clean.child, { exitCode: 0 });
		clean.child.emit('exit', 0, null);
		// Before the stdout EOF, which disposes the transport and makes the
		// `close` handler a no-op — the clean-exit branch would never run.
		clean.child.emit('close', 0, null);
		await new Promise(resolve => setTimeout(resolve, 0));

		assert.strictEqual(socketError, undefined);
		assert.strictEqual(transport.socket.destroyed, false);
		transport.dispose();
	});

	test('surfaces the proxy helper stderr when ssh2 fails before the helper exits', async () => {
		const service = disposables.add(new ProxyConnectTestService(new NullLogService(), { _serviceBrand: undefined, quality, dataFolderName } as IProductService, NullTelemetryService));
		service.client.autoReady = false;
		const connecting = service.connectSSHForTest(makeConfig({ sshConfigHost: 'target-alias', proxyJump: 'jumpserver' }));
		await service.spawned.p;
		(service.child.stderr as PassThrough).write('ssh: Could not resolve hostname jumpserver: No such host is known.\n');
		await new Promise(resolve => setTimeout(resolve, 0));
		// ssh2 sees the stdout EOF first and fails with its own generic message.
		service.client.emit('error', new Error('Connection lost before handshake'));

		await assert.rejects(connecting, /Could not resolve hostname jumpserver/);
	});

	test('keeps the tail of the proxy helper stderr, not the head', async () => {
		const service = disposables.add(new ProxyConnectTestService(new NullLogService(), { _serviceBrand: undefined, quality, dataFolderName } as IProductService, NullTelemetryService));
		service.client.autoReady = false;
		const connecting = service.connectSSHForTest(makeConfig({ sshConfigHost: 'target-alias', proxyJump: 'jumpserver' }));
		await service.spawned.p;
		(service.child.stderr as PassThrough).write('b'.repeat(8192) + '\nPermission denied (publickey).\n');
		await new Promise(resolve => setTimeout(resolve, 0));
		service.client.emit('error', new Error('Connection lost before handshake'));

		await assert.rejects(connecting, /Permission denied \(publickey\)/);
	});

	test('surfaces the proxy helper stderr in the failure', async () => {
		const service = disposables.add(new ProxyConnectTestService(new NullLogService(), { _serviceBrand: undefined, quality, dataFolderName } as IProductService, NullTelemetryService));
		service.client.autoReady = false;
		const connecting = service.connectSSHForTest(makeConfig({ sshConfigHost: 'target-alias', proxyJump: 'jumpserver' }));
		await service.spawned.p;
		(service.child.stderr as PassThrough).write('ssh: Could not resolve hostname jumpserver: No such host is known.\n');
		await new Promise(resolve => setTimeout(resolve, 0));
		Object.assign(service.child, { exitCode: 255 });
		service.child.emit('close', 255, null);

		await assert.rejects(connecting, /Could not resolve hostname jumpserver/);
	});

	test('waits for the helper stdio to close before reading its stderr', async () => {
		const service = disposables.add(new ProxyConnectTestService(new NullLogService(), { _serviceBrand: undefined, quality, dataFolderName } as IProductService, NullTelemetryService));
		service.client.autoReady = false;
		const connecting = service.connectSSHForTest(makeConfig({ sshConfigHost: 'target-alias', proxyJump: 'jumpserver' }));
		await service.spawned.p;
		Object.assign(service.child, { exitCode: 255 });
		// `exit` fires as soon as the process ends, which can be before stderr
		// has drained. Reading it there would drop the diagnostic entirely.
		service.child.emit('exit', 255, null);
		(service.child.stderr as PassThrough).write('Permission denied (publickey).\n');
		await new Promise(resolve => setTimeout(resolve, 0));
		service.child.emit('close', 255, null);

		await assert.rejects(connecting, /Permission denied \(publickey\)/);
	});

	test('surfaces the helper diagnostic once when the child-exit error drives the rejection', async () => {
		const service = disposables.add(new ProxyConnectTestService(new NullLogService(), { _serviceBrand: undefined, quality, dataFolderName } as IProductService, NullTelemetryService));
		service.client.autoReady = false;
		const connecting = service.connectSSHForTest(makeConfig({ sshConfigHost: 'target-alias', proxyJump: 'jumpserver' }));
		await service.spawned.p;
		Object.assign(service.child, { exitCode: 255 });
		(service.child.stderr as PassThrough).write('Permission denied (publickey).\n');
		await new Promise(resolve => setTimeout(resolve, 0));
		service.child.emit('close', 255, null);

		const error = await connecting.then(() => undefined, (err: Error) => err);
		assert.ok(error);
		// The child-exit error carries code and signal only; `rejectConnect`
		// attaches the bounded stderr tail. Embedding it in both repeats the
		// OpenSSH diagnostic in the message the user sees.
		const occurrences = error.message.split('Permission denied (publickey).').length - 1;
		assert.strictEqual(occurrences, 1, `helper diagnostic repeated: ${error.message}`);
	});

	test('waits for the helper stdio to close before its stderr is considered complete', async () => {
		const service = disposables.add(new ProxyConnectTestService(new NullLogService(), { _serviceBrand: undefined, quality, dataFolderName } as IProductService, NullTelemetryService));
		const transport = await service.createProxyTransportForTest(makeConfig({ sshConfigHost: 'target-alias', proxyJump: 'jumpserver' }));
		assert.ok(transport);

		let settled = false;
		const waiting = transport.whenStderrSettled().then(() => { settled = true; });
		await new Promise(resolve => setTimeout(resolve, 10));
		// ssh2 rejects on the stdout EOF well before this point, so a caller
		// reading stderr right then would see nothing.
		assert.strictEqual(settled, false);
		assert.strictEqual(transport.stderr(), '');

		(service.child.stderr as PassThrough).write('Permission denied (publickey).\n');
		await new Promise(resolve => setTimeout(resolve, 0));
		service.child.emit('close', 255, null);
		await waiting;

		assert.strictEqual(settled, true);
		assert.match(transport.stderr(), /Permission denied \(publickey\)/);
		transport.dispose();
	});

	test('stops waiting for stderr when the helper never closes', async () => {
		const service = disposables.add(new ProxyConnectTestService(new NullLogService(), { _serviceBrand: undefined, quality, dataFolderName } as IProductService, NullTelemetryService));
		const transport = await service.createProxyTransportForTest(makeConfig({ sshConfigHost: 'target-alias', proxyJump: 'jumpserver' }));
		assert.ok(transport);

		// Bounded: a helper that never closes must not stall the failure the
		// user is already waiting on.
		await transport.whenStderrSettled();
		transport.dispose();
	});

	test('keeps the original error type when annotating it with proxy stderr', async () => {
		const service = disposables.add(new ProxyConnectTestService(new NullLogService(), { _serviceBrand: undefined, quality, dataFolderName } as IProductService, NullTelemetryService));
		service.client.autoReady = false;
		const connecting = service.connectSSHForTest(makeConfig({ sshConfigHost: 'target-alias', proxyJump: 'jumpserver' }));
		await service.spawned.p;
		(service.child.stderr as PassThrough).write('Warning: Permanently added jumpserver to known hosts.\n');
		await new Promise(resolve => setTimeout(resolve, 0));
		service.client.emit('error', new SSHHostKeyDeniedError('target-alias'));

		// The renderer suppresses retries and duplicate failure UI by matching
		// `error.name`, so the annotation must not replace the instance.
		await assert.rejects(connecting, error => {
			assert.ok(isSSHHostKeyDeniedError(error), `lost the host-key error type: ${(error as Error).name}`);
			assert.match((error as Error).message, /Permanently added jumpserver/);
			return true;
		});
	});

	test('rejects a nonzero proxy exit before SSH is ready', async () => {
		const service = disposables.add(new ProxyConnectTestService(new NullLogService(), { _serviceBrand: undefined, quality, dataFolderName } as IProductService, NullTelemetryService));
		service.client.autoReady = false;
		const connecting = service.connectSSHForTest(makeConfig({ sshConfigHost: 'target-alias', proxyJump: 'jumpserver' }));
		await service.spawned.p;
		Object.assign(service.child, { exitCode: 23 });
		service.child.emit('close', 23, null);

		await assert.rejects(connecting, /code 23/);
		assert.deepStrictEqual([service.child.stdin.destroyed, service.child.stdout.destroyed, service.child.stderr.destroyed], [true, true, true]);
	});
});

suite('SSHRemoteAgentHostMainService - connect flow', () => {

	const disposables = new DisposableStore();
	let service: TestableSSHRemoteAgentHostMainService;

	setup(() => {
		const logService = new NullLogService();
		const productService: Pick<IProductService, '_serviceBrand' | 'quality' | 'dataFolderName'> = {
			_serviceBrand: undefined,
			quality,
			dataFolderName,
		};
		service = new TestableSSHRemoteAgentHostMainService(
			logService,
			productService as IProductService,
			NullTelemetryService,
		);
		disposables.add(service);
	});

	teardown(() => disposables.clear());

	ensureNoDisposablesAreLeakedInTestSuite();

	// --- Duplicate connect / reconnect on an already-connected host ---

	test('returns existing connection on duplicate connect without replacing relay', async () => {
		service.execResponses = discoveryResponses([makeEndpoint({ type: 'standalone', pid: 1234, instanceId: 'inst-1' })]);

		const config = makeConfig({ sshConfigHost: 'myalias' });
		const result1 = await service.connect(config);
		assert.strictEqual(result1.connectionId, 'ssh:myalias');
		assert.strictEqual(result1.sshConfigHost, 'myalias');
		assert.strictEqual(result1.lifecycle, 'external');
		assert.strictEqual(service.startCalled, 0);
		assert.strictEqual(service.relayCalled, 1);

		// Second connect without replaceRelay — returns existing info
		// without creating a new relay or restarting the agent
		const result2 = await service.connect(config);
		assert.strictEqual(result2.connectionId, result1.connectionId);
		assert.strictEqual(result2.connectionToken, result1.connectionToken);
		assert.strictEqual(result2.sshConfigHost, 'myalias');
		assert.strictEqual(service.relayCalled, 1); // no new relay
	});

	test('creates fresh relay on reconnect without restarting agent', async () => {
		service.execResponses = discoveryResponses([makeEndpoint({ type: 'standalone', pid: 1234, instanceId: 'inst-1' })]);

		const config = makeConfig({ sshConfigHost: 'myalias' });
		const result1 = await service.connect(config);
		assert.strictEqual(service.relayCalled, 1);

		// Reconnect — creates fresh relay on existing SSH tunnel; does not
		// rerun endpoint discovery/selection (see connect()'s replaceRelay path).
		const result2 = await service.reconnect('myalias', 'test-agent');
		assert.strictEqual(result2.connectionId, result1.connectionId);
		assert.strictEqual(result2.connectionToken, result1.connectionToken);
		assert.strictEqual(result2.lifecycle, result1.lifecycle);
		assert.strictEqual(service.relayCalled, 2); // fresh relay
	});

	test('reconnect does not fire onDidRelayClose for superseded relay', async () => {
		service.execResponses = discoveryResponses([makeEndpoint({ type: 'standalone', pid: 1234, instanceId: 'inst-1' })]);

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
		service.execResponses = discoveryResponses([makeEndpoint({ type: 'standalone', pid: 1234, instanceId: 'inst-1' })]);

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
		service.execResponses = discoveryResponses([makeEndpoint({ type: 'standalone', pid: 1234, instanceId: 'inst-1' })]);

		const result = await service.connect(makeConfig({ sshConfigHost: 'myhost' }));
		assert.strictEqual(result.connectionId, 'ssh:myhost');
		assert.strictEqual(result.sshConfigHost, 'myhost');
	});

	// --- remoteAgentHostCommand override skips discovery entirely ---

	test('skips endpoint discovery and CLI install with remoteAgentHostCommand', async () => {
		// The override path never execs anything before starting the agent
		// host itself (no uname, no CLI check, no `agent endpoints`).
		const result = await service.connect(makeConfig({
			remoteAgentHostCommand: '/custom/agent --port 0',
		}));
		assert.strictEqual(result.connectionId, 'testuser@10.0.0.1:22');
		assert.strictEqual(result.serverType, undefined);
		assert.strictEqual(result.instanceId, 'override');
		assert.strictEqual(result.lifecycle, 'managed');
		assert.strictEqual(service.startCalled, 1);
		assert.deepStrictEqual(service.mockClients[0].execCalls, []);
	});

	// --- Selection policy (requirement 2) ---

	test('spawns a dedicated standalone when no live endpoints exist', async () => {
		const newEntry = makeEndpoint({ type: 'standalone', pid: 555, instanceId: 'spawned-1', endpoint: { type: 'tcp', host: '127.0.0.1', port: 9001 } });
		service.execResponses = [
			...discoveryResponses([]),
			{ stdout: '', code: 0 },                              // spawn command (fire-and-forget)
			{ stdout: agentEndpointsStdout([newEntry]), code: 0 }, // wait-poll: agent endpoints (finds the new entry)
		];

		const result = await service.connect(makeConfig({ sshConfigHost: 'myhost' }));
		assert.strictEqual(result.serverType, 'standalone');
		assert.strictEqual(result.instanceId, 'spawned-1');
		assert.strictEqual(result.lifecycle, 'managed');
		assert.strictEqual(result.primary, true);
		assert.strictEqual(service.relayCalled, 1);

		const execCalls = service.mockClients[0].execCalls;
		assert.ok(execCalls.some(c => c.includes('--idle-timeout 300')), `should spawn with idle timeout; saw: ${JSON.stringify(execCalls)}`);
		assert.ok(execCalls.some(c => c.includes('--new-instance')), `spawn must request a genuinely new instance; saw: ${JSON.stringify(execCalls)}`);
		assert.ok(execCalls.some(c => c.includes('--telemetry-level off')), `spawn must apply telemetry disablement; saw: ${JSON.stringify(execCalls)}`);
	});

	test('reuses the single live standalone deterministically without a picker', async () => {
		const events: ISSHEndpointSelectionRequest[] = [];
		service.execResponses = discoveryResponses([makeEndpoint({ type: 'standalone', pid: 1234, instanceId: 'inst-1' })]);
		disposables.add(service.onDidRequestEndpointSelection(r => events.push(r)));

		const result = await service.connect(makeConfig({ sshConfigHost: 'myhost' }));
		assert.strictEqual(result.serverType, 'standalone');
		assert.strictEqual(result.instanceId, 'inst-1');
		assert.strictEqual(result.lifecycle, 'external');
		assert.strictEqual(service.startCalled, 0);
		assert.deepStrictEqual(events, []); // no picker for the single-standalone case
	});

	test('prompts among multiple standalones (no editors) and honors the chosen candidate', async () => {
		const s1 = makeEndpoint({ type: 'standalone', pid: 100, instanceId: 'inst-a' });
		const s2 = makeEndpoint({ type: 'standalone', pid: 200, instanceId: 'inst-b' });
		service.execResponses = discoveryResponses([s1, s2]);

		let seenCandidates: ISSHEndpointSelectionRequest | undefined;
		disposables.add(service.onDidRequestEndpointSelection(r => { seenCandidates = r; }));

		const result = await service.withEndpointSelectionResponse(
			{ kind: 'candidate', type: 'standalone', pid: 200, instanceId: 'inst-b' },
			() => service.connect(makeConfig({ sshConfigHost: 'myhost' })),
		);

		assert.ok(seenCandidates, 'should have requested endpoint selection');
		assert.strictEqual(seenCandidates!.candidates.length, 2);
		assert.ok(seenCandidates!.candidates.every(c => c.type === 'standalone'));
		assert.strictEqual(result.instanceId, 'inst-b');
		assert.strictEqual(result.lifecycle, 'external');
	});

	test('prompts over every live endpoint when at least one editor exists, and does not touch it', async () => {
		const editor = makeEndpoint({ type: 'editor', pid: 300, instanceId: 'editor-1', endpoint: { type: 'socket', path: '/tmp/agent.sock' } });
		const standalone = makeEndpoint({ type: 'standalone', pid: 400, instanceId: 'inst-c' });
		service.execResponses = discoveryResponses([editor, standalone]);

		let seenCandidates: ISSHEndpointSelectionRequest | undefined;
		disposables.add(service.onDidRequestEndpointSelection(r => { seenCandidates = r; }));

		const result = await service.withEndpointSelectionResponse(
			{ kind: 'candidate', type: 'editor', pid: 300, instanceId: 'editor-1' },
			() => service.connect(makeConfig({ sshConfigHost: 'myhost' })),
		);

		assert.strictEqual(seenCandidates!.candidates.length, 2);
		assert.strictEqual(result.serverType, 'editor');
		assert.strictEqual(result.instanceId, 'editor-1');
		// Editor selection is primary+external — never killed/replaced.
		assert.strictEqual(result.lifecycle, 'external');
		assert.strictEqual(result.primary, true);
		assert.strictEqual(service.startCalled, 0);
	});

	test('choosing "Start New Dedicated Agent Host" from the picker spawns, leaving other live endpoints untouched', async () => {
		const editor = makeEndpoint({ type: 'editor', pid: 300, instanceId: 'editor-1', endpoint: { type: 'socket', path: '/tmp/agent.sock' } });
		const spawned = makeEndpoint({ type: 'standalone', pid: 999, instanceId: 'spawned-2' });
		service.execResponses = [
			...discoveryResponses([editor]),
			{ stdout: '', code: 0 },                                   // spawn command
			{ stdout: agentEndpointsStdout([editor, spawned]), code: 0 }, // wait-poll finds the new standalone
		];

		const result = await service.withEndpointSelectionResponse(
			{ kind: 'spawn' },
			() => service.connect(makeConfig({ sshConfigHost: 'myhost' })),
		);

		assert.strictEqual(result.instanceId, 'spawned-2');
		assert.strictEqual(result.lifecycle, 'managed');

		// Requirement refinement: the picker's "Start New Dedicated" choice must
		// use --new-instance so the existing editor/standalone entries are never
		// silently reused/touched, and a genuinely new entry is always created.
		const execCalls = service.mockClients[0].execCalls;
		assert.ok(execCalls.some(c => c.includes('--new-instance')), `spawn must request a genuinely new instance; saw: ${JSON.stringify(execCalls)}`);
	});

	test('cancelling the endpoint-selection picker rejects connect with cancellation and does not spawn', async () => {
		service.execResponses = discoveryResponses([
			makeEndpoint({ type: 'standalone', pid: 100, instanceId: 'inst-a' }),
			makeEndpoint({ type: 'standalone', pid: 200, instanceId: 'inst-b' }),
		]);

		const requestIds: string[] = [];
		disposables.add(service.onDidRequestEndpointSelection(r => requestIds.push(r.requestId)));

		// Wait for the picker request to actually fire (after registry discovery
		// completes) rather than guessing a fixed number of microtask ticks.
		const requestPromise = Event.toPromise(service.onDidRequestEndpointSelection);
		const connectPromise = service.connect(makeConfig({ sshConfigHost: 'myhost' }));
		const request = await requestPromise;
		assert.strictEqual(requestIds.length, 1);
		await service.respondEndpointSelection(request.requestId, undefined);

		await assert.rejects(connectPromise, error => isCancellationError(error));
		assert.strictEqual(service.startCalled, 0);
		assert.strictEqual(service.relayCalled, 0);
	});

	// --- Silent/background reconnect policy: userInitiated: false (review-finding fix) ---
	//
	// A cold-start reconnect (no prior in-memory connection for the key —
	// e.g. the very first auto-reconnect attempt after startup) must never
	// open the endpoint-selection picker, and must never silently attach to
	// an `editor`-owned endpoint even if that is the only live endpoint.
	// Regardless of how many editors/standalones are live, it deterministically
	// reuses a live standalone (lowest `instanceId` first) when one exists,
	// or spawns a new dedicated one (with `--new-instance`) otherwise.

	test('silent reconnect (userInitiated: false) with only an editor entry never prompts and spawns a new dedicated standalone rather than reusing the editor', async () => {
		const editor = makeEndpoint({ type: 'editor', pid: 300, instanceId: 'editor-1', endpoint: { type: 'socket', path: '/tmp/agent.sock' } });
		const spawned = makeEndpoint({ type: 'standalone', pid: 999, instanceId: 'spawned-3' });
		service.execResponses = [
			...discoveryResponses([editor]),
			{ stdout: '', code: 0 },                                      // spawn command (fire-and-forget)
			{ stdout: agentEndpointsStdout([editor, spawned]), code: 0 }, // wait-poll finds the new standalone
		];

		const events: ISSHEndpointSelectionRequest[] = [];
		disposables.add(service.onDidRequestEndpointSelection(r => events.push(r)));

		const result = await service.connect(makeConfig({ sshConfigHost: 'myhost', userInitiated: false }));

		assert.deepStrictEqual(events, [], 'silent reconnect must never fire an endpoint-selection request');
		assert.strictEqual(result.serverType, 'standalone');
		assert.strictEqual(result.instanceId, 'spawned-3');
		assert.strictEqual(result.lifecycle, 'managed');
		const execCalls = service.mockClients[0].execCalls;
		assert.ok(execCalls.some(c => c.includes('--new-instance')), `spawn must request a genuinely new instance; saw: ${JSON.stringify(execCalls)}`);
	});

	test('silent reconnect (userInitiated: false) reuses the single live standalone deterministically without a picker', async () => {
		service.execResponses = discoveryResponses([makeEndpoint({ type: 'standalone', pid: 1234, instanceId: 'inst-1' })]);

		const events: ISSHEndpointSelectionRequest[] = [];
		disposables.add(service.onDidRequestEndpointSelection(r => events.push(r)));

		const result = await service.connect(makeConfig({ sshConfigHost: 'myhost', userInitiated: false }));

		assert.deepStrictEqual(events, []);
		assert.strictEqual(result.serverType, 'standalone');
		assert.strictEqual(result.instanceId, 'inst-1');
		assert.strictEqual(result.lifecycle, 'external');
		assert.strictEqual(service.startCalled, 0);
	});

	test('silent reconnect (userInitiated: false) with multiple live standalones and an editor reuses the lowest instanceId deterministically without a picker', async () => {
		// Mixes an editor entry in on purpose: even with editors live, the
		// silent path must still skip the picker and prefer a standalone.
		const editor = makeEndpoint({ type: 'editor', pid: 300, instanceId: 'editor-1', endpoint: { type: 'socket', path: '/tmp/agent.sock' } });
		const s1 = makeEndpoint({ type: 'standalone', pid: 100, instanceId: 'inst-b' });
		const s2 = makeEndpoint({ type: 'standalone', pid: 200, instanceId: 'inst-a' });
		service.execResponses = discoveryResponses([editor, s1, s2]);

		const events: ISSHEndpointSelectionRequest[] = [];
		disposables.add(service.onDidRequestEndpointSelection(r => events.push(r)));

		const result = await service.connect(makeConfig({ sshConfigHost: 'myhost', userInitiated: false }));

		assert.deepStrictEqual(events, [], 'silent reconnect must never fire an endpoint-selection request, even with multiple candidates');
		assert.strictEqual(result.serverType, 'standalone');
		assert.strictEqual(result.instanceId, 'inst-a', 'must deterministically pick the lowest instanceId');
		assert.strictEqual(result.lifecycle, 'external');
		assert.strictEqual(service.startCalled, 0);
	});

	test('cold-start reconnect() via userInitiated=false param never prompts and reuses a live standalone (proves the reconnect() API, not just connect())', async () => {
		// Exercises reconnect() directly with no prior connect() call for this
		// key — the true "cold start" shape of the background auto-reconnect
		// call site in remoteAgentHost.contribution.ts, which has no existing
		// in-memory connection to fast-path off of.
		const editor = makeEndpoint({ type: 'editor', pid: 300, instanceId: 'editor-1', endpoint: { type: 'socket', path: '/tmp/agent.sock' } });
		const standalone = makeEndpoint({ type: 'standalone', pid: 400, instanceId: 'inst-c' });
		service.execResponses = discoveryResponses([editor, standalone]);
		service.resolvedConfigOverrides = { proxyJump: 'jumpserver' };

		const events: ISSHEndpointSelectionRequest[] = [];
		disposables.add(service.onDidRequestEndpointSelection(r => events.push(r)));

		const result = await service.reconnect('myhost', 'test-host', undefined, undefined, /* userInitiated */ false);

		assert.deepStrictEqual(events, [], 'cold-start silent reconnect() must never fire an endpoint-selection request');
		assert.strictEqual(result.serverType, 'standalone');
		assert.strictEqual(result.instanceId, 'inst-c');
		assert.strictEqual(result.lifecycle, 'external');
		assert.strictEqual(service.startCalled, 0);
		assert.strictEqual(service.lastConnectConfig?.proxyJump, 'jumpserver');
		assert.strictEqual(result.config.proxyJump, 'jumpserver');
	});

	test('cold-start reconnect() via userInitiated=true param still prompts when an editor entry exists', async () => {
		const editor = makeEndpoint({ type: 'editor', pid: 300, instanceId: 'editor-1', endpoint: { type: 'socket', path: '/tmp/agent.sock' } });
		service.execResponses = discoveryResponses([editor]);

		let seenCandidates: ISSHEndpointSelectionRequest | undefined;
		disposables.add(service.onDidRequestEndpointSelection(r => { seenCandidates = r; }));

		const result = await service.withEndpointSelectionResponse(
			{ kind: 'candidate', type: 'editor', pid: 300, instanceId: 'editor-1' },
			() => service.reconnect('myhost', 'test-host', undefined, undefined, /* userInitiated */ true),
		);

		assert.ok(seenCandidates, 'user-initiated reconnect() must still show the picker when an editor entry exists');
		assert.strictEqual(result.serverType, 'editor');
	});

	test('user-initiated reconnect (userInitiated: true) still prompts when an editor entry exists, contrasting with the silent path', async () => {
		const editor = makeEndpoint({ type: 'editor', pid: 300, instanceId: 'editor-1', endpoint: { type: 'socket', path: '/tmp/agent.sock' } });
		service.execResponses = discoveryResponses([editor]);

		let seenCandidates: ISSHEndpointSelectionRequest | undefined;
		disposables.add(service.onDidRequestEndpointSelection(r => { seenCandidates = r; }));

		const result = await service.withEndpointSelectionResponse(
			{ kind: 'candidate', type: 'editor', pid: 300, instanceId: 'editor-1' },
			() => service.connect(makeConfig({ sshConfigHost: 'myhost', userInitiated: true })),
		);

		assert.ok(seenCandidates, 'user-initiated connects must still show the picker when an editor entry exists');
		assert.strictEqual(result.serverType, 'editor');
		assert.strictEqual(result.instanceId, 'editor-1');
	});

	// --- Stored preference hint (`config.preferredAgentLocation`): a
	// renderer-derived `IRemoteAgentHostLocationPreferenceService` choice
	// threaded through `ISSHAgentHostConfig` so the main process can honor
	// it directly, without ever emitting an endpoint-selection request —
	// for both user-initiated and silent/background connects.

	test('stored "editor" preference selects the deterministic live editor without a request, even for a silent reconnect', async () => {
		const editorA = makeEndpoint({ type: 'editor', pid: 100, instanceId: 'editor-b', endpoint: { type: 'socket', path: '/tmp/a.sock' } });
		const editorB = makeEndpoint({ type: 'editor', pid: 200, instanceId: 'editor-a', endpoint: { type: 'socket', path: '/tmp/b.sock' } });
		const standalone = makeEndpoint({ type: 'standalone', pid: 300, instanceId: 'inst-c' });
		service.execResponses = discoveryResponses([editorA, editorB, standalone]);

		const events: ISSHEndpointSelectionRequest[] = [];
		disposables.add(service.onDidRequestEndpointSelection(r => events.push(r)));

		const result = await service.connect(makeConfig({ sshConfigHost: 'myhost', userInitiated: false, preferredAgentLocation: 'editor' }));

		assert.deepStrictEqual(events, [], 'a stored preference must never fire an endpoint-selection request');
		assert.strictEqual(result.serverType, 'editor');
		assert.strictEqual(result.instanceId, 'editor-a', 'must deterministically pick the lowest instanceId editor');
		assert.strictEqual(result.lifecycle, 'external');
	});

	test('stored "editor" preference with no live editor falls back to dedicated selection without a request', async () => {
		const s1 = makeEndpoint({ type: 'standalone', pid: 100, instanceId: 'inst-b' });
		const s2 = makeEndpoint({ type: 'standalone', pid: 200, instanceId: 'inst-a' });
		service.execResponses = discoveryResponses([s1, s2]);

		const events: ISSHEndpointSelectionRequest[] = [];
		disposables.add(service.onDidRequestEndpointSelection(r => events.push(r)));

		const result = await service.connect(makeConfig({ sshConfigHost: 'myhost', userInitiated: true, preferredAgentLocation: 'editor' }));

		assert.deepStrictEqual(events, [], 'unavailable-editor fallback must never fire an endpoint-selection request');
		assert.strictEqual(result.serverType, 'standalone');
		assert.strictEqual(result.instanceId, 'inst-a', 'must deterministically pick the lowest instanceId standalone');
		assert.strictEqual(result.lifecycle, 'external');
	});

	test('stored "editor" preference with nothing live spawns a new dedicated agent host without a request', async () => {
		const spawned = makeEndpoint({ type: 'standalone', pid: 999, instanceId: 'spawned-4' });
		service.execResponses = [
			...discoveryResponses([]),
			{ stdout: '', code: 0 },                                  // spawn command
			{ stdout: agentEndpointsStdout([spawned]), code: 0 },     // wait-poll finds the new standalone
		];

		const events: ISSHEndpointSelectionRequest[] = [];
		disposables.add(service.onDidRequestEndpointSelection(r => events.push(r)));

		const result = await service.connect(makeConfig({ sshConfigHost: 'myhost', userInitiated: false, preferredAgentLocation: 'editor' }));

		assert.deepStrictEqual(events, []);
		assert.strictEqual(result.serverType, 'standalone');
		assert.strictEqual(result.instanceId, 'spawned-4');
		assert.strictEqual(result.lifecycle, 'managed');
	});

	test('stored "dedicated" preference selects dedicated even when an editor is live, without a request', async () => {
		const editor = makeEndpoint({ type: 'editor', pid: 300, instanceId: 'editor-1', endpoint: { type: 'socket', path: '/tmp/agent.sock' } });
		const standalone = makeEndpoint({ type: 'standalone', pid: 400, instanceId: 'inst-c' });
		service.execResponses = discoveryResponses([editor, standalone]);

		const events: ISSHEndpointSelectionRequest[] = [];
		disposables.add(service.onDidRequestEndpointSelection(r => events.push(r)));

		const result = await service.connect(makeConfig({ sshConfigHost: 'myhost', userInitiated: true, preferredAgentLocation: 'dedicated' }));

		assert.deepStrictEqual(events, [], 'stored "dedicated" preference must never fire an endpoint-selection request, even user-initiated');
		assert.strictEqual(result.serverType, 'standalone');
		assert.strictEqual(result.instanceId, 'inst-c');
		assert.strictEqual(result.lifecycle, 'external');
		assert.strictEqual(service.startCalled, 0);
	});

	test('stored "dedicated" preference with nothing live spawns a new dedicated agent host without a request', async () => {
		const spawned = makeEndpoint({ type: 'standalone', pid: 999, instanceId: 'spawned-5' });
		service.execResponses = [
			...discoveryResponses([]),
			{ stdout: '', code: 0 },
			{ stdout: agentEndpointsStdout([spawned]), code: 0 },
		];

		const events: ISSHEndpointSelectionRequest[] = [];
		disposables.add(service.onDidRequestEndpointSelection(r => events.push(r)));

		const result = await service.connect(makeConfig({ sshConfigHost: 'myhost', userInitiated: true, preferredAgentLocation: 'dedicated' }));

		assert.deepStrictEqual(events, []);
		assert.strictEqual(result.serverType, 'standalone');
		assert.strictEqual(result.instanceId, 'spawned-5');
		assert.strictEqual(result.lifecycle, 'managed');
	});

	test('cold-start reconnect() threads preferredAgentLocation through to selectEndpoint and never prompts when a preference is stored', async () => {
		const editorA = makeEndpoint({ type: 'editor', pid: 100, instanceId: 'editor-b', endpoint: { type: 'socket', path: '/tmp/a.sock' } });
		const editorB = makeEndpoint({ type: 'editor', pid: 200, instanceId: 'editor-a', endpoint: { type: 'socket', path: '/tmp/b.sock' } });
		service.execResponses = discoveryResponses([editorA, editorB]);

		const events: ISSHEndpointSelectionRequest[] = [];
		disposables.add(service.onDidRequestEndpointSelection(r => events.push(r)));

		// userInitiated: true would normally still prompt when an editor is
		// live (see the contrasting test above) — a stored preference must
		// pre-empt that entirely.
		const result = await service.reconnect('myhost', 'test-host', undefined, undefined, /* userInitiated */ true, /* preferredAgentLocation */ 'editor');

		assert.deepStrictEqual(events, []);
		assert.strictEqual(result.serverType, 'editor');
		assert.strictEqual(result.instanceId, 'editor-a');
	});

	// --- Failure/race handling (requirement 7) ---

	test('relay failure to a selected endpoint rereads the registry once and throws, never silently promotes or spawns', async () => {
		service.execResponses = [
			...discoveryResponses([makeEndpoint({ type: 'standalone', pid: 1234, instanceId: 'inst-1' })]),
			{ stdout: agentEndpointsStdout([makeEndpoint({ type: 'standalone', pid: 1234, instanceId: 'inst-1' })]), code: 0 }, // diagnostic reread
		];
		service.relayResult = new Error('connection refused');

		await assert.rejects(
			() => service.connect(makeConfig({ sshConfigHost: 'myhost' })),
			/Failed to connect to the selected remote agent host/,
		);
		assert.strictEqual(service.startCalled, 0);
		assert.strictEqual(service.relayCalled, 1);
		// Exactly one reread `agent endpoints` call — no additional spawn/selection.
		const agentEndpointsCalls = service.mockClients[0].execCalls.filter(c => c.includes('agent endpoints'));
		assert.strictEqual(agentEndpointsCalls.length, 2);
	});

	test('does not retry when relay fails on a freshly spawned agent', async () => {
		const newEntry = makeEndpoint({ type: 'standalone', pid: 555, instanceId: 'spawned-1' });
		service.execResponses = [
			...discoveryResponses([]),
			{ stdout: '', code: 0 },
			{ stdout: agentEndpointsStdout([newEntry]), code: 0 },
			{ stdout: agentEndpointsStdout([newEntry]), code: 0 }, // diagnostic reread after relay failure
		];
		service.relayResult = new Error('connection refused');

		await assert.rejects(
			() => service.connect(makeConfig({ sshConfigHost: 'myhost' })),
			/connection refused/,
		);
		assert.strictEqual(service.startCalled, 0); // spawn happens via exec, not _startRemoteAgentHost
		assert.strictEqual(service.relayCalled, 1);
	});

	test('cleans up SSH client on error', async () => {
		service.execResponses = discoveryResponses([]);
		service.execResponses.push({ stdout: '', code: 0 }); // spawn command
		service.execResponses.push({ stdout: agentEndpointsStdout([makeEndpoint({ type: 'standalone', pid: 1, instanceId: 'i1' })]), code: 0 });
		service.execResponses.push({ stdout: agentEndpointsStdout([]), code: 0 }); // diagnostic reread

		service.relayResult = new Error('boom');

		await assert.rejects(() => service.connect(makeConfig({ sshConfigHost: 'myhost' })));

		// SSH client should have been ended in the catch block
		assert.strictEqual(service.mockClients[0].ended, true);
	});

	// --- Config sanitization / connection bookkeeping (override path; no discovery) ---

	test('sanitizes config in result (strips password and privateKeyPath)', async () => {
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
		const result = await service.connect(makeConfig({
			remoteAgentHostCommand: '/agent',
		}));

		// Disconnect
		await service.disconnect(result.connectionId);

		// Next connect should create a new connection
		service.startCalled = 0;

		const result2 = await service.connect(makeConfig({
			remoteAgentHostCommand: '/agent',
		}));
		assert.strictEqual(service.startCalled, 1);
		assert.strictEqual(result2.connectionId, result.connectionId);
	});

	test('fires onDidChangeConnections on connect and disconnect', async () => {
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

		const result = await service.connect(makeConfig({
			remoteAgentHostCommand: '/agent',
		}));

		await service.relaySend(result.connectionId, 'hello');
		await service.relaySend(result.connectionId, 'world');

		assert.deepStrictEqual(sentData, ['hello', 'world']);
	});

	test('relaySend to unknown connectionId is a no-op', async () => {
		await service.connect(makeConfig({ remoteAgentHostCommand: '/agent' }));

		// Should not throw
		await service.relaySend('nonexistent', 'data');
	});

	// --- Multiple independent connections ---

	test('connects to two different hosts independently', async () => {
		const r1 = await service.connect(makeConfig({
			host: '10.0.0.1', remoteAgentHostCommand: '/agent',
		}));

		const r2 = await service.connect(makeConfig({
			host: '10.0.0.2', remoteAgentHostCommand: '/agent',
		}));

		assert.notStrictEqual(r1.connectionId, r2.connectionId);
		assert.strictEqual(service.startCalled, 2);
		assert.strictEqual(service.relayCalled, 2);
	});

	test('disconnect one host does not affect the other', async () => {
		const r1 = await service.connect(makeConfig({
			host: '10.0.0.1', remoteAgentHostCommand: '/agent',
		}));

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
		const r1 = await service.connect(makeConfig({
			host: '10.0.0.1', remoteAgentHostCommand: '/agent',
		}));

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
		service.execResponses = discoveryResponses([makeEndpoint({ type: 'standalone', pid: 1234, instanceId: 'inst-1' })]);
		const r1 = await service.connect(makeConfig({ sshConfigHost: 'myhost' }));
		assert.strictEqual(service.mockClients.length, 1);

		await service.disconnect(r1.connectionId);

		service.execResponses = discoveryResponses([makeEndpoint({ type: 'standalone', pid: 1234, instanceId: 'inst-1' })]);

		const r2 = await service.reconnect('myhost', 'test-host');
		// Should have created a fresh SSH client (not reused the old one)
		assert.strictEqual(service.mockClients.length, 2);
		assert.strictEqual(r2.connectionId, r1.connectionId);
	});

	// --- Progress events ---

	test('fires progress events during connect', async () => {
		service.execResponses = discoveryResponses([makeEndpoint({ type: 'standalone', pid: 1234, instanceId: 'inst-1' })]);

		const progress: ISSHConnectProgress[] = [];
		disposables.add(service.onDidReportConnectProgress(p => progress.push(p)));

		await service.connect(makeConfig({ sshConfigHost: 'myhost' }));

		// Expect at least: SSH connecting, platform detection, CLI check, agent discovery, relay
		assert.ok(progress.length >= 3, `expected at least 3 progress events, got ${progress.length}`);
		assert.ok(progress.every(p => p.connectionKey === 'ssh:myhost'));
		assert.ok(progress.every(p => p.message.length > 0), 'all progress messages should be non-empty');
	});

	test('cancelling keyboard-interactive prompt rejects connect with cancellation', async () => {
		const kbiService = disposables.add(new KeyboardInteractiveConnectTestService(
			new NullLogService(),
			{
				_serviceBrand: undefined,
				quality,
				dataFolderName,
			} as IProductService,
			NullTelemetryService,
		));
		const request = new DeferredPromise<ISSHKeyboardInteractiveRequest>();
		disposables.add(kbiService.onDidRequestKeyboardInteractive(kbiRequest => request.complete(kbiRequest)));

		const connectPromise = kbiService.connectSSHForTest(makeConfig({ sshConfigHost: 'test-host' }));
		const kbiRequest = await request.p;
		await kbiService.respondKeyboardInteractive(kbiRequest.requestId, undefined);

		await assert.rejects(connectPromise, error => isCancellationError(error));
		assert.deepStrictEqual({
			ended: kbiService.client.ended,
			finishResponses: kbiService.client.finishResponses,
		}, {
			ended: true,
			finishResponses: [],
		});
	});

	test('responding to keyboard-interactive prompt does not cancel connection attempt', async () => {
		let finished: readonly string[] | undefined;
		let cancelled = false;

		const requestId = service.startKeyboardInteractiveForTest([
			{ prompt: 'Password: ', echo: false },
		], responses => { finished = responses; }, () => { cancelled = true; });

		await service.respondKeyboardInteractive(requestId, ['secret']);

		assert.deepStrictEqual({ finished, cancelled }, {
			finished: ['secret'],
			cancelled: false,
		});
	});

	// --- SSH client close triggers connection disposal ---

	test('SSH client close event disposes the connection', async () => {
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

	test('refreshes an installed CLI instead of downloading it directly', async () => {
		service.execResponses = discoveryResponses([makeEndpoint({ type: 'standalone', pid: 1234, instanceId: 'inst-1' })]);

		await service.connect(makeConfig({ sshConfigHost: 'myhost' }));

		const execCalls = service.mockClients[0].execCalls;
		assert.deepStrictEqual({
			refreshAttempted: execCalls.some(c => c.includes('code-insiders update')),
			downloadAttempted: execCalls.some(c => c.includes('curl') || c.includes('tar')),
		}, {
			refreshAttempted: true,
			downloadAttempted: false,
		});
	});

	test('downloads CLI when version check fails', async () => {
		service.execResponses = [
			{ stdout: 'Linux\n', code: 0 },       // uname -s
			{ stdout: 'x86_64\n', code: 0 },      // uname -m
			{ stdout: '', code: 127 },             // CLI --version fails (not found)
			{ stdout: '', code: 0 },               // curl | tar install
			{ stdout: agentEndpointsStdout([makeEndpoint({ type: 'standalone', pid: 1234, instanceId: 'inst-1' })]), code: 0 }, // agent endpoints
			{ stdout: '', code: 0 },                // kill -0 (alive)
		];

		await service.connect(makeConfig({ sshConfigHost: 'myhost' }));

		const execCalls = service.mockClients[0].execCalls;
		assert.ok(execCalls.some(c => c.includes('curl')),
			'should download CLI when not installed');
	});

	test('warns and reuses the installed CLI when refresh fails', async () => {
		const logService = new RecordingLogService();
		const productService: Pick<IProductService, '_serviceBrand' | 'quality' | 'dataFolderName'> = {
			_serviceBrand: undefined,
			quality,
			dataFolderName,
		};
		const loggingService = disposables.add(new TestableSSHRemoteAgentHostMainService(
			logService,
			productService as IProductService,
			NullTelemetryService,
		));
		loggingService.execResponses = [
			{ stdout: 'Linux\n', code: 0 },
			{ stdout: 'x86_64\n', code: 0 },
			{ stdout: '1.0.0\nupdate failed\n__vscode_cli_update_exit_code__:1\n', code: 0 },
			{ stdout: agentEndpointsStdout([makeEndpoint({ type: 'standalone', pid: 1234, instanceId: 'inst-1' })]), code: 0 },
			{ stdout: '', code: 0 },
		];

		await loggingService.connect(makeConfig({ sshConfigHost: 'myhost' }));

		assert.deepStrictEqual(logService.warnings, [
			'[SSHRemoteAgentHost] Desktop has no product commit; falling back to non-pinned CLI install at ~/.vscode-server-oss/code-insiders.',
			'[SSHRemoteAgentHost] Could not refresh the dev-build remote CLI at ~/.vscode-server-oss/code-insiders; reusing the existing executable: update exited 1',
		]);
	});

	test('logs connection failures in the shared service', async () => {
		const logService = new RecordingLogService();
		const productService: Pick<IProductService, '_serviceBrand' | 'quality' | 'dataFolderName'> = {
			_serviceBrand: undefined,
			quality,
			dataFolderName,
		};
		const loggingService = disposables.add(new TestableSSHRemoteAgentHostMainService(
			logService,
			productService as IProductService,
			NullTelemetryService,
		));
		loggingService.execResponses = [
			{ stdout: 'Linux\n', code: 0 },
			{ stdout: 'x86_64\n', code: 0 },
			{ stdout: '1.0.0\n', code: 0 },
			{ stdout: 'not json', code: 0 },
		];

		await assert.rejects(loggingService.connect(makeConfig({ sshConfigHost: 'myhost' })));

		assert.deepStrictEqual(logService.errors, [
			`[SSHRemoteAgentHost] Failed to connect to myhost 'agent endpoints' produced unparsable output (8 characters)`,
		]);
	});

	// --- Commit-pinned install flow (release builds with productService.commit) ---

	suite('commit-pinned install', () => {
		const commit = 'abcdef0123456789abcdef0123456789abcdef01';
		const cliBin = `~/.vscode-insiders/code-insiders-${commit}`;
		let pinnedService: TestableSSHRemoteAgentHostMainService;

		setup(() => {
			const logService = new NullLogService();
			const productService: Pick<IProductService, '_serviceBrand' | 'quality' | 'dataFolderName' | 'serverDataFolderName' | 'commit'> = {
				_serviceBrand: undefined,
				quality,
				dataFolderName,
				serverDataFolderName: '.vscode-insiders',
				commit,
			};
			pinnedService = new TestableSSHRemoteAgentHostMainService(
				logService,
				productService as IProductService,
				NullTelemetryService,
			);
			disposables.add(pinnedService);
		});

		const oneStandaloneEndpoints = () => agentEndpointsStdout([makeEndpoint({ type: 'standalone', pid: 1234, instanceId: 'inst-1' })]);

		test('always invokes cleanup of old commit-keyed CLIs', async () => {
			pinnedService.execResponses = [
				{ stdout: 'Linux\n', code: 0 },
				{ stdout: 'x86_64\n', code: 0 },
				{ stdout: '', code: 0 },               // test -x cliBin → present
				{ stdout: '', code: 0 },               // touch cliBin (refresh mtime on reuse)
				{ stdout: '', code: 0 },               // cleanup (runs after reuse decision)
				{ stdout: oneStandaloneEndpoints(), code: 0 }, // agent endpoints
				{ stdout: '', code: 0 },               // kill -0 (alive)
			];
			await pinnedService.connect(makeConfig({ sshConfigHost: 'myhost' }));

			const execCalls = pinnedService.mockClients[0].execCalls;
			// Retention snippet: `ls -1t ... | awk 'NR>5' | xargs rm`
			assert.ok(execCalls.some(c => /ls -1t .*code-insiders-/.test(c) && /awk\s+'NR>5'/.test(c)),
				`cleanup command should have run; saw: ${JSON.stringify(execCalls)}`);
		});

		test('reuses existing commit-keyed CLI without re-downloading', async () => {
			pinnedService.execResponses = [
				{ stdout: 'Linux\n', code: 0 },
				{ stdout: 'x86_64\n', code: 0 },
				{ stdout: '', code: 0 },               // test -x cliBin → 0 (present)
				{ stdout: '', code: 0 },               // touch cliBin
				{ stdout: '', code: 0 },               // cleanup
				{ stdout: oneStandaloneEndpoints(), code: 0 }, // agent endpoints
				{ stdout: '', code: 0 },               // kill -0 (alive)
			];

			await pinnedService.connect(makeConfig({ sshConfigHost: 'myhost' }));

			const execCalls = pinnedService.mockClients[0].execCalls;
			assert.ok(execCalls.some(c => c.includes(`test -x ${cliBin}`)),
				`should test for commit-keyed CLI; saw: ${JSON.stringify(execCalls)}`);
			assert.ok(!execCalls.some(c => c.includes('curl')),
				`should not download when commit-keyed CLI present; saw: ${JSON.stringify(execCalls)}`);
		});

		test('downloads from commit-pinned URL when CLI is missing', async () => {
			pinnedService.execResponses = [
				{ stdout: 'Linux\n', code: 0 },
				{ stdout: 'x86_64\n', code: 0 },
				{ stdout: '', code: 1 },               // test -x → missing
				{ stdout: '', code: 0 },               // mkdir+mktemp+curl|tar+mv+chmod+rm
				{ stdout: '1.0.0\n', code: 0 },       // <cliBin> --version validation
				{ stdout: '', code: 0 },               // cleanup (after successful install)
				{ stdout: oneStandaloneEndpoints(), code: 0 }, // agent endpoints
				{ stdout: '', code: 0 },               // kill -0 (alive)
			];

			await pinnedService.connect(makeConfig({ sshConfigHost: 'myhost' }));

			const execCalls = pinnedService.mockClients[0].execCalls;
			const installCall = execCalls.find(c => c.includes('curl'));
			assert.ok(installCall, `should have run curl install; saw: ${JSON.stringify(execCalls)}`);
			assert.ok(installCall!.includes(`commit:${commit}`),
				`install URL should be commit-pinned; got: ${installCall}`);
			assert.ok(installCall!.includes(`mv `) && installCall!.includes(cliBin),
				`install should atomic-mv into commit-keyed path; got: ${installCall}`);
		});

		test('falls back to any usable CLI when commit-pinned download fails', async () => {
			const fallbackBin = `~/.vscode-insiders/code-insiders-0000000000000000000000000000000000000000`;
			pinnedService.execResponses = [
				{ stdout: 'Linux\n', code: 0 },
				{ stdout: 'x86_64\n', code: 0 },
				{ stdout: '', code: 1 },               // test -x → missing
				{ stdout: '', code: 7 },               // install fails (curl exit 7)
				{ stdout: `${fallbackBin}\n`, code: 0 }, // fallback finder lists old commit-keyed
				{ stdout: '1.0.0\n', code: 0 },       // fallback --version succeeds
				{ stdout: oneStandaloneEndpoints(), code: 0 }, // agent endpoints
				{ stdout: '', code: 0 },               // kill -0 (alive)
			];

			await pinnedService.connect(makeConfig({ sshConfigHost: 'myhost' }));

			const execCalls = pinnedService.mockClients[0].execCalls;
			// Fallback finder snippet enumerates commit-keyed candidates by mtime.
			assert.ok(execCalls.some(c => /ls -1t .*code-insiders-/.test(c) && c.includes('.vscode-cli-insider/code-insiders')),
				`should have run fallback finder; saw: ${JSON.stringify(execCalls)}`);
			// Should have --version-validated the fallback candidate.
			assert.ok(execCalls.some(c => c.includes(`${fallbackBin} --version`)),
				`should --version-validate fallback; saw: ${JSON.stringify(execCalls)}`);
		});

		test('propagates install error when no fallback CLI exists', async () => {
			pinnedService.execResponses = [
				{ stdout: 'Linux\n', code: 0 },
				{ stdout: 'x86_64\n', code: 0 },
				{ stdout: '', code: 1 },               // test -x → missing
				{ stdout: '', code: 7 },               // install fails
				{ stdout: '', code: 0 },               // fallback finder returns nothing
			];

			await assert.rejects(pinnedService.connect(makeConfig({ sshConfigHost: 'myhost' })));
		});
	});

	// --- Connection key formats ---

	test('uses host:port as connection key without sshConfigHost', async () => {
		const result = await service.connect(makeConfig({
			host: '192.168.1.1',
			port: 2222,
			remoteAgentHostCommand: '/agent',
		}));
		assert.strictEqual(result.connectionId, 'testuser@192.168.1.1:2222');
	});

	test('defaults to port 22 in connection key', async () => {
		const result = await service.connect(makeConfig({
			host: '192.168.1.1',
			remoteAgentHostCommand: '/agent',
		}));
		assert.strictEqual(result.connectionId, 'testuser@192.168.1.1:22');
	});

	// --- Reconnect preserves connection token from initial connect ---

	test('reconnect preserves connection token and address', async () => {
		service.execResponses = discoveryResponses([makeEndpoint({ type: 'standalone', pid: 1234, instanceId: 'inst-1' })]);

		const original = await service.connect(makeConfig({ sshConfigHost: 'myhost' }));

		const reconnected = await service.reconnect('myhost', 'new-name');
		assert.strictEqual(reconnected.connectionToken, original.connectionToken);
		assert.strictEqual(reconnected.address, original.address);
		assert.strictEqual(reconnected.connectionId, original.connectionId);
	});

	// --- Relay messages from superseded relay are still routed (not gated) ---

	test('messages from superseded relay still arrive (only close is suppressed)', async () => {
		service.execResponses = discoveryResponses([makeEndpoint({ type: 'standalone', pid: 1234, instanceId: 'inst-1' })]);

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
		service.execResponses = discoveryResponses([makeEndpoint({ type: 'standalone', pid: 1234, instanceId: 'inst-1' })]);

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

	test('reconnect rejects with timeout when relay creation hangs (silently dead SSH client)', async () => {
		// Repro for: after a silent network drop, the SSH client's TCP is
		// half-open but ssh2 hasn't seen 'close' yet. Reusing it for a fresh
		// relay calls forwardOut, whose callback never fires. Without a
		// timeout the whole connect() call hangs forever, so the renderer
		// never sees a rejection and never retries — even after a window
		// reload, since the shared-process state survives.
		service.execResponses = discoveryResponses([makeEndpoint({ type: 'standalone', pid: 1234, instanceId: 'inst-1' })]);

		await service.connect(makeConfig({ sshConfigHost: 'myhost' }));
		const originalClient = service.mockClients[0];
		assert.strictEqual(originalClient.ended, false);

		// Use a short timeout so the test completes quickly.
		service.setRelayCreationTimeoutForTest(50);
		// Make the *reconnect* call's relay creation hang (the second relay).
		service.hangRelayCreationOnCall = 2;

		const closeEvents: string[] = [];
		disposables.add(service.onDidCloseConnection(id => closeEvents.push(id)));

		await assert.rejects(
			() => service.reconnect('myhost', 'test-host'),
			/timed out|timeout/i,
			'reconnect should reject (with a timeout error) instead of hanging when relay creation never settles'
		);

		// SSH client should have been ended so subsequent reconnect attempts
		// don't keep reusing the dead client. After this, the entry is also
		// removed from `_connections` so a fresh reconnect path runs.
		assert.strictEqual(originalClient.ended, true, 'dead SSH client should be ended');
		// Close event should have fired so the renderer's contribution sees
		// the reconnect attempt resolved (even as a failure) and can retry.
		assert.deepStrictEqual(closeEvents, ['ssh:myhost']);
	});

	// --- Reconnect cleans up old SSH client listeners ---

	test('reconnect removes old close/error listeners from shared SSH client', async () => {
		service.execResponses = discoveryResponses([makeEndpoint({ type: 'standalone', pid: 1234, instanceId: 'inst-1' })]);

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
 * Subclass that exposes `_buildAuthAttempts` and stubs out the disk/env seams
 * so the auth-attempt building logic can be tested in isolation.
 */
class AuthAttemptsTestService extends SSHRemoteAgentHostMainService {

	agentSock: string | undefined = undefined;
	keyFiles: Map<string, Buffer> = new Map();

	async testBuildAuthAttempts(config: ISSHAgentHostConfig): Promise<SSHAuthAttempt[]> {
		return this._buildAuthAttempts(config);
	}

	protected override _isAgentAvailable(): string | undefined {
		return this.agentSock;
	}

	protected override async _readKeyFileIfExists(keyPath: string): Promise<Buffer | undefined> {
		return this.keyFiles.get(keyPath);
	}
}

suite('SSHRemoteAgentHostMainService - _buildAuthAttempts', () => {

	const disposables = new DisposableStore();
	let service: AuthAttemptsTestService;

	setup(() => {
		const logService = new NullLogService();
		const productService: Pick<IProductService, '_serviceBrand' | 'quality' | 'dataFolderName'> = {
			_serviceBrand: undefined,
			quality,
			dataFolderName,
		};
		service = new AuthAttemptsTestService(
			logService,
			productService as IProductService,
			NullTelemetryService,
		);
		disposables.add(service);
	});

	teardown(() => disposables.clear());

	ensureNoDisposablesAreLeakedInTestSuite();

	const RSA = Buffer.from('rsa-key-bytes');
	const ED = Buffer.from('ed25519-key-bytes');
	const EXPLICIT = Buffer.from('explicit-key-bytes');

	function sshString(value: string): Buffer {
		const valueBuffer = Buffer.from(value, 'utf8');
		const lengthBuffer = Buffer.alloc(4);
		lengthBuffer.writeUInt32BE(valueBuffer.length, 0);
		return Buffer.concat([lengthBuffer, valueBuffer]);
	}

	function openSSHPrivateKeyWithCipher(cipher: string): Buffer {
		const data = Buffer.concat([
			Buffer.from('openssh-key-v1\0', 'utf8'),
			sshString(cipher),
		]);
		return Buffer.from([
			'-----BEGIN OPENSSH PRIVATE KEY-----',
			data.toString('base64'),
			'-----END OPENSSH PRIVATE KEY-----',
		].join('\n'));
	}

	test('Agent + no SSH_AUTH_SOCK + only id_rsa exists → publickey id_rsa, then keyboard-interactive', async () => {
		service.agentSock = undefined;
		service.keyFiles.set('~/.ssh/id_rsa', RSA);

		const attempts = await service.testBuildAuthAttempts(makeConfig({ authMethod: SSHAuthMethod.Agent }));

		assert.deepStrictEqual(attempts, [
			{ type: 'publickey', username: 'testuser', key: RSA, keyPath: '~/.ssh/id_rsa' },
			{ type: 'keyboard-interactive', username: 'testuser' },
		]);
	});

	test('Agent + SSH_AUTH_SOCK + only id_rsa exists → agent then publickey id_rsa, then keyboard-interactive', async () => {
		// This is the regression-driving case: agent is set but doesn't have
		// the key, so we must still fall through to the on-disk default key.
		service.agentSock = '/tmp/ssh-agent.sock';
		service.keyFiles.set('~/.ssh/id_rsa', RSA);

		const attempts = await service.testBuildAuthAttempts(makeConfig({ authMethod: SSHAuthMethod.Agent }));

		assert.deepStrictEqual(attempts, [
			{ type: 'agent', username: 'testuser', agent: '/tmp/ssh-agent.sock' },
			{ type: 'publickey', username: 'testuser', key: RSA, keyPath: '~/.ssh/id_rsa' },
			{ type: 'keyboard-interactive', username: 'testuser' },
		]);
	});

	test('Agent + SSH_AUTH_SOCK + id_ed25519 and id_rsa exist → agent then both keys in default order, then keyboard-interactive', async () => {
		service.agentSock = '/tmp/ssh-agent.sock';
		service.keyFiles.set('~/.ssh/id_ed25519', ED);
		service.keyFiles.set('~/.ssh/id_rsa', RSA);

		const attempts = await service.testBuildAuthAttempts(makeConfig({ authMethod: SSHAuthMethod.Agent }));

		assert.deepStrictEqual(attempts, [
			{ type: 'agent', username: 'testuser', agent: '/tmp/ssh-agent.sock' },
			{ type: 'publickey', username: 'testuser', key: ED, keyPath: '~/.ssh/id_ed25519' },
			{ type: 'publickey', username: 'testuser', key: RSA, keyPath: '~/.ssh/id_rsa' },
			{ type: 'keyboard-interactive', username: 'testuser' },
		]);
	});

	test('Agent + SSH_AUTH_SOCK + no default keys → agent then keyboard-interactive', async () => {
		service.agentSock = '/tmp/ssh-agent.sock';

		const attempts = await service.testBuildAuthAttempts(makeConfig({ authMethod: SSHAuthMethod.Agent }));

		assert.deepStrictEqual(attempts, [
			{ type: 'agent', username: 'testuser', agent: '/tmp/ssh-agent.sock' },
			{ type: 'keyboard-interactive', username: 'testuser' },
		]);
	});

	test('Agent + IdentityAgent uses configured agent endpoint before default keys', async () => {
		service.agentSock = '/tmp/ssh-agent.sock';
		service.keyFiles.set('~/.ssh/id_rsa', RSA);

		const attempts = await service.testBuildAuthAttempts(makeConfig({
			authMethod: SSHAuthMethod.Agent,
			identityAgent: '//./pipe/pageant.user.1234',
		}));

		assert.deepStrictEqual(attempts, [
			{ type: 'agent', username: 'testuser', agent: '//./pipe/pageant.user.1234' },
			{ type: 'publickey', username: 'testuser', key: RSA, keyPath: '~/.ssh/id_rsa' },
			{ type: 'keyboard-interactive', username: 'testuser' },
		]);
	});

	test('Agent + IdentityAgent SSH_AUTH_SOCK uses the default agent endpoint', async () => {
		service.agentSock = '/tmp/ssh-agent.sock';

		const attempts = await service.testBuildAuthAttempts(makeConfig({
			authMethod: SSHAuthMethod.Agent,
			identityAgent: 'SSH_AUTH_SOCK',
		}));

		assert.deepStrictEqual(attempts, [
			{ type: 'agent', username: 'testuser', agent: '/tmp/ssh-agent.sock' },
			{ type: 'keyboard-interactive', username: 'testuser' },
		]);
	});

	test('Agent + IdentityAgent none disables the default SSH_AUTH_SOCK fallback', async () => {
		service.agentSock = '/tmp/ssh-agent.sock';

		const attempts = await service.testBuildAuthAttempts(makeConfig({
			authMethod: SSHAuthMethod.Agent,
			identityAgent: 'none',
		}));

		assert.deepStrictEqual(attempts, [
			{ type: 'keyboard-interactive', username: 'testuser' },
		]);
	});

	test('Agent + explicit privateKeyPath + SSH_AUTH_SOCK + id_rsa → agent first, then explicit, id_rsa, keyboard-interactive', async () => {
		service.agentSock = '/tmp/ssh-agent.sock';
		service.keyFiles.set('/some/explicit/key', EXPLICIT);
		service.keyFiles.set('~/.ssh/id_rsa', RSA);

		const attempts = await service.testBuildAuthAttempts(makeConfig({
			authMethod: SSHAuthMethod.Agent,
			privateKeyPath: '/some/explicit/key',
		}));

		assert.deepStrictEqual(attempts, [
			{ type: 'agent', username: 'testuser', agent: '/tmp/ssh-agent.sock' },
			{ type: 'publickey', username: 'testuser', key: EXPLICIT, keyPath: '/some/explicit/key' },
			{ type: 'publickey', username: 'testuser', key: RSA, keyPath: '~/.ssh/id_rsa' },
			{ type: 'keyboard-interactive', username: 'testuser' },
		]);
	});

	test('Agent + explicit privateKeyPath that matches a default → explicit added once, then keyboard-interactive', async () => {
		// When the user pins ~/.ssh/id_rsa explicitly, we shouldn't end up
		// with the same key twice in the queue.
		service.agentSock = undefined;
		service.keyFiles.set('~/.ssh/id_rsa', RSA);

		const attempts = await service.testBuildAuthAttempts(makeConfig({
			authMethod: SSHAuthMethod.Agent,
			privateKeyPath: '~/.ssh/id_rsa',
		}));

		assert.deepStrictEqual(attempts, [
			{ type: 'publickey', username: 'testuser', key: RSA, keyPath: '~/.ssh/id_rsa' },
			{ type: 'keyboard-interactive', username: 'testuser' },
		]);
	});

	test('Agent + explicit privateKeyPath as absolute default path → agent first, key added once', async () => {
		// Regression: `ssh -G` always returns absolute identity-file paths, so
		// /Users/<me>/.ssh/id_ed25519 must be recognized as a default and not
		// promoted to an explicit (encrypted) attempt that would fire a
		// passphrase prompt before the agent ever gets a chance.
		service.agentSock = '/tmp/ssh-agent.sock';
		service.keyFiles.set('~/.ssh/id_ed25519', ED);
		const absoluteDefault = `${os.homedir()}/.ssh/id_ed25519`;

		const attempts = await service.testBuildAuthAttempts(makeConfig({
			authMethod: SSHAuthMethod.Agent,
			privateKeyPath: absoluteDefault,
		}));

		assert.deepStrictEqual(attempts, [
			{ type: 'agent', username: 'testuser', agent: '/tmp/ssh-agent.sock' },
			{ type: 'publickey', username: 'testuser', key: ED, keyPath: '~/.ssh/id_ed25519' },
			{ type: 'keyboard-interactive', username: 'testuser' },
		]);
	});

	test('KeyFile + explicit path → publickey only', async () => {
		service.agentSock = '/tmp/ssh-agent.sock';
		service.keyFiles.set('/some/explicit/key', EXPLICIT);
		service.keyFiles.set('~/.ssh/id_rsa', RSA);

		const attempts = await service.testBuildAuthAttempts(makeConfig({
			authMethod: SSHAuthMethod.KeyFile,
			privateKeyPath: '/some/explicit/key',
		}));

		assert.deepStrictEqual(attempts, [
			{ type: 'publickey', username: 'testuser', key: EXPLICIT, keyPath: '/some/explicit/key' },
		]);
	});

	test('KeyFile + encrypted OpenSSH key marks attempt as encrypted', async () => {
		const encryptedKey = openSSHPrivateKeyWithCipher('aes256-ctr');
		service.keyFiles.set('/some/encrypted/key', encryptedKey);

		const attempts = await service.testBuildAuthAttempts(makeConfig({
			authMethod: SSHAuthMethod.KeyFile,
			privateKeyPath: '/some/encrypted/key',
		}));

		assert.deepStrictEqual(attempts, [
			{ type: 'publickey', username: 'testuser', key: encryptedKey, keyPath: '/some/encrypted/key', encrypted: true },
		]);
	});

	test('KeyFile + missing privateKeyPath throws', async () => {
		await assert.rejects(
			() => service.testBuildAuthAttempts(makeConfig({ authMethod: SSHAuthMethod.KeyFile })),
			/private key path/i,
		);
	});

	test('KeyFile + unreadable key throws with the path in the message', async () => {
		await assert.rejects(
			() => service.testBuildAuthAttempts(makeConfig({
				authMethod: SSHAuthMethod.KeyFile,
				privateKeyPath: '/missing/key',
			})),
			/\/missing\/key/,
		);
	});

	test('Password → password only', async () => {
		service.agentSock = '/tmp/ssh-agent.sock';
		service.keyFiles.set('~/.ssh/id_rsa', RSA);

		const attempts = await service.testBuildAuthAttempts(makeConfig({
			authMethod: SSHAuthMethod.Password,
			password: 'pw',
		}));

		assert.deepStrictEqual(attempts, [
			{ type: 'password', username: 'testuser', password: 'pw' },
		]);
	});
});

suite('SSHRemoteAgentHostMainService - makeAuthHandler', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const KEY = Buffer.from('k');
	const attempts: SSHAuthAttempt[] = [
		{ type: 'agent', username: 'u', agent: '/sock' },
		{ type: 'publickey', username: 'u', key: KEY, keyPath: '~/.ssh/id_rsa' },
	];

	test('walks attempts in order, then signals exhaustion', () => {
		const handler = makeAuthHandler(attempts, new NullLogService());
		const calls: Array<object | false> = [];
		handler(null, false, next => calls.push(next));
		handler(['publickey'], false, next => calls.push(next));
		handler(['publickey'], false, next => calls.push(next));

		assert.deepStrictEqual(calls, [
			{ type: 'agent', username: 'u', agent: '/sock' },
			{ type: 'publickey', username: 'u', key: KEY }, // keyPath stripped
			false,
		]);
	});

	test('skips attempts whose method the server has rejected', () => {
		const handler = makeAuthHandler(attempts, new NullLogService());
		const calls: Array<object | false> = [];
		// Server only allows password — both attempts should be skipped and
		// the handler should signal exhaustion immediately.
		handler(['password'], false, next => calls.push(next));

		assert.deepStrictEqual(calls, [false]);
	});

	test('agent attempts are kept when server allows publickey', () => {
		// `agent` is a publickey-flavored method; servers advertise `publickey`,
		// not `agent`, so the agent attempt must not be filtered out here.
		const handler = makeAuthHandler(
			[{ type: 'agent', username: 'u', agent: '/sock' }],
			new NullLogService(),
		);
		const calls: Array<object | false> = [];
		handler(['publickey'], false, next => calls.push(next));

		assert.deepStrictEqual(calls, [{ type: 'agent', username: 'u', agent: '/sock' }]);
	});

	test('keyboard-interactive routes prompts to the kbi handler and is skipped without one', () => {
		const kbiAttempts: SSHAuthAttempt[] = [
			{ type: 'keyboard-interactive', username: 'u' },
			{ type: 'publickey', username: 'u', key: KEY, keyPath: '~/.ssh/id_rsa' },
		];

		// Without a kbi handler the kbi attempt is skipped entirely.
		const handlerNoKbi = makeAuthHandler(kbiAttempts, new NullLogService());
		const callsNoKbi: Array<object | false> = [];
		handlerNoKbi(null, false, next => callsNoKbi.push(next));
		assert.deepStrictEqual(callsNoKbi, [{ type: 'publickey', username: 'u', key: KEY }]);

		// With a kbi handler we get an auth method whose `prompt` callback
		// forwards into the handler.
		let promptArgs: { name: string; instructions: string; prompts: ReadonlyArray<{ prompt: string; echo: boolean }> } | undefined;
		const handlerWithKbi = makeAuthHandler(kbiAttempts, new NullLogService(), (name, instructions, prompts, finish) => {
			promptArgs = { name, instructions, prompts };
			finish(['secret']);
		});
		const callsWithKbi: Array<{ type: string; username: string; prompt?: Function } | false> = [];
		handlerWithKbi(null, false, next => callsWithKbi.push(next as { type: string; username: string; prompt?: Function }));
		assert.strictEqual(callsWithKbi.length, 1);
		assert.strictEqual((callsWithKbi[0] as { type: string }).type, 'keyboard-interactive');
		const finishCalls: ReadonlyArray<string>[] = [];
		(callsWithKbi[0] as { prompt: Function }).prompt('n', 'i', 'lang', [{ prompt: 'Password:', echo: false }], (responses: ReadonlyArray<string>) => finishCalls.push(responses));
		assert.deepStrictEqual(promptArgs, { name: 'n', instructions: 'i', prompts: [{ prompt: 'Password:', echo: false }] });
		assert.deepStrictEqual(finishCalls, [['secret']]);
	});

	test('encrypted publickey requests passphrase and passes it to ssh2', () => {
		const encryptedAttempts: SSHAuthAttempt[] = [
			{ type: 'publickey', username: 'u', key: KEY, keyPath: '~/.ssh/id_rsa', encrypted: true },
		];

		const calls: Array<object | false> = [];
		const handler = makeAuthHandler(encryptedAttempts, new NullLogService(), undefined, (keyPath, finish) => {
			assert.strictEqual(keyPath, '~/.ssh/id_rsa');
			finish('passphrase');
		});

		handler(null, false, next => calls.push(next));

		assert.deepStrictEqual(calls, [
			{ type: 'publickey', username: 'u', key: KEY, passphrase: 'passphrase' },
		]);
	});
});
