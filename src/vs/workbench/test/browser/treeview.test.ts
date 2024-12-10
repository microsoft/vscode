/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { TreeView } from '../../browser/parts/views/treeView.js';
import { workbenchInstantiationService } from './workbenchTestServices.js';
import { TestInstantiationService } from '../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ITreeItem, IViewDescriptorService, TreeItemCollapsibleState } from '../../common/views.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { ViewDescriptorService } from '../../services/views/browser/viewDescriptorService.js';

suite('TreeView', function () {

	let treeView: TreeView;
	let largestBatchSize: number = 0;

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	setup(async () => {
		largestBatchSize = 0;
		const instantiationService: TestInstantiationService = workbenchInstantiationService(undefined, disposables);
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

		treeView.dataProvider = {
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
	});

	test('children are batched', async () => {
		assert.strictEqual(largestBatchSize, 0);
		treeView.setVisibility(true);
		await treeView.refresh();
		assert.strictEqual(largestBatchSize, 100);
	});


});
