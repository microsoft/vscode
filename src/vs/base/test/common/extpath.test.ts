/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as extpath from 'vs/base/common/extpath';
import { isWindows } from 'vs/base/common/platform';
import { CharCode } from 'vs/base/common/charCode';

suite('Paths', () => {

	test('toForwardSlashes', () => {
		assert.strictEqual(extpath.toSlashes('\\\\server\\share\\some\\path'), '//server/share/some/path');
		assert.strictEqual(extpath.toSlashes('c:\\test'), 'c:/test');
		assert.strictEqual(extpath.toSlashes('foo\\bar'), 'foo/bar');
		assert.strictEqual(extpath.toSlashes('/user/far'), '/user/far');
	});

	test('getRoot', () => {
		assert.strictEqual(extpath.getRoot('/user/far'), '/');
		assert.strictEqual(extpath.getRoot('\\\\server\\share\\some\\path'), '//server/share/');
		assert.strictEqual(extpath.getRoot('//server/share/some/path'), '//server/share/');
		assert.strictEqual(extpath.getRoot('//server/share'), '/');
		assert.strictEqual(extpath.getRoot('//server'), '/');
		assert.strictEqual(extpath.getRoot('//server//'), '/');
		assert.strictEqual(extpath.getRoot('c:/user/far'), 'c:/');
		assert.strictEqual(extpath.getRoot('c:user/far'), 'c:');
		assert.strictEqual(extpath.getRoot('http://www'), '');
		assert.strictEqual(extpath.getRoot('http://www/'), 'http://www/');
		assert.strictEqual(extpath.getRoot('file:///foo'), 'file:///');
		assert.strictEqual(extpath.getRoot('file://foo'), '');
	});

	(!isWindows ? test.skip : test)('isUNC', () => {
		assert.ok(!extpath.isUNC('foo'));
		assert.ok(!extpath.isUNC('/foo'));
		assert.ok(!extpath.isUNC('\\foo'));
		assert.ok(!extpath.isUNC('\\\\foo'));
		assert.ok(extpath.isUNC('\\\\a\\b'));
		assert.ok(!extpath.isUNC('//a/b'));
		assert.ok(extpath.isUNC('\\\\server\\share'));
		assert.ok(extpath.isUNC('\\\\server\\share\\'));
		assert.ok(extpath.isUNC('\\\\server\\share\\path'));
	});

	test('isValidBasename', () => {
		assert.ok(!extpath.isValidBasename(null));
		assert.ok(!extpath.isValidBasename(''));
		assert.ok(extpath.isValidBasename('test.txt'));
		assert.ok(!extpath.isValidBasename('/test.txt'));
		assert.ok(!extpath.isValidBasename('\\test.txt'));

		if (isWindows) {
			assert.ok(!extpath.isValidBasename('aux'));
			assert.ok(!extpath.isValidBasename('Aux'));
			assert.ok(!extpath.isValidBasename('LPT0'));
			assert.ok(!extpath.isValidBasename('aux.txt'));
			assert.ok(!extpath.isValidBasename('com0.abc'));
			assert.ok(extpath.isValidBasename('LPT00'));
			assert.ok(extpath.isValidBasename('aux1'));
			assert.ok(extpath.isValidBasename('aux1.txt'));
			assert.ok(extpath.isValidBasename('aux1.aux.txt'));

			assert.ok(!extpath.isValidBasename('test.txt.'));
			assert.ok(!extpath.isValidBasename('test.txt..'));
			assert.ok(!extpath.isValidBasename('test.txt '));
			assert.ok(!extpath.isValidBasename('test.txt\t'));
			assert.ok(!extpath.isValidBasename('tes:t.txt'));
			assert.ok(!extpath.isValidBasename('tes"t.txt'));
		}
	});

	test('sanitizeFilePath', () => {
		if (isWindows) {
			assert.strictEqual(extpath.sanitizeFilePath('.', 'C:\\the\\cwd'), 'C:\\the\\cwd');
			assert.strictEqual(extpath.sanitizeFilePath('', 'C:\\the\\cwd'), 'C:\\the\\cwd');

			assert.strictEqual(extpath.sanitizeFilePath('C:', 'C:\\the\\cwd'), 'C:\\');
			assert.strictEqual(extpath.sanitizeFilePath('C:\\', 'C:\\the\\cwd'), 'C:\\');
			assert.strictEqual(extpath.sanitizeFilePath('C:\\\\', 'C:\\the\\cwd'), 'C:\\');

			assert.strictEqual(extpath.sanitizeFilePath('C:\\folder\\my.txt', 'C:\\the\\cwd'), 'C:\\folder\\my.txt');
			assert.strictEqual(extpath.sanitizeFilePath('C:\\folder\\my', 'C:\\the\\cwd'), 'C:\\folder\\my');
			assert.strictEqual(extpath.sanitizeFilePath('C:\\folder\\..\\my', 'C:\\the\\cwd'), 'C:\\my');
			assert.strictEqual(extpath.sanitizeFilePath('C:\\folder\\my\\', 'C:\\the\\cwd'), 'C:\\folder\\my');
			assert.strictEqual(extpath.sanitizeFilePath('C:\\folder\\my\\\\\\', 'C:\\the\\cwd'), 'C:\\folder\\my');

			assert.strictEqual(extpath.sanitizeFilePath('my.txt', 'C:\\the\\cwd'), 'C:\\the\\cwd\\my.txt');
			assert.strictEqual(extpath.sanitizeFilePath('my.txt\\', 'C:\\the\\cwd'), 'C:\\the\\cwd\\my.txt');

			assert.strictEqual(extpath.sanitizeFilePath('\\\\localhost\\folder\\my', 'C:\\the\\cwd'), '\\\\localhost\\folder\\my');
			assert.strictEqual(extpath.sanitizeFilePath('\\\\localhost\\folder\\my\\', 'C:\\the\\cwd'), '\\\\localhost\\folder\\my');
		} else {
			assert.strictEqual(extpath.sanitizeFilePath('.', '/the/cwd'), '/the/cwd');
			assert.strictEqual(extpath.sanitizeFilePath('', '/the/cwd'), '/the/cwd');
			assert.strictEqual(extpath.sanitizeFilePath('/', '/the/cwd'), '/');

			assert.strictEqual(extpath.sanitizeFilePath('/folder/my.txt', '/the/cwd'), '/folder/my.txt');
			assert.strictEqual(extpath.sanitizeFilePath('/folder/my', '/the/cwd'), '/folder/my');
			assert.strictEqual(extpath.sanitizeFilePath('/folder/../my', '/the/cwd'), '/my');
			assert.strictEqual(extpath.sanitizeFilePath('/folder/my/', '/the/cwd'), '/folder/my');
			assert.strictEqual(extpath.sanitizeFilePath('/folder/my///', '/the/cwd'), '/folder/my');

			assert.strictEqual(extpath.sanitizeFilePath('my.txt', '/the/cwd'), '/the/cwd/my.txt');
			assert.strictEqual(extpath.sanitizeFilePath('my.txt/', '/the/cwd'), '/the/cwd/my.txt');
		}
	});

	test('isRootOrDriveLetter', () => {
		if (isWindows) {
			assert.ok(extpath.isRootOrDriveLetter('c:'));
			assert.ok(extpath.isRootOrDriveLetter('D:'));
			assert.ok(extpath.isRootOrDriveLetter('D:/'));
			assert.ok(extpath.isRootOrDriveLetter('D:\\'));
			assert.ok(!extpath.isRootOrDriveLetter('D:\\path'));
			assert.ok(!extpath.isRootOrDriveLetter('D:/path'));
		} else {
			assert.ok(extpath.isRootOrDriveLetter('/'));
			assert.ok(!extpath.isRootOrDriveLetter('/path'));
		}
	});

	test('hasDriveLetter', () => {
		if (isWindows) {
			assert.ok(extpath.hasDriveLetter('c:'));
			assert.ok(extpath.hasDriveLetter('D:'));
			assert.ok(extpath.hasDriveLetter('D:/'));
			assert.ok(extpath.hasDriveLetter('D:\\'));
			assert.ok(extpath.hasDriveLetter('D:\\path'));
			assert.ok(extpath.hasDriveLetter('D:/path'));
		} else {
			assert.ok(!extpath.hasDriveLetter('/'));
			assert.ok(!extpath.hasDriveLetter('/path'));
		}
	});

	test('getDriveLetter', () => {
		if (isWindows) {
			assert.strictEqual(extpath.getDriveLetter('c:'), 'c');
			assert.strictEqual(extpath.getDriveLetter('D:'), 'D');
			assert.strictEqual(extpath.getDriveLetter('D:/'), 'D');
			assert.strictEqual(extpath.getDriveLetter('D:\\'), 'D');
			assert.strictEqual(extpath.getDriveLetter('D:\\path'), 'D');
			assert.strictEqual(extpath.getDriveLetter('D:/path'), 'D');
		} else {
			assert.ok(!extpath.getDriveLetter('/'));
			assert.ok(!extpath.getDriveLetter('/path'));
		}
	});

	test('isWindowsDriveLetter', () => {
		assert.ok(!extpath.isWindowsDriveLetter(0));
		assert.ok(!extpath.isWindowsDriveLetter(-1));
		assert.ok(extpath.isWindowsDriveLetter(CharCode.A));
		assert.ok(extpath.isWindowsDriveLetter(CharCode.z));
	});

	test('indexOfPath', () => {
		assert.strictEqual(extpath.indexOfPath('/foo', '/bar', true), -1);
		assert.strictEqual(extpath.indexOfPath('/foo', '/FOO', false), -1);
		assert.strictEqual(extpath.indexOfPath('/foo', '/FOO', true), 0);
		assert.strictEqual(extpath.indexOfPath('/some/long/path', '/some/long', false), 0);
		assert.strictEqual(extpath.indexOfPath('/some/long/path', '/PATH', true), 10);
	});

	test('parseLineAndColumnAware', () => {
		let res = extpath.parseLineAndColumnAware('/foo/bar');
		assert.strictEqual(res.path, '/foo/bar');
		assert.strictEqual(res.line, undefined);
		assert.strictEqual(res.column, undefined);

		res = extpath.parseLineAndColumnAware('/foo/bar:33');
		assert.strictEqual(res.path, '/foo/bar');
		assert.strictEqual(res.line, 33);
		assert.strictEqual(res.column, 1);

		res = extpath.parseLineAndColumnAware('/foo/bar:33:34');
		assert.strictEqual(res.path, '/foo/bar');
		assert.strictEqual(res.line, 33);
		assert.strictEqual(res.column, 34);

		res = extpath.parseLineAndColumnAware('C:\\foo\\bar');
		assert.strictEqual(res.path, 'C:\\foo\\bar');
		assert.strictEqual(res.line, undefined);
		assert.strictEqual(res.column, undefined);

		res = extpath.parseLineAndColumnAware('C:\\foo\\bar:33');
		assert.strictEqual(res.path, 'C:\\foo\\bar');
		assert.strictEqual(res.line, 33);
		assert.strictEqual(res.column, 1);

		res = extpath.parseLineAndColumnAware('C:\\foo\\bar:33:34');
		assert.strictEqual(res.path, 'C:\\foo\\bar');
		assert.strictEqual(res.line, 33);
		assert.strictEqual(res.column, 34);

		res = extpath.parseLineAndColumnAware('/foo/bar:abb');
		assert.strictEqual(res.path, '/foo/bar:abb');
		assert.strictEqual(res.line, undefined);
		assert.strictEqual(res.column, undefined);
	});
});
