/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { renderAsPlaintext } from '../../../../../base/browser/markdownRenderer.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { URI } from '../../../../../base/common/uri.js';
import { IAgentConnection } from '../../../../../platform/agentHost/common/agentService.js';
import { createPullRequestChatMeta, createPullRequestConversationMeta, createPullRequestOperationMeta, createPullRequestValidationMeta, PREPARE_PULL_REQUEST_OPERATION_ID, readPullRequestDetailsResult } from '../../../../../platform/agentHost/common/meta/agentPullRequestOperationMeta.js';
import { InvokeChangesetOperationResult } from '../../../../../platform/agentHost/common/state/protocol/channels-changeset/commands.js';
import { ISessionChangesetOperation } from '../../../../services/sessions/common/session.js';
import { ISendRequestOptions } from '../../../../services/sessions/common/sessionsProvider.js';
import { ISessionPullRequestChatOptions, ISessionPullRequestCreation, ISessionPullRequestDetails, ISessionPullRequestOperation, ISessionPullRequestOptions } from '../../../changes/common/pullRequestCreation.js';

export class AgentHostPullRequestCreation implements ISessionPullRequestCreation {
	readonly operationId = 'create-pr';

	constructor(
		private readonly _getConnection: () => IAgentConnection | undefined,
		private readonly _getChannel: () => URI | undefined,
		private readonly _invokeOperation: (operationId: string, metadata: Record<string, unknown>) => Promise<InvokeChangesetOperationResult | undefined>,
		private readonly _getBackendChatResource: (chat: URI) => URI | undefined = () => undefined,
	) { }

	mapOperations(operations: readonly ISessionChangesetOperation[]): readonly ISessionChangesetOperation[] {
		const canPrepare = operations.some(operation => operation.id === PREPARE_PULL_REQUEST_OPERATION_ID);
		return operations
			.filter(operation => operation.id !== PREPARE_PULL_REQUEST_OPERATION_ID)
			.map(operation => canPrepare && operation.id === this.operationId
				? { ...operation, pullRequestCreation: this } satisfies ISessionPullRequestOperation
				: operation);
	}

	async prepare(token: CancellationToken, chat?: URI): Promise<ISessionPullRequestDetails> {
		return readPullRequestDetailsResult(await this._invokePreparation(token, this._conversationMeta(chat)));
	}

	async prepareChatRequest(query: string, options: ISessionPullRequestChatOptions): Promise<ISendRequestOptions> {
		if (options.expectedContext) {
			await this._invokePreparation(CancellationToken.None, createPullRequestValidationMeta(options.expectedContext));
		}
		return { query, metadata: createPullRequestChatMeta(options) };
	}

	private async _invokePreparation(token: CancellationToken, metadata?: Record<string, unknown>): Promise<InvokeChangesetOperationResult> {
		const connection = this._getConnection();
		const channel = this._getChannel();
		if (!connection || !channel) {
			throw new Error('Cannot prepare a pull request because the agent host connection or changeset is unavailable.');
		}
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		const result = await connection.invokeChangesetOperation({
			operationId: PREPARE_PULL_REQUEST_OPERATION_ID,
			channel: channel.toString(),
			...(metadata ? { _meta: metadata } : {}),
		});
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		return result;
	}

	async create(options: ISessionPullRequestOptions, chat?: URI): Promise<string | void> {
		const result = await this._invokeOperation(this.operationId, { ...createPullRequestOperationMeta(options), ...this._conversationMeta(chat) });
		if (!result) {
			throw new CancellationError();
		}
		return typeof result.message === 'string' ? result.message
			: result.message ? renderAsPlaintext({ value: result.message.markdown }) : undefined;
	}

	/** Names the host chat whose conversation the details describe; omitted when the chat has no host counterpart. */
	private _conversationMeta(chat: URI | undefined): Record<string, unknown> | undefined {
		const backendChat = chat && this._getBackendChatResource(chat);
		return backendChat ? createPullRequestConversationMeta(backendChat.toString()) : undefined;
	}
}
