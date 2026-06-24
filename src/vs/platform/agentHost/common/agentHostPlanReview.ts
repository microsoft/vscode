/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
