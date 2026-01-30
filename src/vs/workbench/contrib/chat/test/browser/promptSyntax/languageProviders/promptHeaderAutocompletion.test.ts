/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { Position } from '../../../../../../../editor/common/core/position.js';
import { CompletionContext, CompletionTriggerKind } from '../../../../../../../editor/common/languages.js';
import { ContextKeyService } from '../../../../../../../platform/contextkey/browser/contextKeyService.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ExtensionIdentifier } from '../../../../../../../platform/extensions/common/extensions.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { LanguageModelToolsService } from '../../../../browser/tools/languageModelToolsService.js';
import { ChatAgentLocation, ChatConfiguration } from '../../../../common/constants.js';
import { ILanguageModelToolsService, IToolData, ToolDataSource } from '../../../../common/tools/languageModelToolsService.js';
import { ILanguageModelChatMetadata, ILanguageModelsService } from '../../../../common/languageModels.js';
import { IChatModeService } from '../../../../common/chatModes.js';
import { PromptHeaderAutocompletion } from '../../../../common/promptSyntax/languageProviders/promptHeaderAutocompletion.js';
import { ICustomAgent, IPromptsService, PromptsStorage } from '../../../../common/promptSyntax/service/promptsService.js';
import { createTextModel } from '../../../../../../../editor/test/common/testTextModel.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { PromptFileParser } from '../../../../common/promptSyntax/promptFileParser.js';
import { ITextModel } from '../../../../../../../editor/common/model.js';
import { getLanguageIdForPromptsType, PromptsType } from '../../../../common/promptSyntax/promptTypes.js';
import { getPromptFileExtension } from '../../../../common/promptSyntax/config/promptFileLocations.js';
import { Range } from '../../../../../../../editor/common/core/range.js';

suite('PromptHeaderAutocompletion', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let instaService: TestInstantiationService;
	let completionProvider: PromptHeaderAutocompletion;

	setup(async () => {
		const testConfigService = new TestConfigurationService();
		testConfigService.setUserConfiguration(ChatConfiguration.ExtensionToolsEnabled, true);
		instaService = workbenchInstantiationService({
			contextKeyService: () => disposables.add(new ContextKeyService(testConfigService)),
			configurationService: () => testConfigService
		}, disposables);

		const toolService = disposables.add(instaService.createInstance(LanguageModelToolsService));

		const testTool1 = { id: 'testTool1', displayName: 'tool1', canBeReferencedInPrompt: true, modelDescription: 'Test Tool 1', source: ToolDataSource.External, inputSchema: {} } satisfies IToolData;
		disposables.add(toolService.registerToolData(testTool1));

		const testTool2 = { id: 'testTool2', displayName: 'tool2', canBeReferencedInPrompt: true, toolReferenceName: 'tool2', modelDescription: 'Test Tool 2', source: ToolDataSource.External, inputSchema: {} } satisfies IToolData;
		disposables.add(toolService.registerToolData(testTool2));

		instaService.set(ILanguageModelToolsService, toolService);

		const testModels: ILanguageModelChatMetadata[] = [
			{ id: 'mae-4', name: 'MAE 4', vendor: 'olama', version: '1.0', family: 'mae', modelPickerCategory: undefined, extension: new ExtensionIdentifier('a.b'), isUserSelectable: true, maxInputTokens: 8192, maxOutputTokens: 1024, capabilities: { agentMode: true, toolCalling: true }, isDefaultForLocation: { [ChatAgentLocation.Chat]: true } } satisfies ILanguageModelChatMetadata,
			{ id: 'mae-4.1', name: 'MAE 4.1', vendor: 'copilot', version: '1.0', family: 'mae', modelPickerCategory: undefined, extension: new ExtensionIdentifier('a.b'), isUserSelectable: true, maxInputTokens: 8192, maxOutputTokens: 1024, capabilities: { agentMode: true, toolCalling: true }, isDefaultForLocation: { [ChatAgentLocation.Chat]: true } } satisfies ILanguageModelChatMetadata,
			{ id: 'gpt-4', name: 'GPT 4', vendor: 'openai', version: '1.0', family: 'gpt', modelPickerCategory: undefined, extension: new ExtensionIdentifier('a.b'), isUserSelectable: true, maxInputTokens: 8192, maxOutputTokens: 1024, capabilities: { agentMode: false, toolCalling: true }, isDefaultForLocation: { [ChatAgentLocation.Chat]: true } } satisfies ILanguageModelChatMetadata,
		];

		instaService.stub(ILanguageModelsService, {
			getLanguageModelIds() { return testModels.map(m => m.id); },
			lookupLanguageModel(name: string) {
				return testModels.find(m => m.id === name);
			}
		});

		const customAgent: ICustomAgent = {
			name: 'agent1',
			description: 'Agent file 1.',
			agentInstructions: {
				content: '',
				toolReferences: [],
				metadata: undefined
			},
			uri: URI.parse('myFs://.github/agents/agent1.agent.md'),
			source: { storage: PromptsStorage.local },
			visibility: { userInvokable: true, agentInvokable: true }
		};

		const parser = new PromptFileParser();
		instaService.stub(IPromptsService, {
			getParsedPromptFile(model: ITextModel) {
				return parser.parse(model.uri, model.getValue());
			},
			async getCustomAgents(token: CancellationToken) {
				return Promise.resolve([customAgent]);
			}
		});

		instaService.stub(IChatModeService, {
			getModes() {
				return { builtin: [], custom: [] };
			}
		});

		completionProvider = instaService.createInstance(PromptHeaderAutocompletion);
	});

	async function getCompletions(content: string, promptType: PromptsType) {
		const languageId = getLanguageIdForPromptsType(promptType);
		const uri = URI.parse('test:///test' + getPromptFileExtension(promptType));
		const model = disposables.add(createTextModel(content, languageId, undefined, uri));
		// get the completion location from  the '|' marker
		const lineColumnMarkerRange = model.findNextMatch('|', new Position(1, 1), false, false, '', false)?.range;
		assert.ok(lineColumnMarkerRange, 'No completion marker found in test content');
		model.applyEdits([{ range: lineColumnMarkerRange, text: '' }]);

		const position = lineColumnMarkerRange.getStartPosition();
		const context: CompletionContext = { triggerKind: CompletionTriggerKind.Invoke };
		const result = await completionProvider.provideCompletionItems(model, position, context, CancellationToken.None);
		if (!result || !result.suggestions) {
			return [];
		}
		const lineContent = model.getLineContent(position.lineNumber);
		return result.suggestions.map(s => {
			assert(s.range instanceof Range);
			return {
				label: typeof s.label === 'string' ? s.label : s.label.label,
				result: lineContent.substring(0, s.range.startColumn - 1) + s.insertText + lineContent.substring(s.range.endColumn - 1)
			};
		});
	}

	const sortByLabel = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label);

	suite('agent header completions', () => {
		test('complete model attribute name', async () => {
			const content = [
				'---',
				'description: "Test"',
				'|',
				'---',
			].join('\n');

			const actual = await getCompletions(content, PromptsType.agent);

			assert.deepStrictEqual(actual.sort(sortByLabel), [
				{ label: 'agents', result: 'agents: ${0:["*"]}' },
				{ label: 'argument-hint', result: 'argument-hint: $0' },
				{ label: 'disable-model-invocation', result: 'disable-model-invocation: ${0:true}' },
				{ label: 'handoffs', result: 'handoffs: $0' },
				{ label: 'model', result: 'model: ${0:MAE 4 (olama)}' },
				{ label: 'name', result: 'name: $0' },
				{ label: 'target', result: 'target: ${0:vscode}' },
				{ label: 'tools', result: 'tools: ${0:[]}' },
				{ label: 'user-invokable', result: 'user-invokable: ${0:true}' },
			].sort(sortByLabel));
		});

		test('complete model attribute value', async () => {
			const content = [
				'---',
				'description: "Test"',
				'model: |',
				'---',
			].join('\n');

			const actual = await getCompletions(content, PromptsType.agent);
			// GPT 4 is excluded because it has agentMode: false
			assert.deepStrictEqual(actual.sort(sortByLabel), [
				{ label: 'MAE 4 (olama)', result: 'model: MAE 4 (olama)' },
				{ label: 'MAE 4.1 (copilot)', result: 'model: MAE 4.1 (copilot)' },
			].sort(sortByLabel));
		});

		test('complete model attribute value with partial input', async () => {
			const content = [
				'---',
				'description: "Test"',
				'model: MA|',
				'---',
			].join('\n');

			const actual = await getCompletions(content, PromptsType.agent);
			// GPT 4 is excluded because it has agentMode: false
			assert.deepStrictEqual(actual, [
				{ label: 'MAE 4 (olama)', result: 'model: MAE 4 (olama)' },
				{ label: 'MAE 4.1 (copilot)', result: 'model: MAE 4.1 (copilot)' },
			]);
		});

		test('complete model names inside model array', async () => {
			const content = [
				'---',
				'description: "Test"',
				'model: [|]',
				'---',
			].join('\n');

			const actual = await getCompletions(content, PromptsType.agent);
			// GPT 4 is excluded because it has agentMode: false
			assert.deepStrictEqual(actual.sort(sortByLabel), [
				{ label: 'MAE 4 (olama)', result: `model: ['MAE 4 (olama)']` },
				{ label: 'MAE 4.1 (copilot)', result: `model: ['MAE 4.1 (copilot)']` },
			].sort(sortByLabel));
		});

		test('complete model names inside model array with existing entries', async () => {
			const content = [
				'---',
				'description: "Test"',
				`model: ['MAE 4 (olama)', |]`,
				'---',
			].join('\n');

			const actual = await getCompletions(content, PromptsType.agent);
			// GPT 4 is excluded because it has agentMode: false
			assert.deepStrictEqual(actual.sort(sortByLabel), [
				{ label: 'MAE 4 (olama)', result: `model: ['MAE 4 (olama)', 'MAE 4 (olama)']` },
				{ label: 'MAE 4.1 (copilot)', result: `model: ['MAE 4 (olama)', 'MAE 4.1 (copilot)']` },
			].sort(sortByLabel));
		});

		test('complete tool names inside tools array', async () => {
			const content = [
				'---',
				'description: "Test"',
				'tools: [|]',
				'---',
			].join('\n');

			const actual = await getCompletions(content, PromptsType.agent);
			assert.deepStrictEqual(actual.sort(sortByLabel), [
				{ label: 'agent', result: `tools: ['agent']` },
				{ label: 'execute', result: `tools: ['execute']` },
				{ label: 'read', result: `tools: ['read']` },
				{ label: 'tool1', result: `tools: ['tool1']` },
				{ label: 'tool2', result: `tools: ['tool2']` },
				{ label: 'vscode', result: `tools: ['vscode']` },
			].sort(sortByLabel));
		});

		test('complete tool names inside tools array with existing entries', async () => {
			const content = [
				'---',
				'description: "Test"',
				`tools: ['read', |]`,
				'---',
			].join('\n');

			const actual = await getCompletions(content, PromptsType.agent);
			assert.deepStrictEqual(actual.sort(sortByLabel), [
				{ label: 'agent', result: `tools: ['read', 'agent']` },
				{ label: 'execute', result: `tools: ['read', 'execute']` },
				{ label: 'read', result: `tools: ['read', 'read']` },
				{ label: 'tool1', result: `tools: ['read', 'tool1']` },
				{ label: 'tool2', result: `tools: ['read', 'tool2']` },
				{ label: 'vscode', result: `tools: ['read', 'vscode']` },
			].sort(sortByLabel));
		});

		test('complete tool names inside tools array with existing entries 2', async () => {
			const content = [
				'---',
				'description: "Test"',
				`tools: ['read', 'exe|cute']`,
				'---',
			].join('\n');

			const actual = await getCompletions(content, PromptsType.agent);
			assert.deepStrictEqual(actual.sort(sortByLabel), [
				{ label: 'agent', result: `tools: ['read', 'agent']` },
				{ label: 'execute', result: `tools: ['read', 'execute']` },
				{ label: 'read', result: `tools: ['read', 'read']` },
				{ label: 'tool1', result: `tools: ['read', 'tool1']` },
				{ label: 'tool2', result: `tools: ['read', 'tool2']` },
				{ label: 'vscode', result: `tools: ['read', 'vscode']` },
			].sort(sortByLabel));
		});

		test('complete agents inside agents array', async () => {
			const content = [
				'---',
				'description: "Test"',
				'agents: [|]',
				'---',
			].join('\n');

			const actual = await getCompletions(content, PromptsType.agent);
			assert.deepStrictEqual(actual.sort(sortByLabel), [
				{ label: 'agent1', result: `agents: ['agent1']` },
			].sort(sortByLabel));
		});

		test('complete infer attribute value', async () => {
			const content = [
				'---',
				'description: "Test"',
				'infer: |',
				'---',
			].join('\n');

			const actual = await getCompletions(content, PromptsType.agent);
			assert.deepStrictEqual(actual.sort(sortByLabel), [
				{ label: 'false', result: 'infer: false' },
				{ label: 'true', result: 'infer: true' },
			].sort(sortByLabel));
		});

		test('complete user-invokable attribute value', async () => {
			const content = [
				'---',
				'description: "Test"',
				'user-invokable: |',
				'---',
			].join('\n');

			const actual = await getCompletions(content, PromptsType.agent);
			assert.deepStrictEqual(actual.sort(sortByLabel), [
				{ label: 'false', result: 'user-invokable: false' },
				{ label: 'true', result: 'user-invokable: true' },
			].sort(sortByLabel));
		});

		test('complete disable-model-invocation attribute value', async () => {
			const content = [
				'---',
				'description: "Test"',
				'disable-model-invocation: |',
				'---',
			].join('\n');

			const actual = await getCompletions(content, PromptsType.agent);
			assert.deepStrictEqual(actual.sort(sortByLabel), [
				{ label: 'false', result: 'disable-model-invocation: false' },
				{ label: 'true', result: 'disable-model-invocation: true' },
			].sort(sortByLabel));
		});
	});

	suite('prompt header completions', () => {
		test('complete model attribute name', async () => {
			const content = [
				'---',
				'description: "Test"',
				'|',
				'---',
			].join('\n');

			const actual = await getCompletions(content, PromptsType.prompt);
			assert.deepStrictEqual(actual.sort(sortByLabel), [
				{ label: 'agent', result: 'agent: $0' },
				{ label: 'argument-hint', result: 'argument-hint: $0' },
				{ label: 'model', result: 'model: ${0:MAE 4 (olama)}' },
				{ label: 'name', result: 'name: $0' },
				{ label: 'tools', result: 'tools: ${0:[]}' },
			].sort(sortByLabel));
		});

		test('complete model attribute value in prompt', async () => {
			const content = [
				'---',
				'description: "Test"',
				'model: |',
				'---',
			].join('\n');

			const actual = await getCompletions(content, PromptsType.prompt);
			assert.deepStrictEqual(actual.sort(sortByLabel), [
				{ label: 'MAE 4 (olama)', result: 'model: MAE 4 (olama)' },
				{ label: 'MAE 4.1 (copilot)', result: 'model: MAE 4.1 (copilot)' },
				{ label: 'GPT 4 (openai)', result: 'model: GPT 4 (openai)' },
			].sort(sortByLabel));
		});
	});
});
