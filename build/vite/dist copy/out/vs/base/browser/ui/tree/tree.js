/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export var TreeVisibility;
(function (TreeVisibility) {
    /**
     * The tree node should be hidden.
     */
    TreeVisibility[TreeVisibility["Hidden"] = 0] = "Hidden";
    /**
     * The tree node should be visible.
     */
    TreeVisibility[TreeVisibility["Visible"] = 1] = "Visible";
    /**
     * The tree node should be visible if any of its descendants is visible.
     */
    TreeVisibility[TreeVisibility["Recurse"] = 2] = "Recurse";
})(TreeVisibility || (TreeVisibility = {}));
export var ObjectTreeElementCollapseState;
(function (ObjectTreeElementCollapseState) {
    ObjectTreeElementCollapseState[ObjectTreeElementCollapseState["Expanded"] = 0] = "Expanded";
    ObjectTreeElementCollapseState[ObjectTreeElementCollapseState["Collapsed"] = 1] = "Collapsed";
    /**
     * If the element is already in the tree, preserve its current state. Else, expand it.
     */
    ObjectTreeElementCollapseState[ObjectTreeElementCollapseState["PreserveOrExpanded"] = 2] = "PreserveOrExpanded";
    /**
     * If the element is already in the tree, preserve its current state. Else, collapse it.
     */
    ObjectTreeElementCollapseState[ObjectTreeElementCollapseState["PreserveOrCollapsed"] = 3] = "PreserveOrCollapsed";
})(ObjectTreeElementCollapseState || (ObjectTreeElementCollapseState = {}));
export var TreeMouseEventTarget;
(function (TreeMouseEventTarget) {
    TreeMouseEventTarget[TreeMouseEventTarget["Unknown"] = 0] = "Unknown";
    TreeMouseEventTarget[TreeMouseEventTarget["Twistie"] = 1] = "Twistie";
    TreeMouseEventTarget[TreeMouseEventTarget["Element"] = 2] = "Element";
    TreeMouseEventTarget[TreeMouseEventTarget["Filter"] = 3] = "Filter";
})(TreeMouseEventTarget || (TreeMouseEventTarget = {}));
export var TreeDragOverBubble;
(function (TreeDragOverBubble) {
    TreeDragOverBubble[TreeDragOverBubble["Down"] = 0] = "Down";
    TreeDragOverBubble[TreeDragOverBubble["Up"] = 1] = "Up";
})(TreeDragOverBubble || (TreeDragOverBubble = {}));
export const TreeDragOverReactions = {
    acceptBubbleUp() { return { accept: true, bubble: 1 /* TreeDragOverBubble.Up */ }; },
    acceptBubbleDown(autoExpand = false) { return { accept: true, bubble: 0 /* TreeDragOverBubble.Down */, autoExpand }; },
    acceptCopyBubbleUp() { return { accept: true, bubble: 1 /* TreeDragOverBubble.Up */, effect: { type: 0 /* ListDragOverEffectType.Copy */, position: "drop-target" /* ListDragOverEffectPosition.Over */ } }; },
    acceptCopyBubbleDown(autoExpand = false) { return { accept: true, bubble: 0 /* TreeDragOverBubble.Down */, effect: { type: 0 /* ListDragOverEffectType.Copy */, position: "drop-target" /* ListDragOverEffectPosition.Over */ }, autoExpand }; }
};
export class TreeError extends Error {
    constructor(user, message) {
        super(`TreeError [${user}] ${message}`);
    }
}
export class WeakMapper {
    constructor(fn) {
        this.fn = fn;
        this._map = new WeakMap();
    }
    map(key) {
        let result = this._map.get(key);
        if (!result) {
            result = this.fn(key);
            this._map.set(key, result);
        }
        return result;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJlZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvYnJvd3Nlci91aS90cmVlL3RyZWUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFRaEcsTUFBTSxDQUFOLElBQWtCLGNBZ0JqQjtBQWhCRCxXQUFrQixjQUFjO0lBRS9COztPQUVHO0lBQ0gsdURBQU0sQ0FBQTtJQUVOOztPQUVHO0lBQ0gseURBQU8sQ0FBQTtJQUVQOztPQUVHO0lBQ0gseURBQU8sQ0FBQTtBQUNSLENBQUMsRUFoQmlCLGNBQWMsS0FBZCxjQUFjLFFBZ0IvQjtBQXVERCxNQUFNLENBQU4sSUFBWSw4QkFhWDtBQWJELFdBQVksOEJBQThCO0lBQ3pDLDJGQUFRLENBQUE7SUFDUiw2RkFBUyxDQUFBO0lBRVQ7O09BRUc7SUFDSCwrR0FBa0IsQ0FBQTtJQUVsQjs7T0FFRztJQUNILGlIQUFtQixDQUFBO0FBQ3BCLENBQUMsRUFiVyw4QkFBOEIsS0FBOUIsOEJBQThCLFFBYXpDO0FBa0ZELE1BQU0sQ0FBTixJQUFZLG9CQUtYO0FBTEQsV0FBWSxvQkFBb0I7SUFDL0IscUVBQU8sQ0FBQTtJQUNQLHFFQUFPLENBQUE7SUFDUCxxRUFBTyxDQUFBO0lBQ1AsbUVBQU0sQ0FBQTtBQUNQLENBQUMsRUFMVyxvQkFBb0IsS0FBcEIsb0JBQW9CLFFBSy9CO0FBa0NELE1BQU0sQ0FBTixJQUFrQixrQkFHakI7QUFIRCxXQUFrQixrQkFBa0I7SUFDbkMsMkRBQUksQ0FBQTtJQUNKLHVEQUFFLENBQUE7QUFDSCxDQUFDLEVBSGlCLGtCQUFrQixLQUFsQixrQkFBa0IsUUFHbkM7QUFPRCxNQUFNLENBQUMsTUFBTSxxQkFBcUIsR0FBRztJQUNwQyxjQUFjLEtBQTRCLE9BQU8sRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLE1BQU0sK0JBQXVCLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDbkcsZ0JBQWdCLENBQUMsVUFBVSxHQUFHLEtBQUssSUFBMkIsT0FBTyxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsTUFBTSxpQ0FBeUIsRUFBRSxVQUFVLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDckksa0JBQWtCLEtBQTRCLE9BQU8sRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLE1BQU0sK0JBQXVCLEVBQUUsTUFBTSxFQUFFLEVBQUUsSUFBSSxxQ0FBNkIsRUFBRSxRQUFRLHFEQUFpQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDak0sb0JBQW9CLENBQUMsVUFBVSxHQUFHLEtBQUssSUFBMkIsT0FBTyxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsTUFBTSxpQ0FBeUIsRUFBRSxNQUFNLEVBQUUsRUFBRSxJQUFJLHFDQUE2QixFQUFFLFFBQVEscURBQWlDLEVBQUUsRUFBRSxVQUFVLEVBQUUsQ0FBQyxDQUFDLENBQUM7Q0FDbk8sQ0FBQztBQU1GLE1BQU0sT0FBTyxTQUFVLFNBQVEsS0FBSztJQUVuQyxZQUFZLElBQVksRUFBRSxPQUFlO1FBQ3hDLEtBQUssQ0FBQyxjQUFjLElBQUksS0FBSyxPQUFPLEVBQUUsQ0FBQyxDQUFDO0lBQ3pDLENBQUM7Q0FDRDtBQUVELE1BQU0sT0FBTyxVQUFVO0lBRXRCLFlBQW9CLEVBQWU7UUFBZixPQUFFLEdBQUYsRUFBRSxDQUFhO1FBRTNCLFNBQUksR0FBRyxJQUFJLE9BQU8sRUFBUSxDQUFDO0lBRkksQ0FBQztJQUl4QyxHQUFHLENBQUMsR0FBTTtRQUNULElBQUksTUFBTSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBRWhDLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNiLE1BQU0sR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ3RCLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxNQUFNLENBQUMsQ0FBQztRQUM1QixDQUFDO1FBRUQsT0FBTyxNQUFNLENBQUM7SUFDZixDQUFDO0NBQ0QifQ==