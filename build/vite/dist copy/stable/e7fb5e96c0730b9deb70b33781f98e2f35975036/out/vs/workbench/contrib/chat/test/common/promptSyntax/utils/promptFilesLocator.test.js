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
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../../../platform/files/common/files.js';
import { FileService } from '../../../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../../platform/log/common/log.js';
import { IWorkspaceContextService } from '../../../../../../../platform/workspace/common/workspace.js';
import { IWorkbenchEnvironmentService } from '../../../../../../services/environment/common/environmentService.js';
import { ISearchService } from '../../../../../../services/search/common/search.js';
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
function mockConfigService(configValues) {
    return mockService({
        getValue(key) {
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
function mockWorkspaceService(folders) {
    return mockService({
        getWorkspace() {
            return new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.folders = folders;
                }
            };
        },
        getWorkspaceFolder() {
            return null;
        }
    });
}
function testT(name, fn) {
    return test(name, () => runWithFakedTimers({ useFakeTimers: true }, fn));
}
suite('PromptFilesLocator', () => {
    const disposables = ensureNoDisposablesAreLeakedInTestSuite();
    let instantiationService;
    let fileService;
    const configValues = {};
    let workspaceTrustService;
    // Sets all prompt file location config keys to the same value
    const setLocations = (value) => {
        configValues[PromptsConfig.PROMPT_LOCATIONS_KEY] = value;
        configValues[PromptsConfig.INSTRUCTIONS_LOCATION_KEY] = value;
        configValues[PromptsConfig.MODE_LOCATION_KEY] = value;
        configValues[PromptsConfig.SKILLS_LOCATION_KEY] = value;
    };
    // Stubs workspace context service with the given folder paths
    const setWorkspaceFolders = (paths) => {
        const workspaceFolders = paths.map((path, index) => {
            const uri = URI.file(path);
            return new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.uri = uri;
                    this.name = basename(uri);
                    this.index = index;
                }
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
        instantiationService.stub(IWorkbenchEnvironmentService, {});
        instantiationService.stub(IUserDataProfileService, new TestUserDataProfileService());
        instantiationService.stub(ISearchService, {
            schemeHasFileSearchProvider(scheme) {
                return true;
            },
            async fileSearch(query) {
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
                    }
                    return results;
                };
                const results = [];
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
            userHome(options) {
                const uri = URI.file('/Users/legomushroom');
                if (options?.preferLocal) {
                    return uri;
                }
                return Promise.resolve(uri);
            }
        });
    });
    suite('empty workspace', () => {
        const EMPTY_WORKSPACE = [];
        suite('empty filesystem', () => {
            testT('no config value', async () => {
                setLocations(undefined);
                setWorkspaceFolders(EMPTY_WORKSPACE);
                await mockFiles(fileService, []);
                const locator = instantiationService.createInstance(PromptFilesLocator);
                assertOutcome(await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None), [], 'No prompts must be found.');
            });
            testT('object config value', async () => {
                setLocations({
                    '/Users/legomushroom/repos/prompts/': true,
                    '/tmp/prompts/': false,
                });
                setWorkspaceFolders(EMPTY_WORKSPACE);
                await mockFiles(fileService, []);
                const locator = instantiationService.createInstance(PromptFilesLocator);
                assertOutcome(await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None), [], 'No prompts must be found.');
            });
            testT('array config value', async () => {
                setLocations([
                    'relative/path/to/prompts/',
                    '/abs/path',
                ]);
                setWorkspaceFolders(EMPTY_WORKSPACE);
                await mockFiles(fileService, []);
                const locator = instantiationService.createInstance(PromptFilesLocator);
                assertOutcome(await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None), [], 'No prompts must be found.');
            });
            testT('null config value', async () => {
                setLocations(null);
                setWorkspaceFolders(EMPTY_WORKSPACE);
                await mockFiles(fileService, []);
                const locator = instantiationService.createInstance(PromptFilesLocator);
                assertOutcome(await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None), [], 'No prompts must be found.');
            });
            testT('string config value', async () => {
                setLocations('/etc/hosts/prompts');
                setWorkspaceFolders(EMPTY_WORKSPACE);
                await mockFiles(fileService, []);
                const locator = instantiationService.createInstance(PromptFilesLocator);
                assertOutcome(await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None), [], 'No prompts must be found.');
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
                assertOutcome(await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None), [
                    '/Users/legomushroom/repos/prompts/test.prompt.md',
                    '/Users/legomushroom/repos/prompts/refactor-tests.prompt.md',
                    '/tmp/prompts/translate.to-rust.prompt.md'
                ], 'Must find correct prompts.');
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
                        assertOutcome(await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None), [
                            '/Users/legomushroom/repos/vscode/deps/text/my.prompt.md',
                            '/Users/legomushroom/repos/vscode/deps/text/nested/specific.prompt.md',
                            '/Users/legomushroom/repos/vscode/deps/text/nested/unspecific1.prompt.md',
                            '/Users/legomushroom/repos/vscode/deps/text/nested/unspecific2.prompt.md',
                        ], 'Must find correct prompts.');
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
                        const vscodeSettings = {};
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
                        assertOutcome(await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None), [
                            '/Users/legomushroom/repos/vscode/deps/text/nested/specific.prompt.md',
                            '/Users/legomushroom/repos/vscode/deps/text/nested/unspecific1.prompt.md',
                            '/Users/legomushroom/repos/vscode/deps/text/nested/unspecific2.prompt.md',
                        ], 'Must find correct prompts.');
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
                        assertOutcome(await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None), [
                            '/Users/legomushroom/repos/vscode/deps/text/my.prompt.md',
                            '/Users/legomushroom/repos/vscode/deps/text/nested/specific.prompt.md',
                            '/Users/legomushroom/repos/vscode/deps/text/nested/unspecific1.prompt.md',
                            '/Users/legomushroom/repos/vscode/deps/text/nested/unspecific2.prompt.md',
                        ], 'Must find correct prompts.');
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
                        const vscodeSettings = {};
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
                        assertOutcome(await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None), [
                            '/Users/legomushroom/repos/vscode/deps/text/nested/specific.prompt.md',
                            '/Users/legomushroom/repos/vscode/deps/text/nested/unspecific1.prompt.md',
                            '/Users/legomushroom/repos/vscode/deps/text/nested/unspecific2.prompt.md',
                        ], 'Must find correct prompts.');
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
                        assertOutcome(await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None), [
                            '/Users/legomushroom/repos/vscode/deps/text/my.prompt.md',
                            '/Users/legomushroom/repos/vscode/deps/text/nested/specific.prompt.md',
                            '/Users/legomushroom/repos/vscode/deps/text/nested/unspecific1.prompt.md',
                            '/Users/legomushroom/repos/vscode/deps/text/nested/unspecific2.prompt.md',
                        ], 'Must find correct prompts.');
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
                        const vscodeSettings = {};
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
                        assertOutcome(await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None), [
                            '/Users/legomushroom/repos/vscode/deps/text/nested/specific.prompt.md',
                            '/Users/legomushroom/repos/vscode/deps/text/nested/unspecific1.prompt.md',
                            '/Users/legomushroom/repos/vscode/deps/text/nested/unspecific2.prompt.md',
                        ], 'Must find correct prompts.');
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
        assertOutcome(await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None), [
            '/Users/legomushroom/repos/vscode/.github/prompts/my.prompt.md',
            '/Users/legomushroom/repos/prompts/test.prompt.md',
            '/Users/legomushroom/repos/prompts/refactor-tests.prompt.md',
            '/tmp/prompts/translate.to-rust.prompt.md',
            '/Users/legomushroom/repos/vscode/.copilot/prompts/default.prompt.md',
        ], 'Must find correct prompts.');
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
        assertOutcome(await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None), [
            '/Users/legomushroom/repos/prompts/test.prompt.md',
            '/Users/legomushroom/repos/prompts/refactor-tests.prompt.md',
            '/tmp/prompts/translate.to-rust.prompt.md',
            '/Users/legomushroom/repos/vscode/.copilot/prompts/default.prompt.md',
        ], 'Must find correct prompts.');
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
                assertOutcome(await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None), [
                    '/Users/legomushroom/repos/vscode/.github/prompts/default.prompt.md',
                    '/Users/legomushroom/repos/node/.github/prompts/refactor-static-classes.prompt.md',
                    '/Users/legomushroom/repos/prompts/test.prompt.md',
                    '/Users/legomushroom/repos/prompts/refactor-tests.prompt.md',
                    '/tmp/prompts/translate.to-rust.prompt.md',
                ], 'Must find correct prompts.');
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
                assertOutcome(await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None), [
                    '/Users/legomushroom/repos/vscode/.github/prompts/default.prompt.md',
                    '/Users/legomushroom/repos/node/.github/prompts/refactor-static-classes.prompt.md',
                    '/var/shared/prompts/.github/prompts/prompt-name.prompt.md',
                    '/var/shared/prompts/.github/prompts/name-of-the-prompt.prompt.md',
                    '/Users/legomushroom/repos/prompts/test.prompt.md',
                    '/Users/legomushroom/repos/prompts/refactor-tests.prompt.md',
                    '/tmp/prompts/translate.to-rust.prompt.md',
                ], 'Must find correct prompts.');
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
                assertOutcome(await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None), [
                    '/Users/legomushroom/repos/prompts/test.prompt.md',
                    '/Users/legomushroom/repos/prompts/refactor-tests.prompt.md',
                    '/tmp/prompts/translate.to-rust.prompt.md',
                ], 'Must find correct prompts.');
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
                assertOutcome(await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None), [
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
                ], 'Must find correct prompts.');
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
                        assertOutcome(await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None), [
                            '/Users/legomushroom/repos/vscode/gen/text/my.prompt.md',
                            '/Users/legomushroom/repos/vscode/gen/text/nested/specific.prompt.md',
                            '/Users/legomushroom/repos/vscode/gen/text/nested/unspecific1.prompt.md',
                            '/Users/legomushroom/repos/vscode/gen/text/nested/unspecific2.prompt.md',
                            // -
                            '/Users/legomushroom/repos/prompts/general/common.prompt.md',
                            '/Users/legomushroom/repos/prompts/general/uncommon-10.prompt.md',
                        ], 'Must find correct prompts.');
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
                        const vscodeSettings = {};
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
                        assertOutcome(await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None), [
                            '/Users/legomushroom/repos/vscode/gen/text/my.prompt.md',
                            '/Users/legomushroom/repos/vscode/gen/text/nested/specific.prompt.md',
                            '/Users/legomushroom/repos/vscode/gen/text/nested/unspecific1.prompt.md',
                            '/Users/legomushroom/repos/vscode/gen/text/nested/unspecific2.prompt.md',
                            // -
                            '/Users/legomushroom/repos/prompts/general/common.prompt.md',
                            '/Users/legomushroom/repos/prompts/general/uncommon-10.prompt.md',
                        ], 'Must find correct prompts.');
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
                        assertOutcome(await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None), [
                            '/Users/legomushroom/repos/vscode/gen/text/my.prompt.md',
                            '/Users/legomushroom/repos/vscode/gen/text/nested/specific.prompt.md',
                            '/Users/legomushroom/repos/vscode/gen/text/nested/unspecific1.prompt.md',
                            '/Users/legomushroom/repos/vscode/gen/text/nested/unspecific2.prompt.md',
                            // -
                            '/Users/legomushroom/repos/prompts/general/common.prompt.md',
                            '/Users/legomushroom/repos/prompts/general/uncommon-10.prompt.md',
                        ], 'Must find correct prompts.');
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
                        const vscodeSettings = {};
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
                        assertOutcome(await locator.listFiles(PromptsType.prompt, PromptsStorage.local, CancellationToken.None), [
                            '/Users/legomushroom/repos/vscode/gen/text/my.prompt.md',
                            '/Users/legomushroom/repos/vscode/gen/text/nested/specific.prompt.md',
                            '/Users/legomushroom/repos/vscode/gen/text/nested/unspecific1.prompt.md',
                            '/Users/legomushroom/repos/vscode/gen/text/nested/unspecific2.prompt.md',
                            // -
                            '/Users/legomushroom/repos/prompts/general/common.prompt.md',
                            '/Users/legomushroom/repos/prompts/general/uncommon-10.prompt.md',
                        ], 'Must find correct prompts.');
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
            assertOutcome(await locator.listFiles(PromptsType.instructions, PromptsStorage.local, CancellationToken.None), [
                '/Users/legomushroom/repos/vscode/.github/instructions/root.instructions.md',
                '/Users/legomushroom/repos/vscode/.github/instructions/frontend/react.instructions.md',
                '/Users/legomushroom/repos/vscode/.github/instructions/frontend/css.instructions.md',
                '/Users/legomushroom/repos/vscode/.github/instructions/backend/api.instructions.md',
            ], 'Must find instructions files recursively in subdirectories of .github/instructions.');
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
                assertOutcome(skills.map(s => s.uri), [
                    '/Users/legomushroom/repos/vscode/.claude/skills/pptx/SKILL.md',
                    '/Users/legomushroom/repos/vscode/.claude/skills/excel/SKILL.md',
                ], 'Must find skill files.');
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
                assertOutcome(skills.map(s => s.uri), [
                    '/Users/legomushroom/repos/vscode/.claude/skills/valid-skill/SKILL.md',
                ], 'Must only find folders with SKILL.md.');
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
                assertOutcome(skills.map(s => s.uri), [], 'Must return empty array when no skills exist.');
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
                assertOutcome(skills.map(s => s.uri), [], 'Must return empty array when folder does not exist.');
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
                assertOutcome(skills.map(s => s.uri), [
                    '/Users/legomushroom/repos/vscode/.claude/skills/skill-a/SKILL.md',
                    '/Users/legomushroom/repos/node/.claude/skills/skill-b/SKILL.md',
                ], 'Must find skills across all workspace folders.');
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
                assertOutcome(files, [], 'Must not list skills when location is disabled.');
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
                assertOutcome(folders, [], 'Must reject glob patterns in skill paths.');
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
                assertOutcome(folders, [], 'Must reject absolute paths in skill paths.');
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
                assertOutcome(folders, [
                    '/Users/legomushroom/repos/vscode/my-skills',
                    '/Users/legomushroom/repos/vscode/custom/skills',
                ], 'Must accept relative paths in skill paths.');
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
                assertOutcome(folders, [
                    '/Users/legomushroom/repos/shared-skills',
                ], 'Must accept parent relative paths for monorepos.');
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
                assertOutcome(folders, [
                    '/Users/legomushroom/my-skills',
                ], 'Must accept tilde paths for user home skills.');
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
                assertOutcome(folders, [
                    '/Users/legomushroom/repos/vscode/.claude/skills',
                    '/Users/legomushroom/repos/node/.claude/skills',
                    '/Users/legomushroom/repos/vscode/custom-skills',
                    '/Users/legomushroom/repos/node/custom-skills',
                ], 'Must return skill source folders without glob processing.');
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
                assertOutcome(folders, [
                    '/Users/legomushroom/repos/vscode/.claude/skills',
                ], 'Must filter out invalid skill paths.');
            });
            testT('includes default skill source folders from defaults', async () => {
                setLocations({
                    'custom-skills': true,
                });
                setWorkspaceFolders(['/Users/legomushroom/repos/vscode']);
                await mockFiles(fileService, []);
                const locator = instantiationService.createInstance(PromptFilesLocator);
                const folders = await locator.getConfigBasedSourceFolders(PromptsType.skill);
                assertOutcome(folders, [
                    // defaults
                    '/Users/legomushroom/repos/vscode/.github/skills',
                    '/Users/legomushroom/repos/vscode/.agents/skills',
                    '/Users/legomushroom/repos/vscode/.claude/skills',
                    '/Users/legomushroom/.copilot/skills',
                    '/Users/legomushroom/.agents/skills',
                    '/Users/legomushroom/.claude/skills',
                    // custom
                    '/Users/legomushroom/repos/vscode/custom-skills',
                ], 'Must include default skill source folders.');
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
                assert((isValidGlob(glob) === true), `'${glob}' must be a 'valid' glob pattern.`);
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
                assert((isValidGlob(glob) === false), `'${glob}' must be an 'invalid' glob pattern.`);
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
                assert.strictEqual(isValidPromptFolderPath(path), true, `'${path}' must be accepted as a valid skill path (relative path).`);
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
                assert.strictEqual(isValidPromptFolderPath(path), true, `'${path}' must be accepted as a valid skill path (user home path).`);
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
                assert.strictEqual(isValidPromptFolderPath(path), true, `'${path}' must be accepted as a valid skill path (parent relative path).`);
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
                assert.strictEqual(isValidPromptFolderPath(path), false, `'${path}' must be rejected (absolute paths not supported for portability).`);
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
                assert.strictEqual(isValidPromptFolderPath(path), false, `'${path}' must be rejected (tilde must be followed by / only, not \\).`);
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
                assert.strictEqual(isValidPromptFolderPath(path), false, `'${path}' must be rejected (backslash paths not supported for cross-platform sharing).`);
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
                assert.strictEqual(isValidPromptFolderPath(path), false, `'${path}' must be rejected (glob patterns not supported for performance).`);
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
                assert.strictEqual(isValidPromptFolderPath(path), false, `'${path}' must be rejected (empty or whitespace only).`);
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
                assert.strictEqual(isValidPromptFolderPath(path), true, `'${path}' must be accepted (paths with spaces are valid).`);
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
                assert.strictEqual(hasGlobPattern(path), true, `'${path}' must be detected as having a glob pattern.`);
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
                assert.strictEqual(hasGlobPattern(path), true, `'${path}' must be detected as having a glob pattern.`);
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
                assert.strictEqual(hasGlobPattern(path), false, `'${path}' must not be detected as having a glob pattern.`);
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
            assertOutcome(await locator.getConfigBasedSourceFolders(PromptsType.prompt), [
                '/Users/legomushroom/repos/vscode/.github/prompts',
                '/Users/legomushroom/repos/prompts/.github/prompts',
                '/Users/legomushroom/repos/vscode/gen/text/nested',
                '/Users/legomushroom/repos/prompts/gen/text/nested',
                '/Users/legomushroom/repos/vscode/general',
                '/Users/legomushroom/repos/prompts/general',
                '/Users/legomushroom/repos/vscode/my-prompts',
                '/Users/legomushroom/repos/vscode/your-prompts',
                '/Users/legomushroom/repos/prompts/shared-prompts',
            ], 'Must find correct prompts.');
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
            assertOutcome(result, [
                '/Users/legomushroom/repos/workspace/AGENTS.md',
                '/Users/legomushroom/repos/workspace/src/AGENTS.md'
            ], 'Must find all AGENTS.md files using search service.');
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
            assertOutcome(result, [
                '/Users/legomushroom/repos/workspace/AGENTS.md',
                '/Users/legomushroom/repos/workspace/src/AGENTS.md',
                '/Users/legomushroom/repos/workspace/src/nested/AGENTS.md'
            ], 'Must find all AGENTS.md files using file service fallback.');
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
            assertOutcome(result, [], 'Must return empty array when cancelled.');
        });
    });
    suite('getWorkspaceFolderRoots', () => {
        let locator;
        // Override setWorkspaceFolders to also create the locator
        const setWorkspaceFoldersForRoots = (paths) => {
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
            assert.deepStrictEqual(roots.map(r => r.path), ['/repos/my-project'], 'Should only return the workspace folder itself when it has .git');
        });
        testT('walks up to parent with .git when workspace folder has no .git', async () => {
            setWorkspaceFoldersForRoots(['/repos/monorepo/packages/my-app']);
            await mockFiles(fileService, [
                { path: '/repos/monorepo/.git/HEAD', contents: ['ref: refs/heads/main'] },
                { path: '/repos/monorepo/packages/my-app/src/index.ts', contents: ['export {};'] },
            ]);
            workspaceTrustService.setTrustedUris([URI.file('/repos/monorepo')]);
            const roots = await locator.getWorkspaceFolderRoots(true);
            assert.deepStrictEqual(roots.map(r => r.path).sort(), [
                '/repos/monorepo',
                '/repos/monorepo/packages',
                '/repos/monorepo/packages/my-app',
            ].sort(), 'Should include workspace folder and all parents up to the one with .git');
        });
        testT('does not walk up when includeParents is false', async () => {
            setWorkspaceFoldersForRoots(['/repos/monorepo/packages/my-app']);
            await mockFiles(fileService, [
                { path: '/repos/monorepo/.git/HEAD', contents: ['ref: refs/heads/main'] },
                { path: '/repos/monorepo/packages/my-app/src/index.ts', contents: ['export {};'] },
            ]);
            workspaceTrustService.setTrustedUris([URI.file('/repos/monorepo')]);
            const roots = await locator.getWorkspaceFolderRoots(false);
            assert.deepStrictEqual(roots.map(r => r.path), ['/repos/monorepo/packages/my-app'], 'Should only return workspace folders when includeParents is false');
        });
        testT('returns only workspace folder when no .git is found', async () => {
            setWorkspaceFoldersForRoots(['/Users/legomushroom/my-project']);
            await mockFiles(fileService, [
                { path: '/Users/legomushroom/my-project/src/index.ts', contents: ['export {};'] },
            ]);
            const roots = await locator.getWorkspaceFolderRoots(true);
            assert.deepStrictEqual(roots.map(r => r.path), ['/Users/legomushroom/my-project'], 'Should only return the workspace folder when no .git is found in any parent');
        });
    });
});
function assertOutcome(actual, expected, message) {
    assert.deepStrictEqual(actual.map((uri) => uri.path), expected, message);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvbXB0RmlsZXNMb2NhdG9yLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L3Rlc3QvY29tbW9uL3Byb21wdFN5bnRheC91dGlscy9wcm9tcHRGaWxlc0xvY2F0b3IudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLGlCQUFpQixFQUFFLHVCQUF1QixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDOUcsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUN0RSxPQUFPLEVBQUUsUUFBUSxFQUFFLFlBQVksRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDckUsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDekcsT0FBTyxFQUEyQixxQkFBcUIsRUFBRSxNQUFNLHFFQUFxRSxDQUFDO0FBQ3JJLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUNuRixPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDeEYsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0sMEVBQTBFLENBQUM7QUFDdEgsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0scUZBQXFGLENBQUM7QUFDL0gsT0FBTyxFQUFFLFdBQVcsRUFBRSxjQUFjLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUM5RixPQUFPLEVBQWMsd0JBQXdCLEVBQW9CLE1BQU0sNkRBQTZELENBQUM7QUFDckksT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0scUVBQXFFLENBQUM7QUFDbkgsT0FBTyxFQUEwQixjQUFjLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUM1RyxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxzRUFBc0UsQ0FBQztBQUMvRyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDckYsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ2pGLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUM3RSxPQUFPLEVBQUUsY0FBYyxFQUFFLFdBQVcsRUFBRSx1QkFBdUIsRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDZEQUE2RCxDQUFDO0FBQ3ZKLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUMzRCxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sV0FBVyxDQUFDO0FBQ3hDLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxtQ0FBbUMsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQ3pJLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwyREFBMkQsQ0FBQztBQUMzRixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUNsRyxPQUFPLEVBQUUsZ0NBQWdDLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUVwSDs7R0FFRztBQUNILFNBQVMsaUJBQWlCLENBQUMsWUFBcUM7SUFDL0QsT0FBTyxXQUFXLENBQXdCO1FBQ3pDLFFBQVEsQ0FBQyxHQUFzQztZQUM5QywwRUFBMEU7WUFDMUUsSUFBSSxPQUFPLEdBQUcsS0FBSyxRQUFRLEVBQUUsQ0FBQztnQkFDN0IsT0FBTyxFQUFFLENBQUM7WUFDWCxDQUFDO1lBQ0QsSUFBSSxPQUFPLEdBQUcsS0FBSyxRQUFRLEVBQUUsQ0FBQztnQkFDN0IsTUFBTSxDQUFDLElBQUksQ0FBQyxrQ0FBa0MsR0FBRyxJQUFJLENBQUMsQ0FBQztZQUN4RCxDQUFDO1lBQ0QsSUFBSSxZQUFZLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0JBQ3RDLE9BQU8sWUFBWSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQzFCLENBQUM7WUFDRCxNQUFNLENBQUMsSUFBSSxDQUFDLGtDQUFrQyxHQUFHLElBQUksQ0FBQyxDQUFDO1FBQ3hELENBQUM7S0FDRCxDQUFDLENBQUM7QUFDSixDQUFDO0FBRUQ7O0dBRUc7QUFDSCxTQUFTLG9CQUFvQixDQUFDLE9BQTJCO0lBQ3hELE9BQU8sV0FBVyxDQUEyQjtRQUM1QyxZQUFZO1lBQ1gsT0FBTyxJQUFJLEtBQU0sU0FBUSxJQUFJLEVBQWM7Z0JBQWhDOztvQkFDRCxZQUFPLEdBQUcsT0FBTyxDQUFDO2dCQUM1QixDQUFDO2FBQUEsQ0FBQztRQUNILENBQUM7UUFDRCxrQkFBa0I7WUFDakIsT0FBTyxJQUFJLENBQUM7UUFDYixDQUFDO0tBRUQsQ0FBQyxDQUFDO0FBQ0osQ0FBQztBQUVELFNBQVMsS0FBSyxDQUFDLElBQVksRUFBRSxFQUF1QjtJQUNuRCxPQUFPLElBQUksQ0FBQyxJQUFJLEVBQUUsR0FBRyxFQUFFLENBQUMsa0JBQWtCLENBQUMsRUFBRSxhQUFhLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztBQUMxRSxDQUFDO0FBRUQsS0FBSyxDQUFDLG9CQUFvQixFQUFFLEdBQUcsRUFBRTtJQUNoQyxNQUFNLFdBQVcsR0FBRyx1Q0FBdUMsRUFBRSxDQUFDO0lBRTlELElBQUksb0JBQThDLENBQUM7SUFDbkQsSUFBSSxXQUF5QixDQUFDO0lBQzlCLE1BQU0sWUFBWSxHQUE0QixFQUFFLENBQUM7SUFDakQsSUFBSSxxQkFBMEQsQ0FBQztJQUUvRCw4REFBOEQ7SUFDOUQsTUFBTSxZQUFZLEdBQUcsQ0FBQyxLQUFjLEVBQUUsRUFBRTtRQUN2QyxZQUFZLENBQUMsYUFBYSxDQUFDLG9CQUFvQixDQUFDLEdBQUcsS0FBSyxDQUFDO1FBQ3pELFlBQVksQ0FBQyxhQUFhLENBQUMseUJBQXlCLENBQUMsR0FBRyxLQUFLLENBQUM7UUFDOUQsWUFBWSxDQUFDLGFBQWEsQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLEtBQUssQ0FBQztRQUN0RCxZQUFZLENBQUMsYUFBYSxDQUFDLG1CQUFtQixDQUFDLEdBQUcsS0FBSyxDQUFDO0lBQ3pELENBQUMsQ0FBQztJQUVGLDhEQUE4RDtJQUM5RCxNQUFNLG1CQUFtQixHQUFHLENBQUMsS0FBZSxFQUFFLEVBQUU7UUFDL0MsTUFBTSxnQkFBZ0IsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxFQUFFLEtBQUssRUFBRSxFQUFFO1lBQ2xELE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDM0IsT0FBTyxJQUFJLEtBQU0sU0FBUSxJQUFJLEVBQW9CO2dCQUF0Qzs7b0JBQ0QsUUFBRyxHQUFHLEdBQUcsQ0FBQztvQkFDVixTQUFJLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDO29CQUNyQixVQUFLLEdBQUcsS0FBSyxDQUFDO2dCQUN4QixDQUFDO2FBQUEsQ0FBQztRQUNILENBQUMsQ0FBQyxDQUFDO1FBQ0gsb0JBQW9CLENBQUMsSUFBSSxDQUFDLHdCQUF3QixFQUFFLG9CQUFvQixDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQztJQUM3RixDQUFDLENBQUM7SUFFRixLQUFLLENBQUMsS0FBSyxJQUFJLEVBQUU7UUFDaEIsb0JBQW9CLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLHdCQUF3QixFQUFFLENBQUMsQ0FBQztRQUN2RSxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsV0FBVyxFQUFFLElBQUksY0FBYyxFQUFFLENBQUMsQ0FBQztRQUU3RCxXQUFXLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQztRQUNoRixNQUFNLGtCQUFrQixHQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSwwQkFBMEIsRUFBRSxDQUFDLENBQUM7UUFDN0UsV0FBVyxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsZ0JBQWdCLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxrQkFBa0IsQ0FBQyxDQUFDLENBQUM7UUFDaEYsb0JBQW9CLENBQUMsSUFBSSxDQUFDLFlBQVksRUFBRSxXQUFXLENBQUMsQ0FBQztRQUVyRCxxQkFBcUIsR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksbUNBQW1DLEVBQUUsQ0FBQyxDQUFDO1FBQ25GLG9CQUFvQixDQUFDLElBQUksQ0FBQyxnQ0FBZ0MsRUFBRSxxQkFBcUIsQ0FBQyxDQUFDO1FBRW5GLGtDQUFrQztRQUNsQyxLQUFLLE1BQU0sR0FBRyxJQUFJLE1BQU0sQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLEVBQUUsQ0FBQztZQUM3QyxPQUFPLFlBQVksQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUMxQixDQUFDO1FBQ0QsTUFBTSxDQUFDLE1BQU0sQ0FBQyxZQUFZLEVBQUU7WUFDM0IsMkJBQTJCLEVBQUUsS0FBSztZQUNsQyxlQUFlLEVBQUUsRUFBRTtZQUNuQixnQkFBZ0IsRUFBRSxFQUFFO1lBQ3BCLENBQUMsYUFBYSxDQUFDLGtDQUFrQyxDQUFDLEVBQUUsS0FBSztTQUN6RCxDQUFDLENBQUM7UUFDSCxvQkFBb0IsQ0FBQyxJQUFJLENBQUMscUJBQXFCLEVBQUUsaUJBQWlCLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQztRQUVsRixtQkFBbUIsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUV4QixvQkFBb0IsQ0FBQyxJQUFJLENBQUMsNEJBQTRCLEVBQUUsRUFBa0MsQ0FBQyxDQUFDO1FBQzVGLG9CQUFvQixDQUFDLElBQUksQ0FBQyx1QkFBdUIsRUFBRSxJQUFJLDBCQUEwQixFQUFFLENBQUMsQ0FBQztRQUNyRixvQkFBb0IsQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFO1lBQ3pDLDJCQUEyQixDQUFDLE1BQWM7Z0JBQ3pDLE9BQU8sSUFBSSxDQUFDO1lBQ2IsQ0FBQztZQUNELEtBQUssQ0FBQyxVQUFVLENBQUMsS0FBaUI7Z0JBQ2pDLE1BQU0sbUJBQW1CLEdBQUcsS0FBSyxFQUFFLFFBQWEsRUFBRSxVQUFpQixFQUFFLEVBQUUsRUFBRTtvQkFDeEUsSUFBSSxDQUFDO3dCQUNKLE1BQU0sT0FBTyxHQUFHLE1BQU0sV0FBVyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQzt3QkFDcEQsSUFBSSxPQUFPLENBQUMsTUFBTSxFQUFFLENBQUM7NEJBQ3BCLE9BQU8sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDO3dCQUNoQyxDQUFDOzZCQUFNLElBQUksT0FBTyxDQUFDLFdBQVcsSUFBSSxPQUFPLENBQUMsUUFBUSxFQUFFLENBQUM7NEJBQ3BELEtBQUssTUFBTSxLQUFLLElBQUksT0FBTyxDQUFDLFFBQVEsRUFBRSxDQUFDO2dDQUN0QyxNQUFNLG1CQUFtQixDQUFDLEtBQUssQ0FBQyxRQUFRLEVBQUUsT0FBTyxDQUFDLENBQUM7NEJBQ3BELENBQUM7d0JBQ0YsQ0FBQztvQkFDRixDQUFDO29CQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7b0JBQ2pCLENBQUM7b0JBQ0QsT0FBTyxPQUFPLENBQUM7Z0JBQ2hCLENBQUMsQ0FBQztnQkFDRixNQUFNLE9BQU8sR0FBaUIsRUFBRSxDQUFDO2dCQUNqQyxLQUFLLE1BQU0sV0FBVyxJQUFJLEtBQUssQ0FBQyxhQUFhLEVBQUUsQ0FBQztvQkFDL0MsTUFBTSxRQUFRLEdBQUcsTUFBTSxtQkFBbUIsQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLENBQUM7b0JBQy9ELEtBQUssTUFBTSxRQUFRLElBQUksUUFBUSxFQUFFLENBQUM7d0JBQ2pDLE1BQU0sWUFBWSxHQUFHLFlBQVksQ0FBQyxXQUFXLENBQUMsTUFBTSxFQUFFLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQzt3QkFDdEUsSUFBSSxLQUFLLENBQUMsV0FBVyxLQUFLLFNBQVMsSUFBSSxLQUFLLENBQUMsS0FBSyxDQUFDLFdBQVcsRUFBRSxZQUFZLENBQUMsRUFBRSxDQUFDOzRCQUMvRSxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUUsUUFBUSxFQUFFLENBQUMsQ0FBQzt3QkFDNUIsQ0FBQztvQkFDRixDQUFDO2dCQUNGLENBQUM7Z0JBQ0QsT0FBTyxFQUFFLE9BQU8sRUFBRSxRQUFRLEVBQUUsRUFBRSxFQUFFLENBQUM7WUFDbEMsQ0FBQztTQUNELENBQUMsQ0FBQztRQUNILG9CQUFvQixDQUFDLElBQUksQ0FBQyxZQUFZLEVBQUU7WUFDdkMsUUFBUSxDQUFDLE9BQWtDO2dCQUMxQyxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLHFCQUFxQixDQUFDLENBQUM7Z0JBQzVDLElBQUksT0FBTyxFQUFFLFdBQVcsRUFBRSxDQUFDO29CQUMxQixPQUFPLEdBQUcsQ0FBQztnQkFDWixDQUFDO2dCQUNELE9BQU8sT0FBTyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUM3QixDQUFDO1NBQ2UsQ0FBQyxDQUFDO0lBQ3BCLENBQUMsQ0FBQyxDQUFDO0lBRUgsS0FBSyxDQUFDLGlCQUFpQixFQUFFLEdBQUcsRUFBRTtRQUM3QixNQUFNLGVBQWUsR0FBYSxFQUFFLENBQUM7UUFFckMsS0FBSyxDQUFDLGtCQUFrQixFQUFFLEdBQUcsRUFBRTtZQUM5QixLQUFLLENBQUMsaUJBQWlCLEVBQUUsS0FBSyxJQUFJLEVBQUU7Z0JBQ25DLFlBQVksQ0FBQyxTQUFTLENBQUMsQ0FBQztnQkFDeEIsbUJBQW1CLENBQUMsZUFBZSxDQUFDLENBQUM7Z0JBQ3JDLE1BQU0sU0FBUyxDQUFDLFdBQVcsRUFBRSxFQUFFLENBQUMsQ0FBQztnQkFDakMsTUFBTSxPQUFPLEdBQUcsb0JBQW9CLENBQUMsY0FBYyxDQUFDLGtCQUFrQixDQUFDLENBQUM7Z0JBRXhFLGFBQWEsQ0FDWixNQUFNLE9BQU8sQ0FBQyxTQUFTLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxjQUFjLENBQUMsS0FBSyxFQUFFLGlCQUFpQixDQUFDLElBQUksQ0FBQyxFQUN6RixFQUFFLEVBQ0YsMkJBQTJCLENBQzNCLENBQUM7WUFDSCxDQUFDLENBQUMsQ0FBQztZQUVILEtBQUssQ0FBQyxxQkFBcUIsRUFBRSxLQUFLLElBQUksRUFBRTtnQkFDdkMsWUFBWSxDQUFDO29CQUNaLG9DQUFvQyxFQUFFLElBQUk7b0JBQzFDLGVBQWUsRUFBRSxLQUFLO2lCQUN0QixDQUFDLENBQUM7Z0JBQ0gsbUJBQW1CLENBQUMsZUFBZSxDQUFDLENBQUM7Z0JBQ3JDLE1BQU0sU0FBUyxDQUFDLFdBQVcsRUFBRSxFQUFFLENBQUMsQ0FBQztnQkFDakMsTUFBTSxPQUFPLEdBQUcsb0JBQW9CLENBQUMsY0FBYyxDQUFDLGtCQUFrQixDQUFDLENBQUM7Z0JBRXhFLGFBQWEsQ0FDWixNQUFNLE9BQU8sQ0FBQyxTQUFTLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxjQUFjLENBQUMsS0FBSyxFQUFFLGlCQUFpQixDQUFDLElBQUksQ0FBQyxFQUN6RixFQUFFLEVBQ0YsMkJBQTJCLENBQzNCLENBQUM7WUFDSCxDQUFDLENBQUMsQ0FBQztZQUVILEtBQUssQ0FBQyxvQkFBb0IsRUFBRSxLQUFLLElBQUksRUFBRTtnQkFDdEMsWUFBWSxDQUFDO29CQUNaLDJCQUEyQjtvQkFDM0IsV0FBVztpQkFDWCxDQUFDLENBQUM7Z0JBQ0gsbUJBQW1CLENBQUMsZUFBZSxDQUFDLENBQUM7Z0JBQ3JDLE1BQU0sU0FBUyxDQUFDLFdBQVcsRUFBRSxFQUFFLENBQUMsQ0FBQztnQkFDakMsTUFBTSxPQUFPLEdBQUcsb0JBQW9CLENBQUMsY0FBYyxDQUFDLGtCQUFrQixDQUFDLENBQUM7Z0JBRXhFLGFBQWEsQ0FDWixNQUFNLE9BQU8sQ0FBQyxTQUFTLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxjQUFjLENBQUMsS0FBSyxFQUFFLGlCQUFpQixDQUFDLElBQUksQ0FBQyxFQUN6RixFQUFFLEVBQ0YsMkJBQTJCLENBQzNCLENBQUM7WUFDSCxDQUFDLENBQUMsQ0FBQztZQUVILEtBQUssQ0FBQyxtQkFBbUIsRUFBRSxLQUFLLElBQUksRUFBRTtnQkFDckMsWUFBWSxDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUNuQixtQkFBbUIsQ0FBQyxlQUFlLENBQUMsQ0FBQztnQkFDckMsTUFBTSxTQUFTLENBQUMsV0FBVyxFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUNqQyxNQUFNLE9BQU8sR0FBRyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsa0JBQWtCLENBQUMsQ0FBQztnQkFFeEUsYUFBYSxDQUNaLE1BQU0sT0FBTyxDQUFDLFNBQVMsQ0FBQyxXQUFXLENBQUMsTUFBTSxFQUFFLGNBQWMsQ0FBQyxLQUFLLEVBQUUsaUJBQWlCLENBQUMsSUFBSSxDQUFDLEVBQ3pGLEVBQUUsRUFDRiwyQkFBMkIsQ0FDM0IsQ0FBQztZQUNILENBQUMsQ0FBQyxDQUFDO1lBRUgsS0FBSyxDQUFDLHFCQUFxQixFQUFFLEtBQUssSUFBSSxFQUFFO2dCQUN2QyxZQUFZLENBQUMsb0JBQW9CLENBQUMsQ0FBQztnQkFDbkMsbUJBQW1CLENBQUMsZUFBZSxDQUFDLENBQUM7Z0JBQ3JDLE1BQU0sU0FBUyxDQUFDLFdBQVcsRUFBRSxFQUFFLENBQUMsQ0FBQztnQkFDakMsTUFBTSxPQUFPLEdBQUcsb0JBQW9CLENBQUMsY0FBYyxDQUFDLGtCQUFrQixDQUFDLENBQUM7Z0JBRXhFLGFBQWEsQ0FDWixNQUFNLE9BQU8sQ0FBQyxTQUFTLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxjQUFjLENBQUMsS0FBSyxFQUFFLGlCQUFpQixDQUFDLElBQUksQ0FBQyxFQUN6RixFQUFFLEVBQ0YsMkJBQTJCLENBQzNCLENBQUM7WUFDSCxDQUFDLENBQUMsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDO1FBRUgsS0FBSyxDQUFDLHNCQUFzQixFQUFFLEdBQUcsRUFBRTtZQUNsQyxLQUFLLENBQUMsWUFBWSxFQUFFLEtBQUssSUFBSSxFQUFFO2dCQUM5QixZQUFZLENBQUM7b0JBQ1osbUNBQW1DLEVBQUUsSUFBSTtvQkFDekMsZUFBZSxFQUFFLElBQUk7b0JBQ3JCLHdCQUF3QixFQUFFLEtBQUs7b0JBQy9CLGtCQUFrQixFQUFFLElBQUk7aUJBQ3hCLENBQUMsQ0FBQztnQkFDSCxtQkFBbUIsQ0FBQyxlQUFlLENBQUMsQ0FBQztnQkFDckMsTUFBTSxTQUFTLENBQUMsV0FBVyxFQUFFO29CQUM1Qjt3QkFDQyxJQUFJLEVBQUUsa0RBQWtEO3dCQUN4RCxRQUFRLEVBQUUsQ0FBQyxlQUFlLENBQUM7cUJBQzNCO29CQUNEO3dCQUNDLElBQUksRUFBRSw0REFBNEQ7d0JBQ2xFLFFBQVEsRUFBRSxDQUFDLDZCQUE2QixDQUFDO3FCQUN6QztvQkFDRDt3QkFDQyxJQUFJLEVBQUUsMENBQTBDO3dCQUNoRCxRQUFRLEVBQUUsQ0FBQyxnQ0FBZ0MsQ0FBQztxQkFDNUM7b0JBQ0Q7d0JBQ0MsSUFBSSxFQUFFLG1EQUFtRDt3QkFDekQsUUFBUSxFQUFFLENBQUMsYUFBYSxDQUFDO3FCQUN6QjtpQkFDRCxDQUFDLENBQUM7Z0JBQ0gsTUFBTSxPQUFPLEdBQUcsb0JBQW9CLENBQUMsY0FBYyxDQUFDLGtCQUFrQixDQUFDLENBQUM7Z0JBRXhFLGFBQWEsQ0FDWixNQUFNLE9BQU8sQ0FBQyxTQUFTLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxjQUFjLENBQUMsS0FBSyxFQUFFLGlCQUFpQixDQUFDLElBQUksQ0FBQyxFQUN6RjtvQkFDQyxrREFBa0Q7b0JBQ2xELDREQUE0RDtvQkFDNUQsMENBQTBDO2lCQUMxQyxFQUNELDRCQUE0QixDQUM1QixDQUFDO1lBQ0gsQ0FBQyxDQUFDLENBQUM7WUFFSCxLQUFLLENBQUMsVUFBVSxFQUFFLEdBQUcsRUFBRTtnQkFDdEIsS0FBSyxDQUFDLFdBQVcsRUFBRSxLQUFLLElBQUksRUFBRTtvQkFDN0IsTUFBTSxRQUFRLEdBQUc7d0JBQ2hCLHFDQUFxQzt3QkFDckMsaURBQWlEO3dCQUNqRCwwQ0FBMEM7d0JBQzFDLHVDQUF1Qzt3QkFDdkMsMENBQTBDO3dCQUMxQyxzREFBc0Q7d0JBQ3RELDRDQUE0Qzt3QkFDNUMsK0NBQStDO3dCQUMvQyw2Q0FBNkM7d0JBQzdDLCtDQUErQzt3QkFDL0Msa0RBQWtEO3dCQUNsRCx5REFBeUQ7d0JBQ3pELCtDQUErQzt3QkFDL0MsaURBQWlEO3dCQUNqRCxvREFBb0Q7d0JBQ3BELDJEQUEyRDtxQkFDM0QsQ0FBQztvQkFFRixLQUFLLE1BQU0sT0FBTyxJQUFJLFFBQVEsRUFBRSxDQUFDO3dCQUNoQyxZQUFZLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7d0JBQ2xDLG1CQUFtQixDQUFDLGVBQWUsQ0FBQyxDQUFDO3dCQUNyQyxNQUFNLFNBQVMsQ0FBQyxXQUFXLEVBQUU7NEJBQzVCO2dDQUNDLElBQUksRUFBRSx5REFBeUQ7Z0NBQy9ELFFBQVEsRUFBRSxDQUFDLGFBQWEsQ0FBQzs2QkFDekI7NEJBQ0Q7Z0NBQ0MsSUFBSSxFQUFFLHNFQUFzRTtnQ0FDNUUsUUFBUSxFQUFFLENBQUMsYUFBYSxDQUFDOzZCQUN6Qjs0QkFDRDtnQ0FDQyxJQUFJLEVBQUUseUVBQXlFO2dDQUMvRSxRQUFRLEVBQUUsQ0FBQyxlQUFlLENBQUM7NkJBQzNCOzRCQUNEO2dDQUNDLElBQUksRUFBRSx5RUFBeUU7Z0NBQy9FLFFBQVEsRUFBRSxDQUFDLGVBQWUsQ0FBQzs2QkFDM0I7NEJBQ0Q7Z0NBQ0MsSUFBSSxFQUFFLDZEQUE2RDtnQ0FDbkUsUUFBUSxFQUFFLENBQUMsaUJBQWlCLENBQUM7NkJBQzdCO3lCQUNELENBQUMsQ0FBQzt3QkFDSCxNQUFNLE9BQU8sR0FBRyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsa0JBQWtCLENBQUMsQ0FBQzt3QkFFeEUsYUFBYSxDQUNaLE1BQU0sT0FBTyxDQUFDLFNBQVMsQ0FBQyxXQUFXLENBQUMsTUFBTSxFQUFFLGNBQWMsQ0FBQyxLQUFLLEVBQUUsaUJBQWlCLENBQUMsSUFBSSxDQUFDLEVBQ3pGOzRCQUNDLHlEQUF5RDs0QkFDekQsc0VBQXNFOzRCQUN0RSx5RUFBeUU7NEJBQ3pFLHlFQUF5RTt5QkFDekUsRUFDRCw0QkFBNEIsQ0FDNUIsQ0FBQztvQkFDSCxDQUFDO2dCQUNGLENBQUMsQ0FBQyxDQUFDO2dCQUVILEtBQUssQ0FBQyxVQUFVLEVBQUUsS0FBSyxJQUFJLEVBQUU7b0JBQzVCLE1BQU0sWUFBWSxHQUFHO3dCQUNwQjs0QkFDQyxnREFBZ0Q7eUJBQ2hEO3dCQUNEOzRCQUNDLDBEQUEwRDt5QkFDMUQ7d0JBQ0Q7NEJBQ0MsbURBQW1EO3lCQUNuRDt3QkFDRDs0QkFDQywrQ0FBK0M7NEJBQy9DLDJEQUEyRDs0QkFDM0QsMkRBQTJEO3lCQUMzRDt3QkFDRDs0QkFDQyx3REFBd0Q7NEJBQ3hELDJEQUEyRDt5QkFDM0Q7d0JBQ0Q7NEJBQ0MsK0RBQStEOzRCQUMvRCxrRUFBa0U7eUJBQ2xFO3dCQUNEOzRCQUNDLHVEQUF1RDt5QkFDdkQ7d0JBQ0Q7NEJBQ0Msc0RBQXNEO3lCQUN0RDt3QkFDRDs0QkFDQyw0Q0FBNEM7eUJBQzVDO3dCQUNEOzRCQUNDLCtDQUErQzt5QkFDL0M7d0JBQ0Q7NEJBQ0MsdURBQXVEO3lCQUN2RDt3QkFDRDs0QkFDQyx1REFBdUQ7eUJBQ3ZEO3dCQUNEOzRCQUNDLDBEQUEwRDt5QkFDMUQ7d0JBQ0Q7NEJBQ0MsOERBQThEO3lCQUM5RDt3QkFDRDs0QkFDQyxxREFBcUQ7eUJBQ3JEO3dCQUNEOzRCQUNDLG9EQUFvRDs0QkFDcEQsZ0VBQWdFO3lCQUNoRTt3QkFDRDs0QkFDQyx1REFBdUQ7NEJBQ3ZELHlEQUF5RDt5QkFDekQ7d0JBQ0Q7NEJBQ0MsNkRBQTZEOzRCQUM3RCxnRUFBZ0U7NEJBQ2hFLGdFQUFnRTt5QkFDaEU7d0JBQ0Q7NEJBQ0MsNkRBQTZEOzRCQUM3RCwwREFBMEQ7NEJBQzFELDBEQUEwRDt5QkFDMUQ7d0JBQ0Q7NEJBQ0MsMERBQTBEO3lCQUMxRDt3QkFDRDs0QkFDQyx5REFBeUQ7NEJBQ3pELHFFQUFxRTt5QkFDckU7d0JBQ0Q7NEJBQ0MsNERBQTREOzRCQUM1RCw4REFBOEQ7eUJBQzlEO3dCQUNEOzRCQUNDLGtFQUFrRTs0QkFDbEUscUVBQXFFOzRCQUNyRSxxRUFBcUU7eUJBQ3JFO3dCQUNEOzRCQUNDLGtFQUFrRTs0QkFDbEUsK0RBQStEOzRCQUMvRCwrREFBK0Q7eUJBQy9EO3FCQUNELENBQUM7b0JBRUYsS0FBSyxNQUFNLFFBQVEsSUFBSSxZQUFZLEVBQUUsQ0FBQzt3QkFDckMsTUFBTSxjQUFjLEdBQTRCLEVBQUUsQ0FBQzt3QkFDbkQsS0FBSyxNQUFNLE9BQU8sSUFBSSxRQUFRLEVBQUUsQ0FBQzs0QkFDaEMsY0FBYyxDQUFDLE9BQU8sQ0FBQyxHQUFHLElBQUksQ0FBQzt3QkFDaEMsQ0FBQzt3QkFFRCxZQUFZLENBQUMsY0FBYyxDQUFDLENBQUM7d0JBQzdCLG1CQUFtQixDQUFDLGVBQWUsQ0FBQyxDQUFDO3dCQUNyQyxNQUFNLFNBQVMsQ0FBQyxXQUFXLEVBQUU7NEJBQzVCO2dDQUNDLElBQUksRUFBRSx5REFBeUQ7Z0NBQy9ELFFBQVEsRUFBRSxDQUFDLGFBQWEsQ0FBQzs2QkFDekI7NEJBQ0Q7Z0NBQ0MsSUFBSSxFQUFFLHFFQUFxRTtnQ0FDM0UsUUFBUSxFQUFFLENBQUMsYUFBYSxDQUFDOzZCQUN6Qjs0QkFDRDtnQ0FDQyxJQUFJLEVBQUUsc0VBQXNFO2dDQUM1RSxRQUFRLEVBQUUsQ0FBQyxhQUFhLENBQUM7NkJBQ3pCOzRCQUNEO2dDQUNDLElBQUksRUFBRSx5RUFBeUU7Z0NBQy9FLFFBQVEsRUFBRSxDQUFDLGVBQWUsQ0FBQzs2QkFDM0I7NEJBQ0Q7Z0NBQ0MsSUFBSSxFQUFFLHlFQUF5RTtnQ0FDL0UsUUFBUSxFQUFFLENBQUMsZ0JBQWdCLENBQUM7NkJBQzVCOzRCQUNEO2dDQUNDLElBQUksRUFBRSw2REFBNkQ7Z0NBQ25FLFFBQVEsRUFBRSxDQUFDLGlCQUFpQixDQUFDOzZCQUM3Qjt5QkFDRCxDQUFDLENBQUM7d0JBQ0gsTUFBTSxPQUFPLEdBQUcsb0JBQW9CLENBQUMsY0FBYyxDQUFDLGtCQUFrQixDQUFDLENBQUM7d0JBRXhFLGFBQWEsQ0FDWixNQUFNLE9BQU8sQ0FBQyxTQUFTLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxjQUFjLENBQUMsS0FBSyxFQUFFLGlCQUFpQixDQUFDLElBQUksQ0FBQyxFQUN6Rjs0QkFDQyxzRUFBc0U7NEJBQ3RFLHlFQUF5RTs0QkFDekUseUVBQXlFO3lCQUN6RSxFQUNELDRCQUE0QixDQUM1QixDQUFDO29CQUNILENBQUM7Z0JBQ0YsQ0FBQyxDQUFDLENBQUM7WUFDSixDQUFDLENBQUMsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxLQUFLLENBQUMsdUJBQXVCLEVBQUUsR0FBRyxFQUFFO1FBQ25DLEtBQUssQ0FBQyxjQUFjLEVBQUUsR0FBRyxFQUFFO1lBQzFCLEtBQUssQ0FBQyxVQUFVLEVBQUUsR0FBRyxFQUFFO2dCQUN0QixLQUFLLENBQUMsV0FBVyxFQUFFLEtBQUssSUFBSSxFQUFFO29CQUM3QixNQUFNLFlBQVksR0FBRzt3QkFDcEIsSUFBSTt3QkFDSixnQkFBZ0I7d0JBQ2hCLFNBQVM7d0JBQ1QsTUFBTTt3QkFDTixTQUFTO3dCQUNULHFCQUFxQjt3QkFDckIsV0FBVzt3QkFDWCxjQUFjO3dCQUNkLFlBQVk7d0JBQ1osY0FBYzt3QkFDZCxpQkFBaUI7d0JBQ2pCLHdCQUF3Qjt3QkFDeEIsY0FBYzt3QkFDZCxnQkFBZ0I7d0JBQ2hCLG1CQUFtQjt3QkFDbkIsMEJBQTBCO3FCQUMxQixDQUFDO29CQUVGLEtBQUssTUFBTSxPQUFPLElBQUksWUFBWSxFQUFFLENBQUM7d0JBQ3BDLFlBQVksQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFDLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQzt3QkFDbEMsbUJBQW1CLENBQUMsQ0FBQyxrQ0FBa0MsQ0FBQyxDQUFDLENBQUM7d0JBQzFELE1BQU0sU0FBUyxDQUFDLFdBQVcsRUFBRTs0QkFDNUI7Z0NBQ0MsSUFBSSxFQUFFLHlEQUF5RDtnQ0FDL0QsUUFBUSxFQUFFLENBQUMsYUFBYSxDQUFDOzZCQUN6Qjs0QkFDRDtnQ0FDQyxJQUFJLEVBQUUsc0VBQXNFO2dDQUM1RSxRQUFRLEVBQUUsQ0FBQyxhQUFhLENBQUM7NkJBQ3pCOzRCQUNEO2dDQUNDLElBQUksRUFBRSx5RUFBeUU7Z0NBQy9FLFFBQVEsRUFBRSxDQUFDLGVBQWUsQ0FBQzs2QkFDM0I7NEJBQ0Q7Z0NBQ0MsSUFBSSxFQUFFLHlFQUF5RTtnQ0FDL0UsUUFBUSxFQUFFLENBQUMsZUFBZSxDQUFDOzZCQUMzQjs0QkFDRDtnQ0FDQyxJQUFJLEVBQUUsNkRBQTZEO2dDQUNuRSxRQUFRLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQzs2QkFDN0I7eUJBQ0QsQ0FBQyxDQUFDO3dCQUNILE1BQU0sT0FBTyxHQUFHLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO3dCQUV4RSxhQUFhLENBQ1osTUFBTSxPQUFPLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQyxNQUFNLEVBQUUsY0FBYyxDQUFDLEtBQUssRUFBRSxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsRUFDekY7NEJBQ0MseURBQXlEOzRCQUN6RCxzRUFBc0U7NEJBQ3RFLHlFQUF5RTs0QkFDekUseUVBQXlFO3lCQUN6RSxFQUNELDRCQUE0QixDQUM1QixDQUFDO29CQUVILENBQUM7Z0JBQ0YsQ0FBQyxDQUFDLENBQUM7Z0JBRUgsS0FBSyxDQUFDLFVBQVUsRUFBRSxLQUFLLElBQUksRUFBRTtvQkFDNUIsTUFBTSxZQUFZLEdBQUc7d0JBQ3BCOzRCQUNDLGVBQWU7eUJBQ2Y7d0JBQ0Q7NEJBQ0MseUJBQXlCO3lCQUN6Qjt3QkFDRDs0QkFDQyxrQkFBa0I7eUJBQ2xCO3dCQUNEOzRCQUNDLGNBQWM7NEJBQ2QsMEJBQTBCOzRCQUMxQiwwQkFBMEI7eUJBQzFCO3dCQUNEOzRCQUNDLHVCQUF1Qjs0QkFDdkIsMEJBQTBCO3lCQUMxQjt3QkFDRDs0QkFDQyw4QkFBOEI7NEJBQzlCLGlDQUFpQzt5QkFDakM7d0JBQ0Q7NEJBQ0Msc0JBQXNCO3lCQUN0Qjt3QkFDRDs0QkFDQyxxQkFBcUI7eUJBQ3JCO3dCQUNEOzRCQUNDLFdBQVc7eUJBQ1g7d0JBQ0Q7NEJBQ0MsY0FBYzt5QkFDZDt3QkFDRDs0QkFDQyxzQkFBc0I7eUJBQ3RCO3dCQUNEOzRCQUNDLHNCQUFzQjt5QkFDdEI7d0JBQ0Q7NEJBQ0MseUJBQXlCO3lCQUN6Qjt3QkFDRDs0QkFDQyw2QkFBNkI7eUJBQzdCO3dCQUNEOzRCQUNDLG9CQUFvQjt5QkFDcEI7d0JBQ0Q7NEJBQ0MsbUJBQW1COzRCQUNuQiwrQkFBK0I7eUJBQy9CO3dCQUNEOzRCQUNDLHNCQUFzQjs0QkFDdEIsd0JBQXdCO3lCQUN4Qjt3QkFDRDs0QkFDQyw0QkFBNEI7NEJBQzVCLCtCQUErQjs0QkFDL0IsK0JBQStCO3lCQUMvQjt3QkFDRDs0QkFDQyw0QkFBNEI7NEJBQzVCLHlCQUF5Qjs0QkFDekIseUJBQXlCO3lCQUN6Qjt3QkFDRDs0QkFDQyx5QkFBeUI7eUJBQ3pCO3dCQUNEOzRCQUNDLHdCQUF3Qjs0QkFDeEIsb0NBQW9DO3lCQUNwQzt3QkFDRDs0QkFDQywyQkFBMkI7NEJBQzNCLDZCQUE2Qjt5QkFDN0I7d0JBQ0Q7NEJBQ0MsaUNBQWlDOzRCQUNqQyxvQ0FBb0M7NEJBQ3BDLG9DQUFvQzt5QkFDcEM7d0JBQ0Q7NEJBQ0MsaUNBQWlDOzRCQUNqQyw4QkFBOEI7NEJBQzlCLDhCQUE4Qjt5QkFDOUI7cUJBQ0QsQ0FBQztvQkFFRixLQUFLLE1BQU0sUUFBUSxJQUFJLFlBQVksRUFBRSxDQUFDO3dCQUNyQyxNQUFNLGNBQWMsR0FBNEIsRUFBRSxDQUFDO3dCQUNuRCxLQUFLLE1BQU0sT0FBTyxJQUFJLFFBQVEsRUFBRSxDQUFDOzRCQUNoQyxjQUFjLENBQUMsT0FBTyxDQUFDLEdBQUcsSUFBSSxDQUFDO3dCQUNoQyxDQUFDO3dCQUVELFlBQVksQ0FBQyxjQUFjLENBQUMsQ0FBQzt3QkFDN0IsbUJBQW1CLENBQUMsQ0FBQyxrQ0FBa0MsQ0FBQyxDQUFDLENBQUM7d0JBQzFELE1BQU0sU0FBUyxDQUFDLFdBQVcsRUFBRTs0QkFDNUI7Z0NBQ0MsSUFBSSxFQUFFLHlEQUF5RDtnQ0FDL0QsUUFBUSxFQUFFLENBQUMsYUFBYSxDQUFDOzZCQUN6Qjs0QkFDRDtnQ0FDQyxJQUFJLEVBQUUscUVBQXFFO2dDQUMzRSxRQUFRLEVBQUUsQ0FBQyxhQUFhLENBQUM7NkJBQ3pCOzRCQUNEO2dDQUNDLElBQUksRUFBRSxzRUFBc0U7Z0NBQzVFLFFBQVEsRUFBRSxDQUFDLGFBQWEsQ0FBQzs2QkFDekI7NEJBQ0Q7Z0NBQ0MsSUFBSSxFQUFFLHlFQUF5RTtnQ0FDL0UsUUFBUSxFQUFFLENBQUMsZUFBZSxDQUFDOzZCQUMzQjs0QkFDRDtnQ0FDQyxJQUFJLEVBQUUseUVBQXlFO2dDQUMvRSxRQUFRLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQzs2QkFDNUI7NEJBQ0Q7Z0NBQ0MsSUFBSSxFQUFFLDZEQUE2RDtnQ0FDbkUsUUFBUSxFQUFFLENBQUMsaUJBQWlCLENBQUM7NkJBQzdCO3lCQUNELENBQUMsQ0FBQzt3QkFDSCxNQUFNLE9BQU8sR0FBRyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsa0JBQWtCLENBQUMsQ0FBQzt3QkFFeEUsYUFBYSxDQUNaLE1BQU0sT0FBTyxDQUFDLFNBQVMsQ0FBQyxXQUFXLENBQUMsTUFBTSxFQUFFLGNBQWMsQ0FBQyxLQUFLLEVBQUUsaUJBQWlCLENBQUMsSUFBSSxDQUFDLEVBQ3pGOzRCQUNDLHNFQUFzRTs0QkFDdEUseUVBQXlFOzRCQUN6RSx5RUFBeUU7eUJBQ3pFLEVBQ0QsNEJBQTRCLENBQzVCLENBQUM7b0JBQ0gsQ0FBQztnQkFDRixDQUFDLENBQUMsQ0FBQztZQUNKLENBQUMsQ0FBQyxDQUFDO1lBRUgsS0FBSyxDQUFDLFVBQVUsRUFBRSxHQUFHLEVBQUU7Z0JBQ3RCLEtBQUssQ0FBQyxXQUFXLEVBQUUsS0FBSyxJQUFJLEVBQUU7b0JBQzdCLE1BQU0sUUFBUSxHQUFHO3dCQUNoQixxQ0FBcUM7d0JBQ3JDLGlEQUFpRDt3QkFDakQsMENBQTBDO3dCQUMxQyx1Q0FBdUM7d0JBQ3ZDLDBDQUEwQzt3QkFDMUMsc0RBQXNEO3dCQUN0RCw0Q0FBNEM7d0JBQzVDLCtDQUErQzt3QkFDL0MsNkNBQTZDO3dCQUM3QywrQ0FBK0M7d0JBQy9DLGtEQUFrRDt3QkFDbEQseURBQXlEO3dCQUN6RCwrQ0FBK0M7d0JBQy9DLGlEQUFpRDt3QkFDakQsb0RBQW9EO3dCQUNwRCwyREFBMkQ7cUJBQzNELENBQUM7b0JBRUYsS0FBSyxNQUFNLE9BQU8sSUFBSSxRQUFRLEVBQUUsQ0FBQzt3QkFFaEMsWUFBWSxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO3dCQUNsQyxtQkFBbUIsQ0FBQyxDQUFDLGtDQUFrQyxDQUFDLENBQUMsQ0FBQzt3QkFDMUQsTUFBTSxTQUFTLENBQUMsV0FBVyxFQUFFOzRCQUM1QjtnQ0FDQyxJQUFJLEVBQUUseURBQXlEO2dDQUMvRCxRQUFRLEVBQUUsQ0FBQyxhQUFhLENBQUM7NkJBQ3pCOzRCQUNEO2dDQUNDLElBQUksRUFBRSxzRUFBc0U7Z0NBQzVFLFFBQVEsRUFBRSxDQUFDLGFBQWEsQ0FBQzs2QkFDekI7NEJBQ0Q7Z0NBQ0MsSUFBSSxFQUFFLHlFQUF5RTtnQ0FDL0UsUUFBUSxFQUFFLENBQUMsZUFBZSxDQUFDOzZCQUMzQjs0QkFDRDtnQ0FDQyxJQUFJLEVBQUUseUVBQXlFO2dDQUMvRSxRQUFRLEVBQUUsQ0FBQyxlQUFlLENBQUM7NkJBQzNCOzRCQUNEO2dDQUNDLElBQUksRUFBRSw2REFBNkQ7Z0NBQ25FLFFBQVEsRUFBRSxDQUFDLGlCQUFpQixDQUFDOzZCQUM3Qjt5QkFDRCxDQUFDLENBQUM7d0JBQ0gsTUFBTSxPQUFPLEdBQUcsb0JBQW9CLENBQUMsY0FBYyxDQUFDLGtCQUFrQixDQUFDLENBQUM7d0JBRXhFLGFBQWEsQ0FDWixNQUFNLE9BQU8sQ0FBQyxTQUFTLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxjQUFjLENBQUMsS0FBSyxFQUFFLGlCQUFpQixDQUFDLElBQUksQ0FBQyxFQUN6Rjs0QkFDQyx5REFBeUQ7NEJBQ3pELHNFQUFzRTs0QkFDdEUseUVBQXlFOzRCQUN6RSx5RUFBeUU7eUJBQ3pFLEVBQ0QsNEJBQTRCLENBQzVCLENBQUM7b0JBRUgsQ0FBQztnQkFDRixDQUFDLENBQUMsQ0FBQztnQkFFSCxLQUFLLENBQUMsVUFBVSxFQUFFLEtBQUssSUFBSSxFQUFFO29CQUM1QixNQUFNLFlBQVksR0FBRzt3QkFDcEI7NEJBQ0MsZ0RBQWdEO3lCQUNoRDt3QkFDRDs0QkFDQywwREFBMEQ7eUJBQzFEO3dCQUNEOzRCQUNDLG1EQUFtRDt5QkFDbkQ7d0JBQ0Q7NEJBQ0MsK0NBQStDOzRCQUMvQywyREFBMkQ7NEJBQzNELDJEQUEyRDt5QkFDM0Q7d0JBQ0Q7NEJBQ0Msd0RBQXdEOzRCQUN4RCwyREFBMkQ7eUJBQzNEO3dCQUNEOzRCQUNDLCtEQUErRDs0QkFDL0Qsa0VBQWtFO3lCQUNsRTt3QkFDRDs0QkFDQyx1REFBdUQ7eUJBQ3ZEO3dCQUNEOzRCQUNDLHNEQUFzRDt5QkFDdEQ7d0JBQ0Q7NEJBQ0MsNENBQTRDO3lCQUM1Qzt3QkFDRDs0QkFDQywrQ0FBK0M7eUJBQy9DO3dCQUNEOzRCQUNDLHVEQUF1RDt5QkFDdkQ7d0JBQ0Q7NEJBQ0MsdURBQXVEO3lCQUN2RDt3QkFDRDs0QkFDQywwREFBMEQ7eUJBQzFEO3dCQUNEOzRCQUNDLDhEQUE4RDt5QkFDOUQ7d0JBQ0Q7NEJBQ0MscURBQXFEO3lCQUNyRDt3QkFDRDs0QkFDQyxvREFBb0Q7NEJBQ3BELGdFQUFnRTt5QkFDaEU7d0JBQ0Q7NEJBQ0MsdURBQXVEOzRCQUN2RCx5REFBeUQ7eUJBQ3pEO3dCQUNEOzRCQUNDLDZEQUE2RDs0QkFDN0QsZ0VBQWdFOzRCQUNoRSxnRUFBZ0U7eUJBQ2hFO3dCQUNEOzRCQUNDLDZEQUE2RDs0QkFDN0QsMERBQTBEOzRCQUMxRCwwREFBMEQ7eUJBQzFEO3dCQUNEOzRCQUNDLDBEQUEwRDt5QkFDMUQ7d0JBQ0Q7NEJBQ0MseURBQXlEOzRCQUN6RCxxRUFBcUU7eUJBQ3JFO3dCQUNEOzRCQUNDLDREQUE0RDs0QkFDNUQsOERBQThEO3lCQUM5RDt3QkFDRDs0QkFDQyxrRUFBa0U7NEJBQ2xFLHFFQUFxRTs0QkFDckUscUVBQXFFO3lCQUNyRTt3QkFDRDs0QkFDQyxrRUFBa0U7NEJBQ2xFLCtEQUErRDs0QkFDL0QsK0RBQStEO3lCQUMvRDtxQkFDRCxDQUFDO29CQUVGLEtBQUssTUFBTSxRQUFRLElBQUksWUFBWSxFQUFFLENBQUM7d0JBQ3JDLE1BQU0sY0FBYyxHQUE0QixFQUFFLENBQUM7d0JBQ25ELEtBQUssTUFBTSxPQUFPLElBQUksUUFBUSxFQUFFLENBQUM7NEJBQ2hDLGNBQWMsQ0FBQyxPQUFPLENBQUMsR0FBRyxJQUFJLENBQUM7d0JBQ2hDLENBQUM7d0JBRUQsWUFBWSxDQUFDLGNBQWMsQ0FBQyxDQUFDO3dCQUM3QixtQkFBbUIsQ0FBQyxDQUFDLGtDQUFrQyxDQUFDLENBQUMsQ0FBQzt3QkFDMUQsTUFBTSxTQUFTLENBQUMsV0FBVyxFQUFFOzRCQUM1QjtnQ0FDQyxJQUFJLEVBQUUseURBQXlEO2dDQUMvRCxRQUFRLEVBQUUsQ0FBQyxhQUFhLENBQUM7NkJBQ3pCOzRCQUNEO2dDQUNDLElBQUksRUFBRSxxRUFBcUU7Z0NBQzNFLFFBQVEsRUFBRSxDQUFDLGFBQWEsQ0FBQzs2QkFDekI7NEJBQ0Q7Z0NBQ0MsSUFBSSxFQUFFLHNFQUFzRTtnQ0FDNUUsUUFBUSxFQUFFLENBQUMsYUFBYSxDQUFDOzZCQUN6Qjs0QkFDRDtnQ0FDQyxJQUFJLEVBQUUseUVBQXlFO2dDQUMvRSxRQUFRLEVBQUUsQ0FBQyxlQUFlLENBQUM7NkJBQzNCOzRCQUNEO2dDQUNDLElBQUksRUFBRSx5RUFBeUU7Z0NBQy9FLFFBQVEsRUFBRSxDQUFDLGdCQUFnQixDQUFDOzZCQUM1Qjs0QkFDRDtnQ0FDQyxJQUFJLEVBQUUsNkRBQTZEO2dDQUNuRSxRQUFRLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQzs2QkFDN0I7eUJBQ0QsQ0FBQyxDQUFDO3dCQUNILE1BQU0sT0FBTyxHQUFHLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO3dCQUV4RSxhQUFhLENBQ1osTUFBTSxPQUFPLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQyxNQUFNLEVBQUUsY0FBYyxDQUFDLEtBQUssRUFBRSxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsRUFDekY7NEJBQ0Msc0VBQXNFOzRCQUN0RSx5RUFBeUU7NEJBQ3pFLHlFQUF5RTt5QkFDekUsRUFDRCw0QkFBNEIsQ0FDNUIsQ0FBQztvQkFFSCxDQUFDO2dCQUNGLENBQUMsQ0FBQyxDQUFDO1lBQ0osQ0FBQyxDQUFDLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsS0FBSyxDQUFDLFlBQVksRUFBRSxLQUFLLElBQUksRUFBRTtRQUM5QixZQUFZLENBQUM7WUFDWixtQ0FBbUMsRUFBRSxJQUFJO1lBQ3pDLGVBQWUsRUFBRSxJQUFJO1lBQ3JCLHdCQUF3QixFQUFFLEtBQUs7WUFDL0Isa0JBQWtCLEVBQUUsSUFBSTtTQUN4QixDQUFDLENBQUM7UUFDSCxtQkFBbUIsQ0FBQztZQUNuQixrQ0FBa0M7U0FDbEMsQ0FBQyxDQUFDO1FBQ0gsTUFBTSxTQUFTLENBQUMsV0FBVyxFQUFFO1lBQzVCO2dCQUNDLElBQUksRUFBRSxrREFBa0Q7Z0JBQ3hELFFBQVEsRUFBRSxDQUFDLGVBQWUsQ0FBQzthQUMzQjtZQUNEO2dCQUNDLElBQUksRUFBRSw0REFBNEQ7Z0JBQ2xFLFFBQVEsRUFBRSxDQUFDLDZCQUE2QixDQUFDO2FBQ3pDO1lBQ0Q7Z0JBQ0MsSUFBSSxFQUFFLDBDQUEwQztnQkFDaEQsUUFBUSxFQUFFLENBQUMsZ0NBQWdDLENBQUM7YUFDNUM7WUFDRDtnQkFDQyxJQUFJLEVBQUUsbURBQW1EO2dCQUN6RCxRQUFRLEVBQUUsQ0FBQyxhQUFhLENBQUM7YUFDekI7WUFDRDtnQkFDQyxJQUFJLEVBQUUscUVBQXFFO2dCQUMzRSxRQUFRLEVBQUUsQ0FBQyxlQUFlLENBQUM7YUFDM0I7WUFDRDtnQkFDQyxJQUFJLEVBQUUsK0RBQStEO2dCQUNyRSxRQUFRLEVBQUUsQ0FBQyxhQUFhLENBQUM7YUFDekI7U0FDRCxDQUFDLENBQUM7UUFDSCxNQUFNLE9BQU8sR0FBRyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsa0JBQWtCLENBQUMsQ0FBQztRQUV4RSxhQUFhLENBQ1osTUFBTSxPQUFPLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQyxNQUFNLEVBQUUsY0FBYyxDQUFDLEtBQUssRUFBRSxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsRUFDekY7WUFDQywrREFBK0Q7WUFDL0Qsa0RBQWtEO1lBQ2xELDREQUE0RDtZQUM1RCwwQ0FBMEM7WUFDMUMscUVBQXFFO1NBQ3JFLEVBQ0QsNEJBQTRCLENBQzVCLENBQUM7SUFDSCxDQUFDLENBQUMsQ0FBQztJQUVILEtBQUssQ0FBQywwQ0FBMEMsRUFBRSxLQUFLLElBQUksRUFBRTtRQUM1RCxZQUFZLENBQUM7WUFDWixtQ0FBbUMsRUFBRSxJQUFJO1lBQ3pDLGVBQWUsRUFBRSxJQUFJO1lBQ3JCLHdCQUF3QixFQUFFLEtBQUs7WUFDL0Isa0JBQWtCLEVBQUUsSUFBSTtZQUN4QixpQkFBaUIsRUFBRSxLQUFLO1NBQ3hCLENBQUMsQ0FBQztRQUNILG1CQUFtQixDQUFDO1lBQ25CLGtDQUFrQztTQUNsQyxDQUFDLENBQUM7UUFDSCxNQUFNLFNBQVMsQ0FBQyxXQUFXLEVBQUU7WUFDNUI7Z0JBQ0MsSUFBSSxFQUFFLGtEQUFrRDtnQkFDeEQsUUFBUSxFQUFFLENBQUMsZUFBZSxDQUFDO2FBQzNCO1lBQ0Q7Z0JBQ0MsSUFBSSxFQUFFLDREQUE0RDtnQkFDbEUsUUFBUSxFQUFFLENBQUMsNkJBQTZCLENBQUM7YUFDekM7WUFDRDtnQkFDQyxJQUFJLEVBQUUsMENBQTBDO2dCQUNoRCxRQUFRLEVBQUUsQ0FBQyxnQ0FBZ0MsQ0FBQzthQUM1QztZQUNEO2dCQUNDLElBQUksRUFBRSxtREFBbUQ7Z0JBQ3pELFFBQVEsRUFBRSxDQUFDLGFBQWEsQ0FBQzthQUN6QjtZQUNEO2dCQUNDLElBQUksRUFBRSxxRUFBcUU7Z0JBQzNFLFFBQVEsRUFBRSxDQUFDLGVBQWUsQ0FBQzthQUMzQjtZQUNEO2dCQUNDLElBQUksRUFBRSwrREFBK0Q7Z0JBQ3JFLFFBQVEsRUFBRSxDQUFDLGFBQWEsQ0FBQzthQUN6QjtZQUNEO2dCQUNDLElBQUksRUFBRSxpRUFBaUU7Z0JBQ3ZFLFFBQVEsRUFBRSxDQUFDLGFBQWEsQ0FBQzthQUN6QjtTQUNELENBQUMsQ0FBQztRQUNILE1BQU0sT0FBTyxHQUFHLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1FBRXhFLGFBQWEsQ0FDWixNQUFNLE9BQU8sQ0FBQyxTQUFTLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxjQUFjLENBQUMsS0FBSyxFQUFFLGlCQUFpQixDQUFDLElBQUksQ0FBQyxFQUN6RjtZQUNDLGtEQUFrRDtZQUNsRCw0REFBNEQ7WUFDNUQsMENBQTBDO1lBQzFDLHFFQUFxRTtTQUNyRSxFQUNELDRCQUE0QixDQUM1QixDQUFDO0lBQ0gsQ0FBQyxDQUFDLENBQUM7SUFFSCxLQUFLLENBQUMsc0JBQXNCLEVBQUUsR0FBRyxFQUFFO1FBQ2xDLEtBQUssQ0FBQyxZQUFZLEVBQUUsR0FBRyxFQUFFO1lBQ3hCLEtBQUssQ0FBQyxvQ0FBb0MsRUFBRSxLQUFLLElBQUksRUFBRTtnQkFDdEQsWUFBWSxDQUFDO29CQUNaLG1DQUFtQyxFQUFFLElBQUk7b0JBQ3pDLGVBQWUsRUFBRSxJQUFJO29CQUNyQix3QkFBd0IsRUFBRSxLQUFLO29CQUMvQixrQkFBa0IsRUFBRSxLQUFLO2lCQUN6QixDQUFDLENBQUM7Z0JBQ0gsbUJBQW1CLENBQUM7b0JBQ25CLGtDQUFrQztvQkFDbEMsZ0NBQWdDO2lCQUNoQyxDQUFDLENBQUM7Z0JBQ0gsTUFBTSxTQUFTLENBQUMsV0FBVyxFQUFFO29CQUM1Qjt3QkFDQyxJQUFJLEVBQUUsa0RBQWtEO3dCQUN4RCxRQUFRLEVBQUUsQ0FBQyxlQUFlLENBQUM7cUJBQzNCO29CQUNEO3dCQUNDLElBQUksRUFBRSw0REFBNEQ7d0JBQ2xFLFFBQVEsRUFBRSxDQUFDLDZCQUE2QixDQUFDO3FCQUN6QztvQkFDRDt3QkFDQyxJQUFJLEVBQUUsMENBQTBDO3dCQUNoRCxRQUFRLEVBQUUsQ0FBQyxnQ0FBZ0MsQ0FBQztxQkFDNUM7b0JBQ0Q7d0JBQ0MsSUFBSSxFQUFFLG1EQUFtRDt3QkFDekQsUUFBUSxFQUFFLENBQUMsYUFBYSxDQUFDO3FCQUN6QjtvQkFDRDt3QkFDQyxJQUFJLEVBQUUscUVBQXFFO3dCQUMzRSxRQUFRLEVBQUUsQ0FBQyxlQUFlLENBQUM7cUJBQzNCO29CQUNEO3dCQUNDLElBQUksRUFBRSxvRUFBb0U7d0JBQzFFLFFBQVEsRUFBRSxDQUFDLGFBQWEsQ0FBQztxQkFDekI7b0JBQ0Q7d0JBQ0MsSUFBSSxFQUFFLG1FQUFtRTt3QkFDekUsUUFBUSxFQUFFLENBQUMsZUFBZSxDQUFDO3FCQUMzQjtvQkFDRDt3QkFDQyxJQUFJLEVBQUUsa0ZBQWtGO3dCQUN4RixRQUFRLEVBQUUsQ0FBQyxlQUFlLENBQUM7cUJBQzNCO29CQUNEO3dCQUNDLElBQUksRUFBRSxpRUFBaUU7d0JBQ3ZFLFFBQVEsRUFBRSxDQUFDLGVBQWUsQ0FBQztxQkFDM0I7b0JBQ0Q7d0JBQ0MsSUFBSSxFQUFFLHdFQUF3RTt3QkFDOUUsUUFBUSxFQUFFLENBQUMsaUJBQWlCLENBQUM7cUJBQzdCO2lCQUNELENBQUMsQ0FBQztnQkFDSCxNQUFNLE9BQU8sR0FBRyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsa0JBQWtCLENBQUMsQ0FBQztnQkFFeEUsYUFBYSxDQUNaLE1BQU0sT0FBTyxDQUFDLFNBQVMsQ0FBQyxXQUFXLENBQUMsTUFBTSxFQUFFLGNBQWMsQ0FBQyxLQUFLLEVBQUUsaUJBQWlCLENBQUMsSUFBSSxDQUFDLEVBQ3pGO29CQUNDLG9FQUFvRTtvQkFDcEUsa0ZBQWtGO29CQUNsRixrREFBa0Q7b0JBQ2xELDREQUE0RDtvQkFDNUQsMENBQTBDO2lCQUMxQyxFQUNELDRCQUE0QixDQUM1QixDQUFDO1lBQ0gsQ0FBQyxDQUFDLENBQUM7WUFFSCxLQUFLLENBQUMsaUNBQWlDLEVBQUUsS0FBSyxJQUFJLEVBQUU7Z0JBQ25ELFlBQVksQ0FBQztvQkFDWixtQ0FBbUMsRUFBRSxJQUFJO29CQUN6QyxlQUFlLEVBQUUsSUFBSTtvQkFDckIsd0JBQXdCLEVBQUUsS0FBSztvQkFDL0Isa0JBQWtCLEVBQUUsS0FBSztpQkFDekIsQ0FBQyxDQUFDO2dCQUNILG1CQUFtQixDQUFDO29CQUNuQixrQ0FBa0M7b0JBQ2xDLGdDQUFnQztvQkFDaEMscUJBQXFCO2lCQUNyQixDQUFDLENBQUM7Z0JBQ0gsTUFBTSxTQUFTLENBQUMsV0FBVyxFQUFFO29CQUM1Qjt3QkFDQyxJQUFJLEVBQUUsa0RBQWtEO3dCQUN4RCxRQUFRLEVBQUUsQ0FBQyxlQUFlLENBQUM7cUJBQzNCO29CQUNEO3dCQUNDLElBQUksRUFBRSw0REFBNEQ7d0JBQ2xFLFFBQVEsRUFBRSxDQUFDLDZCQUE2QixDQUFDO3FCQUN6QztvQkFDRDt3QkFDQyxJQUFJLEVBQUUsMENBQTBDO3dCQUNoRCxRQUFRLEVBQUUsQ0FBQyxnQ0FBZ0MsQ0FBQztxQkFDNUM7b0JBQ0Q7d0JBQ0MsSUFBSSxFQUFFLG1EQUFtRDt3QkFDekQsUUFBUSxFQUFFLENBQUMsYUFBYSxDQUFDO3FCQUN6QjtvQkFDRDt3QkFDQyxJQUFJLEVBQUUscUVBQXFFO3dCQUMzRSxRQUFRLEVBQUUsQ0FBQyxlQUFlLENBQUM7cUJBQzNCO29CQUNEO3dCQUNDLElBQUksRUFBRSxvRUFBb0U7d0JBQzFFLFFBQVEsRUFBRSxDQUFDLGFBQWEsQ0FBQztxQkFDekI7b0JBQ0Q7d0JBQ0MsSUFBSSxFQUFFLG1FQUFtRTt3QkFDekUsUUFBUSxFQUFFLENBQUMsZUFBZSxDQUFDO3FCQUMzQjtvQkFDRDt3QkFDQyxJQUFJLEVBQUUsa0ZBQWtGO3dCQUN4RixRQUFRLEVBQUUsQ0FBQyxlQUFlLENBQUM7cUJBQzNCO29CQUNEO3dCQUNDLElBQUksRUFBRSwyREFBMkQ7d0JBQ2pFLFFBQVEsRUFBRSxDQUFDLGVBQWUsQ0FBQztxQkFDM0I7b0JBQ0Q7d0JBQ0MsSUFBSSxFQUFFLGtFQUFrRTt3QkFDeEUsUUFBUSxFQUFFLENBQUMsaUJBQWlCLENBQUM7cUJBQzdCO2lCQUNELENBQUMsQ0FBQztnQkFDSCxNQUFNLE9BQU8sR0FBRyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsa0JBQWtCLENBQUMsQ0FBQztnQkFFeEUsYUFBYSxDQUNaLE1BQU0sT0FBTyxDQUFDLFNBQVMsQ0FBQyxXQUFXLENBQUMsTUFBTSxFQUFFLGNBQWMsQ0FBQyxLQUFLLEVBQUUsaUJBQWlCLENBQUMsSUFBSSxDQUFDLEVBQ3pGO29CQUNDLG9FQUFvRTtvQkFDcEUsa0ZBQWtGO29CQUNsRiwyREFBMkQ7b0JBQzNELGtFQUFrRTtvQkFDbEUsa0RBQWtEO29CQUNsRCw0REFBNEQ7b0JBQzVELDBDQUEwQztpQkFDMUMsRUFDRCw0QkFBNEIsQ0FDNUIsQ0FBQztZQUNILENBQUMsQ0FBQyxDQUFDO1lBRUgsS0FBSyxDQUFDLDBDQUEwQyxFQUFFLEtBQUssSUFBSSxFQUFFO2dCQUM1RCxZQUFZLENBQUM7b0JBQ1osbUNBQW1DLEVBQUUsSUFBSTtvQkFDekMsZUFBZSxFQUFFLElBQUk7b0JBQ3JCLHdCQUF3QixFQUFFLEtBQUs7b0JBQy9CLGtCQUFrQixFQUFFLEtBQUs7b0JBQ3pCLGlCQUFpQixFQUFFLEtBQUs7aUJBQ3hCLENBQUMsQ0FBQztnQkFDSCxtQkFBbUIsQ0FBQztvQkFDbkIsa0NBQWtDO29CQUNsQyxnQ0FBZ0M7b0JBQ2hDLHFCQUFxQjtpQkFDckIsQ0FBQyxDQUFDO2dCQUNILE1BQU0sU0FBUyxDQUFDLFdBQVcsRUFBRTtvQkFDNUI7d0JBQ0MsSUFBSSxFQUFFLGtEQUFrRDt3QkFDeEQsUUFBUSxFQUFFLENBQUMsZUFBZSxDQUFDO3FCQUMzQjtvQkFDRDt3QkFDQyxJQUFJLEVBQUUsNERBQTREO3dCQUNsRSxRQUFRLEVBQUUsQ0FBQyw2QkFBNkIsQ0FBQztxQkFDekM7b0JBQ0Q7d0JBQ0MsSUFBSSxFQUFFLDBDQUEwQzt3QkFDaEQsUUFBUSxFQUFFLENBQUMsZ0NBQWdDLENBQUM7cUJBQzVDO29CQUNEO3dCQUNDLElBQUksRUFBRSxtREFBbUQ7d0JBQ3pELFFBQVEsRUFBRSxDQUFDLGFBQWEsQ0FBQztxQkFDekI7b0JBQ0Q7d0JBQ0MsSUFBSSxFQUFFLHFFQUFxRTt3QkFDM0UsUUFBUSxFQUFFLENBQUMsZUFBZSxDQUFDO3FCQUMzQjtvQkFDRDt3QkFDQyxJQUFJLEVBQUUsb0VBQW9FO3dCQUMxRSxRQUFRLEVBQUUsQ0FBQyxhQUFhLENBQUM7cUJBQ3pCO29CQUNEO3dCQUNDLElBQUksRUFBRSxtRUFBbUU7d0JBQ3pFLFFBQVEsRUFBRSxDQUFDLGVBQWUsQ0FBQztxQkFDM0I7b0JBQ0Q7d0JBQ0MsSUFBSSxFQUFFLGtGQUFrRjt3QkFDeEYsUUFBUSxFQUFFLENBQUMsZUFBZSxDQUFDO3FCQUMzQjtvQkFDRDt3QkFDQyxJQUFJLEVBQUUsMkRBQTJEO3dCQUNqRSxRQUFRLEVBQUUsQ0FBQyxlQUFlLENBQUM7cUJBQzNCO29CQUNEO3dCQUNDLElBQUksRUFBRSxrRUFBa0U7d0JBQ3hFLFFBQVEsRUFBRSxDQUFDLGlCQUFpQixDQUFDO3FCQUM3QjtpQkFDRCxDQUFDLENBQUM7Z0JBQ0gsTUFBTSxPQUFPLEdBQUcsb0JBQW9CLENBQUMsY0FBYyxDQUFDLGtCQUFrQixDQUFDLENBQUM7Z0JBRXhFLGFBQWEsQ0FDWixNQUFNLE9BQU8sQ0FBQyxTQUFTLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxjQUFjLENBQUMsS0FBSyxFQUFFLGlCQUFpQixDQUFDLElBQUksQ0FBQyxFQUN6RjtvQkFDQyxrREFBa0Q7b0JBQ2xELDREQUE0RDtvQkFDNUQsMENBQTBDO2lCQUMxQyxFQUNELDRCQUE0QixDQUM1QixDQUFDO1lBQ0gsQ0FBQyxDQUFDLENBQUM7WUFFSCxLQUFLLENBQUMsT0FBTyxFQUFFLEtBQUssSUFBSSxFQUFFO2dCQUN6QixZQUFZLENBQUM7b0JBQ1oscUNBQXFDLEVBQUUsSUFBSTtvQkFDM0Msa0JBQWtCLEVBQUUsS0FBSztvQkFDekIsaUJBQWlCLEVBQUUsSUFBSTtvQkFDdkIsbURBQW1ELEVBQUUsSUFBSTtpQkFDekQsQ0FBQyxDQUFDO2dCQUNILG1CQUFtQixDQUFDO29CQUNuQixrQ0FBa0M7b0JBQ2xDLGdDQUFnQztvQkFDaEMscUJBQXFCO2lCQUNyQixDQUFDLENBQUM7Z0JBQ0gsTUFBTSxTQUFTLENBQUMsV0FBVyxFQUFFO29CQUM1Qjt3QkFDQyxJQUFJLEVBQUUsa0RBQWtEO3dCQUN4RCxRQUFRLEVBQUUsQ0FBQyxlQUFlLENBQUM7cUJBQzNCO29CQUNEO3dCQUNDLElBQUksRUFBRSw0REFBNEQ7d0JBQ2xFLFFBQVEsRUFBRSxDQUFDLDZCQUE2QixDQUFDO3FCQUN6QztvQkFDRDt3QkFDQyxJQUFJLEVBQUUsaURBQWlEO3dCQUN2RCxRQUFRLEVBQUUsQ0FBQyxRQUFRLENBQUM7cUJBQ3BCO29CQUNEO3dCQUNDLElBQUksRUFBRSwwQ0FBMEM7d0JBQ2hELFFBQVEsRUFBRSxDQUFDLGdDQUFnQyxDQUFDO3FCQUM1QztvQkFDRDt3QkFDQyxJQUFJLEVBQUUsbURBQW1EO3dCQUN6RCxRQUFRLEVBQUUsQ0FBQyxhQUFhLENBQUM7cUJBQ3pCO29CQUNEO3dCQUNDLElBQUksRUFBRSxxRUFBcUU7d0JBQzNFLFFBQVEsRUFBRSxDQUFDLGVBQWUsQ0FBQztxQkFDM0I7b0JBQ0Q7d0JBQ0MsSUFBSSxFQUFFLG9FQUFvRTt3QkFDMUUsUUFBUSxFQUFFLENBQUMsYUFBYSxDQUFDO3FCQUN6QjtvQkFDRDt3QkFDQyxJQUFJLEVBQUUsbUVBQW1FO3dCQUN6RSxRQUFRLEVBQUUsQ0FBQyxlQUFlLENBQUM7cUJBQzNCO29CQUNEO3dCQUNDLElBQUksRUFBRSxrRkFBa0Y7d0JBQ3hGLFFBQVEsRUFBRSxDQUFDLGVBQWUsQ0FBQztxQkFDM0I7b0JBQ0Q7d0JBQ0MsSUFBSSxFQUFFLDJEQUEyRDt3QkFDakUsUUFBUSxFQUFFLENBQUMsZUFBZSxDQUFDO3FCQUMzQjtvQkFDRDt3QkFDQyxJQUFJLEVBQUUsa0VBQWtFO3dCQUN4RSxRQUFRLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQztxQkFDN0I7aUJBQ0QsQ0FBQyxDQUFDO2dCQUNILE1BQU0sT0FBTyxHQUFHLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO2dCQUV4RSxhQUFhLENBQ1osTUFBTSxPQUFPLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQyxNQUFNLEVBQUUsY0FBYyxDQUFDLEtBQUssRUFBRSxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsRUFDekY7b0JBQ0Msd0RBQXdEO29CQUN4RCxvRUFBb0U7b0JBQ3BFLGtGQUFrRjtvQkFDbEYsMkRBQTJEO29CQUMzRCxrRUFBa0U7b0JBQ2xFLDRFQUE0RTtvQkFDNUUsa0RBQWtEO29CQUNsRCw0REFBNEQ7b0JBQzVELDhGQUE4RjtvQkFDOUYsbURBQW1EO2lCQUNuRCxFQUNELDRCQUE0QixDQUM1QixDQUFDO1lBQ0gsQ0FBQyxDQUFDLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQztRQUVILEtBQUssQ0FBQyxjQUFjLEVBQUUsR0FBRyxFQUFFO1lBQzFCLEtBQUssQ0FBQyxVQUFVLEVBQUUsR0FBRyxFQUFFO2dCQUN0QixLQUFLLENBQUMsV0FBVyxFQUFFLEtBQUssSUFBSSxFQUFFO29CQUM3QixNQUFNLFlBQVksR0FBRzt3QkFDcEIsSUFBSTt3QkFDSixnQkFBZ0I7d0JBQ2hCLFNBQVM7d0JBQ1QsTUFBTTt3QkFDTixTQUFTO3dCQUNULHFCQUFxQjt3QkFDckIsV0FBVzt3QkFDWCxjQUFjO3dCQUNkLFlBQVk7d0JBQ1osY0FBYzt3QkFDZCxpQkFBaUI7d0JBQ2pCLHdCQUF3Qjt3QkFDeEIsMEJBQTBCO3dCQUMxQixzQ0FBc0M7d0JBQ3RDLDRCQUE0Qjt3QkFDNUIsK0JBQStCO3dCQUMvQiw2QkFBNkI7d0JBQzdCLCtCQUErQjt3QkFDL0Isa0NBQWtDO3dCQUNsQyx5Q0FBeUM7cUJBQ3pDLENBQUM7b0JBRUYsS0FBSyxNQUFNLE9BQU8sSUFBSSxZQUFZLEVBQUUsQ0FBQzt3QkFFcEMsWUFBWSxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO3dCQUNsQyxtQkFBbUIsQ0FBQzs0QkFDbkIsa0NBQWtDOzRCQUNsQyxtQ0FBbUM7eUJBQ25DLENBQUMsQ0FBQzt3QkFDSCxNQUFNLFNBQVMsQ0FBQyxXQUFXLEVBQUU7NEJBQzVCO2dDQUNDLElBQUksRUFBRSx3REFBd0Q7Z0NBQzlELFFBQVEsRUFBRSxDQUFDLGFBQWEsQ0FBQzs2QkFDekI7NEJBQ0Q7Z0NBQ0MsSUFBSSxFQUFFLHFFQUFxRTtnQ0FDM0UsUUFBUSxFQUFFLENBQUMsYUFBYSxDQUFDOzZCQUN6Qjs0QkFDRDtnQ0FDQyxJQUFJLEVBQUUsd0VBQXdFO2dDQUM5RSxRQUFRLEVBQUUsQ0FBQyxlQUFlLENBQUM7NkJBQzNCOzRCQUNEO2dDQUNDLElBQUksRUFBRSx3RUFBd0U7Z0NBQzlFLFFBQVEsRUFBRSxDQUFDLGVBQWUsQ0FBQzs2QkFDM0I7NEJBQ0Q7Z0NBQ0MsSUFBSSxFQUFFLDREQUE0RDtnQ0FDbEUsUUFBUSxFQUFFLENBQUMsaUJBQWlCLENBQUM7NkJBQzdCOzRCQUNEO2dDQUNDLElBQUksRUFBRSw0REFBNEQ7Z0NBQ2xFLFFBQVEsRUFBRSxDQUFDLGFBQWEsQ0FBQzs2QkFDekI7NEJBQ0Q7Z0NBQ0MsSUFBSSxFQUFFLGlFQUFpRTtnQ0FDdkUsUUFBUSxFQUFFLENBQUMsZUFBZSxDQUFDOzZCQUMzQjs0QkFDRDtnQ0FDQyxJQUFJLEVBQUUsc0RBQXNEO2dDQUM1RCxRQUFRLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQzs2QkFDN0I7eUJBQ0QsQ0FBQyxDQUFDO3dCQUNILE1BQU0sT0FBTyxHQUFHLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO3dCQUV4RSxhQUFhLENBQ1osTUFBTSxPQUFPLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQyxNQUFNLEVBQUUsY0FBYyxDQUFDLEtBQUssRUFBRSxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsRUFDekY7NEJBQ0Msd0RBQXdEOzRCQUN4RCxxRUFBcUU7NEJBQ3JFLHdFQUF3RTs0QkFDeEUsd0VBQXdFOzRCQUN4RSxJQUFJOzRCQUNKLDREQUE0RDs0QkFDNUQsaUVBQWlFO3lCQUNqRSxFQUNELDRCQUE0QixDQUM1QixDQUFDO29CQUVILENBQUM7Z0JBQ0YsQ0FBQyxDQUFDLENBQUM7Z0JBRUgsS0FBSyxDQUFDLFVBQVUsRUFBRSxLQUFLLElBQUksRUFBRTtvQkFDNUIsTUFBTSxZQUFZLEdBQUc7d0JBQ3BCOzRCQUNDLGlCQUFpQjs0QkFDakIsZUFBZTs0QkFDZixhQUFhO3lCQUNiO3dCQUNEOzRCQUNDLGlCQUFpQjs0QkFDakIseUJBQXlCOzRCQUN6Qix1QkFBdUI7eUJBQ3ZCO3dCQUNEOzRCQUNDLFdBQVc7NEJBQ1gsa0JBQWtCOzRCQUNsQixnQkFBZ0I7eUJBQ2hCO3dCQUNEOzRCQUNDLFdBQVc7NEJBQ1gsY0FBYzs0QkFDZCxnQkFBZ0I7NEJBQ2hCLFlBQVk7NEJBQ1osY0FBYzt5QkFDZDt3QkFDRDs0QkFDQyxpQkFBaUI7NEJBQ2pCLHVCQUF1Qjs0QkFDdkIsMEJBQTBCOzRCQUMxQiwwQkFBMEI7NEJBQzFCLHFCQUFxQjs0QkFDckIsMEJBQTBCO3lCQUMxQjt3QkFDRDs0QkFDQyxzQkFBc0I7NEJBQ3RCLG9CQUFvQjs0QkFDcEIsa0JBQWtCO3lCQUNsQjt3QkFDRDs0QkFDQyxzQkFBc0I7NEJBQ3RCLDhCQUE4Qjs0QkFDOUIsNEJBQTRCO3lCQUM1Qjt3QkFDRDs0QkFDQyxnQkFBZ0I7NEJBQ2hCLHVCQUF1Qjs0QkFDdkIscUJBQXFCO3lCQUNyQjt3QkFDRDs0QkFDQyxnQkFBZ0I7NEJBQ2hCLG1CQUFtQjs0QkFDbkIscUJBQXFCOzRCQUNyQixpQkFBaUI7NEJBQ2pCLG1CQUFtQjt5QkFDbkI7d0JBQ0Q7NEJBQ0Msc0JBQXNCOzRCQUN0Qiw0QkFBNEI7NEJBQzVCLCtCQUErQjs0QkFDL0IsK0JBQStCOzRCQUMvQiwwQkFBMEI7NEJBQzFCLCtCQUErQjt5QkFDL0I7d0JBQ0Q7NEJBQ0MsdUJBQXVCOzRCQUN2QixvQ0FBb0M7NEJBQ3BDLHVDQUF1Qzs0QkFDdkMsdUNBQXVDOzRCQUN2QywwQkFBMEI7NEJBQzFCLCtCQUErQjt5QkFDL0I7d0JBQ0Q7NEJBQ0MsdUJBQXVCOzRCQUN2Qiw0QkFBNEI7NEJBQzVCLGtCQUFrQjt5QkFDbEI7d0JBQ0Q7NEJBQ0MsdUJBQXVCOzRCQUN2QixnQ0FBZ0M7NEJBQ2hDLG1DQUFtQzs0QkFDbkMsbUNBQW1DOzRCQUNuQyxXQUFXO3lCQUNYO3dCQUNEOzRCQUNDLCtCQUErQjs0QkFDL0IsNkJBQTZCOzRCQUM3QiwyQkFBMkI7eUJBQzNCO3dCQUNEOzRCQUNDLCtCQUErQjs0QkFDL0IsdUNBQXVDOzRCQUN2QyxxQ0FBcUM7eUJBQ3JDO3dCQUNEOzRCQUNDLHlCQUF5Qjs0QkFDekIsZ0NBQWdDOzRCQUNoQyw4QkFBOEI7eUJBQzlCO3dCQUNEOzRCQUNDLHlCQUF5Qjs0QkFDekIsNEJBQTRCOzRCQUM1Qiw4QkFBOEI7NEJBQzlCLDBCQUEwQjs0QkFDMUIsNEJBQTRCO3lCQUM1Qjt3QkFDRDs0QkFDQywrQkFBK0I7NEJBQy9CLHFDQUFxQzs0QkFDckMsd0NBQXdDOzRCQUN4Qyx3Q0FBd0M7NEJBQ3hDLG1DQUFtQzs0QkFDbkMsd0NBQXdDO3lCQUN4QztxQkFDRCxDQUFDO29CQUVGLEtBQUssTUFBTSxRQUFRLElBQUksWUFBWSxFQUFFLENBQUM7d0JBQ3JDLE1BQU0sY0FBYyxHQUE0QixFQUFFLENBQUM7d0JBQ25ELEtBQUssTUFBTSxPQUFPLElBQUksUUFBUSxFQUFFLENBQUM7NEJBQ2hDLGNBQWMsQ0FBQyxPQUFPLENBQUMsR0FBRyxJQUFJLENBQUM7d0JBQ2hDLENBQUM7d0JBRUQsWUFBWSxDQUFDLGNBQWMsQ0FBQyxDQUFDO3dCQUM3QixtQkFBbUIsQ0FBQzs0QkFDbkIsa0NBQWtDOzRCQUNsQyxtQ0FBbUM7eUJBQ25DLENBQUMsQ0FBQzt3QkFDSCxNQUFNLFNBQVMsQ0FBQyxXQUFXLEVBQUU7NEJBQzVCO2dDQUNDLElBQUksRUFBRSx3REFBd0Q7Z0NBQzlELFFBQVEsRUFBRSxDQUFDLGFBQWEsQ0FBQzs2QkFDekI7NEJBQ0Q7Z0NBQ0MsSUFBSSxFQUFFLHFFQUFxRTtnQ0FDM0UsUUFBUSxFQUFFLENBQUMsYUFBYSxDQUFDOzZCQUN6Qjs0QkFDRDtnQ0FDQyxJQUFJLEVBQUUsd0VBQXdFO2dDQUM5RSxRQUFRLEVBQUUsQ0FBQyxlQUFlLENBQUM7NkJBQzNCOzRCQUNEO2dDQUNDLElBQUksRUFBRSx3RUFBd0U7Z0NBQzlFLFFBQVEsRUFBRSxDQUFDLGVBQWUsQ0FBQzs2QkFDM0I7NEJBQ0Q7Z0NBQ0MsSUFBSSxFQUFFLDREQUE0RDtnQ0FDbEUsUUFBUSxFQUFFLENBQUMsaUJBQWlCLENBQUM7NkJBQzdCOzRCQUNEO2dDQUNDLElBQUksRUFBRSw0REFBNEQ7Z0NBQ2xFLFFBQVEsRUFBRSxDQUFDLGFBQWEsQ0FBQzs2QkFDekI7NEJBQ0Q7Z0NBQ0MsSUFBSSxFQUFFLGlFQUFpRTtnQ0FDdkUsUUFBUSxFQUFFLENBQUMsZUFBZSxDQUFDOzZCQUMzQjs0QkFDRDtnQ0FDQyxJQUFJLEVBQUUsc0RBQXNEO2dDQUM1RCxRQUFRLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQzs2QkFDN0I7eUJBQ0QsQ0FBQyxDQUFDO3dCQUNILE1BQU0sT0FBTyxHQUFHLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO3dCQUV4RSxhQUFhLENBQ1osTUFBTSxPQUFPLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQyxNQUFNLEVBQUUsY0FBYyxDQUFDLEtBQUssRUFBRSxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsRUFDekY7NEJBQ0Msd0RBQXdEOzRCQUN4RCxxRUFBcUU7NEJBQ3JFLHdFQUF3RTs0QkFDeEUsd0VBQXdFOzRCQUN4RSxJQUFJOzRCQUNKLDREQUE0RDs0QkFDNUQsaUVBQWlFO3lCQUNqRSxFQUNELDRCQUE0QixDQUM1QixDQUFDO29CQUVILENBQUM7Z0JBQ0YsQ0FBQyxDQUFDLENBQUM7WUFDSixDQUFDLENBQUMsQ0FBQztZQUVILEtBQUssQ0FBQyxVQUFVLEVBQUUsR0FBRyxFQUFFO2dCQUN0QixLQUFLLENBQUMsV0FBVyxFQUFFLEtBQUssSUFBSSxFQUFFO29CQUM3QixNQUFNLFlBQVksR0FBRzt3QkFDcEIsOEJBQThCO3dCQUM5QiwwQ0FBMEM7d0JBQzFDLG1DQUFtQzt3QkFDbkMsZ0NBQWdDO3dCQUNoQyxzQ0FBc0M7d0JBQ3RDLGtEQUFrRDt3QkFDbEQsd0NBQXdDO3dCQUN4QywyQ0FBMkM7d0JBQzNDLHNDQUFzQzt3QkFDdEMsd0NBQXdDO3dCQUN4QywyQ0FBMkM7d0JBQzNDLGtEQUFrRDt3QkFDbEQsK0NBQStDO3dCQUMvQywyREFBMkQ7d0JBQzNELG9EQUFvRDt3QkFDcEQsaURBQWlEO3dCQUNqRCx1REFBdUQ7d0JBQ3ZELG1FQUFtRTt3QkFDbkUseURBQXlEO3dCQUN6RCw0REFBNEQ7d0JBQzVELHVEQUF1RDt3QkFDdkQseURBQXlEO3dCQUN6RCw0REFBNEQ7d0JBQzVELG1FQUFtRTt3QkFDbkUsZ0VBQWdFO3dCQUNoRSw0RUFBNEU7d0JBQzVFLGtFQUFrRTt3QkFDbEUscUVBQXFFO3dCQUNyRSxnRUFBZ0U7d0JBQ2hFLGtFQUFrRTt3QkFDbEUscUVBQXFFO3dCQUNyRSw0RUFBNEU7cUJBQzVFLENBQUM7b0JBRUYsS0FBSyxNQUFNLE9BQU8sSUFBSSxZQUFZLEVBQUUsQ0FBQzt3QkFDcEMsWUFBWSxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO3dCQUNsQyxtQkFBbUIsQ0FBQzs0QkFDbkIsa0NBQWtDOzRCQUNsQyxtQ0FBbUM7eUJBQ25DLENBQUMsQ0FBQzt3QkFDSCxNQUFNLFNBQVMsQ0FBQyxXQUFXLEVBQUU7NEJBQzVCO2dDQUNDLElBQUksRUFBRSx3REFBd0Q7Z0NBQzlELFFBQVEsRUFBRSxDQUFDLGFBQWEsQ0FBQzs2QkFDekI7NEJBQ0Q7Z0NBQ0MsSUFBSSxFQUFFLHFFQUFxRTtnQ0FDM0UsUUFBUSxFQUFFLENBQUMsYUFBYSxDQUFDOzZCQUN6Qjs0QkFDRDtnQ0FDQyxJQUFJLEVBQUUsd0VBQXdFO2dDQUM5RSxRQUFRLEVBQUUsQ0FBQyxlQUFlLENBQUM7NkJBQzNCOzRCQUNEO2dDQUNDLElBQUksRUFBRSx3RUFBd0U7Z0NBQzlFLFFBQVEsRUFBRSxDQUFDLGVBQWUsQ0FBQzs2QkFDM0I7NEJBQ0Q7Z0NBQ0MsSUFBSSxFQUFFLDREQUE0RDtnQ0FDbEUsUUFBUSxFQUFFLENBQUMsaUJBQWlCLENBQUM7NkJBQzdCOzRCQUNEO2dDQUNDLElBQUksRUFBRSw0REFBNEQ7Z0NBQ2xFLFFBQVEsRUFBRSxDQUFDLGFBQWEsQ0FBQzs2QkFDekI7NEJBQ0Q7Z0NBQ0MsSUFBSSxFQUFFLGlFQUFpRTtnQ0FDdkUsUUFBUSxFQUFFLENBQUMsZUFBZSxDQUFDOzZCQUMzQjs0QkFDRDtnQ0FDQyxJQUFJLEVBQUUsc0RBQXNEO2dDQUM1RCxRQUFRLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQzs2QkFDN0I7eUJBQ0QsQ0FBQyxDQUFDO3dCQUNILE1BQU0sT0FBTyxHQUFHLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO3dCQUV4RSxhQUFhLENBQ1osTUFBTSxPQUFPLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQyxNQUFNLEVBQUUsY0FBYyxDQUFDLEtBQUssRUFBRSxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsRUFDekY7NEJBQ0Msd0RBQXdEOzRCQUN4RCxxRUFBcUU7NEJBQ3JFLHdFQUF3RTs0QkFDeEUsd0VBQXdFOzRCQUN4RSxJQUFJOzRCQUNKLDREQUE0RDs0QkFDNUQsaUVBQWlFO3lCQUNqRSxFQUNELDRCQUE0QixDQUM1QixDQUFDO29CQUVILENBQUM7Z0JBQ0YsQ0FBQyxDQUFDLENBQUM7Z0JBRUgsS0FBSyxDQUFDLFVBQVUsRUFBRSxLQUFLLElBQUksRUFBRTtvQkFDNUIsTUFBTSxZQUFZLEdBQUc7d0JBQ3BCOzRCQUNDLDJDQUEyQzs0QkFDM0MseUNBQXlDOzRCQUN6Qyx1Q0FBdUM7eUJBQ3ZDO3dCQUNEOzRCQUNDLDJDQUEyQzs0QkFDM0MsbURBQW1EOzRCQUNuRCxpREFBaUQ7eUJBQ2pEO3dCQUNEOzRCQUNDLHFDQUFxQzs0QkFDckMsNENBQTRDOzRCQUM1QywwQ0FBMEM7eUJBQzFDO3dCQUNEOzRCQUNDLHFDQUFxQzs0QkFDckMsd0NBQXdDOzRCQUN4QywwQ0FBMEM7NEJBQzFDLHNDQUFzQzs0QkFDdEMsd0NBQXdDO3lCQUN4Qzt3QkFDRDs0QkFDQywyQ0FBMkM7NEJBQzNDLGlEQUFpRDs0QkFDakQsb0RBQW9EOzRCQUNwRCxvREFBb0Q7NEJBQ3BELCtDQUErQzs0QkFDL0Msb0RBQW9EO3lCQUNwRDt3QkFDRDs0QkFDQyxtREFBbUQ7NEJBQ25ELGlEQUFpRDs0QkFDakQsK0NBQStDO3lCQUMvQzt3QkFDRDs0QkFDQyxtREFBbUQ7NEJBQ25ELDJEQUEyRDs0QkFDM0QseURBQXlEO3lCQUN6RDt3QkFDRDs0QkFDQyw2Q0FBNkM7NEJBQzdDLG9EQUFvRDs0QkFDcEQsa0RBQWtEO3lCQUNsRDt3QkFDRDs0QkFDQyw2Q0FBNkM7NEJBQzdDLGdEQUFnRDs0QkFDaEQsa0RBQWtEOzRCQUNsRCw4Q0FBOEM7NEJBQzlDLGdEQUFnRDt5QkFDaEQ7d0JBQ0Q7NEJBQ0MsbURBQW1EOzRCQUNuRCx5REFBeUQ7NEJBQ3pELDREQUE0RDs0QkFDNUQsNERBQTREOzRCQUM1RCx1REFBdUQ7NEJBQ3ZELDREQUE0RDt5QkFDNUQ7d0JBQ0Q7NEJBQ0Msd0RBQXdEOzRCQUN4RCxxRUFBcUU7NEJBQ3JFLHdFQUF3RTs0QkFDeEUsd0VBQXdFOzRCQUN4RSw0REFBNEQ7NEJBQzVELGlFQUFpRTt5QkFDakU7d0JBQ0Q7NEJBQ0Msd0RBQXdEOzRCQUN4RCw2REFBNkQ7NEJBQzdELG9EQUFvRDt5QkFDcEQ7d0JBQ0Q7NEJBQ0Msd0RBQXdEOzRCQUN4RCxpRUFBaUU7NEJBQ2pFLG9FQUFvRTs0QkFDcEUsb0VBQW9FOzRCQUNwRSw2Q0FBNkM7eUJBQzdDO3dCQUNEOzRCQUNDLDREQUE0RDs0QkFDNUQsMERBQTBEOzRCQUMxRCx3REFBd0Q7eUJBQ3hEO3dCQUNEOzRCQUNDLDREQUE0RDs0QkFDNUQsb0VBQW9FOzRCQUNwRSxrRUFBa0U7eUJBQ2xFO3dCQUNEOzRCQUNDLHNEQUFzRDs0QkFDdEQsNkRBQTZEOzRCQUM3RCwyREFBMkQ7eUJBQzNEO3dCQUNEOzRCQUNDLHNEQUFzRDs0QkFDdEQseURBQXlEOzRCQUN6RCwyREFBMkQ7NEJBQzNELHVEQUF1RDs0QkFDdkQseURBQXlEO3lCQUN6RDt3QkFDRDs0QkFDQyw0REFBNEQ7NEJBQzVELGtFQUFrRTs0QkFDbEUscUVBQXFFOzRCQUNyRSxxRUFBcUU7NEJBQ3JFLGdFQUFnRTs0QkFDaEUscUVBQXFFO3lCQUNyRTt3QkFDRDs0QkFDQyxrRkFBa0Y7NEJBQ2xGLGdGQUFnRjs0QkFDaEYsOEVBQThFO3lCQUM5RTt3QkFDRDs0QkFDQyxrRkFBa0Y7NEJBQ2xGLDBGQUEwRjs0QkFDMUYsd0ZBQXdGO3lCQUN4Rjt3QkFDRDs0QkFDQyw0RUFBNEU7NEJBQzVFLG1GQUFtRjs0QkFDbkYsaUZBQWlGO3lCQUNqRjt3QkFDRDs0QkFDQyw0RUFBNEU7NEJBQzVFLCtFQUErRTs0QkFDL0UsaUZBQWlGOzRCQUNqRiw2RUFBNkU7NEJBQzdFLCtFQUErRTt5QkFDL0U7d0JBQ0Q7NEJBQ0Msa0ZBQWtGOzRCQUNsRix3RkFBd0Y7NEJBQ3hGLDJGQUEyRjs0QkFDM0YsMkZBQTJGOzRCQUMzRixzRkFBc0Y7NEJBQ3RGLDJGQUEyRjt5QkFDM0Y7cUJBQ0QsQ0FBQztvQkFFRixLQUFLLE1BQU0sUUFBUSxJQUFJLFlBQVksRUFBRSxDQUFDO3dCQUNyQyxNQUFNLGNBQWMsR0FBNEIsRUFBRSxDQUFDO3dCQUNuRCxLQUFLLE1BQU0sT0FBTyxJQUFJLFFBQVEsRUFBRSxDQUFDOzRCQUNoQyxjQUFjLENBQUMsT0FBTyxDQUFDLEdBQUcsSUFBSSxDQUFDO3dCQUNoQyxDQUFDO3dCQUVELFlBQVksQ0FBQyxjQUFjLENBQUMsQ0FBQzt3QkFDN0IsbUJBQW1CLENBQUM7NEJBQ25CLGtDQUFrQzs0QkFDbEMsbUNBQW1DO3lCQUNuQyxDQUFDLENBQUM7d0JBQ0gsTUFBTSxTQUFTLENBQUMsV0FBVyxFQUFFOzRCQUM1QjtnQ0FDQyxJQUFJLEVBQUUsd0RBQXdEO2dDQUM5RCxRQUFRLEVBQUUsQ0FBQyxhQUFhLENBQUM7NkJBQ3pCOzRCQUNEO2dDQUNDLElBQUksRUFBRSxxRUFBcUU7Z0NBQzNFLFFBQVEsRUFBRSxDQUFDLGFBQWEsQ0FBQzs2QkFDekI7NEJBQ0Q7Z0NBQ0MsSUFBSSxFQUFFLHdFQUF3RTtnQ0FDOUUsUUFBUSxFQUFFLENBQUMsZUFBZSxDQUFDOzZCQUMzQjs0QkFDRDtnQ0FDQyxJQUFJLEVBQUUsd0VBQXdFO2dDQUM5RSxRQUFRLEVBQUUsQ0FBQyxlQUFlLENBQUM7NkJBQzNCOzRCQUNEO2dDQUNDLElBQUksRUFBRSw0REFBNEQ7Z0NBQ2xFLFFBQVEsRUFBRSxDQUFDLGlCQUFpQixDQUFDOzZCQUM3Qjs0QkFDRDtnQ0FDQyxJQUFJLEVBQUUsNERBQTREO2dDQUNsRSxRQUFRLEVBQUUsQ0FBQyxhQUFhLENBQUM7NkJBQ3pCOzRCQUNEO2dDQUNDLElBQUksRUFBRSxpRUFBaUU7Z0NBQ3ZFLFFBQVEsRUFBRSxDQUFDLGVBQWUsQ0FBQzs2QkFDM0I7NEJBQ0Q7Z0NBQ0MsSUFBSSxFQUFFLHNEQUFzRDtnQ0FDNUQsUUFBUSxFQUFFLENBQUMsaUJBQWlCLENBQUM7NkJBQzdCO3lCQUNELENBQUMsQ0FBQzt3QkFDSCxNQUFNLE9BQU8sR0FBRyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsa0JBQWtCLENBQUMsQ0FBQzt3QkFFeEUsYUFBYSxDQUNaLE1BQU0sT0FBTyxDQUFDLFNBQVMsQ0FBQyxXQUFXLENBQUMsTUFBTSxFQUFFLGNBQWMsQ0FBQyxLQUFLLEVBQUUsaUJBQWlCLENBQUMsSUFBSSxDQUFDLEVBQ3pGOzRCQUNDLHdEQUF3RDs0QkFDeEQscUVBQXFFOzRCQUNyRSx3RUFBd0U7NEJBQ3hFLHdFQUF3RTs0QkFDeEUsSUFBSTs0QkFDSiw0REFBNEQ7NEJBQzVELGlFQUFpRTt5QkFDakUsRUFDRCw0QkFBNEIsQ0FDNUIsQ0FBQztvQkFFSCxDQUFDO2dCQUNGLENBQUMsQ0FBQyxDQUFDO1lBQ0osQ0FBQyxDQUFDLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsS0FBSyxDQUFDLGNBQWMsRUFBRSxHQUFHLEVBQUU7UUFDMUIsS0FBSyxDQUFDLG9FQUFvRSxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQ3RGLFlBQVksQ0FBQztnQkFDWixzQkFBc0IsRUFBRSxJQUFJO2dCQUM1QixlQUFlLEVBQUUsS0FBSztnQkFDdEIseUJBQXlCLEVBQUUsS0FBSzthQUNoQyxDQUFDLENBQUM7WUFDSCxtQkFBbUIsQ0FBQyxDQUFDLGtDQUFrQyxDQUFDLENBQUMsQ0FBQztZQUMxRCxNQUFNLFNBQVMsQ0FBQyxXQUFXLEVBQUU7Z0JBQzVCO29CQUNDLElBQUksRUFBRSw0RUFBNEU7b0JBQ2xGLFFBQVEsRUFBRSxDQUFDLG1CQUFtQixDQUFDO2lCQUMvQjtnQkFDRDtvQkFDQyxJQUFJLEVBQUUsc0ZBQXNGO29CQUM1RixRQUFRLEVBQUUsQ0FBQyxvQkFBb0IsQ0FBQztpQkFDaEM7Z0JBQ0Q7b0JBQ0MsSUFBSSxFQUFFLG9GQUFvRjtvQkFDMUYsUUFBUSxFQUFFLENBQUMsa0JBQWtCLENBQUM7aUJBQzlCO2dCQUNEO29CQUNDLElBQUksRUFBRSxtRkFBbUY7b0JBQ3pGLFFBQVEsRUFBRSxDQUFDLGtCQUFrQixDQUFDO2lCQUM5QjthQUNELENBQUMsQ0FBQztZQUNILE1BQU0sT0FBTyxHQUFHLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1lBRXhFLGFBQWEsQ0FDWixNQUFNLE9BQU8sQ0FBQyxTQUFTLENBQUMsV0FBVyxDQUFDLFlBQVksRUFBRSxjQUFjLENBQUMsS0FBSyxFQUFFLGlCQUFpQixDQUFDLElBQUksQ0FBQyxFQUMvRjtnQkFDQyw0RUFBNEU7Z0JBQzVFLHNGQUFzRjtnQkFDdEYsb0ZBQW9GO2dCQUNwRixtRkFBbUY7YUFDbkYsRUFDRCxxRkFBcUYsQ0FDckYsQ0FBQztRQUNILENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxLQUFLLENBQUMsUUFBUSxFQUFFLEdBQUcsRUFBRTtRQUNwQixLQUFLLENBQUMsaUJBQWlCLEVBQUUsR0FBRyxFQUFFO1lBQzdCLEtBQUssQ0FBQywyQ0FBMkMsRUFBRSxLQUFLLElBQUksRUFBRTtnQkFDN0QsWUFBWSxDQUFDO29CQUNaLGdCQUFnQixFQUFFLElBQUk7b0JBQ3RCLHlCQUF5QjtvQkFDekIsZ0JBQWdCLEVBQUUsS0FBSztvQkFDdkIsbUJBQW1CLEVBQUUsS0FBSztvQkFDMUIsa0JBQWtCLEVBQUUsS0FBSztpQkFDekIsQ0FBQyxDQUFDO2dCQUNILG1CQUFtQixDQUFDLENBQUMsa0NBQWtDLENBQUMsQ0FBQyxDQUFDO2dCQUMxRCxNQUFNLFNBQVMsQ0FBQyxXQUFXLEVBQUU7b0JBQzVCO3dCQUNDLElBQUksRUFBRSwrREFBK0Q7d0JBQ3JFLFFBQVEsRUFBRSxDQUFDLGNBQWMsQ0FBQztxQkFDMUI7b0JBQ0Q7d0JBQ0MsSUFBSSxFQUFFLGdFQUFnRTt3QkFDdEUsUUFBUSxFQUFFLENBQUMsZUFBZSxDQUFDO3FCQUMzQjtpQkFDRCxDQUFDLENBQUM7Z0JBQ0gsTUFBTSxPQUFPLEdBQUcsb0JBQW9CLENBQUMsY0FBYyxDQUFDLGtCQUFrQixDQUFDLENBQUM7Z0JBRXhFLE1BQU0sTUFBTSxHQUFHLE1BQU0sT0FBTyxDQUFDLGVBQWUsQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDckUsYUFBYSxDQUNaLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLEVBQ3RCO29CQUNDLCtEQUErRDtvQkFDL0QsZ0VBQWdFO2lCQUNoRSxFQUNELHdCQUF3QixDQUN4QixDQUFDO1lBQ0gsQ0FBQyxDQUFDLENBQUM7WUFFSCxLQUFLLENBQUMsa0NBQWtDLEVBQUUsS0FBSyxJQUFJLEVBQUU7Z0JBQ3BELFlBQVksQ0FBQztvQkFDWixnQkFBZ0IsRUFBRSxJQUFJO29CQUN0Qix5QkFBeUI7b0JBQ3pCLGdCQUFnQixFQUFFLEtBQUs7b0JBQ3ZCLG1CQUFtQixFQUFFLEtBQUs7b0JBQzFCLGtCQUFrQixFQUFFLEtBQUs7aUJBQ3pCLENBQUMsQ0FBQztnQkFDSCxtQkFBbUIsQ0FBQyxDQUFDLGtDQUFrQyxDQUFDLENBQUMsQ0FBQztnQkFDMUQsTUFBTSxTQUFTLENBQUMsV0FBVyxFQUFFO29CQUM1Qjt3QkFDQyxJQUFJLEVBQUUsc0VBQXNFO3dCQUM1RSxRQUFRLEVBQUUsQ0FBQyxlQUFlLENBQUM7cUJBQzNCO29CQUNEO3dCQUNDLElBQUksRUFBRSx5RUFBeUU7d0JBQy9FLFFBQVEsRUFBRSxDQUFDLGtCQUFrQixDQUFDO3FCQUM5QjtvQkFDRDt3QkFDQyxJQUFJLEVBQUUsMEVBQTBFO3dCQUNoRixRQUFRLEVBQUUsQ0FBQyw0QkFBNEIsQ0FBQztxQkFDeEM7aUJBQ0QsQ0FBQyxDQUFDO2dCQUNILE1BQU0sT0FBTyxHQUFHLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO2dCQUV4RSxNQUFNLE1BQU0sR0FBRyxNQUFNLE9BQU8sQ0FBQyxlQUFlLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ3JFLGFBQWEsQ0FDWixNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxFQUN0QjtvQkFDQyxzRUFBc0U7aUJBQ3RFLEVBQ0QsdUNBQXVDLENBQ3ZDLENBQUM7WUFDSCxDQUFDLENBQUMsQ0FBQztZQUVILEtBQUssQ0FBQywwQ0FBMEMsRUFBRSxLQUFLLElBQUksRUFBRTtnQkFDNUQsWUFBWSxDQUFDO29CQUNaLGdCQUFnQixFQUFFLElBQUk7b0JBQ3RCLHlCQUF5QjtvQkFDekIsZ0JBQWdCLEVBQUUsS0FBSztvQkFDdkIsbUJBQW1CLEVBQUUsS0FBSztvQkFDMUIsa0JBQWtCLEVBQUUsS0FBSztpQkFDekIsQ0FBQyxDQUFDO2dCQUNILG1CQUFtQixDQUFDLENBQUMsa0NBQWtDLENBQUMsQ0FBQyxDQUFDO2dCQUMxRCxNQUFNLFNBQVMsQ0FBQyxXQUFXLEVBQUUsRUFBRSxDQUFDLENBQUM7Z0JBQ2pDLE1BQU0sT0FBTyxHQUFHLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO2dCQUV4RSxNQUFNLE1BQU0sR0FBRyxNQUFNLE9BQU8sQ0FBQyxlQUFlLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ3JFLGFBQWEsQ0FDWixNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxFQUN0QixFQUFFLEVBQ0YsK0NBQStDLENBQy9DLENBQUM7WUFDSCxDQUFDLENBQUMsQ0FBQztZQUVILEtBQUssQ0FBQyxzREFBc0QsRUFBRSxLQUFLLElBQUksRUFBRTtnQkFDeEUsWUFBWSxDQUFDO29CQUNaLGdCQUFnQixFQUFFLElBQUk7b0JBQ3RCLHlCQUF5QjtvQkFDekIsZ0JBQWdCLEVBQUUsS0FBSztvQkFDdkIsbUJBQW1CLEVBQUUsS0FBSztvQkFDMUIsa0JBQWtCLEVBQUUsS0FBSztpQkFDekIsQ0FBQyxDQUFDO2dCQUNILG1CQUFtQixDQUFDLENBQUMsa0NBQWtDLENBQUMsQ0FBQyxDQUFDO2dCQUMxRCxNQUFNLFNBQVMsQ0FBQyxXQUFXLEVBQUUsRUFBRSxDQUFDLENBQUM7Z0JBQ2pDLE1BQU0sT0FBTyxHQUFHLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO2dCQUV4RSxNQUFNLE1BQU0sR0FBRyxNQUFNLE9BQU8sQ0FBQyxlQUFlLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ3JFLGFBQWEsQ0FDWixNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxFQUN0QixFQUFFLEVBQ0YscURBQXFELENBQ3JELENBQUM7WUFDSCxDQUFDLENBQUMsQ0FBQztZQUVILEtBQUssQ0FBQyxnREFBZ0QsRUFBRSxLQUFLLElBQUksRUFBRTtnQkFDbEUsWUFBWSxDQUFDO29CQUNaLGdCQUFnQixFQUFFLElBQUk7b0JBQ3RCLHlCQUF5QjtvQkFDekIsZ0JBQWdCLEVBQUUsS0FBSztvQkFDdkIsbUJBQW1CLEVBQUUsS0FBSztvQkFDMUIsa0JBQWtCLEVBQUUsS0FBSztpQkFDekIsQ0FBQyxDQUFDO2dCQUNILG1CQUFtQixDQUFDO29CQUNuQixrQ0FBa0M7b0JBQ2xDLGdDQUFnQztpQkFDaEMsQ0FBQyxDQUFDO2dCQUNILE1BQU0sU0FBUyxDQUFDLFdBQVcsRUFBRTtvQkFDNUI7d0JBQ0MsSUFBSSxFQUFFLGtFQUFrRTt3QkFDeEUsUUFBUSxFQUFFLENBQUMsV0FBVyxDQUFDO3FCQUN2QjtvQkFDRDt3QkFDQyxJQUFJLEVBQUUsZ0VBQWdFO3dCQUN0RSxRQUFRLEVBQUUsQ0FBQyxXQUFXLENBQUM7cUJBQ3ZCO2lCQUNELENBQUMsQ0FBQztnQkFDSCxNQUFNLE9BQU8sR0FBRyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsa0JBQWtCLENBQUMsQ0FBQztnQkFFeEUsTUFBTSxNQUFNLEdBQUcsTUFBTSxPQUFPLENBQUMsZUFBZSxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUNyRSxhQUFhLENBQ1osTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsRUFDdEI7b0JBQ0Msa0VBQWtFO29CQUNsRSxnRUFBZ0U7aUJBQ2hFLEVBQ0QsZ0RBQWdELENBQ2hELENBQUM7WUFDSCxDQUFDLENBQUMsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDO1FBRUgsS0FBSyxDQUFDLGtDQUFrQyxFQUFFLEdBQUcsRUFBRTtZQUM5QyxLQUFLLENBQUMsZ0RBQWdELEVBQUUsS0FBSyxJQUFJLEVBQUU7Z0JBQ2xFLFlBQVksQ0FBQztvQkFDWixnQkFBZ0IsRUFBRSxLQUFLO29CQUN2Qix5QkFBeUI7b0JBQ3pCLGdCQUFnQixFQUFFLEtBQUs7b0JBQ3ZCLG1CQUFtQixFQUFFLEtBQUs7b0JBQzFCLGtCQUFrQixFQUFFLEtBQUs7aUJBQ3pCLENBQUMsQ0FBQztnQkFDSCxtQkFBbUIsQ0FBQyxDQUFDLGtDQUFrQyxDQUFDLENBQUMsQ0FBQztnQkFDMUQsTUFBTSxTQUFTLENBQUMsV0FBVyxFQUFFO29CQUM1Qjt3QkFDQyxJQUFJLEVBQUUsK0RBQStEO3dCQUNyRSxRQUFRLEVBQUUsQ0FBQyxjQUFjLENBQUM7cUJBQzFCO2lCQUNELENBQUMsQ0FBQztnQkFDSCxNQUFNLE9BQU8sR0FBRyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsa0JBQWtCLENBQUMsQ0FBQztnQkFFeEUsTUFBTSxLQUFLLEdBQUcsTUFBTSxPQUFPLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQyxLQUFLLEVBQUUsY0FBYyxDQUFDLEtBQUssRUFBRSxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDdkcsYUFBYSxDQUNaLEtBQUssRUFDTCxFQUFFLEVBQ0YsaURBQWlELENBQ2pELENBQUM7WUFDSCxDQUFDLENBQUMsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDO1FBRUgsS0FBSyxDQUFDLDhDQUE4QyxFQUFFLEdBQUcsRUFBRTtZQUMxRCxLQUFLLENBQUMsc0VBQXNFLEVBQUUsS0FBSyxJQUFJLEVBQUU7Z0JBQ3hGLFlBQVksQ0FBQztvQkFDWixXQUFXLEVBQUUsSUFBSTtvQkFDakIsVUFBVSxFQUFFLElBQUk7b0JBQ2hCLFdBQVcsRUFBRSxJQUFJO29CQUNqQixtQkFBbUI7b0JBQ25CLGdCQUFnQixFQUFFLEtBQUs7b0JBQ3ZCLGdCQUFnQixFQUFFLEtBQUs7b0JBQ3ZCLGdCQUFnQixFQUFFLEtBQUs7b0JBQ3ZCLG1CQUFtQixFQUFFLEtBQUs7b0JBQzFCLGtCQUFrQixFQUFFLEtBQUs7b0JBQ3pCLGtCQUFrQixFQUFFLEtBQUs7aUJBQ3pCLENBQUMsQ0FBQztnQkFDSCxtQkFBbUIsQ0FBQyxDQUFDLGtDQUFrQyxDQUFDLENBQUMsQ0FBQztnQkFDMUQsTUFBTSxTQUFTLENBQUMsV0FBVyxFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUNqQyxNQUFNLE9BQU8sR0FBRyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsa0JBQWtCLENBQUMsQ0FBQztnQkFFeEUsTUFBTSxPQUFPLEdBQUcsTUFBTSxPQUFPLENBQUMsMkJBQTJCLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUM3RSxhQUFhLENBQ1osT0FBTyxFQUNQLEVBQUUsRUFDRiwyQ0FBMkMsQ0FDM0MsQ0FBQztZQUNILENBQUMsQ0FBQyxDQUFDO1lBRUgsS0FBSyxDQUFDLHVFQUF1RSxFQUFFLEtBQUssSUFBSSxFQUFFO2dCQUN6RixZQUFZLENBQUM7b0JBQ1osdUJBQXVCLEVBQUUsSUFBSTtvQkFDN0IsbUJBQW1CO29CQUNuQixnQkFBZ0IsRUFBRSxLQUFLO29CQUN2QixnQkFBZ0IsRUFBRSxLQUFLO29CQUN2QixnQkFBZ0IsRUFBRSxLQUFLO29CQUN2QixtQkFBbUIsRUFBRSxLQUFLO29CQUMxQixrQkFBa0IsRUFBRSxLQUFLO29CQUN6QixrQkFBa0IsRUFBRSxLQUFLO2lCQUN6QixDQUFDLENBQUM7Z0JBQ0gsbUJBQW1CLENBQUMsQ0FBQyxrQ0FBa0MsQ0FBQyxDQUFDLENBQUM7Z0JBQzFELE1BQU0sU0FBUyxDQUFDLFdBQVcsRUFBRSxFQUFFLENBQUMsQ0FBQztnQkFDakMsTUFBTSxPQUFPLEdBQUcsb0JBQW9CLENBQUMsY0FBYyxDQUFDLGtCQUFrQixDQUFDLENBQUM7Z0JBRXhFLE1BQU0sT0FBTyxHQUFHLE1BQU0sT0FBTyxDQUFDLDJCQUEyQixDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFDN0UsYUFBYSxDQUNaLE9BQU8sRUFDUCxFQUFFLEVBQ0YsNENBQTRDLENBQzVDLENBQUM7WUFDSCxDQUFDLENBQUMsQ0FBQztZQUVILEtBQUssQ0FBQyx1RUFBdUUsRUFBRSxLQUFLLElBQUksRUFBRTtnQkFDekYsWUFBWSxDQUFDO29CQUNaLGFBQWEsRUFBRSxJQUFJO29CQUNuQixlQUFlLEVBQUUsSUFBSTtvQkFDckIsbUJBQW1CO29CQUNuQixnQkFBZ0IsRUFBRSxLQUFLO29CQUN2QixnQkFBZ0IsRUFBRSxLQUFLO29CQUN2QixnQkFBZ0IsRUFBRSxLQUFLO29CQUN2QixtQkFBbUIsRUFBRSxLQUFLO29CQUMxQixrQkFBa0IsRUFBRSxLQUFLO29CQUN6QixrQkFBa0IsRUFBRSxLQUFLO2lCQUN6QixDQUFDLENBQUM7Z0JBQ0gsbUJBQW1CLENBQUMsQ0FBQyxrQ0FBa0MsQ0FBQyxDQUFDLENBQUM7Z0JBQzFELE1BQU0sU0FBUyxDQUFDLFdBQVcsRUFBRSxFQUFFLENBQUMsQ0FBQztnQkFDakMsTUFBTSxPQUFPLEdBQUcsb0JBQW9CLENBQUMsY0FBYyxDQUFDLGtCQUFrQixDQUFDLENBQUM7Z0JBRXhFLE1BQU0sT0FBTyxHQUFHLE1BQU0sT0FBTyxDQUFDLDJCQUEyQixDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFDN0UsYUFBYSxDQUNaLE9BQU8sRUFDUDtvQkFDQyw0Q0FBNEM7b0JBQzVDLGdEQUFnRDtpQkFDaEQsRUFDRCw0Q0FBNEMsQ0FDNUMsQ0FBQztZQUNILENBQUMsQ0FBQyxDQUFDO1lBRUgsS0FBSyxDQUFDLDZFQUE2RSxFQUFFLEtBQUssSUFBSSxFQUFFO2dCQUMvRixZQUFZLENBQUM7b0JBQ1osa0JBQWtCLEVBQUUsSUFBSTtvQkFDeEIsbUJBQW1CO29CQUNuQixnQkFBZ0IsRUFBRSxLQUFLO29CQUN2QixnQkFBZ0IsRUFBRSxLQUFLO29CQUN2QixnQkFBZ0IsRUFBRSxLQUFLO29CQUN2QixtQkFBbUIsRUFBRSxLQUFLO29CQUMxQixrQkFBa0IsRUFBRSxLQUFLO29CQUN6QixrQkFBa0IsRUFBRSxLQUFLO2lCQUN6QixDQUFDLENBQUM7Z0JBQ0gsbUJBQW1CLENBQUMsQ0FBQyxrQ0FBa0MsQ0FBQyxDQUFDLENBQUM7Z0JBQzFELE1BQU0sU0FBUyxDQUFDLFdBQVcsRUFBRSxFQUFFLENBQUMsQ0FBQztnQkFDakMsTUFBTSxPQUFPLEdBQUcsb0JBQW9CLENBQUMsY0FBYyxDQUFDLGtCQUFrQixDQUFDLENBQUM7Z0JBRXhFLE1BQU0sT0FBTyxHQUFHLE1BQU0sT0FBTyxDQUFDLDJCQUEyQixDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFDN0UsYUFBYSxDQUNaLE9BQU8sRUFDUDtvQkFDQyx5Q0FBeUM7aUJBQ3pDLEVBQ0Qsa0RBQWtELENBQ2xELENBQUM7WUFDSCxDQUFDLENBQUMsQ0FBQztZQUVILEtBQUssQ0FBQywwQ0FBMEMsRUFBRSxLQUFLLElBQUksRUFBRTtnQkFDNUQsWUFBWSxDQUFDO29CQUNaLGFBQWEsRUFBRSxJQUFJO29CQUNuQixtQkFBbUI7b0JBQ25CLGdCQUFnQixFQUFFLEtBQUs7b0JBQ3ZCLGdCQUFnQixFQUFFLEtBQUs7b0JBQ3ZCLGdCQUFnQixFQUFFLEtBQUs7b0JBQ3ZCLG1CQUFtQixFQUFFLEtBQUs7b0JBQzFCLGtCQUFrQixFQUFFLEtBQUs7b0JBQ3pCLGtCQUFrQixFQUFFLEtBQUs7aUJBQ3pCLENBQUMsQ0FBQztnQkFDSCxtQkFBbUIsQ0FBQyxDQUFDLGtDQUFrQyxDQUFDLENBQUMsQ0FBQztnQkFDMUQsTUFBTSxTQUFTLENBQUMsV0FBVyxFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUNqQyxNQUFNLE9BQU8sR0FBRyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsa0JBQWtCLENBQUMsQ0FBQztnQkFFeEUsTUFBTSxPQUFPLEdBQUcsTUFBTSxPQUFPLENBQUMsMkJBQTJCLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUM3RSxhQUFhLENBQ1osT0FBTyxFQUNQO29CQUNDLCtCQUErQjtpQkFDL0IsRUFDRCwrQ0FBK0MsQ0FDL0MsQ0FBQztZQUNILENBQUMsQ0FBQyxDQUFDO1FBQ0osQ0FBQyxDQUFDLENBQUM7UUFFSCxLQUFLLENBQUMsd0NBQXdDLEVBQUUsR0FBRyxFQUFFO1lBQ3BELEtBQUssQ0FBQyxnREFBZ0QsRUFBRSxLQUFLLElBQUksRUFBRTtnQkFDbEUsWUFBWSxDQUFDO29CQUNaLGdCQUFnQixFQUFFLElBQUk7b0JBQ3RCLGVBQWUsRUFBRSxJQUFJO29CQUNyQixnRUFBZ0U7b0JBQ2hFLGdCQUFnQixFQUFFLEtBQUs7b0JBQ3ZCLGdCQUFnQixFQUFFLEtBQUs7b0JBQ3ZCLG1CQUFtQixFQUFFLEtBQUs7b0JBQzFCLGtCQUFrQixFQUFFLEtBQUs7b0JBQ3pCLGtCQUFrQixFQUFFLEtBQUs7aUJBQ3pCLENBQUMsQ0FBQztnQkFDSCxtQkFBbUIsQ0FBQztvQkFDbkIsa0NBQWtDO29CQUNsQyxnQ0FBZ0M7aUJBQ2hDLENBQUMsQ0FBQztnQkFDSCxNQUFNLFNBQVMsQ0FBQyxXQUFXLEVBQUUsRUFBRSxDQUFDLENBQUM7Z0JBQ2pDLE1BQU0sT0FBTyxHQUFHLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO2dCQUV4RSxNQUFNLE9BQU8sR0FBRyxNQUFNLE9BQU8sQ0FBQywyQkFBMkIsQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBQzdFLGFBQWEsQ0FDWixPQUFPLEVBQ1A7b0JBQ0MsaURBQWlEO29CQUNqRCwrQ0FBK0M7b0JBQy9DLGdEQUFnRDtvQkFDaEQsOENBQThDO2lCQUM5QyxFQUNELDJEQUEyRCxDQUMzRCxDQUFDO1lBQ0gsQ0FBQyxDQUFDLENBQUM7WUFFSCxLQUFLLENBQUMscURBQXFELEVBQUUsS0FBSyxJQUFJLEVBQUU7Z0JBQ3ZFLFlBQVksQ0FBQztvQkFDWixnQkFBZ0IsRUFBRSxJQUFJO29CQUN0QixXQUFXLEVBQUUsSUFBSSxFQUFFLGdDQUFnQztvQkFDbkQsa0JBQWtCLEVBQUUsSUFBSSxFQUFFLG9DQUFvQztvQkFDOUQsZ0VBQWdFO29CQUNoRSxnQkFBZ0IsRUFBRSxLQUFLO29CQUN2QixnQkFBZ0IsRUFBRSxLQUFLO29CQUN2QixtQkFBbUIsRUFBRSxLQUFLO29CQUMxQixrQkFBa0IsRUFBRSxLQUFLO29CQUN6QixrQkFBa0IsRUFBRSxLQUFLO2lCQUN6QixDQUFDLENBQUM7Z0JBQ0gsbUJBQW1CLENBQUMsQ0FBQyxrQ0FBa0MsQ0FBQyxDQUFDLENBQUM7Z0JBQzFELE1BQU0sU0FBUyxDQUFDLFdBQVcsRUFBRSxFQUFFLENBQUMsQ0FBQztnQkFDakMsTUFBTSxPQUFPLEdBQUcsb0JBQW9CLENBQUMsY0FBYyxDQUFDLGtCQUFrQixDQUFDLENBQUM7Z0JBRXhFLE1BQU0sT0FBTyxHQUFHLE1BQU0sT0FBTyxDQUFDLDJCQUEyQixDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFDN0UsYUFBYSxDQUNaLE9BQU8sRUFDUDtvQkFDQyxpREFBaUQ7aUJBQ2pELEVBQ0Qsc0NBQXNDLENBQ3RDLENBQUM7WUFDSCxDQUFDLENBQUMsQ0FBQztZQUVILEtBQUssQ0FBQyxxREFBcUQsRUFBRSxLQUFLLElBQUksRUFBRTtnQkFDdkUsWUFBWSxDQUFDO29CQUNaLGVBQWUsRUFBRSxJQUFJO2lCQUNyQixDQUFDLENBQUM7Z0JBQ0gsbUJBQW1CLENBQUMsQ0FBQyxrQ0FBa0MsQ0FBQyxDQUFDLENBQUM7Z0JBQzFELE1BQU0sU0FBUyxDQUFDLFdBQVcsRUFBRSxFQUFFLENBQUMsQ0FBQztnQkFDakMsTUFBTSxPQUFPLEdBQUcsb0JBQW9CLENBQUMsY0FBYyxDQUFDLGtCQUFrQixDQUFDLENBQUM7Z0JBRXhFLE1BQU0sT0FBTyxHQUFHLE1BQU0sT0FBTyxDQUFDLDJCQUEyQixDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFDN0UsYUFBYSxDQUNaLE9BQU8sRUFDUDtvQkFDQyxXQUFXO29CQUNYLGlEQUFpRDtvQkFDakQsaURBQWlEO29CQUNqRCxpREFBaUQ7b0JBQ2pELHFDQUFxQztvQkFDckMsb0NBQW9DO29CQUNwQyxvQ0FBb0M7b0JBQ3BDLFNBQVM7b0JBQ1QsZ0RBQWdEO2lCQUNoRCxFQUNELDRDQUE0QyxDQUM1QyxDQUFDO1lBQ0gsQ0FBQyxDQUFDLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsS0FBSyxDQUFDLGFBQWEsRUFBRSxHQUFHLEVBQUU7UUFDekIsS0FBSyxDQUFDLGdCQUFnQixFQUFFLEtBQUssSUFBSSxFQUFFO1lBQ2xDLE1BQU0sS0FBSyxHQUFHO2dCQUNiLElBQUk7Z0JBQ0osSUFBSTtnQkFDSixLQUFLO2dCQUNMLE1BQU07Z0JBQ04sZ0JBQWdCO2dCQUNoQixvQ0FBb0M7Z0JBQ3BDLGlDQUFpQztnQkFDakMsdUJBQXVCO2dCQUN2Qix3Q0FBd0M7Z0JBQ3hDLDJDQUEyQztnQkFDM0MsMENBQTBDO2dCQUMxQyx3Q0FBd0M7Z0JBQ3hDLHFDQUFxQztnQkFDckMsdUNBQXVDO2dCQUN2QyxvQ0FBb0M7Z0JBQ3BDLHVDQUF1QztnQkFDdkMsc0NBQXNDO2dCQUN0QyxtREFBbUQ7Z0JBQ25ELDRCQUE0QjtnQkFDNUIsNkJBQTZCO2dCQUM3QiwwQkFBMEI7Z0JBQzFCLGdCQUFnQjtnQkFDaEIsaUJBQWlCO2dCQUNqQixrQkFBa0I7YUFDbEIsQ0FBQztZQUVGLEtBQUssTUFBTSxJQUFJLElBQUksS0FBSyxFQUFFLENBQUM7Z0JBQzFCLE1BQU0sQ0FDTCxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsS0FBSyxJQUFJLENBQUMsRUFDNUIsSUFBSSxJQUFJLG1DQUFtQyxDQUMzQyxDQUFDO1lBQ0gsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDO1FBRUgsS0FBSyxDQUFDLGtCQUFrQixFQUFFLEtBQUssSUFBSSxFQUFFO1lBQ3BDLE1BQU0sS0FBSyxHQUFHO2dCQUNiLEdBQUc7Z0JBQ0gsS0FBSztnQkFDTCxLQUFLO2dCQUNMLFdBQVc7Z0JBQ1gsWUFBWTtnQkFDWixZQUFZO2dCQUNaLGVBQWU7Z0JBQ2YsZUFBZTtnQkFDZixpQkFBaUI7Z0JBQ2pCLGNBQWM7Z0JBQ2QsY0FBYztnQkFDZCxpQkFBaUI7Z0JBQ2pCLGlCQUFpQjtnQkFDakIsbUJBQW1CO2dCQUNuQiwyQkFBMkI7Z0JBQzNCLGdDQUFnQztnQkFDaEMsZ0NBQWdDO2dCQUNoQyxtQ0FBbUM7Z0JBQ25DLG1DQUFtQztnQkFDbkMscUNBQXFDO2dCQUNyQyxrQ0FBa0M7Z0JBQ2xDLGtDQUFrQztnQkFDbEMscUNBQXFDO2dCQUNyQyxxQ0FBcUM7Z0JBQ3JDLHVDQUF1QzthQUN2QyxDQUFDO1lBRUYsS0FBSyxNQUFNLElBQUksSUFBSSxLQUFLLEVBQUUsQ0FBQztnQkFDMUIsTUFBTSxDQUNMLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxLQUFLLEtBQUssQ0FBQyxFQUM3QixJQUFJLElBQUksc0NBQXNDLENBQzlDLENBQUM7WUFDSCxDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILEtBQUssQ0FBQyxrQkFBa0IsRUFBRSxHQUFHLEVBQUU7UUFDOUIsS0FBSyxDQUFDLHdCQUF3QixFQUFFLEtBQUssSUFBSSxFQUFFO1lBQzFDLE1BQU0sVUFBVSxHQUFHO2dCQUNsQixZQUFZO2dCQUNaLGNBQWM7Z0JBQ2QsV0FBVztnQkFDWCxhQUFhO2dCQUNiLGtCQUFrQjtnQkFDbEIsb0JBQW9CO2FBQ3BCLENBQUM7WUFFRixLQUFLLE1BQU0sSUFBSSxJQUFJLFVBQVUsRUFBRSxDQUFDO2dCQUMvQixNQUFNLENBQUMsV0FBVyxDQUNqQix1QkFBdUIsQ0FBQyxJQUFJLENBQUMsRUFDN0IsSUFBSSxFQUNKLElBQUksSUFBSSwyREFBMkQsQ0FDbkUsQ0FBQztZQUNILENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQztRQUVILEtBQUssQ0FBQyx5QkFBeUIsRUFBRSxLQUFLLElBQUksRUFBRTtZQUMzQyxNQUFNLFVBQVUsR0FBRztnQkFDbEIsVUFBVTtnQkFDVixtQkFBbUI7Z0JBQ25CLGtCQUFrQjtnQkFDbEIsYUFBYTthQUNiLENBQUM7WUFFRixLQUFLLE1BQU0sSUFBSSxJQUFJLFVBQVUsRUFBRSxDQUFDO2dCQUMvQixNQUFNLENBQUMsV0FBVyxDQUNqQix1QkFBdUIsQ0FBQyxJQUFJLENBQUMsRUFDN0IsSUFBSSxFQUNKLElBQUksSUFBSSw0REFBNEQsQ0FDcEUsQ0FBQztZQUNILENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQztRQUVILEtBQUssQ0FBQyw2Q0FBNkMsRUFBRSxLQUFLLElBQUksRUFBRTtZQUMvRCxNQUFNLFVBQVUsR0FBRztnQkFDbEIsV0FBVztnQkFDWCxrQkFBa0I7Z0JBQ2xCLHFCQUFxQjtnQkFDckIsa0JBQWtCO2FBQ2xCLENBQUM7WUFFRixLQUFLLE1BQU0sSUFBSSxJQUFJLFVBQVUsRUFBRSxDQUFDO2dCQUMvQixNQUFNLENBQUMsV0FBVyxDQUNqQix1QkFBdUIsQ0FBQyxJQUFJLENBQUMsRUFDN0IsSUFBSSxFQUNKLElBQUksSUFBSSxrRUFBa0UsQ0FDMUUsQ0FBQztZQUNILENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQztRQUVILEtBQUssQ0FBQyx3QkFBd0IsRUFBRSxLQUFLLElBQUksRUFBRTtZQUMxQyxNQUFNLFlBQVksR0FBRztnQkFDcEIsc0JBQXNCO2dCQUN0Qix3QkFBd0I7Z0JBQ3hCLGdCQUFnQjtnQkFDaEIsbUJBQW1CO2dCQUNuQix5QkFBeUI7Z0JBQ3pCLG1CQUFtQjtnQkFDbkIsV0FBVztnQkFDWCxZQUFZO2FBQ1osQ0FBQztZQUVGLEtBQUssTUFBTSxJQUFJLElBQUksWUFBWSxFQUFFLENBQUM7Z0JBQ2pDLE1BQU0sQ0FBQyxXQUFXLENBQ2pCLHVCQUF1QixDQUFDLElBQUksQ0FBQyxFQUM3QixLQUFLLEVBQ0wsSUFBSSxJQUFJLG9FQUFvRSxDQUM1RSxDQUFDO1lBQ0gsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDO1FBRUgsS0FBSyxDQUFDLDRDQUE0QyxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQzlELE1BQU0sWUFBWSxHQUFHO2dCQUNwQixNQUFNO2dCQUNOLFNBQVM7Z0JBQ1QsVUFBVTtnQkFDViw2RUFBNkU7Z0JBQzdFLFdBQVc7Z0JBQ1gscUJBQXFCO2FBQ3JCLENBQUM7WUFFRixLQUFLLE1BQU0sSUFBSSxJQUFJLFlBQVksRUFBRSxDQUFDO2dCQUNqQyxNQUFNLENBQUMsV0FBVyxDQUNqQix1QkFBdUIsQ0FBQyxJQUFJLENBQUMsRUFDN0IsS0FBSyxFQUNMLElBQUksSUFBSSxnRUFBZ0UsQ0FDeEUsQ0FBQztZQUNILENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQztRQUVILEtBQUssQ0FBQyxnQ0FBZ0MsRUFBRSxLQUFLLElBQUksRUFBRTtZQUNsRCxNQUFNLFlBQVksR0FBRztnQkFDcEIsbUJBQW1CO2dCQUNuQixXQUFXO2dCQUNYLG9CQUFvQjtnQkFDcEIsb0JBQW9CO2FBQ3BCLENBQUM7WUFFRixLQUFLLE1BQU0sSUFBSSxJQUFJLFlBQVksRUFBRSxDQUFDO2dCQUNqQyxNQUFNLENBQUMsV0FBVyxDQUNqQix1QkFBdUIsQ0FBQyxJQUFJLENBQUMsRUFDN0IsS0FBSyxFQUNMLElBQUksSUFBSSxnRkFBZ0YsQ0FDeEYsQ0FBQztZQUNILENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQztRQUVILEtBQUssQ0FBQyx1QkFBdUIsRUFBRSxLQUFLLElBQUksRUFBRTtZQUN6QyxNQUFNLFlBQVksR0FBRztnQkFDcEIsVUFBVTtnQkFDVixXQUFXO2dCQUNYLFdBQVc7Z0JBQ1gsYUFBYTtnQkFDYixnQkFBZ0I7Z0JBQ2hCLGlCQUFpQjtnQkFDakIsY0FBYztnQkFDZCxTQUFTO2dCQUNULFlBQVk7Z0JBQ1osYUFBYTthQUNiLENBQUM7WUFFRixLQUFLLE1BQU0sSUFBSSxJQUFJLFlBQVksRUFBRSxDQUFDO2dCQUNqQyxNQUFNLENBQUMsV0FBVyxDQUNqQix1QkFBdUIsQ0FBQyxJQUFJLENBQUMsRUFDN0IsS0FBSyxFQUNMLElBQUksSUFBSSxtRUFBbUUsQ0FDM0UsQ0FBQztZQUNILENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQztRQUVILEtBQUssQ0FBQyxtQ0FBbUMsRUFBRSxLQUFLLElBQUksRUFBRTtZQUNyRCxNQUFNLFlBQVksR0FBRztnQkFDcEIsRUFBRTtnQkFDRixLQUFLO2dCQUNMLElBQUk7Z0JBQ0osSUFBSTthQUNKLENBQUM7WUFFRixLQUFLLE1BQU0sSUFBSSxJQUFJLFlBQVksRUFBRSxDQUFDO2dCQUNqQyxNQUFNLENBQUMsV0FBVyxDQUNqQix1QkFBdUIsQ0FBQyxJQUFJLENBQUMsRUFDN0IsS0FBSyxFQUNMLElBQUksSUFBSSxnREFBZ0QsQ0FDeEQsQ0FBQztZQUNILENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQztRQUVILEtBQUssQ0FBQywyQkFBMkIsRUFBRSxLQUFLLElBQUksRUFBRTtZQUM3QyxNQUFNLFVBQVUsR0FBRztnQkFDbEIsV0FBVztnQkFDWCxvQkFBb0I7Z0JBQ3BCLGFBQWE7Z0JBQ2Isa0JBQWtCO2FBQ2xCLENBQUM7WUFFRixLQUFLLE1BQU0sSUFBSSxJQUFJLFVBQVUsRUFBRSxDQUFDO2dCQUMvQixNQUFNLENBQUMsV0FBVyxDQUNqQix1QkFBdUIsQ0FBQyxJQUFJLENBQUMsRUFDN0IsSUFBSSxFQUNKLElBQUksSUFBSSxtREFBbUQsQ0FDM0QsQ0FBQztZQUNILENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsS0FBSyxDQUFDLGdCQUFnQixFQUFFLEdBQUcsRUFBRTtRQUM1QixLQUFLLENBQUMseUJBQXlCLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDM0MsTUFBTSxhQUFhLEdBQUc7Z0JBQ3JCLFVBQVU7Z0JBQ1YsYUFBYTtnQkFDYixNQUFNO2dCQUNOLFVBQVU7YUFDVixDQUFDO1lBRUYsS0FBSyxNQUFNLElBQUksSUFBSSxhQUFhLEVBQUUsQ0FBQztnQkFDbEMsTUFBTSxDQUFDLFdBQVcsQ0FDakIsY0FBYyxDQUFDLElBQUksQ0FBQyxFQUNwQixJQUFJLEVBQ0osSUFBSSxJQUFJLDhDQUE4QyxDQUN0RCxDQUFDO1lBQ0gsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDO1FBRUgsS0FBSyxDQUFDLHlCQUF5QixFQUFFLEtBQUssSUFBSSxFQUFFO1lBQzNDLE1BQU0sYUFBYSxHQUFHO2dCQUNyQixXQUFXO2dCQUNYLFdBQVc7Z0JBQ1gsU0FBUztnQkFDVCxRQUFRO2FBQ1IsQ0FBQztZQUVGLEtBQUssTUFBTSxJQUFJLElBQUksYUFBYSxFQUFFLENBQUM7Z0JBQ2xDLE1BQU0sQ0FBQyxXQUFXLENBQ2pCLGNBQWMsQ0FBQyxJQUFJLENBQUMsRUFDcEIsSUFBSSxFQUNKLElBQUksSUFBSSw4Q0FBOEMsQ0FDdEQsQ0FBQztZQUNILENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQztRQUVILEtBQUssQ0FBQywyQ0FBMkMsRUFBRSxLQUFLLElBQUksRUFBRTtZQUM3RCxNQUFNLGdCQUFnQixHQUFHO2dCQUN4QixRQUFRO2dCQUNSLGlCQUFpQjtnQkFDakIsVUFBVTtnQkFDVixrQkFBa0I7Z0JBQ2xCLGlCQUFpQjthQUNqQixDQUFDO1lBRUYsS0FBSyxNQUFNLElBQUksSUFBSSxnQkFBZ0IsRUFBRSxDQUFDO2dCQUNyQyxNQUFNLENBQUMsV0FBVyxDQUNqQixjQUFjLENBQUMsSUFBSSxDQUFDLEVBQ3BCLEtBQUssRUFDTCxJQUFJLElBQUksa0RBQWtELENBQzFELENBQUM7WUFDSCxDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILEtBQUssQ0FBQyw2QkFBNkIsRUFBRSxHQUFHLEVBQUU7UUFDekMsS0FBSyxDQUFDLGtDQUFrQyxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQ3BELFlBQVksQ0FBQztnQkFDWixpQkFBaUIsRUFBRSxJQUFJO2dCQUN2QixvQkFBb0IsRUFBRSxJQUFJO2dCQUMxQixhQUFhLEVBQUUsSUFBSTtnQkFDbkIsNkJBQTZCLEVBQUUsSUFBSTtnQkFDbkMsV0FBVyxFQUFFLElBQUk7Z0JBQ2pCLDZDQUE2QyxFQUFFLElBQUk7Z0JBQ25ELG9EQUFvRCxFQUFFLElBQUk7Z0JBQzFELG9EQUFvRCxFQUFFLElBQUk7YUFDMUQsQ0FBQyxDQUFDO1lBQ0gsbUJBQW1CLENBQUM7Z0JBQ25CLGtDQUFrQztnQkFDbEMsbUNBQW1DO2FBQ25DLENBQUMsQ0FBQztZQUNILE1BQU0sU0FBUyxDQUFDLFdBQVcsRUFBRSxFQUFFLENBQUMsQ0FBQztZQUNqQyxNQUFNLE9BQU8sR0FBRyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsa0JBQWtCLENBQUMsQ0FBQztZQUV4RSxhQUFhLENBQ1osTUFBTSxPQUFPLENBQUMsMkJBQTJCLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxFQUM3RDtnQkFDQyxrREFBa0Q7Z0JBQ2xELG1EQUFtRDtnQkFDbkQsa0RBQWtEO2dCQUNsRCxtREFBbUQ7Z0JBQ25ELDBDQUEwQztnQkFDMUMsMkNBQTJDO2dCQUMzQyw2Q0FBNkM7Z0JBQzdDLCtDQUErQztnQkFDL0Msa0RBQWtEO2FBQ2xELEVBQ0QsNEJBQTRCLENBQzVCLENBQUM7UUFDSCxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsS0FBSyxDQUFDLHlCQUF5QixFQUFFLEdBQUcsRUFBRTtRQUNyQyxLQUFLLENBQUMsZ0RBQWdELEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDbEUsbUJBQW1CLENBQUMsQ0FBQyxxQ0FBcUMsQ0FBQyxDQUFDLENBQUM7WUFDN0QsTUFBTSxTQUFTLENBQUMsV0FBVyxFQUFFO2dCQUM1QjtvQkFDQyxJQUFJLEVBQUUsK0NBQStDO29CQUNyRCxRQUFRLEVBQUUsQ0FBQyxlQUFlLENBQUM7aUJBQzNCO2dCQUNEO29CQUNDLElBQUksRUFBRSxtREFBbUQ7b0JBQ3pELFFBQVEsRUFBRSxDQUFDLGNBQWMsQ0FBQztpQkFDMUI7YUFDRCxDQUFDLENBQUM7WUFDSCxNQUFNLE9BQU8sR0FBRyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsa0JBQWtCLENBQUMsQ0FBQztZQUV4RSxNQUFNLE1BQU0sR0FBRyxDQUFDLE1BQU0sT0FBTyxDQUFDLHVCQUF1QixDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQy9GLGFBQWEsQ0FDWixNQUFNLEVBQ047Z0JBQ0MsK0NBQStDO2dCQUMvQyxtREFBbUQ7YUFDbkQsRUFDRCxxREFBcUQsQ0FDckQsQ0FBQztRQUNILENBQUMsQ0FBQyxDQUFDO1FBRUgsS0FBSyxDQUFDLG1EQUFtRCxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQ3JFLG1CQUFtQixDQUFDLENBQUMscUNBQXFDLENBQUMsQ0FBQyxDQUFDO1lBQzdELE1BQU0sU0FBUyxDQUFDLFdBQVcsRUFBRTtnQkFDNUI7b0JBQ0MsSUFBSSxFQUFFLCtDQUErQztvQkFDckQsUUFBUSxFQUFFLENBQUMsZUFBZSxDQUFDO2lCQUMzQjtnQkFDRDtvQkFDQyxJQUFJLEVBQUUsbURBQW1EO29CQUN6RCxRQUFRLEVBQUUsQ0FBQyxjQUFjLENBQUM7aUJBQzFCO2dCQUNEO29CQUNDLElBQUksRUFBRSwwREFBMEQ7b0JBQ2hFLFFBQVEsRUFBRSxDQUFDLGlCQUFpQixDQUFDO2lCQUM3QjthQUNELENBQUMsQ0FBQztZQUNILG9CQUFvQixDQUFDLElBQUksQ0FBQyxjQUFjLEVBQUU7Z0JBQ3pDLDJCQUEyQixFQUFFLEdBQUcsRUFBRSxDQUFDLEtBQUs7Z0JBQ3hDLEtBQUssQ0FBQyxVQUFVLEtBQUssTUFBTSxJQUFJLEtBQUssQ0FBQyxrQ0FBa0MsQ0FBQyxDQUFDLENBQUMsQ0FBQzthQUMzRSxDQUFDLENBQUM7WUFDSCxNQUFNLE9BQU8sR0FBRyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsa0JBQWtCLENBQUMsQ0FBQztZQUV4RSxNQUFNLE1BQU0sR0FBRyxDQUFDLE1BQU0sT0FBTyxDQUFDLHVCQUF1QixDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQy9GLGFBQWEsQ0FDWixNQUFNLEVBQ047Z0JBQ0MsK0NBQStDO2dCQUMvQyxtREFBbUQ7Z0JBQ25ELDBEQUEwRDthQUMxRCxFQUNELDREQUE0RCxDQUM1RCxDQUFDO1FBQ0gsQ0FBQyxDQUFDLENBQUM7UUFFSCxLQUFLLENBQUMscURBQXFELEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDdkUsbUJBQW1CLENBQUMsQ0FBQyxxQ0FBcUMsQ0FBQyxDQUFDLENBQUM7WUFDN0QsTUFBTSxTQUFTLENBQUMsV0FBVyxFQUFFO2dCQUM1QjtvQkFDQyxJQUFJLEVBQUUsK0NBQStDO29CQUNyRCxRQUFRLEVBQUUsQ0FBQyxlQUFlLENBQUM7aUJBQzNCO2FBQ0QsQ0FBQyxDQUFDO1lBQ0gsb0JBQW9CLENBQUMsSUFBSSxDQUFDLGNBQWMsRUFBRTtnQkFDekMsMkJBQTJCLEVBQUUsR0FBRyxFQUFFLENBQUMsS0FBSztnQkFDeEMsS0FBSyxDQUFDLFVBQVUsS0FBSyxNQUFNLElBQUksS0FBSyxDQUFDLGtDQUFrQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2FBQzNFLENBQUMsQ0FBQztZQUNILE1BQU0sT0FBTyxHQUFHLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1lBRXhFLE1BQU0sTUFBTSxHQUFHLElBQUksdUJBQXVCLEVBQUUsQ0FBQztZQUM3QyxxQkFBcUI7WUFDckIsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ2hCLE1BQU0sTUFBTSxHQUFHLENBQUMsTUFBTSxPQUFPLENBQUMsdUJBQXVCLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ3JGLGFBQWEsQ0FDWixNQUFNLEVBQ04sRUFBRSxFQUNGLHlDQUF5QyxDQUN6QyxDQUFDO1FBQ0gsQ0FBQyxDQUFDLENBQUM7SUFFSixDQUFDLENBQUMsQ0FBQztJQUVILEtBQUssQ0FBQyx5QkFBeUIsRUFBRSxHQUFHLEVBQUU7UUFDckMsSUFBSSxPQUEyQixDQUFDO1FBRWhDLDBEQUEwRDtRQUMxRCxNQUFNLDJCQUEyQixHQUFHLENBQUMsS0FBZSxFQUFFLEVBQUU7WUFDdkQsbUJBQW1CLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDM0IsT0FBTyxHQUFHLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1FBQ25FLENBQUMsQ0FBQztRQUVGLEtBQUssQ0FBQyxnREFBZ0QsRUFBRSxLQUFLLElBQUksRUFBRTtZQUNsRSwyQkFBMkIsQ0FBQyxDQUFDLG1CQUFtQixDQUFDLENBQUMsQ0FBQztZQUNuRCxNQUFNLFNBQVMsQ0FBQyxXQUFXLEVBQUU7Z0JBQzVCLEVBQUUsSUFBSSxFQUFFLDZCQUE2QixFQUFFLFFBQVEsRUFBRSxDQUFDLHNCQUFzQixDQUFDLEVBQUU7Z0JBQzNFLEVBQUUsSUFBSSxFQUFFLGdDQUFnQyxFQUFFLFFBQVEsRUFBRSxDQUFDLFlBQVksQ0FBQyxFQUFFO2FBQ3BFLENBQUMsQ0FBQztZQUVILE1BQU0sS0FBSyxHQUFHLE1BQU0sT0FBTyxDQUFDLHVCQUF1QixDQUFDLElBQUksQ0FBQyxDQUFDO1lBQzFELE1BQU0sQ0FBQyxlQUFlLENBQ3JCLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQ3RCLENBQUMsbUJBQW1CLENBQUMsRUFDckIsaUVBQWlFLENBQ2pFLENBQUM7UUFDSCxDQUFDLENBQUMsQ0FBQztRQUVILEtBQUssQ0FBQyxnRUFBZ0UsRUFBRSxLQUFLLElBQUksRUFBRTtZQUNsRiwyQkFBMkIsQ0FBQyxDQUFDLGlDQUFpQyxDQUFDLENBQUMsQ0FBQztZQUNqRSxNQUFNLFNBQVMsQ0FBQyxXQUFXLEVBQUU7Z0JBQzVCLEVBQUUsSUFBSSxFQUFFLDJCQUEyQixFQUFFLFFBQVEsRUFBRSxDQUFDLHNCQUFzQixDQUFDLEVBQUU7Z0JBQ3pFLEVBQUUsSUFBSSxFQUFFLDhDQUE4QyxFQUFFLFFBQVEsRUFBRSxDQUFDLFlBQVksQ0FBQyxFQUFFO2FBQ2xGLENBQUMsQ0FBQztZQUVILHFCQUFxQixDQUFDLGNBQWMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFFcEUsTUFBTSxLQUFLLEdBQUcsTUFBTSxPQUFPLENBQUMsdUJBQXVCLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDMUQsTUFBTSxDQUFDLGVBQWUsQ0FDckIsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLEVBQUUsRUFDN0I7Z0JBQ0MsaUJBQWlCO2dCQUNqQiwwQkFBMEI7Z0JBQzFCLGlDQUFpQzthQUNqQyxDQUFDLElBQUksRUFBRSxFQUNSLHlFQUF5RSxDQUN6RSxDQUFDO1FBQ0gsQ0FBQyxDQUFDLENBQUM7UUFFSCxLQUFLLENBQUMsK0NBQStDLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDakUsMkJBQTJCLENBQUMsQ0FBQyxpQ0FBaUMsQ0FBQyxDQUFDLENBQUM7WUFDakUsTUFBTSxTQUFTLENBQUMsV0FBVyxFQUFFO2dCQUM1QixFQUFFLElBQUksRUFBRSwyQkFBMkIsRUFBRSxRQUFRLEVBQUUsQ0FBQyxzQkFBc0IsQ0FBQyxFQUFFO2dCQUN6RSxFQUFFLElBQUksRUFBRSw4Q0FBOEMsRUFBRSxRQUFRLEVBQUUsQ0FBQyxZQUFZLENBQUMsRUFBRTthQUNsRixDQUFDLENBQUM7WUFFSCxxQkFBcUIsQ0FBQyxjQUFjLENBQUMsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRXBFLE1BQU0sS0FBSyxHQUFHLE1BQU0sT0FBTyxDQUFDLHVCQUF1QixDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQzNELE1BQU0sQ0FBQyxlQUFlLENBQ3JCLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQ3RCLENBQUMsaUNBQWlDLENBQUMsRUFDbkMsbUVBQW1FLENBQ25FLENBQUM7UUFDSCxDQUFDLENBQUMsQ0FBQztRQUVILEtBQUssQ0FBQyxxREFBcUQsRUFBRSxLQUFLLElBQUksRUFBRTtZQUN2RSwyQkFBMkIsQ0FBQyxDQUFDLGdDQUFnQyxDQUFDLENBQUMsQ0FBQztZQUNoRSxNQUFNLFNBQVMsQ0FBQyxXQUFXLEVBQUU7Z0JBQzVCLEVBQUUsSUFBSSxFQUFFLDZDQUE2QyxFQUFFLFFBQVEsRUFBRSxDQUFDLFlBQVksQ0FBQyxFQUFFO2FBQ2pGLENBQUMsQ0FBQztZQUVILE1BQU0sS0FBSyxHQUFHLE1BQU0sT0FBTyxDQUFDLHVCQUF1QixDQUFDLElBQUksQ0FBQyxDQUFDO1lBQzFELE1BQU0sQ0FBQyxlQUFlLENBQ3JCLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQ3RCLENBQUMsZ0NBQWdDLENBQUMsRUFDbEMsNkVBQTZFLENBQzdFLENBQUM7UUFDSCxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQyxDQUFDLENBQUM7QUFFSCxTQUFTLGFBQWEsQ0FBQyxNQUFzQixFQUFFLFFBQWtCLEVBQUUsT0FBZTtJQUNqRixNQUFNLENBQUMsZUFBZSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxRQUFRLEVBQUUsT0FBTyxDQUFDLENBQUM7QUFDMUUsQ0FBQyJ9