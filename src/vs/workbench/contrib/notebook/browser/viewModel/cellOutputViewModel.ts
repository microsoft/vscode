/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { ICellOutputViewModel, IGenericCellViewModel } from '../notebookBrowser.js';
import { NotebookTextModel } from '../../common/model/notebookTextModel.js';
import { ICellOutput, IOrderedMimeType, RENDERER_NOT_AVAILABLE } from '../../common/notebookCommon.js';
import { INotebookService } from '../../common/notebookService.js';

let handle = 0;
export class CellOutputViewModel extends Disposable implements ICellOutputViewModel {
	private _onDidResetRendererEmitter = this._register(new Emitter<void>());
	readonly onDidResetRenderer = this._onDidResetRendererEmitter.event;

	private alwaysShow = false;
	visible = observableValue<boolean>('outputVisible', false);
	setVisible(visible = true, force: boolean = false) {
		if (!visible && this.alwaysShow) {
			// we are forced to show, so no-op
			return;
		}

		if (force && visible) {
			this.alwaysShow = true;
		}

		this.visible.set(visible, undefined);
	}

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

	resolveMimeTypes(textModel: NotebookTextModel, kernelProvides: readonly string[] | undefined): [readonly IOrderedMimeType[], number] {
		const mimeTypes = this._notebookService.getOutputMimeTypeInfo(textModel, kernelProvides, this.model);
		const index = mimeTypes.findIndex(mimeType => mimeType.rendererId !== RENDERER_NOT_AVAILABLE && mimeType.isTrusted);

		return [mimeTypes, Math.max(index, 0)];
	}

	resetRenderer() {
		// reset the output renderer
		this._pickedMimeType = undefined;
		this.model.bumpVersion();
		this._onDidResetRendererEmitter.fire();
	}

	toRawJSON() {
		return {
			outputs: this._outputRawData.outputs,
			// TODO@rebronix, no id, right?
		};
	}
}
