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
import { readSessionGitState, type SessionState } from '../common/state/sessionState.js';
import { ILogService } from '../../log/common/log.js';
import { IChangesetOperationHandler } from '../common/agentHostChangesetOperationService.js';
import { IAgentHostGitService } from '../common/agentHostGitService.js';

export class AgentHostSyncOperationHandler implements IChangesetOperationHandler {

	public static readonly OPERATION_SYNC = 'sync';

	constructor(
		private readonly _getSessionState: (sessionKey: string) => SessionState | undefined,
		private readonly _onSynced: (sessionKey: string) => Promise<void>,
		@IAgentHostGitService private readonly _gitService: IAgentHostGitService,
		@ILogService private readonly _logService: ILogService,
	) { }

	async invoke(params: InvokeChangesetOperationParams, token: CancellationToken): Promise<InvokeChangesetOperationResult> {
		const parsed = parseChangesetUri(params.channel);
		if (!parsed) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, `Not a changeset URI: ${params.channel}`);
		}
		this._throwIfCancelled(token);

		const sessionUri = parsed.sessionUri;
		const sessionState = this._getSessionState(sessionUri);
		if (!sessionState) {
			throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Session not found: ${sessionUri}`);
		}

		const workingDirectoryStr = sessionState.workingDirectory;
		if (!workingDirectoryStr) {
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, `Session has no working directory: ${sessionUri}`);
		}
		const workingDirectory = URI.parse(workingDirectoryStr);

		const gitState = readSessionGitState(sessionState._meta);
		const branchName = gitState?.branchName ?? await this._gitService.getCurrentBranch(workingDirectory);
		if (!branchName) {
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, `Could not determine current branch for ${workingDirectory}`);
		}
		this._throwIfCancelled(token);

		this._logService.info(`[AgentHostSyncOperationHandler] Syncing branch ${branchName} for session ${sessionUri}`);
		try {
			// Pull
			await this._gitService.pull(workingDirectory);

			// Push
			await this._gitService.push(workingDirectory);
		} catch (err) {
			this._throwIfCancelled(token);
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, `Failed to sync changes: ${err instanceof Error ? err.message : String(err)}`);
		}

		try {
			await this._onSynced(sessionUri);
		} catch (err) {
			this._logService.warn(`[AgentHostSyncOperationHandler] Post-sync refresh failed for session ${sessionUri}: ${err instanceof Error ? err.message : String(err)}`);
		}

		return { message: { markdown: localize('agentHost.changeset.sync.synced', "Synced changes.") } };
	}

	private _throwIfCancelled(token: CancellationToken): void {
		if (token.isCancellationRequested) {
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, localize('agentHost.changeset.sync.cancelled', "Sync operation was cancelled."));
		}
	}
}
