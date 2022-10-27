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
import { MergeEditorTelemetry } from 'vs/workbench/contrib/mergeEditor/browser/telemetry';
import { leftJoin } from 'vs/workbench/contrib/mergeEditor/browser/utils';
import { ModifiedBaseRange, ModifiedBaseRangeState, ModifiedBaseRangeStateKind } from './modifiedBaseRange';

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
				this.modifiedBaseRanges.read(reader).map<[ModifiedBaseRange, ModifiedBaseRangeData]>((s) => [
					s,
					{
						accepted: observableValue(`BaseRangeState${s.baseRange}`, ModifiedBaseRangeState.base),
						handled: observableValue(`BaseRangeHandledState${s.baseRange}`, false),
						computedFromDiffing: false,
						previousNonDiffingState: undefined,
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
		private readonly options: { resetResult: boolean },
		public readonly telemetry: MergeEditorTelemetry,
		@IModelService private readonly modelService: IModelService,
		@ILanguageService private readonly languageService: ILanguageService,
	) {
		super();

		this._register(keepAlive(this.modifiedBaseRangeResultStates));
		this._register(keepAlive(this.input1ResultMapping));
		this._register(keepAlive(this.input2ResultMapping));

		const initializePromise = this.initialize();

		this.onInitialized = this.onInitialized.then(async () => {
			await initializePromise;
		});

		initializePromise.then(() => {
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
									observableState.handled.set(!(state.kind === ModifiedBaseRangeStateKind.base || state.kind === ModifiedBaseRangeStateKind.unrecognized), tx);
								}
							}
						});
					}
				)
			);
		});
	}

	private async initialize(): Promise<void> {
		if (this.options.resetResult) {
			await this.reset();
		}
	}

	public async reset(): Promise<void> {
		await waitForState(this.inputDiffComputingState, state => state === MergeEditorModelState.upToDate);
		const states = this.modifiedBaseRangeResultStates.get();

		transaction(tx => {
			/** @description Set initial state */

			for (const [range, state] of states) {
				let newState: ModifiedBaseRangeState;
				let handled = false;
				if (range.input1Diffs.length === 0) {
					newState = ModifiedBaseRangeState.base.withInputValue(2, true);
					handled = true;
				} else if (range.input2Diffs.length === 0) {
					newState = ModifiedBaseRangeState.base.withInputValue(1, true);
					handled = true;
				} else {
					newState = ModifiedBaseRangeState.base;
					handled = false;
				}

				state.accepted.set(newState, tx);
				state.computedFromDiffing = false;
				state.previousNonDiffingState = undefined;
				state.handled.set(handled, tx);
			}

			this.resultTextModel.setValue(this.computeAutoMergedResult());
		});
	}

	private computeAutoMergedResult(): string {
		const baseRanges = this.modifiedBaseRanges.get();

		const baseLines = this.base.getLinesContent();
		const input1Lines = this.input1.textModel.getLinesContent();
		const input2Lines = this.input2.textModel.getLinesContent();

		const resultLines: string[] = [];
		function appendLinesToResult(source: string[], lineRange: LineRange) {
			for (let i = lineRange.startLineNumber; i < lineRange.endLineNumberExclusive; i++) {
				resultLines.push(source[i - 1]);
			}
		}

		let baseStartLineNumber = 1;

		for (const baseRange of baseRanges) {
			appendLinesToResult(baseLines, LineRange.fromLineNumbers(baseStartLineNumber, baseRange.baseRange.startLineNumber));
			baseStartLineNumber = baseRange.baseRange.endLineNumberExclusive;

			if (baseRange.input1Diffs.length === 0) {
				appendLinesToResult(input2Lines, baseRange.input2Range);
			} else if (baseRange.input2Diffs.length === 0) {
				appendLinesToResult(input1Lines, baseRange.input1Range);
			} else {
				appendLinesToResult(baseLines, baseRange.baseRange);
			}
		}

		appendLinesToResult(baseLines, LineRange.fromLineNumbers(baseStartLineNumber, baseLines.length + 1));

		return resultLines.join(this.resultTextModel.getEOL());
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

	public readonly inputDiffComputingState = derived('inputDiffComputingState', reader => {
		const states = [
			this.input1TextModelDiffs,
			this.input2TextModelDiffs,
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

	private firstRun = true;
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
			const data = row.left[1];
			const oldState = data.accepted.get();
			if (!oldState.equals(newState)) {
				if (!this.firstRun && !data.computedFromDiffing) {
					// Don't set this on the first run - the first run might be used to restore state.
					data.computedFromDiffing = true;
					data.previousNonDiffingState = oldState;
				}
				data.accepted.set(newState, tx);
			}
		}

		if (this.firstRun) {
			this.firstRun = false;
		}
	}

	private computeState(baseRange: ModifiedBaseRange, conflictingDiffs: DetailedLineRangeMapping[]): ModifiedBaseRangeState {
		if (conflictingDiffs.length === 0) {
			return ModifiedBaseRangeState.base;
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
			return ModifiedBaseRangeState.base.withInputValue(1, true);
		}
		if (editsAgreeWithDiffs(baseRange.input2Diffs)) {
			return ModifiedBaseRangeState.base.withInputValue(2, true);
		}

		const states = [
			ModifiedBaseRangeState.base.withInputValue(1, true).withInputValue(2, true, true),
			ModifiedBaseRangeState.base.withInputValue(2, true).withInputValue(1, true, true),
			ModifiedBaseRangeState.base.withInputValue(1, true).withInputValue(2, true, false),
			ModifiedBaseRangeState.base.withInputValue(2, true).withInputValue(1, true, false),
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

		return ModifiedBaseRangeState.unrecognized;
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
		existingState.previousNonDiffingState = undefined;
		existingState.computedFromDiffing = false;

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
				if (this.getState(range).get().kind === ModifiedBaseRangeStateKind.unrecognized) {
					this.setState(range, ModifiedBaseRangeState.base, false, tx, false);
				}
			}
			this.resultTextModel.pushStackElement();
		});
	}

	public isHandled(baseRange: ModifiedBaseRange): IObservable<boolean> {
		return this.modifiedBaseRangeResultStates.get().get(baseRange)!.handled;
	}

	public setHandled(baseRange: ModifiedBaseRange, handled: boolean, tx: ITransaction): void {
		const state = this.modifiedBaseRangeResultStates.get().get(baseRange)!;
		if (state.handled.get() === handled) {
			return;
		}

		state.handled.set(handled, tx);
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

	public async getResultValueWithConflictMarkers(): Promise<string> {
		await waitForState(this.diffComputingState, state => state === MergeEditorModelState.upToDate);

		if (this.unhandledConflictsCount.get() === 0) {
			return this.resultTextModel.getValue();
		}

		const resultLines = this.resultTextModel.getLinesContent();
		const input1Lines = this.input1.textModel.getLinesContent();
		const input2Lines = this.input2.textModel.getLinesContent();

		const states = this.modifiedBaseRangeResultStates.get();

		const outputLines: string[] = [];
		function appendLinesToResult(source: string[], lineRange: LineRange) {
			for (let i = lineRange.startLineNumber; i < lineRange.endLineNumberExclusive; i++) {
				outputLines.push(source[i - 1]);
			}
		}

		let resultStartLineNumber = 1;

		for (const [range, state] of states) {
			if (state.handled.get()) {
				continue;
			}
			const resultRange = this.resultTextModelDiffs.getResultLineRange(range.baseRange);

			appendLinesToResult(resultLines, LineRange.fromLineNumbers(resultStartLineNumber, Math.max(resultStartLineNumber, resultRange.startLineNumber)));
			resultStartLineNumber = resultRange.endLineNumberExclusive;

			outputLines.push('<<<<<<<');
			if (state.accepted.get().kind === ModifiedBaseRangeStateKind.unrecognized) {
				// to prevent loss of data, use modified result as "ours"
				appendLinesToResult(resultLines, resultRange);
			} else {
				appendLinesToResult(input1Lines, range.input1Range);
			}
			outputLines.push('=======');
			appendLinesToResult(input2Lines, range.input2Range);
			outputLines.push('>>>>>>>');
		}

		appendLinesToResult(resultLines, LineRange.fromLineNumbers(resultStartLineNumber, resultLines.length + 1));
		return outputLines.join('\n');
	}

	public get conflictCount(): number {
		return arrayCount(this.modifiedBaseRanges.get(), r => r.isConflicting);
	}
	public get combinableConflictCount(): number {
		return arrayCount(this.modifiedBaseRanges.get(), r => r.isConflicting && r.canBeCombined);
	}

	public get conflictsResolvedWithBase(): number {
		return arrayCount(
			this.modifiedBaseRangeResultStates.get().entries(),
			([r, s]) =>
				r.isConflicting &&
				s.accepted.get().kind === ModifiedBaseRangeStateKind.base
		);
	}
	public get conflictsResolvedWithInput1(): number {
		return arrayCount(
			this.modifiedBaseRangeResultStates.get().entries(),
			([r, s]) =>
				r.isConflicting &&
				s.accepted.get().kind === ModifiedBaseRangeStateKind.input1
		);
	}
	public get conflictsResolvedWithInput2(): number {
		return arrayCount(
			this.modifiedBaseRangeResultStates.get().entries(),
			([r, s]) =>
				r.isConflicting &&
				s.accepted.get().kind === ModifiedBaseRangeStateKind.input2
		);
	}
	public get conflictsResolvedWithSmartCombination(): number {
		return arrayCount(
			this.modifiedBaseRangeResultStates.get().entries(),
			([r, s]: [ModifiedBaseRange, ModifiedBaseRangeData]) => {
				const state = s.accepted.get();
				return r.isConflicting && state.kind === ModifiedBaseRangeStateKind.both && state.smartCombination;
			}
		);
	}

	public get manuallySolvedConflictCountThatEqualNone(): number {
		return arrayCount(
			this.modifiedBaseRangeResultStates.get().entries(),
			([r, s]) =>
				r.isConflicting &&
				s.accepted.get().kind === ModifiedBaseRangeStateKind.unrecognized
		);
	}
	public get manuallySolvedConflictCountThatEqualSmartCombine(): number {
		return arrayCount(
			this.modifiedBaseRangeResultStates.get().entries(),
			([r, s]: [ModifiedBaseRange, ModifiedBaseRangeData]) => {
				const state = s.accepted.get();
				return r.isConflicting && s.computedFromDiffing && state.kind === ModifiedBaseRangeStateKind.both && state.smartCombination;
			}
		);
	}
	public get manuallySolvedConflictCountThatEqualInput1(): number {
		return arrayCount(
			this.modifiedBaseRangeResultStates.get().entries(),
			([r, s]: [ModifiedBaseRange, ModifiedBaseRangeData]) => {
				const state = s.accepted.get();
				return r.isConflicting && s.computedFromDiffing && state.kind === ModifiedBaseRangeStateKind.input1;
			}
		);
	}
	public get manuallySolvedConflictCountThatEqualInput2(): number {
		return arrayCount(
			this.modifiedBaseRangeResultStates.get().entries(),
			([r, s]: [ModifiedBaseRange, ModifiedBaseRangeData]) => {
				const state = s.accepted.get();
				return r.isConflicting && s.computedFromDiffing && state.kind === ModifiedBaseRangeStateKind.input2;
			}
		);
	}

	public get manuallySolvedConflictCountThatEqualNoneAndStartedWithBase(): number {
		return arrayCount(
			this.modifiedBaseRangeResultStates.get().entries(),
			([r, s]: [ModifiedBaseRange, ModifiedBaseRangeData]) => {
				const state = s.accepted.get();
				return r.isConflicting && state.kind === ModifiedBaseRangeStateKind.unrecognized && s.previousNonDiffingState?.kind === ModifiedBaseRangeStateKind.base;
			}
		);
	}
	public get manuallySolvedConflictCountThatEqualNoneAndStartedWithInput1(): number {
		return arrayCount(
			this.modifiedBaseRangeResultStates.get().entries(),
			([r, s]: [ModifiedBaseRange, ModifiedBaseRangeData]) => {
				const state = s.accepted.get();
				return r.isConflicting && state.kind === ModifiedBaseRangeStateKind.unrecognized && s.previousNonDiffingState?.kind === ModifiedBaseRangeStateKind.input1;
			}
		);
	}
	public get manuallySolvedConflictCountThatEqualNoneAndStartedWithInput2(): number {
		return arrayCount(
			this.modifiedBaseRangeResultStates.get().entries(),
			([r, s]: [ModifiedBaseRange, ModifiedBaseRangeData]) => {
				const state = s.accepted.get();
				return r.isConflicting && state.kind === ModifiedBaseRangeStateKind.unrecognized && s.previousNonDiffingState?.kind === ModifiedBaseRangeStateKind.input2;
			}
		);
	}
	public get manuallySolvedConflictCountThatEqualNoneAndStartedWithBothNonSmart(): number {
		return arrayCount(
			this.modifiedBaseRangeResultStates.get().entries(),
			([r, s]: [ModifiedBaseRange, ModifiedBaseRangeData]) => {
				const state = s.accepted.get();
				return r.isConflicting && state.kind === ModifiedBaseRangeStateKind.unrecognized && s.previousNonDiffingState?.kind === ModifiedBaseRangeStateKind.both && !s.previousNonDiffingState?.smartCombination;
			}
		);
	}
	public get manuallySolvedConflictCountThatEqualNoneAndStartedWithBothSmart(): number {
		return arrayCount(
			this.modifiedBaseRangeResultStates.get().entries(),
			([r, s]: [ModifiedBaseRange, ModifiedBaseRangeData]) => {
				const state = s.accepted.get();
				return r.isConflicting && state.kind === ModifiedBaseRangeStateKind.unrecognized && s.previousNonDiffingState?.kind === ModifiedBaseRangeStateKind.both && s.previousNonDiffingState?.smartCombination;
			}
		);
	}
}

function arrayCount<T>(array: Iterable<T>, predicate: (value: T) => boolean): number {
	let count = 0;
	for (const value of array) {
		if (predicate(value)) {
			count++;
		}
	}
	return count;
}

interface ModifiedBaseRangeData {
	accepted: ISettableObservable<ModifiedBaseRangeState>;

	handled: ISettableObservable<boolean>;

	computedFromDiffing: boolean;
	previousNonDiffingState: ModifiedBaseRangeState | undefined;
}

export const enum MergeEditorModelState {
	initializing = 1,
	upToDate = 2,
	updating = 3,
}
