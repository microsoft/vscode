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
			handOffs: [{ agent: 'Edit', label: 'Do it', prompt: 'Do it now' }],
			agentInstructions: {
				content: '',
				toolReferences: [],
				metadata: undefined
			},
			model: undefined,
			argumentHint: undefined,
			tools: undefined,
			target: undefined,
			infer: undefined,
			agents: undefined,
			uri: URI.parse('myFs://.github/agents/agent1.agent.md'),
			source: { storage: PromptsStorage.local }
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

		completionProvider = instaService.createInstance(PromptHeaderAutocompletion);
	});

	async function getCompletions(content: string, line: number, column: number, promptType: PromptsType) {
		const languageId = getLanguageIdForPromptsType(promptType);
		const uri = URI.parse('test:///test' + getPromptFileExtension(promptType));
		const model = disposables.add(createTextModel(content, languageId, undefined, uri));
		const position = new Position(line, column);
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

	suite('agent header completions', () => {
		test('complete model attribute name', async () => {
			const content = [
				'---',
				'description: "Test"',
				'',
				'---',
			].join('\n');

			const actual = await getCompletions(content, 3, 1, PromptsType.agent);
			const modelCompletion = actual.find(c => c.label === 'model');
			assert.ok(modelCompletion, 'model attribute should be in completions');
			assert.ok(modelCompletion.result.includes('model:'), 'should contain model attribute');
		});

		test('complete model attribute value', async () => {
			const content = [
				'---',
				'description: "Test"',
				'model: ',
				'---',
			].join('\n');

			const actual = await getCompletions(content, 3, 8, PromptsType.agent);

			// Should include models suitable for agent mode
			const mae4Completion = actual.find(c => c.label === 'MAE 4 (olama)');
			assert.ok(mae4Completion, 'MAE 4 model should be in completions');

			const mae41Completion = actual.find(c => c.label === 'MAE 4.1 (copilot)');
			assert.ok(mae41Completion, 'MAE 4.1 model should be in completions');

			// Should NOT include models not suitable for agent mode
			const gpt4Completion = actual.find(c => c.label === 'GPT 4 (openai)');
			assert.strictEqual(gpt4Completion, undefined, 'GPT 4 should not be in completions (not suitable for agent mode)');
		});

		test('complete model attribute value with partial input', async () => {
			const content = [
				'---',
				'description: "Test"',
				'model: MA',
				'---',
			].join('\n');

			const actual = await getCompletions(content, 3, 10, PromptsType.agent);

			// Should still provide completions after colon
			assert.ok(actual.length > 0, 'should have completions');
			const mae4Completion = actual.find(c => c.label === 'MAE 4 (olama)');
			assert.ok(mae4Completion, 'MAE 4 model should be in completions');
		});
	});

	suite('prompt header completions', () => {
		test('complete model attribute name', async () => {
			const content = [
				'---',
				'description: "Test"',
				'',
				'---',
			].join('\n');

			const actual = await getCompletions(content, 3, 1, PromptsType.prompt);
			const modelCompletion = actual.find(c => c.label === 'model');
			assert.ok(modelCompletion, 'model attribute should be in completions');
			assert.ok(modelCompletion.result.includes('model:'), 'should contain model attribute');
		});

		test('complete model attribute value in prompt', async () => {
			const content = [
				'---',
				'description: "Test"',
				'model: ',
				'---',
			].join('\n');

			const actual = await getCompletions(content, 3, 8, PromptsType.prompt);

			// For prompts, all user-selectable models should be available
			const mae4Completion = actual.find(c => c.label === 'MAE 4 (olama)');
			assert.ok(mae4Completion, 'MAE 4 model should be in completions');

			const gpt4Completion = actual.find(c => c.label === 'GPT 4 (openai)');
			assert.ok(gpt4Completion, 'GPT 4 should be in completions for prompts');
		});
	});
});
