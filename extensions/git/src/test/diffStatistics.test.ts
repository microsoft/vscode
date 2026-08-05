/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { Uri } from 'vscode';
import { countFileLines } from '../repository';

suite('diffStatistics', () => {
	let tempDir: string;

	setup(async () => {
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vscode-git-diff-statistics-'));
	});

	teardown(async () => {
		await fs.rm(tempDir, { recursive: true, force: true });
	});

	test('countFileLines', async () => {
		const write = async (name: string, contents: Buffer | string): Promise<Uri> => {
			const filePath = path.join(tempDir, name);
			await fs.writeFile(filePath, contents);
			return Uri.file(filePath);
		};

		const actual = {
			empty: await countFileLines(await write('empty.txt', '')),
			trailingNewLine: await countFileLines(await write('lf.txt', 'a\nb\nc\n')),
			// Git counts a trailing incomplete line as a line
			noTrailingNewLine: await countFileLines(await write('no-eol.txt', 'a\nb\nc')),
			// The carriage return is part of the line content, not a line terminator
			crlf: await countFileLines(await write('crlf.txt', 'a\r\nb\r\n')),
			// Git reports no line statistics for binary files
			binary: await countFileLines(await write('binary.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x0a, 0x1a, 0x0a]))),
			tooLarge: await countFileLines(await write('large.txt', Buffer.alloc(1024 * 1024 + 1, 0x61))),
			missing: await countFileLines(Uri.file(path.join(tempDir, 'does-not-exist.txt'))),
			directory: await countFileLines(Uri.file(tempDir))
		};

		assert.deepStrictEqual(actual, {
			empty: { insertions: 0, deletions: 0 },
			trailingNewLine: { insertions: 3, deletions: 0 },
			noTrailingNewLine: { insertions: 3, deletions: 0 },
			crlf: { insertions: 2, deletions: 0 },
			binary: undefined,
			tooLarge: undefined,
			missing: undefined,
			directory: undefined
		});
	});
});
