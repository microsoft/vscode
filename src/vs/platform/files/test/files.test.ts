/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import URI from 'vs/base/common/uri';
import { join } from 'vs/base/common/paths';
import { FileChangeType, FileChangesEvent, isEqual, isParent, indexOf } from 'vs/platform/files/common/files';
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
		assert.ok(isEqual('/some/path', '/some/path'));
		assert.ok(isEqual('c:\\some\\path', 'c:\\some\\path'));
		assert.ok(!isEqual('/some/path', '/some/other/path'));
		assert.ok(!isEqual('c:\\some\\path', 'c:\\some\\other\\path'));

		if (isLinux) {
			assert.ok(!isEqual('/some/path', '/some/PATH'));
		} else {
			assert.ok(isEqual('/some/path', '/some/PATH'));
			assert.ok(isEqual('c:\\some\\path', 'c:\\some\\PATH'));
		}
	});

	test('isParent', function () {
		if (isWindows) {
			assert.ok(!isParent('c:\\some\\path', 'c:\\some\\path'));
			assert.ok(isParent('c:\\some\\path', 'c:\\some'));
		}

		if (isMacintosh) {
			assert.ok(!isParent('/some/path', '/some/path'));
			assert.ok(!isParent('/some/path', '/some/other/path'));
			assert.ok(isParent('/some/path', '/some'));
		}

		if (isLinux) {
			assert.ok(!isParent('/some/path', '/SOME'));
		} else {
			if (isMacintosh) {
				assert.ok(isParent('/some/path', '/SOME'));
			}

			if (isWindows) {
				assert.ok(isParent('c:\\some\\path', 'c:\\SOME'));
			}
		}
	});

	test('indexOf', function () {
		assert.equal(indexOf('/some/path', '/some/path'), 0);
		assert.equal(indexOf('/some/path', '/some/other/path'), -1);

		if (isLinux) {
			assert.equal(indexOf('/some/path', '/some/PATH'), -1);
		} else {
			assert.equal(indexOf('/some/path', '/some/PATH'), 0);
		}
	});
});