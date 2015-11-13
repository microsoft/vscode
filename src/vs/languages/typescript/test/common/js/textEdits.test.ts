/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import assert = require('assert');
import textEdits = require('vs/languages/typescript/common/js/textEdits');

suite('JS* - TextEdits', () => {

	function assertApply(edits:textEdits.Edit[], value:string, expected:string):void {
		var result = textEdits.apply(edits, value);
		assert.equal(result.value, expected);
	}

	test('apply - merge inserts', function() {

		assertApply([ new textEdits.Edit(0, 0, 'far'), new textEdits.Edit(0, 0, 'boo')], '', 'farboo');
		assertApply([ new textEdits.Edit(0, 0, 'far'), new textEdits.Edit(1, 0, 'boo')], ' ', 'far boo');
	});

	test('TextSpan - before, after, equal, contains, overlaps', function():void {

		assert.ok(new textEdits.TextSpan(0, 0).equals(new textEdits.TextSpan(0, 0)));
		assert.ok(new textEdits.TextSpan(0, 1).equals(new textEdits.TextSpan(0, 1)));
		assert.ok(new textEdits.TextSpan(10, 1).equals(new textEdits.TextSpan(10, 1)));
		assert.ok(!new textEdits.TextSpan(10, 1).equals(new textEdits.TextSpan(1, 10)));

		assert.ok(new textEdits.TextSpan(11, 1).contains(new textEdits.TextSpan(11, 1)));
		assert.ok(new textEdits.TextSpan(11, 1).contains(new textEdits.TextSpan(11, 0)));
		assert.ok(new textEdits.TextSpan(11, 10).contains(new textEdits.TextSpan(11, 1)));
		assert.ok(new textEdits.TextSpan(11, 10).contains(new textEdits.TextSpan(20, 1)));
		assert.ok(new textEdits.TextSpan(1, 4).contains(new textEdits.TextSpan(2, 1)));
		assert.ok(new textEdits.TextSpan(2, 1).contains(new textEdits.TextSpan(2, 1)));
		assert.ok(!new textEdits.TextSpan(2, 1).contains(new textEdits.TextSpan(3, 0)));
	});

	test('Edit - length & delta length', function():void {
		assert.equal(12, new textEdits.Edit(8, 12, '12').length);
		assert.equal(-10, new textEdits.Edit(8, 12, '12').deltaLength);
		assert.equal(1, new textEdits.Edit(8, 1, '12').deltaLength);
		assert.equal(0, new textEdits.Edit(8, 2, '12').deltaLength);
	});

	test('Edit - end & delta end', function() {
		assert.equal(10, new textEdits.Edit(8, 12, '12').deltaEnd);
		assert.equal(10, new textEdits.Edit(8, 1, '12').deltaEnd);
		assert.equal(10, new textEdits.Edit(8, 2, '12').deltaEnd);
		assert.equal(12, new textEdits.Edit(8, 2, '1234').deltaEnd);
	});

	test('apply - do & undo (real world)', function() {

		var value = '/// <reference path=\"\" />\n\nvar foo = {\n	\n};\ndefine([\"./lib\", \"\"], function(lib) {\n	console.log(lib.boo);\n});\n';
		var edits = [
			new textEdits.Edit(0, 0, 'declare function define<T>(id?, dep?, callback?:(...args:any[])=>T):T;\n'),
			new textEdits.Edit(0, 0, 'import _var_0 = require("./lib");\n'),
			new textEdits.Edit(78, 0, ':typeof _var_0'),
			new textEdits.Edit(44, 0, 'var _var_1 = '),
			new textEdits.Edit(107, 0, '\nexport = _var_1;'),
		];

		var result = textEdits.apply(edits, value);
		var result2 = textEdits.apply(result.undoEdits, result.value);

		assert.equal(value, result2.value);
	});

	test('Edit - apply & undo (small)', function():void {

		var value = 'HalliHallo',
			edits = [ new textEdits.Edit(7, 2, ''), new textEdits.Edit(2, 3, 'a')];

		var result = textEdits.apply(edits, value),
			undoResult = textEdits.apply(result.undoEdits, result.value);

		assert.equal(result.value, 'HaaHao');
		assert.equal(undoResult.value, 'HalliHallo');

		var edits = [
			new textEdits.Edit(0, 0, 'thisis'),
			new textEdits.Edit(4, 2, 'oo')
		];
		var result = textEdits.apply(edits, 'boofar');
		assert.equal(result.value, 'thisisboofoo');
		result = textEdits.apply(result.undoEdits, result.value);
		assert.equal(result.value, 'boofar');
		result = textEdits.apply(result.undoEdits, result.value);
		assert.equal(result.value, 'thisisboofoo');

		edits = [
			new textEdits.Edit(1, 2, 'oo'),
			new textEdits.Edit(4, 2, 'ar')
		];
		result = textEdits.apply(edits, 'farboo');
		assert.equal(result.value, 'foobar');
		result = textEdits.apply(result.undoEdits, result.value);
		assert.equal(result.value, 'farboo');
	});

	test('Edit - translate with behaviour', function() {
		var edits = [new textEdits.Edit(0, 11, 'var _var_0 ')];
		assert.equal(textEdits.translate(edits, 4, textEdits.TranslationBehaviour.None), 4);
		assert.equal(textEdits.translate(edits, 4, textEdits.TranslationBehaviour.StickLeft), 0);
		assert.equal(textEdits.translate(edits, 4, textEdits.TranslationBehaviour.StickRight), 11);

		var edits = [new textEdits.Edit(0, 11, 'longerthanbefore')];
		assert.equal(textEdits.translate(edits, 4, textEdits.TranslationBehaviour.None), 4);
		assert.equal(textEdits.translate(edits, 4, textEdits.TranslationBehaviour.StickLeft), 0);
		assert.equal(textEdits.translate(edits, 4, textEdits.TranslationBehaviour.StickRight), 16);

		var edits = [new textEdits.Edit(0, 11, 'shorter')];
		assert.equal(textEdits.translate(edits, 4, textEdits.TranslationBehaviour.None), 4);
		assert.equal(textEdits.translate(edits, 4, textEdits.TranslationBehaviour.StickLeft), 0);
		assert.equal(textEdits.translate(edits, 4, textEdits.TranslationBehaviour.StickRight), 7);
		assert.equal(textEdits.translate(edits, 8, textEdits.TranslationBehaviour.StickRight), 7);
	});


	test('Edit - translate', function():void {

		var insert = new textEdits.Edit(0, 0, 'thisis');
		var replaceGrow = new textEdits.Edit(4, 2, 'oooo');
		var replaceShrink = new textEdits.Edit(4, 4, 'oo');
		var _delete = new textEdits.Edit(4, 3, '');

		assert.equal(textEdits.translate([insert], 0), 0);
		assert.equal(textEdits.translate([insert], 1), 7);
		assert.equal(textEdits.translate([insert], 10), 16);

		assert.equal(textEdits.translate([replaceGrow], 0), 0);
		assert.equal(textEdits.translate([replaceGrow], 4), 4);
		assert.equal(textEdits.translate([replaceGrow], 5), 5);
		assert.equal(textEdits.translate([replaceGrow], 6), 6);
		assert.equal(textEdits.translate([replaceGrow], 7), 9);
		assert.equal(textEdits.translate([replaceGrow], 10), 12);

		assert.equal(textEdits.translate([replaceShrink], 0), 0);
		assert.equal(textEdits.translate([replaceShrink], 4), 4);
		assert.equal(textEdits.translate([replaceShrink], 5), 5);
		assert.equal(textEdits.translate([replaceShrink], 6), 6);
		assert.equal(textEdits.translate([replaceShrink], 7), 6);
		assert.equal(textEdits.translate([replaceShrink], 8), 6);

		assert.equal(textEdits.translate([_delete], 1), 1);
		assert.equal(textEdits.translate([_delete], 4), 4);
		assert.equal(textEdits.translate([_delete], 7), 4);
	});
});
