/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createDecorator } from '../../instantiation/common/instantiation.js';
export var RegistryType;
(function (RegistryType) {
    RegistryType["NODE"] = "npm";
    RegistryType["PYTHON"] = "pypi";
    RegistryType["DOCKER"] = "oci";
    RegistryType["NUGET"] = "nuget";
    RegistryType["MCPB"] = "mcpb";
    RegistryType["REMOTE"] = "remote";
})(RegistryType || (RegistryType = {}));
export var TransportType;
(function (TransportType) {
    TransportType["STDIO"] = "stdio";
    TransportType["STREAMABLE_HTTP"] = "streamable-http";
    TransportType["SSE"] = "sse";
})(TransportType || (TransportType = {}));
export var GalleryMcpServerStatus;
(function (GalleryMcpServerStatus) {
    GalleryMcpServerStatus["Active"] = "active";
    GalleryMcpServerStatus["Deprecated"] = "deprecated";
})(GalleryMcpServerStatus || (GalleryMcpServerStatus = {}));
export const IMcpGalleryService = createDecorator('IMcpGalleryService');
export const IMcpManagementService = createDecorator('IMcpManagementService');
export const IAllowedMcpServersService = createDecorator('IAllowedMcpServersService');
export const mcpAccessConfig = 'chat.mcp.access';
export const mcpGalleryServiceUrlConfig = 'chat.mcp.gallery.serviceUrl';
export const mcpGalleryServiceEnablementConfig = 'chat.mcp.gallery.enabled';
export const mcpAutoStartConfig = 'chat.mcp.autostart';
export const mcpAppsEnabledConfig = 'chat.mcp.apps.enabled';
export var McpAutoStartValue;
(function (McpAutoStartValue) {
    McpAutoStartValue["Never"] = "never";
    McpAutoStartValue["OnlyNew"] = "onlyNew";
    McpAutoStartValue["NewAndOutdated"] = "newAndOutdated";
})(McpAutoStartValue || (McpAutoStartValue = {}));
export var McpAccessValue;
(function (McpAccessValue) {
    McpAccessValue["None"] = "none";
    McpAccessValue["Registry"] = "registry";
    McpAccessValue["All"] = "all";
})(McpAccessValue || (McpAccessValue = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwTWFuYWdlbWVudC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL21jcC9jb21tb24vbWNwTWFuYWdlbWVudC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQVFoRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUE4RDlFLE1BQU0sQ0FBTixJQUFrQixZQU9qQjtBQVBELFdBQWtCLFlBQVk7SUFDN0IsNEJBQVksQ0FBQTtJQUNaLCtCQUFlLENBQUE7SUFDZiw4QkFBYyxDQUFBO0lBQ2QsK0JBQWUsQ0FBQTtJQUNmLDZCQUFhLENBQUE7SUFDYixpQ0FBaUIsQ0FBQTtBQUNsQixDQUFDLEVBUGlCLFlBQVksS0FBWixZQUFZLFFBTzdCO0FBRUQsTUFBTSxDQUFOLElBQWtCLGFBSWpCO0FBSkQsV0FBa0IsYUFBYTtJQUM5QixnQ0FBZSxDQUFBO0lBQ2Ysb0RBQW1DLENBQUE7SUFDbkMsNEJBQVcsQ0FBQTtBQUNaLENBQUMsRUFKaUIsYUFBYSxLQUFiLGFBQWEsUUFJOUI7QUFzQ0QsTUFBTSxDQUFOLElBQWtCLHNCQUdqQjtBQUhELFdBQWtCLHNCQUFzQjtJQUN2QywyQ0FBaUIsQ0FBQTtJQUNqQixtREFBeUIsQ0FBQTtBQUMxQixDQUFDLEVBSGlCLHNCQUFzQixLQUF0QixzQkFBc0IsUUFHdkM7QUF1Q0QsTUFBTSxDQUFDLE1BQU0sa0JBQWtCLEdBQUcsZUFBZSxDQUFxQixvQkFBb0IsQ0FBQyxDQUFDO0FBd0Q1RixNQUFNLENBQUMsTUFBTSxxQkFBcUIsR0FBRyxlQUFlLENBQXdCLHVCQUF1QixDQUFDLENBQUM7QUFrQnJHLE1BQU0sQ0FBQyxNQUFNLHlCQUF5QixHQUFHLGVBQWUsQ0FBNEIsMkJBQTJCLENBQUMsQ0FBQztBQVFqSCxNQUFNLENBQUMsTUFBTSxlQUFlLEdBQUcsaUJBQWlCLENBQUM7QUFDakQsTUFBTSxDQUFDLE1BQU0sMEJBQTBCLEdBQUcsNkJBQTZCLENBQUM7QUFDeEUsTUFBTSxDQUFDLE1BQU0saUNBQWlDLEdBQUcsMEJBQTBCLENBQUM7QUFDNUUsTUFBTSxDQUFDLE1BQU0sa0JBQWtCLEdBQUcsb0JBQW9CLENBQUM7QUFDdkQsTUFBTSxDQUFDLE1BQU0sb0JBQW9CLEdBQUcsdUJBQXVCLENBQUM7QUFRNUQsTUFBTSxDQUFOLElBQWtCLGlCQUlqQjtBQUpELFdBQWtCLGlCQUFpQjtJQUNsQyxvQ0FBZSxDQUFBO0lBQ2Ysd0NBQW1CLENBQUE7SUFDbkIsc0RBQWlDLENBQUE7QUFDbEMsQ0FBQyxFQUppQixpQkFBaUIsS0FBakIsaUJBQWlCLFFBSWxDO0FBRUQsTUFBTSxDQUFOLElBQWtCLGNBSWpCO0FBSkQsV0FBa0IsY0FBYztJQUMvQiwrQkFBYSxDQUFBO0lBQ2IsdUNBQXFCLENBQUE7SUFDckIsNkJBQVcsQ0FBQTtBQUNaLENBQUMsRUFKaUIsY0FBYyxLQUFkLGNBQWMsUUFJL0IifQ==