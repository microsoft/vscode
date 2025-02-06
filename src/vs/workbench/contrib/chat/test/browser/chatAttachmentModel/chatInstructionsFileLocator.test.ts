/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { PromptFilesConfig } from '../../../common/promptSyntax/config.js';
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
import { basename } from '../../../../../../base/common/resources.js';

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

	let initService: TestInstantiationService;
	setup(async () => {
		initService = disposables.add(new TestInstantiationService());
		initService.stub(ILogService, new NullLogService());

		const fileService = disposables.add(initService.createInstance(FileService));
		const fileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(Schemas.file, fileSystemProvider));

		initService.stub(IFileService, fileService);
	});


	// const mockToWorkspaceFolder = (folder: IMockFolder): IWorkspaceFolder => {
	// 	return mockObject<IWorkspaceFolder>({
	// 		uri: fileSystemProvider.root.with({ path: folder.name }),
	// 	});
	// };

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
			const uri = URI.file(path);

			return mockObject<IWorkspaceFolder>({
				uri,
				name: basename(uri),
				index,
			});
		});
		initService.stub(IWorkspaceContextService, mockWorkspaceService(workspaceFolders));

		return initService.createInstance(ChatInstructionsFileLocator);
	};

	suite('empty workspace', () => {
		const EMPTY_WORKSPACE: string[] = [];

		suite('empty filesystem', () => {
			test('no config value', async () => {
				const locator = await createPromptsLocator(undefined, EMPTY_WORKSPACE, []);

				assert.deepStrictEqual(
					await locator.listFiles([]),
					[],
					'No prompts must be found.',
				);
			});

			test('object config value', async () => {
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

			test('array config value', async () => {
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

			test('null config value', async () => {
				const locator = await createPromptsLocator(null, EMPTY_WORKSPACE, []);

				assert.deepStrictEqual(
					await locator.listFiles([]),
					[],
					'No prompts must be found.',
				);
			});

			test('string config value', async () => {
				const locator = await createPromptsLocator('/etc/hosts/prompts', EMPTY_WORKSPACE, []);

				assert.deepStrictEqual(
					await locator.listFiles([]),
					[],
					'No prompts must be found.',
				);
			});
		});

		suite('non-empty filesystem', () => {
			suite('boolean config value', () => {
				test('true', async () => {
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

				test('false', async () => {
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

			test('object config value', async () => {
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
						URI.file('/Users/legomushroom/repos/prompts/test.prompt.md'),
						URI.file('/Users/legomushroom/repos/prompts/refactor-tests.prompt.md'),
						URI.file('/tmp/prompts/translate.to-rust.prompt.md'),
					],
					'Must find correct prompts.',
				);
			});

			test('array config value', async () => {
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
						URI.file('/var/prompts/alpha.prompt.md'),
						URI.file('/var/prompts/beta.prompt.md'),
						URI.file('/usr/local/prompts/gamma.prompt.md'),
					],
					'Must find correct prompts.',
				);
			});
		});
	});

	suite('single-root workspace', () => {
		suite('non-empty filesystem', () => {
			test('object config value', async () => {
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
						URI.file('/Users/legomushroom/repos/prompts/test.prompt.md'),
						URI.file('/Users/legomushroom/repos/prompts/refactor-tests.prompt.md'),
						URI.file('/tmp/prompts/translate.to-rust.prompt.md'),
						URI.file('/Users/legomushroom/repos/vscode/.copilot/prompts/default.prompt.md'),
					],
					'Must find correct prompts.',
				);
			});

			test('array config value', async () => {
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
						URI.file('/Users/legomushroom/repos/prompts/test.prompt.md'),
						URI.file('/Users/legomushroom/repos/prompts/refactor-tests.prompt.md'),
						URI.file('/tmp/prompts/translate.to-rust.prompt.md'),
						URI.file('/Users/legomushroom/repos/vscode/.copilot/prompts/default.prompt.md'),
					],
					'Must find correct prompts.',
				);
			});

			suite('string config value', () => {
				test('relative path', async () => {
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
							URI.file('/Users/legomushroom/test/vscode/.github/prompts/default-github.prompt.md'),
						],
						'Must find correct prompts.',
					);
				});
			});
		});
	});
});
