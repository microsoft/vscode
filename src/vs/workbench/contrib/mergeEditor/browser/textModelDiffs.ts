/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { compareBy, numberComparator } from 'vs/base/common/arrays';
import { BugIndicatingError } from 'vs/base/common/errors';
import { Disposable } from 'vs/base/common/lifecycle';
import { ITextModel } from 'vs/editor/common/model';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorker';
import { IObservable, ITransaction, ObservableValue, transaction } from 'vs/workbench/contrib/audioCues/browser/observable';
import { LineDiff, LineEdit, LineRange } from 'vs/workbench/contrib/mergeEditor/browser/model';
import { ReentrancyBarrier } from 'vs/workbench/contrib/mergeEditor/browser/utils';

export class TextModelDiffs extends Disposable {
	private updateCount = 0;
	private readonly _state = new ObservableValue<TextModelDiffState, TextModelDiffChangeReason>(TextModelDiffState.initializing, 'LiveDiffState');
	private readonly _diffs = new ObservableValue<LineDiff[], TextModelDiffChangeReason>([], 'LiveDiffs');

	private readonly barrier = new ReentrancyBarrier();

	constructor(
		private readonly baseTextModel: ITextModel,
		private readonly textModel: ITextModel,
		private readonly diffComputer: IDiffComputer,
	) {
		super();

		this.update(true);
		this._register(baseTextModel.onDidChangeContent(this.barrier.makeExclusive(() => this.update())));
		this._register(textModel.onDidChangeContent(this.barrier.makeExclusive(() => this.update())));
	}

	public get state(): IObservable<TextModelDiffState, TextModelDiffChangeReason> {
		return this._state;
	}

	public get diffs(): IObservable<LineDiff[], TextModelDiffChangeReason> {
		return this._diffs;
	}

	private async update(initializing: boolean = false): Promise<void> {
		this.updateCount++;
		const currentUpdateCount = this.updateCount;

		if (this._state.get() === TextModelDiffState.initializing) {
			initializing = true;
		}

		transaction(tx => {
			this._state.set(
				initializing ? TextModelDiffState.initializing : TextModelDiffState.updating,
				tx,
				TextModelDiffChangeReason.other
			);
		});

		const result = await this.diffComputer.computeDiff(this.baseTextModel, this.textModel);

		if (currentUpdateCount !== this.updateCount) {
			// There is a newer update call
			return;
		}

		transaction(tx => {
			if (result) {
				this._state.set(TextModelDiffState.upToDate, tx, TextModelDiffChangeReason.textChange);
				this._diffs.set(result, tx, TextModelDiffChangeReason.textChange);
			} else {
				this._state.set(TextModelDiffState.error, tx, TextModelDiffChangeReason.textChange);
			}
		});
	}

	private ensureUpToDate(): void {
		if (this.state.get() !== TextModelDiffState.upToDate) {
			throw new BugIndicatingError('Cannot remove diffs when the model is not up to date');
		}
	}

	public removeDiffs(diffToRemoves: LineDiff[], transaction: ITransaction | undefined): void {
		this.ensureUpToDate();

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
				diffToRemove.getReverseLineEdit().apply(this.textModel);
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

		this._diffs.set(diffs, transaction, TextModelDiffChangeReason.other);
	}

	/**
	 * Edit must be conflict free.
	 */
	public applyEditRelativeToOriginal(edit: LineEdit, transaction: ITransaction | undefined): void {
		this.ensureUpToDate();

		let firstAfter = false;
		let delta = 0;
		const newDiffs = new Array<LineDiff>();
		for (const diff of this.diffs.get()) {
			if (diff.originalRange.touches(edit.range)) {
				throw new BugIndicatingError('Edit must be conflict free.');
			} else if (diff.originalRange.isAfter(edit.range)) {
				if (!firstAfter) {
					firstAfter = true;

					newDiffs.push(new LineDiff(
						this.baseTextModel,
						edit.range,
						this.textModel,
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
				this.textModel,
				new LineRange(edit.range.startLineNumber + delta, edit.newLines.length)
			));
		}

		this.barrier.runExclusivelyOrThrow(() => {
			new LineEdit(edit.range.delta(delta), edit.newLines).apply(this.textModel);
		});
		this._diffs.set(newDiffs, transaction, TextModelDiffChangeReason.other);
	}

	public findTouchingDiffs(baseRange: LineRange): LineDiff[] {
		return this.diffs.get().filter(d => d.originalRange.touches(baseRange));
	}

	/*
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
	*/
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
	diffs: LineDiff[];
}

export interface IDiffComputer {
	computeDiff(textModel1: ITextModel, textModel2: ITextModel): Promise<LineDiff[] | null>;
}

export class EditorWorkerServiceDiffComputer implements IDiffComputer {
	constructor(@IEditorWorkerService private readonly editorWorkerService: IEditorWorkerService) { }

	async computeDiff(textModel1: ITextModel, textModel2: ITextModel): Promise<LineDiff[] | null> {
		//await wait(1000);
		const diffs = await this.editorWorkerService.computeDiff(textModel1.uri, textModel2.uri, false, 1000);
		if (!diffs || diffs.quitEarly) {
			return null;
		}
		return diffs.changes.map((c) => LineDiff.fromLineChange(c, textModel1, textModel2));
	}
}
