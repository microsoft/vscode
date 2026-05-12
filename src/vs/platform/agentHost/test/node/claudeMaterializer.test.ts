/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { buildSubprocessEnv } from '../../node/claude/claudeMaterializer.js';

suite('ClaudeMaterializer / buildSubprocessEnv', () => {

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
