/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import 'mocha';
import { availableSpecs, getCompletionItemsFromSpecs } from '../../terminal-suggest/src/terminalSuggestMain';

suite('terminal suggest', () => {

	suiteSetup(async function () {

	});
	suiteTeardown(async function () {
	});

	test(`terminal suggest:`, function () {
		const result = getCompletionItemsFromSpecs(availableSpecs, { 'commandLine': '', cursorPosition: 0 }, new Set(), '');
		assert(result === undefined);
	});
});
