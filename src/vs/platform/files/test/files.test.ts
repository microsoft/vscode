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

	test('isEqual', function () {
		assert(isEqual('/some/path', '/some/path'));
		assert(isEqual(URI.file('/some/path'), URI.file('/some/path')));
		assert(isEqual('c:\\some\\path', 'c:\\some\\path'));
		assert(isEqual(URI.file('c:\\some\\path'), URI.file('c:\\some\\path')));
		assert(!isEqual('/some/path', '/some/other/path'));
		assert(!isEqual(URI.file('/some/path'), URI.file('/some/other/path')));
		assert(!isEqual('c:\\some\\path', 'c:\\some\\other\\path'));
		assert(!isEqual(URI.file('c:\\some\\path'), URI.file('c:\\some\\other\\path')));

		if (isLinux) {
			assert(!isEqual('/some/path', '/some/PATH'));
			assert(!isEqual(URI.file('/some/path'), URI.file('/some/PATH')));
		} else {
			assert(isEqual(URI.file('/some/path'), URI.file('/some/PATH')));
			assert(isEqual(URI.file('c:\\some\\path'), URI.file('c:\\some\\PATH')));
		}

		assert(isEqual(URI.parse('some://cool/uri'), URI.parse('some://cool/uri')));
		assert(!isEqual(URI.parse('some://cool/uri'), URI.parse('some://other/uri')));
	});

	test('isParent', function () {
		if (isWindows) {
			assert(!isParent('c:\\some\\path', 'c:\\some\\path'));
			assert(isParent('c:\\some\\path', 'c:\\some'));
		}

		if (isMacintosh) {
			assert(!isParent('/some/path', '/some/path'));
			assert(!isParent('/some/path', '/some/other/path'));
			assert(isParent('/some/path', '/some'));
		}

		if (isLinux) {
			assert(!isParent('/some/path', '/SOME'));
		} else {
			if (isMacintosh) {
				assert(isParent('/some/path', '/SOME'));
			}

			if (isWindows) {
				assert(isParent('c:\\some\\path', 'c:\\SOME'));
			}
		}
	});

	test('isEqualOrParent', function () {
		if (isWindows) {
			assert(isEqualOrParent('c:\\some\\path', 'c:\\some\\path'));
			assert(isEqualOrParent('c:\\some\\path', 'c:\\some'));
			assert(isEqualOrParent('c:\\foo\\bar\\test.ts', 'c:\\foo\\bar'));
			assert(!isEqualOrParent('c:\\foo\\bar\\test.ts', 'c:\\foo\\barr'));
			assert(isEqualOrParent('c:\\foo\\bar\\test.ts', 'c:\\foo\\bar\\test.ts'));
			assert(!isEqualOrParent('c:\\foo\\bar\\test.ts', 'c:\\foo\\bar\\test'));
			assert(!isEqualOrParent('c:\\foo\\bar\\test.ts', 'c:\\foo\\bar\\test.'));
		} else {
			assert(isEqualOrParent('foo/bar/test.ts', 'foo'));
			assert(isEqualOrParent('/', '/'));
			assert(isEqualOrParent('/foo', '/foo'));
			assert(!isEqualOrParent('/foo', '/f'));
			assert(!isEqualOrParent('/foo', '/foo/b'));
			assert(isEqualOrParent('foo/bar/test.ts', 'foo/bar'));
			assert(!isEqualOrParent('foo/bar/test.ts', '/foo/bar'));
			assert(!isEqualOrParent('foo/bar/test.ts', 'foo/barr'));
			assert(isEqualOrParent('foo/bar/test.ts', 'foo/bar/test.ts'));
			assert(!isEqualOrParent('foo/bar/test.ts', 'foo/bar/test'));
			assert(!isEqualOrParent('foo/bar/test.ts', 'foo/bar/test.'));
		}

		if (!isLinux) {
			assert(isEqualOrParent('/foo', '/fOO'));
			assert(isEqualOrParent('/fOO', '/foo'));
			assert(isEqualOrParent('foo/bar/test.ts', 'foo/BAR/test.ts'));
			assert(!isEqualOrParent('foo/bar/test.ts', 'foo/BAR/test.'));
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