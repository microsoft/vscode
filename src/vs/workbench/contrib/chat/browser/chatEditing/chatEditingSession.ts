/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals as arraysEqual, binarySearch2 } from '../../../../../base/common/arrays.js';
import { findLast } from '../../../../../base/common/arraysFind.js';
import { DeferredPromise, ITask, Sequencer, SequencerByKey, timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { BugIndicatingError } from '../../../../../base/common/errors.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Iterable } from '../../../../../base/common/iterator.js';
import { Disposable, DisposableStore, dispose } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { autorun, derived, derivedOpts, IObservable, IReader, ITransaction, ObservablePromise, observableValue, transaction } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { IBulkEditService } from '../../../../../editor/browser/services/bulkEditService.js';
import { TextEdit } from '../../../../../editor/common/languages.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IEditorWorkerService } from '../../../../../editor/common/services/editorWorker.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { localize } from '../../../../../nls.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { EditorActivation } from '../../../../../platform/editor/common/editor.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { DiffEditorInput } from '../../../../common/editor/diffEditorInput.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { MultiDiffEditor } from '../../../multiDiffEditor/browser/multiDiffEditor.js';
import { MultiDiffEditorInput } from '../../../multiDiffEditor/browser/multiDiffEditorInput.js';
import { CellUri, ICellEditOperation } from '../../../notebook/common/notebookCommon.js';
import { INotebookService } from '../../../notebook/common/notebookService.js';
import { ChatEditingSessionState, ChatEditKind, getMultiDiffSourceUri, IChatEditingSession, IEditSessionEntryDiff, IModifiedEntryTelemetryInfo, IModifiedFileEntry, ISnapshotEntry, IStreamingEdits, ModifiedFileEntryState } from '../../common/chatEditingService.js';
import { IChatRequestDisablement, IChatResponseModel } from '../../common/chatModel.js';
import { IChatService } from '../../common/chatService.js';
import { ChatEditingModifiedDocumentEntry } from './chatEditingModifiedDocumentEntry.js';
import { AbstractChatEditingModifiedFileEntry } from './chatEditingModifiedFileEntry.js';
import { ChatEditingModifiedNotebookEntry } from './chatEditingModifiedNotebookEntry.js';
import { ChatEditingSessionStorage, IChatEditingSessionSnapshot, IChatEditingSessionStop, StoredSessionState } from './chatEditingSessionStorage.js';
import { ChatEditingTextModelContentProvider } from './chatEditingTextModelContentProviders.js';
import { ChatEditingModifiedNotebookDiff } from './notebook/chatEditingModifiedNotebookDiff.js';

const POST_EDIT_STOP_ID = 'd19944f6-f46c-4e17-911b-79a8e843c7c0'; // randomly generated

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

function getMaxHistoryIndex(history: readonly IChatEditingSessionSnapshot[]) {
	const lastHistory = history.at(-1);
	return lastHistory ? lastHistory.startIndex + lastHistory.stops.length : 0;
}

function snapshotsEqualForDiff(a: ISnapshotEntry | undefined, b: ISnapshotEntry | undefined) {
	if (!a || !b) {
		return a === b;
	}

	return isEqual(a.snapshotUri, b.snapshotUri) && a.current === b.current;
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

function getFirstAndLastStop(uri: URI, history: readonly IChatEditingSessionSnapshot[]): { current: ResourceMap<ISnapshotEntry>; next: ResourceMap<ISnapshotEntry> } | undefined {
	let firstStopWithUri: IChatEditingSessionStop | undefined;
	for (const snapshot of history) {
		const stop = snapshot.stops.find(s => s.entries.has(uri));
		if (stop) {
			firstStopWithUri = stop;
			break;
		}
	}

	let lastStopWithUri: ResourceMap<ISnapshotEntry> | undefined;
	for (let i = history.length - 1; i >= 0; i--) {
		const snapshot = history[i];
		if (snapshot.postEdit?.has(uri)) {
			lastStopWithUri = snapshot.postEdit;
			break;
		}

		const stop = findLast(snapshot.stops, s => s.entries.has(uri));
		if (stop) {
			lastStopWithUri = stop.entries;
			break;
		}
	}

	if (!firstStopWithUri || !lastStopWithUri) {
		return undefined;
	}

	return { current: firstStopWithUri.entries, next: lastStopWithUri };
}

export class ChatEditingSession extends Disposable implements IChatEditingSession {

	private readonly _state = observableValue<ChatEditingSessionState>(this, ChatEditingSessionState.Initial);
	private readonly _linearHistory = observableValue<readonly IChatEditingSessionSnapshot[]>(this, []);
	private readonly _linearHistoryIndex = observableValue<number>(this, 0);

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

	public readonly canUndo = derived<boolean>((r) => {
		if (this.state.read(r) !== ChatEditingSessionState.Idle) {
			return false;
		}
		const linearHistoryIndex = this._linearHistoryIndex.read(r);
		return linearHistoryIndex > 0;
	});

	public readonly canRedo = derived<boolean>((r) => {
		if (this.state.read(r) !== ChatEditingSessionState.Idle) {
			return false;
		}
		const linearHistoryIndex = this._linearHistoryIndex.read(r);
		return linearHistoryIndex < getMaxHistoryIndex(this._linearHistory.read(r));
	});

	// public hiddenRequestIds = derived<string[]>((r) => {
	// 	const linearHistory = this._linearHistory.read(r);
	// 	const linearHistoryIndex = this._linearHistoryIndex.read(r);
	// 	return linearHistory.slice(linearHistoryIndex).map(s => s.requestId).filter((r): r is string => !!r);
	// });

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
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IAccessibilitySignalService private readonly _accessibilitySignalService: IAccessibilitySignalService,
	) {
		super();
		this._ignoreTrimWhitespaceObservable = observableConfigValue('diffEditor.ignoreTrimWhitespace', true, this._configurationService);
	}

	public async init(): Promise<void> {
		const restoredSessionState = await this._instantiationService.createInstance(ChatEditingSessionStorage, this.chatSessionId).restoreState();
		if (restoredSessionState) {
			for (const [uri, content] of restoredSessionState.initialFileContents) {
				this._initialFileContents.set(uri, content);
			}
			this._pendingSnapshot = restoredSessionState.pendingSnapshot;
			await this._restoreSnapshot(restoredSessionState.recentSnapshot, false);
			transaction(async tx => {
				this._linearHistory.set(restoredSessionState.linearHistory, tx);
				this._linearHistoryIndex.set(restoredSessionState.linearHistoryIndex, tx);
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
		const state: StoredSessionState = {
			initialFileContents: this._initialFileContents,
			pendingSnapshot: this._pendingSnapshot,
			recentSnapshot: this._createSnapshot(undefined, undefined),
			linearHistoryIndex: this._linearHistoryIndex.get(),
			linearHistory: this._linearHistory.get(),
		};
		return storage.storeState(state);
	}

	private _findSnapshot(requestId: string): IChatEditingSessionSnapshot | undefined {
		return this._linearHistory.get().find(s => s.requestId === requestId);
	}

	private _findEditStop(requestId: string, undoStop: string | undefined) {
		const snapshot = this._findSnapshot(requestId);
		if (!snapshot) {
			return undefined;
		}
		const idx = snapshot.stops.findIndex(s => s.stopId === undoStop);
		return idx === -1 ? undefined : { stop: snapshot.stops[idx], snapshot, historyIndex: snapshot.startIndex + idx };
	}

	private _ensurePendingSnapshot() {
		this._pendingSnapshot ??= this._createSnapshot(undefined, undefined);
	}

	private _diffsBetweenStops = new Map<string, IObservable<IEditSessionEntryDiff | undefined>>();
	private _fullDiffs = new Map<string, IObservable<IEditSessionEntryDiff | undefined>>();

	private readonly _ignoreTrimWhitespaceObservable: IObservable<boolean>;

	/**
	 * Gets diff for text entries between stops.
	 * @param entriesContent Observable that observes either snapshot entry
	 * @param modelUrisObservable Observable that observes only the snapshot URIs.
	 */
	private _entryDiffBetweenTextStops(
		entriesContent: IObservable<{ before: ISnapshotEntry; after: ISnapshotEntry } | undefined>,
		modelUrisObservable: IObservable<[URI, URI] | undefined>,
	): IObservable<ObservablePromise<IEditSessionEntryDiff> | undefined> {
		const modelRefsPromise = derived(this, (reader) => {
			const modelUris = modelUrisObservable.read(reader);
			if (!modelUris) { return undefined; }

			const store = reader.store.add(new DisposableStore());
			const promise = Promise.all(modelUris.map(u => this._textModelService.createModelReference(u))).then(refs => {
				if (store.isDisposed) {
					refs.forEach(r => r.dispose());
				} else {
					refs.forEach(r => store.add(r));
				}

				return refs;
			});

			return new ObservablePromise(promise);
		});

		return derived((reader): ObservablePromise<IEditSessionEntryDiff> | undefined => {
			const refs2 = modelRefsPromise.read(reader)?.promiseResult.read(reader);
			const refs = refs2?.data;
			if (!refs) {
				return;
			}

			const entries = entriesContent.read(reader); // trigger re-diffing when contents change

			if (entries?.before && ChatEditingModifiedNotebookEntry.canHandleSnapshot(entries.before)) {
				const diffService = this._instantiationService.createInstance(ChatEditingModifiedNotebookDiff, entries.before, entries.after);
				return new ObservablePromise(diffService.computeDiff());

			}
			const ignoreTrimWhitespace = this._ignoreTrimWhitespaceObservable.read(reader);
			const promise = this._editorWorkerService.computeDiff(
				refs[0].object.textEditorModel.uri,
				refs[1].object.textEditorModel.uri,
				{ ignoreTrimWhitespace, computeMoves: false, maxComputationTimeMs: 3000 },
				'advanced'
			).then((diff): IEditSessionEntryDiff => {
				const entryDiff: IEditSessionEntryDiff = {
					originalURI: refs[0].object.textEditorModel.uri,
					modifiedURI: refs[1].object.textEditorModel.uri,
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

			return new ObservablePromise(promise);
		});
	}

	private _createDiffBetweenStopsObservable(uri: URI, requestId: string | undefined, stopId: string | undefined): IObservable<IEditSessionEntryDiff | undefined> {
		const entries = derivedOpts<undefined | { before: ISnapshotEntry; after: ISnapshotEntry }>(
			{
				equalsFn: (a, b) => snapshotsEqualForDiff(a?.before, b?.before) && snapshotsEqualForDiff(a?.after, b?.after),
			},
			reader => {
				const stops = requestId ?
					getCurrentAndNextStop(requestId, stopId, this._linearHistory.read(reader)) :
					getFirstAndLastStop(uri, this._linearHistory.read(reader));
				if (!stops) { return undefined; }
				const before = stops.current.get(uri);
				const after = stops.next.get(uri);
				if (!before || !after) { return undefined; }
				return { before, after };
			},
		);

		// Separate observable for model refs to avoid unnecessary disposal
		const modelUrisObservable = derivedOpts<[URI, URI] | undefined>({ equalsFn: (a, b) => arraysEqual(a, b, isEqual) }, reader => {
			const entriesValue = entries.read(reader);
			if (!entriesValue) { return undefined; }
			return [entriesValue.before.snapshotUri, entriesValue.after.snapshotUri];
		});

		const diff = this._entryDiffBetweenTextStops(entries, modelUrisObservable);

		return derived(reader => {
			return diff.read(reader)?.promiseResult.read(reader)?.data || undefined;
		});
	}

	public getEntryDiffBetweenStops(uri: URI, requestId: string | undefined, stopId: string | undefined) {
		if (requestId) {
			const key = `${uri}\0${requestId}\0${stopId}`;
			let observable = this._diffsBetweenStops.get(key);
			if (!observable) {
				observable = this._createDiffBetweenStopsObservable(uri, requestId, stopId);
				this._diffsBetweenStops.set(key, observable);
			}

			return observable;
		} else {
			const key = uri.toString();
			let observable = this._fullDiffs.get(key);
			if (!observable) {
				observable = this._createDiffBetweenStopsObservable(uri, requestId, stopId);
				this._fullDiffs.set(key, observable);
			}

			return observable;
		}
	}

	public createSnapshot(requestId: string, undoStop: string | undefined, makeEmpty = undoStop !== undefined): void {
		const snapshot = makeEmpty ? this._createEmptySnapshot(undoStop) : this._createSnapshot(requestId, undoStop);

		const linearHistoryPtr = this._linearHistoryIndex.get();
		const newLinearHistory: IChatEditingSessionSnapshot[] = [];
		for (const entry of this._linearHistory.get()) {
			if (entry.startIndex >= linearHistoryPtr) {
				// all further entries are being dropped
				break;
			} else if (linearHistoryPtr - entry.startIndex < entry.stops.length) {
				newLinearHistory.push({ requestId: entry.requestId, stops: entry.stops.slice(0, linearHistoryPtr - entry.startIndex), startIndex: entry.startIndex, postEdit: undefined });
			} else {
				newLinearHistory.push(entry);
			}
		}

		const lastEntry = newLinearHistory.at(-1);
		if (requestId && lastEntry?.requestId === requestId) {
			// mirror over the saved postEdit modifications
			if (lastEntry.postEdit && undoStop) {
				const rebaseUri = (uri: URI) => URI.parse(uri.toString().replaceAll(POST_EDIT_STOP_ID, undoStop));
				for (const [uri, prev] of lastEntry.postEdit.entries()) {
					snapshot.entries.set(uri, { ...prev, snapshotUri: rebaseUri(prev.snapshotUri), resource: rebaseUri(prev.resource) });
				}
			}

			newLinearHistory[newLinearHistory.length - 1] = { ...lastEntry, stops: [...lastEntry.stops, snapshot], postEdit: undefined };
		} else {
			newLinearHistory.push({ requestId, startIndex: lastEntry ? lastEntry.startIndex + lastEntry.stops.length : 0, stops: [snapshot], postEdit: undefined });
		}

		transaction((tx) => {
			const last = newLinearHistory[newLinearHistory.length - 1];
			this._linearHistory.set(newLinearHistory, tx);
			this._linearHistoryIndex.set(last.startIndex + last.stops.length, tx);
		});
	}

	private _createEmptySnapshot(undoStop: string | undefined): IChatEditingSessionStop {
		return {
			stopId: undoStop,
			entries: new ResourceMap(),
		};
	}

	private _createSnapshot(requestId: string | undefined, undoStop: string | undefined): IChatEditingSessionStop {
		const entries = new ResourceMap<ISnapshotEntry>();
		for (const entry of this._entriesObs.get()) {
			entries.set(entry.modifiedURI, entry.createSnapshot(requestId, undoStop));
		}

		return {
			stopId: undoStop,
			entries,
		};
	}

	public getSnapshot(requestId: string, undoStop: string | undefined, snapshotUri: URI): ISnapshotEntry | undefined {
		const entries = undoStop === POST_EDIT_STOP_ID
			? this._findSnapshot(requestId)?.postEdit
			: this._findEditStop(requestId, undoStop)?.stop.entries;
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
		const stops = getCurrentAndNextStop(requestId, stopId, this._linearHistory.get());
		return stops?.next.get(uri)?.snapshotUri;
	}

	/**
	 * A snapshot representing the state of the working set before a new request has been sent
	 */
	private _pendingSnapshot: IChatEditingSessionStop | undefined;
	public async restoreSnapshot(requestId: string | undefined, stopId: string | undefined): Promise<void> {
		if (requestId !== undefined) {
			const stopRef = this._findEditStop(requestId, stopId);
			if (stopRef) {
				this._ensurePendingSnapshot();
				this._linearHistoryIndex.set(stopRef.historyIndex, undefined);
				await this._restoreSnapshot(stopRef.stop);
				this._updateRequestHiddenState();
			}
		} else {
			const pendingSnapshot = this._pendingSnapshot;
			if (!pendingSnapshot) {
				return; // We don't have a pending snapshot that we can restore
			}
			this._pendingSnapshot = undefined;
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

	private _getHistoryEntryByLinearIndex(index: number) {
		const history = this._linearHistory.get();
		const searchedIndex = binarySearch2(history.length, (e) => history[e].startIndex - index);
		const entry = history[searchedIndex < 0 ? (~searchedIndex) - 1 : searchedIndex];
		if (!entry || index - entry.startIndex >= entry.stops.length) {
			return undefined;
		}

		return {
			entry,
			stop: entry.stops[index - entry.startIndex]
		};
	}

	async undoInteraction(): Promise<void> {
		const newIndex = this._linearHistoryIndex.get() - 1;
		const previousSnapshot = this._getHistoryEntryByLinearIndex(newIndex);
		if (!previousSnapshot) {
			return;
		}

		this._ensurePendingSnapshot();
		await this._restoreSnapshot(previousSnapshot.stop);
		this._linearHistoryIndex.set(newIndex, undefined);
		this._updateRequestHiddenState();
	}

	async redoInteraction(): Promise<void> {
		const maxIndex = getMaxHistoryIndex(this._linearHistory.get());
		const newIndex = this._linearHistoryIndex.get() + 1;
		if (newIndex > maxIndex) {
			return;
		}

		const nextSnapshot = newIndex === maxIndex ? this._pendingSnapshot : this._getHistoryEntryByLinearIndex(newIndex)?.stop;
		if (!nextSnapshot) {
			return;
		}
		await this._restoreSnapshot(nextSnapshot);
		this._linearHistoryIndex.set(newIndex, undefined);
		this._updateRequestHiddenState();
	}


	private _updateRequestHiddenState() {
		const history = this._linearHistory.get();
		const index = this._linearHistoryIndex.get();

		const undoRequests: IChatRequestDisablement[] = [];
		for (const entry of history) {
			if (!entry.requestId) {
				// ignored
			} else if (entry.startIndex >= index) {
				undoRequests.push({ requestId: entry.requestId });
			} else if (entry.startIndex + entry.stops.length > index) {
				undoRequests.push({ requestId: entry.requestId, afterUndoStop: entry.stops[index - entry.startIndex].stopId });
			}
		}

		this._chatService.getSession(this.chatSessionId)?.setDisabledRequests(undoRequests);
	}

	private async _acceptStreamingEditsStart(responseModel: IChatResponseModel, undoStop: string | undefined, resource: URI) {
		const entry = await this._getOrCreateModifiedFileEntry(resource, this._getTelemetryInfoForModel(responseModel));
		transaction((tx) => {
			this._state.set(ChatEditingSessionState.StreamingEdits, tx);
			entry.acceptStreamingEditsStart(responseModel, tx);
			this.ensureEditInUndoStopMatches(responseModel.requestId, undoStop, entry, false, tx);
		});
	}

	/**
	 * Ensures the state of the file in the given snapshot matches the current
	 * state of the {@param entry}. This is used to handle concurrent file edits.
	 *
	 * Given the case of two different edits, we will place and undo stop right
	 * before we `textEditGroup` in the underlying markdown stream, but at the
	 * time those are added the edits haven't been made yet, so both files will
	 * simply have the unmodified state.
	 *
	 * This method is called after each edit, so after the first file finishes
	 * being edits, it will update its content in the second undo snapshot such
	 * that it can be undone successfully.
	 *
	 * We ensure that the same file is not concurrently edited via the
	 * {@link _streamingEditLocks}, avoiding race conditions.
	 *
	 * @param next If true, this will edit the snapshot _after_ the undo stop
	 */
	private ensureEditInUndoStopMatches(requestId: string, undoStop: string | undefined, entry: AbstractChatEditingModifiedFileEntry, next: boolean, tx: ITransaction | undefined) {
		const history = this._linearHistory.get();
		const snapIndex = history.findIndex(s => s.requestId === requestId);
		if (snapIndex === -1) {
			return;
		}

		const snap = history[snapIndex];
		let stopIndex = snap.stops.findIndex(s => s.stopId === undoStop);
		if (stopIndex === -1) {
			return;
		}

		// special case: put the last change in the pendingSnapshot as needed
		if (next) {
			if (stopIndex === snap.stops.length - 1) {
				const postEdit = new ResourceMap(snap.postEdit || this._createEmptySnapshot(undefined).entries);
				if (!snap.postEdit || !entry.equalsSnapshot(postEdit.get(entry.modifiedURI))) {
					postEdit.set(entry.modifiedURI, entry.createSnapshot(requestId, POST_EDIT_STOP_ID));
					const newHistory = history.slice();
					newHistory[snapIndex] = { ...snap, postEdit };
					this._linearHistory.set(newHistory, tx);
				}
				return;
			}
			stopIndex++;
		}

		const stop = snap.stops[stopIndex];
		if (entry.equalsSnapshot(stop.entries.get(entry.modifiedURI))) {
			return;
		}

		const newMap = new ResourceMap(stop.entries);
		newMap.set(entry.modifiedURI, entry.createSnapshot(requestId, stop.stopId));

		const newStop = snap.stops.slice();
		newStop[stopIndex] = { ...stop, entries: newMap };

		const newHistory = history.slice();
		newHistory[snapIndex] = { ...snap, stops: newStop };
		this._linearHistory.set(newHistory, tx);
	}

	private async _acceptEdits(resource: URI, textEdits: (TextEdit | ICellEditOperation)[], isLastEdits: boolean, responseModel: IChatResponseModel): Promise<void> {
		this._fullDiffs.delete(resource.toString());
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

		this.ensureEditInUndoStopMatches(requestId, undoStop, entry, /* next= */ true, undefined);
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
