/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../nls.js';
import { PolicyCategory } from '../../../base/common/policy.js';
import { ConfigurationScope, IConfigurationPropertySchema } from '../../configuration/common/configurationRegistry.js';
import { AgentHostFusionEnabledSettingId, AgentHostHydraFusionEnabledSettingId, CopilotCliConfigKey } from './copilotCliConfig.js';

export const fusionConfigurationProperties = {
	[AgentHostFusionEnabledSettingId]: {
		type: 'boolean',
		markdownDescription: nls.localize('chat.copilot.ensemble.enabled', "When enabled, Copilot Agent Host sessions present Auto as Fusion, which optimizes for Lite, Balance, or Max. Max uses HydraFusion Max, so Fusion uses HydraFusion v2 unless `#{0}#` is off. Changing this setting can restart the Copilot runtime.", AgentHostHydraFusionEnabledSettingId),
		default: false,
		experiment: { mode: 'startup' },
		scope: ConfigurationScope.APPLICATION_MACHINE,
		tags: ['preview', 'experimental', 'advanced'],
		// Mirrored to every host, including remote and tunnel hosts, which cannot read the account's
		// preview-features gate; the policy folds that gate into the mirrored value.
		agentHost: {
			key: CopilotCliConfigKey.Fusion,
			// Hosts built before the Ensemble to Fusion rename (#341932) still read the legacy key.
			derivedKeys: { ensemble: value => value },
		},
		policy: {
			name: 'CopilotFusion',
			category: PolicyCategory.InteractiveSession,
			minimumVersion: '1.143',
			value: policyData => policyData.chat_preview_features_enabled === false ? false : undefined,
			localization: {
				description: {
					key: 'chat.copilot.ensemble.enabled.policy',
					value: nls.localize('chat.copilot.ensemble.enabled.policy', "Controls whether Copilot Agent Host sessions present Auto as Fusion, which routes requests through HydraFusion."),
				}
			},
		},
	},
} satisfies Record<string, IConfigurationPropertySchema>;
