/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MainThreadNotebookEditorsShape } from 'vs/workbench/api/common/extHost.protocol';
import * as extHostTypes from 'vs/workbench/api/common/extHostTypes';
import * as extHostConverter from 'vs/workbench/api/common/extHostTypeConverters';
import { CellEditType, ICellEditOperation, ICellReplaceEdit } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import * as vscode from 'vscode';
import { ExtHostNotebookDocument } from './extHostNotebookDocument';

interface INotebookEditData {
	documentVersionId: number;
	cellEdits: ICellEditOperation[];
}

class NotebookEditorCellEditBuilder implements vscode.NotebookEditorEdit {

	private readonly _documentVersionId: number;

	private _finalized: boolean = false;
	private _collectedEdits: ICellEditOperation[] = [];

	constructor(documentVersionId: number) {
		this._documentVersionId = documentVersionId;
	}

	finalize(): INotebookEditData {
		this._finalized = true;
		return {
			documentVersionId: this._documentVersionId,
			cellEdits: this._collectedEdits
		};
	}

	private _throwIfFinalized() {
		if (this._finalized) {
			throw new Error('Edit is only valid while callback runs');
		}
	}

	replaceMetadata(value: vscode.NotebookDocumentMetadata): void {
		this._throwIfFinalized();
		this._collectedEdits.push({
			editType: CellEditType.DocumentMetadata,
			metadata: value
		});
	}

	replaceCellMetadata(index: number, metadata: vscode.NotebookCellMetadata): void {
		this._throwIfFinalized();
		this._collectedEdits.push({
			editType: CellEditType.Metadata,
			index,
			metadata
		});
	}

	replaceCellOutput(index: number, outputs: vscode.NotebookCellOutput[]): void {
		this._throwIfFinalized();
		this._collectedEdits.push({
			editType: CellEditType.Output,
			index,
			outputs: outputs.map(output => {
				return extHostConverter.NotebookCellOutput.from(output);
			})
		});
	}

	replaceCells(from: number, to: number, cells: vscode.NotebookCellData[]): void {
		this._throwIfFinalized();
		if (from === to && cells.length === 0) {
			return;
		}
		this._collectedEdits.push({
			editType: CellEditType.Replace,
			index: from,
			count: to - from,
			cells: cells.map(extHostConverter.NotebookCellData.from)
		});
	}
}

export class ExtHostNotebookEditor {

	private _selections: vscode.NotebookCellRange[] = [];
	private _visibleRanges: vscode.NotebookCellRange[] = [];
	private _viewColumn?: vscode.ViewColumn;

	private _visible: boolean = false;
	private _kernel?: vscode.NotebookKernel;

	private readonly _hasDecorationsForKey = new Set<string>();

	private _editor?: vscode.NotebookEditor;

	constructor(
		readonly id: string,
		private readonly _proxy: MainThreadNotebookEditorsShape,
		readonly notebookData: ExtHostNotebookDocument,
		visibleRanges: vscode.NotebookCellRange[],
		selections: vscode.NotebookCellRange[],
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
				get document() {
					return that.notebookData.notebookDocument;
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
				edit(callback) {
					const edit = new NotebookEditorCellEditBuilder(this.document.version);
					callback(edit);
					return that._applyEdit(edit.finalize());
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

	_acceptViewColumn(value: vscode.ViewColumn | undefined) {
		this._viewColumn = value;
	}

	private _applyEdit(editData: INotebookEditData): Promise<boolean> {

		// return when there is nothing to do
		if (editData.cellEdits.length === 0) {
			return Promise.resolve(true);
		}

		const compressedEdits: ICellEditOperation[] = [];
		let compressedEditsIndex = -1;

		for (let i = 0; i < editData.cellEdits.length; i++) {
			if (compressedEditsIndex < 0) {
				compressedEdits.push(editData.cellEdits[i]);
				compressedEditsIndex++;
				continue;
			}

			const prevIndex = compressedEditsIndex;
			const prev = compressedEdits[prevIndex];

			const edit = editData.cellEdits[i];
			if (prev.editType === CellEditType.Replace && edit.editType === CellEditType.Replace) {
				if (prev.index === edit.index) {
					prev.cells.push(...(editData.cellEdits[i] as ICellReplaceEdit).cells);
					prev.count += (editData.cellEdits[i] as ICellReplaceEdit).count;
					continue;
				}
			}

			compressedEdits.push(editData.cellEdits[i]);
			compressedEditsIndex++;
		}

		return this._proxy.$tryApplyEdits(this.id, editData.documentVersionId, compressedEdits);
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
