/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { buildOptions, buildSubprocessEnv } from '../../node/claude/claudeSdkOptions.js';
import type { ClaudeTransport, IClaudeProxyHandle } from '../../node/claude/claudeProxyService.js';

suite('claudeSdkOptions / buildSubprocessEnv', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const SAVED_ENV = { ...process.env };
	const KNOWN_KEYS = [
		'ELECTRON_RUN_AS_NODE',
		'NODE_OPTIONS',
		'ANTHROPIC_API_KEY',
		'VSCODE_PID',
		'VSCODE_NLS_CONFIG',
		'ELECTRON_NO_ATTACH_CONSOLE',
		'PATH',
		'HOME',
	];

	function clearAndSet(values: Record<string, string>): void {
		for (const key of KNOWN_KEYS) { delete process.env[key]; }
		for (const [key, value] of Object.entries(values)) { process.env[key] = value; }
	}

	teardown(() => {
		for (const key of KNOWN_KEYS) { delete process.env[key]; }
		for (const [key, value] of Object.entries(SAVED_ENV)) {
			if (value !== undefined) { process.env[key] = value; }
		}
	});

	test('strips VSCODE_*, ELECTRON_*, NODE_OPTIONS, ANTHROPIC_API_KEY; keeps ELECTRON_RUN_AS_NODE; preserves unrelated vars', () => {
		clearAndSet({
			VSCODE_PID: '1234',
			VSCODE_NLS_CONFIG: '{}',
			ELECTRON_NO_ATTACH_CONSOLE: '1',
			NODE_OPTIONS: '--inspect',
			ANTHROPIC_API_KEY: 'sk-leak',
			PATH: '/usr/bin',
			HOME: '/Users/test',
		});

		const env = buildSubprocessEnv();

		assert.deepStrictEqual({
			runAsNode: env.ELECTRON_RUN_AS_NODE,
			nodeOptions: env.NODE_OPTIONS,
			anthropicKey: env.ANTHROPIC_API_KEY,
			vscodePid: env.VSCODE_PID,
			vscodeNls: env.VSCODE_NLS_CONFIG,
			electronOther: env.ELECTRON_NO_ATTACH_CONSOLE,
			path: env.PATH,
			home: env.HOME,
		}, {
			runAsNode: '1',
			nodeOptions: undefined,
			anthropicKey: undefined,
			vscodePid: undefined,
			vscodeNls: undefined,
			electronOther: undefined,
			path: undefined, // not explicitly forwarded; PATH is composed in settingsEnv, not subprocessEnv
			home: undefined, // unrelated vars are simply absent from the override map (inherited by SDK)
		});
	});

	test('always sets ELECTRON_RUN_AS_NODE=1 even when not present in process.env', () => {
		clearAndSet({});

		const env = buildSubprocessEnv();

		assert.strictEqual(env.ELECTRON_RUN_AS_NODE, '1');
	});

	test('native mode (proxied=false) inherits auth vars + PATH (SDK replace semantics) while still stripping VSCODE_*/ELECTRON_*/NODE_OPTIONS', () => {
		clearAndSet({
			VSCODE_PID: '1234',
			ELECTRON_NO_ATTACH_CONSOLE: '1',
			NODE_OPTIONS: '--inspect',
			ANTHROPIC_API_KEY: 'sk-user-key',
			CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-oat-user',
			PATH: '/usr/bin',
			HOME: '/Users/test',
		});

		const env = buildSubprocessEnv(false);

		assert.deepStrictEqual({
			// Inherited so the user's own credentials reach the `claude` subprocess.
			anthropicKey: env.ANTHROPIC_API_KEY,
			oauthToken: env.CLAUDE_CODE_OAUTH_TOKEN,
			path: env.PATH,
			home: env.HOME,
			// Still stripped — these break the Electron-node subprocess.
			vscodePid: env.VSCODE_PID,
			electronOther: env.ELECTRON_NO_ATTACH_CONSOLE,
			nodeOptions: env.NODE_OPTIONS,
			runAsNode: env.ELECTRON_RUN_AS_NODE,
		}, {
			anthropicKey: 'sk-user-key',
			oauthToken: 'sk-ant-oat-user',
			path: '/usr/bin',
			home: '/Users/test',
			vscodePid: undefined,
			electronOther: undefined,
			nodeOptions: undefined,
			runAsNode: '1',
		});
	});
});

suite('claudeSdkOptions / buildOptions plugins projection', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const proxyHandle: IClaudeProxyHandle = {
		baseUrl: 'http://127.0.0.1:0',
		nonce: 'n',
		dispose: () => { },
	};
	const proxyTransport: ClaudeTransport = { kind: 'proxy', handle: proxyHandle };

	function input(plugins: readonly URI[] | undefined) {
		return {
			sessionId: 's1',
			workingDirectory: URI.file('/tmp/x'),
			model: undefined,
			abortController: new AbortController(),
			permissionMode: 'default' as const,
			canUseTool: async () => ({ behavior: 'allow' as const, updatedInput: {} }),
			isResume: false,
			mcpServers: undefined,
			...(plugins !== undefined ? { plugins } : {}),
		};
	}

	test('non-empty plugins project to Options.plugins as local entries', async () => {
		const opts = await buildOptions(
			input([URI.file('/p/a'), URI.file('/p/b')]),
			proxyTransport,
			() => { },
			() => { },
		);
		assert.deepStrictEqual(opts.plugins, [
			{ type: 'local', path: URI.file('/p/a').fsPath },
			{ type: 'local', path: URI.file('/p/b').fsPath },
		]);
	});

	test('empty plugins array omits Options.plugins', async () => {
		const opts = await buildOptions(input([]), proxyTransport, () => { }, () => { });
		assert.strictEqual(opts.plugins, undefined);
	});

	test('undefined plugins omits Options.plugins', async () => {
		const opts = await buildOptions(input(undefined), proxyTransport, () => { }, () => { });
		assert.strictEqual(opts.plugins, undefined);
	});

	test('proxy transport sets ANTHROPIC_BASE_URL + per-session ANTHROPIC_AUTH_TOKEN', async () => {
		const opts = await buildOptions(input(undefined), proxyTransport, () => { }, () => { });
		const env = (opts.settings as { env?: Record<string, string> }).env ?? {};
		assert.deepStrictEqual({
			baseUrl: env.ANTHROPIC_BASE_URL,
			authToken: env.ANTHROPIC_AUTH_TOKEN,
			nonessential: env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC,
		}, {
			baseUrl: 'http://127.0.0.1:0',
			authToken: 'n.s1',
			nonessential: '1',
		});
	});

	test('native transport omits ANTHROPIC_BASE_URL/ANTHROPIC_AUTH_TOKEN (subprocess env carries the user credentials)', async () => {
		const opts = await buildOptions(input(undefined), { kind: 'native' }, () => { }, () => { });
		const env = (opts.settings as { env?: Record<string, string> }).env ?? {};
		assert.deepStrictEqual({
			baseUrl: env.ANTHROPIC_BASE_URL,
			authToken: env.ANTHROPIC_AUTH_TOKEN,
			nonessential: env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC,
		}, {
			baseUrl: undefined,
			authToken: undefined,
			nonessential: '1',
		});
	});
});

suite('claudeSdkOptions / buildOptions resumeSessionAt projection', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const proxyHandle: IClaudeProxyHandle = {
		baseUrl: 'http://127.0.0.1:0',
		nonce: 'n',
		dispose: () => { },
	};
	const proxyTransport: ClaudeTransport = { kind: 'proxy', handle: proxyHandle };

	function input(isResume: boolean, resumeSessionAt: string | undefined) {
		return {
			sessionId: 's1',
			workingDirectory: URI.file('/tmp/x'),
			model: undefined,
			abortController: new AbortController(),
			permissionMode: 'default' as const,
			canUseTool: async () => ({ behavior: 'allow' as const, updatedInput: {} }),
			isResume,
			mcpServers: undefined,
			...(resumeSessionAt !== undefined ? { resumeSessionAt } : {}),
		};
	}

	test('resume + resumeSessionAt projects onto Options.resume and Options.resumeSessionAt', async () => {
		const opts = await buildOptions(input(true, 'anchor-uuid'), proxyTransport, () => { }, () => { });
		assert.deepStrictEqual(
			{ resume: opts.resume, sessionId: opts.sessionId, resumeSessionAt: opts.resumeSessionAt },
			{ resume: 's1', sessionId: undefined, resumeSessionAt: 'anchor-uuid' },
		);
	});

	test('resume without resumeSessionAt omits Options.resumeSessionAt', async () => {
		const opts = await buildOptions(input(true, undefined), proxyTransport, () => { }, () => { });
		assert.deepStrictEqual(
			{ resume: opts.resume, resumeSessionAt: opts.resumeSessionAt },
			{ resume: 's1', resumeSessionAt: undefined },
		);
	});

	test('non-resume startup never carries resumeSessionAt even when provided', async () => {
		const opts = await buildOptions(input(false, 'anchor-uuid'), proxyTransport, () => { }, () => { });
		assert.deepStrictEqual(
			{ sessionId: opts.sessionId, resume: opts.resume, resumeSessionAt: opts.resumeSessionAt },
			{ sessionId: 's1', resume: undefined, resumeSessionAt: undefined },
		);
	});
});
