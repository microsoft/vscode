/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import assert = require('assert');
import autoIndentation = require('vs/editor/common/modes/autoIndentation');
import modes = require('vs/editor/common/modes');
import modesUtil = require('vs/editor/test/common/modesTestUtils');

suite('Editor Modes - Auto Indentation', () => {

	test('Bracket Pairs', () => {
		var brackets = new autoIndentation.Brackets([
			{ tokenType:'b', open: '{', close: '}', isElectric: false },
			{ tokenType:'a', open: '[', close: ']', isElectric: true },
			{ tokenType:'p', open: '(', close: ')', isElectric: false }
		]);

		assert.equal(brackets.stringIsBracket(''), false);
		assert.equal(brackets.stringIsBracket('<'), false);
		assert.equal(brackets.stringIsBracket('{'), true);
		assert.equal(brackets.stringIsBracket('}'), true);
		assert.equal(brackets.stringIsBracket('['), true);
		assert.equal(brackets.stringIsBracket(']'), true);
		assert.equal(brackets.stringIsBracket('('), true);
		assert.equal(brackets.stringIsBracket(')'), true);
	});

	test('Case insensitive regular expressions', () => {
		var brackets = new autoIndentation.Brackets([],
		[
			{	tokenType: 'tag-$1',
				openTrigger: '>',
				open: /<(\w[\w\d]*)(\s+.*[^\/]>|\s*>)[^<]*$/i,
				closeComplete: '</$1>',
				closeTrigger: '>',
				close: /<\/(\w[\w\d]*)\s*>$/i }
		], null, true);

		assert.equal(brackets.onEnter(modesUtil.createLineContextFromTokenText([
			{ text: '', type: '' }
		]), 0), null);
		assert.equal(brackets.onEnter(modesUtil.createLineContextFromTokenText([
			{ text: '<', type: 'delim' },
			{ text: 'tag', type: 'tag', bracket: modes.Bracket.Open },
			{ text: '>', type: 'delim' },
		]), 5).indentAction, modes.IndentAction.Indent);
		assert.equal(brackets.onEnter(modesUtil.createLineContextFromTokenText([
			{ text: '<', type: 'delim' },
			{ text: 'tag', type: 'tag', bracket: modes.Bracket.Open },
			{ text: '>', type: 'delim' },
			{ text: '</', type: 'delim' },
			{ text: 'TAg', type: 'tag', bracket: modes.Bracket.Close},
			{ text: '>', type: 'delim' },
		]), 5).indentAction, modes.IndentAction.IndentOutdent);

		assert.equal(brackets.onElectricCharacter(modesUtil.createLineContextFromTokenText([
			{ text: '<', type: 'delim' },
			{ text: 'tag', type: 'tag', bracket: modes.Bracket.Open },
			{ text: '>', type: 'delim' }
		]), 4).appendText, '</tag>');

		assert.equal(brackets.onElectricCharacter(modesUtil.createLineContextFromTokenText([
			{ text: '</', type: 'delim' },
			{ text: 'TAg', type: 'tag', bracket: modes.Bracket.Close},
			{ text: '>', type: 'delim' },
		]), 5).matchBracketType, 'tag-tag');
	});


	test('Case insensitive regular expressions and case matching auto completion', () => {
		var brackets = new autoIndentation.Brackets([],
		[
			{	tokenType: 'sub',
				openTrigger: 'b',
				open: /^(|.*\s)sub/i,
				closeComplete: ' end sub',
				matchCase: true
			}
		], null, true);

		assert.equal(brackets.onElectricCharacter(modesUtil.createLineContextFromTokenText([
			{ text: 'sub', type: '' }
		]), 2).appendText, ' end sub');

		assert.equal(brackets.onElectricCharacter(modesUtil.createLineContextFromTokenText([
			{ text: 'Sub', type: '' }
		]), 2).appendText, ' End Sub');

		assert.equal(brackets.onElectricCharacter(modesUtil.createLineContextFromTokenText([
			{ text: 'SUB', type: '' }
		]), 2).appendText, ' END SUB');
	});


	test('Doc comments', () => {
		var brackets = new autoIndentation.Brackets([], [],
			{ scope: 'doc', open: '/**', lineStart: ' * ', close: ' */' });

		assert.equal(brackets.onElectricCharacter(modesUtil.createLineContextFromTokenText([
			{ text: '/**', type: 'doc' },
		]), 2).appendText, ' */');
		assert.equal(brackets.onElectricCharacter(modesUtil.createLineContextFromTokenText([
			{ text: '/**', type: 'doc' },
			{ text: ' ', type: 'doc' },
			{ text: '*/', type: 'doc' },
		]), 2), null);
	});
});
