/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mark, clearMarks } from '../../../../base/common/performance.js';
import { URI } from '../../../../base/common/uri.js';
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
} as const;

/**
 * Emits a performance mark scoped to a chat session:
 * `code/chat/<sessionResource>/<name>`
 *
 * Marks are automatically cleaned up when the corresponding chat model is
 * disposed — see {@link clearChatMarks}.
 */
export function markChat(sessionResource: URI, name: string): void {
	mark(`${chatPerfPrefix}${chatSessionResourceToId(sessionResource)}/${name}`);
}

/**
 * Clears all performance marks for the given chat session.
 * Called when the chat model is disposed.
 */
export function clearChatMarks(sessionResource: URI): void {
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
} as const;

/**
 * Emits a global (non-session-scoped) performance mark:
 * `code/chat/<name>`
 *
 * Used for one-time marks like activation that should persist across requests.
 */
export function markChatGlobal(name: string): void {
	mark(`${chatPerfPrefix}${name}`);
}
