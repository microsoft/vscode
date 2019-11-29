/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorInput, EditorModel } from 'vs/workbench/common/editor';

export class NotebookEditorModel extends EditorModel {
	constructor(
	) {
		super();
	}
}

export class NotebookEditorInput extends EditorInput {
	static readonly ID: string = 'workbench.input.notebook';
	private readonly _notebookEditorModel: NotebookEditorModel;

	constructor() {
		super();

		this._notebookEditorModel = new NotebookEditorModel();
	}

	getTypeId(): string {
		return NotebookEditorInput.ID;
	}

	getName(): string {
		return 'Notebook';
	}

	resolve(): Promise<NotebookEditorModel> {
		return Promise.resolve(this._notebookEditorModel);
	}
}
