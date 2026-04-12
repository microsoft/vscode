/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createDecorator } from '../../instantiation/common/instantiation.js';
export var RecommendationSource;
(function (RecommendationSource) {
    RecommendationSource[RecommendationSource["FILE"] = 1] = "FILE";
    RecommendationSource[RecommendationSource["WORKSPACE"] = 2] = "WORKSPACE";
    RecommendationSource[RecommendationSource["EXE"] = 3] = "EXE";
})(RecommendationSource || (RecommendationSource = {}));
export function RecommendationSourceToString(source) {
    switch (source) {
        case 1 /* RecommendationSource.FILE */: return 'file';
        case 2 /* RecommendationSource.WORKSPACE */: return 'workspace';
        case 3 /* RecommendationSource.EXE */: return 'exe';
    }
}
export var RecommendationsNotificationResult;
(function (RecommendationsNotificationResult) {
    RecommendationsNotificationResult["Ignored"] = "ignored";
    RecommendationsNotificationResult["Cancelled"] = "cancelled";
    RecommendationsNotificationResult["TooMany"] = "toomany";
    RecommendationsNotificationResult["IncompatibleWindow"] = "incompatibleWindow";
    RecommendationsNotificationResult["Accepted"] = "reacted";
})(RecommendationsNotificationResult || (RecommendationsNotificationResult = {}));
export const IExtensionRecommendationNotificationService = createDecorator('IExtensionRecommendationNotificationService');
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zL2NvbW1vbi9leHRlbnNpb25SZWNvbW1lbmRhdGlvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBRTlFLE1BQU0sQ0FBTixJQUFrQixvQkFJakI7QUFKRCxXQUFrQixvQkFBb0I7SUFDckMsK0RBQVEsQ0FBQTtJQUNSLHlFQUFhLENBQUE7SUFDYiw2REFBTyxDQUFBO0FBQ1IsQ0FBQyxFQUppQixvQkFBb0IsS0FBcEIsb0JBQW9CLFFBSXJDO0FBU0QsTUFBTSxVQUFVLDRCQUE0QixDQUFDLE1BQTRCO0lBQ3hFLFFBQVEsTUFBTSxFQUFFLENBQUM7UUFDaEIsc0NBQThCLENBQUMsQ0FBQyxPQUFPLE1BQU0sQ0FBQztRQUM5QywyQ0FBbUMsQ0FBQyxDQUFDLE9BQU8sV0FBVyxDQUFDO1FBQ3hELHFDQUE2QixDQUFDLENBQUMsT0FBTyxLQUFLLENBQUM7SUFDN0MsQ0FBQztBQUNGLENBQUM7QUFFRCxNQUFNLENBQU4sSUFBa0IsaUNBTWpCO0FBTkQsV0FBa0IsaUNBQWlDO0lBQ2xELHdEQUFtQixDQUFBO0lBQ25CLDREQUF1QixDQUFBO0lBQ3ZCLHdEQUFtQixDQUFBO0lBQ25CLDhFQUF5QyxDQUFBO0lBQ3pDLHlEQUFvQixDQUFBO0FBQ3JCLENBQUMsRUFOaUIsaUNBQWlDLEtBQWpDLGlDQUFpQyxRQU1sRDtBQUVELE1BQU0sQ0FBQyxNQUFNLDJDQUEyQyxHQUFHLGVBQWUsQ0FBOEMsNkNBQTZDLENBQUMsQ0FBQyJ9