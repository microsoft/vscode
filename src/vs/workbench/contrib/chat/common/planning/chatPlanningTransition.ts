/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChatMultiSelectAnswer, IChatQuestion, IChatQuestionAnswerValue, IChatQuestionAnswers, IChatQuestionCarousel, IChatSingleSelectAnswer } from '../chatService/chatService.js';

const planningModeNames = new Set(['plan', 'planner']);

export interface IPlanningTransitionAnswer {
	readonly question: string;
	readonly answer: string;
}

export interface IPlanningTransitionContext {
	readonly answers: readonly IPlanningTransitionAnswer[];
}

export function isPlanningModeName(modeName: string | undefined): boolean {
	return !!modeName && planningModeNames.has(modeName.trim().toLowerCase());
}

export function buildPlanningTransitionContext(
	carousel: IChatQuestionCarousel,
	answers: IChatQuestionAnswers | undefined = carousel.data
): IPlanningTransitionContext | undefined {
	if (!answers) {
		return undefined;
	}

	const normalizedAnswers: IPlanningTransitionAnswer[] = [];
	for (const question of carousel.questions) {
		const answer = answers[question.id];
		const formattedAnswer = formatPlanningAnswer(question, answer);
		if (!formattedAnswer) {
			continue;
		}

		normalizedAnswers.push({
			question: normalizeWhitespace(question.title),
			answer: formattedAnswer,
		});
	}

	return normalizedAnswers.length > 0 ? { answers: normalizedAnswers } : undefined;
}

export function augmentPromptWithPlanningContext(basePrompt: string, context: IPlanningTransitionContext | undefined): string {
	const prompt = basePrompt.trim();
	if (!context || context.answers.length === 0) {
		return prompt;
	}

	const planningLines = context.answers.map(answer => `- ${answer.question}: ${answer.answer}`).join('\n');
	const planningBlock = [
		'Planning context from the previous planning step:',
		planningLines,
		'Use this context as the source of truth for implementation. Keep the goal, constraints, and task breakdown aligned with it unless the codebase forces a concrete adjustment.'
	].join('\n');

	return prompt ? `${prompt}\n\n${planningBlock}` : planningBlock;
}

export function mergePlanningTransitionContexts(...contexts: ReadonlyArray<IPlanningTransitionContext | undefined>): IPlanningTransitionContext | undefined {
	const answers: IPlanningTransitionAnswer[] = [];
	const seenQuestions = new Set<string>();

	for (const context of contexts) {
		if (!context) {
			continue;
		}

		for (const answer of context.answers) {
			const normalizedQuestion = normalizeWhitespace(answer.question);
			const normalizedAnswer = normalizeWhitespace(answer.answer);
			if (!normalizedQuestion || !normalizedAnswer || seenQuestions.has(normalizedQuestion)) {
				continue;
			}

			seenQuestions.add(normalizedQuestion);
			answers.push({
				question: normalizedQuestion,
				answer: normalizedAnswer,
			});
		}
	}

	return answers.length > 0 ? { answers } : undefined;
}

function formatPlanningAnswer(question: IChatQuestion, answer: IChatQuestionAnswerValue | undefined): string | undefined {
	if (answer === undefined) {
		return undefined;
	}

	switch (question.type) {
		case 'text':
			return typeof answer === 'string' ? normalizeWhitespace(answer) : undefined;
		case 'singleSelect':
			return formatSingleSelectAnswer(answer);
		case 'multiSelect':
			return formatMultiSelectAnswer(answer);
	}
}

function formatSingleSelectAnswer(answer: IChatQuestionAnswerValue): string | undefined {
	if (typeof answer === 'string') {
		return normalizeWhitespace(answer);
	}

	if (!isChatSingleSelectAnswer(answer)) {
		return undefined;
	}

	const parts = [answer.selectedValue, answer.freeformValue]
		.map(value => value ? normalizeWhitespace(value) : undefined)
		.filter((value): value is string => !!value);

	return parts.length > 0 ? parts.join('; ') : undefined;
}

function formatMultiSelectAnswer(answer: IChatQuestionAnswerValue): string | undefined {
	if (typeof answer === 'string') {
		return normalizeWhitespace(answer);
	}

	if (!isChatMultiSelectAnswer(answer)) {
		return undefined;
	}

	const selectedValues = answer.selectedValues
		.map(value => normalizeWhitespace(value))
		.filter(value => value.length > 0);
	const freeformValue = answer.freeformValue ? normalizeWhitespace(answer.freeformValue) : undefined;
	const parts = [
		selectedValues.length > 0 ? selectedValues.join(', ') : undefined,
		freeformValue
	].filter((value): value is string => !!value);

	return parts.length > 0 ? parts.join('; ') : undefined;
}

function isChatSingleSelectAnswer(answer: IChatQuestionAnswerValue): answer is IChatSingleSelectAnswer {
	return typeof answer === 'object' && answer !== null && ('selectedValue' in answer || 'freeformValue' in answer);
}

function isChatMultiSelectAnswer(answer: IChatQuestionAnswerValue): answer is IChatMultiSelectAnswer {
	return typeof answer === 'object' && answer !== null && Array.isArray((answer as IChatMultiSelectAnswer).selectedValues);
}

function normalizeWhitespace(value: string): string {
	return value.replace(/\s+/g, ' ').trim();
}
