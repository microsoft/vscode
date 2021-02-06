/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { isArray } from 'vs/base/common/types';
import { ICellOutput, IOutputDto, NotebookCellOutputMetadata } from 'vs/workbench/contrib/notebook/common/notebookCommon';

let _handle = 0;
export class NotebookCellOutputTextModel extends Disposable implements ICellOutput {
	handle = _handle++;
	private _onDidChangeData = new Emitter<void>();
	onDidChangeData = this._onDidChangeData.event;

	get data(): { [key: string]: unknown; } {
		return this._data;
	}
	get metadata(): NotebookCellOutputMetadata | undefined {
		return this._rawOutput.metadata;
	}
	get outputId(): string {
		return this._rawOutput.outputId;
	}

	private _data: { [key: string]: unknown; };

	constructor(
		readonly _rawOutput: IOutputDto
	) {
		super();
		this._data = this._rawOutput.data;
	}

	replaceData(data: { [key: string]: unknown; }) {
		this._data = data;
		this._onDidChangeData.fire();
	}

	appendData(data: { [key: string]: unknown; }) {
		for (const property in data) {
			if ((property === 'text/plain' || property === 'application/x.notebook.stream') && this._data[property] !== undefined) {
				const original = (isArray(this._data[property]) ? this._data[property] : [this._data[property]]) as string[];
				const more = (isArray(data[property]) ? data[property] : [data[property]]) as string[];
				this._data[property] = [...original, ...more];
			}
		}

		this._onDidChangeData.fire();
	}

	toJSON() {
		return {
			data: this._data,
			metadata: this._rawOutput.metadata,
			outputId: this._rawOutput.outputId
		};
	}
}
