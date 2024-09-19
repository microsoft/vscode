/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ILanguageConfigurationService } from '../../../../../editor/common/languages/languageConfigurationRegistry.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { TestLanguageConfigurationService } from '../../../../../editor/test/common/modes/testLanguageConfigurationService.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { TestWorkspace } from '../../../../../platform/workspace/test/common/testWorkspace.js';
import { FileMatch, FolderMatch, Match, searchComparer, searchMatchComparer, SearchModel, SearchResult, TextSearchResult } from '../../browser/searchModel.js';
import { MockLabelService } from '../../../../services/label/test/common/mockLabelService.js';
import { IFileMatch, ITextSearchMatch, OneLineRange, QueryType, SearchSortOrder } from '../../../../services/search/common/search.js';
import { TestContextService } from '../../../../test/common/workbenchTestServices.js';
import { INotebookEditorService } from '../../../notebook/browser/services/notebookEditorService.js';
import { createFileUriFromPathFromRoot, getRootName, stubModelService, stubNotebookEditorService } from './searchTestCommon.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('Search - Viewlet', () => {
	let instantiation: TestInstantiationService;
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		instantiation = new TestInstantiationService();
		instantiation.stub(ILanguageConfigurationService, TestLanguageConfigurationService);
		instantiation.stub(IModelService, stubModelService(instantiation, (e) => store.add(e)));
		instantiation.stub(INotebookEditorService, stubNotebookEditorService(instantiation, (e) => store.add(e)));

		instantiation.set(IWorkspaceContextService, new TestContextService(TestWorkspace));
		const fileService = new FileService(new NullLogService());
		store.add(fileService);
		const uriIdentityService = new UriIdentityService(fileService);
		store.add(uriIdentityService);
		instantiation.stub(IUriIdentityService, uriIdentityService);
		instantiation.stub(ILabelService, new MockLabelService());
		instantiation.stub(ILogService, new NullLogService());
	});

	teardown(() => {
		instantiation.dispose();
	});

	test('Data Source', function () {
		const result: SearchResult = aSearchResult();
		result.query = {
			type: QueryType.Text,
			contentPattern: { pattern: 'foo' },
			folderQueries: [{
				folder: createFileUriFromPathFromRoot()
			}]
		};

		result.add([{
			resource: createFileUriFromPathFromRoot('/foo'),
			results: [{

				previewText: 'bar',
				rangeLocations: [
					{
						preview: {
							startLineNumber: 0,
							startColumn: 0,
							endLineNumber: 0,
							endColumn: 1
						},
						source: {
							startLineNumber: 1,
							startColumn: 0,
							endLineNumber: 1,
							endColumn: 1
						}
					}
				]
			}]
		}], '', false);

		const fileMatch = result.matches()[0];
		const lineMatch = fileMatch.matches()[0];

		assert.strictEqual(fileMatch.id(), URI.file(`${getRootName()}/foo`).toString());
		assert.strictEqual(lineMatch.id(), `${URI.file(`${getRootName()}/foo`).toString()}>[2,1 -> 2,2]b`);
	});

	test('Comparer', () => {
		const fileMatch1 = aFileMatch('/foo');
		const fileMatch2 = aFileMatch('/with/path');
		const fileMatch3 = aFileMatch('/with/path/foo');
		const lineMatch1 = new Match(fileMatch1, ['bar'], new OneLineRange(0, 1, 1), new OneLineRange(0, 1, 1), false);
		const lineMatch2 = new Match(fileMatch1, ['bar'], new OneLineRange(0, 1, 1), new OneLineRange(2, 1, 1), false);
		const lineMatch3 = new Match(fileMatch1, ['bar'], new OneLineRange(0, 1, 1), new OneLineRange(2, 1, 1), false);

		assert(searchMatchComparer(fileMatch1, fileMatch2) < 0);
		assert(searchMatchComparer(fileMatch2, fileMatch1) > 0);
		assert(searchMatchComparer(fileMatch1, fileMatch1) === 0);
		assert(searchMatchComparer(fileMatch2, fileMatch3) < 0);

		assert(searchMatchComparer(lineMatch1, lineMatch2) < 0);
		assert(searchMatchComparer(lineMatch2, lineMatch1) > 0);
		assert(searchMatchComparer(lineMatch2, lineMatch3) === 0);
	});

	test('Advanced Comparer', () => {
		const fileMatch1 = aFileMatch('/with/path/foo10');
		const fileMatch2 = aFileMatch('/with/path2/foo1');
		const fileMatch3 = aFileMatch('/with/path/bar.a');
		const fileMatch4 = aFileMatch('/with/path/bar.b');

		// By default, path < path2
		assert(searchMatchComparer(fileMatch1, fileMatch2) < 0);
		// By filenames, foo10 > foo1
		assert(searchMatchComparer(fileMatch1, fileMatch2, SearchSortOrder.FileNames) > 0);
		// By type, bar.a < bar.b
		assert(searchMatchComparer(fileMatch3, fileMatch4, SearchSortOrder.Type) < 0);
	});

	test('Cross-type Comparer', () => {

		const searchResult = aSearchResult();
		const folderMatch1 = aFolderMatch('/voo', 0, searchResult.plainTextSearchResult);
		const folderMatch2 = aFolderMatch('/with', 1, searchResult.plainTextSearchResult);

		const fileMatch1 = aFileMatch('/voo/foo.a', folderMatch1);
		const fileMatch2 = aFileMatch('/with/path.c', folderMatch2);
		const fileMatch3 = aFileMatch('/with/path/bar.b', folderMatch2);

		const lineMatch1 = new Match(fileMatch1, ['bar'], new OneLineRange(0, 1, 1), new OneLineRange(0, 1, 1), false);
		const lineMatch2 = new Match(fileMatch1, ['bar'], new OneLineRange(0, 1, 1), new OneLineRange(2, 1, 1), false);

		const lineMatch3 = new Match(fileMatch2, ['barfoo'], new OneLineRange(0, 1, 1), new OneLineRange(0, 1, 1), false);
		const lineMatch4 = new Match(fileMatch2, ['fooooo'], new OneLineRange(0, 1, 1), new OneLineRange(2, 1, 1), false);

		const lineMatch5 = new Match(fileMatch3, ['foobar'], new OneLineRange(0, 1, 1), new OneLineRange(2, 1, 1), false);

		/***
		 * Structure would take the following form:
		 *
		 *	folderMatch1 (voo)
		 *		> fileMatch1 (/foo.a)
		 *			>> lineMatch1
		 *			>> lineMatch2
		 *	folderMatch2 (with)
		 *		> fileMatch2 (/path.c)
		 *			>> lineMatch4
		 *			>> lineMatch5
		 *		> fileMatch3 (/path/bar.b)
		 *			>> lineMatch3
		 *
		 */

		// for these, refer to diagram above
		assert(searchComparer(fileMatch1, fileMatch3) < 0);
		assert(searchComparer(fileMatch2, fileMatch3) < 0);
		assert(searchComparer(folderMatch2, fileMatch2) < 0);
		assert(searchComparer(lineMatch4, lineMatch5) < 0);
		assert(searchComparer(lineMatch1, lineMatch3) < 0);
		assert(searchComparer(lineMatch2, folderMatch2) < 0);

		// travel up hierarchy and order of folders take precedence. "voo < with" in indices
		assert(searchComparer(fileMatch1, fileMatch3, SearchSortOrder.FileNames) < 0);
		// bar.b < path.c
		assert(searchComparer(fileMatch3, fileMatch2, SearchSortOrder.FileNames) < 0);
		// lineMatch4's parent is fileMatch2, "bar.b < path.c"
		assert(searchComparer(fileMatch3, lineMatch4, SearchSortOrder.FileNames) < 0);

		// bar.b < path.c
		assert(searchComparer(fileMatch3, fileMatch2, SearchSortOrder.Type) < 0);
		// lineMatch4's parent is fileMatch2, "bar.b < path.c"
		assert(searchComparer(fileMatch3, lineMatch4, SearchSortOrder.Type) < 0);
	});

	function aFileMatch(path: string, parentFolder?: FolderMatch, ...lineMatches: ITextSearchMatch[]): FileMatch {
		const rawMatch: IFileMatch = {
			resource: URI.file('/' + path),
			results: lineMatches
		};
		const fileMatch = instantiation.createInstance(FileMatch, {
			pattern: ''
		}, undefined, undefined, parentFolder ?? aFolderMatch('', 0), rawMatch, null, '');
		fileMatch.createMatches(false);
		store.add(fileMatch);
		return fileMatch;
	}

	function aFolderMatch(path: string, index: number, parent?: TextSearchResult): FolderMatch {
		const searchModel = instantiation.createInstance(SearchModel);
		store.add(searchModel);
		const folderMatch = instantiation.createInstance(FolderMatch, createFileUriFromPathFromRoot(path), path, index, {
			type: QueryType.Text, folderQueries: [{ folder: createFileUriFromPathFromRoot() }], contentPattern: {
				pattern: ''
			}
		}, parent ?? aSearchResult().folderMatches()[0], searchModel.searchResult, null);
		store.add(folderMatch);
		return folderMatch;
	}

	function aSearchResult(): SearchResult {
		const searchModel = instantiation.createInstance(SearchModel);
		store.add(searchModel);

		searchModel.searchResult.query = {
			type: QueryType.Text, folderQueries: [{ folder: createFileUriFromPathFromRoot() }], contentPattern: {
				pattern: ''
			}
		};
		return searchModel.searchResult;
	}
});
