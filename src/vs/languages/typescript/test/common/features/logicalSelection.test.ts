/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import assert = require('assert');
import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import network = require('vs/base/common/network');
import logicalSelection = require('vs/languages/typescript/common/features/logicalSelection');
import ts = require('vs/languages/typescript/common/lib/typescriptServices');
import utils = require('vs/languages/typescript/test/common/features/utils');

suite('TS - logical selection', () => {

	function assertSelection(code:string, line:number, position:number, callback:(entry:Modes.ILogicalSelectionEntry[])=>any):void {

		var host = new utils.LanguageServiceHost().add('a', code),
			languageService = ts.createLanguageService(host, ts.createDocumentRegistry());

		var elements = logicalSelection.compute(languageService, network.URL.fromValue('a'), { lineNumber: line, column: position });

		try {
			callback(elements);
		} catch(e) {
			assert.ok(false, e);
		}
	}

	test('statement', function() {

		assertSelection('var farboo = 123', 1, 8, (entry) => {
			assert.equal(entry.length, 3);

			assert.equal(entry[0].range.startColumn, 1);
			assert.equal(entry[0].range.endColumn, 17);
			assert.equal(entry[1].range.startColumn, 5);
			assert.equal(entry[1].range.endColumn, 17);
			assert.equal(entry[2].range.startColumn, 5);
			assert.equal(entry[2].range.endColumn, 11);
		});
	});
});