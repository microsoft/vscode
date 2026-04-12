/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// ─── Client-Dispatchable Map ─────────────────────────────────────────────────
/**
 * Exhaustive map indicating which action types may be dispatched by clients.
 * Adding a new action to IStateAction without adding it here is a compile error.
 */
export const IS_CLIENT_DISPATCHABLE = {
    ["root/agentsChanged" /* ActionType.RootAgentsChanged */]: false,
    ["root/activeSessionsChanged" /* ActionType.RootActiveSessionsChanged */]: false,
    ["session/ready" /* ActionType.SessionReady */]: false,
    ["session/creationFailed" /* ActionType.SessionCreationFailed */]: false,
    ["session/turnStarted" /* ActionType.SessionTurnStarted */]: true,
    ["session/delta" /* ActionType.SessionDelta */]: false,
    ["session/responsePart" /* ActionType.SessionResponsePart */]: false,
    ["session/toolCallStart" /* ActionType.SessionToolCallStart */]: false,
    ["session/toolCallDelta" /* ActionType.SessionToolCallDelta */]: false,
    ["session/toolCallReady" /* ActionType.SessionToolCallReady */]: false,
    ["session/toolCallConfirmed" /* ActionType.SessionToolCallConfirmed */]: true,
    ["session/toolCallComplete" /* ActionType.SessionToolCallComplete */]: true,
    ["session/toolCallResultConfirmed" /* ActionType.SessionToolCallResultConfirmed */]: true,
    ["session/turnComplete" /* ActionType.SessionTurnComplete */]: false,
    ["session/turnCancelled" /* ActionType.SessionTurnCancelled */]: true,
    ["session/error" /* ActionType.SessionError */]: false,
    ["session/titleChanged" /* ActionType.SessionTitleChanged */]: true,
    ["session/usage" /* ActionType.SessionUsage */]: false,
    ["session/reasoning" /* ActionType.SessionReasoning */]: false,
    ["session/modelChanged" /* ActionType.SessionModelChanged */]: true,
    ["session/serverToolsChanged" /* ActionType.SessionServerToolsChanged */]: false,
    ["session/activeClientChanged" /* ActionType.SessionActiveClientChanged */]: true,
    ["session/activeClientToolsChanged" /* ActionType.SessionActiveClientToolsChanged */]: true,
    ["session/pendingMessageSet" /* ActionType.SessionPendingMessageSet */]: true,
    ["session/pendingMessageRemoved" /* ActionType.SessionPendingMessageRemoved */]: true,
    ["session/queuedMessagesReordered" /* ActionType.SessionQueuedMessagesReordered */]: true,
    ["session/customizationsChanged" /* ActionType.SessionCustomizationsChanged */]: false,
    ["session/customizationToggled" /* ActionType.SessionCustomizationToggled */]: true,
    ["session/truncated" /* ActionType.SessionTruncated */]: true,
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWN0aW9uLW9yaWdpbi5nZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL2FjdGlvbi1vcmlnaW4uZ2VuZXJhdGVkLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBcUZoRyxnRkFBZ0Y7QUFFaEY7OztHQUdHO0FBQ0gsTUFBTSxDQUFDLE1BQU0sc0JBQXNCLEdBQXNEO0lBQ3hGLHlEQUE4QixFQUFFLEtBQUs7SUFDckMseUVBQXNDLEVBQUUsS0FBSztJQUM3QywrQ0FBeUIsRUFBRSxLQUFLO0lBQ2hDLGlFQUFrQyxFQUFFLEtBQUs7SUFDekMsMkRBQStCLEVBQUUsSUFBSTtJQUNyQywrQ0FBeUIsRUFBRSxLQUFLO0lBQ2hDLDZEQUFnQyxFQUFFLEtBQUs7SUFDdkMsK0RBQWlDLEVBQUUsS0FBSztJQUN4QywrREFBaUMsRUFBRSxLQUFLO0lBQ3hDLCtEQUFpQyxFQUFFLEtBQUs7SUFDeEMsdUVBQXFDLEVBQUUsSUFBSTtJQUMzQyxxRUFBb0MsRUFBRSxJQUFJO0lBQzFDLG1GQUEyQyxFQUFFLElBQUk7SUFDakQsNkRBQWdDLEVBQUUsS0FBSztJQUN2QywrREFBaUMsRUFBRSxJQUFJO0lBQ3ZDLCtDQUF5QixFQUFFLEtBQUs7SUFDaEMsNkRBQWdDLEVBQUUsSUFBSTtJQUN0QywrQ0FBeUIsRUFBRSxLQUFLO0lBQ2hDLHVEQUE2QixFQUFFLEtBQUs7SUFDcEMsNkRBQWdDLEVBQUUsSUFBSTtJQUN0Qyx5RUFBc0MsRUFBRSxLQUFLO0lBQzdDLDJFQUF1QyxFQUFFLElBQUk7SUFDN0MscUZBQTRDLEVBQUUsSUFBSTtJQUNsRCx1RUFBcUMsRUFBRSxJQUFJO0lBQzNDLCtFQUF5QyxFQUFFLElBQUk7SUFDL0MsbUZBQTJDLEVBQUUsSUFBSTtJQUNqRCwrRUFBeUMsRUFBRSxLQUFLO0lBQ2hELDZFQUF3QyxFQUFFLElBQUk7SUFDOUMsdURBQTZCLEVBQUUsSUFBSTtDQUNuQyxDQUFDIn0=