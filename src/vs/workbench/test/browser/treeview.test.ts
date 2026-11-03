/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { TreeView } from '../../browser/parts/views/treeView.js';
import { workbenchInstantiationService } from './workbenchTestServices.js';
import { TestInstantiationService } from '../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ITreeItem, ITreeViewDataProvider, IViewDescriptorService, TreeItemCollapsibleState } from '../../common/views.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { ViewDescriptorService } from '../../services/views/browser/viewDescriptorService.js';
import { mainWindow } from '../../../base/browser/window.js';
import { toDisposable } from '../../../base/common/lifecycle.js';

suite('TreeView', function () {

	let instantiationService: TestInstantiationService;
	let treeView: TreeView;
	let dataProvider: ITreeViewDataProvider;
	let largestBatchSize: number = 0;

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	setup(async () => {
		largestBatchSize = 0;
		instantiationService = workbenchInstantiationService(undefined, disposables);
		const viewDescriptorService = disposables.add(instantiationService.createInstance(ViewDescriptorService));
		instantiationService.stub(IViewDescriptorService, viewDescriptorService);
		treeView = disposables.add(instantiationService.createInstance(TreeView, 'testTree', 'Test Title'));
		const getChildrenOfItem = async (element?: ITreeItem): Promise<ITreeItem[] | undefined> => {
			if (element) {
				return undefined;
			} else {
				const rootChildren: ITreeItem[] = [];
				for (let i = 0; i < 100; i++) {
					rootChildren.push({ handle: `item_${i}`, collapsibleState: TreeItemCollapsibleState.Expanded });
				}
				return rootChildren;
			}
		};

		dataProvider = {
			getChildren: getChildrenOfItem,
			getChildrenBatch: async (elements?: ITreeItem[]): Promise<ITreeItem[][] | undefined> => {
				if (elements && elements.length > largestBatchSize) {
					largestBatchSize = elements.length;
				}
				if (elements) {
					return Array(elements.length).fill([]);
				} else {
					return [(await getChildrenOfItem()) ?? []];
				}
			}
		};
		treeView.dataProvider = dataProvider;
	});

	test('children are batched', async () => {
		assert.strictEqual(largestBatchSize, 0);
		treeView.setVisibility(true);
		await treeView.refresh();
		assert.strictEqual(largestBatchSize, 100);
	});

	test('tree created in a hidden tree container renders rows once its data loads', async () => {
		const container = mainWindow.document.createElement('div');
		// Scope the container like the workbench so that the view styles that hide an empty tree container apply
		container.classList.add('monaco-workbench');
		mainWindow.document.body.appendChild(container);
		disposables.add(toDisposable(() => container.remove()));

		// Mirror an extension view that starts collapsed: the view is created before its data provider is registered, so
		// it shows the "no data provider" message, which then keeps the still empty tree container hidden. When the view
		// is expanded, it is laid out before it becomes visible and creates its tree in that hidden tree container.
		const lateTreeView = disposables.add(instantiationService.createInstance(TreeView, 'lateDataProviderTree', 'Test Title'));
		lateTreeView.setVisibility(false);
		lateTreeView.dataProvider = dataProvider;
		lateTreeView.show(container);
		lateTreeView.layout(220, 300);
		lateTreeView.setVisibility(true);
		await lateTreeView.refresh();

		assert.strictEqual(container.querySelectorAll('.monaco-list-row').length, 10);
	});


});
