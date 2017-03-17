/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import URI from 'vs/base/common/uri';
import { join } from 'vs/base/common/paths';
import { FileChangeType, FileChangesEvent, isEqual, isParent, isEqualOrParent, indexOf } from 'vs/platform/files/common/files';
import { isLinux, isMacintosh, isWindows } from 'vs/base/common/platform';

suite('Files', () => {

	function toResource(path) {
		return URI.file(join('C:\\', path));
	}

	test('FileChangesEvent', function () {
		let changes = [
			{ resource: URI.file(join('C:\\', '/foo/updated.txt')), type: FileChangeType.UPDATED },
			{ resource: URI.file(join('C:\\', '/foo/otherupdated.txt')), type: FileChangeType.UPDATED },
			{ resource: URI.file(join('C:\\', '/added.txt')), type: FileChangeType.ADDED },
			{ resource: URI.file(join('C:\\', '/bar/deleted.txt')), type: FileChangeType.DELETED },
			{ resource: URI.file(join('C:\\', '/bar/folder')), type: FileChangeType.DELETED }
		];

		let r1 = new FileChangesEvent(changes);

		assert(!r1.contains(toResource('/foo'), FileChangeType.UPDATED));
		assert(r1.contains(toResource('/foo/updated.txt'), FileChangeType.UPDATED));
		assert(!r1.contains(toResource('/foo/updated.txt'), FileChangeType.ADDED));
		assert(!r1.contains(toResource('/foo/updated.txt'), FileChangeType.DELETED));

		assert(r1.contains(toResource('/bar/folder'), FileChangeType.DELETED));
		assert(r1.contains(toResource('/bar/folder/somefile'), FileChangeType.DELETED));
		assert(r1.contains(toResource('/bar/folder/somefile/test.txt'), FileChangeType.DELETED));
		assert(!r1.contains(toResource('/bar/folder2/somefile'), FileChangeType.DELETED));

		assert.strictEqual(5, r1.changes.length);
		assert.strictEqual(1, r1.getAdded().length);
		assert.strictEqual(true, r1.gotAdded());
		assert.strictEqual(2, r1.getUpdated().length);
		assert.strictEqual(true, r1.gotUpdated());
		assert.strictEqual(2, r1.getDeleted().length);
		assert.strictEqual(true, r1.gotDeleted());
	});

	function testIsEqual(testMethod: (pA: string, pB: string) => boolean): void {

		// corner cases
		assert(testMethod('', ''));
		assert(!testMethod(null, ''));
		assert(!testMethod(void 0, ''));

		// basics (string)
		assert(testMethod('/', '/'));
		assert(testMethod('/some', '/some'));
		assert(testMethod('/some/path', '/some/path'));

		assert(testMethod('c:\\', 'c:\\'));
		assert(testMethod('c:\\some', 'c:\\some'));
		assert(testMethod('c:\\some\\path', 'c:\\some\\path'));

		assert(testMethod('/someöäü/path', '/someöäü/path'));
		assert(testMethod('c:\\someöäü\\path', 'c:\\someöäü\\path'));

		assert(!testMethod('/some/path', '/some/other/path'));
		assert(!testMethod('c:\\some\\path', 'c:\\some\\other\\path'));
		assert(!testMethod('c:\\some\\path', 'd:\\some\\path'));

		// case insensitive (unless isLinux)
		if (isLinux) {
			assert(!testMethod('/some/path', '/some/PATH'));
			assert(!testMethod('/some/path', '/some/other/PATH'));
		} else {
			assert(testMethod('/some/path', '/some/PATH'));
			assert(testMethod('/someöäü/path', '/someÖÄÜ/PATH'));
			assert(testMethod('c:\\some\\path', 'c:\\some\\PATH'));
			assert(testMethod('c:\\someöäü\\path', 'c:\\someÖÄÜ\\PATH'));
			assert(testMethod('c:\\some\\path', 'C:\\some\\PATH'));
		}
	}

	test('isEqual', function () {
		testIsEqual(isEqual);

		// basics (uris)
		assert(isEqual(URI.file('/some/path'), URI.file('/some/path')));
		assert(isEqual(URI.file('c:\\some\\path'), URI.file('c:\\some\\path')));

		assert(isEqual(URI.file('/someöäü/path'), URI.file('/someöäü/path')));
		assert(isEqual(URI.file('c:\\someöäü\\path'), URI.file('c:\\someöäü\\path')));

		assert(!isEqual(URI.file('/some/path'), URI.file('/some/other/path')));
		assert(!isEqual(URI.file('c:\\some\\path'), URI.file('c:\\some\\other\\path')));

		assert(isEqual(URI.parse('some://cool/uri'), URI.parse('some://cool/uri')));
		assert(!isEqual(URI.parse('some://cool/uri'), URI.parse('some://other/uri')));

		// case insensitive (unless isLinux)
		if (isLinux) {
			assert(!isEqual(URI.file('/some/path'), URI.file('/some/PATH')));
		} else {
			assert(isEqual(URI.file('/some/path'), URI.file('/some/PATH')));
			assert(isEqual(URI.file('/someöäü/path'), URI.file('/someÖÄÜ/PATH')));
			assert(isEqual(URI.file('c:\\some\\path'), URI.file('c:\\some\\PATH')));
			assert(isEqual(URI.file('c:\\someöäü\\path'), URI.file('c:\\someÖÄÜ\\PATH')));
			assert(isEqual(URI.file('c:\\some\\path'), URI.file('C:\\some\\PATH')));
		}
	});

	test('isParent', function () {
		if (isWindows) {
			assert(isParent('c:\\some\\path', 'c:\\'));
			assert(isParent('c:\\some\\path', 'c:\\some'));
			assert(isParent('c:\\some\\path', 'c:\\some\\'));
			assert(isParent('c:\\someöäü\\path', 'c:\\someöäü'));
			assert(isParent('c:\\someöäü\\path', 'c:\\someöäü\\'));
			assert(isParent('c:\\foo\\bar\\test.ts', 'c:\\foo\\bar'));
			assert(isParent('c:\\foo\\bar\\test.ts', 'c:\\foo\\bar\\'));

			assert(isParent('c:\\some\\path', 'C:\\'));
			assert(isParent('c:\\some\\path', 'c:\\SOME'));
			assert(isParent('c:\\some\\path', 'c:\\SOME\\'));

			assert(!isParent('c:\\some\\path', 'd:\\'));
			assert(!isParent('c:\\some\\path', 'c:\\some\\path'));
			assert(!isParent('c:\\some\\path', 'd:\\some\\path'));
			assert(!isParent('c:\\foo\\bar\\test.ts', 'c:\\foo\\barr'));
			assert(!isParent('c:\\foo\\bar\\test.ts', 'c:\\foo\\bar\\test'));
		}

		if (isMacintosh) {
			assert(isParent('/some/path', '/'));
			assert(isParent('/some/path', '/some'));
			assert(isParent('/some/path', '/some/'));
			assert(isParent('/someöäü/path', '/someöäü'));
			assert(isParent('/someöäü/path', '/someöäü/'));
			assert(isParent('/foo/bar/test.ts', '/foo/bar'));
			assert(isParent('/foo/bar/test.ts', '/foo/bar/'));

			assert(isParent('/some/path', '/SOME'));
			assert(isParent('/some/path', '/SOME/'));
			assert(isParent('/someöäü/path', '/SOMEÖÄÜ'));
			assert(isParent('/someöäü/path', '/SOMEÖÄÜ/'));

			assert(!isParent('/some/path', '/some/path'));
			assert(!isParent('/foo/bar/test.ts', '/foo/barr'));
			assert(!isParent('/foo/bar/test.ts', '/foo/bar/test'));
		}

		if (isLinux) {
			assert(isParent('/some/path', '/'));
			assert(isParent('/some/path', '/some'));
			assert(isParent('/some/path', '/some/'));
			assert(isParent('/someöäü/path', '/someöäü'));
			assert(isParent('/someöäü/path', '/someöäü/'));
			assert(isParent('/foo/bar/test.ts', '/foo/bar'));
			assert(isParent('/foo/bar/test.ts', '/foo/bar/'));

			assert(!isParent('/some/path', '/SOME'));

			assert(!isParent('/some/path', '/some/path'));
			assert(!isParent('/foo/bar/test.ts', '/foo/barr'));
			assert(!isParent('/foo/bar/test.ts', '/foo/bar/test'));
		}
	});

	test('isEqualOrParent', function () {

		// same assertions apply as with isEqual()
		testIsEqual(isEqualOrParent);

		if (isWindows) {
			assert(isEqualOrParent('c:\\some\\path', 'c:\\'));
			assert(isEqualOrParent('c:\\some\\path', 'c:\\some'));
			assert(isEqualOrParent('c:\\some\\path', 'c:\\some\\'));
			assert(isEqualOrParent('c:\\someöäü\\path', 'c:\\someöäü'));
			assert(isEqualOrParent('c:\\someöäü\\path', 'c:\\someöäü\\'));
			assert(isEqualOrParent('c:\\foo\\bar\\test.ts', 'c:\\foo\\bar'));
			assert(isEqualOrParent('c:\\foo\\bar\\test.ts', 'c:\\foo\\bar\\'));
			assert(isEqualOrParent('c:\\some\\path', 'c:\\some\\path'));
			assert(isEqualOrParent('c:\\foo\\bar\\test.ts', 'c:\\foo\\bar\\test.ts'));

			assert(isEqualOrParent('c:\\some\\path', 'C:\\'));
			assert(isEqualOrParent('c:\\some\\path', 'c:\\SOME'));
			assert(isEqualOrParent('c:\\some\\path', 'c:\\SOME\\'));

			assert(!isEqualOrParent('c:\\some\\path', 'd:\\'));
			assert(!isEqualOrParent('c:\\some\\path', 'd:\\some\\path'));
			assert(!isEqualOrParent('c:\\foo\\bar\\test.ts', 'c:\\foo\\barr'));
			assert(!isEqualOrParent('c:\\foo\\bar\\test.ts', 'c:\\foo\\bar\\test'));
			assert(!isEqualOrParent('c:\\foo\\bar\\test.ts', 'c:\\foo\\bar\\test.'));
			assert(!isEqualOrParent('c:\\foo\\bar\\test.ts', 'c:\\foo\\BAR\\test.'));
		}

		if (isMacintosh) {
			assert(isEqualOrParent('/some/path', '/'));
			assert(isEqualOrParent('/some/path', '/some'));
			assert(isEqualOrParent('/some/path', '/some/'));
			assert(isEqualOrParent('/someöäü/path', '/someöäü'));
			assert(isEqualOrParent('/someöäü/path', '/someöäü/'));
			assert(isEqualOrParent('/foo/bar/test.ts', '/foo/bar'));
			assert(isEqualOrParent('/foo/bar/test.ts', '/foo/bar/'));
			assert(isEqualOrParent('/some/path', '/some/path'));

			assert(isEqualOrParent('/some/path', '/SOME'));
			assert(isEqualOrParent('/some/path', '/SOME/'));
			assert(isEqualOrParent('/someöäü/path', '/SOMEÖÄÜ'));
			assert(isEqualOrParent('/someöäü/path', '/SOMEÖÄÜ/'));

			assert(!isEqualOrParent('/foo/bar/test.ts', '/foo/barr'));
			assert(!isEqualOrParent('/foo/bar/test.ts', '/foo/bar/test'));
			assert(!isEqualOrParent('foo/bar/test.ts', 'foo/bar/test.'));
			assert(!isEqualOrParent('foo/bar/test.ts', 'foo/BAR/test.'));
		}

		if (isLinux) {
			assert(isEqualOrParent('/some/path', '/'));
			assert(isEqualOrParent('/some/path', '/some'));
			assert(isEqualOrParent('/some/path', '/some/'));
			assert(isEqualOrParent('/someöäü/path', '/someöäü'));
			assert(isEqualOrParent('/someöäü/path', '/someöäü/'));
			assert(isEqualOrParent('/foo/bar/test.ts', '/foo/bar'));
			assert(isEqualOrParent('/foo/bar/test.ts', '/foo/bar/'));
			assert(isEqualOrParent('/some/path', '/some/path'));

			assert(!isEqualOrParent('/some/path', '/SOME'));

			assert(!isEqualOrParent('/foo/bar/test.ts', '/foo/barr'));
			assert(!isEqualOrParent('/foo/bar/test.ts', '/foo/bar/test'));
		}
	});

	test('indexOf', function () {
		assert.equal(indexOf('/some/path', '/some/path'), 0);
		assert.equal(indexOf('/some/path/more', '/some/path'), 0);

		assert.equal(indexOf('c:\\some\\path', 'c:\\some\\path'), 0);
		assert.equal(indexOf('c:\\some\\path\\more', 'c:\\some\\path'), 0);

		assert.equal(indexOf('/some/path', '/some/other/path'), -1);

		if (isLinux) {
			assert.equal(indexOf('/some/path', '/some/PATH'), -1);
		} else {
			assert.equal(indexOf('/some/path', '/some/PATH'), 0);
		}
	});
});