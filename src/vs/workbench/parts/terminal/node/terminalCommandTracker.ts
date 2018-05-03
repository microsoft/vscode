/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Terminal, IMarker } from 'vscode-xterm';
import { ITerminalCommandTracker } from 'vs/workbench/parts/terminal/common/terminal';

/**
 * The minimize size of the prompt in which to assume the line is a command.
 */
const MINIMUM_PROMPT_LENGTH = 2;

enum Boundary {
	Top,
	Bottom
}

export enum ScrollPosition {
	Top,
	Middle
}

export class TerminalCommandTracker implements ITerminalCommandTracker {
	private _currentMarker: IMarker | Boundary = Boundary.Bottom;
	private _selectionStart: IMarker | Boundary | null = null;

	constructor(
		private _xterm: Terminal
	) {
		this._xterm.on('key', key => this._onKey(key));
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
		if (this._xterm.buffer.x >= MINIMUM_PROMPT_LENGTH) {
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
			return this._xterm.buffer.ybase + this._xterm.rows - 1;
		}

		if (marker === Boundary.Top) {
			return 0;
		}

		return marker.line;
	}
}
