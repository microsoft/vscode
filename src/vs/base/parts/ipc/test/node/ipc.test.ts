/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { IMessagePassingProtocol, IPCServer, ClientConnectionEvent, IPCClient, IChannel } from 'vs/base/parts/ipc/node/ipc';
import { Emitter, toNativePromise, Event } from 'vs/base/common/event';
import { TPromise } from 'vs/base/common/winjs.base';
import { CancellationToken } from 'vs/base/common/cancellation';

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
	marco(): TPromise<string>;
	error(message: string): TPromise<void>;
}

class TestService implements ITestService {

	marco(): TPromise<string> {
		return TPromise.wrap('polo');
	}

	error(message: string): TPromise<void> {
		return TPromise.wrapError(new Error(message));
	}
}

interface ITestChannel extends IChannel {
	call(command: 'marco'): TPromise<string>;
	call(command: 'error'): TPromise<void>;
	call<T>(command: string, arg?: any, cancellationToken?: CancellationToken): TPromise<T>;
	listen<T>(event: string, arg?: any): Event<T>;
}

class TestChannel implements ITestChannel {

	constructor(private service: TestService) { }

	call(command: string, arg?: any, cancellationToken?: CancellationToken): TPromise<any> {
		switch (command) {
			case 'marco': return this.service.marco();
			case 'error': return this.service.error(arg);
			default: return TPromise.wrapError(new Error('not implemented'));
		}
	}

	listen<T>(event: string, arg?: any): Event<T> {
		switch (event) {
			default: throw new Error('not implemented');
		}
	}
}

class TestChannelClient implements ITestService {

	constructor(private channel: ITestChannel) { }

	marco(): TPromise<string> {
		return this.channel.call('marco');
	}

	error(message: string): TPromise<void> {
		return this.channel.call('error', message);
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

	test('call', async function () {
		const service = new TestService();
		const server = new TestIPCServer();
		server.registerChannel(TestChannelId, new TestChannel(service));

		const client = server.createConnection('client1');
		const ipcService = new TestChannelClient(client.getChannel(TestChannelId));

		assert.equal(await ipcService.marco(), 'polo');

		try {
			await ipcService.error('nice error');
			assert.fail('should not reach here');
		} catch (err) {
			assert.equal(err.message, 'nice error');
		}

		client.dispose();
		server.dispose();
	});

	suite('getDelayedChannel', function () {

	});

	suite('getNextTickChannel', function () {

	});
});
