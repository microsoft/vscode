/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPlanningRepositoryContext, IPlanningTransitionAnswer } from './chatPlanningTransition.js';

export type PlanningReadinessDimension = 'desired-outcome' | 'scope-boundaries' | 'constraints' | 'repo-target' | 'insertion-point' | 'work-breakdown' | 'validation';

export interface IPlanningReadinessInput {
	readonly userRequest: string;
	readonly plannerNotes?: string;
	readonly planningAnswers: readonly IPlanningTransitionAnswer[];
	readonly recentConversation: readonly string[];
	readonly repositoryContext?: IPlanningRepositoryContext;
	readonly currentPlan?: string;
}

export interface IPlanningStageReadiness {
	readonly score: number;
	readonly questionCount: number;
	readonly missingDimensions: readonly PlanningReadinessDimension[];
	readonly partialDimensions: readonly PlanningReadinessDimension[];
	readonly presentDimensions: readonly PlanningReadinessDimension[];
	readonly shouldConfirmPlanningTarget: boolean;
}

export interface IPlanningReadinessAssessment {
	readonly goalClarity: IPlanningStageReadiness;
	readonly taskDecomposition: IPlanningStageReadiness;
}

type DimensionStatus = 'missing' | 'partial' | 'present';

const goalClarityDimensions: readonly PlanningReadinessDimension[] = ['desired-outcome', 'scope-boundaries', 'constraints', 'repo-target'];
const taskDecompositionDimensions: readonly PlanningReadinessDimension[] = ['repo-target', 'insertion-point', 'work-breakdown', 'validation'];

export function assessPlanningReadiness(input: IPlanningReadinessInput): IPlanningReadinessAssessment {
	return {
		goalClarity: assessStageReadiness(goalClarityDimensions, input),
		taskDecomposition: assessStageReadiness(taskDecompositionDimensions, input),
	};
}

function assessStageReadiness(dimensions: readonly PlanningReadinessDimension[], input: IPlanningReadinessInput): IPlanningStageReadiness {
	const statusByDimension = new Map<PlanningReadinessDimension, DimensionStatus>();
	for (const dimension of dimensions) {
		statusByDimension.set(dimension, assessDimension(dimension, input));
	}

	const missingDimensions = dimensions.filter(dimension => statusByDimension.get(dimension) === 'missing');
	const partialDimensions = dimensions.filter(dimension => statusByDimension.get(dimension) === 'partial');
	const presentDimensions = dimensions.filter(dimension => statusByDimension.get(dimension) === 'present');
	const shouldConfirmPlanningTarget = dimensions.includes('repo-target')
		&& statusByDimension.get('repo-target') !== 'present'
		&& input.repositoryContext?.planningTarget?.confidence === 'low';
	const score = dimensions.length === 0
		? 1
		: dimensions.reduce((total, dimension) => total + getDimensionWeight(statusByDimension.get(dimension) ?? 'missing'), 0) / dimensions.length;
	const questionCount = computeQuestionCount({
		score,
		missingCount: missingDimensions.length,
		partialCount: partialDimensions.length,
		shouldConfirmPlanningTarget,
		hasCurrentPlan: !!input.currentPlan?.trim(),
	});

	return {
		score,
		questionCount,
		missingDimensions,
		partialDimensions,
		presentDimensions,
		shouldConfirmPlanningTarget,
	};
}

function computeQuestionCount(input: {
	readonly score: number;
	readonly missingCount: number;
	readonly partialCount: number;
	readonly shouldConfirmPlanningTarget: boolean;
	readonly hasCurrentPlan: boolean;
}): number {
	if (input.missingCount === 0 && input.partialCount === 0) {
		return input.hasCurrentPlan ? 1 : 2;
	}

	let questionCount = input.score >= 0.8
		? 2
		: input.score >= 0.5
			? 3
			: 4;

	if (input.missingCount >= 3) {
		questionCount += 1;
	}

	if (input.shouldConfirmPlanningTarget) {
		questionCount = Math.max(questionCount, 3);
	}

	return Math.min(Math.max(questionCount, 1), 4);
}

function assessDimension(dimension: PlanningReadinessDimension, input: IPlanningReadinessInput): DimensionStatus {
	switch (dimension) {
		case 'desired-outcome':
			return hasAnswerSignal(input, /\b(goal|outcome|success|definition of done|done)\b/i)
				? 'present'
				: input.userRequest.trim()
					? 'partial'
					: 'missing';
		case 'scope-boundaries':
			return hasAnswerSignal(input, /\b(scope|boundary|non-goal|non goal|out of scope|in scope|keep changes|limit changes)\b/i)
				? 'present'
				: hasRepositorySignal(input, /\bfocus|selection|file|folder|workspace\b/i)
					? 'partial'
					: 'missing';
		case 'constraints':
			return hasAnswerSignal(input, /\b(constraint|must|avoid|without|should not|do not|regression|compatible|untouched)\b/i)
				? 'present'
				: /\b(without|avoid|keep|only|limit)\b/i.test(input.userRequest) || /\b(without|avoid|keep|only|limit)\b/i.test(input.plannerNotes ?? '')
					? 'partial'
					: 'missing';
		case 'repo-target':
			return assessRepoTarget(input);
		case 'insertion-point':
			return hasAnswerSignal(input, /\b(insertion point|entry point|start(?:ing)? point|hook|wire|land|modify)\b/i)
				? 'present'
				: hasRepositorySignal(input, /\b(file|selection|symbol|working set)\b/i)
					? 'partial'
					: 'missing';
		case 'work-breakdown':
			return hasAnswerSignal(input, /\b(step|steps|breakdown|sequence|first|then|after that|stage|phase)\b/i) || hasPlanStructure(input.currentPlan)
				? 'present'
				: input.planningAnswers.length > 0 || /\b(add|update|implement|refactor|wire|change)\b/i.test(input.userRequest)
					? 'partial'
					: 'missing';
		case 'validation':
			return hasAnswerSignal(input, /\b(test|validate|validation|verify|check|regression)\b/i)
				? 'present'
				: /\b(test|validate|verify|check)\b/i.test(input.userRequest) || /\b(test|validate|verify|check)\b/i.test(input.currentPlan ?? '')
					? 'partial'
					: 'missing';
	}
}

function assessRepoTarget(input: IPlanningReadinessInput): DimensionStatus {
	const planningTarget = input.repositoryContext?.planningTarget;
	if (planningTarget?.confidence === 'high') {
		return 'present';
	}

	if (planningTarget?.confidence === 'medium') {
		return 'partial';
	}

	if (planningTarget?.confidence === 'low') {
		return 'missing';
	}

	if (input.repositoryContext?.workingSetFiles?.length || input.repositoryContext?.workspaceSymbolMatches.length || input.repositoryContext?.activeDocumentSymbols.length) {
		return 'partial';
	}

	return 'missing';
}

function hasAnswerSignal(input: IPlanningReadinessInput, pattern: RegExp): boolean {
	if (pattern.test(input.plannerNotes ?? '') || pattern.test(input.currentPlan ?? '')) {
		return true;
	}

	for (const answer of input.planningAnswers) {
		if (pattern.test(answer.question) || pattern.test(answer.answer)) {
			return true;
		}
	}

	for (const entry of input.recentConversation) {
		if (pattern.test(entry)) {
			return true;
		}
	}

	return false;
}

function hasRepositorySignal(input: IPlanningReadinessInput, pattern: RegExp): boolean {
	const repositoryContext = input.repositoryContext;
	if (!repositoryContext) {
		return false;
	}

	return pattern.test(repositoryContext.focusSummary ?? '')
		|| repositoryContext.focusQueries.some(query => pattern.test(query))
		|| repositoryContext.nearbyFiles.some(file => pattern.test(file))
		|| (repositoryContext.workspaceFolders ?? []).some(folder => pattern.test(folder))
		|| (repositoryContext.workingSetFiles ?? []).some(file => pattern.test(file))
		|| (repositoryContext.workspaceTopLevelEntries ?? []).some(entry => pattern.test(entry));
}

function hasPlanStructure(currentPlan: string | undefined): boolean {
	if (!currentPlan) {
		return false;
	}

	return /\n\s*(?:[-*]|\d+\.)\s+/m.test(currentPlan) || /\b(first|then|finally|after)\b/i.test(currentPlan);
}

function getDimensionWeight(status: DimensionStatus): number {
	switch (status) {
		case 'present':
			return 1;
		case 'partial':
			return 0.5;
		default:
			return 0;
	}
}
