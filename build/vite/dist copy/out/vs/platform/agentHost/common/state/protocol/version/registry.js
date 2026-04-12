/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// ─── Protocol Version Constants ──────────────────────────────────────────────
/** The current protocol version that new code speaks. */
export const PROTOCOL_VERSION = 1;
/** The oldest protocol version the implementation maintains compatibility with. */
export const MIN_PROTOCOL_VERSION = 1;
// ─── Exhaustive Action → Version Map ─────────────────────────────────────────
/**
 * Maps every action type to the protocol version that introduced it.
 * Adding a new action to `IStateAction` without adding it here is a compile error.
 */
export const ACTION_INTRODUCED_IN = {
    ["root/agentsChanged" /* ActionType.RootAgentsChanged */]: 1,
    ["root/activeSessionsChanged" /* ActionType.RootActiveSessionsChanged */]: 1,
    ["session/ready" /* ActionType.SessionReady */]: 1,
    ["session/creationFailed" /* ActionType.SessionCreationFailed */]: 1,
    ["session/turnStarted" /* ActionType.SessionTurnStarted */]: 1,
    ["session/delta" /* ActionType.SessionDelta */]: 1,
    ["session/responsePart" /* ActionType.SessionResponsePart */]: 1,
    ["session/toolCallStart" /* ActionType.SessionToolCallStart */]: 1,
    ["session/toolCallDelta" /* ActionType.SessionToolCallDelta */]: 1,
    ["session/toolCallReady" /* ActionType.SessionToolCallReady */]: 1,
    ["session/toolCallConfirmed" /* ActionType.SessionToolCallConfirmed */]: 1,
    ["session/toolCallComplete" /* ActionType.SessionToolCallComplete */]: 1,
    ["session/toolCallResultConfirmed" /* ActionType.SessionToolCallResultConfirmed */]: 1,
    ["session/turnComplete" /* ActionType.SessionTurnComplete */]: 1,
    ["session/turnCancelled" /* ActionType.SessionTurnCancelled */]: 1,
    ["session/error" /* ActionType.SessionError */]: 1,
    ["session/titleChanged" /* ActionType.SessionTitleChanged */]: 1,
    ["session/usage" /* ActionType.SessionUsage */]: 1,
    ["session/reasoning" /* ActionType.SessionReasoning */]: 1,
    ["session/modelChanged" /* ActionType.SessionModelChanged */]: 1,
    ["session/serverToolsChanged" /* ActionType.SessionServerToolsChanged */]: 1,
    ["session/activeClientChanged" /* ActionType.SessionActiveClientChanged */]: 1,
    ["session/activeClientToolsChanged" /* ActionType.SessionActiveClientToolsChanged */]: 1,
    ["session/pendingMessageSet" /* ActionType.SessionPendingMessageSet */]: 1,
    ["session/pendingMessageRemoved" /* ActionType.SessionPendingMessageRemoved */]: 1,
    ["session/queuedMessagesReordered" /* ActionType.SessionQueuedMessagesReordered */]: 1,
    ["session/customizationsChanged" /* ActionType.SessionCustomizationsChanged */]: 1,
    ["session/customizationToggled" /* ActionType.SessionCustomizationToggled */]: 1,
    ["session/truncated" /* ActionType.SessionTruncated */]: 1,
};
/**
 * Returns whether the given action type is known to the specified protocol version.
 */
export function isActionKnownToVersion(action, clientVersion) {
    return ACTION_INTRODUCED_IN[action.type] <= clientVersion;
}
// ─── Exhaustive Notification → Version Map ─────────────────────────────────
/**
 * Maps every notification type to the protocol version that introduced it.
 * Adding a new notification to `IProtocolNotification` without adding it here
 * is a compile error.
 */
export const NOTIFICATION_INTRODUCED_IN = {
    ["notify/sessionAdded" /* NotificationType.SessionAdded */]: 1,
    ["notify/sessionRemoved" /* NotificationType.SessionRemoved */]: 1,
    ["notify/authRequired" /* NotificationType.AuthRequired */]: 1,
};
/**
 * Returns whether the given notification type is known to the specified protocol version.
 */
export function isNotificationKnownToVersion(notification, clientVersion) {
    return NOTIFICATION_INTRODUCED_IN[notification.type] <= clientVersion;
}
/**
 * Derives capabilities from a protocol version number.
 */
export function capabilitiesForVersion(_version) {
    return {
        sessions: true,
        tools: true,
        permissions: true,
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVnaXN0cnkuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL3ZlcnNpb24vcmVnaXN0cnkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFRaEcsZ0ZBQWdGO0FBRWhGLHlEQUF5RDtBQUN6RCxNQUFNLENBQUMsTUFBTSxnQkFBZ0IsR0FBRyxDQUFDLENBQUM7QUFFbEMsbUZBQW1GO0FBQ25GLE1BQU0sQ0FBQyxNQUFNLG9CQUFvQixHQUFHLENBQUMsQ0FBQztBQUV0QyxnRkFBZ0Y7QUFFaEY7OztHQUdHO0FBQ0gsTUFBTSxDQUFDLE1BQU0sb0JBQW9CLEdBQXFEO0lBQ3JGLHlEQUE4QixFQUFFLENBQUM7SUFDakMseUVBQXNDLEVBQUUsQ0FBQztJQUN6QywrQ0FBeUIsRUFBRSxDQUFDO0lBQzVCLGlFQUFrQyxFQUFFLENBQUM7SUFDckMsMkRBQStCLEVBQUUsQ0FBQztJQUNsQywrQ0FBeUIsRUFBRSxDQUFDO0lBQzVCLDZEQUFnQyxFQUFFLENBQUM7SUFDbkMsK0RBQWlDLEVBQUUsQ0FBQztJQUNwQywrREFBaUMsRUFBRSxDQUFDO0lBQ3BDLCtEQUFpQyxFQUFFLENBQUM7SUFDcEMsdUVBQXFDLEVBQUUsQ0FBQztJQUN4QyxxRUFBb0MsRUFBRSxDQUFDO0lBQ3ZDLG1GQUEyQyxFQUFFLENBQUM7SUFDOUMsNkRBQWdDLEVBQUUsQ0FBQztJQUNuQywrREFBaUMsRUFBRSxDQUFDO0lBQ3BDLCtDQUF5QixFQUFFLENBQUM7SUFDNUIsNkRBQWdDLEVBQUUsQ0FBQztJQUNuQywrQ0FBeUIsRUFBRSxDQUFDO0lBQzVCLHVEQUE2QixFQUFFLENBQUM7SUFDaEMsNkRBQWdDLEVBQUUsQ0FBQztJQUNuQyx5RUFBc0MsRUFBRSxDQUFDO0lBQ3pDLDJFQUF1QyxFQUFFLENBQUM7SUFDMUMscUZBQTRDLEVBQUUsQ0FBQztJQUMvQyx1RUFBcUMsRUFBRSxDQUFDO0lBQ3hDLCtFQUF5QyxFQUFFLENBQUM7SUFDNUMsbUZBQTJDLEVBQUUsQ0FBQztJQUM5QywrRUFBeUMsRUFBRSxDQUFDO0lBQzVDLDZFQUF3QyxFQUFFLENBQUM7SUFDM0MsdURBQTZCLEVBQUUsQ0FBQztDQUNoQyxDQUFDO0FBRUY7O0dBRUc7QUFDSCxNQUFNLFVBQVUsc0JBQXNCLENBQUMsTUFBb0IsRUFBRSxhQUFxQjtJQUNqRixPQUFPLG9CQUFvQixDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxhQUFhLENBQUM7QUFDM0QsQ0FBQztBQUVELDhFQUE4RTtBQUU5RTs7OztHQUlHO0FBQ0gsTUFBTSxDQUFDLE1BQU0sMEJBQTBCLEdBQThEO0lBQ3BHLDJEQUErQixFQUFFLENBQUM7SUFDbEMsK0RBQWlDLEVBQUUsQ0FBQztJQUNwQywyREFBK0IsRUFBRSxDQUFDO0NBQ2xDLENBQUM7QUFFRjs7R0FFRztBQUNILE1BQU0sVUFBVSw0QkFBNEIsQ0FBQyxZQUFtQyxFQUFFLGFBQXFCO0lBQ3RHLE9BQU8sMEJBQTBCLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxJQUFJLGFBQWEsQ0FBQztBQUN2RSxDQUFDO0FBZ0JEOztHQUVHO0FBQ0gsTUFBTSxVQUFVLHNCQUFzQixDQUFDLFFBQWdCO0lBQ3RELE9BQU87UUFDTixRQUFRLEVBQUUsSUFBSTtRQUNkLEtBQUssRUFBRSxJQUFJO1FBQ1gsV0FBVyxFQUFFLElBQUk7S0FDakIsQ0FBQztBQUNILENBQUMifQ==