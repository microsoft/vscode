/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import URI from 'vs/base/common/uri';
import * as Paths from 'vs/base/common/paths';
import * as Files from 'vs/platform/files/common/files';
import {Event, PropertyChangeEvent} from 'vs/base/common/events';
import {CommandEvent, CompositeEvent, EditorEvent} from 'vs/workbench/common/events';

let FileChangesEvent = Files.FileChangesEvent;

suite("Workbench Events", () => {

	test("Base Event", function() {
		let origEvent: any = {};
		let event = new Event(origEvent);

		assert.strictEqual(event.originalEvent, origEvent);
		assert(event.time);
	});

	test("Command Event", function() {
		let actionId = "foo.bar";
		let origEvent = {};
		let event = new CommandEvent(actionId, origEvent);

		assert.strictEqual(event.originalEvent, origEvent);
		assert.strictEqual(event.actionId, actionId);
		assert(event.time);
	});

	test("Editor Change Event", function() {
		let editor: any = {};
		let origEvent: any = {};
		let input: any = {};
		let options: any = {};
		let id = "foo.bar";
		let event = new EditorEvent(editor, id, input, options, 0, origEvent);

		assert.strictEqual(event.editor, editor);
		assert.strictEqual(event.originalEvent, origEvent);
		assert.strictEqual(event.editorId, id);
		assert.strictEqual(event.editorInput, input);
		assert.strictEqual(event.editorOptions, options);
		assert(event.time);
	});

	test("Property Change Event", function() {
		let key = "foo";
		let origEvent: any = {};
		let oldValue = { foo: "bar" };
		let newValue = { foo: "foo" };
		let event = new PropertyChangeEvent(key, oldValue, newValue, origEvent);

		assert.strictEqual(event.originalEvent, origEvent);
		assert.strictEqual(event.key, key);
		assert.strictEqual(event.oldValue, oldValue);
		assert.strictEqual(event.newValue, newValue);
		assert(event.time);
	});

	test("File Changes Event", function() {
		let changes = [
			{ resource: URI.file(Paths.join('C:\\', '/foo/updated.txt')), type: 0 },
			{ resource: URI.file(Paths.join('C:\\', '/foo/otherupdated.txt')), type: 0 },
			{ resource: URI.file(Paths.join('C:\\', '/added.txt')), type: 1 },
			{ resource: URI.file(Paths.join('C:\\', '/bar/deleted.txt')), type: 2 },
			{ resource: URI.file(Paths.join('C:\\', '/bar/folder')), type: 2 }
		];

		let r1 = new FileChangesEvent(changes);

		assert(!r1.contains(toResource('/foo'), 0));
		assert(r1.contains(toResource('/foo/updated.txt'), 0));
		assert(!r1.contains(toResource('/foo/updated.txt'), 1));
		assert(!r1.contains(toResource('/foo/updated.txt'), 2));

		assert(r1.contains(toResource('/bar/folder'), 2));
		assert(r1.contains(toResource('/bar/folder/somefile'), 2));
		assert(r1.contains(toResource('/bar/folder/somefile/test.txt'), 2));
		assert(!r1.contains(toResource('/bar/folder2/somefile'), 2));

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

	test("Composite Event", function() {
		let compositeId = "foo.bar";
		let origEvent = {};
		let event = new CompositeEvent(compositeId, origEvent);

		assert.strictEqual(event.originalEvent, origEvent);
		assert.strictEqual(event.compositeId, compositeId);
		assert(event.time);
	});
});
