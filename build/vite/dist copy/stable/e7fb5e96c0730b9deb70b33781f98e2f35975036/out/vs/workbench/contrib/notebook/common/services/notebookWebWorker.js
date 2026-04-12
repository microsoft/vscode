/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { LcsDiff } from '../../../../../base/common/diff/diff.js';
import { doHash, hash, numberHash } from '../../../../../base/common/hash.js';
import { URI } from '../../../../../base/common/uri.js';
import { PieceTreeTextBufferBuilder } from '../../../../../editor/common/model/pieceTreeTextBuffer/pieceTreeTextBufferBuilder.js';
import { CellKind, NotebookCellsChangeType } from '../notebookCommon.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { SearchParams } from '../../../../../editor/common/model/textModelSearch.js';
import { MirrorModel } from '../../../../../editor/common/services/textModelSync/textModelSync.impl.js';
import { filter } from '../../../../../base/common/objects.js';
import { matchCellBasedOnSimilarties } from './notebookCellMatching.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { DiffChange } from '../../../../../base/common/diff/diffChange.js';
import { computeDiff } from '../notebookDiff.js';
const PREFIX_FOR_UNMATCHED_ORIGINAL_CELLS = `unmatchedOriginalCell`;
class MirrorCell {
    get eol() {
        return this._eol === '\r\n' ? 2 /* DefaultEndOfLine.CRLF */ : 1 /* DefaultEndOfLine.LF */;
    }
    constructor(handle, uri, source, _eol, versionId, language, cellKind, outputs, metadata, internalMetadata) {
        this.handle = handle;
        this._eol = _eol;
        this.language = language;
        this.cellKind = cellKind;
        this.outputs = outputs;
        this.metadata = metadata;
        this.internalMetadata = internalMetadata;
        this.textModel = new MirrorModel(uri, source, _eol, versionId);
    }
    onEvents(e) {
        this.textModel.onEvents(e);
        this._hash = undefined;
    }
    getValue() {
        return this.textModel.getValue();
    }
    getLinesContent() {
        return this.textModel.getLinesContent();
    }
    getComparisonValue() {
        return this._hash ??= this._getHash();
    }
    _getHash() {
        let hashValue = numberHash(104579, 0);
        hashValue = doHash(this.language, hashValue);
        hashValue = doHash(this.getValue(), hashValue);
        hashValue = doHash(this.metadata, hashValue);
        // For purpose of diffing only cellId matters, rest do not
        hashValue = doHash(this.internalMetadata?.internalId || '', hashValue);
        for (const op of this.outputs) {
            hashValue = doHash(op.metadata, hashValue);
            for (const output of op.outputs) {
                hashValue = doHash(output.mime, hashValue);
            }
        }
        const digests = this.outputs.flatMap(op => op.outputs.map(o => hash(Array.from(o.data.buffer))));
        for (const digest of digests) {
            hashValue = numberHash(digest, hashValue);
        }
        return hashValue;
    }
}
class MirrorNotebookDocument {
    constructor(uri, cells, metadata, transientDocumentMetadata) {
        this.uri = uri;
        this.cells = cells;
        this.metadata = metadata;
        this.transientDocumentMetadata = transientDocumentMetadata;
    }
    acceptModelChanged(event) {
        // note that the cell content change is not applied to the MirrorCell
        // but it's fine as if a cell content is modified after the first diff, its position will not change any more
        // TODO@rebornix, but it might lead to interesting bugs in the future.
        event.rawEvents.forEach(e => {
            if (e.kind === NotebookCellsChangeType.ModelChange) {
                this._spliceNotebookCells(e.changes);
            }
            else if (e.kind === NotebookCellsChangeType.Move) {
                const cells = this.cells.splice(e.index, 1);
                this.cells.splice(e.newIdx, 0, ...cells);
            }
            else if (e.kind === NotebookCellsChangeType.Output) {
                const cell = this.cells[e.index];
                cell.outputs = e.outputs;
            }
            else if (e.kind === NotebookCellsChangeType.ChangeCellLanguage) {
                this._assertIndex(e.index);
                const cell = this.cells[e.index];
                cell.language = e.language;
            }
            else if (e.kind === NotebookCellsChangeType.ChangeCellMetadata) {
                this._assertIndex(e.index);
                const cell = this.cells[e.index];
                cell.metadata = e.metadata;
            }
            else if (e.kind === NotebookCellsChangeType.ChangeCellInternalMetadata) {
                this._assertIndex(e.index);
                const cell = this.cells[e.index];
                cell.internalMetadata = e.internalMetadata;
            }
            else if (e.kind === NotebookCellsChangeType.ChangeDocumentMetadata) {
                this.metadata = e.metadata;
            }
        });
    }
    _assertIndex(index) {
        if (index < 0 || index >= this.cells.length) {
            throw new Error(`Illegal index ${index}. Cells length: ${this.cells.length}`);
        }
    }
    _spliceNotebookCells(splices) {
        splices.reverse().forEach(splice => {
            const cellDtos = splice[2];
            const newCells = cellDtos.map(cell => {
                return new MirrorCell(cell.handle, URI.parse(cell.url), cell.source, cell.eol, cell.versionId, cell.language, cell.cellKind, cell.outputs, cell.metadata);
            });
            this.cells.splice(splice[0], splice[1], ...newCells);
        });
    }
}
class CellSequence {
    static create(textModel) {
        const hashValue = textModel.cells.map(c => c.getComparisonValue());
        return new CellSequence(hashValue);
    }
    static createWithCellId(cells, includeCellContents) {
        const hashValue = cells.map((c) => {
            if (includeCellContents) {
                return `${doHash(c.internalMetadata?.internalId, numberHash(104579, 0))}#${c.getComparisonValue()}`;
            }
            else {
                return `${doHash(c.internalMetadata?.internalId, numberHash(104579, 0))}}`;
            }
        });
        return new CellSequence(hashValue);
    }
    constructor(hashValue) {
        this.hashValue = hashValue;
    }
    getElements() {
        return this.hashValue;
    }
}
export class NotebookWorker {
    constructor() {
        this._requestHandlerBrand = undefined;
        this._models = Object.create(null);
    }
    dispose() {
    }
    $acceptNewModel(uri, metadata, transientDocumentMetadata, cells) {
        this._models[uri] = new MirrorNotebookDocument(URI.parse(uri), cells.map(dto => new MirrorCell(dto.handle, URI.parse(dto.url), dto.source, dto.eol, dto.versionId, dto.language, dto.cellKind, dto.outputs, dto.metadata, dto.internalMetadata)), metadata, transientDocumentMetadata);
    }
    $acceptModelChanged(strURL, event) {
        const model = this._models[strURL];
        model?.acceptModelChanged(event);
    }
    $acceptCellModelChanged(strURL, handle, event) {
        const model = this._models[strURL];
        model.cells.find(cell => cell.handle === handle)?.onEvents(event);
    }
    $acceptRemovedModel(strURL) {
        if (!this._models[strURL]) {
            return;
        }
        delete this._models[strURL];
    }
    async $computeDiff(originalUrl, modifiedUrl) {
        const original = this._getModel(originalUrl);
        const modified = this._getModel(modifiedUrl);
        const originalModel = new NotebookTextModelFacade(original);
        const modifiedModel = new NotebookTextModelFacade(modified);
        const originalMetadata = filter(original.metadata, key => !original.transientDocumentMetadata[key]);
        const modifiedMetadata = filter(modified.metadata, key => !modified.transientDocumentMetadata[key]);
        const metadataChanged = JSON.stringify(originalMetadata) !== JSON.stringify(modifiedMetadata);
        // TODO@DonJayamanne
        // In the future we might want to avoid computing LCS of outputs
        // That will make this faster.
        const originalDiff = new LcsDiff(CellSequence.create(original), CellSequence.create(modified)).ComputeDiff(false);
        if (originalDiff.changes.length === 0) {
            return {
                metadataChanged,
                cellsDiff: originalDiff
            };
        }
        // This will return the mapping of the cells and what cells were inserted/deleted.
        // We do not care much about accuracy of the diff, but care about the mapping of unmodified cells.
        // That can be used as anchor points to find the cells that have changed.
        // And on cells that have changed, we can use similarity algorithms to find the mapping.
        // Eg as mentioned earlier, its possible after similarity algorithms we find that cells weren't inserted/deleted but were just modified.
        const cellMapping = computeDiff(originalModel, modifiedModel, { cellsDiff: { changes: originalDiff.changes, quitEarly: false }, metadataChanged: false, }).cellDiffInfo;
        // If we have no insertions/deletions, then this is a good diffing.
        if (cellMapping.every(c => c.type === 'modified' || c.type === 'unchanged')) {
            return {
                metadataChanged,
                cellsDiff: originalDiff
            };
        }
        let diffUsingCellIds = this.canComputeDiffWithCellIds(original, modified);
        if (!diffUsingCellIds) {
            /**
             * Assume we have cells as follows
             * Original   Modified
             * A	  		A
             * B			B
             * C			e
             * D			F
             * E
             * F
             *
             * Using LCS we know easily that A, B cells match.
             * Using LCS it would look like C changed to e
             * Using LCS D & E were removed.
             *
             * A human would be able to tell that cell C, D were removed.
             * A human can tell that E changed to e because the code in the cells are very similar.
             * Note the words `similar`, humans try to match cells based on certain heuristics.
             * & the most obvious one is the similarity of the code in the cells.
             *
             * LCS has no notion of similarity, it only knows about equality.
             * We can use other algorithms to find similarity.
             * So if we eliminate A, B, we are left with C, D, E, F and we need to find what they map to in `e, F` in modifed document.
             * We can use a similarity algorithm to find that.
             *
             * The purpose of using LCS first is to find the cells that have not changed.
             * This avoids the need to use similarity algorithms on all cells.
             *
             * At the end of the day what we need is as follows
             * A <=> A
             * B <=> B
             * C => Deleted
             * D => Deleted
             * E => e
             * F => F
             */
            // Note, if cells are swapped, then this compilicates things
            // Trying to solve diff manually is not easy.
            // Lets instead use LCS find the cells that haven't changed,
            // & the cells that have.
            // For the range of cells that have change, lets see if we can get better results using similarity algorithms.
            // Assume we have
            // Code Cell = print("Hello World")
            // Code Cell = print("Foo Bar")
            // We now change this to
            // MD Cell = # Description
            // Code Cell = print("Hello WorldZ")
            // Code Cell = print("Foo BarZ")
            // LCS will tell us that everything changed.
            // But using similarity algorithms we can tell that the first cell is new and last 2 changed.
            // Lets try the similarity algorithms on all cells.
            // We might fare better.
            const result = matchCellBasedOnSimilarties(modified.cells, original.cells);
            // If we have at least one match, then great.
            if (result.some(c => c.original !== -1)) {
                // We have managed to find similarities between cells.
                // Now we can definitely find what cell is new/removed.
                this.updateCellIdsBasedOnMappings(result, original.cells, modified.cells);
                diffUsingCellIds = true;
            }
        }
        if (!diffUsingCellIds) {
            return {
                metadataChanged,
                cellsDiff: originalDiff
            };
        }
        // At this stage we can use internalMetadata.cellId for tracking changes.
        // I.e. we compute LCS diff and the hashes of some cells from original will be equal to that in modified as we're using cellId.
        // Thus we can find what cells are new/deleted.
        // After that we can find whether the contents of the cells changed.
        const cellsInsertedOrDeletedDiff = new LcsDiff(CellSequence.createWithCellId(original.cells), CellSequence.createWithCellId(modified.cells)).ComputeDiff(false);
        const cellDiffInfo = computeDiff(originalModel, modifiedModel, { cellsDiff: { changes: cellsInsertedOrDeletedDiff.changes, quitEarly: false }, metadataChanged: false, }).cellDiffInfo;
        let processedIndex = 0;
        const changes = [];
        cellsInsertedOrDeletedDiff.changes.forEach(change => {
            if (!change.originalLength && change.modifiedLength) {
                // Inserted.
                // Find all modified cells before this.
                const changeIndex = cellDiffInfo.findIndex(c => c.type === 'insert' && c.modifiedCellIndex === change.modifiedStart);
                cellDiffInfo.slice(processedIndex, changeIndex).forEach(c => {
                    if (c.type === 'unchanged' || c.type === 'modified') {
                        const originalCell = original.cells[c.originalCellIndex];
                        const modifiedCell = modified.cells[c.modifiedCellIndex];
                        const changed = c.type === 'modified' || originalCell.getComparisonValue() !== modifiedCell.getComparisonValue();
                        if (changed) {
                            changes.push(new DiffChange(c.originalCellIndex, 1, c.modifiedCellIndex, 1));
                        }
                    }
                });
                changes.push(change);
                processedIndex = changeIndex + 1;
            }
            else if (change.originalLength && !change.modifiedLength) {
                // Deleted.
                // Find all modified cells before this.
                const changeIndex = cellDiffInfo.findIndex(c => c.type === 'delete' && c.originalCellIndex === change.originalStart);
                cellDiffInfo.slice(processedIndex, changeIndex).forEach(c => {
                    if (c.type === 'unchanged' || c.type === 'modified') {
                        const originalCell = original.cells[c.originalCellIndex];
                        const modifiedCell = modified.cells[c.modifiedCellIndex];
                        const changed = c.type === 'modified' || originalCell.getComparisonValue() !== modifiedCell.getComparisonValue();
                        if (changed) {
                            changes.push(new DiffChange(c.originalCellIndex, 1, c.modifiedCellIndex, 1));
                        }
                    }
                });
                changes.push(change);
                processedIndex = changeIndex + 1;
            }
            else {
                // This could be a situation where a cell has been deleted on left and inserted on the right.
                // E.g. markdown cell deleted and code cell inserted.
                // But LCS shows them as a modification.
                const changeIndex = cellDiffInfo.findIndex(c => (c.type === 'delete' && c.originalCellIndex === change.originalStart) || (c.type === 'insert' && c.modifiedCellIndex === change.modifiedStart));
                cellDiffInfo.slice(processedIndex, changeIndex).forEach(c => {
                    if (c.type === 'unchanged' || c.type === 'modified') {
                        const originalCell = original.cells[c.originalCellIndex];
                        const modifiedCell = modified.cells[c.modifiedCellIndex];
                        const changed = c.type === 'modified' || originalCell.getComparisonValue() !== modifiedCell.getComparisonValue();
                        if (changed) {
                            changes.push(new DiffChange(c.originalCellIndex, 1, c.modifiedCellIndex, 1));
                        }
                    }
                });
                changes.push(change);
                processedIndex = changeIndex + 1;
            }
        });
        cellDiffInfo.slice(processedIndex).forEach(c => {
            if (c.type === 'unchanged' || c.type === 'modified') {
                const originalCell = original.cells[c.originalCellIndex];
                const modifiedCell = modified.cells[c.modifiedCellIndex];
                const changed = c.type === 'modified' || originalCell.getComparisonValue() !== modifiedCell.getComparisonValue();
                if (changed) {
                    changes.push(new DiffChange(c.originalCellIndex, 1, c.modifiedCellIndex, 1));
                }
            }
        });
        return {
            metadataChanged,
            cellsDiff: {
                changes,
                quitEarly: false
            }
        };
    }
    canComputeDiffWithCellIds(original, modified) {
        return this.canComputeDiffWithCellInternalIds(original, modified) || this.canComputeDiffWithCellMetadataIds(original, modified);
    }
    canComputeDiffWithCellInternalIds(original, modified) {
        const originalCellIndexIds = original.cells.map((cell, index) => ({ index, id: (cell.internalMetadata?.internalId || '') }));
        const modifiedCellIndexIds = modified.cells.map((cell, index) => ({ index, id: (cell.internalMetadata?.internalId || '') }));
        // If we have a cell without an id, do not use metadata.id for diffing.
        if (originalCellIndexIds.some(c => !c.id) || modifiedCellIndexIds.some(c => !c.id)) {
            return false;
        }
        // If none of the ids in original can be found in modified, then we can't use metadata.id for diffing.
        // I.e. everything is new, no point trying.
        return originalCellIndexIds.some(c => modifiedCellIndexIds.find(m => m.id === c.id));
    }
    canComputeDiffWithCellMetadataIds(original, modified) {
        const originalCellIndexIds = original.cells.map((cell, index) => ({ index, id: (cell.metadata?.id || '') }));
        const modifiedCellIndexIds = modified.cells.map((cell, index) => ({ index, id: (cell.metadata?.id || '') }));
        // If we have a cell without an id, do not use metadata.id for diffing.
        if (originalCellIndexIds.some(c => !c.id) || modifiedCellIndexIds.some(c => !c.id)) {
            return false;
        }
        // If none of the ids in original can be found in modified, then we can't use metadata.id for diffing.
        // I.e. everything is new, no point trying.
        if (originalCellIndexIds.every(c => !modifiedCellIndexIds.find(m => m.id === c.id))) {
            return false;
        }
        // Internally we use internalMetadata.cellId for diffing, hence update the internalMetadata.cellId
        original.cells.map((cell, index) => {
            cell.internalMetadata = cell.internalMetadata || {};
            cell.internalMetadata.internalId = cell.metadata?.id || '';
        });
        modified.cells.map((cell, index) => {
            cell.internalMetadata = cell.internalMetadata || {};
            cell.internalMetadata.internalId = cell.metadata?.id || '';
        });
        return true;
    }
    isOriginalCellMatchedWithModifiedCell(originalCell) {
        return (originalCell.internalMetadata?.internalId || '').startsWith(PREFIX_FOR_UNMATCHED_ORIGINAL_CELLS);
    }
    updateCellIdsBasedOnMappings(mappings, originalCells, modifiedCells) {
        const uuids = new Map();
        originalCells.map((cell, index) => {
            cell.internalMetadata = cell.internalMetadata || { internalId: '' };
            cell.internalMetadata.internalId = `${PREFIX_FOR_UNMATCHED_ORIGINAL_CELLS}${generateUuid()}`;
            const found = mappings.find(r => r.original === index);
            if (found) {
                // Do not use the indexes as ids.
                // If we do, then the hashes will be very similar except for last digit.
                cell.internalMetadata.internalId = generateUuid();
                uuids.set(found.modified, cell.internalMetadata.internalId);
            }
        });
        modifiedCells.map((cell, index) => {
            cell.internalMetadata = cell.internalMetadata || { internalId: '' };
            cell.internalMetadata.internalId = uuids.get(index) ?? generateUuid();
        });
        return true;
    }
    $canPromptRecommendation(modelUrl) {
        const model = this._getModel(modelUrl);
        const cells = model.cells;
        for (let i = 0; i < cells.length; i++) {
            const cell = cells[i];
            if (cell.cellKind === CellKind.Markup) {
                continue;
            }
            if (cell.language !== 'python') {
                continue;
            }
            const searchParams = new SearchParams('import\\s*pandas|from\\s*pandas', true, false, null);
            const searchData = searchParams.parseSearchRequest();
            if (!searchData) {
                continue;
            }
            const builder = new PieceTreeTextBufferBuilder();
            builder.acceptChunk(cell.getValue());
            const bufferFactory = builder.finish(true);
            const textBuffer = bufferFactory.create(cell.eol).textBuffer;
            const lineCount = textBuffer.getLineCount();
            const maxLineCount = Math.min(lineCount, 20);
            const range = new Range(1, 1, maxLineCount, textBuffer.getLineLength(maxLineCount) + 1);
            const cellMatches = textBuffer.findMatchesLineByLine(range, searchData, true, 1);
            if (cellMatches.length > 0) {
                return true;
            }
        }
        return false;
    }
    _getModel(uri) {
        return this._models[uri];
    }
}
export function create() {
    return new NotebookWorker();
}
class NotebookTextModelFacade {
    constructor(notebook) {
        this.notebook = notebook;
        this.cells = notebook.cells.map(cell => new NotebookCellTextModelFacade(cell));
    }
}
class NotebookCellTextModelFacade {
    get cellKind() {
        return this.cell.cellKind;
    }
    constructor(cell) {
        this.cell = cell;
    }
    getHashValue() {
        return this.cell.getComparisonValue();
    }
    equal(cell) {
        if (cell.cellKind !== this.cellKind) {
            return false;
        }
        return this.getHashValue() === cell.getHashValue();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tXZWJXb3JrZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9ub3RlYm9vay9jb21tb24vc2VydmljZXMvbm90ZWJvb2tXZWJXb3JrZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFDaEcsT0FBTyxFQUEwQixPQUFPLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUMxRixPQUFPLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxVQUFVLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUU5RSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFFeEQsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0sc0ZBQXNGLENBQUM7QUFDbEksT0FBTyxFQUFFLFFBQVEsRUFBbUksdUJBQXVCLEVBQW9GLE1BQU0sc0JBQXNCLENBQUM7QUFDNVIsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUNyRixPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sMkVBQTJFLENBQUM7QUFHeEcsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQy9ELE9BQU8sRUFBRSwyQkFBMkIsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBQ3hFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDM0UsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBRWpELE1BQU0sbUNBQW1DLEdBQUcsdUJBQXVCLENBQUM7QUFFcEUsTUFBTSxVQUFVO0lBR2YsSUFBVyxHQUFHO1FBQ2IsT0FBTyxJQUFJLENBQUMs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