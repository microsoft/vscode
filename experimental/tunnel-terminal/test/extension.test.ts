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

async function loadExtension(t: TestContext) {
	const commands = new Map<string, () => Promise<void>>();
	const errors: string[] = [];
	const warnings: string[] = [];
	const notifications: string[] = [];
	const copied: string[] = [];
	const resolved: string[] = [];
	const subscriptions: Disposable[] = [];
	const api = {
		commands: {
			registerCommand: (name: string, run: () => Promise<void>): Disposable => {
				commands.set(name, run);
				return { dispose: () => { commands.delete(name); } };
			},
		},
		window: {
			createOutputChannel: () => ({ dispose() {}, error() {}, info() {} }),
			showErrorMessage: async (message: string) => { errors.push(message); },
			showWarningMessage: async (message: string) => { warnings.push(message); },
			showInformationMessage: async (message: string) => { notifications.push(message); return undefined; },
			showWorkspaceFolderPick: async () => undefined,
			showInputBox: async (): Promise<string | undefined> => process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
		},
		workspace: { isTrusted: true, workspaceFolders: [{ uri: { fsPath: process.cwd() } }] },
		env: {
			remoteName: 'tunnel',
			uiKind: 1,
			asExternalUri: async (uri: TestUri) => { resolved.push(uri.value); return uri; },
			clipboard: { writeText: async (text: string) => { copied.push(text); } },
		},
		UIKind: { Desktop: 1, Web: 2 },
		Uri: TestUri,
		CancellationTokenSource: TestCancellation,
		l10n: { t: (message: string, ...args: string[]) => message.replace(/\{(?<index>\d+)\}/g, (_match, index: string) => args[Number(index)] ?? '') },
	};
	const entry = join(process.cwd(), 'dist', 'extension.cjs');
	const nodeRequire = createRequire(entry);
	const module: { exports: { activate?: (context: { subscriptions: Disposable[] }) => void } } = { exports: {} };
	runInNewContext(await readFile(entry, 'utf8'), {
		module, exports: module.exports, __dirname: join(process.cwd(), 'dist'),
		require: (id: string) => id === 'vscode' ? api : nodeRequire(id),
		process, console, Buffer, URL, setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask,
	});
	assert.ok(module.exports.activate);
	module.exports.activate({ subscriptions });
	t.after(() => { for (const disposable of subscriptions.reverse()) { disposable.dispose(); } });
	const run = async (name: string) => {
		const command = commands.get(`experimentalTunnelTerminal.${name}`);
		assert.ok(command);
		await command();
	};
	return { api, run, errors, warnings, notifications, copied, resolved };
}

test('extension forwards its loopback endpoint and copies connection details only on request', async t => {
	const state = await loadExtension(t);
	await state.run('start');
	assert.deepStrictEqual({ resolutions: state.resolved.length, copied: state.copied, errors: state.errors }, { resolutions: 1, copied: [], errors: [] });
	await state.run('copyUrl');
	await state.run('copyToken');
	assert.match(state.copied[0], /^http:\/\/127\.0\.0\.1:\d+\/terminal$/);
	assert.match(state.copied[1], /^[a-f0-9]{64}$/);
	await state.run('stop');
	await state.run('copyToken');
	assert.deepStrictEqual({ copied: state.copied.length, warnings: state.warnings.length }, { copied: 2, warnings: 1 });
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
	state.api.window.showInputBox = () => new Promise<string>(resolve => { resolvePrompt = resolve; });
	const starting = state.run('start');
	await state.run('stop');
	resolvePrompt('cmd.exe');
	await starting;
	assert.deepStrictEqual({ resolutions: state.resolved, errors: state.errors }, { resolutions: [], errors: [] });
});

test('forwarding failure is reported and a subsequent start succeeds', async t => {
	const state = await loadExtension(t);
	const resolve = state.api.env.asExternalUri;
	state.api.env.asExternalUri = async () => { throw new Error('forwarding unavailable'); };
	await state.run('start');
	state.api.env.asExternalUri = resolve;
	await state.run('start');
	assert.deepStrictEqual({ resolutions: state.resolved.length, errors: state.errors.length }, { resolutions: 1, errors: 1 });
});

test('stop during port forwarding does not publish stale credentials', async t => {
	const state = await loadExtension(t);
	let finishForwarding: () => void = () => {};
	let forwardingStarted: () => void = () => {};
	const forwarding = new Promise<void>(resolve => { forwardingStarted = resolve; });
	state.api.env.asExternalUri = uri => new Promise<TestUri>(resolve => {
		forwardingStarted();
		finishForwarding = () => resolve(uri);
	});
	const starting = state.run('start');
	await forwarding;
	await state.run('stop');
	finishForwarding();
	await starting;
	await state.run('copyToken');
	assert.deepStrictEqual({ copied: state.copied, warnings: state.warnings.length, errors: state.errors }, { copied: [], warnings: 1, errors: [] });
});
