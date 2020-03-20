/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { NotebookCellTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookCellTextModel';
import { INotebookTextModel, NotebookCellOutputsSplice, NotebookCellsSplice, NotebookDocumentMetadata } from 'vs/workbench/contrib/notebook/common/notebookCommon';

export class NotebookTextModel extends Disposable implements INotebookTextModel {
	private readonly _onWillDispose: Emitter<void> = this._register(new Emitter<void>());
	readonly onWillDispose: Event<void> = this._onWillDispose.event;
	private readonly _onDidChangeCells = new Emitter<NotebookCellsSplice[]>();
	get onDidChangeCells(): Event<NotebookCellsSplice[]> { return this._onDidChangeCells.event; }
	private _onDidChangeContent = new Emitter<void>();
	onDidChangeContent: Event<void> = this._onDidChangeContent.event;
	private _mapping: Map<number, NotebookCellTextModel> = new Map();
	private _cellListeners: Map<number, IDisposable> = new Map();
	cells: NotebookCellTextModel[];
	languages: string[] = [];
	metadata: NotebookDocumentMetadata | undefined = undefined;
	renderers = new Set<number>();

	constructor(
		public handle: number,
		public viewType: string,
		public uri: URI
	) {
		super();
		this.cells = [];
	}

	updateLanguages(languages: string[]) {
		this.languages = languages;
	}

	updateNotebookMetadata(metadata: NotebookDocumentMetadata | undefined) {
		this.metadata = metadata;
	}

	updateRenderers(renderers: number[]) {
		renderers.forEach(render => {
			this.renderers.add(render);
		});
	}

	insertNewCell(index: number, cell: NotebookCellTextModel): void {
		this._mapping.set(cell.handle, cell);
		this.cells.splice(index, 0, cell);
		let dirtyStateListener = cell.onDidChangeContent(() => {
			this._onDidChangeContent.fire();
		});

		this._cellListeners.set(cell.handle, dirtyStateListener);
		this._onDidChangeContent.fire();
		return;
	}

	removeCell(index: number) {
		let cell = this.cells[index];
		this._cellListeners.get(cell.handle)?.dispose();
		this._cellListeners.delete(cell.handle);
		this.cells.splice(index, 1);
		this._onDidChangeContent.fire();
	}


	// TODO@rebornix should this trigger content change event?
	$spliceNotebookCells(splices: NotebookCellsSplice[]): void {
		splices.reverse().forEach(splice => {
			let cellDtos = splice[2];
			let newCells = cellDtos.map(cell => {
				let mainCell = new NotebookCellTextModel(URI.revive(cell.uri), cell.handle, cell.source, cell.language, cell.cellKind, cell.outputs || []);
				this._mapping.set(cell.handle, mainCell);
				let dirtyStateListener = mainCell.onDidChangeContent(() => {
					this._onDidChangeContent.fire();
				});
				this._cellListeners.set(cell.handle, dirtyStateListener);
				return mainCell;
			});

			this.cells.splice(splice[0], splice[1], ...newCells);
		});

		this._onDidChangeCells.fire(splices);
	}

	// TODO@rebornix should this trigger content change event?
	$spliceNotebookCellOutputs(cellHandle: number, splices: NotebookCellOutputsSplice[]): void {
		let cell = this._mapping.get(cellHandle);
		cell?.spliceNotebookCellOutputs(splices);
	}

	dispose() {
		this._onWillDispose.fire();
		this._cellListeners.forEach(val => val.dispose());
		super.dispose();
	}
}
