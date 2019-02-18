/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import * as extpath from 'vs/base/common/extpath';
import * as platform from 'vs/base/common/platform';

suite('Paths', () => {

	test('toForwardSlashes', () => {
		assert.equal(extpath.toSlashes('\\\\server\\share\\some\\path'), '//server/share/some/path');
		assert.equal(extpath.toSlashes('c:\\test'), 'c:/test');
		assert.equal(extpath.toSlashes('foo\\bar'), 'foo/bar');
		assert.equal(extpath.toSlashes('/user/far'), '/user/far');
	});


	test('normalize', () => {
		assert.equal(extpath.normalizeWithSlashes(''), '.');
		assert.equal(extpath.normalizeWithSlashes('.'), '.');
		assert.equal(extpath.normalizeWithSlashes('.'), '.');
		assert.equal(extpath.normalizeWithSlashes('../../far'), '../../far');
		assert.equal(extpath.normalizeWithSlashes('../bar'), '../bar');
		assert.equal(extpath.normalizeWithSlashes('../far'), '../far');
		assert.equal(extpath.normalizeWithSlashes('./'), './');
		assert.equal(extpath.normalizeWithSlashes('./././'), './');
		assert.equal(extpath.normalizeWithSlashes('./ff/./'), 'ff/');
		assert.equal(extpath.normalizeWithSlashes('./foo'), 'foo');
		assert.equal(extpath.normalizeWithSlashes('/'), '/');
		assert.equal(extpath.normalizeWithSlashes('/..'), '/');
		assert.equal(extpath.normalizeWithSlashes('///'), '/');
		assert.equal(extpath.normalizeWithSlashes('//foo'), '/foo');
		assert.equal(extpath.normalizeWithSlashes('//foo//'), '/foo/');
		assert.equal(extpath.normalizeWithSlashes('/foo'), '/foo');
		assert.equal(extpath.normalizeWithSlashes('/foo/bar.test'), '/foo/bar.test');
		assert.equal(extpath.normalizeWithSlashes('\\\\\\'), '/');
		assert.equal(extpath.normalizeWithSlashes('c:/../ff'), 'c:/ff');
		assert.equal(extpath.normalizeWithSlashes('c:\\./'), 'c:/');
		assert.equal(extpath.normalizeWithSlashes('foo/'), 'foo/');
		assert.equal(extpath.normalizeWithSlashes('foo/../../bar'), '../bar');
		assert.equal(extpath.normalizeWithSlashes('foo/./'), 'foo/');
		assert.equal(extpath.normalizeWithSlashes('foo/./bar'), 'foo/bar');
		assert.equal(extpath.normalizeWithSlashes('foo//'), 'foo/');
		assert.equal(extpath.normalizeWithSlashes('foo//'), 'foo/');
		assert.equal(extpath.normalizeWithSlashes('foo//bar'), 'foo/bar');
		assert.equal(extpath.normalizeWithSlashes('foo//bar/far'), 'foo/bar/far');
		assert.equal(extpath.normalizeWithSlashes('foo/bar/../../far'), 'far');
		assert.equal(extpath.normalizeWithSlashes('foo/bar/../far'), 'foo/far');
		assert.equal(extpath.normalizeWithSlashes('foo/far/../../bar'), 'bar');
		assert.equal(extpath.normalizeWithSlashes('foo/far/../../bar'), 'bar');
		assert.equal(extpath.normalizeWithSlashes('foo/xxx/..'), 'foo');
		assert.equal(extpath.normalizeWithSlashes('foo/xxx/../bar'), 'foo/bar');
		assert.equal(extpath.normalizeWithSlashes('foo/xxx/./..'), 'foo');
		assert.equal(extpath.normalizeWithSlashes('foo/xxx/./../bar'), 'foo/bar');
		assert.equal(extpath.normalizeWithSlashes('foo/xxx/./bar'), 'foo/xxx/bar');
		assert.equal(extpath.normalizeWithSlashes('foo\\bar'), 'foo/bar');
		assert.equal(extpath.normalizeWithSlashes(null), null);
		assert.equal(extpath.normalizeWithSlashes(undefined), undefined);

		// https://github.com/Microsoft/vscode/issues/7234
		assert.equal(extpath.join('/home/aeschli/workspaces/vscode/extensions/css', './syntaxes/css.plist'), '/home/aeschli/workspaces/vscode/extensions/css/syntaxes/css.plist');
	});

	test('getRoot', () => {

		assert.equal(extpath.getRoot('/user/far'), '/');
		assert.equal(extpath.getRoot('\\\\server\\share\\some\\path'), '//server/share/');
		assert.equal(extpath.getRoot('//server/share/some/path'), '//server/share/');
		assert.equal(extpath.getRoot('//server/share'), '/');
		assert.equal(extpath.getRoot('//server'), '/');
		assert.equal(extpath.getRoot('//server//'), '/');
		assert.equal(extpath.getRoot('c:/user/far'), 'c:/');
		assert.equal(extpath.getRoot('c:user/far'), 'c:');
		assert.equal(extpath.getRoot('http://www'), '');
		assert.equal(extpath.getRoot('http://www/'), 'http://www/');
		assert.equal(extpath.getRoot('file:///foo'), 'file:///');
		assert.equal(extpath.getRoot('file://foo'), '');

	});

	test('join', () => {
		assert.equal(extpath.join('.', 'bar'), 'bar');
		assert.equal(extpath.join('../../foo/bar', '../../foo'), '../../foo');
		assert.equal(extpath.join('../../foo/bar', '../bar/foo'), '../../foo/bar/foo');
		assert.equal(extpath.join('../foo/bar', '../bar/foo'), '../foo/bar/foo');
		assert.equal(extpath.join('/', 'bar'), '/bar');
		assert.equal(extpath.join('//server/far/boo', '../file.txt'), '//server/far/file.txt');
		assert.equal(extpath.join('/foo/', '/bar'), '/foo/bar');
		assert.equal(extpath.join('\\\\server\\far\\boo', '../file.txt'), '//server/far/file.txt');
		assert.equal(extpath.join('\\\\server\\far\\boo', './file.txt'), '//server/far/boo/file.txt');
		assert.equal(extpath.join('\\\\server\\far\\boo', '.\\file.txt'), '//server/far/boo/file.txt');
		assert.equal(extpath.join('\\\\server\\far\\boo', 'file.txt'), '//server/far/boo/file.txt');
		assert.equal(extpath.join('file:///c/users/test', 'test'), 'file:///c/users/test/test');
		assert.equal(extpath.join('file://localhost/c$/GitDevelopment/express', './settings'), 'file://localhost/c$/GitDevelopment/express/settings'); // unc
		assert.equal(extpath.join('file://localhost/c$/GitDevelopment/express', '.settings'), 'file://localhost/c$/GitDevelopment/express/.settings'); // unc
		assert.equal(extpath.join('foo', '/bar'), 'foo/bar');
		assert.equal(extpath.join('foo', 'bar'), 'foo/bar');
		assert.equal(extpath.join('foo', 'bar/'), 'foo/bar/');
		assert.equal(extpath.join('foo/', '/bar'), 'foo/bar');
		assert.equal(extpath.join('foo/', '/bar/'), 'foo/bar/');
		assert.equal(extpath.join('foo/', 'bar'), 'foo/bar');
		assert.equal(extpath.join('foo/bar', '../bar/foo'), 'foo/bar/foo');
		assert.equal(extpath.join('foo/bar', './bar/foo'), 'foo/bar/bar/foo');
		assert.equal(extpath.join('http://localhost/test', '../next'), 'http://localhost/next');
		assert.equal(extpath.join('http://localhost/test', 'test'), 'http://localhost/test/test');
	});

	test('isUNC', () => {
		if (platform.isWindows) {
			assert.ok(!extpath.isUNC('foo'));
			assert.ok(!extpath.isUNC('/foo'));
			assert.ok(!extpath.isUNC('\\foo'));
			assert.ok(!extpath.isUNC('\\\\foo'));
			assert.ok(extpath.isUNC('\\\\a\\b'));
			assert.ok(!extpath.isUNC('//a/b'));
			assert.ok(extpath.isUNC('\\\\server\\share'));
			assert.ok(extpath.isUNC('\\\\server\\share\\'));
			assert.ok(extpath.isUNC('\\\\server\\share\\path'));
		}
	});

	test('isValidBasename', () => {
		assert.ok(!extpath.isValidBasename(null));
		assert.ok(!extpath.isValidBasename(''));
		assert.ok(extpath.isValidBasename('test.txt'));
		assert.ok(!extpath.isValidBasename('/test.txt'));
		assert.ok(!extpath.isValidBasename('\\test.txt'));

		if (platform.isWindows) {
			assert.ok(!extpath.isValidBasename('aux'));
			assert.ok(!extpath.isValidBasename('Aux'));
			assert.ok(!extpath.isValidBasename('LPT0'));
			assert.ok(!extpath.isValidBasename('test.txt.'));
			assert.ok(!extpath.isValidBasename('test.txt..'));
			assert.ok(!extpath.isValidBasename('test.txt '));
			assert.ok(!extpath.isValidBasename('test.txt\t'));
			assert.ok(!extpath.isValidBasename('tes:t.txt'));
			assert.ok(!extpath.isValidBasename('tes"t.txt'));
		}
	});
});
