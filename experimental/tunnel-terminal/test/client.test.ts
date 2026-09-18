/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { Readable, Writable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { test, TestContext } from 'node:test';
import WebSocket, { WebSocketServer } from 'ws';
import { main, normalizeTerminalUrl, runTerminalClient, TerminalInput, TerminalOutput } from '../src/client';
import { ClientMessage, maxBufferedBytes, maxInputLength, maxMessageBytes, parseClientMessage, protocolVersion, ServerMessage } from '../src/protocol';

const pairingCode = '0123-4567-89AB';
const pairingOutput = '\r\nPairing code: 0123-4567-89AB\r\nCompare this code with the code shown in VS Code. Click Allow only if both codes match.\r\nWaiting for approval in VS Code. Press Ctrl+C to cancel.\r\n';

class TestInput extends Readable implements TerminalInput {
	isTTY = true;
	isRaw = false;
	readonly rawModes: boolean[] = [];

	override _read(): void { }

	setRawMode(mode: boolean): this {
		this.isRaw = mode;
		this.rawModes.push(mode);
		return this;
	}
}

class TestOutput extends Writable implements TerminalOutput {
	isTTY = true;
	columns = 100;
	rows = 30;
	text = '';
	block = false;
	readonly pending: (() => void)[] = [];

	override _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
		this.text += chunk.toString('utf8');
		if (this.block && chunk.length) {
			this.pending.push(callback);
		} else {
			callback();
		}
	}
}

function terminal(): { input: TestInput; output: TestOutput; signals: EventEmitter } {
	return { input: new TestInput(), output: new TestOutput(), signals: new EventEmitter() };
}

function assertClean(io: ReturnType<typeof terminal>): void {
	assert.deepEqual({
		raw: io.input.isRaw,
		flowing: io.input.readableFlowing,
		inputData: io.input.listenerCount('data'),
		inputError: io.input.listenerCount('error'),
		inputEnd: io.input.listenerCount('end'),
		inputClose: io.input.listenerCount('close'),
		outputError: io.output.listenerCount('error'),
		outputClose: io.output.listenerCount('close'),
		resize: io.output.listenerCount('resize'),
		signals: io.signals.eventNames(),
	}, {
		raw: false, flowing: false, inputData: 0, inputError: 0, inputEnd: 0, inputClose: 0,
		outputError: 0, outputClose: 0, resize: 0, signals: [],
	});
}

async function waitFor(predicate: () => boolean): Promise<void> {
	const deadline = Date.now() + 3000;
	while (!predicate()) {
		assert.ok(Date.now() < deadline, 'Timed out waiting for terminal test condition');
		await delay(2);
	}
}

async function localServer(t: TestContext): Promise<{ server: WebSocketServer; url: string }> {
	const server = new WebSocketServer({ host: '127.0.0.1', port: 0, path: '/terminal' });
	t.after(async () => {
		for (const socket of server.clients) {
			socket.terminate();
		}
		await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
	});
	await once(server, 'listening');
	return { server, url: `ws://127.0.0.1:${(server.address() as AddressInfo).port}/terminal` };
}

function send(socket: WebSocket, message: ServerMessage): void {
	socket.send(JSON.stringify(message));
}

async function connect(t: TestContext, options: { pairing?: boolean; ready?: boolean; timeoutMs?: number; pairingTimeoutMs?: number } = {}): Promise<{
	io: ReturnType<typeof terminal>;
	socket: WebSocket;
	messages: ClientMessage[];
	result: Promise<number>;
}> {
	const { server, url } = await localServer(t);
	const io = terminal();
	const messages: ClientMessage[] = [];
	const connected = new Promise<WebSocket>(resolve => {
		server.once('connection', socket => {
			socket.on('message', data => messages.push(parseClientMessage(data.toString())));
			resolve(socket);
		});
	});
	const result = runTerminalClient({
		url, ...io, handshakeTimeoutMs: options.timeoutMs ?? 1000,
		pairingTimeoutMs: options.pairingTimeoutMs,
	});
	// Attach immediately so intentionally failing connections cannot become unhandled rejections.
	void result.catch(() => { });
	const socket = await connected;
	await waitFor(() => messages.some(message => message.type === 'start'));
	assert.equal(io.input.isRaw, false, 'Raw input must wait for approval and the ready message');
	if (options.pairing !== false) {
		send(socket, { type: 'pairing', version: protocolVersion, code: pairingCode });
		await waitFor(() => io.output.text.includes(pairingCode));
		assert.equal(io.input.isRaw, false, 'Displaying the pairing code must not enable raw input');
	}
	if (options.ready !== false) {
		send(socket, { type: 'ready', version: protocolVersion });
		await waitFor(() => io.input.isRaw);
	}
	return { io, socket, messages, result };
}

test('normalizes secure and loopback URLs without losing forwarded paths or queries', () => {
	assert.deepEqual([
		normalizeTerminalUrl(' https://example.test?routing=one%2Ftwo&x=1 ').href,
		normalizeTerminalUrl('wss://example.test/prefix/terminal?routing=1').href,
		normalizeTerminalUrl('http://localhost:1234').href,
		normalizeTerminalUrl('ws://127.10.20.30:1234/terminal?q=1').href,
		normalizeTerminalUrl('http://[::1]:1234/terminal').href,
	], [
		'wss://example.test/terminal?routing=one%2Ftwo&x=1',
		'wss://example.test/prefix/terminal?routing=1',
		'ws://localhost:1234/terminal',
		'ws://127.10.20.30:1234/terminal?q=1',
		'ws://[::1]:1234/terminal',
	]);
});

test('rejects insecure remote URLs, unsupported schemes, credentials and fragments', () => {
	for (const url of [
		'not a URL', 'file:///terminal', 'ftp://localhost/terminal',
		'http://example.test/terminal', 'ws://10.0.0.1/terminal', 'ws://[::]/terminal',
		'ws://127.0.0.1.example.test/terminal', 'https://user@example.test/terminal',
		'https://@example.test/terminal',
		'wss://user:password@example.test/terminal', 'https://example.test/terminal#fragment',
		'https://example.test/terminal#',
	]) {
		assert.throws(() => normalizeTerminalUrl(url), Error, url);
	}
});

test('URL prompt cleans up on Ctrl+C, Ctrl+D, signals and input failure without enabling raw mode', async () => {
	for (const reason of ['ctrlC', 'ctrlD', 'SIGINT', 'SIGTERM', 'SIGHUP', 'error', 'end']) {
		const io = terminal();
		const error = new TestOutput();
		const result = main([], { ...io, error });
		io.input.push(Buffer.from('https://example.test'));
		if (reason === 'ctrlC' || reason === 'ctrlD') {
			io.input.push(Buffer.from(reason === 'ctrlC' ? '\x03' : '\x04'));
		} else if (reason === 'error') {
			io.input.emit('error', new Error('input failure'));
		} else if (reason === 'end') {
			io.input.push(null);
		} else {
			io.signals.emit(reason);
		}
		assert.equal(await result, 1);
		assert.match(error.text, /cancelled|interrupted|input/i);
		assert.deepEqual(io.input.rawModes, []);
		assertClean(io);
	}
});

test('help needs no TTY, while noninteractive usage and extra arguments are rejected', async () => {
	const io = terminal();
	io.input.isTTY = false;
	io.output.isTTY = false;
	assert.equal(await main(['--help'], io), 0);
	assert.match(io.output.text, /Usage: node client.cjs \[URL\]/);
	assert.match(io.output.text, /Click Allow in VS Code only if both codes match/);
	assert.deepEqual(io.input.rawModes, []);
	const error = new TestOutput();
	assert.equal(await main(['https://example.test'], { ...io, error }), 1);
	assert.match(error.text, /interactive terminal/);
	assert.equal(await main(['https://example.test', 'extra'], { ...io, error }), 1);
	assert.match(error.text, /at most one terminal URL/);
});

test('main prompts for a URL without raw mode, displays the pairing code and preserves the remote exit code', async t => {
	const { server, url } = await localServer(t);
	const io = terminal();
	const error = new TestOutput();
	server.on('connection', socket => {
		socket.on('message', data => {
			if (parseClientMessage(data.toString()).type === 'start') {
				send(socket, { type: 'pairing', version: protocolVersion, code: pairingCode });
				send(socket, { type: 'ready', version: protocolVersion });
				send(socket, { type: 'data', data: 'hello from remote\r\n' });
				send(socket, { type: 'exit', exitCode: 9 });
				socket.close(1000);
			}
		});
	});
	const result = main([], { ...io, error });
	assert.deepEqual(io.input.rawModes, []);
	io.input.push(Buffer.from(`\x1b[200~${url}\x1b[201~\r\n`));
	assert.deepEqual({ code: await result, error: error.text, output: io.output.text }, {
		code: 9, error: '', output: `Terminal URL: \r\n${pairingOutput}hello from remote\r\n`,
	});
	assert.deepEqual(io.input.rawModes, [true, false]);
	assertClean(io);
});

test('URL prompt cleans up on stdout failure without changing raw mode', async () => {
	const brokenOutput = terminal();
	const error = new TestOutput();
	const outputResult = main([], { ...brokenOutput, error });
	brokenOutput.output.destroy(new Error('stdout failed'));
	assert.equal(await outputResult, 1);
	assert.match(error.text, /write terminal output/);
	assert.deepEqual(brokenOutput.input.rawModes, []);
	assertClean(brokenOutput);
});

test('starts without credentials, waits for pairing approval, then forwards Ctrl+C, Unicode, resize and ACKs', async t => {
	const { server, url } = await localServer(t);
	const io = terminal();
	const messages: ClientMessage[] = [];
	let headers: { authorization?: string; url?: string; extensions?: string } | undefined;
	const connected = new Promise<WebSocket>(resolve => {
		server.once('connection', (socket, request) => {
			headers = {
				authorization: request.headers.authorization,
				url: request.url,
				extensions: request.headers['sec-websocket-extensions'],
			};
			socket.on('message', data => messages.push(parseClientMessage(data.toString())));
			resolve(socket);
		});
	});
	const result = runTerminalClient({ url: `${url}?routing=a%2Fb`, ...io });
	const socket = await connected;
	await waitFor(() => messages.length === 1);
	assert.deepEqual({ headers, messages, raw: io.input.isRaw }, {
		headers: { authorization: undefined, url: '/terminal?routing=a%2Fb', extensions: undefined },
		messages: [{ type: 'start', version: protocolVersion, cols: 100, rows: 30 }],
		raw: false,
	});
	send(socket, { type: 'pairing', version: protocolVersion, code: pairingCode });
	await waitFor(() => io.output.text.includes(pairingCode));
	assert.deepEqual({
		raw: io.input.isRaw, inputListeners: io.input.listenerCount('data'), messages, output: io.output.text,
	}, {
		raw: false, inputListeners: 0,
		messages: [{ type: 'start', version: protocolVersion, cols: 100, rows: 30 }], output: pairingOutput,
	});
	send(socket, { type: 'ready', version: protocolVersion });
	await waitFor(() => io.input.isRaw);
	io.input.push(Buffer.from('echo hello\r\x03'));
	const emoji = Buffer.from('🙂');
	io.input.push(emoji.subarray(0, 2));
	io.input.push(emoji.subarray(2));
	io.signals.emit('SIGINT');
	io.output.columns = 120;
	io.output.rows = 45;
	io.output.emit('resize');
	send(socket, { type: 'data', data: 'remote 🙂\r\n' });
	const pong = once(socket, 'pong');
	socket.ping('keepalive');
	await pong;
	await waitFor(() => messages.some(message => message.type === 'ack'));
	assert.deepEqual({
		input: messages.filter(message => message.type === 'input'),
		resize: messages.filter(message => message.type === 'resize').at(-1),
		acks: messages.filter(message => message.type === 'ack'),
		output: io.output.text,
	}, {
		input: [{ type: 'input', data: 'echo hello\r\x03' }, { type: 'input', data: '🙂' }, { type: 'input', data: '\x03' }],
		resize: { type: 'resize', cols: 120, rows: 45 },
		acks: [{ type: 'ack', chars: 'remote 🙂\r\n'.length }],
		output: `${pairingOutput}remote 🙂\r\n`,
	});
	send(socket, { type: 'exit', exitCode: 7 });
	socket.close(1000);
	assert.equal(await result, 7);
	assertClean(io);
});

test('ready before pairing is rejected without enabling raw input', async t => {
	const { io, socket, result } = await connect(t, { pairing: false, ready: false });
	send(socket, { type: 'ready', version: protocolVersion });
	await assert.rejects(result, /unexpected state/);
	assert.deepEqual({ rawModes: io.input.rawModes, output: io.output.text }, { rawModes: [], output: '' });
	assertClean(io);
});

test('malformed pairing messages fail before displaying an untrusted code', async t => {
	for (const message of [
		{ type: 'pairing', version: 1, code: pairingCode },
		{ type: 'pairing', version: protocolVersion },
		{ type: 'pairing', version: protocolVersion, code: 'abcd-1234-5678' },
		{ type: 'pairing', version: protocolVersion, code: '0123-4567-89AG' },
		{ type: 'pairing', version: protocolVersion, code: '0123456789AB' },
		{ type: 'pairing', version: protocolVersion, code: `${pairingCode}\x1b[2J` },
		{ type: 'pairing', version: protocolVersion, code: 1234 },
	]) {
		const { io, socket, result } = await connect(t, { pairing: false, ready: false });
		socket.send(JSON.stringify(message));
		await assert.rejects(result, /invalid terminal message/);
		assert.deepEqual({ output: io.output.text, rawModes: io.input.rawModes }, { output: '', rawModes: [] });
		assertClean(io);
	}
});

test('duplicate pairing is rejected while awaiting approval and after ready', async t => {
	for (const ready of [false, true]) {
		const { io, socket, result } = await connect(t, { ready });
		send(socket, { type: 'pairing', version: protocolVersion, code: 'AAAA-BBBB-CCCC' });
		await assert.rejects(result, /unexpected state/);
		assert.equal(io.output.text, pairingOutput);
		assertClean(io);
	}
});

test('denied pairing is a failure and never enables raw input', async t => {
	const { io, socket, result } = await connect(t, { ready: false });
	send(socket, { type: 'error', message: 'Connection denied. Reconnect to try again.' });
	socket.close(1000);
	await assert.rejects(result, /Connection denied/);
	assert.deepEqual({ output: io.output.text, rawModes: io.input.rawModes }, { output: pairingOutput, rawModes: [] });
	assertClean(io);
});

test('pairing approval uses its longer deadline instead of the initial handshake deadline', async t => {
	const { io, socket, result } = await connect(t, { ready: false, timeoutMs: 100 });
	await delay(150);
	assert.deepEqual({ state: socket.readyState, rawModes: io.input.rawModes }, { state: WebSocket.OPEN, rawModes: [] });
	send(socket, { type: 'ready', version: protocolVersion });
	send(socket, { type: 'exit', exitCode: 0 });
	socket.close(1000);
	assert.equal(await result, 0);
	assertClean(io);
});

test('pairing timeout is configurable and directs the user to reconnect to the same URL', async t => {
	const { io, result } = await connect(t, { ready: false, pairingTimeoutMs: 100 });
	await assert.rejects(result, /Timed out waiting for approval in VS Code.*reconnect using the same URL/);
	assert.deepEqual(io.input.rawModes, []);
	assertClean(io);
	for (const pairingTimeoutMs of [0, -1, Infinity, NaN]) {
		await assert.rejects(runTerminalClient({ url: 'ws://localhost', ...terminal(), pairingTimeoutMs }), /pairing timeout must be positive/);
	}
});

test('Ctrl+C cancels before pairing or while awaiting approval instead of sending remote input', async t => {
	for (const pairing of [false, true]) {
		const { io, messages, result } = await connect(t, { pairing, ready: false });
		io.signals.emit('SIGINT');
		await assert.rejects(result, /cancelled/);
		assert.deepEqual({
			rawModes: io.input.rawModes, messages,
		}, {
			rawModes: [], messages: [{ type: 'start', version: protocolVersion, cols: 100, rows: 30 }],
		});
		assertClean(io);
	}
});

test('signals, input failure, stdout failure and disconnect clean up while awaiting approval', async t => {
	for (const reason of ['SIGTERM', 'SIGHUP', 'input', 'output', 'disconnect']) {
		const { io, socket, result } = await connect(t, { ready: false });
		if (reason === 'input') {
			io.input.emit('error', new Error('input failed'));
		} else if (reason === 'output') {
			io.output.destroy(new Error('stdout failed'));
		} else if (reason === 'disconnect') {
			socket.terminate();
		} else {
			io.signals.emit(reason);
		}
		await assert.rejects(result, /interrupted|terminal input|terminal output|closed unexpectedly/);
		assert.deepEqual(io.input.rawModes, []);
		assertClean(io);
	}
});

test('pairing instructions are flushed before remote output and are never ACKed', async t => {
	const { io, socket, messages, result } = await connect(t, { pairing: false, ready: false });
	io.output.block = true;
	send(socket, { type: 'pairing', version: protocolVersion, code: pairingCode });
	await waitFor(() => io.output.pending.length === 1);
	assert.deepEqual({ output: io.output.text, rawModes: io.input.rawModes }, { output: pairingOutput, rawModes: [] });
	send(socket, { type: 'ready', version: protocolVersion });
	send(socket, { type: 'data', data: 'remote output' });
	await waitFor(() => io.input.isRaw);
	assert.deepEqual({ output: io.output.text, acks: messages.filter(message => message.type === 'ack') }, { output: pairingOutput, acks: [] });
	io.output.pending.shift()!();
	await waitFor(() => io.output.pending.length === 1);
	assert.deepEqual({
		output: io.output.text, acks: messages.filter(message => message.type === 'ack'),
	}, {
		output: `${pairingOutput}remote output`, acks: [],
	});
	io.output.pending.shift()!();
	await waitFor(() => messages.some(message => message.type === 'ack'));
	assert.deepEqual(messages.filter(message => message.type === 'ack'), [{ type: 'ack', chars: 'remote output'.length }]);
	send(socket, { type: 'exit', exitCode: 0 });
	socket.close(1000);
	assert.equal(await result, 0);
	assertClean(io);
});

test('splits long pasted input at UTF-16 limits without splitting surrogate pairs', async t => {
	const { io, socket, messages, result } = await connect(t);
	const text = 'a'.repeat(maxInputLength - 1) + '🙂' + 'b'.repeat(maxInputLength) + '🚀';
	io.input.push(Buffer.from(text));
	await waitFor(() => messages.filter(message => message.type === 'input').map(message => message.data).join('') === text);
	const parts = messages.filter(message => message.type === 'input').map(message => message.data);
	assert.ok(parts.every(part => part.length <= maxInputLength && !/[\ud800-\udbff]$/.test(part) && !/^[\udc00-\udfff]/.test(part)));
	send(socket, { type: 'exit', exitCode: 0 });
	socket.close(1000);
	assert.equal(await result, 0);
	assertClean(io);
});

test('ACK waits for stdout callback, and normal close waits for the final output flush', async t => {
	const { io, socket, messages, result } = await connect(t);
	io.output.block = true;
	send(socket, { type: 'data', data: 'first 🙂' });
	await waitFor(() => io.output.pending.length === 1);
	assert.deepEqual(messages.filter(message => message.type === 'ack'), []);
	io.output.pending.shift()!();
	await waitFor(() => messages.some(message => message.type === 'ack'));
	assert.deepEqual(messages.filter(message => message.type === 'ack'), [{ type: 'ack', chars: 'first 🙂'.length }]);
	send(socket, { type: 'data', data: 'last output' });
	await waitFor(() => io.output.pending.length === 1);
	const closed = once(socket, 'close');
	send(socket, { type: 'exit', exitCode: 0 });
	socket.close(1000);
	await closed;
	let resolved = false;
	void result.then(() => { resolved = true; });
	await delay(10);
	assert.deepEqual({ resolved, raw: io.input.isRaw }, { resolved: false, raw: true });
	io.output.pending.shift()!();
	assert.equal(await result, 0);
	assert.equal(io.output.text, `${pairingOutput}first 🙂last output`);
	assertClean(io);
});

test('denied tunnel access is a failure without entering raw mode', async t => {
	const { server, url } = await localServer(t);
	server.options.verifyClient = (_info, done) => done(false, 401);
	const io = terminal();
	await assert.rejects(runTerminalClient({ url, ...io }), /Tunnel access.*401/i);
	assert.deepEqual(io.input.rawModes, []);
	assertClean(io);
});

test('redirects are rejected rather than followed', async t => {
	let upgrades = 0;
	const server = createServer();
	server.on('upgrade', (_request, socket) => {
		upgrades++;
		socket.end('HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1:1/terminal\r\nContent-Length: 0\r\n\r\n');
	});
	server.listen(0, '127.0.0.1');
	t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
	await once(server, 'listening');
	const io = terminal();
	await assert.rejects(runTerminalClient({
		url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/terminal`, ...io,
	}), /302.*redirects are not followed.*local companion.*127\.0\.0\.1/i);
	assert.equal(upgrades, 1);
	assertClean(io);
});

test('capacity rejection asks the user to release a slot and reuse the URL', async t => {
	const server = createServer();
	server.on('upgrade', (_request, socket) => {
		socket.end('HTTP/1.1 429 Too Many Requests\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
	});
	server.listen(0, '127.0.0.1');
	t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
	await once(server, 'listening');
	const address = server.address();
	assert.ok(address && typeof address !== 'string');
	const io = terminal();
	await assert.rejects(runTerminalClient({ url: `http://127.0.0.1:${address.port}/terminal`, ...io }), /connection limit.*429.*Close a session.*same URL/);
	assertClean(io);
});

test('abrupt disconnect and normal close without exit both fail and clean up', async t => {
	for (const abrupt of [true, false]) {
		const { io, socket, result } = await connect(t);
		if (abrupt) {
			socket.terminate();
		} else {
			socket.close(1000);
		}
		await assert.rejects(result, /closed unexpectedly/);
		assertClean(io);
	}
});

test('abrupt disconnect still flushes already received terminal output', async t => {
	const { io, socket, result } = await connect(t);
	io.output.block = true;
	send(socket, { type: 'data', data: 'received before disconnect' });
	await waitFor(() => io.output.pending.length === 1);
	socket.terminate();
	await delay(10);
	assert.equal(io.input.isRaw, true);
	io.output.pending.shift()!();
	await assert.rejects(result, /closed unexpectedly/);
	assert.equal(io.output.text, `${pairingOutput}received before disconnect`);
	assertClean(io);
});

test('malformed, binary and unexpected messages fail closed', async t => {
	for (const message of [
		'{', '[]', '{"type":"data","data":1}', '{"type":"exit","exitCode":-1}',
		'{"type":"ready","version":2}', '{"type":"ready","version":1}',
		'{"type":"unsupported"}', Buffer.from('binary'),
	]) {
		const { io, socket, result } = await connect(t);
		socket.send(message);
		await assert.rejects(result, /invalid|binary|unexpected state/i);
		assertClean(io);
	}
});

test('data before ready and messages after exit are rejected', async t => {
	for (const pairing of [false, true]) {
		const before = await connect(t, { pairing, ready: false });
		send(before.socket, { type: 'data', data: 'too early' });
		await assert.rejects(before.result, /unexpected state/);
		assert.deepEqual({ output: before.io.output.text, rawModes: before.io.input.rawModes }, {
			output: pairing ? pairingOutput : '', rawModes: [],
		});
		assertClean(before.io);
	}
	const after = await connect(t);
	send(after.socket, { type: 'exit', exitCode: 0 });
	send(after.socket, { type: 'data', data: 'too late' });
	await assert.rejects(after.result, /unexpected state/);
	assertClean(after.io);
});

test('an exit message followed by an abnormal close is not success', async t => {
	const { io, socket, result } = await connect(t);
	send(socket, { type: 'exit', exitCode: 0 });
	socket.close(1011);
	await assert.rejects(result, /closed unexpectedly/);
	assertClean(io);
});

test('oversized frames are rejected by WebSocket maxPayload', async t => {
	const { io, socket, result } = await connect(t);
	socket.send('x'.repeat(maxMessageBytes + 1));
	await assert.rejects(result, /connection failed/i);
	assertClean(io);
});

test('queued output is bounded even when stdout has not completed a write', async t => {
	const { io, socket, result } = await connect(t);
	io.output.block = true;
	const text = 'x'.repeat(Math.floor(maxBufferedBytes / 2) + 1);
	send(socket, { type: 'data', data: text });
	await waitFor(() => io.output.pending.length === 1);
	const closed = once(socket, 'close');
	send(socket, { type: 'data', data: text });
	await closed;
	io.output.pending.shift()!();
	await assert.rejects(result, /output buffer limit/);
	assert.equal(io.output.text.length, pairingOutput.length + text.length);
	assertClean(io);
});

test('pairing-code and exit-close deadlines fail and restore the console', async t => {
	const before = await connect(t, { pairing: false, ready: false, timeoutMs: 100 });
	await assert.rejects(before.result, /Timed out.*pairing code/);
	assertClean(before.io);
	const after = await connect(t, { timeoutMs: 100 });
	send(after.socket, { type: 'exit', exitCode: 0 });
	await assert.rejects(after.result, /did not close/);
	assertClean(after.io);
});

test('signals, raw input failure and remote errors restore the connected console', async t => {
	for (const reason of ['SIGTERM', 'SIGHUP', 'input', 'remote']) {
		const { io, socket, result } = await connect(t);
		if (reason === 'input') {
			io.input.emit('error', new Error('raw input failed'));
		} else if (reason === 'remote') {
			send(socket, { type: 'error', message: 'Remote shell unavailable.' });
		} else {
			io.signals.emit(reason);
		}
		await assert.rejects(result, /interrupted|read terminal input|Remote shell unavailable/);
		assertClean(io);
	}
});

test('stdout failure does not leave the terminal raw or listeners installed', async t => {
	const { io, socket, result } = await connect(t);
	io.output.destroy(new Error('stdout failed'));
	await assert.rejects(result, /write terminal output/);
	assertClean(io);
	assert.equal(socket.readyState === WebSocket.CLOSING || socket.readyState === WebSocket.CLOSED, true);
});
