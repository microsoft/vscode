/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { Position } from '../../../../../../../editor/common/core/position.js';
import { ContextKeyService } from '../../../../../../../platform/contextkey/browser/contextKeyService.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ExtensionIdentifier } from '../../../../../../../platform/extensions/common/extensions.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { LanguageModelToolsService } from '../../../../browser/tools/languageModelToolsService.js';
import { ChatMode, CustomChatMode, IChatModeService } from '../../../../common/chatModes.js';
import { ChatAgentLocation, ChatConfiguration } from '../../../../common/constants.js';
import { ILanguageModelToolsService, IToolData, ToolDataSource } from '../../../../common/tools/languageModelToolsService.js';
import { ILanguageModelChatMetadata, ILanguageModelsService } from '../../../../common/languageModels.js';
import { PromptHoverProvider } from '../../../../common/promptSyntax/languageProviders/promptHovers.js';
import { IPromptsService, PromptsStorage, Target } from '../../../../common/promptSyntax/service/promptsService.js';
import { MockChatModeService } from '../../../common/mockChatModeService.js';
import { createTextModel } from '../../../../../../../editor/test/common/testTextModel.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { PromptFileParser } from '../../../../common/promptSyntax/promptFileParser.js';
import { ITextModel } from '../../../../../../../editor/common/model.js';
import { MarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { getLanguageIdForPromptsType, PromptsType } from '../../../../common/promptSyntax/promptTypes.js';
import { getPromptFileExtension } from '../../../../common/promptSyntax/config/promptFileLocations.js';

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
			{ id: 'mae-4', name: 'MAE 4', vendor: 'olama', version: '1.0', family: 'mae', modelPickerCategory: undefined, extension: new ExtensionIdentifier('a.b'), isUserSelectable: true, maxInputTokens: 8192, maxOutputTokens: 1024, capabilities: { agentMode: true, toolCalling: true }, isDefaultForLocation: { [ChatAgentLocation.Chat]: true } } satisfies ILanguageModelChatMetadata,
			{ id: 'mae-4.1', name: 'MAE 4.1', vendor: 'copilot', version: '1.0', family: 'mae', modelPickerCategory: undefined, extension: new ExtensionIdentifier('a.b'), isUserSelectable: true, maxInputTokens: 8192, maxOutputTokens: 1024, capabilities: { agentMode: true, toolCalling: true }, isDefaultForLocation: { [ChatAgentLocation.Chat]: true } } satisfies ILanguageModelChatMetadata,
			// Claude model equivalents
			{ id: 'claude-sonnet-4.5', name: 'Claude Sonnet 4.5', vendor: 'copilot', version: '1.0', family: 'claude', modelPickerCategory: undefined, extension: new ExtensionIdentifier('a.b'), isUserSelectable: true, maxInputTokens: 200000, maxOutputTokens: 8192, capabilities: { agentMode: true, toolCalling: true }, isDefaultForLocation: {} } satisfies ILanguageModelChatMetadata,
			{ id: 'claude-opus-4.6', name: 'Claude Opus 4.6', vendor: 'copilot', version: '1.0', family: 'claude', modelPickerCategory: undefined, extension: new ExtensionIdentifier('a.b'), isUserSelectable: true, maxInputTokens: 200000, maxOutputTokens: 8192, capabilities: { agentMode: true, toolCalling: true }, isDefaultForLocation: {} } satisfies ILanguageModelChatMetadata,
			{ id: 'claude-haiku-4.5', name: 'Claude Haiku 4.5', vendor: 'copilot', version: '1.0', family: 'claude', modelPickerCategory: undefined, extension: new ExtensionIdentifier('a.b'), isUserSelectable: true, maxInputTokens: 200000, maxOutputTokens: 8192, capabilities: { agentMode: true, toolCalling: true }, isDefaultForLocation: {} } satisfies ILanguageModelChatMetadata,
		];

		instaService.stub(ILanguageModelsService, {
			getLanguageModelIds() { return testModels.map(m => m.id); },
			lookupLanguageModelByQualifiedName(qualifiedName: string) {
				for (const metadata of testModels) {
					if (ILanguageModelChatMetadata.matchesQualifiedName(qualifiedName, metadata)) {
						return { metadata, identifier: metadata.id };
					}
				}
				return undefined;
			}
		});

		const customChatMode = new CustomChatMode({
			uri: URI.parse('myFs://test/test/chatmode.md'),
			name: 'BeastMode',
			agentInstructions: { content: 'Beast mode instructions', toolReferences: [] },
			source: { storage: PromptsStorage.local },
			target: Target.Undefined,
			visibility: { userInvocable: true, agentInvocable: true }
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

	async function getHover(content: string, line: number, column: number, promptType: PromptsType, options?: { claudeAgent?: boolean }): Promise<string | undefined> {
		const languageId = getLanguageIdForPromptsType(promptType);
		const ext = getPromptFileExtension(promptType);
		const path = options?.claudeAgent ? `/.claude/agents/test${ext}` : `/test${ext}`;
		const uri = URI.parse('test://' + path);
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
				'Specify the model that runs this custom agent. Can also be a list of models. The first available model will be used.',
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
				'Specify the model that runs this custom agent. Can also be a list of models. The first available model will be used.',
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
				'Note: This attribute is not used in GitHub Copilot or Claude targets.'
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

		test('hover on model attribute with vscode target and model array', async () => {
			const content = [
				'---',
				'description: "Test"',
				'target: vscode',
				`model: ['MAE 4 (olama)', 'MAE 4.1 (copilot)']`,
				'---',
			].join('\n');
			const hover = await getHover(content, 4, 10, PromptsType.agent);
			const expected = [
				'Specify the model that runs this custom agent. Can also be a list of models. The first available model will be used.',
				'',
				'- Name: MAE 4',
				'- Family: mae',
				'- Vendor: olama'
			].join('\n');
			assert.strictEqual(hover, expected);
		});

		test('hover on second model in model array', async () => {
			const content = [
				'---',
				'description: "Test"',
				'target: vscode',
				`model: ['MAE 4 (olama)', 'MAE 4.1 (copilot)']`,
				'---',
			].join('\n');
			const hover = await getHover(content, 4, 30, PromptsType.agent);
			const expected = [
				'Specify the model that runs this custom agent. Can also be a list of models. The first available model will be used.',
				'',
				'- Name: MAE 4.1',
				'- Family: mae',
				'- Vendor: copilot'
			].join('\n');
			assert.strictEqual(hover, expected);
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
			assert.strictEqual(hover, 'Controls visibility of the agent.\n\nDeprecated: Use `user-invocable` and `disable-model-invocation` instead.');
		});

		test('hover on agents attribute shows description', async () => {
			const content = [
				'---',
				'name: "Test Agent"',
				'description: "Test agent"',
				'agents: ["*"]',
				'---',
			].join('\n');
			const hover = await getHover(content, 4, 1, PromptsType.agent);
			assert.strictEqual(hover, 'One or more agents that this agent can use as subagents. Use \'*\' to specify all available agents.');
		});

		test('hover on user-invocable attribute shows description', async () => {
			const content = [
				'---',
				'name: "Test Agent"',
				'description: "Test agent"',
				'user-invocable: true',
				'---',
			].join('\n');
			const hover = await getHover(content, 4, 1, PromptsType.agent);
			assert.strictEqual(hover, 'Whether the agent can be selected and invoked by users in the UI.');
		});

		test('hover on disable-model-invocation attribute shows description', async () => {
			const content = [
				'---',
				'name: "Test Agent"',
				'description: "Test agent"',
				'disable-model-invocation: true',
				'---',
			].join('\n');
			const hover = await getHover(content, 4, 1, PromptsType.agent);
			assert.strictEqual(hover, 'If true, prevents the agent from being invoked as a subagent.');
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
				'The model to use in this prompt. Can also be a list of models. The first available model will be used.',
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

	suite('skill hovers', () => {
		test('hover on name attribute', async () => {
			const content = [
				'---',
				'name: "My Skill"',
				'description: "Test skill"',
				'---',
			].join('\n');
			const hover = await getHover(content, 2, 1, PromptsType.skill);
			assert.strictEqual(hover, 'The name of the skill.');
		});

		test('hover on description attribute', async () => {
			const content = [
				'---',
				'name: "Test Skill"',
				'description: "Test skill description"',
				'---',
			].join('\n');
			const hover = await getHover(content, 3, 1, PromptsType.skill);
			assert.strictEqual(hover, 'The description of the skill. The description is added to every request and will be used by the agent to decide when to load the skill.');
		});

		test('hover on file attribute', async () => {
			const content = [
				'---',
				'name: "Test Skill"',
				'description: "Test skill"',
				'file: "SKILL.md"',
				'---',
			].join('\n');
			const hover = await getHover(content, 4, 1, PromptsType.skill);
			assert.strictEqual(hover, undefined);
		});
	});

	suite('claude agent hovers', () => {
		// Helper that creates a hover in a Claude agent file (URI under .claude/agents/)
		async function getClaudeHover(content: string, line: number, column: number): Promise<string | undefined> {
			return getHover(content, line, column, PromptsType.agent, { claudeAgent: true });
		}

		test('hover on name attribute shows Claude description', async () => {
			const content = [
				'---',
				'name: security-reviewer',
				'description: Reviews code for security vulnerabilities',
				'---',
			].join('\n');
			const hover = await getClaudeHover(content, 2, 1);
			assert.strictEqual(hover, 'Unique identifier using lowercase letters and hyphens (required)');
		});

		test('hover on description attribute shows Claude description', async () => {
			const content = [
				'---',
				'name: security-reviewer',
				'description: Reviews code for security vulnerabilities',
				'---',
			].join('\n');
			const hover = await getClaudeHover(content, 3, 1);
			assert.strictEqual(hover, 'When to delegate to this subagent (required)');
		});

		test('hover on tools attribute shows Claude description', async () => {
			const content = [
				'---',
				'name: security-reviewer',
				'description: Reviews code for security vulnerabilities',
				'tools: Edit, Grep, AskUserQuestion, WebFetch',
				'---',
			].join('\n');
			const hover = await getClaudeHover(content, 4, 1);
			assert.strictEqual(hover, 'Array of tools the subagent can use. Inherits all tools if omitted');
		});

		test('hover on individual Claude tool shows tool description', async () => {
			const content = [
				'---',
				'name: security-reviewer',
				'description: Reviews code',
				`tools: ['Edit', 'Grep', 'WebFetch']`,
				'---',
			].join('\n');
			// Hover on 'Edit' tool
			const hoverEdit = await getClaudeHover(content, 4, 10);
			assert.strictEqual(hoverEdit, 'Make targeted file edits');

			// Hover on 'Grep' tool
			const hoverGrep = await getClaudeHover(content, 4, 17);
			assert.strictEqual(hoverGrep, 'Search file contents with regex');

			// Hover on 'WebFetch' tool
			const hoverFetch = await getClaudeHover(content, 4, 27);
			assert.strictEqual(hoverFetch, 'Fetch URL content');
		});

		test('hover on model attribute shows Claude description', async () => {
			const content = [
				'---',
				'name: security-reviewer',
				'description: Reviews code',
				'model: opus',
				'---',
			].join('\n');
			const hover = await getClaudeHover(content, 4, 1);
			const expected = [
				'Model to use: sonnet, opus, haiku, or inherit. Defaults to inherit.',
				'',
				'Claude model `opus` maps to the following model:',
				'',
				'- Name: Claude Opus 4.6',
				'- Family: claude',
				'- Vendor: copilot'
			].join('\n');
			assert.strictEqual(hover, expected);
		});

		test('hover on model attribute with sonnet value', async () => {
			const content = [
				'---',
				'name: test-agent',
				'description: Test',
				'model: sonnet',
				'---',
			].join('\n');
			const hover = await getClaudeHover(content, 4, 1);
			const expected = [
				'Model to use: sonnet, opus, haiku, or inherit. Defaults to inherit.',
				'',
				'Claude model `sonnet` maps to the following model:',
				'',
				'- Name: Claude Sonnet 4.5',
				'- Family: claude',
				'- Vendor: copilot'
			].join('\n');
			assert.strictEqual(hover, expected);
		});

		test('hover on model attribute with haiku value', async () => {
			const content = [
				'---',
				'name: test-agent',
				'description: Test',
				'model: haiku',
				'---',
			].join('\n');
			const hover = await getClaudeHover(content, 4, 1);
			const expected = [
				'Model to use: sonnet, opus, haiku, or inherit. Defaults to inherit.',
				'',
				'Claude model `haiku` maps to the following model:',
				'',
				'- Name: Claude Haiku 4.5',
				'- Family: claude',
				'- Vendor: copilot'
			].join('\n');
			assert.strictEqual(hover, expected);
		});

		test('hover on model attribute with inherit value', async () => {
			const content = [
				'---',
				'name: test-agent',
				'description: Test',
				'model: inherit',
				'---',
			].join('\n');
			const hover = await getClaudeHover(content, 4, 1);
			const expected = [
				'Model to use: sonnet, opus, haiku, or inherit. Defaults to inherit.',
				'',
				'Inherit model from parent agent or prompt'
			].join('\n');
			assert.strictEqual(hover, expected);
		});

		test('hover on disallowedTools attribute shows Claude description', async () => {
			const content = [
				'---',
				'name: read-only-agent',
				'description: Read-only analysis agent',
				`disallowedTools: ['Write', 'Edit', 'Bash']`,
				'---',
			].join('\n');
			const hover = await getClaudeHover(content, 4, 1);
			assert.strictEqual(hover, 'Tools to deny, removed from inherited or specified list');
		});

		test('hover on individual disallowedTools value shows tool description', async () => {
			const content = [
				'---',
				'name: read-only-agent',
				'description: Read-only',
				`disallowedTools: ['Bash', 'Write']`,
				'---',
			].join('\n');
			// Hover on 'Bash' tool value
			const hoverBash = await getClaudeHover(content, 4, 20);
			assert.strictEqual(hoverBash, 'Execute shell commands');

			// Hover on 'Write' tool value
			const hoverWrite = await getClaudeHover(content, 4, 28);
			assert.strictEqual(hoverWrite, 'Create/overwrite files');
		});

		test('hover on permissionMode attribute shows Claude description', async () => {
			const content = [
				'---',
				'name: test-agent',
				'description: Test',
				'permissionMode: acceptEdits',
				'---',
			].join('\n');
			const hover = await getClaudeHover(content, 4, 1);
			assert.strictEqual(hover, 'Permission mode: default, acceptEdits, dontAsk, bypassPermissions, or plan.');
		});

		test('hover on memory attribute shows Claude description', async () => {
			const content = [
				'---',
				'name: test-agent',
				'description: Test',
				'memory: project',
				'---',
			].join('\n');
			const hover = await getClaudeHover(content, 4, 1);
			assert.strictEqual(hover, 'Persistent memory scope: user, project, or local. Enables cross-session learning.');
		});

		test('hover on skills attribute shows Claude description', async () => {
			const content = [
				'---',
				'name: test-agent',
				'description: Test',
				'skills: ["code-review"]',
				'---',
			].join('\n');
			const hover = await getClaudeHover(content, 4, 1);
			assert.strictEqual(hover, 'Skills to load into the subagent\'s context at startup.');
		});

		test('hover on hooks attribute shows Claude description', async () => {
			const content = [
				'---',
				'name: test-agent',
				'description: Test',
				'hooks: {}',
				'---',
			].join('\n');
			const hover = await getClaudeHover(content, 4, 1);
			assert.strictEqual(hover, 'Lifecycle hooks scoped to this subagent.');
		});

		test('hover on handoffs attribute in Claude agent shows not-used note', async () => {
			const content = [
				'---',
				'name: test-agent',
				'description: Test',
				'handoffs:',
				'  - label: Test',
				'    agent: Default',
				'    prompt: Test',
				'---',
			].join('\n');
			const hover = await getClaudeHover(content, 4, 1);
			// handoffs is not a Claude attribute, so no hover should appear
			assert.strictEqual(hover, undefined);
		});

		test('full example: hover on each attribute of a Claude agent', async () => {
			// Realistic Claude agent file as user provided
			const content = [
				'---',
				'name: security-reviewer',
				'description: Reviews code for security vulnerabilities',
				`tools: ['Edit', 'Grep', 'AskUserQuestion', 'WebFetch']`,
				'model: opus',
				'---',
				'You are a senior security engineer.',
			].join('\n');

			// Hover on name (line 2)
			const nameHover = await getClaudeHover(content, 2, 1);
			assert.strictEqual(nameHover, 'Unique identifier using lowercase letters and hyphens (required)');

			// Hover on description (line 3)
			const descHover = await getClaudeHover(content, 3, 1);
			assert.strictEqual(descHover, 'When to delegate to this subagent (required)');

			// Hover on tools attribute key (line 4, column 1)
			const toolsHover = await getClaudeHover(content, 4, 1);
			assert.strictEqual(toolsHover, 'Array of tools the subagent can use. Inherits all tools if omitted');

			// Hover on 'AskUserQuestion' tool value (line 4)
			const askHover = await getClaudeHover(content, 4, 28);
			assert.strictEqual(askHover, 'Ask multiple-choice questions');

			// Hover on model value 'opus' (line 5)
			const modelHover = await getClaudeHover(content, 5, 1);
			const expectedModelHover = [
				'Model to use: sonnet, opus, haiku, or inherit. Defaults to inherit.',
				'',
				'Claude model `opus` maps to the following model:',
				'',
				'- Name: Claude Opus 4.6',
				'- Family: claude',
				'- Vendor: copilot'
			].join('\n');
			assert.strictEqual(modelHover, expectedModelHover);
		});
	});
});
