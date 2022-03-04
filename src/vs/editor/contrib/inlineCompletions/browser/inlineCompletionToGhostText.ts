/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDiffChange, LcsDiff } from 'vs/base/common/diff/diff';
import * as strings from 'vs/base/common/strings';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { ITextModel } from 'vs/editor/common/model';
import { InlineCompletion } from 'vs/editor/common/languages';
import { GhostText, GhostTextPart } from 'vs/editor/contrib/inlineCompletions/browser/ghostText';

/**
 * A normalized inline completion is an inline completion with a defined range.
*/
export interface NormalizedInlineCompletion extends InlineCompletion {
	readonly range: Range;
	readonly text: string;

	readonly snippetInfo:
	| {
		snippet: string;
		/* Could be different than the main range */
		range: Range;
	}
	| undefined;
}

export function normalizedInlineCompletionsEquals(a: NormalizedInlineCompletion | undefined, b: NormalizedInlineCompletion | undefined): boolean {
	if (a === b) {
		return true;
	}
	if (!a || !b) {
		return false;
	}
	return a.range.equalsRange(b.range) && a.text === b.text && a.command === b.command;
}

/**
 * @param previewSuffixLength Sets where to split `inlineCompletion.text`.
 * 	If the text is `hello` and the suffix length is 2, the non-preview part is `hel` and the preview-part is `lo`.
*/
export function inlineCompletionToGhostText(
	inlineCompletion: NormalizedInlineCompletion,
	textModel: ITextModel,
	mode: 'prefix' | 'subword' | 'subwordSmart',
	cursorPosition?: Position,
	previewSuffixLength = 0
): GhostText | undefined {
	if (inlineCompletion.range.startLineNumber !== inlineCompletion.range.endLineNumber) {
		// Only single line replacements are supported.
		return undefined;
	}

	const sourceLine = textModel.getLineContent(inlineCompletion.range.startLineNumber);
	const sourceIndentationLength = strings.getLeadingWhitespace(sourceLine).length;

	const suggestionTouchesIndentation = inlineCompletion.range.startColumn - 1 <= sourceIndentationLength;
	if (suggestionTouchesIndentation) {
		// source:      ··········[······abc]
		//                         ^^^^^^^^^ inlineCompletion.range
		//              ^^^^^^^^^^ ^^^^^^ sourceIndentationLength
		//                         ^^^^^^ replacedIndentation.length
		//                               ^^^ rangeThatDoesNotReplaceIndentation

		// inlineCompletion.text: '··foo'
		//                         ^^ suggestionAddedIndentationLength

		const suggestionAddedIndentationLength = strings.getLeadingWhitespace(inlineCompletion.text).length;

		const replacedIndentation = sourceLine.substring(inlineCompletion.range.startColumn - 1, sourceIndentationLength);
		const rangeThatDoesNotReplaceIndentation = Range.fromPositions(
			inlineCompletion.range.getStartPosition().delta(0, replacedIndentation.length),
			inlineCompletion.range.getEndPosition()
		);

		const suggestionWithoutIndentationChange =
			inlineCompletion.text.startsWith(replacedIndentation)
				// Adds more indentation without changing existing indentation: We can add ghost text for this
				? inlineCompletion.text.substring(replacedIndentation.length)
				// Changes or removes existing indentation. Only add ghost text for the non-indentation part.
				: inlineCompletion.text.substring(suggestionAddedIndentationLength);

		inlineCompletion = {
			range: rangeThatDoesNotReplaceIndentation,
			text: suggestionWithoutIndentationChange,
			command: inlineCompletion.command,
			snippetInfo: undefined,
		};
	}

	// This is a single line string
	const valueToBeReplaced = textModel.getValueInRange(inlineCompletion.range);

	const changes = cachingDiff(valueToBeReplaced, inlineCompletion.text);

	if (!changes) {
		// No ghost text in case the diff would be too slow to compute
		return undefined;
	}

	const lineNumber = inlineCompletion.range.startLineNumber;

	const parts = new Array<GhostTextPart>();

	if (mode === 'prefix') {
		const filteredChanges = changes.filter(c => c.originalLength === 0);
		if (filteredChanges.length > 1 || filteredChanges.length === 1 && filteredChanges[0].originalStart !== valueToBeReplaced.length) {
			// Prefixes only have a single change.
			return undefined;
		}
	}

	const previewStartInCompletionText = inlineCompletion.text.length - previewSuffixLength;

	for (const c of changes) {
		const insertColumn = inlineCompletion.range.startColumn + c.originalStart + c.originalLength;

		if (mode === 'subwordSmart' && cursorPosition && cursorPosition.lineNumber === inlineCompletion.range.startLineNumber && insertColumn < cursorPosition.column) {
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
		const nonPreviewText = inlineCompletion.text.substring(c.modifiedStart, nonPreviewTextEnd);
		const italicText = inlineCompletion.text.substring(nonPreviewTextEnd, Math.max(c.modifiedStart, modifiedEnd));

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
		sum += Math.max(c.originalLength - c.modifiedLength, 0);
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
