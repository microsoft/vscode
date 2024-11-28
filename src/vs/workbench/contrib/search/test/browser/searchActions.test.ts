/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Keybinding } from '../../../../../base/common/keybindings.js';
import { OS } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { USLayoutResolvedKeybinding } from '../../../../../platform/keybinding/common/usLayoutResolvedKeybinding.js';
import { IFileMatch, QueryType } from '../../../../services/search/common/search.js';
import { getElementToFocusAfterRemoved, getLastNodeFromSameType } from '../../browser/searchActionsRemoveReplace.js';
import { SearchModelImpl } from '../../browser/searchTreeModel/searchModel.js';
import { MockObjectTree } from './mockSearchTree.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { INotebookEditorService } from '../../../notebook/browser/services/notebookEditorService.js';
import { createFileUriFromPathFromRoot, stubModelService, stubNotebookEditorService } from './searchTestCommon.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { FolderMatchImpl } from '../../browser/searchTreeModel/folderMatch.js';
import { ISearchTreeFileMatch, ISearchTreeMatch, FileMatchOrMatch } from '../../browser/searchTreeModel/searchTreeCommon.js';
import { NotebookCompatibleFileMatch } from '../../browser/notebookSearch/notebookSearchModel.js';
import { INotebookFileInstanceMatch } from '../../browser/notebookSearch/notebookSearchModelBase.js';
import { MatchImpl } from '../../browser/searchTreeModel/match.js';

suite('Search Actions', () => {

	let instantiationService: TestInstantiationService;
	let counter: number;
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		instantiationService = new TestInstantiationService();
		instantiationService.stub(IModelService, stubModelService(instantiationService, (e) => store.add(e)));
		instantiationService.stub(INotebookEditorService, stubNotebookEditorService(instantiationService, (e) => store.add(e)));
		instantiationService.stub(IKeybindingService, {});
		instantiationService.stub(ILabelService, { getUriBasenameLabel: (uri: URI) => '' });
		instantiationService.stub(IKeybindingService, 'resolveKeybinding', (keybinding: Keybinding) => USLayoutResolvedKeybinding.resolveKeybinding(keybinding, OS));
		instantiationService.stub(IKeybindingService, 'lookupKeybinding', (id: string) => null);
		instantiationService.stub(IKeybindingService, 'lookupKeybinding', (id: string) => null);
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

	function aFileMatch(): INotebookFileInstanceMatch {
		const uri = URI.file('somepath' + ++counter);
		const rawMatch: IFileMatch = {
			resource: uri,
			results: []
		};

		const searchModel = instantiationService.createInstance(SearchModelImpl);
		store.add(searchModel);
		const folderMatch = instantiationService.createInstance(FolderMatchImpl, URI.file('somepath'), '', 0, {
			type: QueryType.Text, folderQueries: [{ folder: createFileUriFromPathFromRoot() }], contentPattern: {
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

	function aMatch(fileMatch: ISearchTreeFileMatch): ISearchTreeMatch {
		const line = ++counter;
		const match = new MatchImpl(
			fileMatch,
			['some match'],
			{
				startLineNumber: 0,
				startColumn: 0,
				endLineNumber: 0,
				endColumn: 2
			},
			{
				startLineNumber: line,
				startColumn: 0,
				endLineNumber: line,
				endColumn: 2
			},
			false
		);
		fileMatch.add(match);
		return match;
	}

	function aTree(elements: FileMatchOrMatch[]): any {
		return new MockObjectTree(elements);
	}
});
