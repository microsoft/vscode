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
import xterm from '@xterm/headless';
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

test('suppresses startup echo and handles every start-marker frame split', async () => {
	const sample = createPromptInitialization('pwsh', 'my-machine');
	assert.ok(sample);
	const length = sample.startMarker.length;
	sample.dispose();
	for (let split = 0; split <= length; split++) {
		const setup = createPromptInitialization('pwsh', 'my-machine');
		assert.ok(setup);
		const output = setup.accept(`${setup.command}${setup.startMarker.slice(0, split)}`)
			+ setup.accept(`${setup.startMarker.slice(split)}[my-machine] PS> ${setup.successMarker}`);
		await setup.ready;
		assert.equal(output + setup.flush(), '\x1b[0m\x1b[2J\x1b[H[my-machine] PS> ');
		setup.dispose();
	}
});

test('preserves setup diagnostics and strips a success marker at every possible frame split', async () => {
	const sample = createPromptInitialization('pwsh', 'my-machine');
	assert.ok(sample);
	const length = sample.successMarker.length;
	sample.dispose();
	for (let split = 0; split <= length; split++) {
		const setup = createPromptInitialization('pwsh', 'my-machine');
		assert.ok(setup);
		setup.accept(setup.startMarker);
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
	setup.accept(setup.startMarker);
	const chunks = ['\x1b', '[31mred\x1b[0m', '\x1b]0;title\x07', '\x1b]777;other\x07', '\x1b[?9001h'];
	assert.equal(chunks.map(chunk => setup.accept(chunk)).join('') + setup.flush(), chunks.join(''));
	setup.dispose();
});

test('split error acknowledgement rejects initialization without swallowing the shell error', async () => {
	const setup = createPromptInitialization('pwsh', 'my-machine');
	assert.ok(setup);
	const rejected = assert.rejects(setup.ready, /Remote prompt initialization failed.*--no-prompt-prefix/);
	setup.accept(setup.startMarker);
	const output = setup.accept(`shell error\r\n${setup.errorMarker.slice(0, -1)}`) + setup.accept('\x07PS> ');
	await rejected;
	assert.equal(output, 'shell error\r\nPS> ');
	setup.dispose();
});

test('cancellation after setup starts flushes a partial control sequence', async () => {
	const setup = createPromptInitialization('pwsh', 'my-machine');
	assert.ok(setup);
	setup.accept(setup.startMarker);
	const rejected = assert.rejects(setup.ready, /cancelled/);
	assert.equal(setup.accept('text\x1b]'), 'text');
	assert.equal(setup.flush(), '\x1b]');
	setup.dispose();
	await rejected;
	assert.equal(setup.flush(), '');
});

test('cancellation before setup starts does not dump echoed helper code', async () => {
	const setup = createPromptInitialization('pwsh', 'my-machine');
	assert.ok(setup);
	const rejected = assert.rejects(setup.ready, /cancelled/);
	assert.equal(setup.accept(setup.command), '');
	assert.equal(setup.flush(), '');
	setup.dispose();
	await rejected;
});

test('failure before the start marker retains bounded readable diagnostics, not the encoded payload', () => {
	const setup = createPromptInitialization('pwsh', 'my-machine');
	assert.ok(setup);
	assert.equal(setup.accept(`${'A'.repeat(100_000)}\r\nParserError: startup command was rejected\r\n`), '');
	const diagnostic = setup.flush(true);
	assert.match(diagnostic, /ParserError: startup command was rejected/);
	assert.doesNotMatch(diagnostic, /A{80}/);
	assert.ok(diagnostic.length < 2200);
	assert.equal(setup.flush(true), '');
	setup.dispose();
});

test('an acknowledgement without the execution-start marker is not treated as successful setup', async () => {
	const setup = createPromptInitialization('pwsh', 'my-machine');
	assert.ok(setup);
	const rejected = assert.rejects(setup.ready, /failed before setup started/);
	setup.accept(setup.successMarker);
	await rejected;
	setup.dispose();
});

test('rendered startup contains a single clean prompt and no helper code or encoded scrollback', async t => {
	for (const cols of [40, 120]) {
		const terminal = new xterm.Terminal({ cols, rows: 24, scrollback: 1000, allowProposedApi: true });
		t.after(() => terminal.dispose());
		const setup = createPromptInitialization('pwsh', 'my-machine');
		assert.ok(setup);
		t.after(() => setup.dispose());
		const draw = (data: string) => data ? new Promise<void>(resolve => terminal.write(data, resolve)) : Promise.resolve();
		await draw('Local terminal history\r\nPS> tunnel\r\nInitializing remote prompt...\r\n');
		const echo = `PS> ${setup.command}\r\n`.repeat(3);
		for (let i = 0; i < echo.length; i += 97) {
			await draw(setup.accept(echo.slice(i, i + 97)));
		}
		await draw(setup.accept(`${setup.startMarker}${setup.successMarker}[my-machine] PS C:\\work> `));
		await setup.ready;
		const lines = Array.from({ length: terminal.buffer.active.length }, (_, index) =>
			terminal.buffer.active.getLine(index)?.translateToString(true) ?? '');
		assert.deepEqual(lines.filter(line => line.trim()), ['[my-machine] PS C:\\work> ']);
		assert.equal(terminal.buffer.active.cursorY, 0);
		assert.equal(terminal.buffer.active.cursorX, '[my-machine] PS C:\\work> '.length);
	}
});

test('refreshing the prompt viewport preserves existing terminal scrollback', async t => {
	const terminal = new xterm.Terminal({ cols: 80, rows: 6, scrollback: 100, allowProposedApi: true });
	t.after(() => terminal.dispose());
	const setup = createPromptInitialization('bash', 'my-machine');
	assert.ok(setup);
	t.after(() => setup.dispose());
	const draw = (data: string) => new Promise<void>(resolve => terminal.write(data, resolve));
	await draw(Array.from({ length: 20 }, (_, index) => `existing history ${index}\r\n`).join(''));
	const history = () => Array.from({ length: terminal.buffer.active.baseY }, (_, i) =>
		terminal.buffer.active.getLine(i)?.translateToString(true) ?? '');
	const before = history();
	assert.ok(before.length > 0);
	await draw(setup.accept(`${setup.startMarker}${setup.successMarker}[my-machine] $ `));
	await setup.ready;
	assert.deepEqual(history(), before);
});
