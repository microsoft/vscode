/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { runInNewContext } from 'node:vm';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { parseServerMessage, protocolVersion, type ServerMessage } from '../src/protocol';
import { relayCommands, relayVersion, type RelayBatch, validateRelayBatch } from '../src/relayProtocol';

interface Disposable { dispose(): void }

class TestUri {
	readonly scheme: string;
	constructor(readonly value: string) { this.scheme = new URL(value).protocol.slice(0, -1); }
	toString(): string { return this.value; }
	static parse(value: string): TestUri { return new TestUri(value); }
}

class TestCancellation implements Disposable {
	readonly token = { isCancellationRequested: false };
	cancel(): void { this.token.isCancellationRequested = true; }
	dispose(): void {}
}

async function loadExtension(t: TestContext, withLocalCompanion = false) {
	const commands = new Map<string, (...args: unknown[]) => unknown>();
	const errors: string[] = [];
	const warnings: string[] = [];
	const notifications: string[] = [];
	const approvals: { message: string; detail: string; modal: boolean }[] = [];
	const copied: string[] = [];
	const resolved: string[] = [];
	const stopped: string[] = [];
	const calls: string[] = [];
	const subscriptions: Disposable[] = [];
	const api = {
		commands: {
			registerCommand: (name: string, run: (...args: unknown[]) => unknown): Disposable => {
				commands.set(name, run);
				return { dispose: () => { commands.delete(name); } };
			},
			executeCommand: async (name: string, ...args: unknown[]): Promise<unknown> => {
				calls.push(name);
				if (withLocalCompanion) {
					const command = commands.get(name);
					assert.ok(command, `Command not registered: ${name}`);
					return structuredClone(await command(...structuredClone(args)));
				}
				const descriptor = args[0];
				switch (name) {
					case relayCommands.localVersion: return relayVersion;
					case relayCommands.localCreate:
						assert.ok(typeof descriptor === 'object' && descriptor !== null && 'bridgeId' in descriptor);
						resolved.push(String(descriptor.bridgeId));
						return { version: relayVersion, url: 'http://127.0.0.1:50123/terminal' };
					case relayCommands.localStop:
						assert.equal(typeof descriptor, 'string');
						stopped.push(String(descriptor));
						return undefined;
					default: throw new Error(`Unknown test command: ${name}`);
				}
			},
		},
		window: {
			createOutputChannel: () => ({ dispose() {}, error() {}, info() {}, warn() {}, appendLine() {} }),
			showErrorMessage: async (message: string) => { errors.push(message); },
			showWarningMessage: async (message: string, options?: { modal?: boolean; detail?: string }): Promise<string | undefined> => {
				warnings.push(message);
				if (options) {
					approvals.push({ message, detail: options.detail ?? '', modal: options.modal ?? false });
				}
				return undefined;
			},
			showInformationMessage: async (message: string) => { notifications.push(message); return undefined; },
			showWorkspaceFolderPick: async () => undefined,
			showInputBox: async (): Promise<string | undefined> => process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
		},
		workspace: { isTrusted: true, workspaceFolders: [{ uri: { fsPath: process.cwd() } }] },
		env: {
			remoteName: 'tunnel',
			uiKind: 1,
			asExternalUri: async () => { throw new Error('Web forwarding must not be used.'); },
			clipboard: { writeText: async (text: string) => { copied.push(text); } },
		},
		UIKind: { Desktop: 1, Web: 2 },
		Uri: TestUri,
		CancellationTokenSource: TestCancellation,
		l10n: { t: (message: string, ...args: string[]) => message.replace(/\{(?<index>\d+)\}/g, (_match, index: string) => args[Number(index)] ?? '') },
	};
	const load = async (entry: string, directory: string) => {
		const nodeRequire = createRequire(entry);
		const module: { exports: { activate?: (context: { subscriptions: Disposable[] }) => void } } = { exports: {} };
		runInNewContext(await readFile(entry, 'utf8'), {
			module, exports: module.exports, __dirname: directory,
			require: (id: string) => id === 'vscode' ? api : nodeRequire(id),
			process, console, Buffer, URL, setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask,
		});
		assert.ok(module.exports.activate);
		module.exports.activate({ subscriptions });
	};
	await load(join(process.cwd(), 'dist', 'extension.cjs'), join(process.cwd(), 'dist'));
	if (withLocalCompanion) {
		await load(join(process.cwd(), 'local', 'dist', 'localExtension.cjs'), join(process.cwd(), 'local', 'dist'));
	}
	t.after(() => { for (const disposable of subscriptions.reverse()) { disposable.dispose(); } });
	const run = async (name: string) => {
		const command = commands.get(`experimentalTunnelTerminal.${name}`);
		assert.ok(command);
		await command();
	};
	const rpc = async (name: string, ...args: unknown[]) => {
		const command = commands.get(name);
		assert.ok(command);
		return await command(...args);
	};
	return { api, run, rpc, errors, warnings, notifications, copied, resolved, approvals, stopped, calls };
}

test('extension creates a local companion endpoint without web forwarding and copies only on request', async t => {
	const state = await loadExtension(t);
	await state.run('start');
	assert.deepStrictEqual({ resolutions: state.resolved.length, copied: state.copied, errors: state.errors }, { resolutions: 1, copied: [], errors: [] });
	await state.run('copyUrl');
	assert.match(state.copied[0], /^http:\/\/127\.0\.0\.1:\d+\/terminal$/);
	await state.run('stop');
	await state.run('copyUrl');
	assert.deepStrictEqual({ copied: state.copied.length, warnings: state.warnings.length }, { copied: 1, warnings: 1 });
});

test('extension refuses untrusted, local and browser workspaces', async t => {
	const state = await loadExtension(t);
	state.api.workspace.isTrusted = false;
	await state.run('start');
	state.api.workspace.isTrusted = true;
	state.api.env.remoteName = '';
	await state.run('start');
	state.api.env.remoteName = 'tunnel';
	state.api.env.uiKind = 2;
	await state.run('start');
	assert.deepStrictEqual({ resolutions: state.resolved, errors: state.errors.length }, { resolutions: [], errors: 3 });
});

test('a cancelled shell prompt never starts a bridge', async t => {
	const state = await loadExtension(t);
	state.api.window.showInputBox = async () => undefined;
	await state.run('start');
	assert.deepStrictEqual({ resolutions: state.resolved, errors: state.errors }, { resolutions: [], errors: [] });
});

test('stop during the shell prompt cancels startup', async t => {
	const state = await loadExtension(t);
	let resolvePrompt: (value: string) => void = () => {};
	let promptShown: () => void = () => {};
	const prompt = new Promise<void>(resolve => { promptShown = resolve; });
	state.api.window.showInputBox = () => new Promise<string>(resolve => { resolvePrompt = resolve; promptShown(); });
	const starting = state.run('start');
	await prompt;
	await state.run('stop');
	resolvePrompt('cmd.exe');
	await starting;
	assert.deepStrictEqual({ resolutions: state.resolved, errors: state.errors }, { resolutions: [], errors: [] });
});

test('missing local companion is reported before shell prompts and subsequent start succeeds', async t => {
	const state = await loadExtension(t);
	const execute = state.api.commands.executeCommand;
	state.api.commands.executeCommand = async () => { throw new Error('companion unavailable'); };
	await state.run('start');
	state.api.commands.executeCommand = execute;
	await state.run('start');
	assert.deepStrictEqual({ resolutions: state.resolved.length, errors: state.errors.length }, { resolutions: 1, errors: 1 });
});

test('stop during local relay creation does not publish a stale endpoint', async t => {
	const state = await loadExtension(t);
	let finishForwarding: () => void = () => {};
	let forwardingStarted: () => void = () => {};
	const forwarding = new Promise<void>(resolve => { forwardingStarted = resolve; });
	const execute = state.api.commands.executeCommand;
	state.api.commands.executeCommand = async (name, descriptor) => {
		if (name !== relayCommands.localCreate) {
			return execute(name, descriptor);
		}
		return new Promise(resolve => {
			forwardingStarted();
			finishForwarding = () => resolve({ version: relayVersion, url: 'http://127.0.0.1:50123/terminal' });
		});
	};

	const starting = state.run('start');
	await forwarding;
	await state.run('stop');
	finishForwarding();
	await starting;
	await state.run('copyUrl');
	assert.deepStrictEqual({ copied: state.copied, warnings: state.warnings.length, errors: state.errors }, { copied: [], warnings: 1, errors: [] });
});

test('extension requires modal approval and displays the exact client pairing code', async t => {
	const state = await loadExtension(t);
	await state.run('start');
	const bridgeId = state.resolved[0];
	const sessionId = randomUUID();
	const messages: ServerMessage[] = [];
	await state.rpc(relayCommands.remoteOpen, bridgeId, sessionId);
	await state.rpc(relayCommands.remoteWrite, bridgeId, sessionId, [JSON.stringify({ type: 'start', version: protocolVersion, cols: 80, rows: 24 })]);
	let batch: RelayBatch;
	do {
		const response = await state.rpc(relayCommands.remoteRead, bridgeId, sessionId);
		validateRelayBatch(response);
		batch = response;
		messages.push(...batch.messages.map(message => parseServerMessage(message)));
	} while (batch.closeCode === undefined);
	const pairing = messages.find(message => message.type === 'pairing');
	assert.ok(pairing?.type === 'pairing');
	assert.deepStrictEqual({
		approvals: state.approvals.length,
		modal: state.approvals[0].modal,
		codeMatches: state.approvals[0].detail.includes(pairing.code),
		ready: messages.some(message => message.type === 'ready'),
	}, { approvals: 1, modal: true, codeMatches: true, ready: false });
});

test('remote relay commands reject foreign sessions and stale close cannot stop a new session', async t => {
	const state = await loadExtension(t);
	await state.run('start');
	const oldSessionId = state.resolved[0];
	const sessionId = randomUUID();
	await assert.rejects(state.rpc(relayCommands.remoteOpen, 'not-a-session', sessionId), /Invalid/);
	await assert.rejects(state.rpc(relayCommands.remoteRead, '12345678-1234-1234-1234-123456789abc', sessionId), /expired/);
	await state.run('stop');
	await state.run('start');
	const newSessionId = state.resolved[1];
	await state.rpc(relayCommands.remoteClose, oldSessionId, sessionId);
	await state.rpc(relayCommands.remoteStop, oldSessionId);
	await state.rpc(relayCommands.remoteOpen, newSessionId, sessionId);
	await state.rpc(relayCommands.remoteClose, newSessionId, sessionId);
	assert.deepStrictEqual({ starts: state.resolved.length, errors: state.errors }, { starts: 2, errors: [] });
});

test('a local creation failure releases the bridge and permits a fresh start', async t => {
	const state = await loadExtension(t);
	const execute = state.api.commands.executeCommand;
	state.api.commands.executeCommand = async (name, descriptor) => {
		if (name === relayCommands.localCreate) {
			throw new Error('local listener failed');
		}
		return execute(name, descriptor);
	};
	await state.run('start');
	state.api.commands.executeCommand = execute;
	await state.run('start');
	assert.deepStrictEqual({ stopped: state.stopped.length, starts: state.resolved.length, errors: state.errors.length }, { stopped: 1, starts: 1, errors: 1 });
});

test('companion responses cannot redirect the user back to a web gateway', async t => {
	const state = await loadExtension(t);
	const execute = state.api.commands.executeCommand;
	state.api.commands.executeCommand = async (name, descriptor) => name === relayCommands.localCreate
		? { version: relayVersion, url: 'https://example.devtunnels.ms/terminal' }
		: execute(name, descriptor);
	await state.run('start');
	await state.run('copyUrl');
	assert.deepStrictEqual({ copied: state.copied, stopped: state.stopped.length, errors: state.errors.length }, { copied: [], stopped: 1, errors: 1 });
});

test('both built extension entry points relay an approved real shell through serialized command RPC', async t => {
	const state = await loadExtension(t, true);
	const showApproval = state.api.window.showWarningMessage;
	state.api.window.showWarningMessage = async (message, options) => {
		await showApproval(message, options);
		return 'Allow';
	};
	await state.run('start');
	await state.run('copyUrl');
	assert.match(state.copied[0], /^http:\/\/127\.0\.0\.1:\d+\/terminal$/);
	const socket = new WebSocket(state.copied[0]);
	t.after(() => socket.terminate());
	let output = '';
	let exitCode: number | undefined;
	let code = '';
	socket.on('message', raw => {
		const message = parseServerMessage(raw.toString());
		switch (message.type) {
			case 'pairing': code = message.code; break;
			case 'ready':
				socket.send(JSON.stringify({ type: 'input', data: process.platform === 'win32' ? 'echo RPC_SHELL_OK\r\nexit 4\r\n' : 'echo RPC_SHELL_OK; exit 4\n' }));
				break;
			case 'data':
				output += message.data;
				socket.send(JSON.stringify({ type: 'ack', chars: message.data.length }));
				break;
			case 'exit': exitCode = message.exitCode; break;
			case 'error': state.errors.push(message.message); break;
		}
	});
	await once(socket, 'open');
	socket.send(JSON.stringify({ type: 'start', version: protocolVersion, cols: 80, rows: 24 }));
	await once(socket, 'close');
	assert.deepStrictEqual({
		exitCode, output: output.includes('RPC_SHELL_OK'), errors: state.errors,
		sameCode: state.approvals[0]?.detail.includes(code),
		routed: [relayCommands.localVersion, relayCommands.localCreate, relayCommands.remoteOpen, relayCommands.remoteRead, relayCommands.remoteWrite].every(command => state.calls.includes(command)),
	}, { exitCode: 4, output: true, errors: [], sameCode: true, routed: true });
});

test('one URL hosts independent real shells, survives an exit, and Stop Bridge closes all clients', async t => {
	const state = await loadExtension(t, true);
	state.api.window.showWarningMessage = async () => 'Allow';
	await state.run('start');
	await state.run('copyUrl');
	const url = state.copied[0];
	assert.ok(url, state.errors.join('; '));
	const connect = async () => {
		const socket = new WebSocket(url);
		t.after(() => socket.terminate());
		let output = '';
		let pairingCode = '';
		let exitCode: number | undefined;
		let ready: () => void = () => {};
		let rejectReady: (error: Error) => void = () => {};
		const initialized = new Promise<void>((resolve, reject) => { ready = resolve; rejectReady = reject; });
		const closed = new Promise<number>(resolve => socket.once('close', resolve));
		socket.once('error', error => rejectReady(error));
		socket.on('message', raw => {
			const message = parseServerMessage(raw.toString());
			switch (message.type) {
				case 'pairing': pairingCode = message.code; break;
				case 'ready': ready(); break;
				case 'data':
					output += message.data;
					socket.send(JSON.stringify({ type: 'ack', chars: message.data.length }));
					break;
				case 'exit': exitCode = message.exitCode; break;
				case 'error': rejectReady(new Error(message.message)); break;
			}
		});
		await once(socket, 'open');
		socket.send(JSON.stringify({ type: 'start', version: protocolVersion, cols: 80, rows: 24 }));
		await initialized;
		const input = (data: string) => socket.send(JSON.stringify({ type: 'input', data }));
		if (process.platform === 'win32') {
			input('@echo off\r\n');
		}
		const waitFor = async (text: string) => {
			for (let index = 0; index < 500; index++) {
				if (output.includes(text)) { return; }
				await delay(10);
			}
			assert.fail(`Missing remote output: ${text}`);
		};
		return { input, waitFor, closed, pairingCode, get output() { return output; }, get exitCode() { return exitCode; } };
	};
	const first = await connect();
	first.input(process.platform === 'win32' ? 'set SESSION_VALUE=alpha\r\n' : 'SESSION_VALUE=alpha\n');
	const second = await connect();
	second.input(process.platform === 'win32' ? 'set SESSION_VALUE=beta\r\n' : 'SESSION_VALUE=beta\n');
	const echoValue = process.platform === 'win32' ? 'echo POOL_VALUE=%SESSION_VALUE%\r\n' : 'echo POOL_VALUE=$SESSION_VALUE\n';
	first.input(echoValue);
	second.input(echoValue);
	await Promise.all([first.waitFor('POOL_VALUE=alpha'), second.waitFor('POOL_VALUE=beta')]);
	assert.deepStrictEqual({
		firstContainsSecond: first.output.includes('POOL_VALUE=beta'),
		secondContainsFirst: second.output.includes('POOL_VALUE=alpha'),
		distinctPairing: first.pairingCode !== second.pairingCode,
	}, { firstContainsSecond: false, secondContainsFirst: false, distinctPairing: true });
	first.input('exit 11\r\n');
	assert.equal(await first.closed, 1000);
	assert.equal(first.exitCode, 11);
	await state.run('copyUrl');
	assert.equal(state.copied[1], url);
	const third = await connect();
	second.input(echoValue.replace('POOL_VALUE', 'POOL_LATER'));
	await second.waitFor('POOL_LATER=beta');
	await state.run('stop');
	assert.deepStrictEqual(await Promise.all([second.closed, third.closed]), [1001, 1001]);
	assert.deepStrictEqual(state.errors, []);
});
