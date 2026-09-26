/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../nls.js';
import { ConfigurationScope, IConfigurationPropertySchema } from '../../configuration/common/configurationRegistry.js';
import product from '../../product/common/product.js';
import { AgentHostArtifactToolsConfigKey, AgentHostGitHubArtifactIgnoredChecksConfigKey } from './agentHostSchema.js';
import { ArtifactToolsSettingId } from './agentService.js';
import { gitHubPullRequestMarkReadyIgnoredChecksSetting } from './githubPullRequestArtifact.js';

export const artifactToolsConfigurationProperties = {
	[ArtifactToolsSettingId]: {
		type: 'boolean',
		description: nls.localize('chat.artifactTools.enabled', "When enabled, agents can record artifacts — pull requests, issues, commits, websites, files and other resources — which are surfaced above the chat input."),
		default: product.quality !== 'stable',
		scope: ConfigurationScope.APPLICATION,
		tags: ['experimental', 'advanced'],
		experiment: { mode: 'auto' },
		agentHost: { key: AgentHostArtifactToolsConfigKey },
	},
	[gitHubPullRequestMarkReadyIgnoredChecksSetting]: {
		type: 'array',
		items: { type: 'string' },
		default: [],
		scope: ConfigurationScope.RESOURCE,
		tags: ['experimental', 'advanced'],
		markdownDescription: nls.localize('prArtifact.ignoredChecks.setting', "Check names that do not need to pass before **Automatically Mark Ready** runs for a pull request artifact. Matching is case-sensitive; `*` matches any text, and other characters are literal. These checks remain visible, are still repaired by **Fix CI**, and must still pass for automatic merging. This setting does not enable automation."),
		agentHost: { key: AgentHostGitHubArtifactIgnoredChecksConfigKey },
	},
} satisfies Record<string, IConfigurationPropertySchema>;
