/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'mocha';
import { GitStatusParser, GitDiffStatusParser } from '../git';
import * as assert from 'assert';

suite('git', () => {
	suite('GitDiffStatusParser', function () {
		test('empty parser', function () {
			const parser = new GitDiffStatusParser();
			assert.deepEqual(parser.status, []);
		});

		test('empty parser 2', () => {
			const parser = new GitDiffStatusParser();
			parser.update('');
			assert.deepEqual(parser.status, []);
		});

		test('simple', () => {
			const parser = new GitDiffStatusParser();
			parser.update('M\0file.txt\0');
			assert.deepEqual(parser.status, [
				{ path: 'file.txt', rename: undefined, x: 'M', y: '' }
			]);
		});

		test('simple 2', () => {
			const parser = new GitDiffStatusParser();
			parser.update('M\0file.txt\0');
			parser.update('M\0file2.txt\0');
			parser.update('M\0file3.txt\0');
			assert.deepEqual(parser.status, [
				{ path: 'file.txt', rename: undefined, x: 'M', y: '' },
				{ path: 'file2.txt', rename: undefined, x: 'M', y: '' },
				{ path: 'file3.txt', rename: undefined, x: 'M', y: '' }
			]);
		});

		test('empty lines', () => {
			const parser = new GitDiffStatusParser();
			parser.update('');
			parser.update('M\0file.txt\0');
			parser.update('');
			parser.update('');
			parser.update('M\0file2.txt\0');
			parser.update('');
			parser.update('M\0file3.txt\0');
			parser.update('');
			assert.deepEqual(parser.status, [
				{ path: 'file.txt', rename: undefined, x: 'M', y: '' },
				{ path: 'file2.txt', rename: undefined, x: 'M', y: '' },
				{ path: 'file3.txt', rename: undefined, x: 'M', y: '' }
			]);
		});

		test('combined', () => {
			const parser = new GitDiffStatusParser();
			parser.update('M\0file.txt\0M\0file2.txt\0M\0file3.txt\0');
			assert.deepEqual(parser.status, [
				{ path: 'file.txt', rename: undefined, x: 'M', y: '' },
				{ path: 'file2.txt', rename: undefined, x: 'M', y: '' },
				{ path: 'file3.txt', rename: undefined, x: 'M', y: '' }
			]);
		});

		test('split 1', () => {
			const parser = new GitDiffStatusParser();
			parser.update('M\0file.txt\0M\0file2');
			parser.update('.txt\0M\0file3.txt\0');
			assert.deepEqual(parser.status, [
				{ path: 'file.txt', rename: undefined, x: 'M', y: '' },
				{ path: 'file2.txt', rename: undefined, x: 'M', y: '' },
				{ path: 'file3.txt', rename: undefined, x: 'M', y: '' }
			]);
		});

		test('split 2', () => {
			const parser = new GitDiffStatusParser();
			parser.update('M\0file.txt');
			parser.update('\0M\0file2.txt\0M\0file3.txt\0');
			assert.deepEqual(parser.status, [
				{ path: 'file.txt', rename: undefined, x: 'M', y: '' },
				{ path: 'file2.txt', rename: undefined, x: 'M', y: '' },
				{ path: 'file3.txt', rename: undefined, x: 'M', y: '' }
			]);
		});

		test('split 3', () => {
			const parser = new GitDiffStatusParser();
			parser.update('M\0file.txt\0M\0file2.txt\0M\0file3.txt');
			parser.update('\0');
			assert.deepEqual(parser.status, [
				{ path: 'file.txt', rename: undefined, x: 'M', y: '' },
				{ path: 'file2.txt', rename: undefined, x: 'M', y: '' },
				{ path: 'file3.txt', rename: undefined, x: 'M', y: '' }
			]);
		});

		test('rename', () => {
			const parser = new GitDiffStatusParser();
			parser.update('R099\0file.txt\0newfile.txt\0M\0file2.txt\0M\0file3.txt\0');
			assert.deepEqual(parser.status, [
				{ path: 'file.txt', rename: 'newfile.txt', x: 'R', y: '' },
				{ path: 'file2.txt', rename: undefined, x: 'M', y: '' },
				{ path: 'file3.txt', rename: undefined, x: 'M', y: '' }
			]);
		});

		test('rename split', () => {
			const parser = new GitDiffStatusParser();
			parser.update('R099\0file.txt\0new');
			parser.update('file.txt\0M\0file2.txt\0M\0file3.txt\0');
			assert.deepEqual(parser.status, [
				{ path: 'file.txt', rename: 'newfile.txt', x: 'R', y: '' },
				{ path: 'file2.txt', rename: undefined, x: 'M', y: '' },
				{ path: 'file3.txt', rename: undefined, x: 'M', y: '' }
			]);
		});

		test('rename split 3', () => {
			const parser = new GitDiffStatusParser();
			parser.update('M\0file2.txt\0R099\0fil');
			parser.update('e.txt\0newfil');
			parser.update('e.txt\0M\0file3.txt\0');
			assert.deepEqual(parser.status, [
				{ path: 'file2.txt', rename: undefined, x: 'M', y: '' },
				{ path: 'file.txt', rename: 'newfile.txt', x: 'R', y: '' },
				{ path: 'file3.txt', rename: undefined, x: 'M', y: '' }
			]);
		});
	});
	suite('GitStatusParser', () => {
		test('empty parser', () => {
			const parser = new GitStatusParser();
			assert.deepEqual(parser.status, []);
		});

		test('empty parser 2', () => {
			const parser = new GitStatusParser();
			parser.update('');
			assert.deepEqual(parser.status, []);
		});

		test('simple', () => {
			const parser = new GitStatusParser();
			parser.update('?? file.txt\0');
			assert.deepEqual(parser.status, [
				{ path: 'file.txt', rename: undefined, x: '?', y: '?' }
			]);
		});

		test('simple 2', () => {
			const parser = new GitStatusParser();
			parser.update('?? file.txt\0');
			parser.update('?? file2.txt\0');
			parser.update('?? file3.txt\0');
			assert.deepEqual(parser.status, [
				{ path: 'file.txt', rename: undefined, x: '?', y: '?' },
				{ path: 'file2.txt', rename: undefined, x: '?', y: '?' },
				{ path: 'file3.txt', rename: undefined, x: '?', y: '?' }
			]);
		});

		test('empty lines', () => {
			const parser = new GitStatusParser();
			parser.update('');
			parser.update('?? file.txt\0');
			parser.update('');
			parser.update('');
			parser.update('?? file2.txt\0');
			parser.update('');
			parser.update('?? file3.txt\0');
			parser.update('');
			assert.deepEqual(parser.status, [
				{ path: 'file.txt', rename: undefined, x: '?', y: '?' },
				{ path: 'file2.txt', rename: undefined, x: '?', y: '?' },
				{ path: 'file3.txt', rename: undefined, x: '?', y: '?' }
			]);
		});

		test('combined', () => {
			const parser = new GitStatusParser();
			parser.update('?? file.txt\0?? file2.txt\0?? file3.txt\0');
			assert.deepEqual(parser.status, [
				{ path: 'file.txt', rename: undefined, x: '?', y: '?' },
				{ path: 'file2.txt', rename: undefined, x: '?', y: '?' },
				{ path: 'file3.txt', rename: undefined, x: '?', y: '?' }
			]);
		});

		test('split 1', () => {
			const parser = new GitStatusParser();
			parser.update('?? file.txt\0?? file2');
			parser.update('.txt\0?? file3.txt\0');
			assert.deepEqual(parser.status, [
				{ path: 'file.txt', rename: undefined, x: '?', y: '?' },
				{ path: 'file2.txt', rename: undefined, x: '?', y: '?' },
				{ path: 'file3.txt', rename: undefined, x: '?', y: '?' }
			]);
		});

		test('split 2', () => {
			const parser = new GitStatusParser();
			parser.update('?? file.txt');
			parser.update('\0?? file2.txt\0?? file3.txt\0');
			assert.deepEqual(parser.status, [
				{ path: 'file.txt', rename: undefined, x: '?', y: '?' },
				{ path: 'file2.txt', rename: undefined, x: '?', y: '?' },
				{ path: 'file3.txt', rename: undefined, x: '?', y: '?' }
			]);
		});

		test('split 3', () => {
			const parser = new GitStatusParser();
			parser.update('?? file.txt\0?? file2.txt\0?? file3.txt');
			parser.update('\0');
			assert.deepEqual(parser.status, [
				{ path: 'file.txt', rename: undefined, x: '?', y: '?' },
				{ path: 'file2.txt', rename: undefined, x: '?', y: '?' },
				{ path: 'file3.txt', rename: undefined, x: '?', y: '?' }
			]);
		});

		test('rename', () => {
			const parser = new GitStatusParser();
			parser.update('R  newfile.txt\0file.txt\0?? file2.txt\0?? file3.txt\0');
			assert.deepEqual(parser.status, [
				{ path: 'file.txt', rename: 'newfile.txt', x: 'R', y: ' ' },
				{ path: 'file2.txt', rename: undefined, x: '?', y: '?' },
				{ path: 'file3.txt', rename: undefined, x: '?', y: '?' }
			]);
		});

		test('rename split', () => {
			const parser = new GitStatusParser();
			parser.update('R  newfile.txt\0fil');
			parser.update('e.txt\0?? file2.txt\0?? file3.txt\0');
			assert.deepEqual(parser.status, [
				{ path: 'file.txt', rename: 'newfile.txt', x: 'R', y: ' ' },
				{ path: 'file2.txt', rename: undefined, x: '?', y: '?' },
				{ path: 'file3.txt', rename: undefined, x: '?', y: '?' }
			]);
		});

		test('rename split 3', () => {
			const parser = new GitStatusParser();
			parser.update('?? file2.txt\0R  new');
			parser.update('file.txt\0fil');
			parser.update('e.txt\0?? file3.txt\0');
			assert.deepEqual(parser.status, [
				{ path: 'file2.txt', rename: undefined, x: '?', y: '?' },
				{ path: 'file.txt', rename: 'newfile.txt', x: 'R', y: ' ' },
				{ path: 'file3.txt', rename: undefined, x: '?', y: '?' }
			]);
		});
	});
});