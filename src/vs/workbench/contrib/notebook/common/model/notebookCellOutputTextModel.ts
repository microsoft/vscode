/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ICellOutput, IOutputDto, IOutputItemDto, compressOutputItemStreams, isTextStreamMime } from '../notebookCommon.js';

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

	/**
	 * Alternative output id that's reused when the output is updated.
	 */
	private _alternativeOutputId: string;

	get alternativeOutputId(): string {
		return this._alternativeOutputId;
	}

	private _versionId = 0;

	get versionId() {
		return this._versionId;
	}

	constructor(
		private _rawOutput: IOutputDto
	) {
		super();

		this._alternativeOutputId = this._rawOutput.outputId;
	}

	replaceData(rawData: IOutputDto) {
		this.versionedBufferLengths = {};
		this._rawOutput = rawData;
		this.optimizeOutputItems();
		this._versionId = this._versionId + 1;
		this._onDidChangeData.fire();
	}

	appendData(items: IOutputItemDto[]) {
		this.trackBufferLengths();
		this._rawOutput.outputs.push(...items);
		this.optimizeOutputItems();
		this._versionId = this._versionId + 1;
		this._onDidChangeData.fire();
	}

	private trackBufferLengths() {
		this.outputs.forEach(output => {
			if (isTextStreamMime(output.mime)) {
				if (!this.versionedBufferLengths[output.mime]) {
					this.versionedBufferLengths[output.mime] = {};
				}
				this.versionedBufferLengths[output.mime][this.versionId] = output.data.byteLength;
			}
		});
	}

	// mime: versionId: buffer length
	private versionedBufferLengths: Record<string, Record<number, number>> = {};

	appendedSinceVersion(versionId: number, mime: string): VSBuffer | undefined {
		const bufferLength = this.versionedBufferLengths[mime]?.[versionId];
		const output = this.outputs.find(output => output.mime === mime);
		if (bufferLength && output) {
			return output.data.slice(bufferLength);
		}

		return undefined;
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
				const compressionResult = compressOutputItemStreams(mimeOutputs.get(mime)!);
				this.outputs.push({
					mime,
					data: compressionResult.data
				});
				if (compressionResult.didCompression) {
					// we can't rely on knowing buffer lengths if we've erased previous lines
					this.versionedBufferLengths = {};
				}
			});
		}
	}

	asDto(): IOutputDto {
		return {
			// data: this._data,
			metadata: this._rawOutput.metadata,
			outputs: this._rawOutput.outputs,
			outputId: this._rawOutput.outputId
		};
	}

	bumpVersion() {
		this._versionId = this._versionId + 1;
	}

}
