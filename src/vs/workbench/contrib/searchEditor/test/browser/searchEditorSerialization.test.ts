/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { createTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { INotebookEditorService } from '../../../notebook/browser/services/notebookEditorService.js';
import { IReplaceService } from '../../../search/browser/replace.js';
import { SearchModelImpl } from '../../../search/browser/searchTreeModel/searchModel.js';
import { ISearchResult } from '../../../search/browser/searchTreeModel/searchTreeCommon.js';
import { addToSearchResult, createFileUriFromPathFromRoot, stubModelService, stubNotebookEditorService } from '../../../search/test/browser/searchTestCommon.js';
import { MockLabelService } from '../../../../services/label/test/common/mockLabelService.js';
import { OneLineRange, QueryType, SearchSortOrder, TextSearchMatch } from '../../../../services/search/common/search.js';
import { SearchContextLinesMode, searchContextLinesModes } from '../../browser/constants.js';
import { defaultSearchConfig, extractSearchQueryFromLines, extractSearchQueryFromModel, serializeSearchConfiguration, serializeSearchResultForEditor } from '../../browser/searchEditorSerialization.js';

suite('SearchEditorSerialization', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('round trips all context line modes', () => {
		const actual = searchContextLinesModes.map(contextLinesMode => {
			const serialized = serializeSearchConfiguration({
				...defaultSearchConfig(),
				query: 'foo',
				contextLinesMode,
			});
			return {
				serialized,
				contextLinesMode: extractSearchQueryFromLines(serialized.split('\n')).contextLinesMode,
			};
		});

		assert.deepStrictEqual(actual, [
			{
				serialized: '# Query: foo\n',
				contextLinesMode: SearchContextLinesMode.Surrounding,
			},
			{
				serialized: '# Query: foo\n# ContextLinesMode: before\n',
				contextLinesMode: SearchContextLinesMode.Before,
			},
			{
				serialized: '# Query: foo\n# ContextLinesMode: after\n',
				contextLinesMode: SearchContextLinesMode.After,
			},
		]);
	});

	test('uses the surrounding mode for legacy and invalid headers', () => {
		assert.deepStrictEqual({
			legacy: extractSearchQueryFromLines(['# Query: foo', '# ContextLines: 2']).contextLinesMode,
			invalid: extractSearchQueryFromLines(['# Query: foo', '# ContextLinesMode: invalid']).contextLinesMode,
		}, {
			legacy: SearchContextLinesMode.Surrounding,
			invalid: SearchContextLinesMode.Surrounding,
		});
	});

	test('extracts the context line mode from a full configuration header', () => {
		const serialized = serializeSearchConfiguration({
			...defaultSearchConfig(),
			query: 'foo',
			isCaseSensitive: true,
			filesToInclude: '**/*.ts',
			filesToExclude: '**/*.test.ts',
			contextLines: 2,
			contextLinesMode: SearchContextLinesMode.After,
		});
		const model = store.add(createTextModel(`${serialized}\n1 result - 1 file`));

		assert.strictEqual(extractSearchQueryFromModel(model).contextLinesMode, SearchContextLinesMode.After);
	});
});

suite('SearchEditorResultSerialization', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let instantiationService: TestInstantiationService;

	setup(() => {
		instantiationService = new TestInstantiationService();
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(IModelService, stubModelService(instantiationService, disposable => store.add(disposable)));
		instantiationService.stub(INotebookEditorService, stubNotebookEditorService(instantiationService, disposable => store.add(disposable)));

		const fileService = store.add(new FileService(new NullLogService()));
		instantiationService.stub(IUriIdentityService, store.add(new UriIdentityService(fileService)));
		instantiationService.stubPromise(IReplaceService, {});
		instantiationService.stub(IReplaceService, 'replace', () => Promise.resolve(null));
		instantiationService.stub(ILabelService, new MockLabelService());
		instantiationService.stub(ILogService, new NullLogService());
	});

	teardown(() => instantiationService.dispose());

	test('serializes context before, after, or around matches', () => {
		const actual = Object.fromEntries(searchContextLinesModes.map(contextLinesMode => [
			contextLinesMode,
			serializeSearchResultForEditor(
				createSearchResult(),
				'',
				'',
				2,
				() => 'file.txt',
				SearchSortOrder.Default,
				false,
				contextLinesMode,
			).text,
		]));

		assert.deepStrictEqual(actual, {
			surrounding: '1 result - 1 file\n\nfile.txt:\n  2  before two\n  3  before one\n  4: match\n  5  after one\n  6  after two\n',
			before: '1 result - 1 file\n\nfile.txt:\n  2  before two\n  3  before one\n  4: match\n',
			after: '1 result - 1 file\n\nfile.txt:\n  4: match\n  5  after one\n  6  after two\n',
		});
	});

	test('filters and separates context relative to multiple matches', () => {
		const results = [
			{ text: 'before first', lineNumber: 3 },
			new TextSearchMatch('first', new OneLineRange(3, 0, 5)),
			{ text: 'between', lineNumber: 5 },
			new TextSearchMatch('second', new OneLineRange(5, 0, 6)),
			{ text: 'after second', lineNumber: 7 },
			{ text: 'before third', lineNumber: 13 },
			new TextSearchMatch('third', new OneLineRange(13, 0, 5)),
			{ text: 'after third', lineNumber: 15 },
		];
		const actual = Object.fromEntries(searchContextLinesModes.map(contextLinesMode => [
			contextLinesMode,
			serializeSearchResultForEditor(
				createSearchResult(results),
				'',
				'',
				1,
				() => 'file.txt',
				SearchSortOrder.Default,
				false,
				contextLinesMode,
			).text,
		]));

		assert.deepStrictEqual(actual, {
			surrounding: '3 results - 1 file\n\nfile.txt:\n   3  before first\n   4: first\n   5  between\n   6: second\n   7  after second\n\n  13  before third\n  14: third\n  15  after third\n',
			before: '3 results - 1 file\n\nfile.txt:\n   3  before first\n   4: first\n   5  between\n   6: second\n\n  13  before third\n  14: third\n',
			after: '3 results - 1 file\n\nfile.txt:\n   4: first\n   5  between\n   6: second\n   7  after second\n\n  14: third\n  15  after third\n',
		});
	});

	function createSearchResult(results = [
		{ text: 'before two', lineNumber: 2 },
		{ text: 'before one', lineNumber: 3 },
		new TextSearchMatch('match', new OneLineRange(3, 0, 5)),
		{ text: 'after one', lineNumber: 5 },
		{ text: 'after two', lineNumber: 6 },
	]): ISearchResult {
		const searchModel = store.add(instantiationService.createInstance(SearchModelImpl));
		searchModel.searchResult.query = {
			type: QueryType.Text,
			folderQueries: [{ folder: createFileUriFromPathFromRoot() }],
			contentPattern: { pattern: 'match' },
		};
		addToSearchResult(searchModel.searchResult, [{
			resource: createFileUriFromPathFromRoot('/file.txt'),
			results,
		}]);
		return searchModel.searchResult;
	}
});
