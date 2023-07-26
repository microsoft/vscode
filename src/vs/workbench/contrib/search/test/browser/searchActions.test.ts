/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Keybinding } from 'vs/base/common/keybindings';
import { OS } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { IModelService } from 'vs/editor/common/services/model';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { USLayoutResolvedKeybinding } from 'vs/platform/keybinding/common/usLayoutResolvedKeybinding';
import { IFileMatch, QueryType } from 'vs/workbench/services/search/common/search';
import { getElementToFocusAfterRemoved, getLastNodeFromSameType } from 'vs/workbench/contrib/search/browser/searchActionsRemoveReplace';
import { FileMatch, FileMatchOrMatch, FolderMatch, Match, SearchModel } from 'vs/workbench/contrib/search/browser/searchModel';
import { MockObjectTree } from 'vs/workbench/contrib/search/test/browser/mockSearchTree';
import { ILabelService } from 'vs/platform/label/common/label';
import { INotebookEditorService } from 'vs/workbench/contrib/notebook/browser/services/notebookEditorService';
import { createFileUriFromPathFromRoot, stubModelService, stubNotebookEditorService } from 'vs/workbench/contrib/search/test/browser/searchTestCommon';

suite('Search Actions', () => {

	let instantiationService: TestInstantiationService;
	let counter: number;

	setup(() => {
		instantiationService = new TestInstantiationService();
		instantiationService.stub(IModelService, stubModelService(instantiationService));
		instantiationService.stub(INotebookEditorService, stubNotebookEditorService(instantiationService));
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

	test('get next element to focus after removing a match when it has next sibling file', function () {
		const fileMatch1 = aFileMatch();
		const fileMatch2 = aFileMatch();
		const data = [fileMatch1, aMatch(fileMatch1), aMatch(fileMatch1), fileMatch2, aMatch(fileMatch2), aMatch(fileMatch2)];
		const tree = aTree(data);
		const target = data[2];

		const actual = getElementToFocusAfterRemoved(tree, target, [target]);
		assert.strictEqual(data[4], actual);
	});

	test('get next element to focus after removing a match when it is the only match', function () {
		const fileMatch1 = aFileMatch();
		const data = [fileMatch1, aMatch(fileMatch1)];
		const tree = aTree(data);
		const target = data[1];

		const actual = getElementToFocusAfterRemoved(tree, target, [target]);
		assert.strictEqual(undefined, actual);
	});

	test('get next element to focus after removing a file match when it has next sibling', function () {
		const fileMatch1 = aFileMatch();
		const fileMatch2 = aFileMatch();
		const fileMatch3 = aFileMatch();
		const data = [fileMatch1, aMatch(fileMatch1), fileMatch2, aMatch(fileMatch2), fileMatch3, aMatch(fileMatch3)];
		const tree = aTree(data);
		const target = data[2];

		const actual = getElementToFocusAfterRemoved(tree, target, []);
		assert.strictEqual(data[4], actual);
	});

	test('Find last FileMatch in Tree', function () {
		const fileMatch1 = aFileMatch();
		const fileMatch2 = aFileMatch();
		const fileMatch3 = aFileMatch();
		const data = [fileMatch1, aMatch(fileMatch1), fileMatch2, aMatch(fileMatch2), fileMatch3, aMatch(fileMatch3)];
		const tree = aTree(data);

		const actual = getLastNodeFromSameType(tree, fileMatch1);
		assert.strictEqual(fileMatch3, actual);
	});

	test('Find last Match in Tree', function () {
		const fileMatch1 = aFileMatch();
		const fileMatch2 = aFileMatch();
		const fileMatch3 = aFileMatch();
		const data = [fileMatch1, aMatch(fileMatch1), fileMatch2, aMatch(fileMatch2), fileMatch3, aMatch(fileMatch3)];
		const tree = aTree(data);

		const actual = getLastNodeFromSameType(tree, aMatch(fileMatch1));
		assert.strictEqual(data[5], actual);
	});

	test('get next element to focus after removing a file match when it is only match', function () {
		const fileMatch1 = aFileMatch();
		const data = [fileMatch1, aMatch(fileMatch1)];
		const tree = aTree(data);
		const target = data[0];
		// const testObject: ReplaceAction = instantiationService.createInstance(ReplaceAction, tree, target, null);

		const actual = getElementToFocusAfterRemoved(tree, target, []);
		assert.strictEqual(undefined, actual);
	});

	function aFileMatch(): FileMatch {
		const rawMatch: IFileMatch = {
			resource: URI.file('somepath' + ++counter),
			results: []
		};

		const searchModel = instantiationService.createInstance(SearchModel);
		const folderMatch = instantiationService.createInstance(FolderMatch, URI.file('somepath'), '', 0, {
			type: QueryType.Text, folderQueries: [{ folder: createFileUriFromPathFromRoot() }], contentPattern: {
				pattern: ''
			}
		}, searchModel.searchResult, searchModel, null);
		return instantiationService.createInstance(FileMatch, {
			pattern: ''
		}, undefined, undefined, folderMatch, rawMatch, null, '');
	}

	function aMatch(fileMatch: FileMatch): Match {
		const line = ++counter;
		const match = new Match(
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
			}
		);
		fileMatch.add(match);
		return match;
	}

	function aTree(elements: FileMatchOrMatch[]): any {
		return new MockObjectTree(elements);
	}
});
