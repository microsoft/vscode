/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Agent-host registrations are browser-safe so desktop and web workbenches share the same path.
 *
 * Note that `AgentHostContribution` injects `IAgentHostService`, whose remote
 * implementation connects from its constructor. Instantiating this at
 * `AfterRestored` therefore starts the agent host once a chat-enabled remote
 * window has loaded, rather than on first use of a session. That matches the
 * pre-existing desktop behaviour; the laziness on the server side is about
 * servers with no connected renderer, not about windows that never chat.
 */

import { IAgentHostByokLmHandler } from '../../../../../../platform/agentHost/common/agentHostByokLm.js';
import { InstantiationType, registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../common/contributions.js';
import { AgentHostAllowSignedOutWhenUsableContribution } from './agentHostAllowSignedOutWhenUsableContribution.js';
import { AgentHostByokLmHandler } from './agentHostByokLmHandler.js';
import { AgentHostContribution } from './agentHostChatContribution.js';
import { AgentHostCopilotCliSettingsContribution } from './agentHostCopilotCliSettingsContribution.js';
import { AgentHostOpenSessionLinkOpenerContribution } from './openSessionLinkOpener.contribution.js';
import { AgentHostSessionListContribution } from './agentHostSessionListContribution.js';
import { AgentHostSdkSetupNotificationContribution } from './agentHostSdkSetupNotification.js';
import { AgentHostSignedOutModelsNotificationContribution } from './agentHostSignedOutModelsNotification.js';
import { AgentHostTerminalContribution } from './agentHostTerminalContribution.js';
import { CopilotConfigSlashSubmitHandlerContribution } from './copilotConfigSlashSubmitHandler.js';
import './agentHostSettings.contribution.js';
import './agentSessionSettings.contribution.js';

registerWorkbenchContribution2(AgentHostContribution.ID, AgentHostContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(CopilotConfigSlashSubmitHandlerContribution.ID, CopilotConfigSlashSubmitHandlerContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(AgentHostSessionListContribution.ID, AgentHostSessionListContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(AgentHostOpenSessionLinkOpenerContribution.ID, AgentHostOpenSessionLinkOpenerContribution, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(AgentHostTerminalContribution.ID, AgentHostTerminalContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(AgentHostCopilotCliSettingsContribution.ID, AgentHostCopilotCliSettingsContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(AgentHostAllowSignedOutWhenUsableContribution.ID, AgentHostAllowSignedOutWhenUsableContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(AgentHostSignedOutModelsNotificationContribution.ID, AgentHostSignedOutModelsNotificationContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(AgentHostSdkSetupNotificationContribution.ID, AgentHostSdkSetupNotificationContribution, WorkbenchPhase.AfterRestored);

registerSingleton(IAgentHostByokLmHandler, AgentHostByokLmHandler, InstantiationType.Delayed);
