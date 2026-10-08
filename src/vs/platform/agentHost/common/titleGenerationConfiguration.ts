/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../nls.js';
import { ConfigurationScope, IConfigurationPropertySchema } from '../../configuration/common/configurationRegistry.js';
import product from '../../product/common/product.js';
import { AgentHostActiveAgentTitleGenerationConfigKey, AgentHostDeferredTitleGenerationConfigKey, AgentHostTitleGenerationConfigKey, AgentHostTitleGenerationStrategies, type AgentHostSelectableTitleGenerationStrategy, type AgentHostTitleGenerationStrategy } from './agentHostSchema.js';
import { AgentHostTitleGenerationSettingId } from './agentService.js';
import type { IRootConfigChangedAction } from './state/sessionActions.js';

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
		agentHost: {
			key: AgentHostTitleGenerationConfigKey,
			// Older hosts persist and still read the legacy boolean keys, so keep them in step with the strategy.
			derivedKeys: {
				[AgentHostActiveAgentTitleGenerationConfigKey]: value => value === 'activeAgent',
				[AgentHostDeferredTitleGenerationConfigKey]: value => value === 'agentReview',
			},
		},
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

/**
 * Lets a client that predates `titleGeneration` change the strategy on a host that persisted one from a newer client.
 * Newer clients always send the strategy with its derived legacy keys, so a merge patch that changes only the legacy
 * keys comes from an older client. It is rewritten as a replacement of the merged values without the stored strategy,
 * which makes the host fall back to the legacy keys and keeps client mirrors of the root config in step.
 */
export function supersedeTitleGenerationStrategyForLegacyUpdate(currentValues: Readonly<Record<string, unknown>> | undefined, action: IRootConfigChangedAction): IRootConfigChangedAction {
	const patch = action.config;
	if (action.replace || !currentValues || !Object.hasOwn(currentValues, AgentHostTitleGenerationConfigKey) || Object.hasOwn(patch, AgentHostTitleGenerationConfigKey)) {
		return action;
	}
	const changesLegacyKey = [AgentHostDeferredTitleGenerationConfigKey, AgentHostActiveAgentTitleGenerationConfigKey].some(key => Object.hasOwn(patch, key) && patch[key] !== currentValues[key]);
	if (!changesLegacyKey) {
		return action;
	}
	const { [AgentHostTitleGenerationConfigKey]: _supersededStrategy, ...config } = { ...currentValues, ...patch };
	return { ...action, config, replace: true };
}

/** Resolves the strategy for new sessions, falling back to the legacy boolean root keys sent by older clients. */
export function resolveTitleGenerationStrategy(strategy: AgentHostSelectableTitleGenerationStrategy | undefined, legacyDeferred: boolean | undefined, legacyActiveAgent: boolean | undefined): AgentHostTitleGenerationStrategy {
	return strategy ?? titleGenerationStrategyFromLegacySettings(legacyDeferred, legacyActiveAgent) ?? 'utility';
}
