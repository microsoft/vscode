/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { equals } from '../../../base/common/arrays.js';
import { isCancellationError } from '../../../base/common/errors.js';
import { basename, extUriBiasedIgnorePathCase, relativePath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { FileSystemProviderCapabilities, IFileService } from '../../files/common/files.js';
import { findDeepestContainingWorkingDirectory, isMultiRootSession } from '../common/agentHostWorkingDirectories.js';
import { EMPTY_TREE_OBJECT, IAgentHostGitService } from '../common/agentHostGitService.js';
import { ChangesetKind, parseChangesetUri } from '../common/changesetUri.js';
import { AGENT_HOST_DISCARD_CHANGES_OPERATION_ID, type IChangesetOperationHandler } from '../common/agentHostChangesetOperationService.js';
import { IAgentHostChangesetService, type ITrackedEditSource } from '../common/agentHostChangesetService.js';
import type { IFileEditContent, IFileEditRecord, ISessionDatabase } from '../common/sessionDataService.js';
import { ChangesetOperationTargetKind, type InvokeChangesetOperationParams, type InvokeChangesetOperationResult } from '../common/state/protocol/channels-changeset/commands.js';
import { AHP_SESSION_NOT_FOUND, JsonRpcErrorCodes, ProtocolError } from '../common/state/sessionProtocol.js';
import { FileEditKind, isHostNoticeTurn, lastAttributableTurnId, type ChangesetFile, type SessionState, type URI as ProtocolURI } from '../common/state/sessionState.js';
import { resolveChangesetOwnerScope } from './agentHostBranchChangesetScope.js';
import { AgentHostFileEditRevert, FileEditRevertConflictError, FileEditRevertConflictReason, type IFileEditRevert, type IFileEditRevertStep } from './agentHostFileEditRevert.js';
import { AgentHostStateManager, IAgentHostStateManager } from './agentHostStateManager.js';
import { ILogService } from '../../log/common/log.js';
import { resolveSessionRepositories } from './agentHostSessionRepositories.js';
import { parseGitBlobUri } from './gitDiffContent.js';
import { createFileEditDiscardRecord, createSessionFileEditDiscardRecords, getUndiscardedFileEditRevertSteps, readFileEditRevertSteps, spanFileEditRevertSteps } from './fileEditDiscard.js';
import { createFileEditAcceptRecordAfter, getUnacceptedFileEditRecords, isFileEditAcceptRecord } from './fileEditAccept.js';
import { isPathWithinFolderScope } from './sessionDiffAggregator.js';

/**
 * The turn that the Last Turn Changes changeset of `owner` shows: the turn in
 * progress, otherwise the latest completed turn that can own file changes.
 */
export function getLastTurn(stateManager: AgentHostStateManager, owner: ProtocolURI): { readonly id: string; readonly inProgress: boolean } | undefined {
	const state = stateManager.getSessionState(owner);
	if (!state) {
		return undefined;
	}
	if (state.activeTurn && !isHostNoticeTurn(state.activeTurn)) {
		return { id: state.activeTurn.id, inProgress: true };
	}
	const id = lastAttributableTurnId(state.turns);
	return id === undefined ? undefined : { id, inProgress: false };
}

function isFilePath(path: string | undefined, resource: URI): boolean {
	return path !== undefined && extUriBiasedIgnorePathCase.isEqual(URI.file(path), resource);
}

/** A file's recorded edits to discard, and how to record and check the discard. */
interface IRecordedEditsDiscard {
	/** The database the edits are recorded in, where the discard is recorded. */
	readonly db: ISessionDatabase;
	/**
	 * The file's edit records, in the order they were made, including rows of
	 * earlier discards. Must not include renames or rows that record accepting
	 * changes.
	 */
	readonly records: readonly IFileEditRecord[];
	/**
	 * Turns whose records include accepted ones that {@link records} leaves
	 * out, when only the changes since the file was last accepted are discarded.
	 */
	readonly acceptedTurns?: ReadonlySet<string>;
	/** Builds the rows that record the discard, given one step per record. */
	createRows(steps: readonly IFileEditRevertStep[]): (IFileEditRecord & IFileEditContent)[];
	/** Throws when a turn ran since the records were read. */
	throwIfTurnRan(): void;
	/**
	 * Throws when the file's records changed since they were read, as when its
	 * changes were accepted meanwhile, given the rows that record the discard.
	 * Runs in the transaction that records the discard, before the file changes.
	 */
	throwIfRecordsChanged?(discardRows: readonly IFileEditRecord[]): Promise<void>;
	/** Recomputes the changesets that may include rows whose recording failed. */
	recompute(): void;
}

export class AgentHostDiscardChangesOperationHandler implements IChangesetOperationHandler {

	public static readonly OPERATION_DISCARD_CHANGES = AGENT_HOST_DISCARD_CHANGES_OPERATION_ID;

	constructor(
		private readonly _getSessionState: (sessionKey: string) => SessionState | undefined,
		private readonly _onDiscarded: (sessionKey: string) => Promise<void>,
		private readonly _fileEditRevert: AgentHostFileEditRevert,
		@IAgentHostGitService private readonly _agentHostGitService: IAgentHostGitService,
		@IFileService private readonly _fileService: IFileService,
		@ILogService private readonly _logService: ILogService,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostChangesetService private readonly _changesets: IAgentHostChangesetService,
	) { }

	async invoke(params: InvokeChangesetOperationParams, token: CancellationToken): Promise<InvokeChangesetOperationResult> {
		const abortController = new AbortController();
		if (token.isCancellationRequested) {
			abortController.abort();
		}
		const cancellationListener = token.onCancellationRequested(() => abortController.abort());
		try {
			return await this._invoke(params, token, abortController.signal);
		} finally {
			cancellationListener.dispose();
		}
	}

	private async _invoke(params: InvokeChangesetOperationParams, token: CancellationToken, _signal: AbortSignal): Promise<InvokeChangesetOperationResult> {
		const parsed = parseChangesetUri(params.channel);
		if (parsed?.kind === ChangesetKind.Turn && parsed.turnId !== undefined) {
			return this._discardTurnFile(params, parsed.ownerUri, parsed.turnId, token);
		}
		if (parsed?.kind === ChangesetKind.Session || parsed?.kind === ChangesetKind.WorkingSet) {
			return this._discardSessionFile(params, parsed.ownerUri, resolveChangesetOwnerScope(this._stateManager, parsed.ownerUri).sessionUri, parsed.kind === ChangesetKind.WorkingSet, token);
		}
		if (!parsed || (parsed.kind !== ChangesetKind.Branch && parsed.kind !== ChangesetKind.Uncommitted)) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, `Not a branch or uncommitted changeset URI: ${params.channel}`);
		}
		this._throwIfCancelled(token);

		const scope = resolveChangesetOwnerScope(this._stateManager, parsed.ownerUri);
		const sessionUri = scope.sessionUri;
		const sessionState = this._getSessionState(scope.sourceUri);
		if (!sessionState) {
			throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Session not found: ${sessionUri}`);
		}

		if (params.target?.kind !== ChangesetOperationTargetKind.Resource) {
			throw new ProtocolError(
				JsonRpcErrorCodes.InvalidParams,
				`Operation '${AgentHostDiscardChangesOperationHandler.OPERATION_DISCARD_CHANGES}' requires a resource target.`);
		}

		const workingDirectoryStr = scope.workingDirectories[0];
		if (!workingDirectoryStr) {
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, `Changeset owner has no working directory: ${parsed.ownerUri}`);
		}

		const resource = URI.parse(params.target.resource);
		const changesetFile = this._findChangesetFile(params.channel, resource);
		if (!changesetFile) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, `Resource is not part of the ${parsed.kind} changeset: ${params.target.resource}`);
		}

		try {
			const repositoryRoot = await this._resolveRepositoryRoot(scope.workingDirectories, resource);
			if (!repositoryRoot) {
				throw new Error(`No changeset repository contains '${resource.fsPath}'.`);
			}
			this._throwIfCancelled(token);

			if (parsed.kind === ChangesetKind.Branch) {
				await this._discardBranchChange(repositoryRoot, changesetFile, sessionUri, token);
			} else {
				await this._discardUncommittedChange(repositoryRoot, resource, sessionUri, token);
			}
		} catch (err) {
			this._throwIfCancelled(token);
			throw new ProtocolError(
				JsonRpcErrorCodes.InternalError,
				`Failed to discard changes: ${err instanceof Error ? err.message : String(err)}`);
		}
		void this._onDiscarded(parsed.ownerUri).catch(err => {
			this._logService.warn(`[AgentHostDiscardChangesOperationHandler] Post-discard refresh failed for ${parsed.ownerUri}: ${err instanceof Error ? err.message : String(err)}`);
		});

		return { message: { markdown: localize('agentHost.changeset.discardChanges.discarded', "Discarded changes to `{0}`.", basename(resource)) } };
	}

	private _findChangesetFile(channel: string, resource: URI): ChangesetFile | undefined {
		return this._stateManager.getChangesetState(channel)?.files.find(file =>
			[file.edit.after?.uri, file.edit.before?.uri].some(uri => uri !== undefined && extUriBiasedIgnorePathCase.isEqual(URI.parse(uri), resource)));
	}

	private async _resolveRepositoryRoot(workingDirectories: readonly string[], resource: URI): Promise<URI | undefined> {
		const { gitRepositories } = await resolveSessionRepositories(
			workingDirectories.map(workingDirectory => URI.parse(workingDirectory)),
			this._agentHostGitService,
		);
		if (gitRepositories.length === 1) {
			return gitRepositories[0];
		}
		return findDeepestContainingWorkingDirectory(resource, gitRepositories);
	}

	private async _discardUncommittedChange(repositoryRoot: URI, resource: URI, sessionUri: string, token: CancellationToken): Promise<void> {
		if (await this._isUntracked(repositoryRoot, resource)) {
			this._throwIfCancelled(token);
			await this._deleteResource(resource, sessionUri);
			return;
		}

		this._throwIfCancelled(token);
		this._logService.info(`[AgentHostDiscardChangesOperationHandler] Restoring '${resource.fsPath}' for session ${sessionUri}`);
		await this._agentHostGitService.restore(repositoryRoot, [resource.fsPath]);
	}

	private async _discardBranchChange(repositoryRoot: URI, file: ChangesetFile, sessionUri: string, token: CancellationToken): Promise<void> {
		const before = file.edit.before;
		const after = file.edit.after;
		if (!before && !after) {
			throw new Error(`Changeset file '${file.id}' has no before or after state.`);
		}

		if (before) {
			const baseline = parseGitBlobUri(before.content.uri);
			if (!baseline) {
				throw new Error(`Changeset file '${file.id}' has no Git baseline.`);
			}
			await this._agentHostGitService.restore(repositoryRoot, [baseline.repoRelativePath], { staged: true, ref: baseline.sha });
			this._throwIfCancelled(token);

			// Git paths are case-sensitive even on case-insensitive file systems, so a case-only rename is still a rename.
			if (after && this._getRepositoryRelativePath(repositoryRoot, URI.parse(after.uri)) !== baseline.repoRelativePath) {
				await this._discardBranchAddition(repositoryRoot, URI.parse(after.uri), sessionUri, token);
			}

			this._logService.info(`[AgentHostDiscardChangesOperationHandler] Restoring '${before.uri}' from '${baseline.sha}' for session ${sessionUri}`);
			await this._agentHostGitService.restore(repositoryRoot, [baseline.repoRelativePath], { ref: baseline.sha });
			return;
		}

		await this._discardBranchAddition(repositoryRoot, URI.parse(after!.uri), sessionUri, token);
	}

	private async _discardBranchAddition(repositoryRoot: URI, resource: URI, sessionUri: string, token: CancellationToken): Promise<void> {
		const isUntracked = await this._isUntracked(repositoryRoot, resource);
		this._throwIfCancelled(token);
		if (!isUntracked) {
			await this._agentHostGitService.restore(repositoryRoot, [this._getRepositoryRelativePath(repositoryRoot, resource)], { staged: true, ref: EMPTY_TREE_OBJECT });
			this._throwIfCancelled(token);
		}
		await this._deleteResource(resource, sessionUri);
	}

	private _getRepositoryRelativePath(repositoryRoot: URI, resource: URI): string {
		const repositoryRelativePath = relativePath(repositoryRoot, resource);
		if (repositoryRelativePath === undefined) {
			throw new Error(`Resource '${resource.fsPath}' is outside repository '${repositoryRoot.fsPath}'.`);
		}
		return repositoryRelativePath;
	}

	private async _isUntracked(repositoryRoot: URI, resource: URI): Promise<boolean> {
		const untrackedPaths = await this._agentHostGitService.getUntrackedPaths(repositoryRoot);
		return untrackedPaths?.some(path => extUriBiasedIgnorePathCase.isEqual(URI.joinPath(repositoryRoot, path), resource)) === true;
	}

	private async _deleteResource(resource: URI, sessionUri: string): Promise<void> {
		const useTrash = this._fileService.hasCapability(resource, FileSystemProviderCapabilities.Trash);
		this._logService.info(`[AgentHostDiscardChangesOperationHandler] Deleting '${resource.fsPath}' for session ${sessionUri} (useTrash: ${useTrash})`);
		await this._fileService.del(resource, { useTrash });
	}

	/**
	 * Reverts the edits that the latest turn of `owner` made to the target file,
	 * keeping every other change to it, then records the discard as a synthetic
	 * edit row in that turn so the file leaves the turn's and the session's
	 * changesets.
	 */
	private async _discardTurnFile(params: InvokeChangesetOperationParams, owner: ProtocolURI, turnId: string, token: CancellationToken): Promise<InvokeChangesetOperationResult> {
		this._throwIfCancelled(token);
		const resource = this._getResourceTarget(params);
		if (!this._stateManager.getSessionState(owner)) {
			throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Session not found: ${owner}`);
		}
		this._throwIfNotCompletedLastTurn(owner, turnId);
		this._throwIfOutsideWorkingDirectories(resource, resolveChangesetOwnerScope(this._stateManager, owner).workingDirectories, owner);

		const source = this._changesets.openTrackedTurnDatabase(owner, turnId);
		if (!source) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('agentHost.changeset.discardTurnChanges.ambiguousTurn', "Changes from a turn that belongs to more than one chat can't be discarded."));
		}
		try {
			const records = this._getFileEditRecords(await source.db.getFileEditsByTurn(turnId), resource, source.folderScope).filter(record => !isFileEditAcceptRecord(record));
			if (records.length === 0) {
				throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('agentHost.changeset.discardTurnChanges.notInTurn', "'{0}' has no changes in the last turn.", basename(resource)));
			}
			await this._throwIfEditedByOtherChats(source.otherChatDatabases, resource);

			this._logService.info(`[AgentHostDiscardChangesOperationHandler] Discarding last turn changes to '${resource.fsPath}' for ${owner} (turn ${turnId})`);
			await this._discardRecordedEdits(resource, {
				db: source.db,
				records,
				// Record the discard in the database turn id, which can differ
				// from the changeset's turn id after a restore.
				createRows: steps => [createFileEditDiscardRecord(records[0].turnId, records[records.length - 1].filePath, spanFileEditRevertSteps(steps))],
				throwIfTurnRan: () => this._throwIfNotCompletedLastTurn(owner, turnId),
				recompute: () => this._changesets.onFileEditsDiscarded(owner, [turnId]),
			}, token);
		} catch (err) {
			throw this._toDiscardError(err, resource, localize('agentHost.changeset.discardTurnChanges.conflict', "Couldn't discard the last turn's changes to '{0}' because the same lines were changed after the turn.", basename(resource)));
		} finally {
			source.dispose();
		}

		this._changesets.onFileEditsDiscarded(owner, [turnId]);
		this._notifyDiscarded(owner);

		return { message: { markdown: localize('agentHost.changeset.discardTurnChanges.discarded', "Discarded the last turn's changes to `{0}`.", basename(resource)) } };
	}

	/**
	 * Reverts a file's recorded edits and records the discard. Each edit is
	 * reverted separately, so changes made between them, such as the user's
	 * between two tool calls, are kept. Edits that an earlier discard undid
	 * aren't reverted again, but their records still span their turn's rows.
	 * The file only changes inside the transaction that records the discard,
	 * after checking that no turn ran meanwhile: a turn's edits would be
	 * recorded before the discard. When the discard can't be recorded, the
	 * file is put back.
	 */
	private async _discardRecordedEdits(resource: URI, discard: IRecordedEditsDiscard, token: CancellationToken): Promise<void> {
		const steps = await readFileEditRevertSteps(discard.db, discard.records);
		this._throwIfCancelled(token);
		const revert = await this._fileEditRevert.prepare(resource, getUndiscardedFileEditRevertSteps(discard.records, steps, discard.acceptedTurns), token);
		try {
			const rows = discard.createRows(steps);
			await discard.db.storeFileEdits(rows, async () => {
				discard.throwIfTurnRan();
				await discard.throwIfRecordsChanged?.(rows);
				await revert.apply();
			});
		} catch (err) {
			await this._undoRevert(revert, resource);
			// A changeset computed while the rows were recorded may include them.
			discard.recompute();
			throw err;
		}
	}

	/**
	 * Reverts the edits that every turn made to the target file, keeping every
	 * other change to it, then records the discard as one synthetic edit row
	 * per turn so the file leaves the Session Changes changeset and every
	 * turn's changeset. A file the session created is deleted. With
	 * `sinceAccepted`, for the Working Set, only the edits since the file's
	 * changes were last accepted are reverted, which restores the accepted
	 * content.
	 */
	private async _discardSessionFile(params: InvokeChangesetOperationParams, owner: ProtocolURI, session: ProtocolURI, sinceAccepted: boolean, token: CancellationToken): Promise<InvokeChangesetOperationResult> {
		this._throwIfCancelled(token);
		const resource = this._getResourceTarget(params);
		if (!this._stateManager.getSessionState(owner)) {
			throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Session not found: ${owner}`);
		}
		this._throwIfTurnActive(session);
		const turnsBefore = this._getSessionTurnsKey(session);
		const messages = sinceAccepted ? {
			multiRoot: localize('agentHost.changeset.discardWorkingSetChanges.multiRoot', "Changes that have not been accepted can't be discarded in a session with more than one folder."),
			noChanges: localize('agentHost.changeset.discardWorkingSetChanges.noChanges', "'{0}' has no changes that have not been accepted.", basename(resource)),
			turnRan: localize('agentHost.changeset.discardWorkingSetChanges.turnRanDuringDiscard', "A turn ran while the changes to '{0}' were being discarded. Try again.", basename(resource)),
			conflict: localize('agentHost.changeset.discardWorkingSetChanges.conflict', "Couldn't discard the changes to '{0}' that have not been accepted because the same lines were changed outside of the session.", basename(resource)),
			discarded: localize('agentHost.changeset.discardWorkingSetChanges.discarded', "Discarded the changes to `{0}` that have not been accepted.", basename(resource)),
		} : {
			multiRoot: localize('agentHost.changeset.discardSessionChanges.multiRoot', "Session changes can't be discarded in a session with more than one folder."),
			noChanges: localize('agentHost.changeset.discardSessionChanges.notInSession', "'{0}' has no changes made by the session.", basename(resource)),
			turnRan: localize('agentHost.changeset.discardSessionChanges.turnRanDuringDiscard', "A turn ran while the session's changes to '{0}' were being discarded. Try again.", basename(resource)),
			conflict: localize('agentHost.changeset.discardSessionChanges.conflict', "Couldn't discard the session's changes to '{0}' because the same lines were changed outside of the session.", basename(resource)),
			discarded: localize('agentHost.changeset.discardSessionChanges.discarded', "Discarded the session's changes to `{0}`.", basename(resource)),
		};

		const tracked = this._changesets.openTrackedSessionDatabases(owner);
		let discardedChat: ProtocolURI;
		try {
			if (isMultiRootSession(tracked.workingDirectories)) {
				throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, messages.multiRoot);
			}
			this._throwIfOutsideWorkingDirectories(resource, tracked.workingDirectories, owner);

			const matches: { readonly source: ITrackedEditSource; readonly records: readonly IFileEditRecord[] }[] = [];
			for (const source of tracked.sources) {
				const records = this._getFileEditRecords(await source.db.getAllFileEdits(), resource, tracked.folderScope);
				if (records.length > 0) {
					matches.push({ source, records });
				}
			}
			this._throwIfCancelled(token);
			const [match, ...otherMatches] = matches;
			if (!match) {
				throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, messages.noChanges);
			}
			await this._throwIfEditedByOtherChats([...otherMatches.map(other => other.source.db), ...tracked.otherChatDatabases], resource);

			const { source } = match;
			const { records, acceptedTurns } = sinceAccepted
				? getUnacceptedFileEditRecords(match.records)
				: { records: match.records.filter(record => !isFileEditAcceptRecord(record)), acceptedTurns: undefined };
			if (records.length === 0) {
				throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, messages.noChanges);
			}
			this._logService.info(`[AgentHostDiscardChangesOperationHandler] Discarding ${sinceAccepted ? 'unaccepted' : 'session'} changes to '${resource.fsPath}' for ${owner} (${records.length} edits)`);
			await this._discardRecordedEdits(resource, {
				db: source.db,
				records,
				acceptedTurns,
				createRows: steps => {
					const rows = createSessionFileEditDiscardRecords(records, steps);
					// The discard rows span whole turns, which can include changes made
					// between their edits that the file kept. Recording the restored
					// content as accepted keeps those out of the Working Set.
					return sinceAccepted ? [...rows, createFileEditAcceptRecordAfter(rows[rows.length - 1])] : rows;
				},
				// A turn that ran meanwhile, in any chat, could have recorded
				// edits that the rows would hide.
				throwIfTurnRan: () => {
					this._throwIfTurnActive(session);
					if (this._getSessionTurnsKey(session) !== turnsBefore) {
						throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, messages.turnRan);
					}
				},
				// Accepting the file's changes meanwhile, as another client can, would
				// make the unaccepted records stale, and reverting them would undo
				// the accepted changes.
				throwIfRecordsChanged: sinceAccepted ? async discardRows => {
					const discardRowIds = new Set(discardRows.map(row => row.toolCallId));
					const current = this._getFileEditRecords(await source.db.getAllFileEdits(), resource, tracked.folderScope)
						.filter(record => !discardRowIds.has(record.toolCallId));
					if (!equals(current, match.records, (a, b) => a.toolCallId === b.toolCallId)) {
						throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, this._getChangedDuringDiscardMessage(resource));
					}
				} : undefined,
				recompute: () => this._onSessionFileEditsDiscarded(source.chat),
			}, token);
			discardedChat = source.chat;
		} catch (err) {
			throw this._toDiscardError(err, resource, messages.conflict);
		} finally {
			tracked.dispose();
		}

		this._onSessionFileEditsDiscarded(discardedChat);
		this._notifyDiscarded(owner);

		return { message: { markdown: messages.discarded } };
	}

	/**
	 * Recomputes the changesets of `chat` after its edits were discarded from
	 * Session Changes. Turn changesets are keyed by the chat's turn IDs, which
	 * can differ from the recorded ones after a restore, so every turn is
	 * passed; only subscribed ones are recomputed.
	 */
	private _onSessionFileEditsDiscarded(chat: ProtocolURI): void {
		this._changesets.onFileEditsDiscarded(chat, this._stateManager.getSessionState(chat)?.turns.map(turn => turn.id) ?? []);
	}

	private _getResourceTarget(params: InvokeChangesetOperationParams): URI {
		if (params.target?.kind !== ChangesetOperationTargetKind.Resource) {
			throw new ProtocolError(
				JsonRpcErrorCodes.InvalidParams,
				`Operation '${AgentHostDiscardChangesOperationHandler.OPERATION_DISCARD_CHANGES}' requires a resource target.`);
		}
		return URI.parse(params.target.resource);
	}

	/**
	 * Returns the edit records of `resource` among `records`, including those
	 * that record accepting its changes, or none when it is outside
	 * `folderScope`. A renamed file's records span more than one path, so a
	 * rename that touches `resource` is rejected.
	 */
	private _getFileEditRecords(records: readonly IFileEditRecord[], resource: URI, folderScope: readonly URI[] | undefined): IFileEditRecord[] {
		if (records.some(record => record.kind === FileEditKind.Rename && (isFilePath(record.filePath, resource) || isFilePath(record.originalPath, resource)))) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('agentHost.changeset.discardTurnChanges.renamed', "Changes to a renamed file can't be discarded."));
		}
		return records.filter(record => isFilePath(record.filePath, resource) && (!folderScope || isPathWithinFolderScope(record.filePath, folderScope)));
	}

	/**
	 * Session Changes combine every chat's edits without ordering them by time,
	 * so a discard can't be reconciled with another chat's edits to the file.
	 */
	private async _throwIfEditedByOtherChats(otherChatDatabases: readonly ISessionDatabase[], resource: URI): Promise<void> {
		for (const db of otherChatDatabases) {
			const records = await db.getAllFileEdits();
			if (records.some(record => isFilePath(record.filePath, resource) || isFilePath(record.originalPath, resource))) {
				throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('agentHost.changeset.discardTurnChanges.otherChat', "Changes to '{0}' can't be discarded because another chat in this session also changed it.", basename(resource)));
			}
		}
	}

	private _throwIfOutsideWorkingDirectories(resource: URI, workingDirectories: readonly ProtocolURI[] | undefined, owner: ProtocolURI): void {
		if (!workingDirectories?.length) {
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, `Changeset owner has no working directory: ${owner}`);
		}
		const isInWorkingDirectory = workingDirectories.some(workingDirectory =>
			extUriBiasedIgnorePathCase.isEqualOrParent(resource, URI.parse(workingDirectory)));
		if (!isInWorkingDirectory) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('agentHost.changeset.discardRecordedChanges.outsideWorkspace', "Changes can only be discarded for files in this session's workspace."));
		}
	}

	/**
	 * Maps a failed revert of recorded edits to the error the client shows,
	 * using `conflictMessage` for conflicts with later changes.
	 */
	private _toDiscardError(err: unknown, resource: URI, conflictMessage: string): ProtocolError {
		if (err instanceof ProtocolError) {
			return err;
		}
		if (isCancellationError(err)) {
			return this._createCancelledError();
		}
		if (err instanceof FileEditRevertConflictError) {
			const message = err.reason === FileEditRevertConflictReason.ChangedDuringRevert
				? this._getChangedDuringDiscardMessage(resource)
				: conflictMessage;
			return new ProtocolError(JsonRpcErrorCodes.InternalError, message);
		}
		return new ProtocolError(
			JsonRpcErrorCodes.InternalError,
			`Failed to discard changes: ${err instanceof Error ? err.message : String(err)}`);
	}

	private _getChangedDuringDiscardMessage(resource: URI): string {
		return localize('agentHost.changeset.discardTurnChanges.changedDuringDiscard', "'{0}' changed while its changes were being discarded. Try again.", basename(resource));
	}

	private _notifyDiscarded(owner: ProtocolURI): void {
		void this._onDiscarded(owner).catch(err => {
			this._logService.warn(`[AgentHostDiscardChangesOperationHandler] Post-discard refresh failed for ${owner}: ${err instanceof Error ? err.message : String(err)}`);
		});
	}

	/**
	 * Puts the file back when the discard couldn't be committed after the file
	 * was changed, so the file and its changesets agree.
	 */
	private async _undoRevert(revert: IFileEditRevert, resource: URI): Promise<void> {
		try {
			if (!await revert.undo()) {
				this._logService.warn(`[AgentHostDiscardChangesOperationHandler] Could not restore '${resource.fsPath}' after failing to record the discard because it changed in the meantime`);
			}
		} catch (err) {
			this._logService.warn(`[AgentHostDiscardChangesOperationHandler] Could not restore '${resource.fsPath}' after failing to record the discard: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	private _throwIfCancelled(token: CancellationToken): void {
		if (token.isCancellationRequested) {
			throw this._createCancelledError();
		}
	}

	private _createCancelledError(): ProtocolError {
		return new ProtocolError(JsonRpcErrorCodes.InternalError, localize('agentHost.changeset.discardChanges.cancelled', "Discard changes operation was cancelled."));
	}

	/** Throws unless `turnId` is the owner's last turn and has completed. */
	private _throwIfNotCompletedLastTurn(owner: ProtocolURI, turnId: string): void {
		const lastTurn = getLastTurn(this._stateManager, owner);
		if (lastTurn?.id !== turnId) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('agentHost.changeset.discardTurnChanges.notLatestTurn', "These changes are no longer from the last turn. Refresh the changes and try again."));
		}
		if (lastTurn.inProgress) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('agentHost.changeset.discardTurnChanges.turnInProgress', "Changes can't be discarded while the turn is running."));
		}
	}

	/** Throws while a turn runs in any chat of `session`. */
	private _throwIfTurnActive(session: ProtocolURI): void {
		if (this._stateManager.hasActiveTurn(session)) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('agentHost.changeset.discardSessionChanges.turnInProgress', "Changes can't be discarded while a turn is running."));
		}
	}

	/** Identifies the turns of `session` and every chat in it, so a turn that ran in the meantime is noticed. */
	private _getSessionTurnsKey(session: ProtocolURI): string {
		const chats = this._stateManager.getSessionState(session)?.chats ?? [];
		return JSON.stringify([session, ...chats.map(chat => chat.resource)].map(owner => {
			const state = this._stateManager.getSessionState(owner);
			return [owner, state?.turns.length, state?.turns.at(-1)?.id, state?.activeTurn?.id];
		}));
	}
}
