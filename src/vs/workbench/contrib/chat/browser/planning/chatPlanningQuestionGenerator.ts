/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize } from '../../../../../nls.js';
import { IChatQuestion } from '../../common/chatService/chatService.js';
import { getTextResponseFromStream, ChatMessageRole, IChatMessage, ILanguageModelsService } from '../../common/languageModels.js';
import { PlanningReadinessDimension } from '../../common/planning/chatPlanningReadiness.js';
import { getPlanningPhaseLabel, IPlanningRepositoryContext, IPlanningTarget, IPlanningTaskLens, IPlanningTransitionAnswer, isConcretePlanningArtifactReference, PlanningPhase, PlanningQuestionStage } from '../../common/planning/chatPlanningTransition.js';

export interface IPlanningQuestionGenerationContext {
	readonly userRequest: string;
	readonly modelId: string | undefined;
	readonly planningPhase: PlanningPhase;
	readonly questionStage: PlanningQuestionStage;
	readonly questionCount?: number;
	readonly missingDimensions?: readonly PlanningReadinessDimension[];
	readonly partialDimensions?: readonly PlanningReadinessDimension[];
	readonly shouldConfirmPlanningTarget?: boolean;
	readonly activeFilePath?: string;
	readonly selectedText?: string;
	readonly plannerNotes?: string;
	readonly recentConversation: readonly string[];
	readonly planningAnswers: readonly IPlanningTransitionAnswer[];
	readonly repositoryContext?: IPlanningRepositoryContext;
	readonly currentPlan?: string;
	readonly focusAreaLabel?: string;
	readonly focusHint?: string;
}

interface IGeneratedPlanningQuestion {
	readonly title?: string;
	readonly message?: string;
	readonly description?: string;
	readonly type?: 'text' | 'singleSelect' | 'multiSelect';
	readonly options?: ReadonlyArray<{
		readonly label?: string;
		readonly value?: string;
	}>;
	readonly required?: boolean;
	readonly allowFreeformInput?: boolean;
	readonly defaultValue?: string | string[];
}

interface IGeneratedPlanningQuestionEnvelope {
	readonly questions?: ReadonlyArray<IGeneratedPlanningQuestion>;
}

export async function generateDynamicPlanningQuestions(
	languageModelsService: ILanguageModelsService,
	context: IPlanningQuestionGenerationContext,
	token: CancellationToken
): Promise<IChatQuestion[]> {
	const requestedQuestionCount = clampRequestedQuestionCount(context.questionCount);
	const candidateModelIds = getCandidateModelIds(languageModelsService, context.modelId);
	if (candidateModelIds.length === 0) {
		throw new Error(localize(
			'chat.dynamicPlanning.noLanguageModel',
			'No language model is available to generate planning questions.'
		));
	}

	const prompt = buildPlanningQuestionPrompt(context, requestedQuestionCount);
	const messages: IChatMessage[] = [
		{
			role: ChatMessageRole.System,
			content: [{
				type: 'text',
				value: [
					'You generate dynamic planning questions for coding work in VS Code.',
					'You are a dynamic planning prompt middleware that runs before the planning agent receives the actual request.',
					`The current middleware stage is ${context.questionStage}.`,
					'Everything in your response must be dynamically generated from the request and the provided context. Never fall back to generic stock questions.',
					'Respect the current planning phase.',
					'- broad-scan: clarify the problem space and candidate code areas.',
					'- focused-slice: narrow to the subsystem, insertion point, and concrete constraints that matter most.',
					'- detailed-inspection: make the remaining questions concrete enough to drive implementation order, validation, and edit boundaries.',
					`Ask exactly ${requestedQuestionCount} questions.`,
					`Never return fewer than ${requestedQuestionCount} questions.`,
					'Use a mix of interaction types when it improves clarity.',
					'Use text questions for open-ended clarification.',
					'Use singleSelect or multiSelect whenever a bounded choice would help the user make a sharper planning decision.',
					'Prefer questions that change implementation scope, success criteria, sequencing, or insertion-point choice.',
					'Write clean, plain-language UI copy that is easy to scan.',
					'Keep titles short and concrete.',
					'Keep messages direct and user-facing.',
					'Only include a description when it genuinely helps the user answer faster.',
					'If the stage is goal-clarity, focus on desired outcome, constraints, definition of done, and what should be in or out of scope before the first plan is built.',
					'If the stage is task-decomposition, assume the first plan already exists and focus on tightening the work breakdown, insertion points, sequencing, validation, and repo slice for the rebuild.',
					'If the stage is plan-focus, assume a rebuilt plan already exists and focus on sharpening one specific aspect of that plan rather than reopening the whole request.',
					'If the stage is task-decomposition or plan-focus, treat prior goal-clarity answers as settled inputs, not new question topics.',
					'Never ask task-decomposition or plan-focus questions that re-open goal, scope, non-goals, or definition-of-done themes.',
					'When the current workspace is already clear, do not ask which repository or workspace to use. Ask about the file, directory, subsystem, or related artifacts inside it instead.',
					'If a primary artifact hint is provided, start from that artifact and only ask a repo-targeting question if the file, folder, or subsystem is still genuinely ambiguous.',
					!context.repositoryContext?.taskLens?.primaryArtifact && context.repositoryContext?.primaryArtifactHint
						? 'The exact primary artifact is still unresolved. Your first goal-clarity question should pin down the actual file, directory, symbol, or subsystem inside the current workspace.'
						: '',
					'If a task lens is provided, treat it as the best current summary of the work: the task kind, target artifact, adjacent artifacts, desired outcome, expected deliverable, validation targets, risks, and open decisions.',
					'Ask about unresolved decisions in that task lens rather than asking for generic project metadata.',
					'For bug-fix work, prefer symptom boundary, likely code path, preserved behavior, and validation questions.',
					'For feature work, prefer user outcome, surface area, acceptance, and dependency questions.',
					'For refactor work, prefer preserved behavior, edit boundaries, migration risk, and validation questions.',
					'For analysis work, prefer target artifact, related inputs, evidence, comparison set, and output questions.',
					'For test work, prefer failing path, expected assertions, harness, and coverage questions.',
					'For investigation work, prefer code path, evidence, uncertainty, and next-check questions.',
					'If the request intent is data analysis, lead with the data file, related schema, output, or directory that matters most.',
					'If the request intent is data analysis, prefer questions about the data file, related files, desired output, or result validation. Do not ask generic tooling or library questions unless the user or repo context suggests they matter.',
					'If the request intent is script work, lead with the script, entrypoint, or runtime context that matters most.',
					requestedQuestionCount > 1 ? 'For goal-clarity, prefer at least one structured choice question plus one open text question unless the context is genuinely too ambiguous.' : '',
					context.questionStage === 'task-decomposition' ? 'For task-decomposition, prefer a structured work-breakdown or insertion-point question and avoid drifting back into abstract scope questions.' : '',
					context.questionStage === 'plan-focus' ? 'For plan-focus, return a complementary set of follow-up controls that zoom in on the named focus area using the current plan and narrowed repo context. At least one question should lock the concrete repo slice, file, or subsystem, and at least one should sharpen risk, validation, sequencing, or dependency handling.' : '',
					'Descriptions should be concise and help the user understand why the question matters.',
					'Do not repeat the same question theme across both stages.',
					context.shouldConfirmPlanningTarget ? 'If the concrete file, folder, or subsystem is still ambiguous, use one sharply-targeted question to pin it down inside the current workspace.' : '',
					'Return JSON only with the shape {"questions":[...]} and no markdown.'
				].join(' ')
			}]
		},
		{
			role: ChatMessageRole.User,
			content: [{ type: 'text', value: prompt }]
		}
	];

	let lastError: Error | undefined;
	for (const modelId of candidateModelIds) {
		try {
			const normalized = requestedQuestionCount > 0
				? await requestModelPlanningQuestions(languageModelsService, modelId, messages, context, token)
				: [];
			const finalized = finalizeGeneratedQuestions(normalized, context);
			if (finalized.length > 0) {
				return finalized;
			}

			lastError = new Error(localize(
				'chat.dynamicPlanning.noUsableQuestions',
				'Language model "{0}" did not return enough usable planning questions.',
				modelId
			));
		} catch (error) {
			lastError = error instanceof Error
				? error
				: new Error(localize('chat.dynamicPlanning.unknownGenerationError', 'Planning question generation failed.'));
		}
	}

	throw lastError ?? new Error(localize('chat.dynamicPlanning.unknownGenerationError', 'Planning question generation failed.'));
}

function getCandidateModelIds(languageModelsService: ILanguageModelsService, preferredModelId: string | undefined): string[] {
	const candidateModelIds: string[] = [];
	const seen = new Set<string>();
	const pushCandidate = (modelId: string | undefined) => {
		if (!modelId || seen.has(modelId)) {
			return;
		}

		const metadata = languageModelsService.lookupLanguageModel(modelId);
		if (metadata?.targetChatSessionType) {
			return;
		}

		seen.add(modelId);
		candidateModelIds.push(modelId);
	};

	pushCandidate(preferredModelId);

	for (const modelId of languageModelsService.getLanguageModelIds()) {
		const metadata = languageModelsService.lookupLanguageModel(modelId);
		if (metadata?.capabilities?.toolCalling && !metadata.targetChatSessionType) {
			pushCandidate(modelId);
		}
	}

	for (const modelId of languageModelsService.getLanguageModelIds()) {
		pushCandidate(modelId);
	}

	return candidateModelIds;
}

async function requestModelPlanningQuestions(
	languageModelsService: ILanguageModelsService,
	modelId: string,
	messages: IChatMessage[],
	context: IPlanningQuestionGenerationContext,
	token: CancellationToken,
): Promise<IChatQuestion[]> {
	const response = await languageModelsService.sendChatRequest(modelId, undefined, messages, {}, token);
	const responseText = await getTextResponseFromStream(response);
	const parsed = parseQuestionEnvelope(responseText);
	return normalizeGeneratedQuestions(parsed, context);
}

function buildPlanningQuestionPrompt(context: IPlanningQuestionGenerationContext, requestedQuestionCount: number): string {
	const sections = [
		`Planning phase:\n${context.planningPhase} (${getPlanningPhaseLabel(context.planningPhase)})`,
		`Question stage:\n${context.questionStage}`,
		`Requested question count:\n${requestedQuestionCount}`,
		`User request:\n${context.userRequest.trim()}`,
	];

	if (context.activeFilePath) {
		sections.push(`Active file:\n${context.activeFilePath}`);
	}

	if (context.selectedText) {
		sections.push(`Selected code or text:\n${truncate(context.selectedText.trim(), 1400)}`);
	}

	if (context.plannerNotes) {
		sections.push(`Planner notes:\n${context.plannerNotes}`);
	}

	if (context.currentPlan) {
		sections.push(`Current plan:\n${truncate(context.currentPlan, 1800)}`);
	}

	if (context.planningAnswers.length > 0) {
		sections.push(`Existing planning answers:\n${context.planningAnswers.map(answer => `- ${answer.question}: ${answer.answer}`).join('\n')}`);
	}

	if (context.recentConversation.length > 0) {
		sections.push(`Recent planning conversation:\n${context.recentConversation.map(entry => `- ${entry}`).join('\n')}`);
	}

	if (context.repositoryContext) {
		sections.push(formatRepositoryContext(context.repositoryContext));
	}

	if (context.repositoryContext?.workspaceFolders?.length === 1 || context.repositoryContext?.workspaceRoot) {
		sections.push('Workspace grounding:\nThe current repository is already known. Ask about the file, directory, subsystem, or related artifacts inside it instead of asking which repo to use.');
	}

	if (!context.repositoryContext?.taskLens?.primaryArtifact && context.repositoryContext?.primaryArtifactHint) {
		sections.push(`Artifact targeting:\nThe request points at ${context.repositoryContext.primaryArtifactHint}, but the exact file, directory, symbol, or subsystem is not pinned down yet. Use the first goal-clarity question to lock that down inside the current workspace.`);
	}

	if (context.focusHint) {
		sections.push(`Focus hint:\n${context.focusHint}`);
	}

	if (context.focusAreaLabel) {
		sections.push(`User-selected focus area:\n${context.focusAreaLabel}`);
	}

	if (context.missingDimensions?.length) {
		sections.push(`Missing planning dimensions:\n${context.missingDimensions.join(', ')}`);
	}

	if (context.partialDimensions?.length) {
		sections.push(`Partially-covered dimensions:\n${context.partialDimensions.join(', ')}`);
	}

	sections.push([
		context.questionStage === 'goal-clarity'
			? `Return exactly ${requestedQuestionCount} questions that clarify the implementation goal, constraints, non-goals, and what success looks like before the first plan is built.`
			: context.questionStage === 'task-decomposition'
				? `Return exactly ${requestedQuestionCount} questions that tighten the first plan into a stronger work breakdown, insertion-point choice, repo slice, and validation path.`
				: `Return exactly ${requestedQuestionCount} questions that zoom in on one specific aspect of the rebuilt plan using the named focus area, the latest plan text, and the narrowed repo context.`,
		context.questionStage === 'goal-clarity'
			? 'Prefer a light but engaging pre-planning UX: the questions should feel closer to ask-questions than a heavy middleware banner.'
			: context.questionStage === 'task-decomposition'
				? 'Prefer a concrete refinement UX: one question should usually lock in work breakdown, insertion point, or validation.'
				: 'Prefer a focused refinement UX: the questions should feel like a zoom-in on one part of the plan, not a restart of the whole plan. When possible, cover the exact repo slice, the key unresolved decision, and the evidence or validation needed for that focused change.',
		'Avoid generic project-management questions.',
		'Do not ask for information that is already clear from the repo context, current plan, or earlier answers.',
		'Use the richer repository context to narrow the work as the phase becomes more specific.',
		'In broad-scan, keep questions exploratory.',
		'In focused-slice, prefer subsystem, insertion-point, and constraints questions.',
		'In detailed-inspection, prefer implementation-order, validation, and edit-boundary questions.',
		context.missingDimensions?.length ? `Cover these missing dimensions first: ${context.missingDimensions.join(', ')}.` : '',
		context.partialDimensions?.length ? `Use the remaining questions to sharpen these partial dimensions: ${context.partialDimensions.join(', ')}.` : '',
		context.questionStage === 'goal-clarity'
			? 'Do not ask sequencing or implementation-order questions unless they are necessary to understand the goal.'
			: context.questionStage === 'task-decomposition'
				? 'Do not repeat goal-clarity questions that are already answered in the planning context.'
				: 'Do not drift back into broad decomposition or restart the plan from scratch.',
		context.shouldConfirmPlanningTarget ? 'Do not ask the user to confirm the primary repo target again; that is being collected separately.' : '',
		'For singleSelect and multiSelect questions, defaultValue must reference the option label.'
	].join(' '));

	sections.push([
		'JSON schema:',
		'{"questions":[{"title":"...","message":"...","type":"text|singleSelect|multiSelect","required":true|false,"allowFreeformInput":true|false,"options":[{"label":"...","value":"..."}],"defaultValue":"..."|["..."]}]}'
	].join('\n'));

	return sections.join('\n\n');
}

function formatRepositoryContext(repositoryContext: IPlanningRepositoryContext): string {
	return [
		'Repository context:',
		`Scope: ${repositoryContext.scope}`,
		`Workspace root: ${repositoryContext.workspaceRoot || 'Not provided'}`,
		`Planning target: ${formatPlanningTarget(repositoryContext.planningTarget)}`,
		`Request intent: ${repositoryContext.requestIntent || 'Not provided'}`,
		`Task lens:\n${formatTaskLens(repositoryContext.taskLens)}`,
		`Primary artifact hint: ${repositoryContext.primaryArtifactHint || 'Not provided'}`,
		`Related artifact hints: ${repositoryContext.relatedArtifactHints?.join(', ') || 'None'}`,
		`Focus summary: ${repositoryContext.focusSummary || 'Not provided'}`,
		`Focus queries: ${repositoryContext.focusQueries.join(', ') || 'None'}`,
		`Workspace folders: ${repositoryContext.workspaceFolders?.join(', ') || 'None'}`,
		`Workspace top-level entries: ${repositoryContext.workspaceTopLevelEntries?.join(', ') || 'None'}`,
		`Working set files: ${repositoryContext.workingSetFiles?.join(', ') || 'None'}`,
		`Active document symbols: ${formatSymbols(repositoryContext.activeDocumentSymbols)}`,
		`Workspace symbol matches: ${formatSymbols(repositoryContext.workspaceSymbolMatches)}`,
		`Nearby files: ${repositoryContext.nearbyFiles.join(', ') || 'None'}`,
		`Relevant file snippets:\n${formatSnippets(repositoryContext.relevantSnippets)}`,
	].join('\n');
}

function parseQuestionEnvelope(raw: string): IGeneratedPlanningQuestionEnvelope | undefined {
	const trimmed = raw.trim();
	if (!trimmed) {
		return undefined;
	}

	const withoutFences = trimmed.startsWith('```')
		? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
		: trimmed;

	try {
		return JSON.parse(withoutFences) as IGeneratedPlanningQuestionEnvelope;
	} catch {
		return undefined;
	}
}

function normalizeGeneratedQuestions(parsed: IGeneratedPlanningQuestionEnvelope | undefined, context: IPlanningQuestionGenerationContext): IChatQuestion[] {
	const questions = parsed?.questions;
	if (!questions?.length) {
		return [];
	}

	return finalizeGeneratedQuestions(questions
		.map(normalizeGeneratedQuestion)
		.filter((question): question is IChatQuestion => !!question), context);
}

function normalizeGeneratedQuestion(question: IGeneratedPlanningQuestion): IChatQuestion | undefined {
	const title = normalizeText(question.title);
	if (!title) {
		return undefined;
	}

	const normalizedType = question.type ?? 'text';
	const options = (question.options ?? [])
		.map(option => {
			const label = normalizeText(option.label);
			const value = normalizeText(option.value) ?? label;
			if (!label || !value) {
				return undefined;
			}

			return {
				id: label,
				label,
				value
			};
		})
		.filter((option): option is NonNullable<typeof option> => !!option);

	const type = options.length >= 2 ? normalizedType : 'text';
	const normalizedMessage = normalizeText(question.message);
	const normalizedDescription = normalizeText(question.description);

	return {
		id: generateUuid(),
		title,
		message: normalizedMessage ?? normalizedDescription,
		description: normalizedDescription,
		type,
		options: type === 'text' ? undefined : options,
		required: question.required === true,
		allowFreeformInput: question.allowFreeformInput ?? true,
		defaultValue: type === 'text' ? normalizeDefaultTextValue(question.defaultValue) : normalizeDefaultOptionValue(question.defaultValue, options)
	};
}

function normalizeDefaultTextValue(defaultValue: string | string[] | undefined): string | undefined {
	return typeof defaultValue === 'string' ? normalizeText(defaultValue) : undefined;
}

function normalizeDefaultOptionValue(defaultValue: string | string[] | undefined, options: ReadonlyArray<{ label: string }>): string | string[] | undefined {
	if (typeof defaultValue === 'string') {
		return options.some(option => option.label === defaultValue) ? defaultValue : undefined;
	}

	if (Array.isArray(defaultValue)) {
		const matchingValues = defaultValue.filter(value => options.some(option => option.label === value));
		return matchingValues.length > 0 ? matchingValues : undefined;
	}

	return undefined;
}

function normalizeText(value: string | undefined): string | undefined {
	return value?.replace(/\s+/g, ' ').trim() || undefined;
}

function truncate(value: string, maxLength: number): string {
	return value.length <= maxLength ? value : `${value.slice(0, maxLength)}...`;
}

function finalizeGeneratedQuestions(questions: readonly IChatQuestion[], context: IPlanningQuestionGenerationContext): IChatQuestion[] {
	const requestedQuestionCount = clampRequestedQuestionCount(context.questionCount);
	const deduped = dedupeQuestionsByPrompt(questions);
	const stageFiltered = context.questionStage === 'goal-clarity'
		? deduped
		: deduped.filter(question => !isOverlappingGoalClarityQuestion(question, context.planningAnswers));
	if (stageFiltered.length < requestedQuestionCount) {
		return [];
	}

	const ranked = rankQuestionsForContext(stageFiltered, context);
	const trimmed = selectQuestionsWithStageMix(ranked, requestedQuestionCount, context);
	const hasStructuredQuestion = trimmed.some(question => question.type !== 'text');
	const hasTextQuestion = trimmed.some(question => question.type === 'text');

	if (context.questionStage === 'goal-clarity') {
		if (requestedQuestionCount === 1) {
			return trimmed.slice(0, 1);
		}

		return hasStructuredQuestion && hasTextQuestion ? trimmed : [];
	}

	if (context.questionStage === 'plan-focus' && requestedQuestionCount > 2) {
		return hasStructuredQuestion && hasTextQuestion ? trimmed : [];
	}

	if (requestedQuestionCount === 1) {
		return trimmed.slice(0, 1);
	}

	return hasStructuredQuestion ? trimmed : [];
}

function rankQuestionsForContext(questions: readonly IChatQuestion[], context: IPlanningQuestionGenerationContext): IChatQuestion[] {
	return [...questions]
		.map((question, index) => ({
			question,
			index,
			score: scoreQuestionForContext(question, context),
		}))
		.sort((left, right) => right.score - left.score || left.index - right.index)
		.map(entry => entry.question);
}

function selectQuestionsWithStageMix(
	rankedQuestions: readonly IChatQuestion[],
	requestedQuestionCount: number,
	context: IPlanningQuestionGenerationContext,
): IChatQuestion[] {
	if (requestedQuestionCount <= 1) {
		return rankedQuestions.slice(0, 1);
	}

	const requireTextAndStructured = context.questionStage === 'goal-clarity' || (context.questionStage === 'plan-focus' && requestedQuestionCount > 2);
	if (!requireTextAndStructured) {
		return rankedQuestions.slice(0, requestedQuestionCount);
	}

	const hasConcretePrimaryArtifact = isConcretePlanningArtifactReference(context.repositoryContext?.taskLens?.primaryArtifact)
		|| isConcretePlanningArtifactReference(context.repositoryContext?.primaryArtifactHint);
	const hasUnresolvedPrimaryArtifact = !hasConcretePrimaryArtifact && !!context.repositoryContext?.primaryArtifactHint;
	const textQuestion = rankedQuestions.find(question => question.type === 'text');
	const structuredQuestion = rankedQuestions.find(question => question.type !== 'text');
	if (!textQuestion || !structuredQuestion) {
		return rankedQuestions.slice(0, requestedQuestionCount);
	}

	const selected: IChatQuestion[] = [];
	const seen = new Set<string>();
	const prioritizedQuestions = hasUnresolvedPrimaryArtifact && context.questionStage === 'goal-clarity'
		? [rankedQuestions[0], textQuestion, structuredQuestion, ...rankedQuestions]
		: [structuredQuestion, textQuestion, ...rankedQuestions];
	for (const question of prioritizedQuestions) {
		if (seen.has(question.id)) {
			continue;
		}

		seen.add(question.id);
		selected.push(question);
		if (selected.length >= requestedQuestionCount) {
			break;
		}
	}

	return selected;
}

function clampRequestedQuestionCount(questionCount: number | undefined): number {
	return Math.min(Math.max(questionCount ?? 3, 1), 4);
}

function dedupeQuestionsByPrompt(questions: readonly IChatQuestion[]): IChatQuestion[] {
	const deduped: IChatQuestion[] = [];

	for (const candidate of questions) {
		const candidateText = normalizeQuestionPrompt(candidate);
		if (!candidateText) {
			continue;
		}

		if (deduped.some(existing => computeOverlap(normalizeQuestionPrompt(existing), candidateText) >= 0.72)) {
			continue;
		}

		deduped.push(candidate);
	}

	return deduped;
}

function isOverlappingGoalClarityQuestion(question: IChatQuestion, planningAnswers: readonly IPlanningTransitionAnswer[]): boolean {
	const prompt = normalizeQuestionPrompt(question);
	if (!prompt) {
		return false;
	}

	if (looksLikeGoalClarityQuestion(prompt)) {
		return true;
	}

	return planningAnswers.some(answer => {
		const previousPrompt = normalizeWhitespace(answer.question);
		return previousPrompt ? computeOverlap(previousPrompt, prompt) >= 0.42 : false;
	});
}

function looksLikeGoalClarityQuestion(prompt: string): boolean {
	return /\b(goal|outcome|success|definition of done|done|scope|non-goal|non goal|constraint|boundary|in scope|out of scope)\b/i.test(prompt);
}

function normalizeQuestionPrompt(question: IChatQuestion): string {
	return normalizeWhitespace([question.title, typeof question.message === 'string' ? question.message : undefined, question.description].filter(Boolean).join(' '));
}

function normalizeWhitespace(value: string | undefined): string {
	return value?.replace(/\s+/g, ' ').trim().toLowerCase() ?? '';
}

function computeOverlap(left: string, right: string): number {
	if (!left || !right) {
		return 0;
	}

	const leftTokens = new Set(left.match(/[a-z0-9]{4,}/gi) ?? []);
	const rightTokens = new Set(right.match(/[a-z0-9]{4,}/gi) ?? []);
	if (leftTokens.size === 0 || rightTokens.size === 0) {
		return 0;
	}

	let matches = 0;
	for (const token of leftTokens) {
		if (rightTokens.has(token)) {
			matches += 1;
		}
	}

	return matches / Math.max(leftTokens.size, rightTokens.size);
}

function scoreQuestionForContext(question: IChatQuestion, context: IPlanningQuestionGenerationContext): number {
	const prompt = normalizeQuestionPrompt(question);
	if (!prompt) {
		return -Infinity;
	}

	const taskLens = context.repositoryContext?.taskLens;
	const hasConcretePrimaryArtifact = isConcretePlanningArtifactReference(taskLens?.primaryArtifact)
		|| isConcretePlanningArtifactReference(context.repositoryContext?.primaryArtifactHint);
	const hasUnresolvedPrimaryArtifact = !hasConcretePrimaryArtifact && !!context.repositoryContext?.primaryArtifactHint;
	const overlap = (values: readonly string[] | undefined, weight: number) => {
		if (!values?.length) {
			return 0;
		}

		return values.reduce((total, value) => total + computeOverlap(prompt, normalizeWhitespace(value)) * weight, 0);
	};
	const keywordOverlap = (value: string | undefined, weight: number) => value ? computeOverlap(prompt, normalizeWhitespace(value)) * weight : 0;
	let score = overlap(context.missingDimensions, 1.8)
		+ overlap(context.partialDimensions, 1.1)
		+ keywordOverlap(taskLens?.taskSummary, 1.8)
		+ keywordOverlap(taskLens?.desiredOutcome, 2.2)
		+ keywordOverlap(taskLens?.primaryArtifact ?? context.repositoryContext?.primaryArtifactHint, 2.4)
		+ overlap(taskLens?.secondaryArtifacts ?? context.repositoryContext?.relatedArtifactHints, 1.5)
		+ overlap(taskLens?.planAreas, context.questionStage === 'goal-clarity' ? 0.7 : 1.8)
		+ overlap(taskLens?.validationTargets, 1.6)
		+ overlap(taskLens?.riskAreas, 1.5)
		+ overlap(taskLens?.unknowns, 2)
		+ keywordOverlap(context.focusAreaLabel, context.questionStage === 'plan-focus' ? 2.6 : 0.8)
		+ keywordOverlap(context.currentPlan, context.questionStage === 'goal-clarity' ? 0.4 : 1.1);

	if (context.questionStage === 'task-decomposition' && question.type !== 'text') {
		score += 0.35;
	}

	if (context.questionStage === 'plan-focus' && question.type === 'text') {
		score += 0.25;
	}

	if ((context.repositoryContext?.workspaceRoot || context.repositoryContext?.workspaceFolders?.length === 1)
		&& (taskLens?.primaryArtifact || context.repositoryContext?.primaryArtifactHint)
		&& /\b(repo|repository|workspace)\b/i.test(prompt)) {
		score -= 3.5;
	}

	if (hasUnresolvedPrimaryArtifact && context.questionStage === 'goal-clarity') {
		if (/\b(file|folder|directory|subsystem|symbol|module|entrypoint|script|csv|tsv|json|yaml|sql|notebook|test)\b/i.test(prompt)) {
			score += 2.4;
		}

		if (/\b(which|what)\b.{0,40}\b(file|folder|directory|subsystem|symbol|module|csv|script|test)\b/i.test(prompt)) {
			score += 1.2;
		}

		if (/\b(anchor|primary|exact|target)\b/i.test(prompt)) {
			score += 1.4;
		}

		if (/\brelated files?\b|\badjacent files?\b|\bother files?\b/i.test(prompt)) {
			score -= 1.6;
		}
	}

	if (taskLens?.artifactType === 'dataset' && /\b(language|framework|library|plotting|frontend)\b/i.test(prompt)) {
		score -= 2;
	}

	if (context.questionStage !== 'goal-clarity' && looksLikeGoalClarityQuestion(prompt)) {
		score -= 3;
	}

	if (/\bwhich repo\b|\bwhich workspace\b/i.test(prompt)) {
		score -= 4;
	}

	return score;
}

function formatSymbols(symbols: ReadonlyArray<{ name: string; kind: string; file?: string }>): string {
	if (!symbols.length) {
		return 'None';
	}

	return symbols
		.slice(0, 10)
		.map(symbol => `${symbol.name} (${symbol.kind}${symbol.file ? ` @ ${symbol.file}` : ''})`)
		.join(', ');
}

function formatSnippets(snippets: ReadonlyArray<{ path: string; preview: string; detailLevel?: string; reason?: string }>): string {
	if (!snippets.length) {
		return 'None';
	}

	return snippets
		.slice(0, 4)
		.map(snippet => [
			`FILE: ${snippet.path}`,
			snippet.detailLevel ? `DETAIL: ${snippet.detailLevel}` : '',
			snippet.reason ? `WHY: ${snippet.reason}` : '',
			snippet.preview,
		].filter(part => part.length > 0).join('\n'))
		.join('\n---\n');
}

function formatTaskLens(taskLens: IPlanningTaskLens | undefined): string {
	if (!taskLens) {
		return 'Not provided';
	}

	return [
		`Task kind: ${taskLens.taskKind}`,
		`Task summary: ${taskLens.taskSummary || 'Not provided'}`,
		`Primary artifact: ${taskLens.primaryArtifact || 'Not provided'}`,
		`Adjacent artifacts: ${taskLens.secondaryArtifacts?.join(', ') || 'None'}`,
		`Artifact type: ${taskLens.artifactType || 'Not provided'}`,
		`Desired outcome: ${taskLens.desiredOutcome || 'Not provided'}`,
		`Expected deliverable: ${taskLens.deliverableType || 'Not provided'}`,
		`Plan areas: ${taskLens.planAreas?.join(', ') || 'None'}`,
		`Validation targets: ${taskLens.validationTargets?.join(', ') || 'None'}`,
		`Risks or guardrails: ${taskLens.riskAreas?.join('; ') || 'None'}`,
		`Open decisions: ${taskLens.unknowns?.join('; ') || 'None'}`,
	].join('\n');
}

function formatPlanningTarget(target: IPlanningTarget | undefined): string {
	if (!target) {
		return 'Not provided';
	}

	return `${target.label} (${target.kind}${target.confidence ? `, ${target.confidence} confidence` : ''})`;
}
