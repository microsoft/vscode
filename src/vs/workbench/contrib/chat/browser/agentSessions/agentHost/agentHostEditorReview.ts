/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Sequencer } from '../../../../../../base/common/async.js';
import { toErrorMessage } from '../../../../../../base/common/errorMessage.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableResourceMap, DisposableStore, IReference } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap, ResourceSet } from '../../../../../../base/common/map.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { autorun, constObservable, derived, IObservable, IReader, observableValue } from '../../../../../../base/common/observable.js';
import { basename, isEqual } from '../../../../../../base/common/resources.js';
import { assertType } from '../../../../../../base/common/types.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { getCodeEditor } from '../../../../../../editor/browser/editorBrowser.js';
import { DetailedLineRangeMapping } from '../../../../../../editor/common/diff/rangeMapping.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { ILanguageService } from '../../../../../../editor/common/languages/language.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../../../editor/common/services/resolverService.js';
import { IModelContentChangedEvent } from '../../../../../../editor/common/textModelEvents.js';
import { localize } from '../../../../../../nls.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IEditorOptions } from '../../../../../../platform/editor/common/editor.js';
import { FileSystemProviderCapabilities, IFileService } from '../../../../../../platform/files/common/files.js';
import { createDecorator, IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { observableConfigValue } from '../../../../../../platform/observable/common/platformObservableUtils.js';
import { IEditorPane, SaveReason } from '../../../../../common/editor.js';
import { IEditorService, PreferredGroup } from '../../../../../services/editor/common/editorService.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { ITextFileService } from '../../../../../services/textfile/common/textfiles.js';
import { INotebookService } from '../../../../notebook/common/notebookService.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { IChatEditingService, IChatEditReviewSession, IEditSessionEntryDiff, IModifiedFileEntry, IModifiedFileEntryEditorIntegration, ModifiedFileEntryState } from '../../../common/editing/chatEditingService.js';
import { IChatModel } from '../../../common/model/chatModel.js';
import { ChatEditingCodeEditorIntegration, IDocumentDiff2 } from '../../chatEditing/chatEditingCodeEditorIntegration.js';
import { ChatEditingTextModelChangeService } from '../../chatEditing/chatEditingTextModelChangeService.js';
import { ChatEditingTextModelContentProvider } from '../../chatEditing/chatEditingTextModelContentProviders.js';

export const IAgentHostEditorReviewService = createDecorator<IAgentHostEditorReviewService>('agentHostEditorReviewService');

export interface IAgentHostEditorReviewService {
	readonly _serviceBrand: undefined;
	trackSession(model: IChatModel, changes: readonly IEditSessionEntryDiff[]): void;
	openFile(sessionResource: URI, resource: URI, options: IEditorOptions, group: PreferredGroup): Promise<boolean>;
}

export class AgentHostEditorReviewService extends Disposable implements IAgentHostEditorReviewService {
	declare readonly _serviceBrand: undefined;
	private readonly _sessions = this._register(new DisposableResourceMap<AgentHostEditorReviewSession>());
	private readonly _enabled: IObservable<boolean>;

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IChatService chatService: IChatService,
		@IEditorService private readonly _editorService: IEditorService,
		@INotificationService private readonly _notificationService: INotificationService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		const configured = observableConfigValue(ChatConfiguration.EditorAgentHostReviewEnabled, false, configurationService);
		this._enabled = derived(this, reader => !environmentService.isSessionsWindow && configured.read(reader));
		this._register(autorun(reader => {
			if (!this._enabled.read(reader)) {
				this._sessions.clearAndDisposeAll();
			}
		}));
		this._register(chatService.onDidDisposeSession(event => {
			for (const resource of event.sessionResources) {
				this._sessions.deleteAndDispose(resource);
			}
		}));
	}

	trackSession(model: IChatModel, changes: readonly IEditSessionEntryDiff[]): void {
		if (!this._enabled.get()) {
			return;
		}
		let session = this._sessions.get(model.sessionResource);
		if (!session) {
			session = this._instantiationService.createInstance(AgentHostEditorReviewSession, model);
			this._sessions.set(model.sessionResource, session);
		}
		session.setChanges(changes);
	}

	async openFile(sessionResource: URI, resource: URI, options: IEditorOptions, group: PreferredGroup): Promise<boolean> {
		const session = this._sessions.get(sessionResource);
		if (!session || !this._enabled.get()) {
			return false;
		}
		try {
			const entry = await session.prepareFile(resource);
			if (!entry || entry.state.get() !== ModifiedFileEntryState.Modified || !this._enabled.get()) {
				return false;
			}
			await entry.getDiffInfo();
			const pane = await this._editorService.openEditor({ resource: entry.modifiedURI, options }, group);
			if (pane && entry.state.get() === ModifiedFileEntryState.Modified) {
				entry.getEditorIntegration(pane).reveal(true, options.preserveFocus);
			}
		} catch (error) {
			this._logService.error('[AgentHostEditorReview] Could not open live editor', error);
			this._notificationService.error(localize('agentHostReview.openFailed', "Could not open {0} for editor review: {1}", basename(resource), toErrorMessage(error)));
		}
		return true;
	}
}

/** Adapts session snapshots to the existing live-editor review machinery without replaying edits. */
export class AgentHostEditorReviewSession extends Disposable implements IChatEditReviewSession {
	readonly isGlobalEditingSession = true;
	readonly chatSessionResource: URI;
	private readonly _onDidDispose = this._register(new Emitter<void>());
	readonly onDidDispose = this._onDidDispose.event;
	private readonly _entries = this._register(new DisposableResourceMap<AgentHostEditorReviewEntry>());
	private readonly _entriesObs = observableValue<readonly IModifiedFileEntry[]>(this, []);
	readonly entries = this._entriesObs;
	private readonly _changes = new ResourceMap<IEditSessionEntryDiff>();
	private readonly _initializing = new ResourceSet();
	private readonly _sequencer = new Sequencer();
	private _generation = 0;
	private _currentChanges: readonly IEditSessionEntryDiff[] = [];

	constructor(
		private readonly _model: IChatModel,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IChatEditingService private readonly _editingService: IChatEditingService,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@ITextFileService private readonly _textFileService: ITextFileService,
		@INotebookService private readonly _notebookService: INotebookService,
		@ILogService private readonly _logService: ILogService,
		@INotificationService private readonly _notificationService: INotificationService,
	) {
		super();
		this.chatSessionResource = _model.sessionResource;
		this._register(_editingService.registerEditReviewSession(this));
	}

	setChanges(changes: readonly IEditSessionEntryDiff[]): void {
		this._currentChanges = changes;
		const generation = ++this._generation;
		void this._sequencer.queue(async () => {
			if (this._store.isDisposed || generation !== this._generation) {
				return;
			}
			const remaining = new ResourceSet([...this._changes.keys()]);
			for (const diff of changes) {
				remaining.delete(diff.modifiedURI);
				const previous = this._changes.get(diff.modifiedURI);
				if (previous && isEqual(previous.originalURI, diff.originalURI) && isEqual(previous.modifiedSnapshotURI, diff.modifiedSnapshotURI) && previous.isCreated === diff.isCreated && previous.isDeleted === diff.isDeleted && previous.isRenamed === diff.isRenamed) {
					continue;
				}
				if (diff.modifiedURI.scheme !== Schemas.file || diff.isDeleted || diff.isRenamed || this._notebookService.hasSupportedNotebooks(diff.modifiedURI)) {
					this._entries.deleteAndDispose(diff.modifiedURI);
					this._changes.set(diff.modifiedURI, diff);
					continue;
				}
				try {
					if (!diff.modifiedSnapshotURI || (!diff.isCreated && isEqual(diff.originalURI, diff.modifiedURI))) {
						throw new Error(localize('agentHostReview.missingSnapshot', "The session does not provide the snapshots needed for safe editor review."));
					}
					const after = (await this._textFileService.read(diff.modifiedSnapshotURI, { acceptTextOnly: true })).value;
					if (this._store.isDisposed || generation !== this._generation) {
						return;
					}
					const existing = this._entries.get(diff.modifiedURI);
					if (existing) {
						existing.updateSnapshot(after);
						this._changes.set(diff.modifiedURI, diff);
						continue;
					}
					if (this._hasCompetingReview(diff.modifiedURI)) {
						throw new Error(localize('agentHostReview.otherSession', "This file is already being reviewed in another chat session."));
					}
					const before = diff.isCreated ? '' : (await this._textFileService.read(diff.originalURI, { acceptTextOnly: true })).value;
					const store = new DisposableStore();
					try {
						const reference = store.add(await this._textModelService.createModelReference(diff.modifiedURI));
						if (this._store.isDisposed || generation !== this._generation) {
							return;
						}
						if (reference.object.isReadonly()) {
							throw new Error(localize('agentHostReview.readonly', "The live file is read-only."));
						}
						if (reference.object.textEditorModel.getValue() !== after) {
							throw new Error(localize('agentHostReview.changedFile', "The live file differs from the session snapshot. Save or resolve your changes before reviewing agent edits."));
						}
						if (this._hasCompetingReview(diff.modifiedURI)) {
							throw new Error(localize('agentHostReview.otherSession', "This file is already being reviewed in another chat session."));
						}
						this._initializing.add(diff.modifiedURI);
						store.deleteAndLeak(reference);
						let entry: AgentHostEditorReviewEntry;
						try {
							entry = store.add(this._instantiationService.createInstance(AgentHostEditorReviewEntry, this._model, reference, before, after, !!diff.isCreated));
						} catch (error) {
							reference.dispose();
							throw error;
						}
						await entry.initialize();
						if (this._store.isDisposed || generation !== this._generation) {
							return;
						}
						if (this._hasCompetingReview(diff.modifiedURI)) {
							throw new Error(localize('agentHostReview.otherSession', "This file is already being reviewed in another chat session."));
						}
						store.deleteAndLeak(entry);
						this._entries.set(diff.modifiedURI, entry);
						this._changes.set(diff.modifiedURI, diff);
					} finally {
						this._initializing.delete(diff.modifiedURI);
						store.dispose();
					}
				} catch (error) {
					if (this._store.isDisposed || generation !== this._generation) {
						return;
					}
					this._changes.set(diff.modifiedURI, diff);
					this._logService.warn('[AgentHostEditorReview] Unable to review file', diff.modifiedURI, error);
					this._notificationService.warn(localize('agentHostReview.unavailable', "Editor review is unavailable for {0}: {1} The session diff is still available.", basename(diff.modifiedURI), toErrorMessage(error)));
				}
			}
			for (const resource of remaining) {
				this._entries.deleteAndDispose(resource);
				this._changes.delete(resource);
			}
			this._entriesObs.set([...this._entries.values()], undefined);
		}).catch(error => {
			this._logService.error('[AgentHostEditorReview] Failed to update review', error);
			this._notificationService.error(error);
		});
	}

	whenReady(): Promise<void> {
		return this._sequencer.queue(async () => { });
	}

	private _hasCompetingReview(resource: URI): boolean {
		return this._editingService.editingSessionsObs.get().some(session => session !== this && (
			session.getEntry(resource) || session instanceof AgentHostEditorReviewSession && session._initializing.has(resource)
		));
	}

	async prepareFile(resource: URI): Promise<AgentHostEditorReviewEntry | undefined> {
		await this.whenReady();
		if (!this._store.isDisposed && !this._entries.has(resource)) {
			this._changes.delete(resource);
			this.setChanges(this._currentChanges);
			await this.whenReady();
		}
		return this.getEntry(resource);
	}

	getEntry(uri: URI): AgentHostEditorReviewEntry | undefined {
		return this._entries.get(uri);
	}

	readEntry(uri: URI, reader: IReader): IModifiedFileEntry | undefined {
		this._entriesObs.read(reader);
		return this.getEntry(uri);
	}

	async accept(...uris: URI[]): Promise<void> {
		for (const entry of this._selectedEntries(uris)) {
			await entry.accept();
		}
	}

	async reject(...uris: URI[]): Promise<void> {
		for (const entry of this._selectedEntries(uris)) {
			await entry.reject();
		}
	}

	private _selectedEntries(uris: readonly URI[]): readonly AgentHostEditorReviewEntry[] {
		return [...this._entries.values()].filter(entry => uris.length === 0 || uris.some(uri => isEqual(uri, entry.modifiedURI)));
	}

	override dispose(): void {
		this._generation++;
		this._onDidDispose.fire();
		super.dispose();
	}
}

function isDiskReload(event: IModelContentChangedEvent): boolean {
	return event.detailedReasons.length > 0 && event.detailedReasons.every(reason => reason.metadata.source === 'reloadFromDisk');
}

function isReviewUndo(event: IModelContentChangedEvent): boolean {
	return event.detailedReasons.length > 0 && event.detailedReasons.every(reason => reason.metadata.source === 'Chat.undoEdits');
}

class AgentHostEditorReviewEntry extends Disposable implements IModifiedFileEntry {
	readonly entryId = generateUuid();
	readonly originalURI: URI;
	readonly modifiedURI: URI;
	readonly originalModel: ITextModel;
	readonly modifiedModel: ITextModel;
	private readonly _state = observableValue(this, ModifiedFileEntryState.Modified);
	readonly state = this._state;
	readonly reviewMode = constObservable(true);
	readonly autoAcceptController = constObservable(undefined);
	readonly waitsForLastEdits = constObservable(false);
	readonly rewriteRatio = constObservable(1);
	readonly lastModifyingResponse;
	readonly isCurrentlyBeingModifiedBy;
	readonly diffInfo: IObservable<IDocumentDiff2>;
	readonly changesCount;
	readonly linesAdded;
	readonly linesRemoved;
	private readonly _changes: ChatEditingTextModelChangeService;
	private readonly _actions = new Sequencer();
	private readonly _integrations = this._register(new DisposableMap<IEditorPane, IModifiedFileEntryEditorIntegration>());
	private _verified = true;
	private _hasConflictingUserEdits = false;
	private _hasUserEdits = false;
	private _userEditVersion = 0;
	private _canDelete: boolean;

	get lastModifyingRequestId(): string { return this._model.lastRequest?.id ?? ''; }

	constructor(
		private readonly _model: IChatModel,
		private readonly _reference: IReference<IResolvedTextEditorModel>,
		before: string,
		private _after: string,
		created: boolean,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IModelService modelService: IModelService,
		@ITextFileService private readonly _textFileService: ITextFileService,
		@IFileService private readonly _fileService: IFileService,
		@IChatEditingService private readonly _editingService: IChatEditingService,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@ILanguageService languageService: ILanguageService,
	) {
		super();
		this._canDelete = created;
		this.modifiedModel = this._register(_reference).object.textEditorModel;
		this.modifiedURI = this.modifiedModel.uri;
		this.originalURI = ChatEditingTextModelContentProvider.getFileURI(_model.sessionResource, this.entryId, this.modifiedURI.path);
		this.originalModel = this._register(modelService.createModel(before, languageService.createById(this.modifiedModel.getLanguageId()), this.originalURI, false));
		this.lastModifyingResponse = _model.lastRequestObs.map(request => request?.response);
		this.isCurrentlyBeingModifiedBy = derived(this, reader => {
			const response = this.lastModifyingResponse.read(reader);
			return _model.hasActiveRequest.read(reader) && response ? { responseModel: response, undoStopId: undefined } : undefined;
		});
		this._register(this.modifiedModel.onDidChangeContent(event => {
			if (this._changes?.isEditFromUs || isReviewUndo(event)) {
				return;
			}
			if (isDiskReload(event)) {
				this._verified = this.modifiedModel.getValue() === this._after;
				this._state.set(ModifiedFileEntryState.Modified, undefined);
			} else {
				this._hasUserEdits = true;
				this._userEditVersion++;
				this._hasConflictingUserEdits ||= event.changes.some(change => this._changes.hasHunkAt(change.range));
			}
		}));
		this._changes = this._register(_instantiationService.createInstance(ChatEditingTextModelChangeService, this.originalModel, this.modifiedModel, this.state, event => isDiskReload(event) || isReviewUndo(event)));
		this.diffInfo = this._changes.diffInfo.map(diff => ({
			...diff,
			keep: change => this._reviewHunk(diff, change, false),
			undo: change => this._reviewHunk(diff, change, true),
		}));
		this.changesCount = this.diffInfo.map(diff => diff.changes.length);
		this.linesAdded = this.diffInfo.map(diff => diff.changes.reduce((sum, change) => sum + change.modified.length, 0));
		this.linesRemoved = this.diffInfo.map(diff => diff.changes.reduce((sum, change) => sum + change.original.length, 0));
		this._register(this._changes.onDidAcceptOrRejectAllHunks(state => this._state.set(state, undefined)));
	}

	async initialize(): Promise<void> {
		try {
			const reference = await this._textModelService.createModelReference(this.originalURI);
			if (this._store.isDisposed) {
				reference.dispose();
			} else {
				this._register(reference);
			}
		} finally {
			await this._changes.getDiffInfo();
		}
	}

	updateSnapshot(after: string): void {
		this._after = after;
		this._verified = this.modifiedModel.getValue() === after;
	}

	enableReviewModeUntilSettled(): void { }

	getDiffInfo() {
		return this._changes.getDiffInfo();
	}

	getEditorIntegration(editor: IEditorPane): IModifiedFileEntryEditorIntegration {
		let integration = this._integrations.get(editor);
		if (!integration) {
			const codeEditor = getCodeEditor(editor.getControl());
			assertType(codeEditor);
			integration = this._instantiationService.createInstance(ChatEditingCodeEditorIntegration, this, codeEditor, this.diffInfo, true);
			this._integrations.set(editor, integration);
		}
		return integration;
	}

	private _checkReviewAllowed(undo: boolean): void {
		if (this._store.isDisposed || this._reference.object.isReadonly()) {
			throw new Error(localize('agentHostReview.noLongerWritable', "This file is no longer available for editor review."));
		}
		if (this._model.hasActiveRequest.get()) {
			throw new Error(localize('agentHostReview.busy', "Wait for the agent to finish before keeping or undoing its changes."));
		}
		if (this._editingService.editingSessionsObs.get().some(session => {
			const entry = session.getEntry(this.modifiedURI);
			return entry && entry !== this;
		})) {
			throw new Error(localize('agentHostReview.concurrentSession', "Another chat session is reviewing this file. Finish that review before changing this session's edits."));
		}
		if (!this._verified) {
			throw new Error(localize('agentHostReview.notVerified', "The live file has changes that are not yet reflected in this session. Refresh the session changes before reviewing."));
		}
		if (undo && this._hasConflictingUserEdits) {
			throw new Error(localize('agentHostReview.userConflict', "Your edits overlap the agent changes. Undo is blocked to avoid removing your work; edit the file manually or keep the changes."));
		}
	}

	private async _prepare(undo: boolean): Promise<{ dirty: boolean; userEditVersion: number }> {
		this._checkReviewAllowed(undo);
		const version = this.modifiedModel.getVersionId();
		const originalVersion = this.originalModel.getVersionId();
		const dirty = this._textFileService.isDirty(this.modifiedURI);
		if (undo) {
			const disk = (await this._textFileService.read(this.modifiedURI, { acceptTextOnly: true })).value;
			if (this._store.isDisposed || this._model.hasActiveRequest.get() || this.modifiedModel.getVersionId() !== version || disk !== (dirty ? this._after : this.modifiedModel.getValue())) {
				throw new Error(localize('agentHostReview.concurrentEdit', "The file changed while preparing Undo. No changes were reverted."));
			}
		}
		await this._changes.getDiffInfo();
		this._checkReviewAllowed(undo);
		if (version !== this.modifiedModel.getVersionId() || originalVersion !== this.originalModel.getVersionId()) {
			throw new Error(localize('agentHostReview.changedWhilePreparing', "The file changed while preparing this review action. Try again on the latest changes."));
		}
		return { dirty, userEditVersion: this._userEditVersion };
	}

	accept(): Promise<void> {
		return this._actions.queue(async () => {
			if (this.state.get() !== ModifiedFileEntryState.Modified) {
				return;
			}
			await this._prepare(false);
			this._checkReviewAllowed(false);
			this._changes.keep();
			this._canDelete = false;
			this._hasConflictingUserEdits = false;
			this._state.set(ModifiedFileEntryState.Accepted, undefined);
		});
	}

	reject(): Promise<void> {
		return this._actions.queue(async () => {
			if (this.state.get() !== ModifiedFileEntryState.Modified) {
				return;
			}
			const prepared = await this._prepare(true);
			this._checkReviewAllowed(true);
			if (this._canDelete && !this._hasUserEdits && !prepared.dirty) {
				if (!this._fileService.hasCapability(this.modifiedURI, FileSystemProviderCapabilities.Trash)) {
					throw new Error(localize('agentHostReview.trashUnavailable', "Undoing a new file requires moving it to Trash, which this file system does not support. The file was not deleted."));
				}
				await this._fileService.del(this.modifiedURI, { useTrash: true });
				this._changes.keep();
			} else {
				this._changes.undo();
				await this._saveUndo(prepared);
			}
			this._state.set(ModifiedFileEntryState.Rejected, undefined);
		});
	}

	private _reviewHunk(diff: IDocumentDiff2, change: DetailedLineRangeMapping, undo: boolean): Promise<boolean> {
		return this._actions.queue(async () => {
			const prepared = await this._prepare(undo);
			this._checkReviewAllowed(undo);
			const applied = await (undo ? diff.undo(change) : diff.keep(change));
			if (!applied) {
				throw new Error(localize('agentHostReview.staleHunk', "This change has been updated. Review the latest change and try again."));
			}
			if (undo) {
				await this._saveUndo(prepared);
			} else {
				this._canDelete = false;
			}
			return true;
		});
	}

	private async _saveUndo(prepared: { dirty: boolean; userEditVersion: number }): Promise<void> {
		if (!prepared.dirty && prepared.userEditVersion === this._userEditVersion) {
			if (this._model.hasActiveRequest.get()) {
				throw new Error(localize('agentHostReview.agentResumed', "The agent resumed before Undo could be saved. The reverted changes remain in the editor."));
			}
			const saved = await this._textFileService.save(this.modifiedURI, { reason: SaveReason.EXPLICIT, skipSaveParticipants: true, ignoreErrorHandler: true });
			if (!saved) {
				throw new Error(localize('agentHostReview.saveFailed', "The reverted changes could not be saved. They remain in the editor."));
			}
			this._after = this.modifiedModel.getValue();
		}
	}
}
