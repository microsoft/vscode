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
 * One checkpoint per tool call (or the sentinel checkpoint for a request
 * that produced no edits). Tracks the before/after content URIs needed to
 * revert / replay the edits on disk during {@link AgentHostSnapshotController.restoreSnapshot}.
 */
interface IAgentHostCheckpoint {
	readonly requestId: string;
	/** Tool-call ID, or `undefined` for the sentinel checkpoint at request start. */
	readonly undoStopId: string | undefined;
	readonly edits: IToolCallFileEdit[];
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
 * Hydrated by the session handler via {@link addToolCallEdits} as completed
 * tool calls arrive.
 */
export class AgentHostSnapshotController extends Disposable implements IChatEditingSession {

	readonly supportsKeepUndo = false;
	readonly isGlobalEditingSession = false;

	readonly state: IObservable<ChatEditingSessionState> = constObservable(ChatEditingSessionState.Idle);
	readonly entries: IObservable<readonly IModifiedFileEntry[]> = constObservable([]);

	readonly requestDisablement: IObservable<IChatRequestDisablement[]> = derivedOpts(
		{ equalsFn: (a, b) => a.length === b.length && a.every((v, i) => v.requestId === b[i].requestId && v.afterUndoStop === b[i].afterUndoStop) },
		reader => {
			const currentIdx = this._currentCheckpointIndex.read(reader);
			if (currentIdx >= this._checkpoints.length - 1) {
				return [];
			}
			// Disable every request whose first checkpoint sits past the current
			// index. Keep the first entry per request — if that's the sentinel
			// (undoStopId === undefined) the entire request is disabled.
			const disabled = new Map<string, string | undefined>();
			for (let i = currentIdx + 1; i < this._checkpoints.length; i++) {
				const cp = this._checkpoints[i];
				if (!disabled.has(cp.requestId)) {
					disabled.set(cp.requestId, cp.undoStopId);
				}
			}
			return [...disabled].map(([requestId, afterUndoStop]): IChatRequestDisablement => ({ requestId, afterUndoStop }));
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
	 * Ensures a sentinel checkpoint exists for the given request. Called at the
	 * start of every turn so {@link requestDisablement} and {@link restoreSnapshot}
	 * can reference requests that produce no file edits.
	 *
	 * Also splices away stale checkpoints after the current index (undo branch
	 * semantics) when a new request arrives after a checkpoint restore.
	 */
	ensureRequestCheckpoint(requestId: string): void {
		// Splice stale checkpoints if the user restored a checkpoint
		const currentIdx = this._currentCheckpointIndex.get();
		if (currentIdx < this._checkpoints.length - 1) {
			this._checkpoints.splice(currentIdx + 1);
		}

		// Insert sentinel for this request if it doesn't exist yet
		if (!this._checkpoints.some(cp => cp.requestId === requestId)) {
			this._checkpoints.push({ requestId, undoStopId: undefined, edits: [] });
		}
	}

	/**
	 * Records the before/after content URIs for a completed tool call so we
	 * can revert/replay them later. Idempotent on `toolCallId`.
	 */
	addToolCallEdits(requestId: string, tc: ToolCallState): void {
		if (tc.status !== ToolCallStatus.Completed) {
			return;
		}

		// Deduplicate
		if (this._checkpoints.some(cp => cp.undoStopId === tc.toolCallId)) {
			return;
		}

		this.ensureRequestCheckpoint(requestId);

		const fileEdits = fileEditsToExternalEdits(tc);
		if (fileEdits.length === 0) {
			return;
		}

		const authority = this._connectionAuthority;
		const edits: IToolCallFileEdit[] = fileEdits.map(edit => ({
			kind: edit.kind,
			resource: toAgentHostUri(edit.resource, authority),
			originalResource: edit.originalResource ? toAgentHostUri(edit.originalResource, authority) : undefined,
			beforeContentUri: edit.beforeContentUri ? toAgentHostUri(edit.beforeContentUri, authority) : undefined,
			afterContentUri: edit.afterContentUri ? toAgentHostUri(edit.afterContentUri, authority) : undefined,
			undoStopId: edit.undoStopId,
			diff: edit.diff,
		}));

		this._checkpoints.push({ requestId, undoStopId: tc.toolCallId, edits });

		transaction(tx => {
			this._currentCheckpointIndex.set(this._checkpoints.length - 1, tx);
		});
	}

	// ---- Snapshots ----------------------------------------------------------

	private _findCheckpointIndex(requestId: string, stopId: string | undefined): number {
		if (stopId !== undefined) {
			return this._checkpoints.findIndex(cp => cp.requestId === requestId && cp.undoStopId === stopId);
		}
		// No specific stop: find the sentinel checkpoint (undoStopId === undefined)
		// for this request, which marks the request boundary.
		return this._checkpoints.findIndex(cp => cp.requestId === requestId && cp.undoStopId === undefined);
	}

	private _findCheckpoint(requestId: string, stopId: string | undefined): IAgentHostCheckpoint | undefined {
		if (stopId !== undefined) {
			const idx = this._findCheckpointIndex(requestId, stopId);
			return idx >= 0 ? this._checkpoints[idx] : undefined;
		}
		// No specific stop: find the last non-sentinel checkpoint for this
		// request (the one with actual edits).
		for (let i = this._checkpoints.length - 1; i >= 0; i--) {
			const cp = this._checkpoints[i];
			if (cp.requestId === requestId && cp.undoStopId !== undefined) {
				return cp;
			}
		}
		return undefined;
	}

	async restoreSnapshot(requestId: string, stopId: string | undefined): Promise<void> {
		return this._undoRedoSequencer.queue(async () => {
			const cpIdx = this._findCheckpointIndex(requestId, stopId);
			if (cpIdx < 0) {
				this._logService.warn(`[AgentHostSnapshotController] No checkpoint found for requestId=${requestId}${stopId ? `, stopId=${stopId}` : ''}`);
				return;
			}

			// When stopId is undefined we found the sentinel (request boundary).
			// Navigate to one before it so the request's edits are fully undone.
			const targetIdx = stopId === undefined ? cpIdx - 1 : cpIdx;

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
		});
	}

	getSnapshotUri(requestId: string, uri: URI, stopId: string | undefined): URI | undefined {
		const cp = this._findCheckpoint(requestId, stopId);
		if (!cp) {
			return undefined;
		}
		const uriStr = uri.toString();
		const edit = cp.edits.find(e => e.resource.toString() === uriStr);
		if (!edit) {
			return undefined;
		}
		return URI.from({
			scheme: Schemas.chatEditingSnapshotScheme,
			path: uri.path,
			query: JSON.stringify({ session: this.chatSessionResource.toString(), requestId, undoStop: stopId ?? '' }),
		});
	}

	async getSnapshotContents(requestId: string, uri: URI, stopId: string | undefined): Promise<VSBuffer | undefined> {
		const cp = this._findCheckpoint(requestId, stopId);
		if (!cp) {
			return undefined;
		}
		const uriStr = uri.toString();
		const edit = cp.edits.find(e => e.resource.toString() === uriStr);
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

	async undoInteraction(): Promise<void> { /* no-op */ }
	async redoInteraction(): Promise<void> { /* no-op */ }

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
