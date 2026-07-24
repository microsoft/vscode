/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { IChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { AgentHostIpcChannelTransport } from '../../browser/agentHostIpcChannelTransport.js';

class FakeChannel extends Disposable implements IChannel {
	readonly frameEmitter = this._register(new Emitter<string>());
	readonly closeEmitter = this._register(new Emitter<void>());
	readonly calls: { command: string; arg: unknown }[] = [];
	connectResult: Promise<void> = Promise.resolve();
	sendResult: Promise<void> = Promise.resolve();

	call<T>(command: string, arg?: unknown): Promise<T> {
		this.calls.push({ command, arg });
		if (command === 'connect') {
			return this.connectResult as Promise<T>;
		}
		if (command === 'send') {
			return this.sendResult as Promise<T>;
		}
		return Promise.resolve(undefined as T);
	}

	listen<T>(event: string): Event<T> {
		if (event === 'frame') {
			return this.frameEmitter.event as Event<unknown> as Event<T>;
		}
		if (event === 'close') {
			return this.closeEmitter.event as Event<unknown> as Event<T>;
		}
		throw new Error(`Unknown event: ${event}`);
	}
}

suite('AgentHostIpcChannelTransport', () => {
	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	test('round-trips frames in both directions', async () => {
		const channel = ds.add(new FakeChannel());
		const transport = ds.add(new AgentHostIpcChannelTransport(channel));

		const received: unknown[] = [];
		ds.add(transport.onMessage(msg => received.push(msg)));

		let closed = 0;
		ds.add(transport.onClose(() => closed++));

		await transport.connect();
		assert.deepStrictEqual(channel.calls, [{ command: 'connect', arg: undefined }]);
		assert.strictEqual(transport.isOpen, true);

		// Inbound frame from server
		channel.frameEmitter.fire('{"jsonrpc":"2.0","id":1,"result":{}}');
		assert.deepStrictEqual(received, [{ jsonrpc: '2.0', id: 1, result: {} }]);

		// Outbound send is serialized to a string
		transport.send({ jsonrpc: '2.0', id: 2, result: {} });
		assert.deepStrictEqual(channel.calls.at(-1), {
			command: 'send',
			arg: '{"jsonrpc":"2.0","id":2,"result":{}}',
		});

		// Server-initiated close
		channel.closeEmitter.fire();
		assert.strictEqual(closed, 1);
		assert.strictEqual(transport.isOpen, false);
	});

	test('drops send when transport is not open', async () => {
		const channel = ds.add(new FakeChannel());
		const transport = ds.add(new AgentHostIpcChannelTransport(channel));

		let closed = 0;
		ds.add(transport.onClose(() => closed++));

		// send before connect → drops + forces close once
		transport.send({ jsonrpc: '2.0', id: 1, result: {} });
		assert.strictEqual(closed, 1);
		assert.strictEqual(channel.calls.find(c => c.command === 'send'), undefined);
	});
});
