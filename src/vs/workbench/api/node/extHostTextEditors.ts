/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { ExtHostEditorsShape, IEditorPropertiesChangeData, IMainContext, ITextDocumentShowOptions, ITextEditorPositionData, MainContext, MainThreadTextEditorsShape } from 'vs/workbench/api/node/extHost.protocol';
import { ExtHostDocumentsAndEditors } from 'vs/workbench/api/node/extHostDocumentsAndEditors';
import { ExtHostTextEditor, TextEditorDecorationType } from 'vs/workbench/api/node/extHostTextEditor';
import * as TypeConverters from 'vs/workbench/api/node/extHostTypeConverters';
import { TextEditorSelectionChangeKind } from 'vs/workbench/api/node/extHostTypes';
import * as vscode from 'vscode';

export class ExtHostEditors implements ExtHostEditorsShape {

	private readonly _onDidChangeTextEditorSelection = new Emitter<vscode.TextEditorSelectionChangeEvent>();
	private readonly _onDidChangeTextEditorOptions = new Emitter<vscode.TextEditorOptionsChangeEvent>();
	private readonly _onDidChangeTextEditorVisibleRanges = new Emitter<vscode.TextEditorVisibleRangesChangeEvent>();
	private readonly _onDidChangeTextEditorViewColumn = new Emitter<vscode.TextEditorViewColumnChangeEvent>();
	private readonly _onDidChangeActiveTextEditor = new Emitter<vscode.TextEditor | undefined>();
	private readonly _onDidChangeVisibleTextEditors = new Emitter<vscode.TextEditor[]>();

	readonly onDidChangeTextEditorSelection: Event<vscode.TextEditorSelectionChangeEvent> = this._onDidChangeTextEditorSelection.event;
	readonly onDidChangeTextEditorOptions: Event<vscode.TextEditorOptionsChangeEvent> = this._onDidChangeTextEditorOptions.event;
	readonly onDidChangeTextEditorVisibleRanges: Event<vscode.TextEditorVisibleRangesChangeEvent> = this._onDidChangeTextEditorVisibleRanges.event;
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

	showTextDocument(document: vscode.TextDocument, column: vscode.ViewColumn, preserveFocus: boolean): Promise<vscode.TextEditor>;
	showTextDocument(document: vscode.TextDocument, options: { column: vscode.ViewColumn, preserveFocus: boolean, pinned: boolean }): Promise<vscode.TextEditor>;
	showTextDocument(document: vscode.TextDocument, columnOrOptions: vscode.ViewColumn | vscode.TextDocumentShowOptions, preserveFocus?: boolean): Promise<vscode.TextEditor>;
	showTextDocument(document: vscode.TextDocument, columnOrOptions: vscode.ViewColumn | vscode.TextDocumentShowOptions, preserveFocus?: boolean): Promise<vscode.TextEditor> {
		let options: ITextDocumentShowOptions;
		if (typeof columnOrOptions === 'number') {
			options = {
				position: TypeConverters.ViewColumn.from(columnOrOptions),
				preserveFocus
			};
		} else if (typeof columnOrOptions === 'object') {
			options = {
				position: TypeConverters.ViewColumn.from(columnOrOptions.viewColumn),
				preserveFocus: columnOrOptions.preserveFocus,
				selection: typeof columnOrOptions.selection === 'object' ? TypeConverters.Range.from(columnOrOptions.selection) : undefined,
				pinned: typeof columnOrOptions.preview === 'boolean' ? !columnOrOptions.preview : undefined
			};
		} else {
			options = {
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

	applyWorkspaceEdit(edit: vscode.WorkspaceEdit): Promise<boolean> {
		const dto = TypeConverters.WorkspaceEdit.from(edit, this._extHostDocumentsAndEditors);
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
			const selections = data.selections.selections.map(TypeConverters.Selection.to);
			textEditor._acceptSelections(selections);
		}
		if (data.visibleRanges) {
			const visibleRanges = data.visibleRanges.map(TypeConverters.Range.to);
			textEditor._acceptVisibleRanges(visibleRanges);
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
			const selections = data.selections.selections.map(TypeConverters.Selection.to);
			this._onDidChangeTextEditorSelection.fire({
				textEditor,
				selections,
				kind
			});
		}
		if (data.visibleRanges) {
			const visibleRanges = data.visibleRanges.map(TypeConverters.Range.to);
			this._onDidChangeTextEditorVisibleRanges.fire({
				textEditor,
				visibleRanges
			});
		}
	}

	$acceptEditorPositionData(data: ITextEditorPositionData): void {
		for (let id in data) {
			let textEditor = this._extHostDocumentsAndEditors.getEditor(id);
			let viewColumn = TypeConverters.ViewColumn.to(data[id]);
			if (textEditor.viewColumn !== viewColumn) {
				textEditor._acceptViewColumn(viewColumn);
				this._onDidChangeTextEditorViewColumn.fire({ textEditor, viewColumn });
			}
		}
	}

	getDiffInformation(id: string): Promise<vscode.LineChange[]> {
		return Promise.resolve(this._proxy.$getDiffInformation(id));
	}
}
