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
