/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IPartialCommandDetectionCapability, TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
// Importing types is safe in any layer
// eslint-disable-next-line local/code-import-patterns
import type { IMarker, Terminal } from 'xterm-headless';

const enum Constants {
	/**
	 * The minimum size of the prompt in which to assume the line is a command.
	 */
	MinimumPromptLength = 2
}

/**
 * This capability guesses where commands are based on where the cursor was when enter was pressed.
 * It's very hit or miss but it's often correct and better than nothing.
 */
export class PartialCommandDetectionCapability extends DisposableStore implements IPartialCommandDetectionCapability {
	readonly type = TerminalCapability.PartialCommandDetection;

	private readonly _commands: IMarker[] = [];

	get commands(): readonly IMarker[] { return this._commands; }

	private readonly _onCommandFinished = this.add(new Emitter<IMarker>());
	readonly onCommandFinished = this._onCommandFinished.event;

	constructor(
		private readonly _terminal: Terminal,
	) {
		super();
		this.add(this._terminal.onData(e => this._onData(e)));
		this.add(this._terminal.parser.registerCsiHandler({ final: 'J' }, params => {
			if (params.length >= 1 && (params[0] === 2 || params[0] === 3)) {
				this._clearCommandsInViewport();
			}
			// We don't want to override xterm.js' default behavior, just augment it
			return false;
		}));
	}

	private _onData(data: string): void {
		if (data === '\x0d') {
			this._onEnter();
		}
	}

	private _onEnter(): void {
		if (!this._terminal) {
			return;
		}
		if (this._terminal.buffer.active.cursorX >= Constants.MinimumPromptLength) {
			const marker = this._terminal.registerMarker(0);
			if (marker) {
				this._commands.push(marker);
				this._onCommandFinished.fire(marker);
			}
		}
	}

	private _clearCommandsInViewport(): void {
		// Find the number of commands on the tail end of the array that are within the viewport
		let count = 0;
		for (let i = this._commands.length - 1; i >= 0; i--) {
			if (this._commands[i].line < this._terminal.buffer.active.baseY) {
				break;
			}
			count++;
		}
		// Remove them
		this._commands.splice(this._commands.length - count, count);
	}
}
