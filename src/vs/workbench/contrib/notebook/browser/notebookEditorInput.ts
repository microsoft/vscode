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
import { Emitter } from 'vs/base/common/event';

export interface IStreamOutput {
	output_type: 'stream';
	text: string;
}

export interface IErrorOutput {
	output_type: 'error';
	evalue: string;
	traceback: string[];
}

export interface IDisplayOutput {
	output_type: 'display_data';
	data: { string: string };
}

export interface IGenericOutput {
	output_type: string;
}

export type IOutput = IStreamOutput | any;

export interface ICell {
	source: string[];
	cell_type: 'markdown' | 'code';
	outputs: IOutput[];
}

export interface LanguageInfo {
	file_extension: string;
}
export interface IMetadata {
	language_info: LanguageInfo;
}
export interface INotebook {
	metadata: IMetadata;
	cells: ICell[];
}


export class NotebookEditorModel extends EditorModel {
	private _notebook: INotebook | undefined;
	private _dirty = false;

	protected readonly _onDidChangeDirty = this._register(new Emitter<void>());
	readonly onDidChangeDirty = this._onDidChangeDirty.event;

	constructor(
		public readonly textModel: ITextModel
	) {
		super();
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

	resolve(): Promise<NotebookEditorModel> {
		if (!this.promise) {
			this.promise = this.textModelResolverService.createModelReference(this.editorInput.getResource()!)
				.then(ref => {
					const textModel = ref.object.textEditorModel;

					this.textModel = new NotebookEditorModel(textModel);
					this.textModel.onDidChangeDirty(() => this._onDidChangeDirty.fire());
					return this.textModel;
				});
		}

		return this.promise;
	}
}
