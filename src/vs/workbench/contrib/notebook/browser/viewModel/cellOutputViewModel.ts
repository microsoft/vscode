/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { ICellOutputViewModel, IGenericCellViewModel } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { CellOutputKind, IOrderedMimeType, IOutputDto, IDisplayOutputDto, RENDERER_NOT_AVAILABLE } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';

let handle = 0;
export class CellOutputViewModel extends Disposable implements ICellOutputViewModel {
	outputHandle = handle++;
	get model(): IDisplayOutputDto {
		return this._outputData;
	}

	private _pickedMimeType: number = -1;
	get pickedMimeType() {
		return this._pickedMimeType;
	}

	set pickedMimeType(value: number) {
		this._pickedMimeType = value;
	}

	private _outputData: IDisplayOutputDto;

	constructor(
		readonly cellViewModel: IGenericCellViewModel,
		private readonly _outputRawData: IOutputDto,
		private readonly _notebookService: INotebookService
	) {
		super();

		// We convert every output to rich output
		switch (this._outputRawData.outputKind) {
			case CellOutputKind.Text:
				this._outputData = {
					outputKind: CellOutputKind.Rich,
					data: {
						'application/x.notebook.stream': this._outputRawData.text
					},
					outputId: this._outputRawData.outputId
				};
				break;
			case CellOutputKind.Error:
				this._outputData = {
					outputKind: CellOutputKind.Rich,
					data: {
						'application/x.notebook.error-traceback': {
							ename: this._outputRawData.ename,
							evalue: this._outputRawData.evalue,
							traceback: this._outputRawData.traceback
						}
					},
					outputId: this._outputRawData.outputId
				};
				break;
			default:
				this._outputData = this._outputRawData;
				break;
		}
	}

	supportAppend() {
		return this._outputRawData.outputKind === CellOutputKind.Text;
	}

	resolveMimeTypes(textModel: NotebookTextModel): [readonly IOrderedMimeType[], number] {
		const mimeTypes = this._notebookService.getMimeTypeInfo(textModel, this.model);
		if (this._pickedMimeType === -1) {
			// there is at least one mimetype which is safe and can be rendered by the core
			this._pickedMimeType = Math.max(mimeTypes.findIndex(mimeType => mimeType.rendererId !== RENDERER_NOT_AVAILABLE && mimeType.isTrusted), 0);
		}

		return [mimeTypes, this._pickedMimeType];
	}

	toRawJSON() {
		switch (this._outputRawData.outputKind) {
			case CellOutputKind.Text:
				return {
					outputKind: 'text',
					text: this._outputRawData.text
				};
			case CellOutputKind.Error:
				return {
					outputKind: 'error',
					ename: this._outputRawData.ename,
					evalue: this._outputRawData.evalue,
					traceback: this._outputRawData.traceback
				};
			case CellOutputKind.Rich:
				return {
					data: this._outputRawData.data,
					metadata: this._outputRawData.metadata
				};
		}
	}
}
