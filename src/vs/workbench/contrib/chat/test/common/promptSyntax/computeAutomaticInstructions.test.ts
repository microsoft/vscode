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
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { testWorkspace } from '../../../../../../platform/workspace/test/common/testWorkspace.js';
import { IUserDataProfileService } from '../../../../../services/userDataProfile/common/userDataProfile.js';
import { TestContextService, TestUserDataProfileService } from '../../../../../test/common/workbenchTestServices.js';
import { ChatRequestVariableSet, isPromptFileVariableEntry, isPromptTextVariableEntry, toFileVariableEntry } from '../../../common/attachments/chatVariableEntries.js';
import { ComputeAutomaticInstructions } from '../../../common/promptSyntax/computeAutomaticInstructions.js';
import { PromptsConfig } from '../../../common/promptSyntax/config/config.js';
import { INSTRUCTION_FILE_EXTENSION, INSTRUCTIONS_DEFAULT_SOURCE_FOLDER, LEGACY_MODE_DEFAULT_SOURCE_FOLDER, PROMPT_DEFAULT_SOURCE_FOLDER, PROMPT_FILE_EXTENSION } from '../../../common/promptSyntax/config/promptFileLocations.js';
import { INSTRUCTIONS_LANGUAGE_ID, PROMPT_LANGUAGE_ID } from '../../../common/promptSyntax/promptTypes.js';
import { IPromptsService } from '../../../common/promptSyntax/service/promptsService.js';
import { PromptsService } from '../../../common/promptSyntax/service/promptsServiceImpl.js';
import { mockFiles } from './testUtils/mockFilesystem.js';
import { InMemoryStorageService, IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IPathService } from '../../../../../services/path/common/pathService.js';
import { IFileQuery, ISearchService } from '../../../../../services/search/common/search.js';
import { IExtensionService } from '../../../../../services/extensions/common/extensions.js';
import { ILanguageModelToolsService } from '../../../common/tools/languageModelToolsService.js';
import { basename } from '../../../../../../base/common/resources.js';
import { match } from '../../../../../../base/common/glob.js';
import { ChatModeKind } from '../../../common/constants.js';

suite('ComputeAutomaticInstructions', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let service: IPromptsService;
	let instaService: TestInstantiationService;
	let workspaceContextService: TestContextService;
	let testConfigService: TestConfigurationService;
	let fileService: IFileService;
	let toolsService: ILanguageModelToolsService;

	setup(async () => {
		instaService = disposables.add(new TestInstantiationService());
		instaService.stub(ILogService, new NullLogService());

		workspaceContextService = new TestContextService();
		instaService.stub(IWorkspaceContextService, workspaceContextService);

		testConfigService = new TestConfigurationService();
		testConfigService.setUserConfiguration(PromptsConfig.USE_COPILOT_INSTRUCTION_FILES, true);
		testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_MD, true);
		testConfigService.setUserConfiguration(PromptsConfig.USE_NESTED_AGENT_MD, false);
		testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
		testConfigService.setUserConfiguration(PromptsConfig.INCLUDE_APPLYING_INSTRUCTIONS, true);
		testConfigService.setUserConfiguration(PromptsConfig.INCLUDE_REFERENCED_INSTRUCTIONS, true);
		testConfigService.setUserConfiguration(PromptsConfig.INSTRUCTIONS_LOCATION_KEY, { [INSTRUCTIONS_DEFAULT_SOURCE_FOLDER]: true });
		testConfigService.setUserConfiguration(PromptsConfig.PROMPT_LOCATIONS_KEY, { [PROMPT_DEFAULT_SOURCE_FOLDER]: true });
		testConfigService.setUserConfiguration(PromptsConfig.MODE_LOCATION_KEY, { [LEGACY_MODE_DEFAULT_SOURCE_FOLDER]: true });
		testConfigService.setUserConfiguration(PromptsConfig.SKILLS_LOCATION_KEY, { '.claude/skills': true });

		instaService.stub(IConfigurationService, testConfigService);
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
			guessLanguageIdByFilepathOrFirstLine(uri: URI) {
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
			getUriLabel: (uri: URI, options?: { relative?: boolean }) => {
				if (options?.relative) {
					return basename(uri);
				}
				return uri.path;
			}
		});

		const fileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(Schemas.file, fileSystemProvider));

		const pathService = {
			userHome: (): URI | Promise<URI> => {
				return Promise.resolve(URI.file('/home/user'));
			},
		} as IPathService;
		instaService.stub(IPathService, pathService);

		instaService.stub(ISearchService, {
			schemeHasFileSearchProvider: () => true,
			async fileSearch(query: IFileQuery) {
				const results: any[] = [];
				for (const folderQuery of query.folderQueries) {
					const findFilesInLocation = async (location: URI, results: URI[] = []): Promise<URI[]> => {
						try {
							const resolve = await fileService.resolve(location);
							if (resolve.isFile) {
								results.push(resolve.resource);
							} else if (resolve.isDirectory && resolve.children) {
								for (const child of resolve.children) {
									await findFilesInLocation(child.resource, results);
								}
							}
						} catch (error) {
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
			getToolByName: (name: string) => {
				if (name === 'readFile') {
					return { id: 'vscode_readFile', name: 'readFile' };
				}
				if (name === 'runSubagent') {
					return { id: 'vscode_runSubagent', name: 'runSubagent' };
				}
				return undefined;
			},
			getFullReferenceName: (tool: { name: string }) => tool.name,
		} as unknown as ILanguageModelToolsService;
		instaService.stub(ILanguageModelToolsService, toolsService);

		service = disposables.add(instaService.createInstance(PromptsService));
		instaService.stub(IPromptsService, service);
	});

	teardown(() => {
		sinon.restore();
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
			const rootFolderName = 'duplicate-test'; const rootFolder = `/${rootFolderName}`;
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
						'TS instructions [](./referenced.instructions.md)',
					]
				},
				{
					path: `${rootFolder}/.github/instructions/referenced.instructions.md`,
					contents: ['Referenced content'],
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

			const telemetryEvents: { eventName: string; data: unknown }[] = [];
			const mockTelemetryService = {
				publicLog2: (eventName: string, data: unknown) => {
					telemetryEvents.push({ eventName, data });
				}
			} as unknown as ITelemetryService;
			instaService.stub(ITelemetryService, mockTelemetryService);

			const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, undefined, undefined);
			const variables = new ChatRequestVariableSet();
			variables.add(toFileVariableEntry(URI.joinPath(rootFolderUri, 'src/file.ts')));

			await contextComputer.collect(variables, CancellationToken.None);

			const telemetryEvent = telemetryEvents.find(e => e.eventName === 'instructionsCollected');
			assert.ok(telemetryEvent, 'Should emit telemetry event');
			const data = telemetryEvent.data as {
				applyingInstructionsCount: number;
				referencedInstructionsCount: number;
				agentInstructionsCount: number;
				totalInstructionsCount: number;
			};
			assert.ok(data.applyingInstructionsCount >= 0, 'Should have applying count');
			assert.ok(data.referencedInstructionsCount >= 0, 'Should have referenced count');
			assert.ok(data.agentInstructionsCount >= 0, 'Should have agent count');
			assert.ok(data.totalInstructionsCount >= 0, 'Should have total count');
		});
	});

	suite('instructions list variable', () => {
		function xmlContents(text: string, tag: string): string[] {
			const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'g');
			const matches = [];
			let match;
			while ((match = regex.exec(text)) !== null) {
				matches.push(match[1].trim());
			}
			return matches;
		}

		function getFilePath(path: string): string {
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

			const contextComputer = instaService.createInstance(
				ComputeAutomaticInstructions,
				ChatModeKind.Agent,
				{ 'vscode_readFile': true }, // Enable readFile tool
				undefined
			);
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
						'user-invokable: true',
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
						'user-invokable: true',
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
						'user-invokable: false',
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
						'user-invokable: false',
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

			const contextComputer = instaService.createInstance(
				ComputeAutomaticInstructions,
				ChatModeKind.Agent,
				{ 'vscode_runSubagent': true }, // Enable runSubagent tool
				['*'] // Enable all subagents
			);
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

			const contextComputer = instaService.createInstance(
				ComputeAutomaticInstructions,
				ChatModeKind.Agent,
				{ 'vscode_readFile': true }, // Enable readFile tool
				undefined
			);
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

			const contextComputer = instaService.createInstance(
				ComputeAutomaticInstructions,
				ChatModeKind.Agent,
				undefined, // No tools available
				undefined
			);
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

			const contextComputer = instaService.createInstance(
				ComputeAutomaticInstructions,
				ChatModeKind.Agent,
				{ 'vscode_readFile': true }, // Enable readFile tool
				undefined
			);
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

			const contextComputer = instaService.createInstance(
				ComputeAutomaticInstructions,
				ChatModeKind.Agent,
				{ 'vscode_readFile': true }, // Enable readFile tool
				undefined
			);
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
			const cancelledToken: CancellationToken = {
				isCancellationRequested: true,
				onCancellationRequested: Event.None
			};

			// Should handle cancellation gracefully
			await contextComputer.collect(variables, cancelledToken);
			assert.ok(true, 'Should handle cancellation without errors');
		});
	});
});
