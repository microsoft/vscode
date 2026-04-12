/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
/**
 * The severity level of a chat debug log event.
 */
export var ChatDebugLogLevel;
(function (ChatDebugLogLevel) {
    ChatDebugLogLevel[ChatDebugLogLevel["Trace"] = 0] = "Trace";
    ChatDebugLogLevel[ChatDebugLogLevel["Info"] = 1] = "Info";
    ChatDebugLogLevel[ChatDebugLogLevel["Warning"] = 2] = "Warning";
    ChatDebugLogLevel[ChatDebugLogLevel["Error"] = 3] = "Error";
})(ChatDebugLogLevel || (ChatDebugLogLevel = {}));
/**
 * The result of a hook execution.
 */
export var ChatDebugHookResult;
(function (ChatDebugHookResult) {
    /** The hook executed successfully (exit code 0). */
    ChatDebugHookResult[ChatDebugHookResult["Success"] = 0] = "Success";
    /** The hook returned a blocking error (exit code 2). */
    ChatDebugHookResult[ChatDebugHookResult["Error"] = 1] = "Error";
    /** The hook returned a non-blocking warning (other non-zero exit codes). */
    ChatDebugHookResult[ChatDebugHookResult["NonBlockingError"] = 2] = "NonBlockingError";
})(ChatDebugHookResult || (ChatDebugHookResult = {}));
export const IChatDebugService = createDecorator('chatDebugService');
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdERlYnVnU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2NoYXREZWJ1Z1NlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFLaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBRzdGOztHQUVHO0FBQ0gsTUFBTSxDQUFOLElBQVksaUJBS1g7QUFMRCxXQUFZLGlCQUFpQjtJQUM1QiwyREFBUyxDQUFBO0lBQ1QseURBQVEsQ0FBQTtJQUNSLCtEQUFXLENBQUE7SUFDWCwyREFBUyxDQUFBO0FBQ1YsQ0FBQyxFQUxXLGlCQUFpQixLQUFqQixpQkFBaUIsUUFLNUI7QUFFRDs7R0FFRztBQUNILE1BQU0sQ0FBTixJQUFZLG1CQU9YO0FBUEQsV0FBWSxtQkFBbUI7SUFDOUIsb0RBQW9EO0lBQ3BELG1FQUFXLENBQUE7SUFDWCx3REFBd0Q7SUFDeEQsK0RBQVMsQ0FBQTtJQUNULDRFQUE0RTtJQUM1RSxxRkFBb0IsQ0FBQTtBQUNyQixDQUFDLEVBUFcsbUJBQW1CLEtBQW5CLG1CQUFtQixRQU85QjtBQTZGRCxNQUFNLENBQUMsTUFBTSxpQkFBaUIsR0FBRyxlQUFlLENBQW9CLGtCQUFrQixDQUFDLENBQUMifQ==