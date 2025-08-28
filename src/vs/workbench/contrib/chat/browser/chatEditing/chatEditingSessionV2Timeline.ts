/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../../../base/common/async.js';
import { decodeHex, encodeHex, VSBuffer } from '../../../../../base/common/buffer.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, thenRegisterOrDispose } from '../../../../../base/common/lifecycle.js';
import { ResourceMap, ResourceSet } from '../../../../../base/common/map.js';
import { autorun, autorunIterableDelta, derived, IObservable, IReader, ObservablePromise, observableSignal, observableValue } from '../../../../../base/common/observable.js';
import { basename } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { TextEdit } from '../../../../../editor/common/languages.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IEditorWorkerService } from '../../../../../editor/common/services/editorWorker.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ICellEditOperation } from '../../../notebook/common/notebookCommon.js';
import { IEditSessionEntryDiff, IModifiedFileEntry, ISnapshotEntry, IStreamingEdits } from '../../common/chatEditingService.js';
import { IChatResponseModel } from '../../common/chatModel.js';
import { ChatEditOperationState, IChatEditingSessionV2, IOperationCheckpoint, IOperationCheckpointPointer, IOperationHistoryManager } from './chatEditingSessionV2.js';
import { AbstractChatEditingV2ModifiedFileEntry } from './chatEditingSessionV2ModifiedFileEntry.js';
import { OperationHistoryManager } from './chatEditingSessionV2OperationHistoryManager.js';
import { ChatFileCreateOperation, ChatTextEditOperation, IChatEditOperation, IOperationResult } from './chatEditingSessionV2Operations.js';
import { ChatEditingSnapshotTextModelContentProvider } from './chatEditingTextModelContentProviders.js';

const LOG_PREFIX = '[ChatEditSession2] ';
const CHECKPOINT_PTR_PREFIX = 'PTR-';
const PENDING_ONLY_REQUEST_ID = 'PENDING-ONLY';
const PENDING_AND_ACCEPTED_REQUEST_ID = 'PENDING-AND-ACCEPTED-ONLY';

/**
 * The main ChatEditingSessionV2 class that coordinates all operations.
 */
export class ChatEditingSessionV2 extends Disposable implements IChatEditingSessionV2 {
	private readonly _operationHistory: OperationHistoryManager;
	private readonly _instantiationService: IInstantiationService;

	private readonly _streamingEditSequencers = new ObservableResourceMutex<IChatResponseModel | undefined>();
	private readonly _individualEditSequencers = new ObservableResourceMutex<void>();

	private readonly _entriesMap = new ResourceMap<AbstractChatEditingV2ModifiedFileEntry>();
	private readonly _entries = observableValue<readonly IModifiedFileEntry[]>('chatEditEntries', []);
	public entries: IObservable<readonly IModifiedFileEntry[]> = this._entries;

	private readonly _onDidDispose = new Emitter<void>();
	public readonly onDidDispose = this._onDidDispose.event;

	public readonly chatSessionId: string;
	public readonly isGlobalEditingSession: boolean;

	constructor(
		opts: { sessionId: string; isGlobalEditingSession: boolean },
		@IInstantiationService instantiationService: IInstantiationService,
		@IFileService private readonly _fileService: IFileService,
		@IModelService private readonly _modelService: IModelService,
		@ILanguageService private readonly _languageService: ILanguageService,
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		this._instantiationService = instantiationService;

		const operationHistory = instantiationService.createInstance(OperationHistoryManager);
		this._operationHistory = operationHistory;
		this.chatSessionId = opts.sessionId;
		this.isGlobalEditingSession = opts.isGlobalEditingSession;

		this._register(autorunIterableDelta(
			reader => operationHistory.filesWithPendingOperations.read(reader),
			({ addedValues, removedValues }) => {
				for (const uri of removedValues) {
					this._entriesMap.get(uri)?.dispose();
					this._entriesMap.delete(uri);
				}

				for (const uri of addedValues) {
					this._entriesMap.set(uri, this._instantiationService.createInstance(
						AbstractChatEditingV2ModifiedFileEntry,
						this.chatSessionId + uri,
						uri,
						this.getSnapshotUri(PENDING_ONLY_REQUEST_ID, uri, undefined),
						this.getSnapshotUri(PENDING_AND_ACCEPTED_REQUEST_ID, uri, undefined),
						this._streamingEditSequencers.heldLocksFor(uri),
						operationHistory,
					));
				}

				this._entries.set([...this._entriesMap.values()], undefined);
			},
			uri => uri.toString(),
		));
	}

	show(previousChanges?: boolean): Promise<void> {
		// todo@connor4312
		return Promise.resolve();
	}

	async restoreSnapshot(requestId: string, stopId: string | undefined): Promise<void> {
		const checkpoint = this._operationHistory.findCheckpoint(requestId, stopId);
		if (!checkpoint) {
			throw new Error('No checkpoint found');
		}

		await this._operationHistory.rollbackToCheckpoint(checkpoint);
	}

	getSnapshotUri(requestId: string, uri: URI, stopId: string | undefined): URI {
		return ChatEditingSnapshotTextModelContentProvider.getSnapshotFileURI(this.chatSessionId, requestId, stopId, `/${encodeHex(VSBuffer.fromString(uri.toString()))}/${basename(uri)}`);
	}

	private getCheckpointUri(checkpoint: IOperationCheckpoint | IOperationCheckpointPointer, uri: URI): URI {
		return this.getSnapshotUri(checkpoint.requestId, uri, IOperationCheckpointPointer.is(checkpoint) ? (CHECKPOINT_PTR_PREFIX + checkpoint.ptr + '/' + checkpoint.operationId) : checkpoint.checkpointId);
	}

	getSnapshotModel(requestId: string, undoStop: string | undefined, snapshotUri: URI): Promise<ITextModel | null> {
		const existing = this._modelService.getModel(snapshotUri);
		if (existing) {
			return Promise.resolve(existing);
		}

		const underylingUri = URI.parse(decodeHex(snapshotUri.path.split('/')[1]).toString());
		let stop: IOperationCheckpoint | IOperationCheckpointPointer | undefined;
		let contents: IObservable<string | undefined>;
		if (requestId === PENDING_ONLY_REQUEST_ID) {
			contents = this._operationHistory.readOnlyAcceptedChanges(underylingUri);
		} else if (requestId === PENDING_AND_ACCEPTED_REQUEST_ID) {
			contents = this._operationHistory.readPreview(underylingUri);
		} else {
			if (undoStop?.startsWith(CHECKPOINT_PTR_PREFIX)) {
				const [ptr, operationId] = undoStop.slice(CHECKPOINT_PTR_PREFIX.length).split('/');
				stop = { ptr: ptr as IOperationCheckpointPointer['ptr'], requestId, operationId };
			} else {
				stop = this._operationHistory.findCheckpoint(requestId, undoStop);
			}

			if (!stop) {
				return Promise.resolve(null);
			}


			contents = this._operationHistory.readFileAtCheckpoint(stop, underylingUri);
		}

		const model = this._modelService.createModel('', this._languageService.createByFilepathOrFirstLine(underylingUri), snapshotUri);
		const store = new DisposableStore();
		store.add(model.onWillDispose(() => store.dispose()));
		store.add(autorun(reader => {
			model.setValue(contents.read(reader) || '');
		}));

		return Promise.resolve(model);
	}

	/** @deprecated */
	getSnapshot(requestId: string, undoStop: string | undefined, snapshotUri: URI): ISnapshotEntry | undefined {
		return undefined; // todo
	}

	stop(clearState?: boolean): Promise<void> {
		return Promise.resolve(); // todo
	}

	getEntryDiffBetweenStops(uri: URI, requestId: string, stopId: string | undefined): IObservable<IEditSessionEntryDiff | undefined> | undefined {
		const start = this._operationHistory.findCheckpoint(requestId, stopId);
		const stop = start && IOperationCheckpointPointer.after(start);
		if (!start || !stop) {
			return undefined;
		}
		return this._getDiffBetweenCheckpoints(uri, start, stop);
	}

	getEntryDiffForSession(uri: URI): IObservable<IEditSessionEntryDiff | undefined> | undefined {
		const start = this._operationHistory.firstCheckpoint;
		const stop = this._operationHistory.lastCheckpoint;
		if (!start || !stop) {
			return undefined;
		}
		return this._getDiffBetweenCheckpoints(uri, start, stop);
	}

	getEntryDiffBetweenRequests(uri: URI, startRequestId: string, stopRequestId: string): IObservable<IEditSessionEntryDiff | undefined> {
		const start = this._operationHistory.findCheckpoint(startRequestId);
		const stop = this._operationHistory.findCheckpoint(stopRequestId);
		if (!start || !stop) {
			return observableValue(this, undefined);
		}

		return this._getDiffBetweenCheckpoints(uri, start, stop);
	}

	private _getDiffBetweenCheckpoints(uri: URI, start: IOperationCheckpoint, end: IOperationCheckpoint | IOperationCheckpointPointer): IObservable<IEditSessionEntryDiff | undefined> {
		const uriA = this.getCheckpointUri(start, uri);
		const uriB = this.getCheckpointUri(end, uri);

		const modelRefs = derived((reader) => {
			const store = new DisposableStore();
			reader.store.add(store);
			const referencesPromise = Promise.all([uriA, uriB].map(u => {
				return thenRegisterOrDispose(this._textModelService.createModelReference(u), store);
			}));
			return new ObservablePromise(referencesPromise);
		});
		const diff = derived((reader): ObservablePromise<IEditSessionEntryDiff> | undefined => {
			const references = modelRefs.read(reader)?.promiseResult.read(reader);
			const refs = references?.data;
			if (!refs) {
				return;
			}
			const promise = this._computeDiff(refs[0].object.textEditorModel.uri, refs[1].object.textEditorModel.uri);
			return new ObservablePromise(promise);
		});
		return derived(reader => {
			return diff.read(reader)?.promiseResult.read(reader)?.data || undefined;
		});
	}

	private _computeDiff(originalUri: URI, modifiedUri: URI): Promise<IEditSessionEntryDiff> {
		return this._editorWorkerService.computeDiff(
			originalUri,
			modifiedUri,
			{ ignoreTrimWhitespace: false, computeMoves: false, maxComputationTimeMs: 3000 },
			'advanced'
		).then((diff): IEditSessionEntryDiff => {
			const entryDiff: IEditSessionEntryDiff = {
				originalURI: originalUri,
				modifiedURI: modifiedUri,
				identical: !!diff?.identical,
				quitEarly: !diff || diff.quitEarly,
				added: 0,
				removed: 0,
			};
			if (diff) {
				for (const change of diff.changes) {
					entryDiff.removed += change.original.endLineNumberExclusive - change.original.startLineNumber;
					entryDiff.added += change.modified.endLineNumberExclusive - change.modified.startLineNumber;
				}
			}
			return entryDiff;
		});
	}

	async createSnapshot(requestId: string, stopId: string | undefined): Promise<void> {
		// Initial checkpoints for each request come in with only the request ID.
		// For checkpoints within the request, only create markers, not full snapshots.
		if (stopId !== undefined) {
			this._operationHistory.createMarkerCheckpoint(requestId, stopId);
			return;
		}

		const uris = new ResourceSet(this._operationHistory.getOperations({}).flatMap(r => [...r.getAffectedResources()]));
		const locks = await Promise.all([...uris].map(uri => this._streamingEditSequencers.getDeferredLock(uri, undefined)));

		try {
			await this._operationHistory.createCompleteCheckpoint(uris, requestId, stopId);
		} finally {
			locks.forEach(l => l.done.complete());
		}
	}

	getEntry(uri: URI) {
		return this._entriesMap.get(uri);
	}

	readEntry(uri: URI, reader?: IReader): IModifiedFileEntry | undefined {
		return this._entries.read(reader)?.find(entry => entry.modifiedURI.toString() === uri.toString());
	}

	/**
	 * Get the operation history manager.
	 */
	get operationHistory(): IOperationHistoryManager {
		return this._operationHistory;
	}

	/**
	 * Apply a single operation.
	 */
	async applyOperation(operation: IChatEditOperation): Promise<IOperationResult> {
		const affected = [...operation.getAffectedResources()];
		const locks = await Promise.all(affected.map(uri =>
			this._individualEditSequencers.getDeferredLock(uri)
		));

		try {
			const result = await operation.apply();
			this._logService.trace(`${LOG_PREFIX}applied ${operation.type} to ${affected.join(', ')}, success=${result.success}`);

			if (result.success) {
				this._operationHistory.addOperation(operation);
			}

			return result;
		} finally {
			locks.forEach(l => l.done.complete());
		}
	}

	/**
	 * Apply a group of operations.
	 */
	async applyOperationGroup(operations: readonly IChatEditOperation[], description: string): Promise<IOperationResult[]> {
		const results: IOperationResult[] = [];
		const succeededOperations: IChatEditOperation[] = [];

		// Apply operations one by one
		for (const operation of operations) {
			const result = await operation.apply();
			results.push(result);

			if (result.success) {
				succeededOperations.push(operation);
			} else {
				// If an operation fails, revert all previously succeeded operations
				for (let i = succeededOperations.length - 1; i >= 0; i--) {
					await succeededOperations[i].revert();
				}
				break;
			}
		}

		// If all operations succeeded, add them as a group
		if (succeededOperations.length === operations.length) {
			this._operationHistory.addOperationGroup(operations, description);
		}

		return results;
	}

	/**
	 * Go to a specific operation in the history.
	 */
	async goToOperation(operationId: string): Promise<IOperationResult> {
		return this._operationHistory.goToOperation(operationId);
	}

	/**
	 * Rollback to a specific checkpoint.
	 */
	async rollbackToCheckpoint(checkpoint: IOperationCheckpoint): Promise<void> {
		return this._operationHistory.rollbackToCheckpoint(checkpoint);
	}

	get canUndo(): IObservable<boolean> {
		return this._operationHistory.canUndo;
	}

	get canRedo(): IObservable<boolean> {
		return this._operationHistory.canRedo;
	}

	async undoInteraction(): Promise<void> {
		await this._operationHistory.undo();
	}

	async redoInteraction(): Promise<void> {
		await this._operationHistory.redo();
	}

	async accept(...uris: URI[]): Promise<void> {
		const ops = this._operationHistory.getOperations({ affectsResource: uris.length ? uris : undefined, inState: ChatEditOperationState.Pending });
		await this._operationHistory.accept(ops);
	}

	async reject(...uris: URI[]): Promise<void> {
		const ops = this._operationHistory.getOperations({ affectsResource: uris.length ? uris : undefined, inState: ChatEditOperationState.Pending });
		await this._operationHistory.reject(ops);
	}

	/**
	 * Start streaming edits for a resource.
	 * Returns an IStreamingEdits object that can be used to push edits as they arrive.
	 */
	startStreamingEdits(resource: URI, responseModel: IChatResponseModel): IStreamingEdits {
		this._logService.trace(`${LOG_PREFIX}startStreamingEdits called for ${resource.toString()}`);
		// Get or create sequencer for this resource to ensure edits are applied in order
		const lock = this._streamingEditSequencers.getDeferredLock(resource, responseModel).then(async lock => {
			await this._prepareForEditStreaming(resource, responseModel.requestId);
			return lock;
		});

		return {
			pushText: async (edits: TextEdit[], isLastEdits: boolean) => {
				const operation = this._instantiationService.createInstance(
					ChatTextEditOperation,
					responseModel.requestId,
					resource,
					edits,
					true
				);

				const { done } = await lock;
				this.applyOperation(operation);
				if (isLastEdits) {
					done.complete();
				}
			},

			pushNotebookCellText: (cell: URI, edits: TextEdit[], isLastEdits: boolean) => {
				//todo
			},

			pushNotebook: (edits: ICellEditOperation[], isLastEdits: boolean) => {
				//todo
			},

			complete: async () => {
				const { done } = await lock;
				done.complete();
				this._logService.trace(`${LOG_PREFIX}startStreamingEdits completed for ${resource.toString()}`);
			}
		};
	}

	/**
	 * Ensures the resource is in a state to start streaming in file edits.
	 * Creates the file if it doesn't exist and ensure it's present in the
	 * associated request snapshot.
	 */
	private async _prepareForEditStreaming(resource: URI, requestId: string) {
		const checkpoint = this.operationHistory.findCheckpoint(requestId);
		if (!checkpoint) {
			throw new Error(`tried to start streaming edits without making a for request ${requestId}`);
		}

		if (!checkpoint.resources) {
			throw new Error('unreachable: request checkpoint was missing a resource map');
		}

		this._logService.trace(`${LOG_PREFIX}startStreamingEdits locked for ${resource.toString()}`);

		if (!checkpoint.resources.has(resource)) {
			try {
				const contents = await this._fileService.readFile(resource);
				checkpoint.resources.set(resource, contents.value.toString());
			} catch {
				checkpoint.resources.set(resource, '');
				await this.applyOperation(this._instantiationService.createInstance(
					ChatFileCreateOperation,
					requestId,
					resource,
					'',
					true
				));
			}
		} else if (!await this._fileService.exists(resource)) {
			// If the file was deleted after the request started, recreate it when edits come in
			await this.applyOperation(this._instantiationService.createInstance(
				ChatFileCreateOperation,
				requestId,
				resource,
				checkpoint.resources.get(resource) || '',
				true
			));
		}
	}

	/**
	 * Dispose of the session and clean up resources.
	 */
	override dispose(): void {
		this._onDidDispose.fire();
		this._streamingEditSequencers.clear();
		this._individualEditSequencers.clear();
		super.dispose();
	}
}

class ObservableResourceMutex<M> {
	private signal = observableSignal(this);
	private readonly _value = new ResourceMap<{ meta: M; fn: () => Promise<unknown> }[]>();

	public heldLocksFor(resource: URI) {
		return this.signal.map(() => this._value.get(resource)?.map(a => a.meta) || []);
	}

	public getDeferredLock<T>(resource: URI, meta: M) {
		const done = new DeferredPromise<void>();
		const ready = new DeferredPromise<{ done: DeferredPromise<void> }>();
		this.lock(resource, meta, () => {
			ready.complete({ done });
			return done.p;
		});

		return ready.p;
	}

	public lock<T>(resource: URI, meta: M, fn: () => Promise<T>): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			const rec = this._value.get(resource) || [];
			rec.push({ meta, fn: () => fn().then(resolve, reject) });

			if (rec.length === 1) {
				this._value.set(resource, rec);
				this.dequeue(resource);
			}

			this.signal.trigger(undefined);
		});
	}

	public clear() {
		this._value.clear();
	}

	private async dequeue(resource: URI) {
		while (true) {
			const queue = this._value.get(resource);
			if (!queue?.length) {
				return;
			}

			try {
				await queue[0].fn();
			} finally {
				queue.shift();
				if (queue.length === 0) {
					this._value.delete(resource);
				}
				this.signal.trigger(undefined);
			}
		}
	}
}
