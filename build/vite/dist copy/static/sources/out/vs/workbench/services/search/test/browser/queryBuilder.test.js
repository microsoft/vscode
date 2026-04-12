/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { join } from '../../../../../base/common/path.js';
import { isWindows } from '../../../../../base/common/platform.js';
import { URI, URI as uri } from '../../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IWorkspaceContextService, toWorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { toWorkspaceFolders } from '../../../../../platform/workspaces/common/workspaces.js';
import { QueryBuilder } from '../../common/queryBuilder.js';
import { IPathService } from '../../../path/common/pathService.js';
import { TestPathService, TestEnvironmentService } from '../../../../test/browser/workbenchTestServices.js';
import { TestContextService } from '../../../../test/common/workbenchTestServices.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { Workspace } from '../../../../../platform/workspace/test/common/testWorkspace.js';
import { extUriBiasedIgnorePathCase } from '../../../../../base/common/resources.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
const DEFAULT_EDITOR_CONFIG = {};
const DEFAULT_USER_CONFIG = { useRipgrep: true, useIgnoreFiles: true, useGlobalIgnoreFiles: true, useParentIgnoreFiles: true };
const DEFAULT_QUERY_PROPS = {};
const DEFAULT_TEXT_QUERY_PROPS = { usePCRE2: false };
suite('QueryBuilder', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    const PATTERN_INFO = { pattern: 'a' };
    const ROOT_1 = fixPath('/foo/root1');
    const ROOT_1_URI = getUri(ROOT_1);
    const ROOT_1_NAMED_FOLDER = toWorkspaceFolder(ROOT_1_URI);
    const WS_CONFIG_PATH = getUri('/bar/test.code-workspace'); // location of the workspace file (not important except that it is a file URI)
    let instantiationService;
    let queryBuilder;
    let mockConfigService;
    let mockContextService;
    let mockWorkspace;
    setup(() => {
        instantiationService = new TestInstantiationService();
        mockConfigService = new TestConfigurationService();
        mockConfigService.setUserConfiguration('search', DEFAULT_USER_CONFIG);
        mockConfigService.setUserConfiguration('editor', DEFAULT_EDITOR_CONFIG);
        instantiationService.stub(IConfigurationService, mockConfigService);
        mockContextService = new TestContextService();
        mockWorkspace = new Workspace('workspace', [toWorkspaceFolder(ROOT_1_URI)]);
        mockContextService.setWorkspace(mockWorkspace);
        instantiationService.stub(IWorkspaceContextService, mockContextService);
        instantiationService.stub(IEnvironmentService, TestEnvironmentService);
        instantiationService.stub(IPathService, new TestPathService());
        queryBuilder = instantiationService.createInstance(QueryBuilder);
    });
    teardown(() => {
        instantiationService.dispose();
    });
    test('simple text pattern', () => {
        assertEqualTextQueries(queryBuilder.text(PATTERN_INFO), {
            folderQueries: [],
            contentPattern: PATTERN_INFO,
            type: 2 /* QueryType.Text */
        });
    });
    test('normalize literal newlines', () => {
        assertEqualTextQueries(queryBuilder.text({ pattern: 'foo\nbar', isRegExp: true }), {
            folderQueries: [],
            contentPattern: {
                pattern: 'foo\\nbar',
                isRegExp: true,
                isMultiline: true
            },
            type: 2 /* QueryType.Text */
        });
        assertEqualTextQueries(queryBuilder.text({ pattern: 'foo\nbar', isRegExp: false }), {
            folderQueries: [],
            contentPattern: {
                pattern: 'foo\nbar',
                isRegExp: false,
                isMultiline: true
            },
            type: 2 /* QueryType.Text */
        });
    });
    test('splits include pattern when expandPatterns enabled', () => {
        assertEqualQueries(queryBuilder.file([ROOT_1_NAMED_FOLDER], { includePattern: '**/foo, **/bar', expandPatterns: true }), {
            folderQueries: [{
                    folder: ROOT_1_URI
                }],
            type: 1 /* QueryType.File */,
            includePattern: {
                '**/foo': true,
                '**/foo/**': true,
                '**/bar': true,
                '**/bar/**': true,
            }
        });
    });
    test('does not split include pattern when expandPatterns disabled', () => {
        assertEqualQueries(queryBuilder.file([ROOT_1_NAMED_FOLDER], { includePattern: '**/foo, **/bar' }), {
            folderQueries: [{
                    folder: ROOT_1_URI
                }],
            type: 1 /* QueryType.File */,
            includePattern: {
                '**/foo, **/bar': true
            }
        });
    });
    test('includePattern array', () => {
        assertEqualQueries(queryBuilder.file([ROOT_1_NAMED_FOLDER], { includePattern: ['**/foo', '**/bar'] }), {
            folderQueries: [{
                    folder: ROOT_1_URI
                }],
            type: 1 /* QueryType.File */,
            includePattern: {
                '**/foo': true,
                '**/bar': true
            }
        });
    });
    test('includePattern array with expandPatterns', () => {
        assertEqualQueries(queryBuilder.file([ROOT_1_NAMED_FOLDER], { includePattern: ['**/foo', '**/bar'], expandPatterns: true }), {
            folderQueries: [{
                    folder: ROOT_1_URI
                }],
            type: 1 /* QueryType.File */,
            includePattern: {
                '**/foo': true,
                '**/foo/**': true,
                '**/bar': true,
                '**/bar/**': true,
            }
        });
    });
    test('folderResources', () => {
        assertEqualTextQueries(queryBuilder.text(PATTERN_INFO, [ROOT_1_URI]), {
            contentPattern: PATTERN_INFO,
            folderQueries: [{ folder: ROOT_1_URI }],
            type: 2 /* QueryType.Text */
        });
    });
    test('simple exclude setting', () => {
        mockConfigService.setUserConfiguration('search', {
            ...DEFAULT_USER_CONFIG,
            exclude: {
                'bar/**': true,
                'foo/**': {
                    'when': '$(basename).ts'
                }
            }
        });
        assertEqualTextQueries(queryBuilder.text(PATTERN_INFO, [ROOT_1_URI], {
            expandPatterns: true // verify that this doesn't affect patterns from configuration
        }), {
            contentPattern: PATTERN_INFO,
            folderQueries: [{
                    folder: ROOT_1_URI,
                    excludePattern: [{
                            pattern: {
                                'bar/**': true,
                                'foo/**': {
                                    'when': '$(basename).ts'
                                }
                            }
                        }]
                }],
            type: 2 /* QueryType.Text */
        });
    });
    test('simple include', () => {
        assertEqualTextQueries(queryBuilder.text(PATTERN_INFO, [ROOT_1_URI], {
            includePattern: 'bar',
            expandPatterns: true
        }), {
            contentPattern: PATTERN_INFO,
            folderQueries: [{
                    folder: ROOT_1_URI
                }],
            includePattern: {
                '**/bar': true,
                '**/bar/**': true
            },
            type: 2 /* QueryType.Text */
        });
        assertEqualTextQueries(queryBuilder.text(PATTERN_INFO, [ROOT_1_URI], {
            includePattern: 'bar'
        }), {
            contentPattern: PATTERN_INFO,
            folderQueries: [{
                    folder: ROOT_1_URI
                }],
            includePattern: {
                'bar': true
            },
            type: 2 /* QueryType.Text */
        });
    });
    test('simple include with ./ syntax', () => {
        assertEqualTextQueries(queryBuilder.text(PATTERN_INFO, [ROOT_1_URI], {
            includePattern: './bar',
            expandPatterns: true
        }), {
            contentPattern: PATTERN_INFO,
            folderQueries: [{
                    folder: ROOT_1_URI,
                    includePattern: {
                        'bar': true,
                        'bar/**': true
                    }
                }],
            type: 2 /* QueryType.Text */
        });
        assertEqualTextQueries(queryBuilder.text(PATTERN_INFO, [ROOT_1_URI], {
            includePattern: '.\\bar',
            expandPatterns: true
        }), {
            contentPattern: PATTERN_INFO,
            folderQueries: [{
                    folder: ROOT_1_URI,
                    includePattern: {
                        'bar': true,
                        'bar/**': true
                    }
                }],
            type: 2 /* QueryType.Text */
        });
    });
    test('exclude setting and searchPath', () => {
        mockConfigService.setUserConfiguration('search', {
            ...DEFAULT_USER_CONFIG,
            exclude: {
                'foo/**/*.js': true,
                'bar/**': {
                    'when': '$(basename).ts'
                }
            }
        });
        assertEqualTextQueries(queryBuilder.text(PATTERN_INFO, [ROOT_1_URI], {
            includePattern: './foo',
            expandPatterns: true
        }), {
            contentPattern: PATTERN_INFO,
            folderQueries: [{
                    folder: ROOT_1_URI,
                    includePattern: {
                        'foo': true,
                        'foo/**': true
                    },
                    excludePattern: [{
                            pattern: {
                                'foo/**/*.js': true,
                                'bar/**': {
                                    'when': '$(basename).ts'
                                }
                            }
                        }]
                }],
            type: 2 /* QueryType.Text */
        });
    });
    test('multiroot exclude settings', () => {
        const ROOT_2 = fixPath('/project/root2');
        const ROOT_2_URI = getUri(ROOT_2);
        const ROOT_3 = fixPath('/project/root3');
        const ROOT_3_URI = getUri(ROOT_3);
        mockWorkspace.folders = toWorkspaceFolders([{ path: ROOT_1_URI.fsPath }, { path: ROOT_2_URI.fsPath }, { path: ROOT_3_URI.fsPath }], WS_CONFIG_PATH, extUriBiasedIgnorePathCase);
        mockWorkspace.configuration = uri.file(fixPath('/config'));
        mockConfigService.setUserConfiguration('search', {
            ...DEFAULT_USER_CONFIG,
            exclude: { 'foo/**/*.js': true }
        }, ROOT_1_URI);
        mockConfigService.setUserConfiguration('search', {
            ...DEFAULT_USER_CONFIG,
            exclude: { 'bar': true }
        }, ROOT_2_URI);
        // There are 3 roots, the first two have search.exclude settings, test that the correct basic query is returned
        assertEqualTextQueries(queryBuilder.text(PATTERN_INFO, [ROOT_1_URI, ROOT_2_URI, ROOT_3_URI]), {
            contentPattern: PATTERN_INFO,
            folderQueries: [
                { folder: ROOT_1_URI, excludePattern: makeExcludePatternFromPatterns('foo/**/*.js') },
                { folder: ROOT_2_URI, excludePattern: makeExcludePatternFromPatterns('bar') },
                { folder: ROOT_3_URI }
            ],
            type: 2 /* QueryType.Text */
        });
        // Now test that it merges the root excludes when an 'include' is used
        assertEqualTextQueries(queryBuilder.text(PATTERN_INFO, [ROOT_1_URI, ROOT_2_URI, ROOT_3_URI], {
            includePattern: './root2/src',
            expandPatterns: true
        }), {
            contentPattern: PATTERN_INFO,
            folderQueries: [
                {
                    folder: ROOT_2_URI,
                    includePattern: {
                        'src': true,
                        'src/**': true
                    },
                    excludePattern: [{
                            pattern: { 'bar': true }
                        }],
                }
            ],
            type: 2 /* QueryType.Text */
        });
    });
    test('simple exclude input pattern', () => {
        assertEqualTextQueries(queryBuilder.text(PATTERN_INFO, [ROOT_1_URI], {
            excludePattern: [{ pattern: 'foo' }],
            expandPatterns: true
        }), {
            contentPattern: PATTERN_INFO,
            folderQueries: [{
                    folder: ROOT_1_URI
                }],
            type: 2 /* QueryType.Text */,
            excludePattern: patternsToIExpression(...globalGlob('foo'))
        });
    });
    test('file pattern trimming', () => {
        const content = 'content';
        assertEqualQueries(queryBuilder.file([], { filePattern: ` ${content} ` }), {
            folderQueries: [],
            filePattern: content,
            type: 1 /* QueryType.File */
        });
    });
    test('exclude ./ syntax', () => {
        assertEqualTextQueries(queryBuilder.text(PATTERN_INFO, [ROOT_1_URI], {
            excludePattern: [{ pattern: './bar' }],
            expandPatterns: true
        }), {
            contentPattern: PATTERN_INFO,
            folderQueries: [{
                    folder: ROOT_1_URI,
                    excludePattern: makeExcludePatternFromPatterns('bar', 'bar/**'),
                }],
            type: 2 /* QueryType.Text */
        });
        assertEqualTextQueries(queryBuilder.text(PATTERN_INFO, [ROOT_1_URI], {
            excludePattern: [{ pattern: './bar/**/*.ts' }],
            expandPatterns: true
        }), {
            contentPattern: PATTERN_INFO,
            folderQueries: [{
                    folder: ROOT_1_URI,
                    excludePattern: makeExcludePatternFromPatterns('bar/**/*.ts', 'bar/**/*.ts/**'),
                }],
            type: 2 /* QueryType.Text */
        });
        assertEqualTextQueries(queryBuilder.text(PATTERN_INFO, [ROOT_1_URI], {
            excludePattern: [{ pattern: '.\\bar\\**\\*.ts' }],
            expandPatterns: true
        }), {
            contentPattern: PATTERN_INFO,
            folderQueries: [{
                    folder: ROOT_1_URI,
                    excludePattern: makeExcludePatternFromPatterns('bar/**/*.ts', 'bar/**/*.ts/**'),
                }],
            type: 2 /* QueryType.Text */
        });
    });
    test('extraFileResources', () => {
        assertEqualTextQueries(queryBuilder.text(PATTERN_INFO, [ROOT_1_URI], { extraFileResources: [getUri('/foo/bar.js')] }), {
            contentPattern: PATTERN_INFO,
            folderQueries: [{
                    folder: ROOT_1_URI
                }],
            extraFileResources: [getUri('/foo/bar.js')],
            type: 2 /* QueryType.Text */
        });
        assertEqualTextQueries(queryBuilder.text(PATTERN_INFO, [ROOT_1_URI], {
            extraFileResources: [getUri('/foo/bar.js')],
            excludePattern: [{ pattern: '*.js' }],
            expandPatterns: true
        }), {
            contentPattern: PATTERN_INFO,
            folderQueries: [{
                    folder: ROOT_1_URI
                }],
            excludePattern: patternsToIExpression(...globalGlob('*.js')),
            type: 2 /* QueryType.Text */
        });
        assertEqualTextQueries(queryBuilder.text(PATTERN_INFO, [ROOT_1_URI], {
            extraFileResources: [getUri('/foo/bar.js')],
            includePattern: '*.txt',
            expandPatterns: true
        }), {
            contentPattern: PATTERN_INFO,
            folderQueries: [{
                    folder: ROOT_1_URI
                }],
            includePattern: patternsToIExpression(...globalGlob('*.txt')),
            type: 2 /* QueryType.Text */
        });
    });
    suite('parseSearchPaths 1', () => {
        test('simple includes', () => {
            function testSimpleIncludes(includePattern, expectedPatterns) {
                const result = queryBuilder.parseSearchPaths(includePattern);
                assert.deepStrictEqual({ ...result.pattern }, patternsToIExpression(...expectedPatterns), includePattern);
                assert.strictEqual(result.searchPaths, undefined);
            }
            [
                ['a', ['**/a/**', '**/a']],
                ['a/b', ['**/a/b', '**/a/b/**']],
                ['a/b,  c', ['**/a/b', '**/c', '**/a/b/**', '**/c/**']],
                ['a,.txt', ['**/a', '**/a/**', '**/*.txt', '**/*.txt/**']],
                ['a,,,b', ['**/a', '**/a/**', '**/b', '**/b/**']],
                ['**/a,b/**', ['**/a', '**/a/**', '**/b/**']]
            ].forEach(([includePattern, expectedPatterns]) => testSimpleIncludes(includePattern, expectedPatterns));
        });
        function testIncludes(includePattern, expectedResult) {
            let actual;
            try {
                actual = queryBuilder.parseSearchPaths(includePattern);
            }
            catch (_) {
                actual = { searchPaths: [] };
            }
            assertEqualSearchPathResults(actual, expectedResult, includePattern);
        }
        function testIncludesDataItem([includePattern, expectedResult]) {
            testIncludes(includePattern, expectedResult);
        }
        test('absolute includes', () => {
            const cases = [
                [
                    fixPath('/foo/bar'),
                    {
                        searchPaths: [{ searchPath: getUri('/foo/bar') }]
                    }
                ],
                [
                    fixPath('/foo/bar') + ',' + 'a',
                    {
                        searchPaths: [{ searchPath: getUri('/foo/bar') }],
                        pattern: patternsToIExpression(...globalGlob('a'))
                    }
                ],
                [
                    fixPath('/foo/bar') + ',' + fixPath('/1/2'),
                    {
                        searchPaths: [{ searchPath: getUri('/foo/bar') }, { searchPath: getUri('/1/2') }]
                    }
                ],
                [
                    fixPath('/foo/bar') + ',' + fixPath('/foo/../foo/bar/fooar/..'),
                    {
                        searchPaths: [{
                                searchPath: getUri('/foo/bar')
                            }]
                    }
                ],
                [
                    fixPath('/foo/bar/**/*.ts'),
                    {
                        searchPaths: [{
                                searchPath: getUri('/foo/bar'),
                                pattern: patternsToIExpression('**/*.ts', '**/*.ts/**')
                            }]
                    }
                ],
                [
                    fixPath('/foo/bar/*a/b/c'),
                    {
                        searchPaths: [{
                                searchPath: getUri('/foo/bar'),
                                pattern: patternsToIExpression('*a/b/c', '*a/b/c/**')
                            }]
                    }
                ],
                [
                    fixPath('/*a/b/c'),
                    {
                        searchPaths: [{
                                searchPath: getUri('/'),
                                pattern: patternsToIExpression('*a/b/c', '*a/b/c/**')
                            }]
                    }
                ],
                [
                    fixPath('/foo/{b,c}ar'),
                    {
                        searchPaths: [{
                                searchPath: getUri('/foo'),
                                pattern: patternsToIExpression('{b,c}ar', '{b,c}ar/**')
                            }]
                    }
                ]
            ];
            cases.forEach(testIncludesDataItem);
        });
        test('relative includes w/single root folder', () => {
            const cases = [
                [
                    './a',
                    {
                        searchPaths: [{
                                searchPath: ROOT_1_URI,
                                pattern: patternsToIExpression('a', 'a/**')
                            }]
                    }
                ],
                [
                    './a/',
                    {
                        searchPaths: [{
                                searchPath: ROOT_1_URI,
                                pattern: patternsToIExpression('a', 'a/**')
                            }]
                    }
                ],
                [
                    './a/*b/c',
                    {
                        searchPaths: [{
                                searchPath: ROOT_1_URI,
                                pattern: patternsToIExpression('a/*b/c', 'a/*b/c/**')
                            }]
                    }
                ],
                [
                    './a/*b/c, ' + fixPath('/project/foo'),
                    {
                        searchPaths: [
                            {
                                searchPath: ROOT_1_URI,
                                pattern: patternsToIExpression('a/*b/c', 'a/*b/c/**')
                            },
                            {
                                searchPath: getUri('/project/foo')
                            }
                        ]
                    }
                ],
                [
                    './a/b/,./c/d',
                    {
                        searchPaths: [{
                                searchPath: ROOT_1_URI,
                                pattern: patternsToIExpression('a/b', 'a/b/**', 'c/d', 'c/d/**')
                            }]
                    }
                ],
                [
                    '../',
                    {
                        searchPaths: [{
                                searchPath: getUri('/foo')
                            }]
                    }
                ],
                [
                    '..',
                    {
                        searchPaths: [{
                                searchPath: getUri('/foo')
                            }]
                    }
                ],
                [
                    '..\\bar',
                    {
                        searchPaths: [{
                                searchPath: getUri('/foo/bar')
                            }]
                    }
                ]
            ];
            cases.forEach(testIncludesDataItem);
        });
        test('relative includes w/two root folders', () => {
            const ROOT_2 = '/project/root2';
            mockWorkspace.folders = toWorkspaceFolders([{ path: ROOT_1_URI.fsPath }, { path: getUri(ROOT_2).fsPath }], WS_CONFIG_PATH, extUriBiasedIgnorePathCase);
            mockWorkspace.configuration = uri.file(fixPath('config'));
            const cases = [
                [
                    './root1',
                    {
                        searchPaths: [{
                                searchPath: getUri(ROOT_1)
                            }]
                    }
                ],
                [
                    './root2',
                    {
                        searchPaths: [{
                                searchPath: getUri(ROOT_2),
                            }]
                    }
                ],
                [
                    './root1/a/**/b, ./root2/**/*.txt',
                    {
                        searchPaths: [
                            {
                                searchPath: ROOT_1_URI,
                                pattern: patternsToIExpression('a/**/b', 'a/**/b/**')
                            },
                            {
                                searchPath: getUri(ROOT_2),
                                pattern: patternsToIExpression('**/*.txt', '**/*.txt/**')
                            }
                        ]
                    }
                ]
            ];
            cases.forEach(testIncludesDataItem);
        });
        test('include ./foldername', () => {
            const ROOT_2 = '/project/root2';
            const ROOT_1_FOLDERNAME = 'foldername';
            mockWorkspace.folders = toWorkspaceFolders([{ path: ROOT_1_URI.fsPath, name: ROOT_1_FOLDERNAME }, { path: getUri(ROOT_2).fsPath }], WS_CONFIG_PATH, extUriBiasedIgnorePathCase);
            mockWorkspace.configuration = uri.file(fixPath('config'));
            const cases = [
                [
                    './foldername',
                    {
                        searchPaths: [{
                                searchPath: ROOT_1_URI
                            }]
                    }
                ],
                [
                    './foldername/foo',
                    {
                        searchPaths: [{
                                searchPath: ROOT_1_URI,
                                pattern: patternsToIExpression('foo', 'foo/**')
                            }]
                    }
                ]
            ];
            cases.forEach(testIncludesDataItem);
        });
        test('folder with slash in the name', () => {
            const ROOT_2 = '/project/root2';
            const ROOT_2_URI = getUri(ROOT_2);
            const ROOT_1_FOLDERNAME = 'folder/one';
            const ROOT_2_FOLDERNAME = 'folder/two+'; // And another regex character, #126003
            mockWorkspace.folders = toWorkspaceFolders([{ path: ROOT_1_URI.fsPath, name: ROOT_1_FOLDERNAME }, { path: ROOT_2_URI.fsPath, name: ROOT_2_FOLDERNAME }], WS_CONFIG_PATH, extUriBiasedIgnorePathCase);
            mockWorkspace.configuration = uri.file(fixPath('config'));
            const cases = [
                [
                    './folder/one',
                    {
                        searchPaths: [{
                                searchPath: ROOT_1_URI
                            }]
                    }
                ],
                [
                    './folder/two+/foo/',
                    {
                        searchPaths: [{
                                searchPath: ROOT_2_URI,
                                pattern: patternsToIExpression('foo', 'foo/**')
                            }]
                    }
                ],
                [
                    './folder/onesomethingelse',
                    { searchPaths: [] }
                ],
                [
                    './folder/onesomethingelse/foo',
                    { searchPaths: [] }
                ],
                [
                    './folder',
                    { searchPaths: [] }
                ]
            ];
            cases.forEach(testIncludesDataItem);
        });
        test('relative includes w/multiple ambiguous root folders', () => {
            const ROOT_2 = '/project/rootB';
            const ROOT_3 = '/otherproject/rootB';
            mockWorkspace.folders = toWorkspaceFolders([{ path: ROOT_1_URI.fsPath }, { path: getUri(ROOT_2).fsPath }, { path: getUri(ROOT_3).fsPath }], WS_CONFIG_PATH, extUriBiasedIgnorePathCase);
            mockWorkspace.configuration = uri.file(fixPath('/config'));
            const cases = [
                [
                    '',
                    {
                        searchPaths: undefined
                    }
                ],
                [
                    './',
                    {
                        searchPaths: undefined
                    }
                ],
                [
                    './root1',
                    {
                        searchPaths: [{
                                searchPath: getUri(ROOT_1)
                            }]
                    }
                ],
                [
                    './root1,./',
                    {
                        searchPaths: [{
                                searchPath: getUri(ROOT_1)
                            }]
                    }
                ],
                [
                    './rootB',
                    {
                        searchPaths: [
                            {
                                searchPath: getUri(ROOT_2),
                            },
                            {
                                searchPath: getUri(ROOT_3),
                            }
                        ]
                    }
                ],
                [
                    './rootB/a/**/b, ./rootB/b/**/*.txt',
                    {
                        searchPaths: [
                            {
                                searchPath: getUri(ROOT_2),
                                pattern: patternsToIExpression('a/**/b', 'a/**/b/**', 'b/**/*.txt', 'b/**/*.txt/**')
                            },
                            {
                                searchPath: getUri(ROOT_3),
                                pattern: patternsToIExpression('a/**/b', 'a/**/b/**', 'b/**/*.txt', 'b/**/*.txt/**')
                            }
                        ]
                    }
                ],
                [
                    './root1/**/foo/, bar/',
                    {
                        pattern: patternsToIExpression('**/bar', '**/bar/**'),
                        searchPaths: [
                            {
                                searchPath: ROOT_1_URI,
                                pattern: patternsToIExpression('**/foo', '**/foo/**')
                            }
                        ]
                    }
                ]
            ];
            cases.forEach(testIncludesDataItem);
        });
    });
    suite('parseSearchPaths 2', () => {
        function testIncludes(includePattern, expectedResult) {
            assertEqualSearchPathResults(queryBuilder.parseSearchPaths(includePattern), expectedResult, includePattern);
        }
        function testIncludesDataItem([includePattern, expectedResult]) {
            testIncludes(includePattern, expectedResult);
        }
        (isWindows ? test.skip : test)('includes with tilde', () => {
            const userHome = URI.file('/');
            const cases = [
                [
                    '~/foo/bar',
                    {
                        searchPaths: [{ searchPath: getUri(userHome.fsPath, '/foo/bar') }]
                    }
                ],
                [
                    '~/foo/bar, a',
                    {
                        searchPaths: [{ searchPath: getUri(userHome.fsPath, '/foo/bar') }],
                        pattern: patternsToIExpression(...globalGlob('a'))
                    }
                ],
                [
                    fixPath('/foo/~/bar'),
                    {
                        searchPaths: [{ searchPath: getUri('/foo/~/bar') }]
                    }
                ],
            ];
            cases.forEach(testIncludesDataItem);
        });
    });
    suite('smartCase', () => {
        test('no flags -> no change', () => {
            const query = queryBuilder.text({
                pattern: 'a'
            }, []);
            assert(!query.contentPattern.isCaseSensitive);
        });
        test('maintains isCaseSensitive when smartCase not set', () => {
            const query = queryBuilder.text({
                pattern: 'a',
                isCaseSensitive: true
            }, []);
            assert(query.contentPattern.isCaseSensitive);
        });
        test('maintains isCaseSensitive when smartCase set', () => {
            const query = queryBuilder.text({
                pattern: 'a',
                isCaseSensitive: true
            }, [], {
                isSmartCase: true
            });
            assert(query.contentPattern.isCaseSensitive);
        });
        test('smartCase determines not case sensitive', () => {
            const query = queryBuilder.text({
                pattern: 'abcd'
            }, [], {
                isSmartCase: true
            });
            assert(!query.contentPattern.isCaseSensitive);
        });
        test('smartCase determines case sensitive', () => {
            const query = queryBuilder.text({
                pattern: 'abCd'
            }, [], {
                isSmartCase: true
            });
            assert(query.contentPattern.isCaseSensitive);
        });
        test('smartCase determines not case sensitive (regex)', () => {
            const query = queryBuilder.text({
                pattern: 'ab\\Sd',
                isRegExp: true
            }, [], {
                isSmartCase: true
            });
            assert(!query.contentPattern.isCaseSensitive);
        });
        test('smartCase determines case sensitive (regex)', () => {
            const query = queryBuilder.text({
                pattern: 'ab[A-Z]d',
                isRegExp: true
            }, [], {
                isSmartCase: true
            });
            assert(query.contentPattern.isCaseSensitive);
        });
    });
    suite('file', () => {
        test('simple file query', () => {
            const cacheKey = 'asdf';
            const query = queryBuilder.file([ROOT_1_NAMED_FOLDER], {
                cacheKey,
                sortByScore: true
            });
            assert.strictEqual(query.folderQueries.length, 1);
            assert.strictEqual(query.cacheKey, cacheKey);
            assert(query.sortByScore);
        });
    });
    suite('pattern processing', () => {
        test('text query with comma-separated includes with no workspace', () => {
            const query = queryBuilder.text({ pattern: `` }, [], {
                includePattern: '*.js,*.ts',
                expandPatterns: true
            });
            assert.deepEqual(query.includePattern, {
                '**/*.js/**': true,
                '**/*.js': true,
                '**/*.ts/**': true,
                '**/*.ts': true,
            });
            assert.strictEqual(query.folderQueries.length, 0);
        });
        test('text query with comma-separated includes with workspace', () => {
            const query = queryBuilder.text({ pattern: `` }, [ROOT_1_URI], {
                includePattern: '*.js,*.ts',
                expandPatterns: true
            });
            assert.deepEqual(query.includePattern, {
                '**/*.js/**': true,
                '**/*.js': true,
                '**/*.ts/**': true,
                '**/*.ts': true,
            });
            assert.strictEqual(query.folderQueries.length, 1);
        });
        test('text query with comma-separated excludes globally', () => {
            const query = queryBuilder.text({ pattern: `` }, [], {
                excludePattern: [{ pattern: '*.js,*.ts' }],
                expandPatterns: true
            });
            assert.deepEqual(query.excludePattern, {
                '**/*.js/**': true,
                '**/*.js': true,
                '**/*.ts/**': true,
                '**/*.ts': true,
            });
            assert.strictEqual(query.folderQueries.length, 0);
        });
        test('text query with comma-separated excludes globally in a workspace', () => {
            const query = queryBuilder.text({ pattern: `` }, [ROOT_1_NAMED_FOLDER.uri], {
                excludePattern: [{ pattern: '*.js,*.ts' }],
                expandPatterns: true
            });
            assert.deepEqual(query.excludePattern, {
                '**/*.js/**': true,
                '**/*.js': true,
                '**/*.ts/**': true,
                '**/*.ts': true,
            });
            assert.strictEqual(query.folderQueries.length, 1);
        });
        test.skip('text query with multiple comma-separated excludes', () => {
            // TODO: Fix. Will require `ICommonQueryProps.excludePattern` to support an array.
            const query = queryBuilder.text({ pattern: `` }, [ROOT_1_NAMED_FOLDER.uri], {
                excludePattern: [{ pattern: '*.js,*.ts' }, { pattern: 'foo/*,bar/*' }],
                expandPatterns: true
            });
            assert.deepEqual(query.excludePattern, [
                {
                    '**/*.js/**': true,
                    '**/*.js': true,
                    '**/*.ts/**': true,
                    '**/*.ts': true,
                },
                {
                    '**/foo/*/**': true,
                    '**/foo/*': true,
                    '**/bar/*/**': true,
                    '**/bar/*': true,
                }
            ]);
            assert.strictEqual(query.folderQueries.length, 1);
        });
        test.skip('text query with base URI on exclud', () => {
            // TODO: Fix. Will require `ICommonQueryProps.excludePattern` to support an baseURI.
            const query = queryBuilder.text({ pattern: `` }, [ROOT_1_NAMED_FOLDER.uri], {
                excludePattern: [{ uri: ROOT_1_URI, pattern: '*.js,*.ts' }],
                expandPatterns: true
            });
            // todo: incorporate the base URI into the pattern
            assert.deepEqual(query.excludePattern, {
                uri: ROOT_1_URI,
                pattern: {
                    '**/*.js/**': true,
                    '**/*.js': true,
                    '**/*.ts/**': true,
                    '**/*.ts': true,
                }
            });
            assert.strictEqual(query.folderQueries.length, 1);
        });
    });
});
function makeExcludePatternFromPatterns(...patterns) {
    const pattern = patternsToIExpression(...patterns);
    return pattern ? [{ pattern }] : undefined;
}
function assertEqualTextQueries(actual, expected) {
    expected = {
        ...DEFAULT_TEXT_QUERY_PROPS,
        ...expected
    };
    return assertEqualQueries(actual, expected);
}
export function assertEqualQueries(actual, expected) {
    expected = {
        ...DEFAULT_QUERY_PROPS,
        ...expected
    };
    const folderQueryToCompareObject = (fq) => {
        const excludePattern = fq.excludePattern?.map(e => normalizeExpression(e.pattern));
        return {
            path: fq.folder.fsPath,
            excludePattern: excludePattern?.length ? excludePattern : undefined,
            includePattern: normalizeExpression(fq.includePattern),
            fileEncoding: fq.fileEncoding
        };
    };
    // Avoid comparing URI objects, not a good idea
    if (expected.folderQueries) {
        assert.deepStrictEqual(actual.folderQueries.map(folderQueryToCompareObject), expected.folderQueries.map(folderQueryToCompareObject));
        actual.folderQueries = [];
        expected.folderQueries = [];
    }
    if (expected.extraFileResources) {
        assert.deepStrictEqual(actual.extraFileResources.map(extraFile => extraFile.fsPath), expected.extraFileResources.map(extraFile => extraFile.fsPath));
        delete expected.extraFileResources;
        delete actual.extraFileResources;
    }
    delete actual.usingSearchPaths;
    actual.includePattern = normalizeExpression(actual.includePattern);
    actual.excludePattern = normalizeExpression(actual.excludePattern);
    cleanUndefinedQueryValues(actual);
    assert.deepStrictEqual(actual, expected);
}
export function assertEqualSearchPathResults(actual, expected, message) {
    cleanUndefinedQueryValues(actual);
    assert.deepStrictEqual({ ...actual.pattern }, { ...expected.pattern }, message);
    assert.strictEqual(actual.searchPaths && actual.searchPaths.length, expected.searchPaths && expected.searchPaths.length);
    if (actual.searchPaths) {
        actual.searchPaths.forEach((searchPath, i) => {
            const expectedSearchPath = expected.searchPaths[i];
            assert.deepStrictEqual(searchPath.pattern && { ...searchPath.pattern }, expectedSearchPath.pattern);
            assert.strictEqual(searchPath.searchPath.toString(), expectedSearchPath.searchPath.toString());
        });
    }
}
/**
 * Recursively delete all undefined property values from the search query, to make it easier to
 * assert.deepStrictEqual with some expected object.
 */
export function cleanUndefinedQueryValues(q) {
    for (const key in q) {
        if (q[key] === undefined) {
            delete q[key];
        }
        else if (typeof q[key] === 'object') {
            cleanUndefinedQueryValues(q[key]);
        }
    }
    return q;
}
export function globalGlob(pattern) {
    return [
        `**/${pattern}/**`,
        `**/${pattern}`
    ];
}
export function patternsToIExpression(...patterns) {
    return patterns.length ?
        patterns.reduce((glob, cur) => { glob[cur] = true; return glob; }, {}) :
        undefined;
}
export function getUri(...slashPathParts) {
    return uri.file(fixPath(...slashPathParts));
}
export function fixPath(...slashPathParts) {
    if (isWindows && slashPathParts.length && !slashPathParts[0].match(/^c:/i)) {
        slashPathParts.unshift('c:');
    }
    return join(...slashPathParts);
}
export function normalizeExpression(expression) {
    if (!expression) {
        return expression;
    }
    const normalized = {};
    Object.keys(expression).forEach(key => {
        normalized[key.replace(/\\/g, '/')] = expression[key];
    });
    return normalized;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicXVlcnlCdWlsZGVyLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvc2VhcmNoL3Rlc3QvYnJvd3Nlci9xdWVyeUJ1aWxkZXIudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUNoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFFNUIsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzFELE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNuRSxPQUFPLEVBQUUsR0FBRyxFQUFFLEdBQUcsSUFBSSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUNwRSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN0RyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwrRUFBK0UsQ0FBQztBQUN6SCxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwrRUFBK0UsQ0FBQztBQUN6SCxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUNwSCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUM3RixPQUFPLEVBQW9CLFlBQVksRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQzlFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUVuRSxPQUFPLEVBQUUsZUFBZSxFQUFFLHNCQUFzQixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDNUcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDdEYsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDaEcsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLGdFQUFnRSxD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