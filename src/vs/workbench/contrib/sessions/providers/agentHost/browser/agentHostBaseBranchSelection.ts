/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { createSetBaseBranchMeta, LIST_BASE_BRANCHES_OPERATION_ID, readBaseBranchCandidatesResult, SET_BASE_BRANCH_OPERATION_ID } from '../../../../../../platform/agentHost/common/meta/agentBaseBranchOperationMeta.js';
import { InvokeChangesetOperationResult } from '../../../../../../platform/agentHost/common/state/protocol/channels-changeset/commands.js';
import { ISessionChangesetBaseBranchCandidates, ISessionChangesetBaseBranchSelection, ISessionChangesetOperation, SessionChangesetOperationStatus } from '../../../../../services/sessions/common/session.js';

/** Changes the base branch of an Agent Host changeset through the host's base branch operations. */
export class AgentHostBaseBranchSelection implements ISessionChangesetBaseBranchSelection {

	constructor(
		private readonly _getConnection: () => IAgentConnection | undefined,
		private readonly _getChannel: () => URI | undefined,
		private readonly _invokeOperation: (operationId: string, metadata: Record<string, unknown>) => Promise<InvokeChangesetOperationResult | undefined>,
	) { }

	/** Removes the base branch operations, which the changeset offers through its base branch selection rather than as buttons. */
	mapOperations(operations: readonly ISessionChangesetOperation[]): readonly ISessionChangesetOperation[] {
		return operations.filter(operation => operation.id !== LIST_BASE_BRANCHES_OPERATION_ID && operation.id !== SET_BASE_BRANCH_OPERATION_ID);
	}

	/** Whether the host lets the user list the base branches and change the base now. */
	isAvailable(operations: readonly ISessionChangesetOperation[]): boolean {
		return operations.some(operation => operation.id === LIST_BASE_BRANCHES_OPERATION_ID)
			&& operations.some(operation => operation.id === SET_BASE_BRANCH_OPERATION_ID && operation.status !== SessionChangesetOperationStatus.Disabled);
	}

	async getCandidates(token: CancellationToken): Promise<ISessionChangesetBaseBranchCandidates> {
		const connection = this._getConnection();
		const channel = this._getChannel();
		if (!connection || !channel) {
			throw new Error('Cannot list base branches because the agent host connection or changeset is unavailable.');
		}
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		const result = await connection.invokeChangesetOperation({
			operationId: LIST_BASE_BRANCHES_OPERATION_ID,
			channel: channel.toString(),
		});
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		return readBaseBranchCandidatesResult(result);
	}

	async setBaseBranch(ref: string): Promise<void> {
		await this._invokeOperation(SET_BASE_BRANCH_OPERATION_ID, createSetBaseBranchMeta(ref));
	}
}
