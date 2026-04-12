/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../../nls.js';
import assert from 'assert';
import { Extensions as ViewContainerExtensions, ViewContainerLocationToString } from '../../../../common/views.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { ViewDescriptorService } from '../../browser/viewDescriptorService.js';
import { assertReturnsDefined } from '../../../../../base/common/types.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { compare } from '../../../../../base/common/strings.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
const ViewsRegistry = Registry.as(ViewContainerExtensions.ViewsRegistry);
const ViewContainersRegistry = Registry.as(ViewContainerExtensions.ViewContainersRegistry);
const viewContainerIdPrefix = 'testViewContainer';
// eslint-disable-next-line local/code-no-any-casts
const sidebarContainer = ViewContainersRegistry.registerViewContainer({ id: `${viewContainerIdPrefix}-${generateUuid()}`, title: nls.localize2('test', 'test'), ctorDescriptor: new SyncDescriptor({}) }, 0 /* ViewContainerLocation.Sidebar */);
// eslint-disable-next-line local/code-no-any-casts
const panelContainer = ViewContainersRegistry.registerViewContainer({ id: `${viewContainerIdPrefix}-${generateUuid()}`, title: nls.localize2('test', 'test'), ctorDescriptor: new SyncDescriptor({}) }, 1 /* ViewContainerLocation.Panel */);
suite('ViewDescriptorService', () => {
    const disposables = ensureNoDisposablesAreLeakedInTestSuite();
    let instantiationService;
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
    function aViewDescriptorService() {
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
        const viewDescriptors = [
            {
                id: 'view1',
                ctorDescriptor: null,
                name: nls.localize2('Test View 1', 'Test View 1'),
                canMoveView: true
            },
            {
                id: 'view2',
                ctorDescriptor: null,
                name: nls.localize2('Test View 2', 'Test View 2'),
                canMoveView: true
            },
            {
                id: 'view3',
                ctorDescriptor: null,
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
        const viewDescriptors = [
            {
                id: 'view1',
                ctorDescriptor: null,
                name: nls.localize2('Test View 1', 'Test View 1'),
                canMoveView: true
            },
            {
                id: 'view2',
                ctorDescriptor: null,
                name: nls.localize2('Test View 2', 'Test View 2'),
                canMoveView: true
            },
            {
                id: 'view3',
                ctorDescriptor: null,
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
        const viewDescriptors = [
            {
                id: 'view1',
                ctorDescriptor: null,
                name: nls.localize2('Test View 1', 'Test View 1'),
                canMoveView: true
            },
            {
                id: 'view2',
                ctorDescriptor: null,
                name: nls.localize2('Test View 2', 'Test View 2'),
                canMoveView: true
            },
            {
                id: 'view3',
                ctorDescriptor: null,
                name: nls.localize2('Test View 3', 'Test View 3'),
                canMoveView: true
            }
        ];
        ViewsRegistry.registerViews(viewDescriptors.slice(0, 2), sidebarContainer);
        ViewsRegistry.registerViews(viewDescriptors.slice(2), panelContainer);
        testObject.moveViewToLocation(viewDescriptors[0], 1 /* ViewContainerLocation.Panel */);
        testObject.moveViewToLocation(viewDescriptors[2], 0 /* ViewContainerLocation.Sidebar */);
        let sidebarViews = testObject.getViewContainerModel(sidebarContainer);
        let panelViews = testObject.getViewContainerModel(panelContainer);
        assert.strictEqual(sidebarViews.activeViewDescriptors.length, 1, 'Sidebar container should have 1 view');
        assert.strictEqual(panelViews.activeViewDescriptors.length, 0, 'Panel container should have no views');
        const generatedPanel = assertReturnsDefined(testObject.getViewContainerByViewId(viewDescriptors[0].id));
        const generatedSidebar = assertReturnsDefined(testObject.getViewContainerByViewId(viewDescriptors[2].id));
        assert.strictEqual(testObject.getViewContainerLocation(generatedPanel), 1 /* ViewContainerLocation.Panel */, 'Generated Panel should be in located in the panel');
        assert.strictEqual(testObject.getViewContainerLocation(generatedSidebar), 0 /* ViewContainerLocation.Sidebar */, 'Generated Sidebar should be in located in the sidebar');
        assert.strictEqual(testObject.getViewContainerLocation(generatedPanel), testObject.getViewLocationById(viewDescriptors[0].id), 'Panel view location and container location should match');
        assert.strictEqual(testObject.getViewContainerLocation(generatedSidebar), testObject.getViewLocationById(viewDescriptors[2].id), 'Sidebar view location and container location should match');
        assert.strictEqual(testObject.getDefaultContainerById(viewDescriptors[2].id), panelContainer, `${viewDescriptors[2].name.value} has wrong default container`);
        assert.strictEqual(testObject.getDefaultContainerById(viewDescriptors[0].id), sidebarContainer, `${viewDescriptors[0].name.value} has wrong default container`);
        testObject.moveViewToLocation(viewDescriptors[0], 0 /* ViewContainerLocation.Sidebar */);
        testObject.moveViewToLocation(viewDescriptors[2], 1 /* ViewContainerLocation.Panel */);
        sidebarViews = testObject.getViewContainerModel(sidebarContainer);
        panelViews = testObject.getViewContainerModel(panelContainer);
        assert.strictEqual(sidebarViews.activeViewDescriptors.length, 1, 'Sidebar should have 2 views');
        assert.strictEqual(panelViews.activeViewDescriptors.length, 0, 'Panel should have 1 view');
        assert.strictEqual(testObject.getViewLocationById(viewDescriptors[0].id), 0 /* ViewContainerLocation.Sidebar */, 'View should be located in the sidebar');
        assert.strictEqual(testObject.getViewLocationById(viewDescriptors[2].id), 1 /* ViewContainerLocation.Panel */, 'View should be located in the panel');
    });
    test('move view events', async function () {
        const testObject = aViewDescriptorService();
        const viewDescriptors = [
            {
                id: 'view1',
                ctorDescriptor: null,
                name: nls.localize2('Test View 1', 'Test View 1'),
                canMoveView: true
            },
            {
                id: 'view2',
                ctorDescriptor: null,
                name: nls.localize2('Test View 2', 'Test View 2'),
                canMoveView: true
            },
            {
                id: 'view3',
                ctorDescriptor: null,
                name: nls.localize2('Test View 3', 'Test View 3'),
                canMoveView: true
            }
        ];
        let expectedSequence = '';
        let actualSequence = '';
        const containerMoveString = (view, from, to) => {
            return `Moved ${view.id} from ${from.id} to ${to.id}\n`;
        };
        const locationMoveString = (view, from, to) => {
            return `Moved ${view.id} from ${from === 0 /* ViewContainerLocation.Sidebar */ ? 'Sidebar' : 'Panel'} to ${to === 0 /* ViewContainerLocation.Sidebar */ ? 'Sidebar' : 'Panel'}\n`;
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
        expectedSequence += locationMoveString(viewDescriptors[0], 0 /* ViewContainerLocation.Sidebar */, 1 /* ViewContainerLocation.Panel */);
        testObject.moveViewToLocation(viewDescriptors[0], 1 /* ViewContainerLocation.Panel */);
        expectedSequence += containerMoveString(viewDescriptors[0], sidebarContainer, testObject.getViewContainerByViewId(viewDescriptors[0].id));
        expectedSequence += locationMoveString(viewDescriptors[2], 1 /* ViewContainerLocation.Panel */, 0 /* ViewContainerLocation.Sidebar */);
        testObject.moveViewToLocation(viewDescriptors[2], 0 /* ViewContainerLocation.Sidebar */);
        expectedSequence += containerMoveString(viewDescriptors[2], panelContainer, testObject.getViewContainerByViewId(viewDescriptors[2].id));
        expectedSequence += locationMoveString(viewDescriptors[0], 1 /* ViewContainerLocation.Panel */, 0 /* ViewContainerLocation.Sidebar */);
        expectedSequence += containerMoveString(viewDescriptors[0], testObject.getViewContainerByViewId(viewDescriptors[0].id), sidebarContainer);
        testObject.moveViewsToContainer([viewDescriptors[0]], sidebarContainer);
        expectedSequence += locationMoveString(viewDescriptors[2], 0 /* ViewContainerLocation.Sidebar */, 1 /* ViewContainerLocation.Panel */);
        expectedSequence += containerMoveString(viewDescriptors[2], testObject.getViewContainerByViewId(viewDescriptors[2].id), panelContainer);
        testObject.moveViewsToContainer([viewDescriptors[2]], panelContainer);
        expectedSequence += locationMoveString(viewDescriptors[0], 0 /* ViewContainerLocation.Sidebar */, 1 /* ViewContainerLocation.Panel */);
        expectedSequence += containerMoveString(viewDescriptors[0], sidebarContainer, panelContainer);
        testObject.moveViewsToContainer([viewDescriptors[0]], panelContainer);
        expectedSequence += locationMoveString(viewDescriptors[2], 1 /* ViewContainerLocation.Panel */, 0 /* ViewContainerLocation.Sidebar */);
        expectedSequence += containerMoveString(viewDescriptors[2], panelContainer, sidebarContainer);
        testObject.moveViewsToContainer([viewDescriptors[2]], sidebarContainer);
        expectedSequence += locationMoveString(viewDescriptors[1], 0 /* ViewContainerLocation.Sidebar */, 1 /* ViewContainerLocation.Panel */);
        expectedSequence += locationMoveString(viewDescriptors[2], 0 /* ViewContainerLocation.Sidebar */, 1 /* ViewContainerLocation.Panel */);
        expectedSequence += containerMoveString(viewDescriptors[1], sidebarContainer, panelContainer);
        expectedSequence += containerMoveString(viewDescriptors[2], sidebarContainer, panelContainer);
        testObject.moveViewsToContainer([viewDescriptors[1], viewDescriptors[2]], panelContainer);
        assert.strictEqual(actualSequence, expectedSequence, 'Event sequence not matching expected sequence');
    });
    test('reset', async function () {
        const testObject = aViewDescriptorService();
        const viewDescriptors = [
            {
                id: 'view1',
                ctorDescriptor: null,
                name: nls.localize2('Test View 1', 'Test View 1'),
                canMoveView: true,
                order: 1
            },
            {
                id: 'view2',
                ctorDescriptor: null,
                name: nls.localize2('Test View 2', 'Test View 2'),
                canMoveView: true,
                order: 2
            },
            {
                id: 'view3',
                ctorDescriptor: null,
                name: nls.localize2('Test View 3', 'Test View 3'),
                canMoveView: true,
                order: 3
            }
        ];
        ViewsRegistry.registerViews(viewDescriptors.slice(0, 2), sidebarContainer);
        ViewsRegistry.registerViews(viewDescriptors.slice(2), panelContainer);
        testObject.moveViewToLocation(viewDescriptors[0], 1 /* ViewContainerLocation.Panel */);
        testObject.moveViewsToContainer([viewDescriptors[1]], panelContainer);
        testObject.moveViewToLocation(viewDescriptors[2], 0 /* ViewContainerLocation.Sidebar */);
        const generatedPanel = assertReturnsDefined(testObject.getViewContainerByViewId(viewDescriptors[0].id));
        const generatedSidebar = assertReturnsDefined(testObject.getViewContainerByViewId(viewDescriptors[2].id));
        testObject.reset();
        const sidebarViews = testObject.getViewContainerModel(sidebarContainer);
        assert.deepStrictEqual(sidebarViews.allViewDescriptors.map(v => v.id), ['view1', 'view2']);
        const panelViews = testObject.getViewContainerModel(panelContainer);
        assert.deepStrictEqual(panelViews.allViewDescriptors.map(v => v.id), ['view3']);
        const actual = JSON.parse(instantiationService.get(IStorageService).get('views.customizations', 0 /* StorageScope.PROFILE */));
        assert.deepStrictEqual(actual, { viewContainerLocations: {}, viewLocations: {}, viewContainerBadgeEnablementStates: {} });
        assert.deepStrictEqual(testObject.getViewContainerById(generatedPanel.id), null);
        assert.deepStrictEqual(testObject.getViewContainerById(generatedSidebar.id), null);
    });
    test('initialize with custom locations', async function () {
        const storageService = instantiationService.get(IStorageService);
        // eslint-disable-next-line local/code-no-any-casts
        const viewContainer1 = ViewContainersRegistry.registerViewContainer({ id: `${viewContainerIdPrefix}-${generateUuid()}`, title: nls.localize2('test', 'test'), ctorDescriptor: new SyncDescriptor({}) }, 0 /* ViewContainerLocation.Sidebar */);
        const generateViewContainer1 = `workbench.views.service.${ViewContainerLocationToString(0 /* ViewContainerLocation.Sidebar */)}.${generateUuid()}`;
        const viewsCustomizations = {
            viewContainerLocations: {
                [generateViewContainer1]: 0 /* ViewContainerLocation.Sidebar */,
                [viewContainer1.id]: 2 /* ViewContainerLocation.AuxiliaryBar */
            },
            viewLocations: {
                'view1': generateViewContainer1
            }
        };
        storageService.store('views.customizations', JSON.stringify(viewsCustomizations), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        const viewDescriptors = [
            {
                id: 'view1',
                ctorDescriptor: null,
                name: nls.localize2('Test View 1', 'Test View 1'),
                canMoveView: true
            },
            {
                id: 'view2',
                ctorDescriptor: null,
                name: nls.localize2('Test View 2', 'Test View 2'),
                canMoveView: true
            },
            {
                id: 'view3',
                ctorDescriptor: null,
                name: nls.localize2('Test View 3', 'Test View 3'),
                canMoveView: true
            },
            {
                id: 'view4',
                ctorDescriptor: null,
                name: nls.localize2('Test View 4', 'Test View 4'),
                canMoveView: true
            }
        ];
        ViewsRegistry.registerViews(viewDescriptors.slice(0, 3), sidebarContainer);
        ViewsRegistry.registerViews(viewDescriptors.slice(3), viewContainer1);
        const testObject = aViewDescriptorService();
        const sidebarViews = testObject.getViewContainerModel(sidebarContainer);
        assert.deepStrictEqual(sidebarViews.allViewDescriptors.map(v => v.id), ['view2', 'view3']);
        const generatedViewContainerViews = testObject.getViewContainerModel(testObject.getViewContainerById(generateViewContainer1));
        assert.deepStrictEqual(generatedViewContainerViews.allViewDescriptors.map(v => v.id), ['view1']);
        const viewContainer1Views = testObject.getViewContainerModel(viewContainer1);
        assert.deepStrictEqual(testObject.getViewContainerLocation(viewContainer1), 2 /* ViewContainerLocation.AuxiliaryBar */);
        assert.deepStrictEqual(viewContainer1Views.allViewDescriptors.map(v => v.id), ['view4']);
    });
    test('storage change', async function () {
        const testObject = aViewDescriptorService();
        // eslint-disable-next-line local/code-no-any-casts
        const viewContainer1 = ViewContainersRegistry.registerViewContainer({ id: `${viewContainerIdPrefix}-${generateUuid()}`, title: nls.localize2('test', 'test'), ctorDescriptor: new SyncDescriptor({}) }, 0 /* ViewContainerLocation.Sidebar */);
        const generateViewContainer1 = `workbench.views.service.${ViewContainerLocationToString(0 /* ViewContainerLocation.Sidebar */)}.${generateUuid()}`;
        const viewDescriptors = [
            {
                id: 'view1',
                ctorDescriptor: null,
                name: nls.localize2('Test View 1', 'Test View 1'),
                canMoveView: true
            },
            {
                id: 'view2',
                ctorDescriptor: null,
                name: nls.localize2('Test View 2', 'Test View 2'),
                canMoveView: true
            },
            {
                id: 'view3',
                ctorDescriptor: null,
                name: nls.localize2('Test View 3', 'Test View 3'),
                canMoveView: true
            },
            {
                id: 'view4',
                ctorDescriptor: null,
                name: nls.localize2('Test View 4', 'Test View 4'),
                canMoveView: true
            }
        ];
        ViewsRegistry.registerViews(viewDescriptors.slice(0, 3), sidebarContainer);
        ViewsRegistry.registerViews(viewDescriptors.slice(3), viewContainer1);
        const viewsCustomizations = {
            viewContainerLocations: {
                [generateViewContainer1]: 0 /* ViewContainerLocation.Sidebar */,
                [viewContainer1.id]: 2 /* ViewContainerLocation.AuxiliaryBar */
            },
            viewLocations: {
                'view1': generateViewContainer1
            }
        };
        instantiationService.get(IStorageService).store('views.customizations', JSON.stringify(viewsCustomizations), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        const sidebarViews = testObject.getViewContainerModel(sidebarContainer);
        assert.deepStrictEqual(sidebarViews.allViewDescriptors.map(v => v.id), ['view2', 'view3']);
        const generatedViewContainerViews = testObject.getViewContainerModel(testObject.getViewContainerById(generateViewContainer1));
        assert.deepStrictEqual(generatedViewContainerViews.allViewDescriptors.map(v => v.id), ['view1']);
        const viewContainer1Views = testObject.getViewContainerModel(viewContainer1);
        assert.deepStrictEqual(testObject.getViewContainerLocation(viewContainer1), 2 /* ViewContainerLocation.AuxiliaryBar */);
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
        storageService.store('views.customizations', JSON.stringify(viewsCustomizations), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        const viewDescriptors = [
            {
                id: 'view1',
                ctorDescriptor: null,
                name: nls.localize2('Test View 1', 'Test View 1'),
                canMoveView: true,
                order: 1
            },
            {
                id: 'view2',
                ctorDescriptor: null,
                name: nls.localize2('Test View 2', 'Test View 2'),
                canMoveView: true,
                order: 2
            },
            {
                id: 'view3',
                ctorDescriptor: null,
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
        const generatedViewContainerId = `workbench.views.service.${ViewContainerLocationToString(0 /* ViewContainerLocation.Sidebar */)}.${generateUuid()}`;
        const viewsCustomizations = {
            viewContainerLocations: {
                [generatedViewContainerId]: 0 /* ViewContainerLocation.Sidebar */
            },
            viewLocations: {}
        };
        storageService.store('views.customizations', JSON.stringify(viewsCustomizations), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        const viewDescriptors = [
            {
                id: 'view1',
                ctorDescriptor: null,
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
        const actual = JSON.parse(storageService.get('views.customizations', 0 /* StorageScope.PROFILE */));
        assert.deepStrictEqual(actual, { viewContainerLocations: {}, viewLocations: {}, viewContainerBadgeEnablementStates: {} });
    });
    test('custom locations take precedence when default view container of views change', async function () {
        const storageService = instantiationService.get(IStorageService);
        // eslint-disable-next-line local/code-no-any-casts
        const viewContainer1 = ViewContainersRegistry.registerViewContainer({ id: `${viewContainerIdPrefix}-${generateUuid()}`, title: nls.localize2('test', 'test'), ctorDescriptor: new SyncDescriptor({}) }, 0 /* ViewContainerLocation.Sidebar */);
        const generateViewContainer1 = `workbench.views.service.${ViewContainerLocationToString(0 /* ViewContainerLocation.Sidebar */)}.${generateUuid()}`;
        const viewsCustomizations = {
            viewContainerLocations: {
                [generateViewContainer1]: 0 /* ViewContainerLocation.Sidebar */,
                [viewContainer1.id]: 2 /* ViewContainerLocation.AuxiliaryBar */
            },
            viewLocations: {
                'view1': generateViewContainer1
            }
        };
        storageService.store('views.customizations', JSON.stringify(viewsCustomizations), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        const viewDescriptors = [
            {
                id: 'view1',
                ctorDescriptor: null,
                name: nls.localize2('Test View 1', 'Test View 1'),
                canMoveView: true
            },
            {
                id: 'view2',
                ctorDescriptor: null,
                name: nls.localize2('Test View 2', 'Test View 2'),
                canMoveView: true
            },
            {
                id: 'view3',
                ctorDescriptor: null,
                name: nls.localize2('Test View 3', 'Test View 3'),
                canMoveView: true
            },
            {
                id: 'view4',
                ctorDescriptor: null,
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
        const generatedViewContainerViews = testObject.getViewContainerModel(testObject.getViewContainerById(generateViewContainer1));
        assert.deepStrictEqual(generatedViewContainerViews.allViewDescriptors.map(v => v.id), ['view1']);
        const viewContainer1Views = testObject.getViewContainerModel(viewContainer1);
        assert.deepStrictEqual(testObject.getViewContainerLocation(viewContainer1), 2 /* ViewContainerLocation.AuxiliaryBar */);
        assert.deepStrictEqual(viewContainer1Views.allViewDescriptors.map(v => v.id), ['view4']);
    });
    test('view containers with not existing views are not removed from customizations', async function () {
        const storageService = instantiationService.get(IStorageService);
        // eslint-disable-next-line local/code-no-any-casts
        const viewContainer1 = ViewContainersRegistry.registerViewContainer({ id: `${viewContainerIdPrefix}-${generateUuid()}`, title: nls.localize2('test', 'test'), ctorDescriptor: new SyncDescriptor({}) }, 0 /* ViewContainerLocation.Sidebar */);
        const generateViewContainer1 = `workbench.views.service.${ViewContainerLocationToString(0 /* ViewContainerLocation.Sidebar */)}.${generateUuid()}`;
        const viewsCustomizations = {
            viewContainerLocations: {
                [generateViewContainer1]: 0 /* ViewContainerLocation.Sidebar */,
                [viewContainer1.id]: 2 /* ViewContainerLocation.AuxiliaryBar */
            },
            viewLocations: {
                'view5': generateViewContainer1
            }
        };
        storageService.store('views.customizations', JSON.stringify(viewsCustomizations), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        const viewDescriptors = [
            {
                id: 'view1',
                ctorDescriptor: null,
                name: nls.localize2('Test View 1', 'Test View 1'),
                canMoveView: true
            }
        ];
        ViewsRegistry.registerViews(viewDescriptors, viewContainer1);
        const testObject = aViewDescriptorService();
        testObject.whenExtensionsRegistered();
        const viewContainer1Views = testObject.getViewContainerModel(viewContainer1);
        assert.deepStrictEqual(testObject.getViewContainerLocation(viewContainer1), 2 /* ViewContainerLocation.AuxiliaryBar */);
        assert.deepStrictEqual(viewContainer1Views.allViewDescriptors.map(v => v.id), ['view1']);
        const actual = JSON.parse(storageService.get('views.customizations', 0 /* StorageScope.PROFILE */));
        assert.deepStrictEqual(actual, viewsCustomizations);
    });
    test('storage change also updates locations even if views do not exists and views are registered later', async function () {
        const storageService = instantiationService.get(IStorageService);
        const testObject = aViewDescriptorService();
        const generateViewContainerId = `workbench.views.service.${ViewContainerLocationToString(2 /* ViewContainerLocation.AuxiliaryBar */)}.${generateUuid()}`;
        const viewsCustomizations = {
            viewContainerLocations: {
                [generateViewContainerId]: 2 /* ViewContainerLocation.AuxiliaryBar */,
            },
            viewLocations: {
                'view1': generateViewContainerId
            }
        };
        storageService.store('views.customizations', JSON.stringify(viewsCustomizations), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        // eslint-disable-next-line local/code-no-any-casts
        const viewContainer = ViewContainersRegistry.registerViewContainer({ id: `${viewContainerIdPrefix}-${generateUuid()}`, title: nls.localize2('test', 'test'), ctorDescriptor: new SyncDescriptor({}) }, 0 /* ViewContainerLocation.Sidebar */);
        const viewDescriptors = [
            {
                id: 'view1',
                ctorDescriptor: null,
                name: nls.localize2('Test View 1', 'Test View 1'),
                canMoveView: true
            },
            {
                id: 'view2',
                ctorDescriptor: null,
                name: nls.localize2('Test View 2', 'Test View 2'),
                canMoveView: true
            }
        ];
        ViewsRegistry.registerViews(viewDescriptors, viewContainer);
        testObject.whenExtensionsRegistered();
        const viewContainer1Views = testObject.getViewContainerModel(viewContainer);
        assert.deepStrictEqual(viewContainer1Views.allViewDescriptors.map(v => v.id), ['view2']);
        const generateViewContainer = testObject.getViewContainerById(generateViewContainerId);
        assert.deepStrictEqual(testObject.getViewContainerLocation(generateViewContainer), 2 /* ViewContainerLocation.AuxiliaryBar */);
        const generatedViewContainerModel = testObject.getViewContainerModel(generateViewContainer);
        assert.deepStrictEqual(generatedViewContainerModel.allViewDescriptors.map(v => v.id), ['view1']);
    });
    test('storage change move views and retain visibility state', async function () {
        const storageService = instantiationService.get(IStorageService);
        const testObject = aViewDescriptorService();
        // eslint-disable-next-line local/code-no-any-casts
        const viewContainer = ViewContainersRegistry.registerViewContainer({ id: `${viewContainerIdPrefix}-${generateUuid()}`, title: nls.localize2('test', 'test'), ctorDescriptor: new SyncDescriptor({}) }, 0 /* ViewContainerLocation.Sidebar */);
        const viewDescriptors = [
            {
                id: 'view1',
                ctorDescriptor: null,
                name: nls.localize2('Test View 1', 'Test View 1'),
                canMoveView: true,
                canToggleVisibility: true
            },
            {
                id: 'view2',
                ctorDescriptor: null,
                name: nls.localize2('Test View 2', 'Test View 2'),
                canMoveView: true
            }
        ];
        ViewsRegistry.registerViews(viewDescriptors, viewContainer);
        testObject.whenExtensionsRegistered();
        const viewContainer1Views = testObject.getViewContainerModel(viewContainer);
        viewContainer1Views.setVisible('view1', false);
        const generateViewContainerId = `workbench.views.service.${ViewContainerLocationToString(2 /* ViewContainerLocation.AuxiliaryBar */)}.${generateUuid()}`;
        const viewsCustomizations = {
            viewContainerLocations: {
                [generateViewContainerId]: 2 /* ViewContainerLocation.AuxiliaryBar */,
            },
            viewLocations: {
                'view1': generateViewContainerId
            }
        };
        storageService.store('views.customizations', JSON.stringify(viewsCustomizations), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        const generateViewContainer = testObject.getViewContainerById(generateViewContainerId);
        const generatedViewContainerModel = testObject.getViewContainerModel(generateViewContainer);
        assert.deepStrictEqual(viewContainer1Views.allViewDescriptors.map(v => v.id), ['view2']);
        assert.deepStrictEqual(testObject.getViewContainerLocation(generateViewContainer), 2 /* ViewContainerLocation.AuxiliaryBar */);
        assert.deepStrictEqual(generatedViewContainerModel.allViewDescriptors.map(v => v.id), ['view1']);
        storageService.store('views.customizations', JSON.stringify({}), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        assert.deepStrictEqual(viewContainer1Views.allViewDescriptors.map(v => v.id).sort((a, b) => compare(a, b)), ['view1', 'view2']);
        assert.deepStrictEqual(viewContainer1Views.visibleViewDescriptors.map(v => v.id), ['view2']);
        assert.deepStrictEqual(generatedViewContainerModel.allViewDescriptors.map(v => v.id), []);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlld0Rlc2NyaXB0b3JTZXJ2aWNlLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvdmlld3MvdGVzdC9icm93c2VyL3ZpZXdEZXNjcmlwdG9yU2VydmljZS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sdUJBQXVCLENBQUM7QUFDN0MsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBNEQsVUFBVSxJQUFJLHVCQUF1QixFQUF3Qyw2QkFBNkIsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ25OLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUMvRSxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUVsRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sNkRBQTZELENBQUM7QUFDN0YsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDL0UsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDM0UsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0saUVBQWlFLENBQUM7QUFDcEcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDN0YsT0FBTyxFQUFFLGVBQWUsRUFBK0IsTUFBTSxtREFBbUQsQ0FBQztBQUNqSCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDbEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBRW5HLE1BQU0sYUFBYSxHQUFHLFFBQVEsQ0FBQyxFQUFFLENBQWlCLHVCQUF1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