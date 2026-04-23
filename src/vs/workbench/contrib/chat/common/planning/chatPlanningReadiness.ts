/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPlanningRepositoryContext, IPlanningTransitionAnswer, isConcretePlanningArtifactReference } from './chatPlanningTransition.js';

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
type RequestComplexity = 'low' | 'medium' | 'high';
type RequestSpecificity = 'low' | 'medium' | 'high';

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
		&& input.repositoryContext?.planningTarget?.confidence === 'low'
		&& !isConcretePlanningArtifactReference(input.repositoryContext?.primaryArtifactHint)
		&& (input.repositoryContext?.workspaceFolders?.length ?? 0) > 1;
	const score = dimensions.length === 0
		? 1
		: dimensions.reduce((total, dimension) => total + getDimensionWeight(statusByDimension.get(dimension) ?? 'missing'), 0) / dimensions.length;
	const requestProfile = assessRequestProfile(input);
	const questionCount = computeQuestionCount({
		score,
		missingCount: missingDimensions.length,
		partialCount: partialDimensions.length,
		shouldConfirmPlanningTarget,
		hasCurrentPlan: !!input.currentPlan?.trim(),
		requestComplexity: requestProfile.complexity,
		requestSpecificity: requestProfile.specificity,
		unknownCount: input.repositoryContext?.taskLens?.unknowns?.length ?? 0,
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
	readonly requestComplexity: RequestComplexity;
	readonly requestSpecificity: RequestSpecificity;
	readonly unknownCount: number;
}): number {
	if (input.missingCount === 0 && input.partialCount === 0) {
		if (input.hasCurrentPlan) {
			return input.requestComplexity === 'high' ? 2 : 1;
		}

		return input.requestSpecificity === 'high' ? 1 : 2;
	}

	let questionCount = input.score >= 0.8
		? 2
		: input.score >= 0.5
			? 3
			: 4;

	if (input.missingCount >= 3) {
		questionCount += 1;
	}

	if (input.requestSpecificity === 'low') {
		questionCount += 1;
	} else if (input.requestSpecificity === 'high') {
		questionCount -= 1;
	}

	if (input.requestComplexity === 'high') {
		questionCount += 1;
	}

	if (input.unknownCount >= 3) {
		questionCount += 1;
	}

	if (input.shouldConfirmPlanningTarget) {
		questionCount = Math.max(questionCount, 3);
	}

	return Math.min(Math.max(questionCount, 1), 4);
}

function assessRequestProfile(input: IPlanningReadinessInput): { readonly complexity: RequestComplexity; readonly specificity: RequestSpecificity } {
	const repositoryContext = input.repositoryContext;
	const taskLens = repositoryContext?.taskLens;
	const hasConcretePrimaryArtifact = isConcretePlanningArtifactReference(taskLens?.primaryArtifact)
		|| isConcretePlanningArtifactReference(repositoryContext?.primaryArtifactHint);
	const textSignals = [
		input.userRequest,
		input.plannerNotes ?? '',
		input.currentPlan ?? '',
		...input.planningAnswers.map(answer => `${answer.question} ${answer.answer}`),
		...input.recentConversation,
	].join('\n');
	const tokenCount = approximateTokenCount(textSignals);
	const fileLikeMentions = extractFileLikeMentions(textSignals).length;
	const planSteps = countPlanSteps(input.currentPlan);
	const taskLensPlanAreas = taskLens?.planAreas?.length ?? 0;
	const taskLensUnknowns = taskLens?.unknowns?.length ?? 0;
	const taskLensRisks = taskLens?.riskAreas?.length ?? 0;
	const taskLensValidationTargets = taskLens?.validationTargets?.length ?? 0;
	const repoBreadth = (repositoryContext?.workingSetFiles?.length ?? 0)
		+ (repositoryContext?.workspaceSymbolMatches.length ?? 0)
		+ (repositoryContext?.activeDocumentSymbols.length ?? 0)
		+ (repositoryContext?.nearbyFiles.length ?? 0);
	const hasFocusedRepoSignals = !!repositoryContext?.planningTarget
		|| hasConcretePrimaryArtifact
		|| !!repositoryContext?.relatedArtifactHints?.length
		|| !!repositoryContext?.workingSetFiles?.length
		|| !!repositoryContext?.activeDocumentSymbols.length
		|| !!repositoryContext?.workspaceSymbolMatches.length;
	const complexityScore = (tokenCount >= 70 ? 2 : tokenCount >= 35 ? 1 : 0)
		+ (planSteps >= 4 ? 2 : planSteps >= 2 ? 1 : 0)
		+ (taskLensPlanAreas >= 4 ? 2 : taskLensPlanAreas >= 2 ? 1 : 0)
		+ (taskLensRisks >= 3 ? 1 : 0)
		+ (fileLikeMentions >= 3 ? 2 : fileLikeMentions >= 1 ? 1 : 0)
		+ (repoBreadth >= 10 ? 2 : repoBreadth >= 5 ? 1 : 0);
	const specificityScore = (repositoryContext?.planningTarget?.confidence === 'high' ? 2 : repositoryContext?.planningTarget?.confidence === 'medium' ? 1 : 0)
		+ (hasConcretePrimaryArtifact ? 2 : 0)
		+ ((repositoryContext?.relatedArtifactHints?.length ?? 0) > 0 ? 1 : 0)
		+ ((taskLens?.secondaryArtifacts?.length ?? 0) > 0 ? 1 : 0)
		+ (taskLens?.desiredOutcome ? 1 : 0)
		+ (taskLensValidationTargets > 0 ? 1 : 0)
		+ (fileLikeMentions > 0 ? 1 : 0)
		+ (hasFocusedRepoSignals ? 1 : 0)
		+ (input.planningAnswers.length >= 2 ? 1 : 0)
		+ (planSteps > 0 ? 1 : 0)
		- (taskLensUnknowns >= 3 ? 1 : 0);

	return {
		complexity: complexityScore >= 5 ? 'high' : complexityScore >= 2 ? 'medium' : 'low',
		specificity: specificityScore >= 4 ? 'high' : specificityScore >= 2 ? 'medium' : 'low',
	};
}

function assessDimension(dimension: PlanningReadinessDimension, input: IPlanningReadinessInput): DimensionStatus {
	switch (dimension) {
		case 'desired-outcome':
			return input.repositoryContext?.taskLens?.desiredOutcome
				? 'present'
				: hasAnswerSignal(input, /\b(goal|outcome|success|definition of done|done)\b/i)
					? 'present'
					: input.userRequest.trim()
						? 'partial'
						: 'missing';
		case 'scope-boundaries':
			return (input.repositoryContext?.taskLens?.riskAreas?.length ?? 0) > 0
				? 'present'
				: hasAnswerSignal(input, /\b(scope|boundary|non-goal|non goal|out of scope|in scope|keep changes|limit changes)\b/i)
					? 'present'
					: hasRepositorySignal(input, /\bfocus|selection|file|folder|workspace\b/i)
						? 'partial'
						: 'missing';
		case 'constraints':
			return (input.repositoryContext?.taskLens?.riskAreas?.length ?? 0) > 0
				? 'present'
				: hasAnswerSignal(input, /\b(constraint|must|avoid|without|should not|do not|regression|compatible|untouched)\b/i)
					? 'present'
					: /\b(without|avoid|keep|only|limit)\b/i.test(input.userRequest) || /\b(without|avoid|keep|only|limit)\b/i.test(input.plannerNotes ?? '')
						? 'partial'
						: 'missing';
		case 'repo-target':
			return assessRepoTarget(input);
		case 'insertion-point':
			return (input.repositoryContext?.taskLens?.artifactType === 'symbol'
				|| input.repositoryContext?.taskLens?.artifactType === 'subsystem'
				|| isConcretePlanningArtifactReference(input.repositoryContext?.taskLens?.primaryArtifact))
				? 'present'
				: hasAnswerSignal(input, /\b(insertion point|entry point|start(?:ing)? point|hook|wire|land|modify)\b/i)
					? 'present'
					: hasRepositorySignal(input, /\b(file|selection|symbol|working set)\b/i)
						? 'partial'
						: 'missing';
		case 'work-breakdown':
			return (input.repositoryContext?.taskLens?.planAreas?.length ?? 0) >= 2
				? 'present'
				: hasAnswerSignal(input, /\b(step|steps|breakdown|sequence|first|then|after that|stage|phase)\b/i) || hasPlanStructure(input.currentPlan)
					? 'present'
					: (input.repositoryContext?.taskLens?.planAreas?.length ?? 0) === 1
						? 'partial'
						: input.planningAnswers.length > 0 || /\b(add|update|implement|refactor|wire|change)\b/i.test(input.userRequest)
							? 'partial'
							: 'missing';
		case 'validation':
			return (input.repositoryContext?.taskLens?.validationTargets?.length ?? 0) > 0
				? 'present'
				: hasAnswerSignal(input, /\b(test|validate|validation|verify|check|regression)\b/i)
					? 'present'
					: /\b(test|validate|verify|check)\b/i.test(input.userRequest) || /\b(test|validate|verify|check)\b/i.test(input.currentPlan ?? '')
						? 'partial'
						: 'missing';
	}
}

function assessRepoTarget(input: IPlanningReadinessInput): DimensionStatus {
	const planningTarget = input.repositoryContext?.planningTarget;
	const hasConcretePrimaryArtifact = isConcretePlanningArtifactReference(input.repositoryContext?.taskLens?.primaryArtifact)
		|| isConcretePlanningArtifactReference(input.repositoryContext?.primaryArtifactHint);
	if (planningTarget?.confidence === 'high') {
		return 'present';
	}

	if (hasConcretePrimaryArtifact) {
		return planningTarget?.confidence === 'medium' ? 'present' : 'partial';
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

	if ((input.repositoryContext?.workspaceFolders?.length ?? 0) === 1) {
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

function countPlanSteps(currentPlan: string | undefined): number {
	if (!currentPlan) {
		return 0;
	}

	const structuredSteps = currentPlan.match(/^\s*(?:[-*]|\d+\.)\s+/gm)?.length ?? 0;
	if (structuredSteps > 0) {
		return structuredSteps;
	}

	return currentPlan
		.split(/\r?\n/g)
		.map(line => line.trim())
		.filter(line => line.length > 0).length;
}

function extractFileLikeMentions(value: string): string[] {
	return value.match(/(?:[A-Za-z0-9_.-]+[\\/])*[A-Za-z0-9_.-]+\.[A-Za-z0-9]+/g) ?? [];
}

function approximateTokenCount(value: string): number {
	return value.match(/[A-Za-z0-9_./-]+/g)?.length ?? 0;
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
