/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { basename } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { ILogService } from '../../log/common/log.js';
import { ChangesetKind, parseChangesetUri } from '../common/changesetUri.js';
import { type IChangesetOperationHandler } from '../common/agentHostChangesetOperationService.js';
import { IAgentHostChangesetService } from '../common/agentHostChangesetService.js';
import { META_DIFF_BASE_BRANCH, resolveDiffBaseBranchName } from '../common/agentHostGitService.js';
import { IAgentHostReviewService } from '../common/agentHostReviewService.js';
import { ISessionDataService } from '../common/sessionDataService.js';
import { ChangesetOperationTargetKind, type InvokeChangesetOperationParams, type InvokeChangesetOperationResult } from '../common/state/protocol/channels-changeset/commands.js';
import { readSessionGitState, type SessionState } from '../common/state/sessionState.js';
import { AHP_SESSION_NOT_FOUND, JsonRpcErrorCodes, ProtocolError } from '../common/state/sessionProtocol.js';

/**
 * Handles the `mark-as-reviewed` and `mark-as-unreviewed` resource-scoped
 * changeset operations for the **Branch Changes** changeset. A single instance
 * handles one direction — marking a file as reviewed or clearing that mark —
 * selected by the `_reviewed` flag.
 *
 * The reviewed state is owned by {@link IAgentHostReviewService}, which tracks
 * it as a session-private synthetic git ref. This handler resolves the session's
 * working directory + base branch and delegates to that service.
 */
export class AgentHostReviewFileOperationHandler implements IChangesetOperationHandler {

	public static readonly OPERATION_MARK_AS_REVIEWED = 'mark-as-reviewed';
	public static readonly OPERATION_MARK_AS_UNREVIEWED = 'mark-as-unreviewed';

	constructor(
		private readonly _reviewed: boolean,
		private readonly _getSessionState: (sessionKey: string) => SessionState | undefined,
		@IAgentHostReviewService private readonly _reviewService: IAgentHostReviewService,
		@IAgentHostChangesetService private readonly _changesetService: IAgentHostChangesetService,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
		@ILogService private readonly _logService: ILogService,
	) { }

	private get _operationId(): string {
		return this._reviewed
			? AgentHostReviewFileOperationHandler.OPERATION_MARK_AS_REVIEWED
			: AgentHostReviewFileOperationHandler.OPERATION_MARK_AS_UNREVIEWED;
	}

	async invoke(params: InvokeChangesetOperationParams, token: CancellationToken): Promise<InvokeChangesetOperationResult> {
		const parsed = parseChangesetUri(params.channel);
		if (!parsed || parsed.kind !== ChangesetKind.Branch) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, `Not a branch changeset URI: ${params.channel}`);
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
				`Operation '${this._operationId}' requires a resource target.`);
		}

		const workingDirectoryStr = sessionState.workingDirectory;
		if (!workingDirectoryStr) {
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, `Session has no working directory: ${sessionUri}`);
		}

		const workingDirectory = URI.parse(workingDirectoryStr);
		const resource = URI.parse(params.target.resource);
		const baseBranch = await this._resolveBaseBranch(sessionUri, sessionState);

		try {
			if (this._reviewed) {
				this._logService.info(`[AgentHostReviewFileOperationHandler] Marking '${resource.fsPath}' as reviewed for session ${sessionUri}`);
				await this._reviewService.markFileReviewed(sessionUri, workingDirectory, baseBranch, resource);
				this._changesetService.refreshBranchChangeset(sessionUri);

				return { message: { markdown: localize('agentHost.changeset.reviewFile.marked', "Marked `{0}` as reviewed.", basename(resource)) } };
			}

			this._logService.info(`[AgentHostReviewFileOperationHandler] Removing reviewed mark for '${resource.fsPath}' in session ${sessionUri}`);
			await this._reviewService.markFileUnreviewed(sessionUri, workingDirectory, baseBranch, resource);
			this._changesetService.refreshBranchChangeset(sessionUri);

			return { message: { markdown: localize('agentHost.changeset.reviewFile.unmarked', "Removed the reviewed mark from `{0}`.", basename(resource)) } };
		} catch (err) {
			this._throwIfCancelled(token);
			throw new ProtocolError(
				JsonRpcErrorCodes.InternalError,
				`Failed to update reviewed state: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	/**
	 * Resolves the Branch Changes base branch the same way the changeset service
	 * does, so review status is keyed on the same baseline the diff uses.
	 */
	private async _resolveBaseBranch(sessionUri: string, sessionState: SessionState): Promise<string | undefined> {
		const databaseRef = this._sessionDataService.openDatabase(URI.parse(sessionUri));
		try {
			const persistedBaseBranch = await databaseRef.object.getMetadata(META_DIFF_BASE_BRANCH);
			const gitStateBaseBranch = readSessionGitState(sessionState._meta)?.baseBranchName;
			return resolveDiffBaseBranchName(persistedBaseBranch, gitStateBaseBranch);
		} finally {
			databaseRef.dispose();
		}
	}

	private _throwIfCancelled(token: CancellationToken): void {
		if (token.isCancellationRequested) {
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, localize('agentHost.changeset.reviewFile.cancelled', "Review file operation was cancelled."));
		}
	}
}
