/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createDecorator } from '../../instantiation/common/instantiation.js';
export var ExtensionGalleryResourceType;
(function (ExtensionGalleryResourceType) {
    ExtensionGalleryResourceType["ExtensionQueryService"] = "ExtensionQueryService";
    ExtensionGalleryResourceType["ExtensionLatestVersionUri"] = "ExtensionLatestVersionUriTemplate";
    ExtensionGalleryResourceType["ExtensionStatisticsUri"] = "ExtensionStatisticsUriTemplate";
    ExtensionGalleryResourceType["PublisherViewUri"] = "PublisherViewUriTemplate";
    ExtensionGalleryResourceType["ExtensionDetailsViewUri"] = "ExtensionDetailsViewUriTemplate";
    ExtensionGalleryResourceType["ExtensionRatingViewUri"] = "ExtensionRatingViewUriTemplate";
    ExtensionGalleryResourceType["ExtensionResourceUri"] = "ExtensionResourceUriTemplate";
    ExtensionGalleryResourceType["ContactSupportUri"] = "ContactSupportUri";
})(ExtensionGalleryResourceType || (ExtensionGalleryResourceType = {}));
export var Flag;
(function (Flag) {
    Flag["None"] = "None";
    Flag["IncludeVersions"] = "IncludeVersions";
    Flag["IncludeFiles"] = "IncludeFiles";
    Flag["IncludeCategoryAndTags"] = "IncludeCategoryAndTags";
    Flag["IncludeSharedAccounts"] = "IncludeSharedAccounts";
    Flag["IncludeVersionProperties"] = "IncludeVersionProperties";
    Flag["ExcludeNonValidated"] = "ExcludeNonValidated";
    Flag["IncludeInstallationTargets"] = "IncludeInstallationTargets";
    Flag["IncludeAssetUri"] = "IncludeAssetUri";
    Flag["IncludeStatistics"] = "IncludeStatistics";
    Flag["IncludeLatestVersionOnly"] = "IncludeLatestVersionOnly";
    Flag["Unpublished"] = "Unpublished";
    Flag["IncludeNameConflictInfo"] = "IncludeNameConflictInfo";
    Flag["IncludeLatestPrereleaseAndStableVersionOnly"] = "IncludeLatestPrereleaseAndStableVersionOnly";
})(Flag || (Flag = {}));
export var ExtensionGalleryManifestStatus;
(function (ExtensionGalleryManifestStatus) {
    ExtensionGalleryManifestStatus["Available"] = "available";
    ExtensionGalleryManifestStatus["RequiresSignIn"] = "requiresSignIn";
    ExtensionGalleryManifestStatus["AccessDenied"] = "accessDenied";
    ExtensionGalleryManifestStatus["Unavailable"] = "unavailable";
})(ExtensionGalleryManifestStatus || (ExtensionGalleryManifestStatus = {}));
export const IExtensionGalleryManifestService = createDecorator('IExtensionGalleryManifestService');
export function getExtensionGalleryManifestResourceUri(manifest, type) {
    const [name, version] = type.split('/');
    for (const resource of manifest.resources) {
        const [r, v] = resource.type.split('/');
        if (r !== name) {
            continue;
        }
        if (!version || v === version) {
            return resource.id;
        }
        break;
    }
    return undefined;
}
export const ExtensionGalleryServiceUrlConfigKey = 'extensions.gallery.serviceUrl';
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUU5RSxNQUFNLENBQU4sSUFBa0IsNEJBU2pCO0FBVEQsV0FBa0IsNEJBQTRCO0lBQzdDLCtFQUErQyxDQUFBO0lBQy9DLCtGQUErRCxDQUFBO0lBQy9ELHlGQUF5RCxDQUFBO0lBQ3pELDZFQUE2QyxDQUFBO0lBQzdDLDJGQUEyRCxDQUFBO0lBQzNELHlGQUF5RCxDQUFBO0lBQ3pELHFGQUFxRCxDQUFBO0lBQ3JELHVFQUF1QyxDQUFBO0FBQ3hDLENBQUMsRUFUaUIsNEJBQTRCLEtBQTVCLDRCQUE0QixRQVM3QztBQUVELE1BQU0sQ0FBTixJQUFrQixJQWVqQjtBQWZELFdBQWtCLElBQUk7SUFDckIscUJBQWEsQ0FBQTtJQUNiLDJDQUFtQyxDQUFBO0lBQ25DLHFDQUE2QixDQUFBO0lBQzdCLHlEQUFpRCxDQUFBO0lBQ2pELHVEQUErQyxDQUFBO0lBQy9DLDZEQUFxRCxDQUFBO0lBQ3JELG1EQUEyQyxDQUFBO0lBQzNDLGlFQUF5RCxDQUFBO0lBQ3pELDJDQUFtQyxDQUFBO0lBQ25DLCtDQUF1QyxDQUFBO0lBQ3ZDLDZEQUFxRCxDQUFBO0lBQ3JELG1DQUEyQixDQUFBO0lBQzNCLDJEQUFtRCxDQUFBO0lBQ25ELG1HQUEyRixDQUFBO0FBQzVGLENBQUMsRUFmaUIsSUFBSSxLQUFKLElBQUksUUFlckI7QUFnQ0QsTUFBTSxDQUFOLElBQWtCLDhCQUtqQjtBQUxELFdBQWtCLDhCQUE4QjtJQUMvQyx5REFBdUIsQ0FBQTtJQUN2QixtRUFBaUMsQ0FBQTtJQUNqQywrREFBNkIsQ0FBQTtJQUM3Qiw2REFBMkIsQ0FBQTtBQUM1QixDQUFDLEVBTGlCLDhCQUE4QixLQUE5Qiw4QkFBOEIsUUFLL0M7QUFFRCxNQUFNLENBQUMsTUFBTSxnQ0FBZ0MsR0FBRyxlQUFlLENBQW1DLGtDQUFrQyxDQUFDLENBQUM7QUFXdEksTUFBTSxVQUFVLHNDQUFzQyxDQUFDLFFBQW1DLEVBQUUsSUFBWTtJQUN2RyxNQUFNLENBQUMsSUFBSSxFQUFFLE9BQU8sQ0FBQyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDeEMsS0FBSyxNQUFNLFFBQVEsSUFBSSxRQUFRLENBQUMsU0FBUyxFQUFFLENBQUM7UUFDM0MsTUFBTSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsR0FBRyxRQUFRLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUN4QyxJQUFJLENBQUMsS0FBSyxJQUFJLEVBQUUsQ0FBQztZQUNoQixTQUFTO1FBQ1YsQ0FBQztRQUNELElBQUksQ0FBQyxPQUFPLElBQUksQ0FBQyxLQUFLLE9BQU8sRUFBRSxDQUFDO1lBQy9CLE9BQU8sUUFBUSxDQUFDLEVBQUUsQ0FBQztRQUNwQixDQUFDO1FBQ0QsTUFBTTtJQUNQLENBQUM7SUFDRCxPQUFPLFNBQVMsQ0FBQztBQUNsQixDQUFDO0FBRUQsTUFBTSxDQUFDLE1BQU0sbUNBQW1DLEdBQUcsK0JBQStCLENBQUMifQ==