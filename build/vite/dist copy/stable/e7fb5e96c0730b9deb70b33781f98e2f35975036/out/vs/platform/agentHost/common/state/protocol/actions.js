/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// ─── Action Type Enum ────────────────────────────────────────────────────────
/**
 * Discriminant values for all state actions.
 *
 * @category Actions
 */
export var ActionType;
(function (ActionType) {
    ActionType["RootAgentsChanged"] = "root/agentsChanged";
    ActionType["RootActiveSessionsChanged"] = "root/activeSessionsChanged";
    ActionType["SessionReady"] = "session/ready";
    ActionType["SessionCreationFailed"] = "session/creationFailed";
    ActionType["SessionTurnStarted"] = "session/turnStarted";
    ActionType["SessionDelta"] = "session/delta";
    ActionType["SessionResponsePart"] = "session/responsePart";
    ActionType["SessionToolCallStart"] = "session/toolCallStart";
    ActionType["SessionToolCallDelta"] = "session/toolCallDelta";
    ActionType["SessionToolCallReady"] = "session/toolCallReady";
    ActionType["SessionToolCallConfirmed"] = "session/toolCallConfirmed";
    ActionType["SessionToolCallComplete"] = "session/toolCallComplete";
    ActionType["SessionToolCallResultConfirmed"] = "session/toolCallResultConfirmed";
    ActionType["SessionTurnComplete"] = "session/turnComplete";
    ActionType["SessionTurnCancelled"] = "session/turnCancelled";
    ActionType["SessionError"] = "session/error";
    ActionType["SessionTitleChanged"] = "session/titleChanged";
    ActionType["SessionUsage"] = "session/usage";
    ActionType["SessionReasoning"] = "session/reasoning";
    ActionType["SessionModelChanged"] = "session/modelChanged";
    ActionType["SessionServerToolsChanged"] = "session/serverToolsChanged";
    ActionType["SessionActiveClientChanged"] = "session/activeClientChanged";
    ActionType["SessionActiveClientToolsChanged"] = "session/activeClientToolsChanged";
    ActionType["SessionPendingMessageSet"] = "session/pendingMessageSet";
    ActionType["SessionPendingMessageRemoved"] = "session/pendingMessageRemoved";
    ActionType["SessionQueuedMessagesReordered"] = "session/queuedMessagesReordered";
    ActionType["SessionCustomizationsChanged"] = "session/customizationsChanged";
    ActionType["SessionCustomizationToggled"] = "session/customizationToggled";
    ActionType["SessionTruncated"] = "session/truncated";
})(ActionType || (ActionType = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWN0aW9ucy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvcHJvdG9jb2wvYWN0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQVFoRyxnRkFBZ0Y7QUFFaEY7Ozs7R0FJRztBQUNILE1BQU0sQ0FBTixJQUFrQixVQThCakI7QUE5QkQsV0FBa0IsVUFBVTtJQUMzQixzREFBd0MsQ0FBQTtJQUN4QyxzRUFBd0QsQ0FBQTtJQUN4RCw0Q0FBOEIsQ0FBQTtJQUM5Qiw4REFBZ0QsQ0FBQTtJQUNoRCx3REFBMEMsQ0FBQTtJQUMxQyw0Q0FBOEIsQ0FBQTtJQUM5QiwwREFBNEMsQ0FBQTtJQUM1Qyw0REFBOEMsQ0FBQTtJQUM5Qyw0REFBOEMsQ0FBQTtJQUM5Qyw0REFBOEMsQ0FBQTtJQUM5QyxvRUFBc0QsQ0FBQTtJQUN0RCxrRUFBb0QsQ0FBQTtJQUNwRCxnRkFBa0UsQ0FBQTtJQUNsRSwwREFBNEMsQ0FBQTtJQUM1Qyw0REFBOEMsQ0FBQTtJQUM5Qyw0Q0FBOEIsQ0FBQTtJQUM5QiwwREFBNEMsQ0FBQTtJQUM1Qyw0Q0FBOEIsQ0FBQTtJQUM5QixvREFBc0MsQ0FBQTtJQUN0QywwREFBNEMsQ0FBQTtJQUM1QyxzRUFBd0QsQ0FBQTtJQUN4RCx3RUFBMEQsQ0FBQTtJQUMxRCxrRkFBb0UsQ0FBQTtJQUNwRSxvRUFBc0QsQ0FBQTtJQUN0RCw0RUFBOEQsQ0FBQTtJQUM5RCxnRkFBa0UsQ0FBQTtJQUNsRSw0RUFBOEQsQ0FBQTtJQUM5RCwwRUFBNEQsQ0FBQTtJQUM1RCxvREFBc0MsQ0FBQTtBQUN2QyxDQUFDLEVBOUJpQixVQUFVLEtBQVYsVUFBVSxRQThCM0IifQ==