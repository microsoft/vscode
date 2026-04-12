/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export const NotSelectableGroupId = 'notSelectable';
export var ListDragOverEffectType;
(function (ListDragOverEffectType) {
    ListDragOverEffectType[ListDragOverEffectType["Copy"] = 0] = "Copy";
    ListDragOverEffectType[ListDragOverEffectType["Move"] = 1] = "Move";
})(ListDragOverEffectType || (ListDragOverEffectType = {}));
export var ListDragOverEffectPosition;
(function (ListDragOverEffectPosition) {
    ListDragOverEffectPosition["Over"] = "drop-target";
    ListDragOverEffectPosition["Before"] = "drop-target-before";
    ListDragOverEffectPosition["After"] = "drop-target-after";
})(ListDragOverEffectPosition || (ListDragOverEffectPosition = {}));
export const ListDragOverReactions = {
    reject() { return { accept: false }; },
    accept() { return { accept: true }; },
};
export class ListError extends Error {
    constructor(user, message) {
        super(`ListError [${user}] ${message}`);
    }
}
export class CachedListVirtualDelegate {
    constructor() {
        this.cache = new WeakMap();
    }
    getHeight(element) {
        return this.cache.get(element) ?? this.estimateHeight(element);
    }
    setDynamicHeight(element, height) {
        if (height > 0) {
            this.cache.set(element, height);
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGlzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUF3RWhHLE1BQU0sQ0FBQyxNQUFNLG9CQUFvQixHQUFHLGVBQWUsQ0FBQztBQXNCcEQsTUFBTSxDQUFOLElBQWtCLHNCQUdqQjtBQUhELFdBQWtCLHNCQUFzQjtJQUN2QyxtRUFBSSxDQUFBO0lBQ0osbUVBQUksQ0FBQTtBQUNMLENBQUMsRUFIaUIsc0JBQXNCLEtBQXRCLHNCQUFzQixRQUd2QztBQUVELE1BQU0sQ0FBTixJQUFrQiwwQkFJakI7QUFKRCxXQUFrQiwwQkFBMEI7SUFDM0Msa0RBQW9CLENBQUE7SUFDcEIsMkRBQTZCLENBQUE7SUFDN0IseURBQTJCLENBQUE7QUFDNUIsQ0FBQyxFQUppQiwwQkFBMEIsS0FBMUIsMEJBQTBCLFFBSTNDO0FBYUQsTUFBTSxDQUFDLE1BQU0scUJBQXFCLEdBQUc7SUFDcEMsTUFBTSxLQUE0QixPQUFPLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztJQUM3RCxNQUFNLEtBQTRCLE9BQU8sRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDO0NBQzVELENBQUM7QUFnQkYsTUFBTSxPQUFPLFNBQVUsU0FBUSxLQUFLO0lBRW5DLFlBQVksSUFBWSxFQUFFLE9BQWU7UUFDeEMsS0FBSyxDQUFDLGNBQWMsSUFBSSxLQUFLLE9BQU8sRUFBRSxDQUFDLENBQUM7SUFDekMsQ0FBQztDQUNEO0FBRUQsTUFBTSxPQUFnQix5QkFBeUI7SUFBL0M7UUFFUyxVQUFLLEdBQUcsSUFBSSxPQUFPLEVBQWEsQ0FBQztJQWMxQyxDQUFDO0lBWkEsU0FBUyxDQUFDLE9BQVU7UUFDbkIsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsSUFBSSxJQUFJLENBQUMsY0FBYyxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQ2hFLENBQUM7SUFLRCxnQkFBZ0IsQ0FBQyxPQUFVLEVBQUUsTUFBYztRQUMxQyxJQUFJLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUNoQixJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxPQUFPLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFDakMsQ0FBQztJQUNGLENBQUM7Q0FDRCJ9