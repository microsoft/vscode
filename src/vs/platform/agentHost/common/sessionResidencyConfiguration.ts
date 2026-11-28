/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../nls.js';
import { ConfigurationScope, IConfigurationPropertySchema } from '../../configuration/common/configurationRegistry.js';
import { AgentHostSessionResidencyLimitConfigKey, AgentHostSessionResidencyLimitDefault } from './agentHostSchema.js';
import { AgentHostSessionResidencyLimitSettingId } from './agentService.js';

export const sessionResidencyConfigurationProperties = {
	[AgentHostSessionResidencyLimitSettingId]: {
		type: 'integer',
		minimum: 0,
		markdownDescription: localize('chat.agentHost.sessionResidencyLimit', "Controls the soft limit on sessions kept resident in the Agent Host. Lower values can reduce memory use and retained MCP processes, but reopening sessions can take longer. Set to 0 to release eligible idle sessions without retaining a warm cache. Active or subscribed sessions remain protected, and SDK unload delays can still apply. Changes take effect without restarting the Agent Host. The `VSCODE_AGENT_HOST_SESSION_RESIDENCY_LIMIT` environment variable overrides this setting."),
		default: AgentHostSessionResidencyLimitDefault,
		scope: ConfigurationScope.APPLICATION,
		tags: ['advanced'],
		agentHost: { key: AgentHostSessionResidencyLimitConfigKey },
	},
} satisfies Record<string, IConfigurationPropertySchema>;
