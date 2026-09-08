/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Re-exports the protocol reducers and adds VS Code-specific helpers.
// The actual reducer logic lives in the auto-generated protocol layer.

// Re-export reducers from the protocol layer
export { rootReducer, sessionReducer, chatReducer, changesetReducer, annotationsReducer, automationReducer, automationRunReducer, softAssertNever, isClientDispatchable } from './protocol/reducers.js';

import { AgentPermissionRequestKind, readAgentPermissionRequestMeta } from '../meta/agentPermissionRequestMeta.js';
import { readToolCallMeta, type ToolKind } from '../meta/agentToolCallMeta.js';
import type { ICompletedToolCall, ToolCallState } from './sessionState.js';

/** Rendering kinds implied by a remote host's permission request. */
const PERMISSION_REQUEST_TOOL_KINDS: Readonly<Partial<Record<AgentPermissionRequestKind, ToolKind>>> = {
	[AgentPermissionRequestKind.Commands]: 'terminal',
	[AgentPermissionRequestKind.Read]: 'read',
};

/**
 * Extracts the VS Code-specific `toolKind` rendering hint for a tool call.
 *
 * Normally the `_meta.toolKind` flag an agent adapter injects (e.g.
 * `copilotEventMapper`); it is not part of the protocol. A remote agent host
 * does not stamp that key, so for a call awaiting approval the kind falls back
 * to the permission request it echoes — the compatibility bridge documented in
 * {@link readAgentPermissionRequestMeta}.
 *
 * A stamped kind always wins, so a host that starts describing its
 * confirmations natively is never overridden by the fallback.
 */
export function getToolKind(tc: ToolCallState | ICompletedToolCall): ToolKind | undefined {
	const kind = readToolCallMeta(tc).toolKind;
	if (kind) {
		return kind;
	}
	const permissionKind = readAgentPermissionRequestMeta(tc).kind;
	return permissionKind ? PERMISSION_REQUEST_TOOL_KINDS[permissionKind] : undefined;
}
