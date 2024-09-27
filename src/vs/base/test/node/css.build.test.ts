/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../common/utils.js';
import { CSSPluginUtilities, rewriteUrls } from '../../../css.build.js';

suite('CSSPlugin', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('Utilities.pathOf', () => {
		assert.strictEqual(CSSPluginUtilities.pathOf(''), '');
		assert.strictEqual(CSSPluginUtilities.pathOf('/a'), '/');
		assert.strictEqual(CSSPluginUtilities.pathOf('a/b/c.css'), 'a/b/');
		assert.strictEqual(CSSPluginUtilities.pathOf('a'), '');
		assert.strictEqual(CSSPluginUtilities.pathOf('a.com/a.css'), 'a.com/');
		assert.strictEqual(CSSPluginUtilities.pathOf('http://a.com/a.css'), 'http://a.com/');
		assert.strictEqual(CSSPluginUtilities.pathOf('https://a.com/a.css'), 'https://a.com/');
		assert.strictEqual(CSSPluginUtilities.pathOf('http://a.com/a/b/c.css'), 'http://a.com/a/b/');
		assert.strictEqual(CSSPluginUtilities.pathOf('https://a.com/a/b/c.css'), 'https://a.com/a/b/');
		assert.strictEqual(CSSPluginUtilities.pathOf('/a.css'), '/');
		assert.strictEqual(CSSPluginUtilities.pathOf('/a/b/c.css'), '/a/b/');
	});

	test('Utilities.joinPaths', () => {
		function mytest(a: string, b: string, expected: string) {
			assert.strictEqual(CSSPluginUtilities.joinPaths(a, b), expected, '<' + a + '> + <' + b + '> = <' + expected + '>');
		}
		mytest('', 'a.css', 'a.css');
		mytest('', './a.css', 'a.css');
		mytest('', '././././a.css', 'a.css');
		mytest('', './../a.css', '../a.css');
		mytest('', '../../a.css', '../../a.css');
		mytest('', '../../a/b/c.css', '../../a/b/c.css');
		mytest('/', 'a.css', '/a.css');
		mytest('/', './a.css', '/a.css');
		mytest('/', '././././a.css', '/a.css');
		mytest('/', './../a.css', '/a.css');
		mytest('/', '../../a.css', '/a.css');
		mytest('/', '../../a/b/c.css', '/a/b/c.css');
		mytest('x/y/z/', 'a.css', 'x/y/z/a.css');
		mytest('x/y/z/', './a.css', 'x/y/z/a.css');
		mytest('x/y/z/', '././././a.css', 'x/y/z/a.css');
		mytest('x/y/z/', './../a.css', 'x/y/a.css');
		mytest('x/y/z/', '../../a.css', 'x/a.css');
		mytest('x/y/z/', '../../a/b/c.css', 'x/a/b/c.css');

		mytest('//a.com/', 'a.css', '//a.com/a.css');
		mytest('//a.com/', './a.css', '//a.com/a.css');
		mytest('//a.com/', '././././a.css', '//a.com/a.css');
		mytest('//a.com/', './../a.css', '//a.com/a.css');
		mytest('//a.com/', '../../a.css', '//a.com/a.css');
		mytest('//a.com/', '../../a/b/c.css', '//a.com/a/b/c.css');
		mytest('//a.com/x/y/z/', 'a.css', '//a.com/x/y/z/a.css');
		mytest('//a.com/x/y/z/', './a.css', '//a.com/x/y/z/a.css');
		mytest('//a.com/x/y/z/', '././././a.css', '//a.com/x/y/z/a.css');
		mytest('//a.com/x/y/z/', './../a.css', '//a.com/x/y/a.css');
		mytest('//a.com/x/y/z/', '../../a.css', '//a.com/x/a.css');
		mytest('//a.com/x/y/z/', '../../a/b/c.css', '//a.com/x/a/b/c.css');

		mytest('http://a.com/', 'a.css', 'http://a.com/a.css');
		mytest('http://a.com/', './a.css', 'http://a.com/a.css');
		mytest('http://a.com/', '././././a.css', 'http://a.com/a.css');
		mytest('http://a.com/', './../a.css', 'http://a.com/a.css');
		mytest('http://a.com/', '../../a.css', 'http://a.com/a.css');
		mytest('http://a.com/', '../../a/b/c.css', 'http://a.com/a/b/c.css');
		mytest('http://a.com/x/y/z/', 'a.css', 'http://a.com/x/y/z/a.css');
		mytest('http://a.com/x/y/z/', './a.css', 'http://a.com/x/y/z/a.css');
		mytest('http://a.com/x/y/z/', '././././a.css', 'http://a.com/x/y/z/a.css');
		mytest('http://a.com/x/y/z/', './../a.css', 'http://a.com/x/y/a.css');
		mytest('http://a.com/x/y/z/', '../../a.css', 'http://a.com/x/a.css');
		mytest('http://a.com/x/y/z/', '../../a/b/c.css', 'http://a.com/x/a/b/c.css');

		mytest('https://a.com/', 'a.css', 'https://a.com/a.css');
		mytest('https://a.com/', './a.css', 'https://a.com/a.css');
		mytest('https://a.com/', '././././a.css', 'https://a.com/a.css');
		mytest('https://a.com/', './../a.css', 'https://a.com/a.css');
		mytest('https://a.com/', '../../a.css', 'https://a.com/a.css');
		mytest('https://a.com/', '../../a/b/c.css', 'https://a.com/a/b/c.css');
		mytest('https://a.com/x/y/z/', 'a.css', 'https://a.com/x/y/z/a.css');
		mytest('https://a.com/x/y/z/', './a.css', 'https://a.com/x/y/z/a.css');
		mytest('https://a.com/x/y/z/', '././././a.css', 'https://a.com/x/y/z/a.css');
		mytest('https://a.com/x/y/z/', './../a.css', 'https://a.com/x/y/a.css');
		mytest('https://a.com/x/y/z/', '../../a.css', 'https://a.com/x/a.css');
		mytest('https://a.com/x/y/z/', '../../a/b/c.css', 'https://a.com/x/a/b/c.css');
	});

	test('Utilities.commonPrefix', () => {
		function mytest(a: string, b: string, expected: string) {
			assert.strictEqual(CSSPluginUtilities.commonPrefix(a, b), expected, 'prefix(<' + a + '>, <' + b + '>) = <' + expected + '>');
			assert.strictEqual(CSSPluginUtilities.commonPrefix(b, a), expected, 'prefix(<' + b + '>, <' + a + '>) = <' + expected + '>');
		}
		mytest('', '', '');
		mytest('x', '', '');
		mytest('x', 'x', 'x');
		mytest('aaaa', 'aaaa', 'aaaa');
		mytest('aaaaxyz', 'aaaa', 'aaaa');
		mytest('aaaaxyz', 'aaaatuv', 'aaaa');
	});

	test('Utilities.commonFolderPrefix', () => {
		function mytest(a: string, b: string, expected: string) {
			assert.strictEqual(CSSPluginUtilities.commonFolderPrefix(a, b), expected, 'folderPrefix(<' + a + '>, <' + b + '>) = <' + expected + '>');
			assert.strictEqual(CSSPluginUtilities.commonFolderPrefix(b, a), expected, 'folderPrefix(<' + b + '>, <' + a + '>) = <' + expected + '>');
		}
		mytest('', '', '');
		mytest('x', '', '');
		mytest('x', 'x', '');
		mytest('aaaa', 'aaaa', '');
		mytest('aaaaxyz', 'aaaa', '');
		mytest('aaaaxyz', 'aaaatuv', '');
		mytest('/', '/', '/');
		mytest('x/', '', '');
		mytest('x/', 'x/', 'x/');
		mytest('aaaa/', 'aaaa/', 'aaaa/');
		mytest('aaaa/axyz', 'aaaa/a', 'aaaa/');
		mytest('aaaa/axyz', 'aaaa/atuv', 'aaaa/');
	});

	test('Utilities.relativePath', () => {
		function mytest(a: string, b: string, expected: string) {
			assert.strictEqual(CSSPluginUtilities.relativePath(a, b), expected, 'relativePath(<' + a + '>, <' + b + '>) = <' + expected + '>');
		}
		mytest('', '', '');
		mytest('x', '', '');
		mytest('x', 'x', 'x');
		mytest('aaaa', 'aaaa', 'aaaa');
		mytest('aaaaxyz', 'aaaa', 'aaaa');
		mytest('aaaaxyz', 'aaaatuv', 'aaaatuv');

		mytest('x/y/aaaaxyz', 'x/aaaatuv', '../aaaatuv');
		mytest('x/y/aaaaxyz', 'x/y/aaaatuv', 'aaaatuv');
		mytest('z/t/aaaaxyz', 'x/y/aaaatuv', '../../x/y/aaaatuv');
		mytest('aaaaxyz', 'x/y/aaaatuv', 'x/y/aaaatuv');

		mytest('a', '/a', '/a');
		mytest('/', '/a', '/a');
		mytest('/a/b/c', '/a/b/c', '/a/b/c');
		mytest('/a/b', '/a/b/c/d', '/a/b/c/d');

		mytest('a', 'http://a', 'http://a');
		mytest('/', 'http://a', 'http://a');
		mytest('/a/b/c', 'http://a/b/c', 'http://a/b/c');
		mytest('/a/b', 'http://a/b/c/d', 'http://a/b/c/d');

		mytest('a', 'https://a', 'https://a');
		mytest('/', 'https://a', 'https://a');
		mytest('/a/b/c', 'https://a/b/c', 'https://a/b/c');
		mytest('/a/b', 'https://a/b/c/d', 'https://a/b/c/d');

		mytest('x/', '', '../');
		mytest('x/', '', '../');
		mytest('x/', 'x/', '');
		mytest('x/a', 'x/a', 'a');
	});

	test('Utilities.rewriteUrls', () => {
		function mytest(originalFile: string, newFile: string, url: string, expected: string) {
			assert.strictEqual(rewriteUrls(originalFile, newFile, 'sel { background:url(\'' + url + '\'); }'), 'sel { background:url(' + expected + '); }');
			assert.strictEqual(rewriteUrls(originalFile, newFile, 'sel { background:url(\"' + url + '\"); }'), 'sel { background:url(' + expected + '); }');
			assert.strictEqual(rewriteUrls(originalFile, newFile, 'sel { background:url(' + url + '); }'), 'sel { background:url(' + expected + '); }');
		}

		// img/img.png
		mytest('a.css', 'b.css', 'img/img.png', 'img/img.png');
		mytest('a.css', 't/b.css', 'img/img.png', '../img/img.png');
		mytest('a.css', 'x/y/b.css', 'img/img.png', '../../img/img.png');
		mytest('x/a.css', 'b.css', 'img/img.png', 'x/img/img.png');
		mytest('x/y/a.css', 'b.css', 'img/img.png', 'x/y/img/img.png');
		mytest('x/y/a.css', 't/u/b.css', 'img/img.png', '../../x/y/img/img.png');
		mytest('x/y/a.css', 'x/u/b.css', 'img/img.png', '../y/img/img.png');
		mytest('x/y/a.css', 'x/y/b.css', 'img/img.png', 'img/img.png');
		mytest('/a.css', 'b.css', 'img/img.png', '/img/img.png');
		mytest('/a.css', 'x/b.css', 'img/img.png', '/img/img.png');
		mytest('/a.css', 'x/y/b.css', 'img/img.png', '/img/img.png');
		mytest('/x/a.css', 'b.css', 'img/img.png', '/x/img/img.png');
		mytest('/x/a.css', 'x/b.css', 'img/img.png', '/x/img/img.png');
		mytest('/x/a.css', 'x/y/b.css', 'img/img.png', '/x/img/img.png');
		mytest('/x/y/a.css', 'b.css', 'img/img.png', '/x/y/img/img.png');
		mytest('/x/y/a.css', 'x/b.css', 'img/img.png', '/x/y/img/img.png');
		mytest('/x/y/a.css', 'x/y/b.css', 'img/img.png', '/x/y/img/img.png');
		mytest('/a.css', '/b.css', 'img/img.png', '/img/img.png');
		mytest('/a.css', '/b.css', 'img/img.png', '/img/img.png');
		mytest('/x/a.css', '/b.css', 'img/img.png', '/x/img/img.png');
		mytest('/x/a.css', '/x/b.css', 'img/img.png', '/x/img/img.png');
		mytest('http://www.example.com/x/y/a.css', 'b.css', 'img/img.png', 'http://www.example.com/x/y/img/img.png');
		mytest('http://www.example.com/x/y/a.css', 'http://www.example2.com/b.css', 'img/img.png', 'http://www.example.com/x/y/img/img.png');
		mytest('https://www.example.com/x/y/a.css', 'b.css', 'img/img.png', 'https://www.example.com/x/y/img/img.png');

		// ../img/img.png
		mytest('a.css', 'b.css', '../img/img.png', '../img/img.png');
		mytest('a.css', 't/b.css', '../img/img.png', '../../img/img.png');
		mytest('a.css', 'x/y/b.css', '../img/img.png', '../../../img/img.png');
		mytest('x/a.css', 'b.css', '../img/img.png', 'img/img.png');
		mytest('x/y/a.css', 'b.css', '../img/img.png', 'x/img/img.png');
		mytest('x/y/a.css', 't/u/b.css', '../img/img.png', '../../x/img/img.png');
		mytest('x/y/a.css', 'x/u/b.css', '../img/img.png', '../img/img.png');
		mytest('x/y/a.css', 'x/y/b.css', '../img/img.png', '../img/img.png');
		mytest('/a.css', 'b.css', '../img/img.png', '/img/img.png');
		mytest('/a.css', 'x/b.css', '../img/img.png', '/img/img.png');
		mytest('/a.css', 'x/y/b.css', '../img/img.png', '/img/img.png');
		mytest('/x/a.css', 'b.css', '../img/img.png', '/img/img.png');
		mytest('/x/a.css', 'x/b.css', '../img/img.png', '/img/img.png');
		mytest('/x/a.css', 'x/y/b.css', '../img/img.png', '/img/img.png');
		mytest('/x/y/a.css', 'b.css', '../img/img.png', '/x/img/img.png');
		mytest('/x/y/a.css', 'x/b.css', '../img/img.png', '/x/img/img.png');
		mytest('/x/y/a.css', 'x/y/b.css', '../img/img.png', '/x/img/img.png');
		mytest('/a.css', '/b.css', '../img/img.png', '/img/img.png');
		mytest('/a.css', '/b.css', '../img/img.png', '/img/img.png');
		mytest('/x/a.css', '/b.css', '../img/img.png', '/img/img.png');
		mytest('/x/a.css', '/x/b.css', '../img/img.png', '/img/img.png');
		mytest('http://www.example.com/x/y/a.css', 'b.css', '../img/img.png', 'http://www.example.com/x/img/img.png');
		mytest('http://www.example.com/x/y/a.css', 'http://www.example2.com/b.css', '../img/img.png', 'http://www.example.com/x/img/img.png');
		mytest('https://www.example.com/x/y/a.css', 'b.css', '../img/img.png', 'https://www.example.com/x/img/img.png');

		// /img/img.png
		mytest('a.css', 'b.css', '/img/img.png', '/img/img.png');
		mytest('a.css', 't/b.css', '/img/img.png', '/img/img.png');
		mytest('a.css', 'x/y/b.css', '/img/img.png', '/img/img.png');
		mytest('x/a.css', 'b.css', '/img/img.png', '/img/img.png');
		mytest('x/y/a.css', 'b.css', '/img/img.png', '/img/img.png');
		mytest('x/y/a.css', 't/u/b.css', '/img/img.png', '/img/img.png');
		mytest('x/y/a.css', 'x/u/b.css', '/img/img.png', '/img/img.png');
		mytest('x/y/a.css', 'x/y/b.css', '/img/img.png', '/img/img.png');
		mytest('/a.css', 'b.css', '/img/img.png', '/img/img.png');
		mytest('/a.css', 'x/b.css', '/img/img.png', '/img/img.png');
		mytest('/a.css', 'x/y/b.css', '/img/img.png', '/img/img.png');
		mytest('/x/a.css', 'b.css', '/img/img.png', '/img/img.png');
		mytest('/x/a.css', 'x/b.css', '/img/img.png', '/img/img.png');
		mytest('/x/a.css', 'x/y/b.css', '/img/img.png', '/img/img.png');
		mytest('/x/y/a.css', 'b.css', '/img/img.png', '/img/img.png');
		mytest('/x/y/a.css', 'x/b.css', '/img/img.png', '/img/img.png');
		mytest('/x/y/a.css', 'x/y/b.css', '/img/img.png', '/img/img.png');
		mytest('/a.css', '/b.css', '/img/img.png', '/img/img.png');
		mytest('/a.css', '/b.css', '/img/img.png', '/img/img.png');
		mytest('/x/a.css', '/b.css', '/img/img.png', '/img/img.png');
		mytest('/x/a.css', '/x/b.css', '/img/img.png', '/img/img.png');
		mytest('http://www.example.com/x/y/a.css', 'b.css', '/img/img.png', 'http://www.example.com/img/img.png');
		mytest('http://www.example.com/x/y/a.css', 'http://www.example.com/x/y/b.css', '/img/img.png', 'http://www.example.com/img/img.png');
		mytest('https://www.example.com/x/y/a.css', 'b.css', '/img/img.png', 'https://www.example.com/img/img.png');

		// http://example.com/img/img.png
		mytest('a.css', 'b.css', 'http://example.com/img/img.png', 'http://example.com/img/img.png');
		mytest('a.css', 't/b.css', 'http://example.com/img/img.png', 'http://example.com/img/img.png');
		mytest('a.css', 'x/y/b.css', 'http://example.com/img/img.png', 'http://example.com/img/img.png');
		mytest('x/a.css', 'b.css', 'http://example.com/img/img.png', 'http://example.com/img/img.png');
		mytest('x/y/a.css', 'b.css', 'http://example.com/img/img.png', 'http://example.com/img/img.png');
		mytest('x/y/a.css', 't/u/b.css', 'http://example.com/img/img.png', 'http://example.com/img/img.png');
		mytest('x/y/a.css', 'x/u/b.css', 'http://example.com/img/img.png', 'http://example.com/img/img.png');
		mytest('x/y/a.css', 'x/y/b.css', 'http://example.com/img/img.png', 'http://example.com/img/img.png');
		mytest('/a.css', 'b.css', 'http://example.com/img/img.png', 'http://example.com/img/img.png');
		mytest('/a.css', 'x/b.css', 'http://example.com/img/img.png', 'http://example.com/img/img.png');
		mytest('/a.css', 'x/y/b.css', 'http://example.com/img/img.png', 'http://example.com/img/img.png');
		mytest('/x/a.css', 'b.css', 'http://example.com/img/img.png', 'http://example.com/img/img.png');
		mytest('/x/a.css', 'x/b.css', 'http://example.com/img/img.png', 'http://example.com/img/img.png');
		mytest('/x/a.css', 'x/y/b.css', 'http://example.com/img/img.png', 'http://example.com/img/img.png');
		mytest('/x/y/a.css', 'b.css', 'http://example.com/img/img.png', 'http://example.com/img/img.png');
		mytest('/x/y/a.css', 'x/b.css', 'http://example.com/img/img.png', 'http://example.com/img/img.png');
		mytest('/x/y/a.css', 'x/y/b.css', 'http://example.com/img/img.png', 'http://example.com/img/img.png');
		mytest('/a.css', '/b.css', 'http://example.com/img/img.png', 'http://example.com/img/img.png');
		mytest('/a.css', '/b.css', 'http://example.com/img/img.png', 'http://example.com/img/img.png');
		mytest('/x/a.css', '/b.css', 'http://example.com/img/img.png', 'http://example.com/img/img.png');
		mytest('/x/a.css', '/x/b.css', 'http://example.com/img/img.png', 'http://example.com/img/img.png');
		mytest('http://www.example.com/x/y/a.css', 'b.css', 'http://example.com/img/img.png', 'http://example.com/img/img.png');
		mytest('http://www.example.com/x/y/a.css', 'http://www.example.com/x/y/b.css', 'http://example.com/img/img.png', 'http://example.com/img/img.png');
		mytest('https://www.example.com/x/y/a.css', 'b.css', 'http://example.com/img/img.png', 'http://example.com/img/img.png');


	});

	test('Utilities.rewriteUrls - quotes and spaces', () => {
		assert.strictEqual(rewriteUrls('x/y/a.css', 't/u/b.css', 'sel { background:url(\'../img/img.png\'); }'), 'sel { background:url(../../x/img/img.png); }');
		assert.strictEqual(rewriteUrls('x/y/a.css', 't/u/b.css', 'sel { background:url(\t\'../img/img.png\'); }'), 'sel { background:url(../../x/img/img.png); }');
		assert.strictEqual(rewriteUrls('x/y/a.css', 't/u/b.css', 'sel { background:url( \'../img/img.png\'); }'), 'sel { background:url(../../x/img/img.png); }');
		assert.strictEqual(rewriteUrls('x/y/a.css', 't/u/b.css', 'sel { background:url(\'../img/img.png\'\t); }'), 'sel { background:url(../../x/img/img.png); }');
		assert.strictEqual(rewriteUrls('x/y/a.css', 't/u/b.css', 'sel { background:url(\'../img/img.png\' ); }'), 'sel { background:url(../../x/img/img.png); }');
		assert.strictEqual(rewriteUrls('x/y/a.css', 't/u/b.css', 'sel { background:url(   \t   \'../img/img.png\'     \t); }'), 'sel { background:url(../../x/img/img.png); }');
	});

	test('Bug 9601 - css should ignore data urls', () => {
		const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAACHmlUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iWE1QIENvcmUgNC40LjAiPgogICA8cmRmOlJERiB4bWxuczpyZGY9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkvMDIvMjItcmRmLXN5bnRheC1ucyMiPgogICAgICA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIgogICAgICAgICAgICB4bWxuczpkYz0iaHR0cDovL3B1cmwub3JnL2RjL2VsZW1lbnRzLzEuMS8iPgogICAgICAgICA8ZGM6c3ViamVjdD4KICAgICAgICAgICAgPHJkZjpCYWcvPgogICAgICAgICA8L2RjOnN1YmplY3Q+CiAgICAgIDwvcmRmOkRlc2NyaXB0aW9uPgogICAgICA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIgogICAgICAgICAgICB4bWxuczp4bXA9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC8iPgogICAgICAgICA8eG1wOkNyZWF0b3JUb29sPkFkb2JlIEltYWdlUmVhZHk8L3htcDpDcmVhdG9yVG9vbD4KICAgICAgPC9yZGY6RGVzY3JpcHRpb24+CiAgIDwvcmRmOlJERj4KPC94OnhtcG1ldGE+ClC8oVQAAAGnSURBVDiNrZMxTxNxGMZ///9dZWns9a4dTHSABFiuCU5dGt2d9BsQls6GD2LCd2AiQQfixKIJE0ObdKIUSvDa5uLZihP0Sh+HOw3ipOUZ3zzvL2+e932NJBaRe7/Q8Uw5eMRrzXllDU8A5mJkLB+/TflQ+67JXb+5O0FUNS9deLckns/tn2A7hxtDawZvn37Vp78AX8rmxZLDewf89HGJ+fgKCrkrBeuXKPy44hbGN7e8eTbRZwALcFE2nuOy48j6zmaTYP8Qtxaia9A1uLWQYP8QZ7OJI+s7LjsXZeMBIIlLn61xgEbLnqadtiQp7Z0orq8rrq8r7Z1IkqadtkbLnsYBuvTZkpQBhgF7SRVFJRQ3QqW9bgY5P1V6fpoDu4oboaISSqpoGLD3GzAIOEqqaFBBURHF9TWlZxlEktKzruL6mqJi5kmqaBBwJIl7Wf+7LICBIYBSKGyE+LsHuCurzPo9Zv0e7soq/u4BhY0Qpfn68p6HCbHv4Q0qtBPfarLd1LR1nAVWzDNphJq2jjXZbirxrQYV2n0PT9Lih/Rwp/xLCz3T/+gnd2VVRJs/vngAAAAASUVORK5CYII=';

		function mytest(originalFile: string, newFile: string) {
			assert.strictEqual(rewriteUrls(originalFile, newFile, 'sel { background:url(' + dataUrl + '); }'), 'sel { background:url(' + dataUrl + '); }');
			assert.strictEqual(rewriteUrls(originalFile, newFile, 'sel { background:url( \t' + dataUrl + '\t ); }'), 'sel { background:url(' + dataUrl + '); }');
		}

		mytest('a.css', 'b.css');
		mytest('a.css', 't/b.css');
		mytest('a.css', 'x/y/b.css');
		mytest('x/a.css', 'b.css');
		mytest('x/y/a.css', 'b.css');
		mytest('x/y/a.css', 't/u/b.css');
		mytest('x/y/a.css', 'x/u/b.css');
		mytest('x/y/a.css', 'x/y/b.css');
		mytest('/a.css', 'b.css');
		mytest('/a.css', 'x/b.css');
		mytest('/a.css', 'x/y/b.css');
		mytest('/x/a.css', 'b.css');
		mytest('/x/a.css', 'x/b.css');
		mytest('/x/a.css', 'x/y/b.css');
		mytest('/x/y/a.css', 'b.css');
		mytest('/x/y/a.css', 'x/b.css');
		mytest('/x/y/a.css', 'x/y/b.css');
		mytest('/a.css', '/b.css');
		mytest('/a.css', '/b.css');
		mytest('/x/a.css', '/b.css');
		mytest('/x/a.css', '/x/b.css');
		mytest('http://www.example.com/x/y/a.css', 'b.css');
		mytest('http://www.example.com/x/y/a.css', 'http://www.example.com/x/y/b.css');
		mytest('https://www.example.com/x/y/a.css', 'b.css');
	});
});
