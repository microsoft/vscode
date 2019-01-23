/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Terminal, IMarker } from 'vscode-xterm';
import { ITerminalCommandTracker } from 'vs/workbench/parts/terminal/common/terminal';
import { IDisposable } from 'vs/base/common/lifecycle';

/**
 * The minimum size of the prompt in which to assume the line is a command.
 */
const MINIMUM_PROMPT_LENGTH = 2;

enum Boundary {
	Top,
	Bottom
}

export const enum ScrollPosition {
	Top,
	Middle
}

export class TerminalCommandTracker implements ITerminalCommandTracker, IDisposable {
	private _currentMarker: IMarker | Boundary = Boundary.Bottom;
	private _selectionStart: IMarker | Boundary | null = null;
	private _isDisposable: boolean = false;

	constructor(
		private _xterm: Terminal
	) {
		this._xterm.on('key', key => this._onKey(key));
	}

	public dispose(): void {
	}

	private _onKey(key: string): void {
		if (key === '\x0d') {
			this._onEnter();
		}

		// Clear the current marker so successive focus/selection actions are performed from the
		// bottom of the buffer
		this._currentMarker = Boundary.Bottom;
		this._selectionStart = null;
	}

	private _onEnter(): void {
		if (this._xterm._core.buffer.x >= MINIMUM_PROMPT_LENGTH) {
			this._xterm.addMarker(0);
		}
	}

	public scrollToPreviousCommand(scrollPosition: ScrollPosition = ScrollPosition.Top, retainSelection: boolean = false): void {
		if (!retainSelection) {
			this._selectionStart = null;
		}

		let markerIndex;
		if (this._currentMarker === Boundary.Bottom) {
			markerIndex = this._xterm.markers.length - 1;
		} else if (this._currentMarker === Boundary.Top) {
			markerIndex = -1;
		} else if (this._isDisposable) {
			markerIndex = this._findPreviousCommand();
			this._currentMarker.dispose();
			this._isDisposable = false;
		} else {
			markerIndex = this._xterm.markers.indexOf(this._currentMarker) - 1;
		}

		if (markerIndex < 0) {
			this._currentMarker = Boundary.Top;
			this._xterm.scrollToTop();
			return;
		}

		this._currentMarker = this._xterm.markers[markerIndex];
		this._scrollToMarker(this._currentMarker, scrollPosition);
	}

	public scrollToNextCommand(scrollPosition: ScrollPosition = ScrollPosition.Top, retainSelection: boolean = false): void {
		if (!retainSelection) {
			this._selectionStart = null;
		}

		let markerIndex;
		if (this._currentMarker === Boundary.Bottom) {
			markerIndex = this._xterm.markers.length;
		} else if (this._currentMarker === Boundary.Top) {
			markerIndex = 0;
		} else if (this._isDisposable) {
			markerIndex = this._findNextCommand();
			this._currentMarker.dispose();
			this._isDisposable = false;
		} else {
			markerIndex = this._xterm.markers.indexOf(this._currentMarker) + 1;
		}

		if (markerIndex >= this._xterm.markers.length) {
			this._currentMarker = Boundary.Bottom;
			this._xterm.scrollToBottom();
			return;
		}

		this._currentMarker = this._xterm.markers[markerIndex];
		this._scrollToMarker(this._currentMarker, scrollPosition);
	}

	private _scrollToMarker(marker: IMarker, position: ScrollPosition): void {
		let line = marker.line;
		if (position === ScrollPosition.Middle) {
			line = Math.max(line - this._xterm.rows / 2, 0);
		}
		this._xterm.scrollToLine(line);
	}

	public selectToPreviousCommand(): void {
		if (this._selectionStart === null) {
			this._selectionStart = this._currentMarker;
		}
		this.scrollToPreviousCommand(ScrollPosition.Middle, true);
		this._selectLines(this._currentMarker, this._selectionStart);
	}

	public selectToNextCommand(): void {
		if (this._selectionStart === null) {
			this._selectionStart = this._currentMarker;
		}
		this.scrollToNextCommand(ScrollPosition.Middle, true);
		this._selectLines(this._currentMarker, this._selectionStart);
	}

	public selectToPreviousLine(): void {
		if (this._selectionStart === null) {
			this._selectionStart = this._currentMarker;
		}

		this.scrollToPreviousLine(ScrollPosition.Middle, true);
		this._selectLines(this._currentMarker, this._selectionStart);
	}

	public selectToNextLine(): void {
		if (this._selectionStart === null) {
			this._selectionStart = this._currentMarker;
		}

		this.scrollToNextLine(ScrollPosition.Middle, true);
		this._selectLines(this._currentMarker, this._selectionStart);
	}

	private _selectLines(start: IMarker | Boundary, end: IMarker | Boundary | null): void {
		if (end === null) {
			end = Boundary.Bottom;
		}

		let startLine = this._getLine(start);
		let endLine = this._getLine(end);

		if (startLine > endLine) {
			const temp = startLine;
			startLine = endLine;
			endLine = temp;
		}

		// Subtract a line as the marker is on the line the command run, we do not want the next
		// command in the selection for the current command
		endLine -= 1;

		this._xterm.selectLines(startLine, endLine);
	}

	private _getLine(marker: IMarker | Boundary): number {
		// Use the _second last_ row as the last row is likely the prompt
		if (marker === Boundary.Bottom) {
			return this._xterm._core.buffer.ybase + this._xterm.rows - 1;
		}

		if (marker === Boundary.Top) {
			return 0;
		}

		return marker.line;
	}

	public scrollToPreviousLine(scrollPosition: ScrollPosition = ScrollPosition.Top, retainSelection: boolean = false): void {
		if (!retainSelection) {
			this._selectionStart = null;
		}

		if (this._currentMarker === Boundary.Top) {
			this._xterm.scrollToTop();
			return;
		}

		if (this._currentMarker === Boundary.Bottom) {
			this._currentMarker = this._xterm.addMarker(this._getOffset() - 1);
		} else {
			const offset = this._getOffset();
			if (this._isDisposable) {
				this._currentMarker.dispose();
			}
			this._currentMarker = this._xterm.addMarker(offset - 1);
		}
		this._isDisposable = true;
		this._scrollToMarker(this._currentMarker, scrollPosition);
	}

	public scrollToNextLine(scrollPosition: ScrollPosition = ScrollPosition.Top, retainSelection: boolean = false): void {
		if (!retainSelection) {
			this._selectionStart = null;
		}

		if (this._currentMarker === Boundary.Bottom) {
			this._xterm.scrollToBottom();
			return;
		}

		if (this._currentMarker === Boundary.Top) {
			this._currentMarker = this._xterm.addMarker(this._getOffset() + 1);
		} else {
			const offset = this._getOffset();
			if (this._isDisposable) {
				this._currentMarker.dispose();
			}
			this._currentMarker = this._xterm.addMarker(offset + 1);
		}
		this._isDisposable = true;
		this._scrollToMarker(this._currentMarker, scrollPosition);
	}

	private _getOffset(): number {
		if (this._currentMarker === Boundary.Bottom) {
			return 0;
		} else if (this._currentMarker === Boundary.Top) {
			return 0 - (this._xterm._core.buffer.ybase + this._xterm._core.buffer.y);
		} else {
			let offset = this._getLine(this._currentMarker);
			offset -= this._xterm._core.buffer.ybase + this._xterm._core.buffer.y;
			return offset;
		}
	}

	private _findPreviousCommand(): number {
		if (this._currentMarker === Boundary.Top) {
			return 0;
		} else if (this._currentMarker === Boundary.Bottom) {
			return this._xterm.markers.length - 1;
		}

		let i;
		for (i = this._xterm.markers.length - 1; i >= 0; i--) {
			if (this._xterm.markers[i].line < this._currentMarker.line) {
				return i;
			}
		}

		return -1;
	}

	private _findNextCommand(): number {
		if (this._currentMarker === Boundary.Top) {
			return 0;
		} else if (this._currentMarker === Boundary.Bottom) {
			return this._xterm.markers.length - 1;
		}

		let i;
		for (i = 0; i < this._xterm.markers.length; i++) {
			if (this._xterm.markers[i].line > this._currentMarker.line) {
				return i;
			}
		}

		return this._xterm.markers.length;
	}
}
