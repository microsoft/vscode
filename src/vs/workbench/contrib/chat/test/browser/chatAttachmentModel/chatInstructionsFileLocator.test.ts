/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Schemas } from '../../../../../../base/common/network.js';
import { basename } from '../../../../../../base/common/resources.js';
import { PromptFilesConfig } from '../../../common/promptSyntax/config.js';
import { createURI } from '../../common/promptSyntax/testUtils/createUri.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { mockObject, mockService } from '../../common/promptSyntax/testUtils/mock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IMockFolder, MockFilesystem } from '../../common/promptSyntax/testUtils/mockFilesystem.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ChatInstructionsFileLocator } from '../../../browser/chatAttachmentModel/chatInstructionsFileLocator.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IConfigurationOverrides, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IWorkspace, IWorkspaceContextService, IWorkspaceFolder } from '../../../../../../platform/workspace/common/workspace.js';
import { isWindows } from '../../../../../../base/common/platform.js';

/**
 * Mocked mocked instance of {@link IConfigurationService}.
 */
const mockConfigService = <T>(value: T): IConfigurationService => {
	return mockService<IConfigurationService>({
		getValue(key?: string | IConfigurationOverrides) {
			assert.strictEqual(
				key,
				PromptFilesConfig.CONFIG_KEY,
				`Mocked service supports only one configuration key: '${PromptFilesConfig.CONFIG_KEY}'.`,
			);

			return value;
		},
	});
};

/**
 * Mocked mocked instance of {@link IWorkspaceContextService}.
 */
const mockWorkspaceService = (folders: IWorkspaceFolder[]): IWorkspaceContextService => {
	return mockService<IWorkspaceContextService>({
		getWorkspace(): IWorkspace {
			return mockObject<IWorkspace>({
				folders,
			});
		},
	});
};

suite('ChatInstructionsFileLocator', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	if (isWindows) {
		return;
	}

	let initService: TestInstantiationService;
	setup(async () => {
		initService = disposables.add(new TestInstantiationService());
		initService.stub(ILogService, new NullLogService());

		const fileService = disposables.add(initService.createInstance(FileService));
		const fileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(Schemas.file, fileSystemProvider));

		initService.stub(IFileService, fileService);
	});

	/**
	 * Create a new instance of {@link ChatInstructionsFileLocator} with provided mocked
	 * values for configuration and workspace services.
	 */
	const createPromptsLocator = async (
		configValue: unknown,
		workspaceFolderPaths: string[],
		filesystem: IMockFolder[],
	): Promise<ChatInstructionsFileLocator> => {
		await (initService.createInstance(MockFilesystem, filesystem)).mock();

		initService.stub(IConfigurationService, mockConfigService(configValue));

		const workspaceFolders = workspaceFolderPaths.map((path, index) => {
			const uri = createURI(path);

			return mockObject<IWorkspaceFolder>({
				uri,
				name: basename(uri),
				index,
			});
		});
		initService.stub(IWorkspaceContextService, mockWorkspaceService(workspaceFolders));

		return initService.createInstance(ChatInstructionsFileLocator);
	};

	suite('• empty workspace', () => {
		const EMPTY_WORKSPACE: string[] = [];

		suite('• empty filesystem', () => {
			test('• no config value', async () => {
				const locator = await createPromptsLocator(undefined, EMPTY_WORKSPACE, []);

				assert.deepStrictEqual(
					await locator.listFiles([]),
					[],
					'No prompts must be found.',
				);
			});

			test('• object config value', async () => {
				const locator = await createPromptsLocator({
					'/Users/legomushroom/repos/prompts/': true,
					'/tmp/prompts/': false,
				}, EMPTY_WORKSPACE, []);

				assert.deepStrictEqual(
					await locator.listFiles([]),
					[],
					'No prompts must be found.',
				);
			});

			test('• array config value', async () => {
				const locator = await createPromptsLocator([
					'relative/path/to/prompts/',
					'/abs/path',
				], EMPTY_WORKSPACE, []);

				assert.deepStrictEqual(
					await locator.listFiles([]),
					[],
					'No prompts must be found.',
				);
			});

			test('• null config value', async () => {
				const locator = await createPromptsLocator(null, EMPTY_WORKSPACE, []);

				assert.deepStrictEqual(
					await locator.listFiles([]),
					[],
					'No prompts must be found.',
				);
			});

			test('• string config value', async () => {
				const locator = await createPromptsLocator('/etc/hosts/prompts', EMPTY_WORKSPACE, []);

				assert.deepStrictEqual(
					await locator.listFiles([]),
					[],
					'No prompts must be found.',
				);
			});
		});

		suite('• non-empty filesystem', () => {
			suite('• boolean config value', () => {
				test('• true', async () => {
					const locator = await createPromptsLocator(
						true,
						EMPTY_WORKSPACE,
						[
							{
								name: '/vsl/files/pmts',
								children: [
									{
										name: 'file.prompt.md',
										contents: 'some more random file contents',
									},
								],
							},
							{
								name: '/abs/prompts/files/misc',
								children: [
									{
										name: 'another.prompt.md',
										contents: 'hey hey hey',
									},
								],
							},
							{
								name: '/.github/prompts',
								children: [
									{
										name: 'my-prompt.prompt.md',
										contents: 'oh hi',
									},
								],
							},
						]);

					assert.deepStrictEqual(
						await locator.listFiles([]),
						[],
						'Must find correct prompts.',
					);
				});

				test('• false', async () => {
					const locator = await createPromptsLocator(
						false,
						EMPTY_WORKSPACE,
						[
							{
								name: '/vsl/pmts/files',
								children: [
									{
										name: 'omt.prompt.md',
										contents: 'some more random file contents',
									},
								],
							},
							{
								name: '/var/lib/prompts.shared',
								children: [
									{
										name: 'smt.prompt.md',
										contents: 'hey hey hey',
									},
								],
							},
							{
								name: '/.github/prompts',
								children: [
									{
										name: 'default.prompt.md',
										contents: 'oh hi',
									},
								],
							},
						]);

					assert.deepStrictEqual(
						await locator.listFiles([]),
						[],
						'Must find correct prompts.',
					);
				});
			});

			test('• object config value', async () => {
				const locator = await createPromptsLocator(
					{
						'/Users/legomushroom/repos/prompts': true,
						'/tmp/prompts/': true,
						'/absolute/path/prompts': false,
						'.copilot/prompts': true,
					},
					EMPTY_WORKSPACE,
					[
						{
							name: '/Users/legomushroom/repos/prompts',
							children: [
								{
									name: 'test.prompt.md',
									contents: 'Hello, World!',
								},
								{
									name: 'refactor-tests.prompt.md',
									contents: 'some file content goes here',
								},
							],
						},
						{
							name: '/tmp/prompts',
							children: [
								{
									name: 'translate.to-rust.prompt.md',
									contents: 'some more random file contents',
								},
							],
						},
						{
							name: '/absolute/path/prompts',
							children: [
								{
									name: 'some-prompt-file.prompt.md',
									contents: 'hey hey hey',
								},
							],
						},
					]);

				assert.deepStrictEqual(
					await locator.listFiles([]),
					[
						createURI('/Users/legomushroom/repos/prompts/test.prompt.md'),
						createURI('/Users/legomushroom/repos/prompts/refactor-tests.prompt.md'),
						createURI('/tmp/prompts/translate.to-rust.prompt.md'),
					],
					'Must find correct prompts.',
				);
			});

			test('• array config value', async () => {
				const locator = await createPromptsLocator(
					[
						'/var/prompts',
						'/usr/local/prompts/',
						'.github/prompts',
					],
					EMPTY_WORKSPACE,
					[
						{
							name: '/var/prompts',
							children: [
								{
									name: 'alpha.prompt.md',
									contents: 'Hello, World!',
								},
								{
									name: 'beta.prompt.md',
									contents: 'some file content goes here',
								},
							],
						},
						{
							name: '/usr/local/prompts',
							children: [
								{
									name: 'gamma.prompt.md',
									contents: 'some more random file contents',
								},
							],
						},
						{
							name: '/data/prompts',
							children: [
								{
									name: 'some-prompt-file.prompt.md',
									contents: 'hey hey hey',
								},
							],
						},
					]);

				assert.deepStrictEqual(
					await locator.listFiles([]),
					[
						createURI('/var/prompts/alpha.prompt.md'),
						createURI('/var/prompts/beta.prompt.md'),
						createURI('/usr/local/prompts/gamma.prompt.md'),
					],
					'Must find correct prompts.',
				);
			});
		});
	});

	suite('• single-root workspace', () => {
		suite('• non-empty filesystem', () => {
			test('• object config value', async () => {
				const locator = await createPromptsLocator(
					{
						'/Users/legomushroom/repos/prompts': true,
						'/tmp/prompts/': true,
						'/absolute/path/prompts': false,
						'.copilot/prompts': true,
						'.github/prompts': false,
					},
					[
						'/Users/legomushroom/repos/vscode',
					],
					[
						{
							name: '/Users/legomushroom/repos/prompts',
							children: [
								{
									name: 'test.prompt.md',
									contents: 'Hello, World!',
								},
								{
									name: 'refactor-tests.prompt.md',
									contents: 'some file content goes here',
								},
							],
						},
						{
							name: '/tmp/prompts',
							children: [
								{
									name: 'translate.to-rust.prompt.md',
									contents: 'some more random file contents',
								},
							],
						},
						{
							name: '/absolute/path/prompts',
							children: [
								{
									name: 'some-prompt-file.prompt.md',
									contents: 'hey hey hey',
								},
							],
						},
						{
							name: '/Users/legomushroom/repos/vscode',
							children: [
								{
									name: '.copilot/prompts',
									children: [
										{
											name: 'default.prompt.md',
											contents: 'oh hi, robot!',
										},
									],
								},
								{
									name: '.github/prompts',
									children: [
										{
											name: 'default.prompt.md',
											contents: 'oh hi, bot!',
										},
									],
								},
							],
						},
					]);

				assert.deepStrictEqual(
					await locator.listFiles([]),
					[
						createURI('/Users/legomushroom/repos/prompts/test.prompt.md'),
						createURI('/Users/legomushroom/repos/prompts/refactor-tests.prompt.md'),
						createURI('/tmp/prompts/translate.to-rust.prompt.md'),
						createURI('/Users/legomushroom/repos/vscode/.copilot/prompts/default.prompt.md'),
					],
					'Must find correct prompts.',
				);
			});

			test('• array config value', async () => {
				const locator = await createPromptsLocator(
					[
						'/Users/legomushroom/repos/prompts',
						'/tmp/prompts/',
						'.copilot/prompts',
					],
					[
						'/Users/legomushroom/repos/vscode',
					],
					[
						{
							name: '/Users/legomushroom/repos/prompts',
							children: [
								{
									name: 'test.prompt.md',
									contents: 'Hello, World!',
								},
								{
									name: 'refactor-tests.prompt.md',
									contents: 'some file content goes here',
								},
							],
						},
						{
							name: '/tmp/prompts',
							children: [
								{
									name: 'translate.to-rust.prompt.md',
									contents: 'some more random file contents',
								},
							],
						},
						{
							name: '/absolute/path/prompts',
							children: [
								{
									name: 'some-prompt-file.prompt.md',
									contents: 'hey hey hey',
								},
							],
						},
						{
							name: '/Users/legomushroom/repos/vscode',
							children: [
								{
									name: '.copilot/prompts',
									children: [
										{
											name: 'default.prompt.md',
											contents: 'oh hi, robot!',
										},
									],
								},
								{
									name: '.github/prompts',
									children: [
										{
											name: 'default.prompt.md',
											contents: 'oh hi, bot!',
										},
									],
								},
							],
						},
					]);

				assert.deepStrictEqual(
					await locator.listFiles([]),
					[
						createURI('/Users/legomushroom/repos/prompts/test.prompt.md'),
						createURI('/Users/legomushroom/repos/prompts/refactor-tests.prompt.md'),
						createURI('/tmp/prompts/translate.to-rust.prompt.md'),
						createURI('/Users/legomushroom/repos/vscode/.copilot/prompts/default.prompt.md'),
					],
					'Must find correct prompts.',
				);
			});

			suite('• string config value', () => {
				test('• relative path', async () => {
					const locator = await createPromptsLocator(
						'.github/prompts',
						[
							'/Users/legomushroom/test/vscode',
						],
						[
							{
								name: '/tmp/prompts',
								children: [
									{
										name: 'translate.to-rust.prompt.md',
										contents: 'some more random file contents',
									},
								],
							},
							{
								name: '/absolute/path/prompts',
								children: [
									{
										name: 'some-prompt-file.prompt.md',
										contents: 'hey hey hey',
									},
								],
							},
							{
								name: '/Users/legomushroom/test/vscode',
								children: [
									{
										name: '.copilot/prompts',
										children: [
											{
												name: 'default.prompt.md',
												contents: 'oh hi, robot!',
											},
										],
									},
									{
										name: '.github/prompts',
										children: [
											{
												name: 'default-github.prompt.md',
												contents: 'oh hi, raw-bot!',
											},
										],
									},
								],
							},
						]);

					assert.deepStrictEqual(
						await locator.listFiles([]),
						[
							createURI('/Users/legomushroom/test/vscode/.github/prompts/default-github.prompt.md'),
						],
						'Must find correct prompts.',
					);
				});

				test('• absolute path', async () => {
					const locator = await createPromptsLocator(
						'/Users/legomushroom/test/prompts',
						[
							'/Users/legomushroom/test/vscode',
						],
						[
							{
								name: '/Users/legomushroom/test/prompts',
								children: [
									{
										name: 'test.prompt.md',
										contents: 'Hello, World!',
									},
									{
										name: 'refactor-tests.prompt.md',
										contents: 'some file content goes here',
									},
								],
							},
							{
								name: '/tmp/prompts',
								children: [
									{
										name: 'translate.to-rust.prompt.md',
										contents: 'some more random file contents',
									},
								],
							},
							{
								name: '/absolute/path/prompts',
								children: [
									{
										name: 'some-prompt-file.prompt.md',
										contents: 'hey hey hey',
									},
								],
							},
							{
								name: '/Users/legomushroom/test/vscode',
								children: [
									{
										name: '.copilot/prompts',
										children: [
											{
												name: 'default.prompt.md',
												contents: 'oh hi, robot!',
											},
										],
									},
									{
										name: '.github/prompts',
										children: [
											{
												name: 'default.prompt.md',
												contents: 'oh hi, bot!',
											},
										],
									},
								],
							},
						]);

					assert.deepStrictEqual(
						await locator.listFiles([]),
						[
							createURI('/Users/legomushroom/test/prompts/test.prompt.md'),
							createURI('/Users/legomushroom/test/prompts/refactor-tests.prompt.md'),
						],
						'Must find correct prompts.',
					);
				});
			});
		});
	});

	suite('• multi-root workspace', () => {
		suite('• non-empty filesystem', () => {
			suite('• object config value', () => {
				test('• without top-level `.github` folder', async () => {
					const locator = await createPromptsLocator(
						{
							'/Users/legomushroom/repos/prompts': true,
							'/tmp/prompts/': true,
							'/absolute/path/prompts': false,
							'.copilot/prompts': false,
							'.github/prompts': true,
						},
						[
							'/Users/legomushroom/repos/vscode',
							'/Users/legomushroom/repos/node',
						],
						[
							{
								name: '/Users/legomushroom/repos/prompts',
								children: [
									{
										name: 'test.prompt.md',
										contents: 'Hello, World!',
									},
									{
										name: 'refactor-tests.prompt.md',
										contents: 'some file content goes here',
									},
								],
							},
							{
								name: '/tmp/prompts',
								children: [
									{
										name: 'translate.to-rust.prompt.md',
										contents: 'some more random file contents',
									},
								],
							},
							{
								name: '/absolute/path/prompts',
								children: [
									{
										name: 'some-prompt-file.prompt.md',
										contents: 'hey hey hey',
									},
								],
							},
							{
								name: '/Users/legomushroom/repos/vscode',
								children: [
									{
										name: '.copilot/prompts',
										children: [
											{
												name: 'prompt1.prompt.md',
												contents: 'oh hi, robot!',
											},
										],
									},
									{
										name: '.github/prompts',
										children: [
											{
												name: 'default.prompt.md',
												contents: 'oh hi, bot!',
											},
										],
									},
								],
							},
							{
								name: '/Users/legomushroom/repos/node',
								children: [
									{
										name: '.copilot/prompts',
										children: [
											{
												name: 'prompt5.prompt.md',
												contents: 'oh hi, robot!',
											},
										],
									},
									{
										name: '.github/prompts',
										children: [
											{
												name: 'refactor-static-classes.prompt.md',
												contents: 'file contents',
											},
										],
									},
								],
							},
							// note! this folder is not part of the workspace, so prompt files are `ignored`
							{
								name: '/Users/legomushroom/repos/.github/prompts',
								children: [
									{
										name: 'prompt-name.prompt.md',
										contents: 'oh hi, robot!',
									},
									{
										name: 'name-of-the-prompt.prompt.md',
										contents: 'oh hi, raw bot!',
									},
								],
							},
						]);

					assert.deepStrictEqual(
						await locator.listFiles([]),
						[
							createURI('/Users/legomushroom/repos/prompts/test.prompt.md'),
							createURI('/Users/legomushroom/repos/prompts/refactor-tests.prompt.md'),
							createURI('/tmp/prompts/translate.to-rust.prompt.md'),
							createURI('/Users/legomushroom/repos/vscode/.github/prompts/default.prompt.md'),
							createURI('/Users/legomushroom/repos/node/.github/prompts/refactor-static-classes.prompt.md'),
						],
						'Must find correct prompts.',
					);
				});

				test('• with top-level `.github` folder', async () => {
					const locator = await createPromptsLocator(
						{
							'/Users/legomushroom/repos/prompts': true,
							'/tmp/prompts/': true,
							'/absolute/path/prompts': false,
							'.copilot/prompts': false,
							'.github/prompts': true,
						},
						[
							'/Users/legomushroom/repos/vscode',
							'/Users/legomushroom/repos/node',
							'/var/shared/prompts/.github',
						],
						[
							{
								name: '/Users/legomushroom/repos/prompts',
								children: [
									{
										name: 'test.prompt.md',
										contents: 'Hello, World!',
									},
									{
										name: 'refactor-tests.prompt.md',
										contents: 'some file content goes here',
									},
								],
							},
							{
								name: '/tmp/prompts',
								children: [
									{
										name: 'translate.to-rust.prompt.md',
										contents: 'some more random file contents',
									},
								],
							},
							{
								name: '/absolute/path/prompts',
								children: [
									{
										name: 'some-prompt-file.prompt.md',
										contents: 'hey hey hey',
									},
								],
							},
							{
								name: '/Users/legomushroom/repos/vscode',
								children: [
									{
										name: '.copilot/prompts',
										children: [
											{
												name: 'prompt1.prompt.md',
												contents: 'oh hi, robot!',
											},
										],
									},
									{
										name: '.github/prompts',
										children: [
											{
												name: 'default.prompt.md',
												contents: 'oh hi, bot!',
											},
										],
									},
								],
							},
							{
								name: '/Users/legomushroom/repos/node',
								children: [
									{
										name: '.copilot/prompts',
										children: [
											{
												name: 'prompt5.prompt.md',
												contents: 'oh hi, robot!',
											},
										],
									},
									{
										name: '.github/prompts',
										children: [
											{
												name: 'refactor-static-classes.prompt.md',
												contents: 'file contents',
											},
										],
									},
								],
							},
							// note! this folder is part of the workspace, so prompt files are `included`
							{
								name: '/var/shared/prompts/.github/prompts',
								children: [
									{
										name: 'prompt-name.prompt.md',
										contents: 'oh hi, robot!',
									},
									{
										name: 'name-of-the-prompt.prompt.md',
										contents: 'oh hi, raw bot!',
									},
								],
							},
						]);

					assert.deepStrictEqual(
						await locator.listFiles([]),
						[
							createURI('/Users/legomushroom/repos/prompts/test.prompt.md'),
							createURI('/Users/legomushroom/repos/prompts/refactor-tests.prompt.md'),
							createURI('/tmp/prompts/translate.to-rust.prompt.md'),
							createURI('/Users/legomushroom/repos/vscode/.github/prompts/default.prompt.md'),
							createURI('/Users/legomushroom/repos/node/.github/prompts/refactor-static-classes.prompt.md'),
							createURI('/var/shared/prompts/.github/prompts/prompt-name.prompt.md'),
							createURI('/var/shared/prompts/.github/prompts/name-of-the-prompt.prompt.md'),
						],
						'Must find correct prompts.',
					);
				});
			});

			suite('• array config value', () => {
				test('• without top-level `copilot` folder', async () => {
					const locator = await createPromptsLocator(
						[
							'/Users/legomushroom/repos/prompts',
							'/tmp/prompts/',
							'copilot/PROMPTS/',
						],
						[
							'/Users/legomushroom/repos/vscode',
							'/Users/legomushroom/repos/node',
						],
						[
							{
								name: '/Users/legomushroom/repos/prompts',
								children: [
									{
										name: 'test.prompt.md',
										contents: 'Hello, World!',
									},
									{
										name: 'refactor-tests.prompt.md',
										contents: 'some file content goes here',
									},
								],
							},
							{
								name: '/tmp/prompts',
								children: [
									{
										name: 'translate.to-rust.prompt.md',
										contents: 'some more random file contents',
									},
								],
							},
							{
								name: '/absolute/path/prompts',
								children: [
									{
										name: 'some-prompt-file.prompt.md',
										contents: 'hey hey hey',
									},
								],
							},
							{
								name: '/Users/legomushroom/repos/vscode',
								children: [
									{
										name: 'copilot/PROMPTS',
										children: [
											{
												name: 'prompt1.prompt.md',
												contents: 'oh hi, robot!',
											},
											{
												name: 'prompt2.prompt.md',
												contents: 'oh hi, raw boot!',
											},
										],
									},
									{
										name: '.github/prompts',
										children: [
											{
												name: 'default.prompt.md',
												contents: 'oh hi, bot!',
											},
										],
									},
								],
							},
							{
								name: '/Users/legomushroom/repos/node',
								children: [
									{
										name: 'copilot/PROMPTS',
										children: [
											{
												name: 'Build-Constructed-Structures.prompt.md',
												contents: 'oh hi, robot!',
											},
										],
									},
									{
										name: '.github/prompts',
										children: [
											{
												name: 'refactor-static-classes.prompt.md',
												contents: 'file contents',
											},
										],
									},
								],
							},
							// note! this folder is not part of the workspace, so prompt files are `ignored`
							{
								name: '/Users/legomushroom/repos/copilot/PROMPTS',
								children: [
									{
										name: 'prompt-name.prompt.md',
										contents: 'oh hi, robot!',
									},
									{
										name: 'name-of-the-prompt.prompt.md',
										contents: 'oh hi, raw bot!',
									},
								],
							},
							// note! this folder is not part of the workspace, so prompt files are `ignored`
							{
								name: '/Users/legomushroom/repos/.github/prompts',
								children: [
									{
										name: 'prompt-name-22.prompt.md',
										contents: 'oh hi, robot!',
									},
									{
										name: 'name-of-the-prompt-56.prompt.md',
										contents: 'oh hi, raw bot!',
									},
								],
							},
						]);

					assert.deepStrictEqual(
						await locator.listFiles([]),
						[
							createURI('/Users/legomushroom/repos/prompts/test.prompt.md'),
							createURI('/Users/legomushroom/repos/prompts/refactor-tests.prompt.md'),
							createURI('/tmp/prompts/translate.to-rust.prompt.md'),
							createURI('/Users/legomushroom/repos/vscode/copilot/PROMPTS/prompt1.prompt.md'),
							createURI('/Users/legomushroom/repos/vscode/copilot/PROMPTS/prompt2.prompt.md'),
							createURI('/Users/legomushroom/repos/node/copilot/PROMPTS/Build-Constructed-Structures.prompt.md'),
						],
						'Must find correct prompts.',
					);
				});

				test('• with top-level `copilot` folder', async () => {
					const locator = await createPromptsLocator(
						[
							'/Users/legomushroom/repos/prompts',
							'/tmp/prompts/',
							'copilot/PROMPTS/',
						],
						[
							'/Users/legomushroom/repos/vscode',
							'/Users/legomushroom/repos/node',
							'/Users/legomushroom/repos/copilot/',
						],
						[
							{
								name: '/Users/legomushroom/repos/prompts',
								children: [
									{
										name: 'test.prompt.md',
										contents: 'Hello, World!',
									},
									{
										name: 'refactor-tests.prompt.md',
										contents: 'some file content goes here',
									},
								],
							},
							{
								name: '/tmp/prompts',
								children: [
									{
										name: 'translate.to-rust.prompt.md',
										contents: 'some more random file contents',
									},
								],
							},
							{
								name: '/absolute/path/prompts',
								children: [
									{
										name: 'some-prompt-file.prompt.md',
										contents: 'hey hey hey',
									},
								],
							},
							{
								name: '/Users/legomushroom/repos/vscode',
								children: [
									{
										name: 'copilot/PROMPTS',
										children: [
											{
												name: 'prompt1.prompt.md',
												contents: 'oh hi, robot!',
											},
											{
												name: 'prompt2.prompt.md',
												contents: 'oh hi, raw boot!',
											},
										],
									},
									{
										name: '.github/prompts',
										children: [
											{
												name: 'default.prompt.md',
												contents: 'oh hi, bot!',
											},
										],
									},
								],
							},
							{
								name: '/Users/legomushroom/repos/node',
								children: [
									{
										name: 'copilot/PROMPTS',
										children: [
											{
												name: 'Build-Constructed-Structures.prompt.md',
												contents: 'oh hi, robot!',
											},
										],
									},
									{
										name: '.github/prompts',
										children: [
											{
												name: 'refactor-static-classes.prompt.md',
												contents: 'file contents',
											},
										],
									},
								],
							},
							// note! this folder is not part of the workspace, so prompt files are `included`
							{
								name: '/Users/legomushroom/repos/copilot/PROMPTS',
								children: [
									{
										name: 'prompt-name.tests.prompt.md',
										contents: 'oh hi, robot!',
									},
									{
										name: 'name-of-the-prompt.tests.prompt.md',
										contents: 'oh hi, raw bot!',
									},
								],
							},
							// note! this folder is not part of the workspace, so prompt files are `ignored`
							{
								name: '/Users/legomushroom/repos/.github/prompts',
								children: [
									{
										name: 'prompt-name-22.prompt.md',
										contents: 'oh hi, robot!',
									},
									{
										name: 'name-of-the-prompt-56.prompt.md',
										contents: 'oh hi, raw bot!',
									},
								],
							},
						]);

					assert.deepStrictEqual(
						await locator.listFiles([]),
						[
							createURI('/Users/legomushroom/repos/prompts/test.prompt.md'),
							createURI('/Users/legomushroom/repos/prompts/refactor-tests.prompt.md'),
							createURI('/tmp/prompts/translate.to-rust.prompt.md'),
							createURI('/Users/legomushroom/repos/vscode/copilot/PROMPTS/prompt1.prompt.md'),
							createURI('/Users/legomushroom/repos/vscode/copilot/PROMPTS/prompt2.prompt.md'),
							createURI('/Users/legomushroom/repos/node/copilot/PROMPTS/Build-Constructed-Structures.prompt.md'),
							createURI('/Users/legomushroom/repos/copilot/PROMPTS/prompt-name.tests.prompt.md'),
							createURI('/Users/legomushroom/repos/copilot/PROMPTS/name-of-the-prompt.tests.prompt.md'),
						],
						'Must find correct prompts.',
					);
				});
			});

			suite('• string config value', () => {
				suite('• absolute path', () => {
					test('• without top-level `copilot` folder', async () => {
						const locator = await createPromptsLocator(
							'/tmp/prompts/',
							[
								'/Users/legomushroom/repos/vscode',
								'/Users/legomushroom/repos/node',
							],
							[
								{
									name: '/Users/legomushroom/repos/prompts',
									children: [
										{
											name: 'test.prompt.md',
											contents: 'Hello, World!',
										},
										{
											name: 'refactor-tests.prompt.md',
											contents: 'some file content goes here',
										},
									],
								},
								{
									name: '/tmp/prompts',
									children: [
										{
											name: 'translate.to-go.prompt.md',
											contents: 'some more random file contents',
										},
										{
											name: 'find-mean-error-rate.prompt.md',
											contents: 'random file contents',
										},
										{
											name: '.github',
											children: [
												{
													name: 'prompts',
													children: [
														{
															name: 'github-prompt.prompt.md',
															contents: 'oh hi, bot!',
														},
													],
												},
											],
										},
									],
								},
								{
									name: '/absolute/path/prompts',
									children: [
										{
											name: 'some-prompt-file.prompt.md',
											contents: 'hey hey hey',
										},
									],
								},
								{
									name: '/Users/legomushroom/repos/vscode',
									children: [
										{
											name: 'copilot/PROMPTS',
											children: [
												{
													name: 'prompt1.prompt.md',
													contents: 'oh hi, robot!',
												},
												{
													name: 'prompt2.prompt.md',
													contents: 'oh hi, raw boot!',
												},
											],
										},
										{
											name: '.github/prompts',
											children: [
												{
													name: 'default.prompt.md',
													contents: 'oh hi, bot!',
												},
											],
										},
									],
								},
								{
									name: '/Users/legomushroom/repos/node',
									children: [
										{
											name: 'copilot/PROMPTS',
											children: [
												{
													name: 'Build-Constructed-Structures.prompt.md',
													contents: 'oh hi, robot!',
												},
											],
										},
										{
											name: '.github/prompts',
											children: [
												{
													name: 'refactor-static-classes.prompt.md',
													contents: 'file contents',
												},
											],
										},
									],
								},
								{
									name: '/Users/legomushroom/repos/copilot/PROMPTS',
									children: [
										{
											name: 'prompt-name.prompt.md',
											contents: 'oh hi, robot!',
										},
										{
											name: 'name-of-the-prompt.prompt.md',
											contents: 'oh hi, raw bot!',
										},
									],
								},
								{
									name: '/Users/legomushroom/repos/.github/prompts',
									children: [
										{
											name: 'prompt-name-22.prompt.md',
											contents: 'oh hi, robot!',
										},
										{
											name: 'name-of-the-prompt-56.prompt.md',
											contents: 'oh hi, raw bot!',
										},
									],
								},
							]);

						assert.deepStrictEqual(
							await locator.listFiles([]),
							[
								createURI('/tmp/prompts/translate.to-go.prompt.md'),
								createURI('/tmp/prompts/find-mean-error-rate.prompt.md'),
							],
							'Must find correct prompts.',
						);
					});

					test('• with top-level `.github` folder', async () => {
						const locator = await createPromptsLocator(
							'/Users/legomushroom/repos/prompts',
							[
								'/Users/legomushroom/repos/vscode',
								'/Users/legomushroom/repos/node',
								'/Users/legomushroom/repos/.github/',
							],
							[
								{
									name: '/Users/legomushroom/repos/prompts',
									children: [
										{
											name: 'test.file.prompt.md',
											contents: 'Hello, World!',
										},
										{
											name: 'refactor-tests.file.prompt.md',
											contents: 'some file content goes here',
										},
									],
								},
								{
									name: '/tmp/prompts',
									children: [
										{
											name: 'translate.to-rust.prompt.md',
											contents: 'some more random file contents',
										},
									],
								},
								{
									name: '/absolute/path/prompts',
									children: [
										{
											name: 'some-prompt-file.prompt.md',
											contents: 'hey hey hey',
										},
									],
								},
								{
									name: '/Users/legomushroom/repos/vscode',
									children: [
										{
											name: 'copilot/PROMPTS',
											children: [
												{
													name: 'prompt1.prompt.md',
													contents: 'oh hi, robot!',
												},
												{
													name: 'prompt2.prompt.md',
													contents: 'oh hi, raw boot!',
												},
											],
										},
										{
											name: '.github/prompts',
											children: [
												{
													name: 'default.prompt.md',
													contents: 'oh hi, bot!',
												},
											],
										},
									],
								},
								{
									name: '/Users/legomushroom/repos/node',
									children: [
										{
											name: '.copilot/PROMPTS',
											children: [
												{
													name: 'Build-Constructed-Structures.prompt.md',
													contents: 'oh hi, robot!',
												},
											],
										},
										{
											name: '.github/prompts',
											children: [
												{
													name: 'refactor-static-classes.prompt.md',
													contents: 'file contents',
												},
											],
										},
									],
								},
								{
									name: '/Users/legomushroom/repos/copilot/PROMPTS',
									children: [
										{
											name: 'prompt-name.tests.prompt.md',
											contents: 'oh hi, robot!',
										},
										{
											name: 'name-of-the-prompt.tests.prompt.md',
											contents: 'oh hi, raw bot!',
										},
									],
								},
								// note! this folder is not part of the workspace, so prompt files are `ignored`
								{
									name: '/Users/legomushroom/repos/.github/prompts',
									children: [
										{
											name: 'prompt-name-22.prompt.md',
											contents: 'oh hi, robot!',
										},
										{
											name: 'name-of-the-prompt-56.prompt.md',
											contents: 'oh hi, raw bot!',
										},
									],
								},
							]);

						assert.deepStrictEqual(
							await locator.listFiles([]),
							[
								createURI('/Users/legomushroom/repos/prompts/test.file.prompt.md'),
								createURI('/Users/legomushroom/repos/prompts/refactor-tests.file.prompt.md'),
							],
							'Must find correct prompts.',
						);
					});
				});

				suite('• relative path', () => {
					test('• without top-level `my-prompts` folder', async () => {
						const locator = await createPromptsLocator(
							'my-prompts',
							[
								'/Users/legomushroom/repos/vscode',
								'/Users/legomushroom/repos/node',
							],
							[
								{
									name: '/Users/legomushroom/repos/prompts',
									children: [
										{
											name: 'test.prompt.md',
											contents: 'Hello, World!',
										},
										{
											name: 'refactor-tests.prompt.md',
											contents: 'some file content goes here',
										},
									],
								},
								{
									name: '/tmp/prompts',
									children: [
										{
											name: 'translate.to-go.prompt.md',
											contents: 'some more random file contents',
										},
										{
											name: 'find-mean-error-rate.prompt.md',
											contents: 'random file contents',
										},
										{
											name: '.github',
											children: [
												{
													name: 'prompts',
													children: [
														{
															name: 'github-prompt.prompt.md',
															contents: 'oh hi, bot!',
														},
													],
												},
											],
										},
										{
											name: 'my-prompts',
											children: [
												{
													name: 'github-prompt.prompt.md',
													contents: 'oh hi, bot!',
												},
											],
										},
									],
								},
								{
									name: '/absolute/path/prompts',
									children: [
										{
											name: 'some-prompt-file.prompt.md',
											contents: 'hey hey hey',
										},
									],
								},
								{
									name: '/Users/legomushroom/repos/vscode',
									children: [
										{
											name: 'my-prompts',
											children: [
												{
													name: 'prompt1.prompt.md',
													contents: 'oh hi, robot!',
												},
												{
													name: 'prompt2.prompt.md',
													contents: 'oh hi, raw boot!',
												},
											],
										},
										{
											name: '.github/prompts',
											children: [
												{
													name: 'default.prompt.md',
													contents: 'oh hi, bot!',
												},
											],
										},
									],
								},
								{
									name: '/Users/legomushroom/repos/node',
									children: [
										{
											name: 'my-prompts',
											children: [
												{
													name: 'Build-Constructed-Structures.prompt.md',
													contents: 'oh hi, robot!',
												},
											],
										},
										{
											name: '.github/prompts',
											children: [
												{
													name: 'refactor-static-classes.prompt.md',
													contents: 'file contents',
												},
											],
										},
									],
								},
								{
									name: '/Users/legomushroom/repos/my-prompts',
									children: [
										{
											name: 'prompt-name.prompt.md',
											contents: 'oh hi, robot!',
										},
										{
											name: 'name-of-the-prompt.prompt.md',
											contents: 'oh hi, raw bot!',
										},
									],
								},
								{
									name: '/Users/legomushroom/repos/.github/prompts',
									children: [
										{
											name: 'prompt-name-22.prompt.md',
											contents: 'oh hi, robot!',
										},
										{
											name: 'name-of-the-prompt-56.prompt.md',
											contents: 'oh hi, raw bot!',
										},
									],
								},
							]);

						assert.deepStrictEqual(
							await locator.listFiles([]),
							[
								createURI('/Users/legomushroom/repos/vscode/my-prompts/prompt1.prompt.md'),
								createURI('/Users/legomushroom/repos/vscode/my-prompts/prompt2.prompt.md'),
								createURI('/Users/legomushroom/repos/node/my-prompts/Build-Constructed-Structures.prompt.md'),
							],
							'Must find correct prompts.',
						);
					});

					test('• with top-level `my-prompts` folder', async () => {
						const locator = await createPromptsLocator(
							'my-prompts',
							[
								'/Users/legomushroom/repos/vscode',
								'/Users/legomushroom/repos/node',
								'/Users/legomushroom/repos/my-prompts',
							],
							[
								{
									name: '/Users/legomushroom/repos/prompts',
									children: [
										{
											name: 'test.prompt.md',
											contents: 'Hello, World!',
										},
										{
											name: 'refactor-tests.prompt.md',
											contents: 'some file content goes here',
										},
									],
								},
								{
									name: '/tmp/prompts',
									children: [
										{
											name: 'translate.to-go.prompt.md',
											contents: 'some more random file contents',
										},
										{
											name: 'find-mean-error-rate.prompt.md',
											contents: 'random file contents',
										},
										{
											name: '.github',
											children: [
												{
													name: 'prompts',
													children: [
														{
															name: 'github-prompt.prompt.md',
															contents: 'oh hi, bot!',
														},
													],
												},
											],
										},
										{
											name: 'my-prompts',
											children: [
												{
													name: 'github-prompt.prompt.md',
													contents: 'oh hi, bot!',
												},
											],
										},
									],
								},
								{
									name: '/absolute/path/prompts',
									children: [
										{
											name: 'some-prompt-file.prompt.md',
											contents: 'hey hey hey',
										},
									],
								},
								{
									name: '/Users/legomushroom/repos/vscode',
									children: [
										{
											name: 'my-prompts',
											children: [
												{
													name: 'prompt1.prompt.md',
													contents: 'oh hi, robot!',
												},
												{
													name: 'prompt2.prompt.md',
													contents: 'oh hi, raw boot!',
												},
											],
										},
										{
											name: '.github/prompts',
											children: [
												{
													name: 'default.prompt.md',
													contents: 'oh hi, bot!',
												},
											],
										},
									],
								},
								{
									name: '/Users/legomushroom/repos/node',
									children: [
										{
											name: 'my-prompts',
											children: [
												{
													name: 'Build-Constructed-Structures.prompt.md',
													contents: 'oh hi, robot!',
												},
											],
										},
										{
											name: '.github/prompts',
											children: [
												{
													name: 'refactor-static-classes.prompt.md',
													contents: 'file contents',
												},
											],
										},
									],
								},
								{
									name: '/Users/legomushroom/repos/my-prompts',
									children: [
										{
											name: 'prompt.name.prompt.md',
											contents: 'oh hi, robot!',
										},
										{
											name: 'name.of.the.prompt.md',
											contents: 'oh hi, raw bot! why sad?',
										},
									],
								},
								{
									name: '/Users/legomushroom/repos/.github/prompts',
									children: [
										{
											name: 'prompt-name-22.prompt.md',
											contents: 'oh hi, robot!',
										},
										{
											name: 'name-of-the-prompt-56.prompt.md',
											contents: 'oh hi, raw bot!',
										},
									],
								},
							]);

						assert.deepStrictEqual(
							await locator.listFiles([]),
							[
								createURI('/Users/legomushroom/repos/vscode/my-prompts/prompt1.prompt.md'),
								createURI('/Users/legomushroom/repos/vscode/my-prompts/prompt2.prompt.md'),
								createURI('/Users/legomushroom/repos/node/my-prompts/Build-Constructed-Structures.prompt.md'),
								createURI('/Users/legomushroom/repos/my-prompts/prompt.name.prompt.md'),
								createURI('/Users/legomushroom/repos/my-prompts/name.of.the.prompt.md'),
							],
							'Must find correct prompts.',
						);
					});
				});
			});
		});
	});
});
