/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import Event, { Emitter } from 'vs/base/common/event';
import { toThenable } from 'vs/base/common/async';
import { TPromise } from 'vs/base/common/winjs.base';
import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import { TextEditorSelectionChangeKind } from './extHostTypes';
import { IResolvedTextEditorConfiguration, ISelectionChangeEvent } from 'vs/workbench/api/node/mainThreadEditor';
import * as TypeConverters from './extHostTypeConverters';
import { TextEditorDecorationType, ExtHostTextEditor } from './extHostTextEditor';
import { ExtHostDocumentsAndEditors } from './extHostDocumentsAndEditors';
import { MainContext, MainThreadEditorsShape, ExtHostEditorsShape, ITextEditorPositionData } from './extHost.protocol';
import * as vscode from 'vscode';

export class ExtHostEditors extends ExtHostEditorsShape {

	private readonly _onDidChangeTextEditorSelection = new Emitter<vscode.TextEditorSelectionChangeEvent>();
	private readonly _onDidChangeTextEditorOptions = new Emitter<vscode.TextEditorOptionsChangeEvent>();
	private readonly _onDidChangeTextEditorViewColumn = new Emitter<vscode.TextEditorViewColumnChangeEvent>();
	private readonly _onDidChangeActiveTextEditor = new Emitter<vscode.TextEditor>();
	private readonly _onDidChangeVisibleTextEditors = new Emitter<vscode.TextEditor[]>();

	readonly onDidChangeTextEditorSelection: Event<vscode.TextEditorSelectionChangeEvent> = this._onDidChangeTextEditorSelection.event;
	readonly onDidChangeTextEditorOptions: Event<vscode.TextEditorOptionsChangeEvent> = this._onDidChangeTextEditorOptions.event;
	readonly onDidChangeTextEditorViewColumn: Event<vscode.TextEditorViewColumnChangeEvent> = this._onDidChangeTextEditorViewColumn.event;
	readonly onDidChangeActiveTextEditor: Event<vscode.TextEditor> = this._onDidChangeActiveTextEditor.event;
	readonly onDidChangeVisibleTextEditors: Event<vscode.TextEditor[]> = this._onDidChangeVisibleTextEditors.event;


	private _proxy: MainThreadEditorsShape;
	private _extHostDocumentsAndEditors: ExtHostDocumentsAndEditors;

	constructor(
		threadService: IThreadService,
		extHostDocumentsAndEditors: ExtHostDocumentsAndEditors,
	) {
		super();
		this._proxy = threadService.get(MainContext.MainThreadEditors);
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

	showTextDocument(document: vscode.TextDocument, column: vscode.ViewColumn, preserveFocus: boolean): TPromise<vscode.TextEditor> {
		return this._proxy.$tryShowTextDocument(<URI>document.uri, TypeConverters.fromViewColumn(column), preserveFocus).then(id => {
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

	// --- called from main thread

	$acceptOptionsChanged(id: string, opts: IResolvedTextEditorConfiguration): void {
		let editor = this._extHostDocumentsAndEditors.getEditor(id);
		editor._acceptOptions(opts);
		this._onDidChangeTextEditorOptions.fire({
			textEditor: editor,
			options: opts
		});
	}

	$acceptSelectionsChanged(id: string, event: ISelectionChangeEvent): void {
		const kind = TextEditorSelectionChangeKind.fromValue(event.source);
		const selections = event.selections.map(TypeConverters.toSelection);
		const textEditor = this._extHostDocumentsAndEditors.getEditor(id);
		textEditor._acceptSelections(selections);
		this._onDidChangeTextEditorSelection.fire({
			textEditor,
			selections,
			kind
		});
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
