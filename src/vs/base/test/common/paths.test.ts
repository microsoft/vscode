/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import paths = require('vs/base/common/paths');
import uri from 'vs/base/common/uri';
import platform = require('vs/base/common/platform');

suite('Paths', () => {
	test('relative', () => {
		assert.equal(paths.relative('/test/api/files/test', '/test/api/files/lib/foo'), '../lib/foo');
		assert.equal(paths.relative('far/boo', 'boo/far'), '../../boo/far');
		assert.equal(paths.relative('far/boo', 'far/boo'), '');
	});

	test('dirname', () => {
		assert.equal(paths.dirname('foo/bar'), 'foo');
		assert.equal(paths.dirname('foo\\bar'), 'foo');
		assert.equal(paths.dirname('/foo/bar'), '/foo');
		assert.equal(paths.dirname('\\foo\\bar'), '\\foo');
		assert.equal(paths.dirname('/foo'), '/');
		assert.equal(paths.dirname('\\foo'), '\\');
		assert.equal(paths.dirname('/'), '/');
		assert.equal(paths.dirname('\\'), '\\');
		assert.equal(paths.dirname('foo'), '.');
	});

	test('dirnames', () => {

		var iter = paths.dirnames('foo/bar');
		var next = iter.next();
		assert.equal(next.value, 'foo');
		assert.equal(next.done, false);
		next = iter.next();
		assert.equal(next.value, '.');
		assert.equal(next.done, false);
		next = iter.next();
		assert.equal(next.value, undefined);
		assert.equal(next.done, true);

		var iter = paths.dirnames('/foo/bar');
		next = iter.next();
		assert.equal(next.value, '/foo');
		assert.equal(next.done, false);
		next = iter.next();
		assert.equal(next.value, '/');
		assert.equal(next.done, false);
		next = iter.next();
		assert.equal(next.value, undefined);
		assert.equal(next.done, true);

		var iter = paths.dirnames('c:\\far\\boo');
		next = iter.next();
		assert.equal(next.value, 'c:\\far');
		assert.equal(next.done, false);
		next = iter.next();
		assert.equal(next.value, 'c:');
		assert.equal(next.done, false);
		next = iter.next();
		assert.equal(next.value, '.');
		assert.equal(next.done, false);
		next = iter.next();
		assert.equal(next.value, undefined);
		assert.equal(next.done, true);
	});

	test('normalize', () => {
		assert.equal(paths.normalize('.'), '.');
		assert.equal(paths.normalize('./'), './');
		assert.equal(paths.normalize('/'), '/');
		// assert.equal(paths.normalize('//'), '/');
		assert.equal(paths.normalize('./foo'), 'foo');
		assert.equal(paths.normalize('/foo'), '/foo');
		assert.equal(paths.normalize('foo/'), 'foo/');
		assert.equal(paths.normalize('foo\\bar'), 'foo/bar');
		assert.equal(paths.normalize('foo/./bar'), 'foo/bar');
		assert.equal(paths.normalize('foo/xxx/./bar'), 'foo/xxx/bar');
		assert.equal(paths.normalize('foo/xxx/./../bar'), 'foo/bar');
		assert.equal(paths.normalize('../bar'), '../bar');
		assert.equal(paths.normalize('foo/xxx/./..'), 'foo');
		assert.equal(paths.normalize('foo/xxx/..'), 'foo');
		assert.equal(paths.normalize('foo/xxx/../bar'), 'foo/bar');

		// return input if already normal
		assert.equal(paths.normalize('/foo/bar.test'), '/foo/bar.test');
	});

	test('makeAbsolute', () => {
		assert.equal(paths.makeAbsolute('foo'), '/foo');
		assert.equal(paths.makeAbsolute('foo/bar'), '/foo/bar');
		assert.equal(paths.makeAbsolute('foo/bar/'), '/foo/bar/');
		assert.equal(paths.makeAbsolute('/foo/bar'), '/foo/bar');
		assert.equal(paths.makeAbsolute('/'), '/');
		assert.equal(paths.makeAbsolute(''), '/');
	});

	test('basename', () => {
		assert.equal(paths.basename('foo/bar'), 'bar');
		assert.equal(paths.basename('foo\\bar'), 'bar');
		assert.equal(paths.basename('/foo/bar'), 'bar');
		assert.equal(paths.basename('\\foo\\bar'), 'bar');
		assert.equal(paths.basename('./bar'), 'bar');
		assert.equal(paths.basename('.\\bar'), 'bar');
		assert.equal(paths.basename('/bar'), 'bar');
		assert.equal(paths.basename('\\bar'), 'bar');
		assert.equal(paths.basename('bar/'), 'bar');
		assert.equal(paths.basename('bar\\'), 'bar');
		assert.equal(paths.basename('bar'), 'bar');
		assert.equal(paths.basename('////////'), '');
		assert.equal(paths.basename('\\\\\\\\'), '');
	});

	test('join', () => {
		assert.equal(paths.join('foo', 'bar'), 'foo/bar');
		assert.equal(paths.join('foo/bar', './bar/foo'), 'foo/bar/bar/foo');
		assert.equal(paths.join('foo/bar', '../bar/foo'), 'foo/bar/foo');
		assert.equal(paths.join('../foo/bar', '../bar/foo'), '../foo/bar/foo');
		assert.equal(paths.join('../../foo/bar', '../bar/foo'), '../../foo/bar/foo');
		assert.equal(paths.join('../../foo/bar', '../../foo'), '../../foo');
		assert.equal(paths.join('/', 'bar'), '/bar');
		assert.equal(paths.join('.', 'bar'), 'bar');
		assert.equal(paths.join('http://localhost/test', 'test'), 'http://localhost/test/test');
		assert.equal(paths.join('file:///c/users/test', 'test'), 'file:///c/users/test/test');
		assert.equal(paths.join('file://localhost/c$/GitDevelopment/express', '.settings'), 'file://localhost/c$/GitDevelopment/express/.settings'); // unc
		assert.equal(paths.join('foo/', 'bar'), 'foo/bar');
		assert.equal(paths.join('foo', '/bar'), 'foo/bar');
		assert.equal(paths.join('foo/', '/bar'), 'foo/bar');
		assert.equal(paths.join('/foo/', '/bar'), '/foo/bar');
		assert.equal(paths.join('foo/', '/bar/'), 'foo/bar/');
		assert.equal(paths.join('foo', 'bar/'), 'foo/bar/');
		assert.equal(paths.join('\\\\server\\far\\boo', 'file.txt'), '//server/far/boo/file.txt');
		assert.equal(paths.join('\\\\server\\far\\boo', './file.txt'), '//server/far/boo/file.txt');
		assert.equal(paths.join('\\\\server\\far\\boo', '.\\file.txt'), '//server/far/boo/file.txt');
		assert.equal(paths.join('\\\\server\\far\\boo', '../file.txt'), '//server/far/file.txt');
		assert.equal(paths.join('//server/far/boo', '../file.txt'), '//server/far/file.txt');
	});

	test('isEqualOrParent', () => {
		assert(paths.isEqualOrParent('foo/bar/test.ts', 'foo/'));
		assert(paths.isEqualOrParent('foo/bar/test.ts', 'foo'));
		assert(paths.isEqualOrParent('/', '/'));
		assert(paths.isEqualOrParent('/foo', '/'));
		assert(paths.isEqualOrParent('/foo', '/foo/'));
		assert(!paths.isEqualOrParent('/foo', '/f'));
		assert(!paths.isEqualOrParent('/foo', '/foo/b'));
		assert(paths.isEqualOrParent('foo/bar/test.ts', 'foo/bar'));
		assert(!paths.isEqualOrParent('foo/bar/test.ts', '/foo/bar'));
		assert(!paths.isEqualOrParent('foo/bar/test.ts', 'foo/barr'));
		assert(paths.isEqualOrParent('foo/bar/test.ts', 'foo/xxx/../bar'));
		assert(paths.isEqualOrParent('foo/bar/test.ts', 'foo/./bar'));
		assert(paths.isEqualOrParent('foo/bar/test.ts', 'foo\\bar\\'));
		assert(paths.isEqualOrParent('foo/bar/test.ts', 'foo/bar/test.ts'));
		assert(!paths.isEqualOrParent('foo/bar/test.ts', 'foo/bar/test'));
		assert(!paths.isEqualOrParent('foo/bar/test.ts', 'foo/bar/test.'));

		if (!platform.isLinux) {
			assert(paths.isEqualOrParent('/foo', '/fOO/'));
			assert(paths.isEqualOrParent('/fOO', '/foo/'));
			assert(paths.isEqualOrParent('foo/bar/test.ts', 'foo/BAR/test.ts'));
			assert(!paths.isEqualOrParent('foo/bar/test.ts', 'foo/BAR/test.'));
		}
	});

	test('extname', () => {
		assert.equal(paths.extname('far.boo'), '.boo');
		assert.equal(paths.extname('far.b'), '.b');
		assert.equal(paths.extname('far.'), '.');
		assert.equal(paths.extname('far.boo/boo.far'), '.far');
		assert.equal(paths.extname('far.boo/boo'), '');
	});

	test('isUNC', () => {
		assert(!paths.isUNC('foo'));
		assert(!paths.isUNC('/foo'));
		assert(!paths.isUNC('\\foo'));

		if (platform.isWindows) {
			assert(paths.isUNC('\\\\foo'));
		} else {
			assert(!paths.isUNC('\\\\foo'));
		}
	});
});