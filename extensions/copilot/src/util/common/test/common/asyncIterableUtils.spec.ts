/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { AsyncIterUtils, AsyncIterUtilsExt } from '../../asyncIterableUtils';

describe('AsyncIterableUtils', () => {

	describe('map', () => {
		it('should map items using the provided function', async () => {
			const input = AsyncIterUtils.fromArray([1, 2, 3]);
			const mapped = AsyncIterUtils.map(input, x => x * 2);
			const result = await AsyncIterUtils.toArray(mapped);
			expect(result).toEqual([2, 4, 6]);
		});

		it('should handle empty iterable', async () => {
			const input = AsyncIterUtils.fromArray<number>([]);
			const mapped = AsyncIterUtils.map(input, x => x * 2);
			const result = await AsyncIterUtils.toArray(mapped);
			expect(result).toEqual([]);
		});

		it('should transform item types', async () => {
			const input = AsyncIterUtils.fromArray([1, 2, 3]);
			const mapped = AsyncIterUtils.map(input, x => x.toString());
			const result = await AsyncIterUtils.toArray(mapped);
			expect(result).toEqual(['1', '2', '3']);
		});
	});

	describe('mapWithReturn', () => {
		it('should map items and return value', async () => {
			const input = AsyncIterUtils.fromArrayWithReturn([1, 2, 3], 'done');
			const mapped = AsyncIterUtils.mapWithReturn(
				input,
				x => x * 2,
				ret => ret.toUpperCase()
			);
			const [items, returnValue] = await AsyncIterUtils.toArrayWithReturn(mapped);
			expect(items).toEqual([2, 4, 6]);
			expect(returnValue).toBe('DONE');
		});

		it('should handle empty iterable with return value', async () => {
			const input = AsyncIterUtils.fromArrayWithReturn<number, string>([], 'empty');
			const mapped = AsyncIterUtils.mapWithReturn(
				input,
				x => x * 2,
				ret => ret.toUpperCase()
			);
			const [items, returnValue] = await AsyncIterUtils.toArrayWithReturn(mapped);
			expect(items).toEqual([]);
			expect(returnValue).toBe('EMPTY');
		});
	});

	describe('filter', () => {
		it('should filter items using the provided predicate', async () => {
			const input = AsyncIterUtils.fromArray([1, 2, 3, 4, 5]);
			const filtered = AsyncIterUtils.filter(input, x => x % 2 === 0);
			const result = await AsyncIterUtils.toArray(filtered);
			expect(result).toEqual([2, 4]);
		});

		it('should handle empty iterable', async () => {
			const input = AsyncIterUtils.fromArray<number>([]);
			const filtered = AsyncIterUtils.filter(input, x => x % 2 === 0);
			const result = await AsyncIterUtils.toArray(filtered);
			expect(result).toEqual([]);
		});

		it('should return empty when no items match', async () => {
			const input = AsyncIterUtils.fromArray([1, 3, 5]);
			const filtered = AsyncIterUtils.filter(input, x => x % 2 === 0);
			const result = await AsyncIterUtils.toArray(filtered);
			expect(result).toEqual([]);
		});

		it('should return all items when all match', async () => {
			const input = AsyncIterUtils.fromArray([2, 4, 6]);
			const filtered = AsyncIterUtils.filter(input, x => x % 2 === 0);
			const result = await AsyncIterUtils.toArray(filtered);
			expect(result).toEqual([2, 4, 6]);
		});
	});

	describe('toArray', () => {
		it('should collect all items into an array', async () => {
			const input = AsyncIterUtils.fromArray([1, 2, 3]);
			const result = await AsyncIterUtils.toArray(input);
			expect(result).toEqual([1, 2, 3]);
		});

		it('should return empty array for empty iterable', async () => {
			const input = AsyncIterUtils.fromArray<number>([]);
			const result = await AsyncIterUtils.toArray(input);
			expect(result).toEqual([]);
		});

		it('should preserve item order', async () => {
			const input = AsyncIterUtils.fromArray(['a', 'b', 'c', 'd']);
			const result = await AsyncIterUtils.toArray(input);
			expect(result).toEqual(['a', 'b', 'c', 'd']);
		});
	});

	describe('toArrayWithReturn', () => {
		it('should collect items and capture return value', async () => {
			const input = AsyncIterUtils.fromArrayWithReturn([1, 2, 3], 'finished');
			const [items, returnValue] = await AsyncIterUtils.toArrayWithReturn(input);
			expect(items).toEqual([1, 2, 3]);
			expect(returnValue).toBe('finished');
		});

		it('should handle empty iterable with return value', async () => {
			const input = AsyncIterUtils.fromArrayWithReturn<number, string>([], 'empty result');
			const [items, returnValue] = await AsyncIterUtils.toArrayWithReturn(input);
			expect(items).toEqual([]);
			expect(returnValue).toBe('empty result');
		});

		it('should handle complex return types', async () => {
			const returnObj = { status: 'complete', count: 3 };
			const input = AsyncIterUtils.fromArrayWithReturn([1, 2, 3], returnObj);
			const [items, returnValue] = await AsyncIterUtils.toArrayWithReturn(input);
			expect(items).toEqual([1, 2, 3]);
			expect(returnValue).toBe(returnObj);
		});
	});
});

describe('AsyncIterUtilsExt', () => {

	describe('splitLines', () => {

		async function chunksToLines(chunks: string[]) {
			const iter = AsyncIterUtils.fromArray(chunks);
			const linesStream = AsyncIterUtilsExt.splitLines(iter);
			const lines = await AsyncIterUtils.toArray(linesStream);
			return lines;
		}

		describe('empty and minimal inputs', () => {
			it('handles empty stream', async () => {
				const arr = await chunksToLines([]);
				expect(arr).toEqual([]);
			});

			it('handles single empty chunk', async () => {
				const arr = await chunksToLines(['']);
				expect(arr).toEqual(['']);
			});

			it('handles multiple empty chunks', async () => {
				const arr = await chunksToLines(['', '', '']);
				expect(arr).toEqual(['']);
			});
		});

		describe('single chunk inputs', () => {
			it('handles single line without newline', async () => {
				const arr = await chunksToLines(['hello']);
				expect(arr).toEqual(['hello']);
			});

			it('handles single line with trailing newline', async () => {
				const arr = await chunksToLines(['hello\n']);
				expect(arr).toEqual(['hello', '']);
			});

			it('handles multiple lines in single chunk', async () => {
				const arr = await chunksToLines(['line1\nline2\nline3']);
				expect(arr).toEqual(['line1', 'line2', 'line3']);
			});

			it('handles multiple lines with trailing newline', async () => {
				const arr = await chunksToLines(['line1\nline2\nline3\n']);
				expect(arr).toEqual(['line1', 'line2', 'line3', '']);
			});
		});

		describe('multiple chunks', () => {
			it('handles each line as separate chunk', async () => {
				const arr = await chunksToLines(['line1\n', 'line2\n', 'line3']);
				expect(arr).toEqual(['line1', 'line2', 'line3']);
			});

			it('handles line split across two chunks', async () => {
				const arr = await chunksToLines(['hel', 'lo']);
				expect(arr).toEqual(['hello']);
			});

			it('handles line split across multiple chunks', async () => {
				const arr = await chunksToLines(['h', 'e', 'l', 'l', 'o']);
				expect(arr).toEqual(['hello']);
			});

			it('handles newline split between chunks', async () => {
				const arr = await chunksToLines(['line1', '\nline2']);
				expect(arr).toEqual(['line1', 'line2']);
			});

			it('handles complex split across chunks', async () => {
				const arr = await chunksToLines(['li', 'ne1\nli', 'ne2\n', 'line3']);
				expect(arr).toEqual(['line1', 'line2', 'line3']);
			});
		});

		describe('line endings', () => {
			it('handles Windows-style line endings (CRLF)', async () => {
				const arr = await chunksToLines(['line1\r\nline2\r\nline3']);
				expect(arr).toEqual(['line1', 'line2', 'line3']);
			});

			it('handles Windows-style line endings with trailing CRLF', async () => {
				const arr = await chunksToLines(['line1\r\nline2\r\n']);
				expect(arr).toEqual(['line1', 'line2', '']);
			});

			it('handles mixed line endings', async () => {
				const arr = await chunksToLines(['line1\nline2\r\nline3']);
				expect(arr).toEqual(['line1', 'line2', 'line3']);
			});

			it('handles CRLF split across chunks', async () => {
				const arr = await chunksToLines(['line1\r', '\nline2']);
				expect(arr).toEqual(['line1', 'line2']);
			});
		});

		describe('empty lines', () => {
			it('handles single empty line', async () => {
				const arr = await chunksToLines(['\n']);
				expect(arr).toEqual(['', '']);
			});

			it('handles multiple consecutive empty lines', async () => {
				const arr = await chunksToLines(['\n\n\n']);
				expect(arr).toEqual(['', '', '', '']);
			});

			it('handles empty lines between content', async () => {
				const arr = await chunksToLines(['line1\n\nline2']);
				expect(arr).toEqual(['line1', '', 'line2']);
			});

			it('handles multiple empty lines between content', async () => {
				const arr = await chunksToLines(['line1\n\n\nline2']);
				expect(arr).toEqual(['line1', '', '', 'line2']);
			});
		});

		describe('edge cases', () => {
			it('handles only newlines in separate chunks', async () => {
				const arr = await chunksToLines(['\n', '\n', '\n']);
				expect(arr).toEqual(['', '', '', '']);
			});

			it('handles chunk that is just a newline after content', async () => {
				const arr = await chunksToLines(['hello', '\n']);
				expect(arr).toEqual(['hello', '']);
			});

			it('handles whitespace-only lines', async () => {
				const arr = await chunksToLines(['  \n\t\n   ']);
				expect(arr).toEqual(['  ', '\t', '   ']);
			});

			it('handles unicode content', async () => {
				const arr = await chunksToLines(['héllo\nwörld\n日本語']);
				expect(arr).toEqual(['héllo', 'wörld', '日本語']);
			});

			it('handles emoji content', async () => {
				const arr = await chunksToLines(['👋\n🌍']);
				expect(arr).toEqual(['👋', '🌍']);
			});

			it('simulates character-by-character streaming', async () => {
				const text = 'ab\ncd';
				const arr = await chunksToLines(text.split(''));
				expect(arr).toEqual(['ab', 'cd']);
			});
		});
	});

});
