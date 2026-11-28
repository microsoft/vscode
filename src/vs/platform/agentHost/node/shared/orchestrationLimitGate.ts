/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { disposableTimeout } from '../../../../base/common/async.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { ChatInputRequestPurpose, withChatInputRequestPurpose } from '../../common/meta/agentChatInputRequestMeta.js';
import { formatSessionActionLimit, type ISessionActionLimit, type ISessionActionReservation, type SessionActionLimiter } from '../../common/sessionActionLimiter.js';
import { AgentHostAgentOrchestrationLimitsSettingId } from '../../common/agentService.js';
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

const unanswered = 'unanswered';
type OrchestrationLimitAnswer = OrchestrationLimitChoice | typeof unanswered;

const questionId = 'orchestrationLimit';

interface IOrchestrationLimiter {
	readonly kind: OrchestrationLimitKind;
	readonly limiter: SessionActionLimiter;
	readonly action: string;
}

export interface IOrchestrationLimitAdmission {
	readonly reservation: ISessionActionReservation | undefined;
	readonly userAllowedMore: string | undefined;
}

export class OrchestrationLimitGate {

	private readonly _questions = new Map<string, Event<OrchestrationLimitAnswer>>();
	private readonly _onDidTurnOff: Event<void>;

	constructor(
		private readonly _canAskUser: (context: IServerToolExecutionContext) => boolean,
		private readonly _isEnabled: () => boolean,
		onDidChangeEnabled: Event<void>,
	) {
		this._onDidTurnOff = Event.filter(onDidChangeEnabled, () => !_isEnabled());
	}

	async check(stateManager: AgentHostStateManager, context: IServerToolExecutionContext, { kind, limiter, action }: IOrchestrationLimiter, session: string): Promise<IOrchestrationLimitAdmission> {
		let userAllowedMore: string | undefined;
		while (true) {
			if (!this._isEnabled()) {
				return { reservation: undefined, userAllowedMore };
			}
			const limit = limiter.getLimit(session);
			if (!limit) {
				return { reservation: limiter.reserve(session), userAllowedMore };
			}
			if (context.turnId === undefined || !this._canAskUser(context)) {
				throw new Error(formatSessionActionLimit(action, limit));
			}
			if (limit.used < limit.max) {
				const capacityChanged = Event.any(Event.map(Event.filter(limiter.onDidRelease, released => released === session), () => true), onDidElapse(limit.nextExpiryMs), Event.map(this._onDidTurnOff, () => true));
				const woken = await whileCallerRuns(stateManager, context, context.turnId, capacityChanged);
				if (woken === undefined || stateManager.getActiveTurnId(context.chatUri) !== context.turnId) {
					throw new CancellationError();
				}
				continue;
			}
			const answer = await whileCallerRuns(stateManager, context, context.turnId, this._getQuestion(stateManager, context, context.turnId, kind, limiter, session, limit));
			if (answer === OrchestrationLimitChoice.Deny || answer === undefined || stateManager.getActiveTurnId(context.chatUri) !== context.turnId) {
				throw new Error(`Refusing to ${action}: this session reached its limit of ${limit.max} in ${limit.windowMinutes} minutes and the user did not allow more. Do not retry unless the user asks you to.`);
			}
			if (answer === OrchestrationLimitChoice.AllowMore) {
				userAllowedMore = `This session reached its limit of ${limit.max} in ${limit.windowMinutes} minutes, and the user allowed it to ${action}: another ${limit.max} before they are asked again.`;
			} else if (answer === OrchestrationLimitChoice.AllowUnlimited) {
				userAllowedMore = `This session reached its limit of ${limit.max} in ${limit.windowMinutes} minutes, and the user allowed it to ${action} without a limit until the agent host restarts.`;
			}
		}
	}

	private _getQuestion(stateManager: AgentHostStateManager, context: IServerToolExecutionContext, turnId: string, kind: OrchestrationLimitKind, limiter: SessionActionLimiter, session: string, limit: ISessionActionLimit): Event<OrchestrationLimitAnswer> {
		const key = `${kind}\0${session}`;
		const existing = this._questions.get(key);
		if (existing) {
			return existing;
		}
		const onDidAnswer = new Emitter<OrchestrationLimitAnswer>();
		this._questions.set(key, onDidAnswer.event);
		void askUser(stateManager, context, turnId, kind, limit, this._onDidTurnOff).then(answer => {
			this._questions.delete(key);
			if (answer === OrchestrationLimitChoice.AllowMore) {
				limiter.allowMore(session);
			} else if (answer === OrchestrationLimitChoice.AllowUnlimited) {
				limiter.allowUnlimited(session);
			}
			onDidAnswer.fire(answer);
			onDidAnswer.dispose();
		});
		return onDidAnswer.event;
	}
}

function onDidEndCallerTurn(stateManager: AgentHostStateManager, context: IServerToolExecutionContext, turnId: string, listener: () => void): DisposableStore {
	const store = new DisposableStore();
	store.add(stateManager.onDidEmitEnvelope(({ channel, action }) => {
		if (channel !== context.chatUri) {
			return;
		}
		if (action.type === ActionType.ChatTruncated
			|| (action.type === ActionType.ChatTurnStarted && action.turnId !== turnId)
			|| ((action.type === ActionType.ChatTurnComplete || action.type === ActionType.ChatTurnCancelled || action.type === ActionType.ChatError) && action.turnId === turnId)) {
			listener();
		}
	}));
	store.add(stateManager.onDidUnregisterChat(({ chat }) => {
		if (chat === context.chatUri) {
			listener();
		}
	}));
	store.add(stateManager.onDidRemoveSession(session => {
		if (session === context.sessionUri) {
			listener();
		}
	}));
	return store;
}

function onDidElapse(ms: number | undefined): Event<boolean> {
	return listener => ms === undefined ? Disposable.None : disposableTimeout(() => listener(true), ms);
}

function whileCallerRuns<T>(stateManager: AgentHostStateManager, context: IServerToolExecutionContext, turnId: string, event: Event<T>): Promise<T | undefined> {
	return new Promise(resolve => {
		const store = onDidEndCallerTurn(stateManager, context, turnId, () => {
			store.dispose();
			resolve(undefined);
		});
		store.add(event(value => {
			store.dispose();
			resolve(value);
		}));
	});
}

function askUser(stateManager: AgentHostStateManager, context: IServerToolExecutionContext, turnId: string, kind: OrchestrationLimitKind, limit: ISessionActionLimit, onDidTurnOff: Event<void>): Promise<OrchestrationLimitAnswer> {
	const requestId = generateUuid();
	return new Promise(resolve => {
		const store = new DisposableStore();
		const finish = (answer: OrchestrationLimitAnswer) => {
			store.dispose();
			resolve(answer);
		};
		store.add(onDidEndCallerTurn(stateManager, context, turnId, () => finish(unanswered)));
		store.add(onDidTurnOff(() => {
			finish(unanswered);
			stateManager.dispatchServerAction(context.chatUri, { type: ActionType.ChatInputCompleted, requestId, response: ChatInputResponseKind.Cancel });
		}));
		store.add(stateManager.onDidEmitEnvelope(({ channel, action }) => {
			if (channel === context.chatUri && action.type === ActionType.ChatInputCompleted && action.requestId === requestId) {
				finish(action.response === ChatInputResponseKind.Accept ? readChoice(action.answers?.[questionId] ?? readStoredAnswer(stateManager, context, requestId)) ?? OrchestrationLimitChoice.Deny : OrchestrationLimitChoice.Deny);
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
						{ id: OrchestrationLimitChoice.AllowMore, label: localize('orchestrationLimit.allowMore', "Allow {0} More", limit.max), recommended: true },
						{ id: OrchestrationLimitChoice.AllowUnlimited, label: localize('orchestrationLimit.allowUnlimited', "Allow for This Session") },
						{ id: OrchestrationLimitChoice.Deny, label: localize('orchestrationLimit.deny', "Don't Allow") },
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
		case OrchestrationLimitKind.Messages: return localize('orchestrationLimit.messages.message', "This session reached its limit of {0} messages sent to other chats in {1} minutes.\n\n- **Allow {0} More**: you're asked again after {0} more messages.\n- **Allow for This Session**: no message limit for this session until the agent host restarts.\n- **Don't Allow**: this message isn't sent.\n\nTo turn off agent orchestration limits for every session, set `{2}` to `off`.", limit.max, limit.windowMinutes, AgentHostAgentOrchestrationLimitsSettingId);
		case OrchestrationLimitKind.Sessions: return localize('orchestrationLimit.sessions.message', "This session reached its limit of {0} new sessions in {1} minutes.\n\n- **Allow {0} More**: you're asked again after {0} more sessions.\n- **Allow for This Session**: no limit on new sessions for this session until the agent host restarts.\n- **Don't Allow**: this session isn't created.\n\nTo turn off agent orchestration limits for every session, set `{2}` to `off`.", limit.max, limit.windowMinutes, AgentHostAgentOrchestrationLimitsSettingId);
		case OrchestrationLimitKind.Chats: return localize('orchestrationLimit.chats.message', "This session reached its limit of {0} new chats in {1} minutes.\n\n- **Allow {0} More**: you're asked again after {0} more chats.\n- **Allow for This Session**: no limit on new chats for this session until the agent host restarts.\n- **Don't Allow**: this chat isn't created.\n\nTo turn off agent orchestration limits for every session, set `{2}` to `off`.", limit.max, limit.windowMinutes, AgentHostAgentOrchestrationLimitsSettingId);
	}
}
