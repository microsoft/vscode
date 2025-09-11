/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../../nls.js';
import assert from 'assert';
import { IViewsRegistry, IViewDescriptor, IViewContainersRegistry, Extensions as ViewContainerExtensions, ViewContainerLocation, ViewContainer, ViewContainerLocationToString } from '../../../../common/views.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { ViewDescriptorService } from '../../browser/viewDescriptorService.js';
import { assertReturnsDefined } from '../../../../../base/common/types.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { compare } from '../../../../../base/common/strings.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

const ViewsRegistry = Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry);
const ViewContainersRegistry = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry);
const viewContainerIdPrefix = 'testViewContainer';
const sidebarContainer = ViewContainersRegistry.registerViewContainer({ id: `${viewContainerIdPrefix}-${generateUuid()}`, title: nls.localize2('test', 'test'), ctorDescriptor: new SyncDescriptor(<any>{}) }, ViewContainerLocation.Sidebar);
const panelContainer = ViewContainersRegistry.registerViewContainer({ id: `${viewContainerIdPrefix}-${generateUuid()}`, title: nls.localize2('test', 'test'), ctorDescriptor: new SyncDescriptor(<any>{}) }, ViewContainerLocation.Panel);

suite('ViewDescriptorService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let instantiationService: TestInstantiationService;

	setup(() => {
		disposables.add(instantiationService = workbenchInstantiationService(undefined, disposables));
		instantiationService.stub(IContextKeyService, disposables.add(instantiationService.createInstance(ContextKeyService)));
	});

	teardown(() => {
		for (const viewContainer of ViewContainersRegistry.all) {
			if (viewContainer.id.startsWith(viewContainerIdPrefix)) {
				ViewsRegistry.deregisterViews(ViewsRegistry.getViews(viewContainer), viewContainer);
			}
		}
	});

	function aViewDescriptorService(): ViewDescriptorService {
		return disposables.add(instantiationService.createInstance(ViewDescriptorService));
	}

	test('Empty Containers', function () {
		const testObject = aViewDescriptorService();
		const sidebarViews = testObject.getViewContainerModel(sidebarContainer);
		const panelViews = testObject.getViewContainerModel(panelContainer);
		assert.strictEqual(sidebarViews.allViewDescriptors.length, 0, 'The sidebar container should have no views yet.');
		assert.strictEqual(panelViews.allViewDescriptors.length, 0, 'The panel container should have no views yet.');
	});

	test('Register/Deregister', () => {
		const testObject = aViewDescriptorService();
		const viewDescriptors: IViewDescriptor[] = [
			{
				id: 'view1',
				ctorDescriptor: null!,
				name: nls.localize2('Test View 1', 'Test View 1'),
				canMoveView: true
			},
			{
				id: 'view2',
				ctorDescriptor: null!,
				name: nls.localize2('Test View 2', 'Test View 2'),
				canMoveView: true
			},
			{
				id: 'view3',
				ctorDescriptor: null!,
				name: nls.localize2('Test View 3', 'Test View 3'),
				canMoveView: true
			}
		];

		ViewsRegistry.registerViews(viewDescriptors.slice(0, 2), sidebarContainer);
		ViewsRegistry.registerViews(viewDescriptors.slice(2), panelContainer);

		let sidebarViews = testObject.getViewContainerModel(sidebarContainer);
		let panelViews = testObject.getViewContainerModel(panelContainer);

		assert.strictEqual(sidebarViews.activeViewDescriptors.length, 2, 'Sidebar should have 2 views');
		assert.strictEqual(panelViews.activeViewDescriptors.length, 1, 'Panel should have 1 view');

		ViewsRegistry.deregisterViews(viewDescriptors.slice(0, 2), sidebarContainer);
		ViewsRegistry.deregisterViews(viewDescriptors.slice(2), panelContainer);

		sidebarViews = testObject.getViewContainerModel(sidebarContainer);
		panelViews = testObject.getViewContainerModel(panelContainer);

		assert.strictEqual(sidebarViews.activeViewDescriptors.length, 0, 'Sidebar should have no views');
		assert.strictEqual(panelViews.activeViewDescriptors.length, 0, 'Panel should have no views');
	});

	test('move views to existing containers', async function () {
		const testObject = aViewDescriptorService();
		const viewDescriptors: IViewDescriptor[] = [
			{
				id: 'view1',
				ctorDescriptor: null!,
				name: nls.localize2('Test View 1', 'Test View 1'),
				canMoveView: true
			},
			{
				id: 'view2',
				ctorDescriptor: null!,
				name: nls.localize2('Test View 2', 'Test View 2'),
				canMoveView: true
			},
			{
				id: 'view3',
				ctorDescriptor: null!,
				name: nls.localize2('Test View 3', 'Test View 3'),
				canMoveView: true
			}
		];

		ViewsRegistry.registerViews(viewDescriptors.slice(0, 2), sidebarContainer);
		ViewsRegistry.registerViews(viewDescriptors.slice(2), panelContainer);

		testObject.moveViewsToContainer(viewDescriptors.slice(2), sidebarContainer);
		testObject.moveViewsToContainer(viewDescriptors.slice(0, 2), panelContainer);

		const sidebarViews = testObject.getViewContainerModel(sidebarContainer);
		const panelViews = testObject.getViewContainerModel(panelContainer);

		assert.strictEqual(sidebarViews.activeViewDescriptors.length, 1, 'Sidebar should have 2 views');
		assert.strictEqual(panelViews.activeViewDescriptors.length, 2, 'Panel should have 1 view');

		assert.notStrictEqual(sidebarViews.activeViewDescriptors.indexOf(viewDescriptors[2]), -1, `Sidebar should have ${viewDescriptors[2].name.value}`);
		assert.notStrictEqual(panelViews.activeViewDescriptors.indexOf(viewDescriptors[0]), -1, `Panel should have ${viewDescriptors[0].name.value}`);
		assert.notStrictEqual(panelViews.activeViewDescriptors.indexOf(viewDescriptors[1]), -1, `Panel should have ${viewDescriptors[1].name.value}`);
	});

	test('move views to generated containers', async function () {
		const testObject = aViewDescriptorService();
		const viewDescriptors: IViewDescriptor[] = [
			{
				id: 'view1',
				ctorDescriptor: null!,
				name: nls.localize2('Test View 1', 'Test View 1'),
				canMoveView: true
			},
			{
				id: 'view2',
				ctorDescriptor: null!,
				name: nls.localize2('Test View 2', 'Test View 2'),
				canMoveView: true
			},
			{
				id: 'view3',
				ctorDescriptor: null!,
				name: nls.localize2('Test View 3', 'Test View 3'),
				canMoveView: true
			}
		];

		ViewsRegistry.registerViews(viewDescriptors.slice(0, 2), sidebarContainer);
		ViewsRegistry.registerViews(viewDescriptors.slice(2), panelContainer);

		testObject.moveViewToLocation(viewDescriptors[0], ViewContainerLocation.Panel);
		testObject.moveViewToLocation(viewDescriptors[2], ViewContainerLocation.Sidebar);

		let sidebarViews = testObject.getViewContainerModel(sidebarContainer);
		let panelViews = testObject.getViewContainerModel(panelContainer);

		assert.strictEqual(sidebarViews.activeViewDescriptors.length, 1, 'Sidebar container should have 1 view');
		assert.strictEqual(panelViews.activeViewDescriptors.length, 0, 'Panel container should have no views');

		const generatedPanel = assertReturnsDefined(testObject.getViewContainerByViewId(viewDescriptors[0].id));
		const generatedSidebar = assertReturnsDefined(testObject.getViewContainerByViewId(viewDescriptors[2].id));

		assert.strictEqual(testObject.getViewContainerLocation(generatedPanel), ViewContainerLocation.Panel, 'Generated Panel should be in located in the panel');
		assert.strictEqual(testObject.getViewContainerLocation(generatedSidebar), ViewContainerLocation.Sidebar, 'Generated Sidebar should be in located in the sidebar');

		assert.strictEqual(testObject.getViewContainerLocation(generatedPanel), testObject.getViewLocationById(viewDescriptors[0].id), 'Panel view location and container location should match');
		assert.strictEqual(testObject.getViewContainerLocation(generatedSidebar), testObject.getViewLocationById(viewDescriptors[2].id), 'Sidebar view location and container location should match');

		assert.strictEqual(testObject.getDefaultContainerById(viewDescriptors[2].id), panelContainer, `${viewDescriptors[2].name.value} has wrong default container`);
		assert.strictEqual(testObject.getDefaultContainerById(viewDescriptors[0].id), sidebarContainer, `${viewDescriptors[0].name.value} has wrong default container`);

		testObject.moveViewToLocation(viewDescriptors[0], ViewContainerLocation.Sidebar);
		testObject.moveViewToLocation(viewDescriptors[2], ViewContainerLocation.Panel);

		sidebarViews = testObject.getViewContainerModel(sidebarContainer);
		panelViews = testObject.getViewContainerModel(panelContainer);

		assert.strictEqual(sidebarViews.activeViewDescriptors.length, 1, 'Sidebar should have 2 views');
		assert.strictEqual(panelViews.activeViewDescriptors.length, 0, 'Panel should have 1 view');

		assert.strictEqual(testObject.getViewLocationById(viewDescriptors[0].id), ViewContainerLocation.Sidebar, 'View should be located in the sidebar');
		assert.strictEqual(testObject.getViewLocationById(viewDescriptors[2].id), ViewContainerLocation.Panel, 'View should be located in the panel');
	});

	test('move view events', async function () {
		const testObject = aViewDescriptorService();
		const viewDescriptors: IViewDescriptor[] = [
			{
				id: 'view1',
				ctorDescriptor: null!,
				name: nls.localize2('Test View 1', 'Test View 1'),
				canMoveView: true
			},
			{
				id: 'view2',
				ctorDescriptor: null!,
				name: nls.localize2('Test View 2', 'Test View 2'),
				canMoveView: true
			},
			{
				id: 'view3',
				ctorDescriptor: null!,
				name: nls.localize2('Test View 3', 'Test View 3'),
				canMoveView: true
			}
		];

		let expectedSequence = '';
		let actualSequence = '';

		const containerMoveString = (view: IViewDescriptor, from: ViewContainer, to: ViewContainer) => {
			return `Moved ${view.id} from ${from.id} to ${to.id}\n`;
		};

		const locationMoveString = (view: IViewDescriptor, from: ViewContainerLocation, to: ViewContainerLocation) => {
			return `Moved ${view.id} from ${from === ViewContainerLocation.Sidebar ? 'Sidebar' : 'Panel'} to ${to === ViewContainerLocation.Sidebar ? 'Sidebar' : 'Panel'}\n`;
		};
		disposables.add(testObject.onDidChangeContainer(({ views, from, to }) => {
			views.forEach(view => {
				actualSequence += containerMoveString(view, from, to);
			});
		}));

		disposables.add(testObject.onDidChangeLocation(({ views, from, to }) => {
			views.forEach(view => {
				actualSequence += locationMoveString(view, from, to);
			});
		}));

		ViewsRegistry.registerViews(viewDescriptors.slice(0, 2), sidebarContainer);
		ViewsRegistry.registerViews(viewDescriptors.slice(2), panelContainer);

		expectedSequence += locationMoveString(viewDescriptors[0], ViewContainerLocation.Sidebar, ViewContainerLocation.Panel);
		testObject.moveViewToLocation(viewDescriptors[0], ViewContainerLocation.Panel);
		expectedSequence += containerMoveString(viewDescriptors[0], sidebarContainer, testObject.getViewContainerByViewId(viewDescriptors[0].id)!);

		expectedSequence += locationMoveString(viewDescriptors[2], ViewContainerLocation.Panel, ViewContainerLocation.Sidebar);
		testObject.moveViewToLocation(viewDescriptors[2], ViewContainerLocation.Sidebar);
		expectedSequence += containerMoveString(viewDescriptors[2], panelContainer, testObject.getViewContainerByViewId(viewDescriptors[2].id)!);

		expectedSequence += locationMoveString(viewDescriptors[0], ViewContainerLocation.Panel, ViewContainerLocation.Sidebar);
		expectedSequence += containerMoveString(viewDescriptors[0], testObject.getViewContainerByViewId(viewDescriptors[0].id)!, sidebarContainer);
		testObject.moveViewsToContainer([viewDescriptors[0]], sidebarContainer);

		expectedSequence += locationMoveString(viewDescriptors[2], ViewContainerLocation.Sidebar, ViewContainerLocation.Panel);
		expectedSequence += containerMoveString(viewDescriptors[2], testObject.getViewContainerByViewId(viewDescriptors[2].id)!, panelContainer);
		testObject.moveViewsToContainer([viewDescriptors[2]], panelContainer);

		expectedSequence += locationMoveString(viewDescriptors[0], ViewContainerLocation.Sidebar, ViewContainerLocation.Panel);
		expectedSequence += containerMoveString(viewDescriptors[0], sidebarContainer, panelContainer);
		testObject.moveViewsToContainer([viewDescriptors[0]], panelContainer);

		expectedSequence += locationMoveString(viewDescriptors[2], ViewContainerLocation.Panel, ViewContainerLocation.Sidebar);
		expectedSequence += containerMoveString(viewDescriptors[2], panelContainer, sidebarContainer);
		testObject.moveViewsToContainer([viewDescriptors[2]], sidebarContainer);

		expectedSequence += locationMoveString(viewDescriptors[1], ViewContainerLocation.Sidebar, ViewContainerLocation.Panel);
		expectedSequence += locationMoveString(viewDescriptors[2], ViewContainerLocation.Sidebar, ViewContainerLocation.Panel);
		expectedSequence += containerMoveString(viewDescriptors[1], sidebarContainer, panelContainer);
		expectedSequence += containerMoveString(viewDescriptors[2], sidebarContainer, panelContainer);
		testObject.moveViewsToContainer([viewDescriptors[1], viewDescriptors[2]], panelContainer);

		assert.strictEqual(actualSequence, expectedSequence, 'Event sequence not matching expected sequence');
	});

	test('reset', async function () {
		const testObject = aViewDescriptorService();
		const viewDescriptors: IViewDescriptor[] = [
			{
				id: 'view1',
				ctorDescriptor: null!,
				name: nls.localize2('Test View 1', 'Test View 1'),
				canMoveView: true,
				order: 1
			},
			{
				id: 'view2',
				ctorDescriptor: null!,
				name: nls.localize2('Test View 2', 'Test View 2'),
				canMoveView: true,
				order: 2
			},
			{
				id: 'view3',
				ctorDescriptor: null!,
				name: nls.localize2('Test View 3', 'Test View 3'),
				canMoveView: true,
				order: 3
			}
		];

		ViewsRegistry.registerViews(viewDescriptors.slice(0, 2), sidebarContainer);
		ViewsRegistry.registerViews(viewDescriptors.slice(2), panelContainer);

		testObject.moveViewToLocation(viewDescriptors[0], ViewContainerLocation.Panel);
		testObject.moveViewsToContainer([viewDescriptors[1]], panelContainer);
		testObject.moveViewToLocation(viewDescriptors[2], ViewContainerLocation.Sidebar);

		const generatedPanel = assertReturnsDefined(testObject.getViewContainerByViewId(viewDescriptors[0].id));
		const generatedSidebar = assertReturnsDefined(testObject.getViewContainerByViewId(viewDescriptors[2].id));

		testObject.reset();

		const sidebarViews = testObject.getViewContainerModel(sidebarContainer);
		assert.deepStrictEqual(sidebarViews.allViewDescriptors.map(v => v.id), ['view1', 'view2']);
		const panelViews = testObject.getViewContainerModel(panelContainer);
		assert.deepStrictEqual(panelViews.allViewDescriptors.map(v => v.id), ['view3']);

		const actual = JSON.parse(instantiationService.get(IStorageService).get('views.customizations', StorageScope.PROFILE)!);
		assert.deepStrictEqual(actual, { viewContainerLocations: {}, viewLocations: {}, viewContainerBadgeEnablementStates: {} });

		assert.deepStrictEqual(testObject.getViewContainerById(generatedPanel.id), null);
		assert.deepStrictEqual(testObject.getViewContainerById(generatedSidebar.id), null);
	});

	test('initialize with custom locations', async function () {
		const storageService = instantiationService.get(IStorageService);
		const viewContainer1 = ViewContainersRegistry.registerViewContainer({ id: `${viewContainerIdPrefix}-${generateUuid()}`, title: nls.localize2('test', 'test'), ctorDescriptor: new SyncDescriptor(<any>{}) }, ViewContainerLocation.Sidebar);
		const generateViewContainer1 = `workbench.views.service.${ViewContainerLocationToString(ViewContainerLocation.Sidebar)}.${generateUuid()}`;
		const viewsCustomizations = {
			viewContainerLocations: {
				[generateViewContainer1]: ViewContainerLocation.Sidebar,
				[viewContainer1.id]: ViewContainerLocation.AuxiliaryBar
			},
			viewLocations: {
				'view1': generateViewContainer1
			}
		};
		storageService.store('views.customizations', JSON.stringify(viewsCustomizations), StorageScope.PROFILE, StorageTarget.USER);

		const viewDescriptors: IViewDescriptor[] = [
			{
				id: 'view1',
				ctorDescriptor: null!,
				name: nls.localize2('Test View 1', 'Test View 1'),
				canMoveView: true
			},
			{
				id: 'view2',
				ctorDescriptor: null!,
				name: nls.localize2('Test View 2', 'Test View 2'),
				canMoveView: true
			},
			{
				id: 'view3',
				ctorDescriptor: null!,
				name: nls.localize2('Test View 3', 'Test View 3'),
				canMoveView: true
			},
			{
				id: 'view4',
				ctorDescriptor: null!,
				name: nls.localize2('Test View 4', 'Test View 4'),
				canMoveView: true
			}
		];

		ViewsRegistry.registerViews(viewDescriptors.slice(0, 3), sidebarContainer);
		ViewsRegistry.registerViews(viewDescriptors.slice(3), viewContainer1);

		const testObject = aViewDescriptorService();

		const sidebarViews = testObject.getViewContainerModel(sidebarContainer);
		assert.deepStrictEqual(sidebarViews.allViewDescriptors.map(v => v.id), ['view2', 'view3']);

		const generatedViewContainerViews = testObject.getViewContainerModel(testObject.getViewContainerById(generateViewContainer1)!);
		assert.deepStrictEqual(generatedViewContainerViews.allViewDescriptors.map(v => v.id), ['view1']);

		const viewContainer1Views = testObject.getViewContainerModel(viewContainer1);
		assert.deepStrictEqual(testObject.getViewContainerLocation(viewContainer1), ViewContainerLocation.AuxiliaryBar);
		assert.deepStrictEqual(viewContainer1Views.allViewDescriptors.map(v => v.id), ['view4']);
	});

	test('storage change', async function () {
		const testObject = aViewDescriptorService();

		const viewContainer1 = ViewContainersRegistry.registerViewContainer({ id: `${viewContainerIdPrefix}-${generateUuid()}`, title: nls.localize2('test', 'test'), ctorDescriptor: new SyncDescriptor(<any>{}) }, ViewContainerLocation.Sidebar);
		const generateViewContainer1 = `workbench.views.service.${ViewContainerLocationToString(ViewContainerLocation.Sidebar)}.${generateUuid()}`;

		const viewDescriptors: IViewDescriptor[] = [
			{
				id: 'view1',
				ctorDescriptor: null!,
				name: nls.localize2('Test View 1', 'Test View 1'),
				canMoveView: true
			},
			{
				id: 'view2',
				ctorDescriptor: null!,
				name: nls.localize2('Test View 2', 'Test View 2'),
				canMoveView: true
			},
			{
				id: 'view3',
				ctorDescriptor: null!,
				name: nls.localize2('Test View 3', 'Test View 3'),
				canMoveView: true
			},
			{
				id: 'view4',
				ctorDescriptor: null!,
				name: nls.localize2('Test View 4', 'Test View 4'),
				canMoveView: true
			}
		];

		ViewsRegistry.registerViews(viewDescriptors.slice(0, 3), sidebarContainer);
		ViewsRegistry.registerViews(viewDescriptors.slice(3), viewContainer1);

		const viewsCustomizations = {
			viewContainerLocations: {
				[generateViewContainer1]: ViewContainerLocation.Sidebar,
				[viewContainer1.id]: ViewContainerLocation.AuxiliaryBar
			},
			viewLocations: {
				'view1': generateViewContainer1
			}
		};
		instantiationService.get(IStorageService).store('views.customizations', JSON.stringify(viewsCustomizations), StorageScope.PROFILE, StorageTarget.USER);

		const sidebarViews = testObject.getViewContainerModel(sidebarContainer);
		assert.deepStrictEqual(sidebarViews.allViewDescriptors.map(v => v.id), ['view2', 'view3']);

		const generatedViewContainerViews = testObject.getViewContainerModel(testObject.getViewContainerById(generateViewContainer1)!);
		assert.deepStrictEqual(generatedViewContainerViews.allViewDescriptors.map(v => v.id), ['view1']);

		const viewContainer1Views = testObject.getViewContainerModel(viewContainer1);
		assert.deepStrictEqual(testObject.getViewContainerLocation(viewContainer1), ViewContainerLocation.AuxiliaryBar);
		assert.deepStrictEqual(viewContainer1Views.allViewDescriptors.map(v => v.id), ['view4']);
	});

	test('orphan views', async function () {
		const storageService = instantiationService.get(IStorageService);
		const viewsCustomizations = {
			viewContainerLocations: {},
			viewLocations: {
				'view1': `${viewContainerIdPrefix}-${generateUuid()}`
			}
		};
		storageService.store('views.customizations', JSON.stringify(viewsCustomizations), StorageScope.PROFILE, StorageTarget.USER);

		const viewDescriptors: IViewDescriptor[] = [
			{
				id: 'view1',
				ctorDescriptor: null!,
				name: nls.localize2('Test View 1', 'Test View 1'),
				canMoveView: true,
				order: 1
			},
			{
				id: 'view2',
				ctorDescriptor: null!,
				name: nls.localize2('Test View 2', 'Test View 2'),
				canMoveView: true,
				order: 2
			},
			{
				id: 'view3',
				ctorDescriptor: null!,
				name: nls.localize2('Test View 3', 'Test View 3'),
				canMoveView: true,
				order: 3
			}
		];

		ViewsRegistry.registerViews(viewDescriptors, sidebarContainer);

		const testObject = aViewDescriptorService();

		const sidebarViews = testObject.getViewContainerModel(sidebarContainer);
		assert.deepStrictEqual(sidebarViews.allViewDescriptors.map(v => v.id), ['view2', 'view3']);

		testObject.whenExtensionsRegistered();
		assert.deepStrictEqual(sidebarViews.allViewDescriptors.map(v => v.id), ['view1', 'view2', 'view3']);
	});

	test('orphan view containers', async function () {
		const storageService = instantiationService.get(IStorageService);
		const generatedViewContainerId = `workbench.views.service.${ViewContainerLocationToString(ViewContainerLocation.Sidebar)}.${generateUuid()}`;
		const viewsCustomizations = {
			viewContainerLocations: {
				[generatedViewContainerId]: ViewContainerLocation.Sidebar
			},
			viewLocations: {}
		};
		storageService.store('views.customizations', JSON.stringify(viewsCustomizations), StorageScope.PROFILE, StorageTarget.USER);

		const viewDescriptors: IViewDescriptor[] = [
			{
				id: 'view1',
				ctorDescriptor: null!,
				name: nls.localize2('Test View 1', 'Test View 1'),
				canMoveView: true,
				order: 1
			}
		];

		ViewsRegistry.registerViews(viewDescriptors, sidebarContainer);

		const testObject = aViewDescriptorService();
		testObject.whenExtensionsRegistered();

		assert.deepStrictEqual(testObject.getViewContainerById(generatedViewContainerId), null);
		assert.deepStrictEqual(testObject.isViewContainerRemovedPermanently(generatedViewContainerId), true);

		const actual = JSON.parse(storageService.get('views.customizations', StorageScope.PROFILE)!);
		assert.deepStrictEqual(actual, { viewContainerLocations: {}, viewLocations: {}, viewContainerBadgeEnablementStates: {} });
	});

	test('custom locations take precedence when default view container of views change', async function () {
		const storageService = instantiationService.get(IStorageService);
		const viewContainer1 = ViewContainersRegistry.registerViewContainer({ id: `${viewContainerIdPrefix}-${generateUuid()}`, title: nls.localize2('test', 'test'), ctorDescriptor: new SyncDescriptor(<any>{}) }, ViewContainerLocation.Sidebar);
		const generateViewContainer1 = `workbench.views.service.${ViewContainerLocationToString(ViewContainerLocation.Sidebar)}.${generateUuid()}`;
		const viewsCustomizations = {
			viewContainerLocations: {
				[generateViewContainer1]: ViewContainerLocation.Sidebar,
				[viewContainer1.id]: ViewContainerLocation.AuxiliaryBar
			},
			viewLocations: {
				'view1': generateViewContainer1
			}
		};
		storageService.store('views.customizations', JSON.stringify(viewsCustomizations), StorageScope.PROFILE, StorageTarget.USER);

		const viewDescriptors: IViewDescriptor[] = [
			{
				id: 'view1',
				ctorDescriptor: null!,
				name: nls.localize2('Test View 1', 'Test View 1'),
				canMoveView: true
			},
			{
				id: 'view2',
				ctorDescriptor: null!,
				name: nls.localize2('Test View 2', 'Test View 2'),
				canMoveView: true
			},
			{
				id: 'view3',
				ctorDescriptor: null!,
				name: nls.localize2('Test View 3', 'Test View 3'),
				canMoveView: true
			},
			{
				id: 'view4',
				ctorDescriptor: null!,
				name: nls.localize2('Test View 4', 'Test View 4'),
				canMoveView: true
			}
		];

		ViewsRegistry.registerViews(viewDescriptors.slice(0, 3), sidebarContainer);
		ViewsRegistry.registerViews(viewDescriptors.slice(3), viewContainer1);

		const testObject = aViewDescriptorService();
		ViewsRegistry.moveViews([viewDescriptors[0], viewDescriptors[1]], panelContainer);

		const sidebarViews = testObject.getViewContainerModel(sidebarContainer);
		assert.deepStrictEqual(sidebarViews.allViewDescriptors.map(v => v.id), ['view3']);

		const panelViews = testObject.getViewContainerModel(panelContainer);
		assert.deepStrictEqual(panelViews.allViewDescriptors.map(v => v.id), ['view2']);

		const generatedViewContainerViews = testObject.getViewContainerModel(testObject.getViewContainerById(generateViewContainer1)!);
		assert.deepStrictEqual(generatedViewContainerViews.allViewDescriptors.map(v => v.id), ['view1']);

		const viewContainer1Views = testObject.getViewContainerModel(viewContainer1);
		assert.deepStrictEqual(testObject.getViewContainerLocation(viewContainer1), ViewContainerLocation.AuxiliaryBar);
		assert.deepStrictEqual(viewContainer1Views.allViewDescriptors.map(v => v.id), ['view4']);
	});

	test('view containers with not existing views are not removed from customizations', async function () {
		const storageService = instantiationService.get(IStorageService);
		const viewContainer1 = ViewContainersRegistry.registerViewContainer({ id: `${viewContainerIdPrefix}-${generateUuid()}`, title: nls.localize2('test', 'test'), ctorDescriptor: new SyncDescriptor(<any>{}) }, ViewContainerLocation.Sidebar);
		const generateViewContainer1 = `workbench.views.service.${ViewContainerLocationToString(ViewContainerLocation.Sidebar)}.${generateUuid()}`;
		const viewsCustomizations = {
			viewContainerLocations: {
				[generateViewContainer1]: ViewContainerLocation.Sidebar,
				[viewContainer1.id]: ViewContainerLocation.AuxiliaryBar
			},
			viewLocations: {
				'view5': generateViewContainer1
			}
		};
		storageService.store('views.customizations', JSON.stringify(viewsCustomizations), StorageScope.PROFILE, StorageTarget.USER);

		const viewDescriptors: IViewDescriptor[] = [
			{
				id: 'view1',
				ctorDescriptor: null!,
				name: nls.localize2('Test View 1', 'Test View 1'),
				canMoveView: true
			}
		];

		ViewsRegistry.registerViews(viewDescriptors, viewContainer1);

		const testObject = aViewDescriptorService();
		testObject.whenExtensionsRegistered();

		const viewContainer1Views = testObject.getViewContainerModel(viewContainer1);
		assert.deepStrictEqual(testObject.getViewContainerLocation(viewContainer1), ViewContainerLocation.AuxiliaryBar);
		assert.deepStrictEqual(viewContainer1Views.allViewDescriptors.map(v => v.id), ['view1']);

		const actual = JSON.parse(storageService.get('views.customizations', StorageScope.PROFILE)!);
		assert.deepStrictEqual(actual, viewsCustomizations);
	});

	test('storage change also updates locations even if views do not exists and views are registered later', async function () {
		const storageService = instantiationService.get(IStorageService);
		const testObject = aViewDescriptorService();

		const generateViewContainerId = `workbench.views.service.${ViewContainerLocationToString(ViewContainerLocation.AuxiliaryBar)}.${generateUuid()}`;
		const viewsCustomizations = {
			viewContainerLocations: {
				[generateViewContainerId]: ViewContainerLocation.AuxiliaryBar,
			},
			viewLocations: {
				'view1': generateViewContainerId
			}
		};
		storageService.store('views.customizations', JSON.stringify(viewsCustomizations), StorageScope.PROFILE, StorageTarget.USER);

		const viewContainer = ViewContainersRegistry.registerViewContainer({ id: `${viewContainerIdPrefix}-${generateUuid()}`, title: nls.localize2('test', 'test'), ctorDescriptor: new SyncDescriptor(<any>{}) }, ViewContainerLocation.Sidebar);
		const viewDescriptors: IViewDescriptor[] = [
			{
				id: 'view1',
				ctorDescriptor: null!,
				name: nls.localize2('Test View 1', 'Test View 1'),
				canMoveView: true
			},
			{
				id: 'view2',
				ctorDescriptor: null!,
				name: nls.localize2('Test View 2', 'Test View 2'),
				canMoveView: true
			}
		];
		ViewsRegistry.registerViews(viewDescriptors, viewContainer);

		testObject.whenExtensionsRegistered();

		const viewContainer1Views = testObject.getViewContainerModel(viewContainer);
		assert.deepStrictEqual(viewContainer1Views.allViewDescriptors.map(v => v.id), ['view2']);

		const generateViewContainer = testObject.getViewContainerById(generateViewContainerId)!;
		assert.deepStrictEqual(testObject.getViewContainerLocation(generateViewContainer), ViewContainerLocation.AuxiliaryBar);
		const generatedViewContainerModel = testObject.getViewContainerModel(generateViewContainer);
		assert.deepStrictEqual(generatedViewContainerModel.allViewDescriptors.map(v => v.id), ['view1']);
	});

	test('storage change move views and retain visibility state', async function () {
		const storageService = instantiationService.get(IStorageService);
		const testObject = aViewDescriptorService();

		const viewContainer = ViewContainersRegistry.registerViewContainer({ id: `${viewContainerIdPrefix}-${generateUuid()}`, title: nls.localize2('test', 'test'), ctorDescriptor: new SyncDescriptor(<any>{}) }, ViewContainerLocation.Sidebar);
		const viewDescriptors: IViewDescriptor[] = [
			{
				id: 'view1',
				ctorDescriptor: null!,
				name: nls.localize2('Test View 1', 'Test View 1'),
				canMoveView: true,
				canToggleVisibility: true
			},
			{
				id: 'view2',
				ctorDescriptor: null!,
				name: nls.localize2('Test View 2', 'Test View 2'),
				canMoveView: true
			}
		];
		ViewsRegistry.registerViews(viewDescriptors, viewContainer);

		testObject.whenExtensionsRegistered();

		const viewContainer1Views = testObject.getViewContainerModel(viewContainer);
		viewContainer1Views.setVisible('view1', false);

		const generateViewContainerId = `workbench.views.service.${ViewContainerLocationToString(ViewContainerLocation.AuxiliaryBar)}.${generateUuid()}`;
		const viewsCustomizations = {
			viewContainerLocations: {
				[generateViewContainerId]: ViewContainerLocation.AuxiliaryBar,
			},
			viewLocations: {
				'view1': generateViewContainerId
			}
		};
		storageService.store('views.customizations', JSON.stringify(viewsCustomizations), StorageScope.PROFILE, StorageTarget.USER);

		const generateViewContainer = testObject.getViewContainerById(generateViewContainerId)!;
		const generatedViewContainerModel = testObject.getViewContainerModel(generateViewContainer);

		assert.deepStrictEqual(viewContainer1Views.allViewDescriptors.map(v => v.id), ['view2']);
		assert.deepStrictEqual(testObject.getViewContainerLocation(generateViewContainer), ViewContainerLocation.AuxiliaryBar);
		assert.deepStrictEqual(generatedViewContainerModel.allViewDescriptors.map(v => v.id), ['view1']);

		storageService.store('views.customizations', JSON.stringify({}), StorageScope.PROFILE, StorageTarget.USER);

		assert.deepStrictEqual(viewContainer1Views.allViewDescriptors.map(v => v.id).sort((a, b) => compare(a, b)), ['view1', 'view2']);
		assert.deepStrictEqual(viewContainer1Views.visibleViewDescriptors.map(v => v.id), ['view2']);
		assert.deepStrictEqual(generatedViewContainerModel.allViewDescriptors.map(v => v.id), []);
	});

});
