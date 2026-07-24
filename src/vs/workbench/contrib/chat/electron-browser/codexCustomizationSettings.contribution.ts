/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { observableValue } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { CODEX_AGENT_PROVIDER_ID, IAgentHostService } from '../../../../platform/agentHost/common/agentService.js';
import { ActionType } from '../../../../platform/agentHost/common/state/sessionActions.js';
import { aiCustomizationManagementSectionRegistry } from '../browser/aiCustomization/aiCustomizationManagementSectionRegistry.js';
import { AHPAgentSettingsWidget, type IAgentGlobalConfigurationSettingsTarget } from '../browser/aiCustomization/agentGlobalConfigurationSettingsWidget.js';
import { AICustomizationManagementSection } from '../common/aiCustomizationWorkspaceService.js';
import { SessionType } from '../common/chatSessionsService.js';

aiCustomizationManagementSectionRegistry.register({
	id: AICustomizationManagementSection.HarnessSettings,
	label: localize('codexCustomizationSettings.navigationLabel', "Codex Settings"),
	icon: Codicon.openai,
	description: localize('codexCustomizationSettings.navigationDescription', "Configure global behavior for this harness."),
	supportsHarness: harnessId => harnessId === SessionType.AgentHostCodex,
	create: (instantiationService, container) => instantiationService.invokeFunction(accessor => {
		const agentHostService = accessor.get(IAgentHostService);
		const settingsTarget: IAgentGlobalConfigurationSettingsTarget = {
			onDidChange: agentHostService.rootState.onDidChange,
			getState: () => agentHostService.rootState.value instanceof Error ? undefined : agentHostService.rootState.value,
			setValue: async (key, value) => agentHostService.dispatch('ahp-root://', { type: ActionType.RootConfigChanged, config: { [key]: value } }),
			mapResource: resource => resource,
		};
		const target = observableValue<IAgentGlobalConfigurationSettingsTarget | undefined>('codexSettings.target', settingsTarget);
		return instantiationService.createInstance(AHPAgentSettingsWidget, container, CODEX_AGENT_PROVIDER_ID, target);
	}),
});
