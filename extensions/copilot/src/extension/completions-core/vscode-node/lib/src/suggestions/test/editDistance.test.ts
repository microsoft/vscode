/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as ed from '../editDistance';

suite('Edit-Distance Test Suite', function () {
	function test_alignment(haystack: string, needle: string, expected_dist: number, expected_match: string) {
		const alignment = ed.editDistance(haystack, needle);
		const alignedStr = haystack.substring(alignment.startOffset, alignment.endOffset);
		assert.strictEqual(alignment.distance, expected_dist);
		assert.strictEqual(alignedStr, expected_match);
		return alignment;
	}

	test('perfect match', function () {
		test_alignment('XXXXabcYYYY', 'abc', 0, 'abc');
	});

	test('first perfect match is used', function () {
		const alignment = test_alignment('XXXXabcYYYYabcZZZZ', 'abc', 0, 'abc');
		assert.strictEqual(alignment.startOffset, 4);
	});

	test('first equally-good match is used', function () {
		test_alignment('XXXXaScdXXXXabdXXXXabYcdXXXX', 'abcd', 1, 'aScd');
		test_alignment('XXXXabdXXXXabYcdXXXXaScdXXXX', 'abcd', 1, 'abd');
		test_alignment('XXXXabYcdXXXXaScdXXXXabdXXXX', 'abcd', 1, 'abYcd');
	});

	test('complete non-match', function () {
		const alignment = test_alignment('XXXX', 'YYY', 3, '');
		assert.strictEqual(alignment.startOffset, 0);
		assert.strictEqual(alignment.endOffset, 0);
	});

	test('almost non-match beginning', function () {
		test_alignment('aXXX', 'YYa', 2, 'a');
	});

	test('almost non-match end', function () {
		test_alignment('XXa', 'aYY', 2, 'a');
	});

	test('prefer substitution over equals + insertion', function () {
		// Same distance in edit operations. This is a convention
		test_alignment('aXbc', 'abc', 1, 'Xbc');
		// Alternative: match "aXbc" as equals on 'a' + insertion of 'X'
	});

	test('prefer deletion over substitution', function () {
		// Same distance in edit operations. This is a convention
		test_alignment('abcS', 'abcd', 1, 'abc');
		// Alternative: match "abcS" as subst 'd' by 'S'
	});

	test('deletions', function () {
		test_alignment('XXXabXcdXefXghXXX', 'abcdefgh', 3, 'abXcdXefXgh');
	});

	test('substitutions', function () {
		test_alignment('abSdeSg', 'abcdefg', 2, 'abSdeSg');
	});

	test('deletions and substitutions', function () {
		test_alignment('XXXabXSdeSXghXXX', 'abcdefgh', 4, 'abXSdeSXgh');
	});

	test('insertions from start of needle', function () {
		test_alignment('deXfgSiXXX', 'abcdefghi', 5, 'deXfgSi');
	});

	test('insertions from end of needle', function () {
		test_alignment('XXXXabXcdSf', 'abcdefgh', 4, 'abXcdSf');
	});

	test('insertions from the middle of needle', function () {
		test_alignment('XXXXabXcfXghXXXXX', 'abcdefgh', 4, 'abXcfXgh');
	});

	test('single char needle not matched', function () {
		test_alignment('XXX', 'a', 1, '');
	});

	test('single char needle match', function () {
		test_alignment('ab', 'a', 0, 'a');
	});

	test('empty haystack', function () {
		test_alignment('', 'abc', 3, '');
	});

	test('empty needle', function () {
		test_alignment('abc', '', 0, '');
	});

	test('empty needle and haystack', function () {
		test_alignment('', '', 0, '');
	});
});

suite('Lexical Analyzer for Edit-Distance Test Suite', function () {
	function test_lexing(s: string, expected_lexemes: string[]) {
		const [lexemes, d] = ed.lexicalAnalyzer(s, ed.emptyLexDictionary(), ed.lexGeneratorWords, lexeme => true);
		const lookup = ed.reverseLexDictionary(d);
		assert.deepStrictEqual(
			lexemes.map(([lid]) => lookup[lid]),
			expected_lexemes
		);
	}

	test('lex some alphanumeric words with underscores', function () {
		test_lexing('abc as22_b 12abc aAzZu', ['abc', ' ', 'as22_b', ' ', '12abc', ' ', 'aAzZu']);
	});

	test('lex split at symbols', function () {
		test_lexing('a:a-a;a+a?a{a}a(a)$a#a@a!a=a\\a\'a"a&a^', [
			'a',
			':',
			'a',
			'-',
			'a',
			';',
			'a',
			'+',
			'a',
			'?',
			'a',
			'{',
			'a',
			'}',
			'a',
			'(',
			'a',
			')',
			'$',
			'a',
			'#',
			'a',
			'@',
			'a',
			'!',
			'a',
			'=',
			'a',
			'\\',
			'a',
			`'`,
			'a',
			'"',
			'a',
			'&',
			'a',
			'^',
		]);
	});

	test('lex spaces and other whitespace', function () {
		test_lexing(' a  a   a      a \n a \t a \r a\n\n', [
			' ',
			'a',
			'  ',
			'a',
			'   ',
			'a',
			'      ',
			'a',
			' ',
			'\n',
			' ',
			'a',
			' ',
			'\t',
			' ',
			'a',
			' ',
			'\r',
			' ',
			'a',
			'\n',
			'\n',
		]);
	});

	test('lex common double-character symbols take up two lexemes', function () {
		test_lexing('== => -> ::', ['=', '=', ' ', '=', '>', ' ', '-', '>', ' ', ':', ':']);
	});

	test('lex astral plane characters', function () {
		test_lexing(' a🤪🤫a🤬1🤭_🤮', [' ', 'a', '🤪', '🤫', 'a', '🤬', '1', '🤭', '_', '🤮']);
	});

	test('lex alternative alphabets form words', function () {
		// Write some greek letters
		test_lexing(
			'a\u03B1\u03B2\u03B3\u03B4\u03B5\u03B6\u03B7\u03B8\u03B9\u03BA\u03BB\u03BC\u03BD\u03BE\u03BF\u03C0\u03C1\u03C2\u03C3\u03C4\u03C5',
			[
				'a\u03B1\u03B2\u03B3\u03B4\u03B5\u03B6\u03B7\u03B8\u03B9\u03BA\u03BB\u03BC\u03BD\u03BE\u03BF\u03C0\u03C1\u03C2\u03C3\u03C4\u03C5',
			]
		);
	});

	function test_lex_alignment(haystack: string, needle: string, expected_lex_dist: number, expected_match: string) {
		const alignment = ed.lexEditDistance(haystack, needle);
		const alignedStr = haystack.substring(alignment.startOffset, alignment.endOffset);
		assert.strictEqual(expected_lex_dist, alignment.lexDistance);
		assert.strictEqual(expected_match, alignedStr);
		return alignment;
	}

	test('lex-edit-dist perfect match', function () {
		test_lex_alignment('XX XX a b c\nd YY YY', 'a b c\nd', 0, 'a b c\nd');
	});

	test('lex-edit-dist ignores single spaces', function () {
		test_lex_alignment('XX XX ( ) { YY YY', '(){', 0, '( ) {');
	});

	test('lex-edit-dist counts multiple spaces and newlines', function () {
		test_lex_alignment('XX XX def fun (  )\n   {z} YY YY', 'def fun (){z}', 3, 'def fun (  )\n   {z}');
	});

	test('lex-edit-dist long words small distance', function () {
		test_lex_alignment(
			'a bee is a tee in deed',
			'a hippopotamus is a pachyderm in deed',
			2,
			'a bee is a tee in deed'
		);
	});

	test('lex-edit-dist first needle lexeme match postfix of lexeme in haystack', function () {
		test_lex_alignment('AKingdomForAHorse he did cry', 'Horse he did', 0, 'AKingdomForAHorse he did');
	});

	test('lex-edit-dist last needle lexeme match prefix of lexeme in haystack', function () {
		test_lex_alignment(
			'uncomfortable with promptOrExplode',
			'comfortable with prompt',
			0,
			'uncomfortable with promptOrExplode'
		);
	});

	test('lex-edit-dist needle single lexeme match postfix', function () {
		test_lex_alignment('xx aabb cc dd', 'abb', 0, 'aabb');
	});

	test('lex-edit-dist needle single lexeme match prefix', function () {
		test_lex_alignment('xx aabb cc dd', 'aab', 0, 'aabb');
	});

	test('lex-edit-dist haystack single lexeme match postfix', function () {
		test_lex_alignment('aabb', 'abb cc', 1, 'aabb');
	});

	test('lex-edit-dist haystack single lexeme match prefix', function () {
		test_lex_alignment('aabb', 'cc aab', 1, 'aabb');
	});

	// The following tests are equivalent to those for character-based
	// edit-distance, but all characters have been replaced by multi-character
	// tokens. This is more test of offset-adjustment rather than the
	// edit-distance algorithm itself.

	test('lexed almost non-match beginning', function () {
		test_lex_alignment('aa XX XX XX ', 'YY YY aa', 2, 'aa');
	});

	test('lexed almost non-match end', function () {
		test_lex_alignment('XX XX aa', 'aa YY YY ', 2, 'aa');
	});

	test('lexed prefer substitution over equals + insertion', function () {
		test_lex_alignment('aa XX bb cc ', 'aa bb cc ', 1, 'XX bb cc');
	});

	test('lexed prefer deletion over substitution', function () {
		// Same distance in edit operations. This is a convention
		test_lex_alignment('aa bb cc SS ', 'aa bb cc dd', 1, 'aa bb cc');
	});

	test('lexed deletions', function () {
		test_lex_alignment(
			'XX XX XX aa bb XX cc dd XX ee ff XX gg hh XX XX XX ',
			'aa bb cc dd ee ff gg hh',
			3,
			'aa bb XX cc dd XX ee ff XX gg hh'
		);
	});

	test('lexed substitutions', function () {
		test_lex_alignment('aa bb SS dd ee SS gg', 'aa bb cc dd ee ff gg', 2, 'aa bb SS dd ee SS gg');
	});

	test('lexed deletions and substitutions', function () {
		test_lex_alignment(
			'XX XX XX aa bb XX SS dd ee SS XX gg hh XX XX XX ',
			'aa bb cc dd ee ff gg hh',
			4,
			'aa bb XX SS dd ee SS XX gg hh'
		);
	});

	test('lexed insertions from start of needle', function () {
		test_lex_alignment('dd ee XX ff gg SS ii XX XX XX ', 'aa bb cc dd ee ff gg hh ii', 5, 'dd ee XX ff gg SS ii');
	});

	test('lexed insertions from end of needle', function () {
		test_lex_alignment('XX XX XX XX aa bb XX cc dd SS ff', 'aa bb cc dd ee ff gg hh', 4, 'aa bb XX cc dd SS ff');
	});

	test('lexed insertions from the middle of needle', function () {
		test_lex_alignment(
			'XX XX XX XX aa bb XX cc ff XX gg hh XX XX XX XX XX ',
			'aa bb cc dd ee ff gg hh',
			4,
			'aa bb XX cc ff XX gg hh'
		);
	});

	test('lexed empty haystack', function () {
		test_lex_alignment('', 'aa bb cc', 3, '');
	});

	test('lexed empty needle', function () {
		test_lex_alignment('aa bb cc', '', 0, '');
	});

	test('lexed empty needle and haystack', function () {
		test_lex_alignment('', '', 0, '');
	});
});
