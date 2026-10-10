/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import { AMBIENT_AGENT_HOST_AUTHORITY, IAgentHostConnectionsService, IAgentHostSessionResolution, LOCAL_AGENT_HOST_SCHEME_PREFIX } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';

/** Preserves local provisional resources while resolving all other sessions through their owning host. */
export function resolveAgentHostChatSession(sessionResource: URI, provisionalBackend: URI | undefined, connectionsService: IAgentHostConnectionsService): IAgentHostSessionResolution | undefined {
	const resolution = connectionsService.resolveSessionResource(sessionResource);
	return resolution && provisionalBackend && resolution.connectionAuthority === AMBIENT_AGENT_HOST_AUTHORITY
		? { ...resolution, backendSession: provisionalBackend }
		: resolution;
}

export function getLocalAgentHostSessionProvider(sessionResource: URI): string | undefined {
	return sessionResource.scheme.startsWith(LOCAL_AGENT_HOST_SCHEME_PREFIX)
		? sessionResource.scheme.substring(LOCAL_AGENT_HOST_SCHEME_PREFIX.length) || undefined
		: undefined;
}

export function toAgentHostBackendSessionUri(sessionResource: URI, connectionsService: IAgentHostConnectionsService): URI | undefined {
	return getLocalAgentHostSessionProvider(sessionResource)
		? connectionsService.resolveSessionResourceIdentity(sessionResource)?.backendSession
		: undefined;
}
