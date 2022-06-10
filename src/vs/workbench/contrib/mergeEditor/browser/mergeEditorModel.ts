/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { compareBy, CompareResult, equals } from 'vs/base/common/arrays';
import { BugIndicatingError } from 'vs/base/common/errors';
import { ITextModel } from 'vs/editor/common/model';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorker';
import { EditorModel } from 'vs/workbench/common/editor/editorModel';
import { autorunHandleChanges, derivedObservable, derivedObservableWithCache, IObservable, ITransaction, keepAlive, ObservableValue, transaction, waitForState } from 'vs/workbench/contrib/audioCues/browser/observable';
import { LineDiff, LineEdit, LineRange, ModifiedBaseRange, ModifiedBaseRangeState } from 'vs/workbench/contrib/mergeEditor/browser/model';
import { EditorWorkerServiceDiffComputer, TextModelDiffChangeReason, TextModelDiffs, TextModelDiffState } from 'vs/workbench/contrib/mergeEditor/browser/textModelDiffs';
import { leftJoin } from 'vs/workbench/contrib/mergeEditor/browser/utils';

export const enum MergeEditorModelState {
	initializing = 1,
	upToDate = 2,
	updating = 3,
}

export class MergeEditorModel extends EditorModel {
	private readonly diffComputer = new EditorWorkerServiceDiffComputer(this.editorWorkerService);
	private readonly input1TextModelDiffs = new TextModelDiffs(this.base, this.input1, this.diffComputer);
	private readonly input2TextModelDiffs = new TextModelDiffs(this.base, this.input2, this.diffComputer);
	private readonly resultTextModelDiffs = new TextModelDiffs(this.base, this.result, this.diffComputer);

	public readonly state = derivedObservable('state', reader => {
		const states = [
			this.input1TextModelDiffs,
			this.input2TextModelDiffs,
			this.resultTextModelDiffs,
		].map((s) => s.state.read(reader));

		if (states.some((s) => s === TextModelDiffState.initializing)) {
			return MergeEditorModelState.initializing;
		}
		if (states.some((s) => s === TextModelDiffState.updating)) {
			return MergeEditorModelState.updating;
		}
		return MergeEditorModelState.upToDate;
	});

	public readonly isUpToDate = derivedObservable('isUpdating', reader => this.state.read(reader) === MergeEditorModelState.upToDate);

	public readonly onInitialized = waitForState(this.state, state => state === MergeEditorModelState.upToDate);

	public readonly modifiedBaseRanges = derivedObservableWithCache<ModifiedBaseRange[]>('modifiedBaseRanges', (reader, lastValue) => {
		if (this.state.read(reader) !== MergeEditorModelState.upToDate) {
			return lastValue || [];
		}

		const input1Diffs = this.input1TextModelDiffs.diffs.read(reader);
		const input2Diffs = this.input2TextModelDiffs.diffs.read(reader);

		return ModifiedBaseRange.fromDiffs(this.base, this.input1, input1Diffs, this.input2, input2Diffs);
	});

	public readonly input1LinesDiffs = this.input1TextModelDiffs.diffs;
	public readonly input2LinesDiffs = this.input2TextModelDiffs.diffs;
	public readonly resultDiffs = this.resultTextModelDiffs.diffs;

	private readonly modifiedBaseRangeStateStores =
		derivedObservable('modifiedBaseRangeStateStores', reader => {
			const map = new Map(
				this.modifiedBaseRanges.read(reader).map(s => ([s, new ObservableValue(ModifiedBaseRangeState.default, 'State')]))
			);
			return map;
		});

	constructor(
		readonly base: ITextModel,
		readonly input1: ITextModel,
		readonly input1Detail: string | undefined,
		readonly input1Description: string | undefined,
		readonly input2: ITextModel,
		readonly input2Detail: string | undefined,
		readonly input2Description: string | undefined,
		readonly result: ITextModel,
		@IEditorWorkerService private readonly editorWorkerService: IEditorWorkerService
	) {
		super();

		this._register(keepAlive(this.modifiedBaseRangeStateStores));

		this._register(
			autorunHandleChanges(
				'Recompute State',
				{
					handleChange: (ctx) =>
						ctx.didChange(this.resultTextModelDiffs.diffs)
							// Ignore non-text changes as we update the state directly
							? ctx.change === TextModelDiffChangeReason.textChange
							: true,
				},
				(reader) => {
					if (!this.isUpToDate.read(reader)) {
						return;
					}
					const resultDiffs = this.resultTextModelDiffs.diffs.read(reader);
					const stores = this.modifiedBaseRangeStateStores.read(reader);
					this.recomputeState(resultDiffs, stores);
				}
			)
		);

		this.onInitialized.then(() => {
			this.resetUnknown();
		});
	}

	private recomputeState(resultDiffs: LineDiff[], stores: Map<ModifiedBaseRange, ObservableValue<ModifiedBaseRangeState>>): void {
		transaction(tx => {
			const baseRangeWithStoreAndTouchingDiffs = leftJoin(
				stores,
				resultDiffs,
				(baseRange, diff) =>
					baseRange[0].baseRange.touches(diff.originalRange)
						? CompareResult.neitherLessOrGreaterThan
						: LineRange.compareByStart(
							baseRange[0].baseRange,
							diff.originalRange
						)
			);

			for (const row of baseRangeWithStoreAndTouchingDiffs) {
				row.left[1].set(computeState(row.left[0], row.rights), tx);
			}
		});
	}

	public resetUnknown(): void {
		transaction(tx => {
			for (const range of this.modifiedBaseRanges.get()) {
				if (this.getState(range).get().conflicting) {
					this.setState(range, ModifiedBaseRangeState.default, tx);
				}
			}
		});
	}

	public mergeNonConflictingDiffs(): void {
		transaction((tx) => {
			for (const m of this.modifiedBaseRanges.get()) {
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

	public getState(baseRange: ModifiedBaseRange): IObservable<ModifiedBaseRangeState> {
		const existingState = this.modifiedBaseRangeStateStores.get().get(baseRange);
		if (!existingState) {
			throw new BugIndicatingError('object must be from this instance');
		}
		return existingState;
	}

	public setState(
		baseRange: ModifiedBaseRange,
		state: ModifiedBaseRangeState,
		transaction: ITransaction
	): void {
		if (!this.isUpToDate.get()) {
			throw new BugIndicatingError('Cannot set state while updating');
		}

		const existingState = this.modifiedBaseRangeStateStores.get().get(baseRange);
		if (!existingState) {
			throw new BugIndicatingError('object must be from this instance');
		}

		const conflictingDiffs = this.resultTextModelDiffs.findTouchingDiffs(
			baseRange.baseRange
		);
		if (conflictingDiffs) {
			this.resultTextModelDiffs.removeDiffs(conflictingDiffs, transaction);
		}

		const { edit, effectiveState } = getEditForBase(baseRange, state);

		existingState.set(effectiveState, transaction);

		if (edit) {
			this.resultTextModelDiffs.applyEditRelativeToOriginal(edit, transaction);
		}
	}
}

function getEditForBase(baseRange: ModifiedBaseRange, state: ModifiedBaseRangeState): { edit: LineEdit | undefined; effectiveState: ModifiedBaseRangeState } {
	interface LineDiffWithInputNumber {
		diff: LineDiff;
		inputNumber: 1 | 2;
	}

	const diffs = new Array<LineDiffWithInputNumber>();
	if (state.input1) {
		if (baseRange.input1CombinedDiff) {
			diffs.push({ diff: baseRange.input1CombinedDiff, inputNumber: 1 });
		}
	}
	if (state.input2) {
		if (baseRange.input2CombinedDiff) {
			diffs.push({ diff: baseRange.input2CombinedDiff, inputNumber: 2 });
		}
	}
	if (state.input2First) {
		diffs.reverse();
	}
	const firstDiff: LineDiffWithInputNumber | undefined = diffs[0];
	const secondDiff: LineDiffWithInputNumber | undefined = diffs[1];
	diffs.sort(compareBy(d => d.diff.originalRange, LineRange.compareByStart));

	if (!firstDiff) {
		return { edit: undefined, effectiveState: ModifiedBaseRangeState.default };
	}

	if (!secondDiff) {
		return { edit: firstDiff.diff.getLineEdit(), effectiveState: ModifiedBaseRangeState.default.withInputValue(firstDiff.inputNumber, true) };
	}

	// Two inserts
	if (
		firstDiff.diff.originalRange.lineCount === 0 &&
		firstDiff.diff.originalRange.equals(secondDiff.diff.originalRange)
	) {
		return {
			edit: new LineEdit(
				firstDiff.diff.originalRange,
				firstDiff.diff
					.getLineEdit()
					.newLines.concat(secondDiff.diff.getLineEdit().newLines)
			),
			effectiveState: state,
		};
	}

	// Technically non-conflicting diffs
	if (diffs.length === 2 && diffs[0].diff.originalRange.endLineNumberExclusive === diffs[1].diff.originalRange.startLineNumber) {
		return {
			edit: new LineEdit(
				LineRange.join(diffs.map(d => d.diff.originalRange))!,
				diffs.flatMap(d => d.diff.getLineEdit().newLines)
			),
			effectiveState: state,
		};
	}

	return {
		edit: secondDiff.diff.getLineEdit(),
		effectiveState: ModifiedBaseRangeState.default.withInputValue(
			secondDiff.inputNumber,
			true
		),
	};
}

function computeState(baseRange: ModifiedBaseRange, conflictingDiffs: LineDiff[]): ModifiedBaseRangeState {
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
