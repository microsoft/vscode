/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { compareBy, CompareResult, tieBreakComparators, equals, numberComparator } from 'vs/base/common/arrays';
import { BugIndicatingError } from 'vs/base/common/errors';
import { splitLines } from 'vs/base/common/strings';
import { Constants } from 'vs/base/common/uint';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { ITextModel } from 'vs/editor/common/model';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorker';
import { EditorModel } from 'vs/workbench/common/editor/editorModel';
import { autorunHandleChanges, derivedObservable, IObservable, IReader, ITransaction, keepAlive, ObservableValue, transaction, waitForState } from 'vs/workbench/contrib/audioCues/browser/observable';
import { EditorWorkerServiceDiffComputer } from 'vs/workbench/contrib/mergeEditor/browser/model/diffComputer';
import { DetailedLineRangeMapping, DocumentMapping, LineRangeMapping } from 'vs/workbench/contrib/mergeEditor/browser/model/mapping';
import { LineRangeEdit, RangeEdit } from 'vs/workbench/contrib/mergeEditor/browser/model/editing';
import { LineRange } from 'vs/workbench/contrib/mergeEditor/browser/model/lineRange';
import { TextModelDiffChangeReason, TextModelDiffs, TextModelDiffState } from 'vs/workbench/contrib/mergeEditor/browser/model/textModelDiffs';
import { concatArrays, leftJoin, elementAtOrUndefined } from 'vs/workbench/contrib/mergeEditor/browser/utils';
import { ModifiedBaseRange, ModifiedBaseRangeState } from './modifiedBaseRange';

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

	public readonly modifiedBaseRanges = derivedObservable<ModifiedBaseRange[]>('modifiedBaseRanges', (reader) => {
		const input1Diffs = this.input1TextModelDiffs.diffs.read(reader);
		const input2Diffs = this.input2TextModelDiffs.diffs.read(reader);

		return ModifiedBaseRange.fromDiffs(input1Diffs, input2Diffs, this.base, this.input1, this.input2);
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

	private readonly modifiedBaseRangeHandlingStateStores =
		derivedObservable('modifiedBaseRangeHandlingStateStores', reader => {
			const map = new Map(
				this.modifiedBaseRanges.read(reader).map(s => ([s, new ObservableValue(false, 'State')]))
			);
			return map;
		});

	public readonly unhandledConflictsCount = derivedObservable('unhandledConflictsCount', reader => {
		const map = this.modifiedBaseRangeHandlingStateStores.read(reader);
		let handledCount = 0;
		for (const [_key, value] of map) {
			handledCount += value.read(reader) ? 1 : 0;
		}
		return map.size - handledCount;
	});

	public readonly input1ResultMapping = derivedObservable('input1ResultMapping', reader => {
		const resultDiffs = this.resultDiffs.read(reader);
		const modifiedBaseRanges = DocumentMapping.betweenOutputs(this.input1LinesDiffs.read(reader), resultDiffs, this.input1.getLineCount());

		return new DocumentMapping(
			modifiedBaseRanges.lineRangeMappings.map((m) =>
				m.inputRange.isEmpty || m.outputRange.isEmpty
					? new LineRangeMapping(
						m.inputRange.deltaStart(-1),
						m.outputRange.deltaStart(-1)
					)
					: m
			),
			modifiedBaseRanges.inputLineCount
		);
	});

	public readonly input2ResultMapping = derivedObservable('input2ResultMapping', reader => {
		const resultDiffs = this.resultDiffs.read(reader);
		const modifiedBaseRanges = DocumentMapping.betweenOutputs(this.input2LinesDiffs.read(reader), resultDiffs, this.input2.getLineCount());

		return new DocumentMapping(
			modifiedBaseRanges.lineRangeMappings.map((m) =>
				m.inputRange.isEmpty || m.outputRange.isEmpty
					? new LineRangeMapping(
						m.inputRange.deltaStart(-1),
						m.outputRange.deltaStart(-1)
					)
					: m
			),
			modifiedBaseRanges.inputLineCount
		);
	});

	constructor(
		readonly base: ITextModel,
		readonly input1: ITextModel,
		readonly input1Title: string | undefined,
		readonly input1Detail: string | undefined,
		readonly input1Description: string | undefined,
		readonly input2: ITextModel,
		readonly input2Title: string | undefined,
		readonly input2Detail: string | undefined,
		readonly input2Description: string | undefined,
		readonly result: ITextModel,
		@IEditorWorkerService private readonly editorWorkerService: IEditorWorkerService
	) {
		super();

		this._register(keepAlive(this.modifiedBaseRangeStateStores));
		this._register(keepAlive(this.modifiedBaseRangeHandlingStateStores));
		this._register(keepAlive(this.input1ResultMapping));
		this._register(keepAlive(this.input2ResultMapping));

		let shouldResetHandlingState = true;
		this._register(
			autorunHandleChanges(
				'Recompute State',
				{
					handleChange: (ctx) => {
						if (ctx.didChange(this.modifiedBaseRangeHandlingStateStores)) {
							shouldResetHandlingState = true;
						}
						return ctx.didChange(this.resultTextModelDiffs.diffs)
							// Ignore non-text changes as we update the state directly
							? ctx.change === TextModelDiffChangeReason.textChange
							: true;
					},
				},
				(reader) => {
					const modifiedBaseRangeHandlingStateStores = this.modifiedBaseRangeHandlingStateStores.read(reader);
					if (!this.isUpToDate.read(reader)) {
						return;
					}
					const resultDiffs = this.resultTextModelDiffs.diffs.read(reader);
					const stores = this.modifiedBaseRangeStateStores.read(reader);
					transaction(tx => {
						this.recomputeState(resultDiffs, stores, tx);
						if (shouldResetHandlingState) {
							shouldResetHandlingState = false;
							for (const [range, store] of stores) {
								const state = store.get();
								modifiedBaseRangeHandlingStateStores.get(range)
									?.set(!(state.isEmpty || state.conflicting), tx);
							}
						}
					});
				}
			)
		);

		this.onInitialized.then(() => {
			this.resetUnknown();
		});
	}

	public getRangeInResult(baseRange: LineRange, reader?: IReader): LineRange {
		return this.resultTextModelDiffs.getResultRange(baseRange, reader);
	}

	private recomputeState(resultDiffs: DetailedLineRangeMapping[], stores: Map<ModifiedBaseRange, ObservableValue<ModifiedBaseRangeState>>, tx: ITransaction): void {
		const baseRangeWithStoreAndTouchingDiffs = leftJoin(
			stores,
			resultDiffs,
			(baseRange, diff) =>
				baseRange[0].baseRange.touches(diff.inputRange)
					? CompareResult.neitherLessOrGreaterThan
					: LineRange.compareByStart(
						baseRange[0].baseRange,
						diff.inputRange
					)
		);

		for (const row of baseRangeWithStoreAndTouchingDiffs) {
			row.left[1].set(this.computeState(row.left[0], row.rights), tx);

		}
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

		this.modifiedBaseRangeHandlingStateStores
			.get()
			.get(baseRange)!
			.set(true, transaction);
	}

	private computeState(baseRange: ModifiedBaseRange, conflictingDiffs: DetailedLineRangeMapping[]): ModifiedBaseRangeState {
		if (conflictingDiffs.length === 0) {
			return ModifiedBaseRangeState.default;
		}
		const conflictingEdits = conflictingDiffs.map((d) => d.getLineEdit());

		function editsAgreeWithDiffs(diffs: readonly DetailedLineRangeMapping[]): boolean {
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

		const states = [
			ModifiedBaseRangeState.default.withInput1(true).withInput2(true),
			ModifiedBaseRangeState.default.withInput2(true).withInput1(true),
		];

		for (const s of states) {
			const { edit } = getEditForBase(baseRange, s);
			if (edit) {
				const resultRange = this.resultTextModelDiffs.getResultRange(baseRange.baseRange);
				const existingLines = resultRange.getLines(this.result);

				if (equals(edit.newLines, existingLines, (a, b) => a === b)) {
					return s;
				}
			}
		}

		return ModifiedBaseRangeState.conflicting;
	}

	public isHandled(baseRange: ModifiedBaseRange): IObservable<boolean> {
		return this.modifiedBaseRangeHandlingStateStores.get().get(baseRange)!;
	}
}

function getEditForBase(baseRange: ModifiedBaseRange, state: ModifiedBaseRangeState): { edit: LineRangeEdit | undefined; effectiveState: ModifiedBaseRangeState } {
	const diffs = concatArrays(
		state.input1 && baseRange.input1CombinedDiff ? [{ diff: baseRange.input1CombinedDiff, inputNumber: 1 as const }] : [],
		state.input2 && baseRange.input2CombinedDiff ? [{ diff: baseRange.input2CombinedDiff, inputNumber: 2 as const }] : [],
	);

	if (state.input2First) {
		diffs.reverse();
	}

	const firstDiff = elementAtOrUndefined(diffs, 0);
	const secondDiff = elementAtOrUndefined(diffs, 1);

	if (!firstDiff) {
		return { edit: undefined, effectiveState: ModifiedBaseRangeState.default };
	}
	if (!secondDiff) {
		return { edit: firstDiff.diff.getLineEdit(), effectiveState: ModifiedBaseRangeState.default.withInputValue(firstDiff.inputNumber, true) };
	}

	const result = combineInputs(baseRange, state.input2First ? 2 : 1);
	if (result) {
		return { edit: result, effectiveState: state };
	}

	return {
		edit: secondDiff.diff.getLineEdit(),
		effectiveState: ModifiedBaseRangeState.default.withInputValue(
			secondDiff.inputNumber,
			true
		),
	};
}

function combineInputs(baseRange: ModifiedBaseRange, firstInput: 1 | 2): LineRangeEdit | undefined {
	const combinedDiffs = concatArrays(
		baseRange.input1Diffs.flatMap((diffs) =>
			diffs.rangeMappings.map((diff) => ({ diff, input: 1 as const }))
		),
		baseRange.input2Diffs.flatMap((diffs) =>
			diffs.rangeMappings.map((diff) => ({ diff, input: 2 as const }))
		)
	).sort(
		tieBreakComparators(
			compareBy((d) => d.diff.inputRange, Range.compareRangesUsingStarts),
			compareBy((d) => (d.input === firstInput ? 1 : 2), numberComparator)
		)
	);

	const sortedEdits = combinedDiffs.map(d => {
		const sourceTextModel = d.input === 1 ? baseRange.input1TextModel : baseRange.input2TextModel;
		return new RangeEdit(d.diff.inputRange, sourceTextModel.getValueInRange(d.diff.outputRange));
	});

	return editsToLineRangeEdit(baseRange.baseRange, sortedEdits, baseRange.baseTextModel);
}

function editsToLineRangeEdit(range: LineRange, sortedEdits: RangeEdit[], textModel: ITextModel): LineRangeEdit | undefined {
	let text = '';
	const startsLineBefore = range.startLineNumber > 1;
	let currentPosition = startsLineBefore
		? new Position(
			range.startLineNumber - 1,
			Constants.MAX_SAFE_SMALL_INTEGER
		)
		: new Position(range.startLineNumber, 1);

	for (const edit of sortedEdits) {
		const diffStart = edit.range.getStartPosition();
		if (!currentPosition.isBeforeOrEqual(diffStart)) {
			return undefined;
		}
		const originalText = textModel.getValueInRange(Range.fromPositions(currentPosition, diffStart));
		text += originalText;
		text += edit.newText;
		currentPosition = edit.range.getEndPosition();
	}

	const endsLineAfter = range.endLineNumberExclusive <= textModel.getLineCount();
	const end = endsLineAfter ? new Position(
		range.endLineNumberExclusive,
		1
	) : new Position(range.endLineNumberExclusive - 1, Constants.MAX_SAFE_SMALL_INTEGER);

	const originalText = textModel.getValueInRange(
		Range.fromPositions(currentPosition, end)
	);
	text += originalText;

	const lines = splitLines(text);
	if (startsLineBefore) {
		lines.shift();
	}
	if (endsLineAfter) {
		lines.pop();
	}
	return new LineRangeEdit(range, lines);
}
