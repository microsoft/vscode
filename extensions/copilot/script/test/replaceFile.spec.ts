/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, expect, suite, test } from 'vitest';
import { copyFileReplacing, writeFileReplacing } from '../build/replaceFile';

suite('replaceFile', () => {
	let dir: string;

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-replace-file-'));
		fs.mkdirSync(path.join(dir, 'pkg'));
		fs.writeFileSync(path.join(dir, 'store'), 'store content');
		// node_modules/pkg/file as pnpm creates it: a hard link to the file in the store
		fs.linkSync(path.join(dir, 'store'), path.join(dir, 'pkg', 'file'));
		fs.writeFileSync(path.join(dir, 'source'), 'copied content');
	});

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	function snapshot() {
		return {
			store: fs.readFileSync(path.join(dir, 'store'), 'utf8'),
			storeLinks: fs.statSync(path.join(dir, 'store')).nlink,
			file: fs.readFileSync(path.join(dir, 'pkg', 'file'), 'utf8'),
			files: fs.readdirSync(path.join(dir, 'pkg')),
		};
	}

	test('writeFileReplacing leaves a hard-linked original unchanged', async () => {
		await writeFileReplacing(path.join(dir, 'pkg', 'file'), 'new content');
		expect(snapshot()).toEqual({ store: 'store content', storeLinks: 1, file: 'new content', files: ['file'] });
	});

	test('writeFileReplacing creates a missing file', async () => {
		await writeFileReplacing(path.join(dir, 'pkg', 'other'), 'new content');
		expect(fs.readFileSync(path.join(dir, 'pkg', 'other'), 'utf8')).toBe('new content');
	});

	test('copyFileReplacing leaves a hard-linked original unchanged', async () => {
		await copyFileReplacing(path.join(dir, 'source'), path.join(dir, 'pkg', 'file'));
		expect(snapshot()).toEqual({ store: 'store content', storeLinks: 1, file: 'copied content', files: ['file'] });
	});

	test('copyFileReplacing creates a missing file', async () => {
		await copyFileReplacing(path.join(dir, 'source'), path.join(dir, 'pkg', 'other'));
		expect(fs.readFileSync(path.join(dir, 'pkg', 'other'), 'utf8')).toBe('copied content');
	});
});
