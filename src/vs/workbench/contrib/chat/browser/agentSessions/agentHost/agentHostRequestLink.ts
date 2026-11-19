/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import { AMBIENT_AGENT_HOST_AUTHORITY, IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { getAgentHostSessionResource } from '../../../../../../platform/agentHost/common/agentHostSessionIdentity.js';
import { buildOpenSessionLinkUri, getSessionLinkAuthority } from '../../../../../../platform/agentHost/common/openSessionLink.js';
import { isUntitledChatSession } from '../../../common/model/chatUri.js';
import { IAgentHostUntitledProvisionalSessionService } from './agentHostUntitledProvisionalSessionService.js';

/** Builds a request link from the client chat resource, retaining its exact owner and peer fragment. */
export async function createAgentHostRequestLink(resource: URI, requestId: string, connections: IAgentHostConnectionsService, provisional: IAgentHostUntitledProvisionalSessionService, remoteAuthority: string | undefined): Promise<string | undefined> {
	const identity = connections.resolveSessionResourceIdentity(resource);
	if (!requestId || !identity || getAgentHostSessionResource(resource).query !== resource.query) {
		return undefined;
	}
	const authority = getSessionLinkAuthority(connections, identity.connectionAuthority);
	if (remoteAuthority && authority === AMBIENT_AGENT_HOST_AUTHORITY) {
		return undefined;
	}
	const backend = identity.connectionAuthority === AMBIENT_AGENT_HOST_AUTHORITY
		? await provisional.waitForPending(resource.with({ fragment: '' })) ?? identity.backendSession
		: identity.backendSession;
	return isUntitledChatSession(backend) ? undefined : buildOpenSessionLinkUri(backend, resource.fragment, requestId, authority);
}
