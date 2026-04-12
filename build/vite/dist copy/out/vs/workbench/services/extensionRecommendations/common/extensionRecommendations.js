/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
export var ExtensionRecommendationReason;
(function (ExtensionRecommendationReason) {
    ExtensionRecommendationReason[ExtensionRecommendationReason["Workspace"] = 0] = "Workspace";
    ExtensionRecommendationReason[ExtensionRecommendationReason["File"] = 1] = "File";
    ExtensionRecommendationReason[ExtensionRecommendationReason["Executable"] = 2] = "Executable";
    ExtensionRecommendationReason[ExtensionRecommendationReason["WorkspaceConfig"] = 3] = "WorkspaceConfig";
    ExtensionRecommendationReason[ExtensionRecommendationReason["DynamicWorkspace"] = 4] = "DynamicWorkspace";
    ExtensionRecommendationReason[ExtensionRecommendationReason["Experimental"] = 5] = "Experimental";
    ExtensionRecommendationReason[ExtensionRecommendationReason["Application"] = 6] = "Application";
})(ExtensionRecommendationReason || (ExtensionRecommendationReason = {}));
export const IExtensionRecommendationsService = createDecorator('extensionRecommendationsService');
export const IExtensionIgnoredRecommendationsService = createDecorator('IExtensionIgnoredRecommendationsService');
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL2V4dGVuc2lvblJlY29tbWVuZGF0aW9ucy9jb21tb24vZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUs3RixNQUFNLENBQU4sSUFBa0IsNkJBUWpCO0FBUkQsV0FBa0IsNkJBQTZCO0lBQzlDLDJGQUFTLENBQUE7SUFDVCxpRkFBSSxDQUFBO0lBQ0osNkZBQVUsQ0FBQTtJQUNWLHVHQUFlLENBQUE7SUFDZix5R0FBZ0IsQ0FBQTtJQUNoQixpR0FBWSxDQUFBO0lBQ1osK0ZBQVcsQ0FBQTtBQUNaLENBQUMsRUFSaUIsNkJBQTZCLEtBQTdCLDZCQUE2QixRQVE5QztBQU9ELE1BQU0sQ0FBQyxNQUFNLGdDQUFnQyxHQUFHLGVBQWUsQ0FBbUMsaUNBQWlDLENBQUMsQ0FBQztBQXdCckksTUFBTSxDQUFDLE1BQU0sdUNBQXVDLEdBQUcsZUFBZSxDQUEwQyx5Q0FBeUMsQ0FBQyxDQUFDIn0=