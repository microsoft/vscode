/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../nls.js';
import { ConfigurationScope, IConfigurationPropertySchema } from '../../configuration/common/configurationRegistry.js';
import { AgentHostDynamicAutoTiersEnabledSettingId, AgentHostFusionEnabledSettingId, AgentHostHydraFusionEnabledSettingId } from './copilotCliConfig.js';

export const fusionConfigurationProperties = {
	[AgentHostFusionEnabledSettingId]: {
		type: 'boolean',
		markdownDescription: nls.localize('chat.copilot.ensemble.enabled', "When enabled, Copilot Agent Host sessions present Auto as Fusion, which optimizes for Standard, High, or Max. Max uses HydraFusion Max, so Fusion uses HydraFusion v2 unless `#{0}#` is off. Changing this setting can restart the Copilot runtime.", AgentHostHydraFusionEnabledSettingId),
		default: false,
		experiment: { mode: 'startup' },
		scope: ConfigurationScope.APPLICATION_MACHINE,
		tags: ['preview', 'experimental', 'advanced'],
	},
	[AgentHostDynamicAutoTiersEnabledSettingId]: {
		type: 'boolean',
		markdownDescription: nls.localize('chat.copilot.dynamicAutoTiers.enabled', "When enabled, Auto's \"Optimize for\" tiers in Copilot Agent Host sessions come from the Copilot service, which can include HydraFusion, instead of the built-in list. Changing this setting restarts the Copilot runtime after active turns finish."),
		default: false,
		experiment: { mode: 'startup' },
		scope: ConfigurationScope.APPLICATION_MACHINE,
		tags: ['preview', 'experimental', 'advanced'],
	},
} satisfies Record<string, IConfigurationPropertySchema>;
