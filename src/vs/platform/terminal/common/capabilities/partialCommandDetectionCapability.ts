/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { IPartialCommandDetectionCapability, TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
// Importing types is safe in any layer
// eslint-disable-next-line code-import-patterns
import { IMarker, Terminal } from 'xterm-headless';

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
export class PartialCommandDetectionCapability implements IPartialCommandDetectionCapability {
	readonly type = TerminalCapability.PartialCommandDetection;

	private readonly _commands: IMarker[] = [];

	get commands(): readonly IMarker[] { return this._commands; }

	private readonly _onCommandFinished = new Emitter<IMarker>();
	readonly onCommandFinished = this._onCommandFinished.event;

	constructor(
		private readonly _terminal: Terminal,
	) {
		this._terminal.onData(e => this._onData(e));
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
}
