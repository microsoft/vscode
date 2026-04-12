/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { CancellationToken } from '../../../../../../../base/common/cancellation.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { Range } from '../../../../../../../editor/common/core/range.js';
import { createTextModel } from '../../../../../../../editor/test/common/testTextModel.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../../../platform/contextkey/browser/contextKeyService.js';
import { IMarkerService } from '../../../../../../../platform/markers/common/markers.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { ChatConfiguration } from '../../../../common/constants.js';
import { ILanguageModelToolsService, ToolDataSource } from '../../../../common/tools/languageModelToolsService.js';
import { LanguageModelToolsService } from '../../../../browser/tools/languageModelToolsService.js';
import { IPromptsService } from '../../../../common/promptSyntax/service/promptsService.js';
import { getLanguageIdForPromptsType, PromptsType } from '../../../../common/promptSyntax/promptTypes.js';
import { getPromptFileExtension } from '../../../../common/promptSyntax/config/promptFileLocations.js';
import { PromptFileParser } from '../../../../common/promptSyntax/promptFileParser.js';
import { PromptCodeActionProvider } from '../../../../common/promptSyntax/languageProviders/promptCodeActions.js';
import { IFileService } from '../../../../../../../platform/files/common/files.js';
import { CodeActionKind } from '../../../../../../../editor/contrib/codeAction/common/types.js';
suite('PromptCodeActionProvider', () => {
    const disposables = ensureNoDisposablesAreLeakedInTestSuite();
    let instaService;
    let codeActionProvider;
    let fileService;
    setup(async () => {
        const testConfigService = new TestConfigurationService();
        testConfigService.setUserConfiguration(ChatConfiguration.ExtensionToolsEnabled, true);
        instaService = workbenchInstantiationService({
            contextKeyService: () => disposables.add(new ContextKeyService(testConfigService)),
            configurationService: () => testConfigService
        }, disposables);
        const toolService = disposables.add(instaService.createInstance(LanguageModelToolsService));
        // Register test tools including deprecated ones
        const testTool1 = { id: 'testTool1', displayName: 'tool1', canBeReferencedInPrompt: true, modelDescription: 'Test Tool 1', source: ToolDataSource.External, inputSchema: {} };
        disposables.add(toolService.registerToolData(testTool1));
        const deprecatedTool = { id: 'oldTool', displayName: 'oldTool', canBeReferencedInPrompt: true, modelDescription: 'Deprecated Tool', source: ToolDataSource.External, inputSchema: {} };
        disposables.add(toolService.registerToolData(deprecatedTool));
        // Mock deprecated tool names
        toolService.getDeprecatedFullReferenceNames = () => {
            const map = new Map();
            map.set('oldTool', new Set(['newTool1', 'newTool2']));
            map.set('singleDeprecated', new Set(['singleReplacement']));
            return map;
        };
        instaService.set(ILanguageModelToolsService, toolService);
        instaService.stub(IMarkerService, { read: () => [] });
        fileService = {
            canMove: async (source, target) => {
                // Mock file service that allows moves for testing
                return true;
            }
        };
        instaService.set(IFileService, fileService);
        const parser = new PromptFileParser();
        instaService.stub(IPromptsService, {
            getParsedPromptFile(model) {
                return parser.parse(model.uri, model.getValue());
            },
            getAgentFileURIFromModeFile(uri) {
                // Mock conversion from .chatmode.md to .agent.md
                if (uri.path.endsWith('.chatmode.md')) {
                    return uri.with({ path: uri.path.replace('.chatmode.md', '.agent.md') });
                }
                return undefined;
            }
        });
        codeActionProvider = instaService.createInstance(PromptCodeActionProvider);
    });
    async function getCodeActions(content, line, column, promptType, fileExtension) {
        const languageId = getLanguageIdForPromptsType(promptType);
        const uri = URI.parse('test:///test' + (fileExtension ?? getPromptFileExtension(promptType)));
        const model = disposables.add(createTextModel(content, languageId, undefined, uri));
        const range = new Range(line, column, line, column);
        const context = { trigger: 1 /* CodeActionTriggerType.Invoke */ };
        const result = await codeActionProvider.provideCodeActions(model, range, context, CancellationToken.None);
        if (!result || result.actions.length === 0) {
            return [];
        }
        for (const action of result.actions) {
            assert.equal(action.kind, CodeActionKind.QuickFix.value);
        }
        return result.actions.map(action => ({
            title: action.title,
            textEdits: action.edit?.edits?.filter((edit) => 'textEdit' in edit),
            fileEdits: action.edit?.edits?.filter((edit) => 'oldResource' in edit)
        }));
    }
    suite('agent code actions', () => {
        test('no code actions for instructions files', async () => {
            const content = [
                '---',
                'description: "Test instruction"',
                'applyTo: "**/*.ts"',
                '---',
            ].join('\n');
            const actions = await getCodeActions(content, 2, 1, PromptsType.instructions);
            assert.strictEqual(actions.length, 0);
        });
        test('migrate mode file to agent file', async () => {
            const content = [
                '---',
                'name: "Test Mode"',
                'description: "Test mode file"',
                '---',
            ].join('\n');
            const actions = await getCodeActions(content, 1, 1, PromptsType.agent, '.chatmode.md');
            assert.strictEqual(actions.length, 1);
            assert.strictEqual(actions[0].title, `Migrate to custom agent file`);
        });
        test('update deprecated tool names - single replacement', async () => {
            const content = [
                '---',
                'description: "Test"',
                'target: vscode',
                `tools: ['singleDeprecated']`,
                '---',
            ].join('\n');
            const actions = await getCodeActions(content, 4, 10, PromptsType.agent);
            assert.strictEqual(actions.length, 1);
            assert.strictEqual(actions[0].title, `Update to 'singleReplacement'`);
            assert.ok(actions[0].textEdits);
            assert.strictEqual(actions[0].textEdits.length, 1);
            assert.strictEqual(actions[0].textEdits[0].textEdit.text, `'singleReplacement'`);
        });
        test('update deprecated tool names - multiple replacements', async () => {
            const content = [
                '---',
                'description: "Test"',
                'target: vscode',
                `tools: ['oldTool']`,
                '---',
            ].join('\n');
            const actions = await getCodeActions(content, 4, 10, PromptsType.agent);
            assert.strictEqual(actions.length, 1);
            assert.strictEqual(actions[0].title, `Expand to 2 tools`);
            assert.ok(actions[0].textEdits);
            assert.strictEqual(actions[0].textEdits.length, 1);
            assert.strictEqual(actions[0].textEdits[0].textEdit.text, `'newTool1','newTool2'`);
        });
        test('update all deprecated tool names', async () => {
            const content = [
                '---',
                'description: "Test"',
                'target: vscode',
                `tools: ['oldTool', 'singleDeprecated', 'validTool']`,
                '---',
            ].join('\n');
            const actions = await getCodeActions(content, 4, 8, PromptsType.agent); // Position at the bracket
            assert.strictEqual(actions.length, 1);
            assert.strictEqual(actions[0].title, `Update all tool names`);
            assert.ok(actions[0].textEdits);
            assert.strictEqual(actions[0].textEdits.length, 2); // Only deprecated tools are updated
        });
        test('handles double quotes in tool names', async () => {
            const content = [
                '---',
                'description: "Test"',
                'target: vscode',
                `tools: ["singleDeprecated"]`,
                '---',
            ].join('\n');
            const actions = await getCodeActions(content, 4, 10, PromptsType.agent);
            assert.strictEqual(actions.length, 1);
            assert.strictEqual(actions[0].title, `Update to 'singleReplacement'`);
            assert.ok(actions[0].textEdits);
            assert.strictEqual(actions[0].textEdits[0].textEdit.text, `"singleReplacement"`);
        });
        test('handles unquoted tool names', async () => {
            const content = [
                '---',
                'description: "Test"',
                'target: vscode',
                'tools: [singleDeprecated]', // No quotes
                '---',
            ].join('\n');
            const actions = await getCodeActions(content, 4, 10, PromptsType.agent);
            assert.strictEqual(actions.length, 1);
            assert.strictEqual(actions[0].title, `Update to 'singleReplacement'`);
            assert.ok(actions[0].textEdits);
            assert.strictEqual(actions[0].textEdits[0].textEdit.text, `singleReplacement`); // No quotes preserved
        });
        test('no code actions when range not in tools array', async () => {
            const content = [
                '---',
                'description: "Test"',
                'target: vscode',
                `tools: ['singleDeprecated']`,
                '---',
            ].join('\n');
            const actions = await getCodeActions(content, 2, 1, PromptsType.agent); // Range in description, not tools
            assert.strictEqual(actions.length, 0);
        });
    });
    suite('prompt code actions', () => {
        test('rename mode to agent', async () => {
            const content = [
                '---',
                'description: "Test"',
                'mode: edit',
                '---',
            ].join('\n');
            const actions = await getCodeActions(content, 3, 1, PromptsType.prompt);
            assert.strictEqual(actions.length, 1);
            assert.strictEqual(actions[0].title, `Rename to 'agent'`);
            assert.ok(actions[0].textEdits);
            assert.strictEqual(actions[0].textEdits.length, 1);
            assert.strictEqual(actions[0].textEdits[0].textEdit.text, 'agent');
        });
        test('update deprecated tool names in prompt', async () => {
            const content = [
                '---',
                'description: "Test"',
                `tools: ['singleDeprecated']`,
                '---',
            ].join('\n');
            const actions = await getCodeActions(content, 3, 10, PromptsType.prompt);
            assert.strictEqual(actions.length, 1);
            assert.strictEqual(actions[0].title, `Update to 'singleReplacement'`);
            assert.ok(actions[0].textEdits);
            assert.strictEqual(actions[0].textEdits.length, 1);
            assert.strictEqual(actions[0].textEdits[0].textEdit.text, `'singleReplacement'`);
        });
        test('no code actions when range not in mode attribute', async () => {
            const content = [
                '---',
                'description: "Test"',
                'mode: edit',
                '---',
            ].join('\n');
            const actions = await getCodeActions(content, 2, 1, PromptsType.prompt); // Range in description, not mode
            assert.strictEqual(actions.length, 0);
        });
        test('both mode and tools code actions available', async () => {
            const content = [
                '---',
                'description: "Test"',
                'mode: edit',
                `tools: ['singleDeprecated']`,
                '---',
            ].join('\n');
            // Test mode action
            const modeActions = await getCodeActions(content, 3, 1, PromptsType.prompt);
            assert.strictEqual(modeActions.length, 1);
            assert.strictEqual(modeActions[0].title, `Rename to 'agent'`);
            // Test tools action
            const toolActions = await getCodeActions(content, 4, 10, PromptsType.prompt);
            assert.strictEqual(toolActions.length, 1);
            assert.strictEqual(toolActions[0].title, `Update to 'singleReplacement'`);
        });
    });
    test('returns undefined when no code actions available', async () => {
        const content = [
            '---',
            'description: "Test"',
            'target: vscode',
            `tools: ['validTool']`, // No deprecated tools
            '---',
        ].join('\n');
        const actions = await getCodeActions(content, 4, 10, PromptsType.agent);
        assert.strictEqual(actions.length, 0);
    });
    test('uses comma-space delimiter when separator includes comma', async () => {
        const content = [
            '---',
            'description: "Test"',
            'target: vscode',
            `tools: ['oldTool', 'validTool']`,
            '---',
        ].join('\n');
        const actions = await getCodeActions(content, 4, 10, PromptsType.agent);
        assert.strictEqual(actions.length, 1);
        assert.strictEqual(actions[0].title, `Expand to 2 tools`);
        assert.ok(actions[0].textEdits);
        assert.strictEqual(actions[0].textEdits[0].textEdit.text, `'newTool1', 'newTool2'`);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvbXB0Q29kZUFjdGlvbnMudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL3Byb21wdFN5bnRheC9sYW5ndWFnZVByb3ZpZGVycy9wcm9tcHRDb2RlQWN0aW9ucy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNyRixPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDOUQsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDekcsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBRXpFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUUzRixPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxxRkFBcUYsQ0FBQztBQUMvSCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx1RUFBdUUsQ0FBQztBQUUxRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0seURBQXlELENBQUM7QUFDekYsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDeEcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDcEUsT0FBTyxFQUFFLDBCQUEwQixFQUFhLGNBQWMsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQzlILE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwyREFBMkQsQ0FBQztBQUM1RixPQUFPLEVBQUUsMkJBQTJCLEVBQUUsV0FBVyxF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