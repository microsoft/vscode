/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { compareBy, numberComparator } from 'vs/base/common/arrays';
import { BugIndicatingError } from 'vs/base/common/errors';
import { ITextModel } from 'vs/editor/common/model';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorker';
import { EditorModel } from 'vs/workbench/common/editor/editorModel';
import { MergeableDiff, LineEdit, LineEdits, LineDiff, MergeState, LineRange } from 'vs/workbench/contrib/mergeEditor/browser/model';

export class MergeEditorModelFactory {
	constructor(
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService,
		//@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
	}

	public async create(
		ancestor: ITextModel,
		inputOne: ITextModel,
		inputTwo: ITextModel,
		result: ITextModel,
	): Promise<MergeEditorModel> {

		const ancestorToInputOneDiffPromise = this._editorWorkerService.computeDiff(
			ancestor.uri,
			inputOne.uri,
			false,
			1000
		);
		const ancestorToInputTwoDiffPromise = this._editorWorkerService.computeDiff(
			ancestor.uri,
			inputTwo.uri,
			false,
			1000
		);

		const [ancestorToInputOneDiff, ancestorToInputTwoDiff] = await Promise.all([
			ancestorToInputOneDiffPromise,
			ancestorToInputTwoDiffPromise,
		]);

		const changesInput1 =
			ancestorToInputOneDiff?.changes.map((c) =>
				LineDiff.fromLineChange(c, ancestor, inputOne)
			) || [];
		const changesInput2 =
			ancestorToInputTwoDiff?.changes.map((c) =>
				LineDiff.fromLineChange(c, ancestor, inputTwo)
			) || [];

		return new MergeEditorModel(
			InternalSymbol,
			ancestor,
			inputOne,
			inputTwo,
			result,
			changesInput1,
			changesInput2,
		);
	}
}

const InternalSymbol = Symbol();

export class MergeEditorModel extends EditorModel {
	private resultEdits = new ResultEdits([], this.ancestor, this.result);

	constructor(
		symbol: typeof InternalSymbol,
		readonly ancestor: ITextModel,
		readonly inputOne: ITextModel,
		readonly inputTwo: ITextModel,
		readonly result: ITextModel,
		private readonly inputOneLinesDiffs: readonly LineDiff[],
		private readonly inputTwoLinesDiffs: readonly LineDiff[],
	) {
		super();

		result.setValue(ancestor.getValue());

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

		console.log(this, 'hello');
		(globalThis as any)['mergeEditorModel'] = this;
	}

	public get resultDiffs(): readonly LineDiff[] {
		return this.resultEdits.diffs;
	}

	public readonly mergeableDiffs = MergeableDiff.fromDiffs(this.inputOneLinesDiffs, this.inputTwoLinesDiffs);

	public getState(conflict: MergeableDiff): MergeState | undefined {
		return undefined;
	}

	// Undo all edits of result that conflict with the conflict!!
	public setConflictResolutionStatus(conflict: MergeableDiff, status: MergeState): void {
		const existingDiff = this.resultEdits.findConflictingDiffs(conflict.originalRange);
		if (existingDiff) {
			this.resultEdits.removeDiff(existingDiff);
		}

		const edit = status.input1 ? conflict.getInput1LineEdit() : conflict.getInput2LineEdit();
		if (edit) {
			this.resultEdits.applyEditRelativeToOriginal(edit);
		}
	}
}

class ResultEdits {
	constructor(
		private _diffs: LineDiff[],
		private readonly originalTextModel: ITextModel,
		private readonly textModel: ITextModel,
	) {
		this._diffs.sort(compareBy((d) => d.originalRange.startLineNumber, numberComparator));
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

		const edits = new LineEdits([diffToRemove.getReverseLineEdit()]);
		edits.apply(this.textModel);

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

			if (diff.originalRange.intersects(edit.range)) {
				throw new BugIndicatingError();
			} else if (diff.originalRange.isAfter(edit.range)) {
				if (!firstAfter) {
					firstAfter = true;

					newDiffs.push(new LineDiff(
						this.originalTextModel,
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
				this.originalTextModel,
				edit.range,
				this.textModel,
				new LineRange(edit.range.startLineNumber + delta, edit.newLines.length)
			));
		}
		this._diffs = newDiffs;

		const edits = new LineEdits([new LineEdit(edit.range.delta(delta), edit.newLines, edit.data)]);
		edits.apply(this.textModel);
	}

	// TODO return many!
	public findConflictingDiffs(rangeInOriginalTextModel: LineRange): LineDiff | undefined {
		// TODO binary search
		return this.diffs.find(d => d.originalRange.intersects(rangeInOriginalTextModel));
	}
}
