/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../nls.js';
import { ConfigurationScope, IConfigurationPropertySchema } from '../../configuration/common/configurationRegistry.js';
import product from '../../product/common/product.js';
import { AgentHostArtifactToolsCompactPromptsConfigKey, AgentHostArtifactToolsConfigKey } from './agentHostSchema.js';
import { ArtifactToolsCompactPromptsSettingId, ArtifactToolsSettingId } from './agentService.js';

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
	[ArtifactToolsCompactPromptsSettingId]: {
		type: 'boolean',
		description: nls.localize('chat.artifactTools.compactPrompts', "Uses compact artifact tool guidance instead of the original wording. Does not change tool availability or deferral. Start a new chat to compare prompt formats."),
		default: false,
		scope: ConfigurationScope.APPLICATION,
		tags: ['experimental', 'advanced'],
		experiment: { mode: 'auto' },
		agentHost: { key: AgentHostArtifactToolsCompactPromptsConfigKey },
	},
} satisfies Record<string, IConfigurationPropertySchema>;
