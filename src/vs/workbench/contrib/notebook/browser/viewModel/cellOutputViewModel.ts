/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { ICellOutputViewModel, IGenericCellViewModel } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { ICellOutput, IOrderedMimeType, mimeTypeIsMergeable, RENDERER_NOT_AVAILABLE } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';

let handle = 0;
export class CellOutputViewModel extends Disposable implements ICellOutputViewModel {
	outputHandle = handle++;
	get model(): ICellOutput {
		return this._outputRawData;
	}

	private _pickedMimeType: IOrderedMimeType | undefined;
	get pickedMimeType() {
		return this._pickedMimeType;
	}

	set pickedMimeType(value: IOrderedMimeType | undefined) {
		this._pickedMimeType = value;
	}

	constructor(
		readonly cellViewModel: IGenericCellViewModel,
		private readonly _outputRawData: ICellOutput,
		private readonly _notebookService: INotebookService
	) {
		super();
	}

	hasMultiMimeType() {
		if (this._outputRawData.outputs.length < 2) {
			return false;
		}

		const firstMimeType = this._outputRawData.outputs[0].mime;
		return this._outputRawData.outputs.some(output => output.mime !== firstMimeType);
	}

	supportAppend() {
		// if there is any mime type that's not mergeable then the whole output is not mergeable.
		return this._outputRawData.outputs.every(op => mimeTypeIsMergeable(op.mime));
	}

	resolveMimeTypes(textModel: NotebookTextModel, kernelProvides: readonly string[] | undefined): [readonly IOrderedMimeType[], number] {
		const mimeTypes = this._notebookService.getOutputMimeTypeInfo(textModel, kernelProvides, this.model);
		let index = -1;
		if (this._pickedMimeType) {
			index = mimeTypes.findIndex(mimeType => mimeType.rendererId === this._pickedMimeType!.rendererId && mimeType.mimeType === this._pickedMimeType!.mimeType && mimeType.isTrusted);
		}

		// there is at least one mimetype which is safe and can be rendered by the core
		if (index === -1) {
			index = mimeTypes.findIndex(mimeType => mimeType.rendererId !== RENDERER_NOT_AVAILABLE && mimeType.isTrusted);
		}

		return [mimeTypes, Math.max(index, 0)];
	}

	toRawJSON() {
		return {
			outputs: this._outputRawData.outputs,
			// TODO@rebronix, no id, right?
		};
	}
}
