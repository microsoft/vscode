/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { IDiffResult, ISequence, LcsDiff } from '../../../../../base/common/diff/diff.js';
import { doHash, numberHash } from '../../../../../base/common/hash.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { IRequestHandler, IWorkerServer } from '../../../../../base/common/worker/simpleWorker.js';
import { PieceTreeTextBufferBuilder } from '../../../../../editor/common/model/pieceTreeTextBuffer/pieceTreeTextBufferBuilder.js';
import { CellKind, IMainCellDto, INotebookDiffResult, IOutputDto, NotebookCellInternalMetadata, NotebookCellMetadata, NotebookCellsChangedEventDto, NotebookCellsChangeType, NotebookCellTextModelSplice, NotebookDocumentMetadata, TransientDocumentMetadata } from '../notebookCommon.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { SearchParams } from '../../../../../editor/common/model/textModelSearch.js';
import { MirrorModel } from '../../../../../editor/common/services/textModelSync/textModelSync.impl.js';
import { DefaultEndOfLine } from '../../../../../editor/common/model.js';
import { IModelChangedEvent } from '../../../../../editor/common/model/mirrorTextModel.js';
import { filter } from '../../../../../base/common/objects.js';
import { distance } from './levenshtein.js';

class MirrorCell {
	private readonly textModel: MirrorModel;
	private _hash?: Promise<number>;
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

	async getComparisonValue(): Promise<number> {
		return this._hash ??= this._getHash();
	}

	private async _getHash() {
		let hashValue = numberHash(104579, 0);

		hashValue = doHash(this.language, hashValue);
		hashValue = doHash(this.getValue(), hashValue);
		hashValue = doHash(this.metadata, hashValue);
		hashValue = doHash({ ...this.internalMetadata, 'cellId': '' }, hashValue);
		for (const op of this.outputs) {
			hashValue = doHash(op.metadata, hashValue);
			for (const output of op.outputs) {
				hashValue = doHash(output.mime, hashValue);
			}
		}

		// note: hash has not updated within the Promise.all since we must retain order
		const digests = await Promise.all(this.outputs.flatMap(op =>
			op.outputs.map(o => crypto.subtle.digest('sha-1', o.data.buffer))
		));
		for (const digest of digests) {
			hashValue = numberHash(new Int32Array(digest)[0], hashValue);
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

	static async create(textModel: MirrorNotebookDocument) {
		const hashValue = new Int32Array(textModel.cells.length);
		await Promise.all(textModel.cells.map(async (c, i) => {
			hashValue[i] = await c.getComparisonValue();
		}));
		return new CellSequence(hashValue);
	}

	static async createWithCellId(textModel: MirrorNotebookDocument): Promise<Map<string, number>> {
		const hashValue = new Map<string, number>();
		await Promise.all(textModel.cells.map(async (c, i) => {
			const value = await c.getComparisonValue();
			const id: string = (c.metadata?.id || '') as string;
			hashValue.set(id, value);
		}));
		return hashValue;
	}

	constructor(readonly hashValue: Int32Array) { }

	getElements(): string[] | number[] | Int32Array {
		return this.hashValue;
	}
}

export class NotebookEditorSimpleWorker implements IRequestHandler, IDisposable {
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

		const [originalSeq, modifiedSeq] = await Promise.all([
			CellSequence.create(original),
			CellSequence.create(modified),
		]);

		const originalMetadata = filter(original.metadata, key => !original.transientDocumentMetadata[key]);
		const modifiedMetadata = filter(modified.metadata, key => !modified.transientDocumentMetadata[key]);
		const metadataChanged = JSON.stringify(originalMetadata) !== JSON.stringify(modifiedMetadata);

		// Always try to match the cells, and if matched then update the cell Ids.
		this.matchCellsAndUpdateCellIds(original, modified);

		const cellsDiff = await this.$computeDiffWithCellIds(original, modified);
		if (cellsDiff) {
			return {
				metadataChanged,
				cellsDiff
			};
		} else {
			const diff = new LcsDiff(originalSeq, modifiedSeq);
			const cellsDiff = diff.ComputeDiff(false);
			return {
				metadataChanged,
				cellsDiff
			};
		}
	}

	async $computeDiffWithCellIds(original: MirrorNotebookDocument, modified: MirrorNotebookDocument): Promise<IDiffResult | undefined> {
		const originalCellIndexIds = original.cells.map((cell, index) => ({ index, id: (cell.metadata?.id || '') as string }));
		const modifiedCellIndexIds = modified.cells.map((cell, index) => ({ index, id: (cell.metadata?.id || '') as string }));
		const originalCellIds = originalCellIndexIds.map(c => c.id);
		const modifiedCellIds = modifiedCellIndexIds.map(c => c.id);
		const orderOrOriginalCellIds = originalCellIds.filter(id => modifiedCellIds.includes(id)).join(',');
		const orderOrModifiedCellIds = modifiedCellIds.filter(id => originalCellIds.includes(id)).join(',');
		if (originalCellIndexIds.some(c => !c.id) || modifiedCellIndexIds.some(c => !c.id) || orderOrOriginalCellIds !== orderOrModifiedCellIds) {
			return;
		}

		const diffResult: IDiffResult = { changes: [], quitEarly: false, };

		const computeCellHashesById = async (notebook: MirrorNotebookDocument) => {
			const hashValue = new Map<string, number>();
			await Promise.all(notebook.cells.map(async (c, i) => {
				const value = await c.getComparisonValue();
				// Verified earlier that these cannot be empty.
				const id: string = (c.metadata?.id || '') as string;
				hashValue.set(id, value);
			}));
			return hashValue;
		};

		const [originalSeq, modifiedSeq] = await Promise.all([computeCellHashesById(original), computeCellHashesById(modified)]);

		while (modifiedCellIndexIds.length) {
			const modifiedCell = modifiedCellIndexIds.shift()!;
			const originalCell = originalCellIndexIds.find(c => c.id === modifiedCell.id);
			if (originalCell) {
				// Everything before this cell is a deletion
				const index = originalCellIndexIds.indexOf(originalCell);
				const deletedFromOriginal = originalCellIndexIds.splice(0, index + 1);

				if (deletedFromOriginal.length === 1) {
					if (originalSeq.get(originalCell.id) === modifiedSeq.get(originalCell.id)) {
						// Cell contents are the same.
						// No changes, hence ignore this cell.
					}
					else {
						diffResult.changes.push({
							originalStart: originalCell.index,
							originalLength: 1,
							modifiedStart: modifiedCell.index,
							modifiedLength: 1
						});
					}
				} else {
					// This means we have some cells before this and they were removed.
					diffResult.changes.push({
						originalStart: deletedFromOriginal[0].index,
						originalLength: deletedFromOriginal.length - 1,
						modifiedStart: modifiedCell.index,
						modifiedLength: 0
					});
				}
				continue;
			}
			else {
				// This is a new cell.
				diffResult.changes.push({
					originalStart: originalCellIndexIds.length ? originalCellIndexIds[0].index : original.cells.length,
					originalLength: 0,
					modifiedStart: modifiedCell.index,
					modifiedLength: 1
				});
			}
		}

		// If we still have some original cells, then those have been removed.
		if (originalCellIndexIds.length) {
			diffResult.changes.push({
				originalStart: originalCellIndexIds[0].index,
				originalLength: originalCellIndexIds.length,
				modifiedStart: modifiedCellIndexIds.length,
				modifiedLength: 0
			});
		}

		return diffResult;
	}

	matchCells(originalUrl: string, modifiedUrl: string) {
		const original = this._getModel(originalUrl);
		const modified = this._getModel(modifiedUrl);
		return this.matchCellBasedOnSimilarties(modified.cells, original.cells);
	}

	matchCellsAndUpdateCellIds(original: MirrorNotebookDocument, modified: MirrorNotebookDocument): boolean {
		const result = this.matchCellBasedOnSimilarties(modified.cells, original.cells);
		// We are only interested in cases where the user has inserted/deleted/modified cells.
		// Re-ordering cells is out of scope for now.
		if (result.some((current, i) => (i === 0 || current.original === -1) ? false : (result[i - 1].original > 0 ? result[i - 1].original > current.original : false))) {
			return false;
		}
		original.cells.map((cell, index) => {
			cell.metadata = { id: Date.now().toString() + index.toString() };
			const found = result.find(r => r.original === index);
			if (found) {
				cell.metadata.id = found.modified.toString();
			}
		});
		modified.cells.map((cell, index) => {
			cell.metadata = { id: Date.now().toString() + index.toString() + 'Modified' };
			cell.metadata.id = result.find(r => r.modified === index)!.modified.toString();
		});
		return true;
	}

	matchCellBasedOnSimilarties(modifiedCells: MirrorCell[], originalCells: MirrorCell[]): { modified: number; original: number; dist: number; percentage: number; possibleOriginal: number }[] {
		const cache: CellDistanceCache = {
			modifiedToOriginal: new Map<ModifiedIndex, Map<OriginalIndex, { distance: Distance }>>(),
			originalToModified: new Map<OriginalIndex, Map<ModifiedIndex, { distance: Distance }>>(),
		};
		const results: { modified: number; original: number; dist: number; percentage: number; possibleOriginal: number }[] = [];
		const mappedOriginalCellToModifiedCell = new Map<number, number>();
		const mappedModifiedIndexes = new Set<number>();
		const originalIndexWithLongestDistance = new Map<number, { dist: number; modifiedIndex: number }>();
		const canOriginalIndexBeMappedToModifiedIndex = (originalIndex: number, value: { distance: Distance }) => {
			if (mappedOriginalCellToModifiedCell.has(originalIndex)) {
				return false;
			}
			const existingDistance = originalIndexWithLongestDistance.get(originalIndex)?.dist ?? Number.MAX_SAFE_INTEGER;
			return value.distance < existingDistance;
		};
		const trackMappedIndexes = (modifiedIndex: number, originalIndex: number) => {
			mappedOriginalCellToModifiedCell.set(originalIndex, modifiedIndex);
			mappedModifiedIndexes.add(modifiedIndex);
		};

		for (let i = 0; i < modifiedCells.length; i++) {
			const modifiedCell = modifiedCells[i];
			const { index, dist, percentage } = this.computeClosestCell({ cell: modifiedCell, index: i }, originalCells, true, cache, canOriginalIndexBeMappedToModifiedIndex);
			if (index >= 0 && dist === 0) {
				trackMappedIndexes(i, index);
				results.push({ modified: i, original: index, dist, percentage, possibleOriginal: index });
			} else {
				originalIndexWithLongestDistance.set(index, { dist: dist, modifiedIndex: i });
				results.push({ modified: i, original: -1, dist: dist, percentage, possibleOriginal: index });
			}
		}

		results.forEach((result, i) => {
			if (result.original >= 0) {
				return;
			}

			/**
			 * I.e. Assume you have the following
			 * =================
			 * A a (this has ben matched)
			 * B b <not matched>
			 * C c <not matched>
			 * D d (these two have been matched)
			 * e e
			 * f f
			 * =================
			 * Just match A => a, B => b, C => c
			 */
			// Find the next cell that has been matched.
			const previousMatchedCell = i > 0 ? results.slice(0, i - 1).reverse().find(r => r.original >= 0) : undefined;
			const previousMatchedOriginalIndex = previousMatchedCell?.original ?? -1;
			const previousMatchedModifiedIndex = previousMatchedCell?.modified ?? -1;
			const matchedCell = results.slice(i + 1).find(r => r.original >= 0);
			const unavailableIndexes = new Set<number>();
			const nextMatchedModifiedIndex = results.findIndex((item, idx) => idx > i && item.original >= 0);
			const nextMatchedOriginalIndex = nextMatchedModifiedIndex >= 0 ? results[nextMatchedModifiedIndex].original : -1;
			// Find the available indexes that we can match with.
			// We are only interested in b and c (anything after d is of no use).
			originalCells.forEach((_, i) => {
				if (mappedOriginalCellToModifiedCell.has(i)) {
					unavailableIndexes.add(i);
					return;
				}
				if (matchedCell && i >= matchedCell.original) {
					unavailableIndexes.add(i);
				}
				if (nextMatchedOriginalIndex >= 0 && i > nextMatchedOriginalIndex) {
					unavailableIndexes.add(i);
				}
			});


			const modifiedCell = modifiedCells[i];
			/**
			 * I.e. Assume you have the following
			 * =================
			 * A a (this has ben matched)
			 * B b <not matched because the % of change is too high, but we do have a probable match>
			 * C c <not matched>
			 * D d (these two have been matched)
			 * e e
			 * f f
			 * =================
			 * Given that we have a probable match for B => b, we can match it.
			 */
			if (result.original === -1 && result.possibleOriginal >= 0 && !unavailableIndexes.has(result.possibleOriginal) && canOriginalIndexBeMappedToModifiedIndex(result.possibleOriginal, { distance: result.dist })) {
				trackMappedIndexes(i, result.possibleOriginal);
				result.original = result.possibleOriginal;
				return;
			}


			/**
			 * I.e. Assume you have the following
			 * =================
			 * A a (this has ben matched)
			 * B b <not matched>
			 * C c <not matched>
			 * D d (these two have been matched)
			 * =================
			 * Its possible that B matches better with c and C matches better with b.
			 * However given the fact that we have matched A => a and D => d.
			 * & if the indexes are an exact match.
			 * I.e. index of D in Modified === index of d in Original, and index of A in Modified === index of a in Original.
			 * Then this means there are absolutely no modifications.
			 * Hence we can just assign the indexes as is.
			*/
			if (previousMatchedOriginalIndex > 0 && previousMatchedModifiedIndex > 0 && previousMatchedOriginalIndex === previousMatchedModifiedIndex) {
				if ((nextMatchedModifiedIndex ?? modifiedCells.length - 1) === (nextMatchedOriginalIndex ?? originalCells.length - 1) && !unavailableIndexes.has(i) && i < originalCells.length) {
					trackMappedIndexes(i, i);
					result.original = i;
					return;
				}
			}
			/**
			 * I.e. Assume you have the following
			 * =================
			 * A a (this has ben matched)
			 * B b <not matched>
			 * C c <not matched>
			 * D d (these two have been matched)
			 * e e
			 * f f
			 * =================
			 * We can now try to match B with b and c and figure out which is best.
			 * RULE 1. Its possible that B will match best with c, howevber C matches better with c, meaning we should match B with b.
			 * To do this, we need to see if c has a better match with something else.
			*/
			// RULE 1
			// Try to find the next best match, but exclucde items that have a better match.
			const { index, percentage } = this.computeClosestCell({ cell: modifiedCell, index: i }, originalCells, false, cache, (originalIndex: number, originalValue: { distance: Distance }) => {
				if (unavailableIndexes.has(originalIndex)) {
					return false;
				}

				if (nextMatchedModifiedIndex > 0 || previousMatchedOriginalIndex > 0) {
					// See if we have a beter match for this.
					const matchesForThisOriginalIndex = cache.originalToModified.get(originalIndex);
					if (matchesForThisOriginalIndex && previousMatchedOriginalIndex < originalIndex) {
						const betterMatch = Array.from(matchesForThisOriginalIndex).find(([modifiedIndex, value]) => {
							if (modifiedIndex === i) {
								// This is the same modifeid entry.
								return false;
							}
							if (modifiedIndex >= nextMatchedModifiedIndex) {
								// We're only interested in matches that are before the next matched index.
								return false;
							}
							if (mappedModifiedIndexes.has(i)) {
								// This has already been matched.
								return false;
							}
							return value.distance < originalValue.distance;
						});
						if (betterMatch) {
							// We do have a better match for this, hence do not use this.
							return false;
						}
					}
				}
				return !unavailableIndexes.has(originalIndex);
			});

			/**
			 * I.e. Assume you have the following
			 * =================
			 * A a (this has ben matched)
			 * B bbbbbbbbbbbbbb <not matched>
			 * C cccccccccccccc <not matched>
			 * D d (these two have been matched)
			 * e e
			 * f f
			 * =================
			 * RULE 1 . Now when attempting to match `bbbbbbbbbbbb` with B, the distance is very high and the percentage is also very high.
			 * Basically majority of the text needs to be changed.
			 * However if the indexes line up perfectly well, and this is the best match, then use it.
			*
			 * Similarly its possible we're trying to match b with `BBBBBBBBBBBB` and the distance is very high, but the indexes line up perfectly well.
			*
			* RULE 2. However it is also possible that there's a better match with another cell
			* Assume we have
			 * =================
			 * AAAA     a (this has been matched)
			 * bbbbbbbb b <not matched>
			 * bbbb     c <not matched>
			 * dddd     d (these two have been matched)
			 * =================
			 * In this case if we use the algorithm of (1) above, we'll end up matching bbbb with b, and bbbbbbbb with c.
			 * But we're not really sure if this is the best match.
			 * In such cases try to match with the same cell index.
			 *
			*/
			// RULE 1 (got a match and the indexes line up perfectly well, use it regardless of the distance).
			if (index >= 0 && i > 0 && results[i - 1].original === index - 1) {
				trackMappedIndexes(i, index);
				results[i].original = index;
				return;
			}

			// RULE 2
			// Here we know that `AAAA => a`
			// Check if the previous cell has been matched.
			// And if the next modified and next original cells are a match.
			const nextOriginalCell = (i > 0 && originalCells.length > results[i - 1].original) ? results[i - 1].original + 1 : -1;
			const nextOriginalCellValue = i > 0 && nextOriginalCell >= 0 && nextOriginalCell < originalCells.length ? originalCells[nextOriginalCell].getValue() : undefined;
			if (index >= 0 && i > 0 && typeof nextOriginalCellValue === 'string' && !mappedOriginalCellToModifiedCell.has(nextOriginalCell)) {
				if (modifiedCell.getValue().includes(nextOriginalCellValue) || nextOriginalCellValue.includes(modifiedCell.getValue())) {
					trackMappedIndexes(i, nextOriginalCell);
					results[i].original = nextOriginalCell;
					return;
				}
			}

			if (percentage < 90 || (i === 0 && results.length === 1)) {
				trackMappedIndexes(i, index);
				results[i].original = index;
				return;
			}
		});

		return results;
	}


	computeClosestCell({ cell, index: cellIndex }: { cell: MirrorCell; index: number }, arr: readonly MirrorCell[], ignoreEmptyCells: boolean, cache: CellDistanceCache, canOriginalIndexBeMappedToModifiedIndex: (originalIndex: number, value: { distance: Distance }) => boolean): { index: number; dist: number; percentage: number } {
		let min_distance = Infinity;
		let min_index = -1;
		for (let i = 0; i < arr.length; i++) {
			// Skip cells that are not of the same kind.
			if (arr[i].cellKind !== cell.cellKind) {
				continue;
			}
			const str = arr[i].getValue();
			const cacheEntry = cache.modifiedToOriginal.get(cellIndex) ?? new Map<OriginalIndex, { distance: Distance }>();
			const value = cacheEntry.get(i) ?? { distance: distance(cell.getValue(), str), };
			cacheEntry.set(i, value);
			cache.modifiedToOriginal.set(cellIndex, cacheEntry);

			const originalCacheEntry = cache.originalToModified.get(i) ?? new Map<ModifiedIndex, { distance: Distance }>();
			originalCacheEntry.set(cellIndex, value);
			cache.originalToModified.set(i, originalCacheEntry);

			if (!canOriginalIndexBeMappedToModifiedIndex(i, value)) {
				continue;
			}
			if (str.length === 0 && ignoreEmptyCells) {
				continue;
			}
			if (str === cell.getValue() && cell.getValue().length > 0) {
				return { index: i, dist: 0, percentage: 0 };
			}

			if (value.distance < min_distance) {
				min_distance = value.distance;
				min_index = i;
			}
		}

		if (min_index === -1) {
			return { index: -1, dist: Number.MAX_SAFE_INTEGER, percentage: Number.MAX_SAFE_INTEGER };
		}
		const percentage = !cell.getValue().length && !arr[min_index].getValue().length ? 0 : (cell.getValue().length ? (min_distance * 100 / cell.getValue().length) : Number.MAX_SAFE_INTEGER);
		return { index: min_index, dist: min_distance, percentage };
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

/**
 * Defines the worker entry point. Must be exported and named `create`.
 * @skipMangle
 */
export function create(workerServer: IWorkerServer): IRequestHandler {
	return new NotebookEditorSimpleWorker();
}

type Distance = number;
type OriginalIndex = number;
type ModifiedIndex = number;
type CellDistanceCache = {
	modifiedToOriginal: Map<ModifiedIndex, Map<OriginalIndex, { distance: Distance }>>;
	originalToModified: Map<OriginalIndex, Map<ModifiedIndex, { distance: Distance }>>;
};
