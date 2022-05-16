/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { compareBy, numberComparator } from 'vs/base/common/arrays';
import { BugIndicatingError } from 'vs/base/common/errors';
import { ITextModel } from 'vs/editor/common/model';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorker';
import { EditorModel } from 'vs/workbench/common/editor/editorModel';
import { IObservable, ITransaction, ObservableValue, transaction } from 'vs/workbench/contrib/audioCues/browser/observable';
import { ModifiedBaseRange, LineEdit, LineDiff, ModifiedBaseRangeState, LineRange, ReentrancyBarrier } from 'vs/workbench/contrib/mergeEditor/browser/model';

export class MergeEditorModelFactory {
	constructor(
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService
	) {
	}

	public async create(
		base: ITextModel,
		input1: ITextModel,
		input1Detail: string | undefined,
		input1Description: string | undefined,
		input2: ITextModel,
		input2Detail: string | undefined,
		input2Description: string | undefined,
		result: ITextModel,
	): Promise<MergeEditorModel> {

		const baseToInput1DiffPromise = this._editorWorkerService.computeDiff(
			base.uri,
			input1.uri,
			false,
			1000
		);
		const baseToInput2DiffPromise = this._editorWorkerService.computeDiff(
			base.uri,
			input2.uri,
			false,
			1000
		);

		const [baseToInput1Diff, baseToInput2Diff] = await Promise.all([
			baseToInput1DiffPromise,
			baseToInput2DiffPromise,
		]);

		const changesInput1 =
			baseToInput1Diff?.changes.map((c) =>
				LineDiff.fromLineChange(c, base, input1)
			) || [];
		const changesInput2 =
			baseToInput2Diff?.changes.map((c) =>
				LineDiff.fromLineChange(c, base, input2)
			) || [];

		return new MergeEditorModel(
			InternalSymbol,
			base,
			input1,
			input1Detail,
			input1Description,
			input2,
			input2Detail,
			input2Description,
			result,
			changesInput1,
			changesInput2,
			this._editorWorkerService
		);
	}
}

const InternalSymbol: unique symbol = null!;

export class MergeEditorModel extends EditorModel {
	private resultEdits = new ResultEdits([], this.base, this.result, this.editorWorkerService);

	constructor(
		_symbol: typeof InternalSymbol,
		readonly base: ITextModel,
		readonly input1: ITextModel,
		readonly input1Detail: string | undefined,
		readonly input1Description: string | undefined,
		readonly input2: ITextModel,
		readonly input2Detail: string | undefined,
		readonly input2Description: string | undefined,
		readonly result: ITextModel,
		private readonly inputOneLinesDiffs: readonly LineDiff[],
		private readonly inputTwoLinesDiffs: readonly LineDiff[],
		private readonly editorWorkerService: IEditorWorkerService
	) {
		super();

		result.setValue(base.getValue());

		this.resultEdits.onDidChange(() => {
			transaction(tx => {
				for (const [key, value] of this.modifiedBaseRangeStateStores) {
					value.set(this.computeState(key), tx);
				}
			});
		});

		/*
		// Apply all non-conflicts diffs
		const lineEditsArr: LineEdit[] = [];
		for (const diff of this.mergeableDiffs) {
			if (!diff.isConflicting) {
				for (const d of diff.inputOneDiffs) {
					lineEditsArr.push(d.getLineEdit());
				}
				for (const d of diff.inputTwoDiffs) {
					lineEditsArr.push(d.getLineEdit());
				}
			}
		}
		new LineEdits(lineEditsArr).apply(result);
		*/
	}

	public get resultDiffs(): readonly LineDiff[] {
		return this.resultEdits.diffs;
	}

	public readonly modifiedBaseRanges = ModifiedBaseRange.fromDiffs(
		this.base,
		this.input1,
		this.inputOneLinesDiffs,
		this.input2,
		this.inputTwoLinesDiffs
	);

	private readonly modifiedBaseRangeStateStores = new Map<ModifiedBaseRange, ObservableValue<ModifiedBaseRangeState | undefined>>(
		this.modifiedBaseRanges.map(s => ([s, new ObservableValue(new ModifiedBaseRangeState(false, false, false), 'State')]))
	);

	private computeState(baseRange: ModifiedBaseRange): ModifiedBaseRangeState | undefined {
		const existingDiff = this.resultEdits.findConflictingDiffs(
			baseRange.baseRange
		);
		if (!existingDiff) {
			return new ModifiedBaseRangeState(false, false, false);
		}

		const input1Edit = baseRange.getInput1LineEdit();
		if (input1Edit && existingDiff.getLineEdit().equals(input1Edit)) {
			return new ModifiedBaseRangeState(true, false, false);
		}

		const input2Edit = baseRange.getInput2LineEdit();
		if (input2Edit && existingDiff.getLineEdit().equals(input2Edit)) {
			return new ModifiedBaseRangeState(false, true, false);
		}

		return undefined;
	}

	public getState(baseRange: ModifiedBaseRange): IObservable<ModifiedBaseRangeState | undefined> {
		const existingState = this.modifiedBaseRangeStateStores.get(baseRange);
		if (!existingState) {
			throw new BugIndicatingError('object must be from this instance');
		}
		return existingState;
	}

	public setState(
		baseRange: ModifiedBaseRange,
		state: ModifiedBaseRangeState,
		transaction: ITransaction | undefined
	): void {
		const existingState = this.modifiedBaseRangeStateStores.get(baseRange);
		if (!existingState) {
			throw new BugIndicatingError('object must be from this instance');
		}
		existingState.set(state, transaction);

		const existingDiff = this.resultEdits.findConflictingDiffs(
			baseRange.baseRange
		);
		if (existingDiff) {
			this.resultEdits.removeDiff(existingDiff);
		}

		const edit = state.input1
			? baseRange.getInput1LineEdit()
			: state.input2
				? baseRange.getInput2LineEdit()
				: undefined;
		if (edit) {
			this.resultEdits.applyEditRelativeToOriginal(edit);
		}
	}
}

class ResultEdits {
	private readonly barrier = new ReentrancyBarrier();
	private readonly onDidChangeEmitter = new Emitter();
	public readonly onDidChange = this.onDidChangeEmitter.event;

	constructor(
		private _diffs: LineDiff[],
		private readonly baseTextModel: ITextModel,
		private readonly resultTextModel: ITextModel,
		private readonly _editorWorkerService: IEditorWorkerService
	) {
		this._diffs.sort(compareBy((d) => d.originalRange.startLineNumber, numberComparator));

		resultTextModel.onDidChangeContent(e => {
			this.barrier.runExclusively(() => {
				this._editorWorkerService.computeDiff(
					baseTextModel.uri,
					resultTextModel.uri,
					false,
					1000
				).then(e => {
					const diffs =
						e?.changes.map((c) =>
							LineDiff.fromLineChange(c, baseTextModel, resultTextModel)
						) || [];
					this._diffs = diffs;

					this.onDidChangeEmitter.fire(undefined);
				});
			});
		});
	}

	public get diffs(): readonly LineDiff[] {
		return this._diffs;
	}

	public removeDiff(diffToRemove: LineDiff): void {
		const len = this._diffs.length;
		this._diffs = this._diffs.filter((d) => d !== diffToRemove);
		if (len === this._diffs.length) {
			throw new BugIndicatingError();
		}

		this.barrier.runExclusivelyOrThrow(() => {
			diffToRemove.getReverseLineEdit().apply(this.resultTextModel);
		});

		this._diffs = this._diffs.map((d) =>
			d.modifiedRange.isAfter(diffToRemove.modifiedRange)
				? new LineDiff(
					d.originalTextModel,
					d.originalRange,
					d.modifiedTextModel,
					d.modifiedRange.delta(
						diffToRemove.originalRange.lineCount - diffToRemove.modifiedRange.lineCount
					)
				)
				: d
		);
	}

	/**
	 * Edit must be conflict free.
	 */
	public applyEditRelativeToOriginal(edit: LineEdit): void {
		let firstAfter = false;
		let delta = 0;
		const newDiffs = new Array<LineDiff>();
		for (let i = 0; i < this._diffs.length; i++) {
			const diff = this._diffs[i];

			if (diff.originalRange.touches(edit.range)) {
				throw new BugIndicatingError();
			} else if (diff.originalRange.isAfter(edit.range)) {
				if (!firstAfter) {
					firstAfter = true;

					newDiffs.push(new LineDiff(
						this.baseTextModel,
						edit.range,
						this.resultTextModel,
						new LineRange(edit.range.startLineNumber + delta, edit.newLines.length)
					));
				}

				newDiffs.push(new LineDiff(
					diff.originalTextModel,
					diff.originalRange,
					diff.modifiedTextModel,
					diff.modifiedRange.delta(edit.newLines.length - edit.range.lineCount)
				));
			} else {
				newDiffs.push(diff);
			}

			if (!firstAfter) {
				delta += diff.modifiedRange.lineCount - diff.originalRange.lineCount;
			}
		}

		if (!firstAfter) {
			firstAfter = true;

			newDiffs.push(new LineDiff(
				this.baseTextModel,
				edit.range,
				this.resultTextModel,
				new LineRange(edit.range.startLineNumber + delta, edit.newLines.length)
			));
		}
		this._diffs = newDiffs;

		this.barrier.runExclusivelyOrThrow(() => {
			new LineEdit(edit.range.delta(delta), edit.newLines).apply(this.resultTextModel);
		});
	}

	// TODO return many!
	public findConflictingDiffs(rangeInOriginalTextModel: LineRange): LineDiff | undefined {
		// TODO binary search
		return this.diffs.find(d => d.originalRange.touches(rangeInOriginalTextModel));
	}
}
