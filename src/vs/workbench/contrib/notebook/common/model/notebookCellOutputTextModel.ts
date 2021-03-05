/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { ICellOutput, IOutputDto, IOutputItemDto } from 'vs/workbench/contrib/notebook/common/notebookCommon';

let _handle = 0;
export class NotebookCellOutputTextModel extends Disposable implements ICellOutput {
	handle = _handle++;
	private _onDidChangeData = new Emitter<void>();
	onDidChangeData = this._onDidChangeData.event;

	get outputs() {
		return this._rawOutput.outputs || [];
	}

	get metadata(): Record<string, any> | undefined {
		return this._rawOutput.metadata;
	}

	get outputId(): string {
		return this._rawOutput.outputId;
	}

	constructor(
		readonly _rawOutput: IOutputDto
	) {
		super();
	}

	replaceData(items: IOutputItemDto[]) {
		this._rawOutput.outputs = items;
		this._onDidChangeData.fire();
	}

	appendData(items: IOutputItemDto[]) {
		this._rawOutput.outputs.push(...items);
		// for (const property in data) {
		// 	if ((property === 'text/plain' || property === 'application/x.notebook.stream') && this._data[property] !== undefined) {
		// 		const original = (isArray(this._data[property]) ? this._data[property] : [this._data[property]]) as string[];
		// 		const more = (isArray(data[property]) ? data[property] : [data[property]]) as string[];
		// 		this._data[property] = [...original, ...more];
		// 	}
		// }

		this._onDidChangeData.fire();
	}

	toJSON(): IOutputDto {
		return {
			// data: this._data,
			metadata: this._rawOutput.metadata,
			outputs: this._rawOutput.outputs,
			outputId: this._rawOutput.outputId
		};
	}
}
