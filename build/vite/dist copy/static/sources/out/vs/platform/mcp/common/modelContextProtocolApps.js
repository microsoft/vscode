/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable local/code-no-unexternalized-strings */
/**
 * Schema updated from the Model Context Protocol Apps repository at
 * https://github.com/modelcontextprotocol/ext-apps/blob/main/src/spec.types.ts
 *
 * ⚠️ Do not edit within `namespace` manually except to update schema versions ⚠️
 */
export var McpApps;
(function (McpApps) {
    /**
     * Current protocol version supported by this SDK.
     *
     * The SDK automatically handles version negotiation during initialization.
     * Apps and hosts don't need to manage protocol versions manually.
     */
    McpApps.LATEST_PROTOCOL_VERSION = "2026-01-26";
    /**
     * Method string constants for MCP Apps protocol messages.
     *
     * These constants provide a type-safe way to check message methods without
     * accessing internal Zod schema properties. External libraries should use
     * these constants instead of accessing `schema.shape.method._def.values[0]`.
     *
     * @example
     * ```typescript
     * import { SANDBOX_PROXY_READY_METHOD } from '@modelcontextprotocol/ext-apps';
     *
     * if (event.data.method === SANDBOX_PROXY_READY_METHOD) {
     *   // Handle sandbox proxy ready notification
     * }
     * ```
     */
    McpApps.OPEN_LINK_METHOD = "ui/open-link";
    McpApps.MESSAGE_METHOD = "ui/message";
    McpApps.SANDBOX_PROXY_READY_METHOD = "ui/notifications/sandbox-proxy-ready";
    McpApps.SANDBOX_RESOURCE_READY_METHOD = "ui/notifications/sandbox-resource-ready";
    McpApps.SIZE_CHANGED_METHOD = "ui/notifications/size-changed";
    McpApps.TOOL_INPUT_METHOD = "ui/notifications/tool-input";
    McpApps.TOOL_INPUT_PARTIAL_METHOD = "ui/notifications/tool-input-partial";
    McpApps.TOOL_RESULT_METHOD = "ui/notifications/tool-result";
    McpApps.TOOL_CANCELLED_METHOD = "ui/notifications/tool-cancelled";
    McpApps.HOST_CONTEXT_CHANGED_METHOD = "ui/notifications/host-context-changed";
    McpApps.RESOURCE_TEARDOWN_METHOD = "ui/resource-teardown";
    McpApps.INITIALIZE_METHOD = "ui/initialize";
    McpApps.INITIALIZED_METHOD = "ui/notifications/initialized";
    McpApps.REQUEST_DISPLAY_MODE_METHOD = "ui/request-display-mode";
    McpApps.UPDATE_MODEL_CONTEXT_METHOD = "ui/update-model-context";
    McpApps.DOWNLOAD_FILE_METHOD = "ui/download-file";
})(McpApps || (McpApps = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9kZWxDb250ZXh0UHJvdG9jb2xBcHBzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vbWNwL2NvbW1vbi9tb2RlbENvbnRleHRQcm90b2NvbEFwcHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFnRWhHLHlEQUF5RDtBQUd6RDs7Ozs7R0FLRztBQUNILE1BQU0sS0FBVyxPQUFPLENBcXJCdkI7QUFyckJELFdBQWlCLE9BQU87SUFDdkI7Ozs7O09BS0c7SUFDVSwrQkFBdUIsR0FBRyxZQUFZLENBQUM7SUFnb0JwRDs7Ozs7Ozs7Ozs7Ozs7O09BZUc7SUFDVSx3QkFBZ0IsR0FBbUMsY0FBYyxDQUFDO0lBQ2xFLHNCQUFjLEdBQWtDLFlBQVksQ0FBQztJQUM3RCxrQ0FBMEIsR0FDdEMsc0NBQXNDLENBQUM7SUFDM0IscUNBQTZCLEdBQ3pDLHlDQUF5QyxDQUFDO0lBQzlCLDJCQUFtQixHQUMvQiwrQkFBK0IsQ0FBQztJQUNwQix5QkFBaUIsR0FDN0IsNkJBQTZCLENBQUM7SUFDbEIsaUNBQXlCLEdBQ3JDLHFDQUFxQyxDQUFDO0lBQzFCLDBCQUFrQixHQUM5Qiw4QkFBOEIsQ0FBQztJQUNuQiw2QkFBcUIsR0FDakMsaUNBQWlDLENBQUM7SUFDdEIsbUNBQTJCLEdBQ3ZDLHVDQUF1QyxDQUFDO0lBQzVCLGdDQUF3QixHQUNwQyxzQkFBc0IsQ0FBQztJQUNYLHlCQUFpQixHQUM3QixlQUFlLENBQUM7SUFDSiwwQkFBa0IsR0FDOUIsOEJBQThCLENBQUM7SUFDbkIsbUNBQTJCLEdBQ3ZDLHlCQUF5QixDQUFDO0lBQ2QsbUNBQTJCLEdBQ3ZDLHlCQUF5QixDQUFDO0lBQ2QsNEJBQW9CLEdBQ2hDLGtCQUFrQixDQUFDO0FBQ3JCLENBQUMsRUFyckJnQixPQUFPLEtBQVAsT0FBTyxRQXFyQnZCIn0=