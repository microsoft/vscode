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
import { ChatConfiguration } from '../../../../common/constants.js';
import { ILanguageModelToolsService, ToolDataSource } from '../../../../common/tools/languageModelToolsService.js';
import { PromptBodyAutocompletion } from '../../../../common/promptSyntax/languageProviders/promptBodyAutocompletion.js';
import { createTextModel } from '../../../../../../../editor/test/common/testTextModel.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { getLanguageIdForPromptsType, PromptsType } from '../../../../common/promptSyntax/promptTypes.js';
import { getPromptFileExtension } from '../../../../common/promptSyntax/config/promptFileLocations.js';
import { IFileService } from '../../../../../../../platform/files/common/files.js';
import { FileService } from '../../../../../../../platform/files/common/fileService.js';
import { VSBuffer } from '../../../../../../../base/common/buffer.js';
import { InMemoryFileSystemProvider } from '../../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { ILogService, NullLogService } from '../../../../../../../platform/log/common/log.js';
import { Range } from '../../../../../../../editor/common/core/range.js';
suite('PromptBodyAutocompletion', () => {
    const disposables = ensureNoDisposablesAreLeakedInTestSuite();
    let instaService;
    let completionProvider;
    setup(async () => {
        const testConfigService = new TestConfigurationService();
        testConfigService.setUserConfiguration(ChatConfiguration.ExtensionToolsEnabled, true);
        instaService = workbenchInstantiationService({
            contextKeyService: () => disposables.add(new ContextKeyService(testConfigService)),
            configurationService: () => testConfigService
        }, disposables);
        instaService.stub(ILogService, new NullLogService());
        const fileService = disposables.add(instaService.createInstance(FileService));
        instaService.stub(IFileService, fileService);
        const fileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
        disposables.add(fileService.registerProvider('test', fileSystemProvider));
        // Create some test files and directories
        await fileService.createFolder(URI.parse('test:///workspace'));
        await fileService.createFolder(URI.parse('test:///workspace/src'));
        await fileService.createFolder(URI.parse('test:///workspace/docs'));
        await fileService.writeFile(URI.parse('test:///workspace/src/index.ts'), VSBuffer.fromString('export function hello() {}'));
        await fileService.writeFile(URI.parse('test:///workspace/README.md'), VSBuffer.fromString('# Project'));
        await fileService.writeFile(URI.parse('test:///workspace/package.json'), VSBuffer.fromString('{}'));
        const toolService = disposables.add(instaService.createInstance(LanguageModelToolsService));
        const testTool1 = { id: 'testTool1', displayName: 'tool1', canBeReferencedInPrompt: true, modelDescription: 'Test Tool 1', source: ToolDataSource.External, inputSchema: {} };
        disposables.add(toolService.registerToolData(testTool1));
        const testTool2 = { id: 'testTool2', displayName: 'tool2', canBeReferencedInPrompt: true, toolReferenceName: 'tool2', modelDescription: 'Test Tool 2', source: ToolDataSource.External, inputSchema: {} };
        disposables.add(toolService.registerToolData(testTool2));
        const myExtSource = { type: 'extension', label: 'My Extension', extensionId: new ExtensionIdentifier('My.extension') };
        const testTool3 = { id: 'testTool3', displayName: 'tool3', canBeReferencedInPrompt: true, toolReferenceName: 'tool3', modelDescription: 'Test Tool 3', source: myExtSource, inputSchema: {} };
        disposables.add(toolService.registerToolData(testTool3));
        const prExtSource = { type: 'extension', label: 'GitHub Pull Request Extension', extensionId: new ExtensionIdentifier('github.vscode-pull-request-github') };
        const prExtTool1 = { id: 'suggestFix', canBeReferencedInPrompt: true, toolReferenceName: 'suggest-fix', modelDescription: 'tool4', displayName: 'Test Tool 4', source: prExtSource, inputSchema: {} };
        disposables.add(toolService.registerToolData(prExtTool1));
        instaService.set(ILanguageModelToolsService, toolService);
        completionProvider = instaService.createInstance(PromptBodyAutocompletion);
    });
    async function getCompletions(content, line, column, promptType) {
        const languageId = getLanguageIdForPromptsType(promptType);
        const model = disposables.add(createTextModel(content, languageId, undefined, URI.parse('test://workspace/test' + getPromptFileExtension(promptType))));
        const position = new Position(line, column);
        const context = { triggerKind: 0 /* CompletionTriggerKind.Invoke */ };
        const result = await completionProvider.provideCompletionItems(model, position, context, CancellationToken.None);
        if (!result || !result.suggestions) {
            return [];
        }
        const lineContent = model.getLineContent(position.lineNumber);
        return result.suggestions.map(s => {
            assert(s.range instanceof Range);
            return {
                label: s.label,
                result: lineContent.substring(0, s.range.startColumn - 1) + s.insertText + lineContent.substring(s.range.endColumn - 1)
            };
        });
    }
    suite('prompt body completions', () => {
        test('default suggestions', async () => {
            const content = [
                '---',
                'description: "Test"',
                '---',
                '',
                'Use # to reference a file or tool.',
                'One more #to'
            ].join('\n');
            {
                const actual = (await getCompletions(content, 5, 6, PromptsType.prompt));
                assert.deepEqual(actual, [
                    {
                        label: 'file:',
                        result: 'Use #file: to reference a file or tool.'
                    },
                    {
                        label: 'tool:',
                        result: 'Use #tool: to reference a file or tool.'
                    }
                ]);
            }
            {
                const actual = (await getCompletions(content, 6, 13, PromptsType.prompt));
                assert.deepEqual(actual, [
                    {
                        label: 'file:',
                        result: 'One more #file:'
                    },
                    {
                        label: 'tool:',
                        result: 'One more #tool:'
                    }
                ]);
            }
        });
        test('tool suggestions', async () => {
            const content = [
                '---',
                'description: "Test"',
                '---',
                '',
                'Use #tool: to reference a tool.',
            ].join('\n');
            {
                const actual = (await getCompletions(content, 5, 11, PromptsType.prompt));
                assert.deepEqual(actual, [
                    {
                        label: 'vscode',
                        result: 'Use #tool:vscode to reference a tool.'
                    },
                    {
                        label: 'execute',
                        result: 'Use #tool:execute to reference a tool.'
                    },
                    {
                        label: 'read',
                        result: 'Use #tool:read to reference a tool.'
                    },
                    {
                        label: 'agent',
                        result: 'Use #tool:agent to reference a tool.'
                    },
                    {
                        label: 'tool1',
                        result: 'Use #tool:tool1 to reference a tool.'
                    },
                    {
                        label: 'tool2',
                        result: 'Use #tool:tool2 to reference a tool.'
                    },
                    {
                        label: 'my.extension/tool3',
                        result: 'Use #tool:my.extension/tool3 to reference a tool.'
                    },
                    {
                        label: 'github.vscode-pull-request-github/suggest-fix',
                        result: 'Use #tool:github.vscode-pull-request-github/suggest-fix to reference a tool.'
                    }
                ]);
            }
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvbXB0Qm9keUF1dG9jb21wbGV0aW9uLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L3Rlc3QvYnJvd3Nlci9wcm9tcHRTeW50YXgvbGFuZ3VhZ2VQcm92aWRlcnMvcHJvbXB0Qm9keUF1dG9jb21wbGV0aW9uLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ3JGLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ3pHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUUvRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx1RUFBdUUsQ0FBQztBQUMxRyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxxRkFBcUYsQ0FBQztBQUMvSCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUVwRyxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUN4RyxPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUNuRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUNwRSxPQUFPLEVBQUUsMEJBQTBCLEVBQWEsY0FBYyxFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDOUgsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sK0VBQStFLENBQUM7QUFDekgsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQzNGLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUs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