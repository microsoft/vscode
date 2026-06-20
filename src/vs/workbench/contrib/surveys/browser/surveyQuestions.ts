/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const enum SurveyQuestionType {
	Segment = 'segment',
	Radio = 'radio',
}

export interface ISurveySegmentQuestion {
	readonly type: SurveyQuestionType.Segment;
	readonly id: string;
	readonly label: string;
	readonly options: readonly string[];
}

export interface ISurveyRadioQuestion {
	readonly type: SurveyQuestionType.Radio;
	readonly id: string;
	readonly label: string;
	readonly options: readonly string[];
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
	title: 'Help Us Improve GitHub Copilot',
	description: 'This short survey helps us understand how well Copilot fits into your workflow.',
	questions: [
		{
			type: SurveyQuestionType.Segment,
			id: 'disappointment',
			label: 'How disappointed would you be if you could no longer use Copilot?',
			options: [
				'Not at all',
				'Slightly',
				'Somewhat',
				'Very',
				'Extremely',
			],
		},
		{
			type: SurveyQuestionType.Radio,
			id: 'main-benefit',
			label: 'What has Copilot helped you with most recently?',
			columns: 2,
			options: [
				'Shipping changes faster',
				'Getting unstuck on bugs',
				'Making multi-file changes',
				'Automating repetitive work',
				'Understanding the codebase',
				'Planning an approach',
				'Improving or reviewing code',
				'I haven\'t gotten clear value yet',
			],
		},
		{
			type: SurveyQuestionType.Radio,
			id: 'blockers',
			label: 'What most gets in your way?',
			columns: 2,
			options: [
				'Output is hard to trust',
				'Missing repo or project context',
				'Struggles with bigger tasks',
				'Too much time reviewing',
				'Too much steering needed',
				'Too slow / breaks flow',
				'Setup or integrations are hard',
				'Security or permissions friction',
				'Limits, cost, or billing',
			],
		},
	],
};
