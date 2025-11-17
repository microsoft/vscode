/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { compareBy, numberComparator } from '../../../../../base/common/arrays.js';
import { BugIndicatingError } from '../../../../../base/common/errors.js';
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { DetailedLineRangeMapping } from './mapping.js';
import { LineRangeEdit } from './editing.js';
import { MergeEditorLineRange } from './lineRange.js';
import { ReentrancyBarrier } from '../../../../../base/common/controlFlow.js';
import { IMergeDiffComputer } from './diffComputer.js';
import { autorun, IObservableWithChange, IReader, ITransaction, observableSignal, observableValue, transaction } from '../../../../../base/common/observable.js';
import { UndoRedoGroup } from '../../../../../platform/undoRedo/common/undoRedo.js';

export class TextModelDiffs extends Disposable {
	private _recomputeCount = 0;
	private readonly _state = observableValue<TextModelDiffState, TextModelDiffChangeReason>(this, TextModelDiffState.initializing);
	private readonly _diffs = observableValue<DetailedLineRangeMapping[], TextModelDiffChangeReason>(this, []);

	private readonly _barrier = new ReentrancyBarrier();
	private _isDisposed = false;

	public get isApplyingChange() {
		return this._barrier.isOccupied;
	}

	constructor(
		private readonly baseTextModel: ITextModel,
		private readonly textModel: ITextModel,
		private readonly diffComputer: IMergeDiffComputer,
	) {
		super();

		const recomputeSignal = observableSignal('recompute');

		this._register(autorun(reader => {
			/** @description Update diff state */
			recomputeSignal.read(reader);
			this._recompute(reader);
		}));

		this._register(
			baseTextModel.onDidChangeContent(
				this._barrier.makeExclusiveOrSkip(() => {
					recomputeSignal.trigger(undefined);
				})
			)
		);
		this._register(
			textModel.onDidChangeContent(
				this._barrier.makeExclusiveOrSkip(() => {
					recomputeSignal.trigger(undefined);
				})
			)
		);
		this._register(toDisposable(() => {
			this._isDisposed = true;
		}));
	}

	public get state(): IObservableWithChange<TextModelDiffState, TextModelDiffChangeReason> {
		return this._state;
	}

	/**
	 * Diffs from base to input.
	*/
	public get diffs(): IObservableWithChange<DetailedLineRangeMapping[], TextModelDiffChangeReason> {
		return this._diffs;
	}

	private _isInitializing = true;

	private _recompute(reader: IReader): void {
		this._recomputeCount++;
		const currentRecomputeIdx = this._recomputeCount;

		if (this._state.get() === TextModelDiffState.initializing) {
			this._isInitializing = true;
		}

		transaction(tx => {
			/** @description Starting Diff Computation. */
			this._state.set(
				this._isInitializing ? TextModelDiffState.initializing : TextModelDiffState.updating,
				tx,
				TextModelDiffChangeReason.other
			);
		});

		const result = this.diffComputer.computeDiff(this.baseTextModel, this.textModel, reader);

		result.then((result) => {
			if (this._isDisposed) {
				return;
			}

			if (currentRecomputeIdx !== this._recomputeCount) {
				// There is a newer recompute call
				return;
			}

			transaction(tx => {
				/** @description Completed Diff Computation */
				if (result.diffs) {
					this._state.set(TextModelDiffState.upToDate, tx, TextModelDiffChangeReason.textChange);
					this._diffs.set(result.diffs, tx, TextModelDiffChangeReason.textChange);
				} else {
					this._state.set(TextModelDiffState.error, tx, TextModelDiffChangeReason.textChange);
				}
				this._isInitializing = false;
			});
		});
	}

	private ensureUpToDate(): void {
		if (this.state.get() !== TextModelDiffState.upToDate) {
			throw new BugIndicatingError('Cannot remove diffs when the model is not up to date');
		}
	}

	public removeDiffs(diffToRemoves: DetailedLineRangeMapping[], transaction: ITransaction | undefined, group?: UndoRedoGroup): void {
		this.ensureUpToDate();

		diffToRemoves.sort(compareBy((d) => d.inputRange.startLineNumber, numberComparator));
		diffToRemoves.reverse();

		let diffs = this._diffs.get();

		for (const diffToRemove of diffToRemoves) {
			// TODO improve performance
			const len = diffs.length;
			diffs = diffs.filter((d) => d !== diffToRemove);
			if (len === diffs.length) {
				throw new BugIndicatingError();
			}

			this._barrier.runExclusivelyOrThrow(() => {
				const edits = diffToRemove.getReverseLineEdit().toEdits(this.textModel.getLineCount());
				this.textModel.pushEditOperations(null, edits, () => null, group);
			});

			diffs = diffs.map((d) =>
				d.outputRange.isAfter(diffToRemove.outputRange)
					? d.addOutputLineDelta(diffToRemove.inputRange.length - diffToRemove.outputRange.length)
					: d
			);
		}

		this._diffs.set(diffs, transaction, TextModelDiffChangeReason.other);
	}

	/**
	 * Edit must be conflict free.
	 */
	public applyEditRelativeToOriginal(edit: LineRangeEdit, transaction: ITransaction | undefined, group?: UndoRedoGroup): void {
		this.ensureUpToDate();

		const editMapping = new DetailedLineRangeMapping(
			edit.range,
			this.baseTextModel,
			MergeEditorLineRange.fromLength(edit.range.startLineNumber, edit.newLines.length),
			this.textModel
		);

		let firstAfter = false;
		let delta = 0;
		const newDiffs = new Array<DetailedLineRangeMapping>();
		for (const diff of this.diffs.get()) {
			if (diff.inputRange.intersectsOrTouches(edit.range)) {
				throw new BugIndicatingError('Edit must be conflict free.');
			} else if (diff.inputRange.isAfter(edit.range)) {
				if (!firstAfter) {
					firstAfter = true;
					newDiffs.push(editMapping.addOutputLineDelta(delta));
				}

				newDiffs.push(diff.addOutputLineDelta(edit.newLines.length - edit.range.length));
			} else {
				newDiffs.push(diff);
			}

			if (!firstAfter) {
				delta += diff.outputRange.length - diff.inputRange.length;
			}
		}

		if (!firstAfter) {
			firstAfter = true;
			newDiffs.push(editMapping.addOutputLineDelta(delta));
		}

		this._barrier.runExclusivelyOrThrow(() => {
			const edits = new LineRangeEdit(edit.range.delta(delta), edit.newLines).toEdits(this.textModel.getLineCount());
			this.textModel.pushEditOperations(null, edits, () => null, group);
		});
		this._diffs.set(newDiffs, transaction, TextModelDiffChangeReason.other);
	}

	public findTouchingDiffs(baseRange: MergeEditorLineRange): DetailedLineRangeMapping[] {
		return this.diffs.get().filter(d => d.inputRange.intersectsOrTouches(baseRange));
	}

	private getResultLine(lineNumber: number, reader?: IReader): number | DetailedLineRangeMapping {
		let offset = 0;
		const diffs = reader ? this.diffs.read(reader) : this.diffs.get();
		for (const diff of diffs) {
			if (diff.inputRange.contains(lineNumber) || diff.inputRange.endLineNumberExclusive === lineNumber) {
				return diff;
			} else if (diff.inputRange.endLineNumberExclusive < lineNumber) {
				offset = diff.resultingDeltaFromOriginalToModified;
			} else {
				break;
			}
		}
		return lineNumber + offset;
	}

	public getResultLineRange(baseRange: MergeEditorLineRange, reader?: IReader): MergeEditorLineRange {
		let start = this.getResultLine(baseRange.startLineNumber, reader);
		if (typeof start !== 'number') {
			start = start.outputRange.startLineNumber;
		}
		let endExclusive = this.getResultLine(baseRange.endLineNumberExclusive, reader);
		if (typeof endExclusive !== 'number') {
			endExclusive = endExclusive.outputRange.endLineNumberExclusive;
		}

		return MergeEditorLineRange.fromLineNumbers(start, endExclusive);
	}
}

export const enum TextModelDiffChangeReason {
	other = 0,
	textChange = 1,
}

export const enum TextModelDiffState {
	initializing = 1,
	upToDate = 2,
	updating = 3,
	error = 4,
}

export interface ITextModelDiffsState {
	state: TextModelDiffState;
	diffs: DetailedLineRangeMapping[];
}
