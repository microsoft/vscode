/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BugIndicatingError } from 'vs/base/common/errors';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { IObservable, autorunOpts } from 'vs/base/common/observable';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { IModelDeltaDecoration } from 'vs/editor/common/model';

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

export function subtractPositions(pos1: Position, pos2: Position): Position {
	return new Position(pos1.lineNumber - pos2.lineNumber + 1, pos1.lineNumber - pos2.lineNumber === 0 ? pos1.column - pos2.column + 1 : pos1.column);
}
