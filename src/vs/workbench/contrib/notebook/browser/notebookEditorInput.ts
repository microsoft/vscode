/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorInput, EditorModel, IEditorInput } from 'vs/workbench/common/editor';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { ITextModel } from 'vs/editor/common/model';

export interface ICell {
	source: string[];
	cell_type: 'markdown' | 'code';
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
	constructor(
		private readonly textModel: ITextModel
	) {
		super();
	}

	public getNookbook(): INotebook {
		let content = this.textModel.getValue();
		let notebook: INotebook = JSON.parse(content);
		return notebook;
	}
}

export class NotebookEditorInput extends EditorInput {
	static readonly ID: string = 'workbench.input.notebook';
	private promise: Promise<NotebookEditorModel> | null = null;

	constructor(
		public readonly editorInput: IEditorInput,
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

	resolve(): Promise<NotebookEditorModel> {
		if (!this.promise) {
			this.promise = this.textModelResolverService.createModelReference(this.editorInput.getResource()!)
				.then(ref => {
					const textModel = ref.object.textEditorModel;

					return new NotebookEditorModel(textModel);
				});
		}

		return this.promise;
	}
}
