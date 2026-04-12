/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { WorkbenchObjectTree } from '../../../../../platform/list/browser/listService.js';
import { TestItemTreeElement } from './index.js';
import { TestId } from '../../common/testId.js';
export class TestingObjectTree extends WorkbenchObjectTree {
    /**
     * Gets a serialized view state for the tree, optimized for storage.
     *
     * @param updatePreviousState Optional previous state to mutate and update
     * instead of creating a new one.
     */
    getOptimizedViewState(updatePreviousState) {
        const root = updatePreviousState || {};
        /**
         * Recursive builder function. Returns whether the subtree has any non-default
         * value. Adds itself to the parent children if it does.
         */
        const build = (node, parent) => {
            if (!(node.element instanceof TestItemTreeElement)) {
                return false;
            }
            const localId = TestId.localId(node.element.test.item.extId);
            const inTree = parent.children?.[localId] || {};
            // only saved collapsed state if it's not the default (not collapsed, or a root depth)
            inTree.collapsed = node.depth === 0 || !node.collapsed ? node.collapsed : undefined;
            let hasAnyNonDefaultValue = inTree.collapsed !== undefined;
            if (node.children.length) {
                for (const child of node.children) {
                    hasAnyNonDefaultValue = build(child, inTree) || hasAnyNonDefaultValue;
                }
            }
            if (hasAnyNonDefaultValue) {
                parent.children ??= {};
                parent.children[localId] = inTree;
            }
            else if (parent.children?.hasOwnProperty(localId)) {
                delete parent.children[localId];
            }
            return hasAnyNonDefaultValue;
        };
        root.children ??= {};
        // Controller IDs are hidden if there's only a single test controller, but
        // make sure they're added when the tree is built if this is the case, so
        // that the later ID lookup works.
        for (const node of this.getNode().children) {
            if (node.element instanceof TestItemTreeElement) {
                if (node.element.test.controllerId === node.element.test.item.extId) {
                    build(node, root);
                }
                else {
                    const ctrlNode = root.children[node.element.test.controllerId] ??= { children: {} };
                    build(node, ctrlNode);
                }
            }
        }
        return root;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdGluZ09iamVjdFRyZWUuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXN0aW5nL2Jyb3dzZXIvZXhwbG9yZXJQcm9qZWN0aW9ucy90ZXN0aW5nT2JqZWN0VHJlZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUdoRyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUMxRixPQUFPLEVBQTJCLG1CQUFtQixFQUFFLE1BQU0sWUFBWSxDQUFDO0FBRTFFLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUdoRCxNQUFNLE9BQU8saUJBQXNDLFNBQVEsbUJBQXlEO0lBRW5IOzs7OztPQUtHO0lBQ0kscUJBQXFCLENBQUMsbUJBQXNEO1FBQ2xGLE1BQU0sSUFBSSxHQUFxQyxtQkFBbUIsSUFBSSxFQUFFLENBQUM7UUFFekU7OztXQUdHO1FBQ0gsTUFBTSxLQUFLLEdBQUcsQ0FBQyxJQUF3RCxFQUFFLE1BQXdDLEVBQVcsRUFBRTtZQUM3SCxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsT0FBTyxZQUFZLG1CQUFtQixDQUFDLEVBQUUsQ0FBQztnQkFDcEQsT0FBTyxLQUFLLENBQUM7WUFDZCxDQUFDO1lBRUQsTUFBTSxPQUFPLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDN0QsTUFBTSxNQUFNLEdBQUcsTUFBTSxDQUFDLFFBQVEsRUFBRSxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNoRCxzRkFBc0Y7WUFDdEYsTUFBTSxDQUFDLFNBQVMsR0FBRyxJQUFJLENBQUMsS0FBSyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztZQUVwRixJQUFJLHFCQUFxQixHQUFHLE1BQU0sQ0FBQyxTQUFTLEtBQUssU0FBUyxDQUFDO1lBQzNELElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQztnQkFDMUIsS0FBSyxNQUFNLEtBQUssSUFBSSxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7b0JBQ25DLHFCQUFxQixHQUFHLEtBQUssQ0FBQyxLQUFLLEVBQUUsTUFBTSxDQUFDLElBQUkscUJBQXFCLENBQUM7Z0JBQ3ZFLENBQUM7WUFDRixDQUFDO1lBRUQsSUFBSSxxQkFBcUIsRUFBRSxDQUFDO2dCQUMzQixNQUFNLENBQUMsUUFBUSxLQUFLLEVBQUUsQ0FBQztnQkFDdkIsTUFBTSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsR0FBRyxNQUFNLENBQUM7WUFDbkMsQ0FBQztpQkFBTSxJQUFJLE1BQU0sQ0FBQyxRQUFRLEVBQUUsY0FBYyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7Z0JBQ3JELE9BQU8sTUFBTSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUNqQyxDQUFDO1lBRUQsT0FBTyxxQkFBcUIsQ0FBQztRQUM5QixDQUFDLENBQUM7UUFFRixJQUFJLENBQUMsUUFBUSxLQUFLLEVBQUUsQ0FBQztRQUVyQiwwRUFBMEU7UUFDMUUseUVBQXlFO1FBQ3pFLGtDQUFrQztRQUNsQyxLQUFLLE1BQU0sSUFBSSxJQUFJLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUM1QyxJQUFJLElBQUksQ0FBQyxPQUFPLFlBQVksbUJBQW1CLEVBQUUsQ0FBQztnQkFDakQsSUFBSSxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxZQUFZLEtBQUssSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO29CQUNyRSxLQUFLLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO2dCQUNuQixDQUFDO3FCQUFNLENBQUM7b0JBQ1AsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsS0FBSyxFQUFFLFFBQVEsRUFBRSxFQUFFLEVBQUUsQ0FBQztvQkFDcEYsS0FBSyxDQUFDLElBQUksRUFBRSxRQUFRLENBQUMsQ0FBQztnQkFDdkIsQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDO1FBRUQsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0NBQ0QifQ==