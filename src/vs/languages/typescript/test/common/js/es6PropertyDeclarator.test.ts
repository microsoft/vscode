/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import assert = require('assert');
import textEdits = require('vs/languages/typescript/common/js/textEdits');
import rewriter = require('vs/languages/typescript/common/js/rewriting');
import ES6PropertyDeclarator = require('vs/languages/typescript/common/js/es6PropertyDeclarator');
import ts = require('vs/languages/typescript/common/lib/typescriptServices');

function _assertEdits(a:rewriter.ISyntaxRewriter, value:string, ...edits:textEdits.Edit[]):void {

	var sourceFile = ts.createSourceFile('a', value, ts.ScriptTarget.ES5, true);
	var ctx = new rewriter.AnalyzerContext(() => sourceFile);
	a.computeEdits(ctx);

	assert.equal(edits.length, ctx.edits.length);

	for(var i = 0, len = Math.min(edits.length, ctx.edits.length); i < len; i++) {
		assert.ok(edits[i].equals(ctx.edits[i]), edits[i] + ' <> ' + ctx.edits[i]);
	}
}

suite('JS* - es6 property declarator', () => {

	test('ES6PropertyDeclarator - simple', function() {

		_assertEdits(new ES6PropertyDeclarator(), [
			'class View {',
			'constructor() {',
			'this.far = 234;',
			'}',
			'}',
		].join('\n'),
			new textEdits.Edit(46, 0, '\n;far')
		);
	});

	test('ES6PropertyDeclarator - repeated names', function() {

		_assertEdits(new ES6PropertyDeclarator(), [
			'class View {',
			'constructor() {',
			'this.far = 234;',
			'this.far = 567;',
			'}',
			'}',
		].join('\n'),
			new textEdits.Edit(62, 0, '\n;far')
		);
	});
});
