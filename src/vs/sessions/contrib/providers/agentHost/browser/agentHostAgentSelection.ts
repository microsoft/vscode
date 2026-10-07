/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { agentHostAgentPickerStorageKey } from '../../../../../platform/agentHost/common/customAgents.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IAgentHostSessionsProvider } from '../../../../common/agentHostSessionsProvider.js';
import { ISession, ISessionAgentRef } from '../../../../services/sessions/common/session.js';

export function setAgentHostAgent(session: ISession, provider: IAgentHostSessionsProvider, agent: ISessionAgentRef | undefined, storageService: IStorageService): void {
	const key = agentHostAgentPickerStorageKey(session.resource.scheme);
	if (agent) {
		storageService.store(key, agent.uri, StorageScope.PROFILE, StorageTarget.MACHINE);
	} else {
		storageService.remove(key, StorageScope.PROFILE);
	}
	provider.setAgent?.(session.sessionId, agent ? { uri: agent.uri, name: agent.name } : undefined);
}
