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
			id: 'test.view1',
			ctor: null,
			location,
			name: 'Test View 1'
		};

		ViewsRegistry.registerViews([viewDescriptor]);

		assert.equal(model.elements.length, 1);
		assert.equal(seq.elements.length, 1);
		assert.deepEqual(model.elements[0], viewDescriptor);
		assert.deepEqual(seq.elements[0], viewDescriptor);

		ViewsRegistry.deregisterViews(['test.view1'], location);

		assert.equal(model.elements.length, 0);
		assert.equal(seq.elements.length, 0);
	});

	test('when contexts', async function () {
		const model = new ContributableViewsModel(location, contextKeyService);

		assert.equal(model.elements.length, 0);

		const viewDescriptor: IViewDescriptor = {
			id: 'test.view1',
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

		ViewsRegistry.deregisterViews(['test.view1'], location);
		assert.equal(model.elements.length, 0, 'view should not be there anymore');

		key.set(true);
		await new Promise(c => setTimeout(c, 30));
		assert.equal(model.elements.length, 0, 'view should not be there anymore');
	});
});
