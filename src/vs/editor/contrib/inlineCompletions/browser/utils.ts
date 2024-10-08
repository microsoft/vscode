/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Permutation, compareBy } from '../../../../base/common/arrays.js';
import { BugIndicatingError } from '../../../../base/common/errors.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { IObservable, observableValue, ISettableObservable, autorun, transaction } from '../../../../base/common/observable.js';
import { splitLinesIncludeSeparators } from '../../../../base/common/strings.js';
import { Position } from '../../../common/core/position.js';
import { Range } from '../../../common/core/range.js';
import { SingleTextEdit, TextEdit } from '../../../common/core/textEdit.js';

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

export function addPositions(pos1: Position, pos2: Position): Position {
	return new Position(pos1.lineNumber + pos2.lineNumber - 1, pos2.lineNumber === 1 ? pos1.column + pos2.column - 1 : pos2.column);
}

export function subtractPositions(pos1: Position, pos2: Position): Position {
	return new Position(pos1.lineNumber - pos2.lineNumber + 1, pos1.lineNumber - pos2.lineNumber === 0 ? pos1.column - pos2.column + 1 : pos1.column);
}

export function substringPos(text: string, pos: Position): string {
	let subtext = '';
	const lines = splitLinesIncludeSeparators(text);
	for (let i = pos.lineNumber - 1; i < lines.length; i++) {
		subtext += lines[i].substring(i === pos.lineNumber - 1 ? pos.column - 1 : 0);
	}
	return subtext;
}

export function getEndPositionsAfterApplying(edits: readonly SingleTextEdit[]): Position[] {
	const sortPerm = Permutation.createSortPermutation(edits, compareBy(e => e.range, Range.compareRangesUsingStarts));
	const edit = new TextEdit(sortPerm.apply(edits));
	const sortedNewRanges = edit.getNewRanges();
	const newRanges = sortPerm.inverse().apply(sortedNewRanges);
	return newRanges.map(range => range.getEndPosition());
}

export function convertItemsToStableObservables<T>(items: IObservable<readonly T[]>, store: DisposableStore): IObservable<IObservable<T>[]> {
	const result = observableValue<IObservable<T>[]>('result', []);
	const innerObservables: ISettableObservable<T>[] = [];

	store.add(autorun(reader => {
		const itemsValue = items.read(reader);

		transaction(tx => {
			if (itemsValue.length !== innerObservables.length) {
				innerObservables.length = itemsValue.length;
				for (let i = 0; i < innerObservables.length; i++) {
					if (!innerObservables[i]) {
						innerObservables[i] = observableValue<T>('item', itemsValue[i]);
					}
				}
				result.set([...innerObservables], tx);
			}
			innerObservables.forEach((o, i) => o.set(itemsValue[i], tx));
		});
	}));

	return result;
}
