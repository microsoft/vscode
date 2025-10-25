/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { toSlashes } from '../../common/extpath.js';
import { posix, win32 } from '../../common/path.js';
import { isWindows } from '../../common/platform.js';
import { addTrailingPathSeparator, basename, dirname, distinctParents, extUri, extUriIgnorePathCase, hasTrailingPathSeparator, isAbsolutePath, joinPath, normalizePath, relativePath, removeTrailingPathSeparator, resolvePath } from '../../common/resources.js';
import { URI } from '../../common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';


suite('Resources', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('distinctParents', () => {

		// Basic
		let resources = [
			URI.file('/some/folderA/file.txt'),
			URI.file('/some/folderB/file.txt'),
			URI.file('/some/folderC/file.txt')
		];

		let distinct = distinctParents(resources, r => r);
		assert.strictEqual(distinct.length, 3);
		assert.strictEqual(distinct[0].toString(), resources[0].toString());
		assert.strictEqual(distinct[1].toString(), resources[1].toString());
		assert.strictEqual(distinct[2].toString(), resources[2].toString());

		// Parent / Child
		resources = [
			URI.file('/some/folderA'),
			URI.file('/some/folderA/file.txt'),
			URI.file('/some/folderA/child/file.txt'),
			URI.file('/some/folderA2/file.txt'),
			URI.file('/some/file.txt')
		];

		distinct = distinctParents(resources, r => r);
		assert.strictEqual(distinct.length, 3);
		assert.strictEqual(distinct[0].toString(), resources[0].toString());
		assert.strictEqual(distinct[1].toString(), resources[3].toString());
		assert.strictEqual(distinct[2].toString(), resources[4].toString());
	});

	test('dirname', () => {
		if (isWindows) {
			assert.strictEqual(dirname(URI.file('c:\\some\\file\\test.txt')).toString(), 'file:///c%3A/some/file');
			assert.strictEqual(dirname(URI.file('c:\\some\\file')).toString(), 'file:///c%3A/some');
			assert.strictEqual(dirname(URI.file('c:\\some\\file\\')).toString(), 'file:///c%3A/some');
			assert.strictEqual(dirname(URI.file('c:\\some')).toString(), 'file:///c%3A/');
			assert.strictEqual(dirname(URI.file('C:\\some')).toString(), 'file:///c%3A/');
			assert.strictEqual(dirname(URI.file('c:\\')).toString(), 'file:///c%3A/');
		} else {
			assert.strictEqual(dirname(URI.file('/some/file/test.txt')).toString(), 'file:///some/file');
			assert.strictEqual(dirname(URI.file('/some/file/')).toString(), 'file:///some');
			assert.strictEqual(dirname(URI.file('/some/file')).toString(), 'file:///some');
		}
		assert.strictEqual(dirname(URI.parse('foo://a/some/file/test.txt')).toString(), 'foo://a/some/file');
		assert.strictEqual(dirname(URI.parse('foo://a/some/file/')).toString(), 'foo://a/some');
		assert.strictEqual(dirname(URI.parse('foo://a/some/file')).toString(), 'foo://a/some');
		assert.strictEqual(dirname(URI.parse('foo://a/some')).toString(), 'foo://a/');
		assert.strictEqual(dirname(URI.parse('foo://a/')).toString(), 'foo://a/');
		assert.strictEqual(dirname(URI.parse('foo://a')).toString(), 'foo://a');

		// does not explode (https://github.com/microsoft/vscode/issues/41987)
		dirname(URI.from({ scheme: 'file', authority: '/users/someone/portal.h' }));

		assert.strictEqual(dirname(URI.parse('foo://a/b/c?q')).toString(), 'foo://a/b?q');
	});

	test('basename', () => {
		if (isWindows) {
			assert.strictEqual(basename(URI.file('c:\\some\\file\\test.txt')), 'test.txt');
			assert.strictEqual(basename(URI.file('c:\\some\\file')), 'file');
			assert.strictEqual(basename(URI.file('c:\\some\\file\\')), 'file');
			assert.strictEqual(basename(URI.file('C:\\some\\file\\')), 'file');
		} else {
			assert.strictEqual(basename(URI.file('/some/file/test.txt')), 'test.txt');
			assert.strictEqual(basename(URI.file('/some/file/')), 'file');
			assert.strictEqual(basename(URI.file('/some/file')), 'file');
			assert.strictEqual(basename(URI.file('/some')), 'some');
		}
		assert.strictEqual(basename(URI.parse('foo://a/some/file/test.txt')), 'test.txt');
		assert.strictEqual(basename(URI.parse('foo://a/some/file/')), 'file');
		assert.strictEqual(basename(URI.parse('foo://a/some/file')), 'file');
		assert.strictEqual(basename(URI.parse('foo://a/some')), 'some');
		assert.strictEqual(basename(URI.parse('foo://a/')), '');
		assert.strictEqual(basename(URI.parse('foo://a')), '');
	});

	test('joinPath', () => {
		if (isWindows) {
			assert.strictEqual(joinPath(URI.file('c:\\foo\\bar'), '/file.js').toString(), 'file:///c%3A/foo/bar/file.js');
			assert.strictEqual(joinPath(URI.file('c:\\foo\\bar\\'), 'file.js').toString(), 'file:///c%3A/foo/bar/file.js');
			assert.strictEqual(joinPath(URI.file('c:\\foo\\bar\\'), '/file.js').toString(), 'file:///c%3A/foo/bar/file.js');
			assert.strictEqual(joinPath(URI.file('c:\\'), '/file.js').toString(), 'file:///c%3A/file.js');
			assert.strictEqual(joinPath(URI.file('c:\\'), 'bar/file.js').toString(), 'file:///c%3A/bar/file.js');
			assert.strictEqual(joinPath(URI.file('c:\\foo'), './file.js').toString(), 'file:///c%3A/foo/file.js');
			assert.strictEqual(joinPath(URI.file('c:\\foo'), '/./file.js').toString(), 'file:///c%3A/foo/file.js');
			assert.strictEqual(joinPath(URI.file('C:\\foo'), '../file.js').toString(), 'file:///c%3A/file.js');
			assert.strictEqual(joinPath(URI.file('C:\\foo\\.'), '../file.js').toString(), 'file:///c%3A/file.js');
		} else {
			assert.strictEqual(joinPath(URI.file('/foo/bar'), '/file.js').toString(), 'file:///foo/bar/file.js');
			assert.strictEqual(joinPath(URI.file('/foo/bar'), 'file.js').toString(), 'file:///foo/bar/file.js');
			assert.strictEqual(joinPath(URI.file('/foo/bar/'), '/file.js').toString(), 'file:///foo/bar/file.js');
			assert.strictEqual(joinPath(URI.file('/'), '/file.js').toString(), 'file:///file.js');
			assert.strictEqual(joinPath(URI.file('/foo/bar'), './file.js').toString(), 'file:///foo/bar/file.js');
			assert.strictEqual(joinPath(URI.file('/foo/bar'), '/./file.js').toString(), 'file:///foo/bar/file.js');
			assert.strictEqual(joinPath(URI.file('/foo/bar'), '../file.js').toString(), 'file:///foo/file.js');
		}
		assert.strictEqual(joinPath(URI.parse('foo://a/foo/bar')).toString(), 'foo://a/foo/bar');
		assert.strictEqual(joinPath(URI.parse('foo://a/foo/bar'), '/file.js').toString(), 'foo://a/foo/bar/file.js');
		assert.strictEqual(joinPath(URI.parse('foo://a/foo/bar'), 'file.js').toString(), 'foo://a/foo/bar/file.js');
		assert.strictEqual(joinPath(URI.parse('foo://a/foo/bar/'), '/file.js').toString(), 'foo://a/foo/bar/file.js');
		assert.strictEqual(joinPath(URI.parse('foo://a/'), '/file.js').toString(), 'foo://a/file.js');
		assert.strictEqual(joinPath(URI.parse('foo://a/foo/bar/'), './file.js').toString(), 'foo://a/foo/bar/file.js');
		assert.strictEqual(joinPath(URI.parse('foo://a/foo/bar/'), '/./file.js').toString(), 'foo://a/foo/bar/file.js');
		assert.strictEqual(joinPath(URI.parse('foo://a/foo/bar/'), '../file.js').toString(), 'foo://a/foo/file.js');

		assert.strictEqual(
			joinPath(URI.from({ scheme: 'myScheme', authority: 'authority', path: '/path', query: 'query', fragment: 'fragment' }), '/file.js').toString(),
			'myScheme://authority/path/file.js?query#fragment');
	});

	test('normalizePath', () => {
		if (isWindows) {
			assert.strictEqual(normalizePath(URI.file('c:\\foo\\.\\bar')).toString(), 'file:///c%3A/foo/bar');
			assert.strictEqual(normalizePath(URI.file('c:\\foo\\.')).toString(), 'file:///c%3A/foo');
			assert.strictEqual(normalizePath(URI.file('c:\\foo\\.\\')).toString(), 'file:///c%3A/foo/');
			assert.strictEqual(normalizePath(URI.file('c:\\foo\\..')).toString(), 'file:///c%3A/');
			assert.strictEqual(normalizePath(URI.file('c:\\foo\\..\\bar')).toString(), 'file:///c%3A/bar');
			assert.strictEqual(normalizePath(URI.file('c:\\foo\\..\\..\\bar')).toString(), 'file:///c%3A/bar');
			assert.strictEqual(normalizePath(URI.file('c:\\foo\\foo\\..\\..\\bar')).toString(), 'file:///c%3A/bar');
			assert.strictEqual(normalizePath(URI.file('C:\\foo\\foo\\.\\..\\..\\bar')).toString(), 'file:///c%3A/bar');
			assert.strictEqual(normalizePath(URI.file('C:\\foo\\foo\\.\\..\\some\\..\\bar')).toString(), 'file:///c%3A/foo/bar');
		} else {
			assert.strictEqual(normalizePath(URI.file('/foo/./bar')).toString(), 'file:///foo/bar');
			assert.strictEqual(normalizePath(URI.file('/foo/.')).toString(), 'file:///foo');
			assert.strictEqual(normalizePath(URI.file('/foo/./')).toString(), 'file:///foo/');
			assert.strictEqual(normalizePath(URI.file('/foo/..')).toString(), 'file:///');
			assert.strictEqual(normalizePath(URI.file('/foo/../bar')).toString(), 'file:///bar');
			assert.strictEqual(normalizePath(URI.file('/foo/../../bar')).toString(), 'file:///bar');
			assert.strictEqual(normalizePath(URI.file('/foo/foo/../../bar')).toString(), 'file:///bar');
			assert.strictEqual(normalizePath(URI.file('/foo/foo/./../../bar')).toString(), 'file:///bar');
			assert.strictEqual(normalizePath(URI.file('/foo/foo/./../some/../bar')).toString(), 'file:///foo/bar');
			assert.strictEqual(normalizePath(URI.file('/f')).toString(), 'file:///f');
		}
		assert.strictEqual(normalizePath(URI.parse('foo://a/foo/./bar')).toString(), 'foo://a/foo/bar');
		assert.strictEqual(normalizePath(URI.parse('foo://a/foo/.')).toString(), 'foo://a/foo');
		assert.strictEqual(normalizePath(URI.parse('foo://a/foo/./')).toString(), 'foo://a/foo/');
		assert.strictEqual(normalizePath(URI.parse('foo://a/foo/..')).toString(), 'foo://a/');
		assert.strictEqual(normalizePath(URI.parse('foo://a/foo/../bar')).toString(), 'foo://a/bar');
		assert.strictEqual(normalizePath(URI.parse('foo://a/foo/../../bar')).toString(), 'foo://a/bar');
		assert.strictEqual(normalizePath(URI.parse('foo://a/foo/foo/../../bar')).toString(), 'foo://a/bar');
		assert.strictEqual(normalizePath(URI.parse('foo://a/foo/foo/./../../bar')).toString(), 'foo://a/bar');
		assert.strictEqual(normalizePath(URI.parse('foo://a/foo/foo/./../some/../bar')).toString(), 'foo://a/foo/bar');
		assert.strictEqual(normalizePath(URI.parse('foo://a')).toString(), 'foo://a');
		assert.strictEqual(normalizePath(URI.parse('foo://a/')).toString(), 'foo://a/');
		assert.strictEqual(normalizePath(URI.parse('foo://a/foo/./bar?q=1')).toString(), URI.parse('foo://a/foo/bar?q%3D1').toString());
	});

	test('isAbsolute', () => {
		if (isWindows) {
			assert.strictEqual(isAbsolutePath(URI.file('c:\\foo\\')), true);
			assert.strictEqual(isAbsolutePath(URI.file('C:\\foo\\')), true);
			assert.strictEqual(isAbsolutePath(URI.file('bar')), true); // URI normalizes all file URIs to be absolute
		} else {
			assert.strictEqual(isAbsolutePath(URI.file('/foo/bar')), true);
			assert.strictEqual(isAbsolutePath(URI.file('bar')), true); // URI normalizes all file URIs to be absolute
		}
		assert.strictEqual(isAbsolutePath(URI.parse('foo:foo')), false);
		assert.strictEqual(isAbsolutePath(URI.parse('foo://a/foo/.')), true);
	});

	function assertTrailingSeparator(u1: URI, expected: boolean) {
		assert.strictEqual(hasTrailingPathSeparator(u1), expected, u1.toString());
	}

	function assertRemoveTrailingSeparator(u1: URI, expected: URI) {
		assertEqualURI(removeTrailingPathSeparator(u1), expected, u1.toString());
	}

	function assertAddTrailingSeparator(u1: URI, expected: URI) {
		assertEqualURI(addTrailingPathSeparator(u1), expected, u1.toString());
	}

	test('trailingPathSeparator', () => {
		assertTrailingSeparator(URI.parse('foo://a/foo'), false);
		assertTrailingSeparator(URI.parse('foo://a/foo/'), true);
		assertTrailingSeparator(URI.parse('foo://a/'), false);
		assertTrailingSeparator(URI.parse('foo://a'), false);

		assertRemoveTrailingSeparator(URI.parse('foo://a/foo'), URI.parse('foo://a/foo'));
		assertRemoveTrailingSeparator(URI.parse('foo://a/foo/'), URI.parse('foo://a/foo'));
		assertRemoveTrailingSeparator(URI.parse('foo://a/'), URI.parse('foo://a/'));
		assertRemoveTrailingSeparator(URI.parse('foo://a'), URI.parse('foo://a'));

		assertAddTrailingSeparator(URI.parse('foo://a/foo'), URI.parse('foo://a/foo/'));
		assertAddTrailingSeparator(URI.parse('foo://a/foo/'), URI.parse('foo://a/foo/'));
		assertAddTrailingSeparator(URI.parse('foo://a/'), URI.parse('foo://a/'));
		assertAddTrailingSeparator(URI.parse('foo://a'), URI.parse('foo://a/'));

		if (isWindows) {
			assertTrailingSeparator(URI.file('c:\\a\\foo'), false);
			assertTrailingSeparator(URI.file('c:\\a\\foo\\'), true);
			assertTrailingSeparator(URI.file('c:\\'), false);
			assertTrailingSeparator(URI.file('\\\\server\\share\\some\\'), true);
			assertTrailingSeparator(URI.file('\\\\server\\share\\'), false);

			assertRemoveTrailingSeparator(URI.file('c:\\a\\foo'), URI.file('c:\\a\\foo'));
			assertRemoveTrailingSeparator(URI.file('c:\\a\\foo\\'), URI.file('c:\\a\\foo'));
			assertRemoveTrailingSeparator(URI.file('c:\\'), URI.file('c:\\'));
			assertRemoveTrailingSeparator(URI.file('\\\\server\\share\\some\\'), URI.file('\\\\server\\share\\some'));
			assertRemoveTrailingSeparator(URI.file('\\\\server\\share\\'), URI.file('\\\\server\\share\\'));

			assertAddTrailingSeparator(URI.file('c:\\a\\foo'), URI.file('c:\\a\\foo\\'));
			assertAddTrailingSeparator(URI.file('c:\\a\\foo\\'), URI.file('c:\\a\\foo\\'));
			assertAddTrailingSeparator(URI.file('c:\\'), URI.file('c:\\'));
			assertAddTrailingSeparator(URI.file('\\\\server\\share\\some'), URI.file('\\\\server\\share\\some\\'));
			assertAddTrailingSeparator(URI.file('\\\\server\\share\\some\\'), URI.file('\\\\server\\share\\some\\'));
		} else {
			assertTrailingSeparator(URI.file('/foo/bar'), false);
			assertTrailingSeparator(URI.file('/foo/bar/'), true);
			assertTrailingSeparator(URI.file('/'), false);

			assertRemoveTrailingSeparator(URI.file('/foo/bar'), URI.file('/foo/bar'));
			assertRemoveTrailingSeparator(URI.file('/foo/bar/'), URI.file('/foo/bar'));
			assertRemoveTrailingSeparator(URI.file('/'), URI.file('/'));

			assertAddTrailingSeparator(URI.file('/foo/bar'), URI.file('/foo/bar/'));
			assertAddTrailingSeparator(URI.file('/foo/bar/'), URI.file('/foo/bar/'));
			assertAddTrailingSeparator(URI.file('/'), URI.file('/'));
		}
	});

	function assertEqualURI(actual: URI, expected: URI, message?: string, ignoreCase?: boolean) {
		const util = ignoreCase ? extUriIgnorePathCase : extUri;
		if (!util.isEqual(expected, actual)) {
			assert.strictEqual(actual.toString(), expected.toString(), message);
		}
	}

	function assertRelativePath(u1: URI, u2: URI, expectedPath: string | undefined, ignoreJoin?: boolean, ignoreCase?: boolean) {
		const util = ignoreCase ? extUriIgnorePathCase : extUri;

		assert.strictEqual(util.relativePath(u1, u2), expectedPath, `from ${u1.toString()} to ${u2.toString()}`);
		if (expectedPath !== undefined && !ignoreJoin) {
			assertEqualURI(removeTrailingPathSeparator(joinPath(u1, expectedPath)), removeTrailingPathSeparator(u2), 'joinPath on relativePath should be equal', ignoreCase);
		}
	}

	test('relativePath', () => {
		assertRelativePath(URI.parse('foo://a/foo'), URI.parse('foo://a/foo/bar'), 'bar');
		assertRelativePath(URI.parse('foo://a/foo'), URI.parse('foo://a/foo/bar/'), 'bar');
		assertRelativePath(URI.parse('foo://a/foo'), URI.parse('foo://a/foo/bar/goo'), 'bar/goo');
		assertRelativePath(URI.parse('foo://a/'), URI.parse('foo://a/foo/bar/goo'), 'foo/bar/goo');
		assertRelativePath(URI.parse('foo://a/foo/xoo'), URI.parse('foo://a/foo/bar'), '../bar');
		assertRelativePath(URI.parse('foo://a/foo/xoo/yoo'), URI.parse('foo://a'), '../../..', true);
		assertRelativePath(URI.parse('foo://a/foo'), URI.parse('foo://a/foo/'), '');
		assertRelativePath(URI.parse('foo://a/foo/'), URI.parse('foo://a/foo'), '');
		assertRelativePath(URI.parse('foo://a/foo/'), URI.parse('foo://a/foo/'), '');
		assertRelativePath(URI.parse('foo://a/foo'), URI.parse('foo://a/foo'), '');
		assertRelativePath(URI.parse('foo://a'), URI.parse('foo://a'), '', true);
		assertRelativePath(URI.parse('foo://a/'), URI.parse('foo://a/'), '');
		assertRelativePath(URI.parse('foo://a/'), URI.parse('foo://a'), '', true);
		assertRelativePath(URI.parse('foo://a/foo?q'), URI.parse('foo://a/foo/bar#h'), 'bar', true);
		assertRelativePath(URI.parse('foo://'), URI.parse('foo://a/b'), undefined);
		assertRelativePath(URI.parse('foo://a2/b'), URI.parse('foo://a/b'), undefined);
		assertRelativePath(URI.parse('goo://a/b'), URI.parse('foo://a/b'), undefined);

		assertRelativePath(URI.parse('foo://a/foo'), URI.parse('foo://A/FOO/bar/goo'), 'bar/goo', false, true);
		assertRelativePath(URI.parse('foo://a/foo'), URI.parse('foo://A/FOO/BAR/GOO'), 'BAR/GOO', false, true);
		assertRelativePath(URI.parse('foo://a/foo/xoo'), URI.parse('foo://A/FOO/BAR/GOO'), '../BAR/GOO', false, true);
		assertRelativePath(URI.parse('foo:///c:/a/foo'), URI.parse('foo:///C:/a/foo/xoo/'), 'xoo', false, true);

		if (isWindows) {
			assertRelativePath(URI.file('c:\\foo\\bar'), URI.file('c:\\foo\\bar'), '');
			assertRelativePath(URI.file('c:\\foo\\bar\\huu'), URI.file('c:\\foo\\bar'), '..');
			assertRelativePath(URI.file('c:\\foo\\bar\\a1\\a2'), URI.file('c:\\foo\\bar'), '../..');
			assertRelativePath(URI.file('c:\\foo\\bar\\'), URI.file('c:\\foo\\bar\\a1\\a2'), 'a1/a2');
			assertRelativePath(URI.file('c:\\foo\\bar\\'), URI.file('c:\\foo\\bar\\a1\\a2\\'), 'a1/a2');
			assertRelativePath(URI.file('c:\\'), URI.file('c:\\foo\\bar'), 'foo/bar');
			assertRelativePath(URI.file('\\\\server\\share\\some\\'), URI.file('\\\\server\\share\\some\\path'), 'path');
			assertRelativePath(URI.file('\\\\server\\share\\some\\'), URI.file('\\\\server\\share2\\some\\path'), '../../share2/some/path', true); // ignore joinPath assert: path.join is not root aware
		} else {
			assertRelativePath(URI.file('/a/foo'), URI.file('/a/foo/bar'), 'bar');
			assertRelativePath(URI.file('/a/foo'), URI.file('/a/foo/bar/'), 'bar');
			assertRelativePath(URI.file('/a/foo'), URI.file('/a/foo/bar/goo'), 'bar/goo');
			assertRelativePath(URI.file('/a/'), URI.file('/a/foo/bar/goo'), 'foo/bar/goo');
			assertRelativePath(URI.file('/'), URI.file('/a/foo/bar/goo'), 'a/foo/bar/goo');
			assertRelativePath(URI.file('/a/foo/xoo'), URI.file('/a/foo/bar'), '../bar');
			assertRelativePath(URI.file('/a/foo/xoo/yoo'), URI.file('/a'), '../../..');
			assertRelativePath(URI.file('/a/foo'), URI.file('/a/foo/'), '');
			assertRelativePath(URI.file('/a/foo'), URI.file('/b/foo/'), '../../b/foo');
		}
	});

	function assertResolve(u1: URI, path: string, expected: URI) {
		const actual = resolvePath(u1, path);
		assertEqualURI(actual, expected, `from ${u1.toString()} and ${path}`);

		const p = path.indexOf('/') !== -1 ? posix : win32;
		if (!p.isAbsolute(path)) {
			let expectedPath = isWindows ? toSlashes(path) : path;
			expectedPath = expectedPath.startsWith('./') ? expectedPath.substr(2) : expectedPath;
			assert.strictEqual(relativePath(u1, actual), expectedPath, `relativePath (${u1.toString()}) on actual (${actual.toString()}) should be to path (${expectedPath})`);
		}
	}

	test('resolve', () => {
		if (isWindows) {
			assertResolve(URI.file('c:\\foo\\bar'), 'file.js', URI.file('c:\\foo\\bar\\file.js'));
			assertResolve(URI.file('c:\\foo\\bar'), 't\\file.js', URI.file('c:\\foo\\bar\\t\\file.js'));
			assertResolve(URI.file('c:\\foo\\bar'), '.\\t\\file.js', URI.file('c:\\foo\\bar\\t\\file.js'));
			assertResolve(URI.file('c:\\foo\\bar'), 'a1/file.js', URI.file('c:\\foo\\bar\\a1\\file.js'));
			assertResolve(URI.file('c:\\foo\\bar'), './a1/file.js', URI.file('c:\\foo\\bar\\a1\\file.js'));
			assertResolve(URI.file('c:\\foo\\bar'), '\\b1\\file.js', URI.file('c:\\b1\\file.js'));
			assertResolve(URI.file('c:\\foo\\bar'), '/b1/file.js', URI.file('c:\\b1\\file.js'));
			assertResolve(URI.file('c:\\foo\\bar\\'), 'file.js', URI.file('c:\\foo\\bar\\file.js'));

			assertResolve(URI.file('c:\\'), 'file.js', URI.file('c:\\file.js'));
			assertResolve(URI.file('c:\\'), '\\b1\\file.js', URI.file('c:\\b1\\file.js'));
			assertResolve(URI.file('c:\\'), '/b1/file.js', URI.file('c:\\b1\\file.js'));
			assertResolve(URI.file('c:\\'), 'd:\\foo\\bar.txt', URI.file('d:\\foo\\bar.txt'));

			assertResolve(URI.file('\\\\server\\share\\some\\'), 'b1\\file.js', URI.file('\\\\server\\share\\some\\b1\\file.js'));
			assertResolve(URI.file('\\\\server\\share\\some\\'), '\\file.js', URI.file('\\\\server\\share\\file.js'));

			assertResolve(URI.file('c:\\'), '\\\\server\\share\\some\\', URI.file('\\\\server\\share\\some'));
			assertResolve(URI.file('\\\\server\\share\\some\\'), 'c:\\', URI.file('c:\\'));
		} else {
			assertResolve(URI.file('/foo/bar'), 'file.js', URI.file('/foo/bar/file.js'));
			assertResolve(URI.file('/foo/bar'), './file.js', URI.file('/foo/bar/file.js'));
			assertResolve(URI.file('/foo/bar'), '/file.js', URI.file('/file.js'));
			assertResolve(URI.file('/foo/bar/'), 'file.js', URI.file('/foo/bar/file.js'));
			assertResolve(URI.file('/'), 'file.js', URI.file('/file.js'));
			assertResolve(URI.file(''), './file.js', URI.file('/file.js'));
			assertResolve(URI.file(''), '/file.js', URI.file('/file.js'));
		}

		assertResolve(URI.parse('foo://server/foo/bar'), 'file.js', URI.parse('foo://server/foo/bar/file.js'));
		assertResolve(URI.parse('foo://server/foo/bar'), './file.js', URI.parse('foo://server/foo/bar/file.js'));
		assertResolve(URI.parse('foo://server/foo/bar'), './file.js', URI.parse('foo://server/foo/bar/file.js'));
		assertResolve(URI.parse('foo://server/foo/bar'), 'c:\\a1\\b1', URI.parse('foo://server/c:/a1/b1'));
		assertResolve(URI.parse('foo://server/foo/bar'), 'c:\\', URI.parse('foo://server/c:'));


	});

	function assertIsEqual(u1: URI, u2: URI, ignoreCase: boolean | undefined, expected: boolean) {

		const util = ignoreCase ? extUriIgnorePathCase : extUri;

		assert.strictEqual(util.isEqual(u1, u2), expected, `${u1.toString()}${expected ? '===' : '!=='}${u2.toString()}`);
		assert.strictEqual(util.compare(u1, u2) === 0, expected);
		assert.strictEqual(util.getComparisonKey(u1) === util.getComparisonKey(u2), expected, `comparison keys ${u1.toString()}, ${u2.toString()}`);
		assert.strictEqual(util.isEqualOrParent(u1, u2), expected, `isEqualOrParent ${u1.toString()}, ${u2.toString()}`);
		if (!ignoreCase) {
			assert.strictEqual(u1.toString() === u2.toString(), expected);
		}
	}


	test('isEqual', () => {
		const fileURI = isWindows ? URI.file('c:\\foo\\bar') : URI.file('/foo/bar');
		const fileURI2 = isWindows ? URI.file('C:\\foo\\Bar') : URI.file('/foo/Bar');
		assertIsEqual(fileURI, fileURI, true, true);
		assertIsEqual(fileURI, fileURI, false, true);
		assertIsEqual(fileURI, fileURI, undefined, true);
		assertIsEqual(fileURI, fileURI2, true, true);
		assertIsEqual(fileURI, fileURI2, false, false);

		const fileURI3 = URI.parse('foo://server:453/foo/bar');
		const fileURI4 = URI.parse('foo://server:453/foo/Bar');
		assertIsEqual(fileURI3, fileURI3, true, true);
		assertIsEqual(fileURI3, fileURI3, false, true);
		assertIsEqual(fileURI3, fileURI3, undefined, true);
		assertIsEqual(fileURI3, fileURI4, true, true);
		assertIsEqual(fileURI3, fileURI4, false, false);

		assertIsEqual(fileURI, fileURI3, true, false);

		assertIsEqual(URI.parse('file://server'), URI.parse('file://server/'), true, true);
		assertIsEqual(URI.parse('http://server'), URI.parse('http://server/'), true, true);
		assertIsEqual(URI.parse('foo://server'), URI.parse('foo://server/'), true, false); // only selected scheme have / as the default path
		assertIsEqual(URI.parse('foo://server/foo'), URI.parse('foo://server/foo/'), true, false);
		assertIsEqual(URI.parse('foo://server/foo'), URI.parse('foo://server/foo?'), true, true);

		const fileURI5 = URI.parse('foo://server:453/foo/bar?q=1');
		const fileURI6 = URI.parse('foo://server:453/foo/bar#xy');

		assertIsEqual(fileURI5, fileURI5, true, true);
		assertIsEqual(fileURI5, fileURI3, true, false);
		assertIsEqual(fileURI6, fileURI6, true, true);
		assertIsEqual(fileURI6, fileURI5, true, false);
		assertIsEqual(fileURI6, fileURI3, true, false);
	});

	test('isEqualOrParent', () => {

		const fileURI = isWindows ? URI.file('c:\\foo\\bar') : URI.file('/foo/bar');
		const fileURI2 = isWindows ? URI.file('c:\\foo') : URI.file('/foo');
		const fileURI2b = isWindows ? URI.file('C:\\Foo\\') : URI.file('/Foo/');
		assert.strictEqual(extUriIgnorePathCase.isEqualOrParent(fileURI, fileURI), true, '1');
		assert.strictEqual(extUri.isEqualOrParent(fileURI, fileURI), true, '2');
		assert.strictEqual(extUriIgnorePathCase.isEqualOrParent(fileURI, fileURI2), true, '3');
		assert.strictEqual(extUri.isEqualOrParent(fileURI, fileURI2), true, '4');
		assert.strictEqual(extUriIgnorePathCase.isEqualOrParent(fileURI, fileURI2b), true, '5');
		assert.strictEqual(extUri.isEqualOrParent(fileURI, fileURI2b), false, '6');

		assert.strictEqual(extUri.isEqualOrParent(fileURI2, fileURI), false, '7');
		assert.strictEqual(extUriIgnorePathCase.isEqualOrParent(fileURI2b, fileURI2), true, '8');

		const fileURI3 = URI.parse('foo://server:453/foo/bar/goo');
		const fileURI4 = URI.parse('foo://server:453/foo/');
		const fileURI5 = URI.parse('foo://server:453/foo');
		assert.strictEqual(extUriIgnorePathCase.isEqualOrParent(fileURI3, fileURI3, true), true, '11');
		assert.strictEqual(extUri.isEqualOrParent(fileURI3, fileURI3), true, '12');
		assert.strictEqual(extUriIgnorePathCase.isEqualOrParent(fileURI3, fileURI4, true), true, '13');
		assert.strictEqual(extUri.isEqualOrParent(fileURI3, fileURI4), true, '14');
		assert.strictEqual(extUriIgnorePathCase.isEqualOrParent(fileURI3, fileURI, true), false, '15');
		assert.strictEqual(extUriIgnorePathCase.isEqualOrParent(fileURI5, fileURI5, true), true, '16');

		const fileURI6 = URI.parse('foo://server:453/foo?q=1');
		const fileURI7 = URI.parse('foo://server:453/foo/bar?q=1');
		assert.strictEqual(extUriIgnorePathCase.isEqualOrParent(fileURI6, fileURI5), false, '17');
		assert.strictEqual(extUriIgnorePathCase.isEqualOrParent(fileURI6, fileURI6), true, '18');
		assert.strictEqual(extUriIgnorePathCase.isEqualOrParent(fileURI7, fileURI6), true, '19');
		assert.strictEqual(extUriIgnorePathCase.isEqualOrParent(fileURI7, fileURI5), false, '20');
	});
});
