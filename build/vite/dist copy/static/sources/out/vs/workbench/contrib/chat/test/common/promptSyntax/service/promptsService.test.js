/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import * as sinon from 'sinon';
import { CancellationToken } from '../../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../../base/common/event.js';
import { match } from '../../../../../../../base/common/glob.js';
import { ResourceSet } from '../../../../../../../base/common/map.js';
import { Schemas } from '../../../../../../../base/common/network.js';
import { observableValue } from '../../../../../../../base/common/observable.js';
import { basename, relativePath } from '../../../../../../../base/common/resources.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { Range } from '../../../../../../../editor/common/core/range.js';
import { ILanguageService } from '../../../../../../../editor/common/languages/language.js';
import { IModelService } from '../../../../../../../editor/common/services/model.js';
import { ModelService } from '../../../../../../../editor/common/services/modelService.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IFileService } from '../../../../../../../platform/files/common/files.js';
import { FileService } from '../../../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILabelService } from '../../../../../../../platform/label/common/label.js';
import { ILogService, NullLogService } from '../../../../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../../../platform/telemetry/common/telemetryUtils.js';
import { IWorkspaceContextService } from '../../../../../../../platform/workspace/common/workspace.js';
import { testWorkspace } from '../../../../../../../platform/workspace/test/common/testWorkspace.js';
import { IWorkbenchEnvironmentService } from '../../../../../../services/environment/common/environmentService.js';
import { IFilesConfigurationService } from '../../../../../../services/filesConfiguration/common/filesConfigurationService.js';
import { IUserDataProfileService } from '../../../../../../services/userDataProfile/common/userDataProfile.js';
import { toUserDataProfile } from '../../../../../../../platform/userDataProfile/common/userDataProfile.js';
import { TestContextService, TestUserDataProfileService, TestWorkspaceTrustManagementService } from '../../../../../../test/common/workbenchTestServices.js';
import { ChatRequestVariableSet, isPromptFileVariableEntry, toFileVariableEntry } from '../../../../common/attachments/chatVariableEntries.js';
import { ComputeAutomaticInstructions, newInstructionsCollectionEvent } from '../../../../common/promptSyntax/computeAutomaticInstructions.js';
import { PromptsConfig } from '../../../../common/promptSyntax/config/config.js';
import { AGENTS_SOURCE_FOLDER, CLAUDE_CONFIG_FOLDER, HOOKS_SOURCE_FOLDER, INSTRUCTION_FILE_EXTENSION, INSTRUCTIONS_DEFAULT_SOURCE_FOLDER, LEGACY_MODE_DEFAULT_SOURCE_FOLDER, PROMPT_DEFAULT_SOURCE_FOLDER, PROMPT_FILE_EXTENSION } from '../../../../common/promptSyntax/config/promptFileLocations.js';
import { INSTRUCTIONS_LANGUAGE_ID, PROMPT_LANGUAGE_ID, PromptFileSource, PromptsType, Target } from '../../../../common/promptSyntax/promptTypes.js';
import { IPromptsService, PromptsStorage } from '../../../../common/promptSyntax/service/promptsService.js';
import { PromptsService } from '../../../../common/promptSyntax/service/promptsServiceImpl.js';
import { mockFiles } from '../testUtils/mockFilesystem.js';
import { InMemoryStorageService, IStorageService } from '../../../../../../../platform/storage/common/storage.js';
import { IPathService } from '../../../../../../services/path/common/pathService.js';
import { ISearchService } from '../../../../../../services/search/common/search.js';
import { IExtensionService } from '../../../../../../services/extensions/common/extensions.js';
import { IRemoteAgentService } from '../../../../../../services/remote/common/remoteAgentService.js';
import { ChatModeKind } from '../../../../common/constants.js';
import { HookType } from '../../../../common/promptSyntax/hookTypes.js';
import { IContextKeyService } from '../../../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IAgentPluginService } from '../../../../common/plugins/agentPluginService.js';
import { IWorkspaceTrustManagementService } from '../../../../../../../platform/workspace/common/workspaceTrust.js';
suite('PromptsService', () => {
    const disposables = ensureNoDisposablesAreLeakedInTestSuite();
    let service;
    let instaService;
    let workspaceContextService;
    let testConfigService;
    let fileService;
    let testPluginsObservable;
    let workspaceTrustService;
    setup(async () => {
        instaService = disposables.add(new TestInstantiationService());
        instaService.stub(ILogService, new NullLogService());
        workspaceContextService = new TestContextService();
        instaService.stub(IWorkspaceContextService, workspaceContextService);
        testConfigService = new TestConfigurationService();
        testConfigService.setUserConfiguration(PromptsConfig.USE_COPILOT_INSTRUCTION_FILES, true);
        testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_MD, true);
        testConfigService.setUserConfiguration(PromptsConfig.USE_NESTED_AGENT_MD, false);
        testConfigService.setUserConfiguration(PromptsConfig.INCLUDE_REFERENCED_INSTRUCTIONS, true);
        testConfigService.setUserConfiguration(PromptsConfig.INCLUDE_APPLYING_INSTRUCTIONS, true);
        testConfigService.setUserConfiguration(PromptsConfig.USE_CUSTOMIZATIONS_IN_PARENT_REPOS, false);
        testConfigService.setUserConfiguration(PromptsConfig.INSTRUCTIONS_LOCATION_KEY, { [INSTRUCTIONS_DEFAULT_SOURCE_FOLDER]: true });
        testConfigService.setUserConfiguration(PromptsConfig.PROMPT_LOCATIONS_KEY, { [PROMPT_DEFAULT_SOURCE_FOLDER]: true });
        testConfigService.setUserConfiguration(PromptsConfig.MODE_LOCATION_KEY, { [LEGACY_MODE_DEFAULT_SOURCE_FOLDER]: true });
        testConfigService.setUserConfiguration(PromptsConfig.AGENTS_LOCATION_KEY, { [AGENTS_SOURCE_FOLDER]: true });
        instaService.stub(IConfigurationService, testConfigService);
        instaService.stub(IWorkbenchEnvironmentService, {});
        instaService.stub(IUserDataProfileService, new TestUserDataProfileService());
        instaService.stub(ITelemetryService, NullTelemetryService);
        instaService.stub(IStorageService, InMemoryStorageService);
        instaService.stub(IExtensionService, {
            whenInstalledExtensionsRegistered: () => Promise.resolve(true),
            activateByEvent: () => Promise.resolve()
        });
        fileService = disposables.add(instaService.createInstance(FileService));
        instaService.stub(IFileService, fileService);
        const modelService = disposables.add(instaService.createInstance(ModelService));
        instaService.stub(IModelService, modelService);
        instaService.stub(ILanguageService, {
            guessLanguageIdByFilepathOrFirstLine(uri) {
                if (uri.path.endsWith(PROMPT_FILE_EXTENSION)) {
                    return PROMPT_LANGUAGE_ID;
                }
                if (uri.path.endsWith(INSTRUCTION_FILE_EXTENSION)) {
                    return INSTRUCTIONS_LANGUAGE_ID;
                }
                return 'plaintext';
            }
        });
        instaService.stub(ILabelService, { getUriLabel: (uri) => uri.path });
        const fileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
        disposables.add(fileService.registerProvider(Schemas.file, fileSystemProvider));
        instaService.stub(IFilesConfigurationService, { updateReadonly: () => Promise.resolve() });
        const pathService = {
            userHome: () => {
                return Promise.resolve(URI.file('/home/user'));
            },
        };
        instaService.stub(IPathService, pathService);
        instaService.stub(ISearchService, {
            schemeHasFileSearchProvider: () => true,
            async fileSearch(query) {
                // mock the search service - recursively find files matching pattern
                const findFilesInLocation = async (location, results = []) => {
                    try {
                        const resolve = await fileService.resolve(location);
                        if (resolve.isFile) {
                            results.push(resolve.resource);
                        }
                        else if (resolve.isDirectory && resolve.children) {
                            for (const child of resolve.children) {
                                await findFilesInLocation(child.resource, results);
                            }
                        }
                    }
                    catch (error) {
                        // folder doesn't exist
                    }
                    return results;
                };
                const results = [];
                for (const folderQuery of query.folderQueries) {
                    const allFiles = await findFilesInLocation(folderQuery.folder);
                    for (const resource of allFiles) {
                        const pathInFolder = relativePath(folderQuery.folder, resource) ?? '';
                        if (query.filePattern === undefined || match(query.filePattern, pathInFolder)) {
                            results.push({ resource });
                        }
                    }
                }
                return { results, messages: [] };
            }
        });
        instaService.stub(IRemoteAgentService, {
            getEnvironment: () => Promise.resolve(null),
        });
        instaService.stub(IContextKeyService, new MockContextKeyService());
        workspaceTrustService = disposables.add(new TestWorkspaceTrustManagementService());
        workspaceTrustService.getUriTrustInfo = (uri) => Promise.resolve({ trusted: true, uri });
        instaService.stub(IWorkspaceTrustManagementService, workspaceTrustService);
        testPluginsObservable = observableValue('testPlugins', []);
        instaService.stub(IAgentPluginService, {
            plugins: testPluginsObservable,
            enablementModel: { readEnabled: () => 2 /* EnabledProfile */, setEnabled: () => { }, remove: () => { } },
        });
        service = disposables.add(instaService.createInstance(PromptsService));
        instaService.stub(IPromptsService, service);
    });
    suite('parse', () => {
        test('explicit', async function () {
            const rootFolderName = 'resolves-nested-file-references';
            const rootFolder = `/${rootFolderName}`;
            const rootFileName = 'file2.prompt.md';
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            const rootFileUri = URI.joinPath(rootFolderUri, rootFileName);
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/file1.prompt.md`,
                    contents: [
                        '## Some Header',
                        'some contents',
                        ' ',
                    ],
                },
                {
                    path: `${rootFolder}/${rootFileName}`,
                    contents: [
                        '---',
                        'description: \'Root prompt description.\'',
                        'tools: [\'my-tool1\', , tool]',
                        'agent: "agent" ',
                        '---',
                        '## Files',
                        '\t- this file #file:folder1/file3.prompt.md ',
                        '\t- also this [file4.prompt.md](./folder1/some-other-folder/file4.prompt.md) please!',
                        '## Vars',
                        '\t- #tool:my-tool',
                        '\t- #tool:my-other-tool',
                        ' ',
                    ],
                },
                {
                    path: `${rootFolder}/folder1/file3.prompt.md`,
                    contents: [
                        '---',
                        'tools: [ false, \'my-tool1\' , ]',
                        'agent: \'edit\'',
                        '---',
                        '',
                        '[](./some-other-folder/non-existing-folder)',
                        `\t- some seemingly random #file:${rootFolder}/folder1/some-other-folder/yetAnotherFolder🤭/another-file.instructions.md contents`,
                        ' some more\t content',
                    ],
                },
                {
                    path: `${rootFolder}/folder1/some-other-folder/file4.prompt.md`,
                    contents: [
                        '---',
                        'tools: [\'my-tool1\', "my-tool2", true, , ]',
                        'something: true',
                        'agent: \'ask\'\t',
                        'description: "File 4 splendid description."',
                        '---',
                        'this file has a non-existing #file:./some-non-existing/file.prompt.md\t\treference',
                        '',
                        '',
                        'and some',
                        ' non-prompt #file:./some-non-prompt-file.md\t\t \t[](../../folder1/)\t',
                    ],
                },
                {
                    path: `${rootFolder}/folder1/some-other-folder/file.txt`,
                    contents: [
                        '---',
                        'description: "Non-prompt file description".',
                        'tools: ["my-tool-24"]',
                        '---',
                    ],
                },
                {
                    path: `${rootFolder}/folder1/some-other-folder/yetAnotherFolder🤭/another-file.instructions.md`,
                    contents: [
                        '---',
                        'description: "Another file description."',
                        'tools: [\'my-tool3\', "my-tool2" ]',
                        'applyTo: "**/*.tsx"',
                        '---',
                        `[](${rootFolder}/folder1/some-other-folder)`,
                        'another-file.instructions.md contents\t [#file:file.txt](../file.txt)',
                    ],
                },
                {
                    path: `${rootFolder}/folder1/some-other-folder/yetAnotherFolder🤭/one_more_file_just_in_case.prompt.md`,
                    contents: ['one_more_file_just_in_case.prompt.md contents'],
                },
            ]);
            const file3 = URI.joinPath(rootFolderUri, 'folder1/file3.prompt.md');
            const file4 = URI.joinPath(rootFolderUri, 'folder1/some-other-folder/file4.prompt.md');
            const someOtherFolder = URI.joinPath(rootFolderUri, '/folder1/some-other-folder');
            const someOtherFolderFile = URI.joinPath(rootFolderUri, '/folder1/some-other-folder/file.txt');
            const nonExistingFolder = URI.joinPath(rootFolderUri, 'folder1/some-other-folder/non-existing-folder');
            const yetAnotherFile = URI.joinPath(rootFolderUri, 'folder1/some-other-folder/yetAnotherFolder🤭/another-file.instructions.md');
            const result1 = await service.parseNew(rootFileUri, CancellationToken.None);
            assert.deepEqual(result1.uri, rootFileUri);
            assert.deepEqual(result1.header?.description, 'Root prompt description.');
            assert.deepEqual(result1.header?.tools, ['my-tool1', 'tool']);
            assert.deepEqual(result1.header?.agent, 'agent');
            assert.ok(result1.body);
            assert.deepEqual(result1.body.fileReferences.map(r => result1.body?.resolveFilePath(r.content)), [file3, file4]);
            assert.deepEqual(result1.body.variableReferences, [
                { name: 'my-tool', range: new Range(10, 10, 10, 17), offset: 240, fullLength: 13 },
                { name: 'my-other-tool', range: new Range(11, 10, 11, 23), offset: 257, fullLength: 19 },
            ]);
            const result2 = await service.parseNew(file3, CancellationToken.None);
            assert.deepEqual(result2.uri, file3);
            assert.deepEqual(result2.header?.agent, 'edit');
            assert.ok(result2.body);
            assert.deepEqual(result2.body.fileReferences.map(r => result2.body?.resolveFilePath(r.content)), [nonExistingFolder, yetAnotherFile]);
            const result3 = await service.parseNew(yetAnotherFile, CancellationToken.None);
            assert.deepEqual(result3.uri, yetAnotherFile);
            assert.deepEqual(result3.header?.description, 'Another file description.');
            assert.deepEqual(result3.header?.applyTo, '**/*.tsx');
            assert.ok(result3.body);
            assert.deepEqual(result3.body.fileReferences.map(r => result3.body?.resolveFilePath(r.content)), [someOtherFolder, someOtherFolderFile]);
            assert.deepEqual(result3.body.variableReferences, []);
            const result4 = await service.parseNew(file4, CancellationToken.None);
            assert.deepEqual(result4.uri, file4);
            assert.deepEqual(result4.header?.description, 'File 4 splendid description.');
            assert.ok(result4.body);
            assert.deepEqual(result4.body.fileReferences.map(r => result4.body?.resolveFilePath(r.content)), [
                URI.joinPath(rootFolderUri, '/folder1/some-other-folder/some-non-existing/file.prompt.md'),
                URI.joinPath(rootFolderUri, '/folder1/some-other-folder/some-non-prompt-file.md'),
                URI.joinPath(rootFolderUri, '/folder1/'),
            ]);
            assert.deepEqual(result4.body.variableReferences, []);
        });
    });
    suite('findInstructionFilesFor', () => {
        teardown(() => {
            sinon.restore();
        });
        test('finds correct instruction files', async () => {
            const rootFolderName = 'finds-instruction-files';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            const userPromptsFolderName = '/tmp/user-data/prompts';
            const userPromptsFolderUri = URI.file(userPromptsFolderName);
            sinon.stub(service, 'listPromptFiles')
                .returns(Promise.resolve([
                // local instructions
                {
                    uri: URI.joinPath(rootFolderUri, '.github/prompts/file1.instructions.md'),
                    storage: PromptsStorage.local,
                    type: PromptsType.instructions,
                },
                {
                    uri: URI.joinPath(rootFolderUri, '.github/prompts/file2.instructions.md'),
                    storage: PromptsStorage.local,
                    type: PromptsType.instructions,
                },
                {
                    uri: URI.joinPath(rootFolderUri, '.github/prompts/file3.instructions.md'),
                    storage: PromptsStorage.local,
                    type: PromptsType.instructions,
                },
                {
                    uri: URI.joinPath(rootFolderUri, '.github/prompts/file4.instructions.md'),
                    storage: PromptsStorage.local,
                    type: PromptsType.instructions,
                },
                // user instructions
                {
                    uri: URI.joinPath(userPromptsFolderUri, 'file10.instructions.md'),
                    storage: PromptsStorage.user,
                    type: PromptsType.instructions,
                },
                {
                    uri: URI.joinPath(userPromptsFolderUri, 'file11.instructions.md'),
                    storage: PromptsStorage.user,
                    type: PromptsType.instructions,
                },
            ]));
            // mock current workspace file structure
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/file1.prompt.md`,
                    contents: [
                        '## Some Header',
                        'some contents',
                        ' ',
                    ]
                },
                {
                    path: `${rootFolder}/.github/prompts/file1.instructions.md`,
                    contents: [
                        '---',
                        'description: \'Instructions file 1.\'',
                        'applyTo: "**/*.tsx"',
                        '---',
                        'Some instructions 1 contents.',
                    ]
                },
                {
                    path: `${rootFolder}/.github/prompts/file2.instructions.md`,
                    contents: [
                        '---',
                        'description: \'Instructions file 2.\'',
                        'applyTo: "**/folder1/*.tsx"',
                        '---',
                        'Some instructions 2 contents.',
                    ]
                },
                {
                    path: `${rootFolder}/.github/prompts/file3.instructions.md`,
                    contents: [
                        '---',
                        'description: \'Instructions file 3.\'',
                        'applyTo: "**/folder2/*.tsx"',
                        '---',
                        'Some instructions 3 contents.',
                    ]
                },
                {
                    path: `${rootFolder}/.github/prompts/file4.instructions.md`,
                    contents: [
                        '---',
                        'description: \'Instructions file 4.\'',
                        'applyTo: "src/build/*.tsx"',
                        '---',
                        'Some instructions 4 contents.',
                    ]
                },
                {
                    path: `${rootFolder}/.github/prompts/file5.prompt.md`,
                    contents: [
                        '---',
                        'description: \'Prompt file 5.\'',
                        '---',
                        'Some prompt 5 contents.',
                    ]
                },
                {
                    path: `${rootFolder}/folder1/main.tsx`,
                    contents: [
                        'console.log("Haalou!")'
                    ]
                }
            ]);
            // mock user data instructions
            await mockFiles(fileService, [
                {
                    path: `${userPromptsFolderName}/file10.instructions.md`,
                    contents: [
                        '---',
                        'description: \'Instructions file 10.\'',
                        'applyTo: "**/folder1/*.tsx"',
                        '---',
                        'Some instructions 10 contents.',
                    ]
                },
                {
                    path: `${userPromptsFolderName}/file11.instructions.md`,
                    contents: [
                        '---',
                        'description: \'Instructions file 11.\'',
                        'applyTo: "**/folder1/*.py"',
                        '---',
                        'Some instructions 11 contents.',
                    ]
                },
                {
                    path: `${userPromptsFolderName}/file12.prompt.md`,
                    contents: [
                        '---',
                        'description: \'Prompt file 12.\'',
                        '---',
                        'Some prompt 12 contents.',
                    ]
                }
            ]);
            const instructionFiles = await service.getInstructionFiles(CancellationToken.None);
            const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, undefined, undefined);
            const context = {
                files: new ResourceSet([
                    URI.joinPath(rootFolderUri, 'folder1/main.tsx'),
                ]),
                instructions: new ResourceSet(),
            };
            const result = new ChatRequestVariableSet();
            await contextComputer.addApplyingInstructions(instructionFiles, context, result, newInstructionsCollectionEvent(), CancellationToken.None);
            assert.deepStrictEqual(result.asArray().map(i => isPromptFileVariableEntry(i) ? i.value.path : undefined), [
                // local instructions
                URI.joinPath(rootFolderUri, '.github/prompts/file1.instructions.md').path,
                URI.joinPath(rootFolderUri, '.github/prompts/file2.instructions.md').path,
                // user instructions
                URI.joinPath(userPromptsFolderUri, 'file10.instructions.md').path,
            ], 'Must find correct instruction files.');
        });
        test('does not have duplicates', async () => {
            const rootFolderName = 'finds-instruction-files-without-duplicates';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            const userPromptsFolderName = '/tmp/user-data/prompts';
            const userPromptsFolderUri = URI.file(userPromptsFolderName);
            sinon.stub(service, 'listPromptFiles')
                .returns(Promise.resolve([
                // local instructions
                {
                    uri: URI.joinPath(rootFolderUri, '.github/prompts/file1.instructions.md'),
                    storage: PromptsStorage.local,
                    type: PromptsType.instructions,
                },
                {
                    uri: URI.joinPath(rootFolderUri, '.github/prompts/file2.instructions.md'),
                    storage: PromptsStorage.local,
                    type: PromptsType.instructions,
                },
                {
                    uri: URI.joinPath(rootFolderUri, '.github/prompts/file3.instructions.md'),
                    storage: PromptsStorage.local,
                    type: PromptsType.instructions,
                },
                {
                    uri: URI.joinPath(rootFolderUri, '.github/prompts/file4.instructions.md'),
                    storage: PromptsStorage.local,
                    type: PromptsType.instructions,
                },
                // user instructions
                {
                    uri: URI.joinPath(userPromptsFolderUri, 'file10.instructions.md'),
                    storage: PromptsStorage.user,
                    type: PromptsType.instructions,
                },
                {
                    uri: URI.joinPath(userPromptsFolderUri, 'file11.instructions.md'),
                    storage: PromptsStorage.user,
                    type: PromptsType.instructions,
                },
            ]));
            // mock current workspace file structure
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/file1.prompt.md`,
                    contents: [
                        '## Some Header',
                        'some contents',
                        ' ',
                    ]
                },
                {
                    path: `${rootFolder}/.github/prompts/file1.instructions.md`,
                    contents: [
                        '---',
                        'description: \'Instructions file 1.\'',
                        'applyTo: "**/*.tsx"',
                        '---',
                        'Some instructions 1 contents.',
                    ]
                },
                {
                    path: `${rootFolder}/.github/prompts/file2.instructions.md`,
                    contents: [
                        '---',
                        'description: \'Instructions file 2.\'',
                        'applyTo: "**/folder1/*.tsx"',
                        '---',
                        'Some instructions 2 contents. [](./file1.instructions.md)',
                    ]
                },
                {
                    path: `${rootFolder}/.github/prompts/file3.instructions.md`,
                    contents: [
                        '---',
                        'description: \'Instructions file 3.\'',
                        'applyTo: "**/folder2/*.tsx"',
                        '---',
                        'Some instructions 3 contents.',
                    ]
                },
                {
                    path: `${rootFolder}/.github/prompts/file4.instructions.md`,
                    contents: [
                        '---',
                        'description: \'Instructions file 4.\'',
                        'applyTo: "src/build/*.tsx"',
                        '---',
                        '[](./file3.instructions.md) Some instructions 4 contents.',
                    ]
                },
                {
                    path: `${rootFolder}/.github/prompts/file5.prompt.md`,
                    contents: [
                        '---',
                        'description: \'Prompt file 5.\'',
                        '---',
                        'Some prompt 5 contents.',
                    ]
                },
                {
                    path: `${rootFolder}/folder1/main.tsx`,
                    contents: [
                        'console.log("Haalou!")'
                    ]
                }
            ]);
            // mock user data instructions
            await mockFiles(fileService, [
                {
                    path: `${userPromptsFolderName}/file10.instructions.md`,
                    contents: [
                        '---',
                        'description: \'Instructions file 10.\'',
                        'applyTo: "**/folder1/*.tsx"',
                        '---',
                        'Some instructions 10 contents.',
                    ]
                },
                {
                    path: `${userPromptsFolderName}/file11.instructions.md`,
                    contents: [
                        '---',
                        'description: \'Instructions file 11.\'',
                        'applyTo: "**/folder1/*.py"',
                        '---',
                        'Some instructions 11 contents.',
                    ]
                },
                {
                    path: `${userPromptsFolderName}/file12.prompt.md`,
                    contents: [
                        '---',
                        'description: \'Prompt file 12.\'',
                        '---',
                        'Some prompt 12 contents.',
                    ]
                }
            ]);
            const instructionFiles = await service.getInstructionFiles(CancellationToken.None);
            const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, undefined, undefined);
            const context = {
                files: new ResourceSet([
                    URI.joinPath(rootFolderUri, 'folder1/main.tsx'),
                    URI.joinPath(rootFolderUri, 'folder1/index.tsx'),
                    URI.joinPath(rootFolderUri, 'folder1/constants.tsx'),
                ]),
                instructions: new ResourceSet(),
            };
            const result = new ChatRequestVariableSet();
            await contextComputer.addApplyingInstructions(instructionFiles, context, result, newInstructionsCollectionEvent(), CancellationToken.None);
            assert.deepStrictEqual(result.asArray().map(i => isPromptFileVariableEntry(i) ? i.value.path : undefined), [
                // local instructions
                URI.joinPath(rootFolderUri, '.github/prompts/file1.instructions.md').path,
                URI.joinPath(rootFolderUri, '.github/prompts/file2.instructions.md').path,
                // user instructions
                URI.joinPath(userPromptsFolderUri, 'file10.instructions.md').path,
            ], 'Must find correct instruction files.');
        });
        test('copilot-instructions and AGENTS.md', async () => {
            const rootFolderName = 'copilot-instructions-and-agents';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            // mock current workspace file structure
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/codestyle.md`,
                    contents: [
                        'Can you see this?',
                    ]
                },
                {
                    path: `${rootFolder}/AGENTS.md`,
                    contents: [
                        'What about this?',
                    ]
                },
                {
                    path: `${rootFolder}/README.md`,
                    contents: [
                        'Thats my project?',
                    ]
                },
                {
                    path: `${rootFolder}/.github/copilot-instructions.md`,
                    contents: [
                        'Be nice and friendly. Also look at instructions at #file:../codestyle.md and [more-codestyle.md](./more-codestyle.md).',
                    ]
                },
                {
                    path: `${rootFolder}/.github/more-codestyle.md`,
                    contents: [
                        'I like it clean.',
                    ]
                },
                {
                    path: `${rootFolder}/folder1/AGENTS.md`,
                    contents: [
                        'An AGENTS.md file in another repo'
                    ]
                }
            ]);
            const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, undefined, undefined);
            const context = new ChatRequestVariableSet();
            context.add(toFileVariableEntry(URI.joinPath(rootFolderUri, 'README.md')));
            await contextComputer.collect(context, CancellationToken.None);
            assert.deepStrictEqual(context.asArray().map(i => isPromptFileVariableEntry(i) ? i.value.path : undefined).filter(e => !!e).sort(), [
                URI.joinPath(rootFolderUri, '.github/copilot-instructions.md').path,
                URI.joinPath(rootFolderUri, '.github/more-codestyle.md').path,
                URI.joinPath(rootFolderUri, 'AGENTS.md').path,
                URI.joinPath(rootFolderUri, 'codestyle.md').path,
            ].sort(), 'Must find correct instruction files.');
        });
    });
    suite('getCustomAgents', () => {
        teardown(() => {
            sinon.restore();
        });
        test('header with handOffs', async () => {
            const rootFolderName = 'custom-agents-with-handoffs';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/.github/agents/agent1.agent.md`,
                    contents: [
                        '---',
                        'description: \'Agent file 1.\'',
                        'handoffs: [ { agent: "Edit", label: "Do it", prompt: "Do it now" } ]',
                        '---',
                    ]
                }
            ]);
            const result = (await service.getCustomAgents(CancellationToken.None)).map(agent => ({ ...agent, uri: URI.from(agent.uri) }));
            const expected = [
                {
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
                    target: Target.Undefined,
                    visibility: { userInvocable: true, agentInvocable: true },
                    agents: undefined,
                    hooks: undefined,
                    uri: URI.joinPath(rootFolderUri, '.github/agents/agent1.agent.md'),
                    source: { storage: PromptsStorage.local }
                },
            ];
            assert.deepEqual(result, expected, 'Must get custom agents.');
        });
        test('body with tool references', async () => {
            const rootFolderName = 'custom-agents';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            // mock current workspace file structure
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/.github/agents/agent1.agent.md`,
                    contents: [
                        '---',
                        'description: \'Agent file 1.\'',
                        'tools: [ tool1, tool2 ]',
                        '---',
                        'Do it with #tool:tool1',
                    ]
                },
                {
                    path: `${rootFolder}/.github/agents/agent2.agent.md`,
                    contents: [
                        'First use #tool:tool2\nThen use #tool:tool1',
                    ]
                }
            ]);
            const result = (await service.getCustomAgents(CancellationToken.None)).map(agent => ({ ...agent, uri: URI.from(agent.uri) }));
            const expected = [
                {
                    name: 'agent1',
                    description: 'Agent file 1.',
                    tools: ['tool1', 'tool2'],
                    agentInstructions: {
                        content: 'Do it with #tool:tool1',
                        toolReferences: [{ name: 'tool1', range: { start: 11, endExclusive: 22 } }],
                        metadata: undefined
                    },
                    handOffs: undefined,
                    model: undefined,
                    argumentHint: undefined,
                    target: Target.Undefined,
                    visibility: { userInvocable: true, agentInvocable: true },
                    agents: undefined,
                    hooks: undefined,
                    uri: URI.joinPath(rootFolderUri, '.github/agents/agent1.agent.md'),
                    source: { storage: PromptsStorage.local },
                },
                {
                    name: 'agent2',
                    agentInstructions: {
                        content: 'First use #tool:tool2\nThen use #tool:tool1',
                        toolReferences: [
                            { name: 'tool1', range: { start: 31, endExclusive: 42 } },
                            { name: 'tool2', range: { start: 10, endExclusive: 21 } }
                        ],
                        metadata: undefined
                    },
                    uri: URI.joinPath(rootFolderUri, '.github/agents/agent2.agent.md'),
                    source: { storage: PromptsStorage.local },
                    target: Target.Undefined,
                    visibility: { userInvocable: true, agentInvocable: true }
                }
            ];
            assert.deepEqual(result, expected, 'Must get custom agents.');
        });
        test('header with argumentHint', async () => {
            const rootFolderName = 'custom-agents-with-argument-hint';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/.github/agents/agent1.agent.md`,
                    contents: [
                        '---',
                        'description: \'Code review agent.\'',
                        'argument-hint: \'Provide file path or code snippet to review\'',
                        'tools: [ code-analyzer, linter ]',
                        '---',
                        'I will help review your code for best practices.',
                    ]
                },
                {
                    path: `${rootFolder}/.github/agents/agent2.agent.md`,
                    contents: [
                        '---',
                        'description: \'Documentation generator.\'',
                        'argument-hint: \'Specify function or class name to document\'',
                        '---',
                        'I generate comprehensive documentation.',
                    ]
                }
            ]);
            const result = (await service.getCustomAgents(CancellationToken.None)).map(agent => ({ ...agent, uri: URI.from(agent.uri) }));
            const expected = [
                {
                    name: 'agent1',
                    description: 'Code review agent.',
                    argumentHint: 'Provide file path or code snippet to review',
                    tools: ['code-analyzer', 'linter'],
                    agentInstructions: {
                        content: 'I will help review your code for best practices.',
                        toolReferences: [],
                        metadata: undefined
                    },
                    handOffs: undefined,
                    model: undefined,
                    target: Target.Undefined,
                    visibility: { userInvocable: true, agentInvocable: true },
                    agents: undefined,
                    hooks: undefined,
                    uri: URI.joinPath(rootFolderUri, '.github/agents/agent1.agent.md'),
                    source: { storage: PromptsStorage.local }
                },
                {
                    name: 'agent2',
                    description: 'Documentation generator.',
                    argumentHint: 'Specify function or class name to document',
                    agentInstructions: {
                        content: 'I generate comprehensive documentation.',
                        toolReferences: [],
                        metadata: undefined
                    },
                    handOffs: undefined,
                    model: undefined,
                    tools: undefined,
                    target: Target.Undefined,
                    visibility: { userInvocable: true, agentInvocable: true },
                    agents: undefined,
                    hooks: undefined,
                    uri: URI.joinPath(rootFolderUri, '.github/agents/agent2.agent.md'),
                    source: { storage: PromptsStorage.local }
                },
            ];
            assert.deepEqual(result, expected, 'Must get custom agents with argumentHint.');
        });
        test('header with target', async () => {
            const rootFolderName = 'custom-agents-with-target';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/.github/agents/github-agent.agent.md`,
                    contents: [
                        '---',
                        'description: \'GitHub Copilot specialized agent.\'',
                        'target: \'github-copilot\'',
                        'tools: [ github-api, code-search ]',
                        '---',
                        'I am optimized for GitHub Copilot workflows.',
                    ]
                },
                {
                    path: `${rootFolder}/.github/agents/vscode-agent.agent.md`,
                    contents: [
                        '---',
                        'description: \'VS Code specialized agent.\'',
                        'target: \'vscode\'',
                        'model: \'gpt-4\'',
                        '---',
                        'I am specialized for VS Code editor tasks.',
                    ]
                },
                {
                    path: `${rootFolder}/.github/agents/generic-agent.agent.md`,
                    contents: [
                        '---',
                        'description: \'Generic agent without target.\'',
                        '---',
                        'I work everywhere.',
                    ]
                }
            ]);
            const result = (await service.getCustomAgents(CancellationToken.None)).map(agent => ({ ...agent, uri: URI.from(agent.uri) }));
            const expected = [
                {
                    name: 'github-agent',
                    description: 'GitHub Copilot specialized agent.',
                    target: Target.GitHubCopilot,
                    tools: ['github-api', 'code-search'],
                    agentInstructions: {
                        content: 'I am optimized for GitHub Copilot workflows.',
                        toolReferences: [],
                        metadata: undefined
                    },
                    handOffs: undefined,
                    model: undefined,
                    argumentHint: undefined,
                    visibility: { userInvocable: true, agentInvocable: true },
                    agents: undefined,
                    hooks: undefined,
                    uri: URI.joinPath(rootFolderUri, '.github/agents/github-agent.agent.md'),
                    source: { storage: PromptsStorage.local }
                },
                {
                    name: 'vscode-agent',
                    description: 'VS Code specialized agent.',
                    target: Target.VSCode,
                    model: ['gpt-4'],
                    agentInstructions: {
                        content: 'I am specialized for VS Code editor tasks.',
                        toolReferences: [],
                        metadata: undefined
                    },
                    handOffs: undefined,
                    argumentHint: undefined,
                    tools: undefined,
                    visibility: { userInvocable: true, agentInvocable: true },
                    agents: undefined,
                    hooks: undefined,
                    uri: URI.joinPath(rootFolderUri, '.github/agents/vscode-agent.agent.md'),
                    source: { storage: PromptsStorage.local }
                },
                {
                    name: 'generic-agent',
                    description: 'Generic agent without target.',
                    agentInstructions: {
                        content: 'I work everywhere.',
                        toolReferences: [],
                        metadata: undefined
                    },
                    handOffs: undefined,
                    model: undefined,
                    argumentHint: undefined,
                    tools: undefined,
                    target: Target.Undefined,
                    visibility: { userInvocable: true, agentInvocable: true },
                    agents: undefined,
                    hooks: undefined,
                    uri: URI.joinPath(rootFolderUri, '.github/agents/generic-agent.agent.md'),
                    source: { storage: PromptsStorage.local }
                },
            ];
            assert.deepEqual(result, expected, 'Must get custom agents with target attribute.');
        });
        test('claude agent maps tools and model to vscode equivalents', async () => {
            const rootFolderName = 'claude-agent-mapping';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            await mockFiles(fileService, [
                {
                    // Claude agent with tools and model that should be mapped
                    path: `${rootFolder}/.claude/agents/claude-agent.md`,
                    contents: [
                        '---',
                        'description: \'Claude agent with tools and model.\'',
                        'tools: [ Read, Edit, Bash ]',
                        'model: opus',
                        '---',
                        'I am a Claude agent.',
                    ]
                },
                {
                    // Claude agent with more tools, some with empty equivalents
                    path: `${rootFolder}/.claude/agents/claude-agent2.md`,
                    contents: [
                        '---',
                        'description: \'Claude agent with various tools.\'',
                        'tools: [ Glob, Grep, Write, Task, Skill ]',
                        'model: sonnet',
                        '---',
                        'I am another Claude agent.',
                    ]
                },
                {
                    // Non-Claude agent should NOT have tools/model mapped
                    path: `${rootFolder}/.github/agents/copilot-agent.agent.md`,
                    contents: [
                        '---',
                        'description: \'Copilot agent with same tool names.\'',
                        'target: \'github-copilot\'',
                        'tools: [ Read, Edit ]',
                        'model: gpt-4',
                        '---',
                        'I am a Copilot agent.',
                    ]
                },
            ]);
            const result = (await service.getCustomAgents(CancellationToken.None)).map(agent => ({ ...agent, uri: URI.from(agent.uri) }));
            const expected = [
                {
                    name: 'copilot-agent',
                    description: 'Copilot agent with same tool names.',
                    target: Target.GitHubCopilot,
                    // Non-Claude agent: tools and model stay as-is
                    tools: ['Read', 'Edit'],
                    model: ['gpt-4'],
                    agentInstructions: {
                        content: 'I am a Copilot agent.',
                        toolReferences: [],
                        metadata: undefined
                    },
                    handOffs: undefined,
                    argumentHint: undefined,
                    visibility: { userInvocable: true, agentInvocable: true },
                    agents: undefined,
                    hooks: undefined,
                    uri: URI.joinPath(rootFolderUri, '.github/agents/copilot-agent.agent.md'),
                    source: { storage: PromptsStorage.local }
                },
                {
                    name: 'claude-agent',
                    description: 'Claude agent with tools and model.',
                    target: Target.Claude,
                    // Claude tools mapped to vscode equivalents
                    tools: ['read/readFile', 'read/getNotebookSummary', 'edit/editNotebook', 'edit/editFiles', 'execute'],
                    // Claude model mapped to vscode equivalent
                    model: ['Claude Opus 4.6 (copilot)'],
                    agentInstructions: {
                        content: 'I am a Claude agent.',
                        toolReferences: [],
                        metadata: undefined
                    },
                    handOffs: undefined,
                    argumentHint: undefined,
                    visibility: { userInvocable: true, agentInvocable: true },
                    agents: undefined,
                    hooks: undefined,
                    uri: URI.joinPath(rootFolderUri, '.claude/agents/claude-agent.md'),
                    source: { storage: PromptsStorage.local }
                },
                {
                    name: 'claude-agent2',
                    description: 'Claude agent with various tools.',
                    target: Target.Claude,
                    // Tools mapped: Glob->search/fileSearch, Grep->search/textSearch, Write->edit/create*, Task->agent, Skill->[] (empty)
                    tools: ['search/fileSearch', 'search/textSearch', 'edit/createDirectory', 'edit/createFile', 'edit/createJupyterNotebook', 'agent'],
                    model: ['Claude Sonnet 4.5 (copilot)'],
                    agentInstructions: {
                        content: 'I am another Claude agent.',
                        toolReferences: [],
                        metadata: undefined
                    },
                    handOffs: undefined,
                    argumentHint: undefined,
                    visibility: { userInvocable: true, agentInvocable: true },
                    agents: undefined,
                    hooks: undefined,
                    uri: URI.joinPath(rootFolderUri, '.claude/agents/claude-agent2.md'),
                    source: { storage: PromptsStorage.local }
                },
            ];
            assert.deepEqual(result, expected, 'Claude tools and models must be mapped to VS Code equivalents; non-Claude agents must remain unchanged.');
        });
        test('agents with .md extension should be recognized, except README.md', async () => {
            const rootFolderName = 'custom-agents-md-extension';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/.github/agents/demonstrate.md`,
                    contents: [
                        '---',
                        'description: \'Demonstrate agent.\'',
                        'tools: [ demo-tool ]',
                        '---',
                        'This is a demonstration agent using .md extension.',
                    ]
                },
                {
                    path: `${rootFolder}/.github/agents/README.md`,
                    contents: [
                        'This is a README file.',
                    ]
                }
            ]);
            const result = (await service.getCustomAgents(CancellationToken.None)).map(agent => ({ ...agent, uri: URI.from(agent.uri) }));
            const expected = [
                {
                    name: 'demonstrate',
                    description: 'Demonstrate agent.',
                    tools: ['demo-tool'],
                    agentInstructions: {
                        content: 'This is a demonstration agent using .md extension.',
                        toolReferences: [],
                        metadata: undefined
                    },
                    handOffs: undefined,
                    model: undefined,
                    argumentHint: undefined,
                    target: Target.Undefined,
                    visibility: { userInvocable: true, agentInvocable: true },
                    agents: undefined,
                    hooks: undefined,
                    uri: URI.joinPath(rootFolderUri, '.github/agents/demonstrate.md'),
                    source: { storage: PromptsStorage.local }
                }
            ];
            assert.deepEqual(result, expected, 'Must recognize .md files as agents, except README.md');
        });
        test('header with agents', async () => {
            const rootFolderName = 'custom-agents-with-restrictions';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/.github/agents/restricted-agent.agent.md`,
                    contents: [
                        '---',
                        'description: \'Agent with restricted access.\'',
                        'agents: [ subagent1, subagent2 ]',
                        'tools: [ tool1 ]',
                        '---',
                        'This agent has restricted access.',
                    ]
                },
                {
                    path: `${rootFolder}/.github/agents/no-access-agent.agent.md`,
                    contents: [
                        '---',
                        'description: \'Agent with no access to subagents, skills, or instructions.\'',
                        'agents: []',
                        '---',
                        'This agent has no access.',
                    ]
                },
                {
                    path: `${rootFolder}/.github/agents/full-access-agent.agent.md`,
                    contents: [
                        '---',
                        'description: \'Agent with full access.\'',
                        'agents: [ "*" ]',
                        '---',
                        'This agent has full access.',
                    ]
                }
            ]);
            const result = (await service.getCustomAgents(CancellationToken.None)).map(agent => ({ ...agent, uri: URI.from(agent.uri) }));
            const expected = [
                {
                    name: 'restricted-agent',
                    description: 'Agent with restricted access.',
                    agents: ['subagent1', 'subagent2'],
                    tools: ['tool1'],
                    agentInstructions: {
                        content: 'This agent has restricted access.',
                        toolReferences: [],
                        metadata: undefined
                    },
                    handOffs: undefined,
                    model: undefined,
                    argumentHint: undefined,
                    target: Target.Undefined,
                    visibility: { userInvocable: true, agentInvocable: true },
                    hooks: undefined,
                    uri: URI.joinPath(rootFolderUri, '.github/agents/restricted-agent.agent.md'),
                    source: { storage: PromptsStorage.local }
                },
                {
                    name: 'no-access-agent',
                    description: 'Agent with no access to subagents, skills, or instructions.',
                    agents: [],
                    agentInstructions: {
                        content: 'This agent has no access.',
                        toolReferences: [],
                        metadata: undefined
                    },
                    handOffs: undefined,
                    model: undefined,
                    argumentHint: undefined,
                    tools: undefined,
                    target: Target.Undefined,
                    visibility: { userInvocable: true, agentInvocable: true },
                    hooks: undefined,
                    uri: URI.joinPath(rootFolderUri, '.github/agents/no-access-agent.agent.md'),
                    source: { storage: PromptsStorage.local }
                },
                {
                    name: 'full-access-agent',
                    description: 'Agent with full access.',
                    agents: ['*'],
                    agentInstructions: {
                        content: 'This agent has full access.',
                        toolReferences: [],
                        metadata: undefined
                    },
                    handOffs: undefined,
                    model: undefined,
                    argumentHint: undefined,
                    tools: undefined,
                    target: Target.Undefined,
                    visibility: { userInvocable: true, agentInvocable: true },
                    hooks: undefined,
                    uri: URI.joinPath(rootFolderUri, '.github/agents/full-access-agent.agent.md'),
                    source: { storage: PromptsStorage.local }
                },
            ];
            assert.deepEqual(result, expected, 'Must get custom agents with agents, skills, and instructions attributes.');
        });
        test('header with infer: false sets agentInvocable to false', async () => {
            const rootFolderName = 'custom-agents-infer-false';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/.github/agents/agent-infer-false.agent.md`,
                    contents: [
                        '---',
                        'description: \'Agent with infer: false.\'',
                        'infer: false',
                        '---',
                        'I should not be invocable by the model.',
                    ]
                },
                {
                    path: `${rootFolder}/.github/agents/agent-infer-true.agent.md`,
                    contents: [
                        '---',
                        'description: \'Agent with infer: true.\'',
                        'infer: true',
                        '---',
                        'I should be invocable by the model.',
                    ]
                },
                {
                    path: `${rootFolder}/.github/agents/agent-no-infer.agent.md`,
                    contents: [
                        '---',
                        'description: \'Agent without infer.\'',
                        '---',
                        'I should default to being invocable by the model.',
                    ]
                }
            ]);
            const result = (await service.getCustomAgents(CancellationToken.None)).map(agent => ({ ...agent, uri: URI.from(agent.uri) }));
            const inferFalseAgent = result.find(a => a.name === 'agent-infer-false');
            assert.ok(inferFalseAgent, 'Should find agent with infer: false');
            assert.strictEqual(inferFalseAgent.visibility.agentInvocable, false, 'infer: false should set agentInvocable to false');
            const inferTrueAgent = result.find(a => a.name === 'agent-infer-true');
            assert.ok(inferTrueAgent, 'Should find agent with infer: true');
            assert.strictEqual(inferTrueAgent.visibility.agentInvocable, true, 'infer: true should set agentInvocable to true');
            const noInferAgent = result.find(a => a.name === 'agent-no-infer');
            assert.ok(noInferAgent, 'Should find agent without infer');
            assert.strictEqual(noInferAgent.visibility.agentInvocable, true, 'missing infer should default agentInvocable to true');
        });
        test('agents from user data folder', async () => {
            const rootFolderName = 'custom-agents-user-data';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            const userPromptsFolder = '/user-data/prompts';
            const userPromptsFolderUri = URI.file(userPromptsFolder);
            // Override the user data profile service to use a file:// URI that the InMemoryFileSystemProvider supports
            const customUserDataProfileService = {
                _serviceBrand: undefined,
                onDidChangeCurrentProfile: Event.None,
                currentProfile: {
                    ...toUserDataProfile('test', 'test', URI.file(userPromptsFolder).with({ path: '/user-data' }), URI.file('/cache')),
                    promptsHome: userPromptsFolderUri,
                },
                updateCurrentProfile: async () => { }
            };
            instaService.stub(IUserDataProfileService, customUserDataProfileService);
            // Recreate the service with the new stub (dispose existing to avoid duplicate filesystem registration)
            service.dispose();
            const testService = disposables.add(instaService.createInstance(PromptsService));
            // Create agent files in both workspace and user data folder
            await mockFiles(fileService, [
                // Workspace agent
                {
                    path: `${rootFolder}/.github/agents/workspace-agent.agent.md`,
                    contents: [
                        '---',
                        'description: \'Workspace agent.\'',
                        '---',
                        'I am a workspace agent.',
                    ]
                },
                // User data agent
                {
                    path: `${userPromptsFolder}/user-agent.agent.md`,
                    contents: [
                        '---',
                        'description: \'User data agent.\'',
                        'tools: [ user-tool ]',
                        '---',
                        'I am a user data agent.',
                    ]
                },
                // Another user data agent without header
                {
                    path: `${userPromptsFolder}/simple-user-agent.agent.md`,
                    contents: [
                        'A simple user agent without header.',
                    ]
                }
            ]);
            const result = (await testService.getCustomAgents(CancellationToken.None)).map(agent => ({ ...agent, uri: URI.from(agent.uri) }));
            // Should find agents from both workspace and user data
            assert.strictEqual(result.length, 3, 'Should find 3 agents (1 workspace + 2 user data)');
            const workspaceAgent = result.find(a => a.source.storage === PromptsStorage.local);
            assert.ok(workspaceAgent, 'Should find workspace agent');
            assert.strictEqual(workspaceAgent.name, 'workspace-agent');
            assert.strictEqual(workspaceAgent.description, 'Workspace agent.');
            const userAgents = result.filter(a => a.source.storage === PromptsStorage.user);
            assert.strictEqual(userAgents.length, 2, 'Should find 2 user data agents');
            const userAgentWithHeader = userAgents.find(a => a.name === 'user-agent');
            assert.ok(userAgentWithHeader, 'Should find user agent with header');
            assert.strictEqual(userAgentWithHeader.description, 'User data agent.');
            assert.deepStrictEqual(userAgentWithHeader.tools, ['user-tool']);
            const simpleUserAgent = userAgents.find(a => a.name === 'simple-user-agent');
            assert.ok(simpleUserAgent, 'Should find simple user agent');
            assert.strictEqual(simpleUserAgent.agentInstructions.content, 'A simple user agent without header.');
        });
    });
    suite('listPromptFiles - prompts', () => {
        test('prompts from user data folder', async () => {
            const rootFolderName = 'prompts-user-data';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            const userPromptsFolder = '/user-data/prompts';
            const userPromptsFolderUri = URI.file(userPromptsFolder);
            // Override the user data profile service
            const customUserDataProfileService = {
                _serviceBrand: undefined,
                onDidChangeCurrentProfile: Event.None,
                currentProfile: {
                    ...toUserDataProfile('test', 'test', URI.file(userPromptsFolder).with({ path: '/user-data' }), URI.file('/cache')),
                    promptsHome: userPromptsFolderUri,
                },
                updateCurrentProfile: async () => { }
            };
            instaService.stub(IUserDataProfileService, customUserDataProfileService);
            // Recreate the service with the new stub (dispose existing to avoid duplicate filesystem registration)
            service.dispose();
            const testService = disposables.add(instaService.createInstance(PromptsService));
            // Create prompt files in both workspace and user data folder
            await mockFiles(fileService, [
                // Workspace prompt
                {
                    path: `${rootFolder}/.github/prompts/workspace-prompt.prompt.md`,
                    contents: [
                        '---',
                        'description: \'Workspace prompt.\'',
                        '---',
                        'I am a workspace prompt.',
                    ]
                },
                // User data prompt
                {
                    path: `${userPromptsFolder}/user-prompt.prompt.md`,
                    contents: [
                        '---',
                        'description: \'User data prompt.\'',
                        '---',
                        'I am a user data prompt.',
                    ]
                }
            ]);
            const result = await testService.listPromptFiles(PromptsType.prompt, CancellationToken.None);
            // Should find prompts from both workspace and user data
            assert.strictEqual(result.length, 2, 'Should find 2 prompts (1 workspace + 1 user data)');
            const workspacePrompt = result.find(p => p.storage === PromptsStorage.local);
            assert.ok(workspacePrompt, 'Should find workspace prompt');
            assert.ok(workspacePrompt.uri.path.includes('workspace-prompt.prompt.md'));
            const userPrompt = result.find(p => p.storage === PromptsStorage.user);
            assert.ok(userPrompt, 'Should find user data prompt');
            assert.ok(userPrompt.uri.path.includes('user-prompt.prompt.md'));
        });
    });
    suite('listPromptFiles - instructions', () => {
        test('instructions from user data folder', async () => {
            const rootFolderName = 'instructions-user-data';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            const userPromptsFolder = '/user-data/prompts';
            const userPromptsFolderUri = URI.file(userPromptsFolder);
            // Override the user data profile service
            const customUserDataProfileService = {
                _serviceBrand: undefined,
                onDidChangeCurrentProfile: Event.None,
                currentProfile: {
                    ...toUserDataProfile('test', 'test', URI.file(userPromptsFolder).with({ path: '/user-data' }), URI.file('/cache')),
                    promptsHome: userPromptsFolderUri,
                },
                updateCurrentProfile: async () => { }
            };
            instaService.stub(IUserDataProfileService, customUserDataProfileService);
            // Recreate the service with the new stub (dispose existing to avoid duplicate filesystem registration)
            service.dispose();
            const testService = disposables.add(instaService.createInstance(PromptsService));
            // Create instructions files in both workspace and user data folder
            await mockFiles(fileService, [
                // Workspace instructions
                {
                    path: `${rootFolder}/.github/instructions/workspace-instructions.instructions.md`,
                    contents: [
                        '---',
                        'description: \'Workspace instructions.\'',
                        'applyTo: "**/*.ts"',
                        '---',
                        'I am workspace instructions.',
                    ]
                },
                // User data instructions
                {
                    path: `${userPromptsFolder}/user-instructions.instructions.md`,
                    contents: [
                        '---',
                        'description: \'User data instructions.\'',
                        'applyTo: "**/*.tsx"',
                        '---',
                        'I am user data instructions.',
                    ]
                }
            ]);
            const result = await testService.listPromptFiles(PromptsType.instructions, CancellationToken.None);
            // Should find instructions from both workspace and user data
            assert.strictEqual(result.length, 2, 'Should find 2 instructions (1 workspace + 1 user data)');
            const workspaceInstructions = result.find(p => p.storage === PromptsStorage.local);
            assert.ok(workspaceInstructions, 'Should find workspace instructions');
            assert.ok(workspaceInstructions.uri.path.includes('workspace-instructions.instructions.md'));
            const userInstructions = result.find(p => p.storage === PromptsStorage.user);
            assert.ok(userInstructions, 'Should find user data instructions');
            assert.ok(userInstructions.uri.path.includes('user-instructions.instructions.md'));
        });
    });
    suite('listPromptFiles - skills ', () => {
        teardown(() => {
            sinon.restore();
        });
        test('should list skill files from workspace', async () => {
            testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
            testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
            const rootFolderName = 'list-skills-workspace';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/.github/skills/skill1/SKILL.md`,
                    contents: [
                        '---',
                        'name: "Skill 1"',
                        'description: "First skill"',
                        '---',
                        'Skill 1 content',
                    ],
                },
                {
                    path: `${rootFolder}/.claude/skills/skill2/SKILL.md`,
                    contents: [
                        '---',
                        'name: "Skill 2"',
                        'description: "Second skill"',
                        '---',
                        'Skill 2 content',
                    ],
                },
            ]);
            const result = await service.listPromptFiles(PromptsType.skill, CancellationToken.None);
            assert.strictEqual(result.length, 2, 'Should find 2 skills');
            const skill1 = result.find(s => s.uri.path.includes('skill1'));
            assert.ok(skill1, 'Should find skill1');
            assert.strictEqual(skill1.type, PromptsType.skill);
            assert.strictEqual(skill1.storage, PromptsStorage.local);
            const skill2 = result.find(s => s.uri.path.includes('skill2'));
            assert.ok(skill2, 'Should find skill2');
            assert.strictEqual(skill2.type, PromptsType.skill);
            assert.strictEqual(skill2.storage, PromptsStorage.local);
        });
        test('should list skill files from user home', async () => {
            testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
            testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
            const rootFolderName = 'list-skills-user-home';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            await mockFiles(fileService, [
                {
                    path: '/home/user/.copilot/skills/personal-skill/SKILL.md',
                    contents: [
                        '---',
                        'name: "Personal Skill"',
                        'description: "A personal skill"',
                        '---',
                        'Personal skill content',
                    ],
                },
                {
                    path: '/home/user/.claude/skills/claude-personal/SKILL.md',
                    contents: [
                        '---',
                        'name: "Claude Personal Skill"',
                        'description: "A Claude personal skill"',
                        '---',
                        'Claude personal skill content',
                    ],
                },
            ]);
            const result = await service.listPromptFiles(PromptsType.skill, CancellationToken.None);
            const personalSkills = result.filter(s => s.storage === PromptsStorage.user);
            assert.strictEqual(personalSkills.length, 2, 'Should find 2 personal skills');
            const copilotSkill = personalSkills.find(s => s.uri.path.includes('.copilot'));
            assert.ok(copilotSkill, 'Should find copilot personal skill');
            const claudeSkill = personalSkills.find(s => s.uri.path.includes(CLAUDE_CONFIG_FOLDER));
            assert.ok(claudeSkill, 'Should find claude personal skill');
        });
        test('should not list skills when not in skill folder structure', async () => {
            testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
            const rootFolderName = 'no-skills';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            // Create files in non-skill locations
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/.github/prompts/SKILL.md`,
                    contents: [
                        '---',
                        'name: "Not a skill"',
                        '---',
                        'This is in prompts folder, not skills',
                    ],
                },
                {
                    path: `${rootFolder}/SKILL.md`,
                    contents: [
                        '---',
                        'name: "Root skill"',
                        '---',
                        'This is in root, not skills folder',
                    ],
                },
            ]);
            const result = await service.listPromptFiles(PromptsType.skill, CancellationToken.None);
            assert.strictEqual(result.length, 0, 'Should not find any skills in non-skill locations');
        });
        test('should handle mixed workspace and user home skills', async () => {
            testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
            testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
            const rootFolderName = 'mixed-skills';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            await mockFiles(fileService, [
                // Workspace skills
                {
                    path: `${rootFolder}/.github/skills/workspace-skill/SKILL.md`,
                    contents: [
                        '---',
                        'name: "Workspace Skill"',
                        'description: "A workspace skill"',
                        '---',
                        'Workspace skill content',
                    ],
                },
                // User home skills
                {
                    path: '/home/user/.copilot/skills/personal-skill/SKILL.md',
                    contents: [
                        '---',
                        'name: "Personal Skill"',
                        'description: "A personal skill"',
                        '---',
                        'Personal skill content',
                    ],
                },
            ]);
            const result = await service.listPromptFiles(PromptsType.skill, CancellationToken.None);
            const workspaceSkills = result.filter(s => s.storage === PromptsStorage.local);
            const userSkills = result.filter(s => s.storage === PromptsStorage.user);
            assert.strictEqual(workspaceSkills.length, 1, 'Should find 1 workspace skill');
            assert.strictEqual(userSkills.length, 1, 'Should find 1 user skill');
        });
        test('should respect disabled default paths via config', async () => {
            testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
            // Disable .github/skills, only .claude/skills should be searched
            testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {
                '.github/skills': false,
                '.claude/skills': true,
            });
            const rootFolderName = 'disabled-default-test';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/.github/skills/github-skill/SKILL.md`,
                    contents: [
                        '---',
                        'name: "GitHub Skill"',
                        'description: "Should NOT be found"',
                        '---',
                        'This skill is in a disabled folder',
                    ],
                },
                {
                    path: `${rootFolder}/.claude/skills/claude-skill/SKILL.md`,
                    contents: [
                        '---',
                        'name: "Claude Skill"',
                        'description: "Should be found"',
                        '---',
                        'This skill is in an enabled folder',
                    ],
                },
            ]);
            const result = await service.listPromptFiles(PromptsType.skill, CancellationToken.None);
            assert.strictEqual(result.length, 1, 'Should find only 1 skill (from enabled folder)');
            assert.ok(result[0].uri.path.includes('.claude/skills'), 'Should only find skill from .claude/skills');
            assert.ok(!result[0].uri.path.includes('.github/skills'), 'Should not find skill from disabled .github/skills');
        });
        test('should expand tilde paths in custom locations', async () => {
            testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
            // Add a tilde path as custom location
            testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {
                '.github/skills': false,
                '.claude/skills': false,
                '~/my-custom-skills': true,
            });
            const rootFolderName = 'tilde-test';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            // The mock user home is /home/user, so ~/my-custom-skills should resolve to /home/user/my-custom-skills
            await mockFiles(fileService, [
                {
                    path: '/home/user/my-custom-skills/custom-skill/SKILL.md',
                    contents: [
                        '---',
                        'name: "Custom Skill"',
                        'description: "A skill from tilde path"',
                        '---',
                        'Skill content from ~/my-custom-skills',
                    ],
                },
            ]);
            const result = await service.listPromptFiles(PromptsType.skill, CancellationToken.None);
            assert.strictEqual(result.length, 1, 'Should find 1 skill from tilde-expanded path');
            assert.ok(result[0].uri.path.includes('/home/user/my-custom-skills'), 'Path should be expanded from tilde');
        });
    });
    suite('listPromptFiles - extensions', () => {
        test('Contributed prompt file', async () => {
            const uri = URI.parse('file://extensions/my-extension/textMate.instructions.md');
            const extension = {};
            const registered = service.registerContributedFile(PromptsType.instructions, uri, extension, 'TextMate Instructions', 'Instructions to follow when authoring TextMate grammars');
            const actual = await service.listPromptFiles(PromptsType.instructions, CancellationToken.None);
            assert.strictEqual(actual.length, 1);
            assert.strictEqual(actual[0].uri.toString(), uri.toString());
            assert.strictEqual(actual[0].name, 'TextMate Instructions');
            assert.strictEqual(actual[0].storage, PromptsStorage.extension);
            assert.strictEqual(actual[0].type, PromptsType.instructions);
            registered.dispose();
        });
        test('getInstructionFiles returns resolved metadata', async () => {
            const uri = URI.parse('file://extensions/my-extension/textMate.instructions.md');
            const extension = {
                identifier: { value: 'test.my-extension' }
            };
            await mockFiles(fileService, [{
                    path: uri.path,
                    contents: [
                        '---',
                        'name: TextMate Instructions',
                        'description: Instructions to follow when authoring TextMate grammars',
                        'applyTo: "**/*.tmLanguage.json"',
                        '---',
                        'Use scopes carefully.',
                    ]
                }]);
            const registered = service.registerContributedFile(PromptsType.instructions, uri, extension, undefined, undefined);
            const actual = await service.getInstructionFiles(CancellationToken.None);
            assert.deepStrictEqual(actual.map(({ uri, name, description, pattern, storage, source, pluginUri, extension }) => ({ uri, name, description, applyTo: pattern, storage, source, pluginUri, extension })), [{
                    uri,
                    name: 'TextMate Instructions',
                    description: 'Instructions to follow when authoring TextMate grammars',
                    applyTo: '**/*.tmLanguage.json',
                    storage: PromptsStorage.extension,
                    source: PromptFileSource.ExtensionContribution,
                    pluginUri: undefined,
                    extension,
                }]);
            registered.dispose();
        });
        test('Custom agent provider', async () => {
            const agentUri = URI.parse('file://extensions/my-extension/myAgent.agent.md');
            const extension = {
                identifier: { value: 'test.my-extension' },
                enabledApiProposals: ['chatParticipantPrivate']
            };
            // Mock the agent file content
            await mockFiles(fileService, [
                {
                    path: agentUri.path,
                    contents: [
                        '---',
                        'description: \'My custom agent from provider\'',
                        'tools: [ tool1, tool2 ]',
                        '---',
                        'I am a custom agent from a provider.',
                    ]
                }
            ]);
            const provider = {
                providePromptFiles: async (_context, _token) => {
                    return [
                        {
                            uri: agentUri
                        }
                    ];
                }
            };
            const registered = service.registerPromptFileProvider(extension, PromptsType.agent, provider);
            const actual = await service.getCustomAgents(CancellationToken.None);
            assert.strictEqual(actual.length, 1);
            assert.strictEqual(actual[0].name, 'myAgent');
            assert.strictEqual(actual[0].description, 'My custom agent from provider');
            assert.strictEqual(actual[0].uri.toString(), agentUri.toString());
            assert.strictEqual(actual[0].source.storage, PromptsStorage.extension);
            registered.dispose();
            // After disposal, the agent should no longer be listed
            const actualAfterDispose = await service.getCustomAgents(CancellationToken.None);
            assert.strictEqual(actualAfterDispose.length, 0);
        });
        test('Contributed agent file that does not exist should not crash', async () => {
            const nonExistentUri = URI.parse('file://extensions/my-extension/nonexistent.agent.md');
            const existingUri = URI.parse('file://extensions/my-extension/existing.agent.md');
            const extension = {
                identifier: { value: 'test.my-extension' }
            };
            // Only create the existing file
            await mockFiles(fileService, [
                {
                    path: existingUri.path,
                    contents: [
                        '---',
                        'name: \'Existing Agent\'',
                        'description: \'An agent that exists\'',
                        '---',
                        'I am an existing agent.',
                    ]
                }
            ]);
            // Register both agents (one exists, one doesn't)
            const registered1 = service.registerContributedFile(PromptsType.agent, nonExistentUri, extension, 'NonExistent Agent', 'An agent that does not exist');
            const registered2 = service.registerContributedFile(PromptsType.agent, existingUri, extension, 'Existing Agent', 'An agent that exists');
            // Verify that getCustomAgents doesn't crash and returns only the valid agent
            const agents = await service.getCustomAgents(CancellationToken.None);
            // Should only get the existing agent, not the non-existent one
            assert.strictEqual(agents.length, 1, 'Should only return the agent that exists');
            assert.strictEqual(agents[0].name, 'Existing Agent');
            assert.strictEqual(agents[0].description, 'An agent that exists');
            assert.strictEqual(agents[0].uri.toString(), existingUri.toString());
            registered1.dispose();
            registered2.dispose();
        });
        test('Contributed file with when clause is filtered by context key', async () => {
            const uri = URI.parse('file://extensions/my-extension/conditional.instructions.md');
            const extension = {};
            // Create a mock context key service that we can control
            let matchResult = false;
            const contextKeyChangeEmitter = disposables.add(new Emitter());
            const testContextKeyService = new class extends MockContextKeyService {
                contextMatchesRules() {
                    return matchResult;
                }
                get onDidChangeContext() {
                    return contextKeyChangeEmitter.event;
                }
            }();
            instaService.stub(IContextKeyService, testContextKeyService);
            service.dispose();
            const testService = disposables.add(instaService.createInstance(PromptsService));
            const registered = testService.registerContributedFile(PromptsType.instructions, uri, extension, 'Conditional Instructions', 'Only when enabled', 'myFeature.enabled');
            // When clause is false - should be filtered out
            const before = await testService.listPromptFiles(PromptsType.instructions, CancellationToken.None);
            assert.strictEqual(before.length, 0, 'Should be filtered out when context key is false');
            // Change context to make when clause true
            matchResult = true;
            contextKeyChangeEmitter.fire({
                affectsSome: (keys) => keys.has('myFeature.enabled'),
                allKeysContainedIn: () => false,
            });
            const after = await testService.listPromptFiles(PromptsType.instructions, CancellationToken.None);
            assert.strictEqual(after.length, 1, 'Should be included when context key is true');
            assert.strictEqual(after[0].uri.toString(), uri.toString());
            registered.dispose();
            // Restore original stub
            instaService.stub(IContextKeyService, new MockContextKeyService());
        });
    });
    suite('listPromptFiles - parent repo folder', () => {
        test('should find prompts, instructions, and agents in a parent repo folder', async () => {
            const parentFolder = '/repos/collect-prompt-parent-test';
            const rootFolder = `${parentFolder}/repo`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            await mockFiles(fileService, [
                // .git in parent marks it as a repo root
                {
                    path: `${parentFolder}/.git/HEAD`,
                    contents: ['ref: refs/heads/main'],
                },
                // Applying instruction in parent
                {
                    path: `${parentFolder}/.github/instructions/typescript.instructions.md`,
                    contents: [
                        '---',
                        'description: \'Parent TypeScript instructions\'',
                        'applyTo: "**/*.ts"',
                        '---',
                        'Parent TypeScript coding standards',
                    ]
                },
                // Prompt file in parent
                {
                    path: `${parentFolder}/.github/prompts/help.prompt.md`,
                    contents: [
                        '---',
                        'description: \'Parent help prompt\'',
                        '---',
                        'Help the user with their question',
                    ]
                },
                // Agent file in parent
                {
                    path: `${parentFolder}/.github/agents/reviewer.agent.md`,
                    contents: [
                        '---',
                        'description: \'Parent code reviewer agent\'',
                        '---',
                        'You are a code reviewer',
                    ]
                },
                {
                    path: `${rootFolder}/src/file.ts`,
                    contents: ['console.log("test");'],
                },
            ]);
            await testConfigService.setUserConfiguration(PromptsConfig.INCLUDE_APPLYING_INSTRUCTIONS, true);
            await testConfigService.setUserConfiguration(PromptsConfig.USE_CUSTOMIZATIONS_IN_PARENT_REPOS, false);
            // With parent search disabled, should not find parent files
            let promptFiles = await service.listPromptFiles(PromptsType.prompt, CancellationToken.None);
            let agentFiles = await service.listPromptFiles(PromptsType.agent, CancellationToken.None);
            let instructionFiles = await service.listPromptFiles(PromptsType.instructions, CancellationToken.None);
            assert.ok(!promptFiles.some(f => f.uri.path.includes(parentFolder)), 'Should not find parent prompt files when parent search is disabled');
            assert.ok(!agentFiles.some(f => f.uri.path.includes(parentFolder)), 'Should not find parent agent files when parent search is disabled');
            assert.ok(!instructionFiles.some(f => f.uri.path.includes(parentFolder)), 'Should not find parent instruction files when parent search is disabled');
            // With parent search enabled, should find parent files
            testConfigService.setUserConfiguration(PromptsConfig.USE_CUSTOMIZATIONS_IN_PARENT_REPOS, true);
            fireConfigChange(testConfigService, PromptsConfig.USE_CUSTOMIZATIONS_IN_PARENT_REPOS);
            promptFiles = await service.listPromptFiles(PromptsType.prompt, CancellationToken.None);
            agentFiles = await service.listPromptFiles(PromptsType.agent, CancellationToken.None);
            instructionFiles = await service.listPromptFiles(PromptsType.instructions, CancellationToken.None);
            const promptPaths = promptFiles.map(f => f.uri.path);
            const agentPaths = agentFiles.map(f => f.uri.path);
            const instructionPaths = instructionFiles.map(f => f.uri.path);
            assert.ok(promptPaths.includes(`${parentFolder}/.github/prompts/help.prompt.md`), 'Should find parent prompt file when parent search is enabled');
            assert.ok(agentPaths.includes(`${parentFolder}/.github/agents/reviewer.agent.md`), 'Should find parent agent file when parent search is enabled');
            assert.ok(instructionPaths.includes(`${parentFolder}/.github/instructions/typescript.instructions.md`), 'Should find parent instruction file when parent search is enabled');
        });
        test('should not find files in an untrusted parent repo folder', async () => {
            const parentFolder = '/repos/untrusted-parent-test';
            const rootFolder = `${parentFolder}/repo`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            await mockFiles(fileService, [
                // .git in parent marks it as a repo root
                {
                    path: `${parentFolder}/.git/HEAD`,
                    contents: ['ref: refs/heads/main'],
                },
                // Applying instruction in parent
                {
                    path: `${parentFolder}/.github/instructions/typescript.instructions.md`,
                    contents: [
                        '---',
                        'description: \'Parent TypeScript instructions\'',
                        'applyTo: "**/*.ts"',
                        '---',
                        'Parent TypeScript coding standards',
                    ]
                },
                // Prompt file in parent
                {
                    path: `${parentFolder}/.github/prompts/help.prompt.md`,
                    contents: [
                        '---',
                        'description: \'Parent help prompt\'',
                        '---',
                        'Help the user with their question',
                    ]
                },
                // Agent file in parent
                {
                    path: `${parentFolder}/.github/agents/reviewer.agent.md`,
                    contents: [
                        '---',
                        'description: \'Parent code reviewer agent\'',
                        '---',
                        'You are a code reviewer',
                    ]
                },
                {
                    path: `${rootFolder}/src/file.ts`,
                    contents: ['console.log("test");'],
                },
            ]);
            testConfigService.setUserConfiguration(PromptsConfig.INCLUDE_APPLYING_INSTRUCTIONS, true);
            testConfigService.setUserConfiguration(PromptsConfig.USE_CUSTOMIZATIONS_IN_PARENT_REPOS, true);
            fireConfigChange(testConfigService, PromptsConfig.INCLUDE_APPLYING_INSTRUCTIONS, PromptsConfig.USE_CUSTOMIZATIONS_IN_PARENT_REPOS);
            // Mark the parent repo root as untrusted
            workspaceTrustService.getUriTrustInfo = (uri) => {
                if (uri.path === parentFolder) {
                    return Promise.resolve({ trusted: false, uri });
                }
                return Promise.resolve({ trusted: true, uri });
            };
            const promptFiles = await service.listPromptFiles(PromptsType.prompt, CancellationToken.None);
            const agentFiles = await service.listPromptFiles(PromptsType.agent, CancellationToken.None);
            const instructionFiles = await service.listPromptFiles(PromptsType.instructions, CancellationToken.None);
            assert.ok(!promptFiles.some(f => f.uri.path.includes(parentFolder)), 'Should not find parent prompt files when parent repo is untrusted');
            assert.ok(!agentFiles.some(f => f.uri.path.includes(parentFolder)), 'Should not find parent agent files when parent repo is untrusted');
            assert.ok(!instructionFiles.some(f => f.uri.path.includes(parentFolder)), 'Should not find parent instruction files when parent repo is untrusted');
        });
    });
    test('Instructions provider', async () => {
        const instructionUri = URI.parse('file://extensions/my-extension/myInstruction.instructions.md');
        const extension = {
            identifier: { value: 'test.my-extension' },
            enabledApiProposals: ['chatParticipantPrivate']
        };
        // Mock the instruction file content
        await mockFiles(fileService, [
            {
                path: instructionUri.path,
                contents: [
                    '# Test instruction content'
                ]
            }
        ]);
        const provider = {
            providePromptFiles: async (_context, _token) => {
                return [
                    {
                        uri: instructionUri
                    }
                ];
            }
        };
        const registered = service.registerPromptFileProvider(extension, PromptsType.instructions, provider);
        const actual = await service.listPromptFiles(PromptsType.instructions, CancellationToken.None);
        const providerInstruction = actual.find(i => i.uri.toString() === instructionUri.toString());
        assert.ok(providerInstruction, 'Provider instruction should be found');
        assert.strictEqual(providerInstruction.uri.toString(), instructionUri.toString());
        assert.strictEqual(providerInstruction.storage, PromptsStorage.extension);
        assert.strictEqual(providerInstruction.source, PromptFileSource.ExtensionAPI);
        registered.dispose();
        // After disposal, the instruction should no longer be listed
        const actualAfterDispose = await service.listPromptFiles(PromptsType.instructions, CancellationToken.None);
        const foundAfterDispose = actualAfterDispose.find(i => i.uri.toString() === instructionUri.toString());
        assert.strictEqual(foundAfterDispose, undefined);
    });
    test('Prompt file provider', async () => {
        const promptUri = URI.parse('file://extensions/my-extension/myPrompt.prompt.md');
        const extension = {
            identifier: { value: 'test.my-extension' },
            enabledApiProposals: ['chatParticipantPrivate']
        };
        // Mock the prompt file content
        await mockFiles(fileService, [
            {
                path: promptUri.path,
                contents: [
                    '# Test prompt content'
                ]
            }
        ]);
        const provider = {
            providePromptFiles: async (_context, _token) => {
                return [
                    {
                        uri: promptUri
                    }
                ];
            }
        };
        const registered = service.registerPromptFileProvider(extension, PromptsType.prompt, provider);
        const actual = await service.listPromptFiles(PromptsType.prompt, CancellationToken.None);
        const providerPrompt = actual.find(i => i.uri.toString() === promptUri.toString());
        assert.ok(providerPrompt, 'Provider prompt should be found');
        assert.strictEqual(providerPrompt.uri.toString(), promptUri.toString());
        assert.strictEqual(providerPrompt.storage, PromptsStorage.extension);
        assert.strictEqual(providerPrompt.source, PromptFileSource.ExtensionAPI);
        registered.dispose();
        // After disposal, the prompt should no longer be listed
        const actualAfterDispose = await service.listPromptFiles(PromptsType.prompt, CancellationToken.None);
        const foundAfterDispose = actualAfterDispose.find(i => i.uri.toString() === promptUri.toString());
        assert.strictEqual(foundAfterDispose, undefined);
    });
    test('Skill file provider', async () => {
        const skillUri = URI.parse('file://extensions/my-extension/mySkill/SKILL.md');
        const extension = {
            identifier: { value: 'test.my-extension' },
            enabledApiProposals: ['chatParticipantPrivate']
        };
        // Mock the skill file content
        await mockFiles(fileService, [
            {
                path: skillUri.path,
                contents: [
                    '---',
                    'name: "My Custom Skill"',
                    'description: "A custom skill from provider"',
                    '---',
                    'Custom skill content.',
                ]
            }
        ]);
        const provider = {
            providePromptFiles: async (_context, _token) => {
                return [
                    {
                        uri: skillUri
                    }
                ];
            }
        };
        const registered = service.registerPromptFileProvider(extension, PromptsType.skill, provider);
        const actual = await service.listPromptFiles(PromptsType.skill, CancellationToken.None);
        const providerSkill = actual.find(i => i.uri.toString() === skillUri.toString());
        assert.ok(providerSkill, 'Provider skill should be found');
        assert.strictEqual(providerSkill.uri.toString(), skillUri.toString());
        assert.strictEqual(providerSkill.storage, PromptsStorage.extension);
        assert.strictEqual(providerSkill.source, PromptFileSource.ExtensionAPI);
        registered.dispose();
        // After disposal, the skill should no longer be listed
        const actualAfterDispose = await service.listPromptFiles(PromptsType.skill, CancellationToken.None);
        const foundAfterDispose = actualAfterDispose.find(i => i.uri.toString() === skillUri.toString());
        assert.strictEqual(foundAfterDispose, undefined);
    });
    suite('findAgentSkills', () => {
        teardown(() => {
            sinon.restore();
        });
        test('should return undefined when USE_AGENT_SKILLS is disabled', async () => {
            testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, false);
            const result = await service.findAgentSkills(CancellationToken.None);
            assert.strictEqual(result, undefined);
        });
        test('should find skills in workspace and user home', async () => {
            testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
            testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
            const rootFolderName = 'agent-skills-test';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            // Create mock filesystem with skills in both .github/skills and .claude/skills
            // Folder names must match the skill names exactly (per agentskills.io specification)
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/.github/skills/GitHub Skill 1/SKILL.md`,
                    contents: [
                        '---',
                        'name: "GitHub Skill 1"',
                        'description: "A GitHub skill for testing"',
                        '---',
                        'This is GitHub skill 1 content',
                    ],
                },
                {
                    path: `${rootFolder}/.claude/skills/Claude Skill 1/SKILL.md`,
                    contents: [
                        '---',
                        'name: "Claude Skill 1"',
                        'description: "A Claude skill for testing"',
                        '---',
                        'This is Claude skill 1 content',
                    ],
                },
                {
                    path: `${rootFolder}/.claude/skills/invalid-skill/SKILL.md`,
                    contents: [
                        '---',
                        'description: "Invalid skill, no name"',
                        '---',
                        'This is invalid skill content',
                    ],
                },
                {
                    path: `${rootFolder}/.github/skills/not-a-skill-dir/README.md`,
                    contents: ['This is not a skill'],
                },
                {
                    path: '/home/user/.claude/skills/Personal Skill 1/SKILL.md',
                    contents: [
                        '---',
                        'name: "Personal Skill 1"',
                        'description: "A personal skill for testing"',
                        '---',
                        'This is personal skill 1 content',
                    ],
                },
                {
                    path: '/home/user/.claude/skills/not-a-skill/other-file.md',
                    contents: ['Not a skill file'],
                },
                {
                    path: '/home/user/.copilot/skills/Copilot Skill 1/SKILL.md',
                    contents: [
                        '---',
                        'name: "Copilot Skill 1"',
                        'description: "A Copilot skill for testing"',
                        '---',
                        'This is Copilot skill 1 content',
                    ],
                },
            ]);
            const allResult = await service.findAgentSkills(CancellationToken.None);
            assert.ok(allResult, 'Should return results when agent skills are enabled');
            const result = allResult;
            assert.strictEqual(result.length, 5, 'Should find 5 skills total');
            // Check project skills (both from .github/skills and .claude/skills)
            const projectSkills = result.filter(skill => skill.storage === PromptsStorage.local);
            assert.strictEqual(projectSkills.length, 3, 'Should find 3 project skills');
            const githubSkill1 = projectSkills.find(skill => skill.name === 'GitHub Skill 1');
            assert.ok(githubSkill1, 'Should find GitHub skill 1');
            assert.strictEqual(githubSkill1.description, 'A GitHub skill for testing');
            assert.strictEqual(githubSkill1.uri.path, `${rootFolder}/.github/skills/GitHub Skill 1/SKILL.md`);
            const claudeSkill1 = projectSkills.find(skill => skill.name === 'Claude Skill 1');
            assert.ok(claudeSkill1, 'Should find Claude skill 1');
            assert.strictEqual(claudeSkill1.description, 'A Claude skill for testing');
            assert.strictEqual(claudeSkill1.uri.path, `${rootFolder}/.claude/skills/Claude Skill 1/SKILL.md`);
            // The invalid-skill (no name attribute) should now use folder name as fallback
            const invalidSkill = projectSkills.find(skill => skill.name === 'invalid-skill');
            assert.ok(invalidSkill, 'Should find invalid-skill using folder name as fallback');
            assert.strictEqual(invalidSkill.description, 'Invalid skill, no name');
            assert.strictEqual(invalidSkill.uri.path, `${rootFolder}/.claude/skills/invalid-skill/SKILL.md`);
            // Check personal skills
            const personalSkills = result.filter(skill => skill.storage === PromptsStorage.user);
            assert.strictEqual(personalSkills.length, 2, 'Should find 2 personal skills');
            const personalSkill1 = personalSkills.find(skill => skill.name === 'Personal Skill 1');
            assert.ok(personalSkill1, 'Should find Personal Skill 1');
            assert.strictEqual(personalSkill1.description, 'A personal skill for testing');
            assert.strictEqual(personalSkill1.uri.path, '/home/user/.claude/skills/Personal Skill 1/SKILL.md');
            const copilotSkill1 = personalSkills.find(skill => skill.name === 'Copilot Skill 1');
            assert.ok(copilotSkill1, 'Should find Copilot Skill 1');
            assert.strictEqual(copilotSkill1.description, 'A Copilot skill for testing');
            assert.strictEqual(copilotSkill1.uri.path, '/home/user/.copilot/skills/Copilot Skill 1/SKILL.md');
        });
        test('should handle parsing errors gracefully', async () => {
            testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
            testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
            const rootFolderName = 'skills-error-test';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            // Create mock filesystem with malformed skill file in .github/skills
            // Folder names must match the skill names exactly
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/.github/skills/Valid Skill/SKILL.md`,
                    contents: [
                        '---',
                        'name: "Valid Skill"',
                        'description: "A valid skill"',
                        '---',
                        'Valid skill content',
                    ],
                },
                {
                    path: `${rootFolder}/.claude/skills/invalid-skill/SKILL.md`,
                    contents: [
                        '---',
                        'invalid yaml: [unclosed',
                        '---',
                        'Invalid skill content',
                    ],
                },
            ]);
            const allResult = await service.findAgentSkills(CancellationToken.None);
            // Should return both skills - the malformed one uses folder name as fallback
            assert.ok(allResult, 'Should return results even with parsing errors');
            const result = allResult;
            assert.strictEqual(result.length, 2, 'Should find 2 skills');
            const validSkill = result.find(s => s.name === 'Valid Skill');
            assert.ok(validSkill, 'Should find the valid skill');
            assert.strictEqual(validSkill.storage, PromptsStorage.local);
            const invalidSkill = result.find(s => s.name === 'invalid-skill');
            assert.ok(invalidSkill, 'Should find skill with folder name as fallback despite malformed YAML');
            assert.strictEqual(invalidSkill.storage, PromptsStorage.local);
        });
        test('should return empty array when no skills found', async () => {
            testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
            const rootFolderName = 'empty-workspace';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            // Create empty mock filesystem
            await mockFiles(fileService, []);
            const allResult = await service.findAgentSkills(CancellationToken.None);
            assert.ok(allResult, 'Should return results array');
            const result = allResult;
            assert.strictEqual(result.length, 0, 'Should find no skills');
        });
        test('should truncate long names and descriptions', async () => {
            testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
            testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
            const rootFolderName = 'truncation-test';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            const longName = 'A'.repeat(100); // Exceeds 64 characters
            const truncatedName = 'A'.repeat(64); // Expected after truncation
            const longDescription = 'B'.repeat(1500); // Exceeds 1024 characters
            await mockFiles(fileService, [
                {
                    // Folder name must match the truncated skill name
                    path: `${rootFolder}/.github/skills/${truncatedName}/SKILL.md`,
                    contents: [
                        '---',
                        `name: "${longName}"`,
                        `description: "${longDescription}"`,
                        '---',
                        'Skill content',
                    ],
                },
            ]);
            const allResult = await service.findAgentSkills(CancellationToken.None);
            assert.ok(allResult, 'Should return results');
            const result = allResult;
            assert.strictEqual(result.length, 1, 'Should find 1 skill');
            assert.strictEqual(result[0].name.length, 64, 'Name should be truncated to 64 characters');
            assert.strictEqual(result[0].description?.length, 1024, 'Description should be truncated to 1024 characters');
        });
        test('should remove XML tags from name and description', async () => {
            testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
            testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
            const rootFolderName = 'xml-test';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            // Folder name must match the sanitized skill name (with XML tags removed)
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/.github/skills/Skill with XML tags/SKILL.md`,
                    contents: [
                        '---',
                        'name: "Skill <b>with</b> <em>XML</em> tags"',
                        'description: "Description with <strong>HTML</strong> and <span>other</span> tags"',
                        '---',
                        'Skill content',
                    ],
                },
            ]);
            const allResult = await service.findAgentSkills(CancellationToken.None);
            assert.ok(allResult, 'Should return results');
            const result = allResult;
            assert.strictEqual(result.length, 1, 'Should find 1 skill');
            assert.strictEqual(result[0].name, 'Skill with XML tags', 'XML tags should be removed from name');
            assert.strictEqual(result[0].description, 'Description with HTML and other tags', 'XML tags should be removed from description');
        });
        test('should handle both truncation and XML removal', async () => {
            testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
            testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
            const rootFolderName = 'combined-test';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            const longNameWithXml = '<p>' + 'A'.repeat(100) + '</p>'; // Exceeds 64 chars and has XML
            const truncatedName = 'A'.repeat(64); // Expected after XML removal and truncation
            const longDescWithXml = '<div>' + 'B'.repeat(1500) + '</div>'; // Exceeds 1024 chars and has XML
            // Folder name must match the fully sanitized skill name
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/.github/skills/${truncatedName}/SKILL.md`,
                    contents: [
                        '---',
                        `name: "${longNameWithXml}"`,
                        `description: "${longDescWithXml}"`,
                        '---',
                        'Skill content',
                    ],
                },
            ]);
            const allResult = await service.findAgentSkills(CancellationToken.None);
            assert.ok(allResult, 'Should return results');
            const result = allResult;
            assert.strictEqual(result.length, 1, 'Should find 1 skill');
            // XML tags are removed first, then truncation happens
            assert.ok(!result[0].name.includes('<'), 'Name should not contain XML tags');
            assert.ok(!result[0].name.includes('>'), 'Name should not contain XML tags');
            assert.strictEqual(result[0].name.length, 64, 'Name should be truncated to 64 characters');
            assert.ok(!result[0].description?.includes('<'), 'Description should not contain XML tags');
            assert.ok(!result[0].description?.includes('>'), 'Description should not contain XML tags');
            assert.strictEqual(result[0].description?.length, 1024, 'Description should be truncated to 1024 characters');
        });
        test('should skip duplicate skill names and keep first by priority', async () => {
            testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
            testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
            const rootFolderName = 'duplicate-skills-test';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            // Create skills with duplicate names in different locations
            // Workspace skill should be kept (higher priority), user skill should be skipped
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/.github/skills/Duplicate Skill/SKILL.md`,
                    contents: [
                        '---',
                        'name: "Duplicate Skill"',
                        'description: "Workspace version"',
                        '---',
                        'Workspace skill content',
                    ],
                },
                {
                    path: '/home/user/.copilot/skills/Duplicate Skill/SKILL.md',
                    contents: [
                        '---',
                        'name: "Duplicate Skill"',
                        'description: "User version - should be skipped"',
                        '---',
                        'User skill content',
                    ],
                },
                {
                    path: `${rootFolder}/.claude/skills/Unique Skill/SKILL.md`,
                    contents: [
                        '---',
                        'name: "Unique Skill"',
                        'description: "A unique skill"',
                        '---',
                        'Unique skill content',
                    ],
                },
            ]);
            const allResult = await service.findAgentSkills(CancellationToken.None);
            assert.ok(allResult, 'Should return results');
            const result = allResult;
            assert.strictEqual(result.length, 2, 'Should find 2 skills (duplicate skipped)');
            const duplicateSkill = result.find(s => s.name === 'Duplicate Skill');
            assert.ok(duplicateSkill, 'Should find the duplicate skill');
            assert.strictEqual(duplicateSkill.description, 'Workspace version', 'Should keep workspace version (higher priority)');
            assert.strictEqual(duplicateSkill.storage, PromptsStorage.local, 'Should be from workspace');
            const uniqueSkill = result.find(s => s.name === 'Unique Skill');
            assert.ok(uniqueSkill, 'Should find the unique skill');
        });
        test('should prioritize skills by source: workspace > user > extension', async () => {
            testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
            testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
            const rootFolderName = 'priority-test';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            // Create skills from different sources with same name
            await mockFiles(fileService, [
                {
                    path: '/home/user/.copilot/skills/Priority Skill/SKILL.md',
                    contents: [
                        '---',
                        'name: "Priority Skill"',
                        'description: "User version"',
                        '---',
                        'User skill content',
                    ],
                },
                {
                    path: `${rootFolder}/.github/skills/Priority Skill/SKILL.md`,
                    contents: [
                        '---',
                        'name: "Priority Skill"',
                        'description: "Workspace version - highest priority"',
                        '---',
                        'Workspace skill content',
                    ],
                },
            ]);
            const allResult = await service.findAgentSkills(CancellationToken.None);
            assert.ok(allResult, 'Should return results');
            const result = allResult;
            assert.strictEqual(result.length, 1, 'Should find 1 skill (duplicates resolved by priority)');
            assert.strictEqual(result[0].description, 'Workspace version - highest priority', 'Workspace should win over user');
            assert.strictEqual(result[0].storage, PromptsStorage.local);
        });
        test('should include skills where name does not match folder name using folder name as fallback', async () => {
            testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
            testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
            const rootFolderName = 'name-mismatch-test';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            await mockFiles(fileService, [
                {
                    // Folder name "wrong-folder-name" doesn't match skill name "Correct Skill Name"
                    path: `${rootFolder}/.github/skills/wrong-folder-name/SKILL.md`,
                    contents: [
                        '---',
                        'name: "Correct Skill Name"',
                        'description: "This skill should use folder name as fallback"',
                        '---',
                        'Skill content',
                    ],
                },
                {
                    // Folder name matches skill name
                    path: `${rootFolder}/.github/skills/Valid Skill/SKILL.md`,
                    contents: [
                        '---',
                        'name: "Valid Skill"',
                        'description: "This skill should be found"',
                        '---',
                        'Valid skill content',
                    ],
                },
            ]);
            const allResult = await service.findAgentSkills(CancellationToken.None);
            assert.ok(allResult, 'Should return results');
            const result = allResult;
            assert.strictEqual(result.length, 2, 'Should find both skills');
            const mismatchedSkill = result.find(s => s.name === 'wrong-folder-name');
            assert.ok(mismatchedSkill, 'Should find skill with folder name as fallback');
            assert.strictEqual(mismatchedSkill.description, 'This skill should use folder name as fallback');
            const validSkill = result.find(s => s.name === 'Valid Skill');
            assert.ok(validSkill, 'Should find the valid skill');
        });
        test('should include skills with missing name attribute using folder name as fallback', async () => {
            testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
            testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
            const rootFolderName = 'missing-name-test';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/.github/skills/no-name-skill/SKILL.md`,
                    contents: [
                        '---',
                        'description: "This skill has no name attribute"',
                        '---',
                        'Skill content without name',
                    ],
                },
                {
                    path: `${rootFolder}/.github/skills/Valid Named Skill/SKILL.md`,
                    contents: [
                        '---',
                        'name: "Valid Named Skill"',
                        'description: "This skill has a name"',
                        '---',
                        'Valid skill content',
                    ],
                },
            ]);
            const allResult = await service.findAgentSkills(CancellationToken.None);
            assert.ok(allResult, 'Should return results');
            const result = allResult;
            assert.strictEqual(result.length, 2, 'Should find both skills');
            const noNameSkill = result.find(s => s.name === 'no-name-skill');
            assert.ok(noNameSkill, 'Should find skill with folder name as fallback');
            assert.strictEqual(noNameSkill.description, 'This skill has no name attribute');
            const validSkill = result.find(s => s.name === 'Valid Named Skill');
            assert.ok(validSkill, 'Should find skill with name attribute');
        });
        test('should include extension-provided skills in findAgentSkills', async () => {
            testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
            testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
            const rootFolderName = 'extension-skills-test';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            const extensionSkillUri = URI.parse('file://extensions/my-extension/Extension Skill/SKILL.md');
            const extension = {
                identifier: { value: 'test.my-extension' },
                enabledApiProposals: ['chatParticipantPrivate']
            };
            // Create workspace skill and extension skill
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/.github/skills/Workspace Skill/SKILL.md`,
                    contents: [
                        '---',
                        'name: "Workspace Skill"',
                        'description: "A workspace skill"',
                        '---',
                        'Workspace skill content',
                    ],
                },
                {
                    path: extensionSkillUri.path,
                    contents: [
                        '---',
                        'name: "Extension Skill"',
                        'description: "A skill from extension provider"',
                        '---',
                        'Extension skill content',
                    ],
                },
            ]);
            const provider = {
                providePromptFiles: async (_context, _token) => {
                    return [{ uri: extensionSkillUri }];
                }
            };
            const registered = service.registerPromptFileProvider(extension, PromptsType.skill, provider);
            const allResult = await service.findAgentSkills(CancellationToken.None);
            assert.ok(allResult, 'Should return results');
            const result = allResult;
            assert.strictEqual(result.length, 2, 'Should find 2 skills (workspace + extension)');
            const workspaceSkill = result.find(s => s.name === 'Workspace Skill');
            assert.ok(workspaceSkill, 'Should find workspace skill');
            assert.strictEqual(workspaceSkill.storage, PromptsStorage.local);
            const extensionSkill = result.find(s => s.name === 'Extension Skill');
            assert.ok(extensionSkill, 'Should find extension skill');
            assert.strictEqual(extensionSkill.storage, PromptsStorage.extension);
            registered.dispose();
        });
        test('should include contributed skill files in findAgentSkills', async () => {
            testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
            testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
            const rootFolderName = 'contributed-skills-test';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            const contributedSkillUri = URI.parse('file://extensions/my-extension/Contributed Skill/SKILL.md');
            const extension = {
                identifier: { value: 'test.my-extension' }
            };
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/.github/skills/Local Skill/SKILL.md`,
                    contents: [
                        '---',
                        'name: "Local Skill"',
                        'description: "A local skill"',
                        '---',
                        'Local skill content',
                    ],
                },
                {
                    path: contributedSkillUri.path,
                    contents: [
                        '---',
                        'name: "Contributed Skill"',
                        'description: "A contributed skill from extension"',
                        '---',
                        'Contributed skill content',
                    ],
                },
            ]);
            const registered = service.registerContributedFile(PromptsType.skill, contributedSkillUri, extension, 'Contributed Skill', 'A contributed skill from extension');
            const allResult = await service.findAgentSkills(CancellationToken.None);
            assert.ok(allResult, 'Should return results');
            const result = allResult;
            assert.strictEqual(result.length, 2, 'Should find 2 skills (local + contributed)');
            const localSkill = result.find(s => s.name === 'Local Skill');
            assert.ok(localSkill, 'Should find local skill');
            assert.strictEqual(localSkill.storage, PromptsStorage.local);
            const contributedSkill = result.find(s => s.name === 'Contributed Skill');
            assert.ok(contributedSkill, 'Should find contributed skill');
            assert.strictEqual(contributedSkill.storage, PromptsStorage.extension);
            registered.dispose();
            // After disposal, only local skill should remain
            const resultAfterDispose = await service.findAgentSkills(CancellationToken.None);
            assert.strictEqual(resultAfterDispose?.length, 1, 'Should find 1 skill after disposal');
            assert.strictEqual(resultAfterDispose?.[0].name, 'Local Skill');
        });
    });
    suite('getPromptSlashCommands - skills', () => {
        teardown(() => {
            sinon.restore();
        });
        test('should include skills from workspace as slash commands', async () => {
            testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
            testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
            const rootFolderName = 'slash-commands-workspace-skills';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            // Create skill files in workspace
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/.github/skills/workspace-skill/SKILL.md`,
                    contents: [
                        '---',
                        'name: "workspace-skill"',
                        'description: "A workspace skill that should appear as slash command"',
                        '---',
                        'Workspace skill content',
                    ],
                },
                {
                    path: `${rootFolder}/.claude/skills/another-skill/SKILL.md`,
                    contents: [
                        '---',
                        'name: "another-skill"',
                        'description: "Another skill from workspace"',
                        '---',
                        'Another skill content',
                    ],
                },
            ]);
            const slashCommands = await service.getPromptSlashCommands(CancellationToken.None);
            const workspaceSkillCommand = slashCommands.find(cmd => cmd.name === 'workspace-skill');
            assert.ok(workspaceSkillCommand, 'Should find workspace skill as slash command');
            assert.strictEqual(workspaceSkillCommand.description, 'A workspace skill that should appear as slash command');
            assert.strictEqual(workspaceSkillCommand.storage, PromptsStorage.local);
            assert.strictEqual(workspaceSkillCommand.type, PromptsType.skill);
            const anotherSkillCommand = slashCommands.find(cmd => cmd.name === 'another-skill');
            assert.ok(anotherSkillCommand, 'Should find another skill as slash command');
            assert.strictEqual(anotherSkillCommand.description, 'Another skill from workspace');
            assert.strictEqual(anotherSkillCommand.storage, PromptsStorage.local);
        });
        test('should include skills from user storage as slash commands', async () => {
            testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
            testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
            const rootFolderName = 'slash-commands-user-skills';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            // Create skill files in user storage (personal skills)
            await mockFiles(fileService, [
                {
                    path: '/home/user/.copilot/skills/personal-skill/SKILL.md',
                    contents: [
                        '---',
                        'name: "personal-skill"',
                        'description: "A personal skill from user storage"',
                        '---',
                        'Personal skill content',
                    ],
                },
                {
                    path: '/home/user/.claude/skills/claude-personal/SKILL.md',
                    contents: [
                        '---',
                        'name: "claude-personal"',
                        'description: "A Claude personal skill"',
                        '---',
                        'Claude personal skill content',
                    ],
                },
            ]);
            const slashCommands = await service.getPromptSlashCommands(CancellationToken.None);
            const personalSkillCommand = slashCommands.find(cmd => cmd.name === 'personal-skill');
            assert.ok(personalSkillCommand, 'Should find personal skill as slash command');
            assert.strictEqual(personalSkillCommand.description, 'A personal skill from user storage');
            assert.strictEqual(personalSkillCommand.storage, PromptsStorage.user);
            assert.strictEqual(personalSkillCommand.type, PromptsType.skill);
            const claudePersonalCommand = slashCommands.find(cmd => cmd.name === 'claude-personal');
            assert.ok(claudePersonalCommand, 'Should find Claude personal skill as slash command');
            assert.strictEqual(claudePersonalCommand.description, 'A Claude personal skill');
            assert.strictEqual(claudePersonalCommand.storage, PromptsStorage.user);
        });
        test('should include skills from extension providers as slash commands', async () => {
            testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
            testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
            const rootFolderName = 'slash-commands-provider-skills';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            const providerSkillUri = URI.parse('file://extensions/my-extension/provider-skill/SKILL.md');
            const extension = {
                identifier: { value: 'test.my-extension' },
                enabledApiProposals: ['chatParticipantPrivate']
            };
            // Mock the skill file content
            await mockFiles(fileService, [
                {
                    path: providerSkillUri.path,
                    contents: [
                        '---',
                        'name: "provider-skill"',
                        'description: "A skill from extension provider"',
                        '---',
                        'Provider skill content',
                    ],
                },
            ]);
            const provider = {
                providePromptFiles: async (_context, _token) => {
                    return [{ uri: providerSkillUri }];
                }
            };
            const registered = service.registerPromptFileProvider(extension, PromptsType.skill, provider);
            const slashCommands = await service.getPromptSlashCommands(CancellationToken.None);
            const providerSkillCommand = slashCommands.find(cmd => cmd.name === 'provider-skill');
            assert.ok(providerSkillCommand, 'Should find provider skill as slash command');
            assert.strictEqual(providerSkillCommand.description, 'A skill from extension provider');
            assert.strictEqual(providerSkillCommand.storage, PromptsStorage.extension);
            assert.strictEqual(providerSkillCommand.type, PromptsType.skill);
            assert.strictEqual(providerSkillCommand.source, PromptFileSource.ExtensionAPI);
            registered.dispose();
            // After disposal, the provider skill should no longer appear
            const slashCommandsAfterDispose = await service.getPromptSlashCommands(CancellationToken.None);
            const foundAfterDispose = slashCommandsAfterDispose.find(cmd => cmd.name === 'provider-skill');
            assert.strictEqual(foundAfterDispose, undefined, 'Should not find provider skill after disposal');
        });
        test('should include skills from extension contributions as slash commands', async () => {
            testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
            testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
            const rootFolderName = 'slash-commands-contributed-skills';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            const contributedSkillUri = URI.parse('file://extensions/my-extension/contributed-skill/SKILL.md');
            const extension = {
                identifier: { value: 'test.my-extension' }
            };
            // Mock the skill file content
            await mockFiles(fileService, [
                {
                    path: contributedSkillUri.path,
                    contents: [
                        '---',
                        'name: "contributed-skill"',
                        'description: "A skill from extension contribution"',
                        '---',
                        'Contributed skill content',
                    ],
                },
            ]);
            const registered = service.registerContributedFile(PromptsType.skill, contributedSkillUri, extension, 'contributed-skill', 'A skill from extension contribution');
            const slashCommands = await service.getPromptSlashCommands(CancellationToken.None);
            const contributedSkillCommand = slashCommands.find(cmd => cmd.name === 'contributed-skill');
            assert.ok(contributedSkillCommand, 'Should find contributed skill as slash command');
            assert.strictEqual(contributedSkillCommand.description, 'A skill from extension contribution');
            assert.strictEqual(contributedSkillCommand.storage, PromptsStorage.extension);
            assert.strictEqual(contributedSkillCommand.type, PromptsType.skill);
            assert.strictEqual(contributedSkillCommand.source, PromptFileSource.ExtensionContribution);
            registered.dispose();
            // After disposal, the contributed skill should no longer appear
            const slashCommandsAfterDispose = await service.getPromptSlashCommands(CancellationToken.None);
            const foundAfterDispose = slashCommandsAfterDispose.find(cmd => cmd.name === 'contributed-skill');
            assert.strictEqual(foundAfterDispose, undefined, 'Should not find contributed skill after disposal');
        });
        test('should combine prompt files and skills as slash commands', async () => {
            testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
            testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
            const rootFolderName = 'slash-commands-combined';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            // Create both prompt files and skill files
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/.github/prompts/my-prompt.prompt.md`,
                    contents: [
                        '---',
                        'name: "my-prompt"',
                        'description: "A regular prompt file"',
                        '---',
                        'Prompt content',
                    ],
                },
                {
                    path: `${rootFolder}/.github/skills/my-skill/SKILL.md`,
                    contents: [
                        '---',
                        'name: "my-skill"',
                        'description: "A skill file"',
                        '---',
                        'Skill content',
                    ],
                },
            ]);
            const slashCommands = await service.getPromptSlashCommands(CancellationToken.None);
            const promptCommand = slashCommands.find(cmd => cmd.name === 'my-prompt');
            assert.ok(promptCommand, 'Should find prompt file as slash command');
            assert.strictEqual(promptCommand.type, PromptsType.prompt);
            const skillCommand = slashCommands.find(cmd => cmd.name === 'my-skill');
            assert.ok(skillCommand, 'Should find skill file as slash command');
            assert.strictEqual(skillCommand.type, PromptsType.skill);
        });
        test('should fire change event when provider registers/unregisters', async () => {
            testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
            testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
            const rootFolderName = 'slash-commands-cache-invalidation';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            const providerSkillUri = URI.parse('file://extensions/my-extension/test-skill/SKILL.md');
            const extension = {
                identifier: { value: 'test.my-extension' },
                enabledApiProposals: ['chatParticipantPrivate']
            };
            await mockFiles(fileService, [
                {
                    path: providerSkillUri.path,
                    contents: [
                        '---',
                        'name: "test-skill"',
                        'description: "Test skill"',
                        '---',
                        'Test skill content',
                    ],
                },
            ]);
            let changeEventCount = 0;
            const disposable = service.onDidChangeSlashCommands(() => {
                changeEventCount++;
            });
            const provider = {
                providePromptFiles: async (_context, _token) => {
                    return [{ uri: providerSkillUri }];
                }
            };
            // Register provider should trigger change
            const registered = service.registerPromptFileProvider(extension, PromptsType.skill, provider);
            await new Promise(resolve => setTimeout(resolve, 100));
            const commandsWithProvider = await service.getPromptSlashCommands(CancellationToken.None);
            const skillCommand = commandsWithProvider.find(cmd => cmd.name === 'test-skill');
            assert.ok(skillCommand, 'Should find skill from provider');
            // Dispose provider should trigger change
            registered.dispose();
            await new Promise(resolve => setTimeout(resolve, 100));
            const commandsAfterDispose = await service.getPromptSlashCommands(CancellationToken.None);
            const skillAfterDispose = commandsAfterDispose.find(cmd => cmd.name === 'test-skill');
            assert.strictEqual(skillAfterDispose, undefined, 'Should not find skill after provider disposal');
            assert.ok(changeEventCount >= 2, 'Change event should fire when provider registers and unregisters');
            disposable.dispose();
        });
        test('should use filename as fallback for skills with missing name', async () => {
            testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
            testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
            const rootFolderName = 'slash-commands-fallback-name';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            // Create skill without name attribute but with description
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/.github/skills/no-name/SKILL.md`,
                    contents: [
                        '---',
                        'description: "Skill without name"',
                        '---',
                        'Skill content',
                    ],
                },
                {
                    path: `${rootFolder}/.github/skills/valid-skill/SKILL.md`,
                    contents: [
                        '---',
                        'name: "valid-skill"',
                        'description: "A valid skill"',
                        '---',
                        'Valid skill content',
                    ],
                },
            ]);
            const slashCommands = await service.getPromptSlashCommands(CancellationToken.None);
            // Should include skill with fallback name from filename (SKILL without extension)
            const fallbackNameCommand = slashCommands.find(cmd => cmd.name === 'SKILL');
            assert.ok(fallbackNameCommand, 'Should find skill with fallback name from filename');
            assert.strictEqual(fallbackNameCommand.description, 'Skill without name');
            // Should include valid skill
            const validSkillCommand = slashCommands.find(cmd => cmd.name === 'valid-skill');
            assert.ok(validSkillCommand, 'Should find valid skill');
        });
        test('should not duplicate slash commands with same name from different types', async () => {
            testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
            testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
            const rootFolderName = 'slash-commands-no-duplicates';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            // Create prompt and skill with same name
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/.github/prompts/duplicate-name.prompt.md`,
                    contents: [
                        '---',
                        'name: "duplicate-name"',
                        'description: "A prompt file"',
                        '---',
                        'Prompt content',
                    ],
                },
                {
                    path: `${rootFolder}/.github/skills/duplicate-name/SKILL.md`,
                    contents: [
                        '---',
                        'name: "duplicate-name"',
                        'description: "A skill file"',
                        '---',
                        'Skill content',
                    ],
                },
            ]);
            const slashCommands = await service.getPromptSlashCommands(CancellationToken.None);
            const duplicateCommands = slashCommands.filter(cmd => cmd.name === 'duplicate-name');
            // Both should be present - the function returns all slash commands without deduplication
            // This allows the caller to handle name conflicts (e.g., prompt takes precedence over skill)
            assert.strictEqual(duplicateCommands.length, 2, 'Should return both prompt and skill with same name');
            const promptCommand = duplicateCommands.find(cmd => cmd.type === PromptsType.prompt);
            assert.ok(promptCommand, 'Should find prompt command');
            const skillCommand = duplicateCommands.find(cmd => cmd.type === PromptsType.skill);
            assert.ok(skillCommand, 'Should find skill command');
        });
        test('should respect skill disable configuration (USE_AGENT_SKILLS)', async () => {
            testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, false);
            testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
            const rootFolderName = 'slash-commands-skills-disabled';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            // Create both prompt and skill
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/.github/prompts/my-prompt.prompt.md`,
                    contents: [
                        '---',
                        'name: "my-prompt"',
                        'description: "A prompt"',
                        '---',
                        'Prompt content',
                    ],
                },
                {
                    path: `${rootFolder}/.github/skills/my-skill/SKILL.md`,
                    contents: [
                        '---',
                        'name: "my-skill"',
                        'description: "A skill"',
                        '---',
                        'Skill content',
                    ],
                },
            ]);
            const slashCommands = await service.getPromptSlashCommands(CancellationToken.None);
            const promptCommand = slashCommands.find(cmd => cmd.name === 'my-prompt');
            assert.ok(promptCommand, 'Should find prompt command even when skills are disabled');
            const skillCommand = slashCommands.find(cmd => cmd.name === 'my-skill');
            assert.strictEqual(skillCommand, undefined, 'Should not find skill command when skills are disabled');
        });
    });
    suite('getPromptSlashCommands - userInvocable filtering', () => {
        teardown(() => {
            sinon.restore();
        });
        test('should return correct userInvocable value for skills with user-invocable: false', async () => {
            testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
            testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
            const rootFolderName = 'user-invocable-false';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            // Create a skill with user-invocable: false (should be hidden from / menu)
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/.github/skills/hidden-skill/SKILL.md`,
                    contents: [
                        '---',
                        'name: "hidden-skill"',
                        'description: "A skill hidden from the / menu"',
                        'user-invocable: false',
                        '---',
                        'Hidden skill content',
                    ],
                },
            ]);
            const slashCommands = await service.getPromptSlashCommands(CancellationToken.None);
            const hiddenSkillCommand = slashCommands.find(cmd => cmd.name === 'hidden-skill');
            assert.ok(hiddenSkillCommand, 'Should find hidden skill in slash commands');
            assert.strictEqual(hiddenSkillCommand.userInvocable, false, 'Should have userInvocable=false in parsed header');
            // Verify the filtering logic would correctly exclude this skill
            const filteredCommands = slashCommands.filter(c => c.userInvocable);
            const hiddenSkillInFiltered = filteredCommands.find(cmd => cmd.name === 'hidden-skill');
            assert.strictEqual(hiddenSkillInFiltered, undefined, 'Hidden skill should be filtered out when applying userInvocable filter');
        });
        test('should return correct userInvocable value for skills with user-invocable: true', async () => {
            testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
            testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
            const rootFolderName = 'user-invocable-true';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            // Create a skill with explicit user-invocable: true
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/.github/skills/visible-skill/SKILL.md`,
                    contents: [
                        '---',
                        'name: "visible-skill"',
                        'description: "A skill visible in the / menu"',
                        'user-invocable: true',
                        '---',
                        'Visible skill content',
                    ],
                },
            ]);
            const slashCommands = await service.getPromptSlashCommands(CancellationToken.None);
            const visibleSkillCommand = slashCommands.find(cmd => cmd.name === 'visible-skill');
            assert.ok(visibleSkillCommand, 'Should find visible skill in slash commands');
            assert.strictEqual(visibleSkillCommand.userInvocable, true, 'Should have userInvocable=true in parsed header');
            // Verify the filtering logic would correctly include this skill
            const filteredCommands = slashCommands.filter(c => c.userInvocable);
            const visibleSkillInFiltered = filteredCommands.find(cmd => cmd.name === 'visible-skill');
            assert.ok(visibleSkillInFiltered, 'Visible skill should be included when applying userInvocable filter');
        });
        test('should default to true for skills without user-invocable attribute', async () => {
            testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
            testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
            const rootFolderName = 'user-invocable-undefined';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            // Create a skill without user-invocable attribute (should default to true)
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/.github/skills/default-skill/SKILL.md`,
                    contents: [
                        '---',
                        'name: "default-skill"',
                        'description: "A skill without explicit user-invocable"',
                        '---',
                        'Default skill content',
                    ],
                },
            ]);
            const slashCommands = await service.getPromptSlashCommands(CancellationToken.None);
            const defaultSkillCommand = slashCommands.find(cmd => cmd.name === 'default-skill');
            assert.ok(defaultSkillCommand, 'Should find default skill in slash commands');
            assert.strictEqual(defaultSkillCommand.userInvocable, true, 'Should have userInvocable=true when attribute is not specified');
            // Verify the filtering logic would correctly include this skill (undefined !== false is true)
            const filteredCommands = slashCommands.filter(c => c.userInvocable);
            const defaultSkillInFiltered = filteredCommands.find(cmd => cmd.name === 'default-skill');
            assert.ok(defaultSkillInFiltered, 'Skill without user-invocable attribute should be included when applying userInvocable filter');
        });
        test('should handle prompts with user-invocable: false', async () => {
            const rootFolderName = 'prompt-user-invocable-false';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            // Create a prompt with user-invocable: false
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/.github/prompts/hidden-prompt.prompt.md`,
                    contents: [
                        '---',
                        'name: "hidden-prompt"',
                        'description: "A prompt hidden from the / menu"',
                        'user-invocable: false',
                        '---',
                        'Hidden prompt content',
                    ],
                },
            ]);
            const slashCommands = await service.getPromptSlashCommands(CancellationToken.None);
            const hiddenPromptCommand = slashCommands.find(cmd => cmd.name === 'hidden-prompt');
            assert.ok(hiddenPromptCommand, 'Should find hidden prompt in slash commands');
            assert.strictEqual(hiddenPromptCommand.userInvocable, false, 'Should have userInvocable=false in parsed header');
            // Verify the filtering logic would correctly exclude this prompt
            const filteredCommands = slashCommands.filter(c => c.userInvocable);
            const hiddenPromptInFiltered = filteredCommands.find(cmd => cmd.name === 'hidden-prompt');
            assert.strictEqual(hiddenPromptInFiltered, undefined, 'Hidden prompt should be filtered out when applying userInvocable filter');
        });
        test('should correctly filter mixed user-invocable values', async () => {
            testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
            testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
            const rootFolderName = 'mixed-user-invocable';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            // Create a mix of skills and prompts with different user-invocable values
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/.github/prompts/visible-prompt.prompt.md`,
                    contents: [
                        '---',
                        'name: "visible-prompt"',
                        'description: "A visible prompt"',
                        '---',
                        'Visible prompt content',
                    ],
                },
                {
                    path: `${rootFolder}/.github/prompts/hidden-prompt.prompt.md`,
                    contents: [
                        '---',
                        'name: "hidden-prompt"',
                        'description: "A hidden prompt"',
                        'user-invocable: false',
                        '---',
                        'Hidden prompt content',
                    ],
                },
                {
                    path: `${rootFolder}/.github/skills/visible-skill/SKILL.md`,
                    contents: [
                        '---',
                        'name: "visible-skill"',
                        'description: "A visible skill"',
                        'user-invocable: true',
                        '---',
                        'Visible skill content',
                    ],
                },
                {
                    path: `${rootFolder}/.github/skills/hidden-skill/SKILL.md`,
                    contents: [
                        '---',
                        'name: "hidden-skill"',
                        'description: "A hidden skill"',
                        'user-invocable: false',
                        '---',
                        'Hidden skill content',
                    ],
                },
            ]);
            const slashCommands = await service.getPromptSlashCommands(CancellationToken.None);
            // All commands should be present in the raw list
            assert.strictEqual(slashCommands.length, 4, 'Should find all 4 commands');
            // Apply the same filtering logic as chatInputCompletions.ts
            const filteredCommands = slashCommands.filter(c => c.userInvocable);
            assert.strictEqual(filteredCommands.length, 2, 'Should have 2 commands after filtering');
            assert.ok(filteredCommands.find(c => c.name === 'visible-prompt'), 'visible-prompt should be included');
            assert.ok(filteredCommands.find(c => c.name === 'visible-skill'), 'visible-skill should be included');
            assert.strictEqual(filteredCommands.find(c => c.name === 'hidden-prompt'), undefined, 'hidden-prompt should be excluded');
            assert.strictEqual(filteredCommands.find(c => c.name === 'hidden-skill'), undefined, 'hidden-skill should be excluded');
        });
        test('should handle skills with missing header gracefully', async () => {
            testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
            testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
            const rootFolderName = 'missing-header';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            // Create a skill without any YAML header
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/.github/skills/no-header-skill/SKILL.md`,
                    contents: [
                        'This skill has no YAML header at all.',
                        'Just plain markdown content.',
                    ],
                },
            ]);
            const slashCommands = await service.getPromptSlashCommands(CancellationToken.None);
            // Find the skill by checking all commands (name will be derived from filename)
            const noHeaderSkill = slashCommands.find(cmd => cmd.uri.path.includes('no-header-skill'));
            assert.ok(noHeaderSkill, 'Should find skill without header in slash commands');
            // Verify the filtering logic handles missing header correctly
            // parsedPromptFile?.header?.userInvocable
            // When header is undefined: undefined !== false is true, so skill is included
            const filteredCommands = slashCommands.filter(c => c.userInvocable);
            const noHeaderSkillInFiltered = filteredCommands.find(cmd => cmd.uri.path.includes('no-header-skill'));
            assert.ok(noHeaderSkillInFiltered, 'Skill without header should be included when applying userInvocable filter (defaults to true)');
        });
        test('plugin skills include plugin name prefix in slash command name', async () => {
            testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
            testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
            const skillUri = URI.file('/plugins/my-plugin/skills/deploy/SKILL.md');
            await mockFiles(fileService, [
                {
                    path: skillUri.path,
                    contents: [
                        '---',
                        'description: "Deploy skill from plugin"',
                        '---',
                        'Deploy skill content',
                    ],
                },
            ]);
            const enablement = observableValue('testPluginEnablement', 2 /* ContributionEnablementState.EnabledProfile */);
            const plugin = {
                uri: URI.file('/plugins/my-plugin'),
                label: 'my-plugin',
                enablement,
                remove: () => { },
                hooks: observableValue('testPluginHooks', []),
                commands: observableValue('testPluginCommands', []),
                skills: observableValue('testPluginSkills', [{ uri: skillUri, name: 'deploy' }]),
                agents: observableValue('testPluginAgents', []),
                instructions: observableValue('testPluginInstructions', []),
                mcpServerDefinitions: observableValue('testPluginMcpServerDefinitions', []),
            };
            testPluginsObservable.set([plugin], undefined);
            const slashCommands = await service.getPromptSlashCommands(CancellationToken.None);
            // Should be prefixed with plugin name
            const skillCommand = slashCommands.find(cmd => cmd.name === 'my-plugin:deploy');
            assert.ok(skillCommand, 'Plugin skill should have plugin prefix in slash command name');
            assert.strictEqual(skillCommand.storage, PromptsStorage.plugin);
            assert.strictEqual(skillCommand.type, PromptsType.skill);
            testPluginsObservable.set([], undefined);
        });
        test('plugin skill frontmatter name is qualified with plugin prefix', async () => {
            testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
            testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {});
            const skillUri = URI.file('/plugins/devtools/skills/ci/SKILL.md');
            await mockFiles(fileService, [
                {
                    path: skillUri.path,
                    contents: [
                        '---',
                        'name: "run-ci"',
                        'description: "Run CI pipeline"',
                        '---',
                        'CI skill content',
                    ],
                },
            ]);
            const enablement = observableValue('testPluginEnablement', 2 /* ContributionEnablementState.EnabledProfile */);
            const plugin = {
                uri: URI.file('/plugins/devtools'),
                label: 'devtools',
                enablement,
                remove: () => { },
                hooks: observableValue('testPluginHooks', []),
                commands: observableValue('testPluginCommands', []),
                skills: observableValue('testPluginSkills', [{ uri: skillUri, name: 'ci' }]),
                agents: observableValue('testPluginAgents', []),
                instructions: observableValue('testPluginInstructions', []),
                mcpServerDefinitions: observableValue('testPluginMcpServerDefinitions', []),
            };
            testPluginsObservable.set([plugin], undefined);
            const slashCommands = await service.getPromptSlashCommands(CancellationToken.None);
            // Even when SKILL.md has name: "run-ci", it must be prefixed with the plugin name
            const skillCommand = slashCommands.find(cmd => cmd.name === 'devtools:run-ci');
            assert.ok(skillCommand, 'Plugin skill frontmatter name should be qualified with plugin prefix');
            assert.strictEqual(skillCommand.description, 'Run CI pipeline');
            // The unprefixed name should not appear
            assert.strictEqual(slashCommands.find(cmd => cmd.name === 'run-ci'), undefined, 'Unprefixed skill name should not appear as slash command');
            testPluginsObservable.set([], undefined);
        });
    });
    suite('hooks', () => {
        const createTestPlugin = (path, initialHooks) => {
            const enablement = observableValue('testPluginEnablement', 2 /* ContributionEnablementState.EnabledProfile */);
            const hooks = observableValue('testPluginHooks', initialHooks);
            const commands = observableValue('testPluginCommands', []);
            const skills = observableValue('testPluginSkills', []);
            const agents = observableValue('testPluginAgents', []);
            const instructions = observableValue('testPluginInstructions', []);
            const mcpServerDefinitions = observableValue('testPluginMcpServerDefinitions', []);
            return {
                plugin: {
                    uri: URI.file(path),
                    label: basename(URI.file(path)),
                    enablement,
                    remove: () => { },
                    hooks,
                    commands,
                    skills,
                    agents,
                    instructions,
                    mcpServerDefinitions,
                },
                hooks,
            };
        };
        test('multi-root workspace resolves cwd to per-hook-file workspace folder', async function () {
            const folder1Uri = URI.file('/workspace-a');
            const folder2Uri = URI.file('/workspace-b');
            workspaceContextService.setWorkspace(testWorkspace(folder1Uri, folder2Uri));
            testConfigService.setUserConfiguration(PromptsConfig.USE_CHAT_HOOKS, true);
            testConfigService.setUserConfiguration(PromptsConfig.HOOKS_LOCATION_KEY, { [HOOKS_SOURCE_FOLDER]: true });
            await mockFiles(fileService, [
                {
                    path: '/workspace-a/.github/hooks/my-hook.json',
                    contents: [
                        JSON.stringify({
                            hooks: {
                                [HookType.PreToolUse]: [
                                    { type: 'command', command: 'echo folder-a' },
                                ],
                            },
                        }),
                    ],
                },
                {
                    path: '/workspace-b/.github/hooks/my-hook.json',
                    contents: [
                        JSON.stringify({
                            hooks: {
                                [HookType.PreToolUse]: [
                                    { type: 'command', command: 'echo folder-b' },
                                ],
                            },
                        }),
                    ],
                },
            ]);
            const result = await service.getHooks(CancellationToken.None);
            assert.ok(result, 'Expected hooks result');
            const preToolUseHooks = result.hooks[HookType.PreToolUse];
            assert.ok(preToolUseHooks, 'Expected PreToolUse hooks');
            assert.strictEqual(preToolUseHooks.length, 2, 'Expected two PreToolUse hooks');
            const hookA = preToolUseHooks.find(h => h.command === 'echo folder-a');
            const hookB = preToolUseHooks.find(h => h.command === 'echo folder-b');
            assert.ok(hookA, 'Expected hook from folder-a');
            assert.ok(hookB, 'Expected hook from folder-b');
            assert.strictEqual(hookA.cwd?.path, folder1Uri.path, 'Hook from folder-a should have cwd pointing to workspace-a');
            assert.strictEqual(hookB.cwd?.path, folder2Uri.path, 'Hook from folder-b should have cwd pointing to workspace-b');
        });
        test('includes hooks from agent plugins', async function () {
            testConfigService.setUserConfiguration(PromptsConfig.USE_CHAT_HOOKS, true);
            testConfigService.setUserConfiguration(PromptsConfig.HOOKS_LOCATION_KEY, {});
            const { plugin } = createTestPlugin('/plugins/test-plugin', [{
                    type: HookType.PreToolUse,
                    originalId: 'plugin-pre-tool-use',
                    hooks: [{ command: 'echo from-plugin' }],
                    uri: URI.file('/plugins/test-plugin/hooks.json'),
                }]);
            testPluginsObservable.set([plugin], undefined);
            const result = await service.getHooks(CancellationToken.None);
            assert.ok(result, 'Expected hooks result');
            assert.deepStrictEqual(result.hooks[HookType.PreToolUse], [{
                    command: 'echo from-plugin',
                }], 'Expected plugin hooks to be included in computed hooks');
        });
        test('recomputes hooks when agent plugin hooks change', async function () {
            testConfigService.setUserConfiguration(PromptsConfig.USE_CHAT_HOOKS, true);
            testConfigService.setUserConfiguration(PromptsConfig.HOOKS_LOCATION_KEY, {});
            const { plugin, hooks } = createTestPlugin('/plugins/test-plugin', [{
                    type: HookType.PreToolUse,
                    originalId: 'plugin-pre-tool-use',
                    hooks: [{ command: 'echo before' }],
                    uri: URI.file('/plugins/test-plugin/hooks.json'),
                }]);
            testPluginsObservable.set([plugin], undefined);
            const before = await service.getHooks(CancellationToken.None);
            assert.ok(before, 'Expected hooks result before plugin update');
            assert.deepStrictEqual(before.hooks[HookType.PreToolUse], [{ command: 'echo before' }]);
            hooks.set([{
                    type: HookType.PreToolUse,
                    originalId: 'plugin-pre-tool-use',
                    hooks: [{ command: 'echo after' }],
                    uri: URI.file('/plugins/test-plugin/hooks.json'),
                }], undefined);
            const after = await service.getHooks(CancellationToken.None);
            assert.ok(after, 'Expected hooks result after plugin update');
            assert.deepStrictEqual(after.hooks[HookType.PreToolUse], [{ command: 'echo after' }]);
        });
        test('returns undefined when workspace is untrusted', async function () {
            workspaceContextService.setWorkspace(testWorkspace(URI.file('/test-workspace')));
            testConfigService.setUserConfiguration(PromptsConfig.USE_CHAT_HOOKS, true);
            testConfigService.setUserConfiguration(PromptsConfig.HOOKS_LOCATION_KEY, { [HOOKS_SOURCE_FOLDER]: true });
            await mockFiles(fileService, [
                {
                    path: '/test-workspace/.github/hooks/my-hook.json',
                    contents: [
                        JSON.stringify({
                            hooks: {
                                [HookType.PreToolUse]: [
                                    { type: 'command', command: 'echo test' },
                                ],
                            },
                        }),
                    ],
                },
            ]);
            // Trusted workspace should return hooks
            const trustedResult = await service.getHooks(CancellationToken.None);
            assert.ok(trustedResult, 'Expected hooks when workspace is trusted');
            assert.strictEqual(trustedResult.hooks[HookType.PreToolUse]?.length, 1);
            // Untrusted workspace should return undefined
            await workspaceTrustService.setWorkspaceTrust(false);
            const untrustedResult = await service.getHooks(CancellationToken.None);
            assert.strictEqual(untrustedResult, undefined, 'Expected undefined hooks when workspace is untrusted');
            // Re-trusting should return hooks again
            await workspaceTrustService.setWorkspaceTrust(true);
            const reTrustedResult = await service.getHooks(CancellationToken.None);
            assert.ok(reTrustedResult, 'Expected hooks after workspace becomes trusted again');
            assert.strictEqual(reTrustedResult.hooks[HookType.PreToolUse]?.length, 1);
        });
        test('suppresses plugin hooks when workspace is untrusted', async function () {
            testConfigService.setUserConfiguration(PromptsConfig.USE_CHAT_HOOKS, true);
            testConfigService.setUserConfiguration(PromptsConfig.HOOKS_LOCATION_KEY, {});
            const { plugin } = createTestPlugin('/plugins/test-plugin', [{
                    type: HookType.PreToolUse,
                    originalId: 'plugin-pre-tool-use',
                    hooks: [{ command: 'echo from-plugin' }],
                    uri: URI.file('/plugins/test-plugin/hooks.json'),
                }]);
            testPluginsObservable.set([plugin], undefined);
            await workspaceTrustService.setWorkspaceTrust(false);
            const result = await service.getHooks(CancellationToken.None);
            assert.strictEqual(result, undefined, 'Expected undefined hooks when workspace is untrusted, even with plugin hooks');
        });
        test('Claude hooks with disableAllHooks should not report hasDisabledClaudeHooks when Claude hooks setting is off', async function () {
            // A Claude settings file that has disableAllHooks: true but defines hooks.
            // When USE_CLAUDE_HOOKS is false, the old code skipped this file due to
            // disabledAllHooks before reaching the Claude check, so hasDisabledClaudeHooks was false.
            const workspaceUri = URI.file('/test-workspace');
            workspaceContextService.setWorkspace(testWorkspace(workspaceUri));
            testConfigService.setUserConfiguration(PromptsConfig.USE_CHAT_HOOKS, true);
            testConfigService.setUserConfiguration(PromptsConfig.USE_CLAUDE_HOOKS, false);
            testConfigService.setUserConfiguration(PromptsConfig.HOOKS_LOCATION_KEY, { [HOOKS_SOURCE_FOLDER]: true });
            await mockFiles(fileService, [
                {
                    path: '/test-workspace/.claude/settings.json',
                    contents: [
                        JSON.stringify({
                            disableAllHooks: true,
                            hooks: {
                                PreToolUse: [{ type: 'command', command: 'echo disabled-claude-hook' }],
                            },
                        }),
                    ],
                },
            ]);
            const result = await service.getHooks(CancellationToken.None);
            // No hooks should be collected (the only file has disableAllHooks)
            assert.strictEqual(result, undefined, 'Expected no hooks result');
        });
        test('plugin hooks appear in hook discovery info files', async function () {
            // Plugin hooks should be reported in the discovery info files array
            // so that diagnostic views can display them.
            const workspaceUri = URI.file('/test-workspace');
            workspaceContextService.setWorkspace(testWorkspace(workspaceUri));
            testConfigService.setUserConfiguration(PromptsConfig.USE_CHAT_HOOKS, true);
            testConfigService.setUserConfiguration(PromptsConfig.HOOKS_LOCATION_KEY, { [HOOKS_SOURCE_FOLDER]: true });
            const pluginHookUri = URI.file('/plugins/test-plugin/hooks.json');
            const { plugin } = createTestPlugin('/plugins/test-plugin', [{
                    type: HookType.PreToolUse,
                    originalId: 'plugin-pre-tool-use',
                    hooks: [{ command: 'echo from-plugin' }],
                    uri: pluginHookUri,
                }]);
            testPluginsObservable.set([plugin], undefined);
            const result = await service.getHooks(CancellationToken.None);
            const capturedDiscoveryInfo = await service.getDiscoveryInfo(PromptsType.hook, CancellationToken.None);
            assert.ok(result, 'Expected hooks result with plugin hooks');
            assert.ok(capturedDiscoveryInfo, 'Expected discovery info to be logged');
            // Plugin hook file should appear in discovery files
            const pluginFile = capturedDiscoveryInfo.files.find(f => f.promptPath.storage === PromptsStorage.plugin);
            assert.ok(pluginFile, 'Plugin hook file should be present in discovery info files');
        });
    });
    suite('plugin instructions', () => {
        function createPluginWithInstructions(path, initialInstructions) {
            const enablement = observableValue('testPluginEnablement', 2 /* ContributionEnablementState.EnabledProfile */);
            const hooks = observableValue('testPluginHooks', []);
            const commands = observableValue('testPluginCommands', []);
            const skills = observableValue('testPluginSkills', []);
            const agents = observableValue('testPluginAgents', []);
            const instructions = observableValue('testPluginInstructions', initialInstructions);
            const mcpServerDefinitions = observableValue('testPluginMcpServerDefinitions', []);
            return {
                plugin: {
                    uri: URI.file(path),
                    label: basename(URI.file(path)),
                    enablement,
                    remove: () => { },
                    hooks,
                    commands,
                    skills,
                    agents,
                    instructions,
                    mcpServerDefinitions,
                },
                instructions,
            };
        }
        test('lists plugin instructions via listPromptFiles', async function () {
            const ruleUri = URI.file('/plugins/test-plugin/rules/prefer-const.mdc');
            const { plugin } = createPluginWithInstructions('/plugins/test-plugin', [
                { uri: ruleUri, name: 'prefer-const' },
            ]);
            testPluginsObservable.set([plugin], undefined);
            const result = await service.listPromptFiles(PromptsType.instructions, CancellationToken.None);
            const pluginInstruction = result.find(p => p.uri.toString() === ruleUri.toString());
            assert.ok(pluginInstruction, 'Plugin instruction should appear in listPromptFiles');
            assert.strictEqual(pluginInstruction.storage, PromptsStorage.plugin);
        });
        test('updates listed instructions when plugin instructions change', async function () {
            const ruleUri1 = URI.file('/plugins/test-plugin/rules/rule-a.mdc');
            const ruleUri2 = URI.file('/plugins/test-plugin/rules/rule-b.mdc');
            const { plugin, instructions } = createPluginWithInstructions('/plugins/test-plugin', [
                { uri: ruleUri1, name: 'rule-a' },
            ]);
            testPluginsObservable.set([plugin], undefined);
            const before = await service.listPromptFiles(PromptsType.instructions, CancellationToken.None);
            const beforePlugin = before.filter(p => p.storage === PromptsStorage.plugin);
            assert.strictEqual(beforePlugin.length, 1);
            const eventFired = new Promise(resolve => {
                const disposable = service.onDidChangeInstructions(() => {
                    disposable.dispose();
                    resolve();
                });
            });
            instructions.set([
                { uri: ruleUri1, name: 'rule-a' },
                { uri: ruleUri2, name: 'rule-b' },
            ], undefined);
            await eventFired;
            const after = await service.listPromptFiles(PromptsType.instructions, CancellationToken.None);
            const afterPlugin = after.filter(p => p.storage === PromptsStorage.plugin);
            assert.strictEqual(afterPlugin.length, 2);
        });
        test('removes instructions when plugin is removed', async function () {
            const ruleUri = URI.file('/plugins/test-plugin/rules/rule-a.mdc');
            const { plugin } = createPluginWithInstructions('/plugins/test-plugin', [
                { uri: ruleUri, name: 'rule-a' },
            ]);
            testPluginsObservable.set([plugin], undefined);
            const withPlugin = await service.listPromptFiles(PromptsType.instructions, CancellationToken.None);
            assert.ok(withPlugin.some(p => p.storage === PromptsStorage.plugin));
            testPluginsObservable.set([], undefined);
            const withoutPlugin = await service.listPromptFiles(PromptsType.instructions, CancellationToken.None);
            assert.ok(!withoutPlugin.some(p => p.storage === PromptsStorage.plugin));
        });
        test('namespaces plugin instruction names with plugin folder', async function () {
            const ruleUri = URI.file('/plugins/deploy-tools/rules/lint-check.mdc');
            const { plugin } = createPluginWithInstructions('/plugins/deploy-tools', [
                { uri: ruleUri, name: 'lint-check' },
            ]);
            testPluginsObservable.set([plugin], undefined);
            const result = await service.listPromptFiles(PromptsType.instructions, CancellationToken.None);
            const pluginInstruction = result.find(p => p.uri.toString() === ruleUri.toString());
            assert.ok(pluginInstruction, 'Plugin instruction should be listed');
            assert.strictEqual(pluginInstruction.name, 'deploy-tools:lint-check');
        });
    });
});
function fireConfigChange(configService, ...key) {
    configService.onDidChangeConfigurationEmitter.fire({
        affectsConfiguration: (k) => key.includes(k),
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvbXB0c1NlcnZpY2UudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9jb21tb24vcHJvbXB0U3ludGF4L3NlcnZpY2UvcHJvbXB0c1NlcnZpY2UudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxLQUFLLEtBQUssTUFBTSxPQUFPLENBQUM7QUFDL0IsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDckYsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDakUsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUN0RSxPQUFPLEVBQXVCLGVBQWUsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxRQUFRLEVBQUUsWUFBWSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDdkYsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzlELE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ3pHLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUN6RSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUM1RixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDckYsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDZEQUE2RCxDQUFDO0FBQzNGLE9BQU8sRUFB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