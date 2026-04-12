/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// ─── Root State ──────────────────────────────────────────────────────────────
/**
 * Policy configuration state for a model.
 *
 * @category Root State
 */
export var PolicyState;
(function (PolicyState) {
    PolicyState["Enabled"] = "enabled";
    PolicyState["Disabled"] = "disabled";
    PolicyState["Unconfigured"] = "unconfigured";
})(PolicyState || (PolicyState = {}));
// ─── Pending Message Types ───────────────────────────────────────────────────
/**
 * Discriminant for pending message kinds.
 *
 * @category Pending Message Types
 */
export var PendingMessageKind;
(function (PendingMessageKind) {
    /** Injected into the current turn at a convenient point */
    PendingMessageKind["Steering"] = "steering";
    /** Sent automatically as a new turn after the current turn finishes */
    PendingMessageKind["Queued"] = "queued";
})(PendingMessageKind || (PendingMessageKind = {}));
// ─── Session State ───────────────────────────────────────────────────────────
/**
 * Session initialization state.
 *
 * @category Session State
 */
export var SessionLifecycle;
(function (SessionLifecycle) {
    SessionLifecycle["Creating"] = "creating";
    SessionLifecycle["Ready"] = "ready";
    SessionLifecycle["CreationFailed"] = "creationFailed";
})(SessionLifecycle || (SessionLifecycle = {}));
/**
 * Current session status.
 *
 * @category Session State
 */
export var SessionStatus;
(function (SessionStatus) {
    SessionStatus["Idle"] = "idle";
    SessionStatus["InProgress"] = "in-progress";
    SessionStatus["Error"] = "error";
})(SessionStatus || (SessionStatus = {}));
// ─── Turn Types ──────────────────────────────────────────────────────────────
/**
 * How a turn ended.
 *
 * @category Turn Types
 */
export var TurnState;
(function (TurnState) {
    TurnState["Complete"] = "complete";
    TurnState["Cancelled"] = "cancelled";
    TurnState["Error"] = "error";
})(TurnState || (TurnState = {}));
/**
 * Type of a message attachment.
 *
 * @category Turn Types
 */
export var AttachmentType;
(function (AttachmentType) {
    AttachmentType["File"] = "file";
    AttachmentType["Directory"] = "directory";
    AttachmentType["Selection"] = "selection";
})(AttachmentType || (AttachmentType = {}));
// ─── Response Parts ──────────────────────────────────────────────────────────
/**
 * Discriminant for response part types.
 *
 * @category Response Parts
 */
export var ResponsePartKind;
(function (ResponsePartKind) {
    ResponsePartKind["Markdown"] = "markdown";
    ResponsePartKind["ContentRef"] = "contentRef";
    ResponsePartKind["ToolCall"] = "toolCall";
    ResponsePartKind["Reasoning"] = "reasoning";
})(ResponsePartKind || (ResponsePartKind = {}));
// ─── Tool Call Types ─────────────────────────────────────────────────────────
/**
 * Status of a tool call in the lifecycle state machine.
 *
 * @category Tool Call Types
 */
export var ToolCallStatus;
(function (ToolCallStatus) {
    ToolCallStatus["Streaming"] = "streaming";
    ToolCallStatus["PendingConfirmation"] = "pending-confirmation";
    ToolCallStatus["Running"] = "running";
    ToolCallStatus["PendingResultConfirmation"] = "pending-result-confirmation";
    ToolCallStatus["Completed"] = "completed";
    ToolCallStatus["Cancelled"] = "cancelled";
})(ToolCallStatus || (ToolCallStatus = {}));
/**
 * How a tool call was confirmed for execution.
 *
 * - `NotNeeded` — No confirmation required (auto-approved)
 * - `UserAction` — User explicitly approved
 * - `Setting` — Approved by a persistent user setting
 *
 * @category Tool Call Types
 */
export var ToolCallConfirmationReason;
(function (ToolCallConfirmationReason) {
    ToolCallConfirmationReason["NotNeeded"] = "not-needed";
    ToolCallConfirmationReason["UserAction"] = "user-action";
    ToolCallConfirmationReason["Setting"] = "setting";
})(ToolCallConfirmationReason || (ToolCallConfirmationReason = {}));
/**
 * Why a tool call was cancelled.
 *
 * @category Tool Call Types
 */
export var ToolCallCancellationReason;
(function (ToolCallCancellationReason) {
    ToolCallCancellationReason["Denied"] = "denied";
    ToolCallCancellationReason["Skipped"] = "skipped";
    ToolCallCancellationReason["ResultDenied"] = "result-denied";
})(ToolCallCancellationReason || (ToolCallCancellationReason = {}));
// ─── Tool Result Content ─────────────────────────────────────────────────────
/**
 * Discriminant for tool result content types.
 *
 * @category Tool Result Content
 */
export var ToolResultContentType;
(function (ToolResultContentType) {
    ToolResultContentType["Text"] = "text";
    ToolResultContentType["EmbeddedResource"] = "embeddedResource";
    ToolResultContentType["Resource"] = "resource";
    ToolResultContentType["FileEdit"] = "fileEdit";
})(ToolResultContentType || (ToolResultContentType = {}));
/**
 * Loading status for a server-managed customization.
 *
 * @category Customization Types
 */
export var CustomizationStatus;
(function (CustomizationStatus) {
    /** Plugin is being loaded */
    CustomizationStatus["Loading"] = "loading";
    /** Plugin is fully operational */
    CustomizationStatus["Loaded"] = "loaded";
    /** Plugin partially loaded but has warnings */
    CustomizationStatus["Degraded"] = "degraded";
    /** Plugin was unable to load */
    CustomizationStatus["Error"] = "error";
})(CustomizationStatus || (CustomizationStatus = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhdGUuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBZ0loRyxnRkFBZ0Y7QUFFaEY7Ozs7R0FJRztBQUNILE1BQU0sQ0FBTixJQUFrQixXQUlqQjtBQUpELFdBQWtCLFdBQVc7SUFDNUIsa0NBQW1CLENBQUE7SUFDbkIsb0NBQXFCLENBQUE7SUFDckIsNENBQTZCLENBQUE7QUFDOUIsQ0FBQyxFQUppQixXQUFXLEtBQVgsV0FBVyxRQUk1QjtBQWlFRCxnRkFBZ0Y7QUFFaEY7Ozs7R0FJRztBQUNILE1BQU0sQ0FBTixJQUFrQixrQkFLakI7QUFMRCxXQUFrQixrQkFBa0I7SUFDbkMsMkRBQTJEO0lBQzNELDJDQUFxQixDQUFBO0lBQ3JCLHVFQUF1RTtJQUN2RSx1Q0FBaUIsQ0FBQTtBQUNsQixDQUFDLEVBTGlCLGtCQUFrQixLQUFsQixrQkFBa0IsUUFLbkM7QUFrQkQsZ0ZBQWdGO0FBRWhGOzs7O0dBSUc7QUFDSCxNQUFNLENBQU4sSUFBa0IsZ0JBSWpCO0FBSkQsV0FBa0IsZ0JBQWdCO0lBQ2pDLHlDQUFxQixDQUFBO0lBQ3JCLG1DQUFlLENBQUE7SUFDZixxREFBaUMsQ0FBQTtBQUNsQyxDQUFDLEVBSmlCLGdCQUFnQixLQUFoQixnQkFBZ0IsUUFJakM7QUFFRDs7OztHQUlHO0FBQ0gsTUFBTSxDQUFOLElBQWtCLGFBSWpCO0FBSkQsV0FBa0IsYUFBYTtJQUM5Qiw4QkFBYSxDQUFBO0lBQ2IsMkNBQTBCLENBQUE7SUFDMUIsZ0NBQWUsQ0FBQTtBQUNoQixDQUFDLEVBSmlCLGFBQWEsS0FBYixhQUFhLFFBSTlCO0FBOEVELGdGQUFnRjtBQUVoRjs7OztHQUlHO0FBQ0gsTUFBTSxDQUFOLElBQWtCLFNBSWpCO0FBSkQsV0FBa0IsU0FBUztJQUMxQixrQ0FBcUIsQ0FBQTtJQUNyQixvQ0FBdUIsQ0FBQTtJQUN2Qiw0QkFBZSxDQUFBO0FBQ2hCLENBQUMsRUFKaUIsU0FBUyxLQUFULFNBQVMsUUFJMUI7QUFFRDs7OztHQUlHO0FBQ0gsTUFBTSxDQUFOLElBQWtCLGNBSWpCO0FBSkQsV0FBa0IsY0FBYztJQUMvQiwrQkFBYSxDQUFBO0lBQ2IseUNBQXVCLENBQUE7SUFDdkIseUNBQXVCLENBQUE7QUFDeEIsQ0FBQyxFQUppQixjQUFjLEtBQWQsY0FBYyxRQUkvQjtBQXFFRCxnRkFBZ0Y7QUFFaEY7Ozs7R0FJRztBQUNILE1BQU0sQ0FBTixJQUFrQixnQkFLakI7QUFMRCxXQUFrQixnQkFBZ0I7SUFDakMseUNBQXFCLENBQUE7SUFDckIsNkNBQXlCLENBQUE7SUFDekIseUNBQXFCLENBQUE7SUFDckIsMkNBQXVCLENBQUE7QUFDeEIsQ0FBQyxFQUxpQixnQkFBZ0IsS0FBaEIsZ0JBQWdCLFFBS2pDO0FBdUVELGdGQUFnRjtBQUVoRjs7OztHQUlHO0FBQ0gsTUFBTSxDQUFOLElBQWtCLGNBT2pCO0FBUEQsV0FBa0IsY0FBYztJQUMvQix5Q0FBdUIsQ0FBQTtJQUN2Qiw4REFBNEMsQ0FBQTtJQUM1QyxxQ0FBbUIsQ0FBQTtJQUNuQiwyRUFBeUQsQ0FBQTtJQUN6RCx5Q0FBdUIsQ0FBQTtJQUN2Qix5Q0FBdUIsQ0FBQTtBQUN4QixDQUFDLEVBUGlCLGNBQWMsS0FBZCxjQUFjLFFBTy9CO0FBRUQ7Ozs7Ozs7O0dBUUc7QUFDSCxNQUFNLENBQU4sSUFBa0IsMEJBSWpCO0FBSkQsV0FBa0IsMEJBQTBCO0lBQzNDLHNEQUF3QixDQUFBO0lBQ3hCLHdEQUEwQixDQUFBO0lBQzFCLGlEQUFtQixDQUFBO0FBQ3BCLENBQUMsRUFKaUIsMEJBQTBCLEtBQTFCLDBCQUEwQixRQUkzQztBQUVEOzs7O0dBSUc7QUFDSCxNQUFNLENBQU4sSUFBa0IsMEJBSWpCO0FBSkQsV0FBa0IsMEJBQTBCO0lBQzNDLCtDQUFpQixDQUFBO0lBQ2pCLGlEQUFtQixDQUFBO0lBQ25CLDREQUE4QixDQUFBO0FBQy9CLENBQUMsRUFKaUIsMEJBQTBCLEtBQTFCLDBCQUEwQixRQUkzQztBQTBPRCxnRkFBZ0Y7QUFFaEY7Ozs7R0FJRztBQUNILE1BQU0sQ0FBTixJQUFrQixxQkFLakI7QUFMRCxXQUFrQixxQkFBcUI7SUFDdEMsc0NBQWEsQ0FBQTtJQUNiLDhEQUFxQyxDQUFBO0lBQ3JDLDhDQUFxQixDQUFBO0lBQ3JCLDhDQUFxQixDQUFBO0FBQ3RCLENBQUMsRUFMaUIscUJBQXFCLEtBQXJCLHFCQUFxQixRQUt0QztBQXNIRDs7OztHQUlHO0FBQ0gsTUFBTSxDQUFOLElBQWtCLG1CQVNqQjtBQVRELFdBQWtCLG1CQUFtQjtJQUNwQyw2QkFBNkI7SUFDN0IsMENBQW1CLENBQUE7SUFDbkIsa0NBQWtDO0lBQ2xDLHdDQUFpQixDQUFBO0lBQ2pCLCtDQUErQztJQUMvQyw0Q0FBcUIsQ0FBQTtJQUNyQixnQ0FBZ0M7SUFDaEMsc0NBQWUsQ0FBQTtBQUNoQixDQUFDLEVBVGlCLG1CQUFtQixLQUFuQixtQkFBbUIsUUFTcEMifQ==