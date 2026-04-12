/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { toFormattedString } from '../../../../../base/common/jsonFormatter.js';
import { NotebookCellsChangeType, NotebookMetadataUri } from '../notebookCommon.js';
import { StringSHA1 } from '../../../../../base/common/hash.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { createTextBuffer } from '../../../../../editor/common/model/textModel.js';
export function getFormattedNotebookMetadataJSON(transientMetadata, metadata) {
    let filteredMetadata = {};
    if (transientMetadata) {
        const keys = new Set([...Object.keys(metadata)]);
        for (const key of keys) {
            if (!(transientMetadata[key])) {
                filteredMetadata[key] = metadata[key];
            }
        }
    }
    else {
        filteredMetadata = metadata;
    }
    const metadataSource = toFormattedString(filteredMetadata, {});
    return metadataSource;
}
export class NotebookDocumentMetadataTextModel extends Disposable {
    get metadata() {
        return this.notebookModel.metadata;
    }
    get textBuffer() {
        if (this._textBuffer) {
            return this._textBuffer;
        }
        const source = getFormattedNotebookMetadataJSON(this.notebookModel.transientOptions.transientDocumentMetadata, this.metadata);
        this._textBuffer = this._register(createTextBuffer(source, 1 /* DefaultEndOfLine.LF */).textBuffer);
        this._register(this._textBuffer.onDidChangeContent(() => {
            this._onDidChange.fire();
        }));
        return this._textBuffer;
    }
    constructor(notebookModel) {
        super();
        this.notebookModel = notebookModel;
        this._onDidChange = this._register(new Emitter());
        this.onDidChange = this._onDidChange.event;
        this._textBufferHash = null;
        this.uri = NotebookMetadataUri.generate(this.notebookModel.uri);
        this._register(this.notebookModel.onDidChangeContent((e) => {
            if (e.rawEvents.some(event => event.kind === NotebookCellsChangeType.ChangeDocumentMetadata || event.kind === NotebookCellsChangeType.ModelChange)) {
                this._textBuffer?.dispose();
                this._textBuffer = undefined;
                this._textBufferHash = null;
                this._onDidChange.fire();
            }
        }));
    }
    getHash() {
        if (this._textBufferHash !== null) {
            return this._textBufferHash;
        }
        const shaComputer = new StringSHA1();
        const snapshot = this.textBuffer.createSnapshot(false);
        let text;
        while ((text = snapshot.read())) {
            shaComputer.update(text);
        }
        this._textBufferHash = shaComputer.digest();
        return this._textBufferHash;
    }
    getValue() {
        const fullRange = this.getFullModelRange();
        const eol = this.textBuffer.getEOL();
        if (eol === '\n') {
            return this.textBuffer.getValueInRange(fullRange, 1 /* EndOfLinePreference.LF */);
        }
        else {
            return this.textBuffer.getValueInRange(fullRange, 2 /* EndOfLinePreference.CRLF */);
        }
    }
    getFullModelRange() {
        const lineCount = this.textBuffer.getLineCount();
        return new Range(1, 1, lineCount, this.textBuffer.getLineLength(lineCount) + 1);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tNZXRhZGF0YVRleHRNb2RlbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2NvbW1vbi9tb2RlbC9ub3RlYm9va01ldGFkYXRhVGV4dE1vZGVsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ2hGLE9BQU8sRUFBZ0YsdUJBQXVCLEVBQTRCLG1CQUFtQixFQUE2QixNQUFNLHNCQUFzQixDQUFDO0FBQ3ZOLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUNoRSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFHckUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUVuRixNQUFNLFVBQVUsZ0NBQWdDLENBQUMsaUJBQXdELEVBQUUsUUFBa0M7SUFDNUksSUFBSSxnQkFBZ0IsR0FBMkIsRUFBRSxDQUFDO0lBRWxELElBQUksaUJBQWlCLEVBQUUsQ0FBQztRQUN2QixNQUFNLElBQUksR0FBRyxJQUFJLEdBQUcsQ0FBQyxDQUFDLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDakQsS0FBSyxNQUFNLEdBQUcsSUFBSSxJQUFJLEVBQUUsQ0FBQztZQUN4QixJQUFJLENBQUMsQ0FBQyxpQkFBaUIsQ0FBQyxHQUFpQyxDQUFDLENBQUMsRUFDekQsQ0FBQztnQkFDRixnQkFBZ0IsQ0FBQyxHQUFHLENBQUMsR0FBRyxRQUFRLENBQUMsR0FBaUMs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