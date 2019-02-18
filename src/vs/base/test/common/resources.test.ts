/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { dirname, basename, distinctParents, joinPath, isEqual, isEqualOrParent, hasToIgnoreCase, normalizePath, isAbsolutePath, isMalformedFileUri, relativePath, removeTrailingPathSeparator, hasTrailingPathSeparator } from 'vs/base/common/resources';
import { URI, setUriThrowOnMissingScheme } from 'vs/base/common/uri';
import { isWindows } from 'vs/base/common/platform';

suite('Resources', () => {

	test('distinctParents', () => {

		// Basic
		let resources = [
			URI.file('/some/folderA/file.txt'),
			URI.file('/some/folderB/file.txt'),
			URI.file('/some/folderC/file.txt')
		];

		let distinct = distinctParents(resources, r => r);
		assert.equal(distinct.length, 3);
		assert.equal(distinct[0].toString(), resources[0].toString());
		assert.equal(distinct[1].toString(), resources[1].toString());
		assert.equal(distinct[2].toString(), resources[2].toString());

		// Parent / Child
		resources = [
			URI.file('/some/folderA'),
			URI.file('/some/folderA/file.txt'),
			URI.file('/some/folderA/child/file.txt'),
			URI.file('/some/folderA2/file.txt'),
			URI.file('/some/file.txt')
		];

		distinct = distinctParents(resources, r => r);
		assert.equal(distinct.length, 3);
		assert.equal(distinct[0].toString(), resources[0].toString());
		assert.equal(distinct[1].toString(), resources[3].toString());
		assert.equal(distinct[2].toString(), resources[4].toString());
	});

	test('dirname', () => {
		if (isWindows) {
			assert.equal(dirname(URI.file('c:\\some\\file\\test.txt')).toString(), 'file:///c%3A/some/file');
			assert.equal(dirname(URI.file('c:\\some\\file')).toString(), 'file:///c%3A/some');
			assert.equal(dirname(URI.file('c:\\some\\file\\')).toString(), 'file:///c%3A/some');
			assert.equal(dirname(URI.file('c:\\some')).toString(), 'file:///c%3A/');
			assert.equal(dirname(URI.file('C:\\some')).toString(), 'file:///c%3A/');
			assert.equal(dirname(URI.file('c:\\')).toString(), 'file:///c%3A/');
		} else {
			assert.equal(dirname(URI.file('/some/file/test.txt')).toString(), 'file:///some/file');
			assert.equal(dirname(URI.file('/some/file/')).toString(), 'file:///some');
			assert.equal(dirname(URI.file('/some/file')).toString(), 'file:///some');
		}
		assert.equal(dirname(URI.parse('foo://a/some/file/test.txt')).toString(), 'foo://a/some/file');
		assert.equal(dirname(URI.parse('foo://a/some/file/')).toString(), 'foo://a/some');
		assert.equal(dirname(URI.parse('foo://a/some/file')).toString(), 'foo://a/some');
		assert.equal(dirname(URI.parse('foo://a/some')).toString(), 'foo://a/');
		assert.equal(dirname(URI.parse('foo://a/')).toString(), 'foo://a/');
		assert.equal(dirname(URI.parse('foo://a')).toString(), 'foo://a');

		// does not explode (https://github.com/Microsoft/vscode/issues/41987)
		dirname(URI.from({ scheme: 'file', authority: '/users/someone/portal.h' }));
	});

	test('basename', () => {
		if (isWindows) {
			assert.equal(basename(URI.file('c:\\some\\file\\test.txt')), 'test.txt');
			assert.equal(basename(URI.file('c:\\some\\file')), 'file');
			assert.equal(basename(URI.file('c:\\some\\file\\')), 'file');
			assert.equal(basename(URI.file('C:\\some\\file\\')), 'file');
		} else {
			assert.equal(basename(URI.file('/some/file/test.txt')), 'test.txt');
			assert.equal(basename(URI.file('/some/file/')), 'file');
			assert.equal(basename(URI.file('/some/file')), 'file');
			assert.equal(basename(URI.file('/some')), 'some');
		}
		assert.equal(basename(URI.parse('foo://a/some/file/test.txt')), 'test.txt');
		assert.equal(basename(URI.parse('foo://a/some/file/')), 'file');
		assert.equal(basename(URI.parse('foo://a/some/file')), 'file');
		assert.equal(basename(URI.parse('foo://a/some')), 'some');
		assert.equal(basename(URI.parse('foo://a/')), '');
		assert.equal(basename(URI.parse('foo://a')), '');
	});

	test('joinPath', () => {
		if (isWindows) {
			assert.equal(joinPath(URI.file('c:\\foo\\bar'), '/file.js').toString(), 'file:///c%3A/foo/bar/file.js');
			assert.equal(joinPath(URI.file('c:\\foo\\bar\\'), 'file.js').toString(), 'file:///c%3A/foo/bar/file.js');
			assert.equal(joinPath(URI.file('c:\\foo\\bar\\'), '/file.js').toString(), 'file:///c%3A/foo/bar/file.js');
			assert.equal(joinPath(URI.file('c:\\'), '/file.js').toString(), 'file:///c%3A/file.js');
			assert.equal(joinPath(URI.file('c:\\'), 'bar/file.js').toString(), 'file:///c%3A/bar/file.js');
			assert.equal(joinPath(URI.file('c:\\foo'), './file.js').toString(), 'file:///c%3A/foo/file.js');
			assert.equal(joinPath(URI.file('c:\\foo'), '/./file.js').toString(), 'file:///c%3A/foo/file.js');
			assert.equal(joinPath(URI.file('C:\\foo'), '../file.js').toString(), 'file:///c%3A/file.js');
			assert.equal(joinPath(URI.file('C:\\foo\\.'), '../file.js').toString(), 'file:///c%3A/file.js');
		} else {
			assert.equal(joinPath(URI.file('/foo/bar'), '/file.js').toString(), 'file:///foo/bar/file.js');
			assert.equal(joinPath(URI.file('/foo/bar'), 'file.js').toString(), 'file:///foo/bar/file.js');
			assert.equal(joinPath(URI.file('/foo/bar/'), '/file.js').toString(), 'file:///foo/bar/file.js');
			assert.equal(joinPath(URI.file('/'), '/file.js').toString(), 'file:///file.js');
			assert.equal(joinPath(URI.file('/foo/bar'), './file.js').toString(), 'file:///foo/bar/file.js');
			assert.equal(joinPath(URI.file('/foo/bar'), '/./file.js').toString(), 'file:///foo/bar/file.js');
			assert.equal(joinPath(URI.file('/foo/bar'), '../file.js').toString(), 'file:///foo/file.js');
		}
		assert.equal(joinPath(URI.parse('foo://a/foo/bar'), '/file.js').toString(), 'foo://a/foo/bar/file.js');
		assert.equal(joinPath(URI.parse('foo://a/foo/bar'), 'file.js').toString(), 'foo://a/foo/bar/file.js');
		assert.equal(joinPath(URI.parse('foo://a/foo/bar/'), '/file.js').toString(), 'foo://a/foo/bar/file.js');
		assert.equal(joinPath(URI.parse('foo://a/'), '/file.js').toString(), 'foo://a/file.js');
		assert.equal(joinPath(URI.parse('foo://a/foo/bar/'), './file.js').toString(), 'foo://a/foo/bar/file.js');
		assert.equal(joinPath(URI.parse('foo://a/foo/bar/'), '/./file.js').toString(), 'foo://a/foo/bar/file.js');
		assert.equal(joinPath(URI.parse('foo://a/foo/bar/'), '../file.js').toString(), 'foo://a/foo/file.js');

		assert.equal(
			joinPath(URI.from({ scheme: 'myScheme', authority: 'authority', path: '/path', query: 'query', fragment: 'fragment' }), '/file.js').toString(),
			'myScheme://authority/path/file.js?query#fragment');
	});

	test('normalizePath', () => {
		if (isWindows) {
			assert.equal(normalizePath(URI.file('c:\\foo\\.\\bar')).toString(), 'file:///c%3A/foo/bar');
			assert.equal(normalizePath(URI.file('c:\\foo\\.')).toString(), 'file:///c%3A/foo');
			assert.equal(normalizePath(URI.file('c:\\foo\\.\\')).toString(), 'file:///c%3A/foo/');
			assert.equal(normalizePath(URI.file('c:\\foo\\..')).toString(), 'file:///c%3A/');
			assert.equal(normalizePath(URI.file('c:\\foo\\..\\bar')).toString(), 'file:///c%3A/bar');
			assert.equal(normalizePath(URI.file('c:\\foo\\..\\..\\bar')).toString(), 'file:///c%3A/bar');
			assert.equal(normalizePath(URI.file('c:\\foo\\foo\\..\\..\\bar')).toString(), 'file:///c%3A/bar');
			assert.equal(normalizePath(URI.file('C:\\foo\\foo\\.\\..\\..\\bar')).toString(), 'file:///c%3A/bar');
			assert.equal(normalizePath(URI.file('C:\\foo\\foo\\.\\..\\some\\..\\bar')).toString(), 'file:///c%3A/foo/bar');
		} else {
			assert.equal(normalizePath(URI.file('/foo/./bar')).toString(), 'file:///foo/bar');
			assert.equal(normalizePath(URI.file('/foo/.')).toString(), 'file:///foo');
			assert.equal(normalizePath(URI.file('/foo/./')).toString(), 'file:///foo/');
			assert.equal(normalizePath(URI.file('/foo/..')).toString(), 'file:///');
			assert.equal(normalizePath(URI.file('/foo/../bar')).toString(), 'file:///bar');
			assert.equal(normalizePath(URI.file('/foo/../../bar')).toString(), 'file:///bar');
			assert.equal(normalizePath(URI.file('/foo/foo/../../bar')).toString(), 'file:///bar');
			assert.equal(normalizePath(URI.file('/foo/foo/./../../bar')).toString(), 'file:///bar');
			assert.equal(normalizePath(URI.file('/foo/foo/./../some/../bar')).toString(), 'file:///foo/bar');
			assert.equal(normalizePath(URI.file('/f')).toString(), 'file:///f');
		}
		assert.equal(normalizePath(URI.parse('foo://a/foo/./bar')).toString(), 'foo://a/foo/bar');
		assert.equal(normalizePath(URI.parse('foo://a/foo/.')).toString(), 'foo://a/foo');
		assert.equal(normalizePath(URI.parse('foo://a/foo/./')).toString(), 'foo://a/foo/');
		assert.equal(normalizePath(URI.parse('foo://a/foo/..')).toString(), 'foo://a/');
		assert.equal(normalizePath(URI.parse('foo://a/foo/../bar')).toString(), 'foo://a/bar');
		assert.equal(normalizePath(URI.parse('foo://a/foo/../../bar')).toString(), 'foo://a/bar');
		assert.equal(normalizePath(URI.parse('foo://a/foo/foo/../../bar')).toString(), 'foo://a/bar');
		assert.equal(normalizePath(URI.parse('foo://a/foo/foo/./../../bar')).toString(), 'foo://a/bar');
		assert.equal(normalizePath(URI.parse('foo://a/foo/foo/./../some/../bar')).toString(), 'foo://a/foo/bar');
		assert.equal(normalizePath(URI.parse('foo://a')).toString(), 'foo://a');
		assert.equal(normalizePath(URI.parse('foo://a/')).toString(), 'foo://a/');
	});

	test('isAbsolute', () => {
		if (isWindows) {
			assert.equal(isAbsolutePath(URI.file('c:\\foo\\')), true);
			assert.equal(isAbsolutePath(URI.file('C:\\foo\\')), true);
			assert.equal(isAbsolutePath(URI.file('bar')), true); // URI normalizes all file URIs to be absolute
		} else {
			assert.equal(isAbsolutePath(URI.file('/foo/bar')), true);
			assert.equal(isAbsolutePath(URI.file('bar')), true); // URI normalizes all file URIs to be absolute
		}
		assert.equal(isAbsolutePath(URI.parse('foo:foo')), false);
		assert.equal(isAbsolutePath(URI.parse('foo://a/foo/.')), true);
	});

	function assertTrailingSeparator(u1: URI, expected: boolean) {
		assert.equal(hasTrailingPathSeparator(u1), expected, u1.toString());
	}

	function assertRemoveTrailingSeparator(u1: URI, expected: URI) {
		assertEqualURI(removeTrailingPathSeparator(u1), expected, u1.toString());
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
		} else {
			assertTrailingSeparator(URI.file('/foo/bar'), false);
			assertTrailingSeparator(URI.file('/foo/bar/'), true);
			assertTrailingSeparator(URI.file('/'), false);

			assertRemoveTrailingSeparator(URI.file('/foo/bar'), URI.file('/foo/bar'));
			assertRemoveTrailingSeparator(URI.file('/foo/bar/'), URI.file('/foo/bar'));
			assertRemoveTrailingSeparator(URI.file('/'), URI.file('/'));
		}
	});

	function assertEqualURI(actual: URI, expected: URI, message?: string) {
		if (!isEqual(expected, actual)) {
			assert.equal(expected.toString(), actual.toString(), message);
		}
	}

	function assertRelativePath(u1: URI, u2: URI, expectedPath: string | undefined, ignoreJoin?: boolean) {
		assert.equal(relativePath(u1, u2), expectedPath, `from ${u1.toString()} to ${u2.toString()}`);
		if (expectedPath !== undefined && !ignoreJoin) {
			assertEqualURI(removeTrailingPathSeparator(joinPath(u1, expectedPath)), removeTrailingPathSeparator(u2), 'joinPath on relativePath should be equal');
		}
	}

	test('relativePath', () => {
		assertRelativePath(URI.parse('foo://a/foo'), URI.parse('foo://a/foo/bar'), 'bar');
		assertRelativePath(URI.parse('foo://a/foo'), URI.parse('foo://a/foo/bar/'), 'bar');
		assertRelativePath(URI.parse('foo://a/foo'), URI.parse('foo://a/foo/bar/goo'), 'bar/goo');
		assertRelativePath(URI.parse('foo://a/'), URI.parse('foo://a/foo/bar/goo'), 'foo/bar/goo');
		assertRelativePath(URI.parse('foo://a/foo/xoo'), URI.parse('foo://a/foo/bar'), '../bar');
		assertRelativePath(URI.parse('foo://a/foo/xoo/yoo'), URI.parse('foo://a'), '../../..');
		assertRelativePath(URI.parse('foo://a/foo'), URI.parse('foo://a/foo/'), '');
		assertRelativePath(URI.parse('foo://a/foo/'), URI.parse('foo://a/foo'), '');
		assertRelativePath(URI.parse('foo://a/foo/'), URI.parse('foo://a/foo/'), '');
		assertRelativePath(URI.parse('foo://a/foo'), URI.parse('foo://a/foo'), '');
		assertRelativePath(URI.parse('foo://a'), URI.parse('foo://a'), '');
		assertRelativePath(URI.parse('foo://a/'), URI.parse('foo://a/'), '');
		assertRelativePath(URI.parse('foo://a/'), URI.parse('foo://a'), '');
		assertRelativePath(URI.parse('foo://a/foo?q'), URI.parse('foo://a/foo/bar#h'), 'bar');
		assertRelativePath(URI.parse('foo://'), URI.parse('foo://a/b'), undefined);
		assertRelativePath(URI.parse('foo://a2/b'), URI.parse('foo://a/b'), undefined);
		assertRelativePath(URI.parse('goo://a/b'), URI.parse('foo://a/b'), undefined);

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

	test('isEqual', () => {
		let fileURI = isWindows ? URI.file('c:\\foo\\bar') : URI.file('/foo/bar');
		let fileURI2 = isWindows ? URI.file('C:\\foo\\Bar') : URI.file('/foo/Bar');
		assert.equal(isEqual(fileURI, fileURI, true), true);
		assert.equal(isEqual(fileURI, fileURI, false), true);
		assert.equal(isEqual(fileURI, fileURI, hasToIgnoreCase(fileURI)), true);
		assert.equal(isEqual(fileURI, fileURI2, true), true);
		assert.equal(isEqual(fileURI, fileURI2, false), false);

		let fileURI3 = URI.parse('foo://server:453/foo/bar');
		let fileURI4 = URI.parse('foo://server:453/foo/Bar');
		assert.equal(isEqual(fileURI3, fileURI3, true), true);
		assert.equal(isEqual(fileURI3, fileURI3, false), true);
		assert.equal(isEqual(fileURI3, fileURI3, hasToIgnoreCase(fileURI3)), true);
		assert.equal(isEqual(fileURI3, fileURI4, true), true);
		assert.equal(isEqual(fileURI3, fileURI4, false), false);

		assert.equal(isEqual(fileURI, fileURI3, true), false);

		assert.equal(isEqual(URI.parse('foo://server'), URI.parse('foo://server/')), true);
	});

	test('isEqualOrParent', () => {
		let fileURI = isWindows ? URI.file('c:\\foo\\bar') : URI.file('/foo/bar');
		let fileURI2 = isWindows ? URI.file('c:\\foo') : URI.file('/foo');
		let fileURI2b = isWindows ? URI.file('C:\\Foo\\') : URI.file('/Foo/');
		assert.equal(isEqualOrParent(fileURI, fileURI, true), true, '1');
		assert.equal(isEqualOrParent(fileURI, fileURI, false), true, '2');
		assert.equal(isEqualOrParent(fileURI, fileURI2, true), true, '3');
		assert.equal(isEqualOrParent(fileURI, fileURI2, false), true, '4');
		assert.equal(isEqualOrParent(fileURI, fileURI2b, true), true, '5');
		assert.equal(isEqualOrParent(fileURI, fileURI2b, false), false, '6');

		assert.equal(isEqualOrParent(fileURI2, fileURI, false), false, '7');
		assert.equal(isEqualOrParent(fileURI2b, fileURI2, true), true, '8');

		let fileURI3 = URI.parse('foo://server:453/foo/bar/goo');
		let fileURI4 = URI.parse('foo://server:453/foo/');
		let fileURI5 = URI.parse('foo://server:453/foo');
		assert.equal(isEqualOrParent(fileURI3, fileURI3, true), true, '11');
		assert.equal(isEqualOrParent(fileURI3, fileURI3, false), true, '12');
		assert.equal(isEqualOrParent(fileURI3, fileURI4, true), true, '13');
		assert.equal(isEqualOrParent(fileURI3, fileURI4, false), true, '14');
		assert.equal(isEqualOrParent(fileURI3, fileURI, true), false, '15');
		assert.equal(isEqualOrParent(fileURI5, fileURI5, true), true, '16');
	});

	function assertMalformedFileUri(path: string, expected: string | undefined) {
		const old = setUriThrowOnMissingScheme(false);
		const newURI = isMalformedFileUri(URI.parse(path));
		assert.equal(newURI && newURI.toString(), expected);
		setUriThrowOnMissingScheme(old);
	}

	test('isMalformedFileUri', () => {
		if (isWindows) {
			assertMalformedFileUri('c:/foo/bar', 'file:///c%3A/foo/bar');
			assertMalformedFileUri('c:\\foo\\bar', 'file:///c%3A/foo/bar');
			assertMalformedFileUri('C:\\foo\\bar', 'file:///c%3A/foo/bar');
			assertMalformedFileUri('\\\\localhost\\c$\\devel\\test', 'file://localhost/c%24/devel/test');
		}
		assertMalformedFileUri('/foo/bar', 'file:///foo/bar');

		assertMalformedFileUri('file:///foo/bar', undefined);
		assertMalformedFileUri('file:///c%3A/foo/bar', undefined);
		assertMalformedFileUri('file://localhost/c$/devel/test', undefined);
		assertMalformedFileUri('foo://dadie/foo/bar', undefined);
		assertMalformedFileUri('foo:///dadie/foo/bar', undefined);
	});
});
