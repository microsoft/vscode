/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { illegalArgument } from 'vs/base/common/errors';
import { MainThreadNotebookEditorsShape } from 'vs/workbench/api/common/extHost.protocol';
import * as extHostConverter from 'vs/workbench/api/common/extHostTypeConverters';
import * as extHostTypes from 'vs/workbench/api/common/extHostTypes';
import * as vscode from 'vscode';
import { ExtHostNotebookDocument } from './extHostNotebookDocument';

export class ExtHostNotebookEditor {

	public static readonly apiEditorsToExtHost = new WeakMap<vscode.NotebookEditor, ExtHostNotebookEditor>();

	private _selections: vscode.NotebookRange[] = [];
	private _visibleRanges: vscode.NotebookRange[] = [];
	private _viewColumn?: vscode.ViewColumn;

	private _visible: boolean = false;

	private _editor?: vscode.NotebookEditor;

	constructor(
		readonly id: string,
		private readonly _proxy: MainThreadNotebookEditorsShape,
		readonly notebookData: ExtHostNotebookDocument,
		visibleRanges: vscode.NotebookRange[],
		selections: vscode.NotebookRange[],
		viewColumn: vscode.ViewColumn | undefined
	) {
		this._selections = selections;
		this._visibleRanges = visibleRanges;
		this._viewColumn = viewColumn;
	}

	get apiEditor(): vscode.NotebookEditor {
		if (!this._editor) {
			const that = this;
			this._editor = {
				get notebook() {
					return that.notebookData.apiNotebook;
				},
				get selection() {
					return that._selections[0];
				},
				set selection(selection: vscode.NotebookRange) {
					this.selections = [selection];
				},
				get selections() {
					return that._selections;
				},
				set selections(value: vscode.NotebookRange[]) {
					if (!Array.isArray(value) || !value.every(extHostTypes.NotebookRange.isNotebookRange)) {
						throw illegalArgument('selections');
					}
					that._selections = value;
					that._trySetSelections(value);
				},
				get visibleRanges() {
					return that._visibleRanges;
				},
				revealRange(range, revealType) {
					that._proxy.$tryRevealRange(
						that.id,
						extHostConverter.NotebookRange.from(range),
						revealType ?? extHostTypes.NotebookEditorRevealType.Default
					);
				},
				get viewColumn() {
					return that._viewColumn;
				},
				[Symbol.for('debug.description')]() {
					return `NotebookEditor(${this.notebook.uri.toString()})`;
				}
			};

			ExtHostNotebookEditor.apiEditorsToExtHost.set(this._editor, this);
		}
		return this._editor;
	}

	get visible(): boolean {
		return this._visible;
	}

	_acceptVisibility(value: boolean) {
		this._visible = value;
	}

	_acceptVisibleRanges(value: vscode.NotebookRange[]): void {
		this._visibleRanges = value;
	}

	_acceptSelections(selections: vscode.NotebookRange[]): void {
		this._selections = selections;
	}

	private _trySetSelections(value: vscode.NotebookRange[]): void {
		this._proxy.$trySetSelections(this.id, value.map(extHostConverter.NotebookRange.from));
	}

	_acceptViewColumn(value: vscode.ViewColumn | undefined) {
		this._viewColumn = value;
	}
}
