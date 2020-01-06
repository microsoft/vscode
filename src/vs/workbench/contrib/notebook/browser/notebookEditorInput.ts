/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorInput, EditorModel, IEditorInput, GroupIdentifier, ISaveOptions } from 'vs/workbench/common/editor';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { ITextModel } from 'vs/editor/common/model';
import { format } from 'vs/base/common/jsonFormatter';
import { applyEdits } from 'vs/base/common/jsonEdit';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { Emitter, Event } from 'vs/base/common/event';
import { INotebook, ICell } from 'vs/editor/common/modes';
import { INotebookService } from 'vs/workbench/contrib/notebook/browser/notebookService';

export class NotebookEditorModel extends EditorModel {
	private _dirty = false;

	protected readonly _onDidChangeDirty = this._register(new Emitter<void>());
	readonly onDidChangeDirty = this._onDidChangeDirty.event;

	private readonly _onDidChangeCells = new Emitter<void>();
	get onDidChangeCells(): Event<void> { return this._onDidChangeCells.event; }

	constructor(
		public readonly textModel: ITextModel,
		private _notebook: INotebook | undefined
	) {
		super();

		if (_notebook && _notebook.onDidChangeCells) {
			this._register(_notebook.onDidChangeCells(() => {
				this._onDidChangeCells.fire();
			}));
		}
	}

	isDirty() {
		return this._dirty;
	}

	public getNotebook(): INotebook {
		if (this._notebook) {
			return this._notebook;
		}

		let content = this.textModel.getValue();
		this._notebook = JSON.parse(content);
		return this._notebook!;
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

	save() {
		let content = JSON.stringify(this._notebook);
		let edits = format(content, undefined, {});
		this.textModel.setValue(applyEdits(content, edits));
		this._dirty = false;
		this._onDidChangeDirty.fire();
	}
}

export class NotebookEditorInput extends EditorInput {
	static readonly ID: string = 'workbench.input.notebook';
	private promise: Promise<NotebookEditorModel> | null = null;
	private textModel: NotebookEditorModel | null = null;

	constructor(
		public readonly editorInput: IEditorInput,
		public readonly viewType: string | undefined,
		@INotebookService private readonly notebookService: INotebookService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@ITextModelService private readonly textModelResolverService: ITextModelService
	) {
		super();
	}

	getTypeId(): string {
		return NotebookEditorInput.ID;
	}

	getName(): string {
		return this.editorInput.getName();
	}

	isDirty() {
		return this.textModel?.isDirty() || false;
	}

	save(groupId: GroupIdentifier, options?: ISaveOptions): Promise<boolean> {
		if (this.textModel) {
			this.textModel.save();
			return this.textFileService.save(this.textModel.textModel.uri);
		}

		return Promise.resolve(true);
	}

	getResource() {
		return this.editorInput.getResource();
	}

	resolve(): Promise<NotebookEditorModel> {
		if (!this.promise) {
			this.promise = this.textModelResolverService.createModelReference(this.editorInput.getResource()!)
				.then(async ref => {
					const textModel = ref.object.textEditorModel;

					let notebook: INotebook | undefined = undefined;
					if (this.viewType !== undefined) {
						notebook = await this.notebookService.resolveNotebook(this.viewType, this.editorInput.getResource()!);
					}

					this.textModel = new NotebookEditorModel(textModel, notebook);
					this.textModel.onDidChangeDirty(() => this._onDidChangeDirty.fire());
					return this.textModel;
				});
		}

		return this.promise;
	}
}
