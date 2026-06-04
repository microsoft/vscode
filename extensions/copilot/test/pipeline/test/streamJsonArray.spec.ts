/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { streamJsonArrayElements } from '../streamJsonArray';

describe('streamJsonArrayElements', () => {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stream-json-array-'));
	});

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true, force: true });
	});

	async function collect<T>(contents: string): Promise<T[]> {
		const inputPath = path.join(tmpDir, 'input.json');
		await fs.writeFile(inputPath, contents);
		const result: T[] = [];
		for await (const element of streamJsonArrayElements<T>(inputPath)) {
			result.push(element);
		}
		return result;
	}

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

	test('throws when the input is not a JSON array', async () => {
		await expect(collect('{"a":1}')).rejects.toThrow();
	});
});
