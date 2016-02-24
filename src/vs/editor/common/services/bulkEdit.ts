/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import {merge} from 'vs/base/common/arrays';
import {IStringDictionary, forEach, values} from 'vs/base/common/collections';
import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import {IEditorService} from 'vs/platform/editor/common/editor';
import {IEventService} from 'vs/platform/event/common/event';
import {EventType as FileEventType, FileChangesEvent, IFileChange} from 'vs/platform/files/common/files';
import {EditOperation} from 'vs/editor/common/core/editOperation';
import {Range} from 'vs/editor/common/core/range';
import {Selection} from 'vs/editor/common/core/selection';
import {IEditorSelection, IIdentifiedSingleEditOperation, IModel, IRange, ISelection} from 'vs/editor/common/editorCommon';
import {ICommonCodeEditor} from 'vs/editor/common/editorCommon';

export interface IResourceEdit {
	resource: URI;
	range?: IRange;
	newText: string;
}

interface IRecording {
	stop(): void;
	hasChanged(resource: URI): boolean;
	allChanges(): IFileChange[];
}

class ChangeRecorder {

	private _eventService: IEventService;

	constructor(eventService: IEventService) {
		this._eventService = eventService;
	}

	public start(): IRecording {

		var changes: IStringDictionary<IFileChange[]> = Object.create(null);

		var stop = this._eventService.addListener(FileEventType.FILE_CHANGES,(event: FileChangesEvent) => {
			event.changes.forEach(change => {

				var key = String(change.resource),
					array = changes[key];

				if (!array) {
					changes[key] = array = [];
				}

				array.push(change);
			});
		});

		return {
			stop,
			hasChanged: (resource: URI) => !!changes[resource.toString()],
			allChanges: () => merge(values(changes))
		};
	}
}

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

class BulkEditModel {

	private _editorService: IEditorService;
	private _numberOfResourcesToModify: number = 0;
	private _numberOfChanges: number = 0;
	private _edits: IStringDictionary<IResourceEdit[]> = Object.create(null);
	private _tasks: EditTask[];
	private _sourceModel: URI;
	private _sourceSelections: IEditorSelection[];
	private _sourceModelTask: SourceModelEditTask;

	constructor(editorService: IEditorService, sourceModel: URI, sourceSelections: IEditorSelection[], edits: IResourceEdit[]) {
		this._editorService = editorService;
		this._sourceModel = sourceModel;
		this._sourceSelections = sourceSelections;
		this._sourceModelTask = null;

		for (let edit of edits) {
			this._addEdit(edit);
		}
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

	public prepare(): TPromise<BulkEditModel> {

		if (this._tasks) {
			throw new Error('illegal state - already prepared');
		}

		this._tasks = [];
		var promises: TPromise<any>[] = [];

		forEach(this._edits, entry => {
			var promise = this._editorService.resolveEditorModel({ resource: URI.parse(entry.key) }).then(model => {
				if (!model || !model.textEditorModel) {
					throw new Error(`Cannot load file ${entry.key}`);
				}

				var textEditorModel = <IModel>model.textEditorModel,
					task: EditTask;

				if (this._sourceModel && textEditorModel.getAssociatedResource().toString() ===  this._sourceModel.toString()) {
					this._sourceModelTask = new SourceModelEditTask(textEditorModel, this._sourceSelections);
					task = this._sourceModelTask;
				} else {
					task = new EditTask(textEditorModel);
				}

				entry.value.forEach(edit => task.addEdit(edit));
				this._tasks.push(task);
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

export interface BulkEdit {
	add(edit: IResourceEdit[]): void;
	finish(): TPromise<ISelection>;
}

export function bulkEdit(eventService:IEventService, editorService:IEditorService, editor:ICommonCodeEditor, edits:IResourceEdit[]):TPromise<any> {
	let bulk = createBulkEdit(eventService, editorService, editor);
	bulk.add(edits);
	return bulk.finish();
}

export function createBulkEdit(eventService: IEventService, editorService: IEditorService, editor: ICommonCodeEditor): BulkEdit {

	let all: IResourceEdit[] = [];
	let recording = new ChangeRecorder(eventService).start();

	function add(edits: IResourceEdit[]): void {
		all.push(...edits);
	}

	function getConcurrentEdits() {
		let names: string[];
		for (let edit of all) {
			if (recording.hasChanged(edit.resource)) {
				if (!names) {
					names = [];
				}
				names.push(edit.resource.fsPath);
			}
		}
		if (names) {
			return nls.localize('conflict', "These files have changed in the meantime: {0}", names.join(', '));
		}
	}

	function finish(): TPromise<ISelection> {

		if (all.length === 0) {
			return;
		}

		let concurrentEdits = getConcurrentEdits();
		if (concurrentEdits) {
			return TPromise.wrapError(concurrentEdits);
		}

		let uri: URI;
		let selections: IEditorSelection[];

		if (editor && editor.getModel()) {
			uri = editor.getModel().getAssociatedResource();
			selections = editor.getSelections();
		}

		let model = new BulkEditModel(editorService, uri, selections, all);

		return model.prepare().then(_ => {

			let concurrentEdits = getConcurrentEdits();
			if (concurrentEdits) {
				throw new Error(concurrentEdits);
			}

			recording.stop();
			return model.apply();
		});
	}

	return {
		add,
		finish
	};
}
