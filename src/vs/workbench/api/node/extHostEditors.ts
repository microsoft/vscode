/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import { readonly, illegalArgument } from 'vs/base/common/errors';
import { equals as arrayEquals } from 'vs/base/common/arrays';
import { IdGenerator } from 'vs/base/common/idGenerator';
import Event, { Emitter } from 'vs/base/common/event';
import { TPromise } from 'vs/base/common/winjs.base';
import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import { ExtHostDocuments, ExtHostDocumentData } from 'vs/workbench/api/node/extHostDocuments';
import { Selection, Range, Position, EndOfLine, TextEditorRevealType, TextEditorSelectionChangeKind, TextEditorLineNumbersStyle, SnippetString } from './extHostTypes';
import { ISingleEditOperation, TextEditorCursorStyle, IRange } from 'vs/editor/common/editorCommon';
import { IResolvedTextEditorConfiguration, ISelectionChangeEvent, ITextEditorConfigurationUpdate } from 'vs/workbench/api/node/mainThreadEditorsTracker';
import * as TypeConverters from './extHostTypeConverters';
import { MainContext, MainThreadEditorsShape, ExtHostEditorsShape, ITextEditorAddData, ITextEditorPositionData } from './extHost.protocol';
import * as vscode from 'vscode';

export class ExtHostEditors extends ExtHostEditorsShape {

	public onDidChangeTextEditorSelection: Event<vscode.TextEditorSelectionChangeEvent>;
	private _onDidChangeTextEditorSelection: Emitter<vscode.TextEditorSelectionChangeEvent>;

	public onDidChangeTextEditorOptions: Event<vscode.TextEditorOptionsChangeEvent>;
	private _onDidChangeTextEditorOptions: Emitter<vscode.TextEditorOptionsChangeEvent>;

	public onDidChangeTextEditorViewColumn: Event<vscode.TextEditorViewColumnChangeEvent>;
	private _onDidChangeTextEditorViewColumn: Emitter<vscode.TextEditorViewColumnChangeEvent>;

	private _editors: Map<string, ExtHostTextEditor>;
	private _proxy: MainThreadEditorsShape;
	private _onDidChangeActiveTextEditor: Emitter<vscode.TextEditor>;
	private _onDidChangeVisibleTextEditors: Emitter<vscode.TextEditor[]>;
	private _extHostDocuments: ExtHostDocuments;
	private _activeEditorId: string;
	private _visibleEditorIds: string[];

	constructor(
		threadService: IThreadService,
		extHostDocuments: ExtHostDocuments
	) {
		super();
		this._onDidChangeTextEditorSelection = new Emitter<vscode.TextEditorSelectionChangeEvent>();
		this.onDidChangeTextEditorSelection = this._onDidChangeTextEditorSelection.event;

		this._onDidChangeTextEditorOptions = new Emitter<vscode.TextEditorOptionsChangeEvent>();
		this.onDidChangeTextEditorOptions = this._onDidChangeTextEditorOptions.event;

		this._onDidChangeTextEditorViewColumn = new Emitter<vscode.TextEditorViewColumnChangeEvent>();
		this.onDidChangeTextEditorViewColumn = this._onDidChangeTextEditorViewColumn.event;

		this._extHostDocuments = extHostDocuments;
		this._proxy = threadService.get(MainContext.MainThreadEditors);
		this._onDidChangeActiveTextEditor = new Emitter<vscode.TextEditor>();
		this._onDidChangeVisibleTextEditors = new Emitter<vscode.TextEditor[]>();
		this._editors = new Map<string, ExtHostTextEditor>();

		this._visibleEditorIds = [];
	}

	getActiveTextEditor(): vscode.TextEditor {
		return this._editors.get(this._activeEditorId);
	}

	getVisibleTextEditors(): vscode.TextEditor[] {
		return this._visibleEditorIds.map(id => this._editors.get(id));
	}

	get onDidChangeActiveTextEditor(): Event<vscode.TextEditor> {
		return this._onDidChangeActiveTextEditor && this._onDidChangeActiveTextEditor.event;
	}

	get onDidChangeVisibleTextEditors(): Event<vscode.TextEditor[]> {
		return this._onDidChangeVisibleTextEditors && this._onDidChangeVisibleTextEditors.event;
	}

	showTextDocument(document: vscode.TextDocument, column: vscode.ViewColumn, preserveFocus: boolean): TPromise<vscode.TextEditor> {
		return this._proxy.$tryShowTextDocument(<URI>document.uri, TypeConverters.fromViewColumn(column), preserveFocus).then(id => {
			let editor = this._editors.get(id);
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

	$acceptTextEditorAdd(data: ITextEditorAddData): void {
		let document = this._extHostDocuments.getDocumentData(data.document);
		let newEditor = new ExtHostTextEditor(this._proxy, data.id, document, data.selections.map(TypeConverters.toSelection), data.options, TypeConverters.toViewColumn(data.editorPosition));
		this._editors.set(data.id, newEditor);
	}

	$acceptOptionsChanged(id: string, opts: IResolvedTextEditorConfiguration): void {
		let editor = this._editors.get(id);
		editor._acceptOptions(opts);
		this._onDidChangeTextEditorOptions.fire({
			textEditor: editor,
			options: opts
		});
	}

	$acceptSelectionsChanged(id: string, event: ISelectionChangeEvent): void {
		const kind = TextEditorSelectionChangeKind.fromValue(event.source);
		const selections = event.selections.map(TypeConverters.toSelection);
		const textEditor = this._editors.get(id);
		textEditor._acceptSelections(selections);
		this._onDidChangeTextEditorSelection.fire({
			textEditor,
			selections,
			kind
		});
	}

	$acceptActiveEditorAndVisibleEditors(id: string, visibleIds: string[]): void {
		let visibleChanged = false;
		let activeChanged = false;

		if (!arrayEquals(this._visibleEditorIds, visibleIds)) {
			this._visibleEditorIds = visibleIds;
			visibleChanged = true;
		}

		if (this._activeEditorId !== id) {
			this._activeEditorId = id;
			activeChanged = true;
		}

		if (visibleChanged) {
			this._onDidChangeVisibleTextEditors.fire(this.getVisibleTextEditors());
		}
		if (activeChanged) {
			this._onDidChangeActiveTextEditor.fire(this.getActiveTextEditor());
		}
	}

	$acceptEditorPositionData(data: ITextEditorPositionData): void {
		for (let id in data) {
			let textEditor = this._editors.get(id);
			let viewColumn = TypeConverters.toViewColumn(data[id]);
			if (textEditor.viewColumn !== viewColumn) {
				textEditor._acceptViewColumn(viewColumn);
				this._onDidChangeTextEditorViewColumn.fire({ textEditor, viewColumn });
			}
		}
	}

	$acceptTextEditorRemove(id: string): void {
		// make sure the removed editor is not visible
		let newVisibleEditors = this._visibleEditorIds.filter(visibleEditorId => visibleEditorId !== id);

		if (this._activeEditorId === id) {
			// removing the current active editor
			this.$acceptActiveEditorAndVisibleEditors(undefined, newVisibleEditors);
		} else {
			this.$acceptActiveEditorAndVisibleEditors(this._activeEditorId, newVisibleEditors);
		}

		let editor = this._editors.get(id);
		editor.dispose();
		this._editors.delete(id);
	}
}

class TextEditorDecorationType implements vscode.TextEditorDecorationType {

	private static _Keys = new IdGenerator('TextEditorDecorationType');

	private _proxy: MainThreadEditorsShape;
	public key: string;

	constructor(proxy: MainThreadEditorsShape, options: vscode.DecorationRenderOptions) {
		this.key = TextEditorDecorationType._Keys.nextId();
		this._proxy = proxy;
		this._proxy.$registerTextEditorDecorationType(this.key, <any>/* URI vs Uri */ options);
	}

	public dispose(): void {
		this._proxy.$removeTextEditorDecorationType(this.key);
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
	undoStopBefore: boolean;
	undoStopAfter: boolean;
}

export class TextEditorEdit {

	private _documentVersionId: number;
	private _collectedEdits: ITextEditOperation[];
	private _setEndOfLine: EndOfLine;
	private _undoStopBefore: boolean;
	private _undoStopAfter: boolean;

	constructor(document: vscode.TextDocument, options: { undoStopBefore: boolean; undoStopAfter: boolean; }) {
		this._documentVersionId = document.version;
		this._collectedEdits = [];
		this._setEndOfLine = 0;
		this._undoStopBefore = options.undoStopBefore;
		this._undoStopAfter = options.undoStopAfter;
	}

	finalize(): IEditData {
		return {
			documentVersionId: this._documentVersionId,
			edits: this._collectedEdits,
			setEndOfLine: this._setEndOfLine,
			undoStopBefore: this._undoStopBefore,
			undoStopAfter: this._undoStopAfter
		};
	}

	replace(location: Position | Range | Selection, value: string): void {
		let range: Range = null;

		if (location instanceof Position) {
			range = new Range(location, location);
		} else if (location instanceof Range) {
			range = location;
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
		} else {
			throw new Error('Unrecognized location');
		}

		this._collectedEdits.push({
			range: range,
			text: null,
			forceMoveMarkers: true
		});
	}

	setEndOfLine(endOfLine: EndOfLine): void {
		if (endOfLine !== EndOfLine.LF && endOfLine !== EndOfLine.CRLF) {
			throw illegalArgument('endOfLine');
		}

		this._setEndOfLine = endOfLine;
	}
}


function deprecated(name: string, message: string = 'Refer to the documentation for further details.') {
	return (target: Object, key: string, descriptor: TypedPropertyDescriptor<any>) => {
		const originalMethod = descriptor.value;
		descriptor.value = function (...args: any[]) {
			console.warn(`[Deprecation Warning] method '${name}' is deprecated and should no longer be used. ${message}`);
			return originalMethod.apply(this, args);
		};

		return descriptor;
	};
}

export class ExtHostTextEditorOptions implements vscode.TextEditorOptions {

	private _proxy: MainThreadEditorsShape;
	private _id: string;

	private _tabSize: number;
	private _insertSpaces: boolean;
	private _cursorStyle: TextEditorCursorStyle;
	private _lineNumbers: TextEditorLineNumbersStyle;

	constructor(proxy: MainThreadEditorsShape, id: string, source: IResolvedTextEditorConfiguration) {
		this._proxy = proxy;
		this._id = id;
		this._accept(source);
	}

	public _accept(source: IResolvedTextEditorConfiguration): void {
		this._tabSize = source.tabSize;
		this._insertSpaces = source.insertSpaces;
		this._cursorStyle = source.cursorStyle;
		this._lineNumbers = source.lineNumbers;
	}

	public get tabSize(): number | string {
		return this._tabSize;
	}

	private _validateTabSize(value: number | string): number | 'auto' | null {
		if (value === 'auto') {
			return 'auto';
		}
		if (typeof value === 'number') {
			let r = Math.floor(value);
			return (r > 0 ? r : null);
		}
		if (typeof value === 'string') {
			let r = parseInt(value, 10);
			if (isNaN(r)) {
				return null;
			}
			return (r > 0 ? r : null);
		}
		return null;
	}

	public set tabSize(value: number | string) {
		let tabSize = this._validateTabSize(value);
		if (tabSize === null) {
			// ignore invalid call
			return;
		}
		if (typeof tabSize === 'number') {
			if (this._tabSize === tabSize) {
				// nothing to do
				return;
			}
			// reflect the new tabSize value immediately
			this._tabSize = tabSize;
		}
		warnOnError(this._proxy.$trySetOptions(this._id, {
			tabSize: tabSize
		}));
	}

	public get insertSpaces(): boolean | string {
		return this._insertSpaces;
	}

	private _validateInsertSpaces(value: boolean | string): boolean | 'auto' {
		if (value === 'auto') {
			return 'auto';
		}
		return (value === 'false' ? false : Boolean(value));
	}

	public set insertSpaces(value: boolean | string) {
		let insertSpaces = this._validateInsertSpaces(value);
		if (typeof insertSpaces === 'boolean') {
			if (this._insertSpaces === insertSpaces) {
				// nothing to do
				return;
			}
			// reflect the new insertSpaces value immediately
			this._insertSpaces = insertSpaces;
		}
		warnOnError(this._proxy.$trySetOptions(this._id, {
			insertSpaces: insertSpaces
		}));
	}

	public get cursorStyle(): TextEditorCursorStyle {
		return this._cursorStyle;
	}

	public set cursorStyle(value: TextEditorCursorStyle) {
		if (this._cursorStyle === value) {
			// nothing to do
			return;
		}
		this._cursorStyle = value;
		warnOnError(this._proxy.$trySetOptions(this._id, {
			cursorStyle: value
		}));
	}

	public get lineNumbers(): TextEditorLineNumbersStyle {
		return this._lineNumbers;
	}

	public set lineNumbers(value: TextEditorLineNumbersStyle) {
		if (this._lineNumbers === value) {
			// nothing to do
			return;
		}
		this._lineNumbers = value;
		warnOnError(this._proxy.$trySetOptions(this._id, {
			lineNumbers: value
		}));
	}

	public assign(newOptions: vscode.TextEditorOptions) {
		let bulkConfigurationUpdate: ITextEditorConfigurationUpdate = {};
		let hasUpdate = false;

		if (typeof newOptions.tabSize !== 'undefined') {
			let tabSize = this._validateTabSize(newOptions.tabSize);
			if (tabSize === 'auto') {
				hasUpdate = true;
				bulkConfigurationUpdate.tabSize = tabSize;
			} else if (typeof tabSize === 'number' && this._tabSize !== tabSize) {
				// reflect the new tabSize value immediately
				this._tabSize = tabSize;
				hasUpdate = true;
				bulkConfigurationUpdate.tabSize = tabSize;
			}
		}

		if (typeof newOptions.insertSpaces !== 'undefined') {
			let insertSpaces = this._validateInsertSpaces(newOptions.insertSpaces);
			if (insertSpaces === 'auto') {
				hasUpdate = true;
				bulkConfigurationUpdate.insertSpaces = insertSpaces;
			} else if (this._insertSpaces !== insertSpaces) {
				// reflect the new insertSpaces value immediately
				this._insertSpaces = insertSpaces;
				hasUpdate = true;
				bulkConfigurationUpdate.insertSpaces = insertSpaces;
			}
		}

		if (typeof newOptions.cursorStyle !== 'undefined') {
			if (this._cursorStyle !== newOptions.cursorStyle) {
				this._cursorStyle = newOptions.cursorStyle;
				hasUpdate = true;
				bulkConfigurationUpdate.cursorStyle = newOptions.cursorStyle;
			}
		}

		if (typeof newOptions.lineNumbers !== 'undefined') {
			if (this._lineNumbers !== newOptions.lineNumbers) {
				this._lineNumbers = newOptions.lineNumbers;
				hasUpdate = true;
				bulkConfigurationUpdate.lineNumbers = newOptions.lineNumbers;
			}
		}

		if (hasUpdate) {
			warnOnError(this._proxy.$trySetOptions(this._id, bulkConfigurationUpdate));
		}
	}


}

class ExtHostTextEditor implements vscode.TextEditor {

	private _proxy: MainThreadEditorsShape;
	private _id: string;

	private _documentData: ExtHostDocumentData;
	private _selections: Selection[];
	private _options: ExtHostTextEditorOptions;
	private _viewColumn: vscode.ViewColumn;

	constructor(proxy: MainThreadEditorsShape, id: string, document: ExtHostDocumentData, selections: Selection[], options: IResolvedTextEditorConfiguration, viewColumn: vscode.ViewColumn) {
		this._proxy = proxy;
		this._id = id;
		this._documentData = document;
		this._selections = selections;
		this._options = new ExtHostTextEditorOptions(this._proxy, this._id, options);
		this._viewColumn = viewColumn;
	}

	dispose() {
		this._documentData = null;
	}

	@deprecated('TextEditor.show') show(column: vscode.ViewColumn) {
		this._proxy.$tryShowEditor(this._id, TypeConverters.fromViewColumn(column));
	}

	@deprecated('TextEditor.hide') hide() {
		this._proxy.$tryHideEditor(this._id);
	}

	// ---- the document

	get document(): vscode.TextDocument {
		return this._documentData.document;
	}

	set document(value) {
		throw readonly('document');
	}

	// ---- options

	get options(): vscode.TextEditorOptions {
		return this._options;
	}

	set options(value: vscode.TextEditorOptions) {
		this._options.assign(value);
	}

	_acceptOptions(options: IResolvedTextEditorConfiguration): void {
		this._options._accept(options);
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
			() => this._proxy.$trySetDecorations(
				this._id,
				decorationType.key,
				TypeConverters.fromRangeOrRangeWithMessage(ranges)
			),
			true
		);
	}

	revealRange(range: Range, revealType: vscode.TextEditorRevealType): void {
		this._runOnProxy(
			() => this._proxy.$tryRevealRange(
				this._id,
				TypeConverters.fromRange(range),
				(revealType || TextEditorRevealType.Default)
			),
			true
		);
	}

	private _trySetSelection(silent: boolean): TPromise<vscode.TextEditor> {
		let selection = this._selections.map(TypeConverters.fromSelection);
		return this._runOnProxy(() => this._proxy.$trySetSelections(this._id, selection), silent);
	}

	_acceptSelections(selections: Selection[]): void {
		this._selections = selections;
	}

	// ---- editing

	edit(callback: (edit: TextEditorEdit) => void, options: { undoStopBefore: boolean; undoStopAfter: boolean; } = { undoStopBefore: true, undoStopAfter: true }): Thenable<boolean> {
		let edit = new TextEditorEdit(this._documentData.document, options);
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

		return this._proxy.$tryApplyEdits(this._id, editData.documentVersionId, edits, {
			setEndOfLine: editData.setEndOfLine,
			undoStopBefore: editData.undoStopBefore,
			undoStopAfter: editData.undoStopAfter
		});
	}

	insertSnippet(snippet: SnippetString, where?: Position | Position[] | Range | Range[], options: { undoStopBefore: boolean; undoStopAfter: boolean; } = { undoStopBefore: true, undoStopAfter: true }): Thenable<boolean> {

		let ranges: IRange[];

		if (!where || (Array.isArray(where) && where.length === 0)) {
			ranges = this._selections.map(TypeConverters.fromRange);

		} else if (where instanceof Position) {
			const {lineNumber, column} = TypeConverters.fromPosition(where);
			ranges = [{ startLineNumber: lineNumber, startColumn: column, endLineNumber: lineNumber, endColumn: column }];

		} else if (where instanceof Range) {
			ranges = [TypeConverters.fromRange(where)];
		} else {
			ranges = [];
			for (const posOrRange of where) {
				if (posOrRange instanceof Range) {
					ranges.push(TypeConverters.fromRange(posOrRange));
				} else {
					const {lineNumber, column} = TypeConverters.fromPosition(posOrRange);
					ranges.push({ startLineNumber: lineNumber, startColumn: column, endLineNumber: lineNumber, endColumn: column });
				}
			}
		}

		return this._proxy.$tryInsertSnippet(this._id, snippet.value, ranges, options);
	}

	// ---- util

	private _runOnProxy(callback: () => TPromise<any>, silent: boolean): TPromise<ExtHostTextEditor> {
		return callback().then(() => this, err => {
			if (!silent) {
				return TPromise.wrapError(silent);
			}
			console.warn(err);
			return undefined;
		});
	}
}

function warnOnError(promise: TPromise<any>): void {
	promise.then(null, (err) => {
		console.warn(err);
	});
}
