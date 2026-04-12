/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ObjectTreeElementCollapseState } from '../../../../../base/browser/ui/tree/tree.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Iterable } from '../../../../../base/common/iterator.js';
import { isCollapsedInSerializedTestTree } from './testingViewState.js';
import { InternalTestItem } from '../../common/testTypes.js';
let idCounter = 0;
const getId = () => String(idCounter++);
export class TestItemTreeElement {
    constructor(test, 
    /**
     * Parent tree item. May not actually be the test item who owns this one
     * in a 'flat' projection.
     */
    parent = null) {
        this.test = test;
        this.parent = parent;
        this.changeEmitter = new Emitter();
        /**
         * Fired whenever the element or test properties change.
         */
        this.onChange = this.changeEmitter.event;
        /**
         * Tree children of this item.
         */
        this.children = new Set();
        /**
         * Unique ID of the element in the tree.
         */
        this.treeId = getId();
        /**
         * Whether the node's test result is 'retired' -- from an outdated test run.
         */
        this.retired = false;
        /**
         * State to show on the item. This is generally the item's computed state
         * from its children.
         */
        this.state = 0 /* TestResultState.Unset */;
        this.depth = parent ? parent.depth + 1 : 0;
    }
    toJSON() {
        if (this.depth === 0) {
            return { controllerId: this.test.controllerId };
        }
        const context = {
            $mid: 16 /* MarshalledId.TestItemContext */,
            tests: [InternalTestItem.serialize(this.test)],
        };
        for (let p = this.parent; p && p.depth > 0; p = p.parent) {
            context.tests.unshift(InternalTestItem.serialize(p.test));
        }
        return context;
    }
}
export class TestTreeErrorMessage {
    get description() {
        return typeof this.message === 'string' ? this.message : this.message.value;
    }
    constructor(message, parent) {
        this.message = message;
        this.parent = parent;
        this.treeId = getId();
        this.children = new Set();
    }
}
export const testIdentityProvider = {
    getId(element) {
        // For "not expandable" elements, whether they have children is part of the
        // ID so they're rerendered if that changes (#204805)
        const expandComponent = element instanceof TestTreeErrorMessage
            ? 'error'
            : element.test.expand === 0 /* TestItemExpandState.NotExpandable */
                ? !!element.children.size
                : element.test.expand;
        return element.treeId + '\0' + expandComponent;
    }
};
export const getChildrenForParent = (serialized, rootsWithChildren, node) => {
    let it;
    if (node === null) { // roots
        const rootsWithChildrenArr = [...rootsWithChildren];
        if (rootsWithChildrenArr.length === 1) {
            return getChildrenForParent(serialized, rootsWithChildrenArr, rootsWithChildrenArr[0]);
        }
        it = rootsWithChildrenArr;
    }
    else {
        it = node.children;
    }
    return Iterable.map(it, element => (element instanceof TestTreeErrorMessage
        ? { element }
        : {
            element,
            collapsible: element.test.expand !== 0 /* TestItemExpandState.NotExpandable */,
            collapsed: element.test.item.error
                ? ObjectTreeElementCollapseState.PreserveOrExpanded
                : (isCollapsedInSerializedTestTree(serialized, element.test.item.extId) ?? element.depth > 0
                    ? ObjectTreeElementCollapseState.PreserveOrCollapsed
                    : ObjectTreeElementCollapseState.PreserveOrExpanded),
            children: getChildrenForParent(serialized, rootsWithChildren, element),
        }));
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXN0aW5nL2Jyb3dzZXIvZXhwbG9yZXJQcm9qZWN0aW9ucy9pbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUloRyxPQUFPLEVBQXNCLDhCQUE4QixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDakgsT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLHFDQUFxQyxDQUFDO0FBR3JFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUdsRSxPQUFPLEVBQW9DLCtCQUErQixFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDMUcsT0FBTyxFQUFvQixnQkFBZ0IsRUFBd0MsTUFBTSwyQkFBMkIsQ0FBQztBQW9DckgsSUFBSSxTQUFTLEdBQUcsQ0FBQyxDQUFDO0FBRWxCLE1BQU0sS0FBSyxHQUFHLEdBQUcsRUFBRSxDQUFDLE1BQU0sQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDO0FBRXhDLE1BQU0sT0FBZ0IsbUJBQW1CO0lBNEN4QyxZQUNpQixJQUFzQjtJQUN0Qzs7O09BR0c7SUFDYSxTQUFxQyxJQUFJO1FBTHpDLFNBQUksR0FBSixJQUFJLENBQWtCO1FBS3RCLFdBQU0sR0FBTixNQUFNLENBQW1DO1FBakR2QyxrQkFBYSxHQUFHLElBQUksT0FBTyxFQUFRLENBQUM7UUFFdkQ7O1dBRUc7UUFDYSxhQUFRLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUM7UUFFcEQ7O1dBRUc7UUFDYSxhQUFRLEdBQUcsSUFBSSxHQUFHLEVBQTJCLENBQUM7UUFFOUQ7O1dBRUc7UUFDYSxXQUFNLEdBQUcsS0FBSyxFQUFFLENBQUM7UUFPakM7O1dBRUc7UUFDSSxZQUFPLEdBQUcsS0FBSyxDQUFDO1FBRXZCOzs7V0FHRztRQUNJLFVBQUssaUNBQXlCO1FBb0JwQyxJQUFJLENBQUMsS0FBSyxHQUFHLE1BQU0sQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUM1QyxDQUFDO0lBRU0sTUFBTTtRQUNaLElBQUksSUFBSSxDQUFDLEtBQUssS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUN0QixPQUFPLEVBQUUsWUFBWSxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDakQsQ0FBQztRQUVELE1BQU0sT0FBTyxHQUFxQjtZQUNqQyxJQUFJLHVDQUE4QjtZQUNsQyxLQUFLLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1NBQzlDLENBQUM7UUFFRixLQUFLLElBQUksQ0FBQyxHQUFHLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxLQUFLLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDMUQsT0FBTyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsZ0JBQWdCLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQzNELENBQUM7UUFFRCxPQUFPLE9BQU8sQ0FBQztJQUNoQixDQUFDO0NBQ0Q7QUFFRCxNQUFNLE9BQU8sb0JBQW9CO0lBSWhDLElBQVcsV0FBVztRQUNyQixPQUFPLE9BQU8sSUFBSSxDQUFDLE9BQU8sS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDO0lBQzdFLENBQUM7SUFFRCxZQUNpQixPQUFpQyxFQUNqQyxNQUErQjtRQUQvQixZQUFPLEdBQVAsT0FBTyxDQUEwQjtRQUNqQyxXQUFNLEdBQU4sTUFBTSxDQUF5QjtRQVRoQyxXQUFNLEdBQUcsS0FBSyxFQUFFLENBQUM7UUFDakIsYUFBUSxHQUFHLElBQUksR0FBRyxFQUFTLENBQUM7SUFTeEMsQ0FBQztDQUNMO0FBSUQsTUFBTSxDQUFDLE1BQU0sb0JBQW9CLEdBQStDO0lBQy9FLEtBQUssQ0FBQyxPQUFPO1FBQ1osMkVBQTJFO1FBQzNFLHFEQUFxRDtRQUNyRCxNQUFNLGVBQWUsR0FBRyxPQUFPLFlBQVksb0JBQW9CO1lBQzlELENBQUMsQ0FBQyxPQUFPO1lBQ1QsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsTUFBTSw4Q0FBc0M7Z0JBQzFELENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxJQUFJO2dCQUN6QixDQUFDLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUM7UUFFeEIsT0FBTyxPQUFPLENBQUMsTUFBTSxHQUFHLElBQUksR0FBRyxlQUFlLENBQUM7SUFDaEQsQ0FBQztDQUNELENBQUM7QUFFRixNQUFNLENBQUMsTUFBTSxvQkFBb0IsR0FBRyxDQUFDLFVBQTRDLEVBQUUsaUJBQW9ELEVBQUUsSUFBb0MsRUFBeUQsRUFBRTtJQUN2TyxJQUFJLEVBQXFDLENBQUM7SUFDMUMsSUFBSSxJQUFJLEtBQUssSUFBSSxFQUFFLENBQUMsQ0FBQyxRQUFRO1FBQzVCLE1BQU0sb0JBQW9CLEdBQUcsQ0FBQyxHQUFHLGlCQUFpQixDQUFDLENBQUM7UUFDcEQsSUFBSSxvQkFBb0IsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDdkMsT0FBTyxvQkFBb0IsQ0FBQyxVQUFVLEVBQUUsb0JBQW9CLEVBQUUsb0JBQW9CLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN4RixDQUFDO1FBQ0QsRUFBRSxHQUFHLG9CQUFvQixDQUFDO0lBQzNCLENBQUM7U0FBTSxDQUFDO1FBQ1AsRUFBRSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUM7SUFDcEIsQ0FBQztJQUVELE9BQU8sUUFBUSxDQUFDLEdBQUcsQ0FBQyxFQUFFLEVBQUUsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUNsQyxPQUFPLFlBQVksb0JBQW9CO1FBQ3RDLENBQUMsQ0FBQyxFQUFFLE9BQU8sRUFBRTtRQUNiLENBQUMsQ0FBQztZQUNELE9BQU87WUFDUCxXQUFXLEVBQUUsT0FBTyxDQUFDLElBQUksQ0FBQyxNQUFNLDhDQUFzQztZQUN0RSxTQUFTLEVBQUUsT0FBTyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSztnQkFDakMsQ0FBQyxDQUFDLDhCQUE4QixDQUFDLGtCQUFrQjtnQkFDbkQsQ0FBQyxDQUFDLENBQUMsK0JBQStCLENBQUMsVUFBVSxFQUFFLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLE9BQU8sQ0FBQyxLQUFLLEdBQUcsQ0FBQztvQkFDM0YsQ0FBQyxDQUFDLDhCQUE4QixDQUFDLG1CQUFtQjtvQkFDcEQsQ0FBQyxDQUFDLDhCQUE4QixDQUFDLGtCQUFrQixDQUFDO1lBQ3RELFFBQVEsRUFBRSxvQkFBb0IsQ0FBQyxVQUFVLEVBQUUsaUJBQWlCLEVBQUUsT0FBTyxDQUFDO1NBQ3RFLENBQ0YsQ0FBQyxDQUFDO0FBQ0osQ0FBQyxDQUFDIn0=