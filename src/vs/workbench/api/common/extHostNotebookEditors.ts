/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../base/common/event.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { ExtHostNotebookEditorsShape, INotebookEditorPropertiesChangeData, INotebookEditorViewColumnInfo } from './extHost.protocol.js';
import { ExtHostNotebookController } from './extHostNotebook.js';
import * as typeConverters from './extHostTypeConverters.js';
import type * as vscode from 'vscode';


export class ExtHostNotebookEditors implements ExtHostNotebookEditorsShape {

	private readonly _onDidChangeNotebookEditorSelection = new Emitter<vscode.NotebookEditorSelectionChangeEvent>();
	private readonly _onDidChangeNotebookEditorVisibleRanges = new Emitter<vscode.NotebookEditorVisibleRangesChangeEvent>();

	readonly onDidChangeNotebookEditorSelection = this._onDidChangeNotebookEditorSelection.event;
	readonly onDidChangeNotebookEditorVisibleRanges = this._onDidChangeNotebookEditorVisibleRanges.event;

	constructor(
		@ILogService private readonly _logService: ILogService,
		private readonly _notebooksAndEditors: ExtHostNotebookController,
	) { }

	$acceptEditorPropertiesChanged(id: string, data: INotebookEditorPropertiesChangeData): void {
		this._logService.debug('ExtHostNotebook#$acceptEditorPropertiesChanged', id, data);
		const editor = this._notebooksAndEditors.getEditorById(id);
		// ONE: make all state updates
		if (data.visibleRanges) {
			editor._acceptVisibleRanges(data.visibleRanges.ranges.map(typeConverters.NotebookRange.to));
		}
		if (data.selections) {
			editor._acceptSelections(data.selections.selections.map(typeConverters.NotebookRange.to));
		}

		// TWO: send all events after states have been updated
		if (data.visibleRanges) {
			this._onDidChangeNotebookEditorVisibleRanges.fire({
				notebookEditor: editor.apiEditor,
				visibleRanges: editor.apiEditor.visibleRanges
			});
		}
		if (data.selections) {
			this._onDidChangeNotebookEditorSelection.fire(Object.freeze({
				notebookEditor: editor.apiEditor,
				selections: editor.apiEditor.selections
			}));
		}
	}

	$acceptEditorViewColumns(data: INotebookEditorViewColumnInfo): void {
		for (const id in data) {
			const editor = this._notebooksAndEditors.getEditorById(id);
			editor._acceptViewColumn(typeConverters.ViewColumn.to(data[id]));
		}
	}
}
