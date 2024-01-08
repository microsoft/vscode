/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { MetadataConsts } from 'vs/editor/common/encodedTokenAttributes';
import { LanguageIdCodec } from 'vs/editor/common/services/languagesRegistry';
import { IViewLineTokens, LineTokens } from 'vs/editor/common/tokens/lineTokens';

suite('LineTokens', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	interface ILineToken {
		startIndex: number;
		foreground: number;
	}

	function createLineTokens(text: string, tokens: ILineToken[]): LineTokens {
		const binTokens = new Uint32Array(tokens.length << 1);

		for (let i = 0, len = tokens.length; i < len; i++) {
			binTokens[(i << 1)] = (i + 1 < len ? tokens[i + 1].startIndex : text.length);
			binTokens[(i << 1) + 1] = (
				tokens[i].foreground << MetadataConsts.FOREGROUND_OFFSET
			) >>> 0;
		}

		return new LineTokens(binTokens, text, new LanguageIdCodec());
	}

	function createTestLineTokens(): LineTokens {
		return createLineTokens(
			'Hello world, this is a lovely day',
			[
				{ startIndex: 0, foreground: 1 }, // Hello_
				{ startIndex: 6, foreground: 2 }, // world,_
				{ startIndex: 13, foreground: 3 }, // this_
				{ startIndex: 18, foreground: 4 }, // is_
				{ startIndex: 21, foreground: 5 }, // a_
				{ startIndex: 23, foreground: 6 }, // lovely_
				{ startIndex: 30, foreground: 7 }, // day
			]
		);
	}

	function renderLineTokens(tokens: LineTokens): string {
		let result = '';
		const str = tokens.getLineContent();
		let lastOffset = 0;
		for (let i = 0; i < tokens.getCount(); i++) {
			result += str.substring(lastOffset, tokens.getEndOffset(i));
			result += `(${tokens.getMetadata(i)})`;
			lastOffset = tokens.getEndOffset(i);
		}
		return result;
	}

	test('withInserted 1', () => {
		const lineTokens = createTestLineTokens();
		assert.strictEqual(renderLineTokens(lineTokens), 'Hello (32768)world, (65536)this (98304)is (131072)a (163840)lovely (196608)day(229376)');

		const lineTokens2 = lineTokens.withInserted([
			{ offset: 0, text: '1', tokenMetadata: 0, },
			{ offset: 6, text: '2', tokenMetadata: 0, },
			{ offset: 9, text: '3', tokenMetadata: 0, },
		]);

		assert.strictEqual(renderLineTokens(lineTokens2), '1(0)Hello (32768)2(0)wor(65536)3(0)ld, (65536)this (98304)is (131072)a (163840)lovely (196608)day(229376)');
	});

	test('withInserted (tokens at the same position)', () => {
		const lineTokens = createTestLineTokens();
		assert.strictEqual(renderLineTokens(lineTokens), 'Hello (32768)world, (65536)this (98304)is (131072)a (163840)lovely (196608)day(229376)');

		const lineTokens2 = lineTokens.withInserted([
			{ offset: 0, text: '1', tokenMetadata: 0, },
			{ offset: 0, text: '2', tokenMetadata: 0, },
			{ offset: 0, text: '3', tokenMetadata: 0, },
		]);

		assert.strictEqual(renderLineTokens(lineTokens2), '1(0)2(0)3(0)Hello (32768)world, (65536)this (98304)is (131072)a (163840)lovely (196608)day(229376)');
	});

	test('withInserted (tokens at the end)', () => {
		const lineTokens = createTestLineTokens();
		assert.strictEqual(renderLineTokens(lineTokens), 'Hello (32768)world, (65536)this (98304)is (131072)a (163840)lovely (196608)day(229376)');

		const lineTokens2 = lineTokens.withInserted([
			{ offset: 'Hello world, this is a lovely day'.length - 1, text: '1', tokenMetadata: 0, },
			{ offset: 'Hello world, this is a lovely day'.length, text: '2', tokenMetadata: 0, },
		]);

		assert.strictEqual(renderLineTokens(lineTokens2), 'Hello (32768)world, (65536)this (98304)is (131072)a (163840)lovely (196608)da(229376)1(0)y(229376)2(0)');
	});

	test('basics', () => {
		const lineTokens = createTestLineTokens();

		assert.strictEqual(lineTokens.getLineContent(), 'Hello world, this is a lovely day');
		assert.strictEqual(lineTokens.getLineContent().length, 33);
		assert.strictEqual(lineTokens.getCount(), 7);

		assert.strictEqual(lineTokens.getStartOffset(0), 0);
		assert.strictEqual(lineTokens.getEndOffset(0), 6);
		assert.strictEqual(lineTokens.getStartOffset(1), 6);
		assert.strictEqual(lineTokens.getEndOffset(1), 13);
		assert.strictEqual(lineTokens.getStartOffset(2), 13);
		assert.strictEqual(lineTokens.getEndOffset(2), 18);
		assert.strictEqual(lineTokens.getStartOffset(3), 18);
		assert.strictEqual(lineTokens.getEndOffset(3), 21);
		assert.strictEqual(lineTokens.getStartOffset(4), 21);
		assert.strictEqual(lineTokens.getEndOffset(4), 23);
		assert.strictEqual(lineTokens.getStartOffset(5), 23);
		assert.strictEqual(lineTokens.getEndOffset(5), 30);
		assert.strictEqual(lineTokens.getStartOffset(6), 30);
		assert.strictEqual(lineTokens.getEndOffset(6), 33);
	});

	test('findToken', () => {
		const lineTokens = createTestLineTokens();

		assert.strictEqual(lineTokens.findTokenIndexAtOffset(0), 0);
		assert.strictEqual(lineTokens.findTokenIndexAtOffset(1), 0);
		assert.strictEqual(lineTokens.findTokenIndexAtOffset(2), 0);
		assert.strictEqual(lineTokens.findTokenIndexAtOffset(3), 0);
		assert.strictEqual(lineTokens.findTokenIndexAtOffset(4), 0);
		assert.strictEqual(lineTokens.findTokenIndexAtOffset(5), 0);
		assert.strictEqual(lineTokens.findTokenIndexAtOffset(6), 1);
		assert.strictEqual(lineTokens.findTokenIndexAtOffset(7), 1);
		assert.strictEqual(lineTokens.findTokenIndexAtOffset(8), 1);
		assert.strictEqual(lineTokens.findTokenIndexAtOffset(9), 1);
		assert.strictEqual(lineTokens.findTokenIndexAtOffset(10), 1);
		assert.strictEqual(lineTokens.findTokenIndexAtOffset(11), 1);
		assert.strictEqual(lineTokens.findTokenIndexAtOffset(12), 1);
		assert.strictEqual(lineTokens.findTokenIndexAtOffset(13), 2);
		assert.strictEqual(lineTokens.findTokenIndexAtOffset(14), 2);
		assert.strictEqual(lineTokens.findTokenIndexAtOffset(15), 2);
		assert.strictEqual(lineTokens.findTokenIndexAtOffset(16), 2);
		assert.strictEqual(lineTokens.findTokenIndexAtOffset(17), 2);
		assert.strictEqual(lineTokens.findTokenIndexAtOffset(18), 3);
		assert.strictEqual(lineTokens.findTokenIndexAtOffset(19), 3);
		assert.strictEqual(lineTokens.findTokenIndexAtOffset(20), 3);
		assert.strictEqual(lineTokens.findTokenIndexAtOffset(21), 4);
		assert.strictEqual(lineTokens.findTokenIndexAtOffset(22), 4);
		assert.strictEqual(lineTokens.findTokenIndexAtOffset(23), 5);
		assert.strictEqual(lineTokens.findTokenIndexAtOffset(24), 5);
		assert.strictEqual(lineTokens.findTokenIndexAtOffset(25), 5);
		assert.strictEqual(lineTokens.findTokenIndexAtOffset(26), 5);
		assert.strictEqual(lineTokens.findTokenIndexAtOffset(27), 5);
		assert.strictEqual(lineTokens.findTokenIndexAtOffset(28), 5);
		assert.strictEqual(lineTokens.findTokenIndexAtOffset(29), 5);
		assert.strictEqual(lineTokens.findTokenIndexAtOffset(30), 6);
		assert.strictEqual(lineTokens.findTokenIndexAtOffset(31), 6);
		assert.strictEqual(lineTokens.findTokenIndexAtOffset(32), 6);
		assert.strictEqual(lineTokens.findTokenIndexAtOffset(33), 6);
		assert.strictEqual(lineTokens.findTokenIndexAtOffset(34), 6);
	});

	interface ITestViewLineToken {
		endIndex: number;
		foreground: number;
	}

	function assertViewLineTokens(_actual: IViewLineTokens, expected: ITestViewLineToken[]): void {
		const actual: ITestViewLineToken[] = [];
		for (let i = 0, len = _actual.getCount(); i < len; i++) {
			actual[i] = {
				endIndex: _actual.getEndOffset(i),
				foreground: _actual.getForeground(i)
			};
		}
		assert.deepStrictEqual(actual, expected);
	}

	test('inflate', () => {
		const lineTokens = createTestLineTokens();
		assertViewLineTokens(lineTokens.inflate(), [
			{ endIndex: 6, foreground: 1 },
			{ endIndex: 13, foreground: 2 },
			{ endIndex: 18, foreground: 3 },
			{ endIndex: 21, foreground: 4 },
			{ endIndex: 23, foreground: 5 },
			{ endIndex: 30, foreground: 6 },
			{ endIndex: 33, foreground: 7 },
		]);
	});

	test('sliceAndInflate', () => {
		const lineTokens = createTestLineTokens();
		assertViewLineTokens(lineTokens.sliceAndInflate(0, 33, 0), [
			{ endIndex: 6, foreground: 1 },
			{ endIndex: 13, foreground: 2 },
			{ endIndex: 18, foreground: 3 },
			{ endIndex: 21, foreground: 4 },
			{ endIndex: 23, foreground: 5 },
			{ endIndex: 30, foreground: 6 },
			{ endIndex: 33, foreground: 7 },
		]);

		assertViewLineTokens(lineTokens.sliceAndInflate(0, 32, 0), [
			{ endIndex: 6, foreground: 1 },
			{ endIndex: 13, foreground: 2 },
			{ endIndex: 18, foreground: 3 },
			{ endIndex: 21, foreground: 4 },
			{ endIndex: 23, foreground: 5 },
			{ endIndex: 30, foreground: 6 },
			{ endIndex: 32, foreground: 7 },
		]);

		assertViewLineTokens(lineTokens.sliceAndInflate(0, 30, 0), [
			{ endIndex: 6, foreground: 1 },
			{ endIndex: 13, foreground: 2 },
			{ endIndex: 18, foreground: 3 },
			{ endIndex: 21, foreground: 4 },
			{ endIndex: 23, foreground: 5 },
			{ endIndex: 30, foreground: 6 }
		]);

		assertViewLineTokens(lineTokens.sliceAndInflate(0, 30, 1), [
			{ endIndex: 7, foreground: 1 },
			{ endIndex: 14, foreground: 2 },
			{ endIndex: 19, foreground: 3 },
			{ endIndex: 22, foreground: 4 },
			{ endIndex: 24, foreground: 5 },
			{ endIndex: 31, foreground: 6 }
		]);

		assertViewLineTokens(lineTokens.sliceAndInflate(6, 18, 0), [
			{ endIndex: 7, foreground: 2 },
			{ endIndex: 12, foreground: 3 }
		]);

		assertViewLineTokens(lineTokens.sliceAndInflate(7, 18, 0), [
			{ endIndex: 6, foreground: 2 },
			{ endIndex: 11, foreground: 3 }
		]);

		assertViewLineTokens(lineTokens.sliceAndInflate(6, 17, 0), [
			{ endIndex: 7, foreground: 2 },
			{ endIndex: 11, foreground: 3 }
		]);

		assertViewLineTokens(lineTokens.sliceAndInflate(6, 19, 0), [
			{ endIndex: 7, foreground: 2 },
			{ endIndex: 12, foreground: 3 },
			{ endIndex: 13, foreground: 4 },
		]);
	});
});
