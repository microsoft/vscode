/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { basename, extUriBiasedIgnorePathCase, relativePath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { FileSystemProviderCapabilities, IFileService } from '../../files/common/files.js';
import { findDeepestContainingWorkingDirectory } from '../common/agentHostWorkingDirectories.js';
import { EMPTY_TREE_OBJECT, IAgentHostGitService } from '../common/agentHostGitService.js';
import { ChangesetKind, parseChangesetUri } from '../common/changesetUri.js';
import { type IChangesetOperationHandler } from '../common/agentHostChangesetOperationService.js';
import { ChangesetOperationTargetKind, type InvokeChangesetOperationParams, type InvokeChangesetOperationResult } from '../common/state/protocol/channels-changeset/commands.js';
import { AHP_SESSION_NOT_FOUND, JsonRpcErrorCodes, ProtocolError } from '../common/state/sessionProtocol.js';
import { type ChangesetFile, type SessionState } from '../common/state/sessionState.js';
import { resolveChangesetOwnerScope } from './agentHostBranchChangesetScope.js';
import { AgentHostStateManager, IAgentHostStateManager } from './agentHostStateManager.js';
import { ILogService } from '../../log/common/log.js';
import { resolveSessionRepositories } from './agentHostSessionRepositories.js';
import { parseGitBlobUri } from './gitDiffContent.js';

export class AgentHostDiscardChangesOperationHandler implements IChangesetOperationHandler {

	public static readonly OPERATION_DISCARD_CHANGES = 'discard-changes';

	constructor(
		private readonly _getSessionState: (sessionKey: string) => SessionState | undefined,
		private readonly _onDiscarded: (sessionKey: string) => Promise<void>,
		@IAgentHostGitService private readonly _agentHostGitService: IAgentHostGitService,
		@IFileService private readonly _fileService: IFileService,
		@ILogService private readonly _logService: ILogService,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
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

	private _throwIfCancelled(token: CancellationToken): void {
		if (token.isCancellationRequested) {
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, localize('agentHost.changeset.discardChanges.cancelled', "Discard changes operation was cancelled."));
		}
	}
}
