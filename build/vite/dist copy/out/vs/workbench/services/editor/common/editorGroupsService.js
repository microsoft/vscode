/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { isEditorInput } from '../../../common/editor.js';
export const IEditorGroupsService = createDecorator('editorGroupsService');
export var GroupActivationReason;
(function (GroupActivationReason) {
    /**
     * Group was activated explicitly by user or programmatic action.
     */
    GroupActivationReason[GroupActivationReason["DEFAULT"] = 0] = "DEFAULT";
    /**
     * Group was activated because a modal or auxiliary editor part was closing.
     */
    GroupActivationReason[GroupActivationReason["PART_CLOSE"] = 1] = "PART_CLOSE";
})(GroupActivationReason || (GroupActivationReason = {}));
export var GroupDirection;
(function (GroupDirection) {
    GroupDirection[GroupDirection["UP"] = 0] = "UP";
    GroupDirection[GroupDirection["DOWN"] = 1] = "DOWN";
    GroupDirection[GroupDirection["LEFT"] = 2] = "LEFT";
    GroupDirection[GroupDirection["RIGHT"] = 3] = "RIGHT";
})(GroupDirection || (GroupDirection = {}));
export var GroupOrientation;
(function (GroupOrientation) {
    GroupOrientation[GroupOrientation["HORIZONTAL"] = 0] = "HORIZONTAL";
    GroupOrientation[GroupOrientation["VERTICAL"] = 1] = "VERTICAL";
})(GroupOrientation || (GroupOrientation = {}));
export var GroupLocation;
(function (GroupLocation) {
    GroupLocation[GroupLocation["FIRST"] = 0] = "FIRST";
    GroupLocation[GroupLocation["LAST"] = 1] = "LAST";
    GroupLocation[GroupLocation["NEXT"] = 2] = "NEXT";
    GroupLocation[GroupLocation["PREVIOUS"] = 3] = "PREVIOUS";
})(GroupLocation || (GroupLocation = {}));
export var GroupsArrangement;
(function (GroupsArrangement) {
    /**
     * Make the current active group consume the entire
     * editor area.
     */
    GroupsArrangement[GroupsArrangement["MAXIMIZE"] = 0] = "MAXIMIZE";
    /**
     * Make the current active group consume the maximum
     * amount of space possible.
     */
    GroupsArrangement[GroupsArrangement["EXPAND"] = 1] = "EXPAND";
    /**
     * Size all groups evenly.
     */
    GroupsArrangement[GroupsArrangement["EVEN"] = 2] = "EVEN";
})(GroupsArrangement || (GroupsArrangement = {}));
export var MergeGroupMode;
(function (MergeGroupMode) {
    MergeGroupMode[MergeGroupMode["COPY_EDITORS"] = 0] = "COPY_EDITORS";
    MergeGroupMode[MergeGroupMode["MOVE_EDITORS"] = 1] = "MOVE_EDITORS";
})(MergeGroupMode || (MergeGroupMode = {}));
export function isEditorReplacement(replacement) {
    const candidate = replacement;
    return isEditorInput(candidate?.editor) && isEditorInput(candidate?.replacement);
}
export var GroupsOrder;
(function (GroupsOrder) {
    /**
     * Groups sorted by creation order (oldest one first)
     */
    GroupsOrder[GroupsOrder["CREATION_TIME"] = 0] = "CREATION_TIME";
    /**
     * Groups sorted by most recent activity (most recent active first)
     */
    GroupsOrder[GroupsOrder["MOST_RECENTLY_ACTIVE"] = 1] = "MOST_RECENTLY_ACTIVE";
    /**
     * Groups sorted by grid widget order
     */
    GroupsOrder[GroupsOrder["GRID_APPEARANCE"] = 2] = "GRID_APPEARANCE";
})(GroupsOrder || (GroupsOrder = {}));
export var OpenEditorContext;
(function (OpenEditorContext) {
    OpenEditorContext[OpenEditorContext["NEW_EDITOR"] = 1] = "NEW_EDITOR";
    OpenEditorContext[OpenEditorContext["MOVE_EDITOR"] = 2] = "MOVE_EDITOR";
    OpenEditorContext[OpenEditorContext["COPY_EDITOR"] = 3] = "COPY_EDITOR";
})(OpenEditorContext || (OpenEditorContext = {}));
export function isEditorGroup(obj) {
    const group = obj;
    return !!group && typeof group.id === 'number' && Array.isArray(group.editors);
}
//#region Editor Group Helpers
export function preferredSideBySideGroupDirection(configurationService) {
    const openSideBySideDirection = configurationService.getValue('workbench.editor.openSideBySideDirection');
    if (openSideBySideDirection === 'down') {
        return 1 /* GroupDirection.DOWN */;
    }
    return 3 /* GroupDirection.RIGHT */;
}
//#endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9yR3JvdXBzU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUF5QixlQUFlLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNwSCxPQUFPLEVBQXFNLGFBQWEsRUFBNEcsTUFBTSwyQkFBMkIsQ0FBQztBQWF2VyxNQUFNLENBQUMsTUFBTSxvQkFBb0IsR0FBRyxlQUFlLENBQXVCLHFCQUFxQixDQUFDLENBQUM7QUFFakcsTUFBTSxDQUFOLElBQWtCLHFCQVdqQjtBQVhELFdBQWtCLHFCQUFxQjtJQUV0Qzs7T0FFRztJQUNILHVFQUFXLENBQUE7SUFFWDs7T0FFRztJQUNILDZFQUFjLENBQUE7QUFDZixDQUFDLEVBWGlCLHFCQUFxQixLQUFyQixxQkFBcUIsUUFXdEM7QUFPRCxNQUFNLENBQU4sSUFBa0IsY0FLakI7QUFMRCxXQUFrQixjQUFjO0lBQy9CLCtDQUFFLENBQUE7SUFDRixtREFBSSxDQUFBO0lBQ0osbURBQUksQ0FBQTtJQUNKLHFEQUFLLENBQUE7QUFDTixDQUFDLEVBTGlCLGNBQWMsS0FBZCxjQUFjLFFBSy9CO0FBRUQsTUFBTSxDQUFOLElBQWtCLGdCQUdqQjtBQUhELFdBQWtCLGdCQUFnQjtJQUNqQyxtRUFBVSxDQUFBO0lBQ1YsK0RBQVEsQ0FBQTtBQUNULENBQUMsRUFIaUIsZ0JBQWdCLEtBQWhCLGdCQUFnQixRQUdqQztBQUVELE1BQU0sQ0FBTixJQUFrQixhQUtqQjtBQUxELFdBQWtCLGFBQWE7SUFDOUIsbURBQUssQ0FBQTtJQUNMLGlEQUFJLENBQUE7SUFDSixpREFBSSxDQUFBO0lBQ0oseURBQVEsQ0FBQTtBQUNULENBQUMsRUFMaUIsYUFBYSxLQUFiLGFBQWEsUUFLOUI7QUFPRCxNQUFNLENBQU4sSUFBa0IsaUJBaUJqQjtBQWpCRCxXQUFrQixpQkFBaUI7SUFDbEM7OztPQUdHO0lBQ0gsaUVBQVEsQ0FBQTtJQUVSOzs7T0FHRztJQUNILDZEQUFNLENBQUE7SUFFTjs7T0FFRztJQUNILHlEQUFJLENBQUE7QUFDTCxDQUFDLEVBakJpQixpQkFBaUIsS0FBakIsaUJBQWlCLFFBaUJsQztBQWdDRCxNQUFNLENBQU4sSUFBa0IsY0FHakI7QUFIRCxXQUFrQixjQUFjO0lBQy9CLG1FQUFZLENBQUE7SUFDWixtRUFBWSxDQUFBO0FBQ2IsQ0FBQyxFQUhpQixjQUFjLEtBQWQsY0FBYyxRQUcvQjtBQTBDRCxNQUFNLFVBQVUsbUJBQW1CLENBQUMsV0FBb0I7SUFDdkQsTUFBTSxTQUFTLEdBQUcsV0FBNkMsQ0FBQztJQUVoRSxPQUFPLGFBQWEsQ0FBQyxTQUFTLEVBQUUsTUFBTSxDQUFDLElBQUksYUFBYSxDQUFDLFNBQVMsRUFBRSxXQUFXLENBQUMsQ0FBQztBQUNsRixDQUFDO0FBRUQsTUFBTSxDQUFOLElBQWtCLFdBZ0JqQjtBQWhCRCxXQUFrQixXQUFXO0lBRTVCOztPQUVHO0lBQ0gsK0RBQWEsQ0FBQTtJQUViOztPQUVHO0lBQ0gsNkVBQW9CLENBQUE7SUFFcEI7O09BRUc7SUFDSCxtRUFBZSxDQUFBO0FBQ2hCLENBQUMsRUFoQmlCLFdBQVcsS0FBWCxXQUFXLFFBZ0I1QjtBQWlpQkQsTUFBTSxDQUFOLElBQWtCLGlCQUlqQjtBQUpELFdBQWtCLGlCQUFpQjtJQUNsQyxxRUFBYyxDQUFBO0lBQ2QsdUVBQWUsQ0FBQTtJQUNmLHVFQUFlLENBQUE7QUFDaEIsQ0FBQyxFQUppQixpQkFBaUIsS0FBakIsaUJBQWlCLFFBSWxDO0FBdVZELE1BQU0sVUFBVSxhQUFhLENBQUMsR0FBWTtJQUN6QyxNQUFNLEtBQUssR0FBRyxHQUErQixDQUFDO0lBRTlDLE9BQU8sQ0FBQyxDQUFDLEtBQUssSUFBSSxPQUFPLEtBQUssQ0FBQyxFQUFFLEtBQUssUUFBUSxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDO0FBQ2hGLENBQUM7QUFFRCw4QkFBOEI7QUFFOUIsTUFBTSxVQUFVLGlDQUFpQyxDQUFDLG9CQUEyQztJQUM1RixNQUFNLHVCQUF1QixHQUFHLG9CQUFvQixDQUFDLFFBQVEsQ0FBQywwQ0FBMEMsQ0FBQyxDQUFDO0lBRTFHLElBQUksdUJBQXVCLEtBQUssTUFBTSxFQUFFLENBQUM7UUFDeEMsbUNBQTJCO0lBQzVCLENBQUM7SUFFRCxvQ0FBNEI7QUFDN0IsQ0FBQztBQUVELFlBQVkifQ==