/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken, CancellationTokenSource } from '../../../../../../../base/common/cancellation.js';
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
import { IPathService } from '../../../../../../services/path/common/pathService.js';
import { PromptsConfig } from '../../../../common/promptSyntax/config/config.js';
import { PromptsType } from '../../../../common/promptSyntax/promptTypes.js';
import { hasGlobPattern, isValidGlob, isValidPromptFolderPath, PromptFilesLocator } from '../../../../common/promptSyntax/utils/promptFilesLocator.js';
import { mockFiles } from '../testUtils/mockFilesystem.js';
import { mockService } from './mock.js';
import { TestUserDataProfileService, TestWorkspaceTrustManagementService } from '../../../../../../test/common/workbenchTestServices.js';
import { PromptsStorage } from '../../../../common/promptSyntax/service/promptsService.js';
import { runWithFakedTimers } from '../../../../../../../base/test/common/timeTravelScheduler.js';
import { IWorkspaceTrustManagementService } from '../../../../../../../platform/workspace/common/workspaceTrust.js';

/**
 * Mocked instance of {@link IConfigurationService}.
 */
function mockConfigService(configValues: Record<string, unknown>): IConfigurationService {
	return mockService<IConfigurationService>({
		getValue(key?: string | IConfigurationOverrides) {
			// Handle object configuration overrides (e.g., for file exclude patterns)
			if (typeof key === 'object') {
				return {};
			}
			if (typeof key !== 'string') {
				assert.fail(`Unsupported configuration key '${key}'.`);
			}
			if (configValues.hasOwnProperty(key)) {
				return configValues[key];
			}
			assert.fail(`Unsupported configuration key '${key}'.`);
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

	let instantiationService: TestInstantiationService;
	let fileService: IFileService;
	const configValues: Record<string, unknown> = {};
	let workspaceTrustService: TestWorkspaceTrustManagementService;

	// Sets all prompt file location config keys to the same value
	const setLocations = (value: unknown) => {
		configValues[PromptsConfig.PROMPT_LOCATIONS_KEY] = value;
		configValues[PromptsConfig.INSTRUCTIONS_LOCATION_KEY] = value;
		configValues[PromptsConfig.MODE_LOCATION_KEY] = value;
		configValues[PromptsConfig.SKILLS_LOCATION_KEY] = value;
	};

	// Stubs workspace context service with the given folder paths
	const setWorkspaceFolders = (paths: string[]) => {
		const workspaceFolders = paths.map((path, index) => {
			const uri = URI.file(path);
			return new class extends mock<IWorkspaceFolder>() {
				override uri = uri;
				override name = basename(uri);
				override index = index;
			};
		});
		instantiationService.stub(IWorkspaceContextService, mockWorkspaceService(workspaceFolders));
	};

	setup(async () => {
		instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(ILogService, new NullLogService());

		fileService = disposables.add(instantiationService.createInstance(FileService));
		const fileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(Schemas.file, fileSystemProvider));
		instantiationService.stub(IFileService, fileService);

		workspaceTrustService = disposables.add(new TestWorkspaceTrustManagementService());
		instantiationService.stub(IWorkspaceTrustManagementService, workspaceTrustService);

		// Reset config values to defaults
		for (const key of Object.keys(configValues)) {
			delete configValues[key];
		}
		Object.assign(configValues, {
			'explorer.excludeGitIgnore': false,
			'files.exclude': {},
			'search.exclude': {},
			[PromptsConfig.USE_CUSTOMIZATIONS_IN_PARENT_REPOS]: false,
		});
		instantiationService.stub(IConfigurationService, mockConfigService(configValues));

		setWorkspaceFolders([]);

		instantiationService.stub(IWorkbenchEnvironmentService, {} as IWorkbenchEnvironmentService);
		instantiationService.stub(IUserDataProfileService, new TestUserDataProfileService());
		instantiationService.stub(ISearchService, {
			schemeHasFileSearchProvider(scheme: string): boolean {
				return true;
			},
			async fileSearch(query: IFileQuery) {
				const findFilesInLocation = async (location: URI, results: URI[] = []) => {
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
		instantiationService.stub(IPathService, {
			userHome(options?: { preferLocal: boolean }): URI | Promise<URI> {
				const uri = URI.file('/Users/legomushroom');
				if (options?.preferLocal) {
					return uri;
				}
				return Promise.resolve(uri);
			}
		} as IPathService);
	});

	suite('empty workspace', () => {
		const EMPTY_WORKSPACE: string[] = [];

		suite('empty filesystem', () => {
			testT('no config value', async () => {
				setLocations(undefined);
				setWorkspaceFolders(EMPTY_WORKSPACE);
				await mockFiles(fileService, []);
				const locator = instantiationService.createInstance(PromptFilesLocator);

				assertOutcome(
					await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
					[],
					'No prompts must be found.',
				);
			});

			testT('object config value', async () => {
				setLocations({
					'/Users/legomushroom/repos/prompts/': true,
					'/tmp/prompts/': false,
				});
				setWorkspaceFolders(EMPTY_WORKSPACE);
				await mockFiles(fileService, []);
				const locator = instantiationService.createInstance(PromptFilesLocator);

				assertOutcome(
					await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
					[],
					'No prompts must be found.',
				);
			});

			testT('array config value', async () => {
				setLocations([
					'relative/path/to/prompts/',
					'/abs/path',
				]);
				setWorkspaceFolders(EMPTY_WORKSPACE);
				await mockFiles(fileService, []);
				const locator = instantiationService.createInstance(PromptFilesLocator);

				assertOutcome(
					await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
					[],
					'No prompts must be found.',
				);
			});

			testT('null config value', async () => {
				setLocations(null);
				setWorkspaceFolders(EMPTY_WORKSPACE);
				await mockFiles(fileService, []);
				const locator = instantiationService.createInstance(PromptFilesLocator);

				assertOutcome(
					await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
					[],
					'No prompts must be found.',
				);
			});

			testT('string config value', async () => {
				setLocations('/etc/hosts/prompts');
				setWorkspaceFolders(EMPTY_WORKSPACE);
				await mockFiles(fileService, []);
				const locator = instantiationService.createInstance(PromptFilesLocator);

				assertOutcome(
					await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
					[],
					'No prompts must be found.',
				);
			});
		});

		suite('non-empty filesystem', () => {
			testT('core logic', async () => {
				setLocations({
					'/Users/legomushroom/repos/prompts': true,
					'/tmp/prompts/': true,
					'/absolute/path/prompts': false,
					'.copilot/prompts': true,
				});
				setWorkspaceFolders(EMPTY_WORKSPACE);
				await mockFiles(fileService, [
					{
						path: '/Users/legomushroom/repos/prompts/test.prompt.md',
						contents: ['Hello, World!'],
					},
					{
						path: '/Users/legomushroom/repos/prompts/refactor-tests.prompt.md',
						contents: ['some file content goes here'],
					},
					{
						path: '/tmp/prompts/translate.to-rust.prompt.md',
						contents: ['some more random file contents'],
					},
					{
						path: '/absolute/path/prompts/some-prompt-file.prompt.md',
						contents: ['hey hey hey'],
					},
				]);
				const locator = instantiationService.createInstance(PromptFilesLocator);

				assertOutcome(
					await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
					[
						'/Users/legomushroom/repos/prompts/test.prompt.md',
						'/Users/legomushroom/repos/prompts/refactor-tests.prompt.md',
						'/tmp/prompts/translate.to-rust.prompt.md'
					],
					'Must find correct prompts.',
				);
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
						setLocations({ [setting]: true });
						setWorkspaceFolders(EMPTY_WORKSPACE);
						await mockFiles(fileService, [
							{
								path: '/Users/legomushroom/repos/vscode/deps/text/my.prompt.md',
								contents: ['oh hi, bot!'],
							},
							{
								path: '/Users/legomushroom/repos/vscode/deps/text/nested/specific.prompt.md',
								contents: ['oh hi, bot!'],
							},
							{
								path: '/Users/legomushroom/repos/vscode/deps/text/nested/unspecific1.prompt.md',
								contents: ['oh hi, robot!'],
							},
							{
								path: '/Users/legomushroom/repos/vscode/deps/text/nested/unspecific2.prompt.md',
								contents: ['oh hi, rabot!'],
							},
							{
								path: '/Users/legomushroom/repos/vscode/deps/text/nested/readme.md',
								contents: ['non prompt file'],
							},
						]);
						const locator = instantiationService.createInstance(PromptFilesLocator);

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

						setLocations(vscodeSettings);
						setWorkspaceFolders(EMPTY_WORKSPACE);
						await mockFiles(fileService, [
							{
								path: '/Users/legomushroom/repos/vscode/deps/text/my.prompt.md',
								contents: ['oh hi, bot!'],
							},
							{
								path: '/Users/legomushroom/repos/vscode/deps/text/nested/default.prompt.md',
								contents: ['oh hi, bot!'],
							},
							{
								path: '/Users/legomushroom/repos/vscode/deps/text/nested/specific.prompt.md',
								contents: ['oh hi, bot!'],
							},
							{
								path: '/Users/legomushroom/repos/vscode/deps/text/nested/unspecific1.prompt.md',
								contents: ['oh hi, robot!'],
							},
							{
								path: '/Users/legomushroom/repos/vscode/deps/text/nested/unspecific2.prompt.md',
								contents: ['oh hi, rawbot!'],
							},
							{
								path: '/Users/legomushroom/repos/vscode/deps/text/nested/readme.md',
								contents: ['non prompt file'],
							},
						]);
						const locator = instantiationService.createInstance(PromptFilesLocator);

						assertOutcome(
							await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
							[
								'/Users/legomushroom/repos/vscode/deps/text/nested/specific.prompt.md',
								'/Users/legomushroom/repos/vscode/deps/text/nested/unspecific1.prompt.md',
								'/Users/legomushroom/repos/vscode/deps/text/nested/unspecific2.prompt.md',
							],
							'Must find correct prompts.',
						);
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
						setLocations({ [setting]: true });
						setWorkspaceFolders(['/Users/legomushroom/repos/vscode']);
						await mockFiles(fileService, [
							{
								path: '/Users/legomushroom/repos/vscode/deps/text/my.prompt.md',
								contents: ['oh hi, bot!'],
							},
							{
								path: '/Users/legomushroom/repos/vscode/deps/text/nested/specific.prompt.md',
								contents: ['oh hi, bot!'],
							},
							{
								path: '/Users/legomushroom/repos/vscode/deps/text/nested/unspecific1.prompt.md',
								contents: ['oh hi, robot!'],
							},
							{
								path: '/Users/legomushroom/repos/vscode/deps/text/nested/unspecific2.prompt.md',
								contents: ['oh hi, rabot!'],
							},
							{
								path: '/Users/legomushroom/repos/vscode/deps/text/nested/readme.md',
								contents: ['non prompt file'],
							},
						]);
						const locator = instantiationService.createInstance(PromptFilesLocator);

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

						setLocations(vscodeSettings);
						setWorkspaceFolders(['/Users/legomushroom/repos/vscode']);
						await mockFiles(fileService, [
							{
								path: '/Users/legomushroom/repos/vscode/deps/text/my.prompt.md',
								contents: ['oh hi, bot!'],
							},
							{
								path: '/Users/legomushroom/repos/vscode/deps/text/nested/default.prompt.md',
								contents: ['oh hi, bot!'],
							},
							{
								path: '/Users/legomushroom/repos/vscode/deps/text/nested/specific.prompt.md',
								contents: ['oh hi, bot!'],
							},
							{
								path: '/Users/legomushroom/repos/vscode/deps/text/nested/unspecific1.prompt.md',
								contents: ['oh hi, robot!'],
							},
							{
								path: '/Users/legomushroom/repos/vscode/deps/text/nested/unspecific2.prompt.md',
								contents: ['oh hi, rawbot!'],
							},
							{
								path: '/Users/legomushroom/repos/vscode/deps/text/nested/readme.md',
								contents: ['non prompt file'],
							},
						]);
						const locator = instantiationService.createInstance(PromptFilesLocator);

						assertOutcome(
							await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
							[
								'/Users/legomushroom/repos/vscode/deps/text/nested/specific.prompt.md',
								'/Users/legomushroom/repos/vscode/deps/text/nested/unspecific1.prompt.md',
								'/Users/legomushroom/repos/vscode/deps/text/nested/unspecific2.prompt.md',
							],
							'Must find correct prompts.',
						);
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

						setLocations({ [setting]: true });
						setWorkspaceFolders(['/Users/legomushroom/repos/vscode']);
						await mockFiles(fileService, [
							{
								path: '/Users/legomushroom/repos/vscode/deps/text/my.prompt.md',
								contents: ['oh hi, bot!'],
							},
							{
								path: '/Users/legomushroom/repos/vscode/deps/text/nested/specific.prompt.md',
								contents: ['oh hi, bot!'],
							},
							{
								path: '/Users/legomushroom/repos/vscode/deps/text/nested/unspecific1.prompt.md',
								contents: ['oh hi, robot!'],
							},
							{
								path: '/Users/legomushroom/repos/vscode/deps/text/nested/unspecific2.prompt.md',
								contents: ['oh hi, rabot!'],
							},
							{
								path: '/Users/legomushroom/repos/vscode/deps/text/nested/readme.md',
								contents: ['non prompt file'],
							},
						]);
						const locator = instantiationService.createInstance(PromptFilesLocator);

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

						setLocations(vscodeSettings);
						setWorkspaceFolders(['/Users/legomushroom/repos/vscode']);
						await mockFiles(fileService, [
							{
								path: '/Users/legomushroom/repos/vscode/deps/text/my.prompt.md',
								contents: ['oh hi, bot!'],
							},
							{
								path: '/Users/legomushroom/repos/vscode/deps/text/nested/default.prompt.md',
								contents: ['oh hi, bot!'],
							},
							{
								path: '/Users/legomushroom/repos/vscode/deps/text/nested/specific.prompt.md',
								contents: ['oh hi, bot!'],
							},
							{
								path: '/Users/legomushroom/repos/vscode/deps/text/nested/unspecific1.prompt.md',
								contents: ['oh hi, robot!'],
							},
							{
								path: '/Users/legomushroom/repos/vscode/deps/text/nested/unspecific2.prompt.md',
								contents: ['oh hi, rawbot!'],
							},
							{
								path: '/Users/legomushroom/repos/vscode/deps/text/nested/readme.md',
								contents: ['non prompt file'],
							},
						]);
						const locator = instantiationService.createInstance(PromptFilesLocator);

						assertOutcome(
							await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
							[
								'/Users/legomushroom/repos/vscode/deps/text/nested/specific.prompt.md',
								'/Users/legomushroom/repos/vscode/deps/text/nested/unspecific1.prompt.md',
								'/Users/legomushroom/repos/vscode/deps/text/nested/unspecific2.prompt.md',
							],
							'Must find correct prompts.',
						);

					}
				});
			});
		});
	});

	testT('core logic', async () => {
		setLocations({
			'/Users/legomushroom/repos/prompts': true,
			'/tmp/prompts/': true,
			'/absolute/path/prompts': false,
			'.copilot/prompts': true,
		});
		setWorkspaceFolders([
			'/Users/legomushroom/repos/vscode',
		]);
		await mockFiles(fileService, [
			{
				path: '/Users/legomushroom/repos/prompts/test.prompt.md',
				contents: ['Hello, World!'],
			},
			{
				path: '/Users/legomushroom/repos/prompts/refactor-tests.prompt.md',
				contents: ['some file content goes here'],
			},
			{
				path: '/tmp/prompts/translate.to-rust.prompt.md',
				contents: ['some more random file contents'],
			},
			{
				path: '/absolute/path/prompts/some-prompt-file.prompt.md',
				contents: ['hey hey hey'],
			},
			{
				path: '/Users/legomushroom/repos/vscode/.copilot/prompts/default.prompt.md',
				contents: ['oh hi, robot!'],
			},
			{
				path: '/Users/legomushroom/repos/vscode/.github/prompts/my.prompt.md',
				contents: ['oh hi, bot!'],
			},
		]);
		const locator = instantiationService.createInstance(PromptFilesLocator);

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
	});

	testT('with disabled `.github/prompts` location', async () => {
		setLocations({
			'/Users/legomushroom/repos/prompts': true,
			'/tmp/prompts/': true,
			'/absolute/path/prompts': false,
			'.copilot/prompts': true,
			'.github/prompts': false,
		});
		setWorkspaceFolders([
			'/Users/legomushroom/repos/vscode',
		]);
		await mockFiles(fileService, [
			{
				path: '/Users/legomushroom/repos/prompts/test.prompt.md',
				contents: ['Hello, World!'],
			},
			{
				path: '/Users/legomushroom/repos/prompts/refactor-tests.prompt.md',
				contents: ['some file content goes here'],
			},
			{
				path: '/tmp/prompts/translate.to-rust.prompt.md',
				contents: ['some more random file contents'],
			},
			{
				path: '/absolute/path/prompts/some-prompt-file.prompt.md',
				contents: ['hey hey hey'],
			},
			{
				path: '/Users/legomushroom/repos/vscode/.copilot/prompts/default.prompt.md',
				contents: ['oh hi, robot!'],
			},
			{
				path: '/Users/legomushroom/repos/vscode/.github/prompts/my.prompt.md',
				contents: ['oh hi, bot!'],
			},
			{
				path: '/Users/legomushroom/repos/vscode/.github/prompts/your.prompt.md',
				contents: ['oh hi, bot!'],
			},
		]);
		const locator = instantiationService.createInstance(PromptFilesLocator);

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
	});

	suite('multi-root workspace', () => {
		suite('core logic', () => {
			testT('without top-level `.github` folder', async () => {
				setLocations({
					'/Users/legomushroom/repos/prompts': true,
					'/tmp/prompts/': true,
					'/absolute/path/prompts': false,
					'.copilot/prompts': false,
				});
				setWorkspaceFolders([
					'/Users/legomushroom/repos/vscode',
					'/Users/legomushroom/repos/node',
				]);
				await mockFiles(fileService, [
					{
						path: '/Users/legomushroom/repos/prompts/test.prompt.md',
						contents: ['Hello, World!'],
					},
					{
						path: '/Users/legomushroom/repos/prompts/refactor-tests.prompt.md',
						contents: ['some file content goes here'],
					},
					{
						path: '/tmp/prompts/translate.to-rust.prompt.md',
						contents: ['some more random file contents'],
					},
					{
						path: '/absolute/path/prompts/some-prompt-file.prompt.md',
						contents: ['hey hey hey'],
					},
					{
						path: '/Users/legomushroom/repos/vscode/.copilot/prompts/prompt1.prompt.md',
						contents: ['oh hi, robot!'],
					},
					{
						path: '/Users/legomushroom/repos/vscode/.github/prompts/default.prompt.md',
						contents: ['oh hi, bot!'],
					},
					{
						path: '/Users/legomushroom/repos/node/.copilot/prompts/prompt5.prompt.md',
						contents: ['oh hi, robot!'],
					},
					{
						path: '/Users/legomushroom/repos/node/.github/prompts/refactor-static-classes.prompt.md',
						contents: ['file contents'],
					},
					{
						path: '/Users/legomushroom/repos/.github/prompts/prompt-name.prompt.md',
						contents: ['oh hi, robot!'],
					},
					{
						path: '/Users/legomushroom/repos/.github/prompts/name-of-the-prompt.prompt.md',
						contents: ['oh hi, raw bot!'],
					},
				]);
				const locator = instantiationService.createInstance(PromptFilesLocator);

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
			});

			testT('with top-level `.github` folder', async () => {
				setLocations({
					'/Users/legomushroom/repos/prompts': true,
					'/tmp/prompts/': true,
					'/absolute/path/prompts': false,
					'.copilot/prompts': false,
				});
				setWorkspaceFolders([
					'/Users/legomushroom/repos/vscode',
					'/Users/legomushroom/repos/node',
					'/var/shared/prompts',
				]);
				await mockFiles(fileService, [
					{
						path: '/Users/legomushroom/repos/prompts/test.prompt.md',
						contents: ['Hello, World!'],
					},
					{
						path: '/Users/legomushroom/repos/prompts/refactor-tests.prompt.md',
						contents: ['some file content goes here'],
					},
					{
						path: '/tmp/prompts/translate.to-rust.prompt.md',
						contents: ['some more random file contents'],
					},
					{
						path: '/absolute/path/prompts/some-prompt-file.prompt.md',
						contents: ['hey hey hey'],
					},
					{
						path: '/Users/legomushroom/repos/vscode/.copilot/prompts/prompt1.prompt.md',
						contents: ['oh hi, robot!'],
					},
					{
						path: '/Users/legomushroom/repos/vscode/.github/prompts/default.prompt.md',
						contents: ['oh hi, bot!'],
					},
					{
						path: '/Users/legomushroom/repos/node/.copilot/prompts/prompt5.prompt.md',
						contents: ['oh hi, robot!'],
					},
					{
						path: '/Users/legomushroom/repos/node/.github/prompts/refactor-static-classes.prompt.md',
						contents: ['file contents'],
					},
					{
						path: '/var/shared/prompts/.github/prompts/prompt-name.prompt.md',
						contents: ['oh hi, robot!'],
					},
					{
						path: '/var/shared/prompts/.github/prompts/name-of-the-prompt.prompt.md',
						contents: ['oh hi, raw bot!'],
					},
				]);
				const locator = instantiationService.createInstance(PromptFilesLocator);

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
			});

			testT('with disabled `.github/prompts` location', async () => {
				setLocations({
					'/Users/legomushroom/repos/prompts': true,
					'/tmp/prompts/': true,
					'/absolute/path/prompts': false,
					'.copilot/prompts': false,
					'.github/prompts': false,
				});
				setWorkspaceFolders([
					'/Users/legomushroom/repos/vscode',
					'/Users/legomushroom/repos/node',
					'/var/shared/prompts',
				]);
				await mockFiles(fileService, [
					{
						path: '/Users/legomushroom/repos/prompts/test.prompt.md',
						contents: ['Hello, World!'],
					},
					{
						path: '/Users/legomushroom/repos/prompts/refactor-tests.prompt.md',
						contents: ['some file content goes here'],
					},
					{
						path: '/tmp/prompts/translate.to-rust.prompt.md',
						contents: ['some more random file contents'],
					},
					{
						path: '/absolute/path/prompts/some-prompt-file.prompt.md',
						contents: ['hey hey hey'],
					},
					{
						path: '/Users/legomushroom/repos/vscode/.copilot/prompts/prompt1.prompt.md',
						contents: ['oh hi, robot!'],
					},
					{
						path: '/Users/legomushroom/repos/vscode/.github/prompts/default.prompt.md',
						contents: ['oh hi, bot!'],
					},
					{
						path: '/Users/legomushroom/repos/node/.copilot/prompts/prompt5.prompt.md',
						contents: ['oh hi, robot!'],
					},
					{
						path: '/Users/legomushroom/repos/node/.github/prompts/refactor-static-classes.prompt.md',
						contents: ['file contents'],
					},
					{
						path: '/var/shared/prompts/.github/prompts/prompt-name.prompt.md',
						contents: ['oh hi, robot!'],
					},
					{
						path: '/var/shared/prompts/.github/prompts/name-of-the-prompt.prompt.md',
						contents: ['oh hi, raw bot!'],
					},
				]);
				const locator = instantiationService.createInstance(PromptFilesLocator);

				assertOutcome(
					await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None),
					[
						'/Users/legomushroom/repos/prompts/test.prompt.md',
						'/Users/legomushroom/repos/prompts/refactor-tests.prompt.md',
						'/tmp/prompts/translate.to-rust.prompt.md',
					],
					'Must find correct prompts.',
				);
			});

			testT('mixed', async () => {
				setLocations({
					'/Users/legomushroom/repos/**/*test*': true,
					'.copilot/prompts': false,
					'.github/prompts': true,
					'/absolute/path/prompts/some-prompt-file.prompt.md': true,
				});
				setWorkspaceFolders([
					'/Users/legomushroom/repos/vscode',
					'/Users/legomushroom/repos/node',
					'/var/shared/prompts',
				]);
				await mockFiles(fileService, [
					{
						path: '/Users/legomushroom/repos/prompts/test.prompt.md',
						contents: ['Hello, World!'],
					},
					{
						path: '/Users/legomushroom/repos/prompts/refactor-tests.prompt.md',
						contents: ['some file content goes here'],
					},
					{
						path: '/Users/legomushroom/repos/prompts/elf.prompt.md',
						contents: ['haalo!'],
					},
					{
						path: '/tmp/prompts/translate.to-rust.prompt.md',
						contents: ['some more random file contents'],
					},
					{
						path: '/absolute/path/prompts/some-prompt-file.prompt.md',
						contents: ['hey hey hey'],
					},
					{
						path: '/Users/legomushroom/repos/vscode/.copilot/prompts/prompt1.prompt.md',
						contents: ['oh hi, robot!'],
					},
					{
						path: '/Users/legomushroom/repos/vscode/.github/prompts/default.prompt.md',
						contents: ['oh hi, bot!'],
					},
					{
						path: '/Users/legomushroom/repos/node/.copilot/prompts/prompt5.prompt.md',
						contents: ['oh hi, robot!'],
					},
					{
						path: '/Users/legomushroom/repos/node/.github/prompts/refactor-static-classes.prompt.md',
						contents: ['file contents'],
					},
					{
						path: '/var/shared/prompts/.github/prompts/prompt-name.prompt.md',
						contents: ['oh hi, robot!'],
					},
					{
						path: '/var/shared/prompts/.github/prompts/name-of-the-prompt.prompt.md',
						contents: ['oh hi, raw bot!'],
					},
				]);
				const locator = instantiationService.createInstance(PromptFilesLocator);

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

						setLocations({ [setting]: true });
						setWorkspaceFolders([
							'/Users/legomushroom/repos/vscode',
							'/Users/legomushroom/repos/prompts',
						]);
						await mockFiles(fileService, [
							{
								path: '/Users/legomushroom/repos/vscode/gen/text/my.prompt.md',
								contents: ['oh hi, bot!'],
							},
							{
								path: '/Users/legomushroom/repos/vscode/gen/text/nested/specific.prompt.md',
								contents: ['oh hi, bot!'],
							},
							{
								path: '/Users/legomushroom/repos/vscode/gen/text/nested/unspecific1.prompt.md',
								contents: ['oh hi, robot!'],
							},
							{
								path: '/Users/legomushroom/repos/vscode/gen/text/nested/unspecific2.prompt.md',
								contents: ['oh hi, rabot!'],
							},
							{
								path: '/Users/legomushroom/repos/vscode/gen/text/nested/readme.md',
								contents: ['non prompt file'],
							},
							{
								path: '/Users/legomushroom/repos/prompts/general/common.prompt.md',
								contents: ['oh hi, bot!'],
							},
							{
								path: '/Users/legomushroom/repos/prompts/general/uncommon-10.prompt.md',
								contents: ['oh hi, robot!'],
							},
							{
								path: '/Users/legomushroom/repos/prompts/general/license.md',
								contents: ['non prompt file'],
							},
						]);
						const locator = instantiationService.createInstance(PromptFilesLocator);

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

						setLocations(vscodeSettings);
						setWorkspaceFolders([
							'/Users/legomushroom/repos/vscode',
							'/Users/legomushroom/repos/prompts',
						]);
						await mockFiles(fileService, [
							{
								path: '/Users/legomushroom/repos/vscode/gen/text/my.prompt.md',
								contents: ['oh hi, bot!'],
							},
							{
								path: '/Users/legomushroom/repos/vscode/gen/text/nested/specific.prompt.md',
								contents: ['oh hi, bot!'],
							},
							{
								path: '/Users/legomushroom/repos/vscode/gen/text/nested/unspecific1.prompt.md',
								contents: ['oh hi, robot!'],
							},
							{
								path: '/Users/legomushroom/repos/vscode/gen/text/nested/unspecific2.prompt.md',
								contents: ['oh hi, rabot!'],
							},
							{
								path: '/Users/legomushroom/repos/vscode/gen/text/nested/readme.md',
								contents: ['non prompt file'],
							},
							{
								path: '/Users/legomushroom/repos/prompts/general/common.prompt.md',
								contents: ['oh hi, bot!'],
							},
							{
								path: '/Users/legomushroom/repos/prompts/general/uncommon-10.prompt.md',
								contents: ['oh hi, robot!'],
							},
							{
								path: '/Users/legomushroom/repos/prompts/general/license.md',
								contents: ['non prompt file'],
							},
						]);
						const locator = instantiationService.createInstance(PromptFilesLocator);

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
						setLocations({ [setting]: true });
						setWorkspaceFolders([
							'/Users/legomushroom/repos/vscode',
							'/Users/legomushroom/repos/prompts',
						]);
						await mockFiles(fileService, [
							{
								path: '/Users/legomushroom/repos/vscode/gen/text/my.prompt.md',
								contents: ['oh hi, bot!'],
							},
							{
								path: '/Users/legomushroom/repos/vscode/gen/text/nested/specific.prompt.md',
								contents: ['oh hi, bot!'],
							},
							{
								path: '/Users/legomushroom/repos/vscode/gen/text/nested/unspecific1.prompt.md',
								contents: ['oh hi, robot!'],
							},
							{
								path: '/Users/legomushroom/repos/vscode/gen/text/nested/unspecific2.prompt.md',
								contents: ['oh hi, rabot!'],
							},
							{
								path: '/Users/legomushroom/repos/vscode/gen/text/nested/readme.md',
								contents: ['non prompt file'],
							},
							{
								path: '/Users/legomushroom/repos/prompts/general/common.prompt.md',
								contents: ['oh hi, bot!'],
							},
							{
								path: '/Users/legomushroom/repos/prompts/general/uncommon-10.prompt.md',
								contents: ['oh hi, robot!'],
							},
							{
								path: '/Users/legomushroom/repos/prompts/general/license.md',
								contents: ['non prompt file'],
							},
						]);
						const locator = instantiationService.createInstance(PromptFilesLocator);

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

						setLocations(vscodeSettings);
						setWorkspaceFolders([
							'/Users/legomushroom/repos/vscode',
							'/Users/legomushroom/repos/prompts',
						]);
						await mockFiles(fileService, [
							{
								path: '/Users/legomushroom/repos/vscode/gen/text/my.prompt.md',
								contents: ['oh hi, bot!'],
							},
							{
								path: '/Users/legomushroom/repos/vscode/gen/text/nested/specific.prompt.md',
								contents: ['oh hi, bot!'],
							},
							{
								path: '/Users/legomushroom/repos/vscode/gen/text/nested/unspecific1.prompt.md',
								contents: ['oh hi, robot!'],
							},
							{
								path: '/Users/legomushroom/repos/vscode/gen/text/nested/unspecific2.prompt.md',
								contents: ['oh hi, rabot!'],
							},
							{
								path: '/Users/legomushroom/repos/vscode/gen/text/nested/readme.md',
								contents: ['non prompt file'],
							},
							{
								path: '/Users/legomushroom/repos/prompts/general/common.prompt.md',
								contents: ['oh hi, bot!'],
							},
							{
								path: '/Users/legomushroom/repos/prompts/general/uncommon-10.prompt.md',
								contents: ['oh hi, robot!'],
							},
							{
								path: '/Users/legomushroom/repos/prompts/general/license.md',
								contents: ['non prompt file'],
							},
						]);
						const locator = instantiationService.createInstance(PromptFilesLocator);

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

					}
				});
			});
		});
	});

	suite('instructions', () => {
		testT('finds instructions files in subdirectories of .github/instructions', async () => {
			setLocations({
				'.github/instructions': true,
				'.claude/rules': false,
				'~/.copilot/instructions': false,
			});
			setWorkspaceFolders(['/Users/legomushroom/repos/vscode']);
			await mockFiles(fileService, [
				{
					path: '/Users/legomushroom/repos/vscode/.github/instructions/root.instructions.md',
					contents: ['root instructions'],
				},
				{
					path: '/Users/legomushroom/repos/vscode/.github/instructions/frontend/react.instructions.md',
					contents: ['react instructions'],
				},
				{
					path: '/Users/legomushroom/repos/vscode/.github/instructions/frontend/css.instructions.md',
					contents: ['css instructions'],
				},
				{
					path: '/Users/legomushroom/repos/vscode/.github/instructions/backend/api.instructions.md',
					contents: ['api instructions'],
				},
			]);
			const locator = instantiationService.createInstance(PromptFilesLocator);

			assertOutcome(
				await locator.listFiles(PromptsType.instructions, PromptsStorage.local, CancellationToken.None),
				[
					'/Users/legomushroom/repos/vscode/.github/instructions/root.instructions.md',
					'/Users/legomushroom/repos/vscode/.github/instructions/frontend/react.instructions.md',
					'/Users/legomushroom/repos/vscode/.github/instructions/frontend/css.instructions.md',
					'/Users/legomushroom/repos/vscode/.github/instructions/backend/api.instructions.md',
				],
				'Must find instructions files recursively in subdirectories of .github/instructions.',
			);
		});
	});

	suite('skills', () => {
		suite('findAgentSkills', () => {
			testT('finds skill files in configured locations', async () => {
				setLocations({
					'.claude/skills': true,
					// disable other defaults
					'.github/skills': false,
					'~/.copilot/skills': false,
					'~/.claude/skills': false,
				});
				setWorkspaceFolders(['/Users/legomushroom/repos/vscode']);
				await mockFiles(fileService, [
					{
						path: '/Users/legomushroom/repos/vscode/.claude/skills/pptx/SKILL.md',
						contents: ['# PPTX Skill'],
					},
					{
						path: '/Users/legomushroom/repos/vscode/.claude/skills/excel/SKILL.md',
						contents: ['# Excel Skill'],
					},
				]);
				const locator = instantiationService.createInstance(PromptFilesLocator);

				const skills = await locator.findAgentSkills(CancellationToken.None);
				assertOutcome(
					skills.map(s => s.uri),
					[
						'/Users/legomushroom/repos/vscode/.claude/skills/pptx/SKILL.md',
						'/Users/legomushroom/repos/vscode/.claude/skills/excel/SKILL.md',
					],
					'Must find skill files.',
				);
			});

			testT('ignores folders without SKILL.md', async () => {
				setLocations({
					'.claude/skills': true,
					// disable other defaults
					'.github/skills': false,
					'~/.copilot/skills': false,
					'~/.claude/skills': false,
				});
				setWorkspaceFolders(['/Users/legomushroom/repos/vscode']);
				await mockFiles(fileService, [
					{
						path: '/Users/legomushroom/repos/vscode/.claude/skills/valid-skill/SKILL.md',
						contents: ['# Valid Skill'],
					},
					{
						path: '/Users/legomushroom/repos/vscode/.claude/skills/invalid-skill/readme.md',
						contents: ['Not a skill file'],
					},
					{
						path: '/Users/legomushroom/repos/vscode/.claude/skills/another-invalid/index.js',
						contents: ['console.log("not a skill")'],
					},
				]);
				const locator = instantiationService.createInstance(PromptFilesLocator);

				const skills = await locator.findAgentSkills(CancellationToken.None);
				assertOutcome(
					skills.map(s => s.uri),
					[
						'/Users/legomushroom/repos/vscode/.claude/skills/valid-skill/SKILL.md',
					],
					'Must only find folders with SKILL.md.',
				);
			});

			testT('returns empty array when no skills exist', async () => {
				setLocations({
					'.claude/skills': true,
					// disable other defaults
					'.github/skills': false,
					'~/.copilot/skills': false,
					'~/.claude/skills': false,
				});
				setWorkspaceFolders(['/Users/legomushroom/repos/vscode']);
				await mockFiles(fileService, []);
				const locator = instantiationService.createInstance(PromptFilesLocator);

				const skills = await locator.findAgentSkills(CancellationToken.None);
				assertOutcome(
					skills.map(s => s.uri),
					[],
					'Must return empty array when no skills exist.',
				);
			});

			testT('returns empty array when skill folder does not exist', async () => {
				setLocations({
					'.claude/skills': true,
					// disable other defaults
					'.github/skills': false,
					'~/.copilot/skills': false,
					'~/.claude/skills': false,
				});
				setWorkspaceFolders(['/Users/legomushroom/repos/vscode']);
				await mockFiles(fileService, []);
				const locator = instantiationService.createInstance(PromptFilesLocator);

				const skills = await locator.findAgentSkills(CancellationToken.None);
				assertOutcome(
					skills.map(s => s.uri),
					[],
					'Must return empty array when folder does not exist.',
				);
			});

			testT('finds skills across multiple workspace folders', async () => {
				setLocations({
					'.claude/skills': true,
					// disable other defaults
					'.github/skills': false,
					'~/.copilot/skills': false,
					'~/.claude/skills': false,
				});
				setWorkspaceFolders([
					'/Users/legomushroom/repos/vscode',
					'/Users/legomushroom/repos/node',
				]);
				await mockFiles(fileService, [
					{
						path: '/Users/legomushroom/repos/vscode/.claude/skills/skill-a/SKILL.md',
						contents: ['# Skill A'],
					},
					{
						path: '/Users/legomushroom/repos/node/.claude/skills/skill-b/SKILL.md',
						contents: ['# Skill B'],
					},
				]);
				const locator = instantiationService.createInstance(PromptFilesLocator);

				const skills = await locator.findAgentSkills(CancellationToken.None);
				assertOutcome(
					skills.map(s => s.uri),
					[
						'/Users/legomushroom/repos/vscode/.claude/skills/skill-a/SKILL.md',
						'/Users/legomushroom/repos/node/.claude/skills/skill-b/SKILL.md',
					],
					'Must find skills across all workspace folders.',
				);
			});
		});

		suite('listFiles with PromptsType.skill', () => {
			testT('does not list skills when location is disabled', async () => {
				setLocations({
					'.claude/skills': false,
					// disable other defaults
					'.github/skills': false,
					'~/.copilot/skills': false,
					'~/.claude/skills': false,
				});
				setWorkspaceFolders(['/Users/legomushroom/repos/vscode']);
				await mockFiles(fileService, [
					{
						path: '/Users/legomushroom/repos/vscode/.claude/skills/pptx/SKILL.md',
						contents: ['# PPTX Skill'],
					},
				]);
				const locator = instantiationService.createInstance(PromptFilesLocator);

				const files = await locator.listFiles(PromptsType.skill, PromptsStorage.local, CancellationToken.None);
				assertOutcome(
					files,
					[],
					'Must not list skills when location is disabled.',
				);
			});
		});

		suite('toAbsoluteLocationsForSkills path validation', () => {
			testT('rejects glob patterns in skill paths via getConfigBasedSourceFolders', async () => {
				setLocations({
					'skills/**': true,
					'skills/*': true,
					'**/skills': true,
					// disable defaults
					'.github/skills': false,
					'.agents/skills': false,
					'.claude/skills': false,
					'~/.copilot/skills': false,
					'~/.agents/skills': false,
					'~/.claude/skills': false,
				});
				setWorkspaceFolders(['/Users/legomushroom/repos/vscode']);
				await mockFiles(fileService, []);
				const locator = instantiationService.createInstance(PromptFilesLocator);

				const folders = await locator.getConfigBasedSourceFolders(PromptsType.skill);
				assertOutcome(
					folders,
					[],
					'Must reject glob patterns in skill paths.',
				);
			});

			testT('rejects absolute paths in skill paths via getConfigBasedSourceFolders', async () => {
				setLocations({
					'/absolute/path/skills': true,
					// disable defaults
					'.github/skills': false,
					'.agents/skills': false,
					'.claude/skills': false,
					'~/.copilot/skills': false,
					'~/.agents/skills': false,
					'~/.claude/skills': false,
				});
				setWorkspaceFolders(['/Users/legomushroom/repos/vscode']);
				await mockFiles(fileService, []);
				const locator = instantiationService.createInstance(PromptFilesLocator);

				const folders = await locator.getConfigBasedSourceFolders(PromptsType.skill);
				assertOutcome(
					folders,
					[],
					'Must reject absolute paths in skill paths.',
				);
			});

			testT('accepts relative paths in skill paths via getConfigBasedSourceFolders', async () => {
				setLocations({
					'./my-skills': true,
					'custom/skills': true,
					// disable defaults
					'.github/skills': false,
					'.agents/skills': false,
					'.claude/skills': false,
					'~/.copilot/skills': false,
					'~/.agents/skills': false,
					'~/.claude/skills': false,
				});
				setWorkspaceFolders(['/Users/legomushroom/repos/vscode']);
				await mockFiles(fileService, []);
				const locator = instantiationService.createInstance(PromptFilesLocator);

				const folders = await locator.getConfigBasedSourceFolders(PromptsType.skill);
				assertOutcome(
					folders,
					[
						'/Users/legomushroom/repos/vscode/my-skills',
						'/Users/legomushroom/repos/vscode/custom/skills',
					],
					'Must accept relative paths in skill paths.',
				);
			});

			testT('accepts parent relative paths for monorepos via getConfigBasedSourceFolders', async () => {
				setLocations({
					'../shared-skills': true,
					// disable defaults
					'.github/skills': false,
					'.agents/skills': false,
					'.claude/skills': false,
					'~/.copilot/skills': false,
					'~/.agents/skills': false,
					'~/.claude/skills': false,
				});
				setWorkspaceFolders(['/Users/legomushroom/repos/vscode']);
				await mockFiles(fileService, []);
				const locator = instantiationService.createInstance(PromptFilesLocator);

				const folders = await locator.getConfigBasedSourceFolders(PromptsType.skill);
				assertOutcome(
					folders,
					[
						'/Users/legomushroom/repos/shared-skills',
					],
					'Must accept parent relative paths for monorepos.',
				);
			});

			testT('accepts tilde paths for user home skills', async () => {
				setLocations({
					'~/my-skills': true,
					// disable defaults
					'.github/skills': false,
					'.agents/skills': false,
					'.claude/skills': false,
					'~/.copilot/skills': false,
					'~/.agents/skills': false,
					'~/.claude/skills': false,
				});
				setWorkspaceFolders(['/Users/legomushroom/repos/vscode']);
				await mockFiles(fileService, []);
				const locator = instantiationService.createInstance(PromptFilesLocator);

				const folders = await locator.getConfigBasedSourceFolders(PromptsType.skill);
				assertOutcome(
					folders,
					[
						'/Users/legomushroom/my-skills',
					],
					'Must accept tilde paths for user home skills.',
				);
			});
		});

		suite('getConfigBasedSourceFolders for skills', () => {
			testT('returns source folders without glob processing', async () => {
				setLocations({
					'.claude/skills': true,
					'custom-skills': true,
					// explicitly disable other defaults we don't want for this test
					'.github/skills': false,
					'.agents/skills': false,
					'~/.copilot/skills': false,
					'~/.agents/skills': false,
					'~/.claude/skills': false,
				});
				setWorkspaceFolders([
					'/Users/legomushroom/repos/vscode',
					'/Users/legomushroom/repos/node',
				]);
				await mockFiles(fileService, []);
				const locator = instantiationService.createInstance(PromptFilesLocator);

				const folders = await locator.getConfigBasedSourceFolders(PromptsType.skill);
				assertOutcome(
					folders,
					[
						'/Users/legomushroom/repos/vscode/.claude/skills',
						'/Users/legomushroom/repos/node/.claude/skills',
						'/Users/legomushroom/repos/vscode/custom-skills',
						'/Users/legomushroom/repos/node/custom-skills',
					],
					'Must return skill source folders without glob processing.',
				);
			});

			testT('filters out invalid skill paths from source folders', async () => {
				setLocations({
					'.claude/skills': true,
					'skills/**': true, // glob - should be filtered out
					'/absolute/skills': true, // absolute - should be filtered out
					// explicitly disable other defaults we don't want for this test
					'.github/skills': false,
					'.agents/skills': false,
					'~/.copilot/skills': false,
					'~/.agents/skills': false,
					'~/.claude/skills': false,
				});
				setWorkspaceFolders(['/Users/legomushroom/repos/vscode']);
				await mockFiles(fileService, []);
				const locator = instantiationService.createInstance(PromptFilesLocator);

				const folders = await locator.getConfigBasedSourceFolders(PromptsType.skill);
				assertOutcome(
					folders,
					[
						'/Users/legomushroom/repos/vscode/.claude/skills',
					],
					'Must filter out invalid skill paths.',
				);
			});

			testT('includes default skill source folders from defaults', async () => {
				setLocations({
					'custom-skills': true,
				});
				setWorkspaceFolders(['/Users/legomushroom/repos/vscode']);
				await mockFiles(fileService, []);
				const locator = instantiationService.createInstance(PromptFilesLocator);

				const folders = await locator.getConfigBasedSourceFolders(PromptsType.skill);
				assertOutcome(
					folders,
					[
						// defaults
						'/Users/legomushroom/repos/vscode/.github/skills',
						'/Users/legomushroom/repos/vscode/.agents/skills',
						'/Users/legomushroom/repos/vscode/.claude/skills',
						'/Users/legomushroom/.copilot/skills',
						'/Users/legomushroom/.agents/skills',
						'/Users/legomushroom/.claude/skills',
						// custom
						'/Users/legomushroom/repos/vscode/custom-skills',
					],
					'Must include default skill source folders.',
				);
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

	suite('isValidSkillPath', () => {
		testT('accepts relative paths', async () => {
			const validPaths = [
				'someFolder',
				'./someFolder',
				'my-skills',
				'./my-skills',
				'folder/subfolder',
				'./folder/subfolder',
			];

			for (const path of validPaths) {
				assert.strictEqual(
					isValidPromptFolderPath(path),
					true,
					`'${path}' must be accepted as a valid skill path (relative path).`,
				);
			}
		});

		testT('accepts user home paths', async () => {
			const validPaths = [
				'~/folder',
				'~/.copilot/skills',
				'~/.claude/skills',
				'~/my-skills',
			];

			for (const path of validPaths) {
				assert.strictEqual(
					isValidPromptFolderPath(path),
					true,
					`'${path}' must be accepted as a valid skill path (user home path).`,
				);
			}
		});

		testT('accepts parent relative paths for monorepos', async () => {
			const validPaths = [
				'../folder',
				'../shared-skills',
				'../../common/skills',
				'../parent/folder',
			];

			for (const path of validPaths) {
				assert.strictEqual(
					isValidPromptFolderPath(path),
					true,
					`'${path}' must be accepted as a valid skill path (parent relative path).`,
				);
			}
		});

		testT('rejects absolute paths', async () => {
			const invalidPaths = [
				// Unix absolute paths
				'/Users/username/skills',
				'/absolute/path',
				'/usr/local/skills',
				// Windows absolute paths
				'C:\\Users\\skills',
				'D:/skills',
				'c:\\folder',
			];

			for (const path of invalidPaths) {
				assert.strictEqual(
					isValidPromptFolderPath(path),
					false,
					`'${path}' must be rejected (absolute paths not supported for portability).`,
				);
			}
		});

		testT('rejects tilde paths without path separator', async () => {
			const invalidPaths = [
				'~abc',
				'~skills',
				'~.config',
				// Windows-style backslash paths are not supported for cross-platform sharing
				'~\\folder',
				'~\\.copilot\\skills',
			];

			for (const path of invalidPaths) {
				assert.strictEqual(
					isValidPromptFolderPath(path),
					false,
					`'${path}' must be rejected (tilde must be followed by / only, not \\).`,
				);
			}
		});

		testT('rejects paths with backslashes', async () => {
			const invalidPaths = [
				'folder\\subfolder',
				'.\\skills',
				'..\\parent\\folder',
				'my\\skills\\folder',
			];

			for (const path of invalidPaths) {
				assert.strictEqual(
					isValidPromptFolderPath(path),
					false,
					`'${path}' must be rejected (backslash paths not supported for cross-platform sharing).`,
				);
			}
		});

		testT('rejects glob patterns', async () => {
			const invalidPaths = [
				'skills/*',
				'skills/**',
				'**/skills',
				'skills/*.md',
				'skills/**/*.md',
				'{skill1,skill2}',
				'skill[1,2,3]',
				'skills?',
				'./skills/*',
				'~/skills/**',
			];

			for (const path of invalidPaths) {
				assert.strictEqual(
					isValidPromptFolderPath(path),
					false,
					`'${path}' must be rejected (glob patterns not supported for performance).`,
				);
			}
		});

		testT('rejects empty or whitespace paths', async () => {
			const invalidPaths = [
				'',
				'   ',
				'\t',
				'\n',
			];

			for (const path of invalidPaths) {
				assert.strictEqual(
					isValidPromptFolderPath(path),
					false,
					`'${path}' must be rejected (empty or whitespace only).`,
				);
			}
		});

		testT('handles paths with spaces', async () => {
			const validPaths = [
				'my skills',
				'./my skills/folder',
				'~/my skills',
				'../shared skills',
			];

			for (const path of validPaths) {
				assert.strictEqual(
					isValidPromptFolderPath(path),
					true,
					`'${path}' must be accepted (paths with spaces are valid).`,
				);
			}
		});
	});

	suite('hasGlobPattern', () => {
		testT('detects single wildcard', async () => {
			const pathsWithGlob = [
				'skills/*',
				'my-skills/*',
				'*.md',
				'*/folder',
			];

			for (const path of pathsWithGlob) {
				assert.strictEqual(
					hasGlobPattern(path),
					true,
					`'${path}' must be detected as having a glob pattern.`,
				);
			}
		});

		testT('detects double wildcard', async () => {
			const pathsWithGlob = [
				'skills/**',
				'**/skills',
				'**/*.md',
				'a/**/b',
			];

			for (const path of pathsWithGlob) {
				assert.strictEqual(
					hasGlobPattern(path),
					true,
					`'${path}' must be detected as having a glob pattern.`,
				);
			}
		});

		testT('returns false for paths without wildcards', async () => {
			const pathsWithoutGlob = [
				'skills',
				'./skills/folder',
				'~/skills',
				'../parent/folder',
				'.github/prompts',
			];

			for (const path of pathsWithoutGlob) {
				assert.strictEqual(
					hasGlobPattern(path),
					false,
					`'${path}' must not be detected as having a glob pattern.`,
				);
			}
		});
	});

	suite('getConfigBasedSourceFolders', () => {
		testT('gets unambiguous list of folders', async () => {
			setLocations({
				'.github/prompts': true,
				'/Users/**/repos/**': true,
				'gen/text/**': true,
				'gen/text/nested/*.prompt.md': true,
				'general/*': true,
				'/Users/legomushroom/repos/vscode/my-prompts': true,
				'/Users/legomushroom/repos/vscode/your-prompts/*.md': true,
				'/Users/legomushroom/repos/prompts/shared-prompts/*': true,
			});
			setWorkspaceFolders([
				'/Users/legomushroom/repos/vscode',
				'/Users/legomushroom/repos/prompts',
			]);
			await mockFiles(fileService, []);
			const locator = instantiationService.createInstance(PromptFilesLocator);

			assertOutcome(
				await locator.getConfigBasedSourceFolders(PromptsType.prompt),
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
		});
	});

	suite('findAgentMDsInWorkspace', () => {
		testT('finds AGENTS.md files using FileSearchProvider', async () => {
			setWorkspaceFolders(['/Users/legomushroom/repos/workspace']);
			await mockFiles(fileService, [
				{
					path: '/Users/legomushroom/repos/workspace/AGENTS.md',
					contents: ['# Root agents']
				},
				{
					path: '/Users/legomushroom/repos/workspace/src/AGENTS.md',
					contents: ['# Src agents']
				}
			]);
			const locator = instantiationService.createInstance(PromptFilesLocator);

			const result = (await locator.findAgentMDsInWorkspace(CancellationToken.None)).map(f => f.uri);
			assertOutcome(
				result,
				[
					'/Users/legomushroom/repos/workspace/AGENTS.md',
					'/Users/legomushroom/repos/workspace/src/AGENTS.md'
				],
				'Must find all AGENTS.md files using search service.'
			);
		});

		testT('finds AGENTS.md files using file service fallback', async () => {
			setWorkspaceFolders(['/Users/legomushroom/repos/workspace']);
			await mockFiles(fileService, [
				{
					path: '/Users/legomushroom/repos/workspace/AGENTS.md',
					contents: ['# Root agents']
				},
				{
					path: '/Users/legomushroom/repos/workspace/src/AGENTS.md',
					contents: ['# Src agents']
				},
				{
					path: '/Users/legomushroom/repos/workspace/src/nested/AGENTS.md',
					contents: ['# Nested agents']
				}
			]);
			instantiationService.stub(ISearchService, {
				schemeHasFileSearchProvider: () => false,
				async fileSearch() { throw new Error('FileSearchProvider not available'); }
			});
			const locator = instantiationService.createInstance(PromptFilesLocator);

			const result = (await locator.findAgentMDsInWorkspace(CancellationToken.None)).map(f => f.uri);
			assertOutcome(
				result,
				[
					'/Users/legomushroom/repos/workspace/AGENTS.md',
					'/Users/legomushroom/repos/workspace/src/AGENTS.md',
					'/Users/legomushroom/repos/workspace/src/nested/AGENTS.md'
				],
				'Must find all AGENTS.md files using file service fallback.'
			);
		});

		testT('handles cancellation token in file service fallback', async () => {
			setWorkspaceFolders(['/Users/legomushroom/repos/workspace']);
			await mockFiles(fileService, [
				{
					path: '/Users/legomushroom/repos/workspace/AGENTS.md',
					contents: ['# Root agents']
				}
			]);
			instantiationService.stub(ISearchService, {
				schemeHasFileSearchProvider: () => false,
				async fileSearch() { throw new Error('FileSearchProvider not available'); }
			});
			const locator = instantiationService.createInstance(PromptFilesLocator);

			const source = new CancellationTokenSource();
			// Cancel immediately
			source.cancel();
			const result = (await locator.findAgentMDsInWorkspace(source.token)).map(f => f.uri);
			assertOutcome(
				result,
				[],
				'Must return empty array when cancelled.'
			);
		});

	});

	suite('getWorkspaceFolderRoots', () => {
		let locator: PromptFilesLocator;

		// Override setWorkspaceFolders to also create the locator
		const setWorkspaceFoldersForRoots = (paths: string[]) => {
			setWorkspaceFolders(paths);
			locator = instantiationService.createInstance(PromptFilesLocator);
		};

		testT('returns only workspace folder when it has .git', async () => {
			setWorkspaceFoldersForRoots(['/repos/my-project']);
			await mockFiles(fileService, [
				{ path: '/repos/my-project/.git/HEAD', contents: ['ref: refs/heads/main'] },
				{ path: '/repos/my-project/src/index.ts', contents: ['export {};'] },
			]);

			const roots = await locator.getWorkspaceFolderRoots(true);
			assert.deepStrictEqual(
				roots.map(r => r.path),
				['/repos/my-project'],
				'Should only return the workspace folder itself when it has .git',
			);
		});

		testT('walks up to parent with .git when workspace folder has no .git', async () => {
			setWorkspaceFoldersForRoots(['/repos/monorepo/packages/my-app']);
			await mockFiles(fileService, [
				{ path: '/repos/monorepo/.git/HEAD', contents: ['ref: refs/heads/main'] },
				{ path: '/repos/monorepo/packages/my-app/src/index.ts', contents: ['export {};'] },
			]);

			workspaceTrustService.setTrustedUris([URI.file('/repos/monorepo')]);

			const roots = await locator.getWorkspaceFolderRoots(true);
			assert.deepStrictEqual(
				roots.map(r => r.path).sort(),
				[
					'/repos/monorepo',
					'/repos/monorepo/packages',
					'/repos/monorepo/packages/my-app',
				].sort(),
				'Should include workspace folder and all parents up to the one with .git',
			);
		});

		testT('does not walk up when includeParents is false', async () => {
			setWorkspaceFoldersForRoots(['/repos/monorepo/packages/my-app']);
			await mockFiles(fileService, [
				{ path: '/repos/monorepo/.git/HEAD', contents: ['ref: refs/heads/main'] },
				{ path: '/repos/monorepo/packages/my-app/src/index.ts', contents: ['export {};'] },
			]);

			workspaceTrustService.setTrustedUris([URI.file('/repos/monorepo')]);

			const roots = await locator.getWorkspaceFolderRoots(false);
			assert.deepStrictEqual(
				roots.map(r => r.path),
				['/repos/monorepo/packages/my-app'],
				'Should only return workspace folders when includeParents is false',
			);
		});

		testT('excludes vscode-agent-host workspace folders', async () => {
			// Agent host folders surface customizations through AHP, not via
			// filesystem scanning. Including them here would issue a `resourceList`
			// JSON-RPC per configured location for every nonexistent `.github` /
			// `.claude` folder on the remote.
			const localFolder = URI.file('/repos/local-project');
			const agentHostFolder = URI.from({ scheme: 'vscode-agent-host', authority: 'remote', path: '/repos/remote-project' });
			const folders = [localFolder, agentHostFolder].map((uri, index) => new class extends mock<IWorkspaceFolder>() {
				override uri = uri;
				override name = basename(uri);
				override index = index;
			});
			instantiationService.stub(IWorkspaceContextService, mockWorkspaceService(folders));
			locator = instantiationService.createInstance(PromptFilesLocator);
			await mockFiles(fileService, [
				{ path: '/repos/local-project/.git/HEAD', contents: ['ref: refs/heads/main'] },
			]);

			const roots = await locator.getWorkspaceFolderRoots(true);
			assert.deepStrictEqual(
				roots.map(r => r.toString()),
				[localFolder.toString()],
				'Should exclude vscode-agent-host workspace folders from prompt-file discovery roots',
			);
		});

		testT('returns only workspace folder when no .git is found', async () => {
			setWorkspaceFoldersForRoots(['/Users/legomushroom/my-project']);
			await mockFiles(fileService, [
				{ path: '/Users/legomushroom/my-project/src/index.ts', contents: ['export {};'] },
			]);

			const roots = await locator.getWorkspaceFolderRoots(true);
			assert.deepStrictEqual(
				roots.map(r => r.path),
				['/Users/legomushroom/my-project'],
				'Should only return the workspace folder when no .git is found in any parent',
			);
		});
	});
});

function assertOutcome(actual: readonly URI[], expected: string[], message: string) {
	assert.deepStrictEqual(actual.map((uri) => uri.path), expected, message);
}
