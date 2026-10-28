/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError, raceTimeout, Sequencer } from '../../../../../../base/common/async.js';
import { cancelOnDispose, CancellationToken } from '../../../../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../../../../base/common/errorMessage.js';
import { CancellationError, isCancellationError } from '../../../../../../base/common/errors.js';
import { Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore, IReference } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap, ResourceSet } from '../../../../../../base/common/map.js';
import { autorun, constObservable, derived, derivedOpts, IObservable, IReader, ITransaction, observableFromEvent, observableSignalFromEvent, observableValue, transaction } from '../../../../../../base/common/observable.js';
import { basename, isEqual } from '../../../../../../base/common/resources.js';
import { stripUTF8BOM } from '../../../../../../base/common/strings.js';
import { isDefined } from '../../../../../../base/common/types.js';
import { URI } from '../../../../../../base/common/uri.js';
import { StringEdit } from '../../../../../../editor/common/core/edits/stringEdit.js';
import { LineRange } from '../../../../../../editor/common/core/ranges/lineRange.js';
import { OffsetRange } from '../../../../../../editor/common/core/ranges/offsetRange.js';
import { StringText } from '../../../../../../editor/common/core/text/abstractText.js';
import { DetailedLineRangeMapping, lineRangeMappingFromRangeMappings, RangeMapping } from '../../../../../../editor/common/diff/rangeMapping.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../../../editor/common/services/resolverService.js';
import { IEditorWorkerService } from '../../../../../../editor/common/services/editorWorker.js';
import { localize } from '../../../../../../nls.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { AGENT_HOST_ACCEPT_CHANGES_OPERATION_ID, AGENT_HOST_DISCARD_CHANGES_OPERATION_ID } from '../../../../../../platform/agentHost/common/agentHostChangesetOperationService.js';
import { IAgentHostConnectionsService, IAgentHostSessionResolution } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { ChangesetKind, resolveChangesetUriTemplate } from '../../../../../../platform/agentHost/common/changesetUri.js';
import { IAgentSubscription, observableFromSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { ChangesetOperationScope, ChangesetOperationStatus, ChangesetOperationTargetKind, ChangesetState, ChangesetStatus, SessionState, StateComponents, type TextRange } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IUriIdentityService } from '../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { EditorsOrder, IEditorIdentifier, isDiffEditorInput, SaveReason } from '../../../../../common/editor.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { UTF8, UTF8_with_bom } from '../../../../../services/textfile/common/encoding.js';
import { isTextFileEditorModel, ITextFileService, TextFileReconcileResult } from '../../../../../services/textfile/common/textfiles.js';
import { MultiDiffEditorInput } from '../../../../multiDiffEditor/browser/multiDiffEditorInput.js';
import { INotebookService } from '../../../../notebook/common/notebookService.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { ChatEditKind, getMultiDiffSourceUri, IChatEditingSession, IEditSessionEntryDiff, IModifiedEntryTelemetryInfo, IModifiedFileEntry, ModifiedFileEntryState } from '../../../common/editing/chatEditingService.js';
import { isUntitledChatSession } from '../../../common/model/chatUri.js';
import { ChatEditingModifiedDocumentEntry } from '../../chatEditing/chatEditingModifiedDocumentEntry.js';
import { agentHostChangesetFileToEntryDiff } from './agentHostResponseFileChanges.js';
import { IAgentHostUntitledProvisionalSessionService } from './agentHostUntitledProvisionalSessionService.js';
import { AgentHostCheckpointReview, IAgentHostCheckpointReviewSource } from './agentHostCheckpointReview.js';

/** How long diffs between versions of a file may take before the file is compared as a whole. */
const DIFF_TIMEOUT_MS = 1000;

/** How long an operation waits for the Working Set to finish updating. */
const WORKING_SET_READY_TIMEOUT_MS = 30_000;

class EditReviewSynchronizationError extends Error { }

/** A file of the session's Working Set, and the version of its changes that the agent host published with it. */
interface IWorkingSetFileChange {
	readonly diff: IEditSessionEntryDiff;
	/** Sent back with operations on the file, so they don't cover changes the editor didn't show. Older hosts publish none. */
	readonly nonce: string | undefined;
	/** Whether an agent's edit tool call is writing the file, so its changes can't be kept or undone meanwhile. */
	readonly editing: boolean;
}

/** A file of the session's Working Set, as last read from the agent host. */
interface IWorkingSetFile extends IWorkingSetFileChange {
	/** The content its changes are compared with. */
	readonly baseline: string;
	/** Its content after the last edit the session recorded. */
	readonly current: string;
}

/** The session's Working Set changeset, while its host advertises one. */
interface IWorkingSet {
	readonly connection: IAgentConnection;
	readonly connectionAuthority: string;
	readonly channel: URI;
}

/** Keeps and undoes the changes of review entries with the agent host. */
interface IWorkingSetOperations {
	keep(entry: AgentHostEditReviewEntry, change?: DetailedLineRangeMapping): Promise<boolean>;
	undo(entry: AgentHostEditReviewEntry, change?: DetailedLineRangeMapping): Promise<boolean>;
}

/**
 * A file of the session's Working Set, reviewed in the editor like a local
 * chat edit. The agent host records what is kept, so keeping or undoing
 * changes asks it to accept or discard them, and the entry then follows the
 * Working Set.
 */
class AgentHostEditReviewEntry extends ChatEditingModifiedDocumentEntry {

	private _operations: IWorkingSetOperations | undefined;
	private _file: IWorkingSetFile | undefined;

	/** The Working Set file this entry reviews, as last read. */
	get file(): IWorkingSetFile {
		if (!this._file) {
			throw new Error('Review entry is not connected');
		}
		return this._file;
	}

	/** Connects the entry to the Working Set file it reviews; called right after creating it. */
	connect(operations: IWorkingSetOperations, file: IWorkingSetFile, edit: StringEdit): void {
		this._operations = operations;
		this._file = file;
		// Before the first diff starts, the original takes the document's line endings, which edits map onto.
		this._matchLineEndings();
		this._mapOriginalToModified(edit);
		this._register(this.modifiedModel.onDidChangeContent(e => {
			if (e.isEolChange) {
				this._matchLineEndings();
			}
		}));
	}

	/** Compares the document with the latest version of its Working Set file. */
	async update(file: IWorkingSetFile, original: string, edit: StringEdit): Promise<void> {
		this._file = file;
		const reset = this._resetOriginalContent(original);
		// The reset replaced the original synchronously, and its diff starts after this.
		this._matchLineEndings();
		this._mapOriginalToModified(edit);
		await reset;
	}

	/** Keeping or undoing a single change goes through the agent host as well. */
	override get diffInfo() {
		return super.diffInfo.map(diff => ({
			...diff,
			keep: (change: DetailedLineRangeMapping) => this._operations?.keep(this, change) ?? Promise.resolve(false),
			undo: (change: DetailedLineRangeMapping) => this._operations?.undo(this, change) ?? Promise.resolve(false),
		}));
	}

	protected override async _doAccept(): Promise<void> {
		if (!await this._operations?.keep(this)) {
			throw new CancellationError();
		}
	}

	protected override async _doReject(): Promise<void> {
		if (!await this._operations?.undo(this)) {
			throw new CancellationError();
		}
	}

	/** Changes the agent host didn't keep stay undecided. */
	override acceptDeferred() {
		const file = this.file;
		return completeIfCurrent(super.acceptDeferred(), () => isSameWorkingSetFile(this.file, file));
	}

	/** Changes the agent host didn't undo stay undecided. */
	override rejectDeferred() {
		const file = this.file;
		return completeIfCurrent(super.rejectDeferred(), () => isSameWorkingSetFile(this.file, file));
	}

	/** Whether an agent's edit tool call is writing the file, see {@link setEditing}. */
	get isAgentEditing(): boolean {
		return this._agentEditing;
	}

	private _agentEditing = false;
	private _agentReloads = 0;

	/**
	 * Marks the file as being written by an agent's edit tool call, or not.
	 * As while local chat edits stream into a file, the editor is read-only,
	 * the changes can't be kept or undone, and changes of the document, as
	 * when it reloads what the agent wrote, are the agent's meanwhile. The
	 * agent host reports which file is written, not which chat response
	 * writes it.
	 */
	setEditing(editing: boolean): void {
		this._agentEditing = editing;
		this._updateExternalEdit();
		if (!!this._isCurrentlyBeingModifiedByObs.get() === editing) {
			return;
		}
		transaction(tx => {
			this._isCurrentlyBeingModifiedByObs.set(editing ? { responseModel: undefined, undoStopId: undefined } : undefined, tx);
			this._waitsForLastEdits.set(editing, tx);
		});
	}

	/** Runs `task`, which reloads what the agent wrote into the document, with the document's changes counting as the agent's. */
	async runAsAgentEdit(task: () => Promise<void>): Promise<void> {
		this._agentReloads++;
		this._updateExternalEdit();
		try {
			await task();
		} finally {
			this._agentReloads--;
			this._updateExternalEdit();
		}
	}

	/** Local chat counts the changes of a document as an agent's while the agent edits its file on disk. */
	private _updateExternalEdit(): void {
		if (this._agentEditing || this._agentReloads > 0) {
			this.startExternalEdit();
		} else {
			this.stopExternalEdit();
		}
	}

	private _matchLineEndings(): void {
		this.originalModel.setEOL(this.modifiedModel.getEndOfLineSequence());
	}
}

/**
 * Reviews the agent host session's Working Set in the editor, so its changes
 * can be kept or undone like local chat edits: in the editor, with the
 * editor's Keep and Undo, and in the working set above the chat input.
 *
 * The agent host owns the review. Its Working Set changeset holds the tool
 * edits the user hasn't kept, and its Accept Changes and Discard Changes
 * operations keep or undo a file's changes, or the changes of one hunk. Each
 * entry follows a file of the Working Set: it compares the document with the
 * file's baseline, and keeping or undoing asks the host, whose updated
 * Working Set the entries then follow. The host updates the Working Set after
 * each of the agent's edits, so changes can be kept or undone while the agent
 * works, and an operation names the version of the changes the editor showed.
 * Session, turn and branch changesets reflect an undo as soon as the host
 * records it.
 */
export class AgentHostEditReview extends Disposable implements IWorkingSetOperations {

	private readonly _entries = new ResourceMap<AgentHostEditReviewEntry>();
	private readonly _entriesObs = observableValue<readonly AgentHostEditReviewEntry[]>(this, []);
	readonly entries: IObservable<readonly IModifiedFileEntry[]> = derived(this, reader => this._entriesObs.read(reader).filter(entry => this._isFileVisible(entry, reader)));
	private readonly _checkpointReview = observableValue<AgentHostCheckpointReview | undefined>(this, undefined);

	private readonly _rawChanges = derived<IAgentHostCheckpointReviewSource | undefined>(this, reader => {
		const workingSet = this._workingSet.read(reader);
		const state = workingSet?.state.read(reader);
		return workingSet ? { channel: workingSet.channel, ready: state?.status === ChangesetStatus.Ready, failed: workingSet.failed.read(reader) || state?.status === ChangesetStatus.Error, files: state ? toWorkingSetFileChanges(state, workingSet.connectionAuthority) : [] } : undefined;
	});
	readonly fileChanges = derived(this, reader => {
		const current = this._rawChanges.read(reader);
		return current ? (this._checkpointReview.read(reader)?.project(current.channel, current.files, reader) ?? current.files).map(file => file.diff) : [];
	});

	private readonly _workingSet: IObservable<(IWorkingSet & { readonly subscription: IAgentSubscription<ChangesetState>; readonly state: IObservable<ChangesetState | undefined>; readonly failed: IObservable<boolean> }) | undefined>;
	/** Follows the Working Set one update at a time. */
	private readonly _updates = new Sequencer();
	/** Runs operations one at a time, since each one changes the Working Set the next one checks. */
	private readonly _operations = new Sequencer();
	private readonly _blockedFiles = new ResourceSet();
	private readonly _lifetimeToken = cancelOnDispose(this._store);

	constructor(
		readonly chatSessionResource: URI,
		@IAgentHostConnectionsService connectionsService: IAgentHostConnectionsService,
		@IAgentHostUntitledProvisionalSessionService provisionalSessions: IAgentHostUntitledProvisionalSessionService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@ITextFileService private readonly _textFileService: ITextFileService,
		@IFileService private readonly _fileService: IFileService,
		@IChatService private readonly _chatService: IChatService,
		@IEditorService private readonly _editorService: IEditorService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IAccessibilitySignalService private readonly _accessibilitySignalService: IAccessibilitySignalService,
		@INotebookService private readonly _notebookService: INotebookService,
		@IUriIdentityService private readonly _uriIdentityService: IUriIdentityService,
		@ILogService private readonly _logService: ILogService,
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService,
	) {
		super();
		this._register(this._textFileService.files.retainResolvedContent());

		const resolutionChanged = observableSignalFromEvent(this, Event.any<unknown>(connectionsService.onDidChangeSessionResolution, provisionalSessions.onDidChange));
		const resolution = derivedOpts<IAgentHostSessionResolution | undefined>({ owner: this, equalsFn: resolutionEquals }, reader => {
			resolutionChanged.read(reader);
			const provisionalBackend = provisionalSessions.get(chatSessionResource);
			if (isUntitledChatSession(chatSessionResource) && !provisionalBackend) {
				return undefined;
			}
			const resolved = connectionsService.resolveSessionResource(chatSessionResource);
			return resolved && provisionalBackend ? { ...resolved, backendSession: provisionalBackend } : resolved;
		});
		const sessionState = derived(this, reader => {
			const current = resolution.read(reader);
			if (!current) {
				return constObservable<SessionState | undefined>(undefined);
			}
			const subscription = reader.store.add(current.connection.getSubscription(StateComponents.Session, current.backendSession, 'AgentHostEditReview'));
			return observableFromSubscription(this, subscription.object);
		});
		const workingSet = derivedOpts<IWorkingSet | undefined>({ owner: this, equalsFn: workingSetEquals }, reader => {
			const current = resolution.read(reader);
			const state = sessionState.read(reader).read(reader);
			const changeset = state?.changesets?.find(candidate => candidate.changeKind === ChangesetKind.WorkingSet && !candidate.uriTemplate.includes('{'));
			return current && changeset
				? { connection: current.connection, connectionAuthority: current.connectionAuthority, channel: URI.parse(resolveChangesetUriTemplate(current.backendSession.toString(), changeset.uriTemplate)) }
				: undefined;
		});
		this._workingSet = derived(this, reader => {
			const current = workingSet.read(reader);
			if (!current) {
				return undefined;
			}
			const subscription = reader.store.add(current.connection.getSubscription(StateComponents.Changeset, current.channel, 'AgentHostEditReview')).object;
			return {
				...current,
				subscription,
				state: observableFromSubscription(this, subscription),
				failed: observableFromEvent(this, Event.any(subscription.onDidChange, subscription.onDidError ?? Event.None), () => subscription.value instanceof Error),
			};
		});
		const retryBlockedFiles = observableSignalFromEvent(this, Event.filter(Event.any(
			Event.map(this._textFileService.files.onDidSave, event => event.model),
			this._textFileService.files.onDidRevert,
		), model => this._blockedFiles.has(model.resource)));
		this._register(autorun(reader => {
			retryBlockedFiles.read(reader);
			const current = this._workingSet.read(reader);
			const state = current?.state.read(reader);
			const rawFiles = current && state ? toWorkingSetFileChanges(state, current.connectionAuthority) : [];
			const files = current ? this._checkpointReview.read(reader)?.project(current.channel, rawFiles, reader) ?? rawFiles : rawFiles;
			for (const file of files) {
				if (file.editing) {
					// An edit starts immediately, even while an earlier update is being read or diffed.
					this._entries.get(this._uriIdentityService.asCanonicalUri(file.diff.modifiedURI))?.setEditing(true);
				}
			}
			if (current && state?.status !== ChangesetStatus.Ready) {
				// While the Working Set updates, its files are the previous ones.
				return;
			}
			const token = cancelOnDispose(reader.store);
			this._updates.queue(() => this._update(files, token));
		}));
	}

	getEntry(uri: URI): IModifiedFileEntry | undefined {
		const entry = this._entries.get(uri);
		return entry && this._isFileVisible(entry) ? entry : undefined;
	}

	setCheckpointReview(review: AgentHostCheckpointReview): void {
		this._register(review.registerSource(this._rawChanges));
		this._checkpointReview.set(review, undefined);
	}

	async resolveEntry(uri: URI): Promise<IModifiedFileEntry | undefined> {
		const workingSet = this._workingSet.get();
		if (workingSet && !await whenReady(workingSet.subscription)) {
			throw new Error(localize('agentHostEditReview.notReady', "The session's changes couldn't be checked. Try again."));
		}
		await raceCancellationError(this._updates.queue(async () => { }), this._lifetimeToken);
		return this.getEntry(uri);
	}

	readEntry(uri: URI, reader: IReader): IModifiedFileEntry | undefined {
		this._entriesObs.read(reader);
		const entry = this._entries.get(uri);
		return entry && this._isFileVisible(entry, reader) ? entry : undefined;
	}

	async accept(...uris: URI[]): Promise<void> {
		if (await this._decide(uris, entry => entry.accept(), ModifiedFileEntryState.Accepted)) {
			this._accessibilitySignalService.playSignal(AccessibilitySignal.editsKept, { allowManyInParallel: true });
		}
	}

	async reject(...uris: URI[]): Promise<void> {
		if (await this._decide(uris, entry => entry.reject(), ModifiedFileEntryState.Rejected)) {
			this._accessibilitySignalService.playSignal(AccessibilitySignal.editsUndone, { allowManyInParallel: true });
		}
	}

	/** Keeps or undoes the changes of the entries of `uris`, or of every entry, resolving to whether the host did for any of them. */
	private async _decide(uris: readonly URI[], decide: (entry: AgentHostEditReviewEntry) => Promise<void>, decided: ModifiedFileEntryState): Promise<boolean> {
		const entries = this._getEntries(uris);
		await Promise.all(entries.map(decide));
		return entries.some(entry => entry.state.get() === decided);
	}

	async show(session: IChatEditingSession, previousChanges?: boolean): Promise<void> {
		const input = MultiDiffEditorInput.fromResourceMultiDiffEditorInput({
			multiDiffSource: getMultiDiffSourceUri(session, previousChanges),
			label: localize('agentHostEditReview.multiDiff', "Suggested Edits"),
		}, this._instantiationService);
		await this._editorService.openEditor(input, { pinned: true });
	}

	keep(entry: AgentHostEditReviewEntry, change?: DetailedLineRangeMapping): Promise<boolean> {
		return this._invoke(entry, AGENT_HOST_ACCEPT_CHANGES_OPERATION_ID, change, AccessibilitySignal.editsKept, (fileName, message) => localize('agentHostEditReview.keepFailed', "Could not keep the changes to '{0}': {1}", fileName, message));
	}

	undo(entry: AgentHostEditReviewEntry, change?: DetailedLineRangeMapping): Promise<boolean> {
		return this._invoke(entry, AGENT_HOST_DISCARD_CHANGES_OPERATION_ID, change, AccessibilitySignal.editsUndone, (fileName, message) => localize('agentHostEditReview.undoFailed', "Could not undo the changes to '{0}': {1}", fileName, message));
	}

	override dispose(): void {
		const entries = [...this._entries.values()];
		this._entries.clear();
		this._entriesObs.set([], undefined);
		for (const entry of entries) {
			this._releaseEntry(entry, false);
		}
		super.dispose();
	}

	/** Follows the files of the Working Set: reviews new ones, updates changed ones, and drops those that left it. */
	private async _update(files: readonly IWorkingSetFileChange[], token: CancellationToken): Promise<void> {
		const listed = new ResourceSet();
		for (const file of files) {
			if (token.isCancellationRequested) {
				return;
			}
			// A deleted file has no document to review; the working set lists it.
			if (file.diff.isDeleted || this._store.isDisposed) {
				continue;
			}
			const resource = this._uriIdentityService.asCanonicalUri(file.diff.modifiedURI);
			listed.add(resource);
			if (file.editing) {
				this._entries.get(resource)?.setEditing(true);
				continue;
			}
			try {
				await this._updateFile(resource, file, token);
				if (token.isCancellationRequested) {
					return;
				}
				const entry = this._entries.get(resource);
				if (entry) {
					if (entry.isAgentEditing) {
						await entry.getDiffInfo();
						const workingSet = this._workingSet.get();
						const state = workingSet?.state.get();
						const latest = workingSet && state ? this._findWorkingSetFile(state, workingSet, entry) : undefined;
						// A later edit must not be unlocked by this update finishing.
						if (!token.isCancellationRequested && state?.status === ChangesetStatus.Ready && latest && !latest.editing && isSameWorkingSetFile(latest, file)) {
							entry.setEditing(false);
						}
					}
				}
				this._blockedFiles.delete(resource);
			} catch (error) {
				if (isCancellationError(error) || token.isCancellationRequested) {
					return;
				}
				this._logService.error(`[AgentHostEditReview] Could not review ${resource}`, error);
				if (error instanceof EditReviewSynchronizationError) {
					const entry = this._entries.get(resource);
					if (entry) {
						entry.setEditing(false);
						this._removeEntry(entry);
					}
					if (!this._blockedFiles.has(resource)) {
						this._blockedFiles.add(resource);
						this._notificationService.warn(localize('agentHostEditReview.reconcileFailed', "Could not update editor review for '{0}': {1} Your text has been preserved. Resolve the file's changes and save or revert it to resume editor review.", basename(resource), error.message));
					}
				}
			}
		}
		if (token.isCancellationRequested) {
			return;
		}
		for (const resource of this._blockedFiles) {
			if (!listed.has(resource)) {
				this._blockedFiles.delete(resource);
			}
		}
		for (const entry of [...this._entries.values()]) {
			if (!listed.has(entry.modifiedURI)) {
				this._removeEntry(entry);
			}
		}
	}

	private async _updateFile(resource: URI, change: IWorkingSetFileChange, token: CancellationToken): Promise<void> {
		const existing = this._entries.get(resource);
		if (existing && isSameWorkingSetFile(existing.file, change)) {
			if (existing.isAgentEditing) {
				await existing.runAsAgentEdit(() => this._reloadFromDisk(resource, existing.file.current, token));
			}
			return;
		}
		const contents = await this._readContents(change.diff);
		const entry = this._entries.get(resource);
		if (this._store.isDisposed || token.isCancellationRequested) {
			return;
		}
		if (!contents) {
			if (entry) {
				this._removeEntry(entry);
			}
			return;
		}
		if (entry?.state.get() === ModifiedFileEntryState.Modified) {
			// The review compares the document with what the session recorded, so it first gets the agent's last write.
			entry.setEditing(true);
			await entry.runAsAgentEdit(() => this._reloadFromDisk(resource, contents.current, token));
			if (token.isCancellationRequested) {
				return;
			}
			const file = { ...change, ...contents };
			const prepared = await this._prepareFile(file, entry.modifiedModel, token);
			await entry.update(file, prepared.original, prepared.edit);
			entry.updateTelemetryInfo(this._getTelemetryInfo());
			this._entriesObs.set([...this._entries.values()], undefined);
			return;
		}
		if (entry) {
			// The user decided on the earlier changes, so the file is reviewed anew.
			this._removeEntry(entry);
		}
		await this._createEntry(resource, { ...change, ...contents }, token);
	}

	private async _createEntry(resource: URI, file: IWorkingSetFile, token: CancellationToken): Promise<void> {
		if (this._notebookService.hasSupportedNotebooks(resource)) {
			// Notebooks are edited through their own working copies, which a text review can't follow.
			return;
		}
		let ref: IReference<IResolvedTextEditorModel>;
		try {
			ref = await this._textModelService.createModelReference(resource);
		} catch (error) {
			this._logService.warn(`[AgentHostEditReview] Could not open ${resource} for review`, error);
			return;
		}
		if (this._store.isDisposed || token.isCancellationRequested || this._entries.has(resource) || !this._hasSupportedEncoding(ref.object)) {
			ref.dispose();
			return;
		}
		let prepared: { original: string; edit: StringEdit };
		try {
			await this._reloadFromDisk(resource, file.current, token);
			prepared = await this._prepareFile(file, ref.object.textEditorModel, token);
		} catch (error) {
			ref.dispose();
			throw error;
		}
		if (this._store.isDisposed || token.isCancellationRequested) {
			ref.dispose();
			return;
		}
		const entry = this._instantiationService.createInstance(
			AgentHostEditReviewEntry,
			ref,
			{ collapse: () => { } },
			this._getTelemetryInfo(),
			file.diff.isCreated ? ChatEditKind.Created : ChatEditKind.Modified,
			prepared.original,
		);
		entry.connect(this, file, prepared.edit);
		entry.setEditing(file.editing);
		// Agent changes wait for a decision, whatever the auto-accept delay.
		entry.enableReviewModeUntilSettled();
		this._entries.set(entry.modifiedURI, entry);
		this._entriesObs.set([...this._entries.values()], undefined);
	}

	private async _prepareFile(file: IWorkingSetFile, model: ITextModel, token: CancellationToken): Promise<{ original: string; edit: StringEdit }> {
		for (let attempt = 0; attempt < 2; attempt++) {
			if (token.isCancellationRequested || model.isDisposed()) {
				throw new CancellationError();
			}
			const version = model.getVersionId();
			const live = model.getValue();
			const original = await getReviewedOriginal(file, live, model.getEOL(), this._editorWorkerService);
			if (token.isCancellationRequested || model.isDisposed()) {
				throw new CancellationError();
			}
			if (version !== model.getVersionId()) {
				continue;
			}
			const edit = await computeEdit(original, live, this._editorWorkerService)
				?? StringEdit.replace(OffsetRange.ofLength(original.length), live).removeCommonSuffixAndPrefix(original);
			if (token.isCancellationRequested || model.isDisposed()) {
				throw new CancellationError();
			}
			if (version === model.getVersionId()) {
				return { original, edit };
			}
		}
		throw new EditReviewSynchronizationError(localize('agentHostEditReview.prepareChanged', "The document changed while its changes were being compared."));
	}

	/** Reads a file's baseline and current content, unless they aren't UTF-8 text, as the agent host compares them. */
	private async _readContents(diff: IEditSessionEntryDiff): Promise<Pick<IWorkingSetFile, 'baseline' | 'current'> | undefined> {
		const [baseline, current] = await Promise.all([
			// A created file has no baseline content; its original URI is the file itself.
			diff.isCreated ? '' : this._readText(diff.originalURI),
			diff.modifiedSnapshotURI ? this._readText(diff.modifiedSnapshotURI) : undefined,
		]);
		return baseline !== undefined && current !== undefined ? { baseline, current } : undefined;
	}

	private async _readText(resource: URI): Promise<string | undefined> {
		let text: string;
		try {
			text = (await this._fileService.readFile(resource)).value.toString();
		} catch (error) {
			this._logService.warn(`[AgentHostEditReview] Could not read ${resource}`, error);
			return undefined;
		}
		// Content that isn't UTF-8 text decodes with replacement characters, which would show as changes.
		return text.includes('\uFFFD') || text.includes('\0') ? undefined : stripUTF8BOM(text);
	}

	/** The agent host compares contents as UTF-8 text, so only UTF-8 documents are reviewed. */
	private _hasSupportedEncoding(model: IResolvedTextEditorModel): boolean {
		const encoding = isTextFileEditorModel(model) ? model.getEncoding() : undefined;
		if (encoding === UTF8 || encoding === UTF8_with_bom) {
			return true;
		}
		this._logService.info(`[AgentHostEditReview] Not reviewing ${model.textEditorModel.uri} because its encoding is ${encoding ?? 'unknown'}`);
		return false;
	}

	/** Reloads clean documents or reconciles a recorded disk version with unsaved text without saving it. */
	private async _reloadFromDisk(resource: URI, expectedContent: string, token: CancellationToken): Promise<void> {
		const model = this._textFileService.files.get(resource);
		if (!model || model.isDisposed()) {
			return;
		}
		if (!model.isDirty()) {
			try {
				await model.resolve({ forceReadFromFile: true });
			} catch (error) {
				if (isCancellationError(error) || token.isCancellationRequested) {
					throw new CancellationError();
				}
				throw new EditReviewSynchronizationError(toErrorMessage(error));
			}
		}
		if (model.isDirty()) {
			for (let attempt = 0; attempt < 2; attempt++) {
				let result: TextFileReconcileResult;
				try {
					result = await model.reconcileExternalChanges(expectedContent, token);
				} catch (error) {
					if (isCancellationError(error) || token.isCancellationRequested) {
						throw new CancellationError();
					}
					throw new EditReviewSynchronizationError(toErrorMessage(error));
				}
				if (token.isCancellationRequested) {
					throw new CancellationError();
				}
				if (result === TextFileReconcileResult.Reconciled) {
					return;
				}
				if (result === TextFileReconcileResult.Conflict) {
					throw new EditReviewSynchronizationError(localize('agentHostEditReview.overlappingEdits', "Both edits change the same text."));
				}
				if (result === TextFileReconcileResult.Unavailable) {
					throw new EditReviewSynchronizationError(localize('agentHostEditReview.noMergeBase', "A safe comparison with the saved file is unavailable."));
				}
			}
			throw new EditReviewSynchronizationError(localize('agentHostEditReview.mergeChanged', "The file changed again while it was being compared."));
		}
	}

	/**
	 * Asks the agent host to accept or discard the changes of `entry` in the
	 * Working Set: the changes of the hunk `change`, or all of them, as the
	 * editor showed them when the user decided. Failures are reported, and a
	 * decided hunk is signaled; {@link accept} and {@link reject} signal the
	 * files they decide on together. Resolves to whether the host did.
	 */
	private _invoke(entry: AgentHostEditReviewEntry, operationId: string, change: DetailedLineRangeMapping | undefined, decided: AccessibilitySignal, failed: (fileName: string, message: string) => string): Promise<boolean> {
		// The operation waits for earlier ones and for Working Set updates, which can update the entry meanwhile.
		const shown = entry.file;
		return this._operations.queue(async () => {
			try {
				const done = await this._doInvoke(entry, shown, operationId, change);
				if (done && change) {
					this._accessibilitySignalService.playSignal(decided, { allowManyInParallel: true });
				}
				return done;
			} catch (error) {
				if (this._store.isDisposed && isCancellationError(error)) {
					return false;
				}
				this._notificationService.error(failed(basename(entry.modifiedURI), toErrorMessage(error)));
				return false;
			}
		});
	}

	private async _doInvoke(entry: AgentHostEditReviewEntry, shown: IWorkingSetFile, operationId: string, change: DetailedLineRangeMapping | undefined): Promise<boolean> {
		// The Working Set updates received so far apply first, so the checks below see the latest one.
		await this._updates.queue(async () => { });
		if (!this._isReviewing(entry)) {
			// The changes were decided since they were shown.
			return false;
		}
		if (!isSameWorkingSetFile(entry.file, shown)) {
			// The agent changed the file since the user decided, and the operation must only cover what the user saw.
			throw new Error(localize('agentHostEditReview.changed', "The changes were updated in the meantime. Try again."));
		}
		if (change && !entry.diffInfo.get().changes.includes(change)) {
			// The user's typing replaced the change, as local chat edits ignore such a change too.
			return false;
		}
		if (entry.isCurrentlyBeingModifiedBy.get()) {
			// The editor disables keeping and undoing while the agent writes the file, as local chat does.
			throw new Error(localize('agentHostEditReview.editing', "The agent is editing this file. Try again once it has finished."));
		}
		const workingSet = this._workingSet.get();
		const state = workingSet && await whenReady(workingSet.subscription);
		if (!workingSet || !state) {
			throw new Error(localize('agentHostEditReview.notReady', "The session's changes couldn't be checked. Try again."));
		}
		const file = this._findWorkingSetFile(state, workingSet, entry);
		if (!file) {
			// The file left the Working Set, as when it was kept elsewhere.
			return false;
		}
		if (!isSameWorkingSetFile(file, shown)) {
			throw new Error(localize('agentHostEditReview.changed', "The changes were updated in the meantime. Try again."));
		}
		if (file.editing || entry.isCurrentlyBeingModifiedBy.get()) {
			throw new Error(localize('agentHostEditReview.editing', "The agent is editing this file. Try again once it has finished."));
		}
		await this._invokeOperation(workingSet, entry, shown, operationId, state, change && !file.diff.isCreated ? change : undefined);
		if (change) {
			const isUpdated = (state: ChangesetState | Error | undefined) => {
				if (state instanceof Error || state?.status === ChangesetStatus.Error) {
					return true;
				}
				const current = state && this._findWorkingSetFile(state, workingSet, entry);
				return state?.status === ChangesetStatus.Ready && (!current || !isSameWorkingSetFile(current, shown));
			};
			if (!isUpdated(workingSet.subscription.value)) {
				const updated = Event.toPromise(Event.filter(Event.any(workingSet.subscription.onDidChange, workingSet.subscription.onDidError ?? Event.None), () => isUpdated(workingSet.subscription.value)));
				try {
					await raceCancellationError(raceTimeout(updated, WORKING_SET_READY_TIMEOUT_MS, () => updated.cancel()), this._lifetimeToken);
				} finally {
					updated.cancel();
				}
			}
			const updated = workingSet.subscription.value;
			if (!isUpdated(updated) || updated instanceof Error || updated?.status !== ChangesetStatus.Ready) {
				throw new Error(localize('agentHostEditReview.updatePending', "The decision was sent, but the updated changes could not be loaded. Check the working set before trying again."));
			}
			await this._updates.queue(async () => { });
			if (this._isReviewing(entry)) {
				await entry.getDiffInfo();
			}
		}
		return true;
	}

	private async _invokeOperation(workingSet: IWorkingSet & { readonly subscription: IAgentSubscription<ChangesetState> }, entry: AgentHostEditReviewEntry, shown: IWorkingSetFile, operationId: string, state: ChangesetState, change: DetailedLineRangeMapping | undefined): Promise<void> {
		// A created file has no lines to compare with, so its changes are kept or undone as a whole.
		const scope = change ? ChangesetOperationScope.Range : ChangesetOperationScope.Resource;
		const operation = state.operations?.find(candidate => candidate.id === operationId && candidate.scopes.includes(scope));
		if (!operation) {
			throw new Error(localize('agentHostEditReview.unsupported', "The agent host doesn't support this."));
		}
		if (operation.status === ChangesetOperationStatus.Disabled) {
			// The agent host disables operations it can't run while a turn runs.
			throw new Error(localize('agentHostEditReview.busy', "Try again once the agent has finished working."));
		}
		const resource = workingSet.connection.resourceUris.toAgentHost(entry.modifiedURI).toString();
		let range: TextRange | undefined;
		if (change) {
			const modelVersion = entry.modifiedModel.getVersionId();
			const lines = await mapLinesToCurrent(change.modified, entry.modifiedModel.getValue(), withLineEndings(shown.current, entry.modifiedModel.getEOL()), this._editorWorkerService);
			const latest = workingSet.subscription.value;
			const latestFile = latest && !(latest instanceof Error) ? this._findWorkingSetFile(latest, workingSet, entry) : undefined;
			if (entry.modifiedModel.isDisposed() || entry.modifiedModel.getVersionId() !== modelVersion || !this._isReviewing(entry)
				|| entry.isCurrentlyBeingModifiedBy.get() || latest instanceof Error || latest?.status !== ChangesetStatus.Ready
				|| !latestFile || latestFile.editing || !isSameWorkingSetFile(latestFile, shown)) {
				throw new Error(localize('agentHostEditReview.changed', "The changes were updated in the meantime. Try again."));
			}
			if (!lines) {
				// Lines that can't be matched could select another change in the session's content.
				throw new Error(localize('agentHostEditReview.unmapped', "The change couldn't be matched with the session's changes. Keep or undo the whole file instead."));
			}
			range = toTextRange(lines);
		}
		if (operationId === AGENT_HOST_DISCARD_CHANGES_OPERATION_ID && this._textFileService.isDirty(entry.modifiedURI)) {
			// The agent host reverts the changes on disk, so the document's unsaved text goes there first.
			const saved = await this._textFileService.save(entry.modifiedURI, { reason: SaveReason.EXPLICIT, skipSaveParticipants: true });
			if (!saved || this._textFileService.isDirty(entry.modifiedURI)) {
				// Otherwise the host reverts what's on disk while the document keeps the changes, which a later save would restore.
				throw new Error(localize('agentHostEditReview.notSaved', "Its unsaved changes couldn't be saved. Save the file and try again."));
			}
			// The agent may have changed the file while it was saved.
			const latest = workingSet.subscription.value;
			const latestFile = latest && !(latest instanceof Error) ? this._findWorkingSetFile(latest, workingSet, entry) : undefined;
			if (!latestFile || !isSameWorkingSetFile(latestFile, shown)) {
				throw new Error(localize('agentHostEditReview.changed', "The changes were updated in the meantime. Try again."));
			}
		}
		const target = { resource, ...(shown.nonce !== undefined ? { nonce: shown.nonce } : {}) };
		await workingSet.connection.invokeChangesetOperation({
			channel: workingSet.channel.toString(),
			operationId,
			target: range
				? { kind: ChangesetOperationTargetKind.Range, ...target, side: 'after', range }
				: { kind: ChangesetOperationTargetKind.Resource, ...target },
		});
	}

	private _findWorkingSetFile(state: ChangesetState, workingSet: IWorkingSet, entry: AgentHostEditReviewEntry): IWorkingSetFileChange | undefined {
		return toWorkingSetFileChanges(state, workingSet.connectionAuthority)
			.find(candidate => isEqual(this._uriIdentityService.asCanonicalUri(candidate.diff.modifiedURI), entry.modifiedURI));
	}

	private _isReviewing(entry: AgentHostEditReviewEntry): boolean {
		return this._entries.get(entry.modifiedURI) === entry && this._isFileVisible(entry);
	}

	private _isFileVisible(entry: AgentHostEditReviewEntry, reader?: IReader): boolean {
		const review = this._checkpointReview.read(reader);
		const current = this._workingSet.read(reader);
		return !review || !current || review.project(current.channel, [entry.file], reader).length > 0;
	}

	private _removeEntry(entry: AgentHostEditReviewEntry): void {
		if (this._entries.get(entry.modifiedURI) !== entry) {
			return;
		}
		this._entries.delete(entry.modifiedURI);
		this._entriesObs.set([...this._entries.values()], undefined);
		this._releaseEntry(entry, true);
	}

	private _releaseEntry(entry: AgentHostEditReviewEntry, closeEditors: boolean): void {
		entry.setEditing(false);
		const editorService = this._editorService;
		const original = entry.originalURI;
		const referencesOriginal = ({ editor }: IEditorIdentifier) => isDiffEditorInput(editor) && isEqual(editor.original.resource, original);
		const diffEditors = editorService.getEditors(EditorsOrder.SEQUENTIAL).filter(referencesOriginal);
		if (diffEditors.length === 0) {
			entry.dispose();
			return;
		}
		// The open editors own this lifetime, including when closing is vetoed or the review itself is disposed.
		const lifetime = new DisposableStore();
		lifetime.add(entry);
		const releaseIfClosed = () => {
			if (!editorService.getEditors(EditorsOrder.SEQUENTIAL).some(referencesOriginal)) {
				lifetime.dispose();
			}
		};
		lifetime.add(editorService.onDidCloseEditor(releaseIfClosed));
		for (const editor of new Set(diffEditors.map(identifier => identifier.editor))) {
			lifetime.add(Event.once(editor.onWillDispose)(() => {
				if (!editorService.getEditors(EditorsOrder.SEQUENTIAL).some(candidate => candidate.editor !== editor && !candidate.editor.isDisposed() && referencesOriginal(candidate))) {
					lifetime.dispose();
				}
			}));
		}
		if (closeEditors) {
			const logService = this._logService;
			void editorService.closeEditors(diffEditors).then(releaseIfClosed, error => {
				logService.error('[AgentHostEditReview] Could not close review diff editors', error);
				releaseIfClosed();
			});
		}
	}

	/**
	 * The undecided entries of `uris`, or every undecided entry, whose changes
	 * can be kept or undone: as in local chat, not while the agent writes the file.
	 */
	private _getEntries(uris: readonly URI[]): readonly AgentHostEditReviewEntry[] {
		return [...this._entries.values()]
			.filter(entry => this._isFileVisible(entry))
			.filter(entry => uris.length === 0 || uris.some(uri => isEqual(entry.modifiedURI, uri)))
			.filter(entry => !entry.isCurrentlyBeingModifiedBy.get())
			.filter(entry => entry.state.get() === ModifiedFileEntryState.Modified);
	}

	/** Attributes the changes to the chat's latest request, the one whose turn last updated the Working Set. */
	private _getTelemetryInfo(): IModifiedEntryTelemetryInfo {
		const request = this._chatService.getSession(this.chatSessionResource)?.getRequests().at(-1);
		const response = request?.response;
		return {
			agentId: response?.agent?.id,
			command: response?.slashCommand?.name,
			sessionResource: this.chatSessionResource,
			requestId: request?.id ?? '',
			get result() { return response?.result; },
			modelId: response?.request?.modelId,
			modeId: response?.request?.modeInfo?.telemetryModeId,
			applyCodeBlockSuggestionId: undefined,
			feature: 'sideBarChat',
		};
	}
}

/**
 * The content to compare a document with: its Working Set baseline, with the
 * changes made to the document since the session last recorded it moved into
 * it. As in the Working Set, changes that touch the agent's stay with them.
 */
async function getReviewedOriginal(file: IWorkingSetFile, live: string, eol: string, workerService: IEditorWorkerService): Promise<string> {
	const baseline = withLineEndings(file.baseline, eol);
	const current = withLineEndings(file.current, eol);
	if (live === current) {
		return baseline;
	}
	const [agent, user] = await Promise.all([computeEdit(baseline, current, workerService), computeEdit(current, live, workerService)]);
	return agent && user ? user.rebaseSkipConflicting(agent.inverse(baseline)).apply(baseline) : baseline;
}

/**
 * The lines of `current` that the lines `lines` of `live` correspond to,
 * through the changes made to `live` since the session recorded `current`.
 * A line changed since maps to the lines it replaced. Returns `undefined`
 * when the texts differ and their diff times out, since lines that aren't
 * mapped could select another change.
 */
async function mapLinesToCurrent(lines: LineRange, live: string, current: string, workerService: IEditorWorkerService): Promise<LineRange | undefined> {
	if (live === current) {
		return lines;
	}
	const edit = await computeEdit(current, live, workerService);
	if (!edit) {
		return undefined;
	}
	const originalText = new StringText(current);
	const modifiedText = new StringText(live);
	const changes = lineRangeMappingFromRangeMappings(RangeMapping.fromEdit(originalText.getTransformer().getTextEdit(edit)), originalText, modifiedText);
	const map = (line: number) => {
		let delta = 0;
		for (const change of changes) {
			if (line < change.modified.startLineNumber) {
				break;
			}
			if (line < change.modified.endLineNumberExclusive) {
				return Math.min(change.original.startLineNumber + line - change.modified.startLineNumber, Math.max(change.original.startLineNumber, change.original.endLineNumberExclusive - 1));
			}
			delta = change.original.endLineNumberExclusive - change.modified.endLineNumberExclusive;
		}
		return line + delta;
	};
	if (lines.isEmpty) {
		const line = map(lines.startLineNumber);
		return new LineRange(line, line);
	}
	const start = map(lines.startLineNumber);
	return new LineRange(start, Math.max(start, map(lines.endLineNumberExclusive - 1)) + 1);
}

/** The zero-based range of `lines`, which ends at the start of the line after them so it doesn't cover that line. */
function toTextRange(lines: LineRange): TextRange {
	const start = { line: lines.startLineNumber - 1, character: 0 };
	return { start, end: lines.isEmpty ? start : { line: lines.endLineNumberExclusive - 1, character: 0 } };
}

/** The edit that turns `original` into `modified`, as their diff spells it out, or `undefined` if the diff times out. */
async function computeEdit(original: string, modified: string, workerService: IEditorWorkerService): Promise<StringEdit | undefined> {
	if (original === modified) {
		return StringEdit.empty;
	}
	const diff = await workerService.computeStringEditFromDiffWithMetadata(original, modified, { maxComputationTimeMs: DIFF_TIMEOUT_MS }, 'advanced');
	return diff.isCoarse ? undefined : diff.edit;
}

function withLineEndings(text: string, eol: string): string {
	return text.replace(/\r\n|\r|\n/g, eol);
}

/**
 * Whether two versions of a Working Set file have the same changes: versions
 * are recorded content, which never changes, and the host's version of them.
 */
function isSameWorkingSetFile(a: IWorkingSetFileChange, b: IWorkingSetFileChange): boolean {
	return isEqual(a.diff.originalURI, b.diff.originalURI)
		&& isEqual(a.diff.modifiedSnapshotURI, b.diff.modifiedSnapshotURI)
		&& !!a.diff.isCreated === !!b.diff.isCreated
		&& a.nonce === b.nonce;
}

/** The files of a Working Set, with the version the host published for each. */
function toWorkingSetFileChanges(state: ChangesetState, connectionAuthority: string): IWorkingSetFileChange[] {
	return state.files.map(file => {
		const diff = agentHostChangesetFileToEntryDiff(file, connectionAuthority);
		return diff && { diff, nonce: file.nonce, editing: file.isEditing === true };
	}).filter(isDefined);
}

/** The Working Set once it's up to date, or `undefined` if it fails or doesn't update in time. */
async function whenReady(subscription: IAgentSubscription<ChangesetState>): Promise<ChangesetState | undefined> {
	const isSettled = (state: ChangesetState | Error | undefined) => state instanceof Error || state?.status === ChangesetStatus.Ready || state?.status === ChangesetStatus.Error;
	let state = subscription.value;
	if (!isSettled(state)) {
		const settled = Event.toPromise(Event.filter(Event.any(subscription.onDidChange, subscription.onDidError ?? Event.None), () => isSettled(subscription.value)));
		try {
			await raceTimeout(settled, WORKING_SET_READY_TIMEOUT_MS, () => settled.cancel());
		} finally {
			settled.cancel();
		}
		state = subscription.value;
	}
	return state instanceof Error || state?.status !== ChangesetStatus.Ready ? undefined : state;
}

async function completeIfCurrent(promise: Promise<((tx: ITransaction) => void) | undefined>, isCurrent: () => boolean): Promise<((tx: ITransaction) => void) | undefined> {
	try {
		const complete = await promise;
		return complete && (tx => {
			if (isCurrent()) {
				complete(tx);
			}
		});
	} catch (error) {
		if (isCancellationError(error)) {
			return undefined;
		}
		throw error;
	}
}

function resolutionEquals(a: IAgentHostSessionResolution | undefined, b: IAgentHostSessionResolution | undefined): boolean {
	return a === b || (!!a && !!b
		&& a.connection === b.connection
		&& a.connectionAuthority === b.connectionAuthority
		&& isEqual(a.backendSession, b.backendSession));
}

function workingSetEquals(a: IWorkingSet | undefined, b: IWorkingSet | undefined): boolean {
	return a === b || (!!a && !!b
		&& a.connection === b.connection
		&& a.connectionAuthority === b.connectionAuthority
		&& isEqual(a.channel, b.channel));
}
