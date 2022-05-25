/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { compareBy, CompareResult, equals, numberComparator } from 'vs/base/common/arrays';
import { BugIndicatingError } from 'vs/base/common/errors';
import { ITextModel } from 'vs/editor/common/model';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorker';
import { EditorModel } from 'vs/workbench/common/editor/editorModel';
import { IObservable, ITransaction, ObservableValue, transaction } from 'vs/workbench/contrib/audioCues/browser/observable';
import { ModifiedBaseRange, LineEdit, LineDiff, ModifiedBaseRangeState, LineRange } from 'vs/workbench/contrib/mergeEditor/browser/model';
import { leftJoin, ReentrancyBarrier } from 'vs/workbench/contrib/mergeEditor/browser/utils';

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
		const baseToResultDiffPromise = this._editorWorkerService.computeDiff(
			base.uri,
			result.uri,
			false,
			1000
		);

		const [baseToInput1Diff, baseToInput2Diff, baseToResultDiff] = await Promise.all([
			baseToInput1DiffPromise,
			baseToInput2DiffPromise,
			baseToResultDiffPromise
		]);

		const changesInput1 =
			baseToInput1Diff?.changes.map((c) =>
				LineDiff.fromLineChange(c, base, input1)
			) || [];
		const changesInput2 =
			baseToInput2Diff?.changes.map((c) =>
				LineDiff.fromLineChange(c, base, input2)
			) || [];
		const changesResult =
			baseToResultDiff?.changes.map((c) =>
				LineDiff.fromLineChange(c, base, result)
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
			changesResult,
			this._editorWorkerService,
		);
	}
}

const InternalSymbol: unique symbol = null!;

export class MergeEditorModel extends EditorModel {
	private resultEdits: ResultEdits;

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
		public readonly input1LinesDiffs: readonly LineDiff[],
		public readonly input2LinesDiffs: readonly LineDiff[],
		resultDiffs: LineDiff[],
		private readonly editorWorkerService: IEditorWorkerService
	) {
		super();

		this.resultEdits = new ResultEdits(resultDiffs, this.base, this.result, this.editorWorkerService);
		this.resultEdits.onDidChange(() => {
			this.recomputeState();
		});
		this.recomputeState();
	}

	private recomputeState(): void {
		transaction(tx => {
			const baseRangeWithStoreAndTouchingDiffs = leftJoin(
				this.modifiedBaseRangeStateStores,
				this.resultEdits.diffs.get(),
				(baseRange, diff) =>
					baseRange[0].baseRange.touches(diff.originalRange)
						? CompareResult.neitherLessOrGreaterThan
						: LineRange.compareByStart(
							baseRange[0].baseRange,
							diff.originalRange
						)
			);

			for (const row of baseRangeWithStoreAndTouchingDiffs) {
				row.left[1].set(this.computeState(row.left[0], row.rights), tx);
			}
		});
	}

	public mergeNonConflictingDiffs(): void {
		transaction((tx) => {
			for (const m of this.modifiedBaseRanges) {
				if (m.isConflicting) {
					continue;
				}
				this.setState(
					m,
					m.input1Diffs.length > 0
						? ModifiedBaseRangeState.default.withInput1(true)
						: ModifiedBaseRangeState.default.withInput2(true),
					tx
				);
			}
		});
	}

	public get resultDiffs(): IObservable<readonly LineDiff[]> {
		return this.resultEdits.diffs;
	}

	public readonly modifiedBaseRanges = ModifiedBaseRange.fromDiffs(
		this.base,
		this.input1,
		this.input1LinesDiffs,
		this.input2,
		this.input2LinesDiffs
	);

	private readonly modifiedBaseRangeStateStores: ReadonlyMap<ModifiedBaseRange, ObservableValue<ModifiedBaseRangeState>> = new Map(
		this.modifiedBaseRanges.map(s => ([s, new ObservableValue(ModifiedBaseRangeState.default, 'State')]))
	);

	private computeState(baseRange: ModifiedBaseRange, conflictingDiffs?: LineDiff[]): ModifiedBaseRangeState {
		if (!conflictingDiffs) {
			conflictingDiffs = this.resultEdits.findTouchingDiffs(
				baseRange.baseRange
			);
		}

		if (conflictingDiffs.length === 0) {
			return ModifiedBaseRangeState.default;
		}
		const conflictingEdits = conflictingDiffs.map((d) => d.getLineEdit());

		function editsAgreeWithDiffs(diffs: readonly LineDiff[]): boolean {
			return equals(
				conflictingEdits,
				diffs.map((d) => d.getLineEdit()),
				(a, b) => a.equals(b)
			);
		}

		if (editsAgreeWithDiffs(baseRange.input1Diffs)) {
			return ModifiedBaseRangeState.default.withInput1(true);
		}
		if (editsAgreeWithDiffs(baseRange.input2Diffs)) {
			return ModifiedBaseRangeState.default.withInput2(true);
		}

		return ModifiedBaseRangeState.conflicting;
	}

	public getState(baseRange: ModifiedBaseRange): IObservable<ModifiedBaseRangeState> {
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

		const conflictingDiffs = this.resultEdits.findTouchingDiffs(
			baseRange.baseRange
		);
		if (conflictingDiffs) {
			this.resultEdits.removeDiffs(conflictingDiffs, transaction);
		}

		const diff = state.input1
			? baseRange.input1CombinedDiff
			: state.input2
				? baseRange.input2CombinedDiff
				: undefined;
		if (diff) {
			this.resultEdits.applyEditRelativeToOriginal(diff.getLineEdit(), transaction);
		}
	}

	public getResultRange(baseRange: LineRange): LineRange {
		return this.resultEdits.getResultRange(baseRange);
	}
}

class ResultEdits {
	private readonly barrier = new ReentrancyBarrier();
	private readonly onDidChangeEmitter = new Emitter();
	public readonly onDidChange = this.onDidChangeEmitter.event;

	constructor(
		diffs: LineDiff[],
		private readonly baseTextModel: ITextModel,
		private readonly resultTextModel: ITextModel,
		private readonly _editorWorkerService: IEditorWorkerService
	) {
		diffs.sort(compareBy((d) => d.originalRange.startLineNumber, numberComparator));
		this._diffs.set(diffs, undefined);

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
					this._diffs.set(diffs, undefined);

					this.onDidChangeEmitter.fire(undefined);
				});
			});
		});
	}

	private readonly _diffs = new ObservableValue<LineDiff[]>([], 'diffs');

	public readonly diffs: IObservable<readonly LineDiff[]> = this._diffs;

	public removeDiffs(diffToRemoves: LineDiff[], transaction: ITransaction | undefined): void {
		diffToRemoves.sort(compareBy((d) => d.originalRange.startLineNumber, numberComparator));
		diffToRemoves.reverse();

		let diffs = this._diffs.get();

		for (const diffToRemove of diffToRemoves) {
			// TODO improve performance
			const len = diffs.length;
			diffs = diffs.filter((d) => d !== diffToRemove);
			if (len === diffs.length) {
				throw new BugIndicatingError();
			}

			this.barrier.runExclusivelyOrThrow(() => {
				diffToRemove.getReverseLineEdit().apply(this.resultTextModel);
			});

			diffs = diffs.map((d) =>
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

		this._diffs.set(diffs, transaction);
	}

	/**
	 * Edit must be conflict free.
	 */
	public applyEditRelativeToOriginal(edit: LineEdit, transaction: ITransaction | undefined): void {
		let firstAfter = false;
		let delta = 0;
		const newDiffs = new Array<LineDiff>();
		for (const diff of this._diffs.get()) {
			if (diff.originalRange.touches(edit.range)) {
				throw new BugIndicatingError('Edit must be conflict free.');
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
		this._diffs.set(newDiffs, transaction);

		this.barrier.runExclusivelyOrThrow(() => {
			new LineEdit(edit.range.delta(delta), edit.newLines).apply(this.resultTextModel);
		});
	}

	public findTouchingDiffs(baseRange: LineRange): LineDiff[] {
		return this.diffs.get().filter(d => d.originalRange.touches(baseRange));
	}

	public getResultRange(baseRange: LineRange): LineRange {
		let startOffset = 0;
		let lengthOffset = 0;
		for (const diff of this.diffs.get()) {
			if (diff.originalRange.endLineNumberExclusive <= baseRange.startLineNumber) {
				startOffset += diff.resultingDeltaFromOriginalToModified;
			} else if (diff.originalRange.startLineNumber <= baseRange.endLineNumberExclusive) {
				lengthOffset += diff.resultingDeltaFromOriginalToModified;
			} else {
				break;
			}
		}

		return new LineRange(baseRange.startLineNumber + startOffset, baseRange.lineCount + lengthOffset);
	}
}
