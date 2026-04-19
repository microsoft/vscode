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
			questionCount: 3,
			missingDimensions: ['constraints'],
			partialDimensions: ['repo-target'],
			activeFilePath: 'file:///workspace/src/vs/workbench/contrib/chat/browser/widget/chatWidget.ts',
			selectedText: 'private async _acceptInput(...)',
			plannerNotes: 'Keep the changes inside the chat planning flow.',
			recentConversation: ['User: add richer planning context', 'Assistant: start with workspace symbols and snippets'],
			planningAnswers: [{ question: 'Implementation Goal', answer: 'Narrow toward the right insertion point.' }],
			repositoryContext: {
				scope: 'focused',
				workspaceRoot: 'file:///workspace',
				planningTarget: { kind: 'file', label: 'src/vs/workbench/contrib/chat/browser/widget/chatWidget.ts', confidence: 'high' },
				requestIntent: 'script-work',
				taskLens: {
					taskKind: 'script-work',
					taskSummary: 'Refine the planning middleware around chatWidget.ts.',
					primaryArtifact: 'src/vs/workbench/contrib/chat/browser/widget/chatWidget.ts',
					secondaryArtifacts: ['src/vs/workbench/contrib/chat/browser/planning/chatPlanningQuestionGenerator.ts'],
					artifactType: 'file',
					desiredOutcome: 'Produce a tighter planning flow before the first plan runs.',
					deliverableType: 'code-change',
					riskAreas: ['Keep the changes inside the planning flow.'],
					unknowns: ['Validation path'],
					validationTargets: ['Planning tests'],
					planAreas: ['Question generation prompt', 'Planning context attachment'],
				},
				primaryArtifactHint: 'src/vs/workbench/contrib/chat/browser/widget/chatWidget.ts',
				relatedArtifactHints: ['src/vs/workbench/contrib/chat/browser/planning/chatPlanningQuestionGenerator.ts'],
				focusSummary: 'Focused slice around chat planning state.',
				focusQueries: ['planning', 'chatWidget'],
				workspaceFolders: ['vscode'],
				workspaceTopLevelEntries: ['src', 'extensions'],
				workingSetFiles: ['src/vs/workbench/contrib/chat/browser/widget/chatWidget.ts'],
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
		const goalQuestion = questions.find(question => question.message === 'What should be true when this coding task is complete?');
		const strategyQuestion = questions.find(question => question.message === 'Choose the best starting point for the work.');
		const validationQuestion = questions.find(question => question.title === 'Validation signals');
		assert.ok(goalQuestion);
		assert.ok(strategyQuestion);
		assert.ok(validationQuestion);
		assert.strictEqual(goalQuestion.type, 'text');
		assert.strictEqual(strategyQuestion.type, 'singleSelect');
		assert.deepStrictEqual(strategyQuestion.options, [
			{ id: 'Audit existing code path', label: 'Audit existing code path', value: 'Audit existing code path' },
			{ id: 'Implement directly', label: 'Implement directly', value: 'Implement directly' }
		]);
		assert.strictEqual(strategyQuestion.defaultValue, 'Audit existing code path');
		assert.strictEqual(validationQuestion.type, 'multiSelect');

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
		assert.ok(promptPart.value.includes('Requested question count:\n3'));
		assert.ok(promptPart.value.includes('Active file:\nfile:///workspace/src/vs/workbench/contrib/chat/browser/widget/chatWidget.ts'));
		assert.ok(promptPart.value.includes('Selected code or text:\nprivate async _acceptInput(...)'));
		assert.ok(promptPart.value.includes('Planner notes:\nKeep the changes inside the chat planning flow.'));
		assert.ok(promptPart.value.includes('Recent planning conversation:\n- User: add richer planning context'));
		assert.ok(promptPart.value.includes('Repository context:'));
		assert.ok(promptPart.value.includes('Planning target: src/vs/workbench/contrib/chat/browser/widget/chatWidget.ts (file, high confidence)'));
		assert.ok(promptPart.value.includes('Request intent: script-work'));
		assert.ok(promptPart.value.includes('Task lens:'));
		assert.ok(promptPart.value.includes('Desired outcome: Produce a tighter planning flow before the first plan runs.'));
		assert.ok(promptPart.value.includes('Primary artifact hint: src/vs/workbench/contrib/chat/browser/widget/chatWidget.ts'));
		assert.ok(promptPart.value.includes('Missing planning dimensions:\nconstraints'));
	});

	test('ranks task-lens-aligned questions ahead of generic repo questions', async () => {
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
								{ title: 'Repository choice', message: 'Which repository should I use for this task?', type: 'text' },
								{ title: 'Primary analysis target', message: 'Which file or directory around orders.csv should anchor the analysis?', type: 'text' },
								{
									title: 'Validation path',
									message: 'How should the plan validate the analysis against schema.json?',
									type: 'singleSelect',
									options: [
										{ label: 'Schema checks first', value: 'Schema checks first' },
										{ label: 'Manual review first', value: 'Manual review first' }
									]
								},
								{
									title: 'Output shape',
									message: 'What output should the plan optimize for?',
									type: 'singleSelect',
									options: [
										{ label: 'Plain-text summary', value: 'Plain-text summary' },
										{ label: 'Structured report', value: 'Structured report' }
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
			userRequest: 'Plan how to analyze orders.csv with schema.json in this repo.',
			modelId: undefined,
			planningPhase: 'broad-scan',
			questionStage: 'goal-clarity',
			questionCount: 3,
			recentConversation: [],
			planningAnswers: [],
			repositoryContext: {
				scope: 'focused',
				workspaceRoot: 'file:///workspace',
				planningTarget: { kind: 'file', label: 'data/orders.csv', confidence: 'high' },
				requestIntent: 'data-analysis',
				taskLens: {
					taskKind: 'data-analysis',
					taskSummary: 'Analyze orders.csv against schema.json.',
					primaryArtifact: 'data/orders.csv',
					secondaryArtifacts: ['data/schema.json'],
					artifactType: 'dataset',
					desiredOutcome: 'Produce a useful analysis for data/orders.csv.',
					deliverableType: 'analysis',
					validationTargets: ['Schema checks', 'Analysis output'],
					unknowns: ['Desired output'],
					planAreas: ['Analysis target', 'Validation path'],
				},
				primaryArtifactHint: 'data/orders.csv',
				relatedArtifactHints: ['data/schema.json'],
				focusQueries: ['orders.csv', 'schema.json'],
				workspaceFolders: ['workspace'],
				workingSetFiles: ['data/orders.csv', 'data/schema.json'],
				activeDocumentSymbols: [],
				workspaceSymbolMatches: [],
				nearbyFiles: ['data/schema.json'],
				relevantSnippets: [],
			}
		}, CancellationToken.None);

		assert.strictEqual(questions.length, 3);
		assert.ok(questions.every(question => !/repository/i.test(question.title)));
		assert.ok(questions.some(question => /orders\.csv/i.test(typeof question.message === 'string' ? question.message : '')));
		assert.ok(questions.some(question => /schema\.json/i.test(typeof question.message === 'string' ? question.message : '')));
	});

	test('does not inject a static planning-target confirmation question', async () => {
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
									{ title: 'Desired outcome', message: 'What should the user notice first?', type: 'text' },
									{
										title: 'Scope boundary',
										message: 'Which boundary matters most?',
										type: 'singleSelect',
										options: [
											{ label: 'Keep changes in chat planning', value: 'Keep changes in chat planning' },
											{ label: 'Allow follow-up UI work', value: 'Allow follow-up UI work' }
										]
									},
									{ title: 'Definition of done', message: 'What must be settled before the planner runs?', type: 'text' }
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
			userRequest: 'Refine planning mode around the right repo target.',
			modelId: undefined,
			planningPhase: 'broad-scan',
			questionStage: 'goal-clarity',
			questionCount: 3,
			shouldConfirmPlanningTarget: true,
			recentConversation: [],
			planningAnswers: [],
			repositoryContext: {
				scope: 'broad',
				workspaceRoot: 'file:///workspace',
				planningTarget: { kind: 'workspace', label: 'vscode', confidence: 'low' },
				focusQueries: ['planning'],
				workspaceFolders: ['vscode'],
				workspaceTopLevelEntries: ['src', 'extensions'],
				workingSetFiles: ['src/vs/workbench/contrib/chat/browser/widget/chatWidget.ts'],
				activeDocumentSymbols: [],
				workspaceSymbolMatches: [],
				nearbyFiles: [],
				relevantSnippets: [],
			}
		}, CancellationToken.None);

		assert.strictEqual(questions.length, 3);
		assert.ok(questions.every(question => question.id !== 'planning-target-confirmation'));
		assert.ok(capturedMessages, 'Expected a language-model request to be issued');
		const promptPart = capturedMessages[1].content[0];
		if (promptPart.type !== 'text') {
			throw new Error('Expected prompt text part');
		}
		assert.ok(promptPart.value.includes('Requested question count:\n3'));
	});

	test('throws when no language model is available', async () => {
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

		await assert.rejects(() => generateDynamicPlanningQuestions(service, {
			userRequest: 'Plan a change',
			modelId: undefined,
			planningPhase: 'broad-scan',
			questionStage: 'task-decomposition',
			recentConversation: [],
			planningAnswers: [],
		}, CancellationToken.None), /No language model is available/);
	});

	test('throws when the model returns invalid JSON', async () => {
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

		await assert.rejects(() => generateDynamicPlanningQuestions(service, {
			userRequest: 'Plan a change',
			modelId: undefined,
			planningPhase: 'detailed-inspection',
			questionStage: 'task-decomposition',
			recentConversation: [],
			planningAnswers: [],
		}, CancellationToken.None), /Planning question generation failed|did not return enough usable planning questions/);
	});

	test('throws when the model returns too few usable questions', async () => {
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

		await assert.rejects(() => generateDynamicPlanningQuestions(service, {
			userRequest: 'Plan a scoped implementation change',
			modelId: undefined,
			planningPhase: 'focused-slice',
			questionStage: 'goal-clarity',
			recentConversation: [],
			planningAnswers: [],
		}, CancellationToken.None), /did not return enough usable planning questions/);
	});

	test('uses the current plan and focus hint to request multiple plan-focus questions', async () => {
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
										title: 'Focused Repo Slice',
										message: 'Which file, folder, or subsystem should this zoom-in stay anchored on?',
										type: 'singleSelect',
										options: [
											{ label: 'Current working set', value: 'Current working set' },
											{ label: 'One specific file', value: 'One specific file' }
										],
										allowFreeformInput: true
									},
									{
										title: 'Unresolved Decision',
										message: 'What decision in this plan area still needs sharper guidance?',
										type: 'text',
										required: true
									},
									{
										title: 'Evidence To Add',
										message: 'Which evidence should the focused rebuild make explicit?',
										type: 'singleSelect',
										options: [
											{ label: 'Execution order', value: 'Execution order' },
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
			userRequest: 'Refine the planning middleware around CSV analysis.',
			modelId: undefined,
			planningPhase: 'detailed-inspection',
			questionStage: 'plan-focus',
			questionCount: 3,
			recentConversation: ['Assistant: The revised plan already covers the main flow.'],
			planningAnswers: [{ question: 'Related files', answer: 'Pay attention to orders.csv and schema.json.' }],
			currentPlan: [
				'1. Inspect orders.csv and nearby parsing utilities.',
				'2. Identify where schema.json informs validation.',
				'3. Rebuild the plan around the data flow and validation path.'
			].join('\n'),
			focusHint: 'Focus especially on the validation path around orders.csv and schema.json.',
			repositoryContext: {
				scope: 'detailed',
				workspaceRoot: 'file:///workspace',
				planningTarget: { kind: 'file', label: 'data/orders.csv', confidence: 'high' },
				focusSummary: 'Plan focus around orders.csv validation.',
				focusQueries: ['orders.csv', 'schema.json', 'validation path'],
				workspaceFolders: ['workspace'],
				workspaceTopLevelEntries: ['data', 'src'],
				workingSetFiles: ['data/orders.csv', 'data/schema.json'],
				activeDocumentSymbols: [],
				workspaceSymbolMatches: [],
				nearbyFiles: ['data/schema.json'],
				relevantSnippets: []
			}
		}, CancellationToken.None);

		assert.strictEqual(questions.length, 3);
		assert.ok(capturedMessages, 'Expected a language-model request to be issued');
		const promptPart = capturedMessages[1].content[0];
		if (promptPart.type !== 'text') {
			throw new Error('Expected prompt text part');
		}
		assert.ok(promptPart.value.includes('Question stage:\nplan-focus'));
		assert.ok(promptPart.value.includes('Requested question count:\n3'));
		assert.ok(promptPart.value.includes('Current plan:\n1. Inspect orders.csv and nearby parsing utilities.'));
		assert.ok(promptPart.value.includes('Focus hint:\nFocus especially on the validation path around orders.csv and schema.json.'));
	});

	test('treats requested artifact hints as unresolved and prefers an artifact-targeting first question', async () => {
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
									{ title: 'Repository choice', message: 'Which repository should I use for this analysis?', type: 'text' },
									{ title: 'CSV target', message: 'Which CSV file or directory should anchor the analysis?', type: 'text' },
									{
										title: 'Related inputs',
										message: 'Which related files should stay in view while planning the analysis?',
										type: 'singleSelect',
										options: [
											{ label: 'schema.json', value: 'schema.json' },
											{ label: 'No related file', value: 'No related file' }
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
			userRequest: 'Plan how to analyze a csv file in this repo.',
			modelId: undefined,
			planningPhase: 'broad-scan',
			questionStage: 'goal-clarity',
			questionCount: 2,
			recentConversation: [],
			planningAnswers: [],
			repositoryContext: {
				scope: 'focused',
				workspaceRoot: 'file:///workspace',
				planningTarget: { kind: 'workspace', label: 'workspace', confidence: 'low' },
				requestIntent: 'data-analysis',
				taskLens: {
					taskKind: 'data-analysis',
					artifactType: 'dataset',
					desiredOutcome: 'Plan how to analyze a csv file in this repo.',
					unknowns: ['Exact file, folder, or subsystem'],
				},
				primaryArtifactHint: 'Requested CSV file',
				relatedArtifactHints: ['data/schema.json'],
				focusQueries: ['csv', 'schema.json'],
				workspaceFolders: ['workspace'],
				workspaceTopLevelEntries: ['data', 'src'],
				workingSetFiles: ['data/schema.json'],
				activeDocumentSymbols: [],
				workspaceSymbolMatches: [],
				nearbyFiles: ['data/schema.json'],
				relevantSnippets: [],
			}
		}, CancellationToken.None);

		assert.strictEqual(questions.length, 2);
		assert.strictEqual(questions[0].message, 'Which CSV file or directory should anchor the analysis?');
		assert.ok(capturedMessages, 'Expected a language-model request to be issued');
		const promptPart = capturedMessages[1].content[0];
		if (promptPart.type !== 'text') {
			throw new Error('Expected prompt text part');
		}
		assert.ok(promptPart.value.includes('Artifact targeting:\nThe request points at Requested CSV file'));
	});

	test('skips session-targeted models when choosing a fallback model', async () => {
		let capturedModelId: string | undefined;
		const service = {
			_serviceBrand: undefined,
			onDidChangeLanguageModelVendors: Event.None,
			onDidChangeLanguageModels: Event.None,
			updateModelPickerPreference: () => { },
			getLanguageModelIds: () => ['session-model', 'plan-model'],
			getVendors: () => [],
			lookupLanguageModel: (modelId: string) => modelId === 'session-model'
				? { capabilities: { toolCalling: true }, targetChatSessionType: 'agent-host' }
				: { capabilities: { toolCalling: true } },
			lookupLanguageModelByQualifiedName: () => undefined,
			getLanguageModelGroups: () => [],
			selectLanguageModels: async () => [],
			registerLanguageModelProvider: () => ({ dispose: () => { } }),
			deltaLanguageModelChatProviderDescriptors: () => { },
			sendChatRequest: async (modelId: string) => {
				capturedModelId = modelId;
				return {
					stream: (async function* () {
						yield {
							type: 'text' as const,
							value: JSON.stringify({
								questions: [
									{ title: 'Goal', message: 'What should happen?', type: 'text' },
									{
										title: 'Constraint',
										message: 'What should the planner optimize for?',
										type: 'singleSelect',
										options: [
											{ label: 'Minimal surface area', value: 'Minimal surface area' },
											{ label: 'Fastest path', value: 'Fastest path' }
										]
									},
									{ title: 'Definition of done', message: 'What must be clarified?', type: 'text' }
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

		await generateDynamicPlanningQuestions(service, {
			userRequest: 'Plan a change',
			modelId: undefined,
			planningPhase: 'broad-scan',
			questionStage: 'goal-clarity',
			recentConversation: [],
			planningAnswers: [],
		}, CancellationToken.None);

		assert.strictEqual(capturedModelId, 'plan-model');
	});
});
