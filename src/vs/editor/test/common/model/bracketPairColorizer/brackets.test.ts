/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { LanguageAgnosticBracketTokens } from '../../../../common/model/bracketPairsTextModelPart/bracketPairsTree/brackets.js';
import { SmallImmutableSet, DenseKeyProvider } from '../../../../common/model/bracketPairsTextModelPart/bracketPairsTree/smallImmutableSet.js';
import { Token, TokenKind } from '../../../../common/model/bracketPairsTextModelPart/bracketPairsTree/tokenizer.js';
import { TestLanguageConfigurationService } from '../../modes/testLanguageConfigurationService.js';

suite('Bracket Pair Colorizer - Brackets', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('Basic', () => {
		const languageId = 'testMode1';
		const denseKeyProvider = new DenseKeyProvider<string>();
		const getImmutableSet = (elements: string[]) => {
			let newSet = SmallImmutableSet.getEmpty();
			elements.forEach(x => newSet = newSet.add(`${languageId}:::${x}`, denseKeyProvider));
			return newSet;
		};
		const getKey = (value: string) => {
			return denseKeyProvider.getKey(`${languageId}:::${value}`);
		};

		const disposableStore = new DisposableStore();
		const languageConfigService = disposableStore.add(new TestLanguageConfigurationService());
		disposableStore.add(languageConfigService.register(languageId, {
			brackets: [
				['{', '}'], ['[', ']'], ['(', ')'],
				['begin', 'end'], ['case', 'endcase'], ['casez', 'endcase'],					// Verilog
				['\\left(', '\\right)'], ['\\left(', '\\right.'], ['\\left.', '\\right)'],		// LaTeX Parentheses
				['\\left[', '\\right]'], ['\\left[', '\\right.'], ['\\left.', '\\right]']		// LaTeX Brackets
			]
		}));

		const brackets = new LanguageAgnosticBracketTokens(denseKeyProvider, l => languageConfigService.getLanguageConfiguration(l));
		const bracketsExpected = [
			{ text: '{', length: 1, kind: 'OpeningBracket', bracketId: getKey('{'), bracketIds: getImmutableSet(['{']) },
			{ text: '[', length: 1, kind: 'OpeningBracket', bracketId: getKey('['), bracketIds: getImmutableSet(['[']) },
			{ text: '(', length: 1, kind: 'OpeningBracket', bracketId: getKey('('), bracketIds: getImmutableSet(['(']) },
			{ text: 'begin', length: 5, kind: 'OpeningBracket', bracketId: getKey('begin'), bracketIds: getImmutableSet(['begin']) },
			{ text: 'case', length: 4, kind: 'OpeningBracket', bracketId: getKey('case'), bracketIds: getImmutableSet(['case']) },
			{ text: 'casez', length: 5, kind: 'OpeningBracket', bracketId: getKey('casez'), bracketIds: getImmutableSet(['casez']) },
			{ text: '\\left(', length: 6, kind: 'OpeningBracket', bracketId: getKey('\\left('), bracketIds: getImmutableSet(['\\left(']) },
			{ text: '\\left.', length: 6, kind: 'OpeningBracket', bracketId: getKey('\\left.'), bracketIds: getImmutableSet(['\\left.']) },
			{ text: '\\left[', length: 6, kind: 'OpeningBracket', bracketId: getKey('\\left['), bracketIds: getImmutableSet(['\\left[']) },

			{ text: '}', length: 1, kind: 'ClosingBracket', bracketId: getKey('{'), bracketIds: getImmutableSet(['{']) },
			{ text: ']', length: 1, kind: 'ClosingBracket', bracketId: getKey('['), bracketIds: getImmutableSet(['[']) },
			{ text: ')', length: 1, kind: 'ClosingBracket', bracketId: getKey('('), bracketIds: getImmutableSet(['(']) },
			{ text: 'end', length: 3, kind: 'ClosingBracket', bracketId: getKey('begin'), bracketIds: getImmutableSet(['begin']) },
			{ text: 'endcase', length: 7, kind: 'ClosingBracket', bracketId: getKey('case'), bracketIds: getImmutableSet(['case', 'casez']) },
			{ text: '\\right)', length: 7, kind: 'ClosingBracket', bracketId: getKey('\\left('), bracketIds: getImmutableSet(['\\left(', '\\left.']) },
			{ text: '\\right.', length: 7, kind: 'ClosingBracket', bracketId: getKey('\\left('), bracketIds: getImmutableSet(['\\left(', '\\left[']) },
			{ text: '\\right]', length: 7, kind: 'ClosingBracket', bracketId: getKey('\\left['), bracketIds: getImmutableSet(['\\left[', '\\left.']) }
		];
		const bracketsActual = bracketsExpected.map(x => tokenToObject(brackets.getToken(x.text, languageId), x.text));

		assert.deepStrictEqual(bracketsActual, bracketsExpected);

		disposableStore.dispose();
	});

	test('Issue #329789: `<`/`>` should not be treated as brackets inside shift-assignment operators', () => {
		const languageId = 'testMode2';
		const denseKeyProvider = new DenseKeyProvider<string>();

		const disposableStore = new DisposableStore();
		const languageConfigService = disposableStore.add(new TestLanguageConfigurationService());
		disposableStore.add(languageConfigService.register(languageId, {
			brackets: [
				['<', '>']
			]
		}));

		const brackets = new LanguageAgnosticBracketTokens(denseKeyProvider, l => languageConfigService.getLanguageConfiguration(l));
		const regExp = brackets.getSingleLanguageBracketTokens(languageId).regExpGlobal!;

		// This regex is consumed by two different scanning strategies in the real engine:
		// - `NonPeekableTextBufferTokenizer.read()` re-slices the text from the current offset
		//   and restarts matching (`lastIndex = 0`) after each found bracket.
		// - `FastTokenizer` runs one continuous global exec over the whole, unsliced string,
		//   letting `lastIndex` auto-advance between matches.
		// A guard that only works under one of these (e.g. a lookbehind relying on "not
		// preceded by an already-matched bracket char") can silently break the other - which
		// is exactly what happened during development of this fix: a lookbehind-based guard
		// passed under the resliced style but broke nested generics (`Array<Array<T>>`) under
		// the continuous style, because the lookbehind saw the real, adjacent `>` character
		// regardless of whether it had already been "consumed" as a match. Both styles are
		// checked here so a regression in either can't slip through unnoticed again.
		const findMatchesResliced = (text: string) => {
			const matches: string[] = [];
			let pos = 0;
			while (pos < text.length) {
				regExp.lastIndex = 0;
				const match = regExp.exec(text.slice(pos));
				if (!match) {
					break;
				}
				matches.push(match[0]);
				pos += match.index + match[0].length;
			}
			return matches;
		};
		const findMatchesContinuous = (text: string) => {
			regExp.lastIndex = 0;
			const matches: string[] = [];
			let match: RegExpExecArray | null;
			while ((match = regExp.exec(text))) {
				matches.push(match[0]);
				if (match[0].length === 0) {
					regExp.lastIndex++;
				}
			}
			return matches;
		};
		const assertMatches = (text: string, expected: string[]) => {
			assert.deepStrictEqual(findMatchesResliced(text), expected, `resliced scan of ${JSON.stringify(text)}`);
			assert.deepStrictEqual(findMatchesContinuous(text), expected, `continuous scan of ${JSON.stringify(text)}`);
		};

		// `<<=`, `>>=` and `>>>=` are unambiguous operators and must not be matched as brackets.
		assertMatches('x <<= 1;', []);
		assertMatches('x >>= 1;', []);
		assertMatches('x >>>= 1;', []);

		// Genuine brackets must still be matched, including adjacent closing brackets
		// from nested generics (e.g. the `>>` at the end of `Array<Array<string>>`).
		assertMatches('Array<string>', ['<', '>']);
		assertMatches('Array<Array<string>>', ['<', '<', '>', '>']);
		assertMatches('<div></div>', ['<', '>', '<', '>']);

		// Plain shift (`<<`, `>>`) is a pre-existing, out-of-scope ambiguity (`>>` also closes
		// nested generics) and is unaffected. `<=`/`>=` are also excluded: a directly-adjacent
		// `<`/`>` immediately followed by `=` is never a legitimate bracket in real TS/JSX
		// source (always the relational or compound-assignment operator), and excluding them
		// is what allows the guard to be expressed with lookahead only (see the comment on
		// `prepareBracketForRegExp` for why lookbehind is unsafe here).
		assertMatches('x << 1;', ['<', '<']);
		assertMatches('x >> 1;', ['>', '>']);
		assertMatches('x <= 1;', []);
		assertMatches('x >= 1;', []);

		disposableStore.dispose();
	});
});

function tokenToObject(token: Token | undefined, text: string): any {
	if (token === undefined) {
		return undefined;
	}
	return {
		text: text,
		length: token.length,
		bracketId: token.bracketId,
		bracketIds: token.bracketIds,
		kind: {
			[TokenKind.ClosingBracket]: 'ClosingBracket',
			[TokenKind.OpeningBracket]: 'OpeningBracket',
			[TokenKind.Text]: 'Text',
		}[token.kind],
	};
}
