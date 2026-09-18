/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { setImmediate } from 'node:timers/promises';
import { test, type TestContext } from 'node:test';
import { choose } from '../src/picker.js';
import { disableWin32InputMode, resetLocalInputMode } from '../src/terminalModes.js';
import { Input, Output } from './helpers.js';

class KeyboardModeOutput extends Output {
	win32InputMode = true;

	override _write(chunk: Buffer, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
		const data = chunk.toString();
		if (data.includes(disableWin32InputMode)) {
			this.win32InputMode = false;
		}
		super._write(chunk, encoding, callback);
		this.emit('rendered');
	}

	press(input: Input, character: string): void {
		const code = character.charCodeAt(0);
		if (this.win32InputMode) {
			const scanCode = character === '\r' ? 28 : 3;
			input.write(`\x1b[${code};${scanCode};${code};1;0;1_\x1b[${code};${scanCode};${code};0;0;1_`);
		} else {
			input.write(character);
		}
	}
}

function setup(t: TestContext) {
	const input = new Input();
	t.after(() => input.destroy());
	const output = new KeyboardModeOutput();
	t.after(() => output.destroy());
	const abort = new AbortController();
	t.after(() => abort.abort());
	return { input, output, abort };
}

async function promptRendered(t: TestContext, output: Output, start = 0): Promise<void> {
	const ready = () => output.value.slice(start).includes('Select a number (Ctrl+C cancels): ');
	if (!ready()) {
		await new Promise<void>(resolve => {
			const listener = () => {
				if (ready()) {
					output.off('rendered', listener);
					resolve();
				}
			};
			output.on('rendered', listener);
			t.after(() => output.off('rendered', listener));
		});
	}
	await setImmediate();
}

test('both pickers accept 2 and Enter after inherited Win32 input mode', { timeout: 5000 }, async t => {
	const io = setup(t);
	let previousCounts: number[] | undefined;
	for (const label of ['Your Machines', 'Select Remote Host']) {
		io.output.win32InputMode = true;
		const start = io.output.value.length;
		const selected = choose(label, [{ label: 'One', value: 1 }, { label: 'Two', value: 2 }], io.abort.signal, io);
		await promptRendered(t, io.output, start);
		assert.equal(io.output.win32InputMode, false);
		io.output.press(io.input, '2');
		io.output.press(io.input, '\r');
		assert.equal(await selected, 2);
		assert.equal(io.input.isRaw, false);
		assert.doesNotMatch(io.output.value.slice(start), /50;|13;/);
		const counts = ['data', 'keypress', 'end', 'error'].map(event => io.input.listenerCount(event));
		if (previousCounts) {
			assert.deepEqual(counts, previousCounts);
		}
		previousCounts = counts;
	}
});

test('invalid selections still reprompt and permit correction', { timeout: 5000 }, async t => {
	const io = setup(t);
	const selected = choose('Machines', [{ label: 'One', value: 1 }, { label: 'Two', value: 2 }], io.abort.signal, io);
	await promptRendered(t, io.output);
	const start = io.output.value.length;
	io.input.write('9\r');
	await promptRendered(t, io.output, start);
	assert.match(io.output.value, /Enter a number between 1 and 2/);
	io.input.write('2\r');
	assert.equal(await selected, 2);
});

test('Ctrl+C cancels the picker and restores cooked input', { timeout: 5000 }, async t => {
	const io = setup(t);
	const selected = choose('Machines', [{ label: 'One', value: 1 }], io.abort.signal, io);
	const rejected = assert.rejects(selected, { name: 'AbortError' });
	await promptRendered(t, io.output);
	io.output.press(io.input, '\x03');
	await rejected;
	assert.equal(io.input.isRaw, false);
});

test('an external abort still closes the picker', { timeout: 5000 }, async t => {
	const io = setup(t);
	const selected = choose('Hosts', [{ label: 'One', value: 1 }], io.abort.signal, io);
	const rejected = assert.rejects(selected, { name: 'AbortError' });
	await promptRendered(t, io.output);
	io.abort.abort();
	await rejected;
	assert.equal(io.input.isRaw, false);
});

test('picker can reset its terminal when prompt output is redirected', { timeout: 5000 }, async t => {
	const io = setup(t);
	const log = new PassThrough();
	t.after(() => log.destroy());
	const selected = choose('Machines', [{ label: 'One', value: 1 }], io.abort.signal, {
		input: io.input, output: log, modeOutput: io.output,
	});
	await setImmediate();
	assert.equal(io.output.win32InputMode, false);
	io.output.press(io.input, '1');
	io.output.press(io.input, '\r');
	assert.equal(await selected, 1);
	assert.doesNotMatch(log.read()?.toString() ?? '', /\x1b/);
});

test('reset does not emit terminal control sequences into redirected output', async t => {
	const output = new PassThrough();
	t.after(() => output.destroy());
	await resetLocalInputMode(output);
	assert.equal(output.read(), null);
});

test('reset surfaces output failures without leaving an error listener', async t => {
	class FailedOutput extends Output {
		override _write(_chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
			callback(new Error('Test output failure'));
		}
	}
	const output = new FailedOutput();
	t.after(() => output.destroy());
	await assert.rejects(resetLocalInputMode(output), /Unable to restore terminal keyboard mode/);
	await setImmediate();
	assert.equal(output.listenerCount('error'), 0);
});
