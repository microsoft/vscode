/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isEqual } from '../../../../../../base/common/resources.js';
import { Disposable, IReference, ReferenceCollection } from '../../../../../../base/common/lifecycle.js';
import { IChatEditingService, IModifiedFileEntry, WorkingSetEntryState } from '../../../../chat/common/chatEditingService.js';
import { INotebookService } from '../../../common/notebookService.js';
import { bufferToStream, VSBuffer } from '../../../../../../base/common/buffer.js';
import { NotebookTextModel } from '../../../common/model/notebookTextModel.js';
import { raceCancellation, ThrottledDelayer } from '../../../../../../base/common/async.js';
import { CellDiffInfo, computeDiff, prettyChanges } from '../../diff/notebookDiffViewModel.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { INotebookEditorWorkerService } from '../../../common/services/notebookWorkerService.js';
import { ChatEditingModifiedFileEntry } from '../../../../chat/browser/chatEditing/chatEditingModifiedFileEntry.js';
import { CellEditType, ICellDto2, ICellReplaceEdit, NotebookData, NotebookSetting } from '../../../common/notebookCommon.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { EditOperation } from '../../../../../../editor/common/core/editOperation.js';
import { INotebookLoggingService } from '../../../common/notebookLoggingService.js';
import { filter } from '../../../../../../base/common/objects.js';
import { INotebookEditorModelResolverService } from '../../../common/notebookEditorModelResolverService.js';
import { SaveReason } from '../../../../../common/editor.js';
import { IChatService } from '../../../../chat/common/chatService.js';
import { createDecorator, IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { INotebookOriginalModelReferenceFactory } from './notebookOriginalModelRefFactory.js';
import { autorun, autorunWithStore, derived, IObservable, observableValue } from '../../../../../../base/common/observable.js';


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
	constructor(
		private readonly model: NotebookTextModel,
		@IChatEditingService _chatEditingService: IChatEditingService,
		@INotebookService private readonly notebookService: INotebookService,
		@IChatService chatService: IChatService,
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
			return session.entries.read(r).find(e => isEqual(e.modifiedURI, model.uri));
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

		this._register(autorun(async (r) => {
			const entry = entryObs.read(r);
			if (!entry) {
				return;
			}
			if (entry.state.read(r) === WorkingSetEntryState.Rejected) {
				await this.revertImpl();
			}
		}));

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
				if (!modifiedModel.isDisposed() && !entry.originalModel.isDisposed() && modifiedModel.getValue() !== entry.originalModel.getValue()) {
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
		if (!this.snapshot) {
			return;
		}
		await this.updateNotebook(this.snapshot.bytes, !this.snapshot.dirty);
		this._diffInfo.set(undefined, undefined);
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

	private async accept(entry: IModifiedFileEntry) {
		const modifiedModel = (entry as ChatEditingModifiedFileEntry).modifiedModel;
		const content = modifiedModel.getValue();
		await this.updateNotebook(VSBuffer.fromString(content), false);
	}

	async getNotebookSerializer() {
		const info = await this.notebookService.withNotebookDataProvider(this.model.viewType);
		return info.serializer;
	}

	private _originalModel?: Promise<NotebookTextModel>;
	private async getOriginalModel(entry: IModifiedFileEntry): Promise<NotebookTextModel> {
		if (!this._originalModel) {
			this._originalModel = this.originalModelRefFactory.getOrCreate(entry, this.model.viewType).then(ref => this._register(ref).object);
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
			cellDiffInfoToApplyEdits.reverse().forEach(diff => {
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
				currentModel.applyEdits(edits, true, undefined, () => undefined, undefined, false);
				edits.length = 0;
			}

			// Next insert.
			cellDiffInfoToApplyEdits.reverse().forEach(diff => {
				if (diff.type === 'modified' || diff.type === 'unchanged') {
					mappings.set(diff.modifiedCellIndex, diff.originalCellIndex);
				}
				if (diff.type === 'insert') {
					const originalIndex = mappings.get(diff.modifiedCellIndex - 1) ?? 0;
					mappings.set(diff.modifiedCellIndex, originalIndex);
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
						index: originalIndex + 1,
						cells: [newCell],
						count: 0
					});
				}
			});
			if (edits.length) {
				currentModel.applyEdits(edits, true, undefined, () => undefined, undefined, false);
				edits.length = 0;
			}

			// Finally update
			cellDiffInfoToApplyEdits.forEach(diff => {
				if (diff.type === 'modified') {
					const cell = currentModel.cells[diff.originalCellIndex];
					const textModel = cell.textModel;
					if (textModel) {
						const newText = modelWithChatEdits.cells[diff.modifiedCellIndex].getValue();
						textModel.pushEditOperations(null, [
							EditOperation.replace(textModel.getFullModelRange(), newText)
						], () => null);
					}
				}
			});

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
