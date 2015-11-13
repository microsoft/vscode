/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import assert = require('assert');
import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import network = require('vs/base/common/network');
import quickfix = require('vs/languages/typescript/common/features/quickFix');
import diagnostics = require('vs/languages/typescript/common/features/diagnostics');
import ts = require('vs/languages/typescript/common/lib/typescriptServices');
import utils = require('vs/languages/typescript/test/common/features/utils');
import Options = require('vs/languages/typescript/common/options');

suite('TS - quick fix', () => {

	function assertQuickFix(code: string, callback: (outline: Modes.IQuickFix[]) => any): void {
		var fileName = 'a.ts';
		var host = new utils.LanguageServiceHost().add(fileName, code);
		var service = ts.createLanguageService(host, ts.createDocumentRegistry());
		var markers = diagnostics.getSemanticDiagnostics(service, network.URL.fromValue(fileName), Options.typeScriptOptions).markers;

		assert.equal(markers.length, 1);
		var marker = markers[0];

		var elements = quickfix.compute(service, network.URL.fromValue(fileName), marker);

		try {
			callback(elements);
		} catch(e) {
			assert.ok(false, e);
		}
	}

	test('quickfix', function() {

		assertQuickFix('class C { private hello = 0; private world = this.hell0; }', (elements) => {
			assert.equal(elements.length, 1);
			assert.equal(elements[0].label, "Rename to 'hello'");
		});

	});
});