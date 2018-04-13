/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ContributableViewsModel } from 'vs/workbench/browser/parts/views/contributableViews';
import { ViewLocation, ViewsRegistry, IViewDescriptor } from 'vs/workbench/common/views';
import { ContextKeyService } from 'vs/platform/contextkey/browser/contextKeyService';
import { IContextKeyService, ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { SimpleConfigurationService } from 'vs/editor/standalone/browser/simpleServices';
import { Sequence } from 'vs/base/common/sequence';

const location = new ViewLocation('test');

suite('ContributableViewsModel', () => {
	let contextKeyService: IContextKeyService;

	setup(() => {
		const configurationService = new SimpleConfigurationService();
		contextKeyService = new ContextKeyService(configurationService);
	});

	teardown(() => {
		contextKeyService.dispose();
	});

	test('empty model', function () {
		const model = new ContributableViewsModel(location, contextKeyService);
		assert.equal(model.elements.length, 0);
	});

	test('register/unregister', function () {
		const model = new ContributableViewsModel(location, contextKeyService);
		const seq = new Sequence();

		model.onDidSplice(({ start, deleteCount, toInsert }) => seq.splice(start, deleteCount, toInsert));

		assert.equal(model.elements.length, 0);
		assert.equal(seq.elements.length, 0);

		const viewDescriptor: IViewDescriptor = {
			id: 'view1',
			ctor: null,
			location,
			name: 'Test View 1'
		};

		ViewsRegistry.registerViews([viewDescriptor]);

		assert.equal(model.elements.length, 1);
		assert.equal(seq.elements.length, 1);
		assert.deepEqual(model.elements[0], viewDescriptor);
		assert.deepEqual(seq.elements[0], viewDescriptor);

		ViewsRegistry.deregisterViews(['view1'], location);

		assert.equal(model.elements.length, 0);
		assert.equal(seq.elements.length, 0);
	});

	test('when contexts', async function () {
		const model = new ContributableViewsModel(location, contextKeyService);

		assert.equal(model.elements.length, 0);

		const viewDescriptor: IViewDescriptor = {
			id: 'view1',
			ctor: null,
			location,
			name: 'Test View 1',
			when: ContextKeyExpr.equals('showview1', true)
		};

		ViewsRegistry.registerViews([viewDescriptor]);
		assert.equal(model.elements.length, 0, 'view should not appear since context isnt in');

		const key = contextKeyService.createKey('showview1', false);
		assert.equal(model.elements.length, 0, 'view should still not appear since showview1 isnt true');

		key.set(true);
		await new Promise(c => setTimeout(c, 30));
		assert.equal(model.elements.length, 1, 'view should appear');
		assert.deepEqual(model.elements[0], viewDescriptor);

		key.set(false);
		await new Promise(c => setTimeout(c, 30));
		assert.equal(model.elements.length, 0, 'view should disappear');

		ViewsRegistry.deregisterViews(['view1'], location);
		assert.equal(model.elements.length, 0, 'view should not be there anymore');

		key.set(true);
		await new Promise(c => setTimeout(c, 30));
		assert.equal(model.elements.length, 0, 'view should not be there anymore');
	});

	test('setVisible', function () {
		const model = new ContributableViewsModel(location, contextKeyService);
		const view1: IViewDescriptor = { id: 'view1', ctor: null, location, name: 'Test View 1' };
		const view2: IViewDescriptor = { id: 'view2', ctor: null, location, name: 'Test View 2' };
		const view3: IViewDescriptor = { id: 'view3', ctor: null, location, name: 'Test View 3' };

		ViewsRegistry.registerViews([view1, view2, view3]);
		assert.deepEqual(model.elements, [view1, view2, view3]);

		model.setVisible('view2', true);
		assert.deepEqual(model.elements, [view1, view2, view3], 'nothing should happen');

		model.setVisible('view2', false);
		assert.deepEqual(model.elements, [view1, view3], 'view2 should hide');

		model.setVisible('view1', false);
		assert.deepEqual(model.elements, [view3], 'view1 should hide');

		model.setVisible('view3', false);
		assert.deepEqual(model.elements, [], 'view3 shoud hide');

		model.setVisible('view1', true);
		assert.deepEqual(model.elements, [view1], 'view1 should show');

		model.setVisible('view3', true);
		assert.deepEqual(model.elements, [view1, view3], 'view3 should show');

		model.setVisible('view2', true);
		assert.deepEqual(model.elements, [view1, view2, view3], 'view2 should show');

		ViewsRegistry.deregisterViews([view1.id, view2.id, view3.id], location);
		assert.deepEqual(model.elements, []);
	});

	test('move', function () {
		const model = new ContributableViewsModel(location, contextKeyService);
		const view1: IViewDescriptor = { id: 'view1', ctor: null, location, name: 'Test View 1' };
		const view2: IViewDescriptor = { id: 'view2', ctor: null, location, name: 'Test View 2' };
		const view3: IViewDescriptor = { id: 'view3', ctor: null, location, name: 'Test View 3' };

		ViewsRegistry.registerViews([view1, view2, view3]);
		assert.deepEqual(model.elements, [view1, view2, view3]);

		model.move('view3', 'view1');
		assert.deepEqual(model.elements, [view3, view1, view2], 'view3 should go to the front');

		model.move('view1', 'view2');
		assert.deepEqual(model.elements, [view3, view2, view1], 'view1 should go to the end');

		model.move('view1', 'view3');
		assert.deepEqual(model.elements, [view1, view3, view2], 'view1 should go to the front');

		model.move('view2', 'view3');
		assert.deepEqual(model.elements, [view1, view2, view3], 'view2 should go to the middle');
	});
});
