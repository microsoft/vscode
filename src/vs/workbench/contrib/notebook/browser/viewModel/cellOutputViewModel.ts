/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { ICellOutputViewModel, IDisplayOutputViewModel, IErrorOutputViewModel, IGenericCellViewModel, IStreamOutputViewModel } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { CellOutputKind, IOrderedMimeType, IProcessedOutput, ITransformedDisplayOutputDto, RENDERER_NOT_AVAILABLE } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';

let handle = 0;
export class CellOutputViewModel extends Disposable implements ICellOutputViewModel {
	outputHandle = handle++;
	get model() {
		return this._outputData;
	}

	private _pickedMimeType: number = -1;
	get pickedMimeType() {
		return this._pickedMimeType;
	}

	set pickedMimeType(value: number) {
		this._pickedMimeType = value;
	}

	constructor(
		readonly cellViewModel: IGenericCellViewModel,
		private readonly _outputData: IProcessedOutput,
		private readonly _notebookService: INotebookService
	) {
		super();
	}

	isStreamOutput(): this is IStreamOutputViewModel {
		return this._outputData.outputKind === CellOutputKind.Text;
	}

	isErrorOutput(): this is IErrorOutputViewModel {
		return this._outputData.outputKind === CellOutputKind.Error;
	}

	isDisplayOutput(): this is IDisplayOutputViewModel {
		return this._outputData.outputKind === CellOutputKind.Rich;
	}

	resolveMimeTypes(textModel: NotebookTextModel): [readonly IOrderedMimeType[], number] {
		const mimeTypes = this._notebookService.getMimeTypeInfo(textModel, this.model as ITransformedDisplayOutputDto);
		if (this._pickedMimeType === -1) {
			// there is at least one mimetype which is safe and can be rendered by the core
			this._pickedMimeType = Math.max(mimeTypes.findIndex(mimeType => mimeType.rendererId !== RENDERER_NOT_AVAILABLE && mimeType.isTrusted), 0);
		}

		return [mimeTypes, this._pickedMimeType];
	}
}
