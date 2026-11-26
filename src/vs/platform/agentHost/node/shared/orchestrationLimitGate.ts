/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { ChatInputRequestPurpose, withChatInputRequestPurpose } from '../../common/meta/agentChatInputRequestMeta.js';
import type { ISessionActionLimit, SessionActionLimiter } from '../../common/sessionActionLimiter.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { ChatInputAnswerState, ChatInputAnswerValueKind, ChatInputQuestionKind, ChatInputResponseKind, ResponsePartKind, type ChatInputAnswer } from '../../common/state/sessionState.js';
import type { AgentHostStateManager } from '../agentHostStateManager.js';
import type { IServerToolExecutionContext } from './agentServerToolHost.js';

export const enum OrchestrationLimitKind {
	Messages = 'messages',
	Sessions = 'sessions',
	Chats = 'chats',
}

const enum OrchestrationLimitChoice {
	AllowMore = 'allowMore',
	AllowUnlimited = 'allowUnlimited',
	Deny = 'deny',
}

const questionId = 'orchestrationLimit';

interface IOrchestrationLimiter {
	readonly kind: OrchestrationLimitKind;
	readonly limiter: SessionActionLimiter;
	/** Completes the sentence "Refusing to ...". */
	readonly action: string;
}

/**
 * Checks a per-session orchestration limit and, when it is reached, asks the user in the calling chat
 * whether to allow more. Concurrent calls of the same session and limit share one question.
 */
export class OrchestrationLimitGate {

	private readonly _questions = new Map<string, Promise<boolean>>();

	constructor(
		private readonly _canAskUser: (context: IServerToolExecutionContext) => boolean,
	) { }

	/** @throws when the limit is reached and the user can't be asked or doesn't allow more. */
	async check(stateManager: AgentHostStateManager, context: IServerToolExecutionContext, { kind, limiter, action }: IOrchestrationLimiter, session: string): Promise<void> {
		const limitMessage = limiter.describeLimit(action, session);
		const limit = limiter.getLimit(session);
		if (!limitMessage || !limit) {
			return;
		}
		if (context.turnId === undefined || !this._canAskUser(context)) {
			throw new Error(limitMessage);
		}
		const key = `${kind}\0${session}`;
		let question = this._questions.get(key);
		if (!question) {
			question = askUser(stateManager, context, context.turnId, kind, limit).then(choice => {
				if (choice === OrchestrationLimitChoice.AllowMore) {
					limiter.allowMore(session);
				} else if (choice === OrchestrationLimitChoice.AllowUnlimited) {
					limiter.allowUnlimited(session);
				}
				return choice === OrchestrationLimitChoice.AllowMore || choice === OrchestrationLimitChoice.AllowUnlimited;
			}).finally(() => this._questions.delete(key));
			this._questions.set(key, question);
		}
		if (!await question) {
			throw new Error(`The user did not allow more. ${limitMessage}`);
		}
	}
}

function askUser(stateManager: AgentHostStateManager, context: IServerToolExecutionContext, turnId: string, kind: OrchestrationLimitKind, limit: ISessionActionLimit): Promise<OrchestrationLimitChoice | undefined> {
	const requestId = generateUuid();
	return new Promise(resolve => {
		const store = new DisposableStore();
		const finish = (choice: OrchestrationLimitChoice | undefined) => {
			store.dispose();
			resolve(choice);
		};
		store.add(stateManager.onDidEmitEnvelope(({ channel, action }) => {
			if (channel !== context.chatUri) {
				return;
			}
			switch (action.type) {
				case ActionType.ChatInputCompleted:
					if (action.requestId === requestId) {
						finish(action.response === ChatInputResponseKind.Accept ? readChoice(action.answers?.[questionId] ?? readStoredAnswer(stateManager, context, requestId)) : undefined);
					}
					break;
				case ActionType.ChatTurnComplete:
				case ActionType.ChatTurnCancelled:
				case ActionType.ChatError:
					if (action.turnId === turnId) {
						finish(undefined);
					}
					break;
				case ActionType.ChatTruncated:
					finish(undefined);
					break;
			}
		}));
		store.add(stateManager.onDidRemoveSession(session => {
			if (session === context.sessionUri) {
				finish(undefined);
			}
		}));
		stateManager.dispatchServerAction(context.chatUri, {
			type: ActionType.ChatInputRequested,
			request: withChatInputRequestPurpose({
				id: requestId,
				questions: [{
					kind: ChatInputQuestionKind.SingleSelect,
					id: questionId,
					title: getTitle(kind),
					message: getMessage(kind, limit),
					required: true,
					allowFreeformInput: false,
					options: [
						{ id: OrchestrationLimitChoice.AllowMore, label: localize('orchestrationLimit.allowMore', "Allow {0} More", limit.max), description: localize('orchestrationLimit.allowMoreDescription', "Ask again if this session reaches the limit again"), recommended: true },
						{ id: OrchestrationLimitChoice.AllowUnlimited, label: localize('orchestrationLimit.allowUnlimited', "Allow for This Session"), description: localize('orchestrationLimit.allowUnlimitedDescription', "Don't limit this session again until the agent host restarts") },
						{ id: OrchestrationLimitChoice.Deny, label: localize('orchestrationLimit.deny', "Don't Allow"), description: localize('orchestrationLimit.denyDescription', "The agent is told that the limit was reached") },
					],
				}],
			}, ChatInputRequestPurpose.Elicitation),
		});
	});
}

function readStoredAnswer(stateManager: AgentHostStateManager, context: IServerToolExecutionContext, requestId: string): ChatInputAnswer | undefined {
	const part = stateManager.getChatState(context.chatUri)?.activeTurn?.responseParts.find(part => part.kind === ResponsePartKind.InputRequest && part.request.id === requestId);
	return part?.kind === ResponsePartKind.InputRequest ? part.request.answers?.[questionId] : undefined;
}

function readChoice(answer: ChatInputAnswer | undefined): OrchestrationLimitChoice | undefined {
	if (answer?.state !== ChatInputAnswerState.Submitted || answer.value.kind !== ChatInputAnswerValueKind.Selected) {
		return undefined;
	}
	const value = answer.value.value;
	return value === OrchestrationLimitChoice.AllowMore || value === OrchestrationLimitChoice.AllowUnlimited || value === OrchestrationLimitChoice.Deny ? value : undefined;
}

function getTitle(kind: OrchestrationLimitKind): string {
	switch (kind) {
		case OrchestrationLimitKind.Messages: return localize('orchestrationLimit.messages.title', "Message Limit Reached");
		case OrchestrationLimitKind.Sessions: return localize('orchestrationLimit.sessions.title', "Session Limit Reached");
		case OrchestrationLimitKind.Chats: return localize('orchestrationLimit.chats.title', "Chat Limit Reached");
	}
}

function getMessage(kind: OrchestrationLimitKind, limit: ISessionActionLimit): string {
	switch (kind) {
		case OrchestrationLimitKind.Messages: return localize('orchestrationLimit.messages.message', "This session reached its limit of {0} messages sent to other chats in {1} minutes. Allow it to send more?", limit.max, limit.windowMinutes);
		case OrchestrationLimitKind.Sessions: return localize('orchestrationLimit.sessions.message', "This session reached its limit of {0} new sessions in {1} minutes. Allow it to create more?", limit.max, limit.windowMinutes);
		case OrchestrationLimitKind.Chats: return localize('orchestrationLimit.chats.message', "This session reached its limit of {0} new chats in {1} minutes. Allow it to create more?", limit.max, limit.windowMinutes);
	}
}
