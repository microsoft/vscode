/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AgentProvider } from '../../../../platform/agentHost/common/agentService.js';

/**
 * Builds the unique per-connection identifier for a remote agent host.
 *
 * This string is used as:
 * - The resource URI scheme registered via `registerChatSessionContentProvider`
 * - The language model vendor / `targetChatSessionType` published by
 *   `AgentHostLanguageModelProvider`
 *
 * It is **not** used as `ISession.sessionType` for copilot agents — those
 * use the platform-registered `COPILOT_CLI_SESSION_TYPE` (`copilotcli`) so
 * that remote copilot sessions align with the type used by other copilot
 * providers (local CLI, cloud). Non-copilot agents continue to use this
 * value as their `ISession.sessionType`.
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
