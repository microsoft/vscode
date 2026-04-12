/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../nls.js';
import assert from 'assert';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { TestNotificationService } from '../../../../platform/notification/test/common/testNotificationService.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { NullTelemetryService } from '../../../../platform/telemetry/common/telemetryUtils.js';
import { MainThreadTreeViews } from '../../browser/mainThreadTreeViews.js';
import { CustomTreeView } from '../../../browser/parts/views/treeView.js';
import { Extensions, IViewDescriptorService, TreeItemCollapsibleState } from '../../../common/views.js';
import { ViewDescriptorService } from '../../../services/views/browser/viewDescriptorService.js';
import { TestViewsService, workbenchInstantiationService } from '../../../test/browser/workbenchTestServices.js';
import { TestExtensionService } from '../../../test/common/workbenchTestServices.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Mimes } from '../../../../base/common/mime.js';
import { URI } from '../../../../base/common/uri.js';
suite('MainThreadHostTreeView', function () {
    const testTreeViewId = 'testTreeView';
    const customValue = 'customValue';
    const ViewsRegistry = Registry.as(Extensions.ViewsRegistry);
    class MockExtHostTreeViewsShape extends mock() {
        async $getChildren(treeViewId, treeItemHandle) {
            return [[0, { handle: 'testItem1', collapsibleState: TreeItemCollapsibleState.Expanded, customProp: customValue }]];
        }
        async $hasResolve() {
            return false;
        }
        $setVisible() { }
    }
    let container;
    let mainThreadTreeViews;
    let extHostTreeViewsShape;
    let instantiationService;
    teardown(() => {
        ViewsRegistry.deregisterViews(ViewsRegistry.getViews(container), container);
    });
    const disposables = ensureNoDisposablesAreLeakedInTestSuite();
    setup(async () => {
        instantiationService = workbenchInstantiationService(undefined, disposables);
        const viewDescriptorService = disposables.add(instantiationService.createInstance(ViewDescriptorService));
        instantiationService.stub(IViewDescriptorService, viewDescriptorService);
        // eslint-disable-next-line local/code-no-any-casts
        container = Registry.as(Extensions.ViewContainersRegistry).registerViewContainer({ id: 'testContainer', title: nls.localize2('test', 'test'), ctorDescriptor: new SyncDescriptor({}) }, 0 /* ViewContainerLocation.Sidebar */);
        const viewDescriptor = {
            id: testTreeViewId,
            ctorDescriptor: null,
            name: nls.localize2('Test View 1', 'Test View 1'),
            treeView: disposables.add(instantiationService.createInstance(CustomTreeView, 'testTree', 'Test Title', 'extension.id')),
        };
        ViewsRegistry.registerViews([viewDescriptor], container);
        const testExtensionService = new TestExtensionService();
        extHostTreeViewsShape = new MockExtHostTreeViewsShape();
        mainThreadTreeViews = disposables.add(new MainThreadTreeViews(new class {
            constructor() {
                this.remoteAuthority = '';
                this.extensionHostKind = 1 /* ExtensionHostKind.LocalProcess */;
            }
            dispose() { }
            assertRegistered() { }
            set(v) { return null; }
            getProxy() {
                return extHostTreeViewsShape;
            }
            drain() { return null; }
        }, new TestViewsService(), new TestNotificationService(), testExtensionService, new NullLogService(), NullTelemetryService));
        mainThreadTreeViews.$registerTreeViewDataProvider(testTreeViewId, { showCollapseAll: false, canSelectMany: false, dropMimeTypes: [], dragMimeTypes: [], hasHandleDrag: false, hasHandleDrop: false, manuallyManageCheckboxes: false });
        await testExtensionService.whenInstalledExtensionsRegistered();
    });
    test('getChildren keeps custom properties', async () => {
        const treeView = ViewsRegistry.getView(testTreeViewId).treeView;
        const children = await treeView.dataProvider?.getChildren({ handle: 'root', collapsibleState: TreeItemCollapsibleState.Expanded });
        assert(children.length === 1, 'Exactly one child should be returned');
        assert(children[0].customProp === customValue, 'Tree Items should keep custom properties');
    });
    test('handleDrag reconstructs URI list from uriListData', async () => {
        const testTreeViewIdWithDrag = 'testTreeViewWithDrag';
        // Create a mock that returns URI list data
        const mockExtHostWithDrag = new class extends mock() {
            async $getChildren(treeViewId, treeItemHandle) {
                return [[0, { handle: 'item1', collapsibleState: TreeItemCollapsibleState.None }]];
            }
            async $hasResolve() {
                return false;
            }
            $setVisible() { }
            async $handleDrag(_sourceViewId, _sourceTreeItemHandles, _operationUuid, _token) {
                // Return a DataTransferDTO with text/uri-list containing uriListData
                // This simulates what the extension host sends after URI transformation
                return {
                    items: [
                        [Mimes.uriList, {
                                id: 'test-id',
                                // This is the original (untransformed) string - should NOT be used
                                asString: 'file:///original/untransformed/path.txt',
                                fileData: undefined,
                                // This is the transformed URI data - should be used
                                uriListData: [
                                    { scheme: 'file', authority: '', path: '/transformed/correct/path.txt', query: '', fragment: '' }
                                ]
                            }]
                    ]
                };
            }
        }();
        // Register a view with drag support
        const viewDescriptorWithDrag = {
            id: testTreeViewIdWithDrag,
            ctorDescriptor: null,
            name: nls.localize2('Test View 2', 'Test View 2'),
            treeView: disposables.add(instantiationService.createInstance(CustomTreeView, 'testTree2', 'Test Title 2', 'extension.id')),
        };
        ViewsRegistry.registerViews([viewDescriptorWithDrag], container);
        const dragTestExtensionService = new TestExtensionService();
        const dragTestMainThreadTreeViews = disposables.add(new MainThreadTreeViews(new class {
            constructor() {
                this.remoteAuthority = '';
                this.extensionHostKind = 1 /* ExtensionHostKind.LocalProcess */;
            }
            dispose() { }
            assertRegistered() { }
            set(v) { return null; }
            getProxy() {
                return mockExtHostWithDrag;
            }
            drain() { return null; }
        }, new TestViewsService(), new TestNotificationService(), dragTestExtensionService, new NullLogService(), NullTelemetryService));
        dragTestMainThreadTreeViews.$registerTreeViewDataProvider(testTreeViewIdWithDrag, {
            showCollapseAll: false,
            canSelectMany: false,
            dropMimeTypes: [],
            dragMimeTypes: [Mimes.uriList],
            hasHandleDrag: true,
            hasHandleDrop: false,
            manuallyManageCheckboxes: false
        });
        await dragTestExtensionService.whenInstalledExtensionsRegistered();
        // Get the tree view and its drag controller
        const dragTestTreeView = ViewsRegistry.getView(testTreeViewIdWithDrag).treeView;
        const dragController = dragTestTreeView.dragAndDropController;
        assert(dragController, 'Drag controller should exist');
        // Call handleDrag
        const result = await dragController.handleDrag(['item1'], 'test-operation-uuid', CancellationToken.None);
        assert(result, 'Result should not be undefined');
        // Verify that the URI list was reconstructed from uriListData, not asString
        const uriListItem = result.get(Mimes.uriList);
        assert(uriListItem, 'URI list item should exist');
        const uriListValue = await uriListItem.asString();
        // The value should be the transformed URI, not the original untransformed one
        assert.strictEqual(uriListValue, URI.from({ scheme: 'file', authority: '', path: '/transformed/correct/path.txt', query: '', fragment: '' }).toString());
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZFRyZWVWaWV3cy50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS90ZXN0L2Jyb3dzZXIvbWFpblRocmVhZFRyZWVWaWV3cy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0JBQW9CLENBQUM7QUFDMUMsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUM1RCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sMERBQTBELENBQUM7QUFFMUYsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDBFQUEwRSxDQUFDO0FBQ25ILE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUM1RSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUMvRixPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUUzRSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDMUUsT0FBTyxFQUFFLFVBQVUsRUFBc0Usc0JBQXNCLEVBQWtCLHdCQUF3QixFQUF3QyxNQUFNLDBCQUEwQixDQUFDO0FBR2xPLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQ2pHLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSw2QkFBNkIsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ2pILE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQ3JG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