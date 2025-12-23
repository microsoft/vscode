/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Permutation, compareBy } from '../../../../base/common/arrays.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable, observableValue, ISettableObservable, autorun, transaction, IReader } from '../../../../base/common/observable.js';
import { ContextKeyValue, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { bindContextKey } from '../../../../platform/observable/common/platformObservableUtils.js';
import { Position } from '../../../common/core/position.js';
import { PositionOffsetTransformer } from '../../../common/core/text/positionToOffset.js';
import { Range } from '../../../common/core/range.js';
import { TextReplacement, TextEdit } from '../../../common/core/edits/textEdit.js';
import { getPositionOffsetTransformerFromTextModel } from '../../../common/core/text/getPositionOffsetTransformerFromTextModel.js';
import { ITextModel } from '../../../common/model.js';

const array: ReadonlyArray<any> = [];
export function getReadonlyEmptyArray<T>(): readonly T[] {
	return array;
}

export function addPositions(pos1: Position, pos2: Position): Position {
	return new Position(pos1.lineNumber + pos2.lineNumber - 1, pos2.lineNumber === 1 ? pos1.column + pos2.column - 1 : pos2.column);
}

export function subtractPositions(pos1: Position, pos2: Position): Position {
	return new Position(pos1.lineNumber - pos2.lineNumber + 1, pos1.lineNumber - pos2.lineNumber === 0 ? pos1.column - pos2.column + 1 : pos1.column);
}

export function substringPos(text: string, pos: Position): string {
	const transformer = new PositionOffsetTransformer(text);
	const offset = transformer.getOffset(pos);
	return text.substring(offset);
}

export function getEndPositionsAfterApplying(edits: readonly TextReplacement[]): Position[] {
	const newRanges = getModifiedRangesAfterApplying(edits);
	return newRanges.map(range => range.getEndPosition());
}

export function getModifiedRangesAfterApplying(edits: readonly TextReplacement[]): Range[] {
	const sortPerm = Permutation.createSortPermutation(edits, compareBy(e => e.range, Range.compareRangesUsingStarts));
	const edit = new TextEdit(sortPerm.apply(edits));
	const sortedNewRanges = edit.getNewRanges();
	return sortPerm.inverse().apply(sortedNewRanges);
}

export function removeTextReplacementCommonSuffixPrefix(edits: readonly TextReplacement[], textModel: ITextModel): TextReplacement[] {
	const transformer = getPositionOffsetTransformerFromTextModel(textModel);
	const text = textModel.getValue();
	const stringReplacements = edits.map(edit => transformer.getStringReplacement(edit));
	const minimalStringReplacements = stringReplacements.map(replacement => replacement.removeCommonSuffixPrefix(text));
	return minimalStringReplacements.map(replacement => transformer.getTextReplacement(replacement));
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

export class ObservableContextKeyService {
	constructor(
		private readonly _contextKeyService: IContextKeyService,
	) {
	}

	bind<T extends ContextKeyValue>(key: RawContextKey<T>, obs: IObservable<T>): IDisposable;
	bind<T extends ContextKeyValue>(key: RawContextKey<T>, fn: (reader: IReader) => T): IDisposable;
	bind<T extends ContextKeyValue>(key: RawContextKey<T>, obs: IObservable<T> | ((reader: IReader) => T)): IDisposable {
		return bindContextKey(key, this._contextKeyService, obs instanceof Function ? obs : reader => obs.read(reader));
	}
}

export function wait(ms: number, cancellationToken?: CancellationToken): Promise<void> {
	return new Promise(resolve => {
		let d: IDisposable | undefined = undefined;
		const handle = setTimeout(() => {
			if (d) { d.dispose(); }
			resolve();
		}, ms);
		if (cancellationToken) {
			d = cancellationToken.onCancellationRequested(() => {
				clearTimeout(handle);
				if (d) { d.dispose(); }
				resolve();
			});
		}
	});
}

export class ErrorResult<T = void> {
	public static message(message: string): ErrorResult {
		return new ErrorResult(undefined, message);
	}

	constructor(public readonly error: T, public readonly message: string | undefined = undefined) { }

	public static is<TOther>(obj: TOther | ErrorResult): obj is ErrorResult {
		return obj instanceof ErrorResult;
	}

	public logError(): void {
		if (this.message) {
			console.error(`ErrorResult: ${this.message}`, this.error);
		} else {
			console.error(`ErrorResult: An unexpected error-case occurred, usually caused by invalid input.`, this.error);
		}
	}
}
