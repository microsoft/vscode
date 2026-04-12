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
import { ChatAgentLocation, ChatConfiguration } from '../../../../common/constants.js';
import { ILanguageModelToolsService, ToolDataSource } from '../../../../common/tools/languageModelToolsService.js';
import { ILanguageModelsService } from '../../../../common/languageModels.js';
import { IChatModeService } from '../../../../common/chatModes.js';
import { PromptHeaderAutocompletion } from '../../../../common/promptSyntax/languageProviders/promptHeaderAutocompletion.js';
import { IPromptsService, PromptsStorage } from '../../../../common/promptSyntax/service/promptsService.js';
import { getLanguageIdForPromptsType, PromptsType, Target } from '../../../../common/promptSyntax/promptTypes.js';
import { createTextModel } from '../../../../../../../editor/test/common/testTextModel.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { PromptFileParser } from '../../../../common/promptSyntax/promptFileParser.js';
import { getPromptFileExtension } from '../../../../common/promptSyntax/config/promptFileLocations.js';
import { Range } from '../../../../../../../editor/common/core/range.js';
suite('PromptHeaderAutocompletion', () => {
    const disposables = ensureNoDisposablesAreLeakedInTestSuite();
    let instaService;
    let completionProvider;
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
            { id: 'gpt-4', name: 'GPT 4', vendor: 'openai', version: '1.0', family: 'gpt', modelPickerCategory: undefined, extension: new ExtensionIdentifier('a.b'), isUserSelectable: true, maxInputTokens: 8192, maxOutputTokens: 1024, capabilities: { agentMode: false, toolCalling: true }, isDefaultForLocation: { [ChatAgentLocation.Chat]: true } },
            { id: 'bg-agent-model', name: 'BG Agent Model', vendor: 'copilot', version: '1.0', family: 'bg', modelPickerCategory: undefined, extension: new ExtensionIdentifier('a.b'), isUserSelectable: true, maxInputTokens: 8192, maxOutputTokens: 1024, capabilities: { agentMode: true, toolCalling: true }, isDefaultForLocation: { [ChatAgentLocation.Chat]: true }, targetChatSessionType: 'background' },
        ];
        instaService.stub(ILanguageModelsService, {
            getLanguageModelIds() { return testModels.map(m => m.id); },
            lookupLanguageModel(name) {
                return testModels.find(m => m.id === name);
            }
        });
        const customAgent = {
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
            getParsedPromptFile(model) {
                return parser.parse(model.uri, model.getValue());
            },
            async getCustomAgents(token) {
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
    async function getCompletions(content, promptType, uri) {
        const languageId = getLanguageIdForPromptsType(promptType);
        uri ??= URI.parse('test:///test' + getPromptFileExtension(promptType));
        const model = disposables.add(createTextModel(content, languageId, undefined, uri));
        // get the completion location from  the '|' marker
        const lineColumnMarkerRange = model.findNextMatch('|', new Position(1, 1), false, false, '', false)?.range;
        assert.ok(lineColumnMarkerRange, 'No completion marker found in test content');
        model.applyEdits([{ range: lineColumnMarkerRange, text: '' }]);
        const position = lineColumnMarkerRange.getStartPosition();
        const context = { triggerKind: 0 /* CompletionTriggerKind.Invoke */ };
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
    const sortByLabel = (a, b) => a.label.localeCompare(b.label);
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
                { label: 'github', result: 'github: $0' },
                { label: 'handoffs', result: 'handoffs: $0' },
                { label: 'hooks', result: 'hooks:\n  ${1|SessionStart,SessionEnd,UserPromptSubmit,PreToolUse,PostToolUse,PreCompact,SubagentStart,SubagentStop,Stop,ErrorOccurred|}:\n    - type: command\n      command: "$2"' },
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
        test('complete hooks value with New Hook snippet', async () => {
            const content = [
                '---',
                'description: "Test"',
                'hooks: |',
                '---',
            ].join('\n');
            const actual = await getCompletions(content, PromptsType.agent);
            assert.deepStrictEqual(actual, [
                {
                    label: 'New Hook',
                    result: 'hooks: \n  ${1|SessionStart,SessionEnd,UserPromptSubmit,PreToolUse,PostToolUse,PreCompact,SubagentStart,SubagentStop,Stop,ErrorOccurred|}:\n    - type: command\n      command: "$2"'
                },
            ]);
        });
        test('complete hooks value with New Hook snippet for vscode target', async () => {
            const content = [
                '---',
                'description: "Test"',
                'target: vscode',
                'hooks: |',
                '---',
            ].join('\n');
            const actual = await getCompletions(content, PromptsType.agent);
            assert.deepStrictEqual(actual, [
                {
                    label: 'New Hook',
                    result: 'hooks: \n  ${1|SessionStart,UserPromptSubmit,PreToolUse,PostToolUse,PreCompact,SubagentStart,SubagentStop,Stop|}:\n    - type: command\n      command: "$2"'
                },
            ]);
        });
        test('complete hook event names inside hooks map', async () => {
            const content = [
                '---',
                'description: "Test"',
                'hooks:',
                '  SessionStart:',
                '    - type: command',
                '      command: "echo hi"',
                '  |',
                '---',
            ].join('\n');
            const actual = await getCompletions(content, PromptsType.agent);
            const labels = actual.map(a => a.label).sort();
            // SessionStart should be excluded since it already exists
            assert.ok(!labels.includes('SessionStart'), 'SessionStart should not be suggested when already present');
            assert.ok(labels.includes('SessionEnd'), 'SessionEnd should be suggested');
            assert.ok(labels.includes('PreToolUse'), 'PreToolUse should be suggested');
            assert.ok(labels.includes('Stop'), 'Stop should be suggested');
        });
        test('complete hook event names for vscode target excludes existing hooks', async () => {
            const content = [
                '---',
                'description: "Test"',
                'target: vscode',
                'hooks:',
                '  SessionStart:',
                '    - type: command',
                '      command: "echo hi"',
                '  PreToolUse:',
                '    - type: command',
                '      command: "lint"',
                '  |',
                '---',
            ].join('\n');
            const actual = await getCompletions(content, PromptsType.agent);
            const labels = actual.map(a => a.label).sort();
            assert.ok(!labels.includes('SessionStart'), 'SessionStart should not be suggested when already present');
            assert.ok(!labels.includes('PreToolUse'), 'PreToolUse should not be suggested when already present');
            assert.ok(labels.includes('UserPromptSubmit'), 'UserPromptSubmit should be suggested');
            assert.ok(labels.includes('PostToolUse'), 'PostToolUse should be suggested');
            // SessionEnd is not available for vscode target
            assert.ok(!labels.includes('SessionEnd'), 'SessionEnd should not be available for vscode target');
        });
        test('complete hook event names on empty line before existing hooks', async () => {
            const content = [
                '---',
                'description: "Test"',
                'hooks:',
                '  |',
                '  SessionStart:',
                '    - type: command',
                '      command: "echo hi"',
                '---',
            ].join('\n');
            const actual = await getCompletions(content, PromptsType.agent);
            const labels = actual.map(a => a.label).sort();
            assert.ok(!labels.includes('SessionStart'), 'SessionStart should not be suggested when already present');
            assert.ok(labels.includes('SessionEnd'), 'SessionEnd should be suggested');
            assert.ok(labels.includes('PreToolUse'), 'PreToolUse should be suggested');
        });
        test('complete hook event names while editing existing key name', async () => {
            const content = [
                '---',
                'description: "Test"',
                'hooks:',
                '  S|:',
                '    - type: command',
                '      command: "echo hi"',
                '---',
            ].join('\n');
            const actual = await getCompletions(content, PromptsType.agent);
            const labels = actual.map(a => a.label).sort();
            assert.ok(labels.includes('SessionStart'), 'SessionStart should be suggested');
            assert.ok(labels.includes('SubagentStart'), 'SubagentStart should be suggested');
            assert.ok(labels.includes('Stop'), 'Stop should be suggested');
            // Verify insertText only replaces the key (no full snippet)
            const sessionStartItem = actual.find(a => a.label === 'SessionStart');
            assert.ok(sessionStartItem);
            assert.strictEqual(sessionStartItem.result, '  SessionStart:');
        });
        test('hooks: cursor right after colon triggers New Hook snippet', async () => {
            const content = [
                '---',
                'description: "Test"',
                'hooks: |',
                '---',
            ].join('\n');
            const actual = await getCompletions(content, PromptsType.agent);
            const labels = actual.map(a => a.label);
            assert.ok(labels.includes('New Hook'), 'New Hook snippet should be suggested');
        });
        test('hooks: typing event name on next line triggers hook events', async () => {
            const content = [
                '---',
                'description: "Test"',
                'hooks:',
                '  S|',
                '---',
            ].join('\n');
            const actual = await getCompletions(content, PromptsType.agent);
            const labels = actual.map(a => a.label);
            assert.ok(labels.includes('SessionStart'), 'SessionStart should be suggested');
            assert.ok(labels.includes('SessionEnd'), 'SessionEnd should be suggested');
            assert.ok(labels.includes('Stop'), 'Stop should be suggested');
        });
        test('typing field name in first command entry triggers command fields', async () => {
            const content = [
                '---',
                'description: "Test"',
                'hooks:',
                '  SessionEnd:',
                '    - t|',
                '---',
            ].join('\n');
            const actual = await getCompletions(content, PromptsType.agent);
            const labels = actual.map(a => a.label);
            assert.ok(labels.includes('type'), 'type should be suggested');
            assert.ok(labels.includes('command'), 'command should be suggested');
            assert.ok(labels.includes('timeout'), 'timeout should be suggested');
        });
        test('typing field name after existing field triggers remaining command fields', async () => {
            const content = [
                '---',
                'description: "Test"',
                'hooks:',
                '  SessionEnd:',
                '    - type: command',
                '      c|',
                '---',
            ].join('\n');
            const actual = await getCompletions(content, PromptsType.agent);
            const labels = actual.map(a => a.label);
            assert.ok(labels.includes('command'), 'command should be suggested');
            assert.ok(labels.includes('cwd'), 'cwd should be suggested');
            assert.ok(!labels.includes('type'), 'type should not be suggested when already present');
        });
        test('typing event name after existing hook triggers hook events', async () => {
            const content = [
                '---',
                'description: "Test"',
                'hooks:',
                '  SessionEnd:',
                '    - type: command',
                '      command: echo "Session ended."',
                '  U|',
                '---',
            ].join('\n');
            const actual = await getCompletions(content, PromptsType.agent);
            const labels = actual.map(a => a.label);
            assert.ok(labels.includes('UserPromptSubmit'), 'UserPromptSubmit should be suggested');
            assert.ok(!labels.includes('SessionEnd'), 'SessionEnd should not be suggested when already present');
        });
        test('typing event name between existing hooks triggers hook events', async () => {
            const content = [
                '---',
                'description: "Test"',
                'hooks:',
                '  SessionEnd:',
                '    - type: command',
                '      command: echo "Session ended."',
                '  S|',
                '  UserPromptSubmit:',
                '    - type: command',
                '      command: echo "User submitted."',
                '---',
            ].join('\n');
            const actual = await getCompletions(content, PromptsType.agent);
            const labels = actual.map(a => a.label);
            assert.ok(labels.includes('SessionStart'), 'SessionStart should be suggested');
            assert.ok(labels.includes('Stop'), 'Stop should be suggested');
            assert.ok(!labels.includes('SessionEnd'), 'SessionEnd should not be suggested when already present');
            assert.ok(!labels.includes('UserPromptSubmit'), 'UserPromptSubmit should not be suggested when already present');
        });
        test('cursor after hook event colon triggers New Command snippet', async () => {
            const content = [
                '---',
                'description: "Test"',
                'hooks:',
                '  SessionEnd: |',
                '---',
            ].join('\n');
            const actual = await getCompletions(content, PromptsType.agent);
            const labels = actual.map(a => a.label);
            assert.ok(labels.includes('New Command'), 'New Command snippet should be suggested');
            assert.strictEqual(actual.length, 1, 'Only one suggestion should be returned');
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvbXB0SGVhZGVyQXV0b2NvbXBsZXRpb24udGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL3Byb21wdFN5bnRheC9sYW5ndWFnZVByb3ZpZGVycy9wcm9tcHRIZWFkZXJBdXRvY29tcGxldGlvbi50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNyRixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUN6RyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0scURBQXFELENBQUM7QUFFL0UsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sdUVBQXVFLENBQUM7QUFDMUcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0scUZBQXFGLENBQUM7QUFDL0gsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFFcEcsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDeEcsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDbkcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLGlCQUFpQixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDdkYsT0FBTyxFQUFFLDBCQUEwQixFQUFhLGNBQWMsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQzlILE9BQU8sRUFBOEIsc0JBQXNCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMxRyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSxpRkFBaUYs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