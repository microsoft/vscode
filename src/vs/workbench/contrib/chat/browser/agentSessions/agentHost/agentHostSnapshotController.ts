/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Sequencer } from '../../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { constObservable, derived, derivedOpts, IObservable, IReader, observableValue, transaction } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { toAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { FileEditKind, ToolCallStatus, type ToolCallState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IChatProgress, IChatWorkspaceEdit } from '../../../common/chatService/chatService.js';
import { ChatEditingSessionState, IChatEditingSession, IEditSessionDiffStats, IEditSessionEntryDiff, IModifiedFileEntry, IStreamingEdits } from '../../../common/editing/chatEditingService.js';
import { IChatRequestDisablement, IChatResponseModel } from '../../../common/model/chatModel.js';
import { fileEditsToExternalEdits, type IToolCallFileEdit } from './stateToProgressAdapter.js';

/**
 * One checkpoint per request. Accumulates the before/after content URIs of
 * every completed tool call's file edits so the request's edits can be
 * undone/redone on disk during {@link AgentHostSnapshotController.restoreSnapshot}.
 */
interface IAgentHostCheckpoint {
	readonly requestId: string;
	readonly edits: IToolCallFileEdit[];
	/** Tool-call IDs whose edits have already been folded into `edits`. */
	readonly seenToolCallIds: Set<string>;
}

/**
 * A thin {@link IChatEditingSession} for agent host sessions. The agent host
 * has its own diff / changeset machinery and renders file edits via the
 * dedicated {@link IChatExternalEdit} progress part — so this session only
 * needs to support the chat-level "restore to checkpoint" UX.
 *
 * Concretely it implements:
 * - {@link restoreSnapshot} (writes before/after content to disk)
 * - {@link requestDisablement} (so disabled-request UI works after restore)
 * - {@link getSnapshotUri} / {@link getSnapshotContents} (so checkpoint diff
 *   viewers can resolve historical content)
 *
 * Everything else is a no-op / empty observable / `undefined`. In particular:
 * - `entries` is always empty → the global accept/reject UI doesn't appear
 * - no diff computation, no multi-diff editor, no streaming-edits APIs
 *
 * Undo/redo granularity is per-request: every request occupies one checkpoint
 * regardless of how many tool calls it ran. The `stopId` parameters on
 * {@link restoreSnapshot}, {@link getSnapshotUri}, and {@link getSnapshotContents}
 * are accepted for interface compatibility but ignored.
 *
 * Hydrated by the session handler via {@link ensureRequestCheckpoint} and
 * {@link addToolCallEdits} as turns and tool calls arrive.
 */
export class AgentHostSnapshotController extends Disposable implements IChatEditingSession {

	readonly supportsKeepUndo = false;
	readonly isGlobalEditingSession = false;

	readonly state: IObservable<ChatEditingSessionState> = constObservable(ChatEditingSessionState.Idle);
	readonly entries: IObservable<readonly IModifiedFileEntry[]> = constObservable([]);

	readonly requestDisablement: IObservable<IChatRequestDisablement[]> = derivedOpts(
		{ equalsFn: (a, b) => a.length === b.length && a.every((v, i) => v.requestId === b[i].requestId) },
		reader => {
			const currentIdx = this._currentCheckpointIndex.read(reader);
			const disabled: IChatRequestDisablement[] = [];
			for (let i = currentIdx + 1; i < this._checkpoints.length; i++) {
				disabled.push({ requestId: this._checkpoints[i].requestId });
			}
			return disabled;
		},
	);

	readonly canUndo: IObservable<boolean> = derived(this, r => this._currentCheckpointIndex.read(r) >= 0);
	readonly canRedo: IObservable<boolean> = derived(this, r => this._currentCheckpointIndex.read(r) < this._checkpoints.length - 1);

	private readonly _onDidDispose = this._register(new Emitter<void>());
	readonly onDidDispose: Event<void> = this._onDidDispose.event;

	private readonly _checkpoints: IAgentHostCheckpoint[] = [];
	private readonly _currentCheckpointIndex = observableValue<number>(this, -1);
	private readonly _undoRedoSequencer = new Sequencer();

	constructor(
		readonly chatSessionResource: URI,
		private readonly _connectionAuthority: string,
		@ILogService private readonly _logService: ILogService,
		@IFileService private readonly _fileService: IFileService,
	) {
		super();
	}

	// ---- Hydration from protocol state --------------------------------------

	/**
	 * Ensures a checkpoint exists for the given request. Called at the start
	 * of every turn (and during history hydration) so {@link requestDisablement}
	 * and {@link restoreSnapshot} can reference every request, even ones that
	 * produce no file edits.
	 *
	 * Splices away stale checkpoints past the current index (undo branch
	 * semantics) when a new request arrives after a checkpoint restore.
	 */
	ensureRequestCheckpoint(requestId: string): void {
		// Idempotent on existing requests.
		if (this._checkpoints.some(cp => cp.requestId === requestId)) {
			return;
		}

		// Splice the forward branch when starting a brand-new request after
		// the user restored a checkpoint.
		const currentIdx = this._currentCheckpointIndex.get();
		if (currentIdx < this._checkpoints.length - 1) {
			this._checkpoints.splice(currentIdx + 1);
		}

		this._checkpoints.push({ requestId, edits: [], seenToolCallIds: new Set() });

		// Advance the cursor to the new checkpoint. Otherwise the just-added
		// request would appear in requestDisablement (it would sit forward of
		// the cursor) and the chat UI would render it as a disabled turn.
		transaction(tx => {
			this._currentCheckpointIndex.set(this._checkpoints.length - 1, tx);
		});
	}

	/**
	 * Folds a completed tool call's file edits into the checkpoint for the
	 * given request. Idempotent on `toolCallId`.
	 */
	addToolCallEdits(requestId: string, tc: ToolCallState): void {
		if (tc.status !== ToolCallStatus.Completed) {
			return;
		}

		this.ensureRequestCheckpoint(requestId);

		const cp = this._checkpoints.find(c => c.requestId === requestId);
		if (!cp || cp.seenToolCallIds.has(tc.toolCallId)) {
			return;
		}
		cp.seenToolCallIds.add(tc.toolCallId);

		const fileEdits = fileEditsToExternalEdits(tc);
		if (fileEdits.length === 0) {
			return;
		}

		const authority = this._connectionAuthority;
		for (const edit of fileEdits) {
			const resource = toAgentHostUri(edit.resource, authority);
			const entry: IToolCallFileEdit = {
				kind: edit.kind,
				resource,
				originalResource: edit.originalResource ? toAgentHostUri(edit.originalResource, authority) : undefined,
				beforeContentUri: edit.beforeContentUri ? toAgentHostUri(edit.beforeContentUri, authority) : undefined,
				afterContentUri: edit.afterContentUri ? toAgentHostUri(edit.afterContentUri, authority) : undefined,
				undoStopId: edit.undoStopId,
				diff: edit.diff,
			};

			// Multiple tool calls in one request may touch the same file
			// (e.g. create→edit, edit→delete). Fold each new edit into the
			// prior one for the same resource so the checkpoint stores a
			// single net before/after pair per file. Otherwise
			// _writeCheckpointContent would apply duplicate writes in
			// parallel and race to leave the file in an undefined state.
			const existingIdx = cp.edits.findIndex(e => e.resource.toString() === resource.toString());
			if (existingIdx < 0) {
				cp.edits.push(entry);
			} else {
				cp.edits[existingIdx] = mergeFileEdit(cp.edits[existingIdx], entry);
			}
		}
	}

	// ---- Snapshots ----------------------------------------------------------

	private _findCheckpointIndex(requestId: string): number {
		return this._checkpoints.findIndex(cp => cp.requestId === requestId);
	}

	async restoreSnapshot(requestId: string, _stopId: string | undefined): Promise<void> {
		return this._undoRedoSequencer.queue(async () => {
			const cpIdx = this._findCheckpointIndex(requestId);
			if (cpIdx < 0) {
				this._logService.warn(`[AgentHostSnapshotController] No checkpoint found for requestId=${requestId}`);
				return;
			}

			// Restore to before this request: target one slot before it.
			await this._navigateToCheckpointIndex(cpIdx - 1);
		});
	}

	/**
	 * Steps a single checkpoint backwards, undoing the edits of the current
	 * checkpoint. The "Undo" UI invokes this once per click.
	 */
	async undoInteraction(): Promise<void> {
		return this._undoRedoSequencer.queue(async () => {
			const currentIdx = this._currentCheckpointIndex.get();
			if (currentIdx < 0) {
				return;
			}
			await this._navigateToCheckpointIndex(currentIdx - 1);
		});
	}

	/**
	 * Steps a single checkpoint forwards, redoing the edits of the next
	 * checkpoint.
	 *
	 * Implementing this is essential: the "Redo" action repeatedly calls this
	 * while {@link canRedo} is `true`, so a no-op implementation would spin
	 * forever and hang the window.
	 */
	async redoInteraction(): Promise<void> {
		return this._undoRedoSequencer.queue(async () => {
			const currentIdx = this._currentCheckpointIndex.get();
			if (currentIdx >= this._checkpoints.length - 1) {
				return;
			}
			await this._navigateToCheckpointIndex(currentIdx + 1);
		});
	}

	/**
	 * Moves the on-disk file state and the checkpoint cursor to `targetIdx`,
	 * writing each crossed checkpoint's before/after content. Must run inside
	 * the {@link _undoRedoSequencer} to avoid racing writes.
	 */
	private async _navigateToCheckpointIndex(targetIdx: number): Promise<void> {
		const currentIdx = this._currentCheckpointIndex.get();
		if (targetIdx < currentIdx) {
			// Undo forward checkpoints
			for (let i = currentIdx; i > targetIdx; i--) {
				await this._writeCheckpointContent(this._checkpoints[i], 'before');
			}
		} else if (targetIdx > currentIdx) {
			// Redo to reach the target
			for (let i = currentIdx + 1; i <= targetIdx; i++) {
				await this._writeCheckpointContent(this._checkpoints[i], 'after');
			}
		}

		transaction(tx => {
			this._currentCheckpointIndex.set(targetIdx, tx);
		});
	}

	getSnapshotUri(requestId: string, uri: URI, _stopId: string | undefined): URI | undefined {
		const cp = this._checkpoints.find(c => c.requestId === requestId);
		if (!cp || !cp.edits.some(e => e.resource.toString() === uri.toString())) {
			return undefined;
		}
		return URI.from({
			scheme: Schemas.chatEditingSnapshotScheme,
			path: uri.path,
			query: JSON.stringify({ session: this.chatSessionResource.toString(), requestId, undoStop: '' }),
		});
	}

	async getSnapshotContents(requestId: string, uri: URI, _stopId: string | undefined): Promise<VSBuffer | undefined> {
		const cp = this._checkpoints.find(c => c.requestId === requestId);
		if (!cp) {
			return undefined;
		}
		const uriStr = uri.toString();
		// Use the last edit for this file in the request — that's the
		// "after-content" the diff viewer wants to display.
		let edit: IToolCallFileEdit | undefined;
		for (let i = cp.edits.length - 1; i >= 0; i--) {
			if (cp.edits[i].resource.toString() === uriStr) {
				edit = cp.edits[i];
				break;
			}
		}
		if (!edit) {
			return undefined;
		}
		try {
			if (!edit.afterContentUri) {
				return VSBuffer.fromByteArray([]);
			}
			const content = await this._fileService.readFile(edit.afterContentUri);
			return content.value;
		} catch (err) {
			this._logService.warn(`[AgentHostSnapshotController] Failed to fetch snapshot content`, err);
			return undefined;
		}
	}

	async getSnapshotModel(_requestId: string, _undoStop: string | undefined, _snapshotUri: URI): Promise<ITextModel | null> {
		return null;
	}

	hasEditsInRequest(requestId: string, _reader?: IReader): boolean {
		return this._checkpoints.some(cp => cp.requestId === requestId);
	}

	// ---- Unsupported / no-op (agent host owns edits server-side) ------------

	async show(_previousChanges?: boolean): Promise<void> { /* no-op */ }
	getEntry(_uri: URI): IModifiedFileEntry | undefined { return undefined; }
	readEntry(_uri: URI, _reader: IReader): IModifiedFileEntry | undefined { return undefined; }
	async accept(..._uris: URI[]): Promise<void> { /* no-op */ }
	async reject(..._uris: URI[]): Promise<void> { /* no-op */ }
	getEntryDiffBetweenStops(_uri: URI, _requestId: string | undefined, _stopId: string | undefined): IObservable<IEditSessionEntryDiff | undefined> | undefined { return undefined; }
	getEntryDiffBetweenRequests(_uri: URI, _startRequestId: string, _stopRequestId: string): IObservable<IEditSessionEntryDiff | undefined> { return constObservable(undefined); }
	getDiffsForFilesInSession(): IObservable<readonly IEditSessionEntryDiff[]> { return constObservable([]); }
	getDiffsForFilesInRequest(_requestId: string): IObservable<readonly IEditSessionEntryDiff[]> { return constObservable([]); }
	getDiffForSession(): IObservable<IEditSessionDiffStats> { return constObservable({ added: 0, removed: 0 }); }

	async triggerExplanationGeneration(): Promise<void> { /* no-op */ }
	clearExplanations(): void { /* no-op */ }
	hasExplanations(): boolean { return false; }

	startStreamingEdits(_resource: URI, _responseModel: IChatResponseModel, _inUndoStop: string | undefined): IStreamingEdits {
		throw new Error('Not supported for agent host sessions');
	}
	applyWorkspaceEdit(_edit: IChatWorkspaceEdit, _responseModel: IChatResponseModel, _undoStopId: string): void {
		throw new Error('Not supported for agent host sessions');
	}
	async startExternalEdits(_responseModel: IChatResponseModel, _operationId: number, _resources: URI[], _undoStopId: string, _contentFor?: URI[]): Promise<IChatProgress[]> {
		throw new Error('Not supported for agent host sessions');
	}
	async stopExternalEdits(_responseModel: IChatResponseModel, _operationId: number, _contentFor?: URI[]): Promise<IChatProgress[]> {
		throw new Error('Not supported for agent host sessions');
	}

	// ---- Stop / Dispose -----------------------------------------------------

	async stop(_clearState?: boolean): Promise<void> {
		this.dispose();
	}

	override dispose(): void {
		this._onDidDispose.fire();
		super.dispose();
	}

	// ---- Private helpers ----------------------------------------------------

	private async _writeCheckpointContent(checkpoint: IAgentHostCheckpoint, direction: 'before' | 'after'): Promise<void> {
		const ops = checkpoint.edits.map(async edit => {
			try {
				if (direction === 'before') {
					// Undoing this edit
					switch (edit.kind) {
						case FileEditKind.Create:
							await this._fileService.del(edit.resource);
							break;
						case FileEditKind.Delete:
							if (edit.beforeContentUri) {
								const content = await this._fileService.readFile(edit.beforeContentUri);
								await this._fileService.writeFile(edit.resource, content.value);
							}
							break;
						case FileEditKind.Rename:
							if (edit.originalResource) {
								await this._fileService.move(edit.resource, edit.originalResource, true);
							}
							if (edit.beforeContentUri && edit.originalResource) {
								const content = await this._fileService.readFile(edit.beforeContentUri);
								await this._fileService.writeFile(edit.originalResource, content.value);
							}
							break;
						case FileEditKind.Edit:
							if (edit.beforeContentUri) {
								const content = await this._fileService.readFile(edit.beforeContentUri);
								await this._fileService.writeFile(edit.resource, content.value);
							}
							break;
					}
				} else {
					// Redoing this edit
					switch (edit.kind) {
						case FileEditKind.Create:
							if (edit.afterContentUri) {
								const content = await this._fileService.readFile(edit.afterContentUri);
								await this._fileService.writeFile(edit.resource, content.value);
							}
							break;
						case FileEditKind.Delete:
							await this._fileService.del(edit.resource);
							break;
						case FileEditKind.Rename:
							if (edit.originalResource) {
								await this._fileService.move(edit.originalResource, edit.resource, true);
							}
							if (edit.afterContentUri) {
								const content = await this._fileService.readFile(edit.afterContentUri);
								await this._fileService.writeFile(edit.resource, content.value);
							}
							break;
						case FileEditKind.Edit:
							if (edit.afterContentUri) {
								const content = await this._fileService.readFile(edit.afterContentUri);
								await this._fileService.writeFile(edit.resource, content.value);
							}
							break;
					}
				}
			} catch (err) {
				this._logService.warn(`[AgentHostSnapshotController] Failed to ${direction === 'before' ? 'undo' : 'redo'} ${edit.kind} for ${edit.resource.toString()}`, err);
			}
		});
		await Promise.all(ops);
	}
}

/**
 * Combines two edits to the same file (in arrival order) into a single net
 * edit. The merged entry keeps the earlier `before` snapshot and the later
 * `after` snapshot, and derives a net `kind` based on whether the file
 * exists at the start and end of the combined operation.
 *
 * A create-then-delete collapses to a no-op edit (no before, no after) — we
 * still keep the entry so the file is restored to "absent" on undo, but
 * `_writeCheckpointContent` will skip the write since both URIs are absent.
 */
function mergeFileEdit(prev: IToolCallFileEdit, next: IToolCallFileEdit): IToolCallFileEdit {
	const startsAbsent = prev.kind === FileEditKind.Create;
	const endsAbsent = next.kind === FileEditKind.Delete;

	let kind: FileEditKind;
	if (startsAbsent && endsAbsent) {
		kind = FileEditKind.Edit; // create+delete collapses to no-op
	} else if (startsAbsent) {
		kind = FileEditKind.Create;
	} else if (endsAbsent) {
		kind = FileEditKind.Delete;
	} else {
		kind = FileEditKind.Edit;
	}

	return {
		kind,
		resource: next.resource,
		// Renames within a single request are uncommon; if the second edit
		// is itself a rename keep its originalResource, otherwise carry
		// forward the first one.
		originalResource: next.originalResource ?? prev.originalResource,
		beforeContentUri: prev.beforeContentUri,
		afterContentUri: next.afterContentUri,
		undoStopId: prev.undoStopId,
		diff: next.diff ?? prev.diff,
	};
}
