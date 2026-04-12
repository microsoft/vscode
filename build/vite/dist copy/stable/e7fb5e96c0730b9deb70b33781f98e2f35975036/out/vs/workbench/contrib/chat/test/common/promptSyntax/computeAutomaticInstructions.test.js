/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import * as sinon from 'sinon';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Event } from '../../../../../../base/common/event.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ILanguageService } from '../../../../../../editor/common/languages/language.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { ModelService } from '../../../../../../editor/common/services/modelService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ExtensionIdentifier } from '../../../../../../platform/extensions/common/extensions.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IWorkspaceTrustManagementService } from '../../../../../../platform/workspace/common/workspaceTrust.js';
import { testWorkspace } from '../../../../../../platform/workspace/test/common/testWorkspace.js';
import { IUserDataProfileService } from '../../../../../services/userDataProfile/common/userDataProfile.js';
import { TestContextService, TestUserDataProfileService, TestWorkspaceTrustManagementService } from '../../../../../test/common/workbenchTestServices.js';
import { ChatRequestVariableSet, isPromptFileVariableEntry, isPromptTextVariableEntry, toFileVariableEntry } from '../../../common/attachments/chatVariableEntries.js';
import { ComputeAutomaticInstructions, getFilePath } from '../../../common/promptSyntax/computeAutomaticInstructions.js';
import { PromptsConfig } from '../../../common/promptSyntax/config/config.js';
import { AGENTS_SOURCE_FOLDER, CLAUDE_RULES_SOURCE_FOLDER, INSTRUCTION_FILE_EXTENSION, INSTRUCTIONS_DEFAULT_SOURCE_FOLDER, LEGACY_MODE_DEFAULT_SOURCE_FOLDER, PROMPT_DEFAULT_SOURCE_FOLDER, PROMPT_FILE_EXTENSION } from '../../../common/promptSyntax/config/promptFileLocations.js';
import { INSTRUCTIONS_LANGUAGE_ID, PROMPT_LANGUAGE_ID } from '../../../common/promptSyntax/promptTypes.js';
import { IPromptsService, PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { PromptsService } from '../../../common/promptSyntax/service/promptsServiceImpl.js';
import { mockFiles, TestInMemoryFileSystemProviderWithRealPath } from './testUtils/mockFilesystem.js';
import { InMemoryStorageService, IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IPathService } from '../../../../../services/path/common/pathService.js';
import { ISearchService } from '../../../../../services/search/common/search.js';
import { IExtensionService } from '../../../../../services/extensions/common/extensions.js';
import { ILanguageModelToolsService } from '../../../common/tools/languageModelToolsService.js';
import { IRemoteAgentService } from '../../../../../../workbench/services/remote/common/remoteAgentService.js';
import { basename } from '../../../../../../base/common/resources.js';
import { match } from '../../../../../../base/common/glob.js';
import { ChatModeKind, GeneralPurposeAgentName } from '../../../common/constants.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IAgentPluginService } from '../../../common/plugins/agentPluginService.js';
import { observableValue } from '../../../../../../base/common/observable.js';
suite('ComputeAutomaticInstructions', () => {
    const disposables = ensureNoDisposablesAreLeakedInTestSuite();
    let service;
    let instaService;
    let workspaceContextService;
    let testConfigService;
    let fileService;
    let toolsService;
    let fileSystemProvider;
    let workspaceTrustService;
    setup(async () => {
        instaService = disposables.add(new TestInstantiationService());
        instaService.stub(ILogService, new NullLogService());
        workspaceContextService = new TestContextService();
        instaService.stub(IWorkspaceContextService, workspaceContextService);
        testConfigService = new TestConfigurationService();
        testConfigService.setUserConfiguration(PromptsConfig.USE_COPILOT_INSTRUCTION_FILES, true);
        testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_MD, true);
        testConfigService.setUserConfiguration(PromptsConfig.USE_CLAUDE_MD, false);
        testConfigService.setUserConfiguration(PromptsConfig.USE_NESTED_AGENT_MD, false);
        testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
        testConfigService.setUserConfiguration(PromptsConfig.INCLUDE_APPLYING_INSTRUCTIONS, true);
        testConfigService.setUserConfiguration(PromptsConfig.INCLUDE_REFERENCED_INSTRUCTIONS, true);
        testConfigService.setUserConfiguration(PromptsConfig.USE_CUSTOMIZATIONS_IN_PARENT_REPOS, false);
        testConfigService.setUserConfiguration(PromptsConfig.INSTRUCTIONS_LOCATION_KEY, { [INSTRUCTIONS_DEFAULT_SOURCE_FOLDER]: true, [CLAUDE_RULES_SOURCE_FOLDER]: true });
        testConfigService.setUserConfiguration(PromptsConfig.PROMPT_LOCATIONS_KEY, { [PROMPT_DEFAULT_SOURCE_FOLDER]: true });
        testConfigService.setUserConfiguration(PromptsConfig.MODE_LOCATION_KEY, { [LEGACY_MODE_DEFAULT_SOURCE_FOLDER]: true });
        testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, { '.claude/skills': true });
        testConfigService.setUserConfiguration(PromptsConfig.AGENTS_LOCATION_KEY, { [AGENTS_SOURCE_FOLDER]: true });
        instaService.stub(IConfigurationService, testConfigService);
        instaService.stub(IUserDataProfileService, new TestUserDataProfileService());
        instaService.stub(ITelemetryService, NullTelemetryService);
        instaService.stub(IStorageService, InMemoryStorageService);
        instaService.stub(IExtensionService, {
            whenInstalledExtensionsRegistered: () => Promise.resolve(true),
            activateByEvent: () => Promise.resolve()
        });
        workspaceTrustService = disposables.add(new TestWorkspaceTrustManagementService());
        instaService.stub(IWorkspaceTrustManagementService, workspaceTrustService);
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
        instaService.stub(ILabelService, {
            getUriLabel: (uri, options) => {
                if (options?.relative) {
                    return basename(uri);
                }
                return uri.path;
            }
        });
        fileSystemProvider = disposables.add(new TestInMemoryFileSystemProviderWithRealPath());
        disposables.add(fileService.registerProvider(Schemas.file, fileSystemProvider));
        const pathService = {
            userHome: () => {
                return Promise.resolve(URI.file('/home/user'));
            },
        };
        instaService.stub(IPathService, pathService);
        instaService.stub(ISearchService, {
            schemeHasFileSearchProvider: () => true,
            async fileSearch(query) {
                const results = [];
                for (const folderQuery of query.folderQueries) {
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
                    const allFiles = await findFilesInLocation(folderQuery.folder);
                    for (const resource of allFiles) {
                        const pathMatch = query.filePattern === undefined || match(query.filePattern, resource.path);
                        if (pathMatch) {
                            results.push({ resource });
                        }
                    }
                }
                return { results, messages: [] };
            }
        });
        // Mock tools service
        toolsService = {
            getToolByName: (name) => {
                if (name === 'readFile') {
                    return { id: 'vscode_readFile', name: 'readFile' };
                }
                if (name === 'runSubagent') {
                    return { id: 'vscode_runSubagent', name: 'runSubagent' };
                }
                return undefined;
            },
            getFullReferenceName: (tool) => tool.name,
        };
        instaService.stub(ILanguageModelToolsService, toolsService);
        instaService.stub(IRemoteAgentService, {
            getEnvironment: () => Promise.resolve(null),
        });
        instaService.stub(IContextKeyService, new MockContextKeyService());
        instaService.stub(IAgentPluginService, {
            plugins: observableValue('testPlugins', []),
            enablementModel: { readEnabled: () => 2 /* EnabledProfile */, setEnabled: () => { }, remove: () => { } },
        });
        service = disposables.add(instaService.createInstance(PromptsService));
        instaService.stub(IPromptsService, service);
    });
    teardown(() => {
        sinon.restore();
        fileSystemProvider.clearRealPathMappings();
    });
    suite('collect', () => {
        test('should collect all types of instructions', async () => {
            const rootFolderName = 'collect-all-test';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            await mockFiles(fileService, [
                // Applying instruction
                {
                    path: `${rootFolder}/.github/instructions/typescript.instructions.md`,
                    contents: [
                        '---',
                        'description: \'TypeScript instructions\'',
                        'applyTo: "**/*.ts"',
                        '---',
                        'TypeScript coding standards',
                    ]
                },
                // copilot-instructions
                {
                    path: `${rootFolder}/.github/copilot-instructions.md`,
                    contents: [
                        'Be helpful and friendly',
                    ]
                },
                // AGENTS.md
                {
                    path: `${rootFolder}/AGENTS.md`,
                    contents: [
                        'Agent guidelines',
                    ]
                },
                // Attached file
                {
                    path: `${rootFolder}/src/file.ts`,
                    contents: [
                        'console.log("test");',
                    ]
                },
            ]);
            {
                const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, undefined, undefined);
                const variables = new ChatRequestVariableSet();
                variables.add(toFileVariableEntry(URI.joinPath(rootFolderUri, 'src/file.ts')));
                await contextComputer.collect(variables, CancellationToken.None);
                const instructionFiles = variables.asArray().filter(v => isPromptFileVariableEntry(v));
                const paths = instructionFiles.map(i => isPromptFileVariableEntry(i) ? i.value.path : undefined);
                assert.ok(paths.includes(`${rootFolder}/.github/instructions/typescript.instructions.md`), 'Should include applying instruction');
                assert.ok(paths.includes(`${rootFolder}/.github/copilot-instructions.md`), 'Should include copilot-instructions');
                assert.ok(paths.includes(`${rootFolder}/AGENTS.md`), 'Should include AGENTS.md');
            }
            {
                testConfigService.setUserConfiguration(PromptsConfig.INCLUDE_APPLYING_INSTRUCTIONS, false);
                testConfigService.setUserConfiguration(PromptsConfig.USE_COPILOT_INSTRUCTION_FILES, true);
                testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_MD, true);
                const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, undefined, undefined);
                const variables = new ChatRequestVariableSet();
                variables.add(toFileVariableEntry(URI.joinPath(rootFolderUri, 'src/file.ts')));
                await contextComputer.collect(variables, CancellationToken.None);
                const instructionFiles = variables.asArray().filter(v => isPromptFileVariableEntry(v));
                const paths = instructionFiles.map(i => isPromptFileVariableEntry(i) ? i.value.path : undefined);
                assert.ok(!paths.includes(`${rootFolder}/.github/instructions/typescript.instructions.md`), 'Should not include applying instruction');
                assert.ok(paths.includes(`${rootFolder}/.github/copilot-instructions.md`), 'Should include copilot-instructions');
                assert.ok(paths.includes(`${rootFolder}/AGENTS.md`), 'Should include AGENTS.md');
            }
            {
                testConfigService.setUserConfiguration(PromptsConfig.INCLUDE_APPLYING_INSTRUCTIONS, true);
                testConfigService.setUserConfiguration(PromptsConfig.USE_COPILOT_INSTRUCTION_FILES, false);
                testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_MD, true);
                const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, undefined, undefined);
                const variables = new ChatRequestVariableSet();
                variables.add(toFileVariableEntry(URI.joinPath(rootFolderUri, 'src/file.ts')));
                await contextComputer.collect(variables, CancellationToken.None);
                const instructionFiles = variables.asArray().filter(v => isPromptFileVariableEntry(v));
                const paths = instructionFiles.map(i => isPromptFileVariableEntry(i) ? i.value.path : undefined);
                assert.ok(paths.includes(`${rootFolder}/.github/instructions/typescript.instructions.md`), 'Should include applying instruction');
                assert.ok(!paths.includes(`${rootFolder}/.github/copilot-instructions.md`), 'Should not include copilot-instructions');
                assert.ok(paths.includes(`${rootFolder}/AGENTS.md`), 'Should include AGENTS.md');
            }
            {
                testConfigService.setUserConfiguration(PromptsConfig.INCLUDE_APPLYING_INSTRUCTIONS, true);
                testConfigService.setUserConfiguration(PromptsConfig.USE_COPILOT_INSTRUCTION_FILES, true);
                testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_MD, false);
                const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, undefined, undefined);
                const variables = new ChatRequestVariableSet();
                variables.add(toFileVariableEntry(URI.joinPath(rootFolderUri, 'src/file.ts')));
                await contextComputer.collect(variables, CancellationToken.None);
                const instructionFiles = variables.asArray().filter(v => isPromptFileVariableEntry(v));
                const paths = instructionFiles.map(i => isPromptFileVariableEntry(i) ? i.value.path : undefined);
                assert.ok(paths.includes(`${rootFolder}/.github/instructions/typescript.instructions.md`), 'Should include applying instruction');
                assert.ok(paths.includes(`${rootFolder}/.github/copilot-instructions.md`), 'Should include copilot-instructions');
                assert.ok(!paths.includes(`${rootFolder}/AGENTS.md`), 'Should not include AGENTS.md');
            }
        });
        test('should not collect when settings are disabled', async () => {
            testConfigService.setUserConfiguration(PromptsConfig.INCLUDE_APPLYING_INSTRUCTIONS, false);
            testConfigService.setUserConfiguration(PromptsConfig.USE_COPILOT_INSTRUCTION_FILES, false);
            testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_MD, false);
            const rootFolderName = 'disabled-settings-test';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/.github/instructions/typescript.instructions.md`,
                    contents: [
                        '---',
                        'applyTo: "**/*.ts"',
                        '---',
                        'TypeScript coding standards',
                    ]
                },
                {
                    path: `${rootFolder}/.github/copilot-instructions.md`,
                    contents: ['Be helpful'],
                },
                {
                    path: `${rootFolder}/AGENTS.md`,
                    contents: ['Guidelines'],
                },
                {
                    path: `${rootFolder}/src/file.ts`,
                    contents: ['console.log("test");'],
                },
            ]);
            const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, undefined, undefined);
            const variables = new ChatRequestVariableSet();
            variables.add(toFileVariableEntry(URI.joinPath(rootFolderUri, 'src/file.ts')));
            await contextComputer.collect(variables, CancellationToken.None);
            const instructionFiles = variables.asArray().filter(v => isPromptFileVariableEntry(v));
            assert.strictEqual(instructionFiles.length, 0, 'Should not collect any instructions when settings are disabled');
        });
        test('should collect for edit mode even when settings disabled', async () => {
            testConfigService.setUserConfiguration(PromptsConfig.INCLUDE_APPLYING_INSTRUCTIONS, false);
            const rootFolderName = 'edit-mode-test';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/.github/instructions/typescript.instructions.md`,
                    contents: [
                        '---',
                        'applyTo: "**/*.ts"',
                        '---',
                        'TypeScript standards',
                    ]
                },
                {
                    path: `${rootFolder}/src/file.ts`,
                    contents: ['console.log("test");'],
                },
            ]);
            const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Edit, undefined, undefined);
            const variables = new ChatRequestVariableSet();
            variables.add(toFileVariableEntry(URI.joinPath(rootFolderUri, 'src/file.ts')));
            await contextComputer.collect(variables, CancellationToken.None);
            const instructionFiles = variables.asArray().filter(v => isPromptFileVariableEntry(v));
            assert.ok(instructionFiles.length > 0, 'Should collect instructions in edit mode even when setting is disabled');
        });
    });
    suite('addApplyingInstructions', () => {
        test('should match ** pattern for any file', async () => {
            const rootFolderName = 'wildcard-test';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/.github/instructions/all-files.instructions.md`,
                    contents: [
                        '---',
                        'applyTo: "**"',
                        '---',
                        'Apply to all files',
                    ]
                },
                {
                    path: `${rootFolder}/src/file.ts`,
                    contents: ['code'],
                },
            ]);
            const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, undefined, undefined);
            const variables = new ChatRequestVariableSet();
            variables.add(toFileVariableEntry(URI.joinPath(rootFolderUri, 'src/file.ts')));
            await contextComputer.collect(variables, CancellationToken.None);
            const instructionFiles = variables.asArray().filter(v => isPromptFileVariableEntry(v));
            assert.strictEqual(instructionFiles.length, 1, 'Should match ** pattern');
        });
        test('should match specific file patterns', async () => {
            const rootFolderName = 'pattern-test';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/.github/instructions/typescript.instructions.md`,
                    contents: [
                        '---',
                        'applyTo: "**/*.ts"',
                        '---',
                        'TS instructions',
                    ]
                },
                {
                    path: `${rootFolder}/.github/instructions/javascript.instructions.md`,
                    contents: [
                        '---',
                        'applyTo: "**/*.js"',
                        '---',
                        'JS instructions',
                    ]
                },
                {
                    path: `${rootFolder}/src/file.ts`,
                    contents: ['code'],
                },
            ]);
            const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, undefined, undefined);
            const variables = new ChatRequestVariableSet();
            variables.add(toFileVariableEntry(URI.joinPath(rootFolderUri, 'src/file.ts')));
            await contextComputer.collect(variables, CancellationToken.None);
            const paths = variables.asArray()
                .filter(v => isPromptFileVariableEntry(v))
                .map(v => isPromptFileVariableEntry(v) ? v.value.path : undefined);
            assert.ok(paths.includes(`${rootFolder}/.github/instructions/typescript.instructions.md`), 'Should match TS file');
            assert.ok(!paths.includes(`${rootFolder}/.github/instructions/javascript.instructions.md`), 'Should not match JS pattern');
        });
        test('should handle multiple patterns separated by comma', async () => {
            const rootFolderName = 'multi-pattern-test';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/.github/instructions/web.instructions.md`,
                    contents: [
                        '---',
                        'applyTo: "**/*.ts, **/*.js, **/*.tsx"',
                        '---',
                        'Web instructions',
                    ]
                },
                {
                    path: `${rootFolder}/src/component.tsx`,
                    contents: ['code'],
                },
            ]);
            const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, undefined, undefined);
            const variables = new ChatRequestVariableSet();
            variables.add(toFileVariableEntry(URI.joinPath(rootFolderUri, 'src/component.tsx')));
            await contextComputer.collect(variables, CancellationToken.None);
            const instructionFiles = variables.asArray().filter(v => isPromptFileVariableEntry(v));
            assert.strictEqual(instructionFiles.length, 1, 'Should match one of the comma-separated patterns');
        });
        test('should not add duplicate instructions', async () => {
            const rootFolderName = 'duplicate-test';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/.github/instructions/typescript.instructions.md`,
                    contents: [
                        '---',
                        'applyTo: "**/*.ts"',
                        '---',
                        'TS instructions',
                    ]
                },
                {
                    path: `${rootFolder}/src/file1.ts`,
                    contents: ['code'],
                },
                {
                    path: `${rootFolder}/src/file2.ts`,
                    contents: ['code'],
                },
            ]);
            const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, undefined, undefined);
            const variables = new ChatRequestVariableSet();
            variables.add(toFileVariableEntry(URI.joinPath(rootFolderUri, 'src/file1.ts')));
            variables.add(toFileVariableEntry(URI.joinPath(rootFolderUri, 'src/file2.ts')));
            await contextComputer.collect(variables, CancellationToken.None);
            const instructionFiles = variables.asArray().filter(v => isPromptFileVariableEntry(v));
            assert.strictEqual(instructionFiles.length, 1, 'Should add instruction only once even with multiple matching files');
        });
        test('should handle relative glob patterns', async () => {
            const rootFolderName = 'relative-pattern-test';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/.github/instructions/src-files.instructions.md`,
                    contents: [
                        '---',
                        'applyTo: "src/**/*.ts"',
                        '---',
                        'Src instructions',
                    ]
                },
                {
                    path: `${rootFolder}/src/file.ts`,
                    contents: ['code'],
                },
            ]);
            const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, undefined, undefined);
            const variables = new ChatRequestVariableSet();
            variables.add(toFileVariableEntry(URI.joinPath(rootFolderUri, 'src/file.ts')));
            await contextComputer.collect(variables, CancellationToken.None);
            const instructionFiles = variables.asArray().filter(v => isPromptFileVariableEntry(v));
            assert.strictEqual(instructionFiles.length, 1, 'Should match relative glob pattern');
        });
    });
    suite('claude rules', () => {
        test('should collect claude rules files as instructions', async () => {
            const rootFolderName = 'claude-rules-test';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/.claude/rules/code-style.md`,
                    contents: [
                        'Code style guidelines',
                    ]
                },
                {
                    path: `${rootFolder}/src/file.ts`,
                    contents: ['code'],
                },
            ]);
            const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, undefined, undefined);
            const variables = new ChatRequestVariableSet();
            variables.add(toFileVariableEntry(URI.joinPath(rootFolderUri, 'src/file.ts')));
            await contextComputer.collect(variables, CancellationToken.None);
            const paths = variables.asArray()
                .filter(v => isPromptFileVariableEntry(v))
                .map(v => isPromptFileVariableEntry(v) ? v.value.path : undefined);
            // Claude rules without paths default to '**', so they are always auto-attached
            assert.ok(paths.includes(`${rootFolder}/.claude/rules/code-style.md`), 'Should include rules without paths as they default to **');
        });
        test('should match claude rules with paths attribute', async () => {
            const rootFolderName = 'claude-rules-paths-test';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/.claude/rules/api-rules.md`,
                    contents: [
                        '---',
                        'paths:',
                        '  - "src/api/**/*.ts"',
                        '---',
                        'API development rules',
                    ]
                },
                {
                    path: `${rootFolder}/.claude/rules/frontend-rules.md`,
                    contents: [
                        '---',
                        'paths:',
                        '  - "src/frontend/**/*.tsx"',
                        '---',
                        'Frontend rules',
                    ]
                },
                {
                    path: `${rootFolder}/src/api/handler.ts`,
                    contents: ['code'],
                },
            ]);
            const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, undefined, undefined);
            const variables = new ChatRequestVariableSet();
            variables.add(toFileVariableEntry(URI.joinPath(rootFolderUri, 'src/api/handler.ts')));
            await contextComputer.collect(variables, CancellationToken.None);
            const paths = variables.asArray()
                .filter(v => isPromptFileVariableEntry(v))
                .map(v => isPromptFileVariableEntry(v) ? v.value.path : undefined);
            assert.ok(paths.includes(`${rootFolder}/.claude/rules/api-rules.md`), 'Should match API rules via paths');
            assert.ok(!paths.includes(`${rootFolder}/.claude/rules/frontend-rules.md`), 'Should not match frontend rules');
        });
        test('should collect claude rules from subdirectories', async () => {
            const rootFolderName = 'claude-rules-subdir-test';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/.claude/rules/frontend/react.md`,
                    contents: [
                        '---',
                        'paths:',
                        '  - "**/*.tsx"',
                        '---',
                        'React guidelines',
                    ]
                },
                {
                    path: `${rootFolder}/.claude/rules/backend/api.md`,
                    contents: [
                        '---',
                        'paths:',
                        '  - "src/api/**/*.ts"',
                        '---',
                        'API guidelines',
                    ]
                },
                {
                    path: `${rootFolder}/src/component.tsx`,
                    contents: ['code'],
                },
            ]);
            const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, undefined, undefined);
            const variables = new ChatRequestVariableSet();
            variables.add(toFileVariableEntry(URI.joinPath(rootFolderUri, 'src/component.tsx')));
            await contextComputer.collect(variables, CancellationToken.None);
            const paths = variables.asArray()
                .filter(v => isPromptFileVariableEntry(v))
                .map(v => isPromptFileVariableEntry(v) ? v.value.path : undefined);
            assert.ok(paths.includes(`${rootFolder}/.claude/rules/frontend/react.md`), 'Should match react rules from subdirectory');
            assert.ok(!paths.includes(`${rootFolder}/.claude/rules/backend/api.md`), 'Should not match API rules for tsx file');
        });
        test('should support multiple paths patterns', async () => {
            const rootFolderName = 'claude-rules-multi-paths-test';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/.claude/rules/typescript.md`,
                    contents: [
                        '---',
                        'paths:',
                        '  - "src/**/*.ts"',
                        '  - "lib/**/*.ts"',
                        '  - "tests/**/*.test.ts"',
                        '---',
                        'TypeScript rules',
                    ]
                },
                {
                    path: `${rootFolder}/lib/utils.ts`,
                    contents: ['code'],
                },
            ]);
            const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, undefined, undefined);
            const variables = new ChatRequestVariableSet();
            variables.add(toFileVariableEntry(URI.joinPath(rootFolderUri, 'lib/utils.ts')));
            await contextComputer.collect(variables, CancellationToken.None);
            const paths = variables.asArray()
                .filter(v => isPromptFileVariableEntry(v))
                .map(v => isPromptFileVariableEntry(v) ? v.value.path : undefined);
            assert.ok(paths.includes(`${rootFolder}/.claude/rules/typescript.md`), 'Should match via lib/**/*.ts pattern');
        });
    });
    suite('referenced instructions', () => {
        test('should add referenced instruction files', async () => {
            const rootFolderName = 'referenced-test';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/.github/instructions/main.instructions.md`,
                    contents: [
                        '---',
                        'description: \'Main instructions\'',
                        'applyTo: "**/*.ts"',
                        '---',
                        'Main instructions #file:./referenced.instructions.md',
                    ]
                },
                {
                    path: `${rootFolder}/.github/instructions/referenced.instructions.md`,
                    contents: [
                        '---',
                        'description: \'Referenced instructions\'',
                        '---',
                        'Referenced content',
                    ]
                },
            ]);
            const mainUri = URI.joinPath(rootFolderUri, '.github/instructions/main.instructions.md');
            const referencedUri = URI.joinPath(rootFolderUri, '.github/instructions/referenced.instructions.md');
            const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, undefined, undefined);
            const variables = new ChatRequestVariableSet();
            variables.add(toFileVariableEntry(URI.joinPath(rootFolderUri, 'src/file.ts')));
            await contextComputer.collect(variables, CancellationToken.None);
            const paths = variables.asArray()
                .filter(v => isPromptFileVariableEntry(v))
                .map(v => isPromptFileVariableEntry(v) ? v.value.path : undefined);
            assert.ok(paths.includes(mainUri.path), 'Should include main instruction');
            assert.ok(paths.includes(referencedUri.path), 'Should include referenced instruction');
        });
        test('should not add non-workspace references', async () => {
            const rootFolderName = 'non-workspace-ref-test';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/.github/instructions/main.instructions.md`,
                    contents: [
                        '---',
                        'description: \'Main instructions\'',
                        'applyTo: "**/*.ts"',
                        '---',
                        'Main instructions #file:/tmp/external.md',
                    ]
                },
            ]);
            const mainUri = URI.joinPath(rootFolderUri, '.github/instructions/main.instructions.md');
            const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, undefined, undefined);
            const variables = new ChatRequestVariableSet();
            variables.add(toFileVariableEntry(URI.joinPath(rootFolderUri, 'src/file.ts')));
            await contextComputer.collect(variables, CancellationToken.None);
            const paths = variables.asArray()
                .filter(v => isPromptFileVariableEntry(v))
                .map(v => isPromptFileVariableEntry(v) ? v.value.path : undefined);
            assert.ok(paths.includes(mainUri.path), 'Should include main instruction');
            assert.ok(!paths.includes('/tmp/external.md'), 'Should not include non-workspace reference');
        });
        test('should handle nested references', async () => {
            const rootFolderName = 'nested-ref-test';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/.github/instructions/level1.instructions.md`,
                    contents: [
                        '---',
                        'applyTo: "**/*.ts"',
                        '---',
                        'Level 1 #file:./level2.instructions.md',
                    ]
                },
                {
                    path: `${rootFolder}/.github/instructions/level2.instructions.md`,
                    contents: [
                        'Level 2 #file:./level3.instructions.md',
                    ]
                },
                {
                    path: `${rootFolder}/.github/instructions/level3.instructions.md`,
                    contents: [
                        'Level 3',
                    ]
                },
            ]);
            const level1Uri = URI.joinPath(rootFolderUri, '.github/instructions/level1.instructions.md');
            const level2Uri = URI.joinPath(rootFolderUri, '.github/instructions/level2.instructions.md');
            const level3Uri = URI.joinPath(rootFolderUri, '.github/instructions/level3.instructions.md');
            const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, undefined, undefined);
            const variables = new ChatRequestVariableSet();
            variables.add(toFileVariableEntry(URI.joinPath(rootFolderUri, 'src/file.ts')));
            await contextComputer.collect(variables, CancellationToken.None);
            const paths = variables.asArray()
                .filter(v => isPromptFileVariableEntry(v))
                .map(v => isPromptFileVariableEntry(v) ? v.value.path : undefined);
            assert.ok(paths.includes(level1Uri.path), 'Should include level 1');
            assert.ok(paths.includes(level2Uri.path), 'Should include level 2');
            assert.ok(paths.includes(level3Uri.path), 'Should include level 3');
        });
    });
    suite('telemetry', () => {
        test('should emit telemetry event with counts', async () => {
            const rootFolderName = 'telemetry-test';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/.github/instructions/typescript.instructions.md`,
                    contents: [
                        '---',
                        'applyTo: "**/*.ts"',
                        '---',
                        'TS instructions',
                    ]
                },
                {
                    path: `${rootFolder}/.github/copilot-instructions.md`,
                    contents: ['Copilot instructions'],
                },
                {
                    path: `${rootFolder}/AGENTS.md`,
                    contents: ['Agent instructions'],
                },
                {
                    path: `${rootFolder}/src/file.ts`,
                    contents: ['code'],
                },
            ]);
            const telemetryEvents = [];
            const mockTelemetryService = {
                publicLog2: (eventName, data) => {
                    telemetryEvents.push({ eventName, data });
                }
            };
            instaService.stub(ITelemetryService, mockTelemetryService);
            const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, undefined, undefined);
            const variables = new ChatRequestVariableSet();
            variables.add(toFileVariableEntry(URI.joinPath(rootFolderUri, 'src/file.ts')));
            await contextComputer.collect(variables, CancellationToken.None);
            const telemetryEvent = telemetryEvents.find(e => e.eventName === 'instructionsCollected');
            assert.ok(telemetryEvent, 'Should emit telemetry event');
            const data = telemetryEvent.data;
            assert.deepStrictEqual(data, {
                applyingInstructionsCount: 1,
                referencedInstructionsCount: 0,
                agentInstructionsCount: 2,
                listedInstructionsCount: 0,
                totalInstructionsCount: 3,
                claudeRulesCount: 0,
                claudeMdCount: 0,
                claudeAgentsCount: 0,
            });
        });
        test('should track Claude rules in telemetry', async () => {
            const rootFolderName = 'telemetry-claude-rules-test';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/.claude/rules/code-style.md`,
                    contents: ['Code style guidelines'],
                },
                {
                    path: `${rootFolder}/.claude/rules/testing.md`,
                    contents: [
                        '---',
                        'paths:',
                        '  - "**/*.test.ts"',
                        '---',
                        'Testing guidelines',
                    ],
                },
                {
                    path: `${rootFolder}/src/file.ts`,
                    contents: ['code'],
                },
            ]);
            const telemetryEvents = [];
            const mockTelemetryService = {
                publicLog2: (eventName, data) => {
                    telemetryEvents.push({ eventName, data });
                }
            };
            instaService.stub(ITelemetryService, mockTelemetryService);
            const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, undefined, undefined);
            const variables = new ChatRequestVariableSet();
            variables.add(toFileVariableEntry(URI.joinPath(rootFolderUri, 'src/file.ts')));
            await contextComputer.collect(variables, CancellationToken.None);
            const telemetryEvent = telemetryEvents.find(e => e.eventName === 'instructionsCollected');
            assert.ok(telemetryEvent, 'Should emit telemetry event');
            const data = telemetryEvent.data;
            // code-style.md defaults to ** so should match; testing.md only matches *.test.ts so should not match
            assert.strictEqual(data.claudeRulesCount, 1, 'Should count 1 Claude rules file (code-style.md matches **)');
            assert.strictEqual(data.applyingInstructionsCount, 1, 'Claude rules count as applying instructions');
            assert.strictEqual(data.claudeMdCount, 0, 'Should have no CLAUDE.md count');
        });
        test('should track CLAUDE.md in telemetry', async () => {
            const rootFolderName = 'telemetry-claudemd-test';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            testConfigService.setUserConfiguration(PromptsConfig.USE_CLAUDE_MD, true);
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/CLAUDE.md`,
                    contents: ['Claude guidelines'],
                },
                {
                    path: `${rootFolder}/.claude/CLAUDE.md`,
                    contents: ['More Claude guidelines'],
                },
                {
                    path: `${rootFolder}/src/file.ts`,
                    contents: ['code'],
                },
            ]);
            const telemetryEvents = [];
            const mockTelemetryService = {
                publicLog2: (eventName, data) => {
                    telemetryEvents.push({ eventName, data });
                }
            };
            instaService.stub(ITelemetryService, mockTelemetryService);
            const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, undefined, undefined);
            const variables = new ChatRequestVariableSet();
            variables.add(toFileVariableEntry(URI.joinPath(rootFolderUri, 'src/file.ts')));
            await contextComputer.collect(variables, CancellationToken.None);
            const telemetryEvent = telemetryEvents.find(e => e.eventName === 'instructionsCollected');
            assert.ok(telemetryEvent, 'Should emit telemetry event');
            const data = telemetryEvent.data;
            assert.strictEqual(data.claudeMdCount, 2, 'Should count both CLAUDE.md files');
            assert.strictEqual(data.claudeRulesCount, 0, 'Should have no Claude rules count');
        });
        test('should track Claude agents in telemetry', async () => {
            const rootFolderName = 'telemetry-claude-agents-test';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            testConfigService.setUserConfiguration('chat.customAgentInSubagent.enabled', true);
            testConfigService.setUserConfiguration(PromptsConfig.AGENTS_LOCATION_KEY, {
                [AGENTS_SOURCE_FOLDER]: true,
                '.claude/agents': true,
            });
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/.claude/agents/claude-agent.agent.md`,
                    contents: [
                        '---',
                        'description: \'A Claude agent\'',
                        '---',
                        'Claude agent content',
                    ]
                },
                {
                    path: `${rootFolder}/.github/agents/gh-agent.agent.md`,
                    contents: [
                        '---',
                        'description: \'A GitHub agent\'',
                        '---',
                        'GitHub agent content',
                    ]
                },
                {
                    path: `${rootFolder}/src/file.ts`,
                    contents: ['code'],
                },
            ]);
            const telemetryEvents = [];
            const mockTelemetryService = {
                publicLog2: (eventName, data) => {
                    telemetryEvents.push({ eventName, data });
                }
            };
            instaService.stub(ITelemetryService, mockTelemetryService);
            const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, { 'vscode_runSubagent': true }, ['*']);
            const variables = new ChatRequestVariableSet();
            variables.add(toFileVariableEntry(URI.joinPath(rootFolderUri, 'src/file.ts')));
            await contextComputer.collect(variables, CancellationToken.None);
            const telemetryEvent = telemetryEvents.find(e => e.eventName === 'instructionsCollected');
            assert.ok(telemetryEvent, 'Should emit telemetry event');
            const data = telemetryEvent.data;
            assert.strictEqual(data.claudeAgentsCount, 1, 'Should count 1 Claude agent');
        });
    });
    suite('skill telemetry', () => {
        test('should emit skillLoadedIntoContext for each loaded skill', async () => {
            const rootFolderName = 'skill-telemetry-test';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/.claude/skills/my-skill/SKILL.md`,
                    contents: [
                        '---',
                        'name: \'my-skill\'',
                        'description: \'A test skill\'',
                        '---',
                        'Skill content here',
                    ]
                },
                {
                    path: `${rootFolder}/.claude/skills/other-skill/SKILL.md`,
                    contents: [
                        '---',
                        'name: \'other-skill\'',
                        'description: \'Another test skill\'',
                        '---',
                        'Other skill content',
                    ]
                },
            ]);
            const telemetryEvents = [];
            const mockTelemetryService = {
                publicLog2: (eventName, data) => {
                    telemetryEvents.push({ eventName, data });
                }
            };
            instaService.stub(ITelemetryService, mockTelemetryService);
            const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, { 'vscode_readFile': true }, undefined);
            const variables = new ChatRequestVariableSet();
            await contextComputer.collect(variables, CancellationToken.None);
            await new Promise(resolve => setTimeout(resolve, 50));
            const skillEvents = telemetryEvents.filter(e => e.eventName === 'skillLoadedIntoContext');
            assert.strictEqual(skillEvents.length, 2, 'Should emit one event per skill');
            // Both events should have hashed skill names (non-empty strings)
            for (const event of skillEvents) {
                assert.ok(typeof event.data.skillNameHash === 'string' && event.data.skillNameHash.length > 0, 'skillNameHash should be a non-empty string');
                assert.strictEqual(event.data.skillStorage, 'local', 'skillStorage should be local for workspace skills');
                // Local skills have no extension or plugin provenance
                assert.strictEqual(event.data.extensionIdHash, '', 'extensionIdHash should be empty for local skills');
                assert.strictEqual(event.data.extensionVersion, '', 'extensionVersion should be empty for local skills');
                assert.strictEqual(event.data.pluginNameHash, '', 'pluginNameHash should be empty for local skills');
                assert.strictEqual(event.data.pluginVersion, '', 'pluginVersion should be empty for local skills');
            }
            // The two events should have different name hashes (different skill names)
            assert.notStrictEqual(skillEvents[0].data.skillNameHash, skillEvents[1].data.skillNameHash, 'Different skills should have different name hashes');
        });
        test('should not emit skillLoadedIntoContext for skills with disableModelInvocation', async () => {
            const rootFolderName = 'skill-telemetry-disabled-test';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/.claude/skills/manual-skill/SKILL.md`,
                    contents: [
                        '---',
                        'name: \'manual-skill\'',
                        'description: \'A manual-only skill\'',
                        'disable-model-invocation: true',
                        '---',
                        'Manual skill content',
                    ]
                },
                {
                    path: `${rootFolder}/.claude/skills/auto-skill/SKILL.md`,
                    contents: [
                        '---',
                        'name: \'auto-skill\'',
                        'description: \'An auto-invocable skill\'',
                        '---',
                        'Auto skill content',
                    ]
                },
            ]);
            const telemetryEvents = [];
            const mockTelemetryService = {
                publicLog2: (eventName, data) => {
                    telemetryEvents.push({ eventName, data });
                }
            };
            instaService.stub(ITelemetryService, mockTelemetryService);
            const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, { 'vscode_readFile': true }, undefined);
            const variables = new ChatRequestVariableSet();
            await contextComputer.collect(variables, CancellationToken.None);
            await new Promise(resolve => setTimeout(resolve, 50));
            const skillEvents = telemetryEvents.filter(e => e.eventName === 'skillLoadedIntoContext');
            assert.strictEqual(skillEvents.length, 1, 'Should emit only one event (manual skill excluded)');
            assert.strictEqual(skillEvents[0].data.skillStorage, 'local');
        });
        test('should not emit skillLoadedIntoContext when skills feature is disabled', async () => {
            const rootFolderName = 'skill-telemetry-feature-off-test';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, false);
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/.claude/skills/some-skill/SKILL.md`,
                    contents: [
                        '---',
                        'name: \'some-skill\'',
                        'description: \'A skill\'',
                        '---',
                        'Skill content',
                    ]
                },
            ]);
            const telemetryEvents = [];
            const mockTelemetryService = {
                publicLog2: (eventName, data) => {
                    telemetryEvents.push({ eventName, data });
                }
            };
            instaService.stub(ITelemetryService, mockTelemetryService);
            const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, { 'vscode_readFile': true }, undefined);
            const variables = new ChatRequestVariableSet();
            await contextComputer.collect(variables, CancellationToken.None);
            await new Promise(resolve => setTimeout(resolve, 50));
            const skillEvents = telemetryEvents.filter(e => e.eventName === 'skillLoadedIntoContext');
            assert.strictEqual(skillEvents.length, 0, 'Should not emit skill telemetry when feature is disabled');
        });
        test('should emit provenance metadata for extension and plugin skills', async () => {
            const rootFolderName = 'skill-telemetry-provenance-test';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
            const stubSkills = [
                {
                    uri: URI.file(`${rootFolder}/ext-skills/ext-skill/SKILL.md`),
                    storage: PromptsStorage.extension,
                    name: 'ext-skill',
                    description: 'An extension skill',
                    disableModelInvocation: false,
                    userInvocable: true,
                    extension: {
                        identifier: new ExtensionIdentifier('publisher.my-extension'),
                        version: '1.2.3',
                    },
                },
                {
                    uri: URI.file(`${rootFolder}/plugin-skills/plugin-skill/SKILL.md`),
                    storage: PromptsStorage.plugin,
                    name: 'plugin-skill',
                    description: 'A plugin skill',
                    disableModelInvocation: false,
                    userInvocable: true,
                    pluginUri: URI.parse('plugin://my-plugin/4.5.6'),
                },
            ];
            sinon.stub(service, 'findAgentSkills').resolves(stubSkills);
            // Override the plugin service mock so the plugin skill can be resolved
            const pluginUri = URI.parse('plugin://my-plugin/4.5.6');
            instaService.stub(IAgentPluginService, {
                plugins: observableValue('testPlugins', [{
                        uri: pluginUri,
                        label: 'my-plugin',
                        fromMarketplace: { version: '4.5.6' },
                    }]),
            });
            const telemetryEvents = [];
            const mockTelemetryService = {
                publicLog2: (eventName, data) => {
                    telemetryEvents.push({ eventName, data });
                }
            };
            instaService.stub(ITelemetryService, mockTelemetryService);
            const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, { 'vscode_readFile': true }, undefined);
            const variables = new ChatRequestVariableSet();
            await contextComputer.collect(variables, CancellationToken.None);
            await new Promise(resolve => setTimeout(resolve, 50));
            const skillEvents = telemetryEvents.filter(e => e.eventName === 'skillLoadedIntoContext');
            assert.strictEqual(skillEvents.length, 2, 'Should emit one event per skill');
            // Extension skill should have extensionId hash and version
            const extEvent = skillEvents.find(e => e.data.skillStorage === 'extension');
            assert.ok(extEvent, 'Should have an extension skill event');
            assert.ok(typeof extEvent.data.extensionIdHash === 'string' && extEvent.data.extensionIdHash.length > 0, 'extensionIdHash should be non-empty');
            assert.strictEqual(extEvent.data.extensionVersion, '1.2.3');
            assert.strictEqual(extEvent.data.pluginNameHash, '');
            assert.strictEqual(extEvent.data.pluginVersion, '');
            // Plugin skill should have plugin name hash and version
            const pluginEvent = skillEvents.find(e => e.data.skillStorage === 'plugin');
            assert.ok(pluginEvent, 'Should have a plugin skill event');
            assert.ok(typeof pluginEvent.data.pluginNameHash === 'string' && pluginEvent.data.pluginNameHash.length > 0, 'pluginNameHash should be non-empty');
            assert.strictEqual(pluginEvent.data.pluginVersion, '4.5.6');
            assert.strictEqual(pluginEvent.data.extensionIdHash, '');
            assert.strictEqual(pluginEvent.data.extensionVersion, '');
        });
    });
    suite('instructions list variable', () => {
        function xmlContents(text, tag) {
            const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'g');
            const matches = [];
            let match;
            while ((match = regex.exec(text)) !== null) {
                matches.push(match[1].trim());
            }
            return matches;
        }
        function getFilePath(path) {
            return URI.file(path).fsPath;
        }
        test('should generate instructions list when readFile tool available', async () => {
            const rootFolderName = 'instructions-list-test';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/.github/instructions/test.instructions.md`,
                    contents: [
                        '---',
                        'description: \'Test instructions\'',
                        'applyTo: "**/*.ts"',
                        '---',
                        'Test content',
                    ]
                },
            ]);
            const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, { 'vscode_readFile': true }, // Enable readFile tool
            undefined);
            const variables = new ChatRequestVariableSet();
            await contextComputer.collect(variables, CancellationToken.None);
            const textVariables = variables.asArray().filter(v => isPromptTextVariableEntry(v));
            assert.equal(textVariables.length, 1, 'There should be one text variable for instructions list');
            const instructionsList = xmlContents(textVariables[0].value, 'instructions');
            assert.equal(instructionsList.length, 1, 'There should be one instructions list');
            const instructions = xmlContents(instructionsList[0], 'instruction');
            assert.equal(instructions.length, 1, 'There should be one instruction');
            assert.equal(xmlContents(instructions[0], 'description')[0], 'Test instructions');
            assert.equal(xmlContents(instructions[0], 'file')[0], getFilePath(`${rootFolder}/.github/instructions/test.instructions.md`));
            assert.equal(xmlContents(instructions[0], 'applyTo')[0], '**/*.ts');
        });
        test('should include agents list when runSubagent tool available', async () => {
            const rootFolderName = 'agents-list-test';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            // Enable the config for custom agents
            testConfigService.setUserConfiguration('chat.customAgentInSubagent.enabled', true);
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/.github/agents/test-agent-1.agent.md`,
                    contents: [
                        '---',
                        'description: \'Test agent 1\'',
                        'user-invocable: true',
                        'disable-model-invocation: false',
                        '---',
                        'Test agent content',
                    ]
                },
                {
                    path: `${rootFolder}/.github/agents/test-agent-2.agent.md`,
                    contents: [
                        '---',
                        'description: \'Test agent 2\'',
                        'user-invocable: true',
                        'disable-model-invocation: true',
                        '---',
                        'Test agent content',
                    ]
                },
                {
                    path: `${rootFolder}/.github/agents/test-agent-3.agent.md`,
                    contents: [
                        '---',
                        'description: \'Test agent 3\'',
                        'user-invocable: false',
                        'disable-model-invocation: false',
                        '---',
                        'Test agent content',
                    ]
                },
                {
                    path: `${rootFolder}/.github/agents/test-agent-4.agent.md`,
                    contents: [
                        '---',
                        'description: \'Test agent 4\'',
                        'user-invocable: false',
                        'disable-model-invocation: true',
                        '---',
                        'Test agent content',
                    ]
                },
                {
                    path: `${rootFolder}/.github/agents/test-agent-5.agent.md`,
                    contents: [
                        '---',
                        'description: \'Test agent 5\'',
                        '---',
                        'Test agent content',
                    ]
                }
            ]);
            const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, { 'vscode_runSubagent': true }, // Enable runSubagent tool
            ['*']);
            const variables = new ChatRequestVariableSet();
            await contextComputer.collect(variables, CancellationToken.None);
            const textVariables = variables.asArray().filter(v => isPromptTextVariableEntry(v));
            assert.equal(textVariables.length, 1, 'There should be one text variable for agents list');
            const agentsList = xmlContents(textVariables[0].value, 'agents');
            assert.equal(agentsList.length, 1, 'There should be one agents list');
            const agents = xmlContents(agentsList[0], 'agent');
            assert.equal(agents.length, 3, 'There should be three agents');
            assert.equal(xmlContents(agents[0], 'description')[0], 'Test agent 1');
            assert.equal(xmlContents(agents[0], 'name')[0], `test-agent-1`);
            assert.equal(xmlContents(agents[1], 'description')[0], 'Test agent 3');
            assert.equal(xmlContents(agents[1], 'name')[0], `test-agent-3`);
            assert.equal(xmlContents(agents[2], 'description')[0], 'Test agent 5');
            assert.equal(xmlContents(agents[2], 'name')[0], `test-agent-5`);
        });
        test('should include General Purpose agent first when experiment is enabled', async () => {
            const rootFolderName = 'gp-agents-list-test';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            testConfigService.setUserConfiguration('chat.customAgentInSubagent.enabled', true);
            testConfigService.setUserConfiguration('chat.generalPurposeAgent.enabled', true);
            testConfigService.setUserConfiguration(PromptsConfig.AGENTS_LOCATION_KEY, {
                [AGENTS_SOURCE_FOLDER]: true,
            });
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/.github/agents/test-agent-1.agent.md`,
                    contents: [
                        '---',
                        'description: \'Test agent 1\'',
                        '---',
                        'Test agent content',
                    ]
                },
            ]);
            const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, { 'vscode_runSubagent': true }, ['*']);
            const variables = new ChatRequestVariableSet();
            await contextComputer.collect(variables, CancellationToken.None);
            const textVariables = variables.asArray().filter(v => isPromptTextVariableEntry(v));
            assert.equal(textVariables.length, 1, 'There should be one text variable for agents list');
            const agentsList = xmlContents(textVariables[0].value, 'agents');
            assert.equal(agentsList.length, 1, 'There should be one agents list');
            const agents = xmlContents(agentsList[0], 'agent');
            assert.equal(agents.length, 2, 'There should be two agents (General Purpose + 1 custom)');
            // First agent should always be the built-in General Purpose agent
            assert.equal(xmlContents(agents[0], 'name')[0], GeneralPurposeAgentName);
            assert.equal(xmlContents(agents[1], 'name')[0], 'test-agent-1');
            assert.equal(xmlContents(agents[1], 'description')[0], 'Test agent 1');
        });
        test('should include General Purpose agent even without custom agents config', async () => {
            workspaceContextService.setWorkspace(testWorkspace(URI.file('/gp-only-test')));
            // Explicitly do NOT set chat.customAgentInSubagent.enabled
            testConfigService.setUserConfiguration('chat.generalPurposeAgent.enabled', true);
            const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, { 'vscode_runSubagent': true }, ['*']);
            const variables = new ChatRequestVariableSet();
            await contextComputer.collect(variables, CancellationToken.None);
            const textVariables = variables.asArray().filter(v => isPromptTextVariableEntry(v));
            assert.equal(textVariables.length, 1, 'There should be one text variable for agents list');
            const agentsList = xmlContents(textVariables[0].value, 'agents');
            assert.equal(agentsList.length, 1, 'There should be one agents list');
            const agents = xmlContents(agentsList[0], 'agent');
            assert.equal(agents.length, 1, 'There should be only the GP agent');
            assert.equal(xmlContents(agents[0], 'name')[0], GeneralPurposeAgentName);
        });
        test('should include skills list when readFile tool available', async () => {
            const rootFolderName = 'skills-list-test';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            // Enable the config for agent skills
            testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/.claude/skills/javascript/SKILL.md`,
                    contents: [
                        '---',
                        'name: \'javascript\'',
                        'description: \'JavaScript best practices\'',
                        '---',
                        'JavaScript skill content',
                    ]
                },
                {
                    path: `${rootFolder}/.claude/skills/typescript/SKILL.md`,
                    contents: [
                        '---',
                        'name: \'typescript\'',
                        'description: \'TypeScript best practices\'',
                        '---',
                        'TypeScript skill content',
                    ]
                },
            ]);
            const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, { 'vscode_readFile': true }, // Enable readFile tool
            undefined);
            const variables = new ChatRequestVariableSet();
            await contextComputer.collect(variables, CancellationToken.None);
            const textVariables = variables.asArray().filter(v => isPromptTextVariableEntry(v));
            assert.equal(textVariables.length, 1, 'There should be one text variable for skills list');
            const skillsList = xmlContents(textVariables[0].value, 'skills');
            assert.equal(skillsList.length, 1, 'There should be one skills list');
            const skills = xmlContents(skillsList[0], 'skill');
            assert.equal(skills.length, 2, 'There should be two skills');
            assert.equal(xmlContents(skills[0], 'description')[0], 'JavaScript best practices');
            assert.equal(xmlContents(skills[0], 'file')[0], getFilePath(`${rootFolder}/.claude/skills/javascript/SKILL.md`));
            assert.equal(xmlContents(skills[0], 'name')[0], 'javascript');
            assert.equal(xmlContents(skills[1], 'description')[0], 'TypeScript best practices');
            assert.equal(xmlContents(skills[1], 'file')[0], getFilePath(`${rootFolder}/.claude/skills/typescript/SKILL.md`));
            assert.equal(xmlContents(skills[1], 'name')[0], 'typescript');
        });
        test('should not include skills list when readFile tool unavailable', async () => {
            const rootFolderName = 'no-skills-list-test';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            // Enable the config for agent skills
            testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/.github/skills/javascript/SKILL.md`,
                    contents: [
                        '---',
                        'description: \'JavaScript best practices\'',
                        '---',
                        'JavaScript skill content',
                    ]
                },
            ]);
            const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, undefined, // No tools available
            undefined);
            const variables = new ChatRequestVariableSet();
            await contextComputer.collect(variables, CancellationToken.None);
            const textVariables = variables.asArray().filter(v => isPromptTextVariableEntry(v));
            assert.equal(textVariables.length, 0, 'There should be no text variables when readFile tool is unavailable');
        });
        test('should not include skills list when USE_AGENT_SKILLS disabled', async () => {
            const rootFolderName = 'skills-disabled-test';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            // Disable the config for agent skills
            testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, false);
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/.github/skills/javascript/SKILL.md`,
                    contents: [
                        '---',
                        'description: \'JavaScript best practices\'',
                        '---',
                        'JavaScript skill content',
                    ]
                },
            ]);
            const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, { 'vscode_readFile': true }, // Enable readFile tool
            undefined);
            const variables = new ChatRequestVariableSet();
            await contextComputer.collect(variables, CancellationToken.None);
            const textVariables = variables.asArray().filter(v => isPromptTextVariableEntry(v));
            assert.equal(textVariables.length, 0, 'There should be no text variables when readFile tool is unavailable');
        });
        test('should include skills from home folder in skills list', async () => {
            const rootFolderName = 'home-skills-test';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            // Enable the config for agent skills
            testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
            // Disable workspace skills to isolate home folder skills
            testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, {
                '.github/skills': false,
                '.claude/skills': false,
            });
            await mockFiles(fileService, [
                // Home folder skills (using the mock user home /home/user)
                {
                    path: '/home/user/.copilot/skills/personal-skill/SKILL.md',
                    contents: [
                        '---',
                        'name: \'personal-skill\'',
                        'description: \'A personal skill from home folder\'',
                        '---',
                        'Personal skill content',
                    ]
                },
                {
                    path: '/home/user/.claude/skills/claude-personal/SKILL.md',
                    contents: [
                        '---',
                        'name: \'claude-personal\'',
                        'description: \'A Claude personal skill\'',
                        '---',
                        'Claude personal skill content',
                    ]
                },
            ]);
            const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, { 'vscode_readFile': true }, // Enable readFile tool
            undefined);
            const variables = new ChatRequestVariableSet();
            await contextComputer.collect(variables, CancellationToken.None);
            const textVariables = variables.asArray().filter(v => isPromptTextVariableEntry(v));
            const skillsList = xmlContents(textVariables[0].value, 'skills');
            assert.equal(skillsList.length, 1, 'There should be one skills list');
            const skills = xmlContents(skillsList[0], 'skill');
            assert.equal(skills.length, 2, 'There should be two skills');
            assert.equal(xmlContents(skills[0], 'description')[0], 'A personal skill from home folder');
            assert.equal(xmlContents(skills[0], 'file')[0], getFilePath(`/home/user/.copilot/skills/personal-skill/SKILL.md`));
            assert.equal(xmlContents(skills[0], 'name')[0], 'personal-skill');
            assert.equal(xmlContents(skills[1], 'description')[0], 'A Claude personal skill');
            assert.equal(xmlContents(skills[1], 'file')[0], getFilePath(`/home/user/.claude/skills/claude-personal/SKILL.md`));
            assert.equal(xmlContents(skills[1], 'name')[0], 'claude-personal');
        });
        test('should include skills with missing name, missing description, or mismatched folder name', async () => {
            const rootFolderName = 'skills-missing-metadata-test';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            // Enable the config for agent skills
            testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
            await mockFiles(fileService, [
                {
                    // Skill with no name attribute - should use folder name as fallback
                    path: `${rootFolder}/.claude/skills/no-name-skill/SKILL.md`,
                    contents: [
                        '---',
                        'description: \'A skill without a name\'',
                        '---',
                        'Skill content without name',
                    ]
                },
                {
                    // Skill with no description attribute - should still be included
                    path: `${rootFolder}/.claude/skills/no-desc-skill/SKILL.md`,
                    contents: [
                        '---',
                        'name: \'no-desc-skill\'',
                        '---',
                        'Skill content without description',
                    ]
                },
                {
                    // Skill where name does not match folder name - should still be included
                    path: `${rootFolder}/.claude/skills/actual-folder/SKILL.md`,
                    contents: [
                        '---',
                        'name: \'mismatched-name\'',
                        'description: \'A skill with mismatched name\'',
                        '---',
                        'Skill content with mismatched name',
                    ]
                },
            ]);
            const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, { 'vscode_readFile': true }, // Enable readFile tool
            undefined);
            const variables = new ChatRequestVariableSet();
            await contextComputer.collect(variables, CancellationToken.None);
            const textVariables = variables.asArray().filter(v => isPromptTextVariableEntry(v));
            assert.equal(textVariables.length, 1, 'There should be one text variable for skills list');
            const skillsList = xmlContents(textVariables[0].value, 'skills');
            assert.equal(skillsList.length, 1, 'There should be one skills list');
            const skills = xmlContents(skillsList[0], 'skill');
            assert.equal(skills.length, 3, 'All three skills should be included despite missing/mismatched metadata');
            // Skill with missing name should use folder name as fallback
            assert.equal(xmlContents(skills[0], 'name')[0], 'no-name-skill');
            assert.equal(xmlContents(skills[0], 'description')[0], 'A skill without a name');
            assert.equal(xmlContents(skills[0], 'file')[0], getFilePath(`${rootFolder}/.claude/skills/no-name-skill/SKILL.md`));
            // Skill with missing description should still be listed
            assert.equal(xmlContents(skills[1], 'name')[0], 'no-desc-skill');
            assert.equal(xmlContents(skills[1], 'description').length, 0, 'Should have no description element');
            assert.equal(xmlContents(skills[1], 'file')[0], getFilePath(`${rootFolder}/.claude/skills/no-desc-skill/SKILL.md`));
            // Skill with mismatched name should use folder name
            assert.equal(xmlContents(skills[2], 'name')[0], 'actual-folder');
            assert.equal(xmlContents(skills[2], 'description')[0], 'A skill with mismatched name');
            assert.equal(xmlContents(skills[2], 'file')[0], getFilePath(`${rootFolder}/.claude/skills/actual-folder/SKILL.md`));
        });
    });
    suite('edge cases', () => {
        test('should handle empty workspace', async () => {
            const rootFolderName = 'empty-workspace';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, undefined, undefined);
            const variables = new ChatRequestVariableSet();
            await contextComputer.collect(variables, CancellationToken.None);
            // Should not throw and should handle gracefully
            assert.ok(true, 'Should handle empty workspace without errors');
        });
        test('should handle malformed instruction files', async () => {
            const rootFolderName = 'malformed-test';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/.github/instructions/malformed.instructions.md`,
                    contents: [
                        '---',
                        'invalid yaml: [unclosed',
                        '---',
                        'Content',
                    ]
                },
                {
                    path: `${rootFolder}/src/file.ts`,
                    contents: ['code'],
                },
            ]);
            const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, undefined, undefined);
            const variables = new ChatRequestVariableSet();
            variables.add(toFileVariableEntry(URI.joinPath(rootFolderUri, 'src/file.ts')));
            // Should not throw
            await contextComputer.collect(variables, CancellationToken.None);
            assert.ok(true, 'Should handle malformed instruction files gracefully');
        });
        test('should handle cancellation', async () => {
            const rootFolderName = 'cancellation-test';
            const rootFolder = `/${rootFolderName}`;
            const rootFolderUri = URI.file(rootFolder);
            workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
            await mockFiles(fileService, [
                {
                    path: `${rootFolder}/src/file.ts`,
                    contents: ['code'],
                },
            ]);
            const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, undefined, undefined);
            const variables = new ChatRequestVariableSet();
            variables.add(toFileVariableEntry(URI.joinPath(rootFolderUri, 'src/file.ts')));
            // Create a cancelled token
            const cancelledToken = {
                isCancellationRequested: true,
                onCancellationRequested: Event.None
            };
            // Should handle cancellation gracefully
            await contextComputer.collect(variables, cancelledToken);
            assert.ok(true, 'Should handle cancellation without errors');
        });
    });
    test('should collect CLAUDE.md when enabled', async () => {
        const rootFolderName = 'collect-claude-test';
        const rootFolder = `/${rootFolderName}`;
        const rootFolderUri = URI.file(rootFolder);
        workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
        await mockFiles(fileService, [
            {
                path: `${rootFolder}/CLAUDE.md`,
                contents: [
                    'Claude guidelines',
                ]
            },
            {
                path: `${rootFolder}/src/file.ts`,
                contents: [
                    'console.log("test");',
                ]
            },
        ]);
        // Test when USE_CLAUDE_MD is true
        testConfigService.setUserConfiguration(PromptsConfig.USE_CLAUDE_MD, true);
        const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, undefined, undefined);
        const variables = new ChatRequestVariableSet();
        variables.add(toFileVariableEntry(URI.joinPath(rootFolderUri, 'src/file.ts')));
        await contextComputer.collect(variables, CancellationToken.None);
        let instructionFiles = variables.asArray().filter(v => isPromptFileVariableEntry(v));
        let paths = instructionFiles.map(i => isPromptFileVariableEntry(i) ? i.value.path : undefined);
        assert.ok(paths.includes(`${rootFolder}/CLAUDE.md`), 'Should include CLAUDE.md when enabled');
        // Test when USE_CLAUDE_MD is false
        testConfigService.setUserConfiguration(PromptsConfig.USE_CLAUDE_MD, false);
        const contextComputer2 = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, undefined, undefined);
        const variables2 = new ChatRequestVariableSet();
        variables2.add(toFileVariableEntry(URI.joinPath(rootFolderUri, 'src/file.ts')));
        await contextComputer2.collect(variables2, CancellationToken.None);
        instructionFiles = variables2.asArray().filter(v => isPromptFileVariableEntry(v));
        paths = instructionFiles.map(i => isPromptFileVariableEntry(i) ? i.value.path : undefined);
        assert.ok(!paths.includes(`${rootFolder}/CLAUDE.md`), 'Should not include CLAUDE.md when disabled');
    });
    test('should collect .claude/CLAUDE.md when enabled', async () => {
        const rootFolderName = 'collect-claude-test';
        const rootFolder = `/${rootFolderName}`;
        const rootFolderUri = URI.file(rootFolder);
        workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
        await mockFiles(fileService, [
            {
                path: `${rootFolder}/.claude/CLAUDE.md`,
                contents: [
                    'Claude guidelines',
                ]
            },
            {
                path: `${rootFolder}/src/file.ts`,
                contents: [
                    'console.log("test");',
                ]
            },
        ]);
        // Test when USE_CLAUDE_MD is true
        testConfigService.setUserConfiguration(PromptsConfig.USE_CLAUDE_MD, true);
        const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, undefined, undefined);
        const variables = new ChatRequestVariableSet();
        variables.add(toFileVariableEntry(URI.joinPath(rootFolderUri, 'src/file.ts')));
        await contextComputer.collect(variables, CancellationToken.None);
        let instructionFiles = variables.asArray().filter(v => isPromptFileVariableEntry(v));
        let paths = instructionFiles.map(i => isPromptFileVariableEntry(i) ? i.value.path : undefined);
        assert.ok(paths.includes(`${rootFolder}/.claude/CLAUDE.md`), 'Should include .claude/CLAUDE.md when enabled');
        // Test when USE_CLAUDE_MD is false
        testConfigService.setUserConfiguration(PromptsConfig.USE_CLAUDE_MD, false);
        const contextComputer2 = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, undefined, undefined);
        const variables2 = new ChatRequestVariableSet();
        variables2.add(toFileVariableEntry(URI.joinPath(rootFolderUri, 'src/file.ts')));
        await contextComputer2.collect(variables2, CancellationToken.None);
        instructionFiles = variables2.asArray().filter(v => isPromptFileVariableEntry(v));
        paths = instructionFiles.map(i => isPromptFileVariableEntry(i) ? i.value.path : undefined);
        assert.ok(!paths.includes(`${rootFolder}/.claude/CLAUDE.md`), 'Should not include .claude/CLAUDE.md when disabled');
    });
    test('should collect parent folder CLAUDE configurations when includeWorkspaceFolderParents is enabled', async () => {
        const parentFolderName = 'collect-claude-parent-test';
        const parentFolder = `/${parentFolderName}`;
        const rootFolder = `${parentFolder}/repo`;
        const rootFolderUri = URI.file(rootFolder);
        workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
        await mockFiles(fileService, [
            {
                path: `${parentFolder}/.git/HEAD`,
                contents: ['ref: refs/heads/main'],
            },
            {
                path: `${parentFolder}/CLAUDE.md`,
                contents: ['Parent Claude guidelines'],
            },
            {
                path: `${parentFolder}/.claude/CLAUDE.md`,
                contents: ['Parent .claude Claude guidelines'],
            },
            {
                path: `${rootFolder}/src/file.ts`,
                contents: ['console.log("test");'],
            },
        ]);
        testConfigService.setUserConfiguration(PromptsConfig.USE_CLAUDE_MD, true);
        testConfigService.setUserConfiguration(PromptsConfig.USE_CUSTOMIZATIONS_IN_PARENT_REPOS, false);
        await workspaceTrustService.setTrustedUris([URI.file(parentFolder)]);
        const disabledParentContextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, undefined, undefined);
        const disabledParentVariables = new ChatRequestVariableSet();
        disabledParentVariables.add(toFileVariableEntry(URI.joinPath(rootFolderUri, 'src/file.ts')));
        await disabledParentContextComputer.collect(disabledParentVariables, CancellationToken.None);
        let paths = disabledParentVariables.asArray()
            .filter(v => isPromptFileVariableEntry(v))
            .map(i => isPromptFileVariableEntry(i) ? i.value.path : undefined);
        assert.ok(!paths.includes(`${parentFolder}/CLAUDE.md`), 'Should not include parent CLAUDE.md when parent search is disabled');
        assert.ok(!paths.includes(`${parentFolder}/.claude/CLAUDE.md`), 'Should not include parent .claude/CLAUDE.md when parent search is disabled');
        // Parent folder settings should allow finding both root and .claude CLAUDE files above the workspace folder.
        testConfigService.setUserConfiguration(PromptsConfig.USE_CUSTOMIZATIONS_IN_PARENT_REPOS, true);
        const enabledParentContextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, undefined, undefined);
        const enabledParentVariables = new ChatRequestVariableSet();
        enabledParentVariables.add(toFileVariableEntry(URI.joinPath(rootFolderUri, 'src/file.ts')));
        await enabledParentContextComputer.collect(enabledParentVariables, CancellationToken.None);
        paths = enabledParentVariables.asArray()
            .filter(v => isPromptFileVariableEntry(v))
            .map(i => isPromptFileVariableEntry(i) ? i.value.path : undefined);
        assert.ok(paths.includes(`${parentFolder}/CLAUDE.md`), 'Should include parent CLAUDE.md when parent search is enabled');
        assert.ok(paths.includes(`${parentFolder}/.claude/CLAUDE.md`), 'Should include parent .claude/CLAUDE.md when parent search is enabled');
    });
    test('should collect parent folder copilot-instructions.md and AGENTS.md when includeWorkspaceFolderParents is enabled', async () => {
        const parentFolderName = 'collect-agent-parent-test';
        const parentFolder = `/${parentFolderName}`;
        const rootFolder = `${parentFolder}/repo`;
        const rootFolderUri = URI.file(rootFolder);
        workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
        await mockFiles(fileService, [
            {
                path: `${parentFolder}/.git/HEAD`,
                contents: ['ref: refs/heads/main'],
            },
            {
                path: `${parentFolder}/.github/copilot-instructions.md`,
                contents: ['Parent copilot instructions'],
            },
            {
                path: `${parentFolder}/AGENTS.md`,
                contents: ['Parent agent guidelines'],
            },
            {
                path: `${rootFolder}/src/file.ts`,
                contents: ['console.log("test");'],
            },
        ]);
        testConfigService.setUserConfiguration(PromptsConfig.USE_COPILOT_INSTRUCTION_FILES, true);
        testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_MD, true);
        testConfigService.setUserConfiguration(PromptsConfig.USE_CUSTOMIZATIONS_IN_PARENT_REPOS, false);
        await workspaceTrustService.setTrustedUris([URI.file(parentFolder)]);
        const disabledParentContextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, undefined, undefined);
        const disabledParentVariables = new ChatRequestVariableSet();
        disabledParentVariables.add(toFileVariableEntry(URI.joinPath(rootFolderUri, 'src/file.ts')));
        await disabledParentContextComputer.collect(disabledParentVariables, CancellationToken.None);
        let paths = disabledParentVariables.asArray()
            .filter(v => isPromptFileVariableEntry(v))
            .map(i => isPromptFileVariableEntry(i) ? i.value.path : undefined);
        assert.ok(!paths.includes(`${parentFolder}/.github/copilot-instructions.md`), 'Should not include parent copilot-instructions.md when parent search is disabled');
        assert.ok(!paths.includes(`${parentFolder}/AGENTS.md`), 'Should not include parent AGENTS.md when parent search is disabled');
        testConfigService.setUserConfiguration(PromptsConfig.USE_CUSTOMIZATIONS_IN_PARENT_REPOS, true);
        const enabledParentContextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, undefined, undefined);
        const enabledParentVariables = new ChatRequestVariableSet();
        enabledParentVariables.add(toFileVariableEntry(URI.joinPath(rootFolderUri, 'src/file.ts')));
        await enabledParentContextComputer.collect(enabledParentVariables, CancellationToken.None);
        paths = enabledParentVariables.asArray()
            .filter(v => isPromptFileVariableEntry(v))
            .map(i => isPromptFileVariableEntry(i) ? i.value.path : undefined);
        assert.ok(paths.includes(`${parentFolder}/.github/copilot-instructions.md`), 'Should include parent copilot-instructions.md when parent search is enabled');
        assert.ok(paths.includes(`${parentFolder}/AGENTS.md`), 'Should include parent AGENTS.md when parent search is enabled');
    });
    test('should collect ~/.claude/CLAUDE.md when enabled', async () => {
        const rootFolderName = 'collect-claude-home-test';
        const rootFolder = `/${rootFolderName}`;
        const rootFolderUri = URI.file(rootFolder);
        workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
        await mockFiles(fileService, [
            {
                path: `/home/user/.claude/CLAUDE.md`,
                contents: [
                    'Claude guidelines from home',
                ]
            },
            {
                path: `${rootFolder}/src/file.ts`,
                contents: [
                    'console.log("test");',
                ]
            },
        ]);
        // Test when USE_CLAUDE_MD is true
        testConfigService.setUserConfiguration(PromptsConfig.USE_CLAUDE_MD, true);
        const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, undefined, undefined);
        const variables = new ChatRequestVariableSet();
        variables.add(toFileVariableEntry(URI.joinPath(rootFolderUri, 'src/file.ts')));
        await contextComputer.collect(variables, CancellationToken.None);
        let instructionFiles = variables.asArray().filter(v => isPromptFileVariableEntry(v));
        let paths = instructionFiles.map(i => isPromptFileVariableEntry(i) ? i.value.path : undefined);
        assert.ok(paths.includes(`/home/user/.claude/CLAUDE.md`), 'Should include ~/.claude/CLAUDE.md when enabled');
        // Test when USE_CLAUDE_MD is false
        testConfigService.setUserConfiguration(PromptsConfig.USE_CLAUDE_MD, false);
        const contextComputer2 = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, undefined, undefined);
        const variables2 = new ChatRequestVariableSet();
        variables2.add(toFileVariableEntry(URI.joinPath(rootFolderUri, 'src/file.ts')));
        await contextComputer2.collect(variables2, CancellationToken.None);
        instructionFiles = variables2.asArray().filter(v => isPromptFileVariableEntry(v));
        paths = instructionFiles.map(i => isPromptFileVariableEntry(i) ? i.value.path : undefined);
        assert.ok(!paths.includes(`/home/user/.claude/CLAUDE.md`), 'Should not include ~/.claude/CLAUDE.md when disabled');
    });
    test('should collect instructions from multi-root workspace', async () => {
        const rootFolder1Name = 'multi-root-1';
        const rootFolder1 = `/${rootFolder1Name}`;
        const rootFolder1Uri = URI.file(rootFolder1);
        const rootFolder2Name = 'multi-root-2';
        const rootFolder2 = `/${rootFolder2Name}`;
        const rootFolder2Uri = URI.file(rootFolder2);
        workspaceContextService.setWorkspace(testWorkspace(rootFolder1Uri, rootFolder2Uri));
        await mockFiles(fileService, [
            {
                path: `${rootFolder1}/.github/instructions/ts.instructions.md`,
                contents: [
                    '---',
                    'applyTo: "**/*.ts"',
                    '---',
                    'TS from root 1',
                ]
            },
            {
                path: `${rootFolder2}/.github/instructions/js.instructions.md`,
                contents: [
                    '---',
                    'applyTo: "**/*.js"',
                    '---',
                    'JS from root 2',
                ]
            },
            {
                path: `${rootFolder1}/src/file.ts`,
                contents: ['console.log("test");'],
            },
            {
                path: `${rootFolder2}/src/file.js`,
                contents: ['console.log("test");'],
            },
        ]);
        const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, undefined, undefined);
        const variables = new ChatRequestVariableSet();
        variables.add(toFileVariableEntry(URI.joinPath(rootFolder1Uri, 'src/file.ts')));
        variables.add(toFileVariableEntry(URI.joinPath(rootFolder2Uri, 'src/file.js')));
        await contextComputer.collect(variables, CancellationToken.None);
        const instructionFiles = variables.asArray().filter(v => isPromptFileVariableEntry(v));
        const paths = instructionFiles.map(i => isPromptFileVariableEntry(i) ? i.value.path : undefined);
        assert.strictEqual(instructionFiles.length, 2, 'Should collect one instruction from each root');
        assert.ok(paths.includes(`${rootFolder1}/.github/instructions/ts.instructions.md`), 'Should include instruction from first root');
        assert.ok(paths.includes(`${rootFolder2}/.github/instructions/js.instructions.md`), 'Should include instruction from second root');
    });
    test('should collect CLAUDE.md from multi-root workspace', async () => {
        const rootFolder1Name = 'multi-root-claude-1';
        const rootFolder1 = `/${rootFolder1Name}`;
        const rootFolder1Uri = URI.file(rootFolder1);
        const rootFolder2Name = 'multi-root-claude-2';
        const rootFolder2 = `/${rootFolder2Name}`;
        const rootFolder2Uri = URI.file(rootFolder2);
        workspaceContextService.setWorkspace(testWorkspace(rootFolder1Uri, rootFolder2Uri));
        await mockFiles(fileService, [
            {
                path: `${rootFolder1}/CLAUDE.md`,
                contents: ['Claude guidelines from root 1'],
            },
            {
                path: `${rootFolder2}/CLAUDE.md`,
                contents: ['Claude guidelines from root 2'],
            },
            {
                path: `${rootFolder1}/src/file.ts`,
                contents: ['console.log("test");'],
            },
            {
                path: `${rootFolder2}/src/file.js`,
                contents: ['console.log("test");'],
            },
        ]);
        // Test when USE_CLAUDE_MD is true
        testConfigService.setUserConfiguration(PromptsConfig.USE_CLAUDE_MD, true);
        const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, undefined, undefined);
        const variables = new ChatRequestVariableSet();
        variables.add(toFileVariableEntry(URI.joinPath(rootFolder1Uri, 'src/file.ts')));
        variables.add(toFileVariableEntry(URI.joinPath(rootFolder2Uri, 'src/file.js')));
        await contextComputer.collect(variables, CancellationToken.None);
        const instructionFiles = variables.asArray().filter(v => isPromptFileVariableEntry(v));
        const paths = instructionFiles.map(i => isPromptFileVariableEntry(i) ? i.value.path : undefined);
        assert.ok(paths.includes(`${rootFolder1}/CLAUDE.md`), 'Should include CLAUDE.md from first root');
        assert.ok(paths.includes(`${rootFolder2}/CLAUDE.md`), 'Should include CLAUDE.md from second root');
    });
    test('should collect .claude/CLAUDE.md from multi-root workspace', async () => {
        const rootFolder1Name = 'multi-root-dotclaude-1';
        const rootFolder1 = `/${rootFolder1Name}`;
        const rootFolder1Uri = URI.file(rootFolder1);
        const rootFolder2Name = 'multi-root-dotclaude-2';
        const rootFolder2 = `/${rootFolder2Name}`;
        const rootFolder2Uri = URI.file(rootFolder2);
        workspaceContextService.setWorkspace(testWorkspace(rootFolder1Uri, rootFolder2Uri));
        await mockFiles(fileService, [
            {
                path: `${rootFolder1}/.claude/CLAUDE.md`,
                contents: ['Claude guidelines from .claude folder in root 1'],
            },
            {
                path: `${rootFolder2}/.claude/CLAUDE.md`,
                contents: ['Claude guidelines from .claude folder in root 2'],
            },
            {
                path: `${rootFolder1}/src/file.ts`,
                contents: ['console.log("test");'],
            },
            {
                path: `${rootFolder2}/src/file.js`,
                contents: ['console.log("test");'],
            },
        ]);
        // Test when USE_CLAUDE_MD is true
        testConfigService.setUserConfiguration(PromptsConfig.USE_CLAUDE_MD, true);
        const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, undefined, undefined);
        const variables = new ChatRequestVariableSet();
        variables.add(toFileVariableEntry(URI.joinPath(rootFolder1Uri, 'src/file.ts')));
        variables.add(toFileVariableEntry(URI.joinPath(rootFolder2Uri, 'src/file.js')));
        await contextComputer.collect(variables, CancellationToken.None);
        const instructionFiles = variables.asArray().filter(v => isPromptFileVariableEntry(v));
        const paths = instructionFiles.map(i => isPromptFileVariableEntry(i) ? i.value.path : undefined);
        assert.ok(paths.includes(`${rootFolder1}/.claude/CLAUDE.md`), 'Should include .claude/CLAUDE.md from first root');
        assert.ok(paths.includes(`${rootFolder2}/.claude/CLAUDE.md`), 'Should include .claude/CLAUDE.md from second root');
    });
    test('should collect both root CLAUDE.md and .claude/CLAUDE.md from multi-root workspace', async () => {
        const rootFolder1Name = 'multi-root-mixed-1';
        const rootFolder1 = `/${rootFolder1Name}`;
        const rootFolder1Uri = URI.file(rootFolder1);
        const rootFolder2Name = 'multi-root-mixed-2';
        const rootFolder2 = `/${rootFolder2Name}`;
        const rootFolder2Uri = URI.file(rootFolder2);
        workspaceContextService.setWorkspace(testWorkspace(rootFolder1Uri, rootFolder2Uri));
        await mockFiles(fileService, [
            {
                path: `${rootFolder1}/CLAUDE.md`,
                contents: ['Claude guidelines from root 1'],
            },
            {
                path: `${rootFolder1}/.claude/CLAUDE.md`,
                contents: ['Claude guidelines from .claude folder in root 1'],
            },
            {
                path: `${rootFolder2}/CLAUDE.md`,
                contents: ['Claude guidelines from root 2'],
            },
            {
                path: `${rootFolder2}/.claude/CLAUDE.md`,
                contents: ['Claude guidelines from .claude folder in root 2'],
            },
            {
                path: `${rootFolder1}/src/file.ts`,
                contents: ['console.log("test");'],
            },
            {
                path: `${rootFolder2}/src/file.js`,
                contents: ['console.log("test");'],
            },
        ]);
        // Test when USE_CLAUDE_MD is true
        testConfigService.setUserConfiguration(PromptsConfig.USE_CLAUDE_MD, true);
        const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, undefined, undefined);
        const variables = new ChatRequestVariableSet();
        variables.add(toFileVariableEntry(URI.joinPath(rootFolder1Uri, 'src/file.ts')));
        variables.add(toFileVariableEntry(URI.joinPath(rootFolder2Uri, 'src/file.js')));
        await contextComputer.collect(variables, CancellationToken.None);
        const instructionFiles = variables.asArray().filter(v => isPromptFileVariableEntry(v));
        const paths = instructionFiles.map(i => isPromptFileVariableEntry(i) ? i.value.path : undefined);
        assert.ok(paths.includes(`${rootFolder1}/CLAUDE.md`), 'Should include CLAUDE.md from first root');
        assert.ok(paths.includes(`${rootFolder1}/.claude/CLAUDE.md`), 'Should include .claude/CLAUDE.md from first root');
        assert.ok(paths.includes(`${rootFolder2}/CLAUDE.md`), 'Should include CLAUDE.md from second root');
        assert.ok(paths.includes(`${rootFolder2}/.claude/CLAUDE.md`), 'Should include .claude/CLAUDE.md from second root');
    });
    test('should not collect CLAUDE.md from multi-root workspace when disabled', async () => {
        const rootFolder1Name = 'multi-root-disabled-1';
        const rootFolder1 = `/${rootFolder1Name}`;
        const rootFolder1Uri = URI.file(rootFolder1);
        const rootFolder2Name = 'multi-root-disabled-2';
        const rootFolder2 = `/${rootFolder2Name}`;
        const rootFolder2Uri = URI.file(rootFolder2);
        workspaceContextService.setWorkspace(testWorkspace(rootFolder1Uri, rootFolder2Uri));
        await mockFiles(fileService, [
            {
                path: `${rootFolder1}/CLAUDE.md`,
                contents: ['Claude guidelines from root 1'],
            },
            {
                path: `${rootFolder2}/CLAUDE.md`,
                contents: ['Claude guidelines from root 2'],
            },
            {
                path: `${rootFolder1}/src/file.ts`,
                contents: ['console.log("test");'],
            },
            {
                path: `${rootFolder2}/src/file.js`,
                contents: ['console.log("test");'],
            },
        ]);
        // Test when USE_CLAUDE_MD is false
        testConfigService.setUserConfiguration(PromptsConfig.USE_CLAUDE_MD, false);
        const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, undefined, undefined);
        const variables = new ChatRequestVariableSet();
        variables.add(toFileVariableEntry(URI.joinPath(rootFolder1Uri, 'src/file.ts')));
        variables.add(toFileVariableEntry(URI.joinPath(rootFolder2Uri, 'src/file.js')));
        await contextComputer.collect(variables, CancellationToken.None);
        const instructionFiles = variables.asArray().filter(v => isPromptFileVariableEntry(v));
        const paths = instructionFiles.map(i => isPromptFileVariableEntry(i) ? i.value.path : undefined);
        assert.ok(!paths.includes(`${rootFolder1}/CLAUDE.md`), 'Should not include CLAUDE.md from first root when disabled');
        assert.ok(!paths.includes(`${rootFolder2}/CLAUDE.md`), 'Should not include CLAUDE.md from second root when disabled');
    });
    test('should collect both CLAUDE.md and CLAUDE.local.md from multi-root workspace', async () => {
        const rootFolder1Name = 'multi-root-claude-both-1';
        const rootFolder1 = `/${rootFolder1Name}`;
        const rootFolder1Uri = URI.file(rootFolder1);
        const rootFolder2Name = 'multi-root-claude-both-2';
        const rootFolder2 = `/${rootFolder2Name}`;
        const rootFolder2Uri = URI.file(rootFolder2);
        workspaceContextService.setWorkspace(testWorkspace(rootFolder1Uri, rootFolder2Uri));
        await mockFiles(fileService, [
            {
                path: `${rootFolder1}/CLAUDE.md`,
                contents: ['Claude guidelines from root 1'],
            },
            {
                path: `${rootFolder1}/CLAUDE.local.md`,
                contents: ['Local Claude guidelines from root 1'],
            },
            {
                path: `${rootFolder2}/CLAUDE.md`,
                contents: ['Claude guidelines from root 2'],
            },
            {
                path: `${rootFolder2}/CLAUDE.local.md`,
                contents: ['Local Claude guidelines from root 2'],
            },
            {
                path: `${rootFolder1}/src/file.ts`,
                contents: ['console.log("test");'],
            },
            {
                path: `${rootFolder2}/src/file.js`,
                contents: ['console.log("test");'],
            },
        ]);
        // Test when USE_CLAUDE_MD is true
        testConfigService.setUserConfiguration(PromptsConfig.USE_CLAUDE_MD, true);
        const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, undefined, undefined);
        const variables = new ChatRequestVariableSet();
        variables.add(toFileVariableEntry(URI.joinPath(rootFolder1Uri, 'src/file.ts')));
        variables.add(toFileVariableEntry(URI.joinPath(rootFolder2Uri, 'src/file.js')));
        await contextComputer.collect(variables, CancellationToken.None);
        const instructionFiles = variables.asArray().filter(v => isPromptFileVariableEntry(v));
        const paths = instructionFiles.map(i => isPromptFileVariableEntry(i) ? i.value.path : undefined);
        assert.ok(paths.includes(`${rootFolder1}/CLAUDE.md`), 'Should include CLAUDE.md from first root');
        assert.ok(paths.includes(`${rootFolder1}/CLAUDE.local.md`), 'Should include CLAUDE.local.md from first root');
        assert.ok(paths.includes(`${rootFolder2}/CLAUDE.md`), 'Should include CLAUDE.md from second root');
        assert.ok(paths.includes(`${rootFolder2}/CLAUDE.local.md`), 'Should include CLAUDE.local.md from second root');
    });
    test('should filter symlinks', async () => {
        const rootFolderName = 'partial-symlink-test';
        const rootFolder = `/${rootFolderName}`;
        const rootFolderUri = URI.file(rootFolder);
        workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));
        const copilotUri = URI.joinPath(rootFolderUri, '.github/copilot-instructions.md');
        const agentMdUri = URI.joinPath(rootFolderUri, 'AGENTS.md');
        const claudeMdUri = URI.joinPath(rootFolderUri, 'CLAUDE.md');
        // Create all three agent instruction files
        await mockFiles(fileService, [
            {
                path: `${rootFolder}/src/file.ts`,
                contents: ['console.log("test");'],
            },
            {
                path: copilotUri.path,
                contents: ['# Copilot Instructions'],
            },
            {
                path: agentMdUri.path,
                contents: ['# Copilot Instructions'],
            },
            {
                path: claudeMdUri.path,
                contents: ['# Copilot Instructions'],
            },
        ]);
        // AGENTS.md and CLAUDE.md are symlinks to copilot
        fileSystemProvider.setRealPath(agentMdUri, copilotUri);
        fileSystemProvider.setRealPath(claudeMdUri, copilotUri);
        // Enable all three types of agent instructions
        testConfigService.setUserConfiguration(PromptsConfig.USE_COPILOT_INSTRUCTION_FILES, true);
        testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_MD, true);
        testConfigService.setUserConfiguration(PromptsConfig.USE_CLAUDE_MD, true);
        const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, undefined, undefined);
        const variables = new ChatRequestVariableSet();
        variables.add(toFileVariableEntry(URI.joinPath(rootFolderUri, 'src/file.ts')));
        await contextComputer.collect(variables, CancellationToken.None);
        const instructionFiles = variables.asArray().filter(v => isPromptFileVariableEntry(v));
        const paths = instructionFiles.map(i => isPromptFileVariableEntry(i) ? i.value.path : undefined);
        // copilot-instructions.md should be included
        // AGENTS.md should be skipped as link to copilot
        // CLAUDE.md should be skipped as link to copilot
        assert.strictEqual(instructionFiles.length, 1, 'Should include 1 files (copilot)');
        assert.ok(paths.includes(copilotUri.path), 'Should include copilot-instructions.md');
        assert.ok(!paths.includes(agentMdUri.path), 'Should not include AGENTS.md (symlink to copilot)');
        assert.ok(!paths.includes(claudeMdUri.path), 'Should not include CLAUDE.md (symlink to copilot)');
    });
});
suite('getFilePath', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('should return fsPath for file:// URIs', () => {
        const uri = URI.file('/workspace/src/file.ts');
        const result = getFilePath(uri, undefined);
        assert.strictEqual(result, uri.fsPath);
    });
    test('should return fsPath for vscode-remote URIs', () => {
        const uri = URI.from({ scheme: Schemas.vscodeRemote, path: '/workspace/src/file.ts' });
        const result = getFilePath(uri, undefined);
        assert.strictEqual(result, uri.fsPath);
    });
    test('should return uri.toString() for other schemes', () => {
        const uri = URI.from({ scheme: 'untitled', path: '/workspace/src/file.ts' });
        const result = getFilePath(uri, undefined);
        assert.strictEqual(result, uri.toString());
    });
    test('should use backslashes when remote is Windows', () => {
        const uri = URI.from({ scheme: Schemas.vscodeRemote, path: '/C:/Users/dev/project/file.ts' });
        const result = getFilePath(uri, 1 /* OperatingSystem.Windows */);
        assert.ok(!result.includes('/'), 'Should not contain forward slashes');
        assert.ok(result.includes('\\'), 'Should contain backslashes');
    });
    test('should use forward slashes when remote is Linux', () => {
        const uri = URI.from({ scheme: Schemas.vscodeRemote, path: '/home/user/project/file.ts' });
        const result = getFilePath(uri, 3 /* OperatingSystem.Linux */);
        assert.ok(!result.includes('\\'), 'Should not contain backslashes');
        assert.ok(result.includes('/home/user/project/file.ts'), 'Should contain the forward-slash path');
    });
    test('should use forward slashes when remote is macOS', () => {
        const uri = URI.from({ scheme: Schemas.vscodeRemote, path: '/Users/dev/project/file.ts' });
        const result = getFilePath(uri, 2 /* OperatingSystem.Macintosh */);
        assert.ok(!result.includes('\\'), 'Should not contain backslashes');
        assert.ok(result.includes('/Users/dev/project/file.ts'), 'Should contain the forward-slash path');
    });
    test('should not replace slashes when remoteOS is undefined', () => {
        const uri = URI.file('/workspace/src/file.ts');
        const result = getFilePath(uri, undefined);
        assert.strictEqual(result, uri.fsPath);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tcHV0ZUF1dG9tYXRpY0luc3RydWN0aW9ucy50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC90ZXN0L2NvbW1vbi9wcm9tcHRTeW50YXgvY29tcHV0ZUF1dG9tYXRpY0luc3RydWN0aW9ucy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEtBQUssS0FBSyxNQUFNLE9BQU8sQ0FBQztBQUMvQixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUNsRixPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDL0QsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBRW5FLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMzRCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUN0RyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUN6RixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDbEYsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQ3hGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBQ3pHLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLGtGQUFrRixDQUFDO0FBQzVILE9BQU8sRUFBRSxtQkFBbUIsRUFBeUIsTUFBTSw0REFBNEQsQ0FBQztBQUN4SCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDaEYsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQ3JGLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLGtGQUFrRixDQUFDO0FBQzVILE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNqRixPQUFPLEVBQUUsV0FBVyxFQUFFLGNBQWMsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQzNGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3JHLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQ3BHLE9BQU8sRUFBRSxnQ0FBZ0MsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ2pILE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxtRUFBbUUsQ0FBQztBQUNsRyxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxtRUFBbUUsQ0FBQztBQUM1RyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsMEJBQTBCLEVBQUUsbUNBQW1DLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUMxSixPQUFPLEVBQUUsc0JBQXNCLEVBQUUseUJBQXlCLEVBQUUseUJBQXlCLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUN2SyxPQUFPLEVBQUUsNEJBQTRCLEVBQUUsV0FBVyxFQUErQixNQUFNLDhEQUE4RCxDQUFDO0FBQ3RKLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUM5RSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsMEJBQTBCLEVBQUUsMEJBQTBCLEVBQUUsa0NBQWtDLEVBQUUsaUNBQWlDLEVBQUUsNEJBQTRCLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUN0UixPQUFPLEVBQUUsd0JBQXdCLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUMzRyxPQUFPLEVBQWUsZUFBZSxFQUFFLGNBQWMsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQ3RILE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUM1RixPQUFPLEVBQUUsU0FBUyxFQUFFLDBDQUEwQyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDdEcsT0FBTyxFQUFFLHNCQUFzQixFQUFFLGVBQWUsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQy9HLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUNsRixPQUFPLEVBQWMsY0FBYyxFQUFFLE1BQU0saURBQWlELENBQUM7QUFDN0YsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDNUYsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDaEcsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sMEVBQTBFLENBQUM7QUFDL0csT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsWUFBWSxFQUFFLHVCQUF1QixFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDckYsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDaEcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNEVBQTRFLENBQUM7QUFDbkgsT0FBTyxFQUFnQixtQkFBbUIsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQ2xHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUU5RSxLQUFLLENBQUMsOEJBQThCLEVBQUUsR0FBRyxFQUFFO0lBQzFDLE1BQU0sV0FBVyxHQUFHLHVDQUF1QyxFQUFFLENBQUM7SUFFOUQsSUFBSSxPQUF3QixDQUFDO0lBQzdCLElBQUksWUFBc0MsQ0FBQztJQUMzQyxJQUFJLHVCQUEyQyxDQUFDO0lBQ2hELElBQUksaUJBQTJDLENBQUM7SUFDaEQsSUFBSSxXQUF5QixDQUFDO0lBQzlCLElBQUksWUFBd0MsQ0FBQztJQUM3QyxJQUFJLGtCQUE4RCxDQUFDO0lBQ25FLElBQUkscUJBQTBELENBQUM7SUFFL0QsS0FBSyxDQUFDLEtBQUssSUFBSSxFQUFFO1FBQ2hCLFlBQVksR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksd0JBQXdCLEVBQUUsQ0FBQyxDQUFDO1FBQy9ELFlBQVksQ0FBQyxJQUFJLENBQUMsV0FBVyxFQUFFLElBQUksY0FBYyxFQUFFLENBQUMsQ0FBQztRQUVyRCx1QkFBdUIsR0FBRyxJQUFJLGtCQUFrQixFQUFFLENBQUM7UUFDbkQsWUFBWSxDQUFDLElBQUksQ0FBQyx3QkFBd0IsRUFBRSx1QkFBdUIsQ0FBQyxDQUFDO1FBRXJFLGlCQUFpQixHQUFHLElBQUksd0JBQXdCLEVBQUUsQ0FBQztRQUNuRCxpQkFBaUIsQ0FBQyxvQkFBb0IsQ0FBQyxhQUFhLENBQUMsNkJBQTZCLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDMUYsaUJBQWlCLENBQUMsb0JBQW9CLENBQUMsYUFBYSxDQUFDLFlBQVksRUFBRSxJQUFJLENBQUMsQ0FBQztRQUN6RSxpQkFBaUIsQ0FBQyxvQkFBb0IsQ0FBQyxhQUFhLENBQUMsYUFBYSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzNFLGlCQUFpQixDQUFDLG9CQUFvQixDQUFDLGFBQWEsQ0FBQyxtQkFBbUIsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNqRixpQkFBaUIsQ0FBQyxvQkFBb0IsQ0FBQyxhQUFhLENBQUMsZ0JBQWdCLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDN0UsaUJBQWlCLENBQUMsb0JBQW9CLENBQUMsYUFBYSxDQUFDLDZCQUE2QixFQUFFLElBQUksQ0FBQyxDQUFDO1FBQzFGLGlCQUFpQixDQUFDLG9CQUFvQixDQUFDLGFBQWEsQ0FBQywrQkFBK0IsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUM1RixpQkFBaUIsQ0FBQyxvQkFBb0IsQ0FBQyxhQUFhLENBQUMsa0NBQWtDLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDaEcsaUJBQWlCLENBQUMsb0JBQW9CLENBQUMsYUFBYSxDQUFDLHlCQUF5QixFQUFFLEVBQUUsQ0FBQyxrQ0FBa0MsQ0FBQyxFQUFFLElBQUksRUFBRSxDQUFDLDBCQUEwQixDQUFDLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUNwSyxpQkFBaUIsQ0FBQyxvQkFBb0IsQ0FBQyxhQUFhLENBQUMsb0JBQW9CLEVBQUUsRUFBRSxDQUFDLDRCQUE0QixDQUFDLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUNySCxpQkFBaUIsQ0FBQyxvQkFBb0IsQ0FBQyxhQUFhLENBQUMsaUJBQWlCLEVBQUUsRUFBRSxDQUFDLGlDQUFpQyxDQUFDLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUN2SCxpQkFBaUIsQ0FBQyxvQkFBb0IsQ0FBQyxhQUFhLENBQUMsbUJBQW1CLEVBQUUsRUFBRSxnQkFBZ0IsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBQ3RHLGlCQUFpQixDQUFDLG9CQUFvQixDQUFDLGFBQWEsQ0FBQyxtQkFBbUIsRUFBRSxFQUFFLENBQUMsb0JBQW9CLENBQUMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBRTVHLFlBQVksQ0FBQyxJQUFJLENBQUMscUJBQXFCLEVBQUUsaUJBQWlCLENBQUMsQ0FBQztRQUM1RCxZQUFZLENBQUMsSUFBSSxDQUFDLHVCQUF1QixFQUFFLElBQUksMEJBQTBCLEVBQUUsQ0FBQyxDQUFDO1FBQzdFLFlBQVksQ0FBQyxJQUFJLENBQUMsaUJBQWlCLEVBQUUsb0JBQW9CLENBQUMsQ0FBQztRQUMzRCxZQUFZLENBQUMsSUFBSSxDQUFDLGVBQWUsRUFBRSxzQkFBc0IsQ0FBQyxDQUFDO1FBQzNELFlBQVksQ0FBQyxJQUFJLENBQUMsaUJBQWlCLEVBQUU7WUFDcEMsaUNBQWlDLEVBQUUsR0FBRyxFQUFFLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUM7WUFDOUQsZUFBZSxFQUFFLEdBQUcsRUFBRSxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUU7U0FDeEMsQ0FBQyxDQUFDO1FBRUgscUJBQXFCLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLG1DQUFtQyxFQUFFLENBQUMsQ0FBQztRQUNuRixZQUFZLENBQUMsSUFBSSxDQUFDLGdDQUFnQyxFQUFFLHFCQUFxQixDQUFDLENBQUM7UUFFM0UsV0FBVyxHQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLGNBQWMsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDO1FBQ3hFLFlBQVksQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBRTdDLE1BQU0sWUFBWSxHQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLGNBQWMsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDO1FBQ2hGLFlBQVksQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFFLFlBQVksQ0FBQyxDQUFDO1FBQy9DLFlBQVksQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLEVBQUU7WUFDbkMsb0NBQW9DLENBQUMsR0FBUTtnQkFDNUMsSUFBSSxHQUFHLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxxQkFBcUIsQ0FBQyxFQUFFLENBQUM7b0JBQzlDLE9BQU8sa0JBQWtCLENBQUM7Z0JBQzNCLENBQUM7Z0JBRUQsSUFBSSxHQUFHLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQywwQkFBMEIsQ0FBQyxFQUFFLENBQUM7b0JBQ25ELE9BQU8sd0JBQXdCLENBQUM7Z0JBQ2pDLENBQUM7Z0JBRUQsT0FBTyxXQUFXLENBQUM7WUFDcEIsQ0FBQztTQUNELENBQUMsQ0FBQztRQUNILFlBQVksQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFFO1lBQ2hDLFdBQVcsRUFBRSxDQUFDLEdBQVEsRUFBRSxPQUFnQyxFQUFFLEVBQUU7Z0JBQzNELElBQUksT0FBTyxFQUFFLFFBQVEsRUFBRSxDQUFDO29CQUN2QixPQUFPLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDdEIsQ0FBQztnQkFDRCxPQUFPLEdBQUcsQ0FBQyxJQUFJLENBQUM7WUFDakIsQ0FBQztTQUNELENBQUMsQ0FBQztRQUVILGtCQUFrQixHQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSwwQ0FBMEMsRUFBRSxDQUFDLENBQUM7UUFDdkYsV0FBVyxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsZ0JBQWdCLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxrQkFBa0IsQ0FBQyxDQUFDLENBQUM7UUFFaEYsTUFBTSxXQUFXLEdBQUc7WUFDbkIsUUFBUSxFQUFFLEdBQXVCLEVBQUU7Z0JBQ2xDLE9BQU8sT0FBTyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUM7WUFDaEQsQ0FBQztTQUNlLENBQUM7UUFDbEIsWUFBWSxDQUFDLElBQUksQ0FBQyxZQUFZLEVBQUUsV0FBVyxDQUFDLENBQUM7UUFFN0MsWUFBWSxDQUFDLElBQUksQ0FBQyxjQUFjLEVBQUU7WUFDakMsMkJBQTJCLEVBQUUsR0FBRyxFQUFFLENBQUMsSUFBSTtZQUN2QyxLQUFLLENBQUMsVUFBVSxDQUFDLEtBQWlCO2dCQUNqQyxNQUFNLE9BQU8sR0FBVSxFQUFFLENBQUM7Z0JBQzFCLEtBQUssTUFBTSxXQUFXLElBQUksS0FBSyxDQUFDLGFBQWEsRUFBRSxDQUFDO29CQUMvQyxNQUFNLG1CQUFtQixHQUFHLEtBQUssRUFBRSxRQUFhLEVBQUUsVUFBaUIsRUFBRSxFQUFrQixFQUFFO3dCQUN4RixJQUFJLENBQUM7NEJBQ0osTUFBTSxPQUFPLEdBQUcsTUFBTSxXQUFXLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDOzRCQUNwRCxJQUFJLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQztnQ0FDcEIsT0FBTyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUM7NEJBQ2hDLENBQUM7aUNBQU0sSUFBSSxPQUFPLENBQUMsV0FBVyxJQUFJLE9BQU8sQ0FBQyxRQUFRLEVBQUUsQ0FBQztnQ0FDcEQsS0FBSyxNQUFNLEtBQUssSUFBSSxPQUFPLENBQUMsUUFBUSxFQUFFLENBQUM7b0NBQ3RDLE1BQU0sbUJBQW1CLENBQUMsS0FBSyxDQUFDLFFBQVEsRUFBRSxPQUFPLENBQUMsQ0FBQztnQ0FDcEQsQ0FBQzs0QkFDRixDQUFDO3dCQUNGLENBQUM7d0JBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQzs0QkFDaEIsdUJBQXVCO3dCQUN4QixDQUFDO3dCQUNELE9BQU8sT0FBTyxDQUFDO29CQUNoQixDQUFDLENBQUM7b0JBRUYsTUFBTSxRQUFRLEdBQUcsTUFBTSxtQkFBbUIsQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLENBQUM7b0JBQy9ELEtBQUssTUFBTSxRQUFRLElBQUksUUFBUSxFQUFFLENBQUM7d0JBQ2pDLE1BQU0sU0FBUyxHQUFHLEtBQUssQ0FBQyxXQUFXLEtBQUssU0FBUyxJQUFJLEtBQUssQ0FBQyxLQUFLLENBQUMsV0FBVyxFQUFFLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQzt3QkFDN0YsSUFBSSxTQUFTLEVBQUUsQ0FBQzs0QkFDZixPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUUsUUFBUSxFQUFFLENBQUMsQ0FBQzt3QkFDNUIsQ0FBQztvQkFDRixDQUFDO2dCQUNGLENBQUM7Z0JBQ0QsT0FBTyxFQUFFLE9BQU8sRUFBRSxRQUFRLEVBQUUsRUFBRSxFQUFFLENBQUM7WUFDbEMsQ0FBQztTQUNELENBQUMsQ0FBQztRQUVILHFCQUFxQjtRQUNyQixZQUFZLEdBQUc7WUFDZCxhQUFhLEVBQUUsQ0FBQyxJQUFZLEVBQUUsRUFBRTtnQkFDL0IsSUFBSSxJQUFJLEtBQUssVUFBVSxFQUFFLENBQUM7b0JBQ3pCLE9BQU8sRUFBRSxFQUFFLEVBQUUsaUJBQWlCLEVBQUUsSUFBSSxFQUFFLFVBQVUsRUFBRSxDQUFDO2dCQUNwRCxDQUFDO2dCQUNELElBQUksSUFBSSxLQUFLLGFBQWEsRUFBRSxDQUFDO29CQUM1QixPQUFPLEVBQUUsRUFBRSxFQUFFLG9CQUFvQixFQUFFLElBQUksRUFBRSxhQUFhLEVBQUUsQ0FBQztnQkFDMUQsQ0FBQztnQkFDRCxPQUFPLFNBQVMsQ0FBQztZQUNsQixDQUFDO1lBQ0Qsb0JBQW9CLEVBQUUsQ0FBQyxJQUFzQixFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMsSUFBSTtTQUNsQixDQUFDO1FBQzNDLFlBQVksQ0FBQyxJQUFJLENBQUMsMEJBQTBCLEVBQUUsWUFBWSxDQUFDLENBQUM7UUFFNUQsWUFBWSxDQUFDLElBQUksQ0FBQyxtQkFBbUIsRUFBRTtZQUN0QyxjQUFjLEVBQUUsR0FBRyxFQUFFLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUM7U0FDM0MsQ0FBQyxDQUFDO1FBRUgsWUFBWSxDQUFDLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxJQUFJLHFCQUFxQixFQUFFLENBQUMsQ0FBQztRQUVuRSxZQUFZLENBQUMsSUFBSSxDQUFDLG1CQUFtQixFQUFFO1lBQ3RDLE9BQU8sRUFBRSxlQUFlLENBQUMsYUFBYSxFQUFFLEVBQUUsQ0FBQztZQUMzQyxlQUFlLEVBQUUsRUFBRSxXQUFXLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLG9CQUFvQixFQUFFLFVBQVUsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLEVBQUUsTUFBTSxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsRUFBRTtTQUN4RyxDQUFDLENBQUM7UUFFSCxPQUFPLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsY0FBYyxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUM7UUFDdkUsWUFBWSxDQUFDLElBQUksQ0FBQyxlQUFlLEVBQUUsT0FBTyxDQUFDLENBQUM7SUFDN0MsQ0FBQyxDQUFDLENBQUM7SUFFSCxRQUFRLENBQUMsR0FBRyxFQUFFO1FBQ2IsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ2hCLGtCQUFrQixDQUFDLHFCQUFxQixFQUFFLENBQUM7SUFDNUMsQ0FBQyxDQUFDLENBQUM7SUFFSCxLQUFLLENBQUMsU0FBUyxFQUFFLEdBQUcsRUFBRTtRQUNyQixJQUFJLENBQUMsMENBQTBDLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDM0QsTUFBTSxjQUFjLEdBQUcsa0JBQWtCLENBQUM7WUFDMUMsTUFBTSxVQUFVLEdBQUcsSUFBSSxjQUFjLEVBQUUsQ0FBQztZQUN4QyxNQUFNLGFBQWEsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBRTNDLHVCQUF1QixDQUFDLFlBQVksQ0FBQyxhQUFhLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQztZQUVuRSxNQUFNLFNBQVMsQ0FBQyxXQUFXLEVBQUU7Z0JBQzVCLHVCQUF1QjtnQkFDdkI7b0JBQ0MsSUFBSSxFQUFFLEdBQUcsVUFBVSxrREFBa0Q7b0JBQ3JFLFFBQVEsRUFBRTt3QkFDVCxLQUFLO3dCQUNMLDBDQUEwQzt3QkFDMUMsb0JBQW9CO3dCQUNwQixLQUFLO3dCQUNMLDZCQUE2QjtxQkFDN0I7aUJBQ0Q7Z0JBQ0QsdUJBQXVCO2dCQUN2QjtvQkFDQyxJQUFJLEVBQUUsR0FBRyxVQUFVLGtDQUFrQztvQkFDckQsUUFBUSxFQUFFO3dCQUNULHlCQUF5QjtxQkFDekI7aUJBQ0Q7Z0JBQ0QsWUFBWTtnQkFDWjtvQkFDQyxJQUFJLEVBQUUsR0FBRyxVQUFVLFlBQVk7b0JBQy9CLFFBQVEsRUFBRTt3QkFDVCxrQkFBa0I7cUJBQ2xCO2lCQUNEO2dCQUNELGdCQUFnQjtnQkFDaEI7b0JBQ0MsSUFBSSxFQUFFLEdBQUcsVUFBVSxjQUFjO29CQUNqQyxRQUFRLEVBQUU7d0JBQ1Qsc0JBQXNCO3FCQUN0QjtpQkFDRDthQUNELENBQUMsQ0FBQztZQUNILENBQUM7Z0JBQ0EsTUFBTSxlQUFlLEdBQUcsWUFBWSxDQUFDLGNBQWMsQ0FBQyw0QkFBNEIsRUFBRSxZQUFZLENBQUMsS0FBSyxFQUFFLFNBQVMsRUFBRSxTQUFTLENBQUMsQ0FBQztnQkFDNUgsTUFBTSxTQUFTLEdBQUcsSUFBSSxzQkFBc0IsRUFBRSxDQUFDO2dCQUMvQyxTQUFTLENBQUMsR0FBRyxDQUFDLG1CQUFtQixDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsYUFBYSxFQUFFLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFFL0UsTUFBTSxlQUFlLENBQUMsT0FBTyxDQUFDLFNBQVMsRUFBRSxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFFakUsTUFBTSxnQkFBZ0IsR0FBRyxTQUFTLENBQUMsT0FBTyxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDdkYsTUFBTSxLQUFLLEdBQUcsZ0JBQWdCLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQztnQkFFakcsTUFBTSxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLEdBQUcsVUFBVSxrREFBa0QsQ0FBQyxFQUFFLHFDQUFxQyxDQUFDLENBQUM7Z0JBQ2xJLE1BQU0sQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxHQUFHLFVBQVUsa0NBQWtDLENBQUMsRUFBRSxxQ0FBcUMsQ0FBQyxDQUFDO2dCQUNsSCxNQUFNLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsR0FBRyxVQUFVLFlBQVksQ0FBQyxFQUFFLDBCQUEwQixDQUFDLENBQUM7WUFDbEYsQ0FBQztZQUNELENBQUM7Z0JBQ0EsaUJBQWlCLENBQUMsb0JBQW9CLENBQUMsYUFBYSxDQUFDLDZCQUE2QixFQUFFLEtBQUssQ0FBQyxDQUFDO2dCQUMzRixpQkFBaUIsQ0FBQyxvQkFBb0IsQ0FBQyxhQUFhLENBQUMsNkJBQTZCLEVBQUUsSUFBSSxDQUFDLENBQUM7Z0JBQzFGLGlCQUFpQixDQUFDLG9CQUFvQixDQUFDLGFBQWEsQ0FBQyxZQUFZLEVBQUUsSUFBSSxDQUFDLENBQUM7Z0JBQ3pFLE1BQU0sZUFBZSxHQUFHLFlBQVksQ0FBQyxjQUFjLENBQUMsNEJBQTRCLEVBQUUsWUFBWSxDQUFDLEtBQUssRUFBRSxTQUFTLEVBQUUsU0FBUyxDQUFDLENBQUM7Z0JBQzVILE1BQU0sU0FBUyxHQUFHLElBQUksc0JBQXNCLEVBQUUsQ0FBQztnQkFDL0MsU0FBUyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLGFBQWEsRUFBRSxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBRS9FLE1BQU0sZUFBZSxDQUFDLE9BQU8sQ0FBQyxTQUFTLEVBQUUsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBRWpFLE1BQU0sZ0JBQWdCLEdBQUcsU0FBUyxDQUFDLE9BQU8sRUFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3ZGLE1BQU0sS0FBSyxHQUFHLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUM7Z0JBRWpHLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLEdBQUcsVUFBVSxrREFBa0QsQ0FBQyxFQUFFLHlDQUF5QyxDQUFDLENBQUM7Z0JBQ3ZJLE1BQU0sQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxHQUFHLFVBQVUsa0NBQWtDLENBQUMsRUFBRSxxQ0FBcUMsQ0FBQyxDQUFDO2dCQUNsSCxNQUFNLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsR0FBRyxVQUFVLFlBQVksQ0FBQyxFQUFFLDBCQUEwQixDQUFDLENBQUM7WUFDbEYsQ0FBQztZQUNELENBQUM7Z0JBQ0EsaUJBQWlCLENBQUMsb0JBQW9CLENBQUMsYUFBYSxDQUFDLDZCQUE2QixFQUFFLElBQUksQ0FBQyxDQUFDO2dCQUMxRixpQkFBaUIsQ0FBQyxvQkFBb0IsQ0FBQyxhQUFhLENBQUMsNkJBQTZCLEVBQUUsS0FBSyxDQUFDLENBQUM7Z0JBQzNGLGlCQUFpQixDQUFDLG9CQUFvQixDQUFDLGFBQWEsQ0FBQyxZQUFZLEVBQUUsSUFBSSxDQUFDLENBQUM7Z0JBQ3pFLE1BQU0sZUFBZSxHQUFHLFlBQVksQ0FBQyxjQUFjLENBQUMsNEJBQTRCLEVBQUUsWUFBWSxDQUFDLEtBQUssRUFBRSxTQUFTLEVBQUUsU0FBUyxDQUFDLENBQUM7Z0JBQzVILE1BQU0sU0FBUyxHQUFHLElBQUksc0JBQXNCLEVBQUUsQ0FBQztnQkFDL0MsU0FBUyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLGFBQWEsRUFBRSxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBRS9FLE1BQU0sZUFBZSxDQUFDLE9BQU8sQ0FBQyxTQUFTLEVBQUUsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBRWpFLE1BQU0sZ0JBQWdCLEdBQUcsU0FBUyxDQUFDLE9BQU8sRUFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3ZGLE1BQU0sS0FBSyxHQUFHLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUM7Z0JBRWpHLE1BQU0sQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxHQUFHLFVBQVUsa0RBQWtELENBQUMsRUFBRSxxQ0FBcUMsQ0FBQyxDQUFDO2dCQUNsSSxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxHQUFHLFVBQVUsa0NBQWtDLENBQUMsRUFBRSx5Q0FBeUMsQ0FBQyxDQUFDO2dCQUN2SCxNQUFNLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsR0FBRyxVQUFVLFlBQVksQ0FBQyxFQUFFLDBCQUEwQixDQUFDLENBQUM7WUFDbEYsQ0FBQztZQUNELENBQUM7Z0JBQ0EsaUJBQWlCLENBQUMsb0JBQW9CLENBQUMsYUFBYSxDQUFDLDZCQUE2QixFQUFFLElBQUksQ0FBQyxDQUFDO2dCQUMxRixpQkFBaUIsQ0FBQyxvQkFBb0IsQ0FBQyxhQUFhLENBQUMsNkJBQTZCLEVBQUUsSUFBSSxDQUFDLENBQUM7Z0JBQzFGLGlCQUFpQixDQUFDLG9CQUFvQixDQUFDLGFBQWEsQ0FBQyxZQUFZLEVBQUUsS0FBSyxDQUFDLENBQUM7Z0JBQzFFLE1BQU0sZUFBZSxHQUFHLFlBQVksQ0FBQyxjQUFjLENBQUMsNEJBQTRCLEVBQUUsWUFBWSxDQUFDLEtBQUssRUFBRSxTQUFTLEVBQUUsU0FBUyxDQUFDLENBQUM7Z0JBQzVILE1BQU0sU0FBUyxHQUFHLElBQUksc0JBQXNCLEVBQUUsQ0FBQztnQkFDL0MsU0FBUyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLGFBQWEsRUFBRSxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBRS9FLE1BQU0sZUFBZSxDQUFDLE9BQU8sQ0FBQyxTQUFTLEVBQUUsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBRWpFLE1BQU0sZ0JBQWdCLEdBQUcsU0FBUyxDQUFDLE9BQU8sRUFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3ZGLE1BQU0sS0FBSyxHQUFHLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUM7Z0JBRWpHLE1BQU0sQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxHQUFHLFVBQVUsa0RBQWtELENBQUMsRUFBRSxxQ0FBcUMsQ0FBQyxDQUFDO2dCQUNsSSxNQUFNLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsR0FBRyxVQUFVLGtDQUFrQyxDQUFDLEVBQUUscUNBQXFDLENBQUMsQ0FBQztnQkFDbEgsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsR0FBRyxVQUFVLFlBQVksQ0FBQyxFQUFFLDhCQUE4QixDQUFDLENBQUM7WUFDdkYsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLCtDQUErQyxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQ2hFLGlCQUFpQixDQUFDLG9CQUFvQixDQUFDLGFBQWEsQ0FBQyw2QkFBNkIsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUMzRixpQkFBaUIsQ0FBQyxvQkFBb0IsQ0FBQyxhQUFhLENBQUMsNkJBQTZCLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDM0YsaUJBQWlCLENBQUMsb0JBQW9CLENBQUMsYUFBYSxDQUFDLFlBQVksRUFBRSxLQUFLLENBQUMsQ0FBQztZQUUxRSxNQUFNLGNBQWMsR0FBRyx3QkFBd0IsQ0FBQztZQUNoRCxNQUFNLFVBQVUsR0FBRyxJQUFJLGNBQWMsRUFBRSxDQUFDO1lBQ3hDLE1BQU0sYUFBYSxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7WUFFM0MsdUJBQXVCLENBQUMsWUFBWSxDQUFDLGFBQWEsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDO1lBRW5FLE1BQU0sU0FBUyxDQUFDLFdBQVcsRUFBRTtnQkFDNUI7b0JBQ0MsSUFBSSxFQUFFLEdBQUcsVUFBVSxrREFBa0Q7b0JBQ3JFLFFBQVEsRUFBRTt3QkFDVCxLQUFLO3dCQUNMLG9CQUFvQjt3QkFDcEIsS0FBSzt3QkFDTCw2QkFBNkI7cUJBQzdCO2lCQUNEO2dCQUNEO29CQUNDLElBQUksRUFBRSxHQUFHLFVBQVUsa0NBQWtDO29CQUNyRCxRQUFRLEVBQUUsQ0FBQyxZQUFZLENBQUM7aUJBQ3hCO2dCQUNEO29CQUNDLElBQUksRUFBRSxHQUFHLFVBQVUsWUFBWTtvQkFDL0IsUUFBUSxFQUFFLENBQUMsWUFBWSxDQUFDO2lCQUN4QjtnQkFDRDtvQkFDQyxJQUFJLEVBQUUsR0FBRyxVQUFVLGNBQWM7b0JBQ2pDLFFBQVEsRUFBRSxDQUFDLHNCQUFzQixDQUFDO2lCQUNsQzthQUNELENBQUMsQ0FBQztZQUVILE1BQU0sZUFBZSxHQUFHLFlBQVksQ0FBQyxjQUFjLENBQUMsNEJBQTRCLEVBQUUsWUFBWSxDQUFDLEtBQUssRUFBRSxTQUFTLEVBQUUsU0FBUyxDQUFDLENBQUM7WUFDNUgsTUFBTSxTQUFTLEdBQUcsSUFBSSxzQkFBc0IsRUFBRSxDQUFDO1lBQy9DLFNBQVMsQ0FBQyxHQUFHLENBQUMsbUJBQW1CLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxhQUFhLEVBQUUsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRS9FLE1BQU0sZUFBZSxDQUFDLE9BQU8sQ0FBQyxTQUFTLEVBQUUsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUM7WUFFakUsTUFBTSxnQkFBZ0IsR0FBRyxTQUFTLENBQUMsT0FBTyxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN2RixNQUFNLENBQUMsV0FBVyxDQUFDLGdCQUFnQixDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsZ0VBQWdFLENBQUMsQ0FBQztRQUNsSCxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQywwREFBMEQsRUFBRSxLQUFLLElBQUksRUFBRTtZQUMzRSxpQkFBaUIsQ0FBQyxvQkFBb0IsQ0FBQyxhQUFhLENBQUMsNkJBQTZCLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFFM0YsTUFBTSxjQUFjLEdBQUcsZ0JBQWdCLENBQUM7WUFDeEMsTUFBTSxVQUFVLEdBQUcsSUFBSSxjQUFjLEVBQUUsQ0FBQztZQUN4QyxNQUFNLGFBQWEsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBRTNDLHVCQUF1QixDQUFDLFlBQVksQ0FBQyxhQUFhLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQztZQUVuRSxNQUFNLFNBQVMsQ0FBQyxXQUFXLEVBQUU7Z0JBQzVCO29CQUNDLElBQUksRUFBRSxHQUFHLFVBQVUsa0RBQWtEO29CQUNyRSxRQUFRLEVBQUU7d0JBQ1QsS0FBSzt3QkFDTCxvQkFBb0I7d0JBQ3BCLEtBQUs7d0JBQ0wsc0JBQXNCO3FCQUN0QjtpQkFDRDtnQkFDRDtvQkFDQyxJQUFJLEVBQUUsR0FBRyxVQUFVLGNBQWM7b0JBQ2pDLFFBQVEsRUFBRSxDQUFDLHNCQUFzQixDQUFDO2lCQUNsQzthQUNELENBQUMsQ0FBQztZQUVILE1BQU0sZUFBZSxHQUFHLFlBQVksQ0FBQyxjQUFjLENBQUMsNEJBQTRCLEVBQUUsWUFBWSxDQUFDLElBQUksRUFBRSxTQUFTLEVBQUUsU0FBUyxDQUFDLENBQUM7WUFDM0gsTUFBTSxTQUFTLEdBQUcsSUFBSSxzQkFBc0IsRUFBRSxDQUFDO1lBQy9DLFNBQVMsQ0FBQyxHQUFHLENBQUMsbUJBQW1CLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxhQUFhLEVBQUUsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRS9FLE1BQU0sZUFBZSxDQUFDLE9BQU8sQ0FBQyxTQUFTLEVBQUUsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUM7WUFFakUsTUFBTSxnQkFBZ0IsR0FBRyxTQUFTLENBQUMsT0FBTyxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN2RixNQUFNLENBQUMsRUFBRSxDQUFDLGdCQUFnQixDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsd0VBQXdFLENBQUMsQ0FBQztRQUNsSCxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsS0FBSyxDQUFDLHlCQUF5QixFQUFFLEdBQUcsRUFBRTtRQUNyQyxJQUFJLENBQUMsc0NBQXNDLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDdkQsTUFBTSxjQUFjLEdBQUcsZUFBZSxDQUFDO1lBQ3ZDLE1BQU0sVUFBVSxHQUFHLElBQUksY0FBYyxFQUFFLENBQUM7WUFDeEMsTUFBTSxhQUFhLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUUzQyx1QkFBdUIsQ0FBQyxZQUFZLENBQUMsYUFBYSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUM7WUFFbkUsTUFBTSxTQUFTLENBQUMsV0FBVyxFQUFFO2dCQUM1QjtvQkFDQyxJQUFJLEVBQUUsR0FBRyxVQUFVLGlEQUFpRDtvQkFDcEUsUUFBUSxFQUFFO3dCQUNULEtBQUs7d0JBQ0wsZUFBZTt3QkFDZixLQUFLO3dCQUNMLG9CQUFvQjtxQkFDcEI7aUJBQ0Q7Z0JBQ0Q7b0JBQ0MsSUFBSSxFQUFFLEdBQUcsVUFBVSxjQUFjO29CQUNqQyxRQUFRLEVBQUUsQ0FBQyxNQUFNLENBQUM7aUJBQ2xCO2FBQ0QsQ0FBQyxDQUFDO1lBRUgsTUFBTSxlQUFlLEdBQUcsWUFBWSxDQUFDLGNBQWMsQ0FBQyw0QkFBNEIsRUFBRSxZQUFZLENBQUMsS0FBSyxFQUFFLFNBQVMsRUFBRSxTQUFTLENBQUMsQ0FBQztZQUM1SCxNQUFNLFNBQVMsR0FBRyxJQUFJLHNCQUFzQixFQUFFLENBQUM7WUFDL0MsU0FBUyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLGFBQWEsRUFBRSxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFFL0UsTUFBTSxlQUFlLENBQUMsT0FBTyxDQUFDLFNBQVMsRUFBRSxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUVqRSxNQUFNLGdCQUFnQixHQUFHLFNBQVMsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3ZGLE1BQU0sQ0FBQyxXQUFXLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSx5QkFBeUIsQ0FBQyxDQUFDO1FBQzNFLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHFDQUFxQyxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQ3RELE1BQU0sY0FBYyxHQUFHLGNBQWMsQ0FBQztZQUN0QyxNQUFNLFVBQVUsR0FBRyxJQUFJLGNBQWMsRUFBRSxDQUFDO1lBQ3hDLE1BQU0sYUFBYSxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7WUFFM0MsdUJBQXVCLENBQUMsWUFBWSxDQUFDLGFBQWEsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDO1lBRW5FLE1BQU0sU0FBUyxDQUFDLFdBQVcsRUFBRTtnQkFDNUI7b0JBQ0MsSUFBSSxFQUFFLEdBQUcsVUFBVSxrREFBa0Q7b0JBQ3JFLFFBQVEsRUFBRTt3QkFDVCxLQUFLO3dCQUNMLG9CQUFvQjt3QkFDcEIsS0FBSzt3QkFDTCxpQkFBaUI7cUJBQ2pCO2lCQUNEO2dCQUNEO29CQUNDLElBQUksRUFBRSxHQUFHLFVBQVUsa0RBQWtEO29CQUNyRSxRQUFRLEVBQUU7d0JBQ1QsS0FBSzt3QkFDTCxvQkFBb0I7d0JBQ3BCLEtBQUs7d0JBQ0wsaUJBQWlCO3FCQUNqQjtpQkFDRDtnQkFDRDtvQkFDQyxJQUFJLEVBQUUsR0FBRyxVQUFVLGNBQWM7b0JBQ2pDLFFBQVEsRUFBRSxDQUFDLE1BQU0sQ0FBQztpQkFDbEI7YUFDRCxDQUFDLENBQUM7WUFFSCxNQUFNLGVBQWUsR0FBRyxZQUFZLENBQUMsY0FBYyxDQUFDLDRCQUE0QixFQUFFLFlBQVksQ0FBQyxLQUFLLEVBQUUsU0FBUyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1lBQzVILE1BQU0sU0FBUyxHQUFHLElBQUksc0JBQXNCLEVBQUUsQ0FBQztZQUMvQyxTQUFTLENBQUMsR0FBRyxDQUFDLG1CQUFtQixDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsYUFBYSxFQUFFLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUUvRSxNQUFNLGVBQWUsQ0FBQyxPQUFPLENBQUMsU0FBUyxFQUFFLGlCQUFpQixDQUFDLElBQUksQ0FBQyxDQUFDO1lBRWpFLE1BQU0sS0FBSyxHQUFHLFNBQVMsQ0FBQyxPQUFPLEVBQUU7aUJBQy9CLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDO2lCQUN6QyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQ3BFLE1BQU0sQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxHQUFHLFVBQVUsa0RBQWtELENBQUMsRUFBRSxzQkFBc0IsQ0FBQyxDQUFDO1lBQ25ILE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLEdBQUcsVUFBVSxrREFBa0QsQ0FBQyxFQUFFLDZCQUE2QixDQUFDLENBQUM7UUFDNUgsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsb0RBQW9ELEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDckUsTUFBTSxjQUFjLEdBQUcsb0JBQW9CLENBQUM7WUFDNUMsTUFBTSxVQUFVLEdBQUcsSUFBSSxjQUFjLEVBQUUsQ0FBQztZQUN4QyxNQUFNLGFBQWEsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBRTNDLHVCQUF1QixDQUFDLFlBQVksQ0FBQyxhQUFhLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQztZQUVuRSxNQUFNLFNBQVMsQ0FBQyxXQUFXLEVBQUU7Z0JBQzVCO29CQUNDLElBQUksRUFBRSxHQUFHLFVBQVUsMkNBQTJDO29CQUM5RCxRQUFRLEVBQUU7d0JBQ1QsS0FBSzt3QkFDTCx1Q0FBdUM7d0JBQ3ZDLEtBQUs7d0JBQ0wsa0JBQWtCO3FCQUNsQjtpQkFDRDtnQkFDRDtvQkFDQyxJQUFJLEVBQUUsR0FBRyxVQUFVLG9CQUFvQjtvQkFDdkMsUUFBUSxFQUFFLENBQUMsTUFBTSxDQUFDO2lCQUNsQjthQUNELENBQUMsQ0FBQztZQUVILE1BQU0sZUFBZSxHQUFHLFlBQVksQ0FBQyxjQUFjLENBQUMsNEJBQTRCLEVBQUUsWUFBWSxDQUFDLEtBQUssRUFBRSxTQUFTLEVBQUUsU0FBUyxDQUFDLENBQUM7WUFDNUgsTUFBTSxTQUFTLEdBQUcsSUFBSSxzQkFBc0IsRUFBRSxDQUFDO1lBQy9DLFNBQVMsQ0FBQyxHQUFHLENBQUMsbUJBQW1CLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxhQUFhLEVBQUUsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFFckYsTUFBTSxlQUFlLENBQUMsT0FBTyxDQUFDLFNBQVMsRUFBRSxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUVqRSxNQUFNLGdCQUFnQixHQUFHLFNBQVMsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3ZGLE1BQU0sQ0FBQyxXQUFXLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxrREFBa0QsQ0FBQyxDQUFDO1FBQ3BHLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHVDQUF1QyxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQ3hELE1BQU0sY0FBYyxHQUFHLGdCQUFnQixDQUFDO1lBQUMsTUFBTSxVQUFVLEdBQUcsSUFBSSxjQUFjLEVBQUUsQ0FBQztZQUNqRixNQUFNLGFBQWEsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBRTNDLHVCQUF1QixDQUFDLFlBQVksQ0FBQyxhQUFhLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQztZQUVuRSxNQUFNLFNBQVMsQ0FBQyxXQUFXLEVBQUU7Z0JBQzVCO29CQUNDLElBQUksRUFBRSxHQUFHLFVBQVUsa0RBQWtEO29CQUNyRSxRQUFRLEVBQUU7d0JBQ1QsS0FBSzt3QkFDTCxvQkFBb0I7d0JBQ3BCLEtBQUs7d0JBQ0wsaUJBQWlCO3FCQUNqQjtpQkFDRDtnQkFDRDtvQkFDQyxJQUFJLEVBQUUsR0FBRyxVQUFVLGVBQWU7b0JBQ2xDLFFBQVEsRUFBRSxDQUFDLE1BQU0sQ0FBQztpQkFDbEI7Z0JBQ0Q7b0JBQ0MsSUFBSSxFQUFFLEdBQUcsVUFBVSxlQUFlO29CQUNsQyxRQUFRLEVBQUUsQ0FBQyxNQUFNLENBQUM7aUJBQ2xCO2FBQ0QsQ0FBQyxDQUFDO1lBRUgsTUFBTSxlQUFlLEdBQUcsWUFBWSxDQUFDLGNBQWMsQ0FBQyw0QkFBNEIsRUFBRSxZQUFZLENBQUMsS0FBSyxFQUFFLFNBQVMsRUFBRSxTQUFTLENBQUMsQ0FBQztZQUM1SCxNQUFNLFNBQVMsR0FBRyxJQUFJLHNCQUFzQixFQUFFLENBQUM7WUFDL0MsU0FBUyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLGFBQWEsRUFBRSxjQUFjLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDaEYsU0FBUyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLGFBQWEsRUFBRSxjQUFjLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFFaEYsTUFBTSxlQUFlLENBQUMsT0FBTyxDQUFDLFNBQVMsRUFBRSxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUVqRSxNQUFNLGdCQUFnQixHQUFHLFNBQVMsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3ZGLE1BQU0sQ0FBQyxXQUFXLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxvRUFBb0UsQ0FBQyxDQUFDO1FBQ3RILENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHNDQUFzQyxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQ3ZELE1BQU0sY0FBYyxHQUFHLHVCQUF1QixDQUFDO1lBQy9DLE1BQU0sVUFBVSxHQUFHLElBQUksY0FBYyxFQUFFLENBQUM7WUFDeEMsTUFBTSxhQUFhLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUUzQyx1QkFBdUIsQ0FBQyxZQUFZLENBQUMsYUFBYSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUM7WUFFbkUsTUFBTSxTQUFTLENBQUMsV0FBVyxFQUFFO2dCQUM1QjtvQkFDQyxJQUFJLEVBQUUsR0FBRyxVQUFVLGlEQUFpRDtvQkFDcEUsUUFBUSxFQUFFO3dCQUNULEtBQUs7d0JBQ0wsd0JBQXdCO3dCQUN4QixLQUFLO3dCQUNMLGtCQUFrQjtxQkFDbEI7aUJBQ0Q7Z0JBQ0Q7b0JBQ0MsSUFBSSxFQUFFLEdBQUcsVUFBVSxjQUFjO29CQUNqQyxRQUFRLEVBQUUsQ0FBQyxNQUFNLENBQUM7aUJBQ2xCO2FBQ0QsQ0FBQyxDQUFDO1lBRUgsTUFBTSxlQUFlLEdBQUcsWUFBWSxDQUFDLGNBQWMsQ0FBQyw0QkFBNEIsRUFBRSxZQUFZLENBQUMsS0FBSyxFQUFFLFNBQVMsRUFBRSxTQUFTLENBQUMsQ0FBQztZQUM1SCxNQUFNLFNBQVMsR0FBRyxJQUFJLHNCQUFzQixFQUFFLENBQUM7WUFDL0MsU0FBUyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLGFBQWEsRUFBRSxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFFL0UsTUFBTSxlQUFlLENBQUMsT0FBTyxDQUFDLFNBQVMsRUFBRSxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUVqRSxNQUFNLGdCQUFnQixHQUFHLFNBQVMsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3ZGLE1BQU0sQ0FBQyxXQUFXLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxvQ0FBb0MsQ0FBQyxDQUFDO1FBQ3RGLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxLQUFLLENBQUMsY0FBYyxFQUFFLEdBQUcsRUFBRTtRQUMxQixJQUFJLENBQUMsbURBQW1ELEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDcEUsTUFBTSxjQUFjLEdBQUcsbUJBQW1CLENBQUM7WUFDM0MsTUFBTSxVQUFVLEdBQUcsSUFBSSxjQUFjLEVBQUUsQ0FBQztZQUN4QyxNQUFNLGFBQWEsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBRTNDLHVCQUF1QixDQUFDLFlBQVksQ0FBQyxhQUFhLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQztZQUVuRSxNQUFNLFNBQVMsQ0FBQyxXQUFXLEVBQUU7Z0JBQzVCO29CQUNDLElBQUksRUFBRSxHQUFHLFVBQVUsOEJBQThCO29CQUNqRCxRQUFRLEVBQUU7d0JBQ1QsdUJBQXVCO3FCQUN2QjtpQkFDRDtnQkFDRDtvQkFDQyxJQUFJLEVBQUUsR0FBRyxVQUFVLGNBQWM7b0JBQ2pDLFFBQVEsRUFBRSxDQUFDLE1BQU0sQ0FBQztpQkFDbEI7YUFDRCxDQUFDLENBQUM7WUFFSCxNQUFNLGVBQWUsR0FBRyxZQUFZLENBQUMsY0FBYyxDQUFDLDRCQUE0QixFQUFFLFlBQVksQ0FBQyxLQUFLLEVBQUUsU0FBUyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1lBQzVILE1BQU0sU0FBUyxHQUFHLElBQUksc0JBQXNCLEVBQUUsQ0FBQztZQUMvQyxTQUFTLENBQUMsR0FBRyxDQUFDLG1CQUFtQixDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsYUFBYSxFQUFFLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUUvRSxNQUFNLGVBQWUsQ0FBQyxPQUFPLENBQUMsU0FBUyxFQUFFLGlCQUFpQixDQUFDLElBQUksQ0FBQyxDQUFDO1lBRWpFLE1BQU0sS0FBSyxHQUFHLFNBQVMsQ0FBQyxPQUFPLEVBQUU7aUJBQy9CLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDO2lCQUN6QyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBRXBFLCtFQUErRTtZQUMvRSxNQUFNLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsR0FBRyxVQUFVLDhCQUE4QixDQUFDLEVBQUUsMERBQTBELENBQUMsQ0FBQztRQUNwSSxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxnREFBZ0QsRUFBRSxLQUFLLElBQUksRUFBRTtZQUNqRSxNQUFNLGNBQWMsR0FBRyx5QkFBeUIsQ0FBQztZQUNqRCxNQUFNLFVBQVUsR0FBRyxJQUFJLGNBQWMsRUFBRSxDQUFDO1lBQ3hDLE1BQU0sYUFBYSxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7WUFFM0MsdUJBQXVCLENBQUMsWUFBWSxDQUFDLGFBQWEsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDO1lBRW5FLE1BQU0sU0FBUyxDQUFDLFdBQVcsRUFBRTtnQkFDNUI7b0JBQ0MsSUFBSSxFQUFFLEdBQUcsVUFBVSw2QkFBNkI7b0JBQ2hELFFBQVEsRUFBRTt3QkFDVCxLQUFLO3dCQUNMLFFBQVE7d0JBQ1IsdUJBQXVCO3dCQUN2QixLQUFLO3dCQUNMLHVCQUF1QjtxQkFDdkI7aUJBQ0Q7Z0JBQ0Q7b0JBQ0MsSUFBSSxFQUFFLEdBQUcsVUFBVSxrQ0FBa0M7b0JBQ3JELFFBQVEsRUFBRTt3QkFDVCxLQUFLO3dCQUNMLFFBQVE7d0JBQ1IsNkJBQTZCO3dCQUM3QixLQUFLO3dCQUNMLGdCQUFnQjtxQkFDaEI7aUJBQ0Q7Z0JBQ0Q7b0JBQ0MsSUFBSSxFQUFFLEdBQUcsVUFBVSxxQkFBcUI7b0JBQ3hDLFFBQVEsRUFBRSxDQUFDLE1BQU0sQ0FBQztpQkFDbEI7YUFDRCxDQUFDLENBQUM7WUFFSCxNQUFNLGVBQWUsR0FBRyxZQUFZLENBQUMsY0FBYyxDQUFDLDRCQUE0QixFQUFFLFlBQVksQ0FBQyxLQUFLLEVBQUUsU0FBUyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1lBQzVILE1BQU0sU0FBUyxHQUFHLElBQUksc0JBQXNCLEVBQUUsQ0FBQztZQUMvQyxTQUFTLENBQUMsR0FBRyxDQUFDLG1CQUFtQixDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsYUFBYSxFQUFFLG9CQUFvQixDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRXRGLE1BQU0sZUFBZSxDQUFDLE9BQU8sQ0FBQyxTQUFTLEVBQUUsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUM7WUFFakUsTUFBTSxLQUFLLEdBQUcsU0FBUyxDQUFDLE9BQU8sRUFBRTtpQkFDL0IsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUM7aUJBQ3pDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUM7WUFFcEUsTUFBTSxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLEdBQUcsVUFBVSw2QkFBNkIsQ0FBQyxFQUFFLGtDQUFrQyxDQUFDLENBQUM7WUFDMUcsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsR0FBRyxVQUFVLGtDQUFrQyxDQUFDLEVBQUUsaUNBQWlDLENBQUMsQ0FBQztRQUNoSCxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxpREFBaUQsRUFBRSxLQUFLLElBQUksRUFBRTtZQUNsRSxNQUFNLGNBQWMsR0FBRywwQkFBMEIsQ0FBQztZQUNsRCxNQUFNLFVBQVUsR0FBRyxJQUFJLGNBQWMsRUFBRSxDQUFDO1lBQ3hDLE1BQU0sYUFBYSxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7WUFFM0MsdUJBQXVCLENBQUMsWUFBWSxDQUFDLGFBQWEsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDO1lBRW5FLE1BQU0sU0FBUyxDQUFDLFdBQVcsRUFBRTtnQkFDNUI7b0JBQ0MsSUFBSSxFQUFFLEdBQUcsVUFBVSxrQ0FBa0M7b0JBQ3JELFFBQVEsRUFBRTt3QkFDVCxLQUFLO3dCQUNMLFFBQVE7d0JBQ1IsZ0JBQWdCO3dCQUNoQixLQUFLO3dCQUNMLGtCQUFrQjtxQkFDbEI7aUJBQ0Q7Z0JBQ0Q7b0JBQ0MsSUFBSSxFQUFFLEdBQUcsVUFBVSwrQkFBK0I7b0JBQ2xELFFBQVEsRUFBRTt3QkFDVCxLQUFLO3dCQUNMLFFBQVE7d0JBQ1IsdUJBQXVCO3dCQUN2QixLQUFLO3dCQUNMLGdCQUFnQjtxQkFDaEI7aUJBQ0Q7Z0JBQ0Q7b0JBQ0MsSUFBSSxFQUFFLEdBQUcsVUFBVSxvQkFBb0I7b0JBQ3ZDLFFBQVEsRUFBRSxDQUFDLE1BQU0sQ0FBQztpQkFDbEI7YUFDRCxDQUFDLENBQUM7WUFFSCxNQUFNLGVBQWUsR0FBRyxZQUFZLENBQUMsY0FBYyxDQUFDLDRCQUE0QixFQUFFLFlBQVksQ0FBQyxLQUFLLEVBQUUsU0FBUyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1lBQzVILE1BQU0sU0FBUyxHQUFHLElBQUksc0JBQXNCLEVBQUUsQ0FBQztZQUMvQyxTQUFTLENBQUMsR0FBRyxDQUFDLG1CQUFtQixDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsYUFBYSxFQUFFLG1CQUFtQixDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRXJGLE1BQU0sZUFBZSxDQUFDLE9BQU8sQ0FBQyxTQUFTLEVBQUUsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUM7WUFFakUsTUFBTSxLQUFLLEdBQUcsU0FBUyxDQUFDLE9BQU8sRUFBRTtpQkFDL0IsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUM7aUJBQ3pDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUM7WUFFcEUsTUFBTSxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLEdBQUcsVUFBVSxrQ0FBa0MsQ0FBQyxFQUFFLDRDQUE0QyxDQUFDLENBQUM7WUFDekgsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsR0FBRyxVQUFVLCtCQUErQixDQUFDLEVBQUUseUNBQXlDLENBQUMsQ0FBQztRQUNySCxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyx3Q0FBd0MsRUFBRSxLQUFLLElBQUksRUFBRTtZQUN6RCxNQUFNLGNBQWMsR0FBRywrQkFBK0IsQ0FBQztZQUN2RCxNQUFNLFVBQVUsR0FBRyxJQUFJLGNBQWMsRUFBRSxDQUFDO1lBQ3hDLE1BQU0sYUFBYSxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7WUFFM0MsdUJBQXVCLENBQUMsWUFBWSxDQUFDLGFBQWEsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDO1lBRW5FLE1BQU0sU0FBUyxDQUFDLFdBQVcsRUFBRTtnQkFDNUI7b0JBQ0MsSUFBSSxFQUFFLEdBQUcsVUFBVSw4QkFBOEI7b0JBQ2pELFFBQVEsRUFBRTt3QkFDVCxLQUFLO3dCQUNMLFFBQVE7d0JBQ1IsbUJBQW1CO3dCQUNuQixtQkFBbUI7d0JBQ25CLDBCQUEwQjt3QkFDMUIsS0FBSzt3QkFDTCxrQkFBa0I7cUJBQ2xCO2lCQUNEO2dCQUNEO29CQUNDLElBQUksRUFBRSxHQUFHLFVBQVUsZUFBZTtvQkFDbEMsUUFBUSxFQUFFLENBQUMsTUFBTSxDQUFDO2lCQUNsQjthQUNELENBQUMsQ0FBQztZQUVILE1BQU0sZUFBZSxHQUFHLFlBQVksQ0FBQyxjQUFjLENBQUMsNEJBQTRCLEVBQUUsWUFBWSxDQUFDLEtBQUssRUFBRSxTQUFTLEVBQUUsU0FBUyxDQUFDLENBQUM7WUFDNUgsTUFBTSxTQUFTLEdBQUcsSUFBSSxzQkFBc0IsRUFBRSxDQUFDO1lBQy9DLFNBQVMsQ0FBQyxHQUFHLENBQUMsbUJBQW1CLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxhQUFhLEVBQUUsY0FBYyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRWhGLE1BQU0sZUFBZSxDQUFDLE9BQU8sQ0FBQyxTQUFTLEVBQUUsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUM7WUFFakUsTUFBTSxLQUFLLEdBQUcsU0FBUyxDQUFDLE9BQU8sRUFBRTtpQkFDL0IsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUM7aUJBQ3pDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUM7WUFFcEUsTUFBTSxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLEdBQUcsVUFBVSw4QkFBOEIsQ0FBQyxFQUFFLHNDQUFzQyxDQUFDLENBQUM7UUFDaEgsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILEtBQUssQ0FBQyx5QkFBeUIsRUFBRSxHQUFHLEVBQUU7UUFDckMsSUFBSSxDQUFDLHlDQUF5QyxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQzFELE1BQU0sY0FBYyxHQUFHLGlCQUFpQixDQUFDO1lBQ3pDLE1BQU0sVUFBVSxHQUFHLElBQUksY0FBYyxFQUFFLENBQUM7WUFDeEMsTUFBTSxhQUFhLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUUzQyx1QkFBdUIsQ0FBQyxZQUFZLENBQUMsYUFBYSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUM7WUFFbkUsTUFBTSxTQUFTLENBQUMsV0FBVyxFQUFFO2dCQUM1QjtvQkFDQyxJQUFJLEVBQUUsR0FBRyxVQUFVLDRDQUE0QztvQkFDL0QsUUFBUSxFQUFFO3dCQUNULEtBQUs7d0JBQ0wsb0NBQW9DO3dCQUNwQyxvQkFBb0I7d0JBQ3BCLEtBQUs7d0JBQ0wsc0RBQXNEO3FCQUN0RDtpQkFDRDtnQkFDRDtvQkFDQyxJQUFJLEVBQUUsR0FBRyxVQUFVLGtEQUFrRDtvQkFDckUsUUFBUSxFQUFFO3dCQUNULEtBQUs7d0JBQ0wsMENBQTBDO3dCQUMxQyxLQUFLO3dCQUNMLG9CQUFvQjtxQkFDcEI7aUJBQ0Q7YUFDRCxDQUFDLENBQUM7WUFFSCxNQUFNLE9BQU8sR0FBRyxHQUFHLENBQUMsUUFBUSxDQUFDLGFBQWEsRUFBRSwyQ0FBMkMsQ0FBQyxDQUFDO1lBQ3pGLE1BQU0sYUFBYSxHQUFHLEdBQUcsQ0FBQyxRQUFRLENBQUMsYUFBYSxFQUFFLGlEQUFpRCxDQUFDLENBQUM7WUFFckcsTUFBTSxlQUFlLEdBQUcsWUFBWSxDQUFDLGNBQWMsQ0FBQyw0QkFBNEIsRUFBRSxZQUFZLENBQUMsS0FBSyxFQUFFLFNBQVMsRUFBRSxTQUFTLENBQUMsQ0FBQztZQUM1SCxNQUFNLFNBQVMsR0FBRyxJQUFJLHNCQUFzQixFQUFFLENBQUM7WUFDL0MsU0FBUyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLGFBQWEsRUFBRSxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFFL0UsTUFBTSxlQUFlLENBQUMsT0FBTyxDQUFDLFNBQVMsRUFBRSxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUVqRSxNQUFNLEtBQUssR0FBRyxTQUFTLENBQUMsT0FBTyxFQUFFO2lCQUMvQixNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztpQkFDekMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUVwRSxNQUFNLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFFLGlDQUFpQyxDQUFDLENBQUM7WUFDM0UsTUFBTSxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsRUFBRSx1Q0FBdUMsQ0FBQyxDQUFDO1FBQ3hGLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHlDQUF5QyxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQzFELE1BQU0sY0FBYyxHQUFHLHdCQUF3QixDQUFDO1lBQ2hELE1BQU0sVUFBVSxHQUFHLElBQUksY0FBYyxFQUFFLENBQUM7WUFDeEMsTUFBTSxhQUFhLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUUzQyx1QkFBdUIsQ0FBQyxZQUFZLENBQUMsYUFBYSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUM7WUFFbkUsTUFBTSxTQUFTLENBQUMsV0FBVyxFQUFFO2dCQUM1QjtvQkFDQyxJQUFJLEVBQUUsR0FBRyxVQUFVLDRDQUE0QztvQkFDL0QsUUFBUSxFQUFFO3dCQUNULEtBQUs7d0JBQ0wsb0NBQW9DO3dCQUNwQyxvQkFBb0I7d0JBQ3BCLEtBQUs7d0JBQ0wsMENBQTBDO3FCQUMxQztpQkFDRDthQUNELENBQUMsQ0FBQztZQUVILE1BQU0sT0FBTyxHQUFHLEdBQUcsQ0FBQyxRQUFRLENBQUMsYUFBYSxFQUFFLDJDQUEyQyxDQUFDLENBQUM7WUFFekYsTUFBTSxlQUFlLEdBQUcsWUFBWSxDQUFDLGNBQWMsQ0FBQyw0QkFBNEIsRUFBRSxZQUFZLENBQUMsS0FBSyxFQUFFLFNBQVMsRUFBRSxTQUFTLENBQUMsQ0FBQztZQUM1SCxNQUFNLFNBQVMsR0FBRyxJQUFJLHNCQUFzQixFQUFFLENBQUM7WUFDL0MsU0FBUyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLGFBQWEsRUFBRSxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFFL0UsTUFBTSxlQUFlLENBQUMsT0FBTyxDQUFDLFNBQVMsRUFBRSxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUVqRSxNQUFNLEtBQUssR0FBRyxTQUFTLENBQUMsT0FBTyxFQUFFO2lCQUMvQixNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztpQkFDekMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUVwRSxNQUFNLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFFLGlDQUFpQyxDQUFDLENBQUM7WUFDM0UsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsa0JBQWtCLENBQUMsRUFBRSw0Q0FBNEMsQ0FBQyxDQUFDO1FBQzlGLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLGlDQUFpQyxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQ2xELE1BQU0sY0FBYyxHQUFHLGlCQUFpQixDQUFDO1lBQ3pDLE1BQU0sVUFBVSxHQUFHLElBQUksY0FBYyxFQUFFLENBQUM7WUFDeEMsTUFBTSxhQUFhLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUUzQyx1QkFBdUIsQ0FBQyxZQUFZLENBQUMsYUFBYSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUM7WUFFbkUsTUFBTSxTQUFTLENBQUMsV0FBVyxFQUFFO2dCQUM1QjtvQkFDQyxJQUFJLEVBQUUsR0FBRyxVQUFVLDhDQUE4QztvQkFDakUsUUFBUSxFQUFFO3dCQUNULEtBQUs7d0JBQ0wsb0JBQW9CO3dCQUNwQixLQUFLO3dCQUNMLHdDQUF3QztxQkFDeEM7aUJBQ0Q7Z0JBQ0Q7b0JBQ0MsSUFBSSxFQUFFLEdBQUcsVUFBVSw4Q0FBOEM7b0JBQ2pFLFFBQVEsRUFBRTt3QkFDVCx3Q0FBd0M7cUJBQ3hDO2lCQUNEO2dCQUNEO29CQUNDLElBQUksRUFBRSxHQUFHLFVBQVUsOENBQThDO29CQUNqRSxRQUFRLEVBQUU7d0JBQ1QsU0FBUztxQkFDVDtpQkFDRDthQUNELENBQUMsQ0FBQztZQUVILE1BQU0sU0FBUyxHQUFHLEdBQUcsQ0FBQyxRQUFRLENBQUMsYUFBYSxFQUFFLDZDQUE2QyxDQUFDLENBQUM7WUFDN0YsTUFBTSxTQUFTLEdBQUcsR0FBRyxDQUFDLFFBQVEsQ0FBQyxhQUFhLEVBQUUsNkNBQTZDLENBQUMsQ0FBQztZQUM3RixNQUFNLFNBQVMsR0FBRyxHQUFHLENBQUMsUUFBUSxDQUFDLGFBQWEsRUFBRSw2Q0FBNkMsQ0FBQyxDQUFDO1lBRTdGLE1BQU0sZUFBZSxHQUFHLFlBQVksQ0FBQyxjQUFjLENBQUMsNEJBQTRCLEVBQUUsWUFBWSxDQUFDLEtBQUssRUFBRSxTQUFTLEVBQUUsU0FBUyxDQUFDLENBQUM7WUFDNUgsTUFBTSxTQUFTLEdBQUcsSUFBSSxzQkFBc0IsRUFBRSxDQUFDO1lBQy9DLFNBQVMsQ0FBQyxHQUFHLENBQUMsbUJBQW1CLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxhQUFhLEVBQUUsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRS9FLE1BQU0sZUFBZSxDQUFDLE9BQU8sQ0FBQyxTQUFTLEVBQUUsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUM7WUFFakUsTUFBTSxLQUFLLEdBQUcsU0FBUyxDQUFDLE9BQU8sRUFBRTtpQkFDL0IsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUM7aUJBQ3pDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUM7WUFFcEUsTUFBTSxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsRUFBRSx3QkFBd0IsQ0FBQyxDQUFDO1lBQ3BFLE1BQU0sQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLEVBQUUsd0JBQXdCLENBQUMsQ0FBQztZQUNwRSxNQUFNLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxFQUFFLHdCQUF3QixDQUFDLENBQUM7UUFDckUsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILEtBQUssQ0FBQyxXQUFXLEVBQUUsR0FBRyxFQUFFO1FBQ3ZCLElBQUksQ0FBQyx5Q0FBeUMsRUFBRSxLQUFLLElBQUksRUFBRTtZQUMxRCxNQUFNLGNBQWMsR0FBRyxnQkFBZ0IsQ0FBQztZQUN4QyxNQUFNLFVBQVUsR0FBRyxJQUFJLGNBQWMsRUFBRSxDQUFDO1lBQ3hDLE1BQU0sYUFBYSxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7WUFFM0MsdUJBQXVCLENBQUMsWUFBWSxDQUFDLGFBQWEsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDO1lBRW5FLE1BQU0sU0FBUyxDQUFDLFdBQVcsRUFBRTtnQkFDNUI7b0JBQ0MsSUFBSSxFQUFFLEdBQUcsVUFBVSxrREFBa0Q7b0JBQ3JFLFFBQVEsRUFBRTt3QkFDVCxLQUFLO3dCQUNMLG9CQUFvQjt3QkFDcEIsS0FBSzt3QkFDTCxpQkFBaUI7cUJBQ2pCO2lCQUNEO2dCQUNEO29CQUNDLElBQUksRUFBRSxHQUFHLFVBQVUsa0NBQWtDO29CQUNyRCxRQUFRLEVBQUUsQ0FBQyxzQkFBc0IsQ0FBQztpQkFDbEM7Z0JBQ0Q7b0JBQ0MsSUFBSSxFQUFFLEdBQUcsVUFBVSxZQUFZO29CQUMvQixRQUFRLEVBQUUsQ0FBQyxvQkFBb0IsQ0FBQztpQkFDaEM7Z0JBQ0Q7b0JBQ0MsSUFBSSxFQUFFLEdBQUcsVUFBVSxjQUFjO29CQUNqQyxRQUFRLEVBQUUsQ0FBQyxNQUFNLENBQUM7aUJBQ2xCO2FBQ0QsQ0FBQyxDQUFDO1lBRUgsTUFBTSxlQUFlLEdBQTJDLEVBQUUsQ0FBQztZQUNuRSxNQUFNLG9CQUFvQixHQUFHO2dCQUM1QixVQUFVLEVBQUUsQ0FBQyxTQUFpQixFQUFFLElBQWEsRUFBRSxFQUFFO29CQUNoRCxlQUFlLENBQUMsSUFBSSxDQUFDLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7Z0JBQzNDLENBQUM7YUFDK0IsQ0FBQztZQUNsQyxZQUFZLENBQUMsSUFBSSxDQUFDLGlCQUFpQixFQUFFLG9CQUFvQixDQUFDLENBQUM7WUFFM0QsTUFBTSxlQUFlLEdBQUcsWUFBWSxDQUFDLGNBQWMsQ0FBQyw0QkFBNEIsRUFBRSxZQUFZLENBQUMsS0FBSyxFQUFFLFNBQVMsRUFBRSxTQUFTLENBQUMsQ0FBQztZQUM1SCxNQUFNLFNBQVMsR0FBRyxJQUFJLHNCQUFzQixFQUFFLENBQUM7WUFDL0MsU0FBUyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLGFBQWEsRUFBRSxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFFL0UsTUFBTSxlQUFlLENBQUMsT0FBTyxDQUFDLFNBQVMsRUFBRSxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUVqRSxNQUFNLGNBQWMsR0FBRyxlQUFlLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFNBQVMsS0FBSyx1QkFBdUIsQ0FBQyxDQUFDO1lBQzFGLE1BQU0sQ0FBQyxFQUFFLENBQUMsY0FBYyxFQUFFLDZCQUE2QixDQUFDLENBQUM7WUFDekQsTUFBTSxJQUFJLEdBQUcsY0FBYyxDQUFDLElBQW1DLENBQUM7WUFDaEUsTUFBTSxDQUFDLGVBQWUsQ0FBQyxJQUFJLEVBQUU7Z0JBQzVCLHlCQUF5QixFQUFFLENBQUM7Z0JBQzVCLDJCQUEyQixFQUFFLENBQUM7Z0JBQzlCLHNCQUFzQixFQUFFLENBQUM7Z0JBQ3pCLHVCQUF1QixFQUFFLENBQUM7Z0JBQzFCLHNCQUFzQixFQUFFLENBQUM7Z0JBQ3pCLGdCQUFnQixFQUFFLENBQUM7Z0JBQ25CLGFBQWEsRUFBRSxDQUFDO2dCQUNoQixpQkFBaUIsRUFBRSxDQUFDO2FBQ3BCLENBQUMsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHdDQUF3QyxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQ3pELE1BQU0sY0FBYyxHQUFHLDZCQUE2QixDQUFDO1lBQ3JELE1BQU0sVUFBVSxHQUFHLElBQUksY0FBYyxFQUFFLENBQUM7WUFDeEMsTUFBTSxhQUFhLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUUzQyx1QkFBdUIsQ0FBQyxZQUFZLENBQUMsYUFBYSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUM7WUFFbkUsTUFBTSxTQUFTLENBQUMsV0FBVyxFQUFFO2dCQUM1QjtvQkFDQyxJQUFJLEVBQUUsR0FBRyxVQUFVLDhCQUE4QjtvQkFDakQsUUFBUSxFQUFFLENBQUMsdUJBQXVCLENBQUM7aUJBQ25DO2dCQUNEO29CQUNDLElBQUksRUFBRSxHQUFHLFVBQVUsMkJBQTJCO29CQUM5QyxRQUFRLEVBQUU7d0JBQ1QsS0FBSzt3QkFDTCxRQUFRO3dCQUNSLG9CQUFvQjt3QkFDcEIsS0FBSzt3QkFDTCxvQkFBb0I7cUJBQ3BCO2lCQUNEO2dCQUNEO29CQUNDLElBQUksRUFBRSxHQUFHLFVBQVUsY0FBYztvQkFDakMsUUFBUSxFQUFFLENBQUMsTUFBTSxDQUFDO2lCQUNsQjthQUNELENBQUMsQ0FBQztZQUVILE1BQU0sZUFBZSxHQUEyQyxFQUFFLENBQUM7WUFDbkUsTUFBTSxvQkFBb0IsR0FBRztnQkFDNUIsVUFBVSxFQUFFLENBQUMsU0FBaUIsRUFBRSxJQUFhLEVBQUUsRUFBRTtvQkFDaEQsZUFBZSxDQUFDLElBQUksQ0FBQyxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO2dCQUMzQyxDQUFDO2FBQytCLENBQUM7WUFDbEMsWUFBWSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDO1lBRTNELE1BQU0sZUFBZSxHQUFHLFlBQVksQ0FBQyxjQUFjLENBQUMsNEJBQTRCLEVBQUUsWUFBWSxDQUFDLEtBQUssRUFBRSxTQUFTLEVBQUUsU0FBUyxDQUFDLENBQUM7WUFDNUgsTUFBTSxTQUFTLEdBQUcsSUFBSSxzQkFBc0IsRUFBRSxDQUFDO1lBQy9DLFNBQVMsQ0FBQyxHQUFHLENBQUMsbUJBQW1CLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxhQUFhLEVBQUUsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRS9FLE1BQU0sZUFBZSxDQUFDLE9BQU8sQ0FBQyxTQUFTLEVBQUUsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUM7WUFFakUsTUFBTSxjQUFjLEdBQUcsZUFBZSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxTQUFTLEtBQUssdUJBQXVCLENBQUMsQ0FBQztZQUMxRixNQUFNLENBQUMsRUFBRSxDQUFDLGNBQWMsRUFBRSw2QkFBNkIsQ0FBQyxDQUFDO1lBQ3pELE1BQU0sSUFBSSxHQUFHLGNBQWMsQ0FBQyxJQUFtQyxDQUFDO1lBQ2hFLHNHQUFzRztZQUN0RyxNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDLEVBQUUsNkRBQTZELENBQUMsQ0FBQztZQUM1RyxNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyx5QkFBeUIsRUFBRSxDQUFDLEVBQUUsNkNBQTZDLENBQUMsQ0FBQztZQUNyRyxNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQyxFQUFFLGdDQUFnQyxDQUFDLENBQUM7UUFDN0UsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMscUNBQXFDLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDdEQsTUFBTSxjQUFjLEdBQUcseUJBQXlCLENBQUM7WUFDakQsTUFBTSxVQUFVLEdBQUcsSUFBSSxjQUFjLEVBQUUsQ0FBQztZQUN4QyxNQUFNLGFBQWEsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBRTNDLHVCQUF1QixDQUFDLFlBQVksQ0FBQyxhQUFhLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQztZQUNuRSxpQkFBaUIsQ0FBQyxvQkFBb0IsQ0FBQyxhQUFhLENBQUMsYUFBYSxFQUFFLElBQUksQ0FBQyxDQUFDO1lBRTFFLE1BQU0sU0FBUyxDQUFDLFdBQVcsRUFBRTtnQkFDNUI7b0JBQ0MsSUFBSSxFQUFFLEdBQUcsVUFBVSxZQUFZO29CQUMvQixRQUFRLEVBQUUsQ0FBQyxtQkFBbUIsQ0FBQztpQkFDL0I7Z0JBQ0Q7b0JBQ0MsSUFBSSxFQUFFLEdBQUcsVUFBVSxvQkFBb0I7b0JBQ3ZDLFFBQVEsRUFBRSxDQUFDLHdCQUF3QixDQUFDO2lCQUNwQztnQkFDRDtvQkFDQyxJQUFJLEVBQUUsR0FBRyxVQUFVLGNBQWM7b0JBQ2pDLFFBQVEsRUFBRSxDQUFDLE1BQU0sQ0FBQztpQkFDbEI7YUFDRCxDQUFDLENBQUM7WUFFSCxNQUFNLGVBQWUsR0FBMkMsRUFBRSxDQUFDO1lBQ25FLE1BQU0sb0JBQW9CLEdBQUc7Z0JBQzVCLFVBQVUsRUFBRSxDQUFDLFNBQWlCLEVBQUUsSUFBYSxFQUFFLEVBQUU7b0JBQ2hELGVBQWUsQ0FBQyxJQUFJLENBQUMsRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztnQkFDM0MsQ0FBQzthQUMrQixDQUFDO1lBQ2xDLFlBQVksQ0FBQyxJQUFJLENBQUMsaUJBQWlCLEVBQUUsb0JBQW9CLENBQUMsQ0FBQztZQUUzRCxNQUFNLGVBQWUsR0FBRyxZQUFZLENBQUMsY0FBYyxDQUFDLDRCQUE0QixFQUFFLFlBQVksQ0FBQyxLQUFLLEVBQUUsU0FBUyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1lBQzVILE1BQU0sU0FBUyxHQUFHLElBQUksc0JBQXNCLEVBQUUsQ0FBQztZQUMvQyxTQUFTLENBQUMsR0FBRyxDQUFDLG1CQUFtQixDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsYUFBYSxFQUFFLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUUvRSxNQUFNLGVBQWUsQ0FBQyxPQUFPLENBQUMsU0FBUyxFQUFFLGlCQUFpQixDQUFDLElBQUksQ0FBQyxDQUFDO1lBRWpFLE1BQU0sY0FBYyxHQUFHLGVBQWUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsU0FBUyxLQUFLLHVCQUF1QixDQUFDLENBQUM7WUFDMUYsTUFBTSxDQUFDLEVBQUUsQ0FBQyxjQUFjLEVBQUUsNkJBQTZCLENBQUMsQ0FBQztZQUN6RCxNQUFNLElBQUksR0FBRyxjQUFjLENBQUMsSUFBbUMsQ0FBQztZQUNoRSxNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQyxFQUFFLG1DQUFtQyxDQUFDLENBQUM7WUFDL0UsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQyxFQUFFLG1DQUFtQyxDQUFDLENBQUM7UUFDbkYsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMseUNBQXlDLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDMUQsTUFBTSxjQUFjLEdBQUcsOEJBQThCLENBQUM7WUFDdEQsTUFBTSxVQUFVLEdBQUcsSUFBSSxjQUFjLEVBQUUsQ0FBQztZQUN4QyxNQUFNLGFBQWEsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBRTNDLHVCQUF1QixDQUFDLFlBQVksQ0FBQyxhQUFhLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQztZQUNuRSxpQkFBaUIsQ0FBQyxvQkFBb0IsQ0FBQyxvQ0FBb0MsRUFBRSxJQUFJLENBQUMsQ0FBQztZQUNuRixpQkFBaUIsQ0FBQyxvQkFBb0IsQ0FBQyxhQUFhLENBQUMsbUJBQW1CLEVBQUU7Z0JBQ3pFLENBQUMsb0JBQW9CLENBQUMsRUFBRSxJQUFJO2dCQUM1QixnQkFBZ0IsRUFBRSxJQUFJO2FBQ3RCLENBQUMsQ0FBQztZQUVILE1BQU0sU0FBUyxDQUFDLFdBQVcsRUFBRTtnQkFDNUI7b0JBQ0MsSUFBSSxFQUFFLEdBQUcsVUFBVSx1Q0FBdUM7b0JBQzFELFFBQVEsRUFBRTt3QkFDVCxLQUFLO3dCQUNMLGlDQUFpQzt3QkFDakMsS0FBSzt3QkFDTCxzQkFBc0I7cUJBQ3RCO2lCQUNEO2dCQUNEO29CQUNDLElBQUksRUFBRSxHQUFHLFVBQVUsbUNBQW1DO29CQUN0RCxRQUFRLEVBQUU7d0JBQ1QsS0FBSzt3QkFDTCxpQ0FBaUM7d0JBQ2pDLEtBQUs7d0JBQ0wsc0JBQXNCO3FCQUN0QjtpQkFDRDtnQkFDRDtvQkFDQyxJQUFJLEVBQUUsR0FBRyxVQUFVLGNBQWM7b0JBQ2pDLFFBQVEsRUFBRSxDQUFDLE1BQU0sQ0FBQztpQkFDbEI7YUFDRCxDQUFDLENBQUM7WUFFSCxNQUFNLGVBQWUsR0FBMkMsRUFBRSxDQUFDO1lBQ25FLE1BQU0sb0JBQW9CLEdBQUc7Z0JBQzVCLFVBQVUsRUFBRSxDQUFDLFNBQWlCLEVBQUUsSUFBYSxFQUFFLEVBQUU7b0JBQ2hELGVBQWUsQ0FBQyxJQUFJLENBQUMsRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztnQkFDM0MsQ0FBQzthQUMrQixDQUFDO1lBQ2xDLFlBQVksQ0FBQyxJQUFJLENBQUMsaUJBQWlCLEVBQUUsb0JBQW9CLENBQUMsQ0FBQztZQUUzRCxNQUFNLGVBQWUsR0FBRyxZQUFZLENBQUMsY0FBYyxDQUNsRCw0QkFBNEIsRUFDNUIsWUFBWSxDQUFDLEtBQUssRUFDbEIsRUFBRSxvQkFBb0IsRUFBRSxJQUFJLEVBQUUsRUFDOUIsQ0FBQyxHQUFHLENBQUMsQ0FDTCxDQUFDO1lBQ0YsTUFBTSxTQUFTLEdBQUcsSUFBSSxzQkFBc0IsRUFBRSxDQUFDO1lBQy9DLFNBQVMsQ0FBQyxHQUFHLENBQUMsbUJBQW1CLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxhQUFhLEVBQUUsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRS9FLE1BQU0sZUFBZSxDQUFDLE9BQU8sQ0FBQyxTQUFTLEVBQUUsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUM7WUFFakUsTUFBTSxjQUFjLEdBQUcsZUFBZSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxTQUFTLEtBQUssdUJBQXVCLENBQUMsQ0FBQztZQUMxRixNQUFNLENBQUMsRUFBRSxDQUFDLGNBQWMsRUFBRSw2QkFBNkIsQ0FBQyxDQUFDO1lBQ3pELE1BQU0sSUFBSSxHQUFHLGNBQWMsQ0FBQyxJQUFtQyxDQUFDO1lBQ2hFLE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUMsRUFBRSw2QkFBNkIsQ0FBQyxDQUFDO1FBQzlFLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxLQUFLLENBQUMsaUJBQWlCLEVBQUUsR0FBRyxFQUFFO1FBQzdCLElBQUksQ0FBQywwREFBMEQsRUFBRSxLQUFLLElBQUksRUFBRTtZQUMzRSxNQUFNLGNBQWMsR0FBRyxzQkFBc0IsQ0FBQztZQUM5QyxNQUFNLFVBQVUsR0FBRyxJQUFJLGNBQWMsRUFBRSxDQUFDO1lBQ3hDLE1BQU0sYUFBYSxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7WUFFM0MsdUJBQXVCLENBQUMsWUFBWSxDQUFDLGFBQWEsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDO1lBQ25FLGlCQUFpQixDQUFDLG9CQUFvQixDQUFDLGFBQWEsQ0FBQyxnQkFBZ0IsRUFBRSxJQUFJLENBQUMsQ0FBQztZQUU3RSxNQUFNLFNBQVMsQ0FBQyxXQUFXLEVBQUU7Z0JBQzVCO29CQUNDLElBQUksRUFBRSxHQUFHLFVBQVUsbUNBQW1DO29CQUN0RCxRQUFRLEVBQUU7d0JBQ1QsS0FBSzt3QkFDTCxvQkFBb0I7d0JBQ3BCLCtCQUErQjt3QkFDL0IsS0FBSzt3QkFDTCxvQkFBb0I7cUJBQ3BCO2lCQUNEO2dCQUNEO29CQUNDLElBQUksRUFBRSxHQUFHLFVBQVUsc0NBQXNDO29CQUN6RCxRQUFRLEVBQUU7d0JBQ1QsS0FBSzt3QkFDTCx1QkFBdUI7d0JBQ3ZCLHFDQUFxQzt3QkFDckMsS0FBSzt3QkFDTCxxQkFBcUI7cUJBQ3JCO2lCQUNEO2FBQ0QsQ0FBQyxDQUFDO1lBRUgsTUFBTSxlQUFlLEdBQTJELEVBQUUsQ0FBQztZQUNuRixNQUFNLG9CQUFvQixHQUFHO2dCQUM1QixVQUFVLEVBQUUsQ0FBQyxTQUFpQixFQUFFLElBQTZCLEVBQUUsRUFBRTtvQkFDaEUsZUFBZSxDQUFDLElBQUksQ0FBQyxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO2dCQUMzQyxDQUFDO2FBQytCLENBQUM7WUFDbEMsWUFBWSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDO1lBRTNELE1BQU0sZUFBZSxHQUFHLFlBQVksQ0FBQyxjQUFjLENBQ2xELDRCQUE0QixFQUM1QixZQUFZLENBQUMsS0FBSyxFQUNsQixFQUFFLGlCQUFpQixFQUFFLElBQUksRUFBRSxFQUMzQixTQUFTLENBQ1QsQ0FBQztZQUNGLE1BQU0sU0FBUyxHQUFHLElBQUksc0JBQXNCLEVBQUUsQ0FBQztZQUUvQyxNQUFNLGVBQWUsQ0FBQyxPQUFPLENBQUMsU0FBUyxFQUFFLGlCQUFpQixDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ2pFLE1BQU0sSUFBSSxPQUFPLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFFdEQsTUFBTSxXQUFXLEdBQUcsZUFBZSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxTQUFTLEtBQUssd0JBQXdCLENBQUMsQ0FBQztZQUMxRixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLGlDQUFpQyxDQUFDLENBQUM7WUFFN0UsaUVBQWlFO1lBQ2pFLEtBQUssTUFBTSxLQUFLLElBQUksV0FBVyxFQUFFLENBQUM7Z0JBQ2pDLE1BQU0sQ0FBQyxFQUFFLENBQUMsT0FBTyxLQUFLLENBQUMsSUFBSSxDQUFDLGFBQWEsS0FBSyxRQUFRLElBQUksS0FBSyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSw0Q0FBNEMsQ0FBQyxDQUFDO2dCQUM3SSxNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFLE9BQU8sRUFBRSxtREFBbUQsQ0FBQyxDQUFDO2dCQUMxRyxzREFBc0Q7Z0JBQ3RELE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxlQUFlLEVBQUUsRUFBRSxFQUFFLGtEQUFrRCxDQUFDLENBQUM7Z0JBQ3ZHLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxFQUFFLEVBQUUsbURBQW1ELENBQUMsQ0FBQztnQkFDekcsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLGNBQWMsRUFBRSxFQUFFLEVBQUUsaURBQWlELENBQUMsQ0FBQztnQkFDckcsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLGFBQWEsRUFBRSxFQUFFLEVBQUUsZ0RBQWdELENBQUMsQ0FBQztZQUNwRyxDQUFDO1lBRUQsMkVBQTJFO1lBQzNFLE1BQU0sQ0FBQyxjQUFjLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUUsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUUsb0RBQW9ELENBQUMsQ0FBQztRQUNuSixDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQywrRUFBK0UsRUFBRSxLQUFLLElBQUksRUFBRTtZQUNoRyxNQUFNLGNBQWMsR0FBRywrQkFBK0IsQ0FBQztZQUN2RCxNQUFNLFVBQVUsR0FBRyxJQUFJLGNBQWMsRUFBRSxDQUFDO1lBQ3hDLE1BQU0sYUFBYSxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7WUFFM0MsdUJBQXVCLENBQUMsWUFBWSxDQUFDLGFBQWEsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDO1lBQ25FLGlCQUFpQixDQUFDLG9CQUFvQixDQUFDLGFBQWEsQ0FBQyxnQkFBZ0IsRUFBRSxJQUFJLENBQUMsQ0FBQztZQUU3RSxNQUFNLFNBQVMsQ0FBQyxXQUFXLEVBQUU7Z0JBQzVCO29CQUNDLElBQUksRUFBRSxHQUFHLFVBQVUsdUNBQXVDO29CQUMxRCxRQUFRLEVBQUU7d0JBQ1QsS0FBSzt3QkFDTCx3QkFBd0I7d0JBQ3hCLHNDQUFzQzt3QkFDdEMsZ0NBQWdDO3dCQUNoQyxLQUFLO3dCQUNMLHNCQUFzQjtxQkFDdEI7aUJBQ0Q7Z0JBQ0Q7b0JBQ0MsSUFBSSxFQUFFLEdBQUcsVUFBVSxxQ0FBcUM7b0JBQ3hELFFBQVEsRUFBRTt3QkFDVCxLQUFLO3dCQUNMLHNCQUFzQjt3QkFDdEIsMENBQTBDO3dCQUMxQyxLQUFLO3dCQUNMLG9CQUFvQjtxQkFDcEI7aUJBQ0Q7YUFDRCxDQUFDLENBQUM7WUFFSCxNQUFNLGVBQWUsR0FBMkQsRUFBRSxDQUFDO1lBQ25GLE1BQU0sb0JBQW9CLEdBQUc7Z0JBQzVCLFVBQVUsRUFBRSxDQUFDLFNBQWlCLEVBQUUsSUFBNkIsRUFBRSxFQUFFO29CQUNoRSxlQUFlLENBQUMsSUFBSSxDQUFDLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7Z0JBQzNDLENBQUM7YUFDK0IsQ0FBQztZQUNsQyxZQUFZLENBQUMsSUFBSSxDQUFDLGlCQUFpQixFQUFFLG9CQUFvQixDQUFDLENBQUM7WUFFM0QsTUFBTSxlQUFlLEdBQUcsWUFBWSxDQUFDLGNBQWMsQ0FDbEQsNEJBQTRCLEVBQzVCLFlBQVksQ0FBQyxLQUFLLEVBQ2xCLEVBQUUsaUJBQWlCLEVBQUUsSUFBSSxFQUFFLEVBQzNCLFNBQVMsQ0FDVCxDQUFDO1lBQ0YsTUFBTSxTQUFTLEdBQUcsSUFBSSxzQkFBc0IsRUFBRSxDQUFDO1lBRS9DLE1BQU0sZUFBZSxDQUFDLE9BQU8sQ0FBQyxTQUFTLEVBQUUsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDakUsTUFBTSxJQUFJLE9BQU8sQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUV0RCxNQUFNLFdBQVcsR0FBRyxlQUFlLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFNBQVMsS0FBSyx3QkFBd0IsQ0FBQyxDQUFDO1lBQzFGLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsb0RBQW9ELENBQUMsQ0FBQztZQUNoRyxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQy9ELENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHdFQUF3RSxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQ3pGLE1BQU0sY0FBYyxHQUFHLGtDQUFrQyxDQUFDO1lBQzFELE1BQU0sVUFBVSxHQUFHLElBQUksY0FBYyxFQUFFLENBQUM7WUFDeEMsTUFBTSxhQUFhLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUUzQyx1QkFBdUIsQ0FBQyxZQUFZLENBQUMsYUFBYSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUM7WUFDbkUsaUJBQWlCLENBQUMsb0JBQW9CLENBQUMsYUFBYSxDQUFDLGdCQUFnQixFQUFFLEtBQUssQ0FBQyxDQUFDO1lBRTlFLE1BQU0sU0FBUyxDQUFDLFdBQVcsRUFBRTtnQkFDNUI7b0JBQ0MsSUFBSSxFQUFFLEdBQUcsVUFBVSxxQ0FBcUM7b0JBQ3hELFFBQVEsRUFBRTt3QkFDVCxLQUFLO3dCQUNMLHNCQUFzQjt3QkFDdEIsMEJBQTBCO3dCQUMxQixLQUFLO3dCQUNMLGVBQWU7cUJBQ2Y7aUJBQ0Q7YUFDRCxDQUFDLENBQUM7WUFFSCxNQUFNLGVBQWUsR0FBMkQsRUFBRSxDQUFDO1lBQ25GLE1BQU0sb0JBQW9CLEdBQUc7Z0JBQzVCLFVBQVUsRUFBRSxDQUFDLFNBQWlCLEVBQUUsSUFBNkIsRUFBRSxFQUFFO29CQUNoRSxlQUFlLENBQUMsSUFBSSxDQUFDLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7Z0JBQzNDLENBQUM7YUFDK0IsQ0FBQztZQUNsQyxZQUFZLENBQUMsSUFBSSxDQUFDLGlCQUFpQixFQUFFLG9CQUFvQixDQUFDLENBQUM7WUFFM0QsTUFBTSxlQUFlLEdBQUcsWUFBWSxDQUFDLGNBQWMsQ0FDbEQsNEJBQTRCLEVBQzVCLFlBQVksQ0FBQyxLQUFLLEVBQ2xCLEVBQUUsaUJBQWlCLEVBQUUsSUFBSSxFQUFFLEVBQzNCLFNBQVMsQ0FDVCxDQUFDO1lBQ0YsTUFBTSxTQUFTLEdBQUcsSUFBSSxzQkFBc0IsRUFBRSxDQUFDO1lBRS9DLE1BQU0sZUFBZSxDQUFDLE9BQU8sQ0FBQyxTQUFTLEVBQUUsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDakUsTUFBTSxJQUFJLE9BQU8sQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUV0RCxNQUFNLFdBQVcsR0FBRyxlQUFlLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFNBQVMsS0FBSyx3QkFBd0IsQ0FBQyxDQUFDO1lBQzFGLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsMERBQTBELENBQUMsQ0FBQztRQUN2RyxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxpRUFBaUUsRUFBRSxLQUFLLElBQUksRUFBRTtZQUNsRixNQUFNLGNBQWMsR0FBRyxpQ0FBaUMsQ0FBQztZQUN6RCxNQUFNLFVBQVUsR0FBRyxJQUFJLGNBQWMsRUFBRSxDQUFDO1lBQ3hDLE1BQU0sYUFBYSxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7WUFFM0MsdUJBQXVCLENBQUMsWUFBWSxDQUFDLGFBQWEsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDO1lBQ25FLGlCQUFpQixDQUFDLG9CQUFvQixDQUFDLGFBQWEsQ0FBQyxnQkFBZ0IsRUFBRSxJQUFJLENBQUMsQ0FBQztZQUU3RSxNQUFNLFVBQVUsR0FBa0I7Z0JBQ2pDO29CQUNDLEdBQUcsRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsVUFBVSxnQ0FBZ0MsQ0FBQztvQkFDNUQsT0FBTyxFQUFFLGNBQWMsQ0FBQyxTQUFTO29CQUNqQyxJQUFJLEVBQUUsV0FBVztvQkFDakIsV0FBVyxFQUFFLG9CQUFvQjtvQkFDakMsc0JBQXNCLEVBQUUsS0FBSztvQkFDN0IsYUFBYSxFQUFFLElBQUk7b0JBQ25CLFNBQVMsRUFBRTt3QkFDVixVQUFVLEVBQUUsSUFBSSxtQkFBbUIsQ0FBQyx3QkFBd0IsQ0FBQzt3QkFDN0QsT0FBTyxFQUFFLE9BQU87cUJBQ1M7aUJBQzFCO2dCQUNEO29CQUNDLEdBQUcsRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsVUFBVSxzQ0FBc0MsQ0FBQztvQkFDbEUsT0FBTyxFQUFFLGNBQWMsQ0FBQyxNQUFNO29CQUM5QixJQUFJLEVBQUUsY0FBYztvQkFDcEIsV0FBVyxFQUFFLGdCQUFnQjtvQkFDN0Isc0JBQXNCLEVBQUUsS0FBSztvQkFDN0IsYUFBYSxFQUFFLElBQUk7b0JBQ25CLFNBQVMsRUFBRSxHQUFHLENBQUMsS0FBSyxDQUFDLDBCQUEwQixDQUFDO2lCQUNoRDthQUNELENBQUM7WUFDRixLQUFLLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxpQkFBaUIsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUU1RCx1RUFBdUU7WUFDdkUsTUFBTSxTQUFTLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO1lBQ3hELFlBQVksQ0FBQyxJQUFJLENBQUMsbUJBQW1CLEVBQUU7Z0JBQ3RDLE9BQU8sRUFBRSxlQUFlLENBQUMsYUFBYSxFQUFFLENBQUM7d0JBQ3hDLEdBQUcsRUFBRSxTQUFTO3dCQUNkLEtBQUssRUFBRSxXQUFXO3dCQUNsQixlQUFlLEVBQUUsRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFO3FCQUNyQyxDQUF1QyxDQUFDO2FBQ3pDLENBQUMsQ0FBQztZQUVILE1BQU0sZUFBZSxHQUEyRCxFQUFFLENBQUM7WUFDbkYsTUFBTSxvQkFBb0IsR0FBRztnQkFDNUIsVUFBVSxFQUFFLENBQUMsU0FBaUIsRUFBRSxJQUE2QixFQUFFLEVBQUU7b0JBQ2hFLGVBQWUsQ0FBQyxJQUFJLENBQUMsRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztnQkFDM0MsQ0FBQzthQUMrQixDQUFDO1lBQ2xDLFlBQVksQ0FBQyxJQUFJLENBQUMsaUJBQWlCLEVBQUUsb0JBQW9CLENBQUMsQ0FBQztZQUUzRCxNQUFNLGVBQWUsR0FBRyxZQUFZLENBQUMsY0FBYyxDQUNsRCw0QkFBNEIsRUFDNUIsWUFBWSxDQUFDLEtBQUssRUFDbEIsRUFBRSxpQkFBaUIsRUFBRSxJQUFJLEVBQUUsRUFDM0IsU0FBUyxDQUNULENBQUM7WUFDRixNQUFNLFNBQVMsR0FBRyxJQUFJLHNCQUFzQixFQUFFLENBQUM7WUFFL0MsTUFBTSxlQUFlLENBQUMsT0FBTyxDQUFDLFNBQVMsRUFBRSxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNqRSxNQUFNLElBQUksT0FBTyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBRXRELE1BQU0sV0FBVyxHQUFHLGVBQWUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsU0FBUyxLQUFLLHdCQUF3QixDQUFDLENBQUM7WUFDMUYsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxpQ0FBaUMsQ0FBQyxDQUFDO1lBRTdFLDJEQUEyRDtZQUMzRCxNQUFNLFFBQVEsR0FBRyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxZQUFZLEtBQUssV0FBVyxDQUFDLENBQUM7WUFDNUUsTUFBTSxDQUFDLEVBQUUsQ0FBQyxRQUFRLEVBQUUsc0NBQXNDLENBQUMsQ0FBQztZQUM1RCxNQUFNLENBQUMsRUFBRSxDQUFDLE9BQU8sUUFBUSxDQUFDLElBQUksQ0FBQyxlQUFlLEtBQUssUUFBUSxJQUFJLFFBQVEsQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUscUNBQXFDLENBQUMsQ0FBQztZQUNoSixNQUFNLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDNUQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLGNBQWMsRUFBRSxFQUFFLENBQUMsQ0FBQztZQUNyRCxNQUFNLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBRXBELHdEQUF3RDtZQUN4RCxNQUFNLFdBQVcsR0FBRyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxZQUFZLEtBQUssUUFBUSxDQUFDLENBQUM7WUFDNUUsTUFBTSxDQUFDLEVBQUUsQ0FBQyxXQUFXLEVBQUUsa0NBQWtDLENBQUMsQ0FBQztZQUMzRCxNQUFNLENBQUMsRUFBRSxDQUFDLE9BQU8sV0FBVyxDQUFDLElBQUksQ0FBQyxjQUFjLEtBQUssUUFBUSxJQUFJLFdBQVcsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsb0NBQW9DLENBQUMsQ0FBQztZQUNuSixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQzVELE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxlQUFlLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFDekQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLGdCQUFnQixFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQzNELENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxLQUFLLENBQUMsNEJBQTRCLEVBQUUsR0FBRyxFQUFFO1FBQ3hDLFNBQVMsV0FBVyxDQUFDLElBQVksRUFBRSxHQUFXO1lBQzdDLE1BQU0sS0FBSyxHQUFHLElBQUksTUFBTSxDQUFDLElBQUksR0FBRyxvQkFBb0IsR0FBRyxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUM7WUFDakUsTUFBTSxPQUFPLEdBQUcsRUFBRSxDQUFDO1lBQ25CLElBQUksS0FBSyxDQUFDO1lBQ1YsT0FBTyxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLEtBQUssSUFBSSxFQUFFLENBQUM7Z0JBQzVDLE9BQU8sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7WUFDL0IsQ0FBQztZQUNELE9BQU8sT0FBTyxDQUFDO1FBQ2hCLENBQUM7UUFFRCxTQUFTLFdBQVcsQ0FBQyxJQUFZO1lBQ2hDLE9BQU8sR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUM7UUFDOUIsQ0FBQztRQUVELElBQUksQ0FBQyxnRUFBZ0UsRUFBRSxLQUFLLElBQUksRUFBRTtZQUNqRixNQUFNLGNBQWMsR0FBRyx3QkFBd0IsQ0FBQztZQUNoRCxNQUFNLFVBQVUsR0FBRyxJQUFJLGNBQWMsRUFBRSxDQUFDO1lBQ3hDLE1BQU0sYUFBYSxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7WUFFM0MsdUJBQXVCLENBQUMsWUFBWSxDQUFDLGFBQWEsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDO1lBRW5FLE1BQU0sU0FBUyxDQUFDLFdBQVcsRUFBRTtnQkFDNUI7b0JBQ0MsSUFBSSxFQUFFLEdBQUcsVUFBVSw0Q0FBNEM7b0JBQy9ELFFBQVEsRUFBRTt3QkFDVCxLQUFLO3dCQUNMLG9DQUFvQzt3QkFDcEMsb0JBQW9CO3dCQUNwQixLQUFLO3dCQUNMLGNBQWM7cUJBQ2Q7aUJBQ0Q7YUFDRCxDQUFDLENBQUM7WUFFSCxNQUFNLGVBQWUsR0FBRyxZQUFZLENBQUMsY0FBYyxDQUNsRCw0QkFBNEIsRUFDNUIsWUFBWSxDQUFDLEtBQUssRUFDbEIsRUFBRSxpQkFBaUIsRUFBRSxJQUFJLEVBQUUsRUFBRSx1QkFBdUI7WUFDcEQsU0FBUyxDQUNULENBQUM7WUFDRixNQUFNLFNBQVMsR0FBRyxJQUFJLHNCQUFzQixFQUFFLENBQUM7WUFFL0MsTUFBTSxlQUFlLENBQUMsT0FBTyxDQUFDLFNBQVMsRUFBRSxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUVqRSxNQUFNLGFBQWEsR0FBRyxTQUFTLENBQUMsT0FBTyxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNwRixNQUFNLENBQUMsS0FBSyxDQUFDLGFBQWEsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLHlEQUF5RCxDQUFDLENBQUM7WUFFakcsTUFBTSxnQkFBZ0IsR0FBRyxXQUFXLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssRUFBRSxjQUFjLENBQUMsQ0FBQztZQUM3RSxNQUFNLENBQUMsS0FBSyxDQUFDLGdCQUFnQixDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsdUNBQXVDLENBQUMsQ0FBQztZQUVsRixNQUFNLFlBQVksR0FBRyxXQUFXLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLEVBQUUsYUFBYSxDQUFDLENBQUM7WUFDckUsTUFBTSxDQUFDLEtBQUssQ0FBQyxZQUFZLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxpQ0FBaUMsQ0FBQyxDQUFDO1lBRXhFLE1BQU0sQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsRUFBRSxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxtQkFBbUIsQ0FBQyxDQUFDO1lBQ2xGLE1BQU0sQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxXQUFXLENBQUMsR0FBRyxVQUFVLDRDQUE0QyxDQUFDLENBQUMsQ0FBQztZQUM5SCxNQUFNLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLEVBQUUsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDckUsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsNERBQTRELEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDN0UsTUFBTSxjQUFjLEdBQUcsa0JBQWtCLENBQUM7WUFDMUMsTUFBTSxVQUFVLEdBQUcsSUFBSSxjQUFjLEVBQUUsQ0FBQztZQUN4QyxNQUFNLGFBQWEsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBRTNDLHVCQUF1QixDQUFDLFlBQVksQ0FBQyxhQUFhLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQztZQUVuRSxzQ0FBc0M7WUFDdEMsaUJBQWlCLENBQUMsb0JBQW9CLENBQUMsb0NBQW9DLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFFbkYsTUFBTSxTQUFTLENBQUMsV0FBVyxFQUFFO2dCQUM1QjtvQkFDQyxJQUFJLEVBQUUsR0FBRyxVQUFVLHVDQUF1QztvQkFDMUQsUUFBUSxFQUFFO3dCQUNULEtBQUs7d0JBQ0wsK0JBQStCO3dCQUMvQixzQkFBc0I7d0JBQ3RCLGlDQUFpQzt3QkFDakMsS0FBSzt3QkFDTCxvQkFBb0I7cUJBQ3BCO2lCQUNEO2dCQUNEO29CQUNDLElBQUksRUFBRSxHQUFHLFVBQVUsdUNBQXVDO29CQUMxRCxRQUFRLEVBQUU7d0JBQ1QsS0FBSzt3QkFDTCwrQkFBK0I7d0JBQy9CLHNCQUFzQjt3QkFDdEIsZ0NBQWdDO3dCQUNoQyxLQUFLO3dCQUNMLG9CQUFvQjtxQkFDcEI7aUJBQ0Q7Z0JBQ0Q7b0JBQ0MsSUFBSSxFQUFFLEdBQUcsVUFBVSx1Q0FBdUM7b0JBQzFELFFBQVEsRUFBRTt3QkFDVCxLQUFLO3dCQUNMLCtCQUErQjt3QkFDL0IsdUJBQXVCO3dCQUN2QixpQ0FBaUM7d0JBQ2pDLEtBQUs7d0JBQ0wsb0JBQW9CO3FCQUNwQjtpQkFDRDtnQkFDRDtvQkFDQyxJQUFJLEVBQUUsR0FBRyxVQUFVLHVDQUF1QztvQkFDMUQsUUFBUSxFQUFFO3dCQUNULEtBQUs7d0JBQ0wsK0JBQStCO3dCQUMvQix1QkFBdUI7d0JBQ3ZCLGdDQUFnQzt3QkFDaEMsS0FBSzt3QkFDTCxvQkFBb0I7cUJBQ3BCO2lCQUNEO2dCQUNEO29CQUNDLElBQUksRUFBRSxHQUFHLFVBQVUsdUNBQXVDO29CQUMxRCxRQUFRLEVBQUU7d0JBQ1QsS0FBSzt3QkFDTCwrQkFBK0I7d0JBQy9CLEtBQUs7d0JBQ0wsb0JBQW9CO3FCQUNwQjtpQkFDRDthQUNELENBQUMsQ0FBQztZQUVILE1BQU0sZUFBZSxHQUFHLFlBQVksQ0FBQyxjQUFjLENBQ2xELDRCQUE0QixFQUM1QixZQUFZLENBQUMsS0FBSyxFQUNsQixFQUFFLG9CQUFvQixFQUFFLElBQUksRUFBRSxFQUFFLDBCQUEwQjtZQUMxRCxDQUFDLEdBQUcsQ0FBQyxDQUNMLENBQUM7WUFDRixNQUFNLFNBQVMsR0FBRyxJQUFJLHNCQUFzQixFQUFFLENBQUM7WUFFL0MsTUFBTSxlQUFlLENBQUMsT0FBTyxDQUFDLFNBQVMsRUFBRSxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUVqRSxNQUFNLGFBQWEsR0FBRyxTQUFTLENBQUMsT0FBTyxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNwRixNQUFNLENBQUMsS0FBSyxDQUFDLGFBQWEsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLG1EQUFtRCxDQUFDLENBQUM7WUFFM0YsTUFBTSxVQUFVLEdBQUcsV0FBVyxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsUUFBUSxDQUFDLENBQUM7WUFDakUsTUFBTSxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxpQ0FBaUMsQ0FBQyxDQUFDO1lBRXRFLE1BQU0sTUFBTSxHQUFHLFdBQVcsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDbkQsTUFBTSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSw4QkFBOEIsQ0FBQyxDQUFDO1lBRS9ELE1BQU0sQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxjQUFjLENBQUMsQ0FBQztZQUN2RSxNQUFNLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsY0FBYyxDQUFDLENBQUM7WUFFaEUsTUFBTSxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLGNBQWMsQ0FBQyxDQUFDO1lBQ3ZFLE1BQU0sQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxjQUFjLENBQUMsQ0FBQztZQUVoRSxNQUFNLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsY0FBYyxDQUFDLENBQUM7WUFDdkUsTUFBTSxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLGNBQWMsQ0FBQyxDQUFDO1FBQ2pFLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHVFQUF1RSxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQ3hGLE1BQU0sY0FBYyxHQUFHLHFCQUFxQixDQUFDO1lBQzdDLE1BQU0sVUFBVSxHQUFHLElBQUksY0FBYyxFQUFFLENBQUM7WUFDeEMsTUFBTSxhQUFhLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUUzQyx1QkFBdUIsQ0FBQyxZQUFZLENBQUMsYUFBYSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUM7WUFFbkUsaUJBQWlCLENBQUMsb0JBQW9CLENBQUMsb0NBQW9DLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFFbkYsaUJBQWlCLENBQUMsb0JBQW9CLENBQUMsa0NBQWtDLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFFakYsaUJBQWlCLENBQUMsb0JBQW9CLENBQUMsYUFBYSxDQUFDLG1CQUFtQixFQUFFO2dCQUN6RSxDQUFDLG9CQUFvQixDQUFDLEVBQUUsSUFBSTthQUM1QixDQUFDLENBQUM7WUFFSCxNQUFNLFNBQVMsQ0FBQyxXQUFXLEVBQUU7Z0JBQzVCO29CQUNDLElBQUksRUFBRSxHQUFHLFVBQVUsdUNBQXVDO29CQUMxRCxRQUFRLEVBQUU7d0JBQ1QsS0FBSzt3QkFDTCwrQkFBK0I7d0JBQy9CLEtBQUs7d0JBQ0wsb0JBQW9CO3FCQUNwQjtpQkFDRDthQUNELENBQUMsQ0FBQztZQUVILE1BQU0sZUFBZSxHQUFHLFlBQVksQ0FBQyxjQUFjLENBQ2xELDRCQUE0QixFQUM1QixZQUFZLENBQUMsS0FBSyxFQUNsQixFQUFFLG9CQUFvQixFQUFFLElBQUksRUFBRSxFQUM5QixDQUFDLEdBQUcsQ0FBQyxDQUNMLENBQUM7WUFDRixNQUFNLFNBQVMsR0FBRyxJQUFJLHNCQUFzQixFQUFFLENBQUM7WUFFL0MsTUFBTSxlQUFlLENBQUMsT0FBTyxDQUFDLFNBQVMsRUFBRSxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUVqRSxNQUFNLGFBQWEsR0FBRyxTQUFTLENBQUMsT0FBTyxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNwRixNQUFNLENBQUMsS0FBSyxDQUFDLGFBQWEsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLG1EQUFtRCxDQUFDLENBQUM7WUFFM0YsTUFBTSxVQUFVLEdBQUcsV0FBVyxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsUUFBUSxDQUFDLENBQUM7WUFDakUsTUFBTSxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxpQ0FBaUMsQ0FBQyxDQUFDO1lBRXRFLE1BQU0sTUFBTSxHQUFHLFdBQVcsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDbkQsTUFBTSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSx5REFBeUQsQ0FBQyxDQUFDO1lBRTFGLGtFQUFrRTtZQUNsRSxNQUFNLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsdUJBQXVCLENBQUMsQ0FBQztZQUV6RSxNQUFNLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsY0FBYyxDQUFDLENBQUM7WUFDaEUsTUFBTSxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLGNBQWMsQ0FBQyxDQUFDO1FBQ3hFLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHdFQUF3RSxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQ3pGLHVCQUF1QixDQUFDLFlBQVksQ0FBQyxhQUFhLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFFL0UsMkRBQTJEO1lBRTNELGlCQUFpQixDQUFDLG9CQUFvQixDQUFDLGtDQUFrQyxFQUFFLElBQUksQ0FBQyxDQUFDO1lBRWpGLE1BQU0sZUFBZSxHQUFHLFlBQVksQ0FBQyxjQUFjLENBQ2xELDRCQUE0QixFQUM1QixZQUFZLENBQUMsS0FBSyxFQUNsQixFQUFFLG9CQUFvQixFQUFFLElBQUksRUFBRSxFQUM5QixDQUFDLEdBQUcsQ0FBQyxDQUNMLENBQUM7WUFDRixNQUFNLFNBQVMsR0FBRyxJQUFJLHNCQUFzQixFQUFFLENBQUM7WUFFL0MsTUFBTSxlQUFlLENBQUMsT0FBTyxDQUFDLFNBQVMsRUFBRSxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUVqRSxNQUFNLGFBQWEsR0FBRyxTQUFTLENBQUMsT0FBTyxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNwRixNQUFNLENBQUMsS0FBSyxDQUFDLGFBQWEsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLG1EQUFtRCxDQUFDLENBQUM7WUFFM0YsTUFBTSxVQUFVLEdBQUcsV0FBVyxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsUUFBUSxDQUFDLENBQUM7WUFDakUsTUFBTSxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxpQ0FBaUMsQ0FBQyxDQUFDO1lBRXRFLE1BQU0sTUFBTSxHQUFHLFdBQVcsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDbkQsTUFBTSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxtQ0FBbUMsQ0FBQyxDQUFDO1lBQ3BFLE1BQU0sQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSx1QkFBdUIsQ0FBQyxDQUFDO1FBQzFFLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHlEQUF5RCxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQzFFLE1BQU0sY0FBYyxHQUFHLGtCQUFrQixDQUFDO1lBQzFDLE1BQU0sVUFBVSxHQUFHLElBQUksY0FBYyxFQUFFLENBQUM7WUFDeEMsTUFBTSxhQUFhLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUUzQyx1QkFBdUIsQ0FBQyxZQUFZLENBQUMsYUFBYSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUM7WUFFbkUscUNBQXFDO1lBQ3JDLGlCQUFpQixDQUFDLG9CQUFvQixDQUFDLGFBQWEsQ0FBQyxnQkFBZ0IsRUFBRSxJQUFJLENBQUMsQ0FBQztZQUU3RSxNQUFNLFNBQVMsQ0FBQyxXQUFXLEVBQUU7Z0JBQzVCO29CQUNDLElBQUksRUFBRSxHQUFHLFVBQVUscUNBQXFDO29CQUN4RCxRQUFRLEVBQUU7d0JBQ1QsS0FBSzt3QkFDTCxzQkFBc0I7d0JBQ3RCLDRDQUE0Qzt3QkFDNUMsS0FBSzt3QkFDTCwwQkFBMEI7cUJBQzFCO2lCQUNEO2dCQUNEO29CQUNDLElBQUksRUFBRSxHQUFHLFVBQVUscUNBQXFDO29CQUN4RCxRQUFRLEVBQUU7d0JBQ1QsS0FBSzt3QkFDTCxzQkFBc0I7d0JBQ3RCLDRDQUE0Qzt3QkFDNUMsS0FBSzt3QkFDTCwwQkFBMEI7cUJBQzFCO2lCQUNEO2FBQ0QsQ0FBQyxDQUFDO1lBRUgsTUFBTSxlQUFlLEdBQUcsWUFBWSxDQUFDLGNBQWMsQ0FDbEQsNEJBQTRCLEVBQzVCLFlBQVksQ0FBQyxLQUFLLEVBQ2xCLEVBQUUsaUJBQWlCLEVBQUUsSUFBSSxFQUFFLEVBQUUsdUJBQXVCO1lBQ3BELFNBQVMsQ0FDVCxDQUFDO1lBQ0YsTUFBTSxTQUFTLEdBQUcsSUFBSSxzQkFBc0IsRUFBRSxDQUFDO1lBRS9DLE1BQU0sZUFBZSxDQUFDLE9BQU8sQ0FBQyxTQUFTLEVBQUUsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUM7WUFFakUsTUFBTSxhQUFhLEdBQUcsU0FBUyxDQUFDLE9BQU8sRUFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDcEYsTUFBTSxDQUFDLEtBQUssQ0FBQyxhQUFhLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxtREFBbUQsQ0FBQyxDQUFDO1lBRTNGLE1BQU0sVUFBVSxHQUFHLFdBQVcsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFLFFBQVEsQ0FBQyxDQUFDO1lBQ2pFLE1BQU0sQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsaUNBQWlDLENBQUMsQ0FBQztZQUV0RSxNQUFNLE1BQU0sR0FBRyxXQUFXLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQ25ELE1BQU0sQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsNEJBQTRCLENBQUMsQ0FBQztZQUU3RCxNQUFNLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsMkJBQTJCLENBQUMsQ0FBQztZQUNwRixNQUFNLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsV0FBVyxDQUFDLEdBQUcsVUFBVSxxQ0FBcUMsQ0FBQyxDQUFDLENBQUM7WUFDakgsTUFBTSxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLFlBQVksQ0FBQyxDQUFDO1lBRTlELE1BQU0sQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSwyQkFBMkIsQ0FBQyxDQUFDO1lBQ3BGLE1BQU0sQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxXQUFXLENBQUMsR0FBRyxVQUFVLHFDQUFxQyxDQUFDLENBQUMsQ0FBQztZQUNqSCxNQUFNLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsWUFBWSxDQUFDLENBQUM7UUFDL0QsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsK0RBQStELEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDaEYsTUFBTSxjQUFjLEdBQUcscUJBQXFCLENBQUM7WUFDN0MsTUFBTSxVQUFVLEdBQUcsSUFBSSxjQUFjLEVBQUUsQ0FBQztZQUN4QyxNQUFNLGFBQWEsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBRTNDLHVCQUF1QixDQUFDLFlBQVksQ0FBQyxhQUFhLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQztZQUVuRSxxQ0FBcUM7WUFDckMsaUJBQWlCLENBQUMsb0JBQW9CLENBQUMsYUFBYSxDQUFDLGdCQUFnQixFQUFFLElBQUksQ0FBQyxDQUFDO1lBRTdFLE1BQU0sU0FBUyxDQUFDLFdBQVcsRUFBRTtnQkFDNUI7b0JBQ0MsSUFBSSxFQUFFLEdBQUcsVUFBVSxxQ0FBcUM7b0JBQ3hELFFBQVEsRUFBRTt3QkFDVCxLQUFLO3dCQUNMLDRDQUE0Qzt3QkFDNUMsS0FBSzt3QkFDTCwwQkFBMEI7cUJBQzFCO2lCQUNEO2FBQ0QsQ0FBQyxDQUFDO1lBRUgsTUFBTSxlQUFlLEdBQUcsWUFBWSxDQUFDLGNBQWMsQ0FDbEQsNEJBQTRCLEVBQzVCLFlBQVksQ0FBQyxLQUFLLEVBQ2xCLFNBQVMsRUFBRSxxQkFBcUI7WUFDaEMsU0FBUyxDQUNULENBQUM7WUFDRixNQUFNLFNBQVMsR0FBRyxJQUFJLHNCQUFzQixFQUFFLENBQUM7WUFFL0MsTUFBTSxlQUFlLENBQUMsT0FBTyxDQUFDLFNBQVMsRUFBRSxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUVqRSxNQUFNLGFBQWEsR0FBRyxTQUFTLENBQUMsT0FBTyxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNwRixNQUFNLENBQUMsS0FBSyxDQUFDLGFBQWEsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLHFFQUFxRSxDQUFDLENBQUM7UUFDOUcsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsK0RBQStELEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDaEYsTUFBTSxjQUFjLEdBQUcsc0JBQXNCLENBQUM7WUFDOUMsTUFBTSxVQUFVLEdBQUcsSUFBSSxjQUFjLEVBQUUsQ0FBQztZQUN4QyxNQUFNLGFBQWEsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBRTNDLHVCQUF1QixDQUFDLFlBQVksQ0FBQyxhQUFhLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQztZQUVuRSxzQ0FBc0M7WUFDdEMsaUJBQWlCLENBQUMsb0JBQW9CLENBQUMsYUFBYSxDQUFDLGdCQUFnQixFQUFFLEtBQUssQ0FBQyxDQUFDO1lBRTlFLE1BQU0sU0FBUyxDQUFDLFdBQVcsRUFBRTtnQkFDNUI7b0JBQ0MsSUFBSSxFQUFFLEdBQUcsVUFBVSxxQ0FBcUM7b0JBQ3hELFFBQVEsRUFBRTt3QkFDVCxLQUFLO3dCQUNMLDRDQUE0Qzt3QkFDNUMsS0FBSzt3QkFDTCwwQkFBMEI7cUJBQzFCO2lCQUNEO2FBQ0QsQ0FBQyxDQUFDO1lBRUgsTUFBTSxlQUFlLEdBQUcsWUFBWSxDQUFDLGNBQWMsQ0FDbEQsNEJBQTRCLEVBQzVCLFlBQVksQ0FBQyxLQUFLLEVBQ2xCLEVBQUUsaUJBQWlCLEVBQUUsSUFBSSxFQUFFLEVBQUUsdUJBQXVCO1lBQ3BELFNBQVMsQ0FDVCxDQUFDO1lBQ0YsTUFBTSxTQUFTLEdBQUcsSUFBSSxzQkFBc0IsRUFBRSxDQUFDO1lBRS9DLE1BQU0sZUFBZSxDQUFDLE9BQU8sQ0FBQyxTQUFTLEVBQUUsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUM7WUFFakUsTUFBTSxhQUFhLEdBQUcsU0FBUyxDQUFDLE9BQU8sRUFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDcEYsTUFBTSxDQUFDLEtBQUssQ0FBQyxhQUFhLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxxRUFBcUUsQ0FBQyxDQUFDO1FBQzlHLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHVEQUF1RCxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQ3hFLE1BQU0sY0FBYyxHQUFHLGtCQUFrQixDQUFDO1lBQzFDLE1BQU0sVUFBVSxHQUFHLElBQUksY0FBYyxFQUFFLENBQUM7WUFDeEMsTUFBTSxhQUFhLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUUzQyx1QkFBdUIsQ0FBQyxZQUFZLENBQUMsYUFBYSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUM7WUFFbkUscUNBQXFDO1lBQ3JDLGlCQUFpQixDQUFDLG9CQUFvQixDQUFDLGFBQWEsQ0FBQyxnQkFBZ0IsRUFBRSxJQUFJLENBQUMsQ0FBQztZQUM3RSx5REFBeUQ7WUFDekQsaUJBQWlCLENBQUMsb0JBQW9CLENBQUMsYUFBYSxDQUFDLG1CQUFtQixFQUFFO2dCQUN6RSxnQkFBZ0IsRUFBRSxLQUFLO2dCQUN2QixnQkFBZ0IsRUFBRSxLQUFLO2FBQ3ZCLENBQUMsQ0FBQztZQUVILE1BQU0sU0FBUyxDQUFDLFdBQVcsRUFBRTtnQkFDNUIsMkRBQTJEO2dCQUMzRDtvQkFDQyxJQUFJLEVBQUUsb0RBQW9EO29CQUMxRCxRQUFRLEVBQUU7d0JBQ1QsS0FBSzt3QkFDTCwwQkFBMEI7d0JBQzFCLG9EQUFvRDt3QkFDcEQsS0FBSzt3QkFDTCx3QkFBd0I7cUJBQ3hCO2lCQUNEO2dCQUNEO29CQUNDLElBQUksRUFBRSxvREFBb0Q7b0JBQzFELFFBQVEsRUFBRTt3QkFDVCxLQUFLO3dCQUNMLDJCQUEyQjt3QkFDM0IsMENBQTBDO3dCQUMxQyxLQUFLO3dCQUNMLCtCQUErQjtxQkFDL0I7aUJBQ0Q7YUFDRCxDQUFDLENBQUM7WUFFSCxNQUFNLGVBQWUsR0FBRyxZQUFZLENBQUMsY0FBYyxDQUNsRCw0QkFBNEIsRUFDNUIsWUFBWSxDQUFDLEtBQUssRUFDbEIsRUFBRSxpQkFBaUIsRUFBRSxJQUFJLEVBQUUsRUFBRSx1QkFBdUI7WUFDcEQsU0FBUyxDQUNULENBQUM7WUFDRixNQUFNLFNBQVMsR0FBRyxJQUFJLHNCQUFzQixFQUFFLENBQUM7WUFFL0MsTUFBTSxlQUFlLENBQUMsT0FBTyxDQUFDLFNBQVMsRUFBRSxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUVqRSxNQUFNLGFBQWEsR0FBRyxTQUFTLENBQUMsT0FBTyxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNwRixNQUFNLFVBQVUsR0FBRyxXQUFXLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssRUFBRSxRQUFRLENBQUMsQ0FBQztZQUNqRSxNQUFNLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLGlDQUFpQyxDQUFDLENBQUM7WUFFdEUsTUFBTSxNQUFNLEdBQUcsV0FBVyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsRUFBRSxPQUFPLENBQUMsQ0FBQztZQUNuRCxNQUFNLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLDRCQUE0QixDQUFDLENBQUM7WUFFN0QsTUFBTSxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLG1DQUFtQyxDQUFDLENBQUM7WUFDNUYsTUFBTSxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLFdBQVcsQ0FBQyxvREFBb0QsQ0FBQyxDQUFDLENBQUM7WUFDbkgsTUFBTSxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLGdCQUFnQixDQUFDLENBQUM7WUFFbEUsTUFBTSxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLHlCQUF5QixDQUFDLENBQUM7WUFDbEYsTUFBTSxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLFdBQVcsQ0FBQyxvREFBb0QsQ0FBQyxDQUFDLENBQUM7WUFDbkgsTUFBTSxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLGlCQUFpQixDQUFDLENBQUM7UUFDcEUsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMseUZBQXlGLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDMUcsTUFBTSxjQUFjLEdBQUcsOEJBQThCLENBQUM7WUFDdEQsTUFBTSxVQUFVLEdBQUcsSUFBSSxjQUFjLEVBQUUsQ0FBQztZQUN4QyxNQUFNLGFBQWEsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBRTNDLHVCQUF1QixDQUFDLFlBQVksQ0FBQyxhQUFhLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQztZQUVuRSxxQ0FBcUM7WUFDckMsaUJBQWlCLENBQUMsb0JBQW9CLENBQUMsYUFBYSxDQUFDLGdCQUFnQixFQUFFLElBQUksQ0FBQyxDQUFDO1lBRTdFLE1BQU0sU0FBUyxDQUFDLFdBQVcsRUFBRTtnQkFDNUI7b0JBQ0Msb0VBQW9FO29CQUNwRSxJQUFJLEVBQUUsR0FBRyxVQUFVLHdDQUF3QztvQkFDM0QsUUFBUSxFQUFFO3dCQUNULEtBQUs7d0JBQ0wseUNBQXlDO3dCQUN6QyxLQUFLO3dCQUNMLDRCQUE0QjtxQkFDNUI7aUJBQ0Q7Z0JBQ0Q7b0JBQ0MsaUVBQWlFO29CQUNqRSxJQUFJLEVBQUUsR0FBRyxVQUFVLHdDQUF3QztvQkFDM0QsUUFBUSxFQUFFO3dCQUNULEtBQUs7d0JBQ0wseUJBQXlCO3dCQUN6QixLQUFLO3dCQUNMLG1DQUFtQztxQkFDbkM7aUJBQ0Q7Z0JBQ0Q7b0JBQ0MseUVBQXlFO29CQUN6RSxJQUFJLEVBQUUsR0FBRyxVQUFVLHdDQUF3QztvQkFDM0QsUUFBUSxFQUFFO3dCQUNULEtBQUs7d0JBQ0wsMkJBQTJCO3dCQUMzQiwrQ0FBK0M7d0JBQy9DLEtBQUs7d0JBQ0wsb0NBQW9DO3FCQUNwQztpQkFDRDthQUNELENBQUMsQ0FBQztZQUVILE1BQU0sZUFBZSxHQUFHLFlBQVksQ0FBQyxjQUFjLENBQ2xELDRCQUE0QixFQUM1QixZQUFZLENBQUMsS0FBSyxFQUNsQixFQUFFLGlCQUFpQixFQUFFLElBQUksRUFBRSxFQUFFLHVCQUF1QjtZQUNwRCxTQUFTLENBQ1QsQ0FBQztZQUNGLE1BQU0sU0FBUyxHQUFHLElBQUksc0JBQXNCLEVBQUUsQ0FBQztZQUUvQyxNQUFNLGVBQWUsQ0FBQyxPQUFPLENBQUMsU0FBUyxFQUFFLGlCQUFpQixDQUFDLElBQUksQ0FBQyxDQUFDO1lBRWpFLE1BQU0sYUFBYSxHQUFHLFNBQVMsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3BGLE1BQU0sQ0FBQyxLQUFLLENBQUMsYUFBYSxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsbURBQW1ELENBQUMsQ0FBQztZQUUzRixNQUFNLFVBQVUsR0FBRyxXQUFXLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssRUFBRSxRQUFRLENBQUMsQ0FBQztZQUNqRSxNQUFNLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLGlDQUFpQyxDQUFDLENBQUM7WUFFdEUsTUFBTSxNQUFNLEdBQUcsV0FBVyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsRUFBRSxPQUFPLENBQUMsQ0FBQztZQUNuRCxNQUFNLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLHlFQUF5RSxDQUFDLENBQUM7WUFFMUcsNkRBQTZEO1lBQzdELE1BQU0sQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxlQUFlLENBQUMsQ0FBQztZQUNqRSxNQUFNLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsd0JBQXdCLENBQUMsQ0FBQztZQUNqRixNQUFNLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsV0FBVyxDQUFDLEdBQUcsVUFBVSx3Q0FBd0MsQ0FBQyxDQUFDLENBQUM7WUFFcEgsd0RBQXdEO1lBQ3hELE1BQU0sQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxlQUFlLENBQUMsQ0FBQztZQUNqRSxNQUFNLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsYUFBYSxDQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxvQ0FBb0MsQ0FBQyxDQUFDO1lBQ3BHLE1BQU0sQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxXQUFXLENBQUMsR0FBRyxVQUFVLHdDQUF3QyxDQUFDLENBQUMsQ0FBQztZQUVwSCxvREFBb0Q7WUFDcEQsTUFBTSxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLGVBQWUsQ0FBQyxDQUFDO1lBQ2pFLE1BQU0sQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSw4QkFBOEIsQ0FBQyxDQUFDO1lBQ3ZGLE1BQU0sQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxXQUFXLENBQUMsR0FBRyxVQUFVLHdDQUF3QyxDQUFDLENBQUMsQ0FBQztRQUNySCxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsS0FBSyxDQUFDLFlBQVksRUFBRSxHQUFHLEVBQUU7UUFDeEIsSUFBSSxDQUFDLCtCQUErQixFQUFFLEtBQUssSUFBSSxFQUFFO1lBQ2hELE1BQU0sY0FBYyxHQUFHLGlCQUFpQixDQUFDO1lBQ3pDLE1BQU0sVUFBVSxHQUFHLElBQUksY0FBYyxFQUFFLENBQUM7WUFDeEMsTUFBTSxhQUFhLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUUzQyx1QkFBdUIsQ0FBQyxZQUFZLENBQUMsYUFBYSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUM7WUFFbkUsTUFBTSxlQUFlLEdBQUcsWUFBWSxDQUFDLGNBQWMsQ0FBQyw0QkFBNEIsRUFBRSxZQUFZLENBQUMsS0FBSyxFQUFFLFNBQVMsRUFBRSxTQUFTLENBQUMsQ0FBQztZQUM1SCxNQUFNLFNBQVMsR0FBRyxJQUFJLHNCQUFzQixFQUFFLENBQUM7WUFFL0MsTUFBTSxlQUFlLENBQUMsT0FBTyxDQUFDLFNBQVMsRUFBRSxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUVqRSxnREFBZ0Q7WUFDaEQsTUFBTSxDQUFDLEVBQUUsQ0FBQyxJQUFJLEVBQUUsOENBQThDLENBQUMsQ0FBQztRQUNqRSxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQywyQ0FBMkMsRUFBRSxLQUFLLElBQUksRUFBRTtZQUM1RCxNQUFNLGNBQWMsR0FBRyxnQkFBZ0IsQ0FBQztZQUN4QyxNQUFNLFVBQVUsR0FBRyxJQUFJLGNBQWMsRUFBRSxDQUFDO1lBQ3hDLE1BQU0sYUFBYSxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7WUFFM0MsdUJBQXVCLENBQUMsWUFBWSxDQUFDLGFBQWEsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDO1lBRW5FLE1BQU0sU0FBUyxDQUFDLFdBQVcsRUFBRTtnQkFDNUI7b0JBQ0MsSUFBSSxFQUFFLEdBQUcsVUFBVSxpREFBaUQ7b0JBQ3BFLFFBQVEsRUFBRTt3QkFDVCxLQUFLO3dCQUNMLHlCQUF5Qjt3QkFDekIsS0FBSzt3QkFDTCxTQUFTO3FCQUNUO2lCQUNEO2dCQUNEO29CQUNDLElBQUksRUFBRSxHQUFHLFVBQVUsY0FBYztvQkFDakMsUUFBUSxFQUFFLENBQUMsTUFBTSxDQUFDO2lCQUNsQjthQUNELENBQUMsQ0FBQztZQUVILE1BQU0sZUFBZSxHQUFHLFlBQVksQ0FBQyxjQUFjLENBQUMsNEJBQTRCLEVBQUUsWUFBWSxDQUFDLEtBQUssRUFBRSxTQUFTLEVBQUUsU0FBUyxDQUFDLENBQUM7WUFDNUgsTUFBTSxTQUFTLEdBQUcsSUFBSSxzQkFBc0IsRUFBRSxDQUFDO1lBQy9DLFNBQVMsQ0FBQyxHQUFHLENBQUMsbUJBQW1CLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxhQUFhLEVBQUUsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRS9FLG1CQUFtQjtZQUNuQixNQUFNLGVBQWUsQ0FBQyxPQUFPLENBQUMsU0FBUyxFQUFFLGlCQUFpQixDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ2pFLE1BQU0sQ0FBQyxFQUFFLENBQUMsSUFBSSxFQUFFLHNEQUFzRCxDQUFDLENBQUM7UUFDekUsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsNEJBQTRCLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDN0MsTUFBTSxjQUFjLEdBQUcsbUJBQW1CLENBQUM7WUFDM0MsTUFBTSxVQUFVLEdBQUcsSUFBSSxjQUFjLEVBQUUsQ0FBQztZQUN4QyxNQUFNLGFBQWEsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBRTNDLHVCQUF1QixDQUFDLFlBQVksQ0FBQyxhQUFhLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQztZQUVuRSxNQUFNLFNBQVMsQ0FBQyxXQUFXLEVBQUU7Z0JBQzVCO29CQUNDLElBQUksRUFBRSxHQUFHLFVBQVUsY0FBYztvQkFDakMsUUFBUSxFQUFFLENBQUMsTUFBTSxDQUFDO2lCQUNsQjthQUNELENBQUMsQ0FBQztZQUVILE1BQU0sZUFBZSxHQUFHLFlBQVksQ0FBQyxjQUFjLENBQUMsNEJBQTRCLEVBQUUsWUFBWSxDQUFDLEtBQUssRUFBRSxTQUFTLEVBQUUsU0FBUyxDQUFDLENBQUM7WUFDNUgsTUFBTSxTQUFTLEdBQUcsSUFBSSxzQkFBc0IsRUFBRSxDQUFDO1lBQy9DLFNBQVMsQ0FBQyxHQUFHLENBQUMsbUJBQW1CLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxhQUFhLEVBQUUsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRS9FLDJCQUEyQjtZQUMzQixNQUFNLGNBQWMsR0FBc0I7Z0JBQ3pDLHVCQUF1QixFQUFFLElBQUk7Z0JBQzdCLHVCQUF1QixFQUFFLEtBQUssQ0FBQyxJQUFJO2FBQ25DLENBQUM7WUFFRix3Q0FBd0M7WUFDeEMsTUFBTSxlQUFlLENBQUMsT0FBTyxDQUFDLFNBQVMsRUFBRSxjQUFjLENBQUMsQ0FBQztZQUN6RCxNQUFNLENBQUMsRUFBRSxDQUFDLElBQUksRUFBRSwyQ0FBMkMsQ0FBQyxDQUFDO1FBQzlELENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsdUNBQXVDLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDeEQsTUFBTSxjQUFjLEdBQUcscUJBQXFCLENBQUM7UUFDN0MsTUFBTSxVQUFVLEdBQUcsSUFBSSxjQUFjLEVBQUUsQ0FBQztRQUN4QyxNQUFNLGFBQWEsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBRTNDLHVCQUF1QixDQUFDLFlBQVksQ0FBQyxhQUFhLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQztRQUVuRSxNQUFNLFNBQVMsQ0FBQyxXQUFXLEVBQUU7WUFDNUI7Z0JBQ0MsSUFBSSxFQUFFLEdBQUcsVUFBVSxZQUFZO2dCQUMvQixRQUFRLEVBQUU7b0JBQ1QsbUJBQW1CO2lCQUNuQjthQUNEO1lBQ0Q7Z0JBQ0MsSUFBSSxFQUFFLEdBQUcsVUFBVSxjQUFjO2dCQUNqQyxRQUFRLEVBQUU7b0JBQ1Qsc0JBQXNCO2lCQUN0QjthQUNEO1NBQ0QsQ0FBQyxDQUFDO1FBRUgsa0NBQWtDO1FBQ2xDLGlCQUFpQixDQUFDLG9CQUFvQixDQUFDLGFBQWEsQ0FBQyxhQUFhLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDMUUsTUFBTSxlQUFlLEdBQUcsWUFBWSxDQUFDLGNBQWMsQ0FBQyw0QkFBNEIsRUFBRSxZQUFZLENBQUMsS0FBSyxFQUFFLFNBQVMsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUM1SCxNQUFNLFNBQVMsR0FBRyxJQUFJLHNCQUFzQixFQUFFLENBQUM7UUFDL0MsU0FBUyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLGFBQWEsRUFBRSxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFL0UsTUFBTSxlQUFlLENBQUMsT0FBTyxDQUFDLFNBQVMsRUFBRSxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUVqRSxJQUFJLGdCQUFnQixHQUFHLFNBQVMsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3JGLElBQUksS0FBSyxHQUFHLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDL0YsTUFBTSxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLEdBQUcsVUFBVSxZQUFZLENBQUMsRUFBRSx1Q0FBdUMsQ0FBQyxDQUFDO1FBRTlGLG1DQUFtQztRQUNuQyxpQkFBaUIsQ0FBQyxvQkFBb0IsQ0FBQyxhQUFhLENBQUMsYUFBYSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzNFLE1BQU0sZ0JBQWdCLEdBQUcsWUFBWSxDQUFDLGNBQWMsQ0FBQyw0QkFBNEIsRUFBRSxZQUFZLENBQUMsS0FBSyxFQUFFLFNBQVMsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUM3SCxNQUFNLFVBQVUsR0FBRyxJQUFJLHNCQUFzQixFQUFFLENBQUM7UUFDaEQsVUFBVSxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLGFBQWEsRUFBRSxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFaEYsTUFBTSxnQkFBZ0IsQ0FBQyxPQUFPLENBQUMsVUFBVSxFQUFFLGlCQUFpQixDQUFDLElBQUksQ0FBQyxDQUFDO1FBRW5FLGdCQUFnQixHQUFHLFVBQVUsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ2xGLEtBQUssR0FBRyxnQkFBZ0IsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQzNGLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLEdBQUcsVUFBVSxZQUFZLENBQUMsRUFBRSw0Q0FBNEMsQ0FBQyxDQUFDO0lBQ3JHLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLCtDQUErQyxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ2hFLE1BQU0sY0FBYyxHQUFHLHFCQUFxQixDQUFDO1FBQzdDLE1BQU0sVUFBVSxHQUFHLElBQUksY0FBYyxFQUFFLENBQUM7UUFDeEMsTUFBTSxhQUFhLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUUzQyx1QkFBdUIsQ0FBQyxZQUFZLENBQUMsYUFBYSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUM7UUFFbkUsTUFBTSxTQUFTLENBQUMsV0FBVyxFQUFFO1lBQzVCO2dCQUNDLElBQUksRUFBRSxHQUFHLFVBQVUsb0JBQW9CO2dCQUN2QyxRQUFRLEVBQUU7b0JBQ1QsbUJBQW1CO2lCQUNuQjthQUNEO1lBQ0Q7Z0JBQ0MsSUFBSSxFQUFFLEdBQUcsVUFBVSxjQUFjO2dCQUNqQyxRQUFRLEVBQUU7b0JBQ1Qsc0JBQXNCO2lCQUN0QjthQUNEO1NBQ0QsQ0FBQyxDQUFDO1FBRUgsa0NBQWtDO1FBQ2xDLGlCQUFpQixDQUFDLG9CQUFvQixDQUFDLGFBQWEsQ0FBQyxhQUFhLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDMUUsTUFBTSxlQUFlLEdBQUcsWUFBWSxDQUFDLGNBQWMsQ0FBQyw0QkFBNEIsRUFBRSxZQUFZLENBQUMsS0FBSyxFQUFFLFNBQVMsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUM1SCxNQUFNLFNBQVMsR0FBRyxJQUFJLHNCQUFzQixFQUFFLENBQUM7UUFDL0MsU0FBUyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLGFBQWEsRUFBRSxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFL0UsTUFBTSxlQUFlLENBQUMsT0FBTyxDQUFDLFNBQVMsRUFBRSxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUVqRSxJQUFJLGdCQUFnQixHQUFHLFNBQVMsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3JGLElBQUksS0FBSyxHQUFHLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDL0YsTUFBTSxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLEdBQUcsVUFBVSxvQkFBb0IsQ0FBQyxFQUFFLCtDQUErQyxDQUFDLENBQUM7UUFFOUcsbUNBQW1DO1FBQ25DLGlCQUFpQixDQUFDLG9CQUFvQixDQUFDLGFBQWEsQ0FBQyxhQUFhLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDM0UsTUFBTSxnQkFBZ0IsR0FBRyxZQUFZLENBQUMsY0FBYyxDQUFDLDRCQUE0QixFQUFFLFlBQVksQ0FBQyxLQUFLLEVBQUUsU0FBUyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQzdILE1BQU0sVUFBVSxHQUFHLElBQUksc0JBQXNCLEVBQUUsQ0FBQztRQUNoRCxVQUFVLENBQUMsR0FBRyxDQUFDLG1CQUFtQixDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsYUFBYSxFQUFFLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVoRixNQUFNLGdCQUFnQixDQUFDLE9BQU8sQ0FBQyxVQUFVLEVBQUUsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUM7UUFFbkUsZ0JBQWdCLEdBQUcsVUFBVSxDQUFDLE9BQU8sRUFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDbEYsS0FBSyxHQUFHLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDM0YsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsR0FBRyxVQUFVLG9CQUFvQixDQUFDLEVBQUUsb0RBQW9ELENBQUMsQ0FBQztJQUNySCxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxrR0FBa0csRUFBRSxLQUFLLElBQUksRUFBRTtRQUNuSCxNQUFNLGdCQUFnQixHQUFHLDRCQUE0QixDQUFDO1FBQ3RELE1BQU0sWUFBWSxHQUFHLElBQUksZ0JBQWdCLEVBQUUsQ0FBQztRQUM1QyxNQUFNLFVBQVUsR0FBRyxHQUFHLFlBQVksT0FBTyxDQUFDO1FBQzFDLE1BQU0sYUFBYSxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7UUFFM0MsdUJBQXVCLENBQUMsWUFBWSxDQUFDLGFBQWEsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDO1FBRW5FLE1BQU0sU0FBUyxDQUFDLFdBQVcsRUFBRTtZQUM1QjtnQkFDQyxJQUFJLEVBQUUsR0FBRyxZQUFZLFlBQVk7Z0JBQ2pDLFFBQVEsRUFBRSxDQUFDLHNCQUFzQixDQUFDO2FBQ2xDO1lBQ0Q7Z0JBQ0MsSUFBSSxFQUFFLEdBQUcsWUFBWSxZQUFZO2dCQUNqQyxRQUFRLEVBQUUsQ0FBQywwQkFBMEIsQ0FBQzthQUN0QztZQUNEO2dCQUNDLElBQUksRUFBRSxHQUFHLFlBQVksb0JBQW9CO2dCQUN6QyxRQUFRLEVBQUUsQ0FBQyxrQ0FBa0MsQ0FBQzthQUM5QztZQUNEO2dCQUNDLElBQUksRUFBRSxHQUFHLFVBQVUsY0FBYztnQkFDakMsUUFBUSxFQUFFLENBQUMsc0JBQXNCLENBQUM7YUFDbEM7U0FDRCxDQUFDLENBQUM7UUFFSCxpQkFBaUIsQ0FBQyxvQkFBb0IsQ0FBQyxhQUFhLENBQUMsYUFBYSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQzFFLGlCQUFpQixDQUFDLG9CQUFvQixDQUFDLGFBQWEsQ0FBQyxrQ0FBa0MsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUVoRyxNQUFNLHFCQUFxQixDQUFDLGNBQWMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRXJFLE1BQU0sNkJBQTZCLEdBQUcsWUFBWSxDQUFDLGNBQWMsQ0FBQyw0QkFBNEIsRUFBRSxZQUFZLENBQUMsS0FBSyxFQUFFLFNBQVMsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUMxSSxNQUFNLHVCQUF1QixHQUFHLElBQUksc0JBQXNCLEVBQUUsQ0FBQztRQUM3RCx1QkFBdUIsQ0FBQyxHQUFHLENBQUMsbUJBQW1CLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxhQUFhLEVBQUUsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRTdGLE1BQU0sNkJBQTZCLENBQUMsT0FBTyxDQUFDLHVCQUF1QixFQUFFLGlCQUFpQixDQUFDLElBQUksQ0FBQyxDQUFDO1FBRTdGLElBQUksS0FBSyxHQUFHLHVCQUF1QixDQUFDLE9BQU8sRUFBRTthQUMzQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQzthQUN6QyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ3BFLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLEdBQUcsWUFBWSxZQUFZLENBQUMsRUFBRSxvRUFBb0UsQ0FBQyxDQUFDO1FBQzlILE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLEdBQUcsWUFBWSxvQkFBb0IsQ0FBQyxFQUFFLDRFQUE0RSxDQUFDLENBQUM7UUFFOUksNkdBQTZHO1FBQzdHLGlCQUFpQixDQUFDLG9CQUFvQixDQUFDLGFBQWEsQ0FBQyxrQ0FBa0MsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUUvRixNQUFNLDRCQUE0QixHQUFHLFlBQVksQ0FBQyxjQUFjLENBQUMsNEJBQTRCLEVBQUUsWUFBWSxDQUFDLEtBQUssRUFBRSxTQUFTLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDekksTUFBTSxzQkFBc0IsR0FBRyxJQUFJLHNCQUFzQixFQUFFLENBQUM7UUFDNUQsc0JBQXNCLENBQUMsR0FBRyxDQUFDLG1CQUFtQixDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsYUFBYSxFQUFFLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUU1RixNQUFNLDRCQUE0QixDQUFDLE9BQU8sQ0FBQyxzQkFBc0IsRUFBRSxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUUzRixLQUFLLEdBQUcsc0JBQXNCLENBQUMsT0FBTyxFQUFFO2FBQ3RDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDO2FBQ3pDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDcEUsTUFBTSxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLEdBQUcsWUFBWSxZQUFZLENBQUMsRUFBRSwrREFBK0QsQ0FBQyxDQUFDO1FBQ3hILE1BQU0sQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxHQUFHLFlBQVksb0JBQW9CLENBQUMsRUFBRSx1RUFBdUUsQ0FBQyxDQUFDO0lBQ3pJLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLGtIQUFrSCxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ25JLE1BQU0sZ0JBQWdCLEdBQUcsMkJBQTJCLENBQUM7UUFDckQsTUFBTSxZQUFZLEdBQUcsSUFBSSxnQkFBZ0IsRUFBRSxDQUFDO1FBQzVDLE1BQU0sVUFBVSxHQUFHLEdBQUcsWUFBWSxPQUFPLENBQUM7UUFDMUMsTUFBTSxhQUFhLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUUzQyx1QkFBdUIsQ0FBQyxZQUFZLENBQUMsYUFBYSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUM7UUFFbkUsTUFBTSxTQUFTLENBQUMsV0FBVyxFQUFFO1lBQzVCO2dCQUNDLElBQUksRUFBRSxHQUFHLFlBQVksWUFBWTtnQkFDakMsUUFBUSxFQUFFLENBQUMsc0JBQXNCLENBQUM7YUFDbEM7WUFDRDtnQkFDQyxJQUFJLEVBQUUsR0FBRyxZQUFZLGtDQUFrQztnQkFDdkQsUUFBUSxFQUFFLENBQUMsNkJBQTZCLENBQUM7YUFDekM7WUFDRDtnQkFDQyxJQUFJLEVBQUUsR0FBRyxZQUFZLFlBQVk7Z0JBQ2pDLFFBQVEsRUFBRSxDQUFDLHlCQUF5QixDQUFDO2FBQ3JDO1lBQ0Q7Z0JBQ0MsSUFBSSxFQUFFLEdBQUcsVUFBVSxjQUFjO2dCQUNqQyxRQUFRLEVBQUUsQ0FBQyxzQkFBc0IsQ0FBQzthQUNsQztTQUNELENBQUMsQ0FBQztRQUVILGlCQUFpQixDQUFDLG9CQUFvQixDQUFDLGFBQWEsQ0FBQyw2QkFBNkIsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUMxRixpQkFBaUIsQ0FBQyxvQkFBb0IsQ0FBQyxhQUFhLENBQUMsWUFBWSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3pFLGlCQUFpQixDQUFDLG9CQUFvQixDQUFDLGFBQWEsQ0FBQyxrQ0FBa0MsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUVoRyxNQUFNLHFCQUFxQixDQUFDLGNBQWMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRXJFLE1BQU0sNkJBQTZCLEdBQUcsWUFBWSxDQUFDLGNBQWMsQ0FBQyw0QkFBNEIsRUFBRSxZQUFZLENBQUMsS0FBSyxFQUFFLFNBQVMsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUMxSSxNQUFNLHVCQUF1QixHQUFHLElBQUksc0JBQXNCLEVBQUUsQ0FBQztRQUM3RCx1QkFBdUIsQ0FBQyxHQUFHLENBQUMsbUJBQW1CLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxhQUFhLEVBQUUsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRTdGLE1BQU0sNkJBQTZCLENBQUMsT0FBTyxDQUFDLHVCQUF1QixFQUFFLGlCQUFpQixDQUFDLElBQUksQ0FBQyxDQUFDO1FBRTdGLElBQUksS0FBSyxHQUFHLHVCQUF1QixDQUFDLE9BQU8sRUFBRTthQUMzQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQzthQUN6QyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ3BFLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLEdBQUcsWUFBWSxrQ0FBa0MsQ0FBQyxFQUFFLGtGQUFrRixDQUFDLENBQUM7UUFDbEssTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsR0FBRyxZQUFZLFlBQVksQ0FBQyxFQUFFLG9FQUFvRSxDQUFDLENBQUM7UUFFOUgsaUJBQWlCLENBQUMsb0JBQW9CLENBQUMsYUFBYSxDQUFDLGtDQUFrQyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBRS9GLE1BQU0sNEJBQTRCLEdBQUcsWUFBWSxDQUFDLGNBQWMsQ0FBQyw0QkFBNEIsRUFBRSxZQUFZLENBQUMsS0FBSyxFQUFFLFNBQVMsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUN6SSxNQUFNLHNCQUFzQixHQUFHLElBQUksc0JBQXNCLEVBQUUsQ0FBQztRQUM1RCxzQkFBc0IsQ0FBQyxHQUFHLENBQUMsbUJBQW1CLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxhQUFhLEVBQUUsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRTVGLE1BQU0sNEJBQTRCLENBQUMsT0FBTyxDQUFDLHNCQUFzQixFQUFFLGlCQUFpQixDQUFDLElBQUksQ0FBQyxDQUFDO1FBRTNGLEtBQUssR0FBRyxzQkFBc0IsQ0FBQyxPQUFPLEVBQUU7YUFDdEMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUM7YUFDekMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUNwRSxNQUFNLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsR0FBRyxZQUFZLGtDQUFrQyxDQUFDLEVBQUUsNkVBQTZFLENBQUMsQ0FBQztRQUM1SixNQUFNLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsR0FBRyxZQUFZLFlBQVksQ0FBQyxFQUFFLCtEQUErRCxDQUFDLENBQUM7SUFDekgsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsaURBQWlELEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDbEUsTUFBTSxjQUFjLEdBQUcsMEJBQTBCLENBQUM7UUFDbEQsTUFBTSxVQUFVLEdBQUcsSUFBSSxjQUFjLEVBQUUsQ0FBQztRQUN4QyxNQUFNLGFBQWEsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBRTNDLHVCQUF1QixDQUFDLFlBQVksQ0FBQyxhQUFhLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQztRQUVuRSxNQUFNLFNBQVMsQ0FBQyxXQUFXLEVBQUU7WUFDNUI7Z0JBQ0MsSUFBSSxFQUFFLDhCQUE4QjtnQkFDcEMsUUFBUSxFQUFFO29CQUNULDZCQUE2QjtpQkFDN0I7YUFDRDtZQUNEO2dCQUNDLElBQUksRUFBRSxHQUFHLFVBQVUsY0FBYztnQkFDakMsUUFBUSxFQUFFO29CQUNULHNCQUFzQjtpQkFDdEI7YUFDRDtTQUNELENBQUMsQ0FBQztRQUVILGtDQUFrQztRQUNsQyxpQkFBaUIsQ0FBQyxvQkFBb0IsQ0FBQyxhQUFhLENBQUMsYUFBYSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQzFFLE1BQU0sZUFBZSxHQUFHLFlBQVksQ0FBQyxjQUFjLENBQUMsNEJBQTRCLEVBQUUsWUFBWSxDQUFDLEtBQUssRUFBRSxTQUFTLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDNUgsTUFBTSxTQUFTLEdBQUcsSUFBSSxzQkFBc0IsRUFBRSxDQUFDO1FBQy9DLFNBQVMsQ0FBQyxHQUFHLENBQUMsbUJBQW1CLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxhQUFhLEVBQUUsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRS9FLE1BQU0sZUFBZSxDQUFDLE9BQU8sQ0FBQyxTQUFTLEVBQUUsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUM7UUFFakUsSUFBSSxnQkFBZ0IsR0FBRyxTQUFTLENBQUMsT0FBTyxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNyRixJQUFJLEtBQUssR0FBRyxnQkFBZ0IsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQy9GLE1BQU0sQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyw4QkFBOEIsQ0FBQyxFQUFFLGlEQUFpRCxDQUFDLENBQUM7UUFFN0csbUNBQW1DO1FBQ25DLGlCQUFpQixDQUFDLG9CQUFvQixDQUFDLGFBQWEsQ0FBQyxhQUFhLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDM0UsTUFBTSxnQkFBZ0IsR0FBRyxZQUFZLENBQUMsY0FBYyxDQUFDLDRCQUE0QixFQUFFLFlBQVksQ0FBQyxLQUFLLEVBQUUsU0FBUyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQzdILE1BQU0sVUFBVSxHQUFHLElBQUksc0JBQXNCLEVBQUUsQ0FBQztRQUNoRCxVQUFVLENBQUMsR0FBRyxDQUFDLG1CQUFtQixDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsYUFBYSxFQUFFLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVoRixNQUFNLGdCQUFnQixDQUFDLE9BQU8sQ0FBQyxVQUFVLEVBQUUsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUM7UUFFbkUsZ0JBQWdCLEdBQUcsVUFBVSxDQUFDLE9BQU8sRUFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDbEYsS0FBSyxHQUFHLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDM0YsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsOEJBQThCLENBQUMsRUFBRSxzREFBc0QsQ0FBQyxDQUFDO0lBQ3BILENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHVEQUF1RCxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ3hFLE1BQU0sZUFBZSxHQUFHLGNBQWMsQ0FBQztRQUN2QyxNQUFNLFdBQVcsR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO1FBQzFDLE1BQU0sY0FBYyxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUM7UUFFN0MsTUFBTSxlQUFlLEdBQUcsY0FBYyxDQUFDO1FBQ3ZDLE1BQU0sV0FBVyxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7UUFDMUMsTUFBTSxjQUFjLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUU3Qyx1QkFBdUIsQ0FBQyxZQUFZLENBQUMsYUFBYSxDQUFDLGNBQWMsRUFBRSxjQUFjLENBQUMsQ0FBQyxDQUFDO1FBRXBGLE1BQU0sU0FBUyxDQUFDLFdBQVcsRUFBRTtZQUM1QjtnQkFDQyxJQUFJLEVBQUUsR0FBRyxXQUFXLDBDQUEwQztnQkFDOUQsUUFBUSxFQUFFO29CQUNULEtBQUs7b0JBQ0wsb0JBQW9CO29CQUNwQixLQUFLO29CQUNMLGdCQUFnQjtpQkFDaEI7YUFDRDtZQUNEO2dCQUNDLElBQUksRUFBRSxHQUFHLFdBQVcsMENBQTBDO2dCQUM5RCxRQUFRLEVBQUU7b0JBQ1QsS0FBSztvQkFDTCxvQkFBb0I7b0JBQ3BCLEtBQUs7b0JBQ0wsZ0JBQWdCO2lCQUNoQjthQUNEO1lBQ0Q7Z0JBQ0MsSUFBSSxFQUFFLEdBQUcsV0FBVyxjQUFjO2dCQUNsQyxRQUFRLEVBQUUsQ0FBQyxzQkFBc0IsQ0FBQzthQUNsQztZQUNEO2dCQUNDLElBQUksRUFBRSxHQUFHLFdBQVcsY0FBYztnQkFDbEMsUUFBUSxFQUFFLENBQUMsc0JBQXNCLENBQUM7YUFDbEM7U0FDRCxDQUFDLENBQUM7UUFFSCxNQUFNLGVBQWUsR0FBRyxZQUFZLENBQUMsY0FBYyxDQUFDLDRCQUE0QixFQUFFLFlBQVksQ0FBQyxLQUFLLEVBQUUsU0FBUyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQzVILE1BQU0sU0FBUyxHQUFHLElBQUksc0JBQXNCLEVBQUUsQ0FBQztRQUMvQyxTQUFTLENBQUMsR0FBRyxDQUFDLG1CQUFtQixDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsY0FBYyxFQUFFLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNoRixTQUFTLENBQUMsR0FBRyxDQUFDLG1CQUFtQixDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsY0FBYyxFQUFFLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVoRixNQUFNLGVBQWUsQ0FBQyxPQUFPLENBQUMsU0FBUyxFQUFFLGlCQUFpQixDQUFDLElBQUksQ0FBQyxDQUFDO1FBRWpFLE1BQU0sZ0JBQWdCLEdBQUcsU0FBUyxDQUFDLE9BQU8sRUFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDdkYsTUFBTSxLQUFLLEdBQUcsZ0JBQWdCLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUVqRyxNQUFNLENBQUMsV0FBVyxDQUFDLGdCQUFnQixDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsK0NBQStDLENBQUMsQ0FBQztRQUNoRyxNQUFNLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsR0FBRyxXQUFXLDBDQUEwQyxDQUFDLEVBQUUsNENBQTRDLENBQUMsQ0FBQztRQUNsSSxNQUFNLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsR0FBRyxXQUFXLDBDQUEwQyxDQUFDLEVBQUUsNkNBQTZDLENBQUMsQ0FBQztJQUNwSSxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxvREFBb0QsRUFBRSxLQUFLLElBQUksRUFBRTtRQUNyRSxNQUFNLGVBQWUsR0FBRyxxQkFBcUIsQ0FBQztRQUM5QyxNQUFNLFdBQVcsR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO1FBQzFDLE1BQU0sY0FBYyxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUM7UUFFN0MsTUFBTSxlQUFlLEdBQUcscUJBQXFCLENBQUM7UUFDOUMsTUFBTSxXQUFXLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztRQUMxQyxNQUFNLGNBQWMsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBRTdDLHVCQUF1QixDQUFDLFlBQVksQ0FBQyxhQUFhLENBQUMsY0FBYyxFQUFFLGNBQWMsQ0FBQyxDQUFDLENBQUM7UUFFcEYsTUFBTSxTQUFTLENBQUMsV0FBVyxFQUFFO1lBQzVCO2dCQUNDLElBQUksRUFBRSxHQUFHLFdBQVcsWUFBWTtnQkFDaEMsUUFBUSxFQUFFLENBQUMsK0JBQStCLENBQUM7YUFDM0M7WUFDRDtnQkFDQyxJQUFJLEVBQUUsR0FBRyxXQUFXLFlBQVk7Z0JBQ2hDLFFBQVEsRUFBRSxDQUFDLCtCQUErQixDQUFDO2FBQzNDO1lBQ0Q7Z0JBQ0MsSUFBSSxFQUFFLEdBQUcsV0FBVyxjQUFjO2dCQUNsQyxRQUFRLEVBQUUsQ0FBQyxzQkFBc0IsQ0FBQzthQUNsQztZQUNEO2dCQUNDLElBQUksRUFBRSxHQUFHLFdBQVcsY0FBYztnQkFDbEMsUUFBUSxFQUFFLENBQUMsc0JBQXNCLENBQUM7YUFDbEM7U0FDRCxDQUFDLENBQUM7UUFFSCxrQ0FBa0M7UUFDbEMsaUJBQWlCLENBQUMsb0JBQW9CLENBQUMsYUFBYSxDQUFDLGFBQWEsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUMxRSxNQUFNLGVBQWUsR0FBRyxZQUFZLENBQUMsY0FBYyxDQUFDLDRCQUE0QixFQUFFLFlBQVksQ0FBQyxLQUFLLEVBQUUsU0FBUyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQzVILE1BQU0sU0FBUyxHQUFHLElBQUksc0JBQXNCLEVBQUUsQ0FBQztRQUMvQyxTQUFTLENBQUMsR0FBRyxDQUFDLG1CQUFtQixDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsY0FBYyxFQUFFLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNoRixTQUFTLENBQUMsR0FBRyxDQUFDLG1CQUFtQixDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsY0FBYyxFQUFFLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVoRixNQUFNLGVBQWUsQ0FBQyxPQUFPLENBQUMsU0FBUyxFQUFFLGlCQUFpQixDQUFDLElBQUksQ0FBQyxDQUFDO1FBRWpFLE1BQU0sZ0JBQWdCLEdBQUcsU0FBUyxDQUFDLE9BQU8sRUFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDdkYsTUFBTSxLQUFLLEdBQUcsZ0JBQWdCLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUVqRyxNQUFNLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsR0FBRyxXQUFXLFlBQVksQ0FBQyxFQUFFLDBDQUEwQyxDQUFDLENBQUM7UUFDbEcsTUFBTSxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLEdBQUcsV0FBVyxZQUFZLENBQUMsRUFBRSwyQ0FBMkMsQ0FBQyxDQUFDO0lBQ3BHLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDREQUE0RCxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQzdFLE1BQU0sZUFBZSxHQUFHLHdCQUF3QixDQUFDO1FBQ2pELE1BQU0sV0FBVyxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7UUFDMUMsTUFBTSxjQUFjLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUU3QyxNQUFNLGVBQWUsR0FBRyx3QkFBd0IsQ0FBQztRQUNqRCxNQUFNLFdBQVcsR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO1FBQzFDLE1BQU0sY0FBYyxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUM7UUFFN0MsdUJBQXVCLENBQUMsWUFBWSxDQUFDLGFBQWEsQ0FBQyxjQUFjLEVBQUUsY0FBYyxDQUFDLENBQUMsQ0FBQztRQUVwRixNQUFNLFNBQVMsQ0FBQyxXQUFXLEVBQUU7WUFDNUI7Z0JBQ0MsSUFBSSxFQUFFLEdBQUcsV0FBVyxvQkFBb0I7Z0JBQ3hDLFFBQVEsRUFBRSxDQUFDLGlEQUFpRCxDQUFDO2FBQzdEO1lBQ0Q7Z0JBQ0MsSUFBSSxFQUFFLEdBQUcsV0FBVyxvQkFBb0I7Z0JBQ3hDLFFBQVEsRUFBRSxDQUFDLGlEQUFpRCxDQUFDO2FBQzdEO1lBQ0Q7Z0JBQ0MsSUFBSSxFQUFFLEdBQUcsV0FBVyxjQUFjO2dCQUNsQyxRQUFRLEVBQUUsQ0FBQyxzQkFBc0IsQ0FBQzthQUNsQztZQUNEO2dCQUNDLElBQUksRUFBRSxHQUFHLFdBQVcsY0FBYztnQkFDbEMsUUFBUSxFQUFFLENBQUMsc0JBQXNCLENBQUM7YUFDbEM7U0FDRCxDQUFDLENBQUM7UUFFSCxrQ0FBa0M7UUFDbEMsaUJBQWlCLENBQUMsb0JBQW9CLENBQUMsYUFBYSxDQUFDLGFBQWEsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUMxRSxNQUFNLGVBQWUsR0FBRyxZQUFZLENBQUMsY0FBYyxDQUFDLDRCQUE0QixFQUFFLFlBQVksQ0FBQyxLQUFLLEVBQUUsU0FBUyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQzVILE1BQU0sU0FBUyxHQUFHLElBQUksc0JBQXNCLEVBQUUsQ0FBQztRQUMvQyxTQUFTLENBQUMsR0FBRyxDQUFDLG1CQUFtQixDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsY0FBYyxFQUFFLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNoRixTQUFTLENBQUMsR0FBRyxDQUFDLG1CQUFtQixDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsY0FBYyxFQUFFLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVoRixNQUFNLGVBQWUsQ0FBQyxPQUFPLENBQUMsU0FBUyxFQUFFLGlCQUFpQixDQUFDLElBQUksQ0FBQyxDQUFDO1FBRWpFLE1BQU0sZ0JBQWdCLEdBQUcsU0FBUyxDQUFDLE9BQU8sRUFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDdkYsTUFBTSxLQUFLLEdBQUcsZ0JBQWdCLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUVqRyxNQUFNLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsR0FBRyxXQUFXLG9CQUFvQixDQUFDLEVBQUUsa0RBQWtELENBQUMsQ0FBQztRQUNsSCxNQUFNLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsR0FBRyxXQUFXLG9CQUFvQixDQUFDLEVBQUUsbURBQW1ELENBQUMsQ0FBQztJQUNwSCxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxvRkFBb0YsRUFBRSxLQUFLLElBQUksRUFBRTtRQUNyRyxNQUFNLGVBQWUsR0FBRyxvQkFBb0IsQ0FBQztRQUM3QyxNQUFNLFdBQVcsR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO1FBQzFDLE1BQU0sY0FBYyxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUM7UUFFN0MsTUFBTSxlQUFlLEdBQUcsb0JBQW9CLENBQUM7UUFDN0MsTUFBTSxXQUFXLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztRQUMxQyxNQUFNLGNBQWMsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBRTdDLHVCQUF1QixDQUFDLFlBQVksQ0FBQyxhQUFhLENBQUMsY0FBYyxFQUFFLGNBQWMsQ0FBQyxDQUFDLENBQUM7UUFFcEYsTUFBTSxTQUFTLENBQUMsV0FBVyxFQUFFO1lBQzVCO2dCQUNDLElBQUksRUFBRSxHQUFHLFdBQVcsWUFBWTtnQkFDaEMsUUFBUSxFQUFFLENBQUMsK0JBQStCLENBQUM7YUFDM0M7WUFDRDtnQkFDQyxJQUFJLEVBQUUsR0FBRyxXQUFXLG9CQUFvQjtnQkFDeEMsUUFBUSxFQUFFLENBQUMsaURBQWlELENBQUM7YUFDN0Q7WUFDRDtnQkFDQyxJQUFJLEVBQUUsR0FBRyxXQUFXLFlBQVk7Z0JBQ2hDLFFBQVEsRUFBRSxDQUFDLCtCQUErQixDQUFDO2FBQzNDO1lBQ0Q7Z0JBQ0MsSUFBSSxFQUFFLEdBQUcsV0FBVyxvQkFBb0I7Z0JBQ3hDLFFBQVEsRUFBRSxDQUFDLGlEQUFpRCxDQUFDO2FBQzdEO1lBQ0Q7Z0JBQ0MsSUFBSSxFQUFFLEdBQUcsV0FBVyxjQUFjO2dCQUNsQyxRQUFRLEVBQUUsQ0FBQyxzQkFBc0IsQ0FBQzthQUNsQztZQUNEO2dCQUNDLElBQUksRUFBRSxHQUFHLFdBQVcsY0FBYztnQkFDbEMsUUFBUSxFQUFFLENBQUMsc0JBQXNCLENBQUM7YUFDbEM7U0FDRCxDQUFDLENBQUM7UUFFSCxrQ0FBa0M7UUFDbEMsaUJBQWlCLENBQUMsb0JBQW9CLENBQUMsYUFBYSxDQUFDLGFBQWEsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUMxRSxNQUFNLGVBQWUsR0FBRyxZQUFZLENBQUMsY0FBYyxDQUFDLDRCQUE0QixFQUFFLFlBQVksQ0FBQyxLQUFLLEVBQUUsU0FBUyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQzVILE1BQU0sU0FBUyxHQUFHLElBQUksc0JBQXNCLEVBQUUsQ0FBQztRQUMvQyxTQUFTLENBQUMsR0FBRyxDQUFDLG1CQUFtQixDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsY0FBYyxFQUFFLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNoRixTQUFTLENBQUMsR0FBRyxDQUFDLG1CQUFtQixDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsY0FBYyxFQUFFLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVoRixNQUFNLGVBQWUsQ0FBQyxPQUFPLENBQUMsU0FBUyxFQUFFLGlCQUFpQixDQUFDLElBQUksQ0FBQyxDQUFDO1FBRWpFLE1BQU0sZ0JBQWdCLEdBQUcsU0FBUyxDQUFDLE9BQU8sRUFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDdkYsTUFBTSxLQUFLLEdBQUcsZ0JBQWdCLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUVqRyxNQUFNLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsR0FBRyxXQUFXLFlBQVksQ0FBQyxFQUFFLDBDQUEwQyxDQUFDLENBQUM7UUFDbEcsTUFBTSxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLEdBQUcsV0FBVyxvQkFBb0IsQ0FBQyxFQUFFLGtEQUFrRCxDQUFDLENBQUM7UUFDbEgsTUFBTSxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLEdBQUcsV0FBVyxZQUFZLENBQUMsRUFBRSwyQ0FBMkMsQ0FBQyxDQUFDO1FBQ25HLE1BQU0sQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxHQUFHLFdBQVcsb0JBQW9CLENBQUMsRUFBRSxtREFBbUQsQ0FBQyxDQUFDO0lBQ3BILENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHNFQUFzRSxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ3ZGLE1BQU0sZUFBZSxHQUFHLHVCQUF1QixDQUFDO1FBQ2hELE1BQU0sV0FBVyxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7UUFDMUMsTUFBTSxjQUFjLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUU3QyxNQUFNLGVBQWUsR0FBRyx1QkFBdUIsQ0FBQztRQUNoRCxNQUFNLFdBQVcsR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO1FBQzFDLE1BQU0sY0FBYyxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUM7UUFFN0MsdUJBQXVCLENBQUMsWUFBWSxDQUFDLGFBQWEsQ0FBQyxjQUFjLEVBQUUsY0FBYyxDQUFDLENBQUMsQ0FBQztRQUVwRixNQUFNLFNBQVMsQ0FBQyxXQUFXLEVBQUU7WUFDNUI7Z0JBQ0MsSUFBSSxFQUFFLEdBQUcsV0FBVyxZQUFZO2dCQUNoQyxRQUFRLEVBQUUsQ0FBQywrQkFBK0IsQ0FBQzthQUMzQztZQUNEO2dCQUNDLElBQUksRUFBRSxHQUFHLFdBQVcsWUFBWTtnQkFDaEMsUUFBUSxFQUFFLENBQUMsK0JBQStCLENBQUM7YUFDM0M7WUFDRDtnQkFDQyxJQUFJLEVBQUUsR0FBRyxXQUFXLGNBQWM7Z0JBQ2xDLFFBQVEsRUFBRSxDQUFDLHNCQUFzQixDQUFDO2FBQ2xDO1lBQ0Q7Z0JBQ0MsSUFBSSxFQUFFLEdBQUcsV0FBVyxjQUFjO2dCQUNsQyxRQUFRLEVBQUUsQ0FBQyxzQkFBc0IsQ0FBQzthQUNsQztTQUNELENBQUMsQ0FBQztRQUVILG1DQUFtQztRQUNuQyxpQkFBaUIsQ0FBQyxvQkFBb0IsQ0FBQyxhQUFhLENBQUMsYUFBYSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzNFLE1BQU0sZUFBZSxHQUFHLFlBQVksQ0FBQyxjQUFjLENBQUMsNEJBQTRCLEVBQUUsWUFBWSxDQUFDLEtBQUssRUFBRSxTQUFTLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDNUgsTUFBTSxTQUFTLEdBQUcsSUFBSSxzQkFBc0IsRUFBRSxDQUFDO1FBQy9DLFNBQVMsQ0FBQyxHQUFHLENBQUMsbUJBQW1CLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxjQUFjLEVBQUUsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ2hGLFNBQVMsQ0FBQyxHQUFHLENBQUMsbUJBQW1CLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxjQUFjLEVBQUUsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRWhGLE1BQU0sZUFBZSxDQUFDLE9BQU8sQ0FBQyxTQUFTLEVBQUUsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUM7UUFFakUsTUFBTSxnQkFBZ0IsR0FBRyxTQUFTLENBQUMsT0FBTyxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN2RixNQUFNLEtBQUssR0FBRyxnQkFBZ0IsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBRWpHLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLEdBQUcsV0FBVyxZQUFZLENBQUMsRUFBRSw0REFBNEQsQ0FBQyxDQUFDO1FBQ3JILE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLEdBQUcsV0FBVyxZQUFZLENBQUMsRUFBRSw2REFBNkQsQ0FBQyxDQUFDO0lBQ3ZILENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDZFQUE2RSxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQzlGLE1BQU0sZUFBZSxHQUFHLDBCQUEwQixDQUFDO1FBQ25ELE1BQU0sV0FBVyxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7UUFDMUMsTUFBTSxjQUFjLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUU3QyxNQUFNLGVBQWUsR0FBRywwQkFBMEIsQ0FBQztRQUNuRCxNQUFNLFdBQVcsR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO1FBQzFDLE1BQU0sY0FBYyxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUM7UUFFN0MsdUJBQXVCLENBQUMsWUFBWSxDQUFDLGFBQWEsQ0FBQyxjQUFjLEVBQUUsY0FBYyxDQUFDLENBQUMsQ0FBQztRQUVwRixNQUFNLFNBQVMsQ0FBQyxXQUFXLEVBQUU7WUFDNUI7Z0JBQ0MsSUFBSSxFQUFFLEdBQUcsV0FBVyxZQUFZO2dCQUNoQyxRQUFRLEVBQUUsQ0FBQywrQkFBK0IsQ0FBQzthQUMzQztZQUNEO2dCQUNDLElBQUksRUFBRSxHQUFHLFdBQVcsa0JBQWtCO2dCQUN0QyxRQUFRLEVBQUUsQ0FBQyxxQ0FBcUMsQ0FBQzthQUNqRDtZQUNEO2dCQUNDLElBQUksRUFBRSxHQUFHLFdBQVcsWUFBWTtnQkFDaEMsUUFBUSxFQUFFLENBQUMsK0JBQStCLENBQUM7YUFDM0M7WUFDRDtnQkFDQyxJQUFJLEVBQUUsR0FBRyxXQUFXLGtCQUFrQjtnQkFDdEMsUUFBUSxFQUFFLENBQUMscUNBQXFDLENBQUM7YUFDakQ7WUFDRDtnQkFDQyxJQUFJLEVBQUUsR0FBRyxXQUFXLGNBQWM7Z0JBQ2xDLFFBQVEsRUFBRSxDQUFDLHNCQUFzQixDQUFDO2FBQ2xDO1lBQ0Q7Z0JBQ0MsSUFBSSxFQUFFLEdBQUcsV0FBVyxjQUFjO2dCQUNsQyxRQUFRLEVBQUUsQ0FBQyxzQkFBc0IsQ0FBQzthQUNsQztTQUNELENBQUMsQ0FBQztRQUVILGtDQUFrQztRQUNsQyxpQkFBaUIsQ0FBQyxvQkFBb0IsQ0FBQyxhQUFhLENBQUMsYUFBYSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQzFFLE1BQU0sZUFBZSxHQUFHLFlBQVksQ0FBQyxjQUFjLENBQUMsNEJBQTRCLEVBQUUsWUFBWSxDQUFDLEtBQUssRUFBRSxTQUFTLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDNUgsTUFBTSxTQUFTLEdBQUcsSUFBSSxzQkFBc0IsRUFBRSxDQUFDO1FBQy9DLFNBQVMsQ0FBQyxHQUFHLENBQUMsbUJBQW1CLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxjQUFjLEVBQUUsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ2hGLFNBQVMsQ0FBQyxHQUFHLENBQUMsbUJBQW1CLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxjQUFjLEVBQUUsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRWhGLE1BQU0sZUFBZSxDQUFDLE9BQU8sQ0FBQyxTQUFTLEVBQUUsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUM7UUFFakUsTUFBTSxnQkFBZ0IsR0FBRyxTQUFTLENBQUMsT0FBTyxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN2RixNQUFNLEtBQUssR0FBRyxnQkFBZ0IsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBRWpHLE1BQU0sQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxHQUFHLFdBQVcsWUFBWSxDQUFDLEVBQUUsMENBQTBDLENBQUMsQ0FBQztRQUNsRyxNQUFNLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsR0FBRyxXQUFXLGtCQUFrQixDQUFDLEVBQUUsZ0RBQWdELENBQUMsQ0FBQztRQUM5RyxNQUFNLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsR0FBRyxXQUFXLFlBQVksQ0FBQyxFQUFFLDJDQUEyQyxDQUFDLENBQUM7UUFDbkcsTUFBTSxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLEdBQUcsV0FBVyxrQkFBa0IsQ0FBQyxFQUFFLGlEQUFpRCxDQUFDLENBQUM7SUFDaEgsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsd0JBQXdCLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDekMsTUFBTSxjQUFjLEdBQUcsc0JBQXNCLENBQUM7UUFDOUMsTUFBTSxVQUFVLEdBQUcsSUFBSSxjQUFjLEVBQUUsQ0FBQztRQUN4QyxNQUFNLGFBQWEsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBRTNDLHVCQUF1QixDQUFDLFlBQVksQ0FBQyxhQUFhLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQztRQUVuRSxNQUFNLFVBQVUsR0FBRyxHQUFHLENBQUMsUUFBUSxDQUFDLGFBQWEsRUFBRSxpQ0FBaUMsQ0FBQyxDQUFDO1FBQ2xGLE1BQU0sVUFBVSxHQUFHLEdBQUcsQ0FBQyxRQUFRLENBQUMsYUFBYSxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBQzVELE1BQU0sV0FBVyxHQUFHLEdBQUcsQ0FBQyxRQUFRLENBQUMsYUFBYSxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBRTdELDJDQUEyQztRQUMzQyxNQUFNLFNBQVMsQ0FBQyxXQUFXLEVBQUU7WUFDNUI7Z0JBQ0MsSUFBSSxFQUFFLEdBQUcsVUFBVSxjQUFjO2dCQUNqQyxRQUFRLEVBQUUsQ0FBQyxzQkFBc0IsQ0FBQzthQUNsQztZQUNEO2dCQUNDLElBQUksRUFBRSxVQUFVLENBQUMsSUFBSTtnQkFDckIsUUFBUSxFQUFFLENBQUMsd0JBQXdCLENBQUM7YUFDcEM7WUFDRDtnQkFDQyxJQUFJLEVBQUUsVUFBVSxDQUFDLElBQUk7Z0JBQ3JCLFFBQVEsRUFBRSxDQUFDLHdCQUF3QixDQUFDO2FBQ3BDO1lBQ0Q7Z0JBQ0MsSUFBSSxFQUFFLFdBQVcsQ0FBQyxJQUFJO2dCQUN0QixRQUFRLEVBQUUsQ0FBQyx3QkFBd0IsQ0FBQzthQUNwQztTQUNELENBQUMsQ0FBQztRQUVILGtEQUFrRDtRQUNsRCxrQkFBa0IsQ0FBQyxXQUFXLENBQUMsVUFBVSxFQUFFLFVBQVUsQ0FBQyxDQUFDO1FBQ3ZELGtCQUFrQixDQUFDLFdBQVcsQ0FBQyxXQUFXLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFFeEQsK0NBQStDO1FBQy9DLGlCQUFpQixDQUFDLG9CQUFvQixDQUFDLGFBQWEsQ0FBQyw2QkFBNkIsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUMxRixpQkFBaUIsQ0FBQyxvQkFBb0IsQ0FBQyxhQUFhLENBQUMsWUFBWSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3pFLGlCQUFpQixDQUFDLG9CQUFvQixDQUFDLGFBQWEsQ0FBQyxhQUFhLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFFMUUsTUFBTSxlQUFlLEdBQUcsWUFBWSxDQUFDLGNBQWMsQ0FBQyw0QkFBNEIsRUFBRSxZQUFZLENBQUMsS0FBSyxFQUFFLFNBQVMsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUM1SCxNQUFNLFNBQVMsR0FBRyxJQUFJLHNCQUFzQixFQUFFLENBQUM7UUFDL0MsU0FBUyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLGFBQWEsRUFBRSxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFL0UsTUFBTSxlQUFlLENBQUMsT0FBTyxDQUFDLFNBQVMsRUFBRSxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUVqRSxNQUFNLGdCQUFnQixHQUFHLFNBQVMsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3ZGLE1BQU0sS0FBSyxHQUFHLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUM7UUFFakcsNkNBQTZDO1FBQzdDLGlEQUFpRDtRQUNqRCxpREFBaUQ7UUFDakQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLGtDQUFrQyxDQUFDLENBQUM7UUFDbkYsTUFBTSxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsRUFBRSx3Q0FBd0MsQ0FBQyxDQUFDO1FBQ3JGLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsRUFBRSxtREFBbUQsQ0FBQyxDQUFDO1FBQ2pHLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsRUFBRSxtREFBbUQsQ0FBQyxDQUFDO0lBQ25HLENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQyxDQUFDLENBQUM7QUFFSCxLQUFLLENBQUMsYUFBYSxFQUFFLEdBQUcsRUFBRTtJQUV6Qix1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLElBQUksQ0FBQyx1Q0FBdUMsRUFBRSxHQUFHLEVBQUU7UUFDbEQsTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO1FBQy9DLE1BQU0sTUFBTSxHQUFHLFdBQVcsQ0FBQyxHQUFHLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDM0MsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQ3hDLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDZDQUE2QyxFQUFFLEdBQUcsRUFBRTtRQUN4RCxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxZQUFZLEVBQUUsSUFBSSxFQUFFLHdCQUF3QixFQUFFLENBQUMsQ0FBQztRQUN2RixNQUFNLE1BQU0sR0FBRyxXQUFXLENBQUMsR0FBRyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQzNDLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUN4QyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxnREFBZ0QsRUFBRSxHQUFHLEVBQUU7UUFDM0QsTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sRUFBRSxVQUFVLEVBQUUsSUFBSSxFQUFFLHdCQUF3QixFQUFFLENBQUMsQ0FBQztRQUM3RSxNQUFNLE1BQU0sR0FBRyxXQUFXLENBQUMsR0FBRyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQzNDLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxFQUFFLEdBQUcsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO0lBQzVDLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLCtDQUErQyxFQUFFLEdBQUcsRUFBRTtRQUMxRCxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxZQUFZLEVBQUUsSUFBSSxFQUFFLCtCQUErQixFQUFFLENBQUMsQ0FBQztRQUM5RixNQUFNLE1BQU0sR0FBRyxXQUFXLENBQUMsR0FBRyxrQ0FBMEIsQ0FBQztRQUN6RCxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsRUFBRSxvQ0FBb0MsQ0FBQyxDQUFDO1FBQ3ZFLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsRUFBRSw0QkFBNEIsQ0FBQyxDQUFDO0lBQ2hFLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLGlEQUFpRCxFQUFFLEdBQUcsRUFBRTtRQUM1RCxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxZQUFZLEVBQUUsSUFBSSxFQUFFLDRCQUE0QixFQUFFLENBQUMsQ0FBQztRQUMzRixNQUFNLE1BQU0sR0FBRyxXQUFXLENBQUMsR0FBRyxnQ0FBd0IsQ0FBQztRQUN2RCxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsRUFBRSxnQ0FBZ0MsQ0FBQyxDQUFDO1FBQ3BFLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyw0QkFBNEIsQ0FBQyxFQUFFLHVDQUF1QyxDQUFDLENBQUM7SUFDbkcsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsaURBQWlELEVBQUUsR0FBRyxFQUFFO1FBQzVELE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLFlBQVksRUFBRSxJQUFJLEVBQUUsNEJBQTRCLEVBQUUsQ0FBQyxDQUFDO1FBQzNGLE1BQU0sTUFBTSxHQUFHLFdBQVcsQ0FBQyxHQUFHLG9DQUE0QixDQUFDO1FBQzNELE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFLGdDQUFnQyxDQUFDLENBQUM7UUFDcEUsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLDRCQUE0QixDQUFDLEVBQUUsdUNBQXVDLENBQUMsQ0FBQztJQUNuRyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyx1REFBdUQsRUFBRSxHQUFHLEVBQUU7UUFDbEUsTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO1FBQy9DLE1BQU0sTUFBTSxHQUFHLFdBQVcsQ0FBQyxHQUFHLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDM0MsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQ3hDLENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQyxDQUFDLENBQUMifQ==