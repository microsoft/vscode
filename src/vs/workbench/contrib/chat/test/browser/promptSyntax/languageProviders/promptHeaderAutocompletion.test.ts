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
import { ICustomAgent, IPromptsService, PromptsStorage, Target } from '../../../../common/promptSyntax/service/promptsService.js';
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
			{ id: 'bg-agent-model', name: 'BG Agent Model', vendor: 'copilot', version: '1.0', family: 'bg', modelPickerCategory: undefined, extension: new ExtensionIdentifier('a.b'), isUserSelectable: true, maxInputTokens: 8192, maxOutputTokens: 1024, capabilities: { agentMode: true, toolCalling: true }, isDefaultForLocation: { [ChatAgentLocation.Chat]: true }, targetChatSessionType: 'background' } satisfies ILanguageModelChatMetadata,
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
			target: Target.Undefined,
			visibility: { userInvocable: true, agentInvocable: true }
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

	async function getCompletions(content: string, promptType: PromptsType, uri?: URI) {
		const languageId = getLanguageIdForPromptsType(promptType);
		uri ??= URI.parse('test:///test' + getPromptFileExtension(promptType));
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
				{ label: 'user-invocable', result: 'user-invocable: ${0:true}' },
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
				{ label: 'agent', result: `tools: [agent]` },
				{ label: 'execute', result: `tools: [execute]` },
				{ label: 'read', result: `tools: [read]` },
				{ label: 'tool1', result: `tools: [tool1]` },
				{ label: 'tool2', result: `tools: [tool2]` },
				{ label: 'vscode', result: `tools: [vscode]` },
			].sort(sortByLabel));
		});

		test('complete tool names inside tools array with existing single quoted entries', async () => {
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
				{ label: 'tool1', result: `tools: ['read', 'tool1']` },
				{ label: 'tool2', result: `tools: ['read', 'tool2']` },
				{ label: 'vscode', result: `tools: ['read', 'vscode']` },
			].sort(sortByLabel));
		});

		test('complete tool names inside tools array with existing double quoted entries', async () => {
			const content = [
				'---',
				'description: "Test"',
				`tools: ["read", "tool1", |]`,
				'---',
			].join('\n');

			const actual = await getCompletions(content, PromptsType.agent);
			assert.deepStrictEqual(actual.sort(sortByLabel), [
				{ label: 'agent', result: `tools: ["read", "tool1", "agent"]` },
				{ label: 'execute', result: `tools: ["read", "tool1", "execute"]` },
				{ label: 'tool2', result: `tools: ["read", "tool1", "tool2"]` },
				{ label: 'vscode', result: `tools: ["read", "tool1", "vscode"]` },
			].sort(sortByLabel));
		});

		test('complete tool names inside tools array with existing unquoted entries', async () => {
			const content = [
				'---',
				'description: "Test"',
				`tools: [read, "tool1", |]`,
				'---',
			].join('\n');

			//uses the first entry to determine quote preference, so the new entry should be unquoted

			const actual = await getCompletions(content, PromptsType.agent);
			assert.deepStrictEqual(actual.sort(sortByLabel), [
				{ label: 'agent', result: `tools: [read, "tool1", agent]` },
				{ label: 'execute', result: `tools: [read, "tool1", execute]` },
				{ label: 'tool2', result: `tools: [read, "tool1", tool2]` },
				{ label: 'vscode', result: `tools: [read, "tool1", vscode]` },
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
				{ label: 'agent1', result: `agents: [agent1]` },
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

		test('complete user-invocable attribute value', async () => {
			const content = [
				'---',
				'description: "Test"',
				'user-invocable: |',
				'---',
			].join('\n');

			const actual = await getCompletions(content, PromptsType.agent);
			assert.deepStrictEqual(actual.sort(sortByLabel), [
				{ label: 'false', result: 'user-invocable: false' },
				{ label: 'true', result: 'user-invocable: true' },
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

		test('exclude models with targetChatSessionType from agent model completions', async () => {
			const content = [
				'---',
				'description: "Test"',
				'model: |',
				'---',
			].join('\n');

			const actual = await getCompletions(content, PromptsType.agent);
			const labels = actual.map(a => a.label);
			// BG Agent Model has targetChatSessionType set, so it should be excluded
			assert.ok(!labels.includes('BG Agent Model (copilot)'), 'Models with targetChatSessionType should be excluded from agent model completions');
		});

		test('exclude models with targetChatSessionType from agent model array completions', async () => {
			const content = [
				'---',
				'description: "Test"',
				'model: [|]',
				'---',
			].join('\n');

			const actual = await getCompletions(content, PromptsType.agent);
			const labels = actual.map(a => a.label);
			assert.ok(!labels.includes('BG Agent Model (copilot)'), 'Models with targetChatSessionType should be excluded from agent model array completions');
		});
	});

	suite('claude agent header completions', () => {
		// Claude agents are identified by their URI being under .claude/agents/
		const claudeAgentUri = URI.parse('test:///.claude/agents/security-reviewer.agent.md');

		test('complete attribute names', async () => {
			const content = [
				'---',
				'name: security-reviewer',
				'description: Reviews code for security vulnerabilities',
				'|',
				'---',
				'You are a senior security engineer.',
			].join('\n');

			const actual = await getCompletions(content, PromptsType.agent, claudeAgentUri);
			assert.deepStrictEqual(actual.sort(sortByLabel), [
				{ label: 'disallowedTools', result: 'disallowedTools: ${0:Write, Edit, Bash}' },
				{ label: 'hooks', result: 'hooks: $0' },
				{ label: 'mcpServers', result: 'mcpServers: $0' },
				{ label: 'memory', result: 'memory: ${0:user}' },
				{ label: 'model', result: 'model: ${0:sonnet}' },
				{ label: 'permissionMode', result: 'permissionMode: ${0:default}' },
				{ label: 'skills', result: 'skills: $0' },
				{ label: 'tools', result: 'tools: ${0:Read, Edit, Bash}' },
			].sort(sortByLabel));
		});

		test('complete attribute names excludes already present ones', async () => {
			const content = [
				'---',
				'name: security-reviewer',
				'description: Reviews code for security vulnerabilities',
				'tools: Edit',
				'|',
				'---',
				'You are a senior security engineer.',
			].join('\n');

			const actual = await getCompletions(content, PromptsType.agent, claudeAgentUri);
			// 'tools' should not appear since it is already in the header
			const labels = actual.map(a => a.label).sort();
			assert.ok(!labels.includes('tools'), 'tools should not be suggested when already present');
			assert.ok(!labels.includes('name'), 'name should not be suggested when already present');
			assert.ok(!labels.includes('description'), 'description should not be suggested when already present');
		});

		test('complete model attribute value with claude enum values', async () => {
			const content = [
				'---',
				'name: security-reviewer',
				'description: Reviews code for security vulnerabilities',
				'model: |',
				'---',
			].join('\n');

			const actual = await getCompletions(content, PromptsType.agent, claudeAgentUri);
			assert.deepStrictEqual(actual.sort(sortByLabel), [
				{ label: 'haiku', result: 'model: haiku' },
				{ label: 'inherit', result: 'model: inherit' },
				{ label: 'opus', result: 'model: opus' },
				{ label: 'sonnet', result: 'model: sonnet' },
			].sort(sortByLabel));
		});

		test('complete tools with comma-separated values', async () => {
			const content = [
				'---',
				'name: security-reviewer',
				'description: Reviews code for security vulnerabilities',
				'tools: Edit, |',
				'---',
			].join('\n');

			const actual = await getCompletions(content, PromptsType.agent, claudeAgentUri);
			const labels = actual.map(a => a.label).sort();
			assert.deepStrictEqual(labels, [
				'AskUserQuestion', 'Bash', 'Glob', 'Grep',
				'LSP', 'MCPSearch', 'NotebookEdit', 'Read', 'Skill',
				'Task', 'WebFetch', 'WebSearch', 'Write'
			].sort());
		});

		test('complete tools inside array syntax', async () => {
			const content = [
				'---',
				'name: security-reviewer',
				'description: Reviews code for security vulnerabilities',
				'tools: [|]',
				'---',
			].join('\n');

			const actual = await getCompletions(content, PromptsType.agent, claudeAgentUri);
			const labels = actual.map(a => a.label).sort();
			assert.deepStrictEqual(labels, [
				'AskUserQuestion', 'Bash', 'Edit', 'Glob', 'Grep',
				'LSP', 'MCPSearch', 'NotebookEdit', 'Read', 'Skill',
				'Task', 'WebFetch', 'WebSearch', 'Write'
			].sort());
			// Array items without quotes should use the name directly
			assert.deepStrictEqual(actual.find(a => a.label === 'Edit')?.result, `tools: [Edit]`);
		});

		test('complete tools inside array with existing entries', async () => {
			const content = [
				'---',
				'name: security-reviewer',
				'description: Reviews code for security vulnerabilities',
				`tools: [Edit, |]`,
				'---',
			].join('\n');

			const actual = await getCompletions(content, PromptsType.agent, claudeAgentUri);
			assert.deepStrictEqual(actual.find(a => a.label === 'Read')?.result, `tools: [Edit, Read]`);
			assert.deepStrictEqual(actual.find(a => a.label === 'Bash')?.result, `tools: [Edit, Bash]`);
		});

		test('complete disallowedTools with comma-separated values', async () => {
			const content = [
				'---',
				'name: security-reviewer',
				'description: Reviews code for security vulnerabilities',
				'disallowedTools: |',
				'---',
			].join('\n');

			const actual = await getCompletions(content, PromptsType.agent, claudeAgentUri);
			const labels = actual.map(a => a.label).sort();
			assert.deepStrictEqual(labels, [
				'AskUserQuestion', 'Bash', 'Edit', 'Glob', 'Grep',
				'LSP', 'MCPSearch', 'NotebookEdit', 'Read', 'Skill',
				'Task', 'WebFetch', 'WebSearch', 'Write'
			].sort());
		});

		test('complete disallowedTools inside array syntax', async () => {
			const content = [
				'---',
				'name: security-reviewer',
				'description: Reviews code for security vulnerabilities',
				'disallowedTools: [Bash, |]',
				'---',
			].join('\n');

			const actual = await getCompletions(content, PromptsType.agent, claudeAgentUri);
			assert.deepStrictEqual(actual.find(a => a.label === 'Write')?.result, `disallowedTools: [Bash, Write]`);
			assert.deepStrictEqual(actual.find(a => a.label === 'Edit')?.result, `disallowedTools: [Bash, Edit]`);
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

		test('exclude models with targetChatSessionType from prompt model completions', async () => {
			const content = [
				'---',
				'description: "Test"',
				'model: |',
				'---',
			].join('\n');

			const actual = await getCompletions(content, PromptsType.prompt);
			const labels = actual.map(a => a.label);
			assert.ok(!labels.includes('BG Agent Model (copilot)'), 'Models with targetChatSessionType should be excluded from prompt model completions');
		});
	});
});
