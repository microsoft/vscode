/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../nls.js';
import { ConfigurationScope, IConfigurationPropertySchema } from '../../configuration/common/configurationRegistry.js';
import { AgentHostDynamicAutoTiersEnabledSettingId, AgentHostHydraFusionEnabledSettingId } from './copilotCliConfig.js';

export const dynamicAutoTiersConfigurationProperties = {
	[AgentHostDynamicAutoTiersEnabledSettingId]: {
		type: 'boolean',
		markdownDescription: nls.localize('chat.copilot.dynamicAutoTiers.enabled', "When enabled, Copilot Agent Host sessions take Auto's tiers from the Copilot service and, when it provides them, present Auto as Copilot Fusion, which can offer HydraFusion and HydraFusion Max as its tiers. When disabled, or when the service provides no tiers, Auto and HydraFusion are offered as separate models, with HydraFusion controlled by `#{0}#`. Changing this setting restarts the Copilot runtime after active turns finish.", AgentHostHydraFusionEnabledSettingId),
		default: false,
		experiment: { mode: 'startup' },
		scope: ConfigurationScope.APPLICATION_MACHINE,
		tags: ['preview', 'experimental', 'advanced'],
	},
} satisfies Record<string, IConfigurationPropertySchema>;
