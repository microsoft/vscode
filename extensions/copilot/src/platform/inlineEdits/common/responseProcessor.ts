/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { illegalArgument } from '../../../util/vs/base/common/errors';
import { LineReplacement } from '../../../util/vs/editor/common/core/edits/lineEdit';
import { LineRange } from '../../../util/vs/editor/common/core/ranges/lineRange';


export namespace ResponseProcessor {

	/**
	 * Controls when to emit fast cursor line changes.
	 * - `off`: Never emit fast cursor line changes
	 * - `additiveOnly`: Only emit when the edit on the cursor line is additive (only adds text)
	 */
	export const enum EmitFastCursorLineChange {
		Off = 'off',
		AdditiveOnly = 'additiveOnly',
	}

	export type DiffParams = {
		/**
		 * Controls when to emit a fast cursor line change event.
		 */
		readonly emitFastCursorLineChange: EmitFastCursorLineChange;
		readonly nSignificantLinesToConverge: number;
		readonly nLinesToConverge: number;
	};

	export const DEFAULT_DIFF_PARAMS: DiffParams = {
		emitFastCursorLineChange: EmitFastCursorLineChange.Off,
		nSignificantLinesToConverge: 2,
		nLinesToConverge: 3,
	};

	/**
	 * Maps the `emitFastCursorLineChange` setting value to the new type,
	 * preserving backward compatibility with the old boolean type.
	 */
	export function mapEmitFastCursorLineChange(value: boolean | EmitFastCursorLineChange): EmitFastCursorLineChange {
		if (value === true) {
			return EmitFastCursorLineChange.AdditiveOnly;
		}
		if (value === false) {
			return EmitFastCursorLineChange.Off;
		}
		return value;
	}

	type DivergenceState =
		| { k: 'aligned' }
		| {
			k: 'diverged';
			startLineIdx: number;
			newLines: string[];
			convergenceCandidates?: number[];
		};

	/**
	 *
	 * @param originalLines
	 * @param modifiedLines
	 * @param cursorOriginalLinesOffset offset of cursor within original lines
	 */
	export async function* diff(originalLines: string[], modifiedLines: AsyncIterable<string>, cursorOriginalLinesOffset: number, params: DiffParams): AsyncIterable<LineReplacement> {

		const lineToIdxs = new ArrayMap<string, number>();
		for (const [i, line] of originalLines.entries()) {
			lineToIdxs.add(line, i);
		}

		let editWindowIdx = 0;
		let updatedEditWindowIdx = -1;

		let state: DivergenceState = { k: 'aligned' };

		for await (const line of modifiedLines) {
			++updatedEditWindowIdx;

			// handle modifiedLines.length > originalLines.length
			if (editWindowIdx >= originalLines.length) {
				switch (state.k) {
					case 'aligned': {
						state = { k: 'diverged', startLineIdx: editWindowIdx, newLines: [line] };
						break;
					}
					case 'diverged': {
						state.newLines.push(line);
					}
				}
				continue;
			}

			if (state.k === 'aligned') {
				if (originalLines[editWindowIdx] === line) { // if line is the same as in originalLines, skip over it
					++editWindowIdx;
					continue;
				}
				state = { k: 'diverged', startLineIdx: editWindowIdx, newLines: [] };
			}

			state.newLines.push(line);

			const convergenceResult = checkForConvergence(
				originalLines,
				cursorOriginalLinesOffset,
				lineToIdxs,
				state,
				editWindowIdx,
				params,
			);

			if (convergenceResult) {
				yield convergenceResult.singleLineEdit;
				editWindowIdx = convergenceResult.convergenceEndIdx;
				state = { k: 'aligned' };
			}
		}

		switch (state.k) {
			case 'diverged': {
				const lineRange = new LineRange(state.startLineIdx + 1, originalLines.length + 1);
				yield new LineReplacement(lineRange, state.newLines);
				break;
			}

			case 'aligned': {
				if (editWindowIdx < originalLines.length) {
					const lineRange = new LineRange(editWindowIdx + 1, originalLines.length + 1);
					yield new LineReplacement(lineRange, []);
				}
				break;
			}
		}
	}

	function isSignificant(s: string) {
		return !!s.match(/[a-zA-Z1-9]+/);
	}

	/**
	 * Checks if a line edit is additive (only adds text without removing any).
	 * An edit is additive if the original line is a subsequence of the new line,
	 * meaning all characters from the original appear in the new line in the same order.
	 *
	 * Examples:
	 * - "function fib() {" → "function fib(n: number) {" ✓ (additive)
	 * - "hello world" → "hello" ✗ (not additive, removes " world")
	 * - "abc" → "aXbYcZ" ✓ (additive)
	 */
	export function isAdditiveEdit(originalLine: string, newLine: string): boolean {
		return isSubsequence(originalLine, newLine);
	}

	/**
	 * Returns true if `subsequence` is a subsequence of `str`.
	 * A subsequence means all characters appear in `str` in the same relative order,
	 * but not necessarily consecutively.
	 */
	function isSubsequence(subsequence: string, str: string): boolean {
		if (subsequence.length === 0) {
			return true;
		}
		if (subsequence.length > str.length) {
			return false;
		}

		let subIdx = 0;
		for (let i = 0; i < str.length && subIdx < subsequence.length; i++) {
			if (str[i] === subsequence[subIdx]) {
				subIdx++;
			}
		}

		return subIdx === subsequence.length;
	}

	function checkForConvergence(
		originalLines: string[],
		cursorOriginalLinesOffset: number,
		lineToIndexes: ArrayMap<string, number>,
		state: DivergenceState & { k: 'diverged' },
		editWindowIdx: number,
		params: DiffParams,
	): undefined | {
		singleLineEdit: LineReplacement;
		convergenceEndIdx: number;
	} {
		if (state.newLines.length === 0) {
			throw illegalArgument('Cannot check for convergence without new lines');
		}

		let newLinesIdx = state.newLines.length - 1;
		let candidates = lineToIndexes.get(state.newLines[newLinesIdx]).map((idx): [number, number] => [idx, idx]);

		if (candidates.length === 0) {
			if (params.emitFastCursorLineChange === EmitFastCursorLineChange.Off ||
				editWindowIdx !== cursorOriginalLinesOffset || state.newLines.length > 1
			) {
				return;
			}

			// Check if emit is allowed based on the setting
			const originalLine = originalLines[editWindowIdx];
			const newLine = state.newLines[0];

			// When the cursor is on an empty line and the model outputs content that matches
			// (or is a prefix of) the next original line, it's likely deleting the empty line
			// rather than replacing it. Skip fast-emit to avoid line duplication.
			if (originalLine.trim() === '' && editWindowIdx + 1 < originalLines.length) {
				const nextLine = originalLines[editWindowIdx + 1];
				if (newLine === nextLine || nextLine.startsWith(newLine)) {
					return;
				}
			}

			if (!isAdditiveEdit(originalLine, newLine)) {
				return;
			}

			// we detected that line with the cursor has changed, so we immediately emit an edit for it
			const zeroBasedLineRange = [editWindowIdx, editWindowIdx + 1];
			const lineRange = new LineRange(zeroBasedLineRange[0] + 1, zeroBasedLineRange[1] + 1);
			return {
				singleLineEdit: new LineReplacement(lineRange, state.newLines),
				convergenceEndIdx: editWindowIdx + 1,
			};
		}

		// we don't have enough lines even for significant-lines convergence which's less than non-significant
		if (state.newLines.length < params.nSignificantLinesToConverge) {
			return;
		}

		let nNonSigMatches = 1;
		let nSigMatches = isSignificant(state.newLines[newLinesIdx]) ? 1 : 0;
		--newLinesIdx;

		let result: 'found_matches' | 'found_significant_matches' | undefined;
		let match: [number, number] = candidates[0];

		// if several lines are being just replaced and we found a convergence right after, we want to treat this as a significant match
		// original  |  modified
		//    a      |     a
		//    b      |     b'
		//    c      |     c'
		//    d      |     d    <-- match here should allow convergence
		//    e      |     e
		if (nNonSigMatches > 0 && (match[0] - state.startLineIdx) === state.newLines.length - 1 /* to discount for converging line */) {
			result = 'found_significant_matches';
		}

		for (; newLinesIdx >= 0; --newLinesIdx) {
			candidates = candidates.map(([convEndIdx, convIdx]): [number, number] => [convEndIdx, convIdx - 1]);
			candidates = candidates.filter(([_, currentIdx]) => currentIdx >= 0 && editWindowIdx <= currentIdx);
			candidates = candidates.filter(([_, currentIdx]) => originalLines[currentIdx] === state.newLines[newLinesIdx]);

			// count in matches for current batch
			if (candidates.length === 0) {
				break;
			} else {
				++nNonSigMatches;
				if (isSignificant(state.newLines[newLinesIdx])) {
					++nSigMatches;
				}
			}
			if (nSigMatches === params.nSignificantLinesToConverge) {
				result = 'found_significant_matches';
				match = candidates[0];
			}
			if (nNonSigMatches === params.nLinesToConverge) {
				result = 'found_matches';
				match = candidates[0];
				break;
			}
		}

		if (!result) {
			return;
		}

		const originalLinesConvIdx = match[1];
		const originalLinesConvEndIdx = match[0];
		const nLinesToConverge = originalLinesConvEndIdx - originalLinesConvIdx + 1;

		const nLinesRemoved = originalLinesConvIdx - state.startLineIdx;
		const linesInserted = state.newLines.slice(0, state.newLines.length - nLinesToConverge);
		const nLinesInserted = linesInserted.length;
		if (nLinesRemoved - nLinesInserted > 1 && nLinesInserted > 0) {
			return;
		}

		const zeroBasedLineRange: [startLineOffset: number, endLineOffset: number] = [state.startLineIdx, originalLinesConvIdx];
		const lineRange = new LineRange(zeroBasedLineRange[0] + 1, zeroBasedLineRange[1] + 1);
		const singleLineEdit = new LineReplacement(lineRange, linesInserted);
		return {
			singleLineEdit,
			convergenceEndIdx: originalLinesConvEndIdx + 1,
		};
	}
}

export class ArrayMap<K, V> {
	private map = new Map<K, V[]>();

	/**
	 * Appends a value to the array of values for the given key.
	 */
	add(key: K, value: V): void {
		const values = this.map.get(key);
		if (values) {
			values.push(value);
		} else {
			this.map.set(key, [value]);
		}
	}

	/**
	 * Gets the array of values for the given key.
	 * Returns an empty array if the key does not exist.
	 */
	get(key: K): V[] {
		return this.map.get(key) || [];
	}
}
