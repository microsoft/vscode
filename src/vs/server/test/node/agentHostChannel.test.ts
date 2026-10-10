/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../base/common/async.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import type { Client, IPCServer } from '../../../base/parts/ipc/common/ipc.js';
import { NullLogService } from '../../../platform/log/common/log.js';
import type { IAgentHostIpcConnectionOptions } from '../../../platform/agentHost/common/agentService.js';
import { AgentHostChannel, IAgentHostUpstreamEndpoint, IUpstreamConnection, UnavailableAgentHostChannel } from '../../node/agentHostChannel.js';

class TestLogService extends NullLogService {
	readonly infos: string[] = [];

	override info(message: string, ...args: unknown[]): void {
		this.infos.push([message, ...args].join(' '));
	}
}

class FakeUpstream extends Disposable implements IUpstreamConnection {
	private readonly _onFrame = this._register(new Emitter<string>());
	readonly onFrame: Event<string> = this._onFrame.event;

	private readonly _onClose = this._register(new Emitter<void>());
	readonly onClose: Event<void> = this._onClose.event;

	readonly sentFrames: string[] = [];
	readonly connectOptions: (IAgentHostIpcConnectionOptions | undefined)[] = [];
	connectResult: Promise<void> = Promise.resolve();
	connectCount = 0;
	disposed = false;

	async connect(options?: IAgentHostIpcConnectionOptions): Promise<void> {
		this.connectCount++;
		this.connectOptions.push(options);
		await this.connectResult;
	}

	send(frame: string): void {
		this.sentFrames.push(frame);
	}

	fireFrame(text: string): void {
		this._onFrame.fire(text);
	}

	fireClose(): void {
		this._onClose.fire();
	}

	override dispose(): void {
		this.disposed = true;
		this._onClose.fire();
		super.dispose();
	}
}

class FakeIPCServer {
	private readonly _onDidRemoveConnection = new Emitter<Client<string>>();
	readonly onDidRemoveConnection: Event<Client<string>> = this._onDidRemoveConnection.event;

	fireRemove(ctx: string): void {
		this._onDidRemoveConnection.fire({ ctx });
	}

	dispose(): void {
		this._onDidRemoveConnection.dispose();
	}
}

suite('AgentHostChannel', () => {
	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	function createChannel(): { channel: AgentHostChannel<string>; upstreams: Map<string, FakeUpstream>; ipc: FakeIPCServer } {
		const ipc = ds.add(new FakeIPCServer());
		const upstreams = new Map<string, FakeUpstream>();
		// `ctx` is captured by id-keyed map so tests can fish out the upstream.
		let nextCtxId = 0;
		const factory = (_endpoint: IAgentHostUpstreamEndpoint): IUpstreamConnection => {
			const id = `upstream-${nextCtxId++}`;
			const up = ds.add(new FakeUpstream());
			upstreams.set(id, up);
			return up;
		};
		const channel = ds.add(new AgentHostChannel<string>(
			ipc as unknown as IPCServer<string>,
			{ host: 'localhost', port: '12345' },
			new NullLogService(),
			factory,
		));
		return { channel, upstreams, ipc };
	}

	test('routes frames between renderer and upstream per context', async () => {
		const { channel, upstreams } = createChannel();

		// Subscribe ctxA's frame event (forces creation of its upstream).
		const ctxAFrames: string[] = [];
		ds.add(channel.listen<string>('a', 'frame')(f => ctxAFrames.push(f)));

		const ctxBFrames: string[] = [];
		ds.add(channel.listen<string>('b', 'frame')(f => ctxBFrames.push(f)));

		await channel.call('a', 'connect');
		await channel.call('b', 'connect');

		const upA = upstreams.get('upstream-0')!;
		const upB = upstreams.get('upstream-1')!;

		assert.strictEqual(upA.connectCount, 1);
		assert.strictEqual(upB.connectCount, 1);

		upA.fireFrame('frameA');
		upB.fireFrame('frameB');
		assert.deepStrictEqual(ctxAFrames, ['frameA']);
		assert.deepStrictEqual(ctxBFrames, ['frameB']);

		await channel.call('a', 'send', 'outA');
		assert.deepStrictEqual(upA.sentFrames, ['outA']);
		assert.deepStrictEqual(upB.sentFrames, []);
	});

	test('closes upstream when renderer client disconnects', async () => {
		const { channel, upstreams, ipc } = createChannel();

		let closed = 0;
		ds.add(channel.listen<void>('a', 'close')(() => closed++));
		await channel.call('a', 'connect');

		const upA = upstreams.get('upstream-0')!;
		assert.strictEqual(upA.disposed, false);

		ipc.fireRemove('a');

		assert.strictEqual(upA.disposed, true);
		assert.strictEqual(closed, 1);
	});

	test('resolves a deferred endpoint only when connecting', async () => {
		const ipc = ds.add(new FakeIPCServer());
		let resolveCount = 0;
		const channel = ds.add(new AgentHostChannel<string>(
			ipc as unknown as IPCServer<string>,
			async () => {
				resolveCount++;
				return { socketPath: 'agent-host.sock' };
			},
			new NullLogService(),
			() => ds.add(new FakeUpstream()),
		));

		channel.listen('renderer', 'frame');
		assert.strictEqual(resolveCount, 0);

		await channel.call('renderer', 'connect');
		assert.strictEqual(resolveCount, 1);
	});

	test('passes the resolver environment to the server-owned launch on each connection', async () => {
		const ipc = ds.add(new FakeIPCServer());
		const options: (IAgentHostIpcConnectionOptions | undefined)[] = [];
		const channel = ds.add(new AgentHostChannel<string>(
			ipc as unknown as IPCServer<string>,
			async connectionOptions => {
				options.push(connectionOptions);
				return { socketPath: 'agent-host.sock' };
			},
			new NullLogService(),
			() => ds.add(new FakeUpstream()),
		));
		channel.listen('first', 'frame');
		const beforeConnect = options.length;
		await channel.call('first', 'connect', {
			env: { GITHUB_TOKEN: 'codespace-token', GH_TOKEN: null, EMPTY: '' },
			debugEnv: { Github_Token: 'debug-token' },
		});
		await channel.call('second', 'connect', { env: { GITHUB_TOKEN: 'refreshed-codespace-token' } });
		await channel.call('third', 'connect');

		assert.deepStrictEqual({ beforeConnect, options }, {
			beforeConnect: 0,
			options: [
				{ env: { GITHUB_TOKEN: 'codespace-token', GH_TOKEN: null, EMPTY: '' }, debugEnv: { Github_Token: 'debug-token' } },
				{ env: { GITHUB_TOKEN: 'refreshed-codespace-token' } },
				undefined,
			],
		});
	});

	test('does not forward the resolver environment to an externally managed upstream', async () => {
		const { channel, upstreams } = createChannel();
		await channel.call('renderer', 'connect', { env: { GITHUB_TOKEN: 'codespace-token' }, debugEnv: { GITHUB_TOKEN: 'debug-token' } });

		assert.deepStrictEqual(upstreams.get('upstream-0')!.connectOptions, [undefined]);
	});

	test('rejects malformed connection environments before starting the host', async () => {
		const ipc = ds.add(new FakeIPCServer());
		let resolveCount = 0;
		const channel = ds.add(new AgentHostChannel<string>(
			ipc as unknown as IPCServer<string>,
			async () => {
				resolveCount++;
				return { socketPath: 'agent-host.sock' };
			},
			new NullLogService(),
			() => ds.add(new FakeUpstream()),
		));

		for (const options of [null, [], 'secret', { env: null }, { env: [] }, { env: 'secret' }, { env: { GITHUB_TOKEN: 123 } }, { debugEnv: null }, { debugEnv: [] }, { debugEnv: 'secret' }, { debugEnv: { GITHUB_TOKEN: 123 } }]) {
			await assert.rejects(channel.call('renderer', 'connect', options), /Invalid agent host connection environment/);
		}
		assert.strictEqual(resolveCount, 0);
	});

	test('does not log the upstream connection token', async () => {
		const ipc = ds.add(new FakeIPCServer());
		const logService = new TestLogService();
		const channel = ds.add(new AgentHostChannel<string>(
			ipc as unknown as IPCServer<string>,
			{ host: 'localhost', port: '12345', connectionToken: 'secret-token' },
			logService,
			() => ds.add(new FakeUpstream()),
		));

		channel.listen('renderer', 'frame');
		assert.deepStrictEqual(logService.infos, []);

		await channel.call('renderer', 'connect', { env: { GITHUB_TOKEN: 'secret-environment-token' } });

		assert.deepStrictEqual(logService.infos, [
			'[AgentHostChannel] Renderer ctx=renderer requested connect to upstream',
			'[AgentHostChannel] Opening upstream to localhost:12345',
		]);
	});

	for (const initialToken of [undefined, 'stale-codespace-token']) {
		test(`applies concurrent renderer environments when the first token is ${initialToken ? 'stale' : 'absent'}`, async () => {
			const ipc = ds.add(new FakeIPCServer());
			const endpoint = new DeferredPromise<IAgentHostUpstreamEndpoint>();
			const environments: IAgentHostIpcConnectionOptions['env'][] = [];
			let upstreamCount = 0;
			const channel = ds.add(new AgentHostChannel<string>(
				ipc as unknown as IPCServer<string>,
				options => {
					environments.push(options?.env);
					return endpoint.p;
				},
				new NullLogService(),
				() => {
					upstreamCount++;
					return ds.add(new FakeUpstream());
				},
			));
			const initialOptions = initialToken ? { env: { GITHUB_TOKEN: initialToken } } : undefined;
			const refreshedEnvironment = { GITHUB_TOKEN: 'refreshed-codespace-token', GH_TOKEN: null, EMPTY: '' };
			const connect = Promise.all([
				channel.call('editor', 'connect', initialOptions),
				channel.call('agents', 'connect', { env: refreshedEnvironment }),
			]);
			await Promise.resolve();
			const beforeReady = { environments: [...environments], upstreamCount };

			await endpoint.complete({ socketPath: 'agent-host.sock' });
			await connect;

			assert.deepStrictEqual({ beforeReady, upstreamCount }, {
				beforeReady: { environments: [initialOptions?.env, refreshedEnvironment], upstreamCount: 0 },
				upstreamCount: 2,
			});
		});
	}

	test('surfaces deferred endpoint resolution failures and allows retry', async () => {
		const ipc = ds.add(new FakeIPCServer());
		let resolveCount = 0;
		const channel = ds.add(new AgentHostChannel<string>(
			ipc as unknown as IPCServer<string>,
			async () => {
				resolveCount++;
				if (resolveCount === 1) {
					throw new Error('agent host did not start');
				}
				return { socketPath: 'agent-host.sock' };
			},
			new NullLogService(),
			() => ds.add(new FakeUpstream()),
		));

		await assert.rejects(() => channel.call('renderer', 'connect'), /agent host did not start/);
		await assert.doesNotReject(() => channel.call('renderer', 'connect'));
		assert.strictEqual(resolveCount, 2);
	});

	test('re-resolves the endpoint for later connections', async () => {
		const ipc = ds.add(new FakeIPCServer());
		let resolveCount = 0;
		const channel = ds.add(new AgentHostChannel<string>(
			ipc as unknown as IPCServer<string>,
			async () => {
				resolveCount++;
				return { socketPath: 'agent-host.sock' };
			},
			new NullLogService(),
			() => ds.add(new FakeUpstream()),
		));

		await channel.call('first', 'connect');
		await channel.call('second', 'connect');

		// Resolution is `ensureStarted()` in the lazy server path, so a later
		// connection must be able to restart a host that has since died.
		assert.strictEqual(resolveCount, 2);
	});
});

suite('UnavailableAgentHostChannel', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('rejects connect without reporting an unknown IPC channel', async () => {
		const channel = new UnavailableAgentHostChannel<string>();

		assert.doesNotThrow(() => channel.listen('renderer1', 'frame'));
		assert.doesNotThrow(() => channel.listen('renderer1', 'close'));
		await assert.rejects(() => channel.call('renderer1', 'connect'), /Agent host proxy is not available/);
		await assert.doesNotReject(() => channel.call('renderer1', 'send'));
		await assert.doesNotReject(() => channel.call('renderer1', 'close'));
	});
});
