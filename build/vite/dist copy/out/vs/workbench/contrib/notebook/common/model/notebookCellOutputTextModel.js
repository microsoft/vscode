/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { compressOutputItemStreams } from '../notebookCommon.js';
import { isTextStreamMime } from '../../../../../base/common/mime.js';
export class NotebookCellOutputTextModel extends Disposable {
    get outputs() {
        return this._rawOutput.outputs || [];
    }
    get metadata() {
        return this._rawOutput.metadata;
    }
    get outputId() {
        return this._rawOutput.outputId;
    }
    get alternativeOutputId() {
        return this._alternativeOutputId;
    }
    get versionId() {
        return this._versionId;
    }
    constructor(_rawOutput) {
        super();
        this._rawOutput = _rawOutput;
        this._onDidChangeData = this._register(new Emitter());
        this.onDidChangeData = this._onDidChangeData.event;
        this._versionId = 0;
        // mime: versionId: buffer length
        this.versionedBufferLengths = {};
        this._alternativeOutputId = this._rawOutput.outputId;
    }
    replaceData(rawData) {
        this.versionedBufferLengths = {};
        this._rawOutput = rawData;
        this.optimizeOutputItems();
        this._versionId = this._versionId + 1;
        this._onDidChangeData.fire();
    }
    appendData(items) {
        this.trackBufferLengths();
        this._rawOutput.outputs.push(...items);
        this.optimizeOutputItems();
        this._versionId = this._versionId + 1;
        this._onDidChangeData.fire();
    }
    trackBufferLengths() {
        this.outputs.forEach(output => {
            if (isTextStreamMime(output.mime)) {
                if (!this.versionedBufferLengths[output.mime]) {
                    this.versionedBufferLengths[output.mime] = {};
                }
                this.versionedBufferLengths[output.mime][this.versionId] = output.data.byteLength;
            }
        });
    }
    appendedSinceVersion(versionId, mime) {
        const bufferLength = this.versionedBufferLengths[mime]?.[versionId];
        const output = this.outputs.find(output => output.mime === mime);
        if (bufferLength && output) {
            return output.data.slice(bufferLength);
        }
        return undefined;
    }
    optimizeOutputItems() {
        if (this.outputs.length > 1 && this.outputs.every(item => isTextStreamMime(item.mime))) {
            // Look for the mimes in the items, and keep track of their order.
            // Merge the streams into one output item, per mime type.
            const mimeOutputs = new Map();
            const mimeTypes = [];
            this.outputs.forEach(item => {
                let items;
                if (mimeOutputs.has(item.mime)) {
                    items = mimeOutputs.get(item.mime);
                }
                else {
                    items = [];
                    mimeOutputs.set(item.mime, items);
                    mimeTypes.push(item.mime);
                }
                items.push(item.data.buffer);
            });
            this.outputs.length = 0;
            mimeTypes.forEach(mime => {
                const compressionResult = compressOutputItemStreams(mimeOutputs.get(mime));
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
    asDto() {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tDZWxsT3V0cHV0VGV4dE1vZGVsLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbm90ZWJvb2svY29tbW9uL21vZGVsL25vdGVib29rQ2VsbE91dHB1dFRleHRNb2RlbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUdoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3JFLE9BQU8sRUFBMkMseUJBQXlCLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUMxRyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUV0RSxNQUFNLE9BQU8sMkJBQTRCLFNBQVEsVUFBVTtJQUsxRCxJQUFJLE9BQU87UUFDVixPQUFPLElBQUksQ0FBQyxVQUFVLENBQUMsT0FBTyxJQUFJLEVBQUUsQ0FBQztJQUN0QyxDQUFDO0lBRUQsSUFBSSxRQUFRO1FBQ1gsT0FBTyxJQUFJLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQztJQUNqQyxDQUFDO0lBRUQsSUFBSSxRQUFRO1FBQ1gsT0FBTyxJQUFJLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQztJQUNqQyxDQUFDO0lBT0QsSUFBSSxtQkFBbUI7UUFDdEIsT0FBTyxJQUFJLENBQUMsb0JBQW9CLENBQUM7SUFDbEMsQ0FBQztJQUlELElBQUksU0FBUztRQUNaLE9BQU8sSUFBSSxDQUFDLFVBQVUsQ0FBQztJQUN4QixDQUFDO0lBRUQsWUFDUyxVQUFzQjtRQUU5QixLQUFLLEVBQUUsQ0FBQztRQUZBLGVBQVUsR0FBVixVQUFVLENBQVk7UUEvQnZCLHFCQUFnQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQVEsQ0FBQyxDQUFDO1FBQy9E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