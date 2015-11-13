/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import assert = require('assert');
import textEdits = require('vs/languages/typescript/common/js/textEdits');
import rewriter = require('vs/languages/typescript/common/js/rewriting');
import globalVariableRewriter = require('vs/languages/typescript/common/js/globalVariableRewriter');
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

suite('JS* - global variable collector', () => {

	test('GlobalVariableCollector - simple', function() {

		_assertEdits(new globalVariableRewriter.GlobalVariableCollector(), [
			'/*global foo*/',
			'function foo() {}'
		].join('\n'),
			new textEdits.Edit(32, 0, 'declare var foo:any;\n')
		);

		_assertEdits(new globalVariableRewriter.GlobalVariableCollector(), [
			'/*global foo, bar*/',
			'function foo() {}'
		].join('\n'),
			new textEdits.Edit(37, 0, 'declare var foo:any;\ndeclare var bar:any;\n')
		);

		_assertEdits(new globalVariableRewriter.GlobalVariableCollector(), [
			'/*global foo,',
			'bar*/',
			'function foo() {}'
		].join('\n'),
			new textEdits.Edit(37, 0, 'declare var foo:any;\ndeclare var bar:any;\n')
		);
	});

	test('GlobalVariableCollector - complex', function() {

		_assertEdits(new globalVariableRewriter.GlobalVariableCollector(), [
			'/*global foo:true*/',
			'function foo() {}'
		].join('\n'),
			new textEdits.Edit(37, 0, 'declare var foo:any;\n')
		);

		_assertEdits(new globalVariableRewriter.GlobalVariableCollector(), [
			'/*global foo: true, bar: false*/',
			'function foo() {}'
		].join('\n'),
			new textEdits.Edit(50, 0, 'declare var foo:any;\ndeclare var bar:any;\n')
		);
	});


	test('GlobalVariableCollector - scoped', function() {

		_assertEdits(new globalVariableRewriter.GlobalVariableCollector(), [
			'function foo() {\n',
			'/*global foo:true*/',
			'}'
		].join('\n'),
			new textEdits.Edit(39, 0, 'declare var foo:any;\n')
		);

		_assertEdits(new globalVariableRewriter.GlobalVariableCollector(), [
			'function foo() {\n',
			'\t/*global foo:true*/',
			'}'
		].join('\n'),
			new textEdits.Edit(40, 0, 'declare var foo:any;\n')
		);
	});
});