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
import { AgentHostChannel, IAgentHostUpstreamEndpoint, IUpstreamConnection, UnavailableAgentHostChannel } from '../../node/agentHostChannel.js';

class FakeUpstream extends Disposable implements IUpstreamConnection {
	private readonly _onFrame = this._register(new Emitter<string>());
	readonly onFrame: Event<string> = this._onFrame.event;

	private readonly _onClose = this._register(new Emitter<void>());
	readonly onClose: Event<void> = this._onClose.event;

	readonly sentFrames: string[] = [];
	connectResult: Promise<void> = Promise.resolve();
	connectCount = 0;
	disposed = false;
	private closeFired = false;

	async connect(): Promise<void> {
		this.connectCount++;
		await this.connectResult;
	}

	send(frame: string): void {
		this.sentFrames.push(frame);
	}

	fireFrame(text: string): void {
		this._onFrame.fire(text);
	}

	fireClose(): void {
		if (this.closeFired) {
			return;
		}
		this.closeFired = true;
		this._onClose.fire();
	}

	override dispose(): void {
		this.disposed = true;
		this.fireClose();
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

	test('resolves the endpoint only when connect is called', async () => {
		const ipc = ds.add(new FakeIPCServer());
		const resolvedEndpoints: IAgentHostUpstreamEndpoint[] = [];
		let resolveCount = 0;
		const channel = ds.add(new AgentHostChannel<string>(
			ipc as unknown as IPCServer<string>,
			async () => {
				resolveCount++;
				return { host: '127.0.0.1', port: '23456', connectionToken: 'token' };
			},
			new NullLogService(),
			endpoint => {
				resolvedEndpoints.push(endpoint);
				return ds.add(new FakeUpstream());
			},
		));

		ds.add(channel.listen<string>('a', 'frame')(() => undefined));
		assert.strictEqual(resolveCount, 0);

		await channel.call('a', 'connect');

		assert.deepStrictEqual({ resolveCount, resolvedEndpoints }, {
			resolveCount: 1,
			resolvedEndpoints: [{ host: '127.0.0.1', port: '23456', connectionToken: 'token' }],
		});
	});

	test('resolves a fresh endpoint after the upstream closes', async () => {
		const ipc = ds.add(new FakeIPCServer());
		const endpoints = [
			{ host: '127.0.0.1', port: '11111' },
			{ host: '127.0.0.1', port: '22222' },
		];
		const resolvedEndpoints: IAgentHostUpstreamEndpoint[] = [];
		const upstreams: FakeUpstream[] = [];
		let resolveCount = 0;
		const channel = ds.add(new AgentHostChannel<string>(
			ipc as unknown as IPCServer<string>,
			async () => endpoints[resolveCount++],
			new NullLogService(),
			endpoint => {
				resolvedEndpoints.push(endpoint);
				const upstream = ds.add(new FakeUpstream());
				upstreams.push(upstream);
				return upstream;
			},
		));

		ds.add(channel.listen<string>('a', 'frame')(() => undefined));
		await channel.call('a', 'connect');
		upstreams[0].fireClose();

		ds.add(channel.listen<string>('a', 'frame')(() => undefined));
		await channel.call('a', 'connect');

		assert.deepStrictEqual({ resolveCount, resolvedEndpoints }, {
			resolveCount: 2,
			resolvedEndpoints: endpoints,
		});
	});

	test('retries endpoint resolution after a failure', async () => {
		const ipc = ds.add(new FakeIPCServer());
		let resolveCount = 0;
		let factoryCount = 0;
		const channel = ds.add(new AgentHostChannel<string>(
			ipc as unknown as IPCServer<string>,
			async () => {
				if (resolveCount++ === 0) {
					throw new Error('no registered endpoint');
				}
				return { host: '127.0.0.1', port: '23456' };
			},
			new NullLogService(),
			() => {
				factoryCount++;
				return ds.add(new FakeUpstream());
			},
		));

		ds.add(channel.listen<string>('a', 'frame')(() => undefined));
		await assert.rejects(() => channel.call('a', 'connect'), /no registered endpoint/);

		ds.add(channel.listen<string>('a', 'frame')(() => undefined));
		await channel.call('a', 'connect');

		assert.deepStrictEqual({ resolveCount, factoryCount }, { resolveCount: 2, factoryCount: 1 });
	});

	test('does not create an upstream when disconnected during endpoint resolution', async () => {
		const ipc = ds.add(new FakeIPCServer());
		const endpoint = new DeferredPromise<IAgentHostUpstreamEndpoint>();
		let factoryCount = 0;
		const channel = ds.add(new AgentHostChannel<string>(
			ipc as unknown as IPCServer<string>,
			() => endpoint.p,
			new NullLogService(),
			() => {
				factoryCount++;
				return ds.add(new FakeUpstream());
			},
		));

		ds.add(channel.listen<string>('a', 'frame')(() => undefined));
		const connecting = channel.call('a', 'connect');
		ipc.fireRemove('a');
		endpoint.complete({ host: '127.0.0.1', port: '23456' });

		await assert.rejects(() => connecting, /disposed/);
		assert.strictEqual(factoryCount, 0);
	});

	test('accepts IPv6 loopback URLs and redacts tokens from connection errors', async () => {
		const ipc = ds.add(new FakeIPCServer());
		const token = 'secret-registry-token';
		const channel = ds.add(new AgentHostChannel<string>(
			ipc as unknown as IPCServer<string>,
			{ host: '::1', port: '0', connectionToken: token },
			new NullLogService(),
		));
		ds.add(channel.listen<string>('a', 'frame')(() => undefined));

		let error: unknown;
		try {
			await channel.call('a', 'connect');
		} catch (caught) {
			error = caught;
		}

		const message = error instanceof Error ? error.message : String(error);
		assert.deepStrictEqual({
			rejected: error !== undefined,
			invalidUrl: message.includes('Invalid URL'),
			containsToken: message.includes(token),
		}, {
			rejected: true,
			invalidUrl: false,
			containsToken: false,
		});
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
