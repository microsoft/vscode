/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChatMultiSelectAnswer, IChatQuestion, IChatQuestionAnswerValue, IChatQuestionAnswers, IChatQuestionCarousel, IChatSingleSelectAnswer } from '../chatService/chatService.js';

const planningModeNames = new Set(['plan', 'planner']);
export const planningMiddlewareQuestionCarouselResolveIdPrefix = 'dynamic-plan-';
export const planningTargetConfirmationQuestionId = 'planning-target-confirmation';
export type PlanningQuestionStage = 'goal-clarity' | 'task-decomposition' | 'plan-focus';
const planningPhaseLabels: Record<PlanningPhase, string> = {
	'broad-scan': 'Broad Scan',
	'focused-slice': 'Focused Slice',
	'detailed-inspection': 'Detailed Inspection',
};

export type PlanningPhase = 'broad-scan' | 'focused-slice' | 'detailed-inspection';
export type PlanningRepositoryScope = 'broad' | 'focused' | 'detailed';
export type PlanningTargetKind = 'selection' | 'file' | 'working-set' | 'folder' | 'workspace';
export type PlanningTargetConfidence = 'high' | 'medium' | 'low';
export type PlanningRequestIntent = 'data-analysis' | 'script-work' | 'bug-fix' | 'refactor' | 'feature-work' | 'test-work' | 'investigation' | 'generic';
export type PlanningTaskKind = PlanningRequestIntent;
export type PlanningArtifactType = 'file' | 'folder' | 'symbol' | 'dataset' | 'test' | 'api-surface' | 'subsystem' | 'workspace';
export type PlanningDeliverableType = 'plan' | 'analysis' | 'code-change' | 'refactor' | 'validation' | 'explanation';

export interface IPlanningTarget {
	readonly kind: PlanningTargetKind;
	readonly label: string;
	readonly resource?: string;
	readonly confidence?: PlanningTargetConfidence;
}

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

export interface IPlanningTaskLens {
	readonly taskKind: PlanningTaskKind;
	readonly taskSummary?: string;
	readonly primaryArtifact?: string;
	readonly secondaryArtifacts?: readonly string[];
	readonly artifactType?: PlanningArtifactType;
	readonly desiredOutcome?: string;
	readonly deliverableType?: PlanningDeliverableType;
	readonly riskAreas?: readonly string[];
	readonly unknowns?: readonly string[];
	readonly validationTargets?: readonly string[];
	readonly planAreas?: readonly string[];
}

export interface IPlanningRepositoryContext {
	readonly workspaceRoot?: string;
	readonly scope: PlanningRepositoryScope;
	readonly planningTarget?: IPlanningTarget;
	readonly requestIntent?: PlanningRequestIntent;
	readonly taskLens?: IPlanningTaskLens;
	readonly primaryArtifactHint?: string;
	readonly relatedArtifactHints?: readonly string[];
	readonly focusSummary?: string;
	readonly focusQueries: readonly string[];
	readonly workspaceFolders?: readonly string[];
	readonly workspaceTopLevelEntries?: readonly string[];
	readonly workingSetFiles?: readonly string[];
	readonly activeDocumentSymbols: readonly IPlanningSymbolReference[];
	readonly workspaceSymbolMatches: readonly IPlanningSymbolReference[];
	readonly nearbyFiles: readonly string[];
	readonly relevantSnippets: readonly IPlanningFileSnippet[];
}

const genericPlanningArtifactHintPattern = /^(?:requested\s+)?(?:data file|script|tests?|notebook|shell script|python file|csv file|tsv file|json file|yaml file|sql file|typescript file|javascript file|markdown file)\b/i;

export function isConcretePlanningArtifactReference(value: string | undefined): boolean {
	const normalized = normalizeOptional(value);
	if (!normalized) {
		return false;
	}

	if (/^[a-z][a-z0-9+.-]*:/i.test(normalized) || /[\\/]/.test(normalized) || /\.[a-z0-9]+(?:$|[?#])/i.test(normalized)) {
		return true;
	}

	if (genericPlanningArtifactHintPattern.test(normalized)) {
		return false;
	}

	if (/\b(current workspace|workspace|repository|repo)\b/i.test(normalized)) {
		return false;
	}

	return true;
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
		: resolveId?.includes('plan-focus')
			? 'plan-focus'
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
				question: normalizeWhitespace(typeof question.message === 'string' ? question.message : question.title),
				answer: formattedAnswer,
			});
		}
	}

	const confirmedPlanningTarget = extractConfirmedPlanningTarget(carousel, answers, metadata?.repositoryContext?.planningTarget);

	return {
		phase: metadata?.phase ?? 'broad-scan',
		answers: normalizedAnswers,
		...(normalizeOptional(metadata?.plannerNotes) ? { plannerNotes: normalizeOptional(metadata?.plannerNotes) } : {}),
		...(normalizeStringArray(metadata?.recentConversation) ? { recentConversation: normalizeStringArray(metadata?.recentConversation) } : {}),
		...(normalizeRepositoryContext(metadata?.repositoryContext, confirmedPlanningTarget) ? { repositoryContext: normalizeRepositoryContext(metadata?.repositoryContext, confirmedPlanningTarget) } : {}),
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
	planningSections.push('Do not ignore the planning answers. Use them to shape scope, task selection, sequencing, and validation in the next plan.');
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
		repositoryContext = mergeRepositoryContexts(repositoryContext, context.repositoryContext);

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
		...(plannerNotes ? { plannerNotes } : {}),
		...(recentConversation.length > 0 ? { recentConversation } : {}),
		...(repositoryContext ? { repositoryContext } : {}),
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
			return formatSingleSelectAnswer(question, answer);
		case 'multiSelect':
			return formatMultiSelectAnswer(question, answer);
	}
}

function formatSingleSelectAnswer(question: IChatQuestion, answer: IChatQuestionAnswerValue): string | undefined {
	if (typeof answer === 'string') {
		return getOptionLabel(question, answer);
	}

	if (!isChatSingleSelectAnswer(answer)) {
		return undefined;
	}

	const parts = [
		answer.selectedValue ? getOptionLabel(question, answer.selectedValue) : undefined,
		answer.freeformValue ? normalizeWhitespace(answer.freeformValue) : undefined
	]
		.filter((value): value is string => !!value);

	return parts.length > 0 ? parts.join('; ') : undefined;
}

function formatMultiSelectAnswer(question: IChatQuestion, answer: IChatQuestionAnswerValue): string | undefined {
	if (typeof answer === 'string') {
		return getOptionLabel(question, answer);
	}

	if (!isChatMultiSelectAnswer(answer)) {
		return undefined;
	}

	const selectedValues = answer.selectedValues
		.map(value => getOptionLabel(question, value))
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

function normalizeRepositoryContext(context: IPlanningRepositoryContext | undefined, confirmedPlanningTarget?: IPlanningTarget): IPlanningRepositoryContext | undefined {
	if (!context) {
		return undefined;
	}

	return {
		workspaceRoot: normalizeOptional(context.workspaceRoot),
		scope: context.scope,
		planningTarget: normalizePlanningTarget(confirmedPlanningTarget ?? context.planningTarget),
		requestIntent: isPlanningRequestIntent(context.requestIntent) ? context.requestIntent : undefined,
		taskLens: normalizePlanningTaskLens(context.taskLens),
		primaryArtifactHint: normalizeOptional(context.primaryArtifactHint),
		relatedArtifactHints: normalizeStringArray(context.relatedArtifactHints),
		focusSummary: normalizeOptional(context.focusSummary),
		focusQueries: normalizeStringArray(context.focusQueries) ?? [],
		workspaceFolders: normalizeStringArray(context.workspaceFolders),
		workspaceTopLevelEntries: normalizeStringArray(context.workspaceTopLevelEntries),
		workingSetFiles: normalizeStringArray(context.workingSetFiles),
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

function normalizePlanningTaskLens(lens: IPlanningTaskLens | undefined): IPlanningTaskLens | undefined {
	if (!lens) {
		return undefined;
	}

	const secondaryArtifacts = normalizeStringArray(lens.secondaryArtifacts);
	const riskAreas = normalizeStringArray(lens.riskAreas);
	const unknowns = normalizeStringArray(lens.unknowns);
	const validationTargets = normalizeStringArray(lens.validationTargets);
	const planAreas = normalizeStringArray(lens.planAreas);
	const normalized: IPlanningTaskLens = {
		taskKind: lens.taskKind,
		...(normalizeOptional(lens.taskSummary) ? { taskSummary: normalizeOptional(lens.taskSummary) } : {}),
		...(normalizeOptional(lens.primaryArtifact) ? { primaryArtifact: normalizeOptional(lens.primaryArtifact) } : {}),
		...(lens.artifactType ? { artifactType: lens.artifactType } : {}),
		...(normalizeOptional(lens.desiredOutcome) ? { desiredOutcome: normalizeOptional(lens.desiredOutcome) } : {}),
		...(lens.deliverableType ? { deliverableType: lens.deliverableType } : {}),
		...(secondaryArtifacts ? { secondaryArtifacts } : {}),
		...(riskAreas ? { riskAreas } : {}),
		...(unknowns ? { unknowns } : {}),
		...(validationTargets ? { validationTargets } : {}),
		...(planAreas ? { planAreas } : {}),
	};

	return Object.keys(normalized).length > 1 ? normalized : undefined;
}

function formatRepositoryContext(context: IPlanningRepositoryContext): string[] {
	const lines: string[] = [
		`Repository scope: ${context.scope}`,
	];

	if (context.workspaceRoot) {
		lines.push(`Workspace root: ${context.workspaceRoot}`);
	}

	if (context.planningTarget) {
		lines.push(`Planning target: ${formatPlanningTarget(context.planningTarget)}`);
	}

	if (context.requestIntent) {
		lines.push(`Request intent: ${formatPlanningRequestIntent(context.requestIntent)}`);
	}

	if (context.taskLens) {
		lines.push(...formatPlanningTaskLens(context.taskLens));
	}

	if (context.primaryArtifactHint) {
		lines.push(`Primary artifact hint: ${context.primaryArtifactHint}`);
	}

	if (context.relatedArtifactHints?.length) {
		lines.push(`Related artifact hints: ${context.relatedArtifactHints.slice(0, 6).join(', ')}`);
	}

	if (context.focusSummary) {
		lines.push(`Focus summary: ${context.focusSummary}`);
	}

	if (context.focusQueries.length > 0) {
		lines.push(`Focus queries: ${context.focusQueries.join(', ')}`);
	}

	if (context.workspaceFolders?.length) {
		lines.push(`Workspace folders: ${context.workspaceFolders.slice(0, 6).join(', ')}`);
	}

	if (context.workspaceTopLevelEntries?.length) {
		lines.push(`Workspace top-level entries: ${context.workspaceTopLevelEntries.slice(0, 8).join(', ')}`);
	}

	if (context.workingSetFiles?.length) {
		lines.push(`Working set files: ${context.workingSetFiles.slice(0, 8).join(', ')}`);
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

function getOptionLabel(question: IChatQuestion, rawValue: string): string {
	const normalizedRawValue = normalizeWhitespace(rawValue);
	if (!normalizedRawValue) {
		return '';
	}

	const option = question.options?.find(candidate => normalizeWhitespace(candidate.value) === normalizedRawValue
		|| normalizeWhitespace(candidate.label) === normalizedRawValue
		|| normalizeWhitespace(candidate.id) === normalizedRawValue);
	return option ? normalizeWhitespace(option.label) : normalizedRawValue;
}

function extractConfirmedPlanningTarget(
	carousel: IChatQuestionCarousel,
	answers: IChatQuestionAnswers | undefined,
	existingPlanningTarget: IPlanningTarget | undefined,
): IPlanningTarget | undefined {
	const existing = normalizePlanningTarget(existingPlanningTarget);
	if (!answers) {
		return existing;
	}

	const question = carousel.questions.find(candidate => candidate.id === planningTargetConfirmationQuestionId);
	if (!question) {
		return existing;
	}

	const answer = answers[planningTargetConfirmationQuestionId];
	if (!answer) {
		return existing;
	}

	const selectedTarget = extractPlanningTargetFromAnswer(question, answer);
	return selectedTarget ?? existing;
}

function extractPlanningTargetFromAnswer(question: IChatQuestion, answer: IChatQuestionAnswerValue): IPlanningTarget | undefined {
	if (typeof answer === 'string') {
		return deserializePlanningTarget(answer) ?? createFreeformPlanningTarget(answer);
	}

	if (!isChatSingleSelectAnswer(answer)) {
		return undefined;
	}

	return deserializePlanningTarget(answer.selectedValue)
		?? createFreeformPlanningTarget(answer.freeformValue);
}

function createFreeformPlanningTarget(value: string | undefined): IPlanningTarget | undefined {
	const label = normalizeOptional(value);
	if (!label) {
		return undefined;
	}

	return {
		kind: 'workspace',
		label,
		confidence: 'high',
	};
}

export function serializePlanningTarget(target: IPlanningTarget): string {
	return JSON.stringify({
		kind: target.kind,
		label: target.label,
		resource: target.resource,
		confidence: target.confidence,
	});
}

export function deserializePlanningTarget(value: string | undefined): IPlanningTarget | undefined {
	if (!value) {
		return undefined;
	}

	try {
		const parsed = JSON.parse(value) as Partial<IPlanningTarget>;
		return normalizePlanningTarget(parsed);
	} catch {
		return undefined;
	}
}

function normalizePlanningTarget(target: Partial<IPlanningTarget> | undefined): IPlanningTarget | undefined {
	if (!target) {
		return undefined;
	}

	const label = normalizeOptional(target.label);
	if (!label || !isPlanningTargetKind(target.kind)) {
		return undefined;
	}

	return {
		kind: target.kind,
		label,
		resource: normalizeOptional(target.resource),
		confidence: isPlanningTargetConfidence(target.confidence) ? target.confidence : undefined,
	};
}

function isPlanningTargetKind(value: string | undefined): value is PlanningTargetKind {
	return value === 'selection' || value === 'file' || value === 'working-set' || value === 'folder' || value === 'workspace';
}

function isPlanningTargetConfidence(value: string | undefined): value is PlanningTargetConfidence {
	return value === 'high' || value === 'medium' || value === 'low';
}

function isPlanningRequestIntent(value: string | undefined): value is PlanningRequestIntent {
	return value === 'data-analysis'
		|| value === 'script-work'
		|| value === 'bug-fix'
		|| value === 'refactor'
		|| value === 'feature-work'
		|| value === 'test-work'
		|| value === 'investigation'
		|| value === 'generic';
}

function formatPlanningRequestIntent(intent: PlanningRequestIntent): string {
	switch (intent) {
		case 'data-analysis':
			return 'Data analysis';
		case 'script-work':
			return 'Script work';
		case 'bug-fix':
			return 'Bug fix';
		case 'refactor':
			return 'Refactor';
		case 'feature-work':
			return 'Feature work';
		case 'test-work':
			return 'Test work';
		case 'investigation':
			return 'Investigation';
		default:
			return 'General coding work';
	}
}

function formatPlanningTaskLens(lens: IPlanningTaskLens): string[] {
	const lines: string[] = [
		`Task lens: ${formatPlanningTaskKind(lens.taskKind)}`,
	];

	if (lens.taskSummary) {
		lines.push(`Task summary: ${lens.taskSummary}`);
	}

	if (lens.primaryArtifact) {
		lines.push(`Primary artifact: ${lens.primaryArtifact}`);
	}

	if (lens.secondaryArtifacts?.length) {
		lines.push(`Adjacent artifacts: ${lens.secondaryArtifacts.slice(0, 6).join(', ')}`);
	}

	if (lens.artifactType) {
		lines.push(`Artifact type: ${formatPlanningArtifactType(lens.artifactType)}`);
	}

	if (lens.desiredOutcome) {
		lines.push(`Desired outcome: ${lens.desiredOutcome}`);
	}

	if (lens.deliverableType) {
		lines.push(`Expected deliverable: ${formatPlanningDeliverableType(lens.deliverableType)}`);
	}

	if (lens.planAreas?.length) {
		lines.push(`Plan areas: ${lens.planAreas.slice(0, 5).join(', ')}`);
	}

	if (lens.validationTargets?.length) {
		lines.push(`Validation targets: ${lens.validationTargets.slice(0, 5).join(', ')}`);
	}

	if (lens.riskAreas?.length) {
		lines.push(`Risks or guardrails: ${lens.riskAreas.slice(0, 5).join('; ')}`);
	}

	if (lens.unknowns?.length) {
		lines.push(`Open decisions: ${lens.unknowns.slice(0, 5).join('; ')}`);
	}

	return lines;
}

function formatPlanningTaskKind(taskKind: PlanningTaskKind): string {
	return formatPlanningRequestIntent(taskKind);
}

function formatPlanningArtifactType(artifactType: PlanningArtifactType): string {
	switch (artifactType) {
		case 'api-surface':
			return 'API surface';
		default:
			return artifactType.replace(/-/g, ' ');
	}
}

function formatPlanningDeliverableType(deliverableType: PlanningDeliverableType): string {
	switch (deliverableType) {
		case 'code-change':
			return 'Code change';
		default:
			return deliverableType.replace(/-/g, ' ');
	}
}

function mergeRepositoryContexts(
	base: IPlanningRepositoryContext | undefined,
	incoming: IPlanningRepositoryContext | undefined,
): IPlanningRepositoryContext | undefined {
	if (!base) {
		return incoming;
	}

	if (!incoming) {
		return base;
	}

	return {
		workspaceRoot: incoming.workspaceRoot ?? base.workspaceRoot,
		scope: incoming.scope,
		planningTarget: incoming.planningTarget ?? base.planningTarget,
		requestIntent: incoming.requestIntent ?? base.requestIntent,
		taskLens: mergePlanningTaskLens(base.taskLens, incoming.taskLens),
		primaryArtifactHint: incoming.primaryArtifactHint ?? base.primaryArtifactHint,
		relatedArtifactHints: mergeOptionalStringArrays(base.relatedArtifactHints, incoming.relatedArtifactHints),
		focusSummary: incoming.focusSummary ?? base.focusSummary,
		focusQueries: incoming.focusQueries.length > 0
			? [...incoming.focusQueries]
			: [...base.focusQueries],
		workspaceFolders: mergeOptionalStringArrays(base.workspaceFolders, incoming.workspaceFolders),
		workspaceTopLevelEntries: mergeOptionalStringArrays(base.workspaceTopLevelEntries, incoming.workspaceTopLevelEntries),
		workingSetFiles: incoming.workingSetFiles?.length
			? [...incoming.workingSetFiles]
			: base.workingSetFiles,
		activeDocumentSymbols: incoming.activeDocumentSymbols.length > 0
			? [...incoming.activeDocumentSymbols]
			: [...base.activeDocumentSymbols],
		workspaceSymbolMatches: incoming.workspaceSymbolMatches.length > 0
			? [...incoming.workspaceSymbolMatches]
			: [...base.workspaceSymbolMatches],
		nearbyFiles: incoming.nearbyFiles.length > 0
			? [...incoming.nearbyFiles]
			: [...base.nearbyFiles],
		relevantSnippets: incoming.relevantSnippets.length > 0
			? [...incoming.relevantSnippets]
			: [...base.relevantSnippets],
	};
}

function mergePlanningTaskLens(base: IPlanningTaskLens | undefined, incoming: IPlanningTaskLens | undefined): IPlanningTaskLens | undefined {
	if (!base) {
		return incoming;
	}

	if (!incoming) {
		return base;
	}

	return {
		taskKind: incoming.taskKind ?? base.taskKind,
		taskSummary: incoming.taskSummary ?? base.taskSummary,
		primaryArtifact: incoming.primaryArtifact ?? base.primaryArtifact,
		secondaryArtifacts: mergeOptionalStringArrays(base.secondaryArtifacts, incoming.secondaryArtifacts),
		artifactType: incoming.artifactType ?? base.artifactType,
		desiredOutcome: incoming.desiredOutcome ?? base.desiredOutcome,
		deliverableType: incoming.deliverableType ?? base.deliverableType,
		riskAreas: preferIncomingStringArray(base.riskAreas, incoming.riskAreas),
		unknowns: preferIncomingStringArray(base.unknowns, incoming.unknowns),
		validationTargets: preferIncomingStringArray(base.validationTargets, incoming.validationTargets),
		planAreas: preferIncomingStringArray(base.planAreas, incoming.planAreas),
	};
}

function mergeOptionalStringArrays(base: readonly string[] | undefined, incoming: readonly string[] | undefined): string[] | undefined {
	const merged = mergeStringArrays(base ?? [], incoming ?? []);
	return merged.length > 0 ? merged : undefined;
}

function preferIncomingStringArray(base: readonly string[] | undefined, incoming: readonly string[] | undefined): string[] | undefined {
	if (incoming?.length) {
		return [...incoming];
	}

	return base?.length ? [...base] : undefined;
}

function mergeStringArrays(base: readonly string[], incoming: readonly string[]): string[] {
	return [...base, ...incoming].filter((value, index, values) => values.indexOf(value) === index);
}

function formatPlanningTarget(target: IPlanningTarget): string {
	return `${target.label} (${target.kind}${target.confidence ? `, ${target.confidence} confidence` : ''})`;
}

function normalizeWhitespace(value: string): string {
	return value.replace(/\s+/g, ' ').trim();
}
