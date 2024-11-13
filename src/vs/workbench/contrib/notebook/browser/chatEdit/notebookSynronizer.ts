/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isEqual } from '../../../../../base/common/resources.js';
import { Disposable, DisposableStore, IReference, ReferenceCollection } from '../../../../../base/common/lifecycle.js';
import { IModifiedFileEntry } from '../../../chat/common/chatEditingService.js';
import { INotebookService } from '../../common/notebookService.js';
import { bufferToStream, VSBuffer } from '../../../../../base/common/buffer.js';
import { NotebookTextModel } from '../../common/model/notebookTextModel.js';
import { raceCancellation, ThrottledDelayer } from '../../../../../base/common/async.js';
import { CellDiffInfo, computeDiff, prettyChanges } from '../diff/notebookDiffViewModel.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { INotebookEditorWorkerService } from '../../common/services/notebookWorkerService.js';
import { ChatEditingModifiedFileEntry } from '../../../chat/browser/chatEditing/chatEditingModifiedFileEntry.js';
import { CellEditType, ICellDto2, ICellReplaceEdit, NotebookData, NotebookSetting } from '../../common/notebookCommon.js';
import { URI } from '../../../../../base/common/uri.js';
import { Emitter } from '../../../../../base/common/event.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { EditOperation } from '../../../../../editor/common/core/editOperation.js';
import { INotebookLoggingService } from '../../common/notebookLoggingService.js';
import { filter } from '../../../../../base/common/objects.js';
import { INotebookEditorModelResolverService } from '../../common/notebookEditorModelResolverService.js';
import { SaveReason } from '../../../../common/editor.js';
import { IChatService } from '../../../chat/common/chatService.js';
import { createDecorator, IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';


export const INotebookModelSynchronizerFactory = createDecorator<INotebookModelSynchronizerFactory>('INotebookModelSynchronizerFactory');

export interface INotebookModelSynchronizerFactory {
	readonly _serviceBrand: undefined;
	getOrCreate(model: NotebookTextModel, entry: IModifiedFileEntry): IReference<NotebookModelSynchronizer>;
}

class NotebookModelSynchronizerReferenceCollection extends ReferenceCollection<NotebookModelSynchronizer> {
	constructor(@IInstantiationService private readonly instantiationService: IInstantiationService) {
		super();
	}
	protected override createReferencedObject(_key: string, model: NotebookTextModel, entry: IModifiedFileEntry): NotebookModelSynchronizer {
		return this.instantiationService.createInstance(NotebookModelSynchronizer, model, entry);
	}
	protected override destroyReferencedObject(_key: string, object: NotebookModelSynchronizer): void {
		object.dispose();
	}
}

export class NotebookModelSynchronizerFactory implements INotebookModelSynchronizerFactory {
	readonly _serviceBrand: undefined;
	private readonly _data: NotebookModelSynchronizerReferenceCollection;
	constructor(@IInstantiationService instantiationService: IInstantiationService) {
		this._data = instantiationService.createInstance(NotebookModelSynchronizerReferenceCollection);
	}

	getOrCreate(model: NotebookTextModel, entry: IModifiedFileEntry): IReference<NotebookModelSynchronizer> {
		return this._data.acquire(entry.modifiedURI.toString(), model, entry);
	}
}


export class NotebookModelSynchronizer extends Disposable {
	private readonly throttledUpdateNotebookModel = new ThrottledDelayer(200);
	private _currentDiff?: { cellDiff: CellDiffInfo[]; modelVersion: number };
	public get currentDiffInfo(): { cellDiff: CellDiffInfo[]; modelVersion: number } | undefined {
		return this._currentDiff;
	}
	private set currentDiffInfo(value: { cellDiff: CellDiffInfo[]; modelVersion: number }) {
		this._currentDiff = value;
		this._onDidChangeDiffInfo.fire(value);
	}
	private readonly _onDidChangeDiffInfo = this._register(new Emitter<{ cellDiff: CellDiffInfo[]; modelVersion: number }>);
	public readonly onDidChangeDiffInfo = this._onDidChangeDiffInfo.event;
	private readonly _onDidRevert = this._register(new Emitter<boolean>());
	public readonly onDidRevert = this._onDidRevert.event;
	private readonly _onDidAccept = this._register(new Emitter<void>());
	public readonly onDidAccept = this._onDidAccept.event;
	private snapshot?: { bytes: VSBuffer; dirty: boolean };
	private isEditFromUs: boolean = false;
	constructor(
		private readonly model: NotebookTextModel,
		public readonly entry: IModifiedFileEntry,
		@INotebookService private readonly notebookService: INotebookService,
		@IChatService chatService: IChatService,
		@INotebookLoggingService private readonly logService: INotebookLoggingService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@INotebookEditorWorkerService private readonly notebookEditorWorkerService: INotebookEditorWorkerService,
		@INotebookEditorModelResolverService private readonly notebookModelResolverService: INotebookEditorModelResolverService,
	) {
		super();

		this._register(chatService.onDidPerformUserAction(async e => {
			if (e.action.kind === 'chatEditingSessionAction' && !e.action.hasRemainingEdits && isEqual(e.action.uri, entry.modifiedURI)) {
				if (e.action.outcome === 'accepted') {
					await this.accept();
					await this.createSnapshot();
					this._onDidAccept.fire();
				}
				else if (e.action.outcome === 'rejected') {
					if (await this.revert()) {
						this._onDidRevert.fire(true);
					}
				}
			}
		}));

		const cancellationTokenStore = this._register(new DisposableStore());
		let cancellationToken = cancellationTokenStore.add(new CancellationTokenSource());
		const updateNotebookModel = (entry: IModifiedFileEntry, token: CancellationToken) => {
			this.throttledUpdateNotebookModel.trigger(() => this.updateNotebookModel(entry, token));
		};
		const modifiedModel = (entry as ChatEditingModifiedFileEntry).modifiedModel;
		this._register(modifiedModel.onDidChangeContent(async () => {
			cancellationTokenStore.clear();
			if (!modifiedModel.isDisposed() && !entry.originalModel.isDisposed() && modifiedModel.getValue() === entry.originalModel.getValue()) {
				if (await this.revert()) {
					this._onDidRevert.fire(true);
				}
				return;
			}
			cancellationToken = cancellationTokenStore.add(new CancellationTokenSource());
			updateNotebookModel(entry, cancellationToken.token);
		}));
		this._register(model.onDidChangeContent(() => {
			// Track changes from the user.
			if (!this.isEditFromUs && this.snapshot) {
				this.snapshot.dirty = true;
			}
		}));

		updateNotebookModel(entry, cancellationToken.token);


	}

	public async createSnapshot() {
		const [serializer, ref] = await Promise.all([
			this.getNotebookSerializer(),
			this.notebookModelResolverService.resolve(this.model.uri)
		]);

		try {
			const data: NotebookData = {
				metadata: filter(this.model.metadata, key => !serializer.options.transientDocumentMetadata[key]),
				cells: [],
			};

			let outputSize = 0;
			for (const cell of this.model.cells) {
				const cellData: ICellDto2 = {
					cellKind: cell.cellKind,
					language: cell.language,
					mime: cell.mime,
					source: cell.getValue(),
					outputs: [],
					internalMetadata: cell.internalMetadata
				};

				const outputSizeLimit = this.configurationService.getValue<number>(NotebookSetting.outputBackupSizeLimit) * 1024;
				if (outputSizeLimit > 0) {
					cell.outputs.forEach(output => {
						output.outputs.forEach(item => {
							outputSize += item.data.byteLength;
						});
					});
					if (outputSize > outputSizeLimit) {
						return;
					}
				}

				cellData.outputs = !serializer.options.transientOutputs ? cell.outputs : [];
				cellData.metadata = filter(cell.metadata, key => !serializer.options.transientCellMetadata[key]);

				data.cells.push(cellData);
			}

			const bytes = await serializer.notebookToData(data);
			this.snapshot = { bytes, dirty: ref.object.isDirty() };
		} finally {
			ref.dispose();
		}
	}

	private async revert(): Promise<boolean> {
		if (!this.snapshot) {
			return false;
		}
		await this.updateNotebook(this.snapshot.bytes, !this.snapshot.dirty);
		return true;
	}

	private async updateNotebook(bytes: VSBuffer, save: boolean) {
		const ref = await this.notebookModelResolverService.resolve(this.model.uri);
		try {
			const serializer = await this.getNotebookSerializer();
			const data = await serializer.dataToNotebook(bytes);
			this.model.reset(data.cells, data.metadata, serializer.options);

			if (save) {
				// save the file after discarding so that the dirty indicator goes away
				// and so that an intermediate saved state gets reverted
				// await this.notebookEditor.textModel.save({ reason: SaveReason.EXPLICIT });
				await ref.object.save({ reason: SaveReason.EXPLICIT });
			}
		} finally {
			ref.dispose();
		}
	}

	private async accept() {
		const modifiedModel = (this.entry as ChatEditingModifiedFileEntry).modifiedModel;
		const content = modifiedModel.getValue();
		await this.updateNotebook(VSBuffer.fromString(content), false);
	}

	async getNotebookSerializer() {
		const info = await this.notebookService.withNotebookDataProvider(this.model.viewType);
		return info.serializer;
	}

	private async updateNotebookModel(entry: IModifiedFileEntry, token: CancellationToken) {
		const modifiedModelVersion = (entry as ChatEditingModifiedFileEntry).modifiedModel.getVersionId();
		const original = this.model;
		const originalModelVersion = original?.versionId ?? 0;
		const model = await this.getModifiedModelForDiff(entry, token);
		if (!model || token.isCancellationRequested || !original) {
			return;
		}
		const cellDiffInfo = (await this.computeDiff(original, model, token))?.cellDiffInfo;
		const currentVersion = (entry as ChatEditingModifiedFileEntry).modifiedModel.getVersionId();
		if (!cellDiffInfo || token.isCancellationRequested || currentVersion !== modifiedModelVersion || originalModelVersion !== original.versionId) {
			return;
		}
		if (cellDiffInfo.every(d => d.type === 'unchanged')) {
			return;
		}

		// All edits from here on are from us.
		this.isEditFromUs = true;
		try {
			const edits: ICellReplaceEdit[] = [];
			const mappings = new Map<number, number>();

			// First Delete.
			const deletedIndexes: number[] = [];
			cellDiffInfo.reverse().forEach(diff => {
				if (diff.type === 'delete') {
					deletedIndexes.push(diff.originalCellIndex);
					edits.push({
						editType: CellEditType.Replace,
						index: diff.originalCellIndex,
						cells: [],
						count: 1
					});
				}
			});
			if (edits.length) {
				original.applyEdits(edits, true, undefined, () => undefined, undefined, false);
				edits.length = 0;
			}

			// Next insert.
			cellDiffInfo.reverse().forEach(diff => {
				if (diff.type === 'modified' || diff.type === 'unchanged') {
					mappings.set(diff.modifiedCellIndex, diff.originalCellIndex);
				}
				if (diff.type === 'insert') {
					const originalIndex = mappings.get(diff.modifiedCellIndex - 1) ?? 0;
					mappings.set(diff.modifiedCellIndex, originalIndex);
					const cell = model.cells[diff.modifiedCellIndex];
					const newCell: ICellDto2 =
					{
						source: cell.getValue(),
						cellKind: cell.cellKind,
						language: cell.language,
						outputs: cell.outputs.map(output => output.asDto()),
						mime: cell.mime,
						metadata: cell.metadata,
						collapseState: cell.collapseState,
						internalMetadata: cell.internalMetadata
					};
					edits.push({
						editType: CellEditType.Replace,
						index: originalIndex + 1,
						cells: [newCell],
						count: 0
					});
				}
			});
			if (edits.length) {
				original.applyEdits(edits, true, undefined, () => undefined, undefined, false);
				edits.length = 0;
			}

			// Finally update
			cellDiffInfo.forEach(diff => {
				if (diff.type === 'modified') {
					const cell = original.cells[diff.originalCellIndex];
					const textModel = cell.textModel;
					if (textModel) {
						const newText = model.cells[diff.modifiedCellIndex].getValue();
						textModel.pushEditOperations(null, [
							EditOperation.replace(textModel.getFullModelRange(), newText)
						], () => null);
					}
				}
			});

			if (edits.length) {
				original.applyEdits(edits, true, undefined, () => undefined, undefined, false);
			}
			this._onDidRevert.fire(false);
			this.currentDiffInfo = { cellDiff: cellDiffInfo, modelVersion: original.versionId };
		}
		finally {
			this.isEditFromUs = false;
		}
	}
	private previousUriOfModelForDiff?: URI;

	private async getModifiedModelForDiff(entry: IModifiedFileEntry, token: CancellationToken): Promise<NotebookTextModel | undefined> {
		const text = (entry as ChatEditingModifiedFileEntry).modifiedModel.getValue();
		const bytes = VSBuffer.fromString(text);
		const uri = entry.modifiedURI.with({ scheme: `NotebookChatEditorController.modifiedScheme${Date.now().toString()}` });
		const stream = bufferToStream(bytes);
		if (this.previousUriOfModelForDiff) {
			this.notebookService.getNotebookTextModel(this.previousUriOfModelForDiff)?.dispose();
		}
		this.previousUriOfModelForDiff = uri;
		try {
			const model = await this.notebookService.createNotebookTextModel(this.model.viewType, uri, stream);
			if (token.isCancellationRequested) {
				model.dispose();
				return;
			}
			this._register(model);
			return model;
		} catch (ex) {
			this.logService.warn('NotebookChatEdit', `Failed to deserialize Notebook for ${uri.toString}, ${ex.message}`);
			this.logService.debug('NotebookChatEdit', ex.toString());
			return;
		}
	}

	async computeDiff(original: NotebookTextModel, modified: NotebookTextModel, token: CancellationToken) {
		const diffResult = await raceCancellation(this.notebookEditorWorkerService.computeDiff(original.uri, modified.uri), token);
		if (!diffResult || token.isCancellationRequested) {
			// after await the editor might be disposed.
			return;
		}

		prettyChanges(original, modified, diffResult.cellsDiff);

		return computeDiff(original, modified, diffResult);
	}
}
