/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { Terminal } from 'vscode-xterm';
import { TerminalCommandTracker } from 'vs/workbench/parts/terminal/node/terminalCommandTracker';

// function createKeyEvent(keyCode: number): KeyboardEvent {
// 	return <KeyboardEvent>{
// 		preventDefault: () => { },
// 		stopPropagation: () => { },
// 		type: 'key',
// 		keyCode
// 	};
// }

interface TestTerminal extends Terminal {
	writeBuffer: string[];
	_innerWrite(): void;
}

function syncWrite(term: TestTerminal, data: string): void {
	// Terminal.write is asynchronous
	term.writeBuffer.push(data);
	term._innerWrite();
}

suite('Workbench - TerminalCommandTracker', () => {
	let xterm: TestTerminal;
	let commandTracker: TerminalCommandTracker;

	setup(() => {
		xterm = (<TestTerminal>new Terminal({
			cols: 10,
			rows: 10
		}));
		for (let i = 1; i < 10; i++) {
			syncWrite(xterm, `${i}\r`);
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
});