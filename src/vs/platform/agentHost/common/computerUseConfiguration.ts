/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../nls.js';
import { IConfigurationPropertySchema } from '../../configuration/common/configurationRegistry.js';
import { AgentHostComputerUseEnabledConfigKey } from './agentHostSchema.js';
import { AgentHostComputerUseEnabledSettingId } from './agentService.js';

/** Computer Use settings mirrored into the agent host root config. */
export const computerUseConfigurationProperties = {
	[AgentHostComputerUseEnabledSettingId]: {
		type: 'boolean',
		markdownDescription: nls.localize('chat.agentHost.computerUse.enabled', "When enabled, local and remote Copilot agent sessions on macOS and Windows offer GitHub's Computer Use plugin, which can operate desktop applications on the machine running the agent host. For remote sessions, this is the remote machine, not your client. The plugin is downloaded on first use. Turn it on with `/computer on` in a Copilot chat, or when the agent asks. Each application still requires your approval. Changes take effect after a restart."),
		default: false,
		tags: ['experimental', 'advanced'],
		experiment: { mode: 'startup' },
		agentHost: { key: AgentHostComputerUseEnabledConfigKey },
	},
} satisfies Record<string, IConfigurationPropertySchema>;
