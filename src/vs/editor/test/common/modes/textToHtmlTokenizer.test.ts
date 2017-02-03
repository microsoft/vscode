/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { TokenizationRegistry, IState, LanguageIdentifier, ColorId, MetadataConsts } from 'vs/editor/common/modes';
import { tokenizeToString } from 'vs/editor/common/modes/textToHtmlTokenizer';
import { MockMode } from 'vs/editor/test/common/mocks/mockMode';
import { TokenizationResult2 } from 'vs/editor/common/core/token';

suite('Editor Modes - textToHtmlTokenizer', () => {
	function toStr(pieces: { className: string; text: string }[]): string {
		let resultArr = pieces.map((t) => `<span class="${t.className}">${t.text}</span>`);
		return resultArr.join('');
	}

	test('TextToHtmlTokenizer 1', () => {
		let mode = new Mode();

		let actual = tokenizeToString('.abc..def...gh', mode.getId());
		let expected = [
			{ className: 'mtk7', text: '.' },
			{ className: 'mtk9', text: 'abc' },
			{ className: 'mtk7', text: '..' },
			{ className: 'mtk9', text: 'def' },
			{ className: 'mtk7', text: '...' },
			{ className: 'mtk9', text: 'gh' },
		];
		let expectedStr = `<div class="monaco-tokenized-source">${toStr(expected)}</div>`;

		assert.equal(actual, expectedStr);

		mode.dispose();
	});

	test('TextToHtmlTokenizer 2', () => {
		let mode = new Mode();

		let actual = tokenizeToString('.abc..def...gh\n.abc..def...gh', mode.getId());
		let expected1 = [
			{ className: 'mtk7', text: '.' },
			{ className: 'mtk9', text: 'abc' },
			{ className: 'mtk7', text: '..' },
			{ className: 'mtk9', text: 'def' },
			{ className: 'mtk7', text: '...' },
			{ className: 'mtk9', text: 'gh' },
		];
		let expected2 = [
			{ className: 'mtk7', text: '.' },
			{ className: 'mtk9', text: 'abc' },
			{ className: 'mtk7', text: '..' },
			{ className: 'mtk9', text: 'def' },
			{ className: 'mtk7', text: '...' },
			{ className: 'mtk9', text: 'gh' },
		];
		let expectedStr1 = toStr(expected1);
		let expectedStr2 = toStr(expected2);
		let expectedStr = `<div class="monaco-tokenized-source">${expectedStr1}<br/>${expectedStr2}</div>`;

		assert.equal(actual, expectedStr);

		mode.dispose();
	});

});

class Mode extends MockMode {

	private static _id = new LanguageIdentifier('textToHtmlTokenizerMode', 3);

	constructor() {
		super(Mode._id);
		this._register(TokenizationRegistry.register(this.getId(), {
			getInitialState: (): IState => null,
			tokenize: undefined,
			tokenize2: (line: string, state: IState): TokenizationResult2 => {
				let tokensArr: number[] = [];
				let prevColor: ColorId = -1;
				for (let i = 0; i < line.length; i++) {
					let colorId = line.charAt(i) === '.' ? 7 : 9;
					if (prevColor !== colorId) {
						tokensArr.push(i);
						tokensArr.push((
							colorId << MetadataConsts.FOREGROUND_OFFSET
						) >>> 0);
					}
					prevColor = colorId;
				}

				let tokens = new Uint32Array(tokensArr.length);
				for (let i = 0; i < tokens.length; i++) {
					tokens[i] = tokensArr[i];
				}
				return new TokenizationResult2(tokens, null);
			}
		}));
	}
}
