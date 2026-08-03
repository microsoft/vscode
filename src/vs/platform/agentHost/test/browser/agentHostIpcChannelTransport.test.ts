/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { IChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentHostIpcChannelTransport } from '../../browser/agentHostIpcChannelTransport.js';
import { AhpJsonlLogger } from '../../common/ahpJsonlLogger.js';

class FakeChannel extends Disposable implements IChannel {
	readonly frameEmitter = this._register(new Emitter<string>());
	readonly closeEmitter = this._register(new Emitter<void>());
	readonly calls: { command: string; arg: unknown }[] = [];
	readonly listenCounts = { frame: 0, close: 0 };
	connectResult: Promise<void> = Promise.resolve();
	/** When set, drives each `call('connect')` (e.g. to reject transiently before resolving). */
	connectHandler: (() => Promise<void>) | undefined;
	sendResult: Promise<void> = Promise.resolve();

	call<T>(command: string, arg?: unknown): Promise<T> {
		this.calls.push({ command, arg });
		if (command === 'connect') {
			return (this.connectHandler ? this.connectHandler() : this.connectResult) as Promise<T>;
		}
		if (command === 'send') {
			return this.sendResult as Promise<T>;
		}
		return Promise.resolve(undefined as T);
	}

	listen<T>(event: string): Event<T> {
		if (event === 'frame') {
			this.listenCounts.frame++;
			return this.frameEmitter.event as Event<unknown> as Event<T>;
		}
		if (event === 'close') {
			this.listenCounts.close++;
			return this.closeEmitter.event as Event<unknown> as Event<T>;
		}
		throw new Error(`Unknown event: ${event}`);
	}
}

/** Builds the error the IPC ChannelServer sends for a call to a not-yet-registered channel. */
function unknownChannelError(): Error {
	const error = new Error(`Channel name 'agentHostProtocol' timed out after 1000ms`);
	error.name = 'Unknown channel';
	return error;
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

	test('retries a transient "Unknown channel" timeout until the host registers its channel', async () => {
		const channel = ds.add(new FakeChannel());
		let attempts = 0;
		channel.connectHandler = () => {
			attempts++;
			return attempts < 3 ? Promise.reject(unknownChannelError()) : Promise.resolve();
		};
		const transport = ds.add(new AgentHostIpcChannelTransport(channel, undefined, { sleep: () => Promise.resolve() }));

		await transport.connect();

		// Retried until the third attempt succeeded, and frame/close were
		// subscribed exactly once despite the retries.
		assert.deepStrictEqual(
			{ attempts, isOpen: transport.isOpen, listenCounts: channel.listenCounts },
			{ attempts: 3, isOpen: true, listenCounts: { frame: 1, close: 1 } },
		);
	});

	test('does not retry a non-transient connect error', async () => {
		const channel = ds.add(new FakeChannel());
		let attempts = 0;
		channel.connectHandler = () => { attempts++; return Promise.reject(new Error('boom')); };
		const transport = ds.add(new AgentHostIpcChannelTransport(channel, undefined, { sleep: () => Promise.resolve() }));

		await assert.rejects(() => transport.connect(), /boom/);
		assert.strictEqual(attempts, 1);
		assert.strictEqual(transport.isOpen, false);
	});

	test('gives up once the connect-retry budget is exhausted', async () => {
		const channel = ds.add(new FakeChannel());
		let attempts = 0;
		channel.connectHandler = () => { attempts++; return Promise.reject(unknownChannelError()); };
		const transport = ds.add(new AgentHostIpcChannelTransport(channel, undefined, { connectRetryBudgetMs: 0, sleep: () => Promise.resolve() }));

		await assert.rejects(() => transport.connect(), /Unknown channel/);
		assert.strictEqual(attempts, 1);
		assert.strictEqual(transport.isOpen, false);
	});

	test('bounds the retry budget even when a backoff overshoots the deadline', async () => {
		const channel = ds.add(new FakeChannel());
		let attempts = 0;
		channel.connectHandler = () => { attempts++; return Promise.reject(unknownChannelError()); };
		const sleeps: number[] = [];
		const transport = ds.add(new AgentHostIpcChannelTransport(channel, undefined, {
			connectRetryBudgetMs: 20,
			connectRetryInitialDelayMs: 10_000, // unclamped this would ignore the budget entirely
			sleep: ms => { sleeps.push(ms); return new Promise<void>(resolve => setTimeout(resolve, ms)); },
		}));

		await assert.rejects(() => transport.connect(), /Unknown channel/);

		// No attempt is issued past the deadline, and any backoff is clamped to the
		// remaining budget rather than the 10s initial delay.
		assert.strictEqual(attempts, 1);
		assert.ok(sleeps.every(ms => ms <= 20), `backoff should be clamped to the remaining budget, got ${JSON.stringify(sleeps)}`);
	});

	test('stops retrying once the transport is disposed', async () => {
		const channel = ds.add(new FakeChannel());
		let attempts = 0;
		channel.connectHandler = () => { attempts++; return Promise.reject(unknownChannelError()); };
		// A backoff the test controls, so we can dispose while it is pending.
		let releaseSleep!: () => void;
		const sleepGate = new Promise<void>(resolve => { releaseSleep = resolve; });
		const transport = new AgentHostIpcChannelTransport(channel, undefined, { sleep: () => sleepGate });

		const connectPromise = transport.connect();
		await Promise.resolve(); // let the first (rejected) connect attempt run
		transport.dispose();
		releaseSleep();

		await assert.rejects(() => connectPromise);
		assert.strictEqual(attempts, 1);
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

	test('logs real frames and redacts authentication tokens', async () => {
		const channel = ds.add(new FakeChannel());
		const fileService = ds.add(new FileService(new NullLogService()));
		ds.add(fileService.registerProvider('file', ds.add(new InMemoryFileSystemProvider())));
		const logger = ds.add(new AhpJsonlLogger(
			{ logsHome: URI.file('/logs'), connectionId: 'local-client', transport: 'local' },
			fileService,
			new NullLogService(),
		));
		const transport = ds.add(new AgentHostIpcChannelTransport(channel, logger));

		await transport.connect();
		transport.send({ jsonrpc: '2.0', id: 1, method: 'authenticate', params: { channel: 'ahp-root://', resource: 'https://example.com', token: 'secret-token' } });
		channel.frameEmitter.fire('{"jsonrpc":"2.0","id":1,"result":{}}');
		await logger.flush();

		const entries = (await fileService.readFile(logger.resource)).value.toString().split('\n').filter(Boolean).map(line => JSON.parse(line));
		assert.deepStrictEqual(entries.map(entry => ({
			id: entry.id,
			method: entry.method,
			params: entry.params,
			dir: entry._ahpLog.dir,
			byteLength: entry._ahpLog.byteLength,
		})), [
			{ id: 1, method: 'authenticate', params: { channel: 'ahp-root://', resource: 'https://example.com', token: '<redacted>' }, dir: 'c2s', byteLength: 139 },
			{ id: 1, method: undefined, params: undefined, dir: 's2c', byteLength: 36 },
		]);
	});
});
