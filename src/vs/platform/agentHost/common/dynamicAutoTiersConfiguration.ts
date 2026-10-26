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
		markdownDescription: nls.localize('chat.copilot.dynamicAutoTiers.enabled', "When enabled, Copilot Agent Host sessions take Auto's tiers from the Copilot service, and those tiers decide how Auto is presented. When they include a Fusion tier the account can run, Auto is presented as Copilot Fusion, with HydraFusion and HydraFusion Max among its tiers. When they include none, Auto is offered with the service's tiers. When the service provides no tiers, Auto, HydraFusion, and HydraFusion Max are offered as separate models. When disabled, Auto and HydraFusion are offered as separate models, with HydraFusion controlled by `#{0}#`. Changing this setting restarts the Copilot runtime after active turns finish.", AgentHostHydraFusionEnabledSettingId),
		default: true,
		experiment: { mode: 'startup' },
		scope: ConfigurationScope.APPLICATION_MACHINE,
	},
} satisfies Record<string, IConfigurationPropertySchema>;
