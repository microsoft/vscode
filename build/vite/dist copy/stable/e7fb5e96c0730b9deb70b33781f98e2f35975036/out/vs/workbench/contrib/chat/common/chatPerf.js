/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { mark, clearMarks } from '../../../../base/common/performance.js';
import { chatSessionResourceToId } from './model/chatUri.js';
const chatPerfPrefix = 'code/chat/';
/**
 * Well-defined perf scenarios for chat request lifecycle.
 * Each mark is a boundary of a measurable scenario — don't add marks
 * without defining what scenario they belong to.
 *
 * ## Scenarios
 *
 * **Time to UI Feedback** (perceived input lag):
 *   `request/start` → `request/uiUpdated`
 *
 * **Instruction Collection Overhead**:
 *   `request/willCollectInstructions` → `request/didCollectInstructions`
 *
 * **Extension Activation Wait** (first-request cold start):
 *   `code/chat/willWaitForActivation` → `code/chat/didWaitForActivation`
 *   (global marks, not session-scoped — emitted via {@link markChatGlobal})
 *
 * **Time to First Token** (the headline metric):
 *   `request/start` → `request/firstToken`
 *
 * **Total Request Duration**:
 *   `request/start` → `request/complete`
 *
 * **Agent Invocation Time** (LLM round-trip):
 *   `agent/willInvoke` → `agent/didInvoke`
 */
export const ChatPerfMark = {
    /** User pressed Enter / request initiated */
    RequestStart: 'request/start',
    /** Request added to model → UI shows the message */
    RequestUiUpdated: 'request/uiUpdated',
    /** Begin collecting .instructions.md / skills / hooks */
    WillCollectInstructions: 'request/willCollectInstructions',
    /** Done collecting instructions */
    DidCollectInstructions: 'request/didCollectInstructions',
    /** First streamed response content received */
    FirstToken: 'request/firstToken',
    /** Response fully complete */
    RequestComplete: 'request/complete',
    /** Agent invoke begins (LLM round-trip start) */
    AgentWillInvoke: 'agent/willInvoke',
    /** Agent invoke returns (LLM round-trip end) */
    AgentDidInvoke: 'agent/didInvoke',
};
/**
 * Emits a performance mark scoped to a chat session:
 * `code/chat/<sessionResource>/<name>`
 *
 * Marks are automatically cleaned up when the corresponding chat model is
 * disposed — see {@link clearChatMarks}.
 */
export function markChat(sessionResource, name) {
    mark(`${chatPerfPrefix}${chatSessionResourceToId(sessionResource)}/${name}`);
}
/**
 * Clears all performance marks for the given chat session.
 * Called when the chat model is disposed.
 */
export function clearChatMarks(sessionResource) {
    clearMarks(`${chatPerfPrefix}${chatSessionResourceToId(sessionResource)}/`);
}
/**
 * Well-defined one-time global perf marks (not scoped to a session).
 * These are emitted via {@link markChatGlobal} and are never cleared.
 */
export const ChatGlobalPerfMark = {
    /** Begin waiting for chat extension activation (SetupAgent) */
    WillWaitForActivation: 'willWaitForActivation',
    /** Extension activation + readiness complete (SetupAgent) */
    DidWaitForActivation: 'didWaitForActivation',
};
/**
 * Emits a global (non-session-scoped) performance mark:
 * `code/chat/<name>`
 *
 * Used for one-time marks like activation that should persist across requests.
 */
export function markChatGlobal(name) {
    mark(`${chatPerfPrefix}${name}`);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFBlcmYuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9jaGF0UGVyZi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsSUFBSSxFQUFFLFVBQVUsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBRTFFLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBRTdELE1BQU0sY0FBYyxHQUFHLFlBQVksQ0FBQztBQUVwQzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQXlCRztBQUNILE1BQU0sQ0FBQyxNQUFNLFlBQVksR0FBRztJQUMzQiw2Q0FBNkM7SUFDN0MsWUFBWSxFQUFFLGVBQWU7SUFDN0Isb0RBQW9EO0lBQ3BELGdCQUFnQixFQUFFLG1CQUFtQjtJQUNyQyx5REFBeUQ7SUFDekQsdUJBQXVCLEVBQUUsaUNBQWlDO0lBQzFELG1DQUFtQztJQUNuQyxzQkFBc0IsRUFBRSxnQ0FBZ0M7SUFDeEQsK0NBQStDO0lBQy9DLFVBQVUsRUFBRSxvQkFBb0I7SUFDaEMsOEJBQThCO0lBQzlCLGVBQWUsRUFBRSxrQkFBa0I7SUFDbkMsaURBQWlEO0lBQ2pELGVBQWUsRUFBRSxrQkFBa0I7SUFDbkMsZ0RBQWdEO0lBQ2hELGNBQWMsRUFBRSxpQkFBaUI7Q0FDeEIsQ0FBQztBQUVYOzs7Ozs7R0FNRztBQUNILE1BQU0sVUFBVSxRQUFRLENBQUMsZUFBb0IsRUFBRSxJQUFZO0lBQzFELElBQUksQ0FBQyxHQUFHLGNBQWMsR0FBRyx1QkFBdUIsQ0FBQyxlQUFlLENBQUMsSUFBSSxJQUFJLEVBQUUsQ0FBQyxDQUFDO0FBQzlFLENBQUM7QUFFRDs7O0dBR0c7QUFDSCxNQUFNLFVBQVUsY0FBYyxDQUFDLGVBQW9CO0lBQ2xELFVBQVUsQ0FBQyxHQUFHLGNBQWMsR0FBRyx1QkFBdUIsQ0FBQyxlQUFlLENBQUMsR0FBRyxDQUFDLENBQUM7QUFDN0UsQ0FBQztBQUVEOzs7R0FHRztBQUNILE1BQU0sQ0FBQyxNQUFNLGtCQUFrQixHQUFHO0lBQ2pDLCtEQUErRDtJQUMvRCxxQkFBcUIsRUFBRSx1QkFBdUI7SUFDOUMsNkRBQTZEO0lBQzdELG9CQUFvQixFQUFFLHNCQUFzQjtDQUNuQyxDQUFDO0FBRVg7Ozs7O0dBS0c7QUFDSCxNQUFNLFVBQVUsY0FBYyxDQUFDLElBQVk7SUFDMUMsSUFBSSxDQUFDLEdBQUcsY0FBYyxHQUFHLElBQUksRUFBRSxDQUFDLENBQUM7QUFDbEMsQ0FBQyJ9