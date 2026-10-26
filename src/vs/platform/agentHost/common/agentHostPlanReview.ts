/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../nls.js';
import type { ChatInputRequest } from './state/sessionState.js';

export interface IAgentHostPlanReviewAction {
	readonly id: string;
	readonly label: string;
	readonly description?: string;
	readonly default?: boolean;
	readonly permissionLevel?: 'autopilot';
}

export interface IAgentHostPlanReview {
	readonly title: string;
	readonly content: string;
	readonly actions: readonly IAgentHostPlanReviewAction[];
	readonly canProvideFeedback: boolean;
	readonly answerQuestionId: string;
	readonly planUri?: string;
}

export type ChatInputRequestWithPlanReview = ChatInputRequest & {
	readonly planReview?: IAgentHostPlanReview;
};

export function isChatInputRequestWithPlanReview(request: ChatInputRequest): request is ChatInputRequestWithPlanReview {
	const candidate: ChatInputRequestWithPlanReview = request;
	return candidate.planReview !== undefined;
}

/** Display text for known Copilot plan actions; unknown actions retain host-provided presentation. */
export function getPlanActionDescription(actionId: string): { label: string; description: string } | undefined {
	switch (actionId) {
		case 'autopilot':
			return {
				label: localize('agentHost.planReview.autopilot.label', "Implement with Autopilot"),
				description: localize('agentHost.planReview.autopilot.description', "Continue autonomously until done, using the selected approval level."),
			};
		case 'autopilot_fleet':
			return {
				label: localize('agentHost.planReview.autopilotFleet.label', "Implement with Autopilot Fleet"),
				description: localize('agentHost.planReview.autopilotFleet.description', "Continue autonomously with fleet management, using the selected approval level."),
			};
		case 'interactive':
			return {
				label: localize('agentHost.planReview.interactive.label', "Implement Plan"),
				description: localize('agentHost.planReview.interactive.description', "Implement the plan, asking for input and approval for each action."),
			};
		case 'exit_only':
			return {
				label: localize('agentHost.planReview.exitOnly.label', "Approve Plan Only"),
				description: localize('agentHost.planReview.exitOnly.description', "Approve the plan without executing it. I will implement it myself."),
			};
		default:
			return undefined;
	}
}
