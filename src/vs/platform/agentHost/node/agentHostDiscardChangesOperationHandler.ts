/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { isCancellationError } from '../../../base/common/errors.js';
import { basename, extUriBiasedIgnorePathCase, relativePath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { FileSystemProviderCapabilities, IFileService } from '../../files/common/files.js';
import { findDeepestContainingWorkingDirectory } from '../common/agentHostWorkingDirectories.js';
import { EMPTY_TREE_OBJECT, IAgentHostGitService } from '../common/agentHostGitService.js';
import { ChangesetKind, parseChangesetUri } from '../common/changesetUri.js';
import { AGENT_HOST_DISCARD_CHANGES_OPERATION_ID, type IChangesetOperationHandler } from '../common/agentHostChangesetOperationService.js';
import { IAgentHostChangesetService } from '../common/agentHostChangesetService.js';
import type { IFileEditRecord, ISessionDatabase } from '../common/sessionDataService.js';
import { ChangesetOperationTargetKind, type InvokeChangesetOperationParams, type InvokeChangesetOperationResult } from '../common/state/protocol/channels-changeset/commands.js';
import { AHP_SESSION_NOT_FOUND, JsonRpcErrorCodes, ProtocolError } from '../common/state/sessionProtocol.js';
import { FileEditKind, isHostNoticeTurn, lastAttributableTurnId, type ChangesetFile, type SessionState, type URI as ProtocolURI } from '../common/state/sessionState.js';
import { resolveChangesetOwnerScope } from './agentHostBranchChangesetScope.js';
import { AgentHostFileEditRevert, FileEditRevertConflictError, FileEditRevertConflictReason, type IFileEditRevert } from './agentHostFileEditRevert.js';
import { AgentHostStateManager, IAgentHostStateManager } from './agentHostStateManager.js';
import { ILogService } from '../../log/common/log.js';
import { resolveSessionRepositories } from './agentHostSessionRepositories.js';
import { parseGitBlobUri } from './gitDiffContent.js';
import { createFileEditDiscardRecord, readFileEditRevertSteps, spanFileEditRevertSteps } from './fileEditDiscard.js';
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
			const records = this._getFileEditRecords(await source.db.getFileEditsByTurn(turnId), resource, source.folderScope);
			if (records.length === 0) {
				throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('agentHost.changeset.discardTurnChanges.notInTurn', "'{0}' has no changes in the last turn.", basename(resource)));
			}
			await this._throwIfEditedByOtherChats(source.otherChatDatabases, resource);

			// One step per recorded edit, so changes made between the turn's own
			// edits, such as the user's between two tool calls, are kept.
			const steps = await readFileEditRevertSteps(source.db, records);
			this._throwIfCancelled(token);
			this._logService.info(`[AgentHostDiscardChangesOperationHandler] Discarding last turn changes to '${resource.fsPath}' for ${owner} (turn ${turnId})`);
			const revert = await this._fileEditRevert.prepare(resource, steps, token);
			try {
				// Record the discard in the database turn id, which can differ from
				// the changeset's turn id after a restore. The file only changes
				// inside the recording's transaction, after checking the turn again:
				// a turn that started meanwhile would record its edits before the
				// row, and a recreated file couldn't be deleted again.
				await source.db.storeFileEdits(
					[createFileEditDiscardRecord(records[0].turnId, records[records.length - 1].filePath, spanFileEditRevertSteps(steps))],
					async () => {
						this._throwIfNotCompletedLastTurn(owner, turnId);
						await revert.apply();
					},
				);
			} catch (err) {
				await this._undoRevert(revert, resource);
				// A changeset computed while the row was recorded may include it.
				this._changesets.onFileEditsDiscarded(owner, [turnId]);
				throw err;
			}
		} catch (err) {
			throw this._toDiscardError(err, resource, localize('agentHost.changeset.discardTurnChanges.conflict', "Couldn't discard the last turn's changes to '{0}' because the same lines were changed after the turn.", basename(resource)));
		} finally {
			source.dispose();
		}

		this._changesets.onFileEditsDiscarded(owner, [turnId]);
		this._notifyDiscarded(owner);

		return { message: { markdown: localize('agentHost.changeset.discardTurnChanges.discarded', "Discarded the last turn's changes to `{0}`.", basename(resource)) } };
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
	 * Returns the edit records of `resource` among `records`, or none when it is
	 * outside `folderScope`. A renamed file's records span more than one path,
	 * so a rename that touches `resource` is rejected.
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

	/** Maps a failed revert of recorded edits to the error the client shows. */
	private _toDiscardError(err: unknown, resource: URI, conflictMessage: string): ProtocolError {
		if (err instanceof ProtocolError) {
			return err;
		}
		if (isCancellationError(err)) {
			return this._createCancelledError();
		}
		if (err instanceof FileEditRevertConflictError) {
			let message = conflictMessage;
			if (err.reason === FileEditRevertConflictReason.ChangedDuringRevert) {
				message = localize('agentHost.changeset.discardTurnChanges.changedDuringDiscard', "'{0}' changed while its changes were being discarded. Try again.", basename(resource));
			} else if (err.reason === FileEditRevertConflictReason.ConditionalDeleteUnavailable) {
				message = localize('agentHost.changeset.discardTurnChanges.createdFile', "The last turn created '{0}', which can't be discarded safely. Delete the file manually if it is no longer needed.", basename(resource));
			}
			return new ProtocolError(JsonRpcErrorCodes.InternalError, message);
		}
		return new ProtocolError(
			JsonRpcErrorCodes.InternalError,
			`Failed to discard changes: ${err instanceof Error ? err.message : String(err)}`);
	}

	private _notifyDiscarded(owner: ProtocolURI): void {
		void this._onDiscarded(owner).catch(err => {
			this._logService.warn(`[AgentHostDiscardChangesOperationHandler] Post-discard refresh failed for ${owner}: ${err instanceof Error ? err.message : String(err)}`);
		});
	}

	/**
	 * Puts the file back when the discard couldn't be committed after the file
	 * was changed, so the file and its changesets agree. A recreated file can't
	 * be deleted again, so it stays.
	 */
	private async _undoRevert(revert: IFileEditRevert, resource: URI): Promise<void> {
		try {
			if (!await revert.undo()) {
				this._logService.warn(`[AgentHostDiscardChangesOperationHandler] Could not restore '${resource.fsPath}' after failing to record the discard because it changed in the meantime or was recreated`);
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
}
