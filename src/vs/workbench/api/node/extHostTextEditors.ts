/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Event, { Emitter } from 'vs/base/common/event';
import { toThenable } from 'vs/base/common/async';
import { TPromise } from 'vs/base/common/winjs.base';
import { TextEditorSelectionChangeKind } from './extHostTypes';
import * as TypeConverters from './extHostTypeConverters';
import { TextEditorDecorationType, ExtHostTextEditor } from './extHostTextEditor';
import { ExtHostDocumentsAndEditors } from './extHostDocumentsAndEditors';
import { Position as EditorPosition } from 'vs/platform/editor/common/editor';
import { MainContext, MainThreadTextEditorsShape, ExtHostEditorsShape, ITextDocumentShowOptions, ITextEditorPositionData, IMainContext, WorkspaceEditDto, IEditorPropertiesChangeData } from './extHost.protocol';
import * as vscode from 'vscode';

export class ExtHostEditors implements ExtHostEditorsShape {

	private readonly _onDidChangeTextEditorSelection = new Emitter<vscode.TextEditorSelectionChangeEvent>();
	private readonly _onDidChangeTextEditorOptions = new Emitter<vscode.TextEditorOptionsChangeEvent>();
	private readonly _onDidChangeTextEditorViewColumn = new Emitter<vscode.TextEditorViewColumnChangeEvent>();
	private readonly _onDidChangeActiveTextEditor = new Emitter<vscode.TextEditor | undefined>();
	private readonly _onDidChangeVisibleTextEditors = new Emitter<vscode.TextEditor[]>();

	readonly onDidChangeTextEditorSelection: Event<vscode.TextEditorSelectionChangeEvent> = this._onDidChangeTextEditorSelection.event;
	readonly onDidChangeTextEditorOptions: Event<vscode.TextEditorOptionsChangeEvent> = this._onDidChangeTextEditorOptions.event;
	readonly onDidChangeTextEditorViewColumn: Event<vscode.TextEditorViewColumnChangeEvent> = this._onDidChangeTextEditorViewColumn.event;
	readonly onDidChangeActiveTextEditor: Event<vscode.TextEditor | undefined> = this._onDidChangeActiveTextEditor.event;
	readonly onDidChangeVisibleTextEditors: Event<vscode.TextEditor[]> = this._onDidChangeVisibleTextEditors.event;


	private _proxy: MainThreadTextEditorsShape;
	private _extHostDocumentsAndEditors: ExtHostDocumentsAndEditors;

	constructor(
		mainContext: IMainContext,
		extHostDocumentsAndEditors: ExtHostDocumentsAndEditors,
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadTextEditors);
		this._extHostDocumentsAndEditors = extHostDocumentsAndEditors;

		this._extHostDocumentsAndEditors.onDidChangeVisibleTextEditors(e => this._onDidChangeVisibleTextEditors.fire(e));
		this._extHostDocumentsAndEditors.onDidChangeActiveTextEditor(e => this._onDidChangeActiveTextEditor.fire(e));
	}

	getActiveTextEditor(): ExtHostTextEditor {
		return this._extHostDocumentsAndEditors.activeEditor();
	}

	getVisibleTextEditors(): vscode.TextEditor[] {
		return this._extHostDocumentsAndEditors.allEditors();
	}

	showTextDocument(document: vscode.TextDocument, column: vscode.ViewColumn, preserveFocus: boolean): TPromise<vscode.TextEditor>;
	showTextDocument(document: vscode.TextDocument, options: { column: vscode.ViewColumn, preserveFocus: boolean, pinned: boolean }): TPromise<vscode.TextEditor>;
	showTextDocument(document: vscode.TextDocument, columnOrOptions: vscode.ViewColumn | vscode.TextDocumentShowOptions, preserveFocus?: boolean): TPromise<vscode.TextEditor>;
	showTextDocument(document: vscode.TextDocument, columnOrOptions: vscode.ViewColumn | vscode.TextDocumentShowOptions, preserveFocus?: boolean): TPromise<vscode.TextEditor> {
		let options: ITextDocumentShowOptions;
		if (typeof columnOrOptions === 'number') {
			options = {
				position: TypeConverters.fromViewColumn(columnOrOptions),
				preserveFocus
			};
		} else if (typeof columnOrOptions === 'object') {
			options = {
				position: TypeConverters.fromViewColumn(columnOrOptions.viewColumn),
				preserveFocus: columnOrOptions.preserveFocus,
				selection: typeof columnOrOptions.selection === 'object' ? TypeConverters.fromRange(columnOrOptions.selection) : undefined,
				pinned: typeof columnOrOptions.preview === 'boolean' ? !columnOrOptions.preview : undefined
			};
		} else {
			options = {
				position: EditorPosition.ONE,
				preserveFocus: false
			};
		}

		return this._proxy.$tryShowTextDocument(document.uri, options).then(id => {
			let editor = this._extHostDocumentsAndEditors.getEditor(id);
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

	applyWorkspaceEdit(edit: vscode.WorkspaceEdit): TPromise<boolean> {

		const dto: WorkspaceEditDto = { edits: [] };

		for (let entry of edit.entries()) {
			let [uri, uriOrEdits] = entry;
			if (Array.isArray(uriOrEdits)) {
				let doc = this._extHostDocumentsAndEditors.getDocument(uri.toString());
				dto.edits.push({
					resource: uri,
					modelVersionId: doc && doc.version,
					edits: uriOrEdits.map(TypeConverters.TextEdit.from)
				});
				// } else {
				// 	dto.edits.push({ oldUri: uri, newUri: uriOrEdits });
			}
		}

		return this._proxy.$tryApplyWorkspaceEdit(dto);
	}

	// --- called from main thread

	$acceptEditorPropertiesChanged(id: string, data: IEditorPropertiesChangeData): void {
		const textEditor = this._extHostDocumentsAndEditors.getEditor(id);

		// (1) set all properties
		if (data.options) {
			textEditor._acceptOptions(data.options);
		}
		if (data.selections) {
			const selections = data.selections.selections.map(TypeConverters.toSelection);
			textEditor._acceptSelections(selections);
		}

		// (2) fire change events
		if (data.options) {
			this._onDidChangeTextEditorOptions.fire({
				textEditor: textEditor,
				options: data.options
			});
		}
		if (data.selections) {
			const kind = TextEditorSelectionChangeKind.fromValue(data.selections.source);
			const selections = data.selections.selections.map(TypeConverters.toSelection);
			this._onDidChangeTextEditorSelection.fire({
				textEditor,
				selections,
				kind
			});
		}
	}

	$acceptEditorPositionData(data: ITextEditorPositionData): void {
		for (let id in data) {
			let textEditor = this._extHostDocumentsAndEditors.getEditor(id);
			let viewColumn = TypeConverters.toViewColumn(data[id]);
			if (textEditor.viewColumn !== viewColumn) {
				textEditor._acceptViewColumn(viewColumn);
				this._onDidChangeTextEditorViewColumn.fire({ textEditor, viewColumn });
			}
		}
	}

	getDiffInformation(id: string): Thenable<vscode.LineChange[]> {
		return toThenable(this._proxy.$getDiffInformation(id));
	}
}
