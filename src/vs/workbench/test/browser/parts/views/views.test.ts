/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ContributableViewsModel, IViewState } from 'vs/workbench/browser/parts/views/views';
import { IViewsRegistry, IViewDescriptor, IViewContainersRegistry, Extensions as ViewContainerExtensions, IViewDescriptorService, ViewContainerLocation, ViewContainer } from 'vs/workbench/common/views';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { move } from 'vs/base/common/arrays';
import { Registry } from 'vs/platform/registry/common/platform';
import { workbenchInstantiationService } from 'vs/workbench/test/browser/workbenchTestServices';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { ContextKeyService } from 'vs/platform/contextkey/browser/contextKeyService';
import sinon = require('sinon');
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { ViewDescriptorService } from 'vs/workbench/services/views/browser/viewDescriptorService';
import { assertIsDefined } from 'vs/base/common/types';

const container = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({ id: 'test', name: 'test', ctorDescriptor: new SyncDescriptor(<any>{}) }, ViewContainerLocation.Sidebar);
const ViewsRegistry = Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry);

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

	let viewDescriptorService: IViewDescriptorService;
	let contextKeyService: IContextKeyService;

	setup(() => {
		const instantiationService: TestInstantiationService = <TestInstantiationService>workbenchInstantiationService();
		contextKeyService = instantiationService.createInstance(ContextKeyService);
		instantiationService.stub(IContextKeyService, contextKeyService);
		viewDescriptorService = instantiationService.createInstance(ViewDescriptorService);
	});

	teardown(() => {
		ViewsRegistry.deregisterViews(ViewsRegistry.getViews(container), container);
	});

	test('empty model', function () {
		const model = new ContributableViewsModel(container, viewDescriptorService);
		assert.equal(model.visibleViewDescriptors.length, 0);
	});

	test('register/unregister', () => {
		const model = new ContributableViewsModel(container, viewDescriptorService);
		const seq = new ViewDescriptorSequence(model);

		assert.equal(model.visibleViewDescriptors.length, 0);
		assert.equal(seq.elements.length, 0);

		const viewDescriptor: IViewDescriptor = {
			id: 'view1',
			ctorDescriptor: null!,
			name: 'Test View 1'
		};

		ViewsRegistry.registerViews([viewDescriptor], container);

		assert.equal(model.visibleViewDescriptors.length, 1);
		assert.equal(seq.elements.length, 1);
		assert.deepEqual(model.visibleViewDescriptors[0], viewDescriptor);
		assert.deepEqual(seq.elements[0], viewDescriptor);

		ViewsRegistry.deregisterViews([viewDescriptor], container);

		assert.equal(model.visibleViewDescriptors.length, 0);
		assert.equal(seq.elements.length, 0);
	});

	test('when contexts', async function () {
		const model = new ContributableViewsModel(container, viewDescriptorService);
		const seq = new ViewDescriptorSequence(model);

		assert.equal(model.visibleViewDescriptors.length, 0);
		assert.equal(seq.elements.length, 0);

		const viewDescriptor: IViewDescriptor = {
			id: 'view1',
			ctorDescriptor: null!,
			name: 'Test View 1',
			when: ContextKeyExpr.equals('showview1', true)
		};

		ViewsRegistry.registerViews([viewDescriptor], container);
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

		ViewsRegistry.deregisterViews([viewDescriptor], container);
		assert.equal(model.visibleViewDescriptors.length, 0, 'view should not be there anymore');
		assert.equal(seq.elements.length, 0);

		key.set(true);
		await new Promise(c => setTimeout(c, 30));
		assert.equal(model.visibleViewDescriptors.length, 0, 'view should not be there anymore');
		assert.equal(seq.elements.length, 0);
	});

	test('when contexts - multiple', async function () {
		const model = new ContributableViewsModel(container, viewDescriptorService);
		const seq = new ViewDescriptorSequence(model);

		const view1: IViewDescriptor = { id: 'view1', ctorDescriptor: null!, name: 'Test View 1' };
		const view2: IViewDescriptor = { id: 'view2', ctorDescriptor: null!, name: 'Test View 2', when: ContextKeyExpr.equals('showview2', true) };

		ViewsRegistry.registerViews([view1, view2], container);
		assert.deepEqual(model.visibleViewDescriptors, [view1], 'only view1 should be visible');
		assert.deepEqual(seq.elements, [view1], 'only view1 should be visible');

		const key = contextKeyService.createKey('showview2', false);
		assert.deepEqual(model.visibleViewDescriptors, [view1], 'still only view1 should be visible');
		assert.deepEqual(seq.elements, [view1], 'still only view1 should be visible');

		key.set(true);
		await new Promise(c => setTimeout(c, 30));
		assert.deepEqual(model.visibleViewDescriptors, [view1, view2], 'both views should be visible');
		assert.deepEqual(seq.elements, [view1, view2], 'both views should be visible');

		ViewsRegistry.deregisterViews([view1, view2], container);
	});

	test('when contexts - multiple 2', async function () {
		const model = new ContributableViewsModel(container, viewDescriptorService);
		const seq = new ViewDescriptorSequence(model);

		const view1: IViewDescriptor = { id: 'view1', ctorDescriptor: null!, name: 'Test View 1', when: ContextKeyExpr.equals('showview1', true) };
		const view2: IViewDescriptor = { id: 'view2', ctorDescriptor: null!, name: 'Test View 2' };

		ViewsRegistry.registerViews([view1, view2], container);
		assert.deepEqual(model.visibleViewDescriptors, [view2], 'only view2 should be visible');
		assert.deepEqual(seq.elements, [view2], 'only view2 should be visible');

		const key = contextKeyService.createKey('showview1', false);
		assert.deepEqual(model.visibleViewDescriptors, [view2], 'still only view2 should be visible');
		assert.deepEqual(seq.elements, [view2], 'still only view2 should be visible');

		key.set(true);
		await new Promise(c => setTimeout(c, 30));
		assert.deepEqual(model.visibleViewDescriptors, [view1, view2], 'both views should be visible');
		assert.deepEqual(seq.elements, [view1, view2], 'both views should be visible');

		ViewsRegistry.deregisterViews([view1, view2], container);
	});

	test('setVisible', () => {
		const model = new ContributableViewsModel(container, viewDescriptorService);
		const seq = new ViewDescriptorSequence(model);

		const view1: IViewDescriptor = { id: 'view1', ctorDescriptor: null!, name: 'Test View 1', canToggleVisibility: true };
		const view2: IViewDescriptor = { id: 'view2', ctorDescriptor: null!, name: 'Test View 2', canToggleVisibility: true };
		const view3: IViewDescriptor = { id: 'view3', ctorDescriptor: null!, name: 'Test View 3', canToggleVisibility: true };

		ViewsRegistry.registerViews([view1, view2, view3], container);
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

		ViewsRegistry.deregisterViews([view1, view2, view3], container);
		assert.deepEqual(model.visibleViewDescriptors, []);
		assert.deepEqual(seq.elements, []);
	});

	test('move', () => {
		const model = new ContributableViewsModel(container, viewDescriptorService);
		const seq = new ViewDescriptorSequence(model);

		const view1: IViewDescriptor = { id: 'view1', ctorDescriptor: null!, name: 'Test View 1' };
		const view2: IViewDescriptor = { id: 'view2', ctorDescriptor: null!, name: 'Test View 2' };
		const view3: IViewDescriptor = { id: 'view3', ctorDescriptor: null!, name: 'Test View 3' };

		ViewsRegistry.registerViews([view1, view2, view3], container);
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
		const model = new ContributableViewsModel(container, viewDescriptorService, viewStates);
		const seq = new ViewDescriptorSequence(model);

		assert.equal(model.visibleViewDescriptors.length, 0);
		assert.equal(seq.elements.length, 0);

		const viewDescriptor: IViewDescriptor = {
			id: 'view1',
			ctorDescriptor: null!,
			name: 'Test View 1'
		};

		ViewsRegistry.registerViews([viewDescriptor], container);
		assert.equal(model.visibleViewDescriptors.length, 0, 'view should not appear since it was set not visible in view state');
		assert.equal(seq.elements.length, 0);
	});

	test('view states and when contexts', async function () {
		const viewStates = new Map<string, IViewState>();
		viewStates.set('view1', { visibleGlobal: false, collapsed: false, visibleWorkspace: undefined });
		const model = new ContributableViewsModel(container, viewDescriptorService, viewStates);
		const seq = new ViewDescriptorSequence(model);

		assert.equal(model.visibleViewDescriptors.length, 0);
		assert.equal(seq.elements.length, 0);

		const viewDescriptor: IViewDescriptor = {
			id: 'view1',
			ctorDescriptor: null!,
			name: 'Test View 1',
			when: ContextKeyExpr.equals('showview1', true)
		};

		ViewsRegistry.registerViews([viewDescriptor], container);
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
		const model = new ContributableViewsModel(container, viewDescriptorService, viewStates);
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

		ViewsRegistry.registerViews([view1, view2, view3], container);
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
		const model = new ContributableViewsModel(container, viewDescriptorService);
		const seq = new ViewDescriptorSequence(model);

		const viewDescriptor: IViewDescriptor = {
			id: 'view1',
			ctorDescriptor: null!,
			name: 'Test View 1',
			when: ContextKeyExpr.equals('showview1', true),
			canToggleVisibility: true
		};

		ViewsRegistry.registerViews([viewDescriptor], container);

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

const sidebarContainer = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({ id: 'testSidebar', name: 'test', ctorDescriptor: new SyncDescriptor(<any>{}) }, ViewContainerLocation.Sidebar);
const panelContainer = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({ id: 'testPanel', name: 'test', ctorDescriptor: new SyncDescriptor(<any>{}) }, ViewContainerLocation.Panel);

suite('ViewDescriptorService', () => {

	let viewDescriptorService: IViewDescriptorService;

	setup(() => {
		const instantiationService: TestInstantiationService = <TestInstantiationService>workbenchInstantiationService();
		viewDescriptorService = instantiationService.createInstance(ViewDescriptorService);
	});

	teardown(() => {
		ViewsRegistry.deregisterViews(ViewsRegistry.getViews(sidebarContainer), sidebarContainer);
		ViewsRegistry.deregisterViews(ViewsRegistry.getViews(panelContainer), panelContainer);
	});

	test('Empty Containers', function () {
		const sidebarViews = viewDescriptorService.getViewDescriptors(sidebarContainer);
		const panelViews = viewDescriptorService.getViewDescriptors(panelContainer);
		assert.equal(sidebarViews.allViewDescriptors.length, 0, 'The sidebar container should have no views yet.');
		assert.equal(panelViews.allViewDescriptors.length, 0, 'The panel container should have no views yet.');
	});

	test('Register/Deregister', () => {
		const viewDescriptors: IViewDescriptor[] = [
			{
				id: 'view1',
				ctorDescriptor: null!,
				name: 'Test View 1',
				canMoveView: true
			},
			{
				id: 'view2',
				ctorDescriptor: null!,
				name: 'Test View 2',
				canMoveView: true
			},
			{
				id: 'view3',
				ctorDescriptor: null!,
				name: 'Test View 3',
				canMoveView: true
			}
		];


		ViewsRegistry.registerViews(viewDescriptors.slice(0, 2), sidebarContainer);
		ViewsRegistry.registerViews(viewDescriptors.slice(2), panelContainer);


		let sidebarViews = viewDescriptorService.getViewDescriptors(sidebarContainer);
		let panelViews = viewDescriptorService.getViewDescriptors(panelContainer);

		assert.equal(sidebarViews.activeViewDescriptors.length, 2, 'Sidebar should have 2 views');
		assert.equal(panelViews.activeViewDescriptors.length, 1, 'Panel should have 1 view');

		ViewsRegistry.deregisterViews(viewDescriptors.slice(0, 2), sidebarContainer);
		ViewsRegistry.deregisterViews(viewDescriptors.slice(2), panelContainer);


		sidebarViews = viewDescriptorService.getViewDescriptors(sidebarContainer);
		panelViews = viewDescriptorService.getViewDescriptors(panelContainer);

		assert.equal(sidebarViews.activeViewDescriptors.length, 0, 'Sidebar should have no views');
		assert.equal(panelViews.activeViewDescriptors.length, 0, 'Panel should have no views');
	});

	test('move views to existing containers', async function () {
		const viewDescriptors: IViewDescriptor[] = [
			{
				id: 'view1',
				ctorDescriptor: null!,
				name: 'Test View 1',
				canMoveView: true
			},
			{
				id: 'view2',
				ctorDescriptor: null!,
				name: 'Test View 2',
				canMoveView: true
			},
			{
				id: 'view3',
				ctorDescriptor: null!,
				name: 'Test View 3',
				canMoveView: true
			}
		];

		ViewsRegistry.registerViews(viewDescriptors.slice(0, 2), sidebarContainer);
		ViewsRegistry.registerViews(viewDescriptors.slice(2), panelContainer);

		viewDescriptorService.moveViewsToContainer(viewDescriptors.slice(2), sidebarContainer);
		viewDescriptorService.moveViewsToContainer(viewDescriptors.slice(0, 2), panelContainer);

		let sidebarViews = viewDescriptorService.getViewDescriptors(sidebarContainer);
		let panelViews = viewDescriptorService.getViewDescriptors(panelContainer);

		assert.equal(sidebarViews.activeViewDescriptors.length, 1, 'Sidebar should have 2 views');
		assert.equal(panelViews.activeViewDescriptors.length, 2, 'Panel should have 1 view');

		assert.notEqual(sidebarViews.activeViewDescriptors.indexOf(viewDescriptors[2]), -1, `Sidebar should have ${viewDescriptors[2].name}`);
		assert.notEqual(panelViews.activeViewDescriptors.indexOf(viewDescriptors[0]), -1, `Panel should have ${viewDescriptors[0].name}`);
		assert.notEqual(panelViews.activeViewDescriptors.indexOf(viewDescriptors[1]), -1, `Panel should have ${viewDescriptors[1].name}`);
	});

	test('move views to generated containers', async function () {
		const viewDescriptors: IViewDescriptor[] = [
			{
				id: 'view1',
				ctorDescriptor: null!,
				name: 'Test View 1',
				canMoveView: true
			},
			{
				id: 'view2',
				ctorDescriptor: null!,
				name: 'Test View 2',
				canMoveView: true
			},
			{
				id: 'view3',
				ctorDescriptor: null!,
				name: 'Test View 3',
				canMoveView: true
			}
		];

		ViewsRegistry.registerViews(viewDescriptors.slice(0, 2), sidebarContainer);
		ViewsRegistry.registerViews(viewDescriptors.slice(2), panelContainer);

		viewDescriptorService.moveViewToLocation(viewDescriptors[0], ViewContainerLocation.Panel);
		viewDescriptorService.moveViewToLocation(viewDescriptors[2], ViewContainerLocation.Sidebar);

		let sidebarViews = viewDescriptorService.getViewDescriptors(sidebarContainer);
		let panelViews = viewDescriptorService.getViewDescriptors(panelContainer);

		assert.equal(sidebarViews.activeViewDescriptors.length, 1, 'Sidebar container should have 1 view');
		assert.equal(panelViews.activeViewDescriptors.length, 0, 'Panel container should have no views');

		const generatedPanel = assertIsDefined(viewDescriptorService.getViewContainer(viewDescriptors[0].id));
		const generatedSidebar = assertIsDefined(viewDescriptorService.getViewContainer(viewDescriptors[2].id));

		assert.equal(viewDescriptorService.getViewContainerLocation(generatedPanel), ViewContainerLocation.Panel, 'Generated Panel should be in located in the panel');
		assert.equal(viewDescriptorService.getViewContainerLocation(generatedSidebar), ViewContainerLocation.Sidebar, 'Generated Sidebar should be in located in the sidebar');

		assert.equal(viewDescriptorService.getViewContainerLocation(generatedPanel), viewDescriptorService.getViewLocation(viewDescriptors[0].id), 'Panel view location and container location should match');
		assert.equal(viewDescriptorService.getViewContainerLocation(generatedSidebar), viewDescriptorService.getViewLocation(viewDescriptors[2].id), 'Sidebar view location and container location should match');

		assert.equal(viewDescriptorService.getDefaultContainer(viewDescriptors[2].id), panelContainer, `${viewDescriptors[2].name} has wrong default container`);
		assert.equal(viewDescriptorService.getDefaultContainer(viewDescriptors[0].id), sidebarContainer, `${viewDescriptors[0].name} has wrong default container`);

		viewDescriptorService.moveViewToLocation(viewDescriptors[0], ViewContainerLocation.Sidebar);
		viewDescriptorService.moveViewToLocation(viewDescriptors[2], ViewContainerLocation.Panel);

		sidebarViews = viewDescriptorService.getViewDescriptors(sidebarContainer);
		panelViews = viewDescriptorService.getViewDescriptors(panelContainer);

		assert.equal(sidebarViews.activeViewDescriptors.length, 1, 'Sidebar should have 2 views');
		assert.equal(panelViews.activeViewDescriptors.length, 0, 'Panel should have 1 view');

		assert.equal(viewDescriptorService.getViewLocation(viewDescriptors[0].id), ViewContainerLocation.Sidebar, 'View should be located in the sidebar');
		assert.equal(viewDescriptorService.getViewLocation(viewDescriptors[2].id), ViewContainerLocation.Panel, 'View should be located in the panel');
	});

	test('move view events', async function () {
		const viewDescriptors: IViewDescriptor[] = [
			{
				id: 'view1',
				ctorDescriptor: null!,
				name: 'Test View 1',
				canMoveView: true
			},
			{
				id: 'view2',
				ctorDescriptor: null!,
				name: 'Test View 2',
				canMoveView: true
			},
			{
				id: 'view3',
				ctorDescriptor: null!,
				name: 'Test View 3',
				canMoveView: true
			}
		];


		let expectedSequence = '';
		let actualSequence = '';
		const disposables = [];

		const containerMoveString = (view: IViewDescriptor, from: ViewContainer, to: ViewContainer) => {
			return `Moved ${view.id} from ${from.id} to ${to.id}\n`;
		};

		const locationMoveString = (view: IViewDescriptor, from: ViewContainerLocation, to: ViewContainerLocation) => {
			return `Moved ${view.id} from ${from === ViewContainerLocation.Sidebar ? 'Sidebar' : 'Panel'} to ${to === ViewContainerLocation.Sidebar ? 'Sidebar' : 'Panel'}\n`;
		};
		disposables.push(viewDescriptorService.onDidChangeContainer(({ views, from, to }) => {
			views.forEach(view => {
				actualSequence += containerMoveString(view, from, to);
			});
		}));

		disposables.push(viewDescriptorService.onDidChangeLocation(({ views, from, to }) => {
			views.forEach(view => {
				actualSequence += locationMoveString(view, from, to);
			});
		}));

		ViewsRegistry.registerViews(viewDescriptors.slice(0, 2), sidebarContainer);
		ViewsRegistry.registerViews(viewDescriptors.slice(2), panelContainer);

		expectedSequence += locationMoveString(viewDescriptors[0], ViewContainerLocation.Sidebar, ViewContainerLocation.Panel);
		viewDescriptorService.moveViewToLocation(viewDescriptors[0], ViewContainerLocation.Panel);
		expectedSequence += containerMoveString(viewDescriptors[0], sidebarContainer, viewDescriptorService.getViewContainer(viewDescriptors[0].id)!);

		expectedSequence += locationMoveString(viewDescriptors[2], ViewContainerLocation.Panel, ViewContainerLocation.Sidebar);
		viewDescriptorService.moveViewToLocation(viewDescriptors[2], ViewContainerLocation.Sidebar);
		expectedSequence += containerMoveString(viewDescriptors[2], panelContainer, viewDescriptorService.getViewContainer(viewDescriptors[2].id)!);


		expectedSequence += locationMoveString(viewDescriptors[0], ViewContainerLocation.Panel, ViewContainerLocation.Sidebar);
		expectedSequence += containerMoveString(viewDescriptors[0], viewDescriptorService.getViewContainer(viewDescriptors[0].id)!, sidebarContainer);
		viewDescriptorService.moveViewsToContainer([viewDescriptors[0]], sidebarContainer);

		expectedSequence += locationMoveString(viewDescriptors[2], ViewContainerLocation.Sidebar, ViewContainerLocation.Panel);
		expectedSequence += containerMoveString(viewDescriptors[2], viewDescriptorService.getViewContainer(viewDescriptors[2].id)!, panelContainer);
		viewDescriptorService.moveViewsToContainer([viewDescriptors[2]], panelContainer);

		expectedSequence += locationMoveString(viewDescriptors[0], ViewContainerLocation.Sidebar, ViewContainerLocation.Panel);
		expectedSequence += containerMoveString(viewDescriptors[0], sidebarContainer, panelContainer);
		viewDescriptorService.moveViewsToContainer([viewDescriptors[0]], panelContainer);

		expectedSequence += locationMoveString(viewDescriptors[2], ViewContainerLocation.Panel, ViewContainerLocation.Sidebar);
		expectedSequence += containerMoveString(viewDescriptors[2], panelContainer, sidebarContainer);
		viewDescriptorService.moveViewsToContainer([viewDescriptors[2]], sidebarContainer);

		expectedSequence += locationMoveString(viewDescriptors[1], ViewContainerLocation.Sidebar, ViewContainerLocation.Panel);
		expectedSequence += locationMoveString(viewDescriptors[2], ViewContainerLocation.Sidebar, ViewContainerLocation.Panel);
		expectedSequence += containerMoveString(viewDescriptors[1], sidebarContainer, panelContainer);
		expectedSequence += containerMoveString(viewDescriptors[2], sidebarContainer, panelContainer);
		viewDescriptorService.moveViewsToContainer([viewDescriptors[1], viewDescriptors[2]], panelContainer);

		assert.equal(actualSequence, expectedSequence, 'Event sequence not matching expected sequence');
	});

});
