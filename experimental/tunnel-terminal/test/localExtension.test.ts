/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { runInNewContext } from 'node:vm';
import { WebSocket } from 'ws';
import { relayApprovalPendingMessage, relayCapacityMessage, relayCommands, relayVersion, validateSessionId, type RelayBatch, type RelayEndpoint } from '../src/relayProtocol';

const bridgeA = '11111111-1111-4111-8111-111111111111';
const bridgeB = '22222222-2222-4222-8222-222222222222';

interface ExtensionModule {
	activate(context: { subscriptions: { dispose(): void }[] }): void;
	deactivate(): void;
}

function extensionFixture(t: TestContext) {
	const commands = new Map<string, (...args: unknown[]) => unknown>();
	const subscriptions: { dispose(): void }[] = [];
	const calls: { command: string; args: unknown[] }[] = [];
	const logs: string[] = [];
	const notifications: string[] = [];
	const reads = new Map<string, (batch: RelayBatch) => void>();
	let openError: unknown;
	let rejectNotifications = false;
	const api = {
		env: { uiKind: 1, remoteName: 'tunnel' as string | undefined },
		UIKind: { Desktop: 1, Web: 2 },
		workspace: { isTrusted: true },
		l10n: { t: (message: string, ...args: string[]) => message.replace(/\{(?<index>\d+)\}/g, (_match, index: string) => args[Number(index)]) },
		window: {
			createOutputChannel: () => ({ appendLine: (line: string) => logs.push(line), dispose: () => { } }),
			showErrorMessage: async (message: string) => {
				notifications.push(message);
				if (rejectNotifications) {
					throw new Error('Notification unavailable');
				}
			},
		},
		commands: {
			registerCommand: (name: string, callback: (...args: unknown[]) => unknown) => {
				assert.ok(!commands.has(name));
				commands.set(name, callback);
				return { dispose: () => commands.delete(name) };
			},
			executeCommand: async (command: string, ...args: unknown[]): Promise<unknown> => {
				calls.push({ command, args });
				if (command === relayCommands.remoteOpen && openError !== undefined) {
					throw openError;
				}
				const key = `${args[0]}/${args[1]}`;
				if (command === relayCommands.remoteRead) {
					return new Promise<RelayBatch>(resolve => reads.set(key, resolve));
				}
				if (command === relayCommands.remoteClose) {
					reads.get(key)?.({ messages: [], closeCode: 1001 });
					reads.delete(key);
				}
				if (command === relayCommands.remoteStop) {
					for (const [pendingKey, resolve] of reads) {
						if (pendingKey.startsWith(`${args[0]}/`)) {
							resolve({ messages: [], closeCode: 1001 });
							reads.delete(pendingKey);
						}
					}
				}
				return undefined;
			},
		},
	};
	const file = join(__dirname, '..', '..', 'local', 'dist', 'localExtension.cjs');
	const nodeRequire = createRequire(file);
	const module = { exports: {} as ExtensionModule };
	runInNewContext(readFileSync(file, 'utf8'), {
		module,
		exports: module.exports,
		require: (name: string) => name === 'vscode' ? api : nodeRequire(name),
		Buffer, process, console, setTimeout, clearTimeout, setInterval, clearInterval,
	}, { filename: file });
	module.exports.activate({ subscriptions });
	t.after(() => {
		module.exports.deactivate();
		for (const subscription of subscriptions) {
			subscription.dispose();
		}
	});
	const invoke = (command: string, ...args: unknown[]) => {
		const callback = commands.get(command);
		assert.ok(callback, `Missing command ${command}`);
		return callback(...args);
	};
	const create = (bridgeId = bridgeA) => invoke(relayCommands.localCreate, { version: relayVersion, bridgeId }) as Promise<RelayEndpoint>;
	const connect = async (url: string) => {
		const socket = new WebSocket(url);
		t.after(() => socket.terminate());
		socket.on('error', () => { });
		const closed = new Promise<number>(resolve => socket.once('close', code => resolve(code)));
		const messages: string[] = [];
		socket.on('message', data => messages.push(data.toString()));
		await once(socket, 'open');
		return { socket, closed, messages };
	};
	return {
		api, calls, commands, logs, notifications, reads, invoke, create, connect,
		deactivate: () => module.exports.deactivate(),
		setOpenError: (error: unknown) => { openError = error; },
		setRejectNotifications: () => { rejectNotifications = true; },
	};
}

async function waitFor(predicate: () => boolean): Promise<void> {
	const deadline = Date.now() + 3_000;
	while (!predicate()) {
		assert.ok(Date.now() < deadline, 'Condition did not become true');
		await delay(5);
	}
}

test('local companion exposes only the three shared local commands and accepts tunnel desktops', t => {
	const f = extensionFixture(t);
	assert.deepStrictEqual([...f.commands.keys()], [relayCommands.localVersion, relayCommands.localCreate, relayCommands.localStop]);
	assert.equal(f.invoke(relayCommands.localVersion), relayVersion);
	assert.deepStrictEqual(f.calls, []);
});

test('local companion rejects untrusted, web, and non-remote environments', t => {
	const f = extensionFixture(t);
	f.api.workspace.isTrusted = false;
	assert.throws(() => f.create(), /trusted remote workspace/);
	f.api.workspace.isTrusted = true;
	f.api.env.uiKind = f.api.UIKind.Web;
	assert.throws(() => f.create(), /trusted remote workspace/);
	f.api.env.uiKind = f.api.UIKind.Desktop;
	f.api.env.remoteName = undefined;
	assert.throws(() => f.create(), /trusted remote workspace/);
	assert.deepStrictEqual(f.calls, []);
});

test('local companion validates descriptors rather than accepting caller-provided URLs', async t => {
	const f = extensionFixture(t);
	for (const descriptor of [null, [], 'https://example.com', { version: 2, sessionId: bridgeA }, { version: 1, bridgeId: bridgeA }, { version: 2, bridgeId: 'https://example.com' }, { version: 2, url: 'https://example.com' }]) {
		assert.throws(() => f.invoke(relayCommands.localCreate, descriptor), /Invalid/);
	}
	assert.deepStrictEqual(f.calls, []);
	const endpoint = await f.create();
	assert.equal(endpoint.version, relayVersion);
	assert.equal(new URL(endpoint.url).hostname, '127.0.0.1');
	assert.equal(new URL(endpoint.url).pathname, '/terminal');
});

test('local companion returns the same active endpoint and ignores stale stop requests', async t => {
	const f = extensionFixture(t);
	const first = f.create();
	assert.equal(f.create(), first);
	await first;
	const second = await f.create(bridgeB);
	f.invoke(relayCommands.localStop, bridgeA);
	const client = await f.connect(second.url);
	f.invoke(relayCommands.localStop, bridgeB);
	f.invoke(relayCommands.localStop, bridgeB);
	assert.equal(await client.closed, 1001);
	assert.deepStrictEqual(f.calls.filter(call => call.command === relayCommands.remoteStop).map(call => call.args), [[bridgeA], [bridgeB]]);
});

test('local companion cancels in-flight listener creation without stopping a replacement session', async t => {
	const f = extensionFixture(t);
	const first = f.create();
	const rejected = assert.rejects(first, /stopped while starting/);
	f.invoke(relayCommands.localStop, bridgeA);
	const second = f.create(bridgeB);
	f.invoke(relayCommands.localStop, bridgeA);
	await rejected;
	const endpoint = await second;
	const client = await f.connect(endpoint.url);
	assert.equal(client.socket.readyState, WebSocket.OPEN);
	assert.deepStrictEqual(f.calls.filter(call => call.command === relayCommands.remoteStop).map(call => call.args), [[bridgeA]]);
});

test('local companion uses session-scoped typed RPC and preserves wire packets', async t => {
	const f = extensionFixture(t);
	const endpoint = await f.create();
	const client = await f.connect(endpoint.url);
	const start = JSON.stringify({ type: 'start', version: 2, cols: 80, rows: 24 });
	client.socket.send(start);
	await waitFor(() => f.calls.some(call => call.command === relayCommands.remoteWrite) && f.reads.size === 1);
	const sessionId = f.calls.find(call => call.command === relayCommands.remoteOpen)?.args[1];
	validateSessionId(sessionId);
	const final = [JSON.stringify({ type: 'data', data: 'bye' }), JSON.stringify({ type: 'exit', exitCode: 0 })];
	f.reads.get(`${bridgeA}/${sessionId}`)?.({ messages: final, closeCode: 1000 });
	assert.deepStrictEqual({ code: await client.closed, messages: client.messages }, { code: 1000, messages: final });
	assert.equal(JSON.stringify(f.calls), JSON.stringify([
		{ command: relayCommands.remoteOpen, args: [bridgeA, sessionId] },
		{ command: relayCommands.remoteRead, args: [bridgeA, sessionId] },
		{ command: relayCommands.remoteWrite, args: [bridgeA, sessionId, [start]] },
		{ command: relayCommands.remoteClose, args: [bridgeA, sessionId] },
	]));
	assert.equal((await f.create()).url, endpoint.url);
});

test('local companion reports cross-host failures without logging connection details or rejecting notifications', async t => {
	const f = extensionFixture(t);
	f.setOpenError(new Error('Connection failed: https://example.com/?token=private-credential'));
	f.setRejectNotifications();
	const endpoint = await f.create();
	const client = await f.connect(endpoint.url);
	assert.equal(await client.closed, 1011);
	await delay(5);
	assert.equal(f.notifications.length, 1);
	assert.ok(f.logs.length > 0);
	assert.ok(f.logs.every(line => !line.includes('private-credential') && !line.includes('https://')));
});

for (const message of [relayApprovalPendingMessage, relayCapacityMessage]) {
	test(`local companion preserves the safe admission error: ${message}`, async t => {
		const f = extensionFixture(t);
		const endpoint = await f.create();
		const healthy = await f.connect(endpoint.url);
		healthy.socket.send(JSON.stringify({ type: 'start', version: 2, cols: 80, rows: 24 }));
		f.setOpenError(new Error(message));
		const denied = await f.connect(endpoint.url);
		assert.deepStrictEqual({
			code: await denied.closed,
			messages: denied.messages,
			logs: f.logs,
			notifications: f.notifications,
			siblingState: healthy.socket.readyState,
			stops: f.calls.filter(call => call.command === relayCommands.remoteStop).length,
		}, {
			code: 1011,
			messages: [JSON.stringify({ type: 'error', message })],
			logs: [message],
			notifications: [message],
			siblingState: WebSocket.OPEN,
			stops: 0,
		});
		f.setOpenError(undefined);
		const retry = await f.connect(endpoint.url);
		assert.equal(retry.socket.readyState, WebSocket.OPEN);
		assert.equal((await f.create()).url, endpoint.url);
	});
}

test('local companion never allowlists error prefixes, suffixes, strings, or non-Error objects', async t => {
	const f = extensionFixture(t);
	const endpoint = await f.create();
	const unexpected = [
		new Error(`${relayApprovalPendingMessage} token=private-credential`),
		new Error(`token=private-credential ${relayCapacityMessage}`),
		relayApprovalPendingMessage,
		{ message: relayCapacityMessage },
	];
	for (const error of unexpected) {
		f.setOpenError(error);
		const client = await f.connect(endpoint.url);
		assert.equal(await client.closed, 1011);
		assert.deepStrictEqual(client.messages, []);
	}
	assert.ok(f.logs.every(line => !line.includes('private-credential') && line !== relayApprovalPendingMessage && line !== relayCapacityMessage));
	assert.equal(f.notifications.length, 1);
});

test('local companion localizes admission diagnostics without changing the safe wire error', async t => {
	const f = extensionFixture(t);
	const translate = f.api.l10n.t;
	f.api.l10n.t = (message, ...args) => message === relayApprovalPendingMessage ? 'Localized approval guidance' : translate(message, ...args);
	f.setOpenError(new Error(relayApprovalPendingMessage));
	const endpoint = await f.create();
	const client = await f.connect(endpoint.url);
	assert.deepStrictEqual({
		code: await client.closed,
		messages: client.messages,
		logs: f.logs,
		notifications: f.notifications,
	}, {
		code: 1011,
		messages: [JSON.stringify({ type: 'error', message: relayApprovalPendingMessage })],
		logs: ['Localized approval guidance'],
		notifications: ['Localized approval guidance'],
	});
});

test('local companion assigns independent session IDs and stops a shared bridge only explicitly', async t => {
	const f = extensionFixture(t);
	const endpoint = await f.create();
	const clients = [await f.connect(endpoint.url), await f.connect(endpoint.url)];
	for (const client of clients) {
		client.socket.send(JSON.stringify({ type: 'start', version: 2, cols: 80, rows: 24 }));
	}
	await waitFor(() => f.reads.size === 2);
	const sessions = f.calls.filter(call => call.command === relayCommands.remoteOpen).map(call => {
		assert.equal(call.args[0], bridgeA);
		validateSessionId(call.args[1]);
		return call.args[1];
	});
	assert.equal(new Set(sessions).size, 2);
	for (const [index, sessionId] of sessions.entries()) {
		f.reads.get(`${bridgeA}/${sessionId}`)?.({ messages: [JSON.stringify({ type: 'data', data: `client-${index}` })] });
	}
	await waitFor(() => clients.every(client => client.messages.length === 1));
	assert.deepStrictEqual(clients.map(client => client.messages), [
		[JSON.stringify({ type: 'data', data: 'client-0' })],
		[JSON.stringify({ type: 'data', data: 'client-1' })],
	]);
	clients[0].socket.close();
	await clients[0].closed;
	assert.equal(f.calls.filter(call => call.command === relayCommands.remoteStop).length, 0);
	assert.equal((await f.create()).url, endpoint.url);
	f.invoke(relayCommands.localStop, bridgeA);
	f.invoke(relayCommands.localStop, bridgeA);
	assert.equal(await clients[1].closed, 1001);
	assert.deepStrictEqual(f.calls.filter(call => call.command === relayCommands.remoteStop).map(call => call.args), [[bridgeA]]);
});

test('local companion bounds repeated connection error logging and notifications', async t => {
	const f = extensionFixture(t);
	f.setOpenError(new Error('Remote connection unavailable'));
	const endpoint = await f.create();
	for (let attempt = 0; attempt < 15; attempt++) {
		const client = await f.connect(endpoint.url);
		assert.equal(await client.closed, 1011);
	}
	assert.deepStrictEqual({
		notifications: f.notifications.length,
		logs: f.logs.length,
		suppressed: f.logs.at(-1)?.includes('suppressed'),
		stops: f.calls.filter(call => call.command === relayCommands.remoteStop).length,
	}, { notifications: 1, logs: 11, suppressed: true, stops: 0 });
});

test('local companion deactivation cancels in-flight creation and releases the remote session', async t => {
	const f = extensionFixture(t);
	const creating = f.create();
	const rejected = assert.rejects(creating, /stopped while starting/);
	f.deactivate();
	await rejected;
	assert.deepStrictEqual(f.calls.filter(call => call.command === relayCommands.remoteStop).map(call => call.args), [[bridgeA]]);
	assert.throws(() => f.create(), /trusted remote workspace/);
});
