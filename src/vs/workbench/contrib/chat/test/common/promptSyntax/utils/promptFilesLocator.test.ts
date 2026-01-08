/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../../base/common/cancellation.js';
import { match } from '../../../../../../../base/common/glob.js';
import { Schemas } from '../../../../../../../base/common/network.js';
import { basename, relativePath } from '../../../../../../../base/common/resources.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { mock } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IConfigurationOverrides, IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../../../platform/files/common/files.js';
import { FileService } from '../../../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../../platform/log/common/log.js';
import { IWorkspace, IWorkspaceContextService, IWorkspaceFolder } from '../../../../../../../platform/workspace/common/workspace.js';
import { IWorkbenchEnvironmentService } from '../../../../../../services/environment/common/environmentService.js';
import { IFileMatch, IFileQuery, ISearchService } from '../../../../../../services/search/common/search.js';
import { IUserDataProfileService } from '../../../../../../services/userDataProfile/common/userDataProfile.js';
import { PromptsConfig } from '../../../../common/promptSyntax/config/config.js';
import { PromptsType } from '../../../../common/promptSyntax/promptTypes.js';
import { isValidGlob, PromptFilesLocator } from '../../../../common/promptSyntax/utils/promptFilesLocator.js';
import { IMockFolder, MockFilesystem } from '../testUtils/mockFilesystem.js';
import { mockService } from './mock.js';
import { TestUserDataProfileService } from '../../../../../../test/common/workbenchTestServices.js';
import { PromptsStorage } from '../../../../common/promptSyntax/service/promptsService.js';
import { runWithFakedTimers } from '../../../../../../../base/test/common/timeTravelScheduler.js';

/**
 * Mocked instance of {@link IConfigurationService}.
 */
function mockConfigService<T>(value: T): IConfigurationService {
	return mockService<IConfigurationService>({
		getValue(key?: string | IConfigurationOverrides) {
			assert(
				typeof key === 'string',
				`Expected string configuration key, got '${typeof key}'.`,
			);
			if ('explorer.excludeGitIgnore' === key) {
				return false;
			}

			assert(
				[PromptsConfig.PROMPT_LOCATIONS_KEY, PromptsConfig.INSTRUCTIONS_LOCATION_KEY, PromptsConfig.MODE_LOCATION_KEY].includes(key),
				`Unsupported configuration key '${key}'.`,
			);

			return value;
		},
	});
}

/**
 * Mocked instance of {@link IWorkspaceContextService}.
 */
function mockWorkspaceService(folders: IWorkspaceFolder[]): IWorkspaceContextService {
	return mockService<IWorkspaceContextService>({
		getWorkspace(): IWorkspace {
			return new class extends mock<IWorkspace>() {
				override folders = folders;
			};
		},
		getWorkspaceFolder(): IWorkspaceFolder | null {
			return null;
		}

	});
}

function testT(name: string, fn: () => Promise<void>): Mocha.Test {
	return test(name, () => runWithFakedTimers({ useFakeTimers: true }, fn));
}

suite('PromptFilesLocator', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	// if (isWindows) {
	// 	return;
	// }

	let instantiationService: TestInstantiationService;
	setup(async () => {
		instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(ILogService, new NullLogService());

		const fileService = disposables.add(instantiationService.createInstance(FileService));
		const fileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(Schemas.file, fileSystemProvider));

		instantiationService.stub(IFileService, fileService);
	});

	/**
	 * Create a new instance of {@link PromptFilesLocator} with provided mocked
	 * values for configuration and workspace services.
	 */
	const createPromptsLocator = async (configValue: unknown, workspaceFolderPaths: string[], filesystem: IMockFolder[]) => {

		const mockFs = instantiationService.createInstance(MockFilesystem, filesystem);
		await mockFs.mock();

		instantiationService.stub(IConfigurationService, mockConfigService(configValue));

		const workspaceFolders = workspaceFolderPaths.map((path, index) => {
			const uri = URI.file(path);

			return new class extends mock<IWorkspaceFolder>() {
				override uri = uri;
				override name = basename(uri);
				override index = index;
			};
		});
		instantiationService.stub(IWorkspaceContextService, mockWorkspaceService(workspaceFolders));
		instantiationService.stub(IWorkbenchEnvironmentService, {} as IWorkbenchEnvironmentService);
		instantiationService.stub(IUserDataProfileService, new TestUserDataProfileService());
		instantiationService.stub(ISearchService, {
			async fileSearch(query: IFileQuery) {
				// mock the search service
				const fs = instantiationService.get(IFileService);
				const findFilesInLocation = async (location: URI, results: URI[] = []) => {
					try {
						const resolve = await fs.resolve(location);
						if (resolve.isFile) {
							results.push(resolve.resource);
						} else if (resolve.isDirectory && resolve.children) {
							for (const child of resolve.children) {
								await findFilesInLocation(child.resource, results);
							}
						}
					} catch (error) {
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

		const locator = instantiationService.createInstance(PromptFilesLocator);

		return {
			async listFiles(type: PromptsType, storage: PromptsStorage, token: CancellationToken): Promise<readonly URI[]> {
				return locator.listFiles(type, storage, token);
			},
			getConfigBasedSourceFolders(type: PromptsType): readonly URI[] {
				return locator.getConfigBasedSourceFolders(type);
			},
			async disposeAsync(): Promise<void> {
				await mockFs.delete();
			}
		};
	};

	suite('empty workspace', () => {
		const EMPTY_WORKSPACE: string[] = [];

		suite('empty filesystem', () => {
			testT('no config value', async () => {
				const locator = await createPromptsLocator(undefined, EMPTY_WORKSPACE, []);

				assertOutcome(
					await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
					[],
					'No prompts must be found.',
				);
				await locator.disposeAsync();
			});

			testT('object config value', async () => {
				const locator = await createPromptsLocator({
					'/Users/legomushroom/repos/prompts/': true,
					'/tmp/prompts/': false,
				}, EMPTY_WORKSPACE, []);

				assertOutcome(
					await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
					[],
					'No prompts must be found.',
				);
				await locator.disposeAsync();
			});

			testT('array config value', async () => {
				const locator = await createPromptsLocator([
					'relative/path/to/prompts/',
					'/abs/path',
				], EMPTY_WORKSPACE, []);

				assertOutcome(
					await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
					[],
					'No prompts must be found.',
				);
				await locator.disposeAsync();
			});

			testT('null config value', async () => {
				const locator = await createPromptsLocator(null, EMPTY_WORKSPACE, []);

				assertOutcome(
					await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
					[],
					'No prompts must be found.',
				);
				await locator.disposeAsync();
			});

			testT('string config value', async () => {
				const locator = await createPromptsLocator('/etc/hosts/prompts', EMPTY_WORKSPACE, []);

				assertOutcome(
					await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
					[],
					'No prompts must be found.',
				);
				await locator.disposeAsync();
			});
		});

		suite('non-empty filesystem', () => {
			testT('core logic', async () => {
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

				assertOutcome(
					await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
					[
						'/Users/legomushroom/repos/prompts/test.prompt.md',
						'/Users/legomushroom/repos/prompts/refactor-tests.prompt.md',
						'/tmp/prompts/translate.to-rust.prompt.md'
					],
					'Must find correct prompts.',
				);
				await locator.disposeAsync();
			});

			suite('absolute', () => {
				testT('wild card', async () => {
					const settings = [
						'/Users/legomushroom/repos/vscode/**',
						'/Users/legomushroom/repos/vscode/**/*.prompt.md',
						'/Users/legomushroom/repos/vscode/**/*.md',
						'/Users/legomushroom/repos/vscode/**/*',
						'/Users/legomushroom/repos/vscode/deps/**',
						'/Users/legomushroom/repos/vscode/deps/**/*.prompt.md',
						'/Users/legomushroom/repos/vscode/deps/**/*',
						'/Users/legomushroom/repos/vscode/deps/**/*.md',
						'/Users/legomushroom/repos/vscode/**/text/**',
						'/Users/legomushroom/repos/vscode/**/text/**/*',
						'/Users/legomushroom/repos/vscode/**/text/**/*.md',
						'/Users/legomushroom/repos/vscode/**/text/**/*.prompt.md',
						'/Users/legomushroom/repos/vscode/deps/text/**',
						'/Users/legomushroom/repos/vscode/deps/text/**/*',
						'/Users/legomushroom/repos/vscode/deps/text/**/*.md',
						'/Users/legomushroom/repos/vscode/deps/text/**/*.prompt.md',
					];

					for (const setting of settings) {
						const locator = await createPromptsLocator(
							{ [setting]: true },
							EMPTY_WORKSPACE,
							[
								{
									name: '/Users/legomushroom/repos/vscode',
									children: [
										{
											name: 'deps/text',
											children: [
												{
													name: 'my.prompt.md',
													contents: 'oh hi, bot!',
												},
												{
													name: 'nested',
													children: [
														{
															name: 'specific.prompt.md',
															contents: 'oh hi, bot!',
														},
														{
															name: 'unspecific1.prompt.md',
															contents: 'oh hi, robot!',
														},
														{
															name: 'unspecific2.prompt.md',
															contents: 'oh hi, rabot!',
														},
														{
															name: 'readme.md',
															contents: 'non prompt file',
														},
													],
												}
											],
										},
									],
								},
							],
						);

						assertOutcome(
							await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
							[
								'/Users/legomushroom/repos/vscode/deps/text/my.prompt.md',
								'/Users/legomushroom/repos/vscode/deps/text/nested/specific.prompt.md',
								'/Users/legomushroom/repos/vscode/deps/text/nested/unspecific1.prompt.md',
								'/Users/legomushroom/repos/vscode/deps/text/nested/unspecific2.prompt.md',
							],
							'Must find correct prompts.',
						);
						await locator.disposeAsync();
					}
				});

				testT(`specific`, async () => {
					const testSettings = [
						[
							'/Users/legomushroom/repos/vscode/**/*specific*',
						],
						[
							'/Users/legomushroom/repos/vscode/**/*specific*.prompt.md',
						],
						[
							'/Users/legomushroom/repos/vscode/**/*specific*.md',
						],
						[
							'/Users/legomushroom/repos/vscode/**/specific*',
							'/Users/legomushroom/repos/vscode/**/unspecific1.prompt.md',
							'/Users/legomushroom/repos/vscode/**/unspecific2.prompt.md',
						],
						[
							'/Users/legomushroom/repos/vscode/**/specific.prompt.md',
							'/Users/legomushroom/repos/vscode/**/unspecific*.prompt.md',
						],
						[
							'/Users/legomushroom/repos/vscode/**/nested/specific.prompt.md',
							'/Users/legomushroom/repos/vscode/**/nested/unspecific*.prompt.md',
						],
						[
							'/Users/legomushroom/repos/vscode/**/nested/*specific*',
						],
						[
							'/Users/legomushroom/repos/vscode/**/*spec*.prompt.md',
						],
						[
							'/Users/legomushroom/repos/vscode/**/*spec*',
						],
						[
							'/Users/legomushroom/repos/vscode/**/*spec*.md',
						],
						[
							'/Users/legomushroom/repos/vscode/**/deps/**/*spec*.md',
						],
						[
							'/Users/legomushroom/repos/vscode/**/text/**/*spec*.md',
						],
						[
							'/Users/legomushroom/repos/vscode/deps/text/nested/*spec*',
						],
						[
							'/Users/legomushroom/repos/vscode/deps/text/nested/*specific*',
						],
						[
							'/Users/legomushroom/repos/vscode/deps/**/*specific*',
						],
						[
							'/Users/legomushroom/repos/vscode/deps/**/specific*',
							'/Users/legomushroom/repos/vscode/deps/**/unspecific*.prompt.md',
						],
						[
							'/Users/legomushroom/repos/vscode/deps/**/specific*.md',
							'/Users/legomushroom/repos/vscode/deps/**/unspecific*.md',
						],
						[
							'/Users/legomushroom/repos/vscode/deps/**/specific.prompt.md',
							'/Users/legomushroom/repos/vscode/deps/**/unspecific1.prompt.md',
							'/Users/legomushroom/repos/vscode/deps/**/unspecific2.prompt.md',
						],
						[
							'/Users/legomushroom/repos/vscode/deps/**/specific.prompt.md',
							'/Users/legomushroom/repos/vscode/deps/**/unspecific1*.md',
							'/Users/legomushroom/repos/vscode/deps/**/unspecific2*.md',
						],
						[
							'/Users/legomushroom/repos/vscode/deps/text/**/*specific*',
						],
						[
							'/Users/legomushroom/repos/vscode/deps/text/**/specific*',
							'/Users/legomushroom/repos/vscode/deps/text/**/unspecific*.prompt.md',
						],
						[
							'/Users/legomushroom/repos/vscode/deps/text/**/specific*.md',
							'/Users/legomushroom/repos/vscode/deps/text/**/unspecific*.md',
						],
						[
							'/Users/legomushroom/repos/vscode/deps/text/**/specific.prompt.md',
							'/Users/legomushroom/repos/vscode/deps/text/**/unspecific1.prompt.md',
							'/Users/legomushroom/repos/vscode/deps/text/**/unspecific2.prompt.md',
						],
						[
							'/Users/legomushroom/repos/vscode/deps/text/**/specific.prompt.md',
							'/Users/legomushroom/repos/vscode/deps/text/**/unspecific1*.md',
							'/Users/legomushroom/repos/vscode/deps/text/**/unspecific2*.md',
						],
					];

					for (const settings of testSettings) {
						const vscodeSettings: Record<string, boolean> = {};
						for (const setting of settings) {
							vscodeSettings[setting] = true;
						}

						const locator = await createPromptsLocator(
							vscodeSettings,
							EMPTY_WORKSPACE,
							[
								{
									name: '/Users/legomushroom/repos/vscode',
									children: [
										{
											name: 'deps/text',
											children: [
												{
													name: 'my.prompt.md',
													contents: 'oh hi, bot!',
												},
												{
													name: 'nested',
													children: [
														{
															name: 'default.prompt.md',
															contents: 'oh hi, bot!',
														},
														{
															name: 'specific.prompt.md',
															contents: 'oh hi, bot!',
														},
														{
															name: 'unspecific1.prompt.md',
															contents: 'oh hi, robot!',
														},
														{
															name: 'unspecific2.prompt.md',
															contents: 'oh hi, rawbot!',
														},
														{
															name: 'readme.md',
															contents: 'non prompt file',
														},
													],
												}
											],
										},
									],
								},
							],
						);

						assertOutcome(
							await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
							[
								'/Users/legomushroom/repos/vscode/deps/text/nested/specific.prompt.md',
								'/Users/legomushroom/repos/vscode/deps/text/nested/unspecific1.prompt.md',
								'/Users/legomushroom/repos/vscode/deps/text/nested/unspecific2.prompt.md',
							],
							'Must find correct prompts.',
						);
						await locator.disposeAsync();
					}
				});
			});
		});
	});

	suite('single-root workspace', () => {
		suite('glob pattern', () => {
			suite('relative', () => {
				testT('wild card', async () => {
					const testSettings = [
						'**',
						'**/*.prompt.md',
						'**/*.md',
						'**/*',
						'deps/**',
						'deps/**/*.prompt.md',
						'deps/**/*',
						'deps/**/*.md',
						'**/text/**',
						'**/text/**/*',
						'**/text/**/*.md',
						'**/text/**/*.prompt.md',
						'deps/text/**',
						'deps/text/**/*',
						'deps/text/**/*.md',
						'deps/text/**/*.prompt.md',
					];

					for (const setting of testSettings) {
						const locator = await createPromptsLocator(
							{ [setting]: true },
							['/Users/legomushroom/repos/vscode'],
							[
								{
									name: '/Users/legomushroom/repos/vscode',
									children: [
										{
											name: 'deps/text',
											children: [
												{
													name: 'my.prompt.md',
													contents: 'oh hi, bot!',
												},
												{
													name: 'nested',
													children: [
														{
															name: 'specific.prompt.md',
															contents: 'oh hi, bot!',
														},
														{
															name: 'unspecific1.prompt.md',
															contents: 'oh hi, robot!',
														},
														{
															name: 'unspecific2.prompt.md',
															contents: 'oh hi, rabot!',
														},
														{
															name: 'readme.md',
															contents: 'non prompt file',
														},
													],
												}
											],
										},
									],
								},
							],
						);

						assertOutcome(
							await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
							[
								'/Users/legomushroom/repos/vscode/deps/text/my.prompt.md',
								'/Users/legomushroom/repos/vscode/deps/text/nested/specific.prompt.md',
								'/Users/legomushroom/repos/vscode/deps/text/nested/unspecific1.prompt.md',
								'/Users/legomushroom/repos/vscode/deps/text/nested/unspecific2.prompt.md',
							],
							'Must find correct prompts.',
						);
						await locator.disposeAsync();

					}
				});

				testT(`specific`, async () => {
					const testSettings = [
						[
							'**/*specific*',
						],
						[
							'**/*specific*.prompt.md',
						],
						[
							'**/*specific*.md',
						],
						[
							'**/specific*',
							'**/unspecific1.prompt.md',
							'**/unspecific2.prompt.md',
						],
						[
							'**/specific.prompt.md',
							'**/unspecific*.prompt.md',
						],
						[
							'**/nested/specific.prompt.md',
							'**/nested/unspecific*.prompt.md',
						],
						[
							'**/nested/*specific*',
						],
						[
							'**/*spec*.prompt.md',
						],
						[
							'**/*spec*',
						],
						[
							'**/*spec*.md',
						],
						[
							'**/deps/**/*spec*.md',
						],
						[
							'**/text/**/*spec*.md',
						],
						[
							'deps/text/nested/*spec*',
						],
						[
							'deps/text/nested/*specific*',
						],
						[
							'deps/**/*specific*',
						],
						[
							'deps/**/specific*',
							'deps/**/unspecific*.prompt.md',
						],
						[
							'deps/**/specific*.md',
							'deps/**/unspecific*.md',
						],
						[
							'deps/**/specific.prompt.md',
							'deps/**/unspecific1.prompt.md',
							'deps/**/unspecific2.prompt.md',
						],
						[
							'deps/**/specific.prompt.md',
							'deps/**/unspecific1*.md',
							'deps/**/unspecific2*.md',
						],
						[
							'deps/text/**/*specific*',
						],
						[
							'deps/text/**/specific*',
							'deps/text/**/unspecific*.prompt.md',
						],
						[
							'deps/text/**/specific*.md',
							'deps/text/**/unspecific*.md',
						],
						[
							'deps/text/**/specific.prompt.md',
							'deps/text/**/unspecific1.prompt.md',
							'deps/text/**/unspecific2.prompt.md',
						],
						[
							'deps/text/**/specific.prompt.md',
							'deps/text/**/unspecific1*.md',
							'deps/text/**/unspecific2*.md',
						],
					];

					for (const settings of testSettings) {
						const vscodeSettings: Record<string, boolean> = {};
						for (const setting of settings) {
							vscodeSettings[setting] = true;
						}

						const locator = await createPromptsLocator(
							vscodeSettings,
							['/Users/legomushroom/repos/vscode'],
							[
								{
									name: '/Users/legomushroom/repos/vscode',
									children: [
										{
											name: 'deps/text',
											children: [
												{
													name: 'my.prompt.md',
													contents: 'oh hi, bot!',
												},
												{
													name: 'nested',
													children: [
														{
															name: 'default.prompt.md',
															contents: 'oh hi, bot!',
														},
														{
															name: 'specific.prompt.md',
															contents: 'oh hi, bot!',
														},
														{
															name: 'unspecific1.prompt.md',
															contents: 'oh hi, robot!',
														},
														{
															name: 'unspecific2.prompt.md',
															contents: 'oh hi, rawbot!',
														},
														{
															name: 'readme.md',
															contents: 'non prompt file',
														},
													],
												}
											],
										},
									],
								},
							],
						);

						assertOutcome(
							await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
							[
								'/Users/legomushroom/repos/vscode/deps/text/nested/specific.prompt.md',
								'/Users/legomushroom/repos/vscode/deps/text/nested/unspecific1.prompt.md',
								'/Users/legomushroom/repos/vscode/deps/text/nested/unspecific2.prompt.md',
							],
							'Must find correct prompts.',
						);
						await locator.disposeAsync();
					}
				});
			});

			suite('absolute', () => {
				testT('wild card', async () => {
					const settings = [
						'/Users/legomushroom/repos/vscode/**',
						'/Users/legomushroom/repos/vscode/**/*.prompt.md',
						'/Users/legomushroom/repos/vscode/**/*.md',
						'/Users/legomushroom/repos/vscode/**/*',
						'/Users/legomushroom/repos/vscode/deps/**',
						'/Users/legomushroom/repos/vscode/deps/**/*.prompt.md',
						'/Users/legomushroom/repos/vscode/deps/**/*',
						'/Users/legomushroom/repos/vscode/deps/**/*.md',
						'/Users/legomushroom/repos/vscode/**/text/**',
						'/Users/legomushroom/repos/vscode/**/text/**/*',
						'/Users/legomushroom/repos/vscode/**/text/**/*.md',
						'/Users/legomushroom/repos/vscode/**/text/**/*.prompt.md',
						'/Users/legomushroom/repos/vscode/deps/text/**',
						'/Users/legomushroom/repos/vscode/deps/text/**/*',
						'/Users/legomushroom/repos/vscode/deps/text/**/*.md',
						'/Users/legomushroom/repos/vscode/deps/text/**/*.prompt.md',
					];

					for (const setting of settings) {

						const locator = await createPromptsLocator(
							{ [setting]: true },
							['/Users/legomushroom/repos/vscode'],
							[
								{
									name: '/Users/legomushroom/repos/vscode',
									children: [
										{
											name: 'deps/text',
											children: [
												{
													name: 'my.prompt.md',
													contents: 'oh hi, bot!',
												},
												{
													name: 'nested',
													children: [
														{
															name: 'specific.prompt.md',
															contents: 'oh hi, bot!',
														},
														{
															name: 'unspecific1.prompt.md',
															contents: 'oh hi, robot!',
														},
														{
															name: 'unspecific2.prompt.md',
															contents: 'oh hi, rabot!',
														},
														{
															name: 'readme.md',
															contents: 'non prompt file',
														},
													],
												}
											],
										},
									],
								},
							],
						);

						assertOutcome(
							await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
							[
								'/Users/legomushroom/repos/vscode/deps/text/my.prompt.md',
								'/Users/legomushroom/repos/vscode/deps/text/nested/specific.prompt.md',
								'/Users/legomushroom/repos/vscode/deps/text/nested/unspecific1.prompt.md',
								'/Users/legomushroom/repos/vscode/deps/text/nested/unspecific2.prompt.md',
							],
							'Must find correct prompts.',
						);
						await locator.disposeAsync();

					}
				});

				testT(`specific`, async () => {
					const testSettings = [
						[
							'/Users/legomushroom/repos/vscode/**/*specific*',
						],
						[
							'/Users/legomushroom/repos/vscode/**/*specific*.prompt.md',
						],
						[
							'/Users/legomushroom/repos/vscode/**/*specific*.md',
						],
						[
							'/Users/legomushroom/repos/vscode/**/specific*',
							'/Users/legomushroom/repos/vscode/**/unspecific1.prompt.md',
							'/Users/legomushroom/repos/vscode/**/unspecific2.prompt.md',
						],
						[
							'/Users/legomushroom/repos/vscode/**/specific.prompt.md',
							'/Users/legomushroom/repos/vscode/**/unspecific*.prompt.md',
						],
						[
							'/Users/legomushroom/repos/vscode/**/nested/specific.prompt.md',
							'/Users/legomushroom/repos/vscode/**/nested/unspecific*.prompt.md',
						],
						[
							'/Users/legomushroom/repos/vscode/**/nested/*specific*',
						],
						[
							'/Users/legomushroom/repos/vscode/**/*spec*.prompt.md',
						],
						[
							'/Users/legomushroom/repos/vscode/**/*spec*',
						],
						[
							'/Users/legomushroom/repos/vscode/**/*spec*.md',
						],
						[
							'/Users/legomushroom/repos/vscode/**/deps/**/*spec*.md',
						],
						[
							'/Users/legomushroom/repos/vscode/**/text/**/*spec*.md',
						],
						[
							'/Users/legomushroom/repos/vscode/deps/text/nested/*spec*',
						],
						[
							'/Users/legomushroom/repos/vscode/deps/text/nested/*specific*',
						],
						[
							'/Users/legomushroom/repos/vscode/deps/**/*specific*',
						],
						[
							'/Users/legomushroom/repos/vscode/deps/**/specific*',
							'/Users/legomushroom/repos/vscode/deps/**/unspecific*.prompt.md',
						],
						[
							'/Users/legomushroom/repos/vscode/deps/**/specific*.md',
							'/Users/legomushroom/repos/vscode/deps/**/unspecific*.md',
						],
						[
							'/Users/legomushroom/repos/vscode/deps/**/specific.prompt.md',
							'/Users/legomushroom/repos/vscode/deps/**/unspecific1.prompt.md',
							'/Users/legomushroom/repos/vscode/deps/**/unspecific2.prompt.md',
						],
						[
							'/Users/legomushroom/repos/vscode/deps/**/specific.prompt.md',
							'/Users/legomushroom/repos/vscode/deps/**/unspecific1*.md',
							'/Users/legomushroom/repos/vscode/deps/**/unspecific2*.md',
						],
						[
							'/Users/legomushroom/repos/vscode/deps/text/**/*specific*',
						],
						[
							'/Users/legomushroom/repos/vscode/deps/text/**/specific*',
							'/Users/legomushroom/repos/vscode/deps/text/**/unspecific*.prompt.md',
						],
						[
							'/Users/legomushroom/repos/vscode/deps/text/**/specific*.md',
							'/Users/legomushroom/repos/vscode/deps/text/**/unspecific*.md',
						],
						[
							'/Users/legomushroom/repos/vscode/deps/text/**/specific.prompt.md',
							'/Users/legomushroom/repos/vscode/deps/text/**/unspecific1.prompt.md',
							'/Users/legomushroom/repos/vscode/deps/text/**/unspecific2.prompt.md',
						],
						[
							'/Users/legomushroom/repos/vscode/deps/text/**/specific.prompt.md',
							'/Users/legomushroom/repos/vscode/deps/text/**/unspecific1*.md',
							'/Users/legomushroom/repos/vscode/deps/text/**/unspecific2*.md',
						],
					];

					for (const settings of testSettings) {
						const vscodeSettings: Record<string, boolean> = {};
						for (const setting of settings) {
							vscodeSettings[setting] = true;
						}

						const locator = await createPromptsLocator(
							vscodeSettings,
							['/Users/legomushroom/repos/vscode'],
							[
								{
									name: '/Users/legomushroom/repos/vscode',
									children: [
										{
											name: 'deps/text',
											children: [
												{
													name: 'my.prompt.md',
													contents: 'oh hi, bot!',
												},
												{
													name: 'nested',
													children: [
														{
															name: 'default.prompt.md',
															contents: 'oh hi, bot!',
														},
														{
															name: 'specific.prompt.md',
															contents: 'oh hi, bot!',
														},
														{
															name: 'unspecific1.prompt.md',
															contents: 'oh hi, robot!',
														},
														{
															name: 'unspecific2.prompt.md',
															contents: 'oh hi, rawbot!',
														},
														{
															name: 'readme.md',
															contents: 'non prompt file',
														},
													],
												}
											],
										},
									],
								},
							],
						);

						assertOutcome(
							await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
							[
								'/Users/legomushroom/repos/vscode/deps/text/nested/specific.prompt.md',
								'/Users/legomushroom/repos/vscode/deps/text/nested/unspecific1.prompt.md',
								'/Users/legomushroom/repos/vscode/deps/text/nested/unspecific2.prompt.md',
							],
							'Must find correct prompts.',
						);
						await locator.disposeAsync();

					}
				});
			});
		});
	});

	testT('core logic', async () => {
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

		assertOutcome(
			await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
			[
				'/Users/legomushroom/repos/vscode/.github/prompts/my.prompt.md',
				'/Users/legomushroom/repos/prompts/test.prompt.md',
				'/Users/legomushroom/repos/prompts/refactor-tests.prompt.md',
				'/tmp/prompts/translate.to-rust.prompt.md',
				'/Users/legomushroom/repos/vscode/.copilot/prompts/default.prompt.md',
			],
			'Must find correct prompts.',
		);
		await locator.disposeAsync();
	});

	testT('with disabled `.github/prompts` location', async () => {
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

		assertOutcome(
			await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
			[
				'/Users/legomushroom/repos/prompts/test.prompt.md',
				'/Users/legomushroom/repos/prompts/refactor-tests.prompt.md',
				'/tmp/prompts/translate.to-rust.prompt.md',
				'/Users/legomushroom/repos/vscode/.copilot/prompts/default.prompt.md',
			],
			'Must find correct prompts.',
		);
		await locator.disposeAsync();
	});

	suite('multi-root workspace', () => {
		suite('core logic', () => {
			testT('without top-level `.github` folder', async () => {
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

				assertOutcome(
					await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
					[
						'/Users/legomushroom/repos/vscode/.github/prompts/default.prompt.md',
						'/Users/legomushroom/repos/node/.github/prompts/refactor-static-classes.prompt.md',
						'/Users/legomushroom/repos/prompts/test.prompt.md',
						'/Users/legomushroom/repos/prompts/refactor-tests.prompt.md',
						'/tmp/prompts/translate.to-rust.prompt.md',
					],
					'Must find correct prompts.',
				);
				await locator.disposeAsync();
			});

			testT('with top-level `.github` folder', async () => {
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
						'/var/shared/prompts',
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

				assertOutcome(
					await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
					[
						'/Users/legomushroom/repos/vscode/.github/prompts/default.prompt.md',
						'/Users/legomushroom/repos/node/.github/prompts/refactor-static-classes.prompt.md',
						'/var/shared/prompts/.github/prompts/prompt-name.prompt.md',
						'/var/shared/prompts/.github/prompts/name-of-the-prompt.prompt.md',
						'/Users/legomushroom/repos/prompts/test.prompt.md',
						'/Users/legomushroom/repos/prompts/refactor-tests.prompt.md',
						'/tmp/prompts/translate.to-rust.prompt.md',
					],
					'Must find correct prompts.',
				);
				await locator.disposeAsync();
			});

			testT('with disabled `.github/prompts` location', async () => {
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
						'/var/shared/prompts',
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

				assertOutcome(
					await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
					[
						'/Users/legomushroom/repos/prompts/test.prompt.md',
						'/Users/legomushroom/repos/prompts/refactor-tests.prompt.md',
						'/tmp/prompts/translate.to-rust.prompt.md',
					],
					'Must find correct prompts.',
				);
				await locator.disposeAsync();
			});

			testT('mixed', async () => {
				const locator = await createPromptsLocator(
					{
						'/Users/legomushroom/repos/**/*test*': true,
						'.copilot/prompts': false,
						'.github/prompts': true,
						'/absolute/path/prompts/some-prompt-file.prompt.md': true,
					},
					[
						'/Users/legomushroom/repos/vscode',
						'/Users/legomushroom/repos/node',
						'/var/shared/prompts',
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
								{
									name: 'elf.prompt.md',
									contents: 'haalo!',
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

				assertOutcome(
					await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
					[
						// all of these are due to the `.github/prompts` setting
						'/Users/legomushroom/repos/vscode/.github/prompts/default.prompt.md',
						'/Users/legomushroom/repos/node/.github/prompts/refactor-static-classes.prompt.md',
						'/var/shared/prompts/.github/prompts/prompt-name.prompt.md',
						'/var/shared/prompts/.github/prompts/name-of-the-prompt.prompt.md',
						// all of these are due to the `/Users/legomushroom/repos/**/*test*` setting
						'/Users/legomushroom/repos/prompts/test.prompt.md',
						'/Users/legomushroom/repos/prompts/refactor-tests.prompt.md',
						// this one is due to the specific `/absolute/path/prompts/some-prompt-file.prompt.md` setting
						'/absolute/path/prompts/some-prompt-file.prompt.md',
					],
					'Must find correct prompts.',
				);
				await locator.disposeAsync();
			});
		});

		suite('glob pattern', () => {
			suite('relative', () => {
				testT('wild card', async () => {
					const testSettings = [
						'**',
						'**/*.prompt.md',
						'**/*.md',
						'**/*',
						'gen*/**',
						'gen*/**/*.prompt.md',
						'gen*/**/*',
						'gen*/**/*.md',
						'**/gen*/**',
						'**/gen*/**/*',
						'**/gen*/**/*.md',
						'**/gen*/**/*.prompt.md',
						'{generic,general,gen}/**',
						'{generic,general,gen}/**/*.prompt.md',
						'{generic,general,gen}/**/*',
						'{generic,general,gen}/**/*.md',
						'**/{generic,general,gen}/**',
						'**/{generic,general,gen}/**/*',
						'**/{generic,general,gen}/**/*.md',
						'**/{generic,general,gen}/**/*.prompt.md',
					];

					for (const setting of testSettings) {

						const locator = await createPromptsLocator(
							{ [setting]: true },
							[
								'/Users/legomushroom/repos/vscode',
								'/Users/legomushroom/repos/prompts',
							],
							[
								{
									name: '/Users/legomushroom/repos/vscode',
									children: [
										{
											name: 'gen/text',
											children: [
												{
													name: 'my.prompt.md',
													contents: 'oh hi, bot!',
												},
												{
													name: 'nested',
													children: [
														{
															name: 'specific.prompt.md',
															contents: 'oh hi, bot!',
														},
														{
															name: 'unspecific1.prompt.md',
															contents: 'oh hi, robot!',
														},
														{
															name: 'unspecific2.prompt.md',
															contents: 'oh hi, rabot!',
														},
														{
															name: 'readme.md',
															contents: 'non prompt file',
														},
													],
												}
											],
										},
									],
								},
								{
									name: '/Users/legomushroom/repos/prompts',
									children: [
										{
											name: 'general',
											children: [
												{
													name: 'common.prompt.md',
													contents: 'oh hi, bot!',
												},
												{
													name: 'uncommon-10.prompt.md',
													contents: 'oh hi, robot!',
												},
												{
													name: 'license.md',
													contents: 'non prompt file',
												},
											],
										}
									],
								},
							],
						);

						assertOutcome(
							await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
							[
								'/Users/legomushroom/repos/vscode/gen/text/my.prompt.md',
								'/Users/legomushroom/repos/vscode/gen/text/nested/specific.prompt.md',
								'/Users/legomushroom/repos/vscode/gen/text/nested/unspecific1.prompt.md',
								'/Users/legomushroom/repos/vscode/gen/text/nested/unspecific2.prompt.md',
								// -
								'/Users/legomushroom/repos/prompts/general/common.prompt.md',
								'/Users/legomushroom/repos/prompts/general/uncommon-10.prompt.md',
							],
							'Must find correct prompts.',
						);
						await locator.disposeAsync();

					}
				});

				testT(`specific`, async () => {
					const testSettings = [
						[
							'**/my.prompt.md',
							'**/*specific*',
							'**/*common*',
						],
						[
							'**/my.prompt.md',
							'**/*specific*.prompt.md',
							'**/*common*.prompt.md',
						],
						[
							'**/my*.md',
							'**/*specific*.md',
							'**/*common*.md',
						],
						[
							'**/my*.md',
							'**/specific*',
							'**/unspecific*',
							'**/common*',
							'**/uncommon*',
						],
						[
							'**/my.prompt.md',
							'**/specific.prompt.md',
							'**/unspecific1.prompt.md',
							'**/unspecific2.prompt.md',
							'**/common.prompt.md',
							'**/uncommon-10.prompt.md',
						],
						[
							'gen*/**/my.prompt.md',
							'gen*/**/*specific*',
							'gen*/**/*common*',
						],
						[
							'gen*/**/my.prompt.md',
							'gen*/**/*specific*.prompt.md',
							'gen*/**/*common*.prompt.md',
						],
						[
							'gen*/**/my*.md',
							'gen*/**/*specific*.md',
							'gen*/**/*common*.md',
						],
						[
							'gen*/**/my*.md',
							'gen*/**/specific*',
							'gen*/**/unspecific*',
							'gen*/**/common*',
							'gen*/**/uncommon*',
						],
						[
							'gen*/**/my.prompt.md',
							'gen*/**/specific.prompt.md',
							'gen*/**/unspecific1.prompt.md',
							'gen*/**/unspecific2.prompt.md',
							'gen*/**/common.prompt.md',
							'gen*/**/uncommon-10.prompt.md',
						],
						[
							'gen/text/my.prompt.md',
							'gen/text/nested/specific.prompt.md',
							'gen/text/nested/unspecific1.prompt.md',
							'gen/text/nested/unspecific2.prompt.md',
							'general/common.prompt.md',
							'general/uncommon-10.prompt.md',
						],
						[
							'gen/text/my.prompt.md',
							'gen/text/nested/*specific*',
							'general/*common*',
						],
						[
							'gen/text/my.prompt.md',
							'gen/text/**/specific.prompt.md',
							'gen/text/**/unspecific1.prompt.md',
							'gen/text/**/unspecific2.prompt.md',
							'general/*',
						],
						[
							'{gen,general}/**/my.prompt.md',
							'{gen,general}/**/*specific*',
							'{gen,general}/**/*common*',
						],
						[
							'{gen,general}/**/my.prompt.md',
							'{gen,general}/**/*specific*.prompt.md',
							'{gen,general}/**/*common*.prompt.md',
						],
						[
							'{gen,general}/**/my*.md',
							'{gen,general}/**/*specific*.md',
							'{gen,general}/**/*common*.md',
						],
						[
							'{gen,general}/**/my*.md',
							'{gen,general}/**/specific*',
							'{gen,general}/**/unspecific*',
							'{gen,general}/**/common*',
							'{gen,general}/**/uncommon*',
						],
						[
							'{gen,general}/**/my.prompt.md',
							'{gen,general}/**/specific.prompt.md',
							'{gen,general}/**/unspecific1.prompt.md',
							'{gen,general}/**/unspecific2.prompt.md',
							'{gen,general}/**/common.prompt.md',
							'{gen,general}/**/uncommon-10.prompt.md',
						],
					];

					for (const settings of testSettings) {
						const vscodeSettings: Record<string, boolean> = {};
						for (const setting of settings) {
							vscodeSettings[setting] = true;
						}

						const locator = await createPromptsLocator(
							vscodeSettings,
							[
								'/Users/legomushroom/repos/vscode',
								'/Users/legomushroom/repos/prompts',
							],
							[
								{
									name: '/Users/legomushroom/repos/vscode',
									children: [
										{
											name: 'gen/text',
											children: [
												{
													name: 'my.prompt.md',
													contents: 'oh hi, bot!',
												},
												{
													name: 'nested',
													children: [
														{
															name: 'specific.prompt.md',
															contents: 'oh hi, bot!',
														},
														{
															name: 'unspecific1.prompt.md',
															contents: 'oh hi, robot!',
														},
														{
															name: 'unspecific2.prompt.md',
															contents: 'oh hi, rabot!',
														},
														{
															name: 'readme.md',
															contents: 'non prompt file',
														},
													],
												}
											],
										},
									],
								},
								{
									name: '/Users/legomushroom/repos/prompts',
									children: [
										{
											name: 'general',
											children: [
												{
													name: 'common.prompt.md',
													contents: 'oh hi, bot!',
												},
												{
													name: 'uncommon-10.prompt.md',
													contents: 'oh hi, robot!',
												},
												{
													name: 'license.md',
													contents: 'non prompt file',
												},
											],
										}
									],
								},
							],
						);

						assertOutcome(
							await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
							[
								'/Users/legomushroom/repos/vscode/gen/text/my.prompt.md',
								'/Users/legomushroom/repos/vscode/gen/text/nested/specific.prompt.md',
								'/Users/legomushroom/repos/vscode/gen/text/nested/unspecific1.prompt.md',
								'/Users/legomushroom/repos/vscode/gen/text/nested/unspecific2.prompt.md',
								// -
								'/Users/legomushroom/repos/prompts/general/common.prompt.md',
								'/Users/legomushroom/repos/prompts/general/uncommon-10.prompt.md',
							],
							'Must find correct prompts.',
						);
						await locator.disposeAsync();

					}
				});
			});

			suite('absolute', () => {
				testT('wild card', async () => {
					const testSettings = [
						'/Users/legomushroom/repos/**',
						'/Users/legomushroom/repos/**/*.prompt.md',
						'/Users/legomushroom/repos/**/*.md',
						'/Users/legomushroom/repos/**/*',
						'/Users/legomushroom/repos/**/gen*/**',
						'/Users/legomushroom/repos/**/gen*/**/*.prompt.md',
						'/Users/legomushroom/repos/**/gen*/**/*',
						'/Users/legomushroom/repos/**/gen*/**/*.md',
						'/Users/legomushroom/repos/**/gen*/**',
						'/Users/legomushroom/repos/**/gen*/**/*',
						'/Users/legomushroom/repos/**/gen*/**/*.md',
						'/Users/legomushroom/repos/**/gen*/**/*.prompt.md',
						'/Users/legomushroom/repos/{vscode,prompts}/**',
						'/Users/legomushroom/repos/{vscode,prompts}/**/*.prompt.md',
						'/Users/legomushroom/repos/{vscode,prompts}/**/*.md',
						'/Users/legomushroom/repos/{vscode,prompts}/**/*',
						'/Users/legomushroom/repos/{vscode,prompts}/**/gen*/**',
						'/Users/legomushroom/repos/{vscode,prompts}/**/gen*/**/*.prompt.md',
						'/Users/legomushroom/repos/{vscode,prompts}/**/gen*/**/*',
						'/Users/legomushroom/repos/{vscode,prompts}/**/gen*/**/*.md',
						'/Users/legomushroom/repos/{vscode,prompts}/**/gen*/**',
						'/Users/legomushroom/repos/{vscode,prompts}/**/gen*/**/*',
						'/Users/legomushroom/repos/{vscode,prompts}/**/gen*/**/*.md',
						'/Users/legomushroom/repos/{vscode,prompts}/**/gen*/**/*.prompt.md',
						'/Users/legomushroom/repos/{vscode,prompts}/**/{general,gen}/**',
						'/Users/legomushroom/repos/{vscode,prompts}/**/{general,gen}/**/*.prompt.md',
						'/Users/legomushroom/repos/{vscode,prompts}/**/{general,gen}/**/*',
						'/Users/legomushroom/repos/{vscode,prompts}/**/{general,gen}/**/*.md',
						'/Users/legomushroom/repos/{vscode,prompts}/**/{general,gen}/**',
						'/Users/legomushroom/repos/{vscode,prompts}/**/{general,gen}/**/*',
						'/Users/legomushroom/repos/{vscode,prompts}/**/{general,gen}/**/*.md',
						'/Users/legomushroom/repos/{vscode,prompts}/**/{general,gen}/**/*.prompt.md',
					];

					for (const setting of testSettings) {
						const locator = await createPromptsLocator(
							{ [setting]: true },
							[
								'/Users/legomushroom/repos/vscode',
								'/Users/legomushroom/repos/prompts',
							],
							[
								{
									name: '/Users/legomushroom/repos/vscode',
									children: [
										{
											name: 'gen/text',
											children: [
												{
													name: 'my.prompt.md',
													contents: 'oh hi, bot!',
												},
												{
													name: 'nested',
													children: [
														{
															name: 'specific.prompt.md',
															contents: 'oh hi, bot!',
														},
														{
															name: 'unspecific1.prompt.md',
															contents: 'oh hi, robot!',
														},
														{
															name: 'unspecific2.prompt.md',
															contents: 'oh hi, rabot!',
														},
														{
															name: 'readme.md',
															contents: 'non prompt file',
														},
													],
												}
											],
										},
									],
								},
								{
									name: '/Users/legomushroom/repos/prompts',
									children: [
										{
											name: 'general',
											children: [
												{
													name: 'common.prompt.md',
													contents: 'oh hi, bot!',
												},
												{
													name: 'uncommon-10.prompt.md',
													contents: 'oh hi, robot!',
												},
												{
													name: 'license.md',
													contents: 'non prompt file',
												},
											],
										}
									],
								},
							],
						);

						assertOutcome(
							await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
							[
								'/Users/legomushroom/repos/vscode/gen/text/my.prompt.md',
								'/Users/legomushroom/repos/vscode/gen/text/nested/specific.prompt.md',
								'/Users/legomushroom/repos/vscode/gen/text/nested/unspecific1.prompt.md',
								'/Users/legomushroom/repos/vscode/gen/text/nested/unspecific2.prompt.md',
								// -
								'/Users/legomushroom/repos/prompts/general/common.prompt.md',
								'/Users/legomushroom/repos/prompts/general/uncommon-10.prompt.md',
							],
							'Must find correct prompts.',
						);
						await locator.disposeAsync();

					}
				});

				testT(`specific`, async () => {
					const testSettings = [
						[
							'/Users/legomushroom/repos/**/my.prompt.md',
							'/Users/legomushroom/repos/**/*specific*',
							'/Users/legomushroom/repos/**/*common*',
						],
						[
							'/Users/legomushroom/repos/**/my.prompt.md',
							'/Users/legomushroom/repos/**/*specific*.prompt.md',
							'/Users/legomushroom/repos/**/*common*.prompt.md',
						],
						[
							'/Users/legomushroom/repos/**/my*.md',
							'/Users/legomushroom/repos/**/*specific*.md',
							'/Users/legomushroom/repos/**/*common*.md',
						],
						[
							'/Users/legomushroom/repos/**/my*.md',
							'/Users/legomushroom/repos/**/specific*',
							'/Users/legomushroom/repos/**/unspecific*',
							'/Users/legomushroom/repos/**/common*',
							'/Users/legomushroom/repos/**/uncommon*',
						],
						[
							'/Users/legomushroom/repos/**/my.prompt.md',
							'/Users/legomushroom/repos/**/specific.prompt.md',
							'/Users/legomushroom/repos/**/unspecific1.prompt.md',
							'/Users/legomushroom/repos/**/unspecific2.prompt.md',
							'/Users/legomushroom/repos/**/common.prompt.md',
							'/Users/legomushroom/repos/**/uncommon-10.prompt.md',
						],
						[
							'/Users/legomushroom/repos/**/gen*/**/my.prompt.md',
							'/Users/legomushroom/repos/**/gen*/**/*specific*',
							'/Users/legomushroom/repos/**/gen*/**/*common*',
						],
						[
							'/Users/legomushroom/repos/**/gen*/**/my.prompt.md',
							'/Users/legomushroom/repos/**/gen*/**/*specific*.prompt.md',
							'/Users/legomushroom/repos/**/gen*/**/*common*.prompt.md',
						],
						[
							'/Users/legomushroom/repos/**/gen*/**/my*.md',
							'/Users/legomushroom/repos/**/gen*/**/*specific*.md',
							'/Users/legomushroom/repos/**/gen*/**/*common*.md',
						],
						[
							'/Users/legomushroom/repos/**/gen*/**/my*.md',
							'/Users/legomushroom/repos/**/gen*/**/specific*',
							'/Users/legomushroom/repos/**/gen*/**/unspecific*',
							'/Users/legomushroom/repos/**/gen*/**/common*',
							'/Users/legomushroom/repos/**/gen*/**/uncommon*',
						],
						[
							'/Users/legomushroom/repos/**/gen*/**/my.prompt.md',
							'/Users/legomushroom/repos/**/gen*/**/specific.prompt.md',
							'/Users/legomushroom/repos/**/gen*/**/unspecific1.prompt.md',
							'/Users/legomushroom/repos/**/gen*/**/unspecific2.prompt.md',
							'/Users/legomushroom/repos/**/gen*/**/common.prompt.md',
							'/Users/legomushroom/repos/**/gen*/**/uncommon-10.prompt.md',
						],
						[
							'/Users/legomushroom/repos/vscode/gen/text/my.prompt.md',
							'/Users/legomushroom/repos/vscode/gen/text/nested/specific.prompt.md',
							'/Users/legomushroom/repos/vscode/gen/text/nested/unspecific1.prompt.md',
							'/Users/legomushroom/repos/vscode/gen/text/nested/unspecific2.prompt.md',
							'/Users/legomushroom/repos/prompts/general/common.prompt.md',
							'/Users/legomushroom/repos/prompts/general/uncommon-10.prompt.md',
						],
						[
							'/Users/legomushroom/repos/vscode/gen/text/my.prompt.md',
							'/Users/legomushroom/repos/vscode/gen/text/nested/*specific*',
							'/Users/legomushroom/repos/prompts/general/*common*',
						],
						[
							'/Users/legomushroom/repos/vscode/gen/text/my.prompt.md',
							'/Users/legomushroom/repos/vscode/gen/text/**/specific.prompt.md',
							'/Users/legomushroom/repos/vscode/gen/text/**/unspecific1.prompt.md',
							'/Users/legomushroom/repos/vscode/gen/text/**/unspecific2.prompt.md',
							'/Users/legomushroom/repos/prompts/general/*',
						],
						[
							'/Users/legomushroom/repos/**/{gen,general}/**/my.prompt.md',
							'/Users/legomushroom/repos/**/{gen,general}/**/*specific*',
							'/Users/legomushroom/repos/**/{gen,general}/**/*common*',
						],
						[
							'/Users/legomushroom/repos/**/{gen,general}/**/my.prompt.md',
							'/Users/legomushroom/repos/**/{gen,general}/**/*specific*.prompt.md',
							'/Users/legomushroom/repos/**/{gen,general}/**/*common*.prompt.md',
						],
						[
							'/Users/legomushroom/repos/**/{gen,general}/**/my*.md',
							'/Users/legomushroom/repos/**/{gen,general}/**/*specific*.md',
							'/Users/legomushroom/repos/**/{gen,general}/**/*common*.md',
						],
						[
							'/Users/legomushroom/repos/**/{gen,general}/**/my*.md',
							'/Users/legomushroom/repos/**/{gen,general}/**/specific*',
							'/Users/legomushroom/repos/**/{gen,general}/**/unspecific*',
							'/Users/legomushroom/repos/**/{gen,general}/**/common*',
							'/Users/legomushroom/repos/**/{gen,general}/**/uncommon*',
						],
						[
							'/Users/legomushroom/repos/**/{gen,general}/**/my.prompt.md',
							'/Users/legomushroom/repos/**/{gen,general}/**/specific.prompt.md',
							'/Users/legomushroom/repos/**/{gen,general}/**/unspecific1.prompt.md',
							'/Users/legomushroom/repos/**/{gen,general}/**/unspecific2.prompt.md',
							'/Users/legomushroom/repos/**/{gen,general}/**/common.prompt.md',
							'/Users/legomushroom/repos/**/{gen,general}/**/uncommon-10.prompt.md',
						],
						[
							'/Users/legomushroom/repos/{prompts,vscode,copilot}/{gen,general}/**/my.prompt.md',
							'/Users/legomushroom/repos/{prompts,vscode,copilot}/{gen,general}/**/*specific*',
							'/Users/legomushroom/repos/{prompts,vscode,copilot}/{gen,general}/**/*common*',
						],
						[
							'/Users/legomushroom/repos/{prompts,vscode,copilot}/{gen,general}/**/my.prompt.md',
							'/Users/legomushroom/repos/{prompts,vscode,copilot}/{gen,general}/**/*specific*.prompt.md',
							'/Users/legomushroom/repos/{prompts,vscode,copilot}/{gen,general}/**/*common*.prompt.md',
						],
						[
							'/Users/legomushroom/repos/{prompts,vscode,copilot}/{gen,general}/**/my*.md',
							'/Users/legomushroom/repos/{prompts,vscode,copilot}/{gen,general}/**/*specific*.md',
							'/Users/legomushroom/repos/{prompts,vscode,copilot}/{gen,general}/**/*common*.md',
						],
						[
							'/Users/legomushroom/repos/{prompts,vscode,copilot}/{gen,general}/**/my*.md',
							'/Users/legomushroom/repos/{prompts,vscode,copilot}/{gen,general}/**/specific*',
							'/Users/legomushroom/repos/{prompts,vscode,copilot}/{gen,general}/**/unspecific*',
							'/Users/legomushroom/repos/{prompts,vscode,copilot}/{gen,general}/**/common*',
							'/Users/legomushroom/repos/{prompts,vscode,copilot}/{gen,general}/**/uncommon*',
						],
						[
							'/Users/legomushroom/repos/{prompts,vscode,copilot}/{gen,general}/**/my.prompt.md',
							'/Users/legomushroom/repos/{prompts,vscode,copilot}/{gen,general}/**/specific.prompt.md',
							'/Users/legomushroom/repos/{prompts,vscode,copilot}/{gen,general}/**/unspecific1.prompt.md',
							'/Users/legomushroom/repos/{prompts,vscode,copilot}/{gen,general}/**/unspecific2.prompt.md',
							'/Users/legomushroom/repos/{prompts,vscode,copilot}/{gen,general}/**/common.prompt.md',
							'/Users/legomushroom/repos/{prompts,vscode,copilot}/{gen,general}/**/uncommon-10.prompt.md',
						],
					];

					for (const settings of testSettings) {
						const vscodeSettings: Record<string, boolean> = {};
						for (const setting of settings) {
							vscodeSettings[setting] = true;
						}

						const locator = await createPromptsLocator(
							vscodeSettings,
							[
								'/Users/legomushroom/repos/vscode',
								'/Users/legomushroom/repos/prompts',
							],
							[
								{
									name: '/Users/legomushroom/repos/vscode',
									children: [
										{
											name: 'gen/text',
											children: [
												{
													name: 'my.prompt.md',
													contents: 'oh hi, bot!',
												},
												{
													name: 'nested',
													children: [
														{
															name: 'specific.prompt.md',
															contents: 'oh hi, bot!',
														},
														{
															name: 'unspecific1.prompt.md',
															contents: 'oh hi, robot!',
														},
														{
															name: 'unspecific2.prompt.md',
															contents: 'oh hi, rabot!',
														},
														{
															name: 'readme.md',
															contents: 'non prompt file',
														},
													],
												}
											],
										},
									],
								},
								{
									name: '/Users/legomushroom/repos/prompts',
									children: [
										{
											name: 'general',
											children: [
												{
													name: 'common.prompt.md',
													contents: 'oh hi, bot!',
												},
												{
													name: 'uncommon-10.prompt.md',
													contents: 'oh hi, robot!',
												},
												{
													name: 'license.md',
													contents: 'non prompt file',
												},
											],
										}
									],
								},
							],
						);

						assertOutcome(
							await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
							[
								'/Users/legomushroom/repos/vscode/gen/text/my.prompt.md',
								'/Users/legomushroom/repos/vscode/gen/text/nested/specific.prompt.md',
								'/Users/legomushroom/repos/vscode/gen/text/nested/unspecific1.prompt.md',
								'/Users/legomushroom/repos/vscode/gen/text/nested/unspecific2.prompt.md',
								// -
								'/Users/legomushroom/repos/prompts/general/common.prompt.md',
								'/Users/legomushroom/repos/prompts/general/uncommon-10.prompt.md',
							],
							'Must find correct prompts.',
						);
						await locator.disposeAsync();

					}
				});
			});
		});
	});

	suite('isValidGlob', () => {
		testT('valid patterns', async () => {
			const globs = [
				'**',
				'\*',
				'\**',
				'**/*',
				'**/*.prompt.md',
				'/Users/legomushroom/**/*.prompt.md',
				'/Users/legomushroom/*.prompt.md',
				'/Users/legomushroom/*',
				'/Users/legomushroom/repos/{repo1,test}',
				'/Users/legomushroom/repos/{repo1,test}/**',
				'/Users/legomushroom/repos/{repo1,test}/*',
				'/Users/legomushroom/**/{repo1,test}/**',
				'/Users/legomushroom/**/{repo1,test}',
				'/Users/legomushroom/**/{repo1,test}/*',
				'/Users/legomushroom/**/repo[1,2,3]',
				'/Users/legomushroom/**/repo[1,2,3]/**',
				'/Users/legomushroom/**/repo[1,2,3]/*',
				'/Users/legomushroom/**/repo[1,2,3]/**/*.prompt.md',
				'repo[1,2,3]/**/*.prompt.md',
				'repo[[1,2,3]/**/*.prompt.md',
				'{repo1,test}/*.prompt.md',
				'{repo1,test}/*',
				'/{repo1,test}/*',
				'/{repo1,test}}/*',
			];

			for (const glob of globs) {
				assert(
					(isValidGlob(glob) === true),
					`'${glob}' must be a 'valid' glob pattern.`,
				);
			}
		});

		testT('invalid patterns', async () => {
			const globs = [
				'.',
				'\\*',
				'\\?',
				'\\*\\?\\*',
				'repo[1,2,3',
				'repo1,2,3]',
				'repo\\[1,2,3]',
				'repo[1,2,3\\]',
				'repo\\[1,2,3\\]',
				'{repo1,repo2',
				'repo1,repo2}',
				'\\{repo1,repo2}',
				'{repo1,repo2\\}',
				'\\{repo1,repo2\\}',
				'/Users/legomushroom/repos',
				'/Users/legomushroom/repo[1,2,3',
				'/Users/legomushroom/repo1,2,3]',
				'/Users/legomushroom/repo\\[1,2,3]',
				'/Users/legomushroom/repo[1,2,3\\]',
				'/Users/legomushroom/repo\\[1,2,3\\]',
				'/Users/legomushroom/{repo1,repo2',
				'/Users/legomushroom/repo1,repo2}',
				'/Users/legomushroom/\\{repo1,repo2}',
				'/Users/legomushroom/{repo1,repo2\\}',
				'/Users/legomushroom/\\{repo1,repo2\\}',
			];

			for (const glob of globs) {
				assert(
					(isValidGlob(glob) === false),
					`'${glob}' must be an 'invalid' glob pattern.`,
				);
			}
		});
	});

	suite('getConfigBasedSourceFolders', () => {
		testT('gets unambiguous list of folders', async () => {
			const locator = await createPromptsLocator(
				{
					'.github/prompts': true,
					'/Users/**/repos/**': true,
					'gen/text/**': true,
					'gen/text/nested/*.prompt.md': true,
					'general/*': true,
					'/Users/legomushroom/repos/vscode/my-prompts': true,
					'/Users/legomushroom/repos/vscode/your-prompts/*.md': true,
					'/Users/legomushroom/repos/prompts/shared-prompts/*': true,
				},
				[
					'/Users/legomushroom/repos/vscode',
					'/Users/legomushroom/repos/prompts',
				],
				[],
			);

			assertOutcome(
				locator.getConfigBasedSourceFolders(PromptsType.prompt),
				[
					'/Users/legomushroom/repos/vscode/.github/prompts',
					'/Users/legomushroom/repos/prompts/.github/prompts',
					'/Users/legomushroom/repos/vscode/gen/text/nested',
					'/Users/legomushroom/repos/prompts/gen/text/nested',
					'/Users/legomushroom/repos/vscode/general',
					'/Users/legomushroom/repos/prompts/general',
					'/Users/legomushroom/repos/vscode/my-prompts',
					'/Users/legomushroom/repos/vscode/your-prompts',
					'/Users/legomushroom/repos/prompts/shared-prompts',
				],
				'Must find correct prompts.',
			);
			await locator.disposeAsync();
		});
	});
});

function assertOutcome(actual: readonly URI[], expected: string[], message: string) {
	assert.deepStrictEqual(actual.map((uri) => uri.path), expected, message);
}
