/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from 'vs/platform/log/common/log';
import { IBufferMarkCapability, TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
// Importing types is safe in any layer
// eslint-disable-next-line code-import-patterns
import type { IMarker, Terminal } from 'xterm-headless';

export class BufferMarkCapability implements IBufferMarkCapability {
	readonly type = TerminalCapability.BufferMarkDetection;
	protected _marks: Map<string, IMarker> = new Map();

	constructor(
		private readonly _terminal: Terminal,
		@ILogService private readonly _logService: ILogService
	) {
	}
	addMark(id: string, marker?: IMarker, hidden?: boolean): void {
		marker = marker || this._terminal.registerMarker();
		if (marker) {
			this._marks.set(id, marker);
		} else {
			this._logService.warn('No marker registered for ID:', id);
		}
	}

	private _getMarker(id: string): IMarker | undefined {
		return this._marks.get(id);
	}

	public scrollToMark(startMarkId: string, endMarkId?: string, highlight?: boolean): void {
		const startMarker = this._getMarker(startMarkId);
		const endMarker = endMarkId !== undefined ? this._getMarker(endMarkId) : undefined;
		if (!startMarker || startMarker.line < 0 || (endMarker && endMarker.line < 0)) {
			return;
		}
		const line = endMarker ? Math.round((endMarker.line - startMarker.line)) / 2 : startMarker.line;
		this._terminal.scrollToLine(line);
		if (highlight && endMarker) {
			this._highlight(startMarker, endMarker);
		}
	}

	private _highlight(startMarker: IMarker, endMarker: IMarker): void {
		this._selectLines(startMarker, endMarker);
	}


	private _selectLines(start: IMarker, end: IMarker): void {
		let startLine = getLine(this._terminal, start);
		let endLine = getLine(this._terminal, end);

		if (startLine > endLine) {
			const temp = startLine;
			startLine = endLine;
			endLine = temp;
		}

		// Subtract a line as the marker is on the line the command run, we do not want the next
		// command in the selection for the current command
		endLine -= 1;

		/// TODO:@meganrogge
		// this._terminal.selectLines(startLine, endLine);
	}
}

export function getLine(xterm: Terminal, marker: IMarker | Boundary): number {
	// Use the _second last_ row as the last row is likely the prompt
	if (marker === Boundary.Bottom) {
		return xterm.buffer.active.baseY + xterm.rows - 1;
	}

	if (marker === Boundary.Top) {
		return 0;
	}

	return marker.line;
}

export enum Boundary {
	Top,
	Bottom
}
