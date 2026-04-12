/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
export const IHistoryService = createDecorator('historyService');
/**
 * Limit editor navigation to certain kinds.
 */
export var GoFilter;
(function (GoFilter) {
    /**
     * Navigate between editor navigation history
     * entries from any kind of navigation source.
     */
    GoFilter[GoFilter["NONE"] = 0] = "NONE";
    /**
     * Only navigate between editor navigation history
     * entries that were resulting from edits.
     */
    GoFilter[GoFilter["EDITS"] = 1] = "EDITS";
    /**
     * Only navigate between editor navigation history
     * entries that were resulting from navigations, such
     * as "Go to definition".
     */
    GoFilter[GoFilter["NAVIGATION"] = 2] = "NAVIGATION";
})(GoFilter || (GoFilter = {}));
/**
 * Limit editor navigation to certain scopes.
 */
export var GoScope;
(function (GoScope) {
    /**
     * Navigate across all editors and editor groups.
     */
    GoScope[GoScope["DEFAULT"] = 0] = "DEFAULT";
    /**
     * Navigate only in editors of the active editor group.
     */
    GoScope[GoScope["EDITOR_GROUP"] = 1] = "EDITOR_GROUP";
    /**
     * Navigate only in the active editor.
     */
    GoScope[GoScope["EDITOR"] = 2] = "EDITOR";
})(GoScope || (GoScope = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaGlzdG9yeS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9oaXN0b3J5L2NvbW1vbi9oaXN0b3J5LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQU03RixNQUFNLENBQUMsTUFBTSxlQUFlLEdBQUcsZUFBZSxDQUFrQixnQkFBZ0IsQ0FBQyxDQUFDO0FBRWxGOztHQUVHO0FBQ0gsTUFBTSxDQUFOLElBQWtCLFFBb0JqQjtBQXBCRCxXQUFrQixRQUFRO0lBRXpCOzs7T0FHRztJQUNILHVDQUFJLENBQUE7SUFFSjs7O09BR0c7SUFDSCx5Q0FBSyxDQUFBO0lBRUw7Ozs7T0FJRztJQUNILG1EQUFVLENBQUE7QUFDWCxDQUFDLEVBcEJpQixRQUFRLEtBQVIsUUFBUSxRQW9CekI7QUFFRDs7R0FFRztBQUNILE1BQU0sQ0FBTixJQUFrQixPQWdCakI7QUFoQkQsV0FBa0IsT0FBTztJQUV4Qjs7T0FFRztJQUNILDJDQUFPLENBQUE7SUFFUDs7T0FFRztJQUNILHFEQUFZLENBQUE7SUFFWjs7T0FFRztJQUNILHlDQUFNLENBQUE7QUFDUCxDQUFDLEVBaEJpQixPQUFPLEtBQVAsT0FBTyxRQWdCeEIifQ==