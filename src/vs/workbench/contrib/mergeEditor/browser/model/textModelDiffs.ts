/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { compareBy, numberComparator } from 'vs/base/common/arrays';
import { BugIndicatingError } from 'vs/base/common/errors';
import { Disposable } from 'vs/base/common/lifecycle';
import { ITextModel } from 'vs/editor/common/model';
import { IObservable, IReader, ITransaction, ObservableValue, transaction } from 'vs/workbench/contrib/audioCues/browser/observable';
import { DetailedLineRangeMapping } from 'vs/workbench/contrib/mergeEditor/browser/model/mapping';
import { LineRangeEdit } from 'vs/workbench/contrib/mergeEditor/browser/model/editing';
import { LineRange } from 'vs/workbench/contrib/mergeEditor/browser/model/lineRange';
import { ReentrancyBarrier } from 'vs/workbench/contrib/mergeEditor/browser/utils';
import { IDiffComputer } from './diffComputer';

export class TextModelDiffs extends Disposable {
	private updateCount = 0;
	private readonly _state = new ObservableValue<TextModelDiffState, TextModelDiffChangeReason>(TextModelDiffState.initializing, 'LiveDiffState');
	private readonly _diffs = new ObservableValue<DetailedLineRangeMapping[], TextModelDiffChangeReason>([], 'LiveDiffs');

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

	public get diffs(): IObservable<DetailedLineRangeMapping[], TextModelDiffChangeReason> {
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
			if (result.diffs) {
				this._state.set(TextModelDiffState.upToDate, tx, TextModelDiffChangeReason.textChange);
				this._diffs.set(result.diffs, tx, TextModelDiffChangeReason.textChange);
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

	public removeDiffs(diffToRemoves: DetailedLineRangeMapping[], transaction: ITransaction | undefined): void {
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

			this.barrier.runExclusivelyOrThrow(() => {
				diffToRemove.getReverseLineEdit().apply(this.textModel);
			});

			diffs = diffs.map((d) =>
				d.outputRange.isAfter(diffToRemove.outputRange)
					? d.addOutputLineDelta(diffToRemove.inputRange.lineCount - diffToRemove.outputRange.lineCount)
					: d
			);
		}

		this._diffs.set(diffs, transaction, TextModelDiffChangeReason.other);
	}

	/**
	 * Edit must be conflict free.
	 */
	public applyEditRelativeToOriginal(edit: LineRangeEdit, transaction: ITransaction | undefined): void {
		this.ensureUpToDate();

		const editMapping = new DetailedLineRangeMapping(
			edit.range,
			this.baseTextModel,
			new LineRange(edit.range.startLineNumber, edit.newLines.length),
			this.textModel
		);

		let firstAfter = false;
		let delta = 0;
		const newDiffs = new Array<DetailedLineRangeMapping>();
		for (const diff of this.diffs.get()) {
			if (diff.inputRange.touches(edit.range)) {
				throw new BugIndicatingError('Edit must be conflict free.');
			} else if (diff.inputRange.isAfter(edit.range)) {
				if (!firstAfter) {
					firstAfter = true;
					newDiffs.push(editMapping.addOutputLineDelta(delta));
				}

				newDiffs.push(diff.addOutputLineDelta(edit.newLines.length - edit.range.lineCount));
			} else {
				newDiffs.push(diff);
			}

			if (!firstAfter) {
				delta += diff.outputRange.lineCount - diff.inputRange.lineCount;
			}
		}

		if (!firstAfter) {
			firstAfter = true;
			newDiffs.push(editMapping.addOutputLineDelta(delta));
		}

		this.barrier.runExclusivelyOrThrow(() => {
			new LineRangeEdit(edit.range.delta(delta), edit.newLines).apply(this.textModel);
		});
		this._diffs.set(newDiffs, transaction, TextModelDiffChangeReason.other);
	}

	public findTouchingDiffs(baseRange: LineRange): DetailedLineRangeMapping[] {
		return this.diffs.get().filter(d => d.inputRange.touches(baseRange));
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

	public getResultRange(baseRange: LineRange, reader?: IReader): LineRange {
		let start = this.getResultLine(baseRange.startLineNumber, reader);
		if (typeof start !== 'number') {
			start = start.outputRange.startLineNumber;
		}
		let endExclusive = this.getResultLine(baseRange.endLineNumberExclusive, reader);
		if (typeof endExclusive !== 'number') {
			endExclusive = endExclusive.outputRange.endLineNumberExclusive;
		}

		return LineRange.fromLineNumbers(start, endExclusive);
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
