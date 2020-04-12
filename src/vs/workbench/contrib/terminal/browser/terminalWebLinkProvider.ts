/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Terminal, IViewportRange, ILinkProvider, IBufferCellPosition, ILink, IBufferRange, IBuffer, IBufferLine } from 'xterm';
import { ILinkComputerTarget, LinkComputer } from 'vs/editor/common/modes/linkComputer';
import { IRange } from 'vs/editor/common/core/range';


export class TerminalWebLinkProvider implements ILinkProvider {
	private _linkComputerTarget: ILinkComputerTarget | undefined;

	constructor(
		private readonly _xterm: Terminal,
		private readonly _activateCallback: (event: MouseEvent, uri: string) => void,
		private readonly _tooltipCallback: (event: MouseEvent, uri: string, location: IViewportRange) => boolean | void,
		private readonly _leaveCallback: () => void
	) {
	}

	public provideLink(position: IBufferCellPosition, callback: (link: ILink | undefined) => void): void {
		let startLine = position.y - 1;
		let endLine = startLine;

		const lines: IBufferLine[] = [
			this._xterm.buffer.active.getLine(startLine)!
		];

		while (this._xterm.buffer.active.getLine(startLine)?.isWrapped) {
			lines.unshift(this._xterm.buffer.active.getLine(startLine - 1)!);
			startLine--;
		}

		while (this._xterm.buffer.active.getLine(endLine + 1)?.isWrapped) {
			lines.push(this._xterm.buffer.active.getLine(endLine + 1)!);
			endLine++;
		}

		this._linkComputerTarget = new TerminalLinkAdapter(this._xterm, startLine, endLine);
		const links = LinkComputer.computeLinks(this._linkComputerTarget);

		let found = false;
		links.forEach(link => {
			const range = convertLinkRangeToBuffer(lines, this._xterm.cols, link.range, startLine);

			// Check if the link if within the mouse position
			if (this._positionIsInRange(position, range)) {
				found = true;

				callback({
					text: link.url?.toString() || '',
					range,
					activate: (event: MouseEvent, text: string) => {
						this._activateCallback(event, text);
					},
					hover: (event: MouseEvent, text: string) => {
						setTimeout(() => {
							this._tooltipCallback(event, text, convertBufferRangeToViewport(range, this._xterm.buffer.active.viewportY));
						}, 200);
					},
					leave: () => {
						this._leaveCallback();
					}
				});
			}
		});

		if (!found) {
			callback(undefined);
		}
	}

	private _positionIsInRange(position: IBufferCellPosition, range: IBufferRange): boolean {
		if (position.y < range.start.y || position.y > range.end.y) {
			return false;
		}
		if (position.y === range.start.y && position.x < range.start.x) {
			return false;
		}
		if (position.y === range.end.y && position.x > range.end.x) {
			return false;
		}
		return true;
	}
}

export function convertLinkRangeToBuffer(lines: IBufferLine[], bufferWidth: number, range: IRange, startLine: number) {
	const bufferRange: IBufferRange = {
		start: {
			x: range.startColumn,
			y: range.startLineNumber + startLine
		},
		end: {
			x: range.endColumn - 1,
			y: range.endLineNumber + startLine
		}
	};

	// Shift start range right for each wide character before the link
	let startOffset = 0;
	const startWrappedLineCount = Math.ceil(range.startColumn / bufferWidth);
	for (let y = 0; y < startWrappedLineCount; y++) {
		const lineLength = Math.min(bufferWidth, range.startColumn - y * bufferWidth);
		let lineOffset = 0;
		const line = lines[y];
		for (let x = 0; x < Math.min(bufferWidth, lineLength + lineOffset); x++) {
			const width = line.getCell(x)?.getWidth();
			if (width === 2) {
				lineOffset++;
			}
		}
		startOffset += lineOffset;
	}

	// Shift end range right for each wide character inside the link
	let endOffset = 0;
	const endWrappedLineCount = Math.ceil(range.endColumn / bufferWidth);
	for (let y = startWrappedLineCount - 1; y < endWrappedLineCount; y++) {
		const start = (y === startWrappedLineCount - 1 ? (range.startColumn + startOffset) % bufferWidth : 0);
		const lineLength = Math.min(bufferWidth, range.endColumn + startOffset - y * bufferWidth);
		const startLineOffset = (y === startWrappedLineCount - 1 ? startOffset : 0);
		let lineOffset = 0;
		const line = lines[y];
		for (let x = start; x < Math.min(bufferWidth, lineLength + lineOffset + startLineOffset); x++) {
			const cell = line.getCell(x)!;
			const width = cell.getWidth();
			// Offset for 0 cells following wide characters
			if (width === 2) {
				lineOffset++;
			}
			// Offset for early wrapping when the last cell in row is a wide character
			if (x === bufferWidth - 1 && cell.getChars() === '') {
				lineOffset++;
			}
		}
		endOffset += lineOffset;
	}

	// Apply the width character offsets to the result
	bufferRange.start.x += startOffset;
	bufferRange.end.x += startOffset + endOffset;

	// Convert back to wrapped lines
	while (bufferRange.start.x > bufferWidth) {
		bufferRange.start.x -= bufferWidth;
		bufferRange.start.y++;
	}
	while (bufferRange.end.x > bufferWidth) {
		bufferRange.end.x -= bufferWidth;
		bufferRange.end.y++;
	}

	return bufferRange;
}

function convertBufferRangeToViewport(bufferRange: IBufferRange, viewportY: number): IViewportRange {
	return {
		start: {
			x: bufferRange.start.x - 1,
			y: bufferRange.start.y - viewportY - 1
		},
		end: {
			x: bufferRange.end.x - 1,
			y: bufferRange.end.y - viewportY - 1
		}
	};
}

class TerminalLinkAdapter implements ILinkComputerTarget {
	constructor(
		private _xterm: Terminal,
		private _lineStart: number,
		private _lineEnd: number
	) { }

	getLineCount(): number {
		return 1;
	}

	getLineContent(): string {
		return getXtermLineContent(this._xterm.buffer.active, this._lineStart, this._lineEnd);
	}
}

function getXtermLineContent(buffer: IBuffer, lineStart: number, lineEnd: number): string {
	let line = '';
	for (let i = lineStart; i <= lineEnd; i++) {
		line += buffer.getLine(i)?.translateToString(true);
	}
	return line;
}
