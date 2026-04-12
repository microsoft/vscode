/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { posix, win32 } from '../../../../../base/common/path.js';
/**
 * Converts a possibly wrapped link's range (comprised of string indices) into a buffer range that plays nicely with xterm.js
 *
 * @param lines A single line (not the entire buffer)
 * @param bufferWidth The number of columns in the terminal
 * @param range The link range - string indices
 * @param startLine The absolute y position (on the buffer) of the line
 */
export function convertLinkRangeToBuffer(lines, bufferWidth, range, startLine) {
    const bufferRange = {
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
export function convertBufferRangeToViewport(bufferRange, viewportY) {
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
export function getXtermLineContent(buffer, lineStart, lineEnd, cols) {
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
export function getXtermRangesByAttr(buffer, lineStart, lineEnd, cols) {
    let bufferRangeStart = undefined;
    let lastFgAttr = -1;
    let lastBgAttr = -1;
    const ranges = [];
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
            const thisFgAttr = (cell.isBold() |
                cell.isInverse() |
                cell.isStrikethrough() |
                cell.isUnderline());
            const thisBgAttr = (cell.isDim() |
                cell.isItalic());
            if (lastFgAttr === -1 || lastBgAttr === -1) {
                bufferRangeStart = { x, y };
            }
            else {
                if (lastFgAttr !== thisFgAttr || lastBgAttr !== thisBgAttr) {
                    // TODO: x overflow
                    const bufferRangeEnd = { x, y };
                    ranges.push({
                        start: bufferRangeStart,
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
export function updateLinkWithRelativeCwd(capabilities, y, text, osPath, logService) {
    const cwd = capabilities.get(2 /* TerminalCapability.CommandDetection */)?.getCwdForLine(y);
    logService.trace('terminalLinkHelpers#updateLinkWithRelativeCwd cwd', cwd);
    if (!cwd) {
        return undefined;
    }
    const result = [];
    const sep = osPath.sep;
    if (!text.includes(sep)) {
        result.push(osPath.resolve(cwd + sep + text));
    }
    else {
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
            }
            else {
                break;
            }
            i++;
        }
    }
    return result;
}
export function osPathModule(os) {
    return os === 1 /* OperatingSystem.Windows */ ? win32 : posix;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxMaW5rSGVscGVycy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9saW5rcy9icm93c2VyL3Rlcm1pbmFsTGlua0hlbHBlcnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFLaEcsT0FBTyxFQUFTLEtBQUssRUFBRSxLQUFLLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUl6RTs7Ozs7OztHQU9HO0FBQ0gsTUFBTSxVQUFVLHdCQUF3QixDQUN2QyxLQUFvQixFQUNwQixXQUFtQixFQUNuQixLQUFhLEVBQ2IsU0FBaUI7SUFFakIsTUFBTSxXQUFXLEdBQWlCO1FBQ2pDLEtBQUssRUFBRTtZQUNOLENBQUMsRUFBRSxLQUFLLENBQUMsV0FBVztZQUNwQixDQUFDLEVBQUUsS0FBSyxDQUFDLGVBQWUsR0FBRyxTQUFTO1NBQ3BDO1FBQ0QsR0FBRyxFQUFFO1lBQ0osQ0FBQyxFQUFFLEtBQUssQ0FBQyxTQUFTLEdBQUcsQ0FBQztZQUN0QixDQUFDLEVBQUUsS0FBSyxDQUFDLGFBQWEsR0FBRyxTQUFTO1NBQ2xDO0tBQ0QsQ0FBQztJQUVGLGtFQUFrRTtJQUNsRSxJQUFJLFdBQVcsR0FBRyxDQUFDLENBQUM7SUFDcEIsTUFBTSxxQkFBcUIsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxXQUFXLEdBQUcsV0FBVyxDQUFDLENBQUM7SUFDekUsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMscUJBQXFCLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1FBQzFELE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsV0FBVyxFQUFFLENBQUMsS0FBSyxDQUFDLFdBQVcsR0FBRyxDQUFDLENBQUMs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