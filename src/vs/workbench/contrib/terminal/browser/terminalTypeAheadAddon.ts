/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Terminal as XTermTerminal } from 'vscode-xterm';
import { ITerminalProcessManager } from 'vs/workbench/contrib/terminal/common/terminal';
import { IThemeService } from 'vs/platform/theme/common/themeService';

export interface ITerminalCore {
	buffer: any;
}

export interface ITypeAheadAddonTerminal {
	_core: ITerminalCore;
	on: any;
	write(data: string): void;
	cols: number;

	__typeAheadQueue: string[];
	__typeAheadState: TypeAheadState;
	__typeAheadCurrentYBase: number;
	__typeAheadCurrentY: number;
}

enum TypeAheadState {
	/**
	 * The normal state, ready to type if it starts.
	 */
	Normal,
	/**
	 * Something happens such that we cannot make a good guess on what to print,
	 * wait until the cursor row changes before proceeding.
	 */
	AwaitingRowChange
}

function isCharPrintable(data: string): boolean {
	const code = data.charCodeAt(0);
	return data.length === 1 && code >= 32 && code <= 126;
}

function init(terminal: any, processManager: ITerminalProcessManager, themeService: IThemeService): void {
	const t = terminal as ITypeAheadAddonTerminal;

	t.__typeAheadQueue = [];
	t.__typeAheadState = TypeAheadState.Normal;
	t.__typeAheadCurrentYBase = 0;
	t.__typeAheadCurrentY = 0;

	function typeAhead(data: string): void {
		for (let i = 0; i < data.length; i++) {
			t.__typeAheadQueue.push(data[i]);
		}
		t.write(data);
	}

	t.on('cursormove', () => {
		// Reset if the cursor row changed
		if (t._core.buffer.ybase !== t.__typeAheadCurrentYBase || t._core.buffer.y !== t.__typeAheadCurrentY) {
			t.__typeAheadCurrentYBase = t._core.buffer.ybase;
			t.__typeAheadCurrentY = t._core.buffer.y;
			t.__typeAheadState = TypeAheadState.Normal;
		}
	});

	t.on('data', (data: string) => {
		// Exit if we're waiting for a row change
		if (t.__typeAheadState === TypeAheadState.AwaitingRowChange) {
			return;
		}

		// Only enable in the normal buffer
		if (!t._core.buffer._hasScrollback) {
			return;
		}

		// // Handle enter
		// if (data === '\r') {
		// 	typeAhead('\r\n');
		// 	return;
		// }

		// // Left arrow
		// if (data === '\x1b[D') {
		// 	// TODO: How to stop it from going beyond prompt?
		// 	typeAhead(String.fromCharCode(8));
		// }

		// // Right arrow
		// if (data === '\x1b[C') {
		// 	// TODO: How to stop it from going beyond prompt?
		// 	typeAhead('\x1b[C');
		// }

		// // Backspace (DEL)
		// if (data.charCodeAt(0) === 127) {
		// 	// TODO: This would require knowing the prompt length to be able to shift everything
		// }

		if (!isCharPrintable(data)) {
			t.__typeAheadState = TypeAheadState.AwaitingRowChange;
			return;
		}

		if (t._core.buffer.x === t.cols - 1) {
			// TODO: Does the space get added on Windows/Linux too?
			data += ' \r';
		}
		typeAhead(data);
	});

	processManager.onBeforeProcessData(event => {
		let consumeCount = 0;
		for (let i = 0; i < event.data.length; i++) {
			if (t.__typeAheadQueue[0] === event.data[i]) {
				t.__typeAheadQueue.shift();
				consumeCount++;
			} else {
				t.__typeAheadQueue.length = 0;
				break;
			}
		}
		if (consumeCount === event.data.length) {
			event.data = '';
		} else if (consumeCount > 0) {
			event.data = event.data.substr(consumeCount);
		}
	});
}

export function apply(terminalConstructor: typeof XTermTerminal) {
	(<any>terminalConstructor.prototype).typeAheadInit = function (processManager: ITerminalProcessManager, themeService: IThemeService): void {
		init(this, processManager, themeService);
	};
}