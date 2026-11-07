/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { Menus } from '../../../../../workbench/contrib/sessions/browser/menus.js';
import { RemoteAgentHostCommandIds } from '../../../../../workbench/contrib/sessions/providers/remoteAgentHost/browser/remoteAgentHostCommandIds.js';
import { localize } from '../../../../../nls.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { GitHubEnvironmentsEnabledSettingId, GitHubEnvironmentsAvailableContext } from '../../../../../platform/agentHost/common/missionControlEnvironment.js';
import { MissionControlAgentHostContribution } from '../../../../../workbench/contrib/sessions/providers/remoteAgentHost/browser/missionControlAgentHostContribution.js';

registerWorkbenchContribution2(MissionControlAgentHostContribution.ID, MissionControlAgentHostContribution, WorkbenchPhase.AfterRestored);
MenuRegistry.appendMenuItem(Menus.SessionWorkspaceManage, {
	command: { id: RemoteAgentHostCommandIds.connectViaMissionControl, title: localize('connectMissionControlHost', "GitHub Environments..."), icon: Codicon.remote },
	when: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.not('config.chat.disableAIFeatures'), ContextKeyExpr.equals(`config.${RemoteAgentHostsEnabledSettingId}`, true), ContextKeyExpr.equals(`config.${GitHubEnvironmentsEnabledSettingId}`, true), GitHubEnvironmentsAvailableContext),
	group: '1_add',
	order: 5,
});
