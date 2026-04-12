/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Schemas } from '../../../base/common/network.js';
import { URI } from '../../../base/common/uri.js';
import * as extHostTypeConverters from './extHostTypeConverters.js';
import { NotebookRange } from './extHostTypes.js';
import * as notebookCommon from '../../contrib/notebook/common/notebookCommon.js';
import { isTextStreamMime } from '../../../base/common/mime.js';
class RawContentChangeEvent {
    constructor(start, deletedCount, deletedItems, items) {
        this.start = start;
        this.deletedCount = deletedCount;
        this.deletedItems = deletedItems;
        this.items = items;
    }
    asApiEvent() {
        return {
            range: new NotebookRange(this.start, this.start + this.deletedCount),
            addedCells: this.items.map(cell => cell.apiCell),
            removedCells: this.deletedItems,
        };
    }
}
export class ExtHostCell {
    static asModelAddData(cell) {
        return {
            EOL: cell.eol,
            lines: cell.source,
            languageId: cell.language,
            uri: cell.uri,
            isDirty: false,
            versionId: 1,
            encoding: 'utf8'
        };
    }
    constructor(notebook, _extHostDocument, _cellData) {
        this.notebook = notebook;
        this._extHostDocument = _extHostDocument;
        this._cellData = _cellData;
        this.handle = _cellData.handle;
        this.uri = URI.revive(_cellData.uri);
        this.cellKind = _cellData.cellKind;
        this._outputs = _cellData.outputs.map(extHostTypeConverters.NotebookCellOutput.to);
        this._internalMetadata = _cellData.internalMetadata ?? {};
        this._metadata = Object.freeze(_cellData.metadata ?? {});
        this._previousResult = Object.freeze(extHostTypeConverters.NotebookCellExecutionSummary.to(_cellData.internalMetadata ?? {}));
    }
    get internalMetadata() {
        return this._internalMetadata;
    }
    get apiCell() {
        if (!this._apiCell) {
            const that = this;
            const data = this._extHostDocument.getDocument(this.uri);
            if (!data) {
                throw new Error(`MISSING extHostDocument for notebook cell: ${this.uri}`);
            }
            const apiCell = {
                get index() { return that.notebook.getCellIndex(that); },
                notebook: that.notebook.apiNotebook,
                kind: extHostTypeConverters.NotebookCellKind.to(this._cellData.cellKind),
                document: data.document,
                get mime() { return that._mime; },
                set mime(value) { that._mime = value; },
                get outputs() { return that._outputs.slice(0); },
                get metadata() { return that._metadata; },
                get executionSummary() { return that._previousResult; }
            };
            this._apiCell = Object.freeze(apiCell);
        }
        return this._apiCell;
    }
    setOutputs(newOutputs) {
        this._outputs = newOutputs.map(extHostTypeConverters.NotebookCellOutput.to);
    }
    setOutputItems(outputId, append, newOutputItems) {
        const newItems = newOutputItems.map(extHostTypeConverters.NotebookCellOutputItem.to);
        const output = this._outputs.find(op => op.id === outputId);
        if (output) {
            if (!append) {
                output.items.length = 0;
            }
            output.items.push(...newItems);
            if (output.items.length > 1 && output.items.every(item => isTextStreamMime(item.mime))) {
                // Look for the mimes in the items, and keep track of their order.
                // Merge the streams into one output item, per mime type.
                const mimeOutputs = new Map();
                const mimeTypes = [];
                output.items.forEach(item => {
                    let items;
                    if (mimeOutputs.has(item.mime)) {
                        items = mimeOutputs.get(item.mime);
                    }
                    else {
                        items = [];
                        mimeOutputs.set(item.mime, items);
                        mimeTypes.push(item.mime);
                    }
                    items.push(item.data);
                });
                output.items.length = 0;
                mimeTypes.forEach(mime => {
                    const compressed = notebookCommon.compressOutputItemStreams(mimeOutputs.get(mime));
                    output.items.push({
                        mime,
                        data: compressed.data.buffer
                    });
                });
            }
        }
    }
    setMetadata(newMetadata) {
        this._metadata = Object.freeze(newMetadata);
    }
    setInternalMetadata(newInternalMetadata) {
        this._internalMetadata = newInternalMetadata;
        this._previousResult = Object.freeze(extHostTypeConverters.NotebookCellExecutionSummary.to(newInternalMetadata));
    }
    setMime(newMime) {
    }
}
export class ExtHostNotebookDocument {
    static { this._handlePool = 0; }
    constructor(_proxy, _textDocumentsAndEditors, _textDocuments, uri, data) {
        this._proxy = _proxy;
        this._textDocumentsAndEditors = _textDocumentsAndEditors;
        this._textDocuments = _textDocuments;
        this.uri = uri;
        this.handle = ExtHostNotebookDocument._handlePool++;
        this._cells = [];
        this._versionId = 0;
        this._isDirty = false;
        this._disposed = false;
        this._notebookType = data.viewType;
        this._metadata = Object.freeze(data.metadata ?? Object.create(null));
        this._spliceNotebookCells([[0, 0, data.cells]], true /* init -> no event*/, undefined);
        this._versionId = data.versionId;
    }
    dispose() {
        this._disposed = true;
    }
    get versionId() {
        return this._versionId;
    }
    get apiNotebook() {
        if (!this._notebook) {
            const that = this;
            const apiObject = {
                get uri() { return that.uri; },
                get version() { return that._versionId; },
                get notebookType() { return that._notebookType; },
                get isDirty() { return that._isDirty; },
                get isUntitled() { return that.uri.scheme === Schemas.untitled; },
                get isClosed() { return that._disposed; },
                get metadata() { return that._metadata; },
                get cellCount() { return that._cells.length; },
                cellAt(index) {
                    index = that._validateIndex(index);
                    return that._cells[index].apiCell;
                },
                getCells(range) {
                    const cells = range ? that._getCells(range) : that._cells;
                    return cells.map(cell => cell.apiCell);
                },
                save() {
                    return that._save();
                },
                [Symbol.for('debug.description')]() {
                    return `NotebookDocument(${this.uri.toString()})`;
                }
            };
            this._notebook = Object.freeze(apiObject);
        }
        return this._notebook;
    }
    acceptDocumentPropertiesChanged(data) {
        if (data.metadata) {
            this._metadata = Object.freeze({ ...this._metadata, ...data.metadata });
        }
    }
    acceptDirty(isDirty) {
        this._isDirty = isDirty;
    }
    acceptModelChanged(event, isDirty, newMetadata) {
        this._versionId = event.versionId;
        this._isDirty = isDirty;
        this.acceptDocumentPropertiesChanged({ metadata: newMetadata });
        const result = {
            notebook: this.apiNotebook,
            metadata: newMetadata,
            cellChanges: [],
            contentChanges: [],
        };
        const relaxedCellChanges = [];
        // -- apply change and populate content changes
        for (const rawEvent of event.rawEvents) {
            if (rawEvent.kind === notebookCommon.NotebookCellsChangeType.ModelChange) {
                this._spliceNotebookCells(rawEvent.changes, false, result.contentChanges);
            }
            else if (rawEvent.kind === notebookCommon.NotebookCellsChangeType.Move) {
                this._moveCells(rawEvent.index, rawEvent.length, rawEvent.newIdx, result.contentChanges);
            }
            else if (rawEvent.kind === notebookCommon.NotebookCellsChangeType.Output) {
                this._setCellOutputs(rawEvent.index, rawEvent.outputs);
                relaxedCellChanges.push({ cell: this._cells[rawEvent.index].apiCell, outputs: this._cells[rawEvent.index].apiCell.outputs });
            }
            else if (rawEvent.kind === notebookCommon.NotebookCellsChangeType.OutputItem) {
                this._setCellOutputItems(rawEvent.index, rawEvent.outputId, rawEvent.append, rawEvent.outputItems);
                relaxedCellChanges.push({ cell: this._cells[rawEvent.index].apiCell, outputs: this._cells[rawEvent.index].apiCell.outputs });
            }
            else if (rawEvent.kind === notebookCommon.NotebookCellsChangeType.ChangeCellLanguage) {
                this._changeCellLanguage(rawEvent.index, rawEvent.language);
                relaxedCellChanges.push({ cell: this._cells[rawEvent.index].apiCell, document: this._cells[rawEvent.index].apiCell.document });
            }
            else if (rawEvent.kind === notebookCommon.NotebookCellsChangeType.ChangeCellContent) {
                relaxedCellChanges.push({ cell: this._cells[rawEvent.index].apiCell, document: this._cells[rawEvent.index].apiCell.document });
            }
            else if (rawEvent.kind === notebookCommon.NotebookCellsChangeType.ChangeCellMime) {
                this._changeCellMime(rawEvent.index, rawEvent.mime);
            }
            else if (rawEvent.kind === notebookCommon.NotebookCellsChangeType.ChangeCellMetadata) {
                this._changeCellMetadata(rawEvent.index, rawEvent.metadata);
                relaxedCellChanges.push({ cell: this._cells[rawEvent.index].apiCell, metadata: this._cells[rawEvent.index].apiCell.metadata });
            }
            else if (rawEvent.kind === notebookCommon.NotebookCellsChangeType.ChangeCellInternalMetadata) {
                this._changeCellInternalMetadata(rawEvent.index, rawEvent.internalMetadata);
                relaxedCellChanges.push({ cell: this._cells[rawEvent.index].apiCell, executionSummary: this._cells[rawEvent.index].apiCell.executionSummary });
            }
        }
        // -- compact cellChanges
        const map = new Map();
        for (let i = 0; i < relaxedCellChanges.length; i++) {
            const relaxedCellChange = relaxedCellChanges[i];
            const existing = map.get(relaxedCellChange.cell);
            if (existing === undefined) {
                const newLen = result.cellChanges.push({
                    document: undefined,
                    executionSummary: undefined,
                    metadata: undefined,
                    outputs: undefined,
                    ...relaxedCellChange,
                });
                map.set(relaxedCellChange.cell, newLen - 1);
            }
            else {
                result.cellChanges[existing] = {
                    ...result.cellChanges[existing],
                    ...relaxedCellChange
                };
            }
        }
        // Freeze event properties so handlers cannot accidentally modify them
        Object.freeze(result);
        Object.freeze(result.cellChanges);
        Object.freeze(result.contentChanges);
        return result;
    }
    _validateIndex(index) {
        index = index | 0;
        if (index < 0) {
            return 0;
        }
        else if (index >= this._cells.length) {
            return this._cells.length - 1;
        }
        else {
            return index;
        }
    }
    _validateRange(range) {
        let start = range.start | 0;
        let end = range.end | 0;
        if (start < 0) {
            start = 0;
        }
        if (end > this._cells.length) {
            end = this._cells.length;
        }
        return range.with({ start, end });
    }
    _getCells(range) {
        range = this._validateRange(range);
        const result = [];
        for (let i = range.start; i < range.end; i++) {
            result.push(this._cells[i]);
        }
        return result;
    }
    async _save() {
        if (this._disposed) {
            return Promise.reject(new Error('Notebook has been closed'));
        }
        return this._proxy.$trySaveNotebook(this.uri);
    }
    _spliceNotebookCells(splices, initialization, bucket) {
        if (this._disposed) {
            return;
        }
        const contentChangeEvents = [];
        const addedCellDocuments = [];
        const removedCellDocuments = [];
        splices.reverse().forEach(splice => {
            const cellDtos = splice[2];
            const newCells = cellDtos.map(cell => {
                const extCell = new ExtHostCell(this, this._textDocumentsAndEditors, cell);
                if (!initialization) {
                    addedCellDocuments.push(ExtHostCell.asModelAddData(cell));
                }
                return extCell;
            });
            const changeEvent = new RawContentChangeEvent(splice[0], splice[1], [], newCells);
            const deletedItems = this._cells.splice(splice[0], splice[1], ...newCells);
            for (const cell of deletedItems) {
                removedCellDocuments.push(cell.uri);
                changeEvent.deletedItems.push(cell.apiCell);
            }
            contentChangeEvents.push(changeEvent);
        });
        this._textDocumentsAndEditors.acceptDocumentsAndEditorsDelta({
            addedDocuments: addedCellDocuments,
            removedDocuments: removedCellDocuments
        });
        if (bucket) {
            for (const changeEvent of contentChangeEvents) {
                bucket.push(changeEvent.asApiEvent());
            }
        }
    }
    _moveCells(index, length, newIdx, bucket) {
        const cells = this._cells.splice(index, length);
        this._cells.splice(newIdx, 0, ...cells);
        const changes = [
            new RawContentChangeEvent(index, length, cells.map(c => c.apiCell), []),
            new RawContentChangeEvent(newIdx, 0, [], cells)
        ];
        for (const change of changes) {
            bucket.push(change.asApiEvent());
        }
    }
    _setCellOutputs(index, outputs) {
        const cell = this._cells[index];
        cell.setOutputs(outputs);
    }
    _setCellOutputItems(index, outputId, append, outputItems) {
        const cell = this._cells[index];
        cell.setOutputItems(outputId, append, outputItems);
    }
    _changeCellLanguage(index, newLanguageId) {
        const cell = this._cells[index];
        if (cell.apiCell.document.languageId !== newLanguageId) {
            this._textDocuments.$acceptModelLanguageChanged(cell.uri, newLanguageId);
        }
    }
    _changeCellMime(index, newMime) {
        const cell = this._cells[index];
        cell.apiCell.mime = newMime;
    }
    _changeCellMetadata(index, newMetadata) {
        const cell = this._cells[index];
        cell.setMetadata(newMetadata);
    }
    _changeCellInternalMetadata(index, newInternalMetadata) {
        const cell = this._cells[index];
        cell.setInternalMetadata(newInternalMetadata);
    }
    getCellFromApiCell(apiCell) {
        return this._cells.find(cell => cell.apiCell === apiCell);
    }
    getCellFromIndex(index) {
        return this._cells[index];
    }
    getCell(cellHandle) {
        return this._cells.find(cell => cell.handle === cellHandle);
    }
    getCellIndex(cell) {
        return this._cells.indexOf(cell);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdE5vdGVib29rRG9jdW1lbnQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL2NvbW1vbi9leHRIb3N0Tm90ZWJvb2tEb2N1bWVudC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDMUQsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBSWxELE9BQU8sS0FBSyxxQkFBcUIsTUFBTSw0QkFBNEIsQ0FBQztBQUNwRSxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFDbEQsT0FBTyxLQUFLLGNBQWMsTUFBTSxpREFBaUQsQ0FBQztBQUVsRixPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUVoRSxNQUFNLHFCQUFxQjtJQUUxQixZQUNVLEtBQWEsRUFDYixZQUFvQixFQUNwQixZQUFtQyxFQUNuQyxLQUFvQjtRQUhwQixVQUFLLEdBQUwsS0FBSyxDQUFRO1FBQ2IsaUJBQVksR0FBWixZQUFZLENBQVE7UUFDcEIsaUJBQVksR0FBWixZQUFZLENBQXVCO1FBQ25DLFVBQUssR0FBTCxLQUFLLENBQWU7SUFDMUIsQ0FBQztJQUVMLFVBQVU7UUFDVCxPQUFPO1lBQ04sS0FBSyxFQUFFLElBQUksYUFBYSxDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDO1lBQ3BFLFVBQVUsRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUM7WUFDaEQsWUFBWSxFQUFFLElBQUksQ0FBQyxZQUFZO1NBQy9CLENBQUM7SUFDSCxDQUFDO0NBQ0Q7QUFF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