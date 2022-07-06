/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CompareResult, equals } from 'vs/base/common/arrays';
import { BugIndicatingError } from 'vs/base/common/errors';
import { ISettableObservable, derived, waitForState, observableValue, keepAlive, autorunHandleChanges, transaction, IReader, ITransaction, IObservable } from 'vs/base/common/observable';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { ITextModel, ITextSnapshot } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/model';
import { EditorModel } from 'vs/workbench/common/editor/editorModel';
import { IDiffComputer } from 'vs/workbench/contrib/mergeEditor/browser/model/diffComputer';
import { LineRange } from 'vs/workbench/contrib/mergeEditor/browser/model/lineRange';
import { DetailedLineRangeMapping, DocumentMapping, LineRangeMapping } from 'vs/workbench/contrib/mergeEditor/browser/model/mapping';
import { TextModelDiffChangeReason, TextModelDiffs, TextModelDiffState } from 'vs/workbench/contrib/mergeEditor/browser/model/textModelDiffs';
import { leftJoin } from 'vs/workbench/contrib/mergeEditor/browser/utils';
import { ModifiedBaseRange, ModifiedBaseRangeState } from './modifiedBaseRange';

export const enum MergeEditorModelState {
	initializing = 1,
	upToDate = 2,
	updating = 3,
}

export class MergeEditorModel extends EditorModel {
	private readonly input1TextModelDiffs = this._register(new TextModelDiffs(this.base, this.input1, this.diffComputer));
	private readonly input2TextModelDiffs = this._register(new TextModelDiffs(this.base, this.input2, this.diffComputer));
	private readonly resultTextModelDiffs = this._register(new TextModelDiffs(this.base, this.result, this.diffComputer));

	public readonly state = derived('state', reader => {
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

	public readonly isUpToDate = derived('isUpToDate', reader => this.state.read(reader) === MergeEditorModelState.upToDate);

	public readonly onInitialized = waitForState(this.state, state => state === MergeEditorModelState.upToDate);

	public readonly modifiedBaseRanges = derived<ModifiedBaseRange[]>('modifiedBaseRanges', (reader) => {
		const input1Diffs = this.input1TextModelDiffs.diffs.read(reader);
		const input2Diffs = this.input2TextModelDiffs.diffs.read(reader);

		return ModifiedBaseRange.fromDiffs(input1Diffs, input2Diffs, this.base, this.input1, this.input2);
	});

	public readonly input1LinesDiffs = this.input1TextModelDiffs.diffs;
	public readonly input2LinesDiffs = this.input2TextModelDiffs.diffs;
	public readonly resultDiffs = this.resultTextModelDiffs.diffs;

	private readonly modifiedBaseRangeStateStores =
		derived('modifiedBaseRangeStateStores', reader => {
			const map = new Map(
				this.modifiedBaseRanges.read(reader).map(s => ([s, observableValue(`BaseRangeState${s.baseRange}`, ModifiedBaseRangeState.default)]))
			);
			return map;
		});

	private readonly modifiedBaseRangeHandlingStateStores =
		derived('modifiedBaseRangeHandlingStateStores', reader => {
			const map = new Map(
				this.modifiedBaseRanges.read(reader).map(s => ([s, observableValue(`BaseRangeHandledState${s.baseRange}`, false)]))
			);
			return map;
		});

	public readonly unhandledConflictsCount = derived('unhandledConflictsCount', reader => {
		const map = this.modifiedBaseRangeHandlingStateStores.read(reader);
		let handledCount = 0;
		for (const [_key, value] of map) {
			handledCount += value.read(reader) ? 1 : 0;
		}
		return map.size - handledCount;
	});

	public readonly hasUnhandledConflicts = this.unhandledConflictsCount.map(value => /** @description hasUnhandledConflicts */ value > 0);

	public readonly input1ResultMapping = derived('input1ResultMapping', reader => {
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

	public readonly input2ResultMapping = derived('input2ResultMapping', reader => {
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

	readonly resultSnapshot: ITextSnapshot;

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
		private readonly diffComputer: IDiffComputer,
		options: { resetUnknownOnInitialization: boolean },
		@IModelService private readonly modelService: IModelService,
		@ILanguageService private readonly languageService: ILanguageService,
	) {
		super();

		this.resultSnapshot = result.createSnapshot();
		this._register(keepAlive(this.modifiedBaseRangeStateStores));
		this._register(keepAlive(this.modifiedBaseRangeHandlingStateStores));
		this._register(keepAlive(this.input1ResultMapping));
		this._register(keepAlive(this.input2ResultMapping));

		let shouldResetHandlingState = true;
		this._register(
			autorunHandleChanges(
				'Merge Editor Model: Recompute State',
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
						/** @description Merge Editor Model: Recompute State */
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

		if (options.resetUnknownOnInitialization) {
			this.onInitialized.then(() => {
				this.resetUnknown();
			});
		}
	}

	public getRangeInResult(baseRange: LineRange, reader?: IReader): LineRange {
		return this.resultTextModelDiffs.getResultRange(baseRange, reader);
	}

	private recomputeState(resultDiffs: DetailedLineRangeMapping[], stores: Map<ModifiedBaseRange, ISettableObservable<ModifiedBaseRangeState>>, tx: ITransaction): void {
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
			const newState = this.computeState(row.left[0], row.rights);
			if (!row.left[1].get().equals(newState)) {
				row.left[1].set(newState, tx);
			}
		}
	}

	public resetUnknown(): void {
		transaction(tx => {
			/** @description Reset Unknown Base Range States */
			for (const range of this.modifiedBaseRanges.get()) {
				if (this.getState(range).get().conflicting) {
					this.setState(range, ModifiedBaseRangeState.default, false, tx);
				}
			}
		});
	}

	public mergeNonConflictingDiffs(): void {
		transaction((tx) => {
			/** @description Merge None Conflicting Diffs */
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
		markHandled: boolean,
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

		const { edit, effectiveState } = baseRange.getEditForBase(state);

		existingState.set(effectiveState, transaction);

		if (edit) {
			this.resultTextModelDiffs.applyEditRelativeToOriginal(edit, transaction);
		}

		if (markHandled) {
			this.modifiedBaseRangeHandlingStateStores
				.get()
				.get(baseRange)!
				.set(true, transaction);
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

	public setHandled(baseRange: ModifiedBaseRange, handled: boolean, tx: ITransaction): void {
		this.modifiedBaseRangeHandlingStateStores.get().get(baseRange)!.set(handled, tx);
	}

	public setLanguageId(languageId: string): void {
		const language = this.languageService.createById(languageId);
		this.modelService.setMode(this.base, language);
		this.modelService.setMode(this.input1, language);
		this.modelService.setMode(this.input2, language);
		this.modelService.setMode(this.result, language);
	}
}
