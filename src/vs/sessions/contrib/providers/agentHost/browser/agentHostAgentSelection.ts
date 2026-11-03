/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { agentHostAgentPickerStorageKey } from '../../../../../platform/agentHost/common/customAgents.js';
import { CustomizationType } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IAgentHostSessionsProvider } from '../../../../common/agentHostSessionsProvider.js';
import { ISession, ISessionAgentRef } from '../../../../services/sessions/common/session.js';

/** Uses the same client-space identity for listed, selected, and remembered custom agents. */
export function getAgentHostAgentPickerState(sessionId: string, provider: IAgentHostSessionsProvider) {
	const customizations = provider.getCustomizations(sessionId);
	const rawAgents = provider.getCustomAgents(sessionId);
	const agents = rawAgents.map(agent => {
		const contained = customizations.some(customization => customization.type !== CustomizationType.McpServer && customization.children?.some(child => child.uri === agent.uri));
		return contained ? { ...agent, uri: provider.mapAgentHostResource(URI.parse(agent.uri)).toString() } : agent;
	});
	const toPickerUri = (uri: string | undefined): string | undefined => {
		if (!uri) {
			return undefined;
		}
		const hostUri = provider.resolveCustomAgent?.(sessionId, uri)?.uri ?? uri;
		const index = rawAgents.findIndex(agent => agent.uri === hostUri);
		return index >= 0 ? agents[index].uri : uri;
	};
	return { agents, toPickerUri };
}

export function setAgentHostAgent(session: ISession, provider: IAgentHostSessionsProvider, agent: ISessionAgentRef | undefined, storageService: IStorageService): void {
	const key = agentHostAgentPickerStorageKey(session.resource.scheme);
	if (agent) {
		storageService.store(key, agent.uri, StorageScope.PROFILE, StorageTarget.MACHINE);
	} else {
		storageService.remove(key, StorageScope.PROFILE);
	}
	provider.setAgent?.(session.sessionId, agent ? { uri: agent.uri, name: agent.name } : undefined);
}
