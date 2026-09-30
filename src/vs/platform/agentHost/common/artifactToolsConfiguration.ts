/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../nls.js';
import { ConfigurationScope, IConfigurationPropertySchema } from '../../configuration/common/configurationRegistry.js';
import product from '../../product/common/product.js';
import { AgentHostArtifactToolsConfigKey } from './agentHostSchema.js';
import { ArtifactToolsSettingId } from './agentService.js';

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
} satisfies Record<string, IConfigurationPropertySchema>;
