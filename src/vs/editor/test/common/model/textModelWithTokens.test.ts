/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import {Model} from 'vs/editor/common/model/model';
import {ViewLineToken} from 'vs/editor/common/core/viewLineToken';
import {ITokenizationSupport} from 'vs/editor/common/modes';
import {MockMode} from 'vs/editor/test/common/mocks/mockMode';
import {Token} from 'vs/editor/common/core/token';
import {Range} from 'vs/editor/common/core/range';
import {Position} from 'vs/editor/common/core/position';
import {IFoundBracket} from 'vs/editor/common/editorCommon';
import {TextModel} from 'vs/editor/common/model/textModel';
import {TextModelWithTokens} from 'vs/editor/common/model/textModelWithTokens';
import {LanguageConfigurationRegistry} from 'vs/editor/common/modes/languageConfigurationRegistry';

suite('TextModelWithTokens', () => {

	function testBrackets(contents: string[], brackets:string[][]): void {
		function toRelaxedFoundBracket(a:IFoundBracket) {
			if (!a) {
				return null;
			}
			return {
				range: a.range.toString(),
				open: a.open,
				close: a.close,
				isOpen: a.isOpen
			};
		}

		let charIsBracket: {[char:string]:boolean} = {};
		let charIsOpenBracket: {[char:string]:boolean} = {};
		let openForChar: {[char:string]:string} = {};
		let closeForChar: {[char:string]:string} = {};
		brackets.forEach((b) => {
			charIsBracket[b[0]] = true;
			charIsBracket[b[1]] = true;

			charIsOpenBracket[b[0]] = true;
			charIsOpenBracket[b[1]] = false;

			openForChar[b[0]] = b[0];
			closeForChar[b[0]] = b[1];

			openForChar[b[1]] = b[0];
			closeForChar[b[1]] = b[1];
		});

		let expectedBrackets:IFoundBracket[] = [];
		for (let lineIndex = 0; lineIndex < contents.length; lineIndex++) {
			let lineText = contents[lineIndex];

			for (let charIndex = 0; charIndex < lineText.length; charIndex++) {
				let ch = lineText.charAt(charIndex);
				if (charIsBracket[ch]) {
					expectedBrackets.push({
						open: openForChar[ch],
						close: closeForChar[ch],
						isOpen: charIsOpenBracket[ch],
						range: new Range(lineIndex + 1, charIndex + 1, lineIndex + 1, charIndex + 2)
					});
				}
			}
		}

		let model = new TextModelWithTokens([], TextModel.toRawText(contents.join('\n'), TextModel.DEFAULT_CREATION_OPTIONS), null);

		// findPrevBracket
		{
			let expectedBracketIndex = expectedBrackets.length - 1;
			let currentExpectedBracket = expectedBracketIndex >= 0 ? expectedBrackets[expectedBracketIndex] : null;
			for (let lineNumber = contents.length; lineNumber >= 1; lineNumber--) {
				let lineText = contents[lineNumber - 1];

				for (let column = lineText.length + 1; column >= 1; column--) {

					if (currentExpectedBracket) {
						if (lineNumber === currentExpectedBracket.range.startLineNumber && column < currentExpectedBracket.range.endColumn) {
							expectedBracketIndex--;
							currentExpectedBracket = expectedBracketIndex >= 0 ? expectedBrackets[expectedBracketIndex] : null;
						}
					}

					let actual = model.findPrevBracket({
						lineNumber: lineNumber,
						column: column
					});

					assert.deepEqual(toRelaxedFoundBracket(actual), toRelaxedFoundBracket(currentExpectedBracket), 'findPrevBracket of ' + lineNumber + ', ' + column);
				}
			}
		}

		// findNextBracket
		{
			let expectedBracketIndex = 0;
			let currentExpectedBracket = expectedBracketIndex < expectedBrackets.length ? expectedBrackets[expectedBracketIndex] : null;
			for (let lineNumber = 1; lineNumber <= contents.length; lineNumber++) {
				let lineText = contents[lineNumber - 1];

				for (let column = 1; column <= lineText.length + 1; column++) {

					if (currentExpectedBracket) {
						if (lineNumber === currentExpectedBracket.range.startLineNumber && column > currentExpectedBracket.range.startColumn) {
							expectedBracketIndex++;
							currentExpectedBracket = expectedBracketIndex < expectedBrackets.length ? expectedBrackets[expectedBracketIndex] : null;
						}
					}

					let actual = model.findNextBracket({
						lineNumber: lineNumber,
						column: column
					});

					assert.deepEqual(toRelaxedFoundBracket(actual), toRelaxedFoundBracket(currentExpectedBracket), 'findNextBracket of ' + lineNumber + ', ' + column);
				}
			}
		}

		model.dispose();
	}

	test('brackets', () => {
		testBrackets([
			'if (a == 3) { return (7 * (a + 5)); }'
		], [
			['{', '}'],
			['[', ']'],
			['(', ')']
		]);
	});


});

suite('TextModelWithTokens - bracket matching', () => {

	function isNotABracket(model:Model, lineNumber:number, column:number) {
		let match = model.matchBracket(new Position(lineNumber, column));
		assert.equal(match, null, 'is not matching brackets at ' + lineNumber + ', ' + column);
	}

	function isBracket(model:Model, lineNumber1:number, column11:number, column12:number, lineNumber2:number, column21:number, column22:number) {
		let match = model.matchBracket(new Position(lineNumber1, column11));
		assert.deepEqual(match, [
			new Range(lineNumber1, column11, lineNumber1, column12),
			new Range(lineNumber2, column21, lineNumber2, column22)
		], 'is matching brackets at ' + lineNumber1 + ', ' + column11);
	}

	class BracketMode extends MockMode {
		constructor() {
			super();
			LanguageConfigurationRegistry.register(this.getId(), {
				brackets: [
					['{', '}'],
					['[', ']'],
					['(', ')'],
				]
			});
		}
	}

	test('bracket matching 1', () => {
		let text =
			')]}{[(' + '\n' +
			')]}{[(';
		let model = Model.createFromString(text, undefined, new BracketMode());

		isNotABracket(model, 1, 1);
		isNotABracket(model, 1, 2);
		isNotABracket(model, 1, 3);
		isBracket(model, 1, 4, 5, 2, 3, 4);
		isBracket(model, 1, 5, 4, 2, 3, 4);
		isBracket(model, 1, 6, 5, 2, 2, 3);
		isBracket(model, 1, 7, 6, 2, 1, 2);

		isBracket(model, 2, 1, 2, 1, 6, 7);
		isBracket(model, 2, 2, 1, 1, 6, 7);
		isBracket(model, 2, 3, 2, 1, 5, 6);
		isBracket(model, 2, 4, 3, 1, 4, 5);
		isNotABracket(model, 2, 5);
		isNotABracket(model, 2, 6);
		isNotABracket(model, 2, 7);

		model.destroy();
	});

	test('bracket matching 2', () => {
		let text =
			'var bar = {' + '\n' +
			'foo: {' + '\n' +
			'}, bar: {hallo: [{' + '\n' +
			'}, {' + '\n' +
			'}]}}';
		let model = Model.createFromString(text, undefined, new BracketMode());

		let brackets = [
			[1, 11, 12, 5, 4, 5],
			[1, 12, 11, 5, 4, 5],
			[5, 5, 4, 1, 11, 12],

			[2, 6, 7, 3, 1, 2],
			[2, 7, 6, 3, 1, 2],
			[3, 1, 2, 2, 6, 7],
			[3, 2, 1, 2, 6, 7],

			[3, 9, 10, 5, 3, 4],
			[3, 10, 9, 5, 3, 4],
			[5, 4, 3, 3, 9, 10],

			[3, 17, 18, 5, 2, 3],
			[3, 18, 17, 5, 2, 3],
			[5, 3, 2, 3, 17, 18],

			[3, 19, 18, 4, 1, 2],
			[4, 2, 1, 3, 18, 19],
			[4, 1, 2, 3, 18, 19],

			[4, 4, 5, 5, 1, 2],
			[4, 5, 4, 5, 1, 2],
			[5, 2, 1, 4, 4, 5],
			[5, 1, 2, 4, 4, 5]
		];
		let i, len, b, isABracket = {1:{}, 2:{}, 3:{}, 4:{}, 5:{}};

		for (i = 0, len = brackets.length; i < len; i++) {
			b = brackets[i];
			isBracket(model, b[0], b[1], b[2], b[3], b[4], b[5]);
			isABracket[b[0]][b[1]] = true;
		}

		for (i = 1, len = model.getLineCount(); i <= len; i++) {
			let line = model.getLineContent(i), j, lenJ;
			for (j = 1, lenJ = line.length + 1; j <= lenJ; j++) {
				if (!isABracket[i].hasOwnProperty(j)) {
					isNotABracket(model, i, j);
				}
			}
		}

		model.destroy();
	});
});


suite('TextModelWithTokens regression tests', () => {

	test('Microsoft/monaco-editor#122: Unhandled Exception: TypeError: Unable to get property \'replace\' of undefined or null reference', () => {
		function assertViewLineTokens(model:Model, lineNumber:number, forceTokenization:boolean, expected:ViewLineToken[]): void {
			let actual = model.getLineTokens(lineNumber, !forceTokenization).inflate();
			assert.deepEqual(actual, expected);
		}

		let _tokenId = 0;
		class IndicisiveMode extends MockMode {
			public tokenizationSupport:ITokenizationSupport;

			constructor() {
				super();
				this.tokenizationSupport = {
					getInitialState: () => {
						return null;
					},
					tokenize: (line, state, offsetDelta, stopAtOffset) => {
						let myId = ++_tokenId;
						return {
							tokens: [new Token(0, 'custom.'+myId)],
							actualStopOffset: line.length,
							endState: null,
							modeTransitions: [],
							retokenize: null
						};
					}
				};
			}
		}
		let model = Model.createFromString('A model with\ntwo lines');

		assertViewLineTokens(model, 1, true, [new ViewLineToken(0, '')]);
		assertViewLineTokens(model, 2, true, [new ViewLineToken(0, '')]);

		model.setMode(new IndicisiveMode());

		assertViewLineTokens(model, 1, true, [new ViewLineToken(0, 'custom.1')]);
		assertViewLineTokens(model, 2, true, [new ViewLineToken(0, 'custom.2')]);

		model.setMode(new IndicisiveMode());

		assertViewLineTokens(model, 1, false, [new ViewLineToken(0, '')]);
		assertViewLineTokens(model, 2, false, [new ViewLineToken(0, '')]);

		model.dispose();
	});

	test('Microsoft/monaco-editor#133: Error: Cannot read property \'modeId\' of undefined', () => {
		class BracketMode extends MockMode {
			constructor() {
				super();
				LanguageConfigurationRegistry.register(this.getId(), {
					brackets: [
						['module','end module'],
						['sub','end sub']
					]
				});
			}
		}

		let model = Model.createFromString([
			'Imports System',
			'Imports System.Collections.Generic',
			'',
			'Module m1',
			'',
			'\tSub Main()',
			'\tEnd Sub',
			'',
			'End Module',
		].join('\n'), undefined, new BracketMode());

		let actual = model.matchBracket(new Position(4,1));
		assert.deepEqual(actual, [new Range(4,1,4,7), new Range(9,1,9,11)]);

		model.dispose();
	});
});