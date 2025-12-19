/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { Position } from '../../../../../../editor/common/core/position.js';
import { ContextKeyService } from '../../../../../../platform/contextkey/browser/contextKeyService.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ExtensionIdentifier } from '../../../../../../platform/extensions/common/extensions.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { LanguageModelToolsService } from '../../../browser/languageModelToolsService.js';
import { ChatMode, CustomChatMode, IChatModeService } from '../../../common/chatModes.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { ILanguageModelToolsService, IToolData, ToolDataSource } from '../../../common/languageModelToolsService.js';
import { ILanguageModelChatMetadata, ILanguageModelsService } from '../../../common/languageModels.js';
import { PromptHoverProvider } from '../../../common/promptSyntax/languageProviders/promptHovers.js';
import { IPromptsService, PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { MockChatModeService } from '../../common/mockChatModeService.js';
import { createTextModel } from '../../../../../../editor/test/common/testTextModel.js';
import { URI } from '../../../../../../base/common/uri.js';
import { PromptFileParser } from '../../../common/promptSyntax/promptFileParser.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { getLanguageIdForPromptsType, PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { getPromptFileExtension } from '../../../common/promptSyntax/config/promptFileLocations.js';

suite('PromptHoverProvider', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let instaService: TestInstantiationService;
	let hoverProvider: PromptHoverProvider;

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
			{ id: 'mae-4', name: 'MAE 4', vendor: 'olama', version: '1.0', family: 'mae', modelPickerCategory: undefined, extension: new ExtensionIdentifier('a.b'), isUserSelectable: true, maxInputTokens: 8192, maxOutputTokens: 1024, capabilities: { agentMode: true, toolCalling: true } } satisfies ILanguageModelChatMetadata,
			{ id: 'mae-4.1', name: 'MAE 4.1', vendor: 'copilot', version: '1.0', family: 'mae', modelPickerCategory: undefined, extension: new ExtensionIdentifier('a.b'), isUserSelectable: true, maxInputTokens: 8192, maxOutputTokens: 1024, capabilities: { agentMode: true, toolCalling: true } } satisfies ILanguageModelChatMetadata,
		];

		instaService.stub(ILanguageModelsService, {
			getLanguageModelIds() { return testModels.map(m => m.id); },
			lookupLanguageModel(name: string) {
				return testModels.find(m => m.id === name);
			}
		});

		const customChatMode = new CustomChatMode({
			uri: URI.parse('myFs://test/test/chatmode.md'),
			name: 'BeastMode',
			agentInstructions: { content: 'Beast mode instructions', toolReferences: [] },
			source: { storage: PromptsStorage.local }
		});
		instaService.stub(IChatModeService, new MockChatModeService({ builtin: [ChatMode.Agent, ChatMode.Ask, ChatMode.Edit], custom: [customChatMode] }));

		const parser = new PromptFileParser();
		instaService.stub(IPromptsService, {
			getParsedPromptFile(model: ITextModel) {
				return parser.parse(model.uri, model.getValue());
			}
		});

		hoverProvider = instaService.createInstance(PromptHoverProvider);
	});

	async function getHover(content: string, line: number, column: number, promptType: PromptsType): Promise<string | undefined> {
		const languageId = getLanguageIdForPromptsType(promptType);
		const uri = URI.parse('test:///test' + getPromptFileExtension(promptType));
		const model = disposables.add(createTextModel(content, languageId, undefined, uri));
		const position = new Position(line, column);
		const hover = await hoverProvider.provideHover(model, position, CancellationToken.None);
		if (!hover || hover.contents.length === 0) {
			return undefined;
		}
		// Return the markdown value from the first content
		const firstContent = hover.contents[0];
		if (firstContent instanceof MarkdownString) {
			return firstContent.value;
		}
		return undefined;
	}

	suite('agent hovers', () => {
		test('hover on target attribute shows description', async () => {
			const content = [
				'---',
				'description: "Test"',
				'target: vscode',
				'---',
			].join('\n');
			const hover = await getHover(content, 3, 1, PromptsType.agent);
			assert.strictEqual(hover, 'The target to which the header attributes like tools apply to. Possible values are `github-copilot` and `vscode`.');
		});

		test('hover on model attribute with github-copilot target shows note', async () => {
			const content = [
				'---',
				'description: "Test"',
				'target: github-copilot',
				'model: MAE 4',
				'---',
			].join('\n');
			const hover = await getHover(content, 4, 1, PromptsType.agent);
			const expected = [
				'Specify the model that runs this custom agent.',
				'',
				'Note: This attribute is not used when target is github-copilot.'
			].join('\n');
			assert.strictEqual(hover, expected);
		});

		test('hover on model attribute with vscode target shows model info', async () => {
			const content = [
				'---',
				'description: "Test"',
				'target: vscode',
				'model: MAE 4 (olama)',
				'---',
			].join('\n');
			const hover = await getHover(content, 4, 1, PromptsType.agent);
			const expected = [
				'Specify the model that runs this custom agent.',
				'',
				'- Name: MAE 4',
				'- Family: mae',
				'- Vendor: olama'
			].join('\n');
			assert.strictEqual(hover, expected);
		});

		test('hover on handoffs attribute with github-copilot target shows note', async () => {
			const content = [
				'---',
				'description: "Test"',
				'target: github-copilot',
				'handoffs:',
				'  - label: Test',
				'    agent: Default',
				'    prompt: Test',
				'---',
			].join('\n');
			const hover = await getHover(content, 4, 1, PromptsType.agent);
			const expected = [
				'Possible handoff actions when the agent has completed its task.',
				'',
				'Note: This attribute is not used when target is github-copilot.'
			].join('\n');
			assert.strictEqual(hover, expected);
		});

		test('hover on handoffs attribute with vscode target shows description', async () => {
			const content = [
				'---',
				'description: "Test"',
				'target: vscode',
				'handoffs:',
				'  - label: Test',
				'    agent: Default',
				'    prompt: Test',
				'---',
			].join('\n');
			const hover = await getHover(content, 4, 1, PromptsType.agent);
			assert.strictEqual(hover, 'Possible handoff actions when the agent has completed its task.');
		});

		test('hover on github-copilot tool shows simple description', async () => {
			const content = [
				'---',
				'description: "Test"',
				'target: github-copilot',
				`tools: ['execute', 'read']`,
				'---',
			].join('\n');
			// Hover on 'shell' tool
			const hoverShell = await getHover(content, 4, 10, PromptsType.agent);
			assert.strictEqual(hoverShell, 'ToolSet: execute\n\n\nExecute code and applications on your machine');

			// Hover on 'read' tool
			const hoverEdit = await getHover(content, 4, 20, PromptsType.agent);
			assert.strictEqual(hoverEdit, 'ToolSet: read\n\n\nRead files in your workspace');
		});

		test('hover on github-copilot tool with target undefined', async () => {
			const content = [
				'---',
				'name: "Test"',
				'description: "Test"',
				`tools: ['shell', 'read']`,
				'---',
			].join('\n');
			// Hover on 'shell' tool
			const hoverShell = await getHover(content, 4, 10, PromptsType.agent);
			assert.strictEqual(hoverShell, 'ToolSet: execute\n\n\nExecute code and applications on your machine');

			// Hover on 'read' tool
			const hoverEdit = await getHover(content, 4, 20, PromptsType.agent);
			assert.strictEqual(hoverEdit, 'ToolSet: read\n\n\nRead files in your workspace');
		});

		test('hover on vscode tool shows detailed description', async () => {
			const content = [
				'---',
				'description: "Test"',
				'target: vscode',
				`tools: ['tool1', 'tool2']`,
				'---',
			].join('\n');
			// Hover on 'tool1'
			const hover = await getHover(content, 4, 10, PromptsType.agent);
			assert.strictEqual(hover, 'Test Tool 1');
		});

		test('hover on description attribute', async () => {
			const content = [
				'---',
				'description: "Test agent"',
				'target: vscode',
				'---',
			].join('\n');
			const hover = await getHover(content, 2, 1, PromptsType.agent);
			assert.strictEqual(hover, 'The description of the custom agent, what it does and when to use it.');
		});

		test('hover on argument-hint attribute', async () => {
			const content = [
				'---',
				'description: "Test"',
				'argument-hint: "test hint"',
				'---',
			].join('\n');
			const hover = await getHover(content, 3, 1, PromptsType.agent);
			assert.strictEqual(hover, 'The argument-hint describes what inputs the custom agent expects or supports.');
		});

		test('hover on name attribute', async () => {
			const content = [
				'---',
				'name: "My Agent"',
				'description: "Test agent"',
				'target: vscode',
				'---',
			].join('\n');
			const hover = await getHover(content, 2, 1, PromptsType.agent);
			assert.strictEqual(hover, 'The name of the agent as shown in the UI.');
		});

		test('hover on infer attribute shows description', async () => {
			const content = [
				'---',
				'name: "Test Agent"',
				'description: "Test agent"',
				'infer: true',
				'---',
			].join('\n');
			const hover = await getHover(content, 4, 1, PromptsType.agent);
			assert.strictEqual(hover, 'Whether the agent can be used as a subagent.');
		});
	});

	suite('prompt hovers', () => {
		test('hover on model attribute shows model info', async () => {
			const content = [
				'---',
				'description: "Test"',
				'model: MAE 4 (olama)',
				'---',
			].join('\n');
			const hover = await getHover(content, 3, 1, PromptsType.prompt);
			const expected = [
				'The model to use in this prompt.',
				'',
				'- Name: MAE 4',
				'- Family: mae',
				'- Vendor: olama'
			].join('\n');
			assert.strictEqual(hover, expected);
		});

		test('hover on tools attribute shows tool description', async () => {
			const content = [
				'---',
				'description: "Test"',
				`tools: ['tool1']`,
				'---',
			].join('\n');
			const hover = await getHover(content, 3, 10, PromptsType.prompt);
			assert.strictEqual(hover, 'Test Tool 1');
		});

		test('hover on agent attribute shows agent info', async () => {
			const content = [
				'---',
				'description: "Test"',
				'agent: BeastMode',
				'---',
			].join('\n');
			const hover = await getHover(content, 3, 1, PromptsType.prompt);
			const expected = [
				'The agent to use when running this prompt.',
				'',
				'**Built-in agents:**',
				'- `agent`: Describe what to build next',
				'- `ask`: Explore and understand your code',
				'- `edit`: Edit or refactor selected code',
				'',
				'**Custom agents:**',
				'- `BeastMode`: Custom agent'
			].join('\n');
			assert.strictEqual(hover, expected);
		});

		test('hover on name attribute', async () => {
			const content = [
				'---',
				'name: "My Prompt"',
				'description: "Test prompt"',
				'---',
			].join('\n');
			const hover = await getHover(content, 2, 1, PromptsType.prompt);
			assert.strictEqual(hover, 'The name of the prompt. This is also the name of the slash command that will run this prompt.');
		});
	});

	suite('instructions hovers', () => {
		test('hover on description attribute', async () => {
			const content = [
				'---',
				'description: "Test instruction"',
				'applyTo: "**/*.ts"',
				'---',
			].join('\n');
			const hover = await getHover(content, 2, 1, PromptsType.instructions);
			assert.strictEqual(hover, 'The description of the instruction file. It can be used to provide additional context or information about the instructions and is passed to the language model as part of the prompt.');
		});

		test('hover on applyTo attribute', async () => {
			const content = [
				'---',
				'description: "Test"',
				'applyTo: "**/*.ts"',
				'---',
			].join('\n');
			const hover = await getHover(content, 3, 1, PromptsType.instructions);
			const expected = [
				'One or more glob pattern (separated by comma) that describe for which files the instructions apply to. Based on these patterns, the file is automatically included in the prompt, when the context contains a file that matches one or more of these patterns. Use `**` when you want this file to always be added.',
				'Example: `**/*.ts`, `**/*.js`, `client/**`'
			].join('\n');
			assert.strictEqual(hover, expected);
		});

		test('hover on name attribute', async () => {
			const content = [
				'---',
				'name: "My Instructions"',
				'description: "Test instruction"',
				'applyTo: "**/*.ts"',
				'---',
			].join('\n');
			const hover = await getHover(content, 2, 1, PromptsType.instructions);
			assert.strictEqual(hover, 'The name of the instruction file as shown in the UI. If not set, the name is derived from the file name.');
		});
	});
});
