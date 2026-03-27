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
			activeFilePath: 'file:///workspace/src/vs/workbench/contrib/chat/browser/widget/chatWidget.ts',
			selectedText: 'private async _acceptInput(...)',
			workspaceFolders: [
				'file:///workspace',
				'file:///workspace/extensions'
			],
			openEditorFilePaths: [
				'file:///workspace/src/vs/workbench/contrib/chat/browser/widget/chatWidget.ts',
				'file:///workspace/src/vs/workbench/contrib/chat/browser/actions/chatActions.ts'
			],
			activeFolderFilePaths: [
				'file:///workspace/src/vs/workbench/contrib/chat/browser/widget/chatListRenderer.ts',
				'file:///workspace/src/vs/workbench/contrib/chat/browser/widget/input/chatInputPart.ts'
			],
			workspaceCandidateFilePaths: [
				'file:///workspace/src/vs/workbench/contrib/chat/browser/planning/chatPlanningQuestionGenerator.ts',
				'file:///workspace/src/vs/workbench/contrib/chat/common/planning/chatPlanningTransition.ts'
			]
		}, CancellationToken.None);

		assert.strictEqual(questions.length, 2);
		assert.strictEqual(questions[0].type, 'text');
		assert.strictEqual(questions[0].message, 'What should be true when this coding task is complete?');
		assert.strictEqual(questions[1].type, 'singleSelect');
		assert.strictEqual(questions[1].message, 'Choose the best starting point for the work.');
		assert.deepStrictEqual(questions[1].options, [
			{ id: 'Audit existing code path', label: 'Audit existing code path', value: 'Audit existing code path' },
			{ id: 'Implement directly', label: 'Implement directly', value: 'Implement directly' }
		]);
		assert.strictEqual(questions[1].defaultValue, 'Audit existing code path');

		assert.ok(capturedMessages, 'Expected a language-model request to be issued');
		assert.strictEqual(capturedMessages[0].role, ChatMessageRole.System);
		const promptPart = capturedMessages[1].content[0];
		assert.strictEqual(promptPart.type, 'text');
		if (promptPart.type !== 'text') {
			throw new Error('Expected prompt text part');
		}
		assert.ok(promptPart.value.includes('User request:\nAdd a planning scaffold before implementation starts'));
		assert.ok(promptPart.value.includes('Active file:\nfile:///workspace/src/vs/workbench/contrib/chat/browser/widget/chatWidget.ts'));
		assert.ok(promptPart.value.includes('Selected code or text:\nprivate async _acceptInput(...)'));
		assert.ok(promptPart.value.includes('Workspace folders:\nfile:///workspace\nfile:///workspace/extensions'));
		assert.ok(promptPart.value.includes('Open editor files:\nfile:///workspace/src/vs/workbench/contrib/chat/browser/widget/chatWidget.ts\nfile:///workspace/src/vs/workbench/contrib/chat/browser/actions/chatActions.ts'));
		assert.ok(promptPart.value.includes('Files near the active file:\nfile:///workspace/src/vs/workbench/contrib/chat/browser/widget/chatListRenderer.ts\nfile:///workspace/src/vs/workbench/contrib/chat/browser/widget/input/chatInputPart.ts'));
		assert.ok(promptPart.value.includes('Workspace files likely related to the request:\nfile:///workspace/src/vs/workbench/contrib/chat/browser/planning/chatPlanningQuestionGenerator.ts\nfile:///workspace/src/vs/workbench/contrib/chat/common/planning/chatPlanningTransition.ts'));
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
		}, CancellationToken.None);

		assert.strictEqual(questions.length, 3);
		assert.strictEqual(questions[0].title, 'Implementation Goal');
		assert.strictEqual(questions[2].type, 'multiSelect');
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
		}, CancellationToken.None);

		assert.strictEqual(questions.length, 3);
		assert.strictEqual(questions[1].title, 'Constraints and Non-Goals');
	});
});
