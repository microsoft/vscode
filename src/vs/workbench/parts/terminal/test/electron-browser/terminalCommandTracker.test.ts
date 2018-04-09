/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { Terminal } from 'vscode-xterm';
import { TerminalCommandTracker } from 'vs/workbench/parts/terminal/node/terminalCommandTracker';

interface TestTerminal extends Terminal {
	writeBuffer: string[];
	_innerWrite(): void;
}

function syncWrite(term: TestTerminal, data: string): void {
	// Terminal.write is asynchronous
	term.writeBuffer.push(data);
	term._innerWrite();
}

const ROWS = 10;
const COLS = 10;

suite('Workbench - TerminalCommandTracker', () => {
	let xterm: TestTerminal;
	let commandTracker: TerminalCommandTracker;

	setup(() => {
		xterm = (<TestTerminal>new Terminal({
			cols: COLS,
			rows: ROWS
		}));
		// Fill initial viewport
		for (let i = 0; i < ROWS - 1; i++) {
			syncWrite(xterm, `${i}\n`);
		}
		commandTracker = new TerminalCommandTracker(xterm);
	});

	suite('Command tracking', () => {
		test('should track commands when the prompt is of sufficient size', () => {
			assert.equal(xterm.markers.length, 0);
			syncWrite(xterm, '\x1b[3G'); // Move cursor to column 3
			xterm.emit('key', '\x0d');
			assert.equal(xterm.markers.length, 1);
		});
		test('should not track commands when the prompt is too small', () => {
			assert.equal(xterm.markers.length, 0);
			syncWrite(xterm, '\x1b[2G'); // Move cursor to column 2
			xterm.emit('key', '\x0d');
			assert.equal(xterm.markers.length, 0);
		});
	});

	suite('Commands', () => {
		test('should scroll to the next and previous commands', () => {
			syncWrite(xterm, '\x1b[3G'); // Move cursor to column 3
			xterm.emit('key', '\x0d'); // Mark line #10
			assert.equal(xterm.markers[0].line, 9);

			for (let i = 0; i < 20; i++) {
				syncWrite(xterm, `\r\n`);
			}
			assert.equal(xterm.buffer.ybase, 20);
			assert.equal(xterm.buffer.ydisp, 20);

			// Scroll to marker
			commandTracker.scrollToPreviousCommand();
			assert.equal(xterm.buffer.ydisp, 9);

			// Scroll to top boundary
			commandTracker.scrollToPreviousCommand();
			assert.equal(xterm.buffer.ydisp, 0);

			// Scroll to marker
			commandTracker.scrollToNextCommand();
			assert.equal(xterm.buffer.ydisp, 9);

			// Scroll to bottom boundary
			commandTracker.scrollToNextCommand();
			assert.equal(xterm.buffer.ydisp, 20);
		});
		// test('should select to the next and previous commands', () => {
		// 	xterm.open(document.createElement('div'));

		// 	syncWrite(xterm, '\r0');
		// 	syncWrite(xterm, '\n\r1');
		// 	syncWrite(xterm, '\x1b[3G'); // Move cursor to column 3
		// 	xterm.emit('key', '\x0d'); // Mark line
		// 	assert.equal(xterm.markers[0].line, 10);
		// 	syncWrite(xterm, '\n\r2');
		// 	syncWrite(xterm, '\x1b[3G'); // Move cursor to column 3
		// 	xterm.emit('key', '\x0d'); // Mark line
		// 	assert.equal(xterm.markers[1].line, 11);
		// 	syncWrite(xterm, '\n\r3');

		// 	assert.equal(xterm.buffer.ybase, 3);
		// 	assert.equal(xterm.buffer.ydisp, 3);

		// 	assert.equal(xterm.getSelection(), '');
		// 	commandTracker.selectToPreviousCommand();
		// 	assert.equal(xterm.getSelection(), '2');
		// 	commandTracker.selectToPreviousCommand();
		// 	assert.equal(xterm.getSelection(), '1\n2');
		// 	commandTracker.selectToNextCommand();
		// 	assert.equal(xterm.getSelection(), '2');
		// 	commandTracker.selectToNextCommand();
		// 	assert.equal(xterm.getSelection(), '\n');
		// });
	});
});