/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { IMessagePassingProtocol, IPCServer, ClientConnectionEvent, IPCClient, IChannel } from 'vs/base/parts/ipc/node/ipc';
import { Emitter, toNativePromise, Event } from 'vs/base/common/event';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { canceled } from 'vs/base/common/errors';
import { timeout } from 'vs/base/common/async';

class QueueProtocol implements IMessagePassingProtocol {

	private buffering = true;
	private buffers: Buffer[] = [];

	private _onMessage = new Emitter<Buffer>({
		onFirstListenerDidAdd: () => {
			for (const buffer of this.buffers) {
				this._onMessage.fire(buffer);
			}

			this.buffers = [];
			this.buffering = false;
		},
		onLastListenerRemove: () => {
			this.buffering = true;
		}
	});

	readonly onMessage = this._onMessage.event;
	other: QueueProtocol;

	send(buffer: Buffer): void {
		this.other.receive(buffer);
	}

	protected receive(buffer: Buffer): void {
		if (this.buffering) {
			this.buffers.push(buffer);
		} else {
			this._onMessage.fire(buffer);
		}
	}
}

function createProtocolPair(): [IMessagePassingProtocol, IMessagePassingProtocol] {
	const one = new QueueProtocol();
	const other = new QueueProtocol();
	one.other = other;
	other.other = one;

	return [one, other];
}

class TestIPCClient extends IPCClient {

	private _onDidDisconnect = new Emitter<void>();
	readonly onDidDisconnect = this._onDidDisconnect.event;

	constructor(protocol: IMessagePassingProtocol, id: string) {
		super(protocol, id);
	}

	dispose(): void {
		this._onDidDisconnect.fire();
		super.dispose();
	}
}

class TestIPCServer extends IPCServer {

	private onDidClientConnect: Emitter<ClientConnectionEvent>;

	constructor() {
		const onDidClientConnect = new Emitter<ClientConnectionEvent>();
		super(onDidClientConnect.event);
		this.onDidClientConnect = onDidClientConnect;
	}

	createConnection(id: string): IPCClient {
		const [pc, ps] = createProtocolPair();
		const client = new TestIPCClient(pc, id);

		this.onDidClientConnect.fire({
			protocol: ps,
			onDidClientDisconnect: client.onDidDisconnect
		});

		return client;
	}
}

const TestChannelId = 'testchannel';

interface ITestService {
	marco(): Thenable<string>;
	error(message: string): Thenable<void>;
	neverComplete(): Thenable<void>;
	neverCompleteCT(cancellationToken: CancellationToken): Thenable<void>;

	pong: Event<string>;
}

class TestService implements ITestService {

	private _pong = new Emitter<string>();
	readonly pong = this._pong.event;

	marco(): Thenable<string> {
		return Promise.resolve('polo');
	}

	error(message: string): Thenable<void> {
		return Promise.reject(new Error(message));
	}

	neverComplete(): Thenable<void> {
		return new Promise(_ => { });
	}

	neverCompleteCT(cancellationToken: CancellationToken): Thenable<void> {
		if (cancellationToken.isCancellationRequested) {
			return Promise.reject(canceled());
		}

		return new Promise((_, e) => cancellationToken.onCancellationRequested(() => e(canceled())));
	}

	ping(msg: string): void {
		this._pong.fire(msg);
	}
}

interface ITestChannel extends IChannel {
	call(command: 'marco'): Thenable<string>;
	call(command: 'error'): Thenable<void>;
	call(command: 'neverComplete'): Thenable<void>;
	call(command: 'neverCompleteCT', arg: undefined, cancellationToken: CancellationToken): Thenable<void>;
	call<T>(command: string, arg?: any, cancellationToken?: CancellationToken): Thenable<T>;

	listen(event: 'pong'): Event<string>;
	listen<T>(event: string, arg?: any): Event<T>;
}

class TestChannel implements ITestChannel {

	constructor(private service: ITestService) { }

	call(command: string, arg?: any, cancellationToken?: CancellationToken): Thenable<any> {
		switch (command) {
			case 'marco': return this.service.marco();
			case 'error': return this.service.error(arg);
			case 'neverComplete': return this.service.neverComplete();
			case 'neverCompleteCT': return this.service.neverCompleteCT(cancellationToken);
			default: return Promise.reject(new Error('not implemented'));
		}
	}

	listen(event: string, arg?: any): Event<any> {
		switch (event) {
			case 'pong': return this.service.pong;
			default: throw new Error('not implemented');
		}
	}
}

class TestChannelClient implements ITestService {

	get pong(): Event<string> {
		return this.channel.listen('pong');
	}

	constructor(private channel: ITestChannel) { }

	marco(): Thenable<string> {
		return this.channel.call('marco');
	}

	error(message: string): Thenable<void> {
		return this.channel.call('error', message);
	}

	neverComplete(): Thenable<void> {
		return this.channel.call('neverComplete');
	}

	neverCompleteCT(cancellationToken: CancellationToken): Thenable<void> {
		return this.channel.call('neverCompleteCT', undefined, cancellationToken);
	}
}

suite('Base IPC', function () {

	test('createProtocolPair', async function () {
		const [clientProtocol, serverProtocol] = createProtocolPair();

		const b1 = Buffer.alloc(0);
		clientProtocol.send(b1);

		const b3 = Buffer.alloc(0);
		serverProtocol.send(b3);

		const b2 = await toNativePromise(serverProtocol.onMessage);
		const b4 = await toNativePromise(clientProtocol.onMessage);

		assert.strictEqual(b1, b2);
		assert.strictEqual(b3, b4);
	});

	suite('one to one', function () {
		let server: IPCServer;
		let client: IPCClient;
		let service: TestService;
		let ipcService: ITestService;

		setup(function () {
			service = new TestService();
			const testServer = new TestIPCServer();
			server = testServer;

			server.registerChannel(TestChannelId, new TestChannel(service));

			client = testServer.createConnection('client1');
			ipcService = new TestChannelClient(client.getChannel(TestChannelId));
		});

		teardown(function () {
			client.dispose();
			server.dispose();
		});

		test('call success', async function () {
			const r = await ipcService.marco();
			return assert.equal(r, 'polo');
		});

		test('call error', async function () {
			try {
				await ipcService.error('nice error');
				return assert.fail('should not reach here');
			} catch (err) {
				return assert.equal(err.message, 'nice error');
			}
		});

		test('cancel call with cancelled cancellation token', async function () {
			try {
				await ipcService.neverCompleteCT(CancellationToken.Cancelled);
				return assert.fail('should not reach here');
			} catch (err) {
				return assert(err.message === 'Canceled');
			}
		});

		test('cancel call with cancellation token (sync)', function () {
			const cts = new CancellationTokenSource();
			const promise = ipcService.neverCompleteCT(cts.token).then(
				_ => assert.fail('should not reach here'),
				err => assert(err.message === 'Canceled')
			);

			cts.cancel();

			return promise;
		});

		test('cancel call with cancellation token (async)', function () {
			const cts = new CancellationTokenSource();
			const promise = ipcService.neverCompleteCT(cts.token).then(
				_ => assert.fail('should not reach here'),
				err => assert(err.message === 'Canceled')
			);

			setTimeout(() => cts.cancel());

			return promise;
		});

		test('listen to events', async function () {
			const messages: string[] = [];

			ipcService.pong(msg => messages.push(msg));
			await timeout(0);

			assert.deepEqual(messages, []);
			service.ping('hello');
			await timeout(0);

			assert.deepEqual(messages, ['hello']);
			service.ping('world');
			await timeout(0);

			assert.deepEqual(messages, ['hello', 'world']);
		});
	});
});
