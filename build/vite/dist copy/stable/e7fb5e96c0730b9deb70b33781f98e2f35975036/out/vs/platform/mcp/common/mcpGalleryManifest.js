/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createDecorator } from '../../instantiation/common/instantiation.js';
export var McpGalleryResourceType;
(function (McpGalleryResourceType) {
    McpGalleryResourceType["McpServersQueryService"] = "McpServersQueryService";
    McpGalleryResourceType["McpServerWebUri"] = "McpServerWebUriTemplate";
    McpGalleryResourceType["McpServerVersionUri"] = "McpServerVersionUriTemplate";
    McpGalleryResourceType["McpServerIdUri"] = "McpServerIdUriTemplate";
    McpGalleryResourceType["McpServerLatestVersionUri"] = "McpServerLatestVersionUriTemplate";
    McpGalleryResourceType["McpServerNamedResourceUri"] = "McpServerNamedResourceUriTemplate";
    McpGalleryResourceType["PublisherUriTemplate"] = "PublisherUriTemplate";
    McpGalleryResourceType["ContactSupportUri"] = "ContactSupportUri";
    McpGalleryResourceType["PrivacyPolicyUri"] = "PrivacyPolicyUri";
    McpGalleryResourceType["TermsOfServiceUri"] = "TermsOfServiceUri";
    McpGalleryResourceType["ReportUri"] = "ReportUri";
})(McpGalleryResourceType || (McpGalleryResourceType = {}));
export var McpGalleryManifestStatus;
(function (McpGalleryManifestStatus) {
    McpGalleryManifestStatus["Available"] = "available";
    McpGalleryManifestStatus["Unavailable"] = "unavailable";
})(McpGalleryManifestStatus || (McpGalleryManifestStatus = {}));
export const IMcpGalleryManifestService = createDecorator('IMcpGalleryManifestService');
export function getMcpGalleryManifestResourceUri(manifest, type) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwR2FsbGVyeU1hbmlmZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vbWNwL2NvbW1vbi9tY3BHYWxsZXJ5TWFuaWZlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBRTlFLE1BQU0sQ0FBTixJQUFrQixzQkFZakI7QUFaRCxXQUFrQixzQkFBc0I7SUFDdkMsMkVBQWlELENBQUE7SUFDakQscUVBQTJDLENBQUE7SUFDM0MsNkVBQW1ELENBQUE7SUFDbkQsbUVBQXlDLENBQUE7SUFDekMseUZBQStELENBQUE7SUFDL0QseUZBQStELENBQUE7SUFDL0QsdUVBQTZDLENBQUE7SUFDN0MsaUVBQXVDLENBQUE7SUFDdkMsK0RBQXFDLENBQUE7SUFDckMsaUVBQXVDLENBQUE7SUFDdkMsaURBQXVCLENBQUE7QUFDeEIsQ0FBQyxFQVppQixzQkFBc0IsS0FBdEIsc0JBQXNCLFFBWXZDO0FBYUQsTUFBTSxDQUFOLElBQWtCLHdCQUdqQjtBQUhELFdBQWtCLHdCQUF3QjtJQUN6QyxtREFBdUIsQ0FBQTtJQUN2Qix1REFBMkIsQ0FBQTtBQUM1QixDQUFDLEVBSGlCLHdCQUF3QixLQUF4Qix3QkFBd0IsUUFHekM7QUFFRCxNQUFNLENBQUMsTUFBTSwwQkFBMEIsR0FBRyxlQUFlLENBQTZCLDRCQUE0QixDQUFDLENBQUM7QUFXcEgsTUFBTSxVQUFVLGdDQUFnQyxDQUFDLFFBQTZCLEVBQUUsSUFBWTtJQUMzRixNQUFNLENBQUMsSUFBSSxFQUFFLE9BQU8sQ0FBQyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDeEMsS0FBSyxNQUFNLFFBQVEsSUFBSSxRQUFRLENBQUMsU0FBUyxFQUFFLENBQUM7UUFDM0MsTUFBTSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsR0FBRyxRQUFRLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUN4QyxJQUFJLENBQUMsS0FBSyxJQUFJLEVBQUUsQ0FBQztZQUNoQixTQUFTO1FBQ1YsQ0FBQztRQUNELElBQUksQ0FBQyxPQUFPLElBQUksQ0FBQyxLQUFLLE9BQU8sRUFBRSxDQUFDO1lBQy9CLE9BQU8sUUFBUSxDQUFDLEVBQUUsQ0FBQztRQUNwQixDQUFDO1FBQ0QsTUFBTTtJQUNQLENBQUM7SUFDRCxPQUFPLFNBQVMsQ0FBQztBQUNsQixDQUFDIn0=