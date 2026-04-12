/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import * as sinon from 'sinon';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { SearchModelImpl } from '../../browser/searchTreeModel/searchModel.js';
import { URI } from '../../../../../base/common/uri.js';
import { TextSearchMatch, OneLineRange } from '../../../../services/search/common/search.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ModelService } from '../../../../../editor/common/services/modelService.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { IReplaceService } from '../../browser/replace.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { MockLabelService } from '../../../../services/label/test/common/mockLabelService.js';
import { INotebookEditorService } from '../../../notebook/browser/services/notebookEditorService.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { TestEditorGroupsService, TestEditorService } from '../../../../test/browser/workbenchTestServices.js';
import { NotebookEditorWidgetService } from '../../../notebook/browser/services/notebookEditorServiceImpl.js';
import { CellKind } from '../../../notebook/common/notebookCommon.js';
import { addToSearchResult, createFileUriFromPathFromRoot, getRootName } from './searchTestCommon.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CellMatch, NotebookCompatibleFileMatch } from '../../browser/notebookSearch/notebookSearchModel.js';
import { isSearchTreeFolderMatchNoRoot, MATCH_PREFIX } from '../../browser/searchTreeModel/searchTreeCommon.js';
import { FolderMatchImpl } from '../../browser/searchTreeModel/folderMatch.js';
import { SearchResultImpl } from '../../browser/searchTreeModel/searchResult.js';
import { MatchImpl } from '../../browser/searchTreeModel/match.js';
const lineOneRange = new OneLineRange(1, 0, 1);
suite('SearchResult', () => {
    let instantiationService;
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    setup(() => {
        instantiationService = new TestInstantiationService();
        instantiationService.stub(ITelemetryService, NullTelemetryService);
        instantiationService.stub(IModelService, stubModelService(instantiationService));
        instantiationService.stub(INotebookEditorService, stubNotebookEditorService(instantiationService));
        const fileService = new FileService(new NullLogService());
        store.add(fileService);
        const uriIdentityService = new UriIdentityService(fileService);
        store.add(uriIdentityService);
        instantiationService.stub(IUriIdentityService, uriIdentityService);
        instantiationService.stubPromise(IReplaceService, {});
        instantiationService.stub(IReplaceService, 'replace', () => Promise.resolve(null));
        instantiationService.stub(ILabelService, new MockLabelService());
        instantiationService.stub(ILogService, new NullLogService());
    });
    teardown(() => {
        instantiationService.dispose();
    });
    test('Line Match', function () {
        const fileMatch = aFileMatch('folder/file.txt', null);
        const lineMatch = new MatchImpl(fileMatch, ['0 foo bar'], new OneLineRange(0, 2, 5), new OneLineRange(1, 0, 5), false);
        assert.strictEqual(lineMatch.text(), '0 foo bar');
        assert.strictEqual(lineMatch.range().startLineNumber, 2);
        assert.strictEqual(lineMatch.range().endLineNumber, 2);
        assert.strictEqual(lineMatch.range().startColumn, 1);
        assert.strictEqual(lineMatch.range().endColumn, 6);
        assert.strictEqual(lineMatch.id(), MATCH_PREFIX + 'file:///folder/file.txt>[2,1 -> 2,6]foo');
        assert.strictEqual(lineMatch.fullMatchText(), 'foo');
        assert.strictEqual(lineMatch.fullMatchText(true), '0 foo bar');
    });
    test('Line Match - Remove', function () {
        const fileMatch = aFileMatch('folder/file.txt', aSearchResult(), new TextSearchMatch('foo bar', new OneLineRange(1, 0, 3)));
        const lineMatch = fileMatch.matches()[0];
        fileMatch.remove(lineMatch);
        assert.strictEqual(fileMatch.matches().length, 0);
    });
    test('File Match', function () {
        let fileMatch = aFileMatch('folder/file.txt', aSearchResult());
        assert.strictEqual(fileMatch.matches().length, 0);
        assert.strictEqual(fileMatch.resource.toString(), 'file:///folder/file.txt');
        assert.strictEqual(fileMatch.name(), 'file.txt');
        fileMatch = aFileMatch('file.txt', aSearchResult());
        assert.strictEqual(fileMatch.matches().length, 0);
        assert.strictEqual(fileMatch.resource.toString(), 'file:///file.txt');
        assert.strictEqual(fileMatch.name(), 'file.txt');
    });
    test('File Match: Select an existing match', function () {
        const testObject = aFileMatch('folder/file.txt', aSearchResult(), new TextSearchMatch('foo', new OneLineRange(1, 0, 3)), new TextSearchMatch('bar', new OneLineRange(1, 5, 3)));
        testObject.setSelectedMatch(testObject.matches()[0]);
        assert.strictEqual(testObject.matches()[0], testObject.getSelectedMatch());
    });
    test('File Match: Select non existing match', function () {
        const testObject = aFileMatch('folder/file.txt', aSearchResult(), new TextSearchMatch('foo', new OneLineRange(1, 0, 3)), new TextSearchMatch('bar', new OneLineRange(1, 5, 3)));
        const target = testObject.matches()[0];
        testObject.remove(target);
        testObject.setSelectedMatch(target);
        assert.strictEqual(testObject.getSelectedMatch(), null);
    });
    test('File Match: isSelected return true for selected match', function () {
        const testObject = aFileMatch('folder/file.txt', aSearchResult(), new TextSearchMatch('foo', new OneLineRange(1, 0, 3)), new TextSearchMatch('bar', new OneLineRange(1, 5, 3)));
        const target = testObject.matches()[0];
        testObject.setSelectedMatch(target);
        assert.ok(testObject.isMatchSelected(target));
    });
    test('File Match: isSelected return false for un-selected match', function () {
        const testObject = aFileMatch('folder/file.txt', aSearchResult(), new TextSearchMatch('foo', new OneLineRange(1, 0, 3)), new TextSearchMatch('bar', new OneLineRange(1, 5, 3)));
        testObject.setSelectedMatch(testObject.matches()[0]);
        assert.ok(!testObject.isMatchSelected(testObject.matches()[1]));
    });
    test('File Match: unselect', function () {
        const testObject = aFileMatch('folder/file.txt', aSearchResult(), new TextSearchMatch('foo', new OneLineRange(1, 0, 3)), new TextSearchMatch('bar', new OneLineRange(1, 5, 3)));
        testObject.setSelectedMatch(testObject.matches()[0]);
        testObject.setSelectedMatch(null);
        assert.strictEqual(null, testObject.getSelectedMatch());
    });
    test('File Match: unselect when not selected', function () {
        const testObject = aFileMatch('folder/file.txt', aSearchResult(), new TextSearchMatch('foo', new OneLineRange(1, 0, 3)), new TextSearchMatch('bar', new OneLineRange(1, 5, 3)));
        testObject.setSelectedMatch(null);
        assert.strictEqual(null, testObject.getSelectedMatch());
    });
    test('Match -> FileMatch -> SearchResult hierarchy exists', function () {
        const searchModel = instantiationService.createInstance(SearchModelImpl);
        store.add(searchModel);
        const searchResult = instantiationService.createInstance(SearchResultImpl, searchModel);
        store.add(searchResult);
        const fileMatch = aFileMatch('far/boo', searchResult);
        const lineMatch = new MatchImpl(fileMatch, ['foo bar'], new OneLineRange(0, 0, 3), new OneLineRange(1, 0, 3), false);
        assert(lineMatch.parent() === fileMatch);
        assert(fileMatch.parent() === searchResult.folderMatches()[0]);
    });
    test('Adding a raw match will add a file match with line matches', function () {
        const testObject = aSearchResult();
        const target = [aRawMatch('/1', new TextSearchMatch('preview 1', new OneLineRange(1, 1, 4)), new TextSearchMatch('preview 1', new OneLineRange(1, 4, 11)), new TextSearchMatch('preview 2', lineOneRange))];
        addToSearchResult(testObject, target);
        assert.strictEqual(3, testObject.count());
        const actual = testObject.matches();
        assert.strictEqual(1, actual.length);
        assert.strictEqual(URI.file(`${getRootName()}/1`).toString(), actual[0].resource.toString());
        const actuaMatches = actual[0].matches();
        assert.strictEqual(3, actuaMatches.length);
        assert.strictEqual('preview 1', actuaMatches[0].text());
        assert.ok(new Range(2, 2, 2, 5).equalsRange(actuaMatches[0].range()));
        assert.strictEqual('preview 1', actuaMatches[1].text());
        assert.ok(new Range(2, 5, 2, 12).equalsRange(actuaMatches[1].range()));
        assert.strictEqual('preview 2', actuaMatches[2].text());
        assert.ok(new Range(2, 1, 2, 2).equalsRange(actuaMatches[2].range()));
    });
    test('Adding multiple raw matches', function () {
        const testObject = aSearchResult();
        const target = [
            aRawMatch('/1', new TextSearchMatch('preview 1', new OneLineRange(1, 1, 4)), new TextSearchMatch('preview 1', new OneLineRange(1, 4, 11))),
            aRawMatch('/2', new TextSearchMatch('preview 2', lineOneRange))
        ];
        addToSearchResult(testObject, target);
        assert.strictEqual(3, testObject.count());
        const actual = testObject.matches();
        assert.strictEqual(2, actual.length);
        assert.strictEqual(URI.file(`${getRootName()}/1`).toString(), actual[0].resource.toString());
        let actuaMatches = actual[0].matches();
        assert.strictEqual(2, actuaMatches.length);
        assert.strictEqual('preview 1', actuaMatches[0].text());
        assert.ok(new Range(2, 2, 2, 5).equalsRange(actuaMatches[0].range()));
        assert.strictEqual('preview 1', actuaMatches[1].text());
        assert.ok(new Range(2, 5, 2, 12).equalsRange(actuaMatches[1].range()));
        actuaMatches = actual[1].matches();
        assert.strictEqual(1, actuaMatches.length);
        assert.strictEqual('preview 2', actuaMatches[0].text());
        assert.ok(new Range(2, 1, 2, 2).equalsRange(actuaMatches[0].range()));
    });
    test('Test that notebook matches get added correctly', function () {
        const testObject = aSearchResult();
        const cell1 = { cellKind: CellKind.Code };
        const cell2 = { cellKind: CellKind.Code };
        sinon.stub(CellMatch.prototype, 'addContext');
        const addFileMatch = sinon.spy(FolderMatchImpl.prototype, 'addFileMatch');
        const fileMatch1 = aRawFileMatchWithCells('/1', {
            cell: cell1,
            index: 0,
            contentResults: [
                new TextSearchMatch('preview 1', new OneLineRange(1, 1, 4)),
            ],
            webviewResults: [
                new TextSearchMatch('preview 1', new OneLineRange(1, 4, 11)),
                new TextSearchMatch('preview 2', lineOneRange)
            ]
        });
        const fileMatch2 = aRawFileMatchWithCells('/2', {
            cell: cell2,
            index: 0,
            contentResults: [
                new TextSearchMatch('preview 1', new OneLineRange(1, 1, 4)),
            ],
            webviewResults: [
                new TextSearchMatch('preview 1', new OneLineRange(1, 4, 11)),
                new TextSearchMatch('preview 2', lineOneRange)
            ]
        });
        const target = [fileMatch1, fileMatch2];
        addToSearchResult(testObject, target);
        assert.strictEqual(6, testObject.count());
        assert.deepStrictEqual(fileMatch1.cellResults[0].contentResults, addFileMatch.getCall(0).args[0][0].cellResults[0].contentResults);
        assert.deepStrictEqual(fileMatch1.cellResults[0].webviewResults, addFileMatch.getCall(0).args[0][0].cellResults[0].webviewResults);
        assert.deepStrictEqual(fileMatch2.cellResults[0].contentResults, addFileMatch.getCall(0).args[0][1].cellResults[0].contentResults);
        assert.deepStrictEqual(fileMatch2.cellResults[0].webviewResults, addFileMatch.getCall(0).args[0][1].cellResults[0].webviewResults);
    });
    test('Dispose disposes matches', function () {
        const target1 = sinon.spy();
        const target2 = sinon.spy();
        const testObject = aSearchResult();
        addToSearchResult(testObject, [
            aRawMatch('/1', new TextSearchMatch('preview 1', lineOneRange)),
            aRawMatch('/2', new TextSearchMatch('preview 2', lineOneRange))
        ]);
        store.add(testObject.matches()[0].onDispose(target1));
        store.add(testObject.matches()[1].onDispose(target2));
        testObject.dispose();
        assert.ok(testObject.isEmpty());
        assert.ok(target1.calledOnce);
        assert.ok(target2.calledOnce);
    });
    test('remove triggers change event', function () {
        const target = sinon.spy();
        const testObject = aSearchResult();
        addToSearchResult(testObject, [
            aRawMatch('/1', new TextSearchMatch('preview 1', lineOneRange))
        ]);
        const objectToRemove = testObject.matches()[0];
        store.add(testObject.onChange(target));
        testObject.remove(objectToRemove);
        assert.ok(target.calledOnce);
        assert.deepStrictEqual([{ elements: [objectToRemove], removed: true }], target.args[0]);
    });
    test('remove array triggers change event', function () {
        const target = sinon.spy();
        const testObject = aSearchResult();
        addToSearchResult(testObject, [
            aRawMatch('/1', new TextSearchMatch('preview 1', lineOneRange)),
            aRawMatch('/2', new TextSearchMatch('preview 2', lineOneRange))
        ]);
        const arrayToRemove = testObject.matches();
        store.add(testObject.onChange(target));
        testObject.remove(arrayToRemove);
        assert.ok(target.calledOnce);
        assert.deepStrictEqual([{ elements: arrayToRemove, removed: true }], target.args[0]);
    });
    test('Removing all line matches and adding back will add file back to result', function () {
        const testObject = aSearchResult();
        addToSearchResult(testObject, [
            aRawMatch('/1', new TextSearchMatch('preview 1', lineOneRange))
        ]);
        const target = testObject.matches()[0];
        const matchToRemove = target.matches()[0];
        target.remove(matchToRemove);
        assert.ok(testObject.isEmpty());
        target.add(matchToRemove, true);
        assert.strictEqual(1, testObject.fileCount());
        assert.strictEqual(target, testObject.matches()[0]);
    });
    test('replace should remove the file match', function () {
        const voidPromise = Promise.resolve(null);
        instantiationService.stub(IReplaceService, 'replace', voidPromise);
        const testObject = aSearchResult();
        addToSearchResult(testObject, [
            aRawMatch('/1', new TextSearchMatch('preview 1', lineOneRange))
        ]);
        testObject.replace(testObject.matches()[0]);
        return voidPromise.then(() => assert.ok(testObject.isEmpty()));
    });
    test('replace should trigger the change event', function () {
        const target = sinon.spy();
        const voidPromise = Promise.resolve(null);
        instantiationService.stub(IReplaceService, 'replace', voidPromise);
        const testObject = aSearchResult();
        addToSearchResult(testObject, [
            aRawMatch('/1', new TextSearchMatch('preview 1', lineOneRange))
        ]);
        store.add(testObject.onChange(target));
        const objectToRemove = testObject.matches()[0];
        testObject.replace(objectToRemove);
        return voidPromise.then(() => {
            assert.ok(target.calledOnce);
            assert.deepStrictEqual([{ elements: [objectToRemove], removed: true }], target.args[0]);
        });
    });
    test('replaceAll should remove all file matches', function () {
        const voidPromise = Promise.resolve(null);
        instantiationService.stubPromise(IReplaceService, 'replace', voidPromise);
        const testObject = aSearchResult();
        addToSearchResult(testObject, [
            aRawMatch('/1', new TextSearchMatch('preview 1', lineOneRange)),
            aRawMatch('/2', new TextSearchMatch('preview 2', lineOneRange))
        ]);
        testObject.replaceAll(null);
        return voidPromise.then(() => assert.ok(testObject.isEmpty()));
    });
    test('batchRemove should trigger the onChange event correctly', function () {
        const target = sinon.spy();
        const testObject = getPopulatedSearchResult();
        const folderMatch = testObject.folderMatches()[0];
        const fileMatch = testObject.folderMatches()[1].allDownstreamFileMatches()[0];
        const match = testObject.folderMatches()[1].allDownstreamFileMatches()[1].matches()[0];
        const arrayToRemove = [folderMatch, fileMatch, match];
        const expectedArrayResult = folderMatch.allDownstreamFileMatches().concat([fileMatch, match.parent()]);
        store.add(testObject.onChange(target));
        testObject.batchRemove(arrayToRemove);
        assert.ok(target.calledOnce);
        assert.deepStrictEqual([{ elements: expectedArrayResult, removed: true, added: false }], target.args[0]);
    });
    test('batchRemove should remove FolderMatchNoRoot (Other files) correctly', function () {
        const target = sinon.spy();
        const testObject = aSearchResult();
        testObject.query = {
            type: 2 /* QueryType.Text */,
            contentPattern: { pattern: 'foo' },
            folderQueries: [{
                    folder: createFileUriFromPathFromRoot('/workspace')
                }]
        };
        // Add a file inside the workspace folder
        addToSearchResult(testObject, [
            aRawMatch('/workspace/file.txt', new TextSearchMatch('preview 1', lineOneRange)),
        ]);
        // Add a file outside of the workspace folder (goes to "Other files")
        addToSearchResult(testObject, [
            aRawMatch('/other/outside.txt', new TextSearchMatch('preview 2', lineOneRange)),
        ]);
        // Should have 2 folder matches: workspace root and "Other files"
        const folderMatches = testObject.folderMatches();
        assert.strictEqual(folderMatches.length, 2);
        // Find the "Other files" folder match (FolderMatchNoRoot)
        const otherFilesMatch = folderMatches.find(fm => isSearchTreeFolderMatchNoRoot(fm));
        assert.ok(otherFilesMatch, 'Should have an Other files folder match');
        assert.strictEqual(otherFilesMatch.allDownstreamFileMatches().length, 1);
        store.add(testObject.onChange(target));
        testObject.batchRemove([otherFilesMatch]);
        assert.ok(target.calledOnce);
        // After removal, the Other files folder should be cleared
        assert.strictEqual(otherFilesMatch.allDownstreamFileMatches().length, 0);
    });
    test('batchReplace should trigger the onChange event correctly', async function () {
        const replaceSpy = sinon.spy();
        instantiationService.stub(IReplaceService, 'replace', (arg) => {
            if (Array.isArray(arg)) {
                replaceSpy(arg[0]);
            }
            else {
                replaceSpy(arg);
            }
            return Promise.resolve();
        });
        const target = sinon.spy();
        const testObject = getPopulatedSearchResult();
        const folderMatch = testObject.folderMatches()[0];
        const fileMatch = testObject.folderMatches()[1].allDownstreamFileMatches()[0];
        const match = testObject.folderMatches()[1].allDownstreamFileMatches()[1].matches()[0];
        const firstExpectedMatch = folderMatch.allDownstreamFileMatches()[0];
        const arrayToRemove = [folderMatch, fileMatch, match];
        store.add(testObject.onChange(target));
        await testObject.batchReplace(arrayToRemove);
        assert.ok(target.calledOnce);
        sinon.assert.calledThrice(replaceSpy);
        sinon.assert.calledWith(replaceSpy.firstCall, firstExpectedMatch);
        sinon.assert.calledWith(replaceSpy.secondCall, fileMatch);
        sinon.assert.calledWith(replaceSpy.thirdCall, match);
    });
    test('Creating a model with nested folders should create the correct structure', function () {
        const testObject = getPopulatedSearchResultForTreeTesting();
        const root0 = testObject.folderMatches()[0];
        const root1 = testObject.folderMatches()[1];
        const root2 = testObject.folderMatches()[2];
        const root3 = testObject.folderMatches()[3];
        const root0DownstreamFiles = root0.allDownstreamFileMatches();
        assert.deepStrictEqual(root0DownstreamFiles, [...root0.fileMatchesIterator(), ...getFolderMatchAtIndex(root0, 0).fileMatchesIterator()]);
        assert.deepStrictEqual(getFolderMatchAtIndex(root0, 0).allDownstreamFileMatches(), Array.from(getFolderMatchAtIndex(root0, 0).fileMatchesIterator()));
        assert.deepStrictEqual(getFileMatchAtIndex(getFolderMatchAtIndex(root0, 0), 0).parent(), getFolderMatchAtIndex(root0, 0));
        assert.deepStrictEqual(getFolderMatchAtIndex(root0, 0).parent(), root0);
        assert.deepStrictEqual(getFolderMatchAtIndex(root0, 0).closestRoot, root0);
        root0DownstreamFiles.forEach((e) => {
            assert.deepStrictEqual(e.closestRoot, root0);
        });
        const root1DownstreamFiles = root1.allDownstreamFileMatches();
        assert.deepStrictEqual(root1.allDownstreamFileMatches(), [...root1.fileMatchesIterator(), ...getFolderMatchAtIndex(root1, 0).fileMatchesIterator()]); // excludes the matches from nested root
        assert.deepStrictEqual(getFileMatchAtIndex(getFolderMatchAtIndex(root1, 0), 0).parent(), getFolderMatchAtIndex(root1, 0));
        root1DownstreamFiles.forEach((e) => {
            assert.deepStrictEqual(e.closestRoot, root1);
        });
        const root2DownstreamFiles = root2.allDownstreamFileMatches();
        assert.deepStrictEqual(root2DownstreamFiles, Array.from(root2.fileMatchesIterator()));
        assert.deepStrictEqual(getFileMatchAtIndex(root2, 0).parent(), root2);
        assert.deepStrictEqual(getFileMatchAtIndex(root2, 0).closestRoot, root2);
        const root3DownstreamFiles = root3.allDownstreamFileMatches();
        const root3Level3Folder = getFolderMatchAtIndex(getFolderMatchAtIndex(root3, 0), 0);
        assert.deepStrictEqual(root3DownstreamFiles, [...root3.fileMatchesIterator(), ...getFolderMatchAtIndex(root3Level3Folder, 0).fileMatchesIterator(), ...getFolderMatchAtIndex(root3Level3Folder, 1).fileMatchesIterator()].flat());
        assert.deepStrictEqual(root3Level3Folder.allDownstreamFileMatches(), getFolderMatchAtIndex(root3, 0).allDownstreamFileMatches());
        assert.deepStrictEqual(getFileMatchAtIndex(getFolderMatchAtIndex(root3Level3Folder, 1), 0).parent(), getFolderMatchAtIndex(root3Level3Folder, 1));
        assert.deepStrictEqual(getFolderMatchAtIndex(root3Level3Folder, 1).parent(), root3Level3Folder);
        assert.deepStrictEqual(root3Level3Folder.parent(), getFolderMatchAtIndex(root3, 0));
        root3DownstreamFiles.forEach((e) => {
            assert.deepStrictEqual(e.closestRoot, root3);
        });
    });
    test('Removing an intermediate folder should call OnChange() on all downstream file matches', function () {
        const target = sinon.spy();
        const testObject = getPopulatedSearchResultForTreeTesting();
        const folderMatch = getFolderMatchAtIndex(getFolderMatchAtIndex(getFolderMatchAtIndex(testObject.folderMatches()[3], 0), 0), 0);
        const expectedArrayResult = folderMatch.allDownstreamFileMatches();
        store.add(testObject.onChange(target));
        testObject.remove(folderMatch);
        assert.ok(target.calledOnce);
        assert.deepStrictEqual([{ elements: expectedArrayResult, removed: true, added: false, clearingAll: false }], target.args[0]);
    });
    test('Replacing an intermediate folder should remove all downstream folders and file matches', async function () {
        const target = sinon.spy();
        const testObject = getPopulatedSearchResultForTreeTesting();
        const folderMatch = getFolderMatchAtIndex(testObject.folderMatches()[3], 0);
        const expectedArrayResult = folderMatch.allDownstreamFileMatches();
        store.add(testObject.onChange(target));
        await testObject.batchReplace([folderMatch]);
        assert.deepStrictEqual([{ elements: expectedArrayResult, removed: true, added: false }], target.args[0]);
    });
    function aFileMatch(path, searchResult, ...lineMatches) {
        if (!searchResult) {
            searchResult = aSearchResult();
        }
        const rawMatch = {
            resource: URI.file('/' + path),
            results: lineMatches
        };
        const root = searchResult?.folderMatches()[0];
        const fileMatch = instantiationService.createInstance(NotebookCompatibleFileMatch, {
            pattern: ''
        }, undefined, undefined, root, rawMatch, null, '');
        fileMatch.createMatches();
        store.add(fileMatch);
        return fileMatch;
    }
    function aSearchResult() {
        const searchModel = instantiationService.createInstance(SearchModelImpl);
        store.add(searchModel);
        searchModel.searchResult.query = {
            type: 2 /* QueryType.Text */, folderQueries: [{ folder: createFileUriFromPathFromRoot() }], contentPattern: {
                pattern: ''
            }
        };
        return searchModel.searchResult;
    }
    function aRawMatch(resource, ...results) {
        return { resource: createFileUriFromPathFromRoot(resource), results };
    }
    function aRawFileMatchWithCells(resource, ...cellMatches) {
        return {
            resource: createFileUriFromPathFromRoot(resource),
            cellResults: cellMatches
        };
    }
    function stubModelService(instantiationService) {
        instantiationService.stub(IThemeService, new TestThemeService());
        const config = new TestConfigurationService();
        config.setUserConfiguration('search', { searchOnType: true });
        instantiationService.stub(IConfigurationService, config);
        const modelService = instantiationService.createInstance(ModelService);
        store.add(modelService);
        return modelService;
    }
    function stubNotebookEditorService(instantiationService) {
        instantiationService.stub(IEditorGroupsService, new TestEditorGroupsService());
        instantiationService.stub(IContextKeyService, new MockContextKeyService());
        instantiationService.stub(IEditorService, store.add(new TestEditorService()));
        const notebookEditorWidgetService = instantiationService.createInstance(NotebookEditorWidgetService);
        store.add(notebookEditorWidgetService);
        return notebookEditorWidgetService;
    }
    function getPopulatedSearchResult() {
        const testObject = aSearchResult();
        testObject.query = {
            type: 2 /* QueryType.Text */,
            contentPattern: { pattern: 'foo' },
            folderQueries: [{
                    folder: createFileUriFromPathFromRoot('/voo')
                },
                { folder: createFileUriFromPathFromRoot('/with') },
            ]
        };
        addToSearchResult(testObject, [
            aRawMatch('/voo/foo.a', new TextSearchMatch('preview 1', lineOneRange), new TextSearchMatch('preview 2', lineOneRange)),
            aRawMatch('/with/path/bar.b', new TextSearchMatch('preview 3', lineOneRange)),
            aRawMatch('/with/path.c', new TextSearchMatch('preview 4', lineOneRange), new TextSearchMatch('preview 5', lineOneRange)),
        ]);
        return testObject;
    }
    function getPopulatedSearchResultForTreeTesting() {
        const testObject = aSearchResult();
        testObject.query = {
            type: 2 /* QueryType.Text */,
            contentPattern: { pattern: 'foo' },
            folderQueries: [{
                    folder: createFileUriFromPathFromRoot('/voo')
                },
                {
                    folder: createFileUriFromPathFromRoot('/with')
                },
                {
                    folder: createFileUriFromPathFromRoot('/with/test')
                },
                {
                    folder: createFileUriFromPathFromRoot('/eep')
                },
            ]
        };
        /***
         * file structure looks like:
         * *voo/
         * |- foo.a
         * |- beep
         *    |- foo.c
         * 	  |- boop.c
         * *with/
         * |- path
         *    |- bar.b
         * |- path.c
         * |- *test/
         *    |- woo.c
         * eep/
         *    |- bar
         *       |- goo
         *           |- foo
         *              |- here.txt
         * 			 |- ooo
         *              |- there.txt
         *    |- eyy.y
         */
        addToSearchResult(testObject, [
            aRawMatch('/voo/foo.a', new TextSearchMatch('preview 1', lineOneRange), new TextSearchMatch('preview 2', lineOneRange)),
            aRawMatch('/voo/beep/foo.c', new TextSearchMatch('preview 1', lineOneRange), new TextSearchMatch('preview 2', lineOneRange)),
            aRawMatch('/voo/beep/boop.c', new TextSearchMatch('preview 3', lineOneRange)),
            aRawMatch('/with/path.c', new TextSearchMatch('preview 4', lineOneRange), new TextSearchMatch('preview 5', lineOneRange)),
            aRawMatch('/with/path/bar.b', new TextSearchMatch('preview 3', lineOneRange)),
            aRawMatch('/with/test/woo.c', new TextSearchMatch('preview 3', lineOneRange)),
            aRawMatch('/eep/bar/goo/foo/here.txt', new TextSearchMatch('preview 6', lineOneRange), new TextSearchMatch('preview 7', lineOneRange)),
            aRawMatch('/eep/bar/goo/ooo/there.txt', new TextSearchMatch('preview 6', lineOneRange), new TextSearchMatch('preview 7', lineOneRange)),
            aRawMatch('/eep/eyy.y', new TextSearchMatch('preview 6', lineOneRange), new TextSearchMatch('preview 7', lineOneRange))
        ]);
        return testObject;
    }
    function getFolderMatchAtIndex(parent, index) {
        return Array.from(parent.folderMatchesIterator())[index];
    }
    function getFileMatchAtIndex(parent, index) {
        return Array.from(parent.fileMatchesIterator())[index];
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VhcmNoUmVzdWx0LnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9zZWFyY2gvdGVzdC9icm93c2VyL3NlYXJjaFJlc3VsdC50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBQ2hHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEtBQUssS0FBSyxNQUFNLE9BQU8sQ0FBQztBQUMvQixPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwrRUFBK0UsQ0FBQztBQUN6SCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDL0UsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hELE9BQU8sRUFBYyxlQUFlLEVBQUUsWUFBWSxFQUErQixNQUFNLDhDQUE4QyxDQUFDO0FBQ3RJLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ2xHLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUNuRSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN0RyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwrRUFBK0UsQ0FBQztBQUN6SCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDckYsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQy9FLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUMzRCxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDckYsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sK0RBQStELENB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QUFFLENBQUMsQ0FBQztRQUN4RCxNQUFNLENBQUMsRUFBRSxDQUFDLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRXRFLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxFQUFFLFlBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBQ3hELE1BQU0sQ0FBQyxFQUFFLENBQUMsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsV0FBVyxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFdkUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLEVBQUUsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7UUFDeEQsTUFBTSxDQUFDLEVBQUUsQ0FBQyxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztJQUN2RSxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyw2QkFBNkIsRUFBRTtRQUNuQyxNQUFNLFVBQVUsR0FBRyxhQUFhLEVBQUUsQ0FBQztRQUNuQyxNQUFNLE1BQU0sR0FBRztZQUNkLFNBQVMsQ0FBQyxJQUFJLEVBQ2IsSUFBSSxlQUFlLENBQUMsV0FBVyxFQUFFLElBQUksWUFBWSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFDM0QsSUFBSSxlQUFlLENBQUMsV0FBVyxFQUFFLElBQUksWUFBWSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMs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