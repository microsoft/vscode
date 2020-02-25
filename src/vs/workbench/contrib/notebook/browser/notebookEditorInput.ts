/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorInput, EditorModel, IEditorInput, GroupIdentifier, ISaveOptions } from 'vs/workbench/common/editor';
import { Emitter, Event } from 'vs/base/common/event';
import { INotebookService } from 'vs/workbench/contrib/notebook/browser/notebookService';
import { INotebook, ICell, NotebookCellsSplice } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { URI } from 'vs/base/common/uri';

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
		private _notebook: INotebook
	) {
		super();

		if (_notebook && _notebook.onDidChangeCells) {
			this._register(_notebook.onDidChangeDirtyState((newState) => {
				if (this._dirty !== newState) {
					this._dirty = newState;
					this._onDidChangeDirty.fire();
				}
			}));
			this._register(_notebook.onDidChangeCells((e) => {
				this._onDidChangeCells.fire(e);
			}));
		}
	}

	isDirty() {
		return this._dirty;
	}

	getNotebook(): INotebook {
		return this._notebook;
	}

	insertCell(cell: ICell, index: number) {
		let notebook = this.getNotebook();

		if (notebook) {
			notebook.cells.splice(index, 0, cell);
			this._dirty = true;
			this._onDidChangeDirty.fire();
		}
	}

	deleteCell(cell: ICell) {
		let notebook = this.getNotebook();

		if (notebook) {
			let index = notebook.cells.indexOf(cell);
			notebook.cells.splice(index, 1);
			this._dirty = true;
			this._onDidChangeDirty.fire();
		}
	}

	async save(): Promise<boolean> {
		if (this._notebook) {
			let ret = await this._notebook.save();

			if (ret) {
				this._dirty = false;
				this._onDidChangeDirty.fire();
				// todo, flush all states
				return true;
			}
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
			if (await this.textModel.save()) {
				return this;
			}
		}

		return undefined;
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
