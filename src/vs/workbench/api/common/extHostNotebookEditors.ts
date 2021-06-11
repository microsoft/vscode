/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { IdGenerator } from 'vs/base/common/idGenerator';
import { ILogService } from 'vs/platform/log/common/log';
import { ExtHostNotebookEditorsShape, INotebookEditorPropertiesChangeData, INotebookEditorViewColumnInfo, MainContext, MainThreadNotebookEditorsShape } from 'vs/workbench/api/common/extHost.protocol';
import { ExtHostNotebookController } from 'vs/workbench/api/common/extHostNotebook';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';
import * as typeConverters from 'vs/workbench/api/common/extHostTypeConverters';
import type * as vscode from 'vscode';

class NotebookEditorDecorationType {

	private static readonly _Keys = new IdGenerator('NotebookEditorDecorationType');

	readonly value: vscode.NotebookEditorDecorationType;

	constructor(proxy: MainThreadNotebookEditorsShape, options: vscode.NotebookDecorationRenderOptions) {
		const key = NotebookEditorDecorationType._Keys.nextId();
		proxy.$registerNotebookEditorDecorationType(key, typeConverters.NotebookDecorationRenderOptions.from(options));

		this.value = {
			key,
			dispose() {
				proxy.$removeNotebookEditorDecorationType(key);
			}
		};
	}
}


export class ExtHostNotebookEditors implements ExtHostNotebookEditorsShape {

	private readonly _onDidChangeNotebookEditorSelection = new Emitter<vscode.NotebookEditorSelectionChangeEvent>();
	private readonly _onDidChangeNotebookEditorVisibleRanges = new Emitter<vscode.NotebookEditorVisibleRangesChangeEvent>();

	readonly onDidChangeNotebookEditorSelection = this._onDidChangeNotebookEditorSelection.event;
	readonly onDidChangeNotebookEditorVisibleRanges = this._onDidChangeNotebookEditorVisibleRanges.event;

	constructor(
		@ILogService private readonly _logService: ILogService,
		@IExtHostRpcService private readonly _extHostRpc: IExtHostRpcService,
		private readonly _notebooksAndEditors: ExtHostNotebookController,
	) {

	}


	createNotebookEditorDecorationType(options: vscode.NotebookDecorationRenderOptions): vscode.NotebookEditorDecorationType {
		return new NotebookEditorDecorationType(this._extHostRpc.getProxy(MainContext.MainThreadNotebookEditors), options).value;
	}

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
