/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import { AMBIENT_AGENT_HOST_AUTHORITY, IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { buildOpenSessionLinkUri } from '../../../../../../platform/agentHost/common/openSessionLink.js';
import { isUntitledChatSession } from '../../../common/model/chatUri.js';
import { IAgentHostUntitledProvisionalSessionService } from './agentHostUntitledProvisionalSessionService.js';

export type AgentHostChatLinkResolution =
	| { readonly kind: 'link'; readonly link: string; readonly connectionAuthority: string }
	/** The chat is not an Agent Host chat. */
	| { readonly kind: 'unavailable' }
	/** The chat's session does not exist on its host yet. */
	| { readonly kind: 'notCreated' };

/**
 * The portable `agent-host-session://` link of the Agent Host chat `chatResource`, or of its request `requestId`, which
 * is that request's turn on the host. A provisional local session is awaited until its host creates it.
 */
export async function resolveAgentHostChatLink(
	chatResource: URI,
	requestId: string | undefined,
	connectionsService: IAgentHostConnectionsService,
	provisionalService: IAgentHostUntitledProvisionalSessionService,
): Promise<AgentHostChatLinkResolution> {
	const identity = connectionsService.resolveSessionResourceIdentity(chatResource);
	if (!identity) {
		return { kind: 'unavailable' };
	}
	const provisionalBackend = identity.connectionAuthority === AMBIENT_AGENT_HOST_AUTHORITY
		? await provisionalService.waitForPending(chatResource)
		: undefined;
	const backend = provisionalBackend ?? identity.backendSession;
	if (isUntitledChatSession(backend)) {
		return { kind: 'notCreated' };
	}
	return {
		kind: 'link',
		link: buildOpenSessionLinkUri(backend, chatResource.fragment || undefined, requestId, identity.connectionAuthority),
		connectionAuthority: identity.connectionAuthority,
	};
}
