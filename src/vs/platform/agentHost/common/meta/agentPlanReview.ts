/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IAgentHostPlanReview } from '../agentHostPlanReview.js';
import { ChatInputAnswerState, ChatInputAnswerValueKind, ChatInputResponseKind, type ChatInputAnswer, type ChatInputRequest } from '../state/protocol/state.js';
import { readCopilotPlanReview } from './copilotd/planReview.js';
import { readVSCodePlanReview } from './vscode/planReview.js';

export interface IAgentPlanReviewResult {
	readonly rejected: boolean;
	readonly actionId?: string;
	readonly action?: string;
	readonly feedback?: string;
	readonly feedbackOverall?: string;
}

export interface IAgentPlanReviewCompletion {
	readonly response: ChatInputResponseKind;
	readonly answers?: Record<string, ChatInputAnswer>;
}

/** Client-side presentation and answer codecs; the original protocol request remains unchanged. */
export interface IAgentPlanReview {
	readonly review: Omit<IAgentHostPlanReview, 'answerQuestionId'>;
	toInputCompletion(result: IAgentPlanReviewResult): IAgentPlanReviewCompletion;
	fromInputCompletion(response: ChatInputResponseKind, answers: Record<string, ChatInputAnswer> | undefined): IAgentPlanReviewResult | undefined;
}

function submittedTextAnswer(value: string): ChatInputAnswer {
	return { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Text, value } };
}

function submittedSelectedAnswer(value: string, feedback?: string): ChatInputAnswer {
	return {
		state: ChatInputAnswerState.Submitted,
		value: {
			kind: ChatInputAnswerValueKind.Selected,
			value,
			...(feedback ? { freeformValues: [feedback] } : {}),
		},
	};
}

/** Selects one complete convention for both live requests and restored response parts. */
export function readAgentPlanReview(request: ChatInputRequest): IAgentPlanReview | undefined {
	const vscode = Object.hasOwn(request, 'planReview');
	const copilot = vscode ? undefined : readCopilotPlanReview(request);
	const review = vscode ? readVSCodePlanReview(request) : copilot?.review;
	if (!review) {
		return undefined;
	}
	const feedbackQuestionId = copilot?.feedbackQuestionId;

	return {
		review,
		toInputCompletion: result => {
			const feedback = result.feedback?.trim();
			const action = (result.actionId ? review.actions.find(action => action.id === result.actionId) : undefined)
				?? (result.action ? review.actions.find(action => action.label === result.action) : undefined);
			if (feedbackQuestionId) {
				const answers: Record<string, ChatInputAnswer> = {};
				if (feedback) {
					answers[feedbackQuestionId] = submittedTextAnswer(feedback);
				}
				if (result.rejected || !action) {
					return { response: ChatInputResponseKind.Decline, ...(feedback ? { answers } : {}) };
				}
				answers[review.answerQuestionId] = submittedSelectedAnswer(action.id);
				return { response: ChatInputResponseKind.Accept, answers };
			}
			if (feedback) {
				return {
					response: ChatInputResponseKind.Accept,
					answers: {
						[review.answerQuestionId]: action ? submittedSelectedAnswer(action.id, feedback) : submittedTextAnswer(feedback),
					},
				};
			}
			if (result.rejected || !action) {
				return { response: ChatInputResponseKind.Decline };
			}
			return {
				response: ChatInputResponseKind.Accept,
				answers: { [review.answerQuestionId]: submittedSelectedAnswer(action.id) },
			};
		},
		fromInputCompletion: (response, answers) => {
			const feedbackAnswer = feedbackQuestionId ? answers?.[feedbackQuestionId] : undefined;
			const feedback = feedbackAnswer?.state === ChatInputAnswerState.Submitted && feedbackAnswer.value.kind === ChatInputAnswerValueKind.Text
				? feedbackAnswer.value.value.trim()
				: undefined;
			const feedbackResult = feedback ? { feedback, feedbackOverall: feedback } : {};
			if (response === ChatInputResponseKind.Decline) {
				return { rejected: !feedback, ...feedbackResult };
			}
			if (response !== ChatInputResponseKind.Accept) {
				return undefined;
			}
			const answer = answers?.[review.answerQuestionId];
			if (!answer || answer.state === ChatInputAnswerState.Skipped || (feedbackQuestionId && answer.state !== ChatInputAnswerState.Submitted)) {
				return undefined;
			}
			const value = answer.value;
			if (!feedbackQuestionId && value.kind === ChatInputAnswerValueKind.Text) {
				const feedback = value.value.trim();
				return feedback ? { rejected: false, feedback, feedbackOverall: feedback } : undefined;
			}
			if (value.kind !== ChatInputAnswerValueKind.Selected) {
				return undefined;
			}
			const action = review.actions.find(action => action.id === value.value);
			const freeform = !feedbackQuestionId ? value.freeformValues?.find(value => value.trim().length > 0)?.trim() : undefined;
			return {
				rejected: false,
				action: action?.label ?? value.value,
				actionId: action?.id ?? value.value,
				...feedbackResult,
				...(freeform ? { feedback: freeform, feedbackOverall: freeform } : {}),
			};
		},
	};
}
