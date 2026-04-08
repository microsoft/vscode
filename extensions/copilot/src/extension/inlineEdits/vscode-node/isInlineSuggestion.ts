/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Position, Range, TextDocument } from 'vscode';
import { OffsetRange } from '../../../util/vs/editor/common/core/ranges/offsetRange';

export interface InlineSuggestionEdit {
	readonly range: Range;
	readonly newText: string;
}

/**
 * Determines whether an edit can be displayed as an inline suggestion (ghost text).
 * If so, returns the (possibly adjusted) range and text that touches the cursor position,
 * which is required for VS Code to render ghost text.
 */
export function toInlineSuggestion(cursorPos: Position, doc: TextDocument, range: Range, newText: string, advanced: boolean = true): InlineSuggestionEdit | undefined {
	// If multi line insertion starts on the next line
	// All new lines have to be newly created lines
	if (range.isEmpty && cursorPos.line + 1 === range.start.line && range.start.character === 0
		&& doc.lineAt(cursorPos.line).text.length === cursorPos.character // cursor is at the end of the line
		&& (newText.endsWith('\n') || (newText.includes('\n') && doc.lineAt(range.end.line).text.length === range.end.character)) // no remaining content after insertion
	) {
		// Use an empty range at the cursor so the suggestion is a pure insertion
		const adjustedRange = new Range(cursorPos, cursorPos);
		const textBetweenCursorAndRange = doc.getText(new Range(cursorPos, range.start));
		return { range: adjustedRange, newText: textBetweenCursorAndRange + newText };
	}

	if (advanced) {
		// If the range spans multiple lines, try to reduce it by stripping a common
		// prefix (up to a newline boundary) from the replaced text and newText.
		if (range.start.line !== range.end.line) {
			const fullReplacedText = doc.getText(range);
			let commonLen = 0;
			const maxLen = Math.min(fullReplacedText.length, newText.length);
			while (commonLen < maxLen && fullReplacedText[commonLen] === newText[commonLen]) {
				commonLen++;
			}
			const lastNewline = fullReplacedText.substring(0, commonLen).lastIndexOf('\n');
			if (lastNewline >= 0) {
				const strippedLen = lastNewline + 1;
				newText = newText.substring(strippedLen);
				const newStart = doc.positionAt(doc.offsetAt(range.start) + strippedLen);
				range = new Range(newStart, range.end);
			}
		}
	}

	if (range.start.line !== range.end.line || range.start.line !== cursorPos.line) {
		return undefined;
	}

	const cursorOffset = doc.offsetAt(cursorPos);
	const offsetRange = new OffsetRange(doc.offsetAt(range.start), doc.offsetAt(range.end));

	const replacedText = offsetRange.substring(doc.getText());

	const cursorOffsetInReplacedText = cursorOffset - offsetRange.start;
	if (cursorOffsetInReplacedText < 0) {
		return undefined;
	}

	const textBeforeCursorIsEqual = replacedText.substring(0, cursorOffsetInReplacedText) === newText.substring(0, cursorOffsetInReplacedText);
	if (!textBeforeCursorIsEqual) {
		return undefined;
	}

	if (!isSubword(replacedText, newText)) {
		return undefined;
	}

	return { range, newText };
}
/**
 * a is subword of b if a can be obtained by removing characters from b
*/

export function isSubword(a: string, b: string): boolean {
	for (let aIdx = 0, bIdx = 0; aIdx < a.length; bIdx++) {
		if (bIdx >= b.length) {
			return false;
		}
		if (a[aIdx] === b[bIdx]) {
			aIdx++;
		}
	}
	return true;
}

