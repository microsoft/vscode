/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import { IViewDescriptor } from 'vs/workbench/common/views';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { move } from 'vs/base/common/arrays';
import { workbenchInstantiationService } from 'vs/workbench/test/browser/workbenchTestServices';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { ContextKeyService } from 'vs/platform/contextkey/browser/contextKeyService';
import { IViewState, ViewDescriptorsModel, ContributableViewsModel } from 'vs/workbench/services/views/common/viewsModel';

class ViewDescriptorSequence {

	readonly elements: IViewDescriptor[];
	private disposables: IDisposable[] = [];

	constructor(model: ContributableViewsModel) {
		this.elements = [...model.visibleViewDescriptors];
		model.onDidAdd(added => added.forEach(({ viewDescriptor, index }) => this.elements.splice(index, 0, viewDescriptor)), null, this.disposables);
		model.onDidRemove(removed => removed.sort((a, b) => b.index - a.index).forEach(({ index }) => this.elements.splice(index, 1)), null, this.disposables);
		model.onDidMove(({ from, to }) => move(this.elements, from.index, to.index), null, this.disposables);
	}

	dispose() {
		this.disposables = dispose(this.disposables);
	}
}

suite('ContributableViewsModel', () => {

	let contextKeyService: IContextKeyService;

	setup(() => {
		const instantiationService: TestInstantiationService = <TestInstantiationService>workbenchInstantiationService();
		contextKeyService = instantiationService.createInstance(ContextKeyService);
		instantiationService.stub(IContextKeyService, contextKeyService);
	});

	test('empty model', function () {
		const viewsDescriptorsModel = new ViewDescriptorsModel(contextKeyService);
		const model = new ContributableViewsModel(viewsDescriptorsModel);
		assert.equal(model.visibleViewDescriptors.length, 0);
	});

	test('register/unregister', () => {
		const viewsDescriptorsModel = new ViewDescriptorsModel(contextKeyService);
		const model = new ContributableViewsModel(viewsDescriptorsModel);
		const seq = new ViewDescriptorSequence(model);

		assert.equal(model.visibleViewDescriptors.length, 0);
		assert.equal(seq.elements.length, 0);

		const viewDescriptor: IViewDescriptor = {
			id: 'view1',
			ctorDescriptor: null!,
			name: 'Test View 1'
		};

		viewsDescriptorsModel.addViews([viewDescriptor]);

		assert.equal(model.visibleViewDescriptors.length, 1);
		assert.equal(seq.elements.length, 1);
		assert.deepEqual(model.visibleViewDescriptors[0], viewDescriptor);
		assert.deepEqual(seq.elements[0], viewDescriptor);

		viewsDescriptorsModel.removeViews([viewDescriptor]);

		assert.equal(model.visibleViewDescriptors.length, 0);
		assert.equal(seq.elements.length, 0);
	});

	test('when contexts', async function () {
		const viewsDescriptorsModel = new ViewDescriptorsModel(contextKeyService);
		const model = new ContributableViewsModel(viewsDescriptorsModel);
		const seq = new ViewDescriptorSequence(model);

		assert.equal(model.visibleViewDescriptors.length, 0);
		assert.equal(seq.elements.length, 0);

		const viewDescriptor: IViewDescriptor = {
			id: 'view1',
			ctorDescriptor: null!,
			name: 'Test View 1',
			when: ContextKeyExpr.equals('showview1', true)
		};

		viewsDescriptorsModel.addViews([viewDescriptor]);
		assert.equal(model.visibleViewDescriptors.length, 0, 'view should not appear since context isnt in');
		assert.equal(seq.elements.length, 0);

		const key = contextKeyService.createKey('showview1', false);
		assert.equal(model.visibleViewDescriptors.length, 0, 'view should still not appear since showview1 isnt true');
		assert.equal(seq.elements.length, 0);

		key.set(true);
		await new Promise(c => setTimeout(c, 30));
		assert.equal(model.visibleViewDescriptors.length, 1, 'view should appear');
		assert.equal(seq.elements.length, 1);
		assert.deepEqual(model.visibleViewDescriptors[0], viewDescriptor);
		assert.equal(seq.elements[0], viewDescriptor);

		key.set(false);
		await new Promise(c => setTimeout(c, 30));
		assert.equal(model.visibleViewDescriptors.length, 0, 'view should disappear');
		assert.equal(seq.elements.length, 0);

		viewsDescriptorsModel.removeViews([viewDescriptor]);
		assert.equal(model.visibleViewDescriptors.length, 0, 'view should not be there anymore');
		assert.equal(seq.elements.length, 0);

		key.set(true);
		await new Promise(c => setTimeout(c, 30));
		assert.equal(model.visibleViewDescriptors.length, 0, 'view should not be there anymore');
		assert.equal(seq.elements.length, 0);
	});

	test('when contexts - multiple', async function () {
		const viewsDescriptorsModel = new ViewDescriptorsModel(contextKeyService);
		const model = new ContributableViewsModel(viewsDescriptorsModel);
		const seq = new ViewDescriptorSequence(model);

		const view1: IViewDescriptor = { id: 'view1', ctorDescriptor: null!, name: 'Test View 1' };
		const view2: IViewDescriptor = { id: 'view2', ctorDescriptor: null!, name: 'Test View 2', when: ContextKeyExpr.equals('showview2', true) };

		viewsDescriptorsModel.addViews([view1, view2]);
		assert.deepEqual(model.visibleViewDescriptors, [view1], 'only view1 should be visible');
		assert.deepEqual(seq.elements, [view1], 'only view1 should be visible');

		const key = contextKeyService.createKey('showview2', false);
		assert.deepEqual(model.visibleViewDescriptors, [view1], 'still only view1 should be visible');
		assert.deepEqual(seq.elements, [view1], 'still only view1 should be visible');

		key.set(true);
		await new Promise(c => setTimeout(c, 30));
		assert.deepEqual(model.visibleViewDescriptors, [view1, view2], 'both views should be visible');
		assert.deepEqual(seq.elements, [view1, view2], 'both views should be visible');

		viewsDescriptorsModel.removeViews([view1, view2]);
	});

	test('when contexts - multiple 2', async function () {
		const viewsDescriptorsModel = new ViewDescriptorsModel(contextKeyService);
		const model = new ContributableViewsModel(viewsDescriptorsModel);
		const seq = new ViewDescriptorSequence(model);

		const view1: IViewDescriptor = { id: 'view1', ctorDescriptor: null!, name: 'Test View 1', when: ContextKeyExpr.equals('showview1', true) };
		const view2: IViewDescriptor = { id: 'view2', ctorDescriptor: null!, name: 'Test View 2' };

		viewsDescriptorsModel.addViews([view1, view2]);
		assert.deepEqual(model.visibleViewDescriptors, [view2], 'only view2 should be visible');
		assert.deepEqual(seq.elements, [view2], 'only view2 should be visible');

		const key = contextKeyService.createKey('showview1', false);
		assert.deepEqual(model.visibleViewDescriptors, [view2], 'still only view2 should be visible');
		assert.deepEqual(seq.elements, [view2], 'still only view2 should be visible');

		key.set(true);
		await new Promise(c => setTimeout(c, 30));
		assert.deepEqual(model.visibleViewDescriptors, [view1, view2], 'both views should be visible');
		assert.deepEqual(seq.elements, [view1, view2], 'both views should be visible');

		viewsDescriptorsModel.removeViews([view1, view2]);
	});

	test('setVisible', () => {
		const viewsDescriptorsModel = new ViewDescriptorsModel(contextKeyService);
		const model = new ContributableViewsModel(viewsDescriptorsModel);
		const seq = new ViewDescriptorSequence(model);

		const view1: IViewDescriptor = { id: 'view1', ctorDescriptor: null!, name: 'Test View 1', canToggleVisibility: true };
		const view2: IViewDescriptor = { id: 'view2', ctorDescriptor: null!, name: 'Test View 2', canToggleVisibility: true };
		const view3: IViewDescriptor = { id: 'view3', ctorDescriptor: null!, name: 'Test View 3', canToggleVisibility: true };

		viewsDescriptorsModel.addViews([view1, view2, view3]);
		assert.deepEqual(model.visibleViewDescriptors, [view1, view2, view3]);
		assert.deepEqual(seq.elements, [view1, view2, view3]);

		model.setVisible('view2', true);
		assert.deepEqual(model.visibleViewDescriptors, [view1, view2, view3], 'nothing should happen');
		assert.deepEqual(seq.elements, [view1, view2, view3]);

		model.setVisible('view2', false);
		assert.deepEqual(model.visibleViewDescriptors, [view1, view3], 'view2 should hide');
		assert.deepEqual(seq.elements, [view1, view3]);

		model.setVisible('view1', false);
		assert.deepEqual(model.visibleViewDescriptors, [view3], 'view1 should hide');
		assert.deepEqual(seq.elements, [view3]);

		model.setVisible('view3', false);
		assert.deepEqual(model.visibleViewDescriptors, [], 'view3 shoud hide');
		assert.deepEqual(seq.elements, []);

		model.setVisible('view1', true);
		assert.deepEqual(model.visibleViewDescriptors, [view1], 'view1 should show');
		assert.deepEqual(seq.elements, [view1]);

		model.setVisible('view3', true);
		assert.deepEqual(model.visibleViewDescriptors, [view1, view3], 'view3 should show');
		assert.deepEqual(seq.elements, [view1, view3]);

		model.setVisible('view2', true);
		assert.deepEqual(model.visibleViewDescriptors, [view1, view2, view3], 'view2 should show');
		assert.deepEqual(seq.elements, [view1, view2, view3]);

		viewsDescriptorsModel.removeViews([view1, view2, view3]);
		assert.deepEqual(model.visibleViewDescriptors, []);
		assert.deepEqual(seq.elements, []);
	});

	test('move', () => {
		const viewsDescriptorsModel = new ViewDescriptorsModel(contextKeyService);
		const model = new ContributableViewsModel(viewsDescriptorsModel);
		const seq = new ViewDescriptorSequence(model);

		const view1: IViewDescriptor = { id: 'view1', ctorDescriptor: null!, name: 'Test View 1' };
		const view2: IViewDescriptor = { id: 'view2', ctorDescriptor: null!, name: 'Test View 2' };
		const view3: IViewDescriptor = { id: 'view3', ctorDescriptor: null!, name: 'Test View 3' };

		viewsDescriptorsModel.addViews([view1, view2, view3]);
		assert.deepEqual(model.visibleViewDescriptors, [view1, view2, view3], 'model views should be OK');
		assert.deepEqual(seq.elements, [view1, view2, view3], 'sql views should be OK');

		model.move('view3', 'view1');
		assert.deepEqual(model.visibleViewDescriptors, [view3, view1, view2], 'view3 should go to the front');
		assert.deepEqual(seq.elements, [view3, view1, view2]);

		model.move('view1', 'view2');
		assert.deepEqual(model.visibleViewDescriptors, [view3, view2, view1], 'view1 should go to the end');
		assert.deepEqual(seq.elements, [view3, view2, view1]);

		model.move('view1', 'view3');
		assert.deepEqual(model.visibleViewDescriptors, [view1, view3, view2], 'view1 should go to the front');
		assert.deepEqual(seq.elements, [view1, view3, view2]);

		model.move('view2', 'view3');
		assert.deepEqual(model.visibleViewDescriptors, [view1, view2, view3], 'view2 should go to the middle');
		assert.deepEqual(seq.elements, [view1, view2, view3]);
	});

	test('view states', async function () {
		const viewStates = new Map<string, IViewState>();
		viewStates.set('view1', { visibleGlobal: false, collapsed: false, visibleWorkspace: undefined });
		const viewsDescriptorsModel = new ViewDescriptorsModel(contextKeyService);
		const model = new ContributableViewsModel(viewsDescriptorsModel, viewStates);
		const seq = new ViewDescriptorSequence(model);

		assert.equal(model.visibleViewDescriptors.length, 0);
		assert.equal(seq.elements.length, 0);

		const viewDescriptor: IViewDescriptor = {
			id: 'view1',
			ctorDescriptor: null!,
			name: 'Test View 1'
		};

		viewsDescriptorsModel.addViews([viewDescriptor]);
		assert.equal(model.visibleViewDescriptors.length, 0, 'view should not appear since it was set not visible in view state');
		assert.equal(seq.elements.length, 0);
	});

	test('view states and when contexts', async function () {
		const viewStates = new Map<string, IViewState>();
		viewStates.set('view1', { visibleGlobal: false, collapsed: false, visibleWorkspace: undefined });
		const viewsDescriptorsModel = new ViewDescriptorsModel(contextKeyService);
		const model = new ContributableViewsModel(viewsDescriptorsModel, viewStates);
		const seq = new ViewDescriptorSequence(model);

		assert.equal(model.visibleViewDescriptors.length, 0);
		assert.equal(seq.elements.length, 0);

		const viewDescriptor: IViewDescriptor = {
			id: 'view1',
			ctorDescriptor: null!,
			name: 'Test View 1',
			when: ContextKeyExpr.equals('showview1', true)
		};

		viewsDescriptorsModel.addViews([viewDescriptor]);
		assert.equal(model.visibleViewDescriptors.length, 0, 'view should not appear since context isnt in');
		assert.equal(seq.elements.length, 0);

		const key = contextKeyService.createKey('showview1', false);
		assert.equal(model.visibleViewDescriptors.length, 0, 'view should still not appear since showview1 isnt true');
		assert.equal(seq.elements.length, 0);

		key.set(true);
		await new Promise(c => setTimeout(c, 30));
		assert.equal(model.visibleViewDescriptors.length, 0, 'view should still not appear since it was set not visible in view state');
		assert.equal(seq.elements.length, 0);
	});

	test('view states and when contexts multiple views', async function () {
		const viewStates = new Map<string, IViewState>();
		viewStates.set('view1', { visibleGlobal: false, collapsed: false, visibleWorkspace: undefined });
		const viewsDescriptorsModel = new ViewDescriptorsModel(contextKeyService);
		const model = new ContributableViewsModel(viewsDescriptorsModel, viewStates);
		const seq = new ViewDescriptorSequence(model);

		assert.equal(model.visibleViewDescriptors.length, 0);
		assert.equal(seq.elements.length, 0);

		const view1: IViewDescriptor = {
			id: 'view1',
			ctorDescriptor: null!,
			name: 'Test View 1',
			when: ContextKeyExpr.equals('showview', true)
		};
		const view2: IViewDescriptor = {
			id: 'view2',
			ctorDescriptor: null!,
			name: 'Test View 2',
		};
		const view3: IViewDescriptor = {
			id: 'view3',
			ctorDescriptor: null!,
			name: 'Test View 3',
			when: ContextKeyExpr.equals('showview', true)
		};

		viewsDescriptorsModel.addViews([view1, view2, view3]);
		assert.deepEqual(model.visibleViewDescriptors, [view2], 'Only view2 should be visible');
		assert.deepEqual(seq.elements, [view2]);

		const key = contextKeyService.createKey('showview', false);
		assert.deepEqual(model.visibleViewDescriptors, [view2], 'Only view2 should be visible');
		assert.deepEqual(seq.elements, [view2]);

		key.set(true);
		await new Promise(c => setTimeout(c, 30));
		assert.deepEqual(model.visibleViewDescriptors, [view2, view3], 'view3 should be visible');
		assert.deepEqual(seq.elements, [view2, view3]);

		key.set(false);
		await new Promise(c => setTimeout(c, 30));
		assert.deepEqual(model.visibleViewDescriptors, [view2], 'Only view2 should be visible');
		assert.deepEqual(seq.elements, [view2]);
	});

	test('remove event is not triggered if view was hidden and removed', async function () {
		const viewsDescriptorsModel = new ViewDescriptorsModel(contextKeyService);
		const model = new ContributableViewsModel(viewsDescriptorsModel);
		const seq = new ViewDescriptorSequence(model);

		const viewDescriptor: IViewDescriptor = {
			id: 'view1',
			ctorDescriptor: null!,
			name: 'Test View 1',
			when: ContextKeyExpr.equals('showview1', true),
			canToggleVisibility: true
		};

		viewsDescriptorsModel.addViews([viewDescriptor]);

		const key = contextKeyService.createKey('showview1', true);
		await new Promise(c => setTimeout(c, 30));
		assert.equal(model.visibleViewDescriptors.length, 1, 'view should appear after context is set');
		assert.equal(seq.elements.length, 1);

		model.setVisible('view1', false);
		assert.equal(model.visibleViewDescriptors.length, 0, 'view should disappear after setting visibility to false');
		assert.equal(seq.elements.length, 0);

		const target = sinon.spy(model.onDidRemove);
		key.set(false);
		await new Promise(c => setTimeout(c, 30));
		assert.ok(!target.called, 'remove event should not be called since it is already hidden');
	});

});
