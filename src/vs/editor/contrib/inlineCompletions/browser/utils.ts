/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BugIndicatingError } from 'vs/base/common/errors';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { IObservable, autorunOpts } from 'vs/base/common/observable';
import { splitLines } from 'vs/base/common/strings';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ISingleEditOperation } from 'vs/editor/common/core/editOperation';
import { Position } from 'vs/editor/common/core/position';
import { IRange, Range } from 'vs/editor/common/core/range';
import { IModelDeltaDecoration } from 'vs/editor/common/model';
import { TextModel } from 'vs/editor/common/model/textModel';

export function applyEdits(text: string, edits: { range: IRange; text: string }[]): string {
	const transformer = new PositionOffsetTransformer(text);
	const offsetEdits = edits.map(e => {
		const range = Range.lift(e.range);
		return ({
			startOffset: transformer.getOffset(range.getStartPosition()),
			endOffset: transformer.getOffset(range.getEndPosition()),
			text: e.text
		});
	});

	offsetEdits.sort((a, b) => b.startOffset - a.startOffset);

	for (const edit of offsetEdits) {
		text = text.substring(0, edit.startOffset) + edit.text + text.substring(edit.endOffset);
	}

	return text;
}

class PositionOffsetTransformer {
	private readonly lineStartOffsetByLineIdx: number[];

	constructor(text: string) {
		this.lineStartOffsetByLineIdx = [];
		this.lineStartOffsetByLineIdx.push(0);
		for (let i = 0; i < text.length; i++) {
			if (text.charAt(i) === '\n') {
				this.lineStartOffsetByLineIdx.push(i + 1);
			}
		}
	}

	getOffset(position: Position): number {
		return this.lineStartOffsetByLineIdx[position.lineNumber - 1] + position.column - 1;
	}
}

const array: ReadonlyArray<any> = [];
export function getReadonlyEmptyArray<T>(): readonly T[] {
	return array;
}

export class ColumnRange {
	constructor(
		public readonly startColumn: number,
		public readonly endColumnExclusive: number,
	) {
		if (startColumn > endColumnExclusive) {
			throw new BugIndicatingError(`startColumn ${startColumn} cannot be after endColumnExclusive ${endColumnExclusive}`);
		}
	}

	toRange(lineNumber: number): Range {
		return new Range(lineNumber, this.startColumn, lineNumber, this.endColumnExclusive);
	}

	equals(other: ColumnRange): boolean {
		return this.startColumn === other.startColumn
			&& this.endColumnExclusive === other.endColumnExclusive;
	}
}

export function applyObservableDecorations(editor: ICodeEditor, decorations: IObservable<IModelDeltaDecoration[]>): IDisposable {
	const d = new DisposableStore();
	const decorationsCollection = editor.createDecorationsCollection();
	d.add(autorunOpts({ debugName: () => `Apply decorations from ${decorations.debugName}` }, reader => {
		const d = decorations.read(reader);
		decorationsCollection.set(d);
	}));
	d.add({
		dispose: () => {
			decorationsCollection.clear();
		}
	});
	return d;
}

export function addPositions(pos1: Position, pos2: Position): Position {
	return new Position(pos1.lineNumber + pos2.lineNumber - 1, pos2.lineNumber === 1 ? pos1.column + pos2.column - 1 : pos2.column);
}

export function lengthOfText(text: string): Position {
	let line = 1;
	let column = 1;
	for (const c of text) {
		if (c === '\n') {
			line++;
			column = 1;
		} else {
			column++;
		}
	}
	return new Position(line, column);
}

/**
 * Given some text edits, this function finds the new ranges of the editted text post application of all edits.
 * Assumes that the edit ranges are disjoint and they are sorted in the order of the ranges
 * @param edits edits applied
 * @returns new ranges post edits for every edit
 */
export function getNewRanges(edits: ISingleEditOperation[]): Range[] {

	if (edits.length === 0) {
		return [];
	}
	// Check if the edits ranges are sorted and disjoint
	for (let i = 1; i < edits.length; i++) {
		if (Position.isBeforeOrEqual(
			Range.lift(edits[i].range).getStartPosition(),
			Range.lift(edits[i - 1].range).getEndPosition())
		) {
			throw new Error('Edits are not sorted and disjoint.');
		}
	}

	const ranges: Range[] = [];
	let previousEditEndLineNumber = 0;
	let lineOffset = 0;
	let columnOffset = 0;

	for (const edit of edits) {
		const text = edit.text ?? '';
		const rangeStart = Position.lift({
			lineNumber: edit.range.startLineNumber + lineOffset,
			column: edit.range.startColumn + (edit.range.startLineNumber === previousEditEndLineNumber ? columnOffset : 0)
		});
		const rangeEnd = addPositions(
			rangeStart,
			lengthOfText(text)
		);
		ranges.push(Range.fromPositions(rangeStart, rangeEnd));
		const splitText = splitLines(text);
		lineOffset += splitText.length - edit.range.endLineNumber + edit.range.startLineNumber - 1;
		columnOffset = rangeEnd.column - edit.range.endColumn;
		previousEditEndLineNumber = edit.range.endLineNumber;
	}
	return ranges;
}

/**
 * Given a text model and edits, this function finds the inverse text edits
 * @param model model on which to apply the edits
 * @param edits edits applied
 * @returns inverse edits
 */
export function inverseEdits(model: TextModel, edits: ISingleEditOperation[]): ISingleEditOperation[] {
	const sortPerm = Permutation.createSortPermutation(edits, (edit1, edit2) => Range.compareRangesUsingStarts(edit1.range, edit2.range));
	const sortedRanges = getNewRanges(sortPerm.apply(edits));
	const ranges = sortPerm.inverse().apply(sortedRanges);
	const inverseEdits: ISingleEditOperation[] = [];
	for (let i = 0; i < edits.length; i++) {
		inverseEdits.push({ range: ranges[i], text: model.getValueInRange(edits[i].range) });
	}
	return inverseEdits;
}

/**
 * Utility class which can be used to find the sort permutation of an array
 */
export class Permutation {

	constructor(public readonly indexMap: number[]) { }

	public static createSortPermutation<T>(arr: readonly T[], compareFn: (a: T, b: T) => number): Permutation {
		const sortIndices = Array.from(arr.keys()).sort((index1, index2) => compareFn(arr[index1], arr[index2]));
		return new Permutation(sortIndices);
	}

	apply<T>(arr: T[]): T[] {
		return arr.map((_, index) => arr[this.indexMap[index]]);
	}

	inverse(): Permutation {
		const inverseSortIndices = Array.from(this.indexMap.keys()).sort((index1, index2) => index1 - index2);
		return new Permutation(inverseSortIndices);
	}
}
