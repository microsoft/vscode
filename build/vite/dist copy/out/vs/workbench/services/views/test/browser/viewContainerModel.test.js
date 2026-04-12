/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../../nls.js';
import assert from 'assert';
import * as sinon from 'sinon';
import { Extensions as ViewContainerExtensions } from '../../../../common/views.js';
import { dispose } from '../../../../../base/common/lifecycle.js';
import { move } from '../../../../../base/common/arrays.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { ViewDescriptorService } from '../../browser/viewDescriptorService.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { Event } from '../../../../../base/common/event.js';
import { getViewsStateStorageId } from '../../common/viewContainerModel.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
const ViewContainerRegistry = Registry.as(ViewContainerExtensions.ViewContainersRegistry);
const ViewsRegistry = Registry.as(ViewContainerExtensions.ViewsRegistry);
class ViewDescriptorSequence {
    constructor(model) {
        this.disposables = [];
        this.elements = [...model.visibleViewDescriptors];
        model.onDidAddVisibleViewDescriptors(added => added.forEach(({ viewDescriptor, index }) => this.elements.splice(index, 0, viewDescriptor)), null, this.disposables);
        model.onDidRemoveVisibleViewDescriptors(removed => removed.sort((a, b) => b.index - a.index).forEach(({ index }) => this.elements.splice(index, 1)), null, this.disposables);
        model.onDidMoveVisibleViewDescriptors(({ from, to }) => move(this.elements, from.index, to.index), null, this.disposables);
    }
    dispose() {
        this.disposables = dispose(this.disposables);
    }
}
suite('ViewContainerModel', () => {
    let container;
    const disposableStore = ensureNoDisposablesAreLeakedInTestSuite();
    let contextKeyService;
    let viewDescriptorService;
    let storageService;
    setup(() => {
        const instantiationService = workbenchInstantiationService(undefined, disposableStore);
        contextKeyService = disposableStore.add(instantiationService.createInstance(ContextKeyService));
        instantiationService.stub(IContextKeyService, contextKeyService);
        storageService = instantiationService.get(IStorageService);
        viewDescriptorService = disposableStore.add(instantiationService.createInstance(ViewDescriptorService));
    });
    teardown(() => {
        ViewsRegistry.deregisterViews(ViewsRegistry.getViews(container), container);
        ViewContainerRegistry.deregisterViewContainer(container);
    });
    test('empty model', function () {
        // eslint-disable-next-line local/code-no-any-casts
        container = ViewContainerRegistry.registerViewContainer({ id: 'test', title: nls.localize2('test', 'test'), ctorDescriptor: new SyncDescriptor({}) }, 0 /* ViewContainerLocation.Sidebar */);
        const testObject = viewDescriptorService.getViewContainerModel(container);
        assert.strictEqual(testObject.visibleViewDescriptors.length, 0);
    });
    test('register/unregister', () => {
        // eslint-disable-next-line local/code-no-any-casts
        container = ViewContainerRegistry.registerViewContainer({ id: 'test', title: nls.localize2('test', 'test'), ctorDescriptor: new SyncDescriptor({}) }, 0 /* ViewContainerLocation.Sidebar */);
        const testObject = viewDescriptorService.getViewContainerModel(container);
        const target = disposableStore.add(new ViewDescriptorSequence(testObject));
        assert.strictEqual(testObject.visibleViewDescriptors.length, 0);
        assert.strictEqual(target.elements.length, 0);
        const viewDescriptor = {
            id: 'view1',
            ctorDescriptor: null,
            name: nls.localize2('Test View 1', 'Test View 1')
        };
        ViewsRegistry.registerViews([viewDescriptor], container);
        assert.strictEqual(testObject.visibleViewDescriptors.length, 1);
        assert.strictEqual(target.elements.length, 1);
        assert.deepStrictEqual(testObject.visibleViewDescriptors[0], viewDescriptor);
        assert.deepStrictEqual(target.elements[0], viewDescriptor);
        ViewsRegistry.deregisterViews([viewDescriptor], container);
        assert.strictEqual(testObject.visibleViewDescriptors.length, 0);
        assert.strictEqual(target.elements.length, 0);
    });
    test('when contexts', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        // eslint-disable-next-line local/code-no-any-casts
        container = ViewContainerRegistry.registerViewContainer({ id: 'test', title: nls.localize2('test', 'test'), ctorDescriptor: new SyncDescriptor({}) }, 0 /* ViewContainerLocation.Sidebar */);
        const testObject = viewDescriptorService.getViewContainerModel(container);
        const target = disposableStore.add(new ViewDescriptorSequence(testObject));
        assert.strictEqual(testObject.visibleViewDescriptors.length, 0);
        assert.strictEqual(target.elements.length, 0);
        const viewDescriptor = {
            id: 'view1',
            ctorDescriptor: null,
            name: nls.localize2('Test View 1', 'Test View 1'),
            when: ContextKeyExpr.equals('showview1', true)
        };
        ViewsRegistry.registerViews([viewDescriptor], container);
        assert.strictEqual(testObject.visibleViewDescriptors.length, 0, 'view should not appear since context isnt in');
        assert.strictEqual(target.elements.length, 0);
        const key = contextKeyService.createKey('showview1', false);
        assert.strictEqual(testObject.visibleViewDescriptors.length, 0, 'view should still not appear since showview1 isnt true');
        assert.strictEqual(target.elements.length, 0);
        key.set(true);
        await new Promise(c => setTimeout(c, 30));
        assert.strictEqual(testObject.visibleViewDescriptors.length, 1, 'view should appear');
        assert.strictEqual(target.elements.length, 1);
        assert.deepStrictEqual(testObject.visibleViewDescriptors[0], viewDescriptor);
        assert.strictEqual(target.elements[0], viewDescriptor);
        key.set(false);
        await new Promise(c => setTimeout(c, 30));
        assert.strictEqual(testObject.visibleViewDescriptors.length, 0, 'view should disappear');
        assert.strictEqual(target.elements.length, 0);
        ViewsRegistry.deregisterViews([viewDescriptor], container);
        assert.strictEqual(testObject.visibleViewDescriptors.length, 0, 'view should not be there anymore');
        assert.strictEqual(target.elements.length, 0);
        key.set(true);
        await new Promise(c => setTimeout(c, 30));
        assert.strictEqual(testObject.visibleViewDescriptors.length, 0, 'view should not be there anymore');
        assert.strictEqual(target.elements.length, 0);
    }));
    test('when contexts - multiple', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        // eslint-disable-next-line local/code-no-any-casts
        container = ViewContainerRegistry.registerViewContainer({ id: 'test', title: nls.localize2('test', 'test'), ctorDescriptor: new SyncDescriptor({}) }, 0 /* ViewContainerLocation.Sidebar */);
        const testObject = viewDescriptorService.getViewContainerModel(container);
        const target = disposableStore.add(new ViewDescriptorSequence(testObject));
        const view1 = { id: 'view1', ctorDescriptor: null, name: nls.localize2('Test View 1', 'Test View 1') };
        const view2 = { id: 'view2', ctorDescriptor: null, name: nls.localize2('Test View 2', 'Test View 2'), when: ContextKeyExpr.equals('showview2', true) };
        ViewsRegistry.registerViews([view1, view2], container);
        assert.deepStrictEqual(testObject.visibleViewDescriptors, [view1], 'only view1 should be visible');
        assert.deepStrictEqual(target.elements, [view1], 'only view1 should be visible');
        const key = contextKeyService.createKey('showview2', false);
        assert.deepStrictEqual(testObject.visibleViewDescriptors, [view1], 'still only view1 should be visible');
        assert.deepStrictEqual(target.elements, [view1], 'still only view1 should be visible');
        key.set(true);
        await new Promise(c => setTimeout(c, 30));
        assert.deepStrictEqual(testObject.visibleViewDescriptors, [view1, view2], 'both views should be visible');
        assert.deepStrictEqual(target.elements, [view1, view2], 'both views should be visible');
        ViewsRegistry.deregisterViews([view1, view2], container);
    }));
    test('when contexts - multiple 2', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        // eslint-disable-next-line local/code-no-any-casts
        container = ViewContainerRegistry.registerViewContainer({ id: 'test', title: nls.localize2('test', 'test'), ctorDescriptor: new SyncDescriptor({}) }, 0 /* ViewContainerLocation.Sidebar */);
        const testObject = viewDescriptorService.getViewContainerModel(container);
        const target = disposableStore.add(new ViewDescriptorSequence(testObject));
        const view1 = { id: 'view1', ctorDescriptor: null, name: nls.localize2('Test View 1', 'Test View 1'), when: ContextKeyExpr.equals('showview1', true) };
        const view2 = { id: 'view2', ctorDescriptor: null, name: nls.localize2('Test View 2', 'Test View 2') };
        ViewsRegistry.registerViews([view1, view2], container);
        assert.deepStrictEqual(testObject.visibleViewDescriptors, [view2], 'only view2 should be visible');
        assert.deepStrictEqual(target.elements, [view2], 'only view2 should be visible');
        const key = contextKeyService.createKey('showview1', false);
        assert.deepStrictEqual(testObject.visibleViewDescriptors, [view2], 'still only view2 should be visible');
        assert.deepStrictEqual(target.elements, [view2], 'still only view2 should be visible');
        key.set(true);
        await new Promise(c => setTimeout(c, 30));
        assert.deepStrictEqual(testObject.visibleViewDescriptors, [view1, view2], 'both views should be visible');
        assert.deepStrictEqual(target.elements, [view1, view2], 'both views should be visible');
        ViewsRegistry.deregisterViews([view1, view2], container);
    }));
    test('setVisible', () => {
        // eslint-disable-next-line local/code-no-any-casts
        container = ViewContainerRegistry.registerViewContainer({ id: 'test', title: nls.localize2('test', 'test'), ctorDescriptor: new SyncDescriptor({}) }, 0 /* ViewContainerLocation.Sidebar */);
        const testObject = viewDescriptorService.getViewContainerModel(container);
        const target = disposableStore.add(new ViewDescriptorSequence(testObject));
        const view1 = { id: 'view1', ctorDescriptor: null, name: nls.localize2('Test View 1', 'Test View 1'), canToggleVisibility: true };
        const view2 = { id: 'view2', ctorDescriptor: null, name: nls.localize2('Test View 2', 'Test View 2'), canToggleVisibility: true };
        const view3 = { id: 'view3', ctorDescriptor: null, name: nls.localize2('Test View 3', 'Test View 3'), canToggleVisibility: true };
        ViewsRegistry.registerViews([view1, view2, view3], container);
        assert.deepStrictEqual(testObject.visibleViewDescriptors, [view1, view2, view3]);
        assert.deepStrictEqual(target.elements, [view1, view2, view3]);
        testObject.setVisible('view2', true);
        assert.deepStrictEqual(testObject.visibleViewDescriptors, [view1, view2, view3], 'nothing should happen');
        assert.deepStrictEqual(target.elements, [view1, view2, view3]);
        testObject.setVisible('view2', false);
        assert.deepStrictEqual(testObject.visibleViewDescriptors, [view1, view3], 'view2 should hide');
        assert.deepStrictEqual(target.elements, [view1, view3]);
        testObject.setVisible('view1', false);
        assert.deepStrictEqual(testObject.visibleViewDescriptors, [view3], 'view1 should hide');
        assert.deepStrictEqual(target.elements, [view3]);
        testObject.setVisible('view3', false);
        assert.deepStrictEqual(testObject.visibleViewDescriptors, [], 'view3 shoud hide');
        assert.deepStrictEqual(target.elements, []);
        testObject.setVisible('view1', true);
        assert.deepStrictEqual(testObject.visibleViewDescriptors, [view1], 'view1 should show');
        assert.deepStrictEqual(target.elements, [view1]);
        testObject.setVisible('view3', true);
        assert.deepStrictEqual(testObject.visibleViewDescriptors, [view1, view3], 'view3 should show');
        assert.deepStrictEqual(target.elements, [view1, view3]);
        testObject.setVisible('view2', true);
        assert.deepStrictEqual(testObject.visibleViewDescriptors, [view1, view2, view3], 'view2 should show');
        assert.deepStrictEqual(target.elements, [view1, view2, view3]);
        ViewsRegistry.deregisterViews([view1, view2, view3], container);
        assert.deepStrictEqual(testObject.visibleViewDescriptors, []);
        assert.deepStrictEqual(target.elements, []);
    });
    test('move', () => {
        // eslint-disable-next-line local/code-no-any-casts
        container = ViewContainerRegistry.registerViewContainer({ id: 'test', title: nls.localize2('test', 'test'), ctorDescriptor: new SyncDescriptor({}) }, 0 /* ViewContainerLocation.Sidebar */);
        const testObject = viewDescriptorService.getViewContainerModel(container);
        const target = disposableStore.add(new ViewDescriptorSequence(testObject));
        const view1 = { id: 'view1', ctorDescriptor: null, name: nls.localize2('Test View 1', 'Test View 1') };
        const view2 = { id: 'view2', ctorDescriptor: null, name: nls.localize2('Test View 2', 'Test View 2') };
        const view3 = { id: 'view3', ctorDescriptor: null, name: nls.localize2('Test View 3', 'Test View 3') };
        ViewsRegistry.registerViews([view1, view2, view3], container);
        assert.deepStrictEqual(testObject.visibleViewDescriptors, [view1, view2, view3], 'model views should be OK');
        assert.deepStrictEqual(target.elements, [view1, view2, view3], 'sql views should be OK');
        testObject.move('view3', 'view1');
        assert.deepStrictEqual(testObject.visibleViewDescriptors, [view3, view1, view2], 'view3 should go to the front');
        assert.deepStrictEqual(target.elements, [view3, view1, view2]);
        testObject.move('view1', 'view2');
        assert.deepStrictEqual(testObject.visibleViewDescriptors, [view3, view2, view1], 'view1 should go to the end');
        assert.deepStrictEqual(target.elements, [view3, view2, view1]);
        testObject.move('view1', 'view3');
        assert.deepStrictEqual(testObject.visibleViewDescriptors, [view1, view3, view2], 'view1 should go to the front');
        assert.deepStrictEqual(target.elements, [view1, view3, view2]);
        testObject.move('view2', 'view3');
        assert.deepStrictEqual(testObject.visibleViewDescriptors, [view1, view2, view3], 'view2 should go to the middle');
        assert.deepStrictEqual(target.elements, [view1, view2, view3]);
    });
    test('view states', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        storageService.store(`${container.id}.state.hidden`, JSON.stringify([{ id: 'view1', isHidden: true }]), 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
        // eslint-disable-next-line local/code-no-any-casts
        container = ViewContainerRegistry.registerViewContainer({ id: 'test', title: nls.localize2('test', 'test'), ctorDescriptor: new SyncDescriptor({}) }, 0 /* ViewContainerLocation.Sidebar */);
        const testObject = viewDescriptorService.getViewContainerModel(container);
        const target = disposableStore.add(new ViewDescriptorSequence(testObject));
        assert.strictEqual(testObject.visibleViewDescriptors.length, 0);
        assert.strictEqual(target.elements.length, 0);
        const viewDescriptor = {
            id: 'view1',
            ctorDescriptor: null,
            name: nls.localize2('Test View 1', 'Test View 1')
        };
        ViewsRegistry.registerViews([viewDescriptor], container);
        assert.strictEqual(testObject.visibleViewDescriptors.length, 0, 'view should not appear since it was set not visible in view state');
        assert.strictEqual(target.elements.length, 0);
    }));
    test('view states and when contexts', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        storageService.store(`${container.id}.state.hidden`, JSON.stringify([{ id: 'view1', isHidden: true }]), 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
        // eslint-disable-next-line local/code-no-any-casts
        container = ViewContainerRegistry.registerViewContainer({ id: 'test', title: nls.localize2('test', 'test'), ctorDescriptor: new SyncDescriptor({}) }, 0 /* ViewContainerLocation.Sidebar */);
        const testObject = viewDescriptorService.getViewContainerModel(container);
        const target = disposableStore.add(new ViewDescriptorSequence(testObject));
        assert.strictEqual(testObject.visibleViewDescriptors.length, 0);
        assert.strictEqual(target.elements.length, 0);
        const viewDescriptor = {
            id: 'view1',
            ctorDescriptor: null,
            name: nls.localize2('Test View 1', 'Test View 1'),
            when: ContextKeyExpr.equals('showview1', true)
        };
        ViewsRegistry.registerViews([viewDescriptor], container);
        assert.strictEqual(testObject.visibleViewDescriptors.length, 0, 'view should not appear since context isnt in');
        assert.strictEqual(target.elements.length, 0);
        const key = contextKeyService.createKey('showview1', false);
        assert.strictEqual(testObject.visibleViewDescriptors.length, 0, 'view should still not appear since showview1 isnt true');
        assert.strictEqual(target.elements.length, 0);
        key.set(true);
        await new Promise(c => setTimeout(c, 30));
        assert.strictEqual(testObject.visibleViewDescriptors.length, 0, 'view should still not appear since it was set not visible in view state');
        assert.strictEqual(target.elements.length, 0);
    }));
    test('view states and when contexts multiple views', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        storageService.store(`${container.id}.state.hidden`, JSON.stringify([{ id: 'view1', isHidden: true }]), 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
        // eslint-disable-next-line local/code-no-any-casts
        container = ViewContainerRegistry.registerViewContainer({ id: 'test', title: nls.localize2('test', 'test'), ctorDescriptor: new SyncDescriptor({}) }, 0 /* ViewContainerLocation.Sidebar */);
        const testObject = viewDescriptorService.getViewContainerModel(container);
        const target = disposableStore.add(new ViewDescriptorSequence(testObject));
        assert.strictEqual(testObject.visibleViewDescriptors.length, 0);
        assert.strictEqual(target.elements.length, 0);
        const view1 = {
            id: 'view1',
            ctorDescriptor: null,
            name: nls.localize2('Test View 1', 'Test View 1'),
            when: ContextKeyExpr.equals('showview', true)
        };
        const view2 = {
            id: 'view2',
            ctorDescriptor: null,
            name: nls.localize2('Test View 2', 'Test View 2'),
        };
        const view3 = {
            id: 'view3',
            ctorDescriptor: null,
            name: nls.localize2('Test View 3', 'Test View 3'),
            when: ContextKeyExpr.equals('showview', true)
        };
        ViewsRegistry.registerViews([view1, view2, view3], container);
        assert.deepStrictEqual(testObject.visibleViewDescriptors, [view2], 'Only view2 should be visible');
        assert.deepStrictEqual(target.elements, [view2]);
        const key = contextKeyService.createKey('showview', false);
        assert.deepStrictEqual(testObject.visibleViewDescriptors, [view2], 'Only view2 should be visible');
        assert.deepStrictEqual(target.elements, [view2]);
        key.set(true);
        await new Promise(c => setTimeout(c, 30));
        assert.deepStrictEqual(testObject.visibleViewDescriptors, [view2, view3], 'view3 should be visible');
        assert.deepStrictEqual(target.elements, [view2, view3]);
        key.set(false);
        await new Promise(c => setTimeout(c, 30));
        assert.deepStrictEqual(testObject.visibleViewDescriptors, [view2], 'Only view2 should be visible');
        assert.deepStrictEqual(target.elements, [view2]);
    }));
    test('remove event is not triggered if view was hidden and removed', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        // eslint-disable-next-line local/code-no-any-casts
        container = ViewContainerRegistry.registerViewContainer({ id: 'test', title: nls.localize2('test', 'test'), ctorDescriptor: new SyncDescriptor({}) }, 0 /* ViewContainerLocation.Sidebar */);
        const testObject = viewDescriptorService.getViewContainerModel(container);
        const target = disposableStore.add(new ViewDescriptorSequence(testObject));
        const viewDescriptor = {
            id: 'view1',
            ctorDescriptor: null,
            name: nls.localize2('Test View 1', 'Test View 1'),
            when: ContextKeyExpr.equals('showview1', true),
            canToggleVisibility: true
        };
        ViewsRegistry.registerViews([viewDescriptor], container);
        const key = contextKeyService.createKey('showview1', true);
        await new Promise(c => setTimeout(c, 30));
        assert.strictEqual(testObject.visibleViewDescriptors.length, 1, 'view should appear after context is set');
        assert.strictEqual(target.elements.length, 1);
        testObject.setVisible('view1', false);
        assert.strictEqual(testObject.visibleViewDescriptors.length, 0, 'view should disappear after setting visibility to false');
        assert.strictEqual(target.elements.length, 0);
        const targetEvent = sinon.spy();
        disposableStore.add(testObject.onDidRemoveVisibleViewDescriptors(targetEvent));
        key.set(false);
        await new Promise(c => setTimeout(c, 30));
        assert.ok(!targetEvent.called, 'remove event should not be called since it is already hidden');
    }));
    test('add event is not triggered if view was set visible (when visible) and not active', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        // eslint-disable-next-line local/code-no-any-casts
        container = ViewContainerRegistry.registerViewContainer({ id: 'test', title: nls.localize2('test', 'test'), ctorDescriptor: new SyncDescriptor({}) }, 0 /* ViewContainerLocation.Sidebar */);
        const testObject = viewDescriptorService.getViewContainerModel(container);
        const target = disposableStore.add(new ViewDescriptorSequence(testObject));
        const viewDescriptor = {
            id: 'view1',
            ctorDescriptor: null,
            name: nls.localize2('Test View 1', 'Test View 1'),
            when: ContextKeyExpr.equals('showview1', true),
            canToggleVisibility: true
        };
        const key = contextKeyService.createKey('showview1', true);
        key.set(false);
        ViewsRegistry.registerViews([viewDescriptor], container);
        assert.strictEqual(testObject.visibleViewDescriptors.length, 0);
        assert.strictEqual(target.elements.length, 0);
        const targetEvent = sinon.spy();
        disposableStore.add(testObject.onDidAddVisibleViewDescriptors(targetEvent));
        testObject.setVisible('view1', true);
        assert.ok(!targetEvent.called, 'add event should not be called since it is already visible');
        assert.strictEqual(testObject.visibleViewDescriptors.length, 0);
        assert.strictEqual(target.elements.length, 0);
    }));
    test('remove event is not triggered if view was hidden and not active', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        // eslint-disable-next-line local/code-no-any-casts
        container = ViewContainerRegistry.registerViewContainer({ id: 'test', title: nls.localize2('test', 'test'), ctorDescriptor: new SyncDescriptor({}) }, 0 /* ViewContainerLocation.Sidebar */);
        const testObject = viewDescriptorService.getViewContainerModel(container);
        const target = disposableStore.add(new ViewDescriptorSequence(testObject));
        const viewDescriptor = {
            id: 'view1',
            ctorDescriptor: null,
            name: nls.localize2('Test View 1', 'Test View 1'),
            when: ContextKeyExpr.equals('showview1', true),
            canToggleVisibility: true
        };
        const key = contextKeyService.createKey('showview1', true);
        key.set(false);
        ViewsRegistry.registerViews([viewDescriptor], container);
        assert.strictEqual(testObject.visibleViewDescriptors.length, 0);
        assert.strictEqual(target.elements.length, 0);
        const targetEvent = sinon.spy();
        disposableStore.add(testObject.onDidAddVisibleViewDescriptors(targetEvent));
        testObject.setVisible('view1', false);
        assert.ok(!targetEvent.called, 'add event should not be called since it is disabled');
        assert.strictEqual(testObject.visibleViewDescriptors.length, 0);
        assert.strictEqual(target.elements.length, 0);
    }));
    test('add event is not triggered if view was set visible (when not visible) and not active', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        // eslint-disable-next-line local/code-no-any-casts
        container = ViewContainerRegistry.registerViewContainer({ id: 'test', title: nls.localize2('test', 'test'), ctorDescriptor: new SyncDescriptor({}) }, 0 /* ViewContainerLocation.Sidebar */);
        const testObject = viewDescriptorService.getViewContainerModel(container);
        const target = disposableStore.add(new ViewDescriptorSequence(testObject));
        const viewDescriptor = {
            id: 'view1',
            ctorDescriptor: null,
            name: nls.localize2('Test View 1', 'Test View 1'),
            when: ContextKeyExpr.equals('showview1', true),
            canToggleVisibility: true
        };
        const key = contextKeyService.createKey('showview1', true);
        key.set(false);
        ViewsRegistry.registerViews([viewDescriptor], container);
        assert.strictEqual(testObject.visibleViewDescriptors.length, 0);
        assert.strictEqual(target.elements.length, 0);
        testObject.setVisible('view1', false);
        assert.strictEqual(testObject.visibleViewDescriptors.length, 0);
        assert.strictEqual(target.elements.length, 0);
        const targetEvent = sinon.spy();
        disposableStore.add(testObject.onDidAddVisibleViewDescriptors(targetEvent));
        testObject.setVisible('view1', true);
        assert.ok(!targetEvent.called, 'add event should not be called since it is disabled');
        assert.strictEqual(testObject.visibleViewDescriptors.length, 0);
        assert.strictEqual(target.elements.length, 0);
    }));
    test('added view descriptors are in ascending order in the event', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        // eslint-disable-next-line local/code-no-any-casts
        container = ViewContainerRegistry.registerViewContainer({ id: 'test', title: nls.localize2('test', 'test'), ctorDescriptor: new SyncDescriptor({}) }, 0 /* ViewContainerLocation.Sidebar */);
        const testObject = viewDescriptorService.getViewContainerModel(container);
        const target = disposableStore.add(new ViewDescriptorSequence(testObject));
        ViewsRegistry.registerViews([{
                id: 'view5',
                ctorDescriptor: null,
                name: nls.localize2('Test View 5', 'Test View 5'),
                canToggleVisibility: true,
                order: 5
            }, {
                id: 'view2',
                ctorDescriptor: null,
                name: nls.localize2('Test View 2', 'Test View 2'),
                canToggleVisibility: true,
                order: 2
            }], container);
        assert.strictEqual(target.elements.length, 2);
        assert.strictEqual(target.elements[0].id, 'view2');
        assert.strictEqual(target.elements[1].id, 'view5');
        ViewsRegistry.registerViews([{
                id: 'view4',
                ctorDescriptor: null,
                name: nls.localize2('Test View 4', 'Test View 4'),
                canToggleVisibility: true,
                order: 4
            }, {
                id: 'view3',
                ctorDescriptor: null,
                name: nls.localize2('Test View 3', 'Test View 3'),
                canToggleVisibility: true,
                order: 3
            }, {
                id: 'view1',
                ctorDescriptor: null,
                name: nls.localize2('Test View 1', 'Test View 1'),
                canToggleVisibility: true,
                order: 1
            }], container);
        assert.strictEqual(target.elements.length, 5);
        assert.strictEqual(target.elements[0].id, 'view1');
        assert.strictEqual(target.elements[1].id, 'view2');
        assert.strictEqual(target.elements[2].id, 'view3');
        assert.strictEqual(target.elements[3].id, 'view4');
        assert.strictEqual(target.elements[4].id, 'view5');
    }));
    test('add event is triggered only once when view is set visible while it is set active', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        // eslint-disable-next-line local/code-no-any-casts
        container = ViewContainerRegistry.registerViewContainer({ id: 'test', title: nls.localize2('test', 'test'), ctorDescriptor: new SyncDescriptor({}) }, 0 /* ViewContainerLocation.Sidebar */);
        const testObject = viewDescriptorService.getViewContainerModel(container);
        const target = disposableStore.add(new ViewDescriptorSequence(testObject));
        const viewDescriptor = {
            id: 'view1',
            ctorDescriptor: null,
            name: nls.localize2('Test View 1', 'Test View 1'),
            when: ContextKeyExpr.equals('showview1', true),
            canToggleVisibility: true
        };
        const key = contextKeyService.createKey('showview1', true);
        key.set(false);
        ViewsRegistry.registerViews([viewDescriptor], container);
        testObject.setVisible('view1', false);
        assert.strictEqual(testObject.visibleViewDescriptors.length, 0);
        assert.strictEqual(target.elements.length, 0);
        const targetEvent = sinon.spy();
        disposableStore.add(testObject.onDidAddVisibleViewDescriptors(targetEvent));
        disposableStore.add(Event.once(testObject.onDidChangeActiveViewDescriptors)(() => testObject.setVisible('view1', true)));
        key.set(true);
        await new Promise(c => setTimeout(c, 30));
        assert.strictEqual(targetEvent.callCount, 1);
        assert.strictEqual(testObject.visibleViewDescriptors.length, 1);
        assert.strictEqual(target.elements.length, 1);
        assert.strictEqual(target.elements[0].id, 'view1');
    }));
    test('add event is not triggered only when view is set hidden while it is set active', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        // eslint-disable-next-line local/code-no-any-casts
        container = ViewContainerRegistry.registerViewContainer({ id: 'test', title: nls.localize2('test', 'test'), ctorDescriptor: new SyncDescriptor({}) }, 0 /* ViewContainerLocation.Sidebar */);
        const testObject = viewDescriptorService.getViewContainerModel(container);
        const target = disposableStore.add(new ViewDescriptorSequence(testObject));
        const viewDescriptor = {
            id: 'view1',
            ctorDescriptor: null,
            name: nls.localize2('Test View 1', 'Test View 1'),
            when: ContextKeyExpr.equals('showview1', true),
            canToggleVisibility: true
        };
        const key = contextKeyService.createKey('showview1', true);
        key.set(false);
        ViewsRegistry.registerViews([viewDescriptor], container);
        assert.strictEqual(testObject.visibleViewDescriptors.length, 0);
        assert.strictEqual(target.elements.length, 0);
        const targetEvent = sinon.spy();
        disposableStore.add(testObject.onDidAddVisibleViewDescriptors(targetEvent));
        disposableStore.add(Event.once(testObject.onDidChangeActiveViewDescriptors)(() => testObject.setVisible('view1', false)));
        key.set(true);
        await new Promise(c => setTimeout(c, 30));
        assert.strictEqual(targetEvent.callCount, 0);
        assert.strictEqual(testObject.visibleViewDescriptors.length, 0);
        assert.strictEqual(target.elements.length, 0);
    }));
    test('#142087: view descriptor visibility is not reset', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        // eslint-disable-next-line local/code-no-any-casts
        container = ViewContainerRegistry.registerViewContainer({ id: 'test', title: nls.localize2('test', 'test'), ctorDescriptor: new SyncDescriptor({}) }, 0 /* ViewContainerLocation.Sidebar */);
        const testObject = viewDescriptorService.getViewContainerModel(container);
        const viewDescriptor = {
            id: 'view1',
            ctorDescriptor: null,
            name: nls.localize2('Test View 1', 'Test View 1'),
            canToggleVisibility: true
        };
        storageService.store(getViewsStateStorageId('test.state'), JSON.stringify([{
                id: viewDescriptor.id,
                isHidden: true,
                order: undefined
            }]), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        ViewsRegistry.registerViews([viewDescriptor], container);
        assert.strictEqual(testObject.isVisible(viewDescriptor.id), false);
        assert.strictEqual(testObject.activeViewDescriptors[0].id, viewDescriptor.id);
        assert.strictEqual(testObject.visibleViewDescriptors.length, 0);
    }));
    test('remove event is triggered properly if multiple views are hidden at the same time', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        // eslint-disable-next-line local/code-no-any-casts
        container = ViewContainerRegistry.registerViewContainer({ id: 'test', title: nls.localize2('test', 'test'), ctorDescriptor: new SyncDescriptor({}) }, 0 /* ViewContainerLocation.Sidebar */);
        const testObject = viewDescriptorService.getViewContainerModel(container);
        const target = disposableStore.add(new ViewDescriptorSequence(testObject));
        const viewDescriptor1 = {
            id: 'view1',
            ctorDescriptor: null,
            name: nls.localize2('Test View 1', 'Test View 1'),
            canToggleVisibility: true
        };
        const viewDescriptor2 = {
            id: 'view2',
            ctorDescriptor: null,
            name: nls.localize2('Test View 2', 'Test View 2'),
            canToggleVisibility: true
        };
        const viewDescriptor3 = {
            id: 'view3',
            ctorDescriptor: null,
            name: nls.localize2('Test View 3', 'Test View 3'),
            canToggleVisibility: true
        };
        ViewsRegistry.registerViews([viewDescriptor1, viewDescriptor2, viewDescriptor3], container);
        const remomveEvent = sinon.spy();
        disposableStore.add(testObject.onDidRemoveVisibleViewDescriptors(remomveEvent));
        const addEvent = sinon.spy();
        disposableStore.add(testObject.onDidAddVisibleViewDescriptors(addEvent));
        storageService.store(getViewsStateStorageId('test.state'), JSON.stringify([{
                id: viewDescriptor1.id,
                isHidden: false,
                order: undefined
            }, {
                id: viewDescriptor2.id,
                isHidden: true,
                order: undefined
            }, {
                id: viewDescriptor3.id,
                isHidden: true,
                order: undefined
            }]), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        assert.ok(!addEvent.called, 'add event should not be called');
        assert.ok(remomveEvent.calledOnce, 'remove event should be called');
        assert.deepStrictEqual(remomveEvent.args[0][0], [{
                viewDescriptor: viewDescriptor3,
                index: 2
            }, {
                viewDescriptor: viewDescriptor2,
                index: 1
            }]);
        assert.strictEqual(target.elements.length, 1);
        assert.strictEqual(target.elements[0].id, viewDescriptor1.id);
    }));
    test('add event is triggered properly if multiple views are hidden at the same time', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        // eslint-disable-next-line local/code-no-any-casts
        container = ViewContainerRegistry.registerViewContainer({ id: 'test', title: nls.localize2('test', 'test'), ctorDescriptor: new SyncDescriptor({}) }, 0 /* ViewContainerLocation.Sidebar */);
        const testObject = viewDescriptorService.getViewContainerModel(container);
        const target = disposableStore.add(new ViewDescriptorSequence(testObject));
        const viewDescriptor1 = {
            id: 'view1',
            ctorDescriptor: null,
            name: nls.localize2('Test View 1', 'Test View 1'),
            canToggleVisibility: true
        };
        const viewDescriptor2 = {
            id: 'view2',
            ctorDescriptor: null,
            name: nls.localize2('Test View 2', 'Test View 2'),
            canToggleVisibility: true
        };
        const viewDescriptor3 = {
            id: 'view3',
            ctorDescriptor: null,
            name: nls.localize2('Test View 3', 'Test View 3'),
            canToggleVisibility: true
        };
        ViewsRegistry.registerViews([viewDescriptor1, viewDescriptor2, viewDescriptor3], container);
        testObject.setVisible(viewDescriptor1.id, false);
        testObject.setVisible(viewDescriptor3.id, false);
        const removeEvent = sinon.spy();
        disposableStore.add(testObject.onDidRemoveVisibleViewDescriptors(removeEvent));
        const addEvent = sinon.spy();
        disposableStore.add(testObject.onDidAddVisibleViewDescriptors(addEvent));
        storageService.store(getViewsStateStorageId('test.state'), JSON.stringify([{
                id: viewDescriptor1.id,
                isHidden: false,
                order: undefined
            }, {
                id: viewDescriptor2.id,
                isHidden: false,
                order: undefined
            }, {
                id: viewDescriptor3.id,
                isHidden: false,
                order: undefined
            }]), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        assert.ok(!removeEvent.called, 'remove event should not be called');
        assert.ok(addEvent.calledOnce, 'add event should be called once');
        assert.deepStrictEqual(addEvent.args[0][0], [{
                viewDescriptor: viewDescriptor1,
                index: 0,
                collapsed: false,
                size: undefined
            }, {
                viewDescriptor: viewDescriptor3,
                index: 2,
                collapsed: false,
                size: undefined
            }]);
        assert.strictEqual(target.elements.length, 3);
        assert.strictEqual(target.elements[0].id, viewDescriptor1.id);
        assert.strictEqual(target.elements[1].id, viewDescriptor2.id);
        assert.strictEqual(target.elements[2].id, viewDescriptor3.id);
    }));
    test('add and remove events are triggered properly if multiple views are hidden and added at the same time', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        // eslint-disable-next-line local/code-no-any-casts
        container = ViewContainerRegistry.registerViewContainer({ id: 'test', title: nls.localize2('test', 'test'), ctorDescriptor: new SyncDescriptor({}) }, 0 /* ViewContainerLocation.Sidebar */);
        const testObject = viewDescriptorService.getViewContainerModel(container);
        const target = disposableStore.add(new ViewDescriptorSequence(testObject));
        const viewDescriptor1 = {
            id: 'view1',
            ctorDescriptor: null,
            name: nls.localize2('Test View 1', 'Test View 1'),
            canToggleVisibility: true
        };
        const viewDescriptor2 = {
            id: 'view2',
            ctorDescriptor: null,
            name: nls.localize2('Test View 2', 'Test View 2'),
            canToggleVisibility: true
        };
        const viewDescriptor3 = {
            id: 'view3',
            ctorDescriptor: null,
            name: nls.localize2('Test View 3', 'Test View 3'),
            canToggleVisibility: true
        };
        const viewDescriptor4 = {
            id: 'view4',
            ctorDescriptor: null,
            name: nls.localize2('Test View 4', 'Test View 4'),
            canToggleVisibility: true
        };
        ViewsRegistry.registerViews([viewDescriptor1, viewDescriptor2, viewDescriptor3, viewDescriptor4], container);
        testObject.setVisible(viewDescriptor1.id, false);
        const removeEvent = sinon.spy();
        disposableStore.add(testObject.onDidRemoveVisibleViewDescriptors(removeEvent));
        const addEvent = sinon.spy();
        disposableStore.add(testObject.onDidAddVisibleViewDescriptors(addEvent));
        storageService.store(getViewsStateStorageId('test.state'), JSON.stringify([{
                id: viewDescriptor1.id,
                isHidden: false,
                order: undefined
            }, {
                id: viewDescriptor2.id,
                isHidden: true,
                order: undefined
            }, {
                id: viewDescriptor3.id,
                isHidden: false,
                order: undefined
            }, {
                id: viewDescriptor4.id,
                isHidden: true,
                order: undefined
            }]), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        assert.ok(removeEvent.calledOnce, 'remove event should be called once');
        assert.deepStrictEqual(removeEvent.args[0][0], [{
                viewDescriptor: viewDescriptor4,
                index: 2
            }, {
                viewDescriptor: viewDescriptor2,
                index: 0
            }]);
        assert.ok(addEvent.calledOnce, 'add event should be called once');
        assert.deepStrictEqual(addEvent.args[0][0], [{
                viewDescriptor: viewDescriptor1,
                index: 0,
                collapsed: false,
                size: undefined
            }]);
        assert.strictEqual(target.elements.length, 2);
        assert.strictEqual(target.elements[0].id, viewDescriptor1.id);
        assert.strictEqual(target.elements[1].id, viewDescriptor3.id);
    }));
    test('newly added view descriptor is hidden if it was toggled hidden in storage before adding', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        // eslint-disable-next-line local/code-no-any-casts
        container = ViewContainerRegistry.registerViewContainer({ id: 'test', title: nls.localize2('test', 'test'), ctorDescriptor: new SyncDescriptor({}) }, 0 /* ViewContainerLocation.Sidebar */);
        const viewDescriptor = {
            id: 'view1',
            ctorDescriptor: null,
            name: nls.localize2('Test View 1', 'Test View 1'),
            canToggleVisibility: true
        };
        storageService.store(getViewsStateStorageId('test.state'), JSON.stringify([{
                id: viewDescriptor.id,
                isHidden: false,
                order: undefined
            }]), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        const testObject = viewDescriptorService.getViewContainerModel(container);
        storageService.store(getViewsStateStorageId('test.state'), JSON.stringify([{
                id: viewDescriptor.id,
                isHidden: true,
                order: undefined
            }]), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        ViewsRegistry.registerViews([viewDescriptor], container);
        assert.strictEqual(testObject.isVisible(viewDescriptor.id), false);
        assert.strictEqual(testObject.activeViewDescriptors[0].id, viewDescriptor.id);
        assert.strictEqual(testObject.visibleViewDescriptors.length, 0);
    }));
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlld0NvbnRhaW5lck1vZGVsLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvdmlld3MvdGVzdC9icm93c2VyL3ZpZXdDb250YWluZXJNb2RlbC50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sdUJBQXVCLENBQUM7QUFDN0MsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sS0FBSyxLQUFLLE1BQU0sT0FBTyxDQUFDO0FBQy9CLE9BQU8sRUFBNEQsVUFBVSxJQUFJLHVCQUF1QixFQUFxRixNQUFNLDZCQUE2QixDQUFDO0FBQ2pPLE9BQU8sRUFBZSxPQUFPLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUMvRSxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDNUQsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDbEcsT0FBTyxFQUFFLGNBQWMsRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBRTdHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGlFQUFpRSxDQUFDO0FBQ3BHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQy9FLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUMvRSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sNkRBQTZELENBQUM7QUFDN0YsT0FBTyxFQUFFLGVBQWUsRUFBK0IsTUFBTSxtREFBbUQsQ0FBQztBQUNqSCxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDNUQsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDNUUsT0FBTyxFQUFFLGtCQUFr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