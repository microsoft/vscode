/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { AgentHostContribution } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostChatContribution.js';
import { AgentHostTerminalContribution } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostTerminalContribution.js';
import { AgentHostCopilotCliSettingsContribution } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostCopilotCliSettingsContribution.js';
import { AgentHostSignedOutCompatibilityContribution } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostSignedOutCompatibilityContribution.js';
import { AgentHostSdkSetupNotificationContribution } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostSdkSetupNotification.js';
import { AgentHostSignedOutModelsNotificationContribution } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostSignedOutModelsNotification.js';
import { registerLocalAgentHostSessionsProvider } from '../../../../../workbench/contrib/sessions/providers/agentHost/browser/localAgentHostSessionsProviderRegistration.js';
import './codexCustomizationSettings.contribution.js';

/**
 * Registers the {@link LocalAgentHostSessionsProvider} when the Agent Host is
 * available in this runtime.
 *
 * {@link AgentHostContribution} handles all the heavy lifting — agent discovery,
 * session handler registration, language model providers, customization harness —
 * via {@link IChatSessionsService}. This contribution only bridges the session
 * listing and lifecycle to the {@link ISessionsProvidersService} layer used by
 * the Sessions app's UI.
 */
class LocalAgentHostContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.localAgentHostContribution';

	constructor(@IInstantiationService instantiationService: IInstantiationService) {
		super();
		this._register(instantiationService.invokeFunction(registerLocalAgentHostSessionsProvider));
	}
}

registerWorkbenchContribution2(AgentHostContribution.ID, AgentHostContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(AgentHostTerminalContribution.ID, AgentHostTerminalContribution, WorkbenchPhase.AfterRestored);
// Forwards the `chat.agentHost.copilot.*` settings into the host's root config. Without it those
// gates never reach the host here, so features like the Auto routing-profile picker stay off.
registerWorkbenchContribution2(AgentHostCopilotCliSettingsContribution.ID, AgentHostCopilotCliSettingsContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(AgentHostSignedOutCompatibilityContribution.ID, AgentHostSignedOutCompatibilityContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(AgentHostSignedOutModelsNotificationContribution.ID, AgentHostSignedOutModelsNotificationContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(AgentHostSdkSetupNotificationContribution.ID, AgentHostSdkSetupNotificationContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(LocalAgentHostContribution.ID, LocalAgentHostContribution, WorkbenchPhase.AfterRestored);
