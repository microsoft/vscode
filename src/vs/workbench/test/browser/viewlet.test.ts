/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import * as Platform from 'vs/platform/platform';
import { ViewletDescriptor, Extensions } from 'vs/workbench/browser/viewlet';
import * as Types from 'vs/base/common/types';

suite('Workbench Viewlet', () => {

	test('ViewletDescriptor API', function () {
		let d = new ViewletDescriptor('moduleId', 'ctorName', 'id', 'name', 'class', 5);
		assert.strictEqual(d.id, 'id');
		assert.strictEqual(d.name, 'name');
		assert.strictEqual(d.cssClass, 'class');
		assert.strictEqual(d.order, 5);
	});

	test('Editor Aware ViewletDescriptor API', function () {
		let d = new ViewletDescriptor('moduleId', 'ctorName', 'id', 'name', 'class', 5);
		assert.strictEqual(d.id, 'id');
		assert.strictEqual(d.name, 'name');

		d = new ViewletDescriptor('moduleId', 'ctorName', 'id', 'name', 'class', 5);
		assert.strictEqual(d.id, 'id');
		assert.strictEqual(d.name, 'name');
	});

	test('Viewlet extension point and registration', function () {
		assert(Types.isFunction(Platform.Registry.as(Extensions.Viewlets).registerViewlet));
		assert(Types.isFunction(Platform.Registry.as(Extensions.Viewlets).getViewlet));
		assert(Types.isFunction(Platform.Registry.as(Extensions.Viewlets).getViewlets));

		let oldCount = Platform.Registry.as(Extensions.Viewlets).getViewlets().length;
		let d = new ViewletDescriptor('moduleId', 'ctorName', 'reg-test-id', 'name');
		Platform.Registry.as(Extensions.Viewlets).registerViewlet(d);

		assert(d === Platform.Registry.as(Extensions.Viewlets).getViewlet('reg-test-id'));
		assert.equal(oldCount + 1, Platform.Registry.as(Extensions.Viewlets).getViewlets().length);
	});
});