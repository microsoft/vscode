/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { SessionConfigKey } from '../../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { ActionType } from '../../../../../../platform/agentHost/common/state/protocol/actions.js';
import { StateComponents } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { ChatConfiguration, ChatPermissionLevel } from '../../../common/constants.js';
import { isUntitledChatSession } from '../../../common/model/chatUri.js';
import { toAgentHostBackendSessionUri } from './agentHostSessionUri.js';
import { IAgentHostSessionWorkingDirectoryResolver } from './agentHostSessionWorkingDirectoryResolver.js';
import { IAgentHostUntitledProvisionalSessionService } from './agentHostUntitledProvisionalSessionService.js';

/**
 * Services needed to apply a session-config change to an agent-host-backed chat
 * session from the editor window.
 */
export interface IApplyAgentHostSessionConfigServices {
	readonly agentHostService: IAgentHostService;
	readonly provisionalService: IAgentHostUntitledProvisionalSessionService;
	readonly workingDirectoryResolver: IAgentHostSessionWorkingDirectoryResolver;
	readonly workspaceContextService: IWorkspaceContextService;
	readonly configurationService: IConfigurationService;
}

/**
 * Applies a partial session-config change (e.g. `autoApprove` and/or `mode`) to
 * the agent-host session backing `sessionResource` in the editor window. This is
 * the editor-window analogue of the Agents-window provider `setSessionConfigValue`
 * path — it routes untitled sessions through the provisional service and existing
 * sessions through an AHP `SessionConfigChanged` dispatch, matching how the
 * agent-host chat-input pickers apply changes.
 *
 * An elevated `autoApprove` value is clamped back to `default` when enterprise
 * policy disables global auto-approval, mirroring the pickers.
 *
 * @returns `true` when `sessionResource` is agent-host-backed and the change was
 * dispatched, `false` otherwise (so callers can fall back).
 */
export async function applyAgentHostSessionConfigChange(
	sessionResource: URI,
	config: Readonly<Record<string, string>>,
	services: IApplyAgentHostSessionConfigServices,
): Promise<boolean> {
	const backendSession = toAgentHostBackendSessionUri(sessionResource);
	if (!backendSession) {
		return false;
	}

	const { agentHostService, provisionalService, workingDirectoryResolver, workspaceContextService, configurationService } = services;
	const policyRestricted = configurationService.inspect<boolean>(ChatConfiguration.GlobalAutoApprove).policyValue === false;
	const partial: Record<string, string> = { ...config };
	const autoApprove = partial[SessionConfigKey.AutoApprove];
	if (policyRestricted && autoApprove !== undefined && autoApprove !== ChatPermissionLevel.Default) {
		partial[SessionConfigKey.AutoApprove] = ChatPermissionLevel.Default;
	}

	const workingDirectory = workingDirectoryResolver.resolve(sessionResource)
		?? workspaceContextService.getWorkspace().folders[0]?.uri;

	if (isUntitledChatSession(sessionResource)) {
		await provisionalService.applyConfigChange(sessionResource, backendSession.scheme, workingDirectory, partial);
		return true;
	}

	agentHostService.dispatch(backendSession.toString(), {
		type: ActionType.SessionConfigChanged,
		config: partial,
	});
	const state = agentHostService.getSubscriptionUnmanaged(StateComponents.Session, backendSession)?.value;
	const currentValues = state && !(state instanceof Error) ? state.config?.values : undefined;
	const nextConfig = { ...(currentValues ?? {}), ...partial };
	void provisionalService.refreshResolvedConfig(sessionResource, backendSession.scheme, workingDirectory, nextConfig);
	return true;
}
