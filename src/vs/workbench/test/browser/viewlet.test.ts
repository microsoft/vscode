/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Registry } from 'vs/platform/registry/common/platform';
import { PaneCompositeDescriptor, Extensions, PaneCompositeRegistry, PaneComposite } from 'vs/workbench/browser/panecomposite';
import { isFunction } from 'vs/base/common/types';
import { IBoundarySashes } from 'vs/base/browser/ui/sash/sash';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

suite('Viewlets', () => {

	class TestViewlet extends PaneComposite {

		constructor() {
			super('id', null!, null!, null!, null!, null!, null!, null!);
		}

		override layout(dimension: any): void {
			throw new Error('Method not implemented.');
		}

		override setBoundarySashes(sashes: IBoundarySashes): void {
			throw new Error('Method not implemented.');
		}

		protected override createViewPaneContainer() { return null!; }
	}

	test('ViewletDescriptor API', function () {
		const d = PaneCompositeDescriptor.create(TestViewlet, 'id', 'name', 'class', 5);
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
		assert(isFunction(Registry.as<PaneCompositeRegistry>(Extensions.Viewlets).registerPaneComposite));
		assert(isFunction(Registry.as<PaneCompositeRegistry>(Extensions.Viewlets).getPaneComposite));
		assert(isFunction(Registry.as<PaneCompositeRegistry>(Extensions.Viewlets).getPaneComposites));

		const oldCount = Registry.as<PaneCompositeRegistry>(Extensions.Viewlets).getPaneComposites().length;
		const d = PaneCompositeDescriptor.create(TestViewlet, 'reg-test-id', 'name');
		Registry.as<PaneCompositeRegistry>(Extensions.Viewlets).registerPaneComposite(d);

		assert(d === Registry.as<PaneCompositeRegistry>(Extensions.Viewlets).getPaneComposite('reg-test-id'));
		assert.strictEqual(oldCount + 1, Registry.as<PaneCompositeRegistry>(Extensions.Viewlets).getPaneComposites().length);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
