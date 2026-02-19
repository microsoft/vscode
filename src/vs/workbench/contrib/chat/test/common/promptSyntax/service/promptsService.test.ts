/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { CancellationToken } from '../../../../../../../base/common/cancellation.js';
import { Event } from '../../../../../../../base/common/event.js';
import { match } from '../../../../../../../base/common/glob.js';
import { ResourceSet } from '../../../../../../../base/common/map.js';
import { Schemas } from '../../../../../../../base/common/network.js';
import { relativePath } from '../../../../../../../base/common/resources.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { Range } from '../../../../../../../editor/common/core/range.js';
import { ILanguageService } from '../../../../../../../editor/common/languages/language.js';
import { IModelService } from '../../../../../../../editor/common/services/model.js';
import { ModelService } from '../../../../../../../editor/common/services/modelService.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IExtensionDescription } from '../../../../../../../platform/extensions/common/extensions.js';
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
import { TestContextService, TestUserDataProfileService } from '../../../../../../test/common/workbenchTestServices.js';
import { ChatRequestVariableSet, isPromptFileVariableEntry, toFileVariableEntry } from '../../../../common/attachments/chatVariableEntries.js';
import { ComputeAutomaticInstructions, newInstructionsCollectionEvent } from '../../../../common/promptSyntax/computeAutomaticInstructions.js';
import { PromptsConfig } from '../../../../common/promptSyntax/config/config.js';
import { AGENTS_SOURCE_FOLDER, CLAUDE_CONFIG_FOLDER, HOOKS_SOURCE_FOLDER, INSTRUCTION_FILE_EXTENSION, INSTRUCTIONS_DEFAULT_SOURCE_FOLDER, LEGACY_MODE_DEFAULT_SOURCE_FOLDER, PROMPT_DEFAULT_SOURCE_FOLDER, PROMPT_FILE_EXTENSION } from '../../../../common/promptSyntax/config/promptFileLocations.js';
import { INSTRUCTIONS_LANGUAGE_ID, PROMPT_LANGUAGE_ID, PromptsType } from '../../../../common/promptSyntax/promptTypes.js';
import { ExtensionAgentSourceType, ICustomAgent, IPromptFileContext, IPromptsService, PromptsStorage, Target } from '../../../../common/promptSyntax/service/promptsService.js';
import { PromptsService } from '../../../../common/promptSyntax/service/promptsServiceImpl.js';
import { mockFiles } from '../testUtils/mockFilesystem.js';
import { InMemoryStorageService, IStorageService } from '../../../../../../../platform/storage/common/storage.js';
import { IPathService } from '../../../../../../services/path/common/pathService.js';
import { IFileMatch, IFileQuery, ISearchService } from '../../../../../../services/search/common/search.js';
import { IExtensionService } from '../../../../../../services/extensions/common/extensions.js';
import { IRemoteAgentService } from '../../../../../../services/remote/common/remoteAgentService.js';
import { ChatModeKind } from '../../../../common/constants.js';
import { HookType } from '../../../../common/promptSyntax/hookSchema.js';

suite('PromptsService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let service: IPromptsService;
	let instaService: TestInstantiationService;
	let workspaceContextService: TestContextService;
	let testConfigService: TestConfigurationService;
	let fileService: IFileService;

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
		instaService.stub(ILabelService, { getUriLabel: (uri: URI) => uri.path });

		const fileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(Schemas.file, fileSystemProvider));

		instaService.stub(IFilesConfigurationService, { updateReadonly: () => Promise.resolve() });

		const pathService = {
			userHome: (): URI | Promise<URI> => {
				return Promise.resolve(URI.file('/home/user'));
			},
		} as IPathService;
		instaService.stub(IPathService, pathService);

		instaService.stub(ISearchService, {
			schemeHasFileSearchProvider: () => true,
			async fileSearch(query: IFileQuery) {
				// mock the search service - recursively find files matching pattern
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

				const results: IFileMatch[] = [];
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
			assert.deepEqual(
				result1.body.fileReferences.map(r => result1.body?.resolveFilePath(r.content)),
				[file3, file4],
			);
			assert.deepEqual(
				result1.body.variableReferences,
				[
					{ name: 'my-tool', range: new Range(10, 10, 10, 17), offset: 240 },
					{ name: 'my-other-tool', range: new Range(11, 10, 11, 23), offset: 257 },
				]
			);

			const result2 = await service.parseNew(file3, CancellationToken.None);
			assert.deepEqual(result2.uri, file3);
			assert.deepEqual(result2.header?.agent, 'edit');
			assert.ok(result2.body);
			assert.deepEqual(
				result2.body.fileReferences.map(r => result2.body?.resolveFilePath(r.content)),
				[nonExistingFolder, yetAnotherFile],
			);

			const result3 = await service.parseNew(yetAnotherFile, CancellationToken.None);
			assert.deepEqual(result3.uri, yetAnotherFile);
			assert.deepEqual(result3.header?.description, 'Another file description.');
			assert.deepEqual(result3.header?.applyTo, '**/*.tsx');
			assert.ok(result3.body);
			assert.deepEqual(
				result3.body.fileReferences.map(r => result3.body?.resolveFilePath(r.content)),
				[someOtherFolder, someOtherFolderFile],
			);
			assert.deepEqual(result3.body.variableReferences, []);

			const result4 = await service.parseNew(file4, CancellationToken.None);
			assert.deepEqual(result4.uri, file4);
			assert.deepEqual(result4.header?.description, 'File 4 splendid description.');
			assert.ok(result4.body);
			assert.deepEqual(
				result4.body.fileReferences.map(r => result4.body?.resolveFilePath(r.content)),
				[
					URI.joinPath(rootFolderUri, '/folder1/some-other-folder/some-non-existing/file.prompt.md'),
					URI.joinPath(rootFolderUri, '/folder1/some-other-folder/some-non-prompt-file.md'),
					URI.joinPath(rootFolderUri, '/folder1/'),
				],
			);
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

			const instructionFiles = await service.listPromptFiles(PromptsType.instructions, CancellationToken.None);
			const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, undefined, undefined);
			const context = {
				files: new ResourceSet([
					URI.joinPath(rootFolderUri, 'folder1/main.tsx'),
				]),
				instructions: new ResourceSet(),
			};
			const result = new ChatRequestVariableSet();

			await contextComputer.addApplyingInstructions(instructionFiles, context, result, newInstructionsCollectionEvent(), CancellationToken.None);

			assert.deepStrictEqual(
				result.asArray().map(i => isPromptFileVariableEntry(i) ? i.value.path : undefined),
				[
					// local instructions
					URI.joinPath(rootFolderUri, '.github/prompts/file1.instructions.md').path,
					URI.joinPath(rootFolderUri, '.github/prompts/file2.instructions.md').path,
					// user instructions
					URI.joinPath(userPromptsFolderUri, 'file10.instructions.md').path,
				],
				'Must find correct instruction files.',
			);
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

			const instructionFiles = await service.listPromptFiles(PromptsType.instructions, CancellationToken.None);
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

			assert.deepStrictEqual(
				result.asArray().map(i => isPromptFileVariableEntry(i) ? i.value.path : undefined),
				[
					// local instructions
					URI.joinPath(rootFolderUri, '.github/prompts/file1.instructions.md').path,
					URI.joinPath(rootFolderUri, '.github/prompts/file2.instructions.md').path,
					// user instructions
					URI.joinPath(userPromptsFolderUri, 'file10.instructions.md').path,
				],
				'Must find correct instruction files.',
			);
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

			assert.deepStrictEqual(
				context.asArray().map(i => isPromptFileVariableEntry(i) ? i.value.path : undefined).filter(e => !!e).sort(),
				[
					URI.joinPath(rootFolderUri, '.github/copilot-instructions.md').path,
					URI.joinPath(rootFolderUri, '.github/more-codestyle.md').path,
					URI.joinPath(rootFolderUri, 'AGENTS.md').path,
					URI.joinPath(rootFolderUri, 'codestyle.md').path,
				].sort(),
				'Must find correct instruction files.',
			);
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
			const expected: ICustomAgent[] = [
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
					uri: URI.joinPath(rootFolderUri, '.github/agents/agent1.agent.md'),
					source: { storage: PromptsStorage.local }
				},
			];

			assert.deepEqual(
				result,
				expected,
				'Must get custom agents.',
			);
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
			const expected: ICustomAgent[] = [
				{
					name: 'agent1',
					description: 'Agent file 1.',
					tools: ['tool1', 'tool2'],
					agentInstructions: {
						content: 'Do it with #tool:tool1',
						toolReferences: [{ name: 'tool1', range: { start: 11, endExclusive: 17 } }],
						metadata: undefined
					},
					handOffs: undefined,
					model: undefined,
					argumentHint: undefined,
					target: Target.Undefined,
					visibility: { userInvocable: true, agentInvocable: true },
					agents: undefined,
					uri: URI.joinPath(rootFolderUri, '.github/agents/agent1.agent.md'),
					source: { storage: PromptsStorage.local },
				},
				{
					name: 'agent2',
					agentInstructions: {
						content: 'First use #tool:tool2\nThen use #tool:tool1',
						toolReferences: [
							{ name: 'tool1', range: { start: 31, endExclusive: 37 } },
							{ name: 'tool2', range: { start: 10, endExclusive: 16 } }
						],
						metadata: undefined
					},
					uri: URI.joinPath(rootFolderUri, '.github/agents/agent2.agent.md'),
					source: { storage: PromptsStorage.local },
					target: Target.Undefined,
					visibility: { userInvocable: true, agentInvocable: true }
				}
			];

			assert.deepEqual(
				result,
				expected,
				'Must get custom agents.',
			);
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
			const expected: ICustomAgent[] = [
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
					uri: URI.joinPath(rootFolderUri, '.github/agents/agent2.agent.md'),
					source: { storage: PromptsStorage.local }
				},
			];

			assert.deepEqual(
				result,
				expected,
				'Must get custom agents with argumentHint.',
			);
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
			const expected: ICustomAgent[] = [
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
					uri: URI.joinPath(rootFolderUri, '.github/agents/generic-agent.agent.md'),
					source: { storage: PromptsStorage.local }
				},
			];

			assert.deepEqual(
				result,
				expected,
				'Must get custom agents with target attribute.',
			);
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
			const expected: ICustomAgent[] = [
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
					uri: URI.joinPath(rootFolderUri, '.claude/agents/claude-agent2.md'),
					source: { storage: PromptsStorage.local }
				},
			];

			assert.deepEqual(
				result,
				expected,
				'Claude tools and models must be mapped to VS Code equivalents; non-Claude agents must remain unchanged.',
			);
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
			const expected: ICustomAgent[] = [
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
					uri: URI.joinPath(rootFolderUri, '.github/agents/demonstrate.md'),
					source: { storage: PromptsStorage.local }
				}
			];

			assert.deepEqual(
				result,
				expected,
				'Must recognize .md files as agents, except README.md',
			);
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
			const expected: ICustomAgent[] = [
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
					uri: URI.joinPath(rootFolderUri, '.github/agents/full-access-agent.agent.md'),
					source: { storage: PromptsStorage.local }
				},
			];

			assert.deepEqual(
				result,
				expected,
				'Must get custom agents with agents, skills, and instructions attributes.',
			);
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

			// Recreate the service with the new stub
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

			// Recreate the service with the new stub
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

			// Recreate the service with the new stub
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
			const extension = {} as IExtensionDescription;
			const registered = service.registerContributedFile(PromptsType.instructions,
				uri,
				extension,
				'TextMate Instructions',
				'Instructions to follow when authoring TextMate grammars',
			);

			const actual = await service.listPromptFiles(PromptsType.instructions, CancellationToken.None);
			assert.strictEqual(actual.length, 1);
			assert.strictEqual(actual[0].uri.toString(), uri.toString());
			assert.strictEqual(actual[0].name, 'TextMate Instructions');
			assert.strictEqual(actual[0].storage, PromptsStorage.extension);
			assert.strictEqual(actual[0].type, PromptsType.instructions);
			registered.dispose();
		});

		test('Custom agent provider', async () => {
			const agentUri = URI.parse('file://extensions/my-extension/myAgent.agent.md');
			const extension = {
				identifier: { value: 'test.my-extension' },
				enabledApiProposals: ['chatParticipantPrivate']
			} as unknown as IExtensionDescription;

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
				providePromptFiles: async (_context: IPromptFileContext, _token: CancellationToken) => {
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
			} as unknown as IExtensionDescription;

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
			const registered1 = service.registerContributedFile(
				PromptsType.agent,
				nonExistentUri,
				extension,
				'NonExistent Agent',
				'An agent that does not exist',
			);

			const registered2 = service.registerContributedFile(
				PromptsType.agent,
				existingUri,
				extension,
				'Existing Agent',
				'An agent that exists',
			);

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
	});

	test('Instructions provider', async () => {
		const instructionUri = URI.parse('file://extensions/my-extension/myInstruction.instructions.md');
		const extension = {
			identifier: { value: 'test.my-extension' },
			enabledApiProposals: ['chatParticipantPrivate']
		} as unknown as IExtensionDescription;

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
			providePromptFiles: async (_context: IPromptFileContext, _token: CancellationToken) => {
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
		assert.strictEqual(providerInstruction!.uri.toString(), instructionUri.toString());
		assert.strictEqual(providerInstruction!.storage, PromptsStorage.extension);
		assert.strictEqual(providerInstruction!.source, ExtensionAgentSourceType.provider);

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
		} as unknown as IExtensionDescription;

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
			providePromptFiles: async (_context: IPromptFileContext, _token: CancellationToken) => {
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
		assert.strictEqual(providerPrompt!.uri.toString(), promptUri.toString());
		assert.strictEqual(providerPrompt!.storage, PromptsStorage.extension);
		assert.strictEqual(providerPrompt!.source, ExtensionAgentSourceType.provider);

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
		} as unknown as IExtensionDescription;

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
			providePromptFiles: async (_context: IPromptFileContext, _token: CancellationToken) => {
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
		assert.strictEqual(providerSkill!.uri.toString(), skillUri.toString());
		assert.strictEqual(providerSkill!.storage, PromptsStorage.extension);
		assert.strictEqual(providerSkill!.source, ExtensionAgentSourceType.provider);

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

			const result = await service.findAgentSkills(CancellationToken.None);

			assert.ok(result, 'Should return results when agent skills are enabled');
			assert.strictEqual(result.length, 4, 'Should find 4 skills total');

			// Check project skills (both from .github/skills and .claude/skills)
			const projectSkills = result.filter(skill => skill.storage === PromptsStorage.local);
			assert.strictEqual(projectSkills.length, 2, 'Should find 2 project skills');

			const githubSkill1 = projectSkills.find(skill => skill.name === 'GitHub Skill 1');
			assert.ok(githubSkill1, 'Should find GitHub skill 1');
			assert.strictEqual(githubSkill1.description, 'A GitHub skill for testing');
			assert.strictEqual(githubSkill1.uri.path, `${rootFolder}/.github/skills/GitHub Skill 1/SKILL.md`);

			const claudeSkill1 = projectSkills.find(skill => skill.name === 'Claude Skill 1');
			assert.ok(claudeSkill1, 'Should find Claude skill 1');
			assert.strictEqual(claudeSkill1.description, 'A Claude skill for testing');
			assert.strictEqual(claudeSkill1.uri.path, `${rootFolder}/.claude/skills/Claude Skill 1/SKILL.md`);

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

			const result = await service.findAgentSkills(CancellationToken.None);

			// Should still return the valid skill, even if one has parsing errors
			assert.ok(result, 'Should return results even with parsing errors');
			assert.strictEqual(result.length, 1, 'Should find 1 valid skill');
			assert.strictEqual(result[0].name, 'Valid Skill');
			assert.strictEqual(result[0].storage, PromptsStorage.local);
		});

		test('should return empty array when no skills found', async () => {
			testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);

			const rootFolderName = 'empty-workspace';
			const rootFolder = `/${rootFolderName}`;
			const rootFolderUri = URI.file(rootFolder);

			workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));

			// Create empty mock filesystem
			await mockFiles(fileService, []);

			const result = await service.findAgentSkills(CancellationToken.None);

			assert.ok(result, 'Should return results array');
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

			const result = await service.findAgentSkills(CancellationToken.None);

			assert.ok(result, 'Should return results');
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

			const result = await service.findAgentSkills(CancellationToken.None);

			assert.ok(result, 'Should return results');
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

			const result = await service.findAgentSkills(CancellationToken.None);

			assert.ok(result, 'Should return results');
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

			const result = await service.findAgentSkills(CancellationToken.None);

			assert.ok(result, 'Should return results');
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

			const result = await service.findAgentSkills(CancellationToken.None);

			assert.ok(result, 'Should return results');
			assert.strictEqual(result.length, 1, 'Should find 1 skill (duplicates resolved by priority)');
			assert.strictEqual(result[0].description, 'Workspace version - highest priority', 'Workspace should win over user');
			assert.strictEqual(result[0].storage, PromptsStorage.local);
		});

		test('should skip skills where name does not match folder name', async () => {
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
						'description: "This skill should be skipped due to name mismatch"',
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

			const result = await service.findAgentSkills(CancellationToken.None);

			assert.ok(result, 'Should return results');
			assert.strictEqual(result.length, 1, 'Should find only 1 skill (mismatched one skipped)');
			assert.strictEqual(result[0].name, 'Valid Skill', 'Should only find the valid skill');
		});

		test('should skip skills with missing name attribute', async () => {
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

			const result = await service.findAgentSkills(CancellationToken.None);

			assert.ok(result, 'Should return results');
			assert.strictEqual(result.length, 1, 'Should find only 1 skill (one without name skipped)');
			assert.strictEqual(result[0].name, 'Valid Named Skill', 'Should only find skill with name attribute');
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
			} as unknown as IExtensionDescription;

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
				providePromptFiles: async (_context: IPromptFileContext, _token: CancellationToken) => {
					return [{ uri: extensionSkillUri }];
				}
			};

			const registered = service.registerPromptFileProvider(extension, PromptsType.skill, provider);

			const result = await service.findAgentSkills(CancellationToken.None);

			assert.ok(result, 'Should return results');
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
			} as unknown as IExtensionDescription;

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

			const registered = service.registerContributedFile(
				PromptsType.skill,
				contributedSkillUri,
				extension,
				'Contributed Skill',
				'A contributed skill from extension'
			);

			const result = await service.findAgentSkills(CancellationToken.None);

			assert.ok(result, 'Should return results');
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
			assert.strictEqual(workspaceSkillCommand.promptPath.storage, PromptsStorage.local);
			assert.strictEqual(workspaceSkillCommand.promptPath.type, PromptsType.skill);

			const anotherSkillCommand = slashCommands.find(cmd => cmd.name === 'another-skill');
			assert.ok(anotherSkillCommand, 'Should find another skill as slash command');
			assert.strictEqual(anotherSkillCommand.description, 'Another skill from workspace');
			assert.strictEqual(anotherSkillCommand.promptPath.storage, PromptsStorage.local);
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
			assert.strictEqual(personalSkillCommand.promptPath.storage, PromptsStorage.user);
			assert.strictEqual(personalSkillCommand.promptPath.type, PromptsType.skill);

			const claudePersonalCommand = slashCommands.find(cmd => cmd.name === 'claude-personal');
			assert.ok(claudePersonalCommand, 'Should find Claude personal skill as slash command');
			assert.strictEqual(claudePersonalCommand.description, 'A Claude personal skill');
			assert.strictEqual(claudePersonalCommand.promptPath.storage, PromptsStorage.user);
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
			} as unknown as IExtensionDescription;

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
				providePromptFiles: async (_context: IPromptFileContext, _token: CancellationToken) => {
					return [{ uri: providerSkillUri }];
				}
			};

			const registered = service.registerPromptFileProvider(extension, PromptsType.skill, provider);

			const slashCommands = await service.getPromptSlashCommands(CancellationToken.None);

			const providerSkillCommand = slashCommands.find(cmd => cmd.name === 'provider-skill');
			assert.ok(providerSkillCommand, 'Should find provider skill as slash command');
			assert.strictEqual(providerSkillCommand.description, 'A skill from extension provider');
			assert.strictEqual(providerSkillCommand.promptPath.storage, PromptsStorage.extension);
			assert.strictEqual(providerSkillCommand.promptPath.type, PromptsType.skill);
			assert.strictEqual(providerSkillCommand.promptPath.source, ExtensionAgentSourceType.provider);

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
			} as unknown as IExtensionDescription;

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

			const registered = service.registerContributedFile(
				PromptsType.skill,
				contributedSkillUri,
				extension,
				'contributed-skill',
				'A skill from extension contribution'
			);

			const slashCommands = await service.getPromptSlashCommands(CancellationToken.None);

			const contributedSkillCommand = slashCommands.find(cmd => cmd.name === 'contributed-skill');
			assert.ok(contributedSkillCommand, 'Should find contributed skill as slash command');
			assert.strictEqual(contributedSkillCommand.description, 'A skill from extension contribution');
			assert.strictEqual(contributedSkillCommand.promptPath.storage, PromptsStorage.extension);
			assert.strictEqual(contributedSkillCommand.promptPath.type, PromptsType.skill);
			assert.strictEqual(contributedSkillCommand.promptPath.source, ExtensionAgentSourceType.contribution);

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
			assert.strictEqual(promptCommand.promptPath.type, PromptsType.prompt);

			const skillCommand = slashCommands.find(cmd => cmd.name === 'my-skill');
			assert.ok(skillCommand, 'Should find skill file as slash command');
			assert.strictEqual(skillCommand.promptPath.type, PromptsType.skill);
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
			} as unknown as IExtensionDescription;

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
				providePromptFiles: async (_context: IPromptFileContext, _token: CancellationToken) => {
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

			const promptCommand = duplicateCommands.find(cmd => cmd.promptPath.type === PromptsType.prompt);
			assert.ok(promptCommand, 'Should find prompt command');

			const skillCommand = duplicateCommands.find(cmd => cmd.promptPath.type === PromptsType.skill);
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
			assert.strictEqual(hiddenSkillCommand.parsedPromptFile?.header?.userInvocable, false,
				'Should have userInvocable=false in parsed header');

			// Verify the filtering logic would correctly exclude this skill
			const filteredCommands = slashCommands.filter(c => c.parsedPromptFile?.header?.userInvocable !== false);
			const hiddenSkillInFiltered = filteredCommands.find(cmd => cmd.name === 'hidden-skill');
			assert.strictEqual(hiddenSkillInFiltered, undefined,
				'Hidden skill should be filtered out when applying userInvocable filter');
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
			assert.strictEqual(visibleSkillCommand.parsedPromptFile?.header?.userInvocable, true,
				'Should have userInvocable=true in parsed header');

			// Verify the filtering logic would correctly include this skill
			const filteredCommands = slashCommands.filter(c => c.parsedPromptFile?.header?.userInvocable !== false);
			const visibleSkillInFiltered = filteredCommands.find(cmd => cmd.name === 'visible-skill');
			assert.ok(visibleSkillInFiltered,
				'Visible skill should be included when applying userInvocable filter');
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
			assert.strictEqual(defaultSkillCommand.parsedPromptFile?.header?.userInvocable, undefined,
				'Should have userInvocable=undefined when attribute is not specified');

			// Verify the filtering logic would correctly include this skill (undefined !== false is true)
			const filteredCommands = slashCommands.filter(c => c.parsedPromptFile?.header?.userInvocable !== false);
			const defaultSkillInFiltered = filteredCommands.find(cmd => cmd.name === 'default-skill');
			assert.ok(defaultSkillInFiltered,
				'Skill without user-invocable attribute should be included when applying userInvocable filter');
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
			assert.strictEqual(hiddenPromptCommand.parsedPromptFile?.header?.userInvocable, false,
				'Should have userInvocable=false in parsed header');

			// Verify the filtering logic would correctly exclude this prompt
			const filteredCommands = slashCommands.filter(c => c.parsedPromptFile?.header?.userInvocable !== false);
			const hiddenPromptInFiltered = filteredCommands.find(cmd => cmd.name === 'hidden-prompt');
			assert.strictEqual(hiddenPromptInFiltered, undefined,
				'Hidden prompt should be filtered out when applying userInvocable filter');
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
			const filteredCommands = slashCommands.filter(c => c.parsedPromptFile?.header?.userInvocable !== false);

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
			const noHeaderSkill = slashCommands.find(cmd =>
				cmd.promptPath.uri.path.includes('no-header-skill'));
			assert.ok(noHeaderSkill, 'Should find skill without header in slash commands');
			assert.strictEqual(noHeaderSkill.parsedPromptFile?.header, undefined,
				'Should have undefined header');

			// Verify the filtering logic handles missing header correctly
			// parsedPromptFile?.header?.userInvocable !== false
			// When header is undefined: undefined !== false is true, so skill is included
			const filteredCommands = slashCommands.filter(c => c.parsedPromptFile?.header?.userInvocable !== false);
			const noHeaderSkillInFiltered = filteredCommands.find(cmd =>
				cmd.promptPath.uri.path.includes('no-header-skill'));
			assert.ok(noHeaderSkillInFiltered,
				'Skill without header should be included when applying userInvocable filter (defaults to true)');
		});
	});

	suite('hooks', () => {
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
	});
});
