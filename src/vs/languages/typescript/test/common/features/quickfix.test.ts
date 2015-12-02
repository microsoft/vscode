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

	function assertQuickFix(code: string, fileName: string, callback: (outline: Modes.IQuickFix[]) => any): void {
		var filePath = 'file://test/' + fileName;
		var fileURL = network.URL.parse(filePath);
		var host = new utils.LanguageServiceHost().add(filePath, code);
		var service = ts.createLanguageService(host, ts.createDocumentRegistry());
		var markers = diagnostics.getSemanticDiagnostics(service, fileURL, Options.typeScriptOptions).markers;

		assert.equal(markers.length, 1);
		var marker = markers[0];

		var elements = quickfix.compute(service, fileURL, marker);

		callback(elements);
	}

	test('quickfix', function() {

		assertQuickFix('class C { private hello = 0; private world = this.hell0; }', 'a.ts', (elements) => {
			assert.equal(elements.length, 1);
			assert.equal(elements[0].command.title, "Rename to 'hello'");
		});

		assertQuickFix('_.foo();', 'a.ts', (elements) => {
			assert.equal(elements.length, 2);
			assert.equal(elements[0].command.title, "Download type definition underscore.d.ts");
			assert.equal(elements[1].command.title, "Download type definition lodash.d.ts");
		});

		assertQuickFix('describe("x");', 'a.js', (elements) => {
			assert.equal(elements.length, 3);
			assert.equal(elements[0].command.title, "Download type definition mocha.d.ts");
			assert.equal(elements[1].command.title, "Download type definition jasmine.d.ts");
			assert.equal(elements[2].command.title, "Mark 'describe' as global");
		});

		assertQuickFix('angular.foo = 1;', 'a.ts', (elements) => {
			assert.equal(elements.length, 1);
			assert.equal(elements[0].command.title, "Download type definition angular.d.ts");
		});

		assertQuickFix('var x = __dirname;', 'a.ts', (elements) => {
			assert.equal(elements.length, 1);
			assert.equal(elements[0].command.title, "Download type definition node.d.ts");
		});

		assertQuickFix('ko.observable(null);', 'a.ts', (elements) => {
			assert.equal(elements.length, 1);
			assert.equal(elements[0].command.title, "Download type definition knockout.d.ts");
		});

		for (var id in quickfix.typingsMap) {
			assertQuickFix(id + '.foo();', 'a.ts', (elements) => {
				var value = quickfix.typingsMap[id];
				var length = Array.isArray(value) ? value.length : 1;
				assert.equal(elements.length, length);
			});
		}

		assertQuickFix('foo.observable(null);', 'a.js', (elements) => {
			assert.equal(elements.length, 1);
			assert.equal(elements[0].command.title, "Mark 'foo' as global");
		});

		assertQuickFix('toString();', 'a.js', (elements) => {
			assert.equal(elements.length, 1);
			assert.equal(elements[0].command.title, "Mark 'toString' as global");
		});

	});
});