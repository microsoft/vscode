/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import assert from 'assert';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { TestInstantiationService } from '../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { TestNotificationService } from '../../../../platform/notification/test/common/testNotificationService.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { NullTelemetryService } from '../../../../platform/telemetry/common/telemetryUtils.js';
import { MainThreadTreeViews } from '../../browser/mainThreadTreeViews.js';
import { DataTransferDTO, ExtHostTreeViewsShape } from '../../common/extHost.protocol.js';
import { CustomTreeView } from '../../../browser/parts/views/treeView.js';
import { Extensions, ICustomViewDescriptor, ITreeItem, ITreeView, ITreeViewDescriptor, IViewContainersRegistry, IViewDescriptor, IViewDescriptorService, IViewsRegistry, TreeItemCollapsibleState, ViewContainer, ViewContainerLocation } from '../../../common/views.js';
import { IExtHostContext } from '../../../services/extensions/common/extHostCustomers.js';
import { ExtensionHostKind } from '../../../services/extensions/common/extensionHostKind.js';
import { ViewDescriptorService } from '../../../services/views/browser/viewDescriptorService.js';
import { TestViewsService, workbenchInstantiationService } from '../../../test/browser/workbenchTestServices.js';
import { TestExtensionService } from '../../../test/common/workbenchTestServices.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Mimes } from '../../../../base/common/mime.js';
import { URI } from '../../../../base/common/uri.js';
import * as sinon from 'sinon';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';

suite('MainThreadHostTreeView', function () {
	const testTreeViewId = 'testTreeView';
	const customValue = 'customValue';
	const ViewsRegistry = Registry.as<IViewsRegistry>(Extensions.ViewsRegistry);

	interface CustomTreeItem extends ITreeItem {
		customProp: string;
	}

	class MockExtHostTreeViewsShape extends mock<ExtHostTreeViewsShape>() {
		override $setFocusedTreeView(treeViewId: string | undefined): void { }

		override async $getChildren(treeViewId: string, treeItemHandle?: string[]): Promise<(number | ITreeItem)[][]> {
			return [[0, <CustomTreeItem>{ handle: 'testItem1', collapsibleState: TreeItemCollapsibleState.Expanded, customProp: customValue }]];
		}

		override async $hasResolve(): Promise<boolean> {
			return false;
		}

		override $setVisible(): void { }
	}

	let container: ViewContainer;
	let mainThreadTreeViews: MainThreadTreeViews;
	let extHostTreeViewsShape: MockExtHostTreeViewsShape;
	let instantiationService: TestInstantiationService;
	let viewsService: TestViewsService;

	teardown(() => {
		ViewsRegistry.deregisterViews(ViewsRegistry.getViews(container), container);
	});

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	setup(async () => {
		instantiationService = workbenchInstantiationService(undefined, disposables);
		const viewDescriptorService = disposables.add(instantiationService.createInstance(ViewDescriptorService));
		instantiationService.stub(IViewDescriptorService, viewDescriptorService);
		viewsService = new TestViewsService();
		// eslint-disable-next-line local/code-no-any-casts
		container = Registry.as<IViewContainersRegistry>(Extensions.ViewContainersRegistry).registerViewContainer({ id: 'testContainer', title: nls.localize2('test', 'test'), ctorDescriptor: new SyncDescriptor(<any>{}) }, ViewContainerLocation.Sidebar);
		const viewDescriptor: ITreeViewDescriptor = {
			id: testTreeViewId,
			ctorDescriptor: null!,
			name: nls.localize2('Test View 1', 'Test View 1'),
			treeView: disposables.add(instantiationService.createInstance(CustomTreeView, 'testTree', 'Test Title', 'extension.id')),
		};
		ViewsRegistry.registerViews([viewDescriptor], container);

		const testExtensionService = new TestExtensionService();
		extHostTreeViewsShape = new MockExtHostTreeViewsShape();
		mainThreadTreeViews = disposables.add(new MainThreadTreeViews(
			new class implements IExtHostContext {
				remoteAuthority = '';
				extensionHostKind = ExtensionHostKind.LocalProcess;
				dispose() { }
				assertRegistered() { }
				set(v: any): any { return null; }
				getProxy(): any {
					return extHostTreeViewsShape;
				}
				drain(): any { return null; }
			}, viewsService, new TestNotificationService(), testExtensionService, new NullLogService(), NullTelemetryService));
		mainThreadTreeViews.$registerTreeViewDataProvider(testTreeViewId, { showCollapseAll: false, canSelectMany: false, dropMimeTypes: [], dragMimeTypes: [], hasHandleDrag: false, hasHandleDrop: false, manuallyManageCheckboxes: false });
		await testExtensionService.whenInstalledExtensionsRegistered();
	});

	test('getChildren keeps custom properties', async () => {
		const treeView: ITreeView = (<ITreeViewDescriptor>ViewsRegistry.getView(testTreeViewId)).treeView;
		const children = await treeView.dataProvider?.getChildren({ handle: 'root', collapsibleState: TreeItemCollapsibleState.Expanded });
		assert(children!.length === 1, 'Exactly one child should be returned');
		assert((<CustomTreeItem>children![0]).customProp === customValue, 'Tree Items should keep custom properties');
	});

	test('handleDrag reconstructs URI list from uriListData', async () => {
		const testTreeViewIdWithDrag = 'testTreeViewWithDrag';

		// Create a mock that returns URI list data
		const mockExtHostWithDrag = new class extends mock<ExtHostTreeViewsShape>() {
			override async $getChildren(treeViewId: string, treeItemHandle?: string[]): Promise<(number | ITreeItem)[][]> {
				return [[0, { handle: 'item1', collapsibleState: TreeItemCollapsibleState.None }]];
			}

			override async $hasResolve(): Promise<boolean> {
				return false;
			}

			override $setVisible(): void { }

			override async $handleDrag(_sourceViewId: string, _sourceTreeItemHandles: string[], _operationUuid: string, _token: CancellationToken): Promise<DataTransferDTO | undefined> {
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
		const viewDescriptorWithDrag: ITreeViewDescriptor = {
			id: testTreeViewIdWithDrag,
			ctorDescriptor: null!,
			name: nls.localize2('Test View 2', 'Test View 2'),
			treeView: disposables.add(instantiationService.createInstance(CustomTreeView, 'testTree2', 'Test Title 2', 'extension.id')),
		};
		ViewsRegistry.registerViews([viewDescriptorWithDrag], container);

		const dragTestExtensionService = new TestExtensionService();
		const dragTestMainThreadTreeViews = disposables.add(new MainThreadTreeViews(
			new class implements IExtHostContext {
				remoteAuthority = '';
				extensionHostKind = ExtensionHostKind.LocalProcess;
				dispose() { }
				assertRegistered() { }
				set(v: any): any { return null; }
				getProxy(): any {
					return mockExtHostWithDrag;
				}
				drain(): any { return null; }
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
		const dragTestTreeView: ITreeView = (<ITreeViewDescriptor>ViewsRegistry.getView(testTreeViewIdWithDrag)).treeView;
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

	test('updates focused tree view', () => {
		const proxy = sinon.spy(extHostTreeViewsShape, '$setFocusedTreeView');

		viewsService.setFocusedView(<ICustomViewDescriptor>{
			id: testTreeViewId,
			extensionId: new ExtensionIdentifier('test.extension'),
			treeView: (<ITreeViewDescriptor>ViewsRegistry.getView(testTreeViewId)).treeView
		});

		assert.strictEqual(proxy.callCount, 1);
		assert.strictEqual(proxy.firstCall.args[0], testTreeViewId);

		viewsService.setFocusedView(null);

		assert.strictEqual(proxy.callCount, 2);
		assert.strictEqual(proxy.secondCall.args[0], undefined);
	});

	test('ignores non-extension focused views', () => {
		const proxy = sinon.spy(extHostTreeViewsShape, '$setFocusedTreeView');

		viewsService.setFocusedView(<IViewDescriptor>{
			id: 'noTreeView'
		});
		viewsService.setFocusedView(<ITreeViewDescriptor>{
			id: 'builtInTreeView',
			treeView: (<ITreeViewDescriptor>ViewsRegistry.getView(testTreeViewId)).treeView
		});

		assert.strictEqual(proxy.callCount, 0);
	});

	test('does not emit duplicate focused tree view values', () => {
		const proxy = sinon.spy(extHostTreeViewsShape, '$setFocusedTreeView');

		const view1 = <ICustomViewDescriptor>{
			id: testTreeViewId,
			extensionId: new ExtensionIdentifier('test.extension'),
			treeView: (<ITreeViewDescriptor>ViewsRegistry.getView(testTreeViewId)).treeView
		};

		viewsService.setFocusedView(view1);
		viewsService.setFocusedView(view1);
		viewsService.setFocusedView(null);

		assert.strictEqual(proxy.callCount, 2);
		assert.strictEqual(proxy.firstCall.args[0], testTreeViewId);
		assert.strictEqual(proxy.secondCall.args[0], undefined);
	});

	test('ignores extension-contributed non-tree views', () => {
		const proxy = sinon.spy(extHostTreeViewsShape, '$setFocusedTreeView');

		viewsService.setFocusedView(<ICustomViewDescriptor>{
			id: 'webview',
			extensionId: new ExtensionIdentifier('test.extension')
		});

		assert.strictEqual(proxy.callCount, 0);
	});

});
