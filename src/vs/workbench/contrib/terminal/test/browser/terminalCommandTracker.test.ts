/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Terminal } from 'xterm';
import { CommandTrackerAddon } from 'vs/workbench/contrib/terminal/browser/xterm/commandTrackerAddon';
import { isWindows } from 'vs/base/common/platform';
import { IXtermCore } from 'vs/workbench/contrib/terminal/browser/xterm-private';
import { timeout } from 'vs/base/common/async';
import { TerminalCapabilityStore } from 'vs/platform/terminal/common/capabilities/terminalCapabilityStore';
import { PartialCommandDetectionCapability } from 'vs/platform/terminal/common/capabilities/partialCommandDetectionCapability';
import { TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';

interface TestTerminal extends Terminal {
	_core: IXtermCore;
}

const ROWS = 10;
const COLS = 10;

async function writeP(terminal: TestTerminal, data: string): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		const failTimeout = timeout(2000);
		failTimeout.then(() => reject('Writing to xterm is taking longer than 2 seconds'));
		terminal.write(data, () => {
			failTimeout.cancel();
			resolve();
		});
	});
}

suite('Workbench - TerminalCommandTracker', function () {
	let xterm: TestTerminal;
	let commandTracker: CommandTrackerAddon;
	let store: TerminalCapabilityStore;

	// These tests are flaky on GH actions as sometimes they are particularly slow and timeout
	// on the await writeP calls. These have been reduced but the timeout is increased to try
	// catch edge cases.
	this.timeout(20000);

	setup(async function () {
		xterm = (<TestTerminal>new Terminal({
			cols: COLS,
			rows: ROWS
		}));
		// Fill initial viewport
		let data = '';
		for (let i = 0; i < ROWS - 1; i++) {
			data += `${i}\n`;
		}
		await writeP(xterm, data);
		store = new TerminalCapabilityStore();
		commandTracker = new CommandTrackerAddon(store);
		store.add(TerminalCapability.PartialCommandDetection, new PartialCommandDetectionCapability(xterm));
		xterm.loadAddon(commandTracker);
	});

	suite('Command tracking', () => {
		test('should track commands when the prompt is of sufficient size', async () => {
			assert.strictEqual(xterm.markers.length, 0);
			await writeP(xterm, '\x1b[3G'); // Move cursor to column 3
			xterm._core._onData.fire('\x0d');
			assert.strictEqual(xterm.markers.length, 1);
		});
		test('should not track commands when the prompt is too small', async () => {
			assert.strictEqual(xterm.markers.length, 0);
			await writeP(xterm, '\x1b[2G'); // Move cursor to column 2
			xterm._core._onData.fire('\x0d');
			assert.strictEqual(xterm.markers.length, 0);
		});
	});

	suite('Commands', () => {
		let container: HTMLElement;
		setup(() => {
			container = document.createElement('div');
			document.body.appendChild(container);
			xterm.open(container);
		});
		teardown(() => {
			document.body.removeChild(container);
		});
		test.skip('should scroll to the next and previous commands', async () => {
			await writeP(xterm, '\x1b[3G'); // Move cursor to column 3
			xterm._core._onData.fire('\x0d'); // Mark line #10
			assert.strictEqual(xterm.markers[0].line, 9);

			await writeP(xterm, `\r\n`.repeat(20));
			assert.strictEqual(xterm.buffer.active.baseY, 20);
			assert.strictEqual(xterm.buffer.active.viewportY, 20);

			// Scroll to marker
			commandTracker.scrollToPreviousCommand();
			assert.strictEqual(xterm.buffer.active.viewportY, 9);

			// Scroll to top boundary
			commandTracker.scrollToPreviousCommand();
			assert.strictEqual(xterm.buffer.active.viewportY, 0);

			// Scroll to marker
			commandTracker.scrollToNextCommand();
			assert.strictEqual(xterm.buffer.active.viewportY, 9);

			// Scroll to bottom boundary
			commandTracker.scrollToNextCommand();
			assert.strictEqual(xterm.buffer.active.viewportY, 20);
		});
		test('should select to the next and previous commands', async () => {
			await writeP(xterm,
				'\r0' +
				'\n\r1' +
				'\x1b[3G' // Move cursor to column 3
			);
			xterm._core._onData.fire('\x0d'); // Mark line
			assert.strictEqual(xterm.markers[0].line, 10);
			await writeP(xterm,
				'\n\r2' +
				'\x1b[3G' // Move cursor to column 3
			);
			xterm._core._onData.fire('\x0d'); // Mark line
			assert.strictEqual(xterm.markers[1].line, 11);
			await writeP(xterm, '\n\r3');

			assert.strictEqual(xterm.buffer.active.baseY, 3);
			assert.strictEqual(xterm.buffer.active.viewportY, 3);

			assert.strictEqual(xterm.getSelection(), '');
			commandTracker.selectToPreviousCommand();
			assert.strictEqual(xterm.getSelection(), '2');
			commandTracker.selectToPreviousCommand();
			assert.strictEqual(xterm.getSelection(), isWindows ? '1\r\n2' : '1\n2');
			commandTracker.selectToNextCommand();
			assert.strictEqual(xterm.getSelection(), '2');
			commandTracker.selectToNextCommand();
			assert.strictEqual(xterm.getSelection(), isWindows ? '\r\n' : '\n');
		});
		test.skip('should select to the next and previous lines & commands', async () => {
			await writeP(xterm,
				'\r0' +
				'\n\r1' +
				'\x1b[3G' // Move cursor to column 3
			);
			xterm._core._onData.fire('\x0d'); // Mark line
			assert.strictEqual(xterm.markers[0].line, 10);
			await writeP(xterm,
				'\n\r2' +
				'\x1b[3G' // Move cursor to column 3
			);
			xterm._core._onData.fire('\x0d'); // Mark line
			assert.strictEqual(xterm.markers[1].line, 11);
			await writeP(xterm, '\n\r3');

			assert.strictEqual(xterm.buffer.active.baseY, 3);
			assert.strictEqual(xterm.buffer.active.viewportY, 3);

			assert.strictEqual(xterm.getSelection(), '');
			commandTracker.selectToPreviousLine();
			assert.strictEqual(xterm.getSelection(), '2');
			commandTracker.selectToNextLine();
			commandTracker.selectToNextLine();
			assert.strictEqual(xterm.getSelection(), '3');
			commandTracker.selectToPreviousCommand();
			commandTracker.selectToPreviousCommand();
			commandTracker.selectToNextLine();
			assert.strictEqual(xterm.getSelection(), '2');
			commandTracker.selectToPreviousCommand();
			assert.strictEqual(xterm.getSelection(), isWindows ? '1\r\n2' : '1\n2');
			commandTracker.selectToPreviousLine();
			assert.strictEqual(xterm.getSelection(), isWindows ? '0\r\n1\r\n2' : '0\n1\n2');
		});
	});
});
