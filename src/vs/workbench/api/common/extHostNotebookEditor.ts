/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { readonly } from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { MainThreadNotebookShape } from 'vs/workbench/api/common/extHost.protocol';
import * as extHostTypes from 'vs/workbench/api/common/extHostTypes';
import * as extHostConverter from 'vs/workbench/api/common/extHostTypeConverters';
import { CellEditType, ICellEditOperation, ICellRange, ICellReplaceEdit, notebookDocumentMetadataDefaults } from 'vs/workbench/contrib/notebook/common/notebookCommon';
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
			metadata: { ...notebookDocumentMetadataDefaults, ...value }
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
	private _selection?: vscode.NotebookCell;
	private _selections: vscode.NotebookCellRange[] = [];

	private _visibleRanges: extHostTypes.NotebookCellRange[] = [];
	private _viewColumn?: vscode.ViewColumn;
	private _active: boolean = false;
	private _visible: boolean = false;
	private _kernel?: vscode.NotebookKernel;

	private _onDidDispose = new Emitter<void>();
	readonly onDidDispose: Event<void> = this._onDidDispose.event;

	private _hasDecorationsForKey: { [key: string]: boolean; } = Object.create(null);

	private _editor: vscode.NotebookEditor | undefined;

	constructor(
		readonly id: string,
		private readonly _viewType: string,
		private readonly _proxy: MainThreadNotebookShape,
		readonly notebookData: ExtHostNotebookDocument,
	) {
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
					return that._selection;
				},
				get selections() {
					return that._selections;
				},
				get visibleRanges() {
					return that._visibleRanges;
				},
				revealRange(range, revealType) {
					that._proxy.$tryRevealRange(that.id, extHostConverter.NotebookCellRange.from(range), revealType ?? extHostTypes.NotebookEditorRevealType.Default);
				},
				get viewColumn() {
					return that._viewColumn;
				},
				get onDidDispose() {
					return that.onDidDispose;
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

	set visible(_state: boolean) {
		throw readonly('visible');
	}

	_acceptVisibility(value: boolean) {
		this._visible = value;
	}

	_acceptVisibleRanges(value: extHostTypes.NotebookCellRange[]): void {
		this._visibleRanges = value;
	}

	_acceptSelections(selections: ICellRange[]): void {
		const primarySelection = selections[0];
		this._selection = primarySelection ? this.notebookData.getCellFromIndex(primarySelection.start)?.cell : undefined;
		this._selections = selections.map(val => new extHostTypes.NotebookCellRange(val.start, val.end));
	}

	get active(): boolean {
		return this._active;
	}

	set active(_state: boolean) {
		throw readonly('active');
	}

	_acceptActive(value: boolean) {
		this._active = value;
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

			if (prev.editType === CellEditType.Replace && editData.cellEdits[i].editType === CellEditType.Replace) {
				const edit = editData.cellEdits[i];
				if ((edit.editType !== CellEditType.DocumentMetadata) && prev.index === edit.index) {
					prev.cells.push(...(editData.cellEdits[i] as ICellReplaceEdit).cells);
					prev.count += (editData.cellEdits[i] as ICellReplaceEdit).count;
					continue;
				}
			}

			compressedEdits.push(editData.cellEdits[i]);
			compressedEditsIndex++;
		}

		return this._proxy.$tryApplyEdits(this._viewType, this.notebookData.uri, editData.documentVersionId, compressedEdits);
	}

	setDecorations(decorationType: vscode.NotebookEditorDecorationType, range: vscode.NotebookCellRange): void {
		const willBeEmpty = (range.start === range.end);
		if (willBeEmpty && !this._hasDecorationsForKey[decorationType.key]) {
			// avoid no-op call to the renderer
			return;
		}
		if (willBeEmpty) {
			delete this._hasDecorationsForKey[decorationType.key];
		} else {
			this._hasDecorationsForKey[decorationType.key] = true;
		}

		return this._proxy.$trySetDecorations(
			this.id,
			extHostConverter.NotebookCellRange.from(range),
			decorationType.key
		);
	}
}
