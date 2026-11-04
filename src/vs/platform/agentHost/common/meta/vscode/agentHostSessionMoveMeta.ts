/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { InitializeResult } from '../../state/protocol/common/commands.js';
import type { SessionSummaryMeta } from '../../state/sessionState.js';

/** Initialize capability: the host moves a single-chat session under another session (`vscode/moveSession`, Block 4). */
export const AgentHostSessionMoveCapabilityMetaKey = 'vscode.sessionMove';

/** Session `_meta` flag: the host can move this session under another session. Written only by VS Code hosts. */
export const AgentHostSessionMovableMetaKey = 'vscode.movable';

/** Whether the host moves single-chat sessions under other sessions. */
export function supportsAgentHostSessionMove(result: InitializeResult | undefined): boolean {
	return result?._meta?.[AgentHostSessionMoveCapabilityMetaKey] === true;
}

/** Whether the host says the session can move under another session; anything but `true` means it can't. */
export function readSessionMovable(meta: SessionSummaryMeta | undefined): boolean {
	return meta?.[AgentHostSessionMovableMetaKey] === true;
}

/** Returns session metadata with the movable flag set, or removed when `movable` is `false`; `undefined` when empty. */
export function withSessionMovable(meta: SessionSummaryMeta | undefined, movable: boolean): SessionSummaryMeta | undefined {
	const next: { [key: string]: unknown } = { ...meta };
	if (movable) {
		next[AgentHostSessionMovableMetaKey] = true;
	} else {
		delete next[AgentHostSessionMovableMetaKey];
	}
	return Object.keys(next).length > 0 ? next : undefined;
}
