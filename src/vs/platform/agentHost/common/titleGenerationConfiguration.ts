/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../nls.js';
import { ConfigurationScope, IConfigurationPropertySchema } from '../../configuration/common/configurationRegistry.js';
import product from '../../product/common/product.js';
import { AgentHostTitleGenerationConfigKey, AgentHostTitleGenerationStrategies, type AgentHostSelectableTitleGenerationStrategy, type AgentHostTitleGenerationStrategy } from './agentHostSchema.js';
import { AgentHostTitleGenerationSettingId } from './agentService.js';

export const titleGenerationConfigurationProperties = {
	[AgentHostTitleGenerationSettingId]: {
		type: 'string',
		enum: [...AgentHostTitleGenerationStrategies],
		enumDescriptions: [
			nls.localize('chat.agentHost.experimental.titleGeneration.utility', "A utility model generates titles immediately."),
			nls.localize('chat.agentHost.experimental.titleGeneration.activeAgent', "The active agent names new sessions and chats using rename tools."),
			nls.localize('chat.agentHost.experimental.titleGeneration.agentReview', "Seed titles immediately and refine them in the background if the first response turn completes successfully. On later turns, remind the active agent that it may rename a chat when the generated title is inaccurate or no longer reflects the user's goal."),
		],
		description: nls.localize('chat.agentHost.experimental.titleGeneration', "Controls how new sessions and chats get an automatic title. Changes apply to new sessions; existing sessions and their chats retain their strategy."),
		default: (product.quality !== 'stable' ? 'activeAgent' : 'utility') satisfies AgentHostSelectableTitleGenerationStrategy,
		scope: ConfigurationScope.APPLICATION,
		tags: ['experimental', 'advanced'],
		experiment: { mode: 'auto' },
		agentHost: { key: AgentHostTitleGenerationConfigKey },
	},
} satisfies Record<string, IConfigurationPropertySchema>;

/** Maps the legacy boolean title settings onto a strategy, or `undefined` when they select none. */
function titleGenerationStrategyFromLegacySettings(deferred: unknown, activeAgent: unknown): AgentHostTitleGenerationStrategy | undefined {
	if (deferred === true) {
		return 'deferred';
	}
	if (typeof activeAgent === 'boolean') {
		return activeAgent ? 'activeAgent' : 'utility';
	}
	return undefined;
}

/** Migrates the legacy boolean title settings; deferred naming moves to `agentReview`, its selectable successor. */
export function migrateLegacyTitleGenerationSettings(deferred: unknown, activeAgent: unknown): AgentHostSelectableTitleGenerationStrategy | undefined {
	const strategy = titleGenerationStrategyFromLegacySettings(deferred, activeAgent);
	return strategy === 'deferred' ? 'agentReview' : strategy;
}

/** Resolves the strategy for new sessions, falling back to the legacy boolean root keys sent by older clients. */
export function resolveTitleGenerationStrategy(strategy: AgentHostSelectableTitleGenerationStrategy | undefined, legacyDeferred: boolean | undefined, legacyActiveAgent: boolean | undefined): AgentHostTitleGenerationStrategy {
	return strategy ?? titleGenerationStrategyFromLegacySettings(legacyDeferred, legacyActiveAgent) ?? 'utility';
}
