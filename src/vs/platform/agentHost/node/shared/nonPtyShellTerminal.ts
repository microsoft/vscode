/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { AgentSession } from '../../common/agent.js';
import { TerminalClaimKind, type TerminalSessionClaim } from '../../common/state/protocol/state.js';

/**
 * Builds the terminal channel URI for a runtime-executed output-only shell tool call.
 */
export function buildNonPtyShellTerminalUri(session: URI | string, toolCallId: string): string {
	return `agenthost-terminal://shell/${encodeURIComponent(AgentSession.id(session))}/${encodeURIComponent(toolCallId)}`;
}

export function buildNonPtyShellTerminalClaim(session: URI | string, chat: URI | string, toolCallId: string): TerminalSessionClaim {
	return {
		kind: TerminalClaimKind.Session,
		session: session.toString(),
		chat: chat.toString(),
		toolCallId,
	};
}
