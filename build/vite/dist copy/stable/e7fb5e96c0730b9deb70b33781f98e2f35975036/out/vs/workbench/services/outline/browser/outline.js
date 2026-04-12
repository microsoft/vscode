/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
export const IOutlineService = createDecorator('IOutlineService');
export var OutlineTarget;
(function (OutlineTarget) {
    OutlineTarget[OutlineTarget["OutlinePane"] = 1] = "OutlinePane";
    OutlineTarget[OutlineTarget["Breadcrumbs"] = 2] = "Breadcrumbs";
    OutlineTarget[OutlineTarget["QuickPick"] = 4] = "QuickPick";
})(OutlineTarget || (OutlineTarget = {}));
export var OutlineConfigKeys;
(function (OutlineConfigKeys) {
    OutlineConfigKeys["icons"] = "outline.icons";
    OutlineConfigKeys["collapseItems"] = "outline.collapseItems";
    OutlineConfigKeys["problemsEnabled"] = "outline.problems.enabled";
    OutlineConfigKeys["problemsColors"] = "outline.problems.colors";
    OutlineConfigKeys["problemsBadges"] = "outline.problems.badges";
})(OutlineConfigKeys || (OutlineConfigKeys = {}));
export var OutlineConfigCollapseItemsValues;
(function (OutlineConfigCollapseItemsValues) {
    OutlineConfigCollapseItemsValues["Collapsed"] = "alwaysCollapse";
    OutlineConfigCollapseItemsValues["Expanded"] = "alwaysExpand";
})(OutlineConfigCollapseItemsValues || (OutlineConfigCollapseItemsValues = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3V0bGluZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9vdXRsaW5lL2Jyb3dzZXIvb3V0bGluZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQVVoRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNERBQTRELENBQUM7QUFJN0YsTUFBTSxDQUFDLE1BQU0sZUFBZSxHQUFHLGVBQWUsQ0FBa0IsaUJBQWlCLENBQUMsQ0FBQztBQUVuRixNQUFNLENBQU4sSUFBa0IsYUFJakI7QUFKRCxXQUFrQixhQUFhO0lBQzlCLCtEQUFlLENBQUE7SUFDZiwrREFBZSxDQUFBO0lBQ2YsMkRBQWEsQ0FBQTtBQUNkLENBQUMsRUFKaUIsYUFBYSxLQUFiLGFBQWEsUUFJOUI7QUEwRUQsTUFBTSxDQUFOLElBQWtCLGlCQU1qQjtBQU5ELFdBQWtCLGlCQUFpQjtJQUNsQyw0Q0FBeUIsQ0FBQTtJQUN6Qiw0REFBeUMsQ0FBQTtJQUN6QyxpRUFBOEMsQ0FBQTtJQUM5QywrREFBNEMsQ0FBQTtJQUM1QywrREFBNEMsQ0FBQTtBQUM3QyxDQUFDLEVBTmlCLGlCQUFpQixLQUFqQixpQkFBaUIsUUFNbEM7QUFFRCxNQUFNLENBQU4sSUFBa0IsZ0NBR2pCO0FBSEQsV0FBa0IsZ0NBQWdDO0lBQ2pELGdFQUE0QixDQUFBO0lBQzVCLDZEQUF5QixDQUFBO0FBQzFCLENBQUMsRUFIaUIsZ0NBQWdDLEtBQWhDLGdDQUFnQyxRQUdqRCJ9