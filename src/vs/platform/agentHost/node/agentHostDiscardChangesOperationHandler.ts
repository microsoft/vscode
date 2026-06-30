/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { basename } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { ChangesetKind, parseChangesetUri } from '../common/changesetUri.js';
import { type IChangesetOperationHandler } from '../common/agentHostChangesetOperationService.js';
import { ChangesetOperationTargetKind, type InvokeChangesetOperationParams, type InvokeChangesetOperationResult } from '../common/state/protocol/channels-changeset/commands.js';
import { AHP_SESSION_NOT_FOUND, JsonRpcErrorCodes, ProtocolError } from '../common/state/sessionProtocol.js';
import { type SessionState } from '../common/state/sessionState.js';
import { ILogService } from '../../log/common/log.js';
import { IAgentHostGitService } from '../common/agentHostGitService.js';

export class AgentHostDiscardChangesOperationHandler implements IChangesetOperationHandler {

	public static readonly OPERATION_DISCARD_CHANGES = 'discard-changes';

	constructor(
		private readonly _getSessionState: (sessionKey: string) => SessionState | undefined,
		@IAgentHostGitService private readonly _agentHostGitService: IAgentHostGitService,
		@ILogService private readonly _logService: ILogService,
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
		if (!parsed || parsed.kind !== ChangesetKind.Uncommitted) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, `Not an uncommitted changeset URI: ${params.channel}`);
		}
		this._throwIfCancelled(token);

		const sessionUri = parsed.sessionUri;
		const sessionState = this._getSessionState(sessionUri);
		if (!sessionState) {
			throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Session not found: ${sessionUri}`);
		}

		if (params.target?.kind !== ChangesetOperationTargetKind.Resource) {
			throw new ProtocolError(
				JsonRpcErrorCodes.InvalidParams,
				`Operation '${AgentHostDiscardChangesOperationHandler.OPERATION_DISCARD_CHANGES}' requires a resource target.`);
		}

		const workingDirectoryStr = sessionState.workingDirectory;
		if (!workingDirectoryStr) {
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, `Session has no working directory: ${sessionUri}`);
		}

		const workingDirectory = URI.parse(workingDirectoryStr);
		const resource = URI.parse(params.target.resource);

		this._logService.info(`[AgentHostDiscardChangesOperationHandler] Restoring '${resource.fsPath}' for session ${sessionUri}`);

		try {
			await this._agentHostGitService.restore(workingDirectory, [resource.fsPath]);
		} catch (err) {
			this._throwIfCancelled(token);
			throw new ProtocolError(
				JsonRpcErrorCodes.InternalError,
				`Failed to discard changes: ${err instanceof Error ? err.message : String(err)}`);
		}

		return { message: { markdown: localize('agentHost.changeset.discardChanges.discarded', "Discarded changes to `{0}`.", basename(resource)) } };
	}

	private _throwIfCancelled(token: CancellationToken): void {
		if (token.isCancellationRequested) {
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, localize('agentHost.changeset.discardChanges.cancelled', "Discard changes operation was cancelled."));
		}
	}
}
