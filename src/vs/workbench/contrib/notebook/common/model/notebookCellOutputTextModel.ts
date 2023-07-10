/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { ICellOutput, IOutputDto, IOutputItemDto, compressOutputItemStreams, isTextStreamMime } from 'vs/workbench/contrib/notebook/common/notebookCommon';

export class NotebookCellOutputTextModel extends Disposable implements ICellOutput {

	private _onDidChangeData = this._register(new Emitter<void>());
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

	private _versionId = 0;

	get versionId() {
		return this._versionId;
	}

	constructor(
		private _rawOutput: IOutputDto
	) {
		super();
	}

	replaceData(rawData: IOutputDto) {
		this._rawOutput = rawData;
		this.optimizeOutputItems();
		this._versionId = this._versionId + 1;
		this._onDidChangeData.fire();
	}

	appendData(items: IOutputItemDto[]) {
		this._rawOutput.outputs.push(...items);
		this.optimizeOutputItems();
		this._versionId = this._versionId + 1;
		this._onDidChangeData.fire();
	}

	private optimizeOutputItems() {
		if (this.outputs.length > 1 && this.outputs.every(item => isTextStreamMime(item.mime))) {
			// Look for the mimes in the items, and keep track of their order.
			// Merge the streams into one output item, per mime type.
			const mimeOutputs = new Map<string, Uint8Array[]>();
			const mimeTypes: string[] = [];
			this.outputs.forEach(item => {
				let items: Uint8Array[];
				if (mimeOutputs.has(item.mime)) {
					items = mimeOutputs.get(item.mime)!;
				} else {
					items = [];
					mimeOutputs.set(item.mime, items);
					mimeTypes.push(item.mime);
				}
				items.push(item.data.buffer);
			});
			this.outputs.length = 0;
			mimeTypes.forEach(mime => {
				const compressed = compressOutputItemStreams(mimeOutputs.get(mime)!);
				this.outputs.push({
					mime,
					data: compressed
				});
			});
		}
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
