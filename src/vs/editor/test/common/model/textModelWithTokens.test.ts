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
import {IFoundBracket} from 'vs/editor/common/editorCommon';
import {TextModel} from 'vs/editor/common/model/textModel';
import {TextModelWithTokens} from 'vs/editor/common/model/textModelWithTokens';

suite('TextModelWithTokens', () => {

	function assertViewLineTokens(model:Model, lineNumber:number, forceTokenization:boolean, expected:ViewLineToken[]): void {
		let actual = model.getLineTokens(lineNumber, !forceTokenization).inflate();
		assert.deepEqual(actual, expected);
	}

	test('Microsoft/monaco-editor#122: Unhandled Exception: TypeError: Unable to get property \'replace\' of undefined or null reference', () => {
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

});

suite('TextModelWithTokens', () => {

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

	function testBrackets(contents: string[], brackets:string[][]): void {
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
