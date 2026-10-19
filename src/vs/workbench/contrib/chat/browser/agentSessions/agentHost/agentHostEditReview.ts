/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler, SequencerByKey } from '../../../../../../base/common/async.js';
import { Disposable, DisposableMap, IReference } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { autorun, IObservable, IReader, observableValue } from '../../../../../../base/common/observable.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { DetailedLineRangeMapping } from '../../../../../../editor/common/diff/rangeMapping.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../../../editor/common/services/resolverService.js';
import { IModelContentChangedEvent } from '../../../../../../editor/common/textModelEvents.js';
import { localize } from '../../../../../../nls.js';
import { FileChangeType, IFileService } from '../../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IUriIdentityService } from '../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { UTF8, UTF8_with_bom } from '../../../../../services/textfile/common/encoding.js';
import { isTextFileEditorModel, ITextFileService } from '../../../../../services/textfile/common/textfiles.js';
import { IWorkingCopyService } from '../../../../../services/workingCopy/common/workingCopyService.js';
import { MultiDiffEditorInput } from '../../../../multiDiffEditor/browser/multiDiffEditorInput.js';
import { INotebookService } from '../../../../notebook/common/notebookService.js';
import { IChatExternalEdit, IChatService } from '../../../common/chatService/chatService.js';
import { ChatEditKind, getMultiDiffSourceUri, IChatEditingService, IChatEditingSession, IModifiedEntryTelemetryInfo, IModifiedFileEntry, ModifiedFileEntryState } from '../../../common/editing/chatEditingService.js';
import { ChatEditingModifiedDocumentEntry } from '../../chatEditing/chatEditingModifiedDocumentEntry.js';

/**
 * A review entry for a file an agent host edited on disk. Keeping only moves
 * the review baseline, because the agent host already wrote the file. Undoing
 * is a user edit that is saved right away, because agents read files from disk
 * rather than from unsaved editors.
 */
class AgentHostEditReviewEntry extends ChatEditingModifiedDocumentEntry {

	/**
	 * While the agent may be writing the file, only reloads from disk are its
	 * edits. Typing, refactorings and formatters stay the user's, so they are
	 * folded into the baseline instead of being offered for undo.
	 */
	protected override _isExternalEdit(event: IModelContentChangedEvent): boolean {
		return this._isExternalEditInProgress
			&& event.detailedReasons.length > 0
			&& event.detailedReasons.every(reason => reason.metadata.source === 'reloadFromDisk');
	}

	/** Editing an agent change keeps it, so that undoing never discards the user's text. */
	protected override _userEditsKeepAgentChanges(): boolean {
		return true;
	}

	/** Undoing a single change writes the file back to disk, like undoing all of them. */
	override get diffInfo() {
		return super.diffInfo.map(diff => ({
			...diff,
			undo: (change: DetailedLineRangeMapping) => this._undoAndSave(() => diff.undo(change)),
		}));
	}

	protected override async _doAccept(): Promise<void> {
		this._textModelChangeService.keep();
	}

	protected override async _doReject(): Promise<void> {
		if (this.createdInRequestId !== undefined && this.originalModel.getValueLength() === 0) {
			// Nothing in the file is kept or written by the user, so undoing its creation deletes it.
			return super._doReject();
		}
		// Restores the baseline, which holds what the user kept or wrote.
		await this._undoAndSave(async () => {
			this._textModelChangeService.undo();
			return true;
		});
	}

	/**
	 * Undoes changes and saves the result. The entry stays alive until saving
	 * finishes, even when the review drops it because nothing is left to decide.
	 */
	private async _undoAndSave(undo: () => Promise<boolean>): Promise<boolean> {
		this.acquire();
		try {
			const undone = await undo();
			// Saving a file that was deleted meanwhile would bring it back.
			if (undone && await this._fileService.exists(this.modifiedURI)) {
				await this.save();
			}
			return undone;
		} finally {
			this.dispose();
		}
	}
}

/**
 * Client-side review of the file edits an agent host makes, so they can be
 * kept or undone in the editor and the working set like local chat edits.
 *
 * The agent host owns edits: its SDK hooks snapshot each edit tool call, and
 * every completed edit arrives with the content the file had before it. The
 * first such snapshot becomes the baseline of a review entry, which compares
 * it with the live document. While a turn runs, reloads of reviewed files from
 * disk are attributed to the agent; every other change, and any change between
 * turns, is the user's and is folded into the baseline instead.
 *
 * Review state is local to this window and never changes the agent host's
 * changesets: an undo is an ordinary user edit, which Uncommitted and Branch
 * Changes show right away and Session Changes once the agent edits the file
 * again.
 */
export class AgentHostEditReview extends Disposable {

	private readonly _entries = new ResourceMap<AgentHostEditReviewEntry>();
	private readonly _entryListeners = this._register(new DisposableMap<AgentHostEditReviewEntry>());
	private readonly _entriesObs = observableValue<readonly AgentHostEditReviewEntry[]>(this, []);
	readonly entries: IObservable<readonly IModifiedFileEntry[]> = this._entriesObs;

	/** Turns being observed, with the number of observers of each. */
	private readonly _activeTurns = new Map<string, number>();
	/** Changes when the review is cleared, so that edits still being read are dropped. */
	private _epoch = 0;
	private readonly _editSequencer = new SequencerByKey<string>();
	private readonly _pendingEdits = new Set<Promise<void>>();
	private readonly _clearSettled = this._register(new RunOnceScheduler(() => this._clearIfSettled(), 0));

	constructor(
		readonly chatSessionResource: URI,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@ITextFileService private readonly _textFileService: ITextFileService,
		@IFileService private readonly _fileService: IFileService,
		@IChatService private readonly _chatService: IChatService,
		@IChatEditingService private readonly _chatEditingService: IChatEditingService,
		@IEditorService private readonly _editorService: IEditorService,
		@ILogService private readonly _logService: ILogService,
		@IWorkingCopyService private readonly _workingCopyService: IWorkingCopyService,
		@INotebookService private readonly _notebookService: INotebookService,
		@IUriIdentityService private readonly _uriIdentityService: IUriIdentityService,
	) {
		super();

		// Once every change is kept or undone the review is over. Dropping the
		// entries makes the next agent edit start from what the user decided.
		this._register(autorun(reader => {
			for (const entry of this._entriesObs.read(reader)) {
				entry.state.read(reader);
				entry.changesCount.read(reader);
			}
			this._clearSettled.schedule();
		}));

		// A file deleted outside of an edit the host reports leaves its document
		// with stale text, which undoing must not write back.
		this._register(this._fileService.onDidFilesChange(e => {
			if (!e.gotDeleted()) {
				return;
			}
			for (const entry of [...this._entries.values()]) {
				if (e.contains(entry.modifiedURI, FileChangeType.DELETED)) {
					this._removeEntry(entry);
				}
			}
		}));
	}

	get isTurnActive(): boolean {
		return this._activeTurns.size > 0;
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

	/**
	 * Marks the start of an agent turn: until it ends, reloads of reviewed
	 * files from disk are attributed to the agent.
	 */
	beginTurn(turnId: string): void {
		this._activeTurns.set(turnId, (this._activeTurns.get(turnId) ?? 0) + 1);
		for (const entry of this._entries.values()) {
			entry.startExternalEdit();
		}
	}

	/**
	 * Reviews the edits of a completed tool call. Only edits made while a turn
	 * is observed are reviewed, so restored history never reappears for review.
	 * Deletions and renames are not reviewable; the session's changesets show
	 * them.
	 */
	addEdits(turnId: string, edits: readonly IChatExternalEdit[]): Promise<void> {
		if (!this.isTurnActive || edits.length === 0) {
			return Promise.resolve();
		}
		const epoch = this._epoch;
		const work = Promise.all(edits.map(edit => this._toCanonicalEdit(edit)).map(edit => this._editSequencer.queue(edit.uri.toString(), async () => {
			try {
				await this._addEdit(turnId, edit, epoch);
			} catch (error) {
				this._logService.error(`[AgentHostEditReview] Failed to review the edit of ${edit.uri}`, error);
			}
		}))).then(() => undefined);
		this._pendingEdits.add(work);
		work.finally(() => this._pendingEdits.delete(work));
		return work;
	}

	/**
	 * Marks the end of an agent turn: syncs the reviewed documents with what
	 * the agent left on disk, then attributes all changes to the user again.
	 */
	async endTurn(turnId: string): Promise<void> {
		const observers = this._activeTurns.get(turnId);
		if (observers === undefined) {
			return;
		}
		if (observers > 1) {
			this._activeTurns.set(turnId, observers - 1);
			return;
		}
		this._activeTurns.delete(turnId);
		await Promise.all(this._pendingEdits);
		if (this._store.isDisposed || this.isTurnActive) {
			return;
		}
		try {
			for (const entry of [...this._entries.values()]) {
				if (!this._isReviewing(entry)) {
					continue;
				}
				const reviewable = await this._syncWithDisk(entry);
				if (this.isTurnActive) {
					return;
				}
				if (!reviewable || entry.originalModel.equalsTextBuffer(entry.modifiedModel.getTextBuffer())) {
					// The file is gone, the agent reverted its own change, or the user already undid it.
					this._removeEntry(entry);
				}
			}
		} finally {
			if (!this.isTurnActive) {
				// Whatever happened above, changes are the user's again.
				for (const entry of this._entries.values()) {
					entry.stopExternalEdit();
				}
			}
		}
	}

	/** Drops every entry, e.g. before restoring a checkpoint rewrites the files. */
	clear(): void {
		this._epoch++;
		const entries = [...this._entries.values()];
		this._entries.clear();
		this._entryListeners.clearAndDisposeAll();
		this._entriesObs.set([], undefined);
		for (const entry of entries) {
			entry.dispose();
		}
	}

	override dispose(): void {
		this.clear();
		super.dispose();
	}

	private async _addEdit(turnId: string, edit: IChatExternalEdit, epoch: number): Promise<void> {
		if (this._store.isDisposed || epoch !== this._epoch) {
			return;
		}
		if (edit.editKind === 'delete' || edit.editKind === 'rename' || !await this._fileService.exists(edit.uri)) {
			// Hosts may report a deletion as an edit. Dropping the review of a file
			// that is gone or moved keeps undo from writing a stale copy back.
			for (const uri of [edit.uri, edit.originalUri]) {
				const entry = uri && this._entries.get(uri);
				if (entry) {
					this._removeEntry(entry);
				}
			}
			return;
		}
		if (this._store.isDisposed || epoch !== this._epoch) {
			return;
		}

		let entry = this._entries.get(edit.uri);
		if (entry && entry.state.get() !== ModifiedFileEntryState.Modified) {
			// The user already decided on the earlier changes: review the file from its current content.
			this._removeEntry(entry);
			entry = undefined;
		}
		entry ??= await this._createEntry(turnId, edit, epoch);
		if (!entry) {
			return;
		}

		entry.startExternalEdit();
		if (!this.isTurnActive && !await this._syncWithDisk(entry)) {
			// The edit was reported after its turn ended, and the file is gone or no longer reviewed since.
			this._removeEntry(entry);
		}
	}

	private async _createEntry(turnId: string, edit: IChatExternalEdit, epoch: number): Promise<AgentHostEditReviewEntry | undefined> {
		if (!this._canReview(edit.uri)) {
			return undefined;
		}

		const initialContent = edit.editKind === 'create' ? '' : await this._readBeforeContent(edit);
		if (initialContent === undefined || this._store.isDisposed || epoch !== this._epoch) {
			return undefined;
		}

		let ref: IReference<IResolvedTextEditorModel>;
		try {
			ref = await this._textModelService.createModelReference(edit.uri);
		} catch (error) {
			this._logService.warn(`[AgentHostEditReview] Could not open ${edit.uri} for review`, error);
			return undefined;
		}
		// The user may have typed, or another chat started reviewing the file, while it was read.
		if (this._store.isDisposed || epoch !== this._epoch || !this._canReview(edit.uri) || !this._hasSupportedEncoding(ref.object)) {
			ref.dispose();
			return undefined;
		}

		const entry = this._instantiationService.createInstance(
			AgentHostEditReviewEntry,
			ref,
			{ collapse: () => { } },
			this._getTelemetryInfo(turnId),
			edit.editKind === 'create' ? ChatEditKind.Created : ChatEditKind.Modified,
			initialContent,
		);
		entry.startExternalEdit();
		// Agent edits wait for a decision, whatever the auto-accept delay.
		entry.enableReviewModeUntilSettled();
		// Undoing a file the agent created deletes it.
		this._entryListeners.set(entry, entry.onDidDelete(() => this._removeEntry(entry)));
		this._entries.set(entry.modifiedURI, entry);
		this._entriesObs.set([...this._entries.values()], undefined);
		return entry;
	}

	/** Whether a file can be reviewed now. Checked again after reading it, because the user and other chats go on meanwhile. */
	private _canReview(uri: URI): boolean {
		if (this._notebookService.hasSupportedNotebooks(uri)) {
			// Notebooks are edited through their own working copies, which a text review can't follow.
			this._logService.info(`[AgentHostEditReview] Not reviewing ${uri} because it is a notebook`);
			return false;
		}
		if (this._workingCopyService.isDirty(uri)) {
			// Never present the user's unsaved text as the agent's change, nor discard it later.
			this._logService.info(`[AgentHostEditReview] Not reviewing ${uri} because it has unsaved changes`);
			return false;
		}
		if (this._isReviewedElsewhere(uri)) {
			this._logService.info(`[AgentHostEditReview] Not reviewing ${uri} because another chat is reviewing it`);
			return false;
		}
		return true;
	}

	/**
	 * The agent host decodes its snapshots as UTF-8, so only UTF-8 documents
	 * can be restored from them without corrupting the file.
	 */
	private _hasSupportedEncoding(model: IResolvedTextEditorModel): boolean {
		const encoding = isTextFileEditorModel(model) ? model.getEncoding() : undefined;
		if (encoding === UTF8 || encoding === UTF8_with_bom) {
			return true;
		}
		this._logService.info(`[AgentHostEditReview] Not reviewing ${model.textEditorModel.uri} because its encoding is ${encoding ?? 'unknown'}`);
		return false;
	}

	/** Reads the baseline of a review. Without it, an undo could not know what to restore. */
	private async _readBeforeContent(edit: IChatExternalEdit): Promise<string | undefined> {
		if (!edit.beforeContentUri) {
			this._logService.warn(`[AgentHostEditReview] Not reviewing ${edit.uri} because its content before the edit is unknown`);
			return undefined;
		}
		let content: string;
		try {
			content = (await this._fileService.readFile(edit.beforeContentUri)).value.toString();
		} catch (error) {
			this._logService.warn(`[AgentHostEditReview] Not reviewing ${edit.uri} because its content before the edit could not be read`, error);
			return undefined;
		}
		// The agent host decodes snapshots as UTF-8 and replaces what it can't
		// decode, so restoring a file that wasn't UTF-8 text would corrupt it.
		if (content.includes('\uFFFD') || content.includes('\0')) {
			this._logService.info(`[AgentHostEditReview] Not reviewing ${edit.uri} because its content before the edit is not UTF-8 text`);
			return undefined;
		}
		return content;
	}

	/**
	 * Reloads a document from disk while its reloads are attributed to the
	 * agent. Unsaved documents are left alone so the user's text is kept.
	 *
	 * @returns Whether the entry can still be reviewed. It can't when its file
	 * is gone, which leaves its document with stale text, or when the review
	 * dropped it meanwhile.
	 */
	private async _syncWithDisk(entry: AgentHostEditReviewEntry): Promise<boolean> {
		const exists = await this._fileService.exists(entry.modifiedURI);
		if (!this._isReviewing(entry)) {
			return false;
		}
		if (exists && !this._textFileService.isDirty(entry.modifiedURI)) {
			try {
				await entry.revertToDisk();
			} catch (error) {
				this._logService.warn(`[AgentHostEditReview] Could not reload ${entry.modifiedURI} from disk`, error);
			}
		}
		if (!this.isTurnActive) {
			entry.stopExternalEdit();
		}
		return exists && this._isReviewing(entry);
	}

	private _isReviewing(entry: AgentHostEditReviewEntry): boolean {
		return this._entries.get(entry.modifiedURI) === entry;
	}

	/** Documents have canonical URIs, e.g. with the casing a file was first opened with. */
	private _toCanonicalEdit(edit: IChatExternalEdit): IChatExternalEdit {
		return {
			...edit,
			uri: this._uriIdentityService.asCanonicalUri(edit.uri),
			originalUri: edit.originalUri && this._uriIdentityService.asCanonicalUri(edit.originalUri),
		};
	}

	private _removeEntry(entry: AgentHostEditReviewEntry): void {
		if (!this._isReviewing(entry)) {
			return;
		}
		this._entries.delete(entry.modifiedURI);
		this._entryListeners.deleteAndDispose(entry);
		this._entriesObs.set([...this._entries.values()], undefined);
		entry.dispose();
	}

	private _clearIfSettled(): void {
		if (this.isTurnActive || this._pendingEdits.size > 0) {
			return;
		}
		for (const entry of [...this._entries.values()]) {
			if (entry.state.get() === ModifiedFileEntryState.Modified && entry.changesCount.get() === 0 && entry.originalModel.equalsTextBuffer(entry.modifiedModel.getTextBuffer())) {
				// The user's edits kept every agent change, so nothing is left to decide.
				this._removeEntry(entry);
			}
		}
		if (this._entries.size === 0) {
			return;
		}
		for (const entry of this._entries.values()) {
			if (entry.state.get() === ModifiedFileEntryState.Modified) {
				return;
			}
		}
		this.clear();
	}

	/** Only one chat reviews a file, so that the editor shows a single set of changes for it. */
	private _isReviewedElsewhere(uri: URI): boolean {
		return this._chatEditingService.editingSessionsObs.get().some(session =>
			!isEqual(session.chatSessionResource, this.chatSessionResource)
			&& session.getEntry(uri)?.state.get() === ModifiedFileEntryState.Modified);
	}

	private _getEntries(uris: readonly URI[]): readonly AgentHostEditReviewEntry[] {
		const entries = [...this._entries.values()];
		return uris.length === 0 ? entries : entries.filter(entry => uris.some(uri => isEqual(entry.modifiedURI, uri)));
	}

	private _getTelemetryInfo(turnId: string): IModifiedEntryTelemetryInfo {
		const response = this._chatService.getSession(this.chatSessionResource)?.getRequests().find(request => request.id === turnId)?.response;
		return {
			agentId: response?.agent?.id,
			command: response?.slashCommand?.name,
			sessionResource: this.chatSessionResource,
			requestId: turnId,
			get result() { return response?.result; },
			modelId: response?.request?.modelId,
			modeId: response?.request?.modeInfo?.telemetryModeId,
			applyCodeBlockSuggestionId: undefined,
			feature: 'sideBarChat',
		};
	}
}
