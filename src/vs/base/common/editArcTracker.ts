/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BugIndicatingError } from './errors.js';
import { commonPrefixLength, commonSuffixLength, splitLines } from './strings.js';

export interface IArcTextReplacement {
	readonly start: number;
	readonly endExclusive: number;
	readonly text: string;
}

export interface IArcTextEdit {
	readonly replacements: readonly IArcTextReplacement[];
}

export interface IEditArcLineCountInfo {
	readonly deletedLineCounts: number;
	readonly insertedLineCounts: number;
}

export interface IEditArcValues extends IEditArcLineCountInfo {
	readonly arc: number;
}

interface ITrackedReplacement extends IArcTextReplacement {
	readonly isTracked: boolean;
}

/**
 * Tracks how many characters from an initial edit survive later edits.
 */
export class EditArcTracker {
	private readonly _trackedEdit: readonly ITrackedReplacement[];
	private _updatedTrackedEdit: readonly ITrackedReplacement[];

	constructor(
		private readonly _valueBeforeTrackedEdit: string,
		trackedEdit: IArcTextEdit,
	) {
		this._trackedEdit = normalizeReplacements(removeCommonText(trackedEdit.replacements, _valueBeforeTrackedEdit, true));
		this._updatedTrackedEdit = this._trackedEdit;
	}

	getOriginalCharacterCount(): number {
		let result = 0;
		for (const replacement of this._trackedEdit) {
			result += replacement.text.length;
		}
		return result;
	}

	handleEdits(edit: IArcTextEdit): void {
		const untrackedEdit = normalizeReplacements(edit.replacements.map(replacement => ({
			...replacement,
			isTracked: false,
		})));
		this._updatedTrackedEdit = compose(this._updatedTrackedEdit, untrackedEdit);
	}

	getAcceptedRestrainedCharactersCount(): number {
		let result = 0;
		for (const replacement of this._updatedTrackedEdit) {
			if (replacement.isTracked) {
				result += replacement.text.length;
			}
		}
		return result;
	}

	getLineCountInfo(): IEditArcLineCountInfo {
		return getLineCountInfo(
			this._updatedTrackedEdit.filter(replacement => replacement.isTracked),
			this._valueBeforeTrackedEdit
		);
	}

	getValues(): IEditArcValues {
		return {
			arc: this.getAcceptedRestrainedCharactersCount(),
			...this.getLineCountInfo(),
		};
	}
}

function removeCommonText(replacements: readonly IArcTextReplacement[], originalText: string, isTracked: boolean): ITrackedReplacement[] {
	return replacements.map(replacement => {
		const oldText = originalText.substring(replacement.start, replacement.endExclusive);
		const prefixLength = commonPrefixLength(oldText, replacement.text);
		const suffixLength = Math.min(
			oldText.length - prefixLength,
			replacement.text.length - prefixLength,
			commonSuffixLength(oldText, replacement.text)
		);
		return {
			start: replacement.start + prefixLength,
			endExclusive: replacement.endExclusive - suffixLength,
			text: replacement.text.substring(prefixLength, replacement.text.length - suffixLength),
			isTracked,
		};
	});
}

function normalizeReplacements(replacements: readonly ITrackedReplacement[]): ITrackedReplacement[] {
	const result: ITrackedReplacement[] = [];
	let previous: ITrackedReplacement | undefined;

	for (const replacement of replacements) {
		if (replacement.start > replacement.endExclusive) {
			throw new BugIndicatingError('Edit replacement start must not be after its end');
		}
		if (previous && replacement.start < previous.endExclusive) {
			throw new BugIndicatingError('Edit replacements must be sorted and disjoint');
		}
		if (replacement.start === replacement.endExclusive && replacement.text.length === 0) {
			continue;
		}
		if (previous && previous.endExclusive === replacement.start && previous.isTracked === replacement.isTracked) {
			previous = {
				start: previous.start,
				endExclusive: replacement.endExclusive,
				text: previous.text + replacement.text,
				isTracked: previous.isTracked,
			};
			continue;
		}
		if (previous) {
			result.push(previous);
		}
		previous = replacement;
	}

	if (previous) {
		result.push(previous);
	}
	return result;
}

function compose(first: readonly ITrackedReplacement[], second: readonly ITrackedReplacement[]): ITrackedReplacement[] {
	if (first.length === 0) {
		return second.slice();
	}
	if (second.length === 0) {
		return first.slice();
	}

	const firstQueue = first.slice();
	const result: ITrackedReplacement[] = [];
	let firstToSecondOffset = 0;

	for (const secondReplacement of second) {
		while (true) {
			const firstReplacement = firstQueue[0];
			if (!firstReplacement || firstReplacement.start + firstToSecondOffset + firstReplacement.text.length >= secondReplacement.start) {
				break;
			}
			firstQueue.shift();
			result.push(firstReplacement);
			firstToSecondOffset += firstReplacement.text.length - (firstReplacement.endExclusive - firstReplacement.start);
		}

		const offsetBeforeIntersections = firstToSecondOffset;
		let firstIntersecting: ITrackedReplacement | undefined;
		let lastIntersecting: ITrackedReplacement | undefined;

		while (true) {
			const firstReplacement = firstQueue[0];
			if (!firstReplacement || firstReplacement.start + firstToSecondOffset > secondReplacement.endExclusive) {
				break;
			}
			firstIntersecting ??= firstReplacement;
			lastIntersecting = firstReplacement;
			firstQueue.shift();
			firstToSecondOffset += firstReplacement.text.length - (firstReplacement.endExclusive - firstReplacement.start);
		}

		if (!firstIntersecting) {
			result.push(deltaReplacement(secondReplacement, -firstToSecondOffset));
			continue;
		}

		const replaceStart = Math.min(firstIntersecting.start, secondReplacement.start - offsetBeforeIntersections);
		const prefixLength = secondReplacement.start - (firstIntersecting.start + offsetBeforeIntersections);
		if (prefixLength > 0) {
			result.push(sliceReplacement(firstIntersecting, replaceStart, replaceStart, 0, prefixLength));
		}

		if (!lastIntersecting) {
			throw new BugIndicatingError('Missing intersecting ARC edit');
		}
		const suffixLength = lastIntersecting.endExclusive + firstToSecondOffset - secondReplacement.endExclusive;
		if (suffixLength > 0) {
			const suffix = sliceReplacement(
				lastIntersecting,
				lastIntersecting.endExclusive,
				lastIntersecting.endExclusive,
				lastIntersecting.text.length - suffixLength,
				lastIntersecting.text.length
			);
			firstQueue.unshift(suffix);
			firstToSecondOffset -= suffix.text.length - (suffix.endExclusive - suffix.start);
		}

		result.push(sliceReplacement(
			secondReplacement,
			replaceStart,
			secondReplacement.endExclusive - firstToSecondOffset,
			0,
			secondReplacement.text.length
		));
	}

	result.push(...firstQueue);
	return normalizeReplacements(result);
}

function deltaReplacement(replacement: ITrackedReplacement, offset: number): ITrackedReplacement {
	return {
		...replacement,
		start: replacement.start + offset,
		endExclusive: replacement.endExclusive + offset,
	};
}

function sliceReplacement(
	replacement: ITrackedReplacement,
	start: number,
	endExclusive: number,
	textStart: number,
	textEndExclusive: number,
): ITrackedReplacement {
	return {
		start,
		endExclusive,
		text: replacement.text.substring(textStart, textEndExclusive),
		isTracked: replacement.isTracked,
	};
}

interface IPosition {
	readonly lineNumber: number;
	readonly column: number;
}

interface ITextReplacement {
	readonly start: IPosition;
	readonly end: IPosition;
	readonly startOffset: number;
	readonly endOffset: number;
	readonly text: string;
}

function getLineCountInfo(replacements: readonly ITrackedReplacement[], initialText: string): IEditArcLineCountInfo {
	if (replacements.length === 0) {
		return { deletedLineCounts: 0, insertedLineCounts: 0 };
	}

	const lineOffsets = new LineOffsets(initialText);
	const textReplacements = replacements.map(replacement => ({
		start: lineOffsets.getPosition(replacement.start),
		end: lineOffsets.getPosition(replacement.endExclusive),
		startOffset: replacement.start,
		endOffset: replacement.endExclusive,
		text: replacement.text,
	}));

	let deletedLineCounts = 0;
	let insertedLineCounts = 0;
	let current: ITextReplacement[] = [];
	for (let i = 0; i < textReplacements.length; i++) {
		const replacement = textReplacements[i];
		const next = textReplacements[i + 1];
		current.push(replacement);
		if (next && next.start.lineNumber === replacement.end.lineNumber) {
			continue;
		}

		const joined = joinTextReplacements(current, initialText);
		current = [];
		const newLines = splitLines(joined.text);
		let startLineNumber = joined.start.lineNumber;
		let endLineNumberExclusive = joined.end.lineNumber + 1;

		const firstLinePrefix = initialText.substring(lineOffsets.getLineStart(joined.start.lineNumber), joined.startOffset);
		newLines[0] = firstLinePrefix + newLines[0];
		const lastLineSuffix = initialText.substring(joined.endOffset, lineOffsets.getLineEnd(joined.end.lineNumber));
		newLines[newLines.length - 1] += lastLineSuffix;

		const startsAtLineEnd = joined.start.column === lineOffsets.getLineLength(joined.start.lineNumber) + 1;
		const endsAtLineStart = joined.end.column === 1;
		if (startsAtLineEnd && newLines[0].length === firstLinePrefix.length) {
			startLineNumber++;
			newLines.shift();
		}
		if (newLines.length > 0 && startLineNumber < endLineNumberExclusive && endsAtLineStart && newLines[newLines.length - 1].length === lastLineSuffix.length) {
			endLineNumberExclusive--;
			newLines.pop();
		}

		deletedLineCounts += endLineNumberExclusive - startLineNumber;
		insertedLineCounts += newLines.length;
	}

	return { deletedLineCounts, insertedLineCounts };
}

function joinTextReplacements(replacements: readonly ITextReplacement[], initialText: string): ITextReplacement {
	const first = replacements[0];
	const last = replacements[replacements.length - 1];
	let text = first.text;
	for (let i = 1; i < replacements.length; i++) {
		text += initialText.substring(replacements[i - 1].endOffset, replacements[i].startOffset);
		text += replacements[i].text;
	}
	return {
		start: first.start,
		end: last.end,
		startOffset: first.startOffset,
		endOffset: last.endOffset,
		text,
	};
}

class LineOffsets {
	private readonly _lineStarts = [0];
	private readonly _lineEnds: number[] = [];

	constructor(text: string) {
		for (let i = 0; i < text.length; i++) {
			if (text.charCodeAt(i) === 10) {
				this._lineStarts.push(i + 1);
				this._lineEnds.push(i > 0 && text.charCodeAt(i - 1) === 13 ? i - 1 : i);
			}
		}
		this._lineEnds.push(text.length);
	}

	getPosition(offset: number): IPosition {
		let low = 0;
		let high = this._lineStarts.length - 1;
		while (low < high) {
			const middle = Math.ceil((low + high) / 2);
			if (this._lineStarts[middle] <= offset) {
				low = middle;
			} else {
				high = middle - 1;
			}
		}
		return { lineNumber: low + 1, column: offset - this._lineStarts[low] + 1 };
	}

	getLineStart(lineNumber: number): number {
		return this._lineStarts[lineNumber - 1];
	}

	getLineEnd(lineNumber: number): number {
		return this._lineEnds[lineNumber - 1];
	}

	getLineLength(lineNumber: number): number {
		return this.getLineEnd(lineNumber) - this.getLineStart(lineNumber);
	}
}
