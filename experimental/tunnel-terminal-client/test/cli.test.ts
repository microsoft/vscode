/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { ensureSupportedRuntime } from '../src/runtime.js';

const execute = promisify(execFile);
const mainPath = fileURLToPath(new URL('../src/main.js', import.meta.url));

test('PATH command uses the same executable entry point as direct invocation', async () => {
	const { bin }: { bin: Record<string, string> } = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
	assert.deepEqual(bin, { tunnel: 'out/src/main.js' });
	assert.match(await readFile(mainPath, 'utf8'), /^#!\/usr\/bin\/env node\r?\n/);
});

test('help is available without credentials or a TTY', async () => {
	const { stdout, stderr } = await execute(process.execPath, [mainPath, '--help'], {
		env: { ...process.env, TUNNEL_ACCESS_TOKEN: 'test-value-must-not-be-printed' },
		timeout: 5000,
	});
	assert.match(stdout, /Ctrl\+\]/);
	assert.match(stdout, /Usage: tunnel \[--tunnel NAME_OR_ID\]/);
	assert.match(stdout, /A sole tunnel or existing remote host is selected automatically and announced/);
	assert.match(stdout, /--force-select\s+Show pickers even when only one choice exists/);
	assert.match(stdout, /Node\.js 22\.x/);
	assert.doesNotMatch(stdout + stderr, /test-value-must-not-be-printed/);
	assert.equal(stderr, '');
});

test('the test runner uses the supported client runtime', () => {
	assert.doesNotThrow(() => ensureSupportedRuntime());
});

for (const [name, args, expected] of [
	['rejects an unsupported provider', ['--provider', 'invalid'], /provider must be/],
	['rejects ambiguous host selection flags', ['--instance', 'a', '--new-host'], /mutually exclusive/],
	['rejects a non-file working directory', ['--cwd', 'https://example.test/'], /remote file URI/],
	['rejects empty option values', ['--tunnel', ''], /non-empty/],
	['requires interactive terminal before authentication', [], /interactive terminal/],
	['accepts force-select and requires an interactive terminal', ['--force-select'], /interactive terminal/],
] as const) {
	test(name, async () => {
		await assert.rejects(execute(process.execPath, [mainPath, ...args], { timeout: 5000 }), expected);
	});
}
