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
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { LanguageModelToolsService } from '../../../../browser/tools/languageModelToolsService.js';
import { ChatMode, CustomChatMode, IChatModeService } from '../../../../common/chatModes.js';
import { ChatAgentLocation, ChatConfiguration } from '../../../../common/constants.js';
import { ILanguageModelToolsService, ToolDataSource } from '../../../../common/tools/languageModelToolsService.js';
import { ILanguageModelChatMetadata, ILanguageModelsService } from '../../../../common/languageModels.js';
import { PromptHoverProvider } from '../../../../common/promptSyntax/languageProviders/promptHovers.js';
import { IPromptsService, PromptsStorage } from '../../../../common/promptSyntax/service/promptsService.js';
import { getLanguageIdForPromptsType, PromptsType, Target } from '../../../../common/promptSyntax/promptTypes.js';
import { MockChatModeService } from '../../../common/mockChatModeService.js';
import { createTextModel } from '../../../../../../../editor/test/common/testTextModel.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { PromptFileParser } from '../../../../common/promptSyntax/promptFileParser.js';
import { MarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { getPromptFileExtension } from '../../../../common/promptSyntax/config/promptFileLocations.js';
suite('PromptHoverProvider', () => {
    const disposables = ensureNoDisposablesAreLeakedInTestSuite();
    let instaService;
    let hoverProvider;
    setup(async () => {
        const testConfigService = new TestConfigurationService();
        testConfigService.setUserConfiguration(ChatConfiguration.ExtensionToolsEnabled, true);
        testConfigService.setUserConfiguration('chat.useCustomAgentHooks', true);
        instaService = workbenchInstantiationService({
            contextKeyService: () => disposables.add(new ContextKeyService(testConfigService)),
            configurationService: () => testConfigService
        }, disposables);
        const toolService = disposables.add(instaService.createInstance(LanguageModelToolsService));
        const testTool1 = { id: 'testTool1', displayName: 'tool1', canBeReferencedInPrompt: true, modelDescription: 'Test Tool 1', source: ToolDataSource.External, inputSchema: {} };
        disposables.add(toolService.registerToolData(testTool1));
        const testTool2 = { id: 'testTool2', displayName: 'tool2', canBeReferencedInPrompt: true, toolReferenceName: 'tool2', modelDescription: 'Test Tool 2', source: ToolDataSource.External, inputSchema: {} };
        disposables.add(toolService.registerToolData(testTool2));
        instaService.set(ILanguageModelToolsService, toolService);
        const testModels = [
            { id: 'mae-4', name: 'MAE 4', vendor: 'olama', version: '1.0', family: 'mae', modelPickerCategory: undefined, extension: new ExtensionIdentifier('a.b'), isUserSelectable: true, maxInputTokens: 8192, maxOutputTokens: 1024, capabilities: { agentMode: true, toolCalling: true }, isDefaultForLocation: { [ChatAgentLocation.Chat]: true } },
            { id: 'mae-4.1', name: 'MAE 4.1', vendor: 'copilot', version: '1.0', family: 'mae', modelPickerCategory: undefined, extension: new ExtensionIdentifier('a.b'), isUserSelectable: true, maxInputTokens: 8192, maxOutputTokens: 1024, capabilities: { agentMode: true, toolCalling: true }, isDefaultForLocation: { [ChatAgentLocation.Chat]: true } },
            // Claude model equivalents
            { id: 'claude-sonnet-4.5', name: 'Claude Sonnet 4.5', vendor: 'copilot', version: '1.0', family: 'claude', modelPickerCategory: undefined, extension: new ExtensionIdentifier('a.b'), isUserSelectable: true, maxInputTokens: 200000, maxOutputTokens: 8192, capabilities: { agentMode: true, toolCalling: true }, isDefaultForLocation: {} },
            { id: 'claude-opus-4.6', name: 'Claude Opus 4.6', vendor: 'copilot', version: '1.0', family: 'claude', modelPickerCategory: undefined, extension: new ExtensionIdentifier('a.b'), isUserSelectable: true, maxInputTokens: 200000, maxOutputTokens: 8192, capabilities: { agentMode: true, toolCalling: true }, isDefaultForLocation: {} },
            { id: 'claude-haiku-4.5', name: 'Claude Haiku 4.5', vendor: 'copilot', version: '1.0', family: 'claude', modelPickerCategory: undefined, extension: new ExtensionIdentifier('a.b'), isUserSelectable: true, maxInputTokens: 200000, maxOutputTokens: 8192, capabilities: { agentMode: true, toolCalling: true }, isDefaultForLocation: {} },
        ];
        instaService.stub(ILanguageModelsService, {
            getLanguageModelIds() { return testModels.map(m => m.id); },
            lookupLanguageModelByQualifiedName(qualifiedName) {
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
            getParsedPromptFile(model) {
                return parser.parse(model.uri, model.getValue());
            }
        });
        hoverProvider = instaService.createInstance(PromptHoverProvider);
    });
    async function getHover(content, line, column, promptType, options) {
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
                '- `agent`: Describe what to build',
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
        async function getClaudeHover(content, line, column) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvbXB0SG92ZXJzLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L3Rlc3QvYnJvd3Nlci9wcm9tcHRTeW50YXgvbGFuZ3VhZ2VQcm92aWRlcnMvcHJvbXB0SG92ZXJzLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ3JGLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ3pHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUMvRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx1RUFBdUUsQ0FBQztBQUMxRyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxxRkFBcUYsQ0FBQztBQUMvSCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUVwRyxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUN4RyxPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUNuRyxPQUFPLEVBQUUsUUFBUSxFQUFFLGNBQWMsRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQzdGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSwwQkFBMEIsRUFBYSxjQUFjLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUM5SCxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMxRyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxtRUFB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