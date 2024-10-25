/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Sequencer } from '../../../../../base/common/async.js';
import { BugIndicatingError } from '../../../../../base/common/errors.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap, ResourceSet } from '../../../../../base/common/map.js';
import { derived, IObservable, ITransaction, observableValue, transaction } from '../../../../../base/common/observable.js';
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
import { ChatEditingSessionState, ChatEditKind, IChatEditingSession, WorkingSetEntryState } from '../../common/chatEditingService.js';
import { IChatResponseModel } from '../../common/chatModel.js';
import { IChatWidgetService } from '../chat.js';
import { ChatEditingMultiDiffSourceResolver } from './chatEditingService.js';
import { ChatEditingModifiedFileEntry, IModifiedEntryTelemetryInfo, ISnapshotEntry } from './chatEditingModifiedFileEntry.js';
import { ChatEditingTextModelContentProvider } from './chatEditingTextModelContentProviders.js';
import { Schemas } from '../../../../../base/common/network.js';

export class ChatEditingSession extends Disposable implements IChatEditingSession {
	private readonly _state = observableValue<ChatEditingSessionState>(this, ChatEditingSessionState.Initial);
	private readonly _linearHistory = observableValue<IChatEditingSessionSnapshot[]>(this, []);
	private readonly _linearHistoryIndex = observableValue<number>(this, 0);

	/**
	 * Contains the contents of a file when the AI first began doing edits to it.
	 */
	private readonly _initialFileContents = new ResourceMap<string>();
	private readonly _snapshots = new Map<string, IChatEditingSessionSnapshot>();

	private readonly _filesToSkipCreating = new ResourceSet();

	private readonly _entriesObs = observableValue<readonly ChatEditingModifiedFileEntry[]>(this, []);
	public get entries(): IObservable<readonly ChatEditingModifiedFileEntry[]> {
		this._assertNotDisposed();
		return this._entriesObs;
	}
	private readonly _sequencer = new Sequencer();

	private _workingSet = new ResourceMap<WorkingSetEntryState>();
	get workingSet() {
		this._assertNotDisposed();

		// Return here a reunion between the AI modified entries and the user built working set
		const result = new ResourceMap<WorkingSetEntryState>(this._workingSet);
		for (const entry of this._entriesObs.get()) {
			result.set(entry.modifiedURI, entry.state.get());
		}

		return result;
	}

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

	private readonly _onDidChange = new Emitter<void>();
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
		return Boolean(this.editorPane && this.editorPane.isVisible());
	}

	constructor(
		public readonly chatSessionId: string,
		private editorPane: MultiDiffEditor | undefined,
		private editingSessionFileLimitPromise: Promise<number>,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IModelService private readonly _modelService: IModelService,
		@ILanguageService private readonly _languageService: ILanguageService,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@IBulkEditService public readonly _bulkEditService: IBulkEditService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@IEditorService private readonly _editorService: IEditorService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IFileService private readonly _fileService: IFileService,
		@IFileDialogService private readonly _dialogService: IFileDialogService,
		@IChatAgentService private readonly _chatAgentService: IChatAgentService
	) {
		super();

		const widget = _chatWidgetService.getWidgetBySessionId(chatSessionId);
		if (!widget) {
			return; // Shouldn't happen
		}

		// Add the currently active editors to the working set
		this._trackCurrentEditorsInWorkingSet();
		this._register(this._editorService.onDidActiveEditorChange(() => {
			this._trackCurrentEditorsInWorkingSet();
		}));
		this._register(this._editorService.onDidCloseEditor((e) => {
			this._trackCurrentEditorsInWorkingSet(e);
		}));
	}

	private _trackCurrentEditorsInWorkingSet(e?: IEditorCloseEvent) {
		const widget = this._chatWidgetService.getWidgetBySessionId(this.chatSessionId);
		const requests = widget?.viewModel?.getItems();
		if (requests && requests.length > 0) {
			return;
		}

		const closedEditor = e?.editor.resource?.toString();

		const existingTransientEntries = new ResourceSet();
		for (const file of this._workingSet.keys()) {
			if (this._workingSet.get(file) === WorkingSetEntryState.Transient) {
				existingTransientEntries.add(file);
			}
		}
		if (existingTransientEntries.size === 0 && this._workingSet.size > 0) {
			// The user manually added or removed attachments, don't inherit the visible editors
			return;
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
				if (closedEditor === uri.toString()) {
					// The editor group service sees recently closed editors?
					// Continue, since we want this to be deleted from the working set
				} else if (existingTransientEntries.has(uri)) {
					existingTransientEntries.delete(uri);
				} else {
					activeEditors.add(uri);
				}
			}
		});

		let didChange = false;
		for (const entry of existingTransientEntries) {
			didChange = this._workingSet.delete(entry) || didChange;
		}

		for (const entry of activeEditors) {
			this._workingSet.set(entry, WorkingSetEntryState.Transient);
			didChange = true;
		}

		if (didChange) {
			this._onDidChange.fire();
		}
	}

	public createSnapshot(requestId: string | undefined): void {
		const snapshot = this._createSnapshot(requestId);
		if (requestId) {
			this._snapshots.set(requestId, snapshot);
			for (const workingSetItem of this._workingSet.keys()) {
				this._workingSet.set(workingSetItem, WorkingSetEntryState.Sent);
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
		const workingSet = new ResourceMap<WorkingSetEntryState>();
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
		const entries = this._snapshots.get(requestId)?.entries;
		if (!entries) {
			return null;
		}

		const snapshotEntry = [...entries.values()].find((e) => e.snapshotUri.toString() === snapshotUri.toString());
		if (!snapshotEntry) {
			return null;
		}

		return this._modelService.createModel(snapshotEntry.current, this._languageService.createById(snapshotEntry.languageId), snapshotUri, false);
	}

	public getSnapshot(requestId: string, uri: URI) {
		const snapshot = this._snapshots.get(requestId);
		const snapshotEntries = snapshot?.entries;
		return snapshotEntries?.get(uri);
	}

	public async restoreSnapshot(requestId: string | undefined): Promise<void> {
		if (requestId !== undefined) {
			const snapshot = this._snapshots.get(requestId);
			if (snapshot) {
				await this._restoreSnapshot(snapshot);
			}
		} else {
			await this._restoreSnapshot(undefined);
		}
	}

	/**
	 * A snapshot representing the state of the working set before a new request has been sent
	 */
	private _pendingSnapshot: IChatEditingSessionSnapshot | undefined;
	private async _restoreSnapshot(snapshot: IChatEditingSessionSnapshot | undefined): Promise<void> {
		if (!snapshot) {
			if (!this._pendingSnapshot) {
				return; // We don't have a pending snapshot that we can restore
			}
			// Restore pending snapshot
			snapshot = this._pendingSnapshot;
			this._pendingSnapshot = undefined;
		} else if (!this._pendingSnapshot) {
			// Create and save a pending snapshot
			this.createSnapshot(undefined);
		}

		this._workingSet = new ResourceMap();
		snapshot.workingSet.forEach((state, uri) => this._workingSet.set(uri, state));

		// Reset all the files which are modified in this session state
		// but which are not found in the snapshot
		for (const entry of this._entriesObs.get()) {
			const snapshotEntry = snapshot.entries.get(entry.modifiedURI);
			if (!snapshotEntry) {
				const initialContents = this._initialFileContents.get(entry.modifiedURI);
				if (typeof initialContents === 'string') {
					entry.resetToInitialValue(initialContents);
				}
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

	remove(...uris: URI[]): void {
		this._assertNotDisposed();

		let didRemoveUris = false;
		for (const uri of uris) {
			didRemoveUris = this._workingSet.delete(uri) || didRemoveUris;
		}

		if (!didRemoveUris) {
			return; // noop
		}

		this._onDidChange.fire();
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
			const entry = this._entriesObs.get().find(e => e.modifiedURI.toString() === uri.toString());
			if (entry) {
				await entry.accept(undefined);
			}
		}

		this._onDidChange.fire();
	}

	async reject(...uris: URI[]): Promise<void> {
		this._assertNotDisposed();

		if (uris.length === 0) {
			await Promise.all(this._entriesObs.get().map(entry => entry.reject(undefined)));
		}

		for (const uri of uris) {
			const entry = this._entriesObs.get().find(e => e.modifiedURI.toString() === uri.toString());
			if (entry) {
				await entry.reject(undefined);
			}
		}

		this._onDidChange.fire();
	}

	async show(): Promise<void> {
		this._assertNotDisposed();

		if (this.editorPane?.isVisible()) {
			return;
		} else if (this.editorPane?.input) {
			await this._editorGroupsService.activeGroup.openEditor(this.editorPane.input, { pinned: true, activation: EditorActivation.ACTIVATE });
			return;
		}

		const input = MultiDiffEditorInput.fromResourceMultiDiffEditorInput({
			multiDiffSource: ChatEditingMultiDiffSourceResolver.getMultiDiffSourceUri(),
			label: localize('multiDiffEditorInput.name', "Suggested Edits")
		}, this._instantiationService);

		const editorPane = await this._editorGroupsService.activeGroup.openEditor(input, { pinned: true, activation: EditorActivation.ACTIVATE }) as MultiDiffEditor | undefined;
		this.editorPane = editorPane;
	}

	async stop(): Promise<void> {
		this._assertNotDisposed();

		// Close out all open files
		await Promise.allSettled(this._editorGroupsService.groups.map(async (g) => {
			return Promise.allSettled(g.editors.map(async (e) => {
				if (e instanceof MultiDiffEditorInput || e instanceof DiffEditorInput && (e.original.resource?.scheme === ChatEditingModifiedFileEntry.scheme || e.original.resource?.scheme === ChatEditingTextModelContentProvider.scheme)) {
					await g.closeEditor(e);
				}
			}));
		}));

		if (this._state.get() !== ChatEditingSessionState.Disposed) {
			// session got disposed while we were closing editors
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
		return entry?.docSnapshot ?? null;
	}

	acceptStreamingEditsStart(): void {
		if (this._state.get() === ChatEditingSessionState.Disposed) {
			// we don't throw in this case because there could be a builder still connected to a disposed session
			return;
		}

		// ensure that the edits are processed sequentially
		this._sequencer.queue(() => this._acceptStreamingEditsStart());
	}

	acceptTextEdits(resource: URI, textEdits: TextEdit[], responseModel: IChatResponseModel): void {
		if (this._state.get() === ChatEditingSessionState.Disposed) {
			// we don't throw in this case because there could be a builder still connected to a disposed session
			return;
		}

		// ensure that the edits are processed sequentially
		this._sequencer.queue(() => this._acceptTextEdits(resource, textEdits, responseModel));
	}

	resolve(): void {
		if (this._state.get() === ChatEditingSessionState.Disposed) {
			// we don't throw in this case because there could be a builder still connected to a disposed session
			return;
		}

		// ensure that the edits are processed sequentially
		this._sequencer.queue(() => this._resolve());
	}

	addFileToWorkingSet(resource: URI) {
		if (!this._workingSet.has(resource)) {
			this._workingSet.set(resource, WorkingSetEntryState.Attached);

			// Convert all transient entries to attachments
			for (const file of this._workingSet.keys()) {
				if (this._workingSet.get(file) === WorkingSetEntryState.Transient) {
					this._workingSet.set(file, WorkingSetEntryState.Attached);
				}
			}

			this._onDidChange.fire();
		}
	}

	async undoInteraction(): Promise<void> {
		const linearHistory = this._linearHistory.get();
		const linearHistoryIndex = this._linearHistoryIndex.get();
		if (linearHistoryIndex <= 0) {
			return;
		}
		const previousSnapshot = linearHistory[linearHistoryIndex - 1];
		await this.restoreSnapshot(previousSnapshot.requestId);
		this._linearHistoryIndex.set(linearHistoryIndex - 1, undefined);
	}

	async redoInteraction(): Promise<void> {
		const linearHistory = this._linearHistory.get();
		const linearHistoryIndex = this._linearHistoryIndex.get();
		if (linearHistoryIndex >= linearHistory.length) {
			return;
		}
		const nextSnapshot = (linearHistoryIndex + 1 < linearHistory.length ? linearHistory[linearHistoryIndex + 1] : this._pendingSnapshot);
		if (!nextSnapshot) {
			return;
		}
		await this.restoreSnapshot(nextSnapshot.requestId);
		this._linearHistoryIndex.set(linearHistoryIndex + 1, undefined);
	}

	private async _acceptStreamingEditsStart(): Promise<void> {
		transaction((tx) => {
			this._state.set(ChatEditingSessionState.StreamingEdits, tx);
			for (const entry of this._entriesObs.get()) {
				entry.acceptStreamingEditsStart(tx);
			}
		});
	}

	private async _acceptTextEdits(resource: URI, textEdits: TextEdit[], responseModel: IChatResponseModel): Promise<void> {
		if (this._filesToSkipCreating.has(resource)) {
			return;
		}

		if (!this._entriesObs.get().find(e => e.resource.toString() === resource.toString()) && this._entriesObs.get().length >= (await this.editingSessionFileLimitPromise)) {
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
		entry.acceptAgentEdits(textEdits);
		// await this._editorService.openEditor({ resource: entry.modifiedURI, options: { inactive: true } });
	}

	private async _resolve(): Promise<void> {
		transaction((tx) => {
			for (const entry of this._entriesObs.get()) {
				entry.acceptStreamingEditsEnd(tx);
			}
			this._state.set(ChatEditingSessionState.Idle, tx);
		});
		this._onDidChange.fire();
	}

	private async _getOrCreateModifiedFileEntry(resource: URI, responseModel: IModifiedEntryTelemetryInfo): Promise<ChatEditingModifiedFileEntry> {
		const existingEntry = this._entriesObs.get().find(e => e.resource.toString() === resource.toString());
		if (existingEntry) {
			if (responseModel.requestId !== existingEntry.telemetryInfo.requestId) {
				existingEntry.updateTelemetryInfo(responseModel);
			}
			return existingEntry;
		}

		// This gets manually disposed in .dispose() or in .restoreSnapshot()
		const entry = await this._createModifiedFileEntry(resource, responseModel);
		if (!this._initialFileContents.has(resource)) {
			this._initialFileContents.set(resource, entry.modifiedModel.getValue());
		}
		// If an entry is deleted e.g. reverting a created file,
		// remove it from the entries and don't show it in the working set anymore
		// so that it can be recreated e.g. through retry
		this._register(entry.onDidDelete(() => {
			const newEntries = this._entriesObs.get().filter(e => e.modifiedURI.toString() !== entry.modifiedURI.toString());
			this._entriesObs.set(newEntries, undefined);
			this._workingSet.delete(entry.modifiedURI);
			this._onDidChange.fire();
		}));
		const entriesArr = [...this._entriesObs.get(), entry];
		this._entriesObs.set(entriesArr, undefined);
		this._onDidChange.fire();

		return entry;
	}

	private async _createModifiedFileEntry(resource: URI, responseModel: IModifiedEntryTelemetryInfo, mustExist = false): Promise<ChatEditingModifiedFileEntry> {
		try {
			const ref = await this._textModelService.createModelReference(resource);

			return this._instantiationService.createInstance(ChatEditingModifiedFileEntry, resource, ref, { collapse: (transaction: ITransaction | undefined) => this._collapse(resource, transaction) }, responseModel, mustExist ? ChatEditKind.Created : ChatEditKind.Modified);
		} catch (err) {
			if (mustExist) {
				throw err;
			}
			// this file does not exist yet, create it and try again
			await this._bulkEditService.apply({ edits: [{ newResource: resource }] });
			this._editorService.openEditor({ resource, options: { inactive: true, preserveFocus: true, pinned: true } });
			return this._createModifiedFileEntry(resource, responseModel, true);
		}
	}

	private _collapse(resource: URI, transaction: ITransaction | undefined) {
		const multiDiffItem = this.editorPane?.findDocumentDiffItem(resource);
		if (multiDiffItem) {
			this.editorPane?.viewModel?.items.get().find((documentDiffItem) => String(documentDiffItem.originalUri) === String(multiDiffItem.originalUri) && String(documentDiffItem.modifiedUri) === String(multiDiffItem.modifiedUri))?.collapsed.set(true, transaction);
		}
	}
}

export interface IChatEditingSessionSnapshot {
	requestId: string | undefined;
	workingSet: ResourceMap<WorkingSetEntryState>;
	entries: ResourceMap<ISnapshotEntry>;
}
