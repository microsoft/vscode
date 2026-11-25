/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ChildProcess, spawn } from 'child_process';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import type { ConnectConfig } from 'ssh2';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { IProductService } from '../../../product/common/productService.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { parseSSHGOutput } from '../../common/sshConfigParsing.js';
import { SSHAuthMethod, SSHHostKeyDeniedError, type ISSHResolvedConfig } from '../../common/sshRemoteAgentHost.js';
import { createSSHProxyJump, rememberSSHProxyJump } from '../../node/sshProxyJump.js';
import { SSHRemoteAgentHostMainService } from '../../node/sshRemoteAgentHostService.js';

class JumpTestClient extends EventEmitter {
	config: ConnectConfig | undefined;
	failure: Error | undefined;
	emitClose = true;

	connect(config: ConnectConfig): void {
		this.config = config;
		config.sock?.on('error', error => this.emit('error', error));
		queueMicrotask(() => this.failure ? this.emit('error', this.failure) : this.emit('ready'));
	}

	end(): void {
		if (this.emitClose) {
			this.emit('close');
		}
	}

	exec(): this { throw new Error('Unexpected exec'); }
	forwardOut(): this { throw new Error('Unexpected forwarding'); }
}

class JumpTestService extends SSHRemoteAgentHostMainService {
	readonly client = new JumpTestClient();
	readonly children: ChildProcess[];
	readonly terminations: number[];
	startFailure = false;
	relayFailure = false;

	constructor() {
		const log = new NullLogService();
		const children: ChildProcess[] = [];
		const terminations: number[] = [];
		super(log, { quality: 'oss', dataFolderName: '.vscode-oss' } as IProductService, NullTelemetryService, {
			create: (resolved, target, logService) => createSSHProxyJump(resolved, target, logService, {
				resolveExecutable: async () => '/absolute/ssh',
				spawn: () => {
					const child = spawn(process.execPath, ['-e', 'process.stdin.pipe(process.stdout)'], {
						stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
					});
					children.push(child);
					return child;
				},
				terminate: async pid => {
					terminations.push(pid);
					children.find(child => child.pid === pid)?.kill();
				},
			}),
		});
		this.children = children;
		this.terminations = terminations;
	}

	override async resolveSSHConfig() {
		const stdout = 'hostname target.internal\nuser alice\nport 2200\nproxyjump jump:2222';
		return rememberSSHProxyJump(parseSSHGOutput(stdout), stdout);
	}

	protected override async _createSSHClient() {
		return this.client;
	}

	protected override async _buildAuthAttempts() {
		return [];
	}

	protected override async _startRemoteAgentHost() {
		if (this.startFailure) {
			throw new Error('Bootstrap failed');
		}
		const stream = new PassThrough();
		return {
			port: 1234, connectionToken: undefined, pid: undefined, stream: Object.assign(stream, {
				stderr: new PassThrough(),
				close: () => { stream.destroy(); },
			})
		};
	}

	protected override async _createWebSocketRelay() {
		if (this.relayFailure) {
			throw new Error('Relay failed');
		}
		return { send: () => { }, close: () => { } };
	}
}

suite('SSH ProxyJump service integration', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const config = {
		host: 'target.internal', username: 'alice', name: 'work', sshConfigHost: 'work',
		authMethod: SSHAuthMethod.Agent, remoteAgentHostCommand: '/agent',
	};

	test('keeps the proxy alive until the last independent relay lease is released', async () => {
		const service = store.add(new JumpTestService());
		const first = await service.connect(config);
		const second = await service.connect(config);
		await service.releaseRelay(first.connectionId);
		assert.strictEqual(service.terminations.length, 0);
		service.client.emitClose = false;
		await service.releaseRelay(second.connectionId);
		assert.deepStrictEqual({ children: service.children.length, killed: service.terminations }, {
			children: 1, killed: [service.children[0].pid],
		});
	});

	for (const phase of ['bootstrap', 'relay', 'authentication'] as const) {
		test(`terminates the jump after ${phase} fails even without an SSH close event`, async () => {
			const service = store.add(new JumpTestService());
			service.client.emitClose = false;
			service.startFailure = phase === 'bootstrap';
			service.relayFailure = phase === 'relay';
			if (phase === 'authentication') {
				service.client.failure = new Error('Authentication failed');
			}
			await assert.rejects(service.connect(config));
			assert.deepStrictEqual(service.terminations, [service.children[0].pid]);
		});
	}

	test('preserves host-key denial identity while cleaning up the jump helper', async () => {
		const service = store.add(new JumpTestService());
		service.client.failure = new SSHHostKeyDeniedError('work');
		await assert.rejects(service.connect(config), SSHHostKeyDeniedError);
		assert.deepStrictEqual(service.terminations, [service.children[0].pid]);
	});

	test('service disposal releases the owned helper', async () => {
		const service = store.add(new JumpTestService());
		await service.connect(config);
		service.client.emitClose = false;
		service.dispose();
		assert.deepStrictEqual(service.terminations, [service.children[0].pid]);
	});

	test('a resolved configuration crossing IPC cannot authorize a jump helper', async () => {
		const service = store.add(new JumpTestService());
		const channel = ProxyChannel.fromService(service, store.add(new DisposableStore()));
		const resolved = await channel.call<ISSHResolvedConfig>(undefined, 'resolveSSHConfig', ['work']);
		const received: ISSHResolvedConfig = JSON.parse(JSON.stringify(resolved));
		const proxy = await createSSHProxyJump(received, {
			host: config.host, originalHost: 'work', port: 2200, username: config.username,
		}, store.add(new NullLogService()), {
			resolveExecutable: async () => assert.fail('An IPC result must not authorize helper creation'),
		});
		const connected = await service.connect(config);
		assert.deepStrictEqual({
			received,
			proxy,
			trustedConnections: service.children.length,
		}, {
			received: {
				hostname: 'target.internal', user: 'alice', port: 2200,
				identityFile: [], forwardAgent: false, userKnownHostsFiles: [], globalKnownHostsFiles: [],
			},
			proxy: undefined,
			trustedConnections: 1,
		});
		await service.releaseRelay(connected.connectionId);
	});
});
