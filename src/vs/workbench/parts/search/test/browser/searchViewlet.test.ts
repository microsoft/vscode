/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import uri from 'vs/base/common/uri';
import { Match, FileMatch, SearchResult } from 'vs/workbench/parts/search/common/searchModel';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { SearchSorter, SearchDataSource } from 'vs/workbench/parts/search/browser/searchResultsView';
import { IFileMatch, ILineMatch } from 'vs/platform/search/common/search';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { ModelServiceImpl } from 'vs/editor/common/services/modelServiceImpl';
import { IModelService } from 'vs/editor/common/services/modelService';

suite('Search - Viewlet', () => {
	let instantiation: TestInstantiationService;

	setup(() => {
		instantiation = new TestInstantiationService();
		instantiation.stub(IModelService, stubModelService(instantiation));
	});

	test('Data Source', function () {
		let ds = new SearchDataSource();
		let result = instantiation.createInstance(SearchResult, null);
		result.add([{
			resource: uri.parse('file:///c:/foo'),
			lineMatches: [{ lineNumber: 1, preview: 'bar', offsetAndLengths: [[0, 1]] }]
		}]);

		let fileMatch = result.matches()[0];
		let lineMatch = fileMatch.matches()[0];

		assert.equal(ds.getId(null, result), 'root');
		assert.equal(ds.getId(null, fileMatch), 'file:///c%3A/foo');
		assert.equal(ds.getId(null, lineMatch), 'file:///c%3A/foo>1>0b');

		assert(!ds.hasChildren(null, 'foo'));
		assert(ds.hasChildren(null, result));
		assert(ds.hasChildren(null, fileMatch));
		assert(!ds.hasChildren(null, lineMatch));
	});

	test('Sorter', function () {
		let fileMatch1 = aFileMatch('C:\\foo');
		let fileMatch2 = aFileMatch('C:\\with\\path');
		let fileMatch3 = aFileMatch('C:\\with\\path\\foo');
		let lineMatch1 = new Match(fileMatch1, 'bar', 1, 1, 1);
		let lineMatch2 = new Match(fileMatch1, 'bar', 2, 1, 1);
		let lineMatch3 = new Match(fileMatch1, 'bar', 2, 1, 1);

		let s = new SearchSorter();

		assert(s.compare(null, fileMatch1, fileMatch2) < 0);
		assert(s.compare(null, fileMatch2, fileMatch1) > 0);
		assert(s.compare(null, fileMatch1, fileMatch1) === 0);
		assert(s.compare(null, fileMatch2, fileMatch3) < 0);

		assert(s.compare(null, lineMatch1, lineMatch2) < 0);
		assert(s.compare(null, lineMatch2, lineMatch1) > 0);
		assert(s.compare(null, lineMatch2, lineMatch3) === 0);
	});

	function aFileMatch(path: string, searchResult?: SearchResult, ...lineMatches: ILineMatch[]): FileMatch {
		let rawMatch: IFileMatch = {
			resource: uri.file('C:\\' + path),
			lineMatches: lineMatches
		};
		return instantiation.createInstance(FileMatch, null, searchResult, rawMatch);
	}

	function stubModelService(instantiationService: TestInstantiationService): IModelService {
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		return instantiationService.createInstance(ModelServiceImpl);
	}
});