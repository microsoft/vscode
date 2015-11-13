/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import assert = require('assert');
import javascriptMode = require('vs/languages/javascript/common/javascript');
import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import modesUtil = require('vs/editor/test/common/modesUtil');

suite('JS - Auto Indent', () => {

	var wordDefinition:RegExp;
	var onEnter: modesUtil.IOnEnterFunc;
	var assertOnEnter: modesUtil.IOnEnterAsserter;
	var onElectricCharacter: modesUtil.IOnElectricCharacterFunc;
	var assertWords = modesUtil.assertWords;

	suiteSetup((done) => {
		modesUtil.load('javascript').then(mode => {
			onEnter = modesUtil.createOnEnter(mode);
			assertOnEnter = modesUtil.createOnEnterAsserter(mode.getId(), mode.onEnterSupport);
			onElectricCharacter = modesUtil.createOnElectricCharacter(mode);
			wordDefinition = mode.tokenTypeClassificationSupport.getWordDefinition();
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
		assert.equal(onElectricCharacter('var f = function() {}', 20), null);
		assert.deepEqual(onElectricCharacter('}', 0), { matchBracketType: 'delimiter.bracket.js' });
		assert.deepEqual(onElectricCharacter('   }', 3), { matchBracketType: 'delimiter.bracket.js' });
		assert.deepEqual(onElectricCharacter('		}', 2), { matchBracketType: 'delimiter.bracket.js' });
		assert.deepEqual(onElectricCharacter('	   }; // stuff', 4), { matchBracketType: 'delimiter.bracket.js' });

		assert.equal(onElectricCharacter('[1,2]', 4), null);
		assert.deepEqual(onElectricCharacter(']', 0), { matchBracketType: 'delimiter.array.js' });
		assert.deepEqual(onElectricCharacter('   ]', 3), { matchBracketType: 'delimiter.array.js' });
		assert.deepEqual(onElectricCharacter('		]', 2), { matchBracketType: 'delimiter.array.js' });
		assert.deepEqual(onElectricCharacter('	   ]; // stuff', 4), { matchBracketType: 'delimiter.array.js' });

		assert.equal(onElectricCharacter('f()', 2), null);
		assert.deepEqual(onElectricCharacter(')', 0), { matchBracketType: 'delimiter.parenthesis.js' });
		assert.deepEqual(onElectricCharacter('   )', 3), { matchBracketType: 'delimiter.parenthesis.js' });
		assert.deepEqual(onElectricCharacter('		)', 2), { matchBracketType: 'delimiter.parenthesis.js' });
		assert.deepEqual(onElectricCharacter('	   )', 4), { matchBracketType: 'delimiter.parenthesis.js' });
		assert.deepEqual(onElectricCharacter('	   ); // stuff', 4), { matchBracketType: 'delimiter.parenthesis.js' });
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
