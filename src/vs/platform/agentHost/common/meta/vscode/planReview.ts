/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject } from '../../../../../base/common/types.js';
import type { ChatInputRequestWithPlanReview, IAgentHostPlanReview } from '../../agentHostPlanReview.js';
import type { ChatInputRequest } from '../../state/protocol/state.js';

export function readVSCodePlanReview(request: ChatInputRequest): IAgentHostPlanReview | undefined {
	const review = (request as ChatInputRequestWithPlanReview).planReview;
	if (!isObject(review)
		|| typeof review.title !== 'string'
		|| typeof review.content !== 'string'
		|| typeof review.canProvideFeedback !== 'boolean'
		|| typeof review.answerQuestionId !== 'string'
		|| (review.planUri !== undefined && typeof review.planUri !== 'string')
		|| !Array.isArray(review.actions)
		|| !review.actions.every(action => isObject(action)
			&& typeof action.id === 'string'
			&& typeof action.label === 'string'
			&& (action.description === undefined || typeof action.description === 'string')
			&& (action.default === undefined || typeof action.default === 'boolean')
			&& (action.permissionLevel === undefined || action.permissionLevel === 'autopilot'))) {
		return undefined;
	}
	return review;
}
