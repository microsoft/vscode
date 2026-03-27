/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize } from '../../../../../nls.js';
import { IChatQuestion } from '../../common/chatService/chatService.js';
import { getTextResponseFromStream, ChatMessageRole, IChatMessage, ILanguageModelsService } from '../../common/languageModels.js';

export interface IPlanningQuestionGenerationContext {
	readonly userRequest: string;
	readonly modelId: string | undefined;
	readonly activeFilePath?: string;
	readonly selectedText?: string;
	readonly workspaceFolders?: readonly string[];
	readonly openEditorFilePaths?: readonly string[];
	readonly activeFolderFilePaths?: readonly string[];
	readonly workspaceCandidateFilePaths?: readonly string[];
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
	const modelId = context.modelId ?? pickFallbackModelId(languageModelsService);
	if (!modelId) {
		return createFallbackPlanningQuestions();
	}

	const prompt = buildPlanningQuestionPrompt(context);
	const messages: IChatMessage[] = [
		{
			role: ChatMessageRole.System,
			content: [{
				type: 'text',
				value: [
					'You generate dynamic planning questions for coding work in VS Code.',
					'Focus only on goal clarity, constraints, and task decomposition.',
					'Ask at most 4 questions.',
					'Use text questions for open-ended clarification.',
					'Use singleSelect or multiSelect only when a constrained choice genuinely helps.',
					'Prefer questions that change implementation sequencing, scope, or success criteria.',
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
		const response = await languageModelsService.sendChatRequest(modelId, undefined, messages, {}, token);
		const responseText = await getTextResponseFromStream(response);
		const parsed = parseQuestionEnvelope(responseText);
		const normalized = normalizeGeneratedQuestions(parsed);
		return normalized.length > 0 ? normalized : createFallbackPlanningQuestions();
	} catch {
		return createFallbackPlanningQuestions();
	}
}

function pickFallbackModelId(languageModelsService: ILanguageModelsService): string | undefined {
	for (const modelId of languageModelsService.getLanguageModelIds()) {
		const metadata = languageModelsService.lookupLanguageModel(modelId);
		if (metadata?.capabilities?.toolCalling) {
			return modelId;
		}
	}

	return languageModelsService.getLanguageModelIds()[0];
}

function buildPlanningQuestionPrompt(context: IPlanningQuestionGenerationContext): string {
	const sections = [
		`User request:\n${context.userRequest.trim()}`
	];

	if (context.activeFilePath) {
		sections.push(`Active file:\n${context.activeFilePath}`);
	}

	if (context.selectedText) {
		sections.push(`Selected code or text:\n${truncate(context.selectedText.trim(), 1200)}`);
	}

	if (context.workspaceFolders?.length) {
		sections.push(`Workspace folders:\n${context.workspaceFolders.join('\n')}`);
	}

	if (context.openEditorFilePaths?.length) {
		sections.push(`Open editor files:\n${context.openEditorFilePaths.join('\n')}`);
	}

	if (context.activeFolderFilePaths?.length) {
		sections.push(`Files near the active file:\n${context.activeFolderFilePaths.join('\n')}`);
	}

	if (context.workspaceCandidateFilePaths?.length) {
		sections.push(`Workspace files likely related to the request:\n${context.workspaceCandidateFilePaths.join('\n')}`);
	}

	sections.push([
		'Return 3 to 4 questions that help clarify the implementation goal and break the work into concrete coding steps.',
		'Avoid generic project-management questions.',
		'Use the workspace context to ask about likely insertion points, affected files, and implementation order when that would sharpen the plan.',
		'When helpful, include decomposition-oriented options such as auditing existing code, choosing an insertion point, sequencing implementation, and validating behavior.',
		'For singleSelect and multiSelect questions, defaultValue must reference the option label.'
	].join(' '));

	sections.push([
		'JSON schema:',
		'{"questions":[{"title":"...","message":"...","type":"text|singleSelect|multiSelect","required":true|false,"allowFreeformInput":true|false,"options":[{"label":"...","value":"..."}],"defaultValue":"..."|["..."]}]}'
	].join('\n'));

	return sections.join('\n\n');
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

function normalizeGeneratedQuestions(parsed: IGeneratedPlanningQuestionEnvelope | undefined): IChatQuestion[] {
	const questions = parsed?.questions;
	if (!questions?.length) {
		return [];
	}

	return questions
		.slice(0, 4)
		.map(normalizeGeneratedQuestion)
		.filter((question): question is IChatQuestion => !!question);
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

function createFallbackPlanningQuestions(): IChatQuestion[] {
	return [
		{
			id: generateUuid(),
			type: 'text',
			title: localize('chat.planQuestions.goalTitle', 'Implementation Goal'),
			message: localize('chat.planQuestions.goalMessage', 'What should the implementation achieve when this planning step is complete?'),
			required: true
		},
		{
			id: generateUuid(),
			type: 'text',
			title: localize('chat.planQuestions.constraintsTitle', 'Constraints and Non-Goals'),
			message: localize('chat.planQuestions.constraintsMessage', 'Which constraints, edge cases, or explicit non-goals should shape the implementation?'),
			required: false
		},
		{
			id: generateUuid(),
			type: 'multiSelect',
			title: localize('chat.planQuestions.breakdownTitle', 'Task Breakdown'),
			message: localize('chat.planQuestions.breakdownMessage', 'Which steps should the implementation cover?'),
			options: [
				{ id: 'audit-existing-code', label: localize('chat.planQuestions.audit', 'Audit existing code path'), value: 'Audit existing code path' },
				{ id: 'pick-insertion-point', label: localize('chat.planQuestions.insertion', 'Choose insertion point'), value: 'Choose insertion point' },
				{ id: 'implement-core-change', label: localize('chat.planQuestions.implement', 'Implement core change'), value: 'Implement core change' },
				{ id: 'validate-behavior', label: localize('chat.planQuestions.validate', 'Validate behavior and regressions'), value: 'Validate behavior and regressions' }
			],
			allowFreeformInput: true,
			required: false
		}
	];
}
