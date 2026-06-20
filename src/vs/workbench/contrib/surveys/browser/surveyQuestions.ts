/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';

export const enum SurveyQuestionType {
	Segment = 'segment',
	Radio = 'radio',
}

export interface ISurveyOption {
	readonly id: string;
	readonly label: string;
}

export interface ISurveySegmentQuestion {
	readonly type: SurveyQuestionType.Segment;
	readonly id: string;
	readonly label: string;
	readonly options: readonly ISurveyOption[];
}

export interface ISurveyRadioQuestion {
	readonly type: SurveyQuestionType.Radio;
	readonly id: string;
	readonly label: string;
	readonly options: readonly ISurveyOption[];
	readonly columns?: number;
}

export type ISurveyQuestion = ISurveySegmentQuestion | ISurveyRadioQuestion;

export interface ISurveyDefinition {
	readonly id: string;
	readonly title: string;
	readonly description: string;
	readonly questions: readonly ISurveyQuestion[];
}

/**
 * Product-Market Fit survey for GitHub Copilot.
 * Based on the Sean Ellis "very disappointed" test.
 */
export const CopilotPMFSurvey: ISurveyDefinition = {
	id: 'copilot-pmf',
	title: localize('survey.copilotPmf.title', "Help Us Improve GitHub Copilot"),
	description: localize('survey.copilotPmf.description', "This short survey helps us understand how well Copilot fits into your workflow."),
	questions: [
		{
			type: SurveyQuestionType.Segment,
			id: 'disappointment',
			label: localize('survey.copilotPmf.q1', "How disappointed would you be if you could no longer use Copilot?"),
			options: [
				{ id: 'not-at-all', label: localize('survey.copilotPmf.q1.notAtAll', "Not at all") },
				{ id: 'slightly', label: localize('survey.copilotPmf.q1.slightly', "Slightly") },
				{ id: 'somewhat', label: localize('survey.copilotPmf.q1.somewhat', "Somewhat") },
				{ id: 'very', label: localize('survey.copilotPmf.q1.very', "Very") },
				{ id: 'extremely', label: localize('survey.copilotPmf.q1.extremely', "Extremely") },
			],
		},
		{
			type: SurveyQuestionType.Radio,
			id: 'main-benefit',
			label: localize('survey.copilotPmf.q2', "What has Copilot helped you with most recently?"),
			columns: 2,
			options: [
				{ id: 'shipping-faster', label: localize('survey.copilotPmf.q2.shippingFaster', "Shipping changes faster") },
				{ id: 'getting-unstuck', label: localize('survey.copilotPmf.q2.gettingUnstuck', "Getting unstuck on bugs") },
				{ id: 'multi-file', label: localize('survey.copilotPmf.q2.multiFile', "Making multi-file changes") },
				{ id: 'automating', label: localize('survey.copilotPmf.q2.automating', "Automating repetitive work") },
				{ id: 'understanding', label: localize('survey.copilotPmf.q2.understanding', "Understanding the codebase") },
				{ id: 'planning', label: localize('survey.copilotPmf.q2.planning', "Planning an approach") },
				{ id: 'reviewing', label: localize('survey.copilotPmf.q2.reviewing', "Improving or reviewing code") },
				{ id: 'no-clear-value', label: localize('survey.copilotPmf.q2.noClearValue', "I haven't gotten clear value yet") },
			],
		},
		{
			type: SurveyQuestionType.Radio,
			id: 'blockers',
			label: localize('survey.copilotPmf.q3', "What most gets in your way?"),
			columns: 2,
			options: [
				{ id: 'trust', label: localize('survey.copilotPmf.q3.trust', "Output is hard to trust") },
				{ id: 'context', label: localize('survey.copilotPmf.q3.context', "Missing repo or project context") },
				{ id: 'bigger-tasks', label: localize('survey.copilotPmf.q3.biggerTasks', "Struggles with bigger tasks") },
				{ id: 'reviewing-time', label: localize('survey.copilotPmf.q3.reviewingTime', "Too much time reviewing") },
				{ id: 'steering', label: localize('survey.copilotPmf.q3.steering', "Too much steering needed") },
				{ id: 'slow', label: localize('survey.copilotPmf.q3.slow', "Too slow / breaks flow") },
				{ id: 'setup', label: localize('survey.copilotPmf.q3.setup', "Setup or integrations are hard") },
				{ id: 'security', label: localize('survey.copilotPmf.q3.security', "Security or permissions friction") },
				{ id: 'cost', label: localize('survey.copilotPmf.q3.cost', "Limits, cost, or billing") },
			],
		},
	],
};
