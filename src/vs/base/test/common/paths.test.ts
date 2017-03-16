/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import paths = require('vs/base/common/paths');
import platform = require('vs/base/common/platform');

suite('Paths', () => {
	test('relative', () => {
		assert.equal(paths.relative('/test/api/files/test', '/test/api/files/lib/foo'), '../lib/foo');
		assert.equal(paths.relative('far/boo', 'boo/far'), '../../boo/far');
		assert.equal(paths.relative('far/boo', 'far/boo'), '');
		assert.equal(paths.relative('far/boo', 'far/boo/bar/foo'), 'bar/foo');

		if (platform.isWindows) {
			assert.equal(paths.relative('C:\\test\\api\\files\\test', 'C:\\test\\api\\files\\lib\\foo'), '../lib/foo');
			assert.equal(paths.relative('C:\\', 'C:\\vscode'), 'vscode');
			assert.equal(paths.relative('C:\\', 'C:\\vscode\\foo.txt'), 'vscode/foo.txt');
		}

		// // ignore trailing slashes
		assert.equal(paths.relative('/test/api/files/test/', '/test/api/files/lib/foo'), '../lib/foo');
		assert.equal(paths.relative('/test/api/files/test', '/test/api/files/lib/foo/'), '../lib/foo');
		assert.equal(paths.relative('/test/api/files/test/', '/test/api/files/lib/foo/'), '../lib/foo');
		assert.equal(paths.relative('far/boo/', 'boo/far'), '../../boo/far');
		assert.equal(paths.relative('far/boo/', 'boo/far/'), '../../boo/far');
		assert.equal(paths.relative('far/boo/', 'far/boo'), '');
		assert.equal(paths.relative('far/boo', 'far/boo/'), '');
		assert.equal(paths.relative('far/boo/', 'far/boo/'), '');

		if (platform.isWindows) {
			assert.equal(paths.relative('C:\\test\\api\\files\\test\\', 'C:\\test\\api\\files\\lib\\foo'), '../lib/foo');
			assert.equal(paths.relative('C:\\test\\api\\files\\test', 'C:\\test\\api\\files\\lib\\foo\\'), '../lib/foo');
			assert.equal(paths.relative('C:\\test\\api\\files\\test\\', 'C:\\test\\api\\files\\lib\\foo\\'), '../lib/foo');
		}
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
		if (platform.isWindows) {
			assert.equal(paths.dirname('c:\\some\\file.txt'), 'c:\\some');
			assert.equal(paths.dirname('c:\\some'), 'c:\\');
		}
	});

	test('normalize', () => {
		assert.equal(paths.normalize(''), '.');
		assert.equal(paths.normalize('.'), '.');
		assert.equal(paths.normalize('.'), '.');
		assert.equal(paths.normalize('../../far'), '../../far');
		assert.equal(paths.normalize('../bar'), '../bar');
		assert.equal(paths.normalize('../far'), '../far');
		assert.equal(paths.normalize('./'), './');
		assert.equal(paths.normalize('./././'), './');
		assert.equal(paths.normalize('./ff/./'), 'ff/');
		assert.equal(paths.normalize('./foo'), 'foo');
		assert.equal(paths.normalize('/'), '/');
		assert.equal(paths.normalize('/..'), '/');
		assert.equal(paths.normalize('///'), '/');
		assert.equal(paths.normalize('//foo'), '/foo');
		assert.equal(paths.normalize('//foo//'), '/foo/');
		assert.equal(paths.normalize('/foo'), '/foo');
		assert.equal(paths.normalize('/foo/bar.test'), '/foo/bar.test');
		assert.equal(paths.normalize('\\\\\\'), '/');
		assert.equal(paths.normalize('c:/../ff'), 'c:/ff');
		assert.equal(paths.normalize('c:\\./'), 'c:/');
		assert.equal(paths.normalize('foo/'), 'foo/');
		assert.equal(paths.normalize('foo/../../bar'), '../bar');
		assert.equal(paths.normalize('foo/./'), 'foo/');
		assert.equal(paths.normalize('foo/./bar'), 'foo/bar');
		assert.equal(paths.normalize('foo//'), 'foo/');
		assert.equal(paths.normalize('foo//'), 'foo/');
		assert.equal(paths.normalize('foo//bar'), 'foo/bar');
		assert.equal(paths.normalize('foo//bar/far'), 'foo/bar/far');
		assert.equal(paths.normalize('foo/bar/../../far'), 'far');
		assert.equal(paths.normalize('foo/bar/../far'), 'foo/far');
		assert.equal(paths.normalize('foo/far/../../bar'), 'bar');
		assert.equal(paths.normalize('foo/far/../../bar'), 'bar');
		assert.equal(paths.normalize('foo/xxx/..'), 'foo');
		assert.equal(paths.normalize('foo/xxx/../bar'), 'foo/bar');
		assert.equal(paths.normalize('foo/xxx/./..'), 'foo');
		assert.equal(paths.normalize('foo/xxx/./../bar'), 'foo/bar');
		assert.equal(paths.normalize('foo/xxx/./bar'), 'foo/xxx/bar');
		assert.equal(paths.normalize('foo\\bar'), 'foo/bar');
		assert.equal(paths.normalize(null), null);
		assert.equal(paths.normalize(undefined), undefined);

		// https://github.com/Microsoft/vscode/issues/7234
		assert.equal(paths.join('/home/aeschli/workspaces/vscode/extensions/css', './syntaxes/css.plist'), '/home/aeschli/workspaces/vscode/extensions/css/syntaxes/css.plist');
	});

	test('getRootLength', () => {

		assert.equal(paths.getRoot('/user/far'), '/');
		assert.equal(paths.getRoot('\\\\server\\share\\some\\path'), '//server/share/');
		assert.equal(paths.getRoot('//server/share/some/path'), '//server/share/');
		assert.equal(paths.getRoot('//server/share'), '/');
		assert.equal(paths.getRoot('//server'), '/');
		assert.equal(paths.getRoot('//server//'), '/');
		assert.equal(paths.getRoot('c:/user/far'), 'c:/');
		assert.equal(paths.getRoot('c:user/far'), 'c:');
		assert.equal(paths.getRoot('http://www'), '');
		assert.equal(paths.getRoot('http://www/'), 'http://www/');
		assert.equal(paths.getRoot('file:///foo'), 'file:///');
		assert.equal(paths.getRoot('file://foo'), '');

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
		assert.equal(paths.join('.', 'bar'), 'bar');
		assert.equal(paths.join('../../foo/bar', '../../foo'), '../../foo');
		assert.equal(paths.join('../../foo/bar', '../bar/foo'), '../../foo/bar/foo');
		assert.equal(paths.join('../foo/bar', '../bar/foo'), '../foo/bar/foo');
		assert.equal(paths.join('/', 'bar'), '/bar');
		assert.equal(paths.join('//server/far/boo', '../file.txt'), '//server/far/file.txt');
		assert.equal(paths.join('/foo/', '/bar'), '/foo/bar');
		assert.equal(paths.join('\\\\server\\far\\boo', '../file.txt'), '//server/far/file.txt');
		assert.equal(paths.join('\\\\server\\far\\boo', './file.txt'), '//server/far/boo/file.txt');
		assert.equal(paths.join('\\\\server\\far\\boo', '.\\file.txt'), '//server/far/boo/file.txt');
		assert.equal(paths.join('\\\\server\\far\\boo', 'file.txt'), '//server/far/boo/file.txt');
		assert.equal(paths.join('file:///c/users/test', 'test'), 'file:///c/users/test/test');
		assert.equal(paths.join('file://localhost/c$/GitDevelopment/express', './settings'), 'file://localhost/c$/GitDevelopment/express/settings'); // unc
		assert.equal(paths.join('file://localhost/c$/GitDevelopment/express', '.settings'), 'file://localhost/c$/GitDevelopment/express/.settings'); // unc
		assert.equal(paths.join('foo', '/bar'), 'foo/bar');
		assert.equal(paths.join('foo', 'bar'), 'foo/bar');
		assert.equal(paths.join('foo', 'bar/'), 'foo/bar/');
		assert.equal(paths.join('foo/', '/bar'), 'foo/bar');
		assert.equal(paths.join('foo/', '/bar/'), 'foo/bar/');
		assert.equal(paths.join('foo/', 'bar'), 'foo/bar');
		assert.equal(paths.join('foo/bar', '../bar/foo'), 'foo/bar/foo');
		assert.equal(paths.join('foo/bar', './bar/foo'), 'foo/bar/bar/foo');
		assert.equal(paths.join('http://localhost/test', '../next'), 'http://localhost/next');
		assert.equal(paths.join('http://localhost/test', 'test'), 'http://localhost/test/test');
	});

	test('extname', () => {
		assert.equal(paths.extname('far.boo'), '.boo');
		assert.equal(paths.extname('far.b'), '.b');
		assert.equal(paths.extname('far.'), '.');
		assert.equal(paths.extname('far.boo/boo.far'), '.far');
		assert.equal(paths.extname('far.boo/boo'), '');
	});

	test('isUNC', () => {
		if (platform.isWindows) {
			assert.ok(!paths.isUNC('foo'));
			assert.ok(!paths.isUNC('/foo'));
			assert.ok(!paths.isUNC('\\foo'));
			assert.ok(!paths.isUNC('\\\\foo'));
			assert.ok(paths.isUNC('\\\\a\\b'));
			assert.ok(!paths.isUNC('//a/b'));
			assert.ok(paths.isUNC('\\\\server\\share'));
			assert.ok(paths.isUNC('\\\\server\\share\\'));
			assert.ok(paths.isUNC('\\\\server\\share\\path'));
		}
	});

	test('isValidBasename', () => {
		assert.ok(!paths.isValidBasename(null));
		assert.ok(!paths.isValidBasename(''));
		assert.ok(paths.isValidBasename('test.txt'));
		assert.ok(!paths.isValidBasename('/test.txt'));
		assert.ok(!paths.isValidBasename('\\test.txt'));

		if (platform.isWindows) {
			assert.ok(!paths.isValidBasename('aux'));
			assert.ok(!paths.isValidBasename('Aux'));
			assert.ok(!paths.isValidBasename('LPT0'));
			assert.ok(!paths.isValidBasename('test.txt.'));
			assert.ok(!paths.isValidBasename('test.txt..'));
			assert.ok(!paths.isValidBasename('test.txt '));
			assert.ok(!paths.isValidBasename('test.txt\t'));
			assert.ok(!paths.isValidBasename('tes:t.txt'));
			assert.ok(!paths.isValidBasename('tes"t.txt'));
		}
	});
});