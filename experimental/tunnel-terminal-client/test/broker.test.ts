/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Duplex } from 'node:stream';
import { test, type TestContext } from 'node:test';
import { WebSocketServer } from 'ws';
import { openSocket, type Machine } from '../src/agentHost.js';
import { Broker, BrokerError, brokerDirectory, connectBroker, readBrokers, stopBroker, type BrokerRelay } from '../src/broker.js';

const machine: Machine = { id: 'tunnel-id', cluster: 'uks1', name: 'my-machine', protocolVersion: 6, online: true };

async function agentHost(t: TestContext): Promise<number> {
	const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
	t.after(async () => {
		for (const socket of server.clients) { socket.terminate(); }
		await new Promise<void>(resolve => server.close(() => resolve()));
	});
	server.on('connection', (socket, request) => socket.send(JSON.stringify({ path: request.url })));
	await once(server, 'listening');
	const address = server.address();
	if (!address || typeof address === 'string') { throw new Error('Missing test server address.'); }
	return address.port;
}

function relay(port: number, options: { failures?: number; connected?: () => boolean } = {}): BrokerRelay & { opened: number; disposed: boolean } {
	let failures = options.failures ?? 0;
	return {
		machine,
		opened: 0,
		disposed: false,
		get connected() { return options.connected?.() ?? !this.disposed; },
		async openStream(): Promise<Duplex> {
			if (failures-- > 0) { throw new Error('relay dropped'); }
			this.opened++;
			const stream = connect(port, '127.0.0.1');
			await once(stream, 'connect');
			return stream;
		},
		async dispose() { this.disposed = true; },
	};
}

async function startBroker(t: TestContext, first: BrokerRelay, reconnect: () => Promise<BrokerRelay>, idleMs?: number) {
	const directory = await mkdtemp(join(tmpdir(), 'tunnel-broker-test-'));
	const broker = new Broker({ provider: 'github', relay: first, reconnect, idleMs, directory });
	t.after(async () => {
		await broker.stop();
		await rm(directory, { recursive: true, force: true });
	});
	const descriptor = await broker.listen();
	return { broker, descriptor, directory };
}

test('streams reach the agent host end-to-end and each request gets its own relay stream', async t => {
	const port = await agentHost(t);
	const first = relay(port);
	const { descriptor, directory } = await startBroker(t, first, async () => assert.fail('unexpected reconnect'));
	assert.deepEqual((await readBrokers('github', directory)).map(found => found.machine), [machine]);
	assert.deepEqual(await readBrokers('microsoft', directory), []);
	const messages = [];
	for (const path of ['/first', '/second']) {
		const connection = await openSocket(await connectBroker(descriptor), path);
		t.after(() => connection.dispose());
		messages.push(await connection.read());
	}
	assert.deepEqual({ messages, opened: first.opened }, { messages: [{ path: '/first' }, { path: '/second' }], opened: 2 });
});

test('a request without the descriptor secret is closed without opening a stream', async t => {
	const port = await agentHost(t);
	const first = relay(port);
	const { descriptor } = await startBroker(t, first, async () => assert.fail('unexpected reconnect'));
	const error = await connectBroker({ ...descriptor, secret: 'wrong' }).then(() => undefined, (error: Error) => error);
	assert.ok(error && !(error instanceof BrokerError));
	assert.equal(first.opened, 0);
});

test('a broker that is gone is reported as unreachable, not as a broker failure', async t => {
	const port = await agentHost(t);
	const { broker, descriptor } = await startBroker(t, relay(port), async () => assert.fail('unexpected reconnect'));
	await broker.stop();
	const error = await connectBroker(descriptor).then(() => undefined, (error: Error) => error);
	assert.ok(error && !(error instanceof BrokerError));
});

test('a dropped relay is reconnected before opening the stream', async t => {
	const port = await agentHost(t);
	const first = relay(port, { connected: () => false });
	const second = relay(port);
	const { descriptor } = await startBroker(t, first, async () => second);
	const connection = await openSocket(await connectBroker(descriptor), '/');
	t.after(() => connection.dispose());
	assert.deepEqual({ message: await connection.read(), firstDisposed: first.disposed, opened: [first.opened, second.opened] },
		{ message: { path: '/' }, firstDisposed: true, opened: [0, 1] });
});

test('a stream failure on an apparently connected relay retries once on a fresh relay', async t => {
	const port = await agentHost(t);
	const first = relay(port, { failures: 1 });
	const second = relay(port);
	const { descriptor } = await startBroker(t, first, async () => second);
	const connection = await openSocket(await connectBroker(descriptor), '/');
	t.after(() => connection.dispose());
	assert.deepEqual(await connection.read(), { path: '/' });
	assert.equal(second.opened, 1);
});

test('a failed reconnect is reported to the client as a broker error', async t => {
	const port = await agentHost(t);
	const { descriptor } = await startBroker(t, relay(port, { connected: () => false }), async () => { throw new Error('Unable to connect to the tunnel relay.'); });
	await assert.rejects(connectBroker(descriptor), (error: Error) => error instanceof BrokerError && error.message === 'Unable to connect to the tunnel relay.');
});

test('the broker stops when idle or asked to, and removes its descriptor', async t => {
	const port = await agentHost(t);
	const idle = await startBroker(t, relay(port), async () => assert.fail('unexpected reconnect'), 50);
	await idle.broker.closed;
	assert.deepEqual(await readdir(idle.directory), []);

	const stopped = await startBroker(t, relay(port), async () => assert.fail('unexpected reconnect'));
	assert.equal(await stopBroker(stopped.descriptor, stopped.directory), true);
	await stopped.broker.closed;
	assert.deepEqual(await readBrokers('github', stopped.directory), []);
});

test('an active stream keeps the broker alive past the idle timeout', async t => {
	const port = await agentHost(t);
	const { broker, descriptor } = await startBroker(t, relay(port), async () => assert.fail('unexpected reconnect'), 100);
	const connection = await openSocket(await connectBroker(descriptor), '/');
	await connection.read();
	let closed = false;
	void broker.closed.then(() => { closed = true; });
	await new Promise(resolve => setTimeout(resolve, 300));
	assert.equal(closed, false);
	connection.dispose();
	await broker.closed;
});

test('broker state lives in a per-user directory', () => {
	assert.equal(brokerDirectory({ LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' }, 'win32'), join('C:\\Users\\me\\AppData\\Local', 'tunnel-terminal-client', 'brokers'));
	assert.equal(brokerDirectory({ XDG_STATE_HOME: '/home/me/.state' }, 'linux'), join('/home/me/.state', 'tunnel-terminal-client', 'brokers'));
});
