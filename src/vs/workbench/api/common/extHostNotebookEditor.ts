/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { MainThreadNotebookShape } from 'vs/workbench/api/common/extHost.protocol';
import * as extHostTypes from 'vs/workbench/api/common/extHostTypes';
import * as extHostConverter from 'vs/workbench/api/common/extHostTypeConverters';
import * as vscode from 'vscode';
import { ExtHostNotebookDocument } from './extHostNotebookDocument';

export class ExtHostNotebookEditor {

	private _selections: vscode.NotebookCellRange[] = [];
	private _visibleRanges: vscode.NotebookCellRange[] = [];
	private _viewColumn?: vscode.ViewColumn;

	private _visible: boolean = false;
	private _kernel?: vscode.NotebookKernel;

	private readonly _hasDecorationsForKey = new Set<string>();
	private readonly _onDidDispose = new Emitter<void>();
	readonly onDidDispose: Event<void> = this._onDidDispose.event;


	private _editor?: vscode.NotebookEditor;

	constructor(
		readonly id: string,
		private readonly _proxy: MainThreadNotebookShape,
		readonly notebookData: ExtHostNotebookDocument,
		visibleRanges: vscode.NotebookCellRange[],
		selections: vscode.NotebookCellRange[],
		viewColumn: vscode.ViewColumn | undefined
	) {
		this._selections = selections;
		this._visibleRanges = visibleRanges;
		this._viewColumn = viewColumn;
	}

	dispose() {
		this._onDidDispose.fire();
		this._onDidDispose.dispose();
	}

	get editor(): vscode.NotebookEditor {
		if (!this._editor) {
			const that = this;
			this._editor = {
				get document() {
					return that.notebookData.notebookDocument;
				},
				get selection() {
					const primarySelection = that._selections[0];
					return primarySelection && that.notebookData.getCellFromIndex(primarySelection.start)?.cell;
				},
				get selections() {
					return that._selections;
				},
				get visibleRanges() {
					return that._visibleRanges;
				},
				revealRange(range, revealType) {
					that._proxy.$tryRevealRange(
						that.id,
						extHostConverter.NotebookCellRange.from(range),
						revealType ?? extHostTypes.NotebookEditorRevealType.Default
					);
				},
				get viewColumn() {
					return that._viewColumn;
				},
				get onDidDispose() {
					return that.onDidDispose;
				},
				get kernel() {
					return that._kernel;
				},
				setDecorations(decorationType, range) {
					return that.setDecorations(decorationType, range);
				}
			};
		}
		return this._editor;
	}

	_acceptKernel(kernel?: vscode.NotebookKernel) {
		this._kernel = kernel;
	}

	get visible(): boolean {
		return this._visible;
	}

	_acceptVisibility(value: boolean) {
		this._visible = value;
	}

	_acceptVisibleRanges(value: vscode.NotebookCellRange[]): void {
		this._visibleRanges = value;
	}

	_acceptSelections(selections: vscode.NotebookCellRange[]): void {
		this._selections = selections;
	}

	setDecorations(decorationType: vscode.NotebookEditorDecorationType, range: vscode.NotebookCellRange): void {
		if (range.isEmpty && !this._hasDecorationsForKey.has(decorationType.key)) {
			// avoid no-op call to the renderer
			return;
		}
		if (range.isEmpty) {
			this._hasDecorationsForKey.delete(decorationType.key);
		} else {
			this._hasDecorationsForKey.add(decorationType.key);
		}

		return this._proxy.$trySetDecorations(
			this.id,
			extHostConverter.NotebookCellRange.from(range),
			decorationType.key
		);
	}
}
