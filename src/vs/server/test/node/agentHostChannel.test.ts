/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
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

	test('shares deferred endpoint resolution between renderer contexts', async () => {
		const ipc = ds.add(new FakeIPCServer());
		let resolveCount = 0;
		let resolveEndpoint!: (endpoint: IAgentHostUpstreamEndpoint) => void;
		const endpoint = new Promise<IAgentHostUpstreamEndpoint>(resolve => resolveEndpoint = resolve);
		const channel = ds.add(new AgentHostChannel<string>(
			ipc as unknown as IPCServer<string>,
			() => {
				resolveCount++;
				return endpoint;
			},
			new NullLogService(),
			() => ds.add(new FakeUpstream()),
		));

		const connect = Promise.all([
			channel.call('first', 'connect'),
			channel.call('second', 'connect'),
		]);
		await Promise.resolve();
		assert.strictEqual(resolveCount, 1);

		resolveEndpoint({ socketPath: 'agent-host.sock' });
		await connect;
	});

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
