/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isEqual } from '../../../../../../base/common/resources.js';
import { Disposable, IReference, ReferenceCollection } from '../../../../../../base/common/lifecycle.js';
import { IChatEditingService, IModifiedFileEntry } from '../../../../chat/common/chatEditingService.js';
import { INotebookService } from '../../../common/notebookService.js';
import { bufferToStream, streamToBuffer, VSBuffer } from '../../../../../../base/common/buffer.js';
import { NotebookTextModel } from '../../../common/model/notebookTextModel.js';
import { raceCancellation, ThrottledDelayer } from '../../../../../../base/common/async.js';
import { CellDiffInfo, computeDiff, prettyChanges } from '../../diff/notebookDiffViewModel.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { INotebookEditorWorkerService } from '../../../common/services/notebookWorkerService.js';
import { ChatEditingModifiedFileEntry } from '../../../../chat/browser/chatEditing/chatEditingModifiedFileEntry.js';
import { CellEditType, ICellDto2, ICellEditOperation, ICellReplaceEdit, NotebookData, NotebookSetting } from '../../../common/notebookCommon.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { EditOperation } from '../../../../../../editor/common/core/editOperation.js';
import { INotebookLoggingService } from '../../../common/notebookLoggingService.js';
import { filter } from '../../../../../../base/common/objects.js';
import { INotebookEditorModelResolverService } from '../../../common/notebookEditorModelResolverService.js';
import { IChatService } from '../../../../chat/common/chatService.js';
import { createDecorator, IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { INotebookOriginalModelReferenceFactory } from './notebookOriginalModelRefFactory.js';
import { autorunWithStore, derived, IObservable, observableValue } from '../../../../../../base/common/observable.js';
import { SaveReason } from '../../../../../common/editor.js';
import { ITextModelService } from '../../../../../../editor/common/services/resolverService.js';
import { SnapshotContext } from '../../../../../services/workingCopy/common/fileWorkingCopy.js';
import { INotebookEditorService } from '../../services/notebookEditorService.js';
import { CellEditState } from '../../notebookBrowser.js';


export const INotebookModelSynchronizerFactory = createDecorator<INotebookModelSynchronizerFactory>('INotebookModelSynchronizerFactory');

export interface INotebookModelSynchronizerFactory {
	readonly _serviceBrand: undefined;
	getOrCreate(model: NotebookTextModel): IReference<NotebookModelSynchronizer>;
}

class NotebookModelSynchronizerReferenceCollection extends ReferenceCollection<NotebookModelSynchronizer> {
	constructor(@IInstantiationService private readonly instantiationService: IInstantiationService) {
		super();
	}
	protected override createReferencedObject(_key: string, model: NotebookTextModel): NotebookModelSynchronizer {
		return this.instantiationService.createInstance(NotebookModelSynchronizer, model);
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

	getOrCreate(model: NotebookTextModel): IReference<NotebookModelSynchronizer> {
		return this._data.acquire(model.uri.toString(), model);
	}
}


export class NotebookModelSynchronizer extends Disposable {
	private readonly throttledUpdateNotebookModel = new ThrottledDelayer(200);
	private _diffInfo = observableValue<{ cellDiff: CellDiffInfo[]; modelVersion: number } | undefined>('diffInfo', undefined);
	public get diffInfo(): IObservable<{ cellDiff: CellDiffInfo[]; modelVersion: number } | undefined> {
		return this._diffInfo;
	}
	private snapshot?: { bytes: VSBuffer; dirty: boolean };
	private isEditFromUs: boolean = false;
	private isTextEditFromUs: boolean = false;
	private isReverting = false;
	private throttledTextModelUpdate = new ThrottledDelayer<void>(100);
	constructor(
		private readonly model: NotebookTextModel,
		@IChatEditingService _chatEditingService: IChatEditingService,
		@INotebookService private readonly notebookService: INotebookService,
		@INotebookEditorService private readonly notebookEditorService: INotebookEditorService,
		@IChatService chatService: IChatService,
		@ITextModelService private readonly textModelService: ITextModelService,
		@INotebookLoggingService private readonly logService: INotebookLoggingService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@INotebookEditorWorkerService private readonly notebookEditorWorkerService: INotebookEditorWorkerService,
		@INotebookEditorModelResolverService private readonly notebookModelResolverService: INotebookEditorModelResolverService,
		@INotebookOriginalModelReferenceFactory private readonly originalModelRefFactory: INotebookOriginalModelReferenceFactory,
	) {
		super();

		const entryObs = derived((r) => {
			const session = _chatEditingService.currentEditingSessionObs.read(r);
			if (!session) {
				return;
			}
			return session.readEntry(model.uri, r);
		}).recomputeInitiallyAndOnChange(this._store);


		this._register(chatService.onDidPerformUserAction(async e => {
			const entry = entryObs.read(undefined);
			if (!entry) {
				return;
			}
			if (e.action.kind === 'chatEditingSessionAction' && !e.action.hasRemainingEdits && isEqual(e.action.uri, entry.modifiedURI)) {
				if (e.action.outcome === 'accepted') {
					await this.accept(entry);
					await this.createSnapshot();
					this._diffInfo.set(undefined, undefined);
				}
				else if (e.action.outcome === 'rejected') {
					await this.revertImpl();
				}
			}
		}));

		const updateNotebookModel = (entry: IModifiedFileEntry, token: CancellationToken) => {
			this.throttledUpdateNotebookModel.trigger(() => this.updateNotebookModel(entry, token));
		};

		let snapshotCreated = false;
		this._register(autorunWithStore((r, store) => {
			const entry = entryObs.read(r);
			if (!entry) {
				return;
			}
			if (!snapshotCreated) {
				this.createSnapshot();
				snapshotCreated = true;
			}

			const modifiedModel = (entry as ChatEditingModifiedFileEntry).modifiedModel;
			let cancellationToken = store.add(new CancellationTokenSource());
			store.add(modifiedModel.onDidChangeContent(async () => {
				if (!this.isTextEditFromUs && !modifiedModel.isDisposed() && !entry.originalModel.isDisposed() && modifiedModel.getValue() !== entry.originalModel.getValue()) {
					cancellationToken = store.add(new CancellationTokenSource());
					updateNotebookModel(entry, cancellationToken.token);
				}
			}));

			updateNotebookModel(entry, cancellationToken.token);
		}));

		this._register(model.onDidChangeContent(() => {
			// Track changes from the user.
			if (!this.isEditFromUs && this.snapshot) {
				this.snapshot.dirty = true;
				const entry = entryObs.get();
				if (entry) {
					this.throttledTextModelUpdate.trigger(() => this.updateTextDocumentModel(entry));
				}
			}
		}));
	}

	private async createSnapshot() {
		const [serializer, ref] = await Promise.all([
			this.getNotebookSerializer(),
			this.notebookModelResolverService.resolve(this.model.uri)
		]);

		try {
			const data: NotebookData = {
				metadata: filter(this.model.metadata, key => !serializer.options.transientDocumentMetadata[key]),
				cells: [],
			};

			const indentAmount = this.model.metadata.indentAmount || ref.object.notebook.metadata.indentAmount || undefined;
			if (typeof indentAmount === 'string' && indentAmount) {
				// This is required for ipynb serializer to preserve the whitespace in the notebook.
				data.metadata.indentAmount = indentAmount;
			}

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

	public async revert() {
		await this.revertImpl();
	}

	private async revertImpl(): Promise<void> {
		if (!this.snapshot || this.isReverting) {
			return;
		}
		this.isReverting = true;
		try {
			// NOTE: We must save if the notebook model was not already dirty.
			// Today ModifiedFileEntry class will save the text model to get rid of dirty indicator.
			// If we do not save the notebook model, then ipynb json text document will get saved in ModifiedFileEntry class,
			// and that results in ipynb being saved without going to serializer.
			// Serializer is responsible for adding new line to ipynb files, and that new line will not be added when saving ipynb text document.
			// As a result of this, reverting (creating new edit sessions), result in ipynb files without new line at the end meaning we still end up with a saved ipynb file with changes.
			// Hence we must ensure ipynb notebooks are always saved through serializer.
			// But do this only if the notebook model was not already dirty.
			await this.updateNotebook(this.snapshot.bytes, !this.snapshot.dirty);
		}
		finally {
			this.isReverting = false;
			this._diffInfo.set(undefined, undefined);
		}
	}

	private async updateNotebook(bytes: VSBuffer, saveForRevert: boolean) {
		const oldEditIsFromus = this.isEditFromUs;
		this.isEditFromUs = true;
		const ref = await this.notebookModelResolverService.resolve(this.model.uri);
		try {
			const serializer = await this.getNotebookSerializer();
			const data = await serializer.dataToNotebook(bytes);
			this.model.reset(data.cells, data.metadata, serializer.options);
			if (saveForRevert) {
				// When reverting/creating a new session ModifiedFileEntry will revert and save changes to ipynb text document first, and save the file.
				// This happens in the NotebookSyncrhonizerService which is called from SimpleNotebookEditorModel (NotebookEditorModel.ts).
				// However when creating new sessions, the modified File entry will not exist as its a whole new session,
				// As a result we aren't able to save the ipynb text document and match the last modified date time.
				// Hence the work around implemented in SimpleNotebookEditorModel does not work.
				// Thus we must save the file here igorning the modified since time, but only when reverting.
				await ref.object.save({ reason: SaveReason.EXPLICIT, force: true, ignoreModifiedSince: true } as any);
			}
		} finally {
			ref.dispose();
			this.isEditFromUs = oldEditIsFromus;
		}
	}

	private async accept(entry: IModifiedFileEntry) {
		const modifiedModel = (entry as ChatEditingModifiedFileEntry).modifiedModel;
		const content = modifiedModel.getValue();
		await this.updateNotebook(VSBuffer.fromString(content), false);
		this._diffInfo.set(undefined, undefined);

		// The original notebook model needs to be updated with the latest content.
		const stream = await this.notebookService.createNotebookTextDocumentSnapshot(this.model.uri, SnapshotContext.Save, CancellationToken.None);
		const originalModel = await this.getOriginalModel(entry);
		await this.notebookService.restoreNotebookTextModelFromSnapshot(originalModel.uri, originalModel.viewType, stream);
	}

	private async updateTextDocumentModel(entry: IModifiedFileEntry) {
		const modifiedModel = (entry as ChatEditingModifiedFileEntry).modifiedModel;
		const stream = await this.notebookService.createNotebookTextDocumentSnapshot(this.model.uri, SnapshotContext.Save, CancellationToken.None);
		const buffer = await streamToBuffer(stream);
		const text = new TextDecoder().decode(buffer.buffer);
		this.isTextEditFromUs = true;
		modifiedModel.pushEditOperations(null, [{ range: modifiedModel.getFullModelRange(), text }], () => null);
		this.isTextEditFromUs = false;
	}

	async getNotebookSerializer() {
		const info = await this.notebookService.withNotebookDataProvider(this.model.viewType);
		return info.serializer;
	}

	private _originalModel?: Promise<NotebookTextModel>;
	private async getOriginalModel(entry: IModifiedFileEntry): Promise<NotebookTextModel> {
		if (!this._originalModel) {
			this._originalModel = this.originalModelRefFactory.getOrCreate(entry, this.model.viewType).then(ref => {
				if (this._store.isDisposed) {
					ref.dispose();
					return ref.object;
				} else {
					return this._register(ref).object;
				}
			});
		}
		return this._originalModel;
	}

	private async updateNotebookModel(entry: IModifiedFileEntry, token: CancellationToken) {
		const modifiedModelVersion = (entry as ChatEditingModifiedFileEntry).modifiedModel.getVersionId();
		const currentModel = this.model;
		const modelVersion = currentModel?.versionId ?? 0;
		const modelWithChatEdits = await this.getModifiedModelForDiff(entry, token);
		if (!modelWithChatEdits || token.isCancellationRequested || !currentModel) {
			return;
		}
		const originalModel = await this.getOriginalModel(entry);
		// This is the total diff from the original model to the model with chat edits.
		const cellDiffInfo = (await this.computeDiff(originalModel, modelWithChatEdits, token))?.cellDiffInfo;
		// This is the diff from the current model to the model with chat edits.
		const cellDiffInfoToApplyEdits = (await this.computeDiff(currentModel, modelWithChatEdits, token))?.cellDiffInfo;
		const currentVersion = (entry as ChatEditingModifiedFileEntry).modifiedModel.getVersionId();
		if (!cellDiffInfo || !cellDiffInfoToApplyEdits || token.isCancellationRequested || currentVersion !== modifiedModelVersion || modelVersion !== currentModel.versionId) {
			return;
		}
		if (cellDiffInfoToApplyEdits.every(d => d.type === 'unchanged')) {
			return;
		}

		// All edits from here on are from us.
		this.isEditFromUs = true;
		try {
			const edits: ICellReplaceEdit[] = [];
			const mappings = new Map<number, number>();

			// First Delete.
			const deletedIndexes: number[] = [];
			await Promise.all(cellDiffInfoToApplyEdits.reverse().map(async diff => {
				if (diff.type === 'delete') {
					deletedIndexes.push(diff.originalCellIndex);
					edits.push({
						editType: CellEditType.Replace,
						index: diff.originalCellIndex,
						cells: [],
						count: 1
					});
				}
			}));
			if (edits.length) {
				currentModel.applyEdits(edits, true, undefined, () => undefined, undefined, false);
				edits.length = 0;
			}

			const notebookEditor = this.notebookEditorService.retrieveExistingWidgetFromURI(this.model.uri)?.value;

			// Next insert.
			cellDiffInfoToApplyEdits.reverse().forEach(diff => {
				if (diff.type === 'modified' || diff.type === 'unchanged') {
					mappings.set(diff.modifiedCellIndex, diff.originalCellIndex);
				}
				if (diff.type === 'insert') {
					const originalIndex = mappings.get(diff.modifiedCellIndex - 1) ?? 0;
					mappings.set(diff.modifiedCellIndex, originalIndex);
					const index = currentModel.cells.length ? originalIndex + 1 : originalIndex;
					const cell = modelWithChatEdits.cells[diff.modifiedCellIndex];
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
						index,
						cells: [newCell],
						count: 0
					});
				}
			});
			if (edits.length) {
				currentModel.applyEdits(edits, true, undefined, () => undefined, undefined, false);
				for (const edit of edits.filter(e => e.editType === CellEditType.Replace)) {
					const cell = currentModel.cells[edit.index];
					if (cell) {
						const cellViewModel = notebookEditor?.getCellByHandle(cell.handle);
						cellViewModel?.updateEditState(CellEditState.Editing, 'chatEdit');
					}
				}
				edits.length = 0;
			}

			// Finally update
			await Promise.all(cellDiffInfoToApplyEdits.map(async diff => {
				if (diff.type === 'modified') {
					const cell = currentModel.cells[diff.originalCellIndex];
					// Ensure the models of these cells have been loaded before we update them.
					const cellModelRef = await this.textModelService.createModelReference(cell.uri);
					try {
						const modifiedCell = modelWithChatEdits.cells[diff.modifiedCellIndex];
						if (modifiedCell.cellKind === cell.cellKind) {
							const cellViewModel = notebookEditor?.getCellByHandle(cell.handle);
							cellViewModel?.updateEditState(CellEditState.Editing, 'chatEdit');
							const textModel = cellModelRef.object.textEditorModel;
							textModel.pushEditOperations(null, [
								EditOperation.replace(textModel.getFullModelRange(), modifiedCell.getValue())
							], () => null);
						} else {
							const newCellDto: ICellDto2 =
							{
								source: modifiedCell.getValue(),
								cellKind: modifiedCell.cellKind,
								language: modifiedCell.language,
								outputs: modifiedCell.outputs.map(output => output.asDto()),
								mime: modifiedCell.mime,
								metadata: modifiedCell.metadata,
								collapseState: modifiedCell.collapseState,
								internalMetadata: modifiedCell.internalMetadata
							};
							const edit: ICellEditOperation = {
								editType: CellEditType.Replace,
								index: diff.originalCellIndex,
								cells: [newCellDto],
								count: 1
							};
							currentModel.applyEdits([edit], true, undefined, () => undefined, undefined, false);
							const newCell = currentModel.cells[diff.originalCellIndex];
							const cellViewModel = notebookEditor?.getCellByHandle(newCell.handle);
							cellViewModel?.updateEditState(CellEditState.Editing, 'chatEdit');
						}
					} finally {
						cellModelRef.dispose();
					}
				}
			}));

			if (edits.length) {
				currentModel.applyEdits(edits, true, undefined, () => undefined, undefined, false);
			}
			this._diffInfo.set({ cellDiff: cellDiffInfo, modelVersion: currentModel.versionId }, undefined);
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
