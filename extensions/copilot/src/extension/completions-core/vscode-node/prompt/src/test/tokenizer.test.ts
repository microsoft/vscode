/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import * as fs from 'fs';
import { resolve } from 'path';
import { ApproximateTokenizer, getTokenizer, TokenizerName } from '../tokenization';

// Read the source files and normalize the line endings
const source = fs.readFileSync(resolve(__dirname, 'testdata/example.py'), 'utf8').replace(/\r\n?/g, '\n');

suite('Tokenizers can be loaded', function () {
	for (const tokenizer of Object.values(TokenizerName)) {
		test(`Tokenizer ${tokenizer} can be loaded`, function () {
			getTokenizer(tokenizer);
		});
	}
});

// test suite for MockTokenizer
suite('MockTokenizer', function () {
	const tokenizer = getTokenizer(TokenizerName.mock);

	test('tokenize', function () {
		const tokens = tokenizer.tokenize('a b c');
		assert.strictEqual(tokens.length, 5);

		for (const token of tokens) {
			assert.strictEqual(typeof token, 'number');
		}
	});

	test('detokenize', function () {
		const tokens = tokenizer.tokenize('a b c');
		const text = tokenizer.detokenize(tokens);
		// unfortunately the mock tokenizer doesn't correctly round-trip the text
		// because the token representation is a number. If this matters then we'll
		// have to change the mock tokenizer to use a different representation.
		assert.strictEqual(text, '97 32 98 32 99');
	});

	test('tokenLength', function () {
		assert.strictEqual(tokenizer.tokenLength('a b c'), 5);
	});

	test('takeFirstTokens', function () {
		const tokens = tokenizer.takeFirstTokens('a b c', 3);
		assert.strictEqual(tokens.text, 'a b');
		assert.strictEqual(tokens.tokens.length, 3);
	});

	test('takeLastTokens', function () {
		const tokens = tokenizer.takeLastTokens('a b c', 3);
		assert.strictEqual(tokens.text, 'b c');
	});

	test('takeLastLinesTokens', function () {
		const tokens = tokenizer.takeLastLinesTokens('a b c', 3);
		assert.strictEqual(tokens, 'b c');
	});
});

suite('Tokenizer Test Suite - cl100k', function () {
	const tokenizer = getTokenizer(TokenizerName.cl100k);

	test('empty string', function () {
		const str = '';
		assert.deepStrictEqual(tokenizer.tokenize(str), []);
		assert.strictEqual(tokenizer.detokenize(tokenizer.tokenize(str)), str);
	});

	test('space', function () {
		const str = ' ';
		assert.deepStrictEqual(tokenizer.tokenize(str), [220]);
		assert.strictEqual(tokenizer.detokenize(tokenizer.tokenize(str)), str);
	});

	test('tab', function () {
		const str = '\t';
		assert.deepStrictEqual(tokenizer.tokenize(str), [197]);
		assert.strictEqual(tokenizer.detokenize(tokenizer.tokenize(str)), str);
	});

	test('simple text', function () {
		const str = 'This is some text';
		assert.strictEqual(tokenizer.detokenize(tokenizer.tokenize(str)), str);
		assert.deepStrictEqual(tokenizer.tokenize(str), [2028, 374, 1063, 1495]);
	});

	test('multi-token word', function () {
		const str = 'indivisible';
		assert.deepStrictEqual(tokenizer.tokenize(str), [485, 344, 23936]);
		assert.strictEqual(tokenizer.detokenize(tokenizer.tokenize(str)), str);
	});

	test('emojis', function () {
		const str = 'hello 👋 world 🌍';
		assert.deepStrictEqual(tokenizer.tokenize(str), [15339, 62904, 233, 1917, 11410, 234, 235]);
		assert.strictEqual(tokenizer.detokenize(tokenizer.tokenize(str)), str);
	});

	test('contractions', function () {
		const str = `you'll`;
		assert.deepStrictEqual(tokenizer.tokenize(str), [9514, 3358]);
		assert.strictEqual(tokenizer.detokenize(tokenizer.tokenize(str)), str);
	});

	test('assert that consecutive newline is never tokenized as multiple newlines', function () {
		// This is due to a regular expression change in the tokenizer.

		// Loop through all possible ascii numbers and letters
		for (let i = 0; i < 128; i++) {
			const char = String.fromCharCode(i);
			if (char !== '\n') {
				assert.deepStrictEqual(tokenizer.tokenLength(`\n\n${char}`), 2);
			}
		}

		// Test special characters
		assert.deepStrictEqual(tokenizer.tokenize('\n\n👋'), [271, 9468, 239, 233]);
		assert.deepStrictEqual(tokenizer.tokenize('\n\n '), [271, 220]);
		assert.deepStrictEqual(tokenizer.tokenize('\n\n 👋'), [271, 62904, 233]);
		assert.deepStrictEqual(tokenizer.tokenize('\n\n\t'), [271, 197]);
		assert.deepStrictEqual(tokenizer.tokenize('\n\n\r'), [271, 201]);

		// New lines are treated specially tho
		for (let i = 1; i < 10; i++) {
			assert.deepStrictEqual(tokenizer.tokenLength('\n'.repeat(i)), 1);
		}
	});

	test('tokenizeStrings', function () {
		const tokens_s = tokenizer.tokenizeStrings(source);
		assert.strictEqual(tokens_s.join(''), source, 'tokenizeStrings does not join to form the input string');
		const tokens = tokenizer.tokenize(source);
		assert.strictEqual(tokens_s.length, tokens.length, 'tokenizeStrings should have same length as tokenize');
		const half = Math.floor(tokens_s.length / 2);
		assert.strictEqual(
			tokens_s.slice(0, half).join(''),
			tokenizer.detokenize(tokens.slice(0, half)),
			'tokenizeStrings slice should represent the corresponding slice with tokenize'
		);
	});

	test('takeLastTokens invariant of starting position', function () {
		const suffix = tokenizer.takeLastTokens(source, 25);
		assert.strictEqual(
			suffix.text,
			`"To the import {imp.module} as {imp.as_name}, we add the following comment: {description}")\n        return description`
		);
		assert.strictEqual(suffix.tokens.length, 25);
		assert.strictEqual(suffix.text, tokenizer.takeLastTokens(source.substring(50), 25).text);
		assert.strictEqual(suffix.text, tokenizer.takeLastTokens(source.substring(100), 25).text);
		assert.strictEqual(suffix.text, tokenizer.takeLastTokens(source.substring(150), 25).text);
		assert.strictEqual(suffix.text, tokenizer.takeLastTokens(source.substring(200), 25).text);
	});

	test('takeLastTokens returns the desired number of tokens', function () {
		assert.strictEqual(tokenizer.takeLastTokens(source, 30).tokens.length, 30);
		assert.strictEqual(tokenizer.takeLastTokens(source, 29).tokens.length, 29);
		assert.strictEqual(tokenizer.takeLastTokens(source, 28).tokens.length, 28);
		assert.strictEqual(tokenizer.takeLastTokens(source, 5).tokens.length, 5);
		assert.strictEqual(tokenizer.takeLastTokens(source, 0).tokens.length, 0);
		assert.strictEqual(tokenizer.takeLastTokens(source, 1).tokens.length, 1);
		assert.strictEqual(tokenizer.takeLastTokens(source, 1000).tokens.length, 1000);
		assert.strictEqual(tokenizer.takeLastTokens(source, 100000).text, source);
		assert.strictEqual(tokenizer.takeLastTokens('\n\n\n', 1).tokens.length, 1);
	});

	test('takeLastTokens returns a suffix of the sought length', function () {
		function check(n: number): void {
			const { text: suffix } = tokenizer.takeLastTokens(source, n);
			assert.strictEqual(tokenizer.tokenLength(suffix), n);
			assert.strictEqual(suffix, source.substring(source.length - suffix.length));
		}
		check(0);
		check(1);
		check(5);
		check(29);
		check(30);
		check(100);
		check(1000);
		assert.strictEqual(tokenizer.takeLastTokens(source, 100000).text, source);
	});

	test('test takeLastLinesTokens', function () {
		let example = 'a b c\nd e f\ng h i';
		assert.strictEqual(tokenizer.takeLastLinesTokens(example, 3), 'g h i');
		assert.strictEqual(tokenizer.takeLastLinesTokens(example, 4), 'g h i');
		assert.strictEqual(tokenizer.takeLastLinesTokens(example, 5), 'g h i');
		assert.strictEqual(tokenizer.takeLastLinesTokens(example, 6), 'g h i');
		assert.strictEqual(tokenizer.takeLastLinesTokens(example, 7), 'd e f\ng h i');
		assert.strictEqual(tokenizer.takeLastLinesTokens(example, 11), example);
		example = 'a b\n\n c d';
		assert.strictEqual(tokenizer.takeLastLinesTokens(example, 2), ' c d');
		assert.strictEqual(tokenizer.takeLastLinesTokens(example, 3), '\n c d');
		assert.strictEqual(tokenizer.takeLastLinesTokens(example, 4), '\n c d');
		assert.strictEqual(tokenizer.takeLastLinesTokens(example, 5), 'a b\n\n c d');
	});

	test('takeFirstTokens return corresponding text and tokens', function () {
		let prefix = tokenizer.takeFirstTokens(source, 30);
		assert.strictEqual(prefix.text, tokenizer.detokenize(prefix.tokens));
		prefix = tokenizer.takeFirstTokens(source, 0);
		assert.strictEqual(prefix.text, tokenizer.detokenize(prefix.tokens));
		prefix = tokenizer.takeFirstTokens('', 30);
		assert.strictEqual(prefix.text, tokenizer.detokenize(prefix.tokens));
		prefix = tokenizer.takeFirstTokens('', 0);
		assert.strictEqual(prefix.text, tokenizer.detokenize(prefix.tokens));
	});

	test('takeFirstTokens invariant of ending position', function () {
		const prefix = tokenizer.takeFirstTokens(source, 29).text;
		const expected = `"""
This is an example Python source file to use as test data.  It's pulled from the synth repo
with minor edits to make it`;
		assert.strictEqual(prefix, expected);
		assert.strictEqual(tokenizer.tokenLength(prefix), 29);
		assert.strictEqual(prefix, tokenizer.takeFirstTokens(source.substring(0, 150), 29).text);
		assert.strictEqual(prefix, tokenizer.takeFirstTokens(source.substring(0, 200), 29).text);
	});

	test('takeFirstTokens returns the desired number of tokens', function () {
		assert.strictEqual(tokenizer.tokenLength(tokenizer.takeFirstTokens(source, 30).text), 30);
		assert.strictEqual(tokenizer.tokenLength(tokenizer.takeFirstTokens(source, 29).text), 29);
		assert.strictEqual(tokenizer.tokenLength(tokenizer.takeFirstTokens(source, 28).text), 28);
		assert.strictEqual(tokenizer.tokenLength(tokenizer.takeFirstTokens(source, 5).text), 5);
		assert.strictEqual(tokenizer.tokenLength(tokenizer.takeFirstTokens(source, 0).text), 0);
		assert.strictEqual(tokenizer.tokenLength(tokenizer.takeFirstTokens(source, 1).text), 1);
		assert.strictEqual(tokenizer.tokenLength(tokenizer.takeFirstTokens(source, 1000).text), 1000);
		assert.strictEqual(tokenizer.takeFirstTokens(source, 100000).text, source);
		assert.strictEqual(tokenizer.tokenLength(tokenizer.takeFirstTokens('\n\n\n', 1).text), 1);
	});

	test('takeFirstTokens returns a prefix of the sought length', function () {
		function check(n: number): void {
			const prefix = tokenizer.takeFirstTokens(source, n).text;
			assert.strictEqual(tokenizer.tokenLength(prefix), n);
			assert.strictEqual(prefix, source.substring(0, prefix.length));
		}
		check(0);
		check(1);
		check(5);
		check(29);
		check(30);
		check(100);
		check(1000);
		assert.strictEqual(tokenizer.takeFirstTokens(source, 100000).text, source);
	});

	/**
	 * Long sequences of spaces are tokenized as a sequence of 16-space tokens.  This tests that
	 * the logic in takeFirstTokens correctly handles very long tokens.
	 */
	test('takeFirstTokens handles very long tokens', function () {
		this.timeout(15000);
		const longestSpaceToken = ' '.repeat(4000);
		const tokens = tokenizer.takeFirstTokens(longestSpaceToken, 30);
		assert.strictEqual(tokenizer.tokenLength(tokens.text), 30);
	});
});

suite('Tokenizer Test Suite - o200k', function () {
	const tokenizer = getTokenizer(TokenizerName.o200k);

	test('empty string', function () {
		const str = '';
		assert.deepStrictEqual(tokenizer.tokenize(str), []);
		assert.strictEqual(tokenizer.detokenize(tokenizer.tokenize(str)), str);
	});

	test('space', function () {
		const str = ' ';
		assert.deepStrictEqual(tokenizer.tokenize(str), [220]);
		assert.strictEqual(tokenizer.detokenize(tokenizer.tokenize(str)), str);
	});

	test('tab', function () {
		const str = '\t';
		assert.deepStrictEqual(tokenizer.tokenize(str), [197]);
		assert.strictEqual(tokenizer.detokenize(tokenizer.tokenize(str)), str);
	});

	test('simple text', function () {
		const str = 'This is some text';
		assert.strictEqual(tokenizer.detokenize(tokenizer.tokenize(str)), str);
		assert.deepStrictEqual(tokenizer.tokenize(str), [2500, 382, 1236, 2201]);
	});

	test('multi-token word', function () {
		const str = 'indivisible';
		assert.deepStrictEqual(tokenizer.tokenize(str), [521, 349, 181386]);
		assert.strictEqual(tokenizer.detokenize(tokenizer.tokenize(str)), str);
	});

	test('emojis', function () {
		const str = 'hello 👋 world 🌍';
		assert.deepStrictEqual(tokenizer.tokenize(str), [24912, 61138, 233, 2375, 130321, 235]);
		assert.strictEqual(tokenizer.detokenize(tokenizer.tokenize(str)), str);
	});

	test('contractions', function () {
		const str = `you'll`;
		assert.deepStrictEqual(tokenizer.tokenize(str), [13320, 6090]);
		assert.strictEqual(tokenizer.detokenize(tokenizer.tokenize(str)), str);
	});

	test('assert that consecutive newline is never tokenized as multiple newlines', function () {
		// This is due to a regular expression change in the tokenizer.

		// Loop through all possible ascii numbers and letters
		for (let i = 0; i < 128; i++) {
			const char = String.fromCharCode(i);
			if (char !== '\n') {
				assert.deepStrictEqual(tokenizer.tokenLength(`\n\n${char}`), 2);
			}
		}

		// Test special characters
		assert.deepStrictEqual(tokenizer.tokenize('\n\n👋'), [279, 28823, 233]);
		assert.deepStrictEqual(tokenizer.tokenize('\n\n '), [279, 220]);
		assert.deepStrictEqual(tokenizer.tokenize('\n\n 👋'), [279, 61138, 233]);
		assert.deepStrictEqual(tokenizer.tokenize('\n\n\t'), [279, 197]);
		assert.deepStrictEqual(tokenizer.tokenize('\n\n\r'), [279, 201]);

		// New lines are treated specially tho
		for (let i = 1; i < 10; i++) {
			assert.deepStrictEqual(tokenizer.tokenLength('\n'.repeat(i)), 1);
		}
	});

	test('tokenizeStrings', function () {
		const tokens_s = tokenizer.tokenizeStrings(source);
		assert.strictEqual(tokens_s.join(''), source, 'tokenizeStrings does not join to form the input string');
		const tokens = tokenizer.tokenize(source);
		assert.strictEqual(tokens_s.length, tokens.length, 'tokenizeStrings should have same length as tokenize');
		const half = Math.floor(tokens_s.length / 2);
		assert.strictEqual(
			tokens_s.slice(0, half).join(''),
			tokenizer.detokenize(tokens.slice(0, half)),
			'tokenizeStrings slice should represent the corresponding slice with tokenize'
		);
	});

	test('takeLastTokens invariant of starting position', function () {
		const suffix = tokenizer.takeLastTokens(source, 25);
		assert.strictEqual(
			suffix.text,
			`To the import {imp.module} as {imp.as_name}, we add the following comment: {description}")\n        return description`
		);
		assert.strictEqual(suffix.tokens.length, 25);
		assert.strictEqual(suffix.text, tokenizer.takeLastTokens(source.substring(50), 25).text);
		assert.strictEqual(suffix.text, tokenizer.takeLastTokens(source.substring(100), 25).text);
		assert.strictEqual(suffix.text, tokenizer.takeLastTokens(source.substring(150), 25).text);
		assert.strictEqual(suffix.text, tokenizer.takeLastTokens(source.substring(200), 25).text);
	});

	test('takeLastTokens returns the desired number of tokens', function () {
		assert.strictEqual(tokenizer.takeLastTokens(source, 30).tokens.length, 30);
		assert.strictEqual(tokenizer.takeLastTokens(source, 29).tokens.length, 29);
		assert.strictEqual(tokenizer.takeLastTokens(source, 28).tokens.length, 28);
		assert.strictEqual(tokenizer.takeLastTokens(source, 5).tokens.length, 5);
		assert.strictEqual(tokenizer.takeLastTokens(source, 0).tokens.length, 0);
		assert.strictEqual(tokenizer.takeLastTokens(source, 1).tokens.length, 1);
		assert.strictEqual(tokenizer.takeLastTokens(source, 1000).tokens.length, 1000);
		assert.strictEqual(tokenizer.takeLastTokens(source, 100000).text, source);
		assert.strictEqual(tokenizer.takeLastTokens('\n\n\n', 1).tokens.length, 1);
	});

	test('takeLastTokens returns a suffix of the sought length', function () {
		function check(n: number): void {
			const { text: suffix } = tokenizer.takeLastTokens(source, n);
			assert.strictEqual(tokenizer.tokenLength(suffix), n);
			assert.strictEqual(suffix, source.substring(source.length - suffix.length));
		}
		check(0);
		check(1);
		check(5);
		check(29);
		check(30);
		check(100);
		check(1000);
		assert.strictEqual(tokenizer.takeLastTokens(source, 100000).text, source);
	});

	test('test takeLastLinesTokens', function () {
		let example = 'a b c\nd e f\ng h i';
		assert.strictEqual(tokenizer.takeLastLinesTokens(example, 3), 'g h i');
		assert.strictEqual(tokenizer.takeLastLinesTokens(example, 4), 'g h i');
		assert.strictEqual(tokenizer.takeLastLinesTokens(example, 5), 'g h i');
		assert.strictEqual(tokenizer.takeLastLinesTokens(example, 6), 'g h i');
		assert.strictEqual(tokenizer.takeLastLinesTokens(example, 7), 'd e f\ng h i');
		assert.strictEqual(tokenizer.takeLastLinesTokens(example, 11), example);
		example = 'a b\n\n c d';
		assert.strictEqual(tokenizer.takeLastLinesTokens(example, 2), ' c d');
		assert.strictEqual(tokenizer.takeLastLinesTokens(example, 3), '\n c d');
		assert.strictEqual(tokenizer.takeLastLinesTokens(example, 4), '\n c d');
		assert.strictEqual(tokenizer.takeLastLinesTokens(example, 5), 'a b\n\n c d');
	});

	test('takeFirstTokens return corresponding text and tokens', function () {
		let prefix = tokenizer.takeFirstTokens(source, 30);
		assert.strictEqual(prefix.text, tokenizer.detokenize(prefix.tokens));
		prefix = tokenizer.takeFirstTokens(source, 0);
		assert.strictEqual(prefix.text, tokenizer.detokenize(prefix.tokens));
		prefix = tokenizer.takeFirstTokens('', 30);
		assert.strictEqual(prefix.text, tokenizer.detokenize(prefix.tokens));
		prefix = tokenizer.takeFirstTokens('', 0);
		assert.strictEqual(prefix.text, tokenizer.detokenize(prefix.tokens));
	});

	test('takeFirstTokens invariant of ending position', function () {
		const prefix = tokenizer.takeFirstTokens(source, 29).text;
		const expected = `"""
This is an example Python source file to use as test data.  It's pulled from the synth repo
with minor edits to make it a`;
		assert.strictEqual(prefix, expected);
		assert.strictEqual(tokenizer.tokenLength(prefix), 29);
		assert.strictEqual(prefix, tokenizer.takeFirstTokens(source.substring(0, 150), 29).text);
		assert.strictEqual(prefix, tokenizer.takeFirstTokens(source.substring(0, 200), 29).text);
	});

	test('takeFirstTokens returns the desired number of tokens', function () {
		assert.strictEqual(tokenizer.tokenLength(tokenizer.takeFirstTokens(source, 30).text), 30);
		assert.strictEqual(tokenizer.tokenLength(tokenizer.takeFirstTokens(source, 29).text), 29);
		assert.strictEqual(tokenizer.tokenLength(tokenizer.takeFirstTokens(source, 28).text), 28);
		assert.strictEqual(tokenizer.tokenLength(tokenizer.takeFirstTokens(source, 5).text), 5);
		assert.strictEqual(tokenizer.tokenLength(tokenizer.takeFirstTokens(source, 0).text), 0);
		assert.strictEqual(tokenizer.tokenLength(tokenizer.takeFirstTokens(source, 1).text), 1);
		assert.strictEqual(tokenizer.tokenLength(tokenizer.takeFirstTokens(source, 1000).text), 1000);
		assert.strictEqual(tokenizer.takeFirstTokens(source, 100000).text, source);
		assert.strictEqual(tokenizer.tokenLength(tokenizer.takeFirstTokens('\n\n\n', 1).text), 1);
	});

	test('takeFirstTokens returns a prefix of the sought length', function () {
		function check(n: number): void {
			const prefix = tokenizer.takeFirstTokens(source, n).text;
			assert.strictEqual(tokenizer.tokenLength(prefix), n);
			assert.strictEqual(prefix, source.substring(0, prefix.length));
		}
		check(0);
		check(1);
		check(5);
		check(29);
		check(30);
		check(100);
		check(1000);
		assert.strictEqual(tokenizer.takeFirstTokens(source, 100000).text, source);
	});

	/**
	 * Long sequences of spaces are tokenized as a sequence of 16-space tokens.  This tests that
	 * the logic in takeFirstTokens correctly handles very long tokens.
	 */
	test('takeFirstTokens handles very long tokens', function () {
		this.timeout(15000);
		const longestSpaceToken = ' '.repeat(4000);
		const tokens = tokenizer.takeFirstTokens(longestSpaceToken, 30);
		assert.strictEqual(tokenizer.tokenLength(tokens.text), 30);
	});
});

suite('ApproximateTokenizer', function () {
	const cl100kTokenizer = new ApproximateTokenizer(TokenizerName.cl100k, 'python');
	const o200kTokenizer = new ApproximateTokenizer(TokenizerName.o200k, 'python');
	const defaultTokenizer = new ApproximateTokenizer(); // o200k, no language;

	suite('tokenizeStrings', function () {
		test('should split text into chunks of 4 characters', function () {
			const result = defaultTokenizer.tokenizeStrings('abcdefgh');
			assert.deepStrictEqual(result, ['abcd', 'efgh']);
		});

		test('should handle text not divisible by 4', function () {
			const result = defaultTokenizer.tokenizeStrings('abcdefg');
			assert.deepStrictEqual(result, ['abcd', 'efg']);
		});

		test('should handle empty string', function () {
			const result = defaultTokenizer.tokenizeStrings('');
			assert.deepStrictEqual(result, []);
		});

		test('should handle single character', function () {
			const result = defaultTokenizer.tokenizeStrings('a');
			assert.deepStrictEqual(result, ['a']);
		});
	});

	suite('tokenize', function () {
		test('should convert string chunks to numeric tokens', function () {
			const result = defaultTokenizer.tokenize('ab');
			assert.ok(Array.isArray(result));
			assert.strictEqual(result.length, 1);
			assert.strictEqual(typeof result[0], 'number');
		});

		test('should produce consistent tokens for same input', function () {
			const result1 = defaultTokenizer.tokenize('test');
			const result2 = defaultTokenizer.tokenize('test');
			assert.deepStrictEqual(result1, result2);
		});
	});

	suite('detokenize', function () {
		test('should convert tokens back to string', function () {
			const original = 'test';
			const tokens = defaultTokenizer.tokenize(original);
			const result = defaultTokenizer.detokenize(tokens);
			assert.strictEqual(result, original);
		});

		test('should handle empty token array', function () {
			const result = defaultTokenizer.detokenize([]);
			assert.strictEqual(result, '');
		});
	});

	test('tokenLength', function () {
		assert.strictEqual(cl100kTokenizer.tokenLength('a b c'), 2);
	});

	test('tokenLength with language take approximated char chunks', function () {
		assert.strictEqual(cl100kTokenizer.tokenLength('abc def gh'), 3);
	});

	test('tokenLength with no language take 4 char chunks', function () {
		const str = 'w'.repeat(400);
		assert.strictEqual(cl100kTokenizer.tokenLength(str), 101);
		assert.strictEqual(defaultTokenizer.tokenLength(str), 100);
	});

	test('tokenLength approximated char chunks are correct for each approximated tokenizer', function () {
		const str = 'w'.repeat(400);
		assert.strictEqual(cl100kTokenizer.tokenLength(str), 101);
		assert.strictEqual(o200kTokenizer.tokenLength(str), 99);
	});

	test('takeFirstTokens', function () {
		const first2Tokens = cl100kTokenizer.takeFirstTokens('123 456 7890', 2);
		assert.deepStrictEqual(first2Tokens, {
			text: '123 456',
			tokens: [0, 1],
		});
		assert.deepStrictEqual(cl100kTokenizer.tokenLength(first2Tokens.text), 2);
	});

	test('takeFirstTokens returns the full string if shorter', function () {
		const first100Tokens = cl100kTokenizer.takeFirstTokens('123 456 7890', 100);
		assert.deepStrictEqual(first100Tokens, {
			text: '123 456 7890',
			tokens: [0, 1, 2, 3],
		});
		assert.deepStrictEqual(cl100kTokenizer.tokenLength(first100Tokens.text), 4);
	});

	test('takeLastTokens', function () {
		const last2Tokens = cl100kTokenizer.takeLastTokens('123 456 7890', 2);
		assert.deepStrictEqual(last2Tokens, {
			text: '56 7890',
			tokens: [0, 1],
		});
		assert.deepStrictEqual(cl100kTokenizer.tokenLength(last2Tokens.text), 2);
	});

	test('takeLastTokens returns the full string if shorter', function () {
		const last100Tokens = cl100kTokenizer.takeLastTokens('123 456 7890', 100);
		assert.deepStrictEqual(last100Tokens, {
			text: '123 456 7890',
			tokens: [0, 1, 2, 3],
		});
		assert.deepStrictEqual(cl100kTokenizer.tokenLength(last100Tokens.text), 4);
	});

	suite('takeLastLinesTokens', function () {
		test('should return complete lines from suffix', function () {
			const text = 'line1\nline2\nline3\nline4';
			const result = cl100kTokenizer.takeLastLinesTokens(text, 4);
			assert.strictEqual(result, 'line3\nline4');
		});

		test('should handle text already within token limit', function () {
			const text = 'short\ntext';
			const result = cl100kTokenizer.takeLastLinesTokens(text, 100);
			assert.strictEqual(result, text);
		});

		test('should handle text ending with newline', function () {
			const text = 'line1\nline2\n';
			const result = cl100kTokenizer.takeLastLinesTokens(text, 10);
			assert.strictEqual(typeof result, 'string');
		});
	});
});
