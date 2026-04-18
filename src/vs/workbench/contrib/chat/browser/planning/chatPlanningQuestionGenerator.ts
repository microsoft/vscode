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
import { getPlanningPhaseLabel, IPlanningRepositoryContext, IPlanningTarget, IPlanningTransitionAnswer, PlanningPhase, PlanningQuestionStage, planningTargetConfirmationQuestionId, serializePlanningTarget } from '../../common/planning/chatPlanningTransition.js';

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
	const injectedQuestions = createInjectedPlanningQuestions(context);
	const modelId = context.modelId ?? pickFallbackModelId(languageModelsService);
	if (!modelId) {
		const finalizedFallbackQuestions = finalizeGeneratedQuestions([
			...injectedQuestions,
			...createFallbackPlanningQuestions(context.planningPhase, context.questionStage)
		], context);
		return finalizedFallbackQuestions.length > 0 ? finalizedFallbackQuestions : createFallbackPlanningQuestions(context.planningPhase, context.questionStage);
	}

	const requestedModelQuestionCount = Math.max(0, requestedQuestionCount - injectedQuestions.length);
	const prompt = buildPlanningQuestionPrompt(context, requestedModelQuestionCount);
	const messages: IChatMessage[] = [
		{
			role: ChatMessageRole.System,
			content: [{
				type: 'text',
				value: [
					'You generate dynamic planning questions for coding work in VS Code.',
					'You are a dynamic planning prompt middleware that runs before the planning agent receives the actual request.',
					`The current middleware stage is ${context.questionStage}.`,
					'Respect the current planning phase.',
					'- broad-scan: clarify the problem space and candidate code areas.',
					'- focused-slice: narrow to the subsystem, insertion point, and concrete constraints that matter most.',
					'- detailed-inspection: make the remaining questions concrete enough to drive implementation order, validation, and edit boundaries.',
					`Ask exactly ${requestedModelQuestionCount} questions.`,
					`Never return fewer than ${requestedModelQuestionCount} questions.`,
					'Use a mix of interaction types when it improves clarity.',
					'Use text questions for open-ended clarification.',
					'Use singleSelect or multiSelect whenever a bounded choice would help the user make a sharper planning decision.',
					'Prefer questions that change implementation scope, success criteria, sequencing, or insertion-point choice.',
					'If the stage is goal-clarity, focus on desired outcome, constraints, definition of done, and what should be in or out of scope before the first plan is built.',
					'If the stage is task-decomposition, assume the first plan already exists and focus on tightening the work breakdown, insertion points, sequencing, validation, and repo slice for the rebuild.',
					'If the stage is plan-focus, assume a rebuilt plan already exists and focus on sharpening one specific aspect of that plan rather than reopening the whole request.',
					'If the stage is task-decomposition or plan-focus, treat prior goal-clarity answers as settled inputs, not new question topics.',
					'Never ask task-decomposition or plan-focus questions that re-open goal, scope, non-goals, or definition-of-done themes.',
					requestedModelQuestionCount > 1 ? 'For goal-clarity, prefer at least one structured choice question plus one open text question unless the context is genuinely too ambiguous.' : '',
					context.questionStage === 'task-decomposition' ? 'For task-decomposition, prefer a structured work-breakdown or insertion-point question and avoid drifting back into abstract scope questions.' : '',
					context.questionStage === 'plan-focus' ? 'For plan-focus, prefer follow-up controls that zoom in on a named risk, subsystem, validation path, or sequencing decision from the current plan.' : '',
					'Descriptions should be concise and help the user understand why the question matters.',
					'Do not repeat the same question theme across both stages.',
					context.shouldConfirmPlanningTarget ? 'The planning target is being confirmed separately. Do not use one of your questions to ask which file, folder, or workspace slice to target.' : '',
					'Return JSON only with the shape {"questions":[...]} and no markdown.'
				].join(' ')
			}]
		},
		{
			role: ChatMessageRole.User,
			content: [{ type: 'text', value: prompt }]
		}
	];

	try {
		const normalized = requestedModelQuestionCount > 0
			? await requestModelPlanningQuestions(languageModelsService, modelId, messages, context, token)
			: [];
		const finalized = finalizeGeneratedQuestions([...injectedQuestions, ...normalized], context);
		return finalized.length > 0 ? finalized : createFallbackPlanningQuestions(context.planningPhase, context.questionStage);
	} catch {
		const finalizedFallbackQuestions = finalizeGeneratedQuestions([
			...injectedQuestions,
			...createFallbackPlanningQuestions(context.planningPhase, context.questionStage)
		], context);
		return finalizedFallbackQuestions.length > 0 ? finalizedFallbackQuestions : createFallbackPlanningQuestions(context.planningPhase, context.questionStage);
	}
}

function pickFallbackModelId(languageModelsService: ILanguageModelsService): string | undefined {
	for (const modelId of languageModelsService.getLanguageModelIds()) {
		const metadata = languageModelsService.lookupLanguageModel(modelId);
		if (metadata?.capabilities?.toolCalling && !metadata.targetChatSessionType) {
			return modelId;
		}
	}

	return languageModelsService.getLanguageModelIds().find(modelId => !languageModelsService.lookupLanguageModel(modelId)?.targetChatSessionType);
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

	if (context.focusHint) {
		sections.push(`Focus hint:\n${context.focusHint}`);
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
				: `Return exactly ${requestedQuestionCount} questions that zoom in on one specific aspect of the rebuilt plan.`,
		context.questionStage === 'goal-clarity'
			? 'Prefer a light but engaging pre-planning UX: the questions should feel closer to ask-questions than a heavy middleware banner.'
			: context.questionStage === 'task-decomposition'
				? 'Prefer a concrete refinement UX: one question should usually lock in work breakdown, insertion point, or validation.'
				: 'Prefer a focused refinement UX: the questions should feel like a zoom-in on one part of the plan, not a restart of the whole plan.',
		'Avoid generic project-management questions.',
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
		.slice(0, 4)
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
	const supplemented = supplementQuestionSet(stageFiltered, context);

	if (supplemented.length < requestedQuestionCount) {
		return [];
	}

	const hasStructuredQuestion = supplemented.some(question => question.type !== 'text');
	const hasTextQuestion = supplemented.some(question => question.type === 'text');

	if (context.questionStage === 'goal-clarity') {
		if (requestedQuestionCount === 1) {
			return supplemented.slice(0, 1);
		}

		return hasStructuredQuestion && hasTextQuestion ? supplemented.slice(0, requestedQuestionCount) : [];
	}

	if (requestedQuestionCount === 1) {
		return supplemented.slice(0, 1);
	}

	return hasStructuredQuestion ? supplemented.slice(0, requestedQuestionCount) : [];
}

function supplementQuestionSet(questions: readonly IChatQuestion[], context: IPlanningQuestionGenerationContext): IChatQuestion[] {
	const requestedQuestionCount = clampRequestedQuestionCount(context.questionCount);
	const supplemented = [...questions];
	if (supplemented.length >= requestedQuestionCount) {
		return supplemented.slice(0, requestedQuestionCount);
	}

	const fallbackQuestions = createFallbackPlanningQuestions(context.planningPhase, context.questionStage);
	for (const fallbackQuestion of fallbackQuestions) {
		const candidate = context.questionStage !== 'goal-clarity' && isOverlappingGoalClarityQuestion(fallbackQuestion, context.planningAnswers)
			? undefined
			: fallbackQuestion;
		if (!candidate) {
			continue;
		}

		const candidateText = normalizeQuestionPrompt(candidate);
		if (!candidateText) {
			continue;
		}

		if (supplemented.some(existing => computeOverlap(normalizeQuestionPrompt(existing), candidateText) >= 0.72)) {
			continue;
		}

		supplemented.push(candidate);
		if (supplemented.length >= requestedQuestionCount) {
			break;
		}
	}

	return supplemented;
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

function createFallbackPlanningQuestions(phase: PlanningPhase, questionStage: PlanningQuestionStage = 'goal-clarity'): IChatQuestion[] {
	if (questionStage === 'plan-focus') {
		return [
			{
				id: generateUuid(),
				type: 'singleSelect',
				title: localize('chat.planQuestions.planFocusLensTitle', 'Plan Lens To Tighten'),
				message: localize('chat.planQuestions.planFocusLensMessage', 'Which part of the current plan should this zoom-in make sharper?'),
				options: [
					{ id: 'risky-step', label: localize('chat.planQuestions.planFocusLensRisk', 'Risky step or dependency'), value: 'Risky step or dependency' },
					{ id: 'edit-boundary', label: localize('chat.planQuestions.planFocusLensBoundary', 'Edit boundary or ownership split'), value: 'Edit boundary or ownership split' },
					{ id: 'validation-path', label: localize('chat.planQuestions.planFocusLensValidation', 'Validation path'), value: 'Validation path' },
				],
				allowFreeformInput: true,
				required: true
			},
			{
				id: generateUuid(),
				type: 'text',
				title: localize('chat.planQuestions.planFocusDetailTitle', 'What Still Feels Underspecified?'),
				message: localize('chat.planQuestions.planFocusDetailMessage', 'Name the step, risk, or dependency that still needs sharper guidance.'),
				required: false
			}
		];
	}

	if (questionStage === 'goal-clarity') {
		switch (phase) {
			case 'focused-slice':
				return [
					{
						id: generateUuid(),
						type: 'singleSelect',
						title: localize('chat.planQuestions.goalFocusedTitle', 'Decision To Land In This Slice'),
						message: localize('chat.planQuestions.goalFocusedMessage', 'What should this focused pre-planning pass lock in before planning continues?'),
						description: localize('chat.planQuestions.goalFocusedDescription', 'Choose the main decision this step should settle.'),
						options: [
							{ id: 'owning-subsystem', label: localize('chat.planQuestions.goalFocusedSubsystem', 'Owning subsystem'), value: 'Owning subsystem' },
							{ id: 'primary-insertion-point', label: localize('chat.planQuestions.goalFocusedInsertion', 'Primary insertion point'), value: 'Primary insertion point' },
							{ id: 'scope-boundary', label: localize('chat.planQuestions.goalFocusedBoundary', 'Scope boundary'), value: 'Scope boundary' },
						],
						allowFreeformInput: true,
						required: true
					},
					{
						id: generateUuid(),
						type: 'text',
						title: localize('chat.planQuestions.constraintsFocusedTitle', 'Critical Constraints'),
						message: localize('chat.planQuestions.constraintsFocusedMessage', 'What constraints, non-goals, or boundaries should keep this slice narrow?'),
						description: localize('chat.planQuestions.constraintsFocusedDescription', 'Capture the constraint that should most strongly shape the next plan.'),
						required: false
					},
					{
						id: generateUuid(),
						type: 'multiSelect',
						title: localize('chat.planQuestions.successFocusedTitle', 'Useful Signals To Lock In'),
						message: localize('chat.planQuestions.successFocusedMessage', 'Which signals would make the next planning step noticeably better?'),
						options: [
							{ id: 'affected-subsystem', label: localize('chat.planQuestions.affectedSubsystem', 'Owning subsystem'), value: 'Owning subsystem' },
							{ id: 'insertion-point', label: localize('chat.planQuestions.insertionPointClarify', 'Likely insertion point'), value: 'Likely insertion point' },
							{ id: 'scope-boundary', label: localize('chat.planQuestions.scopeBoundaryClarify', 'Out-of-scope boundary'), value: 'Out-of-scope boundary' },
						],
						allowFreeformInput: true,
						required: false
					}
				];
			case 'detailed-inspection':
				return [
					{
						id: generateUuid(),
						type: 'singleSelect',
						title: localize('chat.planQuestions.goalDetailedTitle', 'Implementation Outcome'),
						message: localize('chat.planQuestions.goalDetailedMessage', 'What should this implementation-ready plan make unambiguous?'),
						options: [
							{ id: 'edit-sequence', label: localize('chat.planQuestions.goalDetailedSequence', 'Edit sequence'), value: 'Edit sequence' },
							{ id: 'file-boundaries', label: localize('chat.planQuestions.goalDetailedBoundaries', 'File and responsibility boundaries'), value: 'File and responsibility boundaries' },
							{ id: 'validation-path', label: localize('chat.planQuestions.goalDetailedValidation', 'Validation path'), value: 'Validation path' },
						],
						allowFreeformInput: true,
						required: true
					},
					{
						id: generateUuid(),
						type: 'text',
						title: localize('chat.planQuestions.nonGoalsDetailedTitle', 'Non-Goals'),
						message: localize('chat.planQuestions.nonGoalsDetailedMessage', 'Which files, behaviors, or responsibilities should explicitly remain untouched?'),
						description: localize('chat.planQuestions.nonGoalsDetailedDescription', 'This keeps the eventual implementation plan tight.'),
						required: false
					},
					{
						id: generateUuid(),
						type: 'multiSelect',
						title: localize('chat.planQuestions.doneDetailedTitle', 'Definition Of Done'),
						message: localize('chat.planQuestions.doneDetailedMessage', 'What needs to be settled before this can cleanly hand off to implementation?'),
						options: [
							{ id: 'changed-files', label: localize('chat.planQuestions.doneDetailedFiles', 'Likely changed files'), value: 'Likely changed files' },
							{ id: 'edit-order', label: localize('chat.planQuestions.doneDetailedOrder', 'Edit order'), value: 'Edit order' },
							{ id: 'checks', label: localize('chat.planQuestions.doneDetailedChecks', 'Validation checks'), value: 'Validation checks' },
						],
						allowFreeformInput: true,
						required: false
					}
				];
			default:
				return [
					{
						id: generateUuid(),
						type: 'singleSelect',
						title: localize('chat.planQuestions.goalTitle', 'What Kind Of Planning Outcome Do You Want?'),
						message: localize('chat.planQuestions.goalMessage', 'Which kind of outcome should this pre-planning step sharpen first?'),
						description: localize('chat.planQuestions.goalDescription', 'This helps tailor the rest of the questions before the request is sent to Planner.'),
						options: [
							{ id: 'refine-existing-behavior', label: localize('chat.planQuestions.goalExistingBehavior', 'Refine existing behavior'), value: 'Refine existing behavior' },
							{ id: 'design-new-flow', label: localize('chat.planQuestions.goalNewFlow', 'Design a new flow'), value: 'Design a new flow' },
							{ id: 'sequence-refactor', label: localize('chat.planQuestions.goalRefactor', 'Sequence a refactor'), value: 'Sequence a refactor' },
							{ id: 'investigate-approach', label: localize('chat.planQuestions.goalInvestigate', 'Investigate the best approach'), value: 'Investigate the best approach' }
						],
						allowFreeformInput: true,
						required: true
					},
					{
						id: generateUuid(),
						type: 'multiSelect',
						title: localize('chat.planQuestions.constraintsTitle', 'What Should The Planner Optimize For?'),
						message: localize('chat.planQuestions.constraintsMessage', 'Pick the factors that should most strongly shape the plan.'),
						options: [
							{ id: 'minimal-surface-area', label: localize('chat.planQuestions.constraintsMinimalSurface', 'Minimal surface area'), value: 'Minimal surface area' },
							{ id: 'clearer-user-experience', label: localize('chat.planQuestions.constraintsUserExperience', 'Clearer user experience'), value: 'Clearer user experience' },
							{ id: 'safer-rollout', label: localize('chat.planQuestions.constraintsSafety', 'Safer rollout and lower regression risk'), value: 'Safer rollout and lower regression risk' },
							{ id: 'testability', label: localize('chat.planQuestions.constraintsTests', 'Better testability'), value: 'Better testability' }
						],
						allowFreeformInput: true,
						required: false
					},
					{
						id: generateUuid(),
						type: 'text',
						title: localize('chat.planQuestions.successTitle', 'Definition Of Done'),
						message: localize('chat.planQuestions.successMessage', 'What needs to be clear before the plan can move on to implementation steps?'),
						description: localize('chat.planQuestions.successDescription', 'Use this to capture the final outcome or boundary the planner should treat as fixed.'),
						required: false
					}
				];
		}
	}

	switch (phase) {
		case 'focused-slice':
			return [
				{
					id: generateUuid(),
					type: 'singleSelect',
					title: localize('chat.planQuestions.focusAreaTitle', 'Primary Focus Area'),
					message: localize('chat.planQuestions.focusAreaMessage', 'Which part of the codebase should this plan narrow onto next?'),
					options: [
						{ id: 'entry-point', label: localize('chat.planQuestions.entryPoint', 'Entry point or command path'), value: 'Entry point or command path' },
						{ id: 'state-model', label: localize('chat.planQuestions.stateModel', 'Planning state and transitions'), value: 'Planning state and transitions' },
						{ id: 'ui-surface', label: localize('chat.planQuestions.uiSurface', 'UI surface and interaction model'), value: 'UI surface and interaction model' },
						{ id: 'validation-tests', label: localize('chat.planQuestions.validationTests', 'Validation and tests'), value: 'Validation and tests' }
					],
					allowFreeformInput: true,
					required: true
				},
				{
					id: generateUuid(),
					type: 'text',
					title: localize('chat.planQuestions.focusConstraintsTitle', 'Key Constraints'),
					message: localize('chat.planQuestions.focusConstraintsMessage', 'What constraints or non-goals should keep this phase tightly scoped?'),
					required: false
				},
				{
					id: generateUuid(),
					type: 'multiSelect',
					title: localize('chat.planQuestions.focusBreakdownTitle', 'Focused Breakdown'),
					message: localize('chat.planQuestions.focusBreakdownMessage', 'Which narrowed steps should this phase lock in?'),
					options: [
						{ id: 'pick-files', label: localize('chat.planQuestions.pickFiles', 'Choose likely files and symbols'), value: 'Choose likely files and symbols' },
						{ id: 'pick-insertion-point', label: localize('chat.planQuestions.pickInsertionPoint', 'Choose insertion point'), value: 'Choose insertion point' },
						{ id: 'confirm-data-flow', label: localize('chat.planQuestions.confirmDataFlow', 'Confirm data and state flow'), value: 'Confirm data and state flow' },
						{ id: 'define-success', label: localize('chat.planQuestions.defineSuccess', 'Define success criteria'), value: 'Define success criteria' }
					],
					allowFreeformInput: true,
					required: false
				}
			];
		case 'detailed-inspection':
			return [
				{
					id: generateUuid(),
					type: 'multiSelect',
					title: localize('chat.planQuestions.detailSequenceTitle', 'Implementation Sequence'),
					message: localize('chat.planQuestions.detailSequenceMessage', 'Which concrete implementation steps should happen in this order?'),
					options: [
						{ id: 'inspect-existing-flow', label: localize('chat.planQuestions.inspectExistingFlow', 'Inspect the exact existing flow'), value: 'Inspect the exact existing flow' },
						{ id: 'edit-state', label: localize('chat.planQuestions.editState', 'Edit planning state and transitions'), value: 'Edit planning state and transitions' },
						{ id: 'wire-ui', label: localize('chat.planQuestions.wireUi', 'Wire the UI or action surface'), value: 'Wire the UI or action surface' },
						{ id: 'verify-tests', label: localize('chat.planQuestions.verifyTests', 'Verify behavior and tests'), value: 'Verify behavior and tests' }
					],
					allowFreeformInput: true,
					required: true
				},
				{
					id: generateUuid(),
					type: 'text',
					title: localize('chat.planQuestions.detailBoundariesTitle', 'Edit Boundaries'),
					message: localize('chat.planQuestions.detailBoundariesMessage', 'Which files, interfaces, or responsibilities should remain untouched in this pass?'),
					required: false
				},
				{
					id: generateUuid(),
					type: 'text',
					title: localize('chat.planQuestions.detailValidationTitle', 'Validation Plan'),
					message: localize('chat.planQuestions.detailValidationMessage', 'What checks should confirm the implementation is correct before moving on?'),
					required: false
				}
			];
		default:
			return [
				{
					id: generateUuid(),
					type: 'multiSelect',
					title: localize('chat.planQuestions.breakdownTitle', 'Task Breakdown'),
					message: localize('chat.planQuestions.breakdownMessage', 'Which broad steps should the implementation cover?'),
					options: [
						{ id: 'audit-existing-code', label: localize('chat.planQuestions.audit', 'Audit existing code path'), value: 'Audit existing code path' },
						{ id: 'pick-insertion-point', label: localize('chat.planQuestions.insertion', 'Choose insertion point'), value: 'Choose insertion point' },
						{ id: 'implement-core-change', label: localize('chat.planQuestions.implement', 'Implement core change'), value: 'Implement core change' },
						{ id: 'validate-behavior', label: localize('chat.planQuestions.validate', 'Validate behavior and regressions'), value: 'Validate behavior and regressions' }
					],
					allowFreeformInput: true,
					required: true
				},
				{
					id: generateUuid(),
					type: 'singleSelect',
					title: localize('chat.planQuestions.insertionPointTitle', 'Starting Point'),
					message: localize('chat.planQuestions.insertionPointMessage', 'Where should implementation most likely begin?'),
					options: [
						{ id: 'entry-point', label: localize('chat.planQuestions.entryPointStart', 'Entry point or command path'), value: 'Entry point or command path' },
						{ id: 'state-flow', label: localize('chat.planQuestions.stateFlowStart', 'State and transition logic'), value: 'State and transition logic' },
						{ id: 'ui-surface', label: localize('chat.planQuestions.uiSurfaceStart', 'UI surface or interaction point'), value: 'UI surface or interaction point' },
						{ id: 'tests', label: localize('chat.planQuestions.testsStart', 'Tests or validation harness'), value: 'Tests or validation harness' }
					],
					allowFreeformInput: true,
					required: false
				},
				{
					id: generateUuid(),
					type: 'text',
					title: localize('chat.planQuestions.validationTitle', 'Validation Strategy'),
					message: localize('chat.planQuestions.validationMessage', 'What checks should confirm the implementation is correct once those steps are complete?'),
					required: false
				}
			];
	}
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

function createInjectedPlanningQuestions(context: IPlanningQuestionGenerationContext): IChatQuestion[] {
	if (!context.shouldConfirmPlanningTarget || context.questionStage !== 'goal-clarity') {
		return [];
	}

	const confirmationQuestion = createPlanningTargetConfirmationQuestion(context);
	return confirmationQuestion ? [confirmationQuestion] : [];
}

function createPlanningTargetConfirmationQuestion(context: IPlanningQuestionGenerationContext): IChatQuestion | undefined {
	const options = getPlanningTargetCandidates(context)
		.map(target => ({
			id: `${target.kind}:${target.label}`,
			label: target.label,
			value: serializePlanningTarget(target),
		}))
		.filter((option, index, options) => options.findIndex(candidate => candidate.value === option.value) === index)
		.slice(0, 5);

	if (options.length === 0) {
		return undefined;
	}

	return {
		id: planningTargetConfirmationQuestionId,
		type: 'singleSelect',
		title: localize('chat.planQuestions.targetConfirmationTitle', 'Primary Planning Target'),
		message: localize('chat.planQuestions.targetConfirmationMessage', 'Which repo target should these planning questions focus on first?'),
		description: localize('chat.planQuestions.targetConfirmationDescription', 'This anchors the remaining pre-planning questions to the right file, folder, or working set.'),
		options,
		defaultValue: options[0].label,
		required: true,
		allowFreeformInput: true,
	};
}

function getPlanningTargetCandidates(context: IPlanningQuestionGenerationContext): IPlanningTarget[] {
	const candidates: IPlanningTarget[] = [];
	const repositoryContext = context.repositoryContext;

	if (repositoryContext?.planningTarget) {
		candidates.push({
			...repositoryContext.planningTarget,
			confidence: 'high',
		});
	}

	if (context.activeFilePath) {
		candidates.push({
			kind: 'file',
			label: context.activeFilePath.split('/').pop() || context.activeFilePath,
			resource: context.activeFilePath,
			confidence: 'high',
		});
	}

	for (const file of repositoryContext?.workingSetFiles?.slice(0, 2) ?? []) {
		candidates.push({
			kind: 'working-set',
			label: file,
			confidence: 'medium',
		});
	}

	for (const entry of repositoryContext?.workspaceTopLevelEntries?.slice(0, 2) ?? []) {
		candidates.push({
			kind: entry.includes('.') ? 'file' : 'folder',
			label: entry,
			confidence: 'medium',
		});
	}

	for (const folder of repositoryContext?.workspaceFolders?.slice(0, 2) ?? []) {
		candidates.push({
			kind: 'folder',
			label: folder,
			confidence: 'medium',
		});
	}

	if (repositoryContext?.workspaceRoot) {
		candidates.push({
			kind: 'workspace',
			label: repositoryContext.workspaceFolders?.[0] ?? repositoryContext.workspaceRoot,
			resource: repositoryContext.workspaceRoot,
			confidence: 'medium',
		});
	}

	return candidates.filter((candidate, index, values) => values.findIndex(other => other.kind === candidate.kind && other.label === candidate.label) === index);
}

function formatPlanningTarget(target: IPlanningTarget | undefined): string {
	if (!target) {
		return 'Not provided';
	}

	return `${target.label} (${target.kind}${target.confidence ? `, ${target.confidence} confidence` : ''})`;
}
