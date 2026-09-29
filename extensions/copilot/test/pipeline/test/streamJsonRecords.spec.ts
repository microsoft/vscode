/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { inferJsonRecordFormat, streamJsonRecords } from '../streamJsonRecords';

describe('streamJsonRecords', () => {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stream-json-records-'));
	});

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true, force: true });
	});

	async function collect<T>(contents: string, ext = '.json'): Promise<T[]> {
		const inputPath = path.join(tmpDir, `input${ext}`);
		await fs.writeFile(inputPath, contents);
		const result: T[] = [];
		for await (const element of streamJsonRecords<T>(inputPath)) {
			result.push(element);
		}
		return result;
	}

	test('infers format from the file extension', () => {
		expect(inferJsonRecordFormat('/a/b/input.json')).toBe('array');
		expect(inferJsonRecordFormat('/a/b/input.JSON')).toBe('array');
		expect(inferJsonRecordFormat('/a/b/input.txt')).toBe('array');
		expect(inferJsonRecordFormat('/a/b/input.jsonl')).toBe('jsonl');
		expect(inferJsonRecordFormat('/a/b/input.JSONL')).toBe('jsonl');
		expect(inferJsonRecordFormat('/a/b/input.ndjson')).toBe('jsonl');
	});

	describe('JSON array (.json)', () => {
		test('parses an array of objects, primitives and nested structures', async () => {
			const value = [
				{ a: 1, b: 'two', c: [1, 2, { d: true }] },
				42,
				'a string with ] , { } chars',
				null,
				[1, [2, [3]]],
				{ nested: { deep: { value: 'x] [, {}' } } },
			];
			const result = await collect(JSON.stringify(value, null, 2));
			expect(result).toEqual(value);
		});

		test('handles escaped quotes and special characters inside strings', async () => {
			const value = [
				{ s: 'quote: \" bracket: ] comma: , brace: }' },
				'line\nbreak\ttab\\backslash',
			];
			const result = await collect(JSON.stringify(value));
			expect(result).toEqual(value);
		});

		test('returns nothing for an empty array', async () => {
			expect(await collect('[]')).toEqual([]);
			expect(await collect('   [   ]   ')).toEqual([]);
		});

		test('throws when a .json file does not start with an array', async () => {
			await expect(collect('{"a":1}')).rejects.toThrow();
		});

		test('throws on truncated input (no closing bracket)', async () => {
			await expect(collect('[1, 2, 3')).rejects.toThrow(/not closed|Unexpected end/i);
		});

		test('throws on truncated input mid-element', async () => {
			await expect(collect('[1, 2, {"a":1')).rejects.toThrow(/not closed|Unexpected end/i);
		});

		test('throws on truncated input with unclosed string', async () => {
			await expect(collect('["abc]')).rejects.toThrow(/not closed|Unexpected end/i);
		});

		test('throws on trailing data after the array', async () => {
			await expect(collect('[1, 2, 3]garbage')).rejects.toThrow(/after end of JSON array/i);
		});

		test('throws on extra top-level values', async () => {
			await expect(collect('[1][2]')).rejects.toThrow(/after end of JSON array/i);
		});

		test('throws on missing element between commas', async () => {
			await expect(collect('[1,,2]')).rejects.toThrow(/missing element/i);
		});

		test('throws on trailing comma', async () => {
			await expect(collect('[1, 2,]')).rejects.toThrow(/trailing comma/i);
		});

		test('accepts trailing whitespace after the array', async () => {
			expect(await collect('[1, 2]\n  \t\n')).toEqual([1, 2]);
		});
	});

	describe('JSON Lines (.jsonl)', () => {
		test('parses one object per line', async () => {
			const value = [
				{ a: 1, b: 'two' },
				{ a: 2, b: 'three', nested: { x: [1, 2] } },
				{ a: 3 },
			];
			const result = await collect(value.map(v => JSON.stringify(v)).join('\n'), '.jsonl');
			expect(result).toEqual(value);
		});

		test('handles a trailing newline and blank lines', async () => {
			const value = [{ a: 1 }, { a: 2 }];
			const contents = `${JSON.stringify(value[0])}\n\n${JSON.stringify(value[1])}\n`;
			const result = await collect(contents, '.jsonl');
			expect(result).toEqual(value);
		});

		test('handles CRLF line endings and leading whitespace', async () => {
			const value = [{ a: 1 }, { a: 2 }];
			const contents = `   ${JSON.stringify(value[0])}\r\n${JSON.stringify(value[1])}\r\n`;
			const result = await collect(contents, '.jsonl');
			expect(result).toEqual(value);
		});

		test('parses a single object without a trailing newline', async () => {
			expect(await collect('{"a":1}', '.jsonl')).toEqual([{ a: 1 }]);
		});

		test('handles brackets and commas inside string values', async () => {
			const value = [{ s: 'a [ ] , { } b' }, { s: 'second' }];
			const result = await collect(value.map(v => JSON.stringify(v)).join('\n'), '.ndjson');
			expect(result).toEqual(value);
		});

		test('throws when the last line is truncated mid-object', async () => {
			await expect(collect('{"a":1}\n{"b":2', '.jsonl')).rejects.toThrow();
		});
	});

	test('returns nothing for an empty or whitespace-only file', async () => {
		expect(await collect('')).toEqual([]);
		expect(await collect('   \n  \t ')).toEqual([]);
		expect(await collect('', '.jsonl')).toEqual([]);
		expect(await collect('   \n  \t ', '.jsonl')).toEqual([]);
	});
});
