/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// Immutable state types for the sessions process protocol.
// See protocol.md for the full design rationale.
//
// Most types are imported from the auto-generated protocol layer
// (synced from the agent-host-protocol repo). This file adds VS Code-specific
// helpers and re-exports.
import { hasKey } from '../../../../base/common/types.js';
// Re-export everything from the protocol state module
export { AttachmentType, CustomizationStatus, PendingMessageKind, PolicyState, ResponsePartKind, SessionLifecycle, SessionStatus, ToolCallConfirmationReason, ToolCallCancellationReason, ToolCallStatus, ToolResultContentType, TurnState, } from './protocol/state.js';
// ---- File edit kind ---------------------------------------------------------
/**
 * The kind of file edit operation. Derived from the presence/absence of
 * `before`/`after` in {@link IToolResultFileEditContent}.
 */
export var FileEditKind;
(function (FileEditKind) {
    /** Content edit (same file URI, different content). */
    FileEditKind["Edit"] = "edit";
    /** File creation (no before state). */
    FileEditKind["Create"] = "create";
    /** File deletion (no after state). */
    FileEditKind["Delete"] = "delete";
    /** File rename/move (different before and after URIs). */
    FileEditKind["Rename"] = "rename";
})(FileEditKind || (FileEditKind = {}));
// ---- Well-known URIs --------------------------------------------------------
/** URI for the root state subscription. */
export const ROOT_STATE_URI = 'agenthost:/root';
// ---- Tool output helper -----------------------------------------------------
/**
 * Extracts a plain-text tool output string from a tool call result's `content`
 * array. Joins all text-type content parts into a single string.
 *
 * Returns `undefined` if there are no text content parts.
 */
export function getToolOutputText(result) {
    if (!result.content || result.content.length === 0) {
        return undefined;
    }
    const textParts = [];
    for (const c of result.content) {
        if (hasKey(c, { type: true }) && c.type === "text" /* ToolResultContentType.Text */) {
            textParts.push(c);
        }
    }
    if (textParts.length === 0) {
        return undefined;
    }
    return textParts.map(p => p.text).join('\n');
}
/**
 * Extracts file edit content entries from a tool call result's `content` array.
 * Returns an empty array if there are no file edit content parts.
 */
export function getToolFileEdits(result) {
    if (!result.content || result.content.length === 0) {
        return [];
    }
    const edits = [];
    for (const c of result.content) {
        if (hasKey(c, { type: true }) && c.type === "fileEdit" /* ToolResultContentType.FileEdit */) {
            edits.push(c);
        }
    }
    return edits;
}
// ---- Factory helpers --------------------------------------------------------
export function createRootState() {
    return {
        agents: [],
        activeSessions: 0,
    };
}
export function createSessionState(summary) {
    return {
        summary,
        lifecycle: "creating" /* SessionLifecycle.Creating */,
        turns: [],
        activeTurn: undefined,
    };
}
export function createActiveTurn(id, userMessage) {
    return {
        id,
        userMessage,
        responseParts: [],
        usage: undefined,
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Vzc2lvblN0YXRlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsMkRBQTJEO0FBQzNELGlEQUFpRDtBQUNqRCxFQUFFO0FBQ0YsaUVBQWlFO0FBQ2pFLDhFQUE4RTtBQUM5RSwwQkFBMEI7QUFFMUIsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBaUIxRCxzREFBc0Q7QUFDdEQsT0FBTyxFQXNDTixjQUFjLEVBQ2QsbUJBQW1CLEVBQ25CLGtCQUFrQixFQUNsQixXQUFXLEVBQ1gsZ0JBQWdCLEVBQ2hCLGdCQUFnQixFQUNoQixhQUFhLEVBQ2IsMEJBQTBCLEVBQzFCLDBCQUEwQixFQUMxQixjQUFjLEVBQ2QscUJBQXFCLEVBQ3JCLFNBQVMsR0FDVCxNQUFNLHFCQUFxQixDQUFDO0FBRTdCLGdGQUFnRjtBQUVoRjs7O0dBR0c7QUFDSCxNQUFNLENBQU4sSUFBa0IsWUFTakI7QUFURCxXQUFrQixZQUFZO0lBQzdCLHVEQUF1RDtJQUN2RCw2QkFBYSxDQUFBO0lBQ2IsdUNBQXVDO0lBQ3ZDLGlDQUFpQixDQUFBO0lBQ2pCLHNDQUFzQztJQUN0QyxpQ0FBaUIsQ0FBQTtJQUNqQiwwREFBMEQ7SUFDMUQsaUNBQWlCLENBQUE7QUFDbEIsQ0FBQyxFQVRpQixZQUFZLEtBQVosWUFBWSxRQVM3QjtBQUVELGdGQUFnRjtBQUVoRiwyQ0FBMkM7QUFDM0MsTUFBTSxDQUFDLE1BQU0sY0FBYyxHQUFHLGlCQUFpQixDQUFDO0FBY2hELGdGQUFnRjtBQUVoRjs7Ozs7R0FLRztBQUNILE1BQU0sVUFBVSxpQkFBaUIsQ0FBQyxNQUF1QjtJQUN4RCxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sSUFBSSxNQUFNLENBQUMsT0FBTyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztRQUNwRCxPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDO0lBQ0QsTUFBTSxTQUFTLEdBQTZCLEVBQUUsQ0FBQztJQUMvQyxLQUFLLE1BQU0sQ0FBQyxJQUFJLE1BQU0sQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNoQyxJQUFJLE1BQU0sQ0FBQyxDQUFDLEVBQUUsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSw0Q0FBK0IsRUFBRSxDQUFDO1lBQ3hFLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDbkIsQ0FBQztJQUNGLENBQUM7SUFDRCxJQUFJLFNBQVMsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7UUFDNUIsT0FBTyxTQUFTLENBQUM7SUFDbEIsQ0FBQztJQUNELE9BQU8sU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDOUMsQ0FBQztBQUVEOzs7R0FHRztBQUNILE1BQU0sVUFBVSxnQkFBZ0IsQ0FBQyxNQUF1QjtJQUN2RCxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sSUFBSSxNQUFNLENBQUMsT0FBTyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztRQUNwRCxPQUFPLEVBQUUsQ0FBQztJQUNYLENBQUM7SUFDRCxNQUFNLEtBQUssR0FBaUMsRUFBRSxDQUFDO0lBQy9DLEtBQUssTUFBTSxDQUFDLElBQUksTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ2hDLElBQUksTUFBTSxDQUFDLENBQUMsRUFBRSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLG9EQUFtQyxFQUFFLENBQUM7WUFDNUUsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNmLENBQUM7SUFDRixDQUFDO0lBQ0QsT0FBTyxLQUFLLENBQUM7QUFDZCxDQUFDO0FBRUQsZ0ZBQWdGO0FBRWhGLE1BQU0sVUFBVSxlQUFlO0lBQzlCLE9BQU87UUFDTixNQUFNLEVBQUUsRUFBRTtRQUNWLGNBQWMsRUFBRSxDQUFDO0tBQ2pCLENBQUM7QUFDSCxDQUFDO0FBRUQsTUFBTSxVQUFVLGtCQUFrQixDQUFDLE9BQXdCO0lBQzFELE9BQU87UUFDTixPQUFPO1FBQ1AsU0FBUyw0Q0FBMkI7UUFDcEMsS0FBSyxFQUFFLEVBQUU7UUFDVCxVQUFVLEVBQUUsU0FBUztLQUNyQixDQUFDO0FBQ0gsQ0FBQztBQUVELE1BQU0sVUFBVSxnQkFBZ0IsQ0FBQyxFQUFVLEVBQUUsV0FBeUI7SUFDckUsT0FBTztRQUNOLEVBQUU7UUFDRixXQUFXO1FBQ1gsYUFBYSxFQUFFLEVBQUU7UUFDakIsS0FBSyxFQUFFLFNBQVM7S0FDaEIsQ0FBQztBQUNILENBQUMifQ==