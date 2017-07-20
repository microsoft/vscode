/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { IExpression } from 'vs/base/common/glob';
import uri from 'vs/base/common/uri';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWorkspaceContextService, Workspace } from 'vs/platform/workspace/common/workspace';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { QueryBuilder, ISearchPathsResult } from 'vs/workbench/parts/search/common/queryBuilder';
import { TestContextService } from 'vs/workbench/test/workbenchTestServices';

import { ISearchQuery, QueryType, IPatternInfo } from 'vs/platform/search/common/search';

suite('SearchQuery', () => {
	const PATTERN_INFO: IPatternInfo = { pattern: 'a' };
	const ROOT_1 = `/foo/root1`;
	const ROOT_1_URI = uri.parse(ROOT_1);

	let instantiationService: TestInstantiationService;
	let queryBuilder: QueryBuilder;
	let mockConfigService: TestConfigurationService;
	let mockContextService: TestContextService;
	let mockWorkspace: Workspace;

	setup(() => {
		instantiationService = new TestInstantiationService();

		mockConfigService = new TestConfigurationService();
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
		mockConfigService.setUserConfiguration('search', { useRipgrep: true });
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

	suite('parseSearchPaths', () => {
		test('simple includes', () => {
			function testSimpleIncludes(includePattern: string, expectedPatterns: string[]): void {
				assert.deepEqual(
					queryBuilder.parseSearchPaths(includePattern),
					<ISearchPathsResult>{
						includePattern: patternsToIExpression(...expectedPatterns.map(globalGlob))
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
					'/foo/bar',
					<ISearchPathsResult>{
						searchPaths: [{ searchPath: uri.parse('/foo/bar') }]
					}
				],
				[
					'/foo/bar,a',
					<ISearchPathsResult>{
						searchPaths: [{ searchPath: uri.parse('/foo/bar') }],
						includePattern: patternsToIExpression(globalGlob('a'))
					}
				],
				[
					'/foo/bar, /1/2',
					<ISearchPathsResult>{
						searchPaths: [{ searchPath: uri.parse('/foo/bar') }, { searchPath: uri.parse('/1/2') }]
					}
				],
				[
					'/foo/bar/**/*.ts',
					<ISearchPathsResult>{
						searchPaths: [{
							searchPath: uri.parse('/foo/bar'),
							pattern: '**/*.ts'
						}]
					}
				],
				[
					'/foo/bar/*a/b/c',
					<ISearchPathsResult>{
						searchPaths: [{
							searchPath: uri.parse('/foo/bar'),
							pattern: '*a/b/c'
						}]
					}
				],
				[
					'/*a/b/c',
					<ISearchPathsResult>{
						searchPaths: [{
							searchPath: uri.parse('/'),
							pattern: '*a/b/c'
						}]
					}
				],
				[
					'/foo/{b,c}ar',
					<ISearchPathsResult>{
						searchPaths: [{
							searchPath: uri.parse('/foo'),
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
							searchPath: uri.parse(ROOT_1 + '/a')
						}]
					}
				],
				[
					'./a/*b/c',
					<ISearchPathsResult>{
						searchPaths: [{
							searchPath: uri.parse(ROOT_1 + '/a'),
							pattern: '*b/c'
						}]
					}
				],
				[
					'./a/*b/c, /project/foo',
					<ISearchPathsResult>{
						searchPaths: [
							{
								searchPath: uri.parse(ROOT_1 + '/a'),
								pattern: '*b/c'
							},
							{
								searchPath: uri.parse('/project/foo')
							}]
					}
				]
			].forEach(testIncludesDataItem);
		});

		test('relative includes w/two root folders', () => {
			const ROOT_2 = '/project/root2';
			mockWorkspace.roots = [ROOT_1_URI, uri.parse(ROOT_2)];

			[
				[
					'./root1',
					<ISearchPathsResult>{
						searchPaths: [{
							searchPath: uri.parse(ROOT_1)
						}]
					}
				],
				[
					'./root2',
					<ISearchPathsResult>{
						searchPaths: [{
							searchPath: uri.parse(ROOT_2),
						}]
					}
				],
				[
					'./root1/a/**/b, ./root2/**/*.txt',
					<ISearchPathsResult>{
						searchPaths: [
							{
								searchPath: uri.parse(ROOT_1 + '/a'),
								pattern: '**/b'
							},
							{
								searchPath: uri.parse(ROOT_2),
								pattern: '**/*.txt'
							}]
					}
				]
			].forEach(testIncludesDataItem);
		});

		test('relative includes w/multiple ambiguous root folders', () => {
			const ROOT_2 = '/project/rootB';
			const ROOT_3 = '/otherproject/rootB';
			mockWorkspace.roots = [ROOT_1_URI, uri.parse(ROOT_2), uri.parse(ROOT_3)];

			[
				[
					'./root1',
					<ISearchPathsResult>{
						searchPaths: [{
							searchPath: uri.parse(ROOT_1)
						}]
					}
				],
				[
					'./rootB',
					<ISearchPathsResult>{
						searchPaths: [
							{
								searchPath: uri.parse(ROOT_2),
							},
							{
								searchPath: uri.parse(ROOT_3),
							}]
					}
				],
				[
					'./rootB/a/**/b, ./rootB/b/**/*.txt',
					<ISearchPathsResult>{
						searchPaths: [
							{
								searchPath: uri.parse(ROOT_2 + '/a'),
								pattern: '**/b'
							},
							{
								searchPath: uri.parse(ROOT_3 + '/a'),
								pattern: '**/b'
							},
							{
								searchPath: uri.parse(ROOT_2 + '/b'),
								pattern: '**/*.txt'
							},
							{
								searchPath: uri.parse(ROOT_3 + '/b'),
								pattern: '**/*.txt'
							}]
					}
				]
			].forEach(testIncludesDataItem);
		});
	});
});

function assertEqualQueries(actual: ISearchQuery, expected: ISearchQuery): void {
	cleanUndefinedQueryValues(actual);
	assert.deepEqual(actual, expected);
}

function assertEqualSearchPathResults(actual: ISearchPathsResult, expected: ISearchPathsResult, message?: string): void {
	cleanUndefinedQueryValues(actual);
	assert.deepEqual(actual.includePattern, expected.includePattern, message);

	assert.equal(actual.searchPaths && actual.searchPaths.length, expected.searchPaths && expected.searchPaths.length);
	actual.searchPaths.forEach((searchPath, i) => {
		const expectedSearchPath = expected.searchPaths[i];
		assert.equal(searchPath.pattern, expectedSearchPath.pattern);
		assert.equal(searchPath.searchPath.toString(), expectedSearchPath.searchPath.toString());
	});
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

function globalGlob(str: string): string {
	return `{${str}/**,**/${str}}`;
}

function patternsToIExpression(...patterns: string[]): IExpression {
	return patterns.length ?
		patterns.reduce((glob, cur) => { glob[cur] = true; return glob; }, Object.create(null)) :
		undefined;
}
