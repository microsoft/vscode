/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError, raceTimeout, Sequencer } from '../../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { cancelOnDispose, CancellationToken } from '../../../../../../base/common/cancellation.js';
import { LcsDiff } from '../../../../../../base/common/diff/diff.js';
import { toErrorMessage } from '../../../../../../base/common/errorMessage.js';
import { CancellationError, isCancellationError } from '../../../../../../base/common/errors.js';
import { Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableResourceMap, DisposableStore, IDisposable, IReference } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap, ResourceSet } from '../../../../../../base/common/map.js';
import { autorun, constObservable, derived, derivedOpts, IObservable, IReader, ISettableObservable, ITransaction, observableFromEvent, observableSignalFromEvent, observableValue, transaction } from '../../../../../../base/common/observable.js';
import { basename, isEqual } from '../../../../../../base/common/resources.js';
import { filter, equals as objectEquals } from '../../../../../../base/common/objects.js';
import { stripUTF8BOM } from '../../../../../../base/common/strings.js';
import { isDefined, isEmptyObject } from '../../../../../../base/common/types.js';
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
import { ChangesetFileStatus, ChangesetOperationScope, ChangesetOperationStatus, ChangesetOperationTargetKind, ChangesetState, ChangesetStatus, SessionState, StateComponents, type TextRange } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { getChangesetFileStatus } from '../../../../../../platform/agentHost/common/agentHostProtocolTransition.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IUriIdentityService } from '../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { EditorsOrder, IEditorIdentifier, isDiffEditorInput, SaveReason } from '../../../../../common/editor.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { UTF8, UTF8_with_bom } from '../../../../../services/textfile/common/encoding.js';
import { isTextFileEditorModel, ITextFileService, TextFileReconcileResult } from '../../../../../services/textfile/common/textfiles.js';
import { SnapshotContext } from '../../../../../services/workingCopy/common/fileWorkingCopy.js';
import { MultiDiffEditorInput } from '../../../../multiDiffEditor/browser/multiDiffEditorInput.js';
import { NotebookCellTextModel } from '../../../../notebook/common/model/notebookCellTextModel.js';
import { NotebookTextModel } from '../../../../notebook/common/model/notebookTextModel.js';
import { ICellOutput, IOutputDto, IResolvedNotebookEditorModel, NotebookCellMetadata, NotebookCellsChangeType, NotebookData, TransientOptions } from '../../../../notebook/common/notebookCommon.js';
import { INotebookEditorModelResolverService } from '../../../../notebook/common/notebookEditorModelResolverService.js';
import { INotebookService } from '../../../../notebook/common/notebookService.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { ChatEditKind, getMultiDiffSourceUri, IChatEditingSession, IEditSessionEntryDiff, IModifiedEntryTelemetryInfo, IModifiedFileEntry, ModifiedFileEntryState } from '../../../common/editing/chatEditingService.js';
import { IChatResponseModel } from '../../../common/model/chatModel.js';
import { isUntitledChatSession } from '../../../common/model/chatUri.js';
import { ChatEditingModifiedDocumentEntry } from '../../chatEditing/chatEditingModifiedDocumentEntry.js';
import { AbstractChatEditingModifiedFileEntry } from '../../chatEditing/chatEditingModifiedFileEntry.js';
import { ChatEditingModifiedNotebookEntry } from '../../chatEditing/chatEditingModifiedNotebookEntry.js';
import { createSnapshot } from '../../chatEditing/notebook/chatEditingModifiedNotebookSnapshot.js';
import { ICellDiffInfo } from '../../chatEditing/notebook/notebookCellChanges.js';
import { hasNotebookFileSources, INotebookFileLines, locateNotebookFileChange, NotebookFileChangeFailure, readNotebookFile } from './agentHostNotebookFileChanges.js';
import { agentHostChangesetFileToEntryDiff, getAgentHostResourceAuthority } from './agentHostResponseFileChanges.js';
import { IAgentHostUntitledProvisionalSessionService } from './agentHostUntitledProvisionalSessionService.js';
import { AgentHostCheckpointReview, IAgentHostCheckpointReviewSource } from './agentHostCheckpointReview.js';

/** How long diffs between versions of a file may take before the file is compared as a whole. */
const DIFF_TIMEOUT_MS = 1000;

/** How long an operation waits for the Working Set to finish updating. */
const WORKING_SET_READY_TIMEOUT_MS = 30_000;

/** The notebooks of ipynb files, the lines of which hold their cells. */
const JUPYTER_NOTEBOOK_VIEW_TYPE = 'jupyter-notebook';

class EditReviewSynchronizationError extends Error { }
class EditReviewSupersededError extends EditReviewSynchronizationError { }

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
	/** The authority of the agent host content URIs of its files' recorded contents, as from {@link getAgentHostResourceAuthority}. */
	readonly resourceAuthority: string;
	readonly channel: URI;
}

/** A change of a reviewed notebook that is kept or undone on its own. */
type NotebookCellChange =
	/** The hunk `change` of the source of the cell `cell`, or all of its hunks. */
	| { readonly kind: 'modified'; readonly cell: NotebookCellTextModel; readonly change: DetailedLineRangeMapping | undefined }
	/** The added cell `cell`. */
	| { readonly kind: 'insert'; readonly cell: NotebookCellTextModel }
	/** The removed cell `cell`, of the notebook that the reviewed one is compared with. */
	| { readonly kind: 'delete'; readonly cell: NotebookCellTextModel };

/** A change of a review entry that is kept or undone on its own: a hunk of a document, or a change of a notebook. */
type ReviewChange = DetailedLineRangeMapping | NotebookCellChange;

/** Keeps and undoes the changes of review entries with the agent host. */
interface IWorkingSetOperations {
	keep(entry: ReviewEntry, change?: ReviewChange): Promise<boolean>;
	undo(entry: ReviewEntry, change?: ReviewChange): Promise<boolean>;
}

/**
 * Whether an agent's edit tool call is writing the file of a review entry.
 * As while local chat edits stream into a file, the editor is read-only,
 * the changes can't be kept or undone, and changes of the document, as
 * when it reloads what the agent wrote, are the agent's meanwhile. The
 * agent host reports which file is written, not which chat response
 * writes it.
 */
class AgentEditState {

	private _editing = false;
	private _reloads = 0;

	constructor(
		private readonly _entry: Pick<AbstractChatEditingModifiedFileEntry, 'startExternalEdit' | 'stopExternalEdit'>,
		private readonly _isCurrentlyBeingModifiedBy: ISettableObservable<{ responseModel: IChatResponseModel | undefined; undoStopId: string | undefined } | undefined>,
		private readonly _waitsForLastEdits: ISettableObservable<boolean>,
	) { }

	get editing(): boolean {
		return this._editing;
	}

	/** Marks the file as being written by an agent's edit tool call, or not. */
	setEditing(editing: boolean): void {
		this._editing = editing;
		this._updateExternalEdit();
		if (!!this._isCurrentlyBeingModifiedBy.get() === editing) {
			return;
		}
		transaction(tx => {
			this._isCurrentlyBeingModifiedBy.set(editing ? { responseModel: undefined, undoStopId: undefined } : undefined, tx);
			this._waitsForLastEdits.set(editing, tx);
		});
	}

	/** Runs `task`, which reloads what the agent wrote into the document, with the document's changes counting as the agent's. */
	async runAsAgentEdit(task: () => Promise<void>): Promise<void> {
		this._reloads++;
		this._updateExternalEdit();
		try {
			await task();
		} finally {
			this._reloads--;
			this._updateExternalEdit();
		}
	}

	/** Local chat counts the changes of a document as an agent's while the agent edits its file on disk. */
	private _updateExternalEdit(): void {
		if (this._editing || this._reloads > 0) {
			this._entry.startExternalEdit();
		} else {
			this._entry.stopExternalEdit();
		}
	}
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
	connect(operations: IWorkingSetOperations, file: IWorkingSetFile, edit: StringEdit, refreshReview: () => void): void {
		this._operations = operations;
		this._file = file;
		// Before the first diff starts, the original takes the document's line endings, which edits map onto.
		this._matchLineEndings();
		this._mapOriginalToModified(edit);
		this._register(this.modifiedModel.onDidChangeContent(e => {
			if (e.isEolChange) {
				this._matchLineEndings();
			}
			if (!this._isExternalEditInProgress && (e.isUndoing || e.isRedoing || e.detailedReasons.some(reason => reason.metadata.source === 'reloadFromDisk'))) {
				refreshReview();
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

	/** Whether the review still shows `change`, which the user's typing can replace. */
	shows(change: ReviewChange): boolean {
		return change instanceof DetailedLineRangeMapping && this.diffInfo.get().changes.includes(change);
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

	/** The agent host decides what is undone, so a document back at its baseline, as while its changes are stashed, stays undecided. */
	protected override _rejectsWhenResetToInitialContent(): boolean {
		return false;
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

	private readonly _agentEdit = new AgentEditState(this, this._isCurrentlyBeingModifiedByObs, this._waitsForLastEdits);

	/** Whether an agent's edit tool call is writing the file, see {@link AgentEditState}. */
	get isAgentEditing(): boolean {
		return this._agentEdit.editing;
	}

	setEditing(editing: boolean): void {
		this._agentEdit.setEditing(editing);
	}

	runAsAgentEdit(task: () => Promise<void>): Promise<void> {
		return this._agentEdit.runAsAgentEdit(task);
	}

	private _matchLineEndings(): void {
		this.originalModel.setEOL(this.modifiedModel.getEndOfLineSequence());
	}
}

/**
 * A notebook of the session's Working Set, reviewed in the notebook editor
 * like a local chat edit: by its cells, compared with the notebook that the
 * file's baseline holds. The agent host keeps and undoes the changes of a
 * file or of a range of its lines, so the change of a cell is kept or undone
 * by the lines of the notebook's file that hold it, which only an ipynb file
 * tells, see {@link locateNotebookFileChange}. The changes of other
 * notebooks are kept or undone as a whole.
 */
class AgentHostNotebookReviewEntry extends ChatEditingModifiedNotebookEntry {

	private _operations: IWorkingSetOperations | undefined;
	private _file: IWorkingSetFile | undefined;
	/** Whether the notebook has changes that were made outside of the session, see {@link compare}. */
	private _changedOutside = false;
	private readonly _agentEdit = new AgentEditState(this, this._isCurrentlyBeingModifiedByObs, this._waitsForLastEdits);

	/** The Working Set file this entry reviews, as last read. */
	get file(): IWorkingSetFile {
		if (!this._file) {
			throw new Error('Review entry is not connected');
		}
		return this._file;
	}

	/**
	 * Connects the entry to the Working Set file it reviews; called right after creating it.
	 * `baselineContent` keeps the content of the notebook it compares with readable.
	 */
	connect(operations: IWorkingSetOperations, file: IWorkingSetFile, baselineContent: IDisposable): void {
		this._operations = operations;
		this._file = file;
		this._register(baselineContent);
	}

	/**
	 * A created notebook has no lines to compare with, and a notebook that was changed outside of the
	 * session isn't the one whose lines the session recorded, so their changes are kept or undone as a whole.
	 */
	override get canDecideCells(): boolean {
		return this.viewType === JUPYTER_NOTEBOOK_VIEW_TYPE && !!this._file && !this._file.diff.isCreated && !this._changedOutside;
	}

	override createModifiedCellDiffInfo(modifiedCellIndex: number, originalCellIndex: number): ICellDiffInfo {
		const cell = this.modifiedModel.cells[modifiedCellIndex];
		return this._decideWithAgentHost(super.createModifiedCellDiffInfo(modifiedCellIndex, originalCellIndex), change => ({ kind: 'modified', cell, change }));
	}

	override createInsertedCellDiffInfo(modifiedCellIndex: number): ICellDiffInfo {
		const cell = this.modifiedModel.cells[modifiedCellIndex];
		return this._decideWithAgentHost(super.createInsertedCellDiffInfo(modifiedCellIndex), () => ({ kind: 'insert', cell }));
	}

	override createDeleteCellDiffInfo(originalCellIndex: number): ICellDiffInfo {
		const cell = this.originalModel.cells[originalCellIndex];
		return this._decideWithAgentHost(super.createDeleteCellDiffInfo(originalCellIndex), () => ({ kind: 'delete', cell }));
	}

	/** Keeping or undoing the changes of a cell goes through the agent host as well. */
	private _decideWithAgentHost(cell: ICellDiffInfo, toChange: (change: DetailedLineRangeMapping | undefined) => NotebookCellChange): ICellDiffInfo {
		const keep = (change?: DetailedLineRangeMapping) => this._operations?.keep(this, toChange(change)) ?? Promise.resolve(false);
		const undo = (change?: DetailedLineRangeMapping) => this._operations?.undo(this, toChange(change)) ?? Promise.resolve(false);
		// A cell's hunks are kept or undone at once in one operation: each operation updates the review, which replaces the other hunks.
		return { ...cell, keep, undo, keepAll: () => keep(), undoAll: () => undo() };
	}

	/** Whether the review still shows `change`, which a newer version of the notebook's changes can replace. */
	shows(change: ReviewChange): boolean {
		return !(change instanceof DetailedLineRangeMapping) && !!this._findCellChange(change);
	}

	/**
	 * The lines of the notebook's file that the agent host is asked to keep or undo the changes of, for `change`.
	 * Throws if the agent host wouldn't keep or undo `change` alone.
	 */
	locate(change: NotebookCellChange): INotebookFileLines {
		const shown = this._findCellChange(change);
		const baseline = readNotebookFile(this.file.baseline);
		const current = readNotebookFile(this.file.current);
		// The lines of a cell tell lines of the file only while the notebooks hold what the session recorded.
		if (!shown || !baseline || !current || !hasNotebookFileSources(this.originalModel.cells, baseline) || !hasNotebookFileSources(this.modifiedModel.cells, current)) {
			throw createUnmatchedChangeError();
		}
		const located = locateNotebookFileChange(baseline, current, shown.type === 'delete'
			? { kind: 'delete', cell: shown.originalCellIndex }
			: shown.type === 'insert'
				? { kind: 'insert', cell: shown.modifiedCellIndex }
				: { kind: 'modified', cell: shown.modifiedCellIndex, originalCell: shown.originalCellIndex, hunks: change.kind === 'modified' && change.change ? [change.change] : shown.diff.get().changes });
		if (located === NotebookFileChangeFailure.Unmatched) {
			throw createUnmatchedChangeError();
		}
		if (located === NotebookFileChangeFailure.Inseparable) {
			throw new Error(localize('agentHostEditReview.inseparable', "The notebook's file holds this change together with other changes, so it can't be kept or undone on its own. Keep or undo the whole file instead."));
		}
		return located;
	}

	private _findCellChange(change: NotebookCellChange): ICellDiffInfo | undefined {
		const index = (change.kind === 'delete' ? this.originalModel : this.modifiedModel).cells.indexOf(change.cell);
		if (index < 0) {
			return undefined;
		}
		return this.cellsDiffInfo.get().find(cell => {
			switch (change.kind) {
				case 'delete': return cell.type === 'delete' && cell.originalCellIndex === index;
				case 'insert': return cell.type === 'insert' && cell.modifiedCellIndex === index;
				case 'modified': return cell.type === 'modified' && cell.modifiedCellIndex === index && (!change.change || cell.diff.get().changes.includes(change.change));
			}
		});
	}

	/** Whether the notebook has unsaved changes, which keep it from reloading its file. */
	get isDirty(): boolean {
		return this.modifiedResourceRef.object.isDirty();
	}

	/**
	 * Whether the notebook holds `content`, apart from metadata that was added to its cells, as
	 * notebook extensions do on their own, see {@link NotebookUnsavedChanges}.
	 */
	holds(content: NotebookData): boolean {
		return holdsNotebookContent(this.modifiedResourceRef.object.notebook, content, this.transientOptions);
	}

	/** The notebook as it is. */
	get content(): NotebookData {
		return this.modifiedModel.createSnapshot({ context: SnapshotContext.Save, outputSizeLimit: 0, transientOptions: this.transientOptions });
	}

	/** Loads the notebook's file, which the agent wrote, dropping the notebook's unsaved changes. */
	async loadFile(): Promise<void> {
		// Loading replaces cells, so their changes are computed anew rather than followed.
		this.updateCellDiffInfo([], undefined);
		const notebook = this.modifiedResourceRef.object;
		if (notebook.isDirty()) {
			await notebook.revert();
		} else {
			await notebook.load({ forceReadFromFile: true });
		}
	}

	/**
	 * Compares the notebook anew with the notebook `baseline` of the version `file` of its Working Set file.
	 * `changedOutside` tells that `baseline` includes changes that were made to the notebook outside of the session.
	 */
	async compare(file: IWorkingSetFile, baseline: NotebookData, changedOutside: boolean): Promise<void> {
		if (this._store.isDisposed) {
			return;
		}
		this._file = file;
		this._changedOutside = changedOutside;
		this.updateCellDiffInfo([], undefined);
		this._setOriginalContent(baseline);
		await this.initializeModelsFromDiff();
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

	/** The agent host decides what is kept or undone, so a notebook back at its baseline stays undecided. */
	protected override _settlesWithoutChanges(): boolean {
		return false;
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

	/** Whether an agent's edit tool call is writing the file, see {@link AgentEditState}. */
	get isAgentEditing(): boolean {
		return this._agentEdit.editing;
	}

	setEditing(editing: boolean): void {
		this._agentEdit.setEditing(editing);
	}

	runAsAgentEdit(task: () => Promise<void>): Promise<void> {
		return this._agentEdit.runAsAgentEdit(task);
	}
}

/** A file of the session's Working Set under review: a text document, or a notebook. */
type ReviewEntry = AgentHostEditReviewEntry | AgentHostNotebookReviewEntry;

/**
 * Tells which notebooks have unsaved changes that are none of the user's.
 *
 * The ipynb extension changes the metadata of cells on its own: it gives the cells that a notebook
 * loads ids, as when the notebook reloads the file that an agent wrote. That leaves the notebook with
 * unsaved changes, which keep it from reloading what the agent writes next. Unlike the user's, such
 * changes can be dropped.
 *
 * Unsaved changes are the user's unless they are seen to be such changes alone: the notebook got
 * them through one, and has changed in no other way since. A notebook that is restored with its
 * unsaved changes, as when the window reloads, isn't seen to get them.
 */
class NotebookUnsavedChanges extends Disposable {

	/** Notebooks whose unsaved changes are all generated ones. */
	private readonly _generated = new ResourceSet();
	/** The metadata of cells as last seen, which a change to it is compared with. */
	private readonly _cellMetadata = new WeakMap<NotebookCellTextModel, NotebookCellMetadata>();
	/**
	 * What happened to notebooks since their changes were last told apart: whether they got unsaved
	 * changes, and whether everything that changed them was generated.
	 */
	private readonly _recent = new ResourceMap<{ becameDirty: boolean; generated: boolean | undefined }>();
	private readonly _notebooks = this._register(new DisposableMap<NotebookTextModel>());

	constructor(notebookService: INotebookService, notebookResolver: INotebookEditorModelResolverService) {
		super();
		for (const notebook of notebookService.getNotebookTextModels()) {
			this._follow(notebook);
		}
		this._register(notebookService.onWillAddNotebookDocument(notebook => this._follow(notebook)));
		this._register(notebookService.onDidRemoveNotebookDocument(notebook => {
			this._notebooks.deleteAndDispose(notebook);
			this._forget(notebook.uri);
		}));
		this._register(notebookResolver.onDidChangeDirty(notebook => {
			if (notebook.isDirty()) {
				this._note(notebook.resource).becameDirty = true;
			} else {
				this._forget(notebook.resource);
			}
		}));
	}

	/** Whether the unsaved changes of the notebook `resource` are known to be none of the user's. */
	areGenerated(resource: URI): boolean {
		this._tellApart();
		return this._generated.has(resource);
	}

	private _follow(notebook: NotebookTextModel): void {
		this._seeCells(notebook);
		this._notebooks.set(notebook, notebook.onDidChangeContent(e => {
			let generated: boolean | undefined;
			let cellsChanged = false;
			for (const event of e.rawEvents) {
				if (event.kind === NotebookCellsChangeType.ChangeCellMetadata) {
					const cell: NotebookCellTextModel | undefined = notebook.cells[event.index];
					const previous = cell && this._cellMetadata.get(cell);
					if (cell) {
						this._cellMetadata.set(cell, event.metadata);
					}
					if (!event.transient) {
						generated = generated !== false && !!previous && isGeneratedCellMetadata(notebook, previous, event.metadata);
					}
					continue;
				}
				cellsChanged ||= event.kind === NotebookCellsChangeType.ModelChange || event.kind === NotebookCellsChangeType.Move
					|| event.kind === NotebookCellsChangeType.Initialize || event.kind === NotebookCellsChangeType.Unknown;
				if (!event.transient) {
					generated = false;
				}
			}
			if (cellsChanged) {
				// Cells were added or are elsewhere now, so the changes to metadata above may not have been told for the right cells.
				this._seeCells(notebook);
			}
			// A change that isn't saved with the notebook leaves it without unsaved changes.
			if (generated !== undefined) {
				const recent = this._note(notebook.uri);
				recent.generated = recent.generated !== false && generated;
			}
		}));
	}

	private _seeCells(notebook: NotebookTextModel): void {
		for (const cell of notebook.cells) {
			this._cellMetadata.set(cell, cell.metadata);
		}
	}

	private _note(resource: URI): { becameDirty: boolean; generated: boolean | undefined } {
		let recent = this._recent.get(resource);
		if (!recent) {
			if (this._recent.size === 0) {
				queueMicrotask(() => this._tellApart());
			}
			recent = { becameDirty: false, generated: undefined };
			this._recent.set(resource, recent);
		}
		return recent;
	}

	private _forget(resource: URI): void {
		this._generated.delete(resource);
		this._recent.delete(resource);
	}

	/**
	 * A notebook tells that it changed and that it got unsaved changes one after the other, in either
	 * order, so its changes are told apart once it told both.
	 */
	private _tellApart(): void {
		for (const [resource, { becameDirty, generated }] of this._recent) {
			if (generated === false) {
				this._generated.delete(resource);
			} else if (generated && becameDirty) {
				this._generated.add(resource);
			}
		}
		this._recent.clear();
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
 *
 * A notebook is reviewed in its notebook editor, by its cells, whose changes
 * are kept or undone by the lines of the notebook's file that hold them, see
 * {@link AgentHostNotebookReviewEntry}. Its unsaved changes can't be merged
 * with what the agent writes, so the user's suspend its review until they are
 * saved or reverted, see {@link NotebookUnsavedChanges}.
 */
export class AgentHostEditReview extends Disposable implements IWorkingSetOperations {

	private readonly _entries = new ResourceMap<ReviewEntry>();
	private readonly _entriesObs = observableValue<readonly ReviewEntry[]>(this, []);
	readonly entries: IObservable<readonly IModifiedFileEntry[]> = derived(this, reader => this._entriesObs.read(reader).filter(entry => this._isFileVisible(entry, reader)));
	private readonly _checkpointReview = observableValue<AgentHostCheckpointReview | undefined>(this, undefined);

	private readonly _rawChanges = derived<IAgentHostCheckpointReviewSource | undefined>(this, reader => {
		const workingSet = this._workingSet.read(reader);
		const state = workingSet?.state.read(reader);
		return workingSet ? { channel: workingSet.channel, ready: state?.status === ChangesetStatus.Ready, failed: workingSet.failed.read(reader) || state?.status === ChangesetStatus.Error, files: state ? toWorkingSetFileChanges(state, workingSet) : [] } : undefined;
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
	private readonly _suspendedEntries = this._register(new DisposableResourceMap<ReviewEntry>());
	private readonly _notebookUnsavedChanges: NotebookUnsavedChanges;
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
		@INotebookEditorModelResolverService private readonly _notebookResolver: INotebookEditorModelResolverService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();
		this._register(this._textFileService.files.retainResolvedContent());
		this._notebookUnsavedChanges = this._register(new NotebookUnsavedChanges(this._notebookService, this._notebookResolver));

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
				? { connection: current.connection, resourceAuthority: getAgentHostResourceAuthority(current), channel: URI.parse(resolveChangesetUriTemplate(current.backendSession.toString(), changeset.uriTemplate)) }
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
		const retryBlockedFiles = observableSignalFromEvent(this, Event.filter(Event.any<{ readonly resource: URI }>(
			Event.map(this._textFileService.files.onDidSave, event => event.model),
			this._textFileService.files.onDidRevert,
			// A notebook can be reloaded once its unsaved changes are saved or reverted.
			Event.filter(this._notebookResolver.onDidChangeDirty, notebook => !notebook.isDirty()),
		), model => this._blockedFiles.has(model.resource)));
		this._register(autorun(reader => {
			retryBlockedFiles.read(reader);
			const current = this._workingSet.read(reader);
			const state = current?.state.read(reader);
			const rawFiles = current && state ? toWorkingSetFileChanges(state, current) : [];
			const files = current ? this._checkpointReview.read(reader)?.project(current.channel, rawFiles, reader) ?? rawFiles : rawFiles;
			for (const file of files) {
				if (file.editing) {
					// An edit starts immediately, even while an earlier update is being read or diffed.
					const resource = this._uriIdentityService.asCanonicalUri(file.diff.modifiedURI);
					(this._entries.get(resource) ?? this._suspendedEntries.get(resource))?.setEditing(true);
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
	private async _decide(uris: readonly URI[], decide: (entry: ReviewEntry) => Promise<void>, decided: ModifiedFileEntryState): Promise<boolean> {
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

	keep(entry: ReviewEntry, change?: ReviewChange): Promise<boolean> {
		return this._invoke(entry, AGENT_HOST_ACCEPT_CHANGES_OPERATION_ID, change, AccessibilitySignal.editsKept, (fileName, message) => localize('agentHostEditReview.keepFailed', "Could not keep the changes to '{0}': {1}", fileName, message));
	}

	undo(entry: ReviewEntry, change?: ReviewChange): Promise<boolean> {
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
				(this._entries.get(resource) ?? this._suspendedEntries.get(resource))?.setEditing(true);
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
						if (entry instanceof AgentHostEditReviewEntry) {
							// A notebook is compared anew by the time it is reloaded.
							await entry.getDiffInfo();
						}
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
				this._handleReviewError(resource, error);
			}
		}
		if (token.isCancellationRequested) {
			return;
		}
		for (const resource of this._blockedFiles) {
			if (!listed.has(resource)) {
				this._blockedFiles.delete(resource);
				this._suspendedEntries.deleteAndDispose(resource);
			}
		}
		for (const entry of [...this._entries.values()]) {
			if (!listed.has(entry.modifiedURI)) {
				if (entry instanceof AgentHostNotebookReviewEntry) {
					await this._loadDecidedNotebook(entry);
					if (token.isCancellationRequested) {
						return;
					}
				}
				this._removeEntry(entry);
			}
		}
	}

	/**
	 * Brings a notebook whose file left the Working Set up to date with its file. Its changes can be
	 * undone without the review, as by the working set above the chat input, which changes its file.
	 * Unsaved changes that aren't the user's keep the notebook from reloading the file then, and
	 * saving them would bring back what was undone.
	 */
	private async _loadDecidedNotebook(entry: AgentHostNotebookReviewEntry): Promise<void> {
		if (!entry.isDirty || this._hasUserChanges(entry)) {
			// The notebook reloads its file on its own, or holds changes of the user that must not be dropped.
			return;
		}
		try {
			const file = await this._readNotebook(entry, (await this._fileService.readFile(entry.modifiedURI)).value.toString());
			if (!entry.holds(file) && entry.isDirty && !this._hasUserChanges(entry)) {
				await entry.runAsAgentEdit(() => entry.loadFile());
			}
		} catch (error) {
			// The file is gone, as when undoing deleted a notebook that the agent created, or can't be read.
			this._logService.warn(`[AgentHostEditReview] Could not load ${entry.modifiedURI} after its changes were decided`, error);
		}
	}

	private _handleReviewError(resource: URI, error: unknown): void {
		this._logService.error(`[AgentHostEditReview] Could not review ${resource}`, error);
		if (error instanceof EditReviewSynchronizationError) {
			const entry = this._entries.get(resource) ?? this._suspendedEntries.get(resource);
			if (entry) {
				entry.setEditing(false);
				if (this._entries.has(resource)) {
					this._suspendedEntries.set(resource, entry.acquire());
					this._removeEntry(entry);
				}
			}
			if (!this._blockedFiles.has(resource)) {
				this._blockedFiles.add(resource);
				this._notificationService.warn(localize('agentHostEditReview.reconcileFailed', "Could not update editor review for '{0}': {1} Your text has been preserved. Resolve the file's changes and save or revert it to resume editor review.", basename(resource), error.message));
			}
		}
	}

	/** Rebase reloads and undo/redo against recorded edits, since their replacements can include unchanged agent text. */
	private _refreshReview(entry: AgentHostEditReviewEntry): void {
		void this._updates.queue(async () => {
			const file = entry.file;
			const isCurrent = () => {
				if (this._lifetimeToken.isCancellationRequested || !this._isReviewing(entry)
					|| entry.file !== file || entry.isAgentEditing || entry.state.get() !== ModifiedFileEntryState.Modified) {
					return false;
				}
				const workingSet = this._workingSet.get();
				const state = workingSet?.state.get();
				const latest = workingSet && state ? this._findWorkingSetFile(state, workingSet, entry) : undefined;
				return !!latest && !latest.editing && isSameWorkingSetFile(latest, file);
			};
			if (!isCurrent()) {
				return;
			}
			try {
				const prepared = await this._prepareFile(file, entry.modifiedModel, this._lifetimeToken, entry.originalModel);
				if (isCurrent()) {
					await entry.update(file, prepared.original, prepared.edit);
				}
			} catch (error) {
				if (isCurrent()) {
					if (error instanceof EditReviewSupersededError) {
						this._refreshReview(entry);
					} else if (!isCancellationError(error)) {
						this._handleReviewError(entry.modifiedURI, error);
					}
				}
			}
		});
	}

	private async _updateFile(resource: URI, change: IWorkingSetFileChange, token: CancellationToken): Promise<void> {
		const existing = this._entries.get(resource);
		if (existing && isSameWorkingSetFile(existing.file, change)) {
			if (existing.isAgentEditing) {
				await existing.runAsAgentEdit(() => existing instanceof AgentHostNotebookReviewEntry
					? this._followNotebook(existing, undefined, token)
					: this._reloadFromDisk(resource, existing.file.current, token));
			}
			return;
		}
		const contents = await this._readContents(change.diff);
		const suspended = this._suspendedEntries.get(resource);
		const entry = this._entries.get(resource) ?? suspended;
		if (this._store.isDisposed || token.isCancellationRequested) {
			return;
		}
		if (!contents) {
			if (entry) {
				this._removeEntry(entry);
			}
			this._suspendedEntries.deleteAndDispose(resource);
			return;
		}
		if (entry?.state.get() === ModifiedFileEntryState.Modified) {
			// The review compares the document with what the session recorded, so it first gets the agent's last write.
			entry.setEditing(true);
			const file = { ...change, ...contents };
			if (entry instanceof AgentHostNotebookReviewEntry) {
				await entry.runAsAgentEdit(() => this._followNotebook(entry, file, token));
			} else {
				await entry.runAsAgentEdit(() => this._reloadFromDisk(resource, contents.current, token));
				if (token.isCancellationRequested) {
					return;
				}
				const trackedOriginal = suspended instanceof AgentHostEditReviewEntry && isSameWorkingSetFile(suspended.file, file) ? suspended.originalModel : undefined;
				const prepared = await this._prepareFile(file, entry.modifiedModel, token, trackedOriginal);
				await entry.update(file, prepared.original, prepared.edit);
			}
			if (token.isCancellationRequested || this._store.isDisposed) {
				return;
			}
			if (this._suspendedEntries.deleteAndLeak(resource)) {
				this._entries.set(resource, entry);
			}
			entry.updateTelemetryInfo(this._getTelemetryInfo());
			this._entriesObs.set([...this._entries.values()], undefined);
			return;
		}
		if (entry) {
			// The user decided on the earlier changes, so the file is reviewed anew.
			this._removeEntry(entry);
		}
		this._suspendedEntries.deleteAndDispose(resource);
		await this._createEntry(resource, { ...change, ...contents }, token);
	}

	private async _createEntry(resource: URI, file: IWorkingSetFile, token: CancellationToken): Promise<void> {
		if (this._notebookService.hasSupportedNotebooks(resource)) {
			// Notebooks are edited through their own working copies, which a text review can't follow.
			await this._createNotebookEntry(resource, file, token);
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
		entry.connect(this, file, prepared.edit, () => this._refreshReview(entry));
		entry.setEditing(file.editing);
		// Agent changes wait for a decision, whatever the auto-accept delay.
		entry.enableReviewModeUntilSettled();
		this._entries.set(entry.modifiedURI, entry);
		this._entriesObs.set([...this._entries.values()], undefined);
	}

	/** Reviews a notebook by its cells: the notebook its editor shows, compared with the notebook that the file's baseline holds. */
	private async _createNotebookEntry(resource: URI, file: IWorkingSetFile, token: CancellationToken): Promise<void> {
		const entry = await this._resolveNotebookEntry(resource, file, token);
		if (!entry) {
			return;
		}
		try {
			// The notebook may have been opened before the agent wrote its file.
			await entry.runAsAgentEdit(() => this._followNotebook(entry, undefined, token));
		} catch (error) {
			entry.dispose();
			throw error;
		}
		if (this._store.isDisposed || token.isCancellationRequested || this._entries.has(resource)) {
			entry.dispose();
			return;
		}
		entry.setEditing(file.editing);
		// Agent changes wait for a decision, whatever the auto-accept delay.
		entry.enableReviewModeUntilSettled();
		this._entries.set(entry.modifiedURI, entry);
		this._entriesObs.set([...this._entries.values()], undefined);
	}

	private async _resolveNotebookEntry(resource: URI, file: IWorkingSetFile, token: CancellationToken): Promise<AgentHostNotebookReviewEntry | undefined> {
		let modified: IReference<IResolvedNotebookEditorModel>;
		try {
			modified = await this._notebookResolver.resolve(resource);
		} catch (error) {
			this._logService.warn(`[AgentHostEditReview] Could not open ${resource} for review`, error);
			return undefined;
		}
		const baselineContent = new DisposableStore();
		let original: IReference<IResolvedNotebookEditorModel> | undefined;
		let entry: AgentHostNotebookReviewEntry | undefined;
		try {
			const notebook = modified.object.notebook;
			const telemetryInfo = this._getTelemetryInfo();
			const { serializer } = await this._notebookService.withNotebookDataProvider(notebook.viewType);
			original = await ChatEditingModifiedNotebookEntry.resolveOriginal(notebook, VSBuffer.fromString(file.baseline), telemetryInfo, this._notebookResolver, baselineContent);
			if (this._store.isDisposed || token.isCancellationRequested) {
				return undefined;
			}
			entry = this._instantiationService.createInstance(
				AgentHostNotebookReviewEntry,
				modified,
				original,
				{ collapse: () => { } },
				serializer.options,
				telemetryInfo,
				file.diff.isCreated ? ChatEditKind.Created : ChatEditKind.Modified,
				createSnapshot(original.object.notebook, serializer.options, this._configurationService),
			);
			entry.connect(this, file, baselineContent);
			return entry;
		} finally {
			if (!entry) {
				// The entry owns the notebooks it reviews, once created.
				modified.dispose();
				original?.dispose();
				baselineContent.dispose();
			}
		}
	}

	/**
	 * Brings a reviewed notebook up to date with what the agent wrote and compares it anew: with the
	 * latest version `file` of its Working Set file when given, with the version it reviews otherwise.
	 *
	 * A notebook that doesn't hold what the agent wrote loads its file, which drops unsaved changes
	 * that aren't the user's. Unlike a document's, a notebook's unsaved changes can't be merged with
	 * what the agent wrote, so the user's suspend the review instead.
	 */
	private async _followNotebook(entry: AgentHostNotebookReviewEntry, file: IWorkingSetFile | undefined, token: CancellationToken): Promise<void> {
		const latest = file ?? entry.file;
		let unsaved = false;
		try {
			const [baseline, current] = await Promise.all([this._readNotebook(entry, latest.baseline), this._readNotebook(entry, latest.current)]);
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			let changedOutside: NotebookData | undefined;
			if (!entry.holds(current)) {
				// The notebook hasn't loaded what the agent wrote: its file watcher lags behind, or unsaved changes keep it from reloading.
				unsaved = this._hasUserChanges(entry);
				if (!unsaved) {
					await entry.loadFile();
					if (token.isCancellationRequested) {
						throw new CancellationError();
					}
					if (!entry.holds(current)) {
						// The file changed since the session recorded it, as when the user saved changes of their own, which aren't the session's.
						changedOutside = withOutsideChanges(baseline, current, entry.content);
					}
				}
			}
			if (!unsaved) {
				await entry.compare(latest, changedOutside ?? baseline, !!changedOutside);
			}
		} catch (error) {
			if (isCancellationError(error) || token.isCancellationRequested) {
				throw new CancellationError();
			}
			throw new EditReviewSynchronizationError(toErrorMessage(error));
		}
		if (unsaved) {
			throw new EditReviewSynchronizationError(localize('agentHostEditReview.unsavedNotebook', "The notebook has unsaved changes."));
		}
	}

	/** The notebook that the content `content` of the file of `entry` holds. */
	private async _readNotebook(entry: AgentHostNotebookReviewEntry, content: string): Promise<NotebookData> {
		const { serializer } = await this._notebookService.withNotebookDataProvider(entry.viewType);
		return serializer.dataToNotebook(VSBuffer.fromString(content));
	}

	private async _prepareFile(file: IWorkingSetFile, model: ITextModel, token: CancellationToken, trackedOriginal?: ITextModel): Promise<{ original: string; edit: StringEdit }> {
		for (let attempt = 0; attempt < 2; attempt++) {
			if (token.isCancellationRequested || model.isDisposed() || trackedOriginal?.isDisposed()) {
				throw new CancellationError();
			}
			const version = model.getVersionId();
			const originalVersion = trackedOriginal?.getVersionId();
			const live = model.getValue();
			const original = await getReviewedOriginal(file, live, model.getEOL(), this._editorWorkerService, trackedOriginal?.getValue());
			if (token.isCancellationRequested || model.isDisposed() || trackedOriginal?.isDisposed()) {
				throw new CancellationError();
			}
			if (version !== model.getVersionId() || originalVersion !== trackedOriginal?.getVersionId()) {
				continue;
			}
			if (original === undefined) {
				throw new EditReviewSynchronizationError(localize('agentHostEditReview.impreciseDiff', "The file's changes could not be compared precisely."));
			}
			const edit = await computeEdit(original, live, this._editorWorkerService)
				?? StringEdit.replace(OffsetRange.ofLength(original.length), live).removeCommonSuffixAndPrefix(original);
			if (token.isCancellationRequested || model.isDisposed() || trackedOriginal?.isDisposed()) {
				throw new CancellationError();
			}
			if (version === model.getVersionId() && originalVersion === trackedOriginal?.getVersionId()) {
				return { original, edit };
			}
		}
		throw new EditReviewSupersededError(localize('agentHostEditReview.prepareChanged', "The document changed while its changes were being compared."));
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
	 * Working Set: the changes of `change`, or all of them, as the editor
	 * showed them when the user decided. Failures are reported, and a decided
	 * change is signaled; {@link accept} and {@link reject} signal the files
	 * they decide on together. Resolves to whether the host did.
	 */
	private _invoke(entry: ReviewEntry, operationId: string, change: ReviewChange | undefined, decided: AccessibilitySignal, failed: (fileName: string, message: string) => string): Promise<boolean> {
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

	private async _doInvoke(entry: ReviewEntry, shown: IWorkingSetFile, operationId: string, change: ReviewChange | undefined): Promise<boolean> {
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
		if (change && !entry.shows(change)) {
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
			if (this._isReviewing(entry) && entry instanceof AgentHostEditReviewEntry) {
				// A notebook is compared anew by the time the review is up to date.
				await entry.getDiffInfo();
			}
		}
		return true;
	}

	private async _invokeOperation(workingSet: IWorkingSet & { readonly subscription: IAgentSubscription<ChangesetState> }, entry: ReviewEntry, shown: IWorkingSetFile, operationId: string, state: ChangesetState, change: ReviewChange | undefined): Promise<void> {
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
		let range: { readonly side: 'before' | 'after'; readonly range: TextRange } | undefined;
		if (change && !(change instanceof DetailedLineRangeMapping) && entry instanceof AgentHostNotebookReviewEntry) {
			const located = entry.locate(change);
			range = { side: located.side, range: toTextRange(located.lines) };
		} else if (change instanceof DetailedLineRangeMapping && entry instanceof AgentHostEditReviewEntry) {
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
				throw createUnmatchedChangeError();
			}
			range = { side: 'after', range: toTextRange(lines) };
		}
		if (change && !range) {
			// Without its lines, the operation would cover all changes of the file.
			throw createUnmatchedChangeError();
		}
		// A notebook that loads its reverted file, kept open until then even if it leaves the review meanwhile.
		let revertedNotebook: { readonly entry: AgentHostNotebookReviewEntry; readonly reference: IDisposable } | undefined;
		try {
			if (operationId === AGENT_HOST_DISCARD_CHANGES_OPERATION_ID && this._isDirty(entry)) {
				if (entry instanceof AgentHostNotebookReviewEntry && !this._hasUserChanges(entry)) {
					// The notebook's unsaved changes aren't the user's, and saving them would change the lines that the agent host reverts.
					// They keep the notebook from reloading on its own, so it loads its reverted file afterwards.
					revertedNotebook = { entry, reference: await this._notebookResolver.resolve(entry.modifiedURI) };
				} else {
					// The agent host reverts the changes on disk, so the document's unsaved text goes there first.
					const saved = entry instanceof AgentHostNotebookReviewEntry
						? await entry.save().then(() => true)
						: !!await this._textFileService.save(entry.modifiedURI, { reason: SaveReason.EXPLICIT, skipSaveParticipants: true });
					if (!saved || this._isDirty(entry)) {
						// Otherwise the host reverts what's on disk while the document keeps the changes, which a later save would restore.
						throw new Error(localize('agentHostEditReview.notSaved', "Its unsaved changes couldn't be saved. Save the file and try again."));
					}
				}
				// The agent may have changed the file meanwhile.
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
					? { kind: ChangesetOperationTargetKind.Range, ...target, ...range }
					: { kind: ChangesetOperationTargetKind.Resource, ...target },
			});
			// Not if the user changed the notebook meanwhile.
			if (revertedNotebook?.entry.isDirty && !this._hasUserChanges(revertedNotebook.entry)) {
				const reverted = revertedNotebook.entry;
				await reverted.runAsAgentEdit(() => reverted.loadFile());
			}
		} finally {
			revertedNotebook?.reference.dispose();
		}
	}

	private _isDirty(entry: ReviewEntry): boolean {
		return entry instanceof AgentHostNotebookReviewEntry ? entry.isDirty : this._textFileService.isDirty(entry.modifiedURI);
	}

	/** Whether the notebook of `entry` has unsaved changes that are the user's, or may be, which must not be dropped. */
	private _hasUserChanges(entry: AgentHostNotebookReviewEntry): boolean {
		return entry.isDirty && !this._notebookUnsavedChanges.areGenerated(entry.modifiedURI);
	}

	private _findWorkingSetFile(state: ChangesetState, workingSet: IWorkingSet, entry: ReviewEntry): IWorkingSetFileChange | undefined {
		return toWorkingSetFileChanges(state, workingSet)
			.find(candidate => isEqual(this._uriIdentityService.asCanonicalUri(candidate.diff.modifiedURI), entry.modifiedURI));
	}

	private _isReviewing(entry: ReviewEntry): boolean {
		return this._entries.get(entry.modifiedURI) === entry && this._isFileVisible(entry);
	}

	private _isFileVisible(entry: ReviewEntry, reader?: IReader): boolean {
		const review = this._checkpointReview.read(reader);
		const current = this._workingSet.read(reader);
		return !review || !current || review.project(current.channel, [entry.file], reader).length > 0;
	}

	private _removeEntry(entry: ReviewEntry): void {
		if (this._entries.get(entry.modifiedURI) !== entry) {
			return;
		}
		this._entries.delete(entry.modifiedURI);
		this._entriesObs.set([...this._entries.values()], undefined);
		this._releaseEntry(entry, true);
	}

	private _releaseEntry(entry: ReviewEntry, closeEditors: boolean): void {
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
	private _getEntries(uris: readonly URI[]): readonly ReviewEntry[] {
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
 * Reconciles the Working Set baseline without expanding an existing review, or returns undefined if precise comparison is unavailable.
 * A document that matches the recorded content holds only the agent's changes, so it is compared with the baseline itself.
 */
async function getReviewedOriginal(file: IWorkingSetFile, live: string, eol: string, workerService: IEditorWorkerService, trackedOriginal?: string): Promise<string | undefined> {
	const baseline = withLineEndings(file.baseline, eol);
	const current = withLineEndings(file.current, eol);
	if (live === current) {
		return baseline;
	}
	if (trackedOriginal === live) {
		return live;
	}
	const [agent, user] = await Promise.all([computeEdit(baseline, current, workerService), computeEdit(current, live, workerService)]);
	if (!agent || !user) {
		return undefined;
	}
	const original = user.rebaseSkipConflicting(agent.inverse(baseline)).apply(baseline);
	if (trackedOriginal === undefined || trackedOriginal === original) {
		return original;
	}
	const [pending, adjustments] = await Promise.all([computeEdit(trackedOriginal, live, workerService, true), computeEdit(trackedOriginal, original, workerService, true)]);
	if (!pending || !adjustments) {
		return undefined;
	}
	let pendingIndex = 0;
	const refinements = adjustments.replacements.filter(adjustment => {
		while (pendingIndex < pending.replacements.length) {
			const replacement = pending.replacements[pendingIndex];
			const range = replacement.replaceRange;
			if (range.containsRange(adjustment.replaceRange)) {
				return replacement.equals(adjustment);
			}
			if (range.endExclusive > adjustment.replaceRange.start) {
				return false;
			}
			pendingIndex++;
		}
		return false;
	});
	return new StringEdit(refinements).apply(trackedOriginal);
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

function createUnmatchedChangeError(): Error {
	return new Error(localize('agentHostEditReview.unmapped', "The change couldn't be matched with the session's changes. Keep or undo the whole file instead."));
}

/** The zero-based range of `lines`, which ends at the start of the line after them so it doesn't cover that line. */
function toTextRange(lines: LineRange): TextRange {
	const start = { line: lines.startLineNumber - 1, character: 0 };
	return { start, end: lines.isEmpty ? start : { line: lines.endLineNumberExclusive - 1, character: 0 } };
}

/** The edit that turns `original` into `modified`, as their diff spells it out, or `undefined` if the diff times out. */
async function computeEdit(original: string, modified: string, workerService: IEditorWorkerService, computeRawChanges = false): Promise<StringEdit | undefined> {
	if (original === modified) {
		return StringEdit.empty;
	}
	const diff = await workerService.computeStringEditFromDiffWithMetadata(original, modified, { maxComputationTimeMs: DIFF_TIMEOUT_MS, computeRawChanges }, 'advanced');
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
function toWorkingSetFileChanges(state: ChangesetState, workingSet: IWorkingSet): IWorkingSetFileChange[] {
	return state.files.map(file => {
		const diff = agentHostChangesetFileToEntryDiff(file, workingSet.connection, workingSet.resourceAuthority);
		return diff && { diff, nonce: file.nonce, editing: !!(getChangesetFileStatus(file) & ChangesetFileStatus.Editing) };
	}).filter(isDefined);
}

/**
 * Whether the metadata `next` of a cell of `notebook` is its metadata `previous` with only what the
 * ipynb extension adds to the cells that a notebook loads: an id, and the properties that every cell has.
 */
function isGeneratedCellMetadata(notebook: NotebookTextModel, previous: NotebookCellMetadata, next: NotebookCellMetadata): boolean {
	return notebook.viewType === JUPYTER_NOTEBOOK_VIEW_TYPE
		&& Object.keys(previous).every(key => objectEquals(previous[key], next[key]))
		&& Object.keys(next).every(key => Object.hasOwn(previous, key)
			|| key === 'id'
			|| (key === 'metadata' && isEmptyObject(next[key]))
			|| (key === 'execution_count' && next[key] === null));
}

/**
 * The notebook `baseline` with the changes that were made to a notebook outside of the session:
 * those between the notebook `current` that the session recorded and the notebook `live` as it is.
 * Compared with it, the changes of `live` are the session's alone. A change to cells that the
 * session changed as well can't be told apart from the session's, and is left out. Returns
 * `undefined` if `live` has the cells of `current`.
 */
function withOutsideChanges(baseline: NotebookData, current: NotebookData, live: NotebookData): NotebookData | undefined {
	const diff = (original: NotebookData, modified: NotebookData) => new LcsDiff(
		{ getElements: () => original.cells.map(cell => `${cell.cellKind}:${cell.source}`) },
		{ getElements: () => modified.cells.map(cell => `${cell.cellKind}:${cell.source}`) },
	).ComputeDiff(false).changes;
	const outsideChanges = diff(current, live);
	if (outsideChanges.length === 0) {
		return undefined;
	}
	// Where the cells of `current` that the session left as they were are in `baseline`.
	const unchanged = new Map<number, number>();
	let baselineIndex = 0;
	let currentIndex = 0;
	for (const change of [...diff(baseline, current), undefined]) {
		const end = change?.modifiedStart ?? current.cells.length;
		while (currentIndex < end) {
			unchanged.set(currentIndex++, baselineIndex++);
		}
		if (change) {
			baselineIndex = change.originalStart + change.originalLength;
			currentIndex = change.modifiedStart + change.modifiedLength;
		}
	}
	const cells = [...baseline.cells];
	// From the last to the first, so that the cells before a change stay where they are.
	for (const change of outsideChanges.reverse()) {
		let start: number | undefined;
		if (change.originalLength > 0) {
			// Cells were changed or removed: all of them must be cells that the session left as they were, one after the other.
			start = unchanged.get(change.originalStart);
			for (let i = 1; start !== undefined && i < change.originalLength; i++) {
				if (unchanged.get(change.originalStart + i) !== start + i) {
					start = undefined;
				}
			}
		} else {
			// Cells were added: after the cell before them, before the cell after them, or at either end of the notebook.
			const before = unchanged.get(change.originalStart - 1);
			start = before !== undefined ? before + 1
				: unchanged.get(change.originalStart) ?? (change.originalStart === 0 ? 0 : change.originalStart === current.cells.length ? cells.length : undefined);
		}
		if (start !== undefined) {
			cells.splice(start, change.originalLength, ...live.cells.slice(change.modifiedStart, change.modifiedStart + change.modifiedLength));
		}
	}
	return { ...baseline, cells };
}

/** Whether `notebook` holds `content`, apart from metadata that was added to its cells, see {@link AgentHostNotebookReviewEntry.holds}. */
function holdsNotebookContent(notebook: NotebookTextModel, content: NotebookData, transientOptions: TransientOptions | undefined): boolean {
	const persisted = (metadata: NotebookData['metadata']) => filter(metadata, key => !transientOptions?.transientDocumentMetadata[key]);
	return notebook.cells.length === content.cells.length
		&& objectEquals(persisted(notebook.metadata), persisted(content.metadata))
		&& notebook.cells.every((cell, index) => {
			const recorded = content.cells[index];
			return cell.fastEqual(recorded, true)
				&& Object.entries(recorded.metadata ?? {}).every(([key, value]) => objectEquals(cell.metadata[key], value))
				&& (!!transientOptions?.transientOutputs || hasSameOutputs(cell.outputs, recorded.outputs));
		});
}

function hasSameOutputs(outputs: readonly ICellOutput[], recorded: readonly IOutputDto[]): boolean {
	return outputs.length === recorded.length && outputs.every((output, index) => {
		const items = recorded[index].outputs;
		return output.outputs.length === items.length
			&& output.outputs.every((item, itemIndex) => item.mime === items[itemIndex].mime && item.data.equals(items[itemIndex].data));
	});
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
		&& a.resourceAuthority === b.resourceAuthority
		&& isEqual(a.channel, b.channel));
}
