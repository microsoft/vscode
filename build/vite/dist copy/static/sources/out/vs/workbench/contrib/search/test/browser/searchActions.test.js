/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { OS } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { USLayoutResolvedKeybinding } from '../../../../../platform/keybinding/common/usLayoutResolvedKeybinding.js';
import { getElementToFocusAfterRemoved, getLastNodeFromSameType } from '../../browser/searchActionsRemoveReplace.js';
import { SearchModelImpl } from '../../browser/searchTreeModel/searchModel.js';
import { MockObjectTree } from './mockSearchTree.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { INotebookEditorService } from '../../../notebook/browser/services/notebookEditorService.js';
import { createFileUriFromPathFromRoot, stubModelService, stubNotebookEditorService } from './searchTestCommon.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { FolderMatchImpl } from '../../browser/searchTreeModel/folderMatch.js';
import { NotebookCompatibleFileMatch } from '../../browser/notebookSearch/notebookSearchModel.js';
import { MatchImpl } from '../../browser/searchTreeModel/match.js';
suite('Search Actions', () => {
    let instantiationService;
    let counter;
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    setup(() => {
        instantiationService = new TestInstantiationService();
        instantiationService.stub(IModelService, stubModelService(instantiationService, (e) => store.add(e)));
        instantiationService.stub(INotebookEditorService, stubNotebookEditorService(instantiationService, (e) => store.add(e)));
        instantiationService.stub(IKeybindingService, {});
        instantiationService.stub(ILabelService, { getUriBasenameLabel: (uri) => '' });
        instantiationService.stub(IKeybindingService, 'resolveKeybinding', (keybinding) => USLayoutResolvedKeybinding.resolveKeybinding(keybinding, OS));
        instantiationService.stub(IKeybindingService, 'lookupKeybinding', (id) => null);
        instantiationService.stub(IKeybindingService, 'lookupKeybinding', (id) => null);
        counter = 0;
    });
    teardown(() => {
        instantiationService.dispose();
    });
    test('get next element to focus after removing a match when it has next sibling file', async function () {
        const fileMatch1 = aFileMatch();
        const fileMatch2 = aFileMatch();
        const data = [fileMatch1, aMatch(fileMatch1), aMatch(fileMatch1), fileMatch2, aMatch(fileMatch2), aMatch(fileMatch2)];
        const tree = aTree(data);
        const target = data[2];
        const actual = await getElementToFocusAfterRemoved(tree, target, [target]);
        assert.strictEqual(data[4], actual);
    });
    test('get next element to focus after removing a match when it is the only match', async function () {
        const fileMatch1 = aFileMatch();
        const data = [fileMatch1, aMatch(fileMatch1)];
        const tree = aTree(data);
        const target = data[1];
        const actual = await getElementToFocusAfterRemoved(tree, target, [target]);
        assert.strictEqual(undefined, actual);
    });
    test('get next element to focus after removing a file match when it has next sibling', async function () {
        const fileMatch1 = aFileMatch();
        const fileMatch2 = aFileMatch();
        const fileMatch3 = aFileMatch();
        const data = [fileMatch1, aMatch(fileMatch1), fileMatch2, aMatch(fileMatch2), fileMatch3, aMatch(fileMatch3)];
        const tree = aTree(data);
        const target = data[2];
        const actual = await getElementToFocusAfterRemoved(tree, target, []);
        assert.strictEqual(data[4], actual);
    });
    test('Find last FileMatch in Tree', async function () {
        const fileMatch1 = aFileMatch();
        const fileMatch2 = aFileMatch();
        const fileMatch3 = aFileMatch();
        const data = [fileMatch1, aMatch(fileMatch1), fileMatch2, aMatch(fileMatch2), fileMatch3, aMatch(fileMatch3)];
        const tree = aTree(data);
        const actual = await getLastNodeFromSameType(tree, fileMatch1);
        assert.strictEqual(fileMatch3, actual);
    });
    test('Find last Match in Tree', async function () {
        const fileMatch1 = aFileMatch();
        const fileMatch2 = aFileMatch();
        const fileMatch3 = aFileMatch();
        const data = [fileMatch1, aMatch(fileMatch1), fileMatch2, aMatch(fileMatch2), fileMatch3, aMatch(fileMatch3)];
        const tree = aTree(data);
        const actual = await getLastNodeFromSameType(tree, aMatch(fileMatch1));
        assert.strictEqual(data[5], actual);
    });
    test('get next element to focus after removing a file match when it is only match', async function () {
        const fileMatch1 = aFileMatch();
        const data = [fileMatch1, aMatch(fileMatch1)];
        const tree = aTree(data);
        const target = data[0];
        // const testObject: ReplaceAction = instantiationService.createInstance(ReplaceAction, tree, target, null);
        const actual = await getElementToFocusAfterRemoved(tree, target, []);
        assert.strictEqual(undefined, actual);
    });
    function aFileMatch() {
        const uri = URI.file('somepath' + ++counter);
        const rawMatch = {
            resource: uri,
            results: []
        };
        const searchModel = instantiationService.createInstance(SearchModelImpl);
        store.add(searchModel);
        const folderMatch = instantiationService.createInstance(FolderMatchImpl, URI.file('somepath'), '', 0, {
            type: 2 /* QueryType.Text */, folderQueries: [{ folder: createFileUriFromPathFromRoot() }], contentPattern: {
                pattern: ''
            }
        }, searchModel.searchResult.plainTextSearchResult, searchModel.searchResult, null);
        store.add(folderMatch);
        const fileMatch = instantiationService.createInstance(NotebookCompatibleFileMatch, {
            pattern: ''
        }, undefined, undefined, folderMatch, rawMatch, null, '');
        fileMatch.createMatches();
        store.add(fileMatch);
        return fileMatch;
    }
    function aMatch(fileMatch) {
        const line = ++counter;
        const match = new MatchImpl(fileMatch, ['some match'], {
            startLineNumber: 0,
            startColumn: 0,
            endLineNumber: 0,
            endColumn: 2
        }, {
            startLineNumber: line,
            startColumn: 0,
            endLineNumber: line,
            endColumn: 2
        }, false);
        fileMatch.add(match);
        return match;
    }
    function aTree(elements) {
        return new MockObjectTree(elements);
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VhcmNoQWN0aW9ucy50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvc2VhcmNoL3Rlc3QvYnJvd3Nlci9zZWFyY2hBY3Rpb25zLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBRTVCLE9BQU8sRUFBRSxFQUFFLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUM1RCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEQsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQy9FLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLCtFQUErRSxDQUFDO0FBQ3pILE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQzdGLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLHlFQUF5RSxDQUFDO0FBRXJILE9BQU8sRUFBRSw2QkFBNkIsRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3JILE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUMvRSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFDckQsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLDZEQUE2RCxDQUFDO0FBQ3JHLE9BQU8sRUFBRSw2QkFBNkIsRUFBRSxnQkFBZ0IsRUFBRSx5QkFBeUIsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQ25ILE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ25HLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUUv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