/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import { AMBIENT_AGENT_HOST_AUTHORITY, IAgentHostConnectionsService, IAgentHostSessionResolution } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';

/** Preserves local provisional resources while resolving all other sessions through their owning host. */
export function resolveAgentHostChatSession(sessionResource: URI, provisionalBackend: URI | undefined, connectionsService: IAgentHostConnectionsService): IAgentHostSessionResolution | undefined {
	const resolution = connectionsService.resolveSessionResource(sessionResource);
	return resolution && provisionalBackend && resolution.connectionAuthority === AMBIENT_AGENT_HOST_AUTHORITY
		? { ...resolution, backendSession: provisionalBackend }
		: resolution;
}

export function toAgentHostBackendSessionUri(sessionResource: URI): URI | undefined {
	const scheme = sessionResource.scheme;
	const prefix = 'agent-host-';
	if (!scheme.startsWith(prefix)) {
		return undefined;
	}
	const provider = scheme.substring(prefix.length);
	if (!provider) {
		return undefined;
	}
	const rawId = sessionResource.path.replace(/^\//, '');
	return URI.from({ scheme: provider, path: `/${rawId}` });
}
