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
import { SearchModelImpl } from '../../browser/searchTreeModel/searchModel.js';
import { MockLabelService } from '../../../../services/label/test/common/mockLabelService.js';
import { OneLineRange } from '../../../../services/search/common/search.js';
import { TestContextService } from '../../../../test/common/workbenchTestServices.js';
import { INotebookEditorService } from '../../../notebook/browser/services/notebookEditorService.js';
import { createFileUriFromPathFromRoot, getRootName, stubModelService, stubNotebookEditorService } from './searchTestCommon.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { FILE_MATCH_PREFIX, MATCH_PREFIX } from '../../browser/searchTreeModel/searchTreeCommon.js';
import { NotebookCompatibleFileMatch } from '../../browser/notebookSearch/notebookSearchModel.js';
import { FolderMatchImpl } from '../../browser/searchTreeModel/folderMatch.js';
import { searchComparer, searchMatchComparer } from '../../browser/searchCompare.js';
import { MatchImpl } from '../../browser/searchTreeModel/match.js';
suite('Search - Viewlet', () => {
    let instantiation;
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
        const result = aSearchResult();
        result.query = {
            type: 2 /* QueryType.Text */,
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
        assert.strictEqual(fileMatch.id(), FILE_MATCH_PREFIX + URI.file(`${getRootName()}/foo`).toString());
        assert.strictEqual(lineMatch.id(), `${MATCH_PREFIX}${URI.file(`${getRootName()}/foo`).toString()}>[2,1 -> 2,2]b`);
    });
    test('Comparer', () => {
        const fileMatch1 = aFileMatch('/foo');
        const fileMatch2 = aFileMatch('/with/path');
        const fileMatch3 = aFileMatch('/with/path/foo');
        const lineMatch1 = new MatchImpl(fileMatch1, ['bar'], new OneLineRange(0, 1, 1), new OneLineRange(0, 1, 1), false);
        const lineMatch2 = new MatchImpl(fileMatch1, ['bar'], new OneLineRange(0, 1, 1), new OneLineRange(2, 1, 1), false);
        const lineMatch3 = new MatchImpl(fileMatch1, ['bar'], new OneLineRange(0, 1, 1), new OneLineRange(2, 1, 1), false);
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
        assert(searchMatchComparer(fileMatch1, fileMatch2, "fileNames" /* SearchSortOrder.FileNames */) > 0);
        // By type, bar.a < bar.b
        assert(searchMatchComparer(fileMatch3, fileMatch4, "type" /* SearchSortOrder.Type */) < 0);
    });
    test('Cross-type Comparer', () => {
        const searchResult = aSearchResult();
        const folderMatch1 = aFolderMatch('/voo', 0, searchResult.plainTextSearchResult);
        const folderMatch2 = aFolderMatch('/with', 1, searchResult.plainTextSearchResult);
        const fileMatch1 = aFileMatch('/voo/foo.a', folderMatch1);
        const fileMatch2 = aFileMatch('/with/path.c', folderMatch2);
        const fileMatch3 = aFileMatch('/with/path/bar.b', folderMatch2);
        const lineMatch1 = new MatchImpl(fileMatch1, ['bar'], new OneLineRange(0, 1, 1), new OneLineRange(0, 1, 1), false);
        const lineMatch2 = new MatchImpl(fileMatch1, ['bar'], new OneLineRange(0, 1, 1), new OneLineRange(2, 1, 1), false);
        const lineMatch3 = new MatchImpl(fileMatch2, ['barfoo'], new OneLineRange(0, 1, 1), new OneLineRange(0, 1, 1), false);
        const lineMatch4 = new MatchImpl(fileMatch2, ['fooooo'], new OneLineRange(0, 1, 1), new OneLineRange(2, 1, 1), false);
        const lineMatch5 = new MatchImpl(fileMatch3, ['foobar'], new OneLineRange(0, 1, 1), new OneLineRange(2, 1, 1), false);
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
        assert(searchComparer(fileMatch1, fileMatch3, "fileNames" /* SearchSortOrder.FileNames */) < 0);
        // bar.b < path.c
        assert(searchComparer(fileMatch3, fileMatch2, "fileNames" /* SearchSortOrder.FileNames */) < 0);
        // lineMatch4's parent is fileMatch2, "bar.b < path.c"
        assert(searchComparer(fileMatch3, lineMatch4, "fileNames" /* SearchSortOrder.FileNames */) < 0);
        // bar.b < path.c
        assert(searchComparer(fileMatch3, fileMatch2, "type" /* SearchSortOrder.Type */) < 0);
        // lineMatch4's parent is fileMatch2, "bar.b < path.c"
        assert(searchComparer(fileMatch3, lineMatch4, "type" /* SearchSortOrder.Type */) < 0);
    });
    function aFileMatch(path, parentFolder, ...lineMatches) {
        const rawMatch = {
            resource: URI.file('/' + path),
            results: lineMatches
        };
        const fileMatch = instantiation.createInstance(NotebookCompatibleFileMatch, {
            pattern: ''
        }, undefined, undefined, parentFolder ?? aFolderMatch('', 0), rawMatch, null, '');
        fileMatch.createMatches();
        store.add(fileMatch);
        return fileMatch;
    }
    function aFolderMatch(path, index, parent) {
        const searchModel = instantiation.createInstance(SearchModelImpl);
        store.add(searchModel);
        const folderMatch = instantiation.createInstance(FolderMatchImpl, createFileUriFromPathFromRoot(path), path, index, {
            type: 2 /* QueryType.Text */, folderQueries: [{ folder: createFileUriFromPathFromRoot() }], contentPattern: {
                pattern: ''
            }
        }, (parent ?? aSearchResult().folderMatches()[0]), searchModel.searchResult, null);
        store.add(folderMatch);
        return folderMatch;
    }
    function aSearchResult() {
        const searchModel = instantiation.createInstance(SearchModelImpl);
        store.add(searchModel);
        searchModel.searchResult.query = {
            type: 2 /* QueryType.Text */, folderQueries: [{ folder: createFileUriFromPathFromRoot() }], contentPattern: {
                pattern: ''
            }
        };
        return searchModel.searchResult;
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VhcmNoVmlld2xldC50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvc2VhcmNoL3Rlc3QvYnJvd3Nlci9zZWFyY2hWaWV3bGV0LnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFDaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSx5RUFBeUUsQ0FBQztBQUN4SCxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDL0UsT0FBTyxFQUFFLGdDQUFnQyxFQUFFLE1BQU0sNkVBQTZFLENBQUM7QUFDL0gsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ2xGLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLCtFQUErRSxDQUFDO0FBQ3pILE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUM5RSxPQUFPLEVBQUUsV0FBVyxFQUFFLGNBQWMsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ3hGLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBQ3RHLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQ2pHLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxnRUFBZ0UsQ0FBQztBQUMvRixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDL0UsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDOUYsT0FBTyxFQUFnQyxZQUFZLEVBQThCLE1B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LEdBQUcsVUFBVSxDQUFDLFlBQVksRUFBRSxZQUFZLENBQUMsQ0FBQztRQUMxRCxNQUFNLFVBQVUsR0FBRyxVQUFVLENBQUMsY0FBYyxFQUFFLFlBQVksQ0FBQyxDQUFDO1FBQzVELE1BQU0sVUFBVSxHQUFHLFVBQVUsQ0FBQyxrQkFBa0IsRUFBRSxZQUFZLENBQUMsQ0FBQztRQUVoRSxNQUFNLFVBQVUsR0FBRyxJQUFJLFNBQVMsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxLQUFLLENBQUMsRUFBRSxJQUFJLFlBQVksQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUksWUFBWSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDbkgsTUFBTSxVQUFVLEdBQUcsSUFBSSxTQUFTLENBQUMsVUFBVSxFQUFFLENBQUMsS0FBSyxDQUFDLEVBQUUsSUFBSSxZQUFZLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxJQUFJLFlBQVksQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRW5ILE1BQU0sVUFBVSxHQUFHLElBQUksU0FBUyxDQUFDLFVBQVUsRUFBRSxDQUFDLFFBQVEsQ0FBQyxFQUFFLElBQUksWUFBWSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsSUFBSSxZQUFZLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN0SCxNQUFNLFVBQVUsR0FBRyxJQUFJLFNBQVMsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxRQUFRLENBQUMsRUFBRSxJQUFJLFlBQVksQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUksWUFBWSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFdEgsTUFBTSxVQUFVLEdBQUcs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