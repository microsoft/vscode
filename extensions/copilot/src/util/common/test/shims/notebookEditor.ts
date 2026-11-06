/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { ExtHostNotebookDocumentData } from './notebookDocument';

export class ExtHostNotebookEditor {
	private _selections: vscode.NotebookRange[] = [];
	private _viewColumn?: vscode.ViewColumn;
	private _editor?: vscode.NotebookEditor;

	constructor(
		readonly notebookData: ExtHostNotebookDocumentData,
		selections: vscode.NotebookRange[]
	) {
		this._selections = selections;
	}

	get apiEditor(): vscode.NotebookEditor {
		if (!this._editor) {
			const that = this;
			this._editor = {
				get notebook() {
					return that.notebookData.document;
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
					that._selections = value;
				},
				get visibleRanges() {
					return [];
				},
				revealRange(range, revealType) {
					// no-op
				},
				get viewColumn() {
					return that._viewColumn;
				},
			};
		}
		return this._editor;
	}
}