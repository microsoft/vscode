/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ILogService } from '../../../../log/common/log.js';
import type { IAgentHostChatContribution, IAgentHostChatContributionContext, IDispatchedAction, IMessageSubmission, IIncomingRequest, IOutgoingTurn, IncomingRequestDisposition, ISendContribution } from '../../../common/agentHostChatContributionsService.js';
import { readCanvasMessageContext, freezeCanvasMessageContext } from '../../../common/agentHostCanvasContext.js';
import { ActionType } from '../../../common/state/sessionActions.js';
import { isChatReadOnly, type Message } from '../../../common/state/sessionState.js';
import { IAgentHostProviderService } from '../../agentHostProviderService.js';
import { IAgentHostStateManager, AgentHostStateManager } from '../../agentHostStateManager.js';

/** Revokes exact-chat execution when the owning host lifecycle withdraws authority. */
export class LocalCanvasesContribution extends Disposable implements IAgentHostChatContribution {
	static readonly id = 'localCanvases';
	readonly order = 125;

	constructor(
		protected readonly _context: IAgentHostChatContributionContext,
		@IAgentHostProviderService private readonly _providers: IAgentHostProviderService,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	onMessageSubmitted(submission: IMessageSubmission): Message {
		return freezeCanvasMessageContext(submission.message, submission.chat, submission.clientId, resource => this._stateManager.getCanvasState(resource));
	}

	onIncomingRequest(request: IIncomingRequest): IncomingRequestDisposition | undefined {
		try {
			readCanvasMessageContext(request.message, request.chat, request.clientId);
		} catch (error) {
			return { kind: 'reject', stage: 'validation', error: { errorType: 'canvasContext', message: error instanceof Error ? error.message : 'Invalid canvas context.' } };
		}
		return undefined;
	}

	onOutgoingTurn(turn: IOutgoingTurn): ISendContribution | undefined {
		const context = readCanvasMessageContext(turn.message, turn.chat);
		return context ? { text: turn.message.text + context } : undefined;
	}

	onDidDispatchAction(dispatched: IDispatchedAction): void {
		if (dispatched.rejectionReason !== undefined) {
			return;
		}
		const action = dispatched.action;
		switch (action.type) {
			case ActionType.SessionIsArchivedChanged:
				if (!action.isArchived) {
					return;
				}
				break;
			case ActionType.SessionWorkingDirectoryRemoved:
			case ActionType.SessionWorkingDirectoryReplaced:
				break;
			case ActionType.SessionChatUpdated:
				if (action.changes.interactivity === undefined || !isChatReadOnly(action.changes.interactivity, false)) {
					return;
				}
				this._revoke(dispatched.session, action.chat);
				return;
			case ActionType.SessionChatRemoved:
				this._revoke(dispatched.session, action.chat);
				return;
			default:
				return;
		}
		for (const chat of this._stateManager.getSessionState(dispatched.session)?.chats ?? []) {
			this._revoke(dispatched.session, chat.resource);
		}
	}

	private _revoke(session: string, chat: string): void {
		const provider = this._providers.getProviderForSession(session);
		void provider?.revokeCanvasExecution?.(URI.parse(chat)).catch(error => {
			this._logService.error('[LocalCanvasesContribution] Failed to retire a canvas backing.', error);
		});
	}
}
