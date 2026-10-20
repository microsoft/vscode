/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout, Sequencer } from '../../../../../../base/common/async.js';
import { toErrorMessage } from '../../../../../../base/common/errorMessage.js';
import { CancellationError, isCancellationError } from '../../../../../../base/common/errors.js';
import { Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore, IReference } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap, ResourceSet } from '../../../../../../base/common/map.js';
import { autorun, constObservable, derived, derivedOpts, IObservable, IReader, observableSignalFromEvent, observableValue } from '../../../../../../base/common/observable.js';
import { basename, isEqual } from '../../../../../../base/common/resources.js';
import { splitLines } from '../../../../../../base/common/strings.js';
import { isDefined } from '../../../../../../base/common/types.js';
import { URI } from '../../../../../../base/common/uri.js';
import { StringEdit, StringReplacement } from '../../../../../../editor/common/core/edits/stringEdit.js';
import { LineRange } from '../../../../../../editor/common/core/ranges/lineRange.js';
import { StringText } from '../../../../../../editor/common/core/text/abstractText.js';
import { LinesDiff } from '../../../../../../editor/common/diff/linesDiffComputer.js';
import { linesDiffComputers } from '../../../../../../editor/common/diff/linesDiffComputers.js';
import { DetailedLineRangeMapping } from '../../../../../../editor/common/diff/rangeMapping.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../../../editor/common/services/resolverService.js';
import { localize } from '../../../../../../nls.js';
import { AGENT_HOST_ACCEPT_CHANGES_OPERATION_ID, AGENT_HOST_DISCARD_CHANGES_OPERATION_ID } from '../../../../../../platform/agentHost/common/agentHostChangesetOperationService.js';
import { IAgentHostConnectionsService, IAgentHostSessionResolution } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { isCopilotAgentHostProvider } from '../../../../../../platform/agentHost/common/agentHostSessionType.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { ChangesetKind, resolveChangesetUriTemplate } from '../../../../../../platform/agentHost/common/changesetUri.js';
import { IAgentSubscription, observableFromSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { ChangesetOperationScope, ChangesetOperationStatus, ChangesetOperationTargetKind, ChangesetState, ChangesetStatus, SessionState, StateComponents, type TextRange } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IUriIdentityService } from '../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { EditorsOrder, isDiffEditorInput, SaveReason } from '../../../../../common/editor.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { UTF8, UTF8_with_bom } from '../../../../../services/textfile/common/encoding.js';
import { isTextFileEditorModel, ITextFileService } from '../../../../../services/textfile/common/textfiles.js';
import { MultiDiffEditorInput } from '../../../../multiDiffEditor/browser/multiDiffEditorInput.js';
import { INotebookService } from '../../../../notebook/common/notebookService.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { ChatEditKind, getMultiDiffSourceUri, IChatEditingSession, IEditSessionEntryDiff, IModifiedEntryTelemetryInfo, IModifiedFileEntry, ModifiedFileEntryState } from '../../../common/editing/chatEditingService.js';
import { isUntitledChatSession } from '../../../common/model/chatUri.js';
import { ChatEditingModifiedDocumentEntry } from '../../chatEditing/chatEditingModifiedDocumentEntry.js';
import { agentHostChangesetFileToEntryDiff } from './agentHostResponseFileChanges.js';
import { IAgentHostUntitledProvisionalSessionService } from './agentHostUntitledProvisionalSessionService.js';

/** How long diffs between versions of a file may take before the file is compared as a whole. */
const DIFF_TIMEOUT_MS = 1000;

/** How long an operation waits for the Working Set to finish updating. */
const WORKING_SET_READY_TIMEOUT_MS = 30_000;

/** A file of the session's Working Set, as last read from the agent host. */
interface IWorkingSetFile {
	readonly diff: IEditSessionEntryDiff;
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
	connect(operations: IWorkingSetOperations, file: IWorkingSetFile): void {
		this._operations = operations;
		this._file = file;
		// Before the first diff starts, the original takes the document's line endings, which edits map onto.
		this._matchLineEndings();
		this._register(this.modifiedModel.onDidChangeContent(e => {
			if (e.isEolChange) {
				this._matchLineEndings();
			}
		}));
	}

	/** Compares the document with the latest version of its Working Set file. */
	async update(file: IWorkingSetFile): Promise<void> {
		this._file = file;
		const reset = this._resetOriginalContent(getReviewedOriginal(file, this.modifiedModel));
		// The reset replaced the original synchronously, and its diff starts after this.
		this._matchLineEndings();
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
		return unlessCancelled(super.acceptDeferred());
	}

	/** Changes the agent host didn't undo stay undecided. */
	override rejectDeferred() {
		return unlessCancelled(super.rejectDeferred());
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
 * Working Set the entries then follow. Session, turn and branch changesets
 * reflect an undo as soon as the host records it.
 */
export class AgentHostEditReview extends Disposable implements IWorkingSetOperations {

	private readonly _entries = new ResourceMap<AgentHostEditReviewEntry>();
	private readonly _entriesObs = observableValue<readonly AgentHostEditReviewEntry[]>(this, []);
	readonly entries: IObservable<readonly IModifiedFileEntry[]> = this._entriesObs;

	private readonly _workingSet: IObservable<(IWorkingSet & { readonly subscription: IAgentSubscription<ChangesetState>; readonly state: IObservable<ChangesetState | undefined> }) | undefined>;
	/** Follows the Working Set one update at a time. */
	private readonly _updates = new Sequencer();
	/** Runs operations one at a time, since each one changes the Working Set the next one checks. */
	private readonly _operations = new Sequencer();
	/** Entries that left the review, until the diff editors that compare with them close. */
	private readonly _leavingEntries = this._register(new DisposableStore());

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
		@INotebookService private readonly _notebookService: INotebookService,
		@IUriIdentityService private readonly _uriIdentityService: IUriIdentityService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

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
			// Like the editor working set, the review follows the Working Set of Copilot sessions.
			const changeset = current && isCopilotAgentHostProvider(state?.provider)
				? state?.changesets?.find(candidate => candidate.changeKind === ChangesetKind.WorkingSet && !candidate.uriTemplate.includes('{'))
				: undefined;
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
			return { ...current, subscription, state: observableFromSubscription(this, subscription) };
		});
		this._register(autorun(reader => {
			const current = this._workingSet.read(reader);
			const state = current?.state.read(reader);
			if (current && state?.status !== ChangesetStatus.Ready) {
				// While the Working Set updates, its files are the previous ones.
				return;
			}
			const files = current && state
				? state.files.map(file => agentHostChangesetFileToEntryDiff(file, current.connectionAuthority)).filter(isDefined)
				: [];
			this._updates.queue(() => this._update(files));
		}));
	}

	getEntry(uri: URI): IModifiedFileEntry | undefined {
		return this._entries.get(uri);
	}

	readEntry(uri: URI, reader: IReader): IModifiedFileEntry | undefined {
		this._entriesObs.read(reader);
		return this._entries.get(uri);
	}

	async accept(...uris: URI[]): Promise<void> {
		await Promise.all(this._getEntries(uris).map(entry => entry.accept()));
	}

	async reject(...uris: URI[]): Promise<void> {
		await Promise.all(this._getEntries(uris).map(entry => entry.reject()));
	}

	async show(session: IChatEditingSession, previousChanges?: boolean): Promise<void> {
		const input = MultiDiffEditorInput.fromResourceMultiDiffEditorInput({
			multiDiffSource: getMultiDiffSourceUri(session, previousChanges),
			label: localize('agentHostEditReview.multiDiff', "Suggested Edits"),
		}, this._instantiationService);
		await this._editorService.openEditor(input, { pinned: true });
	}

	keep(entry: AgentHostEditReviewEntry, change?: DetailedLineRangeMapping): Promise<boolean> {
		return this._invoke(entry, AGENT_HOST_ACCEPT_CHANGES_OPERATION_ID, change, (fileName, message) => localize('agentHostEditReview.keepFailed', "Could not keep the changes to '{0}': {1}", fileName, message));
	}

	undo(entry: AgentHostEditReviewEntry, change?: DetailedLineRangeMapping): Promise<boolean> {
		return this._invoke(entry, AGENT_HOST_DISCARD_CHANGES_OPERATION_ID, change, (fileName, message) => localize('agentHostEditReview.undoFailed', "Could not undo the changes to '{0}': {1}", fileName, message));
	}

	override dispose(): void {
		const entries = [...this._entries.values()];
		this._entries.clear();
		this._entriesObs.set([], undefined);
		for (const entry of entries) {
			entry.dispose();
		}
		super.dispose();
	}

	/** Follows the files of the Working Set: reviews new ones, updates changed ones, and drops those that left it. */
	private async _update(files: readonly IEditSessionEntryDiff[]): Promise<void> {
		const listed = new ResourceSet();
		for (const file of files) {
			// A deleted file has no document to review; the working set lists it.
			if (file.isDeleted || this._store.isDisposed) {
				continue;
			}
			const resource = this._uriIdentityService.asCanonicalUri(file.modifiedURI);
			listed.add(resource);
			try {
				await this._updateFile(resource, file);
			} catch (error) {
				this._logService.error(`[AgentHostEditReview] Could not review ${resource}`, error);
			}
		}
		for (const entry of [...this._entries.values()]) {
			if (!listed.has(entry.modifiedURI)) {
				this._removeEntry(entry);
			}
		}
	}

	private async _updateFile(resource: URI, diff: IEditSessionEntryDiff): Promise<void> {
		const existing = this._entries.get(resource);
		if (existing && isSameWorkingSetFile(existing.file.diff, diff)) {
			return;
		}
		const contents = await this._readContents(diff);
		const entry = this._entries.get(resource);
		if (this._store.isDisposed) {
			return;
		}
		if (!contents) {
			if (entry) {
				this._removeEntry(entry);
			}
			return;
		}
		if (entry?.state.get() === ModifiedFileEntryState.Modified) {
			await entry.update({ diff, ...contents });
			entry.updateTelemetryInfo(this._getTelemetryInfo());
			return;
		}
		if (entry) {
			// The user decided on the earlier changes, so the file is reviewed anew.
			this._removeEntry(entry);
		}
		await this._createEntry(resource, { diff, ...contents });
	}

	private async _createEntry(resource: URI, file: IWorkingSetFile): Promise<void> {
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
		if (this._store.isDisposed || this._entries.has(resource) || !this._hasSupportedEncoding(ref.object)) {
			ref.dispose();
			return;
		}
		const entry = this._instantiationService.createInstance(
			AgentHostEditReviewEntry,
			ref,
			{ collapse: () => { } },
			this._getTelemetryInfo(),
			file.diff.isCreated ? ChatEditKind.Created : ChatEditKind.Modified,
			getReviewedOriginal(file, ref.object.textEditorModel),
		);
		entry.connect(this, file);
		// Agent changes wait for a decision, whatever the auto-accept delay.
		entry.enableReviewModeUntilSettled();
		this._entries.set(entry.modifiedURI, entry);
		this._entriesObs.set([...this._entries.values()], undefined);
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
		return text.includes('\uFFFD') || text.includes('\0') ? undefined : text;
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

	/**
	 * Asks the agent host to accept or discard the changes of `entry` in the
	 * Working Set: the changes of the hunk `change`, or all of them. Failures
	 * are reported. Resolves to whether the host did.
	 */
	private _invoke(entry: AgentHostEditReviewEntry, operationId: string, change: DetailedLineRangeMapping | undefined, failed: (fileName: string, message: string) => string): Promise<boolean> {
		return this._operations.queue(async () => {
			try {
				return await this._doInvoke(entry, operationId, change);
			} catch (error) {
				this._notificationService.error(failed(basename(entry.modifiedURI), toErrorMessage(error)));
				return false;
			}
		});
	}

	private async _doInvoke(entry: AgentHostEditReviewEntry, operationId: string, change: DetailedLineRangeMapping | undefined): Promise<boolean> {
		// The editor shows the Working Set as of its last update, and an operation must target what the user saw.
		for (let attempt = 0; ; attempt++) {
			await this._updates.queue(async () => { });
			if (!this._isReviewing(entry) || (change && !entry.diffInfo.get().changes.includes(change))) {
				// The change was decided, or replaced by a newer one, since it was shown.
				return false;
			}
			const workingSet = this._workingSet.get();
			const state = workingSet && await whenReady(workingSet.subscription);
			if (!workingSet || !state) {
				throw new Error(localize('agentHostEditReview.notReady', "The session's changes couldn't be checked. Try again."));
			}
			const file = state.files
				.map(candidate => agentHostChangesetFileToEntryDiff(candidate, workingSet.connectionAuthority))
				.find(candidate => candidate && isEqual(this._uriIdentityService.asCanonicalUri(candidate.modifiedURI), entry.modifiedURI));
			if (!file) {
				// The file left the Working Set, as when it was kept elsewhere.
				return false;
			}
			if (!isSameWorkingSetFile(file, entry.file.diff)) {
				if (attempt === 0) {
					// The entry follows the Working Set next.
					continue;
				}
				throw new Error(localize('agentHostEditReview.changed', "The changes were updated in the meantime. Try again."));
			}
			await this._invokeOperation(workingSet, entry, operationId, state, change && !file.isCreated ? change : undefined);
			return true;
		}
	}

	private async _invokeOperation(workingSet: IWorkingSet, entry: AgentHostEditReviewEntry, operationId: string, state: ChangesetState, change: DetailedLineRangeMapping | undefined): Promise<void> {
		// A created file has no lines to compare with, so its changes are kept or undone as a whole.
		const scope = change ? ChangesetOperationScope.Range : ChangesetOperationScope.Resource;
		const operation = state.operations?.find(candidate => candidate.id === operationId && candidate.scopes.includes(scope));
		if (!operation) {
			throw new Error(localize('agentHostEditReview.unsupported', "The agent host doesn't support this."));
		}
		if (operation.status === ChangesetOperationStatus.Disabled) {
			// The agent host disables its operations while a turn runs.
			throw new Error(localize('agentHostEditReview.busy', "Try again once the agent has finished working."));
		}
		const resource = workingSet.connection.resourceUris.toAgentHost(entry.modifiedURI).toString();
		const range = change && toTextRange(mapLinesToCurrent(change.modified, entry.modifiedModel.getValue(), withLineEndings(entry.file.current, entry.modifiedModel.getEOL())));
		if (operationId === AGENT_HOST_DISCARD_CHANGES_OPERATION_ID && this._textFileService.isDirty(entry.modifiedURI)) {
			// The agent host reverts the changes on disk, so the document's unsaved text goes there first.
			await this._textFileService.save(entry.modifiedURI, { reason: SaveReason.EXPLICIT, skipSaveParticipants: true });
		}
		await workingSet.connection.invokeChangesetOperation({
			channel: workingSet.channel.toString(),
			operationId,
			target: range
				? { kind: ChangesetOperationTargetKind.Range, resource, side: 'after', range }
				: { kind: ChangesetOperationTargetKind.Resource, resource },
		});
	}

	private _isReviewing(entry: AgentHostEditReviewEntry): boolean {
		return this._entries.get(entry.modifiedURI) === entry;
	}

	private _removeEntry(entry: AgentHostEditReviewEntry): void {
		if (!this._isReviewing(entry)) {
			return;
		}
		this._entries.delete(entry.modifiedURI);
		this._entriesObs.set([...this._entries.values()], undefined);
		// Like those of local chat edits once they're kept or undone, the entry's diff editors close,
		// and they must let go of its original before it's disposed.
		const diffEditors = this._editorService.getEditors(EditorsOrder.SEQUENTIAL)
			.filter(({ editor }) => isDiffEditorInput(editor) && isEqual(editor.original.resource, entry.originalURI));
		if (diffEditors.length === 0) {
			entry.dispose();
			return;
		}
		this._leavingEntries.add(entry);
		void this._editorService.closeEditors(diffEditors).finally(() => {
			if (!this._store.isDisposed) {
				this._leavingEntries.delete(entry);
			}
		});
	}

	private _getEntries(uris: readonly URI[]): readonly AgentHostEditReviewEntry[] {
		const entries = [...this._entries.values()];
		return uris.length === 0 ? entries : entries.filter(entry => uris.some(uri => isEqual(entry.modifiedURI, uri)));
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
function getReviewedOriginal(file: IWorkingSetFile, model: ITextModel): string {
	const eol = model.getEOL();
	const baseline = withLineEndings(file.baseline, eol);
	const current = withLineEndings(file.current, eol);
	const live = model.getValue();
	if (live === current) {
		return baseline;
	}
	const agent = computeEdit(baseline, current);
	const user = computeEdit(current, live);
	return agent && user ? user.rebaseSkipConflicting(agent.inverse(baseline)).apply(baseline) : baseline;
}

/**
 * The lines of `current` that the lines `lines` of `live` correspond to,
 * through the changes made to `live` since the session recorded `current`.
 * A line changed since maps to the lines it replaced.
 */
function mapLinesToCurrent(lines: LineRange, live: string, current: string): LineRange {
	const diff = live === current ? undefined : computeLinesDiff(current, live);
	if (!diff) {
		return lines;
	}
	const map = (line: number) => {
		let delta = 0;
		for (const change of diff.changes) {
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
function computeEdit(original: string, modified: string): StringEdit | undefined {
	const diff = computeLinesDiff(original, modified);
	if (!diff || diff.changes.some(change => !change.innerChanges)) {
		return undefined;
	}
	const originalText = new StringText(original);
	const modifiedText = new StringText(modified);
	return new StringEdit(diff.changes.flatMap(change => change.innerChanges!).map(inner =>
		new StringReplacement(originalText.getTransformer().getOffsetRange(inner.originalRange), modifiedText.getValueOfRange(inner.modifiedRange))));
}

/** Diffs texts like the agent host diffs a Working Set into hunks. */
function computeLinesDiff(original: string, modified: string): LinesDiff | undefined {
	const diff = linesDiffComputers.getDefault().computeDiff(splitLines(original), splitLines(modified), { ignoreTrimWhitespace: false, computeMoves: false, maxComputationTimeMs: DIFF_TIMEOUT_MS });
	return diff.hitTimeout ? undefined : diff;
}

function withLineEndings(text: string, eol: string): string {
	return text.replace(/\r\n|\r|\n/g, eol);
}

/** Whether two versions of a Working Set file have the same changes: versions are recorded content, which never changes. */
function isSameWorkingSetFile(a: IEditSessionEntryDiff, b: IEditSessionEntryDiff): boolean {
	return isEqual(a.originalURI, b.originalURI) && isEqual(a.modifiedSnapshotURI, b.modifiedSnapshotURI) && !!a.isCreated === !!b.isCreated;
}

/** The Working Set once it's up to date, or `undefined` if it fails or doesn't update in time. */
async function whenReady(subscription: IAgentSubscription<ChangesetState>): Promise<ChangesetState | undefined> {
	const isSettled = (state: ChangesetState | Error | undefined) => state instanceof Error || state?.status === ChangesetStatus.Ready || state?.status === ChangesetStatus.Error;
	let state = subscription.value;
	if (!isSettled(state)) {
		const settled = Event.toPromise(Event.filter(subscription.onDidChange, isSettled));
		state = await raceTimeout(settled, WORKING_SET_READY_TIMEOUT_MS, () => settled.cancel());
	}
	return state instanceof Error || state?.status !== ChangesetStatus.Ready ? undefined : state;
}

async function unlessCancelled<T>(promise: Promise<T>): Promise<T | undefined> {
	try {
		return await promise;
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
