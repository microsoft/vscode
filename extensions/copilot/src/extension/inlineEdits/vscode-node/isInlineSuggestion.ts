/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Position, Range, TextDocument } from 'vscode';

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
	if (range.start.line === range.end.line && range.start.line === cursorPos.line) {
		const sameLineEdit = validateSameLineGhostText(cursorPos, doc, range, newText);
		if (sameLineEdit) {
			return sameLineEdit;
		}
	}

	if (advanced) {
		const cursorEdit = tryRebaseAsCursorEdit(cursorPos, doc, range, newText);
		if (cursorEdit) {
			return cursorEdit;
		}
	}

	// Preserve the established behavior for empty-range insertions at the start of
	// the next line (the target line itself may be non-empty, e.g. `\t) {`).
	const nextLineInsertion = tryAdjustNextLineInsertion(cursorPos, doc, range, newText);
	if (nextLineInsertion) {
		return nextLineInsertion;
	}

	return undefined;
}

/**
 * Re-express an edit as an equivalent edit from the cursor to the end of its
 * line. If any equivalent inline suggestion exists, one exists in this form.
 */
function tryRebaseAsCursorEdit(cursorPos: Position, doc: TextDocument, range: Range, newText: string): InlineSuggestionEdit | undefined {
	const cursorOffset = doc.offsetAt(cursorPos);
	const lineEnd = doc.lineAt(cursorPos.line).range.end;
	const lineEndOffset = doc.offsetAt(lineEnd);
	const rangeStartOffset = doc.offsetAt(range.start);
	const rangeEndOffset = doc.offsetAt(range.end);
	const affectedStart = doc.positionAt(Math.min(cursorOffset, rangeStartOffset));
	const affectedEnd = doc.positionAt(Math.max(lineEndOffset, rangeEndOffset));

	const editedText = doc.getText(new Range(affectedStart, range.start)) + newText + doc.getText(new Range(range.end, affectedEnd));
	const unchangedPrefix = doc.getText(new Range(affectedStart, cursorPos));
	const unchangedSuffix = doc.getText(new Range(lineEnd, affectedEnd));
	const cursorEditTextEnd = editedText.length - unchangedSuffix.length;
	if (
		cursorEditTextEnd < unchangedPrefix.length
		|| !editedText.startsWith(unchangedPrefix)
		|| !editedText.endsWith(unchangedSuffix)
	) {
		return undefined;
	}

	const cursorEdit = {
		range: new Range(cursorPos, lineEnd),
		newText: editedText.substring(unchangedPrefix.length, cursorEditTextEnd),
	};
	return validateSameLineGhostText(cursorPos, doc, cursorEdit.range, cursorEdit.newText);
}

/**
 * If the cursor is at the end of a line and the edit is an empty-range insertion
 * at column 0 of the next line, rewrite it as a pure insertion at the cursor
 * position.
 *
 * This is the ungated fallback for when `advanced` rebasing is disabled; when it
 * is enabled, {@link tryRebaseAsCursorEdit} already subsumes this case.
 *
 * The line terminator between the cursor and `range.start` (`lineBreak`) lives in
 * the document, not in the edit, so a cursor insertion always leaves it *after*
 * the inserted text. Inserting `N` at the start of the next line therefore equals
 * inserting `lineBreak + N'` at the cursor iff `N === N' + lineBreak` — i.e. `N`
 * must end with the document's own line break (then `N'` is `N` with that break
 * dropped). Requiring the document break (not merely '\n') keeps this exact for
 * CRLF documents. Otherwise a pure cursor insertion cannot reproduce the edit
 * without a spurious blank line, so we bail and let it render as an inline edit.
 */
function tryAdjustNextLineInsertion(cursorPos: Position, doc: TextDocument, range: Range, newText: string): InlineSuggestionEdit | undefined {
	if (!range.isEmpty) {
		return undefined;
	}
	if (cursorPos.line + 1 !== range.start.line || range.start.character !== 0) {
		return undefined;
	}
	if (doc.lineAt(cursorPos.line).text.length !== cursorPos.character) {
		return undefined; // cursor is not at the end of the line
	}

	// Use an empty range at the cursor so the suggestion is a pure insertion.
	// `lineBreak` is the document's own terminator between the cursor and the next
	// line; the pull-up is exact only when `newText` ends with exactly that break,
	// which we drop and re-prepend at the cursor. Matching the document break (not
	// just '\n') keeps CRLF documents exact and never leaks a dangling '\r'.
	const lineBreak = doc.getText(new Range(cursorPos, range.start));
	if (!newText.endsWith(lineBreak)) {
		return undefined;
	}
	const trimmedNewText = newText.substring(0, newText.length - lineBreak.length);
	return { range: new Range(cursorPos, cursorPos), newText: lineBreak + trimmedNewText };
}

/**
 * Validate that a single-line edit can be rendered as ghost text at the cursor:
 *  - the cursor is at or after `range.start`
 *  - everything before the cursor in the replaced text matches `newText`
 *  - the replaced text is a subword of `newText` (i.e. only insertions are needed)
 */
function validateSameLineGhostText(cursorPos: Position, doc: TextDocument, range: Range, newText: string): InlineSuggestionEdit | undefined {
	const replacedText = doc.getText(range);
	const cursorOffsetInReplacedText = cursorPos.character - range.start.character;
	if (cursorOffsetInReplacedText < 0) {
		return undefined;
	}
	if (replacedText.substring(0, cursorOffsetInReplacedText) !== newText.substring(0, cursorOffsetInReplacedText)) {
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
