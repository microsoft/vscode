/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ResourceSet } from '../../../../../../../base/common/map.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { ContextKeyService } from '../../../../../../../platform/contextkey/browser/contextKeyService.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ExtensionIdentifier } from '../../../../../../../platform/extensions/common/extensions.js';
import { IFileService } from '../../../../../../../platform/files/common/files.js';
import { ILabelService } from '../../../../../../../platform/label/common/label.js';
import { MarkerSeverity } from '../../../../../../../platform/markers/common/markers.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { LanguageModelToolsService } from '../../../../browser/tools/languageModelToolsService.js';
import { ChatMode, CustomChatMode, IChatModeService } from '../../../../common/chatModes.js';
import { ChatAgentLocation, ChatConfiguration } from '../../../../common/constants.js';
import { ILanguageModelToolsService, ToolDataSource } from '../../../../common/tools/languageModelToolsService.js';
import { ILanguageModelChatMetadata, ILanguageModelsService } from '../../../../common/languageModels.js';
import { getPromptFileExtension } from '../../../../common/promptSyntax/config/promptFileLocations.js';
import { PromptValidator } from '../../../../common/promptSyntax/languageProviders/promptValidator.js';
import { PromptsType, Target } from '../../../../common/promptSyntax/promptTypes.js';
import { PromptFileParser } from '../../../../common/promptSyntax/promptFileParser.js';
import { IPromptsService, PromptsStorage } from '../../../../common/promptSyntax/service/promptsService.js';
import { MockChatModeService } from '../../../common/mockChatModeService.js';
import { MockPromptsService } from '../../../common/promptSyntax/service/mockPromptsService.js';
import { PromptsConfig } from '../../../../common/promptSyntax/config/config.js';
suite('PromptValidator', () => {
    const disposables = ensureNoDisposablesAreLeakedInTestSuite();
    let instaService;
    let testConfigService;
    const existingRef1 = URI.parse('myFs://test/reference1.md');
    const existingRef2 = URI.parse('myFs://test/reference2.md');
    setup(async () => {
        testConfigService = new TestConfigurationService();
        testConfigService.setUserConfiguration(ChatConfiguration.ExtensionToolsEnabled, true);
        testConfigService.setUserConfiguration(PromptsConfig.USE_CUSTOM_AGENT_HOOKS, true);
        testConfigService.setUserConfiguration(ChatConfiguration.SubagentToolCustomAgents, true);
        instaService = workbenchInstantiationService({
            contextKeyService: () => disposables.add(new ContextKeyService(testConfigService)),
            configurationService: () => testConfigService
        }, disposables);
        instaService.stub(ILabelService, { getUriLabel: (resource) => resource.path });
        const toolService = disposables.add(instaService.createInstance(LanguageModelToolsService));
        const testTool1 = { id: 'testTool1', displayName: 'tool1', canBeReferencedInPrompt: true, modelDescription: 'Test Tool 1', source: ToolDataSource.External, inputSchema: {} };
        disposables.add(toolService.registerToolData(testTool1));
        const testTool2 = { id: 'testTool2', displayName: 'tool2', canBeReferencedInPrompt: true, toolReferenceName: 'tool2', modelDescription: 'Test Tool 2', source: ToolDataSource.External, inputSchema: {} };
        disposables.add(toolService.registerToolData(testTool2));
        const shellTool = { id: 'shell', displayName: 'shell', canBeReferencedInPrompt: true, toolReferenceName: 'shell', modelDescription: 'Runs commands in the terminal', source: ToolDataSource.External, inputSchema: {} };
        disposables.add(toolService.registerToolData(shellTool));
        const myExtSource = { type: 'extension', label: 'My Extension', extensionId: new ExtensionIdentifier('My.extension') };
        const testTool3 = { id: 'testTool3', displayName: 'tool3', canBeReferencedInPrompt: true, toolReferenceName: 'tool3', modelDescription: 'Test Tool 3', source: myExtSource, inputSchema: {} };
        disposables.add(toolService.registerToolData(testTool3));
        const prExtSource = { type: 'extension', label: 'GitHub Pull Request Extension', extensionId: new ExtensionIdentifier('github.vscode-pull-request-github') };
        const prExtTool1 = { id: 'suggestFix', canBeReferencedInPrompt: true, toolReferenceName: 'suggest-fix', modelDescription: 'tool4', displayName: 'Test Tool 4', source: prExtSource, inputSchema: {} };
        disposables.add(toolService.registerToolData(prExtTool1));
        const toolWithLegacy = { id: 'newTool', toolReferenceName: 'newToolRef', displayName: 'New Tool', canBeReferencedInPrompt: true, modelDescription: 'New Tool', source: ToolDataSource.External, inputSchema: {}, legacyToolReferenceFullNames: ['oldToolName', 'deprecatedToolName'] };
        disposables.add(toolService.registerToolData(toolWithLegacy));
        const toolSetWithLegacy = disposables.add(toolService.createToolSet(ToolDataSource.External, 'newToolSet', 'newToolSetRef', { description: 'New Tool Set', legacyFullNames: ['oldToolSet', 'deprecatedToolSet'] }));
        const toolInSet = { id: 'toolInSet', toolReferenceName: 'toolInSetRef', displayName: 'Tool In Set', canBeReferencedInPrompt: false, modelDescription: 'Tool In Set', source: ToolDataSource.External, inputSchema: {} };
        disposables.add(toolService.registerToolData(toolInSet));
        disposables.add(toolSetWithLegacy.addTool(toolInSet));
        const anotherToolWithLegacy = { id: 'anotherTool', toolReferenceName: 'anotherToolRef', displayName: 'Another Tool', canBeReferencedInPrompt: true, modelDescription: 'Another Tool', source: ToolDataSource.External, inputSchema: {}, legacyToolReferenceFullNames: ['legacyTool'] };
        disposables.add(toolService.registerToolData(anotherToolWithLegacy));
        const anotherToolSetWithLegacy = disposables.add(toolService.createToolSet(ToolDataSource.External, 'anotherToolSet', 'anotherToolSetRef', { description: 'Another Tool Set', legacyFullNames: ['legacyToolSet'] }));
        const anotherToolInSet = { id: 'anotherToolInSet', toolReferenceName: 'anotherToolInSetRef', displayName: 'Another Tool In Set', canBeReferencedInPrompt: false, modelDescription: 'Another Tool In Set', source: ToolDataSource.External, inputSchema: {} };
        disposables.add(toolService.registerToolData(anotherToolInSet));
        disposables.add(anotherToolSetWithLegacy.addTool(anotherToolInSet));
        const conflictToolSet1 = disposables.add(toolService.createToolSet(ToolDataSource.External, 'conflictSet1', 'conflictSet1Ref', { legacyFullNames: ['sharedLegacyName'] }));
        const conflictTool1 = { id: 'conflictTool1', toolReferenceName: 'conflictTool1Ref', displayName: 'Conflict Tool 1', canBeReferencedInPrompt: false, modelDescription: 'Conflict Tool 1', source: ToolDataSource.External, inputSchema: {} };
        disposables.add(toolService.registerToolData(conflictTool1));
        disposables.add(conflictToolSet1.addTool(conflictTool1));
        const conflictToolSet2 = disposables.add(toolService.createToolSet(ToolDataSource.External, 'conflictSet2', 'conflictSet2Ref', { legacyFullNames: ['sharedLegacyName'] }));
        const conflictTool2 = { id: 'conflictTool2', toolReferenceName: 'conflictTool2Ref', displayName: 'Conflict Tool 2', canBeReferencedInPrompt: false, modelDescription: 'Conflict Tool 2', source: ToolDataSource.External, inputSchema: {} };
        disposables.add(toolService.registerToolData(conflictTool2));
        disposables.add(conflictToolSet2.addTool(conflictTool2));
        // Tool in the vscode toolset with a legacy name — for testing namespaced deprecated name resolution
        const toolInVscodeSet = { id: 'browserTool', toolReferenceName: 'openIntegratedBrowser', legacyToolReferenceFullNames: ['openSimpleBrowser'], displayName: 'Open Integrated Browser', canBeReferencedInPrompt: true, modelDescription: 'Open browser', source: ToolDataSource.Internal, inputSchema: {} };
        disposables.add(toolService.registerToolData(toolInVscodeSet));
        disposables.add(toolService.vscodeToolSet.addTool(toolInVscodeSet));
        instaService.set(ILanguageModelToolsService, toolService);
        const testModels = [
            { id: 'mae-4', name: 'MAE 4', vendor: 'olama', version: '1.0', family: 'mae', modelPickerCategory: undefined, extension: new ExtensionIdentifier('a.b'), isUserSelectable: true, maxInputTokens: 8192, maxOutputTokens: 1024, capabilities: { agentMode: true, toolCalling: true }, isDefaultForLocation: { [ChatAgentLocation.Chat]: true } },
            { id: 'mae-4.1', name: 'MAE 4.1', vendor: 'copilot', version: '1.0', family: 'mae', modelPickerCategory: undefined, extension: new ExtensionIdentifier('a.b'), isUserSelectable: true, maxInputTokens: 8192, maxOutputTokens: 1024, capabilities: { agentMode: true, toolCalling: true }, isDefaultForLocation: { [ChatAgentLocation.Chat]: true } },
            { id: 'mae-3.5-turbo', name: 'MAE 3.5 Turbo', vendor: 'copilot', version: '1.0', family: 'mae', modelPickerCategory: undefined, extension: new ExtensionIdentifier('a.b'), isUserSelectable: true, maxInputTokens: 8192, maxOutputTokens: 1024, isDefaultForLocation: { [ChatAgentLocation.Chat]: true } }
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
        const existingFiles = new ResourceSet([existingRef1, existingRef2]);
        instaService.stub(IFileService, {
            exists(uri) {
                return Promise.resolve(existingFiles.has(uri));
            }
        });
        const promptsService = new MockPromptsService();
        const customMode = {
            uri: URI.parse('file:///test/custom-mode.md'),
            name: 'Plan',
            description: 'A test custom mode',
            tools: ['tool1', 'tool2'],
            agentInstructions: { content: 'Custom mode body', toolReferences: [] },
            source: { storage: PromptsStorage.local },
            target: Target.Undefined,
            visibility: { userInvocable: true, agentInvocable: true }
        };
        promptsService.setCustomModes([customMode]);
        instaService.stub(IPromptsService, promptsService);
    });
    async function validate(code, promptType, uri) {
        if (!uri) {
            uri = URI.parse('myFs://test/testFile' + getPromptFileExtension(promptType));
        }
        const result = new PromptFileParser().parse(uri, code);
        const validator = instaService.createInstance(PromptValidator);
        const markers = [];
        await validator.validate(result, promptType, m => markers.push(m));
        return markers;
    }
    suite('agents', () => {
        test('correct agent', async () => {
            const content = [
                /* 01 */ '---',
                /* 02 */ `description: "Agent mode test"`,
                /* 03 */ 'model: MAE 4.1',
                /* 04 */ `tools: ['tool1', 'tool2']`,
                /* 05 */ '---',
                /* 06 */ 'This is a chat agent test.',
                /* 07 */ 'Here is a #tool1 variable and a #file:./reference1.md as well as a [reference](./reference2.md).',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.deepStrictEqual(markers, []);
        });
        test('agent with errors (empty description, unknown tool & model)', async () => {
            const content = [
                /* 01 */ '---',
                /* 02 */ `description: ""`, // empty description -> error
                /* 03 */ 'model: MAE 4.2', // unknown model -> warning
                /* 04 */ `tools: ['tool1', 'tool2', 'tool4', 'my.extension/tool3']`, // tool4 unknown -> error
                /* 05 */ '---',
                /* 06 */ 'Body',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.deepStrictEqual(markers.map(m => ({ severity: m.severity, message: m.message, tags: m.tags })), [
                { severity: MarkerSeverity.Error, message: `The 'description' attribute should not be empty.`, tags: undefined },
                { severity: MarkerSeverity.Hint, message: `Unknown tool 'tool4' will be ignored.`, tags: [1 /* MarkerTag.Unnecessary */] },
                { severity: MarkerSeverity.Hint, message: `Unknown model 'MAE 4.2' will be ignored.`, tags: [1 /* MarkerTag.Unnecessary */] },
            ]);
        });
        test('tools must be array or string', async () => {
            const content = [
                '---',
                'description: "Test"',
                `tools: 'tool1'`,
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.strictEqual(markers.length, 0);
        });
        test('model as string array - valid', async () => {
            const content = [
                '---',
                'description: "Test with model array"',
                `model: ['MAE 4 (olama)', 'MAE 4.1']`,
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.deepStrictEqual(markers, []);
        });
        test('model as string array - unknown model is ignored', async () => {
            const content = [
                '---',
                'description: "Test with model array"',
                `model: ['MAE 4 (olama)', 'Unknown Model']`,
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.strictEqual(markers.length, 1);
            assert.strictEqual(markers[0].severity, MarkerSeverity.Hint);
            assert.deepStrictEqual(markers[0].tags, [1 /* MarkerTag.Unnecessary */]);
            assert.strictEqual(markers[0].message, `Unknown model 'Unknown Model' will be ignored.`);
        });
        test('model as string array - unsuitable model', async () => {
            const content = [
                '---',
                'description: "Test with model array"',
                `model: ['MAE 4 (olama)', 'MAE 3.5 Turbo']`,
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.strictEqual(markers.length, 1);
            assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
            assert.strictEqual(markers[0].message, `Model 'MAE 3.5 Turbo' is not suited for agent mode.`);
        });
        test('model as string array - empty array', async () => {
            const content = [
                '---',
                'description: "Test with empty model array"',
                `model: []`,
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.strictEqual(markers.length, 1);
            assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
            assert.strictEqual(markers[0].message, `The 'model' array must not be empty.`);
        });
        test('model as string array - non-string item', async () => {
            const content = [
                '---',
                'description: "Test with invalid model array"',
                `model: ['MAE 4 (olama)', []]`,
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.strictEqual(markers.length, 1);
            assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
            assert.strictEqual(markers[0].message, `The 'model' array must contain only strings.`);
        });
        test('model as string array - empty string item', async () => {
            const content = [
                '---',
                'description: "Test with empty string in model array"',
                `model: ['MAE 4 (olama)', '']`,
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.strictEqual(markers.length, 1);
            assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
            assert.strictEqual(markers[0].message, `Model names in the array must be non-empty strings.`);
        });
        test('model as invalid type', async () => {
            const content = [
                '---',
                'description: "Test with invalid model type"',
                `model: {}`,
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.strictEqual(markers.length, 1);
            assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
            assert.strictEqual(markers[0].message, `The 'model' attribute must be a string or an array of strings.`);
        });
        test('each tool must be string', async () => {
            const content = [
                '---',
                'description: "Test"',
                `tools: ['tool1', {}]`,
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.deepStrictEqual(markers.map(m => ({ severity: m.severity, message: m.message })), [
                { severity: MarkerSeverity.Error, message: `Each tool name in the 'tools' attribute must be a string.` },
            ]);
        });
        test('old tool reference', async () => {
            const content = [
                '---',
                'description: "Test"',
                `tools: ['tool1', 'tool3']`,
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.deepStrictEqual(markers.map(m => ({ severity: m.severity, message: m.message })), [
                { severity: MarkerSeverity.Info, message: `Tool or toolset 'tool3' has been renamed, use 'my.extension/tool3' instead.` },
            ]);
        });
        test('legacy tool reference names', async () => {
            // Test using legacy tool reference name
            {
                const content = [
                    '---',
                    'description: "Test"',
                    `tools: ['tool1', 'oldToolName']`,
                    '---',
                ].join('\n');
                const markers = await validate(content, PromptsType.agent);
                assert.deepStrictEqual(markers.map(m => ({ severity: m.severity, message: m.message })), [
                    { severity: MarkerSeverity.Info, message: `Tool or toolset 'oldToolName' has been renamed, use 'newToolRef' instead.` },
                ]);
            }
            // Test using another legacy tool reference name
            {
                const content = [
                    '---',
                    'description: "Test"',
                    `tools: ['tool1', 'deprecatedToolName']`,
                    '---',
                ].join('\n');
                const markers = await validate(content, PromptsType.agent);
                assert.deepStrictEqual(markers.map(m => ({ severity: m.severity, message: m.message })), [
                    { severity: MarkerSeverity.Info, message: `Tool or toolset 'deprecatedToolName' has been renamed, use 'newToolRef' instead.` },
                ]);
            }
        });
        test('legacy toolset names', async () => {
            // Test using legacy toolset name
            {
                const content = [
                    '---',
                    'description: "Test"',
                    `tools: ['tool1', 'oldToolSet']`,
                    '---',
                ].join('\n');
                const markers = await validate(content, PromptsType.agent);
                assert.deepStrictEqual(markers.map(m => ({ severity: m.severity, message: m.message })), [
                    { severity: MarkerSeverity.Info, message: `Tool or toolset 'oldToolSet' has been renamed, use 'newToolSetRef' instead.` },
                ]);
            }
            // Test using another legacy toolset name
            {
                const content = [
                    '---',
                    'description: "Test"',
                    `tools: ['tool1', 'deprecatedToolSet']`,
                    '---',
                ].join('\n');
                const markers = await validate(content, PromptsType.agent);
                assert.deepStrictEqual(markers.map(m => ({ severity: m.severity, message: m.message })), [
                    { severity: MarkerSeverity.Info, message: `Tool or toolset 'deprecatedToolSet' has been renamed, use 'newToolSetRef' instead.` },
                ]);
            }
        });
        test('multiple legacy names in same tools list', async () => {
            // Test multiple legacy names together
            const content = [
                '---',
                'description: "Test"',
                `tools: ['legacyTool', 'legacyToolSet', 'tool3']`,
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.deepStrictEqual(markers.map(m => ({ severity: m.severity, message: m.message })), [
                { severity: MarkerSeverity.Info, message: `Tool or toolset 'legacyTool' has been renamed, use 'anotherToolRef' instead.` },
                { severity: MarkerSeverity.Info, message: `Tool or toolset 'legacyToolSet' has been renamed, use 'anotherToolSetRef' instead.` },
                { severity: MarkerSeverity.Info, message: `Tool or toolset 'tool3' has been renamed, use 'my.extension/tool3' instead.` },
            ]);
        });
        test('deprecated tool name mapping to multiple new names', async () => {
            // The toolsets are registered in setup with a shared legacy name 'sharedLegacyName'
            // This simulates the case where one deprecated name maps to multiple current names
            const content = [
                '---',
                'description: "Test"',
                `tools: ['sharedLegacyName']`,
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.strictEqual(markers.length, 1);
            assert.strictEqual(markers[0].severity, MarkerSeverity.Info);
            // When multiple toolsets share the same legacy name, the message should indicate multiple options
            // The message will say "use the following tools instead:" for multiple mappings
            const expectedMessage = `Tool or toolset 'sharedLegacyName' has been renamed, use the following tools instead: conflictSet1Ref, conflictSet2Ref`;
            assert.strictEqual(markers[0].message, expectedMessage);
        });
        test('deprecated tool name in body variable reference - single mapping', async () => {
            // Test deprecated tool name used as variable reference in body
            const content = [
                '---',
                'description: "Test"',
                '---',
                'Body with #tool:oldToolName reference',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.strictEqual(markers.length, 1);
            assert.strictEqual(markers[0].severity, MarkerSeverity.Info);
            assert.strictEqual(markers[0].message, `Tool or toolset 'oldToolName' has been renamed, use 'newToolRef' instead.`);
        });
        test('deprecated tool name in body variable reference - multiple mappings', async () => {
            // Register tools with the same legacy name to create multiple mappings
            const multiMapToolSet1 = disposables.add(instaService.get(ILanguageModelToolsService).createToolSet(ToolDataSource.External, 'multiMapSet1', 'multiMapSet1Ref', { legacyFullNames: ['multiMapLegacy'] }));
            const multiMapTool1 = { id: 'multiMapTool1', toolReferenceName: 'multiMapTool1Ref', displayName: 'Multi Map Tool 1', canBeReferencedInPrompt: true, modelDescription: 'Multi Map Tool 1', source: ToolDataSource.External, inputSchema: {} };
            disposables.add(instaService.get(ILanguageModelToolsService).registerToolData(multiMapTool1));
            disposables.add(multiMapToolSet1.addTool(multiMapTool1));
            const multiMapToolSet2 = disposables.add(instaService.get(ILanguageModelToolsService).createToolSet(ToolDataSource.External, 'multiMapSet2', 'multiMapSet2Ref', { legacyFullNames: ['multiMapLegacy'] }));
            const multiMapTool2 = { id: 'multiMapTool2', toolReferenceName: 'multiMapTool2Ref', displayName: 'Multi Map Tool 2', canBeReferencedInPrompt: true, modelDescription: 'Multi Map Tool 2', source: ToolDataSource.External, inputSchema: {} };
            disposables.add(instaService.get(ILanguageModelToolsService).registerToolData(multiMapTool2));
            disposables.add(multiMapToolSet2.addTool(multiMapTool2));
            const content = [
                '---',
                'description: "Test"',
                '---',
                'Body with #tool:multiMapLegacy reference',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.strictEqual(markers.length, 1);
            assert.strictEqual(markers[0].severity, MarkerSeverity.Info);
            // When multiple toolsets share the same legacy name, the message should indicate multiple options
            // The message will say "use the following tools instead:" for multiple mappings in body references
            const expectedMessage = `Tool or toolset 'multiMapLegacy' has been renamed, use the following tools instead: multiMapSet1Ref, multiMapSet2Ref`;
            assert.strictEqual(markers[0].message, expectedMessage);
        });
        test('namespaced deprecated tool name in tools header shows rename hint', async () => {
            // When a tool is in a toolset (e.g. vscode/openIntegratedBrowser) and has a legacy name,
            // using the namespaced old name (vscode/openSimpleBrowser) should show the rename hint
            const content = [
                '---',
                'description: "Test"',
                `tools: ['vscode/openSimpleBrowser']`,
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.deepStrictEqual(markers.map(m => ({ severity: m.severity, message: m.message })), [
                { severity: MarkerSeverity.Info, message: `Tool or toolset 'vscode/openSimpleBrowser' has been renamed, use 'vscode/openIntegratedBrowser' instead.` },
            ]);
        });
        test('bare deprecated tool name in tools header also shows rename hint', async () => {
            // The bare (non-namespaced) legacy name should also resolve
            const content = [
                '---',
                'description: "Test"',
                `tools: ['openSimpleBrowser']`,
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.deepStrictEqual(markers.map(m => ({ severity: m.severity, message: m.message })), [
                { severity: MarkerSeverity.Info, message: `Tool or toolset 'openSimpleBrowser' has been renamed, use 'vscode/openIntegratedBrowser' instead.` },
            ]);
        });
        test('unknown attribute in agent file', async () => {
            const content = [
                '---',
                'description: "Test"',
                `applyTo: '*.ts'`, // not allowed in agent file
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.deepStrictEqual(markers.map(m => ({ severity: m.severity, message: m.message, tags: m.tags })), [
                { severity: MarkerSeverity.Hint, message: `Attribute 'applyTo' is not supported in VS Code agent files. Supported: agents, argument-hint, description, disable-model-invocation, github, handoffs, hooks, model, name, target, tools, user-invocable.`, tags: [1 /* MarkerTag.Unnecessary */] },
            ]);
        });
        test('tools with invalid handoffs', async () => {
            {
                const content = [
                    '---',
                    'description: "Test"',
                    `handoffs: next`,
                    '---',
                ].join('\n');
                const markers = await validate(content, PromptsType.agent);
                assert.strictEqual(markers.length, 1);
                assert.deepStrictEqual(markers.map(m => m.message), [`The 'handoffs' attribute must be an array.`]);
            }
            {
                const content = [
                    '---',
                    'description: "Test"',
                    `handoffs:`,
                    `  - label: '123'`,
                    '---',
                ].join('\n');
                const markers = await validate(content, PromptsType.agent);
                assert.strictEqual(markers.length, 1);
                assert.deepStrictEqual(markers.map(m => m.message), [`Missing required properties 'agent', 'prompt' in handoff object.`]);
            }
            {
                const content = [
                    '---',
                    'description: "Test"',
                    `handoffs:`,
                    `  - label: '123'`,
                    `    agent: ''`,
                    `    prompt: ''`,
                    `    send: true`,
                    '---',
                ].join('\n');
                const markers = await validate(content, PromptsType.agent);
                assert.strictEqual(markers.length, 1);
                assert.deepStrictEqual(markers.map(m => m.message), [`The 'agent' property in a handoff must be a non-empty string.`]);
            }
            {
                const content = [
                    '---',
                    'description: "Test"',
                    `handoffs:`,
                    `  - label: '123'`,
                    `    agent: 'Cool'`,
                    `    prompt: ''`,
                    `    send: true`,
                    '---',
                ].join('\n');
                const markers = await validate(content, PromptsType.agent);
                assert.strictEqual(markers.length, 1);
                assert.deepStrictEqual(markers.map(m => m.message), [`Unknown agent 'Cool'. Available agents: agent, ask, edit, BeastMode.`]);
            }
        });
        test('agent with handoffs attribute', async () => {
            const content = [
                '---',
                'description: \"Test agent with handoffs\"',
                `handoffs:`,
                '  - label: Test Prompt',
                '    agent: agent',
                '    prompt: Add tests for this code',
                '  - label: Optimize Performance',
                '    agent: agent',
                '    prompt: Optimize for performance',
                '---',
                'Body',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.deepStrictEqual(markers, [], 'Expected no validation issues for handoffs attribute');
        });
        test('duplicate handoff labels are reported', async () => {
            const content = [
                '---',
                'description: "Test"',
                `handoffs:`,
                '  - label: Start Implementation',
                '    agent: agent',
                '    prompt: Go implement',
                '  - label: Start Implementation',
                '    agent: agent',
                '    prompt: Go implement again',
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.deepStrictEqual(markers.map(m => m.message), [
                'Duplicate handoff label \'Start Implementation\'. Each handoff must have a unique label.',
            ]);
        });
        test('duplicate handoff labels are case-insensitive', async () => {
            const content = [
                '---',
                'description: "Test"',
                `handoffs:`,
                '  - label: Start Implementation',
                '    agent: agent',
                '    prompt: Go implement',
                '  - label: start implementation',
                '    agent: edit',
                '    prompt: Different prompt',
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.deepStrictEqual(markers.map(m => m.message), [
                'Duplicate handoff label \'start implementation\'. Each handoff must have a unique label.',
            ]);
        });
        test('handoff label must contain alphanumeric character', async () => {
            const content = [
                '---',
                'description: "Test"',
                `handoffs:`,
                '  - label: "!!!"',
                '    agent: agent',
                '    prompt: Go',
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.deepStrictEqual(markers.map(m => m.message), [
                'The \'label\' property in a handoff must contain at least one alphanumeric character.',
            ]);
        });
        test('github-copilot agent with supported attributes', async () => {
            const content = [
                '---',
                'name: "GitHub_Copilot_Custom_Agent"',
                'description: "GitHub Copilot agent"',
                'target: github-copilot',
                `tools: ['shell', 'edit', 'search', 'custom-agent']`,
                'mcp-servers: []',
                '---',
                'Body with #search and #edit references',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.deepStrictEqual(markers, [], 'Expected no validation issues for github-copilot target');
        });
        test('github-copilot agent warns about model and handoffs attributes', async () => {
            const content = [
                '---',
                'name: "GitHubAgent"',
                'description: "GitHub Copilot agent"',
                'target: github-copilot',
                'model: MAE 4.1',
                `tools: ['shell', 'edit']`,
                `handoffs:`,
                '  - label: Test',
                '    agent: Default',
                '    prompt: Test',
                '---',
                'Body',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            const messages = markers.map(m => m.message);
            assert.deepStrictEqual(messages, [
                'Attribute \'model\' is not supported in custom GitHub Copilot agent files. Supported: description, github, infer, mcp-servers, name, target, tools.',
                'Attribute \'handoffs\' is not supported in custom GitHub Copilot agent files. Supported: description, github, infer, mcp-servers, name, target, tools.',
            ], 'Model and handoffs are not validated for github-copilot target');
        });
        test('github-copilot agent does not validate variable references', async () => {
            const content = [
                '---',
                'name: "GitHubAgent"',
                'description: "GitHub Copilot agent"',
                'target: github-copilot',
                `tools: ['shell', 'edit']`,
                '---',
                'Body with #unknownTool reference',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            // Variable references should not be validated for github-copilot target
            assert.deepStrictEqual(markers, [], 'Variable references are not validated for github-copilot target');
        });
        test('github-copilot agent rejects unsupported attributes', async () => {
            const content = [
                '---',
                'name: "GitHubAgent"',
                'description: "GitHub Copilot agent"',
                'target: github-copilot',
                'argument-hint: "test hint"',
                `tools: ['shell']`,
                '---',
                'Body',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.strictEqual(markers.length, 1);
            assert.strictEqual(markers[0].severity, MarkerSeverity.Hint);
            assert.deepStrictEqual(markers[0].tags, [1 /* MarkerTag.Unnecessary */]);
            assert.ok(markers[0].message.includes(`Attribute 'argument-hint' is not supported`), 'Expected hint about unsupported attribute');
        });
        test('github-copilot agent with valid permissions', async () => {
            const content = [
                '---',
                'name: "IssueTriage"',
                'description: "Triages issues"',
                'target: github-copilot',
                `tools: ['read']`,
                'github:',
                '  permissions:',
                '    issues: write',
                '    contents: read',
                '    metadata: read',
                '---',
                'Body',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.deepStrictEqual(markers, []);
        });
        test('github-copilot agent with invalid permission scope', async () => {
            const content = [
                '---',
                'name: "TestAgent"',
                'description: "Test"',
                'target: github-copilot',
                `tools: ['read']`,
                'github:',
                '  permissions:',
                '    unknown-scope: read',
                '---',
                'Body',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.strictEqual(markers.length, 1);
            assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
            assert.ok(markers[0].message.includes('Unknown permission scope \'unknown-scope\''));
        });
        test('github-copilot agent with invalid permission value', async () => {
            const content = [
                '---',
                'name: "TestAgent"',
                'description: "Test"',
                'target: github-copilot',
                `tools: ['read']`,
                'github:',
                '  permissions:',
                '    metadata: write',
                '---',
                'Body',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.strictEqual(markers.length, 1);
            assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
            assert.ok(markers[0].message.includes('Invalid permission value \'write\' for scope \'metadata\''));
        });
        test('github-copilot agent with non-map github attribute', async () => {
            const content = [
                '---',
                'name: "TestAgent"',
                'description: "Test"',
                'target: github-copilot',
                `tools: ['read']`,
                'github: invalid',
                '---',
                'Body',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.strictEqual(markers.length, 1);
            assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
            assert.strictEqual(markers[0].message, 'The \'github\' attribute must be an object.');
        });
        test('github-copilot agent with unknown github sub-property', async () => {
            const content = [
                '---',
                'name: "TestAgent"',
                'description: "Test"',
                'target: github-copilot',
                `tools: ['read']`,
                'github:',
                '  unknown: value',
                '---',
                'Body',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.strictEqual(markers.length, 1);
            assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
            assert.ok(markers[0].message.includes('Unknown property \'unknown\''));
        });
        test('undefined target agent with valid github permissions', async () => {
            const content = [
                '---',
                'description: "Agent without target"',
                'github:',
                '  permissions:',
                '    issues: write',
                '    contents: read',
                '---',
                'Body',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.deepStrictEqual(markers, []);
        });
        test('undefined target agent with invalid github permission scope', async () => {
            const content = [
                '---',
                'description: "Agent without target"',
                'github:',
                '  permissions:',
                '    unknown-scope: read',
                '---',
                'Body',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.strictEqual(markers.length, 1);
            assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
            assert.ok(markers[0].message.includes('Unknown permission scope \'unknown-scope\''));
        });
        test('undefined target agent with invalid github permission value', async () => {
            const content = [
                '---',
                'description: "Agent without target"',
                'github:',
                '  permissions:',
                '    metadata: write',
                '---',
                'Body',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.strictEqual(markers.length, 1);
            assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
            assert.ok(markers[0].message.includes('Invalid permission value \'write\' for scope \'metadata\''));
        });
        test('undefined target agent with non-map github attribute', async () => {
            const content = [
                '---',
                'description: "Agent without target"',
                'github: invalid',
                '---',
                'Body',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.strictEqual(markers.length, 1);
            assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
            assert.strictEqual(markers[0].message, 'The \'github\' attribute must be an object.');
        });
        test('vscode target agent validates normally', async () => {
            const content = [
                '---',
                'description: "VS Code agent"',
                'target: vscode',
                'model: MAE 4.1',
                `tools: ['tool1', 'tool2']`,
                '---',
                'Body with #tool1',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.deepStrictEqual(markers, [], 'VS Code target should validate normally');
        });
        test('vscode target agent marks unknown tools as unnecessary hints', async () => {
            const content = [
                '---',
                'description: "VS Code agent"',
                'target: vscode',
                `tools: ['tool1', 'unknownTool']`,
                '---',
                'Body',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.strictEqual(markers.length, 1);
            assert.strictEqual(markers[0].severity, MarkerSeverity.Hint);
            assert.deepStrictEqual(markers[0].tags, [1 /* MarkerTag.Unnecessary */]);
            assert.strictEqual(markers[0].message, `Unknown tool 'unknownTool' will be ignored.`);
        });
        test('vscode target agent with mcp-servers and github-tools', async () => {
            const content = [
                '---',
                'description: "VS Code agent"',
                'target: vscode',
                `tools: ['tool1', 'edit']`,
                `mcp-servers: {}`,
                '---',
                'Body',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            const messages = markers.map(m => m.message);
            assert.deepStrictEqual(messages, [
                'Attribute \'mcp-servers\' is ignored when running locally in VS Code.',
                'Unknown tool \'edit\' will be ignored.',
            ]);
        });
        test('undefined target with mcp-servers and github-tools', async () => {
            const content = [
                '---',
                'description: "VS Code agent"',
                `tools: ['tool1', 'shell']`,
                `mcp-servers: {}`,
                '---',
                'Body',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            const messages = markers.map(m => m.message);
            assert.deepStrictEqual(messages, [
                'Attribute \'mcp-servers\' is ignored when running locally in VS Code.',
            ]);
        });
        test('default target (no target specified) validates as vscode', async () => {
            const content = [
                '---',
                'description: "Agent without target"',
                'model: MAE 4.1',
                `tools: ['tool1']`,
                'argument-hint: "test hint"',
                '---',
                'Body',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            // Should validate normally as if target was vscode
            assert.deepStrictEqual(markers, [], 'Agent without target should validate as vscode');
        });
        test('name attribute validation', async () => {
            // Valid name
            {
                const content = [
                    '---',
                    'name: "MyAgent"',
                    'description: "Test agent"',
                    'target: vscode',
                    '---',
                    'Body',
                ].join('\n');
                const markers = await validate(content, PromptsType.agent);
                assert.deepStrictEqual(markers, [], 'Valid name should not produce errors');
            }
            // Empty name
            {
                const content = [
                    '---',
                    'name: ""',
                    'description: "Test agent"',
                    'target: vscode',
                    '---',
                    'Body',
                ].join('\n');
                const markers = await validate(content, PromptsType.agent);
                assert.strictEqual(markers.length, 1);
                assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
                assert.strictEqual(markers[0].message, `The 'name' attribute must not be empty.`);
            }
            // Non-string name
            {
                const content = [
                    '---',
                    'name: []',
                    'description: "Test agent"',
                    'target: vscode',
                    '---',
                    'Body',
                ].join('\n');
                const markers = await validate(content, PromptsType.agent);
                assert.strictEqual(markers.length, 1);
                assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
                assert.strictEqual(markers[0].message, `The 'name' attribute must be a string.`);
            }
            // Valid name with allowed characters
            {
                const content = [
                    '---',
                    'name: "My_Agent-2.0 with spaces"',
                    'description: "Test agent"',
                    'target: vscode',
                    '---',
                    'Body',
                ].join('\n');
                const markers = await validate(content, PromptsType.agent);
                assert.deepStrictEqual(markers, [], 'Name with allowed characters should be valid');
            }
        });
        test('github-copilot target requires name attribute', async () => {
            // Missing name with github-copilot target
            {
                const content = [
                    '---',
                    'description: "GitHub Copilot agent"',
                    'target: github-copilot',
                    `tools: ['shell']`,
                    '---',
                    'Body',
                ].join('\n');
                const markers = await validate(content, PromptsType.agent);
                assert.strictEqual(markers.length, 0);
            }
            // Valid name with github-copilot target
            {
                const content = [
                    '---',
                    'name: "GitHubAgent"',
                    'description: "GitHub Copilot agent"',
                    'target: github-copilot',
                    `tools: ['shell']`,
                    '---',
                    'Body',
                ].join('\n');
                const markers = await validate(content, PromptsType.agent);
                assert.deepStrictEqual(markers, [], 'Valid github-copilot agent with name should not produce errors');
            }
            // Missing name with vscode target (should be optional)
            {
                const content = [
                    '---',
                    'description: "VS Code agent"',
                    'target: vscode',
                    `tools: ['tool1']`,
                    '---',
                    'Body',
                ].join('\n');
                const markers = await validate(content, PromptsType.agent);
                assert.deepStrictEqual(markers, [], 'Name should be optional for vscode target');
            }
        });
        test('infer attribute validation', async () => {
            const deprecationMessage = `The 'infer' attribute is deprecated in favour of 'user-invocable' and 'disable-model-invocation'.`;
            // Valid infer: true (maps to 'all') - shows deprecation warning
            {
                testConfigService.setUserConfiguration(ChatConfiguration.SubagentToolCustomAgents, true);
                const content = [
                    '---',
                    'name: "TestAgent"',
                    'description: "Test agent"',
                    'infer: true',
                    '---',
                    'Body',
                ].join('\n');
                const markers = await validate(content, PromptsType.agent);
                assert.strictEqual(markers.length, 1, 'infer: true should produce deprecation warning');
                assert.strictEqual(markers[0].message, deprecationMessage);
                assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
            }
            // Valid infer: false (maps to 'user') - shows deprecation warning
            {
                const content = [
                    '---',
                    'name: "TestAgent"',
                    'description: "Test agent"',
                    'infer: false',
                    '---',
                    'Body',
                ].join('\n');
                const markers = await validate(content, PromptsType.agent);
                assert.strictEqual(markers.length, 1, 'infer: false should produce deprecation warning');
                assert.strictEqual(markers[0].message, deprecationMessage);
                assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
            }
            // Invalid infer: unknown string value - shows deprecation warning (validation removed for deprecated attribute)
            {
                const content = [
                    '---',
                    'name: "TestAgent"',
                    'description: "Test agent"',
                    'infer: "yes"',
                    '---',
                    'Body',
                ].join('\n');
                const markers = await validate(content, PromptsType.agent);
                assert.strictEqual(markers.length, 1, 'infer: "yes" should produce deprecation warning');
                assert.strictEqual(markers[0].message, deprecationMessage);
                assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
            }
            // Missing infer attribute (should be optional)
            {
                const content = [
                    '---',
                    'name: "TestAgent"',
                    'description: "Test agent"',
                    '---',
                    'Body',
                ].join('\n');
                const markers = await validate(content, PromptsType.agent);
                assert.deepStrictEqual(markers, [], 'Missing infer attribute should be allowed');
            }
        });
        test('disable-model-invocation: false warns when customAgentInSubagent.enabled is disabled', async () => {
            testConfigService.setUserConfiguration(ChatConfiguration.SubagentToolCustomAgents, false);
            // disable-model-invocation: false should warn when config is disabled
            {
                const content = [
                    '---',
                    'name: "TestAgent"',
                    'description: "Test agent"',
                    'disable-model-invocation: false',
                    '---',
                    'Body',
                ].join('\n');
                const markers = await validate(content, PromptsType.agent);
                assert.strictEqual(markers.length, 1);
                assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
                assert.strictEqual(markers[0].message, `For agents to be used as subagent you also need to enable the 'chat.customAgentInSubagent.enabled' setting.`);
            }
        });
        test('agents attribute must be an array', async () => {
            testConfigService.setUserConfiguration(ChatConfiguration.SubagentToolCustomAgents, true);
            const content = [
                '---',
                'description: "Test"',
                `agents: 'myAgent'`,
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.deepStrictEqual(markers.map(m => m.message), [`The 'agents' attribute must be an array.`]);
        });
        test('each agent name in agents attribute must be a string', async () => {
            testConfigService.setUserConfiguration(ChatConfiguration.SubagentToolCustomAgents, true);
            const content = [
                '---',
                'description: "Test"',
                `agents: ['agent', {}]`,
                `tools: ['agent']`,
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.deepStrictEqual(markers.map(m => m.message), [`Each agent name in the 'agents' attribute must be a string.`]);
        });
        test('unknown agent in agents attribute shows unnecessary hint', async () => {
            const content = [
                '---',
                'description: "Test"',
                `agents: ['UnknownAgent']`,
                `tools: ['agent']`,
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.strictEqual(markers.length, 1);
            assert.strictEqual(markers[0].severity, MarkerSeverity.Hint);
            assert.deepStrictEqual(markers[0].tags, [1 /* MarkerTag.Unnecessary */]);
            assert.strictEqual(markers[0].message, `Unknown agent 'UnknownAgent' will be ignored. Available agents: Plan, agent.`);
        });
        test('agents attribute with non-empty value requires agent tool 1', async () => {
            testConfigService.setUserConfiguration(ChatConfiguration.SubagentToolCustomAgents, true);
            const content = [
                '---',
                'description: "Test"',
                `agents: ['agent', 'Plan']`,
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.deepStrictEqual(markers.map(m => m.message), [], `No warnings about agents attribute when no tools are specified`);
        });
        test('agents attribute with non-empty value requires agent tool 2', async () => {
            testConfigService.setUserConfiguration(ChatConfiguration.SubagentToolCustomAgents, true);
            const content = [
                '---',
                'description: "Test"',
                `agents: ['agent', 'Plan']`,
                `tools: ['shell']`,
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.deepStrictEqual(markers.map(m => m.message), [`When 'agents' and 'tools' are specified, the 'agent' tool must be included in the 'tools' attribute.`]);
        });
        test('agents attribute with non-empty value requires agent tool 3', async () => {
            testConfigService.setUserConfiguration(ChatConfiguration.SubagentToolCustomAgents, true);
            const content = [
                '---',
                'description: "Test"',
                `agents: ['agent', 'Plan']`,
                `tools: ['agent']`,
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.deepStrictEqual(markers.map(m => m.message), [], `No warnings about agents attribute when agent tool is in header`);
        });
        test('agents attribute with non-empty value requires agent tool 4', async () => {
            testConfigService.setUserConfiguration(ChatConfiguration.SubagentToolCustomAgents, true);
            const content = [
                '---',
                'description: "Test"',
                `agents: ['*']`,
                `tools: ['shell']`,
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.deepStrictEqual(markers.map(m => m.message), [`When 'agents' and 'tools' are specified, the 'agent' tool must be included in the 'tools' attribute.`]);
        });
        test('agents attribute with empty array does not require agent tool', async () => {
            testConfigService.setUserConfiguration(ChatConfiguration.SubagentToolCustomAgents, true);
            const content = [
                '---',
                'description: "Test"',
                `agents: []`,
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.deepStrictEqual(markers, [], 'Empty array should not require agent tool');
        });
        test('user-invocable attribute validation', async () => {
            // Valid user-invocable: true
            {
                const content = [
                    '---',
                    'name: "TestAgent"',
                    'description: "Test agent"',
                    'user-invocable: true',
                    '---',
                    'Body',
                ].join('\n');
                const markers = await validate(content, PromptsType.agent);
                assert.deepStrictEqual(markers, [], 'Valid user-invocable: true should not produce errors');
            }
            // Valid user-invocable: false
            {
                const content = [
                    '---',
                    'name: "TestAgent"',
                    'description: "Test agent"',
                    'user-invocable: false',
                    '---',
                    'Body',
                ].join('\n');
                const markers = await validate(content, PromptsType.agent);
                assert.deepStrictEqual(markers, [], 'Valid user-invocable: false should not produce errors');
            }
            // Invalid user-invocable: string value
            {
                const content = [
                    '---',
                    'name: "TestAgent"',
                    'description: "Test agent"',
                    'user-invocable: "yes"',
                    '---',
                    'Body',
                ].join('\n');
                const markers = await validate(content, PromptsType.agent);
                assert.strictEqual(markers.length, 1);
                assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
                assert.strictEqual(markers[0].message, `The 'user-invocable' attribute must be 'true' or 'false'.`);
            }
            // Invalid user-invocable: number value
            {
                const content = [
                    '---',
                    'name: "TestAgent"',
                    'description: "Test agent"',
                    'user-invocable: 1',
                    '---',
                    'Body',
                ].join('\n');
                const markers = await validate(content, PromptsType.agent);
                assert.strictEqual(markers.length, 1);
                assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
                assert.strictEqual(markers[0].message, `The 'user-invocable' attribute must be 'true' or 'false'.`);
            }
        });
        test('removed user-invokable attribute is reported as unknown', async () => {
            const content = [
                '---',
                'name: "TestAgent"',
                'description: "Test agent"',
                'user-invokable: true',
                '---',
                'Body',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.strictEqual(markers.length, 1, 'user-invokable should produce exactly one diagnostic');
            assert.strictEqual(markers[0].severity, MarkerSeverity.Hint);
            assert.deepStrictEqual(markers[0].tags, [1 /* MarkerTag.Unnecessary */]);
            assert.ok(markers[0].message.includes('user-invokable'), 'hint should mention the attribute name');
            assert.ok(markers[0].message.includes('not supported'), 'hint should say attribute is not supported');
        });
        test('disable-model-invocation attribute validation', async () => {
            // Valid disable-model-invocation: true
            {
                const content = [
                    '---',
                    'name: "TestAgent"',
                    'description: "Test agent"',
                    'disable-model-invocation: true',
                    '---',
                    'Body',
                ].join('\n');
                const markers = await validate(content, PromptsType.agent);
                assert.deepStrictEqual(markers, [], 'Valid disable-model-invocation: true should not produce errors');
            }
            // Valid disable-model-invocation: false
            {
                const content = [
                    '---',
                    'name: "TestAgent"',
                    'description: "Test agent"',
                    'disable-model-invocation: false',
                    '---',
                    'Body',
                ].join('\n');
                const markers = await validate(content, PromptsType.agent);
                assert.deepStrictEqual(markers, [], 'Valid disable-model-invocation: false should not produce errors');
            }
            // Invalid disable-model-invocation: string value
            {
                const content = [
                    '---',
                    'name: "TestAgent"',
                    'description: "Test agent"',
                    'disable-model-invocation: "yes"',
                    '---',
                    'Body',
                ].join('\n');
                const markers = await validate(content, PromptsType.agent);
                assert.strictEqual(markers.length, 1);
                assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
                assert.strictEqual(markers[0].message, `The 'disable-model-invocation' attribute must be 'true' or 'false'.`);
            }
            // Invalid disable-model-invocation: number value
            {
                const content = [
                    '---',
                    'name: "TestAgent"',
                    'description: "Test agent"',
                    'disable-model-invocation: 0',
                    '---',
                    'Body',
                ].join('\n');
                const markers = await validate(content, PromptsType.agent);
                assert.strictEqual(markers.length, 1);
                assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
                assert.strictEqual(markers[0].message, `The 'disable-model-invocation' attribute must be 'true' or 'false'.`);
            }
        });
        test('hooks - valid hook commands', async () => {
            const content = [
                '---',
                'description: "Test"',
                'hooks:',
                '  SessionStart:',
                '    - type: command',
                '      command: echo hello',
                '  PreToolUse:',
                '    - type: command',
                '      command: ./validate.sh',
                '      cwd: scripts',
                '      timeout: 30',
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.deepStrictEqual(markers, []);
        });
        test('hooks - must be a map', async () => {
            const content = [
                '---',
                'description: "Test"',
                'hooks: invalid',
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.deepStrictEqual(markers.map(m => ({ severity: m.severity, message: m.message })), [
                { severity: MarkerSeverity.Error, message: `The 'hooks' attribute must be a map of hook event types to command arrays.` },
            ]);
        });
        test('hooks - unknown hook event type', async () => {
            const content = [
                '---',
                'description: "Test"',
                'hooks:',
                '  UnknownEvent:',
                '    - type: command',
                '      command: echo hello',
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.deepStrictEqual(markers.map(m => ({ severity: m.severity, message: m.message })), [
                { severity: MarkerSeverity.Warning, message: `Unknown hook event type 'UnknownEvent'. Supported: SessionStart, SessionEnd, UserPromptSubmit, PreToolUse, PostToolUse, PreCompact, SubagentStart, SubagentStop, Stop, ErrorOccurred.` },
            ]);
        });
        test('hooks - hook value must be array', async () => {
            const content = [
                '---',
                'description: "Test"',
                'hooks:',
                '  SessionStart: invalid',
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.deepStrictEqual(markers.map(m => ({ severity: m.severity, message: m.message })), [
                { severity: MarkerSeverity.Error, message: `Hook event 'SessionStart' must have an array of command objects as its value.` },
            ]);
        });
        test('hooks - command item must be object', async () => {
            const content = [
                '---',
                'description: "Test"',
                'hooks:',
                '  SessionStart:',
                '    - just a string',
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.deepStrictEqual(markers.map(m => ({ severity: m.severity, message: m.message })), [
                { severity: MarkerSeverity.Error, message: `Each hook command must be an object.` },
            ]);
        });
        test('hooks - missing type property', async () => {
            const content = [
                '---',
                'description: "Test"',
                'hooks:',
                '  SessionStart:',
                '    - command: echo hello',
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.deepStrictEqual(markers.map(m => ({ severity: m.severity, message: m.message })), [
                { severity: MarkerSeverity.Error, message: `Hook command is missing required property 'type'.` },
            ]);
        });
        test('hooks - type must be command', async () => {
            const content = [
                '---',
                'description: "Test"',
                'hooks:',
                '  SessionStart:',
                '    - type: script',
                '      command: echo hello',
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.deepStrictEqual(markers.map(m => ({ severity: m.severity, message: m.message })), [
                { severity: MarkerSeverity.Error, message: `The 'type' property in a hook command must be 'command'.` },
            ]);
        });
        test('hooks - missing command field', async () => {
            const content = [
                '---',
                'description: "Test"',
                'hooks:',
                '  SessionStart:',
                '    - type: command',
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.deepStrictEqual(markers.map(m => ({ severity: m.severity, message: m.message })), [
                { severity: MarkerSeverity.Error, message: `Hook command must specify at least one of 'command', 'windows', 'linux', or 'osx'.` },
            ]);
        });
        test('hooks - empty command string', async () => {
            const content = [
                '---',
                'description: "Test"',
                'hooks:',
                '  SessionStart:',
                '    - type: command',
                '      command: ""',
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.deepStrictEqual(markers.map(m => ({ severity: m.severity, message: m.message })), [
                { severity: MarkerSeverity.Error, message: `The 'command' property in a hook command must be a non-empty string.` },
            ]);
        });
        test('hooks - platform-specific commands are valid', async () => {
            const content = [
                '---',
                'description: "Test"',
                'hooks:',
                '  SessionStart:',
                '    - type: command',
                '      windows: echo hello',
                '      linux: echo hello',
                '      osx: echo hello',
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.deepStrictEqual(markers, []);
        });
        test('hooks - env must be a map with string values', async () => {
            const content = [
                '---',
                'description: "Test"',
                'hooks:',
                '  SessionStart:',
                '    - type: command',
                '      command: echo hello',
                '      env: invalid',
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.deepStrictEqual(markers.map(m => ({ severity: m.severity, message: m.message })), [
                { severity: MarkerSeverity.Error, message: `The 'env' property in a hook command must be a map of string values.` },
            ]);
        });
        test('hooks - valid env map', async () => {
            const content = [
                '---',
                'description: "Test"',
                'hooks:',
                '  SessionStart:',
                '    - type: command',
                '      command: echo hello',
                '      env:',
                '        NODE_ENV: production',
                '        DEBUG: "true"',
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.deepStrictEqual(markers, []);
        });
        test('hooks - unknown property warns', async () => {
            const content = [
                '---',
                'description: "Test"',
                'hooks:',
                '  SessionStart:',
                '    - type: command',
                '      command: echo hello',
                '      unknownProp: value',
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.deepStrictEqual(markers.map(m => ({ severity: m.severity, message: m.message })), [
                { severity: MarkerSeverity.Warning, message: `Unknown property 'unknownProp' in hook command.` },
            ]);
        });
        test('hooks - timeout must be number', async () => {
            const content = [
                '---',
                'description: "Test"',
                'hooks:',
                '  SessionStart:',
                '    - type: command',
                '      command: echo hello',
                '      timeout: not-a-number',
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.deepStrictEqual(markers.map(m => ({ severity: m.severity, message: m.message })), [
                { severity: MarkerSeverity.Error, message: `The 'timeout' property in a hook command must be a number.` },
            ]);
        });
        test('hooks - cwd must be string', async () => {
            const content = [
                '---',
                'description: "Test"',
                'hooks:',
                '  SessionStart:',
                '    - type: command',
                '      command: echo hello',
                '      cwd:',
                '        - array',
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.deepStrictEqual(markers.map(m => ({ severity: m.severity, message: m.message })), [
                { severity: MarkerSeverity.Error, message: `The 'cwd' property in a hook command must be a string.` },
            ]);
        });
        test('hooks - multiple errors in one command', async () => {
            const content = [
                '---',
                'description: "Test"',
                'hooks:',
                '  SessionStart:',
                '    - type: script',
                '      unknownProp: value',
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.deepStrictEqual(markers.map(m => ({ severity: m.severity, message: m.message })), [
                { severity: MarkerSeverity.Error, message: `The 'type' property in a hook command must be 'command'.` },
                { severity: MarkerSeverity.Warning, message: `Unknown property 'unknownProp' in hook command.` },
                { severity: MarkerSeverity.Error, message: `Hook command must specify at least one of 'command', 'windows', 'linux', or 'osx'.` },
            ]);
        });
        test('hooks - nested matcher format is valid', async () => {
            const content = [
                '---',
                'description: "Test"',
                'hooks:',
                '  UserPromptSubmit:',
                '    - hooks:',
                '        - type: command',
                '          command: "echo foo"',
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.deepStrictEqual(markers, []);
        });
        test('hooks - nested matcher validates inner commands', async () => {
            const content = [
                '---',
                'description: "Test"',
                'hooks:',
                '  PreToolUse:',
                '    - matcher: Bash',
                '      hooks:',
                '        - type: script',
                '          command: "echo foo"',
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.deepStrictEqual(markers.map(m => ({ severity: m.severity, message: m.message })), [
                { severity: MarkerSeverity.Error, message: `The 'type' property in a hook command must be 'command'.` },
            ]);
        });
        test('hooks - nested hooks must be array', async () => {
            const content = [
                '---',
                'description: "Test"',
                'hooks:',
                '  PreToolUse:',
                '    - hooks: invalid',
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent);
            assert.deepStrictEqual(markers.map(m => ({ severity: m.severity, message: m.message })), [
                { severity: MarkerSeverity.Error, message: `The 'hooks' property in a matcher must be an array of command objects.` },
            ]);
        });
    });
    suite('instructions', () => {
        test('instructions valid', async () => {
            const content = [
                '---',
                'description: "Instr"',
                'applyTo: *.ts,*.js',
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.instructions);
            assert.deepEqual(markers, []);
        });
        test('instructions invalid applyTo type', async () => {
            const content = [
                '---',
                'description: "Instr"',
                'applyTo: []',
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.instructions);
            assert.strictEqual(markers.length, 1);
            assert.strictEqual(markers[0].message, `The 'applyTo' attribute must be a string.`);
        });
        test('instructions invalid applyTo glob & unknown attribute', async () => {
            const content = [
                '---',
                'description: "Instr"',
                `applyTo: ''`, // empty -> invalid glob
                'model: mae-4', // model not allowed in instructions
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.instructions);
            assert.strictEqual(markers.length, 2);
            // Order: unknown attribute hints first (attribute iteration) then applyTo validation
            assert.strictEqual(markers[0].severity, MarkerSeverity.Hint);
            assert.deepStrictEqual(markers[0].tags, [1 /* MarkerTag.Unnecessary */]);
            assert.ok(markers[0].message.startsWith(`Attribute 'model' is not supported in instructions files.`));
            assert.strictEqual(markers[1].message, `The 'applyTo' attribute must be a valid glob pattern.`);
        });
        test('invalid header structure (YAML array)', async () => {
            const content = [
                '---',
                '- item1',
                '---',
                'Body',
            ].join('\n');
            const markers = await validate(content, PromptsType.instructions);
            assert.strictEqual(markers.length, 1);
            assert.strictEqual(markers[0].message, 'Invalid header, expecting <key: value> pairs');
        });
        test('name attribute validation in instructions', async () => {
            // Valid name
            {
                const content = [
                    '---',
                    'name: "MyInstructions"',
                    'description: "Test instructions"',
                    'applyTo: "**/*.ts"',
                    '---',
                    'Body',
                ].join('\n');
                const markers = await validate(content, PromptsType.instructions);
                assert.deepStrictEqual(markers, [], 'Valid name should not produce errors');
            }
            // Empty name
            {
                const content = [
                    '---',
                    'name: ""',
                    'description: "Test instructions"',
                    'applyTo: "**/*.ts"',
                    '---',
                    'Body',
                ].join('\n');
                const markers = await validate(content, PromptsType.instructions);
                assert.strictEqual(markers.length, 1);
                assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
                assert.strictEqual(markers[0].message, `The 'name' attribute must not be empty.`);
            }
        });
    });
    suite('prompts', () => {
        test('prompt valid with agent mode (default) and tools and a BYO model', async () => {
            // mode omitted -> defaults to Agent; tools+model should validate; model MAE 4 is agent capable
            const content = [
                '---',
                'description: "Prompt with tools"',
                'model: MAE 4.1',
                `tools: ['tool1','tool2']`,
                '---',
                'Body'
            ].join('\n');
            const markers = await validate(content, PromptsType.prompt);
            assert.deepStrictEqual(markers, []);
        });
        test('prompt model not suited for agent mode', async () => {
            // MAE 3.5 Turbo lacks agentMode capability -> warning when used in agent (default)
            const content = [
                '---',
                'description: "Prompt with unsuitable model"',
                'model: MAE 3.5 Turbo',
                '---',
                'Body'
            ].join('\n');
            const markers = await validate(content, PromptsType.prompt);
            assert.strictEqual(markers.length, 1, 'Expected one warning about unsuitable model');
            assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
            assert.strictEqual(markers[0].message, `Model 'MAE 3.5 Turbo' is not suited for agent mode.`);
        });
        test('prompt with custom agent BeastMode and tools', async () => {
            // Explicit custom agent should be recognized; BeastMode kind comes from setup; ensure tools accepted
            const content = [
                '---',
                'description: "Prompt custom mode"',
                'agent: BeastMode',
                `tools: ['tool1']`,
                '---',
                'Body'
            ].join('\n');
            const markers = await validate(content, PromptsType.prompt);
            assert.deepStrictEqual(markers, []);
        });
        test('prompt with custom mode BeastMode and tools', async () => {
            // Explicit custom mode should be recognized; BeastMode kind comes from setup; ensure tools accepted
            const content = [
                '---',
                'description: "Prompt custom mode"',
                'mode: BeastMode',
                `tools: ['tool1']`,
                '---',
                'Body'
            ].join('\n');
            const markers = await validate(content, PromptsType.prompt);
            assert.strictEqual(markers.length, 1);
            assert.deepStrictEqual(markers.map(m => m.message), [`The 'mode' attribute has been deprecated. Please rename it to 'agent'.`]);
        });
        test('prompt with custom mode an agent', async () => {
            // Explicit custom mode should be recognized; BeastMode kind comes from setup; ensure tools accepted
            const content = [
                '---',
                'description: "Prompt custom mode"',
                'mode: BeastMode',
                `agent: agent`,
                '---',
                'Body'
            ].join('\n');
            const markers = await validate(content, PromptsType.prompt);
            assert.strictEqual(markers.length, 1);
            assert.deepStrictEqual(markers.map(m => m.message), [`The 'mode' attribute has been deprecated. The 'agent' attribute is used instead.`]);
        });
        test('prompt with unknown agent Ask', async () => {
            const content = [
                '---',
                'description: "Prompt unknown agent Ask"',
                'agent: Ask',
                `tools: ['tool1','tool2']`,
                '---',
                'Body'
            ].join('\n');
            const markers = await validate(content, PromptsType.prompt);
            assert.strictEqual(markers.length, 1, 'Expected one warning about tools in non-agent mode');
            assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
            assert.strictEqual(markers[0].message, `Unknown agent 'Ask'. Available agents: agent, ask, edit, BeastMode.`);
        });
        test('prompt with agent edit', async () => {
            const content = [
                '---',
                'description: "Prompt edit mode with tool"',
                'agent: edit',
                `tools: ['tool1']`,
                '---',
                'Body'
            ].join('\n');
            const markers = await validate(content, PromptsType.prompt);
            assert.strictEqual(markers.length, 1);
            assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
            assert.strictEqual(markers[0].message, `The 'tools' attribute is only supported when using agents. Attribute will be ignored.`);
        });
        test('name attribute validation in prompts', async () => {
            // Valid name
            {
                const content = [
                    '---',
                    'name: "MyPrompt"',
                    'description: "Test prompt"',
                    '---',
                    'Body',
                ].join('\n');
                const markers = await validate(content, PromptsType.prompt);
                assert.deepStrictEqual(markers, [], 'Valid name should not produce errors');
            }
            // Empty name
            {
                const content = [
                    '---',
                    'name: ""',
                    'description: "Test prompt"',
                    '---',
                    'Body',
                ].join('\n');
                const markers = await validate(content, PromptsType.prompt);
                assert.strictEqual(markers.length, 1);
                assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
                assert.strictEqual(markers[0].message, `The 'name' attribute must not be empty.`);
            }
        });
    });
    suite('body', () => {
        test('body with existing file references and known tools has no markers', async () => {
            const content = [
                '---',
                'description: "Refs"',
                '---',
                'Here is a #file:./reference1.md and a markdown [reference](./reference2.md) plus variables #tool1 and #tool2'
            ].join('\n');
            const markers = await validate(content, PromptsType.prompt);
            assert.deepStrictEqual(markers, [], 'Expected no validation issues');
        });
        test('body with missing file references reports warnings', async () => {
            const content = [
                '---',
                'description: "Missing Refs"',
                '---',
                'Here is a #file:./missing1.md and a markdown [missing link](./missing2.md).'
            ].join('\n');
            const markers = await validate(content, PromptsType.prompt);
            const messages = markers.map(m => m.message).sort();
            assert.deepStrictEqual(messages, [
                `File './missing1.md' not found at '/missing1.md'.`,
                `File './missing2.md' not found at '/missing2.md'.`
            ]);
        });
        test('body with http link', async () => {
            const content = [
                '---',
                'description: "HTTP Link"',
                '---',
                'Here is a [http link](http://example.com).'
            ].join('\n');
            const markers = await validate(content, PromptsType.prompt);
            assert.deepStrictEqual(markers, [], 'Expected no validation issues');
        });
        test('body with url link', async () => {
            const nonExistingRef = existingRef1.with({ path: '/nonexisting' });
            const content = [
                '---',
                'description: "URL Links"',
                '---',
                `Here is a [url link](${existingRef1.toString()}).`,
                `Here is a [url link](${nonExistingRef.toString()}).`
            ].join('\n');
            const markers = await validate(content, PromptsType.prompt);
            const messages = markers.map(m => m.message).sort();
            assert.deepStrictEqual(messages, [
                `File 'myFs://test/nonexisting' not found at '/nonexisting'.`,
            ]);
        });
        test('body with unknown tool variable reference is an unnecessary hint', async () => {
            const content = [
                '---',
                'description: "Unknown tool var"',
                '---',
                'This line references known #tool:tool1 and unknown #tool:toolX'
            ].join('\n');
            const markers = await validate(content, PromptsType.prompt);
            assert.strictEqual(markers.length, 1, 'Expected one diagnostic for unknown tool variable');
            assert.strictEqual(markers[0].severity, MarkerSeverity.Hint);
            assert.deepStrictEqual(markers[0].tags, [1 /* MarkerTag.Unnecessary */]);
            assert.strictEqual(markers[0].message, `Unknown tool or toolset 'toolX'.`);
        });
        test('body with tool not present in tools list', async () => {
            const content = [
                '---',
                'tools: []',
                '---',
                'I need',
                '#tool:ms-azuretools.vscode-azure-github-copilot/azure_recommend_custom_modes',
                '#tool:github.vscode-pull-request-github/suggest-fix',
                '#tool:openSimpleBrowser',
            ].join('\n');
            const markers = await validate(content, PromptsType.prompt);
            const actual = markers.sort((a, b) => a.startLineNumber - b.startLineNumber).map(m => ({ message: m.message, startColumn: m.startColumn, endColumn: m.endColumn }));
            assert.deepEqual(actual, [
                { message: `Unknown tool or toolset 'ms-azuretools.vscode-azure-github-copilot/azure_recommend_custom_modes'.`, startColumn: 7, endColumn: 77 },
                { message: `Tool or toolset 'github.vscode-pull-request-github/suggest-fix' also needs to be enabled in the header.`, startColumn: 7, endColumn: 52 },
                { message: `Tool or toolset 'openSimpleBrowser' has been renamed, use 'vscode/openIntegratedBrowser' instead.`, startColumn: 7, endColumn: 24 },
            ]);
        });
    });
    suite('skills', () => {
        test('skill name matches folder name', async () => {
            const content = [
                '---',
                'name: my-skill',
                'description: Test Skill',
                '---',
                'This is a skill.'
            ].join('\n');
            const markers = await validate(content, PromptsType.skill, URI.parse('file:///.github/skills/my-skill/SKILL.md'));
            assert.deepStrictEqual(markers, [], 'Expected no validation issues when name matches folder');
        });
        test('skill name does not match folder name', async () => {
            const content = [
                '---',
                'name: different-name',
                'description: Test Skill',
                '---',
                'This is a skill.'
            ].join('\n');
            const markers = await validate(content, PromptsType.skill, URI.parse('file:///.github/skills/my-skill/SKILL.md'));
            assert.strictEqual(markers.length, 1);
            assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
            assert.strictEqual(markers[0].message, `The skill name 'different-name' should match the folder name 'my-skill'.`);
        });
        test('skill without name attribute should error', async () => {
            const content = [
                '---',
                'description: Test Skill',
                '---',
                'This is a skill without a name.'
            ].join('\n');
            const markers = await validate(content, PromptsType.skill, URI.parse('file:///.github/skills/my-skill/SKILL.md'));
            assert.strictEqual(markers.length, 1);
            assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
            assert.strictEqual(markers[0].message, `Skill must provide a name.`);
        });
        test('skill with empty name should error', async () => {
            const content = [
                '---',
                'name: ""',
                'description: Test Skill',
                '---',
                'This is a skill.'
            ].join('\n');
            const markers = await validate(content, PromptsType.skill, URI.parse('file:///.github/skills/my-skill/SKILL.md'));
            assert.strictEqual(markers.length, 1);
            assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
            assert.strictEqual(markers[0].message, `The 'name' attribute must not be empty.`);
        });
        test('skill without description attribute should error', async () => {
            const content = [
                '---',
                'name: my-skill',
                '---',
                'This is a skill without a description.'
            ].join('\n');
            const markers = await validate(content, PromptsType.skill, URI.parse('file:///.github/skills/my-skill/SKILL.md'));
            assert.strictEqual(markers.length, 1);
            assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
            assert.strictEqual(markers[0].message, `Skill must provide a description.`);
        });
        test('skill with empty description should error', async () => {
            const content = [
                '---',
                'name: my-skill',
                'description: ""',
                '---',
                'This is a skill.'
            ].join('\n');
            const markers = await validate(content, PromptsType.skill, URI.parse('file:///.github/skills/my-skill/SKILL.md'));
            assert.strictEqual(markers.length, 1);
            assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
            assert.strictEqual(markers[0].message, `The 'description' attribute should not be empty.`);
        });
        test('skill name with invalid characters should error', async () => {
            const content = [
                '---',
                'name: My Skill',
                'description: Test Skill',
                '---',
                'This is a skill.'
            ].join('\n');
            const markers = await validate(content, PromptsType.skill, URI.parse('file:///.github/skills/my-skill/SKILL.md'));
            assert.ok(markers.some(m => m.severity === MarkerSeverity.Error && m.message === 'Skill name may only contain lowercase letters, numbers, and hyphens.'));
        });
        test('skill name with whitespace trimmed matches folder name', async () => {
            const content = [
                '---',
                'name: "  my-skill  "',
                'description: Test Skill',
                '---',
                'This is a skill.'
            ].join('\n');
            const markers = await validate(content, PromptsType.skill, URI.parse('file:///.github/skills/my-skill/SKILL.md'));
            assert.deepStrictEqual(markers, [], 'Expected no validation issues when trimmed name matches folder');
        });
        test('skill name validation with different folder depths', async () => {
            // Test with deeper path structure
            {
                const content = [
                    '---',
                    'name: advanced-skill',
                    'description: Test Skill',
                    '---',
                    'This is a skill.'
                ].join('\n');
                const markers = await validate(content, PromptsType.skill, URI.parse('file:///home/user/.github/skills/advanced-skill/SKILL.md'));
                assert.deepStrictEqual(markers, [], 'Expected no issues for deeper path when name matches');
            }
            // Test with mismatch in deeper path
            {
                const content = [
                    '---',
                    'name: wrong-name',
                    'description: Test Skill',
                    '---',
                    'This is a skill.'
                ].join('\n');
                const markers = await validate(content, PromptsType.skill, URI.parse('file:///home/user/.github/skills/correct-folder/SKILL.md'));
                assert.strictEqual(markers.length, 1);
                assert.strictEqual(markers[0].message, `The skill name 'wrong-name' should match the folder name 'correct-folder'.`);
            }
        });
        test('skill name validation with special characters in folder', async () => {
            const content = [
                '---',
                'name: my_special-skill.v2',
                'description: Test Skill',
                '---',
                'This is a skill.'
            ].join('\n');
            const markers = await validate(content, PromptsType.skill, URI.parse('file:///.github/skills/my_special-skill.v2/SKILL.md'));
            assert.ok(markers.some(m => m.severity === MarkerSeverity.Error && m.message === 'Skill name may only contain lowercase letters, numbers, and hyphens.'), 'Expected error for invalid characters in skill name');
        });
        test('skill with non-string name type does not validate folder match', async () => {
            const content = [
                '---',
                'name: []',
                'description: Test Skill',
                '---',
                'This is a skill.'
            ].join('\n');
            const markers = await validate(content, PromptsType.skill, URI.parse('file:///.github/skills/my-skill/SKILL.md'));
            // Should get error for non-string name type, but no folder mismatch warning
            assert.ok(markers.some(m => m.message.includes('must be a string')), 'Expected error for non-string name');
            assert.ok(!markers.some(m => m.message.includes('should match the folder name')), 'Should not warn about folder mismatch for non-string name');
        });
        test('skill folder name validation only for skill type', async () => {
            // Verify that folder name validation doesn't run for non-skill prompt types
            const content = [
                '---',
                'name: different-name',
                'description: Test Agent',
                '---',
                'This is an agent.'
            ].join('\n');
            const markers = await validate(content, PromptsType.agent, URI.parse('file:///.github/agents/my-agent/AGENT.md'));
            // Should not get folder name mismatch warning for agents
            assert.ok(!markers.some(m => m.message.includes('should match the folder name')), 'Should not validate folder names for agents');
        });
        test('skill with unknown attributes shows unnecessary hints', async () => {
            const content = [
                '---',
                'name: my-skill',
                'description: Test Skill',
                'unknownAttr: value',
                'anotherUnknown: 123',
                '---',
                'This is a skill.'
            ].join('\n');
            const markers = await validate(content, PromptsType.skill, URI.parse('file:///.github/skills/my-skill/SKILL.md'));
            assert.strictEqual(markers.length, 2);
            assert.ok(markers.every(m => m.severity === MarkerSeverity.Hint));
            assert.ok(markers.every(m => JSON.stringify(m.tags) === JSON.stringify([1 /* MarkerTag.Unnecessary */])));
            assert.ok(markers.some(m => m.message.includes('unknownAttr')));
            assert.ok(markers.some(m => m.message.includes('anotherUnknown')));
            assert.ok(markers.every(m => m.message.includes('Supported: ')));
        });
        test('skill with user-invocable: false is valid', async () => {
            const content = [
                '---',
                'name: my-skill',
                'description: Background knowledge skill',
                'user-invocable: false',
                '---',
                'This skill provides background context.'
            ].join('\n');
            const markers = await validate(content, PromptsType.skill, URI.parse('file:///.github/skills/my-skill/SKILL.md'));
            assert.deepStrictEqual(markers, [], 'user-invocable: false should be valid for skills');
        });
        test('skill with user-invocable: true is valid', async () => {
            const content = [
                '---',
                'name: my-skill',
                'description: User-accessible skill',
                'user-invocable: true',
                '---',
                'This skill can be invoked by users.'
            ].join('\n');
            const markers = await validate(content, PromptsType.skill, URI.parse('file:///.github/skills/my-skill/SKILL.md'));
            assert.deepStrictEqual(markers, [], 'user-invocable: true should be valid for skills');
        });
        test('skill with invalid user-invocable value shows error', async () => {
            // String value instead of boolean
            {
                const content = [
                    '---',
                    'name: my-skill',
                    'description: Test Skill',
                    'user-invocable: "false"',
                    '---',
                    'Body'
                ].join('\n');
                const markers = await validate(content, PromptsType.skill, URI.parse('file:///.github/skills/my-skill/SKILL.md'));
                assert.strictEqual(markers.length, 1);
                assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
                assert.strictEqual(markers[0].message, `The 'user-invocable' attribute must be 'true' or 'false'.`);
            }
            // Number value instead of boolean
            {
                const content = [
                    '---',
                    'name: my-skill',
                    'description: Test Skill',
                    'user-invocable: 0',
                    '---',
                    'Body'
                ].join('\n');
                const markers = await validate(content, PromptsType.skill, URI.parse('file:///.github/skills/my-skill/SKILL.md'));
                assert.strictEqual(markers.length, 1);
                assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
                assert.strictEqual(markers[0].message, `The 'user-invocable' attribute must be 'true' or 'false'.`);
            }
        });
        test('skill with disable-model-invocation: true is valid', async () => {
            const content = [
                '---',
                'name: my-skill',
                'description: Manual-only skill',
                'disable-model-invocation: true',
                '---',
                'This skill must be triggered manually with /name.'
            ].join('\n');
            const markers = await validate(content, PromptsType.skill, URI.parse('file:///.github/skills/my-skill/SKILL.md'));
            assert.deepStrictEqual(markers, [], 'disable-model-invocation: true should be valid for skills');
        });
        test('skill with disable-model-invocation: false is valid', async () => {
            const content = [
                '---',
                'name: my-skill',
                'description: Auto-loadable skill',
                'disable-model-invocation: false',
                '---',
                'This skill can be loaded automatically by the agent.'
            ].join('\n');
            const markers = await validate(content, PromptsType.skill, URI.parse('file:///.github/skills/my-skill/SKILL.md'));
            assert.deepStrictEqual(markers, [], 'disable-model-invocation: false should be valid for skills');
        });
        test('skill with invalid disable-model-invocation value shows error', async () => {
            // String value instead of boolean
            {
                const content = [
                    '---',
                    'name: my-skill',
                    'description: Test Skill',
                    'disable-model-invocation: "true"',
                    '---',
                    'Body'
                ].join('\n');
                const markers = await validate(content, PromptsType.skill, URI.parse('file:///.github/skills/my-skill/SKILL.md'));
                assert.strictEqual(markers.length, 1);
                assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
                assert.strictEqual(markers[0].message, `The 'disable-model-invocation' attribute must be 'true' or 'false'.`);
            }
            // Number value instead of boolean
            {
                const content = [
                    '---',
                    'name: my-skill',
                    'description: Test Skill',
                    'disable-model-invocation: 1',
                    '---',
                    'Body'
                ].join('\n');
                const markers = await validate(content, PromptsType.skill, URI.parse('file:///.github/skills/my-skill/SKILL.md'));
                assert.strictEqual(markers.length, 1);
                assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
                assert.strictEqual(markers[0].message, `The 'disable-model-invocation' attribute must be 'true' or 'false'.`);
            }
        });
        test('skill with argument-hint is valid', async () => {
            const content = [
                '---',
                'name: my-skill',
                'description: Skill with argument hint',
                'argument-hint: "[issue-number]"',
                '---',
                'This skill expects an issue number.'
            ].join('\n');
            const markers = await validate(content, PromptsType.skill, URI.parse('file:///.github/skills/my-skill/SKILL.md'));
            assert.deepStrictEqual(markers, [], 'argument-hint should be valid for skills');
        });
        test('skill with empty argument-hint shows warning', async () => {
            const content = [
                '---',
                'name: my-skill',
                'description: Test Skill',
                'argument-hint: ""',
                '---',
                'Body'
            ].join('\n');
            const markers = await validate(content, PromptsType.skill, URI.parse('file:///.github/skills/my-skill/SKILL.md'));
            assert.strictEqual(markers.length, 1);
            assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
            assert.strictEqual(markers[0].message, `The 'argument-hint' attribute should not be empty.`);
        });
        test('skill with non-string argument-hint shows error', async () => {
            const content = [
                '---',
                'name: my-skill',
                'description: Test Skill',
                'argument-hint: []',
                '---',
                'Body'
            ].join('\n');
            const markers = await validate(content, PromptsType.skill, URI.parse('file:///.github/skills/my-skill/SKILL.md'));
            assert.strictEqual(markers.length, 1);
            assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
            assert.strictEqual(markers[0].message, `The 'argument-hint' attribute must be a string.`);
        });
        test('skill with all visibility attributes combined is valid', async () => {
            const content = [
                '---',
                'name: my-skill',
                'description: Complex visibility skill',
                'user-invocable: false',
                'disable-model-invocation: true',
                'argument-hint: "[optional-arg]"',
                '---',
                'This skill has complex visibility settings.'
            ].join('\n');
            const markers = await validate(content, PromptsType.skill, URI.parse('file:///.github/skills/my-skill/SKILL.md'));
            assert.deepStrictEqual(markers, [], 'All visibility attributes combined should be valid');
        });
    });
    suite('claude rules', () => {
        // Helper URI for Claude rules — file must be under .claude/rules/ for target detection
        const claudeRulesUri = URI.parse('myFs://test/.claude/rules/my-rule.md');
        test('valid claude rules with paths attribute', async () => {
            const content = [
                '---',
                'description: "TypeScript rules"',
                `paths: ['**/*.ts', '**/*.tsx']`,
                '---',
                'Always use strict mode.',
            ].join('\n');
            const markers = await validate(content, PromptsType.instructions, claudeRulesUri);
            assert.deepStrictEqual(markers, []);
        });
        test('valid claude rules without paths attribute', async () => {
            const content = [
                '---',
                'description: "General rules"',
                '---',
                'Follow coding guidelines.',
            ].join('\n');
            const markers = await validate(content, PromptsType.instructions, claudeRulesUri);
            assert.deepStrictEqual(markers, []);
        });
        test('claude rules paths must be an array', async () => {
            const content = [
                '---',
                'description: "Rules"',
                'paths: "**/*.ts"',
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.instructions, claudeRulesUri);
            assert.strictEqual(markers.length, 1);
            assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
            assert.strictEqual(markers[0].message, `The 'paths' attribute must be an array of glob patterns.`);
        });
        test('claude rules with unknown attribute shows unnecessary hint', async () => {
            const content = [
                '---',
                'description: "Rules"',
                'applyTo: "**/*.ts"',
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.instructions, claudeRulesUri);
            assert.strictEqual(markers.length, 1);
            assert.strictEqual(markers[0].severity, MarkerSeverity.Hint);
            assert.deepStrictEqual(markers[0].tags, [1 /* MarkerTag.Unnecessary */]);
            assert.ok(markers[0].message.includes(`Attribute 'applyTo' is not supported in rules files by VS Code agents.`));
        });
        test('claude rules with multiple validation errors', async () => {
            const content = [
                '---',
                'description: ""',
                `paths: ['', 123]`,
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.instructions, claudeRulesUri);
            assert.deepStrictEqual(markers.map(m => ({ severity: m.severity, message: m.message })), [
                { severity: MarkerSeverity.Error, message: `The 'description' attribute should not be empty.` },
                { severity: MarkerSeverity.Error, message: `Path entries must be non-empty glob patterns.` },
            ]);
        });
        test('claude rules in subdirectory', async () => {
            const subDirUri = URI.parse('myFs://test/.claude/rules/sub/deep-rule.md');
            const content = [
                '---',
                'description: "Nested rules"',
                `paths: ['src/**/*.ts']`,
                '---',
                'Nested rule content.',
            ].join('\n');
            const markers = await validate(content, PromptsType.instructions, subDirUri);
            assert.deepStrictEqual(markers, []);
        });
    });
    suite('claude agents', () => {
        // Helper URI for Claude agents — file must be under .claude/agents/ for target detection
        const claudeAgentUri = URI.parse('myFs://test/.claude/agents/test.agent.md');
        test('valid Claude agent with all common attributes', async () => {
            const content = [
                '---',
                'name: security-reviewer',
                'description: Reviews code for security vulnerabilities',
                `tools: ['Edit', 'Grep', 'AskUserQuestion', 'WebFetch']`,
                'model: opus',
                'permissionMode: delegate',
                '---',
                'You are a senior security engineer.',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent, claudeAgentUri);
            assert.deepStrictEqual(markers, []);
        });
        test('valid Claude agent with minimal attributes', async () => {
            const content = [
                '---',
                'name: helper',
                'description: A simple helper agent',
                '---',
                'You help with tasks.',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent, claudeAgentUri);
            assert.deepStrictEqual(markers, []);
        });
        test('Claude agent with valid model values', async () => {
            // Each known Claude model should be valid
            for (const modelName of ['sonnet', 'opus', 'haiku', 'inherit']) {
                const content = [
                    '---',
                    'name: test-agent',
                    'description: Test',
                    `model: ${modelName}`,
                    '---',
                ].join('\n');
                const markers = await validate(content, PromptsType.agent, claudeAgentUri);
                assert.deepStrictEqual(markers, [], `Model '${modelName}' should be valid`);
            }
        });
        test('Claude agent with unknown model value', async () => {
            const content = [
                '---',
                'name: test-agent',
                'description: Test',
                'model: gpt-4',
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent, claudeAgentUri);
            assert.strictEqual(markers.length, 1);
            assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
            assert.strictEqual(markers[0].message, `Unknown value 'gpt-4', valid: sonnet, opus, haiku, inherit.`);
        });
        test('Claude agent with non-string model value', async () => {
            const content = [
                '---',
                'name: test-agent',
                'description: Test',
                'model: []',
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent, claudeAgentUri);
            assert.strictEqual(markers.length, 1);
            assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
            assert.strictEqual(markers[0].message, `The 'model' attribute must be a string.`);
        });
        test('Claude agent with valid permissionMode values', async () => {
            for (const mode of ['default', 'acceptEdits', 'plan', 'delegate', 'dontAsk', 'bypassPermissions']) {
                const content = [
                    '---',
                    'name: test-agent',
                    'description: Test',
                    `permissionMode: ${mode}`,
                    '---',
                ].join('\n');
                const markers = await validate(content, PromptsType.agent, claudeAgentUri);
                assert.deepStrictEqual(markers, [], `permissionMode '${mode}' should be valid`);
            }
        });
        test('Claude agent with unknown permissionMode value', async () => {
            const content = [
                '---',
                'name: test-agent',
                'description: Test',
                'model: sonnet',
                'permissionMode: allowAll',
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent, claudeAgentUri);
            assert.strictEqual(markers.length, 1);
            assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
            assert.strictEqual(markers[0].message, `Unknown value 'allowAll', valid: default, acceptEdits, plan, delegate, dontAsk, bypassPermissions.`);
        });
        test('Claude agent with valid memory values', async () => {
            for (const mem of ['user', 'project', 'local']) {
                const content = [
                    '---',
                    'name: test-agent',
                    'description: Test',
                    `memory: ${mem}`,
                    '---',
                ].join('\n');
                const markers = await validate(content, PromptsType.agent, claudeAgentUri);
                assert.deepStrictEqual(markers, [], `memory '${mem}' should be valid`);
            }
        });
        test('Claude agent with unknown memory value', async () => {
            const content = [
                '---',
                'name: test-agent',
                'description: Test',
                'model: sonnet',
                'permissionMode: default',
                'memory: global',
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent, claudeAgentUri);
            assert.strictEqual(markers.length, 1);
            assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
            assert.strictEqual(markers[0].message, `Unknown value 'global', valid: user, project, local.`);
        });
        test('Claude agent with empty name shows error', async () => {
            const content = [
                '---',
                'name: ""',
                'description: Test',
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent, claudeAgentUri);
            assert.strictEqual(markers.length, 1);
            assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
            assert.strictEqual(markers[0].message, `The 'name' attribute must not be empty.`);
        });
        test('Claude agent with empty description shows error', async () => {
            const content = [
                '---',
                'name: test-agent',
                'description: ""',
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent, claudeAgentUri);
            assert.strictEqual(markers.length, 1);
            assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
            assert.strictEqual(markers[0].message, `The 'description' attribute should not be empty.`);
        });
        test('Claude agent with unknown attributes does not warn', async () => {
            // Claude target ignores unknown attributes since we don't have a full list
            const content = [
                '---',
                'name: test-agent',
                'description: Test',
                'customAttribute: someValue',
                'anotherCustom: 123',
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent, claudeAgentUri);
            assert.deepStrictEqual(markers, [], 'Unknown attributes should be silently ignored for Claude agents');
        });
        test('Claude agent tools are not validated against VS Code tool registry', async () => {
            // Claude tool names (Edit, Grep, etc.) don't exist in VS Code's tool registry
            // but should not produce warnings for Claude target
            const content = [
                '---',
                'name: test-agent',
                'description: Test',
                `tools: ['Edit', 'Grep', 'UnknownClaudeTool', 'WebFetch']`,
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent, claudeAgentUri);
            assert.deepStrictEqual(markers, [], 'Claude tools should not be validated against VS Code registry');
        });
        test('Claude agent with comma-separated tools string', async () => {
            const content = [
                '---',
                'name: security-reviewer',
                'description: Reviews code',
                'tools: Edit, Grep, AskUserQuestion, WebFetch',
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent, claudeAgentUri);
            assert.deepStrictEqual(markers, [], 'Comma-separated tools string should be valid for Claude');
        });
        test('Claude agent does not validate handoffs or agents attributes', async () => {
            // handoffs and agents are VS Code-specific; they shouldn't be validated for Claude
            const content = [
                '---',
                'name: test-agent',
                'description: Test',
                'model: opus',
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent, claudeAgentUri);
            assert.deepStrictEqual(markers, []);
        });
        test('Claude agent full realistic example', async () => {
            const content = [
                '---',
                'name: security-reviewer',
                'description: Reviews code for security vulnerabilities',
                `tools: ['Edit', 'Grep', 'AskUserQuestion', 'WebFetch']`,
                'model: opus',
                'permissionMode: delegate',
                'memory: project',
                '---',
                'You are a senior security engineer.',
                'Review the code for common vulnerabilities.',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent, claudeAgentUri);
            assert.deepStrictEqual(markers, []);
        });
        test('Claude agent with multiple validation errors', async () => {
            const content = [
                '---',
                'name: ""',
                'description: ""',
                'model: unknown-model',
                'permissionMode: invalid-mode',
                '---',
            ].join('\n');
            const markers = await validate(content, PromptsType.agent, claudeAgentUri);
            assert.deepStrictEqual(markers.map(m => ({ severity: m.severity, message: m.message })), [
                { severity: MarkerSeverity.Error, message: `The 'name' attribute must not be empty.` },
                { severity: MarkerSeverity.Error, message: `The 'description' attribute should not be empty.` },
                { severity: MarkerSeverity.Warning, message: `Unknown value 'unknown-model', valid: sonnet, opus, haiku, inherit.` },
                { severity: MarkerSeverity.Warning, message: `Unknown value 'invalid-mode', valid: default, acceptEdits, plan, delegate, dontAsk, bypassPermissions.` },
            ]);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvbXB0VmFsaWRhdG9yLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L3Rlc3QvYnJvd3Nlci9wcm9tcHRTeW50YXgvbGFuZ3VhZ2VQcm92aWRlcnMvcHJvbXB0VmFsaWRhdG9yLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBRTVCLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUN0RSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDOUQsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDekcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sdUVBQXVFLENBQUM7QUFDMUcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0scUZBQXFGLENBQUM7QUFDL0gsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDcEcsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBRW5GLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUNwRixPQUFPLEVBQWUsY0FBYyxFQUFhLE1BQU0seURBQXlELENBQUM7QUFDakgsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDeEcsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDbkcsT0FBTyxFQUFFLFFBQVEsRUFBRSxjQUFjLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUM3RixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUN2RixPQUFPLEVBQUUs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