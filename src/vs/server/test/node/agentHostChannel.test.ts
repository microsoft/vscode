/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import type { Client, IPCServer } from '../../../base/parts/ipc/common/ipc.js';
import { NullLogService } from '../../../platform/log/common/log.js';
import { AgentHostChannel, IAgentHostUpstreamEndpoint, IUpstreamConnection } from '../../node/agentHostChannel.js';
import { IServerLifetimeService } from '../../node/serverLifetimeService.js';

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

class StubServerLifetimeService implements IServerLifetimeService {
	declare readonly _serviceBrand: undefined;
	get hasActiveConsumers(): boolean { return false; }
	active(_consumer: string) { return toDisposable(() => { }); }
	delay(): void { }
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
			new StubServerLifetimeService(),
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
});
