/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import URI from 'vs/base/common/uri';
import * as Paths from 'vs/base/common/paths';
import * as Files from 'vs/platform/files/common/files';
import { Event, PropertyChangeEvent } from 'vs/base/common/events';

let FileChangesEvent = Files.FileChangesEvent;

suite('Workbench Events', () => {

	test('Base Event', function () {
		let origEvent: any = {};
		let event = new Event(origEvent);

		assert.strictEqual(event.originalEvent, origEvent);
		assert(event.time);
	});

	test('Property Change Event', function () {
		let key = 'foo';
		let origEvent: any = {};
		let oldValue = { foo: 'bar' };
		let newValue = { foo: 'foo' };
		let event = new PropertyChangeEvent(key, oldValue, newValue, origEvent);

		assert.strictEqual(event.originalEvent, origEvent);
		assert.strictEqual(event.key, key);
		assert.strictEqual(event.oldValue, oldValue);
		assert.strictEqual(event.newValue, newValue);
		assert(event.time);
	});

	test('File Changes Event', function () {
		let changes = [
			{ resource: URI.file(Paths.join('C:\\', '/foo/updated.txt')), type: Files.FileChangeType.UPDATED },
			{ resource: URI.file(Paths.join('C:\\', '/foo/otherupdated.txt')), type: Files.FileChangeType.UPDATED },
			{ resource: URI.file(Paths.join('C:\\', '/added.txt')), type: Files.FileChangeType.ADDED },
			{ resource: URI.file(Paths.join('C:\\', '/bar/deleted.txt')), type: Files.FileChangeType.DELETED },
			{ resource: URI.file(Paths.join('C:\\', '/bar/folder')), type: Files.FileChangeType.DELETED }
		];

		let r1 = new FileChangesEvent(changes);

		assert(!r1.contains(toResource('/foo'), Files.FileChangeType.UPDATED));
		assert(r1.contains(toResource('/foo/updated.txt'), Files.FileChangeType.UPDATED));
		assert(!r1.contains(toResource('/foo/updated.txt'), Files.FileChangeType.ADDED));
		assert(!r1.contains(toResource('/foo/updated.txt'), Files.FileChangeType.DELETED));

		assert(r1.contains(toResource('/bar/folder'), Files.FileChangeType.DELETED));
		assert(r1.contains(toResource('/bar/folder/somefile'), Files.FileChangeType.DELETED));
		assert(r1.contains(toResource('/bar/folder/somefile/test.txt'), Files.FileChangeType.DELETED));
		assert(!r1.contains(toResource('/bar/folder2/somefile'), Files.FileChangeType.DELETED));

		assert.strictEqual(5, r1.changes.length);
		assert.strictEqual(1, r1.getAdded().length);
		assert.strictEqual(true, r1.gotAdded());
		assert.strictEqual(2, r1.getUpdated().length);
		assert.strictEqual(true, r1.gotUpdated());
		assert.strictEqual(2, r1.getDeleted().length);
		assert.strictEqual(true, r1.gotDeleted());
	});

	function toResource(path) {
		return URI.file(Paths.join('C:\\', path));
	}
});
