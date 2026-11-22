/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { hasKey } from '../../../base/common/types.js';
import { readArtifactIntegrationRun, readArtifactIntegrationRunInitiator } from './meta/agentHostArtifactIntegrationMeta.js';
import { isAgentMergeMessage } from './meta/agentMergeMessageMeta.js';
import { readAgentMessageDelegationMeta } from './meta/agentMessageDelegationMeta.js';
import { SessionOriginKind, type SessionOrigin } from './state/protocol/channels-session/state.js';
import { MessageKind, type Message } from './state/sessionState.js';

/** The automation identity of Agent Merge, which the user turns on for a session and which has no catalog entry. */
export const AGENT_MERGE_AUTOMATION_ID = 'vscode.agentMerge';

/**
 * Who authored a message the host sends to a provider, so the provider's runtime
 * gives the message only the authority its author has.
 *
 * - `user`: a person wrote or chose it.
 * - `automation`: an automation the user configured sent it. It defines a task but is not a person's instruction.
 * - `agent`: another agent sent it. `id` is the same for every message of that agent and differs between agents.
 * - `system`: the host generated it, or its author could not be identified.
 */
export type AgentMessageProvenance =
	| { readonly kind: 'user' }
	| { readonly kind: 'automation'; readonly id: string }
	| { readonly kind: 'agent'; readonly id: string }
	| { readonly kind: 'system' };

/**
 * Resolves who authored `message` from host-owned state: its origin, its typed metadata, and the origin
 * of the session it is sent in. A message whose author cannot be identified is `system`, never `user`.
 */
export function resolveAgentMessageProvenance(message: Message, sessionOrigin: SessionOrigin | undefined): AgentMessageProvenance {
	switch (message.origin.kind) {
		case MessageKind.User:
			return { kind: 'user' };
		case MessageKind.Automation:
			return sessionOrigin?.kind === SessionOriginKind.Automation && sessionOrigin.automation
				? { kind: 'automation', id: sessionOrigin.automation }
				: { kind: 'system' };
		case MessageKind.SystemNotification:
			if (isAgentMergeMessage(message)) {
				return { kind: 'automation', id: AGENT_MERGE_AUTOMATION_ID };
			}
			// A prompt action a person chose acts for them, as it does for artifact permissions.
			return readArtifactIntegrationRun(message) !== undefined && readArtifactIntegrationRunInitiator(message) === 'user'
				? { kind: 'user' }
				: { kind: 'system' };
		case MessageKind.Agent:
		case MessageKind.Tool: {
			const delegation = readAgentMessageDelegationMeta(message);
			const id = delegation && hasKey(delegation, { sourceSession: true }) ? delegation.sourceChat || delegation.sourceSession : undefined;
			return id ? { kind: 'agent', id } : { kind: 'system' };
		}
		default:
			return { kind: 'system' };
	}
}
