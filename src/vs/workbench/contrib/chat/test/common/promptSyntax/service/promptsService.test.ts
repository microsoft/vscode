/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { CancellationToken } from '../../../../../../../base/common/cancellation.js';
import { ResourceSet } from '../../../../../../../base/common/map.js';
import { Schemas } from '../../../../../../../base/common/network.js';
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
import { TestContextService, TestUserDataProfileService } from '../../../../../../test/common/workbenchTestServices.js';
import { ChatRequestVariableSet, isPromptFileVariableEntry, toFileVariableEntry } from '../../../../common/attachments/chatVariableEntries.js';
import { ComputeAutomaticInstructions, newInstructionsCollectionEvent } from '../../../../common/promptSyntax/computeAutomaticInstructions.js';
import { PromptsConfig } from '../../../../common/promptSyntax/config/config.js';
import { INSTRUCTION_FILE_EXTENSION, INSTRUCTIONS_DEFAULT_SOURCE_FOLDER, LEGACY_MODE_DEFAULT_SOURCE_FOLDER, PROMPT_DEFAULT_SOURCE_FOLDER, PROMPT_FILE_EXTENSION } from '../../../../common/promptSyntax/config/promptFileLocations.js';
import { INSTRUCTIONS_LANGUAGE_ID, PROMPT_LANGUAGE_ID, PromptsType } from '../../../../common/promptSyntax/promptTypes.js';
import { ExtensionAgentSourceType, ICustomAgent, ICustomAgentQueryOptions, IPromptsService, PromptsStorage } from '../../../../common/promptSyntax/service/promptsService.js';
import { PromptsService } from '../../../../common/promptSyntax/service/promptsServiceImpl.js';
import { mockFiles } from '../testUtils/mockFilesystem.js';
import { InMemoryStorageService, IStorageService } from '../../../../../../../platform/storage/common/storage.js';
import { IPathService } from '../../../../../../services/path/common/pathService.js';
import { ISearchService } from '../../../../../../services/search/common/search.js';
import { IExtensionService } from '../../../../../../services/extensions/common/extensions.js';
import { IDefaultAccountService } from '../../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IDefaultAccount } from '../../../../../../../base/common/defaultAccount.js';

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
		testConfigService.setUserConfiguration(PromptsConfig.INSTRUCTIONS_LOCATION_KEY, { [INSTRUCTIONS_DEFAULT_SOURCE_FOLDER]: true });
		testConfigService.setUserConfiguration(PromptsConfig.PROMPT_LOCATIONS_KEY, { [PROMPT_DEFAULT_SOURCE_FOLDER]: true });
		testConfigService.setUserConfiguration(PromptsConfig.MODE_LOCATION_KEY, { [LEGACY_MODE_DEFAULT_SOURCE_FOLDER]: true });

		instaService.stub(IConfigurationService, testConfigService);
		instaService.stub(IWorkbenchEnvironmentService, {});
		instaService.stub(IUserDataProfileService, new TestUserDataProfileService());
		instaService.stub(ITelemetryService, NullTelemetryService);
		instaService.stub(IStorageService, InMemoryStorageService);
		instaService.stub(IExtensionService, {
			whenInstalledExtensionsRegistered: () => Promise.resolve(true),
			activateByEvent: () => Promise.resolve()
		});

		instaService.stub(IDefaultAccountService, {
			getDefaultAccount: () => Promise.resolve({ chat_preview_features_enabled: true } as IDefaultAccount)
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

		instaService.stub(ISearchService, {});

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
						'tools: [\'my-tool1\', , true]',
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
						'tools: [\'my-tool3\', false, "my-tool2" ]',
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
			assert.deepEqual(result1.header?.tools, ['my-tool1']);
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
			const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, undefined);
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
			const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, undefined);
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


			const contextComputer = instaService.createInstance(ComputeAutomaticInstructions, undefined);
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
					target: undefined,
					infer: undefined,
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
					target: undefined,
					infer: undefined,
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
					target: undefined,
					infer: undefined,
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
					target: undefined,
					infer: undefined,
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
					target: 'github-copilot',
					tools: ['github-api', 'code-search'],
					agentInstructions: {
						content: 'I am optimized for GitHub Copilot workflows.',
						toolReferences: [],
						metadata: undefined
					},
					handOffs: undefined,
					model: undefined,
					argumentHint: undefined,
					infer: undefined,
					uri: URI.joinPath(rootFolderUri, '.github/agents/github-agent.agent.md'),
					source: { storage: PromptsStorage.local }
				},
				{
					name: 'vscode-agent',
					description: 'VS Code specialized agent.',
					target: 'vscode',
					model: 'gpt-4',
					agentInstructions: {
						content: 'I am specialized for VS Code editor tasks.',
						toolReferences: [],
						metadata: undefined
					},
					handOffs: undefined,
					argumentHint: undefined,
					tools: undefined,
					infer: undefined,
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
					target: undefined,
					infer: undefined,
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

		test('agents with .md extension (no .agent.md)', async () => {
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
					path: `${rootFolder}/.github/agents/test.md`,
					contents: [
						'Test agent without header.',
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
					target: undefined,
					infer: undefined,
					uri: URI.joinPath(rootFolderUri, '.github/agents/demonstrate.md'),
					source: { storage: PromptsStorage.local },
				},
				{
					name: 'test',
					agentInstructions: {
						content: 'Test agent without header.',
						toolReferences: [],
						metadata: undefined
					},
					uri: URI.joinPath(rootFolderUri, '.github/agents/test.md'),
					source: { storage: PromptsStorage.local },
				}
			];

			assert.deepEqual(
				result,
				expected,
				'Must get custom agents with .md extension from .github/agents/ folder.',
			);
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
				provideCustomAgents: async (_options: ICustomAgentQueryOptions, _token: CancellationToken) => {
					return [
						{
							name: 'myAgent',
							description: 'My custom agent from provider',
							uri: agentUri
						}
					];
				}
			};

			const registered = service.registerCustomAgentsProvider(extension, provider);

			const actual = await service.getCustomAgents(CancellationToken.None);
			assert.strictEqual(actual.length, 1);
			assert.strictEqual(actual[0].name, 'myAgent');
			assert.strictEqual(actual[0].description, 'My custom agent from provider');
			assert.strictEqual(actual[0].uri.toString(), agentUri.toString());
			assert.strictEqual(actual[0].source.storage, PromptsStorage.extension);
			if (actual[0].source.storage === PromptsStorage.extension) {
				assert.strictEqual(actual[0].source.type, ExtensionAgentSourceType.provider);
			}

			registered.dispose();

			// After disposal, the agent should no longer be listed
			const actualAfterDispose = await service.getCustomAgents(CancellationToken.None);
			assert.strictEqual(actualAfterDispose.length, 0);
		});

		test('Custom agent provider with isEditable', async () => {
			const readonlyAgentUri = URI.parse('file://extensions/my-extension/readonlyAgent.agent.md');
			const editableAgentUri = URI.parse('file://extensions/my-extension/editableAgent.agent.md');
			const extension = {
				identifier: { value: 'test.my-extension' },
				enabledApiProposals: ['chatParticipantPrivate']
			} as unknown as IExtensionDescription;

			// Mock the agent file content
			await mockFiles(fileService, [
				{
					path: readonlyAgentUri.path,
					contents: [
						'---',
						'description: \'Readonly agent from provider\'',
						'---',
						'I am a readonly agent.',
					]
				},
				{
					path: editableAgentUri.path,
					contents: [
						'---',
						'description: \'Editable agent from provider\'',
						'---',
						'I am an editable agent.',
					]
				}
			]);

			const provider = {
				provideCustomAgents: async (_options: ICustomAgentQueryOptions, _token: CancellationToken) => {
					return [
						{
							name: 'readonlyAgent',
							description: 'Readonly agent from provider',
							uri: readonlyAgentUri,
							isEditable: false
						},
						{
							name: 'editableAgent',
							description: 'Editable agent from provider',
							uri: editableAgentUri,
							isEditable: true
						}
					];
				}
			};

			const registered = service.registerCustomAgentsProvider(extension, provider);

			// Spy on updateReadonly to verify it's called correctly
			const filesConfigService = instaService.get(IFilesConfigurationService);
			const updateReadonlySpy = sinon.spy(filesConfigService, 'updateReadonly');

			// List prompt files to trigger the readonly check
			await service.listPromptFiles(PromptsType.agent, CancellationToken.None);

			// Verify updateReadonly was called only for the non-editable agent
			assert.strictEqual(updateReadonlySpy.callCount, 1, 'updateReadonly should be called once');
			assert.ok(updateReadonlySpy.calledWith(readonlyAgentUri, true), 'updateReadonly should be called with readonly agent URI and true');

			const actual = await service.getCustomAgents(CancellationToken.None);
			assert.strictEqual(actual.length, 2);

			const readonlyAgent = actual.find(a => a.name === 'readonlyAgent');
			const editableAgent = actual.find(a => a.name === 'editableAgent');

			assert.ok(readonlyAgent, 'Readonly agent should be found');
			assert.ok(editableAgent, 'Editable agent should be found');
			assert.strictEqual(readonlyAgent!.description, 'Readonly agent from provider');
			assert.strictEqual(editableAgent!.description, 'Editable agent from provider');

			registered.dispose();
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

	suite('findAgentSkills', () => {
		teardown(() => {
			sinon.restore();
		});

		test('should return undefined when USE_AGENT_SKILLS is disabled', async () => {
			testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, false);

			const result = await service.findAgentSkills(CancellationToken.None);
			assert.strictEqual(result, undefined);
		});

		test('should return undefined when chat_preview_features_enabled is false', async () => {
			testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
			instaService.stub(IDefaultAccountService, {
				getDefaultAccount: () => Promise.resolve({ chat_preview_features_enabled: false } as IDefaultAccount)
			});

			// Recreate service with new stub
			service = disposables.add(instaService.createInstance(PromptsService));

			const result = await service.findAgentSkills(CancellationToken.None);
			assert.strictEqual(result, undefined);

			// Restore default stub for other tests
			instaService.stub(IDefaultAccountService, {
				getDefaultAccount: () => Promise.resolve({ chat_preview_features_enabled: true } as IDefaultAccount)
			});
		});

		test('should return undefined when USE_AGENT_SKILLS is enabled but chat_preview_features_enabled is false', async () => {
			testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);
			instaService.stub(IDefaultAccountService, {
				getDefaultAccount: () => Promise.resolve({ chat_preview_features_enabled: false } as IDefaultAccount)
			});

			// Recreate service with new stub
			service = disposables.add(instaService.createInstance(PromptsService));

			const result = await service.findAgentSkills(CancellationToken.None);
			assert.strictEqual(result, undefined);

			// Restore default stub for other tests
			instaService.stub(IDefaultAccountService, {
				getDefaultAccount: () => Promise.resolve({ chat_preview_features_enabled: true } as IDefaultAccount)
			});
		});

		test('should find skills in workspace and user home', async () => {
			testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);

			const rootFolderName = 'agent-skills-test';
			const rootFolder = `/${rootFolderName}`;
			const rootFolderUri = URI.file(rootFolder);

			workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));

			// Create mock filesystem with skills in both .github/skills and .claude/skills
			await mockFiles(fileService, [
				{
					path: `${rootFolder}/.github/skills/github-skill-1/SKILL.md`,
					contents: [
						'---',
						'name: "GitHub Skill 1"',
						'description: "A GitHub skill for testing"',
						'---',
						'This is GitHub skill 1 content',
					],
				},
				{
					path: `${rootFolder}/.claude/skills/claude-skill-1/SKILL.md`,
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
					path: '/home/user/.claude/skills/personal-skill-1/SKILL.md',
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
					path: '/home/user/.copilot/skills/copilot-skill-1/SKILL.md',
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
			const projectSkills = result.filter(skill => skill.type === 'project');
			assert.strictEqual(projectSkills.length, 2, 'Should find 2 project skills');

			const githubSkill1 = projectSkills.find(skill => skill.name === 'GitHub Skill 1');
			assert.ok(githubSkill1, 'Should find GitHub skill 1');
			assert.strictEqual(githubSkill1.description, 'A GitHub skill for testing');
			assert.strictEqual(githubSkill1.uri.path, `${rootFolder}/.github/skills/github-skill-1/SKILL.md`);

			const claudeSkill1 = projectSkills.find(skill => skill.name === 'Claude Skill 1');
			assert.ok(claudeSkill1, 'Should find Claude skill 1');
			assert.strictEqual(claudeSkill1.description, 'A Claude skill for testing');
			assert.strictEqual(claudeSkill1.uri.path, `${rootFolder}/.claude/skills/claude-skill-1/SKILL.md`);

			// Check personal skills
			const personalSkills = result.filter(skill => skill.type === 'personal');
			assert.strictEqual(personalSkills.length, 2, 'Should find 2 personal skills');

			const personalSkill1 = personalSkills.find(skill => skill.name === 'Personal Skill 1');
			assert.ok(personalSkill1, 'Should find Personal Skill 1');
			assert.strictEqual(personalSkill1.description, 'A personal skill for testing');
			assert.strictEqual(personalSkill1.uri.path, '/home/user/.claude/skills/personal-skill-1/SKILL.md');

			const copilotSkill1 = personalSkills.find(skill => skill.name === 'Copilot Skill 1');
			assert.ok(copilotSkill1, 'Should find Copilot Skill 1');
			assert.strictEqual(copilotSkill1.description, 'A Copilot skill for testing');
			assert.strictEqual(copilotSkill1.uri.path, '/home/user/.copilot/skills/copilot-skill-1/SKILL.md');
		});

		test('should handle parsing errors gracefully', async () => {
			testConfigService.setUserConfiguration(PromptsConfig.USE_AGENT_SKILLS, true);

			const rootFolderName = 'skills-error-test';
			const rootFolder = `/${rootFolderName}`;
			const rootFolderUri = URI.file(rootFolder);

			workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));

			// Create mock filesystem with malformed skill file in .github/skills
			await mockFiles(fileService, [
				{
					path: `${rootFolder}/.github/skills/valid-skill/SKILL.md`,
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
			assert.strictEqual(result[0].type, 'project');
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

			const rootFolderName = 'truncation-test';
			const rootFolder = `/${rootFolderName}`;
			const rootFolderUri = URI.file(rootFolder);

			workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));

			const longName = 'A'.repeat(100); // Exceeds 64 characters
			const longDescription = 'B'.repeat(1500); // Exceeds 1024 characters

			await mockFiles(fileService, [
				{
					path: `${rootFolder}/.github/skills/long-skill/SKILL.md`,
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

			const rootFolderName = 'xml-test';
			const rootFolder = `/${rootFolderName}`;
			const rootFolderUri = URI.file(rootFolder);

			workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));

			await mockFiles(fileService, [
				{
					path: `${rootFolder}/.github/skills/xml-skill/SKILL.md`,
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

			const rootFolderName = 'combined-test';
			const rootFolder = `/${rootFolderName}`;
			const rootFolderUri = URI.file(rootFolder);

			workspaceContextService.setWorkspace(testWorkspace(rootFolderUri));

			const longNameWithXml = '<p>' + 'A'.repeat(100) + '</p>'; // Exceeds 64 chars and has XML
			const longDescWithXml = '<div>' + 'B'.repeat(1500) + '</div>'; // Exceeds 1024 chars and has XML

			await mockFiles(fileService, [
				{
					path: `${rootFolder}/.github/skills/combined-skill/SKILL.md`,
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
	});
});
