/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { IExpression } from 'vs/base/common/glob';
import * as paths from 'vs/base/common/paths';
import * as arrays from 'vs/base/common/arrays';
import uri from 'vs/base/common/uri';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWorkspaceContextService, Workspace } from 'vs/platform/workspace/common/workspace';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { QueryBuilder, ISearchPathsResult } from 'vs/workbench/parts/search/common/queryBuilder';
import { TestContextService } from 'vs/workbench/test/workbenchTestServices';

import { ISearchQuery, QueryType, IPatternInfo, IFolderQuery } from 'vs/platform/search/common/search';

suite('QueryBuilder', () => {
	const PATTERN_INFO: IPatternInfo = { pattern: 'a' };
	const ROOT_1 = fixPath('/foo/root1');
	const ROOT_1_URI = getUri(ROOT_1);

	let instantiationService: TestInstantiationService;
	let queryBuilder: QueryBuilder;
	let mockConfigService: TestConfigurationService;
	let mockContextService: TestContextService;
	let mockWorkspace: Workspace;

	setup(() => {
		instantiationService = new TestInstantiationService();

		mockConfigService = new TestConfigurationService();
		mockConfigService.setUserConfiguration('search', { useRipgrep: true });
		instantiationService.stub(IConfigurationService, mockConfigService);

		mockContextService = new TestContextService();
		mockWorkspace = new Workspace('workspace', 'workspace', [ROOT_1_URI]);
		mockContextService.setWorkspace(mockWorkspace);
		instantiationService.stub(IWorkspaceContextService, mockContextService);

		queryBuilder = instantiationService.createInstance(QueryBuilder);
	});

	test('simple text pattern', () => {
		assertEqualQueries(
			queryBuilder.text(PATTERN_INFO),
			<ISearchQuery>{
				contentPattern: PATTERN_INFO,
				type: QueryType.Text,
				useRipgrep: true
			});
	});

	test('folderResources', () => {
		assertEqualQueries(
			queryBuilder.text(
				PATTERN_INFO,
				[ROOT_1_URI]
			),
			<ISearchQuery>{
				contentPattern: PATTERN_INFO,
				folderQueries: [{ folder: ROOT_1_URI }],
				type: QueryType.Text,
				useRipgrep: true
			});
	});

	test('simple exclude setting', () => {
		mockConfigService.setUserConfiguration('search', {
			useRipgrep: true,
			exclude: {
				'bar/**': true
			}
		});

		assertEqualQueries(
			queryBuilder.text(
				PATTERN_INFO,
				[ROOT_1_URI]
			),
			<ISearchQuery>{
				contentPattern: PATTERN_INFO,
				folderQueries: [{
					folder: ROOT_1_URI,
					excludePattern: { 'bar/**': true }
				}],
				type: QueryType.Text,
				useRipgrep: true
			});
	});

	test('simple include', () => {
		assertEqualQueries(
			queryBuilder.text(
				PATTERN_INFO,
				[ROOT_1_URI],
				{ includePattern: './bar' }
			),
			<ISearchQuery>{
				contentPattern: PATTERN_INFO,
				folderQueries: [{
					folder: getUri(fixPath(paths.join(ROOT_1, 'bar')))
				}],
				type: QueryType.Text,
				useRipgrep: true
			});

		assertEqualQueries(
			queryBuilder.text(
				PATTERN_INFO,
				[ROOT_1_URI],
				{ includePattern: '.\\bar' }
			),
			<ISearchQuery>{
				contentPattern: PATTERN_INFO,
				folderQueries: [{
					folder: getUri(fixPath(paths.join(ROOT_1, 'bar')))
				}],
				type: QueryType.Text,
				useRipgrep: true
			});
	});

	test('exclude setting and searchPath', () => {
		mockConfigService.setUserConfiguration('search', {
			useRipgrep: true,
			exclude: {
				'foo/**/*.js': true
			}
		});

		assertEqualQueries(
			queryBuilder.text(
				PATTERN_INFO,
				[ROOT_1_URI],
				{ includePattern: './foo' }
			),
			<ISearchQuery>{
				contentPattern: PATTERN_INFO,
				folderQueries: [{
					folder: getUri(paths.join(ROOT_1, 'foo'))
				}],
				excludePattern: { [paths.join(ROOT_1, 'foo/**/*.js')]: true },
				type: QueryType.Text,
				useRipgrep: true
			});
	});

	test('multiroot exclude settings', () => {
		const ROOT_2 = fixPath('/project/root2');
		const ROOT_2_URI = getUri(ROOT_2);
		const ROOT_3 = fixPath('/project/root3');
		const ROOT_3_URI = getUri(ROOT_3);
		mockWorkspace.roots = [ROOT_1_URI, ROOT_2_URI, ROOT_3_URI];
		mockWorkspace.configuration = uri.file(fixPath('/config'));

		mockConfigService.setUserConfiguration('search', {
			useRipgrep: true,
			exclude: { 'foo/**/*.js': true }
		}, ROOT_1_URI);

		mockConfigService.setUserConfiguration('search', {
			useRipgrep: true,
			exclude: { 'bar': true }
		}, ROOT_2_URI);

		// There are 3 roots, the first two have search.exclude settings, test that the correct basic query is returned
		assertEqualQueries(
			queryBuilder.text(
				PATTERN_INFO,
				[ROOT_1_URI, ROOT_2_URI, ROOT_3_URI]
			),
			<ISearchQuery>{
				contentPattern: PATTERN_INFO,
				folderQueries: [
					{ folder: ROOT_1_URI, excludePattern: patternsToIExpression('foo/**/*.js') },
					{ folder: ROOT_2_URI, excludePattern: patternsToIExpression('bar') },
					{ folder: ROOT_3_URI }
				],
				type: QueryType.Text,
				useRipgrep: true
			}
		);

		// Now test that it merges the root excludes when an 'include' is used
		assertEqualQueries(
			queryBuilder.text(
				PATTERN_INFO,
				[ROOT_1_URI, ROOT_2_URI, ROOT_3_URI],
				{ includePattern: './root2/src' }
			),
			<ISearchQuery>{
				contentPattern: PATTERN_INFO,
				folderQueries: [
					{ folder: getUri(paths.join(ROOT_2, 'src')) }
				],
				excludePattern: patternsToIExpression(paths.join(ROOT_1, 'foo/**/*.js'), paths.join(ROOT_2, 'bar')),
				type: QueryType.Text,
				useRipgrep: true
			}
		);
	});

	test('simple exclude input pattern', () => {
		assertEqualQueries(
			queryBuilder.text(
				PATTERN_INFO,
				[ROOT_1_URI],
				{ excludePattern: 'foo' }
			),
			<ISearchQuery>{
				contentPattern: PATTERN_INFO,
				folderQueries: [{
					folder: ROOT_1_URI
				}],
				type: QueryType.Text,
				excludePattern: patternsToIExpression(...globalGlob('foo')),
				useRipgrep: true
			});
	});

	test('exclude ./ syntax', () => {
		assertEqualQueries(
			queryBuilder.text(
				PATTERN_INFO,
				[ROOT_1_URI],
				{ excludePattern: './bar' }
			),
			<ISearchQuery>{
				contentPattern: PATTERN_INFO,
				folderQueries: [{
					folder: ROOT_1_URI
				}],
				excludePattern: patternsToIExpression(fixPath(paths.join(ROOT_1, 'bar'))),
				type: QueryType.Text,
				useRipgrep: true
			});

		assertEqualQueries(
			queryBuilder.text(
				PATTERN_INFO,
				[ROOT_1_URI],
				{ excludePattern: './bar/**/*.ts' }
			),
			<ISearchQuery>{
				contentPattern: PATTERN_INFO,
				folderQueries: [{
					folder: ROOT_1_URI
				}],
				excludePattern: patternsToIExpression(fixPath(paths.join(ROOT_1, 'bar/**/*.ts'))),
				type: QueryType.Text,
				useRipgrep: true
			});

		assertEqualQueries(
			queryBuilder.text(
				PATTERN_INFO,
				[ROOT_1_URI],
				{ excludePattern: '.\\bar\\**\\*.ts' }
			),
			<ISearchQuery>{
				contentPattern: PATTERN_INFO,
				folderQueries: [{
					folder: ROOT_1_URI
				}],
				excludePattern: patternsToIExpression(fixPath(paths.join(ROOT_1, 'bar/**/*.ts'))),
				type: QueryType.Text,
				useRipgrep: true
			});
	});

	test('extraFileResources', () => {
		assertEqualQueries(
			queryBuilder.text(
				PATTERN_INFO,
				[ROOT_1_URI],
				{ extraFileResources: [getUri('/foo/bar.js')] }
			),
			<ISearchQuery>{
				contentPattern: PATTERN_INFO,
				folderQueries: [{
					folder: ROOT_1_URI
				}],
				extraFileResources: [getUri('/foo/bar.js')],
				type: QueryType.Text,
				useRipgrep: true
			});

		assertEqualQueries(
			queryBuilder.text(
				PATTERN_INFO,
				[ROOT_1_URI],
				{
					extraFileResources: [getUri('/foo/bar.js')],
					excludePattern: '*.js'
				}
			),
			<ISearchQuery>{
				contentPattern: PATTERN_INFO,
				folderQueries: [{
					folder: ROOT_1_URI
				}],
				excludePattern: patternsToIExpression(...globalGlob('*.js')),
				type: QueryType.Text,
				useRipgrep: true
			});

		assertEqualQueries(
			queryBuilder.text(
				PATTERN_INFO,
				[ROOT_1_URI],
				{
					extraFileResources: [getUri('/foo/bar.js')],
					includePattern: '*.txt'
				}
			),
			<ISearchQuery>{
				contentPattern: PATTERN_INFO,
				folderQueries: [{
					folder: ROOT_1_URI
				}],
				includePattern: patternsToIExpression(...globalGlob('*.txt')),
				type: QueryType.Text,
				useRipgrep: true
			});
	});

	suite('parseSearchPaths', () => {
		test('simple includes', () => {
			function testSimpleIncludes(includePattern: string, expectedPatterns: string[]): void {
				assert.deepEqual(
					queryBuilder.parseSearchPaths(includePattern),
					<ISearchPathsResult>{
						pattern: patternsToIExpression(...arrays.flatten(expectedPatterns.map(globalGlob)))
					},
					includePattern);
			}

			[
				['a', ['a']],
				['a/b', ['a/b']],
				['a/b,  c', ['a/b', 'c']],
				['a,.txt', ['a', '*.txt']],
				['a,,,b', ['a', 'b']],
				['**/a,b/**', ['**/a', 'b/**']]
			].forEach(([includePattern, expectedPatterns]) => testSimpleIncludes(<string>includePattern, <string[]>expectedPatterns));
		});

		function testIncludes(includePattern: string, expectedResult: ISearchPathsResult): void {
			assertEqualSearchPathResults(
				queryBuilder.parseSearchPaths(includePattern),
				expectedResult,
				includePattern);
		}

		function testIncludesDataItem([includePattern, expectedResult]): void {
			testIncludes(<string>includePattern, <ISearchPathsResult>expectedResult);
		}

		test('absolute includes', () => {
			[
				[
					fixPath('/foo/bar'),
					<ISearchPathsResult>{
						searchPaths: [{ searchPath: getUri('/foo/bar') }]
					}
				],
				[
					fixPath('/foo/bar') + ',' + 'a',
					<ISearchPathsResult>{
						searchPaths: [{ searchPath: getUri('/foo/bar') }],
						pattern: patternsToIExpression(...globalGlob('a'))
					}
				],
				[
					fixPath('/foo/bar') + ',' + fixPath('/1/2'),
					<ISearchPathsResult>{
						searchPaths: [{ searchPath: getUri('/foo/bar') }, { searchPath: getUri('/1/2') }]
					}
				],
				[
					fixPath('/foo/bar') + ',' + fixPath('/foo/../foo/bar/fooar/..'),
					<ISearchPathsResult>{
						searchPaths: [{
							searchPath: getUri('/foo/bar')
						}]
					}
				],
				[
					fixPath('/foo/bar/**/*.ts'),
					<ISearchPathsResult>{
						searchPaths: [{
							searchPath: getUri('/foo/bar'),
							pattern: '**/*.ts'
						}]
					}
				],
				[
					fixPath('/foo/bar/*a/b/c'),
					<ISearchPathsResult>{
						searchPaths: [{
							searchPath: getUri('/foo/bar'),
							pattern: '*a/b/c'
						}]
					}
				],
				[
					fixPath('/*a/b/c'),
					<ISearchPathsResult>{
						searchPaths: [{
							searchPath: getUri('/'),
							pattern: '*a/b/c'
						}]
					}
				],
				[
					fixPath('/foo/{b,c}ar'),
					<ISearchPathsResult>{
						searchPaths: [{
							searchPath: getUri('/foo'),
							pattern: '{b,c}ar'
						}]
					}
				]
			].forEach(testIncludesDataItem);
		});

		test('relative includes w/single root folder', () => {
			[
				[
					'./a',
					<ISearchPathsResult>{
						searchPaths: [{
							searchPath: getUri(ROOT_1 + '/a')
						}]
					}
				],
				[
					'./a/*b/c',
					<ISearchPathsResult>{
						searchPaths: [{
							searchPath: getUri(ROOT_1 + '/a'),
							pattern: '*b/c'
						}]
					}
				],
				[
					'./a/*b/c, ' + fixPath('/project/foo'),
					<ISearchPathsResult>{
						searchPaths: [
							{
								searchPath: getUri(ROOT_1 + '/a'),
								pattern: '*b/c'
							},
							{
								searchPath: getUri('/project/foo')
							}]
					}
				],
				[
					'./a/b/..,./a',
					<ISearchPathsResult>{
						searchPaths: [{
							searchPath: getUri(ROOT_1 + '/a')
						}]
					}
				],
			].forEach(testIncludesDataItem);
		});

		test('relative includes w/two root folders', () => {
			const ROOT_2 = '/project/root2';
			mockWorkspace.roots = [ROOT_1_URI, getUri(ROOT_2)];
			mockWorkspace.configuration = uri.file(fixPath('config'));

			[
				[
					'./root1',
					<ISearchPathsResult>{
						searchPaths: [{
							searchPath: getUri(ROOT_1)
						}]
					}
				],
				[
					'./root2',
					<ISearchPathsResult>{
						searchPaths: [{
							searchPath: getUri(ROOT_2),
						}]
					}
				],
				[
					'./root1/a/**/b, ./root2/**/*.txt',
					<ISearchPathsResult>{
						searchPaths: [
							{
								searchPath: getUri(ROOT_1 + '/a'),
								pattern: '**/b'
							},
							{
								searchPath: getUri(ROOT_2),
								pattern: '**/*.txt'
							}]
					}
				]
			].forEach(testIncludesDataItem);
		});

		test('relative includes w/multiple ambiguous root folders', () => {
			const ROOT_2 = '/project/rootB';
			const ROOT_3 = '/otherproject/rootB';
			mockWorkspace.roots = [ROOT_1_URI, getUri(ROOT_2), getUri(ROOT_3)];
			mockWorkspace.configuration = uri.file(fixPath('/config'));

			[
				[
					'',
					<ISearchPathsResult>{
						searchPaths: undefined
					}
				],
				[
					'./',
					<ISearchPathsResult>{
						searchPaths: undefined
					}
				],
				[
					'./root1',
					<ISearchPathsResult>{
						searchPaths: [{
							searchPath: getUri(ROOT_1)
						}]
					}
				],
				[
					'./root1,./',
					<ISearchPathsResult>{
						searchPaths: [{
							searchPath: getUri(ROOT_1)
						}]
					}
				],
				[
					'./rootB',
					<ISearchPathsResult>{
						searchPaths: [
							{
								searchPath: getUri(ROOT_2),
							},
							{
								searchPath: getUri(ROOT_3),
							}]
					}
				],
				[
					'./rootB/a/**/b, ./rootB/b/**/*.txt',
					<ISearchPathsResult>{
						searchPaths: [
							{
								searchPath: getUri(ROOT_2 + '/a'),
								pattern: '**/b'
							},
							{
								searchPath: getUri(ROOT_3 + '/a'),
								pattern: '**/b'
							},
							{
								searchPath: getUri(ROOT_2 + '/b'),
								pattern: '**/*.txt'
							},
							{
								searchPath: getUri(ROOT_3 + '/b'),
								pattern: '**/*.txt'
							}]
					}
				]
			].forEach(testIncludesDataItem);
		});
	});
});

function assertEqualQueries(actual: ISearchQuery, expected: ISearchQuery): void {
	const folderQueryToCompareObject = (fq: IFolderQuery) => {
		return {
			path: fq.folder.fsPath,
			excludePattern: normalizeExpression(fq.excludePattern),
			includePattern: normalizeExpression(fq.includePattern),
			fileEncoding: fq.fileEncoding
		};
	};

	// Avoid comparing URI objects, not a good idea
	if (expected.folderQueries) {
		assert.deepEqual(actual.folderQueries.map(folderQueryToCompareObject), expected.folderQueries.map(folderQueryToCompareObject));
		delete actual.folderQueries;
		delete expected.folderQueries;
	}

	if (expected.extraFileResources) {
		assert.deepEqual(actual.extraFileResources.map(extraFile => extraFile.fsPath), expected.extraFileResources.map(extraFile => extraFile.fsPath));
		delete expected.extraFileResources;
		delete actual.extraFileResources;
	}

	delete actual.usingSearchPaths;
	actual.includePattern = normalizeExpression(actual.includePattern);
	actual.excludePattern = normalizeExpression(actual.excludePattern);
	cleanUndefinedQueryValues(actual);

	assert.deepEqual(actual, expected);
}

function assertEqualSearchPathResults(actual: ISearchPathsResult, expected: ISearchPathsResult, message?: string): void {
	cleanUndefinedQueryValues(actual);
	assert.deepEqual(actual.pattern, expected.pattern, message);

	assert.equal(actual.searchPaths && actual.searchPaths.length, expected.searchPaths && expected.searchPaths.length);
	if (actual.searchPaths) {
		actual.searchPaths.forEach((searchPath, i) => {
			const expectedSearchPath = expected.searchPaths[i];
			assert.equal(searchPath.pattern, expectedSearchPath.pattern);
			assert.equal(searchPath.searchPath.toString(), expectedSearchPath.searchPath.toString());
		});
	}
}

/**
 * Recursively delete all undefined property values from the search query, to make it easier to
 * assert.deepEqual with some expected object.
 */
function cleanUndefinedQueryValues(q: any): void {
	for (let key in q) {
		if (q[key] === undefined) {
			delete q[key];
		} else if (typeof q[key] === 'object') {
			cleanUndefinedQueryValues(q[key]);
		}
	}

	return q;
}

function globalGlob(pattern: string): string[] {
	return [
		`**/${pattern}/**`,
		`**/${pattern}`
	];
}

function patternsToIExpression(...patterns: string[]): IExpression {
	return patterns.length ?
		patterns.reduce((glob, cur) => { glob[cur] = true; return glob; }, Object.create(null)) :
		undefined;
}

function getUri(slashPath: string): uri {
	return uri.file(fixPath(slashPath));
}

function fixPath(slashPath: string): string {
	return process.platform === 'win32' ?
		(slashPath.match(/^c:/) ? slashPath : paths.join('c:', ...slashPath.split('/'))) :
		slashPath;
}

function normalizeExpression(expression: IExpression): IExpression {
	if (!expression) {
		return expression;
	}

	const normalized = Object.create(null);
	Object.keys(expression).forEach(key => {
		normalized[key.replace(/\\/g, '/')] = true;
	});

	return normalized;
}
