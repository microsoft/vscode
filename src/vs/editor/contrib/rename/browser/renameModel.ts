/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import * as arrays from 'vs/base/common/arrays';
import * as collections from 'vs/base/common/collections';
import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import {IEditorService} from 'vs/platform/editor/common/editor';
import {EditOperation} from 'vs/editor/common/core/editOperation';
import {Range} from 'vs/editor/common/core/range';
import {Selection} from 'vs/editor/common/core/selection';
import {IEditorSelection, IIdentifiedSingleEditOperation, IModel, IRange} from 'vs/editor/common/editorCommon';
import {IResourceEdit} from 'vs/editor/common/modes';

class EditTask {
	private _initialSelections: IEditorSelection[];
	private _endCursorSelection: IEditorSelection;
	private _model: IModel;
	private _edits: IIdentifiedSingleEditOperation[];

	constructor(model: IModel) {
		this._endCursorSelection = null;
		this._model = model;
		this._edits = [];
	}

	public addEdit(edit: IResourceEdit): void {
		var range: IRange;
		if (!edit.range) {
			range = this._model.getFullModelRange();
		} else {
			range = edit.range;
		}
		this._edits.push(EditOperation.replace(Range.lift(range), edit.newText));
	}

	public apply(): void {
		if (this._edits.length === 0) {
			return;
		}
		this._edits.sort(EditTask._editCompare);

		this._initialSelections = this._getInitialSelections();
		this._model.pushEditOperations(this._initialSelections, this._edits, (edits) => this._getEndCursorSelections(edits));
	}

	protected _getInitialSelections(): IEditorSelection[] {
		var firstRange = this._edits[0].range;
		var initialSelection = Selection.createSelection(
			firstRange.startLineNumber,
			firstRange.startColumn,
			firstRange.endLineNumber,
			firstRange.endColumn
		);
		return [initialSelection];
	}

	private _getEndCursorSelections(inverseEditOperations:IIdentifiedSingleEditOperation[]): IEditorSelection[] {
		var relevantEditIndex = 0;
		for (var i = 0; i < inverseEditOperations.length; i++) {
			var editRange = inverseEditOperations[i].range;
			for (var j = 0; j < this._initialSelections.length; j++) {
				var selectionRange = this._initialSelections[j];
				if (Range.areIntersectingOrTouching(editRange, selectionRange)) {
					relevantEditIndex = i;
					break;
				}
			}
		}

		var srcRange = inverseEditOperations[relevantEditIndex].range;
		this._endCursorSelection = Selection.createSelection(
			srcRange.endLineNumber,
			srcRange.endColumn,
			srcRange.endLineNumber,
			srcRange.endColumn
		);
		return [this._endCursorSelection];
	}

	public getEndCursorSelection(): IEditorSelection {
		return this._endCursorSelection;
	}

	private static _editCompare(a: IIdentifiedSingleEditOperation, b: IIdentifiedSingleEditOperation): number {
		return Range.compareRangesUsingStarts(a.range, b.range);
	}
}

class SourceModelEditTask extends EditTask {

	private _knownInitialSelections:IEditorSelection[];

	constructor(model: IModel, initialSelections:IEditorSelection[]) {
		super(model);
		this._knownInitialSelections = initialSelections;
	}

	protected _getInitialSelections(): IEditorSelection[] {
		return this._knownInitialSelections;
	}
}

export default class RenameModel {

	private _editorService: IEditorService;
	private _numberOfResourcesToModify: number = 0;
	private _numberOfChanges: number = 0;
	private _edits: collections.IStringDictionary<IResourceEdit[]> = Object.create(null);
	private _rejectReasons: string[];
	private _tasks: EditTask[];
	private _sourceModel: URI;
	private _sourceSelections: IEditorSelection[];
	private _sourceModelTask: SourceModelEditTask;

	constructor(editorService: IEditorService, sourceModel: URI, sourceSelections: IEditorSelection[], editsOrReject: string|IResourceEdit[]) {
		this._editorService = editorService;
		this._sourceModel = sourceModel;
		this._sourceSelections = sourceSelections;
		this._sourceModelTask = null;

		if (typeof editsOrReject === 'string') {
			this.reject(editsOrReject);
		} else {
			editsOrReject.forEach(this._addEdit, this);
		}
	}

	public reject(value: string): void {
		if (!this._rejectReasons) {
			this._rejectReasons = [];
		}
		this._rejectReasons.push(value);
	}

	public isRejected(): boolean {
		return !arrays.isFalsyOrEmpty(this._rejectReasons);
	}

	public rejectReasons(): string[]{
		return this._rejectReasons;
	}

	public resourcesCount(): number {
		return this._numberOfResourcesToModify;
	}

	public changeCount(): number {
		return this._numberOfChanges;
	}

	private _addEdit(edit: IResourceEdit): void {
		var array = this._edits[edit.resource.toString()];
		if (!array) {
			this._edits[edit.resource.toString()] = array = [];
			this._numberOfResourcesToModify += 1;
		}
		this._numberOfChanges += 1;
		array.push(edit);
	}

	public prepare(): TPromise<RenameModel> {

		if (this._tasks) {
			throw new Error('illegal state - already prepared');
		}

		this._tasks = [];
		var promises: TPromise<any>[] = [];

		collections.forEach(this._edits, entry => {
			var promise = this._editorService.resolveEditorModel({ resource: URI.parse(entry.key) }).then(model => {
				if (!model || !model.textEditorModel) {
					this.reject(nls.localize('cannotLoadFile', "Cannot load file {0}", entry.key));
				} else {
					var textEditorModel = <IModel>model.textEditorModel,
						task: EditTask;

					if (textEditorModel.getAssociatedResource().toString() === this._sourceModel.toString()) {
						this._sourceModelTask = new SourceModelEditTask(textEditorModel, this._sourceSelections);
						task = this._sourceModelTask;
					} else {
						task = new EditTask(textEditorModel);
					}

					entry.value.forEach(edit => task.addEdit(edit));
					this._tasks.push(task);
				}
			});
			promises.push(promise);
		});

		return TPromise.join(promises).then(_ => this);
	}

	public apply(): IEditorSelection {
		this._tasks.forEach(task => task.apply());
		var r: IEditorSelection = null;
		if (this._sourceModelTask) {
			r = this._sourceModelTask.getEndCursorSelection();
		}
		return r;
	}
}
