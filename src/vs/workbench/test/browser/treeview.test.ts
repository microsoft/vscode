/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../base/browser/dom.js';
import { mainWindow } from '../../../base/browser/window.js';
import { timeout } from '../../../base/common/async.js';
import { toDisposable } from '../../../base/common/lifecycle.js';
import { TreeView } from '../../browser/parts/views/treeView.js';
import { workbenchInstantiationService } from './workbenchTestServices.js';
import { TestInstantiationService } from '../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ITreeItem, ITreeViewDataProvider, IViewDescriptorService, TreeItemCollapsibleState } from '../../common/views.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { ViewDescriptorService } from '../../services/views/browser/viewDescriptorService.js';

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

suite('TreeView checkboxes', function () {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('the whole checkbox of a collapsible item is clickable and does not toggle collapse', async () => {
		const instantiationService: TestInstantiationService = workbenchInstantiationService(undefined, disposables);
		const viewDescriptorService = disposables.add(instantiationService.createInstance(ViewDescriptorService));
		instantiationService.stub(IViewDescriptorService, viewDescriptorService);
		const treeView = disposables.add(instantiationService.createInstance(TreeView, 'testCheckboxTree', 'Test Title'));
		const folder: ITreeItem = { handle: 'folder', label: { label: 'folder' }, collapsibleState: TreeItemCollapsibleState.Expanded, checkbox: { isChecked: false } };
		const file: ITreeItem = { handle: 'file', parentHandle: 'folder', label: { label: 'file' }, collapsibleState: TreeItemCollapsibleState.None, checkbox: { isChecked: false } };
		treeView.dataProvider = {
			getChildren: async (element?: ITreeItem) => !element ? [folder] : element.handle === folder.handle ? [file] : []
		};

		const container = mainWindow.document.body.appendChild($('.monaco-workbench'));
		disposables.add(toDisposable(() => container.remove()));
		container.style.position = 'fixed';
		container.style.top = '0';
		container.style.left = '0';
		container.style.width = '300px';
		container.style.height = '200px';
		treeView.setVisibility(true);
		treeView.show(container);
		treeView.layout(200, 300);
		await treeView.refresh();
		await timeout(0);

		const row = container.querySelector<HTMLElement>('.monaco-list-row[data-index="0"]')!;
		const checkbox = row.querySelector<HTMLElement>('.custom-view-tree-node-item-checkbox')!;
		const bounds = checkbox.getBoundingClientRect();
		const centerX = bounds.left + bounds.width / 2;
		const centerY = bounds.top + bounds.height / 2;
		const points = {
			left: { x: bounds.left + 1, y: centerY },
			right: { x: bounds.right - 1, y: centerY },
			top: { x: centerX, y: bounds.top + 1 },
			bottom: { x: centerX, y: bounds.bottom - 1 },
		};
		const hitsCheckbox = Object.fromEntries(Object.entries(points).map(([edge, { x, y }]) => [edge, checkbox.contains(mainWindow.document.elementFromPoint(x, y))]));

		const leftEdge = mainWindow.document.elementFromPoint(points.left.x, points.left.y)!;
		leftEdge.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1, clientX: points.left.x, clientY: points.left.y }));

		assert.deepStrictEqual({
			hitsCheckbox,
			checked: folder.checkbox?.isChecked,
			collapsed: treeView.isCollapsed(folder),
		}, {
			hitsCheckbox: { left: true, right: true, top: true, bottom: true },
			checked: true,
			collapsed: false,
		});
	});
});
