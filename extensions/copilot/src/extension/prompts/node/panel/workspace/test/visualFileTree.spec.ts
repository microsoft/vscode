/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { suite, test } from 'vitest';
import { FileType } from '../../../../../../platform/filesystem/common/fileTypes';
import { URI } from '../../../../../../util/vs/base/common/uri';
import { FileEntry, visualFileTree } from '../visualFileTree';

function joinLines(...lines: string[]): string {
	return lines.join('\n');
}

function file(name: string): FileEntry {
	return { type: FileType.File, uri: URI.file(`/${name}`), name };
}
function dir(name: string, children: readonly FileEntry[]): FileEntry {
	return { type: FileType.Directory, uri: URI.file(`/${name}`), name, getChildren: async () => children };
}
suite('Truncated file tree', () => {
	test('Empty file tree', async () => {
		const files: FileEntry[] = [];
		assert.deepStrictEqual((await visualFileTree(files, Infinity)).tree, '');
		assert.deepStrictEqual((await visualFileTree(files, 10)).tree, '');
		assert.deepStrictEqual((await visualFileTree(files, 0)).tree, '');
	});

	test('Should print file nodes', async () => {
		const files = [
			file('abc'),
			file('longName'),
		];
		assert.deepStrictEqual((await visualFileTree(files, Infinity)).tree, 'abc\nlongName');
	});

	test('Should truncate file list', async () => {
		const files = [
			file('aa'),
			file('bb'),
			file('cc'),
		];
		assert.deepStrictEqual((await visualFileTree(files, 0)).tree, '');
		assert.deepStrictEqual((await visualFileTree(files, 2)).tree, '');
		assert.deepStrictEqual((await visualFileTree(files, 3)).tree, '...');
		assert.deepStrictEqual((await visualFileTree(files, 4)).tree, '...');
		assert.deepStrictEqual((await visualFileTree(files, 5)).tree, '...');
		assert.deepStrictEqual((await visualFileTree(files, 6)).tree, 'aa\n...');
		assert.deepStrictEqual((await visualFileTree(files, 7)).tree, 'aa\n...');
		assert.deepStrictEqual((await visualFileTree(files, 8)).tree, 'aa\nbb\ncc');
		assert.deepStrictEqual((await visualFileTree(files, Infinity)).tree, 'aa\nbb\ncc');
	});

	test('Should print directories nodes', async () => {
		const files = [
			file('abc'),
			dir('dir', [file('def')]),
		];
		assert.deepStrictEqual((await visualFileTree(files, Infinity)).tree, joinLines(
			'abc',
			'dir/',
			'\tdef',
		));
	});

	test('Should expand breadth first', async () => {
		const files = [
			dir('dir1', [
				dir('dir2', [
					file('file1')
				])
			]),
			dir('dir3', [
				file('file2')
			]),
		];

		// Make sure that dir3 is expanded before dir2
		assert.deepStrictEqual((await visualFileTree(files, 25)).tree, joinLines(
			'dir1/',
			'\tdir2/',
			'dir3/',
			'\tfile2'
		));

		assert.deepStrictEqual((await visualFileTree(files)).tree, joinLines(
			'dir1/',
			'\tdir2/',
			'\t\tfile1',
			'dir3/',
			'\tfile2'
		));
	});

	test('Should expand multi-lists breadth first', async () => {
		const files = [
			file('file1'),
			dir('dir1', [file('file2'), file('file3')]),
			dir('dir2', [file('file4')]),
		];
		assert.deepStrictEqual((await visualFileTree(files, Infinity)).tree, joinLines(
			'file1',
			'dir1/',
			'\tfile2',
			'\tfile3',
			'dir2/',
			'\tfile4',
		));

		for (let i = 9; i < 15; ++i) {
			assert.deepStrictEqual((await visualFileTree(files, i)).tree, joinLines(
				'file1',
				'...',
			));
		}

		for (let i = 15; i < 18; ++i) {
			assert.deepStrictEqual((await visualFileTree(files, 15)).tree, joinLines(
				'file1',
				'dir1/',
				'...'
			));
		}

		for (let i = 18; i < 22; ++i) {
			assert.deepStrictEqual((await visualFileTree(files, i)).tree, joinLines(
				'file1',
				'dir1/',
				'dir2/',
			));
		}

		for (let i = 22; i < 27; ++i) {
			assert.deepStrictEqual((await visualFileTree(files, i)).tree, joinLines(
				'file1',
				'dir1/',
				'\t...',
				'dir2/'
			));
		}

		for (let i = 27; i < 29; ++i) {
			assert.deepStrictEqual((await visualFileTree(files, i)).tree, joinLines(
				'file1',
				'dir1/',
				'\t...',
				'dir2/',
				'\t...',
			));
		}

		for (let i = 29; i < 31; ++i) {
			assert.deepStrictEqual((await visualFileTree(files, i)).tree, joinLines(
				'file1',
				'dir1/',
				'\tfile2',
				'\t...',
				'dir2/',
			));
		}
	});
});
