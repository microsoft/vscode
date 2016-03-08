/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/languages/javascript/common/javascript.contribution';
import assert = require('assert');
import javascriptMode = require('vs/languages/javascript/common/javascript');
import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import modesUtil = require('vs/editor/test/common/modesUtil');
import {createMockLineContext} from 'vs/editor/test/common/modesTestUtils';

suite('JS - Auto Indent', () => {

	var wordDefinition:RegExp;
	var assertOnEnter: modesUtil.IOnEnterAsserter;
	var _mode: Modes.IMode;
	var assertWords = modesUtil.assertWords;

	suiteSetup((done) => {
		modesUtil.load('javascript').then(mode => {
			_mode = mode;
			assertOnEnter = modesUtil.createOnEnterAsserter(mode.getId(), mode.richEditSupport);
			wordDefinition = mode.richEditSupport.wordDefinition;
			done();
		});
	});

	test('onEnter', function() {
		assertOnEnter.nothing('', '', 'var f = function() {');
		assertOnEnter.nothing('', 'var', ' f = function() {');
		assertOnEnter.nothing('', 'var ', 'f = function() {');
		assertOnEnter.indents('', 'var f = function() {', '');
		assertOnEnter.indents('', 'var f = function() {', ' //');
		assertOnEnter.indents('', 'var f = function() { ', '//');
		assertOnEnter.indentsOutdents('', 'var f = function() {', '}');
		assertOnEnter.indents('', '(function() {', '');
		assertOnEnter.indentsOutdents('', '(function() {','}');
		assertOnEnter.indentsOutdents('', '(function() {','})');
		assertOnEnter.indentsOutdents('', '(function() {','});');

		assertOnEnter.nothing('', 'var l = ', '[');
		assertOnEnter.indents('', 'var l = [', '');
		assertOnEnter.indentsOutdents('', 'var l = [', ']');
		assertOnEnter.indentsOutdents('', 'var l = [', '];');

		assertOnEnter.nothing('', 'func', '(');
		assertOnEnter.indents('', 'func(', '');
		assertOnEnter.indentsOutdents('', 'func(' ,')');
		assertOnEnter.indentsOutdents('', 'func(', ');');

		assertOnEnter.indents('', '{', '');
		assertOnEnter.indents('', '{ ', '');
		assertOnEnter.indentsOutdents('', '{', '}');
		assertOnEnter.indentsOutdents('', '{ ', '}');
		assertOnEnter.indentsOutdents('', '{ ', ' }');
	});

	test('onElectricCharacter', function() {

		function testElectricCharacter(line:string, offset:number, expected:Modes.IElectricAction): void {
			let state = _mode.tokenizationSupport.getInitialState();
			var lineTokens = _mode.tokenizationSupport.tokenize(line, state);
			let actual = _mode.richEditSupport.electricCharacter.onElectricCharacter(createMockLineContext(line, lineTokens), offset);

			assert.deepEqual(actual, expected, 'LINE <<<' + line + '>>>, OFFSET: <<<' + offset + '>>>');
		}

		const CURLY = { matchOpenBracket: '}' };
		const ROUND = { matchOpenBracket: ')' };
		const SQUARE = { matchOpenBracket: ']' };

		testElectricCharacter('var f = function() {}', 20, null);
		testElectricCharacter('}', 0, CURLY);
		testElectricCharacter('   }', 3, CURLY);
		testElectricCharacter('		}', 2, CURLY);
		testElectricCharacter('	   }; // stuff', 4, CURLY);

		testElectricCharacter('[1,2]', 4, null);
		testElectricCharacter(']', 0, SQUARE);
		testElectricCharacter('   ]', 3, SQUARE);
		testElectricCharacter('		]', 2, SQUARE);
		testElectricCharacter('	   ]; // stuff', 4, SQUARE);

		testElectricCharacter('f()', 2, null);
		testElectricCharacter(')', 0, ROUND);
		testElectricCharacter('   )', 3, ROUND);
		testElectricCharacter('		)', 2, ROUND);
		testElectricCharacter('	   )', 4, ROUND);
		testElectricCharacter('	   ); // stuff', 4, ROUND);
	});

	test('Word definition', function() {
		assertWords('a b cde'.match(wordDefinition), ['a', 'b', 'cde']);

		assertWords('modesRegistry.registerMode([\'text/x-monaco-buildlog\'], new Platform.DeferredDescriptor(\'vs/workbench/contrib/build/buildViewlet\', \'BuildLogMode\'));'.match(wordDefinition),
			['modesRegistry', 'registerMode', 'text', 'x', 'monaco', 'buildlog', 'new', 'Platform', 'DeferredDescriptor', 'vs', 'workbench', 'contrib', 'build',
			'buildViewlet', 'BuildLogMode']);

		assertWords('var BuildDataSource = winjs.Class.define(function BuildDataSource() {}, {'.match(wordDefinition),
			['var', 'BuildDataSource', 'winjs', 'Class', 'define', 'function', 'BuildDataSource']);

		assertWords('		} else if(element instanceof BuildModel.BuildError) {'.match(wordDefinition),
			['else', 'if', 'element', 'instanceof', 'BuildModel', 'BuildError']);

	});
});
