/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import {readonly, illegalArgument} from 'vs/base/common/errors';
import {IdGenerator} from 'vs/base/common/idGenerator';
import Event, {Emitter} from 'vs/base/common/event';
import {TPromise} from 'vs/base/common/winjs.base';
import {IThreadService} from 'vs/workbench/services/thread/common/threadService';
import {ExtHostDocuments, ExtHostDocumentData} from 'vs/workbench/api/node/extHostDocuments';
import {Selection, Range, Position, EditorOptions, EndOfLine, TextEditorRevealType} from './extHostTypes';
import {ISingleEditOperation, ISelection} from 'vs/editor/common/editorCommon';
import {IResolvedTextEditorConfiguration} from 'vs/workbench/api/node/mainThreadEditorsTracker';
import * as TypeConverters from './extHostTypeConverters';
import {TextDocument, TextEditorSelectionChangeEvent, TextEditorOptionsChangeEvent, TextEditorOptions, TextEditorViewColumnChangeEvent, ViewColumn} from 'vscode';
import {MainContext, MainThreadEditorsShape, ITextEditorAddData, ITextEditorPositionData} from './extHostProtocol';

export class ExtHostEditors {

	public onDidChangeTextEditorSelection: Event<TextEditorSelectionChangeEvent>;
	private _onDidChangeTextEditorSelection: Emitter<TextEditorSelectionChangeEvent>;

	public onDidChangeTextEditorOptions: Event<TextEditorOptionsChangeEvent>;
	private _onDidChangeTextEditorOptions: Emitter<TextEditorOptionsChangeEvent>;

	public onDidChangeTextEditorViewColumn: Event<TextEditorViewColumnChangeEvent>;
	private _onDidChangeTextEditorViewColumn: Emitter<TextEditorViewColumnChangeEvent>;

	private _editors: { [id: string]: ExtHostTextEditor };
	private _proxy: MainThreadEditorsShape;
	private _onDidChangeActiveTextEditor: Emitter<vscode.TextEditor>;
	private _extHostDocuments: ExtHostDocuments;
	private _activeEditorId: string;
	private _visibleEditorIds: string[];

	constructor(
		threadService: IThreadService,
		extHostDocuments: ExtHostDocuments
	) {
		this._onDidChangeTextEditorSelection = new Emitter<TextEditorSelectionChangeEvent>();
		this.onDidChangeTextEditorSelection = this._onDidChangeTextEditorSelection.event;

		this._onDidChangeTextEditorOptions = new Emitter<TextEditorOptionsChangeEvent>();
		this.onDidChangeTextEditorOptions = this._onDidChangeTextEditorOptions.event;

		this._onDidChangeTextEditorViewColumn = new Emitter<TextEditorViewColumnChangeEvent>();
		this.onDidChangeTextEditorViewColumn = this._onDidChangeTextEditorViewColumn.event;

		this._extHostDocuments = extHostDocuments;
		this._proxy = threadService.get(MainContext.MainThreadEditors);
		this._onDidChangeActiveTextEditor = new Emitter<vscode.TextEditor>();
		this._editors = Object.create(null);

		this._visibleEditorIds = [];
	}

	getActiveTextEditor(): vscode.TextEditor {
		return this._editors[this._activeEditorId];
	}

	getVisibleTextEditors(): vscode.TextEditor[] {
		return this._visibleEditorIds.map(id => this._editors[id]);
	}

	get onDidChangeActiveTextEditor(): Event<vscode.TextEditor> {
		return this._onDidChangeActiveTextEditor && this._onDidChangeActiveTextEditor.event;
	}

	showTextDocument(document: TextDocument, column: ViewColumn, preserveFocus: boolean): TPromise<vscode.TextEditor> {
		return this._proxy._tryShowTextDocument(<URI> document.uri, TypeConverters.fromViewColumn(column), preserveFocus).then(id => {
			let editor = this._editors[id];
			if (editor) {
				return editor;
			} else {
				throw new Error(`Failed to show text document ${document.uri.toString()}, should show in editor #${id}`);
			}
		});
	}

	createTextEditorDecorationType(options: vscode.DecorationRenderOptions): vscode.TextEditorDecorationType {
		return new TextEditorDecorationType(this._proxy, options);
	}

	// --- called from main thread

	_acceptTextEditorAdd(data: ITextEditorAddData): void {
		let document = this._extHostDocuments.getDocumentData(data.document);
		let newEditor = new ExtHostTextEditor(this._proxy, data.id, document, data.selections.map(TypeConverters.toSelection), data.options, TypeConverters.toViewColumn(data.editorPosition));
		this._editors[data.id] = newEditor;
	}

	_acceptOptionsChanged(id: string, opts: IResolvedTextEditorConfiguration): void {
		let editor = this._editors[id];
		editor._acceptOptions(opts);
		this._onDidChangeTextEditorOptions.fire({
			textEditor: editor,
			options: opts
		});
	}

	_acceptSelectionsChanged(id: string, _selections: ISelection[]): void {
		let selections = _selections.map(TypeConverters.toSelection);
		let editor = this._editors[id];
		editor._acceptSelections(selections);
		this._onDidChangeTextEditorSelection.fire({
			textEditor: editor,
			selections: selections
		});
	}

	_acceptActiveEditorAndVisibleEditors(id: string, visibleIds: string[]): void {
		this._visibleEditorIds = visibleIds;

		if (this._activeEditorId === id) {
			// nothing to do
			return;
		}
		this._activeEditorId = id;
		this._onDidChangeActiveTextEditor.fire(this.getActiveTextEditor());
	}

	_acceptEditorPositionData(data: ITextEditorPositionData): void {
		for (let id in data) {
			let textEditor = this._editors[id];
			let viewColumn = TypeConverters.toViewColumn(data[id]);
			if (textEditor.viewColumn !== viewColumn) {
				textEditor._acceptViewColumn(viewColumn);
				this._onDidChangeTextEditorViewColumn.fire({ textEditor, viewColumn });
			}
		}
	}

	_acceptTextEditorRemove(id: string): void {
		// make sure the removed editor is not visible
		let newVisibleEditors = this._visibleEditorIds.filter(visibleEditorId => visibleEditorId !== id);

		if (this._activeEditorId === id) {
			// removing the current active editor
			this._acceptActiveEditorAndVisibleEditors(undefined, newVisibleEditors);
		} else {
			this._acceptActiveEditorAndVisibleEditors(this._activeEditorId, newVisibleEditors);
		}

		let editor = this._editors[id];
		editor.dispose();
		delete this._editors[id];
	}
}

class TextEditorDecorationType implements vscode.TextEditorDecorationType {

	private static _Keys = new IdGenerator('TextEditorDecorationType');

	private _proxy: MainThreadEditorsShape;
	public key: string;

	constructor(proxy: MainThreadEditorsShape, options: vscode.DecorationRenderOptions) {
		this.key = TextEditorDecorationType._Keys.nextId();
		this._proxy = proxy;
		this._proxy._registerTextEditorDecorationType(this.key, <any>options);
	}

	public dispose(): void {
		this._proxy._removeTextEditorDecorationType(this.key);
	}
}

export interface ITextEditOperation {
	range: Range;
	text: string;
	forceMoveMarkers: boolean;
}

export interface IEditData {
	documentVersionId: number;
	edits: ITextEditOperation[];
	setEndOfLine: EndOfLine;
}

export class TextEditorEdit {

	private _documentVersionId: number;
	private _collectedEdits: ITextEditOperation[];
	private _setEndOfLine: EndOfLine;

	constructor(document: vscode.TextDocument) {
		this._documentVersionId = document.version;
		this._collectedEdits = [];
		this._setEndOfLine = 0;
	}

	finalize(): IEditData {
		return {
			documentVersionId: this._documentVersionId,
			edits: this._collectedEdits,
			setEndOfLine: this._setEndOfLine
		};
	}

	replace(location: Position | Range | Selection, value: string): void {
		let range: Range = null;

		if (location instanceof Position) {
			range = new Range(location, location);
		} else if (location instanceof Range) {
			range = location;
		} else if (location instanceof Selection) {
			range = new Range(location.start, location.end);
		} else {
			throw new Error('Unrecognized location');
		}

		this._collectedEdits.push({
			range: range,
			text: value,
			forceMoveMarkers: false
		});
	}

	insert(location: Position, value: string): void {
		this._collectedEdits.push({
			range: new Range(location, location),
			text: value,
			forceMoveMarkers: true
		});
	}

	delete(location: Range | Selection): void {
		let range: Range = null;

		if (location instanceof Range) {
			range = location;
		} else if (location instanceof Selection) {
			range = new Range(location.start, location.end);
		} else {
			throw new Error('Unrecognized location');
		}

		this._collectedEdits.push({
			range: range,
			text: null,
			forceMoveMarkers: true
		});
	}

	setEndOfLine(endOfLine:EndOfLine): void {
		if (endOfLine !== EndOfLine.LF && endOfLine !== EndOfLine.CRLF) {
			throw illegalArgument('endOfLine');
		}

		this._setEndOfLine = endOfLine;
	}
}


function deprecated(name: string, message: string = 'Refer to the documentation for further details.') {
	return (target: Object, key: string, descriptor: TypedPropertyDescriptor<any>) => {
		const originalMethod = descriptor.value;
		descriptor.value = function(...args: any[]) {
			console.warn(`[Deprecation Warning] method '${name}' is deprecated and should no longer be used. ${message}`);
			return originalMethod.apply(this, args);
		};

		return descriptor;
	};
}

class ExtHostTextEditor implements vscode.TextEditor {

	private _proxy: MainThreadEditorsShape;
	private _id: string;

	private _documentData: ExtHostDocumentData;
	private _selections: Selection[];
	private _options: TextEditorOptions;
	private _viewColumn: vscode.ViewColumn;

	constructor(proxy: MainThreadEditorsShape, id: string, document: ExtHostDocumentData, selections: Selection[], options: EditorOptions, viewColumn: vscode.ViewColumn) {
		this._proxy = proxy;
		this._id = id;
		this._documentData = document;
		this._selections = selections;
		this._options = options;
		this._viewColumn = viewColumn;
	}

	dispose() {
		this._documentData = null;
	}

	@deprecated('TextEditor.show') show(column: vscode.ViewColumn) {
		this._proxy._tryShowEditor(this._id, TypeConverters.fromViewColumn(column));
	}

	@deprecated('TextEditor.hide') hide() {
		this._proxy._tryHideEditor(this._id);
	}

	// ---- the document

	get document(): vscode.TextDocument {
		return this._documentData.document;
	}

	set document(value) {
		throw readonly('document');
	}

	// ---- options

	get options(): TextEditorOptions {
		return this._options;
	}

	set options(value: TextEditorOptions) {
		this._options = value;
		this._runOnProxy(() => {
			return this._proxy._trySetOptions(this._id, this._options);
		}, true);
	}

	_acceptOptions(options: EditorOptions): void {
		this._options = options;
	}

	// ---- view column

	get viewColumn(): vscode.ViewColumn {
		return this._viewColumn;
	}

	set viewColumn(value) {
		throw readonly('viewColumn');
	}

	_acceptViewColumn(value: vscode.ViewColumn) {
		this._viewColumn = value;
	}

	// ---- selections

	get selection(): Selection {
		return this._selections && this._selections[0];
	}

	set selection(value: Selection) {
		if (!(value instanceof Selection)) {
			throw illegalArgument('selection');
		}
		this._selections = [value];
		this._trySetSelection(true);
	}

	get selections(): Selection[] {
		return this._selections;
	}

	set selections(value: Selection[]) {
		if (!Array.isArray(value) || value.some(a => !(a instanceof Selection))) {
			throw illegalArgument('selections');
		}
		this._selections = value;
		this._trySetSelection(true);
	}

	setDecorations(decorationType: vscode.TextEditorDecorationType, ranges: Range[] | vscode.DecorationOptions[]): void {
		this._runOnProxy(
			() => this._proxy._trySetDecorations(
				this._id,
				decorationType.key,
				TypeConverters.fromRangeOrRangeWithMessage(ranges)
			),
			true
		);
	}

	revealRange(range: Range, revealType: vscode.TextEditorRevealType): void {
		this._runOnProxy(
			() => this._proxy._tryRevealRange(
				this._id,
				TypeConverters.fromRange(range),
				revealType || TextEditorRevealType.Default
			),
			true
		);
	}

	private _trySetSelection(silent: boolean): TPromise<vscode.TextEditor> {
		let selection = this._selections.map(TypeConverters.fromSelection);
		return this._runOnProxy(() => this._proxy._trySetSelections(this._id, selection), silent);
	}

	_acceptSelections(selections: Selection[]): void {
		this._selections = selections;
	}

	// ---- editing

	edit(callback: (edit: TextEditorEdit) => void): Thenable<boolean> {
		let edit = new TextEditorEdit(this._documentData.document);
		callback(edit);
		return this._applyEdit(edit);
	}

	_applyEdit(editBuilder: TextEditorEdit): TPromise<boolean> {
		let editData = editBuilder.finalize();

		// prepare data for serialization
		let edits: ISingleEditOperation[] = editData.edits.map((edit) => {
			return {
				range: TypeConverters.fromRange(edit.range),
				text: edit.text,
				forceMoveMarkers: edit.forceMoveMarkers
			};
		});

		return this._proxy._tryApplyEdits(this._id, editData.documentVersionId, edits, editData.setEndOfLine);
	}

	// ---- util

	private _runOnProxy(callback: () => TPromise<any>, silent: boolean): TPromise<ExtHostTextEditor> {
		return callback().then(() => this, err => {
			if (!silent) {
				return TPromise.wrapError(silent);
			}
			console.warn(err);
		});
	}
}
