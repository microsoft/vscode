/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../nls.js';
import { PolicyCategory } from '../../../base/common/policy.js';
import { ConfigurationScope, IConfigurationPropertySchema } from '../../configuration/common/configurationRegistry.js';
import { AgentHostCanvasesEnabledConfigKey } from './agentHostSchema.js';
import { CanvasesEnabledSettingId } from './agentService.js';

export const canvasesConfigurationProperties = {
	[CanvasesEnabledSettingId]: {
		type: 'boolean',
		description: nls.localize('chat.canvases.enabled', "Controls whether local Agent Host Copilot sessions can open Canvases with interactive content in the Agents Window and the Editor Window. Newly created sessions pick up changes to this setting."),
		default: false,
		scope: ConfigurationScope.APPLICATION,
		tags: ['preview'],
		experiment: { mode: 'auto' },
		agentHost: { key: AgentHostCanvasesEnabledConfigKey },
		policy: {
			name: 'ChatCanvasesEnabled',
			category: PolicyCategory.InteractiveSession,
			minimumVersion: '1.143',
			localization: {
				description: {
					key: 'chat.canvases.enabled',
					value: nls.localize('chat.canvases.enabled', "Controls whether local Agent Host Copilot sessions can open Canvases with interactive content in the Agents Window and the Editor Window. Newly created sessions pick up changes to this setting."),
				},
			},
		},
	},
} satisfies Record<string, IConfigurationPropertySchema>;
