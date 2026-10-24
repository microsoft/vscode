/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { setImmediate } from 'node:timers/promises';
import { test, type TestContext } from 'node:test';
import { choose, chooseRemoteHost } from '../src/picker.js';
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

test('a sole tunnel is announced and returned without starting an input prompt', async t => {
	const io = setup(t);
	const originalListeners = io.input.eventNames();
	const selected = await choose('Your Machines', [{ label: 'my-machine', value: 'machine-id' }], io.abort.signal, io);
	assert.deepEqual({
		selected,
		output: io.output.value,
		raw: io.input.isRaw,
		listeners: io.input.eventNames(),
	}, {
		selected: 'machine-id',
		output: `${disableWin32InputMode}Automatically selected: my-machine (only available choice).\n`,
		raw: false,
		listeners: originalListeners,
	});
});

test('automatic selection sanitizes terminal control characters in its announcement', async t => {
	const io = setup(t);
	await choose('Machines', [{ label: 'my\x1b[31m-machine\x1b[0m\n', value: 1 }], io.abort.signal, io);
	assert.equal(io.output.value, `${disableWin32InputMode}Automatically selected: my-machine  (only available choice).\n`);
});

test('forced selection prompts for a sole tunnel', { timeout: 5000 }, async t => {
	const io = setup(t);
	const selected = choose('Your Machines', [{ label: 'my-machine', value: 'machine-id' }], io.abort.signal, io, false);
	await promptRendered(t, io.output);
	assert.doesNotMatch(io.output.value, /Automatically selected/);
	io.input.write('1\r');
	assert.equal(await selected, 'machine-id');
});

test('forced selection of a sole tunnel can be cancelled', { timeout: 5000 }, async t => {
	const io = setup(t);
	const selected = choose('Your Machines', [{ label: 'my-machine', value: 'machine-id' }], io.abort.signal, io, false);
	const rejected = assert.rejects(selected, { name: 'AbortError' });
	await promptRendered(t, io.output);
	io.input.write('\x03');
	await rejected;
	assert.equal(io.input.isRaw, false);
});

test('an aborted selection never automatically connects or prints a selection', async t => {
	const io = setup(t);
	io.abort.abort();
	await assert.rejects(choose('Machines', [{ label: 'One', value: 1 }], io.abort.signal, io), { name: 'AbortError' });
	assert.equal(io.output.value, '');
});

for (const canCreate of [false, true]) {
	test(`a sole existing host is automatically selected (canCreate=${canCreate})`, async t => {
		const io = setup(t);
		const originalListeners = io.input.eventNames();
		const selected = await chooseRemoteHost([{ type: 'standalone', pid: 42, instanceId: 'host-1' }], canCreate, io.abort.signal, io);
		assert.deepEqual({
			selected,
			output: io.output.value,
			raw: io.input.isRaw,
			listeners: io.input.eventNames(),
		}, {
			selected: { instanceId: 'host-1' },
			output: `${disableWin32InputMode}Automatically selected: standalone host, PID 42, instance host-1 (only available choice).\n`,
			raw: false,
			listeners: originalListeners,
		});
	});
}

for (const canCreate of [false, true]) {
	test(`forced selection prompts for a sole existing host (canCreate=${canCreate})`, { timeout: 5000 }, async t => {
		const io = setup(t);
		const selected = chooseRemoteHost([{ type: 'editor', pid: 42, instanceId: 'host-1' }], canCreate, io.abort.signal, io, false);
		await promptRendered(t, io.output);
		assert.doesNotMatch(io.output.value, /Automatically selected/);
		assert.equal(io.output.value.includes('Start a dedicated agent host'), canCreate);
		io.input.write('1\r');
		assert.deepEqual(await selected, { instanceId: 'host-1' });
	});
}

test('forced host selection permits requesting a new host instead of the sole existing host', { timeout: 5000 }, async t => {
	const io = setup(t);
	const selected = chooseRemoteHost([{ type: 'editor', pid: 42, instanceId: 'host-1' }], true, io.abort.signal, io, false);
	await promptRendered(t, io.output);
	io.input.write('2\r');
	assert.deepEqual(await selected, { newDedicated: true });
});

test('no existing hosts still requires explicit selection before creating a dedicated host', { timeout: 5000 }, async t => {
	const io = setup(t);
	const selected = chooseRemoteHost([], true, io.abort.signal, io);
	await promptRendered(t, io.output);
	assert.match(io.output.value, /Start a dedicated agent host/);
	assert.doesNotMatch(io.output.value, /Automatically selected/);
	io.output.press(io.input, '1');
	io.output.press(io.input, '\r');
	assert.deepEqual(await selected, { newDedicated: true });
});

for (const selection of ['2', '3']) {
	test(`multiple hosts keep all choices, including explicit creation (selection=${selection})`, { timeout: 5000 }, async t => {
		const io = setup(t);
		const selected = chooseRemoteHost([
			{ type: 'editor', pid: 1, instanceId: 'host-1' },
			{ type: 'standalone', pid: 2, instanceId: 'host-2' },
		], true, io.abort.signal, io);
		await promptRendered(t, io.output);
		assert.doesNotMatch(io.output.value, /Automatically selected/);
		io.input.write(`${selection}\r`);
		assert.deepEqual(await selected, selection === '2' ? { instanceId: 'host-2' } : { newDedicated: true });
	});
}

test('no existing hosts and no creation support fails explicitly', async t => {
	const io = setup(t);
	await assert.rejects(chooseRemoteHost([], false, io.abort.signal, io), /No choices available/);
	assert.equal(io.output.value, '');
});

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
	const selected = choose('Machines', [{ label: 'One', value: 1 }, { label: 'Two', value: 2 }], io.abort.signal, io);
	const rejected = assert.rejects(selected, { name: 'AbortError' });
	await promptRendered(t, io.output);
	io.output.press(io.input, '\x03');
	await rejected;
	assert.equal(io.input.isRaw, false);
});

test('an external abort still closes the picker', { timeout: 5000 }, async t => {
	const io = setup(t);
	const selected = choose('Hosts', [{ label: 'One', value: 1 }, { label: 'Two', value: 2 }], io.abort.signal, io);
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
	const selected = choose('Machines', [{ label: 'One', value: 1 }, { label: 'Two', value: 2 }], io.abort.signal, {
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
