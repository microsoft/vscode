/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CharCode } from 'vs/base/common/charCode';
import { CursorColumns } from 'vs/editor/common/controller/cursorCommon';

export enum Direction {
	Left,
	Right,
	Nearest,
}

export class AtomicTabMoveOperations {
	// Get the visible column at the position. If we get to a non-whitespace character first
	// or past the end of string then return -1. Note `position` and the return
	// value are 0-based.
	public static whitespaceVisibleColumn(lineContent: string, position: number, tabSize: number) {
		let visibleColumn = 0;
		for (let i = 0; i < lineContent.length; ++i) {
			if (i === position) {
				return visibleColumn;
			}
			const chCode = lineContent.charCodeAt(i);
			switch (chCode) {
				case CharCode.Space:
					visibleColumn += 1;
					break;
				case CharCode.Tab:
					// Skip to the next multiple of tabSize.
					visibleColumn = CursorColumns.nextRenderTabStop(visibleColumn, tabSize);
					break;
				default:
					return -1;
			}
		}
		if (position === lineContent.length) {
			return visibleColumn;
		}
		return -1;
	}

	// Return the position that should result from a move left, right or to the
	// nearest tab, if atomic tabs are enabled. Left and right are used for the
	// arrow key movements, nearest is used for mouse selection. It returns
	// -1 if atomic tabs are not relevant and you should fall back to normal
	// behaviour.
	//
	// Note, `position` and the return value are 0-based.
	public static atomicPosition(lineContent: string, position: number, tabSize: number, direction: Direction): number {
		// Get the 0-based visible column corresponding to the position, or return
		// -1 if it is not in the initial whitespace.
		let visibleColumn = AtomicTabMoveOperations.whitespaceVisibleColumn(lineContent, position, tabSize);

		if (visibleColumn === -1) {
			return -1;
		}

		// Is the output left or right of the current position. The case for nearest
		// where it is the same as the current position is handled in the switch.
		let left: boolean;
		switch (direction) {
			case Direction.Left:
				left = true;
				break;
			case Direction.Right:
				left = false;
				break;
			case Direction.Nearest:
				// The code below assumes the output position is either left or right
				// of the input position. If it is the same, return immediately.
				if (visibleColumn % tabSize === 0) {
					return position;
				}
				// Go to the nearest indentation.
				left = visibleColumn % tabSize <= (tabSize / 2);
				break;
		}

		// The code below won't work if visibleColumn is zero and left is true because
		// it takes the mod of a negative number, which behaves oddly. In that case
		// we already know what to return.
		if (left && visibleColumn === 0) {
			return -1;
		}

		const tmp = visibleColumn + (left ? -1 : tabSize);
		const targetVisibleColumn = tmp - tmp % tabSize;

		// Find the target visible column. If going right we can just continue from
		// where whitespaceVisibleColumn got to. If going left it's easiest to start
		// from the beginning because the width of tab characters depend on the
		// characters to their left. E.g. ' \t' is one tabSize, but so is '\t'.
		if (left) {
			visibleColumn = 0;
		}
		for (let i = (left ? 0 : position); i < lineContent.length; ++i) {
			if (visibleColumn === targetVisibleColumn) {
				// This is the position we want to get to, but we have one more case
				// to handle if going left.
				if (left) {
					// If the direction is left, we need to keep scanning right to ensure
					// that targetVisibleColumn + tabSize is before non-whitespace.
					// This is so that when we press left at the end of a partial
					// indentation it only goes one character. For example '      foo' with
					// tabSize 4, should jump from position 6 to position 5, not 4.
					for (let k = i; k < lineContent.length; ++k) {
						if (visibleColumn === targetVisibleColumn + tabSize) {
							// It is a full indentation.
							return i;
						}

						const chCode = lineContent.charCodeAt(k);
						switch (chCode) {
							case CharCode.Space:
								visibleColumn += 1;
								break;
							case CharCode.Tab:
								visibleColumn = CursorColumns.nextRenderTabStop(visibleColumn, tabSize);
								break;
							default:
								return -1;
						}
					}
					if (visibleColumn === targetVisibleColumn + tabSize) {
						return i;
					}
					// It must have been a partial indentation.
					return -1;
				} else {
					// If going right then we must have been in a complete indentation.
					return i;
				}
			}

			const chCode = lineContent.charCodeAt(i);
			switch (chCode) {
				case CharCode.Space:
					visibleColumn += 1;
					break;
				case CharCode.Tab:
					visibleColumn = CursorColumns.nextRenderTabStop(visibleColumn, tabSize);
					break;
				default:
					return -1;
			}
		}
		// This condition handles when the target column is at the end of the line.
		if (visibleColumn === targetVisibleColumn) {
			return lineContent.length;
		}
		return -1;
	}
}
