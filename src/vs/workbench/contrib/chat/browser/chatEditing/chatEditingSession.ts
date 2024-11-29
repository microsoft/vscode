/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Sequencer } from '../../../../../base/common/async.js';
import { BugIndicatingError } from '../../../../../base/common/errors.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap, ResourceSet } from '../../../../../base/common/map.js';
import { autorun, derived, IObservable, IReader, ITransaction, observableValue, transaction } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { isCodeEditor, isDiffEditor } from '../../../../../editor/browser/editorBrowser.js';
import { IBulkEditService } from '../../../../../editor/browser/services/bulkEditService.js';
import { TextEdit } from '../../../../../editor/common/languages.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { localize } from '../../../../../nls.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { EditorActivation } from '../../../../../platform/editor/common/editor.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IEditorCloseEvent } from '../../../../common/editor.js';
import { DiffEditorInput } from '../../../../common/editor/diffEditorInput.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { MultiDiffEditor } from '../../../multiDiffEditor/browser/multiDiffEditor.js';
import { MultiDiffEditorInput } from '../../../multiDiffEditor/browser/multiDiffEditorInput.js';
import { ChatAgentLocation, IChatAgentService } from '../../common/chatAgents.js';
import { ChatEditingSessionChangeType, ChatEditingSessionState, ChatEditKind, IChatEditingSession, IModifiedFileEntry, WorkingSetDisplayMetadata, WorkingSetEntryRemovalReason, WorkingSetEntryState } from '../../common/chatEditingService.js';
import { IChatResponseModel } from '../../common/chatModel.js';
import { ChatEditingMultiDiffSourceResolver } from './chatEditingService.js';
import { ChatEditingModifiedFileEntry, IModifiedEntryTelemetryInfo, ISnapshotEntry } from './chatEditingModifiedFileEntry.js';
import { ChatEditingTextModelContentProvider } from './chatEditingTextModelContentProviders.js';
import { Schemas } from '../../../../../base/common/network.js';
import { isEqual, joinPath } from '../../../../../base/common/resources.js';
import { StringSHA1 } from '../../../../../base/common/hash.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { IOffsetEdit, ISingleOffsetEdit, OffsetEdit } from '../../../../../editor/common/core/offsetEdit.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IChatService } from '../../common/chatService.js';

const STORAGE_CONTENTS_FOLDER = 'contents';
const STORAGE_STATE_FILE = 'state.json';

export class ChatEditingSession extends Disposable implements IChatEditingSession {

	private readonly _state = observableValue<ChatEditingSessionState>(this, ChatEditingSessionState.Initial);
	private readonly _linearHistory = observableValue<IChatEditingSessionSnapshot[]>(this, []);
	private readonly _linearHistoryIndex = observableValue<number>(this, 0);

	/**
	 * Contains the contents of a file when the AI first began doing edits to it.
	 */
	private readonly _initialFileContents = new ResourceMap<string>();
	private readonly _filesToSkipCreating = new ResourceSet();

	private readonly _entriesObs = observableValue<readonly ChatEditingModifiedFileEntry[]>(this, []);
	public get entries(): IObservable<readonly ChatEditingModifiedFileEntry[]> {
		this._assertNotDisposed();
		return this._entriesObs;
	}
	private readonly _sequencer = new Sequencer();

	private _workingSet = new ResourceMap<WorkingSetDisplayMetadata>();
	get workingSet() {
		this._assertNotDisposed();

		// Return here a reunion between the AI modified entries and the user built working set
		const result = new ResourceMap<WorkingSetDisplayMetadata>(this._workingSet);
		for (const entry of this._entriesObs.get()) {
			result.set(entry.modifiedURI, { state: entry.state.get() });
		}

		return result;
	}

	private _removedTransientEntries = new ResourceSet();

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
		const linearHistory = this._linearHistory.read(r);
		const linearHistoryIndex = this._linearHistoryIndex.read(r);
		return linearHistoryIndex < linearHistory.length;
	});

	public hiddenRequestIds = derived<string[]>((r) => {
		const linearHistory = this._linearHistory.read(r);
		const linearHistoryIndex = this._linearHistoryIndex.read(r);
		return linearHistory.slice(linearHistoryIndex).map(s => s.requestId).filter((r): r is string => !!r);
	});

	private readonly _onDidChange = new Emitter<ChatEditingSessionChangeType>();
	get onDidChange() {
		this._assertNotDisposed();
		return this._onDidChange.event;
	}

	private readonly _onDidDispose = new Emitter<void>();
	get onDidDispose() {
		this._assertNotDisposed();
		return this._onDidDispose.event;
	}

	get isVisible(): boolean {
		this._assertNotDisposed();
		return Boolean(this._editorPane && this._editorPane.isVisible());
	}

	constructor(
		public readonly chatSessionId: string,
		private editingSessionFileLimitPromise: Promise<number>,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IModelService private readonly _modelService: IModelService,
		@ILanguageService private readonly _languageService: ILanguageService,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@IBulkEditService public readonly _bulkEditService: IBulkEditService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@IEditorService private readonly _editorService: IEditorService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IFileService private readonly _fileService: IFileService,
		@IFileDialogService private readonly _dialogService: IFileDialogService,
		@IChatAgentService private readonly _chatAgentService: IChatAgentService,
		@IChatService private readonly _chatService: IChatService,
	) {
		super();
	}

	public async init(): Promise<void> {
		const restoredSessionState = await this._instantiationService.createInstance(ChatEditingSessionStorage, this.chatSessionId).restoreState();
		if (restoredSessionState) {
			for (const uri of restoredSessionState.filesToSkipCreating) {
				this._filesToSkipCreating.add(uri);
			}
			for (const [uri, content] of restoredSessionState.initialFileContents) {
				this._initialFileContents.set(uri, content);
			}
			this._pendingSnapshot = restoredSessionState.pendingSnapshot;
			await this._restoreSnapshot(restoredSessionState.recentSnapshot);
			this._linearHistoryIndex.set(restoredSessionState.linearHistoryIndex, undefined);
			this._linearHistory.set(restoredSessionState.linearHistory, undefined);
			this._state.set(ChatEditingSessionState.Idle, undefined);
		}

		// Add the currently active editors to the working set
		this._trackCurrentEditorsInWorkingSet();
		this._register(this._editorService.onDidVisibleEditorsChange(() => {
			this._trackCurrentEditorsInWorkingSet();
		}));
		this._register(autorun(reader => {
			const entries = this.entries.read(reader);
			entries.forEach(entry => {
				entry.state.read(reader);
			});
			this._onDidChange.fire(ChatEditingSessionChangeType.WorkingSet);
		}));
	}

	public getEntry(uri: URI): IModifiedFileEntry | undefined {
		return this._entriesObs.get().find(e => isEqual(e.modifiedURI, uri));
	}

	public readEntry(uri: URI, reader: IReader | undefined): IModifiedFileEntry | undefined {
		return this._entriesObs.read(reader).find(e => isEqual(e.modifiedURI, uri));
	}

	public storeState(): Promise<void> {
		const storage = this._instantiationService.createInstance(ChatEditingSessionStorage, this.chatSessionId);
		const state: StoredSessionState = {
			filesToSkipCreating: [...this._filesToSkipCreating],
			initialFileContents: this._initialFileContents,
			pendingSnapshot: this._pendingSnapshot,
			recentSnapshot: this._createSnapshot(undefined),
			linearHistoryIndex: this._linearHistoryIndex.get(),
			linearHistory: this._linearHistory.get(),
		};
		return storage.storeState(state);
	}

	private _trackCurrentEditorsInWorkingSet(e?: IEditorCloseEvent) {
		const existingTransientEntries = new ResourceSet();
		for (const file of this._workingSet.keys()) {
			if (this._workingSet.get(file)?.state === WorkingSetEntryState.Transient) {
				existingTransientEntries.add(file);
			}
		}

		const activeEditors = new ResourceSet();
		this._editorGroupsService.groups.forEach((group) => {
			if (!group.activeEditorPane) {
				return;
			}
			let activeEditorControl = group.activeEditorPane.getControl();
			if (isDiffEditor(activeEditorControl)) {
				activeEditorControl = activeEditorControl.getOriginalEditor().hasTextFocus() ? activeEditorControl.getOriginalEditor() : activeEditorControl.getModifiedEditor();
			}
			if (isCodeEditor(activeEditorControl) && activeEditorControl.hasModel()) {
				const uri = activeEditorControl.getModel().uri;
				if (existingTransientEntries.has(uri)) {
					existingTransientEntries.delete(uri);
				} else if (!this._workingSet.has(uri) && !this._removedTransientEntries.has(uri)) {
					// Don't add as a transient entry if it's already part of the working set
					// or if the user has intentionally removed it from the working set
					activeEditors.add(uri);
				}
			}
		});

		let didChange = false;
		for (const entry of existingTransientEntries) {
			didChange = this._workingSet.delete(entry) || didChange;
		}

		for (const entry of activeEditors) {
			this._workingSet.set(entry, { state: WorkingSetEntryState.Transient, description: localize('chatEditing.transient', "Open Editor") });
			didChange = true;
		}

		if (didChange) {
			this._onDidChange.fire(ChatEditingSessionChangeType.WorkingSet);
		}
	}

	private _findSnapshot(requestId: string): IChatEditingSessionSnapshot | undefined {
		return this._linearHistory.get().find(s => s.requestId === requestId);
	}

	public createSnapshot(requestId: string | undefined): void {
		const snapshot = this._createSnapshot(requestId);
		if (requestId) {
			for (const workingSetItem of this._workingSet.keys()) {
				this._workingSet.set(workingSetItem, { state: WorkingSetEntryState.Sent });
			}
			const linearHistory = this._linearHistory.get();
			const linearHistoryIndex = this._linearHistoryIndex.get();
			const newLinearHistory = linearHistory.slice(0, linearHistoryIndex);
			newLinearHistory.push(snapshot);
			transaction((tx) => {
				this._linearHistory.set(newLinearHistory, tx);
				this._linearHistoryIndex.set(newLinearHistory.length, tx);
			});
		} else {
			this._pendingSnapshot = snapshot;
		}
	}

	private _createSnapshot(requestId: string | undefined): IChatEditingSessionSnapshot {
		const workingSet = new ResourceMap<WorkingSetDisplayMetadata>();
		for (const [file, state] of this._workingSet) {
			workingSet.set(file, state);
		}
		const entries = new ResourceMap<ISnapshotEntry>();
		for (const entry of this._entriesObs.get()) {
			entries.set(entry.modifiedURI, entry.createSnapshot(requestId));
		}
		return {
			requestId,
			workingSet,
			entries
		};
	}

	public async getSnapshotModel(requestId: string, snapshotUri: URI): Promise<ITextModel | null> {
		const entries = this._findSnapshot(requestId)?.entries;
		if (!entries) {
			return null;
		}

		const snapshotEntry = [...entries.values()].find((e) => isEqual(e.snapshotUri, snapshotUri));
		if (!snapshotEntry) {
			return null;
		}

		return this._modelService.createModel(snapshotEntry.current, this._languageService.createById(snapshotEntry.languageId), snapshotUri, false);
	}

	public getSnapshot(requestId: string, uri: URI) {
		const snapshot = this._findSnapshot(requestId);
		const snapshotEntries = snapshot?.entries;
		return snapshotEntries?.get(uri);
	}

	/**
	 * A snapshot representing the state of the working set before a new request has been sent
	 */
	private _pendingSnapshot: IChatEditingSessionSnapshot | undefined;
	public async restoreSnapshot(requestId: string | undefined): Promise<void> {
		if (requestId !== undefined) {
			const snapshot = this._findSnapshot(requestId);
			if (snapshot) {
				if (!this._pendingSnapshot) {
					// Create and save a pending snapshot
					this.createSnapshot(undefined);
				}
				await this._restoreSnapshot(snapshot);
			}
		} else {
			if (!this._pendingSnapshot) {
				return; // We don't have a pending snapshot that we can restore
			}
			const snapshot = this._pendingSnapshot;
			this._pendingSnapshot = undefined;
			await this._restoreSnapshot(snapshot);
		}
	}


	private async _restoreSnapshot(snapshot: IChatEditingSessionSnapshot): Promise<void> {
		this._workingSet = new ResourceMap();
		snapshot.workingSet.forEach((state, uri) => this._workingSet.set(uri, state));

		// Reset all the files which are modified in this session state
		// but which are not found in the snapshot
		for (const entry of this._entriesObs.get()) {
			const snapshotEntry = snapshot.entries.get(entry.modifiedURI);
			if (!snapshotEntry) {
				entry.resetToInitialValue();
				entry.dispose();
			}
		}

		const entriesArr: ChatEditingModifiedFileEntry[] = [];
		// Restore all entries from the snapshot
		for (const snapshotEntry of snapshot.entries.values()) {
			const entry = await this._getOrCreateModifiedFileEntry(snapshotEntry.resource, snapshotEntry.telemetryInfo);
			entry.restoreFromSnapshot(snapshotEntry);
			entriesArr.push(entry);
		}

		this._entriesObs.set(entriesArr, undefined);
	}

	remove(reason: WorkingSetEntryRemovalReason, ...uris: URI[]): void {
		this._assertNotDisposed();

		let didRemoveUris = false;
		for (const uri of uris) {

			const entry = this._entriesObs.get().find(e => isEqual(e.modifiedURI, uri));
			if (entry) {
				entry.dispose();
				const newEntries = this._entriesObs.get().filter(e => !isEqual(e.modifiedURI, uri));
				this._entriesObs.set(newEntries, undefined);
				didRemoveUris = true;
			}

			const state = this._workingSet.get(uri);
			if (state !== undefined) {
				didRemoveUris = this._workingSet.delete(uri) || didRemoveUris;
				if (reason === WorkingSetEntryRemovalReason.User && (state.state === WorkingSetEntryState.Transient || state.state === WorkingSetEntryState.Suggested)) {
					this._removedTransientEntries.add(uri);
				}
			}
		}

		if (!didRemoveUris) {
			return; // noop
		}

		this._onDidChange.fire(ChatEditingSessionChangeType.WorkingSet);
	}

	private _assertNotDisposed(): void {
		if (this._state.get() === ChatEditingSessionState.Disposed) {
			throw new BugIndicatingError(`Cannot access a disposed editing session`);
		}
	}

	async accept(...uris: URI[]): Promise<void> {
		this._assertNotDisposed();

		if (uris.length === 0) {
			await Promise.all(this._entriesObs.get().map(entry => entry.accept(undefined)));
		}

		for (const uri of uris) {
			const entry = this._entriesObs.get().find(e => isEqual(e.modifiedURI, uri));
			if (entry) {
				await entry.accept(undefined);
			}
		}

		this._onDidChange.fire(ChatEditingSessionChangeType.Other);
	}

	async reject(...uris: URI[]): Promise<void> {
		this._assertNotDisposed();

		if (uris.length === 0) {
			await Promise.all(this._entriesObs.get().map(entry => entry.reject(undefined)));
		}

		for (const uri of uris) {
			const entry = this._entriesObs.get().find(e => isEqual(e.modifiedURI, uri));
			if (entry) {
				await entry.reject(undefined);
			}
		}

		this._onDidChange.fire(ChatEditingSessionChangeType.Other);
	}

	async show(): Promise<void> {
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
			multiDiffSource: ChatEditingMultiDiffSourceResolver.getMultiDiffSourceUri(),
			label: localize('multiDiffEditorInput.name', "Suggested Edits")
		}, this._instantiationService);

		this._editorPane = await this._editorGroupsService.activeGroup.openEditor(input, { pinned: true, activation: EditorActivation.ACTIVATE }) as MultiDiffEditor | undefined;
	}

	private stopPromise: Promise<void> | undefined;

	async stop(clearState = false): Promise<void> {
		if (!this.stopPromise) {
			this.stopPromise = this._performStop();
		}
		await this.stopPromise;
		if (clearState) {
			await this._instantiationService.createInstance(ChatEditingSessionStorage, this.chatSessionId).clearState();
		}
	}

	async _performStop(): Promise<void> {
		// Close out all open files
		const schemes = [ChatEditingModifiedFileEntry.scheme, ChatEditingTextModelContentProvider.scheme];
		await Promise.allSettled(this._editorGroupsService.groups.flatMap(async (g) => {
			return g.editors.map(async (e) => {
				if ((e instanceof MultiDiffEditorInput && e.initialResources?.some(r => r.originalUri && schemes.indexOf(r.originalUri.scheme) !== -1))
					|| (e instanceof DiffEditorInput && e.original.resource && schemes.indexOf(e.original.resource.scheme) !== -1)) {
					await g.closeEditor(e);
				}
			});
		}));

		if (this._state.get() !== ChatEditingSessionState.Disposed) {
			// session got disposed while we were closing editors and clearing state
			this.dispose();
		}
	}

	override dispose() {
		this._assertNotDisposed();

		for (const entry of this._entriesObs.get()) {
			entry.dispose();
		}

		super.dispose();
		this._state.set(ChatEditingSessionState.Disposed, undefined);
		this._onDidDispose.fire();
	}

	getVirtualModel(documentId: string): ITextModel | null {
		this._assertNotDisposed();

		const entry = this._entriesObs.get().find(e => e.entryId === documentId);
		return entry?.originalModel ?? null;
	}

	acceptStreamingEditsStart(): void {
		if (this._state.get() === ChatEditingSessionState.Disposed) {
			// we don't throw in this case because there could be a builder still connected to a disposed session
			return;
		}

		// ensure that the edits are processed sequentially
		this._sequencer.queue(() => this._acceptStreamingEditsStart());
	}

	acceptTextEdits(resource: URI, textEdits: TextEdit[], isLastEdits: boolean, responseModel: IChatResponseModel): void {
		if (this._state.get() === ChatEditingSessionState.Disposed) {
			// we don't throw in this case because there could be a builder still connected to a disposed session
			return;
		}

		// ensure that the edits are processed sequentially
		this._sequencer.queue(() => this._acceptTextEdits(resource, textEdits, isLastEdits, responseModel));
	}

	resolve(): void {
		if (this._state.get() === ChatEditingSessionState.Disposed) {
			// we don't throw in this case because there could be a builder still connected to a disposed session
			return;
		}

		// ensure that the edits are processed sequentially
		this._sequencer.queue(() => this._resolve());
	}

	addFileToWorkingSet(resource: URI, description?: string, proposedState?: WorkingSetEntryState.Suggested): void {
		const state = this._workingSet.get(resource);
		if (proposedState === WorkingSetEntryState.Suggested) {
			if (state !== undefined || this._removedTransientEntries.has(resource)) {
				return;
			}
			this._workingSet.set(resource, { description, state: WorkingSetEntryState.Suggested });
			this._onDidChange.fire(ChatEditingSessionChangeType.WorkingSet);
		} else if (state === undefined || state.state === WorkingSetEntryState.Transient || state.state === WorkingSetEntryState.Suggested) {
			this._workingSet.set(resource, { description, state: WorkingSetEntryState.Attached });
			this._onDidChange.fire(ChatEditingSessionChangeType.WorkingSet);
		}
	}

	async undoInteraction(): Promise<void> {
		const linearHistory = this._linearHistory.get();
		const newIndex = this._linearHistoryIndex.get() - 1;
		if (newIndex < 0) {
			return;
		}
		const previousSnapshot = linearHistory[newIndex];
		await this.restoreSnapshot(previousSnapshot.requestId);
		this._linearHistoryIndex.set(newIndex, undefined);
		this._updateRequestHiddenState();

	}

	async redoInteraction(): Promise<void> {
		const linearHistory = this._linearHistory.get();
		const newIndex = this._linearHistoryIndex.get() + 1;
		if (newIndex > linearHistory.length) {
			return;
		}
		const nextSnapshot = newIndex < linearHistory.length ? linearHistory[newIndex] : this._pendingSnapshot;
		if (!nextSnapshot) {
			return;
		}
		await this.restoreSnapshot(nextSnapshot.requestId);
		this._linearHistoryIndex.set(newIndex, undefined);
		this._updateRequestHiddenState();
	}

	private _updateRequestHiddenState() {
		const hiddenRequestIds = this._linearHistory.get().slice(this._linearHistoryIndex.get()).map(s => s.requestId).filter((r): r is string => !!r);
		this._chatService.getSession(this.chatSessionId)?.disableRequests(hiddenRequestIds);
	}

	private async _acceptStreamingEditsStart(): Promise<void> {
		transaction((tx) => {
			this._state.set(ChatEditingSessionState.StreamingEdits, tx);
			for (const entry of this._entriesObs.get()) {
				entry.acceptStreamingEditsStart(tx);
			}
		});
	}

	private async _acceptTextEdits(resource: URI, textEdits: TextEdit[], isLastEdits: boolean, responseModel: IChatResponseModel): Promise<void> {
		if (this._filesToSkipCreating.has(resource)) {
			return;
		}

		if (!this._entriesObs.get().find(e => isEqual(e.modifiedURI, resource)) && this._entriesObs.get().length >= (await this.editingSessionFileLimitPromise)) {
			// Do not create files in a single editing session that would be in excess of our limit
			return;
		}

		if (resource.scheme !== Schemas.untitled && !this._workspaceContextService.getWorkspaceFolder(resource) && !(await this._fileService.exists(resource))) {
			// if the file doesn't exist yet and is outside the workspace, prompt the user for a location to save it to
			const saveLocation = await this._dialogService.showSaveDialog({ title: localize('chatEditing.fileSave', '{0} wants to create a file. Choose where it should be saved.', this._chatAgentService.getDefaultAgent(ChatAgentLocation.EditingSession)?.fullName ?? 'Chat') });
			if (!saveLocation) {
				// don't ask the user to create the file again when the next text edit for this same resource streams in
				this._filesToSkipCreating.add(resource);
				return;
			}
			resource = saveLocation;
		}

		// Make these getters because the response result is not available when the file first starts to be edited
		const telemetryInfo = new class {
			get agentId() { return responseModel.agent?.id; }
			get command() { return responseModel.slashCommand?.name; }
			get sessionId() { return responseModel.session.sessionId; }
			get requestId() { return responseModel.requestId; }
			get result() { return responseModel.result; }
		};
		const entry = await this._getOrCreateModifiedFileEntry(resource, telemetryInfo);
		entry.acceptAgentEdits(textEdits, isLastEdits);
		// await this._editorService.openEditor({ resource: entry.modifiedURI, options: { inactive: true } });
	}

	private async _resolve(): Promise<void> {
		transaction((tx) => {
			for (const entry of this._entriesObs.get()) {
				entry.acceptStreamingEditsEnd(tx);
			}
			this._state.set(ChatEditingSessionState.Idle, tx);
		});
		this._onDidChange.fire(ChatEditingSessionChangeType.Other);
	}

	private async _getOrCreateModifiedFileEntry(resource: URI, responseModel: IModifiedEntryTelemetryInfo): Promise<ChatEditingModifiedFileEntry> {
		const existingEntry = this._entriesObs.get().find(e => isEqual(e.modifiedURI, resource));
		if (existingEntry) {
			if (responseModel.requestId !== existingEntry.telemetryInfo.requestId) {
				existingEntry.updateTelemetryInfo(responseModel);
			}
			return existingEntry;
		}
		const initialContent = this._initialFileContents.get(resource);
		// This gets manually disposed in .dispose() or in .restoreSnapshot()
		const entry = await this._createModifiedFileEntry(resource, responseModel, false, initialContent);
		if (!initialContent) {
			this._initialFileContents.set(resource, entry.initialContent);
		}
		// If an entry is deleted e.g. reverting a created file,
		// remove it from the entries and don't show it in the working set anymore
		// so that it can be recreated e.g. through retry
		this._register(entry.onDidDelete(() => {
			const newEntries = this._entriesObs.get().filter(e => !isEqual(e.modifiedURI, entry.modifiedURI));
			this._entriesObs.set(newEntries, undefined);
			this._workingSet.delete(entry.modifiedURI);
			entry.dispose();
			this._onDidChange.fire(ChatEditingSessionChangeType.WorkingSet);
		}));
		const entriesArr = [...this._entriesObs.get(), entry];
		this._entriesObs.set(entriesArr, undefined);
		this._onDidChange.fire(ChatEditingSessionChangeType.WorkingSet);

		return entry;
	}

	private async _createModifiedFileEntry(resource: URI, responseModel: IModifiedEntryTelemetryInfo, mustExist = false, initialContent: string | undefined): Promise<ChatEditingModifiedFileEntry> {
		try {
			const ref = await this._textModelService.createModelReference(resource);

			return this._instantiationService.createInstance(ChatEditingModifiedFileEntry, ref, { collapse: (transaction: ITransaction | undefined) => this._collapse(resource, transaction) }, responseModel, mustExist ? ChatEditKind.Created : ChatEditKind.Modified, initialContent);
		} catch (err) {
			if (mustExist) {
				throw err;
			}
			// this file does not exist yet, create it and try again
			await this._bulkEditService.apply({ edits: [{ newResource: resource }] });
			this._editorService.openEditor({ resource, options: { inactive: true, preserveFocus: true, pinned: true } });
			return this._createModifiedFileEntry(resource, responseModel, true, initialContent);
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

interface StoredSessionState {
	readonly filesToSkipCreating: URI[];
	readonly initialFileContents: ResourceMap<string>;
	readonly pendingSnapshot?: IChatEditingSessionSnapshot;
	readonly recentSnapshot: IChatEditingSessionSnapshot;
	readonly linearHistoryIndex: number;
	readonly linearHistory: IChatEditingSessionSnapshot[];
}

class ChatEditingSessionStorage {
	constructor(
		private readonly chatSessionId: string,
		@IFileService private readonly _fileService: IFileService,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
		@ILogService private readonly _logService: ILogService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
	) { }

	private _getStorageLocation(): URI {
		const workspaceId = this._workspaceContextService.getWorkspace().id;
		return joinPath(this._environmentService.workspaceStorageHome, workspaceId, 'chatEditingSessions', this.chatSessionId);
	}

	public async restoreState(): Promise<StoredSessionState | undefined> {
		const storageLocation = this._getStorageLocation();
		const getFileContent = (hash: string) => {
			return this._fileService.readFile(joinPath(storageLocation, STORAGE_CONTENTS_FOLDER, hash)).then(content => content.value.toString());
		};
		const deserializeResourceMap = <T>(resourceMap: ResourceMapDTO<T>, deserialize: (value: any) => T, result: ResourceMap<T>): ResourceMap<T> => {
			resourceMap.forEach(([resourceURI, value]) => {
				result.set(URI.parse(resourceURI), deserialize(value));
			});
			return result;
		};
		const deserializeChatEditingSessionSnapshot = async (snapshot: IChatEditingSessionSnapshotDTO) => {
			const entriesMap = new ResourceMap<ISnapshotEntry>();
			for (const entryDTO of snapshot.entries) {
				const entry = await deserializeSnapshotEntry(entryDTO);
				entriesMap.set(entry.resource, entry);
			}
			return ({
				requestId: snapshot.requestId,
				workingSet: deserializeResourceMap(snapshot.workingSet, (value) => value, new ResourceMap()),
				entries: entriesMap
			} satisfies IChatEditingSessionSnapshot);
		};
		const deserializeSnapshotEntry = async (entry: ISnapshotEntryDTO) => {
			return {
				resource: URI.parse(entry.resource),
				languageId: entry.languageId,
				original: await getFileContent(entry.originalHash),
				current: await getFileContent(entry.currentHash),
				originalToCurrentEdit: OffsetEdit.fromJson(entry.originalToCurrentEdit),
				state: entry.state,
				snapshotUri: URI.parse(entry.snapshotUri),
				telemetryInfo: { requestId: entry.telemetryInfo.requestId, agentId: entry.telemetryInfo.agentId, command: entry.telemetryInfo.command, sessionId: this.chatSessionId, result: undefined }
			} satisfies ISnapshotEntry;
		};
		try {
			const stateFilePath = joinPath(storageLocation, STORAGE_STATE_FILE);
			if (! await this._fileService.exists(stateFilePath)) {
				this._logService.debug(`chatEditingSession: No editing session state found at ${stateFilePath.toString()}`);
				return undefined;
			}
			this._logService.debug(`chatEditingSession: Restoring editing session at ${stateFilePath.toString()}`);
			const stateFileContent = await this._fileService.readFile(stateFilePath);
			const data = JSON.parse(stateFileContent.value.toString()) as IChatEditingSessionDTO;
			if (data.version !== STORAGE_VERSION) {
				return undefined;
			}

			const linearHistory = await Promise.all(data.linearHistory.map(deserializeChatEditingSessionSnapshot));
			const filesToSkipCreating = data.filesToSkipCreating.map((uriStr: string) => URI.parse(uriStr));

			const initialFileContents = new ResourceMap<string>();
			for (const fileContentDTO of data.initialFileContents) {
				initialFileContents.set(URI.parse(fileContentDTO[0]), await getFileContent(fileContentDTO[1]));
			}
			const pendingSnapshot = data.pendingSnapshot ? await deserializeChatEditingSessionSnapshot(data.pendingSnapshot) : undefined;
			const recentSnapshot = await deserializeChatEditingSessionSnapshot(data.recentSnapshot);

			return {
				filesToSkipCreating,
				initialFileContents,
				pendingSnapshot,
				recentSnapshot,
				linearHistoryIndex: data.linearHistoryIndex,
				linearHistory
			};
		} catch (e) {
			this._logService.error(`Error restoring chat editing session from ${storageLocation.toString()}`, e);
		}
		return undefined;
	}

	public async storeState(state: StoredSessionState): Promise<void> {
		const storageFolder = this._getStorageLocation();
		const contentsFolder = URI.joinPath(storageFolder, STORAGE_CONTENTS_FOLDER);

		// prepare the content folder
		const existingContents = new Set<string>();
		try {
			const stat = await this._fileService.resolve(contentsFolder);
			stat.children?.forEach(child => {
				if (child.isDirectory) {
					existingContents.add(child.name);
				}
			});
		} catch (e) {
			try {
				// does not exist, create
				await this._fileService.createFolder(contentsFolder);
			} catch (e) {
				this._logService.error(`Error creating chat editing session content folder ${contentsFolder.toString()}`, e);
				return;
			}
		}

		const fileContents = new Map<string, string>();
		const addFileContent = (content: string): string => {
			const shaComputer = new StringSHA1();
			shaComputer.update(content);
			const sha = shaComputer.digest().substring(0, 7);
			if (!existingContents.has(sha)) {
				fileContents.set(sha, content);
			}
			return sha;
		};
		const serializeResourceMap = <T>(resourceMap: ResourceMap<T>, serialize: (value: T) => any): ResourceMapDTO<T> => {
			return Array.from(resourceMap.entries()).map(([resourceURI, value]) => [resourceURI.toString(), serialize(value)]);
		};
		const serializeChatEditingSessionSnapshot = (snapshot: IChatEditingSessionSnapshot) => {
			return ({
				requestId: snapshot.requestId,
				workingSet: serializeResourceMap(snapshot.workingSet, value => value),
				entries: Array.from(snapshot.entries.values()).map(serializeSnapshotEntry)
			} satisfies IChatEditingSessionSnapshotDTO);
		};
		const serializeSnapshotEntry = (entry: ISnapshotEntry) => {
			return {
				resource: entry.resource.toString(),
				languageId: entry.languageId,
				originalHash: addFileContent(entry.original),
				currentHash: addFileContent(entry.current),
				originalToCurrentEdit: entry.originalToCurrentEdit.edits.map(edit => ({ pos: edit.replaceRange.start, len: edit.replaceRange.length, txt: edit.newText } satisfies ISingleOffsetEdit)),
				state: entry.state,
				snapshotUri: entry.snapshotUri.toString(),
				telemetryInfo: { requestId: entry.telemetryInfo.requestId, agentId: entry.telemetryInfo.agentId, command: entry.telemetryInfo.command }
			} satisfies ISnapshotEntryDTO;
		};

		try {
			const data = {
				version: STORAGE_VERSION,
				sessionId: this.chatSessionId,
				linearHistory: state.linearHistory.map(serializeChatEditingSessionSnapshot),
				linearHistoryIndex: state.linearHistoryIndex,
				initialFileContents: serializeResourceMap(state.initialFileContents, value => addFileContent(value)),
				pendingSnapshot: state.pendingSnapshot ? serializeChatEditingSessionSnapshot(state.pendingSnapshot) : undefined,
				recentSnapshot: serializeChatEditingSessionSnapshot(state.recentSnapshot),
				filesToSkipCreating: state.filesToSkipCreating.map(uri => uri.toString()),
			} satisfies IChatEditingSessionDTO;

			this._logService.debug(`chatEditingSession: Storing editing session at ${storageFolder.toString()}: ${fileContents.size} files`);

			for (const [hash, content] of fileContents) {
				await this._fileService.writeFile(joinPath(contentsFolder, hash), VSBuffer.fromString(content));
			}

			await this._fileService.writeFile(joinPath(storageFolder, STORAGE_STATE_FILE), VSBuffer.fromString(JSON.stringify(data, undefined, 2)));
		} catch (e) {
			this._logService.debug(`Error storing chat editing session to ${storageFolder.toString()}`, e);
		}
	}

	public async clearState(): Promise<void> {
		const storageFolder = this._getStorageLocation();
		if (await this._fileService.exists(storageFolder)) {
			this._logService.debug(`chatEditingSession: Clearing editing session at ${storageFolder.toString()}`);
			try {
				await this._fileService.del(storageFolder, { recursive: true });
			} catch (e) {
				this._logService.debug(`Error clearing chat editing session from ${storageFolder.toString()}`, e);
			}
		}
	}

}

export interface IChatEditingSessionSnapshot {
	readonly requestId: string | undefined;
	readonly workingSet: ResourceMap<WorkingSetDisplayMetadata>;
	readonly entries: ResourceMap<ISnapshotEntry>;
}

interface IChatEditingSessionSnapshotDTO {
	readonly requestId: string | undefined;
	readonly workingSet: ResourceMapDTO<WorkingSetDisplayMetadata>;
	readonly entries: ISnapshotEntryDTO[];
}

interface ISnapshotEntryDTO {
	readonly resource: string;
	readonly languageId: string;
	readonly originalHash: string;
	readonly currentHash: string;
	readonly originalToCurrentEdit: IOffsetEdit;
	readonly state: WorkingSetEntryState;
	readonly snapshotUri: string;
	readonly telemetryInfo: IModifiedEntryTelemetryInfoDTO;
}

interface IModifiedEntryTelemetryInfoDTO {
	readonly requestId: string;
	readonly agentId?: string;
	readonly command?: string;
}

type ResourceMapDTO<T> = [string, T][];

const STORAGE_VERSION = 1;

interface IChatEditingSessionDTO {
	readonly version: number;
	readonly sessionId: string;
	readonly recentSnapshot: IChatEditingSessionSnapshotDTO;
	readonly linearHistory: IChatEditingSessionSnapshotDTO[];
	readonly linearHistoryIndex: number;
	readonly pendingSnapshot: IChatEditingSessionSnapshotDTO | undefined;
	readonly initialFileContents: ResourceMapDTO<string>;
	readonly filesToSkipCreating: string[];
}
