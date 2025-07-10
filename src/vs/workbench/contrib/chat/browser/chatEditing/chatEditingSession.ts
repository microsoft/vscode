/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise, ITask, Sequencer, SequencerByKey, timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { BugIndicatingError } from '../../../../../base/common/errors.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Iterable } from '../../../../../base/common/iterator.js';
import { Disposable, dispose } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { autorun, IObservable, IReader, ITransaction, observableValue, transaction } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { IBulkEditService } from '../../../../../editor/browser/services/bulkEditService.js';
import { TextEdit } from '../../../../../editor/common/languages.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { localize } from '../../../../../nls.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { EditorActivation } from '../../../../../platform/editor/common/editor.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { DiffEditorInput } from '../../../../common/editor/diffEditorInput.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { MultiDiffEditor } from '../../../multiDiffEditor/browser/multiDiffEditor.js';
import { MultiDiffEditorInput } from '../../../multiDiffEditor/browser/multiDiffEditorInput.js';
import { CellUri, ICellEditOperation } from '../../../notebook/common/notebookCommon.js';
import { INotebookService } from '../../../notebook/common/notebookService.js';
import { ChatEditingSessionState, ChatEditKind, getMultiDiffSourceUri, IChatEditingSession, IModifiedEntryTelemetryInfo, IModifiedFileEntry, ISnapshotEntry, IStreamingEdits, ModifiedFileEntryState } from '../../common/chatEditingService.js';
import { IChatResponseModel } from '../../common/chatModel.js';
import { IChatService } from '../../common/chatService.js';
import { ChatEditingModifiedDocumentEntry } from './chatEditingModifiedDocumentEntry.js';
import { AbstractChatEditingModifiedFileEntry } from './chatEditingModifiedFileEntry.js';
import { ChatEditingModifiedNotebookEntry } from './chatEditingModifiedNotebookEntry.js';
import { ChatEditingSessionStorage, IChatEditingSessionSnapshot, IChatEditingSessionStop, StoredSessionState } from './chatEditingSessionStorage.js';
import { ChatEditingTextModelContentProvider } from './chatEditingTextModelContentProviders.js';
import { ChatEditingTimeline } from './chatEditingTimeline.js';

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

function getCurrentAndNextStop(requestId: string, stopId: string | undefined, history: readonly IChatEditingSessionSnapshot[]) {
	const snapshotIndex = history.findIndex(s => s.requestId === requestId);
	if (snapshotIndex === -1) { return undefined; }
	const snapshot = history[snapshotIndex];
	const stopIndex = snapshot.stops.findIndex(s => s.stopId === stopId);
	if (stopIndex === -1) { return undefined; }

	const current = snapshot.stops[stopIndex].entries;
	const next = stopIndex < snapshot.stops.length - 1
		? snapshot.stops[stopIndex + 1].entries
		: snapshot.postEdit || history[snapshotIndex + 1]?.stops[0].entries;


	if (!next) {
		return undefined;
	}

	return { current, next };
}

export class ChatEditingSession extends Disposable implements IChatEditingSession {
	private readonly _state = observableValue<ChatEditingSessionState>(this, ChatEditingSessionState.Initial);
	private readonly _timeline: ChatEditingTimeline;

	/**
	 * Contains the contents of a file when the AI first began doing edits to it.
	 */
	private readonly _initialFileContents = new ResourceMap<string>();

	private readonly _entriesObs = observableValue<readonly AbstractChatEditingModifiedFileEntry[]>(this, []);
	public get entries(): IObservable<readonly IModifiedFileEntry[]> {
		this._assertNotDisposed();
		return this._entriesObs;
	}

	private _editorPane: MultiDiffEditor | undefined;

	get state(): IObservable<ChatEditingSessionState> {
		return this._state;
	}

	public readonly canUndo: IObservable<boolean>;
	public readonly canRedo: IObservable<boolean>;

	private readonly _onDidDispose = new Emitter<void>();
	get onDidDispose() {
		this._assertNotDisposed();
		return this._onDidDispose.event;
	}

	constructor(
		readonly chatSessionId: string,
		readonly isGlobalEditingSession: boolean,
		private _lookupExternalEntry: (uri: URI) => AbstractChatEditingModifiedFileEntry | undefined,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IModelService private readonly _modelService: IModelService,
		@ILanguageService private readonly _languageService: ILanguageService,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@IBulkEditService public readonly _bulkEditService: IBulkEditService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@IEditorService private readonly _editorService: IEditorService,
		@IChatService private readonly _chatService: IChatService,
		@INotebookService private readonly _notebookService: INotebookService,
		@IAccessibilitySignalService private readonly _accessibilitySignalService: IAccessibilitySignalService,
	) {
		super();
		this._timeline = _instantiationService.createInstance(ChatEditingTimeline);
		this.canRedo = this._timeline.canRedo.map((hasHistory, reader) =>
			hasHistory && this._state.read(reader) === ChatEditingSessionState.Idle);
		this.canUndo = this._timeline.canUndo.map((hasHistory, reader) =>
			hasHistory && this._state.read(reader) === ChatEditingSessionState.Idle);
	}

	public async init(): Promise<void> {
		const restoredSessionState = await this._instantiationService.createInstance(ChatEditingSessionStorage, this.chatSessionId).restoreState();
		if (restoredSessionState) {
			for (const [uri, content] of restoredSessionState.initialFileContents) {
				this._initialFileContents.set(uri, content);
			}
			await this._restoreSnapshot(restoredSessionState.recentSnapshot, false);
			transaction(tx => {
				this._pendingSnapshot.set(restoredSessionState.pendingSnapshot, tx);
				this._timeline.restoreFromState({ history: restoredSessionState.linearHistory, index: restoredSessionState.linearHistoryIndex }, tx);
				this._state.set(ChatEditingSessionState.Idle, tx);
			});
		} else {
			this._state.set(ChatEditingSessionState.Idle, undefined);
		}

		this._register(autorun(reader => {
			const entries = this.entries.read(reader);
			entries.forEach(entry => {
				entry.state.read(reader);
			});
		}));
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
		const storage = this._instantiationService.createInstance(ChatEditingSessionStorage, this.chatSessionId);
		const timelineState = this._timeline.getStateForPersistence();
		const state: StoredSessionState = {
			initialFileContents: this._initialFileContents,
			pendingSnapshot: this._pendingSnapshot.get(),
			recentSnapshot: this._createSnapshot(undefined, undefined),
			linearHistoryIndex: timelineState.index,
			linearHistory: timelineState.history,
		};
		return storage.storeState(state);
	}

	private _ensurePendingSnapshot() {
		const prev = this._pendingSnapshot.get();
		if (!prev) {
			this._pendingSnapshot.set(this._createSnapshot(undefined, undefined), undefined);
		}
	}

	public getEntryDiffBetweenStops(uri: URI, requestId: string | undefined, stopId: string | undefined) {
		return this._timeline.getEntryDiffBetweenStops(uri, requestId, stopId);
	}

	public createSnapshot(requestId: string, undoStop: string | undefined, makeEmpty = undoStop !== undefined): void {
		this._timeline.pushSnapshot(
			requestId,
			undoStop,
			makeEmpty ? ChatEditingTimeline.createEmptySnapshot(undoStop) : this._createSnapshot(requestId, undoStop),
		);
	}

	private _createSnapshot(requestId: string | undefined, stopId: string | undefined): IChatEditingSessionStop {
		const entries = new ResourceMap<ISnapshotEntry>();
		for (const entry of this._entriesObs.get()) {
			entries.set(entry.modifiedURI, entry.createSnapshot(requestId, stopId));
		}
		return { stopId, entries };
	}

	public getSnapshot(requestId: string, undoStop: string | undefined, snapshotUri: URI): ISnapshotEntry | undefined {
		let entries: ResourceMap<ISnapshotEntry> | undefined;
		if (undoStop === ChatEditingTimeline.POST_EDIT_STOP_ID) {
			// If postEdit, get from timeline state
			const timelineState = this._timeline.getStateForPersistence();
			const snap = timelineState.history.find(s => s.requestId === requestId);
			entries = snap?.postEdit;
		} else {
			const stopRef = this._timeline.getSnapshotForRestore(requestId, undoStop);
			entries = stopRef?.stop.entries;
		}
		return entries && [...entries.values()].find((e) => isEqual(e.snapshotUri, snapshotUri));
	}

	public async getSnapshotModel(requestId: string, undoStop: string | undefined, snapshotUri: URI): Promise<ITextModel | null> {
		const snapshotEntry = this.getSnapshot(requestId, undoStop, snapshotUri);
		if (!snapshotEntry) {
			return null;
		}

		return this._modelService.createModel(snapshotEntry.current, this._languageService.createById(snapshotEntry.languageId), snapshotUri, false);
	}

	public getSnapshotUri(requestId: string, uri: URI, stopId: string | undefined): URI | undefined {
		// This should be encapsulated in the timeline, but for now, fallback to legacy logic if needed.
		// TODO: Move this logic into a timeline method if required by the design.
		const timelineState = this._timeline.getStateForPersistence();
		const stops = getCurrentAndNextStop(requestId, stopId, timelineState.history);
		return stops?.next.get(uri)?.snapshotUri;
	}

	/**
	 * A snapshot representing the state of the working set before a new request has been sent
	 */
	private _pendingSnapshot = observableValue<IChatEditingSessionStop | undefined>(this, undefined);

	public async restoreSnapshot(requestId: string | undefined, stopId: string | undefined): Promise<void> {
		if (requestId !== undefined) {
			const stopRef = this._timeline.getSnapshotForRestore(requestId, stopId);
			if (stopRef) {
				this._ensurePendingSnapshot();
				await this._restoreSnapshot(stopRef.stop);
				stopRef.apply();
				this._updateRequestHiddenState();
			}
		} else {
			const pendingSnapshot = this._pendingSnapshot.get();
			if (!pendingSnapshot) {
				return; // We don't have a pending snapshot that we can restore
			}
			this._pendingSnapshot.set(undefined, undefined);
			await this._restoreSnapshot(pendingSnapshot, undefined);
		}
	}

	private async _restoreSnapshot({ entries }: IChatEditingSessionStop, restoreResolvedToDisk = true): Promise<void> {

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
			const entry = await this._getOrCreateModifiedFileEntry(snapshotEntry.resource, snapshotEntry.telemetryInfo);
			const restoreToDisk = snapshotEntry.state === ModifiedFileEntryState.Modified || restoreResolvedToDisk;
			await entry.restoreFromSnapshot(snapshotEntry, restoreToDisk);
			entriesArr.push(entry);
		}

		this._entriesObs.set(entriesArr, undefined);
	}

	private _assertNotDisposed(): void {
		if (this._state.get() === ChatEditingSessionState.Disposed) {
			throw new BugIndicatingError(`Cannot access a disposed editing session`);
		}
	}

	async accept(...uris: URI[]): Promise<void> {
		this._assertNotDisposed();

		if (uris.length === 0) {
			await Promise.all(this._entriesObs.get().map(entry => entry.accept()));
		}

		for (const uri of uris) {
			const entry = this._entriesObs.get().find(e => isEqual(e.modifiedURI, uri));
			if (entry) {
				await entry.accept();
			}
		}
		this._accessibilitySignalService.playSignal(AccessibilitySignal.editsKept, { allowManyInParallel: true });
	}

	async reject(...uris: URI[]): Promise<void> {
		this._assertNotDisposed();

		if (uris.length === 0) {
			await Promise.all(this._entriesObs.get().map(entry => entry.reject()));
		}

		for (const uri of uris) {
			const entry = this._entriesObs.get().find(e => isEqual(e.modifiedURI, uri));
			if (entry) {
				await entry.reject();
			}
		}
		this._accessibilitySignalService.playSignal(AccessibilitySignal.editsUndone, { allowManyInParallel: true });
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
			await this._instantiationService.createInstance(ChatEditingSessionStorage, this.chatSessionId).clearState();
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

		this._chatService.cancelCurrentRequestForSession(this.chatSessionId);

		dispose(this._entriesObs.get());
		super.dispose();
		this._state.set(ChatEditingSessionState.Disposed, undefined);
		this._onDidDispose.fire();
		this._onDidDispose.dispose();
	}

	private _streamingEditLocks = new SequencerByKey</* URI */ string>();

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

		this._streamingEditLocks.queue(resource.toString(), async () => {
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

	async undoInteraction(): Promise<void> {
		const undo = this._timeline.getUndoSnapshot();
		if (!undo) {
			return;
		}
		this._ensurePendingSnapshot();
		await this._restoreSnapshot(undo.stop);
		undo.apply();
		this._updateRequestHiddenState();
	}

	async redoInteraction(): Promise<void> {
		const redo = this._timeline.getRedoSnapshot();
		const nextSnapshot = redo?.stop || this._pendingSnapshot.get();
		if (!nextSnapshot) {
			return;
		}
		await this._restoreSnapshot(nextSnapshot);
		if (redo) {
			redo.apply();
		} else {
			this._pendingSnapshot.set(undefined, undefined);
		}
		this._updateRequestHiddenState();
	}

	private _updateRequestHiddenState() {
		this._chatService.getSession(this.chatSessionId)?.setDisabledRequests(this._timeline.getRequestDisablement());
	}

	private async _acceptStreamingEditsStart(responseModel: IChatResponseModel, undoStop: string | undefined, resource: URI) {
		const entry = await this._getOrCreateModifiedFileEntry(resource, this._getTelemetryInfoForModel(responseModel));
		transaction((tx) => {
			this._state.set(ChatEditingSessionState.StreamingEdits, tx);
			entry.acceptStreamingEditsStart(responseModel, tx);
			this._timeline.ensureEditInUndoStopMatches(responseModel.requestId, undoStop, entry, false, tx);
		});
	}

	private async _acceptEdits(resource: URI, textEdits: (TextEdit | ICellEditOperation)[], isLastEdits: boolean, responseModel: IChatResponseModel): Promise<void> {
		const entry = await this._getOrCreateModifiedFileEntry(resource, this._getTelemetryInfoForModel(responseModel));
		await entry.acceptAgentEdits(resource, textEdits, isLastEdits, responseModel);
	}

	private _getTelemetryInfoForModel(responseModel: IChatResponseModel): IModifiedEntryTelemetryInfo {
		// Make these getters because the response result is not available when the file first starts to be edited
		return new class {
			get agentId() { return responseModel.agent?.id; }
			get command() { return responseModel.slashCommand?.name; }
			get sessionId() { return responseModel.session.sessionId; }
			get requestId() { return responseModel.requestId; }
			get result() { return responseModel.result; }
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

		this._timeline.ensureEditInUndoStopMatches(requestId, undoStop, entry, /* next= */ true, undefined);
		return entry.acceptStreamingEditsEnd();

	}

	/**
	 * Retrieves or creates a modified file entry.
	 *
	 * @returns The modified file entry.
	 */
	private async _getOrCreateModifiedFileEntry(resource: URI, telemetryInfo: IModifiedEntryTelemetryInfo): Promise<AbstractChatEditingModifiedFileEntry> {

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
		} else {
			const initialContent = this._initialFileContents.get(resource);
			// This gets manually disposed in .dispose() or in .restoreSnapshot()
			entry = await this._createModifiedFileEntry(resource, telemetryInfo, false, initialContent);
			if (!initialContent) {
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

	private async _createModifiedFileEntry(resource: URI, telemetryInfo: IModifiedEntryTelemetryInfo, mustExist = false, initialContent: string | undefined): Promise<AbstractChatEditingModifiedFileEntry> {
		const multiDiffEntryDelegate = { collapse: (transaction: ITransaction | undefined) => this._collapse(resource, transaction) };
		const chatKind = mustExist ? ChatEditKind.Created : ChatEditKind.Modified;
		const notebookUri = CellUri.parse(resource)?.notebook || resource;
		try {
			if (this._notebookService.hasSupportedNotebooks(notebookUri)) {
				return await ChatEditingModifiedNotebookEntry.create(notebookUri, multiDiffEntryDelegate, telemetryInfo, chatKind, initialContent, this._instantiationService);
			} else {
				const ref = await this._textModelService.createModelReference(resource);
				return this._instantiationService.createInstance(ChatEditingModifiedDocumentEntry, ref, multiDiffEntryDelegate, telemetryInfo, chatKind, initialContent);
			}
		} catch (err) {
			if (mustExist) {
				throw err;
			}
			// this file does not exist yet, create it and try again
			await this._bulkEditService.apply({ edits: [{ newResource: resource }] });
			this._editorService.openEditor({ resource, options: { inactive: true, preserveFocus: true, pinned: true } });
			if (this._notebookService.hasSupportedNotebooks(notebookUri)) {
				return await ChatEditingModifiedNotebookEntry.create(resource, multiDiffEntryDelegate, telemetryInfo, ChatEditKind.Created, initialContent, this._instantiationService);
			} else {
				return this._createModifiedFileEntry(resource, telemetryInfo, true, initialContent);
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
