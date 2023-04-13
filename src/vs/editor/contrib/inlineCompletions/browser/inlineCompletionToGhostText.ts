/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDiffChange, LcsDiff } from 'vs/base/common/diff/diff';
import * as strings from 'vs/base/common/strings';
import { commonPrefixLength, commonSuffixLength } from 'vs/base/common/strings';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { EndOfLinePreference, ITextModel } from 'vs/editor/common/model';
import { GhostText, GhostTextPart } from 'vs/editor/contrib/inlineCompletions/browser/ghostText';

export class Replacement {
	constructor(
		public readonly range: Range,
		public readonly text: string
	) {
	}

	/**
	 * Shrinks the range if the text has a suffix/prefix that agrees with the text buffer.
	 * E.g. text buffer: `ab[cdef]ghi`, [...] is the replace range, `cxyzf` is the new text.
	 * Then the minimized inline completion has range `abc[de]fghi` and text `xyz`.
	 */
	minimize(model: ITextModel): Replacement {
		const valueToReplace = model.getValueInRange(this.range);
		const commonPrefixLen = commonPrefixLength(valueToReplace, this.text);
		const startOffset = model.getOffsetAt(this.range.getStartPosition()) + commonPrefixLen;
		const start = model.getPositionAt(startOffset);

		const remainingValueToReplace = valueToReplace.substring(commonPrefixLen);
		const commonSuffixLen = commonSuffixLength(remainingValueToReplace, this.text);
		const end = model.getPositionAt(Math.max(startOffset, model.getOffsetAt(this.range.getEndPosition()) - commonSuffixLen));

		const text = this.text.substring(commonPrefixLen, this.text.length - commonSuffixLen);

		return new Replacement(Range.fromPositions(start, end), text);
	}
}

/**
 * @param previewSuffixLength Sets where to split `inlineCompletion.text`.
 * 	If the text is `hello` and the suffix length is 2, the non-preview part is `hel` and the preview-part is `lo`.
*/
export function computeGhostText(
	replacement: Replacement,
	textModel: ITextModel,
	mode: 'prefix' | 'subword' | 'subwordSmart',
	cursorPosition?: Position,
	previewSuffixLength = 0
): GhostText | undefined {
	let { range, text } = replacement;

	if (range.endLineNumber !== range.startLineNumber) {
		// try to minimize
		const textLines = text.split('\n');
		const actualText = textModel.getValueInRange(new Range(range.startLineNumber, range.startColumn, range.endLineNumber - 1, Number.MAX_SAFE_INTEGER), EndOfLinePreference.LF);
		if (textLines.slice(0, range.endLineNumber - range.startLineNumber).join('\n') !== actualText) {
			// first lines don't agree -> don't show ghost text
			return undefined;
		}
		text = textLines.slice(range.endLineNumber - range.startLineNumber).join('\n');
		range = new Range(range.endLineNumber, 1, range.endLineNumber, range.endColumn);
	}

	const sourceLine = textModel.getLineContent(range.startLineNumber);
	const sourceIndentationLength = strings.getLeadingWhitespace(sourceLine).length;

	const suggestionTouchesIndentation = range.startColumn - 1 <= sourceIndentationLength;
	if (suggestionTouchesIndentation) {
		// source:      ··········[······abc]
		//                         ^^^^^^^^^ inlineCompletion.range
		//              ^^^^^^^^^^ ^^^^^^ sourceIndentationLength
		//                         ^^^^^^ replacedIndentation.length
		//                               ^^^ rangeThatDoesNotReplaceIndentation

		// inlineCompletion.text: '··foo'
		//                         ^^ suggestionAddedIndentationLength

		const suggestionAddedIndentationLength = strings.getLeadingWhitespace(text).length;

		const replacedIndentation = sourceLine.substring(range.startColumn - 1, sourceIndentationLength);
		const rangeThatDoesNotReplaceIndentation = Range.fromPositions(
			range.getStartPosition().delta(0, replacedIndentation.length),
			range.getEndPosition()
		);

		const suggestionWithoutIndentationChange =
			text.startsWith(replacedIndentation)
				// Adds more indentation without changing existing indentation: We can add ghost text for this
				? text.substring(replacedIndentation.length)
				// Changes or removes existing indentation. Only add ghost text for the non-indentation part.
				: text.substring(suggestionAddedIndentationLength);

		text = suggestionWithoutIndentationChange;
		range = rangeThatDoesNotReplaceIndentation;
	}

	// This is a single line string
	const valueToBeReplaced = textModel.getValueInRange(range);

	const changes = cachingDiff(valueToBeReplaced, text);

	if (!changes) {
		// No ghost text in case the diff would be too slow to compute
		return undefined;
	}

	const lineNumber = range.startLineNumber;

	const parts = new Array<GhostTextPart>();

	if (mode === 'prefix') {
		const filteredChanges = changes.filter(c => c.originalLength === 0);
		if (filteredChanges.length > 1 || filteredChanges.length === 1 && filteredChanges[0].originalStart !== valueToBeReplaced.length) {
			// Prefixes only have a single change.
			return undefined;
		}
	}

	const previewStartInCompletionText = text.length - previewSuffixLength;

	for (const c of changes) {
		const insertColumn = range.startColumn + c.originalStart + c.originalLength;

		if (mode === 'subwordSmart' && cursorPosition && cursorPosition.lineNumber === range.startLineNumber && insertColumn < cursorPosition.column) {
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
		const nonPreviewText = text.substring(c.modifiedStart, nonPreviewTextEnd);
		const italicText = text.substring(nonPreviewTextEnd, Math.max(c.modifiedStart, modifiedEnd));

		if (nonPreviewText.length > 0) {
			const lines = strings.splitLines(nonPreviewText);
			parts.push(new GhostTextPart(insertColumn, lines, false));
		}
		if (italicText.length > 0) {
			const lines = strings.splitLines(italicText);
			parts.push(new GhostTextPart(insertColumn, lines, true));
		}
	}

	return new GhostText(lineNumber, parts, 0);
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
