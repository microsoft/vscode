/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BugIndicatingError } from '../../../util/vs/base/common/errors';
import { Position } from '../../../util/vs/editor/common/core/position';
import { StringText } from '../../../util/vs/editor/common/core/text/abstractText';
import { PositionOffsetTransformer } from '../../../util/vs/editor/common/core/text/positionToOffsetImpl';

/**
 * Represents the current document state along with the cursor position within it.
 *
 * Provides convenience methods for inspecting text around the cursor, such as
 * retrieving the cursor's line, the text after the cursor, and whether the
 * cursor sits at the end of a line.
 */
export class CurrentDocument {

	/** All lines of the document (split by line break). */
	public readonly lines: string[];

	/** The 0-based character offset of the cursor within the full document text. */
	public readonly cursorOffset: number;

	/** Converts between {@link Position} (line/column) and character offsets. */
	public readonly transformer: PositionOffsetTransformer;

	/**
	 * The 0-based line number of the cursor.
	 */
	public readonly cursorLineOffset: number;

	constructor(
		public readonly content: StringText,
		/** Note that `cursorPosition`'s line and column numbers are 1-based. */
		public readonly cursorPosition: Position,
	) {
		this.lines = content.getLines();
		this.transformer = content.getTransformer();
		this.cursorOffset = this.transformer.getOffset(cursorPosition);
		this.cursorLineOffset = this.cursorPosition.lineNumber - 1;
	}

	/** Returns the full text of the line containing the cursor. */
	lineWithCursor(): string {
		const line = this.lines.at(this.cursorLineOffset);
		if (line === undefined) {
			throw new BugIndicatingError(`CurrentDocument#lineWithCursor: cursor is out of bounds: cursor: ${this.cursorLineOffset}, doc line count: ${this.lines.length}`);
		}
		return line;
	}

	/** Returns the substring of the cursor's line starting from the cursor column (inclusive). */
	textAfterCursor(): string {
		const line = this.lineWithCursor();
		return line.substring(this.cursorPosition.column - 1);
	}

	/**
	 * Determines if the cursor is at the end of the line.
	 */
	isCursorAtEndOfLine(): boolean {
		// checks if there's any non-whitespace character after the cursor in the line
		const afterCursor = this.textAfterCursor();
		const isAtEndOfLine = afterCursor.match(/^\s*$/) !== null;
		return isAtEndOfLine;
	}
}
