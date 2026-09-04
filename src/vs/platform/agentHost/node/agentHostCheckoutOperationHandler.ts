/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { ILogService } from '../../log/common/log.js';
import { AGENT_HOST_CHECKOUT_CHANGESET_OPERATION_ID, type IChangesetOperationHandler } from '../common/agentHostChangesetOperationService.js';
import { IAgentHostGitService } from '../common/agentHostGitService.js';
import { ChangesetKind, parseChangesetUri } from '../common/changesetUri.js';
import { readCheckoutOperationTreeish } from '../common/meta/agentCheckoutOperationMeta.js';
import type { InvokeChangesetOperationParams, InvokeChangesetOperationResult } from '../common/state/protocol/channels-changeset/commands.js';
import { AHP_SESSION_NOT_FOUND, JsonRpcErrorCodes, ProtocolError } from '../common/state/sessionProtocol.js';
import type { SessionState } from '../common/state/sessionState.js';

export class AgentHostCheckoutOperationHandler implements IChangesetOperationHandler {

	public static readonly OPERATION_CHECKOUT = AGENT_HOST_CHECKOUT_CHANGESET_OPERATION_ID;

	constructor(
		private readonly _getSessionState: (sessionKey: string) => SessionState | undefined,
		private readonly _onCheckedOut: (sessionKey: string) => void,
		@IAgentHostGitService private readonly _gitService: IAgentHostGitService,
		@ILogService private readonly _logService: ILogService,
	) { }

	async invoke(params: InvokeChangesetOperationParams, token: CancellationToken): Promise<InvokeChangesetOperationResult> {
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

		const workingDirectoryValue = sessionState.workingDirectories?.[0];
		if (!workingDirectoryValue) {
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, `Session has no working directory: ${sessionUri}`);
		}
		const treeish = readCheckoutOperationTreeish(params);
		if (!treeish) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('agentHost.changeset.checkout.branchMissing', "Select a branch to check out."));
		}

		const workingDirectory = URI.parse(workingDirectoryValue);
		if (treeish.startsWith('-') || !await this._gitService.branchExists(workingDirectory, treeish)) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('agentHost.changeset.checkout.branchInvalid', "Branch '{0}' is not an existing local branch.", treeish));
		}
		this._throwIfCancelled(token);
		if (await this._gitService.hasUncommittedChanges(workingDirectory)) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('agentHost.changeset.checkout.dirty', "Commit or stash the current changes before checking out '{0}'.", treeish));
		}
		this._throwIfCancelled(token);

		this._logService.info(`[AgentHostCheckoutOperationHandler] Checking out ${treeish} for session ${sessionUri}`);
		try {
			await this._gitService.checkout(workingDirectory, treeish);
		} catch (error) {
			this._throwIfCancelled(token);
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, localize('agentHost.changeset.checkout.failed', "Failed to check out '{0}': {1}", treeish, error instanceof Error ? error.message : String(error)));
		}

		try {
			await this._onCheckedOut(sessionUri);
		} catch (error) {
			this._logService.warn(`[AgentHostCheckoutOperationHandler] Post-checkout refresh failed for session ${sessionUri}: ${error instanceof Error ? error.message : String(error)}`);
		}

		return { message: { markdown: localize('agentHost.changeset.checkout.checkedOut', "Checked out branch `{0}`.", treeish) } };
	}

	private _throwIfCancelled(token: CancellationToken): void {
		if (token.isCancellationRequested) {
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, localize('agentHost.changeset.checkout.cancelled', "Checkout operation was cancelled."));
		}
	}
}
