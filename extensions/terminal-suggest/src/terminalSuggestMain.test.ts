/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import 'mocha';
import { availableSpecs, getCompletionItemsFromSpecs } from './terminalSuggestMain';

suite('Terminal Suggest', () => {

	suiteSetup(async function () {

	});
	suiteTeardown(async function () {
	});

	test(`No results when there are no available commands:`, function () {
		const result = getCompletionItemsFromSpecs(availableSpecs, { 'commandLine': '', cursorPosition: 0 }, new Set(), '');
		assert(result.items.length === 0);
		assert(result.filesRequested === false);
		assert(result.foldersRequested === false);
	});
	test(`Results when there are matching available commands and the prefix matches:`, function () {
		const result = getCompletionItemsFromSpecs(availableSpecs, { 'commandLine': 'c', cursorPosition: 1 }, new Set(['code', 'code-insiders', 'cd']), 'c');
		assert(result.items.length === 3);
		assert(result.filesRequested === false);
		assert(result.foldersRequested === false);
	});
});
