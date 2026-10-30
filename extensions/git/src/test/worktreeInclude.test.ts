/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import { resolveWorktreeIncludePaths, sanitizeWorktreeIncludePatterns } from '../worktreeInclude';

suite('worktreeInclude', () => {
	const nul = (...entries: string[]) => entries.map(entry => `${entry}\x00`).join('');

	test('sanitizeWorktreeIncludePatterns drops patterns containing line breaks', () => {
		assert.deepStrictEqual(sanitizeWorktreeIncludePatterns(['.env', 'a.json\n!x', 'b\r', 'node_modules']), ['.env', 'node_modules']);
	});

	test('resolveWorktreeIncludePaths selects included files, collapses whole directories and skips collisions', () => {
		const ignored = nul(
			'.env',
			'app/.env',
			'node_modules/a/index.js',
			'node_modules/b/index.js',
			'partial/keep.txt',
			'partial/skip.log',
			'mixed/ignored.txt',
			'tracked.txt',
			'dir-in-worktree',
			'file-in-worktree/child.txt',
			'secrets/one.txt'
		);
		const included = nul(
			'.env',
			'app/.env',
			'node_modules/a/index.js',
			'node_modules/b/index.js',
			'partial/keep.txt',
			'mixed/ignored.txt',
			'tracked.txt',
			'dir-in-worktree',
			'file-in-worktree/child.txt'
		);
		const directories = nul('.env', 'app/.env', 'node_modules/', 'partial/', 'mixed/ignored.txt', 'secrets/');
		const worktree = nul('tracked.txt', 'dir-in-worktree/file.txt', 'file-in-worktree', 'mixed/tracked.txt');

		assert.deepStrictEqual({
			all: resolveWorktreeIncludePaths(ignored, included, directories, worktree),
			nestedSymlink: resolveWorktreeIncludePaths(ignored, included, directories, worktree, ['node_modules/a']),
			noDirectories: resolveWorktreeIncludePaths(ignored, included, undefined, ''),
			noIgnored: resolveWorktreeIncludePaths('', included, directories, worktree),
			noIncluded: resolveWorktreeIncludePaths(ignored, '', directories, worktree),
		}, {
			all: [
				'node_modules',
				'.env',
				'app/.env',
				'partial/keep.txt',
				'mixed/ignored.txt'
			],
			nestedSymlink: [
				'.env',
				'app/.env',
				'node_modules/b/index.js',
				'partial/keep.txt',
				'mixed/ignored.txt'
			],
			noDirectories: [
				'.env',
				'app/.env',
				'node_modules/a/index.js',
				'node_modules/b/index.js',
				'partial/keep.txt',
				'mixed/ignored.txt',
				'tracked.txt',
				'dir-in-worktree',
				'file-in-worktree/child.txt'
			],
			noIgnored: [],
			noIncluded: []
		});
	});
});
