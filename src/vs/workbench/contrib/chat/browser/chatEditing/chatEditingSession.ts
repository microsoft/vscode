/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise, ITask, Sequencer, SequencerByKey, timeout } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { BugIndicatingError } from '../../../../../base/common/errors.js';
import { Emitter } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Iterable } from '../../../../../base/common/iterator.js';
import { Disposable, DisposableStore, dispose } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { derived, IObservable, IReader, ITransaction, observableValue, transaction } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { hasKey, Mutable } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { IBulkEditService } from '../../../../../editor/browser/services/bulkEditService.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { TextEdit } from '../../../../../editor/common/languages.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { localize } from '../../../../../nls.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { EditorActivation } from '../../../../../platform/editor/common/editor.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { DiffEditorInput } from '../../../../common/editor/diffEditorInput.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { MultiDiffEditor } from '../../../multiDiffEditor/browser/multiDiffEditor.js';
import { MultiDiffEditorInput } from '../../../multiDiffEditor/browser/multiDiffEditorInput.js';
import { CellUri, ICellEditOperation } from '../../../notebook/common/notebookCommon.js';
import { INotebookService } from '../../../notebook/common/notebookService.js';
import { chatEditingSessionIsReady, ChatEditingSessionState, ChatEditKind, getMultiDiffSourceUri, IChatEditingSession, IEditSessionEntryDiff, IModifiedEntryTelemetryInfo, IModifiedFileEntry, ISnapshotEntry, IStreamingEdits, ModifiedFileEntryState } from '../../common/chatEditingService.js';
import { IChatResponseModel } from '../../common/chatModel.js';
import { IChatProgress } from '../../common/chatService.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { IChatEditingCheckpointTimeline } from './chatEditingCheckpointTimeline.js';
import { ChatEditingCheckpointTimelineImpl, IChatEditingTimelineFsDelegate } from './chatEditingCheckpointTimelineImpl.js';
import { ChatEditingModifiedDocumentEntry } from './chatEditingModifiedDocumentEntry.js';
import { AbstractChatEditingModifiedFileEntry } from './chatEditingModifiedFileEntry.js';
import { ChatEditingModifiedNotebookEntry } from './chatEditingModifiedNotebookEntry.js';
import { FileOperation, FileOperationType } from './chatEditingOperations.js';
import { ChatEditingSessionStorage, IChatEditingSessionStop, StoredSessionState } from './chatEditingSessionStorage.js';
import { ChatEditingTextModelContentProvider } from './chatEditingTextModelContentProviders.js';

const enum NotExistBehavior {
	Create,
	Abort,
}

class ThrottledSequencer extends Sequencer {

	private _size = 0;

	constructor(
		private readonly _minDuration: number,
		private readonly _maxOverallDelay: number
	) {
		super();
	}

	override queue<T>(promiseTask: ITask<Promise<T>>): Promise<T> {

		this._size += 1;

		const noDelay = this._size * this._minDuration > this._maxOverallDelay;

		return super.queue(async () => {
			try {
				const p1 = promiseTask();
				const p2 = noDelay
					? Promise.resolve(undefined)
					: timeout(this._minDuration, CancellationToken.None);

				const [result] = await Promise.all([p1, p2]);
				return result;

			} finally {
				this._size -= 1;
			}
		});
	}
}

function createOpeningEditCodeBlock(uri: URI, isNotebook: boolean, undoStopId: string): IChatProgress[] {
	return [
		{
			kind: 'markdownContent',
			content: new MarkdownString('\n````\n')
		},
		{
			kind: 'codeblockUri',
			uri,
			isEdit: true,
			undoStopId
		},
		{
			kind: 'markdownContent',
			content: new MarkdownString('\n````\n')
		},
		isNotebook
			? {
				kind: 'notebookEdit',
				uri,
				edits: [],
				done: false,
				isExternalEdit: true
			}
			: {
				kind: 'textEdit',
				uri,
				edits: [],
				done: false,
				isExternalEdit: true
			},
	];
}


export class ChatEditingSession extends Disposable implements IChatEditingSession {
	private readonly _state = observableValue<ChatEditingSessionState>(this, ChatEditingSessionState.Initial);
	private readonly _timeline: IChatEditingCheckpointTimeline;

	/**
	 * Contains the contents of a file when the AI first began doing edits to it.
	 */
	private readonly _initialFileContents = new ResourceMap<string>();

	private readonly _baselineCreationLocks = new SequencerByKey</* URI.path */ string>();
	private readonly _streamingEditLocks = new SequencerByKey</* URI */ string>();

	/**
	 * Tracks active external edit operations.
	 * Key is operationId, value contains the operation state.
	 */
	private readonly _externalEditOperations = new Map<number, {
		responseModel: IChatResponseModel;
		snapshots: ResourceMap<string | undefined>;
		undoStopId: string;
		releaseLocks: () => void;
	}>();

	private readonly _entriesObs = observableValue<readonly AbstractChatEditingModifiedFileEntry[]>(this, []);
	public readonly entries: IObservable<readonly IModifiedFileEntry[]> = derived(reader => {
		const state = this._state.read(reader);
		if (state === ChatEditingSessionState.Disposed || state === ChatEditingSessionState.Initial) {
			return [];
		} else {
			return this._entriesObs.read(reader);
		}
	});

	private _editorPane: MultiDiffEditor | undefined;

	get state(): IObservable<ChatEditingSessionState> {
		return this._state;
	}

	public readonly canUndo: IObservable<boolean>;
	public readonly canRedo: IObservable<boolean>;

	public get requestDisablement() {
		return this._timeline.requestDisablement;
	}

	private readonly _onDidDispose = new Emitter<void>();
	get onDidDispose() {
		this._assertNotDisposed();
		return this._onDidDispose.event;
	}

	constructor(
		readonly chatSessionResource: URI,
		readonly isGlobalEditingSession: boolean,
		private _lookupExternalEntry: (uri: URI) => AbstractChatEditingModifiedFileEntry | undefined,
		transferFrom: IChatEditingSession | undefined,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IModelService private readonly _modelService: IModelService,
		@ILanguageService private readonly _languageService: ILanguageService,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@IBulkEditService public readonly _bulkEditService: IBulkEditService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@IEditorService private readonly _editorService: IEditorService,
		@INotebookService private readonly _notebookService: INotebookService,
		@IAccessibilitySignalService private readonly _accessibilitySignalService: IAccessibilitySignalService,
		@ILogService private readonly _logService: ILogService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();
		this._timeline = this._instantiationService.createInstance(
			ChatEditingCheckpointTimelineImpl,
			chatSessionResource,
			this._getTimelineDelegate(),
		);

		this.canRedo = this._timeline.canRedo.map((hasHistory, reader) =>
			hasHistory && this._state.read(reader) === ChatEditingSessionState.Idle);
		this.canUndo = this._timeline.canUndo.map((hasHistory, reader) =>
			hasHistory && this._state.read(reader) === ChatEditingSessionState.Idle);

		this._init(transferFrom);
	}

	private _getTimelineDelegate(): IChatEditingTimelineFsDelegate {
		return {
			createFile: (uri, content) => {
				return this._bulkEditService.apply({
					edits: [{
						newResource: uri,
						options: {
							overwrite: true,
							contents: content ? Promise.resolve(VSBuffer.fromString(content)) : undefined,
						},
					}],
				});
			},
			deleteFile: async (uri) => {
				const entries = this._entriesObs.get().filter(e => !isEqual(e.modifiedURI, uri));
				this._entriesObs.set(entries, undefined);
				await this._bulkEditService.apply({ edits: [{ oldResource: uri, options: { ignoreIfNotExists: true } }] });
			},
			renameFile: async (fromUri, toUri) => {
				const entries = this._entriesObs.get();
				const previousEntry = entries.find(e => isEqual(e.modifiedURI, fromUri));
				if (previousEntry) {
					const newEntry = await this._getOrCreateModifiedFileEntry(toUri, NotExistBehavior.Create, previousEntry.telemetryInfo, this._getCurrentTextOrNotebookSnapshot(previousEntry));
					previousEntry.dispose();
					this._entriesObs.set(entries.map(e => e === previousEntry ? newEntry : e), undefined);
				}
			},
			setContents: async (uri, content, telemetryInfo) => {
				const entry = await this._getOrCreateModifiedFileEntry(uri, NotExistBehavior.Create, telemetryInfo);
				if (entry instanceof ChatEditingModifiedNotebookEntry) {
					await entry.restoreModifiedModelFromSnapshot(content);
				} else {
					await entry.acceptAgentEdits(uri, [{ range: new Range(1, 1, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER), text: content }], true, undefined);
				}
			}
		};
	}

	private async _init(transferFrom?: IChatEditingSession): Promise<void> {
		const storage = this._instantiationService.createInstance(ChatEditingSessionStorage, this.chatSessionResource);
		let restoredSessionState: StoredSessionState | undefined;
		if (transferFrom instanceof ChatEditingSession) {
			restoredSessionState = transferFrom._getStoredState(this.chatSessionResource);
		} else {
			restoredSessionState = await storage.restoreState().catch(err => {
				this._logService.error(`Error restoring chat editing session state for ${this.chatSessionResource}`, err);
				return undefined;
			});

			if (this._store.isDisposed) {
				return; // disposed while restoring
			}
		}


		if (restoredSessionState) {
			for (const [uri, content] of restoredSessionState.initialFileContents) {
				this._initialFileContents.set(uri, content);
			}
			if (restoredSessionState.timeline) {
				transaction(tx => this._timeline.restoreFromState(restoredSessionState.timeline!, tx));
			}
			await this._initEntries(restoredSessionState.recentSnapshot);
		}

		this._state.set(ChatEditingSessionState.Idle, undefined);
	}

	private _getEntry(uri: URI): AbstractChatEditingModifiedFileEntry | undefined {
		uri = CellUri.parse(uri)?.notebook ?? uri;
		return this._entriesObs.get().find(e => isEqual(e.modifiedURI, uri));
	}

	public getEntry(uri: URI): IModifiedFileEntry | undefined {
		return this._getEntry(uri);
	}

	public readEntry(uri: URI, reader: IReader | undefined): IModifiedFileEntry | undefined {
		uri = CellUri.parse(uri)?.notebook ?? uri;
		return this._entriesObs.read(reader).find(e => isEqual(e.modifiedURI, uri));
	}

	public storeState(): Promise<void> {
		const storage = this._instantiationService.createInstance(ChatEditingSessionStorage, this.chatSessionResource);
		return storage.storeState(this._getStoredState());
	}

	private _getStoredState(sessionResource = this.chatSessionResource): StoredSessionState {
		const entries = new ResourceMap<ISnapshotEntry>();
		for (const entry of this._entriesObs.get()) {
			entries.set(entry.modifiedURI, entry.createSnapshot(sessionResource, undefined, undefined));
		}

		const state: StoredSessionState = {
			initialFileContents: this._initialFileContents,
			timeline: this._timeline.getStateForPersistence(),
			recentSnapshot: { entries, stopId: undefined },
		};

		return state;
	}

	public getEntryDiffBetweenStops(uri: URI, requestId: string | undefined, stopId: string | undefined) {
		return this._timeline.getEntryDiffBetweenStops(uri, requestId, stopId);
	}

	public getEntryDiffBetweenRequests(uri: URI, startRequestId: string, stopRequestId: string) {
		return this._timeline.getEntryDiffBetweenRequests(uri, startRequestId, stopRequestId);
	}

	public getDiffsForFilesInSession() {
		return this._timeline.getDiffsForFilesInSession();
	}

	public getDiffForSession() {
		return this._timeline.getDiffForSession();
	}

	public getDiffsForFilesInRequest(requestId: string): IObservable<readonly IEditSessionEntryDiff[]> {
		return this._timeline.getDiffsForFilesInRequest(requestId);
	}

	public hasEditsInRequest(requestId: string, reader?: IReader): boolean {
		return this._timeline.hasEditsInRequest(requestId, reader);
	}

	public createSnapshot(requestId: string, undoStop: string | undefined): void {
		const label = undoStop ? `Request ${requestId} - Stop ${undoStop}` : `Request ${requestId}`;
		this._timeline.createCheckpoint(requestId, undoStop, label);
	}

	public async getSnapshotContents(requestId: string, uri: URI, stopId: string | undefined): Promise<VSBuffer | undefined> {
		const content = await this._timeline.getContentAtStop(requestId, uri, stopId);
		return typeof content === 'string' ? VSBuffer.fromString(content) : content;
	}

	public async getSnapshotModel(requestId: string, undoStop: string | undefined, snapshotUri: URI): Promise<ITextModel | null> {
		await this._baselineCreationLocks.peek(snapshotUri.path);

		const content = await this._timeline.getContentAtStop(requestId, snapshotUri, undoStop);
		if (content === undefined) {
			return null;
		}

		const contentStr = typeof content === 'string' ? content : content.toString();
		const model = this._modelService.createModel(contentStr, this._languageService.createByFilepathOrFirstLine(snapshotUri), snapshotUri, false);

		const store = new DisposableStore();
		store.add(model.onWillDispose(() => store.dispose()));
		store.add(this._timeline.onDidChangeContentsAtStop(requestId, snapshotUri, undoStop, c => model.setValue(c)));

		return model;
	}

	public getSnapshotUri(requestId: string, uri: URI, stopId: string | undefined): URI | undefined {
		return this._timeline.getContentURIAtStop(requestId, uri, stopId);
	}

	public async restoreSnapshot(requestId: string, stopId: string | undefined): Promise<void> {
		const checkpointId = this._timeline.getCheckpointIdForRequest(requestId, stopId);
		if (checkpointId) {
			await this._timeline.navigateToCheckpoint(checkpointId);
		}
	}

	private _assertNotDisposed(): void {
		if (this._state.get() === ChatEditingSessionState.Disposed) {
			throw new BugIndicatingError(`Cannot access a disposed editing session`);
		}
	}

	async accept(...uris: URI[]): Promise<void> {
		if (await this._operateEntry('accept', uris)) {
			this._accessibilitySignalService.playSignal(AccessibilitySignal.editsKept, { allowManyInParallel: true });
		}

	}

	async reject(...uris: URI[]): Promise<void> {
		if (await this._operateEntry('reject', uris)) {
			this._accessibilitySignalService.playSignal(AccessibilitySignal.editsUndone, { allowManyInParallel: true });
		}
	}

	private async _operateEntry(action: 'accept' | 'reject', uris: URI[]): Promise<number> {
		this._assertNotDisposed();

		const applicableEntries = this._entriesObs.get()
			.filter(e => uris.length === 0 || uris.some(u => isEqual(u, e.modifiedURI)))
			.filter(e => !e.isCurrentlyBeingModifiedBy.get())
			.filter(e => e.state.get() === ModifiedFileEntryState.Modified);

		if (applicableEntries.length === 0) {
			return 0;
		}

		// Perform all I/O operations in parallel, each resolving to a state transition callback
		const method = action === 'accept' ? 'acceptDeferred' : 'rejectDeferred';
		const transitionCallbacks = await Promise.all(
			applicableEntries.map(entry => entry[method]().catch(err => {
				this._logService.error(`Error calling ${method} on entry ${entry.modifiedURI}`, err);
			}))
		);

		// Execute all state transitions atomically in a single transaction
		transaction(tx => {
			transitionCallbacks.forEach(callback => callback?.(tx));
		});

		return applicableEntries.length;
	}

	async show(previousChanges?: boolean): Promise<void> {
		this._assertNotDisposed();
		if (this._editorPane) {
			if (this._editorPane.isVisible()) {
				return;
			} else if (this._editorPane.input) {
				await this._editorGroupsService.activeGroup.openEditor(this._editorPane.input, { pinned: true, activation: EditorActivation.ACTIVATE });
				return;
			}
		}
		const input = MultiDiffEditorInput.fromResourceMultiDiffEditorInput({
			multiDiffSource: getMultiDiffSourceUri(this, previousChanges),
			label: localize('multiDiffEditorInput.name', "Suggested Edits")
		}, this._instantiationService);

		this._editorPane = await this._editorGroupsService.activeGroup.openEditor(input, { pinned: true, activation: EditorActivation.ACTIVATE }) as MultiDiffEditor | undefined;
	}

	private _stopPromise: Promise<void> | undefined;

	async stop(clearState = false): Promise<void> {
		this._stopPromise ??= Promise.allSettled([this._performStop(), this.storeState()]).then(() => { });
		await this._stopPromise;
		if (clearState) {
			await this._instantiationService.createInstance(ChatEditingSessionStorage, this.chatSessionResource).clearState();
		}
	}

	private async _performStop(): Promise<void> {
		// Close out all open files
		const schemes = [AbstractChatEditingModifiedFileEntry.scheme, ChatEditingTextModelContentProvider.scheme];
		await Promise.allSettled(this._editorGroupsService.groups.flatMap(async (g) => {
			return g.editors.map(async (e) => {
				if ((e instanceof MultiDiffEditorInput && e.initialResources?.some(r => r.originalUri && schemes.indexOf(r.originalUri.scheme) !== -1))
					|| (e instanceof DiffEditorInput && e.original.resource && schemes.indexOf(e.original.resource.scheme) !== -1)) {
					await g.closeEditor(e);
				}
			});
		}));
	}

	override dispose() {
		this._assertNotDisposed();
		dispose(this._entriesObs.get());
		super.dispose();
		this._state.set(ChatEditingSessionState.Disposed, undefined);
		this._onDidDispose.fire();
		this._onDidDispose.dispose();
	}

	private get isDisposed() {
		return this._state.get() === ChatEditingSessionState.Disposed;
	}

	startStreamingEdits(resource: URI, responseModel: IChatResponseModel, inUndoStop: string | undefined): IStreamingEdits {
		const completePromise = new DeferredPromise<void>();
		const startPromise = new DeferredPromise<void>();

		// Sequence all edits made this this resource in this streaming edits instance,
		// and also sequence the resource overall in the rare (currently invalid?) case
		// that edits are made in parallel to the same resource,
		const sequencer = new ThrottledSequencer(15, 1000);
		sequencer.queue(() => startPromise.p);

		// Lock around creating the baseline so we don't fail to resolve models
		// in the edit pills if they render quickly
		this._baselineCreationLocks.queue(resource.path, () => startPromise.p);

		this._streamingEditLocks.queue(resource.toString(), async () => {
			await chatEditingSessionIsReady(this);

			if (!this.isDisposed) {
				await this._acceptStreamingEditsStart(responseModel, inUndoStop, resource);
			}

			startPromise.complete();
			return completePromise.p;
		});


		let didComplete = false;

		return {
			pushText: (edits, isLastEdits) => {
				sequencer.queue(async () => {
					if (!this.isDisposed) {
						await this._acceptEdits(resource, edits, isLastEdits, responseModel);
					}
				});
			},
			pushNotebookCellText: (cell, edits, isLastEdits) => {
				sequencer.queue(async () => {
					if (!this.isDisposed) {
						await this._acceptEdits(cell, edits, isLastEdits, responseModel);
					}
				});
			},
			pushNotebook: (edits, isLastEdits) => {
				sequencer.queue(async () => {
					if (!this.isDisposed) {
						await this._acceptEdits(resource, edits, isLastEdits, responseModel);
					}
				});
			},
			complete: () => {
				if (didComplete) {
					return;
				}

				didComplete = true;
				sequencer.queue(async () => {
					if (!this.isDisposed) {
						await this._acceptEdits(resource, [], true, responseModel);
						await this._resolve(responseModel.requestId, inUndoStop, resource);
						completePromise.complete();
					}
				});
			},
		};
	}

	async startExternalEdits(responseModel: IChatResponseModel, operationId: number, resources: URI[], undoStopId: string): Promise<IChatProgress[]> {
		const snapshots = new ResourceMap<string | undefined>();
		const acquiredLockPromises: DeferredPromise<void>[] = [];
		const releaseLockPromises: DeferredPromise<void>[] = [];
		const progress: IChatProgress[] = [];
		const telemetryInfo = this._getTelemetryInfoForModel(responseModel);

		await chatEditingSessionIsReady(this);

		// Acquire locks for each resource and take snapshots
		for (const resource of resources) {
			const releaseLock = new DeferredPromise<void>();
			releaseLockPromises.push(releaseLock);

			const acquiredLock = new DeferredPromise<void>();
			acquiredLockPromises.push(acquiredLock);

			this._streamingEditLocks.queue(resource.toString(), async () => {
				if (this.isDisposed) {
					acquiredLock.complete();
					return;
				}

				const entry = await this._getOrCreateModifiedFileEntry(resource, NotExistBehavior.Abort, telemetryInfo);
				if (entry) {
					await this._acceptStreamingEditsStart(responseModel, undoStopId, resource);
				}


				const notebookUri = CellUri.parse(resource)?.notebook || resource;
				progress.push(...createOpeningEditCodeBlock(resource, this._notebookService.hasSupportedNotebooks(notebookUri), undoStopId));

				// Save to disk to ensure disk state is current before external edits
				await entry?.save();

				// Take snapshot of current state
				snapshots.set(resource, entry && this._getCurrentTextOrNotebookSnapshot(entry));
				entry?.startExternalEdit();
				acquiredLock.complete();

				// Wait for the lock to be released by stopExternalEdits
				return releaseLock.p;
			});
		}

		await Promise.all(acquiredLockPromises.map(p => p.p));
		this.createSnapshot(responseModel.requestId, undoStopId);

		// Store the operation state
		this._externalEditOperations.set(operationId, {
			responseModel,
			snapshots,
			undoStopId,
			releaseLocks: () => releaseLockPromises.forEach(p => p.complete())
		});

		return progress;
	}

	async stopExternalEdits(responseModel: IChatResponseModel, operationId: number): Promise<IChatProgress[]> {
		const operation = this._externalEditOperations.get(operationId);
		if (!operation) {
			this._logService.warn(`stopExternalEdits called for unknown operation ${operationId}`);
			return [];
		}

		this._externalEditOperations.delete(operationId);

		const progress: IChatProgress[] = [];

		try {
			// For each resource, compute the diff and create edit parts
			for (const [resource, beforeSnapshot] of operation.snapshots) {
				let entry = this._getEntry(resource);

				// Files that did not exist on disk before may not exist in our working
				// set yet. Create those if that's the case.
				if (!entry && beforeSnapshot === undefined) {
					entry = await this._getOrCreateModifiedFileEntry(resource, NotExistBehavior.Abort, this._getTelemetryInfoForModel(responseModel), '');
					if (entry) {
						entry.startExternalEdit();
						entry.acceptStreamingEditsStart(responseModel, operation.undoStopId, undefined);
					}
				}

				if (!entry) {
					continue;
				}

				// Reload from disk to ensure in-memory model is in sync with file system
				await entry.revertToDisk();

				// Take new snapshot after external changes
				const afterSnapshot = this._getCurrentTextOrNotebookSnapshot(entry);

				// Compute edits from the snapshots
				let edits: (TextEdit | ICellEditOperation)[] = [];
				if (beforeSnapshot === undefined) {
					this._timeline.recordFileOperation({
						type: FileOperationType.Create,
						uri: resource,
						requestId: responseModel.requestId,
						epoch: this._timeline.incrementEpoch(),
						initialContent: afterSnapshot,
						telemetryInfo: entry.telemetryInfo,
					});
				} else {
					edits = await entry.computeEditsFromSnapshots(beforeSnapshot, afterSnapshot);
					this._recordEditOperations(entry, resource, edits, responseModel);
				}

				progress.push(entry instanceof ChatEditingModifiedNotebookEntry ? {
					kind: 'notebookEdit',
					uri: resource,
					edits: edits as ICellEditOperation[],
					done: true,
					isExternalEdit: true
				} : {
					kind: 'textEdit',
					uri: resource,
					edits: edits as TextEdit[],
					done: true,
					isExternalEdit: true
				});

				// Mark as no longer being modified
				await entry.acceptStreamingEditsEnd();

				// Clear external edit mode
				entry.stopExternalEdit();
			}
		} finally {
			// Release all the locks
			operation.releaseLocks();

			const hasOtherTasks = Iterable.some(this._streamingEditLocks.keys(), k => !operation.snapshots.has(URI.parse(k)));
			if (!hasOtherTasks) {
				this._state.set(ChatEditingSessionState.Idle, undefined);
			}
		}


		return progress;
	}

	async undoInteraction(): Promise<void> {
		await this._timeline.undoToLastCheckpoint();
	}

	async redoInteraction(): Promise<void> {
		await this._timeline.redoToNextCheckpoint();
	}

	private _recordEditOperations(entry: AbstractChatEditingModifiedFileEntry, resource: URI, edits: (TextEdit | ICellEditOperation)[], responseModel: IChatResponseModel): void {
		// Determine if these are text edits or notebook edits
		const isNotebookEdits = edits.length > 0 && hasKey(edits[0], { cells: true });

		if (isNotebookEdits) {
			// Record notebook edit operation
			const notebookEdits = edits as ICellEditOperation[];
			this._timeline.recordFileOperation({
				type: FileOperationType.NotebookEdit,
				uri: resource,
				requestId: responseModel.requestId,
				epoch: this._timeline.incrementEpoch(),
				cellEdits: notebookEdits
			});
		} else {
			let cellIndex: number | undefined;
			if (entry instanceof ChatEditingModifiedNotebookEntry) {
				const cellUri = CellUri.parse(resource);
				if (cellUri) {
					const i = entry.getIndexOfCellHandle(cellUri.handle);
					if (i !== -1) {
						cellIndex = i;
					}
				}
			}

			const textEdits = edits as TextEdit[];
			this._timeline.recordFileOperation({
				type: FileOperationType.TextEdit,
				uri: resource,
				requestId: responseModel.requestId,
				epoch: this._timeline.incrementEpoch(),
				edits: textEdits,
				cellIndex,
			});
		}
	}

	private _getCurrentTextOrNotebookSnapshot(entry: AbstractChatEditingModifiedFileEntry): string {
		if (entry instanceof ChatEditingModifiedNotebookEntry) {
			return entry.getCurrentSnapshot();
		} else if (entry instanceof ChatEditingModifiedDocumentEntry) {
			return entry.getCurrentContents();
		} else {
			throw new Error(`unknown entry type for ${entry.modifiedURI}`);
		}
	}

	private async _acceptStreamingEditsStart(responseModel: IChatResponseModel, undoStop: string | undefined, resource: URI) {
		const entry = await this._getOrCreateModifiedFileEntry(resource, NotExistBehavior.Create, this._getTelemetryInfoForModel(responseModel));

		// Record file baseline if this is the first edit for this file in this request
		if (!this._timeline.hasFileBaseline(resource, responseModel.requestId)) {
			this._timeline.recordFileBaseline({
				uri: resource,
				requestId: responseModel.requestId,
				content: this._getCurrentTextOrNotebookSnapshot(entry),
				epoch: this._timeline.incrementEpoch(),
				telemetryInfo: entry.telemetryInfo,
				notebookViewType: entry instanceof ChatEditingModifiedNotebookEntry ? entry.viewType : undefined,
			});
		}

		transaction((tx) => {
			this._state.set(ChatEditingSessionState.StreamingEdits, tx);
			entry.acceptStreamingEditsStart(responseModel, undoStop, tx);
			// Note: Individual edit operations will be recorded by the file entries
		});

		return entry;
	}

	private async _initEntries({ entries }: IChatEditingSessionStop): Promise<void> {
		// Reset all the files which are modified in this session state
		// but which are not found in the snapshot
		for (const entry of this._entriesObs.get()) {
			const snapshotEntry = entries.get(entry.modifiedURI);
			if (!snapshotEntry) {
				await entry.resetToInitialContent();
				entry.dispose();
			}
		}

		const entriesArr: AbstractChatEditingModifiedFileEntry[] = [];
		// Restore all entries from the snapshot
		for (const snapshotEntry of entries.values()) {
			const entry = await this._getOrCreateModifiedFileEntry(snapshotEntry.resource, NotExistBehavior.Abort, snapshotEntry.telemetryInfo);
			if (entry) {
				const restoreToDisk = snapshotEntry.state === ModifiedFileEntryState.Modified;
				await entry.restoreFromSnapshot(snapshotEntry, restoreToDisk);
				entriesArr.push(entry);
			}
		}

		this._entriesObs.set(entriesArr, undefined);
	}

	private async _acceptEdits(resource: URI, textEdits: (TextEdit | ICellEditOperation)[], isLastEdits: boolean, responseModel: IChatResponseModel): Promise<void> {
		const entry = await this._getOrCreateModifiedFileEntry(resource, NotExistBehavior.Create, this._getTelemetryInfoForModel(responseModel));

		// Record edit operations in the timeline if there are actual edits
		if (textEdits.length > 0) {
			this._recordEditOperations(entry, resource, textEdits, responseModel);
		}

		await entry.acceptAgentEdits(resource, textEdits, isLastEdits, responseModel);
	}

	private _getTelemetryInfoForModel(responseModel: IChatResponseModel): IModifiedEntryTelemetryInfo {
		// Make these getters because the response result is not available when the file first starts to be edited
		return new class implements IModifiedEntryTelemetryInfo {
			get agentId() { return responseModel.agent?.id; }
			get modelId() { return responseModel.request?.modelId; }
			get modeId() { return responseModel.request?.modeInfo?.modeId; }
			get command() { return responseModel.slashCommand?.name; }
			get sessionResource() { return responseModel.session.sessionResource; }
			get requestId() { return responseModel.requestId; }
			get result() { return responseModel.result; }
			get applyCodeBlockSuggestionId() { return responseModel.request?.modeInfo?.applyCodeBlockSuggestionId; }

			get feature(): 'sideBarChat' | 'inlineChat' | undefined {
				if (responseModel.session.initialLocation === ChatAgentLocation.Chat) {
					return 'sideBarChat';
				} else if (responseModel.session.initialLocation === ChatAgentLocation.EditorInline) {
					return 'inlineChat';
				}
				return undefined;
			}
		};
	}

	private async _resolve(requestId: string, undoStop: string | undefined, resource: URI): Promise<void> {
		const hasOtherTasks = Iterable.some(this._streamingEditLocks.keys(), k => k !== resource.toString());
		if (!hasOtherTasks) {
			this._state.set(ChatEditingSessionState.Idle, undefined);
		}

		const entry = this._getEntry(resource);
		if (!entry) {
			return;
		}

		// Create checkpoint for this edit completion
		const label = undoStop ? `Request ${requestId} - Stop ${undoStop}` : `Request ${requestId}`;
		this._timeline.createCheckpoint(requestId, undoStop, label);

		return entry.acceptStreamingEditsEnd();
	}

	/**
	 * Retrieves or creates a modified file entry.
	 *
	 * @returns The modified file entry.
	 */
	private async _getOrCreateModifiedFileEntry(resource: URI, ifNotExists: NotExistBehavior.Create, telemetryInfo: IModifiedEntryTelemetryInfo, initialContent?: string): Promise<AbstractChatEditingModifiedFileEntry>;
	private async _getOrCreateModifiedFileEntry(resource: URI, ifNotExists: NotExistBehavior, telemetryInfo: IModifiedEntryTelemetryInfo, initialContent?: string): Promise<AbstractChatEditingModifiedFileEntry | undefined>;
	private async _getOrCreateModifiedFileEntry(resource: URI, ifNotExists: NotExistBehavior, telemetryInfo: IModifiedEntryTelemetryInfo, _initialContent?: string): Promise<AbstractChatEditingModifiedFileEntry | undefined> {

		resource = CellUri.parse(resource)?.notebook ?? resource;

		const existingEntry = this._entriesObs.get().find(e => isEqual(e.modifiedURI, resource));
		if (existingEntry) {
			if (telemetryInfo.requestId !== existingEntry.telemetryInfo.requestId) {
				existingEntry.updateTelemetryInfo(telemetryInfo);
			}
			return existingEntry;
		}

		let entry: AbstractChatEditingModifiedFileEntry;
		const existingExternalEntry = this._lookupExternalEntry(resource);
		if (existingExternalEntry) {
			entry = existingExternalEntry;

			if (telemetryInfo.requestId !== entry.telemetryInfo.requestId) {
				entry.updateTelemetryInfo(telemetryInfo);
			}
		} else {
			const initialContent = _initialContent ?? this._initialFileContents.get(resource);
			// This gets manually disposed in .dispose() or in .restoreSnapshot()
			const maybeEntry = await this._createModifiedFileEntry(resource, telemetryInfo, ifNotExists, initialContent);
			if (!maybeEntry) {
				return undefined;
			}
			entry = maybeEntry;
			if (initialContent === undefined) {
				this._initialFileContents.set(resource, entry.initialContent);
			}
		}

		// If an entry is deleted e.g. reverting a created file,
		// remove it from the entries and don't show it in the working set anymore
		// so that it can be recreated e.g. through retry
		const listener = entry.onDidDelete(() => {
			const newEntries = this._entriesObs.get().filter(e => !isEqual(e.modifiedURI, entry.modifiedURI));
			this._entriesObs.set(newEntries, undefined);
			this._editorService.closeEditors(this._editorService.findEditors(entry.modifiedURI));

			if (!existingExternalEntry) {
				// don't dispose entries that are not yours!
				entry.dispose();
			}

			this._store.delete(listener);
		});
		this._store.add(listener);

		const entriesArr = [...this._entriesObs.get(), entry];
		this._entriesObs.set(entriesArr, undefined);

		return entry;
	}

	private async _createModifiedFileEntry(resource: URI, telemetryInfo: IModifiedEntryTelemetryInfo, ifNotExists: NotExistBehavior.Create, initialContent: string | undefined): Promise<AbstractChatEditingModifiedFileEntry>;
	private async _createModifiedFileEntry(resource: URI, telemetryInfo: IModifiedEntryTelemetryInfo, ifNotExists: NotExistBehavior, initialContent: string | undefined): Promise<AbstractChatEditingModifiedFileEntry | undefined>;

	private async _createModifiedFileEntry(resource: URI, telemetryInfo: IModifiedEntryTelemetryInfo, ifNotExists: NotExistBehavior, initialContent: string | undefined): Promise<AbstractChatEditingModifiedFileEntry | undefined> {
		const multiDiffEntryDelegate = {
			collapse: (transaction: ITransaction | undefined) => this._collapse(resource, transaction),
			recordOperation: (operation: Mutable<FileOperation>) => {
				operation.epoch = this._timeline.incrementEpoch();
				this._timeline.recordFileOperation(operation);
			},
		};
		const notebookUri = CellUri.parse(resource)?.notebook || resource;
		const doCreate = async (chatKind: ChatEditKind) => {
			if (this._notebookService.hasSupportedNotebooks(notebookUri)) {
				return await ChatEditingModifiedNotebookEntry.create(notebookUri, multiDiffEntryDelegate, telemetryInfo, chatKind, initialContent, this._instantiationService);
			} else {
				const ref = await this._textModelService.createModelReference(resource);
				return this._instantiationService.createInstance(ChatEditingModifiedDocumentEntry, ref, multiDiffEntryDelegate, telemetryInfo, chatKind, initialContent);
			}
		};

		try {
			return await doCreate(ChatEditKind.Modified);
		} catch (err) {
			if (ifNotExists === NotExistBehavior.Abort) {
				return undefined;
			}

			// this file does not exist yet, create it and try again
			await this._bulkEditService.apply({ edits: [{ newResource: resource }] });
			if (this.configurationService.getValue<boolean>('accessibility.openChatEditedFiles')) {
				this._editorService.openEditor({ resource, options: { inactive: true, preserveFocus: true, pinned: true } });
			}

			// Record file creation operation
			this._timeline.recordFileOperation({
				type: FileOperationType.Create,
				uri: resource,
				requestId: telemetryInfo.requestId,
				epoch: this._timeline.incrementEpoch(),
				initialContent: initialContent || '',
				telemetryInfo,
			});

			if (this._notebookService.hasSupportedNotebooks(notebookUri)) {
				return await ChatEditingModifiedNotebookEntry.create(resource, multiDiffEntryDelegate, telemetryInfo, ChatEditKind.Created, initialContent, this._instantiationService);
			} else {
				return await doCreate(ChatEditKind.Created);
			}
		}
	}

	private _collapse(resource: URI, transaction: ITransaction | undefined) {
		const multiDiffItem = this._editorPane?.findDocumentDiffItem(resource);
		if (multiDiffItem) {
			this._editorPane?.viewModel?.items.get().find((documentDiffItem) =>
				isEqual(documentDiffItem.originalUri, multiDiffItem.originalUri) &&
				isEqual(documentDiffItem.modifiedUri, multiDiffItem.modifiedUri))
				?.collapsed.set(true, transaction);
		}
	}
}
