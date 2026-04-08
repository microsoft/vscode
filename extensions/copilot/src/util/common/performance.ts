/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

interface IMonacoPerformanceMarks {
	mark(name: string, markOptions?: { startTime?: number }): void;
	getMarks(): { name: string; startTime: number }[];
	clearMarks(prefix: string): void;
}

function _getNativePolyfill(): IMonacoPerformanceMarks {
	return {
		mark: (name, markOptions) => performance.mark(name, markOptions),
		getMarks: () => performance.getEntries().filter(e => e.entryType === 'mark').map(e => ({ name: e.name, startTime: e.startTime })),
		clearMarks: prefix => {
			const toRemove = new Set<string>();
			for (const entry of performance.getEntries()) {
				if (entry.entryType === 'mark' && entry.name.startsWith(prefix)) {
					toRemove.add(entry.name);
				}
			}
			for (const name of toRemove) {
				performance.clearMarks(name);
			}
		},
	};
}

const perf: IMonacoPerformanceMarks = (globalThis as { MonacoPerformanceMarks?: IMonacoPerformanceMarks }).MonacoPerformanceMarks ?? _getNativePolyfill();

const chatExtPrefix = 'code/chat/ext/';

/**
 * Well-defined perf marks for the chat extension request lifecycle.
 * Each mark is a boundary of a measurable scenario — don't add marks
 * without defining what scenario they belong to.
 *
 * These marks live inside the vscode-side `agent/willInvoke` → `agent/didInvoke`
 * window and break down what happens in the extension during a chat request.
 *
 * ## Per-Session Scenarios (scoped by sessionId via {@link markChatExt})
 *
 * **Extension Handler Duration** — total time in the participant handler:
 * `willHandleParticipant` → `didHandleParticipant`
 * Corresponds to vscode's `agent/willInvoke` → `agent/didInvoke`.
 *
 * **Prompt Build Time** — context gathering and prompt assembly (per turn):
 * `willBuildPrompt` → `didBuildPrompt`
 * If this is slow, context resolution (workspace search, file reads, instructions) is the bottleneck.
 *
 * **LLM Fetch Time** — network round-trip to the language model (per turn):
 * `willFetch` → `didFetch`
 * If this is slow, model latency or network is the bottleneck.
 *
 * ## One-Time Activation Scenarios (global marks, not request-scoped)
 *
 * **Extension Activation Duration** — cold-start time:
 * `code/chat/ext/willActivate` → `code/chat/ext/didActivate`
 *
 * **Copilot Token Wait** — authentication readiness blocking activation:
 * `code/chat/ext/willWaitForCopilotToken` → `code/chat/ext/didWaitForCopilotToken`
 */
export const ChatExtPerfMark = {
	/** Chat participant handler starts */
	WillHandleParticipant: 'willHandleParticipant',
	/** Chat participant handler completes */
	DidHandleParticipant: 'didHandleParticipant',
	/** Prompt building starts (per turn) */
	WillBuildPrompt: 'willBuildPrompt',
	/** Prompt building completes (per turn) */
	DidBuildPrompt: 'didBuildPrompt',
	/** LLM fetch starts (per turn) */
	WillFetch: 'willFetch',
	/** LLM fetch completes (per turn) */
	DidFetch: 'didFetch',
} as const;

export type ChatExtPerfMarkName = typeof ChatExtPerfMark[keyof typeof ChatExtPerfMark];

/**
 * Emits a performance mark scoped to a chat session:
 * `code/chat/ext/<sessionId>/<name>`
 *
 * Marks persist in the extension host process until explicitly cleared
 * via {@link clearChatExtMarks}.
 */
export function markChatExt(sessionId: string | undefined, name: ChatExtPerfMarkName): void {
	if (sessionId) {
		perf.mark(`${chatExtPrefix}${sessionId}/${name}`);
	}
}

/**
 * Clears all performance marks for the given chat session.
 */
export function clearChatExtMarks(sessionId: string): void {
	perf.clearMarks(`${chatExtPrefix}${sessionId}/`);
}

export const ChatExtGlobalPerfMark = {
	/** Extension activation starts */
	WillActivate: 'willActivate',
	/** Extension activation completes */
	DidActivate: 'didActivate',
	/** Waiting for Copilot token starts */
	WillWaitForCopilotToken: 'willWaitForCopilotToken',
	/** Copilot token received */
	DidWaitForCopilotToken: 'didWaitForCopilotToken',
} as const;

export type ChatExtGlobalPerfMarkName = typeof ChatExtGlobalPerfMark[keyof typeof ChatExtGlobalPerfMark];

/**
 * Emits a global (non-session-scoped) performance mark:
 * `code/chat/ext/<name>`
 *
 * Used for one-time activation marks like `willActivate` / `didActivate`.
 */
export function markChatExtGlobal(name: ChatExtGlobalPerfMarkName): void {
	perf.mark(`${chatExtPrefix}${name}`);
}

/**
 * Returns all marks currently stored in the polyfill.
 * Useful for tests and diagnostics.
 */
export function getChatExtMarks(): { name: string; startTime: number }[] {
	return perf.getMarks();
}
