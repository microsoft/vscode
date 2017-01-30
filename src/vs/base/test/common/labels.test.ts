/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import labels = require('vs/base/common/labels');
import platform = require('vs/base/common/platform');

suite('Labels', () => {
	test('shorten - windows', () => {
		if (!platform.isWindows) {
			assert.ok(true);
			return;
		}

		// nothing to shorten
		assert.deepEqual(labels.shorten(['a']), ['a']);
		assert.deepEqual(labels.shorten(['a', 'b']), ['a', 'b']);
		assert.deepEqual(labels.shorten(['a', 'b', 'c']), ['a', 'b', 'c']);

		// completely different paths
		assert.deepEqual(labels.shorten(['a\\b', 'c\\d', 'e\\f']), ['…\\b', '…\\d', '…\\f']);

		// same beginning
		assert.deepEqual(labels.shorten(['a', 'a\\b']), ['a', '…\\b']);
		assert.deepEqual(labels.shorten(['a\\b', 'a\\b\\c']), ['…\\b', '…\\c']);
		assert.deepEqual(labels.shorten(['a', 'a\\b', 'a\\b\\c']), ['a', '…\\b', '…\\c']);
		assert.deepEqual(labels.shorten(['x:\\a\\b', 'x:\\a\\c']), ['…\\b', '…\\c'], 'TODO: drive letter (or schema) should be preserved');
		assert.deepEqual(labels.shorten(['\\\\a\\b', '\\\\a\\c']), ['…\\b', '…\\c'], 'TODO: root uri should be preserved');

		// same ending
		assert.deepEqual(labels.shorten(['a', 'b\\a']), ['a', 'b\\…']);
		assert.deepEqual(labels.shorten(['a\\b\\c', 'd\\b\\c']), ['a\\…', 'd\\…']);
		assert.deepEqual(labels.shorten(['a\\b\\c\\d', 'f\\b\\c\\d']), ['a\\…', 'f\\…']);
		assert.deepEqual(labels.shorten(['d\\e\\a\\b\\c', 'd\\b\\c']), ['…\\a\\…', 'd\\b\\…']);
		assert.deepEqual(labels.shorten(['a\\b\\c\\d', 'a\\f\\b\\c\\d']), ['a\\b\\…', '…\\f\\…']);
		assert.deepEqual(labels.shorten(['a\\b\\a', 'b\\b\\a']), ['a\\b\\…', 'b\\b\\…']);
		assert.deepEqual(labels.shorten(['d\\f\\a\\b\\c', 'h\\d\\b\\c']), ['…\\a\\…', 'h\\…']);
		assert.deepEqual(labels.shorten(['a\\b\\c', 'x:\\0\\a\\b\\c']), ['a\\b\\c', '…\\0\\…'], 'TODO: drive letter (or schema) should be always preserved');
		assert.deepEqual(labels.shorten(['x:\\a\\b', 'y:\\a\\b']), ['x:\\…', 'y:\\…']);
		assert.deepEqual(labels.shorten(['\\\\x\\b', '\\\\y\\b']), ['…\\x\\…', '…\\y\\…'], 'TODO: \\\\x instead of …\\x');

		// same in the middle
		assert.deepEqual(labels.shorten(['a\\b\\c', 'd\\b\\e']), ['…\\c', '…\\e']);

		// case-sensetive
		assert.deepEqual(labels.shorten(['a\\b\\c', 'd\\b\\C']), ['…\\c', '…\\C']);

		assert.deepEqual(labels.shorten(['a', 'a\\b', 'a\\b\\c', 'd\\b\\c', 'd\\b']), ['a', 'a\\b', 'a\\b\\c', 'd\\b\\c', 'd\\b']);
		assert.deepEqual(labels.shorten(['a', 'a\\b', 'b']), ['a', 'a\\b', 'b']);
		assert.deepEqual(labels.shorten(['', 'a', 'b', 'b\\c', 'a\\c']), ['', 'a', 'b', 'b\\c', 'a\\c']);
		assert.deepEqual(labels.shorten(['src\\vs\\workbench\\parts\\execution\\electron-browser', 'src\\vs\\workbench\\parts\\execution\\electron-browser\\something', 'src\\vs\\workbench\\parts\\terminal\\electron-browser']), ['…\\execution\\electron-browser', '…\\something', '…\\terminal\\…']);
	});

	test('shorten - not windows', () => {
		if (platform.isWindows) {
			assert.ok(true);
			return;
		}

		// nothing to shorten
		assert.deepEqual(labels.shorten(['a']), ['a']);
		assert.deepEqual(labels.shorten(['a', 'b']), ['a', 'b']);
		assert.deepEqual(labels.shorten(['a', 'b', 'c']), ['a', 'b', 'c']);

		// completely different paths
		assert.deepEqual(labels.shorten(['a/b', 'c/d', 'e/f']), ['…/b', '…/d', '…/f']);

		// same beginning
		assert.deepEqual(labels.shorten(['a', 'a/b']), ['a', '…/b']);
		assert.deepEqual(labels.shorten(['a/b', 'a/b/c']), ['…/b', '…/c']);
		assert.deepEqual(labels.shorten(['a', 'a/b', 'a/b/c']), ['a', '…/b', '…/c']);
		assert.deepEqual(labels.shorten(['x:/a/b', 'x:/a/c']), ['…/b', '…/c'], 'TODO: drive letter (or schema) should be preserved');
		assert.deepEqual(labels.shorten(['//a/b', '//a/c']), ['…/b', '…/c'], 'TODO: root uri should be preserved');

		// same ending
		assert.deepEqual(labels.shorten(['a', 'b/a']), ['a', 'b/…']);
		assert.deepEqual(labels.shorten(['a/b/c', 'd/b/c']), ['a/…', 'd/…']);
		assert.deepEqual(labels.shorten(['a/b/c/d', 'f/b/c/d']), ['a/…', 'f/…']);
		assert.deepEqual(labels.shorten(['d/e/a/b/c', 'd/b/c']), ['…/a/…', 'd/b/…']);
		assert.deepEqual(labels.shorten(['a/b/c/d', 'a/f/b/c/d']), ['a/b/…', '…/f/…']);
		assert.deepEqual(labels.shorten(['a/b/a', 'b/b/a']), ['a/b/…', 'b/b/…']);
		assert.deepEqual(labels.shorten(['d/f/a/b/c', 'h/d/b/c']), ['…/a/…', 'h/…']);
		assert.deepEqual(labels.shorten(['a/b/c', 'x:/0/a/b/c']), ['a/b/c', '…/0/…'], 'TODO: drive letter (or schema) should be always preserved');
		assert.deepEqual(labels.shorten(['x:/a/b', 'y:/a/b']), ['x:/…', 'y:/…']);
		assert.deepEqual(labels.shorten(['//x/b', '//y/b']), ['…/x/…', '…/y/…'], 'TODO: //x instead of …/x');

		// same in the middle
		assert.deepEqual(labels.shorten(['a/b/c', 'd/b/e']), ['…/c', '…/e']);

		// case-sensitive
		assert.deepEqual(labels.shorten(['a/b/c', 'd/b/C']), ['…/c', '…/C']);

		assert.deepEqual(labels.shorten(['a', 'a/b', 'a/b/c', 'd/b/c', 'd/b']), ['a', 'a/b', 'a/b/c', 'd/b/c', 'd/b']);
		assert.deepEqual(labels.shorten(['a', 'a/b', 'b']), ['a', 'a/b', 'b']);
		assert.deepEqual(labels.shorten(['', 'a', 'b', 'b/c', 'a/c']), ['', 'a', 'b', 'b/c', 'a/c']);
	});
});