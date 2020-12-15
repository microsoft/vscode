/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { generateUuid } from 'vs/base/common/uuid';
import { IDiffNestedCellViewModel } from 'vs/workbench/contrib/notebook/browser/diff/common';
import { ICellOutputViewModel } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellOutputViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/cellOutputViewModel';
import { NotebookCellTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookCellTextModel';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';

export class DiffNestedCellViewModel extends Disposable implements IDiffNestedCellViewModel {
	private _id: string;
	get id() {
		return this._id;
	}

	get outputs() {
		return this.textModel.outputs;
	}

	get language() {
		return this.textModel.language;
	}

	get metadata() {
		return this.textModel.metadata;
	}

	get uri() {
		return this.textModel.uri;
	}

	get handle() {
		return this.textModel.handle;
	}

	private _outputViewModels: ICellOutputViewModel[];

	get outputsViewModels() {
		return this._outputViewModels;
	}

	constructor(
		readonly textModel: NotebookCellTextModel,
		@INotebookService private _notebookService: INotebookService
	) {
		super();
		this._id = generateUuid();

		this._outputViewModels = this.textModel.outputs.map(output => new CellOutputViewModel(output, this._notebookService));
		// this._register(this.textModel.onDidChangeOutputs((splices) => {
		// 	splices.reverse().forEach(splice => {
		// 		this._outputCollection.splice(splice[0], splice[1], ...splice[2].map(() => 0));
		// 		this._outputViewModels.splice(splice[0], splice[1], ...splice[2].map(output => new CellOutputViewModel(output, this._notebookService)));
		// 	});

		// 	this._outputsTop = null;
		// 	this._onDidChangeOutputs.fire(splices);
		// }));
	}
}
