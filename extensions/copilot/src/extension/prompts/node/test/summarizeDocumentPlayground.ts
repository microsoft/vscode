/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OverlayNode } from '../../../../platform/parser/node/nodes';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { autorun, derived, IObservable, observableFromPromise, observableValue, transaction } from '../../../../util/vs/base/common/observable';
import { isDefined } from '../../../../util/vs/base/common/types';
import { Range } from '../../../../vscodeTypes';
import { IProjectedDocumentDebugInfo } from '../inline/summarizedDocument/implementation';

export class SummarizeDocumentPlayground {
	private readonly _text = observableValue<string>(this, '');
	private readonly _range = observableValue<Range>(this, new Range(0, 0, 0, 0));
	private readonly _charLimit = observableValue<number>(this, 10);

	private readonly _initialResult = observableValue<IProjectedDocumentDebugInfo | undefined>(this, undefined);

	constructor(
		result: IProjectedDocumentDebugInfo,
		initialRange: Range,
		initialCharLimit: number,
		private readonly _getUpdatedStructure: (text: string) => Promise<OverlayNode | undefined>,
		private readonly _getUpdatedResult: (text: string, charLimit: number, selection: Range, structure: OverlayNode) => IProjectedDocumentDebugInfo,

	) {
		transaction(tx => {
			this._initialResult.set(result, tx);
			this._text.set(result.originalText, tx);
			this._range.set(initialRange, tx);
			this._charLimit.set(initialCharLimit, tx);
		});
	}

	get inputDocument(): ITextRangeDoc {
		return {
			...{ $fileExtension: 'textRange.w' },
			text: this._text.get(),
			range: {
				start: { lineNumber: this._range.get().start.line + 1, column: this._range.get().start.character + 1 },
				end: { lineNumber: this._range.get().end.line + 1, column: this._range.get().end.character + 1 },
			}
		};
	}

	set inputDocument(value: ITextRangeDoc) {
		transaction(tx => {
			this._initialResult.set(undefined, tx);
			this._text.set(value.text, tx);
			this._range.set(new Range(value.range.start.lineNumber - 1, value.range.start.column - 1, value.range.end.lineNumber - 1, value.range.end.column - 1), tx);
		});
	}

	get inputOptions(): IJsonUiDoc<{ charLimit: number }> {
		return {
			...{ $fileExtension: 'jsonUi.w' },
			value: { charLimit: this._charLimit.get() },
			'schema': {
				'title': 'data',
				'type': 'object',
				'properties': {
					'charLimit': {
						'type': 'number',
						'format': 'range',
						'default': 500,
						'minimum': 0,
						'maximum': 10000,
						'step': 1
					}
				}
			},
		};
	}

	set inputOptions(value: IJsonUiDoc<{ charLimit: number }>) {
		transaction(tx => {
			this._initialResult.set(undefined, tx);
			this._charLimit.set(value.value.charLimit, tx);
		});
	}

	private readonly _structure = derived(this, reader => {
		return observableFromPromise(this._getUpdatedStructure(this._text.read(reader)));
	});

	private readonly _store = new DisposableStore();

	private readonly _result = derived(this, reader => {
		const r = this._initialResult.read(reader);
		if (r) { return r; }

		const structure = this._structure.read(reader).read(reader).value;
		if (!structure) { return undefined; }
		return this._getUpdatedResult(this._text.read(reader), this._charLimit.read(reader), this._range.read(reader), structure);
	}).keepObserved(this._store);

	getAst() {
		return waitForStateOrReturn(this._result.map(r => !r ? undefined : r.getVisualization?.()), isDefined);
	}

	getSummarizedText() {
		return waitForStateOrReturn(this._result.map(r => !r ? undefined : r.text), isDefined);
	}
}

/**
 * If the value is ready, returns the value directly (without a promise).
 * If the value is not ready, returns a promise of the value.
 *
 * This allows consumers to use the value synchronously if it is already available.
*/
export function waitForStateOrReturn<T, TState extends T>(observable: IObservable<T>, predicate: (state: T) => state is TState): Promise<TState> | TState;
export function waitForStateOrReturn<T>(observable: IObservable<T>, predicate: (state: T) => boolean): Promise<T> | T;
export function waitForStateOrReturn<T>(observable: IObservable<T>, predicate: (state: T) => boolean): Promise<T> | T {
	let result: T | undefined;
	let didRunImmediately = false;

	const p = new Promise<T>(resolve => {
		let shouldDispose = false;
		const stateObs = observable.map(state => ({ isFinished: predicate(state), state }));
		let didRun = false;
		const d = autorun(reader => {
			/** @description waitForState */
			const { isFinished, state } = stateObs.read(reader);
			if (isFinished) {
				if (!didRun) {
					shouldDispose = true;
				} else {
					d.dispose();
				}
				result = state;
				didRunImmediately = true;
				resolve(state);
			}
		});
		didRun = true;
		if (shouldDispose) {
			d.dispose();
		}
	});

	if (didRunImmediately) {
		return result!;
	} else {
		return p;
	}
}

interface IJsonUiDoc<T = unknown> {
	value: T;
	schema: unknown;
}

interface ITextRangeDoc {
	text: string;
	range: { start: IPosition; end: IPosition };
}

interface IPosition {
	lineNumber: number;
	column: number;
}
