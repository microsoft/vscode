/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChatMultiSelectAnswer, IChatQuestion, IChatQuestionAnswerValue, IChatQuestionAnswers, IChatQuestionCarousel, IChatSingleSelectAnswer } from '../chatService/chatService.js';

const planningModeNames = new Set(['plan', 'planner']);
export const planningMiddlewareQuestionCarouselResolveIdPrefix = 'dynamic-plan-';
export type PlanningQuestionStage = 'goal-clarity' | 'task-decomposition';
const planningPhaseLabels: Record<PlanningPhase, string> = {
	'broad-scan': 'Broad Scan',
	'focused-slice': 'Focused Slice',
	'detailed-inspection': 'Detailed Inspection',
};

export type PlanningPhase = 'broad-scan' | 'focused-slice' | 'detailed-inspection';
export type PlanningRepositoryScope = 'broad' | 'focused' | 'detailed';

export interface IPlanningTransitionAnswer {
	readonly question: string;
	readonly answer: string;
}

export interface IPlanningSymbolReference {
	readonly name: string;
	readonly kind: string;
	readonly file?: string;
	readonly containerName?: string;
}

export interface IPlanningFileSnippet {
	readonly path: string;
	readonly preview: string;
	readonly detailLevel?: PlanningRepositoryScope;
	readonly reason?: string;
}

export interface IPlanningRepositoryContext {
	readonly workspaceRoot?: string;
	readonly scope: PlanningRepositoryScope;
	readonly focusSummary?: string;
	readonly focusQueries: readonly string[];
	readonly activeDocumentSymbols: readonly IPlanningSymbolReference[];
	readonly workspaceSymbolMatches: readonly IPlanningSymbolReference[];
	readonly nearbyFiles: readonly string[];
	readonly relevantSnippets: readonly IPlanningFileSnippet[];
}

export interface IPlanningTransitionContext {
	readonly phase: PlanningPhase;
	readonly answers: readonly IPlanningTransitionAnswer[];
	readonly plannerNotes?: string;
	readonly recentConversation?: readonly string[];
	readonly repositoryContext?: IPlanningRepositoryContext;
}

export interface IPlanningTransitionMetadata {
	readonly phase?: PlanningPhase;
	readonly plannerNotes?: string;
	readonly recentConversation?: readonly string[];
	readonly repositoryContext?: IPlanningRepositoryContext;
}

export function isPlanningModeName(modeName: string | undefined): boolean {
	return !!modeName && planningModeNames.has(modeName.trim().toLowerCase());
}

export function isPlanningMiddlewareQuestionCarousel(resolveId: string | undefined): boolean {
	return !!resolveId && resolveId.startsWith(planningMiddlewareQuestionCarouselResolveIdPrefix);
}

export function getPlanningMiddlewareQuestionStage(resolveId: string | undefined): PlanningQuestionStage | undefined {
	if (!isPlanningMiddlewareQuestionCarousel(resolveId)) {
		return undefined;
	}

	return resolveId?.includes('task-decomposition')
		? 'task-decomposition'
		: resolveId?.includes('goal-clarity')
			? 'goal-clarity'
			: undefined;
}

export function getPlanningPhaseLabel(phase: PlanningPhase): string {
	return planningPhaseLabels[phase];
}

export function getNextPlanningPhase(phase: PlanningPhase): PlanningPhase | undefined {
	switch (phase) {
		case 'broad-scan':
			return 'focused-slice';
		case 'focused-slice':
			return 'detailed-inspection';
		default:
			return undefined;
	}
}

export function getPreviousPlanningPhase(phase: PlanningPhase): PlanningPhase | undefined {
	switch (phase) {
		case 'detailed-inspection':
			return 'focused-slice';
		case 'focused-slice':
			return 'broad-scan';
		default:
			return undefined;
	}
}

export function buildPlanningTransitionContext(
	carousel: IChatQuestionCarousel,
	answers: IChatQuestionAnswers | undefined = carousel.data,
	metadata?: IPlanningTransitionMetadata
): IPlanningTransitionContext | undefined {
	if (!answers && !metadata?.plannerNotes && !metadata?.recentConversation?.length && !metadata?.repositoryContext) {
		return undefined;
	}

	const normalizedAnswers: IPlanningTransitionAnswer[] = [];
	if (answers) {
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
	}

	return {
		phase: metadata?.phase ?? 'broad-scan',
		answers: normalizedAnswers,
		plannerNotes: normalizeOptional(metadata?.plannerNotes),
		recentConversation: normalizeStringArray(metadata?.recentConversation),
		repositoryContext: normalizeRepositoryContext(metadata?.repositoryContext),
	};
}

export function augmentPromptWithPlanningContext(basePrompt: string, context: IPlanningTransitionContext | undefined): string {
	const prompt = basePrompt.trim();
	if (!context) {
		return prompt;
	}

	const planningSections: string[] = [
		`Planning phase: ${getPlanningPhaseLabel(context.phase)}`
	];

	if (context.answers.length > 0) {
		planningSections.push(
			'Planning answers:',
			...context.answers.map(answer => `- ${answer.question}: ${answer.answer}`)
		);
	}

	if (context.plannerNotes) {
		planningSections.push(`Planner notes: ${context.plannerNotes}`);
	}

	if (context.recentConversation?.length) {
		planningSections.push(
			'Recent planning conversation:',
			...context.recentConversation.map(entry => `- ${entry}`)
		);
	}

	if (context.repositoryContext) {
		planningSections.push(...formatRepositoryContext(context.repositoryContext));
	}

	planningSections.push('Use this planning context as the source of truth for implementation unless the codebase forces a concrete adjustment.');
	const planningBlock = ['Planning context from the previous planning step:', ...planningSections].join('\n');

	return prompt ? `${prompt}\n\n${planningBlock}` : planningBlock;
}

export function mergePlanningTransitionContexts(...contexts: ReadonlyArray<IPlanningTransitionContext | undefined>): IPlanningTransitionContext | undefined {
	const answers: IPlanningTransitionAnswer[] = [];
	const recentConversation: string[] = [];
	const seenQuestions = new Set<string>();
	const seenConversationEntries = new Set<string>();
	let latestPhase: PlanningPhase = 'broad-scan';
	let plannerNotes: string | undefined;
	let repositoryContext: IPlanningRepositoryContext | undefined;

	for (const context of contexts) {
		if (!context) {
			continue;
		}

		latestPhase = context.phase;
		plannerNotes = context.plannerNotes ?? plannerNotes;
		repositoryContext = context.repositoryContext ?? repositoryContext;

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

		for (const entry of context.recentConversation ?? []) {
			const normalizedEntry = normalizeWhitespace(entry);
			if (!normalizedEntry || seenConversationEntries.has(normalizedEntry)) {
				continue;
			}

			seenConversationEntries.add(normalizedEntry);
			recentConversation.push(normalizedEntry);
		}
	}

	if (answers.length === 0 && !plannerNotes && recentConversation.length === 0 && !repositoryContext) {
		return undefined;
	}

	return {
		phase: latestPhase,
		answers,
		plannerNotes,
		recentConversation: recentConversation.length > 0 ? recentConversation : undefined,
		repositoryContext,
	};
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

function normalizeRepositoryContext(context: IPlanningRepositoryContext | undefined): IPlanningRepositoryContext | undefined {
	if (!context) {
		return undefined;
	}

	return {
		workspaceRoot: normalizeOptional(context.workspaceRoot),
		scope: context.scope,
		focusSummary: normalizeOptional(context.focusSummary),
		focusQueries: normalizeStringArray(context.focusQueries) ?? [],
		activeDocumentSymbols: context.activeDocumentSymbols ?? [],
		workspaceSymbolMatches: context.workspaceSymbolMatches ?? [],
		nearbyFiles: normalizeStringArray(context.nearbyFiles) ?? [],
		relevantSnippets: context.relevantSnippets ?? [],
	};
}

function normalizeStringArray(values: ReadonlyArray<string> | undefined): string[] | undefined {
	if (!values?.length) {
		return undefined;
	}

	const normalized = values
		.map(value => normalizeWhitespace(value))
		.filter(value => value.length > 0);

	return normalized.length > 0 ? normalized : undefined;
}

function normalizeOptional(value: string | undefined): string | undefined {
	return value ? normalizeWhitespace(value) : undefined;
}

function formatRepositoryContext(context: IPlanningRepositoryContext): string[] {
	const lines: string[] = [
		`Repository scope: ${context.scope}`,
	];

	if (context.workspaceRoot) {
		lines.push(`Workspace root: ${context.workspaceRoot}`);
	}

	if (context.focusSummary) {
		lines.push(`Focus summary: ${context.focusSummary}`);
	}

	if (context.focusQueries.length > 0) {
		lines.push(`Focus queries: ${context.focusQueries.join(', ')}`);
	}

	if (context.activeDocumentSymbols.length > 0) {
		lines.push(`Active document symbols: ${formatSymbolList(context.activeDocumentSymbols)}`);
	}

	if (context.workspaceSymbolMatches.length > 0) {
		lines.push(`Workspace symbol matches: ${formatSymbolList(context.workspaceSymbolMatches)}`);
	}

	if (context.nearbyFiles.length > 0) {
		lines.push(`Nearby files: ${context.nearbyFiles.slice(0, 6).join(', ')}`);
	}

	if (context.relevantSnippets.length > 0) {
		lines.push(
			'Relevant file snippets:',
			...context.relevantSnippets.slice(0, 3).map(snippet => {
				const header = [`FILE: ${snippet.path}`, snippet.detailLevel ? `DETAIL: ${snippet.detailLevel}` : '', snippet.reason ? `WHY: ${snippet.reason}` : '']
					.filter(part => part.length > 0)
					.join(' | ');
				return `${header}\n${snippet.preview}`;
			})
		);
	}

	return lines;
}

function formatSymbolList(symbols: readonly IPlanningSymbolReference[]): string {
	return symbols
		.slice(0, 8)
		.map(symbol => `${symbol.name} (${symbol.kind}${symbol.file ? ` @ ${symbol.file}` : ''})`)
		.join(', ');
}

function normalizeWhitespace(value: string): string {
	return value.replace(/\s+/g, ' ').trim();
}
