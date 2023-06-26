/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IViewportRange, IBufferRange, IBufferLine, IBuffer, IBufferCellPosition } from 'xterm';
import { IRange } from 'vs/editor/common/core/range';
import { OperatingSystem } from 'vs/base/common/platform';
import { IPath, posix, win32 } from 'vs/base/common/path';
import { ITerminalCapabilityStore, TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import { ITerminalLogService } from 'vs/platform/terminal/common/terminal';

/**
 * Converts a possibly wrapped link's range (comprised of string indices) into a buffer range that plays nicely with xterm.js
 *
 * @param lines A single line (not the entire buffer)
 * @param bufferWidth The number of columns in the terminal
 * @param range The link range - string indices
 * @param startLine The absolute y position (on the buffer) of the line
 */
export function convertLinkRangeToBuffer(
	lines: IBufferLine[],
	bufferWidth: number,
	range: IRange,
	startLine: number
): IBufferRange {
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
	for (let y = 0; y < Math.min(startWrappedLineCount); y++) {
		const lineLength = Math.min(bufferWidth, (range.startColumn - 1) - y * bufferWidth);
		let lineOffset = 0;
		const line = lines[y];
		// Sanity check for line, apparently this can happen but it's not clear under what
		// circumstances this happens. Continue on, skipping the remainder of start offset if this
		// happens to minimize impact.
		if (!line) {
			break;
		}
		for (let x = 0; x < Math.min(bufferWidth, lineLength + lineOffset); x++) {
			const cell = line.getCell(x);
			// This is unexpected but it means the character doesn't exist, so we shouldn't add to
			// the offset
			if (!cell) {
				break;
			}
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
		const start = (y === startWrappedLineCount - 1 ? (range.startColumn - 1 + startOffset) % bufferWidth : 0);
		const lineLength = Math.min(bufferWidth, range.endColumn + startOffset - y * bufferWidth);
		let lineOffset = 0;
		const line = lines[y];
		// Sanity check for line, apparently this can happen but it's not clear under what
		// circumstances this happens. Continue on, skipping the remainder of start offset if this
		// happens to minimize impact.
		if (!line) {
			break;
		}
		for (let x = start; x < Math.min(bufferWidth, lineLength + lineOffset); x++) {
			const cell = line.getCell(x);
			// This is unexpected but it means the character doesn't exist, so we shouldn't add to
			// the offset
			if (!cell) {
				break;
			}
			const width = cell.getWidth();
			const chars = cell.getChars();
			// Offset for null cells following wide characters
			if (width === 2) {
				lineOffset++;
			}
			// Offset for early wrapping when the last cell in row is a wide character
			if (x === bufferWidth - 1 && chars === '') {
				lineOffset++;
			}
			// Offset multi-code characters like emoji
			if (chars.length > 1) {
				lineOffset -= chars.length - 1;
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

export function getXtermLineContent(buffer: IBuffer, lineStart: number, lineEnd: number, cols: number): string {
	// Cap the maximum number of lines generated to prevent potential performance problems. This is
	// more of a sanity check as the wrapped line should already be trimmed down at this point.
	const maxLineLength = Math.max(2048, cols * 2);
	lineEnd = Math.min(lineEnd, lineStart + maxLineLength);
	let content = '';
	for (let i = lineStart; i <= lineEnd; i++) {
		// Make sure only 0 to cols are considered as resizing when windows mode is enabled will
		// retain buffer data outside of the terminal width as reflow is disabled.
		const line = buffer.getLine(i);
		if (line) {
			content += line.translateToString(true, 0, cols);
		}
	}
	return content;
}

export function getXtermRangesByAttr(buffer: IBuffer, lineStart: number, lineEnd: number, cols: number): IBufferRange[] {
	let bufferRangeStart: IBufferCellPosition | undefined = undefined;
	let lastFgAttr: number = -1;
	let lastBgAttr: number = -1;
	const ranges: IBufferRange[] = [];
	for (let y = lineStart; y <= lineEnd; y++) {
		const line = buffer.getLine(y);
		if (!line) {
			continue;
		}
		for (let x = 0; x < cols; x++) {
			const cell = line.getCell(x);
			if (!cell) {
				break;
			}
			// HACK: Re-construct the attributes from fg and bg, this is hacky as it relies
			// upon the internal buffer bit layout
			const thisFgAttr = (
				cell.isBold() |
				cell.isInverse() |
				cell.isStrikethrough() |
				cell.isUnderline()
			);
			const thisBgAttr = (
				cell.isDim() |
				cell.isItalic()
			);
			if (lastFgAttr === -1 || lastBgAttr === -1) {
				bufferRangeStart = { x, y };
			} else {
				if (lastFgAttr !== thisFgAttr || lastBgAttr !== thisBgAttr) {
					// TODO: x overflow
					const bufferRangeEnd = { x, y };
					ranges.push({
						start: bufferRangeStart!,
						end: bufferRangeEnd
					});
					bufferRangeStart = { x, y };
				}
			}
			lastFgAttr = thisFgAttr;
			lastBgAttr = thisBgAttr;
		}
	}
	return ranges;
}


// export function positionIsInRange(position: IBufferCellPosition, range: IBufferRange): boolean {
// 	if (position.y < range.start.y || position.y > range.end.y) {
// 		return false;
// 	}
// 	if (position.y === range.start.y && position.x < range.start.x) {
// 		return false;
// 	}
// 	if (position.y === range.end.y && position.x > range.end.x) {
// 		return false;
// 	}
// 	return true;
// }

/**
 * For shells with the CommandDetection capability, the cwd for a command relative to the line of
 * the particular link can be used to narrow down the result for an exact file match.
 */
export function updateLinkWithRelativeCwd(capabilities: ITerminalCapabilityStore, y: number, text: string, osPath: IPath, logService: ITerminalLogService): string[] | undefined {
	const cwd = capabilities.get(TerminalCapability.CommandDetection)?.getCwdForLine(y);
	logService.trace('terminalLinkHelpers#updateLinkWithRelativeCwd cwd', cwd);
	if (!cwd) {
		return undefined;
	}
	const result: string[] = [];
	const sep = osPath.sep;
	if (!text.includes(sep)) {
		result.push(osPath.resolve(cwd + sep + text));
	} else {
		let commonDirs = 0;
		let i = 0;
		const cwdPath = cwd.split(sep).reverse();
		const linkPath = text.split(sep);
		// Get all results as candidates, prioritizing the link with the most common directories.
		// For example if in the directory /home/common and the link is common/file, the result
		// should be: `['/home/common/common/file', '/home/common/file']`. The first is the most
		// likely as cwd detection is active.
		while (i < cwdPath.length) {
			result.push(osPath.resolve(cwd + sep + linkPath.slice(commonDirs).join(sep)));
			if (cwdPath[i] === linkPath[i]) {
				commonDirs++;
			} else {
				break;
			}
			i++;
		}
	}
	return result;
}

export function osPathModule(os: OperatingSystem): IPath {
	return os === OperatingSystem.Windows ? win32 : posix;
}
