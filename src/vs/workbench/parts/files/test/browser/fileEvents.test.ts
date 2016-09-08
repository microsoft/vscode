/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import {LocalFileChangeEvent} from 'vs/workbench/parts/files/common/files';
import {FileImportedEvent} from 'vs/workbench/parts/files/browser/fileActions';

suite('Files - Events', () => {

	test('File Change Event (simple)', function () {
		const origEvent: any = {};
		const oldValue: any = { foo: 'bar' };
		const newValue: any = { foo: 'foo' };
		const event = new LocalFileChangeEvent(oldValue, newValue, origEvent);

		assert.strictEqual(event.originalEvent, origEvent);
		assert.strictEqual(event.oldValue, oldValue);
		assert.strictEqual(event.newValue, newValue);
		assert(event.time);
	});

	test('File Upload Event', function () {
		const origEvent: any = {};
		const value: any = { foo: 'bar' };
		let event = new FileImportedEvent(value, true, origEvent);

		assert.strictEqual(event.originalEvent, origEvent);
		assert.strictEqual(event.newValue, value);
		assert(event.time);
		assert(event.gotAdded());
		assert(!event.gotUpdated());
		assert(!event.gotMoved());
		assert(!event.gotDeleted());

		event = new FileImportedEvent(value, false, origEvent);

		assert(!event.gotAdded());
		assert(event.gotUpdated());
		assert(!event.gotMoved());
		assert(!event.gotDeleted());
	});
});