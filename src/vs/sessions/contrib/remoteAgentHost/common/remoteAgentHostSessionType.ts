/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AgentProvider } from '../../../../platform/agentHost/common/agentService.js';

/**
 * Builds the session type id for a remote agent host.
 *
 * This single string is used as all three of:
 * - `ISession.sessionType` (the logical session type the sessions app reads)
 * - The resource URI scheme registered via `registerChatSessionContentProvider`
 * - The language model's `targetChatSessionType` published by `AgentHostLanguageModelProvider`
 *
 * Keeping them unified means the model picker (which filters by
 * `targetChatSessionType === session.sessionType`) automatically finds the
 * remote host's own models, and feature gating based on session type naturally
 * distinguishes remote sessions from local agent host sessions.
 *
 * The helper is provider-agnostic: remote agents are discovered dynamically
 * from each host's root state, so the same formula naturally supports any
 * agent provider name the host exposes (e.g. `remote-myhost-copilot`,
 * `remote-myhost-openai`).
 *
 * @param connectionAuthority Sanitized connection identifier, from
 *   `agentHostAuthority`.
 * @param agentProvider Agent provider name (e.g. `'copilot'`).
 */
export function remoteAgentHostSessionTypeId(connectionAuthority: string, agentProvider: AgentProvider): string {
	return `remote-${connectionAuthority}-${agentProvider}`;
}
