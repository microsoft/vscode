/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { IDiffChange, ISequence, LcsDiff } from '../../../../../base/common/diff/diff.js';
import { doHash, hash, numberHash } from '../../../../../base/common/hash.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { IWebWorkerServerRequestHandler } from '../../../../../base/common/worker/webWorker.js';
import { PieceTreeTextBufferBuilder } from '../../../../../editor/common/model/pieceTreeTextBuffer/pieceTreeTextBufferBuilder.js';
import { CellKind, IMainCellDto, INotebookDiffResult, IOutputDto, NotebookCellInternalMetadata, NotebookCellMetadata, NotebookCellsChangedEventDto, NotebookCellsChangeType, NotebookCellTextModelSplice, NotebookDocumentMetadata, TransientDocumentMetadata } from '../notebookCommon.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { SearchParams } from '../../../../../editor/common/model/textModelSearch.js';
import { MirrorModel } from '../../../../../editor/common/services/textModelSync/textModelSync.impl.js';
import { DefaultEndOfLine } from '../../../../../editor/common/model.js';
import { IModelChangedEvent } from '../../../../../editor/common/model/mirrorTextModel.js';
import { filter } from '../../../../../base/common/objects.js';
import { matchCellBasedOnSimilarties } from './notebookCellMatching.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { DiffChange } from '../../../../../base/common/diff/diffChange.js';
import { computeDiff } from '../notebookDiff.js';

const PREFIX_FOR_UNMATCHED_ORIGINAL_CELLS = `unmatchedOriginalCell`;

class MirrorCell {
	private readonly textModel: MirrorModel;
	private _hash?: number;
	public get eol() {
		return this._eol === '\r\n' ? DefaultEndOfLine.CRLF : DefaultEndOfLine.LF;
	}
	constructor(
		public readonly handle: number,
		uri: URI,
		source: string[],
		private readonly _eol: string,
		versionId: number,
		public language: string,
		public cellKind: CellKind,
		public outputs: IOutputDto[],
		public metadata?: NotebookCellMetadata,
		public internalMetadata?: NotebookCellInternalMetadata,

	) {
		this.textModel = new MirrorModel(uri, source, _eol, versionId);
	}

	onEvents(e: IModelChangedEvent) {
		this.textModel.onEvents(e);
		this._hash = undefined;
	}
	getValue(): string {
		return this.textModel.getValue();
	}

	getLinesContent(): string[] {
		return this.textModel.getLinesContent();
	}
	getComparisonValue(): number {
		return this._hash ??= this._getHash();
	}

	private _getHash() {
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

		const digests = this.outputs.flatMap(op =>
			op.outputs.map(o => hash(Array.from(o.data.buffer)))
		);
		for (const digest of digests) {
			hashValue = numberHash(digest, hashValue);
		}

		return hashValue;
	}
}

class MirrorNotebookDocument {
	constructor(
		readonly uri: URI,
		public cells: MirrorCell[],
		public metadata: NotebookDocumentMetadata,
		public transientDocumentMetadata: TransientDocumentMetadata,
	) {
	}

	acceptModelChanged(event: NotebookCellsChangedEventDto) {
		// note that the cell content change is not applied to the MirrorCell
		// but it's fine as if a cell content is modified after the first diff, its position will not change any more
		// TODO@rebornix, but it might lead to interesting bugs in the future.
		event.rawEvents.forEach(e => {
			if (e.kind === NotebookCellsChangeType.ModelChange) {
				this._spliceNotebookCells(e.changes);
			} else if (e.kind === NotebookCellsChangeType.Move) {
				const cells = this.cells.splice(e.index, 1);
				this.cells.splice(e.newIdx, 0, ...cells);
			} else if (e.kind === NotebookCellsChangeType.Output) {
				const cell = this.cells[e.index];
				cell.outputs = e.outputs;
			} else if (e.kind === NotebookCellsChangeType.ChangeCellLanguage) {
				this._assertIndex(e.index);
				const cell = this.cells[e.index];
				cell.language = e.language;
			} else if (e.kind === NotebookCellsChangeType.ChangeCellMetadata) {
				this._assertIndex(e.index);
				const cell = this.cells[e.index];
				cell.metadata = e.metadata;
			} else if (e.kind === NotebookCellsChangeType.ChangeCellInternalMetadata) {
				this._assertIndex(e.index);
				const cell = this.cells[e.index];
				cell.internalMetadata = e.internalMetadata;
			} else if (e.kind === NotebookCellsChangeType.ChangeDocumentMetadata) {
				this.metadata = e.metadata;
			}
		});
	}

	private _assertIndex(index: number): void {
		if (index < 0 || index >= this.cells.length) {
			throw new Error(`Illegal index ${index}. Cells length: ${this.cells.length}`);
		}
	}

	_spliceNotebookCells(splices: NotebookCellTextModelSplice<IMainCellDto>[]) {
		splices.reverse().forEach(splice => {
			const cellDtos = splice[2];
			const newCells = cellDtos.map(cell => {
				return new MirrorCell(
					cell.handle,
					URI.parse(cell.url),
					cell.source,
					cell.eol,
					cell.versionId,
					cell.language,
					cell.cellKind,
					cell.outputs,
					cell.metadata,
				);
			});

			this.cells.splice(splice[0], splice[1], ...newCells);
		});
	}
}

class CellSequence implements ISequence {

	static create(textModel: MirrorNotebookDocument) {
		const hashValue = textModel.cells.map(c => c.getComparisonValue());
		return new CellSequence(hashValue);
	}
	static createWithCellId(cells: MirrorCell[], includeCellContents?: boolean) {
		const hashValue = cells.map((c) => {
			if (includeCellContents) {
				return `${doHash(c.internalMetadata?.internalId, numberHash(104579, 0))}#${c.getComparisonValue()}`;
			} else {
				return `${doHash(c.internalMetadata?.internalId, numberHash(104579, 0))}}`;
			}
		});
		return new CellSequence(hashValue);
	}

	constructor(readonly hashValue: number[] | string[]) { }

	getElements(): string[] | number[] | Int32Array {
		return this.hashValue;
	}
}

export class NotebookWorker implements IWebWorkerServerRequestHandler, IDisposable {
	_requestHandlerBrand: any;

	private _models: { [uri: string]: MirrorNotebookDocument };

	constructor() {
		this._models = Object.create(null);
	}
	dispose(): void {
	}

	public $acceptNewModel(uri: string, metadata: NotebookDocumentMetadata, transientDocumentMetadata: TransientDocumentMetadata, cells: IMainCellDto[]): void {
		this._models[uri] = new MirrorNotebookDocument(URI.parse(uri), cells.map(dto => new MirrorCell(
			dto.handle,
			URI.parse(dto.url),
			dto.source,
			dto.eol,
			dto.versionId,
			dto.language,
			dto.cellKind,
			dto.outputs,
			dto.metadata,
			dto.internalMetadata
		)), metadata, transientDocumentMetadata);
	}

	public $acceptModelChanged(strURL: string, event: NotebookCellsChangedEventDto) {
		const model = this._models[strURL];
		model?.acceptModelChanged(event);
	}

	public $acceptCellModelChanged(strURL: string, handle: number, event: IModelChangedEvent) {
		const model = this._models[strURL];
		model.cells.find(cell => cell.handle === handle)?.onEvents(event);
	}

	public $acceptRemovedModel(strURL: string): void {
		if (!this._models[strURL]) {
			return;
		}
		delete this._models[strURL];
	}

	async $computeDiff(originalUrl: string, modifiedUrl: string): Promise<INotebookDiffResult> {
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
		if (cellMapping.every(c => c.type === 'modified')) {
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
		const changes: IDiffChange[] = [];
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
			} else if (change.originalLength && !change.modifiedLength) {
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
			} else {
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

	canComputeDiffWithCellIds(original: MirrorNotebookDocument, modified: MirrorNotebookDocument): boolean {
		return this.canComputeDiffWithCellInternalIds(original, modified) || this.canComputeDiffWithCellMetadataIds(original, modified);
	}

	canComputeDiffWithCellInternalIds(original: MirrorNotebookDocument, modified: MirrorNotebookDocument): boolean {
		const originalCellIndexIds = original.cells.map((cell, index) => ({ index, id: (cell.internalMetadata?.internalId || '') as string }));
		const modifiedCellIndexIds = modified.cells.map((cell, index) => ({ index, id: (cell.internalMetadata?.internalId || '') as string }));
		// If we have a cell without an id, do not use metadata.id for diffing.
		if (originalCellIndexIds.some(c => !c.id) || modifiedCellIndexIds.some(c => !c.id)) {
			return false;
		}
		// If none of the ids in original can be found in modified, then we can't use metadata.id for diffing.
		// I.e. everything is new, no point trying.
		return originalCellIndexIds.some(c => modifiedCellIndexIds.find(m => m.id === c.id));
	}

	canComputeDiffWithCellMetadataIds(original: MirrorNotebookDocument, modified: MirrorNotebookDocument): boolean {
		const originalCellIndexIds = original.cells.map((cell, index) => ({ index, id: (cell.metadata?.id || '') as string }));
		const modifiedCellIndexIds = modified.cells.map((cell, index) => ({ index, id: (cell.metadata?.id || '') as string }));
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
			cell.internalMetadata.internalId = cell.metadata?.id as string || '';
		});
		modified.cells.map((cell, index) => {
			cell.internalMetadata = cell.internalMetadata || {};
			cell.internalMetadata.internalId = cell.metadata?.id as string || '';
		});
		return true;
	}


	isOriginalCellMatchedWithModifiedCell(originalCell: MirrorCell) {
		return (originalCell.internalMetadata?.internalId as string || '').startsWith(PREFIX_FOR_UNMATCHED_ORIGINAL_CELLS);
	}
	updateCellIdsBasedOnMappings(mappings: { modified: number; original: number }[], originalCells: MirrorCell[], modifiedCells: MirrorCell[]): boolean {
		const uuids = new Map<number, string>();
		originalCells.map((cell, index) => {
			cell.internalMetadata = cell.internalMetadata || { internalId: '' };
			cell.internalMetadata.internalId = `${PREFIX_FOR_UNMATCHED_ORIGINAL_CELLS}${generateUuid()}`;
			const found = mappings.find(r => r.original === index);
			if (found) {
				// Do not use the indexes as ids.
				// If we do, then the hashes will be very similar except for last digit.
				cell.internalMetadata.internalId = generateUuid();
				uuids.set(found.modified, cell.internalMetadata.internalId as string);
			}
		});
		modifiedCells.map((cell, index) => {
			cell.internalMetadata = cell.internalMetadata || { internalId: '' };
			cell.internalMetadata.internalId = uuids.get(index) ?? generateUuid();
		});
		return true;
	}

	$canPromptRecommendation(modelUrl: string): boolean {
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

	protected _getModel(uri: string): MirrorNotebookDocument {
		return this._models[uri];
	}
}

export function create(): IWebWorkerServerRequestHandler {
	return new NotebookWorker();
}

export type CellDiffInfo = {
	originalCellIndex: number;
	modifiedCellIndex: number;
	type: 'unchanged' | 'modified';
} |
{
	originalCellIndex: number;
	type: 'delete';
} |
{
	modifiedCellIndex: number;
	type: 'insert';
};

interface ICell {
	cellKind: CellKind;
	getHashValue(): number;
	equal(cell: ICell): boolean;
}

class NotebookTextModelFacade {
	public readonly cells: readonly ICell[];
	constructor(
		readonly notebook: MirrorNotebookDocument
	) {

		this.cells = notebook.cells.map(cell => new NotebookCellTextModelFacade(cell));
	}

}
class NotebookCellTextModelFacade implements ICell {
	get cellKind(): CellKind {
		return this.cell.cellKind;
	}
	constructor(
		private readonly cell: MirrorCell
	) {
	}
	getHashValue(): number {
		return this.cell.getComparisonValue();
	}
	equal(cell: ICell): boolean {
		if (cell.cellKind !== this.cellKind) {
			return false;
		}
		return this.getHashValue() === cell.getHashValue();
	}

}
