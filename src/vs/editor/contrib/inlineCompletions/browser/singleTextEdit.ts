/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDiffChange, LcsDiff } from 'vs/base/common/diff/diff';
import { commonPrefixLength, getLeadingWhitespace } from 'vs/base/common/strings';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { TextLength } from 'vs/editor/common/core/textLength';
import { SingleTextEdit } from 'vs/editor/common/core/textEdit';
import { EndOfLinePreference, ITextModel } from 'vs/editor/common/model';
import { GhostText, GhostTextPart } from 'vs/editor/contrib/inlineCompletions/browser/ghostText';

export function singleTextRemoveCommonPrefix(edit: SingleTextEdit, model: ITextModel, validModelRange?: Range): SingleTextEdit {
	const modelRange = validModelRange ? edit.range.intersectRanges(validModelRange) : edit.range;
	if (!modelRange) {
		return edit;
	}
	const valueToReplace = model.getValueInRange(modelRange, EndOfLinePreference.LF);
	const commonPrefixLen = commonPrefixLength(valueToReplace, edit.text);
	const start = TextLength.ofText(valueToReplace.substring(0, commonPrefixLen)).addToPosition(edit.range.getStartPosition());
	const text = edit.text.substring(commonPrefixLen);
	const range = Range.fromPositions(start, edit.range.getEndPosition());
	return new SingleTextEdit(range, text);
}

export function singleTextEditAugments(edit: SingleTextEdit, base: SingleTextEdit): boolean {
	// The augmented completion must replace the base range, but can replace even more
	return edit.text.startsWith(base.text) && rangeExtends(edit.range, base.range);
}

/**
 * @param previewSuffixLength Sets where to split `inlineCompletion.text`.
 * 	If the text is `hello` and the suffix length is 2, the non-preview part is `hel` and the preview-part is `lo`.
*/
export function computeGhostText(
	edit: SingleTextEdit,
	model: ITextModel,
	mode: 'prefix' | 'subword' | 'subwordSmart',
	cursorPosition?: Position,
	previewSuffixLength = 0
): GhostText | undefined {
	let e = singleTextRemoveCommonPrefix(edit, model);

	if (e.range.endLineNumber !== e.range.startLineNumber) {
		// This edit might span multiple lines, but the first lines must be a common prefix.
		return undefined;
	}

	const sourceLine = model.getLineContent(e.range.startLineNumber);
	const sourceIndentationLength = getLeadingWhitespace(sourceLine).length;

	const suggestionTouchesIndentation = e.range.startColumn - 1 <= sourceIndentationLength;
	if (suggestionTouchesIndentation) {
		// source:      ··········[······abc]
		//                         ^^^^^^^^^ inlineCompletion.range
		//              ^^^^^^^^^^ ^^^^^^ sourceIndentationLength
		//                         ^^^^^^ replacedIndentation.length
		//                               ^^^ rangeThatDoesNotReplaceIndentation

		// inlineCompletion.text: '··foo'
		//                         ^^ suggestionAddedIndentationLength

		const suggestionAddedIndentationLength = getLeadingWhitespace(e.text).length;

		const replacedIndentation = sourceLine.substring(e.range.startColumn - 1, sourceIndentationLength);

		const [startPosition, endPosition] = [e.range.getStartPosition(), e.range.getEndPosition()];
		const newStartPosition =
			startPosition.column + replacedIndentation.length <= endPosition.column
				? startPosition.delta(0, replacedIndentation.length)
				: endPosition;
		const rangeThatDoesNotReplaceIndentation = Range.fromPositions(newStartPosition, endPosition);

		const suggestionWithoutIndentationChange =
			e.text.startsWith(replacedIndentation)
				// Adds more indentation without changing existing indentation: We can add ghost text for this
				? e.text.substring(replacedIndentation.length)
				// Changes or removes existing indentation. Only add ghost text for the non-indentation part.
				: e.text.substring(suggestionAddedIndentationLength);

		e = new SingleTextEdit(rangeThatDoesNotReplaceIndentation, suggestionWithoutIndentationChange);
	}

	// This is a single line string
	const valueToBeReplaced = model.getValueInRange(e.range);

	const changes = cachingDiff(valueToBeReplaced, e.text);

	if (!changes) {
		// No ghost text in case the diff would be too slow to compute
		return undefined;
	}

	const lineNumber = e.range.startLineNumber;

	const parts = new Array<GhostTextPart>();

	if (mode === 'prefix') {
		const filteredChanges = changes.filter(c => c.originalLength === 0);
		if (filteredChanges.length > 1 || filteredChanges.length === 1 && filteredChanges[0].originalStart !== valueToBeReplaced.length) {
			// Prefixes only have a single change.
			return undefined;
		}
	}

	const previewStartInCompletionText = e.text.length - previewSuffixLength;

	for (const c of changes) {
		const insertColumn = e.range.startColumn + c.originalStart + c.originalLength;

		if (mode === 'subwordSmart' && cursorPosition && cursorPosition.lineNumber === e.range.startLineNumber && insertColumn < cursorPosition.column) {
			// No ghost text before cursor
			return undefined;
		}

		if (c.originalLength > 0) {
			return undefined;
		}

		if (c.modifiedLength === 0) {
			continue;
		}

		const modifiedEnd = c.modifiedStart + c.modifiedLength;
		const nonPreviewTextEnd = Math.max(c.modifiedStart, Math.min(modifiedEnd, previewStartInCompletionText));
		const nonPreviewText = e.text.substring(c.modifiedStart, nonPreviewTextEnd);
		const italicText = e.text.substring(nonPreviewTextEnd, Math.max(c.modifiedStart, modifiedEnd));

		if (nonPreviewText.length > 0) {
			parts.push(new GhostTextPart(insertColumn, nonPreviewText, false));
		}
		if (italicText.length > 0) {
			parts.push(new GhostTextPart(insertColumn, italicText, true));
		}
	}

	return new GhostText(lineNumber, parts);
}

function rangeExtends(extendingRange: Range, rangeToExtend: Range): boolean {
	return rangeToExtend.getStartPosition().equals(extendingRange.getStartPosition())
		&& rangeToExtend.getEndPosition().isBeforeOrEqual(extendingRange.getEndPosition());
}

let lastRequest: { originalValue: string; newValue: string; changes: readonly IDiffChange[] | undefined } | undefined = undefined;
function cachingDiff(originalValue: string, newValue: string): readonly IDiffChange[] | undefined {
	if (lastRequest?.originalValue === originalValue && lastRequest?.newValue === newValue) {
		return lastRequest?.changes;
	} else {
		let changes = smartDiff(originalValue, newValue, true);
		if (changes) {
			const deletedChars = deletedCharacters(changes);
			if (deletedChars > 0) {
				// For performance reasons, don't compute diff if there is nothing to improve
				const newChanges = smartDiff(originalValue, newValue, false);
				if (newChanges && deletedCharacters(newChanges) < deletedChars) {
					// Disabling smartness seems to be better here
					changes = newChanges;
				}
			}
		}
		lastRequest = {
			originalValue,
			newValue,
			changes
		};
		return changes;
	}
}

function deletedCharacters(changes: readonly IDiffChange[]): number {
	let sum = 0;
	for (const c of changes) {
		sum += c.originalLength;
	}
	return sum;
}

/**
 * When matching `if ()` with `if (f() = 1) { g(); }`,
 * align it like this:        `if (       )`
 * Not like this:			  `if (  )`
 * Also not like this:		  `if (             )`.
 *
 * The parenthesis are preprocessed to ensure that they match correctly.
 */
function smartDiff(originalValue: string, newValue: string, smartBracketMatching: boolean): (readonly IDiffChange[]) | undefined {
	if (originalValue.length > 5000 || newValue.length > 5000) {
		// We don't want to work on strings that are too big
		return undefined;
	}

	function getMaxCharCode(val: string): number {
		let maxCharCode = 0;
		for (let i = 0, len = val.length; i < len; i++) {
			const charCode = val.charCodeAt(i);
			if (charCode > maxCharCode) {
				maxCharCode = charCode;
			}
		}
		return maxCharCode;
	}

	const maxCharCode = Math.max(getMaxCharCode(originalValue), getMaxCharCode(newValue));
	function getUniqueCharCode(id: number): number {
		if (id < 0) {
			throw new Error('unexpected');
		}
		return maxCharCode + id + 1;
	}

	function getElements(source: string): Int32Array {
		let level = 0;
		let group = 0;
		const characters = new Int32Array(source.length);
		for (let i = 0, len = source.length; i < len; i++) {
			// TODO support more brackets
			if (smartBracketMatching && source[i] === '(') {
				const id = group * 100 + level;
				characters[i] = getUniqueCharCode(2 * id);
				level++;
			} else if (smartBracketMatching && source[i] === ')') {
				level = Math.max(level - 1, 0);
				const id = group * 100 + level;
				characters[i] = getUniqueCharCode(2 * id + 1);
				if (level === 0) {
					group++;
				}
			} else {
				characters[i] = source.charCodeAt(i);
			}
		}
		return characters;
	}

	const elements1 = getElements(originalValue);
	const elements2 = getElements(newValue);

	return new LcsDiff({ getElements: () => elements1 }, { getElements: () => elements2 }).ComputeDiff(false).changes;
}
