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

		const diff = new LcsDiff(originalSeq, modifiedSeq);
		const diffResult = diff.ComputeDiff(false);

		const originalMetadata = filter(original.metadata, key => !original.transientDocumentMetadata[key]);
		const modifiedMetadata = filter(modified.metadata, key => !modified.transientDocumentMetadata[key]);
		return {
			metadataChanged: JSON.stringify(originalMetadata) !== JSON.stringify(modifiedMetadata),
			cellsDiff: await this.$computeDiffWithCellIds(original, modified) || diffResult,
			// linesDiff: cellLineChanges
		};
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
