/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { createURI } from '../testUtils/createUri.js';
import { Schemas } from '../../../../../../../base/common/network.js';
import { basename } from '../../../../../../../base/common/resources.js';
import { isWindows } from '../../../../../../../base/common/platform.js';
import { IMockFolder, MockFilesystem } from '../testUtils/mockFilesystem.js';
import { IFileService } from '../../../../../../../platform/files/common/files.js';
import { PromptsConfig } from '../../../../../../../platform/prompts/common/config.js';
import { FileService } from '../../../../../../../platform/files/common/fileService.js';
import { ILogService, NullLogService } from '../../../../../../../platform/log/common/log.js';
import { PromptFilesLocator } from '../../../../common/promptSyntax/utils/promptFilesLocator.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { mockObject, mockService } from '../../../../../../../platform/prompts/test/common/utils/mock.js';
import { InMemoryFileSystemProvider } from '../../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IConfigurationOverrides, IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { IWorkspace, IWorkspaceContextService, IWorkspaceFolder } from '../../../../../../../platform/workspace/common/workspace.js';

/**
 * Mocked instance of {@link IConfigurationService}.
 */
const mockConfigService = <T>(value: T): IConfigurationService => {
	return mockService<IConfigurationService>({
		getValue(key?: string | IConfigurationOverrides) {
			assert(
				typeof key === 'string',
				`Expected string configuration key, got '${typeof key}'.`,
			);

			assert(
				[PromptsConfig.CONFIG_KEY, PromptsConfig.LOCATIONS_CONFIG_KEY].includes(key),
				`Unsupported configuration key '${key}'.`,
			);

			return value;
		},
	});
};

/**
 * Mocked instance of {@link IWorkspaceContextService}.
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

suite('PromptFilesLocator', () => {
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
	 * Create a new instance of {@link PromptFilesLocator} with provided mocked
	 * values for configuration and workspace services.
	 */
	const createPromptsLocator = async (
		configValue: unknown,
		workspaceFolderPaths: string[],
		filesystem: IMockFolder[],
	): Promise<PromptFilesLocator> => {
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

		return initService.createInstance(PromptFilesLocator);
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
		});
	});

	suite('• single-root workspace', () => {
		suite('• non-empty filesystem', () => {
			suite('• object config value', () => {
				test('• core logic', async () => {
					const locator = await createPromptsLocator(
						{
							'/Users/legomushroom/repos/prompts': true,
							'/tmp/prompts/': true,
							'/absolute/path/prompts': false,
							'.copilot/prompts': true,
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
												name: 'my.prompt.md',
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
							createURI('/Users/legomushroom/repos/vscode/.github/prompts/my.prompt.md'),
							createURI('/Users/legomushroom/repos/prompts/test.prompt.md'),
							createURI('/Users/legomushroom/repos/prompts/refactor-tests.prompt.md'),
							createURI('/tmp/prompts/translate.to-rust.prompt.md'),
							createURI('/Users/legomushroom/repos/vscode/.copilot/prompts/default.prompt.md'),
						],
						'Must find correct prompts.',
					);
				});

				test('• with disabled `.github/prompts` location', async () => {
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
												name: 'my.prompt.md',
												contents: 'oh hi, bot!',
											},
											{
												name: 'your.prompt.md',
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
							createURI('/Users/legomushroom/repos/vscode/.github/prompts/default.prompt.md'),
							createURI('/Users/legomushroom/repos/node/.github/prompts/refactor-static-classes.prompt.md'),
							createURI('/Users/legomushroom/repos/prompts/test.prompt.md'),
							createURI('/Users/legomushroom/repos/prompts/refactor-tests.prompt.md'),
							createURI('/tmp/prompts/translate.to-rust.prompt.md'),
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
							createURI('/Users/legomushroom/repos/vscode/.github/prompts/default.prompt.md'),
							createURI('/Users/legomushroom/repos/node/.github/prompts/refactor-static-classes.prompt.md'),
							createURI('/var/shared/prompts/.github/prompts/prompt-name.prompt.md'),
							createURI('/var/shared/prompts/.github/prompts/name-of-the-prompt.prompt.md'),
							createURI('/Users/legomushroom/repos/prompts/test.prompt.md'),
							createURI('/Users/legomushroom/repos/prompts/refactor-tests.prompt.md'),
							createURI('/tmp/prompts/translate.to-rust.prompt.md'),
						],
						'Must find correct prompts.',
					);
				});

				test('• with disabled `.github/prompts` location', async () => {
					const locator = await createPromptsLocator(
						{
							'/Users/legomushroom/repos/prompts': true,
							'/tmp/prompts/': true,
							'/absolute/path/prompts': false,
							'.copilot/prompts': false,
							'.github/prompts': false,
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
						],
						'Must find correct prompts.',
					);
				});
			});
		});
	});
});
