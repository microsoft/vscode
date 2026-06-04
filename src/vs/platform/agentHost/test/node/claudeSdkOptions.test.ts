/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { buildOptions, buildSubprocessEnv } from '../../node/claude/claudeSdkOptions.js';
import type { IClaudeProxyHandle } from '../../node/claude/claudeProxyService.js';

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
});

suite('claudeSdkOptions / buildOptions plugins projection', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const proxyHandle: IClaudeProxyHandle = {
		baseUrl: 'http://127.0.0.1:0',
		nonce: 'n',
		dispose: () => { },
	};

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
			proxyHandle,
			() => { },
			() => { },
		);
		assert.deepStrictEqual(opts.plugins, [
			{ type: 'local', path: URI.file('/p/a').fsPath },
			{ type: 'local', path: URI.file('/p/b').fsPath },
		]);
	});

	test('empty plugins array omits Options.plugins', async () => {
		const opts = await buildOptions(input([]), proxyHandle, () => { }, () => { });
		assert.strictEqual(opts.plugins, undefined);
	});

	test('undefined plugins omits Options.plugins', async () => {
		const opts = await buildOptions(input(undefined), proxyHandle, () => { }, () => { });
		assert.strictEqual(opts.plugins, undefined);
	});
});
