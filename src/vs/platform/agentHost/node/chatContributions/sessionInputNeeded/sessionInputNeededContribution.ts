/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { equals } from '../../../../../base/common/objects.js';
import { hasKey } from '../../../../../base/common/types.js';
import type { IAgentHostChatContribution, IAgentHostChatContributionContext, IDispatchedAction } from '../../../common/agentHostChatContributionsService.js';
import { readToolCallMeta } from '../../../common/meta/agentToolCallMeta.js';
import { SessionInputRequestKind, type SessionInputRequest } from '../../../common/state/protocol/state.js';
import { ActionType, isChatAction, type ChatAction } from '../../../common/state/sessionActions.js';
import { isAhpChatChannel, parseRequiredSessionUriFromChatUri, ResponsePartKind, ToolCallContributorKind, ToolCallStatus, type ToolCallState, type URI as ProtocolURI } from '../../../common/state/sessionState.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../agentHostStateManager.js';
import { IAgentHostProviderService } from '../../agentHostProviderService.js';
import { AgentHostToolCallTracker, IAgentHostToolCallTracker } from '../../agentHostToolCallTracker.js';
import { AgentHostTurnTracker, IAgentHostTurnTracker } from '../../agentHostTurnTracker.js';

/**
 * Mirrors per-chat blockers (user-input elicitations, tool confirmations,
 * client-tool executions, and MCP authentication) into the owning session's
 * `inputNeeded` list so clients subscribed only to the session channel can
 * discover and answer them without subscribing to each chat. This handler
 * only produces the state; it does not consume it.
 */
export class SessionInputNeededContribution extends Disposable implements IAgentHostChatContribution {

	static readonly id = 'sessionInputNeeded';
	readonly order = 200;

	constructor(
		protected readonly _context: IAgentHostChatContributionContext,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostTurnTracker private readonly _turnTracker: AgentHostTurnTracker,
		@IAgentHostToolCallTracker private readonly _toolCallTracker: AgentHostToolCallTracker,
		@IAgentHostProviderService private readonly _providerService: IAgentHostProviderService,
	) {
		super();
	}

	onDidDispatchAction(dispatched: IDispatchedAction): void {
		// A rejected action never reduced, so there is no state change to mirror. The
		// removal branches below clear a mirrored blocker without re-reading state, so
		// acting on one could drop a request that is still outstanding.
		if (dispatched.rejectionReason !== undefined || !isAhpChatChannel(dispatched.channel) || !isChatAction(dispatched.action)) {
			return;
		}
		this._syncSessionInputNeededForChatAction(dispatched.channel, dispatched.action);
	}

	private _syncSessionInputNeededForChatAction(chatUri: ProtocolURI, action: ChatAction): void {
		switch (action.type) {
			case ActionType.ChatInputRequested:
				this._syncChatInputNeeded(chatUri, action.request.id);
				break;
			case ActionType.ChatInputAnswerChanged:
				this._syncChatInputNeeded(chatUri, action.requestId);
				break;
			case ActionType.ChatInputCompleted:
				this._removeSessionInputNeeded(chatUri, this._chatInputNeededId(chatUri, action.requestId));
				break;
			case ActionType.ChatToolCallStart:
			case ActionType.ChatToolCallReady:
			case ActionType.ChatToolCallConfirmed:
			case ActionType.ChatToolCallComplete:
			case ActionType.ChatToolCallResultConfirmed:
			case ActionType.ChatToolCallAuthRequired:
			case ActionType.ChatToolCallAuthResolved:
				this._syncToolInputNeeded(chatUri, action.turnId, action.toolCallId);
				break;
			case ActionType.ChatTurnComplete:
			case ActionType.ChatTurnCancelled:
			case ActionType.ChatError:
			case ActionType.ChatTruncated:
				this._removeSessionInputNeededForChat(chatUri);
				break;
		}
	}

	private _syncChatInputNeeded(chatUri: ProtocolURI, requestId: string): void {
		const state = this._stateManager.getSessionState(chatUri);
		const part = state?.activeTurn?.responseParts.find(part =>
			part.kind === ResponsePartKind.InputRequest
			&& part.response === undefined
			&& part.request.id === requestId
		);
		const id = this._chatInputNeededId(chatUri, requestId);
		if (!part || part.kind !== ResponsePartKind.InputRequest) {
			this._removeSessionInputNeeded(chatUri, id);
			return;
		}
		this._setSessionInputNeeded(chatUri, {
			id,
			kind: SessionInputRequestKind.ChatInput,
			chat: chatUri,
			request: part.request,
		});
	}

	private _syncToolInputNeeded(chatUri: ProtocolURI, turnId: string, toolCallId: string): void {
		const confirmationId = this._toolConfirmationNeededId(chatUri, turnId, toolCallId);
		const clientExecutionId = this._toolClientExecutionNeededId(chatUri, turnId, toolCallId);
		const authenticationId = this._toolAuthenticationNeededId(chatUri, turnId, toolCallId);
		const toolCall = this._findToolCall(chatUri, turnId, toolCallId);

		// A parameter gate auto-approved by the session's bypass setting never
		// blocks on the user, so keep it out of the session `inputNeeded` queue
		// (which would flash "input needed" in the sessions list).
		// `autoApproveBySetting` covers only the parameter gate; a
		// `PendingResultConfirmation` is a genuine prompt and is still surfaced.
		const autoApproved = !!toolCall && readToolCallMeta(toolCall).autoApproveBySetting === true;

		const suppressAutoApprovedConfirmation = autoApproved && toolCall?.status === ToolCallStatus.PendingConfirmation;
		const needsConfirmation = !suppressAutoApprovedConfirmation && (toolCall?.status === ToolCallStatus.PendingConfirmation || toolCall?.status === ToolCallStatus.PendingResultConfirmation);
		if (needsConfirmation && toolCall) {
			this._setSessionInputNeeded(chatUri, {
				id: confirmationId,
				kind: SessionInputRequestKind.ToolConfirmation,
				chat: chatUri,
				turnId,
				toolCall,
			});
		} else {
			this._removeSessionInputNeeded(chatUri, confirmationId);
		}

		const contributor = toolCall?.contributor;
		if (toolCall?.status === ToolCallStatus.Running && contributor?.kind === ToolCallContributorKind.Client) {
			this._setSessionInputNeeded(chatUri, {
				id: clientExecutionId,
				kind: SessionInputRequestKind.ToolClientExecution,
				chat: chatUri,
				turnId,
				clientId: contributor.clientId,
				toolCall,
			});
		} else {
			this._removeSessionInputNeeded(chatUri, clientExecutionId);
		}

		if (toolCall?.status === ToolCallStatus.AuthRequired) {
			this._setSessionInputNeeded(chatUri, {
				id: authenticationId,
				kind: SessionInputRequestKind.ToolAuthentication,
				chat: chatUri,
				turnId,
				toolCall,
			});
		} else {
			this._removeSessionInputNeeded(chatUri, authenticationId);
		}
	}

	private _findToolCall(chatUri: ProtocolURI, turnId: string, toolCallId: string): ToolCallState | undefined {
		const state = this._stateManager.getSessionState(chatUri);
		const turn = state?.activeTurn?.id === turnId ? state.activeTurn : state?.turns.find(t => t.id === turnId);
		const part = turn?.responseParts.find(p => p.kind === ResponsePartKind.ToolCall && p.toolCall.toolCallId === toolCallId);
		return part?.kind === ResponsePartKind.ToolCall ? part.toolCall : undefined;
	}

	private _setSessionInputNeeded(chatUri: ProtocolURI, request: SessionInputRequest): void {
		const sessionUri = parseRequiredSessionUriFromChatUri(chatUri);
		const existing = this._stateManager.getSessionState(sessionUri)?.inputNeeded?.find(r => r.id === request.id);
		if (existing && equals(existing, request)) {
			return;
		}
		this._stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionInputNeededSet, request });
		// Record the blocker on the turn so a hang reported while the request is
		// outstanding is tagged as an expected wait on the user rather than as
		// an unexplained stall, and so the report can name the tool it gates. A
		// `ChatInput` elicitation carries neither `turnId` nor a tool call, so
		// fall back to the chat's active turn.
		const blockedTurnId = hasKey(request, { turnId: true }) ? request.turnId : this._stateManager.getActiveTurnId(chatUri);
		if (blockedTurnId) {
			const blockedToolCallId = hasKey(request, { toolCall: true }) ? request.toolCall.toolCallId : undefined;
			this._turnTracker.turnBlocked(chatUri, blockedTurnId, request.id, request.kind, blockedToolCallId);
		}
		if (request.kind !== SessionInputRequestKind.ChatInput) {
			const agent = this._providerService.getProviderForSession(sessionUri);
			if (agent) {
				this._toolCallTracker.toolCallBlocked(agent.id, chatUri, request);
			}
		}
	}

	private _removeSessionInputNeeded(chatUri: ProtocolURI, id: string): void {
		const sessionUri = parseRequiredSessionUriFromChatUri(chatUri);
		this._toolCallTracker.toolCallUnblocked(chatUri, id);
		this._turnTracker.turnUnblocked(chatUri, id);
		if (!this._stateManager.getSessionState(sessionUri)?.inputNeeded?.some(r => r.id === id)) {
			return;
		}
		this._stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionInputNeededRemoved, id });
	}

	private _removeSessionInputNeededForChat(chatUri: ProtocolURI): void {
		const sessionUri = parseRequiredSessionUriFromChatUri(chatUri);
		for (const request of this._stateManager.getSessionState(sessionUri)?.inputNeeded ?? []) {
			if (request.chat === chatUri) {
				this._removeSessionInputNeeded(chatUri, request.id);
			}
		}
	}

	private _chatInputNeededId(chatUri: ProtocolURI, requestId: string): string {
		return `chatInput:${chatUri}:${requestId}`;
	}

	private _toolConfirmationNeededId(chatUri: ProtocolURI, turnId: string, toolCallId: string): string {
		return `toolConfirmation:${chatUri}:${turnId}:${toolCallId}`;
	}

	private _toolClientExecutionNeededId(chatUri: ProtocolURI, turnId: string, toolCallId: string): string {
		return `toolClientExecution:${chatUri}:${turnId}:${toolCallId}`;
	}

	private _toolAuthenticationNeededId(chatUri: ProtocolURI, turnId: string, toolCallId: string): string {
		return `toolAuthentication:${chatUri}:${turnId}:${toolCallId}`;
	}
}
