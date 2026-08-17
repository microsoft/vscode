/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StopWatch } from '../../../base/common/stopwatch.js';
import type { IAgentHostClientTelemetryContext } from '../common/agentHostTelemetry.js';
import type { ChatInputCompletedAction } from '../common/state/sessionActions.js';
import { ChatInputAnswerState, ChatInputAnswerValueKind, ChatInputQuestionKind, ChatInputRequestPurpose, ChatInputResponseKind, ResponsePartKind, isAhpChatChannel, parseRequiredSessionUriFromChatUri, type ChatInputAnswer, type ChatInputQuestion, type ChatInputRequest, type ChatState } from '../common/state/sessionState.js';
import type { AgentHostTelemetryReporter } from './agentHostTelemetryReporter.js';

interface IInputRequestTiming {
	readonly stopWatch: Pick<StopWatch, 'elapsed'>;
	readonly provider: string;
	readonly session: string;
	readonly turnId: string;
	request: ChatInputRequest;
}

/**
 * Tracks live ask-user requests through completion and emits legacy-compatible telemetry.
 */
export class AgentHostInputRequestTracker {

	private readonly _pending = new Map<string, IInputRequestTiming>();

	constructor(
		private readonly _reporter: AgentHostTelemetryReporter,
		private readonly _stopWatchFactory: () => Pick<StopWatch, 'elapsed'> = () => StopWatch.create(true),
		private readonly _getClientContext: (session: string, turnId: string) => IAgentHostClientTelemetryContext | undefined = () => undefined,
	) { }

	inputRequested(provider: string, session: string, turnId: string, request: ChatInputRequest): void {
		const key = this._key(session, request.id);
		if (request.purpose !== ChatInputRequestPurpose.AskUser) {
			this._pending.delete(key);
			return;
		}

		const existing = this._pending.get(key);
		if (existing) {
			existing.request = request;
			return;
		}

		this._pending.set(key, {
			stopWatch: this._stopWatchFactory(),
			provider,
			session,
			turnId,
			request,
		});
	}

	inputCompleted(session: string, action: ChatInputCompletedAction, state: ChatState | undefined): void {
		const key = this._key(session, action.requestId);
		const timing = this._pending.get(key);
		if (!timing) {
			return;
		}
		this._pending.delete(key);

		if (action.response !== ChatInputResponseKind.Accept || state?.activeTurn?.id !== timing.turnId) {
			return;
		}

		const part = state.activeTurn.responseParts.find(part =>
			part.kind === ResponsePartKind.InputRequest
			&& part.request.id === action.requestId
			&& part.response === ChatInputResponseKind.Accept
		);
		if (!part || part.kind !== ResponsePartKind.InputRequest || part.request.purpose !== ChatInputRequestPurpose.AskUser) {
			return;
		}

		const questions = part.request.questions ?? timing.request.questions ?? [];
		const answers = part.request.answers ?? {};
		const answeredCount = questions.filter(question => this._isAnswered(answers[question.id])).length;

		this._reporter.askQuestionsToolInvoked({
			clientContext: this._getClientContext(timing.session, timing.turnId),
			provider: timing.provider,
			session: timing.session,
			requestId: timing.turnId,
			questionCount: questions.length,
			answeredCount,
			skippedCount: questions.length - answeredCount,
			freeTextCount: questions.filter(question => this._isFreeTextAnswer(answers[question.id])).length,
			recommendedAvailableCount: questions.filter(question => this._recommendedOptions(question).length > 0).length,
			recommendedSelectedCount: questions.filter(question => this._isRecommendedSelected(question, answers[question.id])).length,
			duration: timing.stopWatch.elapsed(),
		});
	}

	clearTurn(session: string, turnId: string): void {
		for (const [key, timing] of this._pending) {
			if (timing.session === session && timing.turnId === turnId) {
				this._pending.delete(key);
			}
		}
	}

	clearChat(session: string): void {
		for (const [key, timing] of this._pending) {
			if (timing.session === session) {
				this._pending.delete(key);
			}
		}
	}

	clearAgentSession(session: string): void {
		for (const [key, timing] of this._pending) {
			const owningSession = isAhpChatChannel(timing.session) ? parseRequiredSessionUriFromChatUri(timing.session) : timing.session;
			if (owningSession === session) {
				this._pending.delete(key);
			}
		}
	}

	clear(): void {
		this._pending.clear();
	}

	private _isAnswered(answer: ChatInputAnswer | undefined): answer is Exclude<ChatInputAnswer, { state: ChatInputAnswerState.Skipped }> {
		return answer !== undefined && answer.state !== ChatInputAnswerState.Skipped;
	}

	private _isFreeTextAnswer(answer: ChatInputAnswer | undefined): boolean {
		if (!this._isAnswered(answer)) {
			return false;
		}
		if (answer.value.kind === ChatInputAnswerValueKind.Text) {
			return true;
		}
		return (answer.value.kind === ChatInputAnswerValueKind.Selected || answer.value.kind === ChatInputAnswerValueKind.SelectedMany)
			&& answer.value.freeformValues?.some(value => value.length > 0) === true;
	}

	private _recommendedOptions(question: ChatInputQuestion): readonly string[] {
		if (question.kind !== ChatInputQuestionKind.SingleSelect && question.kind !== ChatInputQuestionKind.MultiSelect) {
			return [];
		}
		return question.options.filter(option => option.recommended).map(option => option.id);
	}

	private _isRecommendedSelected(question: ChatInputQuestion, answer: ChatInputAnswer | undefined): boolean {
		if (!this._isAnswered(answer)) {
			return false;
		}
		const recommended = this._recommendedOptions(question);
		if (answer.value.kind === ChatInputAnswerValueKind.Selected) {
			return recommended.includes(answer.value.value);
		}
		if (answer.value.kind === ChatInputAnswerValueKind.SelectedMany) {
			return answer.value.value.some(value => recommended.includes(value));
		}
		return false;
	}

	private _key(session: string, requestId: string): string {
		return `${session}\0${requestId}`;
	}
}
