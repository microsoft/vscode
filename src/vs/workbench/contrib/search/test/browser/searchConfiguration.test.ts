/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { deepClone } from '../../../../../base/common/objects.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ConfigurationModel } from '../../../../../platform/configuration/common/configurationModels.js';
import { Extensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { QueryBuilder } from '../../../../services/search/common/queryBuilder.js';
import { DEFAULT_MAX_SEARCH_RESULTS, ISearchConfigurationProperties, SearchSortOrder } from '../../../../services/search/common/search.js';
import { TestContextService } from '../../../../test/common/workbenchTestServices.js';
import '../../browser/search.common.contribution.js';

// Capture the common contribution before configuration tests clear the global registry.
const sharedSearchConfiguration = deepClone(Registry.as<IConfigurationRegistry>(Extensions.Configuration)
	.getConfigurations().find(node => node.properties?.['search.searchOnType']));

suite('Shared search configuration', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let searchConfiguration: ISearchConfigurationProperties;
	let configurationService: TestConfigurationService;
	let queryBuilder: QueryBuilder;
	const folder = URI.file('/workspace');

	setup(() => {
		assert.ok(sharedSearchConfiguration?.properties);
		const defaults = ConfigurationModel.createEmptyModel(new NullLogService());
		for (const [key, schema] of Object.entries(sharedSearchConfiguration.properties)) {
			defaults.setValue(key, deepClone(schema.default));
		}
		const searchDefaults = defaults.getValue<ISearchConfigurationProperties>('search');
		assert.ok(searchDefaults);
		searchConfiguration = searchDefaults;
		configurationService = new TestConfigurationService({ search: searchConfiguration, editor: {} });
		store.add(configurationService.onDidChangeConfigurationEmitter);
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IWorkspaceContextService, new TestContextService());
		queryBuilder = instantiationService.createInstance(QueryBuilder);
	});

	test('registers shared search defaults without the Search view', () => {
		assert.deepStrictEqual({
			exclude: { ...searchConfiguration.exclude },
			useIgnoreFiles: searchConfiguration.useIgnoreFiles,
			useGlobalIgnoreFiles: searchConfiguration.useGlobalIgnoreFiles,
			useParentIgnoreFiles: searchConfiguration.useParentIgnoreFiles,
			followSymlinks: searchConfiguration.followSymlinks,
			smartCase: searchConfiguration.smartCase,
			maxResults: searchConfiguration.maxResults,
			sortOrder: searchConfiguration.sortOrder,
			maxThreads: configurationService.getValue<number>('search.ripgrep.maxThreads'),
		}, {
			exclude: { '**/node_modules': true, '**/bower_components': true, '**/*.code-search': true },
			useIgnoreFiles: true,
			useGlobalIgnoreFiles: false,
			useParentIgnoreFiles: false,
			followSymlinks: true,
			smartCase: false,
			maxResults: DEFAULT_MAX_SEARCH_RESULTS,
			sortOrder: SearchSortOrder.Default,
			maxThreads: 0,
		});
	});

	test('text and file searches respect ignore files and excludes by default', () => {
		const queries = [
			queryBuilder.text({ pattern: 'needle' }, [folder]),
			queryBuilder.file([folder]),
		];
		assert.deepStrictEqual(queries.map(query => {
			const folderQuery = query.folderQueries[0];
			return {
				disregardIgnoreFiles: folderQuery.disregardIgnoreFiles,
				disregardGlobalIgnoreFiles: folderQuery.disregardGlobalIgnoreFiles,
				disregardParentIgnoreFiles: folderQuery.disregardParentIgnoreFiles,
				ignoreSymlinks: folderQuery.ignoreSymlinks,
				excludePattern: folderQuery.excludePattern,
			};
		}), [0, 1].map(() => ({
			disregardIgnoreFiles: false,
			disregardGlobalIgnoreFiles: true,
			disregardParentIgnoreFiles: true,
			ignoreSymlinks: false,
			excludePattern: [{
				folder: undefined,
				pattern: { '**/node_modules': true, '**/bower_components': true, '**/*.code-search': true },
			}],
		})));
	});

	test('preserves explicit ignore file settings', async () => {
		await configurationService.setUserConfiguration('search', {
			...searchConfiguration,
			useIgnoreFiles: false,
			useGlobalIgnoreFiles: true,
			useParentIgnoreFiles: true,
		});
		const folderQuery = queryBuilder.text({ pattern: 'needle' }, [folder]).folderQueries[0];
		assert.deepStrictEqual({
			disregardIgnoreFiles: folderQuery.disregardIgnoreFiles,
			disregardGlobalIgnoreFiles: folderQuery.disregardGlobalIgnoreFiles,
			disregardParentIgnoreFiles: folderQuery.disregardParentIgnoreFiles,
		}, {
			disregardIgnoreFiles: true,
			disregardGlobalIgnoreFiles: false,
			disregardParentIgnoreFiles: false,
		});
	});

	test('can disable exclude settings and ignore files for a search', () => {
		const folderQuery = queryBuilder.text({ pattern: 'needle' }, [folder], {
			disregardIgnoreFiles: true,
			disregardExcludeSettings: true,
		}).folderQueries[0];
		assert.deepStrictEqual({
			disregardIgnoreFiles: folderQuery.disregardIgnoreFiles,
			excludePattern: folderQuery.excludePattern,
		}, {
			disregardIgnoreFiles: true,
			excludePattern: [],
		});
	});
});
