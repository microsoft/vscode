/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { URI } from 'vs/base/common/uri';
import { ILanguageConfigurationService } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { IModelService } from 'vs/editor/common/services/model';
import { ModelService } from 'vs/editor/common/services/modelService';
import { TestLanguageConfigurationService } from 'vs/editor/test/common/modes/testLanguageConfigurationService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { FileService } from 'vs/platform/files/common/fileService';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { ILabelService } from 'vs/platform/label/common/label';
import { ILogService, NullLogService } from 'vs/platform/log/common/log';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { TestThemeService } from 'vs/platform/theme/test/common/testThemeService';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { UriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentityService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { TestWorkspace } from 'vs/platform/workspace/test/common/testWorkspace';
import { FileMatch, FolderMatch, Match, searchComparer, searchMatchComparer, SearchModel, SearchResult } from 'vs/workbench/contrib/search/browser/searchModel';
import { MockLabelService } from 'vs/workbench/services/label/test/common/mockLabelService';
import { IFileMatch, ITextSearchMatch, OneLineRange, QueryType, SearchSortOrder } from 'vs/workbench/services/search/common/search';
import { TestContextService } from 'vs/workbench/test/common/workbenchTestServices';
import { INotebookEditorService } from 'vs/workbench/contrib/notebook/browser/services/notebookEditorService';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { TestEditorGroupsService, TestEditorService } from 'vs/workbench/test/browser/workbenchTestServices';
import { NotebookEditorWidgetService } from 'vs/workbench/contrib/notebook/browser/services/notebookEditorServiceImpl';
import { createFileUriFromPathFromRoot, getRootName } from 'vs/workbench/contrib/search/test/browser/searchTestCommon';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { MockContextKeyService } from 'vs/platform/keybinding/test/common/mockKeybindingService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

suite('Search - Viewlet', () => {
	let instantiation: TestInstantiationService;

	setup(() => {
		instantiation = new TestInstantiationService();
		instantiation.stub(ILanguageConfigurationService, TestLanguageConfigurationService);
		instantiation.stub(IModelService, stubModelService(instantiation));
		instantiation.stub(INotebookEditorService, stubNotebookEditorService(instantiation));

		instantiation.set(IWorkspaceContextService, new TestContextService(TestWorkspace));
		instantiation.stub(IUriIdentityService, new UriIdentityService(new FileService(new NullLogService())));
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
				preview: {
					text: 'bar',
					matches: {
						startLineNumber: 0,
						startColumn: 0,
						endLineNumber: 0,
						endColumn: 1
					}
				},
				ranges: {
					startLineNumber: 1,
					startColumn: 0,
					endLineNumber: 1,
					endColumn: 1
				}
			}]
		}], '');

		const fileMatch = result.matches()[0];
		const lineMatch = fileMatch.matches()[0];

		assert.strictEqual(fileMatch.id(), URI.file(`${getRootName()}/foo`).toString());
		assert.strictEqual(lineMatch.id(), `${URI.file(`${getRootName()}/foo`).toString()}>[2,1 -> 2,2]b`);
	});

	test('Comparer', () => {
		const fileMatch1 = aFileMatch('/foo');
		const fileMatch2 = aFileMatch('/with/path');
		const fileMatch3 = aFileMatch('/with/path/foo');
		const lineMatch1 = new Match(fileMatch1, ['bar'], new OneLineRange(0, 1, 1), new OneLineRange(0, 1, 1));
		const lineMatch2 = new Match(fileMatch1, ['bar'], new OneLineRange(0, 1, 1), new OneLineRange(2, 1, 1));
		const lineMatch3 = new Match(fileMatch1, ['bar'], new OneLineRange(0, 1, 1), new OneLineRange(2, 1, 1));

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
		const folderMatch1 = aFolderMatch('/voo', 0, searchResult);
		const folderMatch2 = aFolderMatch('/with', 1, searchResult);

		const fileMatch1 = aFileMatch('/voo/foo.a', folderMatch1);
		const fileMatch2 = aFileMatch('/with/path.c', folderMatch2);
		const fileMatch3 = aFileMatch('/with/path/bar.b', folderMatch2);

		const lineMatch1 = new Match(fileMatch1, ['bar'], new OneLineRange(0, 1, 1), new OneLineRange(0, 1, 1));
		const lineMatch2 = new Match(fileMatch1, ['bar'], new OneLineRange(0, 1, 1), new OneLineRange(2, 1, 1));

		const lineMatch3 = new Match(fileMatch2, ['barfoo'], new OneLineRange(0, 1, 1), new OneLineRange(0, 1, 1));
		const lineMatch4 = new Match(fileMatch2, ['fooooo'], new OneLineRange(0, 1, 1), new OneLineRange(2, 1, 1));

		const lineMatch5 = new Match(fileMatch3, ['foobar'], new OneLineRange(0, 1, 1), new OneLineRange(2, 1, 1));

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
		return instantiation.createInstance(FileMatch, {
			pattern: ''
		}, undefined, undefined, parentFolder ?? aFolderMatch('', 0), rawMatch, null, '');
	}

	function aFolderMatch(path: string, index: number, parent?: SearchResult): FolderMatch {
		const searchModel = instantiation.createInstance(SearchModel);
		return instantiation.createInstance(FolderMatch, createFileUriFromPathFromRoot(path), path, index, {
			type: QueryType.Text, folderQueries: [{ folder: createFileUriFromPathFromRoot() }], contentPattern: {
				pattern: ''
			}
		}, parent ?? aSearchResult().folderMatches()[0], searchModel.searchResult, null);
	}

	function aSearchResult(): SearchResult {
		const searchModel = instantiation.createInstance(SearchModel);
		searchModel.searchResult.query = {
			type: QueryType.Text, folderQueries: [{ folder: createFileUriFromPathFromRoot() }], contentPattern: {
				pattern: ''
			}
		};
		return searchModel.searchResult;
	}

	function stubModelService(instantiationService: TestInstantiationService): IModelService {
		instantiationService.stub(IThemeService, new TestThemeService());

		const config = new TestConfigurationService();
		config.setUserConfiguration('search', { searchOnType: true });
		instantiationService.stub(IConfigurationService, config);

		return instantiationService.createInstance(ModelService);
	}

	function stubNotebookEditorService(instantiationService: TestInstantiationService): INotebookEditorService {
		instantiationService.stub(IEditorGroupsService, new TestEditorGroupsService());
		instantiationService.stub(IContextKeyService, new MockContextKeyService());
		instantiationService.stub(IEditorService, new TestEditorService());
		return instantiationService.createInstance(NotebookEditorWidgetService);
	}
});
