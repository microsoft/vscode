/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { TreeView } from '../../browser/parts/views/treeView.js';
import { workbenchInstantiationService } from './workbenchTestServices.js';
import { IViewDescriptorService, TreeItemCollapsibleState } from '../../common/views.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { ViewDescriptorService } from '../../services/views/browser/viewDescriptorService.js';
suite('TreeView', function () {
    let treeView;
    let largestBatchSize = 0;
    const disposables = ensureNoDisposablesAreLeakedInTestSuite();
    setup(async () => {
        largestBatchSize = 0;
        const instantiationService = workbenchInstantiationService(undefined, disposables);
        const viewDescriptorService = disposables.add(instantiationService.createInstance(ViewDescriptorService));
        instantiationService.stub(IViewDescriptorService, viewDescriptorService);
        treeView = disposables.add(instantiationService.createInstance(TreeView, 'testTree', 'Test Title'));
        const getChildrenOfItem = async (element) => {
            if (element) {
                return undefined;
            }
            else {
                const rootChildren = [];
                for (let i = 0; i < 100; i++) {
                    rootChildren.push({ handle: `item_${i}`, collapsibleState: TreeItemCollapsibleState.Expanded });
                }
                return rootChildren;
            }
        };
        treeView.dataProvider = {
            getChildren: getChildrenOfItem,
            getChildrenBatch: async (elements) => {
                if (elements && elements.length > largestBatchSize) {
                    largestBatchSize = elements.length;
                }
                if (elements) {
                    return Array(elements.length).fill([]);
                }
                else {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJlZXZpZXcudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC90ZXN0L2Jyb3dzZXIvdHJlZXZpZXcudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSw2QkFBNkIsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBRTNFLE9BQU8sRUFBYSxzQkFBc0IsRUFBRSx3QkFBd0IsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQ3BHLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzdGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBRTlGLEtBQUssQ0FBQyxVQUFVLEVBQUU7SUFFakIsSUFBSSxRQUFrQixDQUFDO0lBQ3ZCLElBQUksZ0JBQWdCLEdBQVcsQ0FBQyxDQUFDO0lBRWpDLE1BQU0sV0FBVyxHQUFHLHVDQUF1QyxFQUFFLENBQUM7SUFFOUQsS0FBSyxDQUFDLEtBQUssSUFBSSxFQUFFO1FBQ2hCLGdCQUFnQixHQUFHLENBQUMsQ0FBQztRQUNyQixNQUFNLG9CQUFvQixHQUE2Qiw2QkFBNkIsQ0FBQyxTQUFTLEVBQUUsV0FBVyxDQUFDLENBQUM7UUFDN0csTUFBTSxxQkFBcUIsR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDLENBQUM7UUFDMUcsb0JBQW9CLENBQUMsSUFBSSxDQUFDLHNCQUFzQixFQUFFLHFCQUFxQixDQUFDLENBQUM7UUFDekUsUUFBUSxHQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUFDLFFBQVEsRUFBRSxVQUFVLEVBQUUsWUFBWSxDQUFDLENBQUMsQ0FBQztRQUNwRyxNQUFNLGlCQUFpQixHQUFHLEtBQUssRUFBRSxPQUFtQixFQUFvQyxFQUFFO1lBQ3pGLElBQUksT0FBTyxFQUFFLENBQUM7Z0JBQ2IsT0FBTyxTQUFTLENBQUM7WUFDbEIsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLE1BQU0sWUFBWSxHQUFnQixFQUFFLENBQUM7Z0JBQ3JDLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxHQUFHLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztvQkFDOUIsWUFBWSxDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sRUFBRSxRQUFRLENBQUMsRUFBRSxFQUFFLGdCQUFnQixFQUFFLHdCQUF3QixDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7Z0JBQ2pHLENBQUM7Z0JBQ0QsT0FBTyxZQUFZLENBQUM7WUFDckIsQ0FBQztRQUNGLENBQUMsQ0FBQztRQUVGLFFBQVEsQ0FBQyxZQUFZLEdBQUc7WUFDdkIsV0FBVyxFQUFFLGlCQUFpQjtZQUM5QixnQkFBZ0IsRUFBRSxLQUFLLEVBQUUsUUFBc0IsRUFBc0MsRUFBRTtnQkFDdEYsSUFBSSxRQUFRLElBQUksUUFBUSxDQUFDLE1BQU0sR0FBRyxnQkFBZ0IsRUFBRSxDQUFDO29CQUNwRCxnQkFBZ0IsR0FBRyxRQUFRLENBQUMsTUFBTSxDQUFDO2dCQUNwQyxDQUFDO2dCQUNELElBQUksUUFBUSxFQUFFLENBQUM7b0JBQ2QsT0FBTyxLQUFLLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDeEMsQ0FBQztxQkFBTSxDQUFDO29CQUNQLE9BQU8sQ0FBQyxDQUFDLE1BQU0saUJBQWlCLEVBQUUsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO2dCQUM1QyxDQUFDO1lBQ0YsQ0FBQztTQUNELENBQUM7SUFDSCxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxzQkFBc0IsRUFBRSxLQUFLLElBQUksRUFBRTtRQUN2QyxNQUFNLENBQUMsV0FBVyxDQUFDLGdCQUFnQixFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3hDLFFBQVEsQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDN0IsTUFBTSxRQUFRLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDekIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxnQkFBZ0IsRUFBRSxHQUFHLENBQUMsQ0FBQztJQUMzQyxDQUFDLENBQUMsQ0FBQztBQUdKLENBQUMsQ0FBQyxDQUFDIn0=