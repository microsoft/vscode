/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDiffChange, LcsDiff } from 'vs/base/common/diff/diff';
import * as strings from 'vs/base/common/strings';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { ITextModel } from 'vs/editor/common/model';
import { InlineCompletion } from 'vs/editor/common/modes';
import { GhostText, GhostTextPart } from 'vs/editor/contrib/inlineCompletions/ghostText';

export interface NormalizedInlineCompletion extends InlineCompletion {
	range: Range;
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

	const modifiedLength = inlineCompletion.text.length;
	const previewStartInModified = modifiedLength - previewSuffixLength;

	// This is a single line string
	const valueToBeReplaced = textModel.getValueInRange(inlineCompletion.range);

	const changes = cachingDiff(valueToBeReplaced, inlineCompletion.text);

	const lineNumber = inlineCompletion.range.startLineNumber;

	const parts = new Array<GhostTextPart>();

	if (mode === 'prefix') {
		const filteredChanges = changes.filter(c => c.originalLength === 0);
		if (filteredChanges.length > 1 || filteredChanges.length === 1 && filteredChanges[0].originalStart !== valueToBeReplaced.length) {
			// Prefixes only have a single change.
			return undefined;
		}
	}

	for (const c of changes) {
		const insertColumn = inlineCompletion.range.startColumn + c.originalStart + c.originalLength;

		if (mode === 'subwordSmart' && cursorPosition && cursorPosition.lineNumber === inlineCompletion.range.startLineNumber && insertColumn < cursorPosition.column) {
			// No ghost text before cursor
			return undefined;
		}

		if (c.originalLength > 0) {
			const originalText = valueToBeReplaced.substr(c.originalStart, c.originalLength);
			const firstNonWsCol = textModel.getLineFirstNonWhitespaceColumn(lineNumber);
			if (!(/^(\t| )*$/.test(originalText) && (firstNonWsCol === 0 || insertColumn <= firstNonWsCol))) {
				return undefined;
			}
		}

		if (c.modifiedLength === 0) {
			continue;
		}

		const modifiedEnd = c.modifiedStart + c.modifiedLength;
		const nonPreviewTextEnd = Math.max(c.modifiedStart, Math.min(modifiedEnd, previewStartInModified));
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

let lastRequest: { originalValue: string; newValue: string; changes: readonly IDiffChange[]; } | undefined = undefined;
function cachingDiff(originalValue: string, newValue: string): readonly IDiffChange[] {
	if (lastRequest?.originalValue === originalValue && lastRequest?.newValue === newValue) {
		return lastRequest?.changes;
	} else {
		const changes = smartDiff(originalValue, newValue);
		lastRequest = {
			originalValue,
			newValue,
			changes
		};
		return changes;
	}
}

/**
 * When matching `if ()` with `if (f() = 1) { g(); }`,
 * align it like this:        `if (       )`
 * Not like this:			  `if (  )`
 * Also not like this:		  `if (             )`.
 *
 * The parenthesis are preprocessed to ensure that they match correctly.
 */
function smartDiff(originalValue: string, newValue: string): readonly IDiffChange[] {
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
			const id = group * 100 + level;

			// TODO support more brackets
			if (source[i] === '(') {
				characters[i] = getUniqueCharCode(2 * id);
				level++;
			} else if (source[i] === ')') {
				characters[i] = getUniqueCharCode(2 * id + 1);
				if (level === 1) {
					group++;
				}
				level = Math.max(level - 1, 0);
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
