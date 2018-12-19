/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Keybinding } from 'vs/base/common/keyCodes';
import { OS } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ModelServiceImpl } from 'vs/editor/common/services/modelServiceImpl';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { USLayoutResolvedKeybinding } from 'vs/platform/keybinding/common/usLayoutResolvedKeybinding';
import { IFileMatch } from 'vs/platform/search/common/search';
import { ReplaceAction } from 'vs/workbench/parts/search/browser/searchActions';
import { FileMatch, FileMatchOrMatch, Match } from 'vs/workbench/parts/search/common/searchModel';
import { MockObjectTree } from 'vs/workbench/parts/search/test/browser/mockSearchTree';

suite('Search Actions', () => {

	let instantiationService: TestInstantiationService;
	let counter: number;

	setup(() => {
		instantiationService = new TestInstantiationService();
		instantiationService.stub(IModelService, stubModelService(instantiationService));
		instantiationService.stub(IKeybindingService, {});
		instantiationService.stub(IKeybindingService, 'resolveKeybinding', (keybinding: Keybinding) => [new USLayoutResolvedKeybinding(keybinding, OS)]);
		instantiationService.stub(IKeybindingService, 'lookupKeybinding', (id: string) => null);
		counter = 0;
	});

	test('get next element to focus after removing a match when it has next sibling file', function () {
		let fileMatch1 = aFileMatch();
		let fileMatch2 = aFileMatch();
		let data = [fileMatch1, aMatch(fileMatch1), aMatch(fileMatch1), fileMatch2, aMatch(fileMatch2), aMatch(fileMatch2)];
		let tree = aTree(data);
		let target = data[2];
		let testObject: ReplaceAction = instantiationService.createInstance(ReplaceAction, tree, target, null);

		const actual = testObject.getElementToFocusAfterRemoved(tree, target);
		assert.equal(data[4], actual);
	});

	test('get next element to focus after removing a match when it does not have next sibling match', function () {
		let fileMatch1 = aFileMatch();
		let fileMatch2 = aFileMatch();
		let data = [fileMatch1, aMatch(fileMatch1), aMatch(fileMatch1), fileMatch2, aMatch(fileMatch2), aMatch(fileMatch2)];
		let tree = aTree(data);
		let target = data[5];
		let testObject: ReplaceAction = instantiationService.createInstance(ReplaceAction, tree, target, null);

		const actual = testObject.getElementToFocusAfterRemoved(tree, target);
		assert.equal(data[4], actual);
	});

	test('get next element to focus after removing a match when it does not have next sibling match and previous match is file match', function () {
		let fileMatch1 = aFileMatch();
		let fileMatch2 = aFileMatch();
		let data = [fileMatch1, aMatch(fileMatch1), aMatch(fileMatch1), fileMatch2, aMatch(fileMatch2)];
		let tree = aTree(data);
		let target = data[4];
		let testObject: ReplaceAction = instantiationService.createInstance(ReplaceAction, tree, target, null);

		const actual = testObject.getElementToFocusAfterRemoved(tree, target);
		assert.equal(data[2], actual);
	});

	test('get next element to focus after removing a match when it is the only match', function () {
		let fileMatch1 = aFileMatch();
		let data = [fileMatch1, aMatch(fileMatch1)];
		let tree = aTree(data);
		let target = data[1];
		let testObject: ReplaceAction = instantiationService.createInstance(ReplaceAction, tree, target, null);

		const actual = testObject.getElementToFocusAfterRemoved(tree, target);
		assert.equal(void 0, actual);
	});

	test('get next element to focus after removing a file match when it has next sibling', function () {
		let fileMatch1 = aFileMatch();
		let fileMatch2 = aFileMatch();
		let fileMatch3 = aFileMatch();
		let data = [fileMatch1, aMatch(fileMatch1), fileMatch2, aMatch(fileMatch2), fileMatch3, aMatch(fileMatch3)];
		let tree = aTree(data);
		let target = data[2];
		let testObject: ReplaceAction = instantiationService.createInstance(ReplaceAction, tree, target, null);

		const actual = testObject.getElementToFocusAfterRemoved(tree, target);
		assert.equal(data[4], actual);
	});

	test('get next element to focus after removing a file match when it has no next sibling', function () {
		let fileMatch1 = aFileMatch();
		let fileMatch2 = aFileMatch();
		let fileMatch3 = aFileMatch();
		let data = [fileMatch1, aMatch(fileMatch1), fileMatch2, aMatch(fileMatch2), fileMatch3, aMatch(fileMatch3)];
		let tree = aTree(data);
		let target = data[4];
		let testObject: ReplaceAction = instantiationService.createInstance(ReplaceAction, tree, target, null);

		const actual = testObject.getElementToFocusAfterRemoved(tree, target);
		assert.equal(data[3], actual);
	});

	test('get next element to focus after removing a file match when it is only match', function () {
		let fileMatch1 = aFileMatch();
		let data = [fileMatch1, aMatch(fileMatch1)];
		let tree = aTree(data);
		let target = data[0];
		let testObject: ReplaceAction = instantiationService.createInstance(ReplaceAction, tree, target, null);

		const actual = testObject.getElementToFocusAfterRemoved(tree, target);
		assert.equal(void 0, actual);
	});

	function aFileMatch(): FileMatch {
		let rawMatch: IFileMatch = {
			resource: URI.file('somepath' + ++counter),
			results: []
		};
		return instantiationService.createInstance(FileMatch, null, null, null, null, rawMatch);
	}

	function aMatch(fileMatch: FileMatch): Match {
		const line = ++counter;
		let match = new Match(
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

	function stubModelService(instantiationService: TestInstantiationService): IModelService {
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		return instantiationService.createInstance(ModelServiceImpl);
	}
});