/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IViewportRange, IBufferRange, IBufferLine, IBuffer, IBufferCellPosition, ILink } from 'xterm';
import { IRange } from 'vs/editor/common/core/range';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import * as dom from 'vs/base/browser/dom';
import { RunOnceScheduler } from 'vs/base/common/async';

export const TOOLTIP_HOVER_THRESHOLD = 300;

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
			const cell = line.getCell(x)!;
			const width = cell.getWidth();
			if (width === 2) {
				lineOffset++;
			}
			const char = cell.getChars();
			if (char.length > 1) {
				lineOffset -= char.length - 1;
			}
		}
		startOffset += lineOffset;
	}

	// Shift end range right for each wide character inside the link
	let endOffset = 0;
	const endWrappedLineCount = Math.ceil(range.endColumn / bufferWidth);
	for (let y = Math.max(0, startWrappedLineCount - 1); y < endWrappedLineCount; y++) {
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

export function convertBufferRangeToViewport(bufferRange: IBufferRange, viewportY: number): IViewportRange {
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

export function getXtermLineContent(buffer: IBuffer, lineStart: number, lineEnd: number): string {
	let line = '';
	for (let i = lineStart; i <= lineEnd; i++) {
		line += buffer.getLine(i)?.translateToString(true);
	}
	return line;
}

export function positionIsInRange(position: IBufferCellPosition, range: IBufferRange): boolean {
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

export function createLink(
	range: IBufferRange,
	text: string,
	viewportY: number,
	activateCallback: (event: MouseEvent, uri: string) => void,
	tooltipCallback: (event: MouseEvent, uri: string, location: IViewportRange, modifierDownCallback?: () => void, modifierUpCallback?: () => void) => boolean | void,
	hideDecorations: boolean
): ILink {
	let timeout: number | undefined;
	let documentMouseOutListener: IDisposable | undefined;
	const clearTimer = () => {
		if (timeout !== undefined) {
			window.clearTimeout(timeout);
		}
		documentMouseOutListener?.dispose();
	};

	// TODO: This could be handled better my sharing tooltip hover state between link providers
	// Listen for modifier before handing it off to the hover to handle so it gets disposed correctly
	const disposables: IDisposable[] = [];
	if (hideDecorations) {
		disposables.push(dom.addDisposableListener(document, 'keydown', e => {
			if (e.ctrlKey && link.hideDecorations) {
				link.hideDecorations = false;
			}
		}));
		disposables.push(dom.addDisposableListener(document, 'keyup', e => {
			if (!e.ctrlKey) {
				link.hideDecorations = true;
			}
		}));
	}

	const link = {
		text,
		range,
		hideDecorations,
		activate: (event: MouseEvent, text: string) => activateCallback(event, text),
		hover: (event: MouseEvent, text: string) => {
			// TODO: Is this needed anymore? It's mouseover not mouseout?
			documentMouseOutListener = dom.addDisposableListener(document, dom.EventType.MOUSE_OVER, () => clearTimer());
			const waitScheduler = new RunOnceScheduler(() => {
				tooltipCallback(
					event,
					text,
					convertBufferRangeToViewport(range, viewportY),
					hideDecorations ? () => link.hideDecorations = false : undefined,
					hideDecorations ? () => link.hideDecorations = true : undefined
				);
				dispose(disposables);
				clearTimer();
				// TODO: Use editor.hover.delay instead
			}, TOOLTIP_HOVER_THRESHOLD);

			disposables.push(waitScheduler);
			const origin = { x: event.pageX, y: event.pageY };
			dom.addDisposableListener(document, dom.EventType.MOUSE_MOVE, e => {
				if (Math.abs(e.pageX - origin.x) > window.devicePixelRatio * 2 || Math.abs(e.pageY - origin.y) > window.devicePixelRatio * 2) {
					// Reset the scheduler
					origin.x = e.pageX;
					origin.y = e.pageY;
					waitScheduler.schedule();
				}
			});
		},
		leave: () => {
			dispose(disposables);
			clearTimer();
		}
	};

	return link;
}
