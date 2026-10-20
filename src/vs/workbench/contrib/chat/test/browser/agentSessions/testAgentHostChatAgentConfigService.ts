/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../../base/common/event.js';
import type { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import type { IAgentHostChatAgentConfig, IAgentHostChatAgentConfigService } from '../../../browser/agentSessions/agentHost/agentHostChatAgentConfig.js';

/** An agent config service that resolves nothing, for tests whose chats all use their session's agent. */
export class NullAgentHostChatAgentConfigService implements IAgentHostChatAgentConfigService {
	declare readonly _serviceBrand: undefined;
	readonly onDidChange: Event<IAgentConnection> = Event.None;
	getAgentConfig(): IAgentHostChatAgentConfig {
		return { config: undefined, resolving: false };
	}
	clear(): void { }
}
