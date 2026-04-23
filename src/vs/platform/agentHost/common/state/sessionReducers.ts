/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Re-exports the protocol reducers and adds VS Code-specific helpers.
// The actual reducer logic lives in the auto-generated protocol layer.

// Re-export reducers from the protocol layer
export { rootReducer, sessionReducer, softAssertNever, isClientDispatchable } from './protocol/reducers.js';

import type { ICompletedToolCall, ToolCallState } from './sessionState.js';

/**
 * Extracts the VS Code-specific `toolKind` hint from a tool call's `_meta`
 * bag. This is not part of the protocol and is injected by the agent adapter
 * (e.g. `copilotEventMapper`).
 */
export function getToolKind(tc: ToolCallState | ICompletedToolCall): 'terminal' | 'subagent' | undefined {
	return tc._meta?.toolKind as 'terminal' | 'subagent' | undefined;
}
