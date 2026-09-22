/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { parseChangesetUri } from '../common/changesetUri.js';
import type { InvokeChangesetOperationParams, InvokeChangesetOperationResult } from '../common/state/protocol/channels-changeset/commands.js';
import { AHP_SESSION_NOT_FOUND, JsonRpcErrorCodes, ProtocolError } from '../common/state/sessionProtocol.js';
import { type SessionState } from '../common/state/sessionState.js';
import { ILogService } from '../../log/common/log.js';
import { AGENT_HOST_SYNC_CHANGESET_OPERATION_ID, IChangesetOperationHandler } from '../common/agentHostChangesetOperationService.js';
import { GitRefType, IAgentHostGitService } from '../common/agentHostGitService.js';
import { IAgentHostGitStateService } from '../common/agentHostGitStateService.js';

export class AgentHostSyncOperationHandler implements IChangesetOperationHandler {

	public static readonly OPERATION_SYNC = AGENT_HOST_SYNC_CHANGESET_OPERATION_ID;

	constructor(
		private readonly _getSessionState: (sessionKey: string) => SessionState | undefined,
		private readonly _onSynced: (sessionKey: string) => Promise<void>,
		@IAgentHostGitService private readonly _gitService: IAgentHostGitService,
		@IAgentHostGitStateService private readonly _gitStateService: IAgentHostGitStateService,
		@ILogService private readonly _logService: ILogService,
	) { }

	async invoke(params: InvokeChangesetOperationParams, token: CancellationToken): Promise<InvokeChangesetOperationResult> {
		const parsed = parseChangesetUri(params.channel);
		if (!parsed) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, `Not a changeset URI: ${params.channel}`);
		}
		this._throwIfCancelled(token);

		const ownerUri = parsed.ownerUri;
		const sessionState = this._getSessionState(ownerUri);
		if (!sessionState) {
			throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Session not found: ${parsed.sessionUri}`);
		}

		const workingDirectoryStr = sessionState.workingDirectories?.[0];
		if (!workingDirectoryStr) {
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, `Changeset owner has no working directory: ${ownerUri}`);
		}
		const workingDirectory = URI.parse(workingDirectoryStr);

		const branchName = await (this._gitService.getCurrentBranchName?.(workingDirectory) ?? this._gitService.getCurrentBranch(workingDirectory));
		if (!branchName) {
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, `Could not determine current branch for ${workingDirectory}`);
		}
		this._throwIfCancelled(token);

		const cachedBranchName = this._gitStateService.getSessionGitState?.(ownerUri)?.branchName;
		if (cachedBranchName && cachedBranchName !== branchName) {
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, `Current branch changed from ${cachedBranchName} to ${branchName} for ${workingDirectory}`);
		}

		const branch = await this._gitService.getBranch(workingDirectory, branchName);
		if (branch?.kind !== GitRefType.Head) {
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, `Could not resolve the branch details for ${workingDirectory}, ${branchName}`);
		}
		if (!branch.upstream?.remote) {
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, `Could not resolve the remote for the branch for ${workingDirectory}, ${branchName}`);
		}
		this._throwIfCancelled(token);

		const upstreamRefPrefix = `refs/remotes/${branch.upstream.remote}/`;
		if (!branch.upstream.ref.startsWith(upstreamRefPrefix)) {
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, `Could not resolve the upstream branch for ${workingDirectory}, ${branchName}`);
		}
		const upstreamBranchName = branch.upstream.ref.substring(upstreamRefPrefix.length);

		this._logService.info(`[AgentHostSyncOperationHandler] Syncing branch ${branchName} for ${ownerUri}`);
		try {
			// Pull
			await this._gitService.pull(workingDirectory, {
				remote: branch.upstream.remote,
				ref: upstreamBranchName
			});

			// Push
			await this._gitService.push(workingDirectory, {
				remote: branch.upstream.remote,
				ref: `${branch.ref}:refs/heads/${upstreamBranchName}`
			});
		} catch (err) {
			this._throwIfCancelled(token);
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, `Failed to sync changes: ${err instanceof Error ? err.message : String(err)}`);
		}

		try {
			await this._onSynced(ownerUri);
		} catch (err) {
			this._logService.warn(`[AgentHostSyncOperationHandler] Post-sync refresh failed for ${ownerUri}: ${err instanceof Error ? err.message : String(err)}`);
		}

		return { message: { markdown: localize('agentHost.changeset.sync.synced', "Synced changes.") } };
	}

	private _throwIfCancelled(token: CancellationToken): void {
		if (token.isCancellationRequested) {
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, localize('agentHost.changeset.sync.cancelled', "Sync operation was cancelled."));
		}
	}
}
