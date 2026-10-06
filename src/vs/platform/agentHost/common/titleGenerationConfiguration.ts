/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../nls.js';
import { ConfigurationScope, IConfigurationPropertySchema } from '../../configuration/common/configurationRegistry.js';
import product from '../../product/common/product.js';
import { AgentHostActiveAgentTitleGenerationConfigKey, AgentHostAgentTitleReviewConfigKey, AgentHostDeferredTitleGenerationConfigKey } from './agentHostSchema.js';
import { AgentHostActiveAgentTitleGenerationSettingId, AgentHostAgentTitleReviewSettingId, AgentHostDeferredTitleGenerationSettingId } from './agentService.js';

export const titleGenerationConfigurationProperties = {
	[AgentHostActiveAgentTitleGenerationSettingId]: {
		type: 'boolean',
		description: nls.localize('chat.agentHost.experimental.activeAgentTitleGeneration', "When enabled, the active agent names new sessions and chats using rename tools. When disabled, a utility model generates titles immediately. Deferred title generation takes precedence. Changes apply to new sessions; existing sessions and their chats retain their strategy."),
		default: product.quality !== 'stable',
		scope: ConfigurationScope.APPLICATION,
		tags: ['experimental', 'advanced'],
		experiment: { mode: 'auto' },
		agentHost: { key: AgentHostActiveAgentTitleGenerationConfigKey },
	},
	[AgentHostDeferredTitleGenerationSettingId]: {
		type: 'boolean',
		description: nls.localize('chat.agentHost.experimental.deferredTitleGeneration', "Seed titles immediately and refine them in the background if the first response turn completes successfully, without asking the active agent to name chats. Explicit rename tools remain available. Overrides active agent title generation for new sessions; existing sessions and their chats retain their strategy."),
		default: false,
		scope: ConfigurationScope.APPLICATION,
		tags: ['experimental', 'advanced'],
		experiment: { mode: 'auto' },
		agentHost: { key: AgentHostDeferredTitleGenerationConfigKey },
	},
	[AgentHostAgentTitleReviewSettingId]: {
		type: 'boolean',
		description: nls.localize('chat.agentHost.experimental.agentTitleReview', "Use deferred title generation and remind the active agent that it may rename a chat when the generated title is inaccurate or no longer reflects the user's goal. The rename tool stays deferred, so it is loaded only when the agent decides to rename. Overrides deferred and active agent title generation for new sessions; existing sessions and their chats retain their strategy."),
		default: false,
		scope: ConfigurationScope.APPLICATION,
		tags: ['experimental', 'advanced'],
		experiment: { mode: 'auto' },
		agentHost: { key: AgentHostAgentTitleReviewConfigKey },
	},
} satisfies Record<string, IConfigurationPropertySchema>;
