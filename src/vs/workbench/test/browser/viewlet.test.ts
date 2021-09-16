/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Registry } from 'vs/platform/registry/common/platform';
import { PaneCompositeDescriptor, Extensions, PaneCompositeRegistry } from 'vs/workbench/browser/viewlet';
import { isFunction } from 'vs/base/common/types';
import { PaneComposite } from 'vs/workbench/browser/panecomposite';

suite('Viewlets', () => {

	class TestViewlet extends PaneComposite {

		constructor() {
			super('id', null!, null!, null!, null!, null!, null!, null!);
		}

		override layout(dimension: any): void {
			throw new Error('Method not implemented.');
		}

		createViewPaneContainer() { return null!; }
	}

	test('ViewletDescriptor API', function () {
		let d = PaneCompositeDescriptor.create(TestViewlet, 'id', 'name', 'class', 5);
		assert.strictEqual(d.id, 'id');
		assert.strictEqual(d.name, 'name');
		assert.strictEqual(d.cssClass, 'class');
		assert.strictEqual(d.order, 5);
	});

	test('Editor Aware ViewletDescriptor API', function () {
		let d = PaneCompositeDescriptor.create(TestViewlet, 'id', 'name', 'class', 5);
		assert.strictEqual(d.id, 'id');
		assert.strictEqual(d.name, 'name');

		d = PaneCompositeDescriptor.create(TestViewlet, 'id', 'name', 'class', 5);
		assert.strictEqual(d.id, 'id');
		assert.strictEqual(d.name, 'name');
	});

	test('Viewlet extension point and registration', function () {
		assert(isFunction(Registry.as<PaneCompositeRegistry>(Extensions.Viewlets).registerViewlet));
		assert(isFunction(Registry.as<PaneCompositeRegistry>(Extensions.Viewlets).getViewlet));
		assert(isFunction(Registry.as<PaneCompositeRegistry>(Extensions.Viewlets).getViewlets));

		let oldCount = Registry.as<PaneCompositeRegistry>(Extensions.Viewlets).getViewlets().length;
		let d = PaneCompositeDescriptor.create(TestViewlet, 'reg-test-id', 'name');
		Registry.as<PaneCompositeRegistry>(Extensions.Viewlets).registerViewlet(d);

		assert(d === Registry.as<PaneCompositeRegistry>(Extensions.Viewlets).getViewlet('reg-test-id'));
		assert.strictEqual(oldCount + 1, Registry.as<PaneCompositeRegistry>(Extensions.Viewlets).getViewlets().length);
	});
});
