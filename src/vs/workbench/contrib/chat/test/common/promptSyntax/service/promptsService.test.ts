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
import { ChatRequestVariableSet, isPromptFileVariableEntry, toFileVariableEntry } from '../../../../common/chatVariableEntries.js';
import { ComputeAutomaticInstructions, newInstructionsCollectionEvent } from '../../../../common/promptSyntax/computeAutomaticInstructions.js';
import { PromptsConfig } from '../../../../common/promptSyntax/config/config.js';
import { INSTRUCTION_FILE_EXTENSION, INSTRUCTIONS_DEFAULT_SOURCE_FOLDER, LEGACY_MODE_DEFAULT_SOURCE_FOLDER, PROMPT_DEFAULT_SOURCE_FOLDER, PROMPT_FILE_EXTENSION } from '../../../../common/promptSyntax/config/promptFileLocations.js';
import { INSTRUCTIONS_LANGUAGE_ID, PROMPT_LANGUAGE_ID, PromptsType } from '../../../../common/promptSyntax/promptTypes.js';
import { ICustomAgent, IPromptsService, PromptsStorage } from '../../../../common/promptSyntax/service/promptsService.js';
import { PromptsService } from '../../../../common/promptSyntax/service/promptsServiceImpl.js';
import { MockFilesystem } from '../testUtils/mockFilesystem.js';
import { InMemoryStorageService, IStorageService } from '../../../../../../../platform/storage/common/storage.js';

suite('PromptsService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let service: IPromptsService;
	let instaService: TestInstantiationService;
	let workspaceContextService: TestContextService;

	setup(async () => {
		instaService = disposables.add(new TestInstantiationService());
		instaService.stub(ILogService, new NullLogService());

		workspaceContextService = new TestContextService();
		instaService.stub(IWorkspaceContextService, workspaceContextService);

		const testConfigService = new TestConfigurationService();
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

		const fileService = disposables.add(instaService.createInstance(FileService));
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

			await (instaService.createInstance(MockFilesystem,
				// the file structure to be created on the disk for the test
				[{
					name: rootFolderName,
					children: [
						{
							name: 'file1.prompt.md',
							contents: [
								'## Some Header',
								'some contents',
								' ',
							],
						},
						{
							name: rootFileName,
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
							name: 'folder1',
							children: [
								{
									name: 'file3.prompt.md',
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
									name: 'some-other-folder',
									children: [
										{
											name: 'file4.prompt.md',
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
											name: 'file.txt',
											contents: [
												'---',
												'description: "Non-prompt file description".',
												'tools: ["my-tool-24"]',
												'---',
											],
										},
										{
											name: 'yetAnotherFolder🤭',
											children: [
												{
													name: 'another-file.instructions.md',
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
													name: 'one_more_file_just_in_case.prompt.md',
													contents: 'one_more_file_just_in_case.prompt.md contents',
												},
											],
										},
									],
								},
							],
						},
					],
				}])).mock();

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
			await (instaService.createInstance(MockFilesystem,
				[{
					name: rootFolderName,
					children: [
						{
							name: 'file1.prompt.md',
							contents: [
								'## Some Header',
								'some contents',
								' ',
							],
						},
						{
							name: '.github/prompts',
							children: [
								{
									name: 'file1.instructions.md',
									contents: [
										'---',
										'description: \'Instructions file 1.\'',
										'applyTo: "**/*.tsx"',
										'---',
										'Some instructions 1 contents.',
									],
								},
								{
									name: 'file2.instructions.md',
									contents: [
										'---',
										'description: \'Instructions file 2.\'',
										'applyTo: "**/folder1/*.tsx"',
										'---',
										'Some instructions 2 contents.',
									],
								},
								{
									name: 'file3.instructions.md',
									contents: [
										'---',
										'description: \'Instructions file 3.\'',
										'applyTo: "**/folder2/*.tsx"',
										'---',
										'Some instructions 3 contents.',
									],
								},
								{
									name: 'file4.instructions.md',
									contents: [
										'---',
										'description: \'Instructions file 4.\'',
										'applyTo: "src/build/*.tsx"',
										'---',
										'Some instructions 4 contents.',
									],
								},
								{
									name: 'file5.prompt.md',
									contents: [
										'---',
										'description: \'Prompt file 5.\'',
										'---',
										'Some prompt 5 contents.',
									],
								},
							],
						},
						{
							name: 'folder1',
							children: [
								{
									name: 'main.tsx',
									contents: 'console.log("Haalou!")',
								},
							],
						},
					],
				}])).mock();

			// mock user data instructions
			await (instaService.createInstance(MockFilesystem, [
				{
					name: userPromptsFolderName,
					children: [
						{
							name: 'file10.instructions.md',
							contents: [
								'---',
								'description: \'Instructions file 10.\'',
								'applyTo: "**/folder1/*.tsx"',
								'---',
								'Some instructions 10 contents.',
							],
						},
						{
							name: 'file11.instructions.md',
							contents: [
								'---',
								'description: \'Instructions file 11.\'',
								'applyTo: "**/folder1/*.py"',
								'---',
								'Some instructions 11 contents.',
							],
						},
						{
							name: 'file12.prompt.md',
							contents: [
								'---',
								'description: \'Prompt file 12.\'',
								'---',
								'Some prompt 12 contents.',
							],
						},
					],
				}
			])).mock();

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
			await (instaService.createInstance(MockFilesystem,
				[{
					name: rootFolderName,
					children: [
						{
							name: 'file1.prompt.md',
							contents: [
								'## Some Header',
								'some contents',
								' ',
							],
						},
						{
							name: '.github/prompts',
							children: [
								{
									name: 'file1.instructions.md',
									contents: [
										'---',
										'description: \'Instructions file 1.\'',
										'applyTo: "**/*.tsx"',
										'---',
										'Some instructions 1 contents.',
									],
								},
								{
									name: 'file2.instructions.md',
									contents: [
										'---',
										'description: \'Instructions file 2.\'',
										'applyTo: "**/folder1/*.tsx"',
										'---',
										'Some instructions 2 contents. [](./file1.instructions.md)',
									],
								},
								{
									name: 'file3.instructions.md',
									contents: [
										'---',
										'description: \'Instructions file 3.\'',
										'applyTo: "**/folder2/*.tsx"',
										'---',
										'Some instructions 3 contents.',
									],
								},
								{
									name: 'file4.instructions.md',
									contents: [
										'---',
										'description: \'Instructions file 4.\'',
										'applyTo: "src/build/*.tsx"',
										'---',
										'[](./file3.instructions.md) Some instructions 4 contents.',
									],
								},
								{
									name: 'file5.prompt.md',
									contents: [
										'---',
										'description: \'Prompt file 5.\'',
										'---',
										'Some prompt 5 contents.',
									],
								},
							],
						},
						{
							name: 'folder1',
							children: [
								{
									name: 'main.tsx',
									contents: 'console.log("Haalou!")',
								},
							],
						},
					],
				}])).mock();

			// mock user data instructions
			await (instaService.createInstance(MockFilesystem, [
				{
					name: userPromptsFolderName,
					children: [
						{
							name: 'file10.instructions.md',
							contents: [
								'---',
								'description: \'Instructions file 10.\'',
								'applyTo: "**/folder1/*.tsx"',
								'---',
								'Some instructions 10 contents.',
							],
						},
						{
							name: 'file11.instructions.md',
							contents: [
								'---',
								'description: \'Instructions file 11.\'',
								'applyTo: "**/folder1/*.py"',
								'---',
								'Some instructions 11 contents.',
							],
						},
						{
							name: 'file12.prompt.md',
							contents: [
								'---',
								'description: \'Prompt file 12.\'',
								'---',
								'Some prompt 12 contents.',
							],
						},
					],
				}
			])).mock();

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
			await (instaService.createInstance(MockFilesystem,
				[{
					name: rootFolderName,
					children: [
						{
							name: 'codestyle.md',
							contents: [
								'Can you see this?',
							],
						},
						{
							name: 'AGENTS.md',
							contents: [
								'What about this?',
							],
						},
						{
							name: 'README.md',
							contents: [
								'Thats my project?',
							],
						},
						{
							name: '.github',
							children: [
								{
									name: 'copilot-instructions.md',
									contents: [
										'Be nice and friendly. Also look at instructions at #file:../codestyle.md and [more-codestyle.md](./more-codestyle.md).',
									],
								},
								{
									name: 'more-codestyle.md',
									contents: [
										'I like it clean.',
									],
								},
							],
						},
						{
							name: 'folder1',
							children: [
								// This will not be returned because we have PromptsConfig.USE_NESTED_AGENT_MD set to false.
								{
									name: 'AGENTS.md',
									contents: [
										'An AGENTS.md file in another repo'
									]
								}
							]
						}
					],
				}])).mock();


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

			await (instaService.createInstance(MockFilesystem,
				[{
					name: rootFolderName,
					children: [
						{
							name: '.github/agents',
							children: [
								{
									name: 'agent1.agent.md',
									contents: [
										'---',
										'description: \'Agent file 1.\'',
										'handoffs: [ { agent: "Edit", label: "Do it", prompt: "Do it now" } ]',
										'---',
									],
								}
							],

						},
					],
				}])).mock();

			const result = (await service.getCustomAgents(CancellationToken.None)).map(agent => ({ ...agent, uri: URI.from(agent.uri) }));
			const expected: ICustomAgent[] = [
				{
					name: 'agent1',
					description: 'Agent file 1.',
					handOffs: [{ agent: 'Edit', label: 'Do it', prompt: 'Do it now', send: undefined }],
					agentInstructions: {
						content: '',
						toolReferences: [],
						metadata: undefined
					},
					model: undefined,
					argumentHint: undefined,
					tools: undefined,
					target: undefined,
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
			await (instaService.createInstance(MockFilesystem,
				[{
					name: rootFolderName,
					children: [
						{
							name: '.github/agents',
							children: [
								{
									name: 'agent1.agent.md',
									contents: [
										'---',
										'description: \'Agent file 1.\'',
										'tools: [ tool1, tool2 ]',
										'---',
										'Do it with #tool:tool1',
									],
								},
								{
									name: 'agent2.agent.md',
									contents: [
										'First use #tool:tool2\nThen use #tool:tool1',
									],
								}
							],

						},
					],
				}])).mock();

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

			await (instaService.createInstance(MockFilesystem,
				[{
					name: rootFolderName,
					children: [
						{
							name: '.github/agents',
							children: [
								{
									name: 'agent1.agent.md',
									contents: [
										'---',
										'description: \'Code review agent.\'',
										'argument-hint: \'Provide file path or code snippet to review\'',
										'tools: [ code-analyzer, linter ]',
										'---',
										'I will help review your code for best practices.',
									],
								},
								{
									name: 'agent2.agent.md',
									contents: [
										'---',
										'description: \'Documentation generator.\'',
										'argument-hint: \'Specify function or class name to document\'',
										'---',
										'I generate comprehensive documentation.',
									],
								}
							],

						},
					],
				}])).mock();

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

			await (instaService.createInstance(MockFilesystem,
				[{
					name: rootFolderName,
					children: [
						{
							name: '.github/agents',
							children: [
								{
									name: 'github-agent.agent.md',
									contents: [
										'---',
										'description: \'GitHub Copilot specialized agent.\'',
										'target: \'github-copilot\'',
										'tools: [ github-api, code-search ]',
										'---',
										'I am optimized for GitHub Copilot workflows.',
									],
								},
								{
									name: 'vscode-agent.agent.md',
									contents: [
										'---',
										'description: \'VS Code specialized agent.\'',
										'target: \'vscode\'',
										'model: \'gpt-4\'',
										'---',
										'I am specialized for VS Code editor tasks.',
									],
								},
								{
									name: 'generic-agent.agent.md',
									contents: [
										'---',
										'description: \'Generic agent without target.\'',
										'---',
										'I work everywhere.',
									],
								}
							],

						},
					],
				}])).mock();

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

			await (instaService.createInstance(MockFilesystem,
				[{
					name: rootFolderName,
					children: [
						{
							name: '.github/agents',
							children: [
								{
									name: 'demonstrate.md',
									contents: [
										'---',
										'description: \'Demonstrate agent.\'',
										'tools: [ demo-tool ]',
										'---',
										'This is a demonstration agent using .md extension.',
									],
								},
								{
									name: 'test.md',
									contents: [
										'Test agent without header.',
									],
								}
							],

						},
					],
				}])).mock();

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
				'TextMate Instructions',
				'Instructions to follow when authoring TextMate grammars',
				uri,
				extension
			);

			const actual = await service.listPromptFiles(PromptsType.instructions, CancellationToken.None);
			assert.strictEqual(actual.length, 1);
			assert.strictEqual(actual[0].uri.toString(), uri.toString());
			assert.strictEqual(actual[0].name, 'TextMate Instructions');
			assert.strictEqual(actual[0].storage, PromptsStorage.extension);
			assert.strictEqual(actual[0].type, PromptsType.instructions);
			registered.dispose();
		});
	});
});
