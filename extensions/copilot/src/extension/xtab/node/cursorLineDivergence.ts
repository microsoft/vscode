/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StringEdit } from '../../../util/vs/editor/common/core/edits/stringEdit';
import { Position } from '../../../util/vs/editor/common/core/position';
import { PositionOffsetTransformer } from '../../../util/vs/editor/common/core/text/positionToOffset';

/**
 * Resolves the current content of the cursor line after applying an intermediate
 * user edit to the original document.
 *
 * The cursor line's 0-based index in the original document may no longer be
 * valid after the user inserts or deletes lines above the cursor. This function
 * maps the cursor line's character offset through the edit to find the correct
 * line in the resulting document.
 *
 * @param originalDoc A transformer for the original document text (reused to
 *                    avoid recomputing line offsets).
 * @param cursorDocLineIdx 0-based line index in the original document.
 * @returns The line content, or `undefined` if the cursor line index is out of
 *          bounds or the original position falls inside a replacement range
 *          (making the mapping ambiguous).
 */
export function getCurrentCursorLine(
	originalDoc: PositionOffsetTransformer,
	cursorDocLineIdx: number,
	intermediateEdit: StringEdit,
): string | undefined {
	const lineNumber = cursorDocLineIdx + 1; // 1-based
	const lineCount = originalDoc.textLength.lineCount + 1;

	if (lineNumber < 1 || lineNumber > lineCount) {
		return undefined;
	}

	const cursorLineStartOffset = originalDoc.getOffset(new Position(lineNumber, 1));

	// Walk through the edit's replacements (sorted, non-overlapping) and
	// accumulate the character-offset delta for replacements entirely before
	// the cursor line start.
	let delta = 0;
	for (const replacement of intermediateEdit.replacements) {
		if (replacement.replaceRange.endExclusive <= cursorLineStartOffset) {
			delta += replacement.newText.length - replacement.replaceRange.length;
		} else if (replacement.replaceRange.start < cursorLineStartOffset) {
			// The cursor line start falls inside a replacement — ambiguous.
			return undefined;
		} else {
			break;
		}
	}

	const mappedOffset = cursorLineStartOffset + delta;
	const currentDoc = intermediateEdit.apply(originalDoc.text);
	const currentTransformer = new PositionOffsetTransformer(currentDoc);

	// Map the offset back to a position in the current document, then extract
	// the full line content.
	const currentPos = currentTransformer.getPosition(mappedOffset);
	const lineStart = currentTransformer.getOffset(new Position(currentPos.lineNumber, 1));
	const lineLen = currentTransformer.getLineLength(currentPos.lineNumber);
	return currentDoc.substring(lineStart, lineStart + lineLen);
}

/**
 * A minimal single-line edit: the text between `startOffset` and `endOffset`
 * in the original was replaced with `inserted`.
 */
interface LineDiff {
	readonly startOffset: number;
	readonly endOffset: number;
	readonly replaced: string;
	readonly inserted: string;
}

/**
 * Computes the minimal edit between two versions of the same line by stripping
 * the longest common prefix and suffix.
 *
 * Example: `diffLine("function fi", "function fib")`
 *   → `{ startOffset: 11, endOffset: 11, replaced: "", inserted: "b" }`
 */
function diffLine(before: string, after: string): LineDiff {
	let prefixLen = 0;
	while (prefixLen < before.length && prefixLen < after.length
		&& before[prefixLen] === after[prefixLen]) {
		prefixLen++;
	}
	let suffixLen = 0;
	while (suffixLen < before.length - prefixLen && suffixLen < after.length - prefixLen
		&& before[before.length - 1 - suffixLen] === after[after.length - 1 - suffixLen]) {
		suffixLen++;
	}
	return {
		startOffset: prefixLen,
		endOffset: before.length - suffixLen,
		replaced: before.substring(prefixLen, before.length - suffixLen),
		inserted: after.substring(prefixLen, after.length - suffixLen),
	};
}

/**
 * Checks whether the model's cursor line output is compatible with what the user
 * has typed since the request started.
 *
 * Algorithm:
 * 1. Diff original → current to find what the user typed.
 * 2. Diff original → model to find what the model changed.
 * 3. If the user's edit range falls within the model's edit range, check whether
 *    the model's new text is a continuation of the user's typing.
 *
 * @example
 *   original: `function fi`, current: `function fib`, model: `function fibonacci(n): number`
 *   → user typed "b", model inserted "bonacci(n): number"
 *   → model text starts with "b" → compatible ✓
 *
 * @example
 *   original: `function fi`, current: `function fix`, model: `function fibonacci(n): number`
 *   → user typed "x", model inserted "bonacci(n): number"
 *   → model text does not start with "x" → incompatible ✗
 */
export function isModelCursorLineCompatible(originalCursorLine: string, currentCursorLine: string, modelCursorLine: string): boolean {
	const userEdit = diffLine(originalCursorLine, currentCursorLine);
	const modelEdit = diffLine(originalCursorLine, modelCursorLine);

	// No actual user change — trivially compatible.
	if (userEdit.replaced.length === 0 && userEdit.inserted.length === 0) {
		return true;
	}

	// The user's edit range must fall within the model's edit range.
	// If the user edited a region the model didn't touch, we can't determine
	// compatibility from the cursor line alone.
	const userEditWithinModelEdit = userEdit.startOffset >= modelEdit.startOffset
		&& userEdit.endOffset <= modelEdit.endOffset;

	if (!userEditWithinModelEdit) {
		return false;
	}

	return isUserEditCompatibleWithModelEdit(userEdit, modelEdit, currentCursorLine, modelCursorLine);
}

const AUTO_CLOSE_PAIRS = new Set(['()', '[]', '{}', '<>', '""', `''`, '``']);

/**
 * Checks whether the user's edit is compatible with the model's edit.
 *
 * For pure insertions, compatibility is determined by whether the model is
 * continuing the user's inserted text.
 *
 * For deletions and replacements, avoid treating an empty inserted string as
 * universally compatible. In those cases, only accept when the resulting line
 * already matches the model, or when the model is editing the exact same range
 * and replacing the exact same original text with a compatible continuation.
 */
function isUserEditCompatibleWithModelEdit(userEdit: LineDiff, modelEdit: LineDiff, currentCursorLine: string, modelCursorLine: string): boolean {
	if (userEdit.replaced.length > 0) {
		if (currentCursorLine === modelCursorLine) {
			return true;
		}

		return userEdit.startOffset === modelEdit.startOffset
			&& userEdit.endOffset === modelEdit.endOffset
			&& userEdit.replaced === modelEdit.replaced
			&& userEdit.inserted.length > 0
			&& isUserTypingCompatibleWithModelText(userEdit.inserted, modelEdit.inserted);
	}

	return isUserTypingCompatibleWithModelText(userEdit.inserted, modelEdit.inserted);
}

/**
 * Checks whether the user's typed text is compatible with the model's new text.
 *
 * Rules:
 * 1. The model's new text must **start with** the user's typed text — the model
 *    is continuing what the user began.
 * 2. If the user's text is a known auto-close pair (e.g. `()`, `{}`), accept
 *    if both characters appear in order in the model's text (subsequence match).
 */
function isUserTypingCompatibleWithModelText(userTypedText: string, modelNewText: string): boolean {
	if (modelNewText.startsWith(userTypedText)) {
		return true;
	}

	// Subsequence check for auto-close pairs: if the user typed e.g. "()" and the
	// model's text is "(x, y)", the pair characters appear in order.
	if (AUTO_CLOSE_PAIRS.has(userTypedText)) {
		return isSubsequenceOf(userTypedText, modelNewText);
	}

	return false;
}

/**
 * Returns true if every character of `subsequence` appears in `str` in order.
 */
function isSubsequenceOf(subsequence: string, str: string): boolean {
	let si = 0;
	for (let ti = 0; ti < subsequence.length; ti++) {
		const idx = str.indexOf(subsequence[ti], si);
		if (idx === -1) {
			return false;
		}
		si = idx + 1;
	}
	return true;
}
