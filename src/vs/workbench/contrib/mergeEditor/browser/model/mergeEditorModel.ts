/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CompareResult, equals } from 'vs/base/common/arrays';
import { BugIndicatingError } from 'vs/base/common/errors';
import { autorunHandleChanges, derived, IObservable, IReader, ISettableObservable, ITransaction, keepAlive, observableValue, transaction, waitForState } from 'vs/base/common/observable';
import { Range } from 'vs/editor/common/core/range';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/model';
import { EditorModel } from 'vs/workbench/common/editor/editorModel';
import { IMergeDiffComputer } from 'vs/workbench/contrib/mergeEditor/browser/model/diffComputer';
import { LineRange } from 'vs/workbench/contrib/mergeEditor/browser/model/lineRange';
import { DetailedLineRangeMapping, DocumentLineRangeMap, DocumentRangeMap, LineRangeMapping } from 'vs/workbench/contrib/mergeEditor/browser/model/mapping';
import { TextModelDiffChangeReason, TextModelDiffs, TextModelDiffState } from 'vs/workbench/contrib/mergeEditor/browser/model/textModelDiffs';
import { leftJoin } from 'vs/workbench/contrib/mergeEditor/browser/utils';
import { ModifiedBaseRange, ModifiedBaseRangeState } from './modifiedBaseRange';

export interface InputData {
	readonly textModel: ITextModel;
	readonly title: string | undefined;
	readonly detail: string | undefined;
	readonly description: string | undefined;
}

export class MergeEditorModel extends EditorModel {
	private readonly input1TextModelDiffs = this._register(new TextModelDiffs(this.base, this.input1.textModel, this.diffComputer));
	private readonly input2TextModelDiffs = this._register(new TextModelDiffs(this.base, this.input2.textModel, this.diffComputer));
	private readonly resultTextModelDiffs = this._register(new TextModelDiffs(this.base, this.resultTextModel, this.diffComputerConflictProjection));
	public readonly modifiedBaseRanges = derived<ModifiedBaseRange[]>('modifiedBaseRanges', (reader) => {
		const input1Diffs = this.input1TextModelDiffs.diffs.read(reader);
		const input2Diffs = this.input2TextModelDiffs.diffs.read(reader);
		return ModifiedBaseRange.fromDiffs(input1Diffs, input2Diffs, this.base, this.input1.textModel, this.input2.textModel);
	});

	private readonly modifiedBaseRangeResultStates =
		derived('modifiedBaseRangeResultStates', reader => {
			const map = new Map<ModifiedBaseRange, ModifiedBaseRangeData>(
				this.modifiedBaseRanges.read(reader).map((s) => [
					s,
					{
						accepted: observableValue(`BaseRangeState${s.baseRange}`, ModifiedBaseRangeState.default),
						handled: observableValue(`BaseRangeHandledState${s.baseRange}`, false),
					}
				])
			);
			return map;
		});

	private readonly resultSnapshot = this.resultTextModel.createSnapshot();

	constructor(
		readonly base: ITextModel,
		readonly input1: InputData,
		readonly input2: InputData,
		readonly resultTextModel: ITextModel,
		private readonly diffComputer: IMergeDiffComputer,
		private readonly diffComputerConflictProjection: IMergeDiffComputer,
		options: { resetUnknownOnInitialization: boolean },
		@IModelService private readonly modelService: IModelService,
		@ILanguageService private readonly languageService: ILanguageService
	) {
		super();

		this._register(keepAlive(this.modifiedBaseRangeResultStates));
		this._register(keepAlive(this.input1ResultMapping));
		this._register(keepAlive(this.input2ResultMapping));

		let shouldRecomputeHandledFromAccepted = true;
		this._register(
			autorunHandleChanges(
				'Merge Editor Model: Recompute State From Result',
				{
					handleChange: (ctx) => {
						if (ctx.didChange(this.modifiedBaseRangeResultStates)) {
							shouldRecomputeHandledFromAccepted = true;
						}
						return ctx.didChange(this.resultTextModelDiffs.diffs)
							// Ignore non-text changes as we update the state directly
							? ctx.change === TextModelDiffChangeReason.textChange
							: true;
					},
				},
				(reader) => {
					const states = this.modifiedBaseRangeResultStates.read(reader);
					if (!this.isUpToDate.read(reader)) {
						return;
					}
					const resultDiffs = this.resultTextModelDiffs.diffs.read(reader);
					transaction(tx => {
						/** @description Merge Editor Model: Recompute State */

						this.updateBaseRangeAcceptedState(resultDiffs, states, tx);

						if (shouldRecomputeHandledFromAccepted) {
							shouldRecomputeHandledFromAccepted = false;
							for (const [_range, observableState] of states) {
								const state = observableState.accepted.get();
								observableState.handled.set(!(state.isEmpty || state.conflicting), tx);
							}
						}
					});
				}
			)
		);

		if (options.resetUnknownOnInitialization) {
			this.onInitialized = this.onInitialized.then(() => {
				this.resetDirtyConflictsToBase();
			});
		}
	}

	public hasBaseRange(baseRange: ModifiedBaseRange): boolean {
		return this.modifiedBaseRangeResultStates.get().has(baseRange);
	}

	public readonly baseInput1Diffs = this.input1TextModelDiffs.diffs;

	public readonly baseInput2Diffs = this.input2TextModelDiffs.diffs;
	public readonly baseResultDiffs = this.resultTextModelDiffs.diffs;
	public readonly input1ResultMapping = derived('input1ResultMapping', reader => {
		return this.getInputResultMapping(
			this.baseInput1Diffs.read(reader),
			this.baseResultDiffs.read(reader),
			this.input1.textModel.getLineCount(),
		);
	});

	public readonly resultInput1Mapping = derived('resultInput1Mapping', reader => this.input1ResultMapping.read(reader).reverse());

	public readonly input2ResultMapping = derived('input2ResultMapping', reader => {
		return this.getInputResultMapping(
			this.baseInput2Diffs.read(reader),
			this.baseResultDiffs.read(reader),
			this.input2.textModel.getLineCount(),
		);
	});

	public readonly resultInput2Mapping = derived('resultInput2Mapping', reader => this.input2ResultMapping.read(reader).reverse());

	private getInputResultMapping(inputLinesDiffs: DetailedLineRangeMapping[], resultDiffs: DetailedLineRangeMapping[], inputLineCount: number) {
		const map = DocumentLineRangeMap.betweenOutputs(inputLinesDiffs, resultDiffs, inputLineCount);
		return new DocumentLineRangeMap(
			map.lineRangeMappings.map((m) =>
				m.inputRange.isEmpty || m.outputRange.isEmpty
					? new LineRangeMapping(
						// We can do this because two adjacent diffs have one line in between.
						m.inputRange.deltaStart(-1),
						m.outputRange.deltaStart(-1)
					)
					: m
			),
			map.inputLineCount
		);
	}

	public readonly baseResultMapping = derived('baseResultMapping', reader => {
		const map = new DocumentLineRangeMap(this.baseResultDiffs.read(reader), -1);
		return new DocumentLineRangeMap(
			map.lineRangeMappings.map((m) =>
				m.inputRange.isEmpty || m.outputRange.isEmpty
					? new LineRangeMapping(
						// We can do this because two adjacent diffs have one line in between.
						m.inputRange.deltaStart(-1),
						m.outputRange.deltaStart(-1)
					)
					: m
			),
			map.inputLineCount
		);
	});

	public readonly resultBaseMapping = derived('resultBaseMapping', reader => this.baseResultMapping.read(reader).reverse());

	public translateInputRangeToBase(input: 1 | 2, range: Range): Range {
		const baseInputDiffs = input === 1 ? this.baseInput1Diffs.get() : this.baseInput2Diffs.get();
		const map = new DocumentRangeMap(baseInputDiffs.flatMap(d => d.rangeMappings), 0).reverse();
		return map.projectRange(range).outputRange;
	}

	public translateBaseRangeToInput(input: 1 | 2, range: Range): Range {
		const baseInputDiffs = input === 1 ? this.baseInput1Diffs.get() : this.baseInput2Diffs.get();
		const map = new DocumentRangeMap(baseInputDiffs.flatMap(d => d.rangeMappings), 0);
		return map.projectRange(range).outputRange;
	}

	public getLineRangeInResult(baseRange: LineRange, reader?: IReader): LineRange {
		return this.resultTextModelDiffs.getResultLineRange(baseRange, reader);
	}

	public translateResultRangeToBase(range: Range): Range {
		const map = new DocumentRangeMap(this.baseResultDiffs.get().flatMap(d => d.rangeMappings), 0).reverse();
		return map.projectRange(range).outputRange;
	}

	public translateBaseRangeToResult(range: Range): Range {
		const map = new DocumentRangeMap(this.baseResultDiffs.get().flatMap(d => d.rangeMappings), 0);
		return map.projectRange(range).outputRange;
	}

	public findModifiedBaseRangesInRange(rangeInBase: LineRange): ModifiedBaseRange[] {
		// TODO use binary search
		return this.modifiedBaseRanges.get().filter(r => r.baseRange.intersects(rangeInBase));
	}

	public readonly diffComputingState = derived('diffComputingState', reader => {
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

	public readonly isUpToDate = derived('isUpToDate', reader => this.diffComputingState.read(reader) === MergeEditorModelState.upToDate);

	public readonly onInitialized = waitForState(this.diffComputingState, state => state === MergeEditorModelState.upToDate).then(() => { });

	private updateBaseRangeAcceptedState(resultDiffs: DetailedLineRangeMapping[], states: Map<ModifiedBaseRange, ModifiedBaseRangeData>, tx: ITransaction): void {
		const baseRangeWithStoreAndTouchingDiffs = leftJoin(
			states,
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
			const newState = this.computeState(row.left[0], row.rights);
			if (!row.left[1].accepted.get().equals(newState)) {
				row.left[1].accepted.set(newState, tx);
			}
		}
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
			const { edit } = baseRange.getEditForBase(s);
			if (edit) {
				const resultRange = this.resultTextModelDiffs.getResultLineRange(baseRange.baseRange);
				const existingLines = resultRange.getLines(this.resultTextModel);

				if (equals(edit.newLines, existingLines, (a, b) => a === b)) {
					return s;
				}
			}
		}

		return ModifiedBaseRangeState.conflicting;
	}

	public getState(baseRange: ModifiedBaseRange): IObservable<ModifiedBaseRangeState> {
		const existingState = this.modifiedBaseRangeResultStates.get().get(baseRange);
		if (!existingState) {
			throw new BugIndicatingError('object must be from this instance');
		}
		return existingState.accepted;
	}

	public setState(
		baseRange: ModifiedBaseRange,
		state: ModifiedBaseRangeState,
		markHandled: boolean,
		transaction: ITransaction,
		pushStackElement: boolean = false
	): void {
		if (!this.isUpToDate.get()) {
			throw new BugIndicatingError('Cannot set state while updating');
		}

		const existingState = this.modifiedBaseRangeResultStates.get().get(baseRange);
		if (!existingState) {
			throw new BugIndicatingError('object must be from this instance');
		}

		const conflictingDiffs = this.resultTextModelDiffs.findTouchingDiffs(
			baseRange.baseRange
		);
		if (conflictingDiffs) {
			this.resultTextModelDiffs.removeDiffs(conflictingDiffs, transaction);
		}

		const { edit, effectiveState } = baseRange.getEditForBase(state);

		existingState.accepted.set(effectiveState, transaction);

		if (edit) {
			if (pushStackElement) {
				this.resultTextModel.pushStackElement();
			}
			this.resultTextModelDiffs.applyEditRelativeToOriginal(edit, transaction);
			if (pushStackElement) {
				this.resultTextModel.pushStackElement();
			}
		}

		if (markHandled) {
			existingState.handled.set(true, transaction);
		}
	}

	public resetDirtyConflictsToBase(): void {
		transaction(tx => {
			/** @description Reset Unknown Base Range States */
			this.resultTextModel.pushStackElement();
			for (const range of this.modifiedBaseRanges.get()) {
				if (this.getState(range).get().conflicting) {
					this.setState(range, ModifiedBaseRangeState.default, false, tx, false);
				}
			}
			this.resultTextModel.pushStackElement();
		});
	}

	public acceptNonConflictingDiffs(): void {
		transaction((tx) => {
			/** @description Merge None Conflicting Diffs */
			this.resultTextModel.pushStackElement();
			for (const m of this.modifiedBaseRanges.get()) {
				if (m.isConflicting) {
					continue;
				}
				this.setState(
					m,
					m.input1Diffs.length > 0
						? ModifiedBaseRangeState.default.withInput1(true)
						: ModifiedBaseRangeState.default.withInput2(true),
					true,
					tx,
					false
				);
			}
			this.resultTextModel.pushStackElement();
		});
	}

	public async resetResultToBaseAndAutoMerge() {
		this.resultTextModel.setValue(this.base.getValue());
		await waitForState(this.diffComputingState, state => state === MergeEditorModelState.upToDate);
		this.acceptNonConflictingDiffs();
	}

	public isHandled(baseRange: ModifiedBaseRange): IObservable<boolean> {
		return this.modifiedBaseRangeResultStates.get().get(baseRange)!.handled;
	}

	public setHandled(baseRange: ModifiedBaseRange, handled: boolean, tx: ITransaction): void {
		this.modifiedBaseRangeResultStates.get().get(baseRange)!.handled.set(handled, tx);
	}

	public readonly unhandledConflictsCount = derived('unhandledConflictsCount', reader => {
		const map = this.modifiedBaseRangeResultStates.read(reader);
		let unhandledCount = 0;
		for (const [_key, value] of map) {
			if (!value.handled.read(reader)) {
				unhandledCount++;
			}
		}
		return unhandledCount;
	});

	public readonly hasUnhandledConflicts = this.unhandledConflictsCount.map(value => /** @description hasUnhandledConflicts */ value > 0);

	public setLanguageId(languageId: string, source?: string): void {
		const language = this.languageService.createById(languageId);
		this.modelService.setMode(this.base, language, source);
		this.modelService.setMode(this.input1.textModel, language, source);
		this.modelService.setMode(this.input2.textModel, language, source);
		this.modelService.setMode(this.resultTextModel, language, source);
	}

	public getInitialResultValue(): string {
		const chunks: string[] = [];
		while (true) {
			const chunk = this.resultSnapshot.read();
			if (chunk === null) {
				break;
			}
			chunks.push(chunk);
		}
		return chunks.join();
	}
}

interface ModifiedBaseRangeData {
	accepted: ISettableObservable<ModifiedBaseRangeState>;
	handled: ISettableObservable<boolean>;
}

export const enum MergeEditorModelState {
	initializing = 1,
	upToDate = 2,
	updating = 3,
}
