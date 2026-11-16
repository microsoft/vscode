/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { isObject } from '../../../../../base/common/types.js';
import { getPlanActionDescription, type IAgentHostPlanReview } from '../../agentHostPlanReview.js';
import { ChatInputQuestionKind, type ChatInputRequest } from '../../state/protocol/state.js';

/** Recognizes Copilot's plan-input convention without relying on request or resource URI formats. */
export function readCopilotPlanReview(request: ChatInputRequest): { review: IAgentHostPlanReview; feedbackQuestionId: string } | undefined {
	if (request.url || typeof request.id !== 'string' || !request.id || typeof request.message !== 'string' || !request.message.trim() || !Array.isArray(request.questions) || request.questions.length !== 2) {
		return undefined;
	}
	const action = request.questions.find(question => question?.id === 'selectedAction');
	const feedback = request.questions.find(question => question?.id === 'feedback');
	if (action?.kind !== ChatInputQuestionKind.SingleSelect
		|| action.required !== true
		|| (action.allowFreeformInput !== undefined && action.allowFreeformInput !== false)
		|| feedback?.kind !== ChatInputQuestionKind.Text
		|| (feedback.required !== undefined && feedback.required !== false)
		|| feedback.format !== undefined
		|| feedback.min !== undefined
		|| feedback.max !== undefined
		|| feedback.defaultValue !== undefined
		|| !Array.isArray(action.options)
		|| action.options.length === 0
		|| !action.options.every(option => isObject(option)
			&& typeof option.id === 'string' && option.id.length > 0
			&& typeof option.label === 'string'
			&& (option.description === undefined || typeof option.description === 'string')
			&& (option.recommended === undefined || typeof option.recommended === 'boolean'))
		|| new Set(action.options.map(option => option.id)).size !== action.options.length
		|| !action.options.some(option => getPlanActionDescription(option.id))) {
		return undefined;
	}

	return {
		review: {
			title: localize('agentHost.planReview.title', "Review Plan"),
			content: request.message,
			canProvideFeedback: true,
			answerQuestionId: action.id,
			actions: action.options.map(option => {
				const description = getPlanActionDescription(option.id);
				return {
					id: option.id,
					label: option.label && option.label !== option.id ? option.label : description?.label ?? option.id,
					...(option.description || description?.description ? { description: option.description || description?.description } : {}),
					...(option.recommended ? { default: true } : {}),
				};
			}),
		},
		feedbackQuestionId: feedback.id,
	};
}
