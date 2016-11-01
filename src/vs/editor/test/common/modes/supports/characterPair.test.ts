/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { CharacterPair, IndentAction } from 'vs/editor/common/modes/languageConfiguration';
import { OnEnterSupport } from 'vs/editor/common/modes/supports/onEnter';
import { CharacterPairSupport } from 'vs/editor/common/modes/supports/characterPair';
import { TokenText, createFakeScopedLineTokens } from 'vs/editor/test/common/modesTestUtils';

suite('CharacterPairSupport', () => {

	test('only autoClosingPairs', () => {
		let characaterPairSupport = new CharacterPairSupport({ autoClosingPairs: [{ open: 'a', close: 'b' }] });
		assert.deepEqual(characaterPairSupport.getAutoClosingPairs(), [{ open: 'a', close: 'b' }]);
		assert.deepEqual(characaterPairSupport.getSurroundingPairs(), [{ open: 'a', close: 'b' }]);
	});

	test('only empty autoClosingPairs', () => {
		let characaterPairSupport = new CharacterPairSupport({ autoClosingPairs: [] });
		assert.deepEqual(characaterPairSupport.getAutoClosingPairs(), []);
		assert.deepEqual(characaterPairSupport.getSurroundingPairs(), []);
	});

	test('only brackets', () => {
		let characaterPairSupport = new CharacterPairSupport({ brackets: [['a', 'b']] });
		assert.deepEqual(characaterPairSupport.getAutoClosingPairs(), [{ open: 'a', close: 'b' }]);
		assert.deepEqual(characaterPairSupport.getSurroundingPairs(), [{ open: 'a', close: 'b' }]);
	});

	test('only empty brackets', () => {
		let characaterPairSupport = new CharacterPairSupport({ brackets: [] });
		assert.deepEqual(characaterPairSupport.getAutoClosingPairs(), []);
		assert.deepEqual(characaterPairSupport.getSurroundingPairs(), []);
	});

	test('only surroundingPairs', () => {
		let characaterPairSupport = new CharacterPairSupport({ surroundingPairs: [{ open: 'a', close: 'b' }] });
		assert.deepEqual(characaterPairSupport.getAutoClosingPairs(), []);
		assert.deepEqual(characaterPairSupport.getSurroundingPairs(), [{ open: 'a', close: 'b' }]);
	});

	test('only empty surroundingPairs', () => {
		let characaterPairSupport = new CharacterPairSupport({ brackets: [] });
		assert.deepEqual(characaterPairSupport.getAutoClosingPairs(), []);
		assert.deepEqual(characaterPairSupport.getSurroundingPairs(), []);
	});

	test('brackets is ignored when having autoClosingPairs', () => {
		let characaterPairSupport = new CharacterPairSupport({ autoClosingPairs: [], brackets: [['a', 'b']] });
		assert.deepEqual(characaterPairSupport.getAutoClosingPairs(), []);
		assert.deepEqual(characaterPairSupport.getSurroundingPairs(), []);
	});

	function testShouldAutoClose(characterPairSupport: CharacterPairSupport, line: TokenText[], character: string, offset: number): boolean {
		return characterPairSupport.shouldAutoClosePair(character, createFakeScopedLineTokens('test', line), offset);
	}

	test('shouldAutoClosePair in empty line', () => {
		let sup = new CharacterPairSupport({ autoClosingPairs: [{ open: '{', close: '}', notIn: ['string', 'comment'] }] });
		assert.equal(testShouldAutoClose(sup, [], 'a', 0), true);
		assert.equal(testShouldAutoClose(sup, [], '{', 0), true);
	});

	test('shouldAutoClosePair in not interesting line 1', () => {
		let sup = new CharacterPairSupport({ autoClosingPairs: [{ open: '{', close: '}', notIn: ['string', 'comment'] }] });
		assert.equal(testShouldAutoClose(sup, [{ text: 'do', type: 'keyword' }], '{', 2), true);
		assert.equal(testShouldAutoClose(sup, [{ text: 'do', type: 'keyword' }], 'a', 2), true);
	});

	test('shouldAutoClosePair in not interesting line 2', () => {
		let sup = new CharacterPairSupport({ autoClosingPairs: [{ open: '{', close: '}'}] });
		assert.equal(testShouldAutoClose(sup, [{ text: 'do', type: 'string' }], '{', 2), true);
		assert.equal(testShouldAutoClose(sup, [{ text: 'do', type: 'string' }], 'a', 2), true);
	});

	test('shouldAutoClosePair in interesting line 1', () => {
		let sup = new CharacterPairSupport({ autoClosingPairs: [{ open: '{', close: '}', notIn: ['string', 'comment'] }] });
		assert.equal(testShouldAutoClose(sup, [{ text: '"a"', type: 'string' }], '{', 0), false);
		assert.equal(testShouldAutoClose(sup, [{ text: '"a"', type: 'string' }], 'a', 0), true);
		assert.equal(testShouldAutoClose(sup, [{ text: '"a"', type: 'string' }], '{', 1), false);
		assert.equal(testShouldAutoClose(sup, [{ text: '"a"', type: 'string' }], 'a', 1), true);
		assert.equal(testShouldAutoClose(sup, [{ text: '"a"', type: 'string' }], '{', 2), false);
		assert.equal(testShouldAutoClose(sup, [{ text: '"a"', type: 'string' }], 'a', 2), true);
		assert.equal(testShouldAutoClose(sup, [{ text: '"a"', type: 'string' }], '{', 3), false);
		assert.equal(testShouldAutoClose(sup, [{ text: '"a"', type: 'string' }], 'a', 3), true);
	});

	test('shouldAutoClosePair in interesting line 2', () => {
		let sup = new CharacterPairSupport({ autoClosingPairs: [{ open: '{', close: '}', notIn: ['string', 'comment'] }] });
		assert.equal(testShouldAutoClose(sup, [{ text: 'x=', type: 'op' }, { text: '"a"', type: 'string' }, { text: ';', type: 'punct' }], '{', 0), true);
		assert.equal(testShouldAutoClose(sup, [{ text: 'x=', type: 'op' }, { text: '"a"', type: 'string' }, { text: ';', type: 'punct' }], 'a', 0), true);
		assert.equal(testShouldAutoClose(sup, [{ text: 'x=', type: 'op' }, { text: '"a"', type: 'string' }, { text: ';', type: 'punct' }], '{', 1), true);
		assert.equal(testShouldAutoClose(sup, [{ text: 'x=', type: 'op' }, { text: '"a"', type: 'string' }, { text: ';', type: 'punct' }], 'a', 1), true);
		assert.equal(testShouldAutoClose(sup, [{ text: 'x=', type: 'op' }, { text: '"a"', type: 'string' }, { text: ';', type: 'punct' }], '{', 2), true);
		assert.equal(testShouldAutoClose(sup, [{ text: 'x=', type: 'op' }, { text: '"a"', type: 'string' }, { text: ';', type: 'punct' }], 'a', 2), true);
		assert.equal(testShouldAutoClose(sup, [{ text: 'x=', type: 'op' }, { text: '"a"', type: 'string' }, { text: ';', type: 'punct' }], '{', 3), false);
		assert.equal(testShouldAutoClose(sup, [{ text: 'x=', type: 'op' }, { text: '"a"', type: 'string' }, { text: ';', type: 'punct' }], 'a', 3), true);
		assert.equal(testShouldAutoClose(sup, [{ text: 'x=', type: 'op' }, { text: '"a"', type: 'string' }, { text: ';', type: 'punct' }], '{', 4), false);
		assert.equal(testShouldAutoClose(sup, [{ text: 'x=', type: 'op' }, { text: '"a"', type: 'string' }, { text: ';', type: 'punct' }], 'a', 4), true);
		assert.equal(testShouldAutoClose(sup, [{ text: 'x=', type: 'op' }, { text: '"a"', type: 'string' }, { text: ';', type: 'punct' }], '{', 5), false);
		assert.equal(testShouldAutoClose(sup, [{ text: 'x=', type: 'op' }, { text: '"a"', type: 'string' }, { text: ';', type: 'punct' }], 'a', 5), true);
		assert.equal(testShouldAutoClose(sup, [{ text: 'x=', type: 'op' }, { text: '"a"', type: 'string' }, { text: ';', type: 'punct' }], '{', 6), true);
		assert.equal(testShouldAutoClose(sup, [{ text: 'x=', type: 'op' }, { text: '"a"', type: 'string' }, { text: ';', type: 'punct' }], 'a', 6), true);
	});

	test('shouldAutoClosePair in interesting line 3', () => {
		let sup = new CharacterPairSupport({ autoClosingPairs: [{ open: '{', close: '}', notIn: ['string', 'comment'] }] });
		assert.equal(testShouldAutoClose(sup, [{ text: ' ', type: '' }, { text: '//a', type: 'comment' }], '{', 0), true);
		assert.equal(testShouldAutoClose(sup, [{ text: ' ', type: '' }, { text: '//a', type: 'comment' }], 'a', 0), true);
		assert.equal(testShouldAutoClose(sup, [{ text: ' ', type: '' }, { text: '//a', type: 'comment' }], '{', 1), true);
		assert.equal(testShouldAutoClose(sup, [{ text: ' ', type: '' }, { text: '//a', type: 'comment' }], 'a', 1), true);
		assert.equal(testShouldAutoClose(sup, [{ text: ' ', type: '' }, { text: '//a', type: 'comment' }], '{', 2), false);
		assert.equal(testShouldAutoClose(sup, [{ text: ' ', type: '' }, { text: '//a', type: 'comment' }], 'a', 2), true);
		assert.equal(testShouldAutoClose(sup, [{ text: ' ', type: '' }, { text: '//a', type: 'comment' }], '{', 3), false);
		assert.equal(testShouldAutoClose(sup, [{ text: ' ', type: '' }, { text: '//a', type: 'comment' }], 'a', 3), true);
		assert.equal(testShouldAutoClose(sup, [{ text: ' ', type: '' }, { text: '//a', type: 'comment' }], '{', 4), false);
		assert.equal(testShouldAutoClose(sup, [{ text: ' ', type: '' }, { text: '//a', type: 'comment' }], 'a', 4), true);
	});

});

// suite('OnEnter', () => {

// 	test('uses indentationRules', () => {
// 		var support = new OnEnterSupport({
// 			indentationRules: {
// 				decreaseIndentPattern: /^\s*((?!\S.*\/[*]).*[*]\/\s*)?[})\]]|^\s*(case\b.*|default):\s*(\/\/.*|\/[*].*[*]\/\s*)?$/,
// 				increaseIndentPattern: /(\{[^}"']*|\([^)"']*|\[[^\]"']*|^\s*(\{\}|\(\)|\[\]|(case\b.*|default):))\s*(\/\/.*|\/[*].*[*]\/\s*)?$/,
// 				indentNextLinePattern: /^\s*(for|while|if|else)\b(?!.*[;{}]\s*(\/\/.*|\/[*].*[*]\/\s*)?$)/,
// 				unIndentedLinePattern: /^(?!.*([;{}]|\S:)\s*(\/\/.*|\/[*].*[*]\/\s*)?$)(?!.*(\{[^}"']*|\([^)"']*|\[[^\]"']*|^\s*(\{\}|\(\)|\[\]|(case\b.*|default):))\s*(\/\/.*|\/[*].*[*]\/\s*)?$)(?!^\s*((?!\S.*\/[*]).*[*]\/\s*)?[})\]]|^\s*(case\b.*|default):\s*(\/\/.*|\/[*].*[*]\/\s*)?$)(?!^\s*(for|while|if|else)\b(?!.*[;{}]\s*(\/\/.*|\/[*].*[*]\/\s*)?$))/
// 			}
// 		});

// 		var testIndentAction = (oneLineAboveText: string, beforeText: string, afterText: string, expected: IndentAction) => {
// 			var actual = support.onEnter(oneLineAboveText, beforeText, afterText);
// 			if (expected === IndentAction.None) {
// 				assert.equal(actual, null);
// 			} else {
// 				assert.equal(actual.indentAction, expected);
// 			}
// 		};

// 		testIndentAction('', 'case', '', IndentAction.None);
// 		testIndentAction('', 'case:', '', IndentAction.Indent);
// 		testIndentAction('', 'if (true) {', '', IndentAction.Indent);
// 		testIndentAction('', 'if (true)', '', IndentAction.Indent);
// 		testIndentAction('', ' ', '}', IndentAction.Outdent);
// 		testIndentAction('if(true)', '\treturn false', '', IndentAction.Outdent);
// 	});

// 	test('uses brackets', () => {
// 		var brackets: CharacterPair[] = [
// 			['(', ')'],
// 			['begin', 'end']
// 		];
// 		var support = new OnEnterSupport({
// 			brackets: brackets
// 		});
// 		var testIndentAction = (beforeText: string, afterText: string, expected: IndentAction) => {
// 			var actual = support.onEnter('', beforeText, afterText);
// 			if (expected === IndentAction.None) {
// 				assert.equal(actual, null);
// 			} else {
// 				assert.equal(actual.indentAction, expected);
// 			}
// 		};

// 		testIndentAction('a', '', IndentAction.None);
// 		testIndentAction('', 'b', IndentAction.None);
// 		testIndentAction('(', 'b', IndentAction.Indent);
// 		testIndentAction('a', ')', IndentAction.None);
// 		testIndentAction('begin', 'ending', IndentAction.Indent);
// 		testIndentAction('abegin', 'end', IndentAction.None);
// 		testIndentAction('begin', ')', IndentAction.Indent);
// 		testIndentAction('begin', 'end', IndentAction.IndentOutdent);
// 		testIndentAction('begin ', ' end', IndentAction.IndentOutdent);
// 		testIndentAction(' begin', 'end//as', IndentAction.IndentOutdent);
// 		testIndentAction('(', ')', IndentAction.IndentOutdent);
// 		testIndentAction('( ', ')', IndentAction.IndentOutdent);
// 		testIndentAction('a(', ')b', IndentAction.IndentOutdent);

// 		testIndentAction('(', '', IndentAction.Indent);
// 		testIndentAction('(', 'foo', IndentAction.Indent);
// 		testIndentAction('begin', 'foo', IndentAction.Indent);
// 		testIndentAction('begin', '', IndentAction.Indent);
// 	});

// 	test('uses regExpRules', () => {
// 		var support = new OnEnterSupport({
// 			regExpRules: [
// 				{
// 					beforeText: /^\s*\/\*\*(?!\/)([^\*]|\*(?!\/))*$/,
// 					afterText: /^\s*\*\/$/,
// 					action: { indentAction: IndentAction.IndentOutdent, appendText: ' * ' }
// 				},
// 				{
// 					beforeText: /^\s*\/\*\*(?!\/)([^\*]|\*(?!\/))*$/,
// 					action: { indentAction: IndentAction.None, appendText: ' * ' }
// 				},
// 				{
// 					beforeText: /^(\t|(\ \ ))*\ \*(\ ([^\*]|\*(?!\/))*)?$/,
// 					action: { indentAction: IndentAction.None, appendText: '* ' }
// 				},
// 				{
// 					beforeText: /^(\t|(\ \ ))*\ \*\/\s*$/,
// 					action: { indentAction: IndentAction.None, removeText: 1 }
// 				},
// 				{
// 					beforeText: /^(\t|(\ \ ))*\ \*[^/]*\*\/\s*$/,
// 					action: { indentAction: IndentAction.None, removeText: 1 }
// 				}
// 			]
// 		});
// 		var testIndentAction = (beforeText: string, afterText: string, expectedIndentAction: IndentAction, expectedAppendText: string, removeText: number = 0) => {
// 			var actual = support.onEnter('', beforeText, afterText);
// 			if (expectedIndentAction === null) {
// 				assert.equal(actual, null, 'isNull:' + beforeText);
// 			} else {
// 				assert.equal(actual !== null, true, 'isNotNull:' + beforeText);
// 				assert.equal(actual.indentAction, expectedIndentAction, 'indentAction:' + beforeText);
// 				if (expectedAppendText !== null) {
// 					assert.equal(actual.appendText, expectedAppendText, 'appendText:' + beforeText);
// 				}
// 				if (removeText !== 0) {
// 					assert.equal(actual.removeText, removeText, 'removeText:' + beforeText);
// 				}
// 			}
// 		};

// 		testIndentAction('\t/**', ' */', IndentAction.IndentOutdent, ' * ');
// 		testIndentAction('\t/**', '', IndentAction.None, ' * ');
// 		testIndentAction('\t/** * / * / * /', '', IndentAction.None, ' * ');
// 		testIndentAction('\t/** /*', '', IndentAction.None, ' * ');
// 		testIndentAction('/**', '', IndentAction.None, ' * ');
// 		testIndentAction('\t/**/', '', null, null);
// 		testIndentAction('\t/***/', '', null, null);
// 		testIndentAction('\t/*******/', '', null, null);
// 		testIndentAction('\t/** * * * * */', '', null, null);
// 		testIndentAction('\t/** */', '', null, null);
// 		testIndentAction('\t/** asdfg */', '', null, null);
// 		testIndentAction('\t/* asdfg */', '', null, null);
// 		testIndentAction('\t/* asdfg */', '', null, null);
// 		testIndentAction('\t/** asdfg */', '', null, null);
// 		testIndentAction('*/', '', null, null);
// 		testIndentAction('\t/*', '', null, null);
// 		testIndentAction('\t*', '', null, null);
// 		testIndentAction('\t *', '', IndentAction.None, '* ');
// 		testIndentAction('\t */', '', IndentAction.None, null, 1);
// 		testIndentAction('\t * */', '', IndentAction.None, null, 1);
// 		testIndentAction('\t * * / * / * / */', '', null, null);
// 		testIndentAction('\t * ', '', IndentAction.None, '* ');
// 		testIndentAction(' * ', '', IndentAction.None, '* ');
// 		testIndentAction(' * asdfsfagadfg', '', IndentAction.None, '* ');
// 		testIndentAction(' * asdfsfagadfg * * * ', '', IndentAction.None, '* ');
// 		testIndentAction(' * /*', '', IndentAction.None, '* ');
// 		testIndentAction(' * asdfsfagadfg * / * / * /', '', IndentAction.None, '* ');
// 		testIndentAction(' * asdfsfagadfg * / * / * /*', '', IndentAction.None, '* ');
// 		testIndentAction(' */', '', IndentAction.None, null, 1);
// 		testIndentAction('\t */', '', IndentAction.None, null, 1);
// 		testIndentAction('\t\t */', '', IndentAction.None, null, 1);
// 		testIndentAction('   */', '', IndentAction.None, null, 1);
// 		testIndentAction('     */', '', IndentAction.None, null, 1);
// 		testIndentAction('\t     */', '', IndentAction.None, null, 1);
// 		testIndentAction(' *--------------------------------------------------------------------------------------------*/', '', IndentAction.None, null, 1);
// 	});
// });