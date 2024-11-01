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
import { MainThreadTreeViews } from '../../browser/mainThreadTreeViews.js';
import { ExtHostTreeViewsShape } from '../../common/extHost.protocol.js';
import { CustomTreeView } from '../../../browser/parts/views/treeView.js';
import { Extensions, ITreeItem, ITreeView, ITreeViewDescriptor, IViewContainersRegistry, IViewDescriptorService, IViewsRegistry, TreeItemCollapsibleState, ViewContainer, ViewContainerLocation } from '../../../common/views.js';
import { IExtHostContext } from '../../../services/extensions/common/extHostCustomers.js';
import { ExtensionHostKind } from '../../../services/extensions/common/extensionHostKind.js';
import { ViewDescriptorService } from '../../../services/views/browser/viewDescriptorService.js';
import { TestViewsService, workbenchInstantiationService } from '../../../test/browser/workbenchTestServices.js';
import { TestExtensionService } from '../../../test/common/workbenchTestServices.js';

suite('MainThreadHostTreeView', function () {
	const testTreeViewId = 'testTreeView';
	const customValue = 'customValue';
	const ViewsRegistry = Registry.as<IViewsRegistry>(Extensions.ViewsRegistry);

	interface CustomTreeItem extends ITreeItem {
		customProp: string;
	}

	class MockExtHostTreeViewsShape extends mock<ExtHostTreeViewsShape>() {
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

	teardown(() => {
		ViewsRegistry.deregisterViews(ViewsRegistry.getViews(container), container);
	});

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	setup(async () => {
		const instantiationService: TestInstantiationService = workbenchInstantiationService(undefined, disposables);
		const viewDescriptorService = disposables.add(instantiationService.createInstance(ViewDescriptorService));
		instantiationService.stub(IViewDescriptorService, viewDescriptorService);
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
			}, new TestViewsService(), new TestNotificationService(), testExtensionService, new NullLogService()));
		mainThreadTreeViews.$registerTreeViewDataProvider(testTreeViewId, { showCollapseAll: false, canSelectMany: false, dropMimeTypes: [], dragMimeTypes: [], hasHandleDrag: false, hasHandleDrop: false, manuallyManageCheckboxes: false });
		await testExtensionService.whenInstalledExtensionsRegistered();
	});

	test('getChildren keeps custom properties', async () => {
		const treeView: ITreeView = (<ITreeViewDescriptor>ViewsRegistry.getView(testTreeViewId)).treeView;
		const children = await treeView.dataProvider?.getChildren({ handle: 'root', collapsibleState: TreeItemCollapsibleState.Expanded });
		assert(children!.length === 1, 'Exactly one child should be returned');
		assert((<CustomTreeItem>children![0]).customProp === customValue, 'Tree Items should keep custom properties');
	});


});
