/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { IWorkspaceContextService, toWorkspaceFolder, Workspace } from 'vs/platform/workspace/common/workspace';
import { ISearchPathsInfo, QueryBuilder } from 'vs/workbench/contrib/search/common/queryBuilder';
import { TestContextService } from 'vs/workbench/test/browser/workbenchTestServices';
import { TestEnvironmentService } from 'vs/workbench/test/electron-browser/workbenchTestServices';
import { assertEqualSearchPathResults, getUri, patternsToIExpression, globalGlob, fixPath } from 'vs/workbench/contrib/search/test/browser/queryBuilder.test';

const DEFAULT_EDITOR_CONFIG = {};
const DEFAULT_USER_CONFIG = { useRipgrep: true, useIgnoreFiles: true, useGlobalIgnoreFiles: true };

suite('QueryBuilder', () => {
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
		mockConfigService.setUserConfiguration('search', DEFAULT_USER_CONFIG);
		mockConfigService.setUserConfiguration('editor', DEFAULT_EDITOR_CONFIG);
		instantiationService.stub(IConfigurationService, mockConfigService);

		mockContextService = new TestContextService();
		mockWorkspace = new Workspace('workspace', [toWorkspaceFolder(ROOT_1_URI)]);
		mockContextService.setWorkspace(mockWorkspace);

		instantiationService.stub(IWorkspaceContextService, mockContextService);
		instantiationService.stub(IEnvironmentService, TestEnvironmentService);

		queryBuilder = instantiationService.createInstance(QueryBuilder);
	});

	suite('parseSearchPaths', () => {

		function testIncludes(includePattern: string, expectedResult: ISearchPathsInfo): void {
			assertEqualSearchPathResults(
				queryBuilder.parseSearchPaths(includePattern),
				expectedResult,
				includePattern);
		}

		function testIncludesDataItem([includePattern, expectedResult]: [string, ISearchPathsInfo]): void {
			testIncludes(includePattern, expectedResult);
		}

		test('includes with tilde', () => {
			const userHome = TestEnvironmentService.userHome;
			const cases: [string, ISearchPathsInfo][] = [
				[
					'~/foo/bar',
					{
						searchPaths: [{ searchPath: getUri(userHome, '/foo/bar') }]
					}
				],
				[
					'~/foo/bar, a',
					{
						searchPaths: [{ searchPath: getUri(userHome, '/foo/bar') }],
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
});
