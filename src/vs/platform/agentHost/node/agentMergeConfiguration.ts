/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AgentMergeConfigKey, AgentMergeConfiguration, AgentMergeSessionOverrides, agentMergeRootConfigSchema, defaultAgentMergeConfiguration, resolveAgentMergeConfiguration } from '../common/agentMerge.js';
import { IAgentConfigurationService } from './agentConfigurationService.js';

export function getAgentMergeConfiguration(configurationService: IAgentConfigurationService, overrides?: AgentMergeSessionOverrides): AgentMergeConfiguration {
	return resolveAgentMergeConfiguration({
		addressReviews: configurationService.getRootValue(agentMergeRootConfigSchema, AgentMergeConfigKey.AddressReviews) ?? defaultAgentMergeConfiguration.addressReviews,
		fixCI: configurationService.getRootValue(agentMergeRootConfigSchema, AgentMergeConfigKey.FixCI) ?? defaultAgentMergeConfiguration.fixCI,
		resolveConflicts: configurationService.getRootValue(agentMergeRootConfigSchema, AgentMergeConfigKey.ResolveConflicts) ?? defaultAgentMergeConfiguration.resolveConflicts,
		mergePullRequest: configurationService.getRootValue(agentMergeRootConfigSchema, AgentMergeConfigKey.MergePullRequest) ?? defaultAgentMergeConfiguration.mergePullRequest,
		mergeMethod: configurationService.getRootValue(agentMergeRootConfigSchema, AgentMergeConfigKey.MergeMethod) ?? defaultAgentMergeConfiguration.mergeMethod,
		replyAttribution: configurationService.getRootValue(agentMergeRootConfigSchema, AgentMergeConfigKey.ReplyAttribution) ?? defaultAgentMergeConfiguration.replyAttribution,
	}, overrides);
}
