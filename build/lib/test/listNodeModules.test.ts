/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'node:test';
import { listNodeModules } from '../../azure-pipelines/common/listNodeModules.ts';

function write(root: string, relativePath: string, content = ''): void {
	fs.mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true });
	fs.writeFileSync(path.join(root, relativePath), content);
}

suite('listNodeModules', () => {
	let tmp: string;
	let repository: string;

	beforeEach(() => {
		tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'list-node-modules-'));
		repository = path.join(tmp, 'repository');
		write(repository, 'package.json', '{}');
		write(repository, 'node_modules/a/index.js');
		write(repository, 'extensions/e/node_modules/f/index.js');
		write(repository, 'src/vs/app.ts');
		write(repository, 'src/vs/member/package.json', '{}');
		write(repository, 'src/vs/member/node_modules/b/package.json', '{"version":"1.0.0"}');
		write(repository, 'src/vs/other/node_modules/c/index.js');
		write(repository, 'out/node_modules/d/index.js');
	});

	afterEach(() => {
		fs.rmSync(tmp, { recursive: true, force: true });
	});

	test('lists the node_modules of the projects inside the skipped source tree, and no other files of it', () => {
		assert.deepStrictEqual(listNodeModules(repository, ['', 'extensions/e', 'src/vs/member']).sort(), [
			'extensions/e/node_modules/f/index.js',
			'node_modules/a/index.js',
			'src/vs/member/node_modules/b/package.json',
		]);
	});

	test('an archive of the listed files restores the node_modules of a project inside the source tree', { skip: process.platform === 'win32' }, () => {
		write(repository, 'src/vs/member/node_modules/b/cli.js');
		fs.mkdirSync(path.join(repository, 'src/vs/member/node_modules/.bin'));
		fs.symlinkSync('../b/cli.js', path.join(repository, 'src/vs/member/node_modules/.bin/b'));
		const folders = ['', 'extensions/e', 'src/vs/member'];
		const files = listNodeModules(repository, folders);
		fs.writeFileSync(path.join(tmp, 'list.txt'), files.join('\n') + '\n');
		execFileSync('tar', ['-cf', path.join(tmp, 'archive.tar'), '--files-from', path.join(tmp, 'list.txt')], { cwd: repository });

		const restored = path.join(tmp, 'restored');
		write(restored, 'src/vs/member/package.json', '{}');
		execFileSync('tar', ['-xf', path.join(tmp, 'archive.tar')], { cwd: restored });

		assert.deepStrictEqual({
			files: listNodeModules(restored, folders).sort(),
			bin: fs.readlinkSync(path.join(restored, 'src/vs/member/node_modules/.bin/b')),
			version: JSON.parse(fs.readFileSync(path.join(restored, 'src/vs/member/node_modules/b/package.json'), 'utf8')).version,
		}, {
			files: [...files].sort(),
			bin: '../b/cli.js',
			version: '1.0.0',
		});
	});
});
