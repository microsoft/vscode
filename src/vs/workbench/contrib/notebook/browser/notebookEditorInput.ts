/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorInput, EditorModel, IEditorInput, GroupIdentifier, ISaveOptions, IRevertOptions } from 'vs/workbench/common/editor';
import { Emitter, Event } from 'vs/base/common/event';
import { INotebookService } from 'vs/workbench/contrib/notebook/browser/notebookService';
import { ICell, NotebookCellsSplice } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { URI } from 'vs/base/common/uri';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { NotebookCellTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookCellTextModel';

export class NotebookEditorModel extends EditorModel {
	private _dirty = false;

	protected readonly _onDidChangeDirty = this._register(new Emitter<void>());
	readonly onDidChangeDirty = this._onDidChangeDirty.event;

	private readonly _onDidChangeCells = new Emitter<NotebookCellsSplice[]>();
	get onDidChangeCells(): Event<NotebookCellsSplice[]> { return this._onDidChangeCells.event; }


	get notebook() {
		return this._notebook;
	}

	constructor(
		private _notebook: NotebookTextModel
	) {
		super();

		if (_notebook && _notebook.onDidChangeCells) {
			this._register(_notebook.onDidChangeContent(() => {
				this._dirty = true;
				this._onDidChangeDirty.fire();
			}));
			this._register(_notebook.onDidChangeCells((e) => {
				this._onDidChangeCells.fire(e);
			}));
		}
	}

	isDirty() {
		return this._dirty;
	}

	getNotebook(): NotebookTextModel {
		return this._notebook;
	}

	insertCell(cell: ICell, index: number) {
		let notebook = this.getNotebook();

		if (notebook) {
			let mainCell = new NotebookCellTextModel(URI.revive(cell.uri), cell.handle, cell.source, cell.language, cell.cellKind, cell.outputs, cell.metadata);
			this.notebook.insertNewCell(index, mainCell);
			this._dirty = true;
			this._onDidChangeDirty.fire();

		}
	}

	deleteCell(index: number) {
		let notebook = this.getNotebook();

		if (notebook) {
			this.notebook.removeCell(index);
		}
	}

	async save(): Promise<boolean> {
		if (this._notebook) {
			this._dirty = false;
			this._onDidChangeDirty.fire();
			// todo, flush all states
			return true;
		}

		return false;
	}
}

export class NotebookEditorInput extends EditorInput {
	static readonly ID: string = 'workbench.input.notebook';
	private promise: Promise<NotebookEditorModel> | null = null;
	private textModel: NotebookEditorModel | null = null;

	constructor(
		public resource: URI,
		public name: string,
		public readonly viewType: string | undefined,
		@INotebookService private readonly notebookService: INotebookService
	) {
		super();
	}

	getTypeId(): string {
		return NotebookEditorInput.ID;
	}

	getName(): string {
		return this.name;
	}

	isDirty() {
		return this.textModel?.isDirty() || false;
	}

	async save(group: GroupIdentifier, options?: ISaveOptions): Promise<IEditorInput | undefined> {
		if (this.textModel) {
			await this.notebookService.save(this.textModel.notebook.viewType, this.textModel.notebook.uri);
			await this.textModel.save();
			return this;
		}

		return undefined;
	}

	async revert(group: GroupIdentifier, options?: IRevertOptions): Promise<void> {
		if (this.textModel) {
			// TODO@rebornix we need hashing
			await this.textModel.save();
		}
	}

	async resolve(): Promise<NotebookEditorModel> {
		if (!this.promise) {
			await this.notebookService.canResolve(this.viewType!);

			this.promise = this.notebookService.resolveNotebook(this.viewType!, this.resource).then(notebook => {
				this.textModel = new NotebookEditorModel(notebook!);
				this.textModel.onDidChangeDirty(() => this._onDidChangeDirty.fire());
				return this.textModel;
			});
		}

		return this.promise;
	}
}
