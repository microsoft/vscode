/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { createPromptInitialization } from '../src/promptInitialization.js';

const bashPath = process.platform === 'win32' ? join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Git', 'bin', 'bash.exe') : '/bin/bash';

test('native Bash executes the encoded initialization and acknowledges success', { skip: !existsSync(bashPath), timeout: 15_000 }, async () => {
	const setup = createPromptInitialization('bash', 'my-machine');
	assert.ok(setup);
	try {
		const { stdout } = await promisify(execFile)(bashPath, ['--noprofile', '--norc', '-ic', setup.command.trimEnd()], {
			env: { ...process.env, HISTFILE: '/dev/null' },
			timeout: 10_000,
		});
		assert.ok(stdout.includes(setup.successMarker));
		setup.accept(stdout);
		await setup.ready;
	} finally {
		setup.dispose();
	}
});

test('recognizes only supported shell executables, not arbitrary shell titles', () => {
	for (const title of ['pwsh', 'powershell.exe', 'C:\\Program Files\\PowerShell\\7\\pwsh.exe', '/usr/bin/bash']) {
		const setup = createPromptInitialization(title, 'my-machine');
		assert.ok(setup);
		assert.ok(setup.command.endsWith('\r'));
		setup.dispose();
	}
	for (const title of ['', 'Standalone Tunnel Terminal', 'cmd.exe', '/bin/sh', 'pwsh -Command something']) {
		assert.equal(createPromptInitialization(title, 'my-machine'), undefined);
	}
});

test('acknowledgements are not present as raw terminal escapes in the typed command', () => {
	const setup = createPromptInitialization('pwsh', 'my-machine');
	assert.ok(setup);
	assert.doesNotMatch(setup.command, /\x1b|\x07|\n/);
	setup.dispose();
});

test('preserves terminal output and strips a success marker at every possible frame split', async () => {
	const sample = createPromptInitialization('pwsh', 'my-machine');
	assert.ok(sample);
	const length = sample.successMarker.length;
	sample.dispose();
	for (let split = 0; split <= length; split++) {
		const setup = createPromptInitialization('pwsh', 'my-machine');
		assert.ok(setup);
		const output = setup.accept(`before${setup.successMarker.slice(0, split)}`)
			+ setup.accept(`${setup.successMarker.slice(split)}after`);
		await setup.ready;
		assert.equal(output + setup.flush(), 'beforeafter');
		setup.dispose();
	}
});

test('preserves ordinary VT sequences and unrelated OSC markers', () => {
	const setup = createPromptInitialization('bash', 'my-machine');
	assert.ok(setup);
	const chunks = ['\x1b', '[31mred\x1b[0m', '\x1b]0;title\x07', '\x1b]777;other\x07', '\x1b[?9001h'];
	assert.equal(chunks.map(chunk => setup.accept(chunk)).join('') + setup.flush(), chunks.join(''));
	setup.dispose();
});

test('split error acknowledgement rejects initialization without swallowing the shell error', async () => {
	const setup = createPromptInitialization('pwsh', 'my-machine');
	assert.ok(setup);
	const rejected = assert.rejects(setup.ready, /Remote prompt initialization failed.*--no-prompt-prefix/);
	const output = setup.accept(`shell error\r\n${setup.errorMarker.slice(0, -1)}`) + setup.accept('\x07PS> ');
	await rejected;
	assert.equal(output, 'shell error\r\nPS> ');
	setup.dispose();
});

test('cancellation flushes a partial control sequence without retaining output', async () => {
	const setup = createPromptInitialization('pwsh', 'my-machine');
	assert.ok(setup);
	const rejected = assert.rejects(setup.ready, /cancelled/);
	assert.equal(setup.accept('text\x1b]'), 'text');
	assert.equal(setup.flush(), '\x1b]');
	setup.dispose();
	await rejected;
	assert.equal(setup.flush(), '');
});
