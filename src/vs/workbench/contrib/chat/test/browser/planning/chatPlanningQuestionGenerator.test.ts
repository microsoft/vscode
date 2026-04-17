/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Event } from '../../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { generateDynamicPlanningQuestions } from '../../../browser/planning/chatPlanningQuestionGenerator.js';
import { ChatMessageRole, IChatMessage, ILanguageModelsService } from '../../../common/languageModels.js';

suite('ChatPlanningQuestionGenerator', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('normalizes generated planning questions and includes coding context in the prompt', async () => {
		let capturedMessages: IChatMessage[] | undefined;
		const service = {
			_serviceBrand: undefined,
			onDidChangeLanguageModelVendors: Event.None,
			onDidChangeLanguageModels: Event.None,
			updateModelPickerPreference: () => { },
			getLanguageModelIds: () => ['plan-model'],
			getVendors: () => [],
			lookupLanguageModel: () => ({ capabilities: { toolCalling: true } }),
			lookupLanguageModelByQualifiedName: () => undefined,
			getLanguageModelGroups: () => [],
			selectLanguageModels: async () => [],
			registerLanguageModelProvider: () => ({ dispose: () => { } }),
			deltaLanguageModelChatProviderDescriptors: () => { },
			sendChatRequest: async (_modelId: string, _from: unknown, messages: IChatMessage[]) => {
				capturedMessages = messages;
				return {
					stream: (async function* () {
						yield {
							type: 'text' as const,
							value: JSON.stringify({
								questions: [
									{
										title: 'Primary implementation goal',
										message: 'What should be true when this coding task is complete?',
										type: 'text',
										required: true
									},
									{
										title: 'Execution strategy',
										description: 'Choose the best starting point for the work.',
										type: 'singleSelect',
										options: [
											{ label: 'Audit existing code path', value: 'Audit existing code path' },
											{ label: 'Implement directly', value: 'Implement directly' }
										],
										defaultValue: 'Audit existing code path'
									},
									{
										title: 'Validation signals',
										message: 'Which outcomes should this plan make explicit before coding starts?',
										type: 'multiSelect',
										options: [
											{ label: 'Changed files', value: 'Changed files' },
											{ label: 'Validation path', value: 'Validation path' }
										]
									}
								]
							})
						};
					})(),
					result: Promise.resolve({})
				};
			},
			computeTokenLength: async () => 0,
			getModelConfiguration: () => undefined,
			setModelConfiguration: async () => { },
			getModelConfigurationActions: () => [],
			addLanguageModelsProviderGroup: async () => { },
			removeLanguageModelsProviderGroup: async () => { },
			configureLanguageModelsProviderGroup: async () => { },
		} as unknown as ILanguageModelsService;

		const questions = await generateDynamicPlanningQuestions(service, {
			userRequest: 'Add a planning scaffold before implementation starts',
			modelId: undefined,
			planningPhase: 'focused-slice',
			questionStage: 'goal-clarity',
			activeFilePath: 'file:///workspace/src/vs/workbench/contrib/chat/browser/widget/chatWidget.ts',
			selectedText: 'private async _acceptInput(...)',
			plannerNotes: 'Keep the changes inside the chat planning flow.',
			recentConversation: ['User: add richer planning context', 'Assistant: start with workspace symbols and snippets'],
			planningAnswers: [{ question: 'Implementation Goal', answer: 'Narrow toward the right insertion point.' }],
			repositoryContext: {
				scope: 'focused',
				workspaceRoot: 'file:///workspace',
				focusSummary: 'Focused slice around chat planning state.',
				focusQueries: ['planning', 'chatWidget'],
				activeDocumentSymbols: [{ name: '_acceptInput', kind: 'Method', file: 'file:///workspace/src/vs/workbench/contrib/chat/browser/widget/chatWidget.ts' }],
				workspaceSymbolMatches: [{ name: 'refinePlan', kind: 'Method', file: 'file:///workspace/src/vs/workbench/contrib/chat/browser/widget/chatWidget.ts' }],
				nearbyFiles: ['src/vs/workbench/contrib/chat/browser/actions/chatActions.ts'],
				relevantSnippets: [{
					path: 'src/vs/workbench/contrib/chat/browser/widget/chatWidget.ts',
					preview: 'private async _acceptInput(...)',
					detailLevel: 'focused',
					reason: 'Current implementation entry point.'
				}]
			}
		}, CancellationToken.None);

		assert.strictEqual(questions.length, 3);
		assert.strictEqual(questions[0].type, 'text');
		assert.strictEqual(questions[0].message, 'What should be true when this coding task is complete?');
		assert.strictEqual(questions[1].type, 'singleSelect');
		assert.strictEqual(questions[1].message, 'Choose the best starting point for the work.');
		assert.deepStrictEqual(questions[1].options, [
			{ id: 'Audit existing code path', label: 'Audit existing code path', value: 'Audit existing code path' },
			{ id: 'Implement directly', label: 'Implement directly', value: 'Implement directly' }
		]);
		assert.strictEqual(questions[1].defaultValue, 'Audit existing code path');
		assert.strictEqual(questions[2].type, 'multiSelect');
		assert.strictEqual(questions[2].title, 'Validation signals');

		assert.ok(capturedMessages, 'Expected a language-model request to be issued');
		assert.strictEqual(capturedMessages[0].role, ChatMessageRole.System);
		const promptPart = capturedMessages[1].content[0];
		assert.strictEqual(promptPart.type, 'text');
		if (promptPart.type !== 'text') {
			throw new Error('Expected prompt text part');
		}
		assert.ok(promptPart.value.includes('User request:\nAdd a planning scaffold before implementation starts'));
		assert.ok(promptPart.value.includes('Planning phase:\nfocused-slice (Focused Slice)'));
		assert.ok(promptPart.value.includes('Question stage:\ngoal-clarity'));
		assert.ok(promptPart.value.includes('Active file:\nfile:///workspace/src/vs/workbench/contrib/chat/browser/widget/chatWidget.ts'));
		assert.ok(promptPart.value.includes('Selected code or text:\nprivate async _acceptInput(...)'));
		assert.ok(promptPart.value.includes('Planner notes:\nKeep the changes inside the chat planning flow.'));
		assert.ok(promptPart.value.includes('Recent planning conversation:\n- User: add richer planning context'));
		assert.ok(promptPart.value.includes('Repository context:'));
	});

	test('falls back when no language model is available', async () => {
		const service = {
			_serviceBrand: undefined,
			onDidChangeLanguageModelVendors: Event.None,
			onDidChangeLanguageModels: Event.None,
			updateModelPickerPreference: () => { },
			getLanguageModelIds: () => [],
			getVendors: () => [],
			lookupLanguageModel: () => undefined,
			lookupLanguageModelByQualifiedName: () => undefined,
			getLanguageModelGroups: () => [],
			selectLanguageModels: async () => [],
			registerLanguageModelProvider: () => ({ dispose: () => { } }),
			deltaLanguageModelChatProviderDescriptors: () => { },
			sendChatRequest: async () => {
				throw new Error('should not be called');
			},
			computeTokenLength: async () => 0,
			getModelConfiguration: () => undefined,
			setModelConfiguration: async () => { },
			getModelConfigurationActions: () => [],
			addLanguageModelsProviderGroup: async () => { },
			removeLanguageModelsProviderGroup: async () => { },
			configureLanguageModelsProviderGroup: async () => { },
		} as unknown as ILanguageModelsService;

		const questions = await generateDynamicPlanningQuestions(service, {
			userRequest: 'Plan a change',
			modelId: undefined,
			planningPhase: 'broad-scan',
			questionStage: 'task-decomposition',
			recentConversation: [],
			planningAnswers: [],
		}, CancellationToken.None);

		assert.strictEqual(questions.length, 3);
		assert.strictEqual(questions[0].title, 'Task Breakdown');
		assert.strictEqual(questions[1].type, 'singleSelect');
	});

	test('falls back when the model returns invalid JSON', async () => {
		const service = {
			_serviceBrand: undefined,
			onDidChangeLanguageModelVendors: Event.None,
			onDidChangeLanguageModels: Event.None,
			updateModelPickerPreference: () => { },
			getLanguageModelIds: () => ['plan-model'],
			getVendors: () => [],
			lookupLanguageModel: () => ({ capabilities: { toolCalling: true } }),
			lookupLanguageModelByQualifiedName: () => undefined,
			getLanguageModelGroups: () => [],
			selectLanguageModels: async () => [],
			registerLanguageModelProvider: () => ({ dispose: () => { } }),
			deltaLanguageModelChatProviderDescriptors: () => { },
			sendChatRequest: async () => ({
				stream: (async function* () {
					yield { type: 'text' as const, value: 'not json' };
				})(),
				result: Promise.resolve({})
			}),
			computeTokenLength: async () => 0,
			getModelConfiguration: () => undefined,
			setModelConfiguration: async () => { },
			getModelConfigurationActions: () => [],
			addLanguageModelsProviderGroup: async () => { },
			removeLanguageModelsProviderGroup: async () => { },
			configureLanguageModelsProviderGroup: async () => { },
		} as unknown as ILanguageModelsService;

		const questions = await generateDynamicPlanningQuestions(service, {
			userRequest: 'Plan a change',
			modelId: undefined,
			planningPhase: 'detailed-inspection',
			questionStage: 'task-decomposition',
			recentConversation: [],
			planningAnswers: [],
		}, CancellationToken.None);

		assert.strictEqual(questions.length, 3);
		assert.strictEqual(questions[1].title, 'Edit Boundaries');
	});

	test('supplements model questions up to three per stage', async () => {
		const service = {
			_serviceBrand: undefined,
			onDidChangeLanguageModelVendors: Event.None,
			onDidChangeLanguageModels: Event.None,
			updateModelPickerPreference: () => { },
			getLanguageModelIds: () => ['plan-model'],
			getVendors: () => [],
			lookupLanguageModel: () => ({ capabilities: { toolCalling: true } }),
			lookupLanguageModelByQualifiedName: () => undefined,
			getLanguageModelGroups: () => [],
			selectLanguageModels: async () => [],
			registerLanguageModelProvider: () => ({ dispose: () => { } }),
			deltaLanguageModelChatProviderDescriptors: () => { },
			sendChatRequest: async () => ({
				stream: (async function* () {
					yield {
						type: 'text' as const,
						value: JSON.stringify({
							questions: [
								{
									title: 'Approved implementation target',
									message: 'What must this plan make concrete before coding starts?',
									type: 'text',
									required: true
								},
								{
									title: 'Primary work split',
									message: 'Which work split best matches the request?',
									type: 'singleSelect',
									options: [
										{ label: 'Touch one subsystem first', value: 'Touch one subsystem first' },
										{ label: 'Stage the work across layers', value: 'Stage the work across layers' }
									]
								}
							]
						})
					};
				})(),
				result: Promise.resolve({})
			}),
			computeTokenLength: async () => 0,
			getModelConfiguration: () => undefined,
			setModelConfiguration: async () => { },
			getModelConfigurationActions: () => [],
			addLanguageModelsProviderGroup: async () => { },
			removeLanguageModelsProviderGroup: async () => { },
			configureLanguageModelsProviderGroup: async () => { },
		} as unknown as ILanguageModelsService;

		const questions = await generateDynamicPlanningQuestions(service, {
			userRequest: 'Plan a scoped implementation change',
			modelId: undefined,
			planningPhase: 'focused-slice',
			questionStage: 'goal-clarity',
			recentConversation: [],
			planningAnswers: [],
		}, CancellationToken.None);

		assert.strictEqual(questions.length, 3);
		assert.ok(questions.some(question => question.title === 'Approved implementation target'));
		assert.ok(questions.some(question => question.title === 'Primary work split'));
	});
});
