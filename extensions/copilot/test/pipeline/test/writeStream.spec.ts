/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { openWriteStream } from '../writeStream';

describe('openWriteStream', () => {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'write-stream-'));
	});

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true, force: true });
	});

	test('writes data incrementally and produces the concatenated content', async () => {
		const filePath = path.join(tmpDir, 'out.txt');
		const writer = openWriteStream(filePath);
		await writer.write('hello ');
		await writer.write('world');
		await writer.write('!');
		await writer.close();

		expect(await fs.readFile(filePath, 'utf8')).toBe('hello world!');
	});

	test('close is idempotent', async () => {
		const filePath = path.join(tmpDir, 'idempotent.txt');
		const writer = openWriteStream(filePath);
		await writer.write('ok');
		await writer.close();
		await writer.close();
		expect(await fs.readFile(filePath, 'utf8')).toBe('ok');
	});

	test('does not raise uncaughtException when the file system rejects the write', async () => {
		// Writing to a directory path that does not exist surfaces as an async
		// `'error'` event on the stream. Without our `'error'` listener this would
		// terminate the process; we expect the write or close to reject instead.
		const missingDir = path.join(tmpDir, 'does-not-exist', 'out.txt');
		const writer = openWriteStream(missingDir);

		let caught: Error | undefined;
		try {
			await writer.write('data');
			await writer.close();
		} catch (err) {
			caught = err as Error;
		}

		expect(caught).toBeDefined();
		expect(caught!.message).toMatch(/ENOENT|no such file/i);
	});
});
